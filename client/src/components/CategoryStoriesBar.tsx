import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useApp } from '../context/AppContext';
import {
  Layers,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  X,
  ArrowLeft,
  Search,
  Percent,
  Sparkles,
  Check,
} from 'lucide-react';
import { resolveMediaAssetUrl } from '../services/apiService';
import { filterProductsForPlasiyer } from '../utils/plasiyerScope';
import {
  buildCategoryTree,
  type MainCategoryNode,
  type SubCategoryNode,
} from '../utils/categoryHierarchy';

const GRADIENT_PALETTE = [
  'from-orange-500 via-amber-500 to-rose-500',
  'from-blue-600 via-indigo-600 to-purple-600',
  'from-emerald-500 via-teal-600 to-cyan-700',
  'from-rose-500 via-pink-600 to-red-600',
  'from-purple-600 via-fuchsia-600 to-pink-600',
  'from-cyan-500 via-blue-600 to-indigo-700',
  'from-amber-500 via-orange-600 to-red-600',
  'from-lime-500 via-emerald-600 to-teal-700',
];

export const CategoryStoriesBar: React.FC = () => {
  const {
    selectedCategory,
    setSelectedCategory,
    selectedSubCategory,
    setSelectedSubCategory,
    setActiveTab,
    activeTab,
    currentUser,
    isCompanyManager,
  } = useApp();

  const mainScrollRef = useRef<HTMLDivElement>(null);
  const subScrollRef = useRef<HTMLDivElement>(null);

  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);
  const [showSubLeftArrow, setShowSubLeftArrow] = useState(false);
  const [showSubRightArrow, setShowSubRightArrow] = useState(false);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerActiveMainId, setDrawerActiveMainId] = useState<string>('');
  const [drawerSearchTerm, setDrawerSearchTerm] = useState<string>('');

  // Ana Kategoriler PC Mouse ile sürükleyerek kaydırma state'leri
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeftStart, setScrollLeftStart] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // Alt Kategoriler PC Mouse ile sürükleyerek kaydırma state'leri
  const [isSubMouseDown, setIsSubMouseDown] = useState(false);
  const [subStartX, setSubStartX] = useState(0);
  const [subScrollLeftStart, setSubScrollLeftStart] = useState(0);
  const [isSubDragging, setIsSubDragging] = useState(false);

  // IndexedDB'deki güncel ERP12 ürünlerini çek ve plasiyer stok yetkisine göre filtrele
  const rawProducts = useLiveQuery(() => db.products.toArray(), []) || [];
  const products = useMemo(
    () => filterProductsForPlasiyer(rawProducts, currentUser, isCompanyManager),
    [rawProducts, currentUser, isCompanyManager]
  );

  // Hepsiburada 2 Kademeli Kategori Ağacı: Ana Kategoriler -> Alt Kategoriler
  const categoryTree: MainCategoryNode[] = useMemo(
    () => buildCategoryTree(products),
    [products]
  );

  const totalProductCount = useMemo(
    () =>
      products.filter((p) => !(p.category || '').toLocaleUpperCase('tr-TR').includes('MASRAF'))
        .length,
    [products]
  );

  // Aktif seçili Ana Kategori düğümü (eğer kullanıcı doğrudan bir alt kategori adına tıklamışsa onun ana kategorisini de bul)
  const activeMainCategoryNode = useMemo<MainCategoryNode | null>(() => {
    if (!selectedCategory || selectedCategory === 'all') return null;
    const directMain = categoryTree.find(
      (m) => m.id.toLocaleLowerCase('tr-TR') === selectedCategory.toLocaleLowerCase('tr-TR')
    );
    if (directMain) return directMain;

    // Eğer selectedCategory bir alt kategori adıysa
    const parentMain = categoryTree.find((m) =>
      m.subCategories.some(
        (s) => s.id.toLocaleLowerCase('tr-TR') === selectedCategory.toLocaleLowerCase('tr-TR')
      )
    );
    return parentMain || null;
  }, [categoryTree, selectedCategory]);

  // Drawer içerisinde üzerinde olunan Ana Kategori (boşsa Ana Kategoriler 2'li kart ızgarası gösterilir)
  const drawerSelectedMainNode = useMemo<MainCategoryNode | null>(() => {
    if (!drawerActiveMainId || categoryTree.length === 0) return null;
    return categoryTree.find((m) => m.id === drawerActiveMainId) || null;
  }, [categoryTree, drawerActiveMainId]);

  const updateScrollArrows = () => {
    if (!mainScrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = mainScrollRef.current;
    setShowLeftArrow(scrollLeft > 10);
    setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 10);
  };

  const updateSubScrollArrows = () => {
    if (!subScrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = subScrollRef.current;
    setShowSubLeftArrow(scrollLeft > 6);
    setShowSubRightArrow(scrollLeft < scrollWidth - clientWidth - 6);
  };

  useEffect(() => {
    const el = mainScrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
        updateScrollArrows();
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    const el = subScrollRef.current;
    if (!el) return;
    updateSubScrollArrows();
    const timer = setTimeout(updateSubScrollArrows, 80);

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0 || e.deltaX !== 0) {
        e.preventDefault();
        el.scrollLeft += e.deltaY !== 0 ? e.deltaY : e.deltaX;
        updateSubScrollArrows();
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('resize', updateSubScrollArrows);
    return () => {
      clearTimeout(timer);
      el.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', updateSubScrollArrows);
    };
  }, [activeMainCategoryNode?.id]);

  const handleScrollByButton = (direction: 'left' | 'right') => {
    if (!mainScrollRef.current) return;
    const offset = direction === 'left' ? -320 : 320;
    mainScrollRef.current.scrollBy({ left: offset, behavior: 'smooth' });
    setTimeout(updateScrollArrows, 300);
  };

  const handleSubScrollByButton = (direction: 'left' | 'right') => {
    if (!subScrollRef.current) return;
    const offset = direction === 'left' ? -240 : 240;
    subScrollRef.current.scrollBy({ left: offset, behavior: 'smooth' });
    setTimeout(updateSubScrollArrows, 280);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!mainScrollRef.current) return;
    setIsMouseDown(true);
    setIsDragging(false);
    setStartX(e.pageX - mainScrollRef.current.offsetLeft);
    setScrollLeftStart(mainScrollRef.current.scrollLeft);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isMouseDown || !mainScrollRef.current) return;
    const x = e.pageX - mainScrollRef.current.offsetLeft;
    const distance = x - startX;
    if (Math.abs(distance) > 5) {
      setIsDragging(true);
    }
    mainScrollRef.current.scrollLeft = scrollLeftStart - distance;
    updateScrollArrows();
  };

  const handleMouseUpOrLeave = () => {
    setIsMouseDown(false);
    setTimeout(() => setIsDragging(false), 50);
  };

  const handleSubMouseDown = (e: React.MouseEvent) => {
    if (!subScrollRef.current) return;
    setIsSubMouseDown(true);
    setIsSubDragging(false);
    setSubStartX(e.pageX - subScrollRef.current.getBoundingClientRect().left);
    setSubScrollLeftStart(subScrollRef.current.scrollLeft);
  };

  const handleSubMouseMove = (e: React.MouseEvent) => {
    if (!isSubMouseDown || !subScrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - subScrollRef.current.getBoundingClientRect().left;
    const distance = x - subStartX;
    if (Math.abs(distance) > 5) {
      setIsSubDragging(true);
    }
    subScrollRef.current.scrollLeft = subScrollLeftStart - distance;
    updateSubScrollArrows();
  };

  const handleSubMouseUpOrLeave = () => {
    setIsSubMouseDown(false);
    setTimeout(() => setIsSubDragging(false), 60);
  };

  const handleSelectMainCategory = (mainId: string) => {
    if (isDragging) return;
    if (mainId === 'all') {
      setSelectedCategory('all');
      setSelectedSubCategory('all');
    } else if (
      activeMainCategoryNode &&
      activeMainCategoryNode.id.toLocaleLowerCase('tr-TR') === mainId.toLocaleLowerCase('tr-TR') &&
      selectedSubCategory === 'all'
    ) {
      // Aynı ana kategoriye tekrar basılırsa tüm ürünlere dön
      setSelectedCategory('all');
      setSelectedSubCategory('all');
    } else {
      setSelectedCategory(mainId);
      setSelectedSubCategory('all');
      // Alt kategori bandını başa kaydır
      setTimeout(() => {
        if (subScrollRef.current) {
          subScrollRef.current.scrollTo({ left: 0, behavior: 'smooth' });
          updateSubScrollArrows();
        }
      }, 40);
    }
    if (activeTab !== 'catalog') {
      setActiveTab('catalog');
    }
  };

  const handleSelectSubCategory = (
    mainId: string,
    sub: SubCategoryNode | 'all',
    buttonEl?: HTMLElement | null
  ) => {
    if (isSubDragging) return;
    if (activeMainCategoryNode?.id !== mainId) {
      setSelectedCategory(mainId);
    }
    if (sub === 'all') {
      setSelectedSubCategory('all');
    } else if (selectedSubCategory === sub.id) {
      setSelectedSubCategory('all');
    } else {
      setSelectedSubCategory(sub.id);
    }
    if (buttonEl) {
      setTimeout(() => {
        buttonEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        setTimeout(updateSubScrollArrows, 300);
      }, 30);
    }
    if (activeTab !== 'catalog') {
      setActiveTab('catalog');
    }
  };

  return (
    <>
      <div className="relative w-full bg-white dark:bg-slate-900 border-b border-slate-200/90 dark:border-slate-800/90 select-none">
        {/* 1. KADEME: HEPSİBURADA ANA KATEGORİLER ŞERİDİ */}
        <div className="relative flex items-center">
          {/* Sol Sabit "Kategoriler" Rehber Butonu (Görsel-1 Trendyol Tarzı 2-Sütunlu Kategori & Alt Kategori Ekranını Açar) */}
          <div className="pl-2.5 pr-1.5 py-2.5 shrink-0 border-r border-slate-100 dark:border-slate-800/80 bg-white/95 dark:bg-slate-900/95 z-10">
            <button
              type="button"
              onClick={() => {
                setDrawerActiveMainId('');
                setDrawerSearchTerm('');
                setIsDrawerOpen(true);
              }}
              className="flex flex-col items-center justify-center gap-1 w-[62px] sm:w-[70px] group focus:outline-none active:scale-95 transition-transform"
              title="Tüm Kategoriler ve Alt Kategoriler"
            >
              <div className="w-12 h-12 sm:w-13 sm:h-13 rounded-2xl bg-gradient-to-br from-[#FF6000] to-orange-600 text-white shadow-md shadow-orange-500/25 flex flex-col items-center justify-center border border-orange-400/40 group-hover:scale-105 transition">
                <LayoutGrid className="w-5 h-5" />
                <span className="text-[8px] font-black uppercase tracking-tighter mt-0.5 leading-none">
                  TÜMÜ
                </span>
              </div>
              <span className="text-[10px] sm:text-[11px] font-extrabold text-[#FF6000] dark:text-orange-400 leading-tight text-center">
                Kategoriler
              </span>
            </button>
          </div>

          {/* PC Sol Kaydırma Ok Butonu */}
          {showLeftArrow && (
            <button
              type="button"
              onClick={() => handleScrollByButton('left')}
              className="hidden md:flex absolute left-[84px] top-1/2 -translate-y-1/2 z-20 w-7 h-7 rounded-full bg-white dark:bg-slate-800 hover:bg-slate-100 border border-slate-200 dark:border-slate-700 shadow-md text-slate-700 dark:text-white items-center justify-center transition-all hover:scale-110 active:scale-95 cursor-pointer"
              title="Sola Kaydır"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}

          {/* PC Sağ Kaydırma Ok Butonu */}
          {showRightArrow && (
            <button
              type="button"
              onClick={() => handleScrollByButton('right')}
              className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 z-20 w-7 h-7 rounded-full bg-white dark:bg-slate-800 hover:bg-slate-100 border border-slate-200 dark:border-slate-700 shadow-md text-slate-700 dark:text-white items-center justify-center transition-all hover:scale-110 active:scale-95 cursor-pointer"
              title="Sağa Kaydır"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          )}

          {/* Yatay Kaydırılabilir Ana Kategoriler Listesi */}
          <div
            ref={mainScrollRef}
            onScroll={updateScrollArrows}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUpOrLeave}
            onMouseLeave={handleMouseUpOrLeave}
            className={`flex-1 flex items-start gap-2 sm:gap-2.5 overflow-x-auto no-scrollbar px-2.5 py-2.5 touch-pan-x ${
              isMouseDown ? 'cursor-grabbing' : 'cursor-grab scroll-smooth'
            }`}
          >
            {/* "Tüm Ürünler" Kartı */}
            {(() => {
              const isAllActive = !activeMainCategoryNode;
              return (
                <button
                  type="button"
                  onClick={() => handleSelectMainCategory('all')}
                  className="flex flex-col items-center gap-1 shrink-0 w-[64px] sm:w-[74px] group focus:outline-none active:scale-95 transition-transform"
                >
                  <div
                    className={`relative w-12 h-12 sm:w-13 sm:h-13 rounded-2xl p-[2px] transition-all duration-200 ${
                      isAllActive
                        ? 'bg-gradient-to-tr from-[#FF6000] via-orange-500 to-amber-400 shadow-md shadow-orange-500/25 scale-105'
                        : 'bg-slate-200 dark:bg-slate-800 group-hover:bg-slate-300 dark:group-hover:bg-slate-700'
                    }`}
                  >
                    <div className="w-full h-full rounded-[14px] bg-slate-900 dark:bg-slate-950 flex flex-col items-center justify-center text-white">
                      <Layers
                        className={`w-5 h-5 ${
                          isAllActive ? 'text-[#FF6000]' : 'text-slate-300'
                        }`}
                      />
                      <span className="text-[8px] font-extrabold text-slate-300 mt-0.5">
                        {totalProductCount}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] sm:text-[11px] leading-tight text-center truncate w-full px-0.5 ${
                      isAllActive
                        ? 'font-extrabold text-[#FF6000] dark:text-orange-400'
                        : 'font-semibold text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    Tümü
                  </span>
                </button>
              );
            })()}

            {/* Ana Kategoriler (STOK_GRUP Üst Grupları) */}
            {categoryTree.map((mainCat, idx) => {
              const isSelected = activeMainCategoryNode?.id === mainCat.id;
              const gradient = GRADIENT_PALETTE[idx % GRADIENT_PALETTE.length];
              const hasValidImg = Boolean(mainCat.image && !failedImages[mainCat.id]);

              return (
                <button
                  key={mainCat.id}
                  type="button"
                  onClick={() => handleSelectMainCategory(mainCat.id)}
                  title={`${mainCat.name} (${mainCat.count} Ürün${
                    mainCat.subCategories.length > 0
                      ? ` • ${mainCat.subCategories.length} Alt Kategori`
                      : ''
                  })`}
                  className="flex flex-col items-center gap-1 shrink-0 w-[68px] sm:w-[78px] group focus:outline-none active:scale-95 transition-transform"
                >
                  <div
                    className={`relative w-12 h-12 sm:w-13 sm:h-13 rounded-2xl p-[2px] transition-all duration-200 ${
                      isSelected
                        ? 'bg-gradient-to-tr from-[#FF6000] via-orange-500 to-amber-400 shadow-md shadow-orange-500/25 scale-105'
                        : 'bg-slate-200/90 dark:bg-slate-800 group-hover:bg-orange-300 dark:group-hover:bg-slate-700'
                    }`}
                  >
                    <div className="w-full h-full rounded-[14px] bg-white dark:bg-slate-900 overflow-hidden flex items-center justify-center relative">
                      {hasValidImg ? (
                        <img
                          src={resolveMediaAssetUrl(mainCat.image)}
                          alt={mainCat.name}
                          loading="lazy"
                          decoding="async"
                          draggable={false}
                          onError={() =>
                            setFailedImages((prev) => ({ ...prev, [mainCat.id]: true }))
                          }
                          className="w-full h-full object-contain p-1 bg-white transition-transform duration-300 group-hover:scale-110"
                        />
                      ) : (
                        <div
                          className={`w-full h-full bg-gradient-to-br ${gradient} flex items-center justify-center`}
                        >
                          <span className="text-base font-black text-white drop-shadow-xs">
                            {mainCat.initialLetter}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Alt Kategori Sayısı Rozeti */}
                    {mainCat.subCategories.length > 0 && (
                      <span
                        className={`absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full text-[8px] font-black shadow-xs border ${
                          isSelected
                            ? 'bg-[#FF6000] text-white border-white dark:border-slate-900'
                            : 'bg-slate-900 dark:bg-slate-800 text-amber-300 border-white dark:border-slate-700'
                        }`}
                      >
                        {mainCat.subCategories.length} Alt
                      </span>
                    )}
                  </div>

                  <span
                    className={`text-[10px] sm:text-[11px] leading-tight text-center line-clamp-1 w-full px-0.5 ${
                      isSelected
                        ? 'font-extrabold text-[#FF6000] dark:text-orange-400'
                        : 'font-semibold text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white'
                    }`}
                  >
                    {mainCat.shortName}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. KADEME: HEPSİBURADA ALT KATEGORİLER PANELİ (Ana Kategori Seçildiğinde Hemen Altında Açılır) */}
        {activeMainCategoryNode && (
          <div className="border-t border-orange-200/70 dark:border-slate-800 bg-gradient-to-r from-orange-50/70 via-amber-50/40 to-white dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 px-3 py-2.5 space-y-2 animate-fadeIn">
            {/* Üst Yol Haritası (Breadcrumb) & Ana Kategori Özeti */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0 text-xs overflow-x-auto no-scrollbar">
                <button
                  type="button"
                  onClick={() => handleSelectMainCategory('all')}
                  className="text-slate-500 dark:text-slate-400 hover:text-[#FF6000] font-semibold shrink-0"
                >
                  Tüm Kategoriler
                </button>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <button
                  type="button"
                  onClick={() => setSelectedSubCategory('all')}
                  className={`font-extrabold truncate ${
                    selectedSubCategory === 'all'
                      ? 'text-[#FF6000] dark:text-orange-400'
                      : 'text-slate-800 dark:text-slate-200 hover:text-[#FF6000]'
                  }`}
                >
                  {activeMainCategoryNode.name}
                </button>
                {selectedSubCategory !== 'all' && (
                  <>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="font-extrabold text-[#FF6000] dark:text-orange-400 truncate">
                      {activeMainCategoryNode.subCategories.find(
                        (s) => s.id === selectedSubCategory
                      )?.name || selectedSubCategory}
                    </span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {/* Alt Kategoriler Sol/Sağ Kaydırma Tuşları */}
                {activeMainCategoryNode.subCategories.length > 1 && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleSubScrollByButton('left')}
                      disabled={!showSubLeftArrow}
                      title="Alt Kategorileri Sola Kaydır"
                      className={`w-6 h-6 rounded-lg border flex items-center justify-center transition ${
                        showSubLeftArrow
                          ? 'bg-white dark:bg-slate-800 border-orange-300 dark:border-slate-700 text-[#FF6000] dark:text-orange-400 hover:bg-orange-50 active:scale-95 shadow-2xs cursor-pointer'
                          : 'bg-white/40 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800 text-slate-300 dark:text-slate-700 cursor-not-allowed'
                      }`}
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSubScrollByButton('right')}
                      disabled={!showSubRightArrow}
                      title="Alt Kategorileri Sağa Kaydır"
                      className={`w-6 h-6 rounded-lg border flex items-center justify-center transition ${
                        showSubRightArrow
                          ? 'bg-white dark:bg-slate-800 border-orange-300 dark:border-slate-700 text-[#FF6000] dark:text-orange-400 hover:bg-orange-50 active:scale-95 shadow-2xs cursor-pointer'
                          : 'bg-white/40 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800 text-slate-300 dark:text-slate-700 cursor-not-allowed'
                      }`}
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => handleSelectMainCategory('all')}
                  className="shrink-0 text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700"
                >
                  <X className="w-3 h-3" />
                  <span>Kapat</span>
                </button>
              </div>
            </div>

            {/* Alt Kategoriler Yatay Görsel Kartları (Hepsiburada Mobil Alt Kategori Seçici) */}
            {activeMainCategoryNode.subCategories.length > 0 ? (
              <div className="relative flex items-center">
                {/* Sol Yüzen Kaydırma Ok Butonu */}
                {showSubLeftArrow && (
                  <button
                    type="button"
                    onClick={() => handleSubScrollByButton('left')}
                    className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-7 h-7 rounded-full bg-white/95 dark:bg-slate-800/95 hover:bg-orange-50 border border-orange-300 dark:border-slate-600 shadow-md text-[#FF6000] dark:text-orange-400 flex items-center justify-center transition-all hover:scale-110 active:scale-95 cursor-pointer"
                    title="Sola Kaydır"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                )}

                {/* Sağ Yüzen Kaydırma Ok Butonu */}
                {showSubRightArrow && (
                  <button
                    type="button"
                    onClick={() => handleSubScrollByButton('right')}
                    className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-7 h-7 rounded-full bg-white/95 dark:bg-slate-800/95 hover:bg-orange-50 border border-orange-300 dark:border-slate-600 shadow-md text-[#FF6000] dark:text-orange-400 flex items-center justify-center transition-all hover:scale-110 active:scale-95 cursor-pointer"
                    title="Sağa Kaydır"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}

                <div
                  ref={subScrollRef}
                  onScroll={updateSubScrollArrows}
                  onMouseDown={handleSubMouseDown}
                  onMouseMove={handleSubMouseMove}
                  onMouseUp={handleSubMouseUpOrLeave}
                  onMouseLeave={handleSubMouseUpOrLeave}
                  className={`flex-1 flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5 pr-4 touch-pan-x ${
                    isSubMouseDown ? 'cursor-grabbing' : 'cursor-grab scroll-smooth'
                  }`}
                >
                  {/* Ana Kategorinin Tüm Ürünleri Kartı (Görsel-1 Tarzı) */}
                  <button
                    type="button"
                    onClick={(e) =>
                      handleSelectSubCategory(activeMainCategoryNode.id, 'all', e.currentTarget)
                    }
                    className={`shrink-0 w-[144px] sm:w-[164px] h-[68px] sm:h-[74px] rounded-2xl p-2.5 relative overflow-hidden flex items-start justify-between text-left transition-all active:scale-95 ${
                      selectedSubCategory === 'all'
                        ? 'bg-[#FF6000] text-white shadow-md shadow-orange-500/25 ring-2 ring-[#FF6000]/30'
                        : 'bg-[#EFEFEF] hover:bg-[#E5E5E5] dark:bg-slate-800/90 dark:hover:bg-slate-800 text-slate-900 dark:text-white'
                    }`}
                  >
                    <div className="z-10 flex flex-col justify-between h-full max-w-[65%]">
                      <div className="text-xs font-extrabold leading-tight line-clamp-2">
                        Tüm {activeMainCategoryNode.shortName}
                      </div>
                      <div
                        className={`text-[10px] font-bold ${
                          selectedSubCategory === 'all'
                            ? 'text-orange-100'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {activeMainCategoryNode.count} Ürün
                      </div>
                    </div>
                    <div className="w-12 h-12 flex items-end justify-end shrink-0 self-end">
                      {activeMainCategoryNode.image && !failedImages[activeMainCategoryNode.id] ? (
                        <img
                          src={resolveMediaAssetUrl(activeMainCategoryNode.image)}
                          alt={activeMainCategoryNode.name}
                          loading="lazy"
                          draggable={false}
                          className={`w-full h-full object-contain object-right-bottom pointer-events-none ${
                            selectedSubCategory === 'all'
                              ? 'rounded-lg bg-white p-0.5'
                              : 'mix-blend-multiply dark:mix-blend-normal'
                          }`}
                        />
                      ) : (
                        <Layers
                          className={`w-7 h-7 ${
                            selectedSubCategory === 'all' ? 'text-white/80' : 'text-[#FF6000]'
                          }`}
                        />
                      )}
                    </div>
                  </button>

                  {/* Alt Kategori Kartları (Görsel-1 Tarzı Yatay Kart: Sol Üst Başlık, Sağ Alt Görsel) */}
                  {activeMainCategoryNode.subCategories.map((sub) => {
                    const isSubActive = selectedSubCategory === sub.id;
                    const hasSubImg = Boolean(sub.image && !failedImages[`sub-${sub.id}`]);

                    return (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={(e) =>
                          handleSelectSubCategory(activeMainCategoryNode.id, sub, e.currentTarget)
                        }
                        className={`shrink-0 w-[156px] sm:w-[178px] h-[68px] sm:h-[74px] rounded-2xl p-2.5 relative overflow-hidden flex items-start justify-between text-left transition-all active:scale-95 group ${
                          isSubActive
                            ? 'bg-orange-50 dark:bg-orange-950/40 border-2 border-[#FF6000] text-slate-900 dark:text-white shadow-sm'
                            : 'bg-[#EFEFEF] hover:bg-[#E5E5E5] dark:bg-slate-800/90 dark:hover:bg-slate-800 text-slate-900 dark:text-white border border-transparent'
                        }`}
                      >
                        <div className="z-10 flex flex-col justify-between h-full max-w-[62%] pr-1">
                          <div
                            className={`text-[11px] sm:text-xs font-bold leading-snug line-clamp-2 ${
                              isSubActive
                                ? 'text-[#FF6000] dark:text-orange-400 font-extrabold'
                                : 'text-slate-800 dark:text-slate-100'
                            }`}
                          >
                            {sub.name}
                          </div>
                          <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                            {sub.count} Ürün
                          </div>
                        </div>

                        <div className="w-13 h-13 sm:w-14 sm:h-14 shrink-0 self-end flex items-end justify-end">
                          {hasSubImg ? (
                            <img
                              src={resolveMediaAssetUrl(sub.image)}
                              alt={sub.name}
                              loading="lazy"
                              draggable={false}
                              onError={() =>
                                setFailedImages((prev) => ({
                                  ...prev,
                                  [`sub-${sub.id}`]: true,
                                }))
                              }
                              className="w-full h-full object-contain object-right-bottom mix-blend-multiply dark:mix-blend-normal pointer-events-none transition-transform duration-300 group-hover:scale-105"
                            />
                          ) : (
                            <span className="text-base font-black text-[#FF6000]/80">
                              {sub.name.charAt(0)}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#FF6000]" />
                <span>
                  <strong>{activeMainCategoryNode.name}</strong> kategorisinde toplam{' '}
                  <strong>{activeMainCategoryNode.count}</strong> ürün listeleniyor.
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* GÖRSEL-1 (TRENDYOL TARZI) 2-SÜTUNLU KATEGORİ & ALT KATEGORİ KARTLARI EKRANI */}
      {isDrawerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex flex-col justify-end sm:justify-center sm:items-center animate-fadeIn"
          onClick={() => setIsDrawerOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-2xl h-[90dvh] sm:h-[86vh] bg-white dark:bg-slate-950 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden"
          >
            {/* Üst Arama & Navigasyon Çubuğu (Görsel-1 Tarzı: Geri Oku + Yuvarlak Arama Barı + Kapat) */}
            <div className="shrink-0 px-3.5 py-3 border-b border-slate-100 dark:border-slate-800/80 flex items-center gap-2.5 bg-white dark:bg-slate-900">
              <button
                type="button"
                onClick={() => {
                  if (drawerSelectedMainNode) {
                    setDrawerActiveMainId('');
                    setDrawerSearchTerm('');
                  } else {
                    setIsDrawerOpen(false);
                  }
                }}
                className="w-9 h-9 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center shrink-0 transition active:scale-95"
                title={drawerSelectedMainNode ? 'Ana Kategorilere Dön' : 'Kapat'}
              >
                <ArrowLeft className="w-5 h-5" />
              </button>

              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[#FF6000] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={drawerSearchTerm}
                  onChange={(e) => setDrawerSearchTerm(e.target.value)}
                  placeholder="Marka, ürün veya kategori ara"
                  className="w-full bg-[#F3F3F3] dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded-full pl-9 pr-8 py-2 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#FF6000]/40"
                />
                {drawerSearchTerm && (
                  <button
                    type="button"
                    onClick={() => setDrawerSearchTerm('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setIsDrawerOpen(false)}
                className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-white flex items-center justify-center shrink-0 transition"
                title="Kapat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Kaydırılabilir İçerik Gövdesi (Görsel-1 2'li Kart Izgarası) */}
            <div className="flex-1 min-h-0 overflow-y-auto p-3.5 sm:p-4 space-y-3.5 bg-white dark:bg-slate-950">
              {/* Üst Şeftali / Turuncu Bilgi & Tümünü Gör Kartı (Görsel-1 "Sana Özel Kategoriler" Bannerı) */}
              <button
                type="button"
                onClick={() => {
                  if (drawerSelectedMainNode) {
                    setSelectedCategory(drawerSelectedMainNode.id);
                    setSelectedSubCategory('all');
                  } else {
                    handleSelectMainCategory('all');
                  }
                  if (activeTab !== 'catalog') setActiveTab('catalog');
                  setIsDrawerOpen(false);
                }}
                className="w-full px-4 py-3 rounded-2xl bg-gradient-to-r from-[#FFE5D9] via-[#FFF0E6] to-[#FFD8C2] dark:from-orange-950/70 dark:via-slate-900 dark:to-orange-900/50 border border-orange-200/60 dark:border-orange-800/40 flex items-center justify-between gap-3 text-left transition active:scale-[0.99] shadow-2xs relative overflow-hidden"
              >
                <div className="min-w-0 z-10">
                  <div className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-1">
                    <span className="truncate">
                      {drawerSelectedMainNode
                        ? `${drawerSelectedMainNode.name} Kategorisi`
                        : 'Sana Özel Kategoriler & Tüm Ürünler'}
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-700 dark:text-orange-300 shrink-0" />
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-300 font-medium mt-0.5">
                    {drawerSelectedMainNode
                      ? `Tüm ${drawerSelectedMainNode.name} ürünlerini gör (${drawerSelectedMainNode.count} Ürün)`
                      : `İlgini çekebilecek tüm kategoriler ve ${totalProductCount.toLocaleString('tr-TR')} ürün`}
                  </div>
                </div>

                {/* Sağ Turuncu % Etiket Rozeti (Görsel-1'deki gibi) */}
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#FF6000] to-orange-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-orange-500/30 -rotate-12">
                  <Percent className="w-5 h-5 stroke-[2.75]" />
                </div>
              </button>

              {/* Eğer Bir Ana Kategoriye Tıklanmışsa: Üst Geri Dönüş Barı & Alt Kategoriler 2'li Görsel-1 Izgarası */}
              {drawerSelectedMainNode && !drawerSearchTerm.trim() ? (
                <div className="space-y-3 animate-fadeIn">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setDrawerActiveMainId('')}
                      className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[#FF6000] dark:text-orange-400 hover:underline"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Tüm Ana Kategoriler</span>
                    </button>

                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      {drawerSelectedMainNode.name} • Alt Kategoriler (
                      {drawerSelectedMainNode.subCategories.length})
                    </span>
                  </div>

                  {/* Alt Kategoriler: Görsel-1 2 Sütunlu Yatay Kart Izgarası */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* İlk Kart: Bu Ana Kategorinin Tüm Ürünleri */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCategory(drawerSelectedMainNode.id);
                        setSelectedSubCategory('all');
                        if (activeTab !== 'catalog') setActiveTab('catalog');
                        setIsDrawerOpen(false);
                      }}
                      className={`h-[104px] sm:h-[116px] rounded-2xl p-3.5 relative overflow-hidden flex items-start justify-between text-left transition-all active:scale-[0.98] group ${
                        activeMainCategoryNode?.id === drawerSelectedMainNode.id &&
                        selectedSubCategory === 'all'
                          ? 'bg-orange-50 dark:bg-orange-950/40 ring-2 ring-[#FF6000]'
                          : 'bg-[#EFEFEF] hover:bg-[#E6E6E6] dark:bg-slate-800/90 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div className="z-10 flex flex-col justify-between h-full max-w-[58%] pr-1">
                        <div className="text-[13px] sm:text-[15px] font-bold text-slate-900 dark:text-white leading-snug line-clamp-2">
                          Tüm {drawerSelectedMainNode.name}
                        </div>
                        <div className="text-[11px] font-semibold text-[#FF6000] dark:text-orange-400">
                          {drawerSelectedMainNode.count} Ürün
                        </div>
                      </div>

                      <div className="w-[78px] h-[78px] sm:w-[92px] sm:h-[92px] self-end shrink-0 flex items-end justify-end">
                        {drawerSelectedMainNode.image &&
                        !failedImages[drawerSelectedMainNode.id] ? (
                          <img
                            src={resolveMediaAssetUrl(drawerSelectedMainNode.image)}
                            alt={drawerSelectedMainNode.name}
                            loading="lazy"
                            onError={() =>
                              setFailedImages((prev) => ({
                                ...prev,
                                [drawerSelectedMainNode.id]: true,
                              }))
                            }
                            className="w-full h-full object-contain object-right-bottom mix-blend-multiply dark:mix-blend-normal transition-transform duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <span className="text-2xl font-black text-[#FF6000]/70">
                            {drawerSelectedMainNode.initialLetter}
                          </span>
                        )}
                      </div>
                    </button>

                    {/* Alt Kategori Kartları (Görsel-1 Tarzı: Sol Üst Başlık, Sağ Alt Büyük Görsel) */}
                    {drawerSelectedMainNode.subCategories.map((sub) => {
                      const isSubSelected =
                        activeMainCategoryNode?.id === drawerSelectedMainNode.id &&
                        selectedSubCategory === sub.id;
                      const hasSubImg = Boolean(
                        sub.image && !failedImages[`drawer-sub-${sub.id}`]
                      );

                      return (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => {
                            setSelectedCategory(drawerSelectedMainNode.id);
                            setSelectedSubCategory(sub.id);
                            if (activeTab !== 'catalog') setActiveTab('catalog');
                            setIsDrawerOpen(false);
                          }}
                          className={`h-[104px] sm:h-[116px] rounded-2xl p-3.5 relative overflow-hidden flex items-start justify-between text-left transition-all active:scale-[0.98] group ${
                            isSubSelected
                              ? 'bg-orange-50 dark:bg-orange-950/40 ring-2 ring-[#FF6000]'
                              : 'bg-[#EFEFEF] hover:bg-[#E6E6E6] dark:bg-slate-800/90 dark:hover:bg-slate-800'
                          }`}
                        >
                          {isSubSelected && (
                            <span className="absolute top-2 right-2 z-20 w-5 h-5 rounded-full bg-[#FF6000] text-white flex items-center justify-center shadow-xs">
                              <Check className="w-3 h-3" />
                            </span>
                          )}

                          <div className="z-10 flex flex-col justify-between h-full max-w-[58%] pr-1">
                            <div className="text-[13px] sm:text-[15px] font-bold text-slate-900 dark:text-white leading-snug line-clamp-2">
                              {sub.name}
                            </div>
                            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                              {sub.count} Ürün
                            </div>
                          </div>

                          <div className="w-[78px] h-[78px] sm:w-[92px] sm:h-[92px] self-end shrink-0 flex items-end justify-end">
                            {hasSubImg ? (
                              <img
                                src={resolveMediaAssetUrl(sub.image)}
                                alt={sub.name}
                                loading="lazy"
                                onError={() =>
                                  setFailedImages((prev) => ({
                                    ...prev,
                                    [`drawer-sub-${sub.id}`]: true,
                                  }))
                                }
                                className="w-full h-full object-contain object-right-bottom mix-blend-multiply dark:mix-blend-normal transition-transform duration-300 group-hover:scale-105"
                              />
                            ) : (
                              <span className="text-2xl font-black text-[#FF6000]/70">
                                {sub.name.charAt(0)}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* Ana Kategoriler (veya Arama Sonuçları): Görsel-1 2 Sütunlu Yatay Kart Izgarası */
                (() => {
                  const q = drawerSearchTerm.trim().toLocaleLowerCase('tr-TR');
                  const filteredMainCats = q
                    ? categoryTree.filter(
                        (m) =>
                          m.name.toLocaleLowerCase('tr-TR').includes(q) ||
                          m.subCategories.some((s) =>
                            s.name.toLocaleLowerCase('tr-TR').includes(q)
                          )
                      )
                    : categoryTree;

                  const matchingSubCats: { main: MainCategoryNode; sub: SubCategoryNode }[] = [];
                  if (q) {
                    for (const m of categoryTree) {
                      for (const s of m.subCategories) {
                        if (s.name.toLocaleLowerCase('tr-TR').includes(q)) {
                          matchingSubCats.push({ main: m, sub: s });
                        }
                      }
                    }
                  }

                  return (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        {filteredMainCats.map((mainCat) => {
                          const isSelected = activeMainCategoryNode?.id === mainCat.id;
                          const hasImg = Boolean(mainCat.image && !failedImages[mainCat.id]);

                          return (
                            <button
                              key={mainCat.id}
                              type="button"
                              onClick={() => {
                                if (mainCat.subCategories.length > 0) {
                                  setDrawerActiveMainId(mainCat.id);
                                  setDrawerSearchTerm('');
                                } else {
                                  setSelectedCategory(mainCat.id);
                                  setSelectedSubCategory('all');
                                  if (activeTab !== 'catalog') setActiveTab('catalog');
                                  setIsDrawerOpen(false);
                                }
                              }}
                              className={`h-[104px] sm:h-[116px] rounded-2xl p-3.5 relative overflow-hidden flex items-start justify-between text-left transition-all active:scale-[0.98] group ${
                                isSelected
                                  ? 'bg-orange-50 dark:bg-orange-950/40 ring-2 ring-[#FF6000]'
                                  : 'bg-[#EFEFEF] hover:bg-[#E6E6E6] dark:bg-slate-800/90 dark:hover:bg-slate-800'
                              }`}
                            >
                              {/* Sol Üst: Kategori Başlığı + Alt Kırılım/Ürün Sayısı */}
                              <div className="z-10 flex flex-col justify-between h-full max-w-[58%] pr-1">
                                <div className="text-[13px] sm:text-[15px] font-bold text-slate-900 dark:text-white leading-snug line-clamp-2">
                                  {mainCat.name}
                                </div>
                                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                  {mainCat.subCategories.length > 0
                                    ? `${mainCat.subCategories.length} Alt • ${mainCat.count} Ürün`
                                    : `${mainCat.count} Ürün`}
                                </div>
                              </div>

                              {/* Sağ Alt: Büyük Kategori Görseli (Görsel-1 Tarzı) */}
                              <div className="w-[78px] h-[78px] sm:w-[92px] sm:h-[92px] self-end shrink-0 flex items-end justify-end">
                                {hasImg ? (
                                  <img
                                    src={resolveMediaAssetUrl(mainCat.image)}
                                    alt={mainCat.name}
                                    loading="lazy"
                                    onError={() =>
                                      setFailedImages((prev) => ({
                                        ...prev,
                                        [mainCat.id]: true,
                                      }))
                                    }
                                    className="w-full h-full object-contain object-right-bottom mix-blend-multiply dark:mix-blend-normal transition-transform duration-300 group-hover:scale-105"
                                  />
                                ) : (
                                  <span className="text-2xl font-black text-[#FF6000]/70">
                                    {mainCat.initialLetter}
                                  </span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      {/* Arama Yapıldıysa Eşleşen Alt Kategorileri de Görsel-1 Kartlarıyla Göster */}
                      {matchingSubCats.length > 0 && (
                        <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
                            Eşleşen Alt Kategoriler ({matchingSubCats.length})
                          </span>
                          <div className="grid grid-cols-2 gap-3">
                            {matchingSubCats.map(({ main, sub }) => {
                              const hasSubImg = Boolean(
                                sub.image && !failedImages[`drawer-sub-${sub.id}`]
                              );
                              return (
                                <button
                                  key={`${main.id}-${sub.id}`}
                                  type="button"
                                  onClick={() => {
                                    setSelectedCategory(main.id);
                                    setSelectedSubCategory(sub.id);
                                    if (activeTab !== 'catalog') setActiveTab('catalog');
                                    setIsDrawerOpen(false);
                                  }}
                                  className="h-[104px] sm:h-[116px] rounded-2xl p-3.5 bg-[#EFEFEF] hover:bg-[#E6E6E6] dark:bg-slate-800/90 dark:hover:bg-slate-800 relative overflow-hidden flex items-start justify-between text-left transition-all active:scale-[0.98] group"
                                >
                                  <div className="z-10 flex flex-col justify-between h-full max-w-[58%] pr-1">
                                    <div>
                                      <div className="text-[10px] font-bold text-[#FF6000] truncate">
                                        {main.name}
                                      </div>
                                      <div className="text-[13px] sm:text-[14px] font-bold text-slate-900 dark:text-white leading-snug line-clamp-2 mt-0.5">
                                        {sub.name}
                                      </div>
                                    </div>
                                    <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                      {sub.count} Ürün
                                    </div>
                                  </div>

                                  <div className="w-[76px] h-[76px] sm:w-[88px] sm:h-[88px] self-end shrink-0 flex items-end justify-end">
                                    {hasSubImg ? (
                                      <img
                                        src={resolveMediaAssetUrl(sub.image)}
                                        alt={sub.name}
                                        loading="lazy"
                                        onError={() =>
                                          setFailedImages((prev) => ({
                                            ...prev,
                                            [`drawer-sub-${sub.id}`]: true,
                                          }))
                                        }
                                        className="w-full h-full object-contain object-right-bottom mix-blend-multiply dark:mix-blend-normal transition-transform duration-300 group-hover:scale-105"
                                      />
                                    ) : (
                                      <span className="text-2xl font-black text-[#FF6000]/70">
                                        {sub.name.charAt(0)}
                                      </span>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
