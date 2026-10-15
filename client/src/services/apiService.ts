import type { Customer, Product, Order, CollectionRecord, ServerConfig, CustomerStatement, ReturnRecord } from '../types';

export const apiService = {
  // Sunucu bağlantısını test et
  async testConnection(config: ServerConfig): Promise<{ success: boolean; message: string }> {
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

  // ERP12'den Müşteri (Cari) listesini çek
  async fetchCustomers(config: ServerConfig, salesRepCode: string): Promise<Customer[]> {
    const response = await fetch(`${config.apiUrl}/customers?rep=${encodeURIComponent(salesRepCode)}&company=${config.companyCode}`);
    if (!response.ok) {
      throw new Error(`Cari listesi alınamadı: HTTP ${response.status}`);
    }
    return await response.json();
  },

  // ERP12'den Stok Kataloğu ve anlık miktarları çek
  async fetchProducts(config: ServerConfig): Promise<Product[]> {
    const response = await fetch(`${config.apiUrl}/products?company=${config.companyCode}`);
    if (!response.ok) {
      throw new Error(`Stok listesi alınamadı: HTTP ${response.status}`);
    }
    return await response.json();
  },

  // ERP12'ye Siparişi İlet
  async sendOrder(config: ServerConfig, order: Order): Promise<{ docNo: string }> {
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
  },

  // ERP12'ye Tahsilat Makbuzunu İlet
  async sendCollection(config: ServerConfig, collection: CollectionRecord): Promise<{ docNo: string }> {
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
  },

  // ERP12'ye Saha İade Fişini İlet
  async sendReturn(config: ServerConfig, returnRecord: ReturnRecord): Promise<{ docNo: string }> {
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
  },

  // ERP12'de Siparişi Onayla & Faturalaştır
  async sendInvoiceOrder(config: ServerConfig, docNo: string, invoiceNo?: string, notes?: string): Promise<{ success: boolean; invoiceNo: string }> {
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
  },

  // Canlı Cari Hesap Ekstresi Çek (ERP12 FINANS_DETAY)
  async fetchCustomerStatement(
    config: ServerConfig, 
    idOrCode: string, 
    startDate?: string, 
    endDate?: string
  ): Promise<CustomerStatement> {
    let url = `${config.apiUrl}/customers/${encodeURIComponent(idOrCode)}/statement?company=${config.companyCode}`;
    if (startDate) url += `&startDate=${encodeURIComponent(startDate)}`;
    if (endDate) url += `&endDate=${encodeURIComponent(endDate)}`;

    const response = await fetch(url);
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.detail || errData.error || `Cari ekstre alınamadı (HTTP ${response.status})`);
    }

    return await response.json();
  },

  // Ürün Fotoğrafı Yükle ve ERP12'ye Gönder
  async uploadProductImage(
    config: ServerConfig,
    productCode: string,
    imageDataUrl: string
  ): Promise<{ success: boolean; imageUrl: string }> {
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
  },

  // Ürün Fotoğrafını Sunucudan Sil
  async deleteProductImage(
    config: ServerConfig,
    productCode: string
  ): Promise<{ success: boolean }> {
    const response = await fetch(`${config.apiUrl}/products/${encodeURIComponent(productCode)}/image`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.detail || errData.error || `Fotoğraf silinemedi (HTTP ${response.status})`);
    }

    return await response.json();
  }
};


