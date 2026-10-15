import { db } from '../db';
import { apiService } from './apiService';
import type { ServerConfig } from '../types';

export interface SyncResult {
  success: boolean;
  customersCount?: number;
  productsCount?: number;
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
      if (!config.apiUrl || config.apiUrl === 'demo') {
        // Demo senkronizasyon simülasyonu
        await new Promise((r) => setTimeout(r, 900));
        const cCount = await db.customers.count();
        const pCount = await db.products.count();
        return {
          success: true,
          customersCount: cCount,
          productsCount: pCount,
        };
      }

      // Canlı API'den verileri çek
      const [customers, products] = await Promise.all([
        apiService.fetchCustomers(config, salesRepCode),
        apiService.fetchProducts(config),
      ]);

      // IndexedDB'yi güncelle (Transaction ile atomik işlem & Fotoğrafları koruma)
      await db.transaction('rw', [db.customers, db.products], async () => {
        if (customers && customers.length > 0) {
          await db.customers.clear();
          await db.customers.bulkPut(customers);
        }
        if (products && products.length > 0) {
          const existingProducts = await db.products.toArray();
          const localImageMap = new Map<string, string>();
          for (const p of existingProducts) {
            if (p.image) {
              localImageMap.set(p.code, p.image);
              localImageMap.set(p.id, p.image);
            }
          }

          const mergedProducts = products.map((p) => {
            const localImg = localImageMap.get(p.code) || localImageMap.get(p.id);
            return {
              ...p,
              image: p.image || localImg || undefined,
            };
          });

          await db.products.clear();
          await db.products.bulkPut(mergedProducts);
        }
      });

      return {
        success: true,
        customersCount: customers.length,
        productsCount: products.length,
      };
    } catch (err: any) {
      console.error('Veri indirme hatası:', err);
      return {
        success: false,
        error: err.message || 'Veri çekilirken bir hata oluştu.',
      };
    }
  },

  // Yerel hafızada bekleyen (pending) siparişleri ERP12'ye gönder
  async pushPendingOrdersToERP(config: ServerConfig): Promise<SyncResult> {
    try {
      const pendingOrders = await db.orders.where('status').equals('pending').toArray();

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

          if (!config.apiUrl || config.apiUrl === 'demo') {
            // Canlı API yokken akışı test etmek için gerçekçi demo simülasyonu
            await new Promise((r) => setTimeout(r, 700));
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

  // Yerel hafızada bekleyen (pending) tahsilatları ERP12'ye gönder
  async pushPendingCollectionsToERP(config: ServerConfig): Promise<SyncResult> {
    try {
      const pendingCollections = await db.collections.where('syncStatus').equals('pending').toArray();

      if (pendingCollections.length === 0) {
        return { success: true, syncedCollectionsCount: 0 };
      }

      let syncedCount = 0;
      let failedCount = 0;

      for (const col of pendingCollections) {
        try {
          if (!col.id) continue;

          await db.collections.update(col.id, { syncStatus: 'syncing' });

          if (!config.apiUrl || config.apiUrl === 'demo') {
            await new Promise((r) => setTimeout(r, 600));
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

  // Yerel hafızada bekleyen (pending) iade fişlerini ERP12'ye gönder
  async pushPendingReturnsToERP(config: ServerConfig): Promise<SyncResult> {
    try {
      const pendingReturns = await db.returns.where('syncStatus').equals('pending').toArray();

      if (pendingReturns.length === 0) {
        return { success: true, syncedReturnsCount: 0 };
      }

      let syncedCount = 0;
      let failedCount = 0;

      for (const ret of pendingReturns) {
        try {
          if (!ret.id) continue;

          await db.returns.update(ret.id, { syncStatus: 'syncing' });

          if (!config.apiUrl || config.apiUrl === 'demo') {
            await new Promise((r) => setTimeout(r, 600));
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

  // Tek tıkla tam senkronizasyon (Siparişler + Tahsilatlar + İadeler gönder, güncel cari ve stokları al)
  async fullSync(config: ServerConfig, salesRepCode: string): Promise<SyncResult> {
    const pushOrdersRes = await this.pushPendingOrdersToERP(config);
    const pushCollectionsRes = await this.pushPendingCollectionsToERP(config);
    const pushReturnsRes = await this.pushPendingReturnsToERP(config);
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
      error: pushOrdersRes.error || pushCollectionsRes.error || pushReturnsRes.error || pullRes.error,
    };
  }
};

