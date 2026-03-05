import { useState } from 'react';

interface InitialPlanSelectionModalProps {
  onPlanSelected: (planId: string) => void;
}

export default function InitialPlanSelectionModal({ onPlanSelected }: InitialPlanSelectionModalProps) {
  const [selectedPlan, setSelectedPlan] = useState<string>('');

  const plans = [
    {
      id: 'facturacion-simple',
      name: 'Simple Billing',
      description: 'Ideal for businesses starting with basic billing',
      icon: 'ri-file-text-line',
      color: 'from-blue-500 to-blue-600',
      features: [
        '1 User',
        '100 invoices per month',
        'Quotes',
        'Basic reports'
      ]
    },
    {
      id: 'facturacion-premium',
      name: 'Premium Billing',
      description: 'For companies that need more capacity',
      icon: 'ri-file-list-3-line',
      color: 'from-indigo-500 to-indigo-600',
      features: [
        '8 Users',
        '500 invoices per month',
        '1 inventory warehouse',
        'Full reports'
      ]
    },
    {
      id: 'pos-basic',
      name: 'POS Basic',
      description: 'Essential POS features for small businesses',
      icon: 'ri-store-2-line',
      color: 'from-lime-500 to-lime-600',
      features: [
        '3 Users',
        'Full POS system',
        '1 inventory warehouse',
        'Unlimited products'
      ]
    },
    {
      id: 'pos-premium',
      name: 'POS Premium',
      description: 'Complete solution for point of sale',
      icon: 'ri-store-2-line',
      color: 'from-purple-500 to-purple-600',
      features: [
        'Unlimited Users',
        'Full POS system',
        'Unlimited inventory warehouses',
        'Unlimited products'
      ],
      popular: true
    },
    {
      id: 'pos-super-plus',
      name: 'POS Super Plus',
      description: 'The most complete solution for large companies',
      icon: 'ri-vip-crown-line',
      color: 'from-amber-500 to-orange-600',
      features: [
        '300 Users',
        'Everything unlimited',
        '5 warehouses',
        'Maximum capacity'
      ]
    }
  ];

  const handleConfirm = () => {
    if (selectedPlan) {
      onPlanSelected(selectedPlan);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-8 text-center">
          <div className="w-20 h-20 mx-auto bg-white/20 rounded-full flex items-center justify-center mb-4 backdrop-blur-sm">
            <i className="ri-gift-line text-4xl text-white"></i>
          </div>
          <h2 className="text-3xl font-bold text-white mb-2">Welcome to Sendbillnow!</h2>
          <p className="text-blue-100 text-lg">Select your plan and start your 15-day free trial</p>
          <div className="mt-4 inline-flex items-center bg-white/20 rounded-full px-4 py-2">
            <i className="ri-timer-line text-white mr-2"></i>
            <span className="text-white font-semibold">15 days free • No credit card</span>
          </div>
        </div>

        {/* Content */}
        <div className="p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {plans.map((plan) => (
              <div
                key={plan.id}
                onClick={() => setSelectedPlan(plan.id)}
                className={`relative border-2 rounded-xl p-6 cursor-pointer transition-all ${
                  selectedPlan === plan.id
                    ? 'border-blue-600 bg-blue-50 shadow-lg scale-105'
                    : 'border-gray-200 hover:border-blue-300 hover:shadow-md'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 right-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                    MOST POPULAR
                  </div>
                )}
                
                <div className="flex items-center mb-4">
                  <div className={`w-12 h-12 rounded-lg bg-gradient-to-r ${plan.color} flex items-center justify-center mr-4`}>
                    <i className={`${plan.icon} text-2xl text-white`}></i>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-gray-900">{plan.name}</h3>
                    <p className="text-sm text-gray-600">{plan.description}</p>
                  </div>
                  {selectedPlan === plan.id && (
                    <i className="ri-checkbox-circle-fill text-3xl text-blue-600"></i>
                  )}
                </div>

                <ul className="space-y-2">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-center text-sm text-gray-700">
                      <i className="ri-check-line text-green-500 mr-2"></i>
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Important Notice */}
          <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-lg mb-6">
            <div className="flex items-start">
              <i className="ri-information-line text-amber-600 text-xl mr-3 mt-0.5"></i>
              <div>
                <h4 className="font-semibold text-amber-900 mb-1">Important</h4>
                <p className="text-sm text-amber-800">
                  • After 15 days, you'll need to select a paid plan to continue using the system.
                </p>
                <p className="text-sm text-amber-800">
                  • You can only use the trial period once per account.
                </p>
                <p className="text-sm text-amber-800">
                  • You can change plans at any time from settings.
                </p>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <button
            onClick={handleConfirm}
            disabled={!selectedPlan}
            className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold text-lg hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            <i className="ri-rocket-line mr-2 text-2xl"></i>
            {selectedPlan ? 'Start my 15-day trial' : 'Select a plan to continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
