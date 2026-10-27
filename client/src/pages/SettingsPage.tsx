import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { db, initialCustomers, initialProducts } from '../db';
import { apiService } from '../services/apiService';
import { 
  Server, 
  User, 
  Database, 
  CheckCircle, 
  AlertCircle, 
  RotateCcw, 
  Wifi, 
  RefreshCw, 
  Trash2,
  Store,
  LogOut,
  Sun,
  Moon,
  FileText,
  Building2,
  Smartphone,
  Download,
  Network,
  Zap,
  Key,
  Save
} from 'lucide-react';
import type { ServerConfig } from '../types';
import { CustomerStatementModal } from '../components/CustomerStatementModal';
import { CompanyProfileModal } from '../components/CompanyProfileModal';

export const SettingsPage: React.FC = () => {
  const { 
    userRole,
    currentCustomerUser,
    theme,
    toggleTheme,
    serverConfig, 
    updateServerConfig, 
    salesRep, 
    setSalesRep, 
    triggerSync, 
    isSyncing,
    logout,
    isPwaInstalled,
    promptPwaInstall
  } = useApp();

  const [isStatementModalOpen, setIsStatementModalOpen] = useState(false);
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);

  const [apiUrl, setApiUrl] = useState(serverConfig.apiUrl);
  const [companyCode, setCompanyCode] = useState(serverConfig.companyCode || '01');
  const [period, setPeriod] = useState(serverConfig.period || '2026');
  const [autoSync, setAutoSync] = useState(serverConfig.autoSync);

  // Görsel-1 Doğrudan SQL Server Bağlantı Parametreleri
  const [companyTitle, setCompanyTitle] = useState(serverConfig.companyTitle || 'Ahmet Gıda San. ve Tic. Ltd. Şti.');
  const [sqlHost, setSqlHost] = useState(serverConfig.sqlHost || 'localhost');
  const [sqlPort, setSqlPort] = useState(serverConfig.sqlPort || '1433');
  const [sqlDatabase, setSqlDatabase] = useState(serverConfig.sqlDatabase || 'OSMANLIGIDA');
  const [sqlUser, setSqlUser] = useState(serverConfig.sqlUser || '');
  const [sqlPassword, setSqlPassword] = useState(serverConfig.sqlPassword || '');
  const [licenseExpireDate, setLicenseExpireDate] = useState(serverConfig.licenseExpireDate || '2027-12-31');
  const [bridgePort, setBridgePort] = useState(serverConfig.bridgePort || '4000');
  const [showAdvancedBridge, setShowAdvancedBridge] = useState(false);

  const [repCode, setRepCode] = useState(salesRep.code);
  const [repName, setRepName] = useState(salesRep.name);

  const [testResult, setTestResult] = useState<{ testing: boolean; success?: boolean; message?: string }>({
    testing: false,
  });

  const [saveSuccess, setSaveSuccess] = useState(false);

  // ServerConfig harici değişiklikleri (profil seçimi vb.) forma yansıt
  React.useEffect(() => {
    setApiUrl(serverConfig.apiUrl);
    setCompanyCode(serverConfig.companyCode || '01');
    setPeriod(serverConfig.period || '2026');
    setAutoSync(serverConfig.autoSync);
    if (serverConfig.companyTitle) setCompanyTitle(serverConfig.companyTitle);
    if (serverConfig.sqlHost) setSqlHost(serverConfig.sqlHost);
    if (serverConfig.sqlPort) setSqlPort(serverConfig.sqlPort);
    if (serverConfig.sqlDatabase) setSqlDatabase(serverConfig.sqlDatabase);
    if (serverConfig.sqlUser !== undefined) setSqlUser(serverConfig.sqlUser);
    if (serverConfig.sqlPassword !== undefined) setSqlPassword(serverConfig.sqlPassword);
    if (serverConfig.licenseExpireDate) setLicenseExpireDate(serverConfig.licenseExpireDate);
    if (serverConfig.bridgePort) setBridgePort(serverConfig.bridgePort);
  }, [serverConfig]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 2,
    }).format(val);
  };

  const handleSaveConfig = () => {
    const isLive = apiUrl && apiUrl !== 'demo';
    let targetApiUrl = apiUrl;
    if (isLive) {
      if (sqlHost && !sqlHost.startsWith('http://') && !sqlHost.startsWith('https://')) {
        targetApiUrl = `http://${sqlHost.trim()}:${bridgePort.trim() || '4000'}/api`;
      } else if (sqlHost) {
        targetApiUrl = sqlHost.trim();
      }
    }

    updateServerConfig({
      apiUrl: targetApiUrl.trim(),
      companyCode: companyCode.trim() || '01',
      period: period.trim() || '2026',
      autoSync,
      companyTitle: companyTitle.trim(),
      sqlHost: sqlHost.trim(),
      sqlPort: sqlPort.trim(),
      sqlDatabase: sqlDatabase.trim(),
      sqlUser: sqlUser.trim(),
      sqlPassword: sqlPassword,
      licenseExpireDate: licenseExpireDate.trim(),
      bridgePort: bridgePort.trim(),
    });
    setSalesRep({
      ...salesRep,
      code: repCode.trim(),
      name: repName.trim(),
    });
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
    if (isLive) {
      triggerSync();
    }
  };

  // Demo / Çevrimdışı test
  const handleTestConnection = async () => {
    setTestResult({ testing: true });
    if (!apiUrl || apiUrl === 'demo') {
      setTimeout(() => {
        setTestResult({
          testing: false,
          success: true,
          message: 'Demo / Çevrimdışı Mod Aktif: Tüm sipariş, iskonto ve tahsilat işlemleri yerel veritabanında (IndexedDB) tam fonksiyonel çalışmaktadır.',
        });
      }, 400);
      return;
    }

    const res = await apiService.testConnection({
      apiUrl: apiUrl.trim(),
      companyCode,
      period,
      autoSync,
    });

    setTestResult({
      testing: false,
      success: res.success,
      message: res.message,
    });
  };

  // Doğrudan SQL Server Bağlantısını Canlı Test Et (Görsel-1)
  const handleTestSqlConnection = async () => {
    setTestResult({ testing: true });
    
    const configToTest: ServerConfig = {
      apiUrl: (sqlHost && !sqlHost.startsWith('http://') && !sqlHost.startsWith('https://'))
        ? `http://${sqlHost.trim()}:${bridgePort.trim() || '4000'}/api`
        : (apiUrl || 'http://localhost:4000/api'),
      companyCode: companyCode.trim() || '01',
      period: period.trim() || '2026',
      autoSync,
      companyTitle: companyTitle.trim(),
      sqlHost: sqlHost.trim(),
      sqlPort: sqlPort.trim(),
      sqlDatabase: sqlDatabase.trim(),
      sqlUser: sqlUser.trim(),
      sqlPassword: sqlPassword,
      licenseExpireDate: licenseExpireDate.trim(),
      bridgePort: bridgePort.trim(),
    };

    const res = await apiService.testSqlConnection(configToTest);
    setTestResult({
      testing: false,
      success: res.success,
      message: res.message,
    });
  };

  const handleResetDemoData = async () => {
    if (window.confirm('Tüm müşteri ve ürünler demo ayarlarına döndürülecektir. Onaylıyor musunuz?')) {
      await db.customers.clear();
      await db.products.clear();
      await db.customers.bulkAdd(initialCustomers);
      await db.products.bulkAdd(initialProducts);
      alert('Demo verileri başarıyla yüklendi!');
    }
  };

  const handleClearOrders = async () => {
    if (window.confirm('Cihazdaki tüm sipariş kayıtları silinecektir! Bu işlem geri alınamaz. Onaylıyor musunuz?')) {
      await db.orders.clear();
      alert('Sipariş havuzu temizlendi.');
    }
  };

  // Müşteri / Bayi Görünümü
  if (userRole === 'customer' && currentCustomerUser) {
    return (
      <div className="p-3 md:p-6 pb-24 space-y-4 max-w-5xl mx-auto text-xs text-slate-900 dark:text-slate-100 w-full">
        {/* Bayi Kimlik Kartı */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
            <div className="flex items-center gap-2">
              <Store className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">Bayi Hesap Bilgileri</h3>
                <span className="text-[11px] text-slate-400 font-mono">{currentCustomerUser.code}</span>
              </div>
            </div>
            <span className="bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 font-bold px-2 py-0.5 rounded-full text-[10px]">
              Aktif Bayi
            </span>
          </div>

          <h2 className="text-base font-extrabold text-slate-900 dark:text-white leading-snug">
            {currentCustomerUser.name}
          </h2>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <div className="bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-[10px] text-slate-400 block">Güncel Bakiyeniz</span>
              <span className={`text-sm font-bold ${
                currentCustomerUser.balance > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
              }`}>
                {formatCurrency(currentCustomerUser.balance)}
              </span>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-[10px] text-slate-400 block">Tanımlı Fiyat Anlaşması</span>
              <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                Liste {currentCustomerUser.priceList}
                {currentCustomerUser.specialDiscount > 0 && ` (+%${currentCustomerUser.specialDiscount})`}
              </span>
            </div>
          </div>

          <div className="space-y-1.5 pt-2 text-slate-600 dark:text-slate-300 border-t border-slate-100 dark:border-slate-800">
            {currentCustomerUser.address && (
              <div className="flex justify-between py-0.5">
                <span className="text-slate-400">Adres:</span>
                <span className="font-medium text-right text-slate-800 dark:text-slate-200 max-w-[200px] truncate">{currentCustomerUser.address}</span>
              </div>
            )}
            {currentCustomerUser.phone && (
              <div className="flex justify-between py-0.5">
                <span className="text-slate-400">Telefon:</span>
                <span className="font-semibold text-blue-600 dark:text-blue-400">{currentCustomerUser.phone}</span>
              </div>
            )}
            {currentCustomerUser.taxOffice && (
              <div className="flex justify-between py-0.5">
                <span className="text-slate-400">Vergi Dairesi:</span>
                <span className="font-medium text-slate-800 dark:text-slate-200">{currentCustomerUser.taxOffice}</span>
              </div>
            )}
          </div>
        </div>

        {/* Canlı Cari Hesap Ekstresi Butonu */}
        <button
          onClick={() => setIsStatementModalOpen(true)}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-2xl shadow-sm transition flex items-center justify-center gap-2 text-xs"
        >
          <FileText className="w-4 h-4" />
          <span>Canlı Cari Hesap Ekstresini Görüntüle</span>
        </button>

        {/* Görünüm / Tema Ayarı */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {theme === 'dark' ? <Moon className="w-5 h-5 text-indigo-400" /> : <Sun className="w-5 h-5 text-amber-500" />}
            <div>
              <span className="font-bold text-sm block">Görünüm Teması</span>
              <span className="text-[11px] text-slate-400">{theme === 'dark' ? 'Karanlık Mod Aktif' : 'Aydınlık Mod Aktif'}</span>
            </div>
          </div>
          <button
            onClick={toggleTheme}
            className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-white font-bold px-3 py-1.5 rounded-xl transition"
          >
            {theme === 'dark' ? 'Aydınlık Yap' : 'Karanlık Yap'}
          </button>
        </div>

        {/* Plasiyer Moduna Dön / Çıkış Butonu */}
        <button
          onClick={() => logout()}
          className="w-full bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-700 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 font-bold py-3 rounded-2xl border border-slate-200 dark:border-slate-700 transition flex items-center justify-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          <span>Oturumu Kapat (Giriş Ekranına Dön)</span>
        </button>

        {/* Ekstre Modalı */}
        {isStatementModalOpen && (
          <CustomerStatementModal
            customer={currentCustomerUser}
            serverConfig={serverConfig}
            isOpen={isStatementModalOpen}
            onClose={() => setIsStatementModalOpen(false)}
          />
        )}
      </div>
    );
  }

  // Plasiyer Görünümü
  return (
    <div className="p-3 md:p-6 pb-24 space-y-4 max-w-5xl mx-auto text-xs text-slate-900 dark:text-slate-100 w-full">
      {/* Başarı Bildirimi */}
      {saveSuccess && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 rounded-2xl flex items-center gap-2 font-medium">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Ayarlar başarıyla kaydedildi.</span>
        </div>
      )}

      {/* Görünüm / Tema Ayarı */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {theme === 'dark' ? <Moon className="w-5 h-5 text-indigo-400" /> : <Sun className="w-5 h-5 text-amber-500" />}
          <div>
            <span className="font-bold text-sm block">Görünüm Teması</span>
            <span className="text-[11px] text-slate-400">{theme === 'dark' ? 'Karanlık Mod Aktif' : 'Aydınlık Mod Aktif'}</span>
          </div>
        </div>
        <button
          onClick={toggleTheme}
          className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-white font-bold px-3 py-1.5 rounded-xl transition"
        >
          {theme === 'dark' ? 'Aydınlık Yap' : 'Karanlık Yap'}
        </button>
      </div>

      {/* Android Mobil Kurulum (PWA) Kartı */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3 transition">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">Android Mobil Kurulum (PWA)</h3>
          </div>
          {isPwaInstalled ? (
            <span className="text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded-full flex items-center gap-1">
              <CheckCircle className="w-3 h-3" />
              <span>Yüklendi (Tam Ekran)</span>
            </span>
          ) : (
            <span className="text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-full">
              Tarayıcı Modu
            </span>
          )}
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          {isPwaInstalled
            ? 'Uygulama başarıyla Android cihazınıza yüklendi. Cihazınızın ana ekranından bağımsız bir uygulama olarak tam ekran çalıştırılmaktadır.'
            : 'Uygulamayı Android ana ekranınıza ekleyerek Google Chrome adres çubuğu olmadan tam ekran mobil uygulama deneyimi ve çevrimdışı kullanım sağlayabilirsiniz.'}
        </p>

        {!isPwaInstalled && (
          <button
            onClick={() => promptPwaInstall()}
            className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 transition active:scale-95"
          >
            <Download className="w-4 h-4" />
            <span>Android Ana Ekrana Ekle & Kurulum Rehberi</span>
          </button>
        )}
      </div>

      {/* Çoklu Firma & Statik IP Profilleri Seçici Butonu */}
      <div 
        onClick={() => setIsCompanyModalOpen(true)}
        className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-blue-500/40 bg-blue-50/20 dark:bg-blue-950/20 shadow-xs flex items-center justify-between cursor-pointer hover:border-blue-500 transition"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 flex items-center justify-center font-bold">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <span className="font-bold text-sm text-slate-900 dark:text-white block">Firma & Statik IP Profilleri</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Şirket: <strong>{serverConfig.companyCode}</strong> • Dönem: <strong>{serverConfig.period}</strong>
            </span>
          </div>
        </div>
        <span className="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/60 px-2.5 py-1 rounded-xl">
          Değiştir
        </span>
      </div>

      {/* Sunucu & Statik IP Ayarları */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3 transition">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">ERP12 Sunucu Entegrasyonu</h3>
          </div>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
            !apiUrl || apiUrl === 'demo'
              ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
              : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
          }`}>
            {!apiUrl || apiUrl === 'demo' ? '🟢 Çevrimdışı / Demo' : '🔵 Canlı ERP12'}
          </span>
        </div>

        {/* Mod Hızlı Seçim Butonları */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={() => setApiUrl('demo')}
            className={`py-2 px-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 border ${
              !apiUrl || apiUrl === 'demo'
                ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 ring-2 ring-amber-400/20'
                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100'
            }`}
          >
            <span>🟢 Çevrimdışı / Demo</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (!apiUrl || apiUrl === 'demo') {
                setApiUrl('http://');
              }
            }}
            className={`py-2 px-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 border ${
              apiUrl && apiUrl !== 'demo'
                ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-700 text-blue-900 dark:text-blue-200 ring-2 ring-blue-400/20'
                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100'
            }`}
          >
            <span>🌐 Canlı Statik IP</span>
          </button>
        </div>

        {/* Mod Bilgi Kartı */}
        <div className={`p-2.5 rounded-xl text-[11px] leading-relaxed border ${
          !apiUrl || apiUrl === 'demo'
            ? 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40 text-amber-900 dark:text-amber-200'
            : 'bg-blue-50/60 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/40 text-blue-900 dark:text-blue-200'
        }`}>
          {!apiUrl || apiUrl === 'demo' ? (
            <span>
              <strong>Çevrimdışı / Demo Modu:</strong> ERP sunucusuna ihtiyaç duymadan sipariş oluşturma, iskonto hesaplama, tahsilat ve araç stok işlemlerini cihazınızın yerel hafızasında anlık olarak yürütebilirsiniz. Senkronize Et butonu demo akışını başarıyla tamamlar.
            </span>
          ) : (
            <span>
              <strong>Canlı ERP12 & Doğrudan SQL Modu:</strong> Girilen Statik IP / Host üzerinden doğrudan ERP12 SQL Server veritabanına çift yönlü sipariş, tahsilat ve cari aktarımı yapılır.
            </span>
          )}
        </div>

        {apiUrl && apiUrl !== 'demo' ? (
          /* Görsel-1 Formu: Yeni Müşteri Firma & Doğrudan SQL Server Bağlantısı */
          <div className="space-y-3 pt-1">
            {/* Row 1: Firma Kodu & Firma Ticari Unvanı */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1">
                  FİRMA KODU (Giriş Lisans Kodu)
                </label>
                <input
                  type="text"
                  value={companyCode}
                  onChange={(e) => setCompanyCode(e.target.value.toUpperCase())}
                  placeholder="ÖRN: AHMETGIDA"
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 uppercase font-mono shadow-2xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1">
                  FİRMA TİCARİ UNVANI
                </label>
                <input
                  type="text"
                  value={companyTitle}
                  onChange={(e) => setCompanyTitle(e.target.value)}
                  placeholder="Örn: Ahmet Gıda San. ve Tic. Ltd. Şti."
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 shadow-2xs"
                />
              </div>
            </div>

            {/* Row 2: SQL Server IP Adresi / Host Adı & SQL Portu */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1">
                  SQL SERVER IP ADRESİ / HOST ADI
                </label>
                <div className="flex items-stretch border border-slate-300 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-800 focus-within:border-blue-500 shadow-2xs">
                  <div className="w-10 flex items-center justify-center border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 shrink-0">
                    <Network className="w-4 h-4 text-blue-500" />
                  </div>
                  <input
                    type="text"
                    value={sqlHost}
                    onChange={(e) => setSqlHost(e.target.value)}
                    placeholder="localhost"
                    className="w-full bg-transparent px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none font-mono"
                  />
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                  Uzak müşteri için <strong>Statik IP Adresi</strong> (örn: <span className="text-pink-600 dark:text-pink-400 font-mono font-bold">85.105.xx.xx</span>), aynı bilgisayardaysa <span className="text-pink-600 dark:text-pink-400 font-mono font-bold">localhost</span>.
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1">
                  SQL PORTU
                </label>
                <div className="flex items-stretch border border-slate-300 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-800 focus-within:border-blue-500 shadow-2xs">
                  <div className="w-10 flex items-center justify-center border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 shrink-0">
                    <Zap className="w-4 h-4 text-amber-500 fill-amber-500" />
                  </div>
                  <input
                    type="text"
                    value={sqlPort}
                    onChange={(e) => setSqlPort(e.target.value)}
                    placeholder="1433"
                    className="w-full bg-transparent px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none font-mono"
                  />
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                  Varsayılan SQL Portu: <span className="text-pink-600 dark:text-pink-400 font-mono font-bold">1433</span>
                </p>
              </div>
            </div>

            {/* Row 3: SQL Server Veritabanı Adı (DB Name) & SQL Kullanıcı Adı */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1">
                  SQL SERVER VERİTABANI ADI (DB Name)
                </label>
                <div className="flex items-stretch border border-slate-300 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-800 focus-within:border-blue-500 shadow-2xs">
                  <div className="w-10 flex items-center justify-center border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 shrink-0">
                    <Database className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                  </div>
                  <input
                    type="text"
                    value={sqlDatabase}
                    onChange={(e) => setSqlDatabase(e.target.value)}
                    placeholder="Örn: AHMET_GIDA_DB"
                    className="w-full bg-transparent px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1">
                  SQL KULLANICI ADI (Opsiyonel / SQL Auth)
                </label>
                <div className="flex items-stretch border border-slate-300 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-800 focus-within:border-blue-500 shadow-2xs">
                  <div className="w-10 flex items-center justify-center border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 shrink-0">
                    <User className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                  </div>
                  <input
                    type="text"
                    value={sqlUser}
                    onChange={(e) => setSqlUser(e.target.value)}
                    placeholder="Örn: sa (Boş ise Windows Auth)"
                    className="w-full bg-transparent px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Row 4: SQL Kullanıcı Şifresi & Lisans Bitiş Tarihi */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1">
                  SQL KULLANICI ŞİFRESİ (Opsiyonel)
                </label>
                <div className="flex items-stretch border border-slate-300 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-800 focus-within:border-blue-500 shadow-2xs">
                  <div className="w-10 flex items-center justify-center border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 shrink-0">
                    <Key className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                  </div>
                  <input
                    type="password"
                    value={sqlPassword}
                    onChange={(e) => setSqlPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-transparent px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1">
                  LİSANS BİTİŞ TARİHİ
                </label>
                <div className="flex items-stretch border border-slate-300 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-800 focus-within:border-blue-500 shadow-2xs">
                  <input
                    type="date"
                    value={licenseExpireDate}
                    onChange={(e) => setLicenseExpireDate(e.target.value)}
                    className="w-full bg-transparent px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Gelişmiş Köprü & Dönem Ayarları (Collapsible) */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowAdvancedBridge(!showAdvancedBridge)}
                className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              >
                <span>{showAdvancedBridge ? '▲ Gelişmiş Entegrasyon & Köprü Ayarlarını Gizle' : '⚙️ Gelişmiş Entegrasyon & Köprü Ayarları'}</span>
              </button>

              {showAdvancedBridge && (
                <div className="mt-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-2.5 animate-in fade-in">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="font-semibold text-slate-700 dark:text-slate-300 block text-[11px]">
                        API Köprü Portu:
                      </label>
                      <input
                        type="text"
                        value={bridgePort}
                        onChange={(e) => setBridgePort(e.target.value)}
                        placeholder="4000"
                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2 font-mono text-xs text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700 dark:text-slate-300 block text-[11px]">
                        Çalışma Dönemi:
                      </label>
                      <input
                        type="text"
                        value={period}
                        onChange={(e) => setPeriod(e.target.value)}
                        placeholder="2026"
                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2 font-mono text-xs text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div>
                      <span className="font-semibold text-slate-800 dark:text-slate-200 block text-[11px]">
                        Otomatik Canlı Senkronizasyon
                      </span>
                      <span className="text-[10px] text-slate-400">
                        İnternet bağlantısı sağlandığında bekleyen sipariş ve tahsilatları ilet
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={autoSync}
                      onChange={(e) => setAutoSync(e.target.checked)}
                      className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons: Görsel-1 */}
            <div className="pt-2 space-y-2">
              {/* Buton 1: ⚡ SQL Bağlantısını Canlı Test Et */}
              <button
                type="button"
                onClick={handleTestSqlConnection}
                disabled={testResult.testing}
                className="w-full border-2 border-cyan-400 dark:border-cyan-500 hover:bg-cyan-50 dark:hover:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400 font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition active:scale-[0.99] text-xs shadow-xs"
              >
                <Zap className={`w-4 h-4 text-cyan-500 fill-cyan-500 ${testResult.testing ? 'animate-bounce' : ''}`} />
                <span>{testResult.testing ? 'SQL Bağlantısı Test Ediliyor...' : '⚡ SQL Bağlantısını Canlı Test Et'}</span>
              </button>

              {/* Buton 2: 💾 Firmayı Kaydet & Doğrudan SQL Veritabanını Bağla */}
              <button
                type="button"
                onClick={handleSaveConfig}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition active:scale-[0.99] text-xs shadow-md shadow-blue-500/20"
              >
                <Save className="w-4 h-4" />
                <span>💾 Firmayı Kaydet & Doğrudan SQL Veritabanını Bağla</span>
              </button>
            </div>

            {/* Test & Kayıt Bildirimleri */}
            {testResult.message && (
              <div
                className={`p-2.5 rounded-xl border flex items-start gap-2 ${
                  testResult.success
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                    : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                }`}
              >
                {testResult.success ? (
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                )}
                <span className="text-[11px] leading-tight font-medium">{testResult.message}</span>
              </div>
            )}

            {saveSuccess && (
              <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-[11px] font-semibold flex items-center gap-2 animate-in fade-in">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Firma ve doğrudan SQL Server bağlantı ayarları başarıyla kaydedildi!</span>
              </div>
            )}
          </div>
        ) : (
          /* Çevrimdışı / Demo Ayarları */
          <div className="space-y-3 pt-1">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block text-xs">Şirket Kodu:</label>
                <input
                  type="text"
                  value={companyCode}
                  onChange={(e) => setCompanyCode(e.target.value)}
                  placeholder="01"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2 font-mono text-xs focus:outline-none text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block text-xs">Çalışma Dönemi:</label>
                <input
                  type="text"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  placeholder="2026"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2 font-mono text-xs focus:outline-none text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <div>
                <span className="font-semibold text-slate-800 dark:text-slate-200 block text-xs">Otomatik Senkronizasyon</span>
                <span className="text-[10px] text-slate-400">Canlı sunucuda bağlantı olduğunda bekleyenleri ilet</span>
              </div>
              <input
                type="checkbox"
                checked={autoSync}
                onChange={(e) => setAutoSync(e.target.checked)}
                className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
              />
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testResult.testing}
                className="w-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-white font-semibold py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition text-xs"
              >
                <Wifi className={`w-3.5 h-3.5 ${testResult.testing ? 'animate-pulse' : ''}`} />
                <span>{testResult.testing ? 'Test Ediliyor...' : 'Demo Bağlantısını Test Et'}</span>
              </button>
              <button
                type="button"
                onClick={handleSaveConfig}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition text-xs"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Ayarları Kaydet</span>
              </button>
            </div>

            {testResult.message && (
              <div
                className={`p-2.5 rounded-xl border flex items-start gap-1.5 ${
                  testResult.success
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                    : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                }`}
              >
                {testResult.success ? (
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                )}
                <span className="text-[11px] leading-tight">{testResult.message}</span>
              </div>
            )}

            {saveSuccess && (
              <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-[11px] font-semibold flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Ayarlar başarıyla kaydedildi!</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Plasiyer Profili */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3 transition">
        <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
          <User className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <h3 className="font-bold text-sm text-slate-900 dark:text-white">Plasiyer Bilgileri</h3>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="font-semibold text-slate-700 dark:text-slate-300 block">Plasiyer Kodu:</label>
            <input
              type="text"
              value={repCode}
              onChange={(e) => setRepCode(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2 font-mono text-xs focus:outline-none text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="font-semibold text-slate-700 dark:text-slate-300 block">Plasiyer Adı:</label>
            <input
              type="text"
              value={repName}
              onChange={(e) => setRepName(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs focus:outline-none text-slate-900 dark:text-white"
            />
          </div>
        </div>
      </div>

      {/* Kaydet Butonu */}
      <button
        onClick={handleSaveConfig}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-2xl shadow-md transition active:scale-95"
      >
        Ayarları Kaydet
      </button>

      {/* Çevrimdışı Veritabanı ve Yönetim */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2.5 transition">
        <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
          <Database className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <h3 className="font-bold text-sm text-slate-900 dark:text-white">Çevrimdışı Veri Yönetimi</h3>
        </div>

        <button
          onClick={() => triggerSync()}
          disabled={isSyncing}
          className="w-full bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-900/60 text-blue-800 dark:text-blue-300 font-semibold py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
          <span>{isSyncing ? 'Veriler Çekiliyor...' : 'ERP12 ile Şimdi Eşitle (İndir & Gönder)'}</span>
        </button>

        <button
          onClick={handleResetDemoData}
          className="w-full bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium py-2 rounded-xl flex items-center justify-center gap-1.5 transition"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Demo Verilerini (Cari ve Stok) Yenile</span>
        </button>

        <button
          onClick={handleClearOrders}
          className="w-full bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 font-medium py-2 rounded-xl flex items-center justify-center gap-1.5 transition"
        >
          <Trash2 className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
          <span>Sipariş Havuzunu Sıfırla</span>
        </button>
      </div>

      {/* Oturumu Kapat / Giriş Ekranına Dön */}
      <button
        onClick={logout}
        className="w-full bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-700 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 font-bold py-3 rounded-2xl border border-slate-200 dark:border-slate-700 transition flex items-center justify-center gap-2"
      >
        <LogOut className="w-4 h-4" />
        <span>Oturumu Kapat (Giriş Ekranına Dön)</span>
      </button>

      {/* Sürüm & Mimari Notu */}
      <div className="text-center text-[10px] text-slate-400 dark:text-slate-500 space-y-0.5 pt-2">
        <p>Hibrit B2B & Mobil Plasiyer Saha Satış Portalı • v4.0 Enterprise</p>
        <p>ERP12 Bağımsız Katman & Canlı Entegratör</p>
      </div>

      {/* Çoklu Firma Modalı */}
      <CompanyProfileModal
        isOpen={isCompanyModalOpen}
        onClose={() => setIsCompanyModalOpen(false)}
        currentConfig={serverConfig}
        onSelectProfile={(profile) => {
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
          setApiUrl(profile.serverUrl);
          setCompanyCode(profile.code);
          setPeriod(profile.period);
          if (profile.companyTitle) setCompanyTitle(profile.companyTitle);
          if (profile.sqlHost) setSqlHost(profile.sqlHost);
          if (profile.sqlPort) setSqlPort(profile.sqlPort);
          if (profile.sqlDatabase) setSqlDatabase(profile.sqlDatabase);
          if (profile.sqlUser !== undefined) setSqlUser(profile.sqlUser);
          if (profile.sqlPassword !== undefined) setSqlPassword(profile.sqlPassword);
          if (profile.licenseExpireDate) setLicenseExpireDate(profile.licenseExpireDate);
          if (profile.serverUrl && profile.serverUrl !== 'demo') {
            triggerSync();
          }
        }}
      />
    </div>
  );
};
