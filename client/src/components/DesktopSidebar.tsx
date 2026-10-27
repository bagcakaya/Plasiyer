import React from 'react';
import { useApp } from '../context/AppContext';
import { 
  Navigation, 
  Users, 
  Package, 
  ShoppingCart, 
  Clock, 
  Settings, 
  Store, 
  Truck, 
  UserCheck,
  RefreshCw,
  LogOut,
  Moon,
  Sun,
  Gift,
  TrendingUp,
  Trophy,
  CheckCircle2,
  Building2,
  UserX
} from 'lucide-react';

export const DesktopSidebar: React.FC = () => {
  const { 
    activeTab, 
    setActiveTab, 
    cartSummary, 
    pendingOrdersCount,
    pendingCollectionsCount,
    pendingReturnsCount,
    userRole, 
    salesRep,
    selectedCustomer,
    selectCustomer,
    serverConfig,
    isOnline,
    theme,
    toggleTheme,
    logout,
    openCampaignsModal,
    activeCampaigns,
    openDailyReportModal,
    openPerformanceModal,
    performanceSummary,
    saleMode,
    vanPlate,
    triggerSync,
    isSyncing,
    lastSyncTime
  } = useApp();

  const totalPending = pendingOrdersCount + pendingCollectionsCount + pendingReturnsCount;

  // Plasiyer Menü Öğeleri
  const plasiyerNavItems = [
    {
      id: 'routes' as const,
      label: 'Günlük Rut Planı',
      icon: Navigation,
      desc: 'Harita ve ziyaret rotası',
    },
    {
      id: 'customers' as const,
      label: 'Cari Hesaplar',
      icon: Users,
      desc: 'Müşteri listesi & bakiye',
    },
    {
      id: 'catalog' as const,
      label: 'Ürün Kataloğu',
      icon: Package,
      desc: 'Fiyat & anlık stok listesi',
    },
    {
      id: 'van_stock' as const,
      label: saleMode === 'hot' ? `Araç Stoğu (${vanPlate})` : 'Araç Stoğu & Yükleme',
      icon: Truck,
      desc: saleMode === 'hot' ? 'Sıcak satış araç stoğu' : 'Araç depo mevcudu',
      badge: saleMode === 'hot' ? '🔥 Sıcak' : undefined,
      badgeColor: 'bg-amber-500 text-slate-950 font-bold',
    },
    {
      id: 'cart' as const,
      label: 'Sipariş Sepeti',
      icon: ShoppingCart,
      desc: cartSummary.totalItems > 0 ? `${cartSummary.totalItems} kalem ürün eklendi` : 'Sepetiniz boş',
      badge: cartSummary.totalItems > 0 ? cartSummary.totalItems : undefined,
      badgeColor: 'bg-blue-600 text-white font-bold',
    },
    {
      id: 'orders' as const,
      label: 'Sipariş & Tahsilat',
      icon: Clock,
      desc: 'Geçmiş fişler ve kuyruk',
      badge: totalPending > 0 ? totalPending : undefined,
      badgeColor: 'bg-rose-600 text-white font-bold',
    },
    {
      id: 'settings' as const,
      label: 'Sistem Ayarları',
      icon: Settings,
      desc: 'SQL bağlantısı & yapılandırma',
    },
  ];

  // B2B Müşteri Menü Öğeleri
  const customerNavItems = [
    {
      id: 'catalog' as const,
      label: 'Ürün Vitrini',
      icon: Store,
      desc: 'Sipariş verilebilir ürünler',
    },
    {
      id: 'cart' as const,
      label: 'Sepetim',
      icon: ShoppingCart,
      desc: cartSummary.totalItems > 0 ? `${cartSummary.totalItems} kalem ürün` : 'Sepetiniz boş',
      badge: cartSummary.totalItems > 0 ? cartSummary.totalItems : undefined,
      badgeColor: 'bg-emerald-600 text-white font-bold',
    },
    {
      id: 'orders' as const,
      label: 'Siparişlerim',
      icon: Clock,
      desc: 'Verdiğiniz siparişler',
    },
    {
      id: 'settings' as const,
      label: 'Hesap & Firma Bilgileri',
      icon: UserCheck,
      desc: 'Ekstre ve cari bilgileri',
    },
  ];

  const navItems = userRole === 'customer' ? customerNavItems : plasiyerNavItems;

  return (
    <aside className="hidden md:flex flex-col w-64 lg:w-72 bg-slate-900 border-r border-slate-800 shrink-0 h-screen sticky top-0 text-white select-none z-30">
      {/* 1. Üst Logo & Firma Başlığı */}
      <div className="p-4 border-b border-slate-800 bg-slate-950/60">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center font-black text-lg text-white shadow-lg shadow-blue-500/20">
              P
            </div>
            <div>
              <div className="text-[11px] font-black uppercase tracking-wider text-blue-400">
                POLATLAR YAZILIM
              </div>
              <h1 className="font-extrabold text-sm tracking-tight text-white leading-none">
                ERP12 Saha Satış
              </h1>
            </div>
          </div>

          {/* Online Durum Rozeti */}
          <div 
            className={`w-3 h-3 rounded-full ${isOnline ? 'bg-emerald-500 ring-4 ring-emerald-500/20' : 'bg-rose-500 ring-4 ring-rose-500/20'}`}
            title={isOnline ? 'İnternet Bağlantısı Aktif' : 'Çevrimdışı Mod'}
          />
        </div>

        {/* Firma ve Kullanıcı Bilgisi */}
        <div className="flex items-center justify-between text-[11px] text-slate-400 bg-slate-850/80 px-2.5 py-1.5 rounded-xl border border-slate-800/80">
          <div className="flex items-center gap-1.5 truncate">
            <Building2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span className="font-semibold text-slate-300 truncate">
              {serverConfig.companyCode} - {serverConfig.period}
            </span>
          </div>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-bold shrink-0">
            {userRole === 'customer' ? 'B2B Bayi' : 'Plasiyer'}
          </span>
        </div>
      </div>

      {/* 2. Aktif Seçili Cari (Varsa) */}
      {selectedCustomer && (
        <div className="mx-3 mt-3 p-3 bg-gradient-to-br from-blue-950/80 to-indigo-950/80 border border-blue-800/60 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between text-[10px] font-bold text-blue-300 mb-1">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-blue-400" />
              Aktif Sipariş Carisi
            </span>
            <button
              onClick={() => selectCustomer(null)}
              className="text-slate-400 hover:text-rose-400 transition"
              title="Cariyi Kaldır"
            >
              <UserX className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="font-bold text-xs text-white truncate" title={selectedCustomer.name}>
            {selectedCustomer.name}
          </div>
          <div className="flex items-center justify-between mt-1 text-[11px]">
            <span className="text-slate-400">Bakiye:</span>
            <span className={`font-bold ${selectedCustomer.balance > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
              ₺{selectedCustomer.balance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
            </span>
          </div>
          {selectedCustomer.specialDiscount > 0 && (
            <div className="mt-1 inline-flex items-center px-1.5 py-0.5 rounded bg-purple-500/30 text-purple-200 text-[10px] font-bold">
              %{selectedCustomer.specialDiscount} Özel İskonto
            </div>
          )}
        </div>
      )}

      {/* 3. Ana Menü Linkleri */}
      <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto no-scrollbar">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl font-bold text-xs transition group text-left ${
                isActive
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                  : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={`p-2 rounded-xl transition ${
                  isActive ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400 group-hover:text-blue-400'
                }`}>
                  <Icon className="w-4 h-4 shrink-0" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-xs font-bold leading-tight">
                    {item.label}
                  </div>
                  <div className={`text-[10px] font-normal truncate mt-0.5 ${
                    isActive ? 'text-blue-100' : 'text-slate-500 group-hover:text-slate-400'
                  }`}>
                    {item.desc}
                  </div>
                </div>
              </div>

              {item.badge !== undefined && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ml-1 ${item.badgeColor || 'bg-blue-600 text-white'}`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}

        {/* Hızlı Araçlar Bölümü (Sadece Plasiyer Modunda) */}
        {userRole === 'plasiyer' && (
          <div className="pt-3 mt-2 border-t border-slate-800/80 space-y-1">
            <div className="px-3 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">
              Hızlı İşlemler
            </div>

            {/* Kampanyalar */}
            <button
              onClick={openCampaignsModal}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-purple-300 hover:bg-purple-950/40 transition text-left"
            >
              <span className="flex items-center gap-2">
                <Gift className="w-4 h-4 text-purple-400" />
                <span>Kampanyalar</span>
              </span>
              {activeCampaigns.length > 0 && (
                <span className="bg-purple-600 text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                  {activeCampaigns.length}
                </span>
              )}
            </button>

            {/* Z Raporu */}
            <button
              onClick={openDailyReportModal}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-amber-400 hover:bg-amber-950/30 transition text-left"
            >
              <TrendingUp className="w-4 h-4 text-amber-400" />
              <span>Gün Sonu (Z Raporu)</span>
            </button>

            {/* Kota ve Prim */}
            <button
              onClick={openPerformanceModal}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-yellow-300 hover:bg-yellow-950/30 transition text-left"
            >
              <span className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-yellow-400" />
                <span>Kota & Prim</span>
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-yellow-500/20 text-yellow-300 font-bold">
                %{performanceSummary.revenueProgressPercent}
              </span>
            </button>
          </div>
        )}
      </nav>

      {/* 4. Alt Senkronizasyon & Kullanıcı Alanı */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/70 space-y-2">
        {/* Şimdi Eşitle Butonu */}
        <button
          onClick={() => triggerSync()}
          disabled={isSyncing}
          className={`w-full py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition active:scale-95 shadow-sm ${
            isSyncing 
              ? 'bg-blue-900/60 text-blue-300 cursor-not-allowed' 
              : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/20'
          }`}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
          <span>{isSyncing ? 'Veriler Eşitleniyor...' : 'Şimdi Eşitle'}</span>
          {lastSyncTime && (
            <span className="text-[10px] opacity-75 font-normal ml-auto">
              {lastSyncTime.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </button>

        {/* Profil Bilgisi ve Çıkış */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs text-blue-400 shrink-0">
              {salesRep.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-white truncate">
                {salesRep.name}
              </div>
              <div className="text-[10px] text-slate-400 font-mono">
                {salesRep.code}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title={theme === 'dark' ? 'Aydınlık Mod' : 'Karanlık Mod'}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              onClick={logout}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
              title="Çıkış Yap"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};
