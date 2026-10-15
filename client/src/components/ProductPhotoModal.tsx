import React, { useState, useRef } from 'react';
import { 
  X, Camera, Image as ImageIcon, Trash2, Check, RefreshCw, UploadCloud, AlertCircle 
} from 'lucide-react';
import type { Product } from '../types';
import { db } from '../db';
import { useApp } from '../context/AppContext';
import { apiService } from '../services/apiService';
import { compressImage } from '../utils/imageCompressor';
import { getProductImageUrl } from '../utils/productImages';

interface ProductPhotoModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
  onImageUpdated?: (productId: string, newImageUrl: string) => void;
}

export const ProductPhotoModal: React.FC<ProductPhotoModalProps> = ({
  product,
  isOpen,
  onClose,
  onImageUpdated,
}) => {
  const { serverConfig } = useApp();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen || !product) return null;

  const currentDisplayImage = previewUrl || getProductImageUrl(product.name, product.category, product.image);
  const hasCustomImage = Boolean(product.image || previewUrl);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsProcessing(true);
      setStatusMessage({ type: 'info', text: 'Fotoğraf optimize ediliyor...' });

      // Cihaz üzerinde hızlı sıkıştırma (max 800x800, ~150KB)
      const compressedDataUrl = await compressImage(file, {
        maxWidth: 800,
        maxHeight: 800,
        quality: 0.82,
        mimeType: 'image/jpeg',
      });

      setPreviewUrl(compressedDataUrl);

      // 1. IndexedDB'ye anında çevrimdışı kaydet
      await db.products.update(product.id, { image: compressedDataUrl });

      // 2. Canlı sunucuya ve ERP12'ye gönder
      let erpSyncNote = '';
      if (serverConfig.apiUrl && serverConfig.apiUrl !== 'demo') {
        try {
          const res = await apiService.uploadProductImage(
            serverConfig,
            product.code,
            compressedDataUrl
          );
          if (res.success && res.imageUrl) {
            // Sunucu kalıcı URL'si ile IndexedDB'yi güncelle
            await db.products.update(product.id, { image: res.imageUrl });
            erpSyncNote = ' & ERP12 senkronize edildi';
          }
        } catch (apiErr: any) {
          console.warn('Sunucuya görsel yüklenemedi (çevrimdışı):', apiErr.message);
          erpSyncNote = ' (Çevrimdışı kaydedildi)';
        }
      }

      setStatusMessage({ 
        type: 'success', 
        text: `Fotoğraf başarıyla kaydedildi${erpSyncNote}!` 
      });

      if (onImageUpdated) {
        onImageUpdated(product.id, compressedDataUrl);
      }

      setTimeout(() => {
        setStatusMessage(null);
      }, 3000);

    } catch (err: any) {
      console.error('Fotoğraf işleme hatası:', err);
      setStatusMessage({ type: 'error', text: err.message || 'Fotoğraf işlenirken hata oluştu' });
    } finally {
      setIsProcessing(false);
      // Input değerini sıfırla ki aynı dosya tekrar seçilebilsin
      if (e.target) e.target.value = '';
    }
  };

  const handleRemoveImage = async () => {
    if (!confirm('Bu ürünün fotoğrafını kaldırmak istediğinize emin misiniz?')) return;

    try {
      setIsProcessing(true);
      // IndexedDB'den temizle
      await db.products.update(product.id, { image: undefined });
      setPreviewUrl(null);

      // Sunucudan da sil
      if (serverConfig.apiUrl && serverConfig.apiUrl !== 'demo') {
        try {
          await apiService.deleteProductImage(serverConfig, product.code);
        } catch (err) {
          console.warn('Sunucudan görsel silinemedi:', err);
        }
      }

      setStatusMessage({ type: 'success', text: 'Fotoğraf kaldırıldı' });
      if (onImageUpdated) {
        onImageUpdated(product.id, '');
      }

      setTimeout(() => {
        setStatusMessage(null);
      }, 2000);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: 'Fotoğraf silinemedi' });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
        
        {/* Başlık ve Kapat Butonu */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base leading-tight">
                Ürün Fotoğrafı Yönetimi
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Kamera ile çekin veya galeriden yükleyin (ERP12 Entegre)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Ürün Bilgi Kartı */}
        <div className="px-5 pt-3 pb-2 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800/80">
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100 line-clamp-1">
            {product.name}
          </p>
          <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 dark:text-slate-400">
            <span>Kod: <strong className="text-slate-700 dark:text-slate-300">{product.code}</strong></span>
            <span>•</span>
            <span>Barkod: <strong className="text-slate-700 dark:text-slate-300">{product.barcode || '-'}</strong></span>
            <span>•</span>
            <span>Kategori: <strong className="text-slate-700 dark:text-slate-300">{product.category}</strong></span>
          </div>
        </div>

        {/* Görsel Önizleme Alanı */}
        <div className="p-5 flex flex-col items-center">
          <div className="relative w-full max-w-xs aspect-square rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 border-2 border-dashed border-slate-300 dark:border-slate-700 shadow-inner flex items-center justify-center group">
            <img
              src={currentDisplayImage}
              alt={product.name}
              className="w-full h-full object-cover"
            />

            {isProcessing && (
              <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center text-white gap-2">
                <RefreshCw className="w-8 h-8 animate-spin text-blue-400" />
                <span className="text-xs font-semibold">İşleniyor & Sıkıştırılıyor...</span>
              </div>
            )}
          </div>

          {/* Durum Bildirim Mesajı */}
          {statusMessage && (
            <div className={`mt-3 w-full max-w-xs p-2.5 rounded-xl text-xs font-medium flex items-center gap-2 ${
              statusMessage.type === 'success' 
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                : statusMessage.type === 'error'
                ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                : 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
            }`}>
              {statusMessage.type === 'success' && <Check className="w-4 h-4 shrink-0 text-emerald-500" />}
              {statusMessage.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />}
              {statusMessage.type === 'info' && <RefreshCw className="w-4 h-4 shrink-0 animate-spin text-blue-500" />}
              <span>{statusMessage.text}</span>
            </div>
          )}
        </div>

        {/* Gizli Dosya Inputları */}
        {/* 1. Kamera için (Mobile back camera) */}
        <input
          type="file"
          ref={cameraInputRef}
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* 2. Galeri ve Dosya Seçici için */}
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Buton Aksiyonları */}
        <div className="p-5 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            {/* Kamera ile Çek */}
            <button
              onClick={() => cameraInputRef.current?.click()}
              disabled={isProcessing}
              className="flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-98 text-white font-bold text-sm shadow-md shadow-blue-500/20 transition disabled:opacity-50"
            >
              <Camera className="w-4 h-4" />
              <span>Kamera ile Çek</span>
            </button>

            {/* Galeriden Seç */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className="flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold text-sm shadow-xs transition disabled:opacity-50"
            >
              <ImageIcon className="w-4 h-4" />
              <span>Galeriden Seç</span>
            </button>
          </div>

          {/* ERP12 & Çevrimdışı Bilgi Çubuğu */}
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 px-1 pt-1">
            <span className="flex items-center gap-1">
              <UploadCloud className="w-3.5 h-3.5 text-blue-500" />
              ERP12 (C:\ERP12\URUN_RESIM) & Bulut Senkron
            </span>
            {hasCustomImage && (
              <button
                onClick={handleRemoveImage}
                disabled={isProcessing}
                className="text-rose-500 hover:text-rose-600 flex items-center gap-1 font-semibold transition hover:underline"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Fotoğrafı Sil</span>
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
