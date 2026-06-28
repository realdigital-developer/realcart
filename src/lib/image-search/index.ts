/**
 * Barrel export for the image-search module.
 *
 * Importers should use this single entry point:
 *   import { processImage } from '@/lib/image-search'
 *   import { PIPELINE } from '@/lib/image-search'
 */

export { processImage } from './process-image'
export { analyzeWithGroq } from './groq-vision'
export { analyzeWithXimilar } from './ximilar-attributes'
export { embedWithJina, embedTextWithJina } from './jina-embedding'
export { queryPinecone, upsertToPinecone, clearPineconeNamespace } from './pinecone-vector-store'
export { queryFaiss, reloadFaissIndex, getFaissStats } from './faiss-vector-store'
export { queryAlgolia, upsertToAlgolia, clearAlgoliaIndex } from './algolia-search'
export { hybridRank } from './ranking-engine'
export { mergeAttributes, buildTextQuery } from './attribute-merger'
export { normalizeColor, colorSimilarity } from './color-utils'
export { cacheGet, cacheSet, hashImage } from './cache'
export * from './config'
export * from './types'
