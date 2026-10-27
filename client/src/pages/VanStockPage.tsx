import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { db } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import type { VanLoadingItem, VanAuditItem } from '../types';
import {
  Truck,
  Flame,
  Snowflake,
  Search,
  Plus,
  Trash2,
  CheckCircle2,
  Printer,
  History,
  ClipboardCheck,
  Package,
  Layers,
  Edit2
} from 'lucide-react';

export const VanStockPage: React.FC = () => {
  const {
    saleMode,
    setSaleMode,
    vanPlate,
    setVanPlate,
    vanStocks,
    vanLoadings,
    vanAudits,
    loadVanStock,
    auditVanStock,
    openPrintSlip,
  } = useApp();

  const [activeSubTab, setActiveSubTab] = useState<'stocks' | 'loading' | 'audit' | 'history'>('stocks');
  const [searchTerm, setSearchTerm] = useState('');
  const [isEditingPlate, setIsEditingPlate] = useState(false);
  const [plateInput, setPlateInput] = useState(vanPlate);

  // Ürünler veritabanından
  const allProducts = useLiveQuery(() => db.products.toArray(), []) || [];

  // 1. Yükleme Sepeti
  const [loadingItems, setLoadingItems] = useState<VanLoadingItem[]>([]);
  const [selectedProductToAdd, setSelectedProductToAdd] = useState<string>('');
  const [addQty, setAddQty] = useState<number>(10);
  const [loadingNotes, setLoadingNotes] = useState<string>('');
  const [isSubmittingLoading, setIsSubmittingLoading] = useState(false);

  // 2. Akşam Sayımı State'i
  const [auditCounts, setAuditCounts] = useState<Record<string, number>>({});
  const [auditNotes, setAuditNotes] = useState<string>('');
  const [isSubmittingAudit, setIsSubmittingAudit] = useState(false);

  // Filtrelenmiş araç stokları
  const filteredStocks = vanStocks.filter((s) =>
    s.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.productCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.barcode && s.barcode.includes(searchTerm))
  );

  // İcmal Sayıları
  const totalItemsCount = vanStocks.reduce((sum, s) => sum + s.currentStock, 0);
  const totalSoldToday = vanStocks.reduce((sum, s) => sum + s.totalSoldToday, 0);
  const totalReturnedToday = vanStocks.reduce((sum, s) => sum + s.totalReturnedToday, 0);
  const totalLoadedToday = vanStocks.reduce((sum, s) => sum + s.totalLoadedToday, 0);

  // Plaka kaydet
  const handleSavePlate = () => {
    if (plateInput.trim()) {
      setVanPlate(plateInput.trim().toUpperCase());
      setIsEditingPlate(false);
    }
  };

  // Yükleme sepetine ekleme
  const handleAddLoadingItem = () => {
    if (!selectedProductToAdd) return;
    const prod = allProducts.find((p) => p.code === selectedProductToAdd);
    if (!prod) return;

    const existingIdx = loadingItems.findIndex((it) => it.productCode === prod.code);
    if (existingIdx >= 0) {
      const copy = [...loadingItems];
      copy[existingIdx].quantity += addQty;
      setLoadingItems(copy);
    } else {
      setLoadingItems([
        ...loadingItems,
        {
          productId: prod.id,
          productCode: prod.code,
          productName: prod.name,
          unit: prod.unit,
          barcode: prod.barcode,
          unitPrice: prod.price2 || prod.price1,
          quantity: addQty,
        },
      ]);
    }
    setAddQty(10);
  };

  const handleRemoveLoadingItem = (idx: number) => {
    setLoadingItems(loadingItems.filter((_, i) => i !== idx));
  };

  const handleConfirmLoading = async () => {
    if (loadingItems.length === 0) return;
    setIsSubmittingLoading(true);
    try {
      const record = await loadVanStock(loadingItems, loadingNotes);
      setLoadingItems([]);
      setLoadingNotes('');
      // Termal fişi önizlemeye aç
      openPrintSlip({
        type: 'van_loading',
        vanLoadingData: record,
      });
      setActiveSubTab('stocks');
    } catch (err: any) {
      alert('Yükleme kaydedilemedi: ' + err.message);
    } finally {
      setIsSubmittingLoading(false);
    }
  };

  // Sayım Miktar Değişimi
  const handleAuditCountChange = (productCode: string, value: string) => {
    const num = parseInt(value, 10);
    setAuditCounts((prev) => ({
      ...prev,
      [productCode]: isNaN(num) ? 0 : num,
    }));
  };

  // Sayımı Kaydetme
  const handleConfirmAudit = async () => {
    if (vanStocks.length === 0) return;
    setIsSubmittingAudit(true);
    try {
      const auditItems: VanAuditItem[] = vanStocks.map((stock) => {
        const counted = auditCounts[stock.productCode] !== undefined 
          ? auditCounts[stock.productCode] 
          : stock.currentStock;
        const diff = counted - stock.currentStock;
        const price = stock.unitPrice || 100;
        return {
          productId: stock.productId,
          productCode: stock.productCode,
          productName: stock.productName,
          unit: stock.unit,
          theoreticalStock: stock.currentStock,
          countedStock: counted,
          difference: diff,
          unitPrice: price,
          differenceAmount: diff * price,
        };
      });

      const auditRecord = await auditVanStock(auditItems, auditNotes);
      setAuditCounts({});
      setAuditNotes('');
      openPrintSlip({
        type: 'van_audit',
        vanAuditData: auditRecord,
      });
      setActiveSubTab('stocks');
    } catch (err: any) {
      alert('Sayım kaydedilemedi: ' + err.message);
    } finally {
      setIsSubmittingAudit(false);
    }
  };

  return (
    <div className="space-y-4 pb-20 md:pb-8 animate-fadeIn w-full max-w-7xl mx-auto p-3 md:p-6">
      {/* Üst Araç & Sıcak Satış Durum Kartı */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Araç & Plaka Bilgisi */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 shadow-xs">
              <Truck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Mobil Araç Deposu</span>
                {!isEditingPlate && (
                  <button 
                    onClick={() => setIsEditingPlate(true)}
                    className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    title="Plakayı Değiştir"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {isEditingPlate ? (
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="text"
                    value={plateInput}
                    onChange={(e) => setPlateInput(e.target.value)}
                    className="px-2.5 py-1 text-sm font-black border border-slate-300 dark:border-slate-700 rounded-lg uppercase w-32 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                  <button
                    onClick={handleSavePlate}
                    className="px-2.5 py-1 text-xs bg-emerald-600 text-white font-bold rounded-lg"
                  >
                    Kaydet
                  </button>
                  <button
                    onClick={() => { setIsEditingPlate(false); setPlateInput(vanPlate); }}
                    className="px-2 py-1 text-xs text-slate-500 font-medium"
                  >
                    İptal
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-lg font-black text-slate-900 dark:text-white tracking-wide bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 rounded-lg border border-slate-300 dark:border-slate-700 font-mono">
                    {vanPlate}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">02 Araç Depo</span>
                </div>
              )}
            </div>
          </div>

          {/* Satış Modu Butonları (Sıcak 🔥 vs Soğuk ❄️) */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl">
            <button
              onClick={() => setSaleMode('hot')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                saleMode === 'hot'
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Flame className="w-4 h-4 text-amber-300 animate-pulse" />
              <span>Sıcak Satış (Araçtan)</span>
            </button>
            <button
              onClick={() => setSaleMode('cold')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                saleMode === 'cold'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Snowflake className="w-4 h-4 text-blue-200" />
              <span>Soğuk Satış (Merkez)</span>
            </button>
          </div>
        </div>

        {/* Aktif Mod Açıklaması */}
        <div className={`p-3 rounded-2xl text-xs flex items-center gap-2 border ${
          saleMode === 'hot'
            ? 'bg-amber-500/10 border-amber-500/20 text-amber-900 dark:text-amber-200'
            : 'bg-blue-500/10 border-blue-500/20 text-blue-900 dark:text-blue-200'
        }`}>
          {saleMode === 'hot' ? (
            <>
              <Flame className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>
                <strong>Sıcak Satış Aktif:</strong> Kesilen siparişler doğrudan <strong>{vanPlate}</strong> araç stoğundan düşer ve anında teslim fişi düzenlenir.
              </span>
            </>
          ) : (
            <>
              <Snowflake className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <span>
                <strong>Soğuk Satış Aktif:</strong> Siparişler merkez ana depoya iletilir, araç stoğundan düşüm yapılmaz.
              </span>
            </>
          )}
        </div>

        {/* İcmal Sayaçları */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-1">
          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">Araçtaki Çeşit</span>
            <span className="text-lg font-black text-slate-900 dark:text-white mt-0.5 block">{vanStocks.length} Kalem</span>
          </div>

          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">Bugün Yüklenen</span>
            <span className="text-lg font-black text-indigo-600 dark:text-indigo-400 mt-0.5 block">+{totalLoadedToday} Adet</span>
          </div>

          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">Sıcak Satılan</span>
            <span className="text-lg font-black text-amber-600 dark:text-amber-400 mt-0.5 block">-{totalSoldToday} Adet</span>
          </div>

          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">İade Alınan</span>
            <span className="text-lg font-black text-blue-600 dark:text-blue-400 mt-0.5 block">+{totalReturnedToday} Adet</span>
          </div>

          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">Fiziki Mevcut</span>
            <span className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-0.5 block">{totalItemsCount} Adet</span>
          </div>
        </div>
      </div>

      {/* Alt Sekmeler: Stoklar / Sabah Yükleme / Akşam Sayımı / Geçmiş */}
      <div className="flex gap-2 overflow-x-auto pb-1 text-xs">
        <button
          onClick={() => setActiveSubTab('stocks')}
          className={`flex items-center gap-1.5 px-4 py-2.5 rounded-2xl font-bold whitespace-nowrap transition shadow-xs ${
            activeSubTab === 'stocks'
              ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Araç İçi Stok ({vanStocks.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('loading')}
          className={`flex items-center gap-1.5 px-4 py-2.5 rounded-2xl font-bold whitespace-nowrap transition shadow-xs ${
            activeSubTab === 'loading'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <Plus className="w-4 h-4" />
          <span>Sabah Mal Yükleme</span>
        </button>

        <button
          onClick={() => setActiveSubTab('audit')}
          className={`flex items-center gap-1.5 px-4 py-2.5 rounded-2xl font-bold whitespace-nowrap transition shadow-xs ${
            activeSubTab === 'audit'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <ClipboardCheck className="w-4 h-4" />
          <span>Akşam Araç Sayımı & Fark</span>
        </button>

        <button
          onClick={() => setActiveSubTab('history')}
          className={`flex items-center gap-1.5 px-4 py-2.5 rounded-2xl font-bold whitespace-nowrap transition shadow-xs ${
            activeSubTab === 'history'
              ? 'bg-slate-700 text-white shadow-sm'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Fiş Geçmişi</span>
        </button>
      </div>

      {/* 1. SEKME: ARAÇ STOK LİSTESİ */}
      {activeSubTab === 'stocks' && (
        <div className="space-y-3">
          {/* Arama */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Araçtaki ürünü ada veya barkoda göre ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-2xl pl-9 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-xs"
            />
          </div>

          {filteredStocks.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 text-center border border-slate-200 dark:border-slate-800">
              <Package className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
              <p className="font-bold text-sm text-slate-700 dark:text-slate-200">Araçta bu kriterde stok bulunamadı.</p>
              <p className="text-xs text-slate-400 mt-1">Sabah Mal Yükleme sekmesinden araca ürün yükleyebilirsiniz.</p>
              <button
                onClick={() => setActiveSubTab('loading')}
                className="mt-3 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition shadow-xs"
              >
                + Araca Mal Yükle
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredStocks.map((stock) => {
                const isCritical = stock.currentStock <= 5;
                const isZero = stock.currentStock === 0;

                return (
                  <div
                    key={stock.productCode}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 shadow-xs space-y-3 transition-all hover:border-slate-300 dark:hover:border-slate-700"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <span className="text-[10px] text-slate-400 font-mono block">{stock.productCode}</span>
                        <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate">{stock.productName}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md font-medium">
                            Birim: {stock.unit}
                          </span>
                          {stock.barcode && (
                            <span className="text-[10px] text-slate-400 font-mono">Barkod: {stock.barcode}</span>
                          )}
                        </div>
                      </div>

                      {/* Mevcut Araç Stoğu Rozeti */}
                      <div className="text-right shrink-0">
                        <div className={`px-3 py-1.5 rounded-2xl font-black text-center ${
                          isZero
                            ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                            : isCritical
                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                            : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                        }`}>
                          <span className="text-xs block font-medium">Araç Stoğu</span>
                          <span className="text-base font-extrabold">{stock.currentStock} {stock.unit}</span>
                        </div>
                      </div>
                    </div>

                    {/* Gün İçi Hareket Detayı */}
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800/60 grid grid-cols-4 gap-2 text-center text-[10px]">
                      <div>
                        <span className="text-slate-400 block">Gün Başı</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">{stock.initialStock}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Yüklenen</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">+{stock.totalLoadedToday}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Satılan</span>
                        <span className="font-bold text-amber-600 dark:text-amber-400">-{stock.totalSoldToday}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">İade Alınan</span>
                        <span className="font-bold text-blue-600 dark:text-blue-400">+{stock.totalReturnedToday}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 2. SEKME: SABAH ARAÇ MAL YÜKLEME (TRANSFER FİŞİ) */}
      {activeSubTab === 'loading' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-4">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
              <Plus className="w-5 h-5 text-emerald-600" />
              <span>Sabah Araç Mal Yükleme (Depodan Araca Transfer)</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Merkez ana depodan <strong>{vanPlate}</strong> nolu araca yüklenen ürünleri giriniz.
            </p>
          </div>

          {/* Ürün Seçim ve Ekleme Barı */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
            <div className="sm:col-span-7">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                Yüklenecek Ürün Seçin:
              </label>
              <select
                value={selectedProductToAdd}
                onChange={(e) => setSelectedProductToAdd(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-3 py-2.5 text-xs focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">-- Listeden Ürün Seçiniz --</option>
                {allProducts.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.name} ({p.unit}) - Depo Stoğu: {p.stockQuantity}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-3">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                Yüklenen Miktar:
              </label>
              <input
                type="number"
                min="1"
                value={addQty}
                onChange={(e) => setAddQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-3 py-2.5 text-xs font-bold text-center"
              />
            </div>

            <div className="sm:col-span-2">
              <button
                type="button"
                onClick={handleAddLoadingItem}
                disabled={!selectedProductToAdd}
                className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition shadow-xs flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Ekle</span>
              </button>
            </div>
          </div>

          {/* Yükleme Sepeti Listesi */}
          {loadingItems.length === 0 ? (
            <div className="p-6 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-slate-400 text-xs">
              Henüz yükleme listesine ürün eklenmedi. Yukarıdan ürün seçip miktarı giriniz.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400">
                      <th className="pb-2">ÜRÜN ADI</th>
                      <th className="pb-2 text-center">BİRİM</th>
                      <th className="pb-2 text-center">YÜKLENEN MİKTAR</th>
                      <th className="pb-2 text-right">İŞLEM</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {loadingItems.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                        <td className="py-2.5 font-semibold text-slate-900 dark:text-white">{item.productName}</td>
                        <td className="py-2.5 text-center text-slate-500">{item.unit}</td>
                        <td className="py-2.5 text-center font-bold text-emerald-600 dark:text-emerald-400">{item.quantity}</td>
                        <td className="py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveLoadingItem(idx)}
                            className="p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Yükleme Notu */}
              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                  Yükleme Notu / Sevk Açıklaması:
                </label>
                <input
                  type="text"
                  placeholder="örn: Sabah rutin sevkiyat yüklemesi..."
                  value={loadingNotes}
                  onChange={(e) => setLoadingNotes(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-3 py-2 text-xs"
                />
              </div>

              {/* Onay Butonu */}
              <button
                type="button"
                onClick={handleConfirmLoading}
                disabled={isSubmittingLoading}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 transition active:scale-98"
              >
                <CheckCircle2 className="w-5 h-5" />
                <span>Yüklemeyi Onayla & Araç Fişi Çıkar</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* 3. SEKME: AKŞAM ARAÇ SAYIMI & FARK HESAPLAMA */}
      {activeSubTab === 'audit' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-4">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-indigo-600" />
              <span>Akşam Araç Sayımı & Gün Sonu Mutabakatı</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Araçta fiilen saydığınız adetleri giriniz. Sistem teorik kalanla karşılaştırıp eksik/fazla farkını çıkarır.
            </p>
          </div>

          {vanStocks.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              Araçta kayıtlı ürün bulunmamaktadır.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400">
                      <th className="pb-2">ÜRÜN ADI</th>
                      <th className="pb-2 text-center">TEORİK KALAN</th>
                      <th className="pb-2 text-center w-28">FİİLİ SAYILAN</th>
                      <th className="pb-2 text-right">FARK</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {vanStocks.map((stock) => {
                      const counted = auditCounts[stock.productCode] !== undefined
                        ? auditCounts[stock.productCode]
                        : stock.currentStock;
                      const diff = counted - stock.currentStock;

                      return (
                        <tr key={stock.productCode} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                          <td className="py-2.5 font-semibold text-slate-900 dark:text-white">
                            <div>{stock.productName}</div>
                            <div className="text-[10px] text-slate-400">{stock.productCode} • {stock.unit}</div>
                          </td>
                          <td className="py-2.5 text-center font-bold text-slate-700 dark:text-slate-300">
                            {stock.currentStock} {stock.unit}
                          </td>
                          <td className="py-2.5 text-center">
                            <input
                              type="number"
                              min="0"
                              value={counted}
                              onChange={(e) => handleAuditCountChange(stock.productCode, e.target.value)}
                              className="w-20 text-center font-black bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl py-1 text-xs text-slate-900 dark:text-white"
                            />
                          </td>
                          <td className="py-2.5 text-right font-black">
                            {diff === 0 ? (
                              <span className="text-emerald-600 dark:text-emerald-400">0 (Tam)</span>
                            ) : diff > 0 ? (
                              <span className="text-blue-600 dark:text-blue-400">+{diff} (Fazla)</span>
                            ) : (
                              <span className="text-rose-600 dark:text-rose-400">{diff} (Eksik/Fire)</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Sayım Notu */}
              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                  Sayım & Mutabakat Açıklaması:
                </label>
                <input
                  type="text"
                  placeholder="örn: Gün sonu rutin sayımı yapıldı, fire tespit edilmedi..."
                  value={auditNotes}
                  onChange={(e) => setAuditNotes(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-3 py-2 text-xs"
                />
              </div>

              {/* Onayla & Fiş Çıkar */}
              <button
                type="button"
                onClick={handleConfirmAudit}
                disabled={isSubmittingAudit}
                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 transition active:scale-98"
              >
                <ClipboardCheck className="w-5 h-5" />
                <span>Sayımı Tamamla & Araç Sayım Tutanağı Çıkar</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* 4. SEKME: FİŞ GEÇMİŞİ */}
      {activeSubTab === 'history' && (
        <div className="space-y-4">
          {/* Yükleme Fişleri */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-3">
            <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <Plus className="w-4 h-4 text-emerald-600" />
              <span>Geçmiş Araç Yükleme Fişleri</span>
            </h4>
            {vanLoadings.length === 0 ? (
              <p className="text-xs text-slate-400">Henüz araç yükleme fişi kesilmemiş.</p>
            ) : (
              <div className="space-y-2">
                {vanLoadings.map((load) => (
                  <div
                    key={load.id}
                    className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white">{load.docNo}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {load.date} • {load.items.length} Kalem • Toplam {load.totalQuantity} Adet
                      </div>
                    </div>
                    <button
                      onClick={() => openPrintSlip({ type: 'van_loading', vanLoadingData: load })}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-xs flex items-center gap-1 transition shadow-xs"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Fiş Çıkar</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sayım Fişleri */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-3">
            <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-indigo-600" />
              <span>Geçmiş Araç Sayım Tutanakları</span>
            </h4>
            {vanAudits.length === 0 ? (
              <p className="text-xs text-slate-400">Henüz araç sayım tutanağı bulunmuyor.</p>
            ) : (
              <div className="space-y-2">
                {vanAudits.map((audit) => (
                  <div
                    key={audit.id}
                    className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white">{audit.docNo}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {audit.date} • Fark: {audit.totalDifference > 0 ? `+${audit.totalDifference}` : audit.totalDifference} Adet ({audit.totalDifferenceAmount.toFixed(2)} ₺)
                      </div>
                    </div>
                    <button
                      onClick={() => openPrintSlip({ type: 'van_audit', vanAuditData: audit })}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-xs flex items-center gap-1 transition shadow-xs"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Tutanak Çıkar</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
