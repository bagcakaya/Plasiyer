import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useApp } from '../context/AppContext';
import type { VisitRecord, Customer, NoOrderReason, GeoLocationState } from '../types';
import { 
  Navigation, Calendar, CheckCircle2, Clock, Play, Check, 
  MapPin, Phone, ShoppingCart, Banknote, FileText, AlertTriangle, 
  X, RotateCcw, TrendingUp, Compass, Map as MapIcon, List, 
  Sparkles, ShieldCheck, ShieldAlert
} from 'lucide-react';
import { CustomerStatementModal } from '../components/CustomerStatementModal';
import { RouteMap } from '../components/RouteMap';
import { 
  checkGeofence, 
  formatDistance, 
  getNavigationUrl, 
  sortVisitsByProximity, 
  SIMULATED_LOCATIONS 
} from '../services/geoService';

const DAYS = [
  { id: 1, name: 'Pazartesi', short: 'Pzt' },
  { id: 2, name: 'Salı', short: 'Sal' },
  { id: 3, name: 'Çarşamba', short: 'Çar' },
  { id: 4, name: 'Perşembe', short: 'Per' },
  { id: 5, name: 'Cuma', short: 'Cum' },
  { id: 6, name: 'Cumartesi', short: 'Cmt' },
];

const REASON_LABELS: Record<NoOrderReason, string> = {
  stok_yeterli: 'Mevcut Stok Yeterli',
  yetkili_yoktu: 'Yetkili / Karar Verici Yoktu',
  fiyat_yuksek: 'Fiyatları Yüksek Buldu',
  odeme_gecikmesi: 'Borç / Bakiye Geciktiği İçin Sipariş Açılmadı',
  dukkan_kapali: 'İş Yeri / Dükkan Kapalıydı',
  rakip_urun_almis: 'Rakip Firmadan Mal Alınmış',
  diger: 'Diğer (Özel Açıklama)',
};

export const RoutePlanPage: React.FC = () => {
  const { 
    salesRep, 
    selectCustomer, 
    setActiveTab, 
    openCollectionModal, 
    openReturnModal,
    openDailyReportModal,
    serverConfig 
  } = useApp();

  const today = new Date();
  const currentDayOfWeek = today.getDay() === 0 ? 1 : Math.min(today.getDay(), 6);
  const [selectedDay, setSelectedDay] = useState<number>(currentDayOfWeek);
  
  // AŞAMA 9: GPS & Harita State'leri
  const [viewMode, setViewMode] = useState<'split' | 'map' | 'list'>('split');
  const [selectedVisitId, setSelectedVisitId] = useState<number | null>(null);
  const [currentLocation, setCurrentLocation] = useState<GeoLocationState>({
    latitude: 40.9880,
    longitude: 29.0260,
    accuracy: 12,
    isSimulated: false,
  });
  const [isGpsLive, setIsGpsLive] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [simulationIndex, setSimulationIndex] = useState<string>('real');
  const [isOptimizing, setIsOptimizing] = useState(false);

  // Modallar
  const [statementCustomer, setStatementCustomer] = useState<Customer | null>(null);
  const [noOrderModalVisit, setNoOrderModalVisit] = useState<VisitRecord | null>(null);
  const [selectedReason, setSelectedReason] = useState<NoOrderReason>('stok_yeterli');
  const [reasonNotes, setReasonNotes] = useState('');
  
  // Geofence İhlal Uyarısı Modalı
  const [geofenceWarning, setGeofenceWarning] = useState<{
    visit: VisitRecord;
    distance: number;
    radius: number;
    customerName: string;
  } | null>(null);

  // Gerçek Cihaz GPS Takibi
  useEffect(() => {
    if (!('geolocation' in navigator) || simulationIndex !== 'real') {
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setIsGpsLive(true);
        setGpsError(null);
        setCurrentLocation({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
          isSimulated: false,
        });
      },
      (err) => {
        setIsGpsLive(false);
        setGpsError('GPS sinyali alınamadı: ' + err.message);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [simulationIndex]);

  // Simülasyon Konumu Seçimi
  const handleSelectSimulation = (val: string) => {
    setSimulationIndex(val);
    if (val === 'real') {
      // Cihaz GPS'i
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setCurrentLocation({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              isSimulated: false,
            });
            setIsGpsLive(true);
          },
          () => {
            // Hata olursa varsayılan Kadıköy lokasyonu
            setCurrentLocation({
              latitude: 40.9880,
              longitude: 29.0260,
              accuracy: 15,
              isSimulated: true,
            });
          }
        );
      }
    } else {
      const idx = parseInt(val, 10);
      const loc = SIMULATED_LOCATIONS[idx];
      if (loc) {
        setCurrentLocation({
          latitude: loc.latitude,
          longitude: loc.longitude,
          accuracy: 5,
          isSimulated: true,
        });
        setIsGpsLive(false);
      }
    }
  };

  // Canlı veriler (Dexie)
  const visits = useLiveQuery(
    () => db.visits.where('dayOfWeek').equals(selectedDay).toArray(),
    [selectedDay]
  ) || [];

  const customers = useLiveQuery(() => db.customers.toArray(), []) || [];
  const customerMap = new Map<string, Customer>();
  customers.forEach(c => customerMap.set(c.id, c));

  // AŞAMA 9: Geofence Kontrollü Ziyaret Başlatma (Check-in)
  const handleCheckIn = async (visit: VisitRecord, bypassGeofence = false) => {
    if (!visit.id) return;
    const cust = customerMap.get(visit.customerId);
    const radius = cust?.geofenceRadiusMeters || 150;

    let distance = 0;
    let isWithin = true;
    let status: 'inside' | 'outside' | 'unknown' = 'unknown';

    if (cust && cust.latitude && cust.longitude) {
      const gf = checkGeofence(
        currentLocation.latitude,
        currentLocation.longitude,
        cust.latitude,
        cust.longitude,
        radius
      );
      distance = gf.distanceMeters;
      isWithin = gf.isWithin;
      status = gf.status;
    }

    // Eğer müşteri alanının dışındaysa ve henüz onaylanmamışsa uyarı modalı çıkar
    if (!isWithin && !bypassGeofence) {
      setGeofenceWarning({
        visit,
        distance,
        radius,
        customerName: cust?.name || visit.customerName,
      });
      return;
    }

    const nowIso = new Date().toISOString();
    await db.visits.update(visit.id, {
      status: 'in_progress',
      checkInTime: nowIso,
      checkInLatitude: currentLocation.latitude,
      checkInLongitude: currentLocation.longitude,
      distanceMeters: distance,
      isWithinGeofence: isWithin,
      geofenceStatus: status,
    });

    setGeofenceWarning(null);
    setSelectedVisitId(visit.id);
  };

  // Sipariş Yazma Sayfasına Yönlendir
  const handleStartOrder = (visit: VisitRecord) => {
    const cust = customerMap.get(visit.customerId);
    if (cust) {
      selectCustomer(cust);
      setActiveTab('catalog');
    }
  };

  // Tahsilat Al Modalını Aç
  const handleOpenCollection = (visit: VisitRecord) => {
    const cust = customerMap.get(visit.customerId);
    if (cust) {
      openCollectionModal(cust);
    }
  };

  // İade Al Modalını Aç
  const handleOpenReturn = (visit: VisitRecord) => {
    const cust = customerMap.get(visit.customerId);
    if (cust) {
      openReturnModal(cust);
    }
  };

  // Ziyareti Bitir (Check-out)
  const handleFinishVisit = async (visit: VisitRecord) => {
    if (!visit.id) return;
    if (visit.orderCreated || visit.collectionCreated) {
      const nowIso = new Date().toISOString();
      const duration = visit.checkInTime 
        ? Math.round((new Date(nowIso).getTime() - new Date(visit.checkInTime).getTime()) / 60000)
        : 10;

      await db.visits.update(visit.id, {
        status: 'completed',
        checkOutTime: nowIso,
        durationMinutes: duration,
      });
    } else {
      setNoOrderModalVisit(visit);
      setSelectedReason('stok_yeterli');
      setReasonNotes('');
    }
  };

  // Siparişsiz Ziyareti Kaydet
  const handleSaveNoOrderVisit = async () => {
    if (!noOrderModalVisit?.id) return;
    const nowIso = new Date().toISOString();
    const duration = noOrderModalVisit.checkInTime 
      ? Math.round((new Date(nowIso).getTime() - new Date(noOrderModalVisit.checkInTime).getTime()) / 60000)
      : 5;

    await db.visits.update(noOrderModalVisit.id, {
      status: 'skipped',
      checkOutTime: nowIso,
      durationMinutes: duration,
      noOrderReason: selectedReason,
      noOrderNotes: reasonNotes,
    });

    setNoOrderModalVisit(null);
  };

  // AŞAMA 9: En Yakına Göre Rotayı Akıllı Sırala
  const handleOptimizeRoute = async () => {
    if (visits.length === 0) return;
    setIsOptimizing(true);
    try {
      const sorted = sortVisitsByProximity(
        visits,
        customerMap,
        currentLocation.latitude,
        currentLocation.longitude
      );

      // Veritabanında sıralamayı güncelle
      for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].id) {
          await db.visits.update(sorted[i].id!, { routeOrder: i + 1 });
        }
      }
    } finally {
      setIsOptimizing(false);
    }
  };

  // Rut İstatistikleri
  const totalVisits = visits.length;
  const completedVisits = visits.filter(v => v.status === 'completed' || v.status === 'skipped').length;
  const inProgressVisits = visits.filter(v => v.status === 'in_progress').length;
  const pendingVisits = visits.filter(v => v.status === 'pending').length;

  return (
    <div className="p-3 md:p-6 pb-24 space-y-4 max-w-7xl mx-auto text-slate-900 dark:text-slate-100 animate-fadeIn w-full">
      {/* Üst Başlık & Plasiyer Rut Özeti */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-950 text-white rounded-3xl p-5 shadow-sm border border-blue-800/60 dark:border-slate-800 space-y-3">
        <div className="flex flex-wrap justify-between items-center gap-2 text-xs text-blue-200">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold">
              <Compass className="w-4 h-4 animate-spin-slow" />
            </div>
            <div>
              <span className="font-bold text-white text-sm block">GPS & Canlı Saha Rotası</span>
              <span className="text-[10px] text-blue-300">Geofence Konum Doğrulama & Rota İlerlemesi</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={openDailyReportModal}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 px-2.5 py-1 rounded-xl text-xs font-black flex items-center gap-1 shadow-sm transition active:scale-95"
              title="Günün Kapanış ve Z Raporunu İncele"
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Z Raporu</span>
            </button>
            <span className="bg-blue-800/80 px-2.5 py-1 rounded-full text-xs font-bold font-mono">
              {salesRep.code} &bull; {salesRep.name}
            </span>
          </div>
        </div>

        {/* İlerleme ve İstatistikler */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-blue-800/40 text-xs">
          <div>
            <span className="text-[10px] text-blue-300 block">Tamamlanan</span>
            <span className="text-lg font-black text-white">{completedVisits} / {totalVisits}</span>
          </div>
          <div>
            <span className="text-[10px] text-blue-300 block">Kalan Ziyaret</span>
            <span className="text-lg font-black text-amber-400">{pendingVisits + inProgressVisits}</span>
          </div>
          <div>
            <span className="text-[10px] text-blue-300 block">Tamamlanma Oranı</span>
            <span className="text-lg font-black text-emerald-400">
              %{totalVisits > 0 ? Math.round((completedVisits / totalVisits) * 100) : 0}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-blue-300 block">GPS Durumu</span>
            <span className="text-xs font-bold text-white flex items-center gap-1 mt-1">
              <span className={`w-2 h-2 rounded-full ${isGpsLive ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'}`}></span>
              <span>{isGpsLive ? 'Canlı GPS' : 'Simüle Konum'}</span>
            </span>
          </div>
        </div>

        {/* İlerleme Çubuğu */}
        <div className="w-full bg-blue-950/80 rounded-full h-2 overflow-hidden border border-blue-800/40">
          <div 
            className="bg-gradient-to-r from-emerald-400 to-teal-300 h-full rounded-full transition-all duration-500 shadow-sm"
            style={{ width: `${totalVisits > 0 ? (completedVisits / totalVisits) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* AŞAMA 9: GPS Araç Çubuğu (Simülasyon, Rota Optimizasyonu & Görünüm Seçici) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 shadow-xs space-y-2.5 text-xs">
        {/* Satır 1: Konum / Simülasyon Seçici */}
        <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-xl px-2.5 py-1.5">
          <MapPin className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
          <select
            value={simulationIndex}
            onChange={(e) => handleSelectSimulation(e.target.value)}
            className="w-full bg-transparent text-slate-800 dark:text-slate-200 text-xs font-semibold focus:outline-none cursor-pointer truncate"
          >
            <option value="real">📡 Gerçek Cihaz GPS Konumu (Canlı)</option>
            {SIMULATED_LOCATIONS.map((loc, idx) => (
              <option key={idx} value={idx}>
                🎯 {loc.name}
              </option>
            ))}
          </select>
        </div>

        {/* Satır 2: Optimizasyon Butonu & Görünüm Segment Kontrolü */}
        <div className="flex items-center justify-between gap-2">
          {/* Rotayı Optimize Et */}
          <button
            onClick={handleOptimizeRoute}
            disabled={isOptimizing || visits.length === 0}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold py-2 px-3 rounded-xl transition active:scale-95 flex items-center justify-center gap-1.5 shadow-xs truncate"
            title="Mevcut konumunuza en yakın müşteriden başlayarak sıralar"
          >
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{isOptimizing ? 'Sıralanıyor...' : 'Rotayı Optimize Et'}</span>
          </button>

          {/* Görünüm Düğmeleri (Bölünmüş / Harita / Liste) */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl shrink-0 border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setViewMode('split')}
              className={`p-1.5 px-2 rounded-lg transition flex items-center gap-1 text-[11px] font-bold ${
                viewMode === 'split' 
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-xs' 
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
              title="Bölünmüş (Harita + Liste)"
            >
              <Compass className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Böl</span>
            </button>
            <button
              onClick={() => setViewMode('map')}
              className={`p-1.5 px-2 rounded-lg transition flex items-center gap-1 text-[11px] font-bold ${
                viewMode === 'map' 
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-xs' 
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
              title="Yalnızca Harita"
            >
              <MapIcon className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Harita</span>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 px-2 rounded-lg transition flex items-center gap-1 text-[11px] font-bold ${
                viewMode === 'list' 
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-xs' 
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
              title="Yalnızca Liste"
            >
              <List className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Liste</span>
            </button>
          </div>
        </div>

        {gpsError && (
          <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-[11px] flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
            <span>{gpsError} (Simülasyon konumundan devam edebilirsiniz)</span>
          </div>
        )}
      </div>

      {/* Gün Seçici Tabs (Pazartesi - Cumartesi) */}
      <div className="grid grid-cols-6 gap-1 bg-slate-200/80 dark:bg-slate-900 p-1.5 rounded-2xl border border-slate-300 dark:border-slate-800 text-xs">
        {DAYS.map((d) => {
          const isSelected = selectedDay === d.id;
          const isToday = currentDayOfWeek === d.id;

          return (
            <button
              key={d.id}
              onClick={() => setSelectedDay(d.id)}
              className={`py-2 px-1 rounded-xl font-bold flex flex-col items-center justify-center transition relative ${
                isSelected
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span className="text-[11px]">{d.short}</span>
              {isToday && (
                <span className={`w-1.5 h-1.5 rounded-full mt-1 ${
                  isSelected ? 'bg-amber-300' : 'bg-blue-500'
                }`} />
              )}
            </button>
          );
        })}
      </div>

      {/* AŞAMA 9: Canlı İnteraktif Harita Alanı */}
      {viewMode !== 'list' && (
        <div className={`transition-all duration-300 ${viewMode === 'map' ? 'h-[65vh]' : 'h-[360px]'}`}>
          <RouteMap
            visits={visits}
            customerMap={customerMap}
            currentLocation={currentLocation}
            selectedVisitId={selectedVisitId}
            onSelectVisit={(v) => setSelectedVisitId(v.id || null)}
            onCheckIn={(v) => handleCheckIn(v)}
            onStartOrder={(v) => handleStartOrder(v)}
          />
        </div>
      )}

      {/* Günlük Ziyaret Listesi */}
      {viewMode !== 'map' && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1">
            <span className="font-bold uppercase tracking-wider text-[11px]">
              {DAYS.find(d => d.id === selectedDay)?.name} Rut Sıralaması
            </span>
            <span>{visits.length} Ziyaret Noktası</span>
          </div>

          {visits.length === 0 ? (
            <div className="py-16 text-center text-slate-400 bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
              <Calendar className="w-10 h-10 mx-auto mb-2 opacity-30 text-blue-500" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Bu gün için planlanmış rut ziyareti bulunmuyor.
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Diğer günleri kontrol edebilir veya cariler sayfasından yeni müşteri seçebilirsiniz.
              </p>
            </div>
          ) : (
            visits.map((visit, idx) => {
              const cust = customerMap.get(visit.customerId);
              const isInProgress = visit.status === 'in_progress';
              const isCompleted = visit.status === 'completed';
              const isSkipped = visit.status === 'skipped';
              const isSelected = selectedVisitId === visit.id;

              // Geofence ve Mesafe Denetimi
              const geofence = checkGeofence(
                currentLocation.latitude,
                currentLocation.longitude,
                cust?.latitude,
                cust?.longitude,
                cust?.geofenceRadiusMeters || 150
              );

              return (
                <div
                  key={visit.id || idx}
                  onClick={() => setSelectedVisitId(visit.id || null)}
                  className={`bg-white dark:bg-slate-900 rounded-2xl p-4 border transition-all shadow-xs cursor-pointer ${
                    isInProgress
                      ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-md shadow-blue-500/10'
                      : isCompleted
                        ? 'border-emerald-500/40 bg-emerald-50/20 dark:bg-emerald-950/10'
                        : isSkipped
                          ? 'border-amber-500/40 bg-amber-50/20 dark:bg-amber-950/10'
                          : isSelected
                            ? 'border-indigo-500 ring-2 ring-indigo-500/20'
                            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                  }`}
                >
                  {/* Kart Üst Bilgisi */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      {/* Sıra Numarası */}
                      <div className={`w-7 h-7 rounded-lg font-bold text-xs flex items-center justify-center shrink-0 ${
                        isInProgress
                          ? 'bg-blue-600 text-white animate-pulse'
                          : isCompleted
                            ? 'bg-emerald-600 text-white'
                            : isSkipped
                              ? 'bg-amber-600 text-white'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}>
                        {isCompleted ? <Check className="w-4 h-4" /> : idx + 1}
                      </div>

                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                            {visit.customerCode}
                          </span>

                          {/* AŞAMA 9: Canlı Geofence ve Mesafe Rozeti */}
                          {cust?.latitude && cust?.longitude && (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 border ${
                              geofence.isWithin
                                ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                                : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                            }`}>
                              {geofence.isWithin ? (
                                <>
                                  <ShieldCheck className="w-3 h-3 text-emerald-600" />
                                  <span>Konumdasınız ({formatDistance(geofence.distanceMeters)})</span>
                                </>
                              ) : (
                                <>
                                  <MapPin className="w-3 h-3 text-slate-400" />
                                  <span>{formatDistance(geofence.distanceMeters)}</span>
                                </>
                              )}
                            </span>
                          )}

                          {/* Durum Rozeti */}
                          {isInProgress && (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-950/70 px-2 py-0.5 rounded-full animate-pulse">
                              <Clock className="w-3 h-3" /> Ziyarette
                            </span>
                          )}
                          {isCompleted && (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/70 px-2 py-0.5 rounded-full">
                              <CheckCircle2 className="w-3 h-3" /> Tamamlandı
                            </span>
                          )}
                          {isSkipped && (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/70 px-2 py-0.5 rounded-full">
                              <AlertTriangle className="w-3 h-3" /> Siparişsiz
                            </span>
                          )}
                        </div>

                        <h3 className="font-bold text-sm text-slate-900 dark:text-white mt-1">
                          {visit.customerName}
                        </h3>

                        <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 shrink-0 text-slate-400" />
                          <span className="truncate">{cust?.address || `${cust?.district || 'Merkez'}, Erzurum`}</span>
                        </p>
                      </div>
                    </div>

                    {/* Bakiye Rozeti */}
                    {cust && (
                      <div className="text-right shrink-0">
                        <div className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500">Bakiye</div>
                        <div className={`text-xs font-black ${
                          cust.balance > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                        }`}>
                          {cust.balance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Geofence Denetim Bilgisi (Ziyaret Edilmişse) */}
                  {visit.isWithinGeofence !== undefined && (
                    <div className="mt-2 px-2.5 py-1 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-[10px] flex items-center justify-between text-slate-500 dark:text-slate-400">
                      <span>Check-in Denetimi:</span>
                      <span className={`font-bold flex items-center gap-1 ${visit.isWithinGeofence ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                        {visit.isWithinGeofence ? '✓ Geofence Alanında Başlatıldı' : `⚠️ Konum Dışı (${formatDistance(visit.distanceMeters)})`}
                      </span>
                    </div>
                  )}

                  {/* Siparişsiz Sebep Açıklaması Varsa Göster */}
                  {isSkipped && visit.noOrderReason && (
                    <div className="mt-2.5 p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-300">
                      <span className="font-bold">Ziyaret Notu: </span>
                      <span>{REASON_LABELS[visit.noOrderReason] || visit.noOrderReason}</span>
                      {visit.noOrderNotes && <p className="text-[11px] mt-0.5 text-slate-600 dark:text-slate-400">"{visit.noOrderNotes}"</p>}
                    </div>
                  )}

                  {/* Aksiyon Butonları */}
                  <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
                    {/* Sol Hızlı Araçlar */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {cust?.phone && (
                        <a
                          href={`tel:${cust.phone}`}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                          title="Telefonla Ara"
                        >
                          <Phone className="w-3.5 h-3.5" />
                        </a>
                      )}
                      
                      {/* Navigasyon Yol Tarifi Aç */}
                      {cust?.latitude && cust?.longitude && (
                        <a
                          href={getNavigationUrl(cust.latitude, cust.longitude, cust.name, 'google')}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg text-indigo-600 hover:text-indigo-700 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition flex items-center gap-1 text-[11px] font-bold"
                          title="Google Haritalar ile Yol Tarifi Al"
                        >
                          <Navigation className="w-3.5 h-3.5" />
                          <span>Yol Tarifi</span>
                        </a>
                      )}

                      <button
                        onClick={() => cust && setStatementCustomer(cust)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                        title="Cari Ekstre Gör"
                      >
                        <FileText className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleOpenCollection(visit)}
                        className="p-1.5 rounded-lg text-amber-600 hover:text-amber-700 bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100 dark:hover:bg-amber-900/60 transition"
                        title="Tahsilat Al"
                      >
                        <Banknote className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleOpenReturn(visit)}
                        className="p-1.5 rounded-lg text-rose-600 hover:text-rose-700 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition"
                        title="İade / Değişim Al"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Sağ Durum / Ziyaret Butonları */}
                    <div className="flex items-center gap-1.5">
                      {visit.status === 'pending' && (
                        <button
                          onClick={() => handleCheckIn(visit)}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-xs transition active:scale-95 flex items-center gap-1 text-[11px]"
                        >
                          <Play className="w-3 h-3 fill-white" />
                          <span>Ziyaret Başlat</span>
                        </button>
                      )}

                      {isInProgress && (
                        <>
                          <button
                            onClick={() => handleStartOrder(visit)}
                            className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-xs transition active:scale-95 flex items-center gap-1 text-[11px]"
                          >
                            <ShoppingCart className="w-3 h-3" />
                            <span>Sipariş</span>
                          </button>
                          <button
                            onClick={() => handleFinishVisit(visit)}
                            className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs transition active:scale-95 flex items-center gap-1 text-[11px]"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Ziyareti Bitir</span>
                          </button>
                        </>
                      )}

                      {(isCompleted || isSkipped) && (
                        <button
                          onClick={() => handleCheckIn(visit)}
                          className="px-2 py-1 text-slate-400 hover:text-blue-500 text-[11px] underline"
                        >
                          Tekrar Aç
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* AŞAMA 9: Geofence İhlal Uyarı Modalı */}
      {geofenceWarning && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl p-5 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-8 h-8" />
            </div>

            <div>
              <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                Konum Dışı Ziyaret Uyarısı!
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                <strong>{geofenceWarning.customerName}</strong> konumundan yaklaşık <strong>{formatDistance(geofenceWarning.distance)}</strong> uzaktasınız. (Belirlenen alan: {geofenceWarning.radius}m)
              </p>
            </div>

            <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-left text-xs text-amber-900 dark:text-amber-200 space-y-1">
              <span className="font-bold block">Saha Denetim Kaydı:</span>
              <p className="text-[11px] text-amber-800 dark:text-amber-300">
                Bu ziyareti yine de başlatabilirsiniz; ancak sistem denetim kayıtlarına <em>"Konum Dışı Check-in"</em> ve anlık GPS koordinatlarınız işlenecektir.
              </p>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setGeofenceWarning(null)}
                className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs transition"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={() => handleCheckIn(geofenceWarning.visit, true)}
                className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs shadow-md transition"
              >
                Yine de Başlat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Siparişsiz Ziyaret Sebebi Modalı */}
      {noOrderModalVisit && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl p-5 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    Siparişsiz Ziyaret Kapatma
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {noOrderModalVisit.customerName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setNoOrderModalVisit(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Sipariş Alınmama Sebebi Seçiniz:
              </label>

              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                {(Object.keys(REASON_LABELS) as NoOrderReason[]).map((reasonKey) => (
                  <label
                    key={reasonKey}
                    onClick={() => setSelectedReason(reasonKey)}
                    className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer transition ${
                      selectedReason === reasonKey
                        ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-500 text-blue-900 dark:text-blue-200 font-bold'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="noOrderReason"
                      checked={selectedReason === reasonKey}
                      onChange={() => setSelectedReason(reasonKey)}
                      className="text-blue-600 focus:ring-0"
                    />
                    <span>{REASON_LABELS[reasonKey]}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Ek Saha Notu (İsteğe Bağlı):
              </label>
              <textarea
                rows={2}
                placeholder="Örn: Haftaya Salı günü tekrar uğranacak..."
                value={reasonNotes}
                onChange={(e) => setReasonNotes(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setNoOrderModalVisit(null)}
                className="flex-1 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl text-xs transition"
              >
                İptal
              </button>
              <button
                onClick={handleSaveNoOrderVisit}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-md transition"
              >
                Kaydet ve Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ekstre Modalı */}
      {statementCustomer && (
        <CustomerStatementModal
          customer={statementCustomer}
          serverConfig={serverConfig}
          isOpen={!!statementCustomer}
          onClose={() => setStatementCustomer(null)}
          onOpenCollection={(cust) => openCollectionModal(cust)}
        />
      )}
    </div>
  );
};
