import React, { useState, useEffect } from 'react';
import {
  Building2,
  User,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  MapPin,
  Phone,
  Mail,
  Sun,
  Moon,
  Wifi,
  WifiOff,
  AlertCircle,
  ShieldAlert,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { AuthUser } from '../types';
import {
  formatFullName,
  LICENSE_EXPIRED_MESSAGE,
  LICENSE_EXPIRED_SESSION_KEY,
  plasiyerAuthService,
} from '../services/plasiyerAuthService';
import loginBgImage from '../assets/polatlar-login-bg.jpg';

export const LoginPage: React.FC = () => {
  const { login, theme, toggleTheme, isOnline, updateServerConfig } = useApp();

  const [companyCode, setCompanyCode] = useState(() => {
    const saved = localStorage.getItem('polatlar_login_company');
    return saved ? saved.toUpperCase() : '';
  });
  const [repCode, setRepCode] = useState(() => {
    const saved = localStorage.getItem('polatlar_login_user');
    return saved || '';
  });
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(() => {
    const saved = localStorage.getItem('polatlar_remember_me');
    return saved === null ? true : saved === 'true';
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLicenseExpiredError, setIsLicenseExpiredError] = useState(false);
  const [infoMessage, setInfoMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Mobil kurulum bağlantısı (?invite=...) veya lisans dolumu nedeniyle sonlandırılan oturum kontrolü
  useEffect(() => {
    try {
      const expiredNotice = sessionStorage.getItem(LICENSE_EXPIRED_SESSION_KEY);
      if (expiredNotice) {
        sessionStorage.removeItem(LICENSE_EXPIRED_SESSION_KEY);
        setIsLicenseExpiredError(true);
        setError(LICENSE_EXPIRED_MESSAGE);
      }
    } catch {
      // ignore
    }

    const inviteRes = plasiyerAuthService.consumeInviteFromUrl();
    if (inviteRes.imported) {
      if (inviteRes.companyCode) setCompanyCode(inviteRes.companyCode.toUpperCase());
      if (inviteRes.repCode) setRepCode(inviteRes.repCode);
      if (inviteRes.licenseExpired) {
        setIsLicenseExpiredError(true);
        setError(LICENSE_EXPIRED_MESSAGE);
      } else {
        setInfoMessage(
          'Firma ve kullanıcı tanımları cihaza aktarıldı. Bilgilerinizi girerek oturum açabilirsiniz.'
        );
      }
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLicenseExpiredError(false);
    setInfoMessage('');

    const trimmedCompany = companyCode.trim().toUpperCase();
    const trimmedUserInput = repCode.trim();

    if (!trimmedCompany) {
      setError('Lütfen Firma Kodunu giriniz.');
      return;
    }

    if (!trimmedUserInput) {
      setError('Lütfen Kullanıcı / Plasiyer Kodunu giriniz.');
      return;
    }

    if (!password) {
      setError('Lütfen Şifrenizi giriniz.');
      return;
    }

    setIsLoading(true);

    try {
      const authResult = await plasiyerAuthService.authenticate({
        companyCode: trimmedCompany,
        repCode: trimmedUserInput,
        password,
      });

      if (!authResult.success) {
        if (authResult.licenseExpired || authResult.error === LICENSE_EXPIRED_MESSAGE) {
          setIsLicenseExpiredError(true);
          setError(LICENSE_EXPIRED_MESSAGE);
        } else {
          setError(authResult.error || 'Firma Kodu, Kullanıcı Kodu veya Şifre hatalı.');
        }
        setIsLoading(false);
        return;
      }

      if (rememberMe) {
        localStorage.setItem('polatlar_login_company', trimmedCompany);
        localStorage.setItem('polatlar_login_user', trimmedUserInput);
        localStorage.setItem('polatlar_remember_me', 'true');
      } else {
        localStorage.removeItem('polatlar_login_company');
        localStorage.removeItem('polatlar_login_user');
        localStorage.setItem('polatlar_remember_me', 'false');
      }

      // Yetkili Kurum (POLATLAR / admin) girişi
      if (authResult.isAdmin && authResult.adminUser) {
        login(authResult.adminUser);
        return;
      }

      if (!authResult.account) {
        setError('Hesap bilgisi doğrulanamadı.');
        setIsLoading(false);
        return;
      }

      // İlgili müşteri firmanın SQL / Sunucu yapılandırmasını aktifleştir
      if (authResult.matchedServerConfig) {
        updateServerConfig(authResult.matchedServerConfig);
      } else {
        updateServerConfig({ companyCode: trimmedCompany });
      }

      const acc = authResult.account;
      const fullName = formatFullName(acc.firstName, acc.lastName) || acc.repCode;

      const authUser: AuthUser = {
        id: `rep-${acc.companyCode}-${acc.repCode}`,
        role: 'plasiyer',
        accountRole: acc.accountRole === 'manager' ? 'manager' : 'plasiyer',
        code: acc.repCode,
        name: fullName,
        firstName: acc.firstName,
        lastName: acc.lastName,
        companyCode: acc.companyCode,
        salesRepCode: acc.repCode,
      };

      login(authUser);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-slate-950 text-slate-100 flex flex-col justify-between px-4 pt-[calc(env(safe-area-inset-top,0px)+1rem)] pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] sm:p-6 relative overflow-x-hidden select-none">
      {/* Kurumsal Arka Plan Görseli */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        <img
          src={loginBgImage}
          alt="Polatlar Kurumsal"
          className="w-full h-full object-cover object-[center_42%] opacity-65"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/35 via-slate-950/25 to-slate-950/65" />
      </div>

      {/* Üst Durum Barı (Tema & Çevrimiçi) */}
      <div className="flex items-center justify-between z-10 w-full max-w-md mx-auto">
        <div className="flex items-center gap-1.5 text-xs text-white/95 bg-slate-950/55 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/20 shadow-sm">
          {isOnline ? (
            <Wifi className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <WifiOff className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
          )}
          <span className="font-semibold">{isOnline ? 'ERP12 Çevrimiçi' : 'Çevrimdışı Mod'}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              window.location.href = '/yenile.html';
            }}
            className="p-2 rounded-full bg-slate-950/55 backdrop-blur-md text-white hover:bg-slate-900/75 border border-white/20 transition shadow-sm active:scale-95"
            title="Uygulamayı Güncelle / Önbelleği Yenile"
          >
            <RefreshCw className="w-4 h-4 text-sky-300" />
          </button>

          <button
            type="button"
            onClick={toggleTheme}
            className="p-2 rounded-full bg-slate-950/55 backdrop-blur-md text-white hover:bg-slate-900/75 border border-white/20 transition shadow-sm"
            title="Tema Değiştir"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-300" />
            ) : (
              <Moon className="w-4 h-4 text-white" />
            )}
          </button>
        </div>
      </div>

      {/* Ana Giriş Kartı (Sayfaya Tam Ortalanmış) */}
      <div className="w-full max-w-md mx-auto my-auto z-10 py-4">
        <div className="bg-white/80 dark:bg-slate-900/78 backdrop-blur-md rounded-3xl p-6 sm:p-7 shadow-2xl border border-white/45 dark:border-slate-700/80 text-slate-900 dark:text-slate-100 transition-all">
          {/* Logo: POLATLAR YAZILIM */}
          <div className="text-center mb-5">
            <div className="flex items-center justify-center tracking-tight">
              <span className="text-xl sm:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-700 via-sky-600 to-indigo-700 dark:from-sky-400 dark:via-blue-400 dark:to-indigo-400 font-sans whitespace-nowrap">
                POLATLAR YAZILIM
              </span>
            </div>

            <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mt-2.5 tracking-tight">
              Plasiyer Sistemi
            </h2>
          </div>

          {/* Bilgi Mesajı */}
          {infoMessage && (
            <div className="mb-4 p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300 text-xs flex items-start gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500 mt-0.5" />
              <span>{infoMessage}</span>
            </div>
          )}

          {/* Hata / Lisans İkaz Mesajı */}
          {error && (
            <div
              className={`mb-4 p-3.5 rounded-2xl border text-xs flex items-start gap-2.5 animate-in fade-in ${
                isLicenseExpiredError
                  ? 'bg-rose-600/15 dark:bg-rose-950/80 border-rose-500/60 dark:border-rose-500/50 text-rose-800 dark:text-rose-200 ring-1 ring-rose-500/30 shadow-md shadow-rose-600/10'
                  : 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300'
              }`}
            >
              {isLicenseExpiredError ? (
                <ShieldAlert className="w-5 h-5 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
              )}
              <span className={isLicenseExpiredError ? 'font-extrabold leading-relaxed' : ''}>
                {error}
              </span>
            </div>
          )}

          {/* Giriş Formu */}
          <form onSubmit={handleLogin} className="space-y-3.5">
            {/* 1. Firma Kodu */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wider">
                Firma Kodu
              </label>
              <div className="relative">
                <Building2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={companyCode}
                  onChange={(e) => setCompanyCode(e.target.value.toUpperCase())}
                  placeholder="Örn: POLATLAR"
                  autoComplete="organization"
                  className="w-full bg-slate-50/95 dark:bg-slate-800/85 border border-slate-200 dark:border-slate-700 rounded-2xl pl-10 pr-3.5 py-3 text-base sm:text-sm font-black text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 uppercase font-mono shadow-2xs transition"
                  required
                />
              </div>
            </div>

            {/* 2. Kullanıcı Adı / Plasiyer Kodu */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wider">
                Kullanıcı Adı / Plasiyer Kodu
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={repCode}
                  onChange={(e) => setRepCode(e.target.value)}
                  placeholder="Örn: YONETICI veya PLS01"
                  autoComplete="username"
                  className="w-full bg-slate-50/95 dark:bg-slate-800/85 border border-slate-200 dark:border-slate-700 rounded-2xl pl-10 pr-3.5 py-3 text-base sm:text-sm font-black text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono shadow-2xs transition"
                  required
                />
              </div>
            </div>

            {/* 3. Şifre */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wider">
                Şifre
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full bg-slate-50/95 dark:bg-slate-800/85 border border-slate-200 dark:border-slate-700 rounded-2xl pl-10 pr-10 py-3 text-base sm:text-sm font-semibold text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 shadow-2xs transition"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
                  title={showPassword ? 'Şifreyi Gizle' : 'Şifreyi Göster'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* 4. Beni Hatırla & Şifremi Unuttum */}
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500 border-slate-300 dark:border-slate-700"
                />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Beni Hatırla
                </span>
              </label>

              <button
                type="button"
                onClick={() => {
                  setError('');
                  setInfoMessage(
                    'Şifre sıfırlama işlemi için firma yetkilinizden veya Polatlar Yazılım destek hattından yeni şifre talep ediniz.'
                  );
                }}
                className="text-[11px] text-sky-600 dark:text-sky-400 font-bold hover:underline cursor-pointer"
              >
                Şifremi Unuttum?
              </button>
            </div>

            {/* 5. Giriş Yap Butonu */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-500 text-white font-black py-3.5 px-4 rounded-2xl shadow-xl shadow-blue-600/30 transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2 text-sm tracking-wide disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Doğrulanıyor...</span>
                </>
              ) : (
                <>
                  <span>Giriş Yap</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Alt İletişim & Adres Footer */}
      <div className="w-full max-w-md mx-auto z-10 text-white/95 text-center text-xs space-y-2 px-4 py-2.5 rounded-2xl bg-slate-950/55 backdrop-blur-md border border-white/15 font-medium shadow-md">
        <div className="flex items-center justify-center gap-2 text-center text-[11px] sm:text-xs leading-relaxed">
          <MapPin className="w-4 h-4 shrink-0 text-amber-300" />
          <span>Lalapaşa Mah. Mumcu Cad. Sina İş Merkezi Kat:5 No:10 Merkez / Erzurum</span>
        </div>

        <div className="flex items-center justify-center gap-4 text-[11px] sm:text-xs">
          <a
            href="tel:05336082353"
            className="flex items-center gap-1.5 hover:text-amber-200 transition font-bold"
          >
            <Phone className="w-3.5 h-3.5 text-emerald-300" />
            <span>0533 608 2353</span>
          </a>

          <a
            href="mailto:info@polatlaryazilim.com"
            className="flex items-center gap-1.5 hover:text-amber-200 transition font-bold"
          >
            <Mail className="w-3.5 h-3.5 text-sky-200" />
            <span>info@polatlaryazilim.com</span>
          </a>
        </div>
      </div>
    </div>
  );
};
