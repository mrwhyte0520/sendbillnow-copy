import { useState, useEffect } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { chartAccountsService, bankAccountsService, invoicesService, apInvoicesService } from '../../../services/database';
import { formatAmount, formatMoney } from '../../../utils/numberFormat';

type PeriodType = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'semiannual' | 'annual';

interface KPIData {
  bankBalance: number;
  receivables: number;
  payables: number;
  revenue: number;
  costs: number;
  expenses: number;
  profit: number;
}

interface ChartData {
  label: string;
  revenue: number;
  costs: number;
  expenses: number;
  profit: number;
}

interface BankAccountInfo {
  id: string;
  code?: string;
  name: string;
  balance: number;
  bank_name?: string;
  account_number?: string;
  currency?: string;
}

export default function AdvancedKPIDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>('monthly');

  const [kpi, setKpi] = useState<KPIData>({
    bankBalance: 0,
    receivables: 0,
    payables: 0,
    revenue: 0,
    costs: 0,
    expenses: 0,
    profit: 0,
  });

  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccountInfo[]>([]);
  const [showBankModal, setShowBankModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  interface PeriodRange {
    label: string;
    from: string;
    to: string;
  }

  const getPeriodRanges = (period: PeriodType): PeriodRange[] => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const today = now.getDate();

    switch (period) {
      case 'daily': {
        const todayDate = new Date(year, month, today);
        return [
          {
            label: 'Today',
            from: todayDate.toISOString().slice(0, 10),
            to: todayDate.toISOString().slice(0, 10),
          },
        ];
      }
      case 'weekly': {
        const ranges: PeriodRange[] = [];
        for (let i = 3; i >= 0; i--) {
          const end = new Date(year, month, today);
          end.setDate(end.getDate() - i * 7);
          const start = new Date(end);
          start.setDate(end.getDate() - 6);
          ranges.push({
            label: `Week ${4 - i}`,
            from: start.toISOString().slice(0, 10),
            to: end.toISOString().slice(0, 10),
          });
        }
        return ranges;
      }
      case 'monthly': {
        const start = new Date(year, month, 1);
        const end = new Date(year, month + 1, 0);
        return [
          {
            label: now.toLocaleString('en-US', { month: 'short' }),
            from: start.toISOString().slice(0, 10),
            to: end.toISOString().slice(0, 10),
          },
        ];
      }
      case 'quarterly': {
        const currentQuarter = Math.floor(month / 3);
        const ranges: PeriodRange[] = [];
        const startQuarter = Math.max(0, currentQuarter - 3);
        for (let q = startQuarter; q <= currentQuarter; q++) {
          const start = new Date(year, q * 3, 1);
          const end = q === currentQuarter ? now : new Date(year, q * 3 + 3, 0);
          ranges.push({
            label: `Q${q + 1}`,
            from: start.toISOString().slice(0, 10),
            to: end.toISOString().slice(0, 10),
          });
        }
        return ranges;
      }
      case 'semiannual': {
        const currentSemester = Math.floor(month / 6);
        const ranges: PeriodRange[] = [];
        for (let s = 0; s <= currentSemester; s++) {
          const start = new Date(year, s * 6, 1);
          const end = s === currentSemester ? now : new Date(year, s * 6 + 6, 0);
          ranges.push({
            label: `S${s + 1}`,
            from: start.toISOString().slice(0, 10),
            to: end.toISOString().slice(0, 10),
          });
        }
        return ranges;
      }
      case 'annual': {
        const start = new Date(year, 0, 1);
        return [
          {
            label: year.toString(),
            from: start.toISOString().slice(0, 10),
            to: now.toISOString().slice(0, 10),
          },
        ];
      }
      default:
        return [];
    }
  };

  const fetchData = async () => {
    if (!user?.id) {
      setLoading(false);
      setError('No authenticated user found');
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const uid = user.id;
      const ranges = getPeriodRanges(selectedPeriod);
      if (ranges.length === 0) {
        setLoading(false);
        return;
      }
      const fromDate = ranges[0].from;
      const toDate = ranges[ranges.length - 1].to;

      const incomeStmt = await chartAccountsService.generateIncomeStatement(uid, fromDate, toDate);

      // Income comes negative due to contra account logic, need to invert
      const revenue = Math.abs(incomeStmt.totalIncome || 0);
      const costs = Math.abs(incomeStmt.totalCosts || 0);
      const expenses = Math.abs(incomeStmt.totalExpenses || 0);

      let bankTotal = 0;
      let arTotal = 0;
      let apTotal = 0;
      const bankList: BankAccountInfo[] = [];

      // Load real bank balances from bank_accounts table
      try {
        const bankAccountsData = await bankAccountsService.getBalancesAsOf(uid, toDate);
        
        if (bankAccountsData && bankAccountsData.length > 0) {
          bankAccountsData.forEach((account: any) => {
            const bal = Number(account.accounting_balance ?? 0);
            bankTotal += bal;
            bankList.push({
              id: account.id,
              name: account.bank_name, // Bank name is in bank_name
              balance: bal,
              bank_name: account.bank_name,
              account_number: account.account_number,
              currency: account.currency || 'DOP',
            });
          });
        }
      } catch (err) {
        console.error('Error loading bank_accounts:', err);
      }

      // Load accounts receivable from invoices filtered by period
      try {
        const invoices = await invoicesService.getAll(uid);
        if (invoices && invoices.length > 0) {
          invoices.forEach((invoice: any) => {
            const invoiceDate = invoice.issue_date || invoice.created_at;
            
            if (invoiceDate) {
              // Normalize invoice date to YYYY-MM-DD format
              const invoiceDateStr = invoiceDate.split('T')[0];
              
              // Filter by date range of selected period
              if (invoiceDateStr >= fromDate && invoiceDateStr <= toDate) {
                const total = Number(invoice.total_amount || 0);
                const paid = Number(invoice.paid_amount || 0);
                const pending = total - paid;
                
                // Sum accounts receivable (pending invoices)
                if (invoice.status !== 'cancelled' && pending > 0) {
                  arTotal += pending;
                }
              }
            }
          });
        }
      } catch (err) {
        console.error('Error loading accounts receivable:', err);
      }

      // Load accounts payable from supplier invoices (AP invoices) filtered by period
      try {
        const apInvoices = await apInvoicesService.getAll(uid);
        if (apInvoices && apInvoices.length > 0) {
          apInvoices.forEach((invoice: any) => {
            const invoiceDate = invoice.invoice_date || invoice.created_at;
            
            if (invoiceDate) {
              // Normalize invoice date to YYYY-MM-DD format
              const invoiceDateStr = invoiceDate.split('T')[0];
              
              // Filter by date range of selected period
              if (invoiceDateStr >= fromDate && invoiceDateStr <= toDate) {
                // Use balance_amount if exists, otherwise total_to_pay, otherwise total_gross
                const balance = Number(invoice.balance_amount ?? invoice.total_to_pay ?? invoice.total_gross ?? 0);
                
                // Only sum pending invoices with positive balance
                if (invoice.status !== 'cancelled' && balance > 0) {
                  apTotal += balance;
                }
              }
            }
          });
        }
      } catch (err) {
        console.error('Error loading accounts payable:', err);
      }

      // Recalculate profit
      const finalProfit = revenue - costs - expenses;

      setKpi({
        bankBalance: bankTotal,
        receivables: arTotal,
        payables: apTotal,
        revenue,
        costs,
        expenses,
        profit: finalProfit,
      });

      setBankAccounts(bankList);

      const chartPoints: ChartData[] = [];
      for (const r of ranges) {
        const stmt = await chartAccountsService.generateIncomeStatement(uid, r.from, r.to);
        
        const rev = Math.abs(stmt.totalIncome || 0);
        const cost = Math.abs(stmt.totalCosts || 0);
        const exp = Math.abs(stmt.totalExpenses || 0);
        
        chartPoints.push({
          label: r.label,
          revenue: rev,
          costs: cost,
          expenses: exp,
          profit: rev - cost - exp,
        });
      }
      setChartData(chartPoints);
    } catch (err: any) {
      console.error('Error loading dashboard data:', err);
      setError(err?.message || 'Error loading dashboard data');
      setKpi({
        bankBalance: 0,
        receivables: 0,
        payables: 0,
        revenue: 0,
        costs: 0,
        expenses: 0,
        profit: 0,
      });
      setChartData([]);
      setBankAccounts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user, selectedPeriod]);

  const formatCurrency = (amount: number) => formatMoney(amount || 0);

  const formatPercentage = (value: number, total: number) => {
    const base = Math.abs(total);
    if (!base || base === 0) return '0%';
    const perc = (Math.abs(value) / base) * 100;
    return `${perc.toFixed(1)}%`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-[#008000]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto bg-red-100 rounded-full flex items-center justify-center mb-4">
            <i className="ri-error-warning-line text-3xl text-red-600"></i>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Error loading statistics</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => fetchData()}
            className="px-4 py-2 bg-[#008000] text-white rounded-lg hover:bg-[#008000]"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const maxValue = Math.max(
    1,
    ...chartData.flatMap((d) => [
      Math.abs(d.revenue),
      Math.abs(d.costs),
      Math.abs(d.expenses),
      Math.abs(d.profit),
    ]),
  );

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="bg-white rounded-lg shadow p-4 flex flex-wrap gap-2">
        {([
          { key: 'daily', label: 'Today' },
          { key: 'weekly', label: 'Weekly' },
          { key: 'monthly', label: 'Monthly' },
          { key: 'quarterly', label: 'Quarterly' },
          { key: 'semiannual', label: 'Semi-annual' },
          { key: 'annual', label: 'Annual' },
        ] as { key: PeriodType; label: string }[]).map((opt) => (
          <button
            key={opt.key}
            onClick={() => setSelectedPeriod(opt.key)}
            className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors ${
              selectedPeriod === opt.key
                ? 'bg-[#008000] text-white border-[#008000]'
                : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-100'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* First row: Banks, AR, AP */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          className="bg-white rounded-lg shadow p-4 cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => setShowBankModal(true)}
        >
          <p className="text-sm text-gray-600">Bank Availability</p>
          <p className="text-2xl font-bold text-[#008000]">{formatCurrency(Math.abs(kpi.bankBalance))}</p>
          <p className="text-xs text-gray-400 mt-1">Click to view details</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-600">Accounts Receivable</p>
          <p className="text-2xl font-bold text-green-600">{formatCurrency(kpi.receivables)}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-600">Accounts Payable</p>
          <p className="text-2xl font-bold text-red-600">{formatCurrency(kpi.payables)}</p>
        </div>
      </div>

      {/* Second row: Revenue, Expenses and Profit */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Revenue, Costs, Expenses and Profit</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-[#008000]/10 p-4 rounded">
            <p className="text-sm text-stone-600">Revenue</p>
            <p className="text-xl font-bold text-[#008000]">{formatCurrency(Math.abs(kpi.revenue))}</p>
          </div>
          <div className="bg-amber-50 p-4 rounded">
            <p className="text-sm text-stone-600">Costs</p>
            <p className="text-xl font-bold text-amber-700">{formatCurrency(kpi.costs)}</p>
          </div>
          <div className="bg-rose-50 p-4 rounded">
            <p className="text-sm text-stone-600">Expenses</p>
            <p className="text-xl font-bold text-rose-600">{formatCurrency(kpi.expenses)}</p>
          </div>
          <div className="bg-stone-100 p-4 rounded">
            <p className="text-sm text-stone-600">Profit</p>
            <p className="text-xl font-bold text-stone-800">{formatCurrency(kpi.profit)}</p>
          </div>
        </div>
      </div>

      {/* Percentage bar chart */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Financial behavior by period</h3>
        {chartData.length > 0 ? (
          <>
            <div className="h-64 flex items-end justify-around space-x-2">
              {chartData.map((d) => (
                <div key={d.label} className="flex flex-col items-center space-y-2 flex-1 max-w-[100px]">
                  <div className="flex items-end justify-center space-x-1 h-48 w-full">
                    <div
                      className="bg-[#008000] rounded-t flex-1"
                      style={{ height: `${Math.max((Math.abs(d.revenue) / maxValue) * 100, 2)}%` }}
                      title={`Revenue: ${formatCurrency(d.revenue)}`}
                    />
                    <div
                      className="bg-amber-500 rounded-t flex-1"
                      style={{ height: `${Math.max((Math.abs(d.costs) / maxValue) * 100, 2)}%` }}
                      title={`Costs: ${formatCurrency(d.costs)}`}
                    />
                    <div
                      className="bg-rose-500 rounded-t flex-1"
                      style={{ height: `${Math.max((Math.abs(d.expenses) / maxValue) * 100, 2)}%` }}
                      title={`Expenses: ${formatCurrency(d.expenses)}`}
                    />
                    <div
                      className="bg-stone-600 rounded-t flex-1"
                      style={{ height: `${Math.max((Math.abs(d.profit) / maxValue) * 100, 2)}%` }}
                      title={`Profit: ${formatCurrency(d.profit)}`}
                    />
                  </div>
                  <span className="text-xs text-gray-600 text-center">{d.label}</span>
                </div>
              ))}
            </div>

            {/* Percentages */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {chartData.map((d) => (
                <div key={d.label} className="bg-gray-50 rounded-lg p-4 text-xs space-y-1">
                  <p className="font-semibold text-gray-700 text-center mb-1">{d.label}</p>
                  <div className="flex justify-between">
                    <span className="text-[#008000] font-medium">Revenue</span>
                    <span className="font-semibold">100%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-amber-700 font-medium">Costs</span>
                    <span className="font-semibold">{formatPercentage(d.costs, d.revenue)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-rose-600 font-medium">Expenses</span>
                    <span className="font-semibold">{formatPercentage(d.expenses, d.revenue)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-700 font-medium">Profit</span>
                    <span className="font-semibold">{formatPercentage(d.profit, d.revenue)}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="text-gray-500 text-sm">No data for the selected period.</div>
        )}
      </div>

      {/* Bank modal */}
      {showBankModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-auto">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Bank Accounts</h2>
              <button
                onClick={() => setShowBankModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <i className="ri-close-line text-2xl" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {bankAccounts.length > 0 ? (
                <>
                  {bankAccounts.map((b) => (
                    <div
                      key={b.id}
                      className="bg-stone-50 rounded-lg px-4 py-3 border border-stone-200 hover:border-[#008000]/50 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <p className="font-semibold text-gray-900 mb-1">
                            {b.name}
                          </p>
                          {b.bank_name && (
                            <p className="text-xs text-gray-500">
                              <i className="ri-bank-line mr-1"></i>
                              {b.bank_name}
                            </p>
                          )}
                          {b.account_number && (
                            <p className="text-xs text-gray-400 mt-1">
                              Account: #{b.account_number}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-[#008000]">
                            {b.currency === 'DOP' ? 'RD$' : b.currency === 'USD' ? '$' : b.currency || 'RD$'}{' '}
                            {formatAmount(b.balance || 0)}
                          </p>
                          {b.currency && b.currency !== 'DOP' && (
                            <p className="text-xs text-gray-500">{b.currency}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="border-t-2 border-stone-300 pt-4 mt-4 flex items-center justify-between bg-[#008000]/10 rounded-lg px-4 py-3">
                    <p className="font-bold text-stone-900 text-lg">Total in Banks</p>
                    <p className="text-[#008000] font-bold text-xl">{formatCurrency(kpi.bankBalance)}</p>
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  <i className="ri-bank-line text-5xl text-gray-300 mb-3"></i>
                  <p className="text-gray-500 text-sm">No bank accounts registered</p>
                  <p className="text-gray-400 text-xs mt-2">Add bank accounts in the Banks module</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
