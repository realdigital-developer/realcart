# Firebase Phone Auth — Complete Setup Guide

This guide walks you through creating a Firebase project and finding **all** the credentials needed to enable real SMS OTP login for the customer, delivery-boy, and seller panels.

---

## ⚡ Quick Reference — What You Need

Your project needs **9 environment variables** in `.env`:

### Client-side (browser) — 6 variables
These are safe to expose to the browser (they have the `NEXT_PUBLIC_` prefix):

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase Console → Project Settings → Web App |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase Console → Project Settings → Web App |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase Console → Project Settings → Web App |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase Console → Project Settings → Web App |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase Console → Project Settings → Web App |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase Console → Project Settings → Web App |

### Server-side (Admin SDK) — 1 variable (recommended) OR 3 variables
Used only on the server to verify Firebase ID tokens. **Never expose these to the browser.**

| Variable | Where to find it |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase Console → Project Settings → Service Accounts → Generate New Private Key |

**OR** (alternative — 3 separate variables):

| Variable | Where to find it |
|---|---|
| `FIREBASE_ADMIN_PROJECT_ID` | Inside the service-account JSON (`project_id` field) |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | Inside the service-account JSON (`client_email` field) |
| `FIREBASE_ADMIN_PRIVATE_KEY` | Inside the service-account JSON (`private_key` field) |

> **Recommendation:** Use `FIREBASE_SERVICE_ACCOUNT_JSON` (Option A) — it's simpler and less error-prone than splitting the key into 3 variables.

---

## 📋 Prerequisites

- A Google account (free)
- About 15 minutes
- No credit card required (Firebase Phone Auth has a free tier)

---

## Step 1 — Create a Firebase Project

1. Go to **https://console.firebase.google.com/**
2. Click **"Add project"** (or "Create a project")
3. Enter a **project name** (e.g., `realcart-auth` or `realcart-production`)
4. Click **"Continue"**
5. Google Analytics is **optional** — you can disable it. Click **"Continue"**
6. Wait ~30 seconds for the project to be created
7. Click **"Continue"** when the project is ready

✅ You now have a Firebase project. Note your **Project ID** (shown in the URL and dashboard) — you'll need it later.

---

## Step 2 — Register a Web App (to get client-side credentials)

This gives you the 6 `NEXT_PUBLIC_FIREBASE_*` variables.

1. In the Firebase Console, click the **Web icon** `</>` (next to iOS and Android icons) on the project overview page
   - OR go to: ⚙️ Project Settings → General → "Your apps" → click `</>` Web
2. Enter an **app nickname** (e.g., `RealCart Web`)
3. **Do NOT** check "Firebase Hosting" (not needed for this project)
4. Click **"Register app"**
5. A code snippet appears showing `firebaseConfig`:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyD-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  authDomain: "realcart-auth.firebaseapp.com",
  projectId: "realcart-auth",
  storageBucket: "realcart-auth.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef1234567890"
};
```

6. **Copy these 6 values** — they map to your `.env` like this:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyD-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=realcart-auth.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=realcart-auth
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=realcart-auth.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789012
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789012:web:abcdef1234567890
```

7. Click **"Continue to console"**

> 💡 You can always find these values again at: ⚙️ **Project Settings → General → Your apps → [Your Web App] → SDK setup and configuration**

---

## Step 3 — Enable Phone Authentication

This is the most important step — without this, Phone Auth will not work.

1. In the Firebase Console left sidebar, click **"Build" → "Authentication"**
   - OR go directly to: https://console.firebase.google.com/project/YOUR_PROJECT_ID/authentication
2. Click **"Get started"** (if you see it) or go to the **"Sign-in method"** tab
3. In the list of sign-in providers, find **"Phone"**
4. Click on **"Phone"**, then:
   - Toggle **"Enable"** to ON (top right)
   - Click **"Save"**
5. ✅ Phone Authentication is now enabled (you'll see "Phone" with a green "Enabled" badge)

---

## Step 4 — Add Authorized Domains (critical for reCAPTCHA)

Firebase Phone Auth uses reCAPTCHA to prevent abuse. You must add your domains to the authorized list, otherwise OTP sending will fail with a "domain not authorized" error.

1. In **Authentication → Settings** (tab next to "Sign-in method")
2. Scroll down to **"Authorized domains"**
3. Add the following domains by clicking **"Add domain"**:
   - `localhost` — **should already be there** (for local development)
   - `your-app.vercel.app` — your production Vercel domain (add after deploying)
   - Any other domain where your app runs (e.g., `realcart.vercel.app`)
4. Click **"Add"** after each domain

> ⚠️ **Important:** If you deploy to a new Vercel URL, you MUST add that domain here. Otherwise phone OTP will fail in production.

---

## Step 5 — Get the Service Account (server-side credentials)

This gives you the `FIREBASE_SERVICE_ACCOUNT_JSON` (or the 3 individual `FIREBASE_ADMIN_*` variables).

1. Go to ⚙️ **Project Settings** (gear icon top left)
2. Click the **"Service accounts"** tab
3. You'll see a code snippet for "Admin SDK configuration"
4. Click the **"Generate new private key"** button (bottom of the section)
5. A dialog warns: "This is the only time you can download this key" — click **"Generate key"**
6. A JSON file downloads to your computer (e.g., `realcart-auth-firebase-adminsdk-xxxxx.json`)

### Open the downloaded JSON file — it looks like this:

```json
{
  "type": "service_account",
  "project_id": "realcart-auth",
  "private_key_id": "abc123def456...",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQD...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xxxxx@realcart-auth.iam.gserviceaccount.com",
  "client_id": "123456789012345678901",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-xxxxx%40realcart-auth.iam.gserviceaccount.com"
}
```

### Option A (recommended) — Use the full JSON

Copy the **entire JSON content** (minified to one line) and put it in `.env`:

```env
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"realcart-auth","private_key_id":"abc123...","private_key":"-----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----\n","client_email":"firebase-adminsdk-xxxxx@realcart-auth.iam.gserviceaccount.com","client_id":"123456789012345678901","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-xxxxx%40realcart-auth.iam.gserviceaccount.com"}
```

> 💡 To minify JSON to one line: copy the JSON, run `node -e "console.log(JSON.stringify(JSON.parse(require('fs').readFileSync('your-file.json','utf8'))))"` in your terminal, or use an online JSON minifier.

### Option B — Use 3 individual variables (alternative)

Extract these 3 fields from the JSON and set them separately:

```env
FIREBASE_ADMIN_PROJECT_ID=realcart-auth
FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk-xxxxx@realcart-auth.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----\n"
```

> ⚠️ **For `FIREBASE_ADMIN_PRIVATE_KEY`:** The `\n` characters must be literal backslash-n in your `.env` file (NOT actual newlines). Wrap the value in double quotes. The code automatically converts `\n` to real newlines at runtime.

> 🔒 **Security:** This file grants full Admin access to your Firebase project. **Never commit it to Git.** The `.gitignore` file already excludes `.env` files. If you accidentally expose the key, go back to Service Accounts and "Generate new private key" to create a new one (the old one stops working).

---

## Step 6 — Add Test Phone Numbers (for development)

For development without spending real SMS credits, you can add test phone numbers that always work with a fixed OTP.

1. Go to **Authentication → Sign-in method** tab
2. Scroll down to **"Phone numbers for testing"** (expanded section)
3. Click **"Add phone number"**
4. Enter:
   - **Phone number:** `+91 99999 00001` (or any number you want)
   - **Test code:** `123456` (matches the app's dev-mode test OTP)
5. Click **"Add"**
6. Repeat for any other test numbers you need

> 💡 With test numbers, Firebase does NOT send a real SMS — it just accepts the test code instantly. This is perfect for development and CI/CD testing. Test numbers work even without billing setup.

---

## Step 7 — (Production only) Upgrade to Blaze Plan

Firebase Phone Auth requires the **Blaze (pay-as-you-go) plan** to send real SMS messages to real phone numbers.

> ⚠️ **On the Spark (free) plan?** You'll get an `auth/billing-not-enabled` error when trying to send OTP. See **Step 7b** below to use dev mode (test OTP `123456`) instead — no billing needed.

1. Go to Firebase Console → ⚙️ Project Settings → **"Usage and billing"** tab
2. Click **"Upgrade"** or "Modify plan"
3. Select the **Blaze** plan
4. Link a billing account (or create one — Google Cloud billing)
5. Set a **budget alert** (recommended) — e.g., $10/month — so you get notified if costs spike

### Pricing (as of 2025):
- **First 10 SMS/month: FREE** (Blaze plan)
- **After that:** ~$0.01 per SMS for India, ~$0.06–$0.10 for US/other countries
- **Test phone numbers:** Always free (no SMS is actually sent)

> 💡 For a small-to-medium e-commerce app, the free 10 SMS/month + low per-SMS cost means you'll likely spend less than $1–$5/month.

---

## Step 7b — Spark (Free) Plan Workaround — Dev Mode

If you're on the Firebase **Spark (free) plan** and see the error `Firebase: error (auth/billing-not-enabled)`, you have two options:

### Option 1: Use Dev Mode (recommended for development)

The project has a built-in **dev mode** that uses the test OTP `123456` instead of real Firebase SMS. This lets you test the entire auth flow (customer, delivery-boy, seller) without upgrading to Blaze.

**Set these two env vars in your `.env`:**

```env
# Client-side override (stops the browser from calling Firebase Phone Auth)
NEXT_PUBLIC_FIREBASE_DEV_MODE=true

# Server-side override (server accepts synthetic dev tokens instead of real Firebase ID tokens)
FIREBASE_DEV_MODE=true
```

**How it works:**
- **Client side** (`NEXT_PUBLIC_FIREBASE_DEV_MODE=true`): The `usePhoneOtp` hook skips the Firebase `signInWithPhoneNumber` call — no reCAPTCHA, no SMS, no billing. The "Send OTP" button just proceeds to the OTP input step.
- **Server side** (`FIREBASE_DEV_MODE=true`): The `verifyIdToken` function accepts synthetic dev tokens (`dev-otp-<mobile>-123456`) instead of verifying real Firebase ID tokens.
- **Test OTP:** Always `123456` for any mobile number.

**To switch to production later:**
1. Upgrade to the Blaze plan (Step 7 above)
2. Set both vars to `false` (or remove them)
3. Restart the dev server
4. Real Firebase Phone Auth SMS will be used

### Option 2: Upgrade to Blaze Plan (required for production)

Follow Step 7 above to upgrade to the Blaze plan. The first 10 SMS/month are free, so you won't be charged for light testing.

---

## Step 8 — Put It All Together in `.env`

Create or edit your `.env` file (in the project root) with all the Firebase credentials:

```env
# ─── Firebase Phone Auth (ALL panels) ───────────────────────────────

# Client-side (from Step 2 — Web App config)
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyD-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=realcart-auth.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=realcart-auth
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=realcart-auth.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789012
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789012:web:abcdef1234567890

# Server-side (from Step 5 — Service Account JSON)
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"realcart-auth","private_key_id":"abc123...","private_key":"-----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----\n","client_email":"firebase-adminsdk-xxxxx@realcart-auth.iam.gserviceaccount.com","client_id":"123456789012345678901","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-xxxxx%40realcart-auth.iam.gserviceaccount.com"}
```

> ⚠️ **Important:** After editing `.env`, you MUST restart the dev server (`bun run dev`) for the changes to take effect. Environment variables are loaded at startup.

---

## Step 9 — Verify the Setup

### 9a. Check the server-side (Admin SDK) loaded correctly

Start the dev server and look at the console output:

```bash
bun run dev
```

You should see:
```
[Firebase Admin] Initialized — project: realcart-auth
```

If you DON'T see this message (and there's no error), Firebase Admin is not configured — check your `FIREBASE_SERVICE_ACCOUNT_JSON` value.

### 9b. Test the customer registration flow

1. Open `http://localhost:3000/customer`
2. Enter a **real** mobile number (if you have SMS credits) OR a **test number** from Step 6
3. Click "Continue"
4. You should receive an SMS with a 6-digit OTP (or use the test code `123456`)
5. Enter the OTP → you should advance to "Create Your Passcode"

### 9c. Test the API directly (without the UI)

```bash
# This should return 200 with a Firebase ID token in the response
# (after you complete the Firebase Phone Auth flow in the browser)

# Or test the dev-mode fallback (no Firebase needed):
curl -X POST http://localhost:3000/api/auth/customer/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"mobile":"9999900001","idToken":"dev-otp-9999900001-123456"}'
```

---

## 🔧 Dev Mode (No Firebase Configured)

If you do NOT set any Firebase env variables, the app automatically enters **dev mode**:

- **Client side:** `usePhoneOtp` hook skips the Firebase call (no reCAPTCHA, no SMS)
- **Server side:** `verifyIdToken` accepts a synthetic dev token `dev-otp-<mobile>-123456`
- **Test OTP:** Always `123456`

This means the app is **fully functional in the sandbox** without any Firebase setup. You only need real Firebase credentials for production (sending real SMS to real phone numbers).

To confirm you're in dev mode, the server console shows nothing about Firebase Admin (no "[Firebase Admin] Initialized" message).

---

## 🐛 Troubleshooting

### Problem: "Firebase: error (auth/billing-not-enabled)"
**Cause:** You're on the Firebase Spark (free) plan, which does NOT support Phone Auth SMS. Real SMS requires the Blaze (pay-as-you-go) plan.
**Fix:** Enable dev mode by setting these two env vars in `.env`:
```env
NEXT_PUBLIC_FIREBASE_DEV_MODE=true
FIREBASE_DEV_MODE=true
```
This uses the test OTP `123456` instead of real SMS. See **Step 7b** above for full details. Restart the dev server after editing `.env`.

### Problem: "reCAPTCHA has already been rendered"
**Cause:** React strict mode or HMR caused the reCAPTCHA verifier to be created twice.
**Fix:** This is handled automatically by the `usePhoneOtp` hook (it clears and recreates the verifier). If it persists, refresh the page.

### Problem: "Phone number format is incorrect"
**Cause:** The mobile number isn't 10 digits.
**Fix:** The app automatically prepends `+91` (India country code). Enter only the 10-digit number (e.g., `9876543210`, not `+919876543210`).

### Problem: "Invalid ID token" or "ID token has expired"
**Cause:** The Firebase ID token verification failed on the server.
**Fix:**
1. Check `FIREBASE_SERVICE_ACCOUNT_JSON` is valid JSON (paste it into a JSON validator)
2. Make sure the `project_id` in the service account matches `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
3. Restart the dev server after editing `.env`

### Problem: "This domain is not authorized for OAuth operations"
**Cause:** You haven't added your domain to Firebase's authorized domains list.
**Fix:** Follow **Step 4** — add your domain (e.g., `localhost`, `your-app.vercel.app`) in Firebase Console → Authentication → Settings → Authorized domains.

### Problem: "Quota exceeded" or "Too many requests"
**Cause:** Firebase rate-limits OTP sends to prevent abuse.
**Fix:**
1. Wait a few minutes before trying again
2. Use test phone numbers (Step 6) during development — they don't count against quota
3. Upgrade to the Blaze plan (Step 7)

### Problem: OTP is sent but never received
**Cause:** Real SMS delivery depends on the carrier and country.
**Fix:**
1. Use a test phone number (Step 6) — it doesn't require real SMS
2. Check if the number has DND (Do Not Disturb) enabled
3. Firebase SMS delivery to India can take 30–60 seconds

### Problem: `FIREBASE_ADMIN_PRIVATE_KEY` not working (Option B)
**Cause:** The private key's `\n` characters were converted to actual newlines.
**Fix:**
1. Open the downloaded JSON file
2. Copy the `private_key` value exactly as-is (including the literal `\n` characters)
3. Wrap it in double quotes in `.env`:
```env
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----\n"
```
4. The code automatically converts `\n` to real newlines at runtime

### Problem: App still in dev mode after setting env vars
**Cause:** The dev server didn't pick up the new env vars.
**Fix:**
1. Stop the dev server (`Ctrl+C`)
2. Delete `.next` cache: `rm -rf .next`
3. Restart: `bun run dev`
4. Look for `[Firebase Admin] Initialized — project: ...` in the console output

---

## ✅ Final Checklist

Before going to production, verify:

- [ ] Firebase project created
- [ ] Web app registered (6 `NEXT_PUBLIC_FIREBASE_*` variables set in `.env`)
- [ ] Phone Authentication enabled (Authentication → Sign-in method → Phone = Enabled)
- [ ] Service account generated (`FIREBASE_SERVICE_ACCOUNT_JSON` set in `.env`)
- [ ] Authorized domains added (localhost + production domain)
- [ ] Test phone numbers added (for development)
- [ ] Blaze plan activated (for real SMS in production)
- [ ] Budget alert set (to avoid unexpected charges)
- [ ] Dev server restarted after editing `.env`
- [ ] Console shows `[Firebase Admin] Initialized — project: YOUR_PROJECT_ID`
- [ ] Customer registration OTP flow works end-to-end
- [ ] Delivery-boy registration OTP flow works end-to-end
- [ ] Seller registration OTP flow works end-to-end

---

## 📞 Support

- **Firebase Console:** https://console.firebase.google.com/
- **Firebase Phone Auth docs:** https://firebase.google.com/docs/auth/web/phone-auth
- **Firebase Pricing:** https://firebase.google.com/pricing
- **Firebase Support:** https://firebase.google.com/support

---

*This guide is part of the RealCart project. The Firebase integration replaces the former 2Factor.in SMS OTP system across all three panels (customer, delivery-boy, seller).*
