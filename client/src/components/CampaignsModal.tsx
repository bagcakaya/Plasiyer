import React from 'react';
import { useApp } from '../context/AppContext';
import { 
  X, 
  Gift, 
  Sparkles, 
  TrendingUp, 
  ShoppingBag, 
  CheckCircle2, 
  ArrowRight,
  Clock,
  Percent
} from 'lucide-react';

export const CampaignsModal: React.FC = () => {
  const { 
    isCampaignsModalOpen, 
    closeCampaignsModal, 
    campaigns, 
    cart, 
    cartSummary,
    setActiveTab 
  } = useApp();

  if (!isCampaignsModalOpen) return null;

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 2,
    }).format(val);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Başlığı */}
        <div className="p-4 bg-gradient-to-r from-purple-700 via-indigo-600 to-blue-600 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-white/20 border border-white/30 flex items-center justify-center">
              <Gift className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold tracking-tight">Aktif Saha Kampanyaları</h2>
                <span className="bg-white/20 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                  {campaigns.length} Fırsat
                </span>
              </div>
              <span className="text-[11px] text-white/80 block">
                Plasiyer ve Bayilere Özel Otomatik Promosyonlar
              </span>
            </div>
          </div>

          <button
            onClick={closeCampaignsModal}
            className="p-1.5 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sepette Kazanılan Kampanyalar Özeti */}
        {cartSummary.appliedCampaigns.length > 0 && (
          <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border-b border-emerald-100 dark:border-emerald-900/50 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="truncate">
                <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 block truncate">
                  {cartSummary.appliedCampaigns.length} Kampanya Koşulu Sağlandı!
                </span>
                <span className="text-[11px] text-emerald-700 dark:text-emerald-400">
                  Toplam Tasarrufunuz: <strong className="font-extrabold">{formatCurrency(cartSummary.totalCampaignSavings)}</strong>
                </span>
              </div>
            </div>
            <button
              onClick={() => {
                closeCampaignsModal();
                setActiveTab('cart');
              }}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shrink-0 flex items-center gap-1 shadow-xs transition"
            >
              <span>Sepette Gör</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Kampanya Listesi */}
        <div className="p-4 space-y-3 overflow-y-auto flex-1">
          {campaigns.map((camp) => {
            // Sepette bu kampanyadan kaç adet kazanıldı?
            const applied = cartSummary.appliedCampaigns.find((a) => a.campaignId === camp.id);
            // Ya da fırsat var mı?
            const opp = cartSummary.opportunities.find((o) => o.campaign.id === camp.id);

            // Mevcut sepetteki ürün adedi
            let currentQuantityInCart = 0;
            if (camp.targetProductId) {
              currentQuantityInCart = cart
                .filter((i) => i.productId === camp.targetProductId && !i.isGift)
                .reduce((sum, i) => sum + i.quantity, 0);
            }

            return (
              <div
                key={camp.id}
                className={`rounded-2xl border p-4 transition space-y-3 ${
                  applied
                    ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/60 ring-1 ring-emerald-500/20'
                    : 'bg-white dark:bg-slate-850 border-slate-200 dark:border-slate-750 hover:border-slate-300 dark:hover:border-slate-700 shadow-xs'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/50">
                        {camp.badge}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                        {camp.code}
                      </span>
                      {applied && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 flex items-center gap-1 border border-emerald-200 dark:border-emerald-800/60">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Sepete Uygulandı</span>
                        </span>
                      )}
                    </div>

                    <h3 className="font-bold text-sm text-slate-900 dark:text-white mt-1.5">
                      {camp.title}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                      {camp.description}
                    </p>
                  </div>
                </div>

                {/* Koşul / İlerleme Çubuğu */}
                {camp.type === 'quantity_gift' || camp.type === 'cross_product_gift' ? (
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-750 text-xs space-y-2">
                    <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                      <span className="font-semibold">Hedef: {camp.minQuantity} Adet Alım</span>
                      <span className="font-mono font-bold">
                        Sepette: {currentQuantityInCart} / {camp.minQuantity} Adet
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 rounded-full ${
                          currentQuantityInCart >= (camp.minQuantity || 1)
                            ? 'bg-emerald-500'
                            : 'bg-indigo-600'
                        }`}
                        style={{
                          width: `${Math.min(100, Math.round((currentQuantityInCart / (camp.minQuantity || 1)) * 100))}%`,
                        }}
                      />
                    </div>

                    {opp && (
                      <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1">
                        <TrendingUp className="w-3 h-3 shrink-0" />
                        <span>{opp.hint}</span>
                      </p>
                    )}

                    {applied && (
                      <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 shrink-0" />
                        <span>{applied.benefitDescription}</span>
                      </p>
                    )}
                  </div>
                ) : camp.type === 'cart_threshold_discount' ? (
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-750 text-xs space-y-2">
                    <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                      <span className="font-semibold">Barem: {formatCurrency(camp.minCartAmount || 5000)} Sepet Tutarı</span>
                      <span className="font-mono font-bold">
                        Mevcut: {formatCurrency(cartSummary.subtotal - cartSummary.totalDiscount + cartSummary.campaignDiscountAmount)}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 rounded-full ${
                          applied ? 'bg-emerald-500' : 'bg-blue-600'
                        }`}
                        style={{
                          width: `${Math.min(
                            100,
                            Math.round(
                              ((cartSummary.subtotal - cartSummary.totalDiscount + cartSummary.campaignDiscountAmount) /
                                (camp.minCartAmount || 5000)) *
                                100
                            )
                          )}%`,
                        }}
                      />
                    </div>

                    {opp && (
                      <p className="text-[11px] font-medium text-blue-700 dark:text-blue-400 flex items-center gap-1">
                        <Percent className="w-3 h-3 shrink-0" />
                        <span>{opp.hint}</span>
                      </p>
                    )}

                    {applied && (
                      <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 shrink-0" />
                        <span>{applied.benefitDescription}</span>
                      </p>
                    )}
                  </div>
                ) : null}

                {/* Alt Aksiyon Butonu */}
                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>31 Aralık 2026'ya kadar geçerli</span>
                  </span>

                  <button
                    onClick={() => {
                      closeCampaignsModal();
                      setActiveTab('catalog');
                    }}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold flex items-center gap-1.5 transition active:scale-95"
                  >
                    <ShoppingBag className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Ürünleri İncele</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Alt Çubuk */}
        <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Sepette koşulları sağlanan hediyeler <strong>0 ₺</strong> olarak otomatik eklenir.
          </span>
          <button
            onClick={closeCampaignsModal}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750 transition"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
};
