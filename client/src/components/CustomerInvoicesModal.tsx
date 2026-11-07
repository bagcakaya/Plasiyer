import React, { useState } from 'react';
import { 
  X, 
  FileCheck, 
  Search, 
  AlertTriangle, 
  Plus
} from 'lucide-react';
import type { Customer } from '../types';
import { useApp } from '../context/AppContext';

interface CustomerInvoicesModalProps {
  customer: Customer | null;
  isOpen: boolean;
  onClose: () => void;
  onStartOrder?: (customer: Customer) => void;
}

export const CustomerInvoicesModal: React.FC<CustomerInvoicesModalProps> = ({
  customer,
  isOpen,
  onClose,
  onStartOrder,
}) => {
  const { companyIssuer } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unpaid' | 'overdue' | 'paid'>('all');
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);

  if (!isOpen || !customer) return null;

  // Carinin kayıtlı / örnek ERP12 faturaları
  const mockInvoices = [
    {
      id: 'INV-001',
      invoiceNo: 'GIB2026000012480',
      date: '10.10.2026',
      dueDate: '25.10.2026',
      type: 'Toptan Satış E-Faturası',
      status: 'overdue', // Vadesi geçmiş
      overdueDays: 9,
      amount: 14250.00,
      vat: 2850.00,
      grandTotal: 17100.00,
      remainingAmount: 14250.00,
      items: [
        { name: 'Çaykur Rize Turist Çay 1000 Gr', quantity: 40, unitPrice: 165.00, total: 6600.00 },
        { name: 'Yudum Ayçiçek Yağı 5 Lt', quantity: 20, unitPrice: 230.00, total: 4600.00 },
        { name: 'Duru Pilavlık Pirinç 2.5 Kg', quantity: 36, unitPrice: 84.72, total: 3050.00 },
      ],
    },
    {
      id: 'INV-002',
      invoiceNo: 'GIB2026000011850',
      date: '28.09.2026',
      dueDate: '15.11.2026',
      type: 'Toptan Satış E-Arşiv',
      status: 'unpaid', // Açık / Bekleyen
      overdueDays: 0,
      amount: 38500.00,
      vat: 7700.00,
      grandTotal: 46200.00,
      remainingAmount: 46200.00,
      items: [
        { name: 'Ariel Dağ Esintisi Toz Deterjan 5 Kg', quantity: 80, unitPrice: 240.00, total: 19200.00 },
        { name: 'Balküpü Toz Şeker 5 Kg', quantity: 100, unitPrice: 150.00, total: 15000.00 },
        { name: 'Sütaş Tam Yağlı Peynir 1 Kg', quantity: 22, unitPrice: 195.45, total: 4300.00 },
      ],
    },
    {
      id: 'INV-003',
      invoiceNo: 'GIB2026000009410',
      date: '15.08.2026',
      dueDate: '30.08.2026',
      type: 'Toptan Satış E-Faturası',
      status: 'paid', // Tamamen Ödendi
      overdueDays: 0,
      amount: 22000.00,
      vat: 4400.00,
      grandTotal: 26400.00,
      remainingAmount: 0.00,
      items: [
        { name: 'Tariş Sızma Zeytinyağı 5 Lt', quantity: 25, unitPrice: 580.00, total: 14500.00 },
        { name: 'Doğuş Filiz Çay 1000 Gr', quantity: 50, unitPrice: 150.00, total: 7500.00 },
      ],
    },
  ];

  const filteredInvoices = mockInvoices.filter((inv) => {
    const matchesSearch =
      inv.invoiceNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.type.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;

    if (statusFilter === 'unpaid') return inv.status === 'unpaid';
    if (statusFilter === 'overdue') return inv.status === 'overdue';
    if (statusFilter === 'paid') return inv.status === 'paid';
    return true;
  });

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 2,
    }).format(val);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in">
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[85vh] text-slate-900 dark:text-slate-100">
        {/* Üst Başlık Barı */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-xs">
              <FileCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="font-extrabold text-sm sm:text-base truncate">Cari Faturalar</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300">
                  {filteredInvoices.length} Fatura
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[260px] sm:max-w-sm">
                {customer.code} &bull; {customer.name}
              </p>
              <p className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 truncate max-w-[260px] sm:max-w-sm">
                Düzenleyen: {companyIssuer.brandName || companyIssuer.legalName}
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

        {/* Filtre ve Arama Barı */}
        <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Fatura no (GIB...) ile ara..."
              className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-2xl pl-10 pr-3.5 py-2 text-xs font-semibold text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex gap-1.5 overflow-x-auto no-scrollbar text-[11px] font-bold pt-1">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1 rounded-xl transition ${
                statusFilter === 'all'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              Tümü ({mockInvoices.length})
            </button>
            <button
              onClick={() => setStatusFilter('overdue')}
              className={`px-3 py-1 rounded-xl transition flex items-center gap-1 ${
                statusFilter === 'overdue'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-rose-500'
              }`}
            >
              <AlertTriangle className="w-3 h-3" />
              <span>Vadesi Geçenler (1)</span>
            </button>
            <button
              onClick={() => setStatusFilter('unpaid')}
              className={`px-3 py-1 rounded-xl transition ${
                statusFilter === 'unpaid'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-amber-500'
              }`}
            >
              Açık Faturalar (1)
            </button>
            <button
              onClick={() => setStatusFilter('paid')}
              className={`px-3 py-1 rounded-xl transition ${
                statusFilter === 'paid'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-emerald-500'
              }`}
            >
              Ödenenler (1)
            </button>
          </div>
        </div>

        {/* Fatura Listesi */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filteredInvoices.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-xs">
              Kriterlere uygun fatura bulunamadı.
            </div>
          ) : (
            filteredInvoices.map((inv) => {
              const isExpanded = expandedInvoiceId === inv.id;
              const isOverdue = inv.status === 'overdue';
              const isPaid = inv.status === 'paid';

              return (
                <div
                  key={inv.id}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 shadow-xs overflow-hidden transition-all"
                >
                  <div
                    onClick={() => setExpandedInvoiceId(isExpanded ? null : inv.id)}
                    className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-xs text-indigo-600 dark:text-indigo-400">
                          {inv.invoiceNo}
                        </span>
                        <span
                          className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase ${
                            isOverdue
                              ? 'bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 border border-rose-300 dark:border-rose-900'
                              : isPaid
                              ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400'
                              : 'bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {isOverdue ? `Vade Geçti (${inv.overdueDays} gün)` : isPaid ? 'Ödendi' : 'Açık Fatura'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-1">
                        <span>Düzenleme: {inv.date}</span>
                        <span>&bull;</span>
                        <span className={isOverdue ? 'text-rose-500 font-bold' : ''}>Vade: {inv.dueDate}</span>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-black text-sm text-slate-900 dark:text-white">
                        {formatCurrency(inv.grandTotal)}
                      </div>
                      {inv.remainingAmount > 0 && (
                        <div className="text-[10px] text-rose-500 font-bold">
                          Kalan: {formatCurrency(inv.remainingAmount)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Kalem Detayları */}
                  {isExpanded && (
                    <div className="p-3 bg-slate-50 dark:bg-slate-950/60 border-t border-slate-100 dark:border-slate-800 text-xs space-y-2 animate-in fade-in">
                      <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        Fatura Kalemleri & KDV Dağılımı
                      </div>
                      <div className="divide-y divide-slate-200 dark:divide-slate-800">
                        {inv.items.map((item, i) => (
                          <div key={i} className="py-1.5 flex justify-between items-center text-xs">
                            <div>
                              <span className="font-semibold text-slate-800 dark:text-slate-200">{item.name}</span>
                              <span className="text-[10px] text-slate-400 block">
                                {item.quantity} Adet &times; {formatCurrency(item.unitPrice)}
                              </span>
                            </div>
                            <span className="font-bold text-slate-900 dark:text-white">
                              {formatCurrency(item.total)}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-1 text-xs">
                        <div className="flex justify-between text-slate-500">
                          <span>Ara Toplam:</span>
                          <span>{formatCurrency(inv.amount)}</span>
                        </div>
                        <div className="flex justify-between text-slate-500">
                          <span>KDV (%20):</span>
                          <span>{formatCurrency(inv.vat)}</span>
                        </div>
                        <div className="flex justify-between text-slate-900 dark:text-white font-extrabold text-sm pt-1 border-t border-slate-200 dark:border-slate-800">
                          <span>Genel Toplam:</span>
                          <span className="text-indigo-600 dark:text-indigo-400">{formatCurrency(inv.grandTotal)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Alt Hızlı Aksiyon */}
        <div className="p-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/80 flex items-center justify-between gap-2">
          <button
            onClick={() => {
              onClose();
              if (onStartOrder) onStartOrder(customer);
            }}
            className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-4 rounded-2xl text-xs flex items-center justify-center gap-1.5 transition active:scale-95 shadow-md shadow-indigo-600/20"
          >
            <Plus className="w-4 h-4" />
            <span>Bu Cariye Yeni Faturalı Sipariş Yaz</span>
          </button>
        </div>
      </div>
    </div>
  );
};
