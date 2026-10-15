import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useApp } from '../context/AppContext';
import type { Customer, PaymentMethod, CollectionRecord } from '../types';
import { 
  X, 
  Banknote, 
  CreditCard, 
  Building, 
  FileText, 
  CheckCircle2, 
  AlertCircle,
  Search,
  Printer,
  Save
} from 'lucide-react';

interface CollectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetCustomer?: Customer | null;
  onSuccess?: (collection: CollectionRecord, printDirectly: boolean) => void;
}

export const CollectionModal: React.FC<CollectionModalProps> = ({
  isOpen,
  onClose,
  targetCustomer,
  onSuccess,
}) => {
  const { createCollection } = useApp();
  const allCustomers = useLiveQuery(() => db.customers.toArray(), []) || [];

  const [selectedCust, setSelectedCust] = useState<Customer | null>(null);
  const [custSearch, setCustSearch] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('nakit');
  const [amount, setAmount] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Çek bilgileri
  const [checkBank, setCheckBank] = useState<string>('');
  const [checkNo, setCheckNo] = useState<string>('');
  const [checkDueDate, setCheckDueDate] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (targetCustomer) {
        setSelectedCust(targetCustomer);
      } else if (!selectedCust && allCustomers.length > 0) {
        setSelectedCust(allCustomers[0]);
      }
      setAmount('');
      setNotes('');
      setCheckBank('');
      setCheckNo('');
      setCheckDueDate('');
      setErrorMessage(null);
    }
  }, [isOpen, targetCustomer]);

  if (!isOpen) return null;

  const currentBalance = selectedCust ? selectedCust.balance : 0;
  const numAmount = parseFloat(amount.replace(',', '.')) || 0;
  const remainingBalance = Math.max(0, currentBalance - numAmount);

  const handleQuickAmount = (val: number) => {
    setAmount(val.toFixed(2));
  };

  const handleSubmit = async (printDirectly: boolean = false) => {
    if (!selectedCust) {
      setErrorMessage('Lütfen bir müşteri / cari seçiniz.');
      return;
    }

    if (!numAmount || numAmount <= 0) {
      setErrorMessage('Lütfen geçerli bir tahsilat tutarı giriniz.');
      return;
    }

    if (paymentMethod === 'cek' && (!checkNo || !checkDueDate)) {
      setErrorMessage('Çek tahsilatlarında Çek No ve Vade Tarihi zorunludur.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await createCollection({
        customerId: selectedCust.id,
        customerCode: selectedCust.code,
        customerName: selectedCust.name,
        amount: numAmount,
        paymentMethod,
        notes,
        checkBank: paymentMethod === 'cek' ? checkBank : undefined,
        checkNo: paymentMethod === 'cek' ? checkNo : undefined,
        checkDueDate: paymentMethod === 'cek' ? checkDueDate : undefined,
      });

      if (res.success && res.collection) {
        if (onSuccess) {
          onSuccess(res.collection, printDirectly);
        }
        onClose();
      } else {
        setErrorMessage(res.error || 'Tahsilat kaydedilemedi.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Bir hata oluştu.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredCustomers = allCustomers.filter((c) =>
    c.name.toLowerCase().includes(custSearch.toLowerCase()) ||
    c.code.toLowerCase().includes(custSearch.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg max-h-[92vh] flex flex-col bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Üst Başlık */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-inner">
              <Banknote className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base">Saha Tahsilatı</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Nakit, Kart, Havale veya Çek Girişi</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Gövde */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {errorMessage && (
            <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 text-xs font-medium border border-rose-200 dark:border-rose-900/50 animate-shake">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Cari Seçimi */}
          {!targetCustomer ? (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Tahsilat Yapılacak Cari / Müşteri:
              </label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari adı veya kodu ile ara..."
                  value={custSearch}
                  onChange={(e) => setCustSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                />
              </div>

              {custSearch && (
                <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 divide-y divide-slate-100 dark:divide-slate-700 shadow-lg">
                  {filteredCustomers.slice(0, 5).map((cust) => (
                    <button
                      key={cust.id}
                      type="button"
                      onClick={() => {
                        setSelectedCust(cust);
                        setCustSearch('');
                      }}
                      className="w-full text-left px-3.5 py-2 hover:bg-slate-50 dark:hover:bg-slate-750 flex items-center justify-between text-xs"
                    >
                      <div className="truncate pr-2">
                        <p className="font-semibold text-slate-800 dark:text-white truncate">{cust.name}</p>
                        <p className="text-[10px] text-slate-400">{cust.code}</p>
                      </div>
                      <span className="font-bold text-slate-700 dark:text-slate-300 shrink-0">
                        {cust.balance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {/* Seçili Cari Kartı & Bakiye Özeti */}
          {selectedCust && (
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-750 space-y-2">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white">{selectedCust.name}</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Cari Kodu: {selectedCust.code}</p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Güncel Bakiye</span>
                  <span className={`text-sm font-extrabold ${selectedCust.balance > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                    {selectedCust.balance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Ödeme Yöntemi Seçimi */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Tahsilat Şekli:
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <button
                type="button"
                onClick={() => setPaymentMethod('nakit')}
                className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-center transition-all ${
                  paymentMethod === 'nakit'
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold shadow-sm'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                }`}
              >
                <Banknote className="w-5 h-5 mb-1" />
                <span className="text-xs">Nakit</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('kredi_karti')}
                className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-center transition-all ${
                  paymentMethod === 'kredi_karti'
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-bold shadow-sm'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                }`}
              >
                <CreditCard className="w-5 h-5 mb-1" />
                <span className="text-xs">POS / Kart</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('havale')}
                className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-center transition-all ${
                  paymentMethod === 'havale'
                    ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 font-bold shadow-sm'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                }`}
              >
                <Building className="w-5 h-5 mb-1" />
                <span className="text-xs">Havale/EFT</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('cek')}
                className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-center transition-all ${
                  paymentMethod === 'cek'
                    ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-bold shadow-sm'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                }`}
              >
                <FileText className="w-5 h-5 mb-1" />
                <span className="text-xs">Müşteri Çeki</span>
              </button>
            </div>
          </div>

          {/* Tutar Girişi */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Tahsil Edilen Tutar (₺):
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full pl-4 pr-12 py-3.5 text-xl font-black rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-base">₺</span>
            </div>

            {/* Hızlı Tutar Butonları */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {currentBalance > 0 && (
                <button
                  type="button"
                  onClick={() => handleQuickAmount(currentBalance)}
                  className="px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-xs font-bold hover:bg-emerald-200 transition-colors"
                >
                  Bakiyeyi Kapat ({currentBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺)
                </button>
              )}
              <button
                type="button"
                onClick={() => handleQuickAmount(1000)}
                className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                1.000 ₺
              </button>
              <button
                type="button"
                onClick={() => handleQuickAmount(2500)}
                className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                2.500 ₺
              </button>
              <button
                type="button"
                onClick={() => handleQuickAmount(5000)}
                className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                5.000 ₺
              </button>
              <button
                type="button"
                onClick={() => handleQuickAmount(10000)}
                className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                10.000 ₺
              </button>
            </div>
          </div>

          {/* Çek Detay Alanları (Sadece Çek Seçiliyse) */}
          {paymentMethod === 'cek' && (
            <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 space-y-3 animate-fadeIn">
              <h5 className="font-bold text-xs text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                <FileText className="w-4 h-4" /> Çek Bilgileri
              </h5>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="text-[11px] font-semibold text-amber-900 dark:text-amber-200 block mb-1">
                    Banka Adı
                  </label>
                  <input
                    type="text"
                    placeholder="örn: Garanti BBVA"
                    value={checkBank}
                    onChange={(e) => setCheckBank(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-amber-200 dark:border-amber-800 bg-white dark:bg-slate-850 text-slate-900 dark:text-white outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-amber-900 dark:text-amber-200 block mb-1">
                    Çek Seri No
                  </label>
                  <input
                    type="text"
                    placeholder="örn: 004819"
                    value={checkNo}
                    onChange={(e) => setCheckNo(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-amber-200 dark:border-amber-800 bg-white dark:bg-slate-850 text-slate-900 dark:text-white outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-amber-900 dark:text-amber-200 block mb-1">
                    Vade Tarihi
                  </label>
                  <input
                    type="date"
                    value={checkDueDate}
                    onChange={(e) => setCheckDueDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-amber-200 dark:border-amber-800 bg-white dark:bg-slate-850 text-slate-900 dark:text-white outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Açıklama / Not */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Açıklama / Makbuz Notu:
            </label>
            <input
              type="text"
              placeholder="örn: Eylül sevkiyatı elden nakit tahsilat"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs outline-none focus:border-emerald-500"
            />
          </div>

          {/* Bakiye Değişim Özeti */}
          {selectedCust && numAmount > 0 && (
            <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs flex items-center justify-between">
              <div>
                <span className="text-slate-500 dark:text-slate-400">İşlem Sonrası Bakiye:</span>
                <p className="font-extrabold text-slate-900 dark:text-white text-sm">
                  {remainingBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold">
                <CheckCircle2 className="w-4 h-4" />
                <span>{numAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺ Düşülecek</span>
              </div>
            </div>
          )}
        </div>

        {/* Alt Butonlar */}
        <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex flex-col sm:flex-row gap-2.5">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => handleSubmit(false)}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-2xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-xs transition-all active:scale-95 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>Sadece Kaydet</span>
          </button>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => handleSubmit(true)}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-lg shadow-emerald-500/20 transition-all active:scale-95 disabled:opacity-50"
          >
            <Printer className="w-4 h-4" />
            <span>Kaydet & Fiş Çıkar</span>
          </button>
        </div>
      </div>
    </div>
  );
};
