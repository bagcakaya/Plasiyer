import React, { useState, useEffect } from 'react';
import { 
  Building2, CheckCircle2, Plus, Trash2, Globe, 
  X, RefreshCw, Server
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
    id: 'prof-osmanli',
    name: 'OSMANLI GIDA - Merkez (Erzurum)',
    code: '01',
    period: '2026',
    serverUrl: `http://${window.location.hostname || 'localhost'}:4000/api`,
    isDefault: true,
  },
  {
    id: 'prof-anadolu',
    name: 'ANADOLU GIDA - İstanbul Bölge Şube',
    code: '02',
    period: '2026',
    serverUrl: 'http://192.168.1.150:4000/api',
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
        return JSON.parse(saved);
      } catch (e) {
        return DEFAULT_PROFILES;
      }
    }
    return DEFAULT_PROFILES;
  });

  const [isAddingNew, setIsAddingNew] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});

  // Yeni profil form state
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('http://');
  const [newCode, setNewCode] = useState('01');
  const [newPeriod, setNewPeriod] = useState('2026');
  const [formError, setFormError] = useState('');

  // LocalStorage senkronizasyonu
  useEffect(() => {
    localStorage.setItem('plasiyer_company_profiles', JSON.stringify(profiles));
  }, [profiles]);

  if (!isOpen) return null;

  const handleTestConnection = async (profile: CompanyProfile) => {
    setTestingId(profile.id);
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

  const handleAddProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!newName.trim()) {
      setFormError('Lütfen firma adını giriniz.');
      return;
    }
    if (!newUrl.trim() || newUrl === 'http://') {
      setFormError('Lütfen geçerli bir Sunucu URL / Statik IP adresi giriniz.');
      return;
    }

    const cleanUrl = newUrl.endsWith('/') ? newUrl.slice(0, -1) : newUrl;
    const finalUrl = cleanUrl.endsWith('/api') ? cleanUrl : `${cleanUrl}/api`;

    const newProfile: CompanyProfile = {
      id: 'prof-' + Date.now(),
      name: newName.trim(),
      code: newCode.trim() || '01',
      period: newPeriod.trim() || '2026',
      serverUrl: finalUrl,
      isDefault: false,
    };

    setProfiles(prev => [...prev, newProfile]);
    setIsAddingNew(false);
    setNewName('');
    setNewUrl('http://');
    
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
                              <span>{profile.serverUrl}</span>
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
            /* YENİ PROFİL FORMU */
            <form onSubmit={handleAddProfile} className="space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Yeni Firma / Statik IP Yapılandırması
                </span>
                <button
                  type="button"
                  onClick={() => setIsAddingNew(false)}
                  className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  İptal
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Firma / Şube Ünvanı *
                </label>
                <input
                  type="text"
                  placeholder="Örn: OSMANLI GIDA - İstanbul Depo"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Statik IP / Sunucu Adresi *
                </label>
                <input
                  type="text"
                  placeholder="Örn: http://78.189.45.12:4000/api veya http://192.168.1.50:4000/api"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 font-mono"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  ERP12 entegrasyon servisinizin kurulu olduğu sunucunun statik IP adresini giriniz.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Şirket Kodu
                  </label>
                  <input
                    type="text"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Çalışma Dönemi
                  </label>
                  <input
                    type="text"
                    value={newPeriod}
                    onChange={(e) => setNewPeriod(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
              </div>

              {formError && (
                <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs font-semibold border border-rose-200 dark:border-rose-800/60">
                  {formError}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddingNew(false)}
                  className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl text-xs transition"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-md transition flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Profili Kaydet ve Seç</span>
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
