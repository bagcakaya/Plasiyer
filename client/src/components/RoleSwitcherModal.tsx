import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useApp } from '../context/AppContext';
import type { Customer } from '../types';
import { 
  Users, 
  Store, 
  X, 
  Check, 
  Search, 
  ShieldCheck, 
  Sparkles,
  ArrowRight
} from 'lucide-react';

interface RoleSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RoleSwitcherModal: React.FC<RoleSwitcherModalProps> = ({ isOpen, onClose }) => {
  const { userRole, currentCustomerUser, switchUserRole } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState<'plasiyer' | 'customer'>(userRole);

  const customers = useLiveQuery(() => db.customers.toArray(), []);

  if (!isOpen) return null;

  const filteredCustomers = customers?.filter((c) =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.code.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const handleSelectCustomer = (customer: Customer) => {
    switchUserRole('customer', customer);
    onClose();
  };

  const handleSelectPlasiyer = () => {
    switchUserRole('plasiyer');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-t-2xl sm:rounded-2xl max-h-[85vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white">
        {/* Başlık */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm">Giriş & Rol Değiştirici</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Plasiyer veya B2B Bayi Görünümü</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Rol Seçim Tabları */}
        <div className="p-3 border-b border-slate-100 dark:border-slate-800">
          <div className="grid grid-cols-2 gap-2 bg-slate-100 dark:bg-slate-800/60 p-1 rounded-xl text-xs font-semibold">
            <button
              onClick={() => setSelectedRole('plasiyer')}
              className={`py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition ${
                selectedRole === 'plasiyer'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Plasiyer (Saha)</span>
            </button>

            <button
              onClick={() => setSelectedRole('customer')}
              className={`py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition ${
                selectedRole === 'customer'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Store className="w-3.5 h-3.5" />
              <span>B2B Müşteri (Bayi)</span>
            </button>
          </div>
        </div>

        {/* İçerik */}
        <div className="p-4 overflow-y-auto flex-1 space-y-3">
          {selectedRole === 'plasiyer' ? (
            <div className="space-y-3">
              <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 rounded-xl p-3.5 text-xs text-blue-900 dark:text-blue-200">
                <div className="flex items-center gap-2 font-bold mb-1">
                  <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>Saha Satış & Plasiyer Yetkileri</span>
                </div>
                <p className="text-[11px] text-blue-800 dark:text-blue-300">
                  Tüm carileri ve bakiyeleri görebilir, müşteri adına sipariş girebilir, tahsilat yapabilir ve mobil yazıcı çıktısı alabilirsiniz.
                </p>
              </div>

              <button
                onClick={handleSelectPlasiyer}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-md transition active:scale-95 flex items-center justify-center gap-2 text-xs"
              >
                <span>Plasiyer Olarak Devam Et</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Aşağıdaki carilerden birini seçerek müşterinin kendi telefonundan gördüğü <strong>"Size Özel Fiyat"</strong> vitrinini deneyimleyin:
              </p>

              {/* Müşteri Arama */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Müşteri adı veya kodu..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Müşteri Listesi */}
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {filteredCustomers.slice(0, 15).map((customer) => {
                  const isCurrent = currentCustomerUser?.id === customer.id;

                  return (
                    <div
                      key={customer.id}
                      onClick={() => handleSelectCustomer(customer)}
                      className={`p-2.5 rounded-xl border text-xs cursor-pointer transition flex items-center justify-between active:scale-[0.99] ${
                        isCurrent
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 ring-1 ring-emerald-500/30'
                          : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 hover:border-emerald-500'
                      }`}
                    >
                      <div className="truncate mr-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                            {customer.code}
                          </span>
                          <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 px-1 rounded font-bold">
                            L{customer.priceList}
                          </span>
                          {customer.specialDiscount > 0 && (
                            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">
                              %{customer.specialDiscount} İsk.
                            </span>
                          )}
                        </div>
                        <h4 className="font-bold text-slate-900 dark:text-white truncate mt-0.5">
                          {customer.name}
                        </h4>
                      </div>

                      <div className="shrink-0 flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                        {isCurrent ? (
                          <span className="flex items-center gap-1 bg-emerald-600 text-white px-2 py-0.5 rounded-full text-[10px]">
                            <Check className="w-3 h-3" /> Aktif
                          </span>
                        ) : (
                          <span>Giriş Yap →</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
