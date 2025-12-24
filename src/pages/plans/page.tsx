import { useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { usePlans } from '../../hooks/usePlans';
import { useAuth } from '../../hooks/useAuth';
import { notifyPlanPurchase } from '../../utils/notify';
import { referralsService } from '../../services/database';
import { Elements } from '@stripe/react-stripe-js';
import { getStripe } from '../../services/stripe';
import StripePaymentFormDirect from '../../components/StripePaymentFormDirect';

interface Plan {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  period: string;
  description: string;
  features: string[];
  popular: boolean;
  color: string;
  icon: string;
}

export default function PlansPage() {
  const [selectedPlan, setSelectedPlan] = useState<string>('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
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
    {
      id: 'pyme',
      name: 'PYME',
      price: 19.97,
      period: '/mes',
      description: 'Perfecto para pequeñas empresas',
      features: [
        'Una empresa',
        'Facturación básica con NCF',
        'Reportes DGII básicos',
        'Inventario hasta 500 productos',
        'Dashboard KPI avanzado',
        'Soporte por email',
        'Backup diario',
        'Gestion de activos fijos'
      ],
      popular: false,
      color: 'from-blue-500 to-blue-600',
      icon: 'ri-building-2-line'
    },
    {
      id: 'pro',
      name: 'PRO',
      price: 49.97,
      period: '/mes',
      description: 'Para empresas en crecimiento',
      features: [
        'Hasta 3 empresas',
        'Contabilidad completa',
        'Todos los reportes DGII',
        'Inventario hasta 2,000 productos',
        'Dashboard KPI avanzado',
        'Gestión bancaria básica',
        'Nómina básica (hasta 10 empleados)',
        'Soporte prioritario',
        'Gestión de activos fijos '
      ],
      popular: true,
      color: 'from-indigo-500 to-indigo-600',
      icon: 'ri-rocket-line'
    },
    {
      id: 'plus',
      name: 'PLUS',
      price: 99.97,
      period: '/mes',
      description: 'Solución empresarial completa',
      features: [
        'Empresas ilimitadas',
        'Todas las funciones contables',
        'Dashboard KPI avanzado',
        'Inventario ilimitado',
        'Nómina completa (empleados ilimitados)',
        'Reportes avanzados',
        'Soporte prioritario',
        'Backup automático',
        'Multi-sucursal',
        'Facturación electrónica',
        'Conciliación bancaria',
        'Gestión de activos fijos'
      ],
      popular: false,
      color: 'from-purple-500 to-purple-600',
      icon: 'ri-vip-crown-line'
    }
  ];

  const handleSelectPlan = (planId: string) => {
    if (!canSelectPlan()) {
      return;
    }
    setSelectedPlan(planId);
    setShowPaymentModal(true);
  };

  const handlePaymentSuccess = async () => {
    if (!selectedPlan) return;
    
    try {
      const result = await subscribeToPlan(selectedPlan);
      
      if (result.success) {
        setShowPaymentModal(false);
        alert('¡Suscripción exitosa! Bienvenido a Contabi RD.');
        try {
          const plan = plans.find(p => p.id === selectedPlan);
          await notifyPlanPurchase({
            to: '+18299411224',
            userEmail: user?.email || 'desconocido',
            planId: selectedPlan,
            planName: plan?.name || selectedPlan,
            amount: plan?.price ?? 0,
            method: 'stripe',
            purchasedAt: new Date().toISOString(),
          });
          // Atribuir comisión por referido (15%) si aplica
          try {
            const ref = localStorage.getItem('ref_code') || '';
            const buyerId = user?.id || '';
            const planAmount = plan?.price ?? 0;
            if (ref && buyerId && planAmount > 0) {
              const refRow = await referralsService.getReferrerByCode(ref);
              if (refRow && refRow.user_id !== buyerId) {
                const commission = Number((planAmount * 0.15).toFixed(2));
                await referralsService.createCommission({
                  ref_code: ref,
                  referee_user_id: buyerId,
                  plan_id: selectedPlan,
                  amount: commission,
                  currency: 'USD'
                });
              }
            }
          } catch {}
        } catch {}
      } else {
        alert(result.error || 'Error al procesar el pago. Intente nuevamente.');
      }
    } catch (error) {
      console.error('Payment error:', error);
      alert('Error al procesar el pago. Intente nuevamente.');
    }
  };

  const trialStatus = getTrialStatus();
  const visiblePlans = plans.filter(plan => plan.id !== 'student');
  const selectedPlanData = plans.find(plan => plan.id === selectedPlan);

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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-navy-700 to-navy-800 rounded-lg p-6 text-white">
          <div className="flex items-center justify-between">
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
              Tu período de prueba de 15 días ha terminado. Para continuar usando Contabi RD, 
              selecciona un plan de suscripción y completa el pago.
            </p>
            <div className="bg-red-600/50 rounded-lg p-3 text-sm">
              <strong>Importante:</strong> Todas las funciones están bloqueadas hasta que completes tu suscripción.
            </div>
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

        {/* Plans Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`relative bg-white rounded-xl shadow-lg overflow-hidden border-2 transition-all duration-300 hover:shadow-xl ${
                plan.popular ? 'border-indigo-500 scale-105' : 'border-gray-200 hover:border-navy-300'
              } ${!canSelectPlan() ? 'opacity-75' : ''}`}
            >
              {plan.popular && (
                <div className="absolute top-0 left-0 right-0 bg-gradient-to-r from-indigo-500 to-indigo-600 text-white text-center py-2 text-sm font-semibold">
                  Más Popular
                </div>
              )}

              <div className={`bg-gradient-to-r ${plan.color} p-6 text-white ${plan.popular ? 'pt-12' : ''}`}>
                <div className="text-center">
                  <i className={`${plan.icon} text-4xl mb-3`}></i>
                  <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                  <div className="flex items-baseline justify-center mb-2">
                    <span className="text-3xl font-bold">${plan.price}</span>
                    <span className="text-lg ml-1">{plan.period}</span>
                  </div>
                  {plan.originalPrice && (
                    <div className="text-sm opacity-75">
                      <span className="line-through">${plan.originalPrice}</span>
                      <span className="ml-2 bg-white/20 px-2 py-1 rounded">80% OFF</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-6">
                <p className="text-gray-600 text-sm mb-4">{plan.description}</p>
                
                <ul className="space-y-3 mb-6">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start">
                      <i className="ri-check-line text-green-500 mr-2 mt-0.5 flex-shrink-0"></i>
                      <span className="text-sm text-gray-700">{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSelectPlan(plan.id)}
                  disabled={!canSelectPlan()}
                  className={`w-full py-3 px-4 rounded-lg font-semibold transition-all duration-200 whitespace-nowrap ${
                    !canSelectPlan()
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : plan.popular
                      ? 'bg-gradient-to-r from-indigo-500 to-indigo-600 text-white hover:from-indigo-600 hover:to-indigo-700'
                      : 'bg-gradient-to-r from-navy-600 to-navy-700 text-white hover:from-navy-700 hover:to-navy-800'
                  }`}
                >
                  {!canSelectPlan() ? 'Pago Requerido' : currentPlan?.active ? 'Cambiar Plan' : 'Seleccionar Plan'}
                </button>

                <div className="text-center mt-3">
                  <span className="text-xs text-gray-500">
                    {!canSelectPlan() ? 'Completa el pago para continuar' : '15 días de prueba gratuita'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Features Comparison */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
            Comparación de Características
          </h2>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left py-3 px-4 font-semibold text-gray-900">Características</th>
                  {visiblePlans.map((plan) => (
                    <th key={plan.id} className="text-center py-3 px-4 font-semibold text-gray-900">
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-sm">
                <tr className="border-b border-gray-100">
                  <td className="py-3 px-4 font-medium">Número de empresas</td>
                  <td className="py-3 px-4 text-center">1</td>
                  <td className="py-3 px-4 text-center">3</td>
                  <td className="py-3 px-4 text-center">Ilimitadas</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-3 px-4 font-medium">Usuarios</td>
                  <td className="py-3 px-4 text-center">2</td>
                  <td className="py-3 px-4 text-center">5</td>
                  <td className="py-3 px-4 text-center">Ilimitados</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-3 px-4 font-medium">Productos en inventario</td>
                  <td className="py-3 px-4 text-center">500</td>
                  <td className="py-3 px-4 text-center">2,000</td>
                  <td className="py-3 px-4 text-center">Ilimitados</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-3 px-4 font-medium">Dashboard</td>
                  <td className="py-3 px-4 text-center">KPI Avanzado</td>
                  <td className="py-3 px-4 text-center">KPI Avanzado</td>
                  <td className="py-3 px-4 text-center">KPI Avanzado</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-3 px-4 font-medium">Empleados en nómina</td>
                  <td className="py-3 px-4 text-center">N/A</td>
                  <td className="py-3 px-4 text-center">10</td>
                  <td className="py-3 px-4 text-center">Ilimitados</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-3 px-4 font-medium">Gestión Bancaria</td>
                  <td className="py-3 px-4 text-center"><i className="ri-close-line text-red-500"></i></td>
                  <td className="py-3 px-4 text-center"><i className="ri-check-line text-green-500"></i></td>
                  <td className="py-3 px-4 text-center"><i className="ri-check-line text-green-500"></i></td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-3 px-4 font-medium">Análisis financiero avanzado</td>
                  <td className="py-3 px-4 text-center"><i className="ri-close-line text-red-500"></i></td>
                  <td className="py-3 px-4 text-center"><i className="ri-close-line text-red-500"></i></td>
                  <td className="py-3 px-4 text-center"><i className="ri-check-line text-green-500"></i></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Payment Modal */}
        {showPaymentModal && selectedPlanData && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-gray-900">Confirmar Suscripción</h3>
                <button
                  onClick={() => setShowPaymentModal(false)}
                  disabled={isProcessingPayment}
                  className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>

              <div className={`bg-gradient-to-r ${selectedPlanData.color} rounded-lg p-4 text-white mb-4`}>
                <div className="text-center">
                  <i className={`${selectedPlanData.icon} text-3xl mb-2`}></i>
                  <h4 className="text-lg font-bold">{selectedPlanData.name}</h4>
                  <div className="text-2xl font-bold">${selectedPlanData.price}{selectedPlanData.period}</div>
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
                  amount={selectedPlanData.price}
                  onSuccess={handlePaymentSuccess}
                  onCancel={() => setShowPaymentModal(false)}
                  userId={user?.id || ''}
                  userEmail={user?.email || ''}
                />
              </Elements>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
