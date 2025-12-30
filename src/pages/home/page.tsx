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
      icon: 'ri-file-list-3-line',
      title: 'Reportes DGII',
      description: 'Genera automáticamente reportes 606, 607, 608, 609 y formularios fiscales requeridos.'
    },
    {
      icon: 'ri-calculator-line', 
      title: 'Contabilidad Completa',
      description: 'Diario general, mayor general, estados financieros y conciliación bancaria integrada.'
    },
    {
      icon: 'ri-receipt-line',
      title: 'Facturación Completa',
      description: 'Genera facturas con NCF, gestión de comprobantes fiscales y control de secuencias.'
    },
    {
      icon: 'ri-group-line',
      title: 'Nómina Automatizada', 
      description: 'Cálculo automático de nómina, prestaciones laborales y reportes al TSS.'
    },
    {
      icon: 'ri-pie-chart-line',
      title: 'Análisis Financiero',
      description: 'Dashboard con KPIs, análisis de rentabilidad y proyecciones financieras.'
    },
    {
      icon: 'ri-bank-line',
      title: 'Gestión Bancaria',
      description: 'Conciliación bancaria automática y gestión completa de cuentas bancarias.'
    },
    {
      icon: 'ri-shield-check-line',
      title: 'Seguridad Total',
      description: 'Backup automático en la nube, control de usuarios y auditoría completa.'
    },
    {
      icon: 'ri-smartphone-line',
      title: 'Acceso Móvil',
      description: 'Consulta información desde cualquier dispositivo con acceso web responsivo.'
    }
  ];

  const plans = [
    {
      name: 'PYME',
      price: 'USD $39.99',
      period: '/mes',
      features: [
        'Una empresa',
        'Facturación básica',
        'Dashboard básico',
        'Inventario limitado (500)',
        'Soporte por email',
        'Prueba gratis 15 días'
      ],
      popular: false
    },
    {
      name: 'PRO',
      price: 'USD $99.99',
      period: '/mes',
      features: [
        'Hasta 3 empresas',
        'Contabilidad completa',
        'Dashboard básico',
        'Inventario limitado (2,000)',
        'Gestión bancaria básica',
        'Nómina básica (10 empleados)',
        'Soporte prioritario',
        'Prueba gratis 15 días'
      ],
      popular: true
    },
    {
      name: 'PLUS',
      price: 'USD $199.99',
      period: '/mes',
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
        'Prueba gratis 15 días'
      ],
      popular: false
    },
    {
      name: 'ESTUDIANTIL',
      price: 'USD $99.99',
      period: '/mes',
      features: [
        'Empresas ilimitadas',
        'Todas las funciones',
        'Dashboard KPI avanzado',
        'Inventario ilimitado',
        'Análisis financiero avanzado',
        'Descuento estudiantil',
        'Prueba gratis 15 días'
      ],
      popular: false
    }
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
              <h1 className="text-2xl font-bold text-blue-600" style={{ fontFamily: '"Pacifico", serif' }}>
                Contabi RD
              </h1>
            </div>
            <div className="hidden md:flex items-center space-x-8">
              <button 
                onClick={() => handleSmoothScroll('features')} 
                className="text-gray-600 hover:text-gray-900 cursor-pointer"
              >
                Características
              </button>
              <button 
                onClick={() => handleSmoothScroll('pricing')} 
                className="text-gray-600 hover:text-gray-900 cursor-pointer"
              >
                Precios
              </button>
              <Link to="/auth/login" className="text-blue-600 hover:text-blue-700 cursor-pointer">Iniciar Sesión</Link>
              <Link 
                to="/auth/register" 
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 whitespace-nowrap cursor-pointer"
              >
                Prueba Gratis
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
      <section className="relative bg-gradient-to-br from-blue-50 to-indigo-100 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h1 className="text-4xl lg:text-6xl font-bold text-gray-900 mb-6">
                Contabilidad <span className="text-blue-600">Inteligente</span> para República Dominicana
              </h1>
              <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
                El sistema de contabilidad más completo para empresas dominicanas. Cumple con DGII y 
                automatiza todos tus procesos contables.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link 
                  to="/auth/register"
                  className="bg-blue-600 text-white px-8 py-4 rounded-lg hover:bg-blue-700 text-center font-semibold whitespace-nowrap cursor-pointer"
                >
                  Comenzar Prueba Gratis
                </Link>
              </div>
            </div>
            <div className="relative">
              <img 
                src="https://readdy.ai/api/search-image?query=Modern%20accounting%20dashboard%20interface%20showing%20financial%20charts%2C%20invoices%2C%20and%20Dominican%20Republic%20business%20data%20with%20clean%20professional%20design%2C%20blue%20and%20white%20color%20scheme%2C%20realistic%20business%20environment&width=600&height=400&seq=hero-dashboard&orientation=landscape"
                alt="Dashboard de Contabi RD"
                className="rounded-lg shadow-2xl object-top"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
              Todo lo que necesitas para tu contabilidad
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Diseñado específicamente para empresas dominicanas con todas las funciones 
              que necesitas para cumplir con las regulaciones locales.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div key={index} className="bg-gray-50 rounded-lg p-8 hover:shadow-lg transition-shadow cursor-pointer">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                  <i className={`${feature.icon} text-2xl text-blue-600`}></i>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">{feature.title}</h3>
                <p className="text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
              Planes que se adaptan a tu empresa
            </h2>
            <p className="text-xl text-gray-600">
              Comienza gratis y escala según crezca tu negocio
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {plans.filter(p => p.name !== 'ESTUDIANTIL').map((plan, index) => (
              <div key={index} className={`bg-white rounded-lg shadow-lg p-8 relative ${
                plan.popular ? 'ring-2 ring-blue-500' : ''
              }`}>
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <span className="bg-blue-500 text-white px-4 py-1 rounded-full text-sm font-medium">
                      Más Popular
                    </span>
                  </div>
                )}
                
                <div className="text-center mb-8">
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                  <div className="flex items-baseline justify-center">
                    <span className="text-4xl font-bold text-gray-900">{plan.price}</span>
                    <span className="text-gray-600 ml-1">{plan.period}</span>
                  </div>
                </div>

                <ul className="space-y-4 mb-8">
                  {plan.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-center">
                      <i className="ri-check-line text-green-500 mr-3"></i>
                      <span className="text-gray-600">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  to="/auth/register"
                  className={`w-full py-3 px-4 rounded-lg font-semibold text-center block whitespace-nowrap cursor-pointer ${
                    plan.popular
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                  }`}
                >
                  Comenzar Ahora
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-blue-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">
            ¿Listo para modernizar tu contabilidad?
          </h2>
          <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
            Únete a cientos de empresas dominicanas que ya confían en Contabi RD 
            para su gestión contable y fiscal.
          </p>
          <Link 
            to="/auth/register"
            className="bg-white text-blue-600 px-8 py-4 rounded-lg hover:bg-gray-100 font-semibold text-lg whitespace-nowrap cursor-pointer"
          >
            Comenzar Prueba Gratis de 15 Días
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <h3 className="text-xl font-bold mb-4" style={{ fontFamily: '"Pacifico", serif' }}>
                Contabi RD
              </h3>
              <p className="text-gray-400">
                El sistema de contabilidad más completo para empresas dominicanas.
              </p>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Producto</h4>
              <ul className="space-y-2 text-gray-400">
                <li>
                  <button 
                    onClick={() => handleSmoothScroll('features')} 
                    className="hover:text-white cursor-pointer"
                  >
                    Características
                  </button>
                </li>
                <li>
                  <button 
                    onClick={() => handleSmoothScroll('pricing')} 
                    className="hover:text-white cursor-pointer"
                  >
                    Precios
                  </button>
                </li>
                <li>
                  <Link to="/dashboard" className="hover:text-white cursor-pointer">
                    Integraciones
                  </Link>
                </li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Soporte</h4>
              <ul className="space-y-2 text-gray-400">
                <li>
                  <Link to="/dashboard" className="hover:text-white cursor-pointer">
                    Centro de Ayuda
                  </Link>
                </li>
                <li>
                  <Link to="/dashboard" className="hover:text-white cursor-pointer">
                    Estado del Sistema
                  </Link>
                </li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-gray-400">
                <li>
                  <Link to="/dashboard" className="hover:text-white cursor-pointer">
                    Privacidad
                  </Link>
                </li>
                <li>
                  <Link to="/dashboard" className="hover:text-white cursor-pointer">
                    Términos
                  </Link>
                </li>
                <li>
                  <Link to="/dashboard" className="hover:text-white cursor-pointer">
                    Seguridad
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400">
            <p>&copy; 2024 Contabi RD. Todos los derechos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
