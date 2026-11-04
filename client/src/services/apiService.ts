import type { Customer, Product, Order, CollectionRecord, ServerConfig, CustomerStatement, CustomerHistoryResponse, CustomerHistoryItem, CustomerHistoryFinancial, ReturnRecord } from '../types';
import { db, initialCustomers, initialProducts } from '../db';

export const isDemoMode = (config?: ServerConfig): boolean => {
  if (!config || !config.apiUrl) return true;
  const url = config.apiUrl.trim().toLowerCase();
  return url === 'demo' || url === '';
};

export const resolveApiBaseUrl = (config?: ServerConfig): string => {
  if (typeof window === 'undefined') return '/api';
  const host = window.location.hostname;
  const protocol = window.location.protocol;
  const port = window.location.port;

  // HTTPS / bulut domain (plasiyer.vercel.app vb.) veya Vite dev proxy (5173) -> '/api'
  if (protocol === 'https:' || host.includes('vercel.app') || port === '5173') {
    return '/api';
  }

  // Yerel HTTP ortamında yerel Node.js servisine bağlan (uzak SQL IP'sine doğrudan TCP ile Node.js bağlanır)
  const bridge = config?.bridgePort?.trim() || '4000';
  return `http://${host || 'localhost'}:${bridge}/api`;
};

const encodeUtf8Base64 = (str: string): string => {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
};

export const buildSqlHeaders = (config?: ServerConfig): Record<string, string> => {
  if (!config || !config.sqlHost || !config.sqlHost.trim()) return {};
  const payload = {
    sqlHost: config.sqlHost.trim(),
    sqlPort: (config.sqlPort || '1433').trim(),
    sqlDatabase: (config.sqlDatabase || '').trim(),
    sqlUser: (config.sqlUser || '').trim(),
    sqlPassword: config.sqlPassword ?? '',
  };
  return {
    'X-SQL-Config': encodeUtf8Base64(JSON.stringify(payload)),
  };
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
      'SQL sunucu servisine ulaşılamadı. İnternet bağlantınızı ve SQL Server bağlantı bilgilerinizi kontrol ediniz.'
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

    if (config.sqlHost && config.sqlHost.trim()) {
      return this.testSqlConnection(config);
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(`${resolveApiBaseUrl(config)}/health`, {
        headers: {
          ...buildSqlHeaders(config),
        },
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
    if (!config.sqlHost && isDemoMode(config)) {
      await new Promise(r => setTimeout(r, 400));
      return {
        success: true,
        message: `Demo Mod Aktif: Yerel veritabanında çevrimdışı çalışılmaktadır.`,
      };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const baseUrl = resolveApiBaseUrl(config);
      const response = await fetch(`${baseUrl}/sql/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...buildSqlHeaders(config),
        },
        body: JSON.stringify({
          sqlHost: (config.sqlHost || 'localhost').trim(),
          sqlPort: (config.sqlPort || '1433').trim(),
          sqlDatabase: (config.sqlDatabase || '').trim(),
          sqlUser: (config.sqlUser || '').trim(),
          sqlPassword: config.sqlPassword ?? '',
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await response.json().catch(() => null);
      if (data && typeof data.success === 'boolean') {
        return {
          success: data.success,
          message: data.message || (data.success ? 'SQL Server bağlantısı başarılı.' : 'SQL Server bağlantısı başarısız.'),
        };
      }

      if (response.ok) {
        return {
          success: true,
          message: `SQL Server Bağlantısı Aktif (${config.sqlHost || 'localhost'}:${config.sqlPort || '1433'} -> ${config.sqlDatabase || 'ERP12_DB'}).`,
        };
      }
      return { success: false, message: `Sunucu yanıt verdi ancak durum kodu: ${response.status}` };
    } catch (err: any) {
      return {
        success: false,
        message: err.name === 'AbortError'
          ? `SQL Server bağlantısı zaman aşımına uğradı (${config.sqlHost || 'localhost'}:${config.sqlPort || '1433'}). Statik IP ve SQL port yönlendirmesini (${config.sqlPort || '1433'}) kontrol ediniz.`
          : `SQL Server bağlantı servisine ulaşılamadı (${config.sqlHost || 'localhost'}:${config.sqlPort || '1433'}). İnternet bağlantınızı kontrol edip tekrar deneyiniz.`,
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
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    try {
      const baseUrl = resolveApiBaseUrl(config);
      const response = await fetch(`${baseUrl}/customers?rep=${encodeURIComponent(salesRepCode)}&company=${encodeURIComponent(config.companyCode || '01')}`, {
        headers: {
          ...buildSqlHeaders(config),
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || errData.error || `Cari listesi alınamadı: HTTP ${response.status}`);
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
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    try {
      const baseUrl = resolveApiBaseUrl(config);
      const response = await fetch(`${baseUrl}/products?company=${encodeURIComponent(config.companyCode || '01')}`, {
        headers: {
          ...buildSqlHeaders(config),
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || errData.error || `Stok listesi alınamadı: HTTP ${response.status}`);
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
      const baseUrl = resolveApiBaseUrl(config);
      const response = await fetch(`${baseUrl}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...buildSqlHeaders(config),
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
      const response = await fetch(`${resolveApiBaseUrl(config)}/collections`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...buildSqlHeaders(config),
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
      const response = await fetch(`${resolveApiBaseUrl(config)}/returns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...buildSqlHeaders(config),
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
      const response = await fetch(`${resolveApiBaseUrl(config)}/orders/${encodeURIComponent(docNo)}/invoice`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...buildSqlHeaders(config),
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
      let url = `${resolveApiBaseUrl(config)}/customers/${encodeURIComponent(idOrCode)}/statement?company=${encodeURIComponent(config.companyCode || '01')}`;
      if (startDate) url += `&startDate=${encodeURIComponent(startDate)}`;
      if (endDate) url += `&endDate=${encodeURIComponent(endDate)}`;

      const response = await fetch(url, {
        headers: {
          ...buildSqlHeaders(config),
        },
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || errData.error || `Cari ekstre alınamadı (HTTP ${response.status})`);
      }

      return await response.json();
    } catch (err: any) {
      throw handleFetchError(err);
    }
  },

  // Cari Geçmiş Yıllar Dahil Tüm Ürün Alımları ve İşlem Detaylarını Çek
  async fetchCustomerHistory(
    config: ServerConfig,
    idOrCode: string
  ): Promise<CustomerHistoryResponse> {
    // Yerel IndexedDB'deki bekleyen veya demo sipariş / iade / tahsilat kayıtlarını hazırla
    const collectLocalHistory = async (custId: string, custCode: string, includeSynced: boolean) => {
      const [orders, returns, collections] = await Promise.all([
        db.orders.toArray(),
        db.returns.toArray(),
        db.collections.toArray(),
      ]);

      const localItems: CustomerHistoryItem[] = [];
      const localFins: CustomerHistoryFinancial[] = [];

      orders
        .filter((o) => (o.customerId === custId || o.customerCode === custCode) && (includeSynced || o.status !== 'synced'))
        .forEach((ord) => {
          const d = (ord.orderDate || ord.createdAt || '').slice(0, 10);
          const t = (ord.createdAt || '').slice(11, 16);
          const yr = Number(d.slice(0, 4)) || new Date().getFullYear();
          (ord.items || []).forEach((it, idx) => {
            localItems.push({
              id: `local-ord-${ord.id || ord.tempId}-${idx}`,
              year: yr,
              date: d,
              time: t,
              docNo: ord.erp12DocNo || ord.tempId,
              docType: 'Mobil Sipariş',
              isReturn: false,
              productId: it.productId,
              productCode: it.productCode,
              productName: it.productName,
              unit: it.unit || 'Adet',
              quantity: it.quantity,
              unitPrice: it.unitPrice,
              discount: it.discountPercent ? String(it.discountPercent) : '',
              vatRate: it.vatRate || 1,
              netTotal: it.totalAmount,
              grandTotal: it.grandTotal,
            });
          });
        });

      returns
        .filter((r) => (r.customerId === custId || r.customerCode === custCode) && (includeSynced || r.syncStatus !== 'synced'))
        .forEach((ret) => {
          const d = (ret.createdAt || '').slice(0, 10);
          const t = (ret.createdAt || '').slice(11, 16);
          const yr = Number(d.slice(0, 4)) || new Date().getFullYear();
          (ret.items || []).forEach((it, idx) => {
            localItems.push({
              id: `local-ret-${ret.id || ret.tempId}-${idx}`,
              year: yr,
              date: d,
              time: t,
              docNo: ret.receiptNo || ret.tempId,
              docType: 'Saha İade Fişi',
              isReturn: true,
              productId: it.productId,
              productCode: it.productCode,
              productName: it.productName,
              unit: it.unit || 'Adet',
              quantity: it.quantity,
              unitPrice: it.unitPrice,
              discount: '',
              vatRate: it.vatRate || 1,
              netTotal: it.totalAmount,
              grandTotal: Math.round(it.totalAmount * (1 + (it.vatRate || 1) / 100) * 100) / 100,
            });
          });
        });

      collections
        .filter((c) => (c.customerId === custId || c.customerCode === custCode) && (includeSynced || c.syncStatus !== 'synced'))
        .forEach((col) => {
          const d = (col.createdAt || '').slice(0, 10);
          const t = (col.createdAt || '').slice(11, 16);
          const yr = Number(d.slice(0, 4)) || new Date().getFullYear();
          const methodLabel =
            col.paymentMethod === 'kredi_karti'
              ? 'POS / Kredi Kartı Tahsilatı'
              : col.paymentMethod === 'havale'
              ? 'Banka Havale / EFT'
              : col.paymentMethod === 'cek'
              ? 'Çek Tahsilatı'
              : 'Nakit Tahsilat';
          localFins.push({
            id: `local-col-${col.id || col.tempId}`,
            year: yr,
            date: d,
            time: t,
            docNo: col.receiptNo || col.tempId,
            transactionType: methodLabel,
            description: col.notes || 'Mobil saha tahsilatı',
            debit: 0,
            credit: col.amount,
          });
        });

      return { localItems, localFins };
    };

    if (isDemoMode(config)) {
      const customer =
        (await db.customers.where('code').equals(idOrCode).first()) ||
        (await db.customers.get(idOrCode)) ||
        initialCustomers.find((c) => c.code === idOrCode || c.id === idOrCode) || {
          id: idOrCode,
          code: idOrCode,
          name: 'Cari Müşteri',
          balance: 14500,
        };

      const prods = await db.products.toArray();
      const catalog = prods.length > 0 ? prods : initialProducts;
      const seed = String(customer.code || customer.id)
        .split('')
        .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);

      const demoDates = [
        { date: '2026-10-24', time: '14:20', docNo: 'OSM2026000008412', docType: 'Satış faturası', isReturn: false },
        { date: '2026-09-12', time: '11:05', docNo: 'OSM2026000007190', docType: 'Satış faturası', isReturn: false },
        { date: '2026-06-18', time: '16:40', docNo: 'FS-2026-003410', docType: 'Satış fişi', isReturn: false },
        { date: '2025-11-19', time: '10:15', docNo: 'OSM2025000011204', docType: 'Satış faturası', isReturn: false },
        { date: '2025-07-08', time: '15:30', docNo: 'FS-2025-006128', docType: 'Satıştan iade fişi', isReturn: true },
        { date: '2024-12-04', time: '09:50', docNo: 'OSM2024000009841', docType: 'Satış faturası', isReturn: false },
      ];

      const demoItems: CustomerHistoryItem[] = [];
      const demoFins: CustomerHistoryFinancial[] = [];

      demoDates.forEach((doc, dIdx) => {
        const year = Number(doc.date.slice(0, 4));
        let docTotal = 0;
        const lineCount = doc.isReturn ? 1 : 2 + ((seed + dIdx) % 2);

        for (let i = 0; i < lineCount; i++) {
          const p = catalog[(seed + dIdx * 3 + i) % catalog.length];
          if (!p) continue;
          const qty = doc.isReturn ? 2 : 4 + ((seed + dIdx + i * 5) % 15);
          const yearFactor = year === 2024 ? 0.78 : year === 2025 ? 0.9 : 1;
          const unitPrice = Math.max(10, Math.round((p.price1 || 100) * yearFactor * 100) / 100);
          const netTotal = Math.round(qty * unitPrice * 100) / 100;
          const grandTotal = Math.round(netTotal * (1 + (p.vatRate || 1) / 100) * 100) / 100;
          docTotal += grandTotal;

          demoItems.push({
            id: `demo-it-${dIdx}-${i}`,
            year,
            date: doc.date,
            time: doc.time,
            docNo: doc.docNo,
            docType: doc.docType,
            isReturn: doc.isReturn,
            productId: p.id,
            productCode: p.code,
            productName: p.name,
            unit: p.unit || 'Adet',
            quantity: qty,
            unitPrice,
            discount: '',
            vatRate: p.vatRate || 1,
            netTotal,
            grandTotal,
          });
        }

        demoFins.push({
          id: `demo-fin-${dIdx}`,
          year,
          date: doc.date,
          time: doc.time,
          docNo: doc.docNo,
          transactionType: doc.docType,
          description: doc.isReturn ? 'Ürün iade mahsubu' : 'Toptan ürün satışı',
          debit: doc.isReturn ? 0 : Math.round(docTotal * 100) / 100,
          credit: doc.isReturn ? Math.round(docTotal * 100) / 100 : 0,
        });
      });

      demoFins.push({
        id: 'demo-fin-ths-1',
        year: 2026,
        date: '2026-10-14',
        time: '13:45',
        docNo: 'THS-2026-00418',
        transactionType: 'Nakit tahsilat',
        description: 'Plasiyer saha tahsilatı',
        debit: 0,
        credit: 12500,
      });

      const { localItems, localFins } = await collectLocalHistory(customer.id, customer.code, true);
      const mergedItems = [...localItems, ...demoItems].sort((a, b) =>
        `${b.date} ${b.time || ''}`.localeCompare(`${a.date} ${a.time || ''}`)
      );
      const mergedFins = [...localFins, ...demoFins].sort((a, b) =>
        `${b.date} ${b.time || ''}`.localeCompare(`${a.date} ${a.time || ''}`)
      );

      const years = Array.from(
        new Set([...mergedItems.map((i) => i.year), ...mergedFins.map((f) => f.year)])
      ).sort((a, b) => b - a);

      return {
        customer: {
          id: customer.id,
          code: customer.code,
          name: customer.name,
          balance: customer.balance || 0,
        },
        years,
        items: mergedItems,
        financials: mergedFins,
      };
    }

    try {
      const url = `${resolveApiBaseUrl(config)}/customers/${encodeURIComponent(idOrCode)}/history?company=${encodeURIComponent(config.companyCode || '01')}`;
      const response = await fetch(url, {
        headers: {
          ...buildSqlHeaders(config),
        },
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || errData.error || `Cari işlem geçmişi alınamadı (HTTP ${response.status})`);
      }

      const data: CustomerHistoryResponse = await response.json();
      const { localItems, localFins } = await collectLocalHistory(
        data.customer.id,
        data.customer.code,
        false
      );

      const mergedItems = [...localItems, ...(data.items || [])].sort((a, b) =>
        `${b.date} ${b.time || ''}`.localeCompare(`${a.date} ${a.time || ''}`)
      );
      const mergedFins = [...localFins, ...(data.financials || [])].sort((a, b) =>
        `${b.date} ${b.time || ''}`.localeCompare(`${a.date} ${a.time || ''}`)
      );
      const years = Array.from(
        new Set([...(data.years || []), ...mergedItems.map((i) => i.year), ...mergedFins.map((f) => f.year)])
      ).sort((a, b) => b - a);

      return {
        ...data,
        years,
        items: mergedItems,
        financials: mergedFins,
      };
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
      const response = await fetch(`${resolveApiBaseUrl(config)}/products/${encodeURIComponent(productCode)}/image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...buildSqlHeaders(config),
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
      const response = await fetch(`${resolveApiBaseUrl(config)}/products/${encodeURIComponent(productCode)}/image`, {
        method: 'DELETE',
        headers: {
          ...buildSqlHeaders(config),
        },
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
