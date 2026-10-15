import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOADS_DIR = path.resolve(__dirname, '../uploads/products');
const REGISTRY_FILE = path.resolve(__dirname, '../data/product-images.json');
const ERP12_DIR = 'C:\\ERP12\\URUN_RESIM';

// Klasörlerin varlığından emin ol
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Görsel haritasını oku
function readRegistry() {
  try {
    if (fs.existsSync(REGISTRY_FILE)) {
      const data = fs.readFileSync(REGISTRY_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Görsel kayıt defteri okunamadı:', err.message);
  }
  return {};
}

// Görsel haritasını kaydet
function writeRegistry(registry) {
  try {
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2), 'utf-8');
  } catch (err) {
    console.error('Görsel kayıt defteri yazılamadı:', err.message);
  }
}

export const imageService = {
  /**
   * Bir ürün için mevcut görsel dosyasını kontrol eder.
   * Öncelik Sırası:
   * 1. Sunucuya yüklenen görsel (/uploads/products/{code}.*)
   * 2. ERP12 dizinindeki görsel (C:\ERP12\URUN_RESIM\{code}.*)
   * 3. Kayıt defterindeki görsel
   */
  getProductImage(code, id, barcode) {
    if (!code && !id && !barcode) return null;

    const registry = readRegistry();
    const cleanCode = String(code || '').trim();
    const cleanId = String(id || '').trim();
    const cleanBarcode = String(barcode || '').trim();

    // 1. Registry kontrolü
    if (cleanCode && registry[cleanCode]) return registry[cleanCode];
    if (cleanId && registry[cleanId]) return registry[cleanId];
    if (cleanBarcode && registry[cleanBarcode]) return registry[cleanBarcode];

    // 2. Uploads klasörü kontrolü (code, id, barcode)
    const extensions = ['.jpg', '.jpeg', '.png', '.webp'];
    const candidates = [cleanCode, cleanId, cleanBarcode].filter(Boolean);

    for (const name of candidates) {
      for (const ext of extensions) {
        const filePath = path.join(UPLOADS_DIR, `${name}${ext}`);
        if (fs.existsSync(filePath)) {
          return `/uploads/products/${name}${ext}`;
        }
      }
    }

    // 3. C:\ERP12\URUN_RESIM klasörü kontrolü
    if (fs.existsSync(ERP12_DIR)) {
      for (const name of candidates) {
        for (const ext of extensions) {
          const erpFilePath = path.join(ERP12_DIR, `${name}${ext}`);
          if (fs.existsSync(erpFilePath)) {
            // Eğer ERP12'de var ama uploads'a kopyalanmamışsa senkronize et
            try {
              const destPath = path.join(UPLOADS_DIR, `${name}${ext}`);
              fs.copyFileSync(erpFilePath, destPath);
              return `/uploads/products/${name}${ext}`;
            } catch (copyErr) {
              console.warn('ERP12 görsel kopyalama uyarısı:', copyErr.message);
            }
          }
        }
      }
    }

    return null;
  },

  /**
   * Tüm ürünler için görsel haritasını döner (getProducts için optimize toplu işlem)
   */
  getAllProductImagesMap() {
    const registry = readRegistry();
    const map = { ...registry };

    // Uploads klasörünü tara
    try {
      if (fs.existsSync(UPLOADS_DIR)) {
        const files = fs.readdirSync(UPLOADS_DIR);
        for (const file of files) {
          const ext = path.extname(file).toLowerCase();
          if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
            const baseName = path.basename(file, ext);
            map[baseName] = `/uploads/products/${file}`;
          }
        }
      }
    } catch (e) {
      console.error('Uploads klasörü taranamadı:', e.message);
    }

    // C:\ERP12\URUN_RESIM klasörünü tara
    try {
      if (fs.existsSync(ERP12_DIR)) {
        const erpFiles = fs.readdirSync(ERP12_DIR);
        for (const file of erpFiles) {
          const ext = path.extname(file).toLowerCase();
          if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
            const baseName = path.basename(file, ext);
            if (!map[baseName]) {
              // Uploads klasörüne kopyala ve haritaya ekle
              try {
                const src = path.join(ERP12_DIR, file);
                const dest = path.join(UPLOADS_DIR, file);
                fs.copyFileSync(src, dest);
                map[baseName] = `/uploads/products/${file}`;
              } catch {}
            }
          }
        }
      }
    } catch (e) {
      console.error('ERP12 klasörü taranamadı:', e.message);
    }

    return map;
  },

  /**
   * Plasiyerden veya sistemden gelen ürün görselini kaydeder.
   * Hem server/uploads/products içine hem de C:\ERP12\URUN_RESIM içine yazar.
   */
  async saveProductImage(productCode, base64Data) {
    if (!productCode || !base64Data) {
      throw new Error('Ürün kodu ve görsel verisi gereklidir.');
    }

    // "data:image/jpeg;base64,..." formatından buffer çıkar
    const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    let buffer;
    let ext = '.jpg';

    if (matches && matches.length === 3) {
      const mime = matches[1];
      if (mime.includes('png')) ext = '.png';
      else if (mime.includes('webp')) ext = '.webp';
      buffer = Buffer.from(matches[2], 'base64');
    } else {
      // Doğrudan base64 string
      buffer = Buffer.from(base64Data, 'base64');
    }

    const cleanCode = String(productCode).trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `${cleanCode}${ext}`;
    const uploadFilePath = path.join(UPLOADS_DIR, fileName);

    // 1. uploads klasörüne yaz
    fs.writeFileSync(uploadFilePath, buffer);

    // 2. ERP12 URUN_RESIM klasörü varsa oraya da yaz (ERP12 ile tam çift yönlü senkron)
    try {
      if (fs.existsSync('C:\\ERP12')) {
        if (!fs.existsSync(ERP12_DIR)) {
          fs.mkdirSync(ERP12_DIR, { recursive: true });
        }
        const erpFilePath = path.join(ERP12_DIR, fileName);
        fs.writeFileSync(erpFilePath, buffer);
        console.log(`📸 [ERP12 Fotoğraf Senkron] ${fileName} -> ${ERP12_DIR} klasörüne kaydedildi.`);
      }
    } catch (erpErr) {
      console.warn('ERP12 klasörüne yazma uyarısı (İzin veya yol):', erpErr.message);
    }

    // 3. Kayıt defterini güncelle
    const registry = readRegistry();
    const publicUrl = `/uploads/products/${fileName}?v=${Date.now()}`;
    registry[cleanCode] = publicUrl;
    writeRegistry(registry);

    console.log(`✅ [Fotoğraf Kaydedildi] Ürün: ${cleanCode} -> ${publicUrl}`);
    return {
      success: true,
      imageUrl: publicUrl,
      fileName,
    };
  },

  /**
   * Ürün görselini kaldırır
   */
  deleteProductImage(productCode) {
    if (!productCode) return false;
    const cleanCode = String(productCode).trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    const extensions = ['.jpg', '.jpeg', '.png', '.webp'];

    for (const ext of extensions) {
      const filePath = path.join(UPLOADS_DIR, `${cleanCode}${ext}`);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch {}
      }
    }

    const registry = readRegistry();
    if (registry[cleanCode]) {
      delete registry[cleanCode];
      writeRegistry(registry);
    }

    return true;
  }
};
