import Dexie, { type Table } from 'dexie';
import type { 
  Customer, 
  Product, 
  Order, 
  CollectionRecord, 
  VisitRecord, 
  ReturnRecord, 
  Campaign,
  VanStockItem,
  VanLoadingRecord,
  VanAuditRecord
} from '../types';

export class PlasiyerDatabase extends Dexie {
  customers!: Table<Customer, string>;
  products!: Table<Product, string>;
  orders!: Table<Order, number>;
  collections!: Table<CollectionRecord, number>;
  visits!: Table<VisitRecord, number>;
  returns!: Table<ReturnRecord, number>;
  campaigns!: Table<Campaign, string>;
  vanStocks!: Table<VanStockItem, string>;
  vanLoadings!: Table<VanLoadingRecord, number>;
  vanAudits!: Table<VanAuditRecord, number>;

  constructor() {
    super('PlasiyerERP12DB');
    this.version(3).stores({
      customers: '&id, code, name, city, salesRepCode, balance',
      products: '&id, code, barcode, name, category',
      orders: '++id, tempId, customerId, customerCode, status, createdAt',
      collections: '++id, tempId, receiptNo, customerCode, paymentMethod, syncStatus, createdAt',
      visits: '++id, customerId, customerCode, salesRepCode, visitDate, dayOfWeek, status, synced',
    });
    this.version(4).stores({
      customers: '&id, code, name, city, salesRepCode, balance',
      products: '&id, code, barcode, name, category',
      orders: '++id, tempId, customerId, customerCode, status, createdAt',
      collections: '++id, tempId, receiptNo, customerCode, paymentMethod, syncStatus, createdAt',
      visits: '++id, customerId, customerCode, salesRepCode, visitDate, dayOfWeek, status, synced',
      returns: '++id, tempId, receiptNo, customerCode, syncStatus, createdAt',
    });
    this.version(5).stores({
      customers: '&id, code, name, city, salesRepCode, balance',
      products: '&id, code, barcode, name, category',
      orders: '++id, tempId, customerId, customerCode, status, createdAt',
      collections: '++id, tempId, receiptNo, customerCode, paymentMethod, syncStatus, createdAt',
      visits: '++id, customerId, customerCode, salesRepCode, visitDate, dayOfWeek, status, synced',
      returns: '++id, tempId, receiptNo, customerCode, syncStatus, createdAt',
      campaigns: '&id, code, type, isActive, startDate, endDate',
    });
    this.version(6).stores({
      customers: '&id, code, name, city, salesRepCode, balance',
      products: '&id, code, barcode, name, category',
      orders: '++id, tempId, customerId, customerCode, status, createdAt',
      collections: '++id, tempId, receiptNo, customerCode, paymentMethod, syncStatus, createdAt',
      visits: '++id, customerId, customerCode, salesRepCode, visitDate, dayOfWeek, status, synced',
      returns: '++id, tempId, receiptNo, customerCode, syncStatus, createdAt',
      campaigns: '&id, code, type, isActive, startDate, endDate',
      vanStocks: '&productCode, productId, currentStock, updatedAt',
      vanLoadings: '++id, docNo, date, vanPlate, salesRepCode, status, createdAt',
      vanAudits: '++id, docNo, date, vanPlate, salesRepCode, status, createdAt',
    });
  }
}

export const db = new PlasiyerDatabase();

// Başlangıç / Demo Verileri (ERP12'ye benzer gerçekçi saha satış verileri)
export const initialCustomers: Customer[] = [
  {
    id: 'C-001',
    code: '120.01.0001',
    name: 'Yıldız Süpermarket - Kadıköy',
    city: 'İstanbul',
    district: 'Kadıköy',
    address: 'Moda Cad. No: 42/B Kadıköy',
    phone: '0216 345 67 89',
    taxOffice: 'Kadıköy',
    taxNumber: '9876543210',
    balance: 48750.50, // Borçlu
    riskLimit: 100000,
    salesRepCode: 'PLS01',
    priceList: 2,
    specialDiscount: 5,
    email: 'siparis@yildizmarket.com',
    latitude: 40.9876,
    longitude: 29.0253,
    geofenceRadiusMeters: 150,
  },
  {
    id: 'C-002',
    code: '120.01.0002',
    name: 'Anadolu Gıda Toptan & Perakende',
    city: 'İstanbul',
    district: 'Ümraniye',
    address: 'Alemdağ Cad. No: 154 Ümraniye',
    phone: '0216 520 11 22',
    taxOffice: 'Ümraniye',
    taxNumber: '1234567891',
    balance: 124300.00, // Borçlu
    riskLimit: 150000,
    salesRepCode: 'PLS01',
    priceList: 2,
    specialDiscount: 7.5,
    email: 'muhasebe@anadolugida.com',
    latitude: 41.0250,
    longitude: 29.0965,
    geofenceRadiusMeters: 150,
  },
  {
    id: 'C-003',
    code: '120.01.0003',
    name: 'Kardeşler Büfe & Tekel',
    city: 'İstanbul',
    district: 'Ataşehir',
    address: 'Barbaros Mah. Mor Orkide Sk. No: 5',
    phone: '0532 987 65 43',
    taxOffice: 'Kozyatağı',
    taxNumber: '4567891230',
    balance: 0.00, // Bakiyesi sıfır
    riskLimit: 25000,
    salesRepCode: 'PLS01',
    priceList: 1,
    specialDiscount: 0,
    email: 'kardeslerbufe@gmail.com',
    latitude: 40.9920,
    longitude: 29.1120,
    geofenceRadiusMeters: 150,
  },
  {
    id: 'C-004',
    code: '120.01.0004',
    name: 'Gözde Unlu Mamulleri & Cafe',
    city: 'İstanbul',
    district: 'Maltepe',
    address: 'Bağdat Cad. No: 88 Maltepe',
    phone: '0216 383 44 55',
    taxOffice: 'Küçükyalı',
    taxNumber: '3216549870',
    balance: -5200.00, // Alacaklı (avans vermiş)
    riskLimit: 50000,
    salesRepCode: 'PLS01',
    priceList: 2,
    specialDiscount: 3,
    latitude: 40.9320,
    longitude: 29.1350,
    geofenceRadiusMeters: 150,
  },
  {
    id: 'C-005',
    code: '120.01.0005',
    name: 'Marmara Mini Hal Pazarı',
    city: 'İstanbul',
    district: 'Kartal',
    address: 'Cevizli Mah. Köroğlu Cad. No: 12',
    phone: '0216 441 77 88',
    taxOffice: 'Kartal',
    taxNumber: '7891234560',
    balance: 31250.75,
    riskLimit: 60000,
    salesRepCode: 'PLS01',
    priceList: 3,
    specialDiscount: 10,
    latitude: 40.9080,
    longitude: 29.1760,
    geofenceRadiusMeters: 150,
  }
];

export const initialProducts: Product[] = [
  {
    id: 'P-001',
    code: 'STK.GDA.001',
    barcode: '8690504123456',
    name: 'Çaykur Rize Turist Çay 1000 Gr',
    category: 'Gıda / İçecek',
    unit: 'ADET',
    vatRate: 1,
    price1: 195.00,
    price2: 175.00,
    price3: 165.00,
    stockQuantity: 420,
  },
  {
    id: 'P-002',
    code: 'STK.GDA.002',
    barcode: '8690504123457',
    name: 'Yudum Ayçiçek Yağı 5 Lt Pet',
    category: 'Gıda / Yağ',
    unit: 'ADET',
    vatRate: 1,
    price1: 340.00,
    price2: 310.00,
    price3: 295.00,
    stockQuantity: 185,
  },
  {
    id: 'P-003',
    code: 'STK.GDA.003',
    barcode: '8690504123458',
    name: 'Sütaş Tam Yağlı Beyaz Peynir 800 Gr',
    category: 'Süt Ürünleri',
    unit: 'ADET',
    vatRate: 1,
    price1: 185.00,
    price2: 165.00,
    price3: 155.00,
    stockQuantity: 92,
  },
  {
    id: 'P-004',
    code: 'STK.GDA.004',
    barcode: '8690504123459',
    name: 'Barilla Burgu Makarna 500 Gr (12\'li Koli)',
    category: 'Gıda / Bakliyat',
    unit: 'KOLİ',
    vatRate: 1,
    price1: 420.00,
    price2: 375.00,
    price3: 350.00,
    stockQuantity: 65,
  },
  {
    id: 'P-005',
    code: 'STK.TMZ.001',
    barcode: '8690504123460',
    name: 'Ariel Dağ Esintisi Toz Deterjan 7 Kg',
    category: 'Temizlik',
    unit: 'ADET',
    vatRate: 20,
    price1: 480.00,
    price2: 430.00,
    price3: 410.00,
    stockQuantity: 110,
  },
  {
    id: 'P-006',
    code: 'STK.TMZ.002',
    barcode: '8690504123461',
    name: 'Pril Klasik Bulaşık Sıvısı 4 Kg',
    category: 'Temizlik',
    unit: 'ADET',
    vatRate: 20,
    price1: 195.00,
    price2: 170.00,
    price3: 160.00,
    stockQuantity: 240,
  },
  {
    id: 'P-007',
    code: 'STK.ICE.001',
    barcode: '8690504123462',
    name: 'Kızılay Doğal Maden Suyu 200 ml (24\'lü Koli)',
    category: 'Gıda / İçecek',
    unit: 'KOLİ',
    vatRate: 10,
    price1: 160.00,
    price2: 140.00,
    price3: 130.00,
    stockQuantity: 315,
  },
  {
    id: 'P-008',
    code: 'STK.SEK.001',
    barcode: '8690504123463',
    name: 'Doğuş Toz Şeker 5 Kg',
    category: 'Gıda / Şeker',
    unit: 'ADET',
    vatRate: 1,
    price1: 180.00,
    price2: 162.00,
    price3: 154.00,
    stockQuantity: 140,
  }
];

export const initialCampaigns: Campaign[] = [
  {
    id: 'CAMP-001',
    code: '10_ARTI_1_CAYKUR',
    title: '10 Alana 1 Bedelsiz Çaykur Rize Çay',
    description: 'Her 10 adet Çaykur Rize Turist Çay 1000 Gr alımınıza 1 adet aynı üründen BEDELSİZ hediye!',
    type: 'quantity_gift',
    badge: '🎁 10+1 Hediye',
    targetProductId: 'P-001',
    targetProductName: 'Çaykur Rize Turist Çay 1000 Gr',
    minQuantity: 10,
    rewardProductId: 'P-001',
    rewardProductName: 'Çaykur Rize Turist Çay 1000 Gr',
    rewardQuantity: 1,
    isActive: true,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    isStackable: true,
  },
  {
    id: 'CAMP-002',
    code: 'SEPET_5000_ISKONTO',
    title: '5.000 ₺ ve Üzeri Siparişe %5 Ekstra Ciro İskontosu',
    description: 'Sepet tutarı 5.000 TL ve üzerine ulaştığında tüm sepete anında ekstra %5 teşvik iskontosu uygulanır.',
    type: 'cart_threshold_discount',
    badge: '⚡ %5 Ekstra İndirim',
    minCartAmount: 5000,
    rewardDiscountPercent: 5,
    isActive: true,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
  },
  {
    id: 'CAMP-003',
    code: 'YUDUM_ALANA_BARILLA_HEDIYE',
    title: '5 Adet Yudum Yağ Alana 1 Koli Barilla Makarna Hediye',
    description: '5 adet ve üzeri Yudum Ayçiçek Yağı 5L alımında 1 koli Barilla Burgu Makarna (12\'li) BEDELSİZ hediye!',
    type: 'cross_product_gift',
    badge: '🍝 Makarna Hediye',
    targetProductId: 'P-002',
    targetProductName: 'Yudum Ayçiçek Yağı 5 Lt Pet',
    minQuantity: 5,
    rewardProductId: 'P-004',
    rewardProductName: 'Barilla Burgu Makarna 500 Gr (12\'li Koli)',
    rewardQuantity: 1,
    isActive: true,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    isStackable: true,
  },
];

// Veritabanını ilk açılışta demo verilerle doldur (eğer boşsa)
export async function seedInitialDataIfNeeded() {
  const customerCount = await db.customers.count();
  if (customerCount === 0) {
    await db.customers.bulkAdd(initialCustomers);
  }

  const productCount = await db.products.count();
  if (productCount === 0) {
    await db.products.bulkAdd(initialProducts);
  }

  const campaignCount = await db.campaigns.count();
  if (campaignCount === 0) {
    await db.campaigns.bulkAdd(initialCampaigns);
  }

  const visitCount = await db.visits.count();
  if (visitCount === 0) {
    const allCustomers = await db.customers.toArray();
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const todayDayOfWeek = today.getDay() === 0 ? 7 : today.getDay(); // 1: Pzt ... 7: Paz

    const initialVisits: VisitRecord[] = allCustomers.slice(0, 24).map((cust, idx) => {
      const dayOfWeek = (idx % 6) + 1; // 1: Pazartesi .. 6: Cumartesi
      const isToday = dayOfWeek === todayDayOfWeek;
      
      return {
        customerId: cust.id,
        customerCode: cust.code,
        customerName: cust.name,
        salesRepCode: cust.salesRepCode || 'PLS01',
        visitDate: isToday ? todayStr : `2026-10-${String(12 + dayOfWeek).padStart(2, '0')}`,
        dayOfWeek,
        status: 'pending',
        synced: true,
      };
    });

    if (initialVisits.length > 0) {
      await db.visits.bulkAdd(initialVisits);
    }
  }

  const vanStockCount = await db.vanStocks.count();
  if (vanStockCount === 0) {
    await db.vanStocks.bulkAdd(initialVanStocks);
  }

  // AŞAMA 9: Mevcut müşterilerde GPS koordinatları yoksa doldur
  const currentDbCustomers = await db.customers.toArray();
  for (const cust of currentDbCustomers) {
    if (!cust.latitude || !cust.longitude) {
      const match = initialCustomers.find(ic => ic.id === cust.id || ic.code === cust.code);
      if (match && match.latitude && match.longitude) {
        await db.customers.update(cust.id, {
          latitude: match.latitude,
          longitude: match.longitude,
          geofenceRadiusMeters: match.geofenceRadiusMeters || 150,
        });
      } else {
        const baseLat = 40.98 + (Math.random() * 0.08);
        const baseLon = 29.02 + (Math.random() * 0.12);
        await db.customers.update(cust.id, {
          latitude: parseFloat(baseLat.toFixed(4)),
          longitude: parseFloat(baseLon.toFixed(4)),
          geofenceRadiusMeters: 150,
        });
      }
    }
  }
}

export const initialVanStocks: VanStockItem[] = [
  {
    productId: 'P-001',
    productCode: 'STK.GDA.001',
    productName: 'Çaykur Rize Turist Çay 1000 Gr',
    barcode: '8690504123456',
    unit: 'ADET',
    category: 'Gıda / İçecek',
    unitPrice: 175.00,
    currentStock: 45,
    initialStock: 45,
    totalLoadedToday: 45,
    totalSoldToday: 0,
    totalReturnedToday: 0,
    vanPlate: '25 AG 123',
    updatedAt: new Date().toISOString(),
  },
  {
    productId: 'P-002',
    productCode: 'STK.GDA.002',
    productName: 'Yudum Ayçiçek Yağı 5 Lt Pet',
    barcode: '8690504123457',
    unit: 'ADET',
    category: 'Gıda / Yağ',
    unitPrice: 310.00,
    currentStock: 25,
    initialStock: 25,
    totalLoadedToday: 25,
    totalSoldToday: 0,
    totalReturnedToday: 0,
    vanPlate: '25 AG 123',
    updatedAt: new Date().toISOString(),
  },
  {
    productId: 'P-003',
    productCode: 'STK.GDA.003',
    productName: 'Sütaş Tam Yağlı Beyaz Peynir 800 Gr',
    barcode: '8690504123458',
    unit: 'ADET',
    category: 'Süt Ürünleri',
    unitPrice: 165.00,
    currentStock: 18,
    initialStock: 18,
    totalLoadedToday: 18,
    totalSoldToday: 0,
    totalReturnedToday: 0,
    vanPlate: '25 AG 123',
    updatedAt: new Date().toISOString(),
  },
  {
    productId: 'P-004',
    productCode: 'STK.GDA.004',
    productName: 'Barilla Burgu Makarna 500 Gr (12\'li Koli)',
    barcode: '8690504123459',
    unit: 'KOLİ',
    category: 'Gıda / Bakliyat',
    unitPrice: 375.00,
    currentStock: 20,
    initialStock: 20,
    totalLoadedToday: 20,
    totalSoldToday: 0,
    totalReturnedToday: 0,
    vanPlate: '25 AG 123',
    updatedAt: new Date().toISOString(),
  },
  {
    productId: 'P-005',
    productCode: 'STK.TMZ.001',
    productName: 'Ariel Dağ Esintisi Toz Deterjan 7 Kg',
    barcode: '8690504123460',
    unit: 'ADET',
    category: 'Temizlik',
    unitPrice: 430.00,
    currentStock: 12,
    initialStock: 12,
    totalLoadedToday: 12,
    totalSoldToday: 0,
    totalReturnedToday: 0,
    vanPlate: '25 AG 123',
    updatedAt: new Date().toISOString(),
  },
  {
    productId: 'P-006',
    productCode: 'STK.GDA.005',
    productName: 'Doğuş Filiz Çay 1000 Gr',
    barcode: '8690504123461',
    unit: 'ADET',
    category: 'Gıda / İçecek',
    unitPrice: 165.00,
    currentStock: 30,
    initialStock: 30,
    totalLoadedToday: 30,
    totalSoldToday: 0,
    totalReturnedToday: 0,
    vanPlate: '25 AG 123',
    updatedAt: new Date().toISOString(),
  },
];
