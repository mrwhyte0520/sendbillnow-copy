import { useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { usePlans } from '../../hooks/usePlans';
import { useAuth } from '../../hooks/useAuth';
import { referralsService } from '../../services/database';
import { Elements } from '@stripe/react-stripe-js';
import { getStripe } from '../../services/stripe';
import StripePaymentFormDirect from '../../components/StripePaymentFormDirect';

interface Plan {
  id: string;
  name: string;
  priceMonthly: number;
  priceAnnual: number;
  description: string;
  features: string[];
  popular: boolean;
  color: string;
  icon: string;
  category: 'contabilidad' | 'facturacion' | 'pos';
}

export default function PlansPage() {
  const [selectedPlan, setSelectedPlan] = useState<string>('');
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('monthly');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successPlanName, setSuccessPlanName] = useState('');
  const [stripePromise] = useState(() => getStripe());
  const { user } = useAuth();
  
  const { 
    currentPlan, 
    trialInfo, 
    subscribeToPlan, 
    canSelectPlan, 
    getTrialStatus 
  } = usePlans();

  const plans: Plan[] = [
    // Nuevos planes económicos
    {
      id: 'pyme',
      name: 'PYME',
      priceMonthly: 19.97,
      priceAnnual: 199.97,
      description: 'Ideal para pequeñas empresas que inician',
      features: [
        'Una empresa',
        'Facturación básica',
        'Dashboard básico',
        'Inventario limitado (500)',
        'Soporte por email',
        'Prueba gratis 7 días'
      ],
      popular: false,
      color: 'from-sky-500 to-sky-600',
      icon: 'ri-building-line',
      category: 'contabilidad'
    },
    {
      id: 'pro',
      name: 'PRO',
      priceMonthly: 49.97,
      priceAnnual: 499.97,
      description: 'Para empresas en crecimiento',
      features: [
        'Hasta 3 empresas',
        'Contabilidad completa',
        'Dashboard básico',
        'Inventario limitado (2,000)',
        'Gestión bancaria básica',
        'Nómina básica (10 empleados)',
        'Soporte prioritario',
        'Prueba gratis 7 días'
      ],
      popular: true,
      color: 'from-blue-500 to-blue-600',
      icon: 'ri-rocket-line',
      category: 'contabilidad'
    },
    {
      id: 'plus',
      name: 'PLUS',
      priceMonthly: 99.97,
      priceAnnual: 999.97,
      description: 'Solución completa para empresas establecidas',
      features: [
        'Empresas ilimitadas',
        'Todas las funciones',
        'Dashboard KPI avanzado',
        'Inventario ilimitado',
        'Nómina completa',
        'Análisis financiero avanzado',
        'Reportes personalizados',
        'Soporte técnico especializado',
        'Soporte 24/7',
        'Prueba gratis 7 días'
      ],
      popular: false,
      color: 'from-purple-500 to-purple-600',
      icon: 'ri-vip-diamond-line',
      category: 'contabilidad'
    },
    // Planes existentes
    {
      id: 'facturacion-simple',
      name: 'Facturación Simple',
      priceMonthly: 349.97,
      priceAnnual: 2400,
      description: 'Ideal para negocios que inician con facturación básica',
      features: [
        '1 Usuario',
        '100 Facturas al mes',
        'Cotizaciones',
        '2 Plantillas de factura',
        'Notas de crédito/débito',
        'Reportes básicos'
      ],
      popular: false,
      color: 'from-teal-500 to-teal-600',
      icon: 'ri-file-text-line',
      category: 'facturacion'
    },
    {
      id: 'facturacion-premium',
      name: 'Facturación Premium',
      priceMonthly: 549.97,
      priceAnnual: 3700,
      description: 'Para empresas que necesitan más capacidad de facturación',
      features: [
        '8 Usuarios',
        '500 Facturas al mes',
        'Cotizaciones',
        '2 Plantillas de factura',
        '1 Almacén de inventario',
        'Notas de crédito/débito',
        'Reportes completos'
      ],
      popular: false,
      color: 'from-indigo-500 to-indigo-600',
      icon: 'ri-file-list-3-line',
      category: 'facturacion'
    },
    {
      id: 'pos-premium',
      name: 'POS Premium',
      priceMonthly: 1299.97,
      priceAnnual: 10000,
      description: 'Solución completa para puntos de venta y gestión empresarial',
      features: [
        'Dashboard completo',
        'Sistema POS',
        '30 Usuarios',
        'Productos ilimitados',
        '2 Almacenes de inventario',
        'Gestión de clientes',
        '2,000 Facturas electrónicas',
        'Backup cada 48 horas',
        'Caja chica',
        'Cálculo de comisiones',
        'Compras y gastos',
        'Proveedores',
        'Cuentas por cobrar',
        'Cuentas por pagar',
        'Nómina completa',
        'Multisucursal',
        'Servicio de reparaciones',
        'Cotizaciones',
        'Devoluciones'
      ],
      popular: false,
      color: 'from-emerald-500 to-emerald-600',
      icon: 'ri-store-2-line',
      category: 'pos'
    },
    {
      id: 'pos-super-plus',
      name: 'POS Super Plus',
      priceMonthly: 15000,
      priceAnnual: 150000,
      description: 'La solución más completa para grandes empresas',
      features: [
        'Dashboard completo',
        'Sistema POS',
        '300 Usuarios',
        'Productos ilimitados',
        '5 Almacenes de inventario',
        'Gestión de clientes',
        'Factura electrónica ilimitada',
        'Backup cada 48 horas',
        'Caja chica',
        'Cálculo de comisiones',
        'Compras y gastos',
        'Proveedores',
        'Cuentas por cobrar',
        'Cuentas por pagar',
        'Nómina completa',
        'Multisucursal',
        'Servicio de reparaciones',
        'Cotizaciones',
        'Devoluciones'
      ],
      popular: false,
      color: 'from-amber-500 to-orange-600',
      icon: 'ri-vip-crown-line',
      category: 'pos'
    }
  ];

  const handleSelectPlan = (planId: string) => {
    if (!canSelectPlan()) {
      return;
    }
    setSelectedPlan(planId);
    setShowPaymentModal(true);
  };

  const getPrice = (plan: Plan) => {
    return billingPeriod === 'monthly' ? plan.priceMonthly : plan.priceAnnual;
  };

  const getPeriodLabel = () => {
    return billingPeriod === 'monthly' ? '/mes' : '/año';
  };

  const getSavingsPercent = (plan: Plan) => {
    const annualIfMonthly = plan.priceMonthly * 12;
    const savings = ((annualIfMonthly - plan.priceAnnual) / annualIfMonthly) * 100;
    return Math.round(savings);
  };

  const handlePaymentSuccess = async () => {
    if (!selectedPlan) return;
    
    try {
      const result = await subscribeToPlan(selectedPlan);
      
      if (result.success) {
        setShowPaymentModal(false);
        const plan = plans.find(p => p.id === selectedPlan);
        setSuccessPlanName(plan?.name || 'tu nuevo plan');
        setShowSuccessModal(true);
        
        // Procesar comisión de referido
        try {
          const price = plan ? getPrice(plan) : 0;
          const ref = localStorage.getItem('ref_code') || '';
          const buyerId = user?.id || '';
          if (ref && buyerId && price > 0) {
            const refRow = await referralsService.getReferrerByCode(ref);
            if (refRow && refRow.user_id !== buyerId) {
              const commission = Number((price * 0.15).toFixed(2));
              await referralsService.createCommission({
                ref_code: ref,
                referee_user_id: buyerId,
                plan_id: selectedPlan,
                amount: commission,
                currency: 'DOP'
              });
            }
          }
        } catch {}
        
        // Auto-refresh después de 5 segundos para aplicar nuevos permisos
        setTimeout(() => {
          window.location.reload();
        }, 5000);
      } else {
        alert(result.error || 'Error al procesar el pago. Intente nuevamente.');
      }
    } catch (error) {
      console.error('Payment error:', error);
      alert('Error al procesar el pago. Intente nuevamente.');
    }
  };

  const trialStatus = getTrialStatus();
  const selectedPlanData = plans.find(plan => plan.id === selectedPlan);
  const contabilidadPlans = plans.filter(p => p.category === 'contabilidad');
  const facturacionPlans = plans.filter(p => p.category === 'facturacion');
  const posPlans = plans.filter(p => p.category === 'pos');

  const formatTimeLeft = () => {
    if (trialInfo.daysLeft > 0) {
      return `${trialInfo.daysLeft} días`;
    } else if (trialInfo.hoursLeft > 0) {
      return `${trialInfo.hoursLeft} horas`;
    } else if (trialInfo.minutesLeft > 0) {
      return `${trialInfo.minutesLeft} minutos`;
    } else {
      return 'Expirado';
    }
  };

  const formatMoney = (amount: number) => {
    return amount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const renderPlanCard = (plan: Plan) => (
    <div
      key={plan.id}
      className={`relative bg-white rounded-xl shadow-lg overflow-hidden border-2 transition-all duration-300 hover:shadow-xl ${
        plan.popular ? 'border-purple-500 scale-105 z-10' : 'border-gray-200 hover:border-navy-300'
      } ${!canSelectPlan() ? 'opacity-75' : ''}`}
    >
      {plan.popular && (
        <div className="absolute top-0 left-0 right-0 bg-gradient-to-r from-purple-500 to-purple-600 text-white text-center py-2 text-sm font-semibold">
          <i className="ri-star-fill mr-1"></i> Más Popular
        </div>
      )}

      <div className={`bg-gradient-to-r ${plan.color} p-6 text-white ${plan.popular ? 'pt-12' : ''}`}>
        <div className="text-center">
          <i className={`${plan.icon} text-4xl mb-3`}></i>
          <h3 className="text-xl font-bold mb-2">{plan.name}</h3>
          <div className="flex items-baseline justify-center mb-2">
            <span className="text-sm">RD$</span>
            <span className="text-3xl font-bold mx-1">{formatMoney(getPrice(plan))}</span>
            <span className="text-sm">{getPeriodLabel()}</span>
          </div>
          {billingPeriod === 'annual' && getSavingsPercent(plan) > 0 && (
            <div className="text-sm bg-white/20 px-3 py-1 rounded-full inline-block">
              Ahorra {getSavingsPercent(plan)}%
            </div>
          )}
        </div>
      </div>

      <div className="p-6">
        <p className="text-gray-600 text-sm mb-4 text-center">{plan.description}</p>
        
        <div className="max-h-64 overflow-y-auto mb-4">
          <ul className="space-y-2">
            {plan.features.map((feature, index) => (
              <li key={index} className="flex items-start">
                <i className="ri-check-line text-green-500 mr-2 mt-0.5 flex-shrink-0"></i>
                <span className="text-sm text-gray-700">{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        <button
          onClick={() => handleSelectPlan(plan.id)}
          disabled={!canSelectPlan()}
          className={`w-full py-3 px-4 rounded-lg font-semibold transition-all duration-200 ${
            !canSelectPlan()
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : plan.popular
              ? 'bg-gradient-to-r from-purple-500 to-purple-600 text-white hover:from-purple-600 hover:to-purple-700'
              : 'bg-gradient-to-r from-navy-600 to-navy-700 text-white hover:from-navy-700 hover:to-navy-800'
          }`}
        >
          {!canSelectPlan() ? 'Pago Requerido' : currentPlan?.active ? 'Cambiar Plan' : 'Seleccionar Plan'}
        </button>
      </div>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="bg-gradient-to-r from-navy-700 to-navy-800 rounded-lg p-6 text-white">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold mb-2">Planes y Suscripciones</h1>
              <p className="text-navy-200">Elige el plan perfecto para tu empresa</p>
            </div>
            <div className="text-right">
              {currentPlan?.active ? (
                <div className="bg-green-500/20 rounded-lg p-4 border border-green-400">
                  <div className="text-sm text-green-200">Plan Activo</div>
                  <div className="text-2xl font-bold text-green-100">{currentPlan.name}</div>
                  <div className="text-sm text-green-200">Suscripción activa</div>
                </div>
              ) : (
                <div className={`rounded-lg p-4 border ${
                  trialStatus === 'expired' 
                    ? 'bg-red-500/20 border-red-400' 
                    : trialStatus === 'warning'
                    ? 'bg-orange-500/20 border-orange-400'
                    : 'bg-white/10 border-white/20'
                }`}>
                  <div className="text-sm text-navy-200">
                    {trialStatus === 'expired' ? 'Prueba Expirada' : 'Prueba gratuita'}
                  </div>
                  <div className={`text-2xl font-bold ${
                    trialStatus === 'expired' ? 'text-red-200' : 'text-white'
                  }`}>
                    {formatTimeLeft()}
                  </div>
                  <div className="text-sm text-navy-200">
                    {trialStatus === 'expired' ? 'Suscríbete para continuar' : 'restantes'}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Billing Toggle */}
        <div className="flex justify-center">
          <div className="bg-white rounded-lg p-1 shadow-lg inline-flex">
            <button
              onClick={() => setBillingPeriod('monthly')}
              className={`px-6 py-2 rounded-md font-medium transition-all ${
                billingPeriod === 'monthly'
                  ? 'bg-navy-600 text-white'
                  : 'text-gray-600 hover:text-navy-600'
              }`}
            >
              Mensual
            </button>
            <button
              onClick={() => setBillingPeriod('annual')}
              className={`px-6 py-2 rounded-md font-medium transition-all flex items-center ${
                billingPeriod === 'annual'
                  ? 'bg-navy-600 text-white'
                  : 'text-gray-600 hover:text-navy-600'
              }`}
            >
              Anual
              <span className="ml-2 text-xs bg-green-500 text-white px-2 py-0.5 rounded-full">
                Ahorra más
              </span>
            </button>
          </div>
        </div>

        {/* Trial Status Alerts */}
        {trialStatus === 'warning' && (
          <div className="bg-gradient-to-r from-orange-500 to-red-500 rounded-lg p-4 text-white">
            <div className="flex items-center">
              <i className="ri-alarm-warning-line text-2xl mr-3"></i>
              <div>
                <h3 className="font-semibold">¡Tu prueba gratuita está por vencer!</h3>
                <p className="text-sm opacity-90">
                  Te quedan {formatTimeLeft()}. Selecciona un plan para continuar usando Contabi RD.
                </p>
              </div>
            </div>
          </div>
        )}

        {trialStatus === 'expired' && (
          <div className="bg-gradient-to-r from-red-500 to-red-600 rounded-lg p-6 text-white text-center">
            <i className="ri-lock-line text-4xl mb-3"></i>
            <h3 className="text-xl font-bold mb-2">Prueba gratuita expirada</h3>
            <p className="mb-4">
              Tu período de prueba ha terminado. Para continuar usando Contabi RD, 
              selecciona un plan de suscripción y completa el pago.
            </p>
          </div>
        )}

        {currentPlan?.active && (
          <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-lg p-4 text-white">
            <div className="flex items-center">
              <i className="ri-check-line text-2xl mr-3"></i>
              <div>
                <h3 className="font-semibold">¡Suscripción Activa!</h3>
                <p className="text-sm opacity-90">
                  Tienes acceso completo a todas las funciones del plan {currentPlan.name}.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Contabilidad Plans Section */}
        <div>
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              <i className="ri-calculator-line mr-2 text-sky-600"></i>
              Planes de Contabilidad
            </h2>
            <p className="text-gray-600">Soluciones integrales de contabilidad para tu empresa</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {contabilidadPlans.map(renderPlanCard)}
          </div>
        </div>

        {/* Facturación Plans Section */}
        <div>
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              <i className="ri-file-text-line mr-2 text-blue-600"></i>
              Planes de Facturación
            </h2>
            <p className="text-gray-600">Soluciones para facturación y cotizaciones</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {facturacionPlans.map(renderPlanCard)}
          </div>
        </div>

        {/* POS Plans Section */}
        <div>
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              <i className="ri-store-2-line mr-2 text-purple-600"></i>
              Planes POS Empresarial
            </h2>
            <p className="text-gray-600">Solución completa para puntos de venta y gestión empresarial</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {posPlans.map(renderPlanCard)}
          </div>
        </div>

        {/* Features Comparison for POS */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
            Comparación de Planes POS
          </h2>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left py-3 px-4 font-semibold text-gray-900">Características</th>
                  <th className="text-center py-3 px-4 font-semibold text-purple-600">POS Premium</th>
                  <th className="text-center py-3 px-4 font-semibold text-orange-600">POS Super Plus</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                <tr className="border-b border-gray-100">
                  <td className="py-3 px-4 font-medium">Usuarios</td>
                  <td className="py-3 px-4 text-center">80</td>
                  <td className="py-3 px-4 text-center font-bold text-orange-600">300</td>
                </tr>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <td className="py-3 px-4 font-medium">Almacenes de Inventario</td>
                  <td className="py-3 px-4 text-center">2</td>
                  <td className="py-3 px-4 text-center font-bold text-orange-600">5</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-3 px-4 font-medium">Facturas Electrónicas</td>
                  <td className="py-3 px-4 text-center">2,000/mes</td>
                  <td className="py-3 px-4 text-center font-bold text-orange-600">Ilimitadas</td>
                </tr>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <td className="py-3 px-4 font-medium">Dashboard</td>
                  <td className="py-3 px-4 text-center"><i className="ri-check-line text-green-500"></i></td>
                  <td className="py-3 px-4 text-center"><i className="ri-check-line text-green-500"></i></td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-3 px-4 font-medium">Sistema POS</td>
                  <td className="py-3 px-4 text-center"><i className="ri-check-line text-green-500"></i></td>
                  <td className="py-3 px-4 text-center"><i className="ri-check-line text-green-500"></i></td>
                </tr>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <td className="py-3 px-4 font-medium">Nómina</td>
                  <td className="py-3 px-4 text-center"><i className="ri-check-line text-green-500"></i></td>
                  <td className="py-3 px-4 text-center"><i className="ri-check-line text-green-500"></i></td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-3 px-4 font-medium">Multisucursal</td>
                  <td className="py-3 px-4 text-center"><i className="ri-check-line text-green-500"></i></td>
                  <td className="py-3 px-4 text-center"><i className="ri-check-line text-green-500"></i></td>
                </tr>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <td className="py-3 px-4 font-medium">Multimoneda</td>
                  <td className="py-3 px-4 text-center"><i className="ri-check-line text-green-500"></i></td>
                  <td className="py-3 px-4 text-center"><i className="ri-check-line text-green-500"></i></td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-3 px-4 font-medium">Backup cada 48 horas</td>
                  <td className="py-3 px-4 text-center"><i className="ri-check-line text-green-500"></i></td>
                  <td className="py-3 px-4 text-center"><i className="ri-check-line text-green-500"></i></td>
                </tr>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <td className="py-3 px-4 font-medium">Servicio de Reparaciones</td>
                  <td className="py-3 px-4 text-center"><i className="ri-check-line text-green-500"></i></td>
                  <td className="py-3 px-4 text-center"><i className="ri-check-line text-green-500"></i></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>


        {/* Payment Modal */}
        {showPaymentModal && selectedPlanData && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-gray-900">Confirmar Suscripción</h3>
                <button
                  onClick={() => setShowPaymentModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>

              <div className={`bg-gradient-to-r ${selectedPlanData.color} rounded-lg p-4 text-white mb-4`}>
                <div className="text-center">
                  <i className={`${selectedPlanData.icon} text-3xl mb-2`}></i>
                  <h4 className="text-lg font-bold">{selectedPlanData.name}</h4>
                  <div className="text-2xl font-bold">
                    RD${formatMoney(getPrice(selectedPlanData))}{getPeriodLabel()}
                  </div>
                  {billingPeriod === 'annual' && getSavingsPercent(selectedPlanData) > 0 && (
                    <div className="text-sm mt-1 bg-white/20 px-3 py-1 rounded-full inline-block">
                      Ahorra {getSavingsPercent(selectedPlanData)}% anual
                    </div>
                  )}
                </div>
              </div>

              {/* Features del plan seleccionado */}
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <h5 className="font-semibold text-gray-900 mb-3">Tu plan incluye:</h5>
                <div className="max-h-40 overflow-y-auto">
                  <ul className="space-y-2">
                    {selectedPlanData.features.map((feature, index) => (
                      <li key={index} className="flex items-start text-sm">
                        <i className="ri-check-line text-green-500 mr-2 mt-0.5 flex-shrink-0"></i>
                        <span className="text-gray-700">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {trialStatus === 'expired' && (
                <div className="bg-red-50 rounded-lg p-4 mb-4">
                  <div className="flex items-center text-red-800">
                    <i className="ri-alarm-warning-line mr-2"></i>
                    <span className="font-semibold">Período de prueba expirado</span>
                  </div>
                  <p className="text-sm text-red-600 mt-1">
                    Debes completar el pago para reactivar tu acceso a Contabi RD.
                  </p>
                </div>
              )}

              <Elements stripe={stripePromise}>
                <StripePaymentFormDirect
                  planId={selectedPlan}
                  planName={selectedPlanData.name}
                  amount={getPrice(selectedPlanData)}
                  onSuccess={handlePaymentSuccess}
                  onCancel={() => setShowPaymentModal(false)}
                  userId={user?.id || ''}
                  userEmail={user?.email || ''}
                />
              </Elements>
            </div>
          </div>
        )}

        {/* Modal de éxito */}
        {showSuccessModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Overlay */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            
            {/* Modal - más compacto */}
            <div className="relative bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden animate-in zoom-in-95 duration-200">
              {/* Header con gradiente verde - más pequeño */}
              <div className="bg-gradient-to-r from-green-500 to-emerald-500 p-4 text-center">
                <div className="w-14 h-14 mx-auto bg-white/20 rounded-full flex items-center justify-center mb-2 backdrop-blur-sm">
                  <i className="ri-check-line text-3xl text-white"></i>
                </div>
                <h3 className="text-lg font-bold text-white">¡Pago Exitoso!</h3>
                <p className="text-green-100 text-sm">Tu suscripción ha sido activada</p>
              </div>

              {/* Contenido - más compacto */}
              <div className="p-4">
                <div className="text-center mb-4">
                  <div className="inline-flex items-center justify-center w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full mb-2 shadow-md">
                    <i className="ri-vip-crown-2-fill text-xl text-white"></i>
                  </div>
                  <h4 className="text-base font-bold text-gray-900">
                    Bienvenido a {successPlanName}
                  </h4>
                  <p className="text-gray-600 text-sm">
                    Acceso completo a tu nuevo plan.
                  </p>
                </div>

                {/* Mensaje de refresh */}
                <div className="bg-amber-50 rounded-lg p-3 border border-amber-200 mb-3">
                  <div className="flex items-center">
                    <i className="ri-refresh-line text-amber-600 mr-2 animate-spin text-sm"></i>
                    <p className="text-xs text-amber-800">
                      El sistema se actualizará en unos segundos...
                    </p>
                  </div>
                </div>

                {/* Botón */}
                <button
                  onClick={() => window.location.reload()}
                  className="w-full px-3 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg font-medium text-sm hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md hover:shadow-lg flex items-center justify-center"
                >
                  <i className="ri-refresh-line mr-2"></i>
                  Actualizar Ahora
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
