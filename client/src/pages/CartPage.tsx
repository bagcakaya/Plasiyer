import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { db } from '../db';
import type { Order, OrderItem } from '../types';
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
  Snowflake,
  Search,
  RefreshCw,
  UserX
} from 'lucide-react';

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    minimumFractionDigits: 2,
  }).format(val);
};

const formatNumberTr = (val: number) => {
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val);
};

const toRawEditableNumber = (val: number) => {
  if (!val || val <= 0) return '';
  return Number.isInteger(val) ? String(val) : val.toFixed(2).replace('.', ',');
};

const parseTurkishFloat = (valStr: string): number => {
  if (!valStr) return 0;
  let cleaned = valStr.replace(/\s/g, '').replace(/₺/g, '');
  if (cleaned.includes(',')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    const dotCount = (cleaned.match(/\./g) || []).length;
    if (dotCount > 1) {
      cleaned = cleaned.replace(/\./g, '');
    }
  }
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
};

interface CartItemRowProps {
  item: OrderItem;
  userRole: string;
  saleMode: 'hot' | 'cold';
  removeFromCart: (productId: string) => void;
  updateCartItemQuantity: (productId: string, quantity: number) => void;
  updateCartItemPrice: (productId: string, unitPrice: number) => void;
  updateCartItemDiscount: (productId: string, discountPercent: number) => void;
  updateCartItemVatRate: (productId: string, vatRate: number) => void;
  updateCartItemNetTotal: (productId: string, netTotal: number) => void;
  getVanStockByCode: (productCode: string) => number;
}

const CartItemRow: React.FC<CartItemRowProps> = ({
  item,
  userRole,
  saleMode,
  removeFromCart,
  updateCartItemQuantity,
  updateCartItemPrice,
  updateCartItemDiscount,
  updateCartItemVatRate,
  updateCartItemNetTotal,
  getVanStockByCode,
}) => {
  // Birim fiyat yerel metin durumu
  const [unitPriceStr, setUnitPriceStr] = useState<string>(formatNumberTr(item.unitPrice));
  const [isUnitPriceFocused, setIsUnitPriceFocused] = useState(false);

  // İskonto yerel metin durumu
  const [discountStr, setDiscountStr] = useState<string>(
    item.discountPercent > 0 ? String(item.discountPercent) : ''
  );
  const [isDiscountFocused, setIsDiscountFocused] = useState(false);

  // KDV oranı yerel metin durumu
  const [vatRateStr, setVatRateStr] = useState<string>(String(item.vatRate ?? 0));
  const [isVatFocused, setIsVatFocused] = useState(false);

  // Tutar (KDV hariç satır tutarı) yerel metin durumu
  const [totalStr, setTotalStr] = useState<string>(formatNumberTr(item.totalAmount));
  const [isTotalFocused, setIsTotalFocused] = useState(false);

  // Input odaklı değilken güncel değeri binlik ayraçlı net formatla senkronize et
  useEffect(() => {
    if (!isUnitPriceFocused) {
      setUnitPriceStr(formatNumberTr(item.unitPrice));
    }
  }, [item.unitPrice, isUnitPriceFocused]);

  useEffect(() => {
    if (!isDiscountFocused) {
      setDiscountStr(item.discountPercent > 0 ? String(item.discountPercent) : '');
    }
  }, [item.discountPercent, isDiscountFocused]);

  useEffect(() => {
    if (!isVatFocused) {
      setVatRateStr(String(item.vatRate ?? 0));
    }
  }, [item.vatRate, isVatFocused]);

  useEffect(() => {
    if (!isTotalFocused) {
      setTotalStr(formatNumberTr(item.totalAmount));
    }
  }, [item.totalAmount, isTotalFocused]);

  const handleUnitPriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setUnitPriceStr(raw);
    if (raw.trim() === '') return;
    const val = parseTurkishFloat(raw);
    if (!isNaN(val) && val >= 0) {
      updateCartItemPrice(item.productId, val);
    }
  };

  const handleUnitPriceBlur = () => {
    setIsUnitPriceFocused(false);
    const val = parseTurkishFloat(unitPriceStr);
    if (unitPriceStr.trim() === '' || isNaN(val) || val < 0) {
      setUnitPriceStr(formatNumberTr(item.unitPrice));
    } else {
      updateCartItemPrice(item.productId, val);
      setUnitPriceStr(formatNumberTr(val));
    }
  };

  const handleDiscountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setDiscountStr(raw);
    if (raw.trim() === '') {
      updateCartItemDiscount(item.productId, 0);
      return;
    }
    const val = parseTurkishFloat(raw);
    if (!isNaN(val) && val >= 0 && val <= 100) {
      updateCartItemDiscount(item.productId, val);
    }
  };

  const handleDiscountBlur = () => {
    setIsDiscountFocused(false);
    if (discountStr.trim() === '' || isNaN(parseTurkishFloat(discountStr))) {
      updateCartItemDiscount(item.productId, 0);
      setDiscountStr('');
    }
  };

  const handleVatChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setVatRateStr(raw);
    if (raw.trim() === '') {
      updateCartItemVatRate(item.productId, 0);
      return;
    }
    const val = parseTurkishFloat(raw);
    if (!isNaN(val) && val >= 0 && val <= 100) {
      updateCartItemVatRate(item.productId, val);
    }
  };

  const handleVatBlur = () => {
    setIsVatFocused(false);
    const val = parseTurkishFloat(vatRateStr);
    if (vatRateStr.trim() === '' || isNaN(val) || val < 0) {
      updateCartItemVatRate(item.productId, 0);
      setVatRateStr('0');
    } else {
      const clamped = Math.min(100, val);
      updateCartItemVatRate(item.productId, clamped);
      setVatRateStr(String(clamped));
    }
  };

  const handleTotalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setTotalStr(raw);
    if (raw.trim() === '') {
      updateCartItemDiscount(item.productId, 0);
      return;
    }
    const val = parseTurkishFloat(raw);
    if (!isNaN(val) && val >= 0) {
      updateCartItemNetTotal(item.productId, val);
    }
  };

  const handleTotalBlur = () => {
    setIsTotalFocused(false);
    if (totalStr.trim() === '' || isNaN(parseTurkishFloat(totalStr))) {
      updateCartItemDiscount(item.productId, 0);
      setTotalStr(formatNumberTr(item.totalAmount));
    } else {
      setTotalStr(formatNumberTr(item.totalAmount));
    }
  };

  const formattedTotalLen = totalStr.length;
  const totalFontSizeClass =
    formattedTotalLen > 12
      ? 'text-[11px]'
      : formattedTotalLen > 9
      ? 'text-xs'
      : 'text-sm';

  return (
    <div
      className={`rounded-2xl p-3.5 border shadow-xs space-y-2.5 transition ${
        item.isGift
          ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800/80 ring-1 ring-emerald-500/20'
          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
      }`}
    >
      <div className="flex justify-between items-start gap-2">
        <div className="flex-1 min-w-0">
          {item.isGift && (
            <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-600 text-white flex items-center gap-0.5">
                <Gift className="w-3 h-3" />
                <span>BEDELSİZ HEDİYE</span>
              </span>
            </div>
          )}
          <h4 className="font-black text-[16px] sm:text-lg text-slate-900 dark:text-white leading-snug tracking-tight">
            {item.productName}
          </h4>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
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
              <>
                <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500">
                  {item.productCode} • {item.unit}
                </span>
                {item.discountPercent > 0 && (
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold text-[10px]">
                    İskontolu Birim: {formatCurrency(item.netPrice)}
                  </span>
                )}
              </>
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
            type="button"
            onClick={() => removeFromCart(item.productId)}
            className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 p-1 rounded-lg shrink-0"
            title="Ürünü Çıkar"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        ) : (
          <span className="text-emerald-600 dark:text-emerald-400 p-1 shrink-0" title="Otomatik Promosyon Ürünü">
            <Gift className="w-4 h-4" />
          </span>
        )}
      </div>

      {/* Birim Adet Fiyatı, İskonto, Adet ve KDV Dahil Tutar Alanları */}
      {item.isGift ? (
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs gap-2">
          <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300">
            %100 Promosyon İndirimi
          </span>
          <div className="px-2.5 py-1 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 font-bold text-xs">
            {item.quantity} {item.unit}
          </div>
          <div className="text-right">
            <span className="font-extrabold text-xs block text-emerald-600 dark:text-emerald-400">0,00 ₺</span>
            <span className="text-[9px] text-slate-400 dark:text-slate-500 block">Hediye</span>
          </div>
        </div>
      ) : (
        <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 space-y-2.5 text-xs">
          {/* ÜST SATIR: Birim Fiyat, İskonto ve KDV Oranı yan yana */}
          <div className="grid grid-cols-3 gap-2">
            {/* 1. BİRİM FİYAT */}
            <div className="space-y-1 min-w-0">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide block truncate">
                Birim Fiyat
              </span>
              {userRole === 'plasiyer' ? (
                <div className="h-9 flex items-center gap-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 px-2 rounded-xl transition-all">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 shrink-0">₺</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={unitPriceStr}
                    placeholder="0,00"
                    onFocus={(e) => {
                      setIsUnitPriceFocused(true);
                      setUnitPriceStr(toRawEditableNumber(item.unitPrice));
                      setTimeout(() => e.target.select(), 10);
                    }}
                    onChange={handleUnitPriceChange}
                    onBlur={handleUnitPriceBlur}
                    className="w-full min-w-0 bg-transparent text-xs sm:text-sm font-extrabold text-right text-slate-900 dark:text-white focus:outline-none font-mono"
                  />
                </div>
              ) : (
                <div className="h-9 flex items-center justify-end bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-800 px-2 rounded-xl font-extrabold text-xs sm:text-sm text-slate-900 dark:text-white font-mono">
                  {formatCurrency(item.unitPrice)}
                </div>
              )}
            </div>

            {/* 2. İSKONTO */}
            <div className="space-y-1 min-w-0">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide block truncate">
                İskonto
              </span>
              {userRole === 'plasiyer' ? (
                <div className="h-9 flex items-center justify-between gap-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 px-2 rounded-xl transition-all">
                  <Percent className="w-3 h-3 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    inputMode="decimal"
                    value={discountStr}
                    placeholder="0"
                    onFocus={(e) => {
                      setIsDiscountFocused(true);
                      e.target.select();
                    }}
                    onChange={handleDiscountChange}
                    onBlur={handleDiscountBlur}
                    className="w-full min-w-0 bg-transparent text-xs sm:text-sm font-extrabold text-slate-800 dark:text-white text-right focus:outline-none placeholder:text-slate-400/60 font-mono"
                  />
                </div>
              ) : (
                <div className="h-9 flex items-center justify-center bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-800 px-2 rounded-xl font-bold text-xs text-emerald-600 dark:text-emerald-400">
                  %{item.discountPercent || 0}
                </div>
              )}
            </div>

            {/* 3. KDV ORANI */}
            <div className="space-y-1 min-w-0">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide block truncate">
                KDV Oranı
              </span>
              {userRole === 'plasiyer' ? (
                <div className="h-9 flex items-center justify-between gap-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 px-2 rounded-xl transition-all">
                  <span className="text-[11px] text-slate-400 font-bold shrink-0">%</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={vatRateStr}
                    placeholder="0"
                    onFocus={(e) => {
                      setIsVatFocused(true);
                      e.target.select();
                    }}
                    onChange={handleVatChange}
                    onBlur={handleVatBlur}
                    className="w-full min-w-0 bg-transparent text-xs sm:text-sm font-extrabold text-slate-800 dark:text-white text-right focus:outline-none placeholder:text-slate-400/60 font-mono"
                  />
                </div>
              ) : (
                <div className="h-9 flex items-center justify-center bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-800 px-2 rounded-xl font-bold text-xs text-slate-700 dark:text-slate-300 font-mono">
                  %{item.vatRate ?? 0}
                </div>
              )}
            </div>
          </div>

          {/* ALT SATIR: Miktar ve Tutar (KDV hariç hesaplanır, etikette yalnızca Tutar yazar) */}
          <div className="grid grid-cols-2 gap-2">
            {/* 4. MİKTAR */}
            <div className="space-y-1 min-w-0">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide block">
                Miktar
              </span>
              <div
                className={`h-9 flex items-center justify-between gap-1 rounded-xl p-1 ${
                  userRole === 'customer'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60'
                    : 'bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60'
                }`}
              >
                <button
                  type="button"
                  onClick={() => updateCartItemQuantity(item.productId, item.quantity - 1)}
                  className="w-7 h-7 bg-white dark:bg-slate-800 text-slate-700 dark:text-white rounded-lg flex items-center justify-center font-bold shadow-xs active:scale-90 shrink-0"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <input
                  type="text"
                  inputMode="decimal"
                  defaultValue={item.quantity}
                  key={`cart-qty-${item.productId}-${item.quantity}`}
                  onFocus={(e) => e.target.select()}
                  onBlur={(e) => {
                    const val = parseFloat(e.target.value.replace(',', '.'));
                    if (!isNaN(val) && val > 0) {
                      updateCartItemQuantity(item.productId, val);
                    } else {
                      e.target.value = item.quantity.toString();
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  className="flex-1 min-w-0 w-full h-7 font-black text-xs sm:text-sm text-slate-900 dark:text-white text-center bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 px-1 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs font-mono"
                />
                <button
                  type="button"
                  onClick={() => updateCartItemQuantity(item.productId, item.quantity + 1)}
                  className={`w-7 h-7 text-white rounded-lg flex items-center justify-center font-bold shadow-xs active:scale-90 shrink-0 ${
                    userRole === 'customer' ? 'bg-emerald-600' : 'bg-blue-600'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* 5. TUTAR (KDV hariç net tutar) */}
            <div className="space-y-1 min-w-0">
              <span className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide block text-right">
                Tutar
              </span>
              {userRole === 'plasiyer' ? (
                <div className="h-9 flex items-center justify-between gap-1 bg-emerald-50/70 dark:bg-emerald-950/35 border border-emerald-300 dark:border-emerald-800/80 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 px-2.5 rounded-xl transition-all">
                  <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400 shrink-0">₺</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={totalStr}
                    placeholder="0,00"
                    onFocus={(e) => {
                      setIsTotalFocused(true);
                      setTotalStr(toRawEditableNumber(item.totalAmount));
                      setTimeout(() => e.target.select(), 10);
                    }}
                    onChange={handleTotalChange}
                    onBlur={handleTotalBlur}
                    className={`w-full min-w-0 bg-transparent ${totalFontSizeClass} font-black text-right text-emerald-700 dark:text-emerald-300 focus:outline-none placeholder:text-slate-400/60 font-mono tracking-tight`}
                  />
                </div>
              ) : (
                <div
                  className={`h-9 flex items-center justify-end bg-emerald-50/70 dark:bg-emerald-950/35 border border-emerald-300 dark:border-emerald-800/80 px-2.5 rounded-xl font-black ${totalFontSizeClass} text-emerald-700 dark:text-emerald-300 font-mono tracking-tight`}
                >
                  {formatCurrency(item.totalAmount)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const CartPage: React.FC = () => {
  const { 
    userRole,
    currentCustomerUser,
    selectedCustomer, 
    selectCustomer,
    openCustomerSelectModal,
    cart, 
    cartSummary, 
    updateCartItemQuantity, 
    updateCartItemPrice,
    updateCartItemDiscount, 
    updateCartItemVatRate,
    updateCartItemNetTotal,
    removeFromCart, 
    clearCart,
    submitCurrentOrder,
    isOnline,
    setActiveTab,
    openPrintSlip,
    activeCampaigns,
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

  useEffect(() => {
    if (activeCustomer) {
      setErrorMessage(null);
    }
  }, [activeCustomer]);

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
    <div className="p-3 md:p-6 pb-40 md:pb-12 space-y-4 max-w-7xl mx-auto w-full">
      {/* Cari Bilgisi Uyarısı veya Başlığı */}
      {!activeCustomer ? (
        <div className="bg-amber-500/10 dark:bg-amber-950/30 border border-amber-500/30 dark:border-amber-800/50 rounded-2xl p-3.5 space-y-2.5 text-xs text-amber-900 dark:text-amber-300">
          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="font-bold block">Sipariş İçin Cari Seçilmedi!</span>
              <span className="text-[11px] text-amber-800 dark:text-amber-400">
                Sepetteki ürünleri onaylamak için cari seçebilirsiniz.
              </span>
            </div>
            <button
              type="button"
              onClick={openCustomerSelectModal}
              className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold px-3 py-2 rounded-xl shadow-xs shrink-0 transition active:scale-95"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Cari Seç</span>
            </button>
          </div>

          <button
            type="button"
            onClick={openCustomerSelectModal}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-amber-400/40 dark:border-amber-700/50 text-left text-slate-500 dark:text-slate-400 hover:border-amber-500 transition shadow-2xs"
          >
            <Search className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="text-xs font-medium truncate">
              Cari adı, kodu veya ilçe ile ara ve seç...
            </span>
          </button>
        </div>
      ) : (
        <div className="bg-gradient-to-br from-indigo-50 via-blue-50/95 to-sky-50 dark:from-indigo-950/90 dark:via-blue-950/85 dark:to-slate-900 border-2 border-indigo-300/90 dark:border-indigo-500/50 rounded-2xl p-3.5 shadow-md shadow-indigo-500/10 transition space-y-2.5">
          <div className="flex justify-between items-start gap-2">
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
                {userRole === 'customer' ? 'Sipariş Veren Bayi' : 'Cari Bilgisi'}
              </span>
              <h3 className="font-black text-[17px] sm:text-lg md:text-xl text-indigo-950 dark:text-white mt-0.5 leading-snug break-words tracking-tight">
                {activeCustomer.name}
              </h3>
              <div className="text-xs font-bold text-indigo-700/80 dark:text-indigo-300/90 font-mono mt-0.5">
                {activeCustomer.code}
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className="text-[10px] font-bold text-indigo-600/80 dark:text-indigo-300/80 block">Güncel Bakiye</span>
              <span
                className={`text-sm sm:text-base font-black ${
                  activeCustomer.balance > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {formatCurrency(activeCustomer.balance)}
              </span>
            </div>
          </div>

          {userRole === 'plasiyer' && (
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={openCustomerSelectModal}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/90 dark:bg-indigo-900/70 hover:bg-white dark:hover:bg-indigo-800/80 text-indigo-700 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-700/80 text-[11px] font-bold transition active:scale-95 shadow-2xs"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Cari Değiştir</span>
              </button>
              <button
                type="button"
                onClick={() => selectCustomer(null)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/70 text-rose-700 dark:text-rose-300 border border-rose-200/80 dark:border-rose-800/70 text-[11px] font-bold transition active:scale-95"
                title="Seçili cariyi kaldır"
              >
                <UserX className="w-3 h-3" />
                <span>Kaldır</span>
              </button>
            </div>
          )}

          {/* AŞAMA 8: Plasiyer Satış Modu Seçici (Soğuk vs Sıcak) */}
          {userRole === 'plasiyer' && (
            <div className="pt-2 border-t border-indigo-200/70 dark:border-indigo-800/60 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Truck className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                <span className="text-[11px] font-bold text-indigo-950 dark:text-indigo-200">
                  Satış Tipi:
                </span>
                <span className="text-[10px] font-mono font-bold text-indigo-700 dark:text-indigo-300 bg-white/80 dark:bg-indigo-950/80 border border-indigo-200/70 dark:border-indigo-800/70 px-1.5 py-0.5 rounded">
                  {vanPlate}
                </span>
              </div>
              <div className="flex items-center bg-white/80 dark:bg-slate-900/80 border border-indigo-200/70 dark:border-indigo-800/70 p-0.5 rounded-xl text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setSaleMode('cold')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition ${
                    saleMode === 'cold'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
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
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
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

      {/* Sepet Başlığı ve Çoklu Ürün KDV Dahil Görünürlük Barı */}
      <div
        className={`${
          cart.length > 1
            ? `${selectedCustomer ? 'sticky top-11' : 'sticky top-1.5'} z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-emerald-500/30 dark:border-emerald-700/50 rounded-2xl px-3.5 py-2.5 shadow-md space-y-1.5`
            : 'px-1'
        }`}
      >
        <div className="flex justify-between items-center gap-2">
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
            Sipariş Kalemleri ({cart.length} Kalem / {cartSummary.totalItems} Adet)
          </span>
          <div className="flex items-center gap-3 shrink-0">
            {activeCampaigns.length > 0 && (
              <button
                onClick={() => openCampaignsModal()}
                className="text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 font-bold flex items-center gap-1"
              >
                <Gift className="w-3.5 h-3.5" />
                <span>Kampanyalar</span>
              </button>
            )}
            <button
              onClick={clearCart}
              className="text-xs text-rose-600 dark:text-rose-400 hover:text-rose-700 font-medium flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Sepeti Temizle</span>
            </button>
          </div>
        </div>

        {cart.length > 1 && (
          <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
              Sepet KDV Dahil Toplam ({cart.length} Ürün)
            </span>
            <span className="text-sm sm:text-base font-black font-mono text-emerald-600 dark:text-emerald-400 tracking-tight">
              {formatCurrency(cartSummary.grandTotal)}
            </span>
          </div>
        )}
      </div>

      {/* Sepetteki Kalemler */}
      <div className="space-y-2">
        {cart.map((item) => (
          <CartItemRow
            key={item.productId}
            item={item}
            userRole={userRole}
            saleMode={saleMode}
            removeFromCart={removeFromCart}
            updateCartItemQuantity={updateCartItemQuantity}
            updateCartItemPrice={updateCartItemPrice}
            updateCartItemDiscount={updateCartItemDiscount}
            updateCartItemVatRate={updateCartItemVatRate}
            updateCartItemNetTotal={updateCartItemNetTotal}
            getVanStockByCode={getVanStockByCode}
          />
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

        <div className="pt-2.5 border-t border-slate-800 flex justify-between items-baseline gap-2 font-bold text-sm">
          <span>Genel Toplam (KDV Dahil)</span>
          <span className="text-base sm:text-lg text-emerald-400 font-extrabold font-mono text-right break-all">
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

        {!activeCustomer && userRole === 'plasiyer' ? (
          <button
            type="button"
            onClick={openCustomerSelectModal}
            className="w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 shadow-md transition active:scale-95 text-white bg-amber-600 hover:bg-amber-700"
          >
            <UserPlus className="w-4 h-4" />
            <span>Siparişi Onaylamak İçin Cari Seç</span>
          </button>
        ) : (
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
        )}
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
