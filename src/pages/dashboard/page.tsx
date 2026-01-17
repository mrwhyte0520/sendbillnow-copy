import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';

const STORAGE_PREFIX = 'contabi_rbac_';

export default function DashboardPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [currentDate] = useState(new Date());
  const [allowedModules, setAllowedModules] = useState<Set<string> | null>(null);

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
    { name: 'POS', icon: 'ri-shopping-cart-line', href: '/pos', color: 'from-[#008000] to-[#008000]', module: 'pos' },
    { name: 'Cash Closing', icon: 'ri-money-dollar-box-line', href: '/billing/cash-closing', color: 'from-[#008000] to-[#008000]', module: 'billing' },
    { name: 'Sales', icon: 'ri-bar-chart-box-line', href: '/billing/sales-reports', color: 'from-[#008000] to-[#008000]', module: 'billing' },
    { name: 'Products', icon: 'ri-shopping-bag-line', href: '/inventory?tab=products', color: 'from-[#008000] to-[#008000]', module: 'products' },
    { name: 'Inventory', icon: 'ri-archive-line', href: '/inventory', color: 'from-[#008000] to-[#008000]', module: 'inventory' },
    { name: 'Inventory Reports', icon: 'ri-line-chart-line', href: '/inventory/reports', color: 'from-[#008000] to-[#008000]', module: 'inventory' },
    { name: 'Location', icon: 'ri-building-line', href: '/billing/stores', color: 'from-[#008000] to-[#008000]', module: 'billing' },
    { name: 'Payroll', icon: 'ri-wallet-line', href: '/contador/nomina', color: 'from-[#008000] to-[#008000]', module: 'payroll' },
  ];

  // Filtrar botones según permisos del usuario
  // Si no hay permisos configurados (allowedModules vacío o null), mostrar todos
  const quickAccessButtons = useMemo(() => {
    if (allowedModules === null || allowedModules.size === 0) {
      return allQuickAccessButtons;
    }
    return allQuickAccessButtons.filter(button => allowedModules.has(button.module));
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
          
          <div className="grid grid-cols-7 gap-2">
            {/* Encabezados de días */}
            {weekDays.map((day) => (
              <div key={day} className="text-center font-bold text-[#7a8c45] py-3 text-sm uppercase tracking-wide">
                {day}
              </div>
            ))}
            
            {/* Días del mes */}
            {getDaysInMonth(currentDate).map((day, index) => (
              <div
                key={index}
                className={`aspect-square flex items-center justify-center rounded-xl text-sm font-medium transition-all duration-300 ${
                  day === null
                    ? 'bg-transparent'
                    : day === currentDate.getDate()
                    ? 'bg-gradient-to-br from-[#008000] to-[#006600] text-white font-bold shadow-lg shadow-[#008000]/30 scale-110'
                    : 'bg-gradient-to-br from-[#f8f6f0] to-[#f0ece0] hover:from-[#e8e4d8] hover:to-[#e0dcd0] text-[#2f3e1e] hover:text-[#008000] cursor-pointer hover:shadow-md hover:-translate-y-0.5'
                }`}
              >
                {day}
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
