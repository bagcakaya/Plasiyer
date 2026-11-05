import React, { useState, useMemo, useEffect } from 'react';
import {
  ShieldCheck,
  Building2,
  PlusCircle,
  Settings,
  Users,
  Search,
  Server,
  Calendar,
  Zap,
  CheckCircle2,
  AlertCircle,
  Share2,
  Check,
  Edit3,
  Trash2,
  LogOut,
  Sun,
  Moon,
  Wifi,
  WifiOff,
  Network,
  Database,
  User,
  Key,
  Eye,
  EyeOff,
  UserPlus,
  RefreshCw,
  ArrowUpRight,
  Sparkles,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { CompanyProfile, PlasiyerAccount, ServerConfig } from '../types';
import {
  ADMIN_COMPANY_CODE,
  formatFullName,
  plasiyerAuthService,
} from '../services/plasiyerAuthService';
import { apiService } from '../services/apiService';
import { SettingsPage } from './SettingsPage';

type AdminTab = 'companies' | 'add_company' | 'accounts' | 'settings';

const formatDateTr = (iso?: string) => {
  if (!iso) return 'Belirtilmedi';
  const parts = iso.slice(0, 10).split('-');
  if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`;
  return iso;
};

const getLicenseStatus = (expireIso?: string) => {
  if (!expireIso || !/^\d{4}-\d{2}-\d{2}$/.test(expireIso.trim())) {
    return { label: 'Süresiz / Tanımlı', tone: 'emerald' as const, daysLeft: 999 };
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(`${expireIso.trim()}T00:00:00`);
  const diffDays = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) {
    return { label: 'Lisans Süresi Doldu', tone: 'rose' as const, daysLeft: diffDays };
  }
  if (diffDays <= 30) {
    return { label: `${diffDays} Gün Kaldı`, tone: 'amber' as const, daysLeft: diffDays };
  }
  return { label: 'Aktif Lisans', tone: 'emerald' as const, daysLeft: diffDays };
};

export const AdminPortalPage: React.FC = () => {
  const {
    currentUser,
    theme,
    toggleTheme,
    isOnline,
    logout,
    serverConfig,
    updateServerConfig,
  } = useApp();

  const [activeAdminTab, setActiveAdminTab] = useState<AdminTab>('companies');
  const [profiles, setProfiles] = useState<CompanyProfile[]>(() =>
    plasiyerAuthService.getCompanyProfiles()
  );
  const [accounts, setAccounts] = useState<PlasiyerAccount[]>(() =>
    plasiyerAuthService.getLocalAccounts()
  );

  // Müşteri Firmalar Sekmesi State
  const [companySearch, setCompanySearch] = useState('');
  const [testingFirmCode, setTestingFirmCode] = useState<string | null>(null);
  const [firmTestMap, setFirmTestMap] = useState<
    Record<string, { success: boolean; message: string }>
  >({});
  const [copiedInviteKey, setCopiedInviteKey] = useState<string | null>(null);
  const [expandedFirmCode, setExpandedFirmCode] = useState<string | null>(null);

  // Yeni Firma / Firma Düzenleme Form State
  const [editingFirmOriginalCode, setEditingFirmOriginalCode] = useState<string | null>(null);
  const [formCode, setFormCode] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formPeriod, setFormPeriod] = useState('2026');
  const [formLicenseExpire, setFormLicenseExpire] = useState('2027-12-31');
  const [formMode, setFormMode] = useState<'live' | 'demo'>('live');
  const [formSqlHost, setFormSqlHost] = useState('');
  const [formSqlPort, setFormSqlPort] = useState('1433');
  const [formSqlDb, setFormSqlDb] = useState('');
  const [formSqlUser, setFormSqlUser] = useState('');
  const [formSqlPassword, setFormSqlPassword] = useState('');
  const [showFormSqlPass, setShowFormSqlPass] = useState(false);

  // İlk Müşteri Firma Kullanıcı / Plasiyer Tanımı
  const [initRepCode, setInitRepCode] = useState('PLS01');
  const [initFirstName, setInitFirstName] = useState('');
  const [initLastName, setInitLastName] = useState('');
  const [initPassword, setInitPassword] = useState('');
  const [showInitPassword, setShowInitPassword] = useState(true);

  const [formSqlTest, setFormSqlTest] = useState<{
    testing: boolean;
    success?: boolean;
    message?: string;
  }>({ testing: false });
  const [formFeedback, setFormFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
    savedProfile?: CompanyProfile;
  } | null>(null);
  const [isSavingFirm, setIsSavingFirm] = useState(false);

  // Tüm Plasiyerler Sekmesi State
  const [accountCompanyFilter, setAccountCompanyFilter] = useState<string>('ALL');
  const [quickAccCompany, setQuickAccCompany] = useState<string>('');
  const [quickAccCode, setQuickAccCode] = useState<string>('');
  const [quickAccFirst, setQuickAccFirst] = useState<string>('');
  const [quickAccLast, setQuickAccLast] = useState<string>('');
  const [quickAccPass, setQuickAccPass] = useState<string>('');
  const [showQuickPass, setShowQuickPass] = useState<boolean>(true);
  const [quickAccMsg, setQuickAccMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // Sekme değiştiğinde veya serverConfig güncellendiğinde listeyi tazele
  const refreshData = () => {
    const nextProfiles = plasiyerAuthService.getCompanyProfiles();
    setProfiles(nextProfiles);
    setAccounts(plasiyerAuthService.getLocalAccounts());
    if (!quickAccCompany && nextProfiles[0]?.code) {
      setQuickAccCompany(nextProfiles[0].code);
    }
  };

  useEffect(() => {
    refreshData();
  }, [activeAdminTab, serverConfig]);

  // Özet İstatistikler
  const stats = useMemo(() => {
    const totalFirms = profiles.length;
    const liveSqlFirms = profiles.filter((p) => p.serverUrl && p.serverUrl !== 'demo').length;
    let activeLicenses = 0;
    let expiringSoon = 0;
    profiles.forEach((p) => {
      const st = getLicenseStatus(p.licenseExpireDate);
      if (st.tone !== 'rose') activeLicenses += 1;
      if (st.tone === 'amber') expiringSoon += 1;
    });
    const customerAccounts = accounts.filter(
      (a) => a.companyCode.toUpperCase() !== ADMIN_COMPANY_CODE
    );
    return {
      totalFirms,
      liveSqlFirms,
      activeLicenses,
      expiringSoon,
      totalAccounts: customerAccounts.length,
    };
  }, [profiles, accounts]);

  const filteredProfiles = useMemo(() => {
    const q = companySearch.trim().toLocaleLowerCase('tr-TR');
    if (!q) return profiles;
    return profiles.filter(
      (p) =>
        p.code.toLocaleLowerCase('tr-TR').includes(q) ||
        (p.companyTitle || p.name || '').toLocaleLowerCase('tr-TR').includes(q) ||
        (p.sqlHost || '').toLocaleLowerCase('tr-TR').includes(q) ||
        (p.sqlDatabase || '').toLocaleLowerCase('tr-TR').includes(q)
    );
  }, [profiles, companySearch]);

  const filteredAccounts = useMemo(() => {
    return accounts
      .filter((a) => a.companyCode.toUpperCase() !== ADMIN_COMPANY_CODE)
      .filter((a) =>
        accountCompanyFilter === 'ALL'
          ? true
          : a.companyCode.toUpperCase() === accountCompanyFilter.toUpperCase()
      );
  }, [accounts, accountCompanyFilter]);

  const resetCompanyForm = () => {
    setEditingFirmOriginalCode(null);
    setFormCode('');
    setFormTitle('');
    setFormPeriod('2026');
    setFormLicenseExpire('2027-12-31');
    setFormMode('live');
    setFormSqlHost('');
    setFormSqlPort('1433');
    setFormSqlDb('');
    setFormSqlUser('');
    setFormSqlPassword('');
    setInitRepCode('PLS01');
    setInitFirstName('');
    setInitLastName('');
    setInitPassword('');
    setFormSqlTest({ testing: false });
    setFormFeedback(null);
  };

  const handleOpenEditFirm = (profile: CompanyProfile) => {
    setEditingFirmOriginalCode(profile.code.toUpperCase());
    setFormCode(profile.code.toUpperCase());
    setFormTitle(profile.companyTitle || profile.name || '');
    setFormPeriod(profile.period || '2026');
    setFormLicenseExpire(profile.licenseExpireDate || '2027-12-31');
    setFormMode(profile.serverUrl && profile.serverUrl !== 'demo' ? 'live' : 'demo');
    setFormSqlHost(profile.sqlHost || '');
    setFormSqlPort(profile.sqlPort || '1433');
    setFormSqlDb(profile.sqlDatabase || '');
    setFormSqlUser(profile.sqlUser || '');
    setFormSqlPassword(profile.sqlPassword || '');

    const firmAcc = accounts.find(
      (a) => a.companyCode.toUpperCase() === profile.code.toUpperCase()
    );
    if (firmAcc) {
      setInitRepCode(firmAcc.repCode);
      setInitFirstName(firmAcc.firstName);
      setInitLastName(firmAcc.lastName);
      setInitPassword(firmAcc.password);
    } else {
      setInitRepCode('PLS01');
      setInitFirstName('');
      setInitLastName('');
      setInitPassword('');
    }

    setFormSqlTest({ testing: false });
    setFormFeedback(null);
    setActiveAdminTab('add_company');
  };

  const handleTestFirmCardSql = async (profile: CompanyProfile) => {
    setTestingFirmCode(profile.code);
    try {
      if (!profile.serverUrl || profile.serverUrl === 'demo') {
        setFirmTestMap((prev) => ({
          ...prev,
          [profile.code]: {
            success: true,
            message: 'Çevrimdışı / Demo profili aktif ve kullanıma hazır.',
          },
        }));
        return;
      }
      const cfg = plasiyerAuthService.profileToServerConfig(profile);
      const res = await apiService.testSqlConnection(cfg);
      setFirmTestMap((prev) => ({ ...prev, [profile.code]: res }));
    } catch (err: any) {
      setFirmTestMap((prev) => ({
        ...prev,
        [profile.code]: {
          success: false,
          message: err.message || 'SQL bağlantı testi sırasında hata oluştu.',
        },
      }));
    } finally {
      setTestingFirmCode(null);
    }
  };

  const handleCopyCompanyLink = async (profile: CompanyProfile) => {
    const firmAccs = accounts.filter(
      (a) => a.companyCode.toUpperCase() === profile.code.toUpperCase()
    );
    const url = plasiyerAuthService.buildCompanyInviteLink(profile, firmAccs);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedInviteKey(`firm-${profile.code}`);
      setTimeout(() => setCopiedInviteKey(null), 3000);
    } catch {
      window.prompt('Müşteri firma kurulum bağlantısını kopyalayın:', url);
    }
  };

  const handleCopyRepLink = async (acc: PlasiyerAccount) => {
    const cfg =
      plasiyerAuthService.findServerConfigByCompanyCode(acc.companyCode) || {
        ...serverConfig,
        companyCode: acc.companyCode,
      };
    const url = plasiyerAuthService.buildMobileInviteLink(acc, cfg);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedInviteKey(`acc-${acc.id}`);
      setTimeout(() => setCopiedInviteKey(null), 3000);
    } catch {
      window.prompt('Plasiyer mobil kurulum bağlantısını kopyalayın:', url);
    }
  };

  const handleDeleteFirm = (profile: CompanyProfile) => {
    if (
      !window.confirm(
        `"${profile.companyTitle || profile.code}" (${profile.code}) müşteri firma kaydını silmek istediğinize emin misiniz?`
      )
    ) {
      return;
    }
    const next = plasiyerAuthService.deleteCompanyProfile(profile.code);
    setProfiles(next);
  };

  const handleTestFormSql = async () => {
    setFormSqlTest({ testing: true });
    const tempCfg: ServerConfig = {
      apiUrl: '/api',
      companyCode: formCode.trim().toUpperCase() || '01',
      period: formPeriod.trim() || '2026',
      autoSync: true,
      companyTitle: formTitle.trim(),
      sqlHost: formSqlHost.trim() || 'localhost',
      sqlPort: formSqlPort.trim() || '1433',
      sqlDatabase: formSqlDb.trim(),
      sqlUser: formSqlUser.trim(),
      sqlPassword: formSqlPassword,
      licenseExpireDate: formLicenseExpire.trim(),
    };
    const res = await apiService.testSqlConnection(tempCfg);
    setFormSqlTest({
      testing: false,
      success: res.success,
      message: res.message,
    });
  };

  const handleSaveCompanyForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormFeedback(null);

    const cleanCode = formCode.trim().toUpperCase();
    if (!cleanCode) {
      setFormFeedback({ type: 'error', text: 'Lütfen Müşteri Firma Kodunu giriniz.' });
      return;
    }
    if (cleanCode === ADMIN_COMPANY_CODE) {
      setFormFeedback({
        type: 'error',
        text: `"${ADMIN_COMPANY_CODE}" kodu Yetkili Kurum (Admin) için ayrılmıştır. Müşteri firma için farklı bir kod giriniz.`,
      });
      return;
    }
    if (formMode === 'live' && (!formSqlHost.trim() || !formSqlDb.trim())) {
      setFormFeedback({
        type: 'error',
        text: 'Canlı SQL modunda SQL Server IP/Host ve Veritabanı Adı alanları zorunludur.',
      });
      return;
    }

    setIsSavingFirm(true);
    try {
      if (editingFirmOriginalCode && editingFirmOriginalCode !== cleanCode) {
        plasiyerAuthService.deleteCompanyProfile(editingFirmOriginalCode);
      }

      const savedProfile = plasiyerAuthService.upsertCompanyProfile({
        code: cleanCode,
        name: formTitle.trim() || cleanCode,
        companyTitle: formTitle.trim() || cleanCode,
        period: formPeriod.trim() || '2026',
        serverUrl: formMode === 'live' ? '/api' : 'demo',
        sqlHost: formMode === 'live' ? formSqlHost.trim() : '',
        sqlPort: formSqlPort.trim() || '1433',
        sqlDatabase: formMode === 'live' ? formSqlDb.trim() : '',
        sqlUser: formMode === 'live' ? formSqlUser.trim() : '',
        sqlPassword: formMode === 'live' ? formSqlPassword : '',
        licenseExpireDate: formLicenseExpire.trim() || '2027-12-31',
      });

      const firmServerCfg = plasiyerAuthService.profileToServerConfig(savedProfile);

      // İlk giriş / plasiyer hesabı girildiyse kaydet ve canlı SQL varsa veritabanına da yaz
      if (initRepCode.trim() && initPassword.trim()) {
        await plasiyerAuthService.upsertAccount(
          {
            companyCode: cleanCode,
            repCode: initRepCode.trim().toUpperCase(),
            firstName: initFirstName.trim(),
            lastName: initLastName.trim(),
            password: initPassword.trim(),
          },
          firmServerCfg
        );
      }

      refreshData();
      setEditingFirmOriginalCode(cleanCode);
      setFormFeedback({
        type: 'success',
        text: `"${savedProfile.companyTitle}" (${cleanCode}) firması başarıyla kaydedildi. Aşağıdaki kurulum bağlantısını müşterinize iletebilirsiniz.`,
        savedProfile,
      });
    } finally {
      setIsSavingFirm(false);
    }
  };

  const handleSaveQuickAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setQuickAccMsg(null);
    const cCode = quickAccCompany.trim().toUpperCase();
    const rCode = quickAccCode.trim().toUpperCase();
    const pwd = quickAccPass.trim();

    if (!cCode || cCode === ADMIN_COMPANY_CODE) {
      setQuickAccMsg({ type: 'error', text: 'Lütfen geçerli bir Müşteri Firma Kodu seçiniz/giriniz.' });
      return;
    }
    if (!rCode || !pwd) {
      setQuickAccMsg({ type: 'error', text: 'Plasiyer/Kullanıcı Kodu ve Şifre zorunludur.' });
      return;
    }

    const firmCfg = plasiyerAuthService.findServerConfigByCompanyCode(cCode) || undefined;
    await plasiyerAuthService.upsertAccount(
      {
        companyCode: cCode,
        repCode: rCode,
        firstName: quickAccFirst.trim(),
        lastName: quickAccLast.trim(),
        password: pwd,
      },
      firmCfg
    );

    refreshData();
    setQuickAccCode('');
    setQuickAccFirst('');
    setQuickAccLast('');
    setQuickAccPass('');
    setQuickAccMsg({
      type: 'success',
      text: `${cCode} firmasına "${rCode}" hesabı başarıyla tanımlandı.`,
    });
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 flex flex-col transition-colors">
      {/* ÜST KURUMSAL KOMUTA BARI (Plasiyer/Firma tasarımından tamamen bağımsız Yetkili Kurum kimliği) */}
      <header className="sticky top-0 z-40 bg-gradient-to-r from-zinc-950 via-slate-900 to-emerald-950 border-b border-emerald-500/25 text-white shadow-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3">
          {/* Sol: Polatlar Yazılım Yetkili Kurum Logosu */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-400 via-teal-500 to-amber-500 p-[1px] shadow-lg shadow-emerald-500/20 shrink-0">
              <div className="w-full h-full rounded-[15px] bg-zinc-950 flex items-center justify-center">
                <ShieldCheck className="w-6 h-6 text-emerald-400" />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-black text-sm sm:text-base tracking-wide text-white">
                  POLATLAR YAZILIM
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-400/15 text-amber-300 border border-amber-400/30">
                  Yetkili Kurum
                </span>
              </div>
              <p className="text-[11px] text-emerald-200/80 font-medium">
                Müşteri Firma, Lisans &amp; Veritabanı Yönetim Konsolu &bull;{' '}
                <span className="font-mono text-white">{currentUser?.code || 'admin'}</span>
              </p>
            </div>
          </div>

          {/* Sağ: Durum, Tema ve Güvenli Çıkış */}
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-[11px] font-semibold">
              {isOnline ? (
                <>
                  <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-200">Merkez Çevrimiçi</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-amber-200">Çevrimdışı</span>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-zinc-200 transition"
              title="Görünüm Temasını Değiştir"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-300" />
              ) : (
                <Moon className="w-4 h-4 text-sky-200" />
              )}
            </button>

            <button
              type="button"
              onClick={logout}
              className="px-3.5 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-200 font-bold text-xs flex items-center gap-1.5 transition active:scale-95"
            >
              <LogOut className="w-4 h-4" />
              <span>Çıkış Yap</span>
            </button>
          </div>
        </div>

        {/* Alt Sekme Navigasyonu */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-3 overflow-x-auto no-scrollbar">
          <div className="inline-flex items-center gap-1.5 p-1 rounded-2xl bg-white/5 border border-white/10 min-w-max">
            <button
              type="button"
              onClick={() => setActiveAdminTab('companies')}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 transition ${
                activeAdminTab === 'companies'
                  ? 'bg-emerald-500 text-zinc-950 shadow-md shadow-emerald-500/25'
                  : 'text-zinc-300 hover:text-white hover:bg-white/5'
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>Müşteri Firmalar</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  activeAdminTab === 'companies'
                    ? 'bg-zinc-950/20 text-zinc-950'
                    : 'bg-white/10 text-zinc-200'
                }`}
              >
                {stats.totalFirms}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                resetCompanyForm();
                setActiveAdminTab('add_company');
              }}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 transition ${
                activeAdminTab === 'add_company'
                  ? 'bg-emerald-500 text-zinc-950 shadow-md shadow-emerald-500/25'
                  : 'text-zinc-300 hover:text-white hover:bg-white/5'
              }`}
            >
              <PlusCircle className="w-4 h-4" />
              <span>{editingFirmOriginalCode ? 'Firma Düzenle' : 'Yeni Firma Tanımla'}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveAdminTab('accounts')}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 transition ${
                activeAdminTab === 'accounts'
                  ? 'bg-emerald-500 text-zinc-950 shadow-md shadow-emerald-500/25'
                  : 'text-zinc-300 hover:text-white hover:bg-white/5'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Plasiyer &amp; Kullanıcılar</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  activeAdminTab === 'accounts'
                    ? 'bg-zinc-950/20 text-zinc-950'
                    : 'bg-white/10 text-zinc-200'
                }`}
              >
                {stats.totalAccounts}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveAdminTab('settings')}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 transition ${
                activeAdminTab === 'settings'
                  ? 'bg-emerald-500 text-zinc-950 shadow-md shadow-emerald-500/25'
                  : 'text-zinc-300 hover:text-white hover:bg-white/5'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>Ayarlar</span>
            </button>
          </div>
        </div>
      </header>

      {/* ANA İÇERİK ALANI */}
      <main className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6">
        {/* SEKME 1: MÜŞTERİ FİRMALAR PORTFÖYÜ */}
        {activeAdminTab === 'companies' && (
          <div className="space-y-5">
            {/* KPI Özet Kartları */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-xs">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-400">
                  Kayıtlı Müşteri Firma
                </span>
                <div className="mt-1.5 flex items-baseline justify-between">
                  <span className="text-2xl font-black text-slate-900 dark:text-white">
                    {stats.totalFirms}
                  </span>
                  <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                    Kurumsal Portföy
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-xs">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-400">
                  Canlı SQL Sunuculu
                </span>
                <div className="mt-1.5 flex items-baseline justify-between">
                  <span className="text-2xl font-black text-sky-600 dark:text-sky-400">
                    {stats.liveSqlFirms}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
                    Statik IP / ERP12
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-xs">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-400">
                  Aktif Lisanslar
                </span>
                <div className="mt-1.5 flex items-baseline justify-between">
                  <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                    {stats.activeLicenses}
                  </span>
                  <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                    {stats.expiringSoon > 0 ? `${stats.expiringSoon} yaklaşıyor` : 'Tümü güncel'}
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-xs">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-400">
                  Tanımlı Plasiyer / Kullanıcı
                </span>
                <div className="mt-1.5 flex items-baseline justify-between">
                  <span className="text-2xl font-black text-violet-600 dark:text-violet-400">
                    {stats.totalAccounts}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
                    Tüm Firmalar
                  </span>
                </div>
              </div>
            </div>

            {/* Arama & Yeni Firma Ekle Aksiyon Çubuğu */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-zinc-900 p-3.5 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-xs">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={companySearch}
                  onChange={(e) => setCompanySearch(e.target.value)}
                  placeholder="Firma kodu, ticari unvan, SQL IP adresi veya veritabanı ara..."
                  className="w-full bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-xl pl-10 pr-4 py-2.5 text-xs font-semibold text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  resetCompanyForm();
                  setActiveAdminTab('add_company');
                }}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 transition active:scale-95 shrink-0"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Yeni Müşteri Firma Ekle</span>
              </button>
            </div>

            {/* Firma Kartları Grid */}
            {filteredProfiles.length === 0 ? (
              <div className="p-12 rounded-3xl bg-white dark:bg-zinc-900 border border-dashed border-slate-300 dark:border-zinc-800 text-center space-y-3">
                <Building2 className="w-10 h-10 text-slate-300 dark:text-zinc-700 mx-auto" />
                <div className="text-sm font-extrabold text-slate-700 dark:text-zinc-200">
                  Kayıtlı müşteri firma bulunamadı
                </div>
                <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-md mx-auto">
                  Yeni bir müşteri firması tanımlayarak SQL Server bağlantısını ve ilk giriş yetkilerini hemen oluşturabilirsiniz.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    resetCompanyForm();
                    setActiveAdminTab('add_company');
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>İlk Müşteri Firmayı Ekle</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {filteredProfiles.map((profile) => {
                  const isLiveSql = Boolean(profile.serverUrl && profile.serverUrl !== 'demo');
                  const license = getLicenseStatus(profile.licenseExpireDate);
                  const firmAccounts = accounts.filter(
                    (a) => a.companyCode.toUpperCase() === profile.code.toUpperCase()
                  );
                  const testStatus = firmTestMap[profile.code];
                  const isTesting = testingFirmCode === profile.code;
                  const isActiveInSettings =
                    serverConfig.companyCode?.toUpperCase() === profile.code.toUpperCase();
                  const isExpanded = expandedFirmCode === profile.code;

                  return (
                    <div
                      key={profile.id}
                      className="rounded-3xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-5 shadow-xs hover:border-emerald-500/50 transition flex flex-col justify-between gap-4"
                    >
                      <div className="space-y-3">
                        {/* Üst Satır: Firma Kodu, Unvan ve Lisans Rozeti */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-xs font-black px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
                                {profile.code}
                              </span>
                              <span
                                className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full ${
                                  isLiveSql
                                    ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                                    : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                }`}
                              >
                                {isLiveSql ? 'Canlı SQL' : 'Demo Mod'}
                              </span>
                              {isActiveInSettings && (
                                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-700 dark:text-violet-300">
                                  Ayarlarda Seçili
                                </span>
                              )}
                            </div>

                            <h3 className="font-black text-sm sm:text-base text-slate-900 dark:text-white mt-2 leading-snug">
                              {profile.companyTitle || profile.name || profile.code}
                            </h3>
                          </div>

                          <span
                            className={`shrink-0 text-[10px] font-extrabold px-2.5 py-1 rounded-xl border ${
                              license.tone === 'emerald'
                                ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60'
                                : license.tone === 'amber'
                                ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60'
                                : 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/60'
                            }`}
                          >
                            {license.label}
                          </span>
                        </div>

                        {/* Teknik & Lisans Detay Kutusu */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 rounded-2xl bg-slate-50 dark:bg-zinc-950/70 border border-slate-200/70 dark:border-zinc-800/80 text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <Server className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                            <span className="font-mono text-[11px] text-slate-700 dark:text-zinc-300 truncate">
                              {isLiveSql
                                ? `${profile.sqlHost || 'localhost'}:${profile.sqlPort || '1433'} / ${profile.sqlDatabase || '-'}`
                                : 'Yerel Tarayıcı Veritabanı'}
                            </span>
                          </div>

                          <div className="flex items-center sm:justify-end gap-2">
                            <Calendar className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            <span className="text-[11px] text-slate-600 dark:text-zinc-400">
                              Bitiş: <strong className="text-slate-900 dark:text-zinc-200">{formatDateTr(profile.licenseExpireDate)}</strong>
                            </span>
                          </div>
                        </div>

                        {/* Varsa Canlı SQL Test Sonucu */}
                        {testStatus && (
                          <div
                            className={`p-2.5 rounded-xl border text-[11px] font-medium flex items-start gap-2 ${
                              testStatus.success
                                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
                            }`}
                          >
                            {testStatus.success ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                            ) : (
                              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                            )}
                            <span>{testStatus.message}</span>
                          </div>
                        )}

                        {/* Genişletilebilir Plasiyer Özeti */}
                        {isExpanded && (
                          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 space-y-2">
                            <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 dark:text-zinc-300">
                              <span>Tanımlı Kullanıcı / Plasiyerler ({firmAccounts.length})</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setAccountCompanyFilter(profile.code);
                                  setQuickAccCompany(profile.code);
                                  setActiveAdminTab('accounts');
                                }}
                                className="text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-0.5"
                              >
                                <span>Yeni Ekle</span>
                                <ArrowUpRight className="w-3 h-3" />
                              </button>
                            </div>
                            {firmAccounts.length === 0 ? (
                              <p className="text-[11px] text-slate-400">
                                Bu firmaya henüz giriş kullanıcısı tanımlanmamış. "Düzenle" veya "Yeni Ekle" ile ilk hesabı oluşturun.
                              </p>
                            ) : (
                              <div className="space-y-1">
                                {firmAccounts.map((acc) => (
                                  <div
                                    key={acc.id}
                                    className="flex items-center justify-between text-[11px] py-1 px-2 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200/70 dark:border-zinc-800"
                                  >
                                    <div>
                                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 mr-2">
                                        {acc.repCode}
                                      </span>
                                      <span className="font-semibold">
                                        {formatFullName(acc.firstName, acc.lastName) || acc.repCode}
                                      </span>
                                    </div>
                                    <span className="font-mono text-slate-400">
                                      Şifre: {acc.password}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Alt Aksiyon Butonları */}
                      <div className="pt-3 border-t border-slate-100 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleTestFirmCardSql(profile)}
                            disabled={isTesting}
                            className="px-2.5 py-1.5 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-500/20 text-[11px] font-bold flex items-center gap-1 transition"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                            <span>SQL Test</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleCopyCompanyLink(profile)}
                            className="px-2.5 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 text-[11px] font-bold flex items-center gap-1 transition"
                            title="Müşteri firmaya gönderilecek tek tıkla kurulum bağlantısını kopyala"
                          >
                            {copiedInviteKey === `firm-${profile.code}` ? (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                <span>Link Kopyalandı</span>
                              </>
                            ) : (
                              <>
                                <Share2 className="w-3.5 h-3.5" />
                                <span>Kurulum Linki</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setExpandedFirmCode(isExpanded ? null : profile.code)
                            }
                            className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 text-[11px] font-bold flex items-center gap-1 transition"
                          >
                            <Users className="w-3.5 h-3.5" />
                            <span>Plasiyer ({firmAccounts.length})</span>
                          </button>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              updateServerConfig(
                                plasiyerAuthService.profileToServerConfig(profile)
                              );
                              setActiveAdminTab('settings');
                            }}
                            className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold text-violet-600 dark:text-violet-400 hover:bg-violet-500/10 transition"
                            title="Bu firmayı Ayarlar sekmesinde aktif et"
                          >
                            Ayarlarda Aç
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenEditFirm(profile)}
                            className="p-1.5 rounded-xl text-slate-500 hover:text-emerald-600 dark:text-zinc-400 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
                            title="Firmayı Düzenle"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteFirm(profile)}
                            className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                            title="Firmayı Sil"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* SEKME 2: YENİ MÜŞTERİ FİRMA EKLE / DÜZENLE */}
        {activeAdminTab === 'add_company' && (
          <div className="max-w-4xl mx-auto space-y-5">
            <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200 dark:border-zinc-800 p-5 sm:p-7 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-zinc-800">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    Yetkili Kurum Firma Tanımlama Sihirbazı
                  </span>
                  <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white mt-0.5">
                    {editingFirmOriginalCode
                      ? `${editingFirmOriginalCode} Firmasını Düzenle`
                      : 'Yeni Müşteri Firma & SQL Lisansı Oluştur'}
                  </h2>
                </div>

                {editingFirmOriginalCode && (
                  <button
                    type="button"
                    onClick={resetCompanyForm}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-zinc-800 text-xs font-bold text-slate-700 dark:text-zinc-200 hover:bg-slate-200 dark:hover:bg-zinc-700 transition"
                  >
                    + Yeni Boş Form Aç
                  </button>
                )}
              </div>

              <form onSubmit={handleSaveCompanyForm} className="space-y-6 pt-5 text-xs">
                {/* 1. FİRMA VE LİSANS BİLGİLERİ */}
                <div className="space-y-3">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                    1. Firma Kimliği &amp; Lisans Bilgileri
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block font-bold text-slate-700 dark:text-zinc-300 mb-1">
                        Müşteri Firma Kodu (Giriş Kodu)
                      </label>
                      <input
                        type="text"
                        value={formCode}
                        onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                        placeholder="Örn: GUNEYSERVER"
                        className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3.5 py-2.5 font-mono font-black uppercase text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        required
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 dark:text-zinc-300 mb-1">
                        Firma Ticari Unvanı
                      </label>
                      <input
                        type="text"
                        value={formTitle}
                        onChange={(e) => setFormTitle(e.target.value)}
                        placeholder="Örn: Güneyler Toptan Gıda Ltd. Şti."
                        className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3.5 py-2.5 font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        required
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 dark:text-zinc-300 mb-1">
                        Çalışma Dönemi
                      </label>
                      <input
                        type="text"
                        value={formPeriod}
                        onChange={(e) => setFormPeriod(e.target.value)}
                        placeholder="2026"
                        className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3.5 py-2.5 font-mono font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 dark:text-zinc-300 mb-1">
                        Lisans Bitiş Tarihi
                      </label>
                      <input
                        type="date"
                        value={formLicenseExpire}
                        onChange={(e) => setFormLicenseExpire(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3.5 py-2.5 font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  {/* Bağlantı Modu Seçimi */}
                  <div className="grid grid-cols-2 gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setFormMode('live')}
                      className={`py-2.5 px-3 rounded-xl font-bold border flex items-center justify-center gap-2 transition ${
                        formMode === 'live'
                          ? 'bg-emerald-500/15 border-emerald-500 text-emerald-800 dark:text-emerald-300'
                          : 'bg-slate-50 dark:bg-zinc-800 border-slate-200 dark:border-zinc-700 text-slate-500'
                      }`}
                    >
                      <Server className="w-4 h-4" />
                      <span>Canlı SQL Server Bağlantısı</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormMode('demo')}
                      className={`py-2.5 px-3 rounded-xl font-bold border flex items-center justify-center gap-2 transition ${
                        formMode === 'demo'
                          ? 'bg-amber-500/15 border-amber-500 text-amber-800 dark:text-amber-300'
                          : 'bg-slate-50 dark:bg-zinc-800 border-slate-200 dark:border-zinc-700 text-slate-500'
                      }`}
                    >
                      <span>Çevrimdışı / Demo Modu</span>
                    </button>
                  </div>
                </div>

                {/* 2. SQL SERVER BAĞLANTISI */}
                {formMode === 'live' && (
                  <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-zinc-800">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                        2. Doğrudan SQL Server Veritabanı Parametreleri
                      </h3>
                      <button
                        type="button"
                        onClick={handleTestFormSql}
                        disabled={formSqlTest.testing}
                        className="px-3 py-1.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 text-sky-700 dark:text-sky-300 border border-sky-500/30 font-extrabold text-[11px] flex items-center gap-1.5 transition"
                      >
                        <Zap className="w-3.5 h-3.5" />
                        <span>
                          {formSqlTest.testing ? 'Test Ediliyor...' : 'SQL Bağlantısını Test Et'}
                        </span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                      <div className="sm:col-span-2">
                        <label className="block font-bold text-slate-700 dark:text-zinc-300 mb-1">
                          SQL Server Statik IP / Host Adı
                        </label>
                        <div className="relative">
                          <Network className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={formSqlHost}
                            onChange={(e) => setFormSqlHost(e.target.value)}
                            placeholder="Örn: 88.250.63.243 veya localhost"
                            className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl pl-9 pr-3.5 py-2.5 font-mono font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block font-bold text-slate-700 dark:text-zinc-300 mb-1">
                          SQL Portu
                        </label>
                        <input
                          type="text"
                          value={formSqlPort}
                          onChange={(e) => setFormSqlPort(e.target.value)}
                          placeholder="1433"
                          className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3.5 py-2.5 font-mono font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                      <div>
                        <label className="block font-bold text-slate-700 dark:text-zinc-300 mb-1">
                          Veritabanı Adı (DB Name)
                        </label>
                        <div className="relative">
                          <Database className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={formSqlDb}
                            onChange={(e) => setFormSqlDb(e.target.value)}
                            placeholder="Örn: GUNEYLERB2B"
                            className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl pl-9 pr-3.5 py-2.5 font-mono font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block font-bold text-slate-700 dark:text-zinc-300 mb-1">
                          SQL Kullanıcı Adı
                        </label>
                        <div className="relative">
                          <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={formSqlUser}
                            onChange={(e) => setFormSqlUser(e.target.value)}
                            placeholder="Örn: sa"
                            className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl pl-9 pr-3.5 py-2.5 font-mono font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block font-bold text-slate-700 dark:text-zinc-300 mb-1">
                          SQL Kullanıcı Şifresi
                        </label>
                        <div className="relative">
                          <Key className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type={showFormSqlPass ? 'text' : 'password'}
                            value={formSqlPassword}
                            onChange={(e) => setFormSqlPassword(e.target.value)}
                            placeholder="••••••••"
                            className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl pl-9 pr-9 py-2.5 font-mono font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                          <button
                            type="button"
                            onClick={() => setShowFormSqlPass(!showFormSqlPass)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200"
                          >
                            {showFormSqlPass ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    {formSqlTest.message && (
                      <div
                        className={`p-3 rounded-xl border text-[11px] font-medium flex items-start gap-2 ${
                          formSqlTest.success
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                            : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
                        }`}
                      >
                        {formSqlTest.success ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                        )}
                        <span>{formSqlTest.message}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* 3. MÜŞTERİ FİRMA İLK GİRİŞ / YETKİLİ HESABI */}
                <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-zinc-800">
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                      3. Müşteri Firma İlk Giriş / Plasiyer Hesabı
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Müşteri firmanın sisteme giriş yapıp kendi plasiyerlerini ekleyebilmesi için ilk kullanıcı kodunu ve şifresini belirleyin.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 dark:text-zinc-300 mb-1">
                        Kullanıcı / Plasiyer Kodu
                      </label>
                      <input
                        type="text"
                        value={initRepCode}
                        onChange={(e) => setInitRepCode(e.target.value.toUpperCase())}
                        placeholder="Örn: PLS01"
                        className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 font-mono font-bold uppercase text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 dark:text-zinc-300 mb-1">
                        Adı
                      </label>
                      <input
                        type="text"
                        value={initFirstName}
                        onChange={(e) => setInitFirstName(e.target.value)}
                        placeholder="Örn: Firma"
                        className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 dark:text-zinc-300 mb-1">
                        Soyadı
                      </label>
                      <input
                        type="text"
                        value={initLastName}
                        onChange={(e) => setInitLastName(e.target.value)}
                        placeholder="Örn: Yetkilisi"
                        className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 dark:text-zinc-300 mb-1">
                        Giriş Şifresi
                      </label>
                      <div className="relative">
                        <input
                          type={showInitPassword ? 'text' : 'password'}
                          value={initPassword}
                          onChange={(e) => setInitPassword(e.target.value)}
                          placeholder="Şifre belirleyin"
                          className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 pr-9 py-2.5 font-mono font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowInitPassword(!showInitPassword)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200"
                        >
                          {showInitPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* KAYDET BUTONU */}
                <div className="pt-2 flex flex-wrap items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveAdminTab('companies')}
                    className="px-4 py-3 rounded-xl bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 font-bold transition"
                  >
                    Firma Listesine Dön
                  </button>

                  <button
                    type="submit"
                    disabled={isSavingFirm}
                    className="px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black shadow-lg shadow-emerald-600/25 flex items-center gap-2 transition active:scale-95 disabled:opacity-60"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>
                      {isSavingFirm
                        ? 'Kaydediliyor...'
                        : 'Müşteri Firmayı Kaydet & Yetkilendir'}
                    </span>
                  </button>
                </div>

                {formFeedback && (
                  <div
                    className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      formFeedback.type === 'success'
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                        : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                    }`}
                  >
                    <div className="flex items-start gap-2.5 text-xs font-semibold">
                      {formFeedback.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      )}
                      <span>{formFeedback.text}</span>
                    </div>

                    {formFeedback.savedProfile && (
                      <button
                        type="button"
                        onClick={() => handleCopyCompanyLink(formFeedback.savedProfile!)}
                        className="shrink-0 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-sm"
                      >
                        {copiedInviteKey === `firm-${formFeedback.savedProfile.code}` ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Kurulum Linki Kopyalandı</span>
                          </>
                        ) : (
                          <>
                            <Share2 className="w-3.5 h-3.5" />
                            <span>Müşteri Kurulum Linkini Kopyala</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                )}
              </form>
            </div>
          </div>
        )}

        {/* SEKME 3: TÜM FİRMALARDAKİ PLASİYER & KULLANICILAR */}
        {activeAdminTab === 'accounts' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 text-xs">
            {/* Sol: Hızlı Plasiyer / Kullanıcı Tanımla */}
            <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200 dark:border-zinc-800 p-5 shadow-xs h-fit space-y-4">
              <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100 dark:border-zinc-800">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-900 dark:text-white">
                    Firmaya Kullanıcı / Plasiyer Ekle
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    İstediğiniz müşteri firmaya hesap açın
                  </p>
                </div>
              </div>

              <form onSubmit={handleSaveQuickAccount} className="space-y-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-zinc-300 mb-1">
                    Müşteri Firma Kodu
                  </label>
                  {profiles.length > 0 ? (
                    <select
                      value={quickAccCompany}
                      onChange={(e) => setQuickAccCompany(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl p-2.5 font-mono font-bold text-slate-900 dark:text-white"
                    >
                      <option value="">Firma Seçiniz...</option>
                      {profiles.map((p) => (
                        <option key={p.id} value={p.code}>
                          {p.code} — {p.companyTitle || p.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={quickAccCompany}
                      onChange={(e) => setQuickAccCompany(e.target.value.toUpperCase())}
                      placeholder="Örn: GUNEYSERVER"
                      className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl p-2.5 font-mono font-bold uppercase text-slate-900 dark:text-white"
                    />
                  )}
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-zinc-300 mb-1">
                    Plasiyer / Kullanıcı Kodu
                  </label>
                  <input
                    type="text"
                    value={quickAccCode}
                    onChange={(e) => setQuickAccCode(e.target.value.toUpperCase())}
                    placeholder="Örn: PLS01"
                    className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl p-2.5 font-mono font-bold uppercase text-slate-900 dark:text-white"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-zinc-300 mb-1">
                      Adı
                    </label>
                    <input
                      type="text"
                      value={quickAccFirst}
                      onChange={(e) => setQuickAccFirst(e.target.value)}
                      placeholder="Ad"
                      className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl p-2.5 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-zinc-300 mb-1">
                      Soyadı
                    </label>
                    <input
                      type="text"
                      value={quickAccLast}
                      onChange={(e) => setQuickAccLast(e.target.value)}
                      placeholder="Soyad"
                      className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl p-2.5 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-zinc-300 mb-1">
                    Giriş Şifresi
                  </label>
                  <div className="relative">
                    <input
                      type={showQuickPass ? 'text' : 'password'}
                      value={quickAccPass}
                      onChange={(e) => setQuickAccPass(e.target.value)}
                      placeholder="Şifre"
                      className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl p-2.5 pr-9 font-mono text-slate-900 dark:text-white"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowQuickPass(!showQuickPass)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                    >
                      {showQuickPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold transition"
                >
                  Hesabı Kaydet
                </button>

                {quickAccMsg && (
                  <div
                    className={`p-2.5 rounded-xl border text-[11px] font-medium ${
                      quickAccMsg.type === 'success'
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                        : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
                    }`}
                  >
                    {quickAccMsg.text}
                  </div>
                )}
              </form>
            </div>

            {/* Sağ: Tüm Hesaplar Listesi */}
            <div className="lg:col-span-2 bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200 dark:border-zinc-800 p-5 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-zinc-800">
                <h3 className="font-black text-sm text-slate-900 dark:text-white">
                  Tanımlı Müşteri Firma Kullanıcıları ({filteredAccounts.length})
                </h3>

                <select
                  value={accountCompanyFilter}
                  onChange={(e) => setAccountCompanyFilter(e.target.value)}
                  className="bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-1.5 text-xs font-bold"
                >
                  <option value="ALL">Tüm Firmalar</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.code}>
                      {p.code}
                    </option>
                  ))}
                </select>
              </div>

              {filteredAccounts.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  Seçili filtrede tanımlı plasiyer / kullanıcı hesabı bulunmuyor.
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredAccounts.map((acc) => (
                    <div
                      key={acc.id}
                      className="p-3 rounded-2xl bg-slate-50 dark:bg-zinc-950/70 border border-slate-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-[11px] font-black px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                          {acc.companyCode}
                        </span>
                        <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-lg bg-sky-500/15 text-sky-700 dark:text-sky-300">
                          {acc.repCode}
                        </span>
                        <span className="font-bold text-slate-900 dark:text-white">
                          {formatFullName(acc.firstName, acc.lastName) || acc.repCode}
                        </span>
                        <span className="font-mono text-[11px] text-slate-400">
                          • Şifre: {acc.password}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleCopyRepLink(acc)}
                          className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 font-bold text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1"
                        >
                          {copiedInviteKey === `acc-${acc.id}` ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>Kopyalandı</span>
                            </>
                          ) : (
                            <>
                              <Share2 className="w-3.5 h-3.5" />
                              <span>Mobil Link</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setQuickAccCompany(acc.companyCode);
                            setQuickAccCode(acc.repCode);
                            setQuickAccFirst(acc.firstName);
                            setQuickAccLast(acc.lastName);
                            setQuickAccPass(acc.password);
                          }}
                          className="p-1.5 rounded-xl text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400"
                          title="Düzenle"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={async () => {
                            const cfg =
                              plasiyerAuthService.findServerConfigByCompanyCode(acc.companyCode) ||
                              undefined;
                            const next = await plasiyerAuthService.deleteAccount(
                              acc.companyCode,
                              acc.repCode,
                              cfg
                            );
                            setAccounts(next);
                          }}
                          className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600"
                          title="Sil"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* SEKME 4: MEVCUT AYARLAR SAYFASI (ADMİNDE BİREBİR OLDUĞU GİBİ KORUNUR) */}
        {activeAdminTab === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
};
