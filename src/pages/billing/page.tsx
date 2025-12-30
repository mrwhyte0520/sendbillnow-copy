import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { useAuth } from '../../hooks/useAuth';
import { invoicesService, quotesService } from '../../services/database';
import { toast } from 'sonner';

export default function BillingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Estado para los datos dinámicos
  const [loading, setLoading] = useState(true);

  const modules = [
    {
      title: 'Facturación',
      description: 'Crear y gestionar facturas de clientes',
      icon: 'ri-file-text-line',
      href: '/billing/invoicing',
      color: 'green'
    },
    {
      title: 'Vendedores',
      description: 'Gestión de vendedores y comisiones de ventas',
      icon: 'ri-user-star-line',
      href: '/billing/sales-reps',
      color: 'teal'
    },
    {
      title: 'Reportes de Ventas',
      description: 'Análisis completo de ventas y rendimiento comercial',
      icon: 'ri-bar-chart-line',
      href: '/billing/sales-reports',
      color: 'blue'
    },
    {
      title: 'Pre-facturación',
      description: 'Cotizaciones y presupuestos para clientes',
      icon: 'ri-draft-line',
      href: '/billing/pre-invoicing',
      color: 'purple'
    },
    {
      title: 'Facturación Recurrente',
      description: 'Suscripciones y facturación automática',
      icon: 'ri-repeat-line',
      href: '/billing/recurring',
      color: 'orange'
    },
    {
      title: 'Cierre de Caja',
      description: 'Reconciliación diaria de efectivo y ventas',
      icon: 'ri-safe-line',
      href: '/billing/cash-closing',
      color: 'red'
    },
    {
      title: 'Cotizaciones de Ventas',
      description: 'Propuestas comerciales y seguimiento de oportunidades',
      icon: 'ri-file-list-line',
      href: '/billing/quotes',
      color: 'indigo'
    }
  ];

  // Cargar datos reales de facturas y cotizaciones
  useEffect(() => {
    const loadData = async () => {
      if (!user?.id) {
        setLoading(false);
        return;
      }

      try {
        const [invoices, quotes] = await Promise.all([
          invoicesService.getAll(user.id),
          quotesService.getAll(user.id),
        ]);

        const invoicesArr = Array.isArray(invoices) ? invoices : [];
        const quotesArr = Array.isArray(quotes) ? quotes : [];

        const todayStr = new Date().toISOString().slice(0, 10);
        const monthStr = todayStr.slice(0, 7); // YYYY-MM

        const today = new Date(todayStr);
        const yesterdayDate = new Date(today);
        yesterdayDate.setDate(today.getDate() - 1);
        const yesterdayStr = yesterdayDate.toISOString().slice(0, 10);

        // Función para verificar si una factura está anulada
        const isVoided = (inv: any) => {
          const status = String(inv.status || '').toLowerCase();
          return status === 'voided' || status === 'cancelled' || status === 'anulada' || status === 'anulado';
        };

        // Filtrar facturas válidas (no anuladas)
        const validInvoices = invoicesArr.filter((inv: any) => !isVoided(inv));

        const ventasHoy = validInvoices
          .filter((inv: any) => (inv.invoice_date || '').slice(0, 10) === todayStr)
          .reduce((sum: number, inv: any) => sum + (Number(inv.total_amount) || 0), 0);

        const ventasAyer = validInvoices
          .filter((inv: any) => (inv.invoice_date || '').slice(0, 10) === yesterdayStr)
          .reduce((sum: number, inv: any) => sum + (Number(inv.total_amount) || 0), 0);

        const ingresosMensuales = validInvoices
          .filter((inv: any) => (inv.invoice_date || '').slice(0, 7) === monthStr)
          .reduce((sum: number, inv: any) => sum + (Number(inv.total_amount) || 0), 0);

        const ingresosAyer = ventasAyer;

        const totalFacturas = validInvoices.length;
        const totalFacturasAyer = validInvoices
          .filter((inv: any) => (inv.invoice_date || '').slice(0, 10) === yesterdayStr)
          .length;

        const pendingQuotesArr = quotesArr.filter((q: any) => {
          const st = (q.status || 'pending') as string;
          return st === 'pending' || st === 'under_review';
        });

        const totalPendingQuotes = pendingQuotesArr.length;

        const pendingQuotesAyer = pendingQuotesArr.filter((q: any) => {
          const created = (q.quote_date || q.created_at || '').slice(0, 10);
          return created === yesterdayStr;
        }).length;

        setSalesStats([
          {
            title: 'Ventas de Hoy',
            value: `RD$ ${ventasHoy.toLocaleString('es-DO')}`,
            change: '',
            previousValue: `RD$ ${ventasAyer.toLocaleString('es-DO')}`,
            icon: 'ri-money-dollar-circle-line',
            color: 'green',
          },
          {
            title: 'Ingresos Mensuales',
            value: `RD$ ${ingresosMensuales.toLocaleString('es-DO')}`,
            change: '',
            previousValue: `RD$ ${ingresosAyer.toLocaleString('es-DO')}`,
            icon: 'ri-line-chart-line',
            color: 'purple',
          },
          {
            title: 'Cotizaciones Pendientes',
            value: String(totalPendingQuotes),
            change: '',
            previousValue: String(pendingQuotesAyer),
            icon: 'ri-file-list-line',
            color: 'orange',
          },
          {
            title: 'Facturas Emitidas',
            value: String(totalFacturas),
            change: '',
            previousValue: String(totalFacturasAyer),
            icon: 'ri-file-text-line',
            color: 'blue',
          },
        ]);

        // Facturas recientes (máx 4)
        const recent = [...invoicesArr]
          .sort((a: any, b: any) => new Date(b.invoice_date || b.created_at || 0).getTime() - new Date(a.invoice_date || a.created_at || 0).getTime())
          .slice(0, 4)
          .map((inv: any) => {
            const status = (inv.status || 'pending') as string;
            let statusLabel = 'Pendiente';
            if (status === 'paid') statusLabel = 'Pagada';
            else if (status === 'overdue') statusLabel = 'Vencida';

            const customerName = inv.customers?.name || inv.customer_name || 'Cliente';
            const dateStr = (inv.invoice_date || '').slice(0, 10) || (inv.created_at || '').slice(0, 10);

            return {
              number: inv.invoice_number || inv.id,
              customer: customerName,
              amount: `RD$ ${(Number(inv.total_amount) || 0).toLocaleString('es-DO')}`,
              status: statusLabel,
              date: dateStr ? new Date(dateStr).toLocaleDateString('es-DO') : '',
            };
          });
        setRecentInvoices(recent);

        // Productos más vendidos (por nombre de producto en invoice_lines)
        const productMap: Record<string, { name: string; quantity: number; revenue: number }> = {};
        invoicesArr.forEach((inv: any) => {
          (inv.invoice_lines || []).forEach((line: any) => {
            const name = line.inventory_items?.name || line.description || 'Producto';
            const qty = Number(line.quantity) || 0;
            const lineTotal = Number(line.line_total) || (Number(line.unit_price) || 0) * qty;
            if (!productMap[name]) {
              productMap[name] = { name, quantity: 0, revenue: 0 };
            }
            productMap[name].quantity += qty;
            productMap[name].revenue += lineTotal;
          });
        });

        const topProd = Object.values(productMap)
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 4)
          .map((p) => ({
            name: p.name,
            quantity: p.quantity,
            revenue: `RD$ ${p.revenue.toLocaleString('es-DO')}`,
            margin: '',
          }));
        if (topProd.length > 0) setTopProducts(topProd);

        // Cotizaciones pendientes (máx 4)
        const pendingQ = pendingQuotesArr
          .sort((a: any, b: any) => new Date(b.quote_date || b.created_at || 0).getTime() - new Date(a.quote_date || a.created_at || 0).getTime())
          .slice(0, 4)
          .map((q: any) => {
            const customerName = q.customers?.name || q.customer_name || 'Cliente';
            const amount = Number(q.total_amount) || Number(q.subtotal) || 0;
            const valid = (q.valid_until || q.quote_date || '').slice(0, 10);
            return {
              number: q.quote_number || q.id,
              customer: customerName,
              amount: `RD$ ${amount.toLocaleString('es-DO')}`,
              validUntil: valid ? new Date(valid).toLocaleDateString('es-DO') : '',
              status: 'Pendiente',
            };
          });
        if (pendingQ.length > 0) setPendingQuotes(pendingQ);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error loading billing dashboard data:', error);
        toast.error('Error al cargar el resumen de facturación');
      } finally {
        setLoading(false);
      }
    };

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const [salesStats, setSalesStats] = useState([
    {
      title: 'Ventas de Hoy',
      value: 'RD$ 0',
      change: '',
      previousValue: 'RD$ 0',
      icon: 'ri-money-dollar-circle-line',
      color: 'green',
    },
    {
      title: 'Ingresos Mensuales',
      value: 'RD$ 0',
      change: '',
      previousValue: 'RD$ 0',
      icon: 'ri-line-chart-line',
      color: 'purple',
    },
    {
      title: 'Cotizaciones Pendientes',
      value: '0',
      change: '',
      previousValue: '0',
      icon: 'ri-file-list-line',
      color: 'orange',
    },
    {
      title: 'Facturas Emitidas',
      value: '0',
      change: '',
      previousValue: '0',
      icon: 'ri-file-text-line',
      color: 'blue',
    },
  ]);

  const [recentInvoices, setRecentInvoices] = useState<Array<{
    number: string;
    customer: string;
    amount: string;
    status: string;
    date: string;
  }>>([]);

  const [topProducts, setTopProducts] = useState<Array<{
    name: string;
    quantity: number;
    revenue: string;
    margin: string;
  }>>([]);

  const [pendingQuotes, setPendingQuotes] = useState<Array<{
    number: string;
    customer: string;
    amount: string;
    validUntil: string;
    status: string;
  }>>([]);

  // Module Access Functions
  const handleAccessModule = (moduleHref: string) => {
    navigate(moduleHref);
  };

  // Quote Management Functions
  const handleConvertQuote = (quoteNumber: string, customer: string, amount: string) => {
    if (confirm(`¿Convertir cotización ${quoteNumber} a factura para ${customer}?`)) {
      alert(`Cotización ${quoteNumber} convertida a factura exitosamente`);
    }
  };

  const handleEditQuote = (quoteNumber: string) => {
    navigate('/billing/quotes');
  };

  // Navigation Functions
  const handleViewAllInvoices = () => {
    navigate('/billing/invoicing');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Módulo de Facturación</h1>
          <p className="text-gray-600">Sistema completo de gestión de ventas y facturación</p>
        </div>

        {/* Sales Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {salesStats.map((stat, index) => (
            <div key={index} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
                </div>
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center bg-${stat.color}-100`}>
                  <i className={`${stat.icon} text-xl text-${stat.color}-600`}></i>
                </div>
              </div>
              <div className="mt-4">
                <span className="text-sm font-medium text-green-600">{stat.change}</span>
                <span className="text-sm text-gray-500 ml-1">vs ayer</span>
                {stat.previousValue && (
                  <div className="mt-1 text-xs text-gray-500">
                    Ayer: {stat.previousValue}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Modules Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {modules.map((module, index) => (
            <div key={index} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow cursor-pointer">
              <div className="flex items-center mb-4">
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center bg-${module.color}-100 mr-4`}>
                  <i className={`${module.icon} text-xl text-${module.color}-600`}></i>
                </div>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{module.title}</h3>
              <p className="text-gray-600 mb-4 text-sm">{module.description}</p>
              <button 
                onClick={() => handleAccessModule(module.href)}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
              >
                Acceder
              </button>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Invoices */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Facturas Recientes</h3>
                <button 
                  onClick={handleViewAllInvoices}
                  className="text-blue-600 hover:text-blue-700 text-sm font-medium whitespace-nowrap"
                >
                  Ver Todas
                </button>
              </div>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {recentInvoices.map((invoice, index) => (
                  <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900">{invoice.number}</p>
                      <p className="text-sm text-gray-600">{invoice.customer}</p>
                      <p className="text-xs text-gray-500">{invoice.date}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">{invoice.amount}</p>
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        invoice.status === 'Pagada' ? 'bg-green-100 text-green-800' :
                        invoice.status === 'Pendiente' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {invoice.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Top Products */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Productos Más Vendidos</h3>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {topProducts.map((product, index) => (
                  <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900">{product.name}</p>
                      <p className="text-sm text-gray-600">Vendidos: {product.quantity} unidades</p>
                      <p className="text-xs text-gray-500">Margen: {product.margin}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-green-600">{product.revenue}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Pending Quotes */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Cotizaciones Pendientes</h3>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pendingQuotes.map((quote, index) => (
                <div key={index} className="flex items-center justify-between p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900">{quote.number}</p>
                    <p className="text-sm text-gray-600">{quote.customer}</p>
                    <p className="text-xs text-gray-500">Válida hasta: {quote.validUntil}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-900">{quote.amount}</p>
                    <div className="flex space-x-2 mt-2">
                      <button 
                        onClick={() => handleConvertQuote(quote.number, quote.customer, quote.amount)}
                        className="px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 whitespace-nowrap"
                      >
                        Convertir
                      </button>
                      <button 
                        onClick={() => handleEditQuote(quote.number)}
                        className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 whitespace-nowrap"
                      >
                        Editar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}