import React, { useState, useEffect } from 'react';
import { 
  X, ShoppingBag, Plus, Minus, Check, TrendingDown, Barcode, Gift, Camera 
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
  const { calculateCustomerPrice, addToCart, cart, userRole, activeCampaigns } = useApp();
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

  if (!isOpen || !product) return null;

  const priceInfo = calculateCustomerPrice(product, activeCustomer);
  const imageUrl = getProductImageUrl(product.name, product.category, localImage);
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

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Görsel Alanı & Kapat Butonu */}
        <div className="relative h-64 bg-slate-100 dark:bg-slate-800 overflow-hidden group">
          <img 
            src={imageUrl} 
            alt={product.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30" />

          {/* Fotoğraf Ekle / Değiştir Butonu */}
          <button
            onClick={() => setIsPhotoModalOpen(true)}
            className="absolute top-3 right-14 py-1.5 px-3 rounded-full bg-black/60 hover:bg-black/85 text-white backdrop-blur-md transition flex items-center gap-1.5 text-xs font-semibold shadow-md active:scale-95"
            title="Ürün Fotoğrafı Çek / Yükle (ERP12 Entegre)"
          >
            <Camera className="w-3.5 h-3.5 text-blue-400" />
            <span>Fotoğraf {localImage ? 'Değiştir' : 'Ekle'}</span>
          </button>

          {/* Kapat Butonu */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-2 rounded-full bg-black/50 hover:bg-black/80 text-white backdrop-blur-xs transition"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Size Özel Rozeti */}
          {priceInfo.hasSpecialPrice && (
            <div className="absolute top-3 left-3 bg-emerald-500 text-white text-xs font-black px-2.5 py-1 rounded-full shadow-lg flex items-center gap-1">
              <TrendingDown className="w-3.5 h-3.5" />
              <span>%{priceInfo.discountPercent} Size Özel İndirim</span>
            </div>
          )}

          {/* Stok Durumu Rozeti */}
          <div className="absolute bottom-3 left-3">
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
          <div className="absolute bottom-3 right-3 bg-black/60 text-white/90 text-[11px] font-semibold px-2.5 py-1 rounded-full backdrop-blur-md">
            {product.category}
          </div>
        </div>

        {/* Ürün Detayları */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                {product.code}
              </span>
              <span className="text-xs font-mono text-slate-400 flex items-center gap-1">
                <Barcode className="w-3.5 h-3.5" />
                {product.barcode}
              </span>
            </div>

            <h2 className="text-lg font-black text-slate-900 dark:text-white mt-1.5 leading-snug">
              {product.name}
            </h2>
          </div>

          {/* Aktif Kampanya Bilgisi (Aşama 7) */}
          {activeCampaigns.some((c) => c.targetProductId === product.id) && (() => {
            const camp = activeCampaigns.find((c) => c.targetProductId === product.id)!;
            return (
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-purple-500/10 via-purple-500/5 to-indigo-500/10 border border-purple-500/30 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-purple-700 dark:text-purple-300 flex items-center gap-1.5">
                    <Gift className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    <span>{camp.badge} {camp.title}</span>
                  </span>
                </div>
                <p className="text-[11px] text-purple-900 dark:text-purple-200 leading-relaxed">
                  {camp.description}
                </p>
                {camp.minQuantity && selectedQuantity < camp.minQuantity && (
                  <button
                    type="button"
                    onClick={() => setSelectedQuantity(camp.minQuantity || 10)}
                    className="mt-1 text-[11px] font-bold text-purple-700 dark:text-purple-300 hover:underline inline-block"
                  >
                    ⚡ Kampanya için {camp.minQuantity} adet seç ({camp.minQuantity * priceInfo.customerPrice} ₺)
                  </button>
                )}
              </div>
            );
          })()}

          {/* Fiyat Kartı */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400 font-medium block">
                {priceInfo.hasSpecialPrice ? 'Size Özel Net Fiyat' : 'Birim Fiyat'}
              </span>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(priceInfo.customerPrice)}
                </span>
                {priceInfo.hasSpecialPrice && (
                  <span className="text-sm text-slate-400 line-through">
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
          <div className="space-y-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wide">
                Sipariş Miktarı ({product.unit}):
              </label>
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Elle yazabilir veya butonları kullanabilirsiniz
              </span>
            </div>

            {/* Büyük Elle Yazılabilir Kutu + Stepper */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleDecrement(1)}
                className="w-12 h-12 bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 active:scale-90 text-slate-800 dark:text-white rounded-2xl flex items-center justify-center font-bold border border-slate-200 dark:border-slate-600 shadow-xs transition"
                title="1 Azalt"
              >
                <Minus className="w-5 h-5 stroke-[2.5]" />
              </button>

              <div className="relative flex-1">
                <input
                  type="text"
                  inputMode="decimal"
                  value={quantityInput}
                  onChange={handleQuantityInputChange}
                  onBlur={handleQuantityBlur}
                  onFocus={(e) => e.target.select()}
                  placeholder="1"
                  className="w-full h-12 px-4 text-center font-black text-2xl bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 border-2 border-blue-500/50 focus:border-blue-600 dark:border-blue-500/30 dark:focus:border-blue-400 rounded-2xl shadow-inner focus:outline-none focus:ring-4 focus:ring-blue-500/20 transition tracking-wide"
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 dark:text-slate-500 pointer-events-none uppercase">
                  {product.unit}
                </span>
              </div>

              <button
                type="button"
                onClick={() => handleIncrement(1)}
                className="w-12 h-12 bg-blue-600 hover:bg-blue-700 active:scale-90 text-white rounded-2xl flex items-center justify-center font-bold shadow-md shadow-blue-600/30 transition"
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
              <div className="grid grid-cols-4 gap-1.5 mb-2">
                {[5, 10, 25, 50].map((inc) => (
                  <button
                    key={`inc-${inc}`}
                    type="button"
                    onClick={() => handleAddQuick(inc)}
                    className="py-2 rounded-xl text-xs font-extrabold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 active:scale-95 transition flex items-center justify-center shadow-2xs"
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
            <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 text-xs text-blue-800 dark:text-blue-300 flex items-center justify-between font-semibold">
              <span>Bu ürün zaten sepetinizde bulunuyor:</span>
              <span className="font-extrabold">{inCartQty} {product.unit}</span>
            </div>
          )}
        </div>

        {/* Alt Satın Alma / Ekleme Barı */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div>
            <span className="text-[11px] text-slate-400 font-medium block">Toplam Tutar:</span>
            <span className="text-lg font-black text-slate-900 dark:text-white">
              {formatCurrency(lineTotal)}
            </span>
          </div>

          <button
            onClick={handleAddToCart}
            className={`px-6 py-3 rounded-2xl font-bold text-xs shadow-lg transition active:scale-95 flex items-center gap-2 ${
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
};
