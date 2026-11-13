import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { 
  Order, 
  CollectionRecord, 
  PrintSlipType, 
  ReturnRecord, 
  EndOfDayReport,
  VanLoadingRecord,
  VanAuditRecord
} from '../types';
import { amountToTurkishWords } from '../utils/numberToWords';
import { useApp } from '../context/AppContext';
import { apiService } from '../services/apiService';
import { 
  Printer, 
  Share2, 
  X, 
  Building2, 
  QrCode,
  Receipt,
  RotateCcw,
  TrendingUp,
  Truck,
  ClipboardCheck,
  CheckCircle2,
  Loader2
} from 'lucide-react';

interface ThermalReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  slipType: PrintSlipType;
  orderData?: Order | null;
  collectionData?: CollectionRecord | null;
  returnData?: ReturnRecord | null;
  endOfDayData?: EndOfDayReport | null;
  vanLoadingData?: VanLoadingRecord | null;
  vanAuditData?: VanAuditRecord | null;
  customerPreviousBalance?: number;
}

export const ThermalReceiptModal: React.FC<ThermalReceiptModalProps> = ({
  isOpen,
  onClose,
  slipType,
  orderData,
  collectionData,
  returnData,
  endOfDayData,
  vanLoadingData,
  vanAuditData,
  customerPreviousBalance = 0,
}) => {
  const { companyIssuer, serverConfig } = useApp();
  const [paperWidth, setPaperWidth] = useState<'58mm' | '80mm'>('80mm');
  const [copiedAlert, setCopiedAlert] = useState<boolean>(false);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [printStatusMsg, setPrintStatusMsg] = useState<{ type: 'success' | 'info'; text: string } | null>(null);
  const allCustomers = useLiveQuery(() => db.customers.toArray(), []) || [];

  if (!isOpen) return null;

  // İlgili cariye uygulanan iskonto oranı ve iskonto tutarı hesaplaması
  const matchedOrderCustomer =
    slipType === 'order' && orderData
      ? allCustomers.find(
          (c) => c.id === orderData.customerId || c.code === orderData.customerCode
        )
      : undefined;

  const itemDiscountRate =
    slipType === 'order' && orderData
      ? orderData.items.find((it) => !it.isGift && (it.discountPercent || 0) > 0)
          ?.discountPercent || 0
      : 0;

  const orderSubtotal = slipType === 'order' && orderData ? orderData.subtotal || 0 : 0;

  const orderDiscountRate = (() => {
    if (slipType !== 'order' || !orderData) return 0;
    if (itemDiscountRate > 0) return itemDiscountRate;
    if ((orderData.totalDiscount || 0) > 0 && orderSubtotal > 0) {
      return Math.round(((orderData.totalDiscount || 0) / orderSubtotal) * 100 * 100) / 100;
    }
    if (matchedOrderCustomer?.specialDiscount && matchedOrderCustomer.specialDiscount > 0) {
      return matchedOrderCustomer.specialDiscount;
    }
    return 0;
  })();

  const orderDiscountAmount = (() => {
    if (slipType !== 'order' || !orderData) return 0;
    if ((orderData.totalDiscount || 0) > 0) return orderData.totalDiscount;
    if (orderDiscountRate > 0 && orderSubtotal > 0) {
      return Math.round(orderSubtotal * (orderDiscountRate / 100) * 100) / 100;
    }
    return 0;
  })();

  const orderEffectiveVat = (() => {
    if (slipType !== 'order' || !orderData) return 0;
    if ((orderData.totalDiscount || 0) === 0 && orderDiscountAmount > 0 && orderSubtotal > 0) {
      const factor = Math.max(0, (orderSubtotal - orderDiscountAmount) / orderSubtotal);
      return Math.round((orderData.totalVat || 0) * factor * 100) / 100;
    }
    return orderData.totalVat || 0;
  })();

  const orderEffectiveGrandTotal = (() => {
    if (slipType !== 'order' || !orderData) return 0;
    if ((orderData.totalDiscount || 0) === 0 && orderDiscountAmount > 0) {
      const campDisc = orderData.campaignDiscount || 0;
      return Math.max(0, Math.round((orderSubtotal - orderDiscountAmount - campDisc + orderEffectiveVat) * 100) / 100);
    }
    return orderData.grandTotal || 0;
  })();

  const issuerMainTitle = (companyIssuer.brandName || companyIssuer.legalName || 'MERKEZ FİRMA').trim();
  const rawLegalName = (companyIssuer.legalName || '').trim();
  let issuerSubTitle = '';
  if (rawLegalName && rawLegalName.toLocaleUpperCase('tr-TR') !== issuerMainTitle.toLocaleUpperCase('tr-TR')) {
    const dashPrefix = `${issuerMainTitle} - `;
    if (rawLegalName.toLocaleUpperCase('tr-TR').startsWith(dashPrefix.toLocaleUpperCase('tr-TR'))) {
      issuerSubTitle = rawLegalName.slice(dashPrefix.length).trim();
    } else {
      issuerSubTitle = rawLegalName;
    }
  }
  const issuerLocation = [companyIssuer.district, companyIssuer.city].filter(Boolean).join(' / ');
  const issuerAddressLine = [companyIssuer.address, issuerLocation].filter(Boolean).join(' • ');
  const issuerPhoneLine = companyIssuer.phone ? `Tel: ${companyIssuer.phone}` : '';
  const issuerTaxLine = [
    companyIssuer.taxOffice ? `V.D.: ${companyIssuer.taxOffice}` : '',
    companyIssuer.taxNumber ? `V.N.: ${companyIssuer.taxNumber}` : '',
  ]
    .filter(Boolean)
    .join(' • ');

  const nowFormatted = new Date().toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const paymentLabels: Record<string, string> = {
    nakit: 'NAKİT TAHSİLAT',
    kredi_karti: 'KREDİ KARTI / POS',
    havale: 'BANKA HAVALE / EFT',
    cek: 'MÜŞTERİ ÇEKİ',
  };

  const documentBoxTitle =
    slipType === 'order' ? (orderData?.saleType === 'hot' ? 'SICAK SATIŞ TESLİM FİŞİ' : 'SİPARİŞ BİLGİ FİŞİ') :
    slipType === 'collection' ? 'TAHSİLAT MAKBUZU' :
    slipType === 'return' ? 'SAHA İADE / DEĞİŞİM FİŞİ' :
    slipType === 'van_loading' ? 'ARAÇ MAL YÜKLEME TRANSFER FİŞİ' :
    slipType === 'van_audit' ? 'ARAÇ GÜN SONU SAYIM TUTANAĞI' :
    'GÜN SONU Z RAPORU';

  const footerPrimaryText =
    slipType === 'order' ? (orderData?.saleType === 'hot' ? 'SICAK SATIŞ TESLİM FİŞİDİR' : 'BİLGİ FİŞİDİR - MALİ DEĞERİ YOKTUR') :
    slipType === 'collection' ? 'TAHSİLAT BİLGİ MAKBUZUDUR' :
    slipType === 'return' ? 'SAHA İADE VE DEĞİŞİM BELGESİDİR' :
    slipType === 'van_loading' ? 'ARAÇ DEPO TRANSFER FİŞİDİR' :
    slipType === 'van_audit' ? 'GÜN SONU ARAÇ SAYIM MUTABAKATIDIR' :
    'PLASİYER GÜN SONU KASASI Z RAPORUDUR';

  const signaturesConfig = {
    leftTitle:
      slipType === 'end_of_day' ? 'Raporu Düzenleyen' :
      slipType === 'van_loading' ? 'Depo Yetkilisi' :
      slipType === 'van_audit' ? 'Sayımı Yapan Plasiyer' :
      'Teslim Eden',
    leftSubtitle:
      slipType === 'end_of_day' ? 'Plasiyer' :
      slipType === 'van_loading' ? 'Merkez Depo' :
      slipType === 'van_audit' ? 'Plasiyer Kaşe/İmza' :
      'Müşteri Kaşe/İmza',
    rightTitle:
      slipType === 'end_of_day' ? 'Onaylayan Kasa' :
      slipType === 'van_loading' ? 'Teslim Alan Plasiyer' :
      slipType === 'van_audit' ? 'Merkez Muhasebe/Denetçi' :
      'Teslim Alan',
    rightSubtitle:
      slipType === 'end_of_day' ? 'Merkez Muhasebe' :
      slipType === 'van_loading' ? 'Araç Sorumlusu' :
      slipType === 'van_audit' ? 'Onay Kaşe/İmza' :
      'Plasiyer İmza',
  };

  // 1 numaralı termal yazıcı için yapılandırılmış fiş verisi oluşturma
  const buildThermalPrintPayload = () => {
    const metaRows: Array<{ label: string; value: string; boxed?: boolean }> = [];
    let table: {
      columns: Array<{ header: string; align: 'left' | 'center' | 'right'; widthRatio: number }>;
      rows: Array<{ cells: string[]; subText?: string }>;
    } | undefined;
    let sections: Array<{
      title: string;
      rows: Array<{ label: string; value: string; bold?: boolean }>;
    }> | undefined;
    const totals: Array<{ label: string; value: string; isGrandTotal?: boolean; isBoxedNote?: boolean }> = [];
    const campaigns: string[] = [];

    const fmtMoney = (v: number) =>
      `${v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;

    if (slipType === 'order' && orderData) {
      metaRows.push({ label: 'FİŞ NO:', value: orderData.tempId || '-' });
      if (orderData.erp12DocNo) {
        metaRows.push({ label: 'ERP NO:', value: orderData.erp12DocNo });
      }
      if (orderData.saleType === 'hot') {
        metaRows.push({
          label: 'SATIŞ ŞEKLİ:',
          value: `ARAÇTAN TESLİM (${orderData.vanPlate || 'ARAÇ'})`,
          boxed: true,
        });
      }
      metaRows.push({ label: 'TARİH/SAAT:', value: nowFormatted });
      metaRows.push({ label: 'MÜŞTERİ:', value: orderData.customerName || '-' });
      metaRows.push({ label: 'CARİ KOD:', value: orderData.customerCode || '-' });
      metaRows.push({
        label: 'İSKONTO ORANI:',
        value: `%${orderDiscountRate.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`,
      });
      metaRows.push({ label: 'PLASİYER:', value: orderData.salesRepCode || '-' });

      table = {
        columns: [
          { header: 'ÜRÜN ADI', align: 'left', widthRatio: 0.46 },
          { header: 'MİKTAR', align: 'center', widthRatio: 0.14 },
          { header: 'FİYAT', align: 'right', widthRatio: 0.19 },
          { header: 'TUTAR', align: 'right', widthRatio: 0.21 },
        ],
        rows: orderData.items.map((it) => ({
          cells: [
            it.productName,
            String(it.quantity),
            it.isGift
              ? (it.originalUnitPrice || it.unitPrice).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              : it.unitPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            it.isGift
              ? '0,00'
              : it.grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          ],
          subText: it.isGift ? `BEDELSİZ HEDİYE (${it.campaignTitle || 'Promosyon'})` : undefined,
        })),
      };

      totals.push({ label: 'Ara Toplam:', value: fmtMoney(orderSubtotal) });
      totals.push({
        label: 'İskonto Oranı:',
        value: `%${orderDiscountRate.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`,
      });
      totals.push({
        label: 'İskonto Tutarı:',
        value: `${orderDiscountAmount > 0 ? '-' : ''}${fmtMoney(orderDiscountAmount)}`,
      });
      if (orderData.campaignDiscount && orderData.campaignDiscount > 0) {
        totals.push({
          label: 'Kampanya İndirimi:',
          value: `-${fmtMoney(orderData.campaignDiscount)}`,
        });
      }
      totals.push({ label: 'KDV Tutarı:', value: fmtMoney(orderEffectiveVat) });
      totals.push({
        label: 'GENEL TOPLAM:',
        value: fmtMoney(orderEffectiveGrandTotal),
        isGrandTotal: true,
      });

      if (orderData.totalCampaignSavings && orderData.totalCampaignSavings > 0) {
        totals.push({
          label: 'TOPLAM KAMPANYA KAZANCINIZ:',
          value: fmtMoney(orderData.totalCampaignSavings),
          isBoxedNote: true,
        });
      }
      if (orderData.appliedCampaigns && orderData.appliedCampaigns.length > 0) {
        orderData.appliedCampaigns.forEach((c) => {
          campaigns.push(`* ${c.campaignTitle}`);
        });
      }
    } else if (slipType === 'collection' && collectionData) {
      metaRows.push({ label: 'MAKBUZ NO:', value: collectionData.receiptNo || '-' });
      metaRows.push({ label: 'TARİH/SAAT:', value: nowFormatted });
      metaRows.push({ label: 'MÜŞTERİ:', value: collectionData.customerName || '-' });
      metaRows.push({ label: 'CARİ KOD:', value: collectionData.customerCode || '-' });
      metaRows.push({
        label: 'TAHSİLAT TÜRÜ:',
        value: paymentLabels[collectionData.paymentMethod] || collectionData.paymentMethod,
      });
      if (collectionData.paymentMethod === 'cek') {
        metaRows.push({ label: 'ÇEK NO:', value: collectionData.checkNo || '-' });
        metaRows.push({ label: 'BANKA:', value: collectionData.checkBank || '-' });
        metaRows.push({ label: 'VADE:', value: collectionData.checkDueDate || '-' });
      }

      totals.push({
        label: 'TAHSİLAT TUTARI:',
        value: fmtMoney(collectionData.amount),
        isGrandTotal: true,
      });
      totals.push({
        label: '',
        value: amountToTurkishWords(collectionData.amount),
        isBoxedNote: true,
      });
      totals.push({ label: 'Önceki Bakiye:', value: fmtMoney(customerPreviousBalance) });
      totals.push({ label: 'Tahsil Edilen:', value: `-${fmtMoney(collectionData.amount)}` });
      totals.push({
        label: 'Kalan Cari Bakiye:',
        value: fmtMoney(Math.max(0, customerPreviousBalance - collectionData.amount)),
      });
    } else if (slipType === 'return' && returnData) {
      metaRows.push({ label: 'İADE NO:', value: returnData.receiptNo || '-' });
      metaRows.push({ label: 'TARİH/SAAT:', value: nowFormatted });
      metaRows.push({ label: 'MÜŞTERİ:', value: returnData.customerName || '-' });
      metaRows.push({ label: 'CARİ KOD:', value: returnData.customerCode || '-' });
      metaRows.push({ label: 'PLASİYER:', value: returnData.salesRepCode || '-' });

      table = {
        columns: [
          { header: 'İADE EDİLEN ÜRÜN', align: 'left', widthRatio: 0.54 },
          { header: 'MİKTAR', align: 'center', widthRatio: 0.20 },
          { header: 'TUTAR', align: 'right', widthRatio: 0.26 },
        ],
        rows: returnData.items.map((it) => ({
          cells: [
            it.productName,
            `${it.quantity} ${it.unit}`,
            fmtMoney(it.totalAmount),
          ],
          subText: it.reason ? `[${it.reason}]` : undefined,
        })),
      };

      totals.push({
        label: 'TOPLAM İADE TUTARI:',
        value: fmtMoney(returnData.grandTotal),
        isGrandTotal: true,
      });
      totals.push({
        label: '',
        value: amountToTurkishWords(returnData.grandTotal),
        isBoxedNote: true,
      });
      totals.push({ label: 'Önceki Cari Borç:', value: fmtMoney(customerPreviousBalance) });
      totals.push({ label: 'İade Düşümü:', value: `-${fmtMoney(returnData.grandTotal)}` });
      totals.push({
        label: 'Güncellenen Cari Borç:',
        value: fmtMoney(Math.max(0, customerPreviousBalance - returnData.grandTotal)),
      });
    } else if (slipType === 'van_loading' && vanLoadingData) {
      metaRows.push({ label: 'TRANSFER NO:', value: vanLoadingData.docNo || '-' });
      metaRows.push({ label: 'TARİH/SAAT:', value: nowFormatted });
      metaRows.push({ label: 'ARAÇ PLAKASI:', value: vanLoadingData.vanPlate || '-' });
      metaRows.push({ label: 'ÇIKIŞ DEPOSU:', value: vanLoadingData.sourceWarehouse || '-' });
      metaRows.push({ label: 'HEDEF DEPO:', value: vanLoadingData.targetVanWarehouse || '-' });
      metaRows.push({ label: 'PLASİYER:', value: vanLoadingData.salesRepCode || '-' });

      table = {
        columns: [
          { header: 'YÜKLENEN ÜRÜN', align: 'left', widthRatio: 0.58 },
          { header: 'BİRİM', align: 'center', widthRatio: 0.20 },
          { header: 'MİKTAR', align: 'right', widthRatio: 0.22 },
        ],
        rows: vanLoadingData.items.map((it) => ({
          cells: [it.productName, it.unit, String(it.quantity)],
        })),
      };

      totals.push({ label: 'Yüklenen Çeşit:', value: `${vanLoadingData.items.length} Kalem` });
      totals.push({
        label: 'TOPLAM YÜKLENEN ADET:',
        value: `${vanLoadingData.totalQuantity} Adet`,
        isGrandTotal: true,
      });
    } else if (slipType === 'van_audit' && vanAuditData) {
      metaRows.push({ label: 'TUTANAK NO:', value: vanAuditData.docNo || '-' });
      metaRows.push({ label: 'TARİH/SAAT:', value: nowFormatted });
      metaRows.push({ label: 'ARAÇ PLAKASI:', value: vanAuditData.vanPlate || '-' });
      metaRows.push({ label: 'PLASİYER:', value: vanAuditData.salesRepCode || '-' });
      metaRows.push({ label: 'SAYILAN ÇEŞİT:', value: `${vanAuditData.items.length} Kalem` });

      table = {
        columns: [
          { header: 'ÜRÜN ADI', align: 'left', widthRatio: 0.46 },
          { header: 'TEORİK', align: 'center', widthRatio: 0.18 },
          { header: 'SAYILAN', align: 'center', widthRatio: 0.18 },
          { header: 'FARK', align: 'right', widthRatio: 0.18 },
        ],
        rows: vanAuditData.items.map((it) => ({
          cells: [
            it.productName,
            String(it.theoreticalStock),
            String(it.countedStock),
            it.difference > 0 ? `+${it.difference}` : String(it.difference),
          ],
        })),
      };

      totals.push({ label: 'Teorik Araç Stoğu:', value: `${vanAuditData.totalTheoretical} Adet` });
      totals.push({ label: 'Fiili Sayılan Stok:', value: `${vanAuditData.totalCounted} Adet` });
      totals.push({
        label: 'NET SAYIM FARKI:',
        value: `${vanAuditData.totalDifference > 0 ? `+${vanAuditData.totalDifference}` : vanAuditData.totalDifference} Adet`,
        isGrandTotal: true,
      });
      totals.push({ label: 'FARK TUTARI:', value: fmtMoney(vanAuditData.totalDifferenceAmount) });
    } else if (slipType === 'end_of_day' && endOfDayData) {
      metaRows.push({ label: 'RAPOR TARİHİ:', value: endOfDayData.date || '-' });
      metaRows.push({
        label: 'PLASİYER:',
        value: `${endOfDayData.salesRepName} (${endOfDayData.salesRepCode})`,
      });
      metaRows.push({ label: 'BASIM SAATİ:', value: nowFormatted });

      sections = [
        {
          title: '1. SİPARİŞ PERFORMANSI',
          rows: [
            { label: 'Sipariş Sayısı:', value: `${endOfDayData.ordersSummary.count} Adet` },
            { label: 'Net Sipariş Cirosu:', value: fmtMoney(endOfDayData.ordersSummary.totalNet) },
          ],
        },
        {
          title: '2. TAHSİLAT DAĞILIMI',
          rows: [
            {
              label: 'Nakit Tahsilat:',
              value: `${fmtMoney(endOfDayData.collectionsSummary.cashAmount)} (${endOfDayData.collectionsSummary.cashCount} Adet)`,
            },
            {
              label: 'Kredi Kartı / POS:',
              value: `${fmtMoney(endOfDayData.collectionsSummary.posAmount)} (${endOfDayData.collectionsSummary.posCount} Adet)`,
            },
            {
              label: 'Müşteri Çeki:',
              value: `${fmtMoney(endOfDayData.collectionsSummary.checkAmount)} (${endOfDayData.collectionsSummary.checkCount} Adet)`,
            },
            {
              label: 'Toplam Tahsilat:',
              value: fmtMoney(endOfDayData.collectionsSummary.totalAmount),
            },
          ],
        },
        {
          title: '3. RUT & ZİYARETLER',
          rows: [
            {
              label: 'Ziyaret / Planlanan:',
              value: `${endOfDayData.visitsSummary.completed} / ${endOfDayData.visitsSummary.totalPlanned} (%${endOfDayData.visitsSummary.successRate})`,
            },
            {
              label: 'Sipariş Alınan Müşteri:',
              value: `${endOfDayData.visitsSummary.withOrder} Cari`,
            },
          ],
        },
      ];

      totals.push({
        label: 'FİİLİ NAKİT KASA:',
        value: fmtMoney(endOfDayData.netCashBalance),
        isGrandTotal: true,
      });
    }

    return {
      printerName: '1',
      paperWidth,
      issuer: {
        mainTitle: issuerMainTitle,
        subTitle: issuerSubTitle || undefined,
        addressLine: issuerAddressLine || (!issuerPhoneLine && !issuerTaxLine ? 'Saha Dağıtım & Mobil B2B Sistemi' : undefined),
        phoneLine: issuerPhoneLine || undefined,
        taxLine: issuerTaxLine || undefined,
      },
      documentTitle: documentBoxTitle,
      metaRows,
      table,
      sections,
      totals,
      campaigns: campaigns.length > 0 ? campaigns : undefined,
      signatures: signaturesConfig,
      footer: {
        primaryText: footerPrimaryText,
        secondaryText: 'Fatura ve resmi sevk irsaliyesi yerine geçmez.',
        softwareText: 'Yazılım: ERP12 Mobil Saha & B2B Dağıtım',
      },
    };
  };

  // Yedek tarayıcı yazdırma (kesintisiz gizli iframe ile tam boy ve koyu siyah baskı)
  const printViaUnclippedIframe = () => {
    const printElement = document.getElementById('thermal-print-area');
    if (!printElement) {
      window.print();
      return;
    }

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      window.print();
      return;
    }

    const styleTags = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map((el) => el.outerHTML)
      .join('\n');

    const targetWidthMm = paperWidth === '58mm' ? '58mm' : '72mm';

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>ERP12 Termal Fiş</title>
          ${styleTags}
          <style>
            @page {
              size: ${paperWidth === '58mm' ? '58mm auto' : '80mm auto'};
              margin: 0mm;
            }
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              width: ${targetWidthMm} !important;
              height: auto !important;
              max-height: none !important;
              overflow: visible !important;
              background: #ffffff !important;
              color: #000000 !important;
              font-family: Arial, Helvetica, Tahoma, sans-serif !important;
              font-weight: 700 !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            #thermal-print-wrapper, #thermal-print-wrapper * {
              color: #000000 !important;
              border-color: #000000 !important;
              font-weight: 700 !important;
              text-shadow: none !important;
              opacity: 1 !important;
              visibility: visible !important;
            }
            #thermal-print-wrapper {
              width: 100% !important;
              padding: 2mm !important;
              box-sizing: border-box !important;
            }
          </style>
        </head>
        <body>
          <div id="thermal-print-wrapper">${printElement.innerHTML}</div>
        </body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } finally {
        setTimeout(() => {
          if (iframe.parentNode) {
            iframe.parentNode.removeChild(iframe);
          }
        }, 2000);
      }
    }, 350);
  };

  const handlePrint = async () => {
    if (isPrinting) return;
    setIsPrinting(true);
    setPrintStatusMsg(null);

    try {
      const payload = buildThermalPrintPayload();
      const result = await apiService.printThermalReceipt(serverConfig, payload);

      if (result.success) {
        setPrintStatusMsg({
          type: 'success',
          text: `Fiş doğrudan "${result.printerName || '1'}" numaralı termal yazıcıya gönderildi!`,
        });
        setTimeout(() => setPrintStatusMsg(null), 4500);
        return;
      }

      // Yerel/tünel yazıcı servisine erişilemezse kesintisiz iframe ile yazdır
      setPrintStatusMsg({
        type: 'info',
        text: '1 numaralı yazıcı servisine ulaşılamadı, tarayıcı yazdırma ekranı açılıyor...',
      });
      printViaUnclippedIframe();
    } catch {
      printViaUnclippedIframe();
    } finally {
      setIsPrinting(false);
    }
  };

  // WhatsApp için düz metin fiş oluşturma
  const handleWhatsAppShare = () => {
    let text = '';
    if (slipType === 'order' && orderData) {
      const itemsText = orderData.items.map((it) => {
        if (it.isGift) {
          return `• 🎁 [BEDELSİZ HEDİYE] ${it.productName}\n  ${it.quantity} ${it.unit} x 0,00 ₺ = 0,00 ₺ (${it.campaignTitle || 'Promosyon'})`;
        }
        return `• ${it.productName}\n  ${it.quantity} ${it.unit} x ${it.unitPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺ = ${it.grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺`;
      }).join('\n');

      let campaignSection = '';
      if (orderData.appliedCampaigns && orderData.appliedCampaigns.length > 0) {
        campaignSection = `\n--------------------------------\n` +
          `*KAZANILAN KAMPANYALAR:*\n` +
          orderData.appliedCampaigns.map(c => `• 🎁 ${c.campaignTitle}`).join('\n') + `\n`;
      }

      let savingsSection = '';
      if (orderData.totalCampaignSavings && orderData.totalCampaignSavings > 0) {
        savingsSection = `*Toplam Kampanya Kazancı:* ${orderData.totalCampaignSavings.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺\n`;
      }

      const isHotSale = orderData.saleType === 'hot';
      const saleTypeHeader = isHotSale 
        ? `*${issuerMainTitle} - 🔥 SICAK SATIŞ BİLGİ FİŞİ*\n*Satış Türü:* ARAÇTAN ANINDA TESLİM (${orderData.vanPlate || 'Mobil Depo'})\n` 
        : `*${issuerMainTitle} - SİPARİŞ BİLGİ FİŞİ*\n`;

      text = saleTypeHeader +
        `--------------------------------\n` +
        `*Fiş No:* ${orderData.tempId}\n` +
        `*Tarih:* ${nowFormatted}\n` +
        `*Müşteri:* ${orderData.customerName}\n` +
        `*Cari Kod:* ${orderData.customerCode}\n` +
        `*İskonto Oranı:* %${orderDiscountRate.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}\n` +
        `--------------------------------\n` +
        itemsText +
        campaignSection +
        `--------------------------------\n` +
        `*Ara Toplam:* ${orderSubtotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺\n` +
        `*İskonto Oranı:* %${orderDiscountRate.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}\n` +
        `*İskonto Tutarı:* ${orderDiscountAmount > 0 ? '-' : ''}${orderDiscountAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺\n` +
        (orderData.campaignDiscount && orderData.campaignDiscount > 0 ? `*Kampanya İskontosu:* -${orderData.campaignDiscount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺\n` : '') +
        `*KDV Tutarı:* ${orderEffectiveVat.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺\n` +
        savingsSection +
        `*Toplam Tutar:* ${orderEffectiveGrandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺\n` +
        (orderData.notes ? `*Not:* ${orderData.notes}\n` : '') +
        `--------------------------------\n` +
        (isHotSale ? `_Bu belge sıcak satış teslimat fişidir, ürünler araçtan fiziken teslim edilmiştir._` : `_Bu belge bilgi amaçlıdır, mali değeri yoktur._`);
    } else if (slipType === 'collection' && collectionData) {
      const paymentMethodNames: Record<string, string> = {
        nakit: 'Nakit Tahsilat',
        kredi_karti: 'Kredi Kartı (POS)',
        havale: 'Banka Havalesi / EFT',
        cek: 'Müşteri Çeki',
      };
      text = `*${issuerMainTitle} - TAHSİLAT MAKBUZU*\n` +
        `--------------------------------\n` +
        `*Makbuz No:* ${collectionData.receiptNo}\n` +
        `*Tarih:* ${nowFormatted}\n` +
        `*Müşteri:* ${collectionData.customerName}\n` +
        `*Ödeme Türü:* ${paymentMethodNames[collectionData.paymentMethod] || collectionData.paymentMethod}\n` +
        `*Tahsil Edilen:* ${collectionData.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺\n` +
        `*Tutar Yazıyla:* ${amountToTurkishWords(collectionData.amount)}\n` +
        (collectionData.notes ? `*Açıklama:* ${collectionData.notes}\n` : '') +
        `--------------------------------\n` +
        `_Tahsilatınız cari hesabınıza işlenmiştir. Teşekkür ederiz._`;
    } else if (slipType === 'return' && returnData) {
      text = `*${issuerMainTitle} - SAHA İADE VE DEĞİŞİM FİŞİ*\n` +
        `--------------------------------\n` +
        `*Fiş No:* ${returnData.receiptNo}\n` +
        `*Tarih:* ${nowFormatted}\n` +
        `*Müşteri:* ${returnData.customerName}\n` +
        `*Cari Kod:* ${returnData.customerCode}\n` +
        `--------------------------------\n` +
        returnData.items.map((it) => `• ${it.productName}\n  ${it.quantity} ${it.unit} x ${it.unitPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺ = ${it.totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺ [${it.reason}]`).join('\n') +
        `\n--------------------------------\n` +
        `*Toplam İade Tutarı:* ${returnData.grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺\n` +
        (returnData.notes ? `*Not:* ${returnData.notes}\n` : '') +
        `--------------------------------\n` +
        `_İade bedeli cari hesabınızdan düşülmüştür._`;
    } else if (slipType === 'van_loading' && vanLoadingData) {
      text = `*🚚 ${issuerMainTitle} - ARAÇ MAL YÜKLEME FİŞİ*\n` +
        `--------------------------------\n` +
        `*Fiş No:* ${vanLoadingData.docNo}\n` +
        `*Tarih:* ${vanLoadingData.date}\n` +
        `*Araç Plakası:* ${vanLoadingData.vanPlate}\n` +
        `*Çıkış Depo:* ${vanLoadingData.sourceWarehouse}\n` +
        `*Hedef Araç:* ${vanLoadingData.targetVanWarehouse}\n` +
        `*Plasiyer:* ${vanLoadingData.salesRepCode}\n` +
        `--------------------------------\n` +
        vanLoadingData.items.map((it) => `• ${it.productName}\n  Miktar: ${it.quantity} ${it.unit}`).join('\n') +
        `\n--------------------------------\n` +
        `*Toplam Yüklenen:* ${vanLoadingData.totalQuantity} Kalem / Adet\n` +
        (vanLoadingData.notes ? `*Açıklama:* ${vanLoadingData.notes}\n` : '') +
        `--------------------------------\n` +
        `_Mallar araç sorumlusuna eksiksiz sevk edilmiştir._`;
    } else if (slipType === 'van_audit' && vanAuditData) {
      text = `*📋 ${issuerMainTitle} - ARAÇ SAYIM VE MUTABAKAT TUTANAĞI*\n` +
        `----------------------------------------\n` +
        `*Tutanak No:* ${vanAuditData.docNo}\n` +
        `*Tarih:* ${vanAuditData.date}\n` +
        `*Araç Plakası:* ${vanAuditData.vanPlate}\n` +
        `*Plasiyer:* ${vanAuditData.salesRepCode}\n` +
        `----------------------------------------\n` +
        vanAuditData.items.map((it) => `• ${it.productName}\n  Teorik: ${it.theoreticalStock} | Sayılan: ${it.countedStock} | Fark: ${it.difference > 0 ? '+' + it.difference : it.difference} ${it.unit}`).join('\n') +
        `\n----------------------------------------\n` +
        `*Net Adet Farkı:* ${vanAuditData.totalDifference > 0 ? '+' + vanAuditData.totalDifference : vanAuditData.totalDifference} Adet\n` +
        `*Net Tutarsal Fark:* ${vanAuditData.totalDifferenceAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺\n` +
        (vanAuditData.notes ? `*Açıklama:* ${vanAuditData.notes}\n` : '') +
        `----------------------------------------\n` +
        `_Gün sonu fiziki araç sayım mutabakat belgesidir._`;
    } else if (slipType === 'end_of_day' && endOfDayData) {
      text = `*📊 ${issuerMainTitle} - GÜN SONU PLASİYER RAPORU (Z RAPORU)*\n` +
        `----------------------------------------\n` +
        `*Tarih:* ${endOfDayData.date}\n` +
        `*Plasiyer:* ${endOfDayData.salesRepName} (${endOfDayData.salesRepCode})\n` +
        `----------------------------------------\n` +
        `• Toplam Sipariş: ${endOfDayData.ordersSummary.count} Adet\n` +
        `• Net Sipariş Cirosu: ${endOfDayData.ordersSummary.totalNet.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺\n` +
        `• Toplam Tahsilat: ${endOfDayData.collectionsSummary.totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺\n` +
        `  - Nakit: ${endOfDayData.collectionsSummary.cashAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺\n` +
        `  - POS / K.Kartı: ${endOfDayData.collectionsSummary.posAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺\n` +
        `  - Çek: ${endOfDayData.collectionsSummary.checkAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺\n` +
        `• Rut Başarısı: ${endOfDayData.visitsSummary.completed} / ${endOfDayData.visitsSummary.totalPlanned} (%${endOfDayData.visitsSummary.successRate})\n` +
        `• İade Tutarı: ${endOfDayData.returnsSummary.totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺\n` +
        `----------------------------------------\n` +
        `💰 *GÜN SONU FİİLİ NAKİT KASA:* ${endOfDayData.netCashBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺`;
    }

    const encoded = encodeURIComponent(text);
    window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
    setCopiedAlert(true);
    setTimeout(() => setCopiedAlert(false), 2500);
  };

  const slipTitle = 
    slipType === 'order' ? (orderData?.saleType === 'hot' ? '🔥 Sıcak Satış Teslim Fişi' : 'Sipariş Bilgi Fişi') :
    slipType === 'collection' ? 'Tahsilat Makbuzu' :
    slipType === 'return' ? 'İade & Değişim Fişi' :
    slipType === 'van_loading' ? 'Araç Mal Yükleme Fişi' :
    slipType === 'van_audit' ? 'Araç Sayım & Fark Tutanağı' :
    'Gün Sonu Z Raporu';

  return (
    <div id="thermal-modal-root" className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/75 backdrop-blur-sm animate-fadeIn">
      {/* Yazdırma Sırasında Kesilmeyi ve Solukluğu Önleyen Stil */}
      <style>{`
        @media print {
          html, body, #root, #thermal-modal-root, #thermal-modal-card, #thermal-modal-scroll {
            height: auto !important;
            max-height: none !important;
            overflow: visible !important;
            position: static !important;
            background: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          body * {
            visibility: hidden !important;
          }
          #thermal-print-area, #thermal-print-area * {
            visibility: visible !important;
            color: #000000 !important;
            border-color: #000000 !important;
            font-weight: 700 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          #thermal-print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: ${paperWidth === '58mm' ? '58mm' : '72mm'} !important;
            height: auto !important;
            max-height: none !important;
            overflow: visible !important;
            margin: 0 !important;
            padding: 2mm !important;
            background: #ffffff !important;
            color: #000000 !important;
            box-shadow: none !important;
          }
          @page {
            size: ${paperWidth === '58mm' ? '58mm auto' : '80mm auto'};
            margin: 0mm;
          }
        }
      `}</style>

      <div id="thermal-modal-card" className="relative w-full max-w-md max-h-[92vh] flex flex-col bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Üst Bar / Kontroller */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              {slipType === 'return' ? <RotateCcw className="w-5 h-5 text-rose-600" /> :
               slipType === 'end_of_day' ? <TrendingUp className="w-5 h-5 text-blue-600" /> :
               slipType === 'van_loading' ? <Truck className="w-5 h-5 text-emerald-600" /> :
               slipType === 'van_audit' ? <ClipboardCheck className="w-5 h-5 text-indigo-600" /> :
               <Receipt className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                {slipTitle}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">1 Nolu Termal Yazıcı Önizleme</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Kağıt Genişliği Seçimi (58mm / 80mm) */}
            <div className="flex bg-slate-200/80 dark:bg-slate-800 p-0.5 rounded-lg text-xs font-semibold">
              <button
                type="button"
                onClick={() => setPaperWidth('58mm')}
                className={`px-2 py-1 rounded-md transition-all ${
                  paperWidth === '58mm'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                58mm
              </button>
              <button
                type="button"
                onClick={() => setPaperWidth('80mm')}
                className={`px-2 py-1 rounded-md transition-all ${
                  paperWidth === '80mm'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                80mm
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Fiş Önizleme Alanı (Termal Kağıt Efekti - Tam Siyah & Kalın Kontrast) */}
        <div id="thermal-modal-scroll" className="flex-1 overflow-y-auto p-4 bg-slate-100 dark:bg-slate-950 flex justify-center items-start">
          <div
            id="thermal-print-area"
            style={{
              width: paperWidth === '58mm' ? '300px' : '380px',
              fontFamily: "Arial, Helvetica, Tahoma, sans-serif",
            }}
            className="bg-white text-black font-bold p-5 shadow-lg rounded-sm text-xs leading-relaxed border-t-4 border-black select-none print:shadow-none print:border-none"
          >
            {/* Firma Başlığı */}
            <div className="text-center pb-3 border-b-2 border-dashed border-black space-y-0.5">
              <div className="flex justify-center mb-1">
                <Building2 className="w-6 h-6 text-black stroke-[2.5]" />
              </div>
              <h2 className="font-black text-sm uppercase tracking-wide leading-snug break-words text-black">
                {issuerMainTitle}
              </h2>
              {issuerSubTitle && (
                <p className="text-[11px] font-extrabold text-black leading-snug break-words">
                  {issuerSubTitle}
                </p>
              )}
              {issuerAddressLine && (
                <p className="text-[10px] font-bold text-black leading-tight break-words">
                  {issuerAddressLine}
                </p>
              )}
              {issuerPhoneLine && (
                <p className="text-[10px] font-bold text-black leading-tight">
                  {issuerPhoneLine}
                </p>
              )}
              {issuerTaxLine && (
                <p className="text-[10px] font-bold text-black leading-tight">
                  {issuerTaxLine}
                </p>
              )}
              {!issuerAddressLine && !issuerPhoneLine && !issuerTaxLine && (
                <p className="text-[10px] font-bold text-black">Saha Dağıtım & Mobil B2B Sistemi</p>
              )}
            </div>

            {/* Belge Türü Başlığı */}
            <div className="text-center py-2.5 my-1 border-b-2 border-dashed border-black">
              <span className="font-black text-xs uppercase tracking-wider px-2.5 py-1 border-2 border-black text-black inline-block">
                {slipType === 'order' ? (orderData?.saleType === 'hot' ? '🔥 SICAK SATIŞ TESLİM FİŞİ' : 'SİPARİŞ BİLGİ FİŞİ') :
                 slipType === 'collection' ? 'TAHSİLAT MAKBUZU' :
                 slipType === 'return' ? 'SAHA İADE / DEĞİŞİM FİŞİ' :
                 slipType === 'van_loading' ? 'ARAÇ MAL YÜKLEME TRANSFER FİŞİ' :
                 slipType === 'van_audit' ? 'ARAÇ GÜN SONU SAYIM TUTANAĞI' :
                 'GÜN SONU Z RAPORU'}
              </span>
            </div>

            {/* Belge & Müşteri Detayları */}
            <div className="py-2 text-[11px] border-b-2 border-dashed border-black space-y-1 text-black font-bold">
              {slipType === 'order' && orderData && (
                <>
                  <div className="flex justify-between gap-2">
                    <span className="font-bold text-black shrink-0">FİŞ NO:</span>
                    <span className="font-black text-black text-right">{orderData.tempId}</span>
                  </div>
                  {orderData.erp12DocNo && (
                    <div className="flex justify-between gap-2">
                      <span className="font-bold text-black shrink-0">ERP NO:</span>
                      <span className="font-black text-black text-right">{orderData.erp12DocNo}</span>
                    </div>
                  )}
                  {orderData.saleType === 'hot' && (
                    <div className="flex justify-between font-black text-black border-2 border-black px-1.5 py-0.5 text-[10px]">
                      <span>SATIŞ ŞEKLİ:</span>
                      <span>🔥 ARAÇTAN TESLİM ({orderData.vanPlate || 'ARAÇ'})</span>
                    </div>
                  )}
                  <div className="flex justify-between gap-2">
                    <span className="font-bold text-black shrink-0">TARİH/SAAT:</span>
                    <span className="font-bold text-black text-right">{nowFormatted}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="font-bold text-black shrink-0">MÜŞTERİ:</span>
                    <span className="font-black text-black text-right break-words">{orderData.customerName}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="font-bold text-black shrink-0">CARİ KOD:</span>
                    <span className="font-bold text-black text-right">{orderData.customerCode}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="font-bold text-black shrink-0">İSKONTO ORANI:</span>
                    <span className="font-black text-black text-right">%{orderDiscountRate.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="font-bold text-black shrink-0">PLASİYER:</span>
                    <span className="font-bold text-black text-right">{orderData.salesRepCode}</span>
                  </div>
                </>
              )}

              {slipType === 'van_loading' && vanLoadingData && (
                <>
                  <div className="flex justify-between gap-2">
                    <span className="font-bold text-black">TRANSFER NO:</span>
                    <span className="font-black text-black">{vanLoadingData.docNo}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="font-bold text-black">TARİH/SAAT:</span>
                    <span className="font-bold text-black">{nowFormatted}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="font-bold text-black">ARAÇ PLAKASI:</span>
                    <span className="font-black text-black">{vanLoadingData.vanPlate}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="font-bold text-black">ÇIKIŞ DEPOSU:</span>
                    <span className="font-bold text-black">{vanLoadingData.sourceWarehouse}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="font-bold text-black">HEDEF DEPO:</span>
                    <span className="font-bold text-black">{vanLoadingData.targetVanWarehouse}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="font-bold text-black">PLASİYER:</span>
                    <span className="font-bold text-black">{vanLoadingData.salesRepCode}</span>
                  </div>
                </>
              )}

              {slipType === 'van_audit' && vanAuditData && (
                <>
                  <div className="flex justify-between gap-2">
                    <span className="font-bold text-black">TUTANAK NO:</span>
                    <span className="font-black text-black">{vanAuditData.docNo}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="font-bold text-black">TARİH/SAAT:</span>
                    <span className="font-bold text-black">{nowFormatted}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="font-bold text-black">ARAÇ PLAKASI:</span>
                    <span className="font-black text-black">{vanAuditData.vanPlate}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="font-bold text-black">PLASİYER:</span>
                    <span className="font-bold text-black">{vanAuditData.salesRepCode}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="font-bold text-black">SAYILAN ÇEŞİT:</span>
                    <span className="font-bold text-black">{vanAuditData.items.length} Kalem</span>
                  </div>
                </>
              )}

              {slipType === 'collection' && collectionData && (
                <>
                  <div className="flex justify-between gap-2">
                    <span className="font-bold text-black">MAKBUZ NO:</span>
                    <span className="font-black text-black">{collectionData.receiptNo}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="font-bold text-black">TARİH/SAAT:</span>
                    <span className="font-bold text-black">{nowFormatted}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="font-bold text-black shrink-0">MÜŞTERİ:</span>
                    <span className="font-black text-black text-right break-words">{collectionData.customerName}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="font-bold text-black">CARİ KOD:</span>
                    <span className="font-bold text-black">{collectionData.customerCode}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="font-bold text-black">TAHSİLAT TÜRÜ:</span>
                    <span className="font-black text-black">{paymentLabels[collectionData.paymentMethod] || collectionData.paymentMethod}</span>
                  </div>
                  {collectionData.paymentMethod === 'cek' && (
                    <div className="text-[10px] font-bold text-black p-1.5 rounded mt-1 border border-black">
                      <div>Çek No: {collectionData.checkNo || '-'}</div>
                      <div>Banka: {collectionData.checkBank || '-'}</div>
                      <div>Vade: {collectionData.checkDueDate || '-'}</div>
                    </div>
                  )}
                </>
              )}

              {slipType === 'return' && returnData && (
                <>
                  <div className="flex justify-between gap-2">
                    <span className="font-bold text-black">İADE NO:</span>
                    <span className="font-black text-black">{returnData.receiptNo}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="font-bold text-black">TARİH/SAAT:</span>
                    <span className="font-bold text-black">{nowFormatted}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="font-bold text-black shrink-0">MÜŞTERİ:</span>
                    <span className="font-black text-black text-right break-words">{returnData.customerName}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="font-bold text-black">CARİ KOD:</span>
                    <span className="font-bold text-black">{returnData.customerCode}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="font-bold text-black">PLASİYER:</span>
                    <span className="font-bold text-black">{returnData.salesRepCode}</span>
                  </div>
                </>
              )}

              {slipType === 'end_of_day' && endOfDayData && (
                <>
                  <div className="flex justify-between gap-2">
                    <span className="font-bold text-black">RAPOR TARİHİ:</span>
                    <span className="font-black text-black">{endOfDayData.date}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="font-bold text-black">PLASİYER:</span>
                    <span className="font-black text-black">{endOfDayData.salesRepName} ({endOfDayData.salesRepCode})</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="font-bold text-black">BASIM SAATİ:</span>
                    <span className="font-bold text-black">{nowFormatted}</span>
                  </div>
                </>
              )}
            </div>

            {/* Kalemler / Detaylar Tablosu */}
            {slipType === 'order' && orderData && (
              <div className="py-2 border-b-2 border-dashed border-black">
                <table className="w-full text-left text-[10px] text-black font-bold">
                  <thead>
                    <tr className="border-b-2 border-black text-black font-black">
                      <th className="pb-1">ÜRÜN ADI</th>
                      <th className="pb-1 text-center">MİKTAR</th>
                      <th className="pb-1 text-right">FİYAT</th>
                      <th className="pb-1 text-right">TUTAR</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dotted divide-black">
                    {orderData.items.map((it, idx) => (
                      <tr key={idx} className="py-1">
                        <td className="py-1.5 pr-1 break-words max-w-[140px] font-bold text-black">
                          <div>{it.productName}</div>
                          {it.isGift && (
                            <span className="text-[9px] font-black text-black uppercase block">
                              🎁 BEDELSİZ ({it.campaignTitle || 'Promosyon'})
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 text-center font-bold text-black">{it.quantity}</td>
                        <td className="py-1.5 text-right font-bold text-black whitespace-nowrap">
                          {it.isGift ? (
                            <span className="line-through text-black">{(it.originalUnitPrice || it.unitPrice).toFixed(2)}</span>
                          ) : (
                            it.unitPrice.toFixed(2)
                          )}
                        </td>
                        <td className="py-1.5 text-right font-black text-black whitespace-nowrap">
                          {it.isGift ? '0.00' : it.grandTotal.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {slipType === 'return' && returnData && (
              <div className="py-2 border-b-2 border-dashed border-black">
                <table className="w-full text-left text-[10px] text-black font-bold">
                  <thead>
                    <tr className="border-b-2 border-black text-black font-black">
                      <th className="pb-1">İADE EDİLEN ÜRÜN</th>
                      <th className="pb-1 text-center">MİKTAR</th>
                      <th className="pb-1 text-right">TUTAR</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dotted divide-black">
                    {returnData.items.map((it, idx) => (
                      <tr key={idx} className="py-1">
                        <td className="py-1.5 pr-1 break-words max-w-[150px] font-bold text-black">
                          <div>{it.productName}</div>
                          <div className="text-[9px] font-bold text-black">[{it.reason}]</div>
                        </td>
                        <td className="py-1.5 text-center font-bold text-black">{it.quantity} {it.unit}</td>
                        <td className="py-1.5 text-right font-black text-black whitespace-nowrap">{it.totalAmount.toFixed(2)} ₺</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {slipType === 'van_loading' && vanLoadingData && (
              <div className="py-2 border-b-2 border-dashed border-black">
                <table className="w-full text-left text-[10px] text-black font-bold">
                  <thead>
                    <tr className="border-b-2 border-black text-black font-black">
                      <th className="pb-1">YÜKLENEN ÜRÜN</th>
                      <th className="pb-1 text-center">BİRİM</th>
                      <th className="pb-1 text-right">MİKTAR</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dotted divide-black">
                    {vanLoadingData.items.map((it, idx) => (
                      <tr key={idx} className="py-1">
                        <td className="py-1.5 pr-1 break-words max-w-[160px] font-bold text-black">{it.productName}</td>
                        <td className="py-1.5 text-center font-bold text-black">{it.unit}</td>
                        <td className="py-1.5 text-right font-black text-black">{it.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {slipType === 'van_audit' && vanAuditData && (
              <div className="py-2 border-b-2 border-dashed border-black">
                <table className="w-full text-left text-[10px] text-black font-bold">
                  <thead>
                    <tr className="border-b-2 border-black text-black font-black">
                      <th className="pb-1">ÜRÜN ADI</th>
                      <th className="pb-1 text-center">TEORİK</th>
                      <th className="pb-1 text-center">SAYILAN</th>
                      <th className="pb-1 text-right">FARK</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dotted divide-black">
                    {vanAuditData.items.map((it, idx) => (
                      <tr key={idx} className="py-1">
                        <td className="py-1.5 pr-1 break-words max-w-[130px] font-bold text-black">{it.productName}</td>
                        <td className="py-1.5 text-center font-bold text-black">{it.theoreticalStock}</td>
                        <td className="py-1.5 text-center font-black text-black">{it.countedStock}</td>
                        <td className="py-1.5 text-right font-black text-black">
                          {it.difference > 0 ? `+${it.difference}` : it.difference}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {slipType === 'end_of_day' && endOfDayData && (
              <div className="py-2 border-b-2 border-dashed border-black space-y-2 text-[10px] text-black font-bold">
                <div>
                  <span className="font-black block border-b border-black pb-0.5 mb-1">1. SİPARİŞ PERFORMANSI</span>
                  <div className="flex justify-between">
                    <span>Sipariş Sayısı:</span>
                    <span className="font-black">{endOfDayData.ordersSummary.count} Adet</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Net Sipariş Cirosu:</span>
                    <span className="font-black">{endOfDayData.ordersSummary.totalNet.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                  </div>
                </div>

                <div>
                  <span className="font-black block border-b border-black pb-0.5 mb-1">2. TAHSİLAT DAĞILIMI</span>
                  <div className="flex justify-between">
                    <span>Nakit Tahsilat:</span>
                    <span>{endOfDayData.collectionsSummary.cashAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺ ({endOfDayData.collectionsSummary.cashCount} Adet)</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Kredi Kartı / POS:</span>
                    <span>{endOfDayData.collectionsSummary.posAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺ ({endOfDayData.collectionsSummary.posCount} Adet)</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Müşteri Çeki:</span>
                    <span>{endOfDayData.collectionsSummary.checkAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺ ({endOfDayData.collectionsSummary.checkCount} Adet)</span>
                  </div>
                  <div className="flex justify-between font-black pt-0.5 border-t border-dotted border-black">
                    <span>Toplam Tahsilat:</span>
                    <span>{endOfDayData.collectionsSummary.totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                  </div>
                </div>

                <div>
                  <span className="font-black block border-b border-black pb-0.5 mb-1">3. RUT & ZİYARETLER</span>
                  <div className="flex justify-between">
                    <span>Ziyaret Edilen / Planlanan:</span>
                    <span>{endOfDayData.visitsSummary.completed} / {endOfDayData.visitsSummary.totalPlanned} (%{endOfDayData.visitsSummary.successRate})</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Sipariş Alınan Müşteri:</span>
                    <span>{endOfDayData.visitsSummary.withOrder} Cari</span>
                  </div>
                </div>
              </div>
            )}

            {/* Alt Toplamlar & İcmal */}
            <div className="py-2.5 border-b-2 border-dashed border-black space-y-1 text-[11px] text-black font-bold">
              {slipType === 'order' && orderData && (
                <>
                  <div className="flex justify-between text-black font-bold">
                    <span>Ara Toplam:</span>
                    <span>{orderSubtotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                  </div>
                  <div className="flex justify-between text-black font-bold">
                    <span>İskonto Oranı:</span>
                    <span>%{orderDiscountRate.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between text-black font-bold">
                    <span>İskonto Tutarı:</span>
                    <span>{orderDiscountAmount > 0 ? '-' : ''}{orderDiscountAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                  </div>
                  {orderData.campaignDiscount && orderData.campaignDiscount > 0 && (
                    <div className="flex justify-between text-black font-black">
                      <span>Kampanya İndirimi:</span>
                      <span>-{orderData.campaignDiscount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                    </div>
                  )}
                  <div className="flex justify-between text-black font-bold">
                    <span>KDV Tutarı:</span>
                    <span>{orderEffectiveVat.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                  </div>
                  <div className="flex justify-between text-sm font-black pt-1.5 border-t-2 border-black text-black">
                    <span>GENEL TOPLAM:</span>
                    <span>{orderEffectiveGrandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                  </div>

                  {orderData.totalCampaignSavings && orderData.totalCampaignSavings > 0 && (
                    <div className="mt-2 p-1.5 border border-black rounded text-center">
                      <span className="font-black text-[10px] text-black">
                        🎁 TOPLAM KAMPANYA KAZANCINIZ: {orderData.totalCampaignSavings.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                      </span>
                    </div>
                  )}

                  {orderData.appliedCampaigns && orderData.appliedCampaigns.length > 0 && (
                    <div className="mt-1.5 pt-1 border-t border-dotted border-black text-[9px] text-black font-bold space-y-0.5">
                      <div className="font-black uppercase tracking-wider text-[8px] text-black">Uygulanan Kampanyalar:</div>
                      {orderData.appliedCampaigns.map((camp, cIdx) => (
                        <div key={cIdx} className="flex items-center gap-1">
                          <span>🎁</span>
                          <span className="break-words">{camp.campaignTitle}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {slipType === 'collection' && collectionData && (
                <>
                  <div className="flex justify-between text-sm font-black py-1 text-black">
                    <span>TAHSİLAT TUTARI:</span>
                    <span className="text-base">{collectionData.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                  </div>
                  <div className="p-1.5 border border-black rounded text-[10px] font-bold text-center text-black">
                    {amountToTurkishWords(collectionData.amount)}
                  </div>
                  
                  {/* Bakiye Durumu */}
                  <div className="pt-2 text-[10px] space-y-1 text-black font-bold">
                    <div className="flex justify-between">
                      <span>Önceki Bakiye:</span>
                      <span>{customerPreviousBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                    </div>
                    <div className="flex justify-between font-black">
                      <span>Tahsil Edilen:</span>
                      <span>-{collectionData.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                    </div>
                    <div className="flex justify-between font-black text-black pt-1 border-t border-black">
                      <span>Kalan Cari Bakiye:</span>
                      <span>{Math.max(0, customerPreviousBalance - collectionData.amount).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                    </div>
                  </div>
                </>
              )}

              {slipType === 'return' && returnData && (
                <>
                  <div className="flex justify-between text-sm font-black py-1 text-black">
                    <span>TOPLAM İADE TUTARI:</span>
                    <span className="text-base">{returnData.grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                  </div>
                  <div className="p-1.5 border border-black rounded text-[10px] font-bold text-center text-black">
                    {amountToTurkishWords(returnData.grandTotal)}
                  </div>

                  <div className="pt-2 text-[10px] space-y-1 text-black font-bold">
                    <div className="flex justify-between">
                      <span>Önceki Cari Borç:</span>
                      <span>{customerPreviousBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                    </div>
                    <div className="flex justify-between font-black">
                      <span>İade Düşümü:</span>
                      <span>-{returnData.grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                    </div>
                    <div className="flex justify-between font-black text-black pt-1 border-t border-black">
                      <span>Güncellenen Cari Borç:</span>
                      <span>{Math.max(0, customerPreviousBalance - returnData.grandTotal).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                    </div>
                  </div>
                </>
              )}

              {slipType === 'van_loading' && vanLoadingData && (
                <>
                  <div className="flex justify-between text-black font-bold">
                    <span>Yüklenen Çeşit:</span>
                    <span>{vanLoadingData.items.length} Kalem</span>
                  </div>
                  <div className="flex justify-between text-sm font-black pt-1 border-t-2 border-black text-black">
                    <span>TOPLAM YÜKLENEN ADET:</span>
                    <span className="text-base">{vanLoadingData.totalQuantity} Adet</span>
                  </div>
                  {vanLoadingData.notes && (
                    <p className="text-[10px] text-black font-bold pt-1">
                      Açıklama: {vanLoadingData.notes}
                    </p>
                  )}
                </>
              )}

              {slipType === 'van_audit' && vanAuditData && (
                <>
                  <div className="flex justify-between text-black font-bold">
                    <span>Teorik Araç Stoğu:</span>
                    <span>{vanAuditData.totalTheoretical} Adet</span>
                  </div>
                  <div className="flex justify-between text-black font-bold">
                    <span>Fiili Sayılan Stok:</span>
                    <span className="font-black">{vanAuditData.totalCounted} Adet</span>
                  </div>
                  <div className="flex justify-between text-sm font-black pt-1 border-t-2 border-black text-black">
                    <span>NET SAYIM FARKI:</span>
                    <span>
                      {vanAuditData.totalDifference > 0 ? `+${vanAuditData.totalDifference}` : vanAuditData.totalDifference} Adet
                    </span>
                  </div>
                  <div className="flex justify-between text-xs font-black text-black">
                    <span>FARK TUTARI:</span>
                    <span>{vanAuditData.totalDifferenceAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                  </div>
                  {vanAuditData.notes && (
                    <p className="text-[10px] text-black font-bold pt-1">
                      Sayım Notu: {vanAuditData.notes}
                    </p>
                  )}
                </>
              )}

              {slipType === 'end_of_day' && endOfDayData && (
                <div className="pt-1 border-t-2 border-black space-y-1 text-black">
                  <div className="flex justify-between text-xs font-black">
                    <span>FİİLİ NAKİT KASA:</span>
                    <span className="text-sm">{endOfDayData.netCashBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                  </div>
                  <p className="text-[9px] text-black font-bold text-center">
                    Kasaya teslim edilecek net nakit para tutarıdır.
                  </p>
                </div>
              )}
            </div>

            {/* İmza Alanı */}
            <div className="py-4 border-b-2 border-dashed border-black">
              <div className="grid grid-cols-2 gap-4 text-center text-[10px] text-black">
                <div className="border-t-2 border-black pt-1">
                  <p className="font-black text-black">{signaturesConfig.leftTitle}</p>
                  <p className="text-[9px] font-bold text-black">{signaturesConfig.leftSubtitle}</p>
                </div>
                <div className="border-t-2 border-black pt-1">
                  <p className="font-black text-black">{signaturesConfig.rightTitle}</p>
                  <p className="text-[9px] font-bold text-black">{signaturesConfig.rightSubtitle}</p>
                </div>
              </div>
            </div>

            {/* Alt Bilgi & QR Simülasyonu */}
            <div className="text-center pt-3 text-[9px] text-black font-bold space-y-1.5">
              <div className="flex justify-center">
                <QrCode className="w-12 h-12 text-black stroke-[2.2]" />
              </div>
              <p className="font-black text-black text-[10px]">
                {footerPrimaryText}
              </p>
              <p className="font-bold text-black">Fatura ve resmi sevk irsaliyesi yerine geçmez.</p>
              <p className="text-[8px] font-bold text-black">Yazılım: ERP12 Mobil Saha & B2B Dağıtım</p>
            </div>
          </div>
        </div>

        {/* Alt Aksiyon Butonları */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col gap-2.5">
          {copiedAlert && (
            <div className="p-2 text-xs rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-center font-medium animate-fadeIn">
              Fiş metni kopyalandı ve WhatsApp yönlendirildi!
            </div>
          )}

          {printStatusMsg && (
            <div
              className={`p-2.5 text-xs rounded-xl flex items-center justify-center gap-1.5 font-bold animate-fadeIn ${
                printStatusMsg.type === 'success'
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                  : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{printStatusMsg.text}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleWhatsAppShare}
              className="flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm transition-all shadow-md active:scale-95"
            >
              <Share2 className="w-4 h-4" />
              <span>WhatsApp</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              disabled={isPrinting}
              className="flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold text-sm transition-all shadow-md active:scale-95"
            >
              {isPrinting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Yazdırılıyor...</span>
                </>
              ) : (
                <>
                  <Printer className="w-4 h-4" />
                  <span>Yazdır / Fiş Çıkar</span>
                </>
              )}
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-2xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
};
