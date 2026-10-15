import React, { useState } from 'react';
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
  ClipboardCheck
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
  const [paperWidth, setPaperWidth] = useState<'58mm' | '80mm'>('58mm');
  const [copiedAlert, setCopiedAlert] = useState<boolean>(false);

  if (!isOpen) return null;

  const nowFormatted = new Date().toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const handlePrint = () => {
    window.print();
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
        ? `*OSMANLI GIDA - 🔥 SICAK SATIŞ BİLGİ FİŞİ*\n*Satış Türü:* ARAÇTAN ANINDA TESLİM (${orderData.vanPlate || 'Mobil Depo'})\n` 
        : `*OSMANLI GIDA - SİPARİŞ BİLGİ FİŞİ*\n`;

      text = saleTypeHeader +
        `--------------------------------\n` +
        `*Fiş No:* ${orderData.tempId}\n` +
        `*Tarih:* ${nowFormatted}\n` +
        `*Müşteri:* ${orderData.customerName}\n` +
        `*Cari Kod:* ${orderData.customerCode}\n` +
        `--------------------------------\n` +
        itemsText +
        campaignSection +
        `--------------------------------\n` +
        (orderData.campaignDiscount && orderData.campaignDiscount > 0 ? `*Kampanya İskontosu:* -${orderData.campaignDiscount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺\n` : '') +
        savingsSection +
        `*Toplam Tutar:* ${orderData.grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺\n` +
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
      text = `*OSMANLI GIDA - TAHSİLAT MAKBUZU*\n` +
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
      text = `*OSMANLI GIDA - SAHA İADE VE DEĞİŞİM FİŞİ*\n` +
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
      text = `*🚚 OSMANLI GIDA - ARAÇ MAL YÜKLEME FİŞİ*\n` +
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
      text = `*📋 OSMANLI GIDA - ARAÇ SAYIM VE MUTABAKAT TUTANAĞI*\n` +
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
      text = `*📊 OSMANLI GIDA - GÜN SONU PLASİYER RAPORU (Z RAPORU)*\n` +
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

  const paymentLabels: Record<string, string> = {
    nakit: 'NAKİT TAHSİLAT',
    kredi_karti: 'KREDİ KARTI / POS',
    havale: 'BANKA HAVALE / EFT',
    cek: 'MÜŞTERİ ÇEKİ',
  };

  const slipTitle = 
    slipType === 'order' ? (orderData?.saleType === 'hot' ? '🔥 Sıcak Satış Teslim Fişi' : 'Sipariş Bilgi Fişi') :
    slipType === 'collection' ? 'Tahsilat Makbuzu' :
    slipType === 'return' ? 'İade & Değişim Fişi' :
    slipType === 'van_loading' ? 'Araç Mal Yükleme Fişi' :
    slipType === 'van_audit' ? 'Araç Sayım & Fark Tutanağı' :
    'Gün Sonu Z Raporu';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/75 backdrop-blur-sm animate-fadeIn">
      {/* Yazdırma Sırasında Ekranda Gözükmeyen Stil */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #thermal-print-area, #thermal-print-area * {
            visibility: visible !important;
          }
          #thermal-print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: ${paperWidth === '58mm' ? '58mm' : '80mm'} !important;
            margin: 0 !important;
            padding: 8px !important;
            background: white !important;
            color: black !important;
            box-shadow: none !important;
          }
          @page {
            size: ${paperWidth === '58mm' ? '58mm auto' : '80mm auto'};
            margin: 0;
          }
        }
      `}</style>

      <div className="relative w-full max-w-md max-h-[92vh] flex flex-col bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
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
              <p className="text-xs text-slate-500 dark:text-slate-400">Termal Mobil Çıktı Önizleme</p>
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

        {/* Fiş Önizleme Alanı (Termal Kağıt Efekti) */}
        <div className="flex-1 overflow-y-auto p-4 bg-slate-100 dark:bg-slate-950 flex justify-center items-start">
          <div
            id="thermal-print-area"
            style={{
              width: paperWidth === '58mm' ? '300px' : '380px',
              fontFamily: "'Courier New', Courier, monospace",
            }}
            className="bg-white text-black p-5 shadow-lg rounded-sm text-xs leading-relaxed border-t-4 border-slate-300 select-none print:shadow-none print:border-none"
          >
            {/* Firma Başlığı */}
            <div className="text-center pb-3 border-b border-dashed border-black">
              <div className="flex justify-center mb-1">
                <Building2 className="w-6 h-6 text-black" />
              </div>
              <h2 className="font-extrabold text-sm uppercase tracking-wider">OSMANLI GIDA</h2>
              <p className="text-[10px] text-gray-700">PAZARLAMA SAN. TİC. LTD. ŞTİ.</p>
              <p className="text-[9px] text-gray-600">Saha Dağıtım & Mobil B2B Sistemi</p>
              <p className="text-[9px] text-gray-600">Tel: 0442 123 45 67 • Erzurum</p>
            </div>

            {/* Belge Türü Başlığı */}
            <div className="text-center py-2.5 my-1 border-b border-dashed border-black">
              <span className="font-black text-xs uppercase tracking-widest px-2 py-0.5 border border-black inline-block">
                {slipType === 'order' ? (orderData?.saleType === 'hot' ? '🔥 SICAK SATIŞ TESLİM FİŞİ' : 'SİPARİŞ BİLGİ FİŞİ') :
                 slipType === 'collection' ? 'TAHSİLAT MAKBUZU' :
                 slipType === 'return' ? 'SAHA İADE / DEĞİŞİM FİŞİ' :
                 slipType === 'van_loading' ? 'ARAÇ MAL YÜKLEME TRANSFER FİŞİ' :
                 slipType === 'van_audit' ? 'ARAÇ GÜN SONU SAYIM TUTANAĞI' :
                 'GÜN SONU Z RAPORU'}
              </span>
            </div>

            {/* Belge & Müşteri Detayları */}
            <div className="py-2 text-[11px] border-b border-dashed border-black space-y-1">
              {slipType === 'order' && orderData && (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-600">FİŞ NO:</span>
                    <span className="font-bold">{orderData.tempId}</span>
                  </div>
                  {orderData.erp12DocNo && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">ERP NO:</span>
                      <span className="font-bold">{orderData.erp12DocNo}</span>
                    </div>
                  )}
                  {orderData.saleType === 'hot' && (
                    <div className="flex justify-between font-bold text-black border border-black px-1 py-0.5 bg-gray-50 text-[10px]">
                      <span>SATIŞ ŞEKLİ:</span>
                      <span>🔥 ARAÇTAN TESLİM ({orderData.vanPlate || 'ARAÇ'})</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-600">TARİH/SAAT:</span>
                    <span>{nowFormatted}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">MÜŞTERİ:</span>
                    <span className="font-bold text-right max-w-[170px] truncate">{orderData.customerName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">CARİ KOD:</span>
                    <span>{orderData.customerCode}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">PLASİYER:</span>
                    <span>{orderData.salesRepCode}</span>
                  </div>
                </>
              )}

              {slipType === 'van_loading' && vanLoadingData && (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-600">TRANSFER NO:</span>
                    <span className="font-bold">{vanLoadingData.docNo}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">TARİH/SAAT:</span>
                    <span>{nowFormatted}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">ARAÇ PLAKASI:</span>
                    <span className="font-bold">{vanLoadingData.vanPlate}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">ÇIKIŞ DEPOSU:</span>
                    <span>{vanLoadingData.sourceWarehouse}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">HEDEF DEPO:</span>
                    <span>{vanLoadingData.targetVanWarehouse}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">PLASİYER:</span>
                    <span>{vanLoadingData.salesRepCode}</span>
                  </div>
                </>
              )}

              {slipType === 'van_audit' && vanAuditData && (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-600">TUTANAK NO:</span>
                    <span className="font-bold">{vanAuditData.docNo}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">TARİH/SAAT:</span>
                    <span>{nowFormatted}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">ARAÇ PLAKASI:</span>
                    <span className="font-bold">{vanAuditData.vanPlate}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">PLASİYER:</span>
                    <span>{vanAuditData.salesRepCode}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">SAYILAN ÇEŞİT:</span>
                    <span>{vanAuditData.items.length} Kalem</span>
                  </div>
                </>
              )}

              {slipType === 'collection' && collectionData && (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-600">MAKBUZ NO:</span>
                    <span className="font-bold">{collectionData.receiptNo}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">TARİH/SAAT:</span>
                    <span>{nowFormatted}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">MÜŞTERİ:</span>
                    <span className="font-bold text-right max-w-[170px] truncate">{collectionData.customerName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">CARİ KOD:</span>
                    <span>{collectionData.customerCode}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">TAHSİLAT TÜRÜ:</span>
                    <span className="font-bold text-black">{paymentLabels[collectionData.paymentMethod] || collectionData.paymentMethod}</span>
                  </div>
                  {collectionData.paymentMethod === 'cek' && (
                    <div className="text-[10px] text-gray-700 bg-gray-50 p-1 rounded mt-1 border border-gray-200">
                      <div>Çek No: {collectionData.checkNo || '-'}</div>
                      <div>Banka: {collectionData.checkBank || '-'}</div>
                      <div>Vade: {collectionData.checkDueDate || '-'}</div>
                    </div>
                  )}
                </>
              )}

              {slipType === 'return' && returnData && (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-600">İADE NO:</span>
                    <span className="font-bold">{returnData.receiptNo}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">TARİH/SAAT:</span>
                    <span>{nowFormatted}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">MÜŞTERİ:</span>
                    <span className="font-bold text-right max-w-[170px] truncate">{returnData.customerName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">CARİ KOD:</span>
                    <span>{returnData.customerCode}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">PLASİYER:</span>
                    <span>{returnData.salesRepCode}</span>
                  </div>
                </>
              )}

              {slipType === 'end_of_day' && endOfDayData && (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-600">RAPOR TARİHİ:</span>
                    <span className="font-bold">{endOfDayData.date}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">PLASİYER:</span>
                    <span className="font-bold">{endOfDayData.salesRepName} ({endOfDayData.salesRepCode})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">BASIM SAATİ:</span>
                    <span>{nowFormatted}</span>
                  </div>
                </>
              )}
            </div>

            {/* Kalemler / Detaylar Tablosu */}
            {slipType === 'order' && orderData && (
              <div className="py-2 border-b border-dashed border-black">
                <table className="w-full text-left text-[10px]">
                  <thead>
                    <tr className="border-b border-black text-gray-700">
                      <th className="pb-1">ÜRÜN ADI</th>
                      <th className="pb-1 text-center">MİKTAR</th>
                      <th className="pb-1 text-right">FİYAT</th>
                      <th className="pb-1 text-right">TUTAR</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dotted divide-gray-300">
                    {orderData.items.map((it, idx) => (
                      <tr key={idx} className={`py-1 ${it.isGift ? 'bg-emerald-50/50' : ''}`}>
                        <td className="py-1 pr-1 truncate max-w-[110px]">
                          <div>{it.productName}</div>
                          {it.isGift && (
                            <span className="text-[8px] font-bold text-emerald-800 uppercase block">
                              🎁 BEDELSİZ ({it.campaignTitle || 'Promosyon'})
                            </span>
                          )}
                        </td>
                        <td className="py-1 text-center font-mono">{it.quantity}</td>
                        <td className="py-1 text-right font-mono">
                          {it.isGift ? (
                            <span className="line-through text-gray-500">{(it.originalUnitPrice || it.unitPrice).toFixed(2)}</span>
                          ) : (
                            it.unitPrice.toFixed(2)
                          )}
                        </td>
                        <td className="py-1 text-right font-bold font-mono">
                          {it.isGift ? (
                            <span className="text-emerald-700">0.00</span>
                          ) : (
                            it.grandTotal.toFixed(2)
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {slipType === 'return' && returnData && (
              <div className="py-2 border-b border-dashed border-black">
                <table className="w-full text-left text-[10px]">
                  <thead>
                    <tr className="border-b border-black text-gray-700">
                      <th className="pb-1">İADE EDİLEN ÜRÜN</th>
                      <th className="pb-1 text-center">MİKTAR</th>
                      <th className="pb-1 text-right">TUTAR</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dotted divide-gray-300">
                    {returnData.items.map((it, idx) => (
                      <tr key={idx} className="py-1">
                        <td className="py-1 pr-1 truncate max-w-[130px]">
                          <div>{it.productName}</div>
                          <div className="text-[9px] text-gray-500 italic">[{it.reason}]</div>
                        </td>
                        <td className="py-1 text-center font-mono">{it.quantity} {it.unit}</td>
                        <td className="py-1 text-right font-bold font-mono">{it.totalAmount.toFixed(2)} ₺</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {slipType === 'van_loading' && vanLoadingData && (
              <div className="py-2 border-b border-dashed border-black">
                <table className="w-full text-left text-[10px]">
                  <thead>
                    <tr className="border-b border-black text-gray-700">
                      <th className="pb-1">YÜKLENEN ÜRÜN</th>
                      <th className="pb-1 text-center">BİRİM</th>
                      <th className="pb-1 text-right">MİKTAR</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dotted divide-gray-300">
                    {vanLoadingData.items.map((it, idx) => (
                      <tr key={idx} className="py-1">
                        <td className="py-1 pr-1 truncate max-w-[150px] font-semibold">{it.productName}</td>
                        <td className="py-1 text-center font-mono">{it.unit}</td>
                        <td className="py-1 text-right font-bold font-mono">{it.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {slipType === 'van_audit' && vanAuditData && (
              <div className="py-2 border-b border-dashed border-black">
                <table className="w-full text-left text-[9px]">
                  <thead>
                    <tr className="border-b border-black text-gray-700">
                      <th className="pb-1">ÜRÜN ADI</th>
                      <th className="pb-1 text-center">TEORİK</th>
                      <th className="pb-1 text-center">SAYILAN</th>
                      <th className="pb-1 text-right">FARK</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dotted divide-gray-300">
                    {vanAuditData.items.map((it, idx) => (
                      <tr key={idx} className="py-1">
                        <td className="py-1 pr-1 truncate max-w-[120px] font-medium">{it.productName}</td>
                        <td className="py-1 text-center font-mono">{it.theoreticalStock}</td>
                        <td className="py-1 text-center font-mono font-bold">{it.countedStock}</td>
                        <td className={`py-1 text-right font-mono font-bold ${it.difference === 0 ? '' : it.difference > 0 ? 'text-blue-800' : 'text-rose-800'}`}>
                          {it.difference > 0 ? `+${it.difference}` : it.difference}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {slipType === 'end_of_day' && endOfDayData && (
              <div className="py-2 border-b border-dashed border-black space-y-2 text-[10px]">
                <div>
                  <span className="font-bold block border-b border-black pb-0.5 mb-1">1. SİPARİŞ PERFORMANSI</span>
                  <div className="flex justify-between">
                    <span>Sipariş Sayısı:</span>
                    <span className="font-bold">{endOfDayData.ordersSummary.count} Adet</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Net Sipariş Cirosu:</span>
                    <span className="font-bold">{endOfDayData.ordersSummary.totalNet.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                  </div>
                </div>

                <div>
                  <span className="font-bold block border-b border-black pb-0.5 mb-1">2. TAHSİLAT DAĞILIMI</span>
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
                  <div className="flex justify-between font-bold pt-0.5 border-t border-dotted border-gray-400">
                    <span>Toplam Tahsilat:</span>
                    <span>{endOfDayData.collectionsSummary.totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                  </div>
                </div>

                <div>
                  <span className="font-bold block border-b border-black pb-0.5 mb-1">3. RUT & ZİYARETLER</span>
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
            <div className="py-2.5 border-b border-dashed border-black space-y-1 text-[11px]">
              {slipType === 'order' && orderData && (
                <>
                  <div className="flex justify-between text-gray-600">
                    <span>Ara Toplam:</span>
                    <span>{orderData.subtotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                  </div>
                  {orderData.totalDiscount > 0 && (
                    <div className="flex justify-between text-gray-600">
                      <span>Satır İskontosu:</span>
                      <span>-{orderData.totalDiscount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                    </div>
                  )}
                  {orderData.campaignDiscount && orderData.campaignDiscount > 0 && (
                    <div className="flex justify-between text-emerald-800 font-bold">
                      <span>Kampanya İndirimi:</span>
                      <span>-{orderData.campaignDiscount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                    </div>
                  )}
                  <div className="flex justify-between text-gray-600">
                    <span>KDV Tutarı:</span>
                    <span>{orderData.totalVat.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                  </div>
                  <div className="flex justify-between text-sm font-black pt-1 border-t border-black">
                    <span>GENEL TOPLAM:</span>
                    <span>{orderData.grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                  </div>

                  {orderData.totalCampaignSavings && orderData.totalCampaignSavings > 0 && (
                    <div className="mt-2 p-1.5 bg-gray-100 border border-dashed border-gray-400 rounded text-center">
                      <span className="font-bold text-[10px] text-black">
                        🎁 TOPLAM KAMPANYA KAZANCINIZ: {orderData.totalCampaignSavings.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                      </span>
                    </div>
                  )}

                  {orderData.appliedCampaigns && orderData.appliedCampaigns.length > 0 && (
                    <div className="mt-1.5 pt-1 border-t border-dotted border-gray-400 text-[9px] text-gray-700 space-y-0.5">
                      <div className="font-bold uppercase tracking-wider text-[8px] text-gray-500">Uygulanan Kampanyalar:</div>
                      {orderData.appliedCampaigns.map((camp, cIdx) => (
                        <div key={cIdx} className="flex items-center gap-1">
                          <span>🎁</span>
                          <span className="truncate">{camp.campaignTitle}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {slipType === 'collection' && collectionData && (
                <>
                  <div className="flex justify-between text-sm font-black py-1">
                    <span>TAHSİLAT TUTARI:</span>
                    <span className="text-base">{collectionData.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                  </div>
                  <div className="p-1.5 bg-gray-100 rounded text-[10px] font-bold text-center italic">
                    {amountToTurkishWords(collectionData.amount)}
                  </div>
                  
                  {/* Bakiye Durumu */}
                  <div className="pt-2 text-[10px] space-y-1">
                    <div className="flex justify-between text-gray-600">
                      <span>Önceki Bakiye:</span>
                      <span>{customerPreviousBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                    </div>
                    <div className="flex justify-between font-bold text-emerald-800">
                      <span>Tahsil Edilen:</span>
                      <span>-{collectionData.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                    </div>
                    <div className="flex justify-between font-extrabold text-black pt-1 border-t border-gray-300">
                      <span>Kalan Cari Bakiye:</span>
                      <span>{Math.max(0, customerPreviousBalance - collectionData.amount).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                    </div>
                  </div>
                </>
              )}

              {slipType === 'return' && returnData && (
                <>
                  <div className="flex justify-between text-sm font-black py-1">
                    <span>TOPLAM İADE TUTARI:</span>
                    <span className="text-base">{returnData.grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                  </div>
                  <div className="p-1.5 bg-gray-100 rounded text-[10px] font-bold text-center italic">
                    {amountToTurkishWords(returnData.grandTotal)}
                  </div>

                  <div className="pt-2 text-[10px] space-y-1">
                    <div className="flex justify-between text-gray-600">
                      <span>Önceki Cari Borç:</span>
                      <span>{customerPreviousBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                    </div>
                    <div className="flex justify-between font-bold text-rose-800">
                      <span>İade Düşümü:</span>
                      <span>-{returnData.grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                    </div>
                    <div className="flex justify-between font-extrabold text-black pt-1 border-t border-gray-300">
                      <span>Güncellenen Cari Borç:</span>
                      <span>{Math.max(0, customerPreviousBalance - returnData.grandTotal).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                    </div>
                  </div>
                </>
              )}

              {slipType === 'van_loading' && vanLoadingData && (
                <>
                  <div className="flex justify-between text-gray-600">
                    <span>Yüklenen Çeşit:</span>
                    <span>{vanLoadingData.items.length} Kalem</span>
                  </div>
                  <div className="flex justify-between text-sm font-black pt-1 border-t border-black">
                    <span>TOPLAM YÜKLENEN ADET:</span>
                    <span className="text-base">{vanLoadingData.totalQuantity} Adet</span>
                  </div>
                  {vanLoadingData.notes && (
                    <p className="text-[10px] text-gray-600 italic pt-1">
                      Açıklama: {vanLoadingData.notes}
                    </p>
                  )}
                </>
              )}

              {slipType === 'van_audit' && vanAuditData && (
                <>
                  <div className="flex justify-between text-gray-600">
                    <span>Teorik Araç Stoğu:</span>
                    <span>{vanAuditData.totalTheoretical} Adet</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Fiili Sayılan Stok:</span>
                    <span className="font-bold">{vanAuditData.totalCounted} Adet</span>
                  </div>
                  <div className="flex justify-between text-sm font-black pt-1 border-t border-black">
                    <span>NET SAYIM FARKI:</span>
                    <span className={vanAuditData.totalDifference === 0 ? 'text-black' : vanAuditData.totalDifference > 0 ? 'text-blue-800' : 'text-rose-800'}>
                      {vanAuditData.totalDifference > 0 ? `+${vanAuditData.totalDifference}` : vanAuditData.totalDifference} Adet
                    </span>
                  </div>
                  <div className="flex justify-between text-xs font-bold text-gray-700">
                    <span>FARK TUTARI:</span>
                    <span>{vanAuditData.totalDifferenceAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                  </div>
                  {vanAuditData.notes && (
                    <p className="text-[10px] text-gray-600 italic pt-1">
                      Sayım Notu: {vanAuditData.notes}
                    </p>
                  )}
                </>
              )}

              {slipType === 'end_of_day' && endOfDayData && (
                <div className="pt-1 border-t border-black space-y-1">
                  <div className="flex justify-between text-xs font-black">
                    <span>FİİLİ NAKİT KASA:</span>
                    <span className="text-sm font-mono">{endOfDayData.netCashBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                  </div>
                  <p className="text-[9px] text-gray-500 italic text-center">
                    Kasaya teslim edilecek net nakit para tutarıdır.
                  </p>
                </div>
              )}
            </div>

            {/* İmza Alanı */}
            <div className="py-4 border-b border-dashed border-black">
              <div className="grid grid-cols-2 gap-4 text-center text-[10px]">
                <div className="border-t border-black pt-1">
                  <p className="font-bold">
                    {slipType === 'end_of_day' ? 'Raporu Düzenleyen' : 
                     slipType === 'van_loading' ? 'Depo Yetkilisi' :
                     slipType === 'van_audit' ? 'Sayımı Yapan Plasiyer' :
                     'Teslim Eden'}
                  </p>
                  <p className="text-[9px] text-gray-500">
                    {slipType === 'end_of_day' ? 'Plasiyer' : 
                     slipType === 'van_loading' ? 'Merkez Depo' :
                     slipType === 'van_audit' ? 'Plasiyer Kaşe/İmza' :
                     'Müşteri Kaşe/İmza'}
                  </p>
                </div>
                <div className="border-t border-black pt-1">
                  <p className="font-bold">
                    {slipType === 'end_of_day' ? 'Onaylayan Kasa' : 
                     slipType === 'van_loading' ? 'Teslim Alan Plasiyer' :
                     slipType === 'van_audit' ? 'Merkez Muhasebe/Denetçi' :
                     'Teslim Alan'}
                  </p>
                  <p className="text-[9px] text-gray-500">
                    {slipType === 'end_of_day' ? 'Merkez Muhasebe' : 
                     slipType === 'van_loading' ? 'Araç Sorumlusu' :
                     slipType === 'van_audit' ? 'Onay Kaşe/İmza' :
                     'Plasiyer İmza'}
                  </p>
                </div>
              </div>
            </div>

            {/* Alt Bilgi & QR Simülasyonu */}
            <div className="text-center pt-3 text-[9px] text-gray-600 space-y-1.5">
              <div className="flex justify-center">
                <QrCode className="w-12 h-12 text-black" />
              </div>
              <p className="font-bold text-black text-[10px]">
                {slipType === 'order' ? (orderData?.saleType === 'hot' ? '🔥 SICAK SATIŞ TESLİM FİŞİDİR' : 'BİLGİ FİŞİDİR - MALİ DEĞERİ YOKTUR') : 
                 slipType === 'collection' ? 'TAHSİLAT BİLGİ MAKBUZUDUR' :
                 slipType === 'return' ? 'SAHA İADE VE DEĞİŞİM BELGESİDİR' :
                 slipType === 'van_loading' ? 'ARAÇ DEPO TRANSFER FİŞİDİR' :
                 slipType === 'van_audit' ? 'GÜN SONU ARAÇ SAYIM MUTABAKATIDIR' :
                 'PLASİYER GÜN SONU KASASI Z RAPORUDUR'}
              </p>
              <p>Fatura ve resmi sevk irsaliyesi yerine geçmez.</p>
              <p className="text-[8px] text-gray-400">Yazılım: ERP12 Mobil Saha & B2B Dağıtım</p>
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
              className="flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm transition-all shadow-md active:scale-95"
            >
              <Printer className="w-4 h-4" />
              <span>Yazdır / Fiş Çıkar</span>
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
