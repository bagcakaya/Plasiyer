export type UserRole = 'plasiyer' | 'customer';

export type AppTheme = 'dark' | 'light';

export interface B2BCategory {
  id: string;
  name: string;
  icon?: string;
  badge?: string;
  filterKeyword?: string;
}

export interface CustomerPriceInfo {
  standardPrice: number;
  customerPrice: number;
  discountPercent: number;
  hasSpecialPrice: boolean;
  savingsAmount: number;
}

export interface Customer {
  id: string; // Cari Kodu veya ID
  code: string;
  name: string;
  city: string;
  district: string;
  address: string;
  phone: string;
  taxNumber?: string;
  taxOffice?: string;
  balance: number; // Pozitif: Borçlu, Negatif: Alacaklı
  riskLimit: number;
  salesRepCode: string;
  priceList: 1 | 2 | 3;
  specialDiscount: number; // Müşteriye özel iskonto %
  email?: string;
  lastVisitDate?: string;
  // AŞAMA 9: GPS & Geofencing
  latitude?: number;
  longitude?: number;
  geofenceRadiusMeters?: number; // Örn. 150m (ziyaret doğrulama toleransı)
}

export interface Product {
  id: string; // Stok Kodu veya ID
  code: string;
  barcode: string;
  name: string;
  category: string;
  unit: string;
  vatRate: number; // %1, %10, %20
  price1: number; // Standart Liste Fiyatı
  price2: number; // Toptan Fiyat
  price3: number; // Bayi/Özel Fiyat
  stockQuantity: number; // Mevcut stok
  image?: string;
  b2bCategoryId?: string;
  isFeatured?: boolean;
}

export interface OrderItem {
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  vatRate: number;
  netPrice: number; // unitPrice * (1 - discountPercent/100)
  totalAmount: number; // netPrice * quantity
  vatAmount: number; // totalAmount * (vatRate/100)
  grandTotal: number; // totalAmount + vatAmount
  // AŞAMA 7: Kampanya & Promosyon Alanları
  isGift?: boolean; // Bedelsiz promosyon satırı mı?
  campaignId?: string; // Uygulanan kampanya ID
  campaignTitle?: string; // Kampanya başlığı
  originalUnitPrice?: number; // Normal birim fiyat (üstü çizili göstermek için)
  // AŞAMA 8: Sıcak Satış
  saleType?: 'cold' | 'hot';
}

export interface Order {
  id?: number; // Dexie auto-increment ID
  tempId: string; // "SIP-20261008-XXXX"
  customerId: string;
  customerCode: string;
  customerName: string;
  salesRepCode: string;
  orderDate: string; // ISO
  deliveryDate?: string;
  notes?: string;
  items: OrderItem[];
  subtotal: number; // İskontosuz matrah
  totalDiscount: number;
  totalVat: number;
  grandTotal: number;
  // AŞAMA 7: Kampanya & Promosyon Alanları
  campaignDiscount?: number;
  totalCampaignSavings?: number;
  appliedCampaigns?: AppliedCampaign[];
  // AŞAMA 8: Sıcak Satış
  saleType?: 'cold' | 'hot';
  vanPlate?: string;
  vanWarehouseCode?: string;
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  errorMessage?: string;
  erp12DocNo?: string;
  invoiceStatus?: 'pending' | 'invoiced' | 'dispatched';
  invoiceNo?: string;
  invoicedAt?: string;
  createdAt: string;
  syncedAt?: string;
}

export interface SalesRep {
  code: string;
  name: string;
  title: string;
  token?: string;
}

export interface ServerConfig {
  apiUrl: string; // örn: "http://192.168.1.50:4000/api" veya Statik IP
  companyCode: string; // ERP12 Şirket No / Lisans Kodu (örn: "01" veya "AHMETGIDA")
  period: string; // Çalışma Dönemi (örn: "2026")
  autoSync: boolean;

  // Görsel-1 Doğrudan SQL Server Bağlantı Parametreleri:
  companyTitle?: string; // FİRMA TİCARİ UNVANI
  sqlHost?: string; // SQL SERVER IP ADRESİ / HOST ADI (örn: localhost veya 85.105.xx.xx)
  sqlPort?: string; // SQL PORTU (örn: 1433)
  sqlDatabase?: string; // SQL SERVER VERİTABANI ADI (DB Name)
  sqlUser?: string; // SQL KULLANICI ADI (Opsiyonel / SQL Auth)
  sqlPassword?: string; // SQL KULLANICI ŞİFRESİ (Opsiyonel)
  licenseExpireDate?: string; // LİSANS BİTİŞ TARİHİ (örn: 2027-12-31)
  bridgePort?: string; // Node.js API Köprü Portu (Varsayılan: 4000)
}

export type PaymentMethod = 'nakit' | 'kredi_karti' | 'cek' | 'havale';

export interface CollectionRecord {
  id?: number;
  tempId: string; // "THS-20261015-XXXX"
  receiptNo: string; // "MAK-2026-0001"
  customerId: string;
  customerCode: string;
  customerName: string;
  salesRepCode: string;
  salesRepName?: string;
  amount: number;
  paymentMethod: PaymentMethod;
  notes?: string;
  checkBank?: string;
  checkNo?: string;
  checkDueDate?: string;
  createdAt: string; // ISO
  syncStatus: 'pending' | 'syncing' | 'synced' | 'failed';
  erpDocNo?: string;
  errorMessage?: string;
  syncedAt?: string;
}

export type PrintSlipType = 'order' | 'collection' | 'return' | 'end_of_day' | 'van_loading' | 'van_audit';

export interface AppNotification {
  id: string;
  type: 'new_order' | 'new_collection' | 'new_return' | 'order_invoiced' | 'system';
  title: string;
  message: string;
  timestamp: string;
  orderDocNo?: string;
  orderTempId?: string;
  amount?: number;
  customerName?: string;
  read: boolean;
  data?: any;
}

// PAKET 1: CARİ HESAP EKSTRESİ
export interface StatementMovement {
  id: string;
  date: string;
  time?: string;
  docNo: string;
  transactionType: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface CustomerStatement {
  customer: {
    id: string;
    code: string;
    name: string;
    address: string;
    phone: string;
    taxOffice: string;
    taxNumber: string;
    balance: number;
  };
  movements: StatementMovement[];
  summary: {
    totalDebit: number;
    totalCredit: number;
    closingBalance: number;
  };
}

// PAKET 2: KİMLİK DOĞRULAMA & GİRİŞ
export interface AuthUser {
  id: string;
  role: UserRole;
  code: string;
  name: string;
  salesRepCode?: string;
  customerId?: string;
  customerCode?: string;
  token?: string;
}

// PAKET 3: PLASİYER GÜNLÜK RUT & ZİYARET YÖNETİMİ
export type VisitStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';

export type NoOrderReason = 
  | 'stok_yeterli'
  | 'yetkili_yoktu'
  | 'fiyat_yuksek'
  | 'odeme_gecikmesi'
  | 'dukkan_kapali'
  | 'rakip_urun_almis'
  | 'diger';

export interface VisitRecord {
  id?: number;
  customerId: string;
  customerCode: string;
  customerName: string;
  salesRepCode: string;
  visitDate: string; // YYYY-MM-DD
  dayOfWeek: number; // 1: Pazartesi .. 6: Cumartesi
  status: VisitStatus;
  checkInTime?: string; // ISO
  checkOutTime?: string; // ISO
  durationMinutes?: number;
  orderCreated?: boolean;
  orderDocNo?: string;
  orderAmount?: number;
  collectionCreated?: boolean;
  collectionAmount?: number;
  noOrderReason?: NoOrderReason;
  noOrderNotes?: string;
  notes?: string;
  synced: boolean;
  // AŞAMA 9: GPS Doğrulama & Geofencing
  checkInLatitude?: number;
  checkInLongitude?: number;
  distanceMeters?: number;
  isWithinGeofence?: boolean;
  geofenceStatus?: 'inside' | 'outside' | 'unknown';
  routeOrder?: number;
}

// PAKET 4: ÇOKLU FİRMA & BAĞLANTI PROFİLLERİ
export interface CompanyProfile {
  id: string;
  name: string; // "OSMANLI GIDA - Merkez (Erzurum)"
  code: string; // "01"
  period: string; // "2026"
  serverUrl: string; // "http://localhost:4000/api" veya Statik IP
  warehouseId?: number;
  cashboxId?: number;
  isDefault?: boolean;
  companyTitle?: string;
  sqlHost?: string;
  sqlPort?: string;
  sqlDatabase?: string;
  sqlUser?: string;
  sqlPassword?: string;
  licenseExpireDate?: string;
}

// AŞAMA 6 - C: İADE & DEĞİŞİM MODÜLÜ
export type ReturnReason = 
  | 'hasarli_kusurlu' 
  | 'skt_gecmis' 
  | 'yanlis_siparis' 
  | 'fazla_sevkiyat' 
  | 'musteri_vazgecti' 
  | 'diger';

export interface ReturnItem {
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  totalAmount: number;
  reason: ReturnReason;
  notes?: string;
}

export interface ReturnRecord {
  id?: number;
  tempId: string; // "IAD-20261015-XXXX"
  receiptNo: string; // "IAD-2026-0001"
  customerId: string;
  customerCode: string;
  customerName: string;
  salesRepCode: string;
  salesRepName?: string;
  items: ReturnItem[];
  subtotal: number;
  totalVat: number;
  grandTotal: number;
  notes?: string;
  createdAt: string; // ISO
  syncStatus: 'pending' | 'syncing' | 'synced' | 'failed';
  erpDocNo?: string;
  errorMessage?: string;
  syncedAt?: string;
}

// AŞAMA 6 - A: PLASİYER GÜNLÜK KAPANIS & CİRO RAPORU (Z RAPORU)
export interface EndOfDayReport {
  date: string; // YYYY-MM-DD
  salesRepCode: string;
  salesRepName: string;
  generatedAt: string; // ISO
  ordersSummary: {
    count: number;
    totalGross: number;
    totalDiscount: number;
    totalVat: number;
    totalNet: number;
  };
  collectionsSummary: {
    totalAmount: number;
    cashAmount: number;
    cashCount: number;
    posAmount: number;
    posCount: number;
    checkAmount: number;
    checkCount: number;
    transferAmount: number;
    transferCount: number;
  };
  visitsSummary: {
    totalPlanned: number;
    completed: number;
    withOrder: number;
    withoutOrder: number;
    successRate: number;
    reasonsCount: Record<string, number>;
  };
  returnsSummary: {
    count: number;
    totalAmount: number;
  };
  netCashBalance: number; // Toplam Nakit Tahsilat - Varsa Nakit İade
}

// FİŞ VE TERMAL YAZICI PARAMETRELERİ
export interface PrintSlipParams {
  type: PrintSlipType;
  orderData?: Order | null;
  collectionData?: CollectionRecord | null;
  returnData?: ReturnRecord | null;
  endOfDayData?: EndOfDayReport | null;
  vanLoadingData?: VanLoadingRecord | null;
  vanAuditData?: VanAuditRecord | null;
  customerPreviousBalance?: number;
}

// AŞAMA 7: KAMPANYA, PROMOSYON & BEDELSİZ ÜRÜN MOTORU
export type CampaignType = 
  | 'quantity_gift'           // X adet alana Y adet bedelsiz hediye (10+1 vb.)
  | 'cart_threshold_discount' // X TL üzeri sepete %Y veya Z TL sepet iskontosu
  | 'category_discount'       // Belirli kategoriye %X ekstra indirim
  | 'cross_product_gift';     // A ürününden X adet alana B ürünü bedelsiz hediye

export interface Campaign {
  id: string; // "CAMP-01"
  code: string; // "10_ARTI_1_CAY"
  title: string; // "10 Alana 1 Bedelsiz Çaykur Kampanyası"
  description: string;
  type: CampaignType;
  badge: string; // "🎁 10+1 Hediye"
  targetProductId?: string;
  targetProductName?: string;
  targetCategory?: string;
  minQuantity?: number;
  minCartAmount?: number;
  rewardProductId?: string;
  rewardProductName?: string;
  rewardQuantity?: number;
  rewardDiscountPercent?: number;
  rewardDiscountAmount?: number;
  isActive: boolean;
  startDate: string; // ISO
  endDate: string; // ISO
  isStackable?: boolean; // Katları uygulanabilir mi? (örn: 20 alana 2, 30 alana 3)
}

export interface AppliedCampaign {
  campaignId: string;
  campaignCode: string;
  campaignTitle: string;
  badge: string;
  type: CampaignType;
  benefitDescription: string;
  rewardProductId?: string;
  rewardProductName?: string;
  rewardQuantity?: number;
  discountAmount?: number;
}

export interface CampaignOpportunity {
  campaign: Campaign;
  currentValue: number;
  targetValue: number;
  missingValue: number;
  progressPercent: number;
  hint: string; // "Sepete 2 adet daha Çaykur eklerseniz 1 adet BEDELSİZ hediye kazanacaksınız!"
}

export interface CartSummary {
  subtotal: number;
  totalDiscount: number;
  totalVat: number;
  grandTotal: number;
  totalItems: number;
  totalSavings: number; // Müşterinin standart fiyata göre toplam kazancı
  // AŞAMA 7 Ekleri
  campaignDiscountAmount: number;
  totalCampaignSavings: number; // Bedelsiz ürün değeri + kampanya iskontoları
  appliedCampaigns: AppliedCampaign[];
  opportunities: CampaignOpportunity[];
}

// AŞAMA 8: SICAK SATIŞ (ARAÇ İÇİ STOK, YÜKLEME & ARAÇ SAYIMI)
export type SaleMode = 'cold' | 'hot';

export interface VanStockItem {
  id?: number;
  productId: string;
  productCode: string;
  productName: string;
  barcode?: string;
  unit: string;
  category?: string;
  unitPrice?: number;
  currentStock: number; // Araçta şu an bulunan fiziki miktar
  initialStock: number; // Güne başlarken araçtaki miktar
  totalLoadedToday: number; // Bugün araca yüklenen toplam
  totalSoldToday: number; // Bugün sıcak satışla araçtan teslim edilen
  totalReturnedToday: number; // Bugün müşteriden araç deposuna iade alınan
  vanPlate: string; // örn: "25 AG 123"
  updatedAt: string;
}

export interface VanLoadingItem {
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  quantity: number;
  barcode?: string;
  unitPrice?: number;
}

export interface VanLoadingRecord {
  id?: number;
  docNo: string; // "YUK-20261015-XXXX"
  date: string;
  vanPlate: string;
  salesRepCode: string;
  salesRepName?: string;
  sourceWarehouse: string; // "Merkez Ana Depo"
  targetVanWarehouse: string; // "02 Araç Deposu (25 AG 123)"
  items: VanLoadingItem[];
  totalQuantity: number;
  notes?: string;
  status: 'draft' | 'confirmed';
  createdAt: string;
}

export interface VanAuditItem {
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  theoreticalStock: number; // Sistemdeki teorik kalan
  countedStock: number; // Plasiyerin saydığı fiili miktar
  difference: number; // countedStock - theoreticalStock (eksi: fire/eksik, artı: fazla)
  unitPrice: number;
  differenceAmount: number; // difference * unitPrice
}

export interface VanAuditRecord {
  id?: number;
  docNo: string; // "SYM-20261015-XXXX"
  date: string;
  vanPlate: string;
  salesRepCode: string;
  salesRepName?: string;
  items: VanAuditItem[];
  totalTheoretical: number;
  totalCounted: number;
  totalDifference: number;
  totalDifferenceAmount: number;
  status: 'completed';
  notes?: string;
  createdAt: string;
}

// AŞAMA 9: GPS KONUM & GEOFENCING
export interface GeoLocationState {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp?: number;
  isSimulated?: boolean;
}

export type NavigationApp = 'google' | 'apple' | 'yandex';

// AŞAMA 10: PLASİYER KOTASI, HEDEF & PRİM SİSTEMİ
export interface CommissionTier {
  tierNumber: number;
  minPercent: number; // örn. %80
  maxPercent: number; // örn. %100
  rate: number; // örn. %1.5
  badge: string; // "Bronz Prim", "Gümüş Prim", "Altın Prim"
}

export interface PlasiyerQuotaTarget {
  id?: number;
  salesRepCode: string;
  period: string; // "2026-10"
  monthlyRevenueTarget: number; // Aylık Ciro Hedefi (örn. 500.000 ₺)
  dailyRevenueTarget: number; // Günlük Ciro Hedefi (örn. 25.000 ₺)
  monthlyBoxTarget: number; // Aylık Koli/Adet Hedefi (örn. 2.000 Koli)
  dailyBoxTarget: number; // Günlük Koli Hedefi (örn. 100 Koli)
  monthlyCollectionTarget: number; // Aylık Tahsilat Hedefi (örn. 450.000 ₺)
  baseSalary: number; // Sabit Maaş / Avans (opsiyonel gösterim)
}

export interface PlasiyerPerformanceSummary {
  period: string;
  revenueTarget: number;
  revenueActual: number;
  revenueProgressPercent: number;
  
  boxTarget: number;
  boxActual: number;
  boxProgressPercent: number;
  
  collectionTarget: number;
  collectionActual: number;
  collectionProgressPercent: number;
  
  estimatedCommissionAmount: number;
  activeTier: CommissionTier;
  successfulVisitsCount: number;
  totalVisitsCount: number;
  visitSuccessRatePercent: number;
}



