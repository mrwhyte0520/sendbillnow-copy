import { useEffect, useState, type FC } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../hooks/useAuth';
import { supabase } from '../../../lib/supabase';
import { financialReportsService, settingsService } from '../../../services/database';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { formatMoney } from '../../../utils/numberFormat';
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
    #printable-trial-balance, #printable-trial-balance * { visibility: visible; }
    #printable-trial-balance { position: absolute; left: 0; top: 0; width: 100%; }
    body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .print-title { text-align: center; font-size: 18pt; font-weight: bold; margin-bottom: 10px; }
    .print-period { text-align: center; font-size: 12pt; margin-bottom: 20px; }
    table { page-break-inside: avoid; font-size: 9pt; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
  }
`;

interface AccountingPeriod {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  fiscal_year: string;
  status: string;
}

interface TrialBalanceRow {
  account_id: string;
  code: string;
  name: string;
  prevDebit: number;
  prevCredit: number;
  movDebit: number;
  movCredit: number;
  finalDebit: number;
  finalCredit: number;
  normalBalance: string;
  level?: number | null;
  allowPosting?: boolean | null;
}

const TrialBalancePage: FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [rows, setRows] = useState<TrialBalanceRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [cutoffDate, setCutoffDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [manualStartDate, setManualStartDate] = useState<string>('');
  const [selectedFiscalYear, setSelectedFiscalYear] = useState('');
  const [selectedPeriodIds, setSelectedPeriodIds] = useState<string[]>([]);
  const [mode, setMode] = useState<'detail' | 'summary'>('detail');

  const [fromDateLabel, setFromDateLabel] = useState('');
  const [toDateLabel, setToDateLabel] = useState('');
  const [companyInfo, setCompanyInfo] = useState<any | null>(null);

  useEffect(() => {
    if (user) {
      void loadPeriods();
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      void loadTrialBalance();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, cutoffDate, manualStartDate, selectedFiscalYear, selectedPeriodIds, mode]);

  useEffect(() => {
    const loadCompany = async () => {
      try {
        const info = await settingsService.getCompanyInfo();
        setCompanyInfo(info);
      } catch (error) {
        console.error('Error cargando información de la empresa para Balanza de Comprobación:', error);
      }
    };

    loadCompany();
  }, []);

  const loadPeriods = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('accounting_periods')
        .select('*')
        .eq('user_id', user.id)
        .order('fiscal_year', { ascending: false })
        .order('start_date', { ascending: true });

      if (error) throw error;
      setPeriods(data || []);
    } catch (err) {
      console.error('Error loading accounting periods for trial balance:', err);
      setPeriods([]);
    }
  };

  const fiscalYears = Array.from(new Set(periods.map((p) => p.fiscal_year))).sort(
    (a, b) => Number(b) - Number(a)
  );

  const visiblePeriods = periods.filter(
    (p) => !selectedFiscalYear || p.fiscal_year === selectedFiscalYear
  );

  const computeDateRanges = () => {
    const today = new Date().toISOString().slice(0, 10);
    const effectiveCutoff = cutoffDate || today;

    let fromDate = effectiveCutoff;
    let toDate = effectiveCutoff;

    // Si hay períodos seleccionados (uno o más)
    if (selectedPeriodIds.length > 0) {
      const selectedPeriods = periods.filter((p) => selectedPeriodIds.includes(p.id));
      if (selectedPeriods.length > 0) {
        // Ordenar por fecha de inicio
        selectedPeriods.sort((a, b) => a.start_date.localeCompare(b.start_date));
        const firstPeriod = selectedPeriods[0];
        const lastPeriod = selectedPeriods[selectedPeriods.length - 1];
        
        fromDate = firstPeriod.start_date.slice(0, 10);
        const lastEnd = lastPeriod.end_date.slice(0, 10);
        // Asegurar que la fecha de corte esté dentro del rango
        toDate = effectiveCutoff < lastEnd ? effectiveCutoff : lastEnd;
      }
    }
    // Si hay año fiscal seleccionado pero no períodos específicos
    else if (selectedFiscalYear) {
      fromDate = manualStartDate || `${selectedFiscalYear}-01-01`;
      toDate = effectiveCutoff;
    }
    // Sin filtros: usar año actual
    else {
      const year = effectiveCutoff.slice(0, 4);
      fromDate = manualStartDate || `${year}-01-01`;
      toDate = effectiveCutoff;
    }

    // Rango anterior: desde muy atrás hasta el día antes de fromDate
    const fromDateObj = new Date(fromDate);
    const prevToObj = new Date(fromDateObj.getTime() - 24 * 60 * 60 * 1000);
    const prevToDate =
      prevToObj.getFullYear() <= 1900
        ? null
        : prevToObj.toISOString().slice(0, 10);

    setFromDateLabel(fromDate);
    setToDateLabel(toDate);

    return { fromDate, toDate, prevToDate };
  };

  const loadTrialBalance = async () => {
    if (!user) return;

    try {
      setLoading(true);

      const { fromDate, toDate, prevToDate } = computeDateRanges();

      // Obtener asientos de apertura para excluirlos de los movimientos
      const { data: openingEntries } = await supabase
        .from('journal_entries')
        .select('id')
        .eq('user_id', user.id)
        .like('entry_number', 'OPEN-%')
        .gte('entry_date', fromDate)
        .lte('entry_date', toDate);

      const openingEntryIds = new Set((openingEntries || []).map(e => e.id));

      const [prevTrial, periodTrial, periodMovements] = await Promise.all([
        prevToDate
          ? financialReportsService.getTrialBalance(
              user.id,
              '1900-01-01',
              prevToDate
            )
          : Promise.resolve([]),
        financialReportsService.getTrialBalance(user.id, fromDate, toDate),
        // Obtener movimientos del período excluyendo asientos de apertura
        supabase
          .from('journal_entry_lines')
          .select(`
            account_id,
            debit_amount,
            credit_amount,
            journal_entries!inner(id, user_id, entry_number)
          `)
          .eq('journal_entries.user_id', user.id)
          .gte('journal_entries.entry_date', fromDate)
          .lte('journal_entries.entry_date', toDate)
          .then(({ data }) => data || [])
      ]);

      type InternalRow = TrialBalanceRow & {
        prevBalance: number;
        periodBalance: number;
      };

      const byAccount: Record<string, InternalRow> = {};

      const ensureRow = (acc: any): InternalRow => {
        const accountId = acc.account_id as string;
        if (!byAccount[accountId]) {
          byAccount[accountId] = {
            account_id: accountId,
            code: acc.code || '',
            name: acc.name || '',
            prevDebit: 0,
            prevCredit: 0,
            movDebit: 0,
            movCredit: 0,
            finalDebit: 0,
            finalCredit: 0,
            normalBalance: acc.normal_balance || 'debit',
            level: acc.level ?? null,
            allowPosting: acc.allow_posting ?? null,
            prevBalance: 0,
            periodBalance: 0,
          };
        }
        return byAccount[accountId];
      };

      (prevTrial || []).forEach((acc: any) => {
        const row = ensureRow(acc);
        const normal = acc.normal_balance || row.normalBalance || 'debit';
        row.normalBalance = normal;

        const balancePrev = Number(acc.balance) || 0;
        row.prevBalance += balancePrev;

        let debitPrev = 0;
        let creditPrev = 0;
        if (balancePrev >= 0) {
          if (normal === 'credit') {
            creditPrev = balancePrev;
          } else {
            debitPrev = balancePrev;
          }
        } else {
          const abs = Math.abs(balancePrev);
          if (normal === 'credit') {
            debitPrev = abs;
          } else {
            creditPrev = abs;
          }
        }

        row.prevDebit += debitPrev;
        row.prevCredit += creditPrev;
      });

      // Procesar movimientos del período excluyendo transacciones del asiento de apertura
      const movByAccount: Record<string, { debit: number; credit: number }> = {};
      
      periodMovements.forEach((line: any) => {
        const entryId = line.journal_entries?.id;
        // Excluir transacciones del asiento de apertura
        if (openingEntryIds.has(entryId)) return;
        
        const accountId = line.account_id;
        if (!movByAccount[accountId]) {
          movByAccount[accountId] = { debit: 0, credit: 0 };
        }
        movByAccount[accountId].debit += Number(line.debit_amount) || 0;
        movByAccount[accountId].credit += Number(line.credit_amount) || 0;
      });

      // Aplicar los movimientos (sin ED) a las filas
      (periodTrial || []).forEach((acc: any) => {
        const row = ensureRow(acc);
        const normal = acc.normal_balance || row.normalBalance || 'debit';
        row.normalBalance = normal;

        // Usar solo los movimientos sin ED
        const accountId = acc.account_id;
        const movements = movByAccount[accountId] || { debit: 0, credit: 0 };
        row.movDebit = movements.debit;
        row.movCredit = movements.credit;

        const balancePeriod = Number(acc.balance) || 0;
        row.periodBalance = balancePeriod;
      });

      let result: InternalRow[] = Object.values(byAccount);

      if (mode === 'summary') {
        result = result.filter((row) =>
          row.allowPosting === false ||
          (typeof row.level === 'number' && row.level <= 2)
        );
      }

      result.forEach((row) => {
        const prevBalance = row.prevBalance || 0;
        const periodBalance = row.periodBalance || 0;
        const finalBalance = prevBalance + periodBalance;
        const normal = row.normalBalance || 'debit';

        let finalDebit = 0;
        let finalCredit = 0;
        if (finalBalance >= 0) {
          if (normal === 'credit') {
            finalCredit = finalBalance;
          } else {
            finalDebit = finalBalance;
          }
        } else {
          const abs = Math.abs(finalBalance);
          if (normal === 'credit') {
            finalDebit = abs;
          } else {
            finalCredit = abs;
          }
        }

        row.finalDebit = finalDebit;
        row.finalCredit = finalCredit;
      });

      const sorted = result.sort((a, b) => a.code.localeCompare(b.code, 'es'));
      setRows(sorted);
    } catch (err) {
      console.error('Error loading trial balance:', err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const renderMoney = (value: number) => {
    const formatted = formatMoney(value);
    const splitAt = formatted.indexOf(' ');
    const label = splitAt > -1 ? formatted.slice(0, splitAt) : '';
    const amount = splitAt > -1 ? formatted.slice(splitAt + 1) : formatted;

    return (
      <span className="inline-flex w-full justify-end items-baseline gap-1">
        {label ? <span className="shrink-0">{label}</span> : null}
        <span className="tabular-nums">{amount}</span>
      </span>
    );
  };

  const totalPrevDebit = rows.reduce((sum, r) => sum + r.prevDebit, 0);
  const totalPrevCredit = rows.reduce((sum, r) => sum + r.prevCredit, 0);
  const totalMovDebit = rows.reduce((sum, r) => sum + r.movDebit, 0);
  const totalMovCredit = rows.reduce((sum, r) => sum + r.movCredit, 0);
  const totalFinalDebit = rows.reduce((sum, r) => sum + r.finalDebit, 0);
  const totalFinalCredit = rows.reduce((sum, r) => sum + r.finalCredit, 0);

  const handleExportExcel = async () => {
    try {
      if (!user) {
        alert('Debes iniciar sesión para exportar la balanza.');
        return;
      }

      if (rows.length === 0) {
        alert('No hay datos para exportar con los filtros actuales.');
        return;
      }

      const companyName =
        (companyInfo as any)?.name ||
        (companyInfo as any)?.company_name ||
        'ContaBi';

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Balanza de Comprobación');

      const headers = [
        { title: 'Número', width: 15 },
        { title: 'Cuenta Contable', width: 40 },
        { title: 'Saldo Ant. Débito', width: 18 },
        { title: 'Saldo Ant. Crédito', width: 18 },
        { title: 'Mov. Débito', width: 18 },
        { title: 'Mov. Crédito', width: 18 },
        { title: 'Saldo Final Débito', width: 18 },
        { title: 'Saldo Final Crédito', width: 18 },
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
      titleCell.value = 'Balanza de Comprobación';
      titleCell.font = { bold: true, size: 16 };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      currentRow++;

      if (fromDateLabel && toDateLabel) {
        ws.mergeCells(currentRow, 1, currentRow, totalColumns);
        const periodCell = ws.getCell(currentRow, 1);
        periodCell.value = `Período: ${formatDate(fromDateLabel)} al ${formatDate(toDateLabel)}`;
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

      for (const row of rows) {
        const dataRow = ws.getRow(currentRow);
        dataRow.getCell(1).value = row.code;
        dataRow.getCell(2).value = row.name;
        dataRow.getCell(3).value = row.prevDebit || 0;
        dataRow.getCell(4).value = row.prevCredit || 0;
        dataRow.getCell(5).value = row.movDebit || 0;
        dataRow.getCell(6).value = row.movCredit || 0;
        dataRow.getCell(7).value = row.finalDebit || 0;
        dataRow.getCell(8).value = row.finalCredit || 0;
        currentRow++;
      }

      // Totales
      const totalsRow = ws.getRow(currentRow);
      totalsRow.getCell(1).value = '';
      totalsRow.getCell(2).value = 'TOTALES';
      totalsRow.getCell(2).font = { bold: true };
      totalsRow.getCell(3).value = totalPrevDebit;
      totalsRow.getCell(4).value = totalPrevCredit;
      totalsRow.getCell(5).value = totalMovDebit;
      totalsRow.getCell(6).value = totalMovCredit;
      totalsRow.getCell(7).value = totalFinalDebit;
      totalsRow.getCell(8).value = totalFinalCredit;

      headers.forEach((h, idx) => {
        ws.getColumn(idx + 1).width = h.width;
      });

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const baseDate = cutoffDate || new Date().toISOString().slice(0, 10);
      saveAs(blob, `balanza_comprobacion_${baseDate}.xlsx`);
    } catch (error) {
      console.error('Error al exportar la Balanza de Comprobación:', error);
      alert('Error al generar el archivo Excel de la Balanza de Comprobación.');
    }
  };

  if (loading && rows.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div
          className="animate-spin rounded-full h-32 w-32 border-b-2"
          style={{ borderColor: theme.primary }}
        ></div>
      </div>
    );
  }

  const companyNameForPrint =
    (companyInfo as any)?.name ||
    (companyInfo as any)?.company_name ||
    '';

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Estilos de impresión */}
      <style dangerouslySetInnerHTML={{ __html: printStyles }} />

      {/* Header */}
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
            <h1 className="text-2xl font-bold text-gray-900">Trial Balance</h1>
            <p className="text-gray-600">
              Balances by account with opening balance, period movements, and ending balance
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-4 py-2 text-white rounded-lg shadow-sm transition-colors"
            style={{ backgroundColor: theme.primary }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = theme.primaryHover; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = theme.primary; }}
          >
            <i className="ri-file-excel-2-line"></i>
            Excel
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 text-white rounded-lg shadow-sm transition-colors"
            style={{ backgroundColor: theme.accent }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = theme.primaryHover; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = theme.accent; }}
          >
            <i className="ri-file-pdf-line"></i>
            PDF
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow mb-6 print:hidden">
        <div className="p-6 border-b border-gray-200 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cutoff date
              </label>
              <input
                type="date"
                value={cutoffDate}
                onChange={(e) => setCutoffDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5c4b] focus:border-transparent text-sm"
                style={{ borderColor: theme.softBorder }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start date (optional)
              </label>
              <input
                type="date"
                value={manualStartDate}
                onChange={(e) => setManualStartDate(e.target.value)}
                placeholder="Default: January 1"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5c4b] focus:border-transparent text-sm"
                style={{ borderColor: theme.softBorder }}
              />
              <p className="text-xs text-gray-500 mt-1">If not set, starts January 1 of the fiscal year.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fiscal year
              </label>
              <select
                value={selectedFiscalYear}
                onChange={(e) => {
                  setSelectedFiscalYear(e.target.value);
                  setSelectedPeriodIds([]);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5c4b] focus:border-transparent text-sm pr-8"
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Trial balance mode
              </label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as 'detail' | 'summary')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5c4b] focus:border-transparent text-sm pr-8"
                style={{ borderColor: theme.softBorder }}
              >
                <option value="detail">Detailed (all accounts)</option>
                <option value="summary">Summary (group accounts)</option>
              </select>
            </div>
          </div>

          {visiblePeriods.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Accounting periods (select one or more)
              </label>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-40 overflow-y-auto border rounded-lg p-3"
                   style={{ borderColor: theme.softBorder, backgroundColor: theme.muted }}>
                {visiblePeriods.map((period) => (
                  <label key={period.id} className="flex items-center space-x-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedPeriodIds.includes(period.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedPeriodIds([...selectedPeriodIds, period.id]);
                        } else {
                          setSelectedPeriodIds(selectedPeriodIds.filter(id => id !== period.id));
                        }
                      }}
                      className="rounded border-gray-300 focus:ring-2"
                      style={{ accentColor: theme.primary }}
                    />
                    <span className="text-gray-700">{period.name}</span>
                  </label>
                ))}
              </div>
              {selectedPeriodIds.length > 0 && (
                <button
                  onClick={() => setSelectedPeriodIds([])}
                  className="mt-2 text-xs"
                  style={{ color: theme.primary }}
                >
                  Clear selection
                </button>
              )}
            </div>
          )}

          {fromDateLabel && toDateLabel && (
            <div className="text-sm text-gray-600 rounded-lg p-3" style={{ backgroundColor: theme.muted, border: `1px solid ${theme.softBorder}` }}>
              <span className="font-medium" style={{ color: theme.softText }}>Report period:</span>{' '}
              <span className="font-semibold" style={{ color: theme.softText }}>
                {formatDate(fromDateLabel)} to {formatDate(toDateLabel)}
              </span>
              {selectedPeriodIds.length > 0 && (
                <span className="ml-2" style={{ color: theme.softText }}>
                  ({selectedPeriodIds.length} period{selectedPeriodIds.length > 1 ? 's' : ''} selected)
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div id="printable-trial-balance">
        {/* Título para impresión */}
        {companyNameForPrint && (
          <div className="hidden print:block print-title">{companyNameForPrint}</div>
        )}
        <div className="hidden print:block print-title">TRIAL BALANCE</div>
        <div className="hidden print:block print-period">
          Period: {fromDateLabel && formatDate(fromDateLabel)} to{' '}
          {toDateLabel && formatDate(toDateLabel)}
        </div>
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50" style={{ backgroundColor: theme.muted }}>
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: theme.softText }}>
                Account Number
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: theme.softText }}>
                Account Name
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: theme.softText }}>
                Opening Debit
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: theme.softText }}>
                Opening Credit
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: theme.softText }}>
                Period Debit
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: theme.softText }}>
                Period Credit
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: theme.softText }}>
                Ending Debit
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: theme.softText }}>
                Ending Credit
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                  <div className="flex flex-col items-center">
                    <i className="ri-file-list-line text-4xl text-gray-300 mb-2"></i>
                    <p>No data for the selected filters.</p>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.account_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                    {row.code}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {row.name}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                    {renderMoney(row.prevDebit)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                    {renderMoney(row.prevCredit)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                    {renderMoney(row.movDebit)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                    {renderMoney(row.movCredit)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                    {renderMoney(row.finalDebit)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                    {renderMoney(row.finalCredit)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="bg-gray-50" style={{ backgroundColor: theme.muted }}>
              <tr>
                <td className="px-4 py-3 text-right text-xs font-semibold text-gray-900" colSpan={2}>
                  Totals:
                </td>
                <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">
                  {renderMoney(totalPrevDebit)}
                </td>
                <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">
                  {renderMoney(totalPrevCredit)}
                </td>
                <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">
                  {renderMoney(totalMovDebit)}
                </td>
                <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">
                  {renderMoney(totalMovCredit)}
                </td>
                <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">
                  {renderMoney(totalFinalDebit)}
                </td>
                <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">
                  {renderMoney(totalFinalCredit)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      </div> {/* Cierre de printable-trial-balance */}
    </div>
  );
};

export default TrialBalancePage;
