import { db } from '../db';
import { apiService, isDemoMode } from './apiService';
import type { ServerConfig, CompanyIssuerInfo } from '../types';

export interface SyncResult {
  success: boolean;
  customersCount?: number;
  productsCount?: number;
  companyInfo?: CompanyIssuerInfo | null;
  syncedOrdersCount?: number;
  failedOrdersCount?: number;
  syncedCollectionsCount?: number;
  failedCollectionsCount?: number;
  syncedReturnsCount?: number;
  failedReturnsCount?: number;
  error?: string;
}

export const syncService = {
  // ERP12'den Müşteri ve Stokları Yerel Veritabanına (IndexedDB) İndir
  async pullDataFromERP(config: ServerConfig, salesRepCode: string): Promise<SyncResult> {
    try {
      // Eğer API URL ayarlı değilse veya demo modundaysa
      if (isDemoMode(config)) {
        await new Promise((r) => setTimeout(r, 80));
        const cCount = await db.customers.count();
        const pCount = await db.products.count();
        return {
          success: true,
          customersCount: cCount,
          productsCount: pCount,
        };
      }

      // Canlı API'den verileri çek (Gzip ve SQL bağlantı havuzuyla son derece hızlı)
      const [customers, products, companyInfo, remoteOrders] = await Promise.all([
        apiService.fetchCustomers(config, salesRepCode),
        apiService.fetchProducts(config),
        apiService.fetchCompanyInfo(config).catch(() => null),
        apiService.fetchOrders(config).catch(() => []),
      ]);

      // ERP12'deki siparişleri yerel sipariş havuzuna (db.orders) eşitle
      if (Array.isArray(remoteOrders) && remoteOrders.length > 0) {
        await this.mergeRemoteOrdersIntoDb(remoteOrders);
      }

      // IndexedDB'yi güncelle (Diferansiyel ve Atomik: Arayüz titremesi veya sıfırlanma olmadan doğrudan güncelleme)
      await db.transaction('rw', [db.customers, db.products], async () => {
        if (Array.isArray(customers)) {
          const newCustIds = new Set(customers.map((c) => String(c.id)));
          const allCustKeys = await db.customers.toCollection().primaryKeys();
          const obsoleteCustKeys = allCustKeys.filter((id) => !newCustIds.has(String(id)));
          if (obsoleteCustKeys.length > 0) {
            await db.customers.bulkDelete(obsoleteCustKeys as string[]);
          }
          if (customers.length > 0) {
            await db.customers.bulkPut(customers);
          }
        }

        if (Array.isArray(products)) {
          const existingProducts = await db.products.toArray();
          const localImageMap = new Map<string, string>();
          for (const p of existingProducts) {
            if (p.image) {
              const cKey = (p.code || '').trim().toUpperCase();
              const bKey = (p.barcode || '').trim().toUpperCase();
              const nKey = (p.name || '').trim().toUpperCase();
              if (cKey) localImageMap.set(`CODE:${cKey}`, p.image);
              if (bKey) localImageMap.set(`BARCODE:${bKey}`, p.image);
              if (nKey) localImageMap.set(`NAME:${nKey}`, p.image);
              if (p.id) localImageMap.set(`ID:${p.id}`, p.image);
            }
          }

          const mergedProducts = products.map((p) => {
            const cKey = (p.code || '').trim().toUpperCase();
            const bKey = (p.barcode || '').trim().toUpperCase();
            const nKey = (p.name || '').trim().toUpperCase();
            const localImg =
              (cKey ? localImageMap.get(`CODE:${cKey}`) : undefined) ||
              (bKey ? localImageMap.get(`BARCODE:${bKey}`) : undefined) ||
              (nKey ? localImageMap.get(`NAME:${nKey}`) : undefined) ||
              localImageMap.get(`ID:${p.id}`);

            const isCustomLocalPhoto =
              localImg &&
              ((localImg.startsWith('data:image/') && !localImg.startsWith('data:image/svg')) ||
                localImg.startsWith('/uploads/'));

            return {
              ...p,
              image: (isCustomLocalPhoto ? localImg : p.image || localImg) || undefined,
            };
          });

          const newProdIds = new Set(mergedProducts.map((p) => String(p.id)));
          const allProdKeys = await db.products.toCollection().primaryKeys();
          const obsoleteProdKeys = allProdKeys.filter((id) => !newProdIds.has(String(id)));
          if (obsoleteProdKeys.length > 0) {
            await db.products.bulkDelete(obsoleteProdKeys as string[]);
          }
          if (mergedProducts.length > 0) {
            await db.products.bulkPut(mergedProducts);
          }
        }
      });

      return {
        success: true,
        customersCount: customers.length,
        productsCount: products.length,
        companyInfo,
      };
    } catch (err: any) {
      console.error('Veri indirme hatası:', err);
      return {
        success: false,
        error: err.message || 'Veri çekilirken bir hata oluştu.',
      };
    }
  },

  async mergeRemoteOrdersIntoDb(remoteOrders: any[]): Promise<void> {
    if (!Array.isArray(remoteOrders) || remoteOrders.length === 0) return;
    await db.transaction('rw', db.orders, async () => {
      const localOrders = await db.orders.toArray();
      const remoteDocSet = new Set<string>();
      for (const rem of remoteOrders) {
        if (rem.erp12DocNo) remoteDocSet.add(String(rem.erp12DocNo).trim());
        if (rem.tempId) remoteDocSet.add(String(rem.tempId).trim());
      }

      // ERP12'de artık bulunmayan eski yerel 'synced' (senkronize edilmiş) kayıtları temizle
      // (Böylece aynı kullanıcı farklı cihazlarda birebir aynı sipariş listesini ve sayısını görür)
      const staleIds: number[] = [];
      const byDocNo = new Map<string, (typeof localOrders)[number]>();
      for (const loc of localOrders) {
        const k1 = (loc.erp12DocNo || '').trim();
        const k2 = (loc.tempId || '').trim();
        const existsInRemote = (k1 && remoteDocSet.has(k1)) || (k2 && remoteDocSet.has(k2));
        if (loc.status === 'synced' && !existsInRemote && loc.id) {
          staleIds.push(loc.id);
          continue;
        }
        if (k1) byDocNo.set(k1, loc);
        if (k2) byDocNo.set(k2, loc);
      }
      if (staleIds.length > 0) {
        await db.orders.bulkDelete(staleIds);
      }

      for (const rem of remoteOrders) {
        const key1 = (rem.erp12DocNo || '').trim();
        const key2 = (rem.tempId || '').trim();
        const existing = (key1 && byDocNo.get(key1)) || (key2 && byDocNo.get(key2));
        if (existing && existing.id) {
          await db.orders.update(existing.id, {
            status: 'synced',
            erp12DocNo: rem.erp12DocNo || existing.erp12DocNo,
            invoiceStatus: rem.invoiceStatus || existing.invoiceStatus,
            orderDate: rem.orderDate || existing.orderDate,
            createdAt: rem.createdAt || existing.createdAt,
            grandTotal: rem.grandTotal ?? existing.grandTotal,
            subtotal: rem.subtotal ?? existing.subtotal,
            totalVat: rem.totalVat ?? existing.totalVat,
            items: Array.isArray(rem.items) && rem.items.length > 0 ? rem.items : existing.items,
            errorMessage: undefined,
          });
        } else {
          const addedId = await db.orders.add(rem);
          const addedObj = { ...rem, id: addedId };
          if (key1) byDocNo.set(key1, addedObj);
          if (key2) byDocNo.set(key2, addedObj);
        }
      }
    });
  },

  async pullOrdersFromERP(config: ServerConfig): Promise<void> {
    if (isDemoMode(config)) return;
    try {
      const remoteOrders = await apiService.fetchOrders(config);
      if (Array.isArray(remoteOrders) && remoteOrders.length > 0) {
        await this.mergeRemoteOrdersIntoDb(remoteOrders);
      }
    } catch {
      // ignore offline
    }
  },

  // Yerel hafızada bekleyen (pending) veya ağ hatası almış (failed) siparişleri ERP12'ye gönder
  async pushPendingOrdersToERP(config: ServerConfig): Promise<SyncResult> {
    try {
      const pendingOrders = await db.orders
        .where('status')
        .anyOf(['pending', 'failed'])
        .toArray();

      if (pendingOrders.length === 0) {
        return { success: true, syncedOrdersCount: 0 };
      }

      let syncedCount = 0;
      let failedCount = 0;

      for (const order of pendingOrders) {
        try {
          if (!order.id) continue;

          // Durumu 'syncing' yap
          await db.orders.update(order.id, { status: 'syncing' });

          if (isDemoMode(config)) {
            await new Promise((r) => setTimeout(r, 60));
            const mockDocNo = 'ERP-' + Math.floor(100000 + Math.random() * 900000);
            await db.orders.update(order.id, {
              status: 'synced',
              erp12DocNo: mockDocNo,
              syncedAt: new Date().toISOString(),
              errorMessage: undefined,
            });
            syncedCount++;
          } else {
            // Gerçek API'ye gönder
            const result = await apiService.sendOrder(config, order);
            await db.orders.update(order.id, {
              status: 'synced',
              erp12DocNo: result.docNo,
              syncedAt: new Date().toISOString(),
              errorMessage: undefined,
            });
            syncedCount++;
          }
        } catch (itemErr: any) {
          failedCount++;
          if (order.id) {
            await db.orders.update(order.id, {
              status: 'failed',
              errorMessage: itemErr.message || 'ERP aktarım hatası',
            });
          }
        }
      }

      return {
        success: failedCount === 0,
        syncedOrdersCount: syncedCount,
        failedOrdersCount: failedCount,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Siparişler gönderilirken genel hata oluştu.',
      };
    }
  },

  // Yerel hafızada bekleyen (pending) veya ağ hatası almış (failed) tahsilatları ERP12'ye gönder
  async pushPendingCollectionsToERP(config: ServerConfig): Promise<SyncResult> {
    try {
      const pendingCollections = await db.collections
        .where('syncStatus')
        .anyOf(['pending', 'failed'])
        .toArray();

      if (pendingCollections.length === 0) {
        return { success: true, syncedCollectionsCount: 0 };
      }

      let syncedCount = 0;
      let failedCount = 0;

      for (const col of pendingCollections) {
        try {
          if (!col.id) continue;

          await db.collections.update(col.id, { syncStatus: 'syncing' });

          if (isDemoMode(config)) {
            await new Promise((r) => setTimeout(r, 60));
            const mockDocNo = 'THS-' + Math.floor(100000 + Math.random() * 900000);
            await db.collections.update(col.id, {
              syncStatus: 'synced',
              erpDocNo: mockDocNo,
              syncedAt: new Date().toISOString(),
              errorMessage: undefined,
            });
            syncedCount++;
          } else {
            const result = await apiService.sendCollection(config, col);
            await db.collections.update(col.id, {
              syncStatus: 'synced',
              erpDocNo: result.docNo,
              syncedAt: new Date().toISOString(),
              errorMessage: undefined,
            });
            syncedCount++;
          }
        } catch (itemErr: any) {
          failedCount++;
          if (col.id) {
            await db.collections.update(col.id, {
              syncStatus: 'failed',
              errorMessage: itemErr.message || 'ERP tahsilat aktarım hatası',
            });
          }
        }
      }

      return {
        success: failedCount === 0,
        syncedCollectionsCount: syncedCount,
        failedCollectionsCount: failedCount,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Tahsilatlar gönderilirken hata oluştu.',
      };
    }
  },

  // Yerel hafızada bekleyen (pending) veya ağ hatası almış (failed) iade fişlerini ERP12'ye gönder
  async pushPendingReturnsToERP(config: ServerConfig): Promise<SyncResult> {
    try {
      const pendingReturns = await db.returns
        .where('syncStatus')
        .anyOf(['pending', 'failed'])
        .toArray();

      if (pendingReturns.length === 0) {
        return { success: true, syncedReturnsCount: 0 };
      }

      let syncedCount = 0;
      let failedCount = 0;

      for (const ret of pendingReturns) {
        try {
          if (!ret.id) continue;

          await db.returns.update(ret.id, { syncStatus: 'syncing' });

          if (isDemoMode(config)) {
            await new Promise((r) => setTimeout(r, 60));
            const mockDocNo = 'IAD-' + Math.floor(100000 + Math.random() * 900000);
            await db.returns.update(ret.id, {
              syncStatus: 'synced',
              erpDocNo: mockDocNo,
              syncedAt: new Date().toISOString(),
              errorMessage: undefined,
            });
            syncedCount++;
          } else {
            const result = await apiService.sendReturn(config, ret);
            await db.returns.update(ret.id, {
              syncStatus: 'synced',
              erpDocNo: result.docNo,
              syncedAt: new Date().toISOString(),
              errorMessage: undefined,
            });
            syncedCount++;
          }
        } catch (itemErr: any) {
          failedCount++;
          if (ret.id) {
            await db.returns.update(ret.id, {
              syncStatus: 'failed',
              errorMessage: itemErr.message || 'ERP iade aktarım hatası',
            });
          }
        }
      }

      return {
        success: failedCount === 0,
        syncedReturnsCount: syncedCount,
        failedReturnsCount: failedCount,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'İade fişleri gönderilirken hata oluştu.',
      };
    }
  },

  // Tek tıkla tam senkronizasyon (Siparişler + Tahsilatlar + İadeler eşzamanlı gönderilir, güncel cari ve stoklar anında alınır)
  async fullSync(config: ServerConfig, salesRepCode: string): Promise<SyncResult> {
    const [pushOrdersRes, pushCollectionsRes, pushReturnsRes] = await Promise.all([
      this.pushPendingOrdersToERP(config),
      this.pushPendingCollectionsToERP(config),
      this.pushPendingReturnsToERP(config),
    ]);

    const pullRes = await this.pullDataFromERP(config, salesRepCode);

    return {
      success: pushOrdersRes.success && pushCollectionsRes.success && pushReturnsRes.success && pullRes.success,
      syncedOrdersCount: pushOrdersRes.syncedOrdersCount,
      failedOrdersCount: pushOrdersRes.failedOrdersCount,
      syncedCollectionsCount: pushCollectionsRes.syncedCollectionsCount,
      failedCollectionsCount: pushCollectionsRes.failedCollectionsCount,
      syncedReturnsCount: pushReturnsRes.syncedReturnsCount,
      failedReturnsCount: pushReturnsRes.failedReturnsCount,
      customersCount: pullRes.customersCount,
      productsCount: pullRes.productsCount,
      companyInfo: pullRes.companyInfo,
      error: pullRes.error || pushOrdersRes.error || pushCollectionsRes.error || pushReturnsRes.error,
    };
  }
};

