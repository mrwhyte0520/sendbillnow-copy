import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { usePlans } from '../../hooks/usePlans';
import { usePlanPermissions } from '../../hooks/usePlanPermissions';
import { customersService, invoicesService, inventoryService, resolveTenantId, settingsService, accountingPeriodsService } from '../../services/database';
import { supabase } from '../../lib/supabase';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications] = useState<Array<{ title: string; time: string; type: 'info'|'warning'|'success' }>>([]);
  const [profilePanelOpen, setProfilePanelOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [userProfile, setUserProfile] = useState({
    fullName: '',
    email: '',
    phone: '',
    company: '',
    position: '',
    address: '',
    city: '',
    country: ''
  });
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [saveMessage, setSaveMessage] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { currentPlan, getTrialStatus, trialInfo } = usePlans();
  const { canAccessRoute, getRequiredPlanForRoute, requiresAccountingSetup } = usePlanPermissions();
  const [kpiCounts, setKpiCounts] = useState({ invoices: 0, customers: 0, products: 0 });
  const trialStatus = getTrialStatus();
  const [allowedModules, setAllowedModules] = useState<Set<string> | null>(null);
  const [isOwner, setIsOwner] = useState(true); // Por defecto true hasta verificar
  const [restrictedModal, setRestrictedModal] = useState<{ show: boolean; moduleName: string; requiredPlan: string }>({
    show: false,
    moduleName: '',
    requiredPlan: ''
  });
  const [showAccountingSetupModal, setShowAccountingSetupModal] = useState(false);
  const [accountingSetupChecked, setAccountingSetupChecked] = useState(false);

  useEffect(() => {
    setUserProfile(prev => ({
      ...prev,
      fullName: (user?.user_metadata as any)?.full_name || prev.fullName || (user?.email?.split('@')[0] ?? ''),
      email: user?.email ?? prev.email,
    }));
  }, [user]);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        if (!profilePanelOpen || !user?.id) return;

        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('id', user.id)
          .single();
        if (error || !data) return;

        let companyFromSettings: string | undefined;
        try {
          const info = await settingsService.getCompanyInfo();
          if (info && (info as any)) {
            const resolvedName =
              (info as any).name ||
              (info as any).company_name ||
              (info as any).legal_name;
            if (resolvedName) {
              companyFromSettings = String(resolvedName);
            }
          }
        } catch (e) {
          console.error('Error obteniendo información de la empresa para Mi Perfil:', e);
        }

        setUserProfile(prev => ({
          ...prev,
          email: data.email || user.email || prev.email,
          fullName: data.full_name || prev.fullName || (user.email?.split('@')[0] ?? ''),
          phone: data.phone || prev.phone,
          company: data.company || companyFromSettings || prev.company,
          position: data.position || prev.position,
          address: data.address || prev.address,
          city: data.city || prev.city,
          country: data.country || prev.country || 'República Dominicana',
        }));
      } catch (error) {
        console.error('Error al cargar perfil en DashboardLayout:', error);
      }
    };

    loadProfile();
  }, [profilePanelOpen, user?.id, user?.email]);

  // Verificar si el usuario es owner
  useEffect(() => {
    const checkIfOwner = async () => {
      if (!user?.id) return;
      try {
        const tenantId = await resolveTenantId(user.id);
        setIsOwner(tenantId === user.id);
      } catch (error) {
        console.error('Error verificando si es owner:', error);
        setIsOwner(false);
      }
    };
    checkIfOwner();
  }, [user?.id]);

  // Verificar si necesita configuración contable (para planes avanzados)
  useEffect(() => {
    const checkAccountingSetup = async () => {
      if (!user?.id || accountingSetupChecked || !requiresAccountingSetup) return;
      
      try {
        const periods = await accountingPeriodsService.getAll(user.id);
        const hasOpenPeriod = periods && periods.length > 0 && periods.some((p: any) => p.status === 'open');
        
        if (!hasOpenPeriod) {
          // El usuario tiene un plan avanzado pero no tiene períodos contables configurados
          setShowAccountingSetupModal(true);
        }
        setAccountingSetupChecked(true);
      } catch (error) {
        console.error('Error verificando configuración contable:', error);
        setAccountingSetupChecked(true);
      }
    };
    
    checkAccountingSetup();
  }, [user?.id, requiresAccountingSetup, accountingSetupChecked]);

  useEffect(() => {
    const STORAGE_PREFIX = 'contabi_rbac_';
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

  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const uid = user?.id || '';
        if (!uid) {
          setKpiCounts({ invoices: 0, customers: 0, products: 0 });
          return;
        }
        const [invoices, customers, items] = await Promise.all([
          invoicesService.getAll(uid),
          customersService.getAll(uid),
          inventoryService.getItems(uid)
        ]);
        setKpiCounts({
          invoices: (invoices || []).length,
          customers: (customers || []).length,
          products: (items || []).length
        });
      } catch {
        setKpiCounts({ invoices: 0, customers: 0, products: 0 });
      }
    };
    fetchCounts();
  }, [user]);

  const navigation = [
    {
      name: 'Panel de Control',
      href: '/dashboard',
      icon: 'ri-dashboard-line',
      current: location.pathname === '/dashboard'
    },
    {
      name: 'Estadísticas',
      href: '/statistics',
      icon: 'ri-bar-chart-2-line',
      current: location.pathname === '/statistics'
    },
    // 1. Contabilidad
    {
      name: 'Contabilidad',
      href: '/accounting',
      icon: 'ri-calculator-line',
      current: location.pathname.startsWith('/accounting'),
      submenu: [
        { name: 'Catálogo de Cuentas', href: '/accounting/chart-accounts' },
        { name: 'Caja Chica', href: '/accounting/petty-cash' },
        { name: 'Estados Financieros', href: '/accounting/financial-statements' },
        { name: 'Diario General', href: '/accounting/general-journal' },
        { name: 'Mayor General', href: '/accounting/general-ledger' },
        { name: 'Balanza de Comprobación', href: '/accounting/trial-balance' },
        { name: 'Períodos Contables', href: '/accounting/periods' }
      ]
    },
    // 2. Bancos (módulo independiente)
    {
      name: 'Bancos',
      href: '/banks-module',
      icon: 'ri-bank-line',
      current: location.pathname.startsWith('/banks-module'),
      submenu: [
        { name: 'Depósitos Bancarios', href: '/banks-module/deposits' },
        { name: 'Solicitudes de Pago', href: '/banks-module/payment-requests' },
        { name: 'Cheques', href: '/banks-module/checks' },
        { name: 'Transferencias Bancarias', href: '/banks-module/transfers' },
        { name: 'Créditos Bancarios', href: '/banks-module/credits' },
        { name: 'Cargos Bancarios', href: '/banks-module/charges' },
        { name: 'Crear Moneda', href: '/banks-module/currencies' },
        { name: 'Tasas Cambiarias', href: '/banks-module/exchange-rates' },
        { name: 'Reporte Bancario', href: '/banks-module/reports' },
        { name: 'Conciliación Bancaria', href: '/banks-module/reconciliation' },
        { name: 'Historial de Conciliaciones', href: '/banks-module/reconciliations-history' },
      ]
    },
    // 3. Cuentas por cobrar
    {
      name: 'Cuentas por Cobrar',
      href: '/accounts-receivable',
      icon: 'ri-money-dollar-circle-line',
      current: location.pathname.startsWith('/accounts-receivable')
    },
    // 4. Cuentas por pagar
    {
      name: 'Cuentas por Pagar',
      href: '/accounts-payable',
      icon: 'ri-file-list-3-line',
      current: location.pathname.startsWith('/accounts-payable'),
      submenu: [
        { name: 'Reportes CxP', href: '/accounts-payable/reports' },
        { name: 'Suplidores', href: '/accounts-payable/suppliers' },
        { name: 'Emisión de Pagos', href: '/accounts-payable/payments' },
        { name: 'Órdenes de Compra', href: '/accounts-payable/purchase-orders' },
        { name: 'Cotizaciones', href: '/accounts-payable/quotes' },
        { name: 'Tipos de Suplidor', href: '/accounts-payable/supplier-types' },
        { name: 'Términos de Pago', href: '/accounts-payable/payment-terms' },
        { name: 'Anticipos a Proveedores', href: '/accounts-payable/advances' },
        { name: 'Facturas de Suplidor', href: '/accounts-payable/invoices' },
        { name: 'Notas Débito/Crédito', href: '/accounts-payable/debit-credit-notes' },
      ]
    },
    // 5. Facturación
    {
      name: 'Facturación',
      href: '/billing',
      icon: 'ri-file-text-line',
      current: location.pathname.startsWith('/billing'),
      submenu: [
        { name: 'Reporte de Ventas', href: '/billing/sales-reports' },
        { name: 'Reporte de Comisión', href: '/billing/commission-report' },
        { name: 'Vendedores', href: '/billing/sales-reps' },
        { name: 'Tipos de Vendedor', href: '/billing/sales-rep-types' },
        { name: 'Tiendas / Sucursales', href: '/billing/stores' },
        { name: 'Facturación', href: '/billing/invoicing' },
        { name: 'Pre-facturación', href: '/billing/pre-invoicing' },
        { name: 'Facturación Recurrente', href: '/billing/recurring' },
        { name: 'Cierre de Caja', href: '/billing/cash-closing' },
        { name: 'Cotizaciones', href: '/billing/quotes' },
      ]
    },
    // 6. Punto de ventas
    {
      name: 'Punto de Ventas',
      href: '/pos',
      icon: 'ri-shopping-cart-line',
      current: location.pathname.startsWith('/pos')
    },
    // 7. Inventario
    {
      name: 'Inventario',
      href: '/inventory',
      icon: 'ri-archive-line',
      current: location.pathname.startsWith('/inventory')
    },
    // 8. Activos fijos
    {
      name: 'Activos Fijos',
      href: '/fixed-assets',
      icon: 'ri-building-line',
      current: location.pathname.startsWith('/fixed-assets'),
      submenu: [
        { name: 'Registro de Activos', href: '/fixed-assets/register' },
        { name: 'Tipos de Activos', href: '/fixed-assets/types' },
        { name: 'Depreciación', href: '/fixed-assets/depreciation' },
        { name: 'Tipos de Depreciación', href: '/fixed-assets/depreciation-types' },
        { name: 'Reporte de Activos Fijos', href: '/fixed-assets/report' },
        { name: 'Revalorización', href: '/fixed-assets/revaluation' },
        { name: 'Retiro de Activos', href: '/fixed-assets/disposal' }
      ]
    },
    // 9. Nóminas
    {
      name: 'Nóminas',
      href: '/payroll',
      icon: 'ri-team-line',
      current: location.pathname.startsWith('/payroll'),
      submenu: [
        { name: 'Configuración de Nóminas', href: '/payroll/configuration' },
        { name: 'Empleados', href: '/payroll/employees' },
        { name: 'Tipos de Empleados', href: '/payroll/employee-types' },
        { name: 'Departamentos', href: '/payroll/departments' },
        { name: 'Cargos / Posiciones', href: '/payroll/positions' },
        { name: 'Tipos de Salarios', href: '/payroll/salary-types' },
        { name: 'Tipos de Comisiones', href: '/payroll/commission-types' },
        { name: 'Vacaciones', href: '/payroll/vacations' },
        { name: 'Horas Extras', href: '/payroll/overtime' },
        { name: 'Días Feriados', href: '/payroll/holidays' },
        { name: 'Regalía Pascual', href: '/payroll/royalties' },
        { name: 'Bonificaciones', href: '/payroll/bonuses' },
        { name: 'Deducciones Periódicas', href: '/payroll/deductions' },
        { name: 'Otras Deducciones', href: '/payroll/other-deductions' },
        { name: 'Registro de Ausencias', href: '/payroll/absences' },
        { name: 'Proceso de Pago Nómina', href: '/payroll/payroll-process' },
        { name: 'Entrada al Diario Nómina', href: '/payroll/journal-entry' }
      ]
    },
    // 10. Impuestos
    {
      name: 'Impuestos',
      href: '/taxes',
      icon: 'ri-government-line',
      current: location.pathname.startsWith('/taxes'),
      submenu: [
        { name: 'Configuración', href: '/taxes/configuration' },
        { name: 'NCF/E-CF', href: '/taxes/ncf' },
        { name: 'Series Fiscales', href: '/taxes/fiscal-series' },
        { name: 'Reporte 606', href: '/taxes/report-606' },
        { name: 'Reporte 607', href: '/taxes/report-607' },
        { name: 'Reporte 608', href: '/taxes/report-608' },
        { name: 'Reporte IT-1', href: '/taxes/report-it1' },
        { name: 'Reporte IR-17', href: '/taxes/report-ir17' },
        { name: 'Proporcionalidad ITBIS', href: '/taxes/itbis-proportionality' }
      ]
    },
    // 11. Planes
    {
      name: 'Planes',
      href: '/plans',
      icon: 'ri-vip-crown-line',
      current: location.pathname.startsWith('/plans')
    },
    // 12. Referidos
    {
      name: 'Referidos',
      href: '/referrals',
      icon: 'ri-share-forward-line',
      current: location.pathname.startsWith('/referrals')
    },
    // 13. Usuarios (solo para owners)
    ...(isOwner ? [{
      name: 'Usuarios',
      href: '/users',
      icon: 'ri-shield-user-line',
      current: location.pathname.startsWith('/users')
    }] : []),
    // 14. Configuración (solo para owners)
    ...(isOwner ? [{
      name: 'Configuración',
      href: '/settings',
      icon: 'ri-settings-line',
      current: location.pathname.startsWith('/settings'),
      submenu: [
        { name: 'Empresa', href: '/settings/company' },
        { name: 'Balances Iniciales', href: '/settings/opening-balances' },
        { name: 'Contabilidad', href: '/settings/accounting' },
        { name: 'Inventario', href: '/settings/inventory' },
        { name: 'Respaldos', href: '/settings/backup' }
      ]
    }] : [])
  ];

  const [expandedMenus, setExpandedMenus] = useState<string[]>([]);

  const toggleSubmenu = (href: string) => {
    setExpandedMenus(prev => 
      prev.includes(href) 
        ? prev.filter(item => item !== href)
        : [...prev, href]
    );
  };

  const renderNavItem = (item: any) => {
    const hasSubmenu = item.submenu && item.submenu.length > 0;
    const isExpanded = expandedMenus.includes(item.href);

    // RBAC filter: allow all if allowedModules is null (loading) or empty (no RBAC configured)
    const rbacOff = allowedModules === null || allowedModules.size === 0;
    const moduleOf = (href: string) => (href.split('/').filter(Boolean)[0] || 'dashboard');
    const itemAllowed = rbacOff || allowedModules!.has(moduleOf(item.href));
    if (!itemAllowed) return null;

    const submenu = hasSubmenu
      ? item.submenu.filter((s: any) => rbacOff || allowedModules!.has(moduleOf(s.href)))
      : null;
    const hasFilteredSubmenu = submenu && submenu.length > 0;

    // Verificar si el módulo está restringido por plan
    const isPlanRestricted = !canAccessRoute(item.href);
    const requiredPlan = isPlanRestricted ? getRequiredPlanForRoute(item.href) : '';

    // Handler para items restringidos
    const handleRestrictedClick = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setRestrictedModal({
        show: true,
        moduleName: item.name,
        requiredPlan: requiredPlan
      });
    };

    return (
      <div key={item.name} className="mb-1">
        <div className="flex items-center">
          {isPlanRestricted ? (
            // Item restringido por plan - mostrar con candado
            <div
              onClick={handleRestrictedClick}
              className="group flex items-center px-3 py-2.5 text-sm font-medium rounded-lg flex-1 transition-all duration-200 text-slate-500 hover:bg-slate-700/30 cursor-pointer"
              title={`Requiere ${requiredPlan}`}
            >
              <i className={`${item.icon} mr-3 text-lg flex-shrink-0 opacity-50`}></i>
              <span className="truncate opacity-70">{item.name}</span>
              <i className="ri-lock-2-fill ml-auto text-amber-500/70 text-sm"></i>
            </div>
          ) : (
            // Item permitido
            <Link
              to={item.href}
              className={`group flex items-center px-3 py-2.5 text-sm font-medium rounded-lg flex-1 transition-all duration-200 ${
                item.current
                  ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg transform scale-[1.02]'
                  : 'text-slate-300 hover:bg-slate-700/50 hover:text-white hover:transform hover:scale-[1.01]'
              }`}
              onClick={() => setSidebarOpen(false)}
            >
              <i className={`${item.icon} mr-3 text-lg flex-shrink-0`}></i>
              <span className="truncate">{item.name}</span>
            </Link>
          )}
          {hasFilteredSubmenu && !isPlanRestricted && (
            <button
              onClick={() => toggleSubmenu(item.href)}
              className="p-2 ml-1 text-slate-400 hover:text-white transition-colors duration-200 rounded-md hover:bg-slate-700/50"
            >
              <i className={`ri-arrow-${isExpanded ? 'up' : 'down'}-s-line text-sm`}></i>
            </button>
          )}
        </div>
        {hasFilteredSubmenu && isExpanded && !isPlanRestricted && (
          <div className="ml-6 mt-2 space-y-1 border-l border-slate-700 pl-4">
            {submenu!.map((subItem: any) => {
              const isSubItemRestricted = !canAccessRoute(subItem.href);
              const subRequiredPlan = isSubItemRestricted ? getRequiredPlanForRoute(subItem.href) : '';

              if (isSubItemRestricted) {
                return (
                  <div
                    key={subItem.name}
                    onClick={(e) => {
                      e.preventDefault();
                      setRestrictedModal({
                        show: true,
                        moduleName: subItem.name,
                        requiredPlan: subRequiredPlan
                      });
                    }}
                    className="flex items-center px-3 py-2 text-sm rounded-md transition-all duration-200 text-slate-500 hover:bg-slate-700/30 cursor-pointer"
                    title={`Requiere ${subRequiredPlan}`}
                  >
                    <span className="truncate opacity-70">{subItem.name}</span>
                    <i className="ri-lock-2-fill ml-auto text-amber-500/70 text-xs"></i>
                  </div>
                );
              }

              return (
                <Link
                  key={subItem.name}
                  to={subItem.href}
                  className={`block px-3 py-2 text-sm rounded-md transition-all duration-200 ${
                    location.pathname === subItem.href
                      ? 'text-blue-400 bg-slate-700/50 font-medium'
                      : 'text-slate-400 hover:text-white hover:bg-slate-700/30'
                  }`}
                  onClick={() => setSidebarOpen(false)}
                >
                  {subItem.name}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const handleSignOut = async () => {
    try {
      setProfileDropdownOpen(false);
      await signOut();
      navigate('/auth/login');
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  };

  const handleProfileClick = () => {
    setProfilePanelOpen(true);
    setSidebarOpen(false);
  };

  const handleEditProfile = () => {
    setEditProfileOpen(true);
  };

  const handleSaveProfile = async () => {
    if (!user?.id) {
      setSaveMessage('Usuario no autenticado');
      return;
    }

    try {
      const { error } = await supabase
        .from('users')
        .update({
          full_name: userProfile.fullName,
          phone: userProfile.phone,
          company: userProfile.company,
          position: userProfile.position,
          address: userProfile.address,
          city: userProfile.city,
          country: userProfile.country || 'República Dominicana',
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) throw error;

      setSaveMessage('Perfil actualizado correctamente');
      setTimeout(() => {
        setSaveMessage('');
        setEditProfileOpen(false);
      }, 2000);
    } catch (error: any) {
      console.error('Error al guardar perfil:', error);
      const message = error?.message || (error?.error_description) || 'Error al actualizar el perfil';
      setSaveMessage(message);
    }
  };

  const handleChangePassword = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setSaveMessage('Las contraseñas no coinciden');
      return;
    }
    if (passwordData.newPassword.length < 6) {
      setSaveMessage('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    
    try {
      const { error } = await supabase.auth.updateUser({
        password: passwordData.newPassword,
      });
      if (error) throw error;
      setSaveMessage('Contraseña actualizada correctamente');
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => setSaveMessage(''), 2000);
    } catch (error) {
      console.error('Error al cambiar contraseña:', error);
      setSaveMessage('Error al cambiar la contraseña');
    }
  };

  const handleNotificationClick = () => {
    setNotificationsOpen(!notificationsOpen);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-40 w-72 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 shadow-2xl transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0`}>
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 shrink-0 items-center px-6 border-b border-slate-700/50 bg-slate-900/50">
            <div className="flex items-center">
              <img
                src="https://i.postimg.cc/25S0htqg/Contabi-L-removebg-preview.png"
                alt="Logo Contabi"
                className="h-10 w-auto object-contain"
              />
              <div className="ml-3">
                <h1 className="brand-serif text-xl font-bold text-white">Contabi RD</h1>
                <p className="text-xs text-slate-400">Sistema de Finanzas</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent">
            <div className="space-y-1">
              {navigation.map(renderNavItem)}
              
              {/* Mi Perfil Button */}
              <div className="mb-1">
                <button
                  onClick={handleProfileClick}
                  className="group flex items-center px-3 py-2.5 text-sm font-medium rounded-lg w-full transition-all duration-200 text-slate-300 hover:bg-slate-700/50 hover:text-white hover:transform hover:scale-[1.01]"
                >
                  <i className="ri-user-line mr-3 text-lg flex-shrink-0"></i>
                  <span className="truncate">Mi Perfil</span>
                </button>
              </div>
            </div>
          </nav>

          {/* User info */}
          <div className="border-t border-slate-700/50 p-4 bg-slate-900/30">
            <div className="flex items-center">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg">
                <span className="text-sm font-bold text-white">
                  {user?.email?.charAt(0).toUpperCase() || 'U'}
                </span>
              </div>
              <div className="ml-3 flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {user?.email || 'Usuario'}
                </p>
                <p className="text-xs text-slate-400 truncate">
                  {currentPlan?.name || (trialStatus === 'expired' ? 'Sin plan activo' : 'Plan de Prueba')}
                  {trialStatus === 'active' && !currentPlan && ` (${trialInfo.daysLeft}d restantes)`}
                </p>
              </div>
              <button
                onClick={handleSignOut}
                className="ml-2 p-2 text-slate-400 hover:text-white transition-colors duration-200 rounded-md hover:bg-slate-700/50"
                title="Cerrar Sesión"
              >
                <i className="ri-logout-box-line text-lg"></i>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Profile Panel */}
      {profilePanelOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div className="absolute inset-0 bg-black bg-opacity-50" onClick={() => setProfilePanelOpen(false)}></div>
          <div className="absolute right-0 top-0 h-full w-96 bg-white shadow-xl transform transition-transform duration-300 ease-in-out">
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">Mi Perfil</h2>
                <button
                  onClick={() => setProfilePanelOpen(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <i className="ri-close-line text-xl text-gray-500"></i>
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6">
                {!editProfileOpen ? (
                  <>
                    {/* User Info */}
                    <div className="text-center mb-6">
                      <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="text-2xl font-bold text-white">
                          {userProfile.fullName.charAt(0)}
                        </span>
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900">{userProfile.fullName}</h3>
                      <p className="text-sm text-gray-600">{userProfile.email}</p>
                    </div>

                    {/* Account Status */}
                    <div className="bg-gray-50 rounded-lg p-4 mb-6">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">Estado de la cuenta</span>
                        <span className="text-sm text-green-600 font-medium">Activo</span>
                      </div>
                      <div className="grid grid-cols-3 gap-4 mt-4">
                        <div className="text-center">
                          <div className="text-lg font-bold text-gray-900">{kpiCounts.invoices}</div>
                          <div className="text-xs text-gray-600">Facturas</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-bold text-gray-900">{kpiCounts.customers}</div>
                          <div className="text-xs text-gray-600">Clientes</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-bold text-gray-900">{kpiCounts.products}</div>
                          <div className="text-xs text-gray-600">Productos</div>
                        </div>
                      </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="space-y-2">
                      <button 
                        onClick={handleEditProfile}
                        className="w-full flex items-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors duration-200"
                      >
                        <i className="ri-edit-line mr-3 text-blue-600"></i>
                        Editar Perfil
                      </button>
                      <button 
                        onClick={() => {
                          navigate('/settings');
                        }}
                        className="w-full flex items-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors duration-200"
                      >
                        <i className="ri-settings-line mr-3 text-gray-600"></i>
                        Configuración
                      </button>
                      <button 
                        onClick={() => {
                          navigate('/plans');
                        }}
                        className="w-full flex items-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors duration-200"
                      >
                        <i className="ri-vip-crown-line mr-3 text-yellow-600"></i>
                        Mejorar Plan
                      </button>
                    </div>
                  </>
                ) : (
                  /* Edit Profile Form */
                  <div className="space-y-6">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-lg font-semibold text-gray-900">Editar Perfil</h3>
                      <button
                        onClick={() => setEditProfileOpen(false)}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <i className="ri-arrow-left-line text-xl text-gray-500"></i>
                      </button>
                    </div>

                    {saveMessage && (
                      <div className={`p-3 rounded-lg text-sm ${
                        saveMessage.includes('Error') 
                          ? 'bg-red-100 text-red-700' 
                          : 'bg-green-100 text-green-700'
                      }`}>
                        {saveMessage}
                      </div>
                    )}

                    {/* Personal Information */}
                    <div>
                      <h4 className="text-md font-medium text-gray-900 mb-4">Información Personal</h4>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Nombre Completo
                          </label>
                          <input
                            type="text"
                            value={userProfile.fullName}
                            onChange={(e) => setUserProfile({...userProfile, fullName: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Email
                          </label>
                          <input
                            type="email"
                            value={userProfile.email}
                            onChange={(e) => setUserProfile({...userProfile, email: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Teléfono
                          </label>
                          <input
                            type="tel"
                            value={userProfile.phone}
                            onChange={(e) => setUserProfile({...userProfile, phone: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Empresa
                          </label>
                          <input
                            type="text"
                            value={userProfile.company}
                            onChange={(e) => setUserProfile({...userProfile, company: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Cargo
                          </label>
                          <input
                            type="text"
                            value={userProfile.position}
                            onChange={(e) => setUserProfile({...userProfile, position: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Dirección
                          </label>
                          <input
                            type="text"
                            value={userProfile.address}
                            onChange={(e) => setUserProfile({...userProfile, address: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Ciudad
                            </label>
                            <input
                              type="text"
                              value={userProfile.city}
                              onChange={(e) => setUserProfile({...userProfile, city: e.target.value})}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              País
                            </label>
                            <input
                              type="text"
                              value={userProfile.country}
                              onChange={(e) => setUserProfile({...userProfile, country: e.target.value})}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Change Password */}
                    <div>
                      <h4 className="text-md font-medium text-gray-900 mb-4">Cambiar Contraseña</h4>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Contraseña Actual
                          </label>
                          <input
                            type="password"
                            value={passwordData.currentPassword}
                            onChange={(e) => setPasswordData({...passwordData, currentPassword: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Nueva Contraseña
                          </label>
                          <input
                            type="password"
                            value={passwordData.newPassword}
                            onChange={(e) => setPasswordData({...passwordData, newPassword: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Confirmar Nueva Contraseña
                          </label>
                          <input
                            type="password"
                            value={passwordData.confirmPassword}
                            onChange={(e) => setPasswordData({...passwordData, confirmPassword: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                          />
                        </div>
                        <button
                          onClick={handleChangePassword}
                          className="w-full bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                        >
                          Cambiar Contraseña
                        </button>
                      </div>
                    </div>

                    {/* Save Button */}
                    <div className="pt-4 border-t border-gray-200">
                      <button
                        onClick={handleSaveProfile}
                        className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                      >
                        Guardar Cambios
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer - Only show when not editing */}
              {!editProfileOpen && (
                <div className="border-t border-gray-200 p-6">
                  <button
                    onClick={handleSignOut}
                    className="w-full flex items-center justify-center px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors duration-200"
                  >
                    <i className="ri-logout-box-line mr-2"></i>
                    Cerrar Sesión
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 flex flex-col lg:ml-0">
        {/* Top navigation */}
        <div className="flex h-16 shrink-0 items-center gap-x-4 border-b border-gray-200 bg-white/95 backdrop-blur-sm px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8">
          <button
            type="button"
            className="-m-2.5 p-2.5 text-gray-700 lg:hidden hover:bg-gray-100 rounded-lg transition-colors duration-200"
            onClick={() => setSidebarOpen(true)}
          >
            <span className="sr-only">Abrir sidebar</span>
            <i className="ri-menu-line text-xl"></i>
          </button>

          {/* Separator */}
          <div className="h-6 w-px bg-gray-200 lg:hidden" aria-hidden="true" />

          <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
            <div className="relative flex flex-1 items-center">
            </div>
            <div className="flex items-center gap-x-4 lg:gap-x-6">
              {/* Notifications button */}
              <button
                type="button"
                className="-m-2.5 p-2.5 text-gray-400 hover:text-gray-500 relative hover:bg-gray-100 rounded-lg transition-colors duration-200"
                onClick={handleNotificationClick}
              >
                <span className="sr-only">Ver notificaciones</span>
                <i className="ri-notification-3-line text-xl"></i>
                {notifications.length > 0 && (
                  <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                    {notifications.length}
                  </span>
                )}
              </button>

              {/* Notifications dropdown */}
              {notificationsOpen && (
                <div className="absolute right-0 top-16 mt-2 w-80 bg-white rounded-xl shadow-xl ring-1 ring-black/5 z-50 border border-gray-100">
                  <div className="p-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Notificaciones</h3>
                    {notifications.length === 0 ? (
                      <div className="text-sm text-gray-500">No hay notificaciones</div>
                    ) : (
                      <div className="space-y-3">
                        {notifications.map((n, idx) => (
                          <div key={idx} className={`flex items-start space-x-3 p-3 rounded-lg transition-colors duration-200 ${n.type === 'warning' ? 'bg-yellow-50' : n.type === 'success' ? 'bg-green-50' : 'bg-blue-50'}`}>
                            <i className={`${n.type === 'warning' ? 'ri-warning-line text-yellow-500' : n.type === 'success' ? 'ri-check-line text-green-500' : 'ri-information-line text-blue-500'} mt-1`}></i>
                            <div>
                              <p className="text-sm font-medium text-gray-900">{n.title}</p>
                              <p className="text-xs text-gray-500">{n.time}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className="flex-1">
          <div className="py-6">
            <div className="px-4 sm:px-6 lg:px-8">
              {children}
            </div>
          </div>
        </main>
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 lg:hidden">
          <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
        </div>
      )}

      {/* Click outside to close dropdowns */}
      {(profileDropdownOpen || notificationsOpen) && (
        <div 
          className="fixed inset-0 z-20" 
          onClick={() => {
            setProfileDropdownOpen(false);
            setNotificationsOpen(false);
          }} 
        />
      )}

      {/* Modal de módulo restringido */}
      {restrictedModal.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Overlay */}
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setRestrictedModal({ show: false, moduleName: '', requiredPlan: '' })}
          />
          
          {/* Modal */}
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header con gradiente */}
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-6 text-center">
              <div className="w-20 h-20 mx-auto bg-white/20 rounded-full flex items-center justify-center mb-4 backdrop-blur-sm">
                <i className="ri-lock-2-line text-4xl text-white"></i>
              </div>
              <h3 className="text-2xl font-bold text-white mb-1">Módulo Premium</h3>
              <p className="text-amber-100 text-sm">Acceso restringido</p>
            </div>

            {/* Contenido */}
            <div className="p-6">
              <div className="text-center mb-6">
                <p className="text-gray-600 mb-4">
                  El módulo <span className="font-semibold text-gray-900">"{restrictedModal.moduleName}"</span> no está disponible en tu plan actual.
                </p>
                
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100">
                  <div className="flex items-center justify-center mb-2">
                    <i className="ri-vip-crown-2-fill text-amber-500 text-2xl mr-2"></i>
                    <span className="text-sm text-gray-600">Plan requerido:</span>
                  </div>
                  <p className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                    {restrictedModal.requiredPlan}
                  </p>
                </div>
              </div>

              {/* Beneficios */}
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Al actualizar obtienes:</p>
                <ul className="space-y-2">
                  <li className="flex items-center text-sm text-gray-700">
                    <i className="ri-check-line text-green-500 mr-2"></i>
                    Acceso completo a {restrictedModal.moduleName}
                  </li>
                  <li className="flex items-center text-sm text-gray-700">
                    <i className="ri-check-line text-green-500 mr-2"></i>
                    Todas las funcionalidades premium
                  </li>
                  <li className="flex items-center text-sm text-gray-700">
                    <i className="ri-check-line text-green-500 mr-2"></i>
                    Soporte prioritario
                  </li>
                </ul>
              </div>

              {/* Botones */}
              <div className="flex gap-3">
                <button
                  onClick={() => setRestrictedModal({ show: false, moduleName: '', requiredPlan: '' })}
                  className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    setRestrictedModal({ show: false, moduleName: '', requiredPlan: '' });
                    navigate('/plans');
                  }}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl flex items-center justify-center"
                >
                  <i className="ri-arrow-up-circle-line mr-2"></i>
                  Ver Planes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de configuración contable requerida */}
      {showAccountingSetupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-5 text-center">
              <div className="w-16 h-16 mx-auto bg-white/20 rounded-full flex items-center justify-center mb-3 backdrop-blur-sm">
                <i className="ri-settings-3-line text-3xl text-white"></i>
              </div>
              <h3 className="text-xl font-bold text-white">Configuración Requerida</h3>
              <p className="text-blue-100 text-sm mt-1">Tu plan incluye funciones contables avanzadas</p>
            </div>
            <div className="p-5">
              <div className="text-center mb-5">
                <p className="text-gray-600 text-sm mb-4">
                  Para aprovechar todas las funcionalidades de tu plan, necesitas configurar:
                </p>
                <div className="space-y-3">
                  <div className="flex items-center bg-amber-50 rounded-lg p-3 border border-amber-200">
                    <i className="ri-calendar-check-line text-amber-600 text-xl mr-3"></i>
                    <div className="text-left">
                      <p className="font-medium text-gray-900 text-sm">Períodos Contables</p>
                      <p className="text-xs text-gray-500">Define tu año fiscal y períodos mensuales</p>
                    </div>
                  </div>
                  <div className="flex items-center bg-blue-50 rounded-lg p-3 border border-blue-200">
                    <i className="ri-file-list-3-line text-blue-600 text-xl mr-3"></i>
                    <div className="text-left">
                      <p className="font-medium text-gray-900 text-sm">Secuencias NCF</p>
                      <p className="text-xs text-gray-500">Configura tus comprobantes fiscales</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowAccountingSetupModal(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium text-sm hover:bg-gray-50 transition-colors"
                >
                  Más tarde
                </button>
                <button
                  onClick={() => {
                    setShowAccountingSetupModal(false);
                    navigate('/settings/accounting');
                  }}
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg font-medium text-sm hover:from-blue-700 hover:to-indigo-700 transition-all flex items-center justify-center"
                >
                  <i className="ri-settings-3-line mr-2"></i>
                  Configurar Ahora
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DashboardLayout;
