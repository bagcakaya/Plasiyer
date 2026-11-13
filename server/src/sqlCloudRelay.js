import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { get, put } from '@vercel/blob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
}

const RELAY_BLOB_PATH = 'sql-relay/endpoint-v1.json';

let cachedEndpoint = null; // { relayUrl, fetchedAt }
let activeLocalTunnelUrl = null;
let tunnelChild = null;
let watchdogTimer = null;
let shuttingDown = false;

function getRelaySecretKey() {
  const token = process.env.BLOB_READ_WRITE_TOKEN || '';
  if (!token) return null;
  return crypto.createHash('sha256').update(`polatlar-sql-relay-v1:${token}`).digest();
}

function canonicalCfgString(cfg = {}) {
  const host = String(cfg.server || cfg.sqlHost || '').trim().toLowerCase();
  const port = String(cfg.port || cfg.sqlPort || '1433').trim();
  const db = String(cfg.database || cfg.sqlDatabase || '').trim().toUpperCase();
  const user = String(cfg.user ?? cfg.sqlUser ?? '').trim();
  const password = String(cfg.password ?? cfg.sqlPassword ?? '');
  return `${host}|${port}|${db}|${user}|${password}`;
}

export function signRelayPayload({ timestamp, action, sqlConfig, query = '' }) {
  const key = getRelaySecretKey();
  if (!key) return null;
  const canonical = `${timestamp}\n${action}\n${canonicalCfgString(sqlConfig)}\n${query}`;
  return crypto.createHmac('sha256', key).update(canonical, 'utf8').digest('hex');
}

export function verifyRelayRequest({ timestamp, signature, action, sqlConfig, query = '' }) {
  const key = getRelaySecretKey();
  if (!key || !timestamp || !signature) return false;
  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() - tsNum) > 120000) {
    return false;
  }
  const expected = signRelayPayload({ timestamp: tsNum, action, sqlConfig, query });
  if (!expected || expected.length !== String(signature).length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(String(signature), 'hex'));
  } catch {
    return false;
  }
}

async function publishRelayEndpoint(relayUrl) {
  if (!process.env.BLOB_READ_WRITE_TOKEN || !relayUrl) return false;
  await put(
    RELAY_BLOB_PATH,
    JSON.stringify({
      relayUrl,
      updatedAt: new Date().toISOString(),
    }),
    {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 0,
      contentType: 'application/json',
    }
  );
  return true;
}

async function fetchRelayEndpoint(forceRefresh = false) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  const now = Date.now();
  if (!forceRefresh && cachedEndpoint && now - cachedEndpoint.fetchedAt < 60000) {
    return cachedEndpoint.relayUrl;
  }
  try {
    const res = await get(RELAY_BLOB_PATH, {
      access: 'private',
      useCache: false,
    });
    if (res && res.statusCode === 200 && res.stream) {
      const txt = await new Response(res.stream).text();
      const parsed = JSON.parse(txt);
      if (parsed?.relayUrl && String(parsed.relayUrl).startsWith('https://')) {
        cachedEndpoint = { relayUrl: parsed.relayUrl, fetchedAt: now };
        return parsed.relayUrl;
      }
    }
  } catch {
    // ignore blob read errors
  }
  return null;
}

async function callRemoteRelay(action, sqlConfig, query = '') {
  if (!process.env.VERCEL || !process.env.BLOB_READ_WRITE_TOKEN) {
    return null;
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    const relayUrl = await fetchRelayEndpoint(attempt > 0);
    if (!relayUrl) return null;

    const timestamp = Date.now();
    const normalizedCfg = {
      sqlHost: sqlConfig.server || sqlConfig.sqlHost || '',
      sqlPort: String(sqlConfig.port || sqlConfig.sqlPort || '1433'),
      sqlDatabase: sqlConfig.database || sqlConfig.sqlDatabase || '',
      sqlUser: sqlConfig.user ?? sqlConfig.sqlUser ?? '',
      sqlPassword: sqlConfig.password ?? sqlConfig.sqlPassword ?? '',
    };
    const signature = signRelayPayload({
      timestamp,
      action,
      sqlConfig: normalizedCfg,
      query,
    });
    if (!signature) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 18000);

    try {
      const resp = await fetch(`${relayUrl}/api/internal/sql-relay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Relay-Timestamp': String(timestamp),
          'X-Relay-Signature': signature,
        },
        body: JSON.stringify({
          action,
          sqlConfig: normalizedCfg,
          query,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      // Tünel adresi kapandıysa (530 / 502 / 504 / 404) önbelleği sıfırlayıp güncel tünel URL'sini dene
      if (resp.status === 530 || resp.status === 502 || resp.status === 504 || resp.status === 404) {
        cachedEndpoint = null;
        continue;
      }

      const data = await resp.json().catch(() => null);
      if (!data) {
        cachedEndpoint = null;
        continue;
      }

      return data;
    } catch {
      clearTimeout(timer);
      cachedEndpoint = null;
    }
  }

  return null;
}

function findCloudflaredBinary() {
  const candidates = [
    process.env.CLOUDFLARED_PATH,
    'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
    'C:\\Program Files\\cloudflared\\cloudflared.exe',
  ].filter(Boolean);

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      // ignore
    }
  }
  return 'cloudflared';
}

export const sqlCloudRelay = {
  getActiveTunnelUrl() {
    return activeLocalTunnelUrl;
  },

  async remoteExecuteJsonQuery(cfg, query) {
    const res = await callRemoteRelay('jsonQuery', cfg, query);
    if (!res) return null;
    if (res.sqlError) {
      throw new Error(res.message || 'SQL sorgu hatası.');
    }
    if (res.success && Array.isArray(res.rows)) {
      return res.rows;
    }
    return null;
  },

  async remoteExecuteNonQuery(cfg, query) {
    const res = await callRemoteRelay('nonQuery', cfg, query);
    if (!res) return null;
    if (res.sqlError) {
      throw new Error(res.message || 'SQL yazma hatası.');
    }
    if (res.success && typeof res.rowsAffected === 'number') {
      return res.rowsAffected;
    }
    return null;
  },

  async remoteTestConnection(rawConfig) {
    const res = await callRemoteRelay('testConnection', rawConfig, '');
    if (!res) return null;
    if (res.result && typeof res.result.success === 'boolean') {
      return res.result;
    }
    return null;
  },

  async remotePrintThermal(payload) {
    const res = await callRemoteRelay('printThermal', {}, JSON.stringify(payload || {}));
    if (!res) return null;
    if (res.success && res.result) {
      return res.result;
    }
    return null;
  },

  startLocalCloudflareTunnel(localPort = 4000) {
    if (process.env.VERCEL || !process.env.BLOB_READ_WRITE_TOKEN) return;
    if (tunnelChild) return;

    const bin = findCloudflaredBinary();
    const spawnTunnel = () => {
      if (shuttingDown) return;
      activeLocalTunnelUrl = null;

      try {
        const child = spawn(
          bin,
          ['tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', `http://127.0.0.1:${localPort}`],
          {
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
          }
        );
        tunnelChild = child;

        const handleOutput = (chunk) => {
          const text = chunk.toString('utf8');
          const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
          if (match && match[0] && match[0] !== activeLocalTunnelUrl) {
            activeLocalTunnelUrl = match[0];
            publishRelayEndpoint(activeLocalTunnelUrl)
              .then(() => {
                console.log(`🌐🇹🇷 Canlı Türkiye SQL Tüneli Aktif ve Buluta Kaydedildi: ${activeLocalTunnelUrl}`);
              })
              .catch((err) => {
                console.warn('⚠️ Tünel adresi buluta yazılamadı:', err.message);
              });
          }
        };

        child.stdout?.on('data', handleOutput);
        child.stderr?.on('data', handleOutput);

        child.on('error', (err) => {
          console.warn('⚠️ cloudflared başlatılamadı:', err.message);
          tunnelChild = null;
        });

        child.on('exit', () => {
          tunnelChild = null;
          activeLocalTunnelUrl = null;
          if (!shuttingDown) {
            setTimeout(spawnTunnel, 4000);
          }
        });
      } catch (err) {
        console.warn('⚠️ cloudflared tünel hatası:', err.message);
      }
    };

    spawnTunnel();

    // 3 dakikada bir tünelin dışarıdan hala erişilebilir olduğunu doğrula; koptuysa otomatik yenile
    if (!watchdogTimer) {
      watchdogTimer = setInterval(async () => {
        if (!activeLocalTunnelUrl || !tunnelChild) return;
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 6000);
          const r = await fetch(`${activeLocalTunnelUrl}/api/health`, { signal: ctrl.signal });
          clearTimeout(t);
          if (!r.ok && r.status === 530) {
            console.warn('🔄 Türkiye SQL tüneli yenileniyor...');
            tunnelChild.kill();
          }
        } catch {
          // geçici ağ dalgalanması; üst üste koparsa cloudflared kendi yeniden bağlanır
        }
      }, 180000);
    }

    const cleanup = () => {
      shuttingDown = true;
      if (watchdogTimer) clearInterval(watchdogTimer);
      if (tunnelChild) {
        try {
          tunnelChild.kill();
        } catch {
          // ignore
        }
      }
    };

    process.once('SIGINT', cleanup);
    process.once('SIGTERM', cleanup);
    process.once('exit', cleanup);
  },
};
