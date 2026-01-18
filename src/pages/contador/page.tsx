import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { useAuth } from '../../hooks/useAuth';
import { apInvoicesService, chartAccountsService, invoicesService, resolveTenantId } from '../../services/database';
import { formatMoney } from '../../utils/numberFormat';
import { employeesService } from '../../services/contador/staff.service';
import { cashTransactionsService } from '../../services/contador/cash.service';
import { payrollRunsService } from '../../services/contador/payroll.service';
import { vendorsService } from '../../services/contador/vendors.service';
import { productsService } from '../../services/contador/products.service';
import { balancesService } from '../../services/contador/inventory.service';
import { returnsService } from '../../services/contador/returns.service';

export default function ContadorPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [monthlyRevenue, setMonthlyRevenue] = useState(0);
  const [pendingInvoicesAmount, setPendingInvoicesAmount] = useState(0);
  const [accountsPayable, setAccountsPayable] = useState(0);
  const [netProfit, setNetProfit] = useState(0);

  const [activeEmployees, setActiveEmployees] = useState(0);
  const [cashToday, setCashToday] = useState(0);
  const [nextPayrollLabel, setNextPayrollLabel] = useState<string>('');
  const [activeVendors, setActiveVendors] = useState(0);
  const [productsCount, setProductsCount] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [pendingReturnsCount, setPendingReturnsCount] = useState(0);

  useEffect(() => {
    const loadStats = async () => {
      if (!user?.id) return;

      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) return;

      try {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const fromDate = start.toISOString().slice(0, 10);
        const toDate = end.toISOString().slice(0, 10);

        const [incomeStmt, invoices, apInvoices, employeesCount] = await Promise.all([
          chartAccountsService.generateIncomeStatement(tenantId, fromDate, toDate),
          invoicesService.getAll(tenantId),
          apInvoicesService.getAll(tenantId),
          employeesService.getActiveCount(tenantId),
        ]);

        setMonthlyRevenue(Number(incomeStmt?.totalIncome || 0));
        setNetProfit(Number(incomeStmt?.netIncome || 0));

        const pendingInv = (invoices || []).filter((inv: any) => {
          const status = String(inv?.status || '').toLowerCase();
          return status === 'pending' || status === 'unpaid' || status === 'vencida' || status === 'overdue';
        });
        const pendingInvAmount = pendingInv.reduce(
          (sum: number, inv: any) => sum + Number(inv?.total_amount ?? inv?.total ?? 0),
          0
        );
        setPendingInvoicesAmount(pendingInvAmount);

        const openAp = (apInvoices || []).filter((inv: any) => {
          const status = String(inv?.status || '').toLowerCase();
          return status !== 'paid' && status !== 'void' && status !== 'cancelled' && status !== 'canceled';
        });
        const apAmount = openAp.reduce(
          (sum: number, inv: any) => sum + Number(inv?.balance_amount ?? inv?.total_to_pay ?? 0),
          0
        );
        setAccountsPayable(apAmount);

        setActiveEmployees(employeesCount);
      } catch (error) {
        console.error('Error loading contador dashboard stats:', error);
        setMonthlyRevenue(0);
        setNetProfit(0);
        setPendingInvoicesAmount(0);
        setAccountsPayable(0);
        setActiveEmployees(0);
      }

      try {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        const txs = await cashTransactionsService.list(tenantId, {
          startDate: todayStart.toISOString(),
          endDate: tomorrowStart.toISOString(),
        });

        const net = (txs || []).reduce((sum, tx) => {
          const amt = Number((tx as any)?.amount || 0);
          const type = String((tx as any)?.type || '').toLowerCase();
          if (type === 'sale_cash_in' || type === 'opening_adjustment') return sum + amt;
          if (
            type === 'cash_drop' ||
            type === 'paid_out_expense' ||
            type === 'refund_cash_out' ||
            type === 'closing_adjustment'
          )
            return sum - amt;
          return sum;
        }, 0);

        setCashToday(net);
      } catch (error) {
        console.error('Error loading cash today stats:', error);
        setCashToday(0);
      }

      try {
        const runs = await payrollRunsService.list(tenantId, { year: new Date().getFullYear() });
        const upcoming = (runs || [])
          .filter((r) => !!r.pay_date)
          .sort((a, b) => new Date(a.pay_date).getTime() - new Date(b.pay_date).getTime())
          .find((r) => new Date(r.pay_date).getTime() >= Date.now() && String(r.status) !== 'void');

        if (upcoming?.pay_date) {
          const label = new Date(upcoming.pay_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
          setNextPayrollLabel(`Next: ${label}`);
        } else {
          setNextPayrollLabel('No scheduled run');
        }
      } catch (error) {
        console.error('Error loading payroll next run:', error);
        setNextPayrollLabel('');
      }

      try {
        const [vends, prods, balances, pendingReturns] = await Promise.all([
          vendorsService.list(tenantId),
          productsService.list(tenantId),
          balancesService.list(tenantId),
          returnsService.listPending(tenantId),
        ]);

        setActiveVendors((vends || []).filter((v: any) => String(v?.status || '').toLowerCase() === 'active').length);
        setProductsCount((prods || []).length);

        const low = (balances || []).filter((b: any) => {
          const qty = Number(b?.qty_on_hand || 0);
          const reorder = Number(b?.reorder_level || 0);
          return qty > 0 && reorder > 0 && qty <= reorder;
        }).length;
        setLowStockCount(low);

        setPendingReturnsCount((pendingReturns || []).length);
      } catch (error) {
        console.error('Error loading contador quick access badges:', error);
        setActiveVendors(0);
        setProductsCount(0);
        setLowStockCount(0);
        setPendingReturnsCount(0);
      }
    };

    loadStats();
  }, [user?.id]);

  const submodules = useMemo(
    () => [
      {
        name: 'Staff Report',
        description: 'Employee management, attendance & performance tracking',
        icon: 'ri-team-line',
        href: '/contador/staff-report',
        stats: `${activeEmployees} Employees`,
      },
      {
        name: 'Cash & Finance',
        description: 'Cash drawer operations, sales & daily closing',
        icon: 'ri-money-dollar-box-line',
        href: '/contador/caja-finanza',
        stats: `${formatMoney(cashToday)} Today`,
      },
      {
        name: 'Payroll',
        description: 'US payroll calculations, FICA & tax withholdings',
        icon: 'ri-wallet-3-line',
        href: '/contador/nomina',
        stats: nextPayrollLabel || 'Payroll',
      },
      {
        name: 'Purchases & Vendors',
        description: 'Vendor management, purchase orders & AP control',
        icon: 'ri-truck-line',
        href: '/contador/compra-proveedores',
        stats: `${activeVendors} Active Vendors`,
      },
      {
        name: 'Products',
        description: 'Product catalog, pricing & profit margin analysis',
        icon: 'ri-shopping-bag-line',
        href: '/contador/products',
        stats: `${productsCount} Products`,
      },
      {
        name: 'Inventory',
        description: 'Stock control, valuation methods & movement tracking',
        icon: 'ri-archive-line',
        href: '/contador/inventario',
        stats: `${lowStockCount} Low Stock`,
      },
      {
        name: 'Returns',
        description: 'Customer & vendor returns, refunds & adjustments',
        icon: 'ri-arrow-go-back-line',
        href: '/contador/devoluciones',
        stats: `${pendingReturnsCount} Pending`,
      },
      {
        name: 'Financial Reports',
        description: 'P&L, Balance Sheet, Cash Flow & tax reports',
        icon: 'ri-file-chart-line',
        href: '/contador/reportes',
        stats: 'IRS Ready',
      },
    ],
    [activeEmployees, activeVendors, cashToday, lowStockCount, nextPayrollLabel, pendingReturnsCount, productsCount]
  );

  return (
    <DashboardLayout>
      <div className="p-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-gradient-to-br from-[#008000] to-[#006400] rounded-xl shadow-lg">
              <i className="ri-calculator-line text-3xl text-white"></i>
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Accounting Module</h1>
              <p className="text-gray-600">Complete accounting & financial management system</p>
            </div>
          </div>
        </div>

        {/* Quick Stats Banner */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm">Monthly Revenue</p>
                <p className="text-2xl font-bold text-gray-900">{formatMoney(monthlyRevenue)}</p>
              </div>
              <div className="p-2 bg-[#008000]/10 rounded-lg">
                <i className="ri-line-chart-line text-2xl text-[#008000]"></i>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm">Pending Invoices</p>
                <p className="text-2xl font-bold text-gray-900">{formatMoney(pendingInvoicesAmount)}</p>
              </div>
              <div className="p-2 bg-[#008000]/10 rounded-lg">
                <i className="ri-file-list-3-line text-2xl text-[#008000]"></i>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm">Accounts Payable</p>
                <p className="text-2xl font-bold text-gray-900">{formatMoney(accountsPayable)}</p>
              </div>
              <div className="p-2 bg-[#008000]/10 rounded-lg">
                <i className="ri-money-dollar-circle-line text-2xl text-[#008000]"></i>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm">Net Profit</p>
                <p className="text-2xl font-bold text-gray-900">{formatMoney(netProfit)}</p>
              </div>
              <div className="p-2 bg-[#008000]/10 rounded-lg">
                <i className="ri-funds-line text-2xl text-[#008000]"></i>
              </div>
            </div>
          </div>
        </div>

        {/* Submodule Cards - 3D Style */}
        <h2 className="text-xl font-semibold text-gray-800 mb-4">Quick Access</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {submodules.map((module, index) => (
            <div
              key={index}
              onClick={() => navigate(module.href)}
              className="group cursor-pointer perspective-1000"
              style={{ perspective: '1000px' }}
            >
              <div
                className="relative bg-white rounded-2xl p-6 transition-all duration-300 ease-out
                  shadow-[0_10px_40px_-15px_rgba(0,0,0,0.2)]
                  hover:shadow-[0_20px_50px_-15px_rgba(0,0,0,0.3)]
                  transform-gpu
                  hover:-translate-y-2
                  hover:rotate-x-[-5deg]
                  border border-gray-100"
                style={{
                  transformStyle: 'preserve-3d',
                }}
              >
                {/* Colored accent bar */}
                <div
                  className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl"
                  style={{ backgroundColor: '#008000' }}
                ></div>

                {/* Icon with 3D effect */}
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center mb-4 transition-all duration-300
                    shadow-[0_8px_16px_-4px_rgba(0,0,0,0.2)]
                    group-hover:shadow-[0_12px_24px_-4px_rgba(0,0,0,0.3)]
                    group-hover:scale-110"
                  style={{
                    backgroundColor: '#00800015',
                    transform: 'translateZ(20px)',
                  }}
                >
                  <i
                    className={`${module.icon} text-2xl transition-transform duration-300 group-hover:scale-110`}
                    style={{ color: '#008000' }}
                  ></i>
                </div>

                {/* Content */}
                <h3 className="font-bold text-gray-900 mb-2 text-lg">{module.name}</h3>
                <p className="text-sm text-gray-500 mb-4 line-clamp-2">{module.description}</p>

                {/* Stats badge */}
                <div className="flex items-center justify-between">
                  <span
                    className="text-xs font-medium px-3 py-1 rounded-full"
                    style={{
                      backgroundColor: '#00800015',
                      color: '#008000',
                    }}
                  >
                    {module.stats}
                  </span>
                  <i
                    className="ri-arrow-right-line text-gray-400 group-hover:text-gray-600 
                      transition-all duration-300 group-hover:translate-x-1"
                  ></i>
                </div>

                {/* 3D shine effect */}
                <div
                  className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                  style={{
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.4) 0%, transparent 50%, transparent 100%)',
                  }}
                ></div>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom Info */}
        <div className="mt-8 bg-gradient-to-r from-[#008000]/10 to-[#006400]/5 rounded-2xl p-6 border border-[#008000]/20">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-[#008000] rounded-xl shadow-lg">
              <i className="ri-shield-check-line text-xl text-white"></i>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">US GAAP Compliant</h3>
              <p className="text-sm text-gray-600">
                All reports and calculations follow US Generally Accepted Accounting Principles. 
                Ready for IRS filing, CPA review, and bank audits.
              </p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
