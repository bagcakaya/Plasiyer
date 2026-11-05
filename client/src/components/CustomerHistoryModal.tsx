import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Search,
  Calendar,
  Package,
  BarChart3,
  ShoppingCart,
  RefreshCw,
  AlertCircle,
  Plus,
  Check,
  Layers,
  Wallet,
} from 'lucide-react';
import type {
  Customer,
  ServerConfig,
  CustomerHistoryResponse,
  CustomerHistoryItem,
} from '../types';
import { apiService } from '../services/apiService';
import { useApp } from '../context/AppContext';
import { db } from '../db';

interface CustomerHistoryModalProps {
  customer: Customer | null;
  serverConfig: ServerConfig;
  isOpen: boolean;
  onClose: () => void;
}

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    minimumFractionDigits: 2,
  }).format(val || 0);
};

const formatDateTr = (isoDate: string, time?: string) => {
  if (!isoDate) return '-';
  const parts = isoDate.slice(0, 10).split('-');
  const formatted =
    parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : isoDate;
  return time ? `${formatted} ${time}` : formatted;
};

const normalizeTr = (text: string) =>
  (text || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

export const CustomerHistoryModal: React.FC<CustomerHistoryModalProps> = ({
  customer,
  serverConfig,
  isOpen,
  onClose,
}) => {
  const { selectCustomer, setActiveTab, addToCart } = useApp();

  const [history, setHistory] = useState<CustomerHistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedYear, setSelectedYear] = useState<number | 'all'>('all');
  const [activeSubTab, setActiveSubTab] = useState<'items' | 'summary' | 'financials'>('items');
  const [searchTerm, setSearchTerm] = useState('');
  const [addedKey, setAddedKey] = useState<string | null>(null);

  const loadHistory = async () => {
    if (!customer) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiService.fetchCustomerHistory(
        serverConfig,
        customer.code || customer.id
      );
      setHistory(res);
    } catch (err: any) {
      setError(err.message || 'Cari raporları ve işlem geçmişi yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && customer) {
      setSelectedYear('all');
      setActiveSubTab('items');
      setSearchTerm('');
      loadHistory();
    }
  }, [isOpen, customer?.id]);

  // Seçili yıla ve aramaya göre filtrelenen ürün hareketleri
  const filteredItems = useMemo(() => {
    const rawItems = history?.items || [];
    const q = normalizeTr(searchTerm.trim());

    return rawItems.filter((it) => {
      if (selectedYear !== 'all' && it.year !== selectedYear) return false;
      if (!q) return true;
      return (
        normalizeTr(it.productName).includes(q) ||
        normalizeTr(it.docNo).includes(q) ||
        normalizeTr(it.docType).includes(q) ||
        it.date.includes(q) ||
        formatDateTr(it.date).includes(q)
      );
    });
  }, [history?.items, selectedYear, searchTerm]);

  // Ürün bazlı özet (en çok aldıkları, son alış tarihi ve son birim fiyatı)
  const productSummaryList = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        productId: string;
        productCode: string;
        productName: string;
        unit: string;
        vatRate: number;
        totalQty: number;
        totalAmount: number;
        txCount: number;
        lastDate: string;
        lastUnitPrice: number;
      }
    >();

    filteredItems.forEach((it) => {
      if (it.isReturn) return;
      const key = it.productCode || it.productName;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          key,
          productId: it.productId,
          productCode: it.productCode,
          productName: it.productName,
          unit: it.unit || 'Adet',
          vatRate: it.vatRate || 1,
          totalQty: it.quantity,
          totalAmount: it.grandTotal,
          txCount: 1,
          lastDate: it.date,
          lastUnitPrice: it.unitPrice,
        });
      } else {
        existing.totalQty = Math.round((existing.totalQty + it.quantity) * 100) / 100;
        existing.totalAmount = Math.round((existing.totalAmount + it.grandTotal) * 100) / 100;
        existing.txCount += 1;
        if (it.date > existing.lastDate) {
          existing.lastDate = it.date;
          existing.lastUnitPrice = it.unitPrice;
        }
      }
    });

    return Array.from(map.values()).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [filteredItems]);

  // Seçili yıla ve aramaya göre filtrelenen finans hareketleri
  const filteredFinancials = useMemo(() => {
    const rawFins = history?.financials || [];
    const q = normalizeTr(searchTerm.trim());

    return rawFins.filter((fn) => {
      if (selectedYear !== 'all' && fn.year !== selectedYear) return false;
      if (!q) return true;
      return (
        normalizeTr(fn.transactionType).includes(q) ||
        normalizeTr(fn.docNo).includes(q) ||
        normalizeTr(fn.description).includes(q) ||
        fn.date.includes(q) ||
        formatDateTr(fn.date).includes(q)
      );
    });
  }, [history?.financials, selectedYear, searchTerm]);

  const totals = useMemo(() => {
    let purchaseTotal = 0;
    let returnTotal = 0;
    filteredItems.forEach((it) => {
      if (it.isReturn) returnTotal += it.grandTotal;
      else purchaseTotal += it.grandTotal;
    });
    return {
      purchaseTotal: Math.round(purchaseTotal * 100) / 100,
      returnTotal: Math.round(returnTotal * 100) / 100,
    };
  }, [filteredItems]);

  if (!isOpen || !customer) return null;

  const handleQuickAddItem = async (item: CustomerHistoryItem, rowKey: string) => {
    selectCustomer(customer);
    // Önce yerel katalogda güncel ürünü bulmaya çalış, yoksa geçmiş kayıttan oluştur
    const dbProd =
      (item.productCode
        ? await db.products.where('code').equals(item.productCode).first()
        : undefined) ||
      (item.productId ? await db.products.get(item.productId) : undefined);

    if (dbProd) {
      addToCart(dbProd, 1);
    } else {
      addToCart(
        {
          id: item.productId || item.productCode || item.productName,
          code: item.productCode || 'URUN',
          barcode: '',
          name: item.productName,
          category: 'Genel',
          unit: item.unit || 'Adet',
          vatRate: item.vatRate || 1,
          price1: item.unitPrice,
          price2: item.unitPrice,
          price3: item.unitPrice,
          stockQuantity: 100,
        },
        1
      );
    }

    setAddedKey(rowKey);
    setTimeout(() => {
      setAddedKey((prev) => (prev === rowKey ? null : prev));
    }, 1200);
  };

  const handleStartOrder = () => {
    selectCustomer(customer);
    onClose();
    setActiveTab('catalog');
  };

  const years = history?.years || [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-xs animate-fadeIn"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl max-h-[92dvh] sm:max-h-[88vh] flex flex-col bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden text-slate-900 dark:text-slate-100"
      >
        {/* Üst Başlık */}
        <div className="shrink-0 px-4 sm:px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50/90 dark:bg-slate-950/80">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-violet-600/10 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-extrabold text-sm sm:text-base truncate">
                Raporlar
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {customer.code} &bull; {customer.name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleStartOrder}
              className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold flex items-center gap-1 shadow-xs transition active:scale-95"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>Sipariş Gir</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Yıl Filtreleri, Görünüm Sekmeleri ve Arama */}
        <div className="shrink-0 p-3 sm:p-4 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2.5">
          {/* Yıl Seçici */}
          {years.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
              <button
                type="button"
                onClick={() => setSelectedYear('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition ${
                  selectedYear === 'all'
                    ? 'bg-violet-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                Tüm Yıllar
              </button>
              {years.map((yr) => (
                <button
                  key={yr}
                  type="button"
                  onClick={() => setSelectedYear(yr)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition ${
                    selectedYear === yr
                      ? 'bg-violet-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {yr}
                </button>
              ))}
            </div>
          )}

          {/* Alt Sekmeler */}
          <div className="grid grid-cols-3 gap-1.5 bg-slate-100 dark:bg-slate-800/90 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveSubTab('items')}
              className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-bold transition ${
                activeSubTab === 'items'
                  ? 'bg-white dark:bg-slate-900 text-violet-600 dark:text-violet-400 shadow-2xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
              }`}
            >
              <Package className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Aldığı Ürünler ({filteredItems.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('summary')}
              className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-bold transition ${
                activeSubTab === 'summary'
                  ? 'bg-white dark:bg-slate-900 text-violet-600 dark:text-violet-400 shadow-2xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Ürün Özeti ({productSummaryList.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('financials')}
              className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-bold transition ${
                activeSubTab === 'financials'
                  ? 'bg-white dark:bg-slate-900 text-violet-600 dark:text-violet-400 shadow-2xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
              }`}
            >
              <Wallet className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Tüm İşlemler ({filteredFinancials.length})</span>
            </button>
          </div>

          {/* Arama Çubuğu */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              enterKeyHint="search"
              data-no-autoscroll="true"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={
                activeSubTab === 'financials'
                  ? 'İşlem türü, belge no veya tarih ara...'
                  : 'Aldığı ürün adı, belge no veya tarih ara...'
              }
              className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-9 py-2 text-[16px] sm:text-xs font-medium text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 appearance-none"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* İçerik Gövdesi */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-2.5 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center text-slate-400 gap-2.5">
              <RefreshCw className="w-7 h-7 animate-spin text-violet-500" />
              <span className="text-xs font-semibold">Raporlar ve geçmiş işlemler yükleniyor...</span>
            </div>
          ) : error ? (
            <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
              <button
                type="button"
                onClick={loadHistory}
                className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-bold shrink-0"
              >
                Tekrar Dene
              </button>
            </div>
          ) : activeSubTab === 'items' ? (
            <>
              {/* Özet Bant */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between text-xs">
                  <span className="text-slate-600 dark:text-slate-300 font-semibold">Toplam Alım</span>
                  <span className="font-extrabold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(totals.purchaseTotal)}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-between text-xs">
                  <span className="text-slate-600 dark:text-slate-300 font-semibold">Toplam İade</span>
                  <span className="font-extrabold text-rose-600 dark:text-rose-400">
                    {formatCurrency(totals.returnTotal)}
                  </span>
                </div>
              </div>

              {filteredItems.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs font-medium">
                  Seçili kriterde ürün hareketi bulunamadı.
                </div>
              ) : (
                filteredItems.slice(0, 300).map((item) => {
                  const isAdded = addedKey === item.id;
                  return (
                    <div
                      key={item.id}
                      className={`p-3 rounded-2xl border transition space-y-2 ${
                        item.isReturn
                          ? 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-200/70 dark:border-rose-900/50'
                          : 'bg-slate-50/70 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-800'
                      }`}
                    >
                      {/* Üst Satır: Tarih + Belge Türü */}
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-semibold min-w-0">
                          <Calendar className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                          <span className="shrink-0">{formatDateTr(item.date, item.time)}</span>
                          <span className="text-slate-300 dark:text-slate-600">&bull;</span>
                          <span className="font-mono truncate">{item.docNo}</span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                            item.isReturn
                              ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                              : 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                          }`}
                        >
                          {item.docType}
                        </span>
                      </div>

                      {/* Ürün Adı + Hızlı Siparişe Ekle */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-extrabold text-xs sm:text-sm text-slate-900 dark:text-white leading-snug">
                          {item.productName}
                        </div>
                        {!item.isReturn && (
                          <button
                            type="button"
                            onClick={() => handleQuickAddItem(item, item.id)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 flex items-center gap-1 transition active:scale-95 ${
                              isAdded
                                ? 'bg-emerald-600 text-white'
                                : 'bg-blue-600/10 hover:bg-blue-600/20 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                            }`}
                            title="Bu ürünü sepete ekle"
                          >
                            {isAdded ? (
                              <>
                                <Check className="w-3 h-3" />
                                <span>Eklendi</span>
                              </>
                            ) : (
                              <>
                                <Plus className="w-3 h-3" />
                                <span>Ekle</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>

                      {/* Alt Satır: Miktar, Birim Fiyat ve Toplam Tutar */}
                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 text-xs">
                        <div>
                          <span className="text-[10px] text-slate-400 block">Alınan Miktar</span>
                          <span className="font-extrabold text-slate-800 dark:text-slate-100">
                            {item.quantity} {item.unit}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Birim Fiyat</span>
                          <span className="font-extrabold text-slate-800 dark:text-slate-100">
                            {formatCurrency(item.unitPrice)}
                            {item.discount && item.discount !== '0' ? (
                              <span className="ml-1 text-[10px] text-purple-600 dark:text-purple-400">
                                (%{item.discount})
                              </span>
                            ) : null}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 block">Toplam Tutar</span>
                          <span
                            className={`font-black ${
                              item.isReturn
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-emerald-600 dark:text-emerald-400'
                            }`}
                          >
                            {formatCurrency(item.grandTotal)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </>
          ) : activeSubTab === 'summary' ? (
            productSummaryList.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs font-medium">
                Özetlenecek ürün alımı bulunamadı.
              </div>
            ) : (
              productSummaryList.map((sum) => (
                <div
                  key={sum.key}
                  className="p-3 rounded-2xl bg-slate-50/70 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-extrabold text-xs sm:text-sm text-slate-900 dark:text-white leading-snug">
                      {sum.productName}
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300 text-[10px] font-bold shrink-0">
                      {sum.txCount} Kez Alındı
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-1.5 border-t border-slate-200/60 dark:border-slate-700/60 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Toplam Miktar</span>
                      <span className="font-extrabold text-slate-800 dark:text-slate-100">
                        {sum.totalQty} {sum.unit}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">
                        Son Fiyat ({formatDateTr(sum.lastDate)})
                      </span>
                      <span className="font-extrabold text-blue-600 dark:text-blue-400">
                        {formatCurrency(sum.lastUnitPrice)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block">Toplam Ciro</span>
                      <span className="font-black text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(sum.totalAmount)}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )
          ) : filteredFinancials.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs font-medium">
              Seçili kriterde finans işlemi bulunamadı.
            </div>
          ) : (
            filteredFinancials.slice(0, 300).map((fn) => {
              const isCredit = fn.credit > 0;
              return (
                <div
                  key={fn.id}
                  className="p-3 rounded-2xl bg-slate-50/70 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                      <span>{formatDateTr(fn.date, fn.time)}</span>
                      <span>&bull;</span>
                      <span className="font-mono truncate">{fn.docNo}</span>
                    </div>
                    <div className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                      {fn.transactionType}
                    </div>
                    {fn.description && (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {fn.description}
                      </div>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <span
                      className={`text-xs sm:text-sm font-black block ${
                        isCredit
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {formatCurrency(isCredit ? fn.credit : fn.debit)}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">
                      {isCredit ? 'Tahsilat / Alacak' : 'Satış / Borç'}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
