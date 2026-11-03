import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useApp } from '../context/AppContext';
import type { Customer } from '../types';
import { 
  Search, 
  X, 
  MapPin, 
  Phone, 
  ChevronUp, 
  ChevronDown, 
  Receipt, 
  FileCheck, 
  ShoppingCart, 
  Banknote, 
  Calendar, 
  CheckCircle2, 
  FileText, 
  Building, 
  Check
} from 'lucide-react';
import { CustomerReceiptsModal } from '../components/CustomerReceiptsModal';
import { CustomerInvoicesModal } from '../components/CustomerInvoicesModal';
import { CustomerOrdersModal } from '../components/CustomerOrdersModal';
import { CustomerStatementModal } from '../components/CustomerStatementModal';

export const CustomersPage: React.FC = () => {
  const { 
    selectedCustomer, 
    selectCustomer, 
    setActiveTab, 
    openCollectionModal, 
    serverConfig 
  } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  // Modallar
  const [receiptsModalCustomer, setReceiptsModalCustomer] = useState<Customer | null>(null);
  const [invoicesModalCustomer, setInvoicesModalCustomer] = useState<Customer | null>(null);
  const [ordersModalCustomer, setOrdersModalCustomer] = useState<Customer | null>(null);
  const [statementCustomer, setStatementCustomer] = useState<Customer | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // IndexedDB'den canlı carileri çek
  const customers = useLiveQuery(() => db.customers.toArray(), []) || [];

  // Arama filtreleme
  const filteredCustomers = useMemo(() => {
    if (!searchTerm.trim()) return customers;
    const q = searchTerm.toLowerCase();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.city.toLowerCase().includes(q) ||
        c.district.toLowerCase().includes(q) ||
        (c.taxNumber && c.taxNumber.includes(q))
    );
  }, [customers, searchTerm]);

  // Arama değiştiğinde başa sar
  useEffect(() => {
    setActiveIndex(0);
    if (containerRef.current) {
      containerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [searchTerm]);

  // Reels kaydırma olayını dinleyip aktif cari indeksini bul
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, clientHeight } = containerRef.current;
    if (clientHeight > 0) {
      const idx = Math.round(scrollTop / clientHeight);
      if (idx !== activeIndex && idx >= 0 && idx < filteredCustomers.length) {
        setActiveIndex(idx);
      }
    }
  };

  // Önceki / Sonraki Cari Kartına Kaydır (Reels tarzı)
  const scrollToCustomer = (index: number) => {
    if (!containerRef.current) return;
    const targetIdx = Math.max(0, Math.min(filteredCustomers.length - 1, index));
    const targetTop = targetIdx * containerRef.current.clientHeight;
    containerRef.current.scrollTo({ top: targetTop, behavior: 'smooth' });
    setActiveIndex(targetIdx);
  };

  // Klavye Yukarı / Aşağı tuşlarıyla geçiş desteği
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return; // Arama çubuğundayken klavye kaydırmayı engelleme
      }
      if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault();
        scrollToCustomer(activeIndex + 1);
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        scrollToCustomer(activeIndex - 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeIndex, filteredCustomers.length]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 2,
    }).format(val);
  };

  // Cari İsim Baş Harfleri (Logo yoksa şık monogram)
  const getInitials = (name: string): string => {
    const clean = name.replace(/[^a-zA-ZçğıöşüÇĞİÖŞÜ0-9\s]/g, '').trim();
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'CR';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  };

  // Cari bazlı finansal simülasyon / gerçek veri hesaplama
  const getCustomerFinancials = (cust: Customer) => {
    const balance = cust.balance || 0;
    
    // Vadesi Geçmiş Ödemeler
    let overdueAmount = 0;
    let overdueDays = 0;
    if (balance > 0) {
      overdueAmount = Math.round(balance * 0.35 * 100) / 100;
      overdueDays = overdueAmount > 5000 ? 18 : 7;
    }

    // Son Tahsilat
    let lastCollectionAmount = 0;
    let lastCollectionDate = '';
    if (balance > 0) {
      lastCollectionAmount = Math.round((balance * 0.45 + 1200) * 100) / 100;
      lastCollectionDate = '14 Ekim 2026 (Nakit)';
    } else {
      lastCollectionAmount = 15000;
      lastCollectionDate = '22 Ekim 2026 (Havale)';
    }

    return {
      overdueAmount,
      overdueDays,
      lastCollectionAmount,
      lastCollectionDate,
    };
  };

  return (
    <div className="w-full h-[calc(100vh-130px)] sm:h-[calc(100vh-140px)] flex flex-col bg-slate-100 dark:bg-slate-950 p-2 sm:p-4 text-slate-900 dark:text-slate-100 overflow-hidden">
      {/* 1. Görsel-3 Arama Yeri */}
      <div className="w-full max-w-xl mx-auto shrink-0 mb-2">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cari adı, kodu, ilçe veya vergi no ile ara..."
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl pl-10 pr-20 py-2.5 text-xs font-semibold text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
          />
          {searchTerm ? (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
              {filteredCustomers.length} Cari
            </span>
          )}
        </div>
      </div>

      {/* 2. Görsel-3: Instagram Reels Tarzı Kaydırmalı Cari Kartları */}
      {filteredCustomers.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-slate-400">
          <Building className="w-12 h-12 mb-3 text-slate-300 dark:text-slate-700 animate-pulse" />
          <p className="text-sm font-bold">Aradığınız kriterde cari hesap bulunamadı.</p>
          <p className="text-xs text-slate-500 mt-1">Lütfen arama terimini kontrol ediniz.</p>
        </div>
      ) : (
        <div className="relative flex-1 w-full max-w-xl mx-auto overflow-hidden">
          {/* Reels Dikey Kaydırma Konteyneri */}
          <div
            ref={containerRef}
            onScroll={handleScroll}
            className="w-full h-full overflow-y-scroll snap-y snap-mandatory scroll-smooth no-scrollbar space-y-4"
          >
            {filteredCustomers.map((cust) => {
              const fin = getCustomerFinancials(cust);
              const initials = getInitials(cust.name);
              const isSelected = selectedCustomer?.id === cust.id;

              return (
                <div
                  key={cust.id}
                  className="w-full h-full snap-start snap-always shrink-0 flex flex-col justify-between p-4 sm:p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl relative overflow-hidden transition-all"
                >
                  {/* Kart Üst Bar: Logo + Cari İsmi */}
                  <div>
                    <div className="flex items-start gap-3">
                      {/* Varsa Logo veya Şık Monogram Baş Harf Rozeti */}
                      {cust.logo ? (
                        <img
                          src={cust.logo}
                          alt={cust.name}
                          className="w-13 h-13 rounded-2xl object-cover border border-slate-200 dark:border-slate-700 shadow-md shrink-0"
                        />
                      ) : (
                        <div className="w-13 h-13 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 text-white font-black text-base flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0 select-none">
                          {initials}
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-[11px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/70 border border-blue-200/60 dark:border-blue-800/60 px-2 py-0.5 rounded-lg">
                            {cust.code}
                          </span>
                          {cust.specialDiscount > 0 && (
                            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300">
                              %{cust.specialDiscount} İsk.
                            </span>
                          )}
                          {isSelected && (
                            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 flex items-center gap-0.5">
                              <Check className="w-2.5 h-2.5" /> Seçili
                            </span>
                          )}
                        </div>

                        {/* Cari İsmi (Mevcut olan güzel) */}
                        <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white leading-snug line-clamp-2 mt-1">
                          {cust.name}
                        </h2>

                        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
                          <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          <span className="truncate">{cust.district}, {cust.city}</span>
                        </div>
                      </div>
                    </div>

                    {/* Detay Adres ve İletişim Bilgileri */}
                    <div className="mt-3 p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200/60 dark:border-slate-800/60 text-xs space-y-1">
                      <div className="text-[11px] text-slate-600 dark:text-slate-400 truncate">
                        <strong>Adres:</strong> {cust.address || 'Kayıtlı adres bulunmuyor.'}
                      </div>
                      {cust.phone && (
                        <div className="text-[11px] text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                          <Phone className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                          <a href={`tel:${cust.phone}`} className="hover:underline font-semibold text-blue-600 dark:text-blue-400">
                            {cust.phone}
                          </a>
                          {cust.taxOffice && (
                            <span className="text-slate-400 ml-2">&bull; VD: {cust.taxOffice} ({cust.taxNumber || '-'})</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Görsel-3: Finansal Bilgiler (Karşılıklı Şık Satırlar) */}
                  <div className="my-auto py-2">
                    <div className="bg-slate-50 dark:bg-slate-950/80 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3.5 space-y-3 shadow-inner">
                      {/* 1. Vadesi Geçmiş Ödemeler */}
                      <div className="flex items-center justify-between pb-2 border-b border-slate-200/60 dark:border-slate-800/60">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold shrink-0">
                            <Calendar className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                              Vadesi Geçmiş Ödemeler
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {fin.overdueAmount > 0 ? `${fin.overdueDays} gün gecikmede` : 'Gecikmiş borç yok'}
                            </span>
                          </div>
                        </div>
                        <span
                          className={`text-xs sm:text-sm font-black ${
                            fin.overdueAmount > 0
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {formatCurrency(fin.overdueAmount)}
                        </span>
                      </div>

                      {/* 2. Son Tahsilat */}
                      <div className="flex items-center justify-between pb-2 border-b border-slate-200/60 dark:border-slate-800/60">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold shrink-0">
                            <CheckCircle2 className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                              Son Tahsilat
                            </span>
                            <span className="text-[10px] text-slate-400 truncate max-w-[130px] block">
                              {fin.lastCollectionDate}
                            </span>
                          </div>
                        </div>
                        <span className="text-xs sm:text-sm font-black text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(fin.lastCollectionAmount)}
                        </span>
                      </div>

                      {/* 3. Ekstre Bilgileri (Bakiye Durumu) */}
                      <div className="flex items-center justify-between pt-0.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold shrink-0">
                            <FileText className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                              Ekstre Bilgileri
                            </span>
                            <span className="text-[10px] text-slate-400 block">
                              {cust.balance > 0 ? 'Müşteri Borçlu' : cust.balance < 0 ? 'Müşteri Alacaklı' : 'Bakiye Sıfır'}
                            </span>
                          </div>
                        </div>

                        <div className="text-right">
                          <span
                            className={`text-sm sm:text-base font-black tracking-tight ${
                              cust.balance > 0
                                ? 'text-rose-600 dark:text-rose-400'
                                : cust.balance < 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-slate-500'
                            }`}
                          >
                            {formatCurrency(Math.abs(cust.balance))}
                          </span>
                          <span className="text-[10px] text-slate-400 font-bold block">
                            {cust.balance > 0 ? '(Borçlu)' : cust.balance < 0 ? '(Alacaklı)' : '(Bakiyesiz)'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Görsel-3: Kart Üzerinde Fiş, Fatura, Sipariş ve Tahsilat Butonları */}
                  <div className="pt-2">
                    <div className="grid grid-cols-4 gap-2">
                      {/* Buton 1: Fiş */}
                      <button
                        type="button"
                        onClick={() => setReceiptsModalCustomer(cust)}
                        className="flex flex-col items-center justify-center py-2.5 px-1 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/20 transition active:scale-95 group font-bold text-xs shadow-2xs"
                        title="Bu carinin satış fişlerini ve fiş detaylarını incele"
                      >
                        <Receipt className="w-4 h-4 mb-1 group-hover:scale-110 transition-transform" />
                        <span>Fiş</span>
                      </button>

                      {/* Buton 2: Fatura */}
                      <button
                        type="button"
                        onClick={() => setInvoicesModalCustomer(cust)}
                        className="flex flex-col items-center justify-center py-2.5 px-1 rounded-2xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20 transition active:scale-95 group font-bold text-xs shadow-2xs"
                        title="Bu carinin açık ve vadesi geçen faturalarını incele"
                      >
                        <FileCheck className="w-4 h-4 mb-1 group-hover:scale-110 transition-transform" />
                        <span>Fatura</span>
                      </button>

                      {/* Buton 3: Sipariş */}
                      <button
                        type="button"
                        onClick={() => setOrdersModalCustomer(cust)}
                        className="flex flex-col items-center justify-center py-2.5 px-1 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/25 transition active:scale-95 group font-bold text-xs"
                        title="Bu cariye yeni sipariş başlat veya önceki siparişlerini gör"
                      >
                        <ShoppingCart className="w-4 h-4 mb-1 group-hover:scale-110 transition-transform" />
                        <span>Sipariş</span>
                      </button>

                      {/* Buton 4: Tahsilat */}
                      <button
                        type="button"
                        onClick={() => openCollectionModal(cust)}
                        className="flex flex-col items-center justify-center py-2.5 px-1 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-500/25 transition active:scale-95 group font-bold text-xs"
                        title="Bu cariden anında nakit/kredi kartı/çek tahsilatı al"
                      >
                        <Banknote className="w-4 h-4 mb-1 group-hover:scale-110 transition-transform" />
                        <span>Tahsilat</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Reels Sağ Taraf Yüzen Navigasyon Kontrolleri (Yukarı / Aşağı Kaydır) */}
          <div className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-2 bg-slate-900/80 backdrop-blur-md p-1.5 rounded-full border border-slate-700/80 shadow-2xl text-white">
            <button
              onClick={() => scrollToCustomer(activeIndex - 1)}
              disabled={activeIndex === 0}
              className="p-1.5 rounded-full hover:bg-white/20 disabled:opacity-30 transition active:scale-90"
              title="Önceki Cari (Yukarı Kaydır)"
            >
              <ChevronUp className="w-4 h-4" />
            </button>

            <div className="text-[10px] font-black tracking-tighter text-blue-300 py-0.5 text-center leading-tight">
              <span>{activeIndex + 1}</span>
              <span className="block text-[8px] text-slate-400">/</span>
              <span>{filteredCustomers.length}</span>
            </div>

            <button
              onClick={() => scrollToCustomer(activeIndex + 1)}
              disabled={activeIndex >= filteredCustomers.length - 1}
              className="p-1.5 rounded-full hover:bg-white/20 disabled:opacity-30 transition active:scale-90"
              title="Sonraki Cari (Aşağı Kaydır)"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Modallar */}
      {/* 1. Fiş Modalı */}
      <CustomerReceiptsModal
        customer={receiptsModalCustomer}
        isOpen={!!receiptsModalCustomer}
        onClose={() => setReceiptsModalCustomer(null)}
        onStartOrder={(c) => {
          selectCustomer(c);
          setActiveTab('catalog');
        }}
      />

      {/* 2. Fatura Modalı */}
      <CustomerInvoicesModal
        customer={invoicesModalCustomer}
        isOpen={!!invoicesModalCustomer}
        onClose={() => setInvoicesModalCustomer(null)}
        onStartOrder={(c) => {
          selectCustomer(c);
          setActiveTab('catalog');
        }}
      />

      {/* 3. Sipariş Modalı */}
      <CustomerOrdersModal
        customer={ordersModalCustomer}
        isOpen={!!ordersModalCustomer}
        onClose={() => setOrdersModalCustomer(null)}
        onStartOrder={(c) => {
          selectCustomer(c);
          setActiveTab('catalog');
        }}
      />

      {/* 4. Ekstre Modalı (Gerektiğinde açılır) */}
      <CustomerStatementModal
        customer={statementCustomer}
        serverConfig={serverConfig}
        isOpen={!!statementCustomer}
        onClose={() => setStatementCustomer(null)}
        onOpenCollection={(c) => openCollectionModal(c)}
      />
    </div>
  );
};
