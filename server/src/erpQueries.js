import sharp from 'sharp';
import {
  executeJsonQuery,
  getActiveDbKey,
  getActiveSqlConfig,
  encodeSqlConfigToken,
} from './db.js';
import { imageService } from './imageService.js';

// Yüksek Performanslı Bellek İçi Önbellek (Çoklu Firma / DB Anahtarı İle İzole)
const memCache = {
  customers: new Map(),      // `${dbKey}::${rep}` -> { data, expiresAt }
  products: new Map(),       // `${dbKey}` -> { data, expiresAt }
  companyInfo: new Map(),    // `${dbKey}` -> { data, expiresAt }
  productImages: new Map(),  // `${dbKey}::${idOrCode}` -> { data, expiresAt }
  siblingDbs: new Map(),     // `${dbKey}` -> { data: string[], expiresAt }
  siblingImgMeta: new Map(), // `${hostPort}::${sibDb}` -> { byCode, byName, byId, expiresAt }
};

function extractDbBasePrefix(dbName = '') {
  const clean = String(dbName || '').trim().toUpperCase();
  if (!clean) return '';
  const stripped = clean
    .replace(/[_-]?(20\d{2}|B\d+B|V\d+|\d+)$/i, '')
    .trim();
  return stripped.length >= 3 ? stripped : clean.slice(0, Math.min(clean.length, 6));
}

export function normalizeRegionLabel(val = '') {
  return String(val || '')
    .trim()
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .toLocaleUpperCase('tr-TR');
}

export function extractCustomerRegionCode(code = '', groupName = '', rootName = '') {
  const cleanRoot = normalizeRegionLabel(rootName);
  if (cleanRoot) return cleanRoot;

  const cleanCode = normalizeRegionLabel(code);
  if (cleanCode) {
    // Örn: "ERZ-OLT-37" -> "ERZ-OLT", "KARS-20" -> "KARS", "ARTVİN-YUSUFELİ-04" -> "ARTVİN-YUSUFELİ"
    const match = cleanCode.match(/^(.+?)[-_ ]+\d+[A-Z]?$/);
    if (match && match[1]) {
      const prefix = normalizeRegionLabel(match[1].replace(/[-_ ]+$/, ''));
      if (
        prefix.length >= 2 &&
        !/^(CR|C|M|MUS|CARI|ALICI|SATICI|0+|120|320)$/i.test(prefix) &&
        !/^\d+$/.test(prefix)
      ) {
        return prefix;
      }
    }
  }

  const cleanGroup = normalizeRegionLabel(groupName);
  if (cleanGroup && !['GENEL', 'ALICI', 'SATICI', 'MÜŞTERİ', 'MUSTERI'].includes(cleanGroup)) {
    return cleanGroup;
  }

  return 'GENEL';
}

function parseJsonStringArray(raw) {
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x || '').trim()).filter(Boolean);
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((x) => String(x || '').trim()).filter(Boolean);
      }
    } catch {
      return raw
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    }
  }
  return undefined;
}

function getActiveHostKey() {
  const cfg = getActiveSqlConfig();
  if (!cfg) return 'DEFAULT_HOST';
  return `${cfg.server}:${cfg.port}`;
}

async function discoverSiblingErpDatabases() {
  const dbKey = getActiveDbKey();
  const now = Date.now();
  const cached = memCache.siblingDbs.get(dbKey);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const activeCfg = getActiveSqlConfig();
  const activeDb = String(activeCfg?.database || '').trim();
  const prefix = extractDbBasePrefix(activeDb);
  const safePrefix = prefix.replace(/'/g, "''").replace(/[^A-Z0-9_]/gi, '');

  let siblingNames = [];
  try {
    const dbs = await executeJsonQuery(`
      SELECT TOP 10 name
      FROM sys.databases WITH(NOLOCK)
      WHERE database_id > 4
        AND state = 0
        AND UPPER(name) <> UPPER(DB_NAME())
        ${safePrefix.length >= 3 ? `AND UPPER(name) LIKE '${safePrefix}%'` : ''}
      ORDER BY database_id DESC, name DESC
    `);
    siblingNames = (Array.isArray(dbs) ? dbs : [])
      .map((d) => String(d.name || '').trim())
      .filter((n) => /^[A-Za-z0-9_.-]+$/.test(n));
  } catch {
    siblingNames = [];
  }

  memCache.siblingDbs.set(dbKey, {
    data: siblingNames,
    expiresAt: now + 5 * 60 * 1000,
  });
  return siblingNames;
}

async function getSiblingImageMeta(sibDb = '') {
  const hostKey = getActiveHostKey();
  const activeCfg = getActiveSqlConfig();
  const targetDb = String(sibDb || activeCfg?.database || '').trim();
  const cacheKey = `${hostKey}::${(targetDb || 'ACTIVE').toUpperCase()}`;
  const now = Date.now();
  const cached = memCache.siblingImgMeta.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached;
  }

  const byCode = new Map();
  const byName = new Map();
  const byId = new Map();
  const dbPrefix = targetDb ? `[${targetDb}].dbo.` : '';

  try {
    // ÖNEMLİ: R.RESIM (LOB/747MB) kolonuna WHERE içinde dokunulmaz; sadece metadata okunur (~130ms)
    const rows = await executeJsonQuery(`
      SELECT
        S.ID AS stokId,
        LTRIM(RTRIM(ISNULL(S.KOD, ''))) AS code,
        LTRIM(RTRIM(ISNULL(S.AD, ''))) AS name,
        MIN(R.IDX) AS resimIdx,
        MAX(CASE WHEN R.LINK IS NOT NULL AND LTRIM(RTRIM(R.LINK)) <> '' THEN LTRIM(RTRIM(R.LINK)) ELSE NULL END) AS resimLink
      FROM ${dbPrefix}STOK S WITH(NOLOCK)
      JOIN ${dbPrefix}RESIM R WITH(NOLOCK) ON R.ID = S.ID
      GROUP BY S.ID, S.KOD, S.AD
    `);

    for (const r of Array.isArray(rows) ? rows : []) {
      const entry = {
        stokId: String(r.stokId || ''),
        resimIdx: r.resimIdx,
        resimLink: r.resimLink || null,
        sourceDb: targetDb,
      };
      const cUpper = String(r.code || '').trim().toUpperCase();
      const nUpper = String(r.name || '').trim().toUpperCase();
      const sId = String(r.stokId || '').trim();
      if (cUpper && !byCode.has(cUpper)) byCode.set(cUpper, entry);
      if (nUpper && !byName.has(nUpper)) byName.set(nUpper, entry);
      if (sId && !byId.has(sId)) byId.set(sId, entry);
    }
  } catch {
    // ignore sibling DB access error
  }

  const meta = { byCode, byName, byId, sourceDb: targetDb, expiresAt: now + 10 * 60 * 1000 };
  memCache.siblingImgMeta.set(cacheKey, meta);
  return meta;
}

function detectImageMimeType(buf, rawExt = 'jpg') {
  if (Buffer.isBuffer(buf) && buf.length >= 4) {
    if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
    if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return 'image/webp';
    if (buf[0] === 0x42 && buf[1] === 0x4d) return 'image/bmp';
  }
  const ext = String(rawExt || 'jpg').toLowerCase().replace(/^\./, '').trim();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'bmp') return 'image/bmp';
  return 'image/jpeg';
}

async function optimizeErpImageBuffer(buf, rawContentType = 'image/jpeg', maxWidth = 240) {
  if (!Buffer.isBuffer(buf) || buf.length === 0) {
    return { buffer: buf, contentType: rawContentType, ext: 'jpg' };
  }
  const targetDim = Math.min(Math.max(Number(maxWidth) || 240, 120), 640);
  // Zaten çok küçük bir JPEG ise (< 14 KB) ve küçük boyut isteniyorsa olduğu gibi bırak
  if (rawContentType === 'image/jpeg' && buf.length <= 14336 && targetDim >= 240) {
    return { buffer: buf, contentType: 'image/jpeg', ext: 'jpg' };
  }
  try {
    const compressed = await sharp(buf, { failOn: 'none' })
      .rotate()
      .resize({
        width: targetDim,
        height: targetDim,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .flatten({ background: '#ffffff' })
      .jpeg({
        quality: targetDim <= 280 ? 72 : 80,
        progressive: true,
        mozjpeg: true,
      })
      .toBuffer();
    if (compressed && compressed.length > 0 && compressed.length < buf.length) {
      return { buffer: compressed, contentType: 'image/jpeg', ext: 'jpg' };
    }
  } catch {
    // sharp sıkıştırma başarısız olursa orijinal veriyi döndür
  }
  return { buffer: buf, contentType: rawContentType, ext: 'jpg' };
}

export const erpQueries = {
  invalidateCustomerCache() {
    memCache.customers.clear();
  },

  invalidateProductCache() {
    memCache.products.clear();
  },

  // 0. AKTİF VERİTABANINDAKİ DÜZENLEYEN FİRMA BİLGİLERİ (FIRMASABITLERI / RAP_FIRMASABITLERI)
  async getCompanyInfo() {
    const dbKey = getActiveDbKey();
    const now = Date.now();
    const cached = memCache.companyInfo.get(dbKey);
    if (cached && cached.expiresAt > now) {
      return cached.data;
    }

    const clean = (val) => String(val ?? '').trim();
    let row = null;

    try {
      const rows = await executeJsonQuery(`
        SELECT TOP 1
          ISNULL(F.AD, '') AS legalName,
          ISNULL(F.TABELE_ADI, '') AS brandName,
          ISNULL(R.AD, '') AS reportName,
          ISNULL(F.ADRES, '') AS address,
          ISNULL(R.ILCE, '') AS district,
          ISNULL(R.SEHIR, '') AS city,
          ISNULL(F.TELEFON, '') AS phone,
          ISNULL(F.FAX, '') AS fax,
          ISNULL(F.VERGI_DAIRESI, '') AS taxOffice,
          ISNULL(F.VERGI_NUMARASI, '') AS taxNumber,
          ISNULL(F.MERSIS_NO, '') AS mersisNo,
          ISNULL(F.TICARI_SICILNO, '') AS tradeRegisterNo,
          ISNULL(F.EMAIL, '') AS email,
          ISNULL(F.WEB, '') AS web,
          DB_NAME() AS dbName
        FROM FIRMASABITLERI F WITH(NOLOCK)
        OUTER APPLY (
          SELECT TOP 1 AD, ILCE, SEHIR
          FROM RAP_FIRMASABITLERI WITH(NOLOCK)
        ) R
        ORDER BY F.ID ASC
      `);
      if (Array.isArray(rows) && rows.length > 0) {
        row = rows[0];
      }
    } catch {
      try {
        const fallbackRows = await executeJsonQuery(`
          SELECT TOP 1
            ISNULL(F.AD, '') AS legalName,
            ISNULL(F.TABELE_ADI, '') AS brandName,
            '' AS reportName,
            ISNULL(F.ADRES, '') AS address,
            '' AS district,
            '' AS city,
            ISNULL(F.TELEFON, '') AS phone,
            ISNULL(F.FAX, '') AS fax,
            ISNULL(F.VERGI_DAIRESI, '') AS taxOffice,
            ISNULL(F.VERGI_NUMARASI, '') AS taxNumber,
            ISNULL(F.MERSIS_NO, '') AS mersisNo,
            ISNULL(F.TICARI_SICILNO, '') AS tradeRegisterNo,
            ISNULL(F.EMAIL, '') AS email,
            ISNULL(F.WEB, '') AS web,
            DB_NAME() AS dbName
          FROM FIRMASABITLERI F WITH(NOLOCK)
          ORDER BY F.ID ASC
        `);
        if (Array.isArray(fallbackRows) && fallbackRows.length > 0) {
          row = fallbackRows[0];
        }
      } catch {
        const dbRows = await executeJsonQuery(`SELECT DB_NAME() AS dbName`);
        row = Array.isArray(dbRows) && dbRows[0] ? dbRows[0] : { dbName: '' };
      }
    }

    if (!row) {
      const dbRows = await executeJsonQuery(`SELECT DB_NAME() AS dbName`);
      row = Array.isArray(dbRows) && dbRows[0] ? dbRows[0] : { dbName: '' };
    }

    const dbName = clean(row.dbName);
    const brandName = clean(row.brandName) || clean(row.reportName) || clean(row.legalName) || dbName;
    const legalName = clean(row.legalName) || brandName || dbName;

    const info = {
      legalName,
      brandName,
      address: clean(row.address),
      district: clean(row.district),
      city: clean(row.city),
      phone: clean(row.phone),
      fax: clean(row.fax),
      taxOffice: clean(row.taxOffice),
      taxNumber: clean(row.taxNumber),
      mersisNo: clean(row.mersisNo),
      tradeRegisterNo: clean(row.tradeRegisterNo),
      email: clean(row.email),
      web: clean(row.web),
      dbName,
      updatedAt: new Date().toISOString(),
    };

    memCache.companyInfo.set(dbKey, {
      data: info,
      expiresAt: now + 5 * 60 * 1000,
    });

    return info;
  },

  // 1. CARİ HESAPLAR VE BAKİYELER (TÜM ERP12 VERİTABANLARI İLE UYUMLU)
  async getCustomers(salesRepCode) {
    const dbKey = getActiveDbKey();
    const cacheKey = `${dbKey}::ALL`;
    const now = Date.now();
    const cached = memCache.customers.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.data;
    }

    const queryWithBalanceView = `
      DECLARE @p1 bigint;
      SELECT TOP 1 @p1 = ID FROM STOK_FIYAT_AD WITH(NOLOCK) WHERE ID = 1016;
      IF @p1 IS NULL SELECT TOP 1 @p1 = ID FROM STOK_FIYAT_AD WITH(NOLOCK) ORDER BY ID ASC;

      DECLARE @p2 bigint;
      SELECT TOP 1 @p2 = ID FROM STOK_FIYAT_AD WITH(NOLOCK) WHERE ID = 3294504;
      IF @p2 IS NULL SELECT TOP 1 @p2 = ID FROM STOK_FIYAT_AD WITH(NOLOCK) WHERE ID <> ISNULL(@p1, -1) ORDER BY ID ASC;

      DECLARE @p3 bigint;
      SELECT TOP 1 @p3 = ID FROM STOK_FIYAT_AD WITH(NOLOCK) WHERE ID = 449803;
      IF @p3 IS NULL SELECT TOP 1 @p3 = ID FROM STOK_FIYAT_AD WITH(NOLOCK) WHERE ID NOT IN (ISNULL(@p1, -1), ISNULL(@p2, -1)) ORDER BY ID ASC;

      SELECT TOP 2500
        C.ID AS id,
        C.KOD AS code,
        C.AD AS name,
        ISNULL(A.ADRES, '') AS address,
        ISNULL(A.TELEFON_CEP, ISNULL(A.TELEFON, '')) AS phone,
        ISNULL(C.VERGI_DAIRESI, '') AS taxOffice,
        ISNULL(C.VERGI_NUMARASI, ISNULL(C.KIMLIK_NO, '')) AS taxNumber,
        ISNULL(CAST(C.TEMSILCI AS varchar(50)), '0') AS salesRepCode,
        ISNULL(CG.AD, '') AS groupName,
        ISNULL(CR_INFO.rootName, '') AS rootName,
        CASE 
          WHEN C.STOK_FIYAT_AD = @p2 THEN 2
          WHEN C.STOK_FIYAT_AD IN (@p3, 449802, 449803) THEN 3
          ELSE 1 
        END AS priceList,
        CASE
          WHEN ISNUMERIC(REPLACE(ISNULL(CAST(C.ISKONTO AS varchar(50)), ''), ',', '.')) = 1
           AND REPLACE(ISNULL(CAST(C.ISKONTO AS varchar(50)), ''), ',', '.') NOT IN ('.', '+', '-', '$')
          THEN CAST(REPLACE(CAST(C.ISKONTO AS varchar(50)), ',', '.') AS float)
          ELSE 0
        END AS specialDiscount,
        ISNULL(C.RISK, 0) AS riskLimit,
        ISNULL(B.BAKIYE, 0) AS balance
      FROM CARI C WITH(NOLOCK)
      LEFT JOIN CARI_BAKIYELER B WITH(NOLOCK) ON B.ID = C.ID
      LEFT JOIN CARI_ADRES A WITH(NOLOCK) ON A.CARI = C.ID AND A.VARSAYILAN = 1
      LEFT JOIN CARI_GRUP CG WITH(NOLOCK) ON CG.ID = C.CARI_GRUP
      OUTER APPLY (
        SELECT TOP 1 LTRIM(RTRIM(CR.AD)) AS rootName
        FROM CARI_ROOT_CARI CRC WITH(NOLOCK)
        INNER JOIN CARI_ROOT CR WITH(NOLOCK) ON CR.ID = CRC.CARI_ROOT
        WHERE CRC.CARI = C.ID AND LTRIM(RTRIM(ISNULL(CR.AD, ''))) <> ''
      ) CR_INFO
      WHERE C.AKTIF = 1 AND ISNULL(C.CARI_TUR, 1) <> 2
      ORDER BY C.AD ASC
    `;

    let rows;
    try {
      rows = await executeJsonQuery(queryWithBalanceView);
    } catch (err) {
      // CARI_BAKIYELER view veya opsiyonel tablo farklılığı varsa FINANS_DETAY üzerinden hesapla
      const fallbackQuery = `
        SELECT TOP 2500
          C.ID AS id,
          C.KOD AS code,
          C.AD AS name,
          '' AS address,
          '' AS phone,
          ISNULL(C.VERGI_DAIRESI, '') AS taxOffice,
          ISNULL(C.VERGI_NUMARASI, ISNULL(C.KIMLIK_NO, '')) AS taxNumber,
          ISNULL(CAST(C.TEMSILCI AS varchar(50)), '0') AS salesRepCode,
          '' AS groupName,
          '' AS rootName,
          1 AS priceList,
          CASE
            WHEN ISNUMERIC(REPLACE(ISNULL(CAST(C.ISKONTO AS varchar(50)), ''), ',', '.')) = 1
             AND REPLACE(ISNULL(CAST(C.ISKONTO AS varchar(50)), ''), ',', '.') NOT IN ('.', '+', '-', '$')
            THEN CAST(REPLACE(CAST(C.ISKONTO AS varchar(50)), ',', '.') AS float)
            ELSE 0
          END AS specialDiscount,
          ISNULL(C.RISK, 0) AS riskLimit,
          ISNULL(FB.BAKIYE, 0) AS balance
        FROM CARI C WITH(NOLOCK)
        LEFT JOIN (
          SELECT KART_ID, SUM(BORC - ALACAK) AS BAKIYE FROM (
            SELECT KART_BORCLU AS KART_ID, TUTAR AS BORC, CAST(0 AS float) AS ALACAK FROM FINANS_DETAY WITH(NOLOCK) WHERE KART_BORCLU IS NOT NULL
            UNION ALL
            SELECT KART_ALACAKLI AS KART_ID, CAST(0 AS float) AS BORC, TUTAR AS ALACAK FROM FINANS_DETAY WITH(NOLOCK) WHERE KART_ALACAKLI IS NOT NULL
          ) X GROUP BY KART_ID
        ) FB ON FB.KART_ID = C.ID
        WHERE C.AKTIF = 1 AND ISNULL(C.CARI_TUR, 1) <> 2
        ORDER BY C.AD ASC
      `;
      rows = await executeJsonQuery(fallbackQuery);
    }

    // Her carinin hangi plasiyer(ler) ile ilişkili olduğunu (CARI.TEMSILCI, CARI_ROOT_CARI, SIPARIS, FIS) hızlıca eşleştir
    const repByCariId = new Map();
    try {
      const repLinks = await executeJsonQuery(`
        SELECT DISTINCT X.cariId, CAST(CP.PERSONEL_NO AS varchar(50)) AS repCode
        FROM (
          SELECT C.ID AS cariId, C.TEMSILCI AS personelCariId
          FROM CARI C WITH(NOLOCK)
          WHERE C.AKTIF = 1 AND C.TEMSILCI IS NOT NULL AND C.TEMSILCI > 0
          UNION
          SELECT CRC.CARI AS cariId, CR.CARI AS personelCariId
          FROM CARI_ROOT_CARI CRC WITH(NOLOCK)
          INNER JOIN CARI_ROOT CR WITH(NOLOCK) ON CR.ID = CRC.CARI_ROOT
          WHERE CR.CARI IS NOT NULL AND CR.CARI > 0
          UNION
          SELECT S.CARI AS cariId, S.CARI_PERSONEL AS personelCariId
          FROM SIPARIS S WITH(NOLOCK)
          WHERE S.AKTIF = 1 AND S.CARI_PERSONEL IS NOT NULL AND S.CARI_PERSONEL > 0
          UNION
          SELECT F.CARI AS cariId, F.CARI_PERSONEL AS personelCariId
          FROM FIS F WITH(NOLOCK)
          WHERE F.AKTIF = 1 AND F.CARI_PERSONEL IS NOT NULL AND F.CARI_PERSONEL > 0
        ) X
        INNER JOIN CARI_PERSONEL CP WITH(NOLOCK) ON CP.CARI = X.personelCariId
        WHERE CP.PERSONEL_NO IS NOT NULL
      `);
      if (Array.isArray(repLinks)) {
        for (const rl of repLinks) {
          const cid = String(rl.cariId || '').trim();
          const rc = String(rl.repCode || '').trim().toUpperCase();
          if (!cid || !rc) continue;
          if (!repByCariId.has(cid)) repByCariId.set(cid, []);
          const arr = repByCariId.get(cid);
          if (!arr.includes(rc)) arr.push(rc);
        }
      }
    } catch {
      // Eski veya farklı şemalı veritabanlarında CARI_ROOT_CARI yoksa güvenli şekilde devam et
    }

    const result = rows.map((row) => {
      const rawDisc = Number(row.specialDiscount || 0);
      const safeDisc = rawDisc > 0 && rawDisc < 100 ? rawDisc : 0;
      const cid = String(row.id);
      const codeStr = String(row.code || '').trim();
      const regionCode = extractCustomerRegionCode(codeStr, row.groupName, row.rootName);
      const assignedRepCodes = repByCariId.get(cid) || [];
      return {
        id: cid,
        code: codeStr,
        name: String(row.name),
        city: 'Erzurum',
        district: regionCode && regionCode !== 'GENEL' ? regionCode : 'Merkez',
        regionCode,
        assignedRepCodes,
        address: String(row.address || ''),
        phone: String(row.phone || ''),
        taxOffice: String(row.taxOffice || ''),
        taxNumber: String(row.taxNumber || ''),
        salesRepCode: assignedRepCodes[0] || String(row.salesRepCode || ''),
        priceList: Number(row.priceList) || 1,
        specialDiscount: safeDisc,
        riskLimit: Number(row.riskLimit || 0),
        balance: Number(row.balance || 0),
      };
    });

    // 30 saniye süreyle bellekte sakla
    memCache.customers.set(cacheKey, { data: result, expiresAt: Date.now() + 30000 });
    return result;
  },

  // 2. STOK KARTLARI, BARKODLAR, FİYATLAR VE MEVCUTLAR (TÜM ERP12 VERİTABANLARI İLE UYUMLU)
  async getProducts() {
    const dbKey = getActiveDbKey();
    const now = Date.now();
    const cached = memCache.products.get(dbKey);
    if (cached && cached.expiresAt > now) {
      return cached.data;
    }

    const query = `
      DECLARE @p1 bigint;
      SELECT TOP 1 @p1 = ID FROM STOK_FIYAT_AD WITH(NOLOCK) WHERE ID = 1016;
      IF @p1 IS NULL SELECT TOP 1 @p1 = ID FROM STOK_FIYAT_AD WITH(NOLOCK) ORDER BY ID ASC;

      DECLARE @p2 bigint;
      SELECT TOP 1 @p2 = ID FROM STOK_FIYAT_AD WITH(NOLOCK) WHERE ID = 3294504;
      IF @p2 IS NULL SELECT TOP 1 @p2 = ID FROM STOK_FIYAT_AD WITH(NOLOCK) WHERE ID <> ISNULL(@p1, -1) ORDER BY ID ASC;

      DECLARE @p3 bigint;
      SELECT TOP 1 @p3 = ID FROM STOK_FIYAT_AD WITH(NOLOCK) WHERE ID = 449803;
      IF @p3 IS NULL SELECT TOP 1 @p3 = ID FROM STOK_FIYAT_AD WITH(NOLOCK) WHERE ID NOT IN (ISNULL(@p1, -1), ISNULL(@p2, -1)) ORDER BY ID ASC;

      SELECT TOP 10000
        S.ID AS id,
        S.KOD AS code,
        S.AD AS name,
        ISNULL(G.AD, 'Genel') AS category,
        COALESCE(
          NULLIF(LTRIM(RTRIM(GPP.AD)), ''),
          NULLIF(LTRIM(RTRIM(GP.AD)), ''),
          NULLIF(LTRIM(RTRIM(G.AD)), ''),
          'Genel'
        ) AS mainCategory,
        CASE
          WHEN GP.ID IS NOT NULL THEN LTRIM(RTRIM(ISNULL(G.AD, '')))
          ELSE ''
        END AS subCategory,
        ISNULL(SB.AD, 'ADET') AS unit,
        ISNULL(V.KDV_TOPTAN, 1) AS vatRate,
        ISNULL(B.BARKOD, S.KOD) AS barcode,
        COALESCE(F.FIYAT, F_ANY.FIYAT, 0) AS price1,
        COALESCE(F2.FIYAT, F.FIYAT, F_ANY.FIYAT, 0) AS price2,
        COALESCE(F3.FIYAT, F.FIYAT, F_ANY.FIYAT, 0) AS price3,
        ISNULL(M.MIKTAR, 0) AS stockQuantity,
        IMG.resimIdx AS resimIdx,
        IMG.resimLink AS erpImageLink
      FROM STOK S WITH(NOLOCK)
      LEFT JOIN STOK_GRUP G WITH(NOLOCK) ON G.ID = S.STOK_GRUP
      LEFT JOIN STOK_GRUP GP WITH(NOLOCK) ON GP.ID = G.USTID AND G.USTID IS NOT NULL AND G.USTID > 0 AND G.USTID <> G.ID
      LEFT JOIN STOK_GRUP GPP WITH(NOLOCK) ON GPP.ID = GP.USTID AND GP.USTID IS NOT NULL AND GP.USTID > 0 AND GP.USTID <> GP.ID
      LEFT JOIN STOK_VERGI V WITH(NOLOCK) ON V.ID = S.STOK_VERGI
      LEFT JOIN STOK_STOK_BIRIM SSB WITH(NOLOCK) ON SSB.STOK = S.ID AND SSB.VARSAYILAN = 1
      LEFT JOIN STOK_BIRIM SB WITH(NOLOCK) ON SB.ID = SSB.STOK_BIRIM
      LEFT JOIN (
        SELECT STOK_STOK_BIRIM, MIN(BARKOD) AS BARKOD 
        FROM STOK_BARKOD WITH(NOLOCK) 
        WHERE AKTIF = 1 
        GROUP BY STOK_STOK_BIRIM
      ) B ON B.STOK_STOK_BIRIM = SSB.ID
      LEFT JOIN STOK_VARSAYILAN_FIYAT F WITH(NOLOCK) ON F.STOK_STOK_BIRIM = SSB.ID AND F.STOK_FIYAT_AD = @p1
      LEFT JOIN STOK_VARSAYILAN_FIYAT F2 WITH(NOLOCK) ON F2.STOK_STOK_BIRIM = SSB.ID AND F2.STOK_FIYAT_AD = @p2
      LEFT JOIN STOK_VARSAYILAN_FIYAT F3 WITH(NOLOCK) ON F3.STOK_STOK_BIRIM = SSB.ID AND F3.STOK_FIYAT_AD = @p3
      LEFT JOIN (
        SELECT STOK_STOK_BIRIM, MAX(FIYAT) AS FIYAT
        FROM STOK_VARSAYILAN_FIYAT WITH(NOLOCK)
        GROUP BY STOK_STOK_BIRIM
      ) F_ANY ON F_ANY.STOK_STOK_BIRIM = SSB.ID
      LEFT JOIN (
        SELECT STOK, SUM(MIKTAR) AS MIKTAR FROM STOK_MIKTAR WITH(NOLOCK) GROUP BY STOK
      ) M ON M.STOK = S.ID
      LEFT JOIN (
        SELECT
          ID,
          MIN(IDX) AS resimIdx,
          MAX(CASE WHEN LINK IS NOT NULL AND LTRIM(RTRIM(LINK)) <> '' THEN LTRIM(RTRIM(LINK)) ELSE NULL END) AS resimLink
        FROM RESIM WITH(NOLOCK)
        GROUP BY ID
      ) IMG ON IMG.ID = S.ID
      WHERE S.AKTIF = 1
        AND ISNULL(G.AD, '') NOT LIKE '%MASRAF%'
      ORDER BY S.AD ASC
    `;

    let rows;
    try {
      rows = await executeJsonQuery(query);
    } catch (err) {
      const fallbackWithoutResimQuery = `
        DECLARE @p1 bigint;
        SELECT TOP 1 @p1 = ID FROM STOK_FIYAT_AD WITH(NOLOCK) WHERE ID = 1016;
        IF @p1 IS NULL SELECT TOP 1 @p1 = ID FROM STOK_FIYAT_AD WITH(NOLOCK) ORDER BY ID ASC;

        DECLARE @p2 bigint;
        SELECT TOP 1 @p2 = ID FROM STOK_FIYAT_AD WITH(NOLOCK) WHERE ID = 3294504;
        IF @p2 IS NULL SELECT TOP 1 @p2 = ID FROM STOK_FIYAT_AD WITH(NOLOCK) WHERE ID <> ISNULL(@p1, -1) ORDER BY ID ASC;

        DECLARE @p3 bigint;
        SELECT TOP 1 @p3 = ID FROM STOK_FIYAT_AD WITH(NOLOCK) WHERE ID = 449803;
        IF @p3 IS NULL SELECT TOP 1 @p3 = ID FROM STOK_FIYAT_AD WITH(NOLOCK) WHERE ID NOT IN (ISNULL(@p1, -1), ISNULL(@p2, -1)) ORDER BY ID ASC;

        SELECT TOP 10000
          S.ID AS id,
          S.KOD AS code,
          S.AD AS name,
          ISNULL(G.AD, 'Genel') AS category,
          ISNULL(SB.AD, 'ADET') AS unit,
          ISNULL(V.KDV_TOPTAN, 1) AS vatRate,
          ISNULL(B.BARKOD, S.KOD) AS barcode,
          COALESCE(F.FIYAT, F_ANY.FIYAT, 0) AS price1,
          COALESCE(F2.FIYAT, F.FIYAT, F_ANY.FIYAT, 0) AS price2,
          COALESCE(F3.FIYAT, F.FIYAT, F_ANY.FIYAT, 0) AS price3,
          ISNULL(M.MIKTAR, 0) AS stockQuantity
        FROM STOK S WITH(NOLOCK)
        LEFT JOIN STOK_GRUP G WITH(NOLOCK) ON G.ID = S.STOK_GRUP
        LEFT JOIN STOK_VERGI V WITH(NOLOCK) ON V.ID = S.STOK_VERGI
        LEFT JOIN STOK_STOK_BIRIM SSB WITH(NOLOCK) ON SSB.STOK = S.ID AND SSB.VARSAYILAN = 1
        LEFT JOIN STOK_BIRIM SB WITH(NOLOCK) ON SB.ID = SSB.STOK_BIRIM
        LEFT JOIN (
          SELECT STOK_STOK_BIRIM, MIN(BARKOD) AS BARKOD 
          FROM STOK_BARKOD WITH(NOLOCK) 
          WHERE AKTIF = 1 
          GROUP BY STOK_STOK_BIRIM
        ) B ON B.STOK_STOK_BIRIM = SSB.ID
        LEFT JOIN STOK_VARSAYILAN_FIYAT F WITH(NOLOCK) ON F.STOK_STOK_BIRIM = SSB.ID AND F.STOK_FIYAT_AD = @p1
        LEFT JOIN STOK_VARSAYILAN_FIYAT F2 WITH(NOLOCK) ON F2.STOK_STOK_BIRIM = SSB.ID AND F2.STOK_FIYAT_AD = @p2
        LEFT JOIN STOK_VARSAYILAN_FIYAT F3 WITH(NOLOCK) ON F3.STOK_STOK_BIRIM = SSB.ID AND F3.STOK_FIYAT_AD = @p3
        LEFT JOIN (
          SELECT STOK_STOK_BIRIM, MAX(FIYAT) AS FIYAT
          FROM STOK_VARSAYILAN_FIYAT WITH(NOLOCK)
          GROUP BY STOK_STOK_BIRIM
        ) F_ANY ON F_ANY.STOK_STOK_BIRIM = SSB.ID
        LEFT JOIN (
          SELECT STOK, SUM(MIKTAR) AS MIKTAR FROM STOK_MIKTAR WITH(NOLOCK) GROUP BY STOK
        ) M ON M.STOK = S.ID
        WHERE S.AKTIF = 1
          AND ISNULL(G.AD, '') NOT LIKE '%MASRAF%'
        ORDER BY S.AD ASC
      `;
      try {
        rows = await executeJsonQuery(fallbackWithoutResimQuery);
      } catch {
        const fallbackProdQuery = `
          SELECT TOP 10000
            S.ID AS id,
            S.KOD AS code,
            S.AD AS name,
            ISNULL(G.AD, 'Genel') AS category,
            'ADET' AS unit,
            1 AS vatRate,
            S.KOD AS barcode,
            0 AS price1,
            0 AS price2,
            0 AS price3,
            0 AS stockQuantity
          FROM STOK S WITH(NOLOCK)
          LEFT JOIN STOK_GRUP G WITH(NOLOCK) ON G.ID = S.STOK_GRUP
          WHERE S.AKTIF = 1
            AND ISNULL(G.AD, '') NOT LIKE '%MASRAF%'
          ORDER BY S.AD ASC
        `;
        rows = await executeJsonQuery(fallbackProdQuery);
      }
    }
    const imageMap = imageService.getAllProductImagesMap();
    const activeSqlCfg = getActiveSqlConfig();
    const sqlToken = encodeSqlConfigToken(activeSqlCfg);
    const activeDbName = activeSqlCfg?.database || '';
    const dbQuerySuffix = [
      activeDbName ? `db=${encodeURIComponent(activeDbName)}` : '',
      sqlToken ? `t=${encodeURIComponent(sqlToken)}` : '',
    ]
      .filter(Boolean)
      .join('&');

    // Aktif veritabanındaki resim indeks haritasını da anında belleğe kaydet (0ms)
    const hostKey = getActiveHostKey();
    const activeByCode = new Map();
    const activeByName = new Map();
    const activeById = new Map();
    let activeResimCount = 0;
    for (const r of rows) {
      if (r.resimIdx || r.erpImageLink) {
        activeResimCount++;
        const entry = {
          stokId: String(r.id || ''),
          resimIdx: r.resimIdx,
          resimLink: r.erpImageLink || null,
          sourceDb: activeDbName,
        };
        const cUp = String(r.code || '').trim().toUpperCase();
        const nUp = String(r.name || '').trim().toUpperCase();
        const sId = String(r.id || '').trim();
        if (cUp && !activeByCode.has(cUp)) activeByCode.set(cUp, entry);
        if (nUp && !activeByName.has(nUp)) activeByName.set(nUp, entry);
        if (sId && !activeById.has(sId)) activeById.set(sId, entry);
      }
    }
    if (activeResimCount > 0) {
      memCache.siblingImgMeta.set(`${hostKey}::${(activeDbName || 'ACTIVE').toUpperCase()}`, {
        byCode: activeByCode,
        byName: activeByName,
        byId: activeById,
        sourceDb: activeDbName,
        expiresAt: Date.now() + 10 * 60 * 1000,
      });
    }

    // Aktif veritabanında resmi olmayan ürünler için aynı sunucudaki kardeş ERP12 veritabanlarını (örn: GUNEYLERB2B <-> GUNEYLERB3B) paralel kontrol et
    const hasMissingResim = rows.some((r) => !r.resimIdx && !r.erpImageLink);
    const siblingMetas = [];
    if (hasMissingResim) {
      const siblingDbs = await discoverSiblingErpDatabases();
      const loadedMetas = await Promise.all(
        siblingDbs.map((sibDb) => getSiblingImageMeta(sibDb))
      );
      for (const meta of loadedMetas) {
        if (meta.byCode.size > 0 || meta.byId.size > 0) {
          siblingMetas.push(meta);
        }
      }
    }

    // Ürünlerin lokasyon bazlı stoklarını (STOK_MIKTAR / STOK_LOKASYON_BULUNURLUK),
    // rut stoklarını (CARI_ROOT_STOK) ve plasiyer satılamaz kısıtlarını (CARI_SATILAMAZ_*) paralel çek
    const [locStockRows, routeStockRows, forbiddenProdRows] = await Promise.all([
      executeJsonQuery(`
        SELECT
          X.stokId,
          X.locationName,
          SUM(X.qty) AS qty
        FROM (
          SELECT
            SM.STOK AS stokId,
            LTRIM(RTRIM(L.AD)) AS locationName,
            ISNULL(SM.MIKTAR, 0) AS qty
          FROM STOK_MIKTAR SM WITH(NOLOCK)
          INNER JOIN LOKASYON L WITH(NOLOCK) ON L.ID = SM.LOKASYON
          WHERE L.AKTIF = 1 AND LTRIM(RTRIM(ISNULL(L.AD, ''))) <> ''
          UNION ALL
          SELECT
            SLB.STOK AS stokId,
            LTRIM(RTRIM(L.AD)) AS locationName,
            CAST(0 AS float) AS qty
          FROM STOK_LOKASYON_BULUNURLUK SLB WITH(NOLOCK)
          INNER JOIN LOKASYON L WITH(NOLOCK) ON L.ID = SLB.LOKASYON
          WHERE L.AKTIF = 1 AND ISNULL(SLB.BULUNUR_MU, 1) = 1 AND LTRIM(RTRIM(ISNULL(L.AD, ''))) <> ''
        ) X
        GROUP BY X.stokId, X.locationName
      `).catch(() => []),
      executeJsonQuery(`
        SELECT DISTINCT
          CRS.STOK AS stokId,
          CAST(CP.PERSONEL_NO AS varchar(50)) AS repCode
        FROM CARI_ROOT_STOK CRS WITH(NOLOCK)
        INNER JOIN CARI_ROOT CR WITH(NOLOCK) ON CR.ID = CRS.CARI_ROOT
        INNER JOIN CARI_PERSONEL CP WITH(NOLOCK) ON CP.CARI = CR.CARI
        WHERE CP.PERSONEL_NO IS NOT NULL
      `).catch(() => []),
      executeJsonQuery(`
        SELECT DISTINCT
          CSU.STOK AS stokId,
          CAST(CP.PERSONEL_NO AS varchar(50)) AS repCode
        FROM CARI_SATILAMAZ_URUNLER CSU WITH(NOLOCK)
        INNER JOIN CARI_PERSONEL CP WITH(NOLOCK) ON CP.CARI = CSU.CARI
        WHERE CP.PERSONEL_NO IS NOT NULL
      `).catch(() => []),
    ]);

    const locStocksByStokId = new Map();
    if (Array.isArray(locStockRows)) {
      for (const lr of locStockRows) {
        const sid = String(lr.stokId || '').trim();
        const locName = String(lr.locationName || '').trim();
        if (!sid || !locName) continue;
        if (!locStocksByStokId.has(sid)) locStocksByStokId.set(sid, {});
        locStocksByStokId.get(sid)[locName] = Number(lr.qty || 0);
      }
    }

    const routeRepsByStokId = new Map();
    if (Array.isArray(routeStockRows)) {
      for (const rr of routeStockRows) {
        const sid = String(rr.stokId || '').trim();
        const rc = String(rr.repCode || '').trim().toUpperCase();
        if (!sid || !rc) continue;
        if (!routeRepsByStokId.has(sid)) routeRepsByStokId.set(sid, []);
        const arr = routeRepsByStokId.get(sid);
        if (!arr.includes(rc)) arr.push(rc);
      }
    }

    const forbiddenRepsByStokId = new Map();
    if (Array.isArray(forbiddenProdRows)) {
      for (const fr of forbiddenProdRows) {
        const sid = String(fr.stokId || '').trim();
        const rc = String(fr.repCode || '').trim().toUpperCase();
        if (!sid || !rc) continue;
        if (!forbiddenRepsByStokId.has(sid)) forbiddenRepsByStokId.set(sid, []);
        const arr = forbiddenRepsByStokId.get(sid);
        if (!arr.includes(rc)) arr.push(rc);
      }
    }

    const result = rows.map((row) => {
      const code = String(row.code || '').trim();
      const id = String(row.id || '').trim();
      const barcode = String(row.barcode || row.code || '').trim();
      const nameStr = String(row.name || '').trim();
      const codeUpper = code.toUpperCase();
      const nameUpper = nameStr.toUpperCase();
      const cleanCodeKey = code.replace(/[^a-zA-Z0-9_-]/g, '_');

      let resolvedResimIdx = row.resimIdx;
      let resolvedResimLink = row.erpImageLink;
      let resolvedTargetId = id;

      if (!resolvedResimIdx && !resolvedResimLink && siblingMetas.length > 0) {
        for (const meta of siblingMetas) {
          const matched =
            (codeUpper && meta.byCode.get(codeUpper)) ||
            (id && meta.byId.get(id)) ||
            (nameUpper && meta.byName.get(nameUpper));
          if (matched) {
            resolvedResimIdx = matched.resimIdx;
            resolvedResimLink = matched.resimLink;
            if (matched.stokId) resolvedTargetId = matched.stokId;
            break;
          }
        }
      }

      let erpResimUrl;
      if (resolvedResimLink && /^https?:\/\//i.test(String(resolvedResimLink).trim())) {
        erpResimUrl = String(resolvedResimLink).trim();
      } else if (resolvedResimIdx) {
        const qs = [
          `code=${encodeURIComponent(code)}`,
          `idx=${encodeURIComponent(String(resolvedResimIdx))}`,
          dbQuerySuffix,
        ]
          .filter(Boolean)
          .join('&');
        erpResimUrl = `/api/products/erp-image/${encodeURIComponent(resolvedTargetId)}?${qs}`;
      }

      const matchedImage =
        imageMap[code] ||
        imageMap[codeUpper] ||
        imageMap[cleanCodeKey] ||
        imageMap[id] ||
        imageMap[barcode] ||
        erpResimUrl ||
        undefined;

      const locationStocks = locStocksByStokId.get(id);
      const locationNames = locationStocks ? Object.keys(locationStocks) : undefined;
      const routeRepCodes = routeRepsByStokId.get(id);
      const forbiddenRepCodes = forbiddenRepsByStokId.get(id);

      const rawCat = String(row.category || 'Genel').trim();
      const mainCategory = String(row.mainCategory || rawCat || 'Genel').trim();
      const subCategory = String(row.subCategory || '').trim();

      return {
        id,
        code,
        barcode,
        name: nameStr,
        category: rawCat,
        mainCategory,
        ...(subCategory ? { subCategory } : {}),
        unit: String(row.unit || 'ADET'),
        vatRate: Number(row.vatRate || 1),
        price1: Number(row.price1 || 0),
        price2: Number(row.price2 || row.price1 || 0),
        price3: Number(row.price3 || row.price1 || 0),
        stockQuantity: Number(row.stockQuantity || 0),
        image: matchedImage,
        ...(locationNames && locationNames.length > 0 ? { locationNames, locationStocks } : {}),
        ...(routeRepCodes && routeRepCodes.length > 0 ? { routeRepCodes } : {}),
        ...(forbiddenRepCodes && forbiddenRepCodes.length > 0 ? { forbiddenRepCodes } : {}),
      };
    });

    // 60 saniye süreyle bellekte sakla
    memCache.products.set(dbKey, { data: result, expiresAt: Date.now() + 60000 });
    return result;
  },

  // 2.0.1 ERP12 RESIM TABLOSUNDAN ÜRÜN GÖRSELİ (PK_RESIM / R.IDX CLUSTERED INDEX SEEK + MOBİL KÜÇÜLTME İLE ~6-10 KB ANINDA OKUMA)
  async getProductErpImage(idOrCode, productCode = '', resimIdx = '', maxWidth = 240) {
    const dbKey = getActiveDbKey();
    const hostKey = getActiveHostKey();
    const safeId = String(idOrCode || '').trim().replace(/'/g, "''");
    const safeCode = String(productCode || '').trim().replace(/'/g, "''");
    const rawIdxNum = Number(resimIdx);
    const hasValidIdx = Number.isInteger(rawIdxNum) && rawIdxNum > 0;
    const sizeBucket = Number(maxWidth) > 320 ? 'lg' : 'sm';
    if (!safeId && !safeCode && !hasValidIdx) return null;

    const cacheKey = `${dbKey}::${safeId}::${safeCode}::${hasValidIdx ? rawIdxNum : ''}::${sizeBucket}`;
    const idxCacheKey = hasValidIdx ? `${hostKey}::IDX::${rawIdxNum}::${sizeBucket}` : null;
    const codeCacheKey = safeCode ? `${hostKey}::CODE::${safeCode.toUpperCase()}::${sizeBucket}` : null;
    const idCacheKey = safeId ? `${hostKey}::ID::${safeId}::${sizeBucket}` : null;
    const now = Date.now();

    const cached =
      (idxCacheKey ? memCache.productImages.get(idxCacheKey) : null) ||
      memCache.productImages.get(cacheKey) ||
      (codeCacheKey ? memCache.productImages.get(codeCacheKey) : null) ||
      (idCacheKey ? memCache.productImages.get(idCacheKey) : null);
    if (cached && cached.expiresAt > now) {
      return cached.data;
    }

    // PK_RESIM (R.IDX) üzerinden doğrudan Clustered Index Seek (~25ms, 747MB tablo taramasını tamamen önler)
    const buildFastByIdxSql = (targetIdx, dbPrefix = '', verifyStokId = '') => `
      SELECT TOP 1
        X.idx,
        X.stokId,
        X.ext,
        X.link,
        CAST('' AS xml).value('xs:base64Binary(sql:column("X.binData"))', 'varchar(max)') AS base64Data
      FROM (
        SELECT TOP 1
          R.IDX AS idx,
          R.ID AS stokId,
          LOWER(LTRIM(RTRIM(ISNULL(R.UZANTI, 'jpg')))) AS ext,
          LTRIM(RTRIM(ISNULL(R.LINK, ''))) AS link,
          CAST(R.RESIM AS varbinary(max)) AS binData
        FROM ${dbPrefix}RESIM R WITH(NOLOCK)
        WHERE R.IDX = ${Number(targetIdx)}
          ${verifyStokId && /^\d+$/.test(verifyStokId) ? `AND R.ID = ${verifyStokId}` : ''}
      ) X
    `;

    let rows = [];
    let resolvedCode = safeCode;

    // 1. ADIM: URL'de doğrudan idx (PK_RESIM) geldiyse anında Clustered Index Seek ile çek (~25ms)
    if (hasValidIdx) {
      try {
        rows = await executeJsonQuery(buildFastByIdxSql(rawIdxNum, '', safeId));
      } catch {
        rows = [];
      }
    }

    // 2. ADIM: idx gelmediyse veya aktif DB'de bulunamadıysa bellek içi hızlı indeks haritasından (getSiblingImageMeta) R.IDX'i 0ms'de bul
    if (!Array.isArray(rows) || rows.length === 0) {
      const codeUpper = safeCode.toUpperCase();
      const idUpper = safeId.toUpperCase();
      const activeMeta = await getSiblingImageMeta('');
      const matchedActive =
        (codeUpper && activeMeta.byCode.get(codeUpper)) ||
        (safeId && activeMeta.byId.get(safeId)) ||
        (idUpper && activeMeta.byCode.get(idUpper));

      if (matchedActive?.resimIdx) {
        try {
          rows = await executeJsonQuery(buildFastByIdxSql(matchedActive.resimIdx, ''));
        } catch {
          rows = [];
        }
      }
    }

    // 3. ADIM: Kardeş ERP12 veritabanlarında (örn: GUNEYLERB2B <-> GUNEYLERB3B) R.IDX üzerinden hızlı çek
    if (!Array.isArray(rows) || rows.length === 0) {
      const codeUpper = safeCode.toUpperCase();
      const idUpper = safeId.toUpperCase();
      const siblingDbs = await discoverSiblingErpDatabases();
      for (const sibDb of siblingDbs) {
        try {
          const sibMeta = await getSiblingImageMeta(sibDb);
          const matchedSib =
            (codeUpper && sibMeta.byCode.get(codeUpper)) ||
            (safeId && sibMeta.byId.get(safeId)) ||
            (idUpper && sibMeta.byCode.get(idUpper));
          const targetSibIdx = matchedSib?.resimIdx || (hasValidIdx ? rawIdxNum : null);
          if (targetSibIdx) {
            const sibRows = await executeJsonQuery(
              buildFastByIdxSql(targetSibIdx, `[${sibDb}].dbo.`)
            );
            if (Array.isArray(sibRows) && sibRows.length > 0) {
              rows = sibRows;
              break;
            }
          }
        } catch {
          // ignore sibling db error
        }
      }
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return null;
    }

    const row = rows[0];
    const link = String(row.link || '').trim();
    const base64Data = String(row.base64Data || '').trim();

    let buffer = null;
    let contentType = 'image/jpeg';

    if (base64Data) {
      buffer = Buffer.from(base64Data, 'base64');
      contentType = detectImageMimeType(buffer, row.ext);
      const optimized = await optimizeErpImageBuffer(buffer, contentType, maxWidth);
      buffer = optimized.buffer;
      contentType = optimized.contentType;
    }

    if (!buffer && !link) {
      return null;
    }

    const result = {
      idx: String(row.idx || (hasValidIdx ? rawIdxNum : '')),
      stokId: String(row.stokId || safeId),
      productCode: resolvedCode,
      ext: 'jpg',
      contentType,
      buffer,
      link: link || null,
    };

    while (memCache.productImages.size > 5000) {
      const oldestKey = memCache.productImages.keys().next().value;
      if (oldestKey) memCache.productImages.delete(oldestKey);
      else break;
    }
    const cacheEntry = {
      data: result,
      expiresAt: now + 60 * 60 * 1000,
    };
    memCache.productImages.set(cacheKey, cacheEntry);
    if (idxCacheKey) memCache.productImages.set(idxCacheKey, cacheEntry);
    if (result.idx) memCache.productImages.set(`${hostKey}::IDX::${result.idx}::${sizeBucket}`, cacheEntry);
    if (codeCacheKey) memCache.productImages.set(codeCacheKey, cacheEntry);
    if (resolvedCode) {
      memCache.productImages.set(`${hostKey}::CODE::${resolvedCode.toUpperCase()}::${sizeBucket}`, cacheEntry);
    }
    if (idCacheKey) memCache.productImages.set(idCacheKey, cacheEntry);

    return result;
  },

  // 2.1 STOK GRUPLARI LİSTESİ (STOK_GRUP)
  async getStockGroups() {
    try {
      const products = await erpQueries.getProducts();
      const map = new Map();
      products.forEach((p) => {
        const cat = p.category?.trim();
        if (!cat || cat.toUpperCase().includes('MASRAF')) return;
        const cur = map.get(cat) || { name: cat, count: 0, image: p.image };
        cur.count += 1;
        if (!cur.image && p.image) cur.image = p.image;
        map.set(cat, cur);
      });
      return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    } catch (err) {
      console.warn('STOK_GRUP listesi oluşturma hatası:', err.message);
      return [];
    }
  },

  // 3. MOBİLDEN GELEN SİPARİŞİ ERP12'YE YAZMA (RAP_SIPARIS_LISTESI & BELGE_DONUSUM & FIS_ICIN_SIPARIS_SEC %100 UYUMLU)
  async createOrder({ order }) {
    erpQueries.invalidateCustomerCache();
    erpQueries.invalidateProductCache();
    const now = new Date();
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timePart = now.toTimeString().slice(0, 8).replace(/:/g, '');
    const docNo = `${datePart}-${timePart}`;

    const safeNotes = (order.notes || '').trim().replace(/'/g, "''");
    const safeCustId = String(order.customerId || '').trim().replace(/'/g, "''");
    const safeCustCode = (order.customerCode || '').trim().replace(/'/g, "''");
    const safeCustName = (order.customerName || '').trim().replace(/'/g, "''");
    const safeTempId = (order.tempId || '').replace(/'/g, "''");
    const safeSalesRepCode = String(order.salesRepCode || '').trim().replace(/'/g, "''");
    const safeSalesRepName = String(order.salesRepName || '').trim().replace(/'/g, "''");
    const safeSaleType = String(order.saleType || 'cold').trim().replace(/'/g, "''");
    const safeVanPlate = String(order.vanPlate || '').trim().replace(/'/g, "''");
    const campaignNotes = (order.appliedCampaigns && order.appliedCampaigns.length > 0)
      ? (' [Kampanya: ' + order.appliedCampaigns.map(c => c.campaignTitle).join(', ') + ']')
      : '';
    const safeCampaignNotes = campaignNotes.trim().replace(/'/g, "''");
    const combinedExtraNotes = [safeNotes, safeCampaignNotes].filter(Boolean).join(' ');

    // ERP12'de STOK_VARSAYILAN_FIYAT (katalog fiyatları) KDV_DAHILMI = 1 (KDV Dahil) olduğundan,
    // her kalemin DAHIL_FIYAT'ı katalog birim fiyatıdır; KDV hariç FIYAT = DAHIL_FIYAT / (1 + KDV/100) olarak ayrıştırılır.
    const computedItems = (order.items || []).map((item) => {
      const sCode = (item.productCode || '').replace(/'/g, "''");
      const isGift = Boolean(item.isGift);
      const qty = Number(item.quantity || 1);
      const vatRate = Number(item.vatRate ?? 20);
      const vatMult = 1 + vatRate / 100;
      const rawDisc = Number(item.discountPercent || 0);
      const discNum = isGift ? 100 : (rawDisc > 0 && rawDisc < 100 ? rawDisc : 0);
      const iskonto = discNum > 0 ? String(discNum) : '0';
      const dahilFiyat = isGift ? 0 : Number(Number(item.unitPrice || 0).toFixed(4));
      const fiyat = isGift ? 0 : Number((dahilFiyat / vatMult).toFixed(8));
      const dahilTutar = isGift ? 0 : Number((dahilFiyat * qty).toFixed(4));
      const tutar = isGift ? 0 : Number((fiyat * qty).toFixed(8));
      const satirIskontoTutar = isGift ? 0 : Number((tutar * (discNum / 100)).toFixed(8));
      const kdvMatrahi = isGift ? 0 : Number((tutar - satirIskontoTutar).toFixed(8));
      const netDahilTutar = isGift ? 0 : Number((dahilTutar * (1 - discNum / 100)).toFixed(2));
      const kdvTutar = isGift ? 0 : Number((netDahilTutar - kdvMatrahi).toFixed(8));
      return {
        sCode,
        isGift,
        qty,
        vatRate,
        discNum,
        iskonto,
        fiyat,
        dahilFiyat,
        tutar,
        dahilTutar,
        satirIskontoTutar,
        kdvMatrahi,
        kdvTutar,
        netDahilTutar,
      };
    });

    const subtotalNum = Number(computedItems.reduce((sum, r) => sum + r.tutar, 0).toFixed(2));
    const totalDiscountNum = Number(computedItems.reduce((sum, r) => sum + r.satirIskontoTutar, 0).toFixed(2));
    const grandTotalNum = Number(computedItems.reduce((sum, r) => sum + r.netDahilTutar, 0).toFixed(2));
    const totalVatNum = Number(Math.max(0, grandTotalNum - (subtotalNum - totalDiscountNum)).toFixed(2));

    const sqlScript = `
      BEGIN TRANSACTION;
      BEGIN TRY
        DECLARE @cariId bigint;
        IF TRY_CAST('${safeCustId}' AS bigint) IS NOT NULL
          SELECT TOP 1 @cariId = ID FROM CARI WITH(NOLOCK) WHERE ID = TRY_CAST('${safeCustId}' AS bigint);
        IF @cariId IS NULL AND '${safeCustCode}' <> ''
          SELECT TOP 1 @cariId = ID FROM CARI WITH(NOLOCK) WHERE LTRIM(RTRIM(KOD)) = '${safeCustCode}';
        IF @cariId IS NULL AND '${safeCustName}' <> ''
          SELECT TOP 1 @cariId = ID FROM CARI WITH(NOLOCK) WHERE LTRIM(RTRIM(AD)) = '${safeCustName}';
        IF @cariId IS NULL
          SELECT TOP 1 @cariId = ID FROM CARI WITH(NOLOCK)
          WHERE ISNULL(AKTIF, 1) = 1 AND ISNULL(CARI_TUR, 1) = 1
          ORDER BY CASE
            WHEN UPPER(AD) LIKE N'%PERAKENDE%' OR UPPER(AD) LIKE N'%PAREKENDE%' OR UPPER(AD) LIKE N'%MUHTEL%' OR UPPER(AD) LIKE N'%PEŞİN%' OR UPPER(AD) LIKE N'%GENEL%' THEN 0
            ELSE 1
          END, ID ASC;
        IF @cariId IS NULL SELECT TOP 1 @cariId = ID FROM CARI WITH(NOLOCK) WHERE ISNULL(AKTIF, 1) = 1 ORDER BY ID ASC;

        DECLARE @cariAdresId bigint;
        SELECT TOP 1 @cariAdresId = ID FROM CARI_ADRES WITH(NOLOCK) WHERE CARI = @cariId ORDER BY ID ASC;

        DECLARE @lokId bigint;
        IF N'${safeSaleType}' = N'hot' AND N'${safeVanPlate}' <> N''
        BEGIN
          SELECT TOP 1 @lokId = ID FROM LOKASYON WITH(NOLOCK)
          WHERE ISNULL(AKTIF, 1) = 1
            AND (
              UPPER(LTRIM(RTRIM(AD))) = UPPER(N'${safeVanPlate}')
              OR UPPER(REPLACE(AD, N' ', N'')) = UPPER(REPLACE(N'${safeVanPlate}', N' ', N''))
            );
        END;
        IF @lokId IS NULL SELECT TOP 1 @lokId = ID FROM LOKASYON WITH(NOLOCK) WHERE ID = 75919;
        IF @lokId IS NULL SELECT TOP 1 @lokId = ID FROM LOKASYON WITH(NOLOCK) ORDER BY ID ASC;

        DECLARE @projeId bigint;
        SELECT TOP 1 @projeId = ID FROM PROJE WITH(NOLOCK) WHERE ID = 75916;
        IF @projeId IS NULL SELECT TOP 1 @projeId = ID FROM PROJE WITH(NOLOCK) ORDER BY ID ASC;

        DECLARE @dovizId bigint;
        SELECT TOP 1 @dovizId = ID FROM DOVIZ_AD WITH(NOLOCK) WHERE ID = 1;
        IF @dovizId IS NULL SELECT TOP 1 @dovizId = ID FROM DOVIZ_AD WITH(NOLOCK) ORDER BY ID ASC;

        DECLARE @cariPersonelId bigint;
        DECLARE @personelAdSoyad nvarchar(200);
        SET @cariPersonelId = 0;
        SET @personelAdSoyad = N'';

        IF N'${safeSalesRepCode}' <> N'' AND N'${safeSalesRepCode}' <> N'0'
        BEGIN
          SELECT TOP 1
            @cariPersonelId = C.ID,
            @personelAdSoyad = LTRIM(RTRIM(ISNULL(C.AD, N'')))
          FROM CARI C WITH(NOLOCK)
          INNER JOIN CARI_PERSONEL CP WITH(NOLOCK) ON CP.CARI = C.ID
          WHERE C.CARI_TUR = 2
            AND (
              CAST(CP.PERSONEL_NO AS nvarchar(50)) = N'${safeSalesRepCode}'
              OR LTRIM(RTRIM(C.KOD)) = N'${safeSalesRepCode}'
              OR CAST(C.ID AS nvarchar(50)) = N'${safeSalesRepCode}'
            );
        END;

        IF (@cariPersonelId IS NULL OR @cariPersonelId = 0) AND N'${safeSalesRepName}' <> N''
        BEGIN
          SELECT TOP 1
            @cariPersonelId = C.ID,
            @personelAdSoyad = LTRIM(RTRIM(ISNULL(C.AD, N'')))
          FROM CARI C WITH(NOLOCK)
          WHERE C.CARI_TUR = 2
            AND LTRIM(RTRIM(C.AD)) = N'${safeSalesRepName}';
        END;

        IF (@personelAdSoyad IS NULL OR @personelAdSoyad = N'') AND OBJECT_ID('dbo.ERP12_MOBIL_PLASIYER', 'U') IS NOT NULL AND N'${safeSalesRepCode}' <> N''
        BEGIN
          SELECT TOP 1
            @personelAdSoyad = LTRIM(RTRIM(ISNULL(AD, N'') + N' ' + ISNULL(SOYAD, N'')))
          FROM dbo.ERP12_MOBIL_PLASIYER WITH(NOLOCK)
          WHERE AKTIF = 1 AND UPPER(PLASIYER_KODU) = UPPER(N'${safeSalesRepCode}');
        END;

        IF @personelAdSoyad IS NULL OR @personelAdSoyad = N''
          SET @personelAdSoyad = CASE
            WHEN N'${safeSalesRepName}' <> N'' THEN N'${safeSalesRepName}'
            WHEN N'${safeSalesRepCode}' <> N'' AND N'${safeSalesRepCode}' <> N'0' THEN N'${safeSalesRepCode}'
            ELSE N''
          END;

        DECLARE @aciklamaText nvarchar(500);
        SET @aciklamaText = CASE
          WHEN @personelAdSoyad <> N'' AND N'${combinedExtraNotes}' <> N'' THEN @personelAdSoyad + N' - ' + N'${combinedExtraNotes}'
          WHEN @personelAdSoyad <> N'' THEN @personelAdSoyad
          WHEN N'${combinedExtraNotes}' <> N'' THEN N'${combinedExtraNotes}'
          ELSE N''
        END;

        ${(() => {
          const effectiveDocType =
            order.documentType === 'receipt' || String(order.tempId || '').startsWith('FIS-')
              ? 'receipt'
              : order.documentType === 'invoice' || String(order.tempId || '').startsWith('FTR-')
              ? 'invoice'
              : 'order';
          return effectiveDocType === 'receipt' || effectiveDocType === 'invoice';
        })() ? (() => {
          const isInvoice =
            order.documentType === 'invoice' || String(order.tempId || '').startsWith('FTR-');
          const fisTuru = isInvoice ? 2 : 20;
          const finIslemTuru = isInvoice ? 47 : 71;
          const seriPrefix = isInvoice ? 'STS FTRS-' : 'STS FS-';
          const fisBasimTipi = isInvoice ? 3 : 1;
          const fisAltTipi = 1;
          return `
        DECLARE @kasaId bigint;
        SELECT TOP 1 @kasaId = ID FROM KASA_AD WITH(NOLOCK) WHERE LOKASYON = @lokId AND AKTIF = 1 ORDER BY ID ASC;
        IF @kasaId IS NULL SELECT TOP 1 @kasaId = ID FROM KASA_AD WITH(NOLOCK) WHERE ID = 75923;
        IF @kasaId IS NULL SELECT TOP 1 @kasaId = ID FROM KASA_AD WITH(NOLOCK) ORDER BY ID ASC;

        DECLARE @sevkNedeniId bigint;
        SELECT TOP 1 @sevkNedeniId = SEVK_NEDENI FROM FIS WITH(NOLOCK) WHERE SEVK_NEDENI IS NOT NULL AND SEVK_NEDENI > 0 ORDER BY ID DESC;
        IF @sevkNedeniId IS NULL SET @sevkNedeniId = 0;

        DECLARE @fisId bigint;
        SELECT @fisId = ISNULL((
          SELECT MAX(v) FROM (VALUES
            (ISNULL((SELECT MAX(ID) FROM SEQUNCES WITH(NOLOCK)), 0)),
            (ISNULL((SELECT MAX(ID) FROM FIS WITH(NOLOCK)), 4892790)),
            (ISNULL((SELECT MAX(ID) FROM FIS_DETAY WITH(NOLOCK)), 4892790)),
            (ISNULL((SELECT MAX(ID) FROM FINANS WITH(NOLOCK)), 4892790)),
            (ISNULL((SELECT MAX(ID) FROM FINANS_DETAY WITH(NOLOCK)), 4892790))
          ) AS T(v)
        ), 4892790) + 1;

        DECLARE @seriPrefix nvarchar(20) = N'${seriPrefix}';
        DECLARE @maxSeriNum int;
        SELECT @maxSeriNum = MAX(TRY_CAST(SUBSTRING(BELGENO, LEN(@seriPrefix) + 1, 20) AS int))
        FROM FIS WITH(NOLOCK)
        WHERE FIS_TURU = ${fisTuru} AND BELGENO LIKE @seriPrefix + N'[0-9]%';

        DECLARE @belgeNo nvarchar(50);
        SET @belgeNo = @seriPrefix + RIGHT(N'000000' + CAST(ISNULL(@maxSeriNum, 0) + 1 AS nvarchar(20)), 6);

        INSERT INTO FIS (
          ID, FIS_TURU, LOKASYON, KARSI_LOKASYON, CARI, CARI_ADRES, GONDERIM_ADRESI, PROJE,
          BELGENO, FIS_TARIHI, ISLEM_TARIHI, SEVK_TARIHI, DOVIZ_AD, DOVIZ_KUR, CARI_PERSONEL,
          SATIR_TOPLAM, SATIR_ISKONTO_TOPLAM, FIS_ISKONTO_ORAN, FIS_ISKONTO_TOPLAM,
          YUVARLAMA, KDV_TOPLAM, OTV_TOPLAM, TEFKIFAT_TOPLAM, GENELTOPLAM,
          DURUM, VADE, VADE_SECENEKLERI, ACIKLAMA, YAZAR_KASA_NO,
          FIS_CARIYI_ETKILERMI, CARI_DOVIZ_AD, CARI_DOVIZ_KUR, CARI_TAKIP_SEKLI,
          AKTIF, E_FATURA_GIDIS_KODU, SEVKIYAT_YAPILSIN, MOBIL_MI,
          FIS_SEZON, MARKET_KASA_TERAZI_MARKALARI, FIS_BASIM_TIPI,
          KARGO_CARISI, INTERNET_ODEME_SEKLI, INTERNET_ODEME_ACIKLAMASI,
          VIO_MUHENTYAPILDI, ONAY_BEKLIYOR,
          BAGKUR_ORAN, BAGKUR_TUTAR, STOPAJ_ORAN, STOPAJ_TUTAR, BORSA_ORAN, BORSA_TUTAR, MERA_ORAN, MERA_TUTAR,
          TEVKIF, FIS_OZEL_KOD_1, FIS_OZEL_KOD_2, FIS_OZEL_KOD_3, FIS_OZEL_KOD_4, FIS_OZEL_KOD_5,
          BELGE_YETKILISI, YAZILDI, EMAIL_GONDERILDI, NAKLIYE_ODEME_TIPI, SEVK_SEKLI, ARTTIRIM,
          IHRACAT_GONDERIM_SEKLI, IHRACAT_TESLIM_SEKLI, VERGI_MUAFIYET_KODU, E_FATURA_KABUL_DURUMU,
          DOVIZ_KUR_SECIMI, FIS_ODEME_TIPI_ISKONTOLARI, FIS_STOK_HAREKETLERINI_ETKILER, FIS_ALT_TIPI,
          SEVK_PERSONEL_AD, SEVK_PERSONEL_TCKN, SEVK_ARAC_PLAKA, SEVK_DORSE_PLAKA,
          SGK_DOSYA_NO, SGK_DONEM_BASLANGIC, SGK_DONEM_BITIS, MUHASEBELESTI, PAREKENDE_KDV_KULLAN, SATILDIGI_PAZAR_YERI,
          ODEMEMNIN_YAPILDIGI_TARIH, GONDERIM_TARIHI, SEVK_NEDENI, ASIL_SATICI_CARISI, HAREKET_TARIHI, SATIR_STOPAJ_TOPLAM,
          ALIS_BELGE_NO, ALIS_BELGE_NO_2, ALIS_BELGE_NO_3, ALIS_BELGE_NO_4, ALIS_BELGE_NO_5
        ) VALUES (
          @fisId, ${fisTuru}, @lokId, NULL, @cariId, @cariAdresId, @cariAdresId, @projeId,
          @belgeNo, GETDATE(), GETDATE(), GETDATE(), @dovizId, 1, ISNULL(@cariPersonelId, 0),
          ${subtotalNum}, ${totalDiscountNum}, '', 0,
          0, ${totalVatNum}, 0, 0, ${grandTotalNum},
          1, CAST(GETDATE() AS DATE), 17, @aciklamaText, 0,
          1, @dovizId, 1, 1,
          1, '', 0, 0,
          0, 300, ${fisBasimTipi},
          0, 0, '',
          ' ', 0,
          0, 0, 0, 0, 0, 0, 0, 0,
          0, 0, 0, 0, 0, 0,
          0, 0, 0, 0, 0, 0,
          0, 0, 0, 0,
          2, 1, 1, ${fisAltTipi},
          '', '', '', '',
          '', CAST(GETDATE() AS DATE), CAST(GETDATE() AS DATE), 0, 0, '',
          CAST(GETDATE() AS DATE), CAST(GETDATE() AS DATE), @sevkNedeniId, 0, GETDATE(), 0,
          '', '', '', '', ''
        );
        IF OBJECT_ID('dbo.SEQUNCES', 'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM SEQUNCES WHERE ID = @fisId)
          INSERT INTO SEQUNCES (ID, TABLO, KOD_PC) VALUES (@fisId, 'FIS', 0);

        DECLARE @detId bigint = @fisId;
        DECLARE @satirNo bigint;
        SELECT @satirNo = ISNULL(MAX(TRY_CAST(SATIR AS bigint)), 52000) FROM FIS_DETAY WITH(NOLOCK);

        ${computedItems.map((r, idx) => {
          return `
            SET @detId = @detId + 1;
            SET @satirNo = @satirNo + 1;
            DECLARE @stokId_${idx} bigint;
            DECLARE @birimId_${idx} bigint;
            DECLARE @stokCinsi_${idx} bigint;
            DECLARE @barkod_${idx} nvarchar(60);
            SELECT TOP 1
              @stokId_${idx} = S.ID,
              @birimId_${idx} = ISNULL(SSB.STOK_BIRIM, 1012),
              @stokCinsi_${idx} = ISNULL(S.STOK_CINSI, 1),
              @barkod_${idx} = ISNULL(B.BARKOD, S.KOD)
            FROM STOK S WITH(NOLOCK)
            LEFT JOIN STOK_STOK_BIRIM SSB WITH(NOLOCK) ON SSB.STOK = S.ID AND SSB.VARSAYILAN = 1
            OUTER APPLY (
              SELECT TOP 1 BARKOD FROM STOK_BARKOD WITH(NOLOCK)
              WHERE STOK_STOK_BIRIM = SSB.ID AND AKTIF = 1
              ORDER BY ID ASC
            ) B
            WHERE S.KOD = '${r.sCode}';

            IF @stokId_${idx} IS NOT NULL
            BEGIN
              INSERT INTO FIS_DETAY (
                ID, FIS, LOKASYON, STOK, STOK_CINSI, STOK_BIRIM,
                BARKOD, KOLI_BARKODU, DOVIZ_AD, CARPAN, KAB,
                MIKTAR_FIS, MIKTAR_BEDELSIZ, MIKTAR_GIRIS, MIKTAR_CIKIS,
                ANLASMA_FIYAT, FIYAT, DAHIL_FIYAT, TUTAR, DAHIL_TUTAR,
                ISKONTO, ISKONTO_HESAP, OTV_ORAN, OTV_TUTAR, KDV_TOPTAN, TEVKIF,
                KUR, PUAN, FIYAT_FARKI, SERINO_ZORUNLU, FK_PERSONEL, SATIR,
                YEREL_KARSI_FIYAT, BELGE_TARIHINDEKI_SON_ALIS_FIYATI, HK_MIKTAR_FIS,
                FATRALANDIRILMIS_IRSALIYEMI, URETILENMI, FK_VERGI_MUAFIYET_KODU,
                TOPLAM_SATIR_ISKONTOSU, TOPLAM_FIS_ISKONTOSU, TOPLAM_OTV,
                TOPLAM_KDV_MATRAHI, TOPLAM_KDV, TOPLAM_TEVKIF, HESAPLANAN_FIYAT,
                PRIM, FIS_DETAY_SATIR_TURU, LISTE_FIYATI, RECETE_MALIYET_ORANI, RECETE,
                PARTINO, PARTINO_ZORUNLU, YEREL_FIYAT, FIS_TARIHI, ISLENDI,
                ACIKLAMA, KOD, JOKER, BAGLI_SATIR, FIS_TURU, MASA,
                AMBALAJ_BIRIM, AMBALAJ_MIKTAR, AMBALAJ_CARPAN, GTIPNO,
                POS_PROMASYON, POS_PROMASYON_TOPLAM, FK_STOK_TEVKIF_LESTE,
                LOKASYON_MALIYETI, MALIYET_ELLE_GIRILDI, ALT_BIRIM_MIKTARI, UTS,
                ANLASMA_DETAY_ID, STOK_FIYAT_AD, BURUT, FIRE, FIYAT_MANUEL_GIRILDI,
                FK_IHRACAT_KAB_CINSI, IHRACAT_KAB_NO, IHRACAT_KAB_ADET, SATICIKODU,
                PARTI_NO_SON_KULLANMA_TARIHI, BUNDLE_DETAY, FK_GIDER_YERI, KT_BUNDLE_FIYAT, SATIR_STOPAJ_TUTAR
              ) VALUES (
                @detId, @fisId, @lokId, @stokId_${idx}, @stokCinsi_${idx}, @birimId_${idx},
                @barkod_${idx}, '', @dovizId, 1, 0,
                ${r.qty}, 0, 0, ${r.qty},
                0, ${r.fiyat}, ${r.dahilFiyat}, ${r.tutar}, ${r.dahilTutar},
                '${r.iskonto === '0' ? '' : r.iskonto}', ${r.discNum}, 0, 0, ${r.vatRate}, 0,
                1, 0, 0, 0, ISNULL(@cariPersonelId, 0), @satirNo,
                0, 0, '',
                0, 0, 0,
                ${r.satirIskontoTutar}, 0, 0,
                ${r.kdvMatrahi}, ${r.kdvTutar}, 0, ${r.fiyat},
                0, 0, 0, 0, 0,
                '', 0, ${r.fiyat}, GETDATE(), 0,
                '', '${r.sCode}', '', 0, '${fisTuru}', 0,
                @birimId_${idx}, ${r.qty}, 1, '',
                0, 0, 0,
                0, 0, 0, '',
                0, 0, 0, 0, 0,
                0, 0, 0, '',
                GETDATE(), 0, 0, 0, 0
              );
              IF OBJECT_ID('dbo.SEQUNCES', 'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM SEQUNCES WHERE ID = @detId)
                INSERT INTO SEQUNCES (ID, TABLO, KOD_PC) VALUES (@detId, 'FIS_DETAY', 0);
            END;
          `;
        }).join('\n')}

        DECLARE @finId bigint = @detId + 1;
        DECLARE @finDetId bigint = @detId + 2;

        INSERT INTO FINANS (
          ID, PROJE, LOKASYON, KASA_AD, BELGENO, TARIH, ISLEM_TARIHI, FIS, BAGLI_FINANS, MOBIL_MI
        ) VALUES (
          @finId, @projeId, @lokId, @kasaId, @belgeNo, GETDATE(), GETDATE(), @fisId, NULL, 0
        );
        IF OBJECT_ID('dbo.SEQUNCES', 'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM SEQUNCES WHERE ID = @finId)
          INSERT INTO SEQUNCES (ID, TABLO, KOD_PC) VALUES (@finId, 'FINANS', 0);

        INSERT INTO FINANS_DETAY (
          ID, FINANS, FINANS_ISLEM_TURU, DOVIZ_AD, KUR,
          KART_BORCLU, KART_ALACAKLI, TUTAR, SECIM, TAHSILID,
          FIS, VADE_TARIHI, FK_PERSONEL, ACIKLAMA, TAKSIT_SAYISI,
          ISLEM_TARIHI, YENIDEN_TAKSIT, CARI_ADRES
        ) VALUES (
          @finDetId, @finId, ${finIslemTuru}, @dovizId, 1,
          @cariId, @fisId, ${grandTotalNum}, 0, 0,
          @fisId, CAST(GETDATE() AS DATE), ISNULL(@cariPersonelId, 0), LEFT(@aciklamaText, 250), 1,
          GETDATE(), 1, @cariAdresId
        );
        IF OBJECT_ID('dbo.SEQUNCES', 'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM SEQUNCES WHERE ID = @finDetId)
          INSERT INTO SEQUNCES (ID, TABLO, KOD_PC) VALUES (@finDetId, 'FINANS_DETAY', 0);

        IF OBJECT_ID('dbo.SEQUNCES_DEGISIKLIK', 'U') IS NOT NULL
        BEGIN
          DECLARE @aktifKodPc bigint = 0;
          DECLARE @aktifKullanici bigint = ISNULL(@cariPersonelId, 0);
          SELECT TOP 1
            @aktifKodPc = ISNULL(KOD_PC, 0),
            @aktifKullanici = CASE WHEN ISNULL(KULLANICI, 0) > 0 THEN KULLANICI ELSE ISNULL(@cariPersonelId, 0) END
          FROM SEQUNCES_DEGISIKLIK WITH(NOLOCK)
          WHERE ISNULL(KOD_PC, 0) > 0
          ORDER BY ID DESC;

          IF OBJECT_ID('dbo.SEQUNCES', 'U') IS NOT NULL AND @aktifKodPc > 0
            UPDATE SEQUNCES SET KOD_PC = @aktifKodPc WHERE ID BETWEEN @fisId AND @finDetId;

          INSERT INTO SEQUNCES_DEGISIKLIK (KOD_PC, SEQUNCES, KULLANICI, ISLEM, TARIH, TABLO)
          VALUES (@aktifKodPc, @fisId, @aktifKullanici, 1, GETDATE(), 'FIS');
          INSERT INTO SEQUNCES_DEGISIKLIK (KOD_PC, SEQUNCES, KULLANICI, ISLEM, TARIH, TABLO)
          VALUES (@aktifKodPc, @finId, @aktifKullanici, 1, GETDATE(), 'FINANS');
          INSERT INTO SEQUNCES_DEGISIKLIK (KOD_PC, SEQUNCES, KULLANICI, ISLEM, TARIH, TABLO)
          VALUES (@aktifKodPc, @finDetId, @aktifKullanici, 1, GETDATE(), 'FINANS_DETAY');
        END;

        COMMIT TRANSACTION;
        SELECT @belgeNo AS docNo;
          `;
        })() : `
        DECLARE @orderId bigint;
        SELECT @orderId = ISNULL((
          SELECT MAX(v) FROM (VALUES
            (ISNULL((SELECT MAX(ID) FROM SEQUNCES WITH(NOLOCK)), 0)),
            (ISNULL((SELECT MAX(ID) FROM SIPARIS WITH(NOLOCK)), 3893110)),
            (ISNULL((SELECT MAX(ID) FROM SIPARIS_DETAY WITH(NOLOCK)), 3893110))
          ) AS T(v)
        ), 3893110) + 1;

        INSERT INTO SIPARIS (
          ID, SIPARIS_TURU, LOKASYON, CARI, CARI_ADRES, GONDERIM_ADRESI, PROJE,
          BELGENO, SIPARIS_TARIHI, TERMIN_TARIHI, ISLEM_TARIHI, VADE_TARIHI,
          DOVIZ_AD, DOVIZ_KUR, CARI_PERSONEL,
          SATIR_TOPLAM, SATIR_ISKONTO_TOPLAM, SIPARIS_ISKONTO_ORAN, SIPARIS_ISKONTO_TOPLAM,
          YUVARLAMA, KDV_TOPLAM, OTV_TOPLAM, TEFKIFAT_TOPLAM, GENELTOPLAM,
          ACIKLAMA, FIS, AKTIF, MOBIL_MI, ONAYLI,
          BELGE_YETKILISI, YAZILDI, EMAIL_GONDERILDI, NAKLIYE_ODEME_TIPI, SEVK_SEKLI,
          KARSI_SIPARIS_NO, FIS_ODEME_TIPI_ISKONTOLARI, FIS_ALT_TIPI
        ) VALUES (
          @orderId, 2, @lokId, @cariId, @cariAdresId, @cariAdresId, @projeId,
          '${docNo}', GETDATE(), CAST(GETDATE() AS DATE), GETDATE(), CAST(GETDATE() AS DATE),
          @dovizId, 1, ISNULL(@cariPersonelId, 0),
          ${subtotalNum}, ${totalDiscountNum}, '0', 0,
          0, ${totalVatNum}, 0, 0, ${grandTotalNum},
          LEFT(@aciklamaText, 100), 0, 1, 1, 1,
          0, 0, 0, 0, 0,
          '', 1, 1
        );
        IF OBJECT_ID('dbo.SEQUNCES', 'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM SEQUNCES WHERE ID = @orderId)
          INSERT INTO SEQUNCES (ID, TABLO, KOD_PC) VALUES (@orderId, 'SIPARIS', 0);

        DECLARE @detId bigint;
        SET @detId = @orderId;
        ${computedItems.map((r, idx) => {
          return `
            SET @detId = @detId + 1;
            DECLARE @stokId_${idx} bigint;
            DECLARE @birimId_${idx} bigint;
            DECLARE @stokCinsi_${idx} bigint;
            DECLARE @barkod_${idx} nvarchar(60);
            SELECT TOP 1
              @stokId_${idx} = S.ID,
              @birimId_${idx} = ISNULL(SSB.STOK_BIRIM, 1012),
              @stokCinsi_${idx} = ISNULL(S.STOK_CINSI, 1),
              @barkod_${idx} = ISNULL(B.BARKOD, S.KOD)
            FROM STOK S WITH(NOLOCK)
            LEFT JOIN STOK_STOK_BIRIM SSB WITH(NOLOCK) ON SSB.STOK = S.ID AND SSB.VARSAYILAN = 1
            OUTER APPLY (
              SELECT TOP 1 BARKOD FROM STOK_BARKOD WITH(NOLOCK)
              WHERE STOK_STOK_BIRIM = SSB.ID AND AKTIF = 1
              ORDER BY ID ASC
            ) B
            WHERE S.KOD = '${r.sCode}';

            IF @stokId_${idx} IS NOT NULL
            BEGIN
              INSERT INTO SIPARIS_DETAY (
                ID, SIPARIS, LOKASYON, STOK, STOK_CINSI, STOK_BIRIM,
                BARKOD, KOLI_BARKODU, KOD, DOVIZ_AD, KUR, CARPAN, KAB,
                MIKTAR_FIS, MIKTAR_BEDELSIZ, ANLASMA_FIYAT,
                FIYAT, DAHIL_FIYAT, TUTAR, DAHIL_TUTAR,
                ISKONTO, ISKONTO_HESAP, OTV_ORAN, OTV_TUTAR, KDV_TOPTAN, TEVKIF,
                FIYAT_FARKI, SERINO_ZORUNLU,
                TOPLAM_SATIR_ISKONTOSU, TOPLAM_FIS_ISKONTOSU, TOPLAM_OTV,
                TOPLAM_KDV_MATRAHI, TOPLAM_KDV, TOPLAM_TEVKIF, HESAPLANAN_FIYAT,
                ACIKLAMA, AMBALAJ_BIRIM, AMBALAJ_MIKTAR, AMBALAJ_CARPAN
              ) VALUES (
                @detId, @orderId, @lokId, @stokId_${idx}, @stokCinsi_${idx}, @birimId_${idx},
                @barkod_${idx}, '', '${r.sCode}', @dovizId, 1, 1, 0,
                ${r.qty}, 0, 0,
                ${r.fiyat}, ${r.dahilFiyat}, ${r.tutar}, ${r.dahilTutar},
                '${r.iskonto}', ${r.discNum}, 0, 0, ${r.vatRate}, 0,
                0, 0,
                ${r.satirIskontoTutar}, 0, 0,
                ${r.kdvMatrahi}, ${r.kdvTutar}, 0, ${r.fiyat},
                '', @birimId_${idx}, ${r.qty}, 1
              );
              IF OBJECT_ID('dbo.SEQUNCES', 'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM SEQUNCES WHERE ID = @detId)
                INSERT INTO SEQUNCES (ID, TABLO, KOD_PC) VALUES (@detId, 'SIPARIS_DETAY', 0);
            END;
          `;
        }).join('\n')}

        COMMIT TRANSACTION;
        SELECT '${docNo}' AS docNo;
        `}
      END TRY
      BEGIN CATCH
        ROLLBACK TRANSACTION;
        DECLARE @errMsgOrd nvarchar(4000);
        SET @errMsgOrd = ERROR_MESSAGE();
        RAISERROR(@errMsgOrd, 16, 1);
      END CATCH;
    `;

    const res = await executeJsonQuery(sqlScript);
    return { docNo: res[0]?.docNo || docNo };
  },

  // 4. MOBİLDEN GELEN TAHSİLATI ERP12'YE YAZMA
  async createCollection({ collection }) {
    erpQueries.invalidateCustomerCache();
    const now = new Date();
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timePart = now.toTimeString().slice(0, 8).replace(/:/g, '');
    const docNo = `THS-${datePart}-${timePart}`;

    const safeNotes = (collection.notes || '').replace(/'/g, "''");
    const safeCustCode = (collection.customerCode || '').replace(/'/g, "''");
    const safeTempId = (collection.tempId || '').replace(/'/g, "''");
    const safeReceiptNo = (collection.receiptNo || docNo).replace(/'/g, "''");

    // ERP12 FINANS_ISLEM_TURU:
    // 1: Nakit tahsilat, 15: POS tahsilat, 7: Havale alma, 20: Cariden çek alma
    let islemTuru = 1;
    if (collection.paymentMethod === 'kredi_karti') islemTuru = 15;
    else if (collection.paymentMethod === 'havale') islemTuru = 7;
    else if (collection.paymentMethod === 'cek') islemTuru = 20;

    let extraNote = '';
    if (collection.paymentMethod === 'cek' && collection.checkNo) {
      extraNote = ` [Çek No: ${collection.checkNo}, Banka: ${collection.checkBank || ''}, Vade: ${collection.checkDueDate || ''}]`;
    }

    const fullNote = `[Mobil Tahsilat - ${safeTempId}] ${safeNotes}${extraNote}`.trim().replace(/'/g, "''");

    const sqlScript = `
      BEGIN TRANSACTION;
      BEGIN TRY
        DECLARE @cariId bigint;
        SELECT TOP 1 @cariId = ID FROM CARI WHERE KOD = '${safeCustCode}';
        IF @cariId IS NULL SELECT TOP 1 @cariId = ID FROM CARI WHERE AKTIF = 1 ORDER BY ID ASC;

        DECLARE @finansId bigint;
        SELECT @finansId = ISNULL((
          SELECT MAX(v) FROM (VALUES
            (ISNULL((SELECT MAX(ID) FROM SEQUNCES), 0)),
            (ISNULL((SELECT MAX(ID) FROM FINANS), 3931620)),
            (ISNULL((SELECT MAX(ID) FROM FINANS_DETAY), 3931620))
          ) AS T(v)
        ), 3931620) + 1;

        DECLARE @kasaId bigint;
        SELECT TOP 1 @kasaId = ID FROM KASA_AD WHERE ID = 75923;
        IF @kasaId IS NULL SELECT TOP 1 @kasaId = ID FROM KASA_AD ORDER BY ID ASC;

        DECLARE @lokId bigint;
        SELECT TOP 1 @lokId = ID FROM LOKASYON WHERE ID = 75919;
        IF @lokId IS NULL SELECT TOP 1 @lokId = ID FROM LOKASYON ORDER BY ID ASC;

        DECLARE @projeId bigint;
        SELECT TOP 1 @projeId = ID FROM PROJE WHERE ID = 75916;
        IF @projeId IS NULL SELECT TOP 1 @projeId = ID FROM PROJE ORDER BY ID ASC;

        INSERT INTO FINANS (
          ID, PROJE, LOKASYON, KASA_AD, BELGENO, 
          TARIH, ISLEM_TARIHI, FIS, MOBIL_MI
        ) VALUES (
          @finansId, @projeId, @lokId, @kasaId, '${safeReceiptNo}', 
          GETDATE(), GETDATE(), @finansId, 1
        );
        IF OBJECT_ID('dbo.SEQUNCES', 'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM SEQUNCES WHERE ID = @finansId)
          INSERT INTO SEQUNCES (ID, TABLO, KOD_PC) VALUES (@finansId, 'FINANS', 0);

        DECLARE @detId bigint;
        SET @detId = @finansId + 1;
        INSERT INTO FINANS_DETAY (
          ID, FINANS, FINANS_ISLEM_TURU, DOVIZ_AD, KUR, 
          KART_BORCLU, KART_ALACAKLI, TUTAR, SECIM, 
          ACIKLAMA, BELGENO, ISLEM_TARIHI
        ) VALUES (
          @detId, @finansId, ${islemTuru}, 1, 1.0, 
          @kasaId, @cariId, ${collection.amount || 0}, 0, 
          '${fullNote}', '${safeReceiptNo}', GETDATE()
        );
        IF OBJECT_ID('dbo.SEQUNCES', 'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM SEQUNCES WHERE ID = @detId)
          INSERT INTO SEQUNCES (ID, TABLO, KOD_PC) VALUES (@detId, 'FINANS_DETAY', 0);

        COMMIT TRANSACTION;
        SELECT '${docNo}' AS docNo;
      END TRY
      BEGIN CATCH
        ROLLBACK TRANSACTION;
        DECLARE @errMsgCol nvarchar(4000);
        SET @errMsgCol = ERROR_MESSAGE();
        RAISERROR(@errMsgCol, 16, 1);
      END CATCH;
    `;

    const res = await executeJsonQuery(sqlScript);
    return { docNo: res[0]?.docNo || docNo };
  },

  // 5. SİPARİŞİ ERP12'DE ONAYLA & FATURALAŞTIRMAYA SEVK ET (FIS / FIS_DETAY / FINANS OLUŞTUR)
  async invoiceOrder({ docNo, invoiceNo, notes }) {
    erpQueries.invalidateCustomerCache();
    const safeDocNo = (docNo || '').replace(/'/g, "''");
    const safeInvNo = (invoiceNo || '').replace(/'/g, "''");
    const safeNotes = (notes || '').replace(/'/g, "''");

    const notesRaw = String(notes || '');
    const isReceipt = notesRaw.includes('[Perakende') || notesRaw.includes('[Fiş');
    const isWaybill = notesRaw.includes('[Sevk');
    const fisTuru = isReceipt ? 20 : isWaybill ? 6 : 2;
    const finIslemTuru = isReceipt ? 71 : 47;
    const fisBasimTipi = isReceipt || isWaybill ? 1 : 3;
    const fisAltTipi = 1;
    const seriPrefix = isReceipt ? 'STS FS-' : isWaybill ? 'STS RSLYS-' : 'STS FTRS-';

    const sqlScript = `
      BEGIN TRANSACTION;
      BEGIN TRY
        DECLARE @sipId bigint;
        DECLARE @existingFisId bigint;
        DECLARE @lokId bigint;
        DECLARE @cariId bigint;
        DECLARE @cariAdresId bigint;
        DECLARE @gonderimAdresiId bigint;
        DECLARE @projeId bigint;
        DECLARE @dovizId bigint;
        DECLARE @cariPersonelId bigint;
        DECLARE @satirToplam decimal(18,8);
        DECLARE @satirIskonto decimal(18,8);
        DECLARE @kdvToplam decimal(18,8);
        DECLARE @genelToplam decimal(18,8);
        DECLARE @sipAciklama nvarchar(200);

        SELECT TOP 1
          @sipId = ID,
          @existingFisId = ISNULL(FIS, 0),
          @lokId = ISNULL(LOKASYON, 75919),
          @cariId = CARI,
          @cariAdresId = CARI_ADRES,
          @gonderimAdresiId = ISNULL(GONDERIM_ADRESI, CARI_ADRES),
          @projeId = ISNULL(PROJE, 75916),
          @dovizId = ISNULL(DOVIZ_AD, 1),
          @cariPersonelId = ISNULL(CARI_PERSONEL, 0),
          @satirToplam = ISNULL(SATIR_TOPLAM, 0),
          @satirIskonto = ISNULL(SATIR_ISKONTO_TOPLAM, 0),
          @kdvToplam = ISNULL(KDV_TOPLAM, 0),
          @genelToplam = ISNULL(GENELTOPLAM, 0),
          @sipAciklama = ISNULL(ACIKLAMA, N'')
        FROM SIPARIS WITH(NOLOCK)
        WHERE BELGENO = N'${safeDocNo}' OR CAST(ID AS nvarchar(50)) = N'${safeDocNo}'
        ORDER BY ID DESC;

        DECLARE @belgeNo nvarchar(50) = LEFT(N'${safeInvNo}', 50);

        IF @sipId IS NOT NULL AND @existingFisId = 0
        BEGIN
          IF @belgeNo = N''
          BEGIN
            DECLARE @seriPrefix nvarchar(20) = N'${seriPrefix}';
            DECLARE @maxSeriNum int;
            SELECT @maxSeriNum = MAX(TRY_CAST(SUBSTRING(BELGENO, LEN(@seriPrefix) + 1, 20) AS int))
            FROM FIS WITH(NOLOCK)
            WHERE FIS_TURU = ${fisTuru} AND BELGENO LIKE @seriPrefix + N'[0-9]%';
            SET @belgeNo = @seriPrefix + RIGHT(N'000000' + CAST(ISNULL(@maxSeriNum, 0) + 1 AS nvarchar(20)), 6);
          END;

          DECLARE @kasaId bigint;
          SELECT TOP 1 @kasaId = ID FROM KASA_AD WITH(NOLOCK) WHERE LOKASYON = @lokId AND AKTIF = 1 ORDER BY ID ASC;
          IF @kasaId IS NULL SELECT TOP 1 @kasaId = ID FROM KASA_AD WITH(NOLOCK) WHERE ID = 75923;
          IF @kasaId IS NULL SELECT TOP 1 @kasaId = ID FROM KASA_AD WITH(NOLOCK) ORDER BY ID ASC;

          DECLARE @sevkNedeniId bigint;
          SELECT TOP 1 @sevkNedeniId = SEVK_NEDENI FROM FIS WITH(NOLOCK) WHERE SEVK_NEDENI IS NOT NULL AND SEVK_NEDENI > 0 ORDER BY ID DESC;
          IF @sevkNedeniId IS NULL SET @sevkNedeniId = 0;

          DECLARE @fisId bigint;
          SELECT @fisId = ISNULL((
            SELECT MAX(v) FROM (VALUES
              (ISNULL((SELECT MAX(ID) FROM SEQUNCES WITH(NOLOCK)), 0)),
              (ISNULL((SELECT MAX(ID) FROM FIS WITH(NOLOCK)), 4892790)),
              (ISNULL((SELECT MAX(ID) FROM FIS_DETAY WITH(NOLOCK)), 4892790)),
              (ISNULL((SELECT MAX(ID) FROM FIS_DETAY_BELGE_DETAY WITH(NOLOCK)), 4892790)),
              (ISNULL((SELECT MAX(ID) FROM FINANS WITH(NOLOCK)), 4892790)),
              (ISNULL((SELECT MAX(ID) FROM FINANS_DETAY WITH(NOLOCK)), 4892790))
            ) AS T(v)
          ), 4892790) + 1;

          DECLARE @fisAciklama nvarchar(500);
          SET @fisAciklama = CASE
            WHEN @sipAciklama <> N'' AND N'${safeNotes}' <> N'' THEN @sipAciklama + N' - ' + N'${safeNotes}'
            WHEN @sipAciklama <> N'' THEN @sipAciklama
            ELSE N'${safeNotes}'
          END;

          INSERT INTO FIS (
            ID, FIS_TURU, LOKASYON, KARSI_LOKASYON, CARI, CARI_ADRES, GONDERIM_ADRESI, PROJE,
            BELGENO, FIS_TARIHI, ISLEM_TARIHI, SEVK_TARIHI, DOVIZ_AD, DOVIZ_KUR, CARI_PERSONEL,
            SATIR_TOPLAM, SATIR_ISKONTO_TOPLAM, FIS_ISKONTO_ORAN, FIS_ISKONTO_TOPLAM,
            YUVARLAMA, KDV_TOPLAM, OTV_TOPLAM, TEFKIFAT_TOPLAM, GENELTOPLAM,
            DURUM, VADE, VADE_SECENEKLERI, ACIKLAMA, YAZAR_KASA_NO,
            FIS_CARIYI_ETKILERMI, CARI_DOVIZ_AD, CARI_DOVIZ_KUR, CARI_TAKIP_SEKLI,
            AKTIF, E_FATURA_GIDIS_KODU, SEVKIYAT_YAPILSIN, MOBIL_MI,
            FIS_SEZON, MARKET_KASA_TERAZI_MARKALARI, FIS_BASIM_TIPI,
            KARGO_CARISI, INTERNET_ODEME_SEKLI, INTERNET_ODEME_ACIKLAMASI,
            VIO_MUHENTYAPILDI, ONAY_BEKLIYOR,
            BAGKUR_ORAN, BAGKUR_TUTAR, STOPAJ_ORAN, STOPAJ_TUTAR, BORSA_ORAN, BORSA_TUTAR, MERA_ORAN, MERA_TUTAR,
            TEVKIF, FIS_OZEL_KOD_1, FIS_OZEL_KOD_2, FIS_OZEL_KOD_3, FIS_OZEL_KOD_4, FIS_OZEL_KOD_5,
            BELGE_YETKILISI, YAZILDI, EMAIL_GONDERILDI, NAKLIYE_ODEME_TIPI, SEVK_SEKLI, ARTTIRIM,
            IHRACAT_GONDERIM_SEKLI, IHRACAT_TESLIM_SEKLI, VERGI_MUAFIYET_KODU, E_FATURA_KABUL_DURUMU,
            DOVIZ_KUR_SECIMI, FIS_ODEME_TIPI_ISKONTOLARI, FIS_STOK_HAREKETLERINI_ETKILER, FIS_ALT_TIPI,
            SEVK_PERSONEL_AD, SEVK_PERSONEL_TCKN, SEVK_ARAC_PLAKA, SEVK_DORSE_PLAKA,
            SGK_DOSYA_NO, SGK_DONEM_BASLANGIC, SGK_DONEM_BITIS, MUHASEBELESTI, PAREKENDE_KDV_KULLAN, SATILDIGI_PAZAR_YERI,
            ODEMEMNIN_YAPILDIGI_TARIH, GONDERIM_TARIHI, SEVK_NEDENI, ASIL_SATICI_CARISI, HAREKET_TARIHI, SATIR_STOPAJ_TOPLAM,
            ALIS_BELGE_NO, ALIS_BELGE_NO_2, ALIS_BELGE_NO_3, ALIS_BELGE_NO_4, ALIS_BELGE_NO_5
          ) VALUES (
            @fisId, ${fisTuru}, @lokId, NULL, @cariId, @cariAdresId, @gonderimAdresiId, @projeId,
            @belgeNo, GETDATE(), GETDATE(), GETDATE(), @dovizId, 1, @cariPersonelId,
            @satirToplam, @satirIskonto, '', 0,
            0, @kdvToplam, 0, 0, @genelToplam,
            1, CAST(GETDATE() AS DATE), 17, @fisAciklama, 0,
            1, @dovizId, 1, 1,
            1, '', 0, 0,
            0, 300, ${fisBasimTipi},
            0, 0, '',
            ' ', 0,
            0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0,
            0, 0, 0, 0,
            2, 1, 1, ${fisAltTipi},
            '', '', '', '',
            '', CAST(GETDATE() AS DATE), CAST(GETDATE() AS DATE), 0, 0, '',
            CAST(GETDATE() AS DATE), CAST(GETDATE() AS DATE), @sevkNedeniId, 0, GETDATE(), 0,
            '', '', '', '', ''
          );
          IF OBJECT_ID('dbo.SEQUNCES', 'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM SEQUNCES WHERE ID = @fisId)
            INSERT INTO SEQUNCES (ID, TABLO, KOD_PC) VALUES (@fisId, 'FIS', 0);

          DECLARE @baseSatirNo bigint;
          SELECT @baseSatirNo = ISNULL(MAX(TRY_CAST(SATIR AS bigint)), 52000) FROM FIS_DETAY WITH(NOLOCK);

          DECLARE @detCount int;
          SELECT @detCount = COUNT(*) FROM SIPARIS_DETAY WITH(NOLOCK) WHERE SIPARIS = @sipId;

          INSERT INTO FIS_DETAY (
            ID, FIS, LOKASYON, STOK, STOK_CINSI, STOK_BIRIM,
            BARKOD, KOLI_BARKODU, DOVIZ_AD, CARPAN, KAB,
            MIKTAR_FIS, MIKTAR_BEDELSIZ, MIKTAR_GIRIS, MIKTAR_CIKIS,
            ANLASMA_FIYAT, FIYAT, DAHIL_FIYAT, TUTAR, DAHIL_TUTAR,
            ISKONTO, ISKONTO_HESAP, OTV_ORAN, OTV_TUTAR, KDV_TOPTAN, TEVKIF,
            KUR, PUAN, FIYAT_FARKI, SERINO_ZORUNLU, FK_PERSONEL, SATIR,
            YEREL_KARSI_FIYAT, BELGE_TARIHINDEKI_SON_ALIS_FIYATI, HK_MIKTAR_FIS,
            FATRALANDIRILMIS_IRSALIYEMI, URETILENMI, FK_VERGI_MUAFIYET_KODU,
            TOPLAM_SATIR_ISKONTOSU, TOPLAM_FIS_ISKONTOSU, TOPLAM_OTV,
            TOPLAM_KDV_MATRAHI, TOPLAM_KDV, TOPLAM_TEVKIF, HESAPLANAN_FIYAT,
            PRIM, FIS_DETAY_SATIR_TURU, LISTE_FIYATI, RECETE_MALIYET_ORANI, RECETE,
            PARTINO, PARTINO_ZORUNLU, YEREL_FIYAT, FIS_TARIHI, ISLENDI,
            ACIKLAMA, KOD, JOKER, BAGLI_SATIR, FIS_TURU, MASA,
            AMBALAJ_BIRIM, AMBALAJ_MIKTAR, AMBALAJ_CARPAN, GTIPNO,
            POS_PROMASYON, POS_PROMASYON_TOPLAM, FK_STOK_TEVKIF_LESTE,
            LOKASYON_MALIYETI, MALIYET_ELLE_GIRILDI, ALT_BIRIM_MIKTARI, UTS,
            ANLASMA_DETAY_ID, STOK_FIYAT_AD, BURUT, FIRE, FIYAT_MANUEL_GIRILDI,
            FK_IHRACAT_KAB_CINSI, IHRACAT_KAB_NO, IHRACAT_KAB_ADET, SATICIKODU,
            PARTI_NO_SON_KULLANMA_TARIHI, BUNDLE_DETAY, FK_GIDER_YERI, KT_BUNDLE_FIYAT, SATIR_STOPAJ_TUTAR
          )
          SELECT
            @fisId + ROW_NUMBER() OVER (ORDER BY SD.ID ASC),
            @fisId,
            ISNULL(SD.LOKASYON, @lokId),
            SD.STOK,
            ISNULL(SD.STOK_CINSI, 1),
            ISNULL(SD.STOK_BIRIM, 1012),
            ISNULL(SD.BARKOD, N''),
            ISNULL(SD.KOLI_BARKODU, N''),
            ISNULL(SD.DOVIZ_AD, @dovizId),
            ISNULL(SD.CARPAN, 1),
            ISNULL(SD.KAB, 0),
            ISNULL(SD.MIKTAR_FIS, 1),
            ISNULL(SD.MIKTAR_BEDELSIZ, 0),
            0,
            ISNULL(SD.MIKTAR_FIS, 1),
            ISNULL(SD.ANLASMA_FIYAT, 0),
            ISNULL(SD.FIYAT, 0),
            ISNULL(SD.DAHIL_FIYAT, 0),
            ISNULL(SD.TUTAR, 0),
            ISNULL(SD.DAHIL_TUTAR, 0),
            CASE WHEN ISNULL(SD.ISKONTO, N'0') = N'0' THEN N'' ELSE SD.ISKONTO END,
            ISNULL(SD.ISKONTO_HESAP, 0),
            ISNULL(SD.OTV_ORAN, 0),
            ISNULL(SD.OTV_TUTAR, 0),
            ISNULL(SD.KDV_TOPTAN, 20),
            ISNULL(SD.TEVKIF, 0),
            ISNULL(SD.KUR, 1),
            0,
            ISNULL(SD.FIYAT_FARKI, 0),
            ISNULL(SD.SERINO_ZORUNLU, 0),
            @cariPersonelId,
            @baseSatirNo + ROW_NUMBER() OVER (ORDER BY SD.ID ASC),
            0, 0, N'',
            0, 0, 0,
            ISNULL(SD.TOPLAM_SATIR_ISKONTOSU, 0),
            ISNULL(SD.TOPLAM_FIS_ISKONTOSU, 0),
            ISNULL(SD.TOPLAM_OTV, 0),
            ISNULL(SD.TOPLAM_KDV_MATRAHI, 0),
            ISNULL(SD.TOPLAM_KDV, 0),
            ISNULL(SD.TOPLAM_TEVKIF, 0),
            ISNULL(SD.HESAPLANAN_FIYAT, ISNULL(SD.FIYAT, 0)),
            0, 0, 0, 0, 0,
            N'', 0, ISNULL(SD.FIYAT, 0), GETDATE(), 0,
            ISNULL(SD.ACIKLAMA, N''), ISNULL(SD.KOD, N''), N'', 0, N'${fisTuru}', 0,
            ISNULL(SD.AMBALAJ_BIRIM, ISNULL(SD.STOK_BIRIM, 1012)),
            ISNULL(SD.AMBALAJ_MIKTAR, ISNULL(SD.MIKTAR_FIS, 1)),
            ISNULL(SD.AMBALAJ_CARPAN, 1), N'',
            0, 0, 0,
            0, 0, 0, N'',
            0, 0, 0, 0, 0,
            0, 0, 0, N'',
            GETDATE(), 0, 0, 0, 0
          FROM SIPARIS_DETAY SD WITH(NOLOCK)
          WHERE SD.SIPARIS = @sipId;

          IF OBJECT_ID('dbo.FIS_DETAY_BELGE_DETAY', 'U') IS NOT NULL
          BEGIN
            INSERT INTO FIS_DETAY_BELGE_DETAY (
              ID, FIS, FIS_DETAY, BELGEID, BELGE_DETAY,
              MIKTAR_FIS, MIKTAR_BEDELSIZ, KAB, SATIR,
              MIKTAR_FIS_KONTROL, MIKTAR_BEDELSIZ_KONTROL, KAB_KONTROL
            )
            SELECT
              @fisId + @detCount + ROW_NUMBER() OVER (ORDER BY SD.ID ASC),
              @fisId,
              @fisId + ROW_NUMBER() OVER (ORDER BY SD.ID ASC),
              @sipId,
              SD.ID,
              ISNULL(SD.MIKTAR_FIS, 1),
              ISNULL(SD.MIKTAR_BEDELSIZ, 0),
              ISNULL(SD.KAB, 0),
              @baseSatirNo + ROW_NUMBER() OVER (ORDER BY SD.ID ASC),
              ISNULL(SD.MIKTAR_FIS, 1),
              ISNULL(SD.MIKTAR_BEDELSIZ, 0),
              ISNULL(SD.KAB, 0)
            FROM SIPARIS_DETAY SD WITH(NOLOCK)
            WHERE SD.SIPARIS = @sipId;
          END;

          DECLARE @finId bigint = @fisId + (@detCount * 2) + 1;
          DECLARE @finDetId bigint = @fisId + (@detCount * 2) + 2;

          INSERT INTO FINANS (
            ID, PROJE, LOKASYON, KASA_AD, BELGENO, TARIH, ISLEM_TARIHI, FIS, BAGLI_FINANS, MOBIL_MI
          ) VALUES (
            @finId, @projeId, @lokId, @kasaId, @belgeNo, GETDATE(), GETDATE(), @fisId, NULL, 0
          );
          IF OBJECT_ID('dbo.SEQUNCES', 'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM SEQUNCES WHERE ID = @finId)
            INSERT INTO SEQUNCES (ID, TABLO, KOD_PC) VALUES (@finId, 'FINANS', 0);

          INSERT INTO FINANS_DETAY (
            ID, FINANS, FINANS_ISLEM_TURU, DOVIZ_AD, KUR,
            KART_BORCLU, KART_ALACAKLI, TUTAR, SECIM, TAHSILID,
            FIS, VADE_TARIHI, FK_PERSONEL, ACIKLAMA, TAKSIT_SAYISI,
            ISLEM_TARIHI, YENIDEN_TAKSIT, CARI_ADRES
          ) VALUES (
            @finDetId, @finId, ${finIslemTuru}, @dovizId, 1,
            @cariId, @fisId, @genelToplam, 0, 0,
            @fisId, CAST(GETDATE() AS DATE), @cariPersonelId, LEFT(@fisAciklama, 250), 1,
            GETDATE(), 1, @cariAdresId
          );
          IF OBJECT_ID('dbo.SEQUNCES', 'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM SEQUNCES WHERE ID = @finDetId)
            INSERT INTO SEQUNCES (ID, TABLO, KOD_PC) VALUES (@finDetId, 'FINANS_DETAY', 0);

          IF OBJECT_ID('dbo.SEQUNCES_DEGISIKLIK', 'U') IS NOT NULL
          BEGIN
            INSERT INTO SEQUNCES_DEGISIKLIK (KOD_PC, SEQUNCES, KULLANICI, ISLEM, TARIH, TABLO)
            VALUES (0, @fisId, ISNULL(@cariPersonelId, 0), 1, GETDATE(), 'FIS');
            INSERT INTO SEQUNCES_DEGISIKLIK (KOD_PC, SEQUNCES, KULLANICI, ISLEM, TARIH, TABLO)
            VALUES (0, @finDetId, ISNULL(@cariPersonelId, 0), 1, GETDATE(), 'FINANS_DETAY');
          END;

          UPDATE SIPARIS
          SET ONAYLI = 1,
              FIS = @fisId,
              ACIKLAMA = LEFT(ISNULL(ACIKLAMA, N'') + N' [Fatura: ' + @belgeNo + N']', 100)
          WHERE ID = @sipId;
        END
        ELSE
        BEGIN
          UPDATE SIPARIS
          SET ONAYLI = 1,
              ACIKLAMA = LEFT(ISNULL(ACIKLAMA, N'') + N' [Fatura: ' + @belgeNo + N']', 100)
          WHERE BELGENO = N'${safeDocNo}' OR CAST(ID AS nvarchar(50)) = N'${safeDocNo}';
        END;

        COMMIT TRANSACTION;
        SELECT '${safeDocNo}' AS docNo, @belgeNo AS invoiceNo;
      END TRY
      BEGIN CATCH
        ROLLBACK TRANSACTION;
        DECLARE @errMsgInv nvarchar(4000);
        SET @errMsgInv = ERROR_MESSAGE();
        RAISERROR(@errMsgInv, 16, 1);
      END CATCH;
    `;

    const res = await executeJsonQuery(sqlScript);
    return { docNo, invoiceNo: res[0]?.invoiceNo || safeInvNo };
  },

  // 6. CANLI CARİ HESAP EKSTRESİ (MÜŞTERİ HESAP HAREKETLERİ)
  async getCustomerStatement(idOrCode, startDate, endDate) {
    const safeParam = String(idOrCode || '').replace(/'/g, "''");
    
    // 1. Müşteri Bilgilerini Çek
    const isNum = !isNaN(Number(safeParam)) && safeParam.length <= 10;
    const custWhere = isNum
      ? `(C.ID = ${safeParam} OR C.KOD = '${safeParam}')`
      : `(C.KOD = '${safeParam}' OR C.AD LIKE '%${safeParam}%')`;

    const custQuery = `
      SELECT TOP 1 
        C.ID AS id,
        C.KOD AS code,
        C.AD AS name,
        ISNULL(A.ADRES, '') AS address,
        ISNULL(A.TELEFON_CEP, ISNULL(A.TELEFON, '')) AS phone,
        ISNULL(C.VERGI_DAIRESI, '') AS taxOffice,
        ISNULL(C.VERGI_NUMARASI, ISNULL(C.KIMLIK_NO, '')) AS taxNumber,
        ISNULL(B.BAKIYE, 0) AS balance
      FROM CARI C WITH(NOLOCK)
      LEFT JOIN CARI_BAKIYELER B WITH(NOLOCK) ON B.ID = C.ID
      LEFT JOIN CARI_ADRES A WITH(NOLOCK) ON A.CARI = C.ID AND A.VARSAYILAN = 1
      WHERE ${custWhere}
    `;

    let custRows;
    try {
      custRows = await executeJsonQuery(custQuery);
    } catch {
      custRows = await executeJsonQuery(`
        SELECT TOP 1
          C.ID AS id,
          C.KOD AS code,
          C.AD AS name,
          '' AS address,
          '' AS phone,
          ISNULL(C.VERGI_DAIRESI, '') AS taxOffice,
          ISNULL(C.VERGI_NUMARASI, ISNULL(C.KIMLIK_NO, '')) AS taxNumber,
          0 AS balance
        FROM CARI C WITH(NOLOCK)
        WHERE ${custWhere}
      `);
    }
    if (!custRows || custRows.length === 0) {
      return { customer: null, movements: [], summary: { totalDebit: 0, totalCredit: 0, closingBalance: 0 } };
    }

    const customer = custRows[0];
    const customerId = customer.id;

    // 2. Hareketleri Çek
    let dateFilter = '';
    if (startDate) {
      dateFilter += ` AND FD.ISLEM_TARIHI >= '${startDate.replace(/'/g, "''")}'`;
    }
    if (endDate) {
      dateFilter += ` AND FD.ISLEM_TARIHI <= '${endDate.replace(/'/g, "''")} 23:59:59'`;
    }

    const movesQuery = `
      SELECT TOP 500
        FD.ID AS id,
        CONVERT(varchar(10), FD.ISLEM_TARIHI, 120) AS date,
        CONVERT(varchar(5), FD.ISLEM_TARIHI, 108) AS time,
        ISNULL(NULLIF(FD.BELGENO, ''), ISNULL(F.BELGENO, '-')) AS docNo,
        ISNULL(FIT.AD, 'Finans Hareketi') AS transactionType,
        ISNULL(FD.ACIKLAMA, '') AS description,
        CASE WHEN FD.KART_BORCLU = ${customerId} THEN FD.TUTAR ELSE 0 END AS debit,
        CASE WHEN FD.KART_ALACAKLI = ${customerId} THEN FD.TUTAR ELSE 0 END AS credit
      FROM FINANS_DETAY FD WITH(NOLOCK)
      LEFT JOIN FINANS F WITH(NOLOCK) ON F.ID = FD.FINANS
      LEFT JOIN FINANS_ISLEM_TURU FIT WITH(NOLOCK) ON FIT.ID = FD.FINANS_ISLEM_TURU
      WHERE (FD.KART_BORCLU = ${customerId} OR FD.KART_ALACAKLI = ${customerId})
        ${dateFilter}
      ORDER BY FD.ISLEM_TARIHI ASC
    `;

    const moveRows = (await executeJsonQuery(movesQuery)) || [];

    let currentRunningBalance = 0;
    let totalDebit = 0;
    let totalCredit = 0;

    const formattedMovements = moveRows.map(m => {
      const debit = Number(m.debit || 0);
      const credit = Number(m.credit || 0);
      totalDebit += debit;
      totalCredit += credit;
      currentRunningBalance += (debit - credit);

      return {
        id: String(m.id),
        date: String(m.date || ''),
        time: String(m.time || ''),
        docNo: String(m.docNo || '-'),
        transactionType: String(m.transactionType || 'Finans Hareketi'),
        description: String(m.description || ''),
        debit: Math.round(debit * 100) / 100,
        credit: Math.round(credit * 100) / 100,
        balance: Math.round(currentRunningBalance * 100) / 100,
      };
    });

    return {
      customer: {
        id: String(customer.id),
        code: String(customer.code),
        name: String(customer.name),
        address: String(customer.address || ''),
        phone: String(customer.phone || ''),
        taxOffice: String(customer.taxOffice || ''),
        taxNumber: String(customer.taxNumber || ''),
        balance: Number(customer.balance || 0),
      },
      movements: formattedMovements,
      summary: {
        totalDebit: Math.round(totalDebit * 100) / 100,
        totalCredit: Math.round(totalCredit * 100) / 100,
        closingBalance: Math.round(currentRunningBalance * 100) / 100,
      },
    };
  },

  // 7. MOBİLDEN GELEN SAHA İADE / DEĞİŞİM FİŞİNİ ERP12'YE KAYDET
  async createReturn({ companyCode, period, returnRecord }) {
    erpQueries.invalidateCustomerCache();
    erpQueries.invalidateProductCache();
    const docNo = returnRecord.receiptNo || 'IAD-' + Date.now().toString().slice(-6);
    const safeCustCode = (returnRecord.customerCode || '').replace(/'/g, "''");
    const safeReceiptNo = docNo.replace(/'/g, "''");
    const safeTempId = (returnRecord.tempId || docNo).replace(/'/g, "''");
    const safeNotes = (returnRecord.notes || 'Saha İade ve Değişim Fişi').replace(/'/g, "''");

    const itemCount = returnRecord.items?.length || 0;
    const itemSummary = (returnRecord.items || [])
      .map((it) => `${it.productName || it.productCode} (${it.quantity} ${it.unit || 'Adet'}) [${it.reason || 'İade'}]`)
      .slice(0, 3)
      .join(', ');

    const fullNote = `[Saha İade Fişi - ${safeTempId}] ${itemCount} Kalem (${itemSummary}) - ${safeNotes}`.trim().replace(/'/g, "''");

    const sqlScript = `
      BEGIN TRANSACTION;
      BEGIN TRY
        DECLARE @cariId bigint;
        SELECT TOP 1 @cariId = ID FROM CARI WHERE KOD = '${safeCustCode}';
        IF @cariId IS NULL SELECT TOP 1 @cariId = ID FROM CARI WHERE AKTIF = 1 ORDER BY ID ASC;

        DECLARE @finansId bigint;
        SELECT @finansId = ISNULL(MAX(ID), 3931620) + 1 FROM FINANS;

        DECLARE @kasaId bigint;
        SELECT TOP 1 @kasaId = ID FROM KASA_AD WHERE ID = 75923;
        IF @kasaId IS NULL SELECT TOP 1 @kasaId = ID FROM KASA_AD ORDER BY ID ASC;

        DECLARE @lokId bigint;
        SELECT TOP 1 @lokId = ID FROM LOKASYON WHERE ID = 75919;
        IF @lokId IS NULL SELECT TOP 1 @lokId = ID FROM LOKASYON ORDER BY ID ASC;

        DECLARE @projeId bigint;
        SELECT TOP 1 @projeId = ID FROM PROJE WHERE ID = 75916;
        IF @projeId IS NULL SELECT TOP 1 @projeId = ID FROM PROJE ORDER BY ID ASC;

        INSERT INTO FINANS (
          ID, PROJE, LOKASYON, KASA_AD, BELGENO, 
          TARIH, ISLEM_TARIHI, FIS, MOBIL_MI
        ) VALUES (
          @finansId, @projeId, @lokId, @kasaId, '${safeReceiptNo}', 
          GETDATE(), GETDATE(), @finansId, 1
        );

        DECLARE @detId bigint;
        SET @detId = @finansId + 1;
        INSERT INTO FINANS_DETAY (
          ID, FINANS, FINANS_ISLEM_TURU, DOVIZ_AD, KUR, 
          KART_BORCLU, KART_ALACAKLI, TUTAR, SECIM, 
          ACIKLAMA, BELGENO, ISLEM_TARIHI
        ) VALUES (
          @detId, @finansId, 1, 1, 1.0, 
          @kasaId, @cariId, ${returnRecord.grandTotal || 0}, 0, 
          '${fullNote}', '${safeReceiptNo}', GETDATE()
        );

        UPDATE SEQUNCES SET ID = @detId WHERE TABLO IN ('FINANS', 'FINANS_DETAY') AND KOD_PC = 0;

        COMMIT TRANSACTION;
        SELECT '${docNo}' AS docNo;
      END TRY
      BEGIN CATCH
        ROLLBACK TRANSACTION;
        DECLARE @errMsgRet nvarchar(4000);
        SET @errMsgRet = ERROR_MESSAGE();
        RAISERROR(@errMsgRet, 16, 1);
      END CATCH;
    `;

    const res = await executeJsonQuery(sqlScript);
    return { docNo: res[0]?.docNo || docNo };
  },

  // 8. CARİ GEÇMİŞ YILLAR DAHİL TÜM ÜRÜN ALIMLARI VE İŞLEM DETAYLARI
  async getCustomerHistory(idOrCode) {
    const safeParam = String(idOrCode || '').replace(/'/g, "''");
    const isNum = !isNaN(Number(safeParam)) && safeParam.length <= 10;
    const custWhere = isNum
      ? `(C.ID = ${safeParam} OR C.KOD = '${safeParam}')`
      : `(C.KOD = '${safeParam}' OR C.AD LIKE '%${safeParam}%')`;

    const custQuery = `
      SELECT TOP 1
        C.ID AS id,
        C.KOD AS code,
        C.AD AS name,
        ISNULL(B.BAKIYE, 0) AS balance
      FROM CARI C WITH(NOLOCK)
      LEFT JOIN CARI_BAKIYELER B WITH(NOLOCK) ON B.ID = C.ID
      WHERE ${custWhere}
    `;

    let custRows;
    try {
      custRows = await executeJsonQuery(custQuery);
    } catch {
      custRows = await executeJsonQuery(`
        SELECT TOP 1 C.ID AS id, C.KOD AS code, C.AD AS name, 0 AS balance
        FROM CARI C WITH(NOLOCK)
        WHERE ${custWhere}
      `);
    }
    if (!custRows || custRows.length === 0) {
      return { customer: null, years: [], items: [], financials: [] };
    }

    const customer = custRows[0];
    const safeCode = String(customer.code || '').replace(/'/g, "''");

    // Aynı firmanın geçmiş yıl arşiv veritabanları varsa otomatik tespit et (örn: OSMANLIGIDA, OSMANLIGIDA2025 vb.)
    const currentDbRows = await executeJsonQuery(`SELECT DB_NAME() AS dbName`).catch(() => []);
    const currentDbName = currentDbRows?.[0]?.dbName || 'OSMANLIGIDA';
    const basePrefix = currentDbName.replace(/[_-]?\d{4}$/, '');

    const candidateDbs = await executeJsonQuery(`
      SELECT name FROM sys.databases
      WHERE state = 0 AND name LIKE '${basePrefix.replace(/'/g, "''")}%'
      ORDER BY name DESC
    `).catch(() => [{ name: currentDbName }]);

    const validDbs = [];
    for (const row of candidateDbs || []) {
      const dbName = row.name;
      if (!dbName || /[^\w]/.test(dbName)) continue;
      const checkTbl = await executeJsonQuery(`
        SELECT COUNT(*) AS cnt
        FROM [${dbName}].INFORMATION_SCHEMA.TABLES
        WHERE TABLE_NAME IN ('FIS', 'FIS_DETAY', 'CARI')
      `).catch(() => []);
      if ((checkTbl?.[0]?.cnt || 0) >= 3) {
        validDbs.push(dbName);
      }
    }
    if (validDbs.length === 0) validDbs.push(currentDbName);

    const allItems = [];
    const allFinancials = [];

    for (const dbName of validDbs) {
      // 1) Fiş / Fatura / İrsaliye + Sipariş satır bazlı ürün geçmişi
      const itemsQuery = `
        DECLARE @cid bigint;
        SELECT TOP 1 @cid = ID FROM [${dbName}].dbo.CARI WITH(NOLOCK) WHERE KOD = '${safeCode}';

        IF @cid IS NOT NULL
        BEGIN
          SELECT TOP 1500 * FROM (
            SELECT
              CAST(FD.ID AS varchar(30)) AS id,
              F.FIS_TARIHI AS sortDate,
              YEAR(F.FIS_TARIHI) AS [year],
              CONVERT(varchar(10), F.FIS_TARIHI, 120) AS [date],
              CONVERT(varchar(5), F.FIS_TARIHI, 108) AS [time],
              ISNULL(NULLIF(F.BELGENO, ''), CAST(F.ID AS varchar(20))) AS docNo,
              ISNULL(FT.AD, 'Satış İşlemi') AS docType,
              CASE WHEN F.FIS_TURU IN (4, 8, 12, 22) THEN 1 ELSE 0 END AS isReturn,
              CAST(ISNULL(FD.STOK, 0) AS varchar(30)) AS productId,
              ISNULL(S.KOD, '') AS productCode,
              ISNULL(S.AD, ISNULL(FD.ACIKLAMA, 'Ürün')) AS productName,
              ISNULL(SB.AD, 'Adet') AS unit,
              ISNULL(FD.MIKTAR_FIS, 0) AS quantity,
              ISNULL(FD.FIYAT, 0) AS unitPrice,
              ISNULL(FD.ISKONTO, '') AS discount,
              ISNULL(FD.KDV_TOPTAN, 0) AS vatRate,
              ISNULL(FD.TUTAR, 0) AS netTotal,
              CASE 
                WHEN ISNULL(FD.DAHIL_TUTAR, 0) > 0 THEN FD.DAHIL_TUTAR
                ELSE ISNULL(FD.TUTAR, 0) * (1.0 + ISNULL(FD.KDV_TOPTAN, 0) / 100.0)
              END AS grandTotal
            FROM [${dbName}].dbo.FIS_DETAY FD WITH(NOLOCK)
            INNER JOIN [${dbName}].dbo.FIS F WITH(NOLOCK) ON F.ID = FD.FIS
            LEFT JOIN [${dbName}].dbo.FIS_TURU FT WITH(NOLOCK) ON FT.ID = F.FIS_TURU
            LEFT JOIN [${dbName}].dbo.STOK S WITH(NOLOCK) ON S.ID = FD.STOK
            LEFT JOIN [${dbName}].dbo.STOK_BIRIM SB WITH(NOLOCK) ON SB.ID = FD.STOK_BIRIM
            WHERE F.CARI = @cid
              AND F.AKTIF = 1
              AND ISNULL(FD.MIKTAR_FIS, 0) > 0

            UNION ALL

            SELECT
              'SIP-' + CAST(SD.ID AS varchar(30)) AS id,
              SP.SIPARIS_TARIHI AS sortDate,
              YEAR(SP.SIPARIS_TARIHI) AS [year],
              CONVERT(varchar(10), SP.SIPARIS_TARIHI, 120) AS [date],
              CONVERT(varchar(5), SP.SIPARIS_TARIHI, 108) AS [time],
              ISNULL(NULLIF(SP.BELGENO, ''), CAST(SP.ID AS varchar(20))) AS docNo,
              'Sipariş' AS docType,
              0 AS isReturn,
              CAST(ISNULL(SD.STOK, 0) AS varchar(30)) AS productId,
              ISNULL(S.KOD, '') AS productCode,
              ISNULL(S.AD, 'Ürün') AS productName,
              ISNULL(SB.AD, 'Adet') AS unit,
              ISNULL(SD.MIKTAR_FIS, 0) AS quantity,
              ISNULL(SD.FIYAT, 0) AS unitPrice,
              ISNULL(SD.ISKONTO, '') AS discount,
              ISNULL(SD.KDV_TOPTAN, 0) AS vatRate,
              ISNULL(SD.TUTAR, 0) AS netTotal,
              CASE 
                WHEN ISNULL(SD.DAHIL_TUTAR, 0) > 0 THEN SD.DAHIL_TUTAR
                ELSE ISNULL(SD.TUTAR, 0) * (1.0 + ISNULL(SD.KDV_TOPTAN, 0) / 100.0)
              END AS grandTotal
            FROM [${dbName}].dbo.SIPARIS_DETAY SD WITH(NOLOCK)
            INNER JOIN [${dbName}].dbo.SIPARIS SP WITH(NOLOCK) ON SP.ID = SD.SIPARIS
            LEFT JOIN [${dbName}].dbo.STOK S WITH(NOLOCK) ON S.ID = SD.STOK
            LEFT JOIN [${dbName}].dbo.STOK_BIRIM SB WITH(NOLOCK) ON SB.ID = SD.STOK_BIRIM
            WHERE SP.CARI = @cid
              AND SP.AKTIF = 1
              AND ISNULL(SD.MIKTAR_FIS, 0) > 0
          ) T
          ORDER BY T.sortDate DESC;
        END
      `;

      const dbItems = await executeJsonQuery(itemsQuery).catch((err) => {
        console.warn(`[${dbName}] ürün geçmişi sorgu uyarısı:`, err.message);
        return [];
      });

      if (Array.isArray(dbItems)) {
        dbItems.forEach((it) => {
          allItems.push({
            id: `${dbName}-${it.id}`,
            year: Number(it.year) || new Date().getFullYear(),
            date: String(it.date || ''),
            time: String(it.time || ''),
            docNo: String(it.docNo || '-'),
            docType: String(it.docType || 'Satış İşlemi'),
            isReturn: Boolean(it.isReturn),
            productId: String(it.productId || ''),
            productCode: String(it.productCode || ''),
            productName: String(it.productName || 'Ürün'),
            unit: String(it.unit || 'Adet'),
            quantity: Math.round(Number(it.quantity || 0) * 100) / 100,
            unitPrice: Math.round(Number(it.unitPrice || 0) * 100) / 100,
            discount: String(it.discount || ''),
            vatRate: Number(it.vatRate || 0),
            netTotal: Math.round(Number(it.netTotal || 0) * 100) / 100,
            grandTotal: Math.round(Number(it.grandTotal || 0) * 100) / 100,
          });
        });
      }

      // 2) Finans / Tahsilat / Fatura / Devir işlemleri
      const finQuery = `
        DECLARE @cid bigint;
        SELECT TOP 1 @cid = ID FROM [${dbName}].dbo.CARI WITH(NOLOCK) WHERE KOD = '${safeCode}';

        IF @cid IS NOT NULL
        BEGIN
          SELECT TOP 1000
            CAST(FD.ID AS varchar(30)) AS id,
            YEAR(FD.ISLEM_TARIHI) AS [year],
            CONVERT(varchar(10), FD.ISLEM_TARIHI, 120) AS [date],
            CONVERT(varchar(5), FD.ISLEM_TARIHI, 108) AS [time],
            ISNULL(NULLIF(FD.BELGENO, ''), ISNULL(F.BELGENO, '-')) AS docNo,
            ISNULL(FIT.AD, 'Finans İşlemi') AS transactionType,
            ISNULL(FD.ACIKLAMA, '') AS description,
            CASE WHEN FD.KART_BORCLU = @cid THEN FD.TUTAR ELSE 0 END AS debit,
            CASE WHEN FD.KART_ALACAKLI = @cid THEN FD.TUTAR ELSE 0 END AS credit
          FROM [${dbName}].dbo.FINANS_DETAY FD WITH(NOLOCK)
          LEFT JOIN [${dbName}].dbo.FINANS F WITH(NOLOCK) ON F.ID = FD.FINANS
          LEFT JOIN [${dbName}].dbo.FINANS_ISLEM_TURU FIT WITH(NOLOCK) ON FIT.ID = FD.FINANS_ISLEM_TURU
          WHERE (FD.KART_BORCLU = @cid OR FD.KART_ALACAKLI = @cid)
          ORDER BY FD.ISLEM_TARIHI DESC, FD.ID DESC;
        END
      `;

      const dbFins = await executeJsonQuery(finQuery).catch((err) => {
        console.warn(`[${dbName}] finans geçmişi sorgu uyarısı:`, err.message);
        return [];
      });

      if (Array.isArray(dbFins)) {
        dbFins.forEach((fn) => {
          allFinancials.push({
            id: `${dbName}-fin-${fn.id}`,
            year: Number(fn.year) || new Date().getFullYear(),
            date: String(fn.date || ''),
            time: String(fn.time || ''),
            docNo: String(fn.docNo || '-'),
            transactionType: String(fn.transactionType || 'Finans İşlemi'),
            description: String(fn.description || ''),
            debit: Math.round(Number(fn.debit || 0) * 100) / 100,
            credit: Math.round(Number(fn.credit || 0) * 100) / 100,
          });
        });
      }
    }

    // Kronolojik sırala (en yeni en üstte)
    allItems.sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
    allFinancials.sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));

    const yearSet = new Set();
    allItems.forEach((i) => { if (i.year) yearSet.add(i.year); });
    allFinancials.forEach((f) => { if (f.year) yearSet.add(f.year); });
    const years = Array.from(yearSet).sort((a, b) => Number(b) - Number(a));

    return {
      customer: {
        id: String(customer.id),
        code: String(customer.code),
        name: String(customer.name),
        balance: Number(customer.balance || 0),
      },
      years,
      items: allItems,
      financials: allFinancials,
    };
  },

  // 8. PLASİYER & FİRMA YETKİLİSİ KULLANICI HESAPLARI (FİRMA KODU, KULLANICI KODU, AD, SOYAD, ŞİFRE, YETKİ ROLÜ)
  async ensurePlasiyerAccountsTable() {
    const ddl = `
      IF OBJECT_ID('dbo.ERP12_MOBIL_PLASIYER', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.ERP12_MOBIL_PLASIYER (
          ID int IDENTITY(1,1) PRIMARY KEY,
          FIRMA_KODU nvarchar(50) NOT NULL,
          PLASIYER_KODU nvarchar(50) NOT NULL,
          AD nvarchar(100) NOT NULL,
          SOYAD nvarchar(100) NOT NULL,
          SIFRE nvarchar(100) NOT NULL,
          YETKI_ROLU nvarchar(20) NOT NULL DEFAULT 'plasiyer',
          TUM_RUTLARI_GORUR bit NOT NULL DEFAULT 0,
          IZINLI_RUT_BOLGELERI nvarchar(max) NULL,
          TUM_STOKLARI_GORUR bit NOT NULL DEFAULT 0,
          IZINLI_STOK_GRUPLARI nvarchar(max) NULL,
          AKTIF bit NOT NULL DEFAULT 1,
          GUNCELLEME_TARIHI datetime NOT NULL DEFAULT GETDATE()
        );
      END
      ELSE
      BEGIN
        IF COL_LENGTH('dbo.ERP12_MOBIL_PLASIYER', 'YETKI_ROLU') IS NULL
          ALTER TABLE dbo.ERP12_MOBIL_PLASIYER ADD YETKI_ROLU nvarchar(20) NOT NULL CONSTRAINT DF_ERP12_MOBIL_PLASIYER_ROL DEFAULT 'plasiyer';
        IF COL_LENGTH('dbo.ERP12_MOBIL_PLASIYER', 'TUM_RUTLARI_GORUR') IS NULL
          ALTER TABLE dbo.ERP12_MOBIL_PLASIYER ADD TUM_RUTLARI_GORUR bit NOT NULL CONSTRAINT DF_ERP12_MOBIL_PLASIYER_TUMRUT DEFAULT 0;
        IF COL_LENGTH('dbo.ERP12_MOBIL_PLASIYER', 'IZINLI_RUT_BOLGELERI') IS NULL
          ALTER TABLE dbo.ERP12_MOBIL_PLASIYER ADD IZINLI_RUT_BOLGELERI nvarchar(max) NULL;
        IF COL_LENGTH('dbo.ERP12_MOBIL_PLASIYER', 'TUM_STOKLARI_GORUR') IS NULL
          ALTER TABLE dbo.ERP12_MOBIL_PLASIYER ADD TUM_STOKLARI_GORUR bit NOT NULL CONSTRAINT DF_ERP12_MOBIL_PLASIYER_TUMSTOK DEFAULT 0;
        IF COL_LENGTH('dbo.ERP12_MOBIL_PLASIYER', 'IZINLI_STOK_GRUPLARI') IS NULL
          ALTER TABLE dbo.ERP12_MOBIL_PLASIYER ADD IZINLI_STOK_GRUPLARI nvarchar(max) NULL;
      END
      SELECT 1 AS ok;
    `;
    await executeJsonQuery(ddl);
  },

  // 8.1 ERP12 PERSONEL TANITIM KARTI (CARI_TUR = 2 -> ***) ÜZERİNDEN OTOMATİK PLASİYER, RUT BÖLGELERİ VE LOKASYON STOK KAPSAMI OKUMA
  async getErpNativePlasiyers(companyCode = '') {
    try {
      const cCode = String(companyCode || '').trim().toUpperCase();
      const rows = await executeJsonQuery(`
        SELECT
          C.ID AS cariId,
          LTRIM(RTRIM(ISNULL(C.KOD, ''))) AS cariCode,
          LTRIM(RTRIM(ISNULL(C.AD, ''))) AS fullName,
          CP.ID AS personelId,
          CAST(CP.PERSONEL_NO AS nvarchar(50)) AS repCode,
          LTRIM(RTRIM(ISNULL(CP.SIFRE, ''))) AS [password],
          ISNULL(CP.CARI_PERSONEL_TUR, 0) AS personelTurId,
          LTRIM(RTRIM(ISNULL(CPT.AD, ''))) AS personelTurName,
          ISNULL(CP.LOKASYON, 0) AS locationId,
          LTRIM(RTRIM(ISNULL(L.AD, ''))) AS locationName
        FROM CARI C WITH(NOLOCK)
        INNER JOIN CARI_PERSONEL CP WITH(NOLOCK) ON CP.CARI = C.ID
        LEFT JOIN CARI_PERSONEL_TUR CPT WITH(NOLOCK) ON CPT.ID = CP.CARI_PERSONEL_TUR
        LEFT JOIN LOKASYON L WITH(NOLOCK) ON L.ID = CP.LOKASYON
        WHERE C.CARI_TUR = 2
          AND C.AKTIF = 1
          AND CP.PERSONEL_NO IS NOT NULL
          AND LTRIM(RTRIM(ISNULL(CP.SIFRE, ''))) <> ''
        ORDER BY CP.PERSONEL_NO ASC, C.AD ASC;
      `);

      if (!Array.isArray(rows) || rows.length === 0) return [];

      // Öncelikle Personel Türü = Plasiyer (CARI_PERSONEL_TUR = 5 veya AD LIKE '%Plasiyer%') olan aktif personelleri filtrele
      const plasiyerTyped = rows.filter(
        (r) =>
          Number(r.personelTurId) === 5 ||
          String(r.personelTurName || '').toLocaleUpperCase('tr-TR').includes('PLAS')
      );

      // Eğer ilgili firmada henüz Personel Türü 'Plasiyer' olarak seçilmemiş ama Personel Kartında (CARI_TUR = 2)
      // Personel No ve Şifre girilmiş kayıtlar varsa, sistem kullanıcıları hariç onları da dahil et
      const targetRows =
        plasiyerTyped.length > 0
          ? plasiyerTyped
          : rows.filter((r) => {
              const upName = String(r.fullName || '').toLocaleUpperCase('tr-TR');
              return !upName.includes('SİSTEM YÖNETİCİ') && !upName.includes('SISTEM YONETICI');
            });

      // Plasiyerlerin ERP12'deki tanımlı Rut Bölgelerini, Lokasyon Stok Gruplarını ve Satılamaz Gruplarını paralel keşfet
      const [repCustomerRows, explicitRootRows, locGroupRows, rootGroupRows, forbiddenGroupRows] =
        await Promise.all([
          executeJsonQuery(`
            SELECT DISTINCT
              X.personelCariId,
              C.KOD AS code,
              ISNULL(CG.AD, '') AS groupName,
              ISNULL(CR_INFO.rootName, '') AS rootName
            FROM (
              SELECT C1.ID AS cariId, C1.TEMSILCI AS personelCariId
              FROM CARI C1 WITH(NOLOCK)
              WHERE C1.AKTIF = 1 AND C1.TEMSILCI IS NOT NULL AND C1.TEMSILCI > 0
              UNION
              SELECT CRC.CARI AS cariId, CR.CARI AS personelCariId
              FROM CARI_ROOT_CARI CRC WITH(NOLOCK)
              INNER JOIN CARI_ROOT CR WITH(NOLOCK) ON CR.ID = CRC.CARI_ROOT
              WHERE CR.CARI IS NOT NULL AND CR.CARI > 0
              UNION
              SELECT S.CARI AS cariId, S.CARI_PERSONEL AS personelCariId
              FROM SIPARIS S WITH(NOLOCK)
              WHERE S.AKTIF = 1 AND S.CARI_PERSONEL IS NOT NULL AND S.CARI_PERSONEL > 0
              UNION
              SELECT F.CARI AS cariId, F.CARI_PERSONEL AS personelCariId
              FROM FIS F WITH(NOLOCK)
              WHERE F.AKTIF = 1 AND F.CARI_PERSONEL IS NOT NULL AND F.CARI_PERSONEL > 0
            ) X
            INNER JOIN CARI C WITH(NOLOCK) ON C.ID = X.cariId
            LEFT JOIN CARI_GRUP CG WITH(NOLOCK) ON CG.ID = C.CARI_GRUP
            OUTER APPLY (
              SELECT TOP 1 LTRIM(RTRIM(CR2.AD)) AS rootName
              FROM CARI_ROOT_CARI CRC2 WITH(NOLOCK)
              INNER JOIN CARI_ROOT CR2 WITH(NOLOCK) ON CR2.ID = CRC2.CARI_ROOT
              WHERE CRC2.CARI = C.ID AND LTRIM(RTRIM(ISNULL(CR2.AD, ''))) <> ''
            ) CR_INFO
            WHERE C.AKTIF = 1 AND ISNULL(C.CARI_TUR, 1) <> 2
          `).catch(() => []),
          executeJsonQuery(`
            SELECT DISTINCT
              CR.CARI AS personelCariId,
              LTRIM(RTRIM(CR.AD)) AS rootName
            FROM CARI_ROOT CR WITH(NOLOCK)
            WHERE CR.CARI IS NOT NULL AND LTRIM(RTRIM(ISNULL(CR.AD, ''))) <> ''
          `).catch(() => []),
          executeJsonQuery(`
            SELECT DISTINCT
              SM.LOKASYON AS locationId,
              LTRIM(RTRIM(G.AD)) AS groupName
            FROM STOK_MIKTAR SM WITH(NOLOCK)
            INNER JOIN STOK S WITH(NOLOCK) ON S.ID = SM.STOK
            INNER JOIN STOK_GRUP G WITH(NOLOCK) ON G.ID = S.STOK_GRUP
            WHERE S.AKTIF = 1
              AND LTRIM(RTRIM(ISNULL(G.AD, ''))) <> ''
              AND ISNULL(G.AD, '') NOT LIKE '%MASRAF%'
          `).catch(() => []),
          executeJsonQuery(`
            SELECT DISTINCT
              CR.CARI AS personelCariId,
              LTRIM(RTRIM(G.AD)) AS groupName
            FROM CARI_ROOT_STOK_GRUP CRSG WITH(NOLOCK)
            INNER JOIN CARI_ROOT CR WITH(NOLOCK) ON CR.ID = CRSG.CARI_ROOT
            INNER JOIN STOK_GRUP G WITH(NOLOCK) ON G.ID = CRSG.TR_STOK_GRUP
            WHERE LTRIM(RTRIM(ISNULL(G.AD, ''))) <> ''
          `).catch(() => []),
          executeJsonQuery(`
            SELECT DISTINCT
              CSG.CARI AS personelCariId,
              LTRIM(RTRIM(G.AD)) AS groupName
            FROM CARI_SATILAMAZ_GRUPLAR CSG WITH(NOLOCK)
            INNER JOIN STOK_GRUP G WITH(NOLOCK) ON G.ID = CSG.STOK_GRUP
            WHERE LTRIM(RTRIM(ISNULL(G.AD, ''))) <> ''
          `).catch(() => []),
        ]);

      const regionsByPersonelCari = new Map();
      if (Array.isArray(explicitRootRows)) {
        for (const er of explicitRootRows) {
          const pid = String(er.personelCariId || '').trim();
          const rName = normalizeRegionLabel(er.rootName);
          if (!pid || !rName) continue;
          if (!regionsByPersonelCari.has(pid)) regionsByPersonelCari.set(pid, new Set());
          regionsByPersonelCari.get(pid).add(rName);
        }
      }
      if (Array.isArray(repCustomerRows)) {
        for (const rcr of repCustomerRows) {
          const pid = String(rcr.personelCariId || '').trim();
          if (!pid) continue;
          const reg = extractCustomerRegionCode(rcr.code, rcr.groupName, rcr.rootName);
          if (!reg || reg === 'GENEL') continue;
          if (!regionsByPersonelCari.has(pid)) regionsByPersonelCari.set(pid, new Set());
          regionsByPersonelCari.get(pid).add(reg);
        }
      }

      const forbiddenGroupsByPersonelCari = new Map();
      if (Array.isArray(forbiddenGroupRows)) {
        for (const fgr of forbiddenGroupRows) {
          const pid = String(fgr.personelCariId || '').trim();
          const gName = String(fgr.groupName || '').trim();
          if (!pid || !gName) continue;
          if (!forbiddenGroupsByPersonelCari.has(pid)) forbiddenGroupsByPersonelCari.set(pid, new Set());
          forbiddenGroupsByPersonelCari.get(pid).add(gName);
        }
      }

      const rootGroupsByPersonelCari = new Map();
      if (Array.isArray(rootGroupRows)) {
        for (const rgr of rootGroupRows) {
          const pid = String(rgr.personelCariId || '').trim();
          const gName = String(rgr.groupName || '').trim();
          if (!pid || !gName) continue;
          if (!rootGroupsByPersonelCari.has(pid)) rootGroupsByPersonelCari.set(pid, new Set());
          rootGroupsByPersonelCari.get(pid).add(gName);
        }
      }

      const groupsByLocationId = new Map();
      if (Array.isArray(locGroupRows)) {
        for (const lgr of locGroupRows) {
          const lid = String(lgr.locationId || '').trim();
          const gName = String(lgr.groupName || '').trim();
          if (!lid || !gName) continue;
          if (!groupsByLocationId.has(lid)) groupsByLocationId.set(lid, new Set());
          groupsByLocationId.get(lid).add(gName);
        }
      }

      const splitName = (full) => {
        const cleaned = String(full || '').trim().replace(/\s+/g, ' ');
        if (!cleaned) return { firstName: 'Plasiyer', lastName: '' };
        const parts = cleaned.split(' ');
        if (parts.length === 1) return { firstName: parts[0], lastName: '' };
        return {
          firstName: parts.slice(0, -1).join(' '),
          lastName: parts[parts.length - 1],
        };
      };

      const nowIso = new Date().toISOString();
      return targetRows.map((r) => {
        const repCode = String(r.repCode || '').trim().toUpperCase();
        const pid = String(r.cariId || '').trim();
        const lid = String(r.locationId || '').trim();
        const { firstName, lastName } = splitName(r.fullName);

        const erpAssignedRegions = Array.from(regionsByPersonelCari.get(pid) || []).sort((a, b) =>
          a.localeCompare(b, 'tr-TR')
        );
        const forbiddenSet = forbiddenGroupsByPersonelCari.get(pid) || new Set();
        const erpForbiddenStockGroups = Array.from(forbiddenSet);

        const rawGroupsSet =
          rootGroupsByPersonelCari.get(pid) ||
          groupsByLocationId.get(lid) ||
          new Set();
        const erpAssignedStockGroups = Array.from(rawGroupsSet)
          .filter((g) => !forbiddenSet.has(g))
          .sort((a, b) => a.localeCompare(b, 'tr-TR'));

        return {
          id: `acc-${cCode || 'ERP'}-${repCode}`,
          companyCode: cCode,
          repCode,
          firstName,
          lastName,
          password: String(r.password || '').trim(),
          accountRole: 'plasiyer',
          isErpSynced: true,
          erpCariId: pid,
          erpCariCode: String(r.cariCode || ''),
          locationName: String(r.locationName || ''),
          viewAllRoutes: false,
          erpAssignedRegions,
          viewAllStocks: false,
          erpAssignedStockGroups,
          erpForbiddenStockGroups,
          updatedAt: nowIso,
        };
      });
    } catch (err) {
      console.warn('ERP12 CARI_PERSONEL plasiyer okuma uyarısı:', err.message);
      return [];
    }
  },

  async getPlasiyerAccounts(companyCode = '') {
    const cCode = String(companyCode || '').trim().toUpperCase();
    const nativeList = await this.getErpNativePlasiyers(cCode);
    let customList = [];
    try {
      await this.ensurePlasiyerAccountsTable();
      const esc = (v) => String(v ?? '').replace(/'/g, "''").trim();
      const filterSql = cCode
        ? `AND UPPER(FIRMA_KODU) = UPPER(N'${esc(cCode)}')`
        : '';
      const rows = await executeJsonQuery(`
        SELECT
          ID AS id,
          FIRMA_KODU AS companyCode,
          PLASIYER_KODU AS repCode,
          AD AS firstName,
          SOYAD AS lastName,
          SIFRE AS [password],
          ISNULL(YETKI_ROLU, 'plasiyer') AS accountRole,
          ISNULL(TUM_RUTLARI_GORUR, 0) AS viewAllRoutes,
          IZINLI_RUT_BOLGELERI AS allowedRouteRegionsJson,
          ISNULL(TUM_STOKLARI_GORUR, 0) AS viewAllStocks,
          IZINLI_STOK_GRUPLARI AS allowedStockGroupsJson,
          CONVERT(varchar(19), GUNCELLEME_TARIHI, 120) AS updatedAt
        FROM dbo.ERP12_MOBIL_PLASIYER WITH(NOLOCK)
        WHERE AKTIF = 1 ${filterSql}
        ORDER BY FIRMA_KODU ASC, PLASIYER_KODU ASC;
      `);
      if (Array.isArray(rows)) {
        customList = rows
          .filter(
            (r) =>
              !(
                String(r.repCode || '').toUpperCase() === 'PLS01' &&
                String(r.firstName || '').toLowerCase() === 'ahmet'
              )
          )
          .map((r) => ({
            id: `sql-${r.companyCode}-${r.repCode}`,
            companyCode: String(r.companyCode || cCode).toUpperCase(),
            repCode: String(r.repCode || '').toUpperCase(),
            firstName: String(r.firstName || ''),
            lastName: String(r.lastName || ''),
            password: String(r.password || ''),
            accountRole: String(r.accountRole || '').toLowerCase() === 'manager' ? 'manager' : 'plasiyer',
            viewAllRoutes: Boolean(r.viewAllRoutes),
            allowedRouteRegions: parseJsonStringArray(r.allowedRouteRegionsJson),
            viewAllStocks: Boolean(r.viewAllStocks),
            allowedStockGroups: parseJsonStringArray(r.allowedStockGroupsJson),
            updatedAt: String(r.updatedAt || ''),
          }));
      }
    } catch (err) {
      console.warn('Plasiyer tablosu okuma uyarısı:', err.message);
    }

    const merged = new Map();
    for (const acc of customList) {
      if (!acc.repCode) continue;
      merged.set(acc.repCode.toUpperCase(), acc);
    }
    // ERP12 Personel Tanıtım Kartı (*** -> Personel No & Şifre) kayıtları birincil kaynaktır;
    // ancak Yöneticinin Ayarlardan bu plasiyer için kaydettiği Rut & Stok yetki tercihlerini (customAcc) korur!
    for (const nativeAcc of nativeList) {
      if (!nativeAcc.repCode) continue;
      const rKey = nativeAcc.repCode.toUpperCase();
      const customAcc = merged.get(rKey);
      merged.set(rKey, {
        ...nativeAcc,
        accountRole: customAcc?.accountRole === 'manager' ? 'manager' : nativeAcc.accountRole,
        viewAllRoutes: customAcc ? Boolean(customAcc.viewAllRoutes) : false,
        allowedRouteRegions: customAcc?.allowedRouteRegions ?? undefined,
        viewAllStocks: customAcc ? Boolean(customAcc.viewAllStocks) : false,
        allowedStockGroups: customAcc?.allowedStockGroups ?? undefined,
      });
    }
    return Array.from(merged.values());
  },

  async upsertPlasiyerAccount({
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
  }) {
    const esc = (v) => String(v ?? '').replace(/'/g, "''").trim();
    const cCode = esc(companyCode).toUpperCase();
    const rCode = esc(repCode).toUpperCase();
    const fName = esc(firstName);
    const lName = esc(lastName);
    const pwd = String(password ?? '').replace(/'/g, "''");
    const hasExplicitRole = accountRole === 'manager' || accountRole === 'plasiyer';
    const roleVal = accountRole === 'manager' ? 'manager' : 'plasiyer';

    const hasViewAllRoutes = typeof viewAllRoutes === 'boolean';
    const viewAllRoutesBit = viewAllRoutes ? 1 : 0;
    const hasAllowedRoutes = allowedRouteRegions !== undefined;
    const allowedRoutesSql =
      Array.isArray(allowedRouteRegions)
        ? `N'${esc(JSON.stringify(allowedRouteRegions))}'`
        : 'NULL';

    const hasViewAllStocks = typeof viewAllStocks === 'boolean';
    const viewAllStocksBit = viewAllStocks ? 1 : 0;
    const hasAllowedStocks = allowedStockGroups !== undefined;
    const allowedStocksSql =
      Array.isArray(allowedStockGroups)
        ? `N'${esc(JSON.stringify(allowedStockGroups))}'`
        : 'NULL';

    await this.ensurePlasiyerAccountsTable();
    await executeJsonQuery(`
      IF EXISTS (
        SELECT 1 FROM dbo.ERP12_MOBIL_PLASIYER
        WHERE UPPER(FIRMA_KODU) = N'${cCode}' AND UPPER(PLASIYER_KODU) = N'${rCode}'
      )
      BEGIN
        UPDATE dbo.ERP12_MOBIL_PLASIYER
        SET AD = N'${fName}',
            SOYAD = N'${lName}',
            SIFRE = N'${pwd}',
            ${hasExplicitRole ? `YETKI_ROLU = N'${roleVal}',` : ''}
            ${hasViewAllRoutes ? `TUM_RUTLARI_GORUR = ${viewAllRoutesBit},` : ''}
            ${hasAllowedRoutes ? `IZINLI_RUT_BOLGELERI = ${allowedRoutesSql},` : ''}
            ${hasViewAllStocks ? `TUM_STOKLARI_GORUR = ${viewAllStocksBit},` : ''}
            ${hasAllowedStocks ? `IZINLI_STOK_GRUPLARI = ${allowedStocksSql},` : ''}
            AKTIF = 1,
            GUNCELLEME_TARIHI = GETDATE()
        WHERE UPPER(FIRMA_KODU) = N'${cCode}' AND UPPER(PLASIYER_KODU) = N'${rCode}';
      END
      ELSE
      BEGIN
        INSERT INTO dbo.ERP12_MOBIL_PLASIYER (
          FIRMA_KODU, PLASIYER_KODU, AD, SOYAD, SIFRE, YETKI_ROLU,
          TUM_RUTLARI_GORUR, IZINLI_RUT_BOLGELERI, TUM_STOKLARI_GORUR, IZINLI_STOK_GRUPLARI,
          AKTIF, GUNCELLEME_TARIHI
        )
        VALUES (
          N'${cCode}', N'${rCode}', N'${fName}', N'${lName}', N'${pwd}', N'${roleVal}',
          ${viewAllRoutesBit}, ${allowedRoutesSql}, ${viewAllStocksBit}, ${allowedStocksSql},
          1, GETDATE()
        );
      END
      SELECT 1 AS ok;
    `);

    return {
      id: `sql-${cCode}-${rCode}`,
      companyCode: cCode,
      repCode: rCode,
      firstName: fName,
      lastName: lName,
      password: String(password ?? ''),
      accountRole: roleVal,
      viewAllRoutes: Boolean(viewAllRoutes),
      allowedRouteRegions: Array.isArray(allowedRouteRegions) ? allowedRouteRegions : undefined,
      viewAllStocks: Boolean(viewAllStocks),
      allowedStockGroups: Array.isArray(allowedStockGroups) ? allowedStockGroups : undefined,
    };
  },

  async deletePlasiyerAccount({ companyCode, repCode }) {
    const esc = (v) => String(v ?? '').replace(/'/g, "''").trim();
    const cCode = esc(companyCode).toUpperCase();
    const rCode = esc(repCode).toUpperCase();
    await this.ensurePlasiyerAccountsTable();
    await executeJsonQuery(`
      UPDATE dbo.ERP12_MOBIL_PLASIYER
      SET AKTIF = 0, GUNCELLEME_TARIHI = GETDATE()
      WHERE UPPER(FIRMA_KODU) = N'${cCode}' AND UPPER(PLASIYER_KODU) = N'${rCode}';
      SELECT 1 AS ok;
    `);
    return { success: true };
  },

  async authenticatePlasiyer({ companyCode, repCode, password }) {
    const esc = (v) => String(v ?? '').replace(/'/g, "''").trim();
    const cCode = esc(companyCode).toUpperCase();
    const rCode = esc(repCode).toUpperCase();

    // 1. ÖNCE ERP12 PERSONEL TANITIM KARTI (CARI_TUR = 2 -> CARI_PERSONEL: PERSONEL_NO = KULLANICI ADI, SIFRE = ŞİFRE) ÜZERİNDEN DOĞRULA
    try {
      const allAccounts = await this.getPlasiyerAccounts(cCode);
      const nativeMatch = allAccounts.find(
        (a) => a.isErpSynced && a.repCode.toUpperCase() === rCode
      );
      if (nativeMatch) {
        if (String(nativeMatch.password || '').trim() !== String(password ?? '').trim()) {
          return {
            found: true,
            authenticated: false,
            error: 'Giriş şifresi hatalı! Lütfen ERP12 Personel Tanıtım Kartındaki şifrenizi kontrol ediniz.',
          };
        }
        return {
          found: true,
          authenticated: true,
          account: nativeMatch,
        };
      }
    } catch (nativeErr) {
      console.warn('ERP12 CARI_PERSONEL giriş doğrulama uyarısı:', nativeErr.message);
    }

    // 2. YEDEK OLARAK ÖZEL YÖNETİCİ / EK PLASİYER TABLOSUNDAN (ERP12_MOBIL_PLASIYER) DOĞRULA
    try {
      await this.ensurePlasiyerAccountsTable();
      const rows = await executeJsonQuery(`
        SELECT TOP 1
          FIRMA_KODU AS companyCode,
          PLASIYER_KODU AS repCode,
          AD AS firstName,
          SOYAD AS lastName,
          SIFRE AS [password],
          ISNULL(YETKI_ROLU, 'plasiyer') AS accountRole,
          ISNULL(TUM_RUTLARI_GORUR, 0) AS viewAllRoutes,
          IZINLI_RUT_BOLGELERI AS allowedRouteRegionsJson,
          ISNULL(TUM_STOKLARI_GORUR, 0) AS viewAllStocks,
          IZINLI_STOK_GRUPLARI AS allowedStockGroupsJson
        FROM dbo.ERP12_MOBIL_PLASIYER WITH(NOLOCK)
        WHERE AKTIF = 1
          AND UPPER(FIRMA_KODU) = N'${cCode}'
          AND UPPER(PLASIYER_KODU) = N'${rCode}';
      `);

      if (!Array.isArray(rows) || rows.length === 0) {
        return { found: false, authenticated: false };
      }

      const row = rows[0];
      if (String(row.password || '') !== String(password ?? '')) {
        return {
          found: true,
          authenticated: false,
          error: 'Giriş şifresi hatalı! Lütfen şifrenizi kontrol ediniz.',
        };
      }

      return {
        found: true,
        authenticated: true,
        account: {
          id: `sql-${row.companyCode}-${row.repCode}`,
          companyCode: String(row.companyCode || '').toUpperCase(),
          repCode: String(row.repCode || '').toUpperCase(),
          firstName: String(row.firstName || ''),
          lastName: String(row.lastName || ''),
          password: String(row.password || ''),
          accountRole: String(row.accountRole || '').toLowerCase() === 'manager' ? 'manager' : 'plasiyer',
          viewAllRoutes: Boolean(row.viewAllRoutes),
          allowedRouteRegions: parseJsonStringArray(row.allowedRouteRegionsJson),
          viewAllStocks: Boolean(row.viewAllStocks),
          allowedStockGroups: parseJsonStringArray(row.allowedStockGroupsJson),
        },
      };
    } catch (err) {
      return { found: false, authenticated: false, sqlWarning: err.message };
    }
  },

  // 12. ÇOKLU ARAÇ & ŞUBE (LOKASYON) LİSTESİ VE LOKASYON BAZLI CANLI STOKLAR
  async getLocations() {
    const query = `
      SELECT
        CAST(L.ID AS varchar(50)) AS id,
        CAST(ISNULL(L.USTID, 0) AS varchar(50)) AS parentId,
        LTRIM(RTRIM(ISNULL(L.AD, ''))) AS name,
        LTRIM(RTRIM(ISNULL(L.PLAKA, ''))) AS plate,
        LTRIM(RTRIM(ISNULL(L.ADRES, ''))) AS address,
        LTRIM(RTRIM(ISNULL(L.TELEFON, ''))) AS phone,
        ISNULL(L.SICAK_SATISA_ACIK, 1) AS hotSaleEnabled,
        ISNULL(L.SIPARIS_LOKASYONU_MU, 1) AS orderEnabled,
        ISNULL(SM_AGG.itemCount, 0) AS itemCount,
        ISNULL(SM_AGG.totalQuantity, 0) AS totalQuantity
      FROM LOKASYON L WITH(NOLOCK)
      LEFT JOIN (
        SELECT
          LOKASYON,
          COUNT(DISTINCT CASE WHEN MIKTAR > 0 THEN STOK END) AS itemCount,
          SUM(CASE WHEN MIKTAR > 0 THEN MIKTAR ELSE 0 END) AS totalQuantity
        FROM STOK_MIKTAR WITH(NOLOCK)
        GROUP BY LOKASYON
      ) SM_AGG ON SM_AGG.LOKASYON = L.ID
      WHERE ISNULL(L.AKTIF, 1) = 1
        AND LTRIM(RTRIM(ISNULL(L.AD, ''))) <> ''
      ORDER BY
        CASE WHEN ISNULL(L.USTID, 0) = 0 OR L.ID = 75919 OR UPPER(L.AD) LIKE '%MERKEZ%' THEN 0 ELSE 1 END ASC,
        L.ID ASC
    `;

    let rows = [];
    try {
      rows = await executeJsonQuery(query);
    } catch {
      const fallbackQuery = `
        SELECT
          CAST(L.ID AS varchar(50)) AS id,
          CAST(ISNULL(L.USTID, 0) AS varchar(50)) AS parentId,
          LTRIM(RTRIM(ISNULL(L.AD, ''))) AS name,
          '' AS plate,
          '' AS address,
          '' AS phone,
          1 AS hotSaleEnabled,
          1 AS orderEnabled,
          ISNULL(SM_AGG.itemCount, 0) AS itemCount,
          ISNULL(SM_AGG.totalQuantity, 0) AS totalQuantity
        FROM LOKASYON L WITH(NOLOCK)
        LEFT JOIN (
          SELECT
            LOKASYON,
            COUNT(DISTINCT CASE WHEN MIKTAR > 0 THEN STOK END) AS itemCount,
            SUM(CASE WHEN MIKTAR > 0 THEN MIKTAR ELSE 0 END) AS totalQuantity
          FROM STOK_MIKTAR WITH(NOLOCK)
          GROUP BY LOKASYON
        ) SM_AGG ON SM_AGG.LOKASYON = L.ID
        WHERE ISNULL(L.AKTIF, 1) = 1
          AND LTRIM(RTRIM(ISNULL(L.AD, ''))) <> ''
        ORDER BY L.ID ASC
      `;
      rows = await executeJsonQuery(fallbackQuery).catch(() => []);
    }

    // Hangi lokasyona hangi personeller atanmış (CARI_PERSONEL.LOKASYON)
    let repRows = [];
    try {
      repRows = await executeJsonQuery(`
        SELECT
          CAST(CP.LOKASYON AS varchar(50)) AS locId,
          LTRIM(RTRIM(ISNULL(C.AD, ''))) AS repName
        FROM CARI_PERSONEL CP WITH(NOLOCK)
        INNER JOIN CARI C WITH(NOLOCK) ON C.ID = CP.CARI AND C.AKTIF = 1
        WHERE CP.LOKASYON IS NOT NULL AND CP.LOKASYON > 0
      `);
    } catch {
      repRows = [];
    }

    const repsByLoc = new Map();
    for (const r of repRows) {
      const lid = String(r.locId || '');
      const rName = String(r.repName || '').trim();
      if (!lid || !rName) continue;
      const list = repsByLoc.get(lid) || [];
      if (!list.includes(rName)) list.push(rName);
      repsByLoc.set(lid, list);
    }

    const plateRegex = /^\d{2}\s*[A-ZÇĞİÖŞÜ]{1,4}\s*\d{2,5}$/i;

    return (rows || []).map((row, idx) => {
      const name = String(row.name || '').trim();
      const plate = String(row.plate || '').trim();
      const isMain =
        String(row.parentId || '0') === '0' ||
        String(row.id) === '75919' ||
        /^merkez/i.test(name);
      const isVehicle =
        !isMain &&
        (plateRegex.test(name) ||
          plateRegex.test(plate) ||
          /ara[çc]|plaka|van|kamyon|transit/i.test(name));
      const type = isMain ? 'merkez' : isVehicle ? 'arac' : 'sube';
      const codeNum = String(idx + 1).padStart(2, '0');
      const codeLabel =
        type === 'merkez'
          ? `${codeNum} Merkez Depo`
          : type === 'arac'
          ? `${codeNum} Araç Depo`
          : `${codeNum} Şube Depo`;

      return {
        id: String(row.id),
        parentId: String(row.parentId || '0'),
        name,
        plate: plate || (isVehicle ? name : ''),
        type,
        codeLabel,
        address: String(row.address || ''),
        phone: String(row.phone || ''),
        itemCount: Number(row.itemCount || 0),
        totalQuantity: Number(Number(row.totalQuantity || 0).toFixed(2)),
        assignedRepNames: (repsByLoc.get(String(row.id)) || []).join(', '),
        hotSaleEnabled: Boolean(row.hotSaleEnabled),
        orderEnabled: Boolean(row.orderEnabled),
      };
    });
  },

  async getLocationStocks(locationParam) {
    const safeParam = String(locationParam || '').trim().replace(/'/g, "''");

    const query = `
      DECLARE @lokId bigint;
      DECLARE @lokAd nvarchar(150);

      IF TRY_CAST(N'${safeParam}' AS bigint) IS NOT NULL
        SELECT TOP 1 @lokId = ID, @lokAd = LTRIM(RTRIM(AD))
        FROM LOKASYON WITH(NOLOCK)
        WHERE ID = TRY_CAST(N'${safeParam}' AS bigint);

      IF @lokId IS NULL AND N'${safeParam}' <> N''
        SELECT TOP 1 @lokId = ID, @lokAd = LTRIM(RTRIM(AD))
        FROM LOKASYON WITH(NOLOCK)
        WHERE ISNULL(AKTIF, 1) = 1
          AND (
            UPPER(LTRIM(RTRIM(AD))) = UPPER(N'${safeParam}')
            OR UPPER(REPLACE(AD, N' ', N'')) = UPPER(REPLACE(N'${safeParam}', N' ', N''))
          );

      IF @lokId IS NULL
        SELECT TOP 1 @lokId = ID, @lokAd = LTRIM(RTRIM(AD))
        FROM LOKASYON WITH(NOLOCK)
        WHERE ISNULL(AKTIF, 1) = 1
        ORDER BY CASE WHEN ID = 75919 OR ISNULL(USTID, 0) = 0 THEN 1 ELSE 0 END ASC, ID ASC;

      DECLARE @p1 bigint;
      SELECT TOP 1 @p1 = ID FROM STOK_FIYAT_AD WITH(NOLOCK) WHERE ID = 1016;
      IF @p1 IS NULL SELECT TOP 1 @p1 = ID FROM STOK_FIYAT_AD WITH(NOLOCK) ORDER BY ID ASC;

      SELECT TOP 5000
        CAST(S.ID AS varchar(50)) AS productId,
        LTRIM(RTRIM(S.KOD)) AS productCode,
        LTRIM(RTRIM(S.AD)) AS productName,
        ISNULL(SB.AD, 'ADET') AS unit,
        COALESCE(NULLIF(LTRIM(RTRIM(SM.BARKOD)), ''), B.BARKOD, LTRIM(RTRIM(S.KOD))) AS barcode,
        ISNULL(G.AD, 'Genel') AS category,
        ISNULL(F.FIYAT, 0) AS unitPrice,
        ISNULL(SM.MIKTAR, 0) AS currentStock,
        ISNULL(TODAY_MOV.loadedToday, 0) AS totalLoadedToday,
        ISNULL(TODAY_MOV.soldToday, 0) AS totalSoldToday,
        ISNULL(TODAY_MOV.returnedToday, 0) AS totalReturnedToday,
        @lokAd AS vanPlate,
        CAST(@lokId AS varchar(50)) AS locationId
      FROM (
        SELECT STOK, MAX(BARKOD) AS BARKOD, SUM(MIKTAR) AS MIKTAR
        FROM STOK_MIKTAR WITH(NOLOCK)
        WHERE LOKASYON = @lokId
        GROUP BY STOK
        HAVING SUM(MIKTAR) > 0
      ) SM
      INNER JOIN STOK S WITH(NOLOCK) ON S.ID = SM.STOK AND S.AKTIF = 1
      LEFT JOIN STOK_GRUP G WITH(NOLOCK) ON G.ID = S.STOK_GRUP
      LEFT JOIN STOK_STOK_BIRIM SSB WITH(NOLOCK) ON SSB.STOK = S.ID AND SSB.VARSAYILAN = 1
      LEFT JOIN STOK_BIRIM SB WITH(NOLOCK) ON SB.ID = SSB.STOK_BIRIM
      LEFT JOIN (
        SELECT STOK_STOK_BIRIM, MIN(BARKOD) AS BARKOD
        FROM STOK_BARKOD WITH(NOLOCK)
        WHERE AKTIF = 1
        GROUP BY STOK_STOK_BIRIM
      ) B ON B.STOK_STOK_BIRIM = SSB.ID
      LEFT JOIN STOK_VARSAYILAN_FIYAT F WITH(NOLOCK) ON F.STOK_STOK_BIRIM = SSB.ID AND F.STOK_FIYAT_AD = @p1
      LEFT JOIN (
        SELECT
          FD.STOK,
          SUM(CASE WHEN F.FIS_TURU = 14 THEN ISNULL(FD.MIKTAR_FIS, 0) ELSE 0 END) AS loadedToday,
          SUM(CASE WHEN F.FIS_TURU IN (2, 20, 6, 11, 35) THEN ISNULL(FD.MIKTAR_FIS, 0) ELSE 0 END) AS soldToday,
          SUM(CASE WHEN F.FIS_TURU IN (4, 22, 8, 12) THEN ISNULL(FD.MIKTAR_FIS, 0) ELSE 0 END) AS returnedToday
        FROM FIS_DETAY FD WITH(NOLOCK)
        INNER JOIN FIS F WITH(NOLOCK) ON F.ID = FD.FIS AND F.AKTIF = 1
        WHERE FD.LOKASYON = @lokId
          AND CAST(F.FIS_TARIHI AS DATE) = CAST(GETDATE() AS DATE)
        GROUP BY FD.STOK
      ) TODAY_MOV ON TODAY_MOV.STOK = S.ID
      ORDER BY SM.MIKTAR DESC, S.AD ASC
    `;

    const rows = await executeJsonQuery(query);
    const nowIso = new Date().toISOString();

    return (rows || []).map((r) => {
      const currentStock = Number(Number(r.currentStock || 0).toFixed(2));
      const totalLoadedToday = Number(Number(r.totalLoadedToday || 0).toFixed(2));
      const totalSoldToday = Number(Number(r.totalSoldToday || 0).toFixed(2));
      const totalReturnedToday = Number(Number(r.totalReturnedToday || 0).toFixed(2));
      const initialStock = Math.max(
        0,
        Number((currentStock - totalLoadedToday + totalSoldToday - totalReturnedToday).toFixed(2))
      );

      return {
        productId: String(r.productId || r.productCode),
        productCode: String(r.productCode || ''),
        productName: String(r.productName || ''),
        barcode: String(r.barcode || ''),
        unit: String(r.unit || 'ADET'),
        category: String(r.category || 'Genel'),
        unitPrice: Number(r.unitPrice || 0),
        currentStock,
        initialStock,
        totalLoadedToday,
        totalSoldToday,
        totalReturnedToday,
        vanPlate: String(r.vanPlate || locationParam || ''),
        locationId: String(r.locationId || ''),
        updatedAt: nowIso,
      };
    });
  },

  async createLocation({ name, type = 'arac', plate = '', address = '', phone = '' }) {
    const safeName = String(name || plate || '').trim().replace(/'/g, "''");
    const safePlate = String(plate || (type === 'arac' ? name : '') || '').trim().replace(/'/g, "''");
    const safeAddress = String(address || '').trim().replace(/'/g, "''");
    const safePhone = String(phone || '').trim().replace(/'/g, "''");

    if (!safeName) {
      throw new Error('Araç plakası veya şube adı boş olamaz.');
    }

    const sqlScript = `
      BEGIN TRANSACTION;
      BEGIN TRY
        DECLARE @existingId bigint;
        SELECT TOP 1 @existingId = ID
        FROM LOKASYON WITH(NOLOCK)
        WHERE UPPER(LTRIM(RTRIM(AD))) = UPPER(N'${safeName}')
           OR UPPER(REPLACE(AD, N' ', N'')) = UPPER(REPLACE(N'${safeName}', N' ', N''));

        IF @existingId IS NOT NULL
        BEGIN
          UPDATE LOKASYON
          SET AKTIF = 1,
              SICAK_SATISA_ACIK = 1,
              SIPARIS_LOKASYONU_MU = 1
          WHERE ID = @existingId;

          COMMIT TRANSACTION;
          SELECT CAST(@existingId AS varchar(50)) AS id, N'${safeName}' AS name;
          RETURN;
        END;

        DECLARE @merkezId bigint;
        DECLARE @lokTuru bigint;
        DECLARE @ilIlce bigint;
        DECLARE @fiyatAd bigint;

        SELECT TOP 1
          @merkezId = ID,
          @lokTuru = ISNULL(LOKASYON_TURU, 1007),
          @ilIlce = ISNULL(ILILCE, 0),
          @fiyatAd = ISNULL(STOK_FIYAT_AD, 1016)
        FROM LOKASYON WITH(NOLOCK)
        WHERE ID = 75919 OR ISNULL(USTID, 0) = 0
        ORDER BY ID ASC;

        IF @merkezId IS NULL SET @merkezId = 0;
        IF @lokTuru IS NULL SET @lokTuru = 1007;
        IF @ilIlce IS NULL SET @ilIlce = 0;
        IF @fiyatAd IS NULL SET @fiyatAd = 1016;

        DECLARE @newLokId bigint;
        IF OBJECT_ID('dbo.ID', 'SO') IS NOT NULL
          SET @newLokId = NEXT VALUE FOR [dbo].[ID];
        ELSE
          SELECT @newLokId = ISNULL(MAX(ID), 75919) + 1 FROM LOKASYON WITH(NOLOCK);

        INSERT INTO LOKASYON (
          ID, USTID, AD, LOKASYON_TURU, SIPARIS_LOKASYONU_MU, FIZIKI_MI,
          ILILCE, ADRES, SICAK_SATISA_ACIK, ALISA_ACIK, SATISA_ACIK,
          STOK_FIYAT_AD, BOYLAM, ENLEM, AKTIF,
          EMAIL_ADRES, EMAIL_PORTNO, EMAIL_HOST, EMAIL_USER, EMAIL_PASSWORD,
          YS_RestaurantList, MEKEZI_PAKET_ALIR, POS_MUTFAK_YAZICI_PC, MERKEZI_PAKET_PC,
          SSL, ZMAIL, KT_SUBE_NO, LOKASYON_MALIYET_FIYAT_AD, POS_KISISAYISI_ZORUNLU,
          AKRT_FIRMA, AKRT_DOSYA_YOLU, AKRT_DAGITICI_CARI, VARSAYILAN_CARI_GRUP,
          E_BELGEDE_LOKASYON_ADRESI_YOLLANIR, TELEFON, FAX, AKRT_MANUEL, AKRT_FLEET_CODE,
          PLAKA, BURDANBI_DE_CALISIR, LOKASYON_SEVKINDE_MALIYET_FIYATINI_KULLANIR,
          POSTA_KODU, QR_ID
        ) VALUES (
          @newLokId, @merkezId, N'${safeName}', @lokTuru, 1, 1,
          @ilIlce, N'${safeAddress}', 1, 1, 1,
          @fiyatAd, '', '', 1,
          '', 0, '', '', '',
          0, 0, 0, 0,
          0, '', 0, 0, 0,
          0, '', 0, 0,
          0, N'${safePhone}', '', 0, '',
          N'${safePlate}', 0, 0,
          '', ''
        );

        IF OBJECT_ID('dbo.SEQUNCES', 'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM SEQUNCES WHERE ID = @newLokId)
          INSERT INTO SEQUNCES (ID, TABLO, KOD_PC) VALUES (@newLokId, 'LOKASYON', 0);

        IF OBJECT_ID('dbo.KASA_AD', 'U') IS NOT NULL
        BEGIN
          DECLARE @newKasaId bigint;
          IF OBJECT_ID('dbo.ID', 'SO') IS NOT NULL
            SET @newKasaId = NEXT VALUE FOR [dbo].[ID];
          ELSE
            SELECT @newKasaId = ISNULL(MAX(ID), 75923) + 1 FROM KASA_AD WITH(NOLOCK);

          INSERT INTO KASA_AD (ID, LOKASYON, AD, AKTIF, KOD)
          VALUES (@newKasaId, @newLokId, LEFT(N'${safeName}' + N' KASA', 50), 1, N'');

          IF OBJECT_ID('dbo.SEQUNCES', 'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM SEQUNCES WHERE ID = @newKasaId)
            INSERT INTO SEQUNCES (ID, TABLO, KOD_PC) VALUES (@newKasaId, 'KASA_AD', 0);
        END;

        COMMIT TRANSACTION;
        SELECT CAST(@newLokId AS varchar(50)) AS id, N'${safeName}' AS name;
      END TRY
      BEGIN CATCH
        ROLLBACK TRANSACTION;
        DECLARE @errMsgLok nvarchar(4000) = ERROR_MESSAGE();
        RAISERROR(@errMsgLok, 16, 1);
      END CATCH;
    `;

    await executeJsonQuery(sqlScript);
    const all = await this.getLocations();
    const created =
      all.find((l) => l.name.toUpperCase() === safeName.toUpperCase()) ||
      all[all.length - 1];
    return created;
  },
};

