import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { useAuth } from '../../hooks/useAuth';
import { invoicesService, quotesService } from '../../services/database';
import { toast } from 'sonner';

const BASE_CARD_CLASSES =
  'bg-[#FBF7EF] border border-[#D9C8A9] rounded-2xl shadow-[0_20px_45px_rgba(55,74,58,0.15)]';
const ICON_WRAPPER_BASE = 'w-12 h-12 rounded-xl flex items-center justify-center';
const PRIMARY_BUTTON_CLASSES =
  'w-full bg-[#3C4F3C] text-white py-2 px-4 rounded-lg hover:bg-[#2D3B2E] transition-colors whitespace-nowrap shadow-[0_10px_25px_rgba(60,79,60,0.35)]';
const SECONDARY_BUTTON_CLASSES =
  'px-4 py-2 bg-[#B89B7A] text-white rounded-lg hover:bg-[#A17F5D] transition-colors whitespace-nowrap shadow-[0_10px_20px_rgba(184,155,122,0.35)]';
const CHIP_BASE_CLASSES = 'inline-flex px-2 py-1 text-xs font-medium rounded-full';

export default function BillingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Dynamic data state
  const [, setLoading] = useState(true);

  const modules = [
    {
      title: 'Invoicing',
      description: 'Create and manage customer invoices',
      icon: 'ri-file-text-line',
      href: '/billing/invoicing',
      accentBg: 'bg-[#DCE5CF]',
      iconColor: 'text-[#2F3D2E]',
    },
    {
      title: 'Sales Representatives',
      description: 'Manage sales reps and commission plans',
      icon: 'ri-user-star-line',
      href: '/billing/sales-reps',
      accentBg: 'bg-[#D7E6E0]',
      iconColor: 'text-[#2F3D2E]',
    },
    {
      title: 'Sales Reports',
      description: 'Comprehensive sales and performance insights',
      icon: 'ri-bar-chart-line',
      href: '/billing/sales-reports',
      accentBg: 'bg-[#E3E6D2]',
      iconColor: 'text-[#324532]',
    },
    {
      title: 'Pre-Invoicing',
      description: 'Customer quotes and budget proposals',
      icon: 'ri-draft-line',
      href: '/billing/pre-invoicing',
      accentBg: 'bg-[#E9E1CF]',
      iconColor: 'text-[#3E4B34]',
    },
    {
      title: 'Recurring Billing',
      description: 'Subscriptions and automated billing',
      icon: 'ri-repeat-line',
      href: '/billing/recurring',
      accentBg: 'bg-[#E1DACA]',
      iconColor: 'text-[#2F3D2E]',
    },
    {
      title: 'Cash Closing',
      description: 'Daily reconciliation of sales and cash',
      icon: 'ri-safe-line',
      href: '/billing/cash-closing',
      accentBg: 'bg-[#DED8CB]',
      iconColor: 'text-[#2E3B30]',
    },
    {
      title: 'Sales Quotes',
      description: 'Commercial proposals and opportunity follow-up',
      icon: 'ri-file-list-line',
      href: '/billing/quotes',
      accentBg: 'bg-[#E4DED0]',
      iconColor: 'text-[#2F3D2E]',
    },
  ];

  // Load real invoices and quotes data
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

        // Identify voided invoices
        const isVoided = (inv: any) => {
          const status = String(inv.status || '').toLowerCase();
          return status === 'voided' || status === 'cancelled' || status === 'anulada' || status === 'anulado';
        };

        // Filter valid invoices
        const validInvoices = invoicesArr.filter((inv: any) => !isVoided(inv));

        const todaySales = validInvoices
          .filter((inv: any) => (inv.invoice_date || '').slice(0, 10) === todayStr)
          .reduce((sum: number, inv: any) => sum + (Number(inv.total_amount) || 0), 0);

        const yesterdaySales = validInvoices
          .filter((inv: any) => (inv.invoice_date || '').slice(0, 10) === yesterdayStr)
          .reduce((sum: number, inv: any) => sum + (Number(inv.total_amount) || 0), 0);

        const monthlyRevenue = validInvoices
          .filter((inv: any) => (inv.invoice_date || '').slice(0, 7) === monthStr)
          .reduce((sum: number, inv: any) => sum + (Number(inv.total_amount) || 0), 0);

        const totalInvoices = validInvoices.length;
        const invoicesYesterday = validInvoices
          .filter((inv: any) => (inv.invoice_date || '').slice(0, 10) === yesterdayStr)
          .length;

        const pendingQuotesArr = quotesArr.filter((q: any) => {
          const st = (q.status || 'pending') as string;
          return st === 'pending' || st === 'under_review';
        });

        const totalPendingQuotes = pendingQuotesArr.length;

        const pendingQuotesYesterday = pendingQuotesArr.filter((q: any) => {
          const created = (q.quote_date || q.created_at || '').slice(0, 10);
          return created === yesterdayStr;
        }).length;

        setSalesStats([
          {
            title: 'Today’s Sales',
            value: `$ ${todaySales.toLocaleString('es-DO')}`,
            change: '',
            previousValue: `$ ${yesterdaySales.toLocaleString('es-DO')}`,
            icon: 'ri-money-dollar-circle-line',
            iconWrapperClass: `${ICON_WRAPPER_BASE} bg-[#DDE7D0]`,
            iconColorClass: 'text-[#2F3D2E]',
          },
          {
            title: 'Monthly Revenue',
            value: `$ ${monthlyRevenue.toLocaleString('es-DO')}`,
            change: '',
            previousValue: `$ ${yesterdaySales.toLocaleString('es-DO')}`,
            icon: 'ri-line-chart-line',
            iconWrapperClass: `${ICON_WRAPPER_BASE} bg-[#E7DFC9]`,
            iconColorClass: 'text-[#3E4E3B]',
          },
          {
            title: 'Pending Quotes',
            value: String(totalPendingQuotes),
            change: '',
            previousValue: String(pendingQuotesYesterday),
            icon: 'ri-file-list-line',
            iconWrapperClass: `${ICON_WRAPPER_BASE} bg-[#E5E2D9]`,
            iconColorClass: 'text-[#2E3A2F]',
          },
          {
            title: 'Issued Invoices',
            value: String(totalInvoices),
            change: '',
            previousValue: String(invoicesYesterday),
            icon: 'ri-file-text-line',
            iconWrapperClass: `${ICON_WRAPPER_BASE} bg-[#E0D8C5]`,
            iconColorClass: 'text-[#374536]',
          },
        ]);

        // Recent invoices (max 4)
        const recent = [...invoicesArr]
          .sort(
            (a: any, b: any) =>
              new Date(b.invoice_date || b.created_at || 0).getTime() -
              new Date(a.invoice_date || a.created_at || 0).getTime(),
          )
          .slice(0, 4)
          .map((inv: any) => {
            const status = (inv.status || 'pending') as string;
            let statusLabel = 'Pending';
            if (status === 'paid') statusLabel = 'Paid';
            else if (status === 'overdue') statusLabel = 'Overdue';

            const customerName = inv.customers?.name || inv.customer_name || 'Customer';
            const dateStr = (inv.invoice_date || '').slice(0, 10) || (inv.created_at || '').slice(0, 10);

            return {
              number: inv.invoice_number || inv.id,
              customer: customerName,
              amount: `$ ${(Number(inv.total_amount) || 0).toLocaleString('es-DO')}`,
              status: statusLabel,
              date: dateStr ? new Date(dateStr).toLocaleDateString('es-DO') : '',
            };
          });
        setRecentInvoices(recent);

        // Top selling products (from invoice_lines)
        const productMap: Record<string, { name: string; quantity: number; revenue: number }> = {};
        invoicesArr.forEach((inv: any) => {
          (inv.invoice_lines || []).forEach((line: any) => {
            const name = line.inventory_items?.name || line.description || 'Product';
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
            revenue: `$ ${p.revenue.toLocaleString('es-DO')}`,
            margin: '',
          }));
        if (topProd.length > 0) setTopProducts(topProd);

        // Pending quotes (max 4)
        const pendingQ = pendingQuotesArr
          .sort(
            (a: any, b: any) =>
              new Date(b.quote_date || b.created_at || 0).getTime() -
              new Date(a.quote_date || a.created_at || 0).getTime(),
          )
          .slice(0, 4)
          .map((q: any) => {
            const customerName = q.customers?.name || q.customer_name || 'Customer';
            const amount = Number(q.total_amount) || Number(q.subtotal) || 0;
            const valid = (q.valid_until || q.quote_date || '').slice(0, 10);
            return {
              number: q.quote_number || q.id,
              customer: customerName,
              amount: `$ ${amount.toLocaleString('es-DO')}`,
              validUntil: valid ? new Date(valid).toLocaleDateString('es-DO') : '',
              status: 'Pending',
            };
          });
        if (pendingQ.length > 0) setPendingQuotes(pendingQ);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error loading billing dashboard data:', error);
        toast.error('Unable to load the billing summary');
      } finally {
        setLoading(false);
      }
    };

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const [salesStats, setSalesStats] = useState([
    {
      title: 'Today’s Sales',
      value: '$ 0',
      change: '',
      previousValue: '$ 0',
      icon: 'ri-money-dollar-circle-line',
      iconWrapperClass: `${ICON_WRAPPER_BASE} bg-[#DDE7D0]`,
      iconColorClass: 'text-[#2F3D2E]',
    },
    {
      title: 'Monthly Revenue',
      value: '$ 0',
      change: '',
      previousValue: '$ 0',
      icon: 'ri-line-chart-line',
      iconWrapperClass: `${ICON_WRAPPER_BASE} bg-[#E7DFC9]`,
      iconColorClass: 'text-[#3E4E3B]',
    },
    {
      title: 'Pending Quotes',
      value: '0',
      change: '',
      previousValue: '0',
      icon: 'ri-file-list-line',
      iconWrapperClass: `${ICON_WRAPPER_BASE} bg-[#E5E2D9]`,
      iconColorClass: 'text-[#2E3A2F]',
    },
    {
      title: 'Issued Invoices',
      value: '0',
      change: '',
      previousValue: '0',
      icon: 'ri-file-text-line',
      iconWrapperClass: `${ICON_WRAPPER_BASE} bg-[#E0D8C5]`,
      iconColorClass: 'text-[#374536]',
    },
  ]);

  const [recentInvoices, setRecentInvoices] = useState<
    Array<{
      number: string;
      customer: string;
      amount: string;
      status: string;
      date: string;
    }>
  >([]);

  const [topProducts, setTopProducts] = useState<
    Array<{
      name: string;
      quantity: number;
      revenue: string;
      margin: string;
    }>
  >([]);

  const [pendingQuotes, setPendingQuotes] = useState<
    Array<{
      number: string;
      customer: string;
      amount: string;
      validUntil: string;
      status: string;
    }>
  >([]);

  // Module Access Functions
  const handleAccessModule = (moduleHref: string) => {
    navigate(moduleHref);
  };

  // Quote Management Functions
  const handleConvertQuote = (quoteNumber: string, customer: string) => {
    if (confirm(`Convert quote ${quoteNumber} to invoice for ${customer}?`)) {
      alert(`Quote ${quoteNumber} converted to invoice successfully`);
    }
  };

  const handleEditQuote = () => {
    navigate('/billing/quotes');
  };

  // Navigation Functions
  const handleViewAllInvoices = () => {
    navigate('/billing/invoicing');
  };

  const getInvoiceStatusClasses = (status: string) => {
    if (status === 'Paid') {
      return `${CHIP_BASE_CLASSES} bg-[#D9E7CE] text-[#2F3D2E]`;
    }
    if (status === 'Pending') {
      return `${CHIP_BASE_CLASSES} bg-[#F4E5C7] text-[#5C4A26]`;
    }
    return `${CHIP_BASE_CLASSES} bg-[#F4D4D0] text-[#7A2F2F]`;
  };

  return (
    <DashboardLayout>
      <div className="space-y-8 bg-[#F4ECDC] min-h-screen rounded-[32px] p-6">
        {/* Header */}
        <div className="space-y-2">
          <span className="inline-flex items-center text-xs font-semibold tracking-[0.2em] uppercase text-[#7A705A]">
            Billing Suite
          </span>
          <h1 className="text-3xl font-semibold text-[#2F3D2E]">Billing Module</h1>
          <p className="text-[#5F6652] text-sm">
            A complete command center for sales, quotes, invoices, and revenue performance.
          </p>
        </div>

        {/* Sales Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {salesStats.map((stat, index) => (
            <div key={index} className={`${BASE_CARD_CLASSES} p-6`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[#5F6652]">{stat.title}</p>
                  <p className="text-2xl font-bold text-[#2F3D2E] mt-1">{stat.value}</p>
                </div>
                <div className={stat.iconWrapperClass}>
                  <i className={`${stat.icon} text-xl ${stat.iconColorClass}`}></i>
                </div>
              </div>
              <div className="mt-4">
                <span className="text-sm font-medium text-[#3E4E3B]">{stat.change}</span>
                <span className="text-sm text-[#7A705A] ml-1">vs yesterday</span>
                {stat.previousValue && (
                  <div className="mt-1 text-xs text-[#7A705A]">
                    Yesterday: {stat.previousValue}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Modules Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {modules.map((module, index) => (
            <div
              key={index}
              className={`${BASE_CARD_CLASSES} p-6 hover:-translate-y-1 transition-transform cursor-pointer`}
            >
              <div className="flex items-center mb-4">
                <div className={`${ICON_WRAPPER_BASE} ${module.accentBg} mr-4`}>
                  <i className={`${module.icon} text-xl ${module.iconColor}`}></i>
                </div>
              </div>
              <h3 className="text-lg font-semibold text-[#2F3D2E] mb-2">{module.title}</h3>
              <p className="text-[#5F6652] mb-4 text-sm">{module.description}</p>
              <button
                onClick={() => handleAccessModule(module.href)}
                className={PRIMARY_BUTTON_CLASSES}
              >
                Access
              </button>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Invoices */}
          <div className={BASE_CARD_CLASSES}>
            <div className="p-6 border-b border-[#D9C8A9]">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-[#2F3D2E]">Recent Invoices</h3>
                <button
                  onClick={handleViewAllInvoices}
                  className="text-[#3C4F3C] hover:text-[#2D392D] text-sm font-medium whitespace-nowrap"
                >
                  View All
                </button>
              </div>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {recentInvoices.map((invoice, index) => (
                  <div key={index} className="flex items-center justify-between p-4 bg-[#F3EFE3] rounded-xl">
                    <div>
                      <p className="font-medium text-[#2F3D2E]">{invoice.number}</p>
                      <p className="text-sm text-[#5F6652]">{invoice.customer}</p>
                      <p className="text-xs text-[#7A705A]">{invoice.date}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-[#2F3D2E]">{invoice.amount}</p>
                      <span className={getInvoiceStatusClasses(invoice.status)}>
                        {invoice.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Top Products */}
          <div className={BASE_CARD_CLASSES}>
            <div className="p-6 border-b border-[#D9C8A9]">
              <h3 className="text-lg font-semibold text-[#2F3D2E]">Top Products</h3>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {topProducts.map((product, index) => (
                  <div key={index} className="flex items-center justify-between p-4 bg-[#F3EFE3] rounded-xl">
                    <div>
                      <p className="font-medium text-[#2F3D2E]">{product.name}</p>
                      <p className="text-sm text-[#5F6652]">Units sold: {product.quantity}</p>
                      <p className="text-xs text-[#7A705A]">Margin: {product.margin}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-[#3C4F3C]">{product.revenue}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Pending Quotes */}
        <div className={BASE_CARD_CLASSES}>
          <div className="p-6 border-b border-[#D9C8A9]">
            <h3 className="text-lg font-semibold text-[#2F3D2E]">Pending Quotes</h3>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pendingQuotes.map((quote, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-4 bg-[#F3EFE3] border border-[#D9C8A9] rounded-xl"
                >
                  <div>
                    <p className="font-medium text-[#2F3D2E]">{quote.number}</p>
                    <p className="text-sm text-[#5F6652]">{quote.customer}</p>
                    <p className="text-xs text-[#7A705A]">Valid until: {quote.validUntil}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-[#2F3D2E]">{quote.amount}</p>
                    <div className="flex space-x-2 mt-2">
                      <button
                        onClick={() => handleConvertQuote(quote.number, quote.customer)}
                        className="px-3 py-1 bg-[#3C4F3C] text-white text-xs rounded hover:bg-[#2D3B2E] whitespace-nowrap shadow-[0_8px_18px_rgba(60,79,60,0.35)]"
                      >
                        Convert
                      </button>
                      <button
                        onClick={handleEditQuote}
                        className="px-3 py-1 bg-[#B89B7A] text-white text-xs rounded hover:bg-[#A17F5D] whitespace-nowrap shadow-[0_8px_18px_rgba(184,155,122,0.35)]"
                      >
                        Edit
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