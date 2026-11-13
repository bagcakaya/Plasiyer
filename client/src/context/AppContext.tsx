import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, seedInitialDataIfNeeded } from '../db';
import { syncService, type SyncResult } from '../services/syncService';
import { apiService, isDemoMode, resolveApiBaseUrl } from '../services/apiService';
import { soundNotification } from '../utils/soundNotification';
import type { 
  Customer, 
  Product, 
  OrderItem, 
  Order, 
  SalesRep, 
  ServerConfig, 
  UserRole, 
  AppTheme, 
  CustomerPriceInfo,
  PaymentMethod,
  CollectionRecord,
  AppNotification,
  AuthUser,
  ReturnRecord,
  ReturnItem,
  PrintSlipParams,
  CartSummary,
  Campaign,
  SaleMode,
  VanStockItem,
  VanLoadingRecord,
  VanLoadingItem,
  VanAuditRecord,
  VanAuditItem,
  PlasiyerQuotaTarget,
  PlasiyerPerformanceSummary,
  CompanyIssuerInfo
} from '../types';
import { campaignService } from '../services/campaignService';
import { vanStockService } from '../services/vanStockService';
import { DEFAULT_QUOTA_TARGET, calculatePerformanceSummary } from '../services/quotaService';
import {
  LICENSE_EXPIRED_MESSAGE,
  LICENSE_EXPIRED_SESSION_KEY,
  plasiyerAuthService,
} from '../services/plasiyerAuthService';

interface AppContextType {
  isOnline: boolean;
  theme: AppTheme;
  toggleTheme: () => void;
  
  // Kampanyalar & Promosyonlar (Aşama 7)
  campaigns: Campaign[];
  activeCampaigns: Campaign[];
  isCampaignsModalOpen: boolean;
  openCampaignsModal: () => void;
  closeCampaignsModal: () => void;
  
  // Rol, Kimlik & Giriş (Paket 2)
  isAuthenticated: boolean;
  currentUser: AuthUser | null;
  isCompanyManager: boolean;
  login: (user: AuthUser) => void;
  logout: () => void;
  userRole: UserRole;
  currentCustomerUser: Customer | null;
  switchUserRole: (role: UserRole, customer?: Customer | null) => void;
  
  // Plasiyer & Sunucu
  salesRep: SalesRep;
  setSalesRep: (rep: SalesRep) => void;
  serverConfig: ServerConfig;
  companyIssuer: CompanyIssuerInfo;
  updateServerConfig: (config: Partial<ServerConfig>) => void;
  selectedCustomer: Customer | null;
  selectCustomer: (customer: Customer | null) => void;
  isCustomerSelectModalOpen: boolean;
  openCustomerSelectModal: () => void;
  closeCustomerSelectModal: () => void;
  customerSelectReturnTab: 'cart' | 'catalog' | null;
  clearCustomerSelectReturnTab: () => void;
  
  // Fiyat Hesaplama
  calculateCustomerPrice: (product: Product, customCustomer?: Customer | null) => CustomerPriceInfo;
  
  // Kategori Filtresi (Instagram Hikayeleri - Görsel-2)
  selectedCategory: string;
  setSelectedCategory: (category: string) => void;

  // Cart
  cart: OrderItem[];
  cartSummary: CartSummary;
  addToCart: (product: Product, quantity?: number) => void;
  updateCartItemQuantity: (productId: string, quantity: number) => void;
  updateCartItemDiscount: (productId: string, discountPercent: number) => void;
  updateCartItemVatRate: (productId: string, vatRate: number) => void;
  updateCartItemPrice: (productId: string, unitPrice: number) => void;
  updateCartItemNetTotal: (productId: string, netTotal: number) => void;
  updateCartItemGrandTotal: (productId: string, grandTotal: number) => void;
  toggleCartItemSelected: (productId: string) => void;
  setAllCartItemsSelected: (selected: boolean) => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;
  
  // Order
  submitCurrentOrder: (deliveryDate?: string, notes?: string) => Promise<{ success: boolean; orderId?: number; error?: string }>;
  
  // Navigation / Tab
  activeTab: 'customers' | 'catalog' | 'cart' | 'orders' | 'routes' | 'settings' | 'van_stock';
  setActiveTab: (tab: 'customers' | 'catalog' | 'cart' | 'orders' | 'routes' | 'settings' | 'van_stock') => void;
  
  // Tahsilat (Aşama 2)
  createCollection: (params: {
    customerId: string;
    customerCode: string;
    customerName: string;
    amount: number;
    paymentMethod: PaymentMethod;
    notes?: string;
    checkBank?: string;
    checkNo?: string;
    checkDueDate?: string;
  }) => Promise<{ success: boolean; collection?: CollectionRecord; error?: string }>;
  pendingCollectionsCount: number;

  // Tahsilat Modalı
  isCollectionModalOpen: boolean;
  collectionTargetCustomer: Customer | null;
  openCollectionModal: (customer?: Customer | null) => void;
  closeCollectionModal: () => void;

  // Termal Fiş Modalı
  activePrintSlip: PrintSlipParams | null;
  openPrintSlip: (params: PrintSlipParams) => void;
  closePrintSlip: () => void;

  // Bildirimler & Canlı Akış (Aşama 3)
  notifications: AppNotification[];
  unreadNotificationsCount: number;
  activeToastNotification: AppNotification | null;
  markNotificationAsRead: (id: string) => void;
  markAllNotificationsAsRead: () => void;
  dismissToastNotification: () => void;
  requestNotificationPermission: () => Promise<boolean>;

  // Faturalaştırma (Aşama 3)
  invoiceOrder: (order: Order, invoiceNo?: string, notes?: string) => Promise<{ success: boolean; invoiceNo?: string; error?: string }>;

  // Sync & Otomatik Canlı Eşitleme (Aşama 6 - B)
  pendingOrdersCount: number;
  pendingReturnsCount: number;
  isSyncing: boolean;
  triggerSync: (overrideConfig?: ServerConfig) => Promise<SyncResult>;
  lastSyncTime: Date | null;
  autoSyncEnabled: boolean;
  toggleAutoSync: () => void;

  // İade & Değişim Modülü (Aşama 6 - C)
  createReturn: (params: {
    customerId: string;
    customerCode: string;
    customerName: string;
    items: ReturnItem[];
    subtotal: number;
    totalVat: number;
    grandTotal: number;
    notes?: string;
  }) => Promise<{ success: boolean; returnRecord?: ReturnRecord; error?: string }>;
  isReturnModalOpen: boolean;
  returnTargetCustomer: Customer | null;
  openReturnModal: (customer?: Customer | null) => void;
  closeReturnModal: () => void;

  // Günlük Kapanış (Z Raporu) Modalı (Aşama 6 - A)
  isDailyReportModalOpen: boolean;
  openDailyReportModal: () => void;
  closeDailyReportModal: () => void;

  // AŞAMA 8: Sıcak Satış (Araç İçi Stok, Yükleme & Sayım)
  saleMode: SaleMode;
  setSaleMode: (mode: SaleMode) => void;
  toggleSaleMode: () => void;
  vanPlate: string;
  setVanPlate: (plate: string) => void;
  vanStocks: VanStockItem[];
  vanLoadings: VanLoadingRecord[];
  vanAudits: VanAuditRecord[];
  loadVanStock: (items: VanLoadingItem[], notes?: string) => Promise<VanLoadingRecord>;
  auditVanStock: (items: VanAuditItem[], notes?: string) => Promise<VanAuditRecord>;
  getVanStockByCode: (productCode: string) => number;

  // AŞAMA 10: Plasiyer Kotası, Hedef & Prim Paneli
  isPerformanceModalOpen: boolean;
  openPerformanceModal: () => void;
  closePerformanceModal: () => void;
  quotaTarget: PlasiyerQuotaTarget;
  updateQuotaTarget: (target: Partial<PlasiyerQuotaTarget>) => void;
  performanceSummary: PlasiyerPerformanceSummary;

  // PWA & Android Ana Ekrana Ekleme
  isPwaInstalled: boolean;
  canInstallPwa: boolean;
  isPwaModalOpen: boolean;
  openPwaModal: () => void;
  closePwaModal: () => void;
  promptPwaInstall: () => Promise<boolean>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const DEFAULT_SALES_REP: SalesRep = {
  code: 'PLS01',
  name: 'Ahmet Yılmaz',
  title: 'Marmara Bölge Satış Temsilcisi',
};

const isRemoteHost = (): boolean => {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return (
    host.includes('vercel.app') ||
    (host !== 'localhost' && host !== '127.0.0.1' && !host.match(/^\d+\.\d+\.\d+\.\d+$/))
  );
};

const DEFAULT_SERVER_CONFIG: ServerConfig = {
  apiUrl: typeof window !== 'undefined' && isRemoteHost() ? 'demo' : `http://${typeof window !== 'undefined' ? window.location.hostname || 'localhost' : 'localhost'}:4000/api`,
  companyCode: '01',
  period: '2026',
  autoSync: typeof window !== 'undefined' && !isRemoteHost(),
};

const makeIssuerCacheKey = (cfg?: Partial<ServerConfig>): string => {
  const code = (cfg?.companyCode || '01').trim().toUpperCase();
  const dbName = (cfg?.sqlDatabase || 'DEMO').trim().toUpperCase();
  return `plasiyer_issuer_v1::${code}::${dbName}`;
};

const readCachedIssuer = (cfg?: Partial<ServerConfig>): CompanyIssuerInfo | null => {
  try {
    const raw = localStorage.getItem(makeIssuerCacheKey(cfg));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && (parsed.legalName || parsed.brandName)) {
      return parsed as CompanyIssuerInfo;
    }
  } catch {
    // ignore
  }
  return null;
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  // PWA & Android Ana Ekrana Ekleme Yönetimi
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [canInstallPwa, setCanInstallPwa] = useState<boolean>(false);
  const [isPwaInstalled, setIsPwaInstalled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return (
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true
      );
    }
    return false;
  });
  const [isPwaModalOpen, setIsPwaModalOpen] = useState<boolean>(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setCanInstallPwa(true);
    };

    const handleAppInstalled = () => {
      setIsPwaInstalled(true);
      setCanInstallPwa(false);
      setDeferredPrompt(null);
      setIsPwaModalOpen(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const openPwaModal = () => setIsPwaModalOpen(true);
  const closePwaModal = () => setIsPwaModalOpen(false);

  const promptPwaInstall = async (): Promise<boolean> => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice && choice.outcome === 'accepted') {
          setCanInstallPwa(false);
          setDeferredPrompt(null);
          setIsPwaModalOpen(false);
          return true;
        }
      } catch (err) {
        console.error('PWA install prompt error:', err);
      }
    }
    setIsPwaModalOpen(true);
    return false;
  };

  // Tema Yönetimi (Dark / Light)
  const [theme, setTheme] = useState<AppTheme>(() => {
    const saved = localStorage.getItem('b2b_theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  // Kimlik Doğrulama & Oturum Yönetimi (Paket 2)
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => {
    const saved = localStorage.getItem('plasiyer_auth_user');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return null;
      }
    }
    return null;
  });

  const isAuthenticated = !!currentUser;

  // Rol Yönetimi: 'admin' (Yetkili Kurum), 'plasiyer' (Müşteri Firma / Saha Satış) veya 'customer' (B2B Bayi)
  const [userRole, setUserRole] = useState<UserRole>(() => {
    try {
      const savedAuth = localStorage.getItem('plasiyer_auth_user');
      if (savedAuth) {
        const parsed = JSON.parse(savedAuth) as AuthUser;
        if (parsed?.role === 'admin' || parsed?.role === 'customer' || parsed?.role === 'plasiyer') {
          return parsed.role;
        }
      }
    } catch {
      // ignore
    }
    const saved = localStorage.getItem('b2b_user_role') as UserRole;
    if (saved === 'admin' || saved === 'customer') return saved;
    return 'plasiyer';
  });

  // B2B Müşteri Girişi yaptıysa hangi müşteri
  const [currentCustomerUser, setCurrentCustomerUser] = useState<Customer | null>(() => {
    const saved = localStorage.getItem('b2b_current_customer');
    return saved ? JSON.parse(saved) : null;
  });

  const [salesRep, setSalesRep] = useState<SalesRep>(() => {
    const saved = localStorage.getItem('plasiyer_rep');
    return saved ? JSON.parse(saved) : DEFAULT_SALES_REP;
  });

  const [serverConfig, setServerConfig] = useState<ServerConfig>(() => {
    const saved = localStorage.getItem('plasiyer_server_config');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Eski hatalı "http://<sqlHost>:4000/api" kayıtlarını otomatik olarak doğrudan '/api' yapısına geçir
        if (parsed.apiUrl && parsed.apiUrl !== 'demo' && parsed.sqlHost) {
          parsed.apiUrl = '/api';
          localStorage.setItem('plasiyer_server_config', JSON.stringify(parsed));
        }
        return parsed;
      } catch (e) {
        return DEFAULT_SERVER_CONFIG;
      }
    }
    return DEFAULT_SERVER_CONFIG;
  });

  const [liveIssuerInfo, setLiveIssuerInfo] = useState<CompanyIssuerInfo | null>(() =>
    readCachedIssuer(serverConfig)
  );

  const persistIssuerInfo = (cfg: Partial<ServerConfig>, info?: CompanyIssuerInfo | null) => {
    if (!info || (!info.legalName && !info.brandName)) return;
    try {
      localStorage.setItem(makeIssuerCacheKey(cfg), JSON.stringify(info));
    } catch {
      // ignore storage quota errors
    }
    setLiveIssuerInfo(info);
  };

  // Aktif SQL veritabanındaki düzenleyen firma bilgisini (FIRMASABITLERI) otomatik çek ve izole tut
  useEffect(() => {
    const cached = readCachedIssuer(serverConfig);
    setLiveIssuerInfo(cached);

    if (userRole === 'admin' || isDemoMode(serverConfig)) {
      return;
    }

    let cancelled = false;
    apiService
      .fetchCompanyInfo(serverConfig)
      .then((info) => {
        if (cancelled || !info || (!info.legalName && !info.brandName)) return;
        persistIssuerInfo(serverConfig, info);

        const resolvedTitle = (info.brandName || info.legalName || '').trim();
        if (resolvedTitle) {
          setServerConfig((prev) => {
            const prevTitle = (prev.companyTitle || '').trim();
            const isOsmanli =
              (prev.companyCode || '').toUpperCase().includes('OSMANLI') ||
              (prev.sqlDatabase || '').toUpperCase().includes('OSMANLI');
            const shouldUpgradeTitle =
              !prevTitle ||
              prevTitle.toUpperCase() === (prev.companyCode || '').toUpperCase() ||
              prevTitle.toUpperCase() === (prev.sqlDatabase || '').toUpperCase() ||
              (!isOsmanli &&
                (prevTitle.toLocaleUpperCase('tr-TR').includes('OSMANLI GIDA') ||
                  prevTitle.toLocaleUpperCase('tr-TR').includes('AHMET GIDA')));

            if (!shouldUpgradeTitle && prev.issuerInfo?.legalName === info.legalName) {
              return prev;
            }
            const next: ServerConfig = {
              ...prev,
              companyTitle: shouldUpgradeTitle ? resolvedTitle : prev.companyTitle,
              issuerInfo: info,
            };
            localStorage.setItem('plasiyer_server_config', JSON.stringify(next));
            return next;
          });
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [
    serverConfig.companyCode,
    serverConfig.sqlDatabase,
    serverConfig.sqlHost,
    serverConfig.apiUrl,
    userRole,
  ]);

  const companyIssuer = useMemo<CompanyIssuerInfo>(() => {
    if (liveIssuerInfo && (liveIssuerInfo.legalName || liveIssuerInfo.brandName)) {
      return liveIssuerInfo;
    }
    const rawCode = (currentUser?.companyCode || serverConfig.companyCode || '').trim();
    const rawDb = (serverConfig.sqlDatabase || '').trim();
    if (
      serverConfig.issuerInfo &&
      (serverConfig.issuerInfo.legalName || serverConfig.issuerInfo.brandName) &&
      (!rawDb || !serverConfig.issuerInfo.dbName || serverConfig.issuerInfo.dbName.toUpperCase() === rawDb.toUpperCase())
    ) {
      return serverConfig.issuerInfo;
    }
    const isOsmanli =
      rawCode.toUpperCase().includes('OSMANLI') || rawDb.toUpperCase().includes('OSMANLI');
    const rawTitle = (serverConfig.companyTitle || '').trim();
    const isStalePlaceholder =
      !isOsmanli &&
      (rawTitle.toLocaleUpperCase('tr-TR').includes('OSMANLI GIDA') ||
        rawTitle.toLocaleUpperCase('tr-TR').includes('AHMET GIDA'));
    const fallbackName =
      (!isStalePlaceholder && rawTitle) ||
      rawDb ||
      (rawCode && rawCode !== '01' ? rawCode : '') ||
      'MERKEZ FİRMA';

    return {
      legalName: fallbackName,
      brandName: fallbackName,
      dbName: rawDb || undefined,
    };
  }, [liveIssuerInfo, serverConfig, currentUser?.companyCode]);

  // Aktif Cari: Müşteri modundaysa otomatik olarak kendisidir, plasiyer modundaysa seçtiği caridir
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(() => {
    const savedCust = localStorage.getItem('b2b_current_customer');
    const savedRole = localStorage.getItem('b2b_user_role');
    if (savedRole === 'customer' && savedCust) {
      return JSON.parse(savedCust);
    }
    return null;
  });

  const isCompanyManager = useMemo(() => {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;
    if (currentUser.role !== 'plasiyer') return false;
    if (currentUser.accountRole === 'manager') return true;
    if (currentUser.accountRole === 'plasiyer') return false;
    const cCode = (currentUser.companyCode || '').trim().toUpperCase();
    const rCode = (currentUser.salesRepCode || currentUser.code || '').trim().toUpperCase();
    if (cCode && rCode) {
      const matched = plasiyerAuthService
        .getLocalAccounts()
        .find((a) => a.companyCode.toUpperCase() === cCode && a.repCode.toUpperCase() === rCode);
      if (matched?.accountRole === 'manager') return true;
    }
    return false;
  }, [currentUser]);

  const [rawCart, setRawCart] = useState<OrderItem[]>(() => {
    try {
      const saved = localStorage.getItem('plasiyer_cart_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return [];
  });

  useEffect(() => {
    try {
      const compactCart = rawCart.map((item) => ({
        ...item,
        image: item.image && item.image.startsWith('data:') ? undefined : item.image,
      }));
      localStorage.setItem('plasiyer_cart_v1', JSON.stringify(compactCart));
    } catch {
      // ignore
    }
  }, [rawCart]);
  const [activeTab, setActiveTabState] = useState<'customers' | 'catalog' | 'cart' | 'orders' | 'routes' | 'settings' | 'van_stock'>('catalog');
  const [customerSelectReturnTab, setCustomerSelectReturnTab] = useState<'cart' | 'catalog' | null>(null);
  const [isCustomerSelectModalOpen, setIsCustomerSelectModalOpen] = useState<boolean>(false);

  const setActiveTab = (tab: 'customers' | 'catalog' | 'cart' | 'orders' | 'routes' | 'settings' | 'van_stock') => {
    setCustomerSelectReturnTab(null);
    if (tab === 'settings' && userRole === 'plasiyer' && !isCompanyManager) {
      setActiveTabState('catalog');
      return;
    }
    setActiveTabState(tab);
  };

  useEffect(() => {
    if (activeTab === 'settings' && userRole === 'plasiyer' && !isCompanyManager) {
      setActiveTabState('catalog');
    }
  }, [activeTab, userRole, isCompanyManager]);

  const clearCustomerSelectReturnTab = () => setCustomerSelectReturnTab(null);

  const openCustomerSelectModal = () => {
    setIsCustomerSelectModalOpen(false);
    setCustomerSelectReturnTab(activeTab === 'cart' ? 'cart' : 'catalog');
    setActiveTabState('customers');
  };

  const closeCustomerSelectModal = () => setIsCustomerSelectModalOpen(false);
  const [isCampaignsModalOpen, setIsCampaignsModalOpen] = useState<boolean>(false);
  const openCampaignsModal = () => setIsCampaignsModalOpen(true);
  const closeCampaignsModal = () => setIsCampaignsModalOpen(false);

  // Aşama 7: Kampanyalar şimdilik devre dışı bırakıldı (saf sepet hesaplaması)
  const dbProducts = useLiveQuery(() => db.products.toArray(), []) || [];
  const activeCampaigns = useMemo<Campaign[]>(() => [], []);

  const cartEvaluation = useMemo(() => {
    return campaignService.evaluateCart(rawCart, [], dbProducts);
  }, [rawCart, dbProducts]);

  const cart = cartEvaluation.processedCart;
  const cartSummary = cartEvaluation.summary;
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // AŞAMA 8: Sıcak Satış & Araç İçi Stok Yönetimi
  const [saleMode, setSaleModeState] = useState<SaleMode>(() => {
    return (localStorage.getItem('plasiyer_sale_mode') as SaleMode) || 'cold';
  });
  const [vanPlate, setVanPlateState] = useState<string>(() => {
    return localStorage.getItem('plasiyer_van_plate') || '25 AG 123';
  });

  const vanStocks = useLiveQuery(() => db.vanStocks.toArray(), []) || [];
  const vanLoadings = useLiveQuery(() => db.vanLoadings.reverse().toArray(), []) || [];
  const vanAudits = useLiveQuery(() => db.vanAudits.reverse().toArray(), []) || [];

  const setSaleMode = (mode: SaleMode) => {
    setSaleModeState(mode);
    localStorage.setItem('plasiyer_sale_mode', mode);
  };

  const toggleSaleMode = () => {
    const next = saleMode === 'cold' ? 'hot' : 'cold';
    setSaleMode(next);
  };

  const setVanPlate = (plate: string) => {
    setVanPlateState(plate);
    localStorage.setItem('plasiyer_van_plate', plate);
  };

  const loadVanStock = async (items: VanLoadingItem[], notes?: string): Promise<VanLoadingRecord> => {
    const res = await vanStockService.recordVanLoading({
      vanPlate,
      salesRepCode: salesRep.code,
      salesRepName: salesRep.name,
      items,
      notes,
    });
    soundNotification.playOrderChime();
    return res;
  };

  const auditVanStock = async (items: VanAuditItem[], notes?: string): Promise<VanAuditRecord> => {
    const res = await vanStockService.recordVanAudit({
      vanPlate,
      salesRepCode: salesRep.code,
      salesRepName: salesRep.name,
      items,
      notes,
    });
    soundNotification.playOrderChime();
    return res;
  };

  const getVanStockByCode = (productCode: string): number => {
    const item = vanStocks.find((v) => v.productCode === productCode);
    return item ? item.currentStock : 0;
  };

  const login = (user: AuthUser) => {
    setCurrentUser(user);
    localStorage.setItem('plasiyer_auth_user', JSON.stringify(user));
    if (user.role === 'admin') {
      setUserRole('admin');
      localStorage.setItem('b2b_user_role', 'admin');
      setCurrentCustomerUser(null);
      setSelectedCustomer(null);
    } else if (user.role === 'customer') {
      setUserRole('customer');
      localStorage.setItem('b2b_user_role', 'customer');
      if (user.customerCode) {
        db.customers.where('code').equals(user.customerCode).first().then((c) => {
          if (c) {
            setCurrentCustomerUser(c);
            setSelectedCustomer(c);
            localStorage.setItem('b2b_current_customer', JSON.stringify(c));
          }
        });
      }
    } else {
      setUserRole('plasiyer');
      localStorage.setItem('b2b_user_role', 'plasiyer');
      setActiveTab('catalog');
      if (user.salesRepCode) {
        const rep: SalesRep = {
          code: user.salesRepCode,
          name: user.name,
          firstName: user.firstName,
          lastName: user.lastName,
          companyCode: user.companyCode,
          accountRole: user.accountRole === 'manager' ? 'manager' : 'plasiyer',
          title: user.accountRole === 'manager' ? 'Firma Yetkilisi' : 'Saha Satış Temsilcisi',
        };
        setSalesRep(rep);
        localStorage.setItem('plasiyer_rep', JSON.stringify(rep));
      }
    }
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem('plasiyer_auth_user');
    localStorage.removeItem('b2b_user_role');
    setSelectedCustomer(null);
    setRawCart([]);
  };

  // Aktif oturumdaki müşteri firmanın lisans süresi dolmuşsa oturumu anında sonlandır ve ikaz göster
  useEffect(() => {
    if (!currentUser || currentUser.role === 'admin') return;
    const targetCompany = currentUser.companyCode || serverConfig.companyCode;
    if (!targetCompany) return;

    let cancelled = false;
    const verifyActiveLicense = async () => {
      const status = await plasiyerAuthService.checkCompanyLicenseStatus(targetCompany);
      if (cancelled) return;
      if (status.licenseExpireDate && status.licenseExpireDate !== serverConfig.licenseExpireDate) {
        setServerConfig((prev) => {
          const next = { ...prev, licenseExpireDate: status.licenseExpireDate };
          localStorage.setItem('plasiyer_server_config', JSON.stringify(next));
          return next;
        });
      }
      if (status.licenseExpired) {
        try {
          sessionStorage.setItem(LICENSE_EXPIRED_SESSION_KEY, LICENSE_EXPIRED_MESSAGE);
        } catch {
          // ignore
        }
        logout();
      }
    };

    verifyActiveLicense();
    const onFocus = () => {
      verifyActiveLicense();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        verifyActiveLicense();
      }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [currentUser?.id, currentUser?.role, currentUser?.companyCode, serverConfig.companyCode]);

  // HTML class senkronizasyonu
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('b2b_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Rol Değiştirme (Plasiyer vs Müşteri)
  const switchUserRole = (role: UserRole, customer?: Customer | null) => {
    setUserRole(role);
    localStorage.setItem('b2b_user_role', role);

    if (role === 'customer' && customer) {
      setCurrentCustomerUser(customer);
      setSelectedCustomer(customer);
      localStorage.setItem('b2b_current_customer', JSON.stringify(customer));
      setActiveTab('catalog'); // Müşteriyi doğrudan vitrine götür
    } else {
      setCurrentCustomerUser(null);
      localStorage.removeItem('b2b_current_customer');
      // Plasiyer moduna dönünce cariler sekmesine geç
      setActiveTab('customers');
    }
  };

  // Bekleyen sipariş sayısı için Dexie Canlı Sorgu (useLiveQuery)
  const pendingOrders = useLiveQuery(
    () => db.orders.where('status').equals('pending').toArray(),
    []
  );
  const pendingOrdersCount = pendingOrders ? pendingOrders.length : 0;

  // Bekleyen tahsilat sayısı için Dexie Canlı Sorgu
  const pendingCollections = useLiveQuery(
    () => db.collections.where('syncStatus').equals('pending').toArray(),
    []
  );
  const pendingCollectionsCount = pendingCollections ? pendingCollections.length : 0;

  // Bekleyen iade fişi sayısı için Dexie Canlı Sorgu (Aşama 6 - C)
  const pendingReturns = useLiveQuery(
    () => db.returns.where('syncStatus').equals('pending').toArray(),
    []
  );
  const pendingReturnsCount = pendingReturns ? pendingReturns.length : 0;

  // Tahsilat Modalı State
  const [isCollectionModalOpen, setIsCollectionModalOpen] = useState<boolean>(false);
  const [collectionTargetCustomer, setCollectionTargetCustomer] = useState<Customer | null>(null);

  const openCollectionModal = (customer?: Customer | null) => {
    setCollectionTargetCustomer(customer || selectedCustomer || null);
    setIsCollectionModalOpen(true);
  };

  const closeCollectionModal = () => {
    setIsCollectionModalOpen(false);
    setCollectionTargetCustomer(null);
  };

  // İade Modalı State (Aşama 6 - C)
  const [isReturnModalOpen, setIsReturnModalOpen] = useState<boolean>(false);
  const [returnTargetCustomer, setReturnTargetCustomer] = useState<Customer | null>(null);

  const openReturnModal = (customer?: Customer | null) => {
    setReturnTargetCustomer(customer || selectedCustomer || null);
    setIsReturnModalOpen(true);
  };

  const closeReturnModal = () => {
    setIsReturnModalOpen(false);
    setReturnTargetCustomer(null);
  };

  // Günlük Kapanış (Z Raporu) Modalı State (Aşama 6 - A)
  const [isDailyReportModalOpen, setIsDailyReportModalOpen] = useState<boolean>(false);
  const openDailyReportModal = () => setIsDailyReportModalOpen(true);
  const closeDailyReportModal = () => setIsDailyReportModalOpen(false);

  // Çift Yönlü Canlı Otomatik Senkronizasyon (Aşama 6 - B)
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(() => {
    const saved = localStorage.getItem('plasiyer_last_sync_time');
    return saved ? new Date(saved) : null;
  });
  const [autoSyncEnabled, setAutoSyncEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('plasiyer_auto_sync');
    return saved !== 'false';
  });

  const toggleAutoSync = () => {
    setAutoSyncEnabled((prev) => {
      const next = !prev;
      localStorage.setItem('plasiyer_auto_sync', String(next));
      return next;
    });
  };

  // Termal Fiş Modalı State
  const [activePrintSlip, setActivePrintSlip] = useState<PrintSlipParams | null>(null);

  const openPrintSlip = (params: PrintSlipParams) => {
    setActivePrintSlip(params);
  };

  const closePrintSlip = () => {
    setActivePrintSlip(null);
  };

  // Bildirimler State (Aşama 3)
  const [notifications, setNotifications] = useState<AppNotification[]>(() => {
    const saved = localStorage.getItem('app_notifications');
    return saved ? JSON.parse(saved) : [];
  });
  const [activeToastNotification, setActiveToastNotification] = useState<AppNotification | null>(null);

  useEffect(() => {
    localStorage.setItem('app_notifications', JSON.stringify(notifications.slice(0, 50)));
  }, [notifications]);

  const unreadNotificationsCount = notifications.filter((n) => !n.read).length;

  const markNotificationAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const markAllNotificationsAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const dismissToastNotification = () => {
    setActiveToastNotification(null);
  };

  const requestNotificationPermission = async () => {
    return await soundNotification.requestNotificationPermission();
  };

  // SSE Canlı Bildirim Dinleyicisi (Yalnızca yerel sunucuda; Serverless bulut ortamında devre dışı)
  useEffect(() => {
    if (isDemoMode(serverConfig) || isRemoteHost()) return;

    let eventSource: EventSource | null = null;
    try {
      const streamUrl = `${resolveApiBaseUrl(serverConfig)}/notifications/stream`;
      eventSource = new EventSource(streamUrl);

      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'connected') return;

          const notifItem: AppNotification = {
            id: payload.id || 'notif-' + Date.now(),
            type: payload.type || 'new_order',
            title: payload.title || 'Bildirim',
            message: payload.message || '',
            timestamp: payload.timestamp || new Date().toISOString(),
            orderDocNo: payload.orderDocNo,
            orderTempId: payload.orderTempId,
            amount: payload.amount,
            customerName: payload.customerName,
            read: false,
            data: payload,
          };

          // Ses Çal & Bildirim Göster
          if (payload.type === 'new_order') {
            soundNotification.playOrderChime();
          } else if (payload.type === 'new_collection') {
            soundNotification.playPaymentChime();
          } else {
            soundNotification.playOrderChime();
          }

          soundNotification.showBrowserNotification(notifItem.title, {
            body: notifItem.message,
          });

          setActiveToastNotification(notifItem);
          setNotifications((prev) => [notifItem, ...prev.slice(0, 49)]);

          // Otomatik toast kapatma (7 sn)
          setTimeout(() => {
            setActiveToastNotification((current) => (current?.id === notifItem.id ? null : current));
          }, 7000);
        } catch (e) {
          console.error('SSE Message parsing error:', e);
        }
      };

      eventSource.onerror = () => {
        // Tarayıcı otomatik olarak yeniden bağlanacaktır
      };
    } catch (err) {
      console.warn('EventSource initialization warning:', err);
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [serverConfig.apiUrl]);

  // Başlangıç tohum verisi kontrolü
  useEffect(() => {
    seedInitialDataIfNeeded();
  }, []);

  // Online / Offline dinleyicisi & Bekleyen Kuyruğu Otomatik İletme
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (autoSyncEnabled && !isDemoMode(serverConfig)) {
        syncService.pushPendingOrdersToERP(serverConfig);
        syncService.pushPendingCollectionsToERP(serverConfig);
        syncService.pushPendingReturnsToERP(serverConfig);
      }
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [serverConfig, autoSyncEnabled]);

  // Aşama 6 - B: Arka Planda Canlı Çift Yönlü Otomatik Senkronizasyon (60 sn)
  useEffect(() => {
    if (userRole === 'admin' || !autoSyncEnabled || !isOnline || isDemoMode(serverConfig)) {
      return;
    }

    const intervalId = setInterval(async () => {
      if (isSyncing) return;
      try {
        const res = await syncService.fullSync(serverConfig, salesRep.code);
        const now = new Date();
        setLastSyncTime(now);
        localStorage.setItem('plasiyer_last_sync_time', now.toISOString());

        if ((res.syncedOrdersCount || 0) > 0 || (res.syncedCollectionsCount || 0) > 0 || (res.syncedReturnsCount || 0) > 0) {
          soundNotification.playOrderChime();
          setActiveToastNotification({
            id: 'notif-auto-sync-' + Date.now(),
            type: 'system',
            title: '🔄 Otomatik Canlı Eşitleme',
            message: `${res.syncedOrdersCount || 0} sipariş, ${res.syncedCollectionsCount || 0} tahsilat, ${res.syncedReturnsCount || 0} iade ERP12'ye aktarıldı.`,
            timestamp: now.toISOString(),
            read: false,
          });
          setTimeout(() => setActiveToastNotification(null), 5000);
        }
      } catch (err) {
        console.warn('Otomatik senkronizasyon kontrolü:', err);
      }
    }, 60000);

    return () => clearInterval(intervalId);
  }, [autoSyncEnabled, isOnline, isSyncing, serverConfig, salesRep.code]);

  // Sunucu yapılandırmasını kaydet
  const updateServerConfig = (newConfig: Partial<ServerConfig>) => {
    const updated = { ...serverConfig, ...newConfig };
    setServerConfig(updated);
    localStorage.setItem('plasiyer_server_config', JSON.stringify(updated));
    plasiyerAuthService.upsertCompanyProfileFromConfig(updated);

    // Canlı bir SQL / API bağlantısına geçiş yapıldıysa hemen ürün ve carileri SQL'den çek
    if (!isDemoMode(updated)) {
      setTimeout(() => {
        syncService.pullDataFromERP(updated, salesRep.code).then((res) => {
          const now = new Date();
          if (res.companyInfo) {
            persistIssuerInfo(updated, res.companyInfo);
          }
          if (res.success) {
            setLastSyncTime(now);
            localStorage.setItem('plasiyer_last_sync_time', now.toISOString());
            setActiveToastNotification({
              id: 'notif-sync-success-' + Date.now(),
              type: 'system',
              title: '✅ Gerçek SQL Verileri Yüklendi',
              message: `${res.productsCount || 0} adet canlı ürün ve ${res.customersCount || 0} adet cari veritabanından aktarıldı.`,
              timestamp: now.toISOString(),
              read: false,
            });
            setTimeout(() => setActiveToastNotification(null), 6000);
          } else if (res.error) {
            setActiveToastNotification({
              id: 'notif-sync-err-' + Date.now(),
              type: 'system',
              title: '⚠️ SQL Veri Çekme Uyarısı',
              message: res.error,
              timestamp: now.toISOString(),
              read: false,
            });
            setTimeout(() => setActiveToastNotification(null), 7000);
          }
        }).catch((err) => {
          console.warn('Otomatik canlı veri çekme hatası:', err);
        });
      }, 200);
    }
  };

  const selectCustomer = (customer: Customer | null) => {
    setSelectedCustomer(customer);
  };

  // Müşteriye Özel Fiyat Hesaplama Motoru ("Size Özel 800 ₺" Kurgusu)
  const calculateCustomerPrice = (
    product: Product, 
    customCustomer?: Customer | null
  ): CustomerPriceInfo => {
    const targetCustomer = customCustomer !== undefined ? customCustomer : (userRole === 'customer' ? currentCustomerUser : selectedCustomer);
    const standardPrice = product.price1 > 0 ? product.price1 : Math.max(product.price2, product.price3, 1);

    if (!targetCustomer) {
      return {
        standardPrice,
        customerPrice: standardPrice,
        discountPercent: 0,
        hasSpecialPrice: false,
        savingsAmount: 0,
      };
    }

    // Fiyat listesine göre taban fiyat
    let basePrice = standardPrice;
    if (targetCustomer.priceList === 2 && product.price2 > 0) {
      basePrice = product.price2;
    } else if (targetCustomer.priceList === 3 && product.price3 > 0) {
      basePrice = product.price3;
    }

    // Özel iskonto varsa uygula
    const discount = targetCustomer.specialDiscount || 0;
    const finalPrice = basePrice * (1 - discount / 100);

    const hasSpecialPrice = finalPrice < standardPrice;
    const savingsAmount = Math.max(0, standardPrice - finalPrice);
    const totalDiscountPercent = standardPrice > 0 
      ? Math.round(((standardPrice - finalPrice) / standardPrice) * 100)
      : 0;

    return {
      standardPrice,
      customerPrice: finalPrice,
      discountPercent: totalDiscountPercent,
      hasSpecialPrice,
      savingsAmount,
    };
  };

  const addToCart = (product: Product, quantity = 1) => {
    const activeCust = userRole === 'customer' ? currentCustomerUser : selectedCustomer;
    const priceInfo = calculateCustomerPrice(product, activeCust);
    const price = priceInfo.customerPrice;
    const discount = activeCust?.specialDiscount || 0;

    setRawCart((prev) => {
      const existingIndex = prev.findIndex((i) => i.productId === product.id && !i.isGift);
      if (existingIndex > -1) {
        const item = prev[existingIndex];
        const newQty = item.quantity + quantity;
        const netPrice = item.unitPrice * (1 - item.discountPercent / 100);
        const totalAmount = netPrice * newQty;
        const vatAmount = totalAmount * (item.vatRate / 100);

        const updated = [...prev];
        updated[existingIndex] = {
          ...item,
          quantity: newQty,
          netPrice,
          totalAmount,
          vatAmount,
          grandTotal: totalAmount + vatAmount,
          image: product.image || item.image,
          category: product.category || item.category,
          addedAt: item.addedAt || new Date().toISOString(),
          selected: true,
        };
        return updated;
      } else {
        const netPrice = price * (1 - discount / 100);
        const totalAmount = netPrice * quantity;
        const vatAmount = totalAmount * (product.vatRate / 100);

        const newItem: OrderItem = {
          productId: product.id,
          productCode: product.code,
          productName: product.name,
          unit: product.unit,
          quantity,
          unitPrice: price,
          discountPercent: discount,
          vatRate: product.vatRate,
          netPrice,
          totalAmount,
          vatAmount,
          grandTotal: totalAmount + vatAmount,
          originalUnitPrice: product.price1,
          image: product.image,
          category: product.category,
          addedAt: new Date().toISOString(),
          selected: true,
        };
        return [...prev, newItem];
      }
    });
  };

  const updateCartItemQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setRawCart((prev) =>
      prev.map((item) => {
        if (item.productId === productId && !item.isGift) {
          const baseUnitPrice = item.unitPrice;
          const netPrice = baseUnitPrice * (1 - (item.discountPercent || 0) / 100);
          const totalAmount = netPrice * quantity;
          const vatAmount = totalAmount * (item.vatRate / 100);
          return {
            ...item,
            quantity,
            netPrice,
            totalAmount,
            vatAmount,
            grandTotal: totalAmount + vatAmount,
          };
        }
        return item;
      })
    );
  };

  const updateCartItemDiscount = (productId: string, discountPercent: number) => {
    const safeDiscount = Math.max(0, Math.min(100, discountPercent));
    setRawCart((prev) =>
      prev.map((item) => {
        if (item.productId === productId && !item.isGift) {
          const baseUnitPrice = item.unitPrice;
          const netPrice = baseUnitPrice * (1 - safeDiscount / 100);
          const totalAmount = netPrice * item.quantity;
          const vatAmount = totalAmount * (item.vatRate / 100);
          return {
            ...item,
            unitPrice: baseUnitPrice,
            discountPercent: safeDiscount,
            netPrice,
            totalAmount,
            vatAmount,
            grandTotal: totalAmount + vatAmount,
          };
        }
        return item;
      })
    );
  };

  const updateCartItemVatRate = (productId: string, vatRate: number) => {
    const safeVat = Math.max(0, Math.min(100, vatRate));
    setRawCart((prev) =>
      prev.map((item) => {
        if (item.productId === productId && !item.isGift) {
          const vatAmount = item.totalAmount * (safeVat / 100);
          return {
            ...item,
            vatRate: safeVat,
            vatAmount,
            grandTotal: item.totalAmount + vatAmount,
          };
        }
        return item;
      })
    );
  };

  const updateCartItemNetTotal = (productId: string, netTotal: number) => {
    const safeNetTotal = Math.max(0, netTotal);
    setRawCart((prev) =>
      prev.map((item) => {
        if (item.productId === productId && !item.isGift) {
          const qty = item.quantity > 0 ? item.quantity : 1;
          const baseUnitPrice = item.originalUnitPrice || item.unitPrice;
          const baseNetTotal = qty * baseUnitPrice;

          if (baseNetTotal <= 0) {
            const newUnit = safeNetTotal / qty;
            const vatAmount = safeNetTotal * (item.vatRate / 100);
            return {
              ...item,
              unitPrice: newUnit,
              originalUnitPrice: newUnit,
              discountPercent: 0,
              netPrice: newUnit,
              totalAmount: safeNetTotal,
              vatAmount,
              grandTotal: safeNetTotal + vatAmount,
            };
          }

          if (safeNetTotal <= baseNetTotal) {
            const rawDiscount = ((baseNetTotal - safeNetTotal) / baseNetTotal) * 100;
            const discountPercent = Math.round(rawDiscount * 100) / 100;
            const netPrice = safeNetTotal / qty;
            const vatAmount = safeNetTotal * (item.vatRate / 100);
            return {
              ...item,
              unitPrice: baseUnitPrice,
              originalUnitPrice: baseUnitPrice,
              discountPercent,
              netPrice,
              totalAmount: safeNetTotal,
              vatAmount,
              grandTotal: safeNetTotal + vatAmount,
            };
          } else {
            const newUnitPrice = safeNetTotal / qty;
            const vatAmount = safeNetTotal * (item.vatRate / 100);
            return {
              ...item,
              unitPrice: newUnitPrice,
              originalUnitPrice: baseUnitPrice,
              discountPercent: 0,
              netPrice: newUnitPrice,
              totalAmount: safeNetTotal,
              vatAmount,
              grandTotal: safeNetTotal + vatAmount,
            };
          }
        }
        return item;
      })
    );
  };

  const updateCartItemGrandTotal = (productId: string, grandTotal: number) => {
    const safeGrandTotal = Math.max(0, grandTotal);
    setRawCart((prev) =>
      prev.map((item) => {
        if (item.productId === productId && !item.isGift) {
          const baseUnitPrice = item.originalUnitPrice || item.unitPrice;
          const vatMultiplier = 1 + item.vatRate / 100;
          const baseGrandTotal = item.quantity * baseUnitPrice * vatMultiplier;

          if (baseGrandTotal <= 0) {
            const totalAmount = safeGrandTotal / vatMultiplier;
            const vatAmount = safeGrandTotal - totalAmount;
            return {
              ...item,
              unitPrice: safeGrandTotal,
              discountPercent: 0,
              netPrice: safeGrandTotal,
              totalAmount,
              vatAmount,
              grandTotal: safeGrandTotal,
            };
          }

          if (safeGrandTotal <= baseGrandTotal) {
            // İskonto hesapla: % = ((baseGrandTotal - safeGrandTotal) / baseGrandTotal) * 100
            const rawDiscount = ((baseGrandTotal - safeGrandTotal) / baseGrandTotal) * 100;
            const discountPercent = Math.round(rawDiscount * 100) / 100;
            const netPrice = baseUnitPrice * (1 - discountPercent / 100);
            const totalAmount = safeGrandTotal / vatMultiplier;
            const vatAmount = safeGrandTotal - totalAmount;
            return {
              ...item,
              unitPrice: baseUnitPrice,
              originalUnitPrice: baseUnitPrice,
              discountPercent,
              netPrice,
              totalAmount,
              vatAmount,
              grandTotal: safeGrandTotal,
            };
          } else {
            // Liste fiyatından daha yüksek girildiyse (iskonto 0, birim fiyat artırılır)
            const newUnitPrice = safeGrandTotal / (item.quantity * vatMultiplier);
            const totalAmount = safeGrandTotal / vatMultiplier;
            const vatAmount = safeGrandTotal - totalAmount;
            return {
              ...item,
              unitPrice: newUnitPrice,
              originalUnitPrice: baseUnitPrice,
              discountPercent: 0,
              netPrice: newUnitPrice,
              totalAmount,
              vatAmount,
              grandTotal: safeGrandTotal,
            };
          }
        }
        return item;
      })
    );
  };

  const updateCartItemPrice = (productId: string, unitPrice: number) => {
    const safePrice = Math.max(0, unitPrice);
    setRawCart((prev) =>
      prev.map((item) => {
        if (item.productId === productId && !item.isGift) {
          const netPrice = safePrice * (1 - item.discountPercent / 100);
          const totalAmount = netPrice * item.quantity;
          const vatAmount = totalAmount * (item.vatRate / 100);
          return {
            ...item,
            unitPrice: safePrice,
            originalUnitPrice: safePrice,
            netPrice,
            totalAmount,
            vatAmount,
            grandTotal: totalAmount + vatAmount,
          };
        }
        return item;
      })
    );
  };

  const toggleCartItemSelected = (productId: string) => {
    setRawCart((prev) =>
      prev.map((item) => {
        if (item.productId === productId && !item.isGift) {
          const currentSelected = item.selected !== false;
          return {
            ...item,
            selected: !currentSelected,
          };
        }
        return item;
      })
    );
  };

  const setAllCartItemsSelected = (selected: boolean) => {
    setRawCart((prev) =>
      prev.map((item) => (item.isGift ? item : { ...item, selected }))
    );
  };

  const removeFromCart = (productId: string) => {
    setRawCart((prev) => prev.filter((item) => item.productId !== productId && !item.isGift));
  };

  const clearCart = () => {
    setRawCart([]);
  };

  // Siparişi Onayla & IndexedDB'ye Kaydet (Yalnızca işaretli / seçili ürünleri gönderir, işaretsizleri sepette bırakır)
  const submitCurrentOrder = async (deliveryDate?: string, notes?: string) => {
    const activeCust = userRole === 'customer' ? currentCustomerUser : selectedCustomer;

    if (!activeCust) {
      return { success: false, error: 'Lütfen sipariş için bir cari (müşteri) seçiniz.' };
    }
    if (cart.length === 0) {
      return { success: false, error: 'Sepetiniz boş. Lütfen ürün ekleyiniz.' };
    }

    const selectedCartItems = cart.filter((it) => it.selected !== false);
    if (selectedCartItems.length === 0) {
      return {
        success: false,
        error: 'Siparişi onaylamak için lütfen sepetteki ürünlerden en az birini işaretleyiniz.',
      };
    }

    try {
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
      const tempId = 'ORD-' + dateStr + '-' + Math.floor(1000 + Math.random() * 9000);

      // AŞAMA 8: Sıcak Satış Kontrolü ve Araç Stoğu Düşümü (Yalnızca seçili ürünler için)
      if (userRole === 'plasiyer' && saleMode === 'hot') {
        const availability = await vanStockService.checkVanStockAvailability(selectedCartItems);
        if (!availability.isAvailable) {
          const shortageNames = availability.shortages
            .map(s => `${s.productName} (İstenen: ${s.requested}, Araçta: ${s.inVan})`)
            .join(', ');
          return { 
            success: false, 
            error: `Sıcak Satış için araçta yetersiz stok: ${shortageNames}. Lütfen miktarları düzenleyin veya Soğuk Satış moduna geçin.` 
          };
        }

        // Araç stoğundan anlık düşüm yap
        await vanStockService.recordHotSaleDeduction(selectedCartItems, vanPlate);
      }

      const newOrder: Order = {
        tempId,
        customerId: activeCust.id,
        customerCode: activeCust.code,
        customerName: activeCust.name,
        salesRepCode: activeCust.salesRepCode || salesRep.code,
        orderDate: now.toISOString(),
        deliveryDate: deliveryDate || new Date(Date.now() + 86400000).toISOString().slice(0, 10),
        notes: notes || '',
        items: selectedCartItems.map(({ image: _img, ...it }) => ({
          ...it,
          saleType: userRole === 'plasiyer' ? saleMode : 'cold',
        })),
        subtotal: cartSummary.subtotal,
        totalDiscount: cartSummary.totalDiscount,
        totalVat: cartSummary.totalVat,
        grandTotal: cartSummary.grandTotal,
        campaignDiscount: cartSummary.campaignDiscountAmount,
        totalCampaignSavings: cartSummary.totalCampaignSavings,
        appliedCampaigns: cartSummary.appliedCampaigns,
        saleType: userRole === 'plasiyer' ? saleMode : 'cold',
        vanPlate: (userRole === 'plasiyer' && saleMode === 'hot') ? vanPlate : undefined,
        vanWarehouseCode: (userRole === 'plasiyer' && saleMode === 'hot') ? '02 ARAÇ DEPOSU' : undefined,
        status: 'pending',
        createdAt: now.toISOString(),
      };

      // 1. IndexedDB'ye kaydet
      const orderId = await db.orders.add(newOrder);

      // 2. Yalnızca seçili ürünleri sepetten çıkar; işareti kaldırılan ürünler sepette kalmaya devam etsin
      setRawCart((prev) => prev.filter((item) => !item.isGift && item.selected === false));

      // 3. Eğer online isek ve otomatik senkronizasyon açıksa hemen ERP12'ye göndermeyi dene
      if (isOnline && serverConfig.autoSync && !isDemoMode(serverConfig)) {
        syncService.pushPendingOrdersToERP(serverConfig);
      }

      return { success: true, orderId };
    } catch (err: any) {
      return { success: false, error: err.message || 'Sipariş kaydedilirken bir hata oluştu.' };
    }
  };

  // Tahsilat Oluştur (IndexedDB + Anında Cari Bakiye Düşümü + Arka Plan ERP12 Senkronizasyonu)
  const createCollection = async (params: {
    customerId: string;
    customerCode: string;
    customerName: string;
    amount: number;
    paymentMethod: PaymentMethod;
    notes?: string;
    checkBank?: string;
    checkNo?: string;
    checkDueDate?: string;
  }) => {
    try {
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const tempId = `THS-${dateStr}-${randomSuffix}`;
      const receiptNo = `MAK-${dateStr.slice(0, 4)}-${Math.floor(1000 + Math.random() * 9000)}`;

      const newCollection: CollectionRecord = {
        tempId,
        receiptNo,
        customerId: params.customerId,
        customerCode: params.customerCode,
        customerName: params.customerName,
        salesRepCode: salesRep.code,
        salesRepName: salesRep.name,
        amount: params.amount,
        paymentMethod: params.paymentMethod,
        notes: params.notes,
        checkBank: params.checkBank,
        checkNo: params.checkNo,
        checkDueDate: params.checkDueDate,
        createdAt: now.toISOString(),
        syncStatus: 'pending',
      };

      // 1. IndexedDB'ye tahsilat kaydet
      const colId = await db.collections.add(newCollection);
      newCollection.id = colId;

      // 2. Müşteri bakiyesini yerel veritabanında anında güncelle (Alacak / Düşüm)
      const cust = await db.customers.get(params.customerId);
      if (cust) {
        const newBal = (cust.balance || 0) - params.amount;
        await db.customers.update(params.customerId, { balance: newBal });
        if (selectedCustomer && selectedCustomer.id === params.customerId) {
          setSelectedCustomer({ ...selectedCustomer, balance: newBal });
        }
      }

      // 3. Online ise ERP12'ye gönder
      if (isOnline && serverConfig.autoSync && !isDemoMode(serverConfig)) {
        syncService.pushPendingCollectionsToERP(serverConfig);
      }

      return { success: true, collection: newCollection };
    } catch (err: any) {
      return { success: false, error: err.message || 'Tahsilat kaydedilemedi.' };
    }
  };

  // Faturalaştırma & İrsaliye İşlemi (Aşama 3)
  const invoiceOrder = async (order: Order, invoiceNo?: string, notes?: string) => {
    try {
      const docNo = order.erp12DocNo || order.tempId;
      const assignedInvNo = invoiceNo || `FTR-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

      if (serverConfig.apiUrl && serverConfig.apiUrl !== 'demo' && docNo) {
        await apiService.sendInvoiceOrder(serverConfig, docNo, assignedInvNo, notes);
      }

      // Yerel IndexedDB'deki siparişi güncelle
      if (order.id) {
        await db.orders.update(order.id, {
          invoiceStatus: 'invoiced',
          invoiceNo: assignedInvNo,
          invoicedAt: new Date().toISOString(),
        });
      }

      soundNotification.playOrderChime();

      return { success: true, invoiceNo: assignedInvNo };
    } catch (err: any) {
      return { success: false, error: err.message || 'Faturalaştırma işlemi yapılamadı.' };
    }
  };

  // İade Fişi Oluştur (Aşama 6 - C: IndexedDB + Cari Bakiye Azaltımı + Arka Plan ERP12 Senkronizasyonu)
  const createReturn = async (params: {
    customerId: string;
    customerCode: string;
    customerName: string;
    items: ReturnItem[];
    subtotal: number;
    totalVat: number;
    grandTotal: number;
    notes?: string;
  }) => {
    try {
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const tempId = `IAD-${dateStr}-${randomSuffix}`;
      const receiptNo = `İAD-${dateStr.slice(0, 4)}-${Math.floor(1000 + Math.random() * 9000)}`;

      const newReturn: ReturnRecord = {
        tempId,
        receiptNo,
        customerId: params.customerId,
        customerCode: params.customerCode,
        customerName: params.customerName,
        salesRepCode: salesRep.code,
        salesRepName: salesRep.name,
        items: params.items,
        subtotal: params.subtotal,
        totalVat: params.totalVat,
        grandTotal: params.grandTotal,
        notes: params.notes || '',
        createdAt: now.toISOString(),
        syncStatus: 'pending',
      };

      // 1. IndexedDB'ye ekle
      const returnId = await db.returns.add(newReturn);
      newReturn.id = returnId;

      // 1.b. Eğer plasiyer iade alıyorsa araca stok ekle
      if (userRole === 'plasiyer') {
        await vanStockService.recordReturnToVan(params.items, vanPlate);
      }

      // 2. Müşteri cari bakiyesinden iade bedelini düş (Müşterinin borcu azalır / alacağı artar)
      const cust = await db.customers.where('id').equals(params.customerId).first() ||
                   await db.customers.where('code').equals(params.customerCode).first();
      if (cust) {
        const newBalance = (cust.balance || 0) - params.grandTotal;
        await db.customers.update(cust.id, { balance: newBalance });
        if (selectedCustomer && selectedCustomer.id === cust.id) {
          setSelectedCustomer({ ...selectedCustomer, balance: newBalance });
        }
      }

      // 3. Online ve otomatik senkronizasyon açıksa hemen ERP'ye ilet
      if (isOnline && autoSyncEnabled && !isDemoMode(serverConfig)) {
        syncService.pushPendingReturnsToERP(serverConfig);
      }

      soundNotification.playOrderChime();
      return { success: true, returnRecord: newReturn };
    } catch (err: any) {
      return { success: false, error: err.message || 'İade fişi kaydedilemedi.' };
    }
  };

  // Senkronizasyon Tetikle
  const triggerSync = async (overrideConfig?: ServerConfig): Promise<SyncResult> => {
    setIsSyncing(true);
    try {
      const activeCfg = overrideConfig || serverConfig;
      const res = await syncService.fullSync(activeCfg, salesRep.code);
      if (res.companyInfo) {
        persistIssuerInfo(activeCfg, res.companyInfo);
      }
      const now = new Date();
      if (res.success) {
        setLastSyncTime(now);
        localStorage.setItem('plasiyer_last_sync_time', now.toISOString());
      }
      return res;
    } finally {
      setIsSyncing(false);
    }
  };

  // AŞAMA 10: Plasiyer Kotası ve Dinamik Prim
  const [isPerformanceModalOpen, setIsPerformanceModalOpen] = useState(false);
  const [quotaTarget, setQuotaTarget] = useState<PlasiyerQuotaTarget>(() => {
    const saved = localStorage.getItem('plasiyer_quota_target');
    return saved ? JSON.parse(saved) : DEFAULT_QUOTA_TARGET;
  });

  const openPerformanceModal = () => setIsPerformanceModalOpen(true);
  const closePerformanceModal = () => setIsPerformanceModalOpen(false);

  const updateQuotaTarget = (newTarget: Partial<PlasiyerQuotaTarget>) => {
    setQuotaTarget((prev) => {
      const updated = { ...prev, ...newTarget };
      localStorage.setItem('plasiyer_quota_target', JSON.stringify(updated));
      return updated;
    });
  };

  const allOrdersForPerf = useLiveQuery(() => db.orders.toArray(), []) || [];
  const allCollectionsForPerf = useLiveQuery(() => db.collections.toArray(), []) || [];
  const allVisitsForPerf = useLiveQuery(() => db.visits.toArray(), []) || [];

  const performanceSummary = useMemo(() => {
    return calculatePerformanceSummary(allOrdersForPerf, allCollectionsForPerf, allVisitsForPerf, quotaTarget);
  }, [allOrdersForPerf, allCollectionsForPerf, allVisitsForPerf, quotaTarget]);

  return (
    <AppContext.Provider
      value={{
        isOnline,
        theme,
        toggleTheme,
        isAuthenticated,
        currentUser,
        isCompanyManager,
        login,
        logout,
        userRole,
        currentCustomerUser,
        switchUserRole,
        salesRep,
        setSalesRep,
        serverConfig,
        companyIssuer,
        updateServerConfig,
        selectedCustomer,
        selectCustomer,
        isCustomerSelectModalOpen,
        openCustomerSelectModal,
        closeCustomerSelectModal,
        customerSelectReturnTab,
        clearCustomerSelectReturnTab,
        calculateCustomerPrice,
        cart,
        cartSummary,
        addToCart,
        updateCartItemQuantity,
        updateCartItemDiscount,
        updateCartItemVatRate,
        updateCartItemPrice,
        updateCartItemNetTotal,
        updateCartItemGrandTotal,
        toggleCartItemSelected,
        setAllCartItemsSelected,
        removeFromCart,
        clearCart,
        submitCurrentOrder,
        activeTab,
        setActiveTab,
        selectedCategory,
        setSelectedCategory,
        createCollection,
        pendingCollectionsCount,
        isCollectionModalOpen,
        collectionTargetCustomer,
        openCollectionModal,
        closeCollectionModal,
        createReturn,
        pendingReturnsCount,
        isReturnModalOpen,
        returnTargetCustomer,
        openReturnModal,
        closeReturnModal,
        isDailyReportModalOpen,
        openDailyReportModal,
        closeDailyReportModal,
        lastSyncTime,
        autoSyncEnabled,
        toggleAutoSync,
        activePrintSlip,
        openPrintSlip,
        closePrintSlip,
        notifications,
        unreadNotificationsCount,
        activeToastNotification,
        markNotificationAsRead,
        markAllNotificationsAsRead,
        dismissToastNotification,
        requestNotificationPermission,
        invoiceOrder,
        pendingOrdersCount,
        isSyncing,
        triggerSync,
        campaigns: activeCampaigns,
        activeCampaigns,
        isCampaignsModalOpen,
        openCampaignsModal,
        closeCampaignsModal,
        // AŞAMA 8: Sıcak Satış
        saleMode,
        setSaleMode,
        toggleSaleMode,
        vanPlate,
        setVanPlate,
        vanStocks,
        vanLoadings,
        vanAudits,
        loadVanStock,
        auditVanStock,
        getVanStockByCode,
        // AŞAMA 10: Plasiyer Kotası & Prim
        isPerformanceModalOpen,
        openPerformanceModal,
        closePerformanceModal,
        quotaTarget,
        updateQuotaTarget,
        performanceSummary,
        // PWA & Android Ana Ekrana Ekleme
        isPwaInstalled,
        canInstallPwa,
        isPwaModalOpen,
        openPwaModal,
        closePwaModal,
        promptPwaInstall,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
