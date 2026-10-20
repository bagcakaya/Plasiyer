import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useApp } from '../context/AppContext';
import type { Order, ReturnRecord } from '../types';
import { 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  FileText, 
  Calendar, 
  ChevronRight, 
  X,
  ShoppingBag,
  Printer,
  Banknote,
  Plus,
  CreditCard,
  Building,
  ArrowDownLeft,
  FileCheck,
  RotateCcw
} from 'lucide-react';
import { InvoiceOrderModal } from '../components/InvoiceOrderModal';

export const OrdersQueuePage: React.FC = () => {
  const { 
    isSyncing, 
    triggerSync, 
    userRole, 
    currentCustomerUser, 
    setActiveTab,
    openPrintSlip,
    openCollectionModal,
    openReturnModal
  } = useApp();

  const [activeTabSub, setActiveTabSub] = useState<'orders' | 'collections' | 'returns'>('orders');
  const [activeFilter, setActiveFilter] = useState<'all' | 'pending' | 'synced'>('all');
  const [inspectOrder, setInspectOrder] = useState<Order | null>(null);
  const [inspectReturn, setInspectReturn] = useState<ReturnRecord | null>(null);
  const [invoicingOrder, setInvoicingOrder] = useState<Order | null>(null);

  // IndexedDB'deki siparişleri çek
  const rawOrders = useLiveQuery(
    () => db.orders.orderBy('createdAt').reverse().toArray(),
    []
  );

  // IndexedDB'deki tahsilatları çek
  const rawCollections = useLiveQuery(
    () => db.collections.orderBy('createdAt').reverse().toArray(),
    []
  );

  // IndexedDB'deki iadeleri çek
  const rawReturns = useLiveQuery(
    () => db.returns.orderBy('createdAt').reverse().toArray(),
    []
  );

  if (!rawOrders) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-4 border-blue-600 dark:border-blue-400 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Müşteri modundaysa sadece kendi siparişlerini filtrele
  const orders = userRole === 'customer' && currentCustomerUser
    ? rawOrders.filter(o => o.customerId === currentCustomerUser.id || o.customerCode === currentCustomerUser.code)
    : rawOrders;

  const collections = rawCollections || [];
  const returns = userRole === 'customer' && currentCustomerUser
    ? (rawReturns || []).filter(r => r.customerId === currentCustomerUser.id || r.customerCode === currentCustomerUser.code)
    : (rawReturns || []);

  const filteredOrders = orders.filter((o) => {
    if (activeFilter === 'pending') return o.status === 'pending' || o.status === 'failed';
    if (activeFilter === 'synced') return o.status === 'synced';
    return true;
  });

  const filteredCollections = collections.filter((c) => {
    if (activeFilter === 'pending') return c.syncStatus === 'pending' || c.syncStatus === 'failed';
    if (activeFilter === 'synced') return c.syncStatus === 'synced';
    return true;
  });

  const filteredReturns = returns.filter((r) => {
    if (activeFilter === 'pending') return r.syncStatus === 'pending' || r.syncStatus === 'failed';
    if (activeFilter === 'synced') return r.syncStatus === 'synced';
    return true;
  });

  const pendingOrdersCount = orders.filter((o) => o.status === 'pending' || o.status === 'failed').length;
  const pendingColsCount = collections.filter((c) => c.syncStatus === 'pending' || c.syncStatus === 'failed').length;
  const pendingReturnsCount = returns.filter((r) => r.syncStatus === 'pending' || r.syncStatus === 'failed').length;
  const totalPending = pendingOrdersCount + pendingColsCount + pendingReturnsCount;

  // Tahsilat Toplamları
  const totalCollectedAmount = collections.reduce((acc, c) => acc + (c.amount || 0), 0);
  const totalCash = collections.filter((c) => c.paymentMethod === 'nakit').reduce((acc, c) => acc + c.amount, 0);
  const totalCard = collections.filter((c) => c.paymentMethod === 'kredi_karti').reduce((acc, c) => acc + c.amount, 0);
  const totalCheckBank = collections.filter((c) => c.paymentMethod === 'cek' || c.paymentMethod === 'havale').reduce((acc, c) => acc + c.amount, 0);

  // İade Toplamı
  const totalReturnAmount = returns.reduce((acc, r) => acc + (r.grandTotal || 0), 0);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 2,
    }).format(val);
  };

  const formatDate = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const paymentLabels: Record<string, { label: string; icon: any; color: string }> = {
    nakit: { label: 'Nakit', icon: Banknote, color: 'text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/70 border-emerald-200 dark:border-emerald-900/60' },
    kredi_karti: { label: 'POS / Kart', icon: CreditCard, color: 'text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-950/70 border-indigo-200 dark:border-indigo-900/60' },
    havale: { label: 'Havale/EFT', icon: Building, color: 'text-sky-700 dark:text-sky-300 bg-sky-100 dark:bg-sky-950/70 border-sky-200 dark:border-sky-900/60' },
    cek: { label: 'Müşteri Çeki', icon: FileText, color: 'text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/70 border-amber-200 dark:border-amber-900/60' },
  };

  const returnReasonLabels: Record<string, string> = {
    hasarli_kusurlu: 'Hasarlı / Kusurlu',
    skt_gecmis: 'SKT Geçmiş',
    yanlis_siparis: 'Yanlış Sipariş',
    fazla_sevkiyat: 'Fazla Sevkiyat',
    musteri_vazgecti: 'Müşteri Vazgeçti',
    diger: 'Diğer',
  };

  return (
    <div className="p-3 pb-24 space-y-3 max-w-lg mx-auto text-slate-900 dark:text-slate-100 animate-fadeIn w-full">
      {/* Plasiyer için Üst Sekmeler: Siparişler vs. Tahsilatlar vs. İadeler */}
      {userRole === 'plasiyer' && (
        <div className="grid grid-cols-3 p-1 bg-slate-200/80 dark:bg-slate-800/80 rounded-2xl text-xs font-bold shadow-inner">
          <button
            type="button"
            onClick={() => setActiveTabSub('orders')}
            className={`py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all ${
              activeTabSub === 'orders'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span className="truncate">Sipariş ({orders.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTabSub('collections')}
            className={`py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all ${
              activeTabSub === 'collections'
                ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Banknote className="w-3.5 h-3.5" />
            <span className="truncate">Kasa ({collections.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTabSub('returns')}
            className={`py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all ${
              activeTabSub === 'returns'
                ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="truncate">İade ({returns.length})</span>
          </button>
        </div>
      )}

      {/* Durum & Bilgi Kartı */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex items-center justify-between transition">
        <div>
          <span className="text-xs text-slate-500 dark:text-slate-400 block font-medium">
            {userRole === 'customer'
              ? 'B2B Sipariş Takip Havuzu'
              : activeTabSub === 'orders'
              ? 'Saha Sipariş Havuzu'
              : activeTabSub === 'collections'
              ? 'Saha Tahsilat & Kasa'
              : 'Saha İade & Değişim Fişleri'}
          </span>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-lg font-bold text-slate-900 dark:text-white">
              {activeTabSub === 'orders'
                ? `${orders.length} Sipariş`
                : activeTabSub === 'collections'
                ? `${collections.length} Tahsilat`
                : `${returns.length} İade Fişi`}
            </span>
            {totalPending > 0 && userRole === 'plasiyer' && (
              <span className="bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1 border border-rose-200 dark:border-rose-900/60">
                <Clock className="w-3 h-3" />
                {totalPending} Bekleyen
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeTabSub === 'collections' && userRole === 'plasiyer' && (
            <button
              onClick={() => openCollectionModal()}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2 rounded-xl shadow-xs transition active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tahsilat Yap</span>
            </button>
          )}

          {activeTabSub === 'returns' && userRole === 'plasiyer' && (
            <button
              onClick={() => openReturnModal()}
              className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-3 py-2 rounded-xl shadow-xs transition active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>İade Al</span>
            </button>
          )}

          {totalPending > 0 && userRole === 'plasiyer' && (
            <button
              onClick={() => triggerSync()}
              disabled={isSyncing}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-2 rounded-xl shadow-xs transition active:scale-95"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'İletiliyor...' : 'ERP12 Senkron'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Tahsilat Modunda İstatistik Özet Kartları */}
      {activeTabSub === 'collections' && userRole === 'plasiyer' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Toplam Kasa</span>
            <span className="text-sm font-black text-slate-900 dark:text-white mt-0.5 block">
              {formatCurrency(totalCollectedAmount)}
            </span>
          </div>

          <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs">
            <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 block">Nakit</span>
            <span className="text-sm font-bold text-emerald-700 dark:text-emerald-300 mt-0.5 block">
              {formatCurrency(totalCash)}
            </span>
          </div>

          <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs">
            <span className="text-[10px] uppercase font-bold text-indigo-600 dark:text-indigo-400 block">POS / Kart</span>
            <span className="text-sm font-bold text-indigo-700 dark:text-indigo-300 mt-0.5 block">
              {formatCurrency(totalCard)}
            </span>
          </div>

          <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs">
            <span className="text-[10px] uppercase font-bold text-amber-600 dark:text-amber-400 block">Çek & Havale</span>
            <span className="text-sm font-bold text-amber-700 dark:text-amber-300 mt-0.5 block">
              {formatCurrency(totalCheckBank)}
            </span>
          </div>
        </div>
      )}

      {/* İade Modunda İstatistik Özet Kartları */}
      {activeTabSub === 'returns' && userRole === 'plasiyer' && (
        <div className="grid grid-cols-2 gap-2">
          <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs">
            <span className="text-[10px] uppercase font-bold text-rose-500 dark:text-rose-400 block">Toplam İade Bedeli</span>
            <span className="text-sm font-black text-rose-600 dark:text-rose-400 mt-0.5 block">
              {formatCurrency(totalReturnAmount)}
            </span>
          </div>

          <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">İade Fiş Sayısı</span>
            <span className="text-sm font-black text-slate-900 dark:text-white mt-0.5 block">
              {returns.length} Fiş
            </span>
          </div>
        </div>
      )}

      {/* Filtre Tabları */}
      <div className="grid grid-cols-3 gap-1 bg-slate-200/70 dark:bg-slate-800/60 p-1 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400">
        <button
          onClick={() => setActiveFilter('all')}
          className={`py-1.5 rounded-lg transition ${
            activeFilter === 'all' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold shadow-xs' : ''
          }`}
        >
          Tümü ({activeTabSub === 'orders' ? orders.length : activeTabSub === 'collections' ? collections.length : returns.length})
        </button>
        <button
          onClick={() => setActiveFilter('pending')}
          className={`py-1.5 rounded-lg transition ${
            activeFilter === 'pending' ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 font-bold shadow-xs' : ''
          }`}
        >
          Bekleyen ({activeTabSub === 'orders' ? pendingOrdersCount : activeTabSub === 'collections' ? pendingColsCount : pendingReturnsCount})
        </button>
        <button
          onClick={() => setActiveFilter('synced')}
          className={`py-1.5 rounded-lg transition ${
            activeFilter === 'synced' ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 font-bold shadow-xs' : ''
          }`}
        >
          Onaylanan ({activeTabSub === 'orders' ? orders.filter(o => o.status === 'synced').length : activeTabSub === 'collections' ? collections.filter(c => c.syncStatus === 'synced').length : returns.filter(r => r.syncStatus === 'synced').length})
        </button>
      </div>

      {/* SİPARİŞ LİSTESİ */}
      {activeTabSub === 'orders' && (
        <div className="space-y-2">
          {filteredOrders.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 text-center border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
              <FileText className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-sm font-semibold">Bu filtrede sipariş bulunmuyor.</p>
              {userRole === 'customer' && (
                <button
                  onClick={() => setActiveTab('catalog')}
                  className="mt-3 bg-emerald-600 text-white text-xs font-bold px-4 py-2 rounded-xl inline-flex items-center gap-1.5"
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>Vitrinden Sipariş Ver</span>
                </button>
              )}
            </div>
          ) : (
            filteredOrders.map((order) => {
              const isPending = order.status === 'pending';
              const isFailed = order.status === 'failed';
              const isSynced = order.status === 'synced';

              return (
                <div
                  key={order.id || order.tempId}
                  onClick={() => setInspectOrder(order)}
                  className="bg-white dark:bg-slate-900 rounded-2xl p-3.5 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-xs transition cursor-pointer active:scale-[0.99] space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                          {order.tempId}
                        </span>
                        {order.erp12DocNo && (
                          <span className="text-[10px] font-mono font-bold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-950/70 border border-blue-200 dark:border-blue-900/60 px-1.5 py-0.5 rounded">
                            {order.erp12DocNo}
                          </span>
                        )}
                        {order.invoiceStatus === 'invoiced' && (
                          <span className="text-[10px] font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-900/60 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                            <FileCheck className="w-3 h-3" />
                            <span>Faturalandı</span>
                          </span>
                        )}
                      </div>
                      <h3 className="font-bold text-sm text-slate-900 dark:text-white mt-1 truncate">
                        {order.customerName}
                      </h3>
                      <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        <span>{formatDate(order.createdAt)}</span>
                      </div>
                    </div>

                    {/* Durum & Fiyat */}
                    <div className="shrink-0 text-right">
                      {isSynced && (
                        <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-900/60 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Onaylandı</span>
                        </span>
                      )}
                      {isPending && (
                        <span className="flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/70 border border-amber-200 dark:border-amber-900/60 px-2 py-0.5 rounded-full">
                          <Clock className="w-3 h-3" />
                          <span>Bekliyor</span>
                        </span>
                      )}
                      {isFailed && (
                        <span className="flex items-center gap-1 text-[11px] font-bold text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-950/70 border border-rose-200 dark:border-rose-900/60 px-2 py-0.5 rounded-full">
                          <AlertCircle className="w-3 h-3" />
                          <span>Hata</span>
                        </span>
                      )}

                      <div className="text-sm font-extrabold text-slate-900 dark:text-white mt-1.5">
                        {formatCurrency(order.grandTotal)}
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>{order.items.length} Kalem Ürün</span>
                    
                    <div className="flex items-center gap-2">
                      {/* Termal Fiş Yazdır Butonu */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openPrintSlip({ type: 'order', orderData: order });
                        }}
                        className="flex items-center gap-1 text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-2.5 py-1 rounded-lg text-xs font-semibold transition active:scale-95"
                        title="Termal Fiş Çıkar"
                      >
                        <Printer className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Fiş Yazdır</span>
                      </button>

                      <div className={`flex items-center gap-0.5 font-semibold ${
                        userRole === 'customer' ? 'text-emerald-600 dark:text-emerald-400' : 'text-blue-600 dark:text-blue-400'
                      }`}>
                        <span>Detay</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAHSİLATLAR LİSTESİ */}
      {activeTabSub === 'collections' && (
        <div className="space-y-2">
          {filteredCollections.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 text-center border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
              <Banknote className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-sm font-semibold">Bu filtrede tahsilat kaydı bulunmuyor.</p>
              <button
                onClick={() => openCollectionModal()}
                className="mt-3 bg-emerald-600 text-white text-xs font-bold px-4 py-2 rounded-xl inline-flex items-center gap-1.5 shadow-sm active:scale-95 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>İlk Tahsilatı Yap</span>
              </button>
            </div>
          ) : (
            filteredCollections.map((col) => {
              const isPending = col.syncStatus === 'pending';
              const isFailed = col.syncStatus === 'failed';
              const isSynced = col.syncStatus === 'synced';
              const methodConfig = paymentLabels[col.paymentMethod] || { label: col.paymentMethod, icon: Banknote, color: 'text-slate-700 bg-slate-100' };
              const IconComp = methodConfig.icon;

              return (
                <div
                  key={col.id || col.tempId}
                  className="bg-white dark:bg-slate-900 rounded-2xl p-3.5 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-xs transition space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                          {col.receiptNo}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${methodConfig.color}`}>
                          <IconComp className="w-3 h-3" />
                          <span>{methodConfig.label}</span>
                        </span>
                        {col.erpDocNo && (
                          <span className="text-[10px] font-mono font-bold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-950/70 border border-blue-200 dark:border-blue-900/60 px-1.5 py-0.5 rounded">
                            {col.erpDocNo}
                          </span>
                        )}
                      </div>

                      <h3 className="font-bold text-sm text-slate-900 dark:text-white mt-1 truncate">
                        {col.customerName}
                      </h3>
                      <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        <span>{formatDate(col.createdAt)}</span>
                      </div>

                      {col.paymentMethod === 'cek' && col.checkNo && (
                        <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-1 font-medium">
                          Çek: {col.checkBank} • No: {col.checkNo} • Vade: {col.checkDueDate}
                        </p>
                      )}

                      {col.notes && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 italic">
                          "{col.notes}"
                        </p>
                      )}
                    </div>

                    {/* Tutar & Senkron */}
                    <div className="shrink-0 text-right">
                      {isSynced && (
                        <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-900/60 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>ERP Aktarıldı</span>
                        </span>
                      )}
                      {isPending && (
                        <span className="flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/70 border border-amber-200 dark:border-amber-900/60 px-2 py-0.5 rounded-full">
                          <Clock className="w-3 h-3" />
                          <span>Bekliyor</span>
                        </span>
                      )}
                      {isFailed && (
                        <span className="flex items-center gap-1 text-[11px] font-bold text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-950/70 border border-rose-200 dark:border-rose-900/60 px-2 py-0.5 rounded-full">
                          <AlertCircle className="w-3 h-3" />
                          <span>Hata</span>
                        </span>
                      )}

                      <div className="text-base font-black text-emerald-600 dark:text-emerald-400 mt-1.5 flex items-center justify-end gap-0.5">
                        <ArrowDownLeft className="w-4 h-4" />
                        <span>{formatCurrency(col.amount)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                    <span className="text-slate-400 text-[11px]">Plasiyer: {col.salesRepCode}</span>

                    <button
                      type="button"
                      onClick={() => openPrintSlip({ type: 'collection', collectionData: col })}
                      className="flex items-center gap-1.5 text-slate-700 dark:text-slate-200 hover:text-emerald-600 dark:hover:text-emerald-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-3 py-1.5 rounded-xl font-bold transition active:scale-95"
                    >
                      <Printer className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Makbuz Yazdır</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* İADELER LİSTESİ */}
      {activeTabSub === 'returns' && (
        <div className="space-y-2">
          {filteredReturns.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 text-center border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
              <RotateCcw className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-sm font-semibold">Bu filtrede iade kaydı bulunmuyor.</p>
              {userRole === 'plasiyer' && (
                <button
                  onClick={() => openReturnModal()}
                  className="mt-3 bg-rose-600 text-white text-xs font-bold px-4 py-2 rounded-xl inline-flex items-center gap-1.5 shadow-sm active:scale-95 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>İlk İadeyi Al</span>
                </button>
              )}
            </div>
          ) : (
            filteredReturns.map((ret) => {
              const isPending = ret.syncStatus === 'pending';
              const isFailed = ret.syncStatus === 'failed';
              const isSynced = ret.syncStatus === 'synced';

              return (
                <div
                  key={ret.id || ret.tempId}
                  onClick={() => setInspectReturn(ret)}
                  className="bg-white dark:bg-slate-900 rounded-2xl p-3.5 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-xs transition cursor-pointer active:scale-[0.99] space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                          {ret.receiptNo || ret.tempId}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-950/70 border-rose-200 dark:border-rose-900/60">
                          <RotateCcw className="w-3 h-3" />
                          <span>İade Fişi</span>
                        </span>
                        {ret.erpDocNo && (
                          <span className="text-[10px] font-mono font-bold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-950/70 border border-blue-200 dark:border-blue-900/60 px-1.5 py-0.5 rounded">
                            {ret.erpDocNo}
                          </span>
                        )}
                      </div>

                      <h3 className="font-bold text-sm text-slate-900 dark:text-white mt-1 truncate">
                        {ret.customerName}
                      </h3>
                      <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        <span>{formatDate(ret.createdAt)}</span>
                      </div>

                      {ret.notes && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 italic">
                          "{ret.notes}"
                        </p>
                      )}
                    </div>

                    {/* Tutar & Senkron */}
                    <div className="shrink-0 text-right">
                      {isSynced && (
                        <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-900/60 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>ERP Aktarıldı</span>
                        </span>
                      )}
                      {isPending && (
                        <span className="flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/70 border border-amber-200 dark:border-amber-900/60 px-2 py-0.5 rounded-full">
                          <Clock className="w-3 h-3" />
                          <span>Bekliyor</span>
                        </span>
                      )}
                      {isFailed && (
                        <span className="flex items-center gap-1 text-[11px] font-bold text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-950/70 border border-rose-200 dark:border-rose-900/60 px-2 py-0.5 rounded-full">
                          <AlertCircle className="w-3 h-3" />
                          <span>Hata</span>
                        </span>
                      )}

                      <div className="text-base font-black text-rose-600 dark:text-rose-400 mt-1.5 flex items-center justify-end gap-0.5">
                        <span>- {formatCurrency(ret.grandTotal)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>{ret.items.length} Kalem İade Ürünü</span>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openPrintSlip({ type: 'return', returnData: ret });
                        }}
                        className="flex items-center gap-1 text-slate-700 dark:text-slate-200 hover:text-rose-600 dark:hover:text-rose-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-2.5 py-1 rounded-lg text-xs font-semibold transition active:scale-95"
                        title="İade Fişi Yazdır"
                      >
                        <Printer className="w-3.5 h-3.5 text-rose-500" />
                        <span>İade Fişi</span>
                      </button>

                      <div className="flex items-center gap-0.5 font-semibold text-rose-600 dark:text-rose-400">
                        <span>Detay</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Sipariş Detay Modalı */}
      {inspectOrder && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[85vh] overflow-y-auto p-4 space-y-4 shadow-2xl border border-slate-200 dark:border-slate-800">
            {/* Modal Başlık */}
            <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <span className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                  {inspectOrder.tempId}
                </span>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mt-1">
                  {inspectOrder.customerName}
                </h3>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {formatDate(inspectOrder.createdAt)}
                </span>
              </div>
              <button
                onClick={() => setInspectOrder(null)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Ürün Listesi */}
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">Sipariş Kalemleri</span>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden">
                {inspectOrder.items.map((item, idx) => (
                  <div key={idx} className="p-2.5 flex items-center justify-between text-xs bg-slate-50/50 dark:bg-slate-855/40">
                    <div className="flex-1 min-w-0 pr-2">
                      <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">{item.productName}</p>
                      <p className="text-[11px] text-slate-400">
                        {item.quantity} {item.unit} x {formatCurrency(item.unitPrice)}
                        {item.discountPercent > 0 && ` (-%${item.discountPercent})`}
                      </p>
                    </div>
                    <span className="font-bold text-slate-900 dark:text-white shrink-0">
                      {formatCurrency(item.grandTotal)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Toplam Özeti */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-750 text-xs space-y-1.5">
              <div className="flex justify-between text-slate-500 dark:text-slate-400">
                <span>Ara Toplam:</span>
                <span>{formatCurrency(inspectOrder.subtotal)}</span>
              </div>
              {inspectOrder.totalDiscount > 0 && (
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-semibold">
                  <span>Toplam İskonto:</span>
                  <span>- {formatCurrency(inspectOrder.totalDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-500 dark:text-slate-400">
                <span>Toplam KDV:</span>
                <span>{formatCurrency(inspectOrder.totalVat)}</span>
              </div>
              <div className="flex justify-between font-black text-sm pt-2 border-t border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white">
                <span>Genel Toplam:</span>
                <span className="text-base text-emerald-600 dark:text-emerald-400 font-black">{formatCurrency(inspectOrder.grandTotal)}</span>
              </div>
            </div>

            {/* Faturalandırma Durumu ve Butonu */}
            <div className="p-3.5 rounded-2xl border text-xs flex items-center justify-between bg-slate-50 dark:bg-slate-800/60 border-slate-100 dark:border-slate-750">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Fatura Durumu</span>
                {inspectOrder.invoiceStatus === 'invoiced' ? (
                  <div className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 font-bold mt-0.5">
                    <FileCheck className="w-4 h-4" />
                    <span>Faturası Kesildi ({inspectOrder.invoiceNo})</span>
                  </div>
                ) : (
                  <span className="text-amber-600 dark:text-amber-400 font-semibold mt-0.5 block">
                    ⏳ Fatura Sevk Onayı Bekliyor
                  </span>
                )}
              </div>

              {userRole === 'plasiyer' && inspectOrder.invoiceStatus !== 'invoiced' && (
                <button
                  type="button"
                  onClick={() => {
                    const ord = inspectOrder;
                    setInspectOrder(null);
                    setInvoicingOrder(ord);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1 shadow-xs transition active:scale-95"
                >
                  <FileCheck className="w-3.5 h-3.5" />
                  <span>Faturalaştır</span>
                </button>
              )}
            </div>

            {/* Butonlar */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  const ord = inspectOrder;
                  setInspectOrder(null);
                  openPrintSlip({ type: 'order', orderData: ord });
                }}
                className="flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2.5 rounded-xl transition active:scale-95 shadow-xs"
              >
                <Printer className="w-4 h-4" />
                <span>Fiş Yazdır</span>
              </button>

              <button
                type="button"
                onClick={() => setInspectOrder(null)}
                className="w-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-white text-xs font-bold py-2.5 rounded-xl transition"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* İade Detay Modalı */}
      {inspectReturn && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[85vh] overflow-y-auto p-4 space-y-4 shadow-2xl border border-slate-200 dark:border-slate-800">
            {/* Modal Başlık */}
            <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <span className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                  {inspectReturn.receiptNo || inspectReturn.tempId}
                </span>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mt-1">
                  {inspectReturn.customerName}
                </h3>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {formatDate(inspectReturn.createdAt)}
                </span>
              </div>
              <button
                onClick={() => setInspectReturn(null)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* İade Kalemleri */}
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">İade Kalemleri</span>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden">
                {inspectReturn.items.map((item, idx) => (
                  <div key={idx} className="p-2.5 flex items-center justify-between text-xs bg-slate-50/50 dark:bg-slate-850/40">
                    <div className="flex-1 min-w-0 pr-2">
                      <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">{item.productName}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-slate-400">
                          {item.quantity} {item.unit} x {formatCurrency(item.unitPrice)}
                        </span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300">
                          {returnReasonLabels[item.reason] || item.reason}
                        </span>
                      </div>
                    </div>
                    <span className="font-bold text-rose-600 dark:text-rose-400 shrink-0">
                      - {formatCurrency(item.totalAmount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Toplam Özeti */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-750 text-xs space-y-1.5">
              <div className="flex justify-between text-slate-500 dark:text-slate-400">
                <span>Ara Toplam (KDV Hariç):</span>
                <span>{formatCurrency(inspectReturn.subtotal)}</span>
              </div>
              <div className="flex justify-between text-slate-500 dark:text-slate-400">
                <span>Toplam KDV:</span>
                <span>{formatCurrency(inspectReturn.totalVat)}</span>
              </div>
              <div className="flex justify-between font-black text-sm pt-2 border-t border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white">
                <span>Cari Alacak / İade Tutarı:</span>
                <span className="text-base text-rose-600 dark:text-rose-400 font-black">- {formatCurrency(inspectReturn.grandTotal)}</span>
              </div>
            </div>

            {/* Senkron Durumu */}
            <div className="p-3 rounded-xl border text-xs flex items-center justify-between bg-slate-50 dark:bg-slate-800/60 border-slate-100 dark:border-slate-750">
              <span className="text-slate-400 text-[10px] uppercase font-bold">ERP12 Durumu</span>
              {inspectReturn.syncStatus === 'synced' ? (
                <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Aktarıldı ({inspectReturn.erpDocNo || 'FINANS'})</span>
                </span>
              ) : inspectReturn.syncStatus === 'failed' ? (
                <span className="text-rose-600 dark:text-rose-400 font-bold flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Hata: {inspectReturn.errorMessage || 'Bağlantı hatası'}</span>
                </span>
              ) : (
                <span className="text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Sırada Bekliyor</span>
                </span>
              )}
            </div>

            {/* Butonlar */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  const ret = inspectReturn;
                  setInspectReturn(null);
                  openPrintSlip({ type: 'return', returnData: ret });
                }}
                className="flex items-center justify-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold py-2.5 rounded-xl transition active:scale-95 shadow-xs"
              >
                <Printer className="w-4 h-4" />
                <span>Fiş Yazdır</span>
              </button>

              <button
                type="button"
                onClick={() => setInspectReturn(null)}
                className="w-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-white text-xs font-bold py-2.5 rounded-xl transition"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ERP12 Faturalaştırma Modalı */}
      <InvoiceOrderModal
        isOpen={!!invoicingOrder}
        order={invoicingOrder}
        onClose={() => setInvoicingOrder(null)}
        onSuccess={() => setInvoicingOrder(null)}
      />
    </div>
  );
};

