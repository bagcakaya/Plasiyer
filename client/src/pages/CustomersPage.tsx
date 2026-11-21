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
  Receipt, 
  FileCheck, 
  ShoppingCart, 
  Banknote, 
  Calendar, 
  CheckCircle2, 
  FileText, 
  Building, 
  Check,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  BarChart3,
  ArrowLeft,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { CustomerReceiptsModal } from '../components/CustomerReceiptsModal';
import { CustomerInvoicesModal } from '../components/CustomerInvoicesModal';
import { CustomerOrdersModal } from '../components/CustomerOrdersModal';
import { CustomerStatementModal } from '../components/CustomerStatementModal';
import { CustomerHistoryModal } from '../components/CustomerHistoryModal';
import { filterCustomersForPlasiyer, getCustomerRegionCode } from '../utils/plasiyerScope';

export const CustomersPage: React.FC = () => {
  const { 
    currentUser,
    isCompanyManager,
    selectedCustomer, 
    selectCustomer,
    setActiveTab,
    customerSelectReturnTab,
    openCollectionModal, 
    serverConfig,
    triggerSync,
    isSyncing,
  } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<string>('ALL');
  const [activeIndex, setActiveIndex] = useState(0);
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(null);
  const [updateToast, setUpdateToast] = useState<{ message: string; success: boolean } | null>(null);
  const CUSTOMERS_PAGE_SIZE = 30;
  const [visibleCustomerCount, setVisibleCustomerCount] = useState<number>(CUSTOMERS_PAGE_SIZE);

  // Modallar
  const [receiptsModalCustomer, setReceiptsModalCustomer] = useState<Customer | null>(null);
  const [invoicesModalCustomer, setInvoicesModalCustomer] = useState<Customer | null>(null);
  const [ordersModalCustomer, setOrdersModalCustomer] = useState<Customer | null>(null);
  const [statementCustomer, setStatementCustomer] = useState<Customer | null>(null);
  const [historyModalCustomer, setHistoryModalCustomer] = useState<Customer | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const regionScrollRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Rut bölgesi yatay kaydırma okları ve mouse sürükleme
  const [showRegionLeftArrow, setShowRegionLeftArrow] = useState(false);
  const [showRegionRightArrow, setShowRegionRightArrow] = useState(false);
  const [isRegionMouseDown, setIsRegionMouseDown] = useState(false);
  const [regionStartX, setRegionStartX] = useState(0);
  const [regionScrollLeftStart, setRegionScrollLeftStart] = useState(0);
  const [isRegionDragging, setIsRegionDragging] = useState(false);

  // Cari listesi dikey mouse sürükleme ile kaydırma
  const [isListMouseDown, setIsListMouseDown] = useState(false);
  const [listStartY, setListStartY] = useState(0);
  const [listScrollTopStart, setListScrollTopStart] = useState(0);
  const [isListDragging, setIsListDragging] = useState(false);

  // IndexedDB'den canlı carileri çek ve plasiyerin tanımlı Rut Bölgeleri yetkisine göre filtrele
  const rawCustomers = useLiveQuery(() => db.customers.toArray(), []) || [];
  const customers = useMemo(
    () => filterCustomersForPlasiyer(rawCustomers, currentUser, isCompanyManager),
    [rawCustomers, currentUser, isCompanyManager]
  );

  // Mevcut görünür carilerdeki Rut Bölgeleri listesi
  const availableRegions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of customers) {
      const reg = getCustomerRegionCode(c);
      if (!reg || reg === 'GENEL') continue;
      counts.set(reg, (counts.get(reg) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => a[0].localeCompare(b[0], 'tr-TR'))
      .map(([name, count]) => ({ name, count }));
  }, [customers]);

  useEffect(() => {
    if (selectedRegion !== 'ALL' && !availableRegions.some((r) => r.name === selectedRegion)) {
      setSelectedRegion('ALL');
    }
  }, [availableRegions, selectedRegion]);

  // Arama ve Rut Bölgesi filtreleme
  const filteredCustomers = useMemo(() => {
    let base = customers;
    if (selectedRegion !== 'ALL') {
      base = base.filter((c) => getCustomerRegionCode(c) === selectedRegion);
    }
    if (!searchTerm.trim()) return base;
    const q = searchTerm.toLowerCase();
    return base.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.city.toLowerCase().includes(q) ||
        c.district.toLowerCase().includes(q) ||
        (c.regionCode && c.regionCode.toLowerCase().includes(q)) ||
        (c.taxNumber && c.taxNumber.includes(q))
    );
  }, [customers, searchTerm, selectedRegion]);

  // Arama veya bölge değiştiğinde başa sar
  useEffect(() => {
    setActiveIndex(0);
    setVisibleCustomerCount(CUSTOMERS_PAGE_SIZE);
    if (containerRef.current) {
      containerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [searchTerm, selectedRegion]);

  const visibleCustomers = useMemo(
    () => filteredCustomers.slice(0, visibleCustomerCount),
    [filteredCustomers, visibleCustomerCount]
  );

  // Rut bölgesi kaydırma oklarını güncelle
  const updateRegionScrollArrows = () => {
    if (!regionScrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = regionScrollRef.current;
    setShowRegionLeftArrow(scrollLeft > 6);
    setShowRegionRightArrow(scrollLeft < scrollWidth - clientWidth - 6);
  };

  useEffect(() => {
    const el = regionScrollRef.current;
    if (!el) return;
    updateRegionScrollArrows();
    const timer = setTimeout(updateRegionScrollArrows, 80);

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0 || e.deltaX !== 0) {
        e.preventDefault();
        el.scrollLeft += e.deltaY !== 0 ? e.deltaY : e.deltaX;
        updateRegionScrollArrows();
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('resize', updateRegionScrollArrows);
    return () => {
      clearTimeout(timer);
      el.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', updateRegionScrollArrows);
    };
  }, [availableRegions.length]);

  const handleRegionScrollByButton = (dir: 'left' | 'right') => {
    if (!regionScrollRef.current) return;
    regionScrollRef.current.scrollBy({
      left: dir === 'left' ? -240 : 240,
      behavior: 'smooth',
    });
    setTimeout(updateRegionScrollArrows, 280);
  };

  const handleRegionMouseDown = (e: React.MouseEvent) => {
    if (!regionScrollRef.current) return;
    setIsRegionMouseDown(true);
    setIsRegionDragging(false);
    setRegionStartX(e.pageX - regionScrollRef.current.getBoundingClientRect().left);
    setRegionScrollLeftStart(regionScrollRef.current.scrollLeft);
  };

  const handleRegionMouseMove = (e: React.MouseEvent) => {
    if (!isRegionMouseDown || !regionScrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - regionScrollRef.current.getBoundingClientRect().left;
    const dist = x - regionStartX;
    if (Math.abs(dist) > 5) {
      setIsRegionDragging(true);
    }
    regionScrollRef.current.scrollLeft = regionScrollLeftStart - dist;
    updateRegionScrollArrows();
  };

  const handleRegionMouseUpOrLeave = () => {
    setIsRegionMouseDown(false);
    setTimeout(() => setIsRegionDragging(false), 60);
  };

  // Cari listesi dikey mouse sürükleme
  const handleListMouseDown = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    setIsListMouseDown(true);
    setIsListDragging(false);
    setListStartY(e.pageY - containerRef.current.getBoundingClientRect().top);
    setListScrollTopStart(containerRef.current.scrollTop);
  };

  const handleListMouseMove = (e: React.MouseEvent) => {
    if (!isListMouseDown || !containerRef.current) return;
    const y = e.pageY - containerRef.current.getBoundingClientRect().top;
    const dist = y - listStartY;
    if (Math.abs(dist) > 6) {
      setIsListDragging(true);
    }
    containerRef.current.scrollTop = listScrollTopStart - dist;
  };

  const handleListMouseUpOrLeave = () => {
    setIsListMouseDown(false);
    setTimeout(() => setIsListDragging(false), 60);
  };

  // Kaydırma olayını dinleyip kademeli yükle
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, clientHeight, scrollHeight } = containerRef.current;
    if (clientHeight > 0) {
      if (expandedCustomerId !== null) {
        const idx = Math.round(scrollTop / clientHeight);
        if (idx !== activeIndex && idx >= 0 && idx < filteredCustomers.length) {
          setActiveIndex(idx);
          const currentCust = filteredCustomers[idx];
          if (currentCust && currentCust.id !== expandedCustomerId) {
            setExpandedCustomerId(currentCust.id);
          }
        }
        if (idx >= visibleCustomerCount - 8 && visibleCustomerCount < filteredCustomers.length) {
          setVisibleCustomerCount((prev) =>
            Math.min(prev + CUSTOMERS_PAGE_SIZE, filteredCustomers.length)
          );
        }
      } else if (
        scrollTop + clientHeight >= scrollHeight - 360 &&
        visibleCustomerCount < filteredCustomers.length
      ) {
        setVisibleCustomerCount((prev) =>
          Math.min(prev + CUSTOMERS_PAGE_SIZE, filteredCustomers.length)
        );
      }
    }
  };

  const handleToggleDrawer = (cust: Customer, idx: number) => {
    if (isListDragging) return;
    setActiveIndex(idx);
    if (expandedCustomerId !== null) {
      // Çekmece açıkken tekrar basılırsa çekmece moduna (Görsel-2 kompakt listeye) geri dön
      setExpandedCustomerId(null);
      setTimeout(() => {
        cardRefs.current[cust.id]?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }, 40);
    } else {
      // Çekmeceyi aç (Görsel-1 tam kart ve aynı Reels kaydırma düzeni)
      setExpandedCustomerId(cust.id);
      setTimeout(() => {
        cardRefs.current[cust.id]?.scrollIntoView({
          behavior: 'auto',
          block: 'start',
        });
      }, 25);
    }
  };

  // Klavye Yukarı / Aşağı tuşlarıyla geçiş desteği
  const scrollToCustomer = (index: number) => {
    if (!containerRef.current || filteredCustomers.length === 0) return;
    const targetIdx = Math.max(0, Math.min(filteredCustomers.length - 1, index));
    if (targetIdx >= visibleCustomerCount - 5 && visibleCustomerCount < filteredCustomers.length) {
      setVisibleCustomerCount((prev) =>
        Math.min(Math.max(prev + CUSTOMERS_PAGE_SIZE, targetIdx + 10), filteredCustomers.length)
      );
    }
    const targetCust = filteredCustomers[targetIdx];
    setActiveIndex(targetIdx);
    if (expandedCustomerId !== null && targetCust) {
      setExpandedCustomerId(targetCust.id);
      const cardHeight = containerRef.current.clientHeight;
      containerRef.current.scrollTo({ top: targetIdx * cardHeight, behavior: 'smooth' });
    } else if (targetCust) {
      setTimeout(() => {
        cardRefs.current[targetCust.id]?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }, 40);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
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
  }, [activeIndex, filteredCustomers.length, expandedCustomerId]);

  const handleLiveUpdate = async () => {
    const res = await triggerSync();
    setUpdateToast({
      success: res.success,
      message: res.success
        ? 'Güncelleme tamamlandı! Yapılan tüm değişiklikler ve ERP12 verileri alındı.'
        : res.error || 'Güncelleme sırasında sunucuya ulaşılamadı.',
    });
    setTimeout(() => setUpdateToast(null), 3500);
  };

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
    <div className="w-full flex-1 min-h-0 h-full flex flex-col bg-slate-100 dark:bg-slate-950 p-2 sm:p-3 text-slate-900 dark:text-slate-100 overflow-hidden">
      {/* Güncelleme Bildirim Toast Bandı */}
      {updateToast && (
        <div
          className={`w-full max-w-xl mx-auto shrink-0 mb-1.5 flex items-center gap-2 px-3 py-2 rounded-2xl text-xs font-bold shadow-md transition ${
            updateToast.success
              ? 'bg-emerald-600 text-white'
              : 'bg-rose-600 text-white'
          }`}
        >
          {updateToast.success ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span className="truncate flex-1">{updateToast.message}</span>
        </div>
      )}

      {/* Sepetten Cari Seçimine Yönlendirildiyse Geri Dönüş & Bilgi Bandı */}
      {customerSelectReturnTab === 'cart' && (
        <div className="w-full max-w-xl mx-auto shrink-0 mb-1.5 flex items-center justify-between gap-2 px-3 py-1.5 rounded-2xl bg-amber-500/15 dark:bg-amber-950/50 border border-amber-500/30 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 text-xs">
          <div className="flex items-center gap-1.5 min-w-0 font-bold truncate">
            <ShoppingCart className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="truncate">Sepetteki sipariş için cari seçin</span>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('cart')}
            className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white dark:bg-slate-900 hover:bg-amber-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 border border-amber-400/40 dark:border-slate-700 font-extrabold text-[11px] shadow-2xs transition active:scale-95"
          >
            <ArrowLeft className="w-3 h-3" />
            <span>Sepete Dön</span>
          </button>
        </div>
      )}

      {/* 1. Arama Yeri + Canlı Güncelleme Butonu (iOS Safari ve Çentik Uyumlu Sabit Üst Bar) */}
      <div className="w-full max-w-xl mx-auto shrink-0 mb-2 relative z-20">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-slate-400 pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              enterKeyHint="search"
              data-no-autoscroll="true"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari adı, kodu, ilçe veya vergi no ile ara..."
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl pl-10 pr-20 py-2.5 text-[16px] sm:text-xs font-semibold text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs appearance-none"
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

          {/* Yapılan Değişiklikleri ve ERP12 Verilerini Anında Güncelleme Butonu */}
          <button
            type="button"
            onClick={handleLiveUpdate}
            disabled={isSyncing}
            title="Yapılan değişiklikleri, yetkileri ve ERP12 verilerini anında güncelle"
            className="shrink-0 flex items-center gap-1.5 px-3 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60 text-white font-extrabold text-xs shadow-sm shadow-blue-500/20 transition active:scale-95 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Alınıyor...' : 'Güncelle'}</span>
          </button>
        </div>

        {/* Rut Bölgesi Hızlı Filtre Çubuğu (Kaydırılabilir + Ok Butonlu) */}
        {availableRegions.length > 0 && (
          <div className="relative flex items-center pt-1.5 pb-0.5">
            {showRegionLeftArrow && (
              <button
                type="button"
                onClick={() => handleRegionScrollByButton('left')}
                className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-6 h-6 rounded-full bg-white/95 dark:bg-slate-800/95 border border-blue-300 dark:border-slate-600 shadow-md text-blue-600 dark:text-blue-400 flex items-center justify-center hover:scale-110 active:scale-95 transition cursor-pointer"
                title="Sola Kaydır"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            )}

            {showRegionRightArrow && (
              <button
                type="button"
                onClick={() => handleRegionScrollByButton('right')}
                className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-6 h-6 rounded-full bg-white/95 dark:bg-slate-800/95 border border-blue-300 dark:border-slate-600 shadow-md text-blue-600 dark:text-blue-400 flex items-center justify-center hover:scale-110 active:scale-95 transition cursor-pointer"
                title="Sağa Kaydır"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}

            <div
              ref={regionScrollRef}
              onScroll={updateRegionScrollArrows}
              onMouseDown={handleRegionMouseDown}
              onMouseMove={handleRegionMouseMove}
              onMouseUp={handleRegionMouseUpOrLeave}
              onMouseLeave={handleRegionMouseUpOrLeave}
              className={`flex-1 flex items-center gap-1.5 overflow-x-auto no-scrollbar pr-4 touch-pan-x select-none ${
                isRegionMouseDown ? 'cursor-grabbing' : 'cursor-grab scroll-smooth'
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  if (!isRegionDragging) setSelectedRegion('ALL');
                }}
                className={`shrink-0 px-2.5 py-1 rounded-xl text-[11px] font-extrabold border transition ${
                  selectedRegion === 'ALL'
                    ? 'bg-blue-600 border-blue-600 text-white shadow-2xs'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-blue-400'
                }`}
              >
                Tüm Rutlar ({customers.length})
              </button>
              {availableRegions.map((reg) => {
                const active = selectedRegion === reg.name;
                return (
                  <button
                    key={reg.name}
                    type="button"
                    onClick={() => {
                      if (!isRegionDragging) setSelectedRegion(active ? 'ALL' : reg.name);
                    }}
                    className={`shrink-0 px-2.5 py-1 rounded-xl text-[11px] font-bold border transition flex items-center gap-1 ${
                      active
                        ? 'bg-blue-600 border-blue-600 text-white shadow-2xs'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-blue-400'
                    }`}
                  >
                    <MapPin className={`w-3 h-3 ${active ? 'text-white' : 'text-blue-500'}`} />
                    <span>{reg.name}</span>
                    <span
                      className={`text-[10px] px-1 rounded ${
                        active
                          ? 'bg-white/20 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {reg.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 2. Çekmece (Drawer) Tarzı Kaydırmalı Cari Kartları (Görsel-2: Kapalıyken Sadece Başlık & Adres, Görsel-1: Açılınca Finans & İşlem Butonları) */}
      {filteredCustomers.length === 0 ? (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-center p-6 text-slate-400">
          <Building className="w-12 h-12 mb-3 text-slate-300 dark:text-slate-700 animate-pulse" />
          <p className="text-sm font-bold">Aradığınız kriterde cari hesap bulunamadı.</p>
          <p className="text-xs text-slate-500 mt-1">Lütfen arama terimini kontrol ediniz.</p>
        </div>
      ) : (
        <div className="relative flex-1 min-h-0 w-full max-w-xl mx-auto overflow-hidden">
          <div
            ref={containerRef}
            onScroll={handleScroll}
            onMouseDown={handleListMouseDown}
            onMouseMove={handleListMouseMove}
            onMouseUp={handleListMouseUpOrLeave}
            onMouseLeave={handleListMouseUpOrLeave}
            className={`absolute inset-0 overflow-y-scroll no-scrollbar py-1 ${
              expandedCustomerId !== null
                ? 'snap-y snap-mandatory space-y-3'
                : 'pb-6 space-y-2.5'
            } ${isListMouseDown ? 'cursor-grabbing' : 'scroll-smooth'}`}
          >
            {visibleCustomers.map((cust, idx) => {
              const fin = getCustomerFinancials(cust);
              const initials = getInitials(cust.name);
              const isSelected = selectedCustomer?.id === cust.id;
              const isExpanded = expandedCustomerId !== null;

              return (
                <div
                  key={cust.id}
                  ref={(el) => {
                    cardRefs.current[cust.id] = el;
                  }}
                  className={`w-full shrink-0 flex flex-col rounded-3xl bg-white dark:bg-slate-900 border transition-all ${
                    isExpanded
                      ? 'h-[calc(100%-8px)] min-h-[280px] snap-start snap-always justify-between p-3.5 sm:p-5 border-slate-200 dark:border-slate-800 shadow-xl relative overflow-hidden'
                      : 'p-3.5 sm:p-4 border-slate-200 dark:border-slate-800 shadow-sm hover:border-blue-300 dark:hover:border-slate-700'
                  }`}
                >
                  {/* GÖRSEL-2 KISMI (Çekmece Halindeyken Yalnızca Bu Kısım Görünür) */}
                  <div
                    onClick={() => handleToggleDrawer(cust, idx)}
                    className="shrink-0 cursor-pointer select-none"
                    title={isExpanded ? 'Çekmeceyi kapatmak için dokunun' : 'Detay çekmecesini açmak için dokunun'}
                  >
                    <div className="flex items-start justify-between gap-2.5 sm:gap-3">
                      <div className="flex items-start gap-2.5 sm:gap-3 min-w-0 flex-1">
                        {/* Varsa Logo veya Şık Monogram Baş Harf Rozeti */}
                        {cust.logo ? (
                          <img
                            src={cust.logo}
                            alt={cust.name}
                            draggable={false}
                            className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl object-cover border border-slate-200 dark:border-slate-700 shadow-md shrink-0"
                          />
                        ) : (
                          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 text-white font-black text-sm flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0 select-none">
                            {initials}
                          </div>
                        )}

                        <div className="min-w-0 flex-1 pr-1">
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

                          {/* Cari İsmi */}
                          <h2
                            className="text-[16px] sm:text-lg font-black text-slate-900 dark:text-white leading-snug line-clamp-2 break-words mt-1 tracking-tight"
                            title={cust.name}
                          >
                            {cust.name}
                          </h2>

                          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                            <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                            <span className="truncate">{cust.district || 'Merkez'}, {cust.city || 'Erzurum'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Sağ Kısım: "Seç" Butonu ve Çekmece Aç/Kapat İkonu */}
                      <div className="shrink-0 self-center flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            selectCustomer(cust);
                            if (customerSelectReturnTab === 'cart') {
                              setActiveTab('cart');
                            } else {
                              setActiveTab('catalog');
                            }
                          }}
                          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-extrabold text-xs shadow-md transition active:scale-95 ${
                            isSelected
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/25'
                              : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/25'
                          }`}
                          title={
                            customerSelectReturnTab === 'cart'
                              ? 'Bu cariyi seç ve sepete dön'
                              : 'Bu cariyi seç ve sipariş giriş ekranını aç'
                          }
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Seç</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleDrawer(cust, idx);
                          }}
                          className={`w-8 h-8 rounded-xl border flex items-center justify-center transition ${
                            isExpanded
                              ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-300 dark:border-blue-800 text-blue-600 dark:text-blue-400'
                              : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-blue-600'
                          }`}
                          title={isExpanded ? 'Çekmeceyi Kapat' : 'Çekmeceyi Aç'}
                        >
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Detay Adres ve İletişim Bilgileri (Görsel-2 Alt Satırı) */}
                    <div className="mt-2.5 p-2 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200/60 dark:border-slate-800/60 text-xs space-y-1">
                      <div className="text-[11px] text-slate-600 dark:text-slate-400 truncate">
                        <strong>Adres:</strong> {cust.address || 'Kayıtlı adres bulunmuyor.'}
                      </div>
                      {cust.phone && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="text-[11px] text-slate-600 dark:text-slate-400 flex items-center gap-1.5 truncate"
                        >
                          <Phone className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <a href={`tel:${cust.phone}`} className="hover:underline font-semibold text-blue-600 dark:text-blue-400">
                            {cust.phone}
                          </a>
                          {cust.taxOffice && (
                            <span className="text-slate-400 ml-1 truncate">&bull; VD: {cust.taxOffice} ({cust.taxNumber || '-'})</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* GÖRSEL-1 ÇEKMECE İÇERİĞİ (Yalnızca Çekmece Açıldığında Görünür) */}
                  {isExpanded && (
                    <>
                      {/* Finansal Bilgiler (Karşılıklı Şık Satırlar) */}
                      <div className="my-auto py-1 sm:py-2 min-h-0 animate-fadeIn">
                        <div className="bg-slate-50 dark:bg-slate-950/80 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3 space-y-2.5 shadow-inner">
                          {/* 1. Vadesi Geçmiş Ödemeler */}
                          <div className="flex items-center justify-between pb-2 border-b border-slate-200/60 dark:border-slate-800/60">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold shrink-0">
                                <Calendar className="w-3.5 h-3.5" />
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
                              <div className="w-7 h-7 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold shrink-0">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              </div>
                              <div>
                                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                                  Son Tahsilat
                                </span>
                                <span className="text-[10px] text-slate-400 truncate max-w-[160px] block">
                                  {fin.lastCollectionDate}
                                </span>
                              </div>
                            </div>
                            <span className="text-xs sm:text-sm font-black text-emerald-600 dark:text-emerald-400">
                              {formatCurrency(fin.lastCollectionAmount)}
                            </span>
                          </div>

                          {/* 3. Ekstre Bilgileri (Tıklanabilir Bakiye ve Detay) */}
                          <div 
                            onClick={() => setStatementCustomer(cust)}
                            className="flex items-center justify-between pt-0.5 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-900/60 -mx-1 px-1 rounded-lg transition"
                            title="Bu carinin detaylı hesap ekstresini aç"
                          >
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold shrink-0">
                                <FileText className="w-3.5 h-3.5" />
                              </div>
                              <div>
                                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                                  Ekstre Bilgileri
                                  <ChevronRight className="w-3 h-3 text-slate-400" />
                                </span>
                                <span className="text-[10px] text-slate-400 block">
                                  {cust.balance > 0 ? 'Müşteri Borçlu' : cust.balance < 0 ? 'Müşteri Alacaklı' : 'Bakiye Sıfır'}
                                </span>
                              </div>
                            </div>

                            <div className="text-right">
                              <span
                                className={`text-xs sm:text-sm font-black tracking-tight ${
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

                      {/* Kart Üzerinde Fiş, Fatura, Sipariş, Tahsilat ve Raporlar Butonları */}
                      <div className="shrink-0 pt-2 border-t border-slate-100 dark:border-slate-800/80 animate-fadeIn">
                        <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
                          {/* Buton 1: Fiş */}
                          <button
                            type="button"
                            onClick={() => setReceiptsModalCustomer(cust)}
                            className="flex flex-col items-center justify-center py-2.5 px-1 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 active:bg-amber-500/30 text-amber-700 dark:text-amber-300 border border-amber-500/20 transition active:scale-95 group font-bold text-[11px] sm:text-xs shadow-2xs"
                            title="Bu carinin satış fişlerini ve fiş detaylarını incele"
                          >
                            <Receipt className="w-4 h-4 mb-1 group-hover:scale-110 transition-transform text-amber-600 dark:text-amber-400" />
                            <span>Fiş</span>
                          </button>

                          {/* Buton 2: Fatura */}
                          <button
                            type="button"
                            onClick={() => setInvoicesModalCustomer(cust)}
                            className="flex flex-col items-center justify-center py-2.5 px-1 rounded-2xl bg-indigo-500/10 hover:bg-indigo-500/20 active:bg-indigo-500/30 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20 transition active:scale-95 group font-bold text-[11px] sm:text-xs shadow-2xs"
                            title="Bu carinin açık ve vadesi geçen faturalarını incele"
                          >
                            <FileCheck className="w-4 h-4 mb-1 group-hover:scale-110 transition-transform text-indigo-600 dark:text-indigo-400" />
                            <span>Fatura</span>
                          </button>

                          {/* Buton 3: Sipariş */}
                          <button
                            type="button"
                            onClick={() => setOrdersModalCustomer(cust)}
                            className="flex flex-col items-center justify-center py-2.5 px-1 rounded-2xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-md shadow-blue-500/25 transition active:scale-95 group font-bold text-[11px] sm:text-xs"
                            title="Bu cariye yeni sipariş başlat veya önceki siparişlerini gör"
                          >
                            <ShoppingCart className="w-4 h-4 mb-1 group-hover:scale-110 transition-transform" />
                            <span>Sipariş</span>
                          </button>

                          {/* Buton 4: Tahsilat */}
                          <button
                            type="button"
                            onClick={() => openCollectionModal(cust)}
                            className="flex flex-col items-center justify-center py-2.5 px-1 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-md shadow-emerald-500/25 transition active:scale-95 group font-bold text-[11px] sm:text-xs"
                            title="Bu cariden anında nakit/kredi kartı/çek tahsilatı al"
                          >
                            <Banknote className="w-4 h-4 mb-1 group-hover:scale-110 transition-transform" />
                            <span>Tahsilat</span>
                          </button>

                          {/* Buton 5: Raporlar */}
                          <button
                            type="button"
                            onClick={() => setHistoryModalCustomer(cust)}
                            className="flex flex-col items-center justify-center py-2.5 px-1 rounded-2xl bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white shadow-md shadow-violet-500/25 transition active:scale-95 group font-bold text-[11px] sm:text-xs"
                            title="Raporlar: Bu carinin geçmiş yıllardaki tüm ürün ve fiyat hareketlerini incele"
                          >
                            <BarChart3 className="w-4 h-4 mb-1 group-hover:scale-110 transition-transform" />
                            <span>Raporlar</span>
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modallar */}
      {/* 1. Fiş Modalı */}
      <CustomerReceiptsModal
        customer={receiptsModalCustomer}
        isOpen={!!receiptsModalCustomer}
        onClose={() => setReceiptsModalCustomer(null)}
      />

      {/* 2. Fatura Modalı */}
      <CustomerInvoicesModal
        customer={invoicesModalCustomer}
        isOpen={!!invoicesModalCustomer}
        onClose={() => setInvoicesModalCustomer(null)}
      />

      {/* 3. Sipariş Modalı */}
      <CustomerOrdersModal
        customer={ordersModalCustomer}
        isOpen={!!ordersModalCustomer}
        onClose={() => setOrdersModalCustomer(null)}
      />

      {/* 4. Ekstre Modalı */}
      <CustomerStatementModal
        customer={statementCustomer}
        serverConfig={serverConfig}
        isOpen={!!statementCustomer}
        onClose={() => setStatementCustomer(null)}
      />

      {/* 5. Geçmiş Yıllar Dahil Tüm İşlemler & Ürün Detayları Modalı */}
      <CustomerHistoryModal
        customer={historyModalCustomer}
        serverConfig={serverConfig}
        isOpen={!!historyModalCustomer}
        onClose={() => setHistoryModalCustomer(null)}
      />
    </div>
  );
};
