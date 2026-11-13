import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { db } from '../db';
import type { Order, OrderItem } from '../types';
import { getProductImageUrl } from '../utils/productImages';
import { 
  Trash2, 
  Plus, 
  Minus, 
  ShoppingBag, 
  Check,
  CheckCircle, 
  AlertCircle, 
  Calendar, 
  FileText, 
  UserPlus, 
  Send, 
  Wifi, 
  WifiOff, 
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
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val) + ' TL';
};

const formatOrderDate = (isoDate?: string) => {
  const dateObj = isoDate ? new Date(isoDate) : new Date();
  const validDate = isNaN(dateObj.getTime()) ? new Date() : dateObj;
  return validDate.toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
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
  removeFromCart: (productId: string) => void;
  updateCartItemQuantity: (productId: string, quantity: number) => void;
  updateCartItemPrice: (productId: string, unitPrice: number) => void;
  toggleCartItemSelected: (productId: string) => void;
}

const CartItemRow: React.FC<CartItemRowProps> = ({
  item,
  userRole,
  removeFromCart,
  updateCartItemQuantity,
  updateCartItemPrice,
  toggleCartItemSelected,
}) => {
  const isSelected = item.selected !== false;
  const [unitPriceStr, setUnitPriceStr] = useState<string>(formatNumberTr(item.unitPrice));
  const [isUnitPriceFocused, setIsUnitPriceFocused] = useState(false);

  useEffect(() => {
    if (!isUnitPriceFocused) {
      setUnitPriceStr(formatNumberTr(item.unitPrice));
    }
  }, [item.unitPrice, isUnitPriceFocused]);

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

  const imageUrl = getProductImageUrl(
    item.productName,
    item.category || '',
    item.image
  );
  const formattedDate = formatOrderDate(item.addedAt);
  const lineTotal = item.totalAmount;

  return (
    <div
      className={`rounded-2xl p-3 sm:p-4 border transition-all ${
        isSelected
          ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xs'
          : 'bg-slate-50/80 dark:bg-slate-900/50 border-slate-200/70 dark:border-slate-800/60 opacity-75'
      }`}
    >
      <div className="flex items-center gap-3 sm:gap-4">
        {/* 1. SEÇİM KUTUSU (CHECKBOX) - EN SOLDA */}
        <button
          type="button"
          onClick={() => toggleCartItemSelected(item.productId)}
          aria-label={isSelected ? 'Ürün seçimini kaldır' : 'Ürünü seç'}
          className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition cursor-pointer active:scale-90 ${
            isSelected
              ? 'bg-orange-500 border-orange-500 text-white shadow-xs'
              : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-transparent hover:border-orange-400'
          }`}
        >
          <Check className="w-4 h-4 stroke-[3]" />
        </button>

        {/* 2. ÜRÜN RESMİ - SOLDA */}
        <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white p-1.5 flex items-center justify-center shrink-0 overflow-hidden shadow-2xs">
          <img
            src={imageUrl}
            alt={item.productName}
            loading="lazy"
            onError={(e) => {
              const target = e.currentTarget;
              if (!target.dataset.fallbackApplied) {
                target.dataset.fallbackApplied = 'true';
                target.src = getProductImageUrl(item.productName, item.category || '');
              }
            }}
            className="w-full h-full object-contain"
          />
        </div>

        {/* 3. SAĞ BİLGİ BLOĞU: Ürün Adı, Sipariş Tarihi, Birim Fiyatı, Sipariş Adedi */}
        <div className="flex-1 min-w-0 flex flex-col justify-between gap-1.5 sm:gap-2">
          <div>
            {/* ÜRÜN ADI */}
            <h4 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white leading-snug line-clamp-2">
              {item.productName}
            </h4>

            {/* SİPARİŞ VERDİĞİ TARİHİ */}
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Sipariş Tarihi: {formattedDate}
            </div>

            {/* BİRİM FİYATI (Telefon ekranında Görsel-2 gibi hemen tarihin altında belirgin, Web ekranında birim fiyat bilgisi) */}
            <div className="mt-1 flex items-center flex-wrap gap-x-2 gap-y-1">
              {userRole === 'plasiyer' && !item.isGift ? (
                <div className="inline-flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Birim Fiyatı:
                  </span>
                  <div className="inline-flex items-center gap-0.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus-within:border-orange-500 px-2 py-0.5 rounded-lg">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={unitPriceStr}
                      onFocus={(e) => {
                        setIsUnitPriceFocused(true);
                        setUnitPriceStr(toRawEditableNumber(item.unitPrice));
                        setTimeout(() => e.target.select(), 10);
                      }}
                      onChange={handleUnitPriceChange}
                      onBlur={handleUnitPriceBlur}
                      className="w-20 bg-transparent text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white focus:outline-none"
                    />
                    <span className="text-xs font-extrabold text-slate-700 dark:text-slate-300">TL</span>
                  </div>
                </div>
              ) : (
                <span className="text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-300">
                  Birim Fiyatı: <strong className="font-extrabold text-slate-900 dark:text-white">{formatCurrency(item.unitPrice)}</strong>
                </span>
              )}

              {/* Telefon ekranında (Görsel-2) satır toplam tutarını burada kalın puntoyla göster */}
              <span className="sm:hidden text-base font-black text-slate-900 dark:text-white block w-full mt-0.5">
                {formatCurrency(lineTotal)}
              </span>
            </div>
          </div>

          {/* ALT SATIR: Solda Oval Sipariş Adedi Kontrolü + Çıkarma, Sağda (Web / Görsel-1) Satır Tutarı */}
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <div className="flex items-center gap-2">
              {/* Görsel-1 ve Görsel-2'deki Oval / Hap Adet Kontrolü */}
              <div className="inline-flex items-center rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-1.5 py-1 shadow-2xs gap-1">
                {item.quantity <= 1 ? (
                  <button
                    type="button"
                    onClick={() => removeFromCart(item.productId)}
                    className="w-7 h-7 rounded-full flex items-center justify-center text-orange-500 hover:text-rose-600 hover:bg-orange-50 dark:hover:bg-slate-700 transition active:scale-90"
                    title="Ürünü Sepetten Çıkar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => updateCartItemQuantity(item.productId, item.quantity - 1)}
                    className="w-7 h-7 rounded-full flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition active:scale-90"
                    title="Adedi Azalt"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                )}

                <input
                  type="text"
                  inputMode="numeric"
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
                  className="w-9 sm:w-11 text-center font-extrabold text-xs sm:text-sm text-slate-900 dark:text-white bg-transparent focus:outline-none"
                />

                <button
                  type="button"
                  onClick={() => updateCartItemQuantity(item.productId, item.quantity + 1)}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-orange-500 hover:bg-orange-50 dark:hover:bg-slate-700 transition active:scale-90"
                  title="Adedi Artır"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* Adet > 1 olduğunda da kullanıcı isterse tek tıkla tamamen ürünü çıkarabilsin */}
              {item.quantity > 1 && (
                <button
                  type="button"
                  onClick={() => removeFromCart(item.productId)}
                  className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-rose-600 hover:border-rose-200 dark:hover:border-rose-800 transition active:scale-90"
                  title="Ürünü Tamamen Çıkar"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Web / Tam Ekran Formatında (Görsel-1) Sağ Altta Toplam Fiyat */}
            <div className="hidden sm:block text-right shrink-0">
              <span className="text-base md:text-lg font-extrabold text-slate-900 dark:text-white tracking-tight">
                {formatCurrency(lineTotal)}
              </span>
            </div>
          </div>
        </div>
      </div>
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
    toggleCartItemSelected,
    setAllCartItemsSelected,
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
    vanPlate
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

      {/* Sepet Başlığı, Tümünü Seç ve Çoklu Ürün KDV Dahil Görünürlük Barı */}
      {(() => {
        const regularCartItems = cart.filter((it) => !it.isGift);
        const selectedCartCount = regularCartItems.filter((it) => it.selected !== false).length;
        const allSelected = regularCartItems.length > 0 && selectedCartCount === regularCartItems.length;

        return (
          <div
            className={`${
              cart.length > 1
                ? `${selectedCustomer ? 'sticky top-11' : 'sticky top-1.5'} z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-emerald-500/30 dark:border-emerald-700/50 rounded-2xl px-3.5 py-2.5 shadow-md space-y-1.5`
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-3.5 py-2.5 shadow-xs'
            }`}
          >
            <div className="flex justify-between items-center gap-2">
              <button
                type="button"
                onClick={() => setAllCartItemsSelected(!allSelected)}
                className="flex items-center gap-2.5 text-left group cursor-pointer"
              >
                <span
                  className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition ${
                    allSelected
                      ? 'bg-orange-500 border-orange-500 text-white'
                      : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-transparent group-hover:border-orange-400'
                  }`}
                >
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </span>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Tümünü Seç ({selectedCartCount}/{regularCartItems.length} Ürün Seçili • {cartSummary.totalItems} Adet)
                </span>
              </button>

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
                  Seçili Sepet KDV Dahil Toplam ({selectedCartCount} Ürün)
                </span>
                <span className="text-sm sm:text-base font-black font-mono text-emerald-600 dark:text-emerald-400 tracking-tight">
                  {formatCurrency(cartSummary.grandTotal)}
                </span>
              </div>
            )}
          </div>
        );
      })()}

      {/* Sepetteki Kalemler */}
      <div className="space-y-2.5">
        {cart.map((item) => (
          <CartItemRow
            key={item.productId}
            item={item}
            userRole={userRole}
            removeFromCart={removeFromCart}
            updateCartItemQuantity={updateCartItemQuantity}
            updateCartItemPrice={updateCartItemPrice}
            toggleCartItemSelected={toggleCartItemSelected}
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
                ? 'Seçtiğiniz ürünler siparişe dönüştürülerek sisteme iletildi. Yetkili onayının ardından faturalandırma ve sevkiyat başlayacaktır.'
                : 'Seçtiğiniz ürünler cihaz hafızasına kaydedildi. İnternet bağlantısı sağlandığında otomatik senkronize edilecektir.'}
            </p>
            {cart.length > 0 && (
              <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                İşaretini kaldırdığınız <strong>{cart.length} ürün</strong> daha sonra sipariş verebilmeniz için sepetinizde bırakıldı.
              </div>
            )}

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
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={() => setOrderSuccessModal(null)}
                  className="flex-1 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold py-2.5 rounded-xl transition"
                >
                  Sepette Kalanlar ({cart.length})
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
