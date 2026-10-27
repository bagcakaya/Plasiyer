import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { VisitRecord, Customer, GeoLocationState } from '../types';
import { formatDistance, checkGeofence, getNavigationUrl } from '../services/geoService';

interface RouteMapProps {
  visits: VisitRecord[];
  customerMap: Map<string, Customer>;
  currentLocation: GeoLocationState;
  selectedVisitId?: number | null;
  onSelectVisit?: (visit: VisitRecord) => void;
  onCheckIn?: (visit: VisitRecord) => void;
  onStartOrder?: (visit: VisitRecord) => void;
}

export const RouteMap: React.FC<RouteMapProps> = ({
  visits,
  customerMap,
  currentLocation,
  selectedVisitId,
  onSelectVisit,
  onCheckIn,
  onStartOrder,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  // Google Maps Görünüm Tipi: roadmap (Sokak), hybrid (Uydu+Yol), terrain (Arazi)
  const [mapType, setMapType] = useState<'roadmap' | 'hybrid' | 'terrain'>('roadmap');

  // Haritayı başlat
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [currentLocation.latitude, currentLocation.longitude],
        zoom: 14,
        zoomControl: true,
        attributionControl: false, // Leaflet filigranını kaldırıyoruz; orijinal Google marka ve telifini özel olarak ekliyoruz
      });

      // Google Maps Standart Yol Haritası Katmanı (mt0-mt3 tile sunucuları, Türkçe dil desteği hl=tr)
      const googleTileLayer = L.tileLayer('https://{s}.google.com/vt/lyrs=m&hl=tr&x={x}&y={y}&z={z}', {
        maxZoom: 22,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      }).addTo(map);

      tileLayerRef.current = googleTileLayer;

      const layerGroup = L.layerGroup().addTo(map);
      layerGroupRef.current = layerGroup;
      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Harita Tipi Değiştiğinde (Google Sokak / Google Uydu / Google Arazi)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    // Google Maps Harita Katman Parametreleri:
    // m = Sokak Haritası, y = Uydu + Hibrit (Sokak İsimli), p = Arazi (Topoğrafya)
    // hl=tr = Türkçe yer ve cadde adları
    const lyrs = mapType === 'hybrid' ? 'y' : mapType === 'terrain' ? 'p' : 'm';
    const newTileLayer = L.tileLayer(`https://{s}.google.com/vt/lyrs=${lyrs}&hl=tr&x={x}&y={y}&z={z}`, {
      maxZoom: 22,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    }).addTo(map);

    // Harita katmanını en alta gönder ki pinler ve rota çizgileri her zaman üstte kalsın
    newTileLayer.bringToBack();

    tileLayerRef.current = newTileLayer;
  }, [mapType]);

  // Katmanları ve pinleri güncelle
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();

    const boundsPoints: L.LatLngExpression[] = [];

    // 1. Plasiyerin Canlı GPS Konum İkonu (Mavi Radar)
    const plasiyerIcon = L.divIcon({
      className: 'custom-plasiyer-pin',
      html: `
        <div style="position: relative; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">
          <div style="position: absolute; width: 28px; height: 28px; border-radius: 9999px; background-color: rgba(37, 99, 235, 0.4); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
          <div style="width: 14px; height: 14px; border-radius: 9999px; background-color: #1d4ed8; border: 2.5px solid #ffffff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.4);"></div>
        </div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });

    const plasiyerMarker = L.marker([currentLocation.latitude, currentLocation.longitude], {
      icon: plasiyerIcon,
      zIndexOffset: 1000,
    }).addTo(layerGroup);

    plasiyerMarker.bindTooltip('<strong>📍 Siz (Plasiyer)</strong><br/>Anlık Saha Konumunuz', {
      direction: 'top',
      offset: [0, -10],
    });

    boundsPoints.push([currentLocation.latitude, currentLocation.longitude]);

    // 2. Müşteri Pinleri & Rota Hattı Koordinatları
    const routePoints: L.LatLngExpression[] = [
      [currentLocation.latitude, currentLocation.longitude],
    ];

    visits.forEach((visit, index) => {
      const cust = customerMap.get(visit.customerId);
      if (!cust || !cust.latitude || !cust.longitude) return;

      boundsPoints.push([cust.latitude, cust.longitude]);
      routePoints.push([cust.latitude, cust.longitude]);

      const geofence = checkGeofence(
        currentLocation.latitude,
        currentLocation.longitude,
        cust.latitude,
        cust.longitude,
        cust.geofenceRadiusMeters || 150
      );

      // Duruma göre renk ve içerik
      let bgColor = '#2563eb'; // Mavi (pending)
      let statusText = 'Bekliyor';
      let iconContent = `${index + 1}`;

      if (visit.status === 'completed') {
        bgColor = '#059669'; // Yeşil
        statusText = 'Ziyaret Tamamlandı';
        iconContent = '✓';
      } else if (visit.status === 'in_progress') {
        bgColor = '#d97706'; // Amber / Turuncu
        statusText = 'Ziyarette (İşlemde)';
        iconContent = '▶';
      } else if (visit.status === 'skipped') {
        bgColor = '#64748b'; // Gri
        statusText = 'Siparişsiz Geçildi';
        iconContent = '✕';
      }

      const isSelected = selectedVisitId === visit.id;

      const customerPinHtml = `
        <div style="position: relative; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
          ${isSelected ? '<div style="position: absolute; width: 44px; height: 44px; border-radius: 9999px; border: 3px dashed #d97706; animation: spin 8s linear infinite;"></div>' : ''}
          <div style="
            width: 30px; 
            height: 30px; 
            border-radius: 9999px; 
            background: ${bgColor}; 
            color: white; 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            font-size: 12px; 
            font-weight: 800; 
            border: 2px solid white; 
            box-shadow: 0 4px 10px rgba(0,0,0,0.35);
          ">
            ${iconContent}
          </div>
        </div>
      `;

      const markerIcon = L.divIcon({
        className: 'custom-customer-pin',
        html: customerPinHtml,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });

      const marker = L.marker([cust.latitude, cust.longitude], {
        icon: markerIcon,
      }).addTo(layerGroup);

      // Seçili ise veya ziyaret ediliyorsa geofence halkası çiz
      if (isSelected || visit.status === 'in_progress') {
        L.circle([cust.latitude, cust.longitude], {
          radius: cust.geofenceRadiusMeters || 150,
          color: geofence.isWithin ? '#059669' : '#d97706',
          fillColor: geofence.isWithin ? '#059669' : '#d97706',
          fillOpacity: 0.18,
          weight: 1.5,
          dashArray: '4, 4',
        }).addTo(layerGroup);
      }

      // Popup içeriği
      const googleNavUrl = getNavigationUrl(cust.latitude, cust.longitude, cust.name, 'google');
      const yandexNavUrl = getNavigationUrl(cust.latitude, cust.longitude, cust.name, 'yandex');

      const popupDiv = document.createElement('div');
      popupDiv.className = 'p-1 text-slate-800 space-y-2 text-xs font-sans min-w-[230px]';
      popupDiv.innerHTML = `
        <div style="border-bottom: 1px solid #e2e8f0; padding-bottom: 6px;">
          <div style="font-size: 10px; color: #64748b; font-weight: bold; text-transform: uppercase;">Sıra: #${index + 1} &bull; ${cust.code}</div>
          <div style="font-weight: bold; font-size: 13px; color: #0f172a; margin-top: 2px;">${cust.name}</div>
          <div style="font-size: 11px; color: #475569; margin-top: 2px;">${cust.district} &bull; ${cust.address}</div>
        </div>
        
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px;">
          <span style="color: #64748b;">Mesafe:</span>
          <strong style="color: #0f172a;">${formatDistance(geofence.distanceMeters)}</strong>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px;">
          <span style="color: #64748b;">Durum:</span>
          <span style="color: ${bgColor}; font-weight: bold;">${statusText}</span>
        </div>

        <div style="padding: 4px 6px; border-radius: 6px; font-size: 10px; font-weight: bold; background: ${geofence.isWithin ? '#ecfdf5' : '#fffbeb'}; color: ${geofence.isWithin ? '#065f46' : '#92400e'}; border: 1px solid ${geofence.isWithin ? '#a7f3d0' : '#fde68a'};">
          ${geofence.isWithin ? '✓ Geofence İçi (Konumdasınız)' : `⚠️ Geofence Dışı (${formatDistance(geofence.distanceMeters)} uzak)`}
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding-top: 4px;">
          <a href="${googleNavUrl}" target="_blank" rel="noopener noreferrer" style="background: #2563eb; color: white; text-align: center; padding: 6px 4px; border-radius: 8px; font-weight: bold; text-decoration: none; font-size: 10px;">
            🧭 Google Harita
          </a>
          <a href="${yandexNavUrl}" target="_blank" rel="noopener noreferrer" style="background: #ea580c; color: white; text-align: center; padding: 6px 4px; border-radius: 8px; font-weight: bold; text-decoration: none; font-size: 10px;">
            🚗 Yandex Navigasyon
          </a>
        </div>
      `;

      // Check-in butonu ekle
      if (visit.status === 'pending') {
        const btnCheckIn = document.createElement('button');
        btnCheckIn.innerText = '▶ Ziyareti Başlat (Check-in)';
        btnCheckIn.style.cssText = 'width: 100%; margin-top: 4px; background: #059669; color: white; border: none; padding: 6px; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 11px;';
        btnCheckIn.onclick = () => {
          if (onCheckIn) onCheckIn(visit);
        };
        popupDiv.appendChild(btnCheckIn);
      } else if (visit.status === 'in_progress') {
        const btnOrder = document.createElement('button');
        btnOrder.innerText = '🛍️ Sipariş Yazmaya Başla';
        btnOrder.style.cssText = 'width: 100%; margin-top: 4px; background: #2563eb; color: white; border: none; padding: 6px; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 11px;';
        btnOrder.onclick = () => {
          if (onStartOrder) onStartOrder(visit);
        };
        popupDiv.appendChild(btnOrder);
      }

      marker.bindPopup(popupDiv);

      marker.on('click', () => {
        if (onSelectVisit) onSelectVisit(visit);
      });
    });

    // 3. Rota Çizgisi (Polyline)
    if (routePoints.length > 1) {
      L.polyline(routePoints, {
        color: '#2563eb',
        weight: 4,
        opacity: 0.8,
        dashArray: '6, 8',
      }).addTo(layerGroup);
    }

    // Harita alanını pinleri kapsayacak şekilde genişlet
    if (boundsPoints.length > 0) {
      const bounds = L.latLngBounds(boundsPoints);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }
  }, [visits, customerMap, currentLocation, selectedVisitId, onSelectVisit, onCheckIn, onStartOrder]);

  const handleCenterOnUser = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo(
        [currentLocation.latitude, currentLocation.longitude],
        16,
        { duration: 1 }
      );
    }
  };

  // Önbelleği temizle ve sayfayı tam yenile (Google Maps güncellemesini zorla uygula)
  const handleHardRefresh = async () => {
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
    } catch {
      // ignore
    }
    window.location.reload();
  };

  // Google Haritalar uygulamasında tüm rotayı çoklu durak olarak başlat
  const handleOpenGoogleMapsRoute = () => {
    const validStops = visits
      .map((v) => customerMap.get(v.customerId))
      .filter((c): c is Customer => !!c && !!c.latitude && !!c.longitude);

    if (validStops.length === 0) {
      window.open(
        `https://www.google.com/maps/@${currentLocation.latitude},${currentLocation.longitude},15z`,
        '_blank'
      );
      return;
    }

    const origin = `${currentLocation.latitude},${currentLocation.longitude}`;
    const destination = `${validStops[validStops.length - 1].latitude},${validStops[validStops.length - 1].longitude}`;
    const waypoints = validStops
      .slice(0, validStops.length - 1)
      .map((s) => `${s.latitude},${s.longitude}`)
      .join('|');

    const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${
      waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : ''
    }&travelmode=driving`;
    window.open(url, '_blank');
  };

  return (
    <div className="relative w-full h-full min-h-[380px] rounded-3xl overflow-hidden shadow-inner border border-slate-200 dark:border-slate-800">
      <div ref={mapContainerRef} className="w-full h-full z-0 min-h-[380px]" />

      {/* Harita Katman Seçici (Google Sokak / Google Uydu / Google Arazi) */}
      <div className="absolute top-3 right-3 z-10 flex bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-1 rounded-2xl shadow-md border border-slate-200 dark:border-slate-800 gap-1 text-[11px] font-bold">
        <button
          type="button"
          onClick={() => setMapType('roadmap')}
          className={`px-2.5 py-1 rounded-xl transition flex items-center gap-1 ${
            mapType === 'roadmap'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
          title="Google Standart Yol / Sokak Haritası"
        >
          <span>🗺️ Google Sokak</span>
        </button>
        <button
          type="button"
          onClick={() => setMapType('hybrid')}
          className={`px-2.5 py-1 rounded-xl transition flex items-center gap-1 ${
            mapType === 'hybrid'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
          title="Google Uydu ve Cadde Hibrit Haritası"
        >
          <span>🛰️ Google Uydu</span>
        </button>
        <button
          type="button"
          onClick={() => setMapType('terrain')}
          className={`px-2.5 py-1 rounded-xl transition flex items-center gap-1 ${
            mapType === 'terrain'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
          title="Google Arazi ve Yükselti Haritası"
        >
          <span>⛰️ Arazi</span>
        </button>
      </div>

      {/* Sol Üst Harita Bilgi Rozeti & Google Maps Markası */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
        <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-3 py-1.5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>Canlı Rut: {visits.length} Durak</span>
        </div>
      </div>

      {/* Sol Alt: Orijinal Google Logo & Telif */}
      <div className="absolute bottom-2 left-3 z-10 pointer-events-none flex items-center gap-2 bg-white/90 dark:bg-slate-900/90 px-2 py-0.5 rounded shadow-xs backdrop-blur-xs border border-slate-200/50 dark:border-slate-700/50">
        <img
          src="https://maps.gstatic.com/mapfiles/api-3/images/google4.png"
          alt="Google"
          className="h-4 object-contain"
        />
        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-sans hidden sm:inline">
          Harita verileri &copy;{new Date().getFullYear()} Google
        </span>
      </div>

      {/* Sağ Alt Harita Kontrolleri: Rotayı Google Maps'te Aç & Konumuma Odaklan */}
      <div className="absolute bottom-3 right-3 z-10 flex flex-col sm:flex-row gap-2 items-end sm:items-center">
        <button
          type="button"
          onClick={handleOpenGoogleMapsRoute}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-2xl shadow-lg transition active:scale-95 flex items-center gap-1.5 text-xs font-bold"
          title="Google Haritalar Uygulamasında Çoklu Durak Navigasyonu Başlat"
        >
          <span>🧭</span>
          <span>Google Haritalar'da Rotayı Aç</span>
        </button>

        <button
          type="button"
          onClick={handleCenterOnUser}
          className="bg-white dark:bg-slate-900 text-slate-800 dark:text-white p-2 sm:px-3 sm:py-2 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition active:scale-95 flex items-center gap-1.5 text-xs font-bold"
          title="Haritayı Benim Konumuma Odakla"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse"></span>
          <span>Konumuma Odaklan</span>
        </button>

        <button
          type="button"
          onClick={handleHardRefresh}
          className="bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 p-2 sm:px-3 sm:py-2 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition active:scale-95 flex items-center gap-1.5 text-xs font-bold"
          title="Önbelleği temizle ve Google Haritasını yeniden yükle"
        >
          <span>🔄</span>
          <span>Haritayı Yenile</span>
        </button>
      </div>
    </div>
  );
};
