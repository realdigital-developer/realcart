/**
 * google-drive.ts
 *
 * Google Drive integration using OAuth 2.0 Client IDs for personal Google Drive.
 *
 * IMPORTANT: Uses dynamic import() for `googleapis` (204MB) so it is only
 * loaded when Drive features are actually accessed — not at server startup.
 *
 * Flow:
 *   1. Admin clicks "Connect Google Drive" → redirects to Google consent screen
 *   2. Google redirects back with authorization code → exchanged for tokens
 *   3. Tokens (access + refresh) stored in MongoDB for server-side use
 *   4. Files are uploaded to Drive inside the configured folder, organized by category subfolders
 *   5. Access tokens auto-refresh when expired using the stored refresh token
 */

import type { OAuth2Client } from 'googleapis-common'
import { Readable } from 'stream'
import { connectToDatabase } from '@/lib/mongodb'

/* ------------------------------------------------------------------ */
/*  Dynamic import helper for googleapis                                */
/* ------------------------------------------------------------------ */

/**
 * Lazily loads the `googleapis` module (204MB).
 * This ensures the package is NOT part of the server startup memory footprint.
 * It is only loaded when a Drive feature is actually used.
 */
async function getGoogleAPIs() {
  const { google } = await import('googleapis')
  return google
}

/* ------------------------------------------------------------------ */
/*  Configuration                                                       */
/* ------------------------------------------------------------------ */

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!
const DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || 'root'

/**
 * Resolves the OAuth redirect URI using a robust multi-layer strategy.
 */
function resolveRedirectUri(incomingHeaders?: Headers): string {
  // Layer 1: Explicit env variable
  const explicitUri = process.env.GOOGLE_REDIRECT_URI?.trim()
  if (explicitUri) return explicitUri

  // Layer 2: Derive from incoming request headers
  if (incomingHeaders) {
    const forwardedHost = incomingHeaders.get('x-forwarded-host')
    const forwardedProto = incomingHeaders.get('x-forwarded-proto')
    const host = incomingHeaders.get('host')
    const detectedHost = forwardedHost || host

    if (detectedHost) {
      const protocol = forwardedProto || (detectedHost.startsWith('localhost') ? 'http' : 'https')
      return `${protocol}://${detectedHost}/api/auth/google/callback`
    }
  }

  // Layer 3: NEXTAUTH_URL env variable
  const nextauthUrl = process.env.NEXTAUTH_URL?.trim()
  if (nextauthUrl) {
    return `${nextauthUrl.replace(/\/+$/, '')}/api/auth/google/callback`
  }

  // Layer 4: Fallback for local development
  return 'http://localhost:3000/api/auth/google/callback'
}

/* ------------------------------------------------------------------ */
/*  OAuth2 Client                                                       */
/* ------------------------------------------------------------------ */

/** Creates a fresh OAuth2 client instance with the correct redirect URI */
function getOAuth2Client(incomingHeaders?: Headers): OAuth2Client {
  // OAuth2Client is a lightweight class — importing just it doesn't pull in the full 204MB
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { OAuth2Client: OAuth2 } = require('googleapis-common')
  const redirectUri = resolveRedirectUri(incomingHeaders)
  return new OAuth2(CLIENT_ID, CLIENT_SECRET, redirectUri)
}

/* ------------------------------------------------------------------ */
/*  Auth URL                                                            */
/* ------------------------------------------------------------------ */

/** Generates the Google OAuth consent screen URL */
export function getAuthUrl(incomingHeaders?: Headers): string {
  const client = getOAuth2Client(incomingHeaders)
  const authUrl = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
  })
  return authUrl
}

/* ------------------------------------------------------------------ */
/*  Token Exchange                                                      */
/* ------------------------------------------------------------------ */

/** Exchanges an authorization code for access + refresh tokens */
export async function exchangeCodeForTokens(code: string, incomingHeaders?: Headers) {
  const client = getOAuth2Client(incomingHeaders)
  const { tokens } = await client.getToken(code)
  return tokens
}

/* ------------------------------------------------------------------ */
/*  Token Storage (MongoDB)                                             */
/* ------------------------------------------------------------------ */

const TOKEN_KEY = 'google_drive'

/** Saves OAuth tokens to MongoDB (upsert) */
export async function saveTokens(tokens: any): Promise<void> {
  const { db } = await connectToDatabase()
  await db.collection('oauth_tokens').updateOne(
    { key: TOKEN_KEY },
    {
      $set: {
        key: TOKEN_KEY,
        tokens: {
          access_token: tokens.access_token ?? null,
          refresh_token: tokens.refresh_token ?? null,
          scope: tokens.scope ?? null,
          token_type: tokens.token_type ?? 'Bearer',
          expiry_date: tokens.expiry_date ?? null,
        },
        updatedAt: new Date().toISOString(),
      },
    },
    { upsert: true },
  )
}

/** Retrieves stored OAuth tokens from MongoDB */
export async function getStoredTokens(): Promise<any | null> {
  const { db } = await connectToDatabase()
  const doc = await db.collection('oauth_tokens').findOne({ key: TOKEN_KEY })
  return doc?.tokens ?? null
}

/** Deletes stored OAuth tokens from MongoDB */
export async function deleteStoredTokens(): Promise<void> {
  const { db } = await connectToDatabase()
  await db.collection('oauth_tokens').deleteOne({ key: TOKEN_KEY })
}

/* ------------------------------------------------------------------ */
/*  Authenticated Drive Client                                          */
/* ------------------------------------------------------------------ */

/**
 * Returns an authenticated Google Drive client.
 * Dynamically imports googleapis only when this function is called.
 */
export async function getAuthenticatedDrive() {
  const tokens = await getStoredTokens()
  if (!tokens?.refresh_token) {
    throw new Error('Google Drive is not connected. Please connect your account first.')
  }

  const client = getOAuth2Client()
  client.setCredentials(tokens)

  // Listen for token refresh events and persist the new tokens
  client.on('tokens', async (newTokens) => {
    await saveTokens({
      ...tokens,
      ...newTokens,
      refresh_token: newTokens.refresh_token || tokens.refresh_token,
    })
  })

  // Lazy-load the heavy googleapis module
  const google = await getGoogleAPIs()
  return google.drive({ version: 'v3', auth: client })
}

/* ------------------------------------------------------------------ */
/*  Drive Status                                                        */
/* ------------------------------------------------------------------ */

export interface DriveStatusResult {
  connected: boolean
  email?: string
  scope?: string
  expiryDate?: number | null
}

/**
 * Checks if Google Drive is connected and returns account info.
 * Dynamically imports googleapis only when this function is called.
 */
export async function isDriveConnected(): Promise<DriveStatusResult> {
  try {
    const tokens = await getStoredTokens()
    if (!tokens?.refresh_token) {
      return { connected: false }
    }

    const client = getOAuth2Client()
    client.setCredentials(tokens)

    // Lazy-load googleapis
    const google = await getGoogleAPIs()

    // Try to get user info
    const oauth2 = google.oauth2({ version: 'v2', auth: client })
    const userInfo = await oauth2.userinfo.get()

    return {
      connected: true,
      email: userInfo.data.email ?? undefined,
      scope: tokens.scope ?? undefined,
      expiryDate: tokens.expiry_date ?? null,
    }
  } catch {
    // Token might be expired — try refreshing
    try {
      const tokens = await getStoredTokens()
      if (!tokens?.refresh_token) return { connected: false }

      const client = getOAuth2Client()
      client.setCredentials(tokens)
      const { credentials } = await client.refreshAccessToken()
      await saveTokens({
        ...tokens,
        ...credentials,
        refresh_token: credentials.refresh_token || tokens.refresh_token,
      })

      const google = await getGoogleAPIs()
      const oauth2 = google.oauth2({ version: 'v2', auth: client })
      const userInfo = await oauth2.userinfo.get()

      return {
        connected: true,
        email: userInfo.data.email ?? undefined,
        scope: credentials.scope ?? tokens.scope ?? undefined,
        expiryDate: credentials.expiry_date ?? null,
      }
    } catch {
      return { connected: false }
    }
  }
}

/* ------------------------------------------------------------------ */
/*  File Upload                                                         */
/* ------------------------------------------------------------------ */

interface UploadParams {
  fileName: string
  mimeType: string
  buffer: Buffer
  category: string
  description?: string
}

interface UploadResult {
  fileId: string
  webViewLink: string
  webContentLink: string
  thumbnailLink?: string
}

/**
 * Uploads a file to Google Drive inside the root folder under a category subfolder.
 */
export async function uploadFileToDrive(params: UploadParams): Promise<UploadResult> {
  const drive = await getAuthenticatedDrive()
  const google = await getGoogleAPIs()

  // Ensure the category subfolder exists
  const subFolderId = await ensureSubFolder(drive, google, DRIVE_FOLDER_ID, params.category)

  // Check if a file with the same name already exists in the subfolder
  const existingFile = await findFileByName(drive, params.fileName, subFolderId)

  let result

  if (existingFile) {
    result = await drive.files.update({
      fileId: existingFile.id!,
      media: {
        mimeType: params.mimeType,
        body: Readable.from(params.buffer),
      },
    })
  } else {
    result = await drive.files.create({
      requestBody: {
        name: params.fileName,
        parents: [subFolderId],
        description: params.description ?? '',
      },
      media: {
        mimeType: params.mimeType,
        body: Readable.from(params.buffer),
      },
      fields: 'id,webViewLink,webContentLink,thumbnailLink',
    })
  }

  const file = result.data

  // Make the file publicly accessible
  try {
    await drive.permissions.create({
      fileId: file.id!,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    })
  } catch (permError) {
    console.warn('[Drive] Could not set public permission:', permError)
  }

  // Re-fetch to get updated links after permission change
  const updatedFile = await drive.files.get({
    fileId: file.id!,
    fields: 'id,webViewLink,webContentLink,thumbnailLink',
  })

  return {
    fileId: updatedFile.data.id!,
    webViewLink: updatedFile.data.webViewLink ?? '',
    webContentLink: updatedFile.data.webContentLink ?? '',
    thumbnailLink: updatedFile.data.thumbnailLink ?? undefined,
  }
}

/* ------------------------------------------------------------------ */
/*  File Delete                                                         */
/* ------------------------------------------------------------------ */

/** Deletes a file from Google Drive by its file ID */
export async function deleteFileFromDrive(fileId: string): Promise<void> {
  const drive = await getAuthenticatedDrive()
  await drive.files.delete({ fileId })
}

/* ------------------------------------------------------------------ */
/*  File Listing                                                        */
/* ------------------------------------------------------------------ */

/** Lists files in a category subfolder */
export async function listFilesInCategory(category: string) {
  const drive = await getAuthenticatedDrive()
  const google = await getGoogleAPIs()
  const subFolderId = await ensureSubFolder(drive, google, DRIVE_FOLDER_ID, category)

  const result = await drive.files.list({
    q: `'${subFolderId}' in parents and trashed = false`,
    fields: 'files(id,name,mimeType,size,modifiedTime,webViewLink,webContentLink,thumbnailLink)',
    orderBy: 'modifiedTime desc',
    pageSize: 100,
  })

  return result.data.files ?? []
}

/* ------------------------------------------------------------------ */
/*  Helper: Ensure Subfolder                                            */
/* ------------------------------------------------------------------ */

async function ensureSubFolder(
  drive: Awaited<ReturnType<typeof getAuthenticatedDrive>>,
  google: Awaited<ReturnType<typeof getGoogleAPIs>>,
  parentFolderId: string,
  subFolderName: string,
): Promise<string> {
  const result = await drive.files.list({
    q: `'${parentFolderId}' in parents and name = '${subFolderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id,name)',
    pageSize: 1,
  })

  if (result.data.files && result.data.files.length > 0) {
    return result.data.files[0].id!
  }

  const createResult = await drive.files.create({
    requestBody: {
      name: subFolderName,
      parents: [parentFolderId],
      mimeType: 'application/vnd.google-apps.folder',
    },
    fields: 'id,name',
  })

  return createResult.data.id!
}

/* ------------------------------------------------------------------ */
/*  Helper: Find File by Name                                           */
/* ------------------------------------------------------------------ */

async function findFileByName(
  drive: Awaited<ReturnType<typeof getAuthenticatedDrive>>,
  fileName: string,
  folderId: string,
) {
  const result = await drive.files.list({
    q: `'${folderId}' in parents and name = '${fileName}' and trashed = false`,
    fields: 'files(id,name)',
    pageSize: 1,
  })

  return result.data.files?.[0] ?? null
}

/* ------------------------------------------------------------------ */
/*  Token Revocation (Disconnect)                                       */
/* ------------------------------------------------------------------ */

export async function revokeAndDeleteTokens(): Promise<void> {
  const tokens = await getStoredTokens()

  if (tokens?.access_token) {
    try {
      const client = getOAuth2Client()
      client.setCredentials(tokens)
      await client.revokeCredentials()
    } catch {
      // Token may already be expired or revoked — ignore
    }
  }

  await deleteStoredTokens()
}
