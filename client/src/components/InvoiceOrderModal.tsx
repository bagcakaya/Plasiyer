import React, { useState } from 'react';
import type { Order } from '../types';
import { useApp } from '../context/AppContext';
import { 
  FileCheck, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  Receipt,
  Truck,
  FileSpreadsheet
} from 'lucide-react';

interface InvoiceOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
  onSuccess?: () => void;
}

export const InvoiceOrderModal: React.FC<InvoiceOrderModalProps> = ({
  isOpen,
  onClose,
  order,
  onSuccess,
}) => {
  const { invoiceOrder } = useApp();

  const [invoiceType, setInvoiceType] = useState<'toptan' | 'perakende' | 'irsaliye'>('toptan');
  const [invoiceNo, setInvoiceNo] = useState<string>(() => {
    const yr = new Date().getFullYear();
    const rnd = Math.floor(100000 + Math.random() * 900000);
    return `OSM${yr}-${rnd}`;
  });
  const [notes, setNotes] = useState<string>('Depodan sevk ve faturalandırma onaylandı.');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !order) return null;

  const handleSubmit = async () => {
    if (!invoiceNo.trim()) {
      setErrorMessage('Lütfen bir fatura/irsaliye numarası giriniz.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const typePrefix = invoiceType === 'toptan' ? '[Toptan Fatura]' : invoiceType === 'perakende' ? '[Perakende Fatura]' : '[Sevk İrsaliyesi]';
    const fullNotes = `${typePrefix} ${notes}`.trim();

    const res = await invoiceOrder(order, invoiceNo, fullNotes);
    setIsSubmitting(false);

    if (res.success) {
      if (onSuccess) onSuccess();
      onClose();
    } else {
      setErrorMessage(res.error || 'Faturalaştırma işlemi yapılamadı.');
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 2,
    }).format(val);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/75 backdrop-blur-xs animate-fadeIn">
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden text-slate-900 dark:text-slate-100">
        {/* Üst Bar */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <FileCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm">ERP12 Faturalaştırma</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Siparişi Onayla & Muhasebeye Sevk Et</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Gövde */}
        <div className="p-5 space-y-4">
          {errorMessage && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 text-xs border border-rose-200 dark:border-rose-900/50">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Sipariş Özeti */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 space-y-1.5 text-xs">
            <div className="flex justify-between font-bold">
              <span>{order.customerName}</span>
              <span className="font-mono text-slate-500">{order.customerCode}</span>
            </div>
            <div className="flex justify-between text-slate-500 dark:text-slate-400">
              <span>Sipariş No:</span>
              <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{order.erp12DocNo || order.tempId}</span>
            </div>
            <div className="flex justify-between text-slate-500 dark:text-slate-400">
              <span>Kalem Sayısı:</span>
              <span>{order.items.length} Kalem Ürün</span>
            </div>
            <div className="flex justify-between font-extrabold text-sm pt-1.5 border-t border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-400">
              <span>Fatura Tutarı:</span>
              <span>{formatCurrency(order.grandTotal)}</span>
            </div>
          </div>

          {/* Belge Türü Seçimi */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Oluşturulacak Belge Türü:
            </label>
            <div className="grid grid-cols-3 gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => setInvoiceType('toptan')}
                className={`p-2.5 rounded-xl border text-center font-bold flex flex-col items-center gap-1 transition ${
                  invoiceType === 'toptan'
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span className="text-[11px]">Toptan Fatura</span>
              </button>

              <button
                type="button"
                onClick={() => setInvoiceType('perakende')}
                className={`p-2.5 rounded-xl border text-center font-bold flex flex-col items-center gap-1 transition ${
                  invoiceType === 'perakende'
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                <Receipt className="w-4 h-4" />
                <span className="text-[11px]">Perakende</span>
              </button>

              <button
                type="button"
                onClick={() => setInvoiceType('irsaliye')}
                className={`p-2.5 rounded-xl border text-center font-bold flex flex-col items-center gap-1 transition ${
                  invoiceType === 'irsaliye'
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                <Truck className="w-4 h-4" />
                <span className="text-[11px]">Sevk İrsaliye</span>
              </button>
            </div>
          </div>

          {/* Fatura No Girişi */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Fatura / Belge Seri No:
            </label>
            <input
              type="text"
              value={invoiceNo}
              onChange={(e) => setInvoiceNo(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          {/* Sevk Notu */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Muhasebe / Depo Sevk Notu:
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Alt Butonlar */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-xs transition"
          >
            İptal
          </button>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleSubmit}
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{isSubmitting ? 'İşleniyor...' : 'Faturayı Kes & Onayla'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
