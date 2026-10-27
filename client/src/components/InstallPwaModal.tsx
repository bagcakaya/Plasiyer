import React, { useState } from 'react';
import { 
  Smartphone, 
  Monitor,
  MoreVertical, 
  Download, 
  CheckCircle2, 
  X, 
  Sparkles, 
  Wifi, 
  ShieldCheck,
  Laptop
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export const InstallPwaModal: React.FC = () => {
  const { isPwaModalOpen, closePwaModal, canInstallPwa, promptPwaInstall } = useApp();
  const isDesktopDetected = typeof window !== 'undefined' && !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const [activeTab, setActiveTab] = useState<'pc' | 'mobile'>(isDesktopDetected ? 'pc' : 'mobile');

  if (!isPwaModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Üst Başlık & Gradient */}
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 p-5 text-white relative">
          <button
            onClick={closePwaModal}
            className="absolute top-4 right-4 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition active:scale-95"
            title="Kapat"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center shrink-0 shadow-inner">
              {activeTab === 'pc' ? (
                <Laptop className="w-7 h-7 text-amber-300" />
              ) : (
                <Smartphone className="w-7 h-7 text-amber-300" />
              )}
            </div>
            <div>
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black uppercase tracking-wider mb-1">
                <Sparkles className="w-3 h-3" />
                <span>{activeTab === 'pc' ? 'Masaüstü & PC Kurulumu' : 'Mobil Kurulum Rehberi'}</span>
              </div>
              <h3 className="font-extrabold text-base leading-tight">
                {activeTab === 'pc' ? 'Bilgisayara / Masaüstüne Ekle' : 'Ana Ekrana Ekle & Uygulama Olarak Yükle'}
              </h3>
            </div>
          </div>

          {/* Sekme Seçici: PC / Telefon */}
          <div className="flex gap-2 mt-4 pt-3 border-t border-white/15">
            <button
              onClick={() => setActiveTab('pc')}
              className={`flex-1 py-1.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition ${
                activeTab === 'pc'
                  ? 'bg-white text-blue-900 shadow-md'
                  : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              <Monitor className="w-4 h-4" />
              <span>Bilgisayar (PC / Laptop)</span>
            </button>
            <button
              onClick={() => setActiveTab('mobile')}
              className={`flex-1 py-1.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition ${
                activeTab === 'mobile'
                  ? 'bg-white text-blue-900 shadow-md'
                  : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              <Smartphone className="w-4 h-4" />
              <span>Telefon (Android / iOS)</span>
            </button>
          </div>
        </div>

        {/* İçerik */}
        <div className="p-5 space-y-4 overflow-y-auto text-xs text-slate-700 dark:text-slate-300">
          {/* Avantajlar */}
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <span className="text-[11px] font-bold text-blue-900 dark:text-blue-200">
                Ayrı Masaüstü Penceresi
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 flex items-center gap-2">
              <Wifi className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="text-[11px] font-bold text-emerald-900 dark:text-emerald-200">
                Çevrimdışı Çalışma
              </span>
            </div>
          </div>

          {/* Otomatik Yükleme Butonu (Eğer browser izin veriyorsa) */}
          {canInstallPwa && (
            <button
              onClick={() => {
                promptPwaInstall();
              }}
              className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold text-sm shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 transition active:scale-95"
            >
              <Download className="w-4 h-4" />
              <span>Tek Tıkla Uygulama Olarak Yükle</span>
            </button>
          )}

          {/* BİLGİSAYAR (PC) KURULUM REHBERİ */}
          {activeTab === 'pc' && (
            <div className="space-y-3 pt-1">
              <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 rounded-2xl">
                <p className="text-[11px] font-semibold text-blue-900 dark:text-blue-200">
                  💡 <b>Bilgisayarda Neden "Ana Ekrana Ekle" Yazmaz?</b><br />
                  PC tarayıcılarında bu özellik <b>"Uygulamayı Yükle"</b> veya <b>"Sayfayı uygulama olarak yükle"</b> adıyla yer alır.
                </p>
              </div>

              {/* Yöntem 1: Adres Çubuğu */}
              <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                <div className="w-7 h-7 rounded-xl bg-blue-600 text-white font-black flex items-center justify-center shrink-0 text-xs">
                  1
                </div>
                <div className="space-y-1">
                  <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span>Adres Çubuğundaki Simgeye Tıklayın (En Kolay Yol)</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Tarayıcının en üstündeki <b>URL / Adres çubuğunun sağ tarafına</b> bakın (yıldız işaretinin yanı). Orada bir <b>bilgisayar monitörü veya indirme oku</b> ("Uygulamayı Yükle") simgesi göreceksiniz. Tıklayıp <b>"Yükle"</b> deyin.
                  </p>
                </div>
              </div>

              {/* Yöntem 2: Menüden Kısayol */}
              <div className="flex items-start gap-3 p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/80">
                <div className="w-7 h-7 rounded-xl bg-amber-500 text-slate-950 font-black flex items-center justify-center shrink-0 text-xs">
                  2
                </div>
                <div className="space-y-1">
                  <div className="font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5 flex-wrap">
                    <span>Chrome / Edge Menüsünden Yükleme</span>
                    <Download className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <p className="text-[11px] text-amber-800/90 dark:text-amber-300/90 leading-relaxed">
                    Tarayıcının sağ üstündeki <b>üç nokta (⋮)</b> simgesine tıklayın:<br />
                    • <b>Google Chrome:</b> <i>"Kaydet ve Paylaş"</i> &rarr; <i>"Sayfayı uygulama olarak yükle..."</i> (veya <i>"Kısayol oluştur..."</i> &rarr; <i>"Pencere olarak aç"</i> işaretleyin).<br />
                    • <b>Microsoft Edge:</b> <i>"Uygulamalar"</i> &rarr; <i>"Bu siteyi bir uygulama olarak yükle"</i> deyin.
                  </p>
                </div>
              </div>

              {/* Yöntem 3: Hazır Masaüstü Kısayolu */}
              <div className="flex items-start gap-3 p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800/80">
                <div className="w-7 h-7 rounded-xl bg-emerald-600 text-white font-black flex items-center justify-center shrink-0 text-xs">
                  3
                </div>
                <div className="space-y-1">
                  <div className="font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                    <span>Windows Masaüstünüzdeki Kısayol</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <p className="text-[11px] text-emerald-800/90 dark:text-emerald-300/90">
                    Bilgisayarınızın masaüstüne <b>"ERP12 Saha Satış"</b> kısayolu yerleştirildi. Masaüstünüzdeki simgeye çift tıklayarak programı doğrudan tarayıcı çubuğu olmadan tam ekran başlatabilirsiniz!
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* MOBİL (TELEFON) KURULUM REHBERİ */}
          {activeTab === 'mobile' && (
            <div className="space-y-3 pt-1">
              <h4 className="font-extrabold text-slate-900 dark:text-white text-xs uppercase tracking-wider text-slate-400">
                Android Chrome / Samsung Internet Adımları:
              </h4>

              {/* Adım 1 */}
              <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                <div className="w-7 h-7 rounded-xl bg-blue-600 text-white font-black flex items-center justify-center shrink-0 text-xs">
                  1
                </div>
                <div className="space-y-0.5">
                  <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span>Sağ Üstteki Menüye Dokunun</span>
                    <span className="p-1 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 inline-flex">
                      <MoreVertical className="w-3.5 h-3.5" />
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Google Chrome veya Samsung Internet tarayıcısının sağ üst köşesindeki <b>üç nokta (⋮)</b> simgesine dokunun.
                  </p>
                </div>
              </div>

              {/* Adım 2 */}
              <div className="flex items-start gap-3 p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/80">
                <div className="w-7 h-7 rounded-xl bg-amber-500 text-slate-950 font-black flex items-center justify-center shrink-0 text-xs">
                  2
                </div>
                <div className="space-y-0.5">
                  <div className="font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5 flex-wrap">
                    <span>"Ana Ekrana Ekle" Seçeneğini Seçin</span>
                    <Download className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <p className="text-[11px] text-amber-800/90 dark:text-amber-300/90">
                    Açılan menüde <b>"Ana ekrana ekle"</b> veya <b>"Uygulamayı yükle"</b> seçeneğine dokunun.
                  </p>
                </div>
              </div>

              {/* Adım 3 */}
              <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                <div className="w-7 h-7 rounded-xl bg-emerald-600 text-white font-black flex items-center justify-center shrink-0 text-xs">
                  3
                </div>
                <div className="space-y-0.5">
                  <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span>"Yükle" Butonuna Basarak Onaylayın</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Gelen onay penceresinde <b>"Yükle"</b> butonuna basın. Birkaç saniye içinde <b>"ERP12 Plasiyer"</b> telefonunuzun ana ekranına bağımsız bir uygulama olarak eklenecektir.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Alt Buton */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex gap-2">
          <button
            onClick={closePwaModal}
            className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition active:scale-95 shadow-md shadow-blue-500/20"
          >
            Anladım, Kapat
          </button>
        </div>
      </div>
    </div>
  );
};
