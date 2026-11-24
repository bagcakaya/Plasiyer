import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import dotenv from 'dotenv';
import { erpQueries } from './erpQueries.js';
import {
  testConnection,
  testDirectSqlConnection,
  executeJsonQuery,
  executeNonQuery,
  sqlContext,
  decodeSqlConfigToken,
  protectSqlConfigForClient,
  resolveIncomingSqlConfig,
} from './db.js';
import { imageService } from './imageService.js';
import { thermalPrintService } from './thermalPrintService.js';
import {
  cloudRegistry,
  verifyAdminAuthHeader,
  verifyFirmOrAdminAuth,
  issueSessionToken,
  verifySessionToken,
} from './cloudRegistry.js';
import { sqlCloudMirror } from './sqlCloudMirror.js';
import { sqlCloudRelay, verifyRelayRequest } from './sqlCloudRelay.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });
if (!process.env.BLOB_READ_WRITE_TOKEN) {
  dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
}

const app = express();
const PORT = process.env.PORT || 4000;

app.use(compression());
app.use(cors());

// Chrome Private Network Access (PNA), CORS & HTTP Güvenlik Başlıkları
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Brute-Force (Kaba Kuvvet) Giriş & SQL Test Hız Sınırlayıcı (5 dakikada maks 15 başarısız deneme)
const authRateLimitMap = new Map();
const AUTH_WINDOW_MS = 5 * 60 * 1000;
const AUTH_MAX_FAILURES = 15;

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

function getRateLimitKey(req, suffix = '') {
  return `${getClientIp(req)}::${String(suffix || '').trim().toUpperCase()}`;
}

function isRateLimited(req, suffix = '') {
  const key = getRateLimitKey(req, suffix);
  const entry = authRateLimitMap.get(key);
  if (!entry) return false;
  if (Date.now() - entry.firstAt > AUTH_WINDOW_MS) {
    authRateLimitMap.delete(key);
    return false;
  }
  return entry.count >= AUTH_MAX_FAILURES;
}

function recordAuthFailure(req, suffix = '') {
  const key = getRateLimitKey(req, suffix);
  const now = Date.now();
  const entry = authRateLimitMap.get(key);
  if (!entry || now - entry.firstAt > AUTH_WINDOW_MS) {
    authRateLimitMap.set(key, { count: 1, firstAt: now });
  } else {
    entry.count += 1;
  }
}

function clearAuthFailures(req, suffix = '') {
  authRateLimitMap.delete(getRateLimitKey(req, suffix));
}

// Bulut (Vercel) SSRF Koruması: Özel/İç Ağ IP Aralıklarını Engelle
function isBlockedCloudSsrfHost(rawHost) {
  if (!process.env.VERCEL) return false;
  const host = String(rawHost || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .split(/[:/,\\]/)[0];
  if (!host) return true;
  if (
    host === 'localhost' ||
    host === '::1' ||
    host === '0.0.0.0' ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return true;
  }
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [, a, b] = ipv4.map(Number);
    if (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 192 && b === 168) ||
      (a === 172 && b >= 16 && b <= 31)
    ) {
      return true;
    }
  }
  return false;
}

// Yazma ve okuma uç noktaları için kriptografik oturum / SQL bağlamı doğrulayıcı
async function hasValidWriteAuthorization(req) {
  if (!process.env.VERCEL) return true; // Yerel köprü (localhost:4000) kendi makinesinde çalışır
  if (verifyAdminAuthHeader(req)) return true;
  const tokenHeader =
    req.headers['x-auth-token'] ||
    (typeof req.headers.authorization === 'string' && req.headers.authorization.startsWith('Bearer ')
      ? req.headers.authorization.slice(7).trim()
      : '');
  if (tokenHeader && verifySessionToken(String(tokenHeader))) return true;

  const activeSql = sqlContext.getStore();
  // Sunucu tarafından AES-256-GCM ile imzalanmış geçerli bir 'enc:...' token'ı çözüldüyse doğrulanmıştır
  if (activeSql && activeSql._verifiedToken && activeSql.sqlHost && activeSql.sqlPassword) {
    return true;
  }

  // X-Plasiyer-Auth başlığı varsa gerçekten kayıtlı kullanıcı mı kontrol et
  if (req.headers['x-plasiyer-auth']) {
    const firmAuth = await verifyFirmOrAdminAuth(req);
    if (firmAuth.authorized) return true;
  }

  // Geriye dönük uyumluluk: Eski istemciden açık metin X-SQL-Config geldiyse kayıtlı bir firmaya ait olup olmadığını doğrula
  if (activeSql && activeSql.sqlHost && activeSql.sqlPassword) {
    try {
      const reg = await cloudRegistry.getFullRegistry();
      const matched = (reg?.profiles || []).some(
        (p) =>
          String(p.sqlHost || '').trim().toLowerCase() ===
            String(activeSql.sqlHost || '').trim().toLowerCase() &&
          String(p.sqlPassword || '') === String(activeSql.sqlPassword || '')
      );
      if (matched) return true;
    } catch {
      // ignore registry error
    }
  }

  return false;
}

app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true, limit: '12mb' }));

// Dinamik Çoklu Firma / Doğrudan SQL Server Bağlantı Bağlamı (X-SQL-Config Header, ?t= Token veya Firma Kodu)
app.use(async (req, res, next) => {
  const rawHeader = req.headers['x-sql-config'];
  let parsedSqlCfg = null;

  if (rawHeader && typeof rawHeader === 'string') {
    try {
      const jsonStr = Buffer.from(rawHeader, 'base64').toString('utf8');
      parsedSqlCfg = resolveIncomingSqlConfig(JSON.parse(jsonStr));
    } catch (err) {
      console.warn('X-SQL-Config çözümleme uyarısı:', err.message);
    }
  } else if (req.body && req.body.sqlConfig && typeof req.body.sqlConfig === 'object') {
    parsedSqlCfg = resolveIncomingSqlConfig(req.body.sqlConfig);
  } else if (req.query && typeof req.query.t === 'string' && req.query.t) {
    parsedSqlCfg = decodeSqlConfigToken(req.query.t);
  }

  // Eğer mobil cihazda SQL bilgisi eksik/eski kalmışsa ve geçerli bir firma kodu gönderildiyse merkezi kayıttan tamamla
  if (!parsedSqlCfg || !parsedSqlCfg.sqlHost || !parsedSqlCfg.sqlPassword) {
    const companyCode = String(
      parsedSqlCfg?.companyCode ||
        req.query?.company ||
        req.query?.companyCode ||
        req.body?.companyCode ||
        ''
    )
      .trim()
      .toUpperCase();
    if (companyCode && companyCode !== '01' && companyCode !== 'POLATLAR') {
      try {
        const regCfg = await cloudRegistry.findCompanyServerConfig(companyCode);
        if (regCfg && regCfg.sqlHost) {
          parsedSqlCfg = {
            ...regCfg,
            _verifiedToken: true,
          };
        }
      } catch {
        // ignore registry lookup error
      }
    }
  }

  if (parsedSqlCfg && parsedSqlCfg.sqlHost) {
    return sqlContext.run(parsedSqlCfg, () => next());
  }
  return next();
});

// Statik Görsel Dosya Sunumu (/uploads/products/...)
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));

// Canlı Bildirim SSE İstemci Havuzu (Firma Bazlı İzolasyonlu)
const sseClients = new Set();

function broadcastNotification(payload) {
  const activeCfg = sqlContext.getStore();
  const targetCompany = String(
    payload?.companyCode || activeCfg?.companyCode || ''
  )
    .trim()
    .toUpperCase();
  const dataString = `data: ${JSON.stringify(payload)}\n\n`;
  console.log(`📢 [SSE Broadcast] ${payload.title || payload.type}: ${payload.message || ''}`);

  sseClients.forEach((client) => {
    try {
      if (targetCompany && client.companyCode && client.companyCode !== targetCompany) {
        return;
      }
      client.res.write(dataString);
    } catch (e) {
      sseClients.delete(client);
    }
  });
}

// Sağlık ve Bağlantı Kontrolü (Ping)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'ERP12 Saha Satış Entegrasyon Servisi Aktif',
    time: new Date().toISOString(),
    connectedClients: sseClients.size,
    tunnelActive: Boolean(sqlCloudRelay.getActiveTunnelUrl()),
  });
});

// Termal Fiş Yazıcıya (1 Numaralı Yazıcı) Doğrudan Gönderim
app.post('/api/print/thermal', async (req, res) => {
  if (!(await hasValidWriteAuthorization(req))) {
    return res.status(401).json({
      success: false,
      message: 'Yetkisiz yazdırma isteği.',
    });
  }
  try {
    const payload = req.body || {};
    if (payload.dryRun) {
      return res.json({ success: true, dryRun: true, printerName: payload.printerName || '1' });
    }
    if (process.env.VERCEL) {
      const relayed = await sqlCloudRelay.remotePrintThermal(payload);
      if (relayed && relayed.success) {
        return res.json(relayed);
      }
      return res.status(503).json({
        success: false,
        message: '1 numaralı termal yazıcı servisine ulaşılamadı.',
      });
    }
    const result = await thermalPrintService.printReceipt(payload);
    return res.json(result);
  } catch (err) {
    console.error('Termal yazdırma hatası:', err.message);
    return res.status(500).json({
      success: false,
      message: err.message || '1 numaralı yazıcıya gönderilemedi.',
    });
  }
});

// Şifreli Bulut -> Türkiye Canlı SQL Tüneli (Yalnızca HMAC İmzalı Vercel Sunucu İsteklerini Kabul Eder)
app.post('/api/internal/sql-relay', async (req, res) => {
  if (process.env.VERCEL) {
    return res.status(404).json({ success: false, error: 'Not a relay node' });
  }
  const timestamp = req.headers['x-relay-timestamp'];
  const signature = req.headers['x-relay-signature'];
  const { action, sqlConfig, query } = req.body || {};

  if (!verifyRelayRequest({ timestamp, signature, action, sqlConfig, query: query || '' })) {
    return res.status(403).json({ success: false, error: 'Geçersiz tünel imzası' });
  }

  try {
    if (action === 'testConnection') {
      const result = await testDirectSqlConnection(sqlConfig || {});
      return res.json({ success: true, result });
    }
    if (action === 'jsonQuery') {
      const rows = await sqlContext.run(sqlConfig || {}, () => executeJsonQuery(query));
      return res.json({ success: true, rows });
    }
    if (action === 'nonQuery') {
      const rowsAffected = await sqlContext.run(sqlConfig || {}, () => executeNonQuery(query));
      return res.json({ success: true, rowsAffected });
    }
    if (action === 'printThermal') {
      const payload = JSON.parse(query || '{}');
      const result = await thermalPrintService.printReceipt(payload);
      return res.json({ success: true, result });
    }
    if (action === 'erpImage') {
      const params = JSON.parse(query || '{}');
      const img = await sqlContext.run(sqlConfig || {}, () =>
        erpQueries.getProductErpImage(
          params.idOrCode,
          params.code || '',
          params.idx || '',
          Number(params.w) || 240
        )
      );
      if (!img) {
        return res.json({ success: false, notFound: true });
      }
      if (img.buffer && sqlCloudMirror.isRemoteMirrorable(sqlConfig)) {
        sqlCloudMirror
          .saveProductImage(
            sqlConfig,
            img.stokId || params.idOrCode,
            img,
            params.code || img.productCode
          )
          .catch(() => {});
      }
      return res.json({
        success: true,
        image: {
          idx: img.idx,
          stokId: img.stokId,
          productCode: img.productCode,
          ext: img.ext || 'jpg',
          contentType: img.contentType || 'image/jpeg',
          base64: img.buffer ? img.buffer.toString('base64') : null,
          link: img.link || null,
        },
      });
    }
    return res.status(400).json({ success: false, error: 'Bilinmeyen işlem' });
  } catch (err) {
    return res.json({
      success: false,
      sqlError: true,
      message: err.message || 'SQL sorgu hatası',
    });
  }
});

// Doğrudan SQL Server Bağlantı Testi (Ayarlar -> SQL Bağlantısını Canlı Test Et)
app.post('/api/sql/test', async (req, res) => {
  try {
    const rawCfg = (req.body && req.body.sqlHost) ? req.body : (sqlContext.getStore() || req.body || {});
    const cfg = resolveIncomingSqlConfig(rawCfg);

    if (isRateLimited(req, 'SQL_TEST')) {
      return res.status(429).json({
        success: false,
        message: 'Çok fazla bağlantı denemesi yapıldı. Lütfen birkaç dakika sonra tekrar deneyiniz.',
      });
    }

    if (isBlockedCloudSsrfHost(cfg.sqlHost)) {
      return res.status(400).json({
        success: false,
        message: 'Bulut üzerinden yerel/özel ağ IP adreslerine (localhost / 192.168.x / 10.x) doğrudan bağlantı yapılamaz. Lütfen dış statik IP adresinizi giriniz.',
      });
    }

    const result = await testDirectSqlConnection(cfg);
    if (!result?.success) {
      recordAuthFailure(req, 'SQL_TEST');
    } else {
      clearAuthFailures(req, 'SQL_TEST');
    }

    if (result?.success) {
      try {
        const [companyInfo, erpPlasiyers] = await sqlContext.run(cfg, () =>
          Promise.all([
            erpQueries.getCompanyInfo().catch(() => null),
            erpQueries.getErpNativePlasiyers(cfg.companyCode || '').catch(() => []),
          ])
        );
        if (companyInfo) {
          result.companyInfo = companyInfo;
          if (sqlCloudMirror.isRemoteMirrorable(cfg)) {
            sqlCloudMirror.saveCompanyInfo(cfg, companyInfo).catch(() => {});
          }
        }
        if (Array.isArray(erpPlasiyers)) {
          result.erpPlasiyers = erpPlasiyers;
          const cleanFirmCode = String(cfg.companyCode || '').trim().toUpperCase();
          if (cleanFirmCode && cleanFirmCode !== '01' && cleanFirmCode !== 'POLATLAR') {
            await cloudRegistry.syncCompanyErpPlasiyers(cleanFirmCode, erpPlasiyers).catch(() => {});
          }
        }
      } catch {
        // ignore optional companyInfo/plasiyer fetch error during test
      }
    }

    if (result?.success && sqlCloudMirror.isRemoteMirrorable(cfg)) {
      sqlCloudMirror.saveStatus(cfg, result).catch(() => {});
      if (!process.env.VERCEL) {
        // Türkiye köprüsü üzerinden başarılı test sonrası bulut aynasını da arka planda güncelle
        sqlContext.run(cfg, async () => {
          try {
            const [custs, prods, groups, compInfo] = await Promise.all([
              erpQueries.getCustomers(),
              erpQueries.getProducts(),
              erpQueries.getStockGroups().catch(() => []),
              erpQueries.getCompanyInfo().catch(() => null),
            ]);
            await Promise.all([
              sqlCloudMirror.saveCustomers(cfg, custs),
              sqlCloudMirror.saveProducts(cfg, prods),
              sqlCloudMirror.saveStockGroups(cfg, groups),
              compInfo ? sqlCloudMirror.saveCompanyInfo(cfg, compInfo) : Promise.resolve(),
            ]);
          } catch {
            // ignore background mirror error
          }
        });
      }
      return res.json(result);
    }

    // Buluttan (Vercel) doğrudan TCP GeoIP engeline takıldıysa Türkiye Bulut Köprüsü aynasını kontrol et
    if (!result?.success && sqlCloudMirror.isRemoteMirrorable(cfg)) {
      const mirrored = await sqlCloudMirror.verifyAndGetStatus(cfg);
      if (mirrored) {
        const mirroredCompanyInfo = await sqlCloudMirror.getCompanyInfo(cfg).catch(() => null);
        return res.json({
          success: true,
          bridged: true,
          dbName: mirrored.dbName,
          tableCount: mirrored.tableCount,
          hasErpTables: mirrored.hasErpTables,
          companyInfo: mirroredCompanyInfo || undefined,
          message: `${mirrored.originalMessage} (Bulut Köprüsü Aktif)`,
        });
      }
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message || 'SQL bağlantı testi sırasında sunucu hatası oluştu.',
    });
  }
});

// 0.1 DÜZENLEYEN FİRMA SABİTLERİ GETİR (ERP12 FIRMASABITLERI / RAP_FIRMASABITLERI)
app.get('/api/company-info', async (req, res) => {
  if (!(await hasValidWriteAuthorization(req))) {
    return res.status(401).json({ error: 'Yetkisiz erişim' });
  }
  const activeCfg = sqlContext.getStore();
  try {
    const info = await erpQueries.getCompanyInfo();
    if (sqlCloudMirror.isRemoteMirrorable(activeCfg)) {
      sqlCloudMirror.saveCompanyInfo(activeCfg, info).catch(() => {});
    }
    res.json(info);
  } catch (err) {
    if (sqlCloudMirror.isRemoteMirrorable(activeCfg)) {
      const mirroredInfo = await sqlCloudMirror.getCompanyInfo(activeCfg);
      if (mirroredInfo) {
        return res.json(mirroredInfo);
      }
    }
    res.status(500).json({ error: 'Firma bilgileri alınamadı', detail: err.message });
  }
});

// 0. CANLI BİLDİRİM AKIŞI (Server-Sent Events - SSE)
app.get('/api/notifications/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders?.();

  const companyCode = String(req.query.company || req.query.companyCode || '')
    .trim()
    .toUpperCase();
  const client = { id: Date.now(), companyCode, res };
  sseClients.add(client);
  console.log(`🔌 Yeni bildirim abonesi bağlandı (Aktif abone sayısı: ${sseClients.size})`);

  // İlk bağlantı el sıkışması
  res.write(`data: ${JSON.stringify({
    type: 'connected',
    message: 'Canlı bildirim servisine başarıyla bağlandı.',
    timestamp: new Date().toISOString(),
  })}\n\n`);

  // Soket zaman aşımını önlemek için 25 saniyede bir heartbeat pingi
  const heartbeat = setInterval(() => {
    res.write(': ping\n\n');
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(client);
    console.log(`🔌 Bildirim abonesi ayrıldı (Kalan abone sayısı: ${sseClients.size})`);
  });
});

// 1. CARİ LİSTESİ VE BAKİYELERİ GETİR
app.get('/api/customers', async (req, res) => {
  if (!(await hasValidWriteAuthorization(req))) {
    return res.status(401).json({ error: 'Yetkisiz erişim' });
  }
  const start = Date.now();
  const activeCfg = sqlContext.getStore();
  try {
    const salesRepCode = req.query.rep;
    const customers = await erpQueries.getCustomers(salesRepCode);
    if (!process.env.VERCEL && !salesRepCode && sqlCloudMirror.isRemoteMirrorable(activeCfg)) {
      sqlCloudMirror.saveCustomers(activeCfg, customers).catch(() => {});
    }
    res.json(customers);
    console.log(`⚡ [API] GET /api/customers - ${customers.length} cari teslim edildi (${Date.now() - start}ms)`);
  } catch (err) {
    if (sqlCloudMirror.isRemoteMirrorable(activeCfg)) {
      const mirroredCustomers = await sqlCloudMirror.getCustomers(activeCfg, req.query.rep);
      if (mirroredCustomers) {
        console.log(`☁️ [Bulut Köprüsü] GET /api/customers - ${mirroredCustomers.length} cari teslim edildi`);
        return res.json(mirroredCustomers);
      }
    }
    console.error('Cari çekme hatası:', err.message);
    res.status(500).json({ error: 'Cariler alınamadı', detail: err.message });
  }
});

// 1.1 CARİ HESAP EKSTRESİ GETİR (CANLI ERP12 HAREKETLERİ)
app.get('/api/customers/:idOrCode/statement', async (req, res) => {
  if (!(await hasValidWriteAuthorization(req))) {
    return res.status(401).json({ error: 'Yetkisiz erişim' });
  }
  const activeCfg = sqlContext.getStore();
  try {
    const { idOrCode } = req.params;
    const { startDate, endDate } = req.query;
    console.log(`🔍 [Ekstre Talebi] idOrCode: ${idOrCode}`);
    const statement = await erpQueries.getCustomerStatement(idOrCode, startDate, endDate);
    console.log(`🔍 [Ekstre Sonuç] Cust: ${statement.customer?.name}, Moves: ${statement.movements?.length}`);
    if (!statement.customer) {
      return res.status(404).json({ error: 'Müşteri ERP12 sisteminde bulunamadı' });
    }
    res.json(statement);
  } catch (err) {
    if (sqlCloudMirror.isRemoteMirrorable(activeCfg)) {
      const mirrored = await sqlCloudMirror.getCustomers(activeCfg);
      const paramUpper = String(req.params.idOrCode || '').trim().toUpperCase();
      const found = mirrored?.find(
        (c) =>
          String(c.id).toUpperCase() === paramUpper ||
          String(c.code).toUpperCase() === paramUpper
      );
      if (found) {
        const bal = Number(found.balance || 0);
        return res.json({
          customer: {
            id: String(found.id),
            code: String(found.code),
            name: String(found.name),
            address: found.address || '',
            phone: found.phone || '',
            taxOffice: found.taxOffice || '',
            taxNumber: found.taxNumber || '',
            balance: bal,
          },
          movements: bal !== 0
            ? [
                {
                  id: `mirror-bal-${found.id}`,
                  date: new Date().toISOString().slice(0, 10),
                  time: '',
                  docNo: 'DEVİR-BAKİYE',
                  transactionType: 'Güncel Cari Bakiye (Bulut Aynası)',
                  description: 'ERP12 senkronize güncel bakiye özeti',
                  debit: bal > 0 ? bal : 0,
                  credit: bal < 0 ? Math.abs(bal) : 0,
                  balance: bal,
                },
              ]
            : [],
          summary: {
            totalDebit: bal > 0 ? bal : 0,
            totalCredit: bal < 0 ? Math.abs(bal) : 0,
            closingBalance: bal,
          },
        });
      }
    }
    console.error('Cari ekstre çekme hatası:', err.message);
    res.status(500).json({ error: 'Cari ekstre alınamadı', detail: err.message });
  }
});

// 1.2 CARİ GEÇMİŞ YILLAR DAHİL TÜM ÜRÜN VE İŞLEM DETAYLARI
app.get('/api/customers/:idOrCode/history', async (req, res) => {
  if (!(await hasValidWriteAuthorization(req))) {
    return res.status(401).json({ error: 'Yetkisiz erişim' });
  }
  const start = Date.now();
  const activeCfg = sqlContext.getStore();
  try {
    const { idOrCode } = req.params;
    const history = await erpQueries.getCustomerHistory(idOrCode);
    if (!history.customer) {
      return res.status(404).json({ error: 'Müşteri ERP12 sisteminde bulunamadı' });
    }
    console.log(`⚡ [API] GET /api/customers/${idOrCode}/history - ${history.items.length} ürün satırı, ${history.financials.length} finans hareketi (${Date.now() - start}ms)`);
    res.json(history);
  } catch (err) {
    if (sqlCloudMirror.isRemoteMirrorable(activeCfg)) {
      const mirrored = await sqlCloudMirror.getCustomers(activeCfg);
      const paramUpper = String(req.params.idOrCode || '').trim().toUpperCase();
      const found = mirrored?.find(
        (c) =>
          String(c.id).toUpperCase() === paramUpper ||
          String(c.code).toUpperCase() === paramUpper
      );
      if (found) {
        const bal = Number(found.balance || 0);
        const currentYear = new Date().getFullYear();
        return res.json({
          customer: {
            id: String(found.id),
            code: String(found.code),
            name: String(found.name),
            balance: bal,
          },
          years: [currentYear],
          items: [],
          financials:
            bal !== 0
              ? [
                  {
                    id: `mirror-fin-${found.id}`,
                    year: currentYear,
                    date: new Date().toISOString().slice(0, 10),
                    time: '',
                    docNo: 'GÜNCEL-BAKİYE',
                    transactionType: 'Cari Bakiye Özeti',
                    description: 'ERP12 senkronize güncel cari bakiye',
                    debit: bal > 0 ? bal : 0,
                    credit: bal < 0 ? Math.abs(bal) : 0,
                  },
                ]
              : [],
        });
      }
    }
    console.error('Cari geçmiş detayları hatası:', err.message);
    res.status(500).json({ error: 'Cari işlem geçmişi alınamadı', detail: err.message });
  }
});

// 2. STOK LİSTESİ VE GÜNCEL MEVCUTLARI GETİR
app.get('/api/products', async (req, res) => {
  if (!(await hasValidWriteAuthorization(req))) {
    return res.status(401).json({ error: 'Yetkisiz erişim' });
  }
  const start = Date.now();
  const activeCfg = sqlContext.getStore();
  try {
    const products = await erpQueries.getProducts();
    if (sqlCloudMirror.isRemoteMirrorable(activeCfg)) {
      sqlCloudMirror.saveProducts(activeCfg, products).catch(() => {});
    }
    res.json(products);
    console.log(`⚡ [API] GET /api/products - ${products.length} ürün teslim edildi (${Date.now() - start}ms)`);
  } catch (err) {
    if (sqlCloudMirror.isRemoteMirrorable(activeCfg)) {
      const mirroredProducts = await sqlCloudMirror.getProducts(activeCfg);
      if (mirroredProducts) {
        console.log(`☁️ [Bulut Köprüsü] GET /api/products - ${mirroredProducts.length} ürün teslim edildi`);
        return res.json(mirroredProducts);
      }
    }
    console.error('Stok çekme hatası:', err.message);
    res.status(500).json({ error: 'Stoklar alınamadı', detail: err.message });
  }
});

// 2.0.1 ERP12 RESIM TABLOSUNDAN ÜRÜN GÖRSELİ SUNUMU (PK_RESIM / R.IDX CLUSTERED SEEK + MOBİL KÜÇÜLTME İLE ~6-10 KB ANINDA TESLİM)
app.get('/api/products/erp-image/:idOrCode', async (req, res) => {
  const { idOrCode } = req.params;
  const code = String(req.query.code || '').trim();
  const idx = String(req.query.idx || '').trim();
  const reqWidth = Number(req.query.w) || 240;
  const dbQuery = String(req.query.db || '').trim().toUpperCase();

  let activeCfg = sqlContext.getStore();

  // Eğer <img> etiketi ile doğrudan çağrıldıysa ve t token yoksa, db adına veya firma kök adına göre bulut kayıt defterinden SQL bilgisini bul
  if ((!activeCfg || !activeCfg.sqlHost) && dbQuery) {
    try {
      const reg = await cloudRegistry.getFullRegistry();
      const profiles = reg?.profiles || [];
      const dbBasePrefix = dbQuery
        .replace(/[_-]?(20\d{2}|B\d+B|V\d+|\d+)$/i, '')
        .trim();

      const matchedProfile =
        profiles.find(
          (p) =>
            String(p.sqlDatabase || '').trim().toUpperCase() === dbQuery ||
            String(p.code || '').trim().toUpperCase() === dbQuery
        ) ||
        (dbBasePrefix.length >= 4
          ? profiles.find((p) => {
              const pDb = String(p.sqlDatabase || '').trim().toUpperCase();
              const pCode = String(p.code || '').trim().toUpperCase();
              return pDb.startsWith(dbBasePrefix) || pCode.startsWith(dbBasePrefix);
            })
          : null);

      if (matchedProfile && matchedProfile.sqlHost) {
        activeCfg = {
          sqlHost: matchedProfile.sqlHost,
          sqlPort: matchedProfile.sqlPort || '1433',
          sqlDatabase: matchedProfile.sqlDatabase || dbQuery,
          sqlUser: matchedProfile.sqlUser,
          sqlPassword: matchedProfile.sqlPassword,
        };
      }
    } catch {
      // ignore registry lookup error
    }
  }

  const sendImageBuffer = (imgObj) => {
    res.setHeader('Content-Type', imgObj.contentType || 'image/jpeg');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    res.setHeader(
      'Cache-Control',
      'public, max-age=31536000, s-maxage=31536000, stale-while-revalidate=86400, immutable'
    );
    return res.send(imgObj.buffer);
  };

  const runFetch = async () => {
    // 1. Bulut (Vercel) ortamında önce hızlı Bulut Aynasını ve Tek-Atım Sıkıştırılmış Tünel Köprüsünü kullan
    if (process.env.VERCEL && sqlCloudMirror.isRemoteMirrorable(activeCfg)) {
      try {
        const fastMirrored = await sqlCloudMirror.getProductImage(activeCfg, idOrCode, code);
        if (fastMirrored?.buffer) {
          return sendImageBuffer(fastMirrored);
        }
      } catch {
        // continue to fast image relay
      }

      try {
        const relayedImg = await sqlCloudRelay.remoteGetProductImage(activeCfg, {
          idOrCode,
          code,
          idx,
          w: reqWidth,
        });
        if (relayedImg?.buffer) {
          return sendImageBuffer(relayedImg);
        }
        if (relayedImg?.link && /^https?:\/\//i.test(relayedImg.link)) {
          return res.redirect(302, relayedImg.link);
        }
      } catch {
        // continue to fallback
      }
    }

    // 2. Canlı SQL Bellek Önbelleği (0ms) veya PK_RESIM Clustered Index Seek + Mobil Sıkıştırma (~25ms, ~6-10 KB)
    try {
      const img = await erpQueries.getProductErpImage(idOrCode, code, idx, reqWidth);
      if (img?.buffer) {
        if (sqlCloudMirror.isRemoteMirrorable(activeCfg)) {
          sqlCloudMirror
            .saveProductImage(activeCfg, img.stokId || idOrCode, img, code || img.productCode)
            .catch(() => {});
        }
        return sendImageBuffer(img);
      }
      if (img?.link && /^https?:\/\//i.test(img.link)) {
        return res.redirect(302, img.link);
      }
    } catch (sqlErr) {
      console.warn(`⚠️ Görsel okuma uyarısı (${idOrCode} / ${code}):`, sqlErr.message);
    }

    // 3. Yedek Bulut Aynası kontrolü
    if (!process.env.VERCEL && sqlCloudMirror.isRemoteMirrorable(activeCfg)) {
      try {
        const mirroredImg = await sqlCloudMirror.getProductImage(activeCfg, idOrCode, code);
        if (mirroredImg?.buffer) {
          return sendImageBuffer(mirroredImg);
        }
      } catch {
        // ignore mirror fallback error
      }
    }

    return res.status(404).end();
  };

  if (activeCfg && activeCfg.sqlHost && !sqlContext.getStore()) {
    return sqlContext.run(activeCfg, runFetch);
  }
  return runFetch();
});

// 2.1 STOK GRUPLARI LİSTESİ (STOK_GRUP)
app.get('/api/stock-groups', async (req, res) => {
  if (!(await hasValidWriteAuthorization(req))) {
    return res.status(401).json({ error: 'Yetkisiz erişim' });
  }
  const activeCfg = sqlContext.getStore();
  try {
    const groups = await erpQueries.getStockGroups();
    if (!process.env.VERCEL && sqlCloudMirror.isRemoteMirrorable(activeCfg)) {
      sqlCloudMirror.saveStockGroups(activeCfg, groups).catch(() => {});
    }
    res.json(groups);
  } catch (err) {
    if (sqlCloudMirror.isRemoteMirrorable(activeCfg)) {
      const mirroredGroups = await sqlCloudMirror.getStockGroups(activeCfg);
      if (mirroredGroups) {
        return res.json(mirroredGroups);
      }
    }
    console.error('Stok grupları hatası:', err.message);
    res.status(500).json({ error: 'Stok grupları alınamadı', detail: err.message });
  }
});

// 2.1 ÜRÜN FOTOĞRAFI YÜKLE / ÇEK & ERP12 İLE SENKRON ET
app.post('/api/products/:idOrCode/image', async (req, res) => {
  if (!(await hasValidWriteAuthorization(req))) {
    return res.status(401).json({ error: 'Yetkisiz işlem isteği' });
  }
  try {
    const { idOrCode } = req.params;
    const { image, code } = req.body;
    const targetCode = code || idOrCode;

    if (!image) {
      return res.status(400).json({ error: 'Görsel verisi (base64) zorunludur' });
    }

    const saveResult = await imageService.saveProductImage(targetCode, image);
    erpQueries.invalidateProductCache();

    broadcastNotification({
      id: 'notif-img-' + Date.now(),
      type: 'product_image_updated',
      title: '📸 Ürün Görseli Güncellendi',
      message: `${targetCode} kodlu ürünün fotoğrafı güncellendi ve ERP12 sistemine kaydedildi.`,
      productCode: targetCode,
      imageUrl: saveResult.imageUrl,
      timestamp: new Date().toISOString(),
    });

    res.json(saveResult);
  } catch (err) {
    console.error('Ürün fotoğrafı yükleme hatası:', err.message);
    res.status(500).json({ error: 'Fotoğraf kaydedilemedi', detail: err.message });
  }
});

// 2.2 ÜRÜN FOTOĞRAFINI SİL
app.delete('/api/products/:idOrCode/image', async (req, res) => {
  if (!(await hasValidWriteAuthorization(req))) {
    return res.status(401).json({ error: 'Yetkisiz işlem isteği' });
  }
  try {
    const { idOrCode } = req.params;
    const { code } = req.query;
    const targetCode = code || idOrCode;

    imageService.deleteProductImage(targetCode);
    erpQueries.invalidateProductCache();

    broadcastNotification({
      id: 'notif-img-del-' + Date.now(),
      type: 'product_image_deleted',
      title: '🗑️ Ürün Görseli Kaldırıldı',
      message: `${targetCode} kodlu ürünün fotoğrafı kaldırıldı.`,
      productCode: targetCode,
      timestamp: new Date().toISOString(),
    });

    res.json({ success: true, message: 'Görsel başarıyla silindi' });
  } catch (err) {
    console.error('Ürün fotoğrafı silme hatası:', err.message);
    res.status(500).json({ error: 'Fotoğraf silinemedi', detail: err.message });
  }
});

// 3.0 ERP12 SIPARIS TABLOSUNDAKİ SİPARİŞLERİ PLASİYER SİPARİŞ HAVUZUNA ÇEK
app.get('/api/orders', async (req, res) => {
  if (!(await hasValidWriteAuthorization(req))) {
    return res.status(401).json({ orders: [] });
  }
  try {
    const orders = await erpQueries.getOrders();
    res.json({ orders });
  } catch (err) {
    console.error('Sipariş listesi çekme hatası:', err.message);
    res.json({ orders: [] });
  }
});

// 3. MOBİLDEN GELEN SİPARİŞİ ERP12'YE KAYDET & CANLI BİLDİRİM GÖNDER
app.post('/api/orders', async (req, res) => {
  if (!(await hasValidWriteAuthorization(req))) {
    return res.status(401).json({ error: 'Yetkisiz sipariş isteği' });
  }
  try {
    const { companyCode, period, order } = req.body;
    const isDirectErpDoc =
      order?.documentType === 'receipt' || order?.documentType === 'invoice';
    if (
      !order ||
      (!order.customerCode && !isDirectErpDoc) ||
      !order.items ||
      order.items.length === 0
    ) {
      return res.status(400).json({ error: 'Geçersiz sipariş verisi' });
    }

    const result = await erpQueries.createOrder({ companyCode, period, order });
    const docLabel =
      order.documentType === 'receipt'
        ? 'Satış Fişi'
        : order.documentType === 'invoice'
        ? 'Satış Faturası'
        : 'Sipariş';
    console.log(`✅ Yeni ${docLabel} ERP12'ye Yazıldı: ${result.docNo} (Cari: ${order.customerCode})`);
    
    // Kampanya kazancı mesajı
    let campaignText = '';
    if (order.totalCampaignSavings && order.totalCampaignSavings > 0) {
      campaignText = ` (🎁 ${order.totalCampaignSavings.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺ Kampanya İndirimi)`;
    }

    // Tüm bağlı yetkili ve plasiyer ekranlarına anlık bildirim fırlat
    broadcastNotification({
      id: 'notif-order-' + Date.now(),
      type: 'new_order',
      title: `🔔 Yeni ${docLabel} Oluşturuldu!`,
      message: `${order.customerName || order.customerCode} için ${order.grandTotal?.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺ tutarında ${docLabel.toLowerCase()} sisteme düştü${campaignText}.`,
      orderDocNo: result.docNo,
      orderTempId: order.tempId,
      amount: order.grandTotal,
      customerName: order.customerName || order.customerCode,
      timestamp: new Date().toISOString(),
      read: false,
    });

    res.json({
      success: true,
      docNo: result.docNo,
      message: `${docLabel} ERP12 sistemine aktarıldı.`,
    });
  } catch (err) {
    const activeCfg = sqlContext.getStore();
    if (sqlCloudMirror.isRemoteMirrorable(activeCfg)) {
      const queued = await sqlCloudMirror.enqueueOutboxItem(activeCfg, {
        type: 'order',
        payload: req.body,
      });
      if (queued) {
        const tempDocNo =
          req.body?.order?.tempId || `BLT-${Date.now().toString().slice(-6)}`;
        return res.json({
          success: true,
          queuedForSqlBridge: true,
          docNo: tempDocNo,
          message: 'Sipariş bulut köprüsüne kaydedildi ve ERP12 SQL sunucusuna aktarılıyor.',
        });
      }
    }
    console.error('Sipariş kaydetme hatası:', err.message);
    res.status(500).json({ error: 'Sipariş ERP12 veritabanına yazılamadı', detail: err.message });
  }
});

// 4. MOBİLDEN GELEN TAHSİLATI ERP12'YE KAYDET & CANLI BİLDİRİM GÖNDER
app.post('/api/collections', async (req, res) => {
  if (!(await hasValidWriteAuthorization(req))) {
    return res.status(401).json({ error: 'Yetkisiz tahsilat isteği' });
  }
  try {
    const { companyCode, period, collection } = req.body;
    if (!collection || !collection.customerCode || !collection.amount || collection.amount <= 0) {
      return res.status(400).json({ error: 'Geçersiz tahsilat verisi (Cari veya tutar eksik)' });
    }

    const result = await erpQueries.createCollection({ companyCode, period, collection });
    console.log(`💵 Yeni Tahsilat ERP12'ye Yazıldı: ${result.docNo} (Cari: ${collection.customerCode}, Tutar: ${collection.amount} ₺, Yöntem: ${collection.paymentMethod})`);

    // Anlık bildirim yayınla
    const methodNames = {
      nakit: 'Nakit',
      kredi_karti: 'Kredi Kartı/POS',
      havale: 'Havale/EFT',
      cek: 'Müşteri Çeki',
    };
    broadcastNotification({
      id: 'notif-col-' + Date.now(),
      type: 'new_collection',
      title: '💵 Yeni Saha Tahsilatı!',
      message: `${collection.customerCode} carisinden ${collection.amount?.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺ tahsilat alındı (${methodNames[collection.paymentMethod] || collection.paymentMethod}).`,
      amount: collection.amount,
      customerName: collection.customerCode,
      timestamp: new Date().toISOString(),
      read: false,
    });

    res.json({
      success: true,
      docNo: result.docNo,
      message: 'Tahsilat ERP12 sistemine aktarıldı.',
    });
  } catch (err) {
    const activeCfg = sqlContext.getStore();
    if (sqlCloudMirror.isRemoteMirrorable(activeCfg)) {
      const queued = await sqlCloudMirror.enqueueOutboxItem(activeCfg, {
        type: 'collection',
        payload: req.body,
      });
      if (queued) {
        const tempDocNo =
          req.body?.collection?.receiptNo ||
          req.body?.collection?.tempId ||
          `THS-${Date.now().toString().slice(-6)}`;
        return res.json({
          success: true,
          queuedForSqlBridge: true,
          docNo: tempDocNo,
          message: 'Tahsilat bulut köprüsüne kaydedildi ve ERP12 SQL sunucusuna aktarılıyor.',
        });
      }
    }
    console.error('Tahsilat kaydetme hatası:', err.message);
    res.status(500).json({ error: 'Tahsilat ERP12 veritabanına yazılamadı', detail: err.message });
  }
});

// 4.1 ERP12 AKTİF BANKALAR VE POS KARTLARI (BANKA + BANKA_POS) LİSTESİ
app.get('/api/bank-pos-cards', async (req, res) => {
  if (!(await hasValidWriteAuthorization(req))) {
    return res.status(401).json({ posCards: [] });
  }
  try {
    const posCards = await erpQueries.getBankPosCards();
    res.json({ posCards });
  } catch (err) {
    console.error('Banka POS kartları çekme hatası:', err.message);
    res.json({ posCards: [] });
  }
});

// 5. SİPARİŞİ ERP12'DE ONAYLA & FATURALAŞTIRMA SEVKİ YAP
app.post('/api/orders/:docNo/invoice', async (req, res) => {
  if (!(await hasValidWriteAuthorization(req))) {
    return res.status(401).json({ error: 'Yetkisiz faturalaştırma isteği' });
  }
  try {
    const { docNo } = req.params;
    const { invoiceNo, notes } = req.body || {};

    const result = await erpQueries.invoiceOrder({ docNo, invoiceNo, notes });
    console.log(`📄 Sipariş ERP12'de Onaylandı & Faturalaştırıldı: ${docNo} (Fatura: ${result.invoiceNo})`);

    // Yetkililere bildirim fırlat
    broadcastNotification({
      id: 'notif-inv-' + Date.now(),
      type: 'order_invoiced',
      title: '📄 Sipariş Faturalaştırıldı',
      message: `${docNo} nolu sipariş ERP12 üzerinde onaylandı ve faturalandırıldı (${result.invoiceNo || 'Seri No Atandı'}).`,
      orderDocNo: docNo,
      timestamp: new Date().toISOString(),
      read: false,
    });

    res.json({
      success: true,
      docNo: result.docNo,
      invoiceNo: result.invoiceNo,
      message: 'Sipariş ERP12 üzerinde onaylandı ve faturaya sevk edildi.',
    });
  } catch (err) {
    console.error('Faturalaştırma hatası:', err.message);
    res.status(500).json({ error: 'Faturalaştırma işlemi yapılamadı', detail: err.message });
  }
});

// 6. MOBİLDEN GELEN İADE & DEĞİŞİM FİŞİNİ ERP12'YE KAYDET & CANLI BİLDİRİM GÖNDER
app.post('/api/returns', async (req, res) => {
  if (!(await hasValidWriteAuthorization(req))) {
    return res.status(401).json({ error: 'Yetkisiz iade isteği' });
  }
  try {
    const { companyCode, period, returnRecord } = req.body;
    if (!returnRecord || !returnRecord.customerCode || !returnRecord.grandTotal || returnRecord.grandTotal <= 0) {
      return res.status(400).json({ error: 'Geçersiz iade verisi (Cari veya iade tutarı eksik)' });
    }

    const result = await erpQueries.createReturn({ companyCode, period, returnRecord });
    console.log(`📦 Yeni İade Fişi ERP12'ye Yazıldı: ${result.docNo} (Cari: ${returnRecord.customerCode}, Tutar: ${returnRecord.grandTotal} ₺)`);

    // Yetkililere bildirim fırlat
    broadcastNotification({
      id: 'notif-ret-' + Date.now(),
      type: 'new_return',
      title: '📦 Yeni Saha İade Fişi!',
      message: `${returnRecord.customerName || returnRecord.customerCode} carisinden ${returnRecord.grandTotal?.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺ tutarında iade fişi kesildi.`,
      amount: returnRecord.grandTotal,
      customerName: returnRecord.customerName || returnRecord.customerCode,
      timestamp: new Date().toISOString(),
      read: false,
    });

    res.json({
      success: true,
      docNo: result.docNo,
      message: 'İade fişi ERP12 sistemine aktarıldı.',
    });
  } catch (err) {
    console.error('İade kaydetme hatası:', err.message);
    res.status(500).json({ error: 'İade fişi ERP12 veritabanına yazılamadı', detail: err.message });
  }
});

// 7. AKTİF KAMPANYALARI LİSTELE
app.get('/api/campaigns', (req, res) => {
  const campaigns = [
    {
      id: 'camp-1',
      code: 'CAMP-001',
      title: '10 Alana 1 Bedelsiz Çaykur!',
      description: '10 paket Çaykur Rize Turist Çay 1000g alımına 1 paket Bedelsiz hediye!',
      type: 'quantity_gift',
      targetProductCode: 'STK-001',
      targetProductName: 'Çaykur Rize Turist Çay 1000g',
      minQuantity: 10,
      rewardProductCode: 'STK-001',
      rewardProductName: 'Çaykur Rize Turist Çay 1000g',
      rewardQuantity: 1,
      badgeText: '10+1 Bedelsiz',
      badgeColor: 'bg-emerald-500',
      isActive: true,
    },
    {
      id: 'camp-2',
      code: 'CAMP-002',
      title: '5.000 ₺ Üzerine Anında %5 Ciro İndirimi',
      description: 'Sepet toplamı 5.000 ₺ ve üzeri olan tüm toptan siparişlerde fatura altı net %5 ekstra indirim uygulanır.',
      type: 'cart_threshold_discount',
      thresholdAmount: 5000,
      discountPercent: 5,
      badgeText: '%5 İndirim',
      badgeColor: 'bg-amber-500',
      isActive: true,
    },
    {
      id: 'camp-3',
      code: 'CAMP-003',
      title: '5 Koli Sıvı Yağ Alana 1 Koli Barilla Makarna Hediye',
      description: '5 koli Yudum Ayçiçek Yağı 5L siparişine 1 koli Barilla Burgu Makarna (500gx20) hediye!',
      type: 'cross_product_gift',
      targetProductCode: 'STK-002',
      targetProductName: 'Yudum Ayçiçek Yağı 5L',
      minQuantity: 5,
      rewardProductCode: 'STK-004',
      rewardProductName: 'Barilla Burgu Makarna 500g',
      rewardQuantity: 1,
      badgeText: 'Çapraz Promosyon',
      badgeColor: 'bg-indigo-500',
      isActive: true,
    },
  ];

  res.json({ success: true, campaigns });
});

// 7.B. ÇOKLU ARAÇ & ŞUBE (LOKASYON) LİSTESİ, LOKASYON STOKLARI VE YENİ ARAÇ/ŞUBE EKLEME
app.get('/api/locations', async (req, res) => {
  if (!(await hasValidWriteAuthorization(req))) {
    return res.status(401).json({ error: 'Yetkisiz erişim', locations: [] });
  }
  try {
    const companyCode = String(req.query.company || req.query.companyCode || '').trim().toUpperCase();
    let activeCtx = sqlContext.getStore();
    if ((!activeCtx || !activeCtx.sqlHost) && companyCode) {
      activeCtx = await cloudRegistry.findCompanyServerConfig(companyCode);
    }
    const locations =
      activeCtx && activeCtx.sqlHost
        ? await sqlContext.run(activeCtx, () => erpQueries.getLocations())
        : await erpQueries.getLocations();
    res.json({ success: true, locations });
  } catch (err) {
    console.warn('Lokasyon listesi çekme uyarısı:', err.message);
    res.status(500).json({ error: 'Lokasyon listesi alınamadı', detail: err.message });
  }
});

app.get('/api/locations/stocks', async (req, res) => {
  if (!(await hasValidWriteAuthorization(req))) {
    return res.status(401).json({ error: 'Yetkisiz erişim', stocks: [] });
  }
  try {
    const companyCode = String(req.query.company || req.query.companyCode || '').trim().toUpperCase();
    const locationParam = String(req.query.location || '').trim();
    let activeCtx = sqlContext.getStore();
    if ((!activeCtx || !activeCtx.sqlHost) && companyCode) {
      activeCtx = await cloudRegistry.findCompanyServerConfig(companyCode);
    }
    const stocks =
      activeCtx && activeCtx.sqlHost
        ? await sqlContext.run(activeCtx, () => erpQueries.getLocationStocks(locationParam))
        : await erpQueries.getLocationStocks(locationParam);
    res.json({ success: true, stocks });
  } catch (err) {
    console.warn('Lokasyon stokları çekme uyarısı:', err.message);
    res.status(500).json({ error: 'Lokasyon stokları alınamadı', detail: err.message });
  }
});

app.post('/api/locations', async (req, res) => {
  if (!(await hasValidWriteAuthorization(req))) {
    return res.status(401).json({ error: 'Yetkisiz lokasyon ekleme isteği' });
  }
  try {
    const companyCode = String(req.body?.companyCode || req.query.company || '').trim().toUpperCase();
    let activeCtx = sqlContext.getStore();
    if ((!activeCtx || !activeCtx.sqlHost) && companyCode) {
      activeCtx = await cloudRegistry.findCompanyServerConfig(companyCode);
    }
    const payload = {
      name: req.body?.name,
      type: req.body?.type,
      plate: req.body?.plate,
      address: req.body?.address,
      phone: req.body?.phone,
    };
    const location =
      activeCtx && activeCtx.sqlHost
        ? await sqlContext.run(activeCtx, () => erpQueries.createLocation(payload))
        : await erpQueries.createLocation(payload);
    res.json({ success: true, location });
  } catch (err) {
    console.error('Yeni lokasyon/araç/şube ekleme hatası:', err.message);
    res.status(500).json({ error: 'Araç veya şube ERP12 veritabanına eklenemedi', detail: err.message });
  }
});

// 8. PLASİYER & FİRMA YETKİLİSİ KULLANICI YÖNETİMİ VE GİRİŞ DOĞRULAMA
app.get('/api/plasiyers', async (req, res) => {
  try {
    const companyCode = String(req.query.companyCode || '').trim().toUpperCase();
    const authCheck = await verifyFirmOrAdminAuth(req, companyCode || undefined);

    if (!authCheck.authorized) {
      return res.json({ success: true, accounts: [] });
    }

    const targetCompany = authCheck.isAdmin ? companyCode : authCheck.companyCode;
    const companySqlCfg = targetCompany
      ? await cloudRegistry.findCompanyServerConfig(targetCompany)
      : sqlContext.getStore();

    try {
      const runCtx = companySqlCfg && companySqlCfg.sqlHost ? companySqlCfg : sqlContext.getStore();
      if (runCtx && runCtx.sqlHost && targetCompany) {
        const nativePlasiyers = await sqlContext.run(runCtx, () =>
          erpQueries.getErpNativePlasiyers(targetCompany)
        );
        if (Array.isArray(nativePlasiyers) && nativePlasiyers.length > 0) {
          await cloudRegistry.syncCompanyErpPlasiyers(targetCompany, nativePlasiyers);
        }
      }
    } catch {
      // ignore live SQL sync warning
    }

    const cloudAccounts = await cloudRegistry.getAccountsByCompany(targetCompany);

    let sqlAccounts = [];
    try {
      const runCtx = companySqlCfg && companySqlCfg.sqlHost ? companySqlCfg : sqlContext.getStore();
      sqlAccounts = runCtx && runCtx.sqlHost
        ? await sqlContext.run(runCtx, () => erpQueries.getPlasiyerAccounts(targetCompany))
        : await erpQueries.getPlasiyerAccounts(targetCompany);
    } catch {
      // SQL erişimi yoksa bulut kayıtlarıyla devam et
    }

    const mergedMap = new Map();
    for (const acc of [...sqlAccounts, ...cloudAccounts]) {
      if (!acc?.companyCode || !acc?.repCode) continue;
      const key = `${acc.companyCode.toUpperCase()}::${acc.repCode.toUpperCase()}`;
      const prev = mergedMap.get(key);
      mergedMap.set(key, {
        ...prev,
        ...acc,
        erpAssignedRegions: acc.erpAssignedRegions || prev?.erpAssignedRegions,
        erpAssignedStockGroups: acc.erpAssignedStockGroups || prev?.erpAssignedStockGroups,
        erpForbiddenStockGroups: acc.erpForbiddenStockGroups || prev?.erpForbiddenStockGroups,
        locationName: acc.locationName || prev?.locationName,
        viewAllRoutes: Boolean(acc.viewAllRoutes ?? prev?.viewAllRoutes),
        allowedRouteRegions: acc.allowedRouteRegions ?? prev?.allowedRouteRegions,
        viewAllStocks: Boolean(acc.viewAllStocks ?? prev?.viewAllStocks),
        allowedStockGroups: acc.allowedStockGroups ?? prev?.allowedStockGroups,
      });
    }

    const allMerged = Array.from(mergedMap.values());
    const visibleAccounts =
      authCheck.isAdmin || authCheck.isCompanyManager
        ? allMerged
        : allMerged.filter((a) => a.repCode.toUpperCase() === authCheck.repCode);

    res.json({ success: true, accounts: visibleAccounts });
  } catch (err) {
    res.json({ success: true, accounts: [], warning: err.message });
  }
});

// 8.1 FİRMANIN ERP12 PERSONEL TANITIM KARTI (*** -> PERSONEL NO & ŞİFRE) KAYITLARINI BULUTA EŞİTLE
async function syncAllCompaniesErpPlasiyers() {
  try {
    const reg = await cloudRegistry.getFullRegistry();
    for (const p of reg.profiles || []) {
      if (!p?.code || !p?.sqlHost || p.serverUrl === 'demo') continue;
      const cfg = {
        sqlHost: p.sqlHost,
        sqlPort: p.sqlPort || '1433',
        sqlDatabase: p.sqlDatabase,
        sqlUser: p.sqlUser || '',
        sqlPassword: p.sqlPassword || '',
      };
      try {
        const erpPlasiyers = await sqlContext.run(cfg, () =>
          erpQueries.getErpNativePlasiyers(p.code)
        );
        await cloudRegistry.syncCompanyErpPlasiyers(p.code, erpPlasiyers);
      } catch {
        // ignore single company SQL connection warning
      }
    }
  } catch {
    // ignore
  }
}

app.post('/api/plasiyers/sync-erp', async (req, res) => {
  try {
    const companyCode = String(req.body?.companyCode || req.query?.companyCode || '').trim().toUpperCase();
    const authCheck = await verifyFirmOrAdminAuth(req, companyCode);
    if (!authCheck.authorized || (!authCheck.isAdmin && !authCheck.isCompanyManager)) {
      return res.status(403).json({
        success: false,
        error: 'Bu işlem yalnızca Yetkili Kurum veya Firma Yetkilisi tarafından yapılabilir.',
      });
    }

    if (!companyCode) {
      await syncAllCompaniesErpPlasiyers();
      const full = await cloudRegistry.getFullRegistry();
      return res.json({ success: true, accounts: full.accounts, profiles: full.profiles });
    }

    const sqlCfg =
      (req.body?.sqlConfig && req.body.sqlConfig.sqlHost ? req.body.sqlConfig : null) ||
      (await cloudRegistry.findCompanyServerConfig(companyCode)) ||
      sqlContext.getStore();

    if (!sqlCfg || !sqlCfg.sqlHost || sqlCfg.apiUrl === 'demo') {
      return res.status(400).json({
        success: false,
        error: 'İlgili firma için canlı SQL bağlantısı tanımlı değil.',
      });
    }

    const erpPlasiyers = await sqlContext.run(sqlCfg, () =>
      erpQueries.getErpNativePlasiyers(companyCode)
    );
    const synced = await cloudRegistry.syncCompanyErpPlasiyers(companyCode, erpPlasiyers);
    return res.json({
      success: true,
      syncedCount: synced.syncedCount,
      erpPlasiyers,
      companyAccounts: synced.companyAccounts,
      accounts: synced.accounts,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || 'ERP12 Personel kartlarından plasiyerler çekilemedi.',
    });
  }
});

app.post('/api/plasiyers', async (req, res) => {
  try {
    const {
      companyCode,
      repCode,
      firstName,
      lastName,
      password,
      accountRole,
      viewAllRoutes,
      allowedRouteRegions,
      viewAllStocks,
      allowedStockGroups,
    } = req.body || {};
    if (!companyCode || !repCode || !password) {
      return res.status(400).json({
        success: false,
        error: 'Firma Kodu, Kullanıcı/Plasiyer Kodu ve Şifre zorunludur.',
      });
    }

    const authCheck = await verifyFirmOrAdminAuth(req, companyCode);
    if (!authCheck.authorized || (!authCheck.isAdmin && !authCheck.isCompanyManager)) {
      return res.status(403).json({
        success: false,
        error: 'Bu işlem yalnızca Yetkili Kurum veya Firma Yetkilisi tarafından yapılabilir.',
      });
    }

    const cleanRep = String(repCode).trim().toUpperCase();
    let effectiveRole;
    if (authCheck.isAdmin) {
      if (accountRole === 'manager' || accountRole === 'plasiyer') {
        effectiveRole = accountRole;
      }
    } else {
      // Firma yetkilisi kendi şifresini güncelliyorsa yetkisini koru; eklediği plasiyerler her zaman 'plasiyer' olur
      effectiveRole = cleanRep === authCheck.repCode ? 'manager' : 'plasiyer';
    }

    const regRes = await cloudRegistry.upsertAccount({
      companyCode,
      repCode,
      firstName: firstName || '',
      lastName: lastName || '',
      password,
      accountRole: effectiveRole,
      viewAllRoutes,
      allowedRouteRegions,
      viewAllStocks,
      allowedStockGroups,
    });
    const cloudSaved = regRes.account;

    let sqlSaved = null;
    try {
      const targetCompany = String(companyCode).trim().toUpperCase();
      const companySqlCfg =
        (await cloudRegistry.findCompanyServerConfig(targetCompany)) || sqlContext.getStore();
      const runSqlUpsert = () =>
        erpQueries.upsertPlasiyerAccount({
          companyCode,
          repCode,
          firstName: firstName || '',
          lastName: lastName || '',
          password,
          accountRole: cloudSaved?.accountRole || effectiveRole,
          viewAllRoutes: cloudSaved?.viewAllRoutes,
          allowedRouteRegions: cloudSaved?.allowedRouteRegions,
          viewAllStocks: cloudSaved?.viewAllStocks,
          allowedStockGroups: cloudSaved?.allowedStockGroups,
        });
      sqlSaved =
        companySqlCfg && companySqlCfg.sqlHost
          ? await sqlContext.run(companySqlCfg, runSqlUpsert)
          : await runSqlUpsert();
    } catch (sqlErr) {
      console.warn('Plasiyer SQL kayıt uyarısı:', sqlErr.message);
    }

    res.json({ success: true, account: cloudSaved || sqlSaved });
  } catch (err) {
    console.warn('Plasiyer kayıt uyarısı:', err.message);
    res.json({ success: false, warning: err.message });
  }
});

app.delete('/api/plasiyers', async (req, res) => {
  try {
    const companyCode = String(req.query.companyCode || req.body?.companyCode || '').trim();
    const repCode = String(req.query.repCode || req.body?.repCode || '').trim();
    if (!companyCode || !repCode) {
      return res.status(400).json({ success: false, error: 'Firma Kodu ve Kullanıcı Kodu gereklidir.' });
    }

    const authCheck = await verifyFirmOrAdminAuth(req, companyCode);
    if (!authCheck.authorized || (!authCheck.isAdmin && !authCheck.isCompanyManager)) {
      return res.status(403).json({
        success: false,
        error: 'Bu işlem yalnızca Yetkili Kurum veya Firma Yetkilisi tarafından yapılabilir.',
      });
    }

    if (!authCheck.isAdmin && repCode.toUpperCase() === authCheck.repCode) {
      return res.status(400).json({
        success: false,
        error: 'Firma yetkilisi kendi yönetici hesabını silemez.',
      });
    }

    await cloudRegistry.deleteAccount(companyCode, repCode);

    try {
      await erpQueries.deletePlasiyerAccount({ companyCode, repCode });
    } catch {
      // ignore SQL delete warning if offline/bridged
    }

    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, warning: err.message });
  }
});

app.post('/api/plasiyers/login', async (req, res) => {
  try {
    const { companyCode, repCode, password } = req.body || {};
    if (!companyCode || !repCode || !password) {
      return res.status(400).json({
        success: false,
        error: 'Lütfen Firma Kodu, Plasiyer Kodu ve Şifre alanlarını doldurunuz.',
      });
    }
    const rateKey = `LOGIN:${companyCode}:${repCode}`;
    if (isRateLimited(req, rateKey)) {
      return res.status(429).json({
        success: false,
        found: true,
        authenticated: false,
        error: 'Çok fazla başarısız giriş denemesi yapıldı. Lütfen 5 dakika sonra tekrar deneyiniz.',
      });
    }
    const lic = await cloudRegistry.getCompanyLicenseStatus(companyCode);
    if (lic.licenseExpired) {
      return res.json({
        success: true,
        found: true,
        authenticated: false,
        licenseExpired: true,
        licenseExpireDate: lic.licenseExpireDate,
        error: lic.error,
      });
    }
    const result = await erpQueries.authenticatePlasiyer({ companyCode, repCode, password });
    if (result?.authenticated && result?.account) {
      clearAuthFailures(req, rateKey);
      const authToken = issueSessionToken({
        role: 'plasiyer',
        companyCode,
        repCode: result.account.repCode || repCode,
        accountRole: result.account.accountRole || 'plasiyer',
      });
      return res.json({ success: true, ...result, authToken });
    }
    recordAuthFailure(req, rateKey);
    res.json({ success: true, ...result });
  } catch (err) {
    res.json({ success: false, found: false, authenticated: false, warning: err.message });
  }
});

// 9. MERKEZİ BULUT FİRMA & KULLANICI SENKRONİZASYONU (TÜM CİHAZLAR ARASI ORTAK KAYIT)
app.get('/api/registry', async (req, res) => {
  if (!verifyAdminAuthHeader(req)) {
    return res.status(401).json({ success: false, error: 'Yetkisiz erişim.' });
  }
  try {
    await syncAllCompaniesErpPlasiyers();
    const data = await cloudRegistry.getFullRegistry();
    res.json({
      success: true,
      ...data,
      profiles: (data.profiles || []).map((p) => protectSqlConfigForClient(p)),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/registry/sync', async (req, res) => {
  if (!verifyAdminAuthHeader(req)) {
    return res.status(401).json({ success: false, error: 'Yetkisiz erişim.' });
  }
  try {
    const { profiles, accounts } = req.body || {};
    await cloudRegistry.syncFromAdmin({
      profiles: Array.isArray(profiles) ? profiles : [],
      accounts: Array.isArray(accounts) ? accounts : [],
    });
    await syncAllCompaniesErpPlasiyers();
    const fresh = await cloudRegistry.getFullRegistry();
    res.json({
      success: true,
      ...fresh,
      profiles: (fresh.profiles || []).map((p) => protectSqlConfigForClient(p)),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/registry/companies', async (req, res) => {
  if (!verifyAdminAuthHeader(req)) {
    return res.status(401).json({ success: false, error: 'Yetkisiz erişim.' });
  }
  try {
    const profile = req.body?.profile || req.body;
    if (!profile?.code) {
      return res.status(400).json({ success: false, error: 'Firma Kodu zorunludur.' });
    }
    const saved = await cloudRegistry.upsertCompany(profile);
    let erpPlasiyers = [];
    let companyAccounts = [];
    let allAccounts = [];
    if (saved?.profile?.sqlHost && saved.profile.serverUrl !== 'demo') {
      try {
        const cfg = {
          sqlHost: saved.profile.sqlHost,
          sqlPort: saved.profile.sqlPort || '1433',
          sqlDatabase: saved.profile.sqlDatabase,
          sqlUser: saved.profile.sqlUser || '',
          sqlPassword: saved.profile.sqlPassword || '',
        };
        erpPlasiyers = await sqlContext.run(cfg, () =>
          erpQueries.getErpNativePlasiyers(saved.profile.code)
        );
        const synced = await cloudRegistry.syncCompanyErpPlasiyers(
          saved.profile.code,
          erpPlasiyers
        );
        companyAccounts = synced.companyAccounts || [];
        allAccounts = synced.accounts || [];
      } catch (erpErr) {
        console.warn('Yeni firma ERP12 plasiyer eşitleme uyarısı:', erpErr.message);
      }
    }
    if (!process.env.VERCEL) {
      setTimeout(() => {
        syncRegisteredRemoteSqlMirrors(true).catch(() => {});
      }, 150);
    }
    res.json({
      success: true,
      ...saved,
      profile: saved?.profile ? protectSqlConfigForClient(saved.profile) : undefined,
      profiles: Array.isArray(saved?.profiles)
        ? saved.profiles.map((p) => protectSqlConfigForClient(p))
        : undefined,
      erpPlasiyers,
      companyAccounts,
      accounts: allAccounts.length > 0 ? allAccounts : undefined,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/registry/companies/:code', async (req, res) => {
  if (!verifyAdminAuthHeader(req)) {
    return res.status(401).json({ success: false, error: 'Yetkisiz erişim.' });
  }
  try {
    const result = await cloudRegistry.deleteCompany(req.params.code);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/registry/license-status', async (req, res) => {
  try {
    const companyCode = String(req.query.companyCode || '').trim();
    if (!companyCode) {
      return res.status(400).json({ success: false, error: 'Firma Kodu gereklidir.' });
    }
    const status = await cloudRegistry.getCompanyLicenseStatus(companyCode);
    const authCheck = await verifyFirmOrAdminAuth(req, companyCode);
    res.json({
      success: true,
      foundCompany: status.foundCompany,
      companyCode: status.companyCode,
      licenseExpireDate: status.licenseExpireDate,
      licenseExpired: status.licenseExpired,
      error: status.error,
      // SQL sunucu yapılandırmasını yalnızca doğrulanmış oturumlara döndür (anonim sorgularda gizle)
      matchedServerConfig:
        authCheck.authorized && status.matchedServerConfig
          ? protectSqlConfigForClient(status.matchedServerConfig)
          : undefined,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/registry/authenticate', async (req, res) => {
  try {
    const { companyCode, repCode, password } = req.body || {};
    if (!companyCode || !repCode || !password) {
      return res.status(400).json({
        success: false,
        error: 'Lütfen Firma Kodu, Kullanıcı / Plasiyer Kodu ve Şifre giriniz.',
      });
    }

    const rateKey = `AUTH:${companyCode}:${repCode}`;
    if (isRateLimited(req, rateKey)) {
      return res.status(429).json({
        success: false,
        found: true,
        authenticated: false,
        error: 'Çok fazla başarısız giriş denemesi yapıldı. Lütfen 5 dakika sonra tekrar deneyiniz.',
      });
    }

    const central = await cloudRegistry.authenticateCentral({ companyCode, repCode, password });

    if (central.licenseExpired) {
      return res.json({
        success: true,
        found: true,
        authenticated: false,
        licenseExpired: true,
        licenseExpireDate: central.licenseExpireDate,
        error: central.error,
      });
    }

    if (central.authenticated && central.isAdmin) {
      clearAuthFailures(req, rateKey);
      return res.json({
        success: true,
        found: true,
        authenticated: true,
        isAdmin: true,
        authToken: central.authToken,
        adminUser: central.adminUser,
      });
    }

    if (central.authenticated && central.account) {
      clearAuthFailures(req, rateKey);
      return res.json({
        success: true,
        found: true,
        authenticated: true,
        authToken: central.authToken,
        account: central.account,
        matchedServerConfig: protectSqlConfigForClient(central.matchedServerConfig),
      });
    }

    // Bulutta firma kayıtlıysa ve canlı SQL sunucusu tanımlıysa SQL üzerinden de doğrula
    const sqlCfg = central.matchedServerConfig;
    if (sqlCfg && sqlCfg.sqlHost && sqlCfg.apiUrl !== 'demo') {
      try {
        const sqlAuth = await sqlContext.run(sqlCfg, () =>
          erpQueries.authenticatePlasiyer({ companyCode, repCode, password })
        );
        if (sqlAuth?.authenticated && sqlAuth?.account) {
          clearAuthFailures(req, rateKey);
          const synced = await cloudRegistry.upsertAccount({
            companyCode: sqlAuth.account.companyCode || companyCode,
            repCode: sqlAuth.account.repCode || repCode,
            firstName: sqlAuth.account.firstName || '',
            lastName: sqlAuth.account.lastName || '',
            password,
            accountRole: sqlAuth.account.accountRole,
          });
          const authToken = issueSessionToken({
            role: 'plasiyer',
            companyCode: sqlAuth.account.companyCode || companyCode,
            repCode: sqlAuth.account.repCode || repCode,
            accountRole: sqlAuth.account.accountRole || 'plasiyer',
          });
          return res.json({
            success: true,
            found: true,
            authenticated: true,
            authToken,
            account: synced.account,
            matchedServerConfig: protectSqlConfigForClient(sqlCfg),
          });
        }
        if (sqlAuth?.found && !sqlAuth?.authenticated) {
          recordAuthFailure(req, rateKey);
          return res.json({
            success: true,
            found: true,
            authenticated: false,
            error: sqlAuth.error || 'Giriş şifresi hatalı! Lütfen şifrenizi kontrol ediniz.',
          });
        }
      } catch {
        // SQL sunucusuna buluttan ulaşılamadıysa bulut sonucunu döndür
      }
    }

    recordAuthFailure(req, rateKey);

    if (central.foundAccount && !central.authenticated) {
      return res.json({
        success: true,
        found: true,
        authenticated: false,
        error: central.error || 'Giriş şifresi hatalı! Lütfen şifrenizi kontrol ediniz.',
      });
    }

    return res.json({
      success: true,
      found: false,
      foundCompany: Boolean(central.foundCompany),
      authenticated: false,
    });
  } catch (err) {
    res.json({ success: false, found: false, authenticated: false, warning: err.message });
  }
});

// Türkiye yerel servisi aktifken kayıtlı uzak SQL firmalarının bulut aynasını ve bekleyen mobil sipariş kuyruğunu senkronize et
async function syncRegisteredRemoteSqlMirrors(includeCatalog = true) {
  try {
    const reg = await cloudRegistry.getFullRegistry();
    for (const p of reg.profiles || []) {
      if (!p?.sqlHost || p.serverUrl === 'demo') continue;
      const cfg = {
        sqlHost: p.sqlHost,
        sqlPort: p.sqlPort || '1433',
        sqlDatabase: p.sqlDatabase,
        sqlUser: p.sqlUser || '',
        sqlPassword: p.sqlPassword || '',
      };
      if (!sqlCloudMirror.isRemoteMirrorable(cfg)) continue;

      await sqlContext.run(cfg, async () => {
        // 1. Mobil cihazlardan gelen bekleyen sipariş/tahsilat kuyruğunu gerçek SQL'e yaz
        await sqlCloudMirror.drainOutbox(cfg, async (item) => {
          if (item.type === 'order' && item.payload?.order) {
            const r = await erpQueries.createOrder(item.payload);
            console.log(`☁️➡️🗄️ Bulut Kuyruğundan Sipariş SQL'e Yazıldı: ${r.docNo} (${p.code})`);
          } else if (item.type === 'collection' && item.payload?.collection) {
            const r = await erpQueries.createCollection(item.payload);
            console.log(`☁️➡️🗄️ Bulut Kuyruğundan Tahsilat SQL'e Yazıldı: ${r.docNo} (${p.code})`);
          }
        });

        // 2. Cari, Stok, ERP12 Personel/Plasiyer ve Durum aynasını güncelle
        try {
          const erpPlasiyers = await erpQueries.getErpNativePlasiyers(p.code);
          await cloudRegistry.syncCompanyErpPlasiyers(p.code, erpPlasiyers);
        } catch {
          // ignore plasiyer sync warning
        }

        if (includeCatalog) {
          const testRes = await testDirectSqlConnection(cfg);
          if (testRes?.success) {
            await sqlCloudMirror.saveStatus(cfg, testRes);
            const [custs, prods, groups] = await Promise.all([
              erpQueries.getCustomers(),
              erpQueries.getProducts(),
              erpQueries.getStockGroups().catch(() => []),
            ]);
            await Promise.all([
              sqlCloudMirror.saveCustomers(cfg, custs),
              sqlCloudMirror.saveProducts(cfg, prods),
              sqlCloudMirror.saveStockGroups(cfg, groups),
            ]);
            console.log(
              `☁️✅ [${p.code}] Bulut SQL Aynası Güncellendi: ${custs.length} cari, ${prods.length} stok`
            );

            // Kategori vitrin ikonlarını ve ilk sayfalardaki ürün görsellerini mobil boyutta (~6-10 KB) önbelleğe ve bulut aynasına hazırla
            const priorityProducts = [
              ...prods.filter((pr) => pr.stockQuantity > 0 && pr.image?.includes('erp-image')).slice(0, 60),
              ...prods.filter((pr) => pr.stockQuantity <= 0 && pr.image?.includes('erp-image')).slice(0, 40),
            ];
            for (const pr of priorityProducts) {
              try {
                const idxMatch = String(pr.image || '').match(/[?&]idx=(\d+)/);
                const parsedIdx = idxMatch ? idxMatch[1] : '';
                const img = await erpQueries.getProductErpImage(pr.id, pr.code, parsedIdx, 240);
                if (img?.buffer) {
                  await sqlCloudMirror.saveProductImage(cfg, pr.id, img, pr.code);
                }
              } catch {
                // ignore single image warm warning
              }
            }
          }
        }
      });
    }
  } catch (err) {
    console.warn('⚠️ Uzak SQL bulut aynası senkron uyarısı:', err.message);
  }
}

// Sunucuyu başlat (Vercel Serverless dışındaki ortamlarda dinle ve Masaüstü Web Uygulamasını sun)
if (!process.env.VERCEL) {
  const clientDistDir = path.resolve(__dirname, '../../client/dist');
  app.use(
    express.static(clientDistDir, {
      setHeaders: (res, filePath) => {
        if (
          filePath.endsWith('index.html') ||
          filePath.endsWith('sw.js') ||
          filePath.endsWith('version.json') ||
          filePath.endsWith('manifest.webmanifest')
        ) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
      },
    })
  );

  app.get(/^(?!\/api\/|\/uploads\/).*/, (req, res, next) => {
    const indexHtml = path.join(clientDistDir, 'index.html');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(indexHtml, (err) => {
      if (err) next();
    });
  });

  app.listen(PORT, async () => {
    console.log(`🚀 ERP12 Entegrasyon API Servisi http://localhost:${PORT} üzerinde çalışıyor.`);
    console.log(`📡 PWA uygulaması bu adrese bağlanacaktır.`);

    try {
      const ok = await testConnection();
      if (ok) {
        console.log('✅ OSMANLIGIDA veritabanı bağlantısı aktif ve hazır.');
      }
    } catch (err) {
      console.warn('⚠️ Veritabanı testi uyarısı:', err.message);
    }

    // 1. Canlı Türkiye SQL Tünelini başlat (Bulut / Mobil cihazların tüm canlı Ekstre, Rapor ve SQL sorgularını Türkiye IP'si üzerinden geçirir)
    sqlCloudRelay.startLocalCloudflareTunnel(PORT);

    // 2. Açılışta ve periyodik olarak uzak müşteri SQL veritabanlarını bulut yedek aynasıyla eşitle
    syncRegisteredRemoteSqlMirrors(true);
    setInterval(() => syncRegisteredRemoteSqlMirrors(false), 90000);
    setInterval(() => syncRegisteredRemoteSqlMirrors(true), 1800000);
  });
}

export default app;
