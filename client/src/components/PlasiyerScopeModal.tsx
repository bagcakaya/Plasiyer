import React, { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  X,
  MapPin,
  Package,
  ShieldCheck,
  Check,
  RotateCcw,
  Search,
  Lock,
  Globe,
  Truck,
  CheckCircle2,
} from 'lucide-react';
import { db } from '../db';
import type { Customer, PlasiyerAccount, Product, ServerConfig } from '../types';
import {
  formatFullName,
  plasiyerAuthService,
} from '../services/plasiyerAuthService';
import { apiService, isDemoMode } from '../services/apiService';
import { getCustomerRegionCode, normalizeRegionName } from '../utils/plasiyerScope';

interface PlasiyerScopeModalProps {
  account: PlasiyerAccount | null;
  isOpen: boolean;
  onClose: () => void;
  serverConfig?: ServerConfig;
  onSaved: (updatedAccounts: PlasiyerAccount[]) => void;
}

export const PlasiyerScopeModal: React.FC<PlasiyerScopeModalProps> = ({
  account,
  isOpen,
  onClose,
  serverConfig,
  onSaved,
}) => {
  const localCustomers = useLiveQuery(() => db.customers.toArray(), []) || [];
  const localProducts = useLiveQuery(() => db.products.toArray(), []) || [];

  const [remoteCustomers, setRemoteCustomers] = useState<Customer[]>([]);
  const [remoteProducts, setRemoteProducts] = useState<Product[]>([]);
  const [loadingRemote, setLoadingRemote] = useState(false);

  const [viewAllRoutes, setViewAllRoutes] = useState<boolean>(false);
  const [useErpDefaultRoutes, setUseErpDefaultRoutes] = useState<boolean>(true);
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [regionSearch, setRegionSearch] = useState('');

  const [viewAllStocks, setViewAllStocks] = useState<boolean>(false);
  const [useErpDefaultStocks, setUseErpDefaultStocks] = useState<boolean>(true);
  const [selectedStockGroups, setSelectedStockGroups] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const resolvedConfig = useMemo<ServerConfig | undefined>(() => {
    if (!account) return serverConfig;
    return (
      plasiyerAuthService.findServerConfigByCompanyCode(account.companyCode) ||
      serverConfig
    );
  }, [account, serverConfig]);

  useEffect(() => {
    if (!isOpen || !account) return;
    setSavedSuccess(false);
    setRegionSearch('');

    setViewAllRoutes(Boolean(account.viewAllRoutes));
    const hasCustomRoutes = Array.isArray(account.allowedRouteRegions);
    setUseErpDefaultRoutes(!hasCustomRoutes);
    setSelectedRegions(
      (hasCustomRoutes ? account.allowedRouteRegions! : account.erpAssignedRegions || [])
        .map((r) => normalizeRegionName(r))
        .filter(Boolean)
    );

    setViewAllStocks(Boolean(account.viewAllStocks));
    const hasCustomStocks = Array.isArray(account.allowedStockGroups);
    setUseErpDefaultStocks(!hasCustomStocks);
    setSelectedStockGroups(
      (hasCustomStocks ? account.allowedStockGroups! : account.erpAssignedStockGroups || [])
        .map((g) => String(g || '').trim())
        .filter(Boolean)
    );

    // Eğer yerel IndexedDB'de cari/stok yoksa veya başka firma düzenleniyorsa canlı API'den çek
    if (resolvedConfig && !isDemoMode(resolvedConfig)) {
      setLoadingRemote(true);
      Promise.all([
        apiService.fetchCustomers(resolvedConfig, account.repCode).catch(() => []),
        apiService.fetchProducts(resolvedConfig).catch(() => []),
      ])
        .then(([custs, prods]) => {
          if (Array.isArray(custs) && custs.length > 0) setRemoteCustomers(custs);
          if (Array.isArray(prods) && prods.length > 0) setRemoteProducts(prods);
        })
        .finally(() => setLoadingRemote(false));
    }
  }, [isOpen, account, resolvedConfig]);

  const effectiveCustomers = remoteCustomers.length > 0 ? remoteCustomers : localCustomers;
  const effectiveProducts = remoteProducts.length > 0 ? remoteProducts : localProducts;

  const erpDefaultRegions = useMemo(() => {
    if (!account) return [];
    const set = new Set<string>(
      (account.erpAssignedRegions || []).map((r) => normalizeRegionName(r)).filter(Boolean)
    );
    const repCode = account.repCode.trim().toUpperCase();
    for (const c of effectiveCustomers) {
      const isDirect =
        (Array.isArray(c.assignedRepCodes) &&
          c.assignedRepCodes.some((r) => r.trim().toUpperCase() === repCode)) ||
        (c.salesRepCode || '').trim().toUpperCase() === repCode;
      if (isDirect) {
        const reg = getCustomerRegionCode(c);
        if (reg && reg !== 'GENEL') set.add(reg);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'tr-TR'));
  }, [account, effectiveCustomers]);

  const allRegions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of erpDefaultRegions) {
      counts.set(r, 0);
    }
    for (const c of effectiveCustomers) {
      const reg = getCustomerRegionCode(c);
      if (!reg || reg === 'GENEL') continue;
      counts.set(reg, (counts.get(reg) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => a[0].localeCompare(b[0], 'tr-TR'))
      .map(([name, count]) => ({
        name,
        count,
        isErpDefault: erpDefaultRegions.includes(name),
      }));
  }, [effectiveCustomers, erpDefaultRegions]);

  const filteredRegions = useMemo(() => {
    const q = normalizeRegionName(regionSearch);
    if (!q) return allRegions;
    return allRegions.filter((r) => r.name.includes(q));
  }, [allRegions, regionSearch]);

  const erpDefaultStockGroups = useMemo(() => {
    if (!account) return [];
    if (Array.isArray(account.erpAssignedStockGroups) && account.erpAssignedStockGroups.length > 0) {
      return account.erpAssignedStockGroups;
    }
    const locUpper = (account.locationName || '').trim().toLocaleUpperCase('tr-TR');
    const set = new Set<string>();
    for (const p of effectiveProducts) {
      const cat = (p.category || '').trim();
      if (!cat || cat.toUpperCase().includes('MASRAF')) continue;
      if (
        locUpper &&
        Array.isArray(p.locationNames) &&
        p.locationNames.some((l) => l.trim().toLocaleUpperCase('tr-TR') === locUpper)
      ) {
        set.add(cat);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'tr-TR'));
  }, [account, effectiveProducts]);

  const allStockGroups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of erpDefaultStockGroups) {
      counts.set(g, 0);
    }
    for (const p of effectiveProducts) {
      const cat = (p.category || '').trim();
      if (!cat || cat.toUpperCase().includes('MASRAF')) continue;
      counts.set(cat, (counts.get(cat) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => a[0].localeCompare(b[0], 'tr-TR'))
      .map(([name, count]) => ({
        name,
        count,
        isErpDefault: erpDefaultStockGroups.includes(name),
      }));
  }, [effectiveProducts, erpDefaultStockGroups]);

  if (!isOpen || !account) return null;

  const fullName = formatFullName(account.firstName, account.lastName) || account.repCode;
  const activeRegionList = useErpDefaultRoutes ? erpDefaultRegions : selectedRegions;
  const activeStockGroupList = useErpDefaultStocks ? erpDefaultStockGroups : selectedStockGroups;

  const handleToggleRegion = (regName: string) => {
    const base = useErpDefaultRoutes ? erpDefaultRegions : selectedRegions;
    setUseErpDefaultRoutes(false);
    if (base.includes(regName)) {
      setSelectedRegions(base.filter((r) => r !== regName));
    } else {
      setSelectedRegions([...base, regName]);
    }
  };

  const handleToggleStockGroup = (groupName: string) => {
    const base = useErpDefaultStocks ? erpDefaultStockGroups : selectedStockGroups;
    setUseErpDefaultStocks(false);
    if (base.includes(groupName)) {
      setSelectedStockGroups(base.filter((g) => g !== groupName));
    } else {
      setSelectedStockGroups([...base, groupName]);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await plasiyerAuthService.upsertAccount(
        {
          companyCode: account.companyCode,
          repCode: account.repCode,
          firstName: account.firstName,
          lastName: account.lastName,
          password: account.password,
          accountRole: account.accountRole || 'plasiyer',
          viewAllRoutes,
          allowedRouteRegions: viewAllRoutes
            ? undefined
            : useErpDefaultRoutes
            ? undefined
            : selectedRegions,
          viewAllStocks,
          allowedStockGroups: viewAllStocks
            ? undefined
            : useErpDefaultStocks
            ? undefined
            : selectedStockGroups,
        },
        resolvedConfig
      );

      const updated = plasiyerAuthService.getLocalAccounts();
      onSaved(updated);
      setSavedSuccess(true);
      setTimeout(() => {
        onClose();
      }, 650);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-xs animate-fadeIn"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl max-h-[92dvh] sm:max-h-[88vh] flex flex-col bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden text-xs text-slate-900 dark:text-slate-100"
      >
        {/* Üst Başlık */}
        <div className="shrink-0 px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/90 dark:bg-slate-950/60">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-blue-600/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white truncate">
                  Rut Bölgesi &amp; Stok Yetkileri
                </h3>
                <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                  {account.repCode} — {fullName}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                Varsayılan olarak plasiyer sadece kendine tanımlı Rut bölgelerini ve Stokları görür
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* İçerik */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-5">
          {/* BÖLÜM 1: RUT BÖLGELERİ YETKİSİ */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3 bg-slate-50/50 dark:bg-slate-950/40">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">
                  1. Rut Bölgeleri &amp; Cari Görünüm Yetkisi
                </h4>
              </div>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                  !viewAllRoutes
                    ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300'
                    : 'bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300'
                }`}
              >
                {!viewAllRoutes ? 'Varsayılan: Sadece Kendi Rutları' : 'Tüm Rut Bölgeleri Açık'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setViewAllRoutes(false)}
                className={`p-3 rounded-xl border text-left transition flex items-start gap-2.5 ${
                  !viewAllRoutes
                    ? 'bg-blue-50 dark:bg-blue-950/50 border-blue-500 ring-2 ring-blue-500/20'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                }`}
              >
                <Lock
                  className={`w-4 h-4 shrink-0 mt-0.5 ${
                    !viewAllRoutes ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'
                  }`}
                />
                <div>
                  <div className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span>Sadece Kendine Tanımlı Rutlar</span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-black">
                      VARSAYILAN
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                    Plasiyer sadece kendine tanımlı Rut bölgelerindeki carileri görebilir.
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setViewAllRoutes(true)}
                className={`p-3 rounded-xl border text-left transition flex items-start gap-2.5 ${
                  viewAllRoutes
                    ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-500 ring-2 ring-amber-500/20'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                }`}
              >
                <Globe
                  className={`w-4 h-4 shrink-0 mt-0.5 ${
                    viewAllRoutes ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'
                  }`}
                />
                <div>
                  <div className="font-extrabold text-slate-900 dark:text-white">
                    Tüm Rut Bölgelerini Tanımla
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                    Plasiyer firmadaki tüm Rut bölgelerini ve tüm carileri görebilir.
                  </p>
                </div>
              </button>
            </div>

            {!viewAllRoutes && (
              <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-[11px] text-slate-600 dark:text-slate-300">
                    Plasiyerin Görebileceği Rut Bölgeleri ({activeRegionList.length} Bölge Seçili)
                  </span>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        setUseErpDefaultRoutes(true);
                        setSelectedRegions(erpDefaultRegions);
                      }}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition flex items-center gap-1 ${
                        useErpDefaultRoutes
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>ERP12 Varsayılanı ({erpDefaultRegions.length})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setUseErpDefaultRoutes(false);
                        setSelectedRegions(allRegions.map((r) => r.name));
                      }}
                      className="px-2 py-1 rounded-lg text-[10px] font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50"
                    >
                      Tümünü İşaretle ({allRegions.length})
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setUseErpDefaultRoutes(false);
                        setSelectedRegions([]);
                      }}
                      className="px-2 py-1 rounded-lg text-[10px] font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-rose-600 dark:text-rose-400"
                    >
                      Temizle
                    </button>
                  </div>
                </div>

                {allRegions.length > 8 && (
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={regionSearch}
                      onChange={(e) => setRegionSearch(e.target.value)}
                      placeholder="Rut bölgesi ara (Örn: KARS, ERZ-OLT, YAKUTİYE)..."
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:border-blue-500"
                    />
                  </div>
                )}

                {loadingRemote && allRegions.length === 0 ? (
                  <div className="p-3 text-center text-slate-400">
                    ERP12 Rut bölgeleri yükleniyor...
                  </div>
                ) : filteredRegions.length === 0 ? (
                  <div className="p-3 text-center text-slate-400">
                    Rut bölgesi bulunamadı.
                  </div>
                ) : (
                  <div className="max-h-44 overflow-y-auto p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-wrap gap-1.5">
                    {filteredRegions.map((reg) => {
                      const isChecked = activeRegionList.includes(reg.name);
                      return (
                        <button
                          key={reg.name}
                          type="button"
                          onClick={() => handleToggleRegion(reg.name)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition flex items-center gap-1 ${
                            isChecked
                              ? 'bg-blue-600 border-blue-600 text-white shadow-2xs'
                              : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-blue-400'
                          }`}
                        >
                          {isChecked && <Check className="w-3 h-3 shrink-0" />}
                          <span>{reg.name}</span>
                          {reg.count > 0 && (
                            <span
                              className={`text-[10px] px-1 rounded ${
                                isChecked
                                  ? 'bg-white/20 text-white'
                                  : 'bg-slate-200/70 dark:bg-slate-700 text-slate-500 dark:text-slate-300'
                              }`}
                            >
                              {reg.count}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* BÖLÜM 2: STOK & LOKASYON YETKİSİ */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3 bg-slate-50/50 dark:bg-slate-950/40">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">
                  2. Stok &amp; Lokasyon Görünüm Yetkisi
                </h4>
              </div>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                  !viewAllStocks
                    ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300'
                    : 'bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300'
                }`}
              >
                {!viewAllStocks ? 'Varsayılan: Sadece Kendi Stokları' : 'Tüm Stoklar Açık'}
              </span>
            </div>

            {account.locationName && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200/70 dark:border-blue-800/60 text-[11px]">
                <Truck className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <span>
                  ERP12 Personel Kartında Tanımlı Lokasyon:{' '}
                  <strong className="font-mono text-blue-700 dark:text-blue-300">
                    {account.locationName}
                  </strong>
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setViewAllStocks(false)}
                className={`p-3 rounded-xl border text-left transition flex items-start gap-2.5 ${
                  !viewAllStocks
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 ring-2 ring-emerald-500/20'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                }`}
              >
                <Lock
                  className={`w-4 h-4 shrink-0 mt-0.5 ${
                    !viewAllStocks ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
                  }`}
                />
                <div>
                  <div className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span>Sadece Kendine Tanımlı Stoklar</span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-black">
                      VARSAYILAN
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                    Plasiyer sadece kendi lokasyonuna ({account.locationName || 'Tanımlı Lokasyon'}) ve
                    yetkili stok gruplarına ait ürünleri görür.
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setViewAllStocks(true)}
                className={`p-3 rounded-xl border text-left transition flex items-start gap-2.5 ${
                  viewAllStocks
                    ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-500 ring-2 ring-amber-500/20'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                }`}
              >
                <Globe
                  className={`w-4 h-4 shrink-0 mt-0.5 ${
                    viewAllStocks ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'
                  }`}
                />
                <div>
                  <div className="font-extrabold text-slate-900 dark:text-white">
                    Tüm Stokları Tanımla
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                    Plasiyer merkez ve tüm lokasyonlardaki bütün stok kartlarını görebilir.
                  </p>
                </div>
              </button>
            </div>

            {!viewAllStocks && allStockGroups.length > 0 && (
              <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-[11px] text-slate-600 dark:text-slate-300">
                    Plasiyerin Görebileceği Stok Grupları ({activeStockGroupList.length} Grup Seçili)
                  </span>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        setUseErpDefaultStocks(true);
                        setSelectedStockGroups(erpDefaultStockGroups);
                      }}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition flex items-center gap-1 ${
                        useErpDefaultStocks
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>ERP12 Varsayılanı ({erpDefaultStockGroups.length})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setUseErpDefaultStocks(false);
                        setSelectedStockGroups(allStockGroups.map((g) => g.name));
                      }}
                      className="px-2 py-1 rounded-lg text-[10px] font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-blue-600 dark:text-blue-400"
                    >
                      Tüm Grupları Seç ({allStockGroups.length})
                    </button>
                  </div>
                </div>

                <div className="max-h-40 overflow-y-auto p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-wrap gap-1.5">
                  {allStockGroups.map((grp) => {
                    const isChecked = activeStockGroupList.includes(grp.name);
                    return (
                      <button
                        key={grp.name}
                        type="button"
                        onClick={() => handleToggleStockGroup(grp.name)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition flex items-center gap-1 ${
                          isChecked
                            ? 'bg-emerald-600 border-emerald-600 text-white shadow-2xs'
                            : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-emerald-400'
                        }`}
                      >
                        {isChecked && <Check className="w-3 h-3 shrink-0" />}
                        <span>{grp.name}</span>
                        {grp.count > 0 && (
                          <span
                            className={`text-[10px] px-1 rounded ${
                              isChecked
                                ? 'bg-white/20 text-white'
                                : 'bg-slate-200/70 dark:bg-slate-700 text-slate-500 dark:text-slate-300'
                            }`}
                          >
                            {grp.count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Alt Aksiyon Barı */}
        <div className="shrink-0 px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/70 flex items-center justify-between gap-3">
          {savedSuccess ? (
            <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-extrabold text-xs">
              <CheckCircle2 className="w-4 h-4" />
              <span>Plasiyer Rut &amp; Stok yetkileri kaydedildi!</span>
            </div>
          ) : (
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Değişiklikler kaydedildiğinde plasiyerin cihazına otomatik uygulanır.
            </span>
          )}

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl bg-slate-200/80 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition"
            >
              Kapat
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs shadow-md shadow-blue-600/20 flex items-center gap-1.5 transition active:scale-95 disabled:opacity-60"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{saving ? 'Kaydediliyor...' : 'Yetkileri Kaydet'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
