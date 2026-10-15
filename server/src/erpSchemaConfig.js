/**
 * ERP12 Veritabanı Tablo ve Kolon Eşleştirme Yapılandırması (Schema Mapping)
 * 
 * ERP12 kurulumunuza göre tablo veya kolon adları farklılık gösteriyorsa
 * doğrudan bu dosyadan eşleştirmeleri kolayca güncelleyebilirsiniz.
 */

export const erpSchemaConfig = {
  // 1. CARİ HESAPLAR TABLOSU
  customers: {
    tableName: 'CARI_KART', // Bazı sürümlerde 'CARI' veya 'TBLCASABIT'
    movementTableName: 'CARI_HAREKET', // Bazı sürümlerde 'TBLCAHAR'
    columns: {
      code: 'CARI_KOD',
      name: 'CARI_ISIM', // veya 'UNVAN'
      city: 'CARI_IL',
      district: 'CARI_ILCE',
      address: 'CARI_ADRES',
      phone: 'CARI_TEL',
      taxOffice: 'VERGI_DAIRESI',
      taxNumber: 'VERGI_NUMARASI',
      salesRepCode: 'PLASIYER_KODU',
      priceList: 'FIYAT_LISTESI_NO',
      specialDiscount: 'OZEL_ISKONTO',
      riskLimit: 'RISK_LIMITI',
      status: 'DURUM', // 1: Aktif
    },
    // Bakiye sorgusu: Cari kartında hazır bakiye kolonu varsa true yapılabilir
    hasDirectBalanceColumn: false,
    balanceColumnName: 'BAKIYE',
  },

  // 2. STOK KARTLARI TABLOSU
  products: {
    tableName: 'STOK_KART', // Bazı sürümlerde 'STOK' veya 'TBLSTSABIT'
    movementTableName: 'STOK_HAREKET', // Bazı sürümlerde 'TBLSTHAR'
    columns: {
      code: 'STOK_KOD',
      name: 'STOK_ADI',
      barcode: 'BARKOD1',
      category: 'GRUP_ADI',
      unit: 'BIRIM',
      vatRate: 'KDV_ORANI',
      price1: 'SATIS_FIYAT1', // Liste 1 Fiyatı
      price2: 'SATIS_FIYAT2', // Liste 2 (Toptan)
      price3: 'SATIS_FIYAT3', // Liste 3 (Özel Bayi)
      status: 'DURUM', // 1: Aktif
    },
    // Hazır bakiye kolonu varsa true yapılabilir
    hasDirectStockColumn: false,
    stockColumnName: 'BAKIYE_MIKTAR',
  },

  // 3. SİPARİŞ TABLOLARI (Saha satıştan merkeze aktarılacak tablo)
  orders: {
    headerTable: 'SIPARIS_BASLIK', // Bazı sürümlerde 'SIPARISLER' veya 'TBLSIPMAS'
    detailTable: 'SIPARIS_DETAY', // Bazı sürümlerde 'SIPARIS_HAREKET' veya 'TBLSIPTRA'
    headerColumns: {
      docNo: 'BELGE_NO',
      tempId: 'OZEL_KOD1', // Plasiyerin mobil geçici ID'si (örn: SIP-20261008-1234)
      customerCode: 'CARI_KOD',
      salesRepCode: 'PLASIYER_KODU',
      orderDate: 'TARIH',
      deliveryDate: 'TESLIM_TARIHI',
      notes: 'ACIKLAMA',
      subtotal: 'ARA_TOPLAM',
      totalDiscount: 'ISKONTO_TOPLAM',
      totalVat: 'KDV_TOPLAM',
      grandTotal: 'GENEL_TOPLAM',
      status: 'SIPARIS_DURUMU', // 1: Bekleyen Onay
    },
    detailColumns: {
      docNo: 'BELGE_NO',
      lineNo: 'SIRA_NO',
      productCode: 'STOK_KOD',
      quantity: 'MIKTAR',
      unitPrice: 'BIRIM_FIYAT',
      discountPercent: 'ISKONTO_ORANI',
      vatRate: 'KDV_ORANI',
      netTotal: 'NET_TUTAR',
      grandTotal: 'TOPLAM_TUTAR',
    },
  },
};
