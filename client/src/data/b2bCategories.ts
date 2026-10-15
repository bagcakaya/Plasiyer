import type { B2BCategory } from '../types';

export const b2bStoreCategories: B2BCategory[] = [
  {
    id: 'all',
    name: 'Tüm Ürünler',
    badge: 'Katalog',
  },
  {
    id: 'featured',
    name: '⭐ Öne Çıkanlar',
    badge: 'Popüler',
    filterKeyword: 'FO',
  },
  {
    id: 'bar-drinks',
    name: '🥤 Bar & İçecek Sosları',
    badge: 'Trend',
    filterKeyword: 'BAR',
  },
  {
    id: 'bakery-flour',
    name: '🥖 Pastacılık & Unlar',
    badge: 'Temel Gıda',
    filterKeyword: 'PASTACILIK',
  },
  {
    id: 'syrups',
    name: '🍯 Şurup & Püreler',
    filterKeyword: 'ŞURUP',
  },
  {
    id: 'special-deals',
    name: '🔥 Fırsat Ürünleri',
    badge: 'İndirimli',
  },
];
