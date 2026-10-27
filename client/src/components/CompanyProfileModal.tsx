import React, { useState, useEffect } from 'react';
import { 
  Building2, CheckCircle2, Plus, Trash2, Globe, 
  X, RefreshCw, Server, Network, Zap, Database,
  User, Key, Save, AlertCircle
} from 'lucide-react';
import type { CompanyProfile, ServerConfig } from '../types';
import { apiService } from '../services/apiService';

interface CompanyProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentConfig: ServerConfig;
  onSelectProfile: (profile: CompanyProfile) => void;
}

const DEFAULT_PROFILES: CompanyProfile[] = [
  {
    id: 'prof-demo',
    name: 'POLATLAR GIDA - Demo & Çevrimdışı Mod',
    code: '01',
    period: '2026',
    serverUrl: 'demo',
    companyTitle: 'Polatlar Gıda San. ve Tic. Ltd. Şti.',
    sqlHost: 'localhost',
    sqlPort: '1433',
    sqlDatabase: 'POLATLAR_GIDA',
    isDefault: true,
  },
  {
    id: 'prof-live-sample',
    name: 'POLATLAR YAZILIM - Canlı ERP12 (Örnek Statik IP)',
    code: '02',
    period: '2026',
    serverUrl: 'http://78.189.45.12:4000/api',
    companyTitle: 'Polatlar Yazılım ve Bilişim Hizmetleri',
    sqlHost: '78.189.45.12',
    sqlPort: '1433',
    sqlDatabase: 'ERP12_DB',
    isDefault: false,
  },
];

export const CompanyProfileModal: React.FC<CompanyProfileModalProps> = ({
  isOpen,
  onClose,
  currentConfig,
  onSelectProfile,
}) => {
  const [profiles, setProfiles] = useState<CompanyProfile[]>(() => {
    const saved = localStorage.getItem('plasiyer_company_profiles');
    if (saved) {
      try {
        const parsed: CompanyProfile[] = JSON.parse(saved);
        // Clean up legacy profiles with vercel URL or broken hostname
        const cleaned = parsed.map(p => {
          if (p.serverUrl && (p.serverUrl.includes('vercel.app') || (typeof window !== 'undefined' && window.location.hostname.includes('vercel.app') && p.serverUrl.includes(window.location.hostname)))) {
            return { ...p, serverUrl: 'demo' };
          }
          return p;
        });
        return cleaned.length > 0 ? cleaned : DEFAULT_PROFILES;
      } catch (e) {
        return DEFAULT_PROFILES;
      }
    }
    return DEFAULT_PROFILES;
  });

  const [isAddingNew, setIsAddingNew] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});

  // Yeni profil form state (Görsel-1 Doğrudan SQL Server Bağlantısı)
  const [newCode, setNewCode] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newSqlHost, setNewSqlHost] = useState('localhost');
  const [newSqlPort, setNewSqlPort] = useState('1434');
  const [newSqlDb, setNewSqlDb] = useState('');
  const [newSqlUser, setNewSqlUser] = useState('');
  const [newSqlPassword, setNewSqlPassword] = useState('');
  const [newLicenseExpireDate, setNewLicenseExpireDate] = useState('2027-12-31');
  const [newPeriod, setNewPeriod] = useState('2026');
  const [newBridgePort, setNewBridgePort] = useState('4000');
  const [showAdvancedInModal, setShowAdvancedInModal] = useState(false);
  const [formTestResult, setFormTestResult] = useState<{ testing: boolean; success?: boolean; message?: string }>({ testing: false });
  const [formError, setFormError] = useState('');

  // LocalStorage senkronizasyonu
  useEffect(() => {
    localStorage.setItem('plasiyer_company_profiles', JSON.stringify(profiles));
  }, [profiles]);

  if (!isOpen) return null;

  const handleTestConnection = async (profile: CompanyProfile) => {
    setTestingId(profile.id);

    if (!profile.serverUrl || profile.serverUrl === 'demo') {
      setTimeout(() => {
        setTestResults(prev => ({
          ...prev,
          [profile.id]: { success: true, message: 'Demo / Çevrimdışı Profil: İnternetsiz tam fonksiyonel çalışır.' }
        }));
        setTestingId(null);
      }, 400);
      return;
    }

    const testConfig: ServerConfig = {
      apiUrl: profile.serverUrl,
      companyCode: profile.code,
      period: profile.period,
      autoSync: true,
    };

    try {
      const res = await apiService.testConnection(testConfig);
      setTestResults(prev => ({
        ...prev,
        [profile.id]: res
      }));
    } catch (err: any) {
      setTestResults(prev => ({
        ...prev,
        [profile.id]: { success: false, message: err.message || 'Bağlantı hatası' }
      }));
    } finally {
      setTestingId(null);
    }
  };

  const handleTestNewSql = async () => {
    setFormTestResult({ testing: true });
    const host = newSqlHost.trim() || 'localhost';
    const targetUrl = (host.startsWith('http://') || host.startsWith('https://'))
      ? host
      : `http://${host}:${newBridgePort.trim() || '4000'}/api`;

    const res = await apiService.testSqlConnection({
      apiUrl: targetUrl,
      companyCode: newCode.trim() || '01',
      period: newPeriod.trim() || '2026',
      autoSync: true,
      companyTitle: newTitle.trim(),
      sqlHost: host,
      sqlPort: newSqlPort.trim() || '1433',
      sqlDatabase: newSqlDb.trim(),
      sqlUser: newSqlUser.trim(),
      sqlPassword: newSqlPassword,
      licenseExpireDate: newLicenseExpireDate.trim(),
      bridgePort: newBridgePort.trim(),
    });

    setFormTestResult({
      testing: false,
      success: res.success,
      message: res.message,
    });
  };

  const handleAddProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!newCode.trim()) {
      setFormError('Lütfen Firma Kodunu giriniz (Örn: AHMETGIDA).');
      return;
    }

    const host = newSqlHost.trim() || 'localhost';
    const finalUrl = (host.startsWith('http://') || host.startsWith('https://'))
      ? host
      : `http://${host}:${newBridgePort.trim() || '4000'}/api`;

    const newProfile: CompanyProfile = {
      id: 'prof-' + Date.now(),
      name: newTitle.trim() || newCode.trim().toUpperCase(),
      code: newCode.trim().toUpperCase(),
      period: newPeriod.trim() || '2026',
      serverUrl: finalUrl,
      companyTitle: newTitle.trim() || newCode.trim().toUpperCase(),
      sqlHost: host,
      sqlPort: newSqlPort.trim() || '1433',
      sqlDatabase: newSqlDb.trim(),
      sqlUser: newSqlUser.trim(),
      sqlPassword: newSqlPassword,
      licenseExpireDate: newLicenseExpireDate.trim(),
      isDefault: false,
    };

    setProfiles(prev => [...prev, newProfile]);
    setIsAddingNew(false);
    setNewCode('');
    setNewTitle('');
    setNewSqlDb('');
    setNewSqlUser('');
    setNewSqlPassword('');
    
    // Otomatik olarak yeni profili seç
    onSelectProfile(newProfile);
    onClose();
  };

  const handleDeleteProfile = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (profiles.length <= 1) {
      alert('En az bir firma profili kayıtlı kalmalıdır.');
      return;
    }
    setProfiles(prev => prev.filter(p => p.id !== id));
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        {isAddingNew ? (
          <div className="px-5 py-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-white">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">🏬</span>
              <h2 className="text-sm sm:text-base font-bold text-white">
                Yeni Müşteri Firma & Doğrudan SQL Server Bağlantısı Ekle
              </h2>
            </div>
            <button
              onClick={() => setIsAddingNew(false)}
              className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-600/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 flex items-center justify-center">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Firma & Statik IP Profilleri
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  ERP12 Şube ve Sunucu Bağlantı Yöneticisi
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {!isAddingNew ? (
            <>
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1">
                <span>Kayıtlı Firma Bağlantıları</span>
                <button
                  onClick={() => setIsAddingNew(true)}
                  className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-bold hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Yeni Profil Ekle</span>
                </button>
              </div>

              <div className="space-y-3">
                {profiles.map((profile) => {
                  const isActive = currentConfig.apiUrl === profile.serverUrl && currentConfig.companyCode === profile.code;
                  const testResult = testResults[profile.id];
                  const isTesting = testingId === profile.id;

                  return (
                    <div
                      key={profile.id}
                      onClick={() => {
                        onSelectProfile(profile);
                        onClose();
                      }}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer relative ${
                        isActive
                          ? 'border-blue-500 bg-blue-50/40 dark:bg-blue-950/20 ring-2 ring-blue-500/20'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                            isActive 
                              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30' 
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                          }`}>
                            <Server className="w-4 h-4" />
                          </div>

                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                                {profile.name}
                              </h3>
                              {isActive && (
                                <span className="flex items-center gap-1 text-[10px] font-black uppercase text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/60 px-2 py-0.5 rounded-full">
                                  <CheckCircle2 className="w-3 h-3" /> Aktif
                                </span>
                              )}
                            </div>

                            <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-1 break-all flex items-center gap-1">
                              <Globe className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>{profile.serverUrl === 'demo' ? '🟢 Çevrimdışı / Demo Modu (Tam Fonksiyon)' : profile.serverUrl}</span>
                            </p>

                            <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-2 font-medium">
                              <span>Firma: <strong className="text-slate-800 dark:text-slate-200">{profile.code}</strong></span>
                              <span>•</span>
                              <span>Dönem: <strong className="text-slate-800 dark:text-slate-200">{profile.period}</strong></span>
                            </div>
                          </div>
                        </div>

                        {/* Aksiyonlar: Test Et & Sil */}
                        <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => handleTestConnection(profile)}
                            disabled={isTesting}
                            title="Bağlantıyı Test Et"
                            className="p-2 rounded-xl text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition text-xs font-medium flex items-center gap-1"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin text-blue-500' : ''}`} />
                            <span className="hidden sm:inline">Test</span>
                          </button>

                          {profiles.length > 1 && (
                            <button
                              onClick={(e) => handleDeleteProfile(profile.id, e)}
                              title="Profili Sil"
                              className="p-2 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Test Sonuç Uyarısı */}
                      {testResult && (
                        <div className={`mt-3 p-2 rounded-xl text-xs flex items-center gap-2 font-medium ${
                          testResult.success
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60'
                            : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60'
                        }`}>
                          {testResult.success ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                          ) : (
                            <X className="w-4 h-4 text-rose-500 shrink-0" />
                          )}
                          <span>{testResult.message}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            /* YENİ PROFİL FORMU (Görsel-1 Doğrudan SQL Server Bağlantısı) */
            <form onSubmit={handleAddProfile} className="space-y-3.5 animate-in fade-in">
              {/* Hızlı Bilgisayar / Yerel SQL Doldurma Butonu */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-2.5 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-xs">
                <span className="text-blue-800 dark:text-blue-300 font-semibold text-[11px]">
                  💡 Bu bilgisayardaki ERP12 veritabanına bağlanmak için:
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setNewCode('OSMANLI');
                    setNewTitle('OSMANLI GIDA');
                    setNewSqlHost('localhost');
                    setNewSqlPort('1434');
                    setNewSqlDb('OSMANLIGIDA');
                    setNewSqlUser('sa');
                    setNewSqlPassword('polatlar4555.');
                  }}
                  className="px-2.5 py-1 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] transition shadow-xs shrink-0"
                >
                  💻 Yerel SQL (1434) Doldur
                </button>
              </div>

              {/* Row 1: Firma Kodu & Firma Ticari Unvanı */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1">
                    FİRMA KODU (Giriş Lisans Kodu)
                  </label>
                  <input
                    type="text"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value.toUpperCase())}
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
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
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
                      value={newSqlHost}
                      onChange={(e) => setNewSqlHost(e.target.value)}
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
                      value={newSqlPort}
                      onChange={(e) => setNewSqlPort(e.target.value)}
                      placeholder="1434"
                      className="w-full bg-transparent px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none font-mono"
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                    ERP12 SQL Portu: <span className="text-pink-600 dark:text-pink-400 font-mono font-bold">1434</span> (Standart SQL: 1433)
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
                      value={newSqlDb}
                      onChange={(e) => setNewSqlDb(e.target.value)}
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
                      value={newSqlUser}
                      onChange={(e) => setNewSqlUser(e.target.value)}
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
                      value={newSqlPassword}
                      onChange={(e) => setNewSqlPassword(e.target.value)}
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
                      value={newLicenseExpireDate}
                      onChange={(e) => setNewLicenseExpireDate(e.target.value)}
                      className="w-full bg-transparent px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Gelişmiş Entegrasyon & Dönem (Collapsible) */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowAdvancedInModal(!showAdvancedInModal)}
                  className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                >
                  <span>{showAdvancedInModal ? '▲ Gelişmiş Entegrasyon Ayarlarını Gizle' : '⚙️ Gelişmiş Entegrasyon & Dönem Ayarları'}</span>
                </button>

                {showAdvancedInModal && (
                  <div className="mt-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-2 animate-in fade-in">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="font-semibold text-slate-700 dark:text-slate-300 block text-[11px]">
                          API Köprü Portu:
                        </label>
                        <input
                          type="text"
                          value={newBridgePort}
                          onChange={(e) => setNewBridgePort(e.target.value)}
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
                          value={newPeriod}
                          onChange={(e) => setNewPeriod(e.target.value)}
                          placeholder="2026"
                          className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2 font-mono text-xs text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Hata Uyarısı */}
              {formError && (
                <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs font-semibold border border-rose-200 dark:border-rose-800/60 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Test Sonuç Uyarısı */}
              {formTestResult.message && (
                <div className={`p-2.5 rounded-xl text-xs flex items-center gap-2 font-medium ${
                  formTestResult.success
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60'
                    : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60'
                }`}>
                  {formTestResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  ) : (
                    <X className="w-4 h-4 text-rose-500 shrink-0" />
                  )}
                  <span>{formTestResult.message}</span>
                </div>
              )}

              {/* Action Buttons: Görsel-1 */}
              <div className="pt-2 space-y-2">
                {/* Buton 1: ⚡ SQL Bağlantısını Canlı Test Et */}
                <button
                  type="button"
                  onClick={handleTestNewSql}
                  disabled={formTestResult.testing}
                  className="w-full border-2 border-cyan-400 dark:border-cyan-500 hover:bg-cyan-50 dark:hover:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400 font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition active:scale-[0.99] text-xs shadow-xs"
                >
                  <Zap className={`w-4 h-4 text-cyan-500 fill-cyan-500 ${formTestResult.testing ? 'animate-bounce' : ''}`} />
                  <span>{formTestResult.testing ? 'SQL Bağlantısı Test Ediliyor...' : '⚡ SQL Bağlantısını Canlı Test Et'}</span>
                </button>

                {/* Buton 2: 💾 Firmayı Kaydet & Doğrudan SQL Veritabanını Bağla */}
                <button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition active:scale-[0.99] text-xs shadow-md shadow-blue-500/20"
                >
                  <Save className="w-4 h-4" />
                  <span>💾 Firmayı Kaydet & Doğrudan SQL Veritabanını Bağla</span>
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>Toplam {profiles.length} kayıtlı profil</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 rounded-xl font-semibold transition"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
};
