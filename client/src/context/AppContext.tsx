import React, { createContext, useContext, useState, useEffect, useRef, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, seedInitialDataIfNeeded } from '../db';
import { syncService, type SyncResult } from '../services/syncService';
import { apiService } from '../services/apiService';
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
  PlasiyerPerformanceSummary
} from '../types';
import { campaignService } from '../services/campaignService';
import { vanStockService } from '../services/vanStockService';
import { DEFAULT_QUOTA_TARGET, calculatePerformanceSummary } from '../services/quotaService';

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
  login: (user: AuthUser) => void;
  logout: () => void;
  userRole: UserRole;
  currentCustomerUser: Customer | null;
  switchUserRole: (role: UserRole, customer?: Customer | null) => void;
  
  // Plasiyer & Sunucu
  salesRep: SalesRep;
  setSalesRep: (rep: SalesRep) => void;
  serverConfig: ServerConfig;
  updateServerConfig: (config: Partial<ServerConfig>) => void;
  selectedCustomer: Customer | null;
  selectCustomer: (customer: Customer | null) => void;
  
  // Fiyat Hesaplama
  calculateCustomerPrice: (product: Product, customCustomer?: Customer | null) => CustomerPriceInfo;
  
  // Cart
  cart: OrderItem[];
  cartSummary: CartSummary;
  addToCart: (product: Product, quantity?: number) => void;
  updateCartItemQuantity: (productId: string, quantity: number) => void;
  updateCartItemDiscount: (productId: string, discountPercent: number) => void;
  updateCartItemPrice: (productId: string, unitPrice: number) => void;
  updateCartItemGrandTotal: (productId: string, grandTotal: number) => void;
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
  triggerSync: () => Promise<SyncResult>;
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
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const DEFAULT_SALES_REP: SalesRep = {
  code: 'PLS01',
  name: 'Ahmet Yılmaz',
  title: 'Marmara Bölge Satış Temsilcisi',
};

const DEFAULT_SERVER_CONFIG: ServerConfig = {
  apiUrl: `http://${window.location.hostname || 'localhost'}:4000/api`,
  companyCode: '01',
  period: '2026',
  autoSync: true,
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

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

  // Rol Yönetimi: 'plasiyer' (Saha Satış) veya 'customer' (B2B Bayi/Müşteri)
  const [userRole, setUserRole] = useState<UserRole>(() => {
    const saved = localStorage.getItem('b2b_user_role') as UserRole;
    return saved === 'customer' ? 'customer' : 'plasiyer';
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
      const parsed = JSON.parse(saved);
      if (parsed.apiUrl === 'demo') {
        parsed.apiUrl = `http://${window.location.hostname || 'localhost'}:4000/api`;
      }
      return parsed;
    }
    return DEFAULT_SERVER_CONFIG;
  });

  // Aktif Cari: Müşteri modundaysa otomatik olarak kendisidir, plasiyer modundaysa seçtiği caridir
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(() => {
    const savedCust = localStorage.getItem('b2b_current_customer');
    const savedRole = localStorage.getItem('b2b_user_role');
    if (savedRole === 'customer' && savedCust) {
      return JSON.parse(savedCust);
    }
    return null;
  });

  const [rawCart, setRawCart] = useState<OrderItem[]>([]);
  const [isCampaignsModalOpen, setIsCampaignsModalOpen] = useState<boolean>(false);
  const openCampaignsModal = () => setIsCampaignsModalOpen(true);
  const closeCampaignsModal = () => setIsCampaignsModalOpen(false);

  // Aşama 7: Kampanyalar ve Ürünler
  const dbCampaigns = useLiveQuery(() => db.campaigns.toArray(), []) || [];
  const dbProducts = useLiveQuery(() => db.products.toArray(), []) || [];

  const activeCampaigns = useMemo(() => {
    return dbCampaigns.filter((c) => c.isActive);
  }, [dbCampaigns]);

  // Akıllı Kampanya & Promosyon Değerlendirme Motoru
  const cartEvaluation = useMemo(() => {
    return campaignService.evaluateCart(rawCart, dbCampaigns, dbProducts);
  }, [rawCart, dbCampaigns, dbProducts]);

  const cart = cartEvaluation.processedCart;
  const cartSummary = cartEvaluation.summary;

  const prevCampaignCountRef = useRef(0);
  useEffect(() => {
    const curCount = cartEvaluation.appliedCampaigns.length;
    if (curCount > prevCampaignCountRef.current && curCount > 0) {
      const latest = cartEvaluation.appliedCampaigns[cartEvaluation.appliedCampaigns.length - 1];
      soundNotification.playOrderChime();
      setActiveToastNotification({
        id: 'notif-camp-' + Date.now(),
        type: 'system',
        title: `${latest.badge} Kampanya Kazanıldı!`,
        message: `${latest.campaignTitle}: ${latest.benefitDescription}`,
        timestamp: new Date().toISOString(),
        read: false,
      });
      setTimeout(() => setActiveToastNotification(null), 6000);
    }
    prevCampaignCountRef.current = curCount;
  }, [cartEvaluation.appliedCampaigns]);

  const [activeTab, setActiveTab] = useState<'customers' | 'catalog' | 'cart' | 'orders' | 'routes' | 'settings' | 'van_stock'>('catalog');
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
    if (user.role === 'customer') {
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
      if (user.salesRepCode) {
        const rep = { code: user.salesRepCode, name: user.name, title: 'Saha Satış Temsilcisi' };
        setSalesRep(rep);
        localStorage.setItem('plasiyer_rep', JSON.stringify(rep));
      }
    }
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem('plasiyer_auth_user');
    setSelectedCustomer(null);
    setRawCart([]);
  };

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

  // SSE Canlı Bildirim Dinleyicisi
  useEffect(() => {
    if (!serverConfig.apiUrl || serverConfig.apiUrl === 'demo') return;

    let eventSource: EventSource | null = null;
    try {
      const streamUrl = `${serverConfig.apiUrl}/notifications/stream`;
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
      if (autoSyncEnabled) {
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
    if (!autoSyncEnabled || !isOnline || !serverConfig.apiUrl || serverConfig.apiUrl === 'demo') {
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
          const baseUnitPrice = item.originalUnitPrice || item.unitPrice;
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
          const baseUnitPrice = item.originalUnitPrice || item.unitPrice;
          const netPrice = baseUnitPrice * (1 - safeDiscount / 100);
          const totalAmount = netPrice * item.quantity;
          const vatAmount = totalAmount * (item.vatRate / 100);
          return {
            ...item,
            unitPrice: baseUnitPrice,
            originalUnitPrice: baseUnitPrice,
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

  const removeFromCart = (productId: string) => {
    setRawCart((prev) => prev.filter((item) => item.productId !== productId && !item.isGift));
  };

  const clearCart = () => {
    setRawCart([]);
  };

  // Siparişi Onayla & IndexedDB'ye Kaydet
  const submitCurrentOrder = async (deliveryDate?: string, notes?: string) => {
    const activeCust = userRole === 'customer' ? currentCustomerUser : selectedCustomer;

    if (!activeCust) {
      return { success: false, error: 'Lütfen sipariş için bir cari (müşteri) seçiniz.' };
    }
    if (cart.length === 0) {
      return { success: false, error: 'Sepetiniz boş. Lütfen ürün ekleyiniz.' };
    }

    try {
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
      const tempId = 'ORD-' + dateStr + '-' + Math.floor(1000 + Math.random() * 9000);

      // AŞAMA 8: Sıcak Satış Kontrolü ve Araç Stoğu Düşümü
      if (userRole === 'plasiyer' && saleMode === 'hot') {
        const availability = await vanStockService.checkVanStockAvailability(cart);
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
        await vanStockService.recordHotSaleDeduction(cart, vanPlate);
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
        items: cart.map(it => ({ ...it, saleType: (userRole === 'plasiyer' ? saleMode : 'cold') })),
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

      // 2. Sepeti temizle
      clearCart();

      // 3. Eğer online isek ve otomatik senkronizasyon açıksa hemen ERP12'ye göndermeyi dene
      if (isOnline && serverConfig.autoSync) {
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
      if (isOnline && serverConfig.autoSync) {
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
      if (isOnline && autoSyncEnabled) {
        syncService.pushPendingReturnsToERP(serverConfig);
      }

      soundNotification.playOrderChime();
      return { success: true, returnRecord: newReturn };
    } catch (err: any) {
      return { success: false, error: err.message || 'İade fişi kaydedilemedi.' };
    }
  };

  // Senkronizasyon Tetikle
  const triggerSync = async (): Promise<SyncResult> => {
    setIsSyncing(true);
    try {
      const res = await syncService.fullSync(serverConfig, salesRep.code);
      const now = new Date();
      setLastSyncTime(now);
      localStorage.setItem('plasiyer_last_sync_time', now.toISOString());
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
        login,
        logout,
        userRole,
        currentCustomerUser,
        switchUserRole,
        salesRep,
        setSalesRep,
        serverConfig,
        updateServerConfig,
        selectedCustomer,
        selectCustomer,
        calculateCustomerPrice,
        cart,
        cartSummary,
        addToCart,
        updateCartItemQuantity,
        updateCartItemDiscount,
        updateCartItemPrice,
        updateCartItemGrandTotal,
        removeFromCart,
        clearCart,
        submitCurrentOrder,
        activeTab,
        setActiveTab,
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
        campaigns: dbCampaigns,
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
