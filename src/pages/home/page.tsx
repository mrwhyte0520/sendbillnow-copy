import { Link, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { referralsService } from '../../services/database';

export default function HomePage() {
  const location = useLocation();
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const ref = params.get('ref');
    if (ref) {
      try {
        localStorage.setItem('ref_code', ref);
        referralsService.recordVisit(ref);
        const el = document.getElementById('pricing');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      } catch {}
    }
  }, [location.search]);
  const features = [
    {
      icon: 'ri-receipt-line',
      title: 'Complete Invoicing',
      description: 'Generate invoices with tax credentials, fiscal voucher management and sequence control.'
    },
    {
      icon: 'ri-group-line',
      title: 'Automated Payroll', 
      description: 'Automatic payroll calculation, employee benefits and social security reports.'
    },
    {
      icon: 'ri-shield-check-line',
      title: 'Total Security',
      description: 'Automatic cloud backup, user control and complete audit trail.'
    },
    {
      icon: 'ri-smartphone-line',
      title: 'Mobile Access',
      description: 'Access information from any device with responsive web access.'
    }
  ];

  const plans = [
    {
      name: 'Simple Invoicing',
      price: 'USD $19.99',
      period: '/month',
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
      category: 'invoicing'
    },
    {
      name: 'Premium Invoicing',
      price: 'USD $49.99',
      period: '/month',
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
      category: 'invoicing'
    },
    {
      name: 'POS Premium',
      price: 'USD $129.99',
      period: '/month',
      description: 'Complete solution for retail points of sale and business management',
      features: [
        'Full dashboard',
        'POS system',
        '30 users',
        'Unlimited products',
        '2 inventory warehouses',
        'Customer management',
        '2,000 electronic invoices',
        'Backup every 48 hours'
      ],
      popular: false,
      category: 'pos'
    },
  ];

  const handleSmoothScroll = (elementId: string) => {
    const element = document.getElementById(elementId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-[#008000]" style={{ fontFamily: '"Pacifico", serif' }}>
                Sendbillnow
              </h1>
            </div>
            <div className="hidden md:flex items-center space-x-8">
              <button 
                onClick={() => handleSmoothScroll('features')} 
                className="text-gray-600 hover:text-gray-900 cursor-pointer"
              >
                Features
              </button>
              <button 
                onClick={() => handleSmoothScroll('pricing')} 
                className="text-gray-600 hover:text-gray-900 cursor-pointer"
              >
                Pricing
              </button>
              <Link to="/auth/login" className="text-[#008000] hover:text-[#008000] cursor-pointer">Sign In</Link>
              <Link 
                to="/auth/register" 
                className="bg-[#008000] text-white px-4 py-2 rounded-lg hover:bg-[#008000] whitespace-nowrap cursor-pointer"
              >
                Free Trial
              </Link>
            </div>
            <div className="md:hidden">
              <button className="text-gray-600 hover:text-gray-900 cursor-pointer">
                <i className="ri-menu-line text-xl"></i>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-stone-100 to-stone-200 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h1 className="text-4xl lg:text-6xl font-bold text-gray-900 mb-6">
                Smart <span className="text-[#008000]">Accounting</span> for Your Business
              </h1>
              <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
                The most complete accounting system for businesses. Automate all your accounting processes.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link 
                  to="/auth/register"
                  className="bg-[#008000] text-white px-8 py-4 rounded-lg hover:bg-[#008000] text-center font-semibold whitespace-nowrap cursor-pointer"
                >
                  Start Free Trial
                </Link>
              </div>
            </div>
            <div className="relative">
              <img 
                src="/hero-analytics-green.svg"
                alt="Dashboard de Sendbillnow"
                className="rounded-xl shadow-2xl border border-[#d8cbb5] object-cover"
              />
              <div className="absolute inset-0 rounded-xl border border-white/40 pointer-events-none bg-gradient-to-tr from-[#30442540] via-transparent to-transparent mix-blend-multiply"></div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
              Everything you need for your accounting
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Designed specifically for businesses with all the features 
              you need to comply with local regulations.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div key={index} className="bg-gray-50 rounded-lg p-8 hover:shadow-lg transition-shadow cursor-pointer">
                <div className="w-12 h-12 bg-[#008000]/10 rounded-lg flex items-center justify-center mb-4">
                  <i className={`${feature.icon} text-2xl text-[#008000]`}></i>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">{feature.title}</h3>
                <p className="text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Invoicing Plans Section */}
      <section id="pricing" className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Invoicing Plans */}
          <div className="text-center mb-12">
            <div className="flex items-center justify-center mb-4">
              <i className="ri-file-text-line text-3xl text-[#008000] mr-3"></i>
              <h2 className="text-3xl lg:text-4xl font-bold text-gray-900">
                Invoicing Plans
              </h2>
            </div>
            <p className="text-xl text-gray-600">
              Quoting and invoicing solutions
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto mb-16">
            {plans.filter(p => p.category === 'invoicing').map((plan, index) => (
              <div key={index} className="bg-white rounded-xl shadow-lg overflow-hidden border-2 border-gray-200 hover:border-[#008000]/30 transition-all">
                <div className={`p-6 text-white text-center ${
                  plan.name === 'Simple Invoicing' 
                    ? 'bg-gradient-to-r from-teal-500 to-teal-600' 
                    : 'bg-gradient-to-r from-indigo-500 to-indigo-600'
                }`}>
                  <i className={`${
                    plan.name === 'Simple Invoicing' ? 'ri-file-text-line' : 'ri-file-list-3-line'
                  } text-4xl mb-3`}></i>
                  <h3 className="text-xl font-bold mb-2">{plan.name}</h3>
                  <div className="flex items-baseline justify-center">
                    <span className="text-sm">USD $</span>
                    <span className="text-3xl font-bold mx-1">{plan.price.replace('USD $', '')}</span>
                    <span className="text-sm">{plan.period}</span>
                  </div>
                </div>

                <div className="p-6">
                  <p className="text-gray-600 text-sm mb-4 text-center">{plan.description}</p>
                  <ul className="space-y-3 mb-6">
                    {plan.features.map((feature, featureIndex) => (
                      <li key={featureIndex} className="flex items-center">
                        <i className="ri-check-line text-green-500 mr-3"></i>
                        <span className="text-gray-700 text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    to="/auth/register"
                    className="w-full py-3 px-4 rounded-lg font-semibold text-center block whitespace-nowrap cursor-pointer bg-[#556B2F] text-white hover:bg-[#4a5d29] transition-colors"
                  >
                    Select Plan
                  </Link>
                </div>
              </div>
            ))}
          </div>

          {/* POS Plans */}
          <div className="text-center mb-12">
            <div className="flex items-center justify-center mb-4">
              <i className="ri-store-2-line text-3xl text-[#008000] mr-3"></i>
              <h2 className="text-3xl lg:text-4xl font-bold text-gray-900">
                POS Plans for Businesses
              </h2>
            </div>
            <p className="text-xl text-gray-600">
              Complete solution for retail points of sale and business management
            </p>
          </div>

          <div className="max-w-md mx-auto">
            {plans.filter(p => p.category === 'pos').map((plan, index) => (
              <div key={index} className="bg-white rounded-xl shadow-lg overflow-hidden border-2 border-gray-200 hover:border-[#008000]/30 transition-all">
                <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 p-6 text-white text-center">
                  <i className="ri-store-2-line text-4xl mb-3"></i>
                  <h3 className="text-xl font-bold mb-2">{plan.name}</h3>
                  <div className="flex items-baseline justify-center">
                    <span className="text-sm">USD $</span>
                    <span className="text-3xl font-bold mx-1">{plan.price.replace('USD $', '')}</span>
                    <span className="text-sm">{plan.period}</span>
                  </div>
                </div>

                <div className="p-6">
                  <p className="text-gray-600 text-sm mb-4 text-center">{plan.description}</p>
                  <div className="max-h-64 overflow-y-auto mb-6">
                    <ul className="space-y-3">
                      {plan.features.map((feature, featureIndex) => (
                        <li key={featureIndex} className="flex items-center">
                          <i className="ri-check-line text-green-500 mr-3"></i>
                          <span className="text-gray-700 text-sm">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <Link
                    to="/auth/register"
                    className="w-full py-3 px-4 rounded-lg font-semibold text-center block whitespace-nowrap cursor-pointer bg-[#556B2F] text-white hover:bg-[#4a5d29] transition-colors"
                  >
                    Select Plan
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-[#008000] to-[#008000]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">
            Ready to modernize your accounting?
          </h2>
          <p className="text-xl text-stone-200 mb-8 max-w-2xl mx-auto">
            Join hundreds of businesses that already trust Sendbillnow 
            for their accounting and tax management.
          </p>
          <Link 
            to="/auth/register"
            className="bg-white text-[#008000] px-8 py-4 rounded-lg hover:bg-stone-100 font-semibold text-lg whitespace-nowrap cursor-pointer"
          >
            Start 15-Day Free Trial
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <h3 className="text-xl font-bold mb-4" style={{ fontFamily: '"Pacifico", serif' }}>
                Sendbillnow
              </h3>
              <p className="text-gray-400">
                The most complete accounting system for businesses.
              </p>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-gray-400">
                <li>
                  <button 
                    onClick={() => handleSmoothScroll('features')} 
                    className="hover:text-white cursor-pointer"
                  >
                    Features
                  </button>
                </li>
                <li>
                  <button 
                    onClick={() => handleSmoothScroll('pricing')} 
                    className="hover:text-white cursor-pointer"
                  >
                    Pricing
                  </button>
                </li>
                <li>
                  <Link to="/dashboard" className="hover:text-white cursor-pointer">
                    Integrations
                  </Link>
                </li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Support</h4>
              <ul className="space-y-2 text-gray-400">
                <li>
                  <Link to="/dashboard" className="hover:text-white cursor-pointer">
                    Help Center
                  </Link>
                </li>
                <li>
                  <Link to="/dashboard" className="hover:text-white cursor-pointer">
                    System Status
                  </Link>
                </li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-gray-400">
                <li>
                  <Link to="/dashboard" className="hover:text-white cursor-pointer">
                    Privacy
                  </Link>
                </li>
                <li>
                  <Link to="/dashboard" className="hover:text-white cursor-pointer">
                    Terms
                  </Link>
                </li>
                <li>
                  <Link to="/dashboard" className="hover:text-white cursor-pointer">
                    Security
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400">
            <p>&copy; 2024 Sendbillnow. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
