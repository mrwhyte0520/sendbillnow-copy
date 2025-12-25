import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { useAuth } from '../../hooks/useAuth';
import { usePlanPermissions } from '../../hooks/usePlanPermissions';

export default function DashboardPage() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const { canAccessRoute, getRequiredPlanForRoute } = usePlanPermissions();
  const [currentDate] = useState(new Date());
  const [showRestrictedModal, setShowRestrictedModal] = useState(false);
  const [restrictedAction, setRestrictedAction] = useState('');
  const [requiredPlan, setRequiredPlan] = useState('');

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/auth/login');
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  };

  // Botones de acceso rápido
  const quickAccessButtons = [
    { name: 'Usuario', icon: 'ri-user-add-line', href: '/users', color: 'from-teal-500 to-teal-600' },
    { name: 'Nuevo Cliente', icon: 'ri-user-smile-line', href: '/customers', color: 'from-blue-500 to-blue-600' },
    { name: 'Nuevo Proveedor', icon: 'ri-user-settings-line', href: '/accounts-payable/suppliers', color: 'from-cyan-500 to-cyan-600' },
    { name: 'Nueva Factura', icon: 'ri-file-text-line', href: '/billing/invoicing', color: 'from-purple-500 to-purple-600' },
    { name: 'POS', icon: 'ri-shopping-cart-line', href: '/pos', color: 'from-orange-500 to-orange-600' },
    { name: 'Cierre de Caja', icon: 'ri-money-dollar-box-line', href: '/billing/cash-closing', color: 'from-yellow-500 to-yellow-600' },
    { name: 'Ventas', icon: 'ri-bar-chart-box-line', href: '/billing/sales-reports', color: 'from-pink-500 to-pink-600' },
    { name: 'Productos', icon: 'ri-shopping-bag-line', href: '/products', color: 'from-red-500 to-red-600' },
    { name: 'Inventario', icon: 'ri-archive-line', href: '/inventory', color: 'from-indigo-500 to-indigo-600' },
    { name: 'Reportes Inventario', icon: 'ri-line-chart-line', href: '/inventory', color: 'from-green-500 to-green-600' },
    { name: 'Entradas', icon: 'ri-download-line', href: '/inventory', color: 'from-lime-500 to-lime-600' },
    { name: 'Transferencias', icon: 'ri-arrow-left-right-line', href: '/inventory', color: 'from-emerald-500 to-emerald-600' },
    { name: 'Almacén', icon: 'ri-building-line', href: '/inventory', color: 'from-sky-500 to-sky-600' },
    { name: 'Nóminas', icon: 'ri-wallet-line', href: '/payroll', color: 'from-fuchsia-500 to-fuchsia-600' },
  ];

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

  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const weekDays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
              <p className="text-blue-100">Panel de acceso rápido a módulos principales</p>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl whitespace-nowrap"
            >
              <i className="ri-logout-box-line mr-2"></i>
              Cerrar Sesión
            </button>
          </div>
        </div>

        {/* Botones de Acceso Rápido */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Acceso Rápido</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-8 gap-4">
            {quickAccessButtons.map((button) => {
              const isRestricted = !canAccessRoute(button.href);
              const planRequired = isRestricted ? getRequiredPlanForRoute(button.href) : '';

              return (
                <button
                  key={button.name}
                  onClick={() => {
                    if (isRestricted) {
                      setRestrictedAction(button.name);
                      setRequiredPlan(planRequired);
                      setShowRestrictedModal(true);
                    } else {
                      navigate(button.href);
                    }
                  }}
                  className={`group relative flex flex-col items-center justify-center p-4 bg-white rounded-xl border-2 transition-all duration-300 ${
                    isRestricted
                      ? 'border-gray-200 opacity-75 hover:opacity-90 cursor-pointer'
                      : 'border-gray-200 hover:border-transparent hover:shadow-xl hover:scale-105'
                  }`}
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${button.color} opacity-0 ${!isRestricted && 'group-hover:opacity-100'} rounded-xl transition-opacity duration-300`}></div>
                  <div className="relative z-10">
                    <div className={`w-14 h-14 mb-3 rounded-full bg-gradient-to-br ${button.color} flex items-center justify-center text-white shadow-lg ${!isRestricted && 'group-hover:shadow-xl'} transition-shadow duration-300 relative`}>
                      <i className={`${button.icon} text-2xl`}></i>
                      {isRestricted && (
                        <div className="absolute -top-1 -right-1 w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center shadow-lg">
                          <i className="ri-lock-fill text-white text-xs"></i>
                        </div>
                      )}
                    </div>
                    <span className={`text-sm font-medium text-center block transition-colors duration-300 ${
                      isRestricted
                        ? 'text-gray-500'
                        : 'text-gray-700 group-hover:text-white'
                    }`}>
                      {button.name}
                    </span>
                    {isRestricted && (
                      <div className="mt-1">
                        <span className="text-xs text-amber-600 font-medium flex items-center justify-center">
                          <i className="ri-vip-crown-2-line mr-1"></i>
                          {planRequired}
                        </span>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Calendario */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">
              Calendario - {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
            </h2>
            <i className="ri-calendar-line text-2xl text-blue-600"></i>
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
                    ? 'bg-blue-600 text-white font-bold shadow-lg'
                    : 'bg-gray-50 hover:bg-blue-50 text-gray-700 hover:text-blue-600 cursor-pointer'
                }`}
              >
                {day}
              </div>
            ))}
          </div>
        </div>

        {/* Modal de acción restringida */}
        {showRestrictedModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div 
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowRestrictedModal(false)}
            />
            <div className="relative bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden">
              <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-4 text-center">
                <div className="w-14 h-14 mx-auto bg-white/20 rounded-full flex items-center justify-center mb-2 backdrop-blur-sm">
                  <i className="ri-lock-2-line text-3xl text-white"></i>
                </div>
                <h3 className="text-lg font-bold text-white">Acción Premium</h3>
                <p className="text-amber-100 text-sm">Acceso restringido</p>
              </div>
              <div className="p-4">
                <div className="text-center mb-4">
                  <p className="text-gray-600 text-sm mb-3">
                    <span className="font-semibold text-gray-900">"{restrictedAction}"</span> no está disponible en tu plan actual.
                  </p>
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-3 border border-blue-100">
                    <div className="flex items-center justify-center mb-1">
                      <i className="ri-vip-crown-2-fill text-amber-500 text-xl mr-2"></i>
                      <span className="text-xs text-gray-600">Plan requerido:</span>
                    </div>
                    <p className="text-base font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                      {requiredPlan}
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowRestrictedModal(false)}
                    className="flex-1 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium text-sm hover:bg-gray-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      setShowRestrictedModal(false);
                      navigate('/plans');
                    }}
                    className="flex-1 px-3 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg font-medium text-sm hover:from-blue-700 hover:to-indigo-700 transition-all flex items-center justify-center"
                  >
                    <i className="ri-arrow-up-circle-line mr-1"></i>
                    Ver Planes
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
