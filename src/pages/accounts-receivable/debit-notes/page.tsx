import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { useAuth } from '../../../hooks/useAuth';
import { customersService, invoicesService, creditDebitNotesService, accountingSettingsService, journalEntriesService, chartAccountsService, settingsService } from '../../../services/database';
import { exportToExcelWithHeaders } from '../../../utils/exportImportUtils';
import { formatMoney } from '../../../utils/numberFormat';

interface DebitNote {
  id: string;
  noteNumber: string;
  customerId: string;
  customerName: string;
  date: string;
  amount: number;
  appliedAmount: number;
  balance: number;
  reason: string;
  concept: string;
  status: 'pending' | 'applied' | 'partial' | 'cancelled';
  relatedInvoice?: string;
  appliedInvoices: string[];
}

export default function DebitNotesPage() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showNoteDetails, setShowNoteDetails] = useState(false);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [selectedNote, setSelectedNote] = useState<DebitNote | null>(null);
  const [debitNotes, setDebitNotes] = useState<DebitNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [customers, setCustomers] = useState<Array<{ id: string; name: string }>>([]);
  const [invoices, setInvoices] = useState<Array<{ id: string; invoiceNumber: string; totalAmount: number; paidAmount: number; status: string; customerId: string }>>([]);
  const [loadingSupport, setLoadingSupport] = useState(false);
  const [customerArAccounts, setCustomerArAccounts] = useState<Record<string, string>>({});
  const [accounts, setAccounts] = useState<any[]>([]);
  const [noteCustomerId, setNoteCustomerId] = useState<string>('');

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-blue-100 text-blue-800';
      case 'applied': return 'bg-green-100 text-green-800';
      case 'partial': return 'bg-yellow-100 text-yellow-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusName = (status: string) => {
    switch (status) {
      case 'pending': return 'Pendiente';
      case 'applied': return 'Aplicada';
      case 'partial': return 'Parcial';
      case 'cancelled': return 'Cancelada';
      default: return 'Desconocido';
    }
  };

  const arAccounts = accounts.filter(
    (acc) => acc.allowPosting && acc.type === 'asset'
  );

  const creditAccounts = accounts.filter(
    (acc) => acc.allowPosting && acc.type === 'income'
  );

  const filteredNotes = debitNotes.filter(note => {
    const matchesSearch = note.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         note.noteNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         note.reason.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || note.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const loadSupportData = async () => {
    if (!user?.id) return;
    setLoadingSupport(true);
    try {
      const [custList, invList, accList] = await Promise.all([
        customersService.getAll(user.id),
        invoicesService.getAll(user.id),
        chartAccountsService.getAll(user.id),
      ]);
      setCustomers(custList.map((c: any) => ({ id: c.id, name: c.name })));
      setInvoices(
        (invList as any[]).map((inv) => ({
          id: String(inv.id),
          invoiceNumber: inv.invoice_number as string,
          totalAmount: Number(inv.total_amount) || 0,
          paidAmount: Number(inv.paid_amount) || 0,
          status: (inv.status as string) || 'pending',
          customerId: String(inv.customer_id),
        }))
      );

      setAccounts(accList || []);

      // Mapa de cuentas de CxC por cliente (si tienen arAccountId configurado)
      const arMap: Record<string, string> = {};
      (custList || []).forEach((c: any) => {
        if (c.id && c.arAccountId) {
          arMap[String(c.id)] = String(c.arAccountId);
        }
      });
      setCustomerArAccounts(arMap);
    } finally {
      setLoadingSupport(false);
    }
  };

  const loadNotes = async () => {
    if (!user?.id) return;
    setLoadingNotes(true);
    try {
      const data = await creditDebitNotesService.getAll(user.id, 'debit');
      const mapped: DebitNote[] = (data as any[]).map((n) => {
        const amount = Number(n.total_amount) || 0;
        const dbApplied = Number((n as any).applied_amount) || 0;
        const dbBalance = Number((n as any).balance_amount);
        const rawStatus = (n.status as string) || 'pending';
        const status: DebitNote['status'] = (['pending', 'applied', 'partial', 'cancelled'] as const).includes(
          rawStatus as any
        )
          ? (rawStatus as DebitNote['status'])
          : 'pending';

        let appliedAmount = dbApplied;
        let balance = Number.isFinite(dbBalance) ? dbBalance : amount - appliedAmount;

        if (status === 'cancelled') {
          appliedAmount = 0;
          balance = 0;
        }

        return {
          id: String(n.id),
          noteNumber: n.note_number as string,
          customerId: String(n.customer_id),
          customerName: (n.customers as any)?.name || 'Cliente',
          date: n.note_date as string,
          amount,
          appliedAmount,
          balance,
          reason: (n.reason as string) || '',
          concept: (n.reason as string) || '',
          status,
          relatedInvoice: (n.invoices as any)?.invoice_number || undefined,
          appliedInvoices: [],
        };
      });
      setDebitNotes(mapped);
    } finally {
      setLoadingNotes(false);
    }
  };

  useEffect(() => {
    loadSupportData();
    loadNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const exportToPDF = async () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    let companyName = 'ContaBi';
    try {
      const info = await settingsService.getCompanyInfo();
      if (info && (info as any)) {
        const resolvedName = (info as any).name || (info as any).company_name;
        if (resolvedName) {
          companyName = String(resolvedName);
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[DebitNotes] Error obteniendo información de la empresa para PDF de notas de débito:', error);
    }

    doc.setFontSize(16);
    doc.text(companyName, pageWidth / 2, 15, { align: 'center' } as any);

    doc.setFontSize(20);
    doc.text('Reporte de Notas de Débito', 20, 30);
    
    doc.setFontSize(12);
    doc.text(`Fecha de generación: ${new Date().toLocaleDateString()}`, 20, 45);
    doc.text(`Estado: ${statusFilter === 'all' ? 'Todos' : getStatusName(statusFilter)}`, 20, 55);
    
    // Estadísticas (excluyendo canceladas)
    const activeNotes = filteredNotes.filter(n => n.status !== 'cancelled');
    const totalAmount = activeNotes.reduce((sum, note) => sum + note.amount, 0);
    const totalApplied = activeNotes.reduce((sum, note) => sum + note.appliedAmount, 0);
    const totalBalance = activeNotes.reduce((sum, note) => sum + note.balance, 0);
    const pendingNotes = activeNotes.filter(n => n.status === 'pending').length;
    
    doc.setFontSize(14);
    doc.text('Resumen de Notas de Débito', 20, 75);
    
    const summaryData = [
      ['Concepto', 'Valor'],
      ['Total Notas de Débito', `${formatMoney(totalAmount, 'RD$')}`],
      ['Total Aplicado', `${formatMoney(totalApplied, 'RD$')}`],
      ['Saldo Pendiente', `${formatMoney(totalBalance, 'RD$')}`],
      ['Notas Pendientes', pendingNotes.toString()],
      ['Total de Notas', activeNotes.length.toString()]
    ];
    
    (doc as any).autoTable({
      startY: 85,
      head: [summaryData[0]],
      body: summaryData.slice(1),
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246] }
    });
    
    // Tabla de notas
    doc.setFontSize(14);
    doc.text('Detalle de Notas de Débito', 20, (doc as any).lastAutoTable.finalY + 20);
    
    const noteData = activeNotes.map(note => [
      note.noteNumber,
      note.customerName,
      note.date,
      `${formatMoney(note.amount, 'RD$')}`,
      `${formatMoney(note.appliedAmount, 'RD$')}`,
      `${formatMoney(note.balance, 'RD$')}`,
      note.reason,
      getStatusName(note.status)
    ]);
    
    (doc as any).autoTable({
      startY: (doc as any).lastAutoTable.finalY + 30,
      head: [['Nota', 'Cliente', 'Fecha', 'Monto', 'Aplicado', 'Saldo', 'Motivo', 'Estado']],
      body: noteData,
      theme: 'striped',
      headStyles: { fillColor: [239, 68, 68] },
      styles: { fontSize: 8 }
    });
    
    doc.save(`notas-debito-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const exportToExcel = async () => {
    const activeNotes = filteredNotes.filter(n => n.status !== 'cancelled');

    if (!activeNotes.length) {
      alert('No hay notas de débito para exportar con los filtros actuales.');
      return;
    }

    let companyName = 'ContaBi';
    try {
      const info = await settingsService.getCompanyInfo();
      if (info && (info as any)) {
        const resolvedName = (info as any).name || (info as any).company_name;
        if (resolvedName) {
          companyName = String(resolvedName);
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error obteniendo información de la empresa para Excel de notas de débito:', error);
    }

    const rows = activeNotes.map(note => ({
      noteNumber: note.noteNumber,
      customerName: note.customerName,
      date: note.date,
      amount: formatMoney(note.amount, 'RD$'),
      appliedAmount: formatMoney(note.appliedAmount, 'RD$'),
      balance: formatMoney(note.balance, 'RD$'),
      reason: note.reason,
      concept: note.concept,
      status: getStatusName(note.status),
    }));

    const todayIso = new Date().toISOString().split('T')[0];
    const todayLocal = new Date().toLocaleDateString();

    const headers = [
      { key: 'noteNumber', title: 'Nota' },
      { key: 'customerName', title: 'Cliente' },
      { key: 'date', title: 'Fecha' },
      { key: 'amount', title: 'Monto' },
      { key: 'appliedAmount', title: 'Aplicado' },
      { key: 'balance', title: 'Saldo' },
      { key: 'reason', title: 'Motivo' },
      { key: 'concept', title: 'Concepto' },
      { key: 'status', title: 'Estado' },
    ];

    exportToExcelWithHeaders(
      rows,
      headers,
      `notas-debito-${todayIso}`,
      'Notas de Débito',
      [16, 26, 14, 16, 16, 16, 26, 26, 16],
      {
        title: `Notas de Débito - ${todayLocal}`,
        companyName,
      },
    );
  };

  const handleNewNote = () => {
    setSelectedNote(null);
    setNoteCustomerId('');
    setShowNoteModal(true);
  };

  const handleViewNote = (note: DebitNote) => {
    setSelectedNote(note);
    setShowNoteDetails(true);
  };

  const handleApplyNote = (note: DebitNote) => {
    setSelectedNote(note);
    setShowApplyModal(true);
  };

  const handleCancelNote = async (noteId: string) => {
    if (!user?.id) {
      alert('Debes iniciar sesión para cancelar notas');
      return;
    }
    if (!confirm('¿Está seguro de que desea cancelar esta nota de débito?')) return;
    try {
      await creditDebitNotesService.updateStatus(noteId, 'cancelled');
      await loadNotes();
      alert('Nota de débito cancelada exitosamente');
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('[DebitNotes] Error al cancelar nota', error);
      alert(`Error al cancelar la nota: ${error?.message || 'revisa la consola para más detalles'}`);
    }
  };

  const handleSaveNote = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user?.id) {
      alert('Debes iniciar sesión para crear notas de débito');
      return;
    }
    const formData = new FormData(e.currentTarget);
    const customerId = String(formData.get('customer_id') || '');
    const date = String(formData.get('date') || '');
    const amount = Number(formData.get('amount') || 0);
    const invoiceId = String(formData.get('invoice_id') || '');
    const reason = String(formData.get('reason') || '');
    const concept = String(formData.get('concept') || '');
    const arAccountIdFromForm = String(formData.get('ar_account_id') || '');
    const creditAccountId = String(formData.get('credit_account_id') || '');

    if (!customerId || !amount || !creditAccountId || !invoiceId || !arAccountIdFromForm) {
      alert('Cliente, monto, factura, cuenta contable de crédito y cuenta por cobrar son obligatorios');
      return;
    }

    const noteNumber = `ND-${Date.now()}`;
    const noteDate = date || new Date().toISOString().slice(0, 10);

    const payload = {
      note_type: 'debit' as const,
      customer_id: customerId,
      invoice_id: invoiceId || null,
      note_number: noteNumber,
      note_date: noteDate,
      total_amount: amount,
      reason: reason || concept || null,
      applied_amount: 0,
      balance_amount: amount,
      status: 'pending',
    };

    try {
      const created = await creditDebitNotesService.create(user.id, payload);

      // Best-effort: asiento contable de nota de débito (aumento de CxC: Debe CxC, Haber cuenta seleccionada)
      try {
        const settings = await accountingSettingsService.get(user.id);

        const customerSpecificArId = customerArAccounts[customerId];
        const arAccountId = arAccountIdFromForm || customerSpecificArId || settings?.ar_account_id;

        if (!arAccountId) {
          alert('Nota de débito creada, pero no se pudo crear el asiento: falta configurar o seleccionar la Cuenta de Cuentas por Cobrar.');
        } else {
          const noteAmount = Number(created.total_amount) || amount;

          const lines: any[] = [
            {
              account_id: arAccountId,
              description: 'Nota de débito - Aumento de Cuentas por Cobrar',
              debit_amount: noteAmount,
              credit_amount: 0,
              line_number: 1,
            },
            {
              account_id: creditAccountId,
              description: 'Nota de débito - Cargo a cuenta seleccionada',
              debit_amount: 0,
              credit_amount: noteAmount,
              line_number: 2,
            },
          ];

          const customerName = customers.find(c => c.id === customerId)?.name || '';
          const descriptionText = customerName
            ? `Nota de débito ${created.note_number || noteNumber} - ${customerName}`
            : `Nota de débito ${created.note_number || noteNumber}`;

          const refText = created.reason || reason || concept || '';
          const entryReference = refText
            ? `ND:${created.id} Motivo:${refText}`
            : `ND:${created.id}`;

          const entryDate = created.note_date || noteDate;

          const entryPayload = {
            entry_number: created.id,
            entry_date: entryDate,
            description: descriptionText,
            reference: entryReference,
            total_debit: noteAmount,
            total_credit: noteAmount,
            status: 'posted' as const,
          };

          await journalEntriesService.createWithLines(user.id, entryPayload, lines);
        }
      } catch (jeError) {
        // eslint-disable-next-line no-console
        console.error('[DebitNotes] Error creando asiento contable de nota de débito:', jeError);
        alert('Nota de débito creada, pero ocurrió un error al crear el asiento contable. Revise el libro diario y la configuración.');
      }

      await loadNotes();
      alert('Nota de débito creada exitosamente');
      setShowNoteModal(false);
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('[DebitNotes] Error al crear nota', error);
      alert(`Error al crear la nota de débito: ${error?.message || 'revisa la consola para más detalles'}`);
    }
  };

  const handleSaveApplication = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user?.id || !selectedNote) {
      alert('Debes iniciar sesión y seleccionar una nota válida');
      return;
    }

    const formData = new FormData(e.currentTarget);
    const invoiceId = String(formData.get('invoice_id') || '');
    const amountToApply = Number(formData.get('amount_to_apply') || 0);

    if (!invoiceId) {
      alert('Debes seleccionar una factura para aplicar la nota');
      return;
    }

    if (!amountToApply || amountToApply <= 0) {
      alert('El monto a aplicar debe ser mayor que 0');
      return;
    }

    if (amountToApply > selectedNote.balance) {
      alert('El monto a aplicar no puede ser mayor que el saldo pendiente de la nota');
      return;
    }

    const newApplied = selectedNote.appliedAmount + amountToApply;
    const newBalance = selectedNote.balance - amountToApply;

    const newStatus: DebitNote['status'] = newBalance > 0 ? 'partial' : 'applied';

    const targetInvoice = invoices.find((inv) => inv.id === invoiceId);
    if (!targetInvoice) {
      alert('La factura seleccionada no es válida');
      return;
    }

    const newInvoiceTotal = targetInvoice.totalAmount + amountToApply;
    const invoiceBalanceAfter = newInvoiceTotal - targetInvoice.paidAmount;
    let newInvoiceStatus = targetInvoice.status as 'pending' | 'partial' | 'paid' | string;
    if (invoiceBalanceAfter <= 0) {
      newInvoiceStatus = 'paid';
    } else if (targetInvoice.paidAmount > 0 && targetInvoice.paidAmount < newInvoiceTotal) {
      newInvoiceStatus = 'partial';
    } else if (targetInvoice.paidAmount === 0) {
      newInvoiceStatus = 'pending';
    }

    try {
      await invoicesService.updateTotals(invoiceId, newInvoiceTotal, newInvoiceStatus);

      await creditDebitNotesService.updateStatus(selectedNote.id, newStatus, {
        appliedAmount: newApplied,
        balanceAmount: newBalance,
      });
      await loadNotes();
      alert('Nota de débito aplicada exitosamente');
      setShowApplyModal(false);
      setSelectedNote(null);
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('[DebitNotes] Error al aplicar nota', error);
      alert(`Error al aplicar la nota de débito: ${error?.message || 'revisa la consola para más detalles'}`);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Notas de Débito</h1>
            <nav className="flex space-x-2 text-sm text-gray-600 mt-2">
              <Link to="/accounts-receivable" className="hover:text-blue-600">Cuentas por Cobrar</Link>
              <span>/</span>
              <span>Notas de Débito</span>
            </nav>
          </div>
          <button 
            onClick={handleNewNote}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            <i className="ri-add-line mr-2"></i>
            Nueva Nota de Débito
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Notas</p>
                <p className="text-2xl font-bold text-red-600">
                  {formatMoney(filteredNotes.reduce((sum, n) => sum + n.amount, 0), 'RD$')}
                </p>
              </div>
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                <i className="ri-file-text-line text-2xl text-red-600"></i>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Saldo Pendiente</p>
                <p className="text-2xl font-bold text-orange-600">
                  {formatMoney(filteredNotes.reduce((sum, n) => sum + n.balance, 0), 'RD$')}
                </p>
              </div>
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                <i className="ri-wallet-line text-2xl text-orange-600"></i>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Monto Aplicado</p>
                <p className="text-2xl font-bold text-green-600">
                  {formatMoney(filteredNotes.reduce((sum, n) => sum + n.appliedAmount, 0), 'RD$')}
                </p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <i className="ri-check-double-line text-2xl text-green-600"></i>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Notas Pendientes</p>
                <p className="text-2xl font-bold text-blue-600">
                  {filteredNotes.filter(n => n.status === 'pending').length}
                </p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <i className="ri-time-line text-2xl text-blue-600"></i>
              </div>
            </div>
          </div>
        </div>

        {/* Filters and Export */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex-1">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <i className="ri-search-line text-gray-400"></i>
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                placeholder="Buscar por cliente, número de nota o motivo..."
              />
            </div>
          </div>
          
          <div className="w-full md:w-48">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm pr-8"
            >
              <option value="all">Todos los Estados</option>
              <option value="pending">Pendientes</option>
              <option value="partial">Parciales</option>
              <option value="applied">Aplicadas</option>
              <option value="cancelled">Canceladas</option>
            </select>
          </div>
          
          <div className="flex space-x-2">
            <button
              onClick={exportToPDF}
              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap"
            >
              <i className="ri-file-pdf-line mr-2"></i>PDF
            </button>
            <button
              onClick={exportToExcel}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap"
            >
              <i className="ri-file-excel-line mr-2"></i>Excel
            </button>
          </div>
        </div>

        {/* Debit Notes Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          {(loadingNotes || loadingSupport) && (
            <div className="px-6 pt-3 text-sm text-gray-500">Cargando datos...</div>
          )}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Nota
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cliente
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fecha
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Monto
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Aplicado
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Saldo
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Motivo
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredNotes.map((note) => (
                  <tr key={note.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {note.noteNumber}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {note.customerName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {note.date}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {formatMoney(note.amount, 'RD$')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatMoney(note.appliedAmount, 'RD$')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-orange-600">
                      {formatMoney(note.balance, 'RD$')}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                      {note.reason}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(note.status)}`}>
                        {getStatusName(note.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleViewNote(note)}
                          className="text-blue-600 hover:text-blue-900"
                          title="Ver detalles"
                        >
                          <i className="ri-eye-line"></i>
                        </button>
                        {note.balance > 0 && note.status !== 'cancelled' && (
                          <button
                            onClick={() => handleApplyNote(note)}
                            className="text-green-600 hover:text-green-900"
                            title="Aplicar nota"
                          >
                            <i className="ri-check-line"></i>
                          </button>
                        )}
                        {note.status === 'pending' && (
                          <button
                            onClick={() => handleCancelNote(note.id)}
                            className="text-red-600 hover:text-red-900"
                            title="Cancelar nota"
                          >
                            <i className="ri-close-circle-line"></i>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* New Debit Note Modal */}
        {showNoteModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Nueva Nota de Débito</h3>
                <button
                  onClick={() => setShowNoteModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line"></i>
                </button>
              </div>
              
              <form onSubmit={handleSaveNote} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Cliente
                    </label>
                    <select 
                      required
                      name="customer_id"
                      value={noteCustomerId}
                      onChange={(e) => setNoteCustomerId(e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                    >
                      <option value="">Seleccionar cliente</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Fecha
                    </label>
                    <input
                      type="date"
                      required
                      name="date"
                      defaultValue={new Date().toISOString().split('T')[0]}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Monto
                    </label>
                    <input
                      type="number" min="0"
                      step="0.01"
                      required
                      name="amount"
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="0.00"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Factura Relacionada <span className="text-red-500">*</span>
                    </label>
                    <select 
                      name="invoice_id"
                      required
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                    >
                      <option value="">Seleccionar factura</option>
                      {invoices
                        .filter((inv) => noteCustomerId && inv.customerId === noteCustomerId)
                        .map((inv) => (
                          <option key={inv.id} value={inv.id}>{inv.invoiceNumber}</option>
                        ))}
                    </select>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Motivo
                  </label>
                  <select 
                    required
                    name="reason"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                  >
                    <option value="">Seleccionar motivo</option>
                    <option value="Intereses por mora">Intereses por mora</option>
                    <option value="Gastos de cobranza">Gastos de cobranza</option>
                    <option value="Ajuste de precio">Ajuste de precio</option>
                    <option value="Penalización contractual">Penalización contractual</option>
                    <option value="Cargo por servicio">Cargo por servicio</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Cuenta por Cobrar <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="ar_account_id"
                    required
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                    defaultValue=""
                  >
                    <option value="">Seleccionar cuenta CxC</option>
                    {arAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.code} - {acc.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Cuenta contable de crédito
                  </label>
                  <select
                    required
                    name="credit_account_id"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                    defaultValue=""
                  >
                    <option value="">Seleccionar cuenta</option>
                    {creditAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.code} - {acc.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Concepto
                  </label>
                  <textarea
                    rows={3}
                    required
                    name="concept"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Descripción detallada de la nota de débito..."
                  />
                </div>
                
                <div className="flex space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowNoteModal(false)}
                    className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400 transition-colors whitespace-nowrap"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                  >
                    Crear Nota de Débito
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Apply Debit Note Modal */}
        {showApplyModal && selectedNote && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Aplicar Nota de Débito</h3>
                <button
                  onClick={() => {
                    setShowApplyModal(false);
                    setSelectedNote(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line"></i>
                </button>
              </div>
              
              <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">Nota: <span className="font-medium">{selectedNote.noteNumber}</span></p>
                <p className="text-sm text-gray-600">Cliente: <span className="font-medium">{selectedNote.customerName}</span></p>
                <p className="text-lg font-semibold text-orange-600">Saldo pendiente: {formatMoney(selectedNote.balance, 'RD$')}</p>
              </div>
              
              <form onSubmit={handleSaveApplication} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Factura a Aplicar
                  </label>
                  <select 
                    required
                    name="invoice_id"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                  >
                    <option value="">Seleccionar factura</option>
                    {invoices
                      .filter((inv) => inv.customerId === selectedNote.customerId)
                      .filter((inv) => inv.status !== 'Cancelada' && (inv.totalAmount - inv.paidAmount) > 0)
                      .map((inv) => (
                        <option key={inv.id} value={inv.id}>
                          {inv.invoiceNumber}
                        </option>
                      ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Monto a Aplicar
                  </label>
                  <input
                    type="number" min="0"
                    step="0.01"
                    name="amount_to_apply"
                    required
                    max={selectedNote?.balance ?? undefined}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="0.00"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Observaciones
                  </label>
                  <textarea
                    rows={3}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Observaciones sobre la aplicación de la nota..."
                  />
                </div>
                
                <div className="flex space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowApplyModal(false);
                      setSelectedNote(null);
                    }}
                    className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400 transition-colors whitespace-nowrap"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap"
                  >
                    Aplicar Nota
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Debit Note Details Modal */}
        {showNoteDetails && selectedNote && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold">Detalles de la Nota de Débito</h3>
                <button
                  onClick={() => {
                    setShowNoteDetails(false);
                    setSelectedNote(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line"></i>
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-500">Número de Nota</label>
                    <p className="text-lg font-semibold text-gray-900">{selectedNote.noteNumber}</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-500">Cliente</label>
                    <p className="text-gray-900">{selectedNote.customerName}</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-500">Fecha</label>
                    <p className="text-gray-900">{selectedNote.date}</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-500">Monto Original</label>
                    <p className="text-2xl font-bold text-red-600">{formatMoney(selectedNote.amount, 'RD$')}</p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-500">Motivo</label>
                    <p className="text-gray-900">{selectedNote.reason}</p>
                  </div>
                  
                  {selectedNote.relatedInvoice && (
                    <div>
                      <label className="block text-sm font-medium text-gray-500">Factura Relacionada</label>
                      <p className="text-gray-900">{selectedNote.relatedInvoice}</p>
                    </div>
                  )}
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-500">Monto Aplicado</label>
                    <p className="text-lg font-semibold text-green-600">{formatMoney(selectedNote.appliedAmount, 'RD$')}</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-500">Saldo Pendiente</label>
                    <p className="text-2xl font-bold text-orange-600">{formatMoney(selectedNote.balance, 'RD$')}</p>
                  </div>
                </div>
              </div>
              
              <div className="mt-6">
                <label className="block text-sm font-medium text-gray-500">Estado</label>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(selectedNote.status)} mt-1`}>
                  {getStatusName(selectedNote.status)}
                </span>
              </div>
              
              <div className="mt-6">
                <label className="block text-sm font-medium text-gray-500">Concepto</label>
                <p className="text-gray-900 mt-1">{selectedNote.concept}</p>
              </div>
              
              {selectedNote.appliedInvoices.length > 0 && (
                <div className="mt-6">
                  <label className="block text-sm font-medium text-gray-500">Facturas Aplicadas</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {selectedNote.appliedInvoices.map((invoice, index) => (
                      <span key={index} className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm">
                        {invoice}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="flex space-x-3 mt-6">
                {selectedNote.balance > 0 && selectedNote.status !== 'cancelled' && (
                  <button
                    onClick={() => {
                      setShowNoteDetails(false);
                      setShowApplyModal(true);
                    }}
                    className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap"
                  >
                    <i className="ri-check-line mr-2"></i>
                    Aplicar Nota
                  </button>
                )}
                {selectedNote.status === 'pending' && (
                  <button
                    onClick={() => handleCancelNote(selectedNote.id)}
                    className="flex-1 bg-red-600 text-white py-2 rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap"
                  >
                    <i className="ri-close-circle-line mr-2"></i>
                    Cancelar Nota
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}