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
    // Existing plans
    {
      id: 'facturacion-simple',
      name: 'Simple Invoicing',
      priceMonthly: 19.99,
      priceAnnual: 107.88,
      description: 'Ideal for businesses starting with basic invoicing',
      features: [
        '1 user',
        '100 invoices per month',
        'Quotations',
        '2 invoice templates',
        'Credit/debit notes',
        'Basic reports'
      ],
      popular: false,
      color: 'from-teal-500 to-teal-600',
      icon: 'ri-file-text-line',
      category: 'facturacion'
    },
    {
      id: 'facturacion-premium',
      name: 'Premium Invoicing',
      priceMonthly: 49.99,
      priceAnnual: 239.88,
      description: 'For companies that need higher invoicing capacity',
      features: [
        '8 users',
        '500 invoices per month',
        'Quotations',
        '2 invoice templates',
        '1 inventory warehouse',
        'Credit/debit notes',
        'Comprehensive reports'
      ],
      popular: false,
      color: 'from-indigo-500 to-indigo-600',
      icon: 'ri-file-list-3-line',
      category: 'facturacion'
    },
    {
      id: 'pos-premium',
      name: 'POS Premium',
      priceMonthly: 129.99,
      priceAnnual: 719.88,
      description: 'Complete solution for retail points of sale and business management',
      features: [
        'Full dashboard',
        'POS system',
        '30 users',
        'Unlimited products',
        '2 inventory warehouses',
        'Customer management',
        '2,000 electronic invoices',
        'Backup every 48 hours',
        'Petty cash',
        'Commission calculation',
        'Purchases and expenses',
        'Vendors',
        'Accounts receivable',
        'Accounts payable',
        'Full payroll',
        'Multi-branch',
        'Repair service',
        'Quotations',
        'Returns'
      ],
      popular: false,
      color: 'from-emerald-500 to-emerald-600',
      icon: 'ri-store-2-line',
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
    return billingPeriod === 'monthly' ? '/month' : '/year';
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
      return `${trialInfo.daysLeft} days`;
    } else if (trialInfo.hoursLeft > 0) {
      return `${trialInfo.hoursLeft} hours`;
    } else if (trialInfo.minutesLeft > 0) {
      return `${trialInfo.minutesLeft} minutes`;
    } else {
      return 'Expired';
    }
  };

  const formatMoney = (amount: number) => {
    return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const renderPlanCard = (plan: Plan) => (
    <div
      key={plan.id}
      className={`relative bg-[#FDFBF3] rounded-2xl shadow-lg overflow-hidden border-2 transition-all duration-300 hover:shadow-xl ${
        plan.popular ? 'border-[#9376C8] scale-105 z-10' : 'border-[#E0D8C2] hover:border-[#C6B383]'
      } ${!canSelectPlan() ? 'opacity-75' : ''}`}
    >
      {plan.popular && (
        <div className="absolute top-0 left-0 right-0 bg-gradient-to-r from-[#7A5CA8] to-[#5E3E88] text-white text-center py-2 text-sm font-semibold">
          <i className="ri-star-fill mr-1"></i> Most Popular
        </div>
      )}

      <div className={`bg-gradient-to-r ${plan.color} p-6 text-white ${plan.popular ? 'pt-12' : ''}`}>
        <div className="text-center">
          <i className={`${plan.icon} text-4xl mb-3`}></i>
          <h3 className="text-xl font-bold mb-2">{plan.name}</h3>
          <div className="flex items-baseline justify-center mb-2">
            <span className="text-sm">USD $</span>
            <span className="text-3xl font-bold mx-1">{formatMoney(getPrice(plan))}</span>
            <span className="text-sm">{getPeriodLabel()}</span>
          </div>
          {billingPeriod === 'annual' && getSavingsPercent(plan) > 0 && (
            <div className="text-sm bg-white/20 px-3 py-1 rounded-full inline-block">
              Save {getSavingsPercent(plan)}%
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
              ? 'bg-gradient-to-r from-[#7A5CA8] to-[#5E3E88] text-white hover:from-[#694B99] hover:to-[#4B316E]'
              : 'bg-gradient-to-r from-[#566738] to-[#3E4D2C] text-white hover:from-[#455532] hover:to-[#2F3C21]'
          }`}
        >
          {!canSelectPlan() ? 'Payment Required' : currentPlan?.active ? 'Change Plan' : 'Select Plan'}
        </button>
      </div>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#008000] to-[#008000] rounded-2xl p-6 text-white shadow-lg shadow-[#1F2616]/30 border border-[#2A351E]">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold mb-2">Plans & Subscriptions</h1>
              <p className="text-[#D7E5C1]">Choose the perfect plan for your business</p>
            </div>
            <div className="text-right">
              {currentPlan?.active ? (
                <div className="bg-[#314021] border border-[#5B7A3D] rounded-xl p-4 shadow-inner shadow-black/20">
                  <div className="text-sm text-[#CFE6AB]">Active Plan</div>
                  <div className="text-2xl font-bold text-white">{currentPlan.name}</div>
                  <div className="text-sm text-[#CFE6AB]">Subscription active</div>
                </div>
              ) : (
                <div className={`rounded-lg p-4 border ${
                  trialStatus === 'expired' 
                    ? 'bg-[#663030]/30 border-[#B85C5C]' 
                    : trialStatus === 'warning'
                    ? 'bg-[#7C6026]/25 border-[#CDA463]'
                    : 'bg-white/10 border-white/30'
                }`}>
                  <div className="text-sm text-[#D7E5C1]">
                    {trialStatus === 'expired' ? 'Trial expired' : 'Free trial'}
                  </div>
                  <div className={`text-2xl font-bold ${
                    trialStatus === 'expired' ? 'text-[#F8C1C1]' : 'text-white'
                  }`}>
                    {formatTimeLeft()}
                  </div>
                  <div className="text-sm text-[#D7E5C1]">
                    {trialStatus === 'expired' ? 'Subscribe to continue' : 'remaining'}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Billing Toggle */}
        <div className="flex justify-center">
          <div className="bg-[#F6F8ED] border border-[#E0E7C8] rounded-2xl p-1 shadow-md inline-flex">
            <button
              onClick={() => setBillingPeriod('monthly')}
              className={`px-6 py-2 rounded-xl font-medium transition-all ${
                billingPeriod === 'monthly'
                  ? 'bg-[#566738] text-white shadow shadow-[#566738]/40'
                  : 'text-[#5B6844] hover:text-[#384726]'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingPeriod('annual')}
              className={`px-6 py-2 rounded-xl font-medium transition-all flex items-center ${
                billingPeriod === 'annual'
                  ? 'bg-[#566738] text-white shadow shadow-[#566738]/40'
                  : 'text-[#5B6844] hover:text-[#384726]'
              }`}
            >
              Annual
              <span className="ml-2 text-xs bg-[#3E4D2C] text-white px-2 py-0.5 rounded-full">
                Save more
              </span>
            </button>
          </div>
        </div>

        {/* Trial Status Alerts */}
        {trialStatus === 'warning' && (
          <div className="rounded-2xl p-4 text-[#2B2A22] bg-[#F8E1B8] border border-[#F0C988] shadow">
            <div className="flex items-center">
              <i className="ri-alarm-warning-line text-2xl mr-3 text-[#8A5A1F]"></i>
              <div>
                <h3 className="font-semibold">Your free trial is almost over!</h3>
                <p className="text-sm opacity-90">
                  You have {formatTimeLeft()} left. Choose a plan to keep using Sendbillnow.
                </p>
              </div>
            </div>
          </div>
        )}

        {trialStatus === 'expired' && (
          <div className="rounded-2xl p-6 text-center text-[#3D1F1F] bg-[#F9D9D9] border border-[#D28A8A] shadow">
            <i className="ri-lock-line text-4xl mb-3 text-[#8F3D3D]"></i>
            <h3 className="text-xl font-bold mb-2">Free trial expired</h3>
            <p className="mb-4">
              Your trial period has ended. To continue using Sendbillnow, choose a subscription plan and complete payment.
            </p>
          </div>
        )}

        {currentPlan?.active && (
          <div className="bg-[#E1F3C9] border border-[#C4E09D] rounded-2xl p-4 text-[#1F2616] shadow">
            <div className="flex items-center">
              <i className="ri-check-line text-2xl mr-3 text-[#3B4A2A]"></i>
              <div>
                <h3 className="font-semibold">Subscription Active!</h3>
                <p className="text-sm opacity-90">
                  You have full access to every feature in the {currentPlan.name} plan.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Contabilidad Plans Section */}
        {contabilidadPlans.length > 0 && (
          <div className="bg-white rounded-2xl p-6 border border-[#E0E7C8] shadow-sm">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                <i className="ri-calculator-line mr-2 text-sky-600"></i>
                Accounting Plans
              </h2>
              <p className="text-gray-600">End-to-end accounting solutions for your business</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {contabilidadPlans.map(renderPlanCard)}
            </div>
          </div>
        )}

        {/* Facturación Plans Section */}
        <div className="bg-white rounded-2xl p-6 border border-[#E0E7C8] shadow-sm">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              <i className="ri-file-text-line mr-2 text-blue-600"></i>
              Invoicing Plans
            </h2>
            <p className="text-gray-600">Quoting and invoicing solutions</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {facturacionPlans.map(renderPlanCard)}
          </div>
        </div>

        {/* POS Plans Section */}
        <div className="bg-white rounded-2xl p-6 border border-[#E0E7C8] shadow-sm">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              <i className="ri-store-2-line mr-2 text-purple-600"></i>
              POS Plans for Businesses
            </h2>
            <p className="text-gray-600">Complete solution for retail points of sale and business management</p>
          </div>
          <div className="grid grid-cols-1 gap-6 max-w-md mx-auto">
            {posPlans.map(renderPlanCard)}
          </div>
        </div>

        

        {/* Payment Modal */}
        {showPaymentModal && selectedPlanData && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-gray-900">Confirm Subscription</h3>
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
                    USD ${formatMoney(getPrice(selectedPlanData))}{getPeriodLabel()}
                  </div>
                  {billingPeriod === 'annual' && getSavingsPercent(selectedPlanData) > 0 && (
                    <div className="text-sm mt-1 bg-white/20 px-3 py-1 rounded-full inline-block">
                      Save {getSavingsPercent(selectedPlanData)}% annually
                    </div>
                  )}
                </div>
              </div>

              {/* Selected plan features */}
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <h5 className="font-semibold text-gray-900 mb-3">Your plan includes:</h5>
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
                    <span className="font-semibold">Trial period expired</span>
                  </div>
                  <p className="text-sm text-red-600 mt-1">
                    Complete the payment to reactivate your Sendbillnow access.
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

        {/* Success modal */}
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
                <h3 className="text-lg font-bold text-white">Payment Successful!</h3>
                <p className="text-green-100 text-sm">Your subscription has been activated</p>
              </div>

              {/* Contenido - más compacto */}
              <div className="p-4">
                <div className="text-center mb-4">
                  <div className="inline-flex items-center justify-center w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full mb-2 shadow-md">
                    <i className="ri-vip-crown-2-fill text-xl text-white"></i>
                  </div>
                  <h4 className="text-base font-bold text-gray-900">
                    Welcome to {successPlanName}
                  </h4>
                  <p className="text-gray-600 text-sm">
                    You now have full access to your new plan.
                  </p>
                </div>

                {/* Refresh message */}
                <div className="bg-amber-50 rounded-lg p-3 border border-amber-200 mb-3">
                  <div className="flex items-center">
                    <i className="ri-refresh-line text-amber-600 mr-2 animate-spin text-sm"></i>
                    <p className="text-xs text-amber-800">
                      The system will refresh in a few seconds...
                    </p>
                  </div>
                </div>

                {/* Button */}
                <button
                  onClick={() => window.location.reload()}
                  className="w-full px-3 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg font-medium text-sm hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md hover:shadow-lg flex items-center justify-center"
                >
                  <i className="ri-refresh-line mr-2"></i>
                  Refresh Now
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
