import { useState, useEffect } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { supabase } from '../../../lib/supabase';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { resolveTenantId, settingsService } from '../../../services/database';
import { formatAmount } from '../../../utils/numberFormat';
import { formatDate } from '../../../utils/dateFormat';
import DateInput from '../../../components/common/DateInput';

// Estilos CSS para mejorar la impresiÃ³n
const printStyles = `
  @media print {
    @page { size: landscape; margin: 0.5cm; }
    body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .print-title { text-align: center; font-size: 18pt; font-weight: bold; margin-bottom: 10px; }
    .print-date { text-align: center; font-size: 10pt; margin-bottom: 20px; }
    table { page-break-inside: avoid; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
  }
`;

interface JournalEntry {
  id: string;
  entry_number: string;
  entry_date: string;
  description: string;
  reference: string;
  total_debit: number;
  total_credit: number;
  status: string;
  created_at: string;
  supplier_name?: string | null;
  vendor_name?: string | null;
  payee_name?: string | null;
  counterparty?: string | null;
  journal_entry_lines: Array<{
    id: string;
    account_id: string;
    debit_amount: number;
    credit_amount: number;
    description: string;
    chart_accounts: {
      code: string;
      name: string;
    };
  }>;
}

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface AccountingPeriod {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  fiscal_year: string;
  status: string;
}

const getEntryDocumentType = (entry: JournalEntry): string => {
  const num = entry.entry_number || '';
  const desc = (entry.description || '').toLowerCase();

  if (num.startsWith('ED-') || num.startsWith('JE-')) return 'Asiento manual';
  if (num.startsWith('BCG-')) return 'Cargo bancario';
  if (num.startsWith('DEP-')) return 'DepÃ³sito bancario';
  if (num.startsWith('CRD-')) return 'CrÃ©dito bancario';
  if (num.startsWith('TRF-')) return 'Transferencia bancaria';
  if (num.startsWith('CHK-')) return 'Cheque';
  if (num.startsWith('INV-MOV-')) return 'Movimiento de inventario';
  if (num.endsWith('-COGS')) return 'Costo de ventas';
  if (num.startsWith('PCF-')) return 'Fondo de caja chica';
  if (num.startsWith('PCE-')) return 'Gasto de caja chica';
  if (num.startsWith('PCT-')) return 'Reembolso de caja chica';

  if (desc.includes('factura suplidor')) return 'Factura de suplidor';
  if (desc.startsWith('factura ')) return 'Factura de venta';
  if (desc.includes('pago a proveedor')) return 'Pago a proveedor';

  return 'Otro';
};

const GeneralJournalPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState(searchParams.get('from') || '');
  const [dateTo, setDateTo] = useState(searchParams.get('to') || '');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [documentTypeFilter, setDocumentTypeFilter] = useState('all');
  const [selectedFiscalYear, setSelectedFiscalYear] = useState('');
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [companyInfo, setCompanyInfo] = useState<any | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [formData, setFormData] = useState({
    entry_date: new Date().toISOString().split('T')[0],
    description: '',
    reference: '',
    lines: [
      { account_id: '', debit_amount: 0, credit_amount: 0, description: '' },
      { account_id: '', debit_amount: 0, credit_amount: 0, description: '' }
    ]
  });

  useEffect(() => {
    loadData();
  }, [user]);

  useEffect(() => {
    const loadCompany = async () => {
      try {
        const info = await settingsService.getCompanyInfo();
        setCompanyInfo(info);
      } catch (error) {
        console.error('Error cargando informaciÃ³n de la empresa para Diario General', error);
      }
    };

    loadCompany();
  }, []);

  const loadData = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      
      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) return;
      
      const results = await Promise.allSettled([
        supabase
          .from('journal_entries')
          .select(`
            *,
            journal_entry_lines (
              *,
              chart_accounts (
                code,
                name
              )
            )
          `)
          .eq('user_id', tenantId)
          .order('entry_date', { ascending: false }),
        supabase
          .from('chart_accounts')
          .select('*')
          .eq('user_id', tenantId)
          .eq('is_active', true)
          .order('code'),
        supabase
          .from('accounting_periods')
          .select('*')
          .eq('user_id', tenantId)
          .order('start_date', { ascending: false }),
        supabase
          .from('ap_invoices')
          .select('id, supplier_id, suppliers ( name )')
          .eq('user_id', tenantId),
        supabase
          .from('supplier_payments')
          .select('id, supplier_id, suppliers ( name )')
          .eq('user_id', tenantId),
      ]);

      const [entriesRes, accountsRes, periodsRes, apInvRes, apPayRes] = results;

      const getData = (res: PromiseSettledResult<any>) =>
        res.status === 'fulfilled' ? res.value.data : [];
      const getError = (res: PromiseSettledResult<any>) =>
        res.status === 'fulfilled' ? res.value.error : res.reason;

      const entriesData = getData(entriesRes);
      const accountsData = getData(accountsRes);
      const periodsData = getData(periodsRes);
      const apInvoices = getData(apInvRes);
      const apPayments = getData(apPayRes);

      const errors = [entriesRes, accountsRes, periodsRes, apInvRes, apPayRes]
        .map(getError)
        .filter((e) => e);

      if (errors.length > 0) {
        console.error('GeneralJournal loadData errors', errors);
      }

      const supplierMap = new Map<string, string>();
      (apInvoices || []).forEach((inv: any) => {
        if (inv?.id) {
          const name = inv.suppliers?.name || '';
          supplierMap.set(String(inv.id), name);
          if (inv.supplier_id) supplierMap.set(`sup-${inv.supplier_id}`, name);
        }
      });
      (apPayments || []).forEach((p: any) => {
        if (p?.id) {
          const name = p.suppliers?.name || '';
          supplierMap.set(String(p.id), name);
          if (p.supplier_id) supplierMap.set(`sup-${p.supplier_id}`, name);
        }
      });

      const entriesWithSupplier = (entriesData || []).map((entry: any) => {
        const ref = entry?.reference ? String(entry.reference) : '';
        const supplier =
          entry.supplier_name ||
          entry.vendor_name ||
          entry.payee_name ||
          entry.counterparty ||
          supplierMap.get(ref) ||
          supplierMap.get(`sup-${entry.supplier_id || ''}`) ||
          '';
        return { ...entry, supplier_name: supplier };
      });

      setEntries(entriesWithSupplier || []);
      setAccounts(accountsData || []);
      setPeriods(periodsData || []);
    } catch (error) {
      console.error('Error loading data:', error);
      // Cargar datos de ejemplo si hay error
      loadMockData();
    } finally {
      setLoading(false);
    }
  };

  const loadMockData = () => {
    setEntries([]);
    setAccounts([]);
  };

  const handleSaveEntry = async () => {
    if (!user) return;

    // Validar que los dÃ©bitos y crÃ©ditos estÃ©n balanceados
    const totalDebit = formData.lines.reduce((sum, line) => sum + (line.debit_amount || 0), 0);
    const totalCredit = formData.lines.reduce((sum, line) => sum + (line.credit_amount || 0), 0);

    // Validar que ninguna lÃ­nea tenga simultÃ¡neamente dÃ©bito y crÃ©dito
    const invalidLines = formData.lines.filter(line =>
      (line.debit_amount || 0) > 0 && (line.credit_amount || 0) > 0
    );

    if (invalidLines.length > 0) {
      alert('Cada lÃ­nea debe tener solo dÃ©bito o solo crÃ©dito, no ambos.');
      return;
    }

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      alert('Los dÃ©bitos y crÃ©ditos deben estar balanceados');
      return;
    }

    if (totalDebit === 0 || totalCredit === 0) {
      alert('Debe ingresar al menos un dÃ©bito y un crÃ©dito');
      return;
    }

    const validLines = formData.lines.filter(line =>
      line.account_id && ((line.debit_amount || 0) > 0 || (line.credit_amount || 0) > 0)
    );

    console.log('=== DEBUG JOURNAL ENTRY ==');
    console.log('All lines:', formData.lines);
    console.log('Valid lines to save:', validLines);
    console.log('Total Debit:', totalDebit, 'Total Credit:', totalCredit);

    const tenantId = await resolveTenantId(user.id);
    if (!tenantId) {
      alert('Error: No se pudo resolver el tenant');
      return;
    }

    try {
      if (isEditing && editingEntryId) {
        // Actualizar asiento existente
        const { data: updatedEntry, error: entryError } = await supabase
          .from('journal_entries')
          .update({
            entry_date: formData.entry_date,
            description: formData.description,
            reference: formData.reference,
            total_debit: totalDebit,
            total_credit: totalCredit,
          })
          .eq('id', editingEntryId)
          .eq('user_id', tenantId)
          .select()
          .single();

        if (entryError) throw entryError;

        // Reemplazar lÃ­neas del asiento
        const { error: deleteError } = await supabase
          .from('journal_entry_lines')
          .delete()
          .eq('journal_entry_id', editingEntryId);

        if (deleteError) throw deleteError;

        const linesData = validLines.map((line, index) => ({
          journal_entry_id: updatedEntry.id,
          account_id: line.account_id,
          debit_amount: Number(line.debit_amount) || 0,
          credit_amount: Number(line.credit_amount) || 0,
          description: line.description,
          line_number: index + 1,
        }));

        console.log('Lines data to update:', linesData);

        const { error: linesError } = await supabase
          .from('journal_entry_lines')
          .insert(linesData);

        if (linesError) throw linesError;
      } else {
        // Crear nuevo asiento
        const entryDate = formData.entry_date || new Date().toISOString().split('T')[0];
        const [year, month] = entryDate.split('-');
        const prefix = `ED-${year}${month}`;

        const { data: existingEntries, error: existingEntriesError } = await supabase
          .from('journal_entries')
          .select('entry_number')
          .eq('user_id', tenantId)
          .like('entry_number', `${prefix}%`)
          .order('entry_number', { ascending: false })
          .limit(1);

        if (existingEntriesError) {
          console.error('Error generating journal entry number:', existingEntriesError);
          alert('No se pudo generar el nÃºmero de asiento. Intente nuevamente.');
          return;
        }

        let nextSeq = 1;
        if (existingEntries && existingEntries.length > 0) {
          const lastNumber = existingEntries[0].entry_number || '';
          const seqStr = lastNumber.slice(prefix.length);
          const parsed = parseInt(seqStr, 10);
          if (!Number.isNaN(parsed)) {
            nextSeq = parsed + 1;
          }
        }

        const entryNumber = `${prefix}${nextSeq.toString().padStart(2, '0')}`;

        const entryData = {
          user_id: tenantId,
          entry_number: entryNumber,
          entry_date: formData.entry_date,
          description: formData.description,
          reference: formData.reference,
          total_debit: totalDebit,
          total_credit: totalCredit,
          status: 'posted'
        };

        const { data: entry, error: entryError } = await supabase
          .from('journal_entries')
          .insert([entryData])
          .select()
          .single();

        if (entryError) throw entryError;

        const linesData = validLines.map((line, index) => ({
          journal_entry_id: entry.id,
          account_id: line.account_id,
          debit_amount: Number(line.debit_amount) || 0,
          credit_amount: Number(line.credit_amount) || 0,
          description: line.description,
          line_number: index + 1,
        }));

        console.log('Lines data to insert:', linesData);

        const { error: linesError } = await supabase
          .from('journal_entry_lines')
          .insert(linesData);

        if (linesError) throw linesError;
      }

      // Resetear formulario
      setFormData({
        entry_date: new Date().toISOString().split('T')[0],
        description: '',
        reference: '',
        lines: [
          { account_id: '', debit_amount: 0, credit_amount: 0, description: '' },
          { account_id: '', debit_amount: 0, credit_amount: 0, description: '' }
        ],
      });
      setIsEditing(false);
      setEditingEntryId(null);
      setShowCreateModal(false);
      alert('Asiento contable guardado exitosamente');
      loadData();
    } catch (error) {
      console.error('Error creating entry:', error);
      alert('Error al crear el asiento contable');
    }
  };

  const handleDeleteEntry = async (entryId: string) => {
    if (!confirm('Â¿EstÃ¡ seguro de que desea anular este asiento? Esta acciÃ³n no se puede deshacer.')) {
      return;
    }

    try {
      if (!user) return;

      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) {
        alert('Error: No se pudo resolver el tenant');
        return;
      }

      const { error } = await supabase
        .from('journal_entries')
        .update({ status: 'reversed' })
        .eq('id', entryId)
        .eq('user_id', tenantId);

      if (error) throw error;
      setEntries((prev) => prev.map((entry) => (entry.id === entryId ? { ...entry, status: 'reversed' } : entry)));
      alert('Asiento anulado exitosamente');
    } catch (error) {
      console.error('Error deleting entry:', error);
      alert('Error al anular el asiento');
    }
  };

  const addLine = () => {
    setFormData((prev) => ({
      ...prev,
      lines: [...prev.lines, { account_id: '', debit_amount: 0, credit_amount: 0, description: '' }],
    }));
  };

  const removeLine = (index: number) => {
    if (formData.lines.length > 2) {
      setFormData((prev) => ({
        ...prev,
        lines: prev.lines.filter((_, i) => i !== index),
      }));
    }
  };

  const updateLine = (index: number, field: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      lines: prev.lines.map((line, i) => {
        if (i !== index) return line;

        // Regla: una lÃ­nea solo puede tener dÃ©bito o crÃ©dito, nunca ambos
        if (field === 'debit_amount') {
          return { ...line, debit_amount: value, credit_amount: 0 };
        }
        if (field === 'credit_amount') {
          return { ...line, credit_amount: value, debit_amount: 0 };
        }

        return { ...line, [field]: value };
      }),
    }));
  };

  const handleEditClick = (entry: JournalEntry) => {
    setIsEditing(true);
    setEditingEntryId(entry.id);
    setFormData({
      entry_date: entry.entry_date.slice(0, 10),
      description: entry.description || '',
      reference: entry.reference || '',
      lines: entry.journal_entry_lines.map((line) => ({
        account_id: line.account_id,
        debit_amount: line.debit_amount || 0,
        credit_amount: line.credit_amount || 0,
        description: line.description || '',
      })),
    });
    setShowCreateModal(true);
  };

  const exportToExcel = async (data: JournalEntry[]) => {
    try {
      const dataToExport = data.flatMap((entry) => {
        return entry.journal_entry_lines.map((line) => ({
          fecha: formatDate(entry.entry_date),
          numero: entry.entry_number,
          descripcion: entry.description,
          cuenta: `${line.chart_accounts.code} - ${line.chart_accounts.name}`,
          debito: line.debit_amount || 0,
          credito: line.credit_amount || 0,
          estado: entry.status === 'posted' ? 'Publicado' : entry.status === 'draft' ? 'Borrador' : 'Anulado',
        }));
      });

      if (dataToExport.length === 0) {
        alert('No hay datos para exportar');
        return;
      }

      const companyName =
        (companyInfo as any)?.name ||
        (companyInfo as any)?.company_name ||
        'ContaBi';

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Diario General');

      const headers = [
        { title: 'Fecha', width: 12 },
        { title: 'Número Asiento', width: 16 },
        { title: 'Descripción', width: 40 },
        { title: 'Cuenta', width: 45 },
        { title: 'Débito', width: 14 },
        { title: 'Crédito', width: 14 },
        { title: 'Estado', width: 14 },
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
      titleCell.value = 'Diario General';
      titleCell.font = { bold: true, size: 16 };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      currentRow++;

      ws.mergeCells(currentRow, 1, currentRow, totalColumns);
      const dateCell = ws.getCell(currentRow, 1);
      dateCell.value = `Generado: ${formatDate(new Date())}`;
      dateCell.alignment = { horizontal: 'center', vertical: 'middle' };
      currentRow++;
      currentRow++;

      const headerRow = ws.getRow(currentRow);
      headers.forEach((h, idx) => {
        const cell = headerRow.getCell(idx + 1);
        cell.value = h.title;
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1F3A' } };
        cell.alignment = { vertical: 'middle' };
      });
      currentRow++;

      for (const item of dataToExport) {
        const dataRow = ws.getRow(currentRow);
        dataRow.getCell(1).value = item.fecha;
        dataRow.getCell(2).value = item.numero;
        dataRow.getCell(3).value = item.descripcion;
        dataRow.getCell(4).value = item.cuenta;
        dataRow.getCell(5).value = item.debito;
        dataRow.getCell(6).value = item.credito;
        dataRow.getCell(7).value = item.estado;
        currentRow++;
      }

      headers.forEach((h, idx) => {
        ws.getColumn(idx + 1).width = h.width;
      });

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `diario_general_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (error) {
      console.error('Error al exportar a Excel:', error);
      alert('Error al generar el archivo Excel. Por favor, intente nuevamente.');
    }
  };

  const handleOpenPreview = () => setShowPreviewModal(true);
  const handleClosePreview = () => setShowPreviewModal(false);


  const handleDownloadPdf = () => {
    const popup = window.open('', '_blank', 'width=1200,height=800');
    if (!popup) return;

    const rowsHtml = sortedEntries
      .map(
        (entry) => `
        <tr>
          <td>${entry.entry_number}</td>
          <td>${formatDate(entry.entry_date)}</td>
          <td>${getEntryDocumentType(entry)}</td>
          <td>${entry.supplier_name || entry.vendor_name || entry.payee_name || entry.counterparty || ''}</td>
          <td>${entry.description || ''}</td>
                    <td style="text-align:right;">${formatAmount(entry.total_debit)}</td>
          <td style="text-align:right;">${formatAmount(entry.total_credit)}</td>
        </tr>
      `,
      )
      .join('');

    const html = `
      <html>
        <head>
          <title>Diario General - Vista previa</title>
          <style>
            body { font-family: Arial, sans-serif; font-size: 12px; color: #111; padding: 16px; }
            h1 { margin-bottom: 4px; }
            h2 { margin: 8px 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            th, td { border: 1px solid #ddd; padding: 6px; }
            th { background: #f5f5f5; text-align: left; }
            tfoot td { font-weight: bold; }
          </style>
        </head>
        <body>
          <h1>Diario General</h1>
          <h2>Totales: Débito RD$${formatAmount(totalDebitsFiltered)} | Crédito RD$${formatAmount(totalCreditsFiltered)}</h2>
          <table>
            <thead>
              <tr>
                <th>Número</th>
                <th>Fecha</th>
                <th>Documento</th>
                <th>Proveedor</th>
                <th>Descripción</th>
                <th>Débito</th>
                <th>Crédito</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="6" style="text-align:right;">Totales:</td>
                <td style="text-align:right;">${formatAmount(totalDebitsFiltered)}</td>
                <td style="text-align:right;">${formatAmount(totalCreditsFiltered)}</td>
              </tr>
            </tfoot>
          </table>
        </body>
      </html>
    `;

    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    popup.focus();
    popup.print();
  };

  const handleDownloadExcel = () => {
    exportToExcel(sortedEntries);
  };

  const totalDebit = formData.lines.reduce((sum, line) => sum + (line.debit_amount || 0), 0);
  const totalCredit = formData.lines.reduce((sum, line) => sum + (line.credit_amount || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) <= 0.01;

  const hasValidLines = formData.lines.some(line =>
    line.account_id && ((line.debit_amount || 0) > 0 || (line.credit_amount || 0) > 0)
  );

  const noInvalidLines = formData.lines.every(line =>
    !((line.debit_amount || 0) > 0 && (line.credit_amount || 0) > 0)
  );

  const hasBothSides = totalDebit > 0 && totalCredit > 0;

  const canSave =
    isBalanced &&
    hasValidLines &&
    noInvalidLines &&
    hasBothSides &&
    !!formData.description;

  const fiscalYears = Array.from(new Set(periods.map((p) => p.fiscal_year))).sort((a, b) => Number(b) - Number(a));

  const visiblePeriods = periods.filter((p) => !selectedFiscalYear || p.fiscal_year === selectedFiscalYear);

  const documentTypes = Array.from(
    new Set(entries.map((entry) => getEntryDocumentType(entry))),
  ).sort();

  const filteredEntries = entries.filter((entry) => {
    const entryDate = (entry.entry_date || '').slice(0, 10);

    if (dateFrom && entryDate && entryDate < dateFrom) return false;
    if (dateTo && entryDate && entryDate > dateTo) return false;

    if (statusFilter !== 'all' && entry.status !== statusFilter) return false;

    if (selectedAccountId) {
      const hasAccount = (entry.journal_entry_lines || []).some((l) => l.account_id === selectedAccountId);
      if (!hasAccount) return false;
    }

    if (documentTypeFilter !== 'all' && getEntryDocumentType(entry) !== documentTypeFilter) return false;

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const hit =
        (entry.entry_number || '').toLowerCase().includes(q) ||
        (entry.description || '').toLowerCase().includes(q) ||
        (entry.reference || '').toLowerCase().includes(q);
      if (!hit) return false;
    }

    return true;
  });

  const sortedEntries = [...filteredEntries].sort((a, b) => {
    const dateA = (a.entry_date || '').slice(0, 10);
    const dateB = (b.entry_date || '').slice(0, 10);
    if (dateA !== dateB) return dateB.localeCompare(dateA);
    const createdA = a.created_at || '';
    const createdB = b.created_at || '';
    if (createdA !== createdB) return createdB.localeCompare(createdA);
    return (b.entry_number || '').localeCompare(a.entry_number || '');
  });

  const totalDebitsFiltered = filteredEntries.reduce((sum, entry) => sum + (entry.total_debit || 0), 0);
  const totalCreditsFiltered = filteredEntries.reduce((sum, entry) => sum + (entry.total_credit || 0), 0);

  const handlePeriodChange = (periodId: string) => {
    setSelectedPeriodId(periodId);
    const period = periods.find((p) => p.id === periodId);
    if (period) {
      setDateFrom(period.start_date.slice(0, 10));
      setDateTo(period.end_date.slice(0, 10));
    }
  };

  const handlePrintEntry = (entry: JournalEntry) => {
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) return;

    const doc = printWindow.document;
    const companyName = companyInfo?.name || 'Diario General';
    const entryDate = formatDate(entry.entry_date);

    const linesHtml = (entry.journal_entry_lines || [])
      .map((line) => {
        const accountLabel = `${line.chart_accounts?.code || ''} - ${line.chart_accounts?.name || ''}`;
        const debit = line.debit_amount > 0 ? formatAmount(line.debit_amount) : '';
        const credit = line.credit_amount > 0 ? formatAmount(line.credit_amount) : '';
        return `
          <tr>
            <td style="padding:4px 8px; border-bottom:1px solid #e5e7eb;">${accountLabel}</td>
            <td style="padding:4px 8px; border-bottom:1px solid #e5e7eb; text-align:right;">${debit}</td>
            <td style="padding:4px 8px; border-bottom:1px solid #e5e7eb; text-align:right;">${credit}</td>
            <td style="padding:4px 8px; border-bottom:1px solid #e5e7eb;">${line.description || ''}</td>
          </tr>
        `;
      })
      .join('');

    doc.open();
    doc.write(`
      <html>
        <head>
          <title>Asiento ${entry.entry_number}</title>
          <style>
            body { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 12px; color: #111827; margin: 16px; }
            h1 { font-size: 18px; margin-bottom: 4px; }
            h2 { font-size: 14px; margin-top: 16px; margin-bottom: 8px; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; }
            th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; border-bottom: 1px solid #9ca3af; padding: 4px 8px; }
            td { font-size: 12px; }
            .header-row { display: flex; justify-content: space-between; margin-bottom: 8px; }
            .label { color: #6b7280; font-size: 11px; text-transform: uppercase; }
            .value { font-size: 12px; font-weight: 500; }
            @media print {
              @page { size: portrait; margin: 1.5cm; }
            }
          </style>
        </head>
        <body>
          <div style="text-align:center; margin-bottom:16px;">
            <div style="font-size:16px; font-weight:bold;">${companyName}</div>
            <div style="font-size:14px; font-weight:600; margin-top:4px;">Diario General - Asiento</div>
          </div>

          <div class="header-row">
            <div>
              <div class="label">Número de asiento</div>
              <div class="value">${entry.entry_number}</div>
            </div>
            <div>
              <div class="label">Fecha</div>
              <div class="value">${entryDate}</div>
            </div>
            <div>
              <div class="label">Estado</div>
              <div class="value">${entry.status === 'posted' ? 'Contabilizado' : entry.status === 'draft' ? 'Borrador' : 'Anulado'}</div>
            </div>
          </div>

          <div style="margin-top:8px;">
            <div class="label">Descripción</div>
            <div class="value">${entry.description || ''}</div>
          </div>

          <h2>Detalle de líneas</h2>
          <table>
            <thead>
              <tr>
                <th>Cuenta</th>
                <th style="text-align:right;">Débito</th>
                <th style="text-align:right;">Crédito</th>
                <th>Descripción</th>
              </tr>
            </thead>
          <tbody>
              ${linesHtml}
            </tbody>
          </table>

          <div style="margin-top:12px; text-align:right; font-weight:600;">
            <div>Total Débito: RD$ ${formatAmount(entry.total_debit)}</div>
            <div>Total Crédito: RD$ ${formatAmount(entry.total_credit)}</div>
          </div>
        </body>
      </html>
    `);
    doc.close();
    printWindow.focus();
    printWindow.print();
  };

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

  const nonReversedEntries = entries.filter((e) => e.status !== 'reversed');

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Estilos de impresión */}
      <style dangerouslySetInnerHTML={{ __html: printStyles }} />

      {/* Título para impresión (solo visible al imprimir) */}
      {companyNameForPrint && (
        <div className="hidden print:block print-title">{companyNameForPrint}</div>
      )}
      <div className="hidden print:block print-title">DIARIO GENERAL</div>
      <div className="hidden print:block print-date">
        Generado el {formatDate(new Date())} {(dateFrom || dateTo) && ` - Período: ${dateFrom ? formatDate(dateFrom) : 'Inicio'} a ${dateTo ? formatDate(dateTo) : 'Fin'}`}
      </div>

      {/* Header con botón de regreso */}
      <div className="flex items-center justify-between mb-6 print:hidden">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/accounting')}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <i className="ri-arrow-left-line"></i>
            Volver a Contabilidad
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Diario General</h1>
            <p className="text-gray-600">Gestión de asientos contables</p>
            <div className="flex items-center space-x-2">
              <button
                onClick={handleOpenPreview}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center"
                title="Vista previa / Exportar"
              >
                <i className="ri-eye-line mr-2"></i>
                Vista previa
              </button>

              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center"
              >
                <i className="ri-save-line mr-2"></i>
                Crear Asiento
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8 print:hidden">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <i className="ri-file-list-3-line text-2xl text-blue-600"></i>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Asientos</p>
              <p className="text-2xl font-bold text-gray-900">{nonReversedEntries.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg">
              <i className="ri-arrow-up-line text-2xl text-green-600"></i>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Débitos</p>
              <p className="text-2xl font-bold text-gray-900">
                RD${formatAmount(nonReversedEntries.reduce((sum, entry) => sum + entry.total_debit, 0))}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-2 bg-red-100 rounded-lg">
              <i className="ri-arrow-down-line text-2xl text-red-600"></i>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Créditos</p>
              <p className="text-2xl font-bold text-gray-900">
                RD${formatAmount(nonReversedEntries.reduce((sum, entry) => sum + entry.total_credit, 0))}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-2 bg-purple-100 rounded-lg">
              <i className="ri-calendar-line text-2xl text-purple-600"></i>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Este Mes</p>
              <p className="text-2xl font-bold text-gray-900">
                {nonReversedEntries.filter(entry => 
                  entry.entry_date.startsWith(new Date().toISOString().slice(0, 7))
                ).length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Actions */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="p-6 border-b border-gray-200 print:hidden">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
            <div className="relative lg:col-span-2">
              <i className="ri-search-line absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
              <input
                type="text"
                placeholder="Buscar asientos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <select
              value={selectedFiscalYear}
              onChange={(e) => {
                setSelectedFiscalYear(e.target.value);
                setSelectedPeriodId('');
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-8"
              title="Año fiscal (todos)"
            >
              <option value="">Año fiscal (todos)</option>
              {fiscalYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
            <select
              value={selectedPeriodId}
              onChange={(e) => handlePeriodChange(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-8"
              title="Período contable (todos)"
            >
              <option value="">Período contable (todos)</option>
              {visiblePeriods.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.name} ({formatDate(period.start_date)} - {formatDate(period.end_date)})
                </option>
              ))}
            </select>
            <DateInput
              value={dateFrom}
              onValueChange={(v) => setDateFrom(v)}
              placeholder="Fecha desde"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <DateInput
              value={dateTo}
              onValueChange={(v) => setDateTo(v)}
              placeholder="Fecha hasta"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />

            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-8"
            >
              <option value="">Todas las cuentas</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.code} - {account.name}
                </option>
              ))}
            </select>
            <select
              value={documentTypeFilter}
              onChange={(e) => setDocumentTypeFilter(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-8"
            >
              <option value="all">Todos los documentos</option>
              {documentTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-8"
            >
              <option value="all">Todos los estados</option>
              <option value="draft">Borrador</option>
              <option value="posted">Contabilizado</option>
              <option value="reversed">Anulado</option>
            </select>
          </div>

        </div>

        {/* Journal Entries Table */}
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
                  Proveedor
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Estado
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider print:hidden">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedEntries.map((entry) => (
                <tr key={entry.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {entry.entry_number}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(entry.entry_date)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {entry.supplier_name || entry.vendor_name || entry.payee_name || entry.counterparty || '-'}
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
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      entry.status === 'posted'
                        ? 'bg-green-100 text-green-800'
                        : entry.status === 'draft'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-800'
                    }`}>
                      {entry.status === 'posted' ? 'Contabilizado' : 
                       entry.status === 'draft' ? 'Borrador' : 'Anulado'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium print:hidden">
                    <button
                      onClick={() => setSelectedEntry(entry)}
                      className="text-blue-600 hover:text-blue-900 mr-3"
                      title="Ver detalles"
                    >
                      <i className="ri-eye-line"></i>
                    </button>
                    <button 
                      className="text-gray-600 hover:text-gray-900 mr-3" 
                      title="Editar"
                      onClick={() => handleEditClick(entry)}
                    >
                      <i className="ri-edit-line"></i>
                    </button>
                    <button
                      className="text-green-600 hover:text-green-900 mr-3"
                      title="Imprimir"
                      onClick={() => handlePrintEntry(entry)}
                    >
                      <i className="ri-printer-line"></i>
                    </button>
                    <button 
                      className="text-red-600 hover:text-red-900" 
                      title="Anular"
                      onClick={() => handleDeleteEntry(entry.id)}
                    >
                      <i className="ri-delete-bin-line"></i>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50">
              <tr>
                <td colSpan={4} className="px-6 py-3 text-right font-semibold text-gray-900">
                  Totales del reporte:
                </td>
                <td className="px-6 py-3 font-bold text-gray-900">
                  RD${formatAmount(totalDebitsFiltered)}
                </td>
                <td className="px-6 py-3 font-bold text-gray-900">
                  RD${formatAmount(totalCreditsFiltered)}
                </td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Create Entry Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">Nuevo Asiento Contable</h2>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line text-2xl"></i>
                </button>
              </div>
            </div>

            <div className="p-6">
              {/* Entry Header */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Fecha
                  </label>
                  <DateInput
                    value={formData.entry_date}
                    onValueChange={(v) => setFormData(prev => ({ ...prev, entry_date: v }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Estado Balance
                  </label>
                  <div className={`px-3 py-2 rounded-lg text-center font-medium ${
                    isBalanced ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {isBalanced ? 'Balanceado' : 'Desbalanceado'}
                  </div>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Descripción
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Descripción del asiento contable"
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Entry Lines */}
              <div className="mb-6">
                <div className="mb-4">
                  <h3 className="text-lg font-medium text-gray-900">Líneas del Asiento</h3>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full border border-gray-200 rounded-lg">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Cuenta
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Descripción
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Débito
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Crédito
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Acciones
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {formData.lines.map((line, index) => (
                        <tr key={index}>
                          <td className="px-4 py-3">
                            <select
                              value={line.account_id}
                              onChange={(e) => updateLine(index, 'account_id', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            >
                              <option value="">Seleccionar cuenta</option>
                              {accounts.map(account => (
                                <option key={account.id} value={account.id}>
                                  {account.code} - {account.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={line.description}
                              onChange={(e) => updateLine(index, 'description', e.target.value)}
                              placeholder="Descripción de la línea"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={line.debit_amount > 0 ? formatAmount(line.debit_amount) : ''}
                              onChange={(e) => {
                                const value = e.target.value.replace(/[^0-9.]/g, '');
                                updateLine(index, 'debit_amount', parseFloat(value) || 0);
                              }}
                              placeholder="0.00"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-right"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={line.credit_amount > 0 ? formatAmount(line.credit_amount) : ''}
                              onChange={(e) => {
                                const value = e.target.value.replace(/[^0-9.]/g, '');
                                updateLine(index, 'credit_amount', parseFloat(value) || 0);
                              }}
                              placeholder="0.00"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-right"
                            />
                          </td>
                          <td className="px-4 py-3">
                            {formData.lines.length > 2 && (
                              <button
                                onClick={() => removeLine(index)}
                                className="text-red-600 hover:text-red-900"
                              >
                                <i className="ri-delete-bin-line"></i>
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50">
                      <tr>
                        <td colSpan={2} className="px-4 py-3 text-right font-medium text-gray-900">
                          Totales:
                        </td>
                        <td className="px-4 py-3 font-bold text-gray-900">
                          RD${formatAmount(totalDebit)}
                        </td>
                        <td className="px-4 py-3 font-bold text-gray-900">
                          RD${formatAmount(totalCredit)}
                        </td>
                        <td className="px-4 py-3"></td>
                      </tr>
                      <tr>
                        <td colSpan={5} className="px-4 py-3 text-center">
                          <button
                            onClick={addLine}
                            className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors inline-flex items-center"
                          >
                            <i className="ri-add-line mr-2"></i>
                            Agregar Línea
                          </button>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end space-x-4">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveEntry}
                  disabled={!canSave}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  {isEditing ? 'Guardar Cambios' : 'Crear Asiento'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">Vista Previa - Diario General</h2>
                <button
                  onClick={handleClosePreview}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line text-2xl"></i>
                </button>
              </div>
            </div>

            <div className="p-6">
              <div className="mb-4 flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {companyInfo?.name || companyInfo?.company_name || 'Diario General'}
                  </h3>
                  <p className="text-sm text-gray-600">
                    Período: {dateFrom ? formatDate(dateFrom) : 'Inicio'} - {dateTo ? formatDate(dateTo) : 'Fin'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleDownloadPdf}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center"
                  >
                    <i className="ri-file-pdf-line mr-2"></i>
                    Imprimir PDF
                  </button>
                  <button
                    onClick={handleDownloadExcel}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center"
                  >
                    <i className="ri-file-excel-2-line mr-2"></i>
                    Exportar Excel
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full border border-gray-200 rounded-lg">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Número</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Documento</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Proveedor</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descripción</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Débito</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Crédito</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {sortedEntries.map((entry) => (
                      <tr key={entry.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-blue-600">{entry.entry_number}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{formatDate(entry.entry_date)}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{getEntryDocumentType(entry)}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {entry.supplier_name || entry.vendor_name || entry.payee_name || entry.counterparty || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">{entry.description}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-right">RD${formatAmount(entry.total_debit)}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-right">RD${formatAmount(entry.total_credit)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50">
                    <tr>
                      <td colSpan={5} className="px-4 py-3 text-right font-semibold text-gray-900">Totales:</td>
                      <td className="px-4 py-3 font-bold text-gray-900 text-right">RD${formatAmount(totalDebitsFiltered)}</td>
                      <td className="px-4 py-3 font-bold text-gray-900 text-right">RD${formatAmount(totalCreditsFiltered)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="mt-6 grid grid-cols-3 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="text-sm text-blue-600 font-medium">Total Asientos</div>
                  <div className="text-2xl font-bold text-blue-900">{sortedEntries.length}</div>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="text-sm text-green-600 font-medium">Total Débitos</div>
                  <div className="text-2xl font-bold text-green-900">RD${formatAmount(totalDebitsFiltered)}</div>
                </div>
                <div className="bg-red-50 p-4 rounded-lg">
                  <div className="text-sm text-red-600 font-medium">Total Créditos</div>
                  <div className="text-2xl font-bold text-red-900">RD${formatAmount(totalCreditsFiltered)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Entry Detail Modal */}
      {selectedEntry && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">
                  Detalle del Asiento {selectedEntry.entry_number}
                </h2>
                <button
                  onClick={() => setSelectedEntry(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line text-2xl"></i>
                </button>
              </div>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Información General</h3>
                  <div className="space-y-3">
                    <div>
                      <span className="text-sm font-medium text-gray-500">Fecha:</span>
                      <span className="ml-2 text-sm text-gray-900">
                        {formatDate(selectedEntry.entry_date)}
                      </span>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500">Estado:</span>
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        selectedEntry.status === 'posted'
                          ? 'bg-green-100 text-green-800'
                          : selectedEntry.status === 'draft'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                      }`}>
                        {selectedEntry.status === 'posted' ? 'Contabilizado' : 
                         selectedEntry.status === 'draft' ? 'Borrador' : 'Anulado'}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Totales</h3>
                  <div className="space-y-3">
                    <div>
                      <span className="text-sm font-medium text-gray-500">Total DÃ©bito:</span>
                      <span className="ml-2 text-sm font-bold text-gray-900">
                        RD${formatAmount(selectedEntry.total_debit)}
                      </span>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500">Total CrÃ©dito:</span>
                      <span className="ml-2 text-sm font-bold text-gray-900">
                        RD${formatAmount(selectedEntry.total_credit)}
                      </span>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500">Diferencia:</span>
                      <span className="ml-2 text-sm font-bold text-green-600">
                        RD${formatAmount(Math.abs(selectedEntry.total_debit - selectedEntry.total_credit))}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">DescripciÃ³n</h3>
                <p className="text-sm text-gray-700 bg-gray-50 p-4 rounded-lg">
                  {selectedEntry.description}
                </p>
              </div>

              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">LÃ­neas del Asiento</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full border border-gray-200 rounded-lg">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Cuenta
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          DescripciÃ³n
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          DÃ©bito
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          CrÃ©dito
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {selectedEntry.journal_entry_lines?.map((line, index) => (
                        <tr key={index}>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {line.chart_accounts?.code} - {line.chart_accounts?.name}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            {line.description}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {line.debit_amount > 0 ? `RD$${formatAmount(line.debit_amount)}` : '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {line.credit_amount > 0 ? `RD$${formatAmount(line.credit_amount)}` : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50">
                      <tr>
                        <td colSpan={2} className="px-4 py-3 text-right font-semibold text-gray-900">
                          Totales:
                        </td>
                        <td className="px-4 py-3 font-bold text-gray-900">
                          RD${formatAmount(selectedEntry.total_debit)}
                        </td>
                        <td className="px-4 py-3 font-bold text-gray-900">
                          RD${formatAmount(selectedEntry.total_credit)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GeneralJournalPage;





