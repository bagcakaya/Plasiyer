import {
  executeJsonQuery,
  getActiveDbKey,
  getActiveSqlConfig,
  encodeSqlConfigToken,
} from './db.js';
import { imageService } from './imageService.js';

// Yüksek Performanslı Bellek İçi Önbellek (Çoklu Firma / DB Anahtarı İle İzole)
const memCache = {
  customers: new Map(),     // `${dbKey}::${rep}` -> { data, expiresAt }
  products: new Map(),      // `${dbKey}` -> { data, expiresAt }
  companyInfo: new Map(),   // `${dbKey}` -> { data, expiresAt }
  productImages: new Map(), // `${dbKey}::${idOrCode}` -> { data, expiresAt }
};

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

      ;WITH LastCustDiscount AS (
        SELECT 
          F.CARI,
          CASE
            WHEN ISNUMERIC(REPLACE(
              CASE WHEN CHARINDEX('+', FD.ISKONTO) > 0 THEN LEFT(FD.ISKONTO, CHARINDEX('+', FD.ISKONTO) - 1) ELSE FD.ISKONTO END,
              ',', '.'
            )) = 1
            AND REPLACE(
              CASE WHEN CHARINDEX('+', FD.ISKONTO) > 0 THEN LEFT(FD.ISKONTO, CHARINDEX('+', FD.ISKONTO) - 1) ELSE FD.ISKONTO END,
              ',', '.'
            ) NOT IN ('.', '+', '-', '$')
            THEN CAST(REPLACE(
              CASE WHEN CHARINDEX('+', FD.ISKONTO) > 0 THEN LEFT(FD.ISKONTO, CHARINDEX('+', FD.ISKONTO) - 1) ELSE FD.ISKONTO END,
              ',', '.'
            ) AS float)
            ELSE 0
          END AS last_discount,
          ROW_NUMBER() OVER(PARTITION BY F.CARI ORDER BY F.FIS_TARIHI DESC, FD.ID DESC) as rn
        FROM FIS_DETAY FD WITH(NOLOCK)
        JOIN FIS F WITH(NOLOCK) ON F.ID = FD.FIS
        WHERE FD.ISKONTO IS NOT NULL AND FD.ISKONTO <> '' AND FD.ISKONTO <> '0'
          AND F.FIS_TURU IN (1, 2, 3, 4, 20, 21, 22)
      )
      SELECT TOP 2000
        C.ID AS id,
        C.KOD AS code,
        C.AD AS name,
        ISNULL(A.ADRES, '') AS address,
        ISNULL(A.TELEFON_CEP, ISNULL(A.TELEFON, '')) AS phone,
        ISNULL(C.VERGI_DAIRESI, '') AS taxOffice,
        ISNULL(C.VERGI_NUMARASI, ISNULL(C.KIMLIK_NO, '')) AS taxNumber,
        ISNULL(CAST(C.TEMSILCI AS varchar(50)), '0') AS salesRepCode,
        CASE 
          WHEN C.STOK_FIYAT_AD = @p2 THEN 2
          WHEN C.STOK_FIYAT_AD IN (@p3, 449802, 449803) THEN 3
          ELSE 1 
        END AS priceList,
        COALESCE(
          NULLIF(
            CASE
              WHEN ISNUMERIC(REPLACE(ISNULL(CAST(C.ISKONTO AS varchar(50)), ''), ',', '.')) = 1
               AND REPLACE(ISNULL(CAST(C.ISKONTO AS varchar(50)), ''), ',', '.') NOT IN ('.', '+', '-', '$')
              THEN CAST(REPLACE(CAST(C.ISKONTO AS varchar(50)), ',', '.') AS float)
              ELSE 0
            END,
            0
          ),
          ROUND(LD.last_discount, 2),
          0
        ) AS specialDiscount,
        ISNULL(C.RISK, 0) AS riskLimit,
        ISNULL(B.BAKIYE, 0) AS balance
      FROM CARI C WITH(NOLOCK)
      LEFT JOIN LastCustDiscount LD ON LD.CARI = C.ID AND LD.rn = 1
      LEFT JOIN CARI_BAKIYELER B WITH(NOLOCK) ON B.ID = C.ID
      LEFT JOIN CARI_ADRES A WITH(NOLOCK) ON A.CARI = C.ID AND A.VARSAYILAN = 1
      WHERE C.AKTIF = 1
      ORDER BY C.AD ASC
    `;

    let rows;
    try {
      rows = await executeJsonQuery(queryWithBalanceView);
    } catch (err) {
      // CARI_BAKIYELER view veya opsiyonel tablo farklılığı varsa FINANS_DETAY üzerinden hesapla
      const fallbackQuery = `
        SELECT TOP 2000
          C.ID AS id,
          C.KOD AS code,
          C.AD AS name,
          '' AS address,
          '' AS phone,
          ISNULL(C.VERGI_DAIRESI, '') AS taxOffice,
          ISNULL(C.VERGI_NUMARASI, ISNULL(C.KIMLIK_NO, '')) AS taxNumber,
          ISNULL(CAST(C.TEMSILCI AS varchar(50)), '0') AS salesRepCode,
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
        WHERE C.AKTIF = 1
        ORDER BY C.AD ASC
      `;
      rows = await executeJsonQuery(fallbackQuery);
    }
    const result = rows.map((row) => ({
      id: String(row.id),
      code: String(row.code),
      name: String(row.name),
      city: 'Erzurum',
      district: 'Merkez',
      address: String(row.address || ''),
      phone: String(row.phone || ''),
      taxOffice: String(row.taxOffice || ''),
      taxNumber: String(row.taxNumber || ''),
      salesRepCode: String(row.salesRepCode || ''),
      priceList: Number(row.priceList) || 1,
      specialDiscount: Number(row.specialDiscount || 0),
      riskLimit: Number(row.riskLimit || 0),
      balance: Number(row.balance || 0),
    }));

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
        WHERE RESIM IS NOT NULL OR (LINK IS NOT NULL AND LTRIM(RTRIM(LINK)) <> '')
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

    const result = rows.map((row) => {
      const code = String(row.code);
      const id = String(row.id);
      const barcode = String(row.barcode || row.code);

      let erpResimUrl;
      if (row.erpImageLink && /^https?:\/\//i.test(String(row.erpImageLink).trim())) {
        erpResimUrl = String(row.erpImageLink).trim();
      } else if (row.resimIdx) {
        const qs = [
          `code=${encodeURIComponent(code)}`,
          `idx=${encodeURIComponent(String(row.resimIdx))}`,
          dbQuerySuffix,
        ]
          .filter(Boolean)
          .join('&');
        erpResimUrl = `/api/products/erp-image/${encodeURIComponent(id)}?${qs}`;
      }

      const matchedImage =
        imageMap[code] ||
        imageMap[id] ||
        imageMap[barcode] ||
        erpResimUrl ||
        undefined;

      return {
        id,
        code,
        barcode,
        name: String(row.name),
        category: String(row.category || 'Genel'),
        unit: String(row.unit || 'ADET'),
        vatRate: Number(row.vatRate || 1),
        price1: Number(row.price1 || 0),
        price2: Number(row.price2 || row.price1 || 0),
        price3: Number(row.price3 || row.price1 || 0),
        stockQuantity: Number(row.stockQuantity || 0),
        image: matchedImage,
      };
    });

    // 60 saniye süreyle bellekte sakla
    memCache.products.set(dbKey, { data: result, expiresAt: Date.now() + 60000 });
    return result;
  },

  // 2.0.1 ERP12 RESIM TABLOSUNDAN ÜRÜN GÖRSELİ (RESIM.ID = STOK.ID VEYA STOK.KOD)
  async getProductErpImage(idOrCode, productCode = '') {
    const dbKey = getActiveDbKey();
    const safeId = String(idOrCode || '').trim().replace(/'/g, "''");
    const safeCode = String(productCode || '').trim().replace(/'/g, "''");
    if (!safeId && !safeCode) return null;

    const cacheKey = `${dbKey}::${safeId}::${safeCode}`;
    const now = Date.now();
    const cached = memCache.productImages.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.data;
    }

    const query = `
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
        FROM RESIM R WITH(NOLOCK)
        LEFT JOIN STOK S WITH(NOLOCK) ON S.ID = R.ID
        WHERE (
          (TRY_CAST('${safeId}' AS bigint) IS NOT NULL AND R.ID = TRY_CAST('${safeId}' AS bigint))
          OR ('${safeCode}' <> '' AND S.KOD = '${safeCode}')
          OR S.KOD = '${safeId}'
        )
        AND (R.RESIM IS NOT NULL OR (R.LINK IS NOT NULL AND LTRIM(RTRIM(R.LINK)) <> ''))
        ORDER BY ISNULL(R.SIRA, 1) ASC, R.IDX ASC
      ) X
    `;

    const rows = await executeJsonQuery(query);
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
    }

    if (!buffer && !link) {
      return null;
    }

    const result = {
      idx: String(row.idx || ''),
      stokId: String(row.stokId || safeId),
      ext: String(row.ext || 'jpg'),
      contentType,
      buffer,
      link: link || null,
    };

    if (memCache.productImages.size > 250) {
      const oldestKey = memCache.productImages.keys().next().value;
      if (oldestKey) memCache.productImages.delete(oldestKey);
    }
    memCache.productImages.set(cacheKey, {
      data: result,
      expiresAt: now + 30 * 60 * 1000,
    });

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

  // 3. MOBİLDEN GELEN SİPARİŞİ ERP12'YE YAZMA
  async createOrder({ order }) {
    erpQueries.invalidateCustomerCache();
    erpQueries.invalidateProductCache();
    const now = new Date();
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timePart = now.toTimeString().slice(0, 8).replace(/:/g, '');
    const docNo = `${datePart}-${timePart}`;

    const safeNotes = (order.notes || '').replace(/'/g, "''");
    const safeCustCode = (order.customerCode || '').replace(/'/g, "''");
    const safeTempId = (order.tempId || '').replace(/'/g, "''");
    const campaignNotes = (order.appliedCampaigns && order.appliedCampaigns.length > 0)
      ? (' [Kampanya: ' + order.appliedCampaigns.map(c => c.campaignTitle).join(', ') + ']')
      : '';
    const safeCampaignNotes = campaignNotes.replace(/'/g, "''");

    const sqlScript = `
      BEGIN TRANSACTION;
      BEGIN TRY
        DECLARE @cariId bigint;
        SELECT TOP 1 @cariId = ID FROM CARI WHERE KOD = '${safeCustCode}';
        IF @cariId IS NULL SELECT TOP 1 @cariId = ID FROM CARI WHERE AKTIF = 1 ORDER BY ID ASC;

        DECLARE @lokId bigint;
        SELECT TOP 1 @lokId = ID FROM LOKASYON WHERE ID = 75919;
        IF @lokId IS NULL SELECT TOP 1 @lokId = ID FROM LOKASYON ORDER BY ID ASC;

        DECLARE @orderId bigint;
        SELECT @orderId = ISNULL((
          SELECT MAX(v) FROM (VALUES
            (ISNULL((SELECT MAX(ID) FROM SEQUNCES), 0)),
            (ISNULL((SELECT MAX(ID) FROM SIPARIS), 3893110)),
            (ISNULL((SELECT MAX(ID) FROM SIPARIS_DETAY), 3893110))
          ) AS T(v)
        ), 3893110) + 1;

        INSERT INTO SIPARIS (
          ID, SIPARIS_TURU, LOKASYON, CARI, BELGENO, 
          SIPARIS_TARIHI, TERMIN_TARIHI, ISLEM_TARIHI, 
          SATIR_TOPLAM, SATIR_ISKONTO_TOPLAM, KDV_TOPLAM, GENELTOPLAM, 
          ACIKLAMA, AKTIF, MOBIL_MI, ONAYLI
        ) VALUES (
          @orderId, 2, @lokId, @cariId, '${docNo}', 
          GETDATE(), GETDATE(), GETDATE(), 
          ${order.subtotal || 0}, ${order.totalDiscount || 0}, ${order.totalVat || 0}, ${order.grandTotal || 0}, 
          '[Mobil Plasiyer - ${safeTempId}] ${safeNotes}${safeCampaignNotes}', 1, 1, 0
        );
        IF OBJECT_ID('dbo.SEQUNCES', 'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM SEQUNCES WHERE ID = @orderId)
          INSERT INTO SEQUNCES (ID, TABLO, KOD_PC) VALUES (@orderId, 'SIPARIS', 0);

        DECLARE @detId bigint;
        SET @detId = @orderId;
        ${order.items.map((item, idx) => {
          const sCode = (item.productCode || '').replace(/'/g, "''");
          const isGift = Boolean(item.isGift);
          const price = isGift ? 0 : (item.unitPrice || 0);
          const iskonto = isGift ? '100' : String(item.discountPercent || 0);
          const netTutar = isGift ? 0 : (item.netTotal || 0);
          const dahilTutar = isGift ? 0 : (item.grandTotal || 0);
          return `
            SET @detId = @detId + 1;
            DECLARE @stokId_${idx} bigint;
            DECLARE @birimId_${idx} bigint;
            SELECT TOP 1 @stokId_${idx} = S.ID, @birimId_${idx} = ISNULL(SSB.STOK_BIRIM, 1)
            FROM STOK S 
            LEFT JOIN STOK_STOK_BIRIM SSB ON SSB.STOK = S.ID AND SSB.VARSAYILAN = 1
            WHERE S.KOD = '${sCode}';

            IF @stokId_${idx} IS NOT NULL
            BEGIN
              INSERT INTO SIPARIS_DETAY (
                ID, SIPARIS, LOKASYON, STOK, STOK_BIRIM, 
                MIKTAR_FIS, FIYAT, TUTAR, DAHIL_TUTAR, 
                KDV_TOPTAN, ISKONTO
              ) VALUES (
                @detId, @orderId, @lokId, @stokId_${idx}, @birimId_${idx}, 
                ${item.quantity || 1}, ${price}, ${netTutar}, ${dahilTutar}, 
                ${item.vatRate || 1}, '${iskonto}'
              );
              IF OBJECT_ID('dbo.SEQUNCES', 'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM SEQUNCES WHERE ID = @detId)
                INSERT INTO SEQUNCES (ID, TABLO, KOD_PC) VALUES (@detId, 'SIPARIS_DETAY', 0);
            END;
          `;
        }).join('\n')}

        COMMIT TRANSACTION;
        SELECT '${docNo}' AS docNo;
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

  // 5. SİPARİŞİ ERP12'DE ONAYLA & FATURALAŞTIRMAYA SEVK ET
  async invoiceOrder({ docNo, invoiceNo, notes }) {
    const safeDocNo = (docNo || '').replace(/'/g, "''");
    const safeInvNo = (invoiceNo || '').replace(/'/g, "''");
    const safeNotes = (notes || '').replace(/'/g, "''");

    const sqlScript = `
      BEGIN TRANSACTION;
      BEGIN TRY
        UPDATE SIPARIS 
        SET ONAYLI = 1,
            ACIKLAMA = ACIKLAMA + ' [Faturaya Sevk: ' + '${safeInvNo}' + ' ' + '${safeNotes}' + ']'
        WHERE BELGENO = '${safeDocNo}';

        COMMIT TRANSACTION;
        SELECT '${safeDocNo}' AS docNo, '${safeInvNo}' AS invoiceNo;
      END TRY
      BEGIN CATCH
        ROLLBACK TRANSACTION;
        DECLARE @errMsgInv nvarchar(4000);
        SET @errMsgInv = ERROR_MESSAGE();
        RAISERROR(@errMsgInv, 16, 1);
      END CATCH;
    `;

    const res = await executeJsonQuery(sqlScript);
    return { docNo, invoiceNo: safeInvNo };
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
          AKTIF bit NOT NULL DEFAULT 1,
          GUNCELLEME_TARIHI datetime NOT NULL DEFAULT GETDATE()
        );
      END
      ELSE IF COL_LENGTH('dbo.ERP12_MOBIL_PLASIYER', 'YETKI_ROLU') IS NULL
      BEGIN
        ALTER TABLE dbo.ERP12_MOBIL_PLASIYER
        ADD YETKI_ROLU nvarchar(20) NOT NULL CONSTRAINT DF_ERP12_MOBIL_PLASIYER_ROL DEFAULT 'plasiyer';
      END
      SELECT 1 AS ok;
    `;
    await executeJsonQuery(ddl);
  },

  async getPlasiyerAccounts(companyCode = '') {
    try {
      await this.ensurePlasiyerAccountsTable();
      const esc = (v) => String(v ?? '').replace(/'/g, "''").trim();
      const filterSql = companyCode
        ? `AND UPPER(FIRMA_KODU) = UPPER(N'${esc(companyCode)}')`
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
          CONVERT(varchar(19), GUNCELLEME_TARIHI, 120) AS updatedAt
        FROM dbo.ERP12_MOBIL_PLASIYER WITH(NOLOCK)
        WHERE AKTIF = 1 ${filterSql}
        ORDER BY FIRMA_KODU ASC, PLASIYER_KODU ASC;
      `);
      return Array.isArray(rows)
        ? rows.map((r) => ({
            id: `sql-${r.companyCode}-${r.repCode}`,
            companyCode: String(r.companyCode || '').toUpperCase(),
            repCode: String(r.repCode || '').toUpperCase(),
            firstName: String(r.firstName || ''),
            lastName: String(r.lastName || ''),
            password: String(r.password || ''),
            accountRole: String(r.accountRole || '').toLowerCase() === 'manager' ? 'manager' : 'plasiyer',
            updatedAt: String(r.updatedAt || ''),
          }))
        : [];
    } catch (err) {
      console.warn('Plasiyer tablosu okuma uyarısı:', err.message);
      return [];
    }
  },

  async upsertPlasiyerAccount({ companyCode, repCode, firstName, lastName, password, accountRole }) {
    const esc = (v) => String(v ?? '').replace(/'/g, "''").trim();
    const cCode = esc(companyCode).toUpperCase();
    const rCode = esc(repCode).toUpperCase();
    const fName = esc(firstName);
    const lName = esc(lastName);
    const pwd = String(password ?? '').replace(/'/g, "''");
    const hasExplicitRole = accountRole === 'manager' || accountRole === 'plasiyer';
    const roleVal = accountRole === 'manager' ? 'manager' : 'plasiyer';

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
            AKTIF = 1,
            GUNCELLEME_TARIHI = GETDATE()
        WHERE UPPER(FIRMA_KODU) = N'${cCode}' AND UPPER(PLASIYER_KODU) = N'${rCode}';
      END
      ELSE
      BEGIN
        INSERT INTO dbo.ERP12_MOBIL_PLASIYER (FIRMA_KODU, PLASIYER_KODU, AD, SOYAD, SIFRE, YETKI_ROLU, AKTIF, GUNCELLEME_TARIHI)
        VALUES (N'${cCode}', N'${rCode}', N'${fName}', N'${lName}', N'${pwd}', N'${roleVal}', 1, GETDATE());
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
    try {
      await this.ensurePlasiyerAccountsTable();
      const esc = (v) => String(v ?? '').replace(/'/g, "''").trim();
      const cCode = esc(companyCode).toUpperCase();
      const rCode = esc(repCode).toUpperCase();
      const pwd = String(password ?? '').replace(/'/g, "''");

      const rows = await executeJsonQuery(`
        SELECT TOP 1
          FIRMA_KODU AS companyCode,
          PLASIYER_KODU AS repCode,
          AD AS firstName,
          SOYAD AS lastName,
          SIFRE AS [password],
          ISNULL(YETKI_ROLU, 'plasiyer') AS accountRole
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
        },
      };
    } catch (err) {
      return { found: false, authenticated: false, sqlWarning: err.message };
    }
  },
};

