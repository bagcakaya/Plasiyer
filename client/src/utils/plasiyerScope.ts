import type { AuthUser, Customer, PlasiyerAccount, Product } from '../types';
import { plasiyerAuthService } from '../services/plasiyerAuthService';

export function normalizeRegionName(val?: string | null): string {
  return String(val || '')
    .trim()
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .toLocaleUpperCase('tr-TR');
}

export function getCustomerRegionCode(customer: Customer): string {
  if (customer.regionCode && customer.regionCode.trim()) {
    return normalizeRegionName(customer.regionCode);
  }
  const cleanCode = normalizeRegionName(customer.code);
  if (cleanCode) {
    const match = cleanCode.match(/^(.+?)[-_ ]+\d+[A-Z]?$/);
    if (match && match[1]) {
      const prefix = normalizeRegionName(match[1].replace(/[-_ ]+$/, ''));
      if (
        prefix.length >= 2 &&
        !/^(CR|C|M|MUS|CARI|ALICI|SATICI|0+|120|320)$/i.test(prefix) &&
        !/^\d+$/.test(prefix)
      ) {
        return prefix;
      }
    }
  }
  const cleanDist = normalizeRegionName(customer.district);
  if (cleanDist && cleanDist !== 'MERKEZ') return cleanDist;
  return 'GENEL';
}

export interface ActivePlasiyerScope {
  isRestrictedPlasiyer: boolean;
  repCode: string;
  locationName: string;
  viewAllRoutes: boolean;
  effectiveRouteRegions: string[];
  hasCustomRouteOverride: boolean;
  viewAllStocks: boolean;
  effectiveStockGroups: string[];
  hasCustomStockOverride: boolean;
  forbiddenStockGroups: string[];
}

export function resolveActivePlasiyerScope(
  currentUser: AuthUser | null,
  isCompanyManager: boolean,
  accountsOverride?: PlasiyerAccount[]
): ActivePlasiyerScope {
  if (!currentUser || currentUser.role !== 'plasiyer' || isCompanyManager) {
    return {
      isRestrictedPlasiyer: false,
      repCode: (currentUser?.salesRepCode || currentUser?.code || '').trim().toUpperCase(),
      locationName: currentUser?.locationName || '',
      viewAllRoutes: true,
      effectiveRouteRegions: [],
      hasCustomRouteOverride: false,
      viewAllStocks: true,
      effectiveStockGroups: [],
      hasCustomStockOverride: false,
      forbiddenStockGroups: [],
    };
  }

  const cCode = (currentUser.companyCode || '').trim().toUpperCase();
  const rCode = (currentUser.salesRepCode || currentUser.code || '').trim().toUpperCase();
  const allAccounts = accountsOverride || plasiyerAuthService.getLocalAccounts();
  const matchedAcc = allAccounts.find(
    (a) =>
      (!cCode || a.companyCode.toUpperCase() === cCode) &&
      a.repCode.toUpperCase() === rCode
  );

  const viewAllRoutes = Boolean(matchedAcc?.viewAllRoutes ?? currentUser.viewAllRoutes ?? false);
  const customRoutes = matchedAcc?.allowedRouteRegions ?? currentUser.allowedRouteRegions;
  const erpRoutes = matchedAcc?.erpAssignedRegions ?? currentUser.erpAssignedRegions ?? [];
  const hasCustomRouteOverride = Array.isArray(customRoutes);
  const effectiveRouteRegions = (hasCustomRouteOverride ? customRoutes : erpRoutes)
    .map((r) => normalizeRegionName(r))
    .filter(Boolean);

  const viewAllStocks = Boolean(matchedAcc?.viewAllStocks ?? currentUser.viewAllStocks ?? false);
  const customStocks = matchedAcc?.allowedStockGroups ?? currentUser.allowedStockGroups;
  const erpStocks = matchedAcc?.erpAssignedStockGroups ?? currentUser.erpAssignedStockGroups ?? [];
  const hasCustomStockOverride = Array.isArray(customStocks);
  const effectiveStockGroups = (hasCustomStockOverride ? customStocks : erpStocks)
    .map((g) => String(g || '').trim())
    .filter(Boolean);

  const forbiddenStockGroups = (
    matchedAcc?.erpForbiddenStockGroups ??
    currentUser.erpForbiddenStockGroups ??
    []
  )
    .map((g) => String(g || '').trim())
    .filter(Boolean);

  return {
    isRestrictedPlasiyer: true,
    repCode: rCode,
    locationName: (matchedAcc?.locationName || currentUser.locationName || '').trim(),
    viewAllRoutes,
    effectiveRouteRegions,
    hasCustomRouteOverride,
    viewAllStocks,
    effectiveStockGroups,
    hasCustomStockOverride,
    forbiddenStockGroups,
  };
}

export function filterCustomersForPlasiyer(
  customers: Customer[],
  currentUser: AuthUser | null,
  isCompanyManager: boolean,
  accountsOverride?: PlasiyerAccount[]
): Customer[] {
  const scope = resolveActivePlasiyerScope(currentUser, isCompanyManager, accountsOverride);
  if (!scope.isRestrictedPlasiyer || scope.viewAllRoutes) {
    return customers;
  }

  const repCode = scope.repCode;
  const regionSet = new Set(scope.effectiveRouteRegions.map((r) => normalizeRegionName(r)));

  // Yönetici Ayarlardan özel Rut Bölgesi listesi belirlediyse doğrudan o bölgeleri uygula
  if (scope.hasCustomRouteOverride) {
    return customers.filter((c) => {
      const reg = getCustomerRegionCode(c);
      return regionSet.has(reg);
    });
  }

  // Varsayılan ERP12 Modu: Plasiyer sadece kendine tanımlı Rut bölgelerini ve kendi carilerini görür
  const hasAnyErpMetadata =
    regionSet.size > 0 ||
    customers.some(
      (c) =>
        (Array.isArray(c.assignedRepCodes) && c.assignedRepCodes.length > 0) ||
        (c.salesRepCode && c.salesRepCode !== '0')
    );

  if (!hasAnyErpMetadata) {
    return customers;
  }

  return customers.filter((c) => {
    const isDirectRep =
      (Array.isArray(c.assignedRepCodes) &&
        c.assignedRepCodes.some((r) => r.trim().toUpperCase() === repCode)) ||
      (c.salesRepCode || '').trim().toUpperCase() === repCode;
    if (isDirectRep) return true;

    const reg = getCustomerRegionCode(c);
    if (reg && reg !== 'GENEL' && regionSet.has(reg)) {
      return true;
    }
    return false;
  });
}

export function filterProductsForPlasiyer(
  products: Product[],
  currentUser: AuthUser | null,
  isCompanyManager: boolean,
  accountsOverride?: PlasiyerAccount[]
): Product[] {
  const scope = resolveActivePlasiyerScope(currentUser, isCompanyManager, accountsOverride);
  if (!scope.isRestrictedPlasiyer || scope.viewAllStocks) {
    return products;
  }

  const repCode = scope.repCode;
  const locName = scope.locationName;
  const locUpper = locName.toLocaleUpperCase('tr-TR');

  const forbiddenGroupSet = new Set(
    scope.forbiddenStockGroups.map((g) => g.toLocaleUpperCase('tr-TR'))
  );
  const allowedGroupSet =
    scope.effectiveStockGroups.length > 0
      ? new Set(scope.effectiveStockGroups.map((g) => g.toLocaleUpperCase('tr-TR')))
      : null;

  const hasExplicitRouteStocks = products.some(
    (p) =>
      Array.isArray(p.routeRepCodes) &&
      p.routeRepCodes.some((r) => r.trim().toUpperCase() === repCode)
  );

  const hasLocationTaggedProducts =
    Boolean(locUpper) &&
    products.some(
      (p) =>
        Array.isArray(p.locationNames) &&
        p.locationNames.some((l) => l.trim().toLocaleUpperCase('tr-TR') === locUpper)
    );

  const filtered: Product[] = [];

  for (const p of products) {
    const catUpper = (p.category || '').trim().toLocaleUpperCase('tr-TR');

    // 1. ERP12 Personel Tanıtım Kartı -> Perakende satılamaz ürünler / gruplar her zaman gizlenir
    if (
      Array.isArray(p.forbiddenRepCodes) &&
      p.forbiddenRepCodes.some((r) => r.trim().toUpperCase() === repCode)
    ) {
      continue;
    }
    if (forbiddenGroupSet.has(catUpper)) {
      continue;
    }

    // 2. Stok Grubu filtresi (Yöneticinin seçtiği veya ERP12'den plasiyere tanımlı gruplar)
    if (allowedGroupSet && !allowedGroupSet.has(catUpper)) {
      continue;
    }
    if (scope.hasCustomStockOverride && (!allowedGroupSet || allowedGroupSet.size === 0)) {
      continue;
    }

    // 3. CARI_ROOT_STOK tablosunda plasiyere özel rut stokları tanımlıysa
    if (hasExplicitRouteStocks) {
      const inRoute =
        Array.isArray(p.routeRepCodes) &&
        p.routeRepCodes.some((r) => r.trim().toUpperCase() === repCode);
      if (!inRoute) continue;
    } else if (hasLocationTaggedProducts && !scope.hasCustomStockOverride) {
      // 4. Varsayılan ERP12 Lokasyon Stoku Filtresi (Örn: Plasiyerin Lokasyonu = "25 ADY 050")
      const inLocation =
        Array.isArray(p.locationNames) &&
        p.locationNames.some((l) => l.trim().toLocaleUpperCase('tr-TR') === locUpper);
      if (!inLocation) continue;
    }

    // Plasiyere tanımlı lokasyon varsa o lokasyondaki stok miktarını göster
    if (hasLocationTaggedProducts && p.locationStocks) {
      const matchedLocKey = Object.keys(p.locationStocks).find(
        (k) => k.trim().toLocaleUpperCase('tr-TR') === locUpper
      );
      if (matchedLocKey !== undefined) {
        filtered.push({
          ...p,
          stockQuantity: Number(p.locationStocks[matchedLocKey] ?? p.stockQuantity ?? 0),
        });
        continue;
      }
    }

    filtered.push(p);
  }

  return filtered;
}
