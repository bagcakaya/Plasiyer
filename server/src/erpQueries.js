import { executeJsonQuery, executeNonQuery } from './db.js';
import { imageService } from './imageService.js';

// Yüksek Performanslı Bellek İçi Önbellek (Hızlı Senkronizasyon & Düşük Veritabanı Yükü)
const memCache = {
  customers: new Map(), // key -> { data, expiresAt }
  products: null,       // { data, expiresAt }
};

export const erpQueries = {
  invalidateCustomerCache() {
    memCache.customers.clear();
  },

  invalidateProductCache() {
    memCache.products = null;
  },

  // 1. CARİ HESAPLAR VE BAKİYELER (OSMANLIGIDA)
  async getCustomers(salesRepCode) {
    const cacheKey = salesRepCode || 'ALL';
    const now = Date.now();
    const cached = memCache.customers.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.data;
    }

    let whereRep = '';
    if (salesRepCode && salesRepCode !== 'ALL' && salesRepCode !== 'PLS01') {
      whereRep = `AND C.TEMSILCI = '${salesRepCode.replace(/'/g, "''")}'`;
    }

    const query = `
      WITH LastCustDiscount AS (
        SELECT 
          F.CARI,
          TRY_CAST(REPLACE(
            CASE 
              WHEN CHARINDEX('+', FD.ISKONTO) > 0 THEN LEFT(FD.ISKONTO, CHARINDEX('+', FD.ISKONTO) - 1)
              ELSE FD.ISKONTO 
            END, ',', '.') AS float) AS last_discount,
          ROW_NUMBER() OVER(PARTITION BY F.CARI ORDER BY F.FIS_TARIHI DESC, FD.ID DESC) as rn
        FROM FIS_DETAY FD WITH(NOLOCK)
        JOIN FIS F WITH(NOLOCK) ON F.ID = FD.FIS
        WHERE FD.ISKONTO IS NOT NULL AND FD.ISKONTO <> '' AND FD.ISKONTO <> '0'
          AND F.FIS_TURU IN (1, 2, 3, 4, 20, 21, 22)
      )
      SELECT TOP 1500
        C.ID AS id,
        C.KOD AS code,
        C.AD AS name,
        ISNULL(A.ADRES, '') AS address,
        ISNULL(A.TELEFON_CEP, ISNULL(A.TELEFON, '')) AS phone,
        ISNULL(C.VERGI_DAIRESI, '') AS taxOffice,
        ISNULL(C.VERGI_NUMARASI, ISNULL(C.KIMLIK_NO, '')) AS taxNumber,
        ISNULL(CAST(C.TEMSILCI AS varchar), '0') AS salesRepCode,
        CASE 
          WHEN C.STOK_FIYAT_AD = 3294504 THEN 2
          WHEN C.STOK_FIYAT_AD IN (449802, 449803) THEN 3
          ELSE 1 
        END AS priceList,
        COALESCE(
          NULLIF(TRY_CAST(REPLACE(C.ISKONTO, ',', '.') AS float), 0),
          ROUND(LD.last_discount, 2),
          0
        ) AS specialDiscount,
        ISNULL(C.RISK, 0) AS riskLimit,
        ISNULL(B.BAKIYE, 0) AS balance
      FROM CARI C WITH(NOLOCK)
      LEFT JOIN LastCustDiscount LD ON LD.CARI = C.ID AND LD.rn = 1
      LEFT JOIN CARI_BAKIYELER B WITH(NOLOCK) ON B.ID = C.ID
      LEFT JOIN CARI_ADRES A WITH(NOLOCK) ON A.CARI = C.ID AND A.VARSAYILAN = 1
      WHERE C.AKTIF = 1 ${whereRep}
      ORDER BY C.AD ASC
      FOR JSON PATH
    `;

    const rows = await executeJsonQuery(query);
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

  // 2. STOK KARTLARI, BARKODLAR, FİYATLAR VE MEVCUTLAR (OSMANLIGIDA + ERP12 GÖRSEL)
  async getProducts() {
    const now = Date.now();
    if (memCache.products && memCache.products.expiresAt > now) {
      return memCache.products.data;
    }

    const query = `
      SELECT TOP 1500
        S.ID AS id,
        S.KOD AS code,
        S.AD AS name,
        ISNULL(G.AD, 'Genel') AS category,
        ISNULL(SB.AD, 'ADET') AS unit,
        ISNULL(V.KDV_TOPTAN, 1) AS vatRate,
        ISNULL(B.BARKOD, S.KOD) AS barcode,
        ISNULL(F.FIYAT, 0) AS price1,
        ISNULL(F2.FIYAT, ISNULL(F.FIYAT, 0)) AS price2,
        ISNULL(F3.FIYAT, ISNULL(F.FIYAT, 0)) AS price3,
        ISNULL(M.MIKTAR, 0) AS stockQuantity,
        ISNULL(R.LINK, ISNULL(SR.LINK, SR.DOSYA)) AS erpImageLink
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
      LEFT JOIN STOK_VARSAYILAN_FIYAT F WITH(NOLOCK) ON F.STOK_STOK_BIRIM = SSB.ID AND F.STOK_FIYAT_AD = 1016
      LEFT JOIN STOK_VARSAYILAN_FIYAT F2 WITH(NOLOCK) ON F2.STOK_STOK_BIRIM = SSB.ID AND F2.STOK_FIYAT_AD = 3294504
      LEFT JOIN STOK_VARSAYILAN_FIYAT F3 WITH(NOLOCK) ON F3.STOK_STOK_BIRIM = SSB.ID AND F3.STOK_FIYAT_AD = 449803
      LEFT JOIN (
        SELECT STOK, SUM(MIKTAR) AS MIKTAR FROM STOK_MIKTAR WITH(NOLOCK) GROUP BY STOK
      ) M ON M.STOK = S.ID
      LEFT JOIN (
        SELECT ID, MIN(LINK) AS LINK FROM RESIM WITH(NOLOCK) GROUP BY ID
      ) R ON R.ID = S.ID
      LEFT JOIN (
        SELECT STOK, MIN(LINK) AS LINK, MIN(DOSYA) AS DOSYA FROM STOK_RENK_RESIM WITH(NOLOCK) GROUP BY STOK
      ) SR ON SR.STOK = S.ID
      WHERE S.AKTIF = 1
        AND ISNULL(G.AD, '') NOT LIKE '%MASRAF%'
      ORDER BY S.AD ASC
      FOR JSON PATH
    `;

    const rows = await executeJsonQuery(query);
    const imageMap = imageService.getAllProductImagesMap();

    const result = rows.map((row) => {
      const code = String(row.code);
      const id = String(row.id);
      const barcode = String(row.barcode || row.code);
      const matchedImage = imageMap[code] || imageMap[id] || imageMap[barcode] || row.erpImageLink || undefined;

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
    memCache.products = { data: result, expiresAt: Date.now() + 60000 };
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
        IF @cariId IS NULL SET @cariId = 437834;

        DECLARE @orderId bigint;
        SELECT @orderId = ISNULL(MAX(ID), 3893110) + 1 FROM SIPARIS;

        INSERT INTO SIPARIS (
          ID, SIPARIS_TURU, LOKASYON, CARI, BELGENO, 
          SIPARIS_TARIHI, TERMIN_TARIHI, ISLEM_TARIHI, 
          SATIR_TOPLAM, SATIR_ISKONTO_TOPLAM, KDV_TOPLAM, GENELTOPLAM, 
          ACIKLAMA, AKTIF, MOBIL_MI, ONAYLI
        ) VALUES (
          @orderId, 2, 75919, @cariId, '${docNo}', 
          GETDATE(), GETDATE(), GETDATE(), 
          ${order.subtotal || 0}, ${order.totalDiscount || 0}, ${order.totalVat || 0}, ${order.grandTotal || 0}, 
          '[Mobil Plasiyer - ${safeTempId}] ${safeNotes}${safeCampaignNotes}', 1, 1, 0
        );

        DECLARE @detId bigint = @orderId + 1;
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
                @detId, @orderId, 75919, @stokId_${idx}, @birimId_${idx}, 
                ${item.quantity || 1}, ${price}, ${netTutar}, ${dahilTutar}, 
                ${item.vatRate || 1}, '${iskonto}'
              );
            END;
          `;
        }).join('\n')}

        UPDATE SEQUNCES SET ID = @detId WHERE TABLO IN ('SIPARIS', 'SIPARIS_DETAY') AND KOD_PC = 0;

        COMMIT TRANSACTION;
        SELECT '${docNo}' AS docNo FOR JSON PATH;
      END TRY
      BEGIN CATCH
        ROLLBACK TRANSACTION;
        THROW;
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
        IF @cariId IS NULL SET @cariId = 437834;

        DECLARE @finansId bigint;
        SELECT @finansId = ISNULL(MAX(ID), 3931620) + 1 FROM FINANS;

        DECLARE @kasaId bigint = 75923;

        INSERT INTO FINANS (
          ID, PROJE, LOKASYON, KASA_AD, BELGENO, 
          TARIH, ISLEM_TARIHI, FIS, MOBIL_MI
        ) VALUES (
          @finansId, 75916, 75919, @kasaId, '${safeReceiptNo}', 
          GETDATE(), GETDATE(), @finansId, 1
        );

        DECLARE @detId bigint = @finansId + 1;
        INSERT INTO FINANS_DETAY (
          ID, FINANS, FINANS_ISLEM_TURU, DOVIZ_AD, KUR, 
          KART_BORCLU, KART_ALACAKLI, TUTAR, SECIM, 
          ACIKLAMA, BELGENO, ISLEM_TARIHI
        ) VALUES (
          @detId, @finansId, ${islemTuru}, 1, 1.0, 
          @kasaId, @cariId, ${collection.amount || 0}, 0, 
          '${fullNote}', '${safeReceiptNo}', GETDATE()
        );

        UPDATE SEQUNCES SET ID = @detId WHERE TABLO IN ('FINANS', 'FINANS_DETAY') AND KOD_PC = 0;

        COMMIT TRANSACTION;
        SELECT '${docNo}' AS docNo FOR JSON PATH;
      END TRY
      BEGIN CATCH
        ROLLBACK TRANSACTION;
        THROW;
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
        SELECT '${safeDocNo}' AS docNo, '${safeInvNo}' AS invoiceNo FOR JSON PATH;
      END TRY
      BEGIN CATCH
        ROLLBACK TRANSACTION;
        THROW;
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
      FOR JSON PATH
    `;

    const custRows = await executeJsonQuery(custQuery);
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
      FOR JSON PATH
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
        IF @cariId IS NULL SET @cariId = 437834;

        DECLARE @finansId bigint;
        SELECT @finansId = ISNULL(MAX(ID), 3931620) + 1 FROM FINANS;

        DECLARE @kasaId bigint = 75923;

        INSERT INTO FINANS (
          ID, PROJE, LOKASYON, KASA_AD, BELGENO, 
          TARIH, ISLEM_TARIHI, FIS, MOBIL_MI
        ) VALUES (
          @finansId, 75916, 75919, @kasaId, '${safeReceiptNo}', 
          GETDATE(), GETDATE(), @finansId, 1
        );

        DECLARE @detId bigint = @finansId + 1;
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
        SELECT '${docNo}' AS docNo FOR JSON PATH;
      END TRY
      BEGIN CATCH
        ROLLBACK TRANSACTION;
        THROW;
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
      FOR JSON PATH
    `;

    const custRows = await executeJsonQuery(custQuery);
    if (!custRows || custRows.length === 0) {
      return { customer: null, years: [], items: [], financials: [] };
    }

    const customer = custRows[0];
    const safeCode = String(customer.code || '').replace(/'/g, "''");

    // Aynı firmanın geçmiş yıl arşiv veritabanları varsa otomatik tespit et (örn: OSMANLIGIDA, OSMANLIGIDA2025 vb.)
    const currentDbRows = await executeJsonQuery(`SELECT DB_NAME() AS dbName FOR JSON PATH`).catch(() => []);
    const currentDbName = currentDbRows?.[0]?.dbName || 'OSMANLIGIDA';
    const basePrefix = currentDbName.replace(/[_-]?\d{4}$/, '');

    const candidateDbs = await executeJsonQuery(`
      SELECT name FROM sys.databases
      WHERE state = 0 AND name LIKE '${basePrefix.replace(/'/g, "''")}%'
      ORDER BY name DESC
      FOR JSON PATH
    `).catch(() => [{ name: currentDbName }]);

    const validDbs = [];
    for (const row of candidateDbs || []) {
      const dbName = row.name;
      if (!dbName || /[^\w]/.test(dbName)) continue;
      const checkTbl = await executeJsonQuery(`
        SELECT COUNT(*) AS cnt
        FROM [${dbName}].INFORMATION_SCHEMA.TABLES
        WHERE TABLE_NAME IN ('FIS', 'FIS_DETAY', 'CARI')
        FOR JSON PATH
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
          ORDER BY T.sortDate DESC
          FOR JSON PATH;
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
          ORDER BY FD.ISLEM_TARIHI DESC, FD.ID DESC
          FOR JSON PATH;
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
};

