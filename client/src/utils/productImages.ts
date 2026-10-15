/**
 * Ürün Görselleri Kataloğu & Akıllı Kategori Görsel Motoru (ERP12 Entegre)
 * 
 * 1. Özel / Plasiyer Çekimi Fotoğraf (IndexedDB & /uploads/products/): En yüksek öncelik
 * 2. ERP12 Sistem Görseli: İkinci öncelik
 * 3. Yüksek Kaliteli Vektör Kategori Rozeti (SVG): Çevrimdışı garantili, sıfır hatalı, profesyonel
 */

function createCategorySvgBadge(
  title: string,
  category: string,
  c1: string,
  c2: string,
  iconSvg: string
): string {
  const safeTitle = (title || 'Ürün').slice(0, 24).replace(/[<>&"']/g, '');
  const safeCategory = (category || 'Genel').slice(0, 22).replace(/[<>&"']/g, '');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">
    <defs>
      <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${c1}"/>
        <stop offset="100%" stop-color="${c2}"/>
      </linearGradient>
      <radialGradient id="glow" cx="50%" cy="35%" r="60%">
        <stop offset="0%" stop-color="rgba(255,255,255,0.22)"/>
        <stop offset="100%" stop-color="rgba(0,0,0,0.15)"/>
      </radialGradient>
      <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
        <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
      </pattern>
    </defs>
    
    <!-- Arka Plan -->
    <rect width="400" height="300" fill="url(#bgGrad)"/>
    <rect width="400" height="300" fill="url(#glow)"/>
    <rect width="400" height="300" fill="url(#grid)"/>
    
    <!-- İkon Dairesi -->
    <circle cx="200" cy="115" r="48" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.35)" stroke-width="2.5"/>
    <g transform="translate(176, 91) scale(2)" stroke="#FFFFFF" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      ${iconSvg}
    </g>

    <!-- Başlık ve Kategori Metni -->
    <text x="200" y="195" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-weight="800" font-size="20" fill="#FFFFFF" text-anchor="middle" letter-spacing="0.5">${safeTitle}</text>
    <text x="200" y="222" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-weight="600" font-size="12" fill="rgba(255,255,255,0.85)" text-anchor="middle">${safeCategory}</text>

    <!-- Kamera Aksiyon Rozeti -->
    <g transform="translate(115, 244)">
      <rect width="170" height="30" rx="15" fill="rgba(0,0,0,0.35)" stroke="rgba(255,255,255,0.3)" stroke-width="1.2"/>
      <circle cx="22" cy="15" r="4" fill="none" stroke="#FFFFFF" stroke-width="1.5"/>
      <path d="M16 11 L18 9 L26 9 L28 11 L31 11 A 2 2 0 0 1 33 13 L33 19 A 2 2 0 0 1 31 21 L13 21 A 2 2 0 0 1 11 19 L11 13 A 2 2 0 0 1 13 11 Z" fill="none" stroke="#FFFFFF" stroke-width="1.5"/>
      <text x="100" y="19" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-weight="700" font-size="11" fill="#FFFFFF" text-anchor="middle">Fotoğraf Çek / Yükle</text>
    </g>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Kategori İkon SVG Yolları (Lucide tabanlı temiz vektörler)
const ICONS = {
  sweet: '<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  jar: '<path d="M6 3h12M6 8h12M7 8v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V8M10 13h4"/>',
  spice: '<path d="M12 2a5 5 0 0 0-5 5v3h10V7a5 5 0 0 0-5-5zM5 14a7 7 0 0 0 14 0H5zM12 18v4"/>',
  bakery: '<path d="M4 11a8 8 0 0 1 16 0v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7zM8 11v4M12 11v4M16 11v4"/>',
  dairy: '<path d="M8 2h8v4H8zM6 6h12l2 14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2L6 6zM10 12h4"/>',
  drink: '<path d="M17 8h1a4 4 0 1 1 0 8h-1M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4ZM6 2v2M10 2v2M14 2v2"/>',
  oil: '<path d="M12 2a9 9 0 0 1 9 9c0 5-4 9-9 9s-9-4-9-9a9 9 0 0 1 9-9zM12 6v6l4 2"/>',
  grain: '<path d="M2 22 12 12M12 12a5 5 0 0 0 7-7 5 5 0 0 0-7 7zM12 12a5 5 0 0 1-7 7 5 5 0 0 1 7-7z"/>',
  package: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>',
};

/**
 * Türkçe karakterleri (İ, ı, ş, ğ, ü, ö, ç) standart küçük harf formatına dönüştürür.
 */
function normalizeTurkish(str: string): string {
  if (!str) return '';
  return str
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .replace(/Ş/g, 's')
    .replace(/ş/g, 's')
    .replace(/Ğ/g, 'g')
    .replace(/ğ/g, 'g')
    .replace(/Ü/g, 'u')
    .replace(/ü/g, 'u')
    .replace(/Ö/g, 'o')
    .replace(/ö/g, 'o')
    .replace(/Ç/g, 'c')
    .replace(/ç/g, 'c')
    .replace(/ı/g, 'i')
    .toLowerCase()
    .trim();
}

/**
 * Ürün görselini döndürür.
 * 1. Eğer ürünün kendi fotoğrafı varsa (IndexedDB data URL, sunucu /uploads/ veya harici URL), onu döner.
 * 2. Yoksa, ürün adına ve kategorisine özel %100 uyumlu, asla bozulmayan Türkçe vektör rozeti üretir.
 */
export function getProductImageUrl(productName: string, categoryName = '', existingImage?: string): string {
  // 1. Mevcut veya yüklenen gerçek fotoğraf kontrolü
  if (existingImage && (existingImage.startsWith('data:') || existingImage.startsWith('/') || existingImage.startsWith('http'))) {
    return existingImage;
  }

  const n = normalizeTurkish(productName);
  const c = normalizeTurkish(categoryName);

  // 1. Pişmaniye, Saray Helvası, Çekme Helva (Geleneksel Tatlı)
  if (n.includes('pismaniye') || n.includes('saray helv') || n.includes('cekme helva')) {
    return createCategorySvgBadge('Pişmaniye & Saray Helvası', 'Geleneksel Tatlılar', '#b45309', '#78350f', ICONS.sweet);
  }

  // 2. Tahin & Tahin Ezmesi
  if (n.includes('tahin') && !n.includes('helva')) {
    return createCategorySvgBadge('Doğal Tahin', 'Susam Ürünleri', '#92400e', '#78350f', ICONS.jar);
  }

  // 3. Helva & Tahin Helvası (Kakaolu, Sade, Fıstıklı)
  if (n.includes('helva') || c.includes('helva')) {
    return createCategorySvgBadge('Tahin Helvası', 'Geleneksel Helvalar', '#d97706', '#92400e', ICONS.sweet);
  }

  // 4. Pekmez (Üzüm, Dut, Keçiboynuzu, Harnup)
  if (n.includes('pekmez') || n.includes('keciboynuzu') || n.includes('harnup')) {
    return createCategorySvgBadge('Geleneksel Pekmez', 'Doğal Pekmez Çeşitleri', '#451a03', '#78350f', ICONS.jar);
  }

  // 5. Baharat & Toz Biber & Pul Biber
  if (
    n.includes('biber') ||
    n.includes('baharat') ||
    n.includes('kimyon') ||
    n.includes('kekik') ||
    n.includes('nane') ||
    n.includes('sumak') ||
    n.includes('tarcin') ||
    n.includes('kofte harc') ||
    n.includes('isot') ||
    n.includes('susam') ||
    c.includes('baharat')
  ) {
    return createCategorySvgBadge('Yöresel Baharat', 'Baharat & Çeşniler', '#991b1b', '#b91c1c', ICONS.spice);
  }

  // 6. Ekmek, Tost Ekmeği, Sandviç, Lavaş, Unlu Mamuller
  if (
    n.includes('tost') ||
    n.includes('ekme') ||
    n.includes('sandvic') ||
    n.includes('hamburger') ||
    n.includes('bazlama') ||
    n.includes('lavas') ||
    c.includes('unlu mamul') ||
    c.includes('donuk')
  ) {
    return createCategorySvgBadge('Tost & Ekmek', 'Fırın & Unlu Mamul', '#d97706', '#b45309', ICONS.bakery);
  }

  // 7. Bal (Süzme, Petek, Çam, Çiçek)
  const isBal = n.includes('bal ') || n.startsWith('bal ') || n.endsWith(' bal') || n.includes('suzme bal') || c.includes('bal');
  if (isBal) {
    return createCategorySvgBadge('Doğal Süzme Bal', 'Arı & Bal Ürünleri', '#b45309', '#d97706', ICONS.jar);
  }

  // 8. Reçel & Marmelat
  if (n.includes('recel') || n.includes('marmelat') || c.includes('recel')) {
    return createCategorySvgBadge('Meyve Reçeli', 'Reçel & Marmelatlar', '#9f1239', '#881337', ICONS.jar);
  }

  // 9. Lokum & Şekerleme
  if (n.includes('lokum') || n.includes('cezerye') || n.includes('sekerleme')) {
    return createCategorySvgBadge('Türk Lokumu', 'Geleneksel Şekerleme', '#c2410c', '#9a3412', ICONS.sweet);
  }

  // 10. Çikolata, Gofret, Bisküvi
  if (n.includes('cikolata') || n.includes('gofret') || n.includes('biskuvi') || n.includes('krema')) {
    return createCategorySvgBadge('Çikolata & Bisküvi', 'Atıştırmalık & Gofret', '#713f12', '#451a03', ICONS.package);
  }

  // 11. Peynir, Kaşar, Tereyağı & Süt Ürünleri
  if (
    n.includes('peynir') ||
    n.includes('kasar') ||
    n.includes('tereyag') ||
    n.includes('margarin') ||
    n.includes('sut ') ||
    c.includes('sut')
  ) {
    return createCategorySvgBadge('Şarküteri & Süt', 'Süt & Süt Ürünleri', '#0369a1', '#075985', ICONS.dairy);
  }

  // 12. Çay & Kahve
  if (n.includes('cay') || n.includes('rize') || n.includes('kahve') || c.includes('cay')) {
    return createCategorySvgBadge('Demlik Çay & Kahve', 'Sıcak İçecekler', '#881337', '#4c0519', ICONS.drink);
  }

  // 13. Sıvı Yağlar (Ayçiçek & Zeytinyağı)
  if (n.includes('yag') || c.includes('yag')) {
    return createCategorySvgBadge('Bitkisel Sıvı Yağ', 'Yemeklik Sıvı Yağlar', '#854d0e', '#a16207', ICONS.oil);
  }

  // 14. Bakliyat, Pirinç, Makarna, Un
  if (
    n.includes('pirinc') ||
    n.includes('makarna') ||
    n.includes('mercimek') ||
    n.includes('nohut') ||
    n.includes('fasulye') ||
    n.includes('un ') ||
    c.includes('bakliyat')
  ) {
    return createCategorySvgBadge('Bakliyat & Tahıl', 'Temel Gıda & Kuru Bakliyat', '#166534', '#14532d', ICONS.grain);
  }

  // Varsayılan Genel Paket Gıda Rozeti
  const displayTitle = productName.length > 20 ? productName.substring(0, 20) + '...' : productName;
  return createCategorySvgBadge(displayTitle, categoryName || 'Toptan Gıda', '#334155', '#1e293b', ICONS.package);
}
