import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Trophy, 
  Target, 
  Award, 
  Sparkles, 
  X, 
  Banknote, 
  Package, 
  Zap, 
  Share2, 
  Layers
} from 'lucide-react';
import { COMMISSION_TIERS } from '../services/quotaService';

interface PerformanceDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PerformanceDashboardModal: React.FC<PerformanceDashboardModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { 
    salesRep, 
    performanceSummary, 
    quotaTarget, 
    updateQuotaTarget 
  } = useApp();

  const [isEditingTarget, setIsEditingTarget] = useState(false);
  const [revenueTargetInput, setRevenueTargetInput] = useState(quotaTarget.monthlyRevenueTarget.toString());
  const [boxTargetInput, setBoxTargetInput] = useState(quotaTarget.monthlyBoxTarget.toString());
  const [collectionTargetInput, setCollectionTargetInput] = useState(quotaTarget.monthlyCollectionTarget.toString());
  const [copiedToast, setCopiedToast] = useState(false);

  if (!isOpen) return null;

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(val);
  };

  const handleSaveTargets = () => {
    const rev = parseFloat(revenueTargetInput) || quotaTarget.monthlyRevenueTarget;
    const box = parseInt(boxTargetInput, 10) || quotaTarget.monthlyBoxTarget;
    const col = parseFloat(collectionTargetInput) || quotaTarget.monthlyCollectionTarget;

    updateQuotaTarget({
      monthlyRevenueTarget: rev,
      dailyRevenueTarget: Math.round(rev / 22),
      monthlyBoxTarget: box,
      dailyBoxTarget: Math.round(box / 22),
      monthlyCollectionTarget: col,
    });
    setIsEditingTarget(false);
  };

  const handleShareSummary = () => {
    const text = `🏆 *PLASİYER PERFORMANS & PRİM ÖZETİ* 🏆\n` +
      `👤 *Plasiyer:* ${salesRep.name} (${salesRep.code})\n` +
      `📅 *Dönem:* ${performanceSummary.period}\n\n` +
      `🎯 *Ciro Gerçekleşme:* ${formatCurrency(performanceSummary.revenueActual)} / ${formatCurrency(performanceSummary.revenueTarget)} (%${performanceSummary.revenueProgressPercent})\n` +
      `📦 *Koli Hedefi:* ${performanceSummary.boxActual} / ${performanceSummary.boxTarget} Koli (%${performanceSummary.boxProgressPercent})\n` +
      `💰 *Tahsilat Gerçekleşme:* ${formatCurrency(performanceSummary.collectionActual)} / ${formatCurrency(performanceSummary.collectionTarget)} (%${performanceSummary.collectionProgressPercent})\n\n` +
      `🌟 *Aktif Prim Kademesi:* ${performanceSummary.activeTier.badge}\n` +
      `💵 *Tahmini Hak Edilen Prim:* ${formatCurrency(performanceSummary.estimatedCommissionAmount)}\n` +
      `📍 *Ziyaret Başarısı:* %${performanceSummary.visitSuccessRatePercent} (${performanceSummary.successfulVisitsCount}/${performanceSummary.totalVisitsCount} Nokta)\n\n` +
      `_Tarih: ${new Date().toLocaleDateString('tr-TR')}_`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedToast(true);
      setTimeout(() => setCopiedToast(false), 2500);
    }
  };

  // Sonraki kademeye kalan ciro
  const currentTier = performanceSummary.activeTier;
  const nextTier = COMMISSION_TIERS.find(t => t.tierNumber === currentTier.tierNumber + 1);
  const remainingForNextTier = nextTier 
    ? Math.max(0, (quotaTarget.monthlyRevenueTarget * (nextTier.minPercent / 100)) - performanceSummary.revenueActual)
    : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white my-auto max-h-[92vh] flex flex-col overflow-hidden">
        {/* Üst Başlık */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-600 to-yellow-400 text-white flex items-center justify-center shadow-lg shadow-amber-500/30 shrink-0">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black tracking-tight">
                  Kota, Performans & Dinamik Prim Paneli
                </h2>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-500/30">
                  Aşama 10
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5">
                <span>{salesRep.name} ({salesRep.code})</span>
                <span>&bull;</span>
                <span className="font-mono text-slate-700 dark:text-slate-300 font-bold">{performanceSummary.period} Dönemi</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleShareSummary}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition active:scale-95"
              title="Özeti WhatsApp formatında kopyala"
            >
              <Share2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 transition active:scale-95"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Gövde Scroll Alanı */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {copiedToast && (
            <div className="p-2.5 rounded-xl bg-emerald-500 text-white text-xs font-bold text-center animate-fadeIn shadow-md">
              ✓ Performans özeti panoya kopyalandı! WhatsApp veya e-posta ile paylaşabilirsiniz.
            </div>
          )}

          {/* Aktif Kademe ve Hak Edilen Prim Banner'ı */}
          <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-amber-600 via-yellow-600 to-amber-700 text-white shadow-xl relative overflow-hidden space-y-3">
            <div className="absolute -right-6 -bottom-6 w-36 h-36 bg-white/10 rounded-full blur-2xl pointer-events-none" />
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative z-10">
              <div>
                <span className="text-xs text-amber-200 font-bold uppercase tracking-wider block">
                  Aktif Prim Skalası
                </span>
                <div className="text-lg sm:text-xl font-black flex items-center gap-2 mt-0.5">
                  <Award className="w-6 h-6 text-yellow-300" />
                  <span>{currentTier.badge}</span>
                </div>
                <p className="text-xs text-amber-100 mt-1">
                  Gerçekleşen ciro üzerinden <strong>%{currentTier.rate}</strong> prim katsayısı uygulanmaktadır.
                </p>
              </div>

              <div className="bg-white/15 backdrop-blur-md p-3.5 rounded-2xl border border-white/20 text-right shrink-0">
                <span className="text-[11px] text-amber-100 block font-medium">Hak Edilen Tahmini Prim</span>
                <span className="text-2xl sm:text-3xl font-black tracking-tight text-yellow-200 block mt-0.5">
                  {formatCurrency(performanceSummary.estimatedCommissionAmount)}
                </span>
              </div>
            </div>

            {/* Sıradaki Kademeye Teşvik / Upsell */}
            {nextTier && remainingForNextTier > 0 && (
              <div className="p-2.5 rounded-2xl bg-black/25 backdrop-blur-xs border border-white/15 text-xs text-amber-100 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 truncate">
                  <Zap className="w-4 h-4 text-yellow-300 shrink-0 animate-bounce" />
                  <span className="truncate">
                    Sıradaki kademe: <strong>{nextTier.badge}</strong> için sadece <strong>{formatCurrency(remainingForNextTier)}</strong> ciro kaldı!
                  </span>
                </div>
                <span className="text-[11px] font-bold text-yellow-300 shrink-0">
                  +%{((nextTier.rate - currentTier.rate)).toFixed(1)} Ek Prim
                </span>
              </div>
            )}
          </div>

          {/* 3 Ana KPI Kartı (Ciro - Koli - Tahsilat) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Ciro Hedefi */}
            <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 space-y-2.5">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                    <Target className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Ciro Kotası</span>
                    <span className="text-sm font-black text-slate-900 dark:text-white">
                      %{performanceSummary.revenueProgressPercent}
                    </span>
                  </div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  performanceSummary.revenueProgressPercent >= 100 
                    ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600' 
                    : 'bg-amber-100 dark:bg-amber-950 text-amber-600'
                }`}>
                  {performanceSummary.revenueProgressPercent >= 100 ? 'TUTTURULDU' : 'DEVAM EDİYOR'}
                </span>
              </div>

              <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-blue-600 h-full rounded-full transition-all duration-500" 
                  style={{ width: `${Math.min(100, performanceSummary.revenueProgressPercent)}%` }} 
                />
              </div>

              <div className="flex justify-between text-xs pt-1 text-slate-500 dark:text-slate-400">
                <span>Gerçekleşen:</span>
                <strong className="text-slate-900 dark:text-white">{formatCurrency(performanceSummary.revenueActual)}</strong>
              </div>
              <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Aylık Hedef:</span>
                <span className="font-medium">{formatCurrency(performanceSummary.revenueTarget)}</span>
              </div>
            </div>

            {/* Koli / Adet Hedefi */}
            <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 space-y-2.5">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                    <Package className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Koli / Hacim Kotası</span>
                    <span className="text-sm font-black text-slate-900 dark:text-white">
                      %{performanceSummary.boxProgressPercent}
                    </span>
                  </div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  performanceSummary.boxProgressPercent >= 100 
                    ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600' 
                    : 'bg-purple-100 dark:bg-purple-950 text-purple-600'
                }`}>
                  {performanceSummary.boxProgressPercent >= 100 ? 'TUTTURULDU' : 'DEVAM EDİYOR'}
                </span>
              </div>

              <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-purple-600 h-full rounded-full transition-all duration-500" 
                  style={{ width: `${Math.min(100, performanceSummary.boxProgressPercent)}%` }} 
                />
              </div>

              <div className="flex justify-between text-xs pt-1 text-slate-500 dark:text-slate-400">
                <span>Satılan Koli:</span>
                <strong className="text-slate-900 dark:text-white">{performanceSummary.boxActual} Koli</strong>
              </div>
              <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Hedef Koli:</span>
                <span className="font-medium">{performanceSummary.boxTarget} Koli</span>
              </div>
            </div>

            {/* Tahsilat Hedefi */}
            <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 space-y-2.5">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                    <Banknote className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Tahsilat Kotası</span>
                    <span className="text-sm font-black text-slate-900 dark:text-white">
                      %{performanceSummary.collectionProgressPercent}
                    </span>
                  </div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  performanceSummary.collectionProgressPercent >= 100 
                    ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600' 
                    : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600'
                }`}>
                  {performanceSummary.collectionProgressPercent >= 100 ? 'TUTTURULDU' : 'DEVAM EDİYOR'}
                </span>
              </div>

              <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-emerald-600 h-full rounded-full transition-all duration-500" 
                  style={{ width: `${Math.min(100, performanceSummary.collectionProgressPercent)}%` }} 
                />
              </div>

              <div className="flex justify-between text-xs pt-1 text-slate-500 dark:text-slate-400">
                <span>Toplanan:</span>
                <strong className="text-slate-900 dark:text-white">{formatCurrency(performanceSummary.collectionActual)}</strong>
              </div>
              <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Hedef:</span>
                <span className="font-medium">{formatCurrency(performanceSummary.collectionTarget)}</span>
              </div>
            </div>
          </div>

          {/* Kademeli Prim Skalası Tablosu */}
          <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-indigo-600" />
                <span>Kademeli Prim Skalası Şeması</span>
              </span>
              <span className="text-[11px] text-slate-400">Performansa Göre Dinamik Katsayı</span>
            </div>

            <div className="space-y-1.5">
              {COMMISSION_TIERS.map((tier) => {
                const isCurrent = tier.tierNumber === currentTier.tierNumber;
                return (
                  <div
                    key={tier.tierNumber}
                    className={`flex items-center justify-between p-2.5 rounded-2xl text-xs transition ${
                      isCurrent
                        ? 'bg-amber-500/15 border-2 border-amber-500 text-amber-950 dark:text-amber-100 font-bold shadow-xs'
                        : 'bg-white dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${
                        isCurrent ? 'bg-amber-500 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-600'
                      }`}>
                        {tier.tierNumber}
                      </div>
                      <span>{tier.badge}</span>
                      {isCurrent && (
                        <span className="text-[9px] bg-amber-500 text-white px-2 py-0.2 rounded-full font-black uppercase tracking-wider">
                          ŞU AN BURADASINIZ
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        Hedef: %{tier.minPercent} - %{tier.maxPercent === 999 ? '∞' : tier.maxPercent}
                      </span>
                      <span className={`font-extrabold ${isCurrent ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white'}`}>
                        %{tier.rate} Prim
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Gamification / Saha Başarı Rozetleri */}
          <div className="bg-gradient-to-r from-indigo-500/10 via-purple-500/5 to-slate-500/10 border border-indigo-500/20 rounded-3xl p-4 space-y-3">
            <span className="text-xs font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-indigo-500" />
              <span>Saha Başarı Rozetleri & Liyakat</span>
            </span>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="p-3 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-indigo-200/60 dark:border-indigo-800/40 text-center space-y-1">
                <div className="text-2xl">🥇</div>
                <div className="text-xs font-bold text-slate-900 dark:text-white">Ciro Yıldızı</div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">Aylık kota aşımı</div>
              </div>

              <div className="p-3 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-purple-200/60 dark:border-purple-800/40 text-center space-y-1">
                <div className="text-2xl">📦</div>
                <div className="text-xs font-bold text-slate-900 dark:text-white">Koli Şampiyonu</div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">Hacimli sevkiyat</div>
              </div>

              <div className="p-3 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-emerald-200/60 dark:border-emerald-800/40 text-center space-y-1">
                <div className="text-2xl">💳</div>
                <div className="text-xs font-bold text-slate-900 dark:text-white">Tahsilat Ustası</div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">Sıfır vadesi geciken</div>
              </div>

              <div className="p-3 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-teal-200/60 dark:border-teal-800/40 text-center space-y-1">
                <div className="text-2xl">📍</div>
                <div className="text-xs font-bold text-slate-900 dark:text-white">Geofence Disiplini</div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">%100 yerinde check-in</div>
              </div>
            </div>
          </div>

          {/* Kota Düzenleme Bölümü (Yönetici / Plasiyer Hedef Güncelleme) */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-3xl p-4 bg-slate-50/50 dark:bg-slate-900/40 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Hedef & Kota Parametreleri
              </span>
              <button
                onClick={() => setIsEditingTarget(!isEditingTarget)}
                className="text-xs text-blue-600 dark:text-blue-400 font-bold hover:underline"
              >
                {isEditingTarget ? 'Vazgeç' : 'Hedefleri Düzenle'}
              </button>
            </div>

            {isEditingTarget ? (
              <div className="space-y-3 pt-2">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">Aylık Ciro Hedefi (₺)</label>
                    <input
                      type="number"
                      value={revenueTargetInput}
                      onChange={(e) => setRevenueTargetInput(e.target.value)}
                      className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">Aylık Koli Hedefi</label>
                    <input
                      type="number"
                      value={boxTargetInput}
                      onChange={(e) => setBoxTargetInput(e.target.value)}
                      className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">Aylık Tahsilat Hedefi (₺)</label>
                    <input
                      type="number"
                      value={collectionTargetInput}
                      onChange={(e) => setCollectionTargetInput(e.target.value)}
                      className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
                <button
                  onClick={handleSaveTargets}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition shadow-xs"
                >
                  Yeni Hedefleri Kaydet
                </button>
              </div>
            ) : (
              <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
                <span>Günlük Ciro Hedefi: <strong>{formatCurrency(quotaTarget.dailyRevenueTarget)}</strong></span>
                <span>Günlük Koli: <strong>{quotaTarget.dailyBoxTarget} Adet</strong></span>
                <span>Ziyaret Başarısı: <strong>%{performanceSummary.visitSuccessRatePercent}</strong></span>
              </div>
            )}
          </div>
        </div>

        {/* Alt Buton */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-2xl text-xs shadow-md transition active:scale-95"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
};
