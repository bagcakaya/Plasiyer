import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { 
  X, Camera, Flashlight, AlertCircle, RefreshCw, Keyboard, 
  CheckCircle2, ShoppingCart, Plus, Minus, Repeat, Sparkles
} from 'lucide-react';
import { soundNotification } from '../utils/soundNotification';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Product } from '../types';
import { useApp } from '../context/AppContext';
import { getProductImageUrl } from '../utils/productImages';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan?: (scannedCode: string) => void;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onScan,
}) => {
  const { cart, addToCart, updateCartItemQuantity, calculateCustomerPrice, selectedCustomer, currentCustomerUser, userRole } = useApp();
  
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const [hasTorch, setHasTorch] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  
  // Seri (Sürekli) Okuma Modu vs Tekli Okuma Modu
  const [continuousMode, setContinuousMode] = useState<boolean>(true);
  
  // Son okunan ürün
  const [lastScannedProduct, setLastScannedProduct] = useState<Product | null>(null);
  const [scanStatusMessage, setScanStatusMessage] = useState<string | null>(null);
  const [showManualInput, setShowManualInput] = useState<boolean>(false);
  const [manualCode, setManualCode] = useState<string>('');

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScanTimestampRef = useRef<number>(0);
  const lastScannedCodeRef = useRef<string>('');
  const readerElementId = 'barcode-camera-reader';

  const products = useLiveQuery(() => db.products.toArray(), []) || [];
  const activeCustomer = userRole === 'customer' ? currentCustomerUser : selectedCustomer;

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        await scannerRef.current.clear();
      } catch (err) {
        console.warn('Scanner stop error:', err);
      } finally {
        scannerRef.current = null;
      }
    }
  };

  const startScanner = async () => {
    setIsInitializing(true);
    setErrorMessage(null);
    setScanStatusMessage(null);

    try {
      await stopScanner();

      const html5QrCode = new Html5Qrcode(readerElementId, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.QR_CODE,
        ],
        verbose: false,
      });

      scannerRef.current = html5QrCode;

      const config = {
        fps: 20,
        qrbox: { width: 280, height: 180 },
        aspectRatio: 1.0,
      };

      await html5QrCode.start(
        { facingMode },
        config,
        (decodedText) => {
          handleDecodedBarcode(decodedText.trim());
        },
        () => {
          // Frame callback
        }
      );

      // Flaş kontrolü
      try {
        const capabilities = html5QrCode.getRunningTrackCapabilities();
        if ((capabilities as any)?.torch) {
          setHasTorch(true);
        }
      } catch {
        setHasTorch(false);
      }

      setIsInitializing(false);
    } catch (err: any) {
      console.error('Kamera başlatılamadı:', err);
      setIsInitializing(false);
      setErrorMessage(
        err?.message?.includes('Permission')
          ? 'Kamera izni verilmedi. Lütfen tarayıcı ayarlarından kamera iznini onaylayınız.'
          : 'Kamera açılamadı. Cihazınızda kamera bulunmuyor veya başka bir uygulama kullanıyor olabilir.'
      );
    }
  };

  // Barkod Çözümlendiğinde
  const handleDecodedBarcode = (code: string) => {
    const now = Date.now();
    // Aynı barkod için 1.4 saniyelik okuma eşiği
    if (code === lastScannedCodeRef.current && now - lastScanTimestampRef.current < 1400) {
      return;
    }

    lastScanTimestampRef.current = now;
    lastScannedCodeRef.current = code;

    // Ürün eşleştirme
    const matched = products.find(
      (p) => p.barcode === code || p.code.toLowerCase() === code.toLowerCase()
    );

    if (matched) {
      soundNotification.playBarcodeBeep();
      setLastScannedProduct(matched);
      setScanStatusMessage(`"${matched.name}" başarıyla okundu!`);

      // Sepete otomatik ekle
      addToCart(matched, 1);

      if (onScan) {
        onScan(code);
      }

      // Eğer tekli moddaysa tarayıcıyı kapat
      if (!continuousMode) {
        stopScanner().finally(onClose);
      }
    } else {
      soundNotification.playBarcodeErrorBeep();
      setLastScannedProduct(null);
      setScanStatusMessage(`Barkod Bulunamadı: ${code}`);
    }
  };

  // Flaş Aç/Kapat
  const toggleTorch = async () => {
    if (!scannerRef.current || !hasTorch) return;
    try {
      const nextTorch = !torchOn;
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: nextTorch } as any],
      });
      setTorchOn(nextTorch);
    } catch (err) {
      console.warn('Torch error:', err);
    }
  };

  // Ön/Arka Kamera Değiştir
  const toggleCameraFacing = async () => {
    const newFacing = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(newFacing);
    setIsInitializing(true);
    await stopScanner();
    setTimeout(() => {
      startScanner();
    }, 200);
  };

  // Manuel Kod Girişi
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    handleDecodedBarcode(manualCode.trim());
    setManualCode('');
    setShowManualInput(false);
  };

  useEffect(() => {
    if (isOpen) {
      startScanner();
    } else {
      stopScanner();
      setLastScannedProduct(null);
      setScanStatusMessage(null);
    }

    return () => {
      stopScanner();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Sepetteki son okunan ürün adeti
  const inCartQty = lastScannedProduct 
    ? (cart.find(i => i.productId === lastScannedProduct.id)?.quantity || 0)
    : 0;

  const priceInfo = lastScannedProduct 
    ? calculateCustomerPrice(lastScannedProduct, activeCustomer) 
    : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col justify-between p-3 sm:p-5 animate-in fade-in select-none">
      {/* Üst Bar & Kontroller */}
      <div className="flex items-center justify-between text-white z-20">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/40">
            <Camera className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm">Barkod Okuyucu</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                continuousMode ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-blue-500/20 text-blue-400'
              }`}>
                {continuousMode ? 'Seri Raf Tarama' : 'Tekli Tarama'}
              </span>
            </div>
          </div>
        </div>

        {/* Sağ Kontroller */}
        <div className="flex items-center gap-1.5">
          {/* Sürekli Okuma Modu Geçiş Butonu */}
          <button
            onClick={() => setContinuousMode(!continuousMode)}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 border ${
              continuousMode 
                ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-600/30' 
                : 'bg-slate-800 text-slate-300 border-slate-700'
            }`}
            title="Seri Tarama Modunu Aç/Kapat"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Seri Mod</span>
          </button>

          {/* Kamera Değiştir (Ön/Arka) */}
          <button
            onClick={toggleCameraFacing}
            className="p-2 rounded-xl bg-slate-800/90 text-slate-300 hover:text-white border border-slate-700/80 transition"
            title="Kamera Değiştir"
          >
            <Repeat className="w-4 h-4" />
          </button>

          {/* Flaş */}
          {hasTorch && (
            <button
              onClick={toggleTorch}
              className={`p-2 rounded-xl border transition ${
                torchOn 
                  ? 'bg-amber-400 text-slate-900 border-amber-300 shadow-md shadow-amber-400/40' 
                  : 'bg-slate-800/90 text-white border-slate-700/80'
              }`}
              title="Flaş Aç / Kapat"
            >
              <Flashlight className="w-4 h-4" />
            </button>
          )}

          {/* Kapat */}
          <button
            onClick={() => stopScanner().finally(onClose)}
            className="p-2 rounded-xl bg-slate-800/90 text-slate-300 hover:text-rose-400 border border-slate-700/80 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Orta Kamera & Canlı Vizör Alanı */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden my-3 rounded-3xl bg-black border border-slate-800 shadow-2xl">
        <div id={readerElementId} className="w-full max-w-sm rounded-3xl overflow-hidden" />

        {/* Lazer ve Hedefleme Çerçevesi */}
        {!errorMessage && !isInitializing && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="w-68 h-48 border-2 border-blue-400/70 rounded-2xl relative shadow-[0_0_0_9999px_rgba(0,0,0,0.52)]">
              {/* Vurgulu Köşeler */}
              <div className="absolute -top-1 -left-1 w-5 h-5 border-t-4 border-l-4 border-blue-400 rounded-tl-lg" />
              <div className="absolute -top-1 -right-1 w-5 h-5 border-t-4 border-r-4 border-blue-400 rounded-tr-lg" />
              <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-4 border-l-4 border-blue-400 rounded-bl-lg" />
              <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-4 border-r-4 border-blue-400 rounded-br-lg" />

              {/* Kırmızı Lazer Çizgisi */}
              <div className="absolute left-2 right-2 h-0.5 bg-rose-500 shadow-[0_0_12px_#f43f5e] animate-pulse top-1/2 -translate-y-1/2" />
            </div>
          </div>
        )}

        {/* Yükleniyor */}
        {isInitializing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 text-white gap-3 p-4 text-center">
            <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
            <span className="text-xs font-semibold">Kamera & Barkod Sensörü Açılıyor...</span>
          </div>
        )}

        {/* Hata Mesajı */}
        {errorMessage && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/95 text-white gap-3 p-6 text-center">
            <AlertCircle className="w-10 h-10 text-rose-400" />
            <p className="text-xs text-rose-200">{errorMessage}</p>
            <button
              onClick={startScanner}
              className="mt-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Kamerayı Tekrar Başlat</span>
            </button>
          </div>
        )}

        {/* Canlı Tarama Durum Bildirimi (Okundu / Bulunamadı) */}
        {scanStatusMessage && (
          <div className={`absolute top-4 left-4 right-4 z-30 p-2.5 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 shadow-lg backdrop-blur-md animate-in slide-in-from-top-2 ${
            lastScannedProduct
              ? 'bg-emerald-500/90 text-white border border-emerald-400'
              : 'bg-rose-500/90 text-white border border-rose-400'
          }`}>
            {lastScannedProduct ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span className="truncate">{scanStatusMessage}</span>
          </div>
        )}
      </div>

      {/* Alt Alan: Son Okunan Ürün Kartı veya Manuel Giriş */}
      <div className="space-y-2 z-20 max-w-sm mx-auto w-full">
        {/* Son Okunan Ürün Çekmecesi */}
        {lastScannedProduct && priceInfo ? (
          <div className="bg-slate-900/95 border border-slate-700/80 rounded-2xl p-3 text-white shadow-2xl backdrop-blur-md flex items-center justify-between gap-3 animate-in slide-in-from-bottom-2">
            <img 
              src={getProductImageUrl(lastScannedProduct.name, lastScannedProduct.category)}
              alt={lastScannedProduct.name}
              className="w-12 h-12 rounded-xl object-cover shrink-0 border border-slate-700"
            />
            
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-xs truncate leading-tight">
                {lastScannedProduct.name}
              </h4>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-extrabold text-sm text-emerald-400">
                  {priceInfo.customerPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {lastScannedProduct.barcode}
                </span>
              </div>
            </div>

            {/* Miktar Sayacı */}
            <div className="flex items-center bg-slate-800 rounded-xl p-1 gap-1.5 shrink-0 border border-slate-700">
              <button
                onClick={() => updateCartItemQuantity(lastScannedProduct.id, Math.max(0, inCartQty - 1))}
                className="w-7 h-7 bg-slate-700 hover:bg-slate-600 rounded-lg flex items-center justify-center font-bold active:scale-95 transition"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="font-extrabold text-xs w-5 text-center text-emerald-400">
                {inCartQty}
              </span>
              <button
                onClick={() => updateCartItemQuantity(lastScannedProduct.id, inCartQty + 1)}
                className="w-7 h-7 bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center justify-center font-bold active:scale-95 transition"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : null}

        {/* Manuel Barkod Arama / Yazma */}
        {showManualInput ? (
          <form onSubmit={handleManualSubmit} className="flex gap-2 animate-in fade-in">
            <input
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="Barkod veya Stok Kodu Yazın..."
              autoFocus
              className="flex-1 bg-slate-800 border border-slate-700 rounded-2xl px-3.5 py-2.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 font-mono"
            />
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-2xl shadow-md"
            >
              Bul & Ekle
            </button>
          </form>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => setShowManualInput(true)}
              className="flex-1 bg-slate-800/80 hover:bg-slate-800 text-slate-300 text-xs font-semibold py-2.5 rounded-2xl border border-slate-700/80 flex items-center justify-center gap-1.5 transition"
            >
              <Keyboard className="w-4 h-4 text-slate-400" />
              <span>Elle Barkod Gir</span>
            </button>

            {cart.length > 0 && (
              <button
                onClick={() => stopScanner().finally(onClose)}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2.5 rounded-2xl shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-1.5 transition"
              >
                <ShoppingCart className="w-4 h-4" />
                <span>Sepete Git ({cart.length})</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
