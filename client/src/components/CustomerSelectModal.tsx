import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useApp } from '../context/AppContext';
import type { Customer } from '../types';
import {
  Search,
  X,
  UserCheck,
  MapPin,
  Check,
  Building2,
  UserX,
} from 'lucide-react';

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    minimumFractionDigits: 2,
  }).format(val);
};

const normalizeTr = (text: string) =>
  (text || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

export const CustomerSelectModal: React.FC = () => {
  const {
    isCustomerSelectModalOpen,
    closeCustomerSelectModal,
    selectedCustomer,
    selectCustomer,
  } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const allCustomers = useLiveQuery(() => db.customers.toArray()) || [];

  useEffect(() => {
    if (isCustomerSelectModalOpen) {
      setSearchTerm('');
      // Masaüstünde arama kutusuna otomatik odaklan (mobilde klavyenin aniden ekranı kapatmaması için yalnızca geniş ekranda)
      if (typeof window !== 'undefined' && window.innerWidth >= 640) {
        setTimeout(() => {
          searchInputRef.current?.focus();
        }, 80);
      }
    }
  }, [isCustomerSelectModalOpen]);

  const filteredCustomers = useMemo(() => {
    const raw = searchTerm.trim();
    if (!raw) return allCustomers;
    const q = normalizeTr(raw);
    return allCustomers.filter((c) => {
      return (
        normalizeTr(c.name).includes(q) ||
        normalizeTr(c.code).includes(q) ||
        normalizeTr(c.district || '').includes(q) ||
        normalizeTr(c.city || '').includes(q) ||
        normalizeTr(c.taxNumber || '').includes(q)
      );
    });
  }, [allCustomers, searchTerm]);

  if (!isCustomerSelectModalOpen) return null;

  const handlePickCustomer = (customer: Customer) => {
    selectCustomer(customer);
    closeCustomerSelectModal();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-xs animate-fadeIn"
      onClick={closeCustomerSelectModal}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg max-h-[90dvh] sm:max-h-[85vh] flex flex-col bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden text-slate-900 dark:text-slate-100"
      >
        {/* Üst Başlık */}
        <div className="shrink-0 px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-950/60">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <UserCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white truncate">
                Sipariş İçin Cari Seçin
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                Sepetteki ürünler seçtiğiniz cariye atanacaktır
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={closeCustomerSelectModal}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Arama Çubuğu */}
        <div className="shrink-0 p-3.5 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2.5">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              ref={searchInputRef}
              type="text"
              enterKeyHint="search"
              data-no-autoscroll="true"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari adı, kodu, ilçe veya vergi no ile ara..."
              className="w-full bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-2xl pl-10 pr-20 py-2.5 text-[16px] sm:text-xs font-semibold text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
            />
            {searchTerm ? (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
            ) : (
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 bg-slate-200/70 dark:bg-slate-700 px-2 py-0.5 rounded-full">
                {filteredCustomers.length} Cari
              </span>
            )}
          </div>

          {/* Seçili Cari Varsa Hızlı Bilgi & Kaldırma */}
          {selectedCustomer && (
            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200/70 dark:border-blue-800/60 text-xs">
              <div className="min-w-0 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                <span className="text-slate-500 dark:text-slate-400 shrink-0">Seçili:</span>
                <span className="font-bold text-slate-900 dark:text-white truncate">
                  {selectedCustomer.name}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  selectCustomer(null);
                  closeCustomerSelectModal();
                }}
                className="flex items-center gap-1 text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:underline shrink-0"
              >
                <UserX className="w-3.5 h-3.5" />
                <span>Seçimi Kaldır</span>
              </button>
            </div>
          )}
        </div>

        {/* Cari Listesi */}
        <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]">
          {filteredCustomers.length === 0 ? (
            <div className="py-12 px-6 text-center text-slate-400">
              <Building2 className="w-10 h-10 mx-auto mb-2.5 text-slate-300 dark:text-slate-700" />
              <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                 Eşleşen cari bulunamadı
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Farklı bir cari adı, kod veya ilçe deneyebilirsiniz.
              </p>
            </div>
          ) : (
            filteredCustomers.slice(0, 100).map((cust) => {
              const isSelected = selectedCustomer?.id === cust.id;
              return (
                <button
                  key={cust.id}
                  type="button"
                  onClick={() => handlePickCustomer(cust)}
                  className={`w-full text-left px-4 py-3 flex items-center justify-between gap-3 transition active:scale-[0.99] ${
                    isSelected
                      ? 'bg-blue-50/90 dark:bg-blue-950/40'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/80 border border-blue-200/60 dark:border-blue-800/60 px-1.5 py-0.5 rounded">
                        {cust.code}
                      </span>
                      {cust.priceList > 1 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                          Liste {cust.priceList}
                        </span>
                      )}
                      {cust.specialDiscount > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300">
                          %{cust.specialDiscount} İsk.
                        </span>
                      )}
                    </div>

                    <div className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate mt-1">
                      {cust.name}
                    </div>

                    <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      <MapPin className="w-3 h-3 text-rose-500 shrink-0" />
                      <span className="truncate">
                        {cust.district || 'Merkez'}, {cust.city || 'Erzurum'}
                      </span>
                    </div>
                  </div>

                  <div className="text-right shrink-0 flex flex-col items-end gap-1">
                    <div>
                      <span
                        className={`text-xs font-extrabold block ${
                          cust.balance > 0
                            ? 'text-rose-600 dark:text-rose-400'
                            : cust.balance < 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {formatCurrency(Math.abs(cust.balance))}
                      </span>
                      <span className="text-[10px] text-slate-400 font-semibold block">
                        {cust.balance > 0 ? 'Borçlu' : cust.balance < 0 ? 'Alacaklı' : 'Bakiyesiz'}
                      </span>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                        isSelected
                          ? 'bg-emerald-600 text-white'
                          : 'bg-blue-600 text-white shadow-2xs'
                      }`}
                    >
                      {isSelected ? (
                        <>
                          <Check className="w-3 h-3" />
                          <span>Seçili</span>
                        </>
                      ) : (
                        <span>Seç</span>
                      )}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
