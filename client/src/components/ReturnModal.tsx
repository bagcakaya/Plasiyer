import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useApp } from '../context/AppContext';
import type { Product, ReturnItem, ReturnReason } from '../types';
import { 
  X, 
  RotateCcw, 
  Search, 
  Plus, 
  Trash2, 
  AlertTriangle, 
  Printer, 
  ScanBarcode, 
  ShoppingBag 
} from 'lucide-react';
import { BarcodeScannerModal } from './BarcodeScannerModal';

const REASON_OPTIONS: { id: ReturnReason; label: string; badgeColor: string }[] = [
  { id: 'hasarli_kusurlu', label: 'Hasarlı / Kusurlu Ürün', badgeColor: 'bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300' },
  { id: 'skt_gecmis', label: 'SKT Geçmiş / Yaklaşmış', badgeColor: 'bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300' },
  { id: 'yanlis_siparis', label: 'Yanlış Sipariş / Sevkiyat', badgeColor: 'bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300' },
  { id: 'fazla_sevkiyat', label: 'Fazla Sevkiyat', badgeColor: 'bg-purple-100 text-purple-700 dark:bg-purple-950/70 dark:text-purple-300' },
  { id: 'musteri_vazgecti', label: 'Müşteri Talebi / İptal', badgeColor: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  { id: 'diger', label: 'Diğer (Özel Neden)', badgeColor: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
];

export const ReturnModal: React.FC = () => {
  const { 
    isReturnModalOpen, 
    returnTargetCustomer, 
    closeReturnModal, 
    createReturn, 
    openPrintSlip,
    calculateCustomerPrice 
  } = useApp();

  const customers = useLiveQuery(() => db.customers.toArray(), []) || [];
  const products = useLiveQuery(() => db.products.toArray(), []) || [];

  // Müşteri seçimi
  const [selectedCustId, setSelectedCustId] = useState<string>('');
  
  // Ürün ekleme formu
  const [productSearch, setProductSearch] = useState<string>('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [unitPrice, setUnitPrice] = useState<number>(0);
  const [reason, setReason] = useState<ReturnReason>('hasarli_kusurlu');
  const [itemNote, setItemNote] = useState<string>('');
  const [generalNotes, setGeneralNotes] = useState<string>('');

  // Eklenen kalemler
  const [items, setItems] = useState<ReturnItem[]>([]);
  const [isScannerOpen, setIsScannerOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Aktif Cari
  const activeCustomer = useMemo(() => {
    if (returnTargetCustomer) return returnTargetCustomer;
    if (selectedCustId) return customers.find((c) => c.id === selectedCustId) || null;
    return null;
  }, [returnTargetCustomer, selectedCustId, customers]);

  // Ürün arama filtreleme
  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return [];
    const term = productSearch.toLowerCase();
    return products.filter((p) => 
      p.name.toLowerCase().includes(term) || 
      p.code.toLowerCase().includes(term) ||
      p.barcode.includes(term)
    ).slice(0, 10);
  }, [productSearch, products]);

  // Ürün seçildiğinde birim fiyatı otomatik ata
  const handleSelectProduct = (prod: Product) => {
    setSelectedProduct(prod);
    const priceInfo = calculateCustomerPrice(prod, activeCustomer);
    setUnitPrice(priceInfo.customerPrice);
    setProductSearch(prod.name);
  };

  // Barkod okunduğunda ürünü bul
  const handleBarcodeScanned = (barcode: string) => {
    const matched = products.find((p) => p.barcode === barcode || p.code.toLowerCase() === barcode.toLowerCase());
    if (matched) {
      handleSelectProduct(matched);
      setIsScannerOpen(false);
    }
  };

  // Kalem Ekle
  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) {
      setErrorMessage('Lütfen iade edilecek bir ürün seçin.');
      return;
    }
    if (quantity <= 0) {
      setErrorMessage('Miktar 0 dan büyük olmalıdır.');
      return;
    }
    if (unitPrice < 0) {
      setErrorMessage('Birim fiyat negatif olamaz.');
      return;
    }

    const netTotal = quantity * unitPrice;
    const vatRate = selectedProduct.vatRate || 1;
    const vatAmount = netTotal * (vatRate / 100);
    const lineTotal = netTotal + vatAmount;

    const newItem: ReturnItem = {
      productId: selectedProduct.id,
      productCode: selectedProduct.code,
      productName: selectedProduct.name,
      unit: selectedProduct.unit || 'Adet',
      quantity,
      unitPrice,
      vatRate,
      totalAmount: Math.round(lineTotal * 100) / 100,
      reason,
      notes: itemNote.trim() || undefined,
    };

    setItems((prev) => [...prev, newItem]);
    setSelectedProduct(null);
    setProductSearch('');
    setQuantity(1);
    setUnitPrice(0);
    setItemNote('');
    setErrorMessage(null);
  };

  // Kalem Sil
  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Finansal İcmal
  const totals = useMemo(() => {
    let subtotal = 0;
    let totalVat = 0;

    items.forEach((it) => {
      const net = it.quantity * it.unitPrice;
      const vat = net * (it.vatRate / 100);
      subtotal += net;
      totalVat += vat;
    });

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      totalVat: Math.round(totalVat * 100) / 100,
      grandTotal: Math.round((subtotal + totalVat) * 100) / 100,
    };
  }, [items]);

  // İade Fişini Onayla
  const handleSubmitReturn = async () => {
    if (!activeCustomer) {
      setErrorMessage('Lütfen iade yapılacak cari hesabı seçiniz.');
      return;
    }
    if (items.length === 0) {
      setErrorMessage('Lütfen en az 1 adet iade kalemi ekleyiniz.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const prevBal = activeCustomer.balance || 0;
      const res = await createReturn({
        customerId: activeCustomer.id,
        customerCode: activeCustomer.code,
        customerName: activeCustomer.name,
        items,
        subtotal: totals.subtotal,
        totalVat: totals.totalVat,
        grandTotal: totals.grandTotal,
        notes: generalNotes.trim() || undefined,
      });

      if (res.success && res.returnRecord) {
        // Otomatik termal teslim fişi yazdırma modalını aç
        openPrintSlip({
          type: 'return',
          returnData: res.returnRecord,
          customerPreviousBalance: prevBal,
        });

        // Modalı temizle ve kapat
        setItems([]);
        setSelectedProduct(null);
        setProductSearch('');
        setGeneralNotes('');
        closeReturnModal();
      } else {
        setErrorMessage(res.error || 'İade fişi kaydedilemedi.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Beklenmeyen bir hata oluştu.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 2,
    }).format(val);
  };

  if (!isReturnModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Başlık Barı */}
        <div className="p-4 bg-gradient-to-r from-rose-700 to-rose-900 text-white flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center border border-white/20">
              <RotateCcw className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-extrabold tracking-tight">Saha İade / Değişim Fişi</h2>
              <span className="text-[11px] text-rose-200 block">
                Müşteriden kusurlu / hasarlı ürün teslim alma fişi
              </span>
            </div>
          </div>

          <button
            onClick={closeReturnModal}
            className="p-1.5 rounded-full hover:bg-white/20 text-white transition active:scale-95"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Gövde */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1 text-xs">
          {/* Hata Bildirimi */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300 flex items-center gap-2 font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Müşteri (Cari) Bilgisi veya Seçimi */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              İade Alınan Müşteri (Cari Hesap):
            </label>
            {activeCustomer ? (
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <div className="font-extrabold text-sm text-slate-900 dark:text-white">
                    {activeCustomer.name}
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                    Kod: {activeCustomer.code} • Liste {activeCustomer.priceList}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 block font-medium">Güncel Bakiye</span>
                  <span className={`text-xs font-black ${
                    activeCustomer.balance > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                  }`}>
                    {formatCurrency(activeCustomer.balance)}
                  </span>
                </div>
              </div>
            ) : (
              <select
                value={selectedCustId}
                onChange={(e) => setSelectedCustId(e.target.value)}
                className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
              >
                <option value="">-- Lütfen Cari Hesap Seçin --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code}) - {formatCurrency(c.balance)}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Yeni Kalem Ekleme Formu */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-xs text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <ShoppingBag className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                İade Edilecek Ürünü Ekle
              </span>

              {/* Barkod Okutma Kısayolu */}
              <button
                type="button"
                onClick={() => setIsScannerOpen(true)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10px] shadow-xs transition active:scale-95"
              >
                <ScanBarcode className="w-3.5 h-3.5" />
                <span>Barkod Oku</span>
              </button>
            </div>

            {/* Ürün Arama */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Ürün adı, barkod veya stok kodu yazın..."
                value={productSearch}
                onChange={(e) => {
                  setProductSearch(e.target.value);
                  if (selectedProduct) setSelectedProduct(null);
                }}
                className="w-full pl-8 pr-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500"
              />

              {/* Ürün Arama Sonuçları Açılır Menüsü */}
              {productSearch && !selectedProduct && filteredProducts.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredProducts.map((p) => {
                    const priceInfo = calculateCustomerPrice(p, activeCustomer);
                    return (
                      <div
                        key={p.id}
                        onClick={() => handleSelectProduct(p)}
                        className="p-2.5 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer flex items-center justify-between text-xs"
                      >
                        <div className="truncate mr-2">
                          <span className="font-bold text-slate-900 dark:text-white block truncate">{p.name}</span>
                          <span className="text-[10px] font-mono text-slate-400">{p.code} • {p.barcode}</span>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-bold text-rose-600 dark:text-rose-400">{formatCurrency(priceInfo.customerPrice)}</span>
                          <span className="text-[10px] text-slate-400 block">/ {p.unit}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Miktar, Birim Fiyat ve İade Nedeni Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-0.5">
                  Miktar ({selectedProduct ? selectedProduct.unit : 'Adet'}):
                </label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  value={quantity || ''}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '') {
                      setQuantity(0);
                    } else {
                      setQuantity(Number(v));
                    }
                  }}
                  onBlur={() => {
                    if (!quantity || quantity <= 0) setQuantity(1);
                  }}
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500 text-center"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-0.5">
                  Birim Fiyat (TL):
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={unitPrice}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setUnitPrice(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500 text-right font-mono"
                />
              </div>

              <div className="col-span-2 sm:col-span-1">
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-0.5">
                  İade Nedeni:
                </label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value as ReturnReason)}
                  className="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500 truncate"
                >
                  {REASON_OPTIONS.map((r) => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Kalem Notu & Ekle Butonu */}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Kalem açıklaması (Örn: Paket patlak, SKT: 10/2026)..."
                value={itemNote}
                onChange={(e) => setItemNote(e.target.value)}
                className="flex-1 px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddItem}
                disabled={!selectedProduct}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 text-white font-bold rounded-xl text-xs flex items-center gap-1 shadow-xs transition active:scale-95 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Kalem Ekle</span>
              </button>
            </div>
          </div>

          {/* İade Kalemleri Tablosu / Listesi */}
          <div>
            <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              <span>İade Alınacak Ürünler ({items.length} Kalem):</span>
              <span className="font-mono text-rose-600 dark:text-rose-400 font-extrabold">{formatCurrency(totals.grandTotal)}</span>
            </div>

            {items.length === 0 ? (
              <div className="p-6 text-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 text-slate-400">
                Henüz iade kalemi eklenmedi. Yukarıdaki formdan ürün arayabilir veya barkod okutabilirsiniz.
              </div>
            ) : (
              <div className="space-y-2">
                {items.map((item, idx) => {
                  const reasonObj = REASON_OPTIONS.find((r) => r.id === item.reason);
                  return (
                    <div
                      key={idx}
                      className="p-2.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between gap-2"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-xs text-slate-900 dark:text-white truncate">
                            {item.productName}
                          </span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${reasonObj?.badgeColor}`}>
                            {reasonObj?.label}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {item.quantity} {item.unit} x {formatCurrency(item.unitPrice)}
                          {item.notes && <span className="italic text-slate-400 ml-1.5">({item.notes})</span>}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-extrabold text-xs text-rose-600 dark:text-rose-400 font-mono">
                          {formatCurrency(item.totalAmount)}
                        </span>
                        <button
                          onClick={() => handleRemoveItem(idx)}
                          className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition"
                          title="Kalemi Sil"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Genel Açıklama Notu */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
              Genel İade / Değişim Notu (İsteğe Bağlı):
            </label>
            <input
              type="text"
              placeholder="Örn: Plasiyer aracıyla depoya sevk edildi. Faturalı teslim alındı..."
              value={generalNotes}
              onChange={(e) => setGeneralNotes(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
            />
          </div>

          {/* Finansal İcmal & Bakiye Düşümü Kutusu */}
          {items.length > 0 && activeCustomer && (
            <div className="p-3.5 rounded-2xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 space-y-1.5">
              <div className="flex justify-between text-slate-600 dark:text-slate-400 text-xs">
                <span>Ara Toplam (Matrah):</span>
                <span className="font-mono font-medium">{formatCurrency(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400 text-xs">
                <span>Hesaplanan KDV:</span>
                <span className="font-mono font-medium">{formatCurrency(totals.totalVat)}</span>
              </div>
              <div className="flex justify-between text-rose-900 dark:text-rose-300 text-sm font-extrabold pt-1 border-t border-rose-200/60 dark:border-rose-900/60">
                <span>Toplam İade Bedeli (KDV Dahil):</span>
                <span className="font-mono text-base">{formatCurrency(totals.grandTotal)}</span>
              </div>

              {/* Bakiye Değişimi */}
              <div className="pt-1.5 flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400 border-t border-rose-200/40 dark:border-rose-900/40">
                <span>Müşteri Cari Bakiyesi:</span>
                <span>
                  {formatCurrency(activeCustomer.balance)} ➔ <strong className="text-emerald-600 dark:text-emerald-400">{formatCurrency(activeCustomer.balance - totals.grandTotal)}</strong>
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Alt Aksiyon Butonları */}
        <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={closeReturnModal}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition"
          >
            Vazgeç
          </button>

          <button
            type="button"
            onClick={handleSubmitReturn}
            disabled={isSubmitting || items.length === 0 || !activeCustomer}
            className="px-5 py-2.5 rounded-xl text-xs font-extrabold text-white bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-400 flex items-center gap-1.5 shadow-md shadow-rose-600/30 transition active:scale-95"
          >
            <Printer className="w-4 h-4" />
            <span>{isSubmitting ? 'Kaydediliyor...' : 'İade Fişini Kes & Yazdır'}</span>
          </button>
        </div>
      </div>

      {/* Barkod Okuyucu Modalı */}
      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={handleBarcodeScanned}
      />
    </div>
  );
};
