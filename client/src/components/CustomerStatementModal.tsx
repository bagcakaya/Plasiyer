import React, { useState, useEffect } from 'react';
import { 
  X, FileText, Printer, Share2, Search, RefreshCw, 
  ArrowUpRight, ArrowDownLeft, DollarSign, AlertCircle
} from 'lucide-react';
import type { Customer, CustomerStatement, ServerConfig } from '../types';
import { apiService } from '../services/apiService';

interface CustomerStatementModalProps {
  customer: Customer | null;
  serverConfig: ServerConfig;
  isOpen: boolean;
  onClose: () => void;
  onOpenCollection?: (customer: Customer) => void;
}

export const CustomerStatementModal: React.FC<CustomerStatementModalProps> = ({
  customer,
  serverConfig,
  isOpen,
  onClose,
  onOpenCollection,
}) => {
  const [statement, setStatement] = useState<CustomerStatement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Date filters
  const [datePreset, setDatePreset] = useState<'30days' | 'thisMonth' | '3months' | 'thisYear' | 'all'>('30days');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchFilter, setSearchFilter] = useState('');

  // Set default date range on open
  useEffect(() => {
    if (isOpen && customer) {
      applyPreset('30days');
    }
  }, [isOpen, customer]);

  const applyPreset = (preset: '30days' | 'thisMonth' | '3months' | 'thisYear' | 'all') => {
    setDatePreset(preset);
    const now = new Date();
    const endStr = now.toISOString().slice(0, 10);
    let startStr = '';

    if (preset === '30days') {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      startStr = d.toISOString().slice(0, 10);
    } else if (preset === 'thisMonth') {
      startStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    } else if (preset === '3months') {
      const d = new Date();
      d.setMonth(d.getMonth() - 3);
      startStr = d.toISOString().slice(0, 10);
    } else if (preset === 'thisYear') {
      startStr = `${now.getFullYear()}-01-01`;
    } else if (preset === 'all') {
      startStr = '';
    }

    setStartDate(startStr);
    setEndDate(endStr);
    loadStatement(startStr, endStr);
  };

  const loadStatement = async (start = startDate, end = endDate) => {
    if (!customer) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiService.fetchCustomerStatement(
        serverConfig, 
        customer.code || customer.id, 
        start || undefined, 
        end || undefined
      );
      setStatement(data);
    } catch (err: any) {
      setError(err.message || 'Cari ekstre yüklenirken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !customer) return null;

  // Filtered movements by text search
  const filteredMovements = (statement?.movements || []).filter((m) => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return (
      m.docNo.toLowerCase().includes(q) ||
      m.transactionType.toLowerCase().includes(q) ||
      m.description.toLowerCase().includes(q) ||
      m.date.includes(q)
    );
  });

  // Share via WhatsApp
  const handleShareWhatsApp = () => {
    if (!statement || !customer) return;
    const balance = statement.summary.closingBalance;
    const balanceText = balance > 0 
      ? `${balance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺ (Borçlu)`
      : balance < 0 
        ? `${Math.abs(balance).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺ (Alacaklı)`
        : '0.00 ₺ (Bakiye Sıfır)';

    let text = `📄 *CARİ HESAP EKSTRE ÖZETİ*\n`;
    text += `🏢 *Firma:* OSMANLI GIDA SAN. TİC. LTD. ŞTİ.\n`;
    text += `👤 *Müşteri:* ${customer.name}\n`;
    text += `🔢 *Cari Kodu:* ${customer.code}\n`;
    text += `📅 *Tarih Aralığı:* ${startDate || 'Başlangıç'} - ${endDate || 'Bugün'}\n`;
    text += `--------------------------------\n`;
    text += `🔴 *Toplam Borç (Satış/Devir):* ${statement.summary.totalDebit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺\n`;
    text += `🟢 *Toplam Alacak (Tahsilat):* ${statement.summary.totalCredit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺\n`;
    text += `⚖️ *GÜNCEL NET BAKİYE:* ${balanceText}\n`;
    text += `--------------------------------\n`;
    text += `*Son Hareketler:*\n`;

    const recent = statement.movements.slice(-5);
    recent.forEach((m) => {
      const tutar = m.debit > 0 ? `+${m.debit.toLocaleString('tr-TR')} ₺` : `-${m.credit.toLocaleString('tr-TR')} ₺`;
      text += `• ${m.date} | ${m.transactionType} | ${tutar}\n`;
    });

    text += `\nDetaylı hesap mutabakatı için lütfen iletişime geçiniz.`;

    const cleanPhone = customer.phone ? customer.phone.replace(/[^0-9]/g, '') : '';
    const phoneParam = cleanPhone.startsWith('90') ? cleanPhone : cleanPhone ? `90${cleanPhone}` : '';
    const url = `https://wa.me/${phoneParam}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const handlePrint = () => {
    window.print();
  };

  const netBalance = statement?.summary.closingBalance ?? customer.balance;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      {/* Print-specific style tag */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-statement, #printable-statement * {
            visibility: visible;
          }
          #printable-statement {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white !important;
            color: black !important;
            padding: 20px;
          }
          .no-print {
            display: none !important;
          }
        }
      `}} />

      <div 
        id="printable-statement"
        className="bg-white dark:bg-slate-900 w-full max-w-5xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[92vh] overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Cari Hesap Ekstresi
                </h2>
                <span className="text-xs px-2 py-0.5 rounded font-mono bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300">
                  {customer.code}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {customer.name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 no-print">
            <button
              onClick={() => loadStatement()}
              disabled={loading}
              title="Yenile"
              className="p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handlePrint}
              title="Yazdır / PDF Ekstre"
              className="p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition flex items-center gap-1.5 text-xs font-medium"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">Yazdır / PDF</span>
            </button>
            <button
              onClick={handleShareWhatsApp}
              title="WhatsApp ile Paylaş"
              className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition flex items-center gap-1.5 text-xs font-medium"
            >
              <Share2 className="w-4 h-4" />
              <span className="hidden sm:inline">WhatsApp</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Müşteri & Firma Bilgileri Bannerı */}
        <div className="px-6 py-3 bg-slate-100/60 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div>
            <span className="text-slate-400 block font-medium">FİRMA / UNVAN</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200 truncate block">
              {customer.name}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block font-medium">VERGİ DAİRESİ / NO</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {customer.taxOffice || 'Şahıs'} - {customer.taxNumber || 'Belirtilmemiş'}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block font-medium">İLETİŞİM / TELEFON</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {customer.phone || 'Telefon Kaydı Yok'}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block font-medium">ADRES</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200 truncate block">
              {customer.address || customer.city || 'Merkez'}
            </span>
          </div>
        </div>

        {/* Tarih Filtreleme ve Arama Çubuğu (no-print) */}
        <div className="px-6 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 no-print">
          {/* Preset Butonları */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs">
            <button
              onClick={() => applyPreset('30days')}
              className={`px-2.5 py-1 rounded-lg font-medium transition ${
                datePreset === '30days'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Son 30 Gün
            </button>
            <button
              onClick={() => applyPreset('thisMonth')}
              className={`px-2.5 py-1 rounded-lg font-medium transition ${
                datePreset === 'thisMonth'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Bu Ay
            </button>
            <button
              onClick={() => applyPreset('3months')}
              className={`px-2.5 py-1 rounded-lg font-medium transition ${
                datePreset === '3months'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Son 3 Ay
            </button>
            <button
              onClick={() => applyPreset('thisYear')}
              className={`px-2.5 py-1 rounded-lg font-medium transition ${
                datePreset === 'thisYear'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Bu Yıl
            </button>
            <button
              onClick={() => applyPreset('all')}
              className={`px-2.5 py-1 rounded-lg font-medium transition ${
                datePreset === 'all'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Tümü
            </button>
          </div>

          {/* Tarih Seçiciler & Arama */}
          <div className="flex items-center gap-2 flex-grow sm:flex-grow-0">
            <div className="relative flex-grow sm:w-48">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Evrak / Açıklama ara..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  loadStatement(e.target.value, endDate);
                }}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-slate-800 dark:text-slate-200 text-xs focus:outline-none"
              />
              <span className="text-slate-400">-</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  loadStatement(startDate, e.target.value);
                }}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-slate-800 dark:text-slate-200 text-xs focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* 3 KPI Kartı */}
        <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50/50 dark:bg-slate-800/20 border-b border-slate-200 dark:border-slate-800">
          <div className="bg-white dark:bg-slate-800 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Toplam Borç (Satış)</span>
              <h3 className="text-lg font-bold text-red-600 dark:text-red-400 mt-0.5">
                {(statement?.summary.totalDebit ?? 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
              </h3>
            </div>
            <div className="w-9 h-9 rounded-lg bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400 flex items-center justify-center">
              <ArrowUpRight className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Toplam Alacak (Tahsilat)</span>
              <h3 className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                {(statement?.summary.totalCredit ?? 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
              </h3>
            </div>
            <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 flex items-center justify-center">
              <ArrowDownLeft className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Net Bakiye Durumu</span>
              <h3 className={`text-lg font-bold mt-0.5 ${
                netBalance > 0
                  ? 'text-red-600 dark:text-red-400'
                  : netBalance < 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-600 dark:text-slate-400'
              }`}>
                {Math.abs(netBalance).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                <span className="text-xs font-normal ml-1">
                  {netBalance > 0 ? '(Borçlu)' : netBalance < 0 ? '(Alacaklı)' : '(Kapalı)'}
                </span>
              </h3>
            </div>
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
              netBalance > 0 
                ? 'bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400' 
                : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400'
            }`}>
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Hareket Tablosu */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {loading ? (
            <div className="py-20 text-center">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-600 dark:text-blue-400 mb-2" />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                ERP12 veritabanından cari ekstre hareketleri çekiliyor...
              </p>
            </div>
          ) : error ? (
            <div className="py-16 text-center text-red-500">
              <AlertCircle className="w-10 h-10 mx-auto mb-2 opacity-80" />
              <p className="font-semibold text-sm">{error}</p>
              <button
                onClick={() => loadStatement()}
                className="mt-3 px-4 py-1.5 text-xs bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300 rounded-lg hover:bg-red-200 transition"
              >
                Tekrar Dene
              </button>
            </div>
          ) : filteredMovements.length === 0 ? (
            <div className="py-20 text-center text-slate-400">
              <FileText className="w-12 h-12 mx-auto mb-2 opacity-40" />
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                Seçilen tarih aralığında hareket kaydı bulunamadı.
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Farklı bir tarih aralığı veya 'Tümü' seçeneğini deneyebilirsiniz.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="py-3 px-3">Tarih</th>
                    <th className="py-3 px-3">Evrak / Belge No</th>
                    <th className="py-3 px-3">İşlem Türü</th>
                    <th className="py-3 px-3">Açıklama</th>
                    <th className="py-3 px-3 text-right">Borç (₺)</th>
                    <th className="py-3 px-3 text-right">Alacak (₺)</th>
                    <th className="py-3 px-3 text-right">Bakiye (₺)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredMovements.map((m, idx) => (
                    <tr 
                      key={m.id || idx}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                        <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {m.date} {m.time ? <span className="text-[10px] text-slate-400">{m.time}</span> : ''}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
                          {m.docNo || '-'}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${
                            m.transactionType.toLowerCase().includes('fatura')
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                              : m.transactionType.toLowerCase().includes('tahsilat') || m.transactionType.toLowerCase().includes('pos') || m.transactionType.toLowerCase().includes('nakit')
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                                : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                          }`}>
                            {m.transactionType}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 max-w-xs truncate" title={m.description}>
                          {m.description || '-'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold text-red-600 dark:text-red-400">
                          {m.debit > 0 ? m.debit.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                          {m.credit > 0 ? m.credit.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-'}
                        </td>
                        <td className={`py-2.5 px-3 text-right font-mono font-bold ${
                          m.balance > 0 
                            ? 'text-red-600 dark:text-red-400' 
                            : m.balance < 0 
                              ? 'text-emerald-600 dark:text-emerald-400' 
                              : 'text-slate-500'
                        }`}>
                          {m.balance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Alt Çubuk (Aksiyon Butonları) */}
        <div className="px-6 py-3.5 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Toplam <span className="font-semibold text-slate-700 dark:text-slate-200">{filteredMovements.length}</span> hareket listeleniyor.
          </div>

          <div className="flex items-center gap-2 no-print">
            {onOpenCollection && (
              <button
                onClick={() => {
                  onClose();
                  onOpenCollection(customer);
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm transition flex items-center gap-1.5"
              >
                <DollarSign className="w-4 h-4" />
                <span>Tahsilat Al</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-semibold transition"
            >
              Kapat
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
