import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useApp } from '../context/AppContext';
import { b2bStoreCategories } from '../data/b2bCategories';
import type { Product } from '../types';
import { 
  Search, 
  Plus, 
  Minus, 
  ShoppingBag, 
  Package, 
  UserPlus, 
  X, 
  ArrowRight, 
  ScanBarcode, 
  CheckCircle2,
  Sparkles,
  Check,
  TrendingDown,
  LayoutGrid,
  List,
  Eye,
  Gift,
  Truck,
  Flame,
  Camera
} from 'lucide-react';
import { BarcodeScannerModal } from '../components/BarcodeScannerModal';
import { ProductDetailModal } from '../components/ProductDetailModal';
import { ProductPhotoModal } from '../components/ProductPhotoModal';
import { getProductImageUrl } from '../utils/productImages';

export const CatalogPage: React.FC = () => {
  const { 
    userRole,
    currentCustomerUser,
    selectedCustomer, 
    calculateCustomerPrice,
    cart, 
    addToCart, 
    updateCartItemQuantity, 
    cartSummary, 
    setActiveTab,
    activeCampaigns,
    openCampaignsModal,
    saleMode,
    vanPlate,
    getVanStockByCode
  } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedB2BCategory, setSelectedB2BCategory] = useState<string>('all');
  const [showOnlyCampaigns, setShowOnlyCampaigns] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scanToast, setScanToast] = useState<{ message: string; success: boolean } | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [photoProduct, setPhotoProduct] = useState<Product | null>(null);

  // IndexedDB'den ürünleri çek
  const products = useLiveQuery(() => db.products.toArray(), []);

  const activeCustomer = userRole === 'customer' ? currentCustomerUser : selectedCustomer;

  // Filtreleme
  const filteredProducts = useMemo(() => {
    if (!products) return [];

    let result = products.filter((product) => {
      const matchesSearch =
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.barcode.includes(searchTerm);

      if (!matchesSearch) return false;

      // B2B Bağımsız Kategori Filtresi
      if (selectedB2BCategory !== 'all') {
        const catObj = b2bStoreCategories.find((c) => c.id === selectedB2BCategory);
        if (catObj?.filterKeyword) {
          const kw = catObj.filterKeyword.toLowerCase();
          const matchCat = product.category.toLowerCase().includes(kw) || product.name.toLowerCase().includes(kw);
          if (!matchCat) return false;
        } else if (selectedB2BCategory === 'special-deals') {
          // İndirimli / özel fırsat ürünleri
          const priceInfo = calculateCustomerPrice(product, activeCustomer);
          if (!priceInfo.hasSpecialPrice) return false;
        }
      }

      return true;
    });

    if (showOnlyCampaigns) {
      const campaignTargetIds = new Set(activeCampaigns.map((c) => c.targetProductId).filter(Boolean));
      result = result.filter((p) => campaignTargetIds.has(p.id));
    }

    return result;
  }, [products, searchTerm, selectedB2BCategory, showOnlyCampaigns, activeCampaigns, activeCustomer, calculateCustomerPrice]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 2,
    }).format(val);
  };

  // Sepetteki miktarı bul
  const getItemQuantityInCart = (productId: string): number => {
    const item = cart.find((i) => i.productId === productId);
    return item ? item.quantity : 0;
  };

  const handleBarcodeScanned = (scannedCode: string) => {
    setSearchTerm(scannedCode);
    const matched = products?.find(
      (p) => p.barcode === scannedCode || p.code.toLowerCase() === scannedCode.toLowerCase()
    );

    if (matched) {
      addToCart(matched, 1);
      setScanToast({
        message: `"${matched.name}" sepete 1 adet eklendi!`,
        success: true,
      });
    } else {
      setScanToast({
        message: `"${scannedCode}" barkoduna ait ürün bulunamadı.`,
        success: false,
      });
    }
    setTimeout(() => setScanToast(null), 3500);
  };

  if (!products) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-4 border-blue-600 dark:border-blue-400 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="p-3 pb-32 space-y-3 max-w-lg mx-auto w-full">
      {/* Barkod Okuma Bildirimi Toast */}
      {scanToast && (
        <div
          className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 shadow-lg animate-in fade-in transition ${
            scanToast.success
              ? 'bg-emerald-600 text-white'
              : 'bg-rose-600 text-white'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{scanToast.message}</span>
        </div>
      )}

      {/* Müşteri Modu Karşılama & Özel Fiyat Bannerı */}
      {userRole === 'customer' && currentCustomerUser ? (
        <div className="bg-gradient-to-r from-emerald-900 to-slate-900 text-white rounded-2xl p-3.5 shadow-md border border-emerald-700/50 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-emerald-400 font-bold uppercase tracking-wider text-[10px]">
              <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
              Size Özel Toptan Anlaşma Fiyatları
            </span>
            <span className="bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full text-[10px] font-bold border border-emerald-500/30">
              Liste {currentCustomerUser.priceList}
            </span>
          </div>

          <h2 className="font-extrabold text-sm tracking-tight text-white leading-snug">
            Hoş Geldiniz, {currentCustomerUser.name}
          </h2>

          <div className="flex items-center justify-between text-xs text-slate-300 pt-1 border-t border-emerald-800/60">
            <span>
              Özel İskonto: <strong className="text-emerald-400">%{currentCustomerUser.specialDiscount || 0}</strong>
            </span>
            <span className="text-[11px] text-emerald-300 flex items-center gap-1 font-medium">
              <Check className="w-3 h-3" /> İndirimler ürünlere yansıtıldı
            </span>
          </div>
        </div>
      ) : (
        /* Plasiyer Modu Aktif Cari Bildirimi */
        !selectedCustomer ? (
          <div className="bg-amber-500/10 dark:bg-amber-950/30 border border-amber-500/30 dark:border-amber-800/50 rounded-xl p-3 flex items-center justify-between text-xs text-amber-900 dark:text-amber-300">
            <div>
              <span className="font-bold block">Sipariş İçin Cari Seçilmedi</span>
              <span className="text-[11px] text-amber-800 dark:text-amber-400">
                Standart Liste 1 fiyatları gösterilmektedir.
              </span>
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
          <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 rounded-xl p-2.5 text-xs text-blue-900 dark:text-blue-200 flex justify-between items-center">
            <div className="truncate mr-2">
              <span className="text-slate-500 dark:text-slate-400 text-[10px] block">Sipariş Alınan Müşteri</span>
              <span className="font-bold truncate block text-slate-900 dark:white">{selectedCustomer.name}</span>
            </div>
            <div className="text-right shrink-0">
              <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded">
                Liste {selectedCustomer.priceList} Fiyatı
              </span>
              {selectedCustomer.specialDiscount > 0 && (
                <span className="block text-[10px] text-blue-700 dark:text-blue-300 font-semibold mt-0.5">
                  + %{selectedCustomer.specialDiscount} İskonto
                </span>
              )}
            </div>
          </div>
        )
      )}

      {/* Aşama 8: Sıcak Satış Aktif Bilgi Çubuğu */}
      {userRole === 'plasiyer' && saleMode === 'hot' && (
        <div className="bg-amber-500/10 dark:bg-amber-950/40 border border-amber-500/30 rounded-2xl p-3 flex items-center justify-between gap-2 text-xs text-amber-900 dark:text-amber-200 animate-fadeIn">
          <div className="flex items-center gap-2 min-w-0">
            <Flame className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 animate-pulse" />
            <span className="truncate">
              <strong>Sıcak Satış Aktif:</strong> Ürünler <strong>{vanPlate}</strong> mobil araç stoğundan düşecektir.
            </span>
          </div>
          <button
            onClick={() => setActiveTab('van_stock')}
            className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold shadow-xs transition shrink-0 text-[11px] flex items-center gap-1"
          >
            <Truck className="w-3.5 h-3.5" />
            <span>Araç Stoğu</span>
          </button>
        </div>
      )}

      {/* Arama Çubuğu & Görünüm Değiştirici & Kamera Barkod Okuyucu */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder={userRole === 'customer' ? 'Ürün adı veya barkod ara...' : 'Ürün adı, barkod veya stok kodu...'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-xl pl-9 pr-8 py-2.5 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-emerald-500 shadow-xs transition"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs bg-slate-100 dark:bg-slate-800 rounded-full p-1"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Görünüm Modu: Vitrin (Grid) vs Liste */}
        <button
          onClick={() => setViewMode(prev => prev === 'grid' ? 'list' : 'grid')}
          className="px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center shadow-xs transition active:scale-95 shrink-0"
          title={viewMode === 'grid' ? "Kompakt Liste Modu" : "Vitrin (Grid) Modu"}
        >
          {viewMode === 'grid' ? <List className="w-5 h-5" /> : <LayoutGrid className="w-5 h-5" />}
        </button>

        {/* Barkod Okuma Butonu */}
        <button
          onClick={() => setIsScannerOpen(true)}
          className={`px-3.5 rounded-xl flex items-center justify-center shadow-xs transition active:scale-95 shrink-0 text-white ${
            userRole === 'customer'
              ? 'bg-emerald-600 hover:bg-emerald-700'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
          title="Kamera ile Barkod Oku"
        >
          <ScanBarcode className="w-5 h-5" />
        </button>
      </div>

      {/* Barkod Kamera Modalı */}
      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={handleBarcodeScanned}
      />

      {/* B2B Bağımsız Kategori Filtre Butonları (QR Menü Tarzı) */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs">
        {/* Kampanya Filtre Butonu */}
        <button
          onClick={() => setShowOnlyCampaigns(!showOnlyCampaigns)}
          className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition flex items-center gap-1.5 shadow-xs shrink-0 ${
            showOnlyCampaigns
              ? 'bg-purple-600 text-white shadow-sm ring-2 ring-purple-400/50'
              : 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 hover:bg-purple-100 dark:hover:bg-purple-900/40'
          }`}
          title="Kampanyalı Ürünleri Filtrele"
        >
          <Gift className="w-3.5 h-3.5" />
          <span>Fırsatlar</span>
          {activeCampaigns.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full font-black bg-purple-500 text-white">
              {activeCampaigns.length}
            </span>
          )}
        </button>

        {b2bStoreCategories.map((cat) => {
          const isSelected = selectedB2BCategory === cat.id;

          return (
            <button
              key={cat.id}
              onClick={() => setSelectedB2BCategory(cat.id)}
              className={`px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap transition flex items-center gap-1.5 ${
                isSelected
                  ? userRole === 'customer'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'
              }`}
            >
              <span>{cat.name}</span>
              {cat.badge && (
                <span className={`text-[9px] px-1 py-0.2 rounded font-bold uppercase ${
                  isSelected
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                }`}>
                  {cat.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Kampanya Filtresi Aktifse Bilgi & Modal Butonu */}
      {showOnlyCampaigns && (
        <div className="bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/80 rounded-2xl p-3 flex items-center justify-between gap-2 text-xs text-purple-900 dark:text-purple-200 animate-fadeIn">
          <div className="flex items-center gap-2 min-w-0">
            <Gift className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
            <span className="truncate">Promosyon ve hediye ürün fırsatları listeleniyor.</span>
          </div>
          <button
            onClick={openCampaignsModal}
            className="px-2.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold shadow-xs transition shrink-0 text-[11px]"
          >
            Tüm Kampanyalar
          </button>
        </div>
      )}

      {/* Ürün Listesi */}
      {filteredProducts.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 text-center border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
          <Package className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
          <p className="text-sm font-semibold">Aradığınız kriterde ürün bulunamadı.</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Lütfen arama terimini veya kategoriyi değiştirin.</p>
        </div>
      ) : viewMode === 'grid' ? (
        /* VİTRİN / GRID MODU (B2B E-Ticaret Arayüzü) */
        <div className="grid grid-cols-2 gap-2.5">
          {filteredProducts.map((product) => {
            const inCartQty = getItemQuantityInCart(product.id);
            const isOutOfStock = product.stockQuantity <= 0;
            const priceInfo = calculateCustomerPrice(product, activeCustomer);
            const imgUrl = getProductImageUrl(product.name, product.category, product.image);
            const productCampaign = activeCampaigns.find((c) => c.targetProductId === product.id);

            return (
              <div
                key={product.id}
                className="bg-white dark:bg-slate-900 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800/80 shadow-xs flex flex-col justify-between transition hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 group"
              >
                {/* Üst Görsel Alanı */}
                <div 
                  onClick={() => setDetailProduct(product)}
                  className="relative aspect-square bg-slate-100 dark:bg-slate-800 cursor-pointer overflow-hidden"
                >
                  <img 
                    src={imgUrl} 
                    alt={product.name} 
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                  />
                  {/* Hızlı İnceleme Butonu */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDetailProduct(product);
                    }}
                    className="absolute top-2 right-2 bg-black/50 hover:bg-black/80 text-white rounded-full p-1.5 backdrop-blur-xs transition shadow-sm active:scale-95"
                    title="Detaylı İncele"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>

                  {/* Fotoğraf Çek / Ekle Butonu */}
                  {userRole !== 'customer' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setPhotoProduct(product);
                      }}
                      className="absolute top-2 right-9 bg-black/50 hover:bg-black/80 text-white rounded-full p-1.5 backdrop-blur-xs transition shadow-sm active:scale-95"
                      title="Fotoğraf Çek / Ekle (ERP12)"
                    >
                      <Camera className="w-3.5 h-3.5 text-blue-300" />
                    </button>
                  )}

                  {/* Kampanya Rozeti */}
                  {productCampaign && (
                    <div className={`absolute top-2 ${userRole !== 'customer' ? 'right-16' : 'right-9'}`}>
                      <span className="flex items-center gap-0.5 text-[9px] font-extrabold text-white bg-purple-600/95 shadow-sm px-1.5 py-0.5 rounded-full backdrop-blur-xs border border-purple-400/40">
                        {productCampaign.badge}
                      </span>
                    </div>
                  )}

                  {/* Stok Rozeti */}
                  <div className="absolute top-2 left-2">
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full inline-block backdrop-blur-xs ${
                        product.stockQuantity > 0
                          ? 'bg-emerald-500/90 text-white'
                          : 'bg-rose-500/90 text-white'
                      }`}
                    >
                      {product.stockQuantity > 0 ? (userRole === 'customer' ? 'Stokta' : `${product.stockQuantity} ${product.unit}`) : 'Tükendi'}
                    </span>
                  </div>

                  {/* Özel İskonto Rozeti */}
                  {priceInfo.hasSpecialPrice && (
                    <div className="absolute bottom-2 left-2">
                      <span className="flex items-center gap-0.5 text-[9px] font-extrabold text-white bg-emerald-600/95 shadow-sm px-1.5 py-0.5 rounded-md backdrop-blur-xs">
                        <TrendingDown className="w-2.5 h-2.5" />
                        %{priceInfo.discountPercent} İndirim
                      </span>
                    </div>
                  )}
                </div>

                {/* Ürün Bilgi Gövdesi */}
                <div className="p-2.5 flex-1 flex flex-col justify-between gap-1.5">
                  <div>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500">
                      <span className="font-mono font-medium truncate max-w-[80px]">{product.code}</span>
                      <span className="truncate max-w-[70px]">{product.category}</span>
                    </div>

                    <h3 
                      onClick={() => setDetailProduct(product)}
                      className="font-bold text-xs text-slate-900 dark:text-white mt-1 leading-snug line-clamp-2 cursor-pointer hover:text-blue-600 dark:hover:text-emerald-400"
                    >
                      {product.name}
                    </h3>

                    {/* Sıcak Satış Araç Stoğu Rozeti */}
                    {userRole === 'plasiyer' && saleMode === 'hot' && (
                      <div className="mt-1">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md inline-flex items-center gap-1 ${
                          getVanStockByCode(product.code) > 0
                            ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20'
                            : 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20'
                        }`}>
                          <Truck className="w-2.5 h-2.5" />
                          <span>Araç: {getVanStockByCode(product.code)} {product.unit}</span>
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Fiyat & Sepet Aksiyon Satırı */}
                  <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800">
                    {priceInfo.hasSpecialPrice ? (
                      <div className="mb-2">
                        <div className="text-[10px] text-slate-400 dark:text-slate-500 line-through leading-none">
                          {formatCurrency(priceInfo.standardPrice)}
                        </div>
                        <div className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 leading-tight">
                          {formatCurrency(priceInfo.customerPrice)}
                        </div>
                      </div>
                    ) : (
                      <div className="mb-2">
                        <div className="text-[10px] text-slate-400 dark:text-slate-500 leading-none">Birim Fiyat</div>
                        <div className="text-sm font-extrabold text-blue-600 dark:text-blue-400 leading-tight">
                          {formatCurrency(priceInfo.customerPrice)}
                        </div>
                      </div>
                    )}

                    {/* Miktar Sayacı / Sepete Ekle Butonu */}
                    {inCartQty > 0 ? (
                      <div className={`flex items-center justify-between rounded-xl p-1 ${
                        userRole === 'customer'
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60'
                          : 'bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60'
                      }`}>
                        <button
                          onClick={() => updateCartItemQuantity(product.id, inCartQty - 1)}
                          className="w-6 h-6 bg-white dark:bg-slate-800 text-slate-700 dark:text-white rounded-lg flex items-center justify-center font-bold shadow-xs active:scale-90 transition hover:bg-slate-100 dark:hover:bg-slate-700"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="font-extrabold text-xs text-slate-900 dark:text-white">
                          {inCartQty}
                        </span>
                        <button
                          onClick={() => updateCartItemQuantity(product.id, inCartQty + 1)}
                          className={`w-6 h-6 text-white rounded-lg flex items-center justify-center font-bold shadow-xs active:scale-90 transition ${
                            userRole === 'customer'
                              ? 'bg-emerald-600 hover:bg-emerald-700'
                              : 'bg-blue-600 hover:bg-blue-700'
                          }`}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => addToCart(product, 1)}
                        disabled={isOutOfStock}
                        className={`w-full flex items-center justify-center gap-1 py-1.5 rounded-xl text-xs font-bold transition active:scale-95 shadow-xs ${
                          isOutOfStock
                            ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                            : userRole === 'customer'
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                            : 'bg-blue-600 hover:bg-blue-700 text-white'
                        }`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Ekle</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* KOMPAKT LİSTE MODU (Plasiyer Hızlı Raf Tarama) */
        <div className="space-y-2.5">
          {filteredProducts.map((product) => {
            const inCartQty = getItemQuantityInCart(product.id);
            const isOutOfStock = product.stockQuantity <= 0;
            const priceInfo = calculateCustomerPrice(product, activeCustomer);
            const imgUrl = getProductImageUrl(product.name, product.category, product.image);

            return (
              <div
                key={product.id}
                className="bg-white dark:bg-slate-900 rounded-2xl p-3 border border-slate-200 dark:border-slate-800/80 shadow-xs flex flex-col justify-between gap-2.5 transition hover:border-slate-300 dark:hover:border-slate-700"
              >
                {/* Üst Bilgi Satırı */}
                <div className="flex items-start gap-3">
                  {/* Görsel Thumbnail */}
                  <div 
                    onClick={() => setDetailProduct(product)}
                    className="w-16 h-16 rounded-xl bg-slate-100 dark:bg-slate-800 shrink-0 overflow-hidden cursor-pointer relative group border border-slate-100 dark:border-slate-800"
                  >
                    <img 
                      src={imgUrl} 
                      alt={product.name} 
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                      <Eye className="w-4 h-4" />
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-mono font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                        {product.code}
                      </span>
                      {userRole !== 'customer' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPhotoProduct(product);
                          }}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition inline-flex items-center gap-1 font-medium"
                          title="Fotoğraf Çek / Ekle (ERP12)"
                        >
                          <Camera className="w-2.5 h-2.5" />
                          <span className="text-[9px]">Fotoğraf</span>
                        </button>
                      )}
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
                        {product.category}
                      </span>

                      {/* Size Özel Fiyat İndirim Rozeti */}
                      {priceInfo.hasSpecialPrice && (
                        <span className="flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800/50 px-1.5 py-0.5 rounded-full">
                          <TrendingDown className="w-2.5 h-2.5" />
                          <span>%{priceInfo.discountPercent} Avantajlı</span>
                        </span>
                      )}

                      {/* Kampanya Rozeti */}
                      {activeCampaigns.some((c) => c.targetProductId === product.id) && (
                        <span className="flex items-center gap-0.5 text-[10px] font-extrabold text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-950/70 border border-purple-200 dark:border-purple-800/50 px-2 py-0.5 rounded-full">
                          <span>{activeCampaigns.find((c) => c.targetProductId === product.id)?.badge}</span>
                        </span>
                      )}
                    </div>

                    <h3 
                      onClick={() => setDetailProduct(product)}
                      className="font-bold text-sm text-slate-900 dark:text-white mt-1 leading-snug cursor-pointer hover:text-blue-600 dark:hover:text-emerald-400"
                    >
                      {product.name}
                    </h3>

                    <div className="text-[11px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">
                      Barkod: {product.barcode}
                    </div>

                    {/* Sıcak Satış Araç Stoğu Rozeti */}
                    {userRole === 'plasiyer' && saleMode === 'hot' && (
                      <div className="mt-1">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md inline-flex items-center gap-1 ${
                          getVanStockByCode(product.code) > 0
                            ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20'
                            : 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20'
                        }`}>
                          <Truck className="w-3 h-3" />
                          <span>Araç Stoğu: {getVanStockByCode(product.code)} {product.unit}</span>
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Stok Miktarı Rozeti */}
                  <div className="text-right shrink-0">
                    {userRole === 'customer' ? (
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-block ${
                          product.stockQuantity > 0
                            ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300'
                            : 'bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300'
                        }`}
                      >
                        {product.stockQuantity > 0 ? 'Stokta Var' : 'Tükendi'}
                      </span>
                    ) : (
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-block ${
                          product.stockQuantity > 20
                            ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300'
                            : product.stockQuantity > 0
                            ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300'
                            : 'bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300'
                        }`}
                      >
                        {product.stockQuantity > 0
                          ? `${product.stockQuantity} ${product.unit}`
                          : 'Tükendi'}
                      </span>
                    )}

                    <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                      KDV: %{product.vatRate}
                    </div>
                  </div>
                </div>

                {/* Alt Fiyat ve Sepet Aksiyon Satırı */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    {priceInfo.hasSpecialPrice ? (
                      <div>
                        <div className="text-[10px] text-slate-400 dark:text-slate-500 line-through leading-none">
                          {formatCurrency(priceInfo.standardPrice)}
                        </div>
                        <div className="flex items-baseline gap-1 mt-0.5">
                          <span className="text-base font-extrabold text-emerald-600 dark:text-emerald-400 leading-tight">
                            {formatCurrency(priceInfo.customerPrice)}
                          </span>
                          <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 px-1 rounded">
                            Size Özel
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="text-[10px] text-slate-400 dark:text-slate-500">Birim Fiyat</div>
                        <div className="text-base font-extrabold text-blue-600 dark:text-blue-400 leading-tight">
                          {formatCurrency(priceInfo.customerPrice)}
                          <span className="text-xs font-normal text-slate-500 dark:text-slate-400 ml-1">
                            / {product.unit}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    {inCartQty > 0 ? (
                      <div className={`flex items-center rounded-xl p-1 gap-2 ${
                        userRole === 'customer'
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60'
                          : 'bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60'
                      }`}>
                        <button
                          onClick={() => updateCartItemQuantity(product.id, inCartQty - 1)}
                          className="w-7 h-7 bg-white dark:bg-slate-800 text-slate-700 dark:text-white rounded-lg flex items-center justify-center font-bold shadow-xs active:scale-90 transition hover:bg-slate-100 dark:hover:bg-slate-700"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="font-extrabold text-sm text-slate-900 dark:text-white w-6 text-center">
                          {inCartQty}
                        </span>
                        <button
                          onClick={() => updateCartItemQuantity(product.id, inCartQty + 1)}
                          className={`w-7 h-7 text-white rounded-lg flex items-center justify-center font-bold shadow-xs active:scale-90 transition ${
                            userRole === 'customer'
                              ? 'bg-emerald-600 hover:bg-emerald-700'
                              : 'bg-blue-600 hover:bg-blue-700'
                          }`}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => addToCart(product, 1)}
                        disabled={isOutOfStock}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition active:scale-95 shadow-xs ${
                          isOutOfStock
                            ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                            : userRole === 'customer'
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                            : 'bg-blue-600 hover:bg-blue-700 text-white'
                        }`}
                      >
                        <Plus className="w-4 h-4" />
                        <span>Sepete Ekle</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Ürün Detay & Hızlı Bakış Modalı */}
      <ProductDetailModal
        isOpen={detailProduct !== null}
        product={detailProduct}
        onClose={() => setDetailProduct(null)}
        activeCustomer={activeCustomer}
      />

      {/* Ürün Fotoğrafı Çekme / Yükleme Modalı */}
      <ProductPhotoModal
        product={photoProduct}
        isOpen={Boolean(photoProduct)}
        onClose={() => setPhotoProduct(null)}
      />

      {/* Yüzen Hızlı Sepet Özeti Çubuğu (Sepette ürün varsa görünür) */}
      {cartSummary.totalItems > 0 && (
        <div className="fixed bottom-20 left-3 right-3 max-w-lg mx-auto z-30">
          <div
            onClick={() => setActiveTab('cart')}
            className={`text-white rounded-2xl p-3.5 shadow-2xl flex items-center justify-between cursor-pointer border active:scale-[0.99] transition ${
              userRole === 'customer'
                ? 'bg-slate-900 dark:bg-emerald-950 border-emerald-600/40 hover:bg-slate-850'
                : 'bg-slate-900 dark:bg-slate-950 border-slate-700 dark:border-slate-800 hover:bg-slate-850'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white relative shadow-sm ${
                userRole === 'customer' ? 'bg-emerald-600' : 'bg-blue-600'
              }`}>
                <ShoppingBag className="w-5 h-5" />
                <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-slate-900">
                  {cartSummary.totalItems}
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-400 block">Sepet Toplamı</span>
                <span className="font-bold text-sm text-emerald-400">
                  {formatCurrency(cartSummary.grandTotal)}
                </span>
              </div>
            </div>

            <div className={`flex items-center gap-1 text-xs font-bold px-3 py-2 rounded-xl text-white shadow-sm ${
              userRole === 'customer' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}>
              <span>Sepeti Gör</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
