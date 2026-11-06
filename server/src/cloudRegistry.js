import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { get, put } from '@vercel/blob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Yerel geliştirme ortamında .env.local içindeki BLOB_READ_WRITE_TOKEN'ı da yükle
if (!process.env.BLOB_READ_WRITE_TOKEN) {
  dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
}

const REGISTRY_BLOB_PATH = 'registry/master-v1.json';
const LOCAL_FALLBACK_FILE = path.resolve(__dirname, '../data/master-registry.json');

export const ADMIN_COMPANY_CODE = 'POLATLAR';
export const ADMIN_USERNAME = 'admin';
export const ADMIN_PASSWORD = '16051990Sa.';
export const LICENSE_EXPIRED_MESSAGE =
  'Lisans süreniz dolmuştur. Lütfen servis sağlayıcınız ile görüşünüz';

export function getTurkeyTodayIso() {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Istanbul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function isLicenseDateExpired(licenseExpireDate) {
  if (!licenseExpireDate) return false;
  const exp = String(licenseExpireDate).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(exp)) return false;
  return exp < getTurkeyTodayIso();
}

const makeAccountKey = (companyCode, repCode) =>
  `${String(companyCode || '').trim().toUpperCase()}::${String(repCode || '').trim().toUpperCase()}`;

function createEmptyStore() {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    profiles: [],
    accounts: [],
    deletedCompanies: {},
    deletedAccounts: {},
  };
}

function isPlaceholderProfile(p) {
  if (!p || !p.code) return true;
  const code = String(p.code).trim().toUpperCase();
  if (!code || code === ADMIN_COMPANY_CODE) return true;
  // Varsayılan yerel demo şablonlarını ("01" / "Ahmet Gıda" / "POLATLAR GIDA - Demo") gerçek müşteri olarak buluta taşıma
  const title = String(p.companyTitle || p.name || '').trim();
  const host = String(p.sqlHost || '').trim().toLowerCase();
  if (
    code === '01' &&
    (host === '' || host === 'localhost') &&
    (title.includes('Ahmet Gıda') || title.includes('Demo & Çevrimdışı'))
  ) {
    return true;
  }
  if (code === '02' && host === '78.189.45.12') {
    return true;
  }
  return false;
}

function normalizeProfile(p) {
  const code = String(p.code || '').trim().toUpperCase();
  const title = String(p.companyTitle || p.name || code).trim() || code;
  const serverUrl = p.serverUrl && p.serverUrl !== 'demo' ? '/api' : 'demo';
  return {
    id: `prof-${code}`,
    code,
    name: title,
    companyTitle: title,
    period: String(p.period || '2026').trim() || '2026',
    serverUrl,
    sqlHost: serverUrl === 'demo' ? '' : String(p.sqlHost || '').trim(),
    sqlPort: String(p.sqlPort || '1433').trim() || '1433',
    sqlDatabase: serverUrl === 'demo' ? '' : String(p.sqlDatabase || '').trim(),
    sqlUser: serverUrl === 'demo' ? '' : String(p.sqlUser || '').trim(),
    sqlPassword: serverUrl === 'demo' ? '' : String(p.sqlPassword ?? ''),
    licenseExpireDate: String(p.licenseExpireDate || '2027-12-31').trim() || '2027-12-31',
    isDefault: Boolean(p.isDefault),
    updatedAt: p.updatedAt || new Date().toISOString(),
  };
}

function normalizeAccount(a) {
  const companyCode = String(a.companyCode || '').trim().toUpperCase();
  const repCode = String(a.repCode || '').trim().toUpperCase();
  return {
    id: `acc-${companyCode}-${repCode}`,
    companyCode,
    repCode,
    firstName: String(a.firstName || '').trim(),
    lastName: String(a.lastName || '').trim(),
    password: String(a.password ?? ''),
    isDefaultSeed: false,
    updatedAt: a.updatedAt || new Date().toISOString(),
  };
}

function profileToServerConfig(profile) {
  return {
    apiUrl: profile.serverUrl && profile.serverUrl !== 'demo' ? '/api' : 'demo',
    companyCode: profile.code,
    period: profile.period || '2026',
    autoSync: true,
    companyTitle: profile.companyTitle || profile.name || profile.code,
    sqlHost: profile.sqlHost || '',
    sqlPort: profile.sqlPort || '1433',
    sqlDatabase: profile.sqlDatabase || '',
    sqlUser: profile.sqlUser || '',
    sqlPassword: profile.sqlPassword || '',
    licenseExpireDate: profile.licenseExpireDate || '2027-12-31',
  };
}

async function readRawStore() {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const res = await get(REGISTRY_BLOB_PATH, {
        access: 'private',
        useCache: false,
      });
      if (res && res.statusCode === 200 && res.stream) {
        const text = await new Response(res.stream).text();
        const parsed = JSON.parse(text);
        return {
          ...createEmptyStore(),
          ...parsed,
          profiles: Array.isArray(parsed?.profiles) ? parsed.profiles : [],
          accounts: Array.isArray(parsed?.accounts) ? parsed.accounts : [],
          deletedCompanies: parsed?.deletedCompanies || {},
          deletedAccounts: parsed?.deletedAccounts || {},
        };
      }
      return createEmptyStore();
    } catch (err) {
      // İlk kurulumda blob henüz yoksa boş mağaza döndür
      if (
        err?.name === 'BlobNotFoundError' ||
        String(err?.message || '').toLowerCase().includes('not found')
      ) {
        return createEmptyStore();
      }
      console.warn('⚠️ Bulut kayıt okuma uyarısı:', err.message);
      return createEmptyStore();
    }
  }

  // Yerel dosya yedeği (BLOB_READ_WRITE_TOKEN yoksa)
  try {
    const raw = await fs.readFile(LOCAL_FALLBACK_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      ...createEmptyStore(),
      ...parsed,
      profiles: Array.isArray(parsed?.profiles) ? parsed.profiles : [],
      accounts: Array.isArray(parsed?.accounts) ? parsed.accounts : [],
      deletedCompanies: parsed?.deletedCompanies || {},
      deletedAccounts: parsed?.deletedAccounts || {},
    };
  } catch {
    return createEmptyStore();
  }
}

async function writeRawStore(store) {
  const payload = {
    ...store,
    version: 1,
    updatedAt: new Date().toISOString(),
  };
  const body = JSON.stringify(payload, null, 2);

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    await put(REGISTRY_BLOB_PATH, body, {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 0,
      contentType: 'application/json',
    });
    return payload;
  }

  await fs.mkdir(path.dirname(LOCAL_FALLBACK_FILE), { recursive: true });
  await fs.writeFile(LOCAL_FALLBACK_FILE, body, 'utf8');
  return payload;
}

// Eşzamanlı yazmaları sıraya sok
let writeQueue = Promise.resolve();
function runSerialized(fn) {
  const next = writeQueue.then(fn, fn);
  writeQueue = next.catch(() => {});
  return next;
}

export function verifyAdminAuthHeader(req) {
  const raw = req.headers['x-admin-auth'];
  if (!raw || typeof raw !== 'string') return false;
  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf8');
    const [company, user, pass] = decoded.split(':');
    return (
      String(company || '').trim().toUpperCase() === ADMIN_COMPANY_CODE &&
      String(user || '').trim().toLowerCase() === ADMIN_USERNAME &&
      pass === ADMIN_PASSWORD
    );
  } catch {
    return false;
  }
}

export async function verifyFirmOrAdminAuth(req, targetCompanyCode) {
  if (verifyAdminAuthHeader(req)) return { authorized: true, isAdmin: true };

  const raw = req.headers['x-plasiyer-auth'];
  if (!raw || typeof raw !== 'string') return { authorized: false };

  try {
    const jsonStr = Buffer.from(raw, 'base64').toString('utf8');
    const parsed = JSON.parse(jsonStr);
    const cCode = String(parsed?.companyCode || '').trim().toUpperCase();
    const rCode = String(parsed?.repCode || '').trim().toUpperCase();
    const pwd = String(parsed?.password ?? '');
    if (!cCode || !rCode || !pwd) return { authorized: false };
    if (targetCompanyCode && cCode !== String(targetCompanyCode).trim().toUpperCase()) {
      return { authorized: false };
    }

    const store = await readRawStore();
    const acc = store.accounts.find(
      (a) => a.companyCode === cCode && a.repCode === rCode && a.password === pwd
    );
    if (acc) return { authorized: true, isAdmin: false, companyCode: cCode };
  } catch {
    // ignore parse error
  }

  return { authorized: false };
}

export const cloudRegistry = {
  async getFullRegistry() {
    const store = await readRawStore();
    return {
      profiles: store.profiles,
      accounts: store.accounts,
      updatedAt: store.updatedAt,
    };
  },

  async syncFromAdmin({ profiles: incomingProfiles = [], accounts: incomingAccounts = [] }) {
    return runSerialized(async () => {
      const store = await readRawStore();
      let dirty = false;

      const profileMap = new Map();
      for (const p of store.profiles) {
        if (p?.code) profileMap.set(p.code.toUpperCase(), p);
      }

      for (const rawP of incomingProfiles) {
        if (isPlaceholderProfile(rawP)) continue;
        const norm = normalizeProfile(rawP);
        const deletedAt = store.deletedCompanies[norm.code];
        // Bulutta daha yeni bir silme kaydı varsa yerel eski kopyayı geri getirme
        if (deletedAt && (!rawP.updatedAt || deletedAt >= rawP.updatedAt)) {
          continue;
        }
        const existing = profileMap.get(norm.code);
        if (!existing) {
          profileMap.set(norm.code, norm);
          dirty = true;
        } else if (rawP.updatedAt && existing.updatedAt && rawP.updatedAt > existing.updatedAt) {
          profileMap.set(norm.code, norm);
          dirty = true;
        }
      }

      const accountMap = new Map();
      for (const a of store.accounts) {
        if (a?.companyCode && a?.repCode) {
          accountMap.set(makeAccountKey(a.companyCode, a.repCode), a);
        }
      }

      for (const rawA of incomingAccounts) {
        if (!rawA?.companyCode || !rawA?.repCode || !rawA?.password) continue;
        if (rawA.isDefaultSeed) continue;
        const cUpper = String(rawA.companyCode).trim().toUpperCase();
        if (cUpper === ADMIN_COMPANY_CODE) continue;

        const normA = normalizeAccount(rawA);
        const key = makeAccountKey(normA.companyCode, normA.repCode);
        const deletedAt = store.deletedAccounts[key];
        if (deletedAt && (!rawA.updatedAt || deletedAt >= rawA.updatedAt)) {
          continue;
        }
        const existing = accountMap.get(key);
        if (!existing) {
          accountMap.set(key, normA);
          dirty = true;
        } else if (rawA.updatedAt && existing.updatedAt && rawA.updatedAt > existing.updatedAt) {
          accountMap.set(key, normA);
          dirty = true;
        }
      }

      store.profiles = Array.from(profileMap.values());
      store.accounts = Array.from(accountMap.values());

      if (dirty) {
        await writeRawStore(store);
      }

      return {
        profiles: store.profiles,
        accounts: store.accounts,
        updatedAt: store.updatedAt,
      };
    });
  },

  async upsertCompany(rawProfile) {
    return runSerialized(async () => {
      const store = await readRawStore();
      const norm = normalizeProfile({ ...rawProfile, updatedAt: new Date().toISOString() });
      delete store.deletedCompanies[norm.code];

      const idx = store.profiles.findIndex((p) => p.code === norm.code);
      if (idx >= 0) {
        store.profiles[idx] = { ...store.profiles[idx], ...norm };
      } else {
        store.profiles.unshift(norm);
      }

      await writeRawStore(store);
      return { profile: norm, profiles: store.profiles };
    });
  },

  async deleteCompany(code) {
    return runSerialized(async () => {
      const store = await readRawStore();
      const target = String(code || '').trim().toUpperCase();
      const now = new Date().toISOString();
      store.deletedCompanies[target] = now;
      store.profiles = store.profiles.filter((p) => p.code !== target);
      await writeRawStore(store);
      return { profiles: store.profiles };
    });
  },

  async getAccountsByCompany(companyCode = '') {
    const store = await readRawStore();
    const target = String(companyCode || '').trim().toUpperCase();
    if (!target) return store.accounts;
    return store.accounts.filter((a) => a.companyCode === target);
  },

  async findCompanyServerConfig(companyCode) {
    const store = await readRawStore();
    const target = String(companyCode || '').trim().toUpperCase();
    const found = store.profiles.find((p) => p.code === target);
    return found ? profileToServerConfig(found) : null;
  },

  async upsertAccount(rawAccount) {
    return runSerialized(async () => {
      const store = await readRawStore();
      const norm = normalizeAccount({ ...rawAccount, updatedAt: new Date().toISOString() });
      const key = makeAccountKey(norm.companyCode, norm.repCode);
      delete store.deletedAccounts[key];

      const idx = store.accounts.findIndex(
        (a) => makeAccountKey(a.companyCode, a.repCode) === key
      );
      if (idx >= 0) {
        store.accounts[idx] = norm;
      } else {
        store.accounts.push(norm);
      }

      await writeRawStore(store);
      const companyProfile = store.profiles.find((p) => p.code === norm.companyCode);
      return {
        account: norm,
        accounts: store.accounts,
        matchedServerConfig: companyProfile ? profileToServerConfig(companyProfile) : null,
      };
    });
  },

  async deleteAccount(companyCode, repCode) {
    return runSerialized(async () => {
      const store = await readRawStore();
      const key = makeAccountKey(companyCode, repCode);
      store.deletedAccounts[key] = new Date().toISOString();
      store.accounts = store.accounts.filter(
        (a) => makeAccountKey(a.companyCode, a.repCode) !== key
      );
      await writeRawStore(store);
      return { accounts: store.accounts };
    });
  },

  async getCompanyLicenseStatus(companyCode) {
    const cCode = String(companyCode || '').trim().toUpperCase();
    if (!cCode || cCode === ADMIN_COMPANY_CODE) {
      return {
        foundCompany: true,
        companyCode: cCode,
        licenseExpired: false,
      };
    }
    const store = await readRawStore();
    const profile = store.profiles.find((p) => p.code === cCode);
    if (!profile) {
      return {
        foundCompany: false,
        companyCode: cCode,
        licenseExpired: false,
      };
    }
    const exp = String(profile.licenseExpireDate || '').trim();
    const expired = isLicenseDateExpired(exp);
    return {
      foundCompany: true,
      companyCode: cCode,
      licenseExpireDate: exp || undefined,
      licenseExpired: expired,
      error: expired ? LICENSE_EXPIRED_MESSAGE : undefined,
    };
  },

  async authenticateCentral({ companyCode, repCode, password }) {
    const store = await readRawStore();
    const cCode = String(companyCode || '').trim().toUpperCase();
    const rCode = String(repCode || '').trim().toUpperCase();
    const pwd = String(password ?? '');

    const profile = store.profiles.find((p) => p.code === cCode);
    const matchedServerConfig = profile ? profileToServerConfig(profile) : null;

    // Lisans bitiş kontrolü (Türkiye saat dilimi bazlı)
    if (isLicenseDateExpired(matchedServerConfig?.licenseExpireDate)) {
      return {
        foundCompany: true,
        foundAccount: false,
        authenticated: false,
        licenseExpired: true,
        licenseExpireDate: matchedServerConfig.licenseExpireDate.trim(),
        error: LICENSE_EXPIRED_MESSAGE,
      };
    }

    const acc = store.accounts.find(
      (a) => a.companyCode === cCode && a.repCode === rCode
    );

    if (acc) {
      if (acc.password === pwd) {
        return {
          foundCompany: Boolean(profile),
          foundAccount: true,
          authenticated: true,
          account: acc,
          matchedServerConfig,
        };
      }
      return {
        foundCompany: Boolean(profile),
        foundAccount: true,
        authenticated: false,
        matchedServerConfig,
        error: 'Giriş şifresi hatalı! Lütfen şifrenizi kontrol ediniz.',
      };
    }

    return {
      foundCompany: Boolean(profile),
      foundAccount: false,
      authenticated: false,
      matchedServerConfig,
    };
  },
};
