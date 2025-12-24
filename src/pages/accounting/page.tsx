import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { chartAccountsService, journalEntriesService } from '../../services/database';
import { useAuth } from '../../hooks/useAuth';
import { exportToExcelWithHeaders, exportToExcelStyled } from '../../utils/exportImportUtils';
import { formatAmount } from '../../utils/numberFormat';

interface JournalEntry {
  id: string;
  entry_number: string;
  entry_date: string;
  description: string;
  reference: string;
  total_debit: number;
  total_credit: number;  
  status: 'draft' | 'posted' | 'reversed';
  created_at: string;
  journal_entry_lines?: any[];
}

interface ChartAccount {
  id: string;
  code: string;
  name: string;
  type: string;
  balance: number;
  is_active?: boolean;
  normal_balance?: string;
  allow_posting?: boolean;
  level?: number;
  isBankAccount?: boolean;
  allowPosting?: boolean;
  normalBalance?: string;
  debit?: number;
  credit?: number;
}

type BreakdownType = 'asset' | 'liability' | 'equity' | 'income';

type RecentLine = {
  id: string;
  account_id: string;
  description: string | null;
  debit_amount: number | null;
  credit_amount: number | null;
  created_at: string;
  journal_entries?: {
    id: string;
    entry_number: string;
    entry_date: string;
    description: string;
    status: string;
    user_id: string;
  };
  chart_accounts?: {
    code: string;
    name: string;
  };
};

export default function AccountingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<ChartAccount[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [breakdownType, setBreakdownType] = useState<BreakdownType | null>(null);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [breakdownLines, setBreakdownLines] = useState<RecentLine[]>([]);
  const [showJournalModal, setShowJournalModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [selectedReport, setSelectedReport] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [trialBalanceMode, setTrialBalanceMode] = useState<'detail' | 'summary'>('detail');
  const [netIncome, setNetIncome] = useState(0);

  const [journalForm, setJournalForm] = useState({
    entry_number: '',
    entry_date: new Date().toISOString().split('T')[0],
    description: '',
    reference: '',
    lines: [
      { account_id: '', description: '', debit: '', credit: '' },
      { account_id: '', description: '', debit: '', credit: '' }
    ]
  });

  useEffect(() => {
    if (user?.id) {
      loadData();
    }
  }, [user?.id]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (!user?.id) {
        setAccounts([]);
        setJournalEntries([]);
        setNetIncome(0);
        return;
      }
      const [accountsData, entriesData] = await Promise.all([
        chartAccountsService.getBalances(user.id),
        journalEntriesService.getAll(user.id)
      ]);
      
      setAccounts(accountsData);
      setJournalEntries(entriesData);

      // Calcular utilidad del período actual (mes en curso) para reflejarla en Patrimonio
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const today = now.toISOString().slice(0, 10);
      const incomeStatement = await chartAccountsService.generateIncomeStatement(user.id, firstDayOfMonth, today);
      setNetIncome(incomeStatement?.netIncome || 0);
    } catch (error) {
      console.error('Error loading data:', error);
      console.error('Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        userId: user?.id,
        errorType: typeof error,
        errorKeys: error ? Object.keys(error) : []
      });
    } finally {
      setLoading(false);
    }
  };

  const generateEntryNumber = () => {
    const timestamp = Date.now().toString().slice(-6);
    return `JE-${timestamp}`;
  };

  const handleAddJournalLine = () => {
    setJournalForm(prev => ({
      ...prev,
      lines: [...prev.lines, { account_id: '', description: '', debit: '', credit: '' }]
    }));
  };

  const handleRemoveJournalLine = (index: number) => {
    if (journalForm.lines.length > 2) {
      setJournalForm(prev => ({
        ...prev,
        lines: prev.lines.filter((_, i) => i !== index)
      }));
    }
  };

  const handleJournalLineChange = (index: number, field: string, value: string) => {
    setJournalForm(prev => ({
      ...prev,
      lines: prev.lines.map((line, i) => 
        i === index ? { ...line, [field]: value } : line
      )
    }));
  };

  const calculateTotals = () => {
    const totalDebit = journalForm.lines.reduce((sum, line) => sum + (parseFloat(line.debit) || 0), 0);
    const totalCredit = journalForm.lines.reduce((sum, line) => sum + (parseFloat(line.credit) || 0), 0);
    return { totalDebit, totalCredit };
  };

  const handleSubmitJournal = async (e: React.FormEvent) => {
    e.preventDefault();

    const { totalDebit, totalCredit } = calculateTotals();
    
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      alert('Los débitos y créditos deben estar balanceados.');
      return;
    }

    try {
      if (!user?.id) {
        alert('Debes iniciar sesión para crear asientos.');
        return;
      }
      const entry = {
        entry_number: journalForm.entry_number || generateEntryNumber(),
        entry_date: journalForm.entry_date,
        description: journalForm.description,
        reference: journalForm.reference,
        status: 'posted' as const
      };

      const lines = journalForm.lines
        .filter(line => line.account_id && (line.debit || line.credit))
        .map(line => ({
          account_id: line.account_id,
          description: line.description,
          debit_amount: parseFloat(line.debit) || 0,
          credit_amount: parseFloat(line.credit) || 0
        }));

      await journalEntriesService.createWithLines(user.id, entry, lines);
      await loadData();
      
      setJournalForm({
        entry_number: '',
        entry_date: new Date().toISOString().split('T')[0],
        description: '',
        reference: '',
        lines: [
          { account_id: '', description: '', debit: '', credit: '' },
          { account_id: '', description: '', debit: '', credit: '' }
        ]
      });
      setShowJournalModal(false);
      alert('Asiento contable creado exitosamente.');
    } catch (error) {
      console.error('Error creating journal entry:', error);
      alert('Error al crear el asiento contable. Intente nuevamente.');
    }
  };

  const handleGenerateReport = async (reportType: string) => {
    setReportLoading(true);
    try {
      if (!user?.id) {
        alert('Debes iniciar sesión para generar reportes.');
        return;
      }
      const today = new Date().toISOString().split('T')[0];
      const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
      
      let filename = '';

      switch (reportType) {
        case 'balance-sheet':
          {
            const data = await chartAccountsService.generateBalanceSheet(user.id, today);
            filename = `balance_general_${today}.xlsx`;
            const headers = [
              { key: 'section', title: 'Sección' },
              { key: 'code', title: 'Código' },
              { key: 'name', title: 'Nombre' },
              { key: 'balance', title: 'Saldo' },
            ];
            const rows: any[] = [];
            const pushGroup = (section: string, items: any[], total: number) => {
              items.forEach(acc => rows.push({ section, code: acc.code, name: acc.name, balance: Math.abs(acc.balance || 0) }));
              rows.push({ section: `TOTAL ${section.toUpperCase()}`, code: '', name: '', balance: total });
              rows.push({ section: '', code: '', name: '', balance: '' });
            };
            pushGroup('Activos', data.assets || [], data.totalAssets || 0);
            pushGroup('Pasivos', data.liabilities || [], data.totalLiabilities || 0);
            pushGroup('Patrimonio', data.equity || [], data.totalEquity || 0);
            rows.push({ section: 'TOTAL PASIVOS + PATRIMONIO', code: '', name: '', balance: (data.totalLiabilities || 0) + (data.totalEquity || 0) });
            await exportToExcelStyled(
              rows,
              [
                { key: 'section', title: 'Sección', width: 18 },
                { key: 'code', title: 'Código', width: 12 },
                { key: 'name', title: 'Nombre', width: 40 },
                { key: 'balance', title: 'Saldo', width: 18, numFmt: '#,##0.00' },
              ],
              filename.replace('.xlsx',''),
              'Balance General'
            );
          }
          break;

        case 'income-statement':
          {
            const data = await chartAccountsService.generateIncomeStatement(user.id, firstDayOfMonth, today);
            filename = `estado_resultados_${today}.xlsx`;
            const headers = [
              { key: 'section', title: 'Sección' },
              { key: 'code', title: 'Código' },
              { key: 'name', title: 'Nombre' },
              { key: 'amount', title: 'Monto' },
            ];
            const rows: any[] = [];
            (data.income || []).forEach(acc => rows.push({ section: 'Ingresos', code: acc.code, name: acc.name, amount: Math.abs(acc.balance || 0) }));
            rows.push({ section: 'TOTAL INGRESOS', code: '', name: '', amount: data.totalIncome || 0 });
            rows.push({ section: '', code: '', name: '', amount: '' });
            (data.expenses || []).forEach(acc => rows.push({ section: 'Gastos', code: acc.code, name: acc.name, amount: Math.abs(acc.balance || 0) }));
            rows.push({ section: 'TOTAL GASTOS', code: '', name: '', amount: data.totalExpenses || 0 });
            rows.push({ section: '', code: '', name: '', amount: '' });
            rows.push({ section: 'UTILIDAD NETA', code: '', name: '', amount: data.netIncome || 0 });
            await exportToExcelStyled(
              rows,
              [
                { key: 'section', title: 'Sección', width: 18 },
                { key: 'code', title: 'Código', width: 12 },
                { key: 'name', title: 'Nombre', width: 40 },
                { key: 'amount', title: 'Monto', width: 18, numFmt: '#,##0.00' },
              ],
              filename.replace('.xlsx',''),
              'Estado de Resultados'
            );
          }
          break;

        case 'trial-balance':
          {
            const data = await chartAccountsService.generateTrialBalance(user.id, today);
            filename = `balanza_comprobacion_${today}.xlsx`;
            const rows: any[] = [];
            const allAccounts = (data.accounts || []) as any[];

            const accountsToExport = trialBalanceMode === 'summary'
              ? allAccounts.filter((acc: any) =>
                  acc.allow_posting === false || (typeof acc.level === 'number' && acc.level <= 2)
                )
              : allAccounts;

            accountsToExport.forEach((acc: any) => {
              const level = typeof acc.level === 'number' ? acc.level : '';
              const code = acc.code || '';
              const name = acc.name || '';

              const totalDebit = acc.total_debit ?? acc.debit ?? acc.debitBalance ?? 0;
              const totalCredit = acc.total_credit ?? acc.credit ?? acc.creditBalance ?? 0;

              // Por ahora consideramos todo como "movimientos" del período
              const prevDebit = 0;
              const prevCredit = 0;
              const movDebit = totalDebit;
              const movCredit = totalCredit;

              // Saldo final según balance normal
              const normal = acc.normal_balance || 'debit';
              const balance = acc.balance ?? (normal === 'credit' ? (totalCredit - totalDebit) : (totalDebit - totalCredit));
              const finalDebit = balance > 0 && normal === 'debit' ? balance : 0;
              const finalCredit = balance > 0 && normal === 'credit' ? balance : 0;

              rows.push({
                level,
                number: code,
                name,
                prev_debit: prevDebit,
                prev_credit: prevCredit,
                mov_debit: movDebit,
                mov_credit: movCredit,
                final_debit: finalDebit,
                final_credit: finalCredit,
              });
            });

            rows.push({
              level: '',
              number: '',
              name: 'TOTALES',
              prev_debit: 0,
              prev_credit: 0,
              mov_debit: data.totalDebits || 0,
              mov_credit: data.totalCredits || 0,
              final_debit: 0,
              final_credit: 0,
            });
            rows.push({
              level: '',
              number: '',
              name: 'BALANCEADO',
              prev_debit: '',
              prev_credit: '',
              mov_debit: data.isBalanced ? 'SÍ' : 'NO',
              mov_credit: '',
              final_debit: '',
              final_credit: '',
            });
            await exportToExcelStyled(
              rows,
              [
                { key: 'level', title: 'Nivel', width: 6 },
                { key: 'number', title: 'Número de cuenta', width: 16 },
                { key: 'name', title: 'Cuenta contable', width: 40 },
                { key: 'prev_debit', title: 'Saldo anterior Débito', width: 18, numFmt: '#,##0.00' },
                { key: 'prev_credit', title: 'Saldo anterior Crédito', width: 18, numFmt: '#,##0.00' },
                { key: 'mov_debit', title: 'Movimientos Débito', width: 18, numFmt: '#,##0.00' },
                { key: 'mov_credit', title: 'Movimientos Crédito', width: 18, numFmt: '#,##0.00' },
                { key: 'final_debit', title: 'Saldo final Débito', width: 18, numFmt: '#,##0.00' },
                { key: 'final_credit', title: 'Saldo final Crédito', width: 18, numFmt: '#,##0.00' },
              ],
              filename.replace('.xlsx',''),
              'Balanza de Comprobación'
            );
          }
          break;

        case 'cash-flow':
          {
            const data = await chartAccountsService.generateCashFlowStatement(user.id, firstDayOfMonth, today);
            filename = `flujo_efectivo_${today}.xlsx`;
            const headers = [
              { key: 'concept', title: 'Concepto' },
              { key: 'amount', title: 'Monto' },
            ];
            const rows = [
              { concept: 'Flujo de Efectivo Operativo', amount: data.operatingCashFlow || 0 },
              { concept: 'Flujo de Efectivo de Inversión', amount: data.investingCashFlow || 0 },
              { concept: 'Flujo de Efectivo de Financiamiento', amount: data.financingCashFlow || 0 },
              { concept: 'Flujo Neto de Efectivo', amount: data.netCashFlow || 0 },
            ];
            await exportToExcelStyled(
              rows,
              [
                { key: 'concept', title: 'Concepto', width: 50 },
                { key: 'amount', title: 'Monto', width: 18, numFmt: '#,##0.00' },
              ],
              filename.replace('.xlsx',''),
              'Flujo de Efectivo'
            );
          }
          break;

        case 'general-ledger':
          {
            const entries = await journalEntriesService.getAll(user.id);
            filename = `mayor_general_${today}.xlsx`;
            const headers = [
              { key: 'date', title: 'Fecha' },
              { key: 'number', title: 'Número' },
              { key: 'description', title: 'Descripción' },
              { key: 'account', title: 'Cuenta' },
              { key: 'debit', title: 'Débito' },
              { key: 'credit', title: 'Crédito' },
            ];
            const rows: any[] = [];
            entries.forEach((entry: any) => {
              entry.journal_entry_lines?.forEach((line: any) => {
                rows.push({
                  date: new Date(entry.entry_date).toLocaleDateString('es-DO'),
                  number: entry.entry_number,
                  description: entry.description,
                  account: `${line.chart_accounts?.code || ''} - ${line.chart_accounts?.name || ''}`,
                  debit: line.debit_amount || 0,
                  credit: line.credit_amount || 0,
                });
              });
            });
            exportToExcelWithHeaders(rows, headers, filename.replace('.xlsx',''), 'Mayor General', [12,14,40,28,16,16]);
          }
          break;

        case 'journal-report':
          {
            const journalData = await journalEntriesService.getAll(user.id);
            filename = `libro_diario_${today}.xlsx`;
            const headers = [
              { key: 'date', title: 'Fecha' },
              { key: 'number', title: 'Número' },
              { key: 'description', title: 'Descripción' },
              { key: 'reference', title: 'Referencia' },
              { key: 'total_debit', title: 'Débito Total' },
              { key: 'total_credit', title: 'Crédito Total' },
            ];
            const rows = journalData.map((entry: any) => ({
              date: new Date(entry.entry_date).toLocaleDateString('es-DO'),
              number: entry.entry_number,
              description: entry.description,
              reference: entry.reference || '',
              total_debit: entry.total_debit || 0,
              total_credit: entry.total_credit || 0,
            }));
            exportToExcelWithHeaders(rows, headers, filename.replace('.xlsx',''), 'Libro Diario', [12,14,40,18,16,16]);
          }
          break;

        default:
          alert('Tipo de reporte no soportado');
          return;
      }
      alert(`Reporte ${getReportName(reportType)} generado exitosamente en Excel.`);
    } catch (error) {
      console.error('Error generating report:', error);
      alert('Error al generar el reporte. Intente nuevamente.');
    } finally {
      setReportLoading(false);
    }
  };

  const getReportName = (reportType: string) => {
    const names: { [key: string]: string } = {
      'balance-sheet': 'Balance General',
      'income-statement': 'Estado de Resultados',
      'trial-balance': 'Balanza de Comprobación',
      'cash-flow': 'Flujo de Efectivo',
      'general-ledger': 'Mayor General',
      'journal-report': 'Libro Diario'
    };
    return names[reportType] || reportType;
  };

  const generateBalanceSheetCSV = (data: any) => {
    let csv = 'BALANCE GENERAL\n';
    csv += `Al ${new Date(data.asOfDate).toLocaleDateString('es-DO')}\n\n`;
    
    csv += 'ACTIVOS\n';
    csv += 'Código,Nombre,Saldo\n';
    data.assets.forEach((account: any) => {
      csv += `${account.code},${account.name},${formatAmount(account.balance)}\n`;
    });
    csv += `TOTAL ACTIVOS,,${formatAmount(data.totalAssets)}\n\n`;

    csv += 'PASIVOS\n';
    csv += 'Código,Nombre,Saldo\n';
    data.liabilities.forEach((account: any) => {
      csv += `${account.code},${account.name},${formatAmount(account.balance)}\n`;
    });
    csv += `TOTAL PASIVOS,,${formatAmount(data.totalLiabilities)}\n\n`;

    csv += 'PATRIMONIO\n';
    csv += 'Código,Nombre,Saldo\n';
    data.equity.forEach((account: any) => {
      csv += `${account.code},${account.name},${formatAmount(account.balance)}\n`;
    });
    csv += `TOTAL PATRIMONIO,,${formatAmount(data.totalEquity)}\n\n`;

    csv += `TOTAL PASIVOS + PATRIMONIO,,${formatAmount(data.totalLiabilities + data.totalEquity)}\n`;

    return csv;
  };

  const generateIncomeStatementCSV = (data: any) => {
    let csv = 'ESTADO DE RESULTADOS\n';
    csv += `Del ${new Date(data.fromDate).toLocaleDateString('es-DO')} al ${new Date(data.toDate).toLocaleDateString('es-DO')}\n\n`;
    
    csv += 'INGRESOS\n';
    csv += 'Código,Nombre,Saldo\n';
    data.income.forEach((account: any) => {
      csv += `${account.code},${account.name},${formatAmount(account.balance)}\n`;
    });
    csv += `TOTAL INGRESOS,,${formatAmount(data.totalIncome)}\n\n`;

    csv += 'GASTOS\n';
    csv += 'Código,Nombre,Saldo\n';
    data.expenses.forEach((account: any) => {
      csv += `${account.code},${account.name},${formatAmount(account.balance)}\n`;
    });
    csv += `TOTAL GASTOS,,${formatAmount(data.totalExpenses)}\n\n`;

    csv += `UTILIDAD NETA,,${formatAmount(data.netIncome)}\n`;

    return csv;
  };

  const generateTrialBalanceCSV = (data: any) => {
    let csv = 'BALANZA DE COMPROBACIÓN\n';
    csv += `Al ${new Date(data.asOfDate).toLocaleDateString('es-DO')}\n\n`;
    csv += 'Código,Nombre,Débito,Crédito\n';
    
    data.accounts.forEach((account: any) => {
      csv += `${account.code},${account.name},${formatAmount(account.debitBalance)},${formatAmount(account.creditBalance)}\n`;
    });
    
    csv += `TOTALES,,${formatAmount(data.totalDebits)},${formatAmount(data.totalCredits)}\n`;
    csv += `BALANCEADO,,${data.isBalanced ? 'SÍ' : 'NO'}\n`;

    return csv;
  };

  const generateCashFlowCSV = (data: any) => {
    let csv = 'ESTADO DE FLUJO DE EFECTIVO\n';
    csv += `Del ${new Date(data.fromDate).toLocaleDateString('es-DO')} al ${new Date(data.toDate).toLocaleDateString('es-DO')}\n\n`;
    
    csv += 'Concepto,Monto\n';
    csv += `Flujo de Efectivo Operativo,${formatAmount(data.operatingCashFlow)}\n`;
    csv += `Flujo de Efectivo de Inversión,${formatAmount(data.investingCashFlow)}\n`;
    csv += `Flujo de Efectivo de Financiamiento,${formatAmount(data.financingCashFlow)}\n`;
    csv += `Flujo Neto de Efectivo,${formatAmount(data.netCashFlow)}\n`;

    return csv;
  };

  const generateGeneralLedgerCSV = (entries: any[]) => {
    let csv = 'MAYOR GENERAL\n';
    csv += `Generado el ${new Date().toLocaleDateString('es-DO')}\n\n`;
    csv += 'Fecha,Número,Descripción,Cuenta,Débito,Crédito\n';
    
    entries.forEach(entry => {
      entry.journal_entry_lines?.forEach((line: any) => {
        csv += `${new Date(entry.entry_date).toLocaleDateString('es-DO')},${entry.entry_number},${entry.description},${line.chart_accounts?.code} - ${line.chart_accounts?.name},${formatAmount(line.debit_amount || 0)},${formatAmount(line.credit_amount || 0)}\n`;
      });
    });

    return csv;
  };

  const generateJournalReportCSV = (entries: any[]) => {
    let csv = 'LIBRO DIARIO\n';
    csv += `Generado el ${new Date().toLocaleDateString('es-DO')}\n\n`;
    csv += 'Fecha,Número,Descripción,Referencia,Débito Total,Crédito Total\n';
    
    entries.forEach(entry => {
      csv += `${new Date(entry.entry_date).toLocaleDateString('es-DO')},${entry.entry_number},${entry.description},${entry.reference || ''},${formatAmount(entry.total_debit)},${formatAmount(entry.total_credit)}\n`;
    });

    return csv;
  };

  const getAccountsByType = (type: string) => {
    // Para evitar doble conteo, usar solo cuentas imputables (allow_posting = true)
    // Las cuentas padre (allow_posting = false) suelen ser solo de agrupación.
    return accounts.filter((account: any) => {
      const allowPosting = account.allowPosting ?? account.allow_posting;
      return account.type === type && allowPosting !== false;
    });
  };

  const calculateAccountTypeTotal = (type: string) => {
    const accounts = getAccountsByType(type);
    if (accounts.length === 0) return null;
    const baseTotal = accounts.reduce((sum, account) => sum + (account.balance || 0), 0);
    const total = type === 'equity' ? baseTotal + netIncome : baseTotal;
    return total === 0 ? null : total;
  };

  const getBreakdownLabel = (type: BreakdownType) => {
    if (type === 'asset') return 'Activos';
    if (type === 'liability') return 'Pasivos';
    if (type === 'equity') return 'Patrimonio';
    return 'Ingresos';
  };

  const openBreakdown = async (type: BreakdownType) => {
    setBreakdownType(type);
    setBreakdownOpen(true);
    setBreakdownLoading(true);
    setBreakdownLines([]);
    try {
      const uid = user?.id || '';
      if (!uid) {
        setBreakdownLines([]);
        return;
      }
      const accs = getAccountsByType(type);
      const accountIds = accs.map((a) => a.id).filter(Boolean);
      const lines = await journalEntriesService.getRecentLinesByAccountIds(uid, accountIds, 50);
      setBreakdownLines((lines || []) as any);
    } catch (err) {
      console.error('Error loading breakdown:', err);
      setBreakdownLines([]);
    } finally {
      setBreakdownLoading(false);
    }
  };

  const { totalDebit, totalCredit } = calculateTotals();

  if (loading) {
    return (
      <DashboardLayout>
        <div className="p-6 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Cargando datos contables...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Contabilidad</h1>
            <p className="text-gray-600 mt-1">Sistema completo de gestión contable</p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={() => setShowJournalModal(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              <i className="ri-add-line mr-2"></i>
              Nuevo Asiento
            </button>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Acciones Rápidas</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <button 
              onClick={() => navigate('/accounting/general-journal')}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap cursor-pointer"
            >
              <i className="ri-add-line mr-2"></i>
              Nuevo Asiento
            </button>
            
            <button 
              onClick={() => navigate('/accounting/financial-statements')}
              className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors whitespace-nowrap cursor-pointer"
            >
              <i className="ri-file-chart-line mr-2"></i>
              Estados Financieros
            </button>
            
            <button 
              onClick={() => navigate('/accounting/bank-reconciliation')}
              className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition-colors whitespace-nowrap cursor-pointer"
            >
              <i className="ri-bank-line mr-2"></i>
              Conciliación Bancaria
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            {[
              { id: 'overview', label: 'Resumen', icon: 'ri-dashboard-line' },
              { id: 'journal', label: 'Libro Diario', icon: 'ri-book-line' },
              { id: 'ledger', label: 'Mayor General', icon: 'ri-file-list-line' },
              { id: 'reports', label: 'Reportes', icon: 'ri-bar-chart-line' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <i className={`${tab.icon} mr-2`}></i>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <button
                type="button"
                onClick={() => openBreakdown('asset')}
                className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start">
                  <div className="p-2 bg-blue-100 rounded-lg flex-shrink-0">
                    <i className="ri-money-dollar-circle-line text-xl text-blue-600"></i>
                  </div>
                  <div className="ml-3 min-w-0 flex-1">
                    <p className="text-xs font-medium text-gray-600 truncate">Activos</p>
                    {calculateAccountTypeTotal('asset') === null ? (
                      <p className="text-sm text-gray-500 italic">No hay datos</p>
                    ) : (
                      <p className="text-base font-bold text-gray-900 truncate" title={`RD$${formatAmount(calculateAccountTypeTotal('asset')!)}`}>
                        RD${formatAmount(calculateAccountTypeTotal('asset')!)}
                      </p>
                    )}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => openBreakdown('liability')}
                className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start">
                  <div className="p-2 bg-red-100 rounded-lg flex-shrink-0">
                    <i className="ri-bank-card-line text-xl text-red-600"></i>
                  </div>
                  <div className="ml-3 min-w-0 flex-1">
                    <p className="text-xs font-medium text-gray-600 truncate">Pasivos</p>
                    {calculateAccountTypeTotal('liability') === null ? (
                      <p className="text-sm text-gray-500 italic">No hay datos</p>
                    ) : (
                      <p className="text-base font-bold text-gray-900 truncate" title={`RD$${formatAmount(calculateAccountTypeTotal('liability')!)}`}>
                        RD${formatAmount(calculateAccountTypeTotal('liability')!)}
                      </p>
                    )}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => openBreakdown('equity')}
                className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start">
                  <div className="p-2 bg-green-100 rounded-lg flex-shrink-0">
                    <i className="ri-pie-chart-line text-xl text-green-600"></i>
                  </div>
                  <div className="ml-3 min-w-0 flex-1">
                    <p className="text-xs font-medium text-gray-600 truncate">Patrimonio</p>
                    {calculateAccountTypeTotal('equity') === null ? (
                      <p className="text-sm text-gray-500 italic">No hay datos</p>
                    ) : (
                      <p className="text-base font-bold text-gray-900 truncate" title={`RD$${formatAmount(calculateAccountTypeTotal('equity')!)}`}>
                        RD${formatAmount(calculateAccountTypeTotal('equity')!)}
                      </p>
                    )}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => openBreakdown('income')}
                className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start">
                  <div className="p-2 bg-purple-100 rounded-lg flex-shrink-0">
                    <i className="ri-line-chart-line text-xl text-purple-600"></i>
                  </div>
                  <div className="ml-3 min-w-0 flex-1">
                    <p className="text-xs font-medium text-gray-600 truncate">Ingresos</p>
                    {calculateAccountTypeTotal('income') === null ? (
                      <p className="text-sm text-gray-500 italic">No hay datos</p>
                    ) : (
                      <p className="text-base font-bold text-gray-900 truncate" title={`RD$${formatAmount(calculateAccountTypeTotal('income')!)}`}>
                        RD${formatAmount(calculateAccountTypeTotal('income')!)}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            </div>

            {breakdownOpen && breakdownType && (
              <div className="fixed inset-0 z-50 flex items-center justify-center">
                <div
                  className="absolute inset-0 bg-black/40"
                  onClick={() => setBreakdownOpen(false)}
                />
                <div className="relative bg-white w-full max-w-4xl mx-4 rounded-lg shadow-lg border border-gray-200 max-h-[85vh] overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-medium text-gray-900">Origen del valor: {getBreakdownLabel(breakdownType)}</h3>
                      <p className="text-sm text-gray-600">
                        Este total se calcula como la suma de <span className="font-medium">balance</span> de las cuentas tipo <span className="font-medium">{breakdownType}</span> que permiten imputación (<span className="font-medium">allow_posting</span>).
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setBreakdownOpen(false)}
                      className="text-gray-500 hover:text-gray-800"
                      aria-label="Cerrar"
                    >
                      <i className="ri-close-line text-xl"></i>
                    </button>
                  </div>

                  <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(85vh-64px)]">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-semibold text-gray-900">Cuentas incluidas</h4>
                        <div className="text-sm text-gray-700">
                          Total: <span className="font-semibold">RD${formatAmount(calculateAccountTypeTotal(breakdownType) || 0)}</span>
                        </div>
                      </div>
                      <div className="overflow-x-auto border border-gray-200 rounded-lg">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Código</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cuenta</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Balance</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {getAccountsByType(breakdownType)
                              .slice()
                              .sort((a, b) => String(a.code).localeCompare(String(b.code)))
                              .map((acc) => (
                                <tr key={acc.id}>
                                  <td className="px-4 py-2 text-sm text-gray-900">{acc.code}</td>
                                  <td className="px-4 py-2 text-sm text-gray-900">{acc.name}</td>
                                  <td className="px-4 py-2 text-sm text-gray-900 text-right">RD${formatAmount(acc.balance || 0)}</td>
                                </tr>
                              ))}
                          </tbody>
                          <tfoot className="bg-gray-100">
                            <tr>
                              <td colSpan={2} className="px-4 py-2 text-sm font-semibold text-gray-900 text-right">Total:</td>
                              <td className="px-4 py-2 text-sm font-bold text-gray-900 text-right">
                                RD${formatAmount(getAccountsByType(breakdownType).reduce((sum, acc) => sum + (acc.balance || 0), 0))}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                        {getAccountsByType(breakdownType).length === 0 && (
                          <div className="p-4 text-sm text-gray-500">No hay cuentas para este tipo.</div>
                        )}
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold text-gray-900 mb-3">Movimientos recientes (asientos posteados)</h4>
                      {breakdownLoading ? (
                        <div className="text-sm text-gray-600">Cargando movimientos...</div>
                      ) : (
                        <div className="overflow-x-auto border border-gray-200 rounded-lg">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Asiento</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cuenta</th>
                                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Débito</th>
                                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Crédito</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {breakdownLines.map((l) => (
                                <tr key={l.id}>
                                  <td className="px-4 py-2 text-sm text-gray-900">{l.journal_entries?.entry_number || ''}</td>
                                  <td className="px-4 py-2 text-sm text-gray-500">{l.journal_entries?.entry_date ? new Date(l.journal_entries.entry_date).toLocaleDateString('es-DO') : ''}</td>
                                  <td className="px-4 py-2 text-sm text-gray-900">{l.chart_accounts ? `${l.chart_accounts.code} - ${l.chart_accounts.name}` : ''}</td>
                                  <td className="px-4 py-2 text-sm text-gray-900 text-right">RD${formatAmount(Number(l.debit_amount || 0))}</td>
                                  <td className="px-4 py-2 text-sm text-gray-900 text-right">RD${formatAmount(Number(l.credit_amount || 0))}</td>
                                </tr>
                              ))}
                            </tbody>
                            {breakdownLines.length > 0 && (
                              <tfoot className="bg-gray-100">
                                <tr>
                                  <td colSpan={3} className="px-4 py-2 text-sm font-semibold text-gray-900 text-right">Totales:</td>
                                  <td className="px-4 py-2 text-sm font-bold text-gray-900 text-right">
                                    RD${formatAmount(breakdownLines.reduce((sum, l) => sum + Number(l.debit_amount || 0), 0))}
                                  </td>
                                  <td className="px-4 py-2 text-sm font-bold text-gray-900 text-right">
                                    RD${formatAmount(breakdownLines.reduce((sum, l) => sum + Number(l.credit_amount || 0), 0))}
                                  </td>
                                </tr>
                              </tfoot>
                            )}
                          </table>
                          {breakdownLines.length === 0 && (
                            <div className="p-4 text-sm text-gray-500">No hay movimientos recientes para estas cuentas.</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Recent Journal Entries */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">Asientos Recientes</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Número
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Fecha
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Descripción
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Débito
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Crédito
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {journalEntries.slice(0, 5).map((entry) => (
                      <tr key={entry.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {entry.entry_number}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(entry.entry_date).toLocaleDateString('es-DO')}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {entry.description}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          RD${formatAmount(entry.total_debit)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          RD${formatAmount(entry.total_credit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {journalEntries.length === 0 && (
                  <div className="text-center py-8">
                    <i className="ri-file-list-line text-4xl text-gray-300 mb-4 block"></i>
                    <p className="text-gray-500">No hay asientos contables registrados</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'journal' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-medium text-gray-900">Libro Diario</h3>
              <button
                onClick={() => setShowJournalModal(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
              >
                <i className="ri-add-line mr-2"></i>
                Nuevo Asiento
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Número
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Fecha
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Descripción
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Referencia
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Débito
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Crédito
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Estado
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {journalEntries.map((entry) => (
                    <tr key={entry.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {entry.entry_number}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(entry.entry_date).toLocaleDateString('es-DO')}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {entry.description}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {entry.reference}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        RD${entry.total_debit.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        RD${entry.total_credit.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          {entry.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {journalEntries.length === 0 && (
                <div className="text-center py-8">
                  <i className="ri-book-line text-4xl text-gray-300 mb-4 block"></i>
                  <p className="text-gray-500 mb-4">No hay asientos en el libro diario</p>
                  <button
                    onClick={() => setShowJournalModal(true)}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                  >
                    <i className="ri-add-line mr-2"></i>
                    Crear Primer Asiento
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'reports' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Reportes Contables</h3>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[
                  { id: 'balance-sheet', name: 'Balance General', icon: 'ri-scales-line', description: 'Estado de situación financiera' },
                  { id: 'income-statement', name: 'Estado de Resultados', icon: 'ri-line-chart-line', description: 'Ingresos y gastos del período' },
                  { id: 'cash-flow', name: 'Flujo de Efectivo', icon: 'ri-money-dollar-circle-line', description: 'Movimientos de efectivo' },
                  { id: 'trial-balance', name: 'Balanza de Comprobación', icon: 'ri-calculator-line', description: 'Saldos de todas las cuentas' },
                  { id: 'general-ledger', name: 'Mayor General', icon: 'ri-book-open-line', description: 'Detalle de movimientos por cuenta' },
                  { id: 'journal-report', name: 'Libro Diario', icon: 'ri-file-list-line', description: 'Registro cronológico de asientos' }
                ].map((report) => (
                  <div key={report.id} className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
                    <div className="flex items-center mb-3">
                      <div className="p-2 bg-blue-100 rounded-lg mr-3">
                        <i className={`${report.icon} text-xl text-blue-600`}></i>
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900">{report.name}</h4>
                        <p className="text-sm text-gray-500">{report.description}</p>
                      </div>
                    </div>
                    {report.id === 'trial-balance' && (
                      <div className="mb-3">
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Modo de balanza
                        </label>
                        <select
                          value={trialBalanceMode}
                          onChange={(e) => setTrialBalanceMode(e.target.value as 'detail' | 'summary')}
                          className="w-full px-3 py-1 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="detail">Con detalle (todas las cuentas)</option>
                          <option value="summary">Sin detalle (solo cuentas de grupo)</option>
                        </select>
                      </div>
                    )}
                    <button
                      onClick={() => handleGenerateReport(report.id)}
                      disabled={reportLoading}
                      className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap disabled:opacity-50"
                    >
                      {reportLoading ? (
                        <>
                          <i className="ri-loader-4-line mr-2 animate-spin"></i>
                          Generando...
                        </>
                      ) : (
                        <>
                          <i className="ri-download-line mr-2"></i>
                          Generar Reporte
                        </>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'ledger' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900">Mayor General</h3>
              <button
                onClick={() => navigate('/accounting/general-ledger')}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
              >
                <i className="ri-book-open-line mr-2"></i>
                Ir al Mayor General
              </button>
            </div>
            <div className="p-6 text-sm text-gray-600">
              <p>
                Desde esta pestaña puedes acceder al detalle del Mayor General.
                Usa el botón "Ir al Mayor General" para ver los movimientos por cuenta
                con filtros de fechas y exportación a Excel.
              </p>
            </div>
          </div>
        )}

        {/* Journal Entry Modal */}
        {showJournalModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-semibold text-gray-900">Nuevo Asiento Contable</h2>
                  <button
                    onClick={() => setShowJournalModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <i className="ri-close-line text-xl"></i>
                  </button>
                </div>

                <form onSubmit={handleSubmitJournal} className="space-y-6">
                  {/* Header Info */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Número de Asiento
                      </label>
                      <input
                        type="text"
                        value={journalForm.entry_number}
                        onChange={(e) => setJournalForm(prev => ({ ...prev, entry_number: e.target.value }))}
                        placeholder={generateEntryNumber()}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Fecha *
                      </label>
                      <input
                        type="date"
                        required
                        value={journalForm.entry_date}
                        onChange={(e) => setJournalForm(prev => ({ ...prev, entry_date: e.target.value }))}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Referencia
                      </label>
                      <input
                        type="text"
                        value={journalForm.reference}
                        onChange={(e) => setJournalForm(prev => ({ ...prev, reference: e.target.value }))}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Descripción *
                    </label>
                    <textarea
                      required
                      value={journalForm.description}
                      onChange={(e) => setJournalForm(prev => ({ ...prev, description: e.target.value }))}
                      rows={3}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  {/* Journal Lines */}
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-medium text-gray-900">Líneas del Asiento</h3>
                      <button
                        type="button"
                        onClick={handleAddJournalLine}
                        className="bg-green-600 text-white px-3 py-1 rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap"
                      >
                        <i className="ri-add-line mr-1"></i>
                        Agregar Línea
                      </button>
                    </div>

                    <div className="space-y-3">
                      {journalForm.lines.map((line, index) => (
                        <div key={index} className="grid grid-cols-12 gap-3 items-center">
                          <div className="col-span-4">
                            <select
                              value={line.account_id}
                              onChange={(e) => handleJournalLineChange(index, 'account_id', e.target.value)}
                              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm pr-8"
                              required
                            >
                              <option value="">Seleccionar cuenta</option>
                              {accounts.filter(acc => acc.is_active && acc.allow_posting).map((account) => (
                                <option key={account.id} value={account.id}>
                                  {account.code} - {account.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="col-span-3">
                            <input
                              type="text"
                              value={line.description}
                              onChange={(e) => handleJournalLineChange(index, 'description', e.target.value)}
                              placeholder="Descripción"
                              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                            />
                          </div>
                          <div className="col-span-2">
                            <input
                              type="number" min="0"
                              step="0.01"
                              value={line.debit}
                              onChange={(e) => handleJournalLineChange(index, 'debit', e.target.value)}
                              placeholder="Débito"
                              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                            />
                          </div>
                          <div className="col-span-2">
                            <input
                              type="number" min="0"
                              step="0.01"
                              value={line.credit}
                              onChange={(e) => handleJournalLineChange(index, 'credit', e.target.value)}
                              placeholder="Crédito"
                              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                            />
                          </div>
                          <div className="col-span-1">
                            <button
                              type="button"
                              onClick={() => handleRemoveJournalLine(index)}
                              disabled={journalForm.lines.length <= 2}
                              className="text-red-600 hover:text-red-900 disabled:text-gray-400 disabled:cursor-not-allowed"
                            >
                              <i className="ri-delete-bin-line"></i>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Totals */}
                    <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                      <div className="flex justify-between items-center">
                        <div className="text-sm">
                          <span className="font-medium">Total Débito: </span>
                          <span className="text-blue-600">RD${formatAmount(totalDebit)}</span>
                        </div>
                        <div className="text-sm">
                          <span className="font-medium">Total Crédito: </span>
                          <span className="text-green-600">RD${formatAmount(totalCredit)}</span>
                        </div>
                        <div className="text-sm">
                          <span className="font-medium">Diferencia: </span>
                          <span className={`${Math.abs(totalDebit - totalCredit) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
                            RD${formatAmount(Math.abs(totalDebit - totalCredit))}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowJournalModal(false)}
                      className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={Math.abs(totalDebit - totalCredit) > 0.01}
                      className="flex-1 bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Crear Asiento
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
