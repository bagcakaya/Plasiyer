import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  Building2, 
  CheckCircle2, 
  AlertCircle,
  Sun,
  Moon,
  UserCheck,
  Store,
  Users,
  Repeat,
  Banknote,
  Bell,
  LogOut,
  RotateCcw,
  TrendingUp,
  Gift,
  Truck,
  Flame,
  Trophy
} from 'lucide-react';
import { RoleSwitcherModal } from './RoleSwitcherModal';
import { CompanyProfileModal } from './CompanyProfileModal';

export const Header: React.FC = () => {
  const { 
    isOnline, 
    theme,
    toggleTheme,
    userRole,
    currentCustomerUser,
    salesRep, 
    serverConfig, 
    updateServerConfig,
    selectedCustomer, 
    selectCustomer, 
    pendingOrdersCount,
    pendingCollectionsCount,
    pendingReturnsCount,
    isSyncing,
    triggerSync,
    logout,
    openCollectionModal,
    openReturnModal,
    openDailyReportModal,
    lastSyncTime,
    autoSyncEnabled,
    toggleAutoSync,
    notifications,
    unreadNotificationsCount,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    requestNotificationPermission,
    setActiveTab,
    openCampaignsModal,
    activeCampaigns,
    saleMode,
    vanPlate,
    openPerformanceModal,
    performanceSummary
  } = useApp();

  const [syncToast, setSyncToast] = useState<{ show: boolean; message: string; success: boolean } | null>(null);
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);

  const handleSyncClick = async () => {
    if (isSyncing) return;
    const res = await triggerSync();
    if (res.success) {
      setSyncToast({
        show: true,
        message: `Senkronizasyon tamamlandı (${res.syncedOrdersCount ?? 0} sipariş iletildi).`,
        success: true,
      });
    } else {
      setSyncToast({
        show: true,
        message: res.error || 'Senkronizasyon sırasında hata oluştu.',
        success: false,
      });
    }
    setTimeout(() => setSyncToast(null), 3500);
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 2,
    }).format(val);
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-slate-900 dark:bg-slate-950 text-white shadow-md border-b border-slate-800 dark:border-slate-800/80 transition-colors w-full max-w-full overflow-x-hidden">
        {/* Üst İnce Bilgi & Durum Satırı (iOS Çentik / Saat Alanı Uyumlu) */}
        <div className="flex items-center justify-between px-3 pt-[max(env(safe-area-inset-top),0.35rem)] pb-1 text-xs bg-slate-950/80 border-b border-slate-800/80 w-full max-w-full overflow-x-hidden">
          <div 
            onClick={() => setIsCompanyModalOpen(true)}
            className="flex items-center gap-1.5 cursor-pointer hover:bg-slate-800/80 px-2 py-0.5 rounded-lg transition"
            title="Firma / Statik IP Sunucu Profilini Değiştir"
          >
            <span className="flex items-center gap-1 font-semibold text-blue-300">
              <Building2 className="w-3.5 h-3.5 text-blue-400" />
              Firma: {serverConfig.companyCode}
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-300">Dönem: {serverConfig.period}</span>
            <span className="text-[10px] text-blue-400 underline ml-0.5 hidden sm:inline">Değiştir</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Canlı Bildirim Zil Butonu */}
            <button
              onClick={() => {
                setIsNotificationsOpen((prev) => !prev);
                requestNotificationPermission();
              }}
              className="relative p-1 rounded-full text-slate-300 hover:text-white hover:bg-slate-800 transition"
              title="Canlı Bildirimler"
            >
              <Bell className="w-3.5 h-3.5 text-slate-300 hover:text-amber-400 transition-colors" />
              {unreadNotificationsCount > 0 && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-rose-500 text-white rounded-full text-[9px] font-black flex items-center justify-center animate-bounce">
                  {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
                </span>
              )}
            </button>

            {/* Tema Değiştirici Buton (Dark / Light) */}
            <button
              onClick={toggleTheme}
              className="p-1 rounded-full text-slate-300 hover:text-white hover:bg-slate-800 transition"
              title={theme === 'dark' ? 'Aydınlık Moda Geç' : 'Karanlık Moda Geç'}
            >
              {theme === 'dark' ? (
                <Sun className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <Moon className="w-3.5 h-3.5 text-slate-300" />
              )}
            </button>

            {/* Çıkış Yap / Giriş Ekranına Dön */}
            <button
              onClick={logout}
              className="p-1 rounded-full text-slate-300 hover:text-rose-400 hover:bg-slate-800 transition"
              title="Oturumu Kapat (Giriş Ekranına Dön)"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>

            {/* Online / Offline Rozeti */}
            <span
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold ${
                isOnline
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              }`}
            >
              {isOnline ? (
                <>
                  <Wifi className="w-3 h-3 text-emerald-400" />
                  <span className="text-[10px]">Çevrimiçi</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3 text-amber-400 animate-pulse" />
                  <span className="text-[10px]">Çevrimdışı</span>
                </>
              )}
            </span>

            {/* Otomatik Senkronizasyon & Canlı Eşitleme Rozeti */}
            <div 
              onClick={toggleAutoSync}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold cursor-pointer transition select-none ${
                autoSyncEnabled 
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30' 
                  : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'
              }`}
              title={autoSyncEnabled ? "Canlı Otomatik Senkronizasyon Açık (Kapatmak için tıkla)" : "Otomatik Senkronizasyon Kapalı (Açmak için tıkla)"}
            >
              <RefreshCw className={`w-2.5 h-2.5 ${isSyncing ? 'animate-spin text-blue-400' : ''}`} />
              <span className="text-[10px]">
                {lastSyncTime 
                  ? `${lastSyncTime.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}` 
                  : 'Canlı'}
              </span>
            </div>

            {/* Bekleyen işlem (sipariş + tahsilat + iade) rozeti */}
            {(pendingOrdersCount + pendingCollectionsCount + pendingReturnsCount) > 0 && (
              <span 
                className="bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold animate-bounce" 
                title={`${pendingOrdersCount} sipariş, ${pendingCollectionsCount} tahsilat, ${pendingReturnsCount} iade bekliyor`}
              >
                {pendingOrdersCount + pendingCollectionsCount + pendingReturnsCount}
              </span>
            )}
          </div>
        </div>

        {/* Ana Başlık ve Rol Durumu */}
        <div className="flex items-center justify-between px-3.5 py-2.5">
          <div className="flex items-center gap-2.5 truncate">
            {/* Rol İkonu */}
            <div
              onClick={() => setIsRoleModalOpen(true)}
              className={`w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer transition active:scale-90 ${
                userRole === 'customer'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
              }`}
              title="Giriş / Rol Değiştir"
            >
              {userRole === 'customer' ? <Store className="w-5 h-5" /> : <Users className="w-5 h-5" />}
            </div>

            <div className="truncate">
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-sm tracking-tight text-white">
                  {userRole === 'customer' ? 'B2B Bayi Portalı' : 'ERP12 Saha Satış'}
                </span>
                <span
                  className={`text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                    userRole === 'customer'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                  }`}
                >
                  {userRole === 'customer' ? 'Müşteri' : 'Plasiyer'}
                </span>
              </div>

              <div className="text-xs text-slate-400 truncate flex items-center gap-1 mt-0.5">
                <span className="truncate">
                  {userRole === 'customer'
                    ? (currentCustomerUser?.name || 'Müşteri Girişi')
                    : `${salesRep.name} (${salesRep.code})`}
                </span>
                <button
                  onClick={() => setIsRoleModalOpen(true)}
                  className="text-blue-400 hover:text-blue-300 text-[11px] underline ml-1 flex items-center gap-0.5 shrink-0"
                >
                  <Repeat className="w-2.5 h-2.5" /> Değiştir
                </button>
              </div>
            </div>
          </div>

          {/* Müşteri Modu Bakiye & Kampanya Butonu veya Plasiyer Hızlı Senkronizasyon */}
          {userRole === 'customer' ? (
            <div className="shrink-0 flex items-center gap-2">
              <button
                onClick={openCampaignsModal}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-purple-950/70 hover:bg-purple-900 text-purple-200 border border-purple-800/60 shadow-xs transition active:scale-95"
                title="Aktif Kampanyaları İncele"
              >
                <Gift className="w-3.5 h-3.5 text-purple-400" />
                <span className="hidden sm:inline">Kampanyalar</span>
                {activeCampaigns.length > 0 && (
                  <span className="bg-purple-600 text-white text-[9px] px-1.5 py-0.2 rounded-full font-black">
                    {activeCampaigns.length}
                  </span>
                )}
              </button>

              {currentCustomerUser && (
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 block">Bakiyeniz</span>
                  <span
                    className={`text-xs font-bold ${
                      currentCustomerUser.balance > 0 ? 'text-rose-400' : 'text-emerald-400'
                    }`}
                  >
                    {formatCurrency(currentCustomerUser.balance)}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="shrink-0 flex items-center gap-1.5">
              {/* Senkronize Et Butonu (Kompakt Üst Alan) */}
              <button
                onClick={handleSyncClick}
                disabled={isSyncing}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition active:scale-95 shadow-sm ${
                  isSyncing
                    ? 'bg-blue-600/50 text-blue-200 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-500 text-white'
                }`}
                title={lastSyncTime ? `Son Senkronizasyon: ${lastSyncTime.toLocaleTimeString('tr-TR')}` : 'ERP12 ile Senkronize Et'}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'Eşitleniyor...' : 'Senkronize Et'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Plasiyer Hızlı Aksiyon & Mod Şeridi (Taşmayı Önleyen Yatay Bar) */}
        {userRole === 'plasiyer' && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-950/80 border-t border-slate-800/80 overflow-x-auto no-scrollbar w-full max-w-full">
            {/* 1. Kampanyalar */}
            <button
              onClick={openCampaignsModal}
              className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-purple-950/70 hover:bg-purple-900 text-purple-200 border border-purple-800/60 shadow-xs transition active:scale-95 whitespace-nowrap shrink-0"
              title="Aktif Saha Kampanyalarını İncele"
            >
              <Gift className="w-3.5 h-3.5 text-purple-400" />
              <span>Kampanya</span>
              {activeCampaigns.length > 0 && (
                <span className="bg-purple-600 text-white text-[9px] px-1.5 py-0.2 rounded-full font-black">
                  {activeCampaigns.length}
                </span>
              )}
            </button>

            {/* 2. Sıcak Satış / Araç Stoğu */}
            <button
              onClick={() => setActiveTab('van_stock')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold shadow-xs transition active:scale-95 whitespace-nowrap shrink-0 ${
                saleMode === 'hot'
                  ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/30 ring-1 ring-amber-300'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
              }`}
              title={`Satış Modu: ${saleMode === 'hot' ? 'Sıcak Satış (Araçtan Anında Teslim)' : 'Soğuk Satış'} - Araç: ${vanPlate}`}
            >
              {saleMode === 'hot' ? (
                <Flame className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
              ) : (
                <Truck className="w-3.5 h-3.5 text-blue-300" />
              )}
              <span>{saleMode === 'hot' ? `Sıcak (${vanPlate})` : 'Araç Stoğu'}</span>
            </button>

            {/* 3. Gün Sonu Z Raporu */}
            <button
              onClick={openDailyReportModal}
              className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 shadow-xs transition active:scale-95 whitespace-nowrap shrink-0"
              title="Gün Sonu Kapanış (Z Raporu)"
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Z Raporu</span>
            </button>

            {/* 4. Kota & Prim Paneli (Aşama 10) */}
            <button
              onClick={openPerformanceModal}
              className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-500/20 to-yellow-500/20 hover:from-amber-500/30 hover:to-yellow-500/30 text-amber-300 border border-amber-500/30 shadow-xs transition active:scale-95 whitespace-nowrap shrink-0"
              title={`Aylık Ciro Gerçekleşme: %${performanceSummary.revenueProgressPercent} - ${performanceSummary.activeTier.badge}`}
            >
              <Trophy className="w-3.5 h-3.5 text-yellow-400" />
              <span>Kota & Prim</span>
              <span className="bg-amber-500/30 text-yellow-300 text-[10px] px-1.5 py-0.2 rounded-full font-black">
                %{performanceSummary.revenueProgressPercent}
              </span>
            </button>
          </div>
        )}

        {/* Plasiyer Modunda Aktif Cari Bilgisi Barı */}
        {userRole === 'plasiyer' && (
          selectedCustomer ? (
            <div className="bg-blue-600 text-white px-3 py-2 text-xs flex items-center justify-between shadow-inner">
              <div className="flex items-center gap-2 truncate pr-2">
                <UserCheck className="w-4 h-4 shrink-0 text-blue-200" />
                <div className="truncate">
                  <span className="font-bold">{selectedCustomer.name}</span>
                  <span className="opacity-80 text-[11px] ml-1.5">
                    ({selectedCustomer.code} - L{selectedCustomer.priceList})
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                <button
                  type="button"
                  onClick={() => openCollectionModal(selectedCustomer)}
                  className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold px-2 py-0.5 rounded text-[11px] flex items-center gap-1 shadow-xs transition active:scale-95"
                  title="Bu Cariden Hızlı Tahsilat Yap"
                >
                  <Banknote className="w-3 h-3" />
                  <span>Tahsilat</span>
                </button>
                <button
                  type="button"
                  onClick={() => openReturnModal(selectedCustomer)}
                  className="bg-rose-500 hover:bg-rose-400 text-white font-bold px-2 py-0.5 rounded text-[11px] flex items-center gap-1 shadow-xs transition active:scale-95"
                  title="Bu Cariden İade / Değişim Al"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>İade</span>
                </button>
                <button
                  onClick={() => selectCustomer(null)}
                  className="text-[11px] underline opacity-80 hover:opacity-100 text-blue-100"
                >
                  Değiştir
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-amber-600/90 text-amber-50 px-3 py-1.5 text-xs flex items-center justify-between">
              <span className="font-medium">Henüz sipariş için cari seçilmedi</span>
              <span className="text-[11px] opacity-90">Cariler sekmesinden seçiniz</span>
            </div>
          )
        )}
      </header>

      {/* Rol ve Giriş Değiştirme Modalı */}
      <RoleSwitcherModal
        isOpen={isRoleModalOpen}
        onClose={() => setIsRoleModalOpen(false)}
      />

      {/* Canlı Bildirimler Açılır Paneli */}
      {isNotificationsOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-3 pt-14 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden text-slate-900 dark:text-white">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-850">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-amber-500" />
                <h3 className="font-bold text-sm">Canlı Bildirimler</h3>
                {unreadNotificationsCount > 0 && (
                  <span className="bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                    {unreadNotificationsCount} yeni
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {unreadNotificationsCount > 0 && (
                  <button
                    onClick={() => markAllNotificationsAsRead()}
                    className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline font-semibold"
                  >
                    Tümünü Oku
                  </button>
                )}
                <button
                  onClick={() => setIsNotificationsOpen(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 p-1">
              {notifications.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  Henüz yeni bir bildirim bulunmuyor.
                </div>
              ) : (
                notifications.slice(0, 15).map((notif) => (
                  <div
                    key={notif.id}
                    onClick={() => {
                      markNotificationAsRead(notif.id);
                      setIsNotificationsOpen(false);
                      setActiveTab('orders');
                    }}
                    className={`p-3 rounded-2xl cursor-pointer transition text-xs flex gap-2.5 items-start ${
                      notif.read
                        ? 'opacity-70 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                        : 'bg-blue-50/60 dark:bg-blue-950/30 hover:bg-blue-50 dark:hover:bg-blue-950/50'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0" style={{ visibility: notif.read ? 'hidden' : 'visible' }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-slate-900 dark:text-white truncate">{notif.title}</span>
                        <span className="text-[10px] text-slate-400 shrink-0">
                          {new Date(notif.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-300 text-[11px] mt-0.5 line-clamp-2">
                        {notif.message}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-2.5 bg-slate-50 dark:bg-slate-850 border-t border-slate-100 dark:border-slate-800 text-center">
              <button
                type="button"
                onClick={() => {
                  setIsNotificationsOpen(false);
                  setActiveTab('orders');
                }}
                className="w-full py-1.5 text-xs text-blue-600 dark:text-blue-400 font-bold hover:underline"
              >
                Sipariş Havuzuna Git
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bildirim Toast */}
      {syncToast && (
        <div className="fixed top-16 left-4 right-4 z-50 flex items-center gap-2 p-3 rounded-lg shadow-lg text-xs font-medium text-white transition-all transform animate-in fade-in slide-in-from-top-2 bg-slate-900 border border-slate-700">
          {syncToast.success ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span className="flex-1">{syncToast.message}</span>
        </div>
      )}

      {/* Çoklu Firma & Statik IP Modalı (Paket 4) */}
      <CompanyProfileModal
        isOpen={isCompanyModalOpen}
        onClose={() => setIsCompanyModalOpen(false)}
        currentConfig={serverConfig}
        onSelectProfile={(profile) => {
          updateServerConfig({
            apiUrl: profile.serverUrl,
            companyCode: profile.code,
            period: profile.period,
          });
          setSyncToast({
            show: true,
            success: true,
            message: `Firma profili "${profile.name}" olarak değiştirildi.`,
          });
          setTimeout(() => setSyncToast(null), 3000);
        }}
      />
    </>
  );
};
