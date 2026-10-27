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
import { CollectionModal } from './components/CollectionModal';
import { ReturnModal } from './components/ReturnModal';
import { DailyReportModal } from './components/DailyReportModal';
import { CampaignsModal } from './components/CampaignsModal';
import { PerformanceDashboardModal } from './components/PerformanceDashboardModal';
import { ThermalReceiptModal } from './components/ThermalReceiptModal';
import { NotificationToast } from './components/NotificationToast';
import { InstallPwaModal } from './components/InstallPwaModal';
import { DesktopSidebar } from './components/DesktopSidebar';

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
  const { activeTab, userRole } = useApp();

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-24 md:pb-8 transition-colors">
      {/* Müşteri modunda cariler sekmesi yerine doğrudan vitrin açılır */}
      {activeTab === 'routes' && <RoutePlanPage />}
      {activeTab === 'customers' && (userRole === 'customer' ? <CatalogPage /> : <CustomersPage />)}
      {activeTab === 'catalog' && <CatalogPage />}
      {activeTab === 'cart' && <CartPage />}
      {activeTab === 'orders' && <OrdersQueuePage />}
      {activeTab === 'van_stock' && <VanStockPage />}
      {activeTab === 'settings' && <SettingsPage />}
      <GlobalModals />
    </main>
  );
};

const AppContent: React.FC = () => {
  const { isAuthenticated } = useApp();

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-black flex transition-colors w-full">
      {/* Masaüstü Sol Menü (md ve üzeri ekranlarda görünür) */}
      <DesktopSidebar />

      {/* Ana Uygulama & Çalışma Alanı (Mobil için tam ekran, Masaüstü için esnek genişlik) */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen bg-slate-50 dark:bg-slate-950 relative">
        <Header />
        <div className="flex-1 overflow-y-auto">
          <MainContent />
        </div>
        <BottomNav />
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
