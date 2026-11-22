#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEED_PATH = path.join(ROOT, 'supabase', 'demo_seed.sql');
const CATEGORIES = [
  { key: 'bags', endpoint: 'https://dummyjson.com/products/category/womens-bags?limit=30', firstId: 1 },
  { key: 'shoes', endpoint: 'https://dummyjson.com/products/category/womens-shoes?limit=30', firstId: 9 },
];
const UUID_PREFIX = 'd1000000-0000-4000-8000-000000000';

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Catalog request failed (${response.status}): ${url}`);
  return response.json();
}

async function verifyImage(url, cache) {
  if (!url || typeof url !== 'string') return false;
  if (cache.has(url)) return cache.get(url);
  let valid = false;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    const contentType = response.headers.get('content-type') ?? '';
    valid = response.status === 200 && contentType.toLowerCase().startsWith('image/');
    await response.body?.cancel();
  } catch {
    valid = false;
  }
  cache.set(url, valid);
  return valid;
}

function getSeedFallbacks(sql, category, imageUrlsColumnPresent) {
  const fallbacks = [];
  const firstId = category.firstId;
  for (let n = firstId; n < firstId + 8; n += 1) {
    const id = `${UUID_PREFIX}${String(n).padStart(3, '0')}`;
    const row = sql.split(/\r?\n/).find((line) => line.includes(`'${id}'`) && line.includes('https://'));
    if (!row) continue;
    const urls = [...row.matchAll(/https?:\/\/(?:''|[^'\s])+/g)].map((match) => match[0].replaceAll("''", "'"));
    const unique = [...new Set(urls)];
    if (imageUrlsColumnPresent) {
      // Existing image_urls entries, when present in a seed row, are included with the other candidates.
      fallbacks.push(...unique);
    } else {
      fallbacks.push(...unique);
    }
  }
  return [...new Set(fallbacks)];
}

function productImageCandidates(product) {
  return [...new Set([
    ...(Array.isArray(product.images) ? product.images : []),
    product.thumbnail,
  ].filter((url) => typeof url === 'string' && url.startsWith('https://')) )];
}

async function verifiedPairForProduct(product, categoryProducts, fallbackUrls, cache) {
  const own = [];
  for (const url of productImageCandidates(product)) {
    if (await verifyImage(url, cache)) own.push(url);
    if (own.length === 2) return own;
  }

  // If a catalog item has fewer than two working photos, reuse a verified pair from a
  // product in the same category. This keeps bag and shoe photography separate.
  for (const other of categoryProducts) {
    if (other === product) continue;
    const pair = [];
    for (const url of productImageCandidates(other)) {
      if (await verifyImage(url, cache)) pair.push(url);
      if (pair.length === 2) return pair;
    }
  }

  // Seed URLs are only a last resort and are accepted only after the same HTTP checks.
  const fallbackPair = [];
  for (const url of fallbackUrls) {
    if (await verifyImage(url, cache)) fallbackPair.push(url);
    if (fallbackPair.length === 2) return fallbackPair;
  }
  return null;
}

function replaceProductImages(sql, category, imagePairs, imageUrlsColumnPresent) {
  let updated = 0;
  for (let index = 0; index < 8; index += 1) {
    const productNumber = category.firstId + index;
    const id = `${UUID_PREFIX}${String(productNumber).padStart(3, '0')}`;
    const [primary, gallery] = imagePairs[index];
    const escapedPrimary = primary.replaceAll("'", "''");
    const escapedGallery = gallery.replaceAll("'", "''");
    const rowPattern = imageUrlsColumnPresent
      ? new RegExp(`^(\\s*\\('${id}',\\s*'(?:''|[^'])*',\\s*'(?:''|[^'])*',\\s*'(?:bags|sneakers)',\\s*'(?:''|[^'])*',\\s*)'(?:''|[^'])*'(,\\s*)array\\['(?:''|[^'])*'\\s*,\\s*'(?:''|[^'])*'\\](,\\s*)array\\['(?:''|[^'])*'\\](,\\s*array\\[.*)$`, 'm')
      : new RegExp(`^(\\s*\\('${id}',\\s*'(?:''|[^'])*',\\s*'(?:''|[^'])*',\\s*'(?:bags|sneakers)',\\s*'(?:''|[^'])*',\\s*)'(?:''|[^'])*'(,\\s*)array\\['(?:''|[^'])*'\\](,\\s*array\\[.*)$`, 'm');
    const match = sql.match(rowPattern);
    if (!match) throw new Error(`Could not locate the product seed row for ${category.key} #${String(index + 1).padStart(2, '0')}`);
    const replacement = imageUrlsColumnPresent
      ? `${match[1]}'${escapedPrimary}'${match[2]}array['${escapedPrimary}', '${escapedGallery}']${match[3]}array['${escapedGallery}']${match[4]}`
      : `${match[1]}'${escapedPrimary}'${match[2]}array['${escapedGallery}']${match[3]}`;
    sql = sql.replace(rowPattern, replacement);
    updated += 1;
  }
  return { sql, updated };
}

async function main() {
  const originalSql = await readFile(SEED_PATH, 'utf8');
  const imageUrlsColumnPresent = /\(\s*id\s*,[^)]*\bimage_urls\b/i.test(originalSql);
  const cache = new Map();
  const verifiedImages = new Set();
  const categoryPairs = new Map();

  for (const category of CATEGORIES) {
    const catalog = await fetchJson(category.endpoint);
    const products = Array.isArray(catalog.products) ? catalog.products : [];
    if (products.length === 0) throw new Error(`DummyJSON returned no ${category.key} products`);
    const fallbacks = getSeedFallbacks(originalSql, category, imageUrlsColumnPresent);
    const pairs = [];
    for (let index = 0; index < 8; index += 1) {
      const product = products[index % products.length];
      const pair = await verifiedPairForProduct(product, products, fallbacks, cache);
      if (!pair || pair.length !== 2) throw new Error(`Could not find two verified ${category.key} images for demo product ${index + 1}`);
      pairs.push(pair);
      pair.forEach((url) => verifiedImages.add(url));
    }
    categoryPairs.set(category.key, pairs);
  }

  // Verify every final URL immediately before writing, including URLs reused across products.
  for (const url of verifiedImages) {
    if (!(await verifyImage(url, cache))) throw new Error(`Final image verification failed: ${url}`);
  }

  let nextSql = originalSql;
  let totalUpdated = 0;
  for (const category of CATEGORIES) {
    const result = replaceProductImages(nextSql, category, categoryPairs.get(category.key), imageUrlsColumnPresent);
    nextSql = result.sql;
    totalUpdated += result.updated;
  }

  await writeFile(SEED_PATH, nextSql, 'utf8');
  console.log(`Updated ${totalUpdated}/16 demo products in supabase/demo_seed.sql.`);
  console.log(`32/32 selected product image slots verified HTTP 200 with image/* content-type (${verifiedImages.size} distinct URLs).`);
  console.log('Re-run supabase/demo_seed.sql in Supabase SQL Editor to refresh the product and variant images.');
}

main().catch((error) => {
  console.error(`Image refresh stopped: ${error.message}`);
  process.exitCode = 1;
});
