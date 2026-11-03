import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useApp } from '../context/AppContext';
import { 
  X, 
  ShoppingCart, 
  Plus, 
  Clock, 
  CheckCircle2, 
  Repeat
} from 'lucide-react';
import type { Customer, Order } from '../types';

interface CustomerOrdersModalProps {
  customer: Customer | null;
  isOpen: boolean;
  onClose: () => void;
  onStartOrder?: (customer: Customer) => void;
}

export const CustomerOrdersModal: React.FC<CustomerOrdersModalProps> = ({
  customer,
  isOpen,
  onClose,
  onStartOrder,
}) => {
  const { selectCustomer, setActiveTab, addToCart } = useApp();
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);

  // Bu müşteriye ait siparişleri Dexie veritabanından çek
  const customerOrders = useLiveQuery<Order[]>(
    async () => {
      if (!customer) return [];
      return await db.orders
        .where('customerId')
        .equals(customer.id)
        .reverse()
        .toArray();
    },
    [customer?.id]
  ) || [];

  if (!isOpen || !customer) return null;

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 2,
    }).format(val);
  };

  const handleStartNew = () => {
    selectCustomer(customer);
    onClose();
    setActiveTab('catalog');
  };

  const handleRepeatOrder = (order: Order) => {
    selectCustomer(customer);
    order.items.forEach((item) => {
      addToCart(
        {
          id: item.productId,
          code: item.productCode,
          name: item.productName,
          barcode: '',
          category: 'Genel',
          unit: item.unit,
          vatRate: item.vatRate,
          price1: item.unitPrice,
          price2: item.unitPrice,
          price3: item.unitPrice,
          stockQuantity: 100,
        },
        item.quantity
      );
    });
    onClose();
    setActiveTab('cart');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in">
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[85vh] text-slate-900 dark:text-slate-100">
        {/* Üst Başlık */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shadow-xs">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="font-extrabold text-sm sm:text-base truncate">Cari Siparişleri</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300">
                  {customerOrders.length} Sipariş
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[260px] sm:max-w-sm">
                {customer.code} &bull; {customer.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Ana Hızlı Aksiyon: Yeni Sipariş Yaz */}
        <div className="p-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-extrabold text-sm">Hemen Sipariş Al</div>
              <div className="text-xs text-blue-100 mt-0.5">
                Bu müşteri için doğrudan ürün kataloğunu açın ve sepete ekleyin.
              </div>
            </div>
            <button
              onClick={() => {
                if (onStartOrder) onStartOrder(customer);
                else handleStartNew();
              }}
              className="px-4 py-2.5 rounded-2xl bg-white text-blue-700 font-extrabold text-xs shadow-lg hover:bg-blue-50 transition active:scale-95 shrink-0 flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Sipariş Yaz</span>
            </button>
          </div>
        </div>

        {/* Sipariş Geçmişi Listesi */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1">
            Önceki Sipariş Geçmişi
          </div>

          {customerOrders.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-xs">
              Bu cariye ait henüz kayıtlı sipariş bulunmuyor.
            </div>
          ) : (
            customerOrders.map((ord) => {
              const isExpanded = expandedOrderId === ord.id;
              const isSynced = ord.status === 'synced';

              return (
                <div
                  key={ord.id || ord.tempId}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 shadow-xs overflow-hidden transition-all"
                >
                  <div
                    onClick={() => setExpandedOrderId(isExpanded ? null : (ord.id ?? null))}
                    className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-xs text-slate-900 dark:text-white">
                          #{ord.id || ord.tempId}
                        </span>
                        <span
                          className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase flex items-center gap-1 ${
                            isSynced
                              ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300'
                              : 'bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300'
                          }`}
                        >
                          {isSynced ? <CheckCircle2 className="w-2.5 h-2.5" /> : <Clock className="w-2.5 h-2.5" />}
                          <span>{isSynced ? 'ERP12 Aktarıldı' : 'Beklemede'}</span>
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        {new Date(ord.createdAt).toLocaleDateString('tr-TR', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })} &bull; {ord.items.length} Kalem
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-black text-sm text-blue-600 dark:text-blue-400">
                        {formatCurrency(ord.grandTotal)}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRepeatOrder(ord);
                        }}
                        className="mt-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1 hover:underline ml-auto"
                        title="Bu siparişi sepete aktar ve tekrarla"
                      >
                        <Repeat className="w-3 h-3" />
                        <span>Tekrarla</span>
                      </button>
                    </div>
                  </div>

                  {/* Kalem Detayları */}
                  {isExpanded && (
                    <div className="p-3 bg-slate-50 dark:bg-slate-950/60 border-t border-slate-100 dark:border-slate-800 text-xs space-y-2 animate-in fade-in">
                      <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        Sipariş İçeriği
                      </div>
                      <div className="divide-y divide-slate-200 dark:divide-slate-800">
                        {ord.items.map((item, i) => (
                          <div key={i} className="py-1.5 flex justify-between items-center text-xs">
                            <div>
                              <span className="font-semibold text-slate-800 dark:text-slate-200">{item.productName}</span>
                              <span className="text-[10px] text-slate-400 block">
                                {item.quantity} {item.unit || 'Adet'} &times; {formatCurrency(item.unitPrice)}
                              </span>
                            </div>
                            <span className="font-bold text-slate-900 dark:text-white">
                              {formatCurrency(item.netPrice * item.quantity)}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="pt-2 flex justify-between border-t border-slate-200 dark:border-slate-700 text-xs font-bold">
                        <span className="text-slate-500">Sipariş Toplamı:</span>
                        <span className="text-blue-600 dark:text-blue-400 font-black">{formatCurrency(ord.grandTotal)}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Kapat Butonu */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/80 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
};
