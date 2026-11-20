import type { 
  Campaign, 
  OrderItem, 
  Product, 
  AppliedCampaign, 
  CampaignOpportunity,
  CartSummary 
} from '../types';

export interface CampaignEvaluationResult {
  processedCart: OrderItem[];
  appliedCampaigns: AppliedCampaign[];
  campaignDiscountAmount: number;
  totalCampaignSavings: number;
  opportunities: CampaignOpportunity[];
  summary: CartSummary;
}

export const campaignService = {
  /**
   * Sepetteki ürünler ve aktif kampanyaları analiz eder,
   * Bedelsiz hediyeleri sepete ekler, sepet indirimlerini hesaplar
   * ve eksik kalan fırsatları (upsell) türetir.
   */
  evaluateCart(
    rawCart: OrderItem[],
    campaigns: Campaign[],
    allProducts: Product[]
  ): CampaignEvaluationResult {
    const productMap = new Map<string, Product>();
    allProducts.forEach((p) => {
      productMap.set(p.id, p);
      if (p.code) productMap.set(p.code, p);
    });

    // Sadece kullanıcının manuel eklediği ana ürünleri al (önceki otomatik hediyeleri filtrele)
    // ve eksik görsel/kategori/tarih/seçim bilgilerini ürün tablosundan tamamla
    const regularItems = rawCart
      .filter((item) => !item.isGift)
      .map((item) => {
        const matchedProd = productMap.get(item.productId) || productMap.get(item.productCode);
        const rawDisc = item.discountPercent || 0;
        const safeDisc = rawDisc > 0 && rawDisc < 100 ? rawDisc : 0;
        const unitPrice = item.unitPrice || 0;
        const qty = item.quantity || 1;
        const vatRate = item.vatRate ?? matchedProd?.vatRate ?? 20;
        const vatMult = 1 + vatRate / 100;
        const netPrice = unitPrice * (1 - safeDisc / 100);
        const netInclVat = Number((netPrice * qty).toFixed(2));
        const netExclVat = netInclVat / vatMult;
        const vatAmount = Number((netInclVat - netExclVat).toFixed(2));
        return {
          ...item,
          vatRate,
          discountPercent: safeDisc,
          netPrice,
          totalAmount: netInclVat,
          vatAmount,
          grandTotal: netInclVat,
          image: item.image || matchedProd?.image,
          category: item.category || matchedProd?.category,
          addedAt: item.addedAt || new Date().toISOString(),
          selected: item.selected !== false,
        };
      });
    // Hesaplamalara yalnızca seçili (işaretli) ürünler dahil edilir (varsayılan: seçili)
    const selectedRegularItems = regularItems.filter((item) => item.selected !== false);

    const activeCampaigns = campaigns.filter((c) => {
      if (!c.isActive) return false;
      const today = new Date().toISOString().slice(0, 10);
      if (c.startDate && today < c.startDate) return false;
      if (c.endDate && today > c.endDate) return false;
      return true;
    });

    const giftItems: OrderItem[] = [];
    const appliedCampaigns: AppliedCampaign[] = [];
    const opportunities: CampaignOpportunity[] = [];
    let campaignDiscountAmount = 0;
    let totalGiftSavings = 0;

    // 1. Seçili ana ürünlerin brüt ve net tutarlarını hesapla (ERP12 KDV Dahil fiyat yapısına göre KDV ayrıştırması)
    let rawSubtotal = 0;
    let regularDiscountTotal = 0;
    let regularVatTotal = 0;
    let regularGrandTotal = 0;
    let regularItemsCount = 0;

    selectedRegularItems.forEach((item) => {
      const vatMult = 1 + (item.vatRate || 0) / 100;
      const safeDisc = item.discountPercent || 0;

      const grossInclVat = item.unitPrice * item.quantity;
      const netInclVat = grossInclVat * (1 - safeDisc / 100);

      const grossExclVat = grossInclVat / vatMult;
      const discExclVat = grossExclVat * (safeDisc / 100);
      const netExclVat = grossExclVat - discExclVat;
      const vat = netInclVat - netExclVat;

      rawSubtotal += grossExclVat;
      regularDiscountTotal += discExclVat;
      regularVatTotal += vat;
      regularGrandTotal += netInclVat;
      regularItemsCount += item.quantity;
    });

    const netAmountBeforeCampaigns = rawSubtotal - regularDiscountTotal;

    // 2. Kampanyaları tara
    activeCampaigns.forEach((camp) => {
      if (camp.type === 'quantity_gift' || camp.type === 'cross_product_gift') {
        // Hedef ürünün sepetteki seçili toplam miktarını bul
        const targetItems = selectedRegularItems.filter((i) => i.productId === camp.targetProductId);
        const currentQty = targetItems.reduce((sum, i) => sum + i.quantity, 0);
        const minQty = camp.minQuantity || 1;

        if (currentQty >= minQty) {
          // Koşul sağlandı -> Bedelsiz ürün hesapla
          const multiplier = camp.isStackable ? Math.floor(currentQty / minQty) : 1;
          const giftQty = multiplier * (camp.rewardQuantity || 1);

          const rewardProd = camp.rewardProductId ? productMap.get(camp.rewardProductId) : null;

          if (rewardProd && giftQty > 0) {
            const originalVal = (rewardProd.price1 || 0) * giftQty;
            totalGiftSavings += originalVal;

            giftItems.push({
              productId: `GIFT-${camp.id}-${rewardProd.id}`,
              productCode: rewardProd.code,
              productName: `🎁 [HEDİYE] ${rewardProd.name}`,
              unit: rewardProd.unit,
              quantity: giftQty,
              unitPrice: 0,
              discountPercent: 100,
              vatRate: 0,
              netPrice: 0,
              totalAmount: 0,
              vatAmount: 0,
              grandTotal: 0,
              isGift: true,
              campaignId: camp.id,
              campaignTitle: camp.title,
              originalUnitPrice: rewardProd.price1,
            });

            appliedCampaigns.push({
              campaignId: camp.id,
              campaignCode: camp.code,
              campaignTitle: camp.title,
              badge: camp.badge,
              type: camp.type,
              benefitDescription: `${giftQty} ${rewardProd.unit} ${rewardProd.name} BEDELSİZ eklendi`,
              rewardProductId: rewardProd.id,
              rewardProductName: rewardProd.name,
              rewardQuantity: giftQty,
            });
          }
        } else if (currentQty > 0 && currentQty < minQty) {
          // Henüz tamamlanmadı -> Plasiyere/Müşteriye tamamlama tavsiyesi üret (Upsell)
          const missing = minQty - currentQty;
          const targetProdName = camp.targetProductName || targetItems[0]?.productName || 'ürün';
          const rewardProdName = camp.rewardProductName || 'hediye ürün';
          const progress = Math.round((currentQty / minQty) * 100);

          opportunities.push({
            campaign: camp,
            currentValue: currentQty,
            targetValue: minQty,
            missingValue: missing,
            progressPercent: progress,
            hint: `${missing} adet daha "${targetProdName}" eklerseniz ${camp.rewardQuantity || 1} adet "${rewardProdName}" BEDELSİZ kazanacaksınız!`,
          });
        }
      } else if (camp.type === 'cart_threshold_discount') {
        const threshold = camp.minCartAmount || 0;

        if (netAmountBeforeCampaigns >= threshold) {
          let disc = 0;
          if (camp.rewardDiscountPercent && camp.rewardDiscountPercent > 0) {
            disc = netAmountBeforeCampaigns * (camp.rewardDiscountPercent / 100);
          } else if (camp.rewardDiscountAmount && camp.rewardDiscountAmount > 0) {
            disc = Math.min(netAmountBeforeCampaigns, camp.rewardDiscountAmount);
          }

          if (disc > 0) {
            campaignDiscountAmount += disc;
            appliedCampaigns.push({
              campaignId: camp.id,
              campaignCode: camp.code,
              campaignTitle: camp.title,
              badge: camp.badge,
              type: camp.type,
              benefitDescription: `${new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(disc)} Ekstra Ciro İskontosu`,
              discountAmount: disc,
            });
          }
        } else if (netAmountBeforeCampaigns > 0 && netAmountBeforeCampaigns < threshold) {
          const missing = threshold - netAmountBeforeCampaigns;
          const progress = Math.round((netAmountBeforeCampaigns / threshold) * 100);

          opportunities.push({
            campaign: camp,
            currentValue: netAmountBeforeCampaigns,
            targetValue: threshold,
            missingValue: missing,
            progressPercent: progress,
            hint: `Sepete ${new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(missing)} daha ürün eklerseniz anında %${camp.rewardDiscountPercent || 5} ekstra indirim uygulanacak!`,
          });
        }
      }
    });

    const finalCart = [...regularItems, ...giftItems];
    const totalItems = regularItemsCount + giftItems.reduce((sum, g) => sum + g.quantity, 0);

    const roundedSubtotal = Number(rawSubtotal.toFixed(2));
    const roundedRegDisc = Number(regularDiscountTotal.toFixed(2));
    const roundedCampDisc = Number(campaignDiscountAmount.toFixed(2));
    const totalDiscount = Number((roundedRegDisc + roundedCampDisc).toFixed(2));
    const grandTotal = Math.max(0, Number((regularGrandTotal - roundedCampDisc).toFixed(2)));
    const finalVat = Math.max(0, Number((grandTotal - (roundedSubtotal - totalDiscount)).toFixed(2)));

    const totalCampaignSavings = totalGiftSavings + roundedCampDisc;
    const totalSavings = totalDiscount + totalGiftSavings;

    const summary: CartSummary = {
      subtotal: roundedSubtotal,
      totalDiscount,
      totalVat: finalVat,
      grandTotal,
      totalItems,
      totalSavings,
      campaignDiscountAmount: roundedCampDisc,
      totalCampaignSavings,
      appliedCampaigns,
      opportunities,
    };

    return {
      processedCart: finalCart,
      appliedCampaigns,
      campaignDiscountAmount,
      totalCampaignSavings,
      opportunities,
      summary,
    };
  }
};
