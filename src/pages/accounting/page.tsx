import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { chartAccountsService, journalEntriesService } from '../../services/database';
import { useAuth } from '../../hooks/useAuth';
import { exportToExcelWithHeaders, exportToExcelStyled } from '../../utils/exportImportUtils';
import { formatAmount } from '../../utils/numberFormat';
import { formatDate } from '../../utils/dateFormat';

const theme = {
  primary: '#4b5c4b',
  primaryHover: '#3f4f3f',
  accent: '#6d806d',
  muted: '#eef2ea',
  softBorder: '#dfe4db',
  softText: '#2f3a2f',
  badgeBg: '#e3e8dd',
};

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
        alert('You must be signed in to generate reports.');
        return;
      }
      const today = new Date().toISOString().split('T')[0];
      const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
      
      let filename = '';

      switch (reportType) {
        case 'balance-sheet':
          {
            const data = await chartAccountsService.generateBalanceSheet(user.id, today);
            filename = `balance_sheet_${today}.xlsx`;
            const headers = [
              { key: 'section', title: 'Section' },
              { key: 'code', title: 'Code' },
              { key: 'name', title: 'Account' },
              { key: 'balance', title: 'Balance' },
            ];
            const rows: any[] = [];
            const pushGroup = (section: string, items: any[], total: number) => {
              items.forEach(acc => rows.push({ section, code: acc.code, name: acc.name, balance: Math.abs(acc.balance || 0) }));
              rows.push({ section: `TOTAL ${section.toUpperCase()}`, code: '', name: '', balance: total });
              rows.push({ section: '', code: '', name: '', balance: '' });
            };
            pushGroup('Assets', data.assets || [], data.totalAssets || 0);
            pushGroup('Liabilities', data.liabilities || [], data.totalLiabilities || 0);
            pushGroup('Equity', data.equity || [], data.totalEquity || 0);
            rows.push({ section: 'TOTAL LIABILITIES + EQUITY', code: '', name: '', balance: (data.totalLiabilities || 0) + (data.totalEquity || 0) });
            await exportToExcelStyled(
              rows,
              [
                { key: 'section', title: 'Section', width: 18 },
                { key: 'code', title: 'Code', width: 12 },
                { key: 'name', title: 'Account', width: 40 },
                { key: 'balance', title: 'Balance', width: 18, numFmt: '#,##0.00' },
              ],
              filename.replace('.xlsx',''),
              'Balance Sheet'
            );
          }
          break;

        case 'income-statement':
          {
            const data = await chartAccountsService.generateIncomeStatement(user.id, firstDayOfMonth, today);
            filename = `income_statement_${today}.xlsx`;
            const headers = [
              { key: 'section', title: 'Section' },
              { key: 'code', title: 'Code' },
              { key: 'name', title: 'Account' },
              { key: 'amount', title: 'Amount' },
            ];
            const rows: any[] = [];
            (data.income || []).forEach(acc => rows.push({ section: 'Income', code: acc.code, name: acc.name, amount: Math.abs(acc.balance || 0) }));
            rows.push({ section: 'TOTAL INCOME', code: '', name: '', amount: data.totalIncome || 0 });
            rows.push({ section: '', code: '', name: '', amount: '' });
            (data.expenses || []).forEach(acc => rows.push({ section: 'Expenses', code: acc.code, name: acc.name, amount: Math.abs(acc.balance || 0) }));
            rows.push({ section: 'TOTAL EXPENSES', code: '', name: '', amount: data.totalExpenses || 0 });
            rows.push({ section: '', code: '', name: '', amount: '' });
            rows.push({ section: 'NET INCOME', code: '', name: '', amount: data.netIncome || 0 });
            await exportToExcelStyled(
              rows,
              [
                { key: 'section', title: 'Section', width: 18 },
                { key: 'code', title: 'Code', width: 12 },
                { key: 'name', title: 'Account', width: 40 },
                { key: 'amount', title: 'Amount', width: 18, numFmt: '#,##0.00' },
              ],
              filename.replace('.xlsx',''),
              'Income Statement'
            );
          }
          break;

        case 'trial-balance':
          {
            const data = await chartAccountsService.generateTrialBalance(user.id, today);
            filename = `trial_balance_${today}.xlsx`;
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
              name: 'TOTALS',
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
              name: 'BALANCED',
              prev_debit: '',
              prev_credit: '',
              mov_debit: data.isBalanced ? 'YES' : 'NO',
              mov_credit: '',
              final_debit: '',
              final_credit: '',
            });
            await exportToExcelStyled(
              rows,
              [
                { key: 'level', title: 'Level', width: 6 },
                { key: 'number', title: 'Account number', width: 16 },
                { key: 'name', title: 'Account name', width: 40 },
                { key: 'prev_debit', title: 'Opening Debit', width: 18, numFmt: '#,##0.00' },
                { key: 'prev_credit', title: 'Opening Credit', width: 18, numFmt: '#,##0.00' },
                { key: 'mov_debit', title: 'Period Debit', width: 18, numFmt: '#,##0.00' },
                { key: 'mov_credit', title: 'Period Credit', width: 18, numFmt: '#,##0.00' },
                { key: 'final_debit', title: 'Ending Debit', width: 18, numFmt: '#,##0.00' },
                { key: 'final_credit', title: 'Ending Credit', width: 18, numFmt: '#,##0.00' },
              ],
              filename.replace('.xlsx',''),
              'Trial Balance'
            );
          }
          break;

        case 'cash-flow':
          {
            const data = await chartAccountsService.generateCashFlowStatement(user.id, firstDayOfMonth, today);
            filename = `cash_flow_${today}.xlsx`;
            const headers = [
              { key: 'concept', title: 'Concept' },
              { key: 'amount', title: 'Amount' },
            ];
            const rows = [
              { concept: 'Operating cash flow', amount: data.operatingCashFlow || 0 },
              { concept: 'Investing cash flow', amount: data.investingCashFlow || 0 },
              { concept: 'Financing cash flow', amount: data.financingCashFlow || 0 },
              { concept: 'Net cash flow', amount: data.netCashFlow || 0 },
            ];
            await exportToExcelStyled(
              rows,
              [
                { key: 'concept', title: 'Concept', width: 50 },
                { key: 'amount', title: 'Amount', width: 18, numFmt: '#,##0.00' },
              ],
              filename.replace('.xlsx',''),
              'Cash Flow'
            );
          }
          break;

        case 'general-ledger':
          {
            const entries = await journalEntriesService.getAll(user.id);
            filename = `general_ledger_${today}.xlsx`;
            const headers = [
              { key: 'date', title: 'Date' },
              { key: 'number', title: 'Entry number' },
              { key: 'description', title: 'Description' },
              { key: 'account', title: 'Account' },
              { key: 'debit', title: 'Debit' },
              { key: 'credit', title: 'Credit' },
            ];
            const rows: any[] = [];
            entries.forEach((entry: any) => {
              entry.journal_entry_lines?.forEach((line: any) => {
                rows.push({
                  date: formatDate(entry.entry_date),
                  number: entry.entry_number,
                  description: entry.description,
                  account: `${line.chart_accounts?.code || ''} - ${line.chart_accounts?.name || ''}`,
                  debit: formatAmount(Number(line.debit_amount || 0)),
                  credit: formatAmount(Number(line.credit_amount || 0)),
                });
              });
            });
            exportToExcelWithHeaders(rows, headers, filename.replace('.xlsx',''), 'General Ledger', [12,14,40,28,16,16]);
          }
          break;

        case 'journal-report':
          {
            const journalData = await journalEntriesService.getAll(user.id);
            filename = `journal_report_${today}.xlsx`;
            const headers = [
              { key: 'date', title: 'Date' },
              { key: 'number', title: 'Entry number' },
              { key: 'description', title: 'Description' },
              { key: 'reference', title: 'Reference' },
              { key: 'total_debit', title: 'Total Debit' },
              { key: 'total_credit', title: 'Total Credit' },
            ];
            const rows = journalData.map((entry: any) => ({
              date: formatDate(entry.entry_date),
              number: entry.entry_number,
              description: entry.description,
              reference: entry.reference || '',
              total_debit: formatAmount(entry.total_debit),
              total_credit: formatAmount(entry.total_credit),
            }));
            exportToExcelWithHeaders(rows, headers, filename.replace('.xlsx',''), 'Journal Report', [12,14,40,18,16,16]);
          }
          break;

        default:
          alert('Report type not supported.');
          return;
      }
      alert(`${getReportName(reportType)} report generated successfully.`);
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
    csv += `Al ${formatDate(data.asOfDate)}\n\n`;
    
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
    csv += `Del ${formatDate(data.fromDate)} al ${formatDate(data.toDate)}\n\n`;
    
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
    csv += `Al ${formatDate(data.asOfDate)}\n\n`;
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
    csv += `Del ${formatDate(data.fromDate)} al ${formatDate(data.toDate)}\n\n`;
    
    csv += 'Concepto,Monto\n';
    csv += `Flujo de Efectivo Operativo,${formatAmount(data.operatingCashFlow)}\n`;
    csv += `Flujo de Efectivo de Inversión,${formatAmount(data.investingCashFlow)}\n`;
    csv += `Flujo de Efectivo de Financiamiento,${formatAmount(data.financingCashFlow)}\n`;
    csv += `Flujo Neto de Efectivo,${formatAmount(data.netCashFlow)}\n`;

    return csv;
  };

  const generateGeneralLedgerCSV = (entries: any[]) => {
    let csv = 'MAYOR GENERAL\n';
    csv += `Generado el ${formatDate(new Date())}\n\n`;
    csv += 'Fecha,Número,Descripción,Cuenta,Débito,Crédito\n';
    
    entries.forEach(entry => {
      entry.journal_entry_lines?.forEach((line: any) => {
        csv += `${formatDate(entry.entry_date)},${entry.entry_number},${entry.description},${line.chart_accounts?.code} - ${line.chart_accounts?.name},${formatAmount(line.debit_amount || 0)},${formatAmount(line.credit_amount || 0)}\n`;
      });
    });

    return csv;
  };

  const generateJournalReportCSV = (entries: any[]) => {
    let csv = 'LIBRO DIARIO\n';
    csv += `Generado el ${formatDate(new Date())}\n\n`;
    csv += 'Fecha,Número,Descripción,Referencia,Débito Total,Crédito Total\n';
    
    entries.forEach(entry => {
      csv += `${formatDate(entry.entry_date)},${entry.entry_number},${entry.description},${entry.reference || ''},${formatAmount(entry.total_debit)},${formatAmount(entry.total_credit)}\n`;
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
    if (type === 'asset') return 'Assets';
    if (type === 'liability') return 'Liabilities';
    if (type === 'equity') return 'Equity';
    return 'Income';
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
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto" style={{ borderColor: theme.primary }}></div>
            <p className="mt-4 text-gray-600">Loading accounting data...</p>
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
            <h1 className="text-2xl font-bold text-gray-900">Accounting</h1>
            <p className="text-gray-600 mt-1">Comprehensive accounting management system</p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={() => setShowJournalModal(true)}
              className="text-white px-4 py-2 rounded-lg shadow-sm transition-colors whitespace-nowrap"
              style={{ backgroundColor: theme.primary }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = theme.primaryHover; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = theme.primary; }}
            >
              <i className="ri-add-line mr-2"></i>
              New Entry
            </button>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <button 
              onClick={() => navigate('/accounting/general-journal')}
              className="text-white px-4 py-2 rounded-lg shadow-sm transition-colors whitespace-nowrap cursor-pointer"
              style={{ backgroundColor: theme.primary }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = theme.primaryHover; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = theme.primary; }}
            >
              <i className="ri-add-line mr-2"></i>
              New Entry
            </button>
            
            <button 
              onClick={() => navigate('/accounting/financial-statements')}
              className="text-white px-4 py-2 rounded-lg shadow-sm transition-colors whitespace-nowrap cursor-pointer"
              style={{ backgroundColor: theme.accent }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = theme.primaryHover; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = theme.accent; }}
            >
              <i className="ri-file-chart-line mr-2"></i>
              Financial Statements
            </button>
            
            <button 
              onClick={() => navigate('/accounting/bank-reconciliation')}
              className="text-white px-4 py-2 rounded-lg shadow-sm transition-colors whitespace-nowrap cursor-pointer"
              style={{ backgroundColor: theme.softText }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = theme.primaryHover; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = theme.softText; }}
            >
              <i className="ri-bank-line mr-2"></i>
              Bank Reconciliation
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            {[
              { id: 'overview', label: 'Overview', icon: 'ri-dashboard-line' },
              { id: 'journal', label: 'General Journal', icon: 'ri-book-line' },
              { id: 'ledger', label: 'General Ledger', icon: 'ri-file-list-line' },
              { id: 'reports', label: 'Reports', icon: 'ri-bar-chart-line' }
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
                    isActive
                      ? 'text-green-800'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                  style={isActive ? { borderColor: theme.primary } : undefined}
                >
                  <i className={`${tab.icon} mr-2`}></i>
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { type: 'asset', label: 'Assets', icon: 'ri-money-dollar-circle-line' },
                { type: 'liability', label: 'Liabilities', icon: 'ri-bank-card-line' },
                { type: 'equity', label: 'Equity', icon: 'ri-pie-chart-line' },
                { type: 'income', label: 'Income', icon: 'ri-line-chart-line' }
              ].map((card) => {
                const total = calculateAccountTypeTotal(card.type as BreakdownType);
                return (
                  <button
                    key={card.type}
                    type="button"
                    onClick={() => openBreakdown(card.type as BreakdownType)}
                    className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 text-left hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start">
                      <div
                        className="p-2 rounded-lg flex-shrink-0"
                        style={{ backgroundColor: theme.muted }}
                      >
                        <i className={`${card.icon} text-xl`} style={{ color: theme.primary }}></i>
                      </div>
                      <div className="ml-3 min-w-0 flex-1">
                        <p className="text-xs font-medium text-gray-600 truncate">{card.label}</p>
                        {total === null ? (
                          <p className="text-sm text-gray-500 italic">No data available</p>
                        ) : (
                          <p
                            className="text-base font-bold text-gray-900 truncate"
                            title={`RD$${formatAmount(total)}`}
                          >
                            RD${formatAmount(total)}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
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
                      <h3 className="text-lg font-medium text-gray-900">Value source: {getBreakdownLabel(breakdownType)}</h3>
                      <p className="text-sm text-gray-600">
                        This total is calculated from the <span className="font-medium">balance</span> of <span className="font-medium">{breakdownType}</span> accounts that allow posting (<span className="font-medium">allow_posting</span>).
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
                        <h4 className="text-sm font-semibold text-gray-900">Included accounts</h4>
                        <div className="text-sm text-gray-700">
                          Total: <span className="font-semibold">RD${formatAmount(calculateAccountTypeTotal(breakdownType) || 0)}</span>
                        </div>
                      </div>
                      <div className="overflow-x-auto border border-gray-200 rounded-lg">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Account</th>
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
                          <div className="p-4 text-sm text-gray-500">No accounts for this category.</div>
                        )}
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold text-gray-900 mb-3">Recent movements (posted entries)</h4>
                      {breakdownLoading ? (
                        <div className="text-sm text-gray-600">Loading movements...</div>
                      ) : (
                        <div className="overflow-x-auto border border-gray-200 rounded-lg">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Entry</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Account</th>
                                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Debit</th>
                                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Credit</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {breakdownLines.map((l) => (
                                <tr key={l.id}>
                                  <td className="px-4 py-2 text-sm text-gray-900">{l.journal_entries?.entry_number || ''}</td>
                                  <td className="px-4 py-2 text-sm text-gray-500">{l.journal_entries?.entry_date ? formatDate(l.journal_entries.entry_date) : ''}</td>
                                  <td className="px-4 py-2 text-sm text-gray-900">{l.chart_accounts ? `${l.chart_accounts.code} - ${l.chart_accounts.name}` : ''}</td>
                                  <td className="px-4 py-2 text-sm text-gray-900 text-right">RD${formatAmount(Number(l.debit_amount || 0))}</td>
                                  <td className="px-4 py-2 text-sm text-gray-900 text-right">RD${formatAmount(Number(l.credit_amount || 0))}</td>
                                </tr>
                              ))}
                            </tbody>
                            {breakdownLines.length > 0 && (
                              <tfoot className="bg-gray-100">
                                <tr>
                                  <td colSpan={3} className="px-4 py-2 text-sm font-semibold text-gray-900 text-right">Totals:</td>
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
                            <div className="p-4 text-sm text-gray-500">No recent movements for these accounts.</div>
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
                <h3 className="text-lg font-medium text-gray-900">Recent Entries</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Number
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Description
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Debit
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Credit
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
                          {formatDate(entry.entry_date)}
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
                    <p className="text-gray-500">No journal entries recorded yet</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'journal' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-medium text-gray-900">General Journal</h3>
              <button
                onClick={() => setShowJournalModal(true)}
                className="text-white px-4 py-2 rounded-lg shadow-sm transition-colors whitespace-nowrap"
                style={{ backgroundColor: theme.primary }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = theme.primaryHover; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = theme.primary; }}
              >
                <i className="ri-add-line mr-2"></i>
                New Entry
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Number
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Description
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Reference
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Debit
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Credit
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
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
                        {formatDate(entry.entry_date)}
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
                  <p className="text-gray-500 mb-4">No journal entries posted yet</p>
                  <button
                    onClick={() => setShowJournalModal(true)}
                    className="text-white px-4 py-2 rounded-lg shadow-sm transition-colors whitespace-nowrap"
                    style={{ backgroundColor: theme.primary }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = theme.primaryHover; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = theme.primary; }}
                  >
                    <i className="ri-add-line mr-2"></i>
                    Create First Entry
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'reports' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Accounting Reports</h3>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[
                  { id: 'balance-sheet', name: 'Balance Sheet', icon: 'ri-scales-line', description: 'Statement of financial position' },
                  { id: 'income-statement', name: 'Income Statement', icon: 'ri-line-chart-line', description: 'Period income and expenses' },
                  { id: 'cash-flow', name: 'Cash Flow', icon: 'ri-money-dollar-circle-line', description: 'Cash movements' },
                  { id: 'trial-balance', name: 'Trial Balance', icon: 'ri-calculator-line', description: 'Balances for every account' },
                  { id: 'general-ledger', name: 'General Ledger', icon: 'ri-book-open-line', description: 'Account movements by period' },
                  { id: 'journal-report', name: 'Journal Report', icon: 'ri-file-list-line', description: 'Chronological entry log' }
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
                          Trial balance mode
                        </label>
                        <select
                          value={trialBalanceMode}
                          onChange={(e) => setTrialBalanceMode(e.target.value as 'detail' | 'summary')}
                          className="w-full px-3 py-1 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="detail">Detailed (all accounts)</option>
                          <option value="summary">Summary (group accounts only)</option>
                        </select>
                      </div>
                    )}
                    <button
                      onClick={() => handleGenerateReport(report.id)}
                      disabled={reportLoading}
                      className="w-full text-white py-2 px-4 rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
                      style={{ backgroundColor: theme.primary }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = theme.primaryHover; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = theme.primary; }}
                    >
                      {reportLoading ? (
                        <>
                          <i className="ri-loader-4-line mr-2 animate-spin"></i>
                          Generating...
                        </>
                      ) : (
                        <>
                          <i className="ri-download-line mr-2"></i>
                          Generate Report
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
              <h3 className="text-lg font-medium text-gray-900">General Ledger</h3>
              <button
                onClick={() => navigate('/accounting/general-ledger')}
                className="text-white px-4 py-2 rounded-lg shadow-sm transition-colors whitespace-nowrap"
                style={{ backgroundColor: theme.primary }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = theme.primaryHover; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = theme.primary; }}
              >
                <i className="ri-book-open-line mr-2"></i>
                Go to General Ledger
              </button>
            </div>
            <div className="p-6 text-sm text-gray-600">
              <p>
                Review detailed ledger movements here. Use the “Go to General Ledger” button to open the full ledger view with account filters, date ranges, and Excel export.
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
                  <h2 className="text-xl font-semibold text-gray-900">New Journal Entry</h2>
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
                        Entry Number
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
                        Date *
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
                        Reference
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
                      Description *
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
                      <h3 className="text-lg font-medium text-gray-900">Journal Lines</h3>
                      <button
                        type="button"
                        onClick={handleAddJournalLine}
                        className="text-white px-3 py-1 rounded-lg shadow-sm transition-colors whitespace-nowrap"
                        style={{ backgroundColor: theme.primary }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = theme.primaryHover; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = theme.primary; }}
                      >
                        <i className="ri-add-line mr-1"></i>
                        Add Line
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
                              <option value="">Select account</option>
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
                              placeholder="Description"
                              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                            />
                          </div>
                          <div className="col-span-2">
                            <input
                              type="number" min="0"
                              step="0.01"
                              value={line.debit}
                              onChange={(e) => handleJournalLineChange(index, 'debit', e.target.value)}
                              placeholder="Debit"
                              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                            />
                          </div>
                          <div className="col-span-2">
                            <input
                              type="number" min="0"
                              step="0.01"
                              value={line.credit}
                              onChange={(e) => handleJournalLineChange(index, 'credit', e.target.value)}
                              placeholder="Credit"
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
                          <span className="font-medium">Total Debit: </span>
                          <span className="text-blue-600">RD${formatAmount(totalDebit)}</span>
                        </div>
                        <div className="text-sm">
                          <span className="font-medium">Total Credit: </span>
                          <span className="text-green-600">RD${formatAmount(totalCredit)}</span>
                        </div>
                        <div className="text-sm">
                          <span className="font-medium">Difference: </span>
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
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={Math.abs(totalDebit - totalCredit) > 0.01}
                      className="flex-1 text-white py-3 rounded-lg transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ backgroundColor: theme.primary }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = theme.primaryHover; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = theme.primary; }}
                    >
                      Create Entry
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
