import React from 'react';
import { useApp } from '../context/AppContext';
import { Users, Package, ShoppingCart, Clock, Settings, Store, UserCheck, Navigation, Truck } from 'lucide-react';

export const BottomNav: React.FC = () => {
  const { activeTab, setActiveTab, cartSummary, pendingOrdersCount, userRole, saleMode } = useApp();

  // Plasiyer için menü öğeleri
  const plasiyerNavItems = [
    {
      id: 'routes' as const,
      label: 'Rut',
      icon: Navigation,
    },
    {
      id: 'customers' as const,
      label: 'Cariler',
      icon: Users,
    },
    {
      id: 'catalog' as const,
      label: 'Ürünler',
      icon: Package,
    },
    {
      id: 'van_stock' as const,
      label: 'Araç',
      icon: Truck,
      badge: saleMode === 'hot' ? '🔥' : undefined,
      badgeColor: 'bg-amber-600',
    },
    {
      id: 'cart' as const,
      label: 'Sepet',
      icon: ShoppingCart,
      badge: cartSummary.totalItems > 0 ? cartSummary.totalItems : undefined,
      badgeColor: 'bg-blue-600',
    },
    {
      id: 'orders' as const,
      label: 'Sipariş',
      icon: Clock,
      badge: pendingOrdersCount > 0 ? pendingOrdersCount : undefined,
      badgeColor: 'bg-rose-600',
    },
    {
      id: 'settings' as const,
      label: 'Ayarlar',
      icon: Settings,
    },
  ];

  // B2B Müşteri (Bayi) için menü öğeleri
  const customerNavItems = [
    {
      id: 'catalog' as const,
      label: 'Vitrin',
      icon: Store,
    },
    {
      id: 'cart' as const,
      label: 'Sepetim',
      icon: ShoppingCart,
      badge: cartSummary.totalItems > 0 ? cartSummary.totalItems : undefined,
      badgeColor: 'bg-emerald-600',
    },
    {
      id: 'orders' as const,
      label: 'Siparişlerim',
      icon: Clock,
    },
    {
      id: 'settings' as const,
      label: 'Hesabım',
      icon: UserCheck,
    },
  ];

  const currentNavItems = userRole === 'customer' ? customerNavItems : plasiyerNavItems;
  const gridColsClass = userRole === 'customer' ? 'grid-cols-4' : 'grid-cols-7';

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shadow-lg safe-bottom transition-colors">
      <div className={`grid ${gridColsClass} h-16 max-w-lg mx-auto`}>
        {currentNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          const activeColor = userRole === 'customer' ? 'text-emerald-600 dark:text-emerald-400' : 'text-blue-600 dark:text-blue-400';
          const activeBarColor = userRole === 'customer' ? 'bg-emerald-600 dark:bg-emerald-400' : 'bg-blue-600 dark:bg-blue-400';

          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center relative transition-colors ${
                isActive
                  ? `${activeColor} font-semibold`
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110' : ''}`} />
                {item.badge !== undefined && (
                  <span
                    className={`absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white rounded-full flex items-center justify-center ${item.badgeColor} shadow-sm`}
                  >
                    {item.badge}
                  </span>
                )}
              </div>
              <span className="text-[11px] mt-1 tracking-tight">{item.label}</span>
              {isActive && (
                <span className={`absolute bottom-0 w-8 h-1 ${activeBarColor} rounded-t-full`} />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
