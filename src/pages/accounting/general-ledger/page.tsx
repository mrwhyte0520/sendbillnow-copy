import { useState, useEffect, type FC, Fragment } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { supabase } from '../../../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { resolveTenantId, settingsService } from '../../../services/database';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { formatAmount } from '../../../utils/numberFormat';
import { formatDate } from '../../../utils/dateFormat';

const theme = {
  primary: '#4b5c4b',
  primaryHover: '#3f4f3f',
  accent: '#6d806d',
  muted: '#eef2ea',
  softBorder: '#dfe4db',
  softText: '#2f3a2f',
  badgeBg: '#e3e8dd',
};

// Estilos CSS para impresión
const printStyles = `
  @media print {
    @page { size: landscape; margin: 0.5cm; }

    body * { visibility: hidden; }
    #printable-ledger, #printable-ledger * { visibility: visible; }

    /* Asegurar que el contenedor de impresión ocupe toda la página y no tenga scroll interno */
    #printable-ledger {
      position: absolute;
      left: 0;
      top: 0;
      width: 100%;
    }

    /* Eliminar barras de scroll horizontales en impresión y dejar que la tabla use todo el ancho disponible */
    #printable-ledger .overflow-x-auto {
      overflow: visible !important;
    }

    #printable-ledger table {
      width: 100%;
      table-layout: auto;
      page-break-inside: avoid;
      font-size: 10pt;
    }

    body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .print-title { text-align: center; font-size: 18pt; font-weight: bold; margin-bottom: 10px; }
    .print-account { text-align: center; font-size: 14pt; margin-bottom: 20px; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
  }
`;

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
  balance: number;
  normalBalance: string;
}

interface AccountingPeriod {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  fiscal_year: string;
  status: string;
}

interface LedgerEntry {
  id: string;
  date: string;
  description: string;
  reference: string;
  debit: number;
  credit: number;
  balance: number;
  entryNumber: string;
  accountId?: string;
  accountCode?: string;
  accountName?: string;
}

const getEntryDocumentType = (entry: LedgerEntry): string => {
  const num = entry.entryNumber || '';
  const desc = (entry.description || '').toLowerCase();

  if (num.startsWith('ED-') || num.startsWith('JE-')) return 'Manual Entry';
  if (num.startsWith('BCG-')) return 'Bank Charge';
  if (num.startsWith('DEP-')) return 'Bank Deposit';
  if (num.startsWith('CRD-')) return 'Bank Credit';
  if (num.startsWith('TRF-')) return 'Bank Transfer';
  if (num.startsWith('CHK-')) return 'Check';
  if (num.startsWith('INV-MOV-')) return 'Inventory Movement';
  if (num.endsWith('-COGS')) return 'Cost of Goods Sold';
  if (num.startsWith('PCF-')) return 'Petty Cash Fund';
  if (num.startsWith('PCE-')) return 'Petty Cash Expense';
  if (num.startsWith('PCT-')) return 'Petty Cash Reimbursement';

  if (desc.includes('factura suplidor')) return 'Supplier Invoice';
  if (desc.startsWith('factura ')) return 'Sales Invoice';
  if (desc.includes('pago a proveedor')) return 'Vendor Payment';

  return 'Other';
};

const GeneralLedgerPage: FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [accountTypeFilter, setAccountTypeFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedFiscalYear, setSelectedFiscalYear] = useState('');
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [documentTypeFilter, setDocumentTypeFilter] = useState<string[]>([]);
  const [companyInfo, setCompanyInfo] = useState<any | null>(null);
  const [showAccountSelector, setShowAccountSelector] = useState(false);

  useEffect(() => {
    loadAccounts();
  }, [user]);

  useEffect(() => {
    if (selectedAccount) {
      loadLedgerEntries(selectedAccount.id);
    }
  }, [selectedAccount]);

  useEffect(() => {
    const loadCompany = async () => {
      try {
        const info = await settingsService.getCompanyInfo();
        setCompanyInfo(info);
      } catch (error) {
        console.error('Error cargando información de la empresa para Mayor General', error);
      }
    };

    loadCompany();
  }, []);

  const loadAccounts = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      
      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) return;
      
      const { data: accountsData, error: accountsError } = await supabase
        .from('chart_accounts')
        .select('*')
        .eq('user_id', tenantId)
        .eq('is_active', true)
        .order('code');

      const { data: periodsData, error: periodsError } = await supabase
        .from('accounting_periods')
        .select('*')
        .eq('user_id', tenantId)
        .order('start_date', { ascending: false });

      if (!accountsError && accountsData && !periodsError && periodsData) {
        const processedAccounts = accountsData.map(account => ({
          id: account.id,
          code: account.code,
          name: account.name,
          type: account.type,
          balance: account.balance || 0,
          normalBalance: account.normal_balance || 'debit'
        }));
        setAccounts(processedAccounts);
        setPeriods(periodsData);
      } else {
        throw new Error('Error loading from Supabase');
      }
    } catch (error) {
      console.error('Error loading accounts:', error);
      // No usar datos de ejemplo
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  };


  const loadLedgerEntries = async (accountId: string) => {
    if (!user) return;

    try {
      setLoading(true);
      const isAll = accountId === 'ALL';

      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) return;

      let query = supabase
        .from('journal_entry_lines')
        .select(`
          id,
          account_id,
          description,
          debit_amount,
          credit_amount,
          journal_entries:journal_entries!inner(entry_date, entry_number, reference, status, user_id),
          chart_accounts:chart_accounts!inner(id, code, name, normal_balance)
        `)
        .eq('journal_entries.user_id', tenantId)
        .eq('journal_entries.status', 'posted');

      if (!isAll) {
        query = query.eq('account_id', accountId);
      }

      const { data, error } = await query.order('entry_date', { ascending: true, foreignTable: 'journal_entries' });

      if (error) throw error;

      const runningByAccount = new Map<string, number>();

      const mapped: LedgerEntry[] = (data || []).map((line: any) => {
        const debit = Number(line.debit_amount || 0);
        const credit = Number(line.credit_amount || 0);
        const accId = line.account_id as string;
        const normal =
          line.chart_accounts?.normal_balance === 'credit'
            ? 'credit'
            : 'debit';

        const prev = runningByAccount.get(accId) || 0;
        const next =
          normal === 'debit'
            ? prev + debit - credit
            : prev + credit - debit;
        runningByAccount.set(accId, next);

        return {
          id: line.id,
          date: line.journal_entries.entry_date,
          description: line.description || '',
          reference: line.journal_entries.reference || '',
          debit,
          credit,
          balance: next,
          entryNumber: line.journal_entries.entry_number || '',
          accountId: accId,
          accountCode: line.chart_accounts?.code || '',
          accountName: line.chart_accounts?.name || '',
        } as LedgerEntry;
      });

      setLedgerEntries(mapped);
    } catch (error) {
      console.error('Error loading ledger entries:', error);
      setLedgerEntries([]);
    } finally {
      setLoading(false);
    }
  };

  const downloadExcel = async () => {
    try {
      if (!selectedAccount) {
        alert('Por favor seleccione una cuenta primero');
        return;
      }
      if (filteredLedgerEntries.length === 0) {
        alert('No hay movimientos para exportar');
        return;
      }

      const companyName =
        (companyInfo as any)?.name ||
        (companyInfo as any)?.company_name ||
        'ContaBi';

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Mayor General');

      const headers = [
        { title: 'Asiento', width: 15 },
        { title: 'Tipo Doc.', width: 20 },
        { title: 'Fecha', width: 12 },
        { title: 'Descripción', width: 40 },
        { title: 'Débito', width: 15 },
        { title: 'Crédito', width: 15 },
        { title: 'Balance', width: 15 },
      ];

      let currentRow = 1;
      const totalColumns = headers.length;

      ws.mergeCells(currentRow, 1, currentRow, totalColumns);
      const companyCell = ws.getCell(currentRow, 1);
      companyCell.value = companyName;
      companyCell.font = { bold: true, size: 14 };
      companyCell.alignment = { horizontal: 'center', vertical: 'middle' };
      currentRow++;

      ws.mergeCells(currentRow, 1, currentRow, totalColumns);
      const titleCell = ws.getCell(currentRow, 1);
      titleCell.value = 'Mayor General';
      titleCell.font = { bold: true, size: 16 };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      currentRow++;

      ws.mergeCells(currentRow, 1, currentRow, totalColumns);
      const accountCell = ws.getCell(currentRow, 1);
      accountCell.value = `Cuenta: ${selectedAccount.code} - ${selectedAccount.name}`;
      accountCell.alignment = { horizontal: 'center', vertical: 'middle' };
      currentRow++;

      if (dateFrom || dateTo) {
        ws.mergeCells(currentRow, 1, currentRow, totalColumns);
        const periodCell = ws.getCell(currentRow, 1);
        periodCell.value = `Período: ${dateFrom ? formatDate(dateFrom) : 'Inicio'} - ${dateTo ? formatDate(dateTo) : 'Fin'}`;
        periodCell.alignment = { horizontal: 'center', vertical: 'middle' };
        currentRow++;
      }
      currentRow++;

      const headerRow = ws.getRow(currentRow);
      headers.forEach((h, idx) => {
        const cell = headerRow.getCell(idx + 1);
        cell.value = h.title;
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF008000' } };
        cell.alignment = { vertical: 'middle' };
      });
      currentRow++;

      // Balance inicial
      const initRow = ws.getRow(currentRow);
      initRow.getCell(1).value = '';
      initRow.getCell(2).value = 'Balance inicial';
      initRow.getCell(3).value = dateFrom ? formatDate(dateFrom) : 'Inicio';
      initRow.getCell(4).value = `Balance inicial - ${selectedAccount.code} ${selectedAccount.name}`;
      initRow.getCell(5).value = '';
      initRow.getCell(6).value = '';
      initRow.getCell(7).value = openingBalance;
      currentRow++;

      for (const e of filteredLedgerEntries) {
        const dataRow = ws.getRow(currentRow);
        dataRow.getCell(1).value = e.entryNumber;
        dataRow.getCell(2).value = getEntryDocumentType(e);
        dataRow.getCell(3).value = formatDate(e.date);
        dataRow.getCell(4).value = e.description || '';
        dataRow.getCell(5).value = e.debit > 0 ? e.debit : '';
        dataRow.getCell(6).value = e.credit > 0 ? e.credit : '';
        dataRow.getCell(7).value = e.balance;
        currentRow++;
      }

      headers.forEach((h, idx) => {
        ws.getColumn(idx + 1).width = h.width;
      });

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const fileName = `mayor_general_${selectedAccount.code}_${new Date().toISOString().split('T')[0]}.xlsx`;
      saveAs(blob, fileName);
      
    } catch (error) {
      console.error('Error al exportar a Excel:', error);
      alert('Error al generar el archivo Excel. Por favor, intente nuevamente.');
    }
  };

  const filteredAccounts = accounts.filter(account => {
    const matchesSearch = account.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         account.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = accountTypeFilter === 'all' || account.type === accountTypeFilter;
    return matchesSearch && matchesType;
  });

  const accountTypesMap = {
    asset: 'Activo',
    liability: 'Pasivo',
    equity: 'Patrimonio',
    income: 'Ingreso',
    expense: 'Gasto'
  };

  const getAccountTypeName = (type: string) => {
    return accountTypesMap[type as keyof typeof accountTypesMap] || type;
  };

  const getAccountTypeColor = (type: string) => {
    const colors = {
      asset: 'bg-blue-100 text-blue-800',
      liability: 'bg-red-100 text-red-800',
      equity: 'bg-green-100 text-green-800',
      income: 'bg-purple-100 text-purple-800',
      expense: 'bg-orange-100 text-orange-800'
    };
    return colors[type as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const getBalanceColor = (balance: number, normalBalance: string) => {
    const isPositive = balance >= 0;
    const isNormal = (normalBalance === 'debit' && isPositive) || (normalBalance === 'credit' && !isPositive);
    return isNormal ? 'text-green-600' : 'text-red-600';
  };

  const fiscalYears = Array.from(new Set(periods.map((p) => p.fiscal_year))).sort(
    (a, b) => Number(b) - Number(a)
  );

  const visiblePeriods = periods.filter(
    (p) => !selectedFiscalYear || p.fiscal_year === selectedFiscalYear
  );

  const handlePeriodChange = (periodId: string) => {
    setSelectedPeriodId(periodId);
    const period = periods.find((p) => p.id === periodId);
    if (period) {
      setDateFrom(period.start_date.slice(0, 10));
      setDateTo(period.end_date.slice(0, 10));
    }
  };

  const filteredByDate = ledgerEntries.filter((entry) => {
    const entryDate = entry.date;
    const matchesFrom = !dateFrom || entryDate >= dateFrom;
    const matchesTo = !dateTo || entryDate <= dateTo;
    return matchesFrom && matchesTo;
  });

  const filteredByDocumentType = filteredByDate.filter((entry) => {
    if (documentTypeFilter.length === 0) return true;
    const type = getEntryDocumentType(entry);
    return documentTypeFilter.includes(type);
  });

  const filteredLedgerEntries = filteredByDocumentType;

  let openingBalance = 0;
  if (dateFrom) {
    for (const entry of ledgerEntries) {
      if (entry.date < dateFrom) {
        openingBalance = entry.balance;
      } else {
        break;
      }
    }
  }

  const isAllAccounts = selectedAccount?.id === 'ALL';
  const groupedAll = (() => {
    if (!isAllAccounts) return [] as Array<{ accountId: string; accountCode: string; accountName: string; opening: number; lines: LedgerEntry[]; totals: { debit: number; credit: number; final: number } }>;
    const byAccountIds = Array.from(new Set(ledgerEntries.map(e => e.accountId || ''))).filter(Boolean) as string[];
    const openingMap = new Map<string, number>();
    if (dateFrom) {
      for (const accId of byAccountIds) {
        const entries = ledgerEntries.filter(e => e.accountId === accId).sort((a,b)=> (a.date<b.date? -1 : a.date>b.date? 1 : 0));
        let lastBal = 0;
        for (const e of entries) {
          if (e.date < dateFrom) lastBal = e.balance; else break;
        }
        openingMap.set(accId, lastBal);
      }
    }

    const groups: Array<{ accountId: string; accountCode: string; accountName: string; opening: number; lines: LedgerEntry[]; totals: { debit: number; credit: number; final: number } }> = [];
    for (const accId of byAccountIds) {
      const accLines = filteredLedgerEntries.filter(e => e.accountId === accId);
      if (accLines.length === 0 && !dateFrom) continue;
      const meta = ledgerEntries.find(e => e.accountId === accId);
      let running = openingMap.get(accId) || 0;
      const recomputed = accLines.map(l => {
        running = running + (l.debit || 0) - (l.credit || 0);
        return { ...l, balance: running } as LedgerEntry;
      });
      const debit = accLines.reduce((s,l)=> s + (l.debit||0), 0);
      const credit = accLines.reduce((s,l)=> s + (l.credit||0), 0);
      const final = recomputed.length>0 ? recomputed[recomputed.length-1].balance : (openingMap.get(accId) || 0);
      groups.push({
        accountId: accId,
        accountCode: meta?.accountCode || '',
        accountName: meta?.accountName || '',
        opening: openingMap.get(accId) || 0,
        lines: recomputed,
        totals: { debit, credit, final }
      });
    }
    groups.sort((a,b)=> (a.accountCode||'').localeCompare(b.accountCode||''));
    return groups;
  })();

  const totalDebits = filteredLedgerEntries.reduce(
    (sum, entry) => sum + entry.debit,
    0
  );
  const totalCredits = filteredLedgerEntries.reduce(
    (sum, entry) => sum + entry.credit,
    0
  );
  const finalBalance =
    filteredLedgerEntries.length > 0
      ? filteredLedgerEntries[filteredLedgerEntries.length - 1].balance
      : openingBalance;

  const documentTypes = Array.from(
    new Set(ledgerEntries.map((entry) => getEntryDocumentType(entry)))
  ).sort();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const companyNameForPrint =
    (companyInfo as any)?.name ||
    (companyInfo as any)?.company_name ||
    '';

  return (
    <div className="p-6 max-w-7xl mx-auto bg-gradient-to-br from-[#f6f1e3] to-[#ebe5d5] min-h-screen">
      {/* Estilos de impresión */}
      <style dangerouslySetInnerHTML={{ __html: printStyles }} />

      {/* Header with back button */}
      <div className="flex items-center justify-between mb-6 print:hidden">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/accounting')}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <i className="ri-arrow-left-line"></i>
            Back to Accounting
          </button>
          <div>
            <h1 className="text-2xl font-bold text-[#2f3e1e] drop-shadow-sm">General Ledger</h1>
            <p className="text-gray-600">Account movements</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={downloadExcel}
            className="flex items-center gap-2 px-4 py-2 text-white rounded-lg shadow-sm"
            style={{ backgroundColor: theme.primary }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = theme.primaryHover; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = theme.primary; }}
          >
            <i className="ri-file-excel-2-line"></i>
            Excel
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 text-white rounded-lg shadow-sm"
            style={{ backgroundColor: theme.accent }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = theme.primaryHover; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = theme.accent; }}
          >
            <i className="ri-file-pdf-line"></i>
            PDF
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8 print:hidden">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-2 rounded-lg" style={{ backgroundColor: theme.muted }}>
              <i className="ri-safe-line text-2xl" style={{ color: theme.softText }}></i>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Assets</p>
              <p className="text-xl font-bold text-gray-900">
                {accounts.filter(acc => acc.type === 'asset').length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-2 rounded-lg" style={{ backgroundColor: theme.muted }}>
              <i className="ri-bank-line text-2xl" style={{ color: theme.primary }}></i>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Liabilities</p>
              <p className="text-xl font-bold text-gray-900">
                {accounts.filter(acc => acc.type === 'liability').length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-2 rounded-lg" style={{ backgroundColor: theme.muted }}>
              <i className="ri-funds-line text-2xl" style={{ color: theme.primary }}></i>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Equity</p>
              <p className="text-xl font-bold text-gray-900">
                {accounts.filter(acc => acc.type === 'equity').length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-2 rounded-lg" style={{ backgroundColor: theme.muted }}>
              <i className="ri-money-dollar-circle-line text-2xl" style={{ color: theme.softText }}></i>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Income</p>
              <p className="text-xl font-bold text-gray-900">
                {accounts.filter(acc => acc.type === 'income').length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-2 rounded-lg" style={{ backgroundColor: theme.muted }}>
              <i className="ri-shopping-cart-line text-2xl" style={{ color: theme.softText }}></i>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Expenses</p>
              <p className="text-xl font-bold text-gray-900">
                {accounts.filter(acc => acc.type === 'expense').length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de selección de cuentas */}
      {showAccountSelector && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center print:hidden">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Seleccionar Cuenta</h2>
              <button
                onClick={() => setShowAccountSelector(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <i className="ri-close-line text-2xl"></i>
              </button>
            </div>
            <div className="p-4 border-b border-gray-200">
              <div className="space-y-3">
                <div className="relative">
                  <i className="ri-search-line absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                  <input
                    type="text"
                    placeholder="Buscar cuenta..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>
                <select
                  value={accountTypeFilter}
                  onChange={(e) => setAccountTypeFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                >
                  <option value="all">Todos los tipos</option>
                  <option value="asset">Activos</option>
                  <option value="liability">Pasivos</option>
                  <option value="equity">Patrimonio</option>
                  <option value="income">Ingresos</option>
                  <option value="expense">Gastos</option>
                </select>
              </div>
            </div>
            <div className="border-b border-gray-200 px-4 py-3 flex items-center justify-between bg-gray-50">
              <div>
                <p className="text-sm font-medium text-gray-700">Ver todas las cuentas</p>
                <p className="text-xs text-gray-500">Muestra el mayor general combinado</p>
              </div>
              <button
                onClick={() => {
                  setSelectedAccount({
                    id: 'ALL',
                    code: 'TODAS',
                    name: 'Todas las cuentas',
                    type: 'all',
                    balance: 0,
                    normalBalance: 'debit',
                  } as Account);
                  setShowAccountSelector(false);
                }}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
              >
                Ver todas
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {filteredAccounts.map((account) => (
                <div
                  key={account.id}
                  onClick={() => {
                    setSelectedAccount(account);
                    setShowAccountSelector(false);
                  }}
                  className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${
                    selectedAccount?.id === account.id ? 'bg-blue-50 border-blue-200' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 text-sm">
                        {account.code} - {account.name}
                      </div>
                      <div className="flex items-center mt-1">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getAccountTypeColor(account.type)}`}>
                          {getAccountTypeName(account.type)}
                        </span>
                      </div>
                    </div>
                    <div className="text-right ml-4">
                      <div className={`text-sm font-medium ${getBalanceColor(account.balance, account.normalBalance)}`}>
                        {formatAmount(Math.abs(account.balance))}
                      </div>
                      <div className={`text-xs ${account.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {account.normalBalance === 'debit' ? 'Débito' : 'Crédito'}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6">
        {/* Ledger Details - Pantalla completa */}
        <div className="print:col-span-3">
          {selectedAccount ? (
            <div className="bg-white rounded-lg shadow">
              <div className="p-4 border-b border-gray-200 print:hidden">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setShowAccountSelector(true)}
                      className="flex items-center gap-2 px-4 py-2 text-white rounded-lg shadow-sm"
                      style={{ backgroundColor: theme.primary }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = theme.primaryHover; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = theme.primary; }}
                    >
                      <i className="ri-list-check"></i>
                      Change Account
                    </button>
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">
                        {selectedAccount.id === 'ALL'
                          ? 'General Ledger - All Accounts'
                          : `${selectedAccount.code} - ${selectedAccount.name}`}
                      </h2>
                      <p className="text-sm text-gray-600">
                        {selectedAccount.id === 'ALL'
                          ? 'Includes all accounts'
                          : `${getAccountTypeName(selectedAccount.type)} | Normal Balance: ${
                              selectedAccount.normalBalance === 'debit' ? 'Debit' : 'Credit'
                            }`}
                      </p>
                    </div>
                  </div>
                  {selectedAccount.id !== 'ALL' && (
                    <div className="text-right">
                      <div className="text-sm text-gray-600">Current Balance</div>
                      <div
                        className={`text-xl font-bold ${getBalanceColor(
                          selectedAccount.balance,
                          selectedAccount.normalBalance,
                        )}`}
                      >
                        {formatAmount(Math.abs(selectedAccount.balance))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Compact filters */}
                <div className="grid grid-cols-2 md-grid-cols-4 lg:grid-cols-7 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Fiscal Year</label>
                    <select
                      value={selectedFiscalYear}
                      onChange={(e) => {
                        setSelectedFiscalYear(e.target.value);
                        setSelectedPeriodId('');
                      }}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-[#4b5c4b]"
                      style={{ borderColor: theme.softBorder }}
                    >
                      <option value="">All</option>
                      {fiscalYears.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Period</label>
                    <select
                      value={selectedPeriodId}
                      onChange={(e) => handlePeriodChange(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-[#4b5c4b]"
                      style={{ borderColor: theme.softBorder }}
                    >
                      <option value="">All</option>
                      {visiblePeriods.map((period) => (
                        <option key={period.id} value={period.id}>
                          {period.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Document Type</label>
                    <select
                      multiple
                      value={documentTypeFilter}
                      onChange={(e) => {
                        const options = Array.from(e.target.selectedOptions).map((option) => option.value);
                        setDocumentTypeFilter(options);
                      }}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-[#4b5c4b]"
                      style={{ borderColor: theme.softBorder }}
                    >
                      {documentTypes.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">From</label>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-[#4b5c4b]"
                      style={{ borderColor: theme.softBorder }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">To</label>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-[#4b5c4b]"
                      style={{ borderColor: theme.softBorder }}
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      onClick={() => {
                        setDateFrom('');
                        setDateTo('');
                        setSelectedFiscalYear('');
                        setSelectedPeriodId('');
                        setDocumentTypeFilter([]);
                      }}
                      className="w-full px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900 border rounded hover:bg-gray-50 transition-colors"
                      style={{ borderColor: theme.softBorder }}
                    >
                      Clear
                    </button>
                  </div>
                  <div className="flex items-end">
                    <button
                      onClick={downloadExcel}
                      className="w-full px-3 py-1.5 text-xs text-white rounded shadow-sm transition-colors"
                      style={{ backgroundColor: theme.primary }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = theme.primaryHover; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = theme.primary; }}
                    >
                      <i className="ri-file-excel-2-line"></i> Excel
                    </button>
                  </div>
                </div>
              </div>

              {/* Ledger Entries Table */}
              <div id="printable-ledger">
                {/* Título para impresión */}
                {companyNameForPrint && (
                  <div className="hidden print:block print-title">{companyNameForPrint}</div>
                )}
                <div className="hidden print:block print-title">MAYOR GENERAL</div>
                {selectedAccount && (
                  <div className="hidden print:block print-account">
                    Cuenta: {selectedAccount.code} - {selectedAccount.name}
                    {(dateFrom || dateTo) && (
                      <div className="text-xs mt-2">
                        Período: {dateFrom ? formatDate(dateFrom) : 'Inicio'} -{' '}
                        {dateTo ? formatDate(dateTo) : 'Fin'}
                      </div>
                    )}
                  </div>
                )}
                <div className="overflow-x-auto">
                  {!isAllAccounts ? (
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Asiento</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Documento</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descripción</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Débito</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Crédito</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Balance</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {ledgerEntries.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                              <div className="flex flex-col items-center">
                                <i className="ri-file-list-line text-4xl text-gray-300 mb-2"></i>
                                <p>No hay movimientos para esta cuenta en el período seleccionado</p>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          <>
                            <tr className="bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900"></td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">Balance inicial</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900"></td>
                              <td className="px-6 py-4 text-sm text-gray-900"></td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">-</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">-</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{formatAmount(Math.abs(openingBalance))}</td>
                            </tr>
                            {filteredLedgerEntries.length > 0 ? (
                              filteredLedgerEntries.map((entry) => (
                                <tr key={entry.id} className="hover:bg-gray-50">
                                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                    <button
                                      onClick={() => { navigate(`/accounting/general-journal?entry=${entry.entryNumber}`); }}
                                      className="text-blue-600 hover:text-blue-900 hover:underline"
                                      title="Ver/Editar asiento"
                                    >
                                      {entry.entryNumber}
                                    </button>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{getEntryDocumentType(entry)}</td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatDate(entry.date)}</td>
                                  <td className="px-6 py-4 text-sm text-gray-900">{entry.description}</td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{entry.debit > 0 ? `${formatAmount(entry.debit)}` : '-'}</td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{entry.credit > 0 ? `${formatAmount(entry.credit)}` : '-'}</td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{formatAmount(Math.abs(entry.balance))}</td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                                  <div className="flex flex-col items-center">
                                    <i className="ri-file-list-line text-4xl text-gray-300 mb-2"></i>
                                    <p>No hay movimientos para esta cuenta en el período seleccionado</p>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        )}
                      </tbody>
                      {ledgerEntries.length > 0 && (
                        <tfoot className="bg-gray-50">
                          <tr>
                            <td colSpan={4} className="px-6 py-3 text-right font-medium text-gray-900">Totales:</td>
                            <td className="px-6 py-3 font-bold text-gray-900">{formatAmount(totalDebits)}</td>
                            <td className="px-6 py-3 font-bold text-gray-900">{formatAmount(totalCredits)}</td>
                            <td className="px-6 py-3 font-bold text-gray-900">{formatAmount(Math.abs(finalBalance))}</td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  ) : (
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Asiento</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Documento</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descripción</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Débito</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Crédito</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Balance</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {groupedAll.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                              <div className="flex flex-col items-center">
                                <i className="ri-file-list-line text-4xl text-gray-300 mb-2"></i>
                                <p>No hay movimientos en el período seleccionado</p>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          groupedAll.map(group => (
                            <Fragment key={group.accountId}>
                              <tr key={`hdr-${group.accountId}`} className="bg-gray-100">
                                <td colSpan={7} className="px-6 py-3 text-sm font-semibold text-gray-900">
                                  {group.accountCode} - {group.accountName}
                                </td>
                              </tr>
                              <tr className="bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900"></td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">Saldo inicial</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900"></td>
                                <td className="px-6 py-4 text-sm text-gray-900"></td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">-</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">-</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{formatAmount(Math.abs(group.opening))}</td>
                              </tr>
                              {group.lines.length > 0 ? (
                                group.lines.map(line => (
                                  <tr key={line.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                      <button
                                        onClick={() => { navigate(`/accounting/general-journal?entry=${line.entryNumber}`); }}
                                        className="text-blue-600 hover:text-blue-900 hover:underline"
                                        title="Ver/Editar asiento"
                                      >
                                        {line.entryNumber}
                                      </button>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{getEntryDocumentType(line)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatDate(line.date)}</td>
                                    <td className="px-6 py-4 text-sm text-gray-900">{line.description}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{line.debit > 0 ? `${formatAmount(line.debit)}` : '-'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{line.credit > 0 ? `${formatAmount(line.credit)}` : '-'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{formatAmount(Math.abs(line.balance))}</td>
                                  </tr>
                                ))
                              ) : (
                                <tr>
                                  <td colSpan={7} className="px-6 py-4 text-sm text-gray-500">Sin movimientos en el período.</td>
                                </tr>
                              )}
                              <tr className="bg-gray-100">
                                <td colSpan={4} className="px-6 py-3 text-right font-medium text-gray-900">Totales de la cuenta:</td>
                                <td className="px-6 py-3 font-bold text-gray-900">{formatAmount(group.totals.debit)}</td>
                                <td className="px-6 py-3 font-bold text-gray-900">{formatAmount(group.totals.credit)}</td>
                                <td className="px-6 py-3 font-bold text-gray-900">{formatAmount(Math.abs(group.totals.final))}</td>
                              </tr>
                            </Fragment>
                          ))
                        )}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* Summary Stats */}
              {ledgerEntries.length > 0 && (
                <div className="p-6 border-t border-gray-200 bg-gray-50 print:hidden">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="text-center">
                      <div className="text-sm text-gray-600">Total Movimientos</div>
                      <div className="text-lg font-bold text-gray-900">{filteredLedgerEntries.length}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-sm text-gray-600">Total Débitos</div>
                      <div className="text-lg font-bold text-green-600">
                        {formatAmount(totalDebits)}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-sm text-gray-600">Total Créditos</div>
                      <div className="text-lg font-bold text-red-600">
                        {formatAmount(totalCredits)}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <i className="ri-file-list-3-line text-6xl text-gray-300 mb-4"></i>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Select an Account</h3>
              <p className="text-gray-600 mb-4">
                Click the button to choose an account from the catalog and view its general ledger.
              </p>
              <button
                onClick={() => setShowAccountSelector(true)}
                className="px-6 py-3 text-white rounded-lg shadow-sm transition-colors"
                style={{ backgroundColor: theme.primary }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = theme.primaryHover; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = theme.primary; }}
              >
                <i className="ri-list-check mr-2"></i>
                Select Account
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GeneralLedgerPage;
