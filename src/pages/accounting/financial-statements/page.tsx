import { useState, useEffect } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { financialReportsService, chartAccountsService, financialStatementsService, accountingSettingsService, inventoryService, settingsService } from '../../../services/database';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { formatAmount, formatMoney } from '../../../utils/numberFormat';
import { formatDate } from '../../../utils/dateFormat';
import DateInput from '../../../components/common/DateInput';

const theme = {
  primary: '#4b5c4b',
  primaryHover: '#3f4f3f',
  muted: '#eef2ea',
  softBorder: '#dfe4db',
  softText: '#2f3a2f',
  badgeBg: '#e3e8dd',
};

// Estilos CSS para impresión
const printStyles = `
  @media print {
    @page { 
      size: letter portrait; 
      /* Márgenes mínimos para maximizar espacio */
      margin: 0.5cm 1cm;
    }
    body * { visibility: hidden; }
    #printable-statement, #printable-statement * { visibility: visible; }
    #printable-statement { 
      position: absolute; 
      left: 0; 
      top: 0; 
      width: 100%; 
      font-size: 7pt !important;
      line-height: 1.2 !important;
    }
    #printable-statement h1 { font-size: 10pt !important; margin-bottom: 2px !important; }
    #printable-statement h2 { font-size: 8pt !important; margin-bottom: 2px !important; }
    #printable-statement h3 { font-size: 7pt !important; margin-bottom: 2px !important; }
    #printable-statement .text-sm { font-size: 7pt !important; }
    #printable-statement .text-base { font-size: 8pt !important; }
    #printable-statement .text-xs { font-size: 6pt !important; }
    #printable-statement div { line-height: 1.2 !important; }
    #printable-statement .py-0\\.5 { padding-top: 0px !important; padding-bottom: 0px !important; }
    #printable-statement .pl-4 { padding-left: 8px !important; }
    #printable-statement .mb-8 { margin-bottom: 4px !important; }
    #printable-statement .mb-4 { margin-bottom: 2px !important; }
    #printable-statement .mb-3 { margin-bottom: 2px !important; }
    #printable-statement .mb-2 { margin-bottom: 1px !important; }
    #printable-statement .mt-2 { margin-top: 1px !important; }
    #printable-statement .mt-3 { margin-top: 2px !important; }
    #printable-statement .pt-2 { padding-top: 2px !important; }
    #printable-statement .pt-4 { padding-top: 4px !important; }
    #printable-statement .pb-1 { padding-bottom: 1px !important; }
    #printable-statement .space-y-6 > * + * { margin-top: 4px !important; }
    #printable-statement .gap-6 { gap: 12px !important; }
    body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    table { page-break-inside: avoid; font-size: 7pt; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
    .print-hidden { display: none !important; }
    .hide-zero-on-print { display: none !important; }
    .print-only { display: block !important; }
  }
  .print-only { display: none; }
`;

// Fecha de arranque contable del sistema: permitir todos los movimientos históricos
const SYSTEM_START_DATE = '2000-01-01';

interface FinancialStatement {
  id: string;
  name: string;
  type: 'balance_sheet' | 'income_statement' | 'cash_flow' | 'equity_statement';
  period: string;
  status: 'draft' | 'final' | 'approved';
  created_at: string;
  totalAssets?: number;
  totalLiabilities?: number;
  totalEquity?: number;
  totalRevenue?: number;
  totalExpenses?: number;
  netIncome?: number;
}

interface FinancialData {
  assets: {
    current: { code: string; name: string; amount: number }[];
    nonCurrent: { code: string; name: string; amount: number }[];
  };
  liabilities: {
    current: { code: string; name: string; amount: number }[];
    nonCurrent: { code: string; name: string; amount: number }[];
  };
  equity: { code: string; name: string; amount: number }[];
  revenue: { code: string; name: string; amount: number }[];
  costs: { code: string; name: string; amount: number }[];
  expenses: { code: string; name: string; amount: number }[];
}

interface FinancialTotals {
  totalCurrentAssets: number;
  totalNonCurrentAssets: number;
  totalAssets: number;
  totalCurrentLiabilities: number;
  totalNonCurrentLiabilities: number;
  totalLiabilities: number;
  totalEquity: number;
  totalRevenue: number;
  totalCosts: number;
  totalExpenses: number;
  netIncome: number;
}

export default function FinancialStatementsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'statements' | 'balance' | 'income' | 'costs' | 'expenses' | 'cashflow' | 'anexos'>('statements');
  const [statements, setStatements] = useState<FinancialStatement[]>([]);
  const [companyInfo, setCompanyInfo] = useState<any | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState(() => new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [incomeFromDate, setIncomeFromDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  }); // YYYY-MM-DD
  const [incomeToDate, setIncomeToDate] = useState<string | null>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  }); // YYYY-MM-DD (fin de rango opcional)
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [comparisonFromDate, setComparisonFromDate] = useState<string | null>(null);
  const [comparisonToDate, setComparisonToDate] = useState<string | null>(null);
  const [comparisonIncome, setComparisonIncome] = useState<{
    totalRevenue: number;
    totalCosts: number;
    grossProfit: number;
    operatingExpenses: number;
    financialExpenses: number;
    operatingIncome: number;
    incomeBeforeTaxReserves: number;
    netIncome: number;
  } | null>(null);
  const [showComparisonControls, setShowComparisonControls] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showNewStatementModal, setShowNewStatementModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedStatement, setSelectedStatement] = useState<FinancialStatement | null>(null);
  const [showExpensesDetail, setShowExpensesDetail] = useState(false);

  // Estado para Anexos a los Estados Financieros
  const [anexosData, setAnexosData] = useState<{
    accounts: { code: string; name: string; type: string; balance: number }[];
    groupedByType: Record<string, { accounts: { code: string; name: string; balance: number }[]; subtotal: number }>;
  }>({
    accounts: [],
    groupedByType: {},
  });

  const [periodOptions] = useState(() => {
    const options: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = d.toISOString().slice(0, 7); // YYYY-MM
      const labelRaw = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const label = labelRaw.charAt(0).toUpperCase() + labelRaw.slice(1);
      options.push({ value, label });
    }
    return options;
  });

  const [financialData, setFinancialData] = useState<FinancialData>({
    assets: { current: [], nonCurrent: [] },
    liabilities: { current: [], nonCurrent: [] },
    equity: [],
    revenue: [],
    costs: [],
    expenses: []
  });

  // Código normalizado de la cuenta de ITBIS en compras para el Balance (configuración o 110201)
  const [itbisAccountCode, setItbisAccountCode] = useState<string | null>(null);

  const [cashFlow, setCashFlow] = useState<{
    operatingCashFlow: number;
    investingCashFlow: number;
    financingCashFlow: number;
    netCashFlow: number;
    openingCash: number;
    closingCash: number;
  }>({
    operatingCashFlow: 0,
    investingCashFlow: 0,
    financingCashFlow: 0,
    netCashFlow: 0,
    openingCash: 0,
    closingCash: 0,
  });

  const [comparisonTotals, setComparisonTotals] = useState<FinancialTotals | null>(null);
  const [comparisonCashFlow, setComparisonCashFlow] = useState<{
    operatingCashFlow: number;
    investingCashFlow: number;
    financingCashFlow: number;
    netCashFlow: number;
    openingCash: number;
    closingCash: number;
  } | null>(null);

  const companyNameForHeader = (companyInfo as any)?.name || (companyInfo as any)?.company_name || '';
  const companyRncForHeader = (companyInfo as any)?.rnc || (companyInfo as any)?.tax_id || (companyInfo as any)?.ruc || '';
  const companyAddressForHeader = (companyInfo as any)?.address || '';
  const companyPhoneForHeader = (companyInfo as any)?.phone || '';
  const companyEmailForHeader = (companyInfo as any)?.email || '';

  useEffect(() => {
    loadStatements();
  }, [user, selectedPeriod]);

  useEffect(() => {
    const loadCompanyInfo = async () => {
      try {
        const info = await settingsService.getCompanyInfo();
        setCompanyInfo(info);
      } catch {
        setCompanyInfo(null);
      }
    };

    loadCompanyInfo();
  }, [user?.id]);

  useEffect(() => {
    const period = selectedPeriod || new Date().toISOString().slice(0, 7);
    const [yearStr, monthStr] = period.split('-');
    const baseYear = parseInt(yearStr, 10);
    const baseMonth = parseInt(monthStr, 10);
    if (!baseYear || !baseMonth) return;
    setIncomeFromDate(new Date(baseYear, baseMonth - 1, 1).toISOString().slice(0, 10));
    setIncomeToDate(new Date(baseYear, baseMonth, 0).toISOString().slice(0, 10));
    setUseCustomRange(false);
  }, [selectedPeriod]);

  useEffect(() => {
    // Cargar datos financieros / cash flow cuando cambie el período o la pestaña relevante
    if (!user) return;

    // Debug: verificar qué usuario se está usando para los estados financieros
    // eslint-disable-next-line no-console
    console.log('FinancialStatementsPage user.id =', user.id);

    // Determinar rango de fechas para los reportes
    const now = new Date();
    const defaultPeriod = selectedPeriod || now.toISOString().slice(0, 7); // YYYY-MM
    const [yearStr, monthStr] = defaultPeriod.split('-');
    const baseYear = parseInt(yearStr, 10);
    const baseMonth = parseInt(monthStr, 10);
    if (!baseYear || !baseMonth) return;

    // Rango mensual por defecto (para Balance, Costos, Gastos, etc.)
    const monthFromDate = new Date(baseYear, baseMonth - 1, 1).toISOString().slice(0, 10);
    const monthToDate = new Date(baseYear, baseMonth, 0).toISOString().slice(0, 10);

    let fromDate = monthFromDate;
    let toDate = monthToDate;

    // Para Estado de Resultados, Costos, Gastos y Flujo de Efectivo:
    // usar SIEMPRE las fechas seleccionadas en los inputs si existen; de lo contrario, el mes completo
    if (activeTab === 'income' || activeTab === 'costs' || activeTab === 'expenses' || activeTab === 'cashflow') {
      const from = incomeFromDate || monthFromDate;
      const to = incomeToDate || (incomeFromDate ? incomeFromDate : monthToDate);

      // Parsear como fecha local para evitar desfase (ej. mostrar 30 en lugar de 01)
      const parseYMDLocal = (s: string): Date => {
        const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(s);
        if (m) {
          const y = parseInt(m[1], 10);
          const mo = parseInt(m[2], 10) - 1;
          const d = parseInt(m[3], 10);
          return new Date(y, mo, d);
        }
        return new Date(s);
      };

      let fromObj = parseYMDLocal(from);
      let toObj = parseYMDLocal(to);

      if (Number.isNaN(fromObj.getTime())) {
        fromObj = new Date(monthFromDate);
      }
      if (Number.isNaN(toObj.getTime())) {
        toObj = fromObj;
      }

      if (toObj.getTime() < fromObj.getTime()) {
        toObj = fromObj;
      }

      fromDate = fromObj.toISOString().slice(0, 10);
      toDate = toObj.toISOString().slice(0, 10);
    }

    const loadFinancialData = async () => {
      try {
        // Para todos los estados (incluyendo el Balance), usar solo el período seleccionado,
        // respetando la fecha de arranque del sistema.
        let effectiveFrom = fromDate;

        let trialBalance: any[] = [];

        if (toDate < SYSTEM_START_DATE) {
          // Si el período termina antes de la fecha de arranque, no mostrar saldos
          trialBalance = [];
        } else {
          if (effectiveFrom < SYSTEM_START_DATE) {
            effectiveFrom = SYSTEM_START_DATE;
          }

          // Para el Balance General se requiere acumulado (al corte), no solo el movimiento del mes.
          // Para los demás estados (Resultados/Costos/Gastos) se mantiene el rango del período.
          const trialFrom = activeTab === 'balance' ? SYSTEM_START_DATE : effectiveFrom;

          // Debug: ver rango usado para la balanza
          // eslint-disable-next-line no-console
          console.log('[FS] loadFinancialData', { selectedPeriod, fromDate: trialFrom, toDate, activeTab });

          trialBalance = await financialReportsService.getTrialBalance(user.id, trialFrom, toDate);

          // Debug: cuántas cuentas regresó la balanza
          // eslint-disable-next-line no-console
          console.log('[FS] trialBalance length =', (trialBalance || []).length);
        }

        const nextData: FinancialData = {
          assets: { current: [], nonCurrent: [] },
          liabilities: { current: [], nonCurrent: [] },
          equity: [],
          revenue: [],
          costs: [],
          expenses: []
        };

        // Función helper para identificar cuentas de efecto contrario
        const isContraAccount = (_code: string, name: string, type: string): boolean => {
          const nameLower = name.toLowerCase();
          
          // Depreciación acumulada (activo - efecto contrario)
          // SOLO si el nombre contiene palabras clave específicas
          if (type === 'asset' || type === 'activo') {
            if (nameLower.includes('depreci') || 
                nameLower.includes('amortiz') || 
                nameLower.includes('acumulad')) {
              return true;
            }
          }
          
          // Devoluciones y descuentos sobre ventas (ingreso - efecto contrario)
          // SOLO si el nombre contiene palabras clave específicas
          if (type === 'income' || type === 'ingreso') {
            if (nameLower.includes('devoluc') || 
                nameLower.includes('descuent') ||
                nameLower.includes('rebaj')) {
              return true;
            }
          }
          
          // Pérdida en diferencia cambiaria (gasto con efecto contrario en algunos casos)
          // Estas ya son gastos, no necesitan inversión
          
          return false;
        };

        (trialBalance || []).forEach((acc: any) => {
          let balance = Number(acc.balance) || 0;
          if (Math.abs(balance) < 0.005) return; // omitir saldos cero

          const code = String(acc.code || '');
          const baseName = String(acc.name || '');
          // Mostrar solo el nombre de la cuenta en los estados (sin prefijo de código)
          const label = baseName;

          // Normalizar código (remover puntos para comparación)
          const normalizedCode = code.replace(/\./g, '');
          const type = String(acc.type || '');
          
          switch (acc.type) {
            case 'asset':
            case 'activo': {
              const item = { code, name: label, amount: balance };
              // Activos corrientes: 10,11,12,13 (ej: 1.1.02 → 1102 → empieza con 11)
              if (normalizedCode.startsWith('10') || normalizedCode.startsWith('11') || 
                  normalizedCode.startsWith('12') || normalizedCode.startsWith('13')) {
                nextData.assets.current.push(item);
              } else {
                nextData.assets.nonCurrent.push(item);
              }
              break;
            }
            case 'liability':
            case 'pasivo': {
              const item = { code, name: label, amount: balance };
              // Pasivos corrientes: 20,21 (ej: 2.1.01 → 2101 → empieza con 21)
              if (normalizedCode.startsWith('20') || normalizedCode.startsWith('21')) {
                nextData.liabilities.current.push(item);
              } else {
                nextData.liabilities.nonCurrent.push(item);
              }
              break;
            }
            case 'equity':
            case 'patrimonio':
              nextData.equity.push({ code, name: label, amount: balance });
              break;
            case 'income':
            case 'ingreso': {
              // Para ingresos mostramos las ventas e ingresos como montos positivos,
              // y solo tratamos como contra-ingresos (que restan) aquellas cuentas
              // que claramente son descuentos/devoluciones sobre ventas.
              const contra = isContraAccount(code, baseName, type);
              let amount = Math.abs(balance);
              if (contra) {
                amount = -Math.abs(balance);
              }
              nextData.revenue.push({ code, name: label, amount });
              break;
            }
            case 'cost':
            case 'costo':
            case 'costos':
              nextData.costs.push({ code, name: label, amount: Math.abs(balance) });
              break;
            case 'expense':
            case 'gasto':
              nextData.expenses.push({ code, name: label, amount: Math.abs(balance) });
              break;
            default:
              break;
          }
        });

        // Agrupar ITBIS pagado en compras (110201) y retención ITBIS pagado en servicios (110202)
        // bajo la cuenta control Saldo a favor en ITBIS (1102) en el Balance General
        try {
          const normalize = (c: string | undefined) => (c || '').replace(/\./g, '');
          const isITBISDetail = (code: string | undefined) => {
            const n = normalize(code);
            return n === '110201' || n === '110202';
          };

          // Sumar los montos de las cuentas detalle
          const itbisSum = nextData.assets.current
            .filter((i) => isITBISDetail(i.code))
            .reduce((sum, i) => sum + (Number(i.amount) || 0), 0);

          if (Math.abs(itbisSum) > 0.005) {
            // Quitar las cuentas detalle del arreglo
            nextData.assets.current = nextData.assets.current.filter((i) => !isITBISDetail(i.code));

            // Intentar obtener el nombre de la cuenta control 1102 desde la balanza
            let name1102 = 'Saldo a favor en ITBIS';
            const parentAcc = (trialBalance || []).find((acc: any) => normalize(String(acc.code || '')) === '1102');
            if (parentAcc?.name) {
              name1102 = String(parentAcc.name);
            }

            // Agregar la cuenta control 1102 con el total
            nextData.assets.current.push({ code: '1102', name: name1102, amount: itbisSum });
          }
        } catch (aggErr) {
          // eslint-disable-next-line no-console
          console.error('[Balance] Error aggregating ITBIS control account (1102):', aggErr);
        }

        setFinancialData(nextData);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error loading financial data for statements:', error);
      }
    };

    const loadCashFlow = async () => {
      try {
        const result = await chartAccountsService.generateCashFlowStatement(user.id, fromDate, toDate);

        const fromDateObj = new Date(fromDate);
        const prevToObj = new Date(fromDateObj.getTime() - 24 * 60 * 60 * 1000);
        const prevToDate =
          prevToObj.getFullYear() <= 1900
            ? null
            : prevToObj.toISOString().slice(0, 10);

        // Fecha de inicio del mes ANTERIOR al del reporte
        const [prevTrial, finalTrial] = await Promise.all([
          prevToDate
            ? financialReportsService.getTrialBalance(user.id, '1900-01-01', prevToDate)
            : Promise.resolve([]),
          financialReportsService.getTrialBalance(user.id, '1900-01-01', toDate),
        ]);

        const sumCash = (trial: any[]) => {
          return (trial || []).reduce((sum, acc: any) => {
            const code = String(acc.code || '');
            const normalizedCode = code.replace(/\./g, '');
            const type = String(acc.type || '');
            if (!(type === 'asset' || type === 'activo')) return sum;
            // Incluir múltiples formatos de códigos para Caja y Bancos
            if (!normalizedCode.startsWith('10') && !normalizedCode.startsWith('110') && 
                !normalizedCode.startsWith('111') && !normalizedCode.startsWith('1102')) {
              return sum;
            }
            const balance = Number(acc.balance) || 0;
            return sum + balance;
          }, 0);
        };

        const openingCash = prevTrial ? sumCash(prevTrial as any[]) : 0;
        const closingCash = sumCash(finalTrial as any[]);

        setCashFlow({
          operatingCashFlow: result.operatingCashFlow || 0,
          investingCashFlow: result.investingCashFlow || 0,
          financingCashFlow: result.financingCashFlow || 0,
          netCashFlow: result.netCashFlow || 0,
          openingCash,
          closingCash,
        });
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error loading cash flow statement:', error);
        setCashFlow({
          operatingCashFlow: 0,
          investingCashFlow: 0,
          financingCashFlow: 0,
          netCashFlow: 0,
          openingCash: 0,
          closingCash: 0,
        });
      }
    };

    if (activeTab === 'balance' || activeTab === 'income' || activeTab === 'costs' || activeTab === 'expenses') {
      void loadFinancialData();
    } else if (activeTab === 'cashflow') {
      void loadCashFlow();
    }
  }, [user, selectedPeriod, incomeFromDate, incomeToDate, useCustomRange, activeTab]);

  useEffect(() => {
    const loadItbisAccountCode = async () => {
      try {
        if (!user) {
          setItbisAccountCode('110201');
          return;
        }

        const [settings, accounts] = await Promise.all([
          accountingSettingsService.get(user.id),
          chartAccountsService.getAll(user.id),
        ]);

        let target: string | null = null;
        const itbisAccountId = settings?.itbis_receivable_account_id
          ? String(settings.itbis_receivable_account_id)
          : null;

        if (itbisAccountId && Array.isArray(accounts) && accounts.length > 0) {
          const found = (accounts as any[]).find((acc) => String(acc.id) === itbisAccountId);
          if (found?.code) {
            target = String(found.code).replace(/\./g, '');
          }
        }

        if (!target) {
          target = '110201';
        }

        setItbisAccountCode(target);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Error loading ITBIS account code for balance:', e);
        setItbisAccountCode('110201');
      }
    };

    void loadItbisAccountCode();
  }, [user]);

  useEffect(() => {
    const loadCostOfSales = async () => {
      try {
        if (!user) return;

        // Punto de partida: mes seleccionado (para fallback)
        const now = new Date();
        const basePeriod = selectedPeriod || now.toISOString().slice(0, 7); // YYYY-MM
        const [yearStr, monthStr] = basePeriod.split('-');
        const baseYear = parseInt(yearStr, 10);
        const baseMonth = parseInt(monthStr, 10);
        if (!baseYear || !baseMonth) return;

        const monthFromDate = new Date(baseYear, baseMonth - 1, 1).toISOString().slice(0, 10);
        const monthToDate = new Date(baseYear, baseMonth, 0).toISOString().slice(0, 10);

        // Por defecto, usar el mes completo (para que Inventario Inicial sea el cierre del mes anterior).
        // Si el usuario selecciona fechas manualmente, usar el día/rango seleccionado.
        let from = useCustomRange ? incomeFromDate || monthFromDate : monthFromDate;
        let to = useCustomRange ? incomeToDate || from : monthToDate;

        let fromObj = new Date(from);
        let toObj = new Date(to);

        if (Number.isNaN(fromObj.getTime())) {
          fromObj = new Date(monthFromDate);
        }
        if (Number.isNaN(toObj.getTime())) {
          toObj = fromObj;
        }
        if (toObj.getTime() < fromObj.getTime()) {
          toObj = fromObj;
        }

        const fromDate = fromObj.toISOString().slice(0, 10);
        const toDate = toObj.toISOString().slice(0, 10);

        // Inventario Inicial: saldo al cierre del día anterior al rango seleccionado
        const fromDateObj = new Date(fromDate);
        const prevToObj = new Date(fromDateObj.getTime() - 24 * 60 * 60 * 1000);
        const prevToDate =
          prevToObj.getFullYear() <= 1900
            ? null
            : prevToObj.toISOString().slice(0, 10);

        // Rango efectivo para compras del período (no antes de la fecha de arranque)
        const periodFromDate = fromDate < SYSTEM_START_DATE ? SYSTEM_START_DATE : fromDate;

        // Para saldos (inventario), usar acumulado desde la fecha de arranque hasta el corte
        const openingTrialPromise: Promise<any[]> =
          prevToDate && prevToDate >= SYSTEM_START_DATE
            ? financialReportsService.getTrialBalance(user.id, SYSTEM_START_DATE, prevToDate)
            : Promise.resolve([]);

        const closingTrialPromise: Promise<any[]> =
          toDate >= SYSTEM_START_DATE
            ? financialReportsService.getTrialBalance(user.id, SYSTEM_START_DATE, toDate)
            : Promise.resolve([]);

        const inventoryAccountIdsPromise = (async () => {
          const ids = new Set<string>();
          try {
            const [settings, items, warehouses] = await Promise.all([
              accountingSettingsService.get(user.id),
              inventoryService.getItems(user.id),
              settingsService.getWarehouses(),
            ]);
            const defaultInv = (settings as any)?.default_inventory_asset_account_id as string | null | undefined;
            if (defaultInv) ids.add(String(defaultInv));
            (items || []).forEach((it: any) => {
              const accId = it?.inventory_account_id as string | null | undefined;
              if (accId) ids.add(String(accId));
            });
            (warehouses || []).forEach((w: any) => {
              const accId = w?.inventory_account_id as string | null | undefined;
              if (accId) ids.add(String(accId));
            });
          } catch (invAccErr) {
            // eslint-disable-next-line no-console
            console.error('[CostOfSales] Error resolving inventory accounts:', invAccErr);
          }
          return ids;
        })();

        const movementsPromise = inventoryService.getMovements(user.id);

        const [openingTrial, closingTrial, periodTrial, inventoryAccountIds, movements] = await Promise.all([
          openingTrialPromise,
          closingTrialPromise,
          financialReportsService.getTrialBalance(user.id, periodFromDate, toDate),
          inventoryAccountIdsPromise,
          movementsPromise,
        ]);

        const shouldDebugCostOfSales =
          typeof window !== 'undefined' && window.localStorage.getItem('debug_cost_of_sales') === '1';

        const sumInventory = (trial: any[], invIds: Set<string>) => {
          const shouldUseIds = invIds && invIds.size > 0;
          return (trial || []).reduce((sum, acc: any) => {
            const type = String(acc.type || '').toLowerCase();
            if (!(type === 'asset' || type === 'activo')) return sum;
            if (shouldUseIds) {
              const accountId = String(acc.account_id || '');
              if (!accountId || !invIds.has(accountId)) return sum;
            } else {
              const code = String(acc.code || '');
              const normalizedCode = code.replace(/\./g, '');
              if (!normalizedCode.startsWith('12')) return sum; // Inventarios
            }
            const balance = Number(acc.balance) || 0;
            return sum + balance;
          }, 0);
        };

        if (shouldDebugCostOfSales) {
          const inventoryLines = (trial: any[]) =>
            (trial || [])
              .filter((acc: any) => {
                const type = String(acc.type || '').toLowerCase();
                if (!(type === 'asset' || type === 'activo')) return false;
                if (inventoryAccountIds && inventoryAccountIds.size > 0) {
                  const accountId = String(acc.account_id || '');
                  return !!accountId && inventoryAccountIds.has(accountId);
                }
                const code = String(acc.code || '');
                const normalizedCode = code.replace(/\./g, '');
                return normalizedCode.startsWith('12');
              })
              .map((acc: any) => ({
                code: String(acc.code || ''),
                name: String(acc.name || ''),
                total_debit: Number(acc.total_debit) || 0,
                total_credit: Number(acc.total_credit) || 0,
                balance: Number(acc.balance) || 0,
              }))
              .sort((a: any, b: any) => String(a.code).localeCompare(String(b.code)));

          // eslint-disable-next-line no-console
          console.group('[CostOfSales Debug] Inventarios (12xx)');
          // eslint-disable-next-line no-console
          console.log('Rango:', { fromDate, toDate, prevToDate, SYSTEM_START_DATE });
          // eslint-disable-next-line no-console
          console.table({
            openingInventory: sumInventory(openingTrial as any[], inventoryAccountIds),
            closingInventory: sumInventory(closingTrial as any[], inventoryAccountIds),
          });
          // eslint-disable-next-line no-console
          console.log('Detalle Inventario Inicial (al corte prevToDate):');
          // eslint-disable-next-line no-console
          console.table(inventoryLines(openingTrial as any[]));
          // eslint-disable-next-line no-console
          console.log('Detalle Inventario Final (al corte toDate):');
          // eslint-disable-next-line no-console
          console.table(inventoryLines(closingTrial as any[]));
          // eslint-disable-next-line no-console
          console.groupEnd();
        }

        const openingInventory = sumInventory(openingTrial as any[], inventoryAccountIds);
        const closingInventory = sumInventory(closingTrial as any[], inventoryAccountIds);

        // ==========================================================
        // Preferir movimientos de inventario cuando existan
        // ==========================================================
        type InventoryMovement = {
          movement_type?: string | null;
          movement_date?: string | null;
          total_cost?: number | string | null;
          unit_cost?: number | string | null;
          quantity?: number | string | null;
          adjustment_direction?: string | null;
        };

        const parseNumber = (v: any) => {
          const n = typeof v === 'number' ? v : Number(v);
          return Number.isFinite(n) ? n : 0;
        };

        const normalizeDate = (d: string | null | undefined) => {
          if (!d) return '';
          return String(d).slice(0, 10);
        };

        const movementSignedCost = (m: InventoryMovement) => {
          const type = String(m.movement_type || '').toLowerCase();
          if (!type) return 0;

          const qty = parseNumber(m.quantity);
          const totalCost = parseNumber(m.total_cost);
          const unitCost = parseNumber(m.unit_cost);
          const cost = totalCost !== 0 ? totalCost : qty * unitCost;
          if (cost === 0) return 0;

          if (type === 'entry') return cost;
          if (type === 'exit') return -cost;
          if (type === 'adjustment') {
            const dir = String(m.adjustment_direction || '').toLowerCase();
            const isNegative = dir === 'negative' || dir === 'decrease' || dir === 'down';
            return isNegative ? -cost : cost;
          }

          // Transferencias no cambian el valor total del inventario
          return 0;
        };

        const sumMovementsUpTo = (list: InventoryMovement[], dateToInclusive: string) => {
          const toKey = String(dateToInclusive);
          return (list || []).reduce((sum, m) => {
            const d = normalizeDate(m.movement_date);
            if (!d || d > toKey) return sum;
            return sum + movementSignedCost(m);
          }, 0);
        };

        const sumMovementEntriesInRange = (list: InventoryMovement[], dateFrom: string, dateTo: string) => {
          const fromKey = String(dateFrom);
          const toKey = String(dateTo);
          return (list || []).reduce((sum, m) => {
            const type = String(m.movement_type || '').toLowerCase();
            if (type !== 'entry') return sum;
            const d = normalizeDate(m.movement_date);
            if (!d || d < fromKey || d > toKey) return sum;

            const cost = movementSignedCost(m);
            return sum + Math.max(cost, 0);
          }, 0);
        };

        const sumMovementExitsInRange = (list: InventoryMovement[], dateFrom: string, dateTo: string) => {
          const fromKey = String(dateFrom);
          const toKey = String(dateTo);
          return (list || []).reduce((sum, m) => {
            const type = String(m.movement_type || '').toLowerCase();
            if (type !== 'exit') return sum;
            const d = normalizeDate(m.movement_date);
            if (!d || d < fromKey || d > toKey) return sum;
            const cost = movementSignedCost(m);
            return sum + Math.abs(cost);
          }, 0);
        };

        const movementsList = (movements || []) as InventoryMovement[];
        const hasAnyMovementsInRange = movementsList.some((m) => {
          const d = normalizeDate(m.movement_date);
          return !!d && d >= periodFromDate && d <= toDate;
        });

        const openingInventoryByMovements =
          prevToDate && prevToDate >= SYSTEM_START_DATE
            ? sumMovementsUpTo(movementsList, prevToDate)
            : 0;
        const closingInventoryByMovements = sumMovementsUpTo(movementsList, toDate);
        const purchasesByMovements = hasAnyMovementsInRange
          ? sumMovementEntriesInRange(movementsList, periodFromDate, toDate)
          : 0;

        const sumCostByPrefixes = (trial: any[], prefixes: string[]) => {
          return (trial || []).reduce((sum, acc: any) => {
            const code = String(acc.code || '');
            const normalizedCode = code.replace(/\./g, '');
            const type = String(acc.type || '');
            // Tratar tanto cuentas de costo como gastos 5xxx como parte de las compras
            if (
              !(
                type === 'cost' ||
                type === 'costo' ||
                type === 'costos' ||
                type === 'expense' ||
                type === 'gasto'
              )
            ) {
              return sum;
            }
            if (!prefixes.some((p) => normalizedCode.startsWith(p))) return sum;
            const balance = Number(acc.balance) || 0;
            return sum + Math.abs(balance);
          }, 0);
        };

        const sumInventoryDebitsCreditsForPeriod = (trial: any[], invIds: Set<string>) => {
          const shouldUseIds = invIds && invIds.size > 0;
          return (trial || []).reduce(
            (accum, acc: any) => {
              const type = String(acc.type || '').toLowerCase();
              if (!(type === 'asset' || type === 'activo')) return accum;
              if (shouldUseIds) {
                const accountId = String(acc.account_id || '');
                if (!accountId || !invIds.has(accountId)) return accum;
              } else {
                const code = String(acc.code || '');
                const normalizedCode = code.replace(/\./g, '');
                if (!normalizedCode.startsWith('12')) return accum;
              }
              accum.debit += Number(acc.total_debit) || 0;
              accum.credit += Number(acc.total_credit) || 0;
              return accum;
            },
            { debit: 0, credit: 0 }
          );
        };

        const invPeriodTotals = sumInventoryDebitsCreditsForPeriod(periodTrial as any[], inventoryAccountIds);

        // Fallback: Compras locales/importaciones por cuentas 5001xx (modelo anterior)
        const rawLocal = sumCostByPrefixes(periodTrial as any[], ['5001', '500101']);
        const rawImports = sumCostByPrefixes(periodTrial as any[], ['500102']);

        // Preferir movimientos de inventario (inventory_movements) si existen.
        // Si no hay movimientos, usar el método anterior (débitos a inventario en el mayor).
        const purchasesLocal = purchasesByMovements > 0 ? purchasesByMovements : invPeriodTotals.debit > 0 ? invPeriodTotals.debit : rawLocal;
        const purchasesImports = purchasesByMovements > 0 ? 0 : invPeriodTotals.debit > 0 ? 0 : rawImports;
        const totalPurchases = purchasesLocal + purchasesImports;

        const indirectCosts = 0; // Placeholder para futuros desarrollos
        const openingInvEffective = hasAnyMovementsInRange ? openingInventoryByMovements : openingInventory;
        const closingInvEffective = hasAnyMovementsInRange ? closingInventoryByMovements : closingInventory;
        const availableForSale = openingInvEffective + totalPurchases + indirectCosts;

        setCostOfSalesData({
          openingInventory: openingInvEffective,
          purchasesLocal,
          purchasesImports,
          totalPurchases,
          indirectCosts,
          availableForSale,
          closingInventory: closingInvEffective,
        });
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error loading cost of sales data:', error);
        setCostOfSalesData({
          openingInventory: 0,
          purchasesLocal: 0,
          purchasesImports: 0,
          totalPurchases: 0,
          indirectCosts: 0,
          availableForSale: 0,
          closingInventory: 0,
        });
      }
    };

    // Solo tiene sentido recalcular cuando cambian usuario, período/rango o los costos asociados
    if (activeTab === 'costs' && user) {
      void loadCostOfSales();
    }
  }, [user, selectedPeriod, incomeFromDate, incomeToDate, useCustomRange, activeTab, financialData.costs]);

  // ====================================================
  // Cargar datos para Anexos a los Estados Financieros
  // ====================================================
  useEffect(() => {
    const loadAnexosData = async () => {
      try {
        if (!user) return;

        const now = new Date();
        const basePeriod = selectedPeriod || now.toISOString().slice(0, 7);
        const [yearStr, monthStr] = basePeriod.split('-');
        const baseYear = parseInt(yearStr, 10);
        const baseMonth = parseInt(monthStr, 10);
        if (!baseYear || !baseMonth) return;

        const monthToDate = new Date(baseYear, baseMonth, 0).toISOString().slice(0, 10);
        const toDate = useCustomRange && incomeToDate ? incomeToDate : monthToDate;

        // Obtener trial balance acumulado hasta la fecha de corte
        const trialBalance = await financialReportsService.getTrialBalance(
          user.id,
          SYSTEM_START_DATE,
          toDate
        );

        // Filtrar cuentas con saldo != 0
        const accountsWithBalance = (trialBalance || [])
          .filter((acc: any) => Math.abs(Number(acc.balance) || 0) >= 0.01)
          .map((acc: any) => ({
            code: String(acc.code || ''),
            name: String(acc.name || ''),
            type: String(acc.type || '').toLowerCase(),
            balance: Number(acc.balance) || 0,
          }))
          .sort((a: any, b: any) => String(a.code).localeCompare(String(b.code)));

        // Agrupar por tipo de cuenta
        const typeLabels: Record<string, string> = {
          asset: 'ACTIVOS',
          activo: 'ACTIVOS',
          liability: 'PASIVOS',
          pasivo: 'PASIVOS',
          equity: 'PATRIMONIO',
          patrimonio: 'PATRIMONIO',
          income: 'INGRESOS',
          ingreso: 'INGRESOS',
          cost: 'COSTOS',
          costo: 'COSTOS',
          costos: 'COSTOS',
          expense: 'GASTOS',
          gasto: 'GASTOS',
        };

        const grouped: Record<string, { accounts: { code: string; name: string; balance: number }[]; subtotal: number }> = {};

        accountsWithBalance.forEach((acc: any) => {
          const typeKey = typeLabels[acc.type] || 'OTROS';
          if (!grouped[typeKey]) {
            grouped[typeKey] = { accounts: [], subtotal: 0 };
          }
          grouped[typeKey].accounts.push({
            code: acc.code,
            name: acc.name,
            balance: acc.balance,
          });
          grouped[typeKey].subtotal += acc.balance;
        });

        setAnexosData({
          accounts: accountsWithBalance,
          groupedByType: grouped,
        });
      } catch (error) {
        console.error('Error loading anexos data:', error);
        setAnexosData({ accounts: [], groupedByType: {} });
      }
    };

    if (activeTab === 'anexos' && user) {
      void loadAnexosData();
    }
  }, [user, selectedPeriod, incomeToDate, useCustomRange, activeTab]);

  const loadStatements = async () => {
    try {
      if (!user) {
        setStatements([]);
        return;
      }
      const period = selectedPeriod || new Date().toISOString().slice(0, 7); // YYYY-MM
      const data = await financialStatementsService.getAll(user.id, period);
      setStatements(data || []);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error loading financial statements:', error);
      setStatements([]);
    }
  };

  const generateStatement = async (type: string, period: string) => {
    try {
      if (!user) return;
      setIsGenerating(true);
      await financialStatementsService.create(user.id, { type, period });
      setIsGenerating(false);
      setShowNewStatementModal(false);
      await loadStatements();
      alert('Estado financiero generado exitosamente');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error generating financial statement:', error);
      setIsGenerating(false);
      alert('Error al generar el estado financiero');
    }
  };

  const formatCurrency = (amount: number) => {
    return formatAmount(amount);
  };

  const formatCurrencyRD = (amount: number) => {
    return formatMoney(amount);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-yellow-100 text-yellow-800';
      case 'final': return 'bg-[#eef2ea] text-[#2f3a2f]';
      case 'approved': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'balance_sheet': return 'Balance General';
      case 'income_statement': return 'Estado de Resultados';
      case 'cash_flow': return 'Flujo de Efectivo';
      case 'equity_statement': return 'Estado de Patrimonio';
      default: return type;
    }
  };

  const calculateTotalsFromData = (data: FinancialData): FinancialTotals => {
    const totalCurrentAssets = data.assets.current.reduce((sum, item) => sum + item.amount, 0);
    const totalNonCurrentAssets = data.assets.nonCurrent.reduce((sum, item) => sum + item.amount, 0);
    const totalAssets = totalCurrentAssets + totalNonCurrentAssets;

    const totalCurrentLiabilities = data.liabilities.current.reduce((sum, item) => sum + item.amount, 0);
    const totalNonCurrentLiabilities = data.liabilities.nonCurrent.reduce((sum, item) => sum + item.amount, 0);
    const totalLiabilities = totalCurrentLiabilities + totalNonCurrentLiabilities;

    const totalEquity = data.equity.reduce((sum, item) => sum + item.amount, 0);
    const totalRevenue = data.revenue.reduce((sum, item) => sum + item.amount, 0);

    // Tratar las cuentas 5xxx como costo de ventas aunque estén clasificadas como gastos
    const normalizeCode = (code: string | undefined) => (code || '').replace(/\./g, '');
    const allExpenses = data.expenses || [];
    const extraCostItems = allExpenses.filter((item) => normalizeCode(item.code).startsWith('5'));
    const extraCostsTotal = extraCostItems.reduce((sum, item) => sum + item.amount, 0);
    const expensesWithoutCosts = allExpenses.filter((item) => !normalizeCode(item.code).startsWith('5'));

    const totalCosts =
      data.costs.reduce((sum, item) => sum + item.amount, 0) + extraCostsTotal;
    const totalExpenses = expensesWithoutCosts.reduce((sum, item) => sum + item.amount, 0);

    const netIncome = totalRevenue - totalCosts - totalExpenses;

    return {
      totalCurrentAssets,
      totalNonCurrentAssets,
      totalAssets,
      totalCurrentLiabilities,
      totalNonCurrentLiabilities,
      totalLiabilities,
      totalEquity,
      totalRevenue,
      totalCosts,
      totalExpenses,
      netIncome,
    };
  };

  const totals = calculateTotalsFromData(financialData);

  // Total Pasivos y Patrimonio incluyendo el resultado del período (utilidad o pérdida),
  // de forma que se cumpla la ecuación: Activos = Pasivos + Patrimonio + Resultado.
  const totalLiabilitiesAndEquity = totals.totalLiabilities + totals.totalEquity + totals.netIncome;

  const balanceImbalance = totals.totalAssets - totalLiabilitiesAndEquity;
  const isBalanceBalanced = Math.abs(balanceImbalance) < 0.01;

  const comparisonLiabilitiesAndEquity = comparisonTotals
    ? comparisonTotals.totalLiabilities + comparisonTotals.totalEquity + comparisonTotals.netIncome
    : null;

  const comparisonPatrimonioConResultado = comparisonTotals
    ? comparisonTotals.totalEquity + comparisonTotals.netIncome
    : null;

  // Función para obtener las fechas formateadas del período
  const getPeriodDates = () => {
    const period = selectedPeriod || new Date().toISOString().slice(0, 7); // YYYY-MM
    const [yearStr, monthStr] = period.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const formatLongDate = (date: Date) => {
      return formatDate(date);
    };

    return {
      startDateFormatted: formatLongDate(startDate),
      endDateFormatted: formatLongDate(endDate),
      periodLabel: `Del ${formatLongDate(startDate)} al ${formatLongDate(endDate)}`,
      asOfDateLabel: `Al ${formatLongDate(endDate)}`,
    };
  };

  const periodDates = getPeriodDates();

  // Rango de fechas específico para Estado de Resultados (sincronizado con el selector y el flag de rango personalizado)
  const getIncomePeriodDates = () => {
    const now = new Date();
    const defaultPeriod = selectedPeriod || now.toISOString().slice(0, 7); // YYYY-MM
    const [yearStr, monthStr] = defaultPeriod.split('-');
    const baseYear = parseInt(yearStr, 10);
    const baseMonth = parseInt(monthStr, 10);

    const monthFromDate = !Number.isNaN(baseYear) && !Number.isNaN(baseMonth)
      ? new Date(baseYear, baseMonth - 1, 1)
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const monthToDate = !Number.isNaN(baseYear) && !Number.isNaN(baseMonth)
      ? new Date(baseYear, baseMonth, 0)
      : new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Helper: parsear YYYY-MM-DD como fecha local para evitar desfase por zona horaria
    const parseYMDLocal = (s: string | null | undefined): Date | null => {
      if (!s) return null;
      const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(s);
      if (!m) return null;
      const y = parseInt(m[1], 10);
      const mo = parseInt(m[2], 10) - 1;
      const d = parseInt(m[3], 10);
      return new Date(y, mo, d);
    };

    // Usar SIEMPRE las fechas de los inputs si existen; si no, el mes completo seleccionado
    let from = incomeFromDate ? parseYMDLocal(incomeFromDate) || monthFromDate : monthFromDate;
    let to: Date | null = incomeToDate ? parseYMDLocal(incomeToDate) : null;
    if (!to) to = incomeFromDate ? new Date(from) : monthToDate;

    if (Number.isNaN(from.getTime())) from = monthFromDate;
    if (Number.isNaN(to.getTime())) to = new Date(from);
    if (to.getTime() < from.getTime()) to = new Date(from);

    const formatLongDate = (date: Date) => {
      return formatDate(date);
    };

    return {
      startDateFormatted: formatLongDate(from),
      endDateFormatted: formatLongDate(to),
      periodLabel: `Del ${formatLongDate(from)} al ${formatLongDate(to)}`,
      asOfDateLabel: `Al ${formatLongDate(to)}`,
    };
  };

  const incomePeriodDates = getIncomePeriodDates();

  const getComparisonPeriodLabel = () => {
    if (!comparisonFromDate) return null;

    const now = new Date();
    const parseYMDLocal = (s: string | null | undefined): Date | null => {
      if (!s) return null;
      const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(s);
      if (!m) return null;
      const y = parseInt(m[1], 10);
      const mo = parseInt(m[2], 10) - 1;
      const d = parseInt(m[3], 10);
      return new Date(y, mo, d);
    };

    let startDate = comparisonFromDate ? parseYMDLocal(comparisonFromDate) || now : now;
    let endDate = comparisonToDate ? parseYMDLocal(comparisonToDate) || startDate : startDate;

    if (Number.isNaN(startDate.getTime())) {
      startDate = now;
    }
    if (Number.isNaN(endDate.getTime())) {
      endDate = startDate;
    }
    if (endDate.getTime() < startDate.getTime()) {
      endDate = startDate;
    }

    const formatLongDate = (date: Date) => {
      return formatDate(date);
    };

    return `Del ${formatLongDate(startDate)} al ${formatLongDate(endDate)}`;
  };

  const comparisonPeriodLabel = getComparisonPeriodLabel();

  // Derivados para Estado de Resultados en formato profesional
  const grossProfit = totals.totalRevenue - totals.totalCosts;

  // Ítems de costo para el Estado de Resultados (incluye cuentas 5xxx aunque estén como gastos)
  const costItemsForIncome = [
    ...financialData.costs,
    ...financialData.expenses.filter((item) => {
      const code = item.code || '';
      const normalized = code.replace(/\./g, '');
      return normalized.startsWith('5');
    }),
  ];

  // Helpers para agrupar por prefijos de código
  const sumByPrefixes = (
    items: { code: string; name: string; amount: number }[],
    prefixes: string[],
  ) => {
    return items.reduce((sum, item) => {
      const code = item.code || '';
      const normalizedCode = code.replace(/\./g, ''); // Normalizar código (quitar puntos)
      return prefixes.some((p) => normalizedCode.startsWith(p)) ? sum + item.amount : sum;
    }, 0);
  };

  // ACTIVO: grupos principales
  const currentAssets = financialData.assets.current;
  const nonCurrentAssets = financialData.assets.nonCurrent;
  const currentLiabilities = financialData.liabilities.current;
  const nonCurrentLiabilities = financialData.liabilities.nonCurrent;
  const equityItems = financialData.equity;

  // Efectivo en Caja y Bancos: no incluir 1102 (ITBIS control) y excluir explícitamente la cuenta ITBIS configurada
  const efectivoCajaBancos = currentAssets.reduce((sum, item) => {
    const normalizedCode = (item.code || '').replace(/\./g, '');
    if (itbisAccountCode && normalizedCode === itbisAccountCode) return sum;
    // Solo códigos de efectivo/caja y bancos (no ITBIS 1102)
    return ['1001', '1002'].some((p) => normalizedCode.startsWith(p)) ? sum + item.amount : sum;
  }, 0);
  const cxcClientes = sumByPrefixes(currentAssets, ['1101']); // CxC Clientes
  const otrasCxc = sumByPrefixes(currentAssets, ['1103', '1104', '1105', '1199']); // Otras CxC (excluye 1102 que es Bancos)
  const itbisCompras = (() => {
    const prefixes: string[] = [];
    if (itbisAccountCode) prefixes.push(itbisAccountCode);
    // Incluir también la cuenta control 1102 (agregada a partir de 110201+110202)
    prefixes.push('1102');
    return sumByPrefixes(currentAssets, prefixes);
  })();
  const inventarios = sumByPrefixes(currentAssets, ['12']); // Inventarios
  const gastosPagadosAnticipado = sumByPrefixes(currentAssets, ['13']); // Gastos anticipados (incluye anticipos ISR)

  const activosFijos = sumByPrefixes(nonCurrentAssets, ['15']);
  const invAcciones = sumByPrefixes(nonCurrentAssets, ['1401']);
  const invCertificados = sumByPrefixes(nonCurrentAssets, ['1402']);
  const fianzasDepositos = sumByPrefixes(nonCurrentAssets, ['1601']);
  const licenciasSoftware = sumByPrefixes(nonCurrentAssets, ['1602']);
  const otrosActivos = sumByPrefixes(nonCurrentAssets, ['1699']);

  // PASIVOS Y PATRIMONIO
  // Cuentas por Pagar Proveedores: solo la cuenta 2001 y sus subcuentas
  const cppProveedores = sumByPrefixes(currentLiabilities, ['2001']);
  const prestamosCortoPlazo = sumByPrefixes(currentLiabilities, ['201', '2002']); // Préstamos Corto Plazo
  const otrasCxPCorrientes = sumByPrefixes(currentLiabilities, ['202', '203', '204', '2003', '2004', '2099']); // Otras CxP
  const acumulacionesPorPagar = sumByPrefixes(currentLiabilities, ['21']); // Acumulaciones
  const pasivosCorrientes = cppProveedores + prestamosCortoPlazo + otrasCxPCorrientes + acumulacionesPorPagar;

  const pasivosLargoPlazo = sumByPrefixes(nonCurrentLiabilities, ['22']);

  const capitalSuscrito = sumByPrefixes(equityItems, ['30', '31']); // Capital y Aportes
  const reservas = sumByPrefixes(equityItems, ['32']); // Reservas
  const resultadosAcumulados = sumByPrefixes(equityItems, ['33', '34', '35']); // Resultados y Utilidades
  const patrimonioTotal = capitalSuscrito + reservas + resultadosAcumulados;
  const beneficiosPeriodoActual = totals.netIncome;
  const patrimonioConResultado = patrimonioTotal + beneficiosPeriodoActual;

  // Cargar totales comparativos para el Estado de Resultados a partir de un rango de fechas
  const loadComparisonIncomeForRange = async (fromInput: string | null, toInput: string | null) => {
    try {
      if (!user) {
        setComparisonIncome(null);
        setComparisonTotals(null);
        setComparisonCashFlow(null);
        return;
      }

      if (!fromInput) {
        setComparisonIncome(null);
        setComparisonTotals(null);
        setComparisonCashFlow(null);
        return;
      }

      let from = fromInput;
      let to = toInput || fromInput;

      // Parsear como fechas locales para evitar desfase por zona horaria
      const parseYMDLocal = (s: string | null): Date => {
        if (!s) return new Date();
        const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(s);
        if (m) {
          const y = parseInt(m[1], 10);
          const mo = parseInt(m[2], 10) - 1;
          const d = parseInt(m[3], 10);
          return new Date(y, mo, d);
        }
        return new Date(s);
      };

      let fromObj = parseYMDLocal(from);
      let toObj = parseYMDLocal(to);

      if (Number.isNaN(fromObj.getTime())) {
        fromObj = new Date();
      }
      if (Number.isNaN(toObj.getTime())) {
        toObj = fromObj;
      }
      if (toObj.getTime() < fromObj.getTime()) {
        toObj = fromObj;
      }

      const fromDate = fromObj.toISOString().slice(0, 10);
      const toDate = toObj.toISOString().slice(0, 10);

      let effectiveFrom = fromDate;
      let trialBalance: any[] = [];

      if (toDate < SYSTEM_START_DATE) {
        trialBalance = [];
      } else {
        if (effectiveFrom < SYSTEM_START_DATE) {
          effectiveFrom = SYSTEM_START_DATE;
        }

        trialBalance = await financialReportsService.getTrialBalance(user.id, effectiveFrom, toDate);
      }

      const comparisonData: FinancialData = {
        assets: { current: [], nonCurrent: [] },
        liabilities: { current: [], nonCurrent: [] },
        equity: [],
        revenue: [],
        costs: [],
        expenses: [],
      };

      const isContraAccountLocal = (_code: string, name: string, type: string): boolean => {
        const nameLower = name.toLowerCase();

        if (type === 'asset' || type === 'activo') {
          if (
            nameLower.includes('depreci') ||
            nameLower.includes('amortiz') ||
            nameLower.includes('acumulad')
          ) {
            return true;
          }
        }

        if (type === 'income' || type === 'ingreso') {
          if (
            nameLower.includes('devoluc') ||
            nameLower.includes('descuent') ||
            nameLower.includes('rebaj')
          ) {
            return true;
          }
        }

        return false;
      };

      (trialBalance || []).forEach((acc: any) => {
        let balance = Number(acc.balance) || 0;
        if (Math.abs(balance) < 0.005) return;

        const code = String(acc.code || '');
        const baseName = String(acc.name || '');
        const label = baseName;
        const normalizedCode = code.replace(/\./g, '');
        const type = String(acc.type || '');

        switch (acc.type) {
          case 'asset':
          case 'activo': {
            const item = { code, name: label, amount: balance };
            if (
              normalizedCode.startsWith('10') ||
              normalizedCode.startsWith('11') ||
              normalizedCode.startsWith('12') ||
              normalizedCode.startsWith('13')
            ) {
              comparisonData.assets.current.push(item);
            } else {
              comparisonData.assets.nonCurrent.push(item);
            }
            break;
          }
          case 'liability':
          case 'pasivo': {
            const item = { code, name: label, amount: balance };
            if (normalizedCode.startsWith('20') || normalizedCode.startsWith('21')) {
              comparisonData.liabilities.current.push(item);
            } else {
              comparisonData.liabilities.nonCurrent.push(item);
            }
            break;
          }
          case 'equity':
          case 'patrimonio':
            comparisonData.equity.push({ code, name: label, amount: balance });
            break;
          case 'income':
          case 'ingreso': {
            const contra = isContraAccountLocal(code, baseName, type);
            let amount = Math.abs(balance);
            if (contra) {
              amount = -Math.abs(balance);
            }
            comparisonData.revenue.push({ code, name: label, amount });
            break;
          }
          case 'cost':
          case 'costo':
          case 'costos':
            comparisonData.costs.push({ code, name: label, amount: Math.abs(balance) });
            break;
          case 'expense':
          case 'gasto':
            comparisonData.expenses.push({ code, name: label, amount: Math.abs(balance) });
            break;
          default:
            break;
        }
      });

      const totalsComp = calculateTotalsFromData(comparisonData);
      setComparisonTotals(totalsComp);
      const grossProfitComp = totalsComp.totalRevenue - totalsComp.totalCosts;

      // Derivar gastos operativos y financieros para el comparativo usando los mismos prefijos
      const expenseItemsComp = comparisonData.expenses;
      const gastosPersonalComp = sumByPrefixes(expenseItemsComp, ['6001']);
      const gastosGeneralesAdmComp = sumByPrefixes(expenseItemsComp, ['6002']);
      const gastosMantenimientoAFComp = sumByPrefixes(expenseItemsComp, ['6003']);
      const gastosDepreciacionComp = sumByPrefixes(expenseItemsComp, ['6004']);
      const gastosImpuestosNoDeduciblesComp = sumByPrefixes(expenseItemsComp, ['6005', '6102']);
      const gastosFinancierosComp = sumByPrefixes(expenseItemsComp, ['6101']);

      const operatingExpensesComp =
        gastosPersonalComp +
        gastosGeneralesAdmComp +
        gastosMantenimientoAFComp +
        gastosDepreciacionComp +
        gastosImpuestosNoDeduciblesComp;

      const financialExpensesComp = gastosFinancierosComp;
      const operatingIncomeComp = grossProfitComp - operatingExpensesComp - financialExpensesComp;
      const incomeBeforeTaxReservesComp = operatingIncomeComp;

      setComparisonIncome({
        totalRevenue: totalsComp.totalRevenue,
        totalCosts: totalsComp.totalCosts,
        grossProfit: grossProfitComp,
        operatingExpenses: operatingExpensesComp,
        financialExpenses: financialExpensesComp,
        operatingIncome: operatingIncomeComp,
        incomeBeforeTaxReserves: incomeBeforeTaxReservesComp,
        netIncome: totalsComp.netIncome,
      });

      try {
        const resultCf = await chartAccountsService.generateCashFlowStatement(user.id, fromDate, toDate);

        const fromDateObjCf = new Date(fromDate);
        const prevToObjCf = new Date(fromDateObjCf.getTime() - 24 * 60 * 60 * 1000);
        const prevToDateCf =
          prevToObjCf.getFullYear() <= 1900
            ? null
            : prevToObjCf.toISOString().slice(0, 10);

        const [prevTrialCf, finalTrialCf] = await Promise.all([
          prevToDateCf
            ? financialReportsService.getTrialBalance(user.id, '1900-01-01', prevToDateCf)
            : Promise.resolve([]),
          financialReportsService.getTrialBalance(user.id, '1900-01-01', toDate),
        ]);

        const sumCashCf = (trial: any[]) => {
          return (trial || []).reduce((sum, acc: any) => {
            const code = String(acc.code || '');
            const normalizedCode = code.replace(/\./g, '');
            const type = String(acc.type || '');
            if (!(type === 'asset' || type === 'activo')) return sum;
            if (
              !normalizedCode.startsWith('10') &&
              !normalizedCode.startsWith('110') &&
              !normalizedCode.startsWith('111') &&
              !normalizedCode.startsWith('1102')
            ) {
              return sum;
            }
            const balance = Number(acc.balance) || 0;
            return sum + balance;
          }, 0);
        };

        const openingCashComp = prevTrialCf ? sumCashCf(prevTrialCf as any[]) : 0;
        const closingCashComp = sumCashCf(finalTrialCf as any[]);

        setComparisonCashFlow({
          operatingCashFlow: resultCf.operatingCashFlow || 0,
          investingCashFlow: resultCf.investingCashFlow || 0,
          financingCashFlow: resultCf.financingCashFlow || 0,
          netCashFlow: resultCf.netCashFlow || 0,
          openingCash: openingCashComp,
          closingCash: closingCashComp,
        });
      } catch {
        setComparisonCashFlow(null);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error loading comparison income data:', error);
      setComparisonIncome(null);
      setComparisonTotals(null);
      setComparisonCashFlow(null);
    }
  };

  const handleComparisonFromChange = (value: string) => {
    const nextFrom = value || '';
    const normalizedFrom = nextFrom || null;
    setComparisonFromDate(normalizedFrom);

    if (!normalizedFrom) {
      setComparisonIncome(null);
      setComparisonTotals(null);
      setComparisonCashFlow(null);
      return;
    }

    void loadComparisonIncomeForRange(normalizedFrom, comparisonToDate);
  };

  const handleComparisonToChange = (value: string) => {
    const nextTo = value || '';
    const normalizedTo = nextTo || null;
    setComparisonToDate(normalizedTo);

    if (!comparisonFromDate) {
      setComparisonIncome(null);
      setComparisonTotals(null);
      setComparisonCashFlow(null);
      return;
    }

    void loadComparisonIncomeForRange(comparisonFromDate, normalizedTo);
  };

  // GASTOS por grupo en Estado de Resultados
  const expenseItems = financialData.expenses;
  const gastosPersonal = sumByPrefixes(expenseItems, ['6001']);
  const gastosGeneralesAdm = sumByPrefixes(expenseItems, ['6002']);
  const gastosMantenimientoAF = sumByPrefixes(expenseItems, ['6003']);
  const gastosDepreciacion = sumByPrefixes(expenseItems, ['6004']);
  const gastosImpuestosNoDeducibles = sumByPrefixes(expenseItems, ['6005', '6102']);
  const gastosFinancieros = sumByPrefixes(expenseItems, ['6101']);

  const filterExpensesByPrefixes = (
    items: { code: string; name: string; amount: number }[],
    prefixes: string[],
  ) => {
    return items.filter((item) => {
      const code = item.code || '';
      const normalizedCode = code.replace(/\./g, ''); // Normalizar código (quitar puntos)
      return prefixes.some((p) => normalizedCode.startsWith(p));
    });
  };

  const expenseItemsPersonal = filterExpensesByPrefixes(expenseItems, ['6001']);
  const expenseItemsGeneralesAdm = filterExpensesByPrefixes(expenseItems, ['6002']);
  const expenseItemsMantenimientoAF = filterExpensesByPrefixes(expenseItems, ['6003']);
  const expenseItemsDepreciacion = filterExpensesByPrefixes(expenseItems, ['6004']);
  const expenseItemsImpuestosNoDeducibles = filterExpensesByPrefixes(expenseItems, ['6005', '6102']);
  const expenseItemsFinancieros = filterExpensesByPrefixes(expenseItems, ['6101']);

  const operatingExpenses =
    gastosPersonal +
    gastosGeneralesAdm +
    gastosMantenimientoAF +
    gastosDepreciacion +
    gastosImpuestosNoDeducibles;

  const financialExpenses = gastosFinancieros;
  const operatingIncome = grossProfit - operatingExpenses - financialExpenses;
  const incomeBeforeTaxReserves = operatingIncome;
  const incomeTax = 0;
  const legalReserve = 0;

  const expensesCategoriesTotal =
    gastosPersonal +
    gastosGeneralesAdm +
    gastosMantenimientoAF +
    gastosDepreciacion +
    gastosImpuestosNoDeducibles +
    gastosFinancieros;

  const expensesTotalsImbalance = expensesCategoriesTotal - (totals.totalExpenses || 0);
  const areExpensesTotalsConsistent = Math.abs(expensesTotalsImbalance) < 0.01;

  // Helper para renderizar líneas - muestra todas las líneas con su valor
  const renderBalanceLineIfNotZero = (label: string, amount: number) => {
    const isNegative = amount < 0;
    return (
      <div className="flex justify-between py-0.5 pl-4">
        <span className="text-sm text-gray-700">{label}</span>
        <span
          className={`text-sm font-medium tabular-nums ${
            isNegative ? 'text-red-600' : 'text-gray-900'
          }`}
        >
          {formatCurrency(amount)}
        </span>
      </div>
    );
  };

  // Helper para agregar filas a Excel solo si tienen saldo diferente de 0
  const addRowIfNotZero = (rows: any[], label: string, amount: number, indent: string = '  ') => {
    if (Math.abs(amount) >= 0.01) {
      rows.push([indent + label, '', '', amount]);
    }
  };

  // =========================
  // Estado de Costos de Ventas
  // =========================

  const [costOfSalesData, setCostOfSalesData] = useState({
    openingInventory: 0,
    purchasesLocal: 0,
    purchasesImports: 0,
    totalPurchases: 0,
    indirectCosts: 0,
    availableForSale: 0,
    closingInventory: 0,
  });

  const costOfSalesForStatement =
    (Number(costOfSalesData.availableForSale) || 0) - (Number(costOfSalesData.closingInventory) || 0);
  const costsTotalsImbalance = costOfSalesForStatement - (totals.totalCosts || 0);
  const areCostsTotalsConsistent = Math.abs(costsTotalsImbalance) < 0.01;

  const downloadBalanceSheetExcel = async () => {
    try {
      if (!user) return;

      const resolvedInfo = await settingsService.getCompanyInfo();
      const companyName =
        (resolvedInfo as any)?.name ||
        (resolvedInfo as any)?.company_name ||
        '';
      const companyRnc =
        (resolvedInfo as any)?.rnc ||
        (resolvedInfo as any)?.tax_id ||
        (resolvedInfo as any)?.ruc ||
        '';
      const companyAddress = (resolvedInfo as any)?.address || '';
      const companyPhone = (resolvedInfo as any)?.phone || '';
      const companyEmail = (resolvedInfo as any)?.email || '';

      const titleRows: any[] = [];
      const dataRows: any[] = [];

      // Encabezado (solo texto en la primera columna)
      titleRows.push([companyName || '', '', '', null]);
      if (companyRnc) titleRows.push([`RNC/RUC: ${companyRnc}`, '', '', null]);
      if (companyAddress) titleRows.push([companyAddress, '', '', null]);
      if (companyPhone || companyEmail) {
        titleRows.push([
          [companyPhone ? `Tel: ${companyPhone}` : '', companyEmail ? `Email: ${companyEmail}` : '']
            .filter(Boolean)
            .join('  ·  '),
          '',
          '',
          null,
        ]);
      }
      titleRows.push(['ESTADO DE SITUACION FINANCIERA', '', '', null]);
      titleRows.push([periodDates.asOfDateLabel.toUpperCase(), '', '', null]);
      titleRows.push(['VALORES EN DOP', '', '', null]);
      titleRows.push(['', '', '', null]);

      // ACTIVOS
      dataRows.push(['ACTIVOS', '', '', null]);
      dataRows.push(['ACTIVOS CORRIENTES', '', '', null]);
      addRowIfNotZero(dataRows, 'Efectivo en Caja y Bancos', efectivoCajaBancos);
      addRowIfNotZero(dataRows, 'Cuentas por Cobrar Clientes', cxcClientes);
      addRowIfNotZero(dataRows, 'Otras Cuentas por Cobrar', otrasCxc);
      addRowIfNotZero(dataRows, 'Inventarios', inventarios);
      addRowIfNotZero(dataRows, 'Gastos Pagados por Anticipado', gastosPagadosAnticipado);
      dataRows.push(['  Total Activos Corrientes', '', '', totals.totalCurrentAssets]);
      dataRows.push(['', '', '', null]);

      // ACTIVOS FIJOS - solo agregar si tiene saldo
      if (Math.abs(activosFijos) >= 0.01) {
        dataRows.push(['ACTIVOS FIJOS', '', '', null]);
        addRowIfNotZero(dataRows, 'Activos Fijos', activosFijos);
        dataRows.push(['', '', '', null]);
      }

      // OTROS ACTIVOS - solo agregar si tiene saldo
      if (Math.abs(totals.totalNonCurrentAssets) >= 0.01) {
        dataRows.push(['OTROS ACTIVOS', '', '', null]);
        addRowIfNotZero(dataRows, 'Inversiones en Otras Compañías', invAcciones);
        addRowIfNotZero(dataRows, 'Certificados Bancarios y Títulos Financieros', invCertificados);
        addRowIfNotZero(dataRows, 'Fianzas y Depósitos', fianzasDepositos);
        addRowIfNotZero(dataRows, 'Licencias y Softwares', licenciasSoftware);
        addRowIfNotZero(dataRows, 'Otros Activos', otrosActivos);
        dataRows.push(['  Total Otros Activos', '', '', totals.totalNonCurrentAssets]);
        dataRows.push(['', '', '', null]);
      }

      dataRows.push(['TOTAL ACTIVOS', '', '', totals.totalAssets]);
      dataRows.push(['', '', '', null]);

      // PASIVOS Y PATRIMONIO
      dataRows.push(['PASIVO Y PATRIMONIO DE LOS SOCIOS', '', '', null]);
      // PASIVOS CIRCULANTES - solo agregar si tiene saldo
      if (Math.abs(pasivosCorrientes) >= 0.01) {
        dataRows.push(['PASIVOS CIRCULANTES', '', '', null]);
        addRowIfNotZero(dataRows, 'Cuentas por Pagar Proveedores', cppProveedores);
        addRowIfNotZero(dataRows, 'Acumulaciones y Provisiones por Pagar', acumulacionesPorPagar);
        addRowIfNotZero(dataRows, 'Préstamos por Pagar a Corto Plazo', prestamosCortoPlazo);
        addRowIfNotZero(dataRows, 'Otras Cuentas por Pagar', otrasCxPCorrientes);
        dataRows.push(['  Total Pasivos Corrientes', '', '', pasivosCorrientes]);
        dataRows.push(['', '', '', null]);
      }

      // PASIVOS A LARGO PLAZO - solo agregar si tiene saldo
      if (Math.abs(pasivosLargoPlazo) >= 0.01) {
        dataRows.push(['PASIVOS A LARGO PLAZO', '', '', null]);
        addRowIfNotZero(dataRows, 'Pasivos a Largo Plazo', pasivosLargoPlazo);
        dataRows.push(['  Total Pasivos a Largo Plazo', '', '', pasivosLargoPlazo]);
        dataRows.push(['', '', '', null]);
      }

      // TOTAL PASIVOS - solo agregar si tiene saldo
      if (Math.abs(totals.totalLiabilities) >= 0.01) {
        dataRows.push(['TOTAL PASIVOS', '', '', totals.totalLiabilities]);
        dataRows.push(['', '', '', null]);
      }

      // PATRIMONIO - solo agregar si tiene saldo
      if (
        Math.abs(patrimonioTotal) >= 0.01 ||
        Math.abs(beneficiosPeriodoActual) >= 0.01
      ) {
        dataRows.push(['PATRIMONIO', '', '', null]);
        addRowIfNotZero(dataRows, 'Capital Suscrito y Pagado', capitalSuscrito);
        addRowIfNotZero(dataRows, 'Reservas (incluye Reserva Legal)', reservas);
        addRowIfNotZero(dataRows, 'Beneficios o Pérdidas Acumuladas', resultadosAcumulados);
        addRowIfNotZero(dataRows, 'Beneficios del período actual', beneficiosPeriodoActual);
        dataRows.push(['  Total Patrimonio', '', '', patrimonioConResultado]);
        dataRows.push(['', '', '', null]);
      }

      dataRows.push(['TOTAL PASIVOS Y PATRIMONIO', '', '', totalLiabilitiesAndEquity]);

      // Construir archivo Excel usando ExcelJS para poder centrar el título
      const headerRow = ['', '', '', 'Monto'];
      const allRows = [...titleRows, headerRow, ...dataRows];

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Balance');

      // Definir anchos de columna similares al reporte original
      ws.getColumn(1).width = 55;
      ws.getColumn(2).width = 10;
      ws.getColumn(3).width = 10;
      ws.getColumn(4).width = 18;

      allRows.forEach((r) => {
        ws.addRow(r as any[]);
      });

      // Formato numérico para la columna de montos
      ws.getColumn(4).numFmt = '#,##0.00';

      // Centrar y negrita para las primeras filas de título (empresa, título, fecha, moneda)
      const titleRowCount = titleRows.length - 1;
      for (let i = 0; i < titleRowCount; i++) {
        const excelRowIndex = 1 + i;
        ws.mergeCells(excelRowIndex, 1, excelRowIndex, 4);
        const cell = ws.getRow(excelRowIndex).getCell(1);
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.font = { ...(cell.font || {}), bold: true };
      }

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `balance_general_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error downloading Balance Sheet:', error);
      alert('Error al descargar el Balance General');
    }
  };

  const downloadIncomeStatementExcel = async () => {
    try {
      const dataRows: any[] = [];

      if (Math.abs(totals.totalRevenue) >= 0.01) {
        financialData.revenue
          .filter(i => Math.abs(i.amount) >= 0.01)
          .forEach(i => dataRows.push(['INGRESOS', i.name, i.amount]));
        dataRows.push(['', 'Total Ventas', totals.totalRevenue]);
      }

      if (Math.abs(totals.totalCosts) >= 0.01) {
        const costItemsForExport = [
          ...financialData.costs,
          ...financialData.expenses.filter((item) => {
            const code = item.code || '';
            const normalized = code.replace(/\./g, '');
            return normalized.startsWith('5');
          }),
        ];

        costItemsForExport
          .filter((i) => Math.abs(i.amount) >= 0.01)
          .forEach((i) => dataRows.push(['COSTOS', i.name, i.amount]));
        dataRows.push(['', 'Total Costos', totals.totalCosts]);
      }

      if (Math.abs(totals.totalExpenses) >= 0.01) {
        financialData.expenses
          .filter(i => Math.abs(i.amount) >= 0.01)
          .forEach(i => dataRows.push(['GASTOS', i.name, i.amount]));
        dataRows.push(['', 'Total Gastos', totals.totalExpenses]);
      }

      dataRows.push(['', 'UTILIDAD NETA', totals.netIncome]);

      const today = new Date().toISOString().split('T')[0];

      const headerRow = ['Grupo', 'Cuenta', 'Monto'];
      const resolvedInfo = await settingsService.getCompanyInfo();
      const companyName =
        (resolvedInfo as any)?.name ||
        (resolvedInfo as any)?.company_name ||
        '';
      const companyRnc =
        (resolvedInfo as any)?.rnc ||
        (resolvedInfo as any)?.tax_id ||
        (resolvedInfo as any)?.ruc ||
        '';
      const companyAddress = (resolvedInfo as any)?.address || '';
      const companyPhone = (resolvedInfo as any)?.phone || '';
      const companyEmail = (resolvedInfo as any)?.email || '';
      const titleRows = [
        [companyName || '', '', ''],
        ...(companyRnc ? [[`RNC/RUC: ${companyRnc}`, '', '']] : []),
        ...(companyAddress ? [[companyAddress, '', '']] : []),
        ...((companyPhone || companyEmail)
          ? [[
            [companyPhone ? `Tel: ${companyPhone}` : '', companyEmail ? `Email: ${companyEmail}` : '']
              .filter(Boolean)
              .join('  ·  '),
            '',
            '',
          ]]
          : []),
        ['ESTADO DE RESULTADOS', '', ''],
        [incomePeriodDates.periodLabel.toUpperCase(), '', ''],
        ['VALORES EN ', '', ''],
        ['', '', ''],
      ];

      const allRows = [...titleRows, headerRow, ...dataRows];

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Resultados');

      ws.getColumn(1).width = 16;
      ws.getColumn(2).width = 36;
      ws.getColumn(3).width = 14;
      ws.getColumn(3).numFmt = '#,##0.00';

      allRows.forEach((r) => {
        ws.addRow(r as any[]);
      });

      const titleRowCount = titleRows.length - 1;
      for (let i = 0; i < titleRowCount; i++) {
        const excelRowIndex = 1 + i;
        ws.mergeCells(excelRowIndex, 1, excelRowIndex, 3);
        const cell = ws.getRow(excelRowIndex).getCell(1);
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.font = { ...(cell.font || {}), bold: true };
      }

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `estado_resultados_${today}.xlsx`);
    } catch (error) {
      console.error('Error downloading Income Statement:', error);
      alert('Error al descargar el Estado de Resultados');
    }
  };

  const downloadExpensesStatementExcel = async () => {
    try {
      const dataRows: any[] = [];

      const addCategory = (
        categoryName: string,
        total: number,
        items: { name: string; amount: number }[],
      ) => {
        if (Math.abs(total) >= 0.01) {
          dataRows.push([categoryName, '', total]);
          items
            .filter(item => Math.abs(item.amount) >= 0.01)
            .forEach((item) => {
              dataRows.push(['', item.name, item.amount]);
            });
          dataRows.push(['', '', null]);
        }
      };

      addCategory('Gastos de Personal', gastosPersonal, expenseItemsPersonal);
      addCategory('Gastos Generales y Administrativos', gastosGeneralesAdm, expenseItemsGeneralesAdm);
      addCategory('Gastos de Mantenimiento de Activos Fijos', gastosMantenimientoAF, expenseItemsMantenimientoAF);
      addCategory('Gastos de Depreciación', gastosDepreciacion, expenseItemsDepreciacion);
      addCategory('Gastos de Impuestos No Deducibles', gastosImpuestosNoDeducibles, expenseItemsImpuestosNoDeducibles);
      addCategory('Gastos Financieros', gastosFinancieros, expenseItemsFinancieros);

      dataRows.push(['Total gastos del Periodo', '', totals.totalExpenses]);

      const today = new Date().toISOString().split('T')[0];

      const headerRow = ['Categoría', 'Cuenta', 'Monto'];
      const resolvedInfo = await settingsService.getCompanyInfo();
      const companyName =
        (resolvedInfo as any)?.name ||
        (resolvedInfo as any)?.company_name ||
        '';
      const companyRnc =
        (resolvedInfo as any)?.rnc ||
        (resolvedInfo as any)?.tax_id ||
        (resolvedInfo as any)?.ruc ||
        '';
      const companyAddress = (resolvedInfo as any)?.address || '';
      const companyPhone = (resolvedInfo as any)?.phone || '';
      const companyEmail = (resolvedInfo as any)?.email || '';
      const titleRows = [
        [companyName || '', '', ''],
        ...(companyRnc ? [[`RNC/RUC: ${companyRnc}`, '', '']] : []),
        ...(companyAddress ? [[companyAddress, '', '']] : []),
        ...((companyPhone || companyEmail)
          ? [[
            [companyPhone ? `Tel: ${companyPhone}` : '', companyEmail ? `Email: ${companyEmail}` : '']
              .filter(Boolean)
              .join('  ·  '),
            '',
            '',
          ]]
          : []),
        ['ESTADO DE GASTOS GENERALES Y ADMINISTRATIVOS', '', ''],
        [periodDates.periodLabel.toUpperCase(), '', ''],
        ['VALORES EN ', '', ''],
        ['', '', ''],
      ];

      const allRows = [...titleRows, headerRow, ...dataRows];

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Gastos');

      ws.getColumn(1).width = 32;
      ws.getColumn(2).width = 42;
      ws.getColumn(3).width = 16;
      ws.getColumn(3).numFmt = '#,##0.00';

      allRows.forEach((r) => {
        ws.addRow(r as any[]);
      });

      const titleRowCount = titleRows.length - 1;
      for (let i = 0; i < titleRowCount; i++) {
        const excelRowIndex = 1 + i;
        ws.mergeCells(excelRowIndex, 1, excelRowIndex, 3);
        const cell = ws.getRow(excelRowIndex).getCell(1);
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.font = { ...(cell.font || {}), bold: true };
      }

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `estado_gastos_${today}.xlsx`);
    } catch (error) {
      console.error('Error downloading Expenses Statement:', error);
      alert('Error al descargar el Estado de Gastos');
    }
  };

  const downloadCostOfSalesExcel = async () => {
    try {
      const dataRows: any[] = [];

      const costOfSalesForStatement =
        (Number(costOfSalesData.availableForSale) || 0) - (Number(costOfSalesData.closingInventory) || 0);

      if (Math.abs(costOfSalesData.openingInventory) >= 0.01) {
        dataRows.push(['Inventario Inicial', costOfSalesData.openingInventory]);
      }
      if (Math.abs(costOfSalesData.purchasesLocal) >= 0.01) {
        dataRows.push(['Compras Proveedores Locales', costOfSalesData.purchasesLocal]);
      }
      if (Math.abs(costOfSalesData.purchasesImports) >= 0.01) {
        dataRows.push(['Importaciones', costOfSalesData.purchasesImports]);
      }
      if (Math.abs(costOfSalesData.totalPurchases) >= 0.01) {
        dataRows.push(['Total Compras del Periodo', costOfSalesData.totalPurchases]);
      }
      if (Math.abs(costOfSalesData.indirectCosts) >= 0.01) {
        dataRows.push(['Costos Indirectos', costOfSalesData.indirectCosts]);
      }
      if (Math.abs(costOfSalesData.availableForSale) >= 0.01) {
        dataRows.push(['Mercancía Disponible para la venta', costOfSalesData.availableForSale]);
      }
      if (Math.abs(costOfSalesData.closingInventory) >= 0.01) {
        dataRows.push(['Inventario Final', costOfSalesData.closingInventory]);
      }
      dataRows.push(['Costo de Venta del Periodo', costOfSalesForStatement]);

      const today = new Date().toISOString().split('T')[0];

      const headerRow = ['Concepto', 'Monto'];
      const resolvedInfo = await settingsService.getCompanyInfo();
      const companyName =
        (resolvedInfo as any)?.name ||
        (resolvedInfo as any)?.company_name ||
        '';
      const companyRnc =
        (resolvedInfo as any)?.rnc ||
        (resolvedInfo as any)?.tax_id ||
        (resolvedInfo as any)?.ruc ||
        '';
      const companyAddress = (resolvedInfo as any)?.address || '';
      const companyPhone = (resolvedInfo as any)?.phone || '';
      const companyEmail = (resolvedInfo as any)?.email || '';
      const titleRows = [
        [companyName || '', ''],
        ...(companyRnc ? [[`RNC/RUC: ${companyRnc}`, '']] : []),
        ...(companyAddress ? [[companyAddress, '']] : []),
        ...((companyPhone || companyEmail)
          ? [[
            [companyPhone ? `Tel: ${companyPhone}` : '', companyEmail ? `Email: ${companyEmail}` : '']
              .filter(Boolean)
              .join('  ·  '),
            '',
          ]]
          : []),
        ['ESTADO DE COSTOS DE VENTAS', ''],
        [periodDates.periodLabel.toUpperCase(), ''],
        ['VALORES EN ', ''],
        ['', ''],
      ];

      const allRows = [...titleRows, headerRow, ...dataRows];

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Costos de Ventas');

      ws.getColumn(1).width = 45;
      ws.getColumn(2).width = 18;
      ws.getColumn(2).numFmt = '#,##0.00';

      allRows.forEach((r) => {
        ws.addRow(r as any[]);
      });

      const titleRowCount = titleRows.length - 1;
      for (let i = 0; i < titleRowCount; i++) {
        const excelRowIndex = 1 + i;
        ws.mergeCells(excelRowIndex, 1, excelRowIndex, 2);
        const cell = ws.getRow(excelRowIndex).getCell(1);
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.font = { ...(cell.font || {}), bold: true };
      }

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `estado_costos_ventas_${today}.xlsx`);
    } catch (error) {
      console.error('Error downloading Cost of Sales Statement:', error);
      alert('Error al descargar el Estado de Costos de Ventas');
    }
  };

  const downloadCashFlowExcel = async () => {
    try {
      const dataRows: any[] = [];
      const openingCash = cashFlow.openingCash || 0;
      const closingCash = cashFlow.closingCash || 0;
      const netChange = closingCash - openingCash;

      if (Math.abs(cashFlow.operatingCashFlow || 0) >= 0.01) {
        dataRows.push(['ACTIVIDADES DE OPERACIÓN', 'Efectivo de Actividades de Operación', cashFlow.operatingCashFlow]);
      }
      if (Math.abs(cashFlow.investingCashFlow || 0) >= 0.01) {
        dataRows.push(['ACTIVIDADES DE INVERSIÓN', 'Efectivo de Actividades de Inversión', cashFlow.investingCashFlow]);
      }
      if (Math.abs(cashFlow.financingCashFlow || 0) >= 0.01) {
        dataRows.push(['ACTIVIDADES DE FINANCIAMIENTO', 'Efectivo de Actividades de Financiamiento', cashFlow.financingCashFlow]);
      }
      dataRows.push(['RESUMEN', 'Aumento Neto en Efectivo', netChange]);

      const today = new Date().toISOString().split('T')[0];

      const headerRow = ['Actividad', 'Concepto', 'Monto'];
      const resolvedInfo = await settingsService.getCompanyInfo();
      const companyName =
        (resolvedInfo as any)?.name ||
        (resolvedInfo as any)?.company_name ||
        '';
      const companyRnc =
        (resolvedInfo as any)?.rnc ||
        (resolvedInfo as any)?.tax_id ||
        (resolvedInfo as any)?.ruc ||
        '';
      const companyAddress = (resolvedInfo as any)?.address || '';
      const companyPhone = (resolvedInfo as any)?.phone || '';
      const companyEmail = (resolvedInfo as any)?.email || '';
      const titleRows = [
        [companyName || '', '', ''],
        ...(companyRnc ? [[`RNC/RUC: ${companyRnc}`, '', '']] : []),
        ...(companyAddress ? [[companyAddress, '', '']] : []),
        ...((companyPhone || companyEmail)
          ? [[
            [companyPhone ? `Tel: ${companyPhone}` : '', companyEmail ? `Email: ${companyEmail}` : '']
              .filter(Boolean)
              .join('  ·  '),
            '',
            '',
          ]]
          : []),
        ['ESTADO DE FLUJOS DE EFECTIVO', '', ''],
        [periodDates.periodLabel.toUpperCase(), '', ''],
        ['VALORES EN ', '', ''],
        ['', '', ''],
      ];

      const allRows = [...titleRows, headerRow, ...dataRows];

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Flujo');

      ws.getColumn(1).width = 18;
      ws.getColumn(2).width = 36;
      ws.getColumn(3).width = 14;
      ws.getColumn(3).numFmt = '#,##0.00';

      allRows.forEach((r) => {
        ws.addRow(r as any[]);
      });

      const titleRowCount = titleRows.length - 1;
      for (let i = 0; i < titleRowCount; i++) {
        const excelRowIndex = 1 + i;
        ws.mergeCells(excelRowIndex, 1, excelRowIndex, 3);
        const cell = ws.getRow(excelRowIndex).getCell(1);
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.font = { ...(cell.font || {}), bold: true };
      }

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `flujo_efectivo_${today}.xlsx`);
    } catch (error) {
      console.error('Error downloading Cash Flow:', error);
      alert('Error al descargar el Flujo de Efectivo');
    }
  };

  const handleViewStatement = (statement: FinancialStatement) => {
    setSelectedStatement(statement);
    setShowViewModal(true);
  };

  const handleDownloadStatement = (statement: FinancialStatement) => {
    try {
      if (statement.type === 'balance_sheet') {
        downloadBalanceSheetExcel();
      } else if (statement.type === 'income_statement') {
        downloadIncomeStatementExcel();
      } else if (statement.type === 'cash_flow') {
        downloadCashFlowExcel();
      } else {
        // Para otros tipos, usar descarga básica
        let content = `${getTypeLabel(statement.type)} - ${statement.name}\n`;
        content += `Período: ${statement.period}\n`;
        content += `Estado: ${statement.status === 'draft' ? 'Borrador' : statement.status === 'final' ? 'Final' : 'Aprobado'}\n`;
        content += `Fecha de Creación: ${formatDate(statement.created_at)}\n\n`;
        content += 'Este estado financiero está en desarrollo.\n';
        content += 'Próximamente estará disponible la descarga completa.';

        const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `${statement.name.replace(/\s+/g, '_')}.txt`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error) {
      console.error('Error downloading statement:', error);
      alert('Error al descargar el estado financiero');
    }
  };

  const handleEditStatement = (statement: FinancialStatement) => {
    setSelectedStatement(statement);
    setShowEditModal(true);
  };

  return (
    <DashboardLayout>
      {/* Estilos de impresión */}
      <style dangerouslySetInnerHTML={{ __html: printStyles }} />
      
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center print-hidden">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Financial Statements</h1>
            <p className="text-gray-600">Generation and management of financial reports</p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={() => setShowNewStatementModal(true)}
              className="text-white px-4 py-2 rounded-lg transition-colors whitespace-nowrap shadow-sm"
              style={{ backgroundColor: theme.primary }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = theme.primaryHover; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = theme.primary; }}
            >
              <i className="ri-add-line mr-2"></i>
              Generate Statement
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 print-hidden">
          <nav className="-mb-px flex space-x-8">
            {[
              { id: 'statements', label: 'Generated Statements', icon: 'ri-file-list-3-line' },
              { id: 'balance', label: 'Balance Sheet', icon: 'ri-scales-3-line' },
              { id: 'income', label: 'Income Statement', icon: 'ri-line-chart-line' },
              { id: 'costs', label: 'Cost of Sales Statement', icon: 'ri-bill-line' },
              { id: 'expenses', label: 'G&A Expenses Statement', icon: 'ri-bar-chart-2-line' },
              { id: 'cashflow', label: 'Cash Flow', icon: 'ri-money-dollar-circle-line' },
              { id: 'anexos', label: 'Notes to FS', icon: 'ri-attachment-2' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'text-gray-900'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
                style={
                  activeTab === tab.id
                    ? { borderColor: theme.primary, color: theme.softText }
                    : { borderColor: 'transparent' }
                }
              >
                <i className={tab.icon + ' mr-2'}></i>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        {activeTab === 'statements' && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-semibold">Generated Financial Statements</h2>
                <select
                  value={selectedPeriod}
                  onChange={(e) => setSelectedPeriod(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm pr-8 bg-white focus:ring-2"
                >
                  {periodOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Financial Statement
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Period
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Created At
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {statements.map((statement) => (
                      <tr key={statement.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{statement.name}</div>
                            <div className="text-sm text-gray-500">{getTypeLabel(statement.type)}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {statement.period}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(statement.status)}`}>
                            {statement.status === 'draft' ? 'Borrador' : 
                             statement.status === 'final' ? 'Final' : 'Aprobado'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatDate(statement.created_at)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex space-x-2">
                            <button 
                              onClick={() => handleViewStatement(statement)}
                              className="font-medium"
                              style={{ color: theme.primary }}
                              title="Ver"
                            >
                              <i className="ri-eye-line"></i>
                            </button>
                            <button 
                              onClick={() => handleDownloadStatement(statement)}
                              className="text-green-600 hover:text-green-900"
                              title="Descargar"
                            >
                              <i className="ri-download-line"></i>
                            </button>
                            <button 
                              onClick={() => handleEditStatement(statement)}
                              className="text-gray-600 hover:text-gray-900"
                              title="Editar"
                            >
                              <i className="ri-edit-line"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'expenses' && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-6">
              {/* Header con selector de fechas y botón de descarga */}
              <div className="flex items-center justify-between gap-2 mb-4 print-hidden">
                <div>
                  <div className="text-xs text-gray-500 mb-1">Mes / Día / Año</div>
                  <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-700">Desde:</label>
                  <DateInput
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={incomeFromDate}
                    onChange={(e) => {
                      setUseCustomRange(true);
                      setIncomeFromDate(e.target.value);
                    }}
                  />
                  <span className="text-xs text-gray-500">({formatDate(incomeFromDate)})</span>
                  <span className="text-sm text-gray-700">Hasta:</span>
                  <DateInput
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={incomeToDate || ''}
                    onChange={(e) => {
                      setUseCustomRange(true);
                      setIncomeToDate(e.target.value || null);
                    }}
                  />
                  <span className="text-xs text-gray-500">({formatDate(incomeToDate || '')})</span>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowComparisonControls((prev) => !prev)}
                    className="bg-gray-100 text-gray-800 px-3 py-2 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap text-sm border border-gray-300"
                  >
                    <i className="ri-contrast-drop-line mr-2"></i>
                    Comparativo
                  </button>
                  <button
                    onClick={downloadExpensesStatementExcel}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap text-sm"
                  >
                    <i className="ri-download-line mr-2"></i>
                    Excel
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap text-sm"
                  >
                    <i className="ri-file-pdf-line mr-2"></i>
                    PDF
                  </button>
                </div>
              </div>

              {!areExpensesTotalsConsistent && (
                <div className="mb-4 bg-yellow-50 border border-yellow-200 text-yellow-900 px-4 py-3 rounded-lg print-hidden">
                  <div className="font-semibold">Advertencia: Gastos no concilian</div>
                  <div className="text-sm mt-1">
                    Diferencia (Suma categorías - Total Gastos): {formatCurrencyRD(expensesTotalsImbalance)}
                  </div>
                </div>
              )}

              {showComparisonControls && (
                <div className="flex items-center justify-end gap-2 mb-2 print-hidden">
                  <div>
                    <div className="text-[11px] text-gray-500 mb-1">Mes / Día / Año</div>
                    <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-700">Comparativo desde:</label>
                    <DateInput
                      className="border border-gray-300 rounded-lg px-3 py-1 text-xs"
                      value={comparisonFromDate || ''}
                      onChange={(e) => handleComparisonFromChange(e.target.value)}
                    />
                    <span className="text-xs text-gray-700">Hasta:</span>
                    <DateInput
                      className="border border-gray-300 rounded-lg px-3 py-1 text-xs"
                      value={comparisonToDate || ''}
                      onChange={(e) => handleComparisonToChange(e.target.value)}
                    />
                    </div>
                  </div>
                  {comparisonFromDate && (
                    <button
                      type="button"
                      onClick={() => {
                        setComparisonFromDate(null);
                        setComparisonToDate(null);
                        setComparisonIncome(null);
                        setComparisonTotals(null);
                        setComparisonCashFlow(null);
                      }}
                      className="text-xs text-gray-600 hover:text-gray-800 underline"
                    >
                      Quitar comparativo
                    </button>
                  )}
                </div>
              )}

              {/* Contenido para impresión */}
              <div id="printable-statement">
              {/* Header y título */}
              <div className="text-center mb-8">
                {!!companyNameForHeader && (
                  <div className="mb-2 print-only">
                    <div className="text-sm font-semibold text-gray-900">{companyNameForHeader}</div>
                    {companyRncForHeader && (
                      <div className="text-xs text-gray-700">RNC/RUC: {companyRncForHeader}</div>
                    )}
                    {companyAddressForHeader && (
                      <div className="text-xs text-gray-700">{companyAddressForHeader}</div>
                    )}
                    {(companyPhoneForHeader || companyEmailForHeader) && (
                      <div className="text-xs text-gray-600">
                        {[companyPhoneForHeader ? `Tel: ${companyPhoneForHeader}` : '', companyEmailForHeader ? `Email: ${companyEmailForHeader}` : '']
                          .filter(Boolean)
                          .join('  ·  ')}
                      </div>
                    )}
                  </div>
                )}
                <h1 className="text-xl font-bold text-gray-900">
                  RELACION DE GASTOS GENERALES Y ADMINITRATIVOS
                </h1>
                <p className="text-sm text-gray-700 mb-0.5">{incomePeriodDates.periodLabel}</p>
                {comparisonPeriodLabel && (
                  <p className="text-xs text-gray-700 mb-0.5">
                    Período comparativo: {comparisonPeriodLabel}
                  </p>
                )}
                <p className="text-xs text-gray-600">VALORES EN </p>
              </div>

              <div className="max-w-3xl mx-auto space-y-6">
                {/* Título del estado */}
                <div>
                  <h2 className="text-lg font-bold text-gray-900 border-b-2 border-gray-800 pb-1">
                    Estado de Gastos Generales y Adm.
                  </h2>
                </div>

                <div className="flex justify-end print-hidden">
                  <label className="inline-flex items-center space-x-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 focus:ring-2"
                      style={{ accentColor: theme.primary }}
                      checked={showExpensesDetail}
                      onChange={(e) => setShowExpensesDetail(e.target.checked)}
                    />
                    <span>Ver detalle por cuenta</span>
                  </label>
                </div>

                {/* Categorías de gastos */}
                <div className="space-y-1">
                  <div className={`py-0.5 pl-4 ${Math.abs(gastosPersonal) < 0.01 ? 'hide-zero-on-print' : ''}`}>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-700">Gastos de Personal</span>
                      <span className="text-sm text-gray-900 tabular-nums">{formatCurrency(gastosPersonal)}</span>
                    </div>
                    {showExpensesDetail && expenseItemsPersonal.length > 0 && (
                      <div className="mt-1 space-y-0.5 pl-4">
                        {expenseItemsPersonal.map((item) => (
                          <div key={item.code} className={`flex justify-between text-xs text-gray-600 ${Math.abs(item.amount) < 0.01 ? 'hide-zero-on-print' : ''}`}>
                            <span>{item.name}</span>
                            <span className="tabular-nums">{formatCurrency(item.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className={`py-0.5 pl-4 ${Math.abs(gastosGeneralesAdm) < 0.01 ? 'hide-zero-on-print' : ''}`}>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-700">Gastos Generales y Administrativos</span>
                      <span className="text-sm text-gray-900 tabular-nums">{formatCurrency(gastosGeneralesAdm)}</span>
                    </div>
                    {showExpensesDetail && expenseItemsGeneralesAdm.length > 0 && (
                      <div className="mt-1 space-y-0.5 pl-4">
                        {expenseItemsGeneralesAdm.map((item) => (
                          <div key={item.code} className={`flex justify-between text-xs text-gray-600 ${Math.abs(item.amount) < 0.01 ? 'hide-zero-on-print' : ''}`}>
                            <span>{item.name}</span>
                            <span className="tabular-nums">{formatCurrency(item.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className={`py-0.5 pl-4 ${Math.abs(gastosMantenimientoAF) < 0.01 ? 'hide-zero-on-print' : ''}`}>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-700">Gastos de Mantenimiento de Activos Fijos</span>
                      <span className="text-sm text-gray-900 tabular-nums">{formatCurrency(gastosMantenimientoAF)}</span>
                    </div>
                    {showExpensesDetail && expenseItemsMantenimientoAF.length > 0 && (
                      <div className="mt-1 space-y-0.5 pl-4">
                        {expenseItemsMantenimientoAF.map((item) => (
                          <div key={item.code} className={`flex justify-between text-xs text-gray-600 ${Math.abs(item.amount) < 0.01 ? 'hide-zero-on-print' : ''}`}>
                            <span>{item.name}</span>
                            <span className="tabular-nums">{formatCurrency(item.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className={`py-0.5 pl-4 ${Math.abs(gastosDepreciacion) < 0.01 ? 'hide-zero-on-print' : ''}`}>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-700">Gastos de Depreciación</span>
                      <span className="text-sm text-gray-900 tabular-nums">{formatCurrency(gastosDepreciacion)}</span>
                    </div>
                    {showExpensesDetail && expenseItemsDepreciacion.length > 0 && (
                      <div className="mt-1 space-y-0.5 pl-4">
                        {expenseItemsDepreciacion.map((item) => (
                          <div key={item.code} className={`flex justify-between text-xs text-gray-600 ${Math.abs(item.amount) < 0.01 ? 'hide-zero-on-print' : ''}`}>
                            <span>{item.name}</span>
                            <span className="tabular-nums">{formatCurrency(item.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className={`py-0.5 pl-4 ${Math.abs(gastosImpuestosNoDeducibles) < 0.01 ? 'hide-zero-on-print' : ''}`}>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-700">Gastos de Impuestos No Deducibles</span>
                      <span className="text-sm text-gray-900 tabular-nums">{formatCurrency(gastosImpuestosNoDeducibles)}</span>
                    </div>
                    {showExpensesDetail && expenseItemsImpuestosNoDeducibles.length > 0 && (
                      <div className="mt-1 space-y-0.5 pl-4">
                        {expenseItemsImpuestosNoDeducibles.map((item) => (
                          <div key={item.code} className={`flex justify-between text-xs text-gray-600 ${Math.abs(item.amount) < 0.01 ? 'hide-zero-on-print' : ''}`}>
                            <span>{item.name}</span>
                            <span className="tabular-nums">{formatCurrency(item.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className={`py-0.5 pl-4 ${Math.abs(gastosFinancieros) < 0.01 ? 'hide-zero-on-print' : ''}`}>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-700">Gastos Financieros</span>
                      <span className="text-sm text-gray-900 tabular-nums">{formatCurrency(gastosFinancieros)}</span>
                    </div>
                    {showExpensesDetail && expenseItemsFinancieros.length > 0 && (
                      <div className="mt-1 space-y-0.5 pl-4">
                        {expenseItemsFinancieros.map((item) => (
                          <div key={item.code} className={`flex justify-between text-xs text-gray-600 ${Math.abs(item.amount) < 0.01 ? 'hide-zero-on-print' : ''}`}>
                            <span>{item.name}</span>
                            <span className="tabular-nums">{formatCurrency(item.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Total gastos del periodo */}
                <div className="border-t-2 border-gray-800 pt-3 mt-3">
                  <div className="flex justify-between font-bold">
                    <span className="text-base">Total gastos del Periodo</span>
                    <div className="flex items-center gap-6">
                      <span className="text-base tabular-nums">{formatCurrencyRD(totals.totalExpenses)}</span>
                      {comparisonTotals && (
                        <span className="text-base tabular-nums text-gray-500">
                          {formatCurrencyRD(comparisonTotals.totalExpenses)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              </div> {/* Cierre de printable-statement */}
            </div>
          </div>
        )}

        {activeTab === 'costs' && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-6">
              {/* Header con selector de fechas y botón de descarga */}
              <div className="flex items-center justify-between gap-2 mb-4 print-hidden">
                <div>
                  <div className="text-xs text-gray-500 mb-1">Mes / Día / Año</div>
                  <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-700">Desde:</label>
                  <DateInput
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={incomeFromDate}
                    onChange={(e) => {
                      setUseCustomRange(true);
                      setIncomeFromDate(e.target.value);
                    }}
                  />
                  <span className="text-sm text-gray-700">Hasta:</span>
                  <DateInput
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={incomeToDate || ''}
                    onChange={(e) => {
                      setUseCustomRange(true);
                      setIncomeToDate(e.target.value || null);
                    }}
                  />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowComparisonControls((prev) => !prev)}
                    className="bg-gray-100 text-gray-800 px-3 py-2 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap text-sm border border-gray-300"
                  >
                    <i className="ri-contrast-drop-line mr-2"></i>
                    Comparativo
                  </button>
                  <button
                    onClick={downloadCostOfSalesExcel}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap text-sm"
                  >
                    <i className="ri-download-line mr-2"></i>
                    Excel
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap text-sm"
                  >
                    <i className="ri-file-pdf-line mr-2"></i>
                    PDF
                  </button>
                </div>
              </div>

              {!areCostsTotalsConsistent && (
                <div className="mb-4 bg-yellow-50 border border-yellow-200 text-yellow-900 px-4 py-3 rounded-lg print-hidden">
                  <div className="font-semibold">Advertencia: Costos no concilian</div>
                  <div className="text-sm mt-1">
                    Diferencia (Costo de Venta - Costos en Resultados): {formatCurrencyRD(costsTotalsImbalance)}
                  </div>
                </div>
              )}

              {showComparisonControls && (
                <div className="flex items-center justify-end gap-2 mb-2 print-hidden">
                  <div>
                    <div className="text-[11px] text-gray-500 mb-1">Mes / Día / Año</div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-700">Comparativo desde:</label>
                      <DateInput
                        className="border border-gray-300 rounded-lg px-3 py-1 text-xs"
                        value={comparisonFromDate || ''}
                        onChange={(e) => handleComparisonFromChange(e.target.value)}
                      />
                      <span className="text-xs text-gray-700">Hasta:</span>
                      <DateInput
                        className="border border-gray-300 rounded-lg px-3 py-1 text-xs"
                        value={comparisonToDate || ''}
                        onChange={(e) => handleComparisonToChange(e.target.value)}
                      />
                    </div>
                  </div>
                  {comparisonFromDate && (
                    <button
                      type="button"
                      onClick={() => {
                        setComparisonFromDate(null);
                        setComparisonToDate(null);
                        setComparisonIncome(null);
                        setComparisonTotals(null);
                        setComparisonCashFlow(null);
                      }}
                      className="text-xs text-gray-600 hover:text-gray-800 underline"
                    >
                      Quitar comparativo
                    </button>
                  )}
                </div>
              )}

              {/* Contenido para impresión */}
              <div id="printable-statement">
              {/* Header y título */}
              <div className="text-center mb-8">
                {!!companyNameForHeader && (
                  <div className="mb-2 print-only">
                    <div className="text-sm font-semibold text-gray-900">{companyNameForHeader}</div>
                    {companyRncForHeader && (
                      <div className="text-xs text-gray-700">RNC/RUC: {companyRncForHeader}</div>
                    )}
                    {companyAddressForHeader && (
                      <div className="text-xs text-gray-700">{companyAddressForHeader}</div>
                    )}
                    {(companyPhoneForHeader || companyEmailForHeader) && (
                      <div className="text-xs text-gray-600">
                        {[companyPhoneForHeader ? `Tel: ${companyPhoneForHeader}` : '', companyEmailForHeader ? `Email: ${companyEmailForHeader}` : '']
                          .filter(Boolean)
                          .join('  ·  ')}
                      </div>
                    )}
                  </div>
                )}
                <h1 className="text-xl font-bold text-gray-900">ESTADO DE COSTOS DE VENTAS</h1>
                <p className="text-sm text-gray-700 mb-0.5">{incomePeriodDates.periodLabel}</p>
                {comparisonPeriodLabel && (
                  <p className="text-xs text-gray-700 mb-0.5">
                    Período comparativo: {comparisonPeriodLabel}
                  </p>
                )}
                <p className="text-xs text-gray-600">VALORES EN </p>
              </div>

              <div className="max-w-3xl mx-auto space-y-6">
                {/* Título del estado */}
                <div>
                  <h2 className="text-lg font-bold text-gray-900 border-b-2 border-gray-800 pb-1">
                    ESTADO DE COSTOS DE VENTAS
                  </h2>
                </div>

                {/* Inventario inicial */}
                <div className="space-y-1">
                  {renderBalanceLineIfNotZero('Inventario Inicial', costOfSalesData.openingInventory)}
                </div>

                {/* Compras del periodo */}
                <div className="space-y-1 pt-2">
                  <div className="text-sm font-semibold text-gray-800 pl-2">Más:</div>
                  <div className="pl-2">
                    {renderBalanceLineIfNotZero('Compras Proveedores Locales', costOfSalesData.purchasesLocal)}
                    {renderBalanceLineIfNotZero('Importaciones', costOfSalesData.purchasesImports)}
                  </div>
                  <div className="border-t border-gray-300 mt-2 pt-1 pl-6">
                    <div className="flex justify-between font-semibold">
                      <span className="text-sm">Total Compras del Periodo</span>
                      <span className="text-sm tabular-nums">{formatCurrencyRD(costOfSalesData.totalPurchases)}</span>
                    </div>
                  </div>
                </div>

                {/* Mercancía disponible para la venta */}
                <div className="border-t border-gray-800 pt-2 mt-3">
                  <div className="flex justify-between font-bold">
                    <span className="text-sm">Mercancía Disponible para la venta</span>
                    <span className="text-sm tabular-nums">{formatCurrencyRD(costOfSalesData.availableForSale)}</span>
                  </div>
                </div>

                {/* Inventario final */}
                <div className="space-y-1 pt-4">
                  <div className="text-sm font-semibold text-gray-800 pl-2">Menos:</div>
                  <div className="flex justify-between py-0.5 pl-6">
                    <span className="text-sm text-gray-700">Inventario Final</span>
                    <span className="text-sm text-gray-900 tabular-nums">{formatCurrency(costOfSalesData.closingInventory)}</span>
                  </div>
                </div>

                {/* Costo de Venta del Periodo */}
                <div className="border-t-2 border-gray-800 pt-3 mt-3">
                  <div className="flex justify-between font-bold">
                    <span className="text-base">Costo de Venta del Periodo</span>
                    <div className="flex items-center gap-6">
                      <span className="text-base tabular-nums">
                        {formatCurrencyRD(costOfSalesData.availableForSale - costOfSalesData.closingInventory)}
                      </span>
                      {comparisonTotals && (
                        <span className="text-base tabular-nums text-gray-500">
                          {formatCurrencyRD(comparisonTotals.totalCosts)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              </div> {/* Cierre de printable-statement */}
            </div>
          </div>
        )}

        {activeTab === 'balance' && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-6">
              {/* Header con selector de período y botón de descarga */}
              <div className="flex items-center justify-between gap-2 mb-4 print-hidden">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-700">Período:</label>
                  <select
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm pr-8"
                    value={selectedPeriod}
                    onChange={(e) => setSelectedPeriod(e.target.value)}
                  >
                    {periodOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowComparisonControls((prev) => !prev)}
                    className="bg-gray-100 text-gray-800 px-3 py-2 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap text-sm border border-gray-300"
                  >
                    <i className="ri-contrast-drop-line mr-2"></i>
                    Comparativo
                  </button>
                  <button
                    onClick={downloadBalanceSheetExcel}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap text-sm"
                  >
                    <i className="ri-download-line mr-2"></i>
                    Excel
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap text-sm"
                  >
                    <i className="ri-file-pdf-line mr-2"></i>
                    PDF
                  </button>
                </div>
              </div>

              {showComparisonControls && (
                <div className="flex items-center justify-end gap-2 mb-2 print-hidden">
                  <div>
                    <div className="text-[11px] text-gray-500 mb-1">Mes / Día / Año</div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-700">Comparativo desde:</label>
                      <DateInput
                        className="border border-gray-300 rounded-lg px-3 py-1 text-xs"
                        value={comparisonFromDate || ''}
                        onChange={(e) => handleComparisonFromChange(e.target.value)}
                      />
                      <span className="text-xs text-gray-700">Hasta:</span>
                      <DateInput
                        className="border border-gray-300 rounded-lg px-3 py-1 text-xs"
                        value={comparisonToDate || ''}
                        onChange={(e) => handleComparisonToChange(e.target.value)}
                      />
                    </div>
                  </div>
                  {comparisonFromDate && (
                    <button
                      type="button"
                      onClick={() => {
                        setComparisonFromDate(null);
                        setComparisonToDate(null);
                        setComparisonIncome(null);
                        setComparisonTotals(null);
                        setComparisonCashFlow(null);
                      }}
                      className="text-xs text-gray-600 hover:text-gray-800 underline"
                    >
                      Quitar comparativo
                    </button>
                  )}
                </div>
              )}

              {!isBalanceBalanced && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg print-hidden">
                  <div className="font-semibold">Advertencia: Balance no cuadra</div>
                  <div className="text-sm mt-1">
                    Diferencia (Activos - (Pasivos + Patrimonio + Resultado)): {formatCurrencyRD(balanceImbalance)}
                  </div>
                </div>
              )}

              {/* Contenido para impresión */}
              <div id="printable-statement">
              {/* Título centrado estilo profesional */}
              <div className="text-center mb-8">
                {!!companyNameForHeader && (
                  <div className="mb-2 print-only">
                    <div className="text-sm font-semibold text-gray-900">{companyNameForHeader}</div>
                    {companyRncForHeader && (
                      <div className="text-xs text-gray-700">RNC/RUC: {companyRncForHeader}</div>
                    )}
                    {companyAddressForHeader && (
                      <div className="text-xs text-gray-700">{companyAddressForHeader}</div>
                    )}
                    {(companyPhoneForHeader || companyEmailForHeader) && (
                      <div className="text-xs text-gray-600">
                        {[companyPhoneForHeader ? `Tel: ${companyPhoneForHeader}` : '', companyEmailForHeader ? `Email: ${companyEmailForHeader}` : '']
                          .filter(Boolean)
                          .join('  ·  ')}
                      </div>
                    )}
                  </div>
                )}
                <h1 className="text-xl font-bold text-gray-900">BALANCE GENERAL</h1>
                <p className="text-sm text-gray-700 mb-0.5">{periodDates.asOfDateLabel}</p>
                {comparisonPeriodLabel && (
                  <p className="text-xs text-gray-700 mb-0.5">
                    Período comparativo: {comparisonPeriodLabel}
                  </p>
                )}
                <p className="text-xs text-gray-600">VALORES EN </p>
              </div>

              <div className="max-w-4xl mx-auto space-y-6">
                {/* ACTIVOS */}
                <div>
                  <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b-2 border-gray-300">ACTIVOS</h2>

                  {/* ACTIVOS CORRIENTES */}
                  <div className="mb-4">
                    <h3 className="text-sm font-bold text-gray-800 mb-2 underline">ACTIVOS CORRIENTES</h3>

                    {renderBalanceLineIfNotZero('Efectivo en Caja y Bancos', efectivoCajaBancos)}
                    {renderBalanceLineIfNotZero('Cuentas por Cobrar Clientes', cxcClientes)}
                    {renderBalanceLineIfNotZero('Otras Cuentas por Cobrar', otrasCxc)}
                    {renderBalanceLineIfNotZero('ITBIS en compras', itbisCompras)}
                    {renderBalanceLineIfNotZero('Inventarios', inventarios)}
                    {renderBalanceLineIfNotZero('Gastos Pagados por Anticipado', gastosPagadosAnticipado)}

                    <div className="border-t border-gray-300 mt-2 pt-1 pl-4">
                      <div className="flex justify-between font-semibold">
                        <span className="text-sm">Total Activos Corrientes</span>
                        <div className="flex items-center gap-6">
                          <span className="text-sm tabular-nums">{formatCurrencyRD(totals.totalCurrentAssets)}</span>
                          {comparisonTotals && (
                            <span className="text-sm tabular-nums text-gray-500">
                              {formatCurrencyRD(comparisonTotals.totalCurrentAssets)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ACTIVOS FIJOS */}
                  <div className={`mb-4 ${Math.abs(activosFijos) < 0.01 ? 'hide-zero-on-print' : ''}`}>
                    <h3 className="text-sm font-bold text-gray-800 mb-2 underline">ACTIVOS FIJOS</h3>
                    {renderBalanceLineIfNotZero('Activos Fijos', activosFijos)}

                    <div className="border-t border-gray-300 mt-2 pt-1 pl-4">
                      <div className="flex justify-between font-semibold">
                        <span className="text-sm">Total Activos Fijos</span>
                        <div className="flex items-center gap-6">
                          <span className="text-sm tabular-nums">{formatCurrencyRD(activosFijos)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* OTROS ACTIVOS */}
                  <div className={`mb-4 ${Math.abs(totals.totalNonCurrentAssets) < 0.01 ? 'hide-zero-on-print' : ''}`}>
                    <h3 className="text-sm font-bold text-gray-800 mb-2 underline">OTROS ACTIVOS</h3>
                    {renderBalanceLineIfNotZero('Inversiones en Otras Compañías', invAcciones)}
                    {renderBalanceLineIfNotZero('Certificados Bancarios y Títulos Financieros', invCertificados)}
                    {renderBalanceLineIfNotZero('Fianzas y Depósitos', fianzasDepositos)}
                    {renderBalanceLineIfNotZero('Licencias y Softwares', licenciasSoftware)}
                    {renderBalanceLineIfNotZero('Otros Activos', otrosActivos)}

                    <div className="border-t border-gray-300 mt-2 pt-1 pl-4">
                      <div className="flex justify-between font-semibold">
                        <span className="text-sm">Total Otros Activos</span>
                        <div className="flex items-center gap-6">
                          <span className="text-sm tabular-nums">{formatCurrencyRD(totals.totalNonCurrentAssets)}</span>
                          {comparisonTotals && (
                            <span className="text-sm tabular-nums text-gray-500">
                              {formatCurrencyRD(comparisonTotals.totalNonCurrentAssets)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* TOTAL ACTIVOS */}
                  <div className="border-t-2 border-gray-800 pt-2 mt-3">
                    <div className="flex justify-between font-bold">
                      <span className="text-base">TOTAL ACTIVOS</span>
                      <div className="flex items-center gap-6">
                        <span className="text-base tabular-nums">{formatCurrencyRD(totals.totalAssets)}</span>
                        {comparisonTotals && (
                          <span className="text-base tabular-nums text-gray-500">
                            {formatCurrencyRD(comparisonTotals.totalAssets)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* PASIVO Y PATRIMONIO */}
                <div className="pt-4">
                  <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b-2 border-gray-300">PASIVO Y PATRIMONIO DE LOS SOCIOS</h2>

                  {/* PASIVOS CIRCULANTES */}
                  <div className={`mb-4 ${Math.abs(pasivosCorrientes) < 0.01 ? 'hide-zero-on-print' : ''}`}>
                    <h3 className="text-sm font-bold text-gray-800 mb-2 underline">PASIVOS CIRCULANTES</h3>
                    {renderBalanceLineIfNotZero('Cuentas por Pagar Proveedores', cppProveedores)}
                    {renderBalanceLineIfNotZero('Acumulaciones y Provisiones por Pagar', acumulacionesPorPagar)}
                    {renderBalanceLineIfNotZero('Préstamos por Pagar a Corto Plazo', prestamosCortoPlazo)}
                    {renderBalanceLineIfNotZero('Otras Cuentas por Pagar', otrasCxPCorrientes)}

                    <div className="border-t border-gray-300 mt-2 pt-1 pl-4">
                      <div className="flex justify-between font-semibold">
                        <span className="text-sm">Total Pasivos Corrientes</span>
                        <div className="flex items-center gap-6">
                          <span className="text-sm tabular-nums">{formatCurrencyRD(pasivosCorrientes)}</span>
                          {comparisonTotals && (
                            <span className="text-sm tabular-nums text-gray-500">
                              {formatCurrencyRD(comparisonTotals.totalCurrentLiabilities)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* PASIVOS A LARGO PLAZO */}
                  <div className={`mb-4 ${Math.abs(pasivosLargoPlazo) < 0.01 ? 'hide-zero-on-print' : ''}`}>
                    <h3 className="text-sm font-bold text-gray-800 mb-2 underline">PASIVOS A LARGO PLAZO</h3>
                    {renderBalanceLineIfNotZero('Pasivos a Largo Plazo', pasivosLargoPlazo)}
                    {nonCurrentLiabilities.length > 0 && (
                      <div className="border-t border-gray-300 mt-2 pt-1 pl-4">
                        <div className="flex justify-between font-semibold">
                          <span className="text-sm">Total Pasivos a Largo Plazo</span>
                          <div className="flex items-center gap-6">
                            <span className="text-sm tabular-nums">{formatCurrencyRD(pasivosLargoPlazo)}</span>
                            {comparisonTotals && (
                              <span className="text-sm tabular-nums text-gray-500">
                                {formatCurrencyRD(comparisonTotals.totalNonCurrentLiabilities)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* TOTAL PASIVOS */}
                  <div className={`border-t border-gray-400 pt-2 mb-4 ${Math.abs(totals.totalLiabilities) < 0.01 ? 'hide-zero-on-print' : ''}`}>
                    <div className="flex justify-between font-bold">
                      <span className="text-sm">TOTAL PASIVOS</span>
                      <div className="flex items-center gap-6">
                        <span className="text-sm tabular-nums">{formatCurrencyRD(totals.totalLiabilities)}</span>
                        {comparisonTotals && (
                          <span className="text-sm tabular-nums text-gray-500">
                            {formatCurrencyRD(comparisonTotals.totalLiabilities)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* PATRIMONIO */}
                  <div
                    className={`mb-4 ${
                      Math.abs(patrimonioTotal) < 0.01 &&
                      Math.abs(beneficiosPeriodoActual) < 0.01
                        ? 'hide-zero-on-print'
                        : ''
                    }`}
                  >
                    <h3 className="text-sm font-bold text-gray-800 mb-2 underline">PATRIMONIO</h3>
                    {/* Mostrar cada cuenta de patrimonio individualmente */}
                    {equityItems.map((item) => (
                      <div key={item.code}>
                        {renderBalanceLineIfNotZero(item.name, item.amount)}
                      </div>
                    ))}
                    {renderBalanceLineIfNotZero('Beneficios del periodo actual', beneficiosPeriodoActual)}
                    <div className="border-t border-gray-300 mt-2 pt-1 pl-4">
                      <div className="flex justify-between font-semibold">
                        <span className="text-sm">Total Patrimonio</span>
                        <div className="flex items-center gap-6">
                          <span className="text-sm tabular-nums">{formatCurrencyRD(patrimonioConResultado)}</span>
                          {comparisonPatrimonioConResultado !== null && (
                            <span className="text-sm tabular-nums text-gray-500">
                              {formatCurrencyRD(comparisonPatrimonioConResultado)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* TOTAL PASIVOS Y PATRIMONIO */}
                  <div className="border-t-2 border-gray-800 pt-2 mt-3">
                    <div className="flex justify-between font-bold">
                      <span className="text-base">TOTAL PASIVOS Y PATRIMONIO</span>
                      <div className="flex items-center gap-6">
                        <span className="text-base tabular-nums">{formatCurrencyRD(totalLiabilitiesAndEquity)}</span>
                        {comparisonLiabilitiesAndEquity !== null && (
                          <span className="text-base tabular-nums text-gray-500">
                            {formatCurrencyRD(comparisonLiabilitiesAndEquity)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              </div> {/* Cierre de printable-statement */}
            </div>
          </div>
        )}

        {activeTab === 'income' && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-6">
              {/* Header con selector de período y botón de descarga */}
              <div className="flex items-center justify-between gap-2 mb-4 print-hidden">
                <div>
                  <div className="text-xs text-gray-500 mb-1">Mes / Día / Año</div>
                  <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-700">Desde:</label>
                  <DateInput
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={incomeFromDate}
                    onChange={(e) => {
                      setUseCustomRange(true);
                      setIncomeFromDate(e.target.value);
                    }}
                  />
                  <span className="text-sm text-gray-700">Hasta:</span>
                  <DateInput
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={incomeToDate || ''}
                    onChange={(e) => {
                      setUseCustomRange(true);
                      setIncomeToDate(e.target.value || null);
                    }}
                  />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowComparisonControls((prev) => !prev)}
                    className="bg-gray-100 text-gray-800 px-3 py-2 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap text-sm border border-gray-300"
                  >
                    <i className="ri-contrast-drop-line mr-2"></i>
                    Comparativo
                  </button>
                  <button
                    onClick={downloadIncomeStatementExcel}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap text-sm"
                  >
                    <i className="ri-download-line mr-2"></i>
                    Excel
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap text-sm"
                  >
                    <i className="ri-file-pdf-line mr-2"></i>
                    PDF
                  </button>
                </div>
              </div>

              {showComparisonControls && (
                <div className="flex items-center justify-end gap-2 mb-2 print-hidden">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-700">Comparativo desde:</label>
                    <DateInput
                      className="border border-gray-300 rounded-lg px-3 py-1 text-xs"
                      value={comparisonFromDate || ''}
                      onChange={(e) => handleComparisonFromChange(e.target.value)}
                    />
                    <span className="text-xs text-gray-700">Hasta:</span>
                    <DateInput
                      className="border border-gray-300 rounded-lg px-3 py-1 text-xs"
                      value={comparisonToDate || ''}
                      onChange={(e) => handleComparisonToChange(e.target.value)}
                    />
                  </div>
                  {comparisonFromDate && (
                    <button
                      type="button"
                      onClick={() => {
                        setComparisonFromDate(null);
                        setComparisonToDate(null);
                        setComparisonIncome(null);
                      }}
                      className="text-xs text-gray-600 hover:text-gray-800 underline"
                    >
                      Quitar comparativo
                    </button>
                  )}
                </div>
              )}

              {/* Contenido para impresión */}
              <div id="printable-statement">
              {/* Título centrado estilo profesional */}
              <div className="text-center mb-8">
                {!!companyNameForHeader && (
                  <div className="mb-2 print-only">
                    <div className="text-sm font-semibold text-gray-900">{companyNameForHeader}</div>
                    {companyRncForHeader && (
                      <div className="text-xs text-gray-700">RNC/RUC: {companyRncForHeader}</div>
                    )}
                    {companyAddressForHeader && (
                      <div className="text-xs text-gray-700">{companyAddressForHeader}</div>
                    )}
                    {(companyPhoneForHeader || companyEmailForHeader) && (
                      <div className="text-xs text-gray-600">
                        {[companyPhoneForHeader ? `Tel: ${companyPhoneForHeader}` : '', companyEmailForHeader ? `Email: ${companyEmailForHeader}` : '']
                          .filter(Boolean)
                          .join('  ·  ')}
                      </div>
                    )}
                  </div>
                )}
                <h1 className="text-xl font-bold text-gray-900 mb-1">ESTADO DE RESULTADOS</h1>
                <p className="text-sm text-gray-700 mb-0.5">{incomePeriodDates.periodLabel}</p>
                {comparisonPeriodLabel && (
                  <p className="text-xs text-gray-700 mb-0.5">
                    Período comparativo: {comparisonPeriodLabel}
                  </p>
                )}
                <p className="text-xs text-gray-600">VALORES EN </p>
              </div>

              <div className="max-w-3xl mx-auto space-y-6">
                {/* INGRESOS / VENTAS */}
                <div className={`${Math.abs(totals.totalRevenue) < 0.01 ? 'hide-zero-on-print' : ''}`}>
                  <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b-2 border-gray-300">
                    INGRESOS
                  </h2>
                  {financialData.revenue.map((item, index) => (
                    <div
                      key={index}
                      className={`flex justify-between py-0.5 pl-4 ${
                        Math.abs(item.amount) < 0.01 ? 'hide-zero-on-print' : ''
                      }`}
                    >
                      <span className="text-sm text-gray-700">{item.name}</span>
                      <span
                        className={`text-sm font-medium tabular-nums ${
                          item.amount < 0 ? 'text-red-600' : 'text-gray-900'
                        }`}
                      >
                        {formatCurrency(item.amount)}
                      </span>
                    </div>
                  ))}
                  <div className="border-t border-gray-300 mt-2 pt-1 pl-4">
                    <div className="flex justify-between font-semibold">
                      <span className="text-sm">Total Ventas</span>
                      <div className="flex items-center gap-6">
                        <span
                          className={`text-sm tabular-nums ${
                            totals.totalRevenue < 0 ? 'text-red-600' : 'text-gray-900'
                          }`}
                        >
                          {formatCurrencyRD(totals.totalRevenue)}
                        </span>
                        {comparisonIncome && (
                          <span className="text-sm tabular-nums text-gray-500">
                            {formatCurrencyRD(comparisonIncome.totalRevenue)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* COSTO DE VENTAS Y BENEFICIO BRUTO */}
                <div className={`${Math.abs(totals.totalCosts) < 0.01 ? 'hide-zero-on-print' : ''}`}>
                  <h2 className="text-sm font-bold text-gray-900 mb-2 underline">COSTO DE VENTAS</h2>
                  {costItemsForIncome.map((item, index) => (
                    <div
                      key={index}
                      className={`flex justify-between py-0.5 pl-4 ${
                        Math.abs(item.amount) < 0.01 ? 'hide-zero-on-print' : ''
                      }`}
                    >
                      <span className="text-sm text-gray-700">{item.name}</span>
                      <span
                        className={`text-sm font-medium tabular-nums ${
                          item.amount < 0 ? 'text-red-600' : 'text-gray-900'
                        }`}
                      >
                        {formatCurrency(item.amount)}
                      </span>
                    </div>
                  ))}
                  <div className="border-t border-gray-300 mt-2 pt-1 pl-4">
                    <div className="flex justify-between font-semibold">
                      <span className="text-sm">Costo de Ventas</span>
                      <div className="flex items-center gap-6">
                        <span
                          className={`text-sm tabular-nums ${
                            totals.totalCosts < 0 ? 'text-red-600' : 'text-gray-900'
                          }`}
                        >
                          {formatCurrencyRD(totals.totalCosts)}
                        </span>
                        {comparisonIncome && (
                          <span className="text-sm tabular-nums text-gray-500">
                            {formatCurrencyRD(comparisonIncome.totalCosts)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Beneficio Bruto */}
                  <div className="border-t-2 border-gray-800 pt-2 mt-3">
                    <div className="flex justify-between font-bold">
                      <span className="text-base">Beneficio Bruto</span>
                      <div className="flex items-center gap-6">
                        <span
                          className={`text-base tabular-nums ${
                            grossProfit < 0 ? 'text-red-600' : 'text-gray-900'
                          }`}
                        >
                          {formatCurrencyRD(grossProfit)}
                        </span>
                        {comparisonIncome && (
                          <span className="text-base tabular-nums text-gray-500">
                            {formatCurrencyRD(comparisonIncome.grossProfit)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* GASTOS DE OPERACIONES */}
                <div className={`pt-4 ${Math.abs(operatingExpenses) < 0.01 ? 'hide-zero-on-print' : ''}`}>
                  <h2 className="text-sm font-bold text-gray-900 mb-2 underline">GASTOS DE OPERACIONES</h2>
                  <div className="space-y-0.5 pl-4">
                    {renderBalanceLineIfNotZero('Gastos de Personal', gastosPersonal)}
                    {renderBalanceLineIfNotZero('Gastos Generales y Administrativos', gastosGeneralesAdm)}
                    {renderBalanceLineIfNotZero('Gastos de Mantenimiento de Activos Fijos', gastosMantenimientoAF)}
                    {renderBalanceLineIfNotZero('Gastos de Depreciación', gastosDepreciacion)}
                    {renderBalanceLineIfNotZero('Gastos de Impuestos No Deducibles', gastosImpuestosNoDeducibles)}
                  </div>
                  <div className="border-t border-gray-300 mt-2 pt-1 pl-4">
                    <div className="flex justify-between font-semibold">
                      <span className="text-sm">Total Gastos de Operaciones</span>
                      <div className="flex items-center gap-6">
                        <span
                          className={`text-sm tabular-nums ${
                            operatingExpenses < 0 ? 'text-red-600' : 'text-gray-900'
                          }`}
                        >
                          {formatCurrencyRD(operatingExpenses)}
                        </span>
                        {comparisonIncome && (
                          <span className="text-sm tabular-nums text-gray-500">
                            {formatCurrencyRD(comparisonIncome.operatingExpenses)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Beneficios netos operacionales */}
                  <div className="border-t border-gray-400 pt-2 mb-4">
                    <div className="flex justify-between font-bold">
                      <span className="text-sm">Beneficios netos operacionales</span>
                      <div className="flex items-center gap-6">
                        <span
                          className={`text-sm tabular-nums ${
                            operatingIncome < 0 ? 'text-red-600' : 'text-gray-900'
                          }`}
                        >
                          {formatCurrencyRD(operatingIncome)}
                        </span>
                        {comparisonIncome && (
                          <span className="text-sm tabular-nums text-gray-500">
                            {formatCurrencyRD(comparisonIncome.operatingIncome)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* GASTOS FINANCIEROS Y RESULTADO ANTES DE ISR Y RESERVAS */}
                <div className={`${Math.abs(financialExpenses) < 0.01 ? 'hide-zero-on-print' : ''}`}>
                  <div className="mb-2">
                    {renderBalanceLineIfNotZero('Gastos financieros', financialExpenses)}
                  </div>

                  <div className="border-t border-gray-300 pt-2 mt-2">
                    <div className="flex justify-between font-bold">
                      <span className="text-sm">Beneficios (pérdida) antes de ISR y Reservas</span>
                      <div className="flex items-center gap-6">
                        <span
                          className={`text-sm tabular-nums ${
                            incomeBeforeTaxReserves < 0 ? 'text-red-600' : 'text-gray-900'
                          }`}
                        >
                          {formatCurrencyRD(incomeBeforeTaxReserves)}
                        </span>
                        {comparisonIncome && (
                          <span className="text-sm tabular-nums text-gray-500">
                            {formatCurrencyRD(comparisonIncome.incomeBeforeTaxReserves)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* IMPUESTOS, RESERVA Y UTILIDAD NETA */}
                <div className="space-y-2 pt-4">
                  <div className="flex justify-between py-0.5 pl-4">
                    <span className="text-sm text-gray-700">Impuestos Sobre la Renta</span>
                    <span
                      className={`text-sm font-medium tabular-nums ${
                        incomeTax < 0 ? 'text-red-600' : 'text-gray-900'
                      }`}
                    >
                      {formatCurrency(incomeTax)}
                    </span>
                  </div>
                  <div className="flex justify-between py-0.5 pl-4">
                    <span className="text-sm text-gray-700">Reserva Legal</span>
                    <span
                      className={`text-sm font-medium tabular-nums ${
                        legalReserve < 0 ? 'text-red-600' : 'text-gray-900'
                      }`}
                    >
                      {formatCurrency(legalReserve)}
                    </span>
                  </div>

                  <div className="border-t-2 border-gray-800 pt-3 mt-3">
                    <div className="flex justify-between font-bold">
                      <span className="text-base">UTILIDAD NETA</span>
                      <div className="flex items-center gap-6">
                        <span
                          className={`text-base tabular-nums ${
                            totals.netIncome < 0 ? 'text-red-600' : 'text-green-600'
                          }`}
                        >
                          {formatCurrencyRD(totals.netIncome)}
                        </span>
                        {comparisonIncome && (
                          <span className="text-base tabular-nums text-gray-500">
                            {formatCurrencyRD(comparisonIncome.netIncome)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              </div> {/* Cierre de printable-statement */}
            </div>
          </div>
        )}

        {activeTab === 'cashflow' && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-6">
              {/* Header con selector de fechas y botón de descarga */}
              <div className="flex items-center justify-between gap-2 mb-4 print-hidden">
                <div>
                  <div className="text-xs text-gray-500 mb-1">Mes / Día / Año</div>
                  <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-700">Desde:</label>
                  <DateInput
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={incomeFromDate}
                    onChange={(e) => {
                      setUseCustomRange(true);
                      setIncomeFromDate(e.target.value);
                    }}
                  />
                  <span className="text-sm text-gray-700">Hasta:</span>
                  <DateInput
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={incomeToDate || ''}
                    onChange={(e) => {
                      setUseCustomRange(true);
                      setIncomeToDate(e.target.value || null);
                    }}
                  />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowComparisonControls((prev) => !prev)}
                    className="bg-gray-100 text-gray-800 px-3 py-2 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap text-sm border border-gray-300"
                  >
                    <i className="ri-contrast-drop-line mr-2"></i>
                    Comparativo
                  </button>
                  <button
                    onClick={downloadCashFlowExcel}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap text-sm"
                  >
                    <i className="ri-download-line mr-2"></i>
                    Excel
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap text-sm"
                  >
                    <i className="ri-file-pdf-line mr-2"></i>
                    PDF
                  </button>
                </div>
              </div>

              {Math.abs((cashFlow.netCashFlow || 0) - ((cashFlow.closingCash || 0) - (cashFlow.openingCash || 0))) >= 0.01 && (
                <div className="mb-4 bg-yellow-50 border border-yellow-200 text-yellow-900 px-4 py-3 rounded-lg print-hidden">
                  <div className="font-semibold">Advertencia: Flujo de Efectivo no concilia con Caja/Bancos</div>
                  <div className="text-sm mt-1">
                    Neto (operación + inversión + financiamiento): {formatCurrencyRD(cashFlow.netCashFlow || 0)}
                  </div>
                  <div className="text-sm">
                    Variación (Cierre - Apertura): {formatCurrencyRD((cashFlow.closingCash || 0) - (cashFlow.openingCash || 0))}
                  </div>
                </div>
              )}

              {showComparisonControls && (
                <div className="flex items-center justify-end gap-2 mb-2 print-hidden">
                  <div>
                    <div className="text-[11px] text-gray-500 mb-1">Mes / Día / Año</div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-700">Comparativo desde:</label>
                      <DateInput
                        className="border border-gray-300 rounded-lg px-3 py-1 text-xs"
                        value={comparisonFromDate || ''}
                        onChange={(e) => handleComparisonFromChange(e.target.value)}
                      />
                      <span className="text-xs text-gray-700">Hasta:</span>
                      <DateInput
                        className="border border-gray-300 rounded-lg px-3 py-1 text-xs"
                        value={comparisonToDate || ''}
                        onChange={(e) => handleComparisonToChange(e.target.value)}
                      />
                    </div>
                  </div>
                  {comparisonFromDate && (
                    <button
                      type="button"
                      onClick={() => {
                        setComparisonFromDate(null);
                        setComparisonToDate(null);
                        setComparisonIncome(null);
                        setComparisonTotals(null);
                        setComparisonCashFlow(null);
                      }}
                      className="text-xs text-gray-600 hover:text-gray-800 underline"
                    >
                      Quitar comparativo
                    </button>
                  )}
                </div>
              )}

              {/* Contenido para impresión */}
              <div id="printable-statement">
              {/* Título centrado estilo profesional */}
              <div className="text-center mb-8">
                {!!companyNameForHeader && (
                  <div className="mb-2 print-only">
                    <div className="text-sm font-semibold text-gray-900">{companyNameForHeader}</div>
                    {companyRncForHeader && (
                      <div className="text-xs text-gray-700">RNC/RUC: {companyRncForHeader}</div>
                    )}
                    {companyAddressForHeader && (
                      <div className="text-xs text-gray-700">{companyAddressForHeader}</div>
                    )}
                    {(companyPhoneForHeader || companyEmailForHeader) && (
                      <div className="text-xs text-gray-600">
                        {[companyPhoneForHeader ? `Tel: ${companyPhoneForHeader}` : '', companyEmailForHeader ? `Email: ${companyEmailForHeader}` : '']
                          .filter(Boolean)
                          .join('  ·  ')}
                      </div>
                    )}
                  </div>
                )}
                <h1 className="text-xl font-bold text-gray-900 mb-1">ESTADO DE FLUJOS DE EFECTIVO</h1>
                <p className="text-sm text-gray-700 mb-0.5">{incomePeriodDates.periodLabel}</p>
                {comparisonPeriodLabel && (
                  <p className="text-xs text-gray-700 mb-0.5">
                    Período comparativo: {comparisonPeriodLabel}
                  </p>
                )}
                <p className="text-xs text-gray-600">VALORES EN </p>
              </div>

              {(() => {
                const openingCash = cashFlow.openingCash || 0;
                const endingCash = cashFlow.closingCash || 0;
                const netChange = endingCash - openingCash;

                return (
                  <div className="max-w-4xl mx-auto space-y-6">
                    {/* FLUJOS DE EFECTIVO DE LAS ACTIVIDADES OPERATIVAS */}
                    <div>
                      <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b-2 border-gray-300">
                        FLUJOS DE EFECTIVO DE LAS ACTIVIDADES OPERATIVAS
                      </h2>

                      {/* Beneficio neto */}
                      <div className="flex justify-between py-0.5 pl-4">
                        <span className="text-sm text-gray-700">Beneficio (Pérdida) Neto</span>
                        <span className="text-sm text-gray-900 font-medium tabular-nums">
                          {formatCurrency(totals.netIncome)}
                        </span>
                      </div>

                      {/* Ajustes para conciliar - placeholders */}
                      <div className="mt-4 pl-4">
                        <h3 className="text-sm font-semibold text-gray-800 mb-2">
                          Ajustes para conciliar la (pérdida) beneficio neto con el efectivo neto
                          provisto por actividades operativas:
                        </h3>
                        <div className="space-y-1">
                          <div className="flex justify-between py-0.5 hide-zero-on-print">
                            <span className="text-sm text-gray-700">Depreciación y Amortización</span>
                            <span className="text-sm text-gray-900 tabular-nums">{formatCurrency(0)}</span>
                          </div>
                          <div className="flex justify-between py-0.5 hide-zero-on-print">
                            <span className="text-sm text-gray-700">Incremento/Disminución en cuentas por cobrar</span>
                            <span className="text-sm text-gray-900 tabular-nums">{formatCurrency(0)}</span>
                          </div>
                          <div className="flex justify-between py-0.5 hide-zero-on-print">
                            <span className="text-sm text-gray-700">Incremento/Disminución en inventario</span>
                            <span className="text-sm text-gray-900 tabular-nums">{formatCurrency(0)}</span>
                          </div>
                          <div className="flex justify-between py-0.5 hide-zero-on-print">
                            <span className="text-sm text-gray-700">Disminución/Incremento en otras cuentas</span>
                            <span className="text-sm text-gray-900 tabular-nums">{formatCurrency(0)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Total ajustes - placeholder 0 */}
                      <div className="border-t border-gray-300 mt-2 pt-1 pl-4 hide-zero-on-print">
                        <div className="flex justify-between font-semibold">
                          <span className="text-sm">Total ajustes</span>
                          <span className="text-sm tabular-nums">{formatCurrencyRD(0)}</span>
                          {comparisonTotals && (
                            <span className="text-sm tabular-nums text-gray-500">
                              {formatCurrencyRD(0)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Efectivo neto provisto por actividades operativas */}
                      <div className="border-t-2 border-gray-800 pt-2 mt-3">
                        <div className="flex justify-between font-bold">
                          <span className="text-base">Efectivo neto (usado) provisto por actividades operativas</span>
                          <div className="flex items-center gap-6">
                            <span className="text-base tabular-nums">
                              {formatCurrency(cashFlow.operatingCashFlow)}
                            </span>
                            {comparisonCashFlow && (
                              <span className="text-base tabular-nums text-gray-500">
                                {formatCurrency(comparisonCashFlow.operatingCashFlow)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* FLUJO DE EFECTIVO DE LAS ACTIVIDADES DE INVERSIÓN */}
                    <div className="pt-4">
                      <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b-2 border-gray-300">
                        FLUJO DE EFECTIVO DE LAS ACTIVIDADES DE INVERSIÓN
                      </h2>

                      {/* Detalles de inversión (placeholders) */}
                      <div className="pl-4 space-y-1">
                        <div className="flex justify-between py-0.5 hide-zero-on-print">
                          <span className="text-sm text-gray-700">Adquisición de Terrenos</span>
                          <span className="text-sm text-gray-900 tabular-nums">{formatCurrency(0)}</span>
                        </div>
                        <div className="flex justify-between py-0.5 hide-zero-on-print">
                          <span className="text-sm text-gray-700">Adquisición de Planta y Edificaciones</span>
                          <span className="text-sm text-gray-900 tabular-nums">{formatCurrency(0)}</span>
                        </div>
                        <div className="flex justify-between py-0.5 hide-zero-on-print">
                          <span className="text-sm text-gray-700">Adquisición de Maquinarias y Equipos</span>
                          <span className="text-sm text-gray-900 tabular-nums">{formatCurrency(0)}</span>
                        </div>
                      </div>

                      <div className={`border-t border-gray-300 mt-2 pt-1 pl-4 ${Math.abs(cashFlow.investingCashFlow || 0) < 0.01 ? 'hide-zero-on-print' : ''}`}>
                        <div className="flex justify-between font-semibold">
                          <span className="text-sm">Efectivo neto (usado) por actividades de Inversión</span>
                          <div className="flex items-center gap-6">
                            <span className="text-sm tabular-nums">{formatCurrency(cashFlow.investingCashFlow)}</span>
                            {comparisonCashFlow && (
                              <span className="text-sm tabular-nums text-gray-500">
                                {formatCurrency(comparisonCashFlow.investingCashFlow)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* FLUJOS DE EFECTIVO DE LAS ACTIVIDADES FINANCIERAS */}
                    <div className="pt-4">
                      <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b-2 border-gray-300">
                        FLUJOS DE EFECTIVO DE LAS ACTIVIDADES FINANCIERAS
                      </h2>

                      {/* Detalles financieros (placeholders) */}
                      <div className="pl-4 space-y-1">
                        <div className="flex justify-between py-0.5 hide-zero-on-print">
                          <span className="text-sm text-gray-700">Disminución/Incremento en Doc. por Pagar</span>
                          <span className="text-sm text-gray-900 tabular-nums">{formatCurrency(0)}</span>
                        </div>
                        <div className="flex justify-between py-0.5 hide-zero-on-print">
                          <span className="text-sm text-gray-700">Incremento en otras cuentas de Capital</span>
                          <span className="text-sm text-gray-900 tabular-nums">{formatCurrency(0)}</span>
                        </div>
                      </div>

                      <div className={`border-t border-gray-300 mt-2 pt-1 pl-4 ${Math.abs(cashFlow.financingCashFlow || 0) < 0.01 ? 'hide-zero-on-print' : ''}`}>
                        <div className="flex justify-between font-semibold">
                          <span className="text-sm">Efectivo neto usado por actividades de Financiamiento</span>
                          <div className="flex items-center gap-6">
                            <span className="text-sm tabular-nums">{formatCurrency(cashFlow.financingCashFlow)}</span>
                            {comparisonCashFlow && (
                              <span className="text-sm tabular-nums text-gray-500">
                                {formatCurrency(comparisonCashFlow.financingCashFlow)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* AUMENTO (DISMINUCIÓN) NETA DEL EFECTIVO Y EFECTIVO FINAL */}
                    <div className="pt-4">
                      <div className="border-t border-gray-400 pt-2 mb-4">
                        <div className="flex justify-between font-bold">
                          <span className="text-sm">Aumento (Disminución) neta del efectivo</span>
                          <div className="flex items-center gap-6">
                            <span className="text-sm tabular-nums">{formatCurrency(netChange)}</span>
                            {comparisonCashFlow && (
                              <span className="text-sm tabular-nums text-gray-500">
                                {formatCurrency(comparisonCashFlow.netCashFlow)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1 pl-4">
                        <div className="flex justify-between py-0.5">
                          <span className="text-sm text-gray-700">Efectivo neto al principio del año</span>
                          <div className="flex items-center gap-6">
                            <span className="text-sm text-gray-900 tabular-nums">{formatCurrency(openingCash)}</span>
                            {comparisonCashFlow && (
                              <span className="text-sm text-gray-500 tabular-nums">
                                {formatCurrency(comparisonCashFlow.openingCash)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex justify-between py-0.5">
                          <span className="text-sm text-gray-700 font-semibold">EFECTIVO NETO al final del año</span>
                          <div className="flex items-center gap-6">
                            <span className="text-sm text-gray-900 font-semibold tabular-nums">{formatCurrency(endingCash)}</span>
                            {comparisonCashFlow && (
                              <span className="text-sm text-gray-500 font-semibold tabular-nums">
                                {formatCurrency(comparisonCashFlow.closingCash)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
              </div> {/* Cierre de printable-statement */}
            </div>
          </div>
        )}

        {/* Pestaña de Anexos a los Estados Financieros */}
        {activeTab === 'anexos' && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-6 print-hidden">
              <h2 className="text-lg font-semibold">Anexos a los Estados Financieros</h2>
              <div className="flex items-center gap-4">
                <select
                  value={selectedPeriod}
                  onChange={(e) => setSelectedPeriod(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm pr-8"
                >
                  {periodOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => window.print()}
                  className="text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm"
                  style={{ backgroundColor: theme.primary }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = theme.primaryHover; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = theme.primary; }}
                >
                  <i className="ri-printer-line"></i>
                  Imprimir
                </button>
              </div>
            </div>

            <div id="printable-statement">
              {/* Título centrado estilo profesional */}
              <div className="text-center mb-8">
                <h1 className="text-xl font-bold text-gray-900">ANEXOS A LOS ESTADOS FINANCIEROS</h1>
                <p className="text-sm text-gray-600">{periodDates.asOfDateLabel}</p>
                <p className="text-xs text-gray-500 mt-1">Valores en </p>
              </div>

              {/* Listado de cuentas agrupadas por tipo */}
              <div className="space-y-8">
                {Object.keys(anexosData.groupedByType).length === 0 ? (
                  <div className="text-center text-gray-500 py-8">
                    No hay cuentas con saldo para el período seleccionado.
                  </div>
                ) : (
                  ['ACTIVOS', 'PASIVOS', 'PATRIMONIO', 'INGRESOS', 'COSTOS', 'GASTOS', 'OTROS']
                    .filter((typeKey) => anexosData.groupedByType[typeKey])
                    .map((typeKey) => {
                      const group = anexosData.groupedByType[typeKey];
                      return (
                        <div key={typeKey} className="mb-6">
                          <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b-2 border-gray-300">
                            {typeKey}
                          </h2>
                          <div className="overflow-x-auto">
                            <table className="min-w-full">
                              <thead>
                                <tr className="border-b border-gray-200">
                                  <th className="text-left py-2 px-2 text-xs font-semibold text-gray-600 w-24">
                                    Código
                                  </th>
                                  <th className="text-left py-2 px-2 text-xs font-semibold text-gray-600">
                                    Cuenta
                                  </th>
                                  <th className="text-right py-2 px-2 text-xs font-semibold text-gray-600 w-32">
                                    Saldo
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {group.accounts.map((acc, idx) => (
                                  <tr key={`${acc.code}-${idx}`} className="border-b border-gray-100 hover:bg-gray-50">
                                    <td className="py-1.5 px-2 text-sm text-gray-700 font-mono">
                                      {acc.code}
                                    </td>
                                    <td className="py-1.5 px-2 text-sm text-gray-800">
                                      {acc.name}
                                    </td>
                                    <td className="py-1.5 px-2 text-sm text-right tabular-nums">
                                      <span className={acc.balance < 0 ? 'text-red-600' : 'text-gray-900'}>
                                        {formatCurrency(acc.balance)}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="border-t-2 border-gray-300 bg-gray-50">
                                  <td colSpan={2} className="py-2 px-2 text-sm font-bold text-gray-900">
                                    Subtotal {typeKey}
                                  </td>
                                  <td className="py-2 px-2 text-sm text-right font-bold tabular-nums">
                                    <span className={group.subtotal < 0 ? 'text-red-600' : 'text-gray-900'}>
                                      {formatCurrency(group.subtotal)}
                                    </span>
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      );
                    })
                )}
              </div>

              {/* Total general */}
              {Object.keys(anexosData.groupedByType).length > 0 && (
                <div className="mt-8 pt-4 border-t-2 border-gray-400">
                  <div className="flex justify-between items-center">
                    <span className="text-base font-bold text-gray-900">
                      Total de cuentas con saldo: {anexosData.accounts.length}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modal para generar nuevo estado */}
        {showNewStatementModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold mb-4">Generar Nuevo Estado Financiero</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Tipo de Estado
                  </label>
                  <select
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-8"
                    defaultValue="balance_sheet"
                    id="new-statement-type"
                  >
                    <option value="balance_sheet">Balance General</option>
                    <option value="income_statement">Estado de Resultados</option>
                    <option value="cash_flow">Flujo de Efectivo</option>
                    <option value="equity_statement">Estado de Patrimonio</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Período
                  </label>
                  <input
                    type="month"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    defaultValue={selectedPeriod || new Date().toISOString().slice(0, 7)}
                    id="new-statement-period"
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end space-x-3">
                <button
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                  onClick={() => setShowNewStatementModal(false)}
                >
                  Cancelar
                </button>
                <button
                  className="px-4 py-2 text-white rounded-lg flex items-center space-x-2 shadow-sm"
                  disabled={isGenerating}
                  onClick={() => {
                    const typeSelect = document.getElementById('new-statement-type') as HTMLSelectElement | null;
                    const periodSelect = document.getElementById('new-statement-period') as HTMLSelectElement | null;
                    const typeValue = typeSelect?.value || 'balance_sheet';
                    const periodValue = periodSelect?.value || new Date().toISOString().slice(0, 7);
                    void generateStatement(typeValue, periodValue);
                  }}
                  style={{ backgroundColor: theme.primary }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = theme.primaryHover; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = theme.primary; }}
                >
                  {isGenerating && (
                    <svg className="animate-spin h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                    </svg>
                  )}
                  <span>{isGenerating ? 'Generando...' : 'Generar'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal para ver estado */}
        {showViewModal && selectedStatement && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold">{selectedStatement.name}</h3>
                <button
                  onClick={() => setShowViewModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-sm font-medium text-gray-500">Tipo:</span>
                    <span className="ml-2 text-sm text-gray-900">{getTypeLabel(selectedStatement.type)}</span>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-500">Período:</span>
                    <span className="ml-2 text-sm text-gray-900">{selectedStatement.period}</span>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-500">Estado:</span>
                    <span className={`ml-2 inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(selectedStatement.status)}`}>
                      {selectedStatement.status === 'draft' ? 'Borrador' : 
                       selectedStatement.status === 'final' ? 'Final' : 'Aprobado'}
                    </span>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-500">Fecha Creación:</span>
                    <span className="ml-2 text-sm text-gray-900">
                      {formatDate(selectedStatement.created_at)}
                    </span>
                  </div>
                </div>
                
                {selectedStatement.type === 'balance_sheet' && (
                  <div className="mt-6">
                    <h4 className="font-medium mb-4">Resumen del Balance General</h4>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-center p-4 rounded-lg" style={{ backgroundColor: theme.muted }}>
                        <div className="text-sm text-gray-600">Total Activos</div>
                        <div className="text-lg font-bold" style={{ color: theme.softText }}>
                          {formatCurrency(selectedStatement.totalAssets || 0)}
                        </div>
                      </div>
                      <div className="text-center p-4 bg-red-50 rounded-lg">
                        <div className="text-sm text-gray-600">Total Pasivos</div>
                        <div className="text-lg font-bold text-red-600">
                          {formatCurrency(selectedStatement.totalLiabilities || 0)}
                        </div>
                      </div>
                      <div className="text-center p-4 bg-green-50 rounded-lg">
                        <div className="text-sm text-gray-600">Total Patrimonio</div>
                        <div className="text-lg font-bold text-green-600">
                          {formatCurrency(selectedStatement.totalEquity || 0)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                {selectedStatement.type === 'income_statement' && (
                  <div className="mt-6">
                    <h4 className="font-medium mb-4">Resumen del Estado de Resultados</h4>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-center p-4 bg-green-50 rounded-lg">
                        <div className="text-sm text-gray-600">Total Ingresos</div>
                        <div className="text-lg font-bold text-green-600">
                          {formatCurrency(selectedStatement.totalRevenue || 0)}
                        </div>
                      </div>
                      <div className="text-center p-4 bg-red-50 rounded-lg">
                        <div className="text-sm text-gray-600">Total Gastos</div>
                        <div className="text-lg font-bold text-red-600">
                          {formatCurrency(selectedStatement.totalExpenses || 0)}
                        </div>
                      </div>
                      <div className="text-center p-4 rounded-lg" style={{ backgroundColor: theme.muted }}>
                        <div className="text-sm text-gray-600">Utilidad Neta</div>
                        <div className={`text-lg font-bold ${(selectedStatement.netIncome || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(selectedStatement.netIncome || 0)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Modal para editar estado */}
        {showEditModal && selectedStatement && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold">Editar Estado Financiero</h3>
                <button
                  onClick={() => setShowEditModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nombre del Estado
                  </label>
                  <input
                    type="text"
                    defaultValue={selectedStatement.name}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Tipo de Estado
                  </label>
                  <select 
                    defaultValue={selectedStatement.type}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-8"
                  >
                    <option value="balance_sheet">Balance General</option>
                    <option value="income_statement">Estado de Resultados</option>
                    <option value="cash_flow">Flujo de Efectivo</option>
                    <option value="equity_statement">Estado de Patrimonio</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Período
                  </label>
                  <input
                    type="month"
                    defaultValue={selectedStatement.period}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Estado
                  </label>
                  <select 
                    defaultValue={selectedStatement.status}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-8"
                  >
                    <option value="draft">Borrador</option>
                    <option value="final">Final</option>
                    <option value="approved">Aprobado</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 whitespace-nowrap"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    alert('Estado financiero actualizado exitosamente');
                  }}
                  className="text-white px-4 py-2 rounded-lg whitespace-nowrap shadow-sm"
                  style={{ backgroundColor: theme.primary }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = theme.primaryHover; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = theme.primary; }}
                >
                  Guardar Cambios
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
