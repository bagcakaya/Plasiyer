import type { VisitRecord, Customer, NavigationApp } from '../types';

/**
 * İki GPS koordinatı arasındaki mesafeyi Haversine formülü ile metre cinsinden hesaplar.
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Dünya yarıçapı (metre)
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

/**
 * Metre cinsinden mesafeyi insan tarafından okunabilir formata dönüştürür (örn. 85 m, 1.4 km).
 */
export function formatDistance(meters?: number | null): string {
  if (meters === undefined || meters === null || isNaN(meters)) {
    return 'Bilinmiyor';
  }
  if (meters < 1000) {
    return `${meters} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Plasiyerin müşterinin Geofence (coğrafi çit) alanı içinde olup olmadığını denetler.
 */
export function checkGeofence(
  currentLat: number,
  currentLon: number,
  targetLat?: number,
  targetLon?: number,
  radiusMeters: number = 150
): {
  isWithin: boolean;
  distanceMeters: number;
  status: 'inside' | 'outside' | 'unknown';
} {
  if (!targetLat || !targetLon) {
    return { isWithin: true, distanceMeters: 0, status: 'unknown' };
  }

  const distance = calculateDistanceMeters(currentLat, currentLon, targetLat, targetLon);
  const isWithin = distance <= radiusMeters;

  return {
    isWithin,
    distanceMeters: distance,
    status: isWithin ? 'inside' : 'outside',
  };
}

/**
 * Harici navigasyon uygulaması bağlantısı oluşturur (Google Maps, Apple Maps, Yandex).
 */
export function getNavigationUrl(
  lat: number,
  lon: number,
  label: string,
  app: NavigationApp = 'google'
): string {
  const encodedLabel = encodeURIComponent(label);
  switch (app) {
    case 'google':
      return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=driving`;
    case 'apple':
      return `https://maps.apple.com/?daddr=${lat},${lon}&q=${encodedLabel}&dirflg=d`;
    case 'yandex':
      // Mobil cihazda Yandex Navigasyon uygulaması varsa direkt açılır, yoksa web harita
      return `https://yandex.com.tr/harita/?rtext=~${lat}%2C${lon}&rtt=auto`;
  }
}

/**
 * Günlük rut ziyaretlerini plasiyerin anlık konumuna en yakın olandan başlayarak optimize eder (En Yakın Komşu / Greedy Route).
 */
export function sortVisitsByProximity(
  visits: VisitRecord[],
  customerMap: Map<string, Customer>,
  currentLat: number,
  currentLon: number
): VisitRecord[] {
  // Tamamlanmış veya iptal edilmişleri mevcut sıralarında koru
  const completed = visits.filter(v => v.status === 'completed' || v.status === 'skipped');
  const activeAndPending = visits.filter(v => v.status !== 'completed' && v.status !== 'skipped');

  // Bekleyenleri açgözlü (greedy nearest neighbor) yöntemi ile sırala
  const sortedPending: VisitRecord[] = [];
  const pool = [...activeAndPending];
  let curLat = currentLat;
  let curLon = currentLon;

  while (pool.length > 0) {
    let bestIndex = 0;
    let minDistance = Infinity;

    for (let i = 0; i < pool.length; i++) {
      const cust = customerMap.get(pool[i].customerId);
      if (cust && cust.latitude && cust.longitude) {
        const d = calculateDistanceMeters(curLat, curLon, cust.latitude, cust.longitude);
        if (d < minDistance) {
          minDistance = d;
          bestIndex = i;
        }
      }
    }

    const nextVisit = pool.splice(bestIndex, 1)[0];
    sortedPending.push(nextVisit);
    const nextCust = customerMap.get(nextVisit.customerId);
    if (nextCust && nextCust.latitude && nextCust.longitude) {
      curLat = nextCust.latitude;
      curLon = nextCust.longitude;
    }
  }

  // Önce aktif/bekleyen sıralı liste, ardından tamamlananlar
  return [...sortedPending, ...completed];
}

/**
 * Test ve simülasyon lokasyonları
 */
export const SIMULATED_LOCATIONS = [
  {
    name: 'Kadıköy Yıldız Market Kapısında (Geofence İçi - 15m)',
    latitude: 40.9877,
    longitude: 29.0255,
    nearCustomerCode: '120.01.0001',
  },
  {
    name: 'Ümraniye Anadolu Gıda Kapısında (Geofence İçi - 25m)',
    latitude: 41.0251,
    longitude: 29.0967,
    nearCustomerCode: '120.01.0002',
  },
  {
    name: 'Ataşehir Kardeşler Büfe Kapısında (Geofence İçi - 10m)',
    latitude: 40.9921,
    longitude: 29.1122,
    nearCustomerCode: '120.01.0003',
  },
  {
    name: 'Saha Dışı: Merkez Depo / Ofiste (Uzak - 4.5 km)',
    latitude: 41.0050,
    longitude: 29.0400,
  },
];
