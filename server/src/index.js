import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import dotenv from 'dotenv';
import { erpQueries } from './erpQueries.js';
import { testConnection } from './db.js';
import { imageService } from './imageService.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4000;

app.use(compression());
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Statik Görsel Dosya Sunumu (/uploads/products/...)
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));

// Canlı Bildirim SSE İstemci Havuzu
const sseClients = new Set();

function broadcastNotification(payload) {
  const dataString = `data: ${JSON.stringify(payload)}\n\n`;
  console.log(`📢 [SSE Broadcast] ${payload.title || payload.type}: ${payload.message || ''}`);
  
  sseClients.forEach((client) => {
    try {
      client.res.write(dataString);
    } catch (e) {
      sseClients.delete(client);
    }
  });
}

// Sağlık ve Bağlantı Kontrolü (Ping)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'ERP12 Saha Satış Entegrasyon Servisi Aktif',
    time: new Date().toISOString(),
    connectedClients: sseClients.size,
  });
});

// 0. CANLI BİLDİRİM AKIŞI (Server-Sent Events - SSE)
app.get('/api/notifications/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders?.();

  const client = { id: Date.now(), res };
  sseClients.add(client);
  console.log(`🔌 Yeni bildirim abonesi bağlandı (Aktif abone sayısı: ${sseClients.size})`);

  // İlk bağlantı el sıkışması
  res.write(`data: ${JSON.stringify({
    type: 'connected',
    message: 'Canlı bildirim servisine başarıyla bağlandı.',
    timestamp: new Date().toISOString(),
  })}\n\n`);

  // Soket zaman aşımını önlemek için 25 saniyede bir heartbeat pingi
  const heartbeat = setInterval(() => {
    res.write(': ping\n\n');
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(client);
    console.log(`🔌 Bildirim abonesi ayrıldı (Kalan abone sayısı: ${sseClients.size})`);
  });
});

// 1. CARİ LİSTESİ VE BAKİYELERİ GETİR
app.get('/api/customers', async (req, res) => {
  const start = Date.now();
  try {
    const salesRepCode = req.query.rep;
    const customers = await erpQueries.getCustomers(salesRepCode);
    res.json(customers);
    console.log(`⚡ [API] GET /api/customers - ${customers.length} cari teslim edildi (${Date.now() - start}ms)`);
  } catch (err) {
    console.error('Cari çekme hatası:', err.message);
    res.status(500).json({ error: 'Cariler alınamadı', detail: err.message });
  }
});

// 1.1 CARİ HESAP EKSTRESİ GETİR (CANLI ERP12 HAREKETLERİ)
app.get('/api/customers/:idOrCode/statement', async (req, res) => {
  try {
    const { idOrCode } = req.params;
    const { startDate, endDate } = req.query;
    console.log(`🔍 [Ekstre Talebi] idOrCode: ${idOrCode}`);
    const statement = await erpQueries.getCustomerStatement(idOrCode, startDate, endDate);
    console.log(`🔍 [Ekstre Sonuç] Cust: ${statement.customer?.name}, Moves: ${statement.movements?.length}`);
    if (!statement.customer) {
      return res.status(404).json({ error: 'Müşteri ERP12 sisteminde bulunamadı' });
    }
    res.json(statement);
  } catch (err) {
    console.error('Cari ekstre çekme hatası:', err.message);
    res.status(500).json({ error: 'Cari ekstre alınamadı', detail: err.message });
  }
});

// 2. STOK LİSTESİ VE GÜNCEL MEVCUTLARI GETİR
app.get('/api/products', async (req, res) => {
  const start = Date.now();
  try {
    const products = await erpQueries.getProducts();
    res.json(products);
    console.log(`⚡ [API] GET /api/products - ${products.length} ürün teslim edildi (${Date.now() - start}ms)`);
  } catch (err) {
    console.error('Stok çekme hatası:', err.message);
    res.status(500).json({ error: 'Stoklar alınamadı', detail: err.message });
  }
});

// 2.1 ÜRÜN FOTOĞRAFI YÜKLE / ÇEK & ERP12 İLE SENKRON ET
app.post('/api/products/:idOrCode/image', async (req, res) => {
  try {
    const { idOrCode } = req.params;
    const { image, code } = req.body;
    const targetCode = code || idOrCode;

    if (!image) {
      return res.status(400).json({ error: 'Görsel verisi (base64) zorunludur' });
    }

    const saveResult = await imageService.saveProductImage(targetCode, image);
    erpQueries.invalidateProductCache();

    broadcastNotification({
      id: 'notif-img-' + Date.now(),
      type: 'product_image_updated',
      title: '📸 Ürün Görseli Güncellendi',
      message: `${targetCode} kodlu ürünün fotoğrafı güncellendi ve ERP12 sistemine kaydedildi.`,
      productCode: targetCode,
      imageUrl: saveResult.imageUrl,
      timestamp: new Date().toISOString(),
    });

    res.json(saveResult);
  } catch (err) {
    console.error('Ürün fotoğrafı yükleme hatası:', err.message);
    res.status(500).json({ error: 'Fotoğraf kaydedilemedi', detail: err.message });
  }
});

// 2.2 ÜRÜN FOTOĞRAFINI SİL
app.delete('/api/products/:idOrCode/image', async (req, res) => {
  try {
    const { idOrCode } = req.params;
    const { code } = req.query;
    const targetCode = code || idOrCode;

    imageService.deleteProductImage(targetCode);
    erpQueries.invalidateProductCache();

    broadcastNotification({
      id: 'notif-img-del-' + Date.now(),
      type: 'product_image_deleted',
      title: '🗑️ Ürün Görseli Kaldırıldı',
      message: `${targetCode} kodlu ürünün fotoğrafı kaldırıldı.`,
      productCode: targetCode,
      timestamp: new Date().toISOString(),
    });

    res.json({ success: true, message: 'Görsel başarıyla silindi' });
  } catch (err) {
    console.error('Ürün fotoğrafı silme hatası:', err.message);
    res.status(500).json({ error: 'Fotoğraf silinemedi', detail: err.message });
  }
});

// 3. MOBİLDEN GELEN SİPARİŞİ ERP12'YE KAYDET & CANLI BİLDİRİM GÖNDER
app.post('/api/orders', async (req, res) => {
  try {
    const { companyCode, period, order } = req.body;
    if (!order || !order.customerCode || !order.items || order.items.length === 0) {
      return res.status(400).json({ error: 'Geçersiz sipariş verisi' });
    }

    const result = await erpQueries.createOrder({ companyCode, period, order });
    console.log(`✅ Yeni Sipariş ERP12'ye Yazıldı: ${result.docNo} (Cari: ${order.customerCode})`);
    
    // Kampanya kazancı mesajı
    let campaignText = '';
    if (order.totalCampaignSavings && order.totalCampaignSavings > 0) {
      campaignText = ` (🎁 ${order.totalCampaignSavings.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺ Kampanya İndirimi)`;
    }

    // Tüm bağlı yetkili ve plasiyer ekranlarına anlık bildirim fırlat
    broadcastNotification({
      id: 'notif-order-' + Date.now(),
      type: 'new_order',
      title: '🔔 Yeni Sipariş Alındı!',
      message: `${order.customerName || order.customerCode} için ${order.grandTotal?.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺ tutarında sipariş sisteme düştü${campaignText}.`,
      orderDocNo: result.docNo,
      orderTempId: order.tempId,
      amount: order.grandTotal,
      customerName: order.customerName || order.customerCode,
      timestamp: new Date().toISOString(),
      read: false,
    });

    res.json({
      success: true,
      docNo: result.docNo,
      message: 'Sipariş ERP12 sistemine aktarıldı.',
    });
  } catch (err) {
    console.error('Sipariş kaydetme hatası:', err.message);
    res.status(500).json({ error: 'Sipariş ERP12 veritabanına yazılamadı', detail: err.message });
  }
});

// 4. MOBİLDEN GELEN TAHSİLATI ERP12'YE KAYDET & CANLI BİLDİRİM GÖNDER
app.post('/api/collections', async (req, res) => {
  try {
    const { companyCode, period, collection } = req.body;
    if (!collection || !collection.customerCode || !collection.amount || collection.amount <= 0) {
      return res.status(400).json({ error: 'Geçersiz tahsilat verisi (Cari veya tutar eksik)' });
    }

    const result = await erpQueries.createCollection({ companyCode, period, collection });
    console.log(`💵 Yeni Tahsilat ERP12'ye Yazıldı: ${result.docNo} (Cari: ${collection.customerCode}, Tutar: ${collection.amount} ₺, Yöntem: ${collection.paymentMethod})`);

    // Anlık bildirim yayınla
    const methodNames = {
      nakit: 'Nakit',
      kredi_karti: 'Kredi Kartı/POS',
      havale: 'Havale/EFT',
      cek: 'Müşteri Çeki',
    };
    broadcastNotification({
      id: 'notif-col-' + Date.now(),
      type: 'new_collection',
      title: '💵 Yeni Saha Tahsilatı!',
      message: `${collection.customerCode} carisinden ${collection.amount?.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺ tahsilat alındı (${methodNames[collection.paymentMethod] || collection.paymentMethod}).`,
      amount: collection.amount,
      customerName: collection.customerCode,
      timestamp: new Date().toISOString(),
      read: false,
    });

    res.json({
      success: true,
      docNo: result.docNo,
      message: 'Tahsilat ERP12 sistemine aktarıldı.',
    });
  } catch (err) {
    console.error('Tahsilat kaydetme hatası:', err.message);
    res.status(500).json({ error: 'Tahsilat ERP12 veritabanına yazılamadı', detail: err.message });
  }
});

// 5. SİPARİŞİ ERP12'DE ONAYLA & FATURALAŞTIRMA SEVKİ YAP
app.post('/api/orders/:docNo/invoice', async (req, res) => {
  try {
    const { docNo } = req.params;
    const { invoiceNo, notes } = req.body || {};

    const result = await erpQueries.invoiceOrder({ docNo, invoiceNo, notes });
    console.log(`📄 Sipariş ERP12'de Onaylandı & Faturalaştırıldı: ${docNo} (Fatura: ${result.invoiceNo})`);

    // Yetkililere bildirim fırlat
    broadcastNotification({
      id: 'notif-inv-' + Date.now(),
      type: 'order_invoiced',
      title: '📄 Sipariş Faturalaştırıldı',
      message: `${docNo} nolu sipariş ERP12 üzerinde onaylandı ve faturalandırıldı (${result.invoiceNo || 'Seri No Atandı'}).`,
      orderDocNo: docNo,
      timestamp: new Date().toISOString(),
      read: false,
    });

    res.json({
      success: true,
      docNo: result.docNo,
      invoiceNo: result.invoiceNo,
      message: 'Sipariş ERP12 üzerinde onaylandı ve faturaya sevk edildi.',
    });
  } catch (err) {
    console.error('Faturalaştırma hatası:', err.message);
    res.status(500).json({ error: 'Faturalaştırma işlemi yapılamadı', detail: err.message });
  }
});

// 6. MOBİLDEN GELEN İADE & DEĞİŞİM FİŞİNİ ERP12'YE KAYDET & CANLI BİLDİRİM GÖNDER
app.post('/api/returns', async (req, res) => {
  try {
    const { companyCode, period, returnRecord } = req.body;
    if (!returnRecord || !returnRecord.customerCode || !returnRecord.grandTotal || returnRecord.grandTotal <= 0) {
      return res.status(400).json({ error: 'Geçersiz iade verisi (Cari veya iade tutarı eksik)' });
    }

    const result = await erpQueries.createReturn({ companyCode, period, returnRecord });
    console.log(`📦 Yeni İade Fişi ERP12'ye Yazıldı: ${result.docNo} (Cari: ${returnRecord.customerCode}, Tutar: ${returnRecord.grandTotal} ₺)`);

    // Yetkililere bildirim fırlat
    broadcastNotification({
      id: 'notif-ret-' + Date.now(),
      type: 'new_return',
      title: '📦 Yeni Saha İade Fişi!',
      message: `${returnRecord.customerName || returnRecord.customerCode} carisinden ${returnRecord.grandTotal?.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺ tutarında iade fişi kesildi.`,
      amount: returnRecord.grandTotal,
      customerName: returnRecord.customerName || returnRecord.customerCode,
      timestamp: new Date().toISOString(),
      read: false,
    });

    res.json({
      success: true,
      docNo: result.docNo,
      message: 'İade fişi ERP12 sistemine aktarıldı.',
    });
  } catch (err) {
    console.error('İade kaydetme hatası:', err.message);
    res.status(500).json({ error: 'İade fişi ERP12 veritabanına yazılamadı', detail: err.message });
  }
});

// 7. AKTİF KAMPANYALARI LİSTELE
app.get('/api/campaigns', (req, res) => {
  const campaigns = [
    {
      id: 'camp-1',
      code: 'CAMP-001',
      title: '10 Alana 1 Bedelsiz Çaykur!',
      description: '10 paket Çaykur Rize Turist Çay 1000g alımına 1 paket Bedelsiz hediye!',
      type: 'quantity_gift',
      targetProductCode: 'STK-001',
      targetProductName: 'Çaykur Rize Turist Çay 1000g',
      minQuantity: 10,
      rewardProductCode: 'STK-001',
      rewardProductName: 'Çaykur Rize Turist Çay 1000g',
      rewardQuantity: 1,
      badgeText: '10+1 Bedelsiz',
      badgeColor: 'bg-emerald-500',
      isActive: true,
    },
    {
      id: 'camp-2',
      code: 'CAMP-002',
      title: '5.000 ₺ Üzerine Anında %5 Ciro İndirimi',
      description: 'Sepet toplamı 5.000 ₺ ve üzeri olan tüm toptan siparişlerde fatura altı net %5 ekstra indirim uygulanır.',
      type: 'cart_threshold_discount',
      thresholdAmount: 5000,
      discountPercent: 5,
      badgeText: '%5 İndirim',
      badgeColor: 'bg-amber-500',
      isActive: true,
    },
    {
      id: 'camp-3',
      code: 'CAMP-003',
      title: '5 Koli Sıvı Yağ Alana 1 Koli Barilla Makarna Hediye',
      description: '5 koli Yudum Ayçiçek Yağı 5L siparişine 1 koli Barilla Burgu Makarna (500gx20) hediye!',
      type: 'cross_product_gift',
      targetProductCode: 'STK-002',
      targetProductName: 'Yudum Ayçiçek Yağı 5L',
      minQuantity: 5,
      rewardProductCode: 'STK-004',
      rewardProductName: 'Barilla Burgu Makarna 500g',
      rewardQuantity: 1,
      badgeText: 'Çapraz Promosyon',
      badgeColor: 'bg-indigo-500',
      isActive: true,
    },
  ];

  res.json({ success: true, campaigns });
});

// Sunucuyu başlat
app.listen(PORT, async () => {
  console.log(`🚀 ERP12 Entegrasyon API Servisi http://localhost:${PORT} üzerinde çalışıyor.`);
  console.log(`📡 PWA uygulaması bu adrese bağlanacaktır.`);

  try {
    const ok = await testConnection();
    if (ok) {
      console.log('✅ OSMANLIGIDA veritabanı bağlantısı aktif ve hazır.');
    }
  } catch (err) {
    console.warn('⚠️ Veritabanı testi uyarısı:', err.message);
  }
});
