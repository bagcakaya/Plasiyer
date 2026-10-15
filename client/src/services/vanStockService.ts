import { db } from '../db';
import type { 
  OrderItem, 
  ReturnItem, 
  VanStockItem, 
  VanLoadingRecord, 
  VanLoadingItem, 
  VanAuditRecord, 
  VanAuditItem 
} from '../types';

export const vanStockService = {
  // Sıcak satış yapıldığında araç stoğundan anlık düşüm
  async recordHotSaleDeduction(items: OrderItem[], vanPlate: string = '25 AG 123'): Promise<void> {
    for (const item of items) {
      if (!item.productCode) continue;
      const stock = await db.vanStocks.where('productCode').equals(item.productCode).first();
      if (stock) {
        const newStock = Math.max(0, stock.currentStock - item.quantity);
        const newSold = stock.totalSoldToday + item.quantity;
        await db.vanStocks.where('productCode').equals(item.productCode).modify({
          currentStock: newStock,
          totalSoldToday: newSold,
          updatedAt: new Date().toISOString(),
        });
      } else {
        // Eğer daha önce araçta tanımlı değilse negatif olmaması için kaydet
        await db.vanStocks.add({
          productId: item.productId,
          productCode: item.productCode,
          productName: item.productName,
          unit: item.unit,
          currentStock: 0,
          initialStock: 0,
          totalLoadedToday: 0,
          totalSoldToday: item.quantity,
          totalReturnedToday: 0,
          vanPlate,
          updatedAt: new Date().toISOString(),
        });
      }
    }
  },

  // Müşteriden araç içine iade alındığında araç stoğuna ekleme
  async recordReturnToVan(items: ReturnItem[], vanPlate: string = '25 AG 123'): Promise<void> {
    for (const item of items) {
      if (!item.productCode) continue;
      const stock = await db.vanStocks.where('productCode').equals(item.productCode).first();
      if (stock) {
        await db.vanStocks.where('productCode').equals(item.productCode).modify({
          currentStock: stock.currentStock + item.quantity,
          totalReturnedToday: stock.totalReturnedToday + item.quantity,
          updatedAt: new Date().toISOString(),
        });
      } else {
        await db.vanStocks.add({
          productId: item.productId,
          productCode: item.productCode,
          productName: item.productName,
          unit: item.unit,
          currentStock: item.quantity,
          initialStock: 0,
          totalLoadedToday: 0,
          totalSoldToday: 0,
          totalReturnedToday: item.quantity,
          vanPlate,
          updatedAt: new Date().toISOString(),
        });
      }
    }
  },

  // Sabah araç mal yükleme (Merkez depodan araca transfer fişi)
  async recordVanLoading(
    params: {
      vanPlate: string;
      salesRepCode: string;
      salesRepName?: string;
      sourceWarehouse?: string;
      targetVanWarehouse?: string;
      items: VanLoadingItem[];
      notes?: string;
    }
  ): Promise<VanLoadingRecord> {
    const docNo = 'YUK-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.floor(1000 + Math.random() * 9000);
    const totalQuantity = params.items.reduce((sum, it) => sum + (it.quantity || 0), 0);

    const record: VanLoadingRecord = {
      docNo,
      date: new Date().toISOString().slice(0, 10),
      vanPlate: params.vanPlate,
      salesRepCode: params.salesRepCode,
      salesRepName: params.salesRepName,
      sourceWarehouse: params.sourceWarehouse || 'Merkez Ana Depo',
      targetVanWarehouse: params.targetVanWarehouse || `02 Araç Deposu (${params.vanPlate})`,
      items: params.items,
      totalQuantity,
      notes: params.notes,
      status: 'confirmed',
      createdAt: new Date().toISOString(),
    };

    const id = await db.vanLoadings.add(record);
    record.id = id;

    // Araç stoklarını güncelle
    for (const item of params.items) {
      const stock = await db.vanStocks.where('productCode').equals(item.productCode).first();
      if (stock) {
        await db.vanStocks.where('productCode').equals(item.productCode).modify({
          currentStock: stock.currentStock + item.quantity,
          totalLoadedToday: stock.totalLoadedToday + item.quantity,
          updatedAt: new Date().toISOString(),
        });
      } else {
        await db.vanStocks.add({
          productId: item.productId,
          productCode: item.productCode,
          productName: item.productName,
          unit: item.unit,
          barcode: item.barcode,
          unitPrice: item.unitPrice,
          currentStock: item.quantity,
          initialStock: item.quantity,
          totalLoadedToday: item.quantity,
          totalSoldToday: 0,
          totalReturnedToday: 0,
          vanPlate: params.vanPlate,
          updatedAt: new Date().toISOString(),
        });
      }
    }

    return record;
  },

  // Akşam araç sayımı ve mutabakat fişi
  async recordVanAudit(
    params: {
      vanPlate: string;
      salesRepCode: string;
      salesRepName?: string;
      items: VanAuditItem[];
      notes?: string;
    }
  ): Promise<VanAuditRecord> {
    const docNo = 'SYM-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.floor(1000 + Math.random() * 9000);
    
    let totalTheoretical = 0;
    let totalCounted = 0;
    let totalDifference = 0;
    let totalDifferenceAmount = 0;

    for (const item of params.items) {
      totalTheoretical += item.theoreticalStock;
      totalCounted += item.countedStock;
      totalDifference += item.difference;
      totalDifferenceAmount += (item.differenceAmount || 0);

      // Sayım sonucuna göre araç stoğunu fiili sayıma eşitle
      const stock = await db.vanStocks.where('productCode').equals(item.productCode).first();
      if (stock) {
        await db.vanStocks.where('productCode').equals(item.productCode).modify({
          currentStock: item.countedStock,
          updatedAt: new Date().toISOString(),
        });
      }
    }

    const record: VanAuditRecord = {
      docNo,
      date: new Date().toISOString().slice(0, 10),
      vanPlate: params.vanPlate,
      salesRepCode: params.salesRepCode,
      salesRepName: params.salesRepName,
      items: params.items,
      totalTheoretical,
      totalCounted,
      totalDifference,
      totalDifferenceAmount: Math.round(totalDifferenceAmount * 100) / 100,
      status: 'completed',
      notes: params.notes,
      createdAt: new Date().toISOString(),
    };

    const id = await db.vanAudits.add(record);
    record.id = id;
    return record;
  },

  // Sıcak satış öncesi araçta yeterli stok olup olmadığını kontrol etme
  async checkVanStockAvailability(items: OrderItem[]): Promise<{
    isAvailable: boolean;
    shortages: { productCode: string; productName: string; requested: number; inVan: number; missing: number }[];
  }> {
    const shortages: { productCode: string; productName: string; requested: number; inVan: number; missing: number }[] = [];

    for (const item of items) {
      if (!item.productCode) continue;
      const stock = await db.vanStocks.where('productCode').equals(item.productCode).first();
      const availableQty = stock ? stock.currentStock : 0;
      if (availableQty < item.quantity) {
        shortages.push({
          productCode: item.productCode,
          productName: item.productName,
          requested: item.quantity,
          inVan: availableQty,
          missing: item.quantity - availableQty,
        });
      }
    }

    return {
      isAvailable: shortages.length === 0,
      shortages,
    };
  },

  // Ürün için araç içi stoğu getirme
  async getVanStockForProduct(productCode: string): Promise<VanStockItem | null> {
    const stock = await db.vanStocks.where('productCode').equals(productCode).first();
    return stock || null;
  }
};
