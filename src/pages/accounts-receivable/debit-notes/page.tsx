import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { useAuth } from '../../../hooks/useAuth';
import { customersService, invoicesService, creditDebitNotesService, settingsService } from '../../../services/database';
import { exportToExcelWithHeaders, addPdfBrandedHeader, getPdfTableStyles } from '../../../utils/exportImportUtils';
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
      case 'pending': return 'bg-[#f3ecda] text-[#6b5c3b]';
      case 'applied': return 'bg-[#d7e4c0] text-[#2f3e1e]';
      case 'partial': return 'bg-[#fbe8c8] text-[#8a6a2f]';
      case 'cancelled': return 'bg-[#f4d9d4] text-[#7a2e1b]';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusName = (status: string) => {
    switch (status) {
      case 'pending': return 'Pending';
      case 'applied': return 'Applied';
      case 'partial': return 'Partial';
      case 'cancelled': return 'Cancelled';
      default: return 'Unknown';
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
      const [custList, invList] = await Promise.all([
        customersService.getAll(user.id),
        invoicesService.getAll(user.id),
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
    const pdfStyles = getPdfTableStyles();

    // Add branded header with logo
    const startY = await addPdfBrandedHeader(doc, 'Debit Notes Report', {
      subtitle: `Status: ${statusFilter === 'all' ? 'All' : getStatusName(statusFilter)}`
    });
    
    // Estadísticas (excluyendo canceladas)
    const activeNotes = filteredNotes.filter(n => n.status !== 'cancelled');
    const totalAmount = activeNotes.reduce((sum, note) => sum + note.amount, 0);
    const totalApplied = activeNotes.reduce((sum, note) => sum + note.appliedAmount, 0);
    const totalBalance = activeNotes.reduce((sum, note) => sum + note.balance, 0);
    const pendingNotes = activeNotes.filter(n => n.status === 'pending').length;
    
    doc.setFontSize(12);
    doc.setTextColor(51, 51, 51);
    doc.text('Debit Notes Summary', 20, startY);
    
    const summaryData = [
      ['Metric', 'Value'],
      ['Total Debit Notes', `${formatMoney(totalAmount, '')}`],
      ['Total Applied', `${formatMoney(totalApplied, '')}`],
      ['Pending Balance', `${formatMoney(totalBalance, '')}`],
      ['Pending Notes', pendingNotes.toString()],
      ['Number of Notes', activeNotes.length.toString()]
    ];
    
    (doc as any).autoTable({
      startY: startY + 5,
      head: [summaryData[0]],
      body: summaryData.slice(1),
      theme: 'grid',
      ...pdfStyles,
    });
    
    // Tabla de notas
    doc.setFontSize(14);
    doc.text('Debit Notes Detail', 20, (doc as any).lastAutoTable.finalY + 20);
    
    const noteData = activeNotes.map(note => [
      note.noteNumber,
      note.customerName,
      note.date,
      `${formatMoney(note.amount, '')}`,
      `${formatMoney(note.appliedAmount, '')}`,
      `${formatMoney(note.balance, '')}`,
      note.reason,
      getStatusName(note.status)
    ]);
    
    (doc as any).autoTable({
      startY: (doc as any).lastAutoTable.finalY + 30,
      head: [['Note', 'Customer', 'Date', 'Amount', 'Applied', 'Balance', 'Reason', 'Status']],
      body: noteData,
      theme: 'striped',
      headStyles: { fillColor: [122, 46, 27] },
      styles: { fontSize: 8 }
    });
    
    doc.save(`debit-notes-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const exportToExcel = async () => {
    const activeNotes = filteredNotes.filter(n => n.status !== 'cancelled');

    if (!activeNotes.length) {
      alert('There are no debit notes to export with the current filters.');
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
      amount: formatMoney(note.amount, ''),
      appliedAmount: formatMoney(note.appliedAmount, ''),
      balance: formatMoney(note.balance, ''),
      reason: note.reason,
      concept: note.concept,
      status: getStatusName(note.status),
    }));

    const todayIso = new Date().toISOString().split('T')[0];
    const todayLocal = new Date().toLocaleDateString();

    const headers = [
      { key: 'noteNumber', title: 'Note' },
      { key: 'customerName', title: 'Customer' },
      { key: 'date', title: 'Date' },
      { key: 'amount', title: 'Amount' },
      { key: 'appliedAmount', title: 'Applied' },
      { key: 'balance', title: 'Balance' },
      { key: 'reason', title: 'Reason' },
      { key: 'concept', title: 'Concept' },
      { key: 'status', title: 'Status' },
    ];

    exportToExcelWithHeaders(
      rows,
      headers,
      `debit-notes-${todayIso}`,
      'Debit Notes',
      [16, 26, 14, 16, 16, 16, 26, 26, 16],
      {
        title: `Debit Notes - ${todayLocal}`,
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
      alert('You must be signed in to cancel debit notes.');
      return;
    }
    if (!confirm('Are you sure you want to cancel this debit note?')) return;
    try {
      await creditDebitNotesService.updateStatus(noteId, 'cancelled');
      await loadNotes();
      alert('Debit note cancelled successfully.');
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('[DebitNotes] Error cancelling note', error);
      alert(`Error cancelling the note: ${error?.message || 'check the console for more details'}`);
    }
  };

  const handleSaveNote = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user?.id) {
      alert('You must be signed in to create debit notes.');
      return;
    }

    const formData = new FormData(e.currentTarget);
    const customerId = String(formData.get('customer_id') || '');
    const date = String(formData.get('date') || '');
    const amount = Number(formData.get('amount') || 0);
    const invoiceId = String(formData.get('invoice_id') || '');
    const reason = String(formData.get('reason') || '');
    const concept = String(formData.get('concept') || '');
    const creditAccountId = String(formData.get('credit_account_id') || '');

    if (!customerId || !amount || !invoiceId) {
      alert('Customer, amount, and invoice are required.');
      return;
    }

    if (amount <= 0) {
      alert('Amount must be greater than 0.');
      return;
    }

    const targetInvoice = invoices.find((inv) => String(inv.id) === invoiceId);
    if (!targetInvoice) {
      alert('We could not find the selected invoice. Reload the page and try again.');
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
      applied_amount: amount,
      balance_amount: 0,
      status: 'applied',
    };

    try {
      const created = await creditDebitNotesService.create(user.id, payload);

      // Aplicar efecto inmediato en la factura: aumentar total y recalcular status
      {
        const originalTotal = Number(targetInvoice.totalAmount) || 0;
        const paidAmount = Number(targetInvoice.paidAmount) || 0;
        let newInvoiceTotal = originalTotal + amount;
        if (newInvoiceTotal < 0) newInvoiceTotal = 0;

        let newInvoiceStatus: string;
        if (paidAmount >= newInvoiceTotal) {
          newInvoiceStatus = 'paid';
        } else if (paidAmount > 0) {
          newInvoiceStatus = 'partial';
        } else {
          newInvoiceStatus = 'pending';
        }

        await invoicesService.updateTotals(String(invoiceId), newInvoiceTotal, newInvoiceStatus);
      }

      await loadNotes();
      alert('Debit note created successfully.');
      setShowNoteModal(false);
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('[DebitNotes] Error al crear nota', error);
      alert(`Error creating the debit note: ${error?.message || 'check the console for more details'}`);
    }
  };

  const handleSaveApplication = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user?.id || !selectedNote) {
      alert('You must be signed in and select a valid note.');
      return;
    }

    const formData = new FormData(e.currentTarget);
    const invoiceId = String(formData.get('invoice_id') || '');
    const amountToApply = Number(formData.get('amount_to_apply') || 0);

    if (!invoiceId) {
      alert('Please select an invoice to apply the note.');
      return;
    }

    if (!amountToApply || amountToApply <= 0) {
      alert('The amount to apply must be greater than 0.');
      return;
    }

    if (amountToApply > selectedNote.balance) {
      alert('The amount to apply cannot exceed the pending balance.');
      return;
    }

    const newApplied = selectedNote.appliedAmount + amountToApply;
    const newBalance = selectedNote.balance - amountToApply;

    const newStatus: DebitNote['status'] = newBalance > 0 ? 'partial' : 'applied';

    const targetInvoice = invoices.find((inv) => inv.id === invoiceId);
    if (!targetInvoice) {
      alert('The selected invoice is not valid.');
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
      alert('Debit note applied successfully.');
      setShowApplyModal(false);
      setSelectedNote(null);
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('[DebitNotes] Error al aplicar nota', error);
      alert(`Error applying the debit note: ${error?.message || 'check the console for more details'}`);
    }
  };

  return (
    <DashboardLayout>
      <div className="min-h-screen p-6 bg-gradient-to-br from-[#f6f1e3] to-[#ebe5d5]">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#2f3e1e] drop-shadow-sm">Debit Notes</h1>
            <nav className="flex space-x-2 text-sm text-[#6b5c3b] mt-2">
              <Link to="/accounts-receivable" className="hover:text-[#2f3e1e]">Accounts Receivable</Link>
              <span>/</span>
              <span>Debit Notes</span>
            </nav>
          </div>
          <button 
            onClick={handleNewNote}
            className="bg-[#2f3e1e] text-white px-4 py-2 rounded-lg hover:bg-[#1f2913] transition-colors whitespace-nowrap shadow-sm"
          >
            <i className="ri-add-line mr-2"></i>
            New Debit Note
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <div className="bg-gradient-to-br from-white to-[#faf9f5] p-6 rounded-2xl border border-[#e8e0d0] shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:shadow-[0_12px_40px_rgb(0,128,0,0.15)] hover:-translate-y-1 transition-all duration-300 cursor-pointer">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#6b5c3b]">Total Notes</p>
                <p className="text-2xl font-semibold text-[#2f3e1e]">
                  {formatMoney(filteredNotes.reduce((sum, n) => sum + n.amount, 0), '')}
                </p>
              </div>
              <div className="w-12 h-12 bg-[#f3ecda] rounded-xl flex items-center justify-center text-[#2f3e1e]">
                <i className="ri-file-text-line text-2xl"></i>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-white to-[#faf9f5] p-6 rounded-2xl border border-[#e8e0d0] shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:shadow-[0_12px_40px_rgb(0,128,0,0.15)] hover:-translate-y-1 transition-all duration-300 cursor-pointer">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#6b5c3b]">Pending Balance</p>
                <p className="text-2xl font-semibold text-[#1f2913]">
                  {formatMoney(filteredNotes.reduce((sum, n) => sum + n.balance, 0), '')}
                </p>
              </div>
              <div className="w-12 h-12 bg-[#f3ecda] rounded-xl flex items-center justify-center text-[#1f2913]">
                <i className="ri-wallet-line text-2xl"></i>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-white to-[#faf9f5] p-6 rounded-2xl border border-[#e8e0d0] shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:shadow-[0_12px_40px_rgb(0,128,0,0.15)] hover:-translate-y-1 transition-all duration-300 cursor-pointer">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#6b5c3b]">Applied Amount</p>
                <p className="text-2xl font-semibold text-[#4a3c24]">
                  {formatMoney(filteredNotes.reduce((sum, n) => sum + n.appliedAmount, 0), '')}
                </p>
              </div>
              <div className="w-12 h-12 bg-[#f3ecda] rounded-xl flex items-center justify-center text-[#4a3c24]">
                <i className="ri-check-double-line text-2xl"></i>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-white to-[#faf9f5] p-6 rounded-2xl border border-[#e8e0d0] shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:shadow-[0_12px_40px_rgb(0,128,0,0.15)] hover:-translate-y-1 transition-all duration-300 cursor-pointer">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#6b5c3b]">Pending Notes</p>
                <p className="text-2xl font-semibold text-[#bc6c2b]">
                  {filteredNotes.filter(n => n.status === 'pending').length}
                </p>
              </div>
              <div className="w-12 h-12 bg-[#f3ecda] rounded-xl flex items-center justify-center text-[#bc6c2b]">
                <i className="ri-time-line text-2xl"></i>
              </div>
            </div>
          </div>
        </div>

        {/* Filters and Export */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex-1">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <i className="ri-search-line text-[#9b8a64]"></i>
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full pl-10 pr-3 py-3 border border-[#d8cbb5] bg-[#fffdf6] rounded-lg focus:ring-2 focus:ring-[#6b5c3b] focus:border-[#6b5c3b] text-sm placeholder:text-[#9b8a64]"
                placeholder="Search by customer, note number, or reason..."
              />
            </div>
          </div>
          
          <div className="w-full md:w-48">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full p-3 border border-[#d8cbb5] bg-[#fffdf6] rounded-lg focus:ring-2 focus:ring-[#6b5c3b] focus:border-[#6b5c3b] text-sm pr-8"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="partial">Partially Applied</option>
              <option value="applied">Fully Applied</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          
          <div className="flex space-x-2">
            <button
              onClick={exportToPDF}
              className="bg-[#7a2e1b] text-white px-4 py-2 rounded-lg hover:bg-[#5c1f12] transition-colors whitespace-nowrap shadow-sm"
            >
              <i className="ri-file-pdf-line mr-2"></i>PDF
            </button>
            <button
              onClick={exportToExcel}
              className="bg-[#2f3e1e] text-white px-4 py-2 rounded-lg hover:bg-[#1f2913] transition-colors whitespace-nowrap shadow-sm"
            >
              <i className="ri-file-excel-line mr-2"></i>Excel
            </button>
          </div>
        </div>

        {/* Debit Notes Table */}
        <div className="bg-white rounded-lg shadow-sm border border-[#e4d8c4]">
          {(loadingNotes || loadingSupport) && (
            <div className="px-6 pt-3 text-sm text-gray-500">Loading data...</div>
          )}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Note
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Applied
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Balance
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Reason
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
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
                      {formatMoney(note.amount, '')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatMoney(note.appliedAmount, '')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-orange-600">
                      {formatMoney(note.balance, '')}
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
                          className="text-[#2f3e1e] hover:text-[#1f2913]"
                          title="View details"
                        >
                          <i className="ri-eye-line"></i>
                        </button>
                        {note.balance > 0 && note.status !== 'cancelled' && (
                          <button
                            onClick={() => handleApplyNote(note)}
                            className="text-[#4a3c24] hover:text-[#2f3e1e]"
                            title="Apply note"
                          >
                            <i className="ri-check-line"></i>
                          </button>
                        )}
                        {note.status === 'pending' && (
                          <button
                            onClick={() => handleCancelNote(note.id)}
                            className="text-[#7a2e1b] hover:text-[#5c1f12]"
                            title="Cancel note"
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
            <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-[#e4d8c4] shadow-lg">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-[#2f3e1e]">New Debit Note</h3>
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
                    <label className="block text-sm font-medium text-[#4a3c24] mb-2">
                      Customer
                    </label>
                    <select 
                      required
                      name="customer_id"
                      value={noteCustomerId}
                      onChange={(e) => setNoteCustomerId(e.target.value)}
                      className="w-full p-3 border border-[#d8cbb5] bg-[#fffdf6] rounded-lg focus:ring-2 focus:ring-[#6b5c3b] focus:border-[#6b5c3b] pr-8"
                    >
                      <option value="">Select a customer</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-[#4a3c24] mb-2">
                      Date
                    </label>
                    <input
                      type="date"
                      required
                      name="date"
                      defaultValue={new Date().toISOString().split('T')[0]}
                      className="w-full p-3 border border-[#d8cbb5] bg-white rounded-lg focus:ring-2 focus:ring-[#6b5c3b] focus:border-[#6b5c3b]"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#4a3c24] mb-2">
                      Amount
                    </label>
                    <input
                      type="number" min="0"
                      step="0.01"
                      required
                      name="amount"
                      className="w-full p-3 border border-[#d8cbb5] bg-white rounded-lg focus:ring-2 focus:ring-[#6b5c3b] focus:border-[#6b5c3b]"
                      placeholder="0.00"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-[#4a3c24] mb-2">
                      Related Invoice <span className="text-red-500">*</span>
                    </label>
                    <select 
                      name="invoice_id"
                      required
                      className="w-full p-3 border border-[#d8cbb5] bg-[#fffdf6] rounded-lg focus:ring-2 focus:ring-[#6b5c3b] focus:border-[#6b5c3b] pr-8"
                    >
                      <option value="">Select an invoice</option>
                      {invoices
                        .filter((inv) => noteCustomerId && inv.customerId === noteCustomerId)
                        .map((inv) => (
                          <option key={inv.id} value={inv.id}>{inv.invoiceNumber}</option>
                        ))}
                    </select>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-[#4a3c24] mb-2">
                    Reason
                  </label>
                  <select 
                    required
                    name="reason"
                    className="w-full p-3 border border-[#d8cbb5] bg-[#fffdf6] rounded-lg focus:ring-2 focus:ring-[#6b5c3b] focus:border-[#6b5c3b] pr-8"
                  >
                    <option value="">Select a reason</option>
                    <option value="Late payment interest">Late payment interest</option>
                    <option value="Collection expenses">Collection expenses</option>
                    <option value="Price adjustment">Price adjustment</option>
                    <option value="Contract penalty">Contract penalty</option>
                    <option value="Service charge">Service charge</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-[#4a3c24] mb-2">
                    Accounts Receivable 
                  </label>
                  <select
                    name="ar_account_id"
                    className="w-full p-3 border border-[#d8cbb5] bg-[#fffdf6] rounded-lg focus:ring-2 focus:ring-[#6b5c3b] focus:border-[#6b5c3b] pr-8"
                    defaultValue=""
                  >
                    <option value="">Select AR account</option>
                    {arAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.code} - {acc.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#4a3c24] mb-2">
                    Credit account
                  </label>
                  <select
                    name="credit_account_id"
                    className="w-full p-3 border border-[#d8cbb5] bg-[#fffdf6] rounded-lg focus:ring-2 focus:ring-[#6b5c3b] focus:border-[#6b5c3b] pr-8"
                    defaultValue=""
                  >
                    <option value="">Select account</option>
                    {creditAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.code} - {acc.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#4a3c24] mb-2">
                    Concept
                  </label>
                  <textarea
                    rows={3}
                    required
                    name="concept"
                    className="w-full p-3 border border-[#d8cbb5] bg-white rounded-lg focus:ring-2 focus:ring-[#6b5c3b] focus:border-[#6b5c3b]"
                    placeholder="Describe the debit note details..."
                  />
                </div>
                
                <div className="flex space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowNoteModal(false)}
                    className="flex-1 bg-[#f3ecda] text-[#6b5c3b] py-2 rounded-lg hover:bg-[#e6ddc4] transition-colors whitespace-nowrap"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-[#2f3e1e] text-white py-2 rounded-lg hover:bg-[#1f2913] transition-colors whitespace-nowrap"
                  >
                    Create Debit Note
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Apply Debit Note Modal */}
        {showApplyModal && selectedNote && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-[#e4d8c4] shadow-lg">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-[#2f3e1e]">Apply Debit Note</h3>
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
              
              <div className="mb-4 p-4 bg-[#f3ecda] rounded-lg border border-[#e4d8c4]">
                <p className="text-sm text-[#4a3c24]">Note: <span className="font-semibold text-[#2f3e1e]">{selectedNote.noteNumber}</span></p>
                <p className="text-sm text-[#4a3c24]">Customer: <span className="font-semibold text-[#2f3e1e]">{selectedNote.customerName}</span></p>
                <p className="text-lg font-semibold text-[#bc6c2b]">Pending balance: {formatMoney(selectedNote.balance, '')}</p>
              </div>
              
              <form onSubmit={handleSaveApplication} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#4a3c24] mb-2">
                    Invoice to apply
                  </label>
                  <select 
                    required
                    name="invoice_id"
                    className="w-full p-3 border border-[#d8cbb5] bg-[#fffdf6] rounded-lg focus:ring-2 focus:ring-[#6b5c3b] focus:border-[#6b5c3b] pr-8"
                  >
                    <option value="">Select an invoice</option>
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
                  <label className="block text-sm font-medium text-[#4a3c24] mb-2">
                    Amount to apply
                  </label>
                  <input
                    type="number" min="0"
                    step="0.01"
                    name="amount_to_apply"
                    required
                    max={selectedNote?.balance ?? undefined}
                    className="w-full p-3 border border-[#d8cbb5] bg-white rounded-lg focus:ring-2 focus:ring-[#6b5c3b] focus:border-[#6b5c3b]"
                    placeholder="0.00"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-[#4a3c24] mb-2">
                    Notes
                  </label>
                  <textarea
                    rows={3}
                    className="w-full p-3 border border-[#d8cbb5] bg-white rounded-lg focus:ring-2 focus:ring-[#6b5c3b] focus:border-[#6b5c3b]"
                    placeholder="Comments about this application..."
                  />
                </div>
                
                <div className="flex space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowApplyModal(false);
                      setSelectedNote(null);
                    }}
                    className="flex-1 bg-[#f3ecda] text-[#6b5c3b] py-2 rounded-lg hover:bg-[#e6ddc4] transition-colors whitespace-nowrap"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-[#2f3e1e] text-white py-2 rounded-lg hover:bg-[#1f2913] transition-colors whitespace-nowrap"
                  >
                    Apply Note
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
                    <p className="text-2xl font-bold text-red-600">{formatMoney(selectedNote.amount, '')}</p>
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
                    <p className="text-lg font-semibold text-green-600">{formatMoney(selectedNote.appliedAmount, '')}</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-500">Saldo Pendiente</label>
                    <p className="text-2xl font-bold text-orange-600">{formatMoney(selectedNote.balance, '')}</p>
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