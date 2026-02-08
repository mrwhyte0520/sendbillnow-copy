import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { invoicesService, apInvoicesService, purchaseOrdersService } from '../../services/database';

interface InvoiceDueItem {
  id: string;
  number: string;
  customer?: string;
  supplier?: string;
  total: number;
  dueDate: string;
  type: 'receivable' | 'payable';
}

interface DayInvoices {
  receivables: InvoiceDueItem[];
  payables: InvoiceDueItem[];
}

const STORAGE_PREFIX = 'contabi_rbac_';

export default function DashboardPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [currentDate] = useState(new Date());
  const [allowedModules, setAllowedModules] = useState<Set<string> | null>(null);
  const [invoicesByDay, setInvoicesByDay] = useState<Record<string, DayInvoices>>({});
  const [selectedDayInvoices, setSelectedDayInvoices] = useState<{ day: number; data: DayInvoices } | null>(null);

  const normalizeModuleKey = (value: unknown) => {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/_/g, '-')
      .replace(/\s+/g, '-');
  };

  // Obtener módulos permitidos para el usuario
  useEffect(() => {
    const fetchAllowed = async () => {
      try {
        if (!user?.id) {
          // local fallback
          const perms = JSON.parse(localStorage.getItem(STORAGE_PREFIX + 'permissions') || '[]');
          const rolePerms = JSON.parse(localStorage.getItem(STORAGE_PREFIX + 'role_permissions') || '[]');
          const userRoles = JSON.parse(localStorage.getItem(STORAGE_PREFIX + 'user_roles') || '[]');
          const myRoleIds = userRoles.filter((ur: any) => ur.user_id === 'local').map((ur: any) => ur.role_id);
          const permIds = rolePerms.filter((rp: any) => myRoleIds.includes(rp.role_id)).map((rp: any) => rp.permission_id);
          const modules = new Set<string>();
          perms.forEach((p: any) => { if (p.action === 'access' && permIds.includes(p.id)) modules.add(p.module); });
          setAllowedModules(modules);
          return;
        }
        const { data: ur } = await supabase.from('user_roles').select('*').eq('user_id', user.id);
        const roleIds = (ur || []).map((r: any) => r.role_id);
        if (roleIds.length === 0) { setAllowedModules(new Set()); return; }
        const { data: rp } = await supabase.from('role_permissions').select('permission_id').in('role_id', roleIds);
        const permIds = (rp || []).map((r: any) => r.permission_id);
        if (permIds.length === 0) { setAllowedModules(new Set()); return; }
        const { data: perms } = await supabase.from('permissions').select('*').in('id', permIds).eq('action', 'access');
        setAllowedModules(new Set((perms || []).map((p: any) => p.module)));
      } catch {
        setAllowedModules(new Set());
      }
    };
    fetchAllowed();
  }, [user?.id]);

  // Load pending invoices (AR and AP) for calendar
  useEffect(() => {
    const loadInvoices = async () => {
      if (!user?.id) return;
      
      try {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const normalizeStatus = (value: any) => String(value || '').trim().toLowerCase();
        
        // Load AR invoices (accounts receivable - what customers owe us)
        const arInvoices = await invoicesService.getAll(user.id);
        const pendingAR: InvoiceDueItem[] = (arInvoices || [])
          .filter((inv: any) => {
            const status = normalizeStatus(inv.status);
            if (['paid', 'cancelled', 'voided', 'draft'].includes(status)) return false;
            const totalAmount = Number(inv.total_amount) || 0;
            const paidAmount = Number(inv.paid_amount) || 0;
            const balanceAmount =
              typeof inv.balance_amount === 'number'
                ? Number(inv.balance_amount)
                : Math.max(0, totalAmount - paidAmount);
            return balanceAmount > 0;
          })
          .map((inv: any) => ({
            id: inv.id,
            number: inv.invoice_number || inv.id,
            customer: inv.customers?.name || inv.customer_name || inv.customer || 'Unknown',
            total:
              typeof inv.balance_amount === 'number'
                ? Number(inv.balance_amount)
                : Math.max(0, (Number(inv.total_amount) || 0) - (Number(inv.paid_amount) || 0)),
            dueDate: inv.due_date || inv.dueDate || '',
            type: 'receivable' as const,
          }));

        // Load AP invoices (accounts payable - what we owe suppliers)
        const apInvoices = await apInvoicesService.getAll(user.id);
        const pendingAP: InvoiceDueItem[] = (apInvoices || [])
          .filter((inv: any) => {
            const status = normalizeStatus(inv.status);
            if (['paid', 'cancelled', 'voided'].includes(status)) return false;
            const balanceAmount =
              typeof inv.balance_amount === 'number'
                ? Number(inv.balance_amount)
                : Number(inv.total_to_pay) || Number(inv.total_amount) || 0;
            return balanceAmount > 0;
          })
          .map((inv: any) => ({
            id: inv.id,
            number: inv.invoice_number || inv.id,
            supplier: inv.suppliers?.name || inv.supplier_name || inv.supplier || 'Unknown',
            total:
              typeof inv.balance_amount === 'number'
                ? Number(inv.balance_amount)
                : Number(inv.total_to_pay) || Number(inv.total_amount) || 0,
            dueDate: inv.due_date || inv.dueDate || inv.delivery_date || '',
            type: 'payable' as const,
          }));

        // Load Purchase Orders as upcoming payables (when not yet invoiced)
        const purchaseOrders = await purchaseOrdersService.getAll(user.id);
        const pendingPO: InvoiceDueItem[] = (purchaseOrders || [])
          .filter((po: any) => {
            const status = normalizeStatus(po.status);
            if (['cancelled', 'received'].includes(status)) return false;
            const total = Number(po.total_amount) || 0;
            return total > 0;
          })
          .map((po: any) => ({
            id: String(po.id),
            number: po.po_number || po.id,
            supplier: po.suppliers?.name || po.supplier_name || 'Unknown',
            total: Number(po.total_amount) || 0,
            dueDate: po.expected_date || po.order_date || '',
            type: 'payable' as const,
          }));

        // Group by day (only for current month)
        const byDay: Record<string, DayInvoices> = {};
        
        [...pendingAR, ...pendingAP, ...pendingPO].forEach((inv) => {
          if (!inv.dueDate) return;
          const dueDate = new Date(inv.dueDate);
          if (Number.isNaN(dueDate.getTime())) return;
          if (dueDate.getFullYear() !== year || dueDate.getMonth() !== month) return;
          
          const dayKey = String(dueDate.getDate());
          if (!byDay[dayKey]) {
            byDay[dayKey] = { receivables: [], payables: [] };
          }
          
          if (inv.type === 'receivable') {
            byDay[dayKey].receivables.push(inv);
          } else {
            byDay[dayKey].payables.push(inv);
          }
        });
        
        setInvoicesByDay(byDay);
      } catch (error) {
        console.error('Error loading invoices for calendar:', error);
      }
    };
    
    loadInvoices();
  }, [user?.id, currentDate]);

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/auth/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  // Botones de acceso rápido con sus módulos correspondientes
  const allQuickAccessButtons = [
    { name: 'User', icon: 'ri-user-add-line', href: '/users', color: 'from-[#008000] to-[#008000]', module: 'users' },
    { name: 'New Customer', icon: 'ri-user-smile-line', href: '/accounts-receivable/customers', color: 'from-[#008000] to-[#008000]', module: 'customers' },
    { name: 'New Supplier', icon: 'ri-user-settings-line', href: '/accounts-payable/suppliers', color: 'from-[#008000] to-[#008000]', module: 'accounts-payable' },
    { name: 'New Invoice', icon: 'ri-file-text-line', href: '/billing/invoicing', color: 'from-[#008000] to-[#008000]', module: 'billing' },
    { name: 'Estimate', icon: 'ri-file-list-line', href: '/billing/quotes', color: 'from-[#008000] to-[#008000]', module: 'billing' },
    { name: 'Job Estimate', icon: 'ri-sticky-note-line', href: '/service-documents', color: 'from-[#008000] to-[#008000]', module: 'service-documents' },
    { name: 'POS', icon: 'ri-shopping-cart-line', href: '/pos?tab=pos', color: 'from-[#008000] to-[#008000]', module: 'pos' },
    { name: 'Cash Closing', icon: 'ri-money-dollar-box-line', href: '/billing/cash-closing', color: 'from-[#008000] to-[#008000]', module: 'billing' },
    { name: 'Cash & Finance', icon: 'ri-money-dollar-circle-line', href: '/cash-finance', color: 'from-[#008000] to-[#008000]', module: 'cash-finance' },
    { name: 'Sales', icon: 'ri-bar-chart-box-line', href: '/billing/sales-reports', color: 'from-[#008000] to-[#008000]', module: 'billing' },
    { name: 'Products', icon: 'ri-shopping-bag-line', href: '/inventory?tab=products', color: 'from-[#008000] to-[#008000]', module: 'products' },
    { name: 'Inventory', icon: 'ri-archive-line', href: '/inventory', color: 'from-[#008000] to-[#008000]', module: 'inventory' },
    { name: 'Inventory Reports', icon: 'ri-line-chart-line', href: '/inventory/reports', color: 'from-[#008000] to-[#008000]', module: 'inventory' },
    { name: 'Location', icon: 'ri-building-line', href: '/inventory?tab=warehouses', color: 'from-[#008000] to-[#008000]', module: 'inventory' },
    { name: 'Payroll', icon: 'ri-wallet-line', href: '/contador/nomina', color: 'from-[#008000] to-[#008000]', module: 'payroll' },
    { name: 'Settings', icon: 'ri-settings-3-line', href: '/settings', color: 'from-[#008000] to-[#008000]', module: 'settings' },
  ];

  // Filtrar botones según permisos del usuario
  // Si no hay permisos configurados (allowedModules vacío o null), mostrar todos
  const quickAccessButtons = useMemo(() => {
    if (allowedModules === null || allowedModules.size === 0) {
      return allQuickAccessButtons;
    }
    const normalizedAllowed = new Set(Array.from(allowedModules).map(normalizeModuleKey));
    const filtered = allQuickAccessButtons.filter((button) =>
      normalizedAllowed.has(normalizeModuleKey(button.module))
    );
    return filtered.length > 0 ? filtered : allQuickAccessButtons;
  }, [allowedModules]);

  // Generar días del calendario
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    return days;
  };

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-gradient-to-br from-[#008000] to-[#006600] rounded-2xl p-8 text-white shadow-[0_8px_30px_rgb(0,128,0,0.3)] relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-white/5 to-transparent"></div>
          <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full blur-2xl"></div>
          <div className="relative flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold mb-2 drop-shadow-lg">Dashboard</h1>
              <p className="text-white/80 text-lg">Quick access panel to main modules</p>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center px-5 py-3 bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl hover:-translate-y-0.5 whitespace-nowrap border border-white/20"
            >
              <i className="ri-logout-box-line mr-2 text-lg"></i>
              Sign Out
            </button>
          </div>
        </div>

        {/* Botones de Acceso Rápido */}
        <div className="bg-gradient-to-br from-white to-[#faf9f5] rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-[#e8e0d0] p-8">
          <h2 className="text-2xl font-bold text-[#2f3e1e] mb-6 drop-shadow-sm">Quick Access</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-8 gap-4">
            {quickAccessButtons.map((button) => (
              <button
                key={button.name}
                onClick={() => navigate(button.href)}
                className="group relative flex flex-col items-center justify-center p-5 bg-gradient-to-br from-white to-[#f8f6f0] rounded-2xl border-2 border-[#e0d8c8] hover:border-[#008000]/30 transition-all duration-300 hover:shadow-[0_12px_30px_rgb(0,128,0,0.15)] hover:-translate-y-1"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${button.color} opacity-0 group-hover:opacity-100 rounded-2xl transition-opacity duration-300`}></div>
                <div className="relative z-10">
                  <div className={`w-16 h-16 mb-3 rounded-2xl bg-gradient-to-br ${button.color} flex items-center justify-center text-white shadow-lg shadow-[#008000]/30 group-hover:shadow-xl group-hover:scale-110 transition-all duration-300`}>
                    <i className={`${button.icon} text-2xl`}></i>
                  </div>
                  <span className="text-sm font-semibold text-[#2f3e1e] group-hover:text-white text-center block transition-colors duration-300">
                    {button.name}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Calendario */}
        <div className="bg-gradient-to-br from-white to-[#faf9f5] rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-[#e8e0d0] p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-[#2f3e1e] drop-shadow-sm">
              Calendar - {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
            </h2>
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#008000] to-[#006600] flex items-center justify-center shadow-lg shadow-[#008000]/30">
              <i className="ri-calendar-line text-2xl text-white"></i>
            </div>
          </div>

          {/* Legend */}
          <div className="mb-4 flex items-center gap-6 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span>Receivables (to collect)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <span>Payables (to pay)</span>
            </div>
          </div>
          
          <div className="grid grid-cols-7 gap-2">
            {/* Encabezados de días */}
            {weekDays.map((day) => (
              <div key={day} className="text-center font-bold text-[#7a8c45] py-3 text-sm uppercase tracking-wide">
                {day}
              </div>
            ))}
            
            {/* Días del mes */}
            {getDaysInMonth(currentDate).map((day, index) => {
              const dayData = day ? invoicesByDay[String(day)] : null;
              const hasReceivables = dayData && dayData.receivables.length > 0;
              const hasPayables = dayData && dayData.payables.length > 0;
              const hasInvoices = hasReceivables || hasPayables;
              
              return (
                <div
                  key={index}
                  onClick={() => {
                    if (day && dayData) {
                      setSelectedDayInvoices({ day, data: dayData });
                    }
                  }}
                  className={`aspect-square flex flex-col items-center justify-center rounded-xl text-sm font-medium transition-all duration-300 relative ${
                    day === null
                      ? 'bg-transparent'
                      : day === currentDate.getDate()
                      ? 'bg-gradient-to-br from-[#008000] to-[#006600] text-white font-bold shadow-lg shadow-[#008000]/30 scale-110'
                      : hasInvoices
                      ? 'bg-gradient-to-br from-[#fff8e6] to-[#ffefcc] hover:from-[#ffe8b3] hover:to-[#ffd480] text-[#2f3e1e] cursor-pointer hover:shadow-md hover:-translate-y-0.5 border-2 border-[#f0c040]'
                      : 'bg-gradient-to-br from-[#f8f6f0] to-[#f0ece0] hover:from-[#e8e4d8] hover:to-[#e0dcd0] text-[#2f3e1e] hover:text-[#008000] cursor-pointer hover:shadow-md hover:-translate-y-0.5'
                  }`}
                >
                  <span>{day}</span>
                  {hasInvoices && (
                    <div className="flex gap-1 mt-0.5">
                      {hasReceivables && (
                        <div className="w-2 h-2 rounded-full bg-green-500" title="Receivables due"></div>
                      )}
                      {hasPayables && (
                        <div className="w-2 h-2 rounded-full bg-red-500" title="Payables due"></div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Invoice Details Modal */}
        {selectedDayInvoices && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-hidden">
              <div className="bg-gradient-to-r from-[#008000] to-[#006600] px-6 py-4 flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">
                  Invoices Due - {monthNames[currentDate.getMonth()]} {selectedDayInvoices.day}, {currentDate.getFullYear()}
                </h3>
                <button
                  onClick={() => setSelectedDayInvoices(null)}
                  className="text-white/80 hover:text-white text-2xl"
                >
                  <i className="ri-close-line"></i>
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto max-h-[60vh] space-y-4 bg-[#faf9f5]">
                {/* Receivables */}
                {selectedDayInvoices.data.receivables.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-green-700 mb-2 flex items-center gap-2">
                      <i className="ri-arrow-down-circle-line"></i>
                      To Collect (Receivables)
                    </h4>
                    <div className="space-y-2">
                      {selectedDayInvoices.data.receivables.map((inv) => (
                        <div
                          key={inv.id}
                          className="bg-[#eafff0] border border-[#86efac] rounded-lg p-3 flex justify-between items-center cursor-pointer hover:bg-[#d7ffe4]"
                          onClick={() => {
                            setSelectedDayInvoices(null);
                            navigate('/accounts-receivable/invoices');
                          }}
                        >
                          <div>
                            <div className="font-medium text-[#14532d]">{inv.number}</div>
                            <div className="text-sm text-[#166534]">{inv.customer}</div>
                          </div>
                          <div className="font-bold text-[#166534]">
                            ${inv.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Payables */}
                {selectedDayInvoices.data.payables.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-red-700 mb-2 flex items-center gap-2">
                      <i className="ri-arrow-up-circle-line"></i>
                      To Pay (Payables)
                    </h4>
                    <div className="space-y-2">
                      {selectedDayInvoices.data.payables.map((inv) => (
                        <div
                          key={inv.id}
                          className="bg-[#fff1f2] border border-[#fda4af] rounded-lg p-3 flex justify-between items-center cursor-pointer hover:bg-[#ffe4e6]"
                          onClick={() => {
                            setSelectedDayInvoices(null);
                            navigate('/accounts-payable/invoices');
                          }}
                        >
                          <div>
                            <div className="font-medium text-[#7f1d1d]">{inv.number}</div>
                            <div className="text-sm text-[#991b1b]">{inv.supplier}</div>
                          </div>
                          <div className="font-bold text-[#991b1b]">
                            ${inv.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedDayInvoices.data.receivables.length === 0 && selectedDayInvoices.data.payables.length === 0 && (
                  <div className="text-center text-gray-500 py-4">
                    No invoices due on this day
                  </div>
                )}
              </div>

              <div className="border-t border-gray-200 px-6 py-4 flex justify-end">
                <button
                  onClick={() => setSelectedDayInvoices(null)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
