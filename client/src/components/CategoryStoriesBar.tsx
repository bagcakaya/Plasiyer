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
  ArrowRight,
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

  // Drawer açıldığında sol menüde seçili ana kategoriyi hazırla
  useEffect(() => {
    if (isDrawerOpen) {
      if (activeMainCategoryNode) {
        setDrawerActiveMainId(activeMainCategoryNode.id);
      } else if (categoryTree.length > 0 && !drawerActiveMainId) {
        setDrawerActiveMainId(categoryTree[0].id);
      }
    }
  }, [isDrawerOpen, activeMainCategoryNode, categoryTree, drawerActiveMainId]);

  const drawerSelectedMainNode = useMemo<MainCategoryNode | null>(() => {
    if (categoryTree.length === 0) return null;
    return (
      categoryTree.find((m) => m.id === drawerActiveMainId) ||
      activeMainCategoryNode ||
      categoryTree[0]
    );
  }, [categoryTree, drawerActiveMainId, activeMainCategoryNode]);

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
          {/* Sol Sabit "Kategoriler" Rehber Butonu (Hepsiburada Mobil 2-Sütunlu Kategori Çekmecesini Açar) */}
          <div className="pl-2.5 pr-1.5 py-2.5 shrink-0 border-r border-slate-100 dark:border-slate-800/80 bg-white/95 dark:bg-slate-900/95 z-10">
            <button
              type="button"
              onClick={() => setIsDrawerOpen(true)}
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
                  {/* Ana Kategorinin Tüm Ürünleri Chip'i */}
                  <button
                    type="button"
                    onClick={(e) =>
                      handleSelectSubCategory(activeMainCategoryNode.id, 'all', e.currentTarget)
                    }
                    className={`shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-extrabold transition active:scale-95 ${
                      selectedSubCategory === 'all'
                        ? 'bg-[#FF6000] border-[#FF6000] text-white shadow-sm shadow-orange-500/25'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:border-orange-400'
                    }`}
                  >
                    <span>Tümü</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                        selectedSubCategory === 'all'
                          ? 'bg-white/25 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {activeMainCategoryNode.count}
                    </span>
                  </button>

                  {/* Alt Kategori Kartları */}
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
                        className={`shrink-0 flex items-center gap-2 pl-1.5 pr-3 py-1 rounded-xl border text-left transition active:scale-95 ${
                          isSubActive
                            ? 'bg-[#FF6000] border-[#FF6000] text-white shadow-sm shadow-orange-500/25'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 hover:border-orange-400'
                        }`}
                      >
                        <div className="w-8 h-8 rounded-lg bg-white overflow-hidden shrink-0 border border-slate-100 dark:border-slate-700 flex items-center justify-center">
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
                              className="w-full h-full object-contain p-0.5 bg-white pointer-events-none"
                            />
                          ) : (
                            <span className="text-[11px] font-black text-[#FF6000]">
                              {sub.name.charAt(0)}
                            </span>
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="text-[11px] font-extrabold leading-tight whitespace-nowrap">
                            {sub.name}
                          </div>
                          <div
                            className={`text-[10px] font-semibold leading-tight ${
                              isSubActive
                                ? 'text-orange-100'
                                : 'text-slate-400 dark:text-slate-500'
                            }`}
                          >
                            {sub.count} Ürün
                          </div>
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

      {/* HEPSİBURADA MOBİL 2-SÜTUNLU TAM EKRAN KATEGORİ & ALT KATEGORİ REHBERİ (DRAWER) */}
      {isDrawerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex flex-col justify-end sm:justify-center sm:items-center animate-fadeIn"
          onClick={() => setIsDrawerOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-3xl h-[86dvh] sm:h-[82vh] bg-white dark:bg-slate-950 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden"
          >
            {/* Üst Başlık (Hepsiburada Turuncu Vurgulu) */}
            <div className="shrink-0 px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#FF6000] text-white flex items-center justify-center shadow-sm shadow-orange-500/30">
                  <LayoutGrid className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-sm sm:text-base text-slate-900 dark:text-white leading-tight">
                    Kategoriler &amp; Alt Kategoriler
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Soldan ana kategori, sağdan alt kategori seçin
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsDrawerOpen(false)}
                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Gövde: Sol Sütun = Ana Kategoriler, Sağ Sütun = Alt Kategoriler Izgarası */}
            <div className="flex-1 min-h-0 flex overflow-hidden">
              {/* Sol Sütun: Ana Kategoriler */}
              <div className="w-[36%] sm:w-[32%] bg-slate-100/90 dark:bg-slate-900/90 border-r border-slate-200 dark:border-slate-800 overflow-y-auto divide-y divide-slate-200/60 dark:divide-slate-800/60">
                <button
                  type="button"
                  onClick={() => {
                    handleSelectMainCategory('all');
                    setIsDrawerOpen(false);
                  }}
                  className={`w-full text-left px-3 py-3 flex items-center gap-2 transition relative ${
                    !activeMainCategoryNode
                      ? 'bg-white dark:bg-slate-950 font-black text-[#FF6000]'
                      : 'text-slate-700 dark:text-slate-300 font-semibold hover:bg-white/60 dark:hover:bg-slate-800/50'
                  }`}
                >
                  {!activeMainCategoryNode && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-[#FF6000]" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-xs leading-snug truncate">Tüm Ürünler</div>
                    <div className="text-[10px] text-slate-400 font-normal">
                      {totalProductCount} Ürün
                    </div>
                  </div>
                </button>

                {categoryTree.map((mainCat) => {
                  const isActive = drawerSelectedMainNode?.id === mainCat.id;
                  const hasImg = Boolean(mainCat.image && !failedImages[mainCat.id]);

                  return (
                    <button
                      key={mainCat.id}
                      type="button"
                      onClick={() => setDrawerActiveMainId(mainCat.id)}
                      className={`w-full text-left px-2.5 py-3 flex items-center gap-2 transition relative ${
                        isActive
                          ? 'bg-white dark:bg-slate-950 font-extrabold text-[#FF6000] dark:text-orange-400 shadow-2xs'
                          : 'text-slate-700 dark:text-slate-300 font-semibold hover:bg-white/60 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      {isActive && (
                        <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-[#FF6000]" />
                      )}
                      <div className="w-8 h-8 rounded-lg bg-white border border-slate-200/80 dark:border-slate-700 shrink-0 overflow-hidden flex items-center justify-center">
                        {hasImg ? (
                          <img
                            src={resolveMediaAssetUrl(mainCat.image)}
                            alt={mainCat.name}
                            loading="lazy"
                            onError={() =>
                              setFailedImages((prev) => ({ ...prev, [mainCat.id]: true }))
                            }
                            className="w-full h-full object-contain p-0.5 bg-white"
                          />
                        ) : (
                          <span className="text-xs font-black text-[#FF6000]">
                            {mainCat.initialLetter}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] sm:text-xs leading-tight line-clamp-2">
                          {mainCat.name}
                        </div>
                        <div className="text-[9px] text-slate-400 font-medium mt-0.5">
                          {mainCat.subCategories.length > 0
                            ? `${mainCat.subCategories.length} Alt • ${mainCat.count}`
                            : `${mainCat.count} Ürün`}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Sağ Sütun: Seçili Ana Kategorinin Alt Kategorileri */}
              <div className="flex-1 bg-white dark:bg-slate-950 overflow-y-auto p-3.5 sm:p-4 space-y-3.5">
                {drawerSelectedMainNode && (
                  <>
                    {/* Üst Ana Kategori Tümünü Gör Kartı */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCategory(drawerSelectedMainNode.id);
                        setSelectedSubCategory('all');
                        if (activeTab !== 'catalog') setActiveTab('catalog');
                        setIsDrawerOpen(false);
                      }}
                      className="w-full p-3 rounded-2xl bg-gradient-to-r from-[#FF6000] to-orange-500 text-white shadow-md shadow-orange-500/20 flex items-center justify-between gap-2 text-left transition active:scale-[0.99]"
                    >
                      <div className="min-w-0">
                        <div className="text-xs sm:text-sm font-black truncate">
                          {drawerSelectedMainNode.name}
                        </div>
                        <div className="text-[11px] text-orange-100 font-semibold mt-0.5">
                          Tüm {drawerSelectedMainNode.name} Ürünlerini Gör (
                          {drawerSelectedMainNode.count} Ürün)
                        </div>
                      </div>
                      <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                        <ArrowRight className="w-4 h-4 text-white" />
                      </div>
                    </button>

                    {/* Alt Kategoriler Başlığı */}
                    {drawerSelectedMainNode.subCategories.length > 0 ? (
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                            Alt Kategoriler ({drawerSelectedMainNode.subCategories.length})
                          </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
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
                                className={`p-2.5 rounded-2xl border flex flex-col items-center text-center gap-2 transition active:scale-95 relative ${
                                  isSubSelected
                                    ? 'bg-orange-50 dark:bg-orange-950/30 border-[#FF6000] ring-2 ring-[#FF6000]/20'
                                    : 'bg-slate-50/70 dark:bg-slate-900/70 border-slate-200/80 dark:border-slate-800 hover:border-orange-300'
                                }`}
                              >
                                {isSubSelected && (
                                  <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-[#FF6000] text-white flex items-center justify-center">
                                    <Check className="w-2.5 h-2.5" />
                                  </span>
                                )}

                                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-white border border-slate-100 dark:border-slate-800 overflow-hidden flex items-center justify-center shadow-2xs">
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
                                      className="w-full h-full object-contain p-1 bg-white"
                                    />
                                  ) : (
                                    <span className="text-lg font-black text-[#FF6000]">
                                      {sub.name.charAt(0)}
                                    </span>
                                  )}
                                </div>

                                <div className="w-full min-w-0">
                                  <div className="font-extrabold text-[11px] text-slate-900 dark:text-white leading-tight line-clamp-2">
                                    {sub.name}
                                  </div>
                                  <div className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 mt-0.5">
                                    {sub.count} Ürün
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="p-6 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-center space-y-2">
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                          Bu ana kategoride alt kırılım bulunmuyor.
                        </p>
                        <p className="text-[11px] text-slate-400">
                          Yukarıdaki turuncu butona dokunarak bu kategorideki tüm{' '}
                          <strong>{drawerSelectedMainNode.count}</strong> ürünü
                          listeleyebilirsiniz.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
