import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, ShoppingBag, Plus, Minus, Check, TrendingDown, Barcode, Camera 
} from 'lucide-react';
import type { Product, Customer } from '../types';
import { useApp } from '../context/AppContext';
import { getProductImageUrl } from '../utils/productImages';
import { ProductPhotoModal } from './ProductPhotoModal';

interface ProductDetailModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
  activeCustomer: Customer | null;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  isOpen,
  onClose,
  activeCustomer,
}) => {
  const { calculateCustomerPrice, addToCart, cart, userRole } = useApp();
  const [selectedQuantity, setSelectedQuantity] = useState(1);
  const [quantityInput, setQuantityInput] = useState('1');
  const [addedAnimation, setAddedAnimation] = useState(false);
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [localImage, setLocalImage] = useState<string | undefined>(product?.image);

  useEffect(() => {
    setLocalImage(product?.image);
  }, [product]);

  useEffect(() => {
    if (isOpen && product) {
      setSelectedQuantity(1);
      setQuantityInput('1');
    }
  }, [product?.id, isOpen]);

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;
    const htmlEl = document.documentElement;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = htmlEl.style.overflow;
    htmlEl.classList.add('modal-scroll-lock');
    htmlEl.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      htmlEl.classList.remove('modal-scroll-lock');
      htmlEl.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
    };
  }, [isOpen]);

  if (!isOpen || !product) return null;

  const priceInfo = calculateCustomerPrice(product, activeCustomer);
  const hasRealPhoto = Boolean(
    localImage &&
      (localImage.startsWith('/') ||
        localImage.startsWith('http') ||
        (localImage.startsWith('data:image/') && !localImage.startsWith('data:image/svg+xml')))
  );
  const imageUrl = getProductImageUrl(product.name, product.category, localImage, 'hero');
  const fallbackHeroUrl = getProductImageUrl(product.name, product.category, undefined, 'hero');
  const inCartQty = cart.find(i => i.productId === product.id)?.quantity || 0;

  const handleQuantityInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuantityInput(val);

    const normalized = val.replace(',', '.').trim();
    if (normalized === '') {
      setSelectedQuantity(0);
      return;
    }

    const parsed = parseFloat(normalized);
    if (!isNaN(parsed) && parsed > 0) {
      setSelectedQuantity(parsed);
    }
  };

  const handleQuantityBlur = () => {
    const normalized = quantityInput.replace(',', '.').trim();
    const parsed = parseFloat(normalized);
    if (isNaN(parsed) || parsed <= 0) {
      setSelectedQuantity(1);
      setQuantityInput('1');
    } else {
      setSelectedQuantity(parsed);
      setQuantityInput(parsed.toString());
    }
  };

  const handleIncrement = (amount = 1) => {
    const current = selectedQuantity > 0 ? selectedQuantity : (parseFloat(quantityInput.replace(',', '.')) || 0);
    const next = Math.round((current + amount) * 100) / 100;
    setSelectedQuantity(next);
    setQuantityInput(next.toString());
  };

  const handleDecrement = (amount = 1) => {
    const current = selectedQuantity > 0 ? selectedQuantity : (parseFloat(quantityInput.replace(',', '.')) || 1);
    const next = Math.max(1, Math.round((current - amount) * 100) / 100);
    setSelectedQuantity(next);
    setQuantityInput(next.toString());
  };

  const handleAddQuick = (amount: number) => {
    const current = selectedQuantity > 0 ? selectedQuantity : (parseFloat(quantityInput.replace(',', '.')) || 0);
    const next = Math.round((current + amount) * 100) / 100;
    setSelectedQuantity(next);
    setQuantityInput(next.toString());
  };

  const handleSetPreset = (preset: number) => {
    setSelectedQuantity(preset);
    setQuantityInput(preset.toString());
  };

  const effectiveQty = selectedQuantity > 0 
    ? selectedQuantity 
    : (parseFloat(quantityInput.replace(',', '.')) > 0 ? parseFloat(quantityInput.replace(',', '.')) : 1);

  const handleAddToCart = () => {
    addToCart(product, effectiveQty);
    setAddedAnimation(true);
    setTimeout(() => {
      setAddedAnimation(false);
      onClose();
    }, 900);
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 2,
    }).format(val);
  };

  const lineTotal = priceInfo.customerPrice * effectiveQty;

  const modalContent = (
    <div className="fixed inset-0 z-[100] bg-slate-950 sm:bg-black/75 sm:backdrop-blur-sm flex items-stretch sm:items-center justify-center p-0 sm:p-4 overscroll-none animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 w-full sm:max-w-md h-[100dvh] max-h-[100dvh] sm:h-auto sm:max-h-[92vh] rounded-none sm:rounded-3xl shadow-2xl border-0 sm:border border-slate-200 dark:border-slate-800 overflow-hidden overscroll-none flex flex-col">
        {/* Görsel Alanı & Kapat Butonu (iPhone Çentik / Dynamic Island Uyumlu Esnek Tek Ekran Başlığı) */}
        <div
          className={`relative min-h-[8.25rem] h-[26dvh] max-h-[15.5rem] sm:h-56 sm:max-h-none overflow-hidden group shrink-0 ${
            hasRealPhoto ? 'bg-white' : 'bg-slate-100 dark:bg-slate-800'
          }`}
        >
          <img
            src={imageUrl}
            alt={product.name}
            onError={(e) => {
              const target = e.currentTarget;
              if (target.src !== fallbackHeroUrl) {
                target.src = fallbackHeroUrl;
                target.className =
                  'w-full h-full object-cover transition-transform duration-500 group-hover:scale-105';
              }
            }}
            className={`w-full h-full transition-transform duration-500 group-hover:scale-105 ${
              hasRealPhoto ? 'object-contain p-2 bg-white' : 'object-cover'
            }`}
          />
          <div
            className={`absolute inset-0 pointer-events-none ${
              hasRealPhoto
                ? 'bg-gradient-to-t from-black/45 via-transparent to-black/20'
                : 'bg-gradient-to-t from-black/65 via-transparent to-black/35'
            }`}
          />

          {/* Fotoğraf Ekle / Değiştir Butonu */}
          <button
            type="button"
            onClick={() => setIsPhotoModalOpen(true)}
            className="absolute top-[calc(env(safe-area-inset-top,0px)+0.625rem)] sm:top-3 right-14 py-1.5 px-3 rounded-full bg-black/60 hover:bg-black/85 text-white backdrop-blur-md transition flex items-center gap-1.5 text-xs font-semibold shadow-md active:scale-95"
            title="Ürün Fotoğrafı Çek / Yükle (ERP12 Entegre)"
          >
            <Camera className="w-3.5 h-3.5 text-blue-400" />
            <span>Fotoğraf {localImage ? 'Değiştir' : 'Ekle'}</span>
          </button>

          {/* Kapat Butonu */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-[calc(env(safe-area-inset-top,0px)+0.5rem)] sm:top-3 right-3 p-2 rounded-full bg-black/55 hover:bg-black/80 text-white backdrop-blur-xs transition active:scale-95"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Size Özel Rozeti */}
          {priceInfo.hasSpecialPrice && (
            <div className="absolute top-[calc(env(safe-area-inset-top,0px)+0.625rem)] sm:top-3 left-3 bg-emerald-500 text-white text-[11px] font-black px-2.5 py-1 rounded-full shadow-lg flex items-center gap-1">
              <TrendingDown className="w-3.5 h-3.5" />
              <span>%{priceInfo.discountPercent} Size Özel</span>
            </div>
          )}

          {/* Stok Durumu Rozeti */}
          <div className="absolute bottom-2.5 left-3">
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full backdrop-blur-md shadow-md ${
              product.stockQuantity > 0 
                ? 'bg-emerald-500/90 text-white' 
                : 'bg-rose-500/90 text-white'
            }`}>
              {product.stockQuantity > 0 
                ? (userRole === 'customer' ? 'Stokta Mevcut' : `Depo Stoğu: ${product.stockQuantity} ${product.unit}`)
                : 'Tükendi'}
            </span>
          </div>

          {/* Kategori */}
          <div className="absolute bottom-2.5 right-3 bg-black/65 text-white/95 text-[11px] font-semibold px-2.5 py-1 rounded-full backdrop-blur-md">
            {product.category}
          </div>
        </div>

        {/* Ürün Detayları (Kaydırmasız Tek Ekran Yerleşimi) */}
        <div className="px-4 py-3 sm:p-5 overflow-hidden flex-1 min-h-0 flex flex-col justify-between gap-2.5 sm:gap-3.5">
          <div>
            {product.barcode && (
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
                  <Barcode className="w-3.5 h-3.5" />
                  {product.barcode}
                </span>
              </div>
            )}

            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-snug line-clamp-2">
              {product.name}
            </h2>
          </div>

          {/* Fiyat Kartı */}
          <div className="px-3.5 py-2.5 sm:p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-slate-400 font-medium block">
                {priceInfo.hasSpecialPrice ? 'Size Özel Net Fiyat' : 'Birim Fiyat'}
              </span>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(priceInfo.customerPrice)}
                </span>
                {priceInfo.hasSpecialPrice && (
                  <span className="text-xs sm:text-sm text-slate-400 line-through">
                    {formatCurrency(priceInfo.standardPrice)}
                  </span>
                )}
                <span className="text-xs text-slate-500">/ {product.unit}</span>
              </div>
            </div>

            <div className="text-right">
              <span className="text-[11px] text-slate-400 block font-medium">KDV Oranı</span>
              <span className="font-bold text-xs text-slate-700 dark:text-slate-300">
                %{product.vatRate} Toptan
              </span>
            </div>
          </div>

          {/* Sipariş Miktarı Bölümü */}
          <div className="space-y-2.5 p-3 sm:p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wide shrink-0">
                Sipariş Miktarı ({product.unit}):
              </label>
              <span className="text-[10px] sm:text-[11px] font-medium text-slate-500 dark:text-slate-400 text-right leading-tight">
                Elle yazabilir veya seçebilirsiniz
              </span>
            </div>

            {/* Büyük Elle Yazılabilir Kutu + Stepper */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleDecrement(1)}
                className="w-11 h-11 sm:w-12 sm:h-12 bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 active:scale-90 text-slate-800 dark:text-white rounded-2xl flex items-center justify-center font-bold border border-slate-200 dark:border-slate-600 shadow-xs transition shrink-0"
                title="1 Azalt"
              >
                <Minus className="w-5 h-5 stroke-[2.5]" />
              </button>

              <div className="relative flex-1">
                <input
                  type="text"
                  inputMode="decimal"
                  data-no-autoscroll="true"
                  value={quantityInput}
                  onChange={handleQuantityInputChange}
                  onBlur={handleQuantityBlur}
                  onFocus={(e) => e.target.select()}
                  placeholder="1"
                  className="w-full h-11 sm:h-12 px-4 text-center font-black text-xl sm:text-2xl bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 border-2 border-blue-500/50 focus:border-blue-600 dark:border-blue-500/30 dark:focus:border-blue-400 rounded-2xl shadow-inner focus:outline-none focus:ring-4 focus:ring-blue-500/20 transition tracking-wide"
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400 dark:text-slate-500 pointer-events-none uppercase">
                  {product.unit}
                </span>
              </div>

              <button
                type="button"
                onClick={() => handleIncrement(1)}
                className="w-11 h-11 sm:w-12 sm:h-12 bg-blue-600 hover:bg-blue-700 active:scale-90 text-white rounded-2xl flex items-center justify-center font-bold shadow-md shadow-blue-600/30 transition shrink-0"
                title="1 Arttır"
              >
                <Plus className="w-5 h-5 stroke-[2.5]" />
              </button>
            </div>

            {/* Hızlı Miktar Ekleme Butonları (+5, +10, +25, +50) */}
            <div>
              <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                <span>Hızlı Ekle (+):</span>
                <span>Koli / Paket Presetleri:</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5 mb-1.5">
                {[5, 10, 25, 50].map((inc) => (
                  <button
                    key={`inc-${inc}`}
                    type="button"
                    onClick={() => handleAddQuick(inc)}
                    className="py-1.5 sm:py-2 rounded-xl text-xs font-extrabold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 active:scale-95 transition flex items-center justify-center shadow-2xs"
                  >
                    +{inc}
                  </button>
                ))}
              </div>

              {/* Sabit Miktar Presetleri */}
              <div className="flex gap-1.5">
                {[1, 6, 12, 24, 60, 100].map((preset) => (
                  <button
                    key={`preset-${preset}`}
                    type="button"
                    onClick={() => handleSetPreset(preset)}
                    className={`flex-1 py-1.5 rounded-xl text-[11px] font-bold border transition active:scale-95 ${
                      effectiveQty === preset
                        ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white shadow-xs'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Sepette Zaten Varsa Göster */}
          {inCartQty > 0 && (
            <div className="px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 text-xs text-blue-800 dark:text-blue-300 flex items-center justify-between font-semibold shrink-0">
              <span>Bu ürün zaten sepetinizde bulunuyor:</span>
              <span className="font-extrabold">{inCartQty} {product.unit}</span>
            </div>
          )}
        </div>

        {/* Alt Satın Alma / Ekleme Barı (iPhone Home Indicator Güvenli Alan Uyumlu, Her Zaman Görünür) */}
        <div className="px-4 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.875rem)] sm:px-6 sm:py-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <span className="text-[11px] text-slate-400 font-medium block">Toplam Tutar:</span>
            <span className="text-lg sm:text-xl font-black text-slate-900 dark:text-white truncate block">
              {formatCurrency(lineTotal)}
            </span>
          </div>

          <button
            type="button"
            onClick={handleAddToCart}
            className={`px-5 py-3.5 rounded-2xl font-extrabold text-xs sm:text-sm shadow-lg transition active:scale-95 flex items-center gap-2 shrink-0 ${
              addedAnimation 
                ? 'bg-emerald-600 text-white shadow-emerald-600/30' 
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/30'
            }`}
          >
            {addedAnimation ? (
              <>
                <Check className="w-4 h-4 animate-bounce" />
                <span>Sepete Eklendi!</span>
              </>
            ) : (
              <>
                <ShoppingBag className="w-4 h-4" />
                <span>Sepete Ekle ({effectiveQty} {product.unit})</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Ürün Fotoğrafı Yönetim Modalı */}
      <ProductPhotoModal
        product={product}
        isOpen={isPhotoModalOpen}
        onClose={() => setIsPhotoModalOpen(false)}
        onImageUpdated={(_id, newUrl) => {
          setLocalImage(newUrl);
        }}
      />
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
