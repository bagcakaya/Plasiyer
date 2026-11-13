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

function makeAuthHash(cfg = {}) {
  const { host, port, database, user, password } = parseCleanDbParts(cfg);
  return crypto
    .createHash('sha256')
    .update(`${host.toLowerCase()}|${port}|${database.toUpperCase()}|${user.toUpperCase()}|${password}`)
    .digest('hex');
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

  async saveProductImage(cfg, stokId, imgObj) {
    const key = makeMirrorKey(cfg);
    const cleanId = String(stokId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    if (!key || !cleanId || !imgObj?.buffer) return;
    await putMirrorJson(key, `erp-images/${cleanId}.json`, {
      authHash: makeAuthHash(cfg),
      syncedAt: new Date().toISOString(),
      contentType: imgObj.contentType || 'image/jpeg',
      ext: imgObj.ext || 'jpg',
      idx: imgObj.idx || '',
      base64: imgObj.buffer.toString('base64'),
    });
  },

  async getProductImage(cfg, stokId) {
    const key = makeMirrorKey(cfg);
    const cleanId = String(stokId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    if (!key || !cleanId) return null;
    const data = await getMirrorJson(key, `erp-images/${cleanId}.json`);
    if (!data || data.authHash !== makeAuthHash(cfg) || !data.base64) {
      return null;
    }
    return {
      contentType: data.contentType || 'image/jpeg',
      ext: data.ext || 'jpg',
      idx: data.idx || '',
      buffer: Buffer.from(data.base64, 'base64'),
    };
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
