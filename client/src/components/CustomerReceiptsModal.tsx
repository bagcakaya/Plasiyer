import React, { useState } from 'react';
import { 
  X, 
  Receipt, 
  Printer, 
  Search, 
  Calendar, 
  Plus
} from 'lucide-react';
import type { Customer } from '../types';
import { useApp } from '../context/AppContext';

interface CustomerReceiptsModalProps {
  customer: Customer | null;
  isOpen: boolean;
  onClose: () => void;
  onStartOrder?: (customer: Customer) => void;
}

export const CustomerReceiptsModal: React.FC<CustomerReceiptsModalProps> = ({
  customer,
  isOpen,
  onClose,
  onStartOrder,
}) => {
  const { openPrintSlip, companyIssuer, salesRep } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedReceiptId, setSelectedReceiptId] = useState<string | null>(null);

  if (!isOpen || !customer) return null;

  // Carinin örnek / gerçek kayıtlı satış fişleri
  const mockReceipts = [
    {
      id: 'REC-001',
      receiptNo: 'FS-2026-004812',
      date: '28.10.2026 15:42',
      paymentType: 'Nakit Ödendi',
      totalAmount: 1450.00,
      vatAmount: 145.00,
      grandTotal: 1595.00,
      items: [
        { name: 'Çaykur Rize Turist Çay 1000 Gr', quantity: 6, unitPrice: 165.00, total: 990.00 },
        { name: 'Yudum Ayçiçek Yağı 5 Lt', quantity: 2, unitPrice: 230.00, total: 460.00 },
      ],
    },
    {
      id: 'REC-002',
      receiptNo: 'FS-2026-004720',
      date: '21.10.2026 11:20',
      paymentType: 'Kredi Kartı',
      totalAmount: 3200.00,
      vatAmount: 320.00,
      grandTotal: 3520.00,
      items: [
        { name: 'Sütaş Tam Yağlı Beyaz Peynir 1 Kg', quantity: 10, unitPrice: 195.00, total: 1950.00 },
        { name: 'Duru Pilavlık Pirinç 2.5 Kg', quantity: 15, unitPrice: 83.33, total: 1250.00 },
      ],
    },
    {
      id: 'REC-003',
      receiptNo: 'FS-2026-004655',
      date: '14.10.2026 16:05',
      paymentType: 'Cari Hesaba Açık',
      totalAmount: 2100.00,
      vatAmount: 210.00,
      grandTotal: 2310.00,
      items: [
        { name: 'Ariel Dağ Esintisi Toz Deterjan 5 Kg', quantity: 5, unitPrice: 240.00, total: 1200.00 },
        { name: 'Balküpü Toz Şeker 5 Kg', quantity: 6, unitPrice: 150.00, total: 900.00 },
      ],
    },
  ];

  const filteredReceipts = mockReceipts.filter(
    (r) =>
      r.receiptNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.items.some((i) => i.name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 2,
    }).format(val);
  };

  const handlePrint = (rec: typeof mockReceipts[0]) => {
    openPrintSlip({
      type: 'order',
      orderData: {
        id: 9999,
        tempId: rec.receiptNo,
        erp12DocNo: rec.receiptNo,
        customerId: customer.id,
        customerCode: customer.code,
        customerName: customer.name,
        orderDate: new Date().toISOString(),
        subtotal: rec.totalAmount,
        totalDiscount: 0,
        totalVat: rec.vatAmount,
        grandTotal: rec.grandTotal,
        createdAt: rec.date,
        items: rec.items.map((i, idx) => {
          const totalAmount = i.unitPrice * i.quantity;
          const vatAmount = totalAmount * 0.1;
          const grandTotal = totalAmount + vatAmount;
          return {
            productId: `P-${idx}`,
            productCode: `STK-${idx}`,
            productName: i.name,
            unit: 'Adet',
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            discountPercent: 0,
            vatRate: 10,
            netPrice: i.unitPrice,
            totalAmount,
            vatAmount,
            grandTotal,
          };
        }),
        notes: `Ödeme Şekli: ${rec.paymentType}`,
        status: 'synced',
        salesRepCode: customer.salesRepCode && customer.salesRepCode !== '0' ? customer.salesRepCode : salesRep.code,
      },
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in">
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[85vh] text-slate-900 dark:text-slate-100">
        {/* Üst Başlık Barı */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shadow-xs">
              <Receipt className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="font-extrabold text-sm sm:text-base truncate">Cari Satış Fişleri</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300">
                  {filteredReceipts.length} Fiş
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[260px] sm:max-w-sm">
                {customer.code} &bull; {customer.name}
              </p>
              <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 truncate max-w-[260px] sm:max-w-sm">
                Düzenleyen: {companyIssuer.brandName || companyIssuer.legalName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Arama Barı */}
        <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Fiş no veya satılan ürün adı ile ara..."
              className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-2xl pl-10 pr-3.5 py-2 text-xs font-semibold text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-amber-500"
            />
          </div>
        </div>

        {/* Fiş Listesi */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filteredReceipts.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-xs">
              Kayıtlı fiş bulunamadı.
            </div>
          ) : (
            filteredReceipts.map((rec) => {
              const isExpanded = selectedReceiptId === rec.id;
              return (
                <div
                  key={rec.id}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 shadow-xs overflow-hidden transition-all"
                >
                  <div
                    onClick={() => setSelectedReceiptId(isExpanded ? null : rec.id)}
                    className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-xs text-blue-600 dark:text-blue-400">
                          {rec.receiptNo}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {rec.paymentType}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        <span>{rec.date}</span>
                        <span>&bull;</span>
                        <span>{rec.items.length} Kalem</span>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-black text-sm text-slate-900 dark:text-white">
                        {formatCurrency(rec.grandTotal)}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePrint(rec);
                        }}
                        className="mt-1 text-[11px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1 hover:underline ml-auto"
                        title="Fişi Termal Yazıcıdan Çıkart"
                      >
                        <Printer className="w-3 h-3" />
                        <span>Yazdır</span>
                      </button>
                    </div>
                  </div>

                  {/* Kalem Detayları (Açılır Kapanır) */}
                  {isExpanded && (
                    <div className="p-3 bg-slate-50 dark:bg-slate-950/60 border-t border-slate-100 dark:border-slate-800 text-xs space-y-2 animate-in fade-in">
                      <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        Fiş Satırları & Kalemler
                      </div>
                      <div className="divide-y divide-slate-200 dark:divide-slate-800">
                        {rec.items.map((item, i) => (
                          <div key={i} className="py-1.5 flex justify-between items-center text-xs">
                            <div>
                              <span className="font-semibold text-slate-800 dark:text-slate-200">{item.name}</span>
                              <span className="text-[10px] text-slate-400 block">
                                {item.quantity} Adet &times; {formatCurrency(item.unitPrice)}
                              </span>
                            </div>
                            <span className="font-bold text-slate-900 dark:text-white">
                              {formatCurrency(item.total)}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="pt-2 flex justify-between border-t border-slate-200 dark:border-slate-700 text-xs font-bold">
                        <span className="text-slate-500">KDV Dahil Toplam</span>
                        <span className="text-amber-600 dark:text-amber-400 font-black">{formatCurrency(rec.grandTotal)}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Alt Hızlı Aksiyon */}
        <div className="p-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/80 flex items-center justify-between gap-2">
          <button
            onClick={() => {
              onClose();
              if (onStartOrder) onStartOrder(customer);
            }}
            className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-bold py-2.5 px-4 rounded-2xl text-xs flex items-center justify-center gap-1.5 transition active:scale-95 shadow-md shadow-amber-600/20"
          >
            <Plus className="w-4 h-4" />
            <span>Bu Cariye Yeni Satış Fişi Düzenle</span>
          </button>
        </div>
      </div>
    </div>
  );
};
