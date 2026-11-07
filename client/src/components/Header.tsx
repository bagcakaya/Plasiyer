import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  UserCheck, 
  Banknote,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  LogOut,
  Sun,
  Moon,
  Building2
} from 'lucide-react';
import { CompanyProfileModal } from './CompanyProfileModal';

export const Header: React.FC = () => {
  const { 
    userRole,
    isCompanyManager,
    currentUser,
    salesRep,
    theme,
    toggleTheme,
    logout,
    selectedCustomer, 
    selectCustomer,
    openCollectionModal,
    openReturnModal,
    serverConfig,
    companyIssuer,
    updateServerConfig,
    triggerSync,
  } = useApp();

  const [syncToast, setSyncToast] = useState<{ show: boolean; message: string; success: boolean } | null>(null);
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);

  return (
    <>
      {/* Plasiyerde Ayarlar sekmesi gizli olduğundan mobilde kompakt kullanıcı & çıkış barı */}
      {userRole === 'plasiyer' && !isCompanyManager && (
        <div className="md:hidden flex items-center justify-between gap-2 px-3 py-1.5 bg-slate-900 text-slate-200 border-b border-slate-800 text-[11px] shrink-0">
          <div className="flex items-center gap-1.5 min-w-0 truncate">
            <Building2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span className="font-bold text-white truncate">
              {companyIssuer.brandName || serverConfig.companyTitle || serverConfig.companyCode}
            </span>
            <span className="text-slate-500 shrink-0">&bull;</span>
            <span className="font-mono text-sky-300 font-semibold shrink-0">
              {currentUser?.code || salesRep.code}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={toggleTheme}
              className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              title="Tema Değiştir"
            >
              {theme === 'dark' ? (
                <Sun className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <Moon className="w-3.5 h-3.5 text-sky-300" />
              )}
            </button>
            <button
              type="button"
              onClick={logout}
              className="px-2 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 font-bold flex items-center gap-1 transition active:scale-95"
              title="Oturumu Kapat"
            >
              <LogOut className="w-3 h-3" />
              <span>Çıkış</span>
            </button>
          </div>
        </div>
      )}
      {/* Plasiyer Modunda Aktif Cari Bilgisi Barı (Yalnızca bir cari seçildiğinde üstte ince bar olarak görünür) */}
      {selectedCustomer && (
        <header className="sticky top-0 z-40 bg-blue-600 text-white px-3 py-2 text-xs flex items-center justify-between shadow-md">
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
              className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold px-2.5 py-1 rounded-lg text-[11px] flex items-center gap-1 shadow-xs transition active:scale-95"
              title="Bu Cariden Hızlı Tahsilat Yap"
            >
              <Banknote className="w-3 h-3" />
              <span>Tahsilat</span>
            </button>
            <button
              type="button"
              onClick={() => openReturnModal(selectedCustomer)}
              className="bg-rose-500 hover:bg-rose-400 text-white font-bold px-2.5 py-1 rounded-lg text-[11px] flex items-center gap-1 shadow-xs transition active:scale-95"
              title="Bu Cariden İade / Değişim Al"
            >
              <RotateCcw className="w-3 h-3" />
              <span>İade</span>
            </button>
            <button
              onClick={() => selectCustomer(null)}
              className="text-[11px] underline opacity-90 hover:opacity-100 text-blue-100 font-semibold ml-1"
            >
              Kapat
            </button>
          </div>
        </header>
      )}

      {/* Bildirim Toast */}
      {syncToast && (
        <div className="fixed top-4 left-4 right-4 z-50 flex items-center gap-2 p-3 rounded-xl shadow-lg text-xs font-medium text-white transition-all transform animate-in fade-in slide-in-from-top-2 bg-slate-900 border border-slate-700">
          {syncToast.success ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span className="flex-1">{syncToast.message}</span>
        </div>
      )}

      {/* Çoklu Firma & Statik IP Modalı */}
      <CompanyProfileModal
        isOpen={isCompanyModalOpen}
        onClose={() => setIsCompanyModalOpen(false)}
        currentConfig={serverConfig}
        onSelectProfile={async (profile) => {
          updateServerConfig({
            apiUrl: profile.serverUrl,
            companyCode: profile.code,
            period: profile.period,
            companyTitle: profile.companyTitle,
            sqlHost: profile.sqlHost,
            sqlPort: profile.sqlPort,
            sqlDatabase: profile.sqlDatabase,
            sqlUser: profile.sqlUser,
            sqlPassword: profile.sqlPassword,
            licenseExpireDate: profile.licenseExpireDate,
          });
          setSyncToast({
            show: true,
            success: true,
            message: `Firma profili "${profile.name}" aktif edildi. Canlı veriler eşitleniyor...`,
          });
          if (profile.serverUrl && profile.serverUrl !== 'demo') {
            await triggerSync();
          }
          setTimeout(() => setSyncToast(null), 3500);
        }}
      />
    </>
  );
};
