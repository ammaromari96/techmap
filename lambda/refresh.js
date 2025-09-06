'use strict';

// Lambda: fetch techmap.dev, parse module JS chunk for companies array,
// and upsert into DynamoDB (on-demand table). Stores an ETag in a meta item
// to avoid unnecessary re-writes when the JS chunk is unchanged.

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');

const ddbClient = new DynamoDBClient({});
const doc = DynamoDBDocumentClient.from(ddbClient, { marshallOptions: { removeUndefinedValues: true } });

const TABLE_NAME = process.env.TABLE_NAME;
const TECHMAP_URL = process.env.TECHMAP_URL || 'https://www.techmap.dev/';

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function absoluteUrl(src, base) {
  try { return new URL(src, base).href; } catch { return null; }
}

function extractJsonParseBlocks(jsText) {
  const blocks = [];
  const re = /JSON\.parse\(\s*(["'])((?:\\\1|(?:(?!\1)).)*)\1\s*\)/g;
  let m;
  while ((m = re.exec(jsText)) !== null) {
    const quote = m[1];
    const raw = m[2];
    try {
      // eslint-disable-next-line no-eval
      const unescaped = eval(quote + raw + quote);
      blocks.push(JSON.parse(unescaped));
    } catch (_) { /* ignore malformed blocks */ }
  }
  return blocks;
}

function pickCompaniesArray(candidates) {
  for (const c of candidates) {
    if (Array.isArray(c) && c.length > 50 && typeof c[0] === 'object') {
      const k = new Set(Object.keys(c[0] || {}));
      if (k.has('name') && k.has('website') && k.has('coordinates')) return c;
    }
  }
  return candidates
    .filter(c => Array.isArray(c) && typeof c[0] === 'object')
    .sort((a, b) => (b?.length || 0) - (a?.length || 0))[0] || null;
}

function normalizeCompanies(arr) {
  return arr.map(o => ({
    name: o.name ?? null,
    id: o.id ?? null,
    website: o.website ?? null,
    linkedin: o.linkedin ?? null,
    crunchbase: o.crunchbase ?? null,
    coordinates: o.coordinates ?? null,
    description: o.description ?? null,
    founded: o.founded ?? null,
    employees: o.employees ?? null,
    logo: o.logo ?? null,
    logoFallback: o.logoFallback ?? null,
    updatedAt: Date.now(),
  })).filter(c => c.name);
}

async function getMeta() {
  const res = await doc.send(new GetCommand({ TableName: TABLE_NAME, Key: { name: '__meta__' } }));
  return res.Item || null;
}

async function putMeta(meta) {
  await doc.send(new PutCommand({ TableName: TABLE_NAME, Item: { name: '__meta__', ...meta } }));
}

async function batchWriteAll(items) {
  const chunks = [];
  for (let i = 0; i < items.length; i += 25) chunks.push(items.slice(i, i + 25));
  for (const chunk of chunks) {
    let requestItems = { [TABLE_NAME]: chunk.map(Item => ({ PutRequest: { Item } })) };
    for (let attempt = 0; attempt < 5; attempt++) {
      const out = await doc.send(new BatchWriteCommand({ RequestItems: requestItems }));
      const unprocessed = out.UnprocessedItems && out.UnprocessedItems[TABLE_NAME];
      if (!unprocessed || unprocessed.length === 0) break;
      requestItems = { [TABLE_NAME]: unprocessed };
      await new Promise(r => setTimeout(r, 250 * (attempt + 1)));
    }
  }
}

exports.handler = async () => {
  if (!TABLE_NAME) throw new Error('TABLE_NAME not set');

  const pageRes = await fetch(TECHMAP_URL, { redirect: 'follow' });
  if (!pageRes.ok) throw new Error(`Failed to fetch page: ${pageRes.status}`);
  const baseUrl = pageRes.url || TECHMAP_URL;
  const html = await pageRes.text();

  const m = html.match(/<script\b[^>]*type=["']module["'][^>]*src=["']([^"']+)["'][^>]*>/i);
  if (!m) throw new Error('module_script_not_found');
  const mainJsUrl = absoluteUrl(m[1], baseUrl);
  if (!mainJsUrl) throw new Error('module_script_invalid');

  const meta = await getMeta();
  const headers = meta?.etag ? { 'If-None-Match': meta.etag } : undefined;
  const jsRes = await fetch(mainJsUrl, { headers });
  if (jsRes.status === 304) return { ok: true, unchanged: true };
  if (!jsRes.ok) throw new Error(`js_${jsRes.status}`);
  const jsText = await jsRes.text();
  const serverEtag = jsRes.headers.get('etag');
  const newEtag = serverEtag || ('sha256:' + sha256Hex(jsText));

  const blocks = extractJsonParseBlocks(jsText);
  const companies = pickCompaniesArray(blocks);
  if (!companies) throw new Error('companies_array_not_found');
  const cleaned = normalizeCompanies(companies);

  // Upsert all companies by name
  await batchWriteAll(cleaned.map(c => ({ ...c, name: String(c.name) })));
  await putMeta({ etag: newEtag, updatedAt: Date.now(), count: cleaned.length });

  return { ok: true, count: cleaned.length, etag: newEtag, source: mainJsUrl };
};
