/**
 * İstemci tarafı akıllı görsel sıkıştırma motoru
 * Cep telefonu kameralarından çekilen 10-15 MB'lık devasa fotoğrafları
 * saniyeler içinde ~150 KB boyutunda, yüksek kaliteli 800x800 web formatına indirger.
 * IndexedDB kotasını korur ve mobil veri kullanımını %98 azaltır.
 */

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0.0 - 1.0
  mimeType?: string;
}

export async function compressImage(
  fileOrBlob: File | Blob,
  options: CompressionOptions = {}
): Promise<string> {
  const {
    maxWidth = 800,
    maxHeight = 800,
    quality = 0.82,
    mimeType = 'image/jpeg',
  } = options;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      const img = new Image();

      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // En-boy oranını koruyarak yeniden boyutlandır
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas 2D context oluşturulamadı'));
          return;
        }

        // Yumuşatılmış yüksek kaliteli render
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Arka planı beyaz yap (şeffaf PNG'ler JPEG'e dönüşürken siyah olmasın)
        if (mimeType === 'image/jpeg') {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Data URL olarak dışa aktar
        const compressedDataUrl = canvas.toDataURL(mimeType, quality);
        resolve(compressedDataUrl);
      };

      img.onerror = () => {
        reject(new Error('Görsel dosyası yüklenemedi veya geçersiz format'));
      };

      if (event.target?.result) {
        img.src = event.target.result as string;
      } else {
        reject(new Error('Dosya okunamadı'));
      }
    };

    reader.onerror = () => {
      reject(new Error('Dosya okuma hatası'));
    };

    reader.readAsDataURL(fileOrBlob);
  });
}
