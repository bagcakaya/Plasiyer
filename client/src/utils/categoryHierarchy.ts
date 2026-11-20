import type { Product } from '../types';

// ERP12 STOK_GRUP (ID -> USTID) bilgisinin yerel önbellekte henüz yenilenmemiş olduğu durumlar için
// Alt Kategori -> Ana Kategori eşleşme tablosu (SQL'den mainCategory/subCategory geldiğinde doğrudan SQL verisi kullanılır)
const KNOWN_SUBCATEGORY_TO_MAIN: Record<string, string> = {
  'METAL ÇAKMAK': 'ÇAKMAK',
  'AMPÜLLER': 'ELEKTRİK ELEKTRONİK',
  'FENERLER': 'ELEKTRİK ELEKTRONİK',
  'TRAŞ MAKİNALARI': 'ELEKTRİK ELEKTRONİK',
  'KAHVELER': 'GIDA',
  'KURUYEMİŞ/LOKUM': 'GIDA',
  'PET SHOP': 'GIDA',
  'AĞIZ BAKIM ÜRÜNLERİ': 'KOZMETİK',
  'CİLT BAKIM': 'KOZMETİK',
  'HAVLU/MENDİL/PEÇETE': 'KOZMETİK',
  'KİŞİSEL BAKIM': 'KOZMETİK',
  'KOLONYALAR': 'KOZMETİK',
  'PARFÜM/DEODORANTLAR': 'KOZMETİK',
  'SAÇ BAKIM ÜRÜNLERİ': 'KOZMETİK',
  'TRAŞ MALZEMELERİ': 'KOZMETİK',
  'ELDİVENLER': 'LÜKS HIRDAVAT',
  'HIRDAVAT ÜRÜNLERİ': 'LÜKS HIRDAVAT',
  'TEKNİK HIRDAVAT': 'LÜKS HIRDAVAT',
  'KAMP MALZEMELERİ': 'LÜKS HIRDAVAT',
  'KOLİ BANDI/İZOLE BANT': 'LÜKS HIRDAVAT',
  'MUMLAR': 'LÜKS HIRDAVAT',
  'AREON KOKULAR': 'OTO AKSESUAR',
  'DİĞER OTO BAKIM ÜRÜNLERİ': 'OTO AKSESUAR',
  'MİKROFİBER BEZLER': 'OTO AKSESUAR',
  'OTO KOKULARI': 'OTO AKSESUAR',
  'ÇOĞALTICILAR': 'TELEFON AKSESUAR',
  'DÖNÜŞTÜRÜCÜLER': 'TELEFON AKSESUAR',
  'KABLOLAR': 'TELEFON AKSESUAR',
  'KULAKLIKLAR': 'TELEFON AKSESUAR',
  'ŞARJ ALETLERİ': 'TELEFON AKSESUAR',
  'TELEFON TUTUCULAR': 'TELEFON AKSESUAR',
  'ELEKTRİKLİ EV ALETLERİ': 'ZÜCCACİYE',
  'MUTFAK MALZEMELERİ': 'ZÜCCACİYE',
};

export interface ResolvedProductCategory {
  mainCategory: string;
  subCategory: string; // Boş ise doğrudan ana kategori ürünüdür
}

export function resolveProductCategory(product: Product): ResolvedProductCategory {
  const rawCat = (product.category || 'Genel').trim();
  const rawMain = (product.mainCategory || '').trim();
  const rawSub = (product.subCategory || '').trim();

  if (rawMain && rawSub && rawMain.toLocaleUpperCase('tr-TR') !== rawSub.toLocaleUpperCase('tr-TR')) {
    return {
      mainCategory: rawMain,
      subCategory: rawSub,
    };
  }

  const catUpper = rawCat.toLocaleUpperCase('tr-TR');
  const mappedMain = KNOWN_SUBCATEGORY_TO_MAIN[catUpper];
  if (mappedMain) {
    return {
      mainCategory: mappedMain,
      subCategory: rawCat,
    };
  }

  // Eğer kategori adında " > " veya " / " ile üst-alt ayrımı varsa (KURUYEMİŞ/LOKUM vb. hariç)
  if (rawCat.includes(' > ')) {
    const [m, s] = rawCat.split(' > ').map((x) => x.trim());
    if (m && s) {
      return { mainCategory: m, subCategory: s };
    }
  }

  return {
    mainCategory: rawMain || rawCat || 'Genel',
    subCategory: '',
  };
}

export interface SubCategoryNode {
  id: string;
  name: string;
  shortName: string;
  image?: string;
  count: number;
}

export interface MainCategoryNode {
  id: string;
  name: string;
  shortName: string;
  initialLetter: string;
  image?: string;
  count: number;
  directCount: number;
  subCategories: SubCategoryNode[];
}

export function buildCategoryTree(products: Product[]): MainCategoryNode[] {
  const mainMap = new Map<
    string,
    {
      name: string;
      image?: string;
      count: number;
      directCount: number;
      directImage?: string;
      subMap: Map<string, { name: string; image?: string; count: number }>;
    }
  >();

  for (const p of products) {
    const rawCat = (p.category || '').trim();
    if (!rawCat || rawCat.toLocaleUpperCase('tr-TR').includes('MASRAF')) continue;

    const { mainCategory, subCategory } = resolveProductCategory(p);
    if (!mainCategory || mainCategory.toLocaleUpperCase('tr-TR').includes('MASRAF')) continue;

    let mainEntry = mainMap.get(mainCategory);
    if (!mainEntry) {
      mainEntry = {
        name: mainCategory,
        count: 0,
        directCount: 0,
        subMap: new Map(),
      };
      mainMap.set(mainCategory, mainEntry);
    }

    mainEntry.count += 1;
    const hasPhoto = Boolean(p.image && !p.image.startsWith('data:image/svg'));
    if (!mainEntry.image && hasPhoto) {
      mainEntry.image = p.image;
    }

    if (subCategory) {
      let subEntry = mainEntry.subMap.get(subCategory);
      if (!subEntry) {
        subEntry = { name: subCategory, count: 0 };
        mainEntry.subMap.set(subCategory, subEntry);
      }
      subEntry.count += 1;
      if (!subEntry.image && hasPhoto) {
        subEntry.image = p.image;
      }
    } else {
      mainEntry.directCount += 1;
      if (!mainEntry.directImage && hasPhoto) {
        mainEntry.directImage = p.image;
      }
    }
  }

  const sortedMains = Array.from(mainMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name, 'tr')
  );

  return sortedMains.map((m) => {
    const cleanMain = m.name.replace(/[\\/]/g, ' ').replace(/\s+/g, ' ').trim();
    const subList: SubCategoryNode[] = Array.from(m.subMap.values())
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
      .map((s) => {
        const cleanSub = s.name.replace(/[\\/]/g, ' ').replace(/\s+/g, ' ').trim();
        return {
          id: s.name,
          name: s.name,
          shortName: cleanSub.length > 18 ? cleanSub.slice(0, 17) + '…' : cleanSub,
          image: s.image || m.image,
          count: s.count,
        };
      });

    // Eğer ana kategorinin hem alt kategorileri hem de doğrudan ana kategoriye bağlı ürünleri varsa (Örn: ELEKTRİK ELEKTRONİK, GIDA, TELEFON AKSESUAR)
    // onları da "Genel / Diğer <Ana Kategori>" alt kategorisi olarak ekle ki tek tıkla filtrelenebilsin
    if (subList.length > 0 && m.directCount > 0) {
      subList.push({
        id: `__DIRECT__:${m.name}`,
        name: `${m.name} (Diğer)`,
        shortName: `Diğer (${m.directCount})`,
        image: m.directImage || m.image,
        count: m.directCount,
      });
    }

    return {
      id: m.name,
      name: m.name,
      shortName: cleanMain.length > 13 ? cleanMain.slice(0, 12) + '..' : cleanMain,
      initialLetter: cleanMain.charAt(0).toLocaleUpperCase('tr-TR') || 'K',
      image: m.image,
      count: m.count,
      directCount: m.directCount,
      subCategories: subList,
    };
  });
}
