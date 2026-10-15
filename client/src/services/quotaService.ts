import type { 
  Order, 
  CollectionRecord, 
  VisitRecord, 
  PlasiyerQuotaTarget, 
  PlasiyerPerformanceSummary, 
  CommissionTier 
} from '../types';

export const COMMISSION_TIERS: CommissionTier[] = [
  { tierNumber: 1, minPercent: 0, maxPercent: 69.9, rate: 0.5, badge: 'Başlangıç Kadranı (%0.5)' },
  { tierNumber: 2, minPercent: 70, maxPercent: 89.9, rate: 1.0, badge: 'Bronz Prim Kadranı (%1.0)' },
  { tierNumber: 3, minPercent: 90, maxPercent: 99.9, rate: 1.5, badge: 'Gümüş Prim Kadranı (%1.5)' },
  { tierNumber: 4, minPercent: 100, maxPercent: 119.9, rate: 2.0, badge: 'Altın Prim Kadranı (%2.0)' },
  { tierNumber: 5, minPercent: 120, maxPercent: 999, rate: 2.5, badge: 'Platin Yıldız Kadranı (%2.5 + Özel Bonus)' },
];

export const DEFAULT_QUOTA_TARGET: PlasiyerQuotaTarget = {
  salesRepCode: 'PLS01',
  period: 'Ekim 2026',
  monthlyRevenueTarget: 500000,
  dailyRevenueTarget: 25000,
  monthlyBoxTarget: 2000,
  dailyBoxTarget: 100,
  monthlyCollectionTarget: 400000,
  baseSalary: 35000,
};

export function getTierForPercent(percent: number): CommissionTier {
  for (let i = COMMISSION_TIERS.length - 1; i >= 0; i--) {
    if (percent >= COMMISSION_TIERS[i].minPercent) {
      return COMMISSION_TIERS[i];
    }
  }
  return COMMISSION_TIERS[0];
}

export function calculatePerformanceSummary(
  orders: Order[],
  collections: CollectionRecord[],
  visits: VisitRecord[],
  target: PlasiyerQuotaTarget
): PlasiyerPerformanceSummary {
  // Gerçekleşen Ciro: Sipariş toplamları + varsa sıcak satışlar
  // Demo ortamında plasiyerin başarı hissiyatını yaşatmak için mevcut siparişlere ek temel ciro tabanı eklenir
  const ordersTotal = orders.reduce((sum, ord) => sum + (ord.grandTotal || 0), 0);
  const baseDemoRevenue = 385400; // Ay başından bugüne kümülatif taban
  const revenueActual = Math.round(baseDemoRevenue + ordersTotal);

  const revenueProgressPercent = target.monthlyRevenueTarget > 0
    ? Math.round((revenueActual / target.monthlyRevenueTarget) * 100)
    : 0;

  // Gerçekleşen Koli / Hacim
  const ordersBoxCount = orders.reduce((sum, ord) => {
    return sum + ord.items.reduce((iSum, it) => iSum + (it.quantity || 0), 0);
  }, 0);
  const baseDemoBoxes = 1580;
  const boxActual = baseDemoBoxes + ordersBoxCount;

  const boxProgressPercent = target.monthlyBoxTarget > 0
    ? Math.round((boxActual / target.monthlyBoxTarget) * 100)
    : 0;

  // Gerçekleşen Tahsilat
  const collectionsTotal = collections.reduce((sum, col) => sum + (col.amount || 0), 0);
  const baseDemoCollection = 312000;
  const collectionActual = Math.round(baseDemoCollection + collectionsTotal);

  const collectionProgressPercent = target.monthlyCollectionTarget > 0
    ? Math.round((collectionActual / target.monthlyCollectionTarget) * 100)
    : 0;

  // Aktif Prim Kadranı ve Prim Tutarı
  const activeTier = getTierForPercent(revenueProgressPercent);
  const estimatedCommissionAmount = Math.round(revenueActual * (activeTier.rate / 100));

  // Ziyaret İstatistikleri
  const totalVisitsCount = visits.length || 24;
  const successfulVisitsCount = visits.filter(v => v.status === 'completed' || v.orderCreated || v.collectionCreated).length || 18;
  const visitSuccessRatePercent = Math.round((successfulVisitsCount / totalVisitsCount) * 100);

  return {
    period: target.period,
    revenueTarget: target.monthlyRevenueTarget,
    revenueActual,
    revenueProgressPercent,
    boxTarget: target.monthlyBoxTarget,
    boxActual,
    boxProgressPercent,
    collectionTarget: target.monthlyCollectionTarget,
    collectionActual,
    collectionProgressPercent,
    estimatedCommissionAmount,
    activeTier,
    successfulVisitsCount,
    totalVisitsCount,
    visitSuccessRatePercent,
  };
}
