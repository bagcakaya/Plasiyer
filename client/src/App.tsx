import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { LoginPage } from './pages/LoginPage';
import { CustomersPage } from './pages/CustomersPage';
import { CatalogPage } from './pages/CatalogPage';
import { CartPage } from './pages/CartPage';
import { OrdersQueuePage } from './pages/OrdersQueuePage';
import { RoutePlanPage } from './pages/RoutePlanPage';
import { SettingsPage } from './pages/SettingsPage';
import { VanStockPage } from './pages/VanStockPage';
import { AdminPortalPage } from './pages/AdminPortalPage';
import { CollectionModal } from './components/CollectionModal';
import { ReturnModal } from './components/ReturnModal';
import { DailyReportModal } from './components/DailyReportModal';
import { CampaignsModal } from './components/CampaignsModal';
import { PerformanceDashboardModal } from './components/PerformanceDashboardModal';
import { ThermalReceiptModal } from './components/ThermalReceiptModal';
import { NotificationToast } from './components/NotificationToast';
import { InstallPwaModal } from './components/InstallPwaModal';
import { DesktopSidebar } from './components/DesktopSidebar';
import { CustomerSelectModal } from './components/CustomerSelectModal';

const GlobalModals: React.FC = () => {
  const {
    isCollectionModalOpen,
    closeCollectionModal,
    collectionTargetCustomer,
    activePrintSlip,
    closePrintSlip,
    openPrintSlip,
    isPerformanceModalOpen,
    closePerformanceModal,
  } = useApp();

  return (
    <>
      <CollectionModal
        isOpen={isCollectionModalOpen}
        onClose={closeCollectionModal}
        targetCustomer={collectionTargetCustomer}
        onSuccess={(col, printDirectly) => {
          if (printDirectly) {
            openPrintSlip({
              type: 'collection',
              collectionData: col,
              customerPreviousBalance: collectionTargetCustomer ? collectionTargetCustomer.balance + col.amount : col.amount,
            });
          }
        }}
      />

      <ReturnModal />

      <DailyReportModal />

      <CampaignsModal />

      <CustomerSelectModal />

      <PerformanceDashboardModal
        isOpen={isPerformanceModalOpen}
        onClose={closePerformanceModal}
      />

      {activePrintSlip && (
        <ThermalReceiptModal
          isOpen={true}
          onClose={closePrintSlip}
          slipType={activePrintSlip.type}
          orderData={activePrintSlip.orderData}
          collectionData={activePrintSlip.collectionData}
          returnData={activePrintSlip.returnData}
          endOfDayData={activePrintSlip.endOfDayData}
          vanLoadingData={activePrintSlip.vanLoadingData}
          vanAuditData={activePrintSlip.vanAuditData}
          customerPreviousBalance={activePrintSlip.customerPreviousBalance}
        />
      )}

      {/* Canlı Sipariş & Tahsilat Bildirimi */}
      <NotificationToast />

      {/* Android PWA Kurulum Modalı */}
      <InstallPwaModal />
    </>
  );
};

const MainContent: React.FC = () => {
  const { activeTab, userRole, isCompanyManager } = useApp();
  const isReelsCustomersView = activeTab === 'customers' && userRole !== 'customer';

  return (
    <main className={`bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors ${
      isReelsCustomersView
        ? 'flex-1 min-h-0 h-full flex flex-col pb-0 overflow-hidden'
        : 'min-h-screen pb-36 sm:pb-40 md:pb-12'
    }`}>
      {/* Müşteri modunda cariler sekmesi yerine doğrudan vitrin açılır */}
      {activeTab === 'routes' && <RoutePlanPage />}
      {activeTab === 'customers' && (userRole === 'customer' ? <CatalogPage /> : <CustomersPage />)}
      {activeTab === 'catalog' && <CatalogPage />}
      {activeTab === 'cart' && <CartPage />}
      {activeTab === 'orders' && <OrdersQueuePage />}
      {activeTab === 'van_stock' && <VanStockPage />}
      {activeTab === 'settings' && (userRole !== 'plasiyer' || isCompanyManager ? <SettingsPage /> : <CatalogPage />)}
    </main>
  );
};

const AppContent: React.FC = () => {
  const { isAuthenticated, activeTab, userRole } = useApp();
  const isReelsCustomersView = activeTab === 'customers' && userRole !== 'customer';

  React.useEffect(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [activeTab]);

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  // Yetkili Kurum (POLATLAR / admin) Bağımsız Yönetim Konsolu
  if (userRole === 'admin') {
    return (
      <>
        <AdminPortalPage />
        <NotificationToast />
        <InstallPwaModal />
      </>
    );
  }

  return (
    <div className={`${isReelsCustomersView ? 'h-[100dvh] max-h-[100dvh] overflow-hidden' : 'min-h-screen'} bg-slate-100 dark:bg-black flex transition-colors w-full`}>
      {/* Masaüstü Sol Menü (md ve üzeri ekranlarda görünür) */}
      <DesktopSidebar />

      {/* Ana Uygulama & Çalışma Alanı (Mobil için tam ekran, Masaüstü için esnek genişlik) */}
      <div
        className={`flex-1 flex flex-col min-w-0 bg-slate-50 dark:bg-slate-950 safe-top md:pt-0 ${
          isReelsCustomersView
            ? 'fixed inset-0 md:static md:h-[100dvh] overflow-hidden pb-[calc(4rem+env(safe-area-inset-bottom,0px))] md:pb-0'
            : 'min-h-screen relative'
        }`}
      >
        <Header />
        <div className={`flex-1 ${isReelsCustomersView ? 'min-h-0 overflow-hidden flex flex-col' : ''}`}>
          <MainContent />
        </div>
        <BottomNav />
        <GlobalModals />
      </div>
    </div>
  );
};

export function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;
