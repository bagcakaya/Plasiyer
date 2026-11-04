import React, { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useApp } from '../context/AppContext';
import { Layers } from 'lucide-react';

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

  // IndexedDB'deki güncel ERP12 ürünlerini çek
  const products = useLiveQuery(() => db.products.toArray(), []) || [];

  // ERP12 STOK_GRUP verilerini derle
  const categories: CategoryItem[] = useMemo(() => {
    const list: CategoryItem[] = [
      {
        id: 'all',
        name: 'Tümü',
        shortName: 'Tümü',
        initialLetter: 'T',
        count: products.length,
      },
    ];

    // Ürünlerdeki mevcut STOK_GRUP kategorilerini ve varsa ürün görselini topla
    const catMap = new Map<string, { image?: string; count: number }>();
    products.forEach((p) => {
      const catName = p.category?.trim();
      if (!catName) return;
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

  const handleSelectCategory = (cat: CategoryItem) => {
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
    <div className="w-full bg-slate-950/95 border-b border-slate-800/80 backdrop-blur-md select-none">
      <div className="flex items-center gap-3 sm:gap-4 px-3.5 py-2.5 overflow-x-auto no-scrollbar scroll-smooth">
        {categories.map((cat, idx) => {
          const isSelected = selectedCategory === cat.id;
          const bgGradient = GRADIENT_PALETTE[idx % GRADIENT_PALETTE.length];

          return (
            <button
              key={cat.id}
              onClick={() => handleSelectCategory(cat)}
              className="flex flex-col items-center shrink-0 group focus:outline-none transition-transform active:scale-95"
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
                    ) : cat.image ? (
                      /* Kategorinin görseli varsa boyut ona göre içinde yer alır */
                      <img
                        src={cat.image}
                        alt={cat.name}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                        loading="lazy"
                      />
                    ) : (
                      /* Görsel yoksa Kategorinin baş harfi yer alır */
                      <div
                        className={`w-full h-full bg-gradient-to-br ${bgGradient} flex items-center justify-center text-white font-black text-lg drop-shadow tracking-wider`}
                      >
                        {cat.initialLetter}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Halkanın Altında Kategori İsmi */}
              <span
                className={`text-[11px] font-bold mt-1 text-center truncate max-w-[70px] sm:max-w-[78px] transition-colors leading-tight ${
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
