import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useApp } from '../context/AppContext';
import type { EndOfDayReport } from '../types';
import { 
  X, 
  Calendar, 
  Printer, 
  Share2, 
  TrendingUp, 
  Banknote, 
  MapPin, 
  RotateCcw
} from 'lucide-react';

export const DailyReportModal: React.FC = () => {
  const { 
    isDailyReportModalOpen, 
    closeDailyReportModal, 
    salesRep, 
    serverConfig, 
    openPrintSlip 
  } = useApp();

  const todayStr = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [activeTab, setActiveTab] = useState<'summary' | 'orders' | 'collections' | 'visits' | 'returns'>('summary');

  // Canlı verileri IndexedDB'den çek
  const orders = useLiveQuery(() => db.orders.toArray(), []) || [];
  const collections = useLiveQuery(() => db.collections.toArray(), []) || [];
  const visits = useLiveQuery(() => db.visits.toArray(), []) || [];
  const returns = useLiveQuery(() => db.returns.toArray(), []) || [];

  // Seçilen güne ait verileri filtrele
  const dayOrders = useMemo(() => {
    return orders.filter((o) => (o.orderDate || o.createdAt).startsWith(selectedDate));
  }, [orders, selectedDate]);

  const dayCollections = useMemo(() => {
    return collections.filter((c) => c.createdAt.startsWith(selectedDate));
  }, [collections, selectedDate]);

  const dayVisits = useMemo(() => {
    const selDateObj = new Date(selectedDate);
    const dayOfWeek = selDateObj.getDay() === 0 ? 1 : Math.min(selDateObj.getDay(), 6);
    return visits.filter((v) => v.visitDate === selectedDate || v.dayOfWeek === dayOfWeek);
  }, [visits, selectedDate]);

  const dayReturns = useMemo(() => {
    return returns.filter((r) => r.createdAt.startsWith(selectedDate));
  }, [returns, selectedDate]);

  // Gün Sonu Rapor Özeti Hesaplamaları
  const reportData: EndOfDayReport = useMemo(() => {
    // 1. Sipariş İcmali
    let totalGross = 0;
    let totalDiscount = 0;
    let totalVat = 0;
    let totalNet = 0;

    dayOrders.forEach((o) => {
      totalGross += o.subtotal || 0;
      totalDiscount += o.totalDiscount || 0;
      totalVat += o.totalVat || 0;
      totalNet += o.grandTotal || 0;
    });

    // 2. Tahsilat İcmali
    let totalCol = 0;
    let cashAmt = 0;
    let cashCnt = 0;
    let posAmt = 0;
    let posCnt = 0;
    let checkAmt = 0;
    let checkCnt = 0;
    let transferAmt = 0;
    let transferCnt = 0;

    dayCollections.forEach((c) => {
      totalCol += c.amount || 0;
      if (c.paymentMethod === 'nakit') {
        cashAmt += c.amount;
        cashCnt++;
      } else if (c.paymentMethod === 'kredi_karti') {
        posAmt += c.amount;
        posCnt++;
      } else if (c.paymentMethod === 'cek') {
        checkAmt += c.amount;
        checkCnt++;
      } else if (c.paymentMethod === 'havale') {
        transferAmt += c.amount;
        transferCnt++;
      }
    });

    // 3. Ziyaret İcmali
    const totalPlanned = dayVisits.length;
    const completed = dayVisits.filter((v) => v.status === 'completed').length;
    const withOrder = dayVisits.filter((v) => v.orderCreated).length;
    const withoutOrder = completed - withOrder;
    const successRate = totalPlanned > 0 ? Math.round((completed / totalPlanned) * 100) : 0;

    const reasonsCount: Record<string, number> = {};
    dayVisits.forEach((v) => {
      if (v.noOrderReason) {
        reasonsCount[v.noOrderReason] = (reasonsCount[v.noOrderReason] || 0) + 1;
      }
    });

    // 4. İade İcmali
    let totalReturnAmt = 0;
    dayReturns.forEach((r) => {
      totalReturnAmt += r.grandTotal || 0;
    });

    return {
      date: selectedDate,
      salesRepCode: salesRep.code,
      salesRepName: salesRep.name,
      generatedAt: new Date().toISOString(),
      ordersSummary: {
        count: dayOrders.length,
        totalGross: Math.round(totalGross * 100) / 100,
        totalDiscount: Math.round(totalDiscount * 100) / 100,
        totalVat: Math.round(totalVat * 100) / 100,
        totalNet: Math.round(totalNet * 100) / 100,
      },
      collectionsSummary: {
        totalAmount: Math.round(totalCol * 100) / 100,
        cashAmount: Math.round(cashAmt * 100) / 100,
        cashCount: cashCnt,
        posAmount: Math.round(posAmt * 100) / 100,
        posCount: posCnt,
        checkAmount: Math.round(checkAmt * 100) / 100,
        checkCount: checkCnt,
        transferAmount: Math.round(transferAmt * 100) / 100,
        transferCount: transferCnt,
      },
      visitsSummary: {
        totalPlanned,
        completed,
        withOrder,
        withoutOrder: Math.max(0, withoutOrder),
        successRate,
        reasonsCount,
      },
      returnsSummary: {
        count: dayReturns.length,
        totalAmount: Math.round(totalReturnAmt * 100) / 100,
      },
      netCashBalance: Math.round(cashAmt * 100) / 100,
    };
  }, [dayOrders, dayCollections, dayVisits, dayReturns, selectedDate, salesRep]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 2,
    }).format(val);
  };

  const formatDateDisplay = (dateString: string) => {
    return new Date(dateString + 'T00:00:00').toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      weekday: 'long',
    });
  };

  // WhatsApp ile Paylaşım Metni
  const handleWhatsAppShare = () => {
    const text = 
      `*📊 OSMANLI GIDA - GÜN SONU PLASİYER RAPORU (Z RAPORU)*\n` +
      `----------------------------------------\n` +
      `*Tarih:* ${formatDateDisplay(selectedDate)}\n` +
      `*Plasiyer:* ${salesRep.name} (${salesRep.code})\n` +
      `*Dönem / Firma:* ${serverConfig.companyCode} / ${serverConfig.period}\n` +
      `----------------------------------------\n` +
      `📦 *SİPARİŞ PERFORMANSI:*\n` +
      `• Toplam Sipariş: ${reportData.ordersSummary.count} Adet\n` +
      `• Net Sipariş Cirosu: ${formatCurrency(reportData.ordersSummary.totalNet)}\n` +
      `• Toplam İskonto: ${formatCurrency(reportData.ordersSummary.totalDiscount)}\n\n` +
      `💵 *KASA & TAHSİLAT DÖKÜMÜ:*\n` +
      `• Nakit Tahsilat: ${formatCurrency(reportData.collectionsSummary.cashAmount)} (${reportData.collectionsSummary.cashCount} Adet)\n` +
      `• Kredi Kartı / POS: ${formatCurrency(reportData.collectionsSummary.posAmount)} (${reportData.collectionsSummary.posCount} Adet)\n` +
      `• Müşteri Çeki: ${formatCurrency(reportData.collectionsSummary.checkAmount)} (${reportData.collectionsSummary.checkCount} Adet)\n` +
      `• Havale / EFT: ${formatCurrency(reportData.collectionsSummary.transferAmount)} (${reportData.collectionsSummary.transferCount} Adet)\n` +
      `• *Toplam Saha Tahsilatı:* ${formatCurrency(reportData.collectionsSummary.totalAmount)}\n\n` +
      `🚗 *RUT & ZİYARET PERFORMANSI:*\n` +
      `• Planlanan Ziyaret: ${reportData.visitsSummary.totalPlanned} Cari\n` +
      `• Tamamlanan: ${reportData.visitsSummary.completed} Cari (%${reportData.visitsSummary.successRate})\n` +
      `• Sipariş Alınan: ${reportData.visitsSummary.withOrder} Cari\n` +
      `• Siparişsiz Kapanan: ${reportData.visitsSummary.withoutOrder} Cari\n\n` +
      `🔄 *SAHA İADE & DEĞİŞİM:*\n` +
      `• İade Fişi Sayısı: ${reportData.returnsSummary.count} Adet\n` +
      `• Toplam İade Tutarı: ${formatCurrency(reportData.returnsSummary.totalAmount)}\n` +
      `----------------------------------------\n` +
      `💰 *GÜN SONU FİİLİ NAKİT KASA:* ${formatCurrency(reportData.netCashBalance)}\n` +
      `_Rapor Saati: ${new Date().toLocaleTimeString('tr-TR')}_`;

    const encoded = encodeURIComponent(text);
    window.open(`https://wa.me/?text=${encoded}`, '_blank');
  };

  // Termal Fiş Basımı
  const handleThermalPrint = () => {
    openPrintSlip({
      type: 'end_of_day',
      endOfDayData: reportData,
    });
  };

  // A4 Yazdırma
  const handleA4Print = () => {
    window.print();
  };

  if (!isDailyReportModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[94vh]">
        {/* Üst Başlık Barı */}
        <div className="p-4 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-blue-600/30 border border-blue-500/40 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold tracking-tight">Gün Sonu Kapanış (Z Raporu)</h2>
                <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                  Plasiyer
                </span>
              </div>
              <span className="text-[11px] text-slate-400 block">
                {salesRep.name} ({salesRep.code}) • {formatDateDisplay(selectedDate)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Tarih Seçici */}
            <div className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-1 text-xs text-white">
              <Calendar className="w-3.5 h-3.5 text-blue-400" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent text-xs text-white focus:outline-none cursor-pointer"
              />
            </div>

            <button
              onClick={closeDailyReportModal}
              className="p-1.5 rounded-full hover:bg-slate-800 text-slate-300 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Gövde */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1 text-xs">
          {/* 4 Ana KPI Kartı */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {/* 1. Sipariş Cirosu */}
            <div className="p-3 rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60">
              <div className="flex items-center justify-between text-blue-600 dark:text-blue-400 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider">Sipariş Cirosu</span>
                <TrendingUp className="w-3.5 h-3.5" />
              </div>
              <div className="text-base font-black text-slate-900 dark:text-white leading-tight">
                {formatCurrency(reportData.ordersSummary.totalNet)}
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                {reportData.ordersSummary.count} Sipariş • {formatCurrency(reportData.ordersSummary.totalDiscount)} İsk.
              </div>
            </div>

            {/* 2. Toplam Tahsilat */}
            <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60">
              <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider">Saha Tahsilatı</span>
                <Banknote className="w-3.5 h-3.5" />
              </div>
              <div className="text-base font-black text-emerald-600 dark:text-emerald-400 leading-tight">
                {formatCurrency(reportData.collectionsSummary.totalAmount)}
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                Nakit: {formatCurrency(reportData.collectionsSummary.cashAmount)}
              </div>
            </div>

            {/* 3. Rut / Ziyaret Başarısı */}
            <div className="p-3 rounded-2xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900/60">
              <div className="flex items-center justify-between text-purple-600 dark:text-purple-400 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider">Ziyaret Oranı</span>
                <MapPin className="w-3.5 h-3.5" />
              </div>
              <div className="text-base font-black text-purple-600 dark:text-purple-400 leading-tight">
                %{reportData.visitsSummary.successRate}
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                {reportData.visitsSummary.completed} / {reportData.visitsSummary.totalPlanned} Ziyaret Edildi
              </div>
            </div>

            {/* 4. Saha İadeleri */}
            <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60">
              <div className="flex items-center justify-between text-rose-600 dark:text-rose-400 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider">Saha İadesi</span>
                <RotateCcw className="w-3.5 h-3.5" />
              </div>
              <div className="text-base font-black text-rose-600 dark:text-rose-400 leading-tight">
                {formatCurrency(reportData.returnsSummary.totalAmount)}
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                {reportData.returnsSummary.count} Fiş Kesildi
              </div>
            </div>
          </div>

          {/* Kasa Kırılımı ve Fiili Kasa Özeti */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                <Banknote className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                Gün Sonu Kasa & Tahsilat Dökümü
              </span>
              <span className="text-[11px] font-bold text-slate-500">
                Toplam: {formatCurrency(reportData.collectionsSummary.totalAmount)}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 block font-medium">Nakit Kasa</span>
                <span className="font-extrabold text-sm text-slate-900 dark:text-white block mt-0.5">
                  {formatCurrency(reportData.collectionsSummary.cashAmount)}
                </span>
                <span className="text-[9px] text-slate-400">{reportData.collectionsSummary.cashCount} Adet Makbuz</span>
              </div>

              <div className="p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 block font-medium">Kredi Kartı / POS</span>
                <span className="font-extrabold text-sm text-slate-900 dark:text-white block mt-0.5">
                  {formatCurrency(reportData.collectionsSummary.posAmount)}
                </span>
                <span className="text-[9px] text-slate-400">{reportData.collectionsSummary.posCount} Adet Slip</span>
              </div>

              <div className="p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 block font-medium">Müşteri Çeki</span>
                <span className="font-extrabold text-sm text-slate-900 dark:text-white block mt-0.5">
                  {formatCurrency(reportData.collectionsSummary.checkAmount)}
                </span>
                <span className="text-[9px] text-slate-400">{reportData.collectionsSummary.checkCount} Adet Çek</span>
              </div>

              <div className="p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 block font-medium">Havale / EFT</span>
                <span className="font-extrabold text-sm text-slate-900 dark:text-white block mt-0.5">
                  {formatCurrency(reportData.collectionsSummary.transferAmount)}
                </span>
                <span className="text-[9px] text-slate-400">{reportData.collectionsSummary.transferCount} Adet Dekont</span>
              </div>
            </div>
          </div>

          {/* Sekmeler: Siparişler, Tahsilatlar, Ziyaretler, İadeler */}
          <div>
            <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800 pb-1 overflow-x-auto text-xs">
              <button
                onClick={() => setActiveTab('summary')}
                className={`px-3 py-1.5 rounded-xl font-bold transition ${
                  activeTab === 'summary'
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                    : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                İcmal Özeti
              </button>
              <button
                onClick={() => setActiveTab('orders')}
                className={`px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1 ${
                  activeTab === 'orders'
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                    : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span>Siparişler</span>
                <span className="text-[10px] opacity-80">({dayOrders.length})</span>
              </button>
              <button
                onClick={() => setActiveTab('collections')}
                className={`px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1 ${
                  activeTab === 'collections'
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                    : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span>Tahsilatlar</span>
                <span className="text-[10px] opacity-80">({dayCollections.length})</span>
              </button>
              <button
                onClick={() => setActiveTab('visits')}
                className={`px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1 ${
                  activeTab === 'visits'
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                    : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span>Ziyaretler</span>
                <span className="text-[10px] opacity-80">({dayVisits.length})</span>
              </button>
              <button
                onClick={() => setActiveTab('returns')}
                className={`px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1 ${
                  activeTab === 'returns'
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                    : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span>İadeler</span>
                <span className="text-[10px] opacity-80">({dayReturns.length})</span>
              </button>
            </div>

            {/* Sekme İçerikleri */}
            <div className="pt-2.5">
              {activeTab === 'summary' && (
                <div className="space-y-2 text-xs">
                  <div className="p-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1.5">
                    <h3 className="font-extrabold text-slate-900 dark:text-white mb-2">Günlük Yönetici İcmali</h3>
                    <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                      <span className="text-slate-500">Alınan Sipariş Adedi:</span>
                      <strong className="text-slate-900 dark:text-white">{reportData.ordersSummary.count} Sipariş</strong>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                      <span className="text-slate-500">Net Sipariş Cirosu:</span>
                      <strong className="text-blue-600 dark:text-blue-400 font-mono">{formatCurrency(reportData.ordersSummary.totalNet)}</strong>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                      <span className="text-slate-500">Toplam Tahsilat Tutarı:</span>
                      <strong className="text-emerald-600 dark:text-emerald-400 font-mono">{formatCurrency(reportData.collectionsSummary.totalAmount)}</strong>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                      <span className="text-slate-500">Fiili Teslim Edilecek Nakit Kasa:</span>
                      <strong className="text-emerald-700 dark:text-emerald-300 font-mono text-sm">{formatCurrency(reportData.netCashBalance)}</strong>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-500">Rut Gerçekleşme Oranı:</span>
                      <strong className="text-purple-600 dark:text-purple-400">%{reportData.visitsSummary.successRate} ({reportData.visitsSummary.completed} / {reportData.visitsSummary.totalPlanned})</strong>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'orders' && (
                <div className="space-y-2">
                  {dayOrders.length === 0 ? (
                    <div className="p-6 text-center text-slate-400">Bugün alınan sipariş bulunmuyor.</div>
                  ) : (
                    dayOrders.map((o) => (
                      <div key={o.id || o.tempId} className="p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white">{o.customerName}</div>
                          <div className="text-[10px] font-mono text-slate-400">
                            {o.tempId} • {o.items?.length || 0} Kalem • {new Date(o.createdAt || o.orderDate).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-extrabold text-blue-600 dark:text-blue-400 font-mono">{formatCurrency(o.grandTotal)}</div>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${o.status === 'synced' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                            {o.status === 'synced' ? 'ERP Aktarıldı' : 'Bekliyor'}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === 'collections' && (
                <div className="space-y-2">
                  {dayCollections.length === 0 ? (
                    <div className="p-6 text-center text-slate-400">Bugün alınan tahsilat bulunmuyor.</div>
                  ) : (
                    dayCollections.map((c) => (
                      <div key={c.id || c.tempId} className="p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white">{c.customerName}</div>
                          <div className="text-[10px] font-mono text-slate-400">
                            {c.receiptNo} • {c.paymentMethod.toUpperCase()} • {new Date(c.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">{formatCurrency(c.amount)}</div>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${c.syncStatus === 'synced' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                            {c.syncStatus === 'synced' ? 'ERP Aktarıldı' : 'Bekliyor'}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === 'visits' && (
                <div className="space-y-2">
                  {dayVisits.length === 0 ? (
                    <div className="p-6 text-center text-slate-400">Bugün için planlanmış ziyaret bulunmuyor.</div>
                  ) : (
                    dayVisits.map((v) => (
                      <div key={v.id || v.customerId} className="p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white">{v.customerName}</div>
                          <div className="text-[10px] text-slate-400">
                            Durum: <strong className={v.status === 'completed' ? 'text-emerald-600' : 'text-slate-500'}>
                              {v.status === 'completed' ? 'Ziyaret Tamamlandı' : 'Bekliyor'}
                            </strong>
                            {v.noOrderReason && <span className="ml-1.5 italic text-amber-600">({v.noOrderReason})</span>}
                          </div>
                        </div>
                        <div className="text-right">
                          {v.orderCreated ? (
                            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Sipariş Alındı</span>
                          ) : v.status === 'completed' ? (
                            <span className="text-[10px] font-medium text-slate-500">Siparişsiz</span>
                          ) : (
                            <span className="text-[10px] text-slate-400">Bekliyor</span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === 'returns' && (
                <div className="space-y-2">
                  {dayReturns.length === 0 ? (
                    <div className="p-6 text-center text-slate-400">Bugün alınan iade bulunmuyor.</div>
                  ) : (
                    dayReturns.map((r) => (
                      <div key={r.id || r.tempId} className="p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white">{r.customerName}</div>
                          <div className="text-[10px] font-mono text-slate-400">
                            {r.receiptNo} • {r.items?.length || 0} Kalem
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-extrabold text-rose-600 dark:text-rose-400 font-mono">{formatCurrency(r.grandTotal)}</div>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${r.syncStatus === 'synced' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                            {r.syncStatus === 'synced' ? 'ERP Aktarıldı' : 'Bekliyor'}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Alt Aksiyon Butonları */}
        <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5">
            {/* WhatsApp ile Gönder */}
            <button
              onClick={handleWhatsAppShare}
              className="px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 flex items-center gap-1.5 shadow-sm transition active:scale-95"
              title="Merkeze WhatsApp ile Gönder"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>WhatsApp</span>
            </button>

            {/* Termal Fiş Yazdır */}
            <button
              onClick={handleThermalPrint}
              className="px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 flex items-center gap-1.5 shadow-sm transition active:scale-95"
              title="80mm / 58mm Termal Fiş Yazdır"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Termal Z Fişi</span>
            </button>

            {/* A4 Yazdır */}
            <button
              onClick={handleA4Print}
              className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750 flex items-center gap-1.5 shadow-sm transition active:scale-95"
              title="A4 Yazdır"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">A4 Yazdır</span>
            </button>
          </div>

          <button
            onClick={closeDailyReportModal}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
};
