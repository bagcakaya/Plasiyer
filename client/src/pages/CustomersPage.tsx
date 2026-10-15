import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useApp } from '../context/AppContext';
import type { Customer } from '../types';
import { 
  Search, 
  Phone, 
  MapPin, 
  PlusCircle, 
  CheckCircle2, 
  AlertTriangle, 
  Building, 
  X,
  CreditCard,
  Percent,
  Store,
  Banknote,
  FileText,
  RotateCcw,
  Navigation
} from 'lucide-react';
import { CustomerStatementModal } from '../components/CustomerStatementModal';

export const CustomersPage: React.FC = () => {
  const { selectedCustomer, selectCustomer, setActiveTab, switchUserRole, openCollectionModal, openReturnModal, serverConfig } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'debtors' | 'creditors'>('all');
  const [inspectCustomer, setInspectCustomer] = useState<Customer | null>(null);
  const [statementCustomer, setStatementCustomer] = useState<Customer | null>(null);

  // IndexedDB'den canlı carileri çek
  const customers = useLiveQuery(() => db.customers.toArray(), []);

  if (!customers) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-4 border-blue-600 dark:border-blue-400 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Filtreleme mantığı
  const filteredCustomers = customers.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.district.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (filterType === 'debtors') return c.balance > 0;
    if (filterType === 'creditors') return c.balance < 0;
    return true;
  });

  // Toplam Bakiye İstatistiği
  const totalBalance = customers.reduce((sum, c) => sum + c.balance, 0);

  const handleStartOrder = (customer: Customer, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    selectCustomer(customer);
    setActiveTab('catalog');
  };

  const handleSwitchToB2BView = (customer: Customer, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    switchUserRole('customer', customer);
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 2,
    }).format(val);
  };

  return (
    <div className="p-3 pb-24 space-y-3 max-w-lg mx-auto text-slate-900 dark:text-slate-100 w-full max-w-full overflow-x-hidden">
      {/* Üst Bakiye Özeti Kartı */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 dark:from-slate-950 dark:to-slate-900 text-white rounded-2xl p-4 shadow-sm border border-slate-700/80 dark:border-slate-800">
        <div className="flex justify-between items-center text-xs text-slate-400 mb-1">
          <span>Toplam Cari Sayısı: <strong className="text-white">{customers.length}</strong></span>
          <span>Plasiyer Rotası</span>
        </div>
        <div className="flex justify-between items-end">
          <div>
            <div className="text-[11px] text-slate-400">Toplam Portföy Bakiyesi</div>
            <div className={`text-xl font-bold tracking-tight ${totalBalance > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {formatCurrency(totalBalance)}
            </div>
          </div>
          <div className="text-right text-xs">
            <span className="text-slate-400 text-[11px]">Durum: </span>
            <span className="text-amber-400 font-semibold">
              {customers.filter((c) => c.balance > 0).length} Borçlu
            </span>
          </div>
        </div>
      </div>

      {/* Arama ve Filtreleme */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Cari adı, kodu, ilçe ara..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-sm placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs transition"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs bg-slate-100 dark:bg-slate-800 rounded-full p-1"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Filtre Butonları */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap transition ${
              filterType === 'all'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'
            }`}
          >
            Tümü ({customers.length})
          </button>
          <button
            onClick={() => setFilterType('debtors')}
            className={`px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap transition ${
              filterType === 'debtors'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'
            }`}
          >
            Borçlular ({customers.filter((c) => c.balance > 0).length})
          </button>
          <button
            onClick={() => setFilterType('creditors')}
            className={`px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap transition ${
              filterType === 'creditors'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'
            }`}
          >
            Alacaklılar ({customers.filter((c) => c.balance < 0).length})
          </button>
        </div>
      </div>

      {/* Cari Listesi */}
      <div className="space-y-2.5">
        {filteredCustomers.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 text-center border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
            <Building className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
            <p className="text-sm font-semibold">Aramanıza uygun cari bulunamadı.</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Lütfen arama terimini veya filtreyi değiştirin.</p>
          </div>
        ) : (
          filteredCustomers.map((customer) => {
            const isSelected = selectedCustomer?.id === customer.id;
            const isRiskExceeded = customer.riskLimit > 0 && customer.balance > customer.riskLimit;

            return (
              <div
                key={customer.id}
                onClick={() => setInspectCustomer(customer)}
                className={`bg-white dark:bg-slate-900 rounded-2xl p-3.5 border transition cursor-pointer active:scale-[0.99] shadow-xs ${
                  isSelected
                    ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/20 dark:bg-blue-950/20'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-mono font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                        {customer.code}
                      </span>
                      {isSelected && (
                        <span className="flex items-center gap-0.5 text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-950/70 px-1.5 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3 h-3" /> Aktif Cari
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white mt-1 truncate">
                      {customer.name}
                    </h3>
                    <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      <MapPin className="w-3 h-3 shrink-0 text-slate-400" />
                      <span className="truncate">{customer.district}, {customer.city}</span>
                    </div>
                  </div>

                  {/* Bakiye Rozeti */}
                  <div className="text-right shrink-0">
                    <div className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500">Güncel Bakiye</div>
                    <div
                      className={`text-sm font-extrabold ${
                        customer.balance > 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : customer.balance < 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {formatCurrency(customer.balance)}
                    </div>
                    <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                      {customer.balance > 0 ? '(Borçlu)' : customer.balance < 0 ? '(Alacaklı)' : '(Bakiyesiz)'}
                    </div>
                  </div>
                </div>

                {/* Risk Limiti Uyarısı */}
                {isRiskExceeded && (
                  <div className="mt-2 text-[11px] bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 rounded-xl px-2.5 py-1 flex items-center gap-1.5 font-medium">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>Risk limiti aşıldı! (Limit: {formatCurrency(customer.riskLimit)})</span>
                  </div>
                )}

                {/* Alt Aksiyon Butonları (Yatay Taşmayı Önleyen Şerit) */}
                <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                  {/* Sipariş Butonu (Öncelikli Aksiyon) */}
                  <button
                    onClick={(e) => handleStartOrder(customer, e)}
                    className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5 rounded-xl shadow-xs active:scale-95 transition text-xs shrink-0"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>Sipariş</span>
                  </button>

                  {/* Tahsilat Yap Butonu */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openCollectionModal(customer);
                    }}
                    className="flex items-center gap-1 bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 font-semibold px-2.5 py-1.5 rounded-xl transition active:scale-95 text-[11px] shrink-0"
                    title="Bu Cariden Tahsilat Yap"
                  >
                    <Banknote className="w-3.5 h-3.5" />
                    <span>Tahsilat</span>
                  </button>

                  {/* Ekstre Butonu */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setStatementCustomer(customer);
                    }}
                    className="flex items-center gap-1 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60 font-semibold px-2.5 py-1.5 rounded-xl transition active:scale-95 text-[11px] shrink-0"
                    title="Cari Hesap Ekstresi (Hareketler & Bakiye)"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Ekstre</span>
                  </button>

                  {/* İade Al Butonu */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openReturnModal(customer);
                    }}
                    className="flex items-center gap-1 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60 font-semibold px-2.5 py-1.5 rounded-xl transition active:scale-95 text-[11px] shrink-0"
                    title="Bu Cariden İade / Değişim Al"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>İade</span>
                  </button>

                  {customer.phone && (
                    <a
                      href={`tel:${customer.phone}`}
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-[11px] font-semibold shrink-0"
                      title="Telefonla Ara"
                    >
                      <Phone className="w-3 h-3 text-slate-500" />
                      <span>Ara</span>
                    </a>
                  )}

                  {/* B2B Girişi Olarak Aç Butonu */}
                  <button
                    onClick={(e) => handleSwitchToB2BView(customer, e)}
                    className="flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 font-semibold px-2.5 py-1.5 rounded-xl transition active:scale-95 text-[11px] shrink-0"
                    title="Müşterinin Gördüğü B2B Portalı Görünümüne Geç"
                  >
                    <Store className="w-3 h-3" />
                    <span>B2B</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Cari Detay Modalı */}
      {inspectCustomer && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-end justify-center sm:items-center p-0 sm:p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[85vh] overflow-y-auto p-4 space-y-4 shadow-2xl border border-slate-200 dark:border-slate-800">
            {/* Modal Başlık */}
            <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <span className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                  {inspectCustomer.code}
                </span>
                <h2 className="text-base font-bold text-slate-900 dark:text-white mt-1">
                  {inspectCustomer.name}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3 text-slate-400" />
                  {inspectCustomer.address || `${inspectCustomer.district}, ${inspectCustomer.city}`}
                </p>
              </div>
              <button
                onClick={() => setInspectCustomer(null)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Finansal Özet Kartları */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400 text-[11px] block">Net Cari Bakiye</span>
                <span
                  className={`text-base font-bold ${
                    inspectCustomer.balance > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {formatCurrency(inspectCustomer.balance)}
                </span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 block mt-0.5">
                  {inspectCustomer.balance > 0 ? 'Müşteri Borçlu' : 'Müşteri Alacaklı'}
                </span>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400 text-[11px] block">Risk Limiti</span>
                <span className="text-base font-bold text-slate-900 dark:text-white">
                  {formatCurrency(inspectCustomer.riskLimit)}
                </span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 block mt-0.5">
                  Kalan: {formatCurrency(Math.max(0, inspectCustomer.riskLimit - inspectCustomer.balance))}
                </span>
              </div>
            </div>

            {/* Fiyat Listesi & İskonto Bilgisi */}
            <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 rounded-2xl p-3 text-xs flex justify-between items-center">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <div>
                  <div className="font-semibold text-blue-900 dark:text-blue-200">Fiyat Listesi {inspectCustomer.priceList}</div>
                  <div className="text-[11px] text-blue-700 dark:text-blue-300">ERP12 Fiyat Grubu Tanımı</div>
                </div>
              </div>
              <div className="flex items-center gap-1 bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-300 px-2 py-1 rounded-lg font-bold">
                <Percent className="w-3.5 h-3.5" />
                <span>%{inspectCustomer.specialDiscount} İskonto</span>
              </div>
            </div>

            {/* GPS Konum ve Navigasyon Bilgisi */}
            <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 text-xs space-y-2">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-slate-800 dark:text-slate-200">
                      {inspectCustomer.district}, {inspectCustomer.city}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {inspectCustomer.address || 'Adres detayı belirtilmemiş'}
                    </div>
                    {inspectCustomer.latitude && inspectCustomer.longitude && (
                      <div className="text-[10px] font-mono text-slate-400 mt-1">
                        GPS: {inspectCustomer.latitude.toFixed(4)}, {inspectCustomer.longitude.toFixed(4)} • Tolerans: {inspectCustomer.geofenceRadiusMeters || 150}m
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-1 border-t border-slate-200 dark:border-slate-700/60">
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${inspectCustomer.latitude || 40.9876},${inspectCustomer.longitude || 29.0260}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold py-1.5 px-2.5 rounded-xl flex items-center justify-center gap-1.5 transition text-[11px]"
                >
                  <Navigation className="w-3.5 h-3.5 text-blue-500" />
                  <span>Google Haritalar</span>
                </a>

                <button
                  onClick={() => {
                    const cust = inspectCustomer;
                    setInspectCustomer(null);
                    selectCustomer(cust);
                    setActiveTab('routes');
                  }}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-1.5 px-2.5 rounded-xl flex items-center justify-center gap-1.5 transition text-[11px]"
                >
                  <MapPin className="w-3.5 h-3.5" />
                  <span>Rut Haritasında Gör</span>
                </button>
              </div>
            </div>

            {/* İletişim & Vergi Bilgileri */}
            <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 bg-white dark:bg-slate-900">
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-400">Telefon:</span>
                <a href={`tel:${inspectCustomer.phone}`} className="font-semibold text-blue-600 dark:text-blue-400">
                  {inspectCustomer.phone || '-'}
                </a>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-400">Vergi Dairesi:</span>
                <span className="font-medium text-slate-800 dark:text-slate-200">{inspectCustomer.taxOffice || '-'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-400">Vergi / T.C. No:</span>
                <span className="font-mono font-medium text-slate-800 dark:text-slate-200">{inspectCustomer.taxNumber || '-'}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Plasiyer:</span>
                <span className="font-medium text-slate-800 dark:text-slate-200">{inspectCustomer.salesRepCode}</span>
              </div>
            </div>

            {/* Butonlar */}
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                onClick={() => {
                  const cust = inspectCustomer;
                  setInspectCustomer(null);
                  setStatementCustomer(cust);
                }}
                className="flex-1 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-semibold py-2.5 rounded-xl shadow-xs flex items-center justify-center gap-1.5 transition active:scale-95 text-xs"
              >
                <FileText className="w-4 h-4" />
                <span>Cari Ekstre</span>
              </button>

              <button
                onClick={() => {
                  const cust = inspectCustomer;
                  setInspectCustomer(null);
                  openCollectionModal(cust);
                }}
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-semibold py-2.5 rounded-xl shadow-xs flex items-center justify-center gap-1.5 transition active:scale-95 text-xs"
              >
                <Banknote className="w-4 h-4" />
                <span>Tahsilat Al</span>
              </button>

              <button
                onClick={() => {
                  const cust = inspectCustomer;
                  setInspectCustomer(null);
                  openReturnModal(cust);
                }}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-semibold py-2.5 rounded-xl shadow-xs flex items-center justify-center gap-1.5 transition active:scale-95 text-xs"
              >
                <RotateCcw className="w-4 h-4" />
                <span>İade Al</span>
              </button>

              <button
                onClick={() => {
                  setInspectCustomer(null);
                  switchUserRole('customer', inspectCustomer);
                }}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-xl shadow-xs flex items-center justify-center gap-1.5 transition active:scale-95 text-xs"
              >
                <Store className="w-4 h-4" />
                <span>B2B Girişi</span>
              </button>

              <button
                onClick={() => {
                  setInspectCustomer(null);
                  handleStartOrder(inspectCustomer);
                }}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl shadow-xs flex items-center justify-center gap-1.5 transition active:scale-95 text-xs"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Sipariş</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Canlı Cari Hesap Ekstresi Modalı */}
      {statementCustomer && (
        <CustomerStatementModal
          customer={statementCustomer}
          serverConfig={serverConfig}
          isOpen={!!statementCustomer}
          onClose={() => setStatementCustomer(null)}
          onOpenCollection={(cust) => openCollectionModal(cust)}
        />
      )}
    </div>
  );
};
