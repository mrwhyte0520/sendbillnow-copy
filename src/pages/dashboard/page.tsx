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
    { name: 'User', icon: 'ri-user-add-line', href: '/users', color: 'from-[#2f3e1e] to-[#4b5c2b]', module: 'users' },
    { name: 'New Customer', icon: 'ri-user-smile-line', href: '/customers', color: 'from-[#3a4a21] to-[#556629]', module: 'customers' },
    { name: 'New Supplier', icon: 'ri-user-settings-line', href: '/accounts-payable/suppliers', color: 'from-[#4a5d23] to-[#627730]', module: 'accounts-payable' },
    { name: 'New Invoice', icon: 'ri-file-text-line', href: '/billing/invoicing', color: 'from-[#566830] to-[#6e823a]', module: 'billing' },
    { name: 'POS', icon: 'ri-shopping-cart-line', href: '/pos', color: 'from-[#5d6e34] to-[#7a8c45]', module: 'pos' },
    { name: 'Cash Closing', icon: 'ri-money-dollar-box-line', href: '/billing/cash-closing', color: 'from-[#607337] to-[#81924a]', module: 'billing' },
    { name: 'Sales', icon: 'ri-bar-chart-box-line', href: '/billing/sales-reports', color: 'from-[#4c5e2c] to-[#708443]', module: 'billing' },
    { name: 'Products', icon: 'ri-shopping-bag-line', href: '/products', color: 'from-[#3f4d1f] to-[#5f7434]', module: 'products' },
    { name: 'Inventory', icon: 'ri-archive-line', href: '/inventory', color: 'from-[#54662d] to-[#6f8240]', module: 'inventory' },
    { name: 'Inventory Reports', icon: 'ri-line-chart-line', href: '/inventory', color: 'from-[#5b6d33] to-[#7a8f45]', module: 'inventory' },
    { name: 'Entries', icon: 'ri-download-line', href: '/inventory', color: 'from-[#485829] to-[#6a7f3d]', module: 'inventory' },
    { name: 'Transfers', icon: 'ri-arrow-left-right-line', href: '/inventory', color: 'from-[#3b4820] to-[#5a6e33]', module: 'inventory' },
    { name: 'Warehouse', icon: 'ri-building-line', href: '/inventory', color: 'from-[#2f3b16] to-[#4b5f29]', module: 'inventory' },
    { name: 'Payroll', icon: 'ri-wallet-line', href: '/payroll', color: 'from-[#384619] to-[#576c2b]', module: 'payroll' },
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
        <div className="bg-gradient-to-r from-[#4a5d23] to-[#5a6d33] rounded-lg p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
              <p className="text-stone-200">Quick access panel to main modules</p>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center px-4 py-2 bg-stone-700 hover:bg-stone-800 text-white rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl whitespace-nowrap"
            >
              <i className="ri-logout-box-line mr-2"></i>
              Sign Out
            </button>
          </div>
        </div>

        {/* Botones de Acceso Rápido */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Quick Access</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-8 gap-4">
            {quickAccessButtons.map((button) => (
              <button
                key={button.name}
                onClick={() => navigate(button.href)}
                className="group relative flex flex-col items-center justify-center p-4 bg-white rounded-xl border-2 border-gray-200 hover:border-transparent transition-all duration-300 hover:shadow-xl hover:scale-105"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${button.color} opacity-0 group-hover:opacity-100 rounded-xl transition-opacity duration-300`}></div>
                <div className="relative z-10">
                  <div className={`w-14 h-14 mb-3 rounded-full bg-gradient-to-br ${button.color} flex items-center justify-center text-white shadow-lg group-hover:shadow-xl transition-shadow duration-300`}>
                    <i className={`${button.icon} text-2xl`}></i>
                  </div>
                  <span className="text-sm font-medium text-gray-700 group-hover:text-white text-center block transition-colors duration-300">
                    {button.name}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Calendario */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">
              Calendar - {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
            </h2>
            <i className="ri-calendar-line text-2xl text-[#4a5d23]"></i>
          </div>
          
          <div className="grid grid-cols-7 gap-2">
            {/* Encabezados de días */}
            {weekDays.map((day) => (
              <div key={day} className="text-center font-semibold text-gray-600 py-2 text-sm">
                {day}
              </div>
            ))}
            
            {/* Días del mes */}
            {getDaysInMonth(currentDate).map((day, index) => (
              <div
                key={index}
                className={`aspect-square flex items-center justify-center rounded-lg text-sm transition-all ${
                  day === null
                    ? 'bg-transparent'
                    : day === currentDate.getDate()
                    ? 'bg-[#4a5d23] text-white font-bold shadow-lg'
                    : 'bg-stone-50 hover:bg-stone-100 text-stone-700 hover:text-[#4a5d23] cursor-pointer'
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
