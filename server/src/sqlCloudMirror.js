import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { get, put } from '@vercel/blob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
}

function parseCleanDbParts(cfg = {}) {
  let host = String(cfg.sqlHost || cfg.server || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '');
  let port = String(cfg.sqlPort || cfg.port || '1433').trim();

  if (host.includes(',')) {
    const [h, p] = host.split(',');
    host = h.trim();
    if (p?.trim()) port = p.trim();
  } else if (host.includes(':') && !host.startsWith('[')) {
    const [h, p] = host.split(':');
    host = h.trim();
    if (p?.trim()) port = p.trim();
  }

  const database = String(cfg.sqlDatabase || cfg.database || '').trim();
  const user = String(cfg.sqlUser ?? cfg.user ?? '').trim();
  const password = String(cfg.sqlPassword ?? cfg.password ?? '');

  return { host, port: port || '1433', database, user, password };
}

export function makeMirrorKey(cfg = {}) {
  const { host, port, database } = parseCleanDbParts(cfg);
  if (!host || !database) return null;
  const hLower = host.toLowerCase();
  if (hLower === 'localhost' || hLower === '127.0.0.1' || hLower === '.') return null;
  return `${host}_${port}_${database}`
    .toUpperCase()
    .replace(/[^A-Z0-9_.-]/g, '_');
}

function makeSharedHostKey(cfg = {}) {
  const { host, port } = parseCleanDbParts(cfg);
  if (!host) return null;
  const hLower = host.toLowerCase();
  if (hLower === 'localhost' || hLower === '127.0.0.1' || hLower === '.') return null;
  return `${host}_${port}_SHARED`
    .toUpperCase()
    .replace(/[^A-Z0-9_.-]/g, '_');
}

function makeAuthHash(cfg = {}) {
  const { host, port, database, user, password } = parseCleanDbParts(cfg);
  return crypto
    .createHash('sha256')
    .update(`${host.toLowerCase()}|${port}|${database.toUpperCase()}|${user.toUpperCase()}|${password}`)
    .digest('hex');
}

function makeHostAuthHash(cfg = {}) {
  const { host, port, user, password } = parseCleanDbParts(cfg);
  return crypto
    .createHash('sha256')
    .update(`${host.toLowerCase()}|${port}|${user.toUpperCase()}|${password}`)
    .digest('hex');
}

function getSiblingDatabaseCandidates(dbName = '') {
  const clean = String(dbName || '').trim().toUpperCase();
  if (!clean) return [];
  const candidates = new Set();

  // Örn: GUNEYLERB3B -> GUNEYLERB2B, GUNEYLERB1B, GUNEYLERB4B
  const bMatch = clean.match(/^(.*?)B(\d+)B$/i);
  if (bMatch) {
    const prefix = bMatch[1];
    const ver = parseInt(bMatch[2], 10);
    for (const v of [ver - 1, ver - 2, ver + 1, 1, 2, 3, 4, 5]) {
      if (v > 0 && v !== ver) {
        candidates.add(`${prefix}B${v}B`);
      }
    }
  }

  // Örn: FIRMA2026 veya FIRMA_2026 -> FIRMA2025, FIRMA_2025
  const numMatch = clean.match(/^(.*?)(\d+)$/);
  if (numMatch) {
    const prefix = numMatch[1];
    const num = parseInt(numMatch[2], 10);
    if (Number.isFinite(num)) {
      for (const n of [num - 1, num - 2, num + 1]) {
        if (n > 0 && n !== num) {
          candidates.add(`${prefix}${n}`);
        }
      }
    }
  }

  return Array.from(candidates);
}

async function putMirrorJson(mirrorKey, fileName, data) {
  if (!process.env.BLOB_READ_WRITE_TOKEN || !mirrorKey) return false;
  await put(`sql-mirror/${mirrorKey}/${fileName}`, JSON.stringify(data), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 0,
    contentType: 'application/json',
  });
  return true;
}

async function getMirrorJson(mirrorKey, fileName) {
  if (!process.env.BLOB_READ_WRITE_TOKEN || !mirrorKey) return null;
  try {
    const res = await get(`sql-mirror/${mirrorKey}/${fileName}`, {
      access: 'private',
      useCache: false,
    });
    if (res && res.statusCode === 200 && res.stream) {
      const txt = await new Response(res.stream).text();
      return JSON.parse(txt);
    }
  } catch {
    // not found or offline
  }
  return null;
}

export const sqlCloudMirror = {
  isRemoteMirrorable(cfg) {
    return Boolean(makeMirrorKey(cfg));
  },

  async saveStatus(cfg, testResult) {
    const key = makeMirrorKey(cfg);
    if (!key || !testResult?.success) return;
    await putMirrorJson(key, 'status.json', {
      authHash: makeAuthHash(cfg),
      syncedAt: new Date().toISOString(),
      dbName: testResult.dbName,
      tableCount: testResult.tableCount,
      hasErpTables: testResult.hasErpTables,
      originalMessage: testResult.message,
    });
  },

  async verifyAndGetStatus(cfg) {
    const key = makeMirrorKey(cfg);
    if (!key) return null;
    const status = await getMirrorJson(key, 'status.json');
    if (!status || status.authHash !== makeAuthHash(cfg)) {
      return null;
    }
    return status;
  },

  async saveCustomers(cfg, customers) {
    const key = makeMirrorKey(cfg);
    if (!key || !Array.isArray(customers)) return;
    await putMirrorJson(key, 'customers.json', {
      authHash: makeAuthHash(cfg),
      syncedAt: new Date().toISOString(),
      items: customers,
    });
  },

  async getCustomers(cfg, salesRepCode) {
    const key = makeMirrorKey(cfg);
    if (!key) return null;
    const data = await getMirrorJson(key, 'customers.json');
    if (!data || data.authHash !== makeAuthHash(cfg) || !Array.isArray(data.items)) {
      return null;
    }
    if (salesRepCode && String(salesRepCode).trim()) {
      const repUpper = String(salesRepCode).trim().toUpperCase();
      const filtered = data.items.filter(
        (c) => !c.salesRepCode || String(c.salesRepCode).trim().toUpperCase() === repUpper
      );
      return filtered.length > 0 ? filtered : data.items;
    }
    return data.items;
  },

  async saveProducts(cfg, products) {
    const key = makeMirrorKey(cfg);
    if (!key || !Array.isArray(products)) return;
    await putMirrorJson(key, 'products.json', {
      authHash: makeAuthHash(cfg),
      syncedAt: new Date().toISOString(),
      items: products,
    });
  },

  async getProducts(cfg) {
    const key = makeMirrorKey(cfg);
    if (!key) return null;
    const data = await getMirrorJson(key, 'products.json');
    if (!data || data.authHash !== makeAuthHash(cfg) || !Array.isArray(data.items)) {
      return null;
    }
    return data.items;
  },

  async saveStockGroups(cfg, groups) {
    const key = makeMirrorKey(cfg);
    if (!key || !Array.isArray(groups)) return;
    await putMirrorJson(key, 'stock-groups.json', {
      authHash: makeAuthHash(cfg),
      syncedAt: new Date().toISOString(),
      items: groups,
    });
  },

  async getStockGroups(cfg) {
    const key = makeMirrorKey(cfg);
    if (!key) return null;
    const data = await getMirrorJson(key, 'stock-groups.json');
    if (!data || data.authHash !== makeAuthHash(cfg) || !Array.isArray(data.items)) {
      return null;
    }
    return data.items;
  },

  async saveCompanyInfo(cfg, info) {
    const key = makeMirrorKey(cfg);
    if (!key || !info || typeof info !== 'object') return;
    await putMirrorJson(key, 'company-info.json', {
      authHash: makeAuthHash(cfg),
      syncedAt: new Date().toISOString(),
      info,
    });
  },

  async getCompanyInfo(cfg) {
    const key = makeMirrorKey(cfg);
    if (!key) return null;
    const data = await getMirrorJson(key, 'company-info.json');
    if (!data || data.authHash !== makeAuthHash(cfg) || !data.info) {
      return null;
    }
    return data.info;
  },

  async saveProductImage(cfg, stokId, imgObj, productCode = '') {
    const key = makeMirrorKey(cfg);
    const sharedKey = makeSharedHostKey(cfg);
    const cleanId = String(stokId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanCode = String(productCode || imgObj?.productCode || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '_');
    if (!key || !cleanId || !imgObj?.buffer) return;

    const payload = {
      authHash: makeAuthHash(cfg),
      hostAuthHash: makeHostAuthHash(cfg),
      syncedAt: new Date().toISOString(),
      contentType: imgObj.contentType || 'image/jpeg',
      ext: imgObj.ext || 'jpg',
      idx: imgObj.idx || '',
      productCode: String(productCode || imgObj?.productCode || '').trim(),
      base64: imgObj.buffer.toString('base64'),
    };

    const tasks = [putMirrorJson(key, `erp-images/${cleanId}.json`, payload)];
    if (sharedKey) {
      tasks.push(putMirrorJson(sharedKey, `erp-images/id_${cleanId}.json`, payload));
      if (cleanCode) {
        tasks.push(putMirrorJson(sharedKey, `erp-images/code_${cleanCode}.json`, payload));
      }
    }
    await Promise.allSettled(tasks);
  },

  async getProductImage(cfg, stokId, productCode = '') {
    const key = makeMirrorKey(cfg);
    const sharedKey = makeSharedHostKey(cfg);
    const cleanId = String(stokId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanCode = String(productCode || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '_');
    if (!key && !sharedKey) return null;

    const expectedAuthHash = makeAuthHash(cfg);
    const expectedHostHash = makeHostAuthHash(cfg);

    const isValidImgData = (data, allowedAuthHash) => {
      if (!data || !data.base64) return false;
      if (data.hostAuthHash && data.hostAuthHash === expectedHostHash) return true;
      if (data.authHash && (data.authHash === expectedAuthHash || data.authHash === allowedAuthHash)) {
        return true;
      }
      return false;
    };

    const toImgResult = (data) => ({
      contentType: data.contentType || 'image/jpeg',
      ext: data.ext || 'jpg',
      idx: data.idx || '',
      buffer: Buffer.from(data.base64, 'base64'),
    });

    // 1. Aktif veritabanı aynası
    if (key && cleanId) {
      const data = await getMirrorJson(key, `erp-images/${cleanId}.json`);
      if (isValidImgData(data, expectedAuthHash)) {
        return toImgResult(data);
      }
    }

    // 2. Aynı SQL sunucusu üzerindeki ortak (veritabanı adından bağımsız) görsel havuzu (Stok Kodu ve Stok ID ile)
    if (sharedKey) {
      if (cleanCode) {
        const byCodeData = await getMirrorJson(sharedKey, `erp-images/code_${cleanCode}.json`);
        if (isValidImgData(byCodeData, expectedAuthHash)) {
          return toImgResult(byCodeData);
        }
      }
      if (cleanId) {
        const byIdData = await getMirrorJson(sharedKey, `erp-images/id_${cleanId}.json`);
        if (isValidImgData(byIdData, expectedAuthHash)) {
          return toImgResult(byIdData);
        }
      }
    }

    // 3. Aynı SQL sunucusundaki kardeş veritabanı aynaları (örn: GUNEYLERB2B -> GUNEYLERB3B geçişinde eski datadaki görseller)
    if (cleanId) {
      const { database } = parseCleanDbParts(cfg);
      const siblingDbs = getSiblingDatabaseCandidates(database);
      for (const sibDb of siblingDbs) {
        const sibCfg = { ...cfg, sqlDatabase: sibDb, database: sibDb };
        const sibKey = makeMirrorKey(sibCfg);
        if (!sibKey) continue;
        const sibAuthHash = makeAuthHash(sibCfg);
        const sibData = await getMirrorJson(sibKey, `erp-images/${cleanId}.json`);
        if (isValidImgData(sibData, sibAuthHash)) {
          return toImgResult(sibData);
        }
      }
    }

    return null;
  },

  async enqueueOutboxItem(cfg, item) {
    const key = makeMirrorKey(cfg);
    if (!key) return false;
    const status = await this.verifyAndGetStatus(cfg);
    if (!status) return false;

    const existing = (await getMirrorJson(key, 'outbox.json')) || { items: [] };
    const items = Array.isArray(existing.items) ? existing.items : [];
    items.push({
      id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      queuedAt: new Date().toISOString(),
      ...item,
    });
    await putMirrorJson(key, 'outbox.json', { items });
    return true;
  },

  async drainOutbox(cfg, handlerFn) {
    const key = makeMirrorKey(cfg);
    if (!key) return 0;
    const existing = await getMirrorJson(key, 'outbox.json');
    const items = Array.isArray(existing?.items) ? existing.items : [];
    if (items.length === 0) return 0;

    const remaining = [];
    let processed = 0;
    for (const item of items) {
      try {
        await handlerFn(item);
        processed += 1;
      } catch (err) {
        console.warn(`⚠️ Bulut kuyruğu SQL aktarım uyarısı (${item.type}):`, err.message);
        remaining.push(item);
      }
    }

    await putMirrorJson(key, 'outbox.json', { items: remaining });
    return processed;
  },
};
