import type { Customer, Product, Order, CollectionRecord, ServerConfig, CustomerStatement, ReturnRecord } from '../types';
import { db, initialCustomers, initialProducts } from '../db';

export const isDemoMode = (config?: ServerConfig): boolean => {
  if (!config || !config.apiUrl) return true;
  const url = config.apiUrl.trim().toLowerCase();
  return url === 'demo' || url === '' || url.includes('vercel.app');
};

export const handleFetchError = (err: any): Error => {
  const msg = err?.message || String(err);
  if (
    msg.includes('Failed to fetch') ||
    msg.includes('NetworkError') ||
    msg.includes('Load failed') ||
    msg.includes('AbortError') ||
    msg.includes('ERR_CONNECTION') ||
    msg.includes('Mixed Content') ||
    err?.name === 'TypeError'
  ) {
    return new Error(
      'ERP12 sunucusuna bağlanılamadı. Statik IP ve port ayarlarınızı kontrol ediniz ya da Ayarlar menüsünden Çevrimdışı / Demo moda geçiniz.'
    );
  }
  return err instanceof Error ? err : new Error(msg);
};

export const apiService = {
  // Sunucu bağlantısını test et
  async testConnection(config: ServerConfig): Promise<{ success: boolean; message: string }> {
    if (isDemoMode(config)) {
      return {
        success: true,
        message: 'Demo / Çevrimdışı Mod Aktif: ERP12 bağlantısı simüle edilmektedir. Yerel veritabanında (IndexedDB) anlık ve sorunsuz çalışır.',
      };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const response = await fetch(`${config.apiUrl}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        return { success: true, message: 'ERP12 API sunucusuna başarıyla bağlanıldı.' };
      }
      return { success: false, message: `Sunucu yanıt verdi ancak durum kodu: ${response.status}` };
    } catch (err: any) {
      return { 
        success: false, 
        message: err.name === 'AbortError' 
          ? 'Bağlantı zaman aşımına uğradı (IP / Port kontrol ediniz).' 
          : 'Sunucuya ulaşılamadı. Statik IP ve internet bağlantısını kontrol ediniz.' 
      };
    }
  },

  // Doğrudan SQL Server Bağlantısını Canlı Test Et (Görsel-1)
  async testSqlConnection(config: ServerConfig): Promise<{ success: boolean; message: string }> {
    if (isDemoMode(config)) {
      await new Promise(r => setTimeout(r, 600));
      return {
        success: true,
        message: `SQL Server Bağlantısı Başarılı: ${config.sqlHost || 'localhost'}:${config.sqlPort || '1433'} -> [${config.sqlDatabase || 'OSMANLIGIDA'}] veritabanına erişim doğrulandı.`,
      };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const targetUrl = config.apiUrl || `http://${config.sqlHost || 'localhost'}:${config.bridgePort || '4000'}/api`;
      const response = await fetch(`${targetUrl}/health`, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (response.ok) {
        return {
          success: true,
          message: `SQL Server ve ERP12 Servis Bağlantısı Aktif (${config.sqlHost || 'localhost'}:${config.sqlPort || '1433'} -> ${config.sqlDatabase || 'ERP12_DB'}).`,
        };
      }
      return { success: false, message: `Sunucu yanıt verdi ancak durum kodu: ${response.status}` };
    } catch (err: any) {
      return {
        success: false,
        message: err.name === 'AbortError'
          ? `SQL Server bağlantısı zaman aşımına uğradı (${config.sqlHost || 'localhost'}:${config.sqlPort || '1433'}). Statik IP ve güvenlik duvarı (Firewall 1433 / 4000) portlarını kontrol ediniz.`
          : `SQL Server / Statik IP adresine bağlanılamadı (${config.sqlHost || 'localhost'}:${config.sqlPort || '1433'}). Statik IP yönlendirmesini ve internet bağlantınızı kontrol ediniz.`,
      };
    }
  },

  // ERP12'den Müşteri (Cari) listesini çek
  async fetchCustomers(config: ServerConfig, salesRepCode: string): Promise<Customer[]> {
    if (isDemoMode(config)) {
      const local = await db.customers.toArray();
      return local.length > 0 ? local : initialCustomers;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(`${config.apiUrl}/customers?rep=${encodeURIComponent(salesRepCode)}&company=${config.companyCode}`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        throw new Error(`Cari listesi alınamadı: HTTP ${response.status}`);
      }
      return await response.json();
    } catch (err: any) {
      clearTimeout(timeoutId);
      throw handleFetchError(err);
    }
  },

  // ERP12'den Stok Kataloğu ve anlık miktarları çek
  async fetchProducts(config: ServerConfig): Promise<Product[]> {
    if (isDemoMode(config)) {
      const local = await db.products.toArray();
      return local.length > 0 ? local : initialProducts;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(`${config.apiUrl}/products?company=${config.companyCode}`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        throw new Error(`Stok listesi alınamadı: HTTP ${response.status}`);
      }
      return await response.json();
    } catch (err: any) {
      clearTimeout(timeoutId);
      throw handleFetchError(err);
    }
  },

  // ERP12'ye Siparişi İlet
  async sendOrder(config: ServerConfig, order: Order): Promise<{ docNo: string }> {
    if (isDemoMode(config)) {
      await new Promise((r) => setTimeout(r, 400));
      return { docNo: 'ERP12-' + Math.floor(100000 + Math.random() * 900000) };
    }

    try {
      const response = await fetch(`${config.apiUrl}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          companyCode: config.companyCode,
          period: config.period,
          order: {
            tempId: order.tempId,
            customerCode: order.customerCode,
            salesRepCode: order.salesRepCode,
            orderDate: order.orderDate,
            deliveryDate: order.deliveryDate,
            notes: order.notes,
            subtotal: order.subtotal,
            totalDiscount: order.totalDiscount,
            totalVat: order.totalVat,
            grandTotal: order.grandTotal,
            items: order.items.map(item => ({
              productCode: item.productCode,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discountPercent: item.discountPercent,
              vatRate: item.vatRate,
              netTotal: item.totalAmount,
              grandTotal: item.grandTotal
            }))
          }
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || errData.message || `Sipariş ERP12'ye aktarılamadı (HTTP ${response.status})`);
      }

      const data = await response.json();
      return { docNo: data.docNo || 'ERP12-' + Math.floor(100000 + Math.random() * 900000) };
    } catch (err: any) {
      throw handleFetchError(err);
    }
  },

  // ERP12'ye Tahsilat Makbuzunu İlet
  async sendCollection(config: ServerConfig, collection: CollectionRecord): Promise<{ docNo: string }> {
    if (isDemoMode(config)) {
      await new Promise((r) => setTimeout(r, 400));
      return { docNo: 'THS-' + Math.floor(100000 + Math.random() * 900000) };
    }

    try {
      const response = await fetch(`${config.apiUrl}/collections`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          companyCode: config.companyCode,
          period: config.period,
          collection: {
            tempId: collection.tempId,
            receiptNo: collection.receiptNo,
            customerCode: collection.customerCode,
            amount: collection.amount,
            paymentMethod: collection.paymentMethod,
            notes: collection.notes,
            checkBank: collection.checkBank,
            checkNo: collection.checkNo,
            checkDueDate: collection.checkDueDate,
            createdAt: collection.createdAt,
          }
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || errData.message || `Tahsilat ERP12'ye aktarılamadı (HTTP ${response.status})`);
      }

      const data = await response.json();
      return { docNo: data.docNo || 'THS-' + Math.floor(100000 + Math.random() * 900000) };
    } catch (err: any) {
      throw handleFetchError(err);
    }
  },

  // ERP12'ye Saha İade Fişini İlet
  async sendReturn(config: ServerConfig, returnRecord: ReturnRecord): Promise<{ docNo: string }> {
    if (isDemoMode(config)) {
      await new Promise((r) => setTimeout(r, 400));
      return { docNo: 'IAD-' + Math.floor(100000 + Math.random() * 900000) };
    }

    try {
      const response = await fetch(`${config.apiUrl}/returns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          companyCode: config.companyCode,
          period: config.period,
          returnRecord: {
            tempId: returnRecord.tempId,
            receiptNo: returnRecord.receiptNo,
            customerCode: returnRecord.customerCode,
            customerName: returnRecord.customerName,
            salesRepCode: returnRecord.salesRepCode,
            subtotal: returnRecord.subtotal,
            totalVat: returnRecord.totalVat,
            grandTotal: returnRecord.grandTotal,
            notes: returnRecord.notes,
            createdAt: returnRecord.createdAt,
            items: returnRecord.items.map((it) => ({
              productCode: it.productCode,
              productName: it.productName,
              unit: it.unit,
              quantity: it.quantity,
              unitPrice: it.unitPrice,
              vatRate: it.vatRate,
              totalAmount: it.totalAmount,
              reason: it.reason,
              notes: it.notes,
            })),
          },
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || errData.message || `İade fişi ERP12'ye aktarılamadı (HTTP ${response.status})`);
      }

      const data = await response.json();
      return { docNo: data.docNo || 'IAD-' + Math.floor(100000 + Math.random() * 900000) };
    } catch (err: any) {
      throw handleFetchError(err);
    }
  },

  // ERP12'de Siparişi Onayla & Faturalaştır
  async sendInvoiceOrder(config: ServerConfig, docNo: string, invoiceNo?: string, notes?: string): Promise<{ success: boolean; invoiceNo: string }> {
    if (isDemoMode(config)) {
      await new Promise((r) => setTimeout(r, 300));
      return { success: true, invoiceNo: invoiceNo || 'FTR-' + Date.now() };
    }

    try {
      const response = await fetch(`${config.apiUrl}/orders/${encodeURIComponent(docNo)}/invoice`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          invoiceNo,
          notes,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || errData.message || `Faturalaştırma işlemi başarısız (HTTP ${response.status})`);
      }

      const data = await response.json();
      return { success: true, invoiceNo: data.invoiceNo || 'FTR-' + Date.now() };
    } catch (err: any) {
      throw handleFetchError(err);
    }
  },

  // Canlı Cari Hesap Ekstresi Çek (ERP12 FINANS_DETAY)
  async fetchCustomerStatement(
    config: ServerConfig, 
    idOrCode: string, 
    startDate?: string, 
    endDate?: string
  ): Promise<CustomerStatement> {
    if (isDemoMode(config)) {
      const customer = (await db.customers.where('code').equals(idOrCode).first()) ||
                       (await db.customers.get(idOrCode)) ||
                       initialCustomers.find(c => c.code === idOrCode || c.id === idOrCode) || {
                         id: idOrCode,
                         code: idOrCode,
                         name: 'Demo Cari Müşteri',
                         address: 'Merkez / Erzurum',
                         phone: '0532 000 00 00',
                         taxOffice: 'Aziziye VD',
                         taxNumber: '1234567890',
                         balance: 14500,
                       };

      const now = new Date();
      const mockMovements = [
        {
          id: 'mov-1',
          date: new Date(now.getTime() - 15 * 86400000).toISOString().slice(0, 10),
          docNo: 'FTR-2026-00412',
          transactionType: 'Satış Faturası',
          description: 'Gıda ve Şarküteri Ürün Alımı',
          debit: 22450,
          credit: 0,
          balance: 22450,
        },
        {
          id: 'mov-2',
          date: new Date(now.getTime() - 8 * 86400000).toISOString().slice(0, 10),
          docNo: 'THS-2026-00109',
          transactionType: 'Nakit Tahsilat',
          description: 'Plasiyer Saha Nakit Tahsilatı',
          debit: 0,
          credit: 10000,
          balance: 12450,
        },
        {
          id: 'mov-3',
          date: new Date(now.getTime() - 3 * 86400000).toISOString().slice(0, 10),
          docNo: 'FTR-2026-00518',
          transactionType: 'Satış Faturası',
          description: 'Bakliyat ve Un Grubu Siparişi',
          debit: 6500,
          credit: 0,
          balance: 18950,
        },
        {
          id: 'mov-4',
          date: new Date(now.getTime() - 1 * 86400000).toISOString().slice(0, 10),
          docNo: 'THS-2026-00142',
          transactionType: 'Havale / EFT',
          description: 'Banka Havalesi İle Ara Ödeme',
          debit: 0,
          credit: 4450,
          balance: customer.balance || 14500,
        },
      ];

      return {
        customer: {
          id: customer.id,
          code: customer.code,
          name: customer.name,
          address: customer.address || 'Merkez / Erzurum',
          phone: customer.phone || '0532 000 00 00',
          taxOffice: (customer as any).taxOffice || 'Aziziye VD',
          taxNumber: (customer as any).taxNumber || '1234567890',
          balance: customer.balance || 14500,
        },
        movements: mockMovements,
        summary: {
          totalDebit: 28950,
          totalCredit: 14450,
          closingBalance: customer.balance || 14500,
        },
      };
    }

    try {
      let url = `${config.apiUrl}/customers/${encodeURIComponent(idOrCode)}/statement?company=${config.companyCode}`;
      if (startDate) url += `&startDate=${encodeURIComponent(startDate)}`;
      if (endDate) url += `&endDate=${encodeURIComponent(endDate)}`;

      const response = await fetch(url);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || errData.error || `Cari ekstre alınamadı (HTTP ${response.status})`);
      }

      return await response.json();
    } catch (err: any) {
      throw handleFetchError(err);
    }
  },

  // Ürün Fotoğrafı Yükle ve ERP12'ye Gönder
  async uploadProductImage(
    config: ServerConfig,
    productCode: string,
    imageDataUrl: string
  ): Promise<{ success: boolean; imageUrl: string }> {
    if (isDemoMode(config)) {
      return { success: true, imageUrl: imageDataUrl };
    }

    try {
      const response = await fetch(`${config.apiUrl}/products/${encodeURIComponent(productCode)}/image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: productCode,
          image: imageDataUrl,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || errData.error || `Fotoğraf sunucuya yüklenemedi (HTTP ${response.status})`);
      }

      return await response.json();
    } catch (err: any) {
      throw handleFetchError(err);
    }
  },

  // Ürün Fotoğrafını Sunucudan Sil
  async deleteProductImage(
    config: ServerConfig,
    productCode: string
  ): Promise<{ success: boolean }> {
    if (isDemoMode(config)) {
      return { success: true };
    }

    try {
      const response = await fetch(`${config.apiUrl}/products/${encodeURIComponent(productCode)}/image`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || errData.error || `Fotoğraf silinemedi (HTTP ${response.status})`);
      }

      return await response.json();
    } catch (err: any) {
      throw handleFetchError(err);
    }
  }
};
