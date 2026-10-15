import React, { useEffect, useRef } from 'react';
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

  // Haritayı başlat
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [currentLocation.latitude, currentLocation.longitude],
        zoom: 13,
        zoomControl: true,
      });

      // CartoDB Positron / OSM fayansları
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

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
          <div style="position: absolute; width: 28px; height: 28px; border-radius: 9999px; background-color: rgba(59, 130, 246, 0.35); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
          <div style="width: 14px; height: 14px; border-radius: 9999px; background-color: #2563eb; border: 2.5px solid #ffffff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3);"></div>
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
      let bgColor = '#3b82f6'; // Mavi (pending)
      let statusText = 'Bekliyor';
      let iconContent = `${index + 1}`;

      if (visit.status === 'completed') {
        bgColor = '#10b981'; // Yeşil
        statusText = 'Ziyaret Tamamlandı';
        iconContent = '✓';
      } else if (visit.status === 'in_progress') {
        bgColor = '#f59e0b'; // Amber / Turuncu
        statusText = 'Ziyarette (İşlemde)';
        iconContent = '▶';
      } else if (visit.status === 'skipped') {
        bgColor = '#94a3b8'; // Gri
        statusText = 'Siparişsiz Geçildi';
        iconContent = '✕';
      }

      const isSelected = selectedVisitId === visit.id;

      const customerPinHtml = `
        <div style="position: relative; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
          ${isSelected ? '<div style="position: absolute; width: 44px; height: 44px; border-radius: 9999px; border: 3px dashed #f59e0b; animation: spin 8s linear infinite;"></div>' : ''}
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
            box-shadow: 0 4px 10px rgba(0,0,0,0.3);
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
          color: geofence.isWithin ? '#10b981' : '#f59e0b',
          fillColor: geofence.isWithin ? '#10b981' : '#f59e0b',
          fillOpacity: 0.15,
          weight: 1.5,
          dashArray: '4, 4',
        }).addTo(layerGroup);
      }

      // Popup içeriği
      const googleNavUrl = getNavigationUrl(cust.latitude, cust.longitude, cust.name, 'google');
      const yandexNavUrl = getNavigationUrl(cust.latitude, cust.longitude, cust.name, 'yandex');

      const popupDiv = document.createElement('div');
      popupDiv.className = 'p-1 text-slate-800 space-y-2 text-xs font-sans min-w-[220px]';
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
            🧭 Google Yol
          </a>
          <a href="${yandexNavUrl}" target="_blank" rel="noopener noreferrer" style="background: #ea580c; color: white; text-align: center; padding: 6px 4px; border-radius: 8px; font-weight: bold; text-decoration: none; font-size: 10px;">
            🚗 Yandex Yol
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
        color: '#6366f1',
        weight: 3.5,
        opacity: 0.7,
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
        15,
        { duration: 1 }
      );
    }
  };

  return (
    <div className="relative w-full h-full min-h-[360px] rounded-3xl overflow-hidden shadow-inner border border-slate-200 dark:border-slate-800">
      <div ref={mapContainerRef} className="w-full h-full z-0 min-h-[360px]" />

      {/* Harita Kontrol Butonu: Konumuma Git */}
      <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-2">
        <button
          type="button"
          onClick={handleCenterOnUser}
          className="bg-white dark:bg-slate-900 text-slate-800 dark:text-white p-2.5 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition active:scale-95 flex items-center gap-1.5 text-xs font-bold"
          title="Konumuma Git"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse"></span>
          <span>Konumuma Odaklan</span>
        </button>
      </div>

      {/* Harita Bilgi Rozeti */}
      <div className="absolute top-3 left-3 z-10 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
        <span>Canlı Rut Rotası: {visits.length} Durak</span>
      </div>
    </div>
  );
};
