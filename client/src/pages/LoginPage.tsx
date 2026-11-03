import React, { useState } from 'react';
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
  AlertCircle
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { AuthUser } from '../types';

export const LoginPage: React.FC = () => {
  const { login, theme, toggleTheme, isOnline, updateServerConfig } = useApp();

  const [companyCode, setCompanyCode] = useState(() => {
    return localStorage.getItem('polatlar_login_company') || 'OSMANLI';
  });
  const [username, setUsername] = useState(() => {
    return localStorage.getItem('polatlar_login_user') || 'PLS01';
  });
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(() => {
    return localStorage.getItem('polatlar_remember_me') === 'true';
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const customers = useLiveQuery(() => db.customers.toArray(), []) || [];

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedCompany = companyCode.trim().toUpperCase();
    const trimmedUser = username.trim();

    if (!trimmedCompany) {
      setError('Lütfen Kurum Kodunu giriniz (Örn: OSMANLI).');
      return;
    }

    if (!trimmedUser) {
      setError('Lütfen Kullanıcı Adınızı giriniz.');
      return;
    }

    setIsLoading(true);

    // Beni Hatırla durumunu kaydet
    if (rememberMe) {
      localStorage.setItem('polatlar_login_company', trimmedCompany);
      localStorage.setItem('polatlar_login_user', trimmedUser);
      localStorage.setItem('polatlar_remember_me', 'true');
    } else {
      localStorage.removeItem('polatlar_login_company');
      localStorage.removeItem('polatlar_login_user');
      localStorage.setItem('polatlar_remember_me', 'false');
    }

    // Server konfigürasyonunu güncelle
    updateServerConfig({ companyCode: trimmedCompany });

    // Kullanıcı eşleştirme (Plasiyer veya Müşteri)
    setTimeout(() => {
      // Eğer kullanıcı adı bir müşteriye aitse B2B olarak aç
      const foundCustomer = customers.find(
        (c) =>
          c.code.toLowerCase() === trimmedUser.toLowerCase() ||
          c.id === trimmedUser ||
          c.name.toLowerCase().includes(trimmedUser.toLowerCase())
      );

      if (foundCustomer) {
        const authUser: AuthUser = {
          id: `cust-${foundCustomer.id}`,
          role: 'customer',
          code: foundCustomer.code,
          name: foundCustomer.name,
          customerId: foundCustomer.id,
          customerCode: foundCustomer.code,
        };
        login(authUser);
        setIsLoading(false);
        return;
      }

      // Varsayılan: Plasiyer (PLS01, Ahmet Yılmaz vb.)
      const isPls02 = trimmedUser.toUpperCase() === 'PLS02';
      const authUser: AuthUser = {
        id: `rep-${trimmedUser.toUpperCase()}`,
        role: 'plasiyer',
        code: trimmedUser.toUpperCase(),
        name: isPls02 ? 'Mehmet Demir' : 'Ahmet Yılmaz',
        salesRepCode: trimmedUser.toUpperCase(),
      };

      login(authUser);
      setIsLoading(false);
    }, 350);
  };

  // Hızlı Demo Doldurma
  const handleQuickFill = (comp: string, usr: string, pass: string) => {
    setCompanyCode(comp);
    setUsername(usr);
    setPassword(pass);
    setError('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#009fd9] via-[#0284c7] to-[#0369a1] text-slate-100 flex flex-col justify-between p-4 sm:p-6 relative overflow-x-hidden select-none">
      {/* Arka Plan Yumuşak Işık Efektleri */}
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-white/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-blue-900/40 rounded-full blur-3xl pointer-events-none" />

      {/* Üst Durum Barı (Tema & Çevrimiçi) */}
      <div className="flex items-center justify-between z-10 w-full max-w-md mx-auto">
        <div className="flex items-center gap-1.5 text-xs text-white/90 bg-white/15 backdrop-blur-md px-3 py-1 rounded-full border border-white/20 shadow-xs">
          {isOnline ? <Wifi className="w-3.5 h-3.5 text-emerald-300" /> : <WifiOff className="w-3.5 h-3.5 text-amber-300 animate-pulse" />}
          <span className="font-semibold">{isOnline ? 'ERP12 Çevrimiçi' : 'Çevrimdışı Mod'}</span>
        </div>

        <button
          onClick={toggleTheme}
          className="p-2 rounded-full bg-white/15 backdrop-blur-md text-white hover:bg-white/25 border border-white/20 transition"
          title="Tema Değiştir"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4 text-white" />}
        </button>
      </div>

      {/* Ana Giriş Kartı */}
      <div className="w-full max-w-md mx-auto my-auto z-10 py-4">
        <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-3xl p-6 sm:p-8 shadow-2xl border border-white/40 dark:border-slate-800 text-slate-900 dark:text-slate-100 transition-all">
          {/* Görsel-5 Logo: POLATLAR YAZILIM */}
          <div className="text-center mb-6">
            <div className="inline-block relative">
              <div className="flex items-baseline justify-center tracking-tight">
                <span className="text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-700 via-sky-600 to-indigo-700 dark:from-sky-400 dark:via-blue-400 dark:to-indigo-400 font-sans">
                  POLATLAR
                </span>
              </div>
              <div className="text-[13px] font-serif italic text-sky-600 dark:text-sky-400 tracking-widest text-right -mt-1 font-semibold">
                yazılım
              </div>
            </div>

            {/* Görsel-5 Başlık: Giriş Yapın */}
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mt-4 tracking-tight">
              Giriş Yapın
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              ERP12 Mobil Saha Satış Portalı
            </p>
          </div>

          {/* Hata Mesajı */}
          {error && (
            <div className="mb-4 p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          {/* Giriş Formu (Görsel-5) */}
          <form onSubmit={handleLogin} className="space-y-4">
            {/* 1. Kurum Kodu */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wider">
                Kurum Kodu
              </label>
              <div className="relative">
                <Building2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={companyCode}
                  onChange={(e) => setCompanyCode(e.target.value.toUpperCase())}
                  placeholder="Örn: OSMANLI"
                  className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl pl-10 pr-3.5 py-3 text-xs sm:text-sm font-black text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 uppercase font-mono shadow-2xs transition"
                  required
                />
              </div>
            </div>

            {/* 2. Kullanıcı Adı */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wider">
                Kullanıcı Adı
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Örn: PLS01 veya Ahmet"
                  className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl pl-10 pr-3.5 py-3 text-xs sm:text-sm font-semibold text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 shadow-2xs transition"
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
                  className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl pl-10 pr-10 py-3 text-xs sm:text-sm font-semibold text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 shadow-2xs transition"
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

            {/* 4. Beni Hatırla (Görsel-5) */}
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

              <span className="text-[11px] text-sky-600 dark:text-sky-400 font-bold hover:underline cursor-pointer">
                Şifremi Unuttum?
              </span>
            </div>

            {/* 5. Görsel-5: Giriş Yap Butonu */}
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

          {/* Hızlı Demo Giriş Kısayolları */}
          <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 text-center">
            <span className="text-[11px] text-slate-400 font-semibold block mb-2">
              ⚡ Hızlı Test Girişi
            </span>
            <div className="flex gap-2 justify-center">
              <button
                type="button"
                onClick={() => handleQuickFill('OSMANLI', 'PLS01', '1234')}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-300 transition"
              >
                👤 Plasiyer (PLS01)
              </button>
              <button
                type="button"
                onClick={() => handleQuickFill('OSMANLI', '120-00894', '1234')}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-300 transition"
              >
                🏢 Bayi / Müşteri
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Görsel-5: Alt İletişim & Adres Footer */}
      <div className="w-full max-w-md mx-auto z-10 text-white/95 text-center text-xs space-y-2 pt-2 pb-1 font-medium">
        <div className="flex items-center justify-center gap-2 text-center text-[11px] sm:text-xs leading-relaxed">
          <MapPin className="w-4 h-4 shrink-0 text-amber-300" />
          <span>Muratpaşa Mah. Uzun Sk. Sina İş Merkezi K:5 N:10 Yakutiye/ERZURUM</span>
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
