import React, { useState, useEffect } from 'react';
import { 
  UserCheck, Lock, Delete, Store, 
  ArrowRight, Sparkles, AlertCircle, Sun, Moon, Wifi, WifiOff,
  Smartphone, Download
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { AuthUser, Customer } from '../types';

export const LoginPage: React.FC = () => {
  const { login, theme, toggleTheme, isOnline, isPwaInstalled, promptPwaInstall } = useApp();
  const [activeTab, setActiveTab] = useState<'plasiyer' | 'customer'>('plasiyer');

  // Plasiyer Form
  const [selectedRepCode, setSelectedRepCode] = useState('PLS01');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');

  // B2B Customer Form
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustCode, setSelectedCustCode] = useState('');
  const [password, setPassword] = useState('');
  const [custError, setCustError] = useState('');

  const customers = useLiveQuery(() => db.customers.toArray(), []) || [];

  // Keypad button click
  const handleKeyClick = (val: string) => {
    if (pin.length < 4) {
      const newPin = pin + val;
      setPin(newPin);
      setPinError('');
      if (newPin.length === 4) {
        // Otomatik giriş kontrolü
        verifyAndLoginPlasiyer(newPin);
      }
    }
  };

  const handleDeleteKey = () => {
    setPin((prev) => prev.slice(0, -1));
    setPinError('');
  };

  const handleClearPin = () => {
    setPin('');
    setPinError('');
  };

  // Keyboard support for PIN
  useEffect(() => {
    if (activeTab !== 'plasiyer') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        handleKeyClick(e.key);
      } else if (e.key === 'Backspace') {
        handleDeleteKey();
      } else if (e.key === 'Escape') {
        handleClearPin();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, pin]);

  const verifyAndLoginPlasiyer = (inputPin = pin) => {
    if (inputPin.length !== 4) {
      setPinError('Lütfen 4 haneli PIN kodunuzu giriniz.');
      return;
    }

    // Demo PIN kontrolü: 1234 veya herhangi 4 haneli PIN kabul edilir
    const repName = selectedRepCode === 'PLS01' ? 'Ahmet Yılmaz' : 'Mehmet Demir';
    const authUser: AuthUser = {
      id: `rep-${selectedRepCode}`,
      role: 'plasiyer',
      code: selectedRepCode,
      name: repName,
      salesRepCode: selectedRepCode,
    };

    login(authUser);
  };

  const handleCustomerLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setCustError('');

    if (!selectedCustCode && !customerSearch) {
      setCustError('Lütfen bir müşteri/bayi seçiniz veya cari kodu giriniz.');
      return;
    }

    // Cariler içinden bul
    const found = customers.find(
      (c) => 
        c.code.toLowerCase() === (selectedCustCode || customerSearch).toLowerCase() ||
        c.taxNumber === customerSearch ||
        c.name.toLowerCase().includes(customerSearch.toLowerCase())
    );

    if (!found) {
      setCustError('Girdiğiniz bilgilerle eşleşen cari hesap bulunamadı.');
      return;
    }

    const authUser: AuthUser = {
      id: `cust-${found.id}`,
      role: 'customer',
      code: found.code,
      name: found.name,
      customerId: found.id,
      customerCode: found.code,
    };

    login(authUser);
  };

  // Hızlı Demo Giriş Fonksiyonları
  const handleQuickPlasiyer = () => {
    login({
      id: 'rep-PLS01',
      role: 'plasiyer',
      code: 'PLS01',
      name: 'Ahmet Yılmaz',
      salesRepCode: 'PLS01',
    });
  };

  const handleQuickCustomer = (cust?: Customer) => {
    const target = cust || customers[0] || {
      id: '444154',
      code: '120-00308',
      name: 'BERAT YEMEK TEM.MED.TAR.HAYV.SAN. VE TİC.LTD.ŞTİ.',
    };

    login({
      id: `cust-${target.id}`,
      role: 'customer',
      code: target.code,
      name: target.name,
      customerId: target.id,
      customerCode: target.code,
    });
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between p-4 sm:p-6 relative overflow-y-auto">
      {/* Arka Plan Dekorasyonu */}
      <div className="absolute -top-32 -left-32 w-80 h-80 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-80 h-80 bg-emerald-600/15 rounded-full blur-3xl pointer-events-none" />

      {/* Üst Çubuk */}
      <div className="flex items-center justify-between z-10">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center font-black text-white shadow-lg shadow-blue-500/30">
            12
          </div>
          <div>
            <h1 className="font-extrabold text-sm tracking-wide text-white leading-tight">
              POLATLAR YAZILIM
            </h1>
            <span className="text-[10px] text-blue-400 font-medium">
              Saha Satış & B2B Portalı
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Çevrimiçi Durumu */}
          <span className={`flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full font-semibold border ${
            isOnline 
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
              : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
          }`}>
            {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            <span>{isOnline ? 'ERP12 Çevrimiçi' : 'Çevrimdışı'}</span>
          </span>

          {/* Tema Değiştir */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-xl bg-slate-800/80 text-slate-300 hover:text-white border border-slate-700/80 transition"
            title="Tema Değiştir"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-300" />}
          </button>
        </div>
      </div>

      {/* Ana Giriş Kutusu */}
      <div className="w-full max-w-sm mx-auto my-auto z-10 py-4">
        {/* Android Ana Ekrana Ekleme Banner'ı (Cihaza yüklü değilse gösterilir) */}
        {!isPwaInstalled && (
          <div className="mb-4 p-3 rounded-2xl bg-gradient-to-r from-blue-900/80 via-indigo-900/80 to-slate-800/90 border border-blue-500/40 shadow-lg shadow-blue-500/10 flex items-center justify-between gap-3 backdrop-blur-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-blue-600/30 border border-blue-400/40 flex items-center justify-center shrink-0">
                <Smartphone className="w-5 h-5 text-amber-300 animate-pulse" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-extrabold text-xs text-white">Android Ana Ekrana Ekle</span>
                  <span className="px-1.5 py-0.2 bg-amber-400 text-slate-950 font-black text-[9px] rounded-full">
                    PWA
                  </span>
                </div>
                <p className="text-[10px] text-slate-300 truncate">
                  Tam ekran uygulama deneyimi ve çevrimdışı kullanım
                </p>
              </div>
            </div>
            <button
              onClick={() => promptPwaInstall()}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-extrabold text-xs shrink-0 shadow-md shadow-blue-500/30 active:scale-95 transition flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Yükle</span>
            </button>
          </div>
        )}

        {/* Tab Seçimi: Plasiyer vs B2B */}
        <div className="grid grid-cols-2 p-1 bg-slate-800/90 rounded-2xl border border-slate-700/80 mb-5">
          <button
            onClick={() => setActiveTab('plasiyer')}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-xs transition ${
              activeTab === 'plasiyer'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>Plasiyer Girişi</span>
          </button>

          <button
            onClick={() => setActiveTab('customer')}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-xs transition ${
              activeTab === 'customer'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Store className="w-4 h-4" />
            <span>B2B Bayi Girişi</span>
          </button>
        </div>

        {/* TAB 1: PLASİYER PIN GİRİŞİ */}
        {activeTab === 'plasiyer' && (
          <div className="bg-slate-800/90 border border-slate-700/80 rounded-3xl p-5 shadow-2xl backdrop-blur-md">
            {/* Plasiyer Temsilci Seçimi */}
            <div className="mb-4">
              <label className="block text-[11px] font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                Satış Temsilcisi
              </label>
              <select
                value={selectedRepCode}
                onChange={(e) => setSelectedRepCode(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-blue-500"
              >
                <option value="PLS01">PLS01 - Ahmet Yılmaz (Marmara)</option>
                <option value="PLS02">PLS02 - Mehmet Demir (Erzurum Merkez)</option>
                <option value="PLS03">PLS03 - Ali Kaya (Doğu Anadolu)</option>
              </select>
            </div>

            {/* PIN Gösterge Noktaları */}
            <div className="text-center my-3">
              <div className="text-xs text-slate-400 mb-2 flex items-center justify-center gap-1.5 font-medium">
                <Lock className="w-3.5 h-3.5 text-blue-400" />
                <span>4 Haneli PIN Kodunuzu Giriniz</span>
              </div>

              <div className="flex justify-center items-center gap-3 my-2">
                {[0, 1, 2, 3].map((idx) => {
                  const isFilled = pin.length > idx;
                  return (
                    <div
                      key={idx}
                      className={`w-4 h-4 rounded-full transition-all duration-200 ${
                        isFilled
                          ? 'bg-blue-500 scale-110 shadow-md shadow-blue-500/50'
                          : 'bg-slate-700 border border-slate-600'
                      }`}
                    />
                  );
                })}
              </div>

              {pinError && (
                <div className="text-rose-400 text-[11px] font-semibold mt-1">
                  {pinError}
                </div>
              )}
            </div>

            {/* On-Screen Touch Numpad */}
            <div className="grid grid-cols-3 gap-2 mt-4 max-w-[260px] mx-auto">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  onClick={() => handleKeyClick(digit)}
                  className="h-12 rounded-2xl bg-slate-700/60 hover:bg-slate-700 text-white font-bold text-lg border border-slate-600/50 active:scale-95 transition shadow-sm"
                >
                  {digit}
                </button>
              ))}
              <button
                onClick={handleClearPin}
                className="h-12 rounded-2xl bg-slate-800 hover:bg-slate-750 text-slate-400 font-semibold text-xs border border-slate-700 active:scale-95 transition"
              >
                Temizle
              </button>
              <button
                onClick={() => handleKeyClick('0')}
                className="h-12 rounded-2xl bg-slate-700/60 hover:bg-slate-700 text-white font-bold text-lg border border-slate-600/50 active:scale-95 transition shadow-sm"
              >
                0
              </button>
              <button
                onClick={handleDeleteKey}
                className="h-12 rounded-2xl bg-slate-800 hover:bg-slate-750 text-rose-400 font-bold flex items-center justify-center border border-slate-700 active:scale-95 transition"
              >
                <Delete className="w-5 h-5" />
              </button>
            </div>

            {/* Giriş Butonu */}
            <button
              onClick={() => verifyAndLoginPlasiyer()}
              className="w-full mt-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-600/30 active:scale-95 transition flex items-center justify-center gap-1.5"
            >
              <span>Saha Ekranını Aç</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* TAB 2: B2B BAYİ GİRİŞİ */}
        {activeTab === 'customer' && (
          <form onSubmit={handleCustomerLogin} className="bg-slate-800/90 border border-slate-700/80 rounded-3xl p-5 shadow-2xl backdrop-blur-md space-y-3.5">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1 uppercase tracking-wider">
                Kayıtlı Bayi / Cari Seçimi
              </label>
              <select
                value={selectedCustCode}
                onChange={(e) => {
                  setSelectedCustCode(e.target.value);
                  setCustomerSearch(e.target.value);
                  setCustError('');
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="">-- Listeden Cari Seçiniz --</option>
                {customers.slice(0, 30).map((c) => (
                  <option key={c.id} value={c.code}>
                    {c.code} - {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1 uppercase tracking-wider">
                Veya Vergi No / Cari Kodu Girin
              </label>
              <input
                type="text"
                placeholder="Örn: 120-00308 veya Vergi No"
                value={customerSearch}
                onChange={(e) => {
                  setCustomerSearch(e.target.value);
                  setCustError('');
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1 uppercase tracking-wider">
                Şifre / PIN Kodu
              </label>
              <input
                type="password"
                placeholder="Şifreniz (Varsayılan: 1234)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {custError && (
              <div className="flex items-center gap-1.5 text-rose-400 text-xs font-medium">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{custError}</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/30 active:scale-95 transition flex items-center justify-center gap-1.5 mt-2"
            >
              <Store className="w-4 h-4" />
              <span>B2B Bayi Portalı Girişi</span>
            </button>
          </form>
        )}

        {/* Hızlı Demo Giriş Alanı */}
        <div className="mt-5 p-3 rounded-2xl bg-slate-800/50 border border-slate-700/50 text-center">
          <div className="text-[11px] text-slate-400 font-semibold mb-2 flex items-center justify-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Hızlı Test / Demo Girişi</span>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={handleQuickPlasiyer}
              className="flex-1 py-1.5 px-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 rounded-xl text-[11px] font-bold transition flex items-center justify-center gap-1"
            >
              <UserCheck className="w-3 h-3 text-blue-400" />
              <span>Plasiyer (Ahmet Y.)</span>
            </button>

            <button
              onClick={() => handleQuickCustomer()}
              className="flex-1 py-1.5 px-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-[11px] font-bold transition flex items-center justify-center gap-1"
            >
              <Store className="w-3 h-3 text-emerald-400" />
              <span>B2B Bayi Girişi</span>
            </button>
          </div>
        </div>
      </div>

      {/* Alt Bilgi */}
      <div className="text-center text-[11px] text-slate-500 z-10">
        POLATLAR YAZILIM Entegre Satış & ERP12 Dağıtım Ağı • v4.0 Enterprise
      </div>
    </div>
  );
};
