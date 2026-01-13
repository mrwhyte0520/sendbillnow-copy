import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { apInvoicesService, suppliersService, supplierPaymentsService } from '../../services/database';
import { useAuth } from '../../hooks/useAuth';

export default function AccountsPayablePage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [summary, setSummary] = useState({
    totalBalance: 0,
    dueThisWeek: 0,
    overdue: 0,
    activeSuppliers: 0,
  });

  const [topSuppliers, setTopSuppliers] = useState<
    Array<{ name: string; rnc: string; balance: string; dueDate: string; status: string }>
  >([]);

  const [recentPurchases, setRecentPurchases] = useState<
    Array<{ type: string; supplier: string; amount: string; reference: string; date: string }>
  >([]);

  const [pendingApprovals, setPendingApprovals] = useState<
    Array<{ type: string; supplier: string; amount: string; requestedBy: string; date: string }>
  >([]);

  const modules = [
    {
      title: 'AP Reports',
      description: 'Accounts payable reports with advanced filters',
      icon: 'ri-file-chart-line',
      href: '/accounts-payable/reports',
      accentBg: '#f3ecda',
      accentText: '#2f3e1e',
    },
    {
      title: 'Supplier Management',
      description: 'Database and maintenance of vendor profiles',
      icon: 'ri-truck-line',
      href: '/accounts-payable/suppliers',
      accentBg: '#e3dcc8',
      accentText: '#4a3c24',
    },
    {
      title: 'Payment Processing',
      description: 'Checks, transfers, and cash disbursements',
      icon: 'ri-bank-card-line',
      href: '/accounts-payable/payments',
      accentBg: '#d8cbb5',
      accentText: '#2f3e1e',
    },
    {
      title: 'Purchase Orders',
      description: 'Creation and tracking of purchase orders',
      icon: 'ri-shopping-cart-line',
      href: '/accounts-payable/purchase-orders',
      accentBg: '#f3ecda',
      accentText: '#bc6c2b',
    },
    {
      title: 'Quote Requests',
      description: 'RFQs, comparisons, and supplier bids',
      icon: 'ri-file-list-line',
      href: '/accounts-payable/quotes',
      accentBg: '#e3dcc8',
      accentText: '#7a2e1b',
    },
    {
      title: 'AP Advances',
      description: 'Advance payments to suppliers',
      icon: 'ri-money-dollar-circle-line',
      href: '/accounts-payable/advances',
      accentBg: '#d8cbb5',
      accentText: '#2f3e1e',
    }
  ];

  const apStats = [
    {
      title: 'Total AP Balance',
      value: `RD$ ${summary.totalBalance.toLocaleString()}`,
      change: '0%',
      changeLabel: 'vs last month',
      icon: 'ri-file-list-3-line',
      iconBg: '#f3ecda',
      iconColor: '#2f3e1e',
    },
    {
      title: 'Due This Week',
      value: `RD$ ${summary.dueThisWeek.toLocaleString()}`,
      change: '0%',
      changeLabel: 'vs last month',
      icon: 'ri-calendar-line',
      iconBg: '#e3dcc8',
      iconColor: '#4a3c24',
    },
    {
      title: 'Overdue Payments',
      value: `RD$ ${summary.overdue.toLocaleString()}`,
      change: '0%',
      changeLabel: 'vs last month',
      icon: 'ri-alert-line',
      iconBg: '#fde8df',
      iconColor: '#7a2e1b',
    },
    {
      title: 'Active Suppliers',
      value: summary.activeSuppliers.toString(),
      change: '0',
      changeLabel: 'Total registered',
      icon: 'ri-truck-line',
      iconBg: '#f0f4ed',
      iconColor: '#2f3e1e',
    },
  ];

  useEffect(() => {
    const loadDashboard = async () => {
      if (!user?.id) {
        setSummary({ totalBalance: 0, dueThisWeek: 0, overdue: 0, activeSuppliers: 0 });
        setTopSuppliers([]);
        setRecentPurchases([]);
        setPendingApprovals([]);
        return;
      }

      try {
        const [invoices, suppliers, payments] = await Promise.all([
          apInvoicesService.getAll(user.id),
          suppliersService.getAll(user.id),
          supplierPaymentsService.getAll(user.id),
        ]);

        const today = new Date();
        const weekAhead = new Date();
        weekAhead.setDate(today.getDate() + 7);

        let totalBalance = 0;
        let dueThisWeek = 0;
        let overdue = 0;

        const supplierAgg = new Map<
          string,
          { name: string; rnc: string; balance: number; nextDueDate?: string | null }
        >();

        (invoices || []).forEach((inv: any) => {
          const balance = Number(inv.balance_amount ?? inv.total_to_pay ?? inv.total_gross ?? 0);
          if (!balance || balance <= 0) return;

          totalBalance += balance;

          const dueDateStr = inv.due_date as string | null;
          if (dueDateStr) {
            const due = new Date(dueDateStr);
            if (!Number.isNaN(due.getTime())) {
              if (due < today) {
                overdue += balance;
              } else if (due <= weekAhead) {
                dueThisWeek += balance;
              }
            }
          }

          const supplierId = String(inv.supplier_id ?? '');
          if (!supplierId) return;

          const current = supplierAgg.get(supplierId) || {
            name: (inv.suppliers as any)?.name || 'Suplidor',
            rnc: inv.tax_id || '',
            balance: 0,
            nextDueDate: null as string | null,
          };

          current.balance += balance;

          if (dueDateStr) {
            if (!current.nextDueDate) {
              current.nextDueDate = dueDateStr;
            } else {
              const prev = new Date(current.nextDueDate);
              const next = new Date(dueDateStr);
              if (!Number.isNaN(next.getTime()) && (Number.isNaN(prev.getTime()) || next < prev)) {
                current.nextDueDate = dueDateStr;
              }
            }
          }

          supplierAgg.set(supplierId, current);
        });

        const suppliersList = (suppliers || []) as any[];
        const activeSuppliers = suppliersList.filter((s) => s.is_active !== false).length;

        const topSuppliersArr = Array.from(supplierAgg.values())
          .sort((a, b) => b.balance - a.balance)
          .slice(0, 5)
          .map((s) => {
            let status: string = 'Current';
            if (s.nextDueDate) {
              const due = new Date(s.nextDueDate);
              if (!Number.isNaN(due.getTime())) {
                if (due < today) {
                  status = 'Overdue';
                } else if (due <= weekAhead) {
                  status = 'Due Soon';
                }
              }
            }

            return {
              name: s.name,
              rnc: s.rnc,
              balance: `RD$ ${s.balance.toLocaleString()}`,
              dueDate: s.nextDueDate || '-',
              status,
            };
          });

        const recentPurchasesArr: Array<{
          type: string;
          supplier: string;
          amount: string;
          reference: string;
          date: string;
        }> = (invoices || [])
          .slice()
          .sort((a: any, b: any) => {
            const da = new Date(a.invoice_date || a.created_at || 0).getTime();
            const db = new Date(b.invoice_date || b.created_at || 0).getTime();
            return db - da;
          })
          .slice(0, 5)
          .map((inv: any) => ({
            type: 'Factura',
            supplier: (inv.suppliers as any)?.name || 'Suplidor',
            amount: `RD$ ${Number(
              inv.total_to_pay ?? inv.total_gross ?? 0,
            ).toLocaleString()}`,
            reference: String(inv.invoice_number || ''),
            date: String(inv.invoice_date || '').slice(0, 10),
          }));

        const pendingApprovalsArr: Array<{
          type: string;
          supplier: string;
          amount: string;
          requestedBy: string;
          date: string;
        }> = (payments || [])
          .filter((p: any) => (p.status || 'Pendiente') === 'Pendiente')
          .slice()
          .sort((a: any, b: any) => {
            const da = new Date(a.payment_date || a.created_at || 0).getTime();
            const db = new Date(b.payment_date || b.created_at || 0).getTime();
            return db - da;
          })
          .slice(0, 6)
          .map((p: any) => ({
            type: 'Pago a proveedor',
            supplier: (p.suppliers as any)?.name || 'Proveedor',
            amount: `RD$ ${Number(p.amount || 0).toLocaleString()}`,
            requestedBy: '',
            date: String(p.payment_date || '').slice(0, 10),
          }));

        setSummary({
          totalBalance,
          dueThisWeek,
          overdue,
          activeSuppliers,
        });
        setTopSuppliers(topSuppliersArr);
        setRecentPurchases(recentPurchasesArr);
        setPendingApprovals(pendingApprovalsArr);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error loading Accounts Payable dashboard data', error);
        setSummary({ totalBalance: 0, dueThisWeek: 0, overdue: 0, activeSuppliers: 0 });
        setTopSuppliers([]);
        setRecentPurchases([]);
        setPendingApprovals([]);
      }
    };

    loadDashboard();
  }, [user?.id]);

  // Module Access Functions
  const handleAccessModule = (moduleHref: string) => {
    navigate(moduleHref);
  };

  // Approval Functions
  const handleApproveRequest = (type: string, supplier: string, amount: string) => {
    if (confirm(`Approve ${type} for ${supplier} totaling ${amount}?`)) {
      alert(`${type} approved successfully for ${supplier}`);
    }
  };

  const handleRejectRequest = (type: string, supplier: string, amount: string) => {
    if (confirm(`Reject ${type} for ${supplier} totaling ${amount}?`)) {
      alert(`${type} rejected for ${supplier}`);
    }
  };

  // Navigation Functions
  const handleViewAll = (section: string) => {
    if (section === 'recent activity') {
      navigate('/accounts-payable/invoices');
      return;
    }

    navigate('/accounts-payable');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 bg-[#f7f3e8] min-h-screen p-6 rounded-2xl">
        {/* Header */}
        <div>
          <p className="text-sm uppercase tracking-wide text-[#6b5c3b]">Operations</p>
          <h1 className="text-3xl font-bold text-[#2f3e1e]">Accounts Payable Command Center</h1>
          <p className="text-[#6b5c3b]">End-to-end supplier and payment management</p>
        </div>

        {/* A/P Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {apStats.map((stat, index) => (
            <div key={index} className="bg-white rounded-xl shadow-sm border border-[#e4d8c4] p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[#6b5c3b]">{stat.title}</p>
                  <p className="text-2xl font-bold text-[#2f3e1e] mt-1">{stat.value}</p>
                </div>
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: stat.iconBg }}
                >
                  <i className={`${stat.icon} text-xl`} style={{ color: stat.iconColor }}></i>
                </div>
              </div>
              <div className="mt-4">
                <span className="text-sm font-medium text-[#6b5c3b]">
                  {stat.change}
                </span>
                <span className="text-sm text-[#9b8a64] ml-1">{stat.changeLabel}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Modules Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {modules.map((module, index) => (
            <div key={index} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow cursor-pointer">
              <div className="flex items-center mb-4">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mr-4"
                  style={{ backgroundColor: module.accentBg, color: module.accentText }}
                >
                  <i className={`${module.icon} text-xl`}></i>
                </div>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{module.title}</h3>
              <p className="text-gray-600 mb-4 text-sm">{module.description}</p>
              <button 
                onClick={() => handleAccessModule(module.href)}
                className="w-full bg-[#4b5c4b] text-white py-2 px-4 rounded-lg hover:bg-[#3f4f3f] transition-colors whitespace-nowrap shadow-sm"
              >
                Enter
              </button>

            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Suppliers */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-[#2f3e1e]">Top suppliers by balance</h3>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {topSuppliers.map((supplier, index) => (
                  <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium text-[#2f3e1e]">{supplier.name}</p>
                      <p className="text-sm text-[#6b5c3b]">Tax ID: {supplier.rnc}</p>
                      <p className="text-xs text-[#9b8a64]">Next due: {supplier.dueDate}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-[#2f3e1e]">{supplier.balance}</p>
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        supplier.status === 'Current' ? 'bg-green-100 text-green-800' :
                        supplier.status === 'Due Soon' ? 'bg-orange-100 text-orange-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {supplier.status === 'Current' ? 'Current' : supplier.status === 'Due Soon' ? 'Due soon' : 'Overdue'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recent Purchases */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-[#2f3e1e]">Recent activity</h3>
                <button 
                  onClick={() => handleViewAll('recent activity')}
                  className="text-blue-600 hover:text-blue-700 text-sm font-medium whitespace-nowrap"
                >
                  View all
                </button>
              </div>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {recentPurchases.map((purchase, index) => (
                  <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center mr-3 ${
                        purchase.type === 'Payment' ? 'bg-green-100' :
                        purchase.type === 'Purchase Order' ? 'bg-blue-100' : 'bg-orange-100'
                      }`}>
                        <i className={`${
                          purchase.type === 'Payment' ? 'ri-bank-card-line text-green-600' :
                          purchase.type === 'Purchase Order' ? 'ri-shopping-cart-line text-blue-600' :
                          'ri-file-text-line text-orange-600'
                        }`}></i>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{purchase.supplier}</p>
                        <p className="text-sm text-gray-600">{purchase.reference}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold ${
                        purchase.type === 'Payment' ? 'text-green-600' : 'text-blue-600'
                      }`}>
                        {purchase.amount}
                      </p>
                      <p className="text-xs text-gray-500">{purchase.date}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Pending Approvals */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-[#2f3e1e]">Pending approvals</h3>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pendingApprovals.map((approval, index) => (
                <div key={index} className="flex items-center justify-between p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div>
                    <p className="font-medium text-[#2f3e1e]">{approval.type}</p>
                    <p className="text-sm text-[#6b5c3b]">{approval.supplier}</p>
                    <p className="text-xs text-[#9b8a64]">Requested by: {approval.requestedBy || 'N/A'}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-[#2f3e1e]">{approval.amount}</p>
                    <div className="flex space-x-2 mt-2">
                      <button 
                        onClick={() => handleApproveRequest(approval.type, approval.supplier, approval.amount)}
                        className="px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 whitespace-nowrap"
                      >
                        Approve
                      </button>
                      <button 
                        onClick={() => handleRejectRequest(approval.type, approval.supplier, approval.amount)}
                        className="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 whitespace-nowrap"
                      >
                        Reject
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