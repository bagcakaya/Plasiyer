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
  const [addedAnimation, setAddedAnimation] = useState(false);
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [localImage, setLocalImage] = useState<string | undefined>(product?.image);

  useEffect(() => {
    setLocalImage(product?.image);
  }, [product]);

  if (!isOpen || !product) return null;

  const priceInfo = calculateCustomerPrice(product, activeCustomer);
  const imageUrl = getProductImageUrl(product.name, product.category, localImage);
  const inCartQty = cart.find(i => i.productId === product.id)?.quantity || 0;

  const handleAddToCart = () => {
    addToCart(product, selectedQuantity);
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

  const lineTotal = priceInfo.customerPrice * selectedQuantity;

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

          {/* Hızlı Miktar Seçici */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Sipariş Miktarı ({product.unit}):
            </label>

            <div className="flex items-center gap-3">
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-2xl p-1 border border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => setSelectedQuantity(Math.max(1, selectedQuantity - 1))}
                  className="w-10 h-10 bg-white dark:bg-slate-700 rounded-xl flex items-center justify-center font-bold text-slate-800 dark:text-white shadow-xs active:scale-95 transition"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <input
                  type="number"
                  min="1"
                  value={selectedQuantity}
                  onChange={(e) => setSelectedQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-14 text-center font-black text-base bg-transparent text-slate-900 dark:text-white focus:outline-none"
                />
                <button
                  onClick={() => setSelectedQuantity(selectedQuantity + 1)}
                  className="w-10 h-10 bg-blue-600 hover:bg-blue-700 rounded-xl flex items-center justify-center font-bold text-white shadow-xs active:scale-95 transition"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* Hızlı Preset Butonları */}
              <div className="flex gap-1.5 flex-1">
                {[5, 10, 20].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setSelectedQuantity(preset)}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition active:scale-95 ${
                      selectedQuantity === preset
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    +{preset}
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
                <span>Sepete Ekle ({selectedQuantity} {product.unit})</span>
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
