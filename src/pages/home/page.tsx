import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { referralsService } from '../../services/database';

function useInViewOnce<T extends HTMLElement>(options?: IntersectionObserverInit) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, ...options }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [inView, options]);

  return [ref, inView] as const;
}

export default function HomePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const heroImageRef = useRef<HTMLDivElement | null>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [heroTilt, setHeroTilt] = useState({ rotateX: 0, rotateY: 0 });
  const [isMounted, setIsMounted] = useState(false);

  const [heroRef, heroInView] = useInViewOnce<HTMLElement>({ threshold: 0.2 });
  const [featuresRef, featuresInView] = useInViewOnce<HTMLElement>({ threshold: 0.15 });
  const [pos101Ref, pos101InView] = useInViewOnce<HTMLElement>({ threshold: 0.15 });
  const [pricingRef, pricingInView] = useInViewOnce<HTMLElement>({ threshold: 0.15 });
  const [ctaRef, ctaInView] = useInViewOnce<HTMLElement>({ threshold: 0.2 });

  useEffect(() => {
    const t = setTimeout(() => setIsMounted(true), 100);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 20;
      const y = (e.clientY / window.innerHeight - 0.5) * 20;
      setMousePosition({ x, y });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const handleHeroMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!heroImageRef.current) return;
    const rect = heroImageRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = ((y - centerY) / centerY) * -6;
    const rotateY = ((x - centerX) / centerX) * 6;
    setHeroTilt({ rotateX, rotateY });
  };

  const handleHeroMouseLeave = () => {
    setHeroTilt({ rotateX: 0, rotateY: 0 });
  };

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

  useEffect(() => {
    const hash = String(location.hash || '').replace('#', '').trim();
    if (!hash) return;

    try {
      const el = document.getElementById(hash);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    } catch {}
  }, [location.hash]);
  const features = [
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

  const [billingPeriod] = useState<'monthly' | 'annual'>('monthly');
  const [isRedirectingToStripe, setIsRedirectingToStripe] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  const plans = [
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
      category: 'pos'
    },
  ];

  const formatMoney = (amount: number) => {
    return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const startStripeCheckout = async (planId: string) => {
    setSelectedPlanId(planId);
    setIsRedirectingToStripe(true);
    try {
      localStorage.setItem('selected_plan', planId);
      localStorage.setItem('selected_billing', billingPeriod);
    } catch {}
    navigate(`/auth/register?plan=${encodeURIComponent(planId)}`);
    setIsRedirectingToStripe(false);
  };

  const handleSmoothScroll = (elementId: string) => {
    const element = document.getElementById(elementId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const heroBgStyle = useMemo(() => {
    return {
      transform: `translate(${mousePosition.x}px, ${mousePosition.y}px)`,
      transition: 'transform 0.35s ease-out',
    } as const;
  }, [mousePosition.x, mousePosition.y]);

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="bg-white/80 border-b border-gray-200 backdrop-blur supports-[backdrop-filter]:bg-white/70">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-[#008000]" style={{ fontFamily: '"Pacifico", serif' }}>
                Send Bill Now
              </h1>
            </div>
            <div className="hidden md:flex items-center space-x-8">
              <button 
                onClick={() => handleSmoothScroll('features')} 
                className="text-gray-600 hover:text-gray-900 cursor-pointer transition-colors"
              >
                Features
              </button>
              <button 
                onClick={() => handleSmoothScroll('pricing')} 
                className="text-gray-600 hover:text-gray-900 cursor-pointer transition-colors"
              >
                Pricing
              </button>
              <Link to="/auth/login" className="text-[#008000] hover:text-[#006B00] cursor-pointer transition-colors">Sign In</Link>
            </div>
            <div className="md:hidden">
              <button className="text-gray-600 hover:text-gray-900 cursor-pointer transition-colors">
                <i className="ri-menu-line text-xl"></i>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section
        ref={heroRef}
        className="relative bg-gradient-to-br from-[#FDFBF3] via-stone-100 to-stone-200 py-20 overflow-hidden"
      >
        <div className="absolute inset-0 pointer-events-none" style={heroBgStyle}>
          <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-[#008000]/10 blur-3xl" />
          <div className="absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-[#556B2F]/10 blur-3xl" />
          <div className="absolute top-1/2 left-1/4 h-56 w-56 -translate-y-1/2 rounded-full bg-[#008000]/5 blur-3xl" />
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div
              className={`transition-all duration-700 ease-out ${
                heroInView && isMounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
            >
              <h1 className="brand-display text-3xl sm:text-4xl lg:text-6xl font-bold leading-tight text-gray-900 mb-4 sm:mb-6">
                A Smart Invoice & <span className="text-[#008000]">POS</span> System
              </h1>
              <p className="text-base sm:text-xl leading-relaxed text-gray-600 mb-8 max-w-3xl mx-auto">
                A Smart Invoice & POS System for all your business needs, in one stop!
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link 
                  to="/auth/login"
                  className="group bg-[#008000] text-white px-8 py-4 rounded-lg text-center font-semibold whitespace-nowrap cursor-pointer shadow-lg shadow-[#008000]/25 border border-[#006B00]/30 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-[#008000]/30 active:scale-[0.98]"
                >
                  Sign In
                </Link>
                <Link
                  to="/demo"
                  className="bg-[#FDFBF3] text-[#1F2616] px-8 py-4 rounded-lg text-center font-semibold whitespace-nowrap cursor-pointer border border-[#D8CBB5] shadow-md shadow-black/5 transition-all duration-300 hover:scale-[1.02] hover:bg-[#F6F0DE] hover:shadow-lg active:scale-[0.98]"
                >
                  Request Free Demo
                </Link>
              </div>
            </div>
            <div
              className={`transition-all duration-700 ease-out delay-150 ${
                heroInView && isMounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
              style={{ perspective: '1000px' }}
            >
              <div
                ref={heroImageRef}
                onMouseMove={handleHeroMouseMove}
                onMouseLeave={handleHeroMouseLeave}
                className="relative cursor-pointer select-none touch-manipulation transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-2xl active:translate-y-0.5"
                style={{
                  transform: `rotateX(${heroTilt.rotateX}deg) rotateY(${heroTilt.rotateY}deg)`,
                  transformStyle: 'preserve-3d',
                }}
              >
                <img 
                  src="/hero-analytics-green.svg"
                  alt="Dashboard de Send Bill Now"
                  className="rounded-2xl shadow-2xl border border-[#d8cbb5] object-cover"
                />
                <div className="absolute inset-0 rounded-xl border border-white/40 pointer-events-none bg-gradient-to-tr from-[#30442540] via-transparent to-transparent mix-blend-multiply"></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section
        ref={featuresRef}
        id="features"
        className="py-20 bg-white"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div
            className={`text-center mb-16 transition-all duration-700 ease-out ${
              featuresInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}
          >
            <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
              Everything you need for your POS
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Designed for proper Sales Tax calculation, management of staff hours and server tips, Inventory and Cost Inventory and all your POS needs, in real time!
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div
                key={index}
                className={`bg-gradient-to-br from-white to-gray-50 rounded-2xl p-8 cursor-pointer select-none touch-manipulation border border-gray-200 shadow-sm shadow-black/5 transition-all duration-700 ease-out hover:shadow-xl hover:shadow-black/10 active:scale-[0.99] hover:[transform:perspective(1000px)_rotateX(3deg)_rotateY(-3deg)_translateY(-4px)] ${
                  featuresInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                }`}
                style={{ transitionDelay: `${index * 90}ms` }}
              >
                <div className="w-12 h-12 bg-gradient-to-br from-[#008000]/15 to-[#556B2F]/10 rounded-xl flex items-center justify-center mb-4 shadow-sm shadow-[#008000]/10 border border-[#008000]/10">
                  <i className={`${feature.icon} text-2xl text-[#008000]`}></i>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">{feature.title}</h3>
                <p className="text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        ref={pos101Ref}
        className="py-20 bg-[#FDFBF3]"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            <div
              className={`transition-all duration-700 ease-out ${
                pos101InView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-[#D8CBB5] bg-white px-3 py-1 text-sm text-[#3B4A2A] shadow-sm">
                <span className="w-2 h-2 rounded-full bg-[#008000]" aria-hidden="true" />
                POS 101
              </div>
              <h2 className="mt-4 text-3xl lg:text-4xl font-bold text-gray-900">
                Understanding The POS System
              </h2>
              <p className="mt-4 text-lg text-gray-700 leading-relaxed">
                A Point of Sale (POS) system is a comprehensive software and hardware solution designed to streamline sales management for businesses of all sizes. It serves as a modern alternative to traditional cash registers and offers several advantages over them. In addition to processing transactions, POS systems are equipped with various features that enhance business operations, such as:
              </p>

              <div className="mt-8 rounded-2xl border border-[#E7DFC8] bg-white p-6 shadow-sm">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#008000] to-[#556B2F] flex items-center justify-center text-white shadow-md">
                    <i className="ri-store-2-line text-2xl"></i>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">Want to see it in action?</p>
                    <p className="text-sm text-gray-600 mt-1">
                      Request a free demo and we’ll show you how Send Bill Now fits your workflow.
                    </p>
                    <div className="mt-4 flex flex-col sm:flex-row gap-3">
                      <Link
                        to="/demo"
                        className="inline-flex items-center justify-center rounded-lg px-4 py-2 font-semibold bg-[#008000] text-white transition-all duration-300 hover:scale-[1.02] hover:bg-[#006B00] hover:shadow-lg hover:shadow-[#008000]/25 active:scale-[0.98]"
                      >
                        Request Free Demo
                      </Link>
                      <Link
                        to="/auth/login"
                        className="inline-flex items-center justify-center rounded-lg px-4 py-2 font-semibold bg-[#F6F0DE] text-gray-900 border border-[#D8CBB5] transition-all duration-300 hover:scale-[1.02] hover:bg-[#EFE6CF] hover:shadow-md active:scale-[0.98]"
                      >
                        Sign In
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div
              className={`rounded-2xl border border-[#E7DFC8] bg-white shadow-lg overflow-hidden transition-all duration-700 ease-out delay-150 hover:[transform:perspective(1000px)_rotateX(2deg)_rotateY(2deg)_translateY(-4px)] ${
                pos101InView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
              style={{ transformStyle: 'preserve-3d' }}
            >
              <div className="p-6 bg-gradient-to-br from-[#008000]/10 via-white to-[#FDFBF3]">
                <h3 className="text-xl font-bold text-gray-900">Key capabilities</h3>
                <p className="text-sm text-gray-600 mt-1">Everything you need to run a modern point of sale.</p>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    'Manage different sorts of payments',
                    'Follow employee leaves, working hours and vacation times',
                    'Manage the payrolls',
                    'Calculate the sales tax',
                    'Keep a track of your sales history',
                    'Track your inventory',
                    'Calculate the costing and discounts',
                    'Look after your accounting requirements',
                    'Manage loyalty services',
                  ].map((item) => (
                    <div key={item} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#008000]/10 text-[#008000]" aria-hidden="true">
                          <i className="ri-check-line"></i>
                        </span>
                        <p className="text-gray-800 font-medium leading-snug">{item}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Invoicing Plans Section */}
      <section
        ref={pricingRef}
        id="pricing"
        className="py-20 bg-gradient-to-b from-gray-50 to-white"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* POS Plans */}
          <div
            className={`text-center mb-12 transition-all duration-700 ease-out ${
              pricingInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}
          >
            <div className="flex items-center justify-center mb-4">
              <i className="ri-store-2-line text-3xl text-[#008000] mr-3"></i>
              <h2 className="text-3xl lg:text-4xl font-bold text-gray-900">
                Smart POS Price Plans for your Business
              </h2>
            </div>
            <p className="text-xl text-gray-600">
              A Complete Point of Sale Smart System, in one Stop! This help your Business Rise to the next level.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {plans.filter(p => p.category === 'pos').map((plan, index) => (
              <div
                key={index}
                className={`bg-white rounded-2xl shadow-lg shadow-black/10 overflow-hidden border border-gray-200 transition-all duration-700 ease-out hover:shadow-2xl hover:shadow-black/15 hover:border-[#008000]/30 hover:[transform:perspective(1000px)_rotateX(3deg)_rotateY(-3deg)_translateY(-4px)] ${
                  pricingInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                }`}
                style={{ transitionDelay: `${index * 120}ms` }}
              >
                <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 p-6 text-white text-center relative">
                  <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-white/10 via-transparent to-black/10" />
                  <i className="ri-store-2-line text-4xl mb-3"></i>
                  <h3 className="text-xl font-bold mb-2">{plan.name}</h3>
                  {billingPeriod === 'monthly' ? (
                    <div className="flex items-baseline justify-center">
                      <span className="text-3xl font-bold">${formatMoney(plan.priceMonthly)}/monthly</span>
                    </div>
                  ) : (
                    <div>
                      <div className="text-sm line-through opacity-60 mb-1">
                        ${formatMoney(plan.id === 'student' ? (plan.priceAnnual / 0.7) : (plan.priceMonthly * 12))}/yearly
                      </div>
                      <div className="flex items-baseline justify-center">
                        <span className="text-3xl font-bold">${formatMoney(plan.priceAnnual)}/yearly</span>
                      </div>
                      <div className="text-sm bg-white/20 px-3 py-1 rounded-full inline-block mt-2">
                        30% OFF - Save ${formatMoney((plan.id === 'student' ? (plan.priceAnnual / 0.7) : (plan.priceMonthly * 12)) - plan.priceAnnual)}
                      </div>
                    </div>
                  )}
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

                  <button
                    onClick={() => startStripeCheckout(plan.id)}
                    disabled={isRedirectingToStripe}
                    className="w-full py-3 px-4 rounded-lg font-semibold text-center block whitespace-nowrap cursor-pointer bg-[#556B2F] text-white shadow-md shadow-[#556B2F]/25 border border-black/10 transition-all duration-300 hover:scale-[1.02] hover:bg-[#4a5d29] hover:shadow-lg hover:shadow-[#556B2F]/30 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isRedirectingToStripe && selectedPlanId === plan.id ? (
                      <>
                        <i className="ri-loader-4-line animate-spin mr-2"></i>
                        Redirecting to payment...
                      </>
                    ) : (
                      'Select Plan'
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section
        ref={ctaRef}
        className="py-20 bg-gradient-to-r from-[#008000] to-[#006B00] relative overflow-hidden"
      >
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-24 left-10 h-72 w-72 rounded-full bg-black/10 blur-3xl" />
        </div>
        <div
          className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center transition-all duration-700 ease-out ${
            ctaInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <h2 className="brand-display text-4xl font-bold text-white mb-6">
            Ready to modernize your Invoice & POS?
          </h2>
          <p className="text-xl text-stone-200 mb-8 max-w-2xl mx-auto">
            Join hundreds of businesses that already trust Send Bill Now
            to run sales, payments, inventory, and reporting in real time.
          </p>
          <Link 
            to="/auth/login" 
            className="bg-white text-[#008000] px-8 py-4 rounded-lg font-bold text-lg inline-block cursor-pointer shadow-xl shadow-black/20 border border-white/40 transition-all duration-300 hover:scale-[1.02] hover:bg-gray-100 hover:shadow-2xl hover:shadow-black/25 active:scale-[0.98]"
          >
            Sign In
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <h3 className="text-xl font-bold mb-4" style={{ fontFamily: '"Pacifico", serif' }}>
                Send Bill Now
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
            <p>&copy; 2024 Send Bill Now. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
