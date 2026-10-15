import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { db } from '../db';
import type { Order } from '../types';
import { 
  Trash2, 
  Plus, 
  Minus, 
  ShoppingBag, 
  CheckCircle, 
  AlertCircle, 
  Calendar, 
  FileText, 
  UserPlus, 
  Send, 
  Wifi, 
  WifiOff, 
  Percent, 
  ChevronRight,
  Sparkles,
  Printer,
  Gift,
  TrendingUp,
  Truck,
  Flame,
  Snowflake
} from 'lucide-react';

export const CartPage: React.FC = () => {
  const { 
    userRole,
    currentCustomerUser,
    selectedCustomer, 
    cart, 
    cartSummary, 
    updateCartItemQuantity, 
    updateCartItemDiscount, 
    removeFromCart, 
    clearCart,
    submitCurrentOrder,
    isOnline,
    setActiveTab,
    openPrintSlip,
    openCampaignsModal,
    saleMode,
    setSaleMode,
    vanPlate,
    getVanStockByCode
  } = useApp();

  const [deliveryDate, setDeliveryDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [orderNotes, setOrderNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderSuccessModal, setOrderSuccessModal] = useState<{
    show: boolean;
    orderId?: number;
    tempId?: string;
    savedOrder?: Order | null;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeCustomer = userRole === 'customer' ? currentCustomerUser : selectedCustomer;

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 2,
    }).format(val);
  };

  const handleSubmit = async () => {
    if (!activeCustomer) {
      setErrorMessage('Lütfen önce bir müşteri (cari) seçiniz.');
      return;
    }
    if (cart.length === 0) {
      setErrorMessage('Sepetiniz boş. Lütfen ürün ekleyiniz.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const result = await submitCurrentOrder(deliveryDate, orderNotes);
    setIsSubmitting(false);

    if (result.success) {
      let savedOrder: Order | null = null;
      if (result.orderId) {
        savedOrder = (await db.orders.get(result.orderId)) || null;
      }
      setOrderSuccessModal({
        show: true,
        orderId: result.orderId,
        savedOrder,
      });
      setOrderNotes('');
    } else {
      setErrorMessage(result.error || 'Sipariş kaydedilirken bir hata oluştu.');
    }
  };

  if (cart.length === 0 && !orderSuccessModal) {
    return (
      <div className="p-4 pb-24 max-w-lg mx-auto min-h-[70vh] flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center text-slate-400 dark:text-slate-500 mb-3">
          <ShoppingBag className="w-8 h-8" />
        </div>
        <h2 className="text-base font-bold text-slate-800 dark:text-white">Sepetiniz Boş</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs">
          {userRole === 'customer'
            ? 'Size özel toptan fiyatlarla sipariş oluşturmak için vitrindeki ürünleri inceleyebilirsiniz.'
            : 'Müşteriniz için sipariş oluşturmak üzere ürün kataloğuna gidip ürün ekleyebilirsiniz.'}
        </p>
        <button
          onClick={() => setActiveTab('catalog')}
          className={`mt-4 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-sm transition active:scale-95 flex items-center gap-1.5 ${
            userRole === 'customer'
              ? 'bg-emerald-600 hover:bg-emerald-700'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          <span>Ürün Vitrinine Git</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="p-3 pb-28 space-y-3 max-w-lg mx-auto w-full max-w-full overflow-x-hidden">
      {/* Cari Bilgisi Uyarısı veya Başlığı */}
      {!activeCustomer ? (
        <div className="bg-amber-500/10 dark:bg-amber-950/30 border border-amber-500/30 dark:border-amber-800/50 rounded-xl p-3 flex items-center justify-between text-xs text-amber-900 dark:text-amber-300">
          <div>
            <span className="font-bold block">Sipariş İçin Cari Seçilmedi!</span>
            <span className="text-[11px] text-amber-800 dark:text-amber-400">Siparişi onaylamak için cari seçmelisiniz.</span>
          </div>
          <button
            onClick={() => setActiveTab('customers')}
            className="flex items-center gap-1 bg-amber-600 hover:bg-amber-700 text-white font-medium px-2.5 py-1.5 rounded-lg shadow-xs"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Cari Seç</span>
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-xs transition space-y-2.5">
          <div className="flex justify-between items-start">
            <div className="truncate mr-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {userRole === 'customer' ? 'Sipariş Veren Bayi' : 'Cari Bilgisi'}
              </span>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white mt-0.5 truncate">{activeCustomer.name}</h3>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">{activeCustomer.code}</div>
            </div>
            <div className="text-right shrink-0">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 block">Güncel Bakiye</span>
              <span
                className={`text-xs font-extrabold ${
                  activeCustomer.balance > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {formatCurrency(activeCustomer.balance)}
              </span>
            </div>
          </div>

          {/* AŞAMA 8: Plasiyer Satış Modu Seçici (Soğuk vs Sıcak) */}
          {userRole === 'plasiyer' && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Truck className="w-4 h-4 text-slate-400" />
                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  Satış Tipi:
                </span>
                <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                  {vanPlate}
                </span>
              </div>
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setSaleMode('cold')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition ${
                    saleMode === 'cold'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <Snowflake className="w-3.5 h-3.5" />
                  <span>Soğuk (Merkez)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSaleMode('hot')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition ${
                    saleMode === 'hot'
                      ? 'bg-gradient-to-r from-amber-500 to-rose-500 text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <Flame className="w-3.5 h-3.5" />
                  <span>Sıcak (Araçtan)</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* AŞAMA 7: Uygulanan Kampanyalar & Hediye Banner'ı */}
      {cartSummary.appliedCampaigns.length > 0 && (
        <div className="bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-teal-500/10 border border-emerald-500/30 rounded-2xl p-3.5 space-y-2 animate-fadeIn">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
              <Gift className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Kazanılan Kampanyalar ({cartSummary.appliedCampaigns.length})</span>
            </span>
            <span className="text-xs font-extrabold text-emerald-700 dark:text-emerald-300">
              +{formatCurrency(cartSummary.totalCampaignSavings)} Tasarruf
            </span>
          </div>
          <div className="space-y-1.5">
            {cartSummary.appliedCampaigns.map((ac, idx) => (
              <div key={idx} className="flex items-center justify-between text-[11px] text-emerald-950 dark:text-emerald-100 bg-white/80 dark:bg-slate-900/80 p-2 rounded-xl border border-emerald-200/60 dark:border-emerald-800/50 shadow-2xs">
                <span className="font-semibold flex items-center gap-1.5 truncate mr-2">
                  <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold shrink-0">
                    {ac.badge}
                  </span>
                  <span className="truncate">{ac.campaignTitle}</span>
                </span>
                <span className="font-bold text-emerald-700 dark:text-emerald-400 shrink-0">
                  {ac.benefitDescription}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AŞAMA 7: Kaçırılmayacak Kampanya Fırsatları (Upsell / Teşvik) */}
      {cartSummary.opportunities.length > 0 && (
        <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-orange-500/10 border border-amber-500/30 rounded-2xl p-3.5 space-y-2 animate-fadeIn">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800 dark:text-amber-300">
              <TrendingUp className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>Hediye ve İskonto Hedefleri</span>
            </div>
            <button
              onClick={() => openCampaignsModal()}
              className="text-[10px] font-bold text-amber-700 dark:text-amber-300 hover:underline"
            >
              Tüm Fırsatlar
            </button>
          </div>
          <div className="space-y-1.5">
            {cartSummary.opportunities.map((opp, idx) => (
              <div key={idx} className="text-[11px] text-amber-950 dark:text-amber-100 bg-white/80 dark:bg-slate-900/80 p-2.5 rounded-xl border border-amber-200/60 dark:border-amber-800/50 space-y-1.5 shadow-2xs">
                <div className="flex justify-between font-bold text-xs">
                  <span className="flex items-center gap-1">
                    <span>{opp.campaign.badge}</span>
                    <span className="truncate">{opp.campaign.title}</span>
                  </span>
                  <span className="text-amber-600 dark:text-amber-400">%{opp.progressPercent}</span>
                </div>
                <div className="w-full h-1.5 bg-amber-100 dark:bg-amber-950/60 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full transition-all duration-500" style={{ width: `${opp.progressPercent}%` }} />
                </div>
                <p className="text-[10px] text-amber-800 dark:text-amber-300 font-medium leading-relaxed">{opp.hint}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sepet Başlığı ve Aksiyonlar */}
      <div className="flex justify-between items-center px-1">
        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
          Sipariş Kalemleri ({cartSummary.totalItems} Adet)
        </span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => openCampaignsModal()}
            className="text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 font-bold flex items-center gap-1"
          >
            <Gift className="w-3.5 h-3.5" />
            <span>Kampanyalar</span>
          </button>
          <button
            onClick={clearCart}
            className="text-xs text-rose-600 dark:text-rose-400 hover:text-rose-700 font-medium flex items-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Sepeti Temizle</span>
          </button>
        </div>
      </div>

      {/* Sepetteki Kalemler */}
      <div className="space-y-2">
        {cart.map((item) => (
          <div
            key={item.productId}
            className={`rounded-2xl p-3.5 border shadow-xs space-y-2 transition ${
              item.isGift
                ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800/80 ring-1 ring-emerald-500/20'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
            }`}
          >
            <div className="flex justify-between items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">{item.productCode}</span>
                  {item.isGift && (
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-600 text-white flex items-center gap-0.5">
                      <Gift className="w-3 h-3" />
                      <span>BEDELSİZ HEDİYE</span>
                    </span>
                  )}
                </div>
                <h4 className="font-bold text-xs text-slate-900 dark:text-white leading-snug mt-0.5">{item.productName}</h4>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5">
                  {item.isGift ? (
                    <>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">0,00 ₺ (BEDELSİZ)</span>
                      {item.originalUnitPrice && (
                        <span className="line-through text-slate-400 text-[10px]">
                          Liste: {formatCurrency(item.originalUnitPrice)}
                        </span>
                      )}
                    </>
                  ) : (
                    <span>Birim: {formatCurrency(item.unitPrice)} | KDV: %{item.vatRate}</span>
                  )}
                </div>
                {item.campaignTitle && (
                  <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold block mt-0.5">
                    🎁 {item.campaignTitle}
                  </span>
                )}

                {/* AŞAMA 8: Sıcak Satış Araç Stok Uyarısı */}
                {userRole === 'plasiyer' && saleMode === 'hot' && (() => {
                  const inVan = getVanStockByCode(item.productCode);
                  const isSufficient = inVan >= item.quantity;
                  return (
                    <div className={`mt-1.5 text-[10px] font-bold px-2 py-1 rounded-lg flex items-center gap-1.5 ${
                      isSufficient
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                        : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                    }`}>
                      <Truck className="w-3 h-3 shrink-0" />
                      {isSufficient ? (
                        <span>Araçta Yeterli: {inVan} {item.unit} mevcut (Talep: {item.quantity})</span>
                      ) : (
                        <span>⚠️ Araç Stoğu Yetersiz! Araçta sadece {inVan} {item.unit} var ({item.quantity - inVan} adet eksik)</span>
                      )}
                    </div>
                  );
                })()}
              </div>

              {!item.isGift ? (
                <button
                  onClick={() => removeFromCart(item.productId)}
                  className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 p-1 rounded-lg"
                  title="Ürünü Çıkar"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              ) : (
                <span className="text-emerald-600 dark:text-emerald-400 p-1" title="Otomatik Promosyon Ürünü">
                  <Gift className="w-4 h-4" />
                </span>
              )}
            </div>

            {/* İskonto & Miktar Ayarı */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
              {item.isGift ? (
                <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300">
                  %100 Promosyon İndirimi
                </span>
              ) : userRole === 'plasiyer' ? (
                <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-1 rounded-lg">
                  <Percent className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">İsk:</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={item.discountPercent}
                    onChange={(e) =>
                      updateCartItemDiscount(item.productId, parseFloat(e.target.value) || 0)
                    }
                    className="w-10 bg-transparent text-xs font-bold text-slate-800 dark:text-white text-center focus:outline-none"
                  />
                  <span className="text-[11px] text-slate-400">%</span>
                </div>
              ) : item.discountPercent > 0 ? (
                <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 px-2 py-1 rounded-lg font-bold">
                  %{item.discountPercent} Bayi İndirimi
                </span>
              ) : <span />}

              {/* Miktar Stepper */}
              <div className="flex items-center gap-2">
                {item.isGift ? (
                  <div className="px-2.5 py-1 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 font-bold text-xs">
                    {item.quantity} {item.unit}
                  </div>
                ) : (
                  <div className={`flex items-center rounded-xl p-0.5 ${
                    userRole === 'customer'
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60'
                      : 'bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60'
                  }`}>
                    <button
                      onClick={() => updateCartItemQuantity(item.productId, item.quantity - 1)}
                      className="w-6 h-6 bg-white dark:bg-slate-800 text-slate-700 dark:text-white rounded-lg flex items-center justify-center font-bold shadow-xs active:scale-90"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="font-bold text-xs text-slate-900 dark:text-white w-8 text-center">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateCartItemQuantity(item.productId, item.quantity + 1)}
                      className={`w-6 h-6 text-white rounded-lg flex items-center justify-center font-bold shadow-xs active:scale-90 ${
                        userRole === 'customer' ? 'bg-emerald-600' : 'bg-blue-600'
                      }`}
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {/* Kalem Toplamı */}
                <div className="text-right min-w-[70px]">
                  <span className={`font-extrabold text-xs block ${item.isGift ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-white'}`}>
                    {item.isGift ? '0,00 ₺' : formatCurrency(item.grandTotal)}
                  </span>
                  <span className="text-[9px] text-slate-400 dark:text-slate-500 block">
                    {item.isGift ? 'Hediye' : 'KDV Dahil'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Sipariş Ekstra Bilgileri (Teslimat Tarihi ve Not) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-3.5 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2 text-xs transition">
        <div>
          <label className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-300 mb-1">
            <Calendar className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>İstenen Teslimat Tarihi</span>
          </label>
          <input
            type="date"
            value={deliveryDate}
            onChange={(e) => setDeliveryDate(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-300 mb-1">
            <FileText className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Sipariş Notu / Sevkiyat Talimatı</span>
          </label>
          <textarea
            rows={2}
            value={orderNotes}
            onChange={(e) => setOrderNotes(e.target.value)}
            placeholder="Depo teslimatı, ödeme vadesi veya özel sevkiyat notu..."
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl p-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-slate-400 dark:placeholder-slate-500"
          />
        </div>
      </div>

      {/* Finansal Özet Tablosu */}
      <div className="bg-slate-900 dark:bg-slate-950 text-white rounded-2xl p-4 shadow-sm space-y-2 text-xs border border-slate-800">
        <div className="flex justify-between text-slate-400">
          <span>Ara Toplam (Brüt)</span>
          <span className="font-mono">{formatCurrency(cartSummary.subtotal)}</span>
        </div>

        {cartSummary.campaignDiscountAmount > 0 && (
          <div className="flex justify-between text-purple-400 font-semibold items-center">
            <span className="flex items-center gap-1">
              <Gift className="w-3.5 h-3.5" />
              <span>Kampanya İskontosu</span>
            </span>
            <span className="font-mono">- {formatCurrency(cartSummary.campaignDiscountAmount)}</span>
          </div>
        )}

        {cartSummary.totalDiscount > 0 && (
          <div className="flex justify-between text-emerald-400 font-semibold items-center">
            <span className="flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Toplam İskonto Tasarrufu</span>
            </span>
            <span className="font-mono">- {formatCurrency(cartSummary.totalDiscount)}</span>
          </div>
        )}

        {cartSummary.totalCampaignSavings > 0 && (
          <div className="flex justify-between text-teal-300 font-bold items-center py-1 px-2 rounded-lg bg-teal-950/60 border border-teal-800/50">
            <span className="flex items-center gap-1">
              <Gift className="w-3.5 h-3.5" />
              <span>Toplam Kampanya Avantajınız</span>
            </span>
            <span className="font-mono text-emerald-300 font-extrabold">+ {formatCurrency(cartSummary.totalCampaignSavings)}</span>
          </div>
        )}

        <div className="flex justify-between text-slate-400">
          <span>Toplam KDV</span>
          <span className="font-mono">{formatCurrency(cartSummary.totalVat)}</span>
        </div>

        <div className="pt-2 border-t border-slate-800 flex justify-between items-baseline font-bold text-sm">
          <span>Genel Toplam (Net)</span>
          <span className="text-base text-emerald-400 font-extrabold font-mono">
            {formatCurrency(cartSummary.grandTotal)}
          </span>
        </div>
      </div>

      {/* Hata Mesajı */}
      {errorMessage && (
        <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 rounded-xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Çevrimdışı / Çevrimiçi Durum Notu ve Gönder Butonu */}
      <div className="space-y-2">
        <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
          {isOnline ? (
            <>
              <Wifi className="w-3.5 h-3.5 text-emerald-500" />
              <span>Çevrimiçi: Sipariş anında merkeze ve yetkililere iletilecek.</span>
            </>
          ) : (
            <>
              <WifiOff className="w-3.5 h-3.5 text-amber-500" />
              <span>Çevrimdışı: Sipariş cihaz hafızasında saklanıp bağlantı gelince iletilecektir.</span>
            </>
          )}
        </div>

        <button
          onClick={handleSubmit}
          disabled={isSubmitting || !activeCustomer}
          className={`w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 shadow-md transition active:scale-95 text-white ${
            isSubmitting || !activeCustomer
              ? 'bg-slate-300 dark:bg-slate-800 text-slate-500 cursor-not-allowed'
              : userRole === 'customer'
              ? 'bg-emerald-600 hover:bg-emerald-700'
              : saleMode === 'hot'
              ? 'bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-700 hover:to-rose-700 shadow-amber-500/20'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {saleMode === 'hot' && userRole === 'plasiyer' ? (
            <Flame className="w-4 h-4 animate-pulse" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          <span>
            {isSubmitting
              ? 'Kaydediliyor...'
              : userRole === 'customer'
              ? 'Siparişi Tamamla & Onayla'
              : saleMode === 'hot'
              ? '🔥 Sıcak Satışı Onayla & Fiş Kes (Araçtan Teslim)'
              : 'Siparişi Onayla & Gönder'}
          </span>
        </button>
      </div>

      {/* Başarı Modalı */}
      {orderSuccessModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 max-w-sm w-full text-center space-y-3 shadow-2xl border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white">
            <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="w-8 h-8" />
            </div>
            <h3 className="text-base font-bold">Sipariş Başarıyla Alındı!</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isOnline
                ? 'Sipariş sisteme iletildi. Yetkili onayının ardından faturalandırma ve sevkiyat başlayacaktır.'
                : 'Sipariş cihaz hafızasına kaydedildi. İnternet bağlantısı sağlandığında otomatik senkronize edilecektir.'}
            </p>

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              {orderSuccessModal.savedOrder && (
                <button
                  type="button"
                  onClick={() => {
                    const ord = orderSuccessModal.savedOrder;
                    setOrderSuccessModal(null);
                    if (ord) {
                      openPrintSlip({ type: 'order', orderData: ord });
                    }
                  }}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2.5 rounded-xl transition flex items-center justify-center gap-1.5 shadow-md active:scale-95"
                >
                  <Printer className="w-4 h-4" />
                  <span>Fiş Yazdır</span>
                </button>
              )}
              <button
                onClick={() => {
                  setOrderSuccessModal(null);
                  setActiveTab('orders');
                }}
                className="flex-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-white text-xs font-bold py-2.5 rounded-xl transition"
              >
                Siparişleri Gör
              </button>
              <button
                onClick={() => {
                  setOrderSuccessModal(null);
                  setActiveTab('catalog');
                }}
                className={`flex-1 text-white text-xs font-bold py-2.5 rounded-xl transition ${
                  userRole === 'customer'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                Vitrini İncele
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
