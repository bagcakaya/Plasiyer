import React, { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useApp } from '../context/AppContext';
import { b2bStoreCategories } from '../data/b2bCategories';
import { Layers } from 'lucide-react';

interface CategoryItem {
  id: string;
  name: string;
  shortName: string;
  initialLetter: string;
  image?: string;
  filterKeyword?: string;
}

// Kategoriye özel dinamik renk gradyanları
const GRADIENT_PALETTE = [
  'from-blue-600 to-indigo-700',
  'from-rose-500 to-red-600',
  'from-amber-500 to-orange-600',
  'from-emerald-500 to-teal-700',
  'from-purple-600 to-pink-600',
  'from-cyan-600 to-blue-700',
  'from-fuchsia-600 to-purple-700',
  'from-lime-600 to-emerald-700',
];

export const CategoryStoriesBar: React.FC = () => {
  const { selectedCategory, setSelectedCategory, setActiveTab, activeTab } = useApp();

  const products = useLiveQuery(() => db.products.toArray(), []) || [];

  // Kategorileri ve görsellerini dinamik olarak derle
  const categories: CategoryItem[] = useMemo(() => {
    const list: CategoryItem[] = [
      {
        id: 'all',
        name: 'Tümü',
        shortName: 'Tümü',
        initialLetter: 'T',
      },
    ];

    // Ürünlerdeki mevcut tüm kategorileri ve ilk bulunan geçerli görselleri topla
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

    // Varsa B2B sabit kategorileri ekle veya harmanla
    b2bStoreCategories.forEach((bCat) => {
      if (bCat.id === 'all') return;
      const rawName = bCat.name.replace(/^[^\p{L}\p{N}]+/u, '').trim(); // Emojileri temizle
      if (!list.some((l) => l.id === bCat.id || l.name.toLowerCase() === rawName.toLowerCase())) {
        list.push({
          id: bCat.id,
          name: rawName,
          shortName: rawName.length > 11 ? rawName.slice(0, 10) + '..' : rawName,
          initialLetter: rawName.charAt(0).toUpperCase() || 'K',
          filterKeyword: bCat.filterKeyword,
        });
      }
    });

    // DB'deki ürün kategorilerini ekle
    catMap.forEach((meta, name) => {
      if (!list.some((l) => l.name.toLowerCase() === name.toLowerCase())) {
        const cleanName = name.replace(/[\\/]/g, ' ').replace(/\s+/g, ' ').trim();
        list.push({
          id: `cat-${encodeURIComponent(name)}`,
          name: name,
          shortName: cleanName.length > 11 ? cleanName.slice(0, 10) + '..' : cleanName,
          initialLetter: cleanName.charAt(0).toUpperCase() || 'K',
          image: meta.image,
          filterKeyword: name,
        });
      }
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
    <div className="w-full bg-slate-950/95 border-b border-slate-800/80 backdrop-blur-md">
      <div className="flex items-center gap-3 sm:gap-4 px-3.5 py-2.5 overflow-x-auto no-scrollbar scroll-smooth">
        {categories.map((cat, idx) => {
          const isSelected = selectedCategory === cat.id;
          const bgGradient = GRADIENT_PALETTE[idx % GRADIENT_PALETTE.length];

          return (
            <button
              key={cat.id}
              onClick={() => handleSelectCategory(cat)}
              className="flex flex-col items-center shrink-0 group focus:outline-none transition-transform active:scale-95"
              title={`${cat.name} Kategorisindeki Ürünleri Filtrele`}
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
                className={`text-[11px] font-bold mt-1 text-center truncate max-w-[68px] sm:max-w-[74px] transition-colors leading-tight ${
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
