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
            label: 'Hoy',
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
            label: `Sem ${4 - i}`,
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
            label: now.toLocaleString('es-DO', { month: 'short' }),
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
      setError('No se encontró usuario autenticado');
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

      // Los ingresos vienen negativos por la lógica de cuentas de efecto contrario, hay que invertirlos
      const revenue = Math.abs(incomeStmt.totalIncome || 0);
      const costs = Math.abs(incomeStmt.totalCosts || 0);
      const expenses = Math.abs(incomeStmt.totalExpenses || 0);

      let bankTotal = 0;
      let arTotal = 0;
      let apTotal = 0;
      const bankList: BankAccountInfo[] = [];

      // Cargar saldos bancarios reales desde la tabla bank_accounts
      try {
        const bankAccountsData = await bankAccountsService.getBalancesAsOf(uid, toDate);
        
        if (bankAccountsData && bankAccountsData.length > 0) {
          bankAccountsData.forEach((account: any) => {
            const bal = Number(account.accounting_balance ?? 0);
            bankTotal += bal;
            bankList.push({
              id: account.id,
              name: account.bank_name, // El nombre del banco está en bank_name
              balance: bal,
              bank_name: account.bank_name,
              account_number: account.account_number,
              currency: account.currency || 'DOP',
            });
          });
        }
      } catch (err) {
        console.error('Error cargando bank_accounts:', err);
      }

      // Cargar cuentas por cobrar desde facturas (invoices) filtradas por período
      try {
        const invoices = await invoicesService.getAll(uid);
        if (invoices && invoices.length > 0) {
          invoices.forEach((invoice: any) => {
            const invoiceDate = invoice.issue_date || invoice.created_at;
            
            if (invoiceDate) {
              // Normalizar la fecha de la factura a formato YYYY-MM-DD
              const invoiceDateStr = invoiceDate.split('T')[0];
              
              // Filtrar por rango de fechas del período seleccionado
              if (invoiceDateStr >= fromDate && invoiceDateStr <= toDate) {
                const total = Number(invoice.total_amount || 0);
                const paid = Number(invoice.paid_amount || 0);
                const pending = total - paid;
                
                // Sumar cuentas por cobrar (facturas pendientes)
                if (invoice.status !== 'cancelled' && pending > 0) {
                  arTotal += pending;
                }
              }
            }
          });
        }
      } catch (err) {
        console.error('Error cargando cuentas por cobrar:', err);
      }

      // Cargar cuentas por pagar desde facturas de proveedores (AP invoices) filtradas por período
      try {
        const apInvoices = await apInvoicesService.getAll(uid);
        if (apInvoices && apInvoices.length > 0) {
          apInvoices.forEach((invoice: any) => {
            const invoiceDate = invoice.invoice_date || invoice.created_at;
            
            if (invoiceDate) {
              // Normalizar la fecha de la factura a formato YYYY-MM-DD
              const invoiceDateStr = invoiceDate.split('T')[0];
              
              // Filtrar por rango de fechas del período seleccionado
              if (invoiceDateStr >= fromDate && invoiceDateStr <= toDate) {
                // Usar balance_amount si existe, sino total_to_pay, sino total_gross
                const balance = Number(invoice.balance_amount ?? invoice.total_to_pay ?? invoice.total_gross ?? 0);
                
                // Solo sumar facturas pendientes con balance positivo
                if (invoice.status !== 'cancelled' && balance > 0) {
                  apTotal += balance;
                }
              }
            }
          });
        }
      } catch (err) {
        console.error('Error cargando cuentas por pagar:', err);
      }

      // Recalcular utilidad
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
      setError(err?.message || 'Error al cargar los datos del dashboard');
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
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600" />
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
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Error al cargar estadísticas</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => fetchData()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Reintentar
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
      {/* Selector de período */}
      <div className="bg-white rounded-lg shadow p-4 flex flex-wrap gap-2">
        {([
          { key: 'daily', label: 'Hoy' },
          { key: 'weekly', label: 'Semanal' },
          { key: 'monthly', label: 'Mensual' },
          { key: 'quarterly', label: 'Trimestral' },
          { key: 'semiannual', label: 'Semestral' },
          { key: 'annual', label: 'Anual' },
        ] as { key: PeriodType; label: string }[]).map((opt) => (
          <button
            key={opt.key}
            onClick={() => setSelectedPeriod(opt.key)}
            className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors ${
              selectedPeriod === opt.key
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Primera línea: Bancos, CxC, CxP */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          className="bg-white rounded-lg shadow p-4 cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => setShowBankModal(true)}
        >
          <p className="text-sm text-gray-600">Disponibilidades en Bancos</p>
          <p className="text-2xl font-bold text-blue-600">{formatCurrency(Math.abs(kpi.bankBalance))}</p>
          <p className="text-xs text-gray-400 mt-1">Click para ver detalle</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-600">Cuentas por Cobrar</p>
          <p className="text-2xl font-bold text-green-600">{formatCurrency(kpi.receivables)}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-600">Cuentas por Pagar</p>
          <p className="text-2xl font-bold text-red-600">{formatCurrency(kpi.payables)}</p>
        </div>
      </div>

      {/* Segunda línea: Ingresos, Gastos y Utilidad */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Ingresos, Costos, Gastos y Utilidad</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-purple-50 p-4 rounded">
            <p className="text-sm text-gray-600">Ingresos</p>
            <p className="text-xl font-bold text-purple-600">{formatCurrency(Math.abs(kpi.revenue))}</p>
          </div>
          <div className="bg-amber-50 p-4 rounded">
            <p className="text-sm text-gray-600">Costos</p>
            <p className="text-xl font-bold text-amber-700">{formatCurrency(kpi.costs)}</p>
          </div>
          <div className="bg-red-50 p-4 rounded">
            <p className="text-sm text-gray-600">Gastos</p>
            <p className="text-xl font-bold text-red-600">{formatCurrency(kpi.expenses)}</p>
          </div>
          <div className="bg-teal-50 p-4 rounded">
            <p className="text-sm text-gray-600">Utilidad</p>
            <p className="text-xl font-bold text-teal-600">{formatCurrency(kpi.profit)}</p>
          </div>
        </div>
      </div>

      {/* Gráfico de barras porcentual */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Comportamiento financiero por período</h3>
        {chartData.length > 0 ? (
          <>
            <div className="h-64 flex items-end justify-around space-x-2">
              {chartData.map((d) => (
                <div key={d.label} className="flex flex-col items-center space-y-2 flex-1 max-w-[100px]">
                  <div className="flex items-end justify-center space-x-1 h-48 w-full">
                    <div
                      className="bg-purple-500 rounded-t flex-1"
                      style={{ height: `${Math.max((Math.abs(d.revenue) / maxValue) * 100, 2)}%` }}
                      title={`Ingresos: ${formatCurrency(d.revenue)}`}
                    />
                    <div
                      className="bg-amber-500 rounded-t flex-1"
                      style={{ height: `${Math.max((Math.abs(d.costs) / maxValue) * 100, 2)}%` }}
                      title={`Costos: ${formatCurrency(d.costs)}`}
                    />
                    <div
                      className="bg-red-500 rounded-t flex-1"
                      style={{ height: `${Math.max((Math.abs(d.expenses) / maxValue) * 100, 2)}%` }}
                      title={`Gastos: ${formatCurrency(d.expenses)}`}
                    />
                    <div
                      className="bg-teal-500 rounded-t flex-1"
                      style={{ height: `${Math.max((Math.abs(d.profit) / maxValue) * 100, 2)}%` }}
                      title={`Utilidad: ${formatCurrency(d.profit)}`}
                    />
                  </div>
                  <span className="text-xs text-gray-600 text-center">{d.label}</span>
                </div>
              ))}
            </div>

            {/* Porcentajes */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {chartData.map((d) => (
                <div key={d.label} className="bg-gray-50 rounded-lg p-4 text-xs space-y-1">
                  <p className="font-semibold text-gray-700 text-center mb-1">{d.label}</p>
                  <div className="flex justify-between">
                    <span className="text-purple-600 font-medium">Ingresos</span>
                    <span className="font-semibold">100%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-amber-700 font-medium">Costos</span>
                    <span className="font-semibold">{formatPercentage(d.costs, d.revenue)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-red-600 font-medium">Gastos</span>
                    <span className="font-semibold">{formatPercentage(d.expenses, d.revenue)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-teal-600 font-medium">Utilidad</span>
                    <span className="font-semibold">{formatPercentage(d.profit, d.revenue)}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="text-gray-500 text-sm">No hay datos para el período seleccionado.</div>
        )}
      </div>

      {/* Modal de bancos */}
      {showBankModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-auto">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Cuentas bancarias</h2>
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
                      className="bg-gray-50 rounded-lg px-4 py-3 border border-gray-200 hover:border-blue-300 transition-colors"
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
                              Cuenta: #{b.account_number}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-blue-600">
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
                  <div className="border-t-2 border-gray-300 pt-4 mt-4 flex items-center justify-between bg-blue-50 rounded-lg px-4 py-3">
                    <p className="font-bold text-gray-900 text-lg">Total en Bancos</p>
                    <p className="text-blue-600 font-bold text-xl">{formatCurrency(kpi.bankBalance)}</p>
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  <i className="ri-bank-line text-5xl text-gray-300 mb-3"></i>
                  <p className="text-gray-500 text-sm">No hay cuentas bancarias registradas</p>
                  <p className="text-gray-400 text-xs mt-2">Agrega cuentas bancarias en el módulo de Bancos</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
