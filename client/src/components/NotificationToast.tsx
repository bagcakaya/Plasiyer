import React from 'react';
import { useApp } from '../context/AppContext';
import { 
  Bell, 
  Banknote, 
  FileCheck, 
  X, 
  ArrowRight,
  Sparkles
} from 'lucide-react';

export const NotificationToast: React.FC = () => {
  const { 
    activeToastNotification, 
    dismissToastNotification, 
    setActiveTab, 
    markNotificationAsRead 
  } = useApp();

  if (!activeToastNotification) return null;

  const isOrder = activeToastNotification.type === 'new_order';
  const isCol = activeToastNotification.type === 'new_collection';
  const isInvoice = activeToastNotification.type === 'order_invoiced';

  const handleAction = () => {
    markNotificationAsRead(activeToastNotification.id);
    dismissToastNotification();
    setActiveTab('orders');
  };

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 w-11/12 max-w-md animate-bounceIn shadow-2xl">
      <div className={`p-4 rounded-2xl border backdrop-blur-md transition-all flex items-start gap-3 ${
        isOrder 
          ? 'bg-blue-900/95 text-white border-blue-500/40 shadow-blue-500/20'
          : isCol
          ? 'bg-emerald-900/95 text-white border-emerald-500/40 shadow-emerald-500/20'
          : 'bg-indigo-900/95 text-white border-indigo-500/40 shadow-indigo-500/20'
      }`}>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-inner ${
          isOrder 
            ? 'bg-blue-500/30 text-blue-300' 
            : isCol 
            ? 'bg-emerald-500/30 text-emerald-300' 
            : 'bg-indigo-500/30 text-indigo-300'
        }`}>
          {isOrder && <Bell className="w-5 h-5 animate-pulse" />}
          {isCol && <Banknote className="w-5 h-5 animate-pulse" />}
          {isInvoice && <FileCheck className="w-5 h-5 animate-pulse" />}
        </div>

        <div className="flex-1 min-w-0 pr-1">
          <div className="flex items-center gap-1.5">
            <h4 className="font-extrabold text-xs tracking-wide uppercase text-blue-200">
              {activeToastNotification.title}
            </h4>
            <Sparkles className="w-3 h-3 text-amber-300" />
          </div>
          <p className="text-xs font-medium text-slate-100 mt-0.5 line-clamp-2 leading-relaxed">
            {activeToastNotification.message}
          </p>

          <div className="mt-2.5 flex items-center gap-2">
            <button
              type="button"
              onClick={handleAction}
              className="px-3 py-1 rounded-lg bg-white text-slate-900 hover:bg-slate-100 font-bold text-[11px] flex items-center gap-1 transition-all active:scale-95 shadow-xs"
            >
              <span>Siparişe Git</span>
              <ArrowRight className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={dismissToastNotification}
              className="text-[11px] text-slate-300 hover:text-white font-medium px-2 py-1"
            >
              Kapat
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={dismissToastNotification}
          className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
