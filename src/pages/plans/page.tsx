import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { usePlans } from '../../hooks/usePlans';
import { useAuth } from '../../hooks/useAuth';
import { referralsService } from '../../services/database';

interface Plan {
  id: string;
  name: string;
  tagline?: string;
  priceMonthly: number;
  priceAnnual: number;
  priceBiennial?: number;
  billingPeriodOverride?: 'annual' | 'biennial';
  description: string;
  features: string[];
  popular: boolean;
  color: string;
  icon: string;
  category: 'contabilidad' | 'pos';
}

export default function PlansPage() {
  const navigate = useNavigate();
  const [selectedPlan, setSelectedPlan] = useState<string>('');
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('monthly');
  const [contractorBillingPeriod, setContractorBillingPeriod] = useState<'annual' | 'biennial'>('annual');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successPlanName, setSuccessPlanName] = useState('');
  const [isRedirectingToStripe, setIsRedirectingToStripe] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
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
      id: 'student',
      name: 'Contractor Subscription Plan',
      tagline: 'The Perfect Resource for a Contractor!',
      priceMonthly: 0,
      priceAnnual: 85.0,
      priceBiennial: 119.99,
      billingPeriodOverride: 'annual',
      description: 'Annual plan for students with limited module access',
      features: [
        'Dashboard access',
        'Create invoices',
        'Customers (AR) module',
        'Suppliers (AP) module',
        'Products & Inventory',
        'Inventory reports',
        'Settings access',
      ],
      popular: false,
      color: 'from-[#001B9E] to-[#001B9E]',
      icon: 'ri-graduation-cap-line',
      category: 'contabilidad'
    },
    {
      id: 'student-biennial',
      name: 'Contractor Subscription Plan',
      tagline: 'The Perfect Resource for a Contractor!',
      priceMonthly: 0,
      priceAnnual: 119.99,
      priceBiennial: 119.99,
      billingPeriodOverride: 'biennial',
      description: 'Annual plan for students with limited module access',
      features: [
        'Dashboard access',
        'Create invoices',
        'Customers (AR) module',
        'Suppliers (AP) module',
        'Products & Inventory',
        'Inventory reports',
        'Settings access',
      ],
      popular: false,
      color: 'from-[#001B9E] to-[#001B9E]',
      icon: 'ri-graduation-cap-line',
      category: 'contabilidad'
    },
    {
      id: 'pos-basic',
      name: 'Basic Plan',
      priceMonthly: 99.99,
      priceAnnual: 839.92,
      description: 'Essential POS features for small businesses',
      features: [
        'Full dashboard',
        'POS system',
        '3 users',
        'Unlimited products',
        '1 inventory warehouse',
        'Customer management',
        '2,000 electronic invoices',
        'Backup every 48 hours'
      ],
      popular: false,
      color: 'from-lime-500 to-lime-600',
      icon: 'ri-store-2-line',
      category: 'pos'
    },
    {
      id: 'pos-premium',
      name: 'Premium Plan',
      priceMonthly: 399.99,
      priceAnnual: 3359.92,
      description: 'Complete POS System, Inventory Control and Payroll Management, all in one Stop',
      features: [
        'Full dashboard',
        'POS system',
        'Unlimited users',
        'Unlimited products',
        'Unlimited inventory warehouses',
        'Customer management',
        'Unlimited electronic invoices',
        'Backup every 48 hours'
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

    if ((planId === 'student' || planId === 'student-biennial') && billingPeriod !== 'annual') {
      return;
    }

    if (planId === 'student-biennial') {
      setContractorBillingPeriod('biennial');
    } else if (planId === 'student') {
      setContractorBillingPeriod('annual');
    }

    if (!user?.id) {
      try {
        const normalizedPlanId = planId === 'student-biennial' ? 'student' : planId;
        const normalizedBilling = planId === 'student-biennial' ? 'biennial' : planId === 'student' ? 'annual' : billingPeriod;
        localStorage.setItem('selected_plan', normalizedPlanId);
        localStorage.setItem('selected_billing', normalizedBilling);
      } catch {}
      navigate(`/auth/register?plan=${encodeURIComponent(planId)}`);
      return;
    }
    setSelectedPlan(planId);
    setShowPaymentModal(true);
  };

  const startStripeCheckout = async () => {
    if (!selectedPlanData) return;
    if (!user?.id || !user?.email) {
      setCheckoutError('You must be logged in to continue.');
      return;
    }

    setCheckoutError(null);
    setIsRedirectingToStripe(true);
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL?.trim() || '';
      const resp = await fetch(`${apiBase}/api/create-checkout-session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          planId: selectedPlanData.id === 'student-biennial' ? 'student' : selectedPlanData.id,
          billingPeriod: selectedPlanData.id === 'student-biennial' ? 'biennial' : selectedPlanData.id === 'student' ? 'annual' : billingPeriod,
          userId: user.id,
          userEmail: user.email,
        }),
      });

      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data?.url) {
        throw new Error(data?.error || 'Could not start Stripe Checkout.');
      }

      window.location.href = data.url;
    } catch (error: any) {
      setCheckoutError(error?.message || 'Could not start Stripe Checkout.');
      setIsRedirectingToStripe(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');
    const sessionId = params.get('session_id');

    if (!checkout) return;

    const cleanupQuery = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete('checkout');
      url.searchParams.delete('session_id');
      window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
    };

    if (checkout === 'cancel') {
      cleanupQuery();
      setIsRedirectingToStripe(false);
      setCheckoutError(null);
      return;
    }

    if (checkout !== 'success' || !sessionId) {
      cleanupQuery();
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const apiBase = import.meta.env.VITE_API_BASE_URL?.trim() || '';
        const resp = await fetch(`${apiBase}/api/get-checkout-session`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        });

        const data = await resp.json().catch(() => null);
        if (!resp.ok || !data?.session) {
          throw new Error(data?.error || 'Could not verify Stripe Checkout session.');
        }

        const session = data.session;
        const planId = session?.metadata?.planId ? String(session.metadata.planId) : '';
        const clientRef = session?.client_reference_id ? String(session.client_reference_id) : '';
        const status = session?.status ? String(session.status) : '';

        if (clientRef && user?.id && clientRef !== user.id) {
          throw new Error('Checkout session does not match the current user.');
        }

        if (status !== 'complete') {
          throw new Error('Payment not completed.');
        }

        if (!planId) {
          throw new Error('Missing planId in Stripe metadata.');
        }

        if (cancelled) return;
        setSelectedPlan(planId);
        await handlePaymentSuccess();
      } catch (error: any) {
        if (cancelled) return;
        setCheckoutError(error?.message || 'Could not finalize payment.');
      } finally {
        if (!cancelled) {
          setIsRedirectingToStripe(false);
          cleanupQuery();
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const getPrice = (plan: Plan) => {
    if (billingPeriod === 'monthly') return plan.priceMonthly;
    return plan.priceAnnual;
  };

  const getPeriodLabel = () => {
    if (billingPeriod === 'monthly') return '/monthly';
    return '/yearly';
  };

  const getContractorLabel = (plan: Plan) => {
    if (plan.billingPeriodOverride === 'biennial') return 'every two years';
    return 'yearly';
  };

  const getContractorOriginalPrice = (plan: Plan) => {
    if (plan.billingPeriodOverride === 'biennial') {
      const base = plan.priceBiennial ?? plan.priceAnnual;
      return base / 0.7;
    }
    return plan.priceAnnual / 0.7;
  };

  const getContractorSavings = (plan: Plan) => {
    const original = getContractorOriginalPrice(plan);
    const base = plan.billingPeriodOverride === 'biennial'
      ? (plan.priceBiennial ?? plan.priceAnnual)
      : plan.priceAnnual;
    return original - base;
  };

  const getSavingsPercent = (plan: Plan) => {
    if (!plan.priceMonthly || plan.priceMonthly <= 0) return 0;
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
  const posPlans = plans.filter(p => p.category === 'pos');
  const accountingPlans = plans.filter(p => p.category === 'contabilidad');

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
      className={`bg-white rounded-2xl shadow-lg overflow-hidden border border-[#E0E7C8] hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 ${
        plan.popular ? 'ring-2 ring-purple-500 ring-opacity-50' : ''
      }`}
    >
      {plan.popular && (
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white text-center py-2 text-sm font-semibold">
          Most Popular
        </div>
      )}

      <div className={`bg-gradient-to-r ${plan.color} p-6 text-white ${plan.popular ? 'pt-12' : ''}`}>
        <div className="text-center">
          {plan.id === 'student' || plan.id === 'student-biennial' ? (
            <svg
              viewBox="0 0 64 64"
              className="w-10 h-10 mx-auto mb-3 text-white"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M16 28c0-9 7-16 16-16s16 7 16 16"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <path
                d="M18 28h28"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <path d="M26 12v7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              <path d="M38 12v7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              <path
                d="M24 29c0 6 3.6 10 8 10s8-4 8-10"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <path
                d="M14 54c2.5-9 9.5-14 18-14s15.5 5 18 14"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M20 54V48l12 6 12-6v6"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <path d="M32 43v11" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          ) : (
            <i className={`${plan.icon} text-4xl mb-3`}></i>
          )}
          <h3 className="text-xl font-bold mb-2">{plan.name}</h3>
          {billingPeriod === 'monthly' ? (
            <div className="flex items-baseline justify-center mb-2">
              <span className="text-3xl font-bold">${formatMoney(plan.priceMonthly)}{getPeriodLabel()}</span>
            </div>
          ) : (
            <div className="mb-2">
              <div className="flex items-baseline justify-center">
                <span className="text-3xl font-bold">
                  ${formatMoney((plan.id === 'student' || plan.id === 'student-biennial') ? getPrice(plan) : plan.priceAnnual)}/{(plan.id === 'student' || plan.id === 'student-biennial') ? getContractorLabel(plan) : 'yearly'}
                </span>
              </div>
              {(plan.id === 'student' || plan.id === 'student-biennial') && (
                <div className="mt-3 text-[17px] font-extrabold tracking-wide">
                  {plan.tagline || ''}
                </div>
              )}
              {(plan.id === 'student' || plan.id === 'student-biennial') ? null : (
                <div className="text-sm bg-white/20 px-3 py-1 rounded-full inline-block mt-2">
                  30% OFF - Save ${formatMoney((plan.id === 'student' || plan.id === 'student-biennial') ? getContractorSavings(plan) : ((plan.priceMonthly * 12) - plan.priceAnnual))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="p-6">
        <p className="text-gray-600 text-sm mb-4 text-center">
          {(plan.id === 'student' || plan.id === 'student-biennial') ? '' : plan.description}
        </p>

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
          disabled={!canSelectPlan() || ((plan.id === 'student' || plan.id === 'student-biennial') && billingPeriod === 'monthly')}
          className={`w-full py-3 px-4 rounded-lg font-semibold transition-all duration-200 ${
            !canSelectPlan() || ((plan.id === 'student' || plan.id === 'student-biennial') && billingPeriod === 'monthly')
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : plan.popular
              ? 'bg-gradient-to-r from-[#7A5CA8] to-[#5E3E88] text-white hover:from-[#694B99] hover:to-[#4B316E]'
              : plan.id === 'student' || plan.id === 'student-biennial'
              ? 'bg-gradient-to-r from-[#001B9E] to-[#001B9E] text-white hover:from-[#00157A] hover:to-[#00157A]'
              : 'bg-gradient-to-r from-[#566738] to-[#3E4D2C] text-white hover:from-[#455532] hover:to-[#2F3C21]'
          }`}
        >
          {!canSelectPlan()
            ? 'Payment Required'
            : (plan.id === 'student' || plan.id === 'student-biennial') && billingPeriod === 'monthly'
            ? 'Annual Only'
            : currentPlan?.active
            ? 'Change Plan'
            : 'Select Plan'}
        </button>

        {plan.id === 'student' && trialStatus !== 'expired' && (
          <div className="mt-3 text-center">
            <Link
              to="/auth/register?plan=student&trial=1"
              onClick={() => {
                try {
                  localStorage.setItem('selected_plan', 'student');
                  localStorage.setItem('selected_billing', 'annual');
                  localStorage.setItem('contard_trial_intent', '1');
                } catch {}
              }}
              className="inline-block pointer-events-auto text-[#001B9E] font-semibold text-sm underline underline-offset-4 hover:text-[#00157A] transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#001B9E]/40 focus-visible:ring-offset-2 rounded"
            >
              TRY IT FREE FOR 15 DAYS!
            </Link>
          </div>
        )}
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
                Save 30%
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

        {/* POS Plans Section */}
        <div className="bg-white rounded-2xl p-6 border border-[#E0E7C8] shadow-sm">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              <i className="ri-store-2-line mr-2 text-purple-600"></i>
              Smart POS Price Plans for your Business
            </h2>
            <p className="text-gray-600">A Complete Point of Sale Smart System, in one Stop! This help your Business Rise to the next level.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {posPlans.map(renderPlanCard)}
          </div>
        </div>

        {/* Accounting Plans Section */}
        <div className="bg-white rounded-2xl p-6 border border-[#E0E7C8] shadow-sm">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              <i className="ri-book-2-line mr-2 text-blue-600"></i>
              All types of contractor
            </h2>
            <p className="text-gray-600">Choose a plan with accounting and billing modules.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {accountingPlans.map(renderPlanCard)}
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
                  {selectedPlanData.id === 'student' ? (
                    <svg
                      viewBox="0 0 64 64"
                      className="w-9 h-9 mx-auto mb-2 text-white"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      aria-hidden="true"
                    >
                      <path
                        d="M16 28c0-9 7-16 16-16s16 7 16 16"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                      />
                      <path
                        d="M18 28h28"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                      />
                      <path
                        d="M26 12v7"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                      />
                      <path
                        d="M38 12v7"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                      />
                      <path
                        d="M24 29c0 6 3.6 10 8 10s8-4 8-10"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                      />
                      <path
                        d="M14 54c2.5-9 9.5-14 18-14s15.5 5 18 14"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M20 54V48l12 6 12-6v6"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path d="M32 43v11" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                  ) : (
                    <i className={`${selectedPlanData.icon} text-3xl mb-2`}></i>
                  )}
                  <h4 className="text-lg font-bold">{selectedPlanData.name}</h4>
                  <div className="text-2xl font-bold">
                    ${formatMoney(getPrice(selectedPlanData))}{selectedPlanData.id === 'student' && contractorBillingPeriod === 'biennial' ? '/every two years' : getPeriodLabel()}
                  </div>
                  {billingPeriod === 'annual' && getSavingsPercent(selectedPlanData) > 0 && (
                    <div className="text-sm mt-1 bg-white/20 px-3 py-1 rounded-full inline-block">
                      Save {getSavingsPercent(selectedPlanData)}%
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

              {checkoutError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
                  <div className="flex items-center">
                    <i className="ri-error-warning-line text-xl mr-2"></i>
                    <span className="text-sm">{checkoutError}</span>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  disabled={isRedirectingToStripe}
                  className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={startStripeCheckout}
                  disabled={isRedirectingToStripe}
                  className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center"
                >
                  {isRedirectingToStripe ? (
                    <>
                      <i className="ri-loader-4-line animate-spin mr-2"></i>
                      Redirecting...
                    </>
                  ) : (
                    <>
                      <i className="ri-secure-payment-line mr-2"></i>
                      Pay with Stripe
                    </>
                  )}
                </button>
              </div>
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
