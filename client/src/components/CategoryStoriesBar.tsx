import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useApp } from '../context/AppContext';
import { Layers, ChevronLeft, ChevronRight } from 'lucide-react';
import { resolveMediaAssetUrl } from '../services/apiService';

export interface CategoryItem {
  id: string;
  name: string;
  shortName: string;
  initialLetter: string;
  image?: string;
  count: number;
}

// STOK_GRUP'a özel şık Instagram renk gradyanları
const GRADIENT_PALETTE = [
  'from-blue-600 via-indigo-600 to-purple-600',
  'from-rose-500 via-pink-600 to-red-600',
  'from-amber-500 via-orange-600 to-amber-700',
  'from-emerald-500 via-teal-600 to-cyan-700',
  'from-purple-600 via-fuchsia-600 to-pink-600',
  'from-cyan-500 via-blue-600 to-indigo-700',
  'from-orange-500 via-rose-600 to-purple-700',
  'from-lime-500 via-emerald-600 to-teal-700',
  'from-violet-600 via-purple-700 to-indigo-800',
  'from-yellow-500 via-amber-600 to-orange-600',
];

export const CategoryStoriesBar: React.FC = () => {
  const { selectedCategory, setSelectedCategory, setActiveTab, activeTab } = useApp();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);
  const [visibleImageLimit, setVisibleImageLimit] = useState(14);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  // PC Mouse ile sürükleyerek kaydırma state'leri
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeftStart, setScrollLeftStart] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // IndexedDB'deki güncel ERP12 ürünlerini çek
  const products = useLiveQuery(() => db.products.toArray(), []) || [];

  // ERP12 STOK_GRUP verilerini derle (Masraf Kartları hariç)
  const categories: CategoryItem[] = useMemo(() => {
    const list: CategoryItem[] = [
      {
        id: 'all',
        name: 'Tümü',
        shortName: 'Tümü',
        initialLetter: 'T',
        count: products.filter(p => !(p.category || '').toUpperCase().includes('MASRAF')).length,
      },
    ];

    // Ürünlerdeki mevcut STOK_GRUP kategorilerini ve varsa ürün görselini topla
    const catMap = new Map<string, { image?: string; count: number }>();
    products.forEach((p) => {
      const catName = p.category?.trim();
      if (!catName) return;
      // Masraf Kartları ve masraf gruplarını hariç tut
      if (catName.toUpperCase().includes('MASRAF')) return;

      const current = catMap.get(catName) || { count: 0 };
      current.count += 1;
      if (!current.image && p.image && !p.image.startsWith('data:image/svg')) {
        current.image = p.image;
      }
      catMap.set(catName, current);
    });

    // Alfabetik sıralama (Türkçe kurallarına uygun)
    const sortedCategories = Array.from(catMap.keys()).sort((a, b) => a.localeCompare(b, 'tr'));

    sortedCategories.forEach((name) => {
      const meta = catMap.get(name)!;
      const cleanName = name.replace(/[\\/]/g, ' ').replace(/\s+/g, ' ').trim();
      
      list.push({
        id: name,
        name: name,
        shortName: cleanName.length > 12 ? cleanName.slice(0, 11) + '..' : cleanName,
        initialLetter: cleanName.charAt(0).toLocaleUpperCase('tr-TR') || 'G',
        image: meta.image,
        count: meta.count,
      });
    });

    return list;
  }, [products]);

  // Kaydırma sınırlarını kontrol et
  const updateScrollArrows = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setShowLeftArrow(scrollLeft > 10);
    setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 10);
    const approxVisibleIdx = Math.ceil((scrollLeft + clientWidth * 1.5) / 72) + 6;
    if (approxVisibleIdx > visibleImageLimit) {
      setVisibleImageLimit(approxVisibleIdx);
    }
  };

  // PC'de mouse tekerleğiyle dikey çevirmeyi yatay kaydırmaya dönüştür
  useEffect(() => {
    const el = scrollRef.current;
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

  // Butonla sağa/sola kaydır
  const handleScrollByButton = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const offset = direction === 'left' ? -350 : 350;
    scrollRef.current.scrollBy({ left: offset, behavior: 'smooth' });
    setTimeout(updateScrollArrows, 300);
  };

  // PC Mouse ile tıklayıp sürükleme olayları
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    setIsMouseDown(true);
    setIsDragging(false);
    setStartX(e.pageX - scrollRef.current.offsetLeft);
    setScrollLeftStart(scrollRef.current.scrollLeft);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isMouseDown || !scrollRef.current) return;
    const x = e.pageX - scrollRef.current.offsetLeft;
    const distance = x - startX;
    if (Math.abs(distance) > 5) {
      setIsDragging(true);
    }
    scrollRef.current.scrollLeft = scrollLeftStart - distance;
    updateScrollArrows();
  };

  const handleMouseUpOrLeave = () => {
    setIsMouseDown(false);
    setTimeout(() => setIsDragging(false), 50);
  };

  const handleSelectCategory = (cat: CategoryItem) => {
    if (isDragging) return; // Sürükleme sırasında kategori seçilmesini engelle
    if (selectedCategory === cat.id && cat.id !== 'all') {
      setSelectedCategory('all');
    } else {
      setSelectedCategory(cat.id);
    }
    if (activeTab !== 'catalog') {
      setActiveTab('catalog');
    }
  };

  return (
    <div className="relative w-full bg-slate-950/95 border-b border-slate-800/80 backdrop-blur-md select-none group/container">
      {/* PC Sol Kaydırma Butonu */}
      {showLeftArrow && (
        <button
          type="button"
          onClick={() => handleScrollByButton('left')}
          className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 shadow-lg text-white items-center justify-center transition-all hover:scale-110 active:scale-95 cursor-pointer backdrop-blur-sm"
          title="Sola Kaydır"
        >
          <ChevronLeft className="w-5 h-5 text-slate-200" />
        </button>
      )}

      {/* PC Sağ Kaydırma Butonu */}
      {showRightArrow && (
        <button
          type="button"
          onClick={() => handleScrollByButton('right')}
          className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 shadow-lg text-white items-center justify-center transition-all hover:scale-110 active:scale-95 cursor-pointer backdrop-blur-sm"
          title="Sağa Kaydır"
        >
          <ChevronRight className="w-5 h-5 text-slate-200" />
        </button>
      )}

      {/* Kategoriler Kaydırma Konteyneri */}
      <div
        ref={scrollRef}
        onScroll={updateScrollArrows}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUpOrLeave}
        onMouseLeave={handleMouseUpOrLeave}
        className={`flex items-center gap-3 sm:gap-4 px-3.5 sm:px-6 py-2.5 overflow-x-auto no-scrollbar scroll-smooth cursor-grab active:cursor-grabbing ${
          isMouseDown ? 'select-none pointer-events-auto' : ''
        }`}
      >
        {categories.map((cat, idx) => {
          const isSelected = selectedCategory === cat.id;
          const bgGradient = GRADIENT_PALETTE[idx % GRADIENT_PALETTE.length];

          return (
            <button
              key={cat.id}
              onClick={() => handleSelectCategory(cat)}
              className="flex flex-col items-center shrink-0 group focus:outline-none transition-transform active:scale-95 cursor-pointer"
              title={`${cat.name} (${cat.count} Ürün)`}
            >
              {/* Instagram Hikaye Halka Efekti */}
              <div
                className={`p-[2.5px] rounded-full transition-all duration-300 ${
                  isSelected
                    ? 'bg-gradient-to-tr from-amber-400 via-rose-500 to-purple-600 ring-2 ring-blue-400/80 scale-105 shadow-lg shadow-rose-500/20'
                    : 'bg-slate-700 hover:bg-gradient-to-tr hover:from-amber-400 hover:via-rose-500 hover:to-purple-600'
                }`}
              >
                {/* İç Siyah Ayırıcı Boşluk */}
                <div className="p-[2px] bg-slate-950 rounded-full">
                  {/* Yuvarlak Hikaye Avatarı */}
                  <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-full overflow-hidden flex items-center justify-center bg-slate-900 relative shadow-inner">
                    {cat.id === 'all' ? (
                      <div className="w-full h-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex flex-col items-center justify-center text-white">
                        <Layers className="w-5 h-5 drop-shadow" />
                      </div>
                    ) : cat.image && idx <= visibleImageLimit && !failedImages[cat.id] ? (
                      /* Kategorinin görseli varsa boyut ona göre içinde yer alır */
                      <img
                        src={resolveMediaAssetUrl(cat.image) || cat.image}
                        alt={cat.name}
                        onError={(e) => {
                          const target = e.currentTarget;
                          const src = target.src || '';
                          if (
                            (src.startsWith('http://localhost:') || src.startsWith('http://127.0.0.1:')) &&
                            src.includes('/api/') &&
                            !target.dataset.cloudFallback
                          ) {
                            target.dataset.cloudFallback = '1';
                            const apiIdx = src.indexOf('/api/');
                            if (apiIdx >= 0) {
                              target.src = src.slice(apiIdx);
                              return;
                            }
                          }
                          setFailedImages((prev) => ({ ...prev, [cat.id]: true }));
                        }}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                        loading="lazy"
                        draggable={false}
                      />
                    ) : (
                      /* Görsel yoksa Kategorinin baş harfi yer alır */
                      <div
                        className={`w-full h-full bg-gradient-to-br ${bgGradient} flex items-center justify-center text-white font-black text-lg drop-shadow tracking-wider select-none`}
                      >
                        {cat.initialLetter}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Halkanın Altında Kategori İsmi */}
              <span
                className={`text-[11px] font-bold mt-1 text-center truncate max-w-[70px] sm:max-w-[78px] transition-colors leading-tight select-none ${
                  isSelected
                    ? 'text-white font-extrabold underline decoration-blue-400 underline-offset-2'
                    : 'text-slate-300 group-hover:text-white'
                }`}
              >
                {cat.shortName}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
