import { useEffect, useState } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { useAuth } from '../../../hooks/useAuth';
import { suppliersService, apQuotesService, settingsService } from '../../../services/database';
import { formatMoney } from '../../../utils/numberFormat';

const palette = {
  cream: '#F6F1E7',
  green: '#2F4F30',
  greenDark: '#1F2B1A',
  greenMid: '#4B5E2F',
  greenSoft: '#7E8F63',
  badgeNeutral: '#E5DCC3',
  badgeSoft: '#D3E0CF',
};

declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
    lastAutoTable?: { finalY: number };
  }
}

const statusLabels: Record<string, string> = {
  Pendiente: 'Pending',
  'En Evaluación': 'In Review',
  Aprobada: 'Approved',
  Rechazada: 'Rejected',
};

export default function QuotesPage() {
  const { user } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [editingQuote, setEditingQuote] = useState<any>(null);
  const [filterStatus, setFilterStatus] = useState('all');

  const [quotes, setQuotes] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'Materials',
    dueDate: '',
    estimatedAmount: '',
    specifications: '',
    suppliers: ['']
  });

  const [selectedQuote, setSelectedQuote] = useState<any>(null);

  const [suppliers, setSuppliers] = useState<any[]>([]);

  const loadSuppliers = async () => {
    if (!user?.id) {
      setSuppliers([]);
      return;
    }
    try {
      const data = await suppliersService.getAll(user.id);
      setSuppliers(data || []);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error loading suppliers for AP quotes', error);
      setSuppliers([]);
    }
  };

  const loadQuotes = async () => {
    if (!user?.id) {
      setQuotes([]);
      return;
    }
    try {
      const data = await apQuotesService.getAll(user.id);
      const mapped = (data || []).map((q: any) => ({
        id: q.id,
        number: q.number,
        date: q.created_at ? q.created_at.split('T')[0] : '',
        title: q.title || q.description?.slice(0, 60) || '',
        description: q.description || '',
        requestedBy: q.requested_by || '',
        estimatedAmount: Number(q.estimated_amount) || 0,
        suppliers: (q.ap_quote_suppliers || []).map((s: any) => ({
          name: s.supplier_name,
          amount: 0,
          deliveryTime: '',
          notes: '',
          status: 'Pendiente',
        })),
        dueDate: q.due_date || '',
        status: q.status || 'Pendiente',
        selectedSupplier: null,
        category: q.category || 'Materiales',
        specifications: q.specifications || '',
        responses: [],
      }));
      setQuotes(mapped);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error loading AP quotes', error);
      setQuotes([]);
    }
  };

  useEffect(() => {
    loadSuppliers();
    loadQuotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const filteredQuotes = quotes.filter(quote => {
    return filterStatus === 'all' || quote.status === filterStatus;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user?.id) {
      alert('You must sign in to record quote requests.');
      return;
    }

    const supplierNames = formData.suppliers.filter(s => s.trim() !== '');

    const quotePayload = {
      number: editingQuote?.number || `RFQ-${new Date().getFullYear()}-${String(quotes.length + 1).padStart(3, '0')}`,
      description: formData.description,
      due_date: formData.dueDate,
      estimated_amount: Number(formData.estimatedAmount || 0) || null,
      status: editingQuote?.status || 'Pendiente',
      requested_by: editingQuote?.requestedBy || null,
      specifications: formData.specifications || null,
    };

    try {
      if (editingQuote) {
        await apQuotesService.update(String(editingQuote.id), quotePayload, supplierNames);
      } else {
        await apQuotesService.create(user.id, quotePayload, supplierNames);
      }
      await loadQuotes();
      resetForm();
      alert(editingQuote ? 'Quote request updated successfully.' : 'Quote request created successfully.');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error saving AP quote', error);
      alert('The quote request could not be saved.');
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      category: 'Materials',
      dueDate: '',
      estimatedAmount: '',
      specifications: '',
      suppliers: ['']
    });
    setEditingQuote(null);
    setShowModal(false);
  };

  const handleEdit = (quote: any) => {
    setEditingQuote(quote);
    setFormData({
      title: quote.title,
      description: quote.description,
      category: quote.category,
      dueDate: quote.dueDate,
      estimatedAmount: String(quote.estimatedAmount || ''),
      specifications: quote.specifications || '',
      suppliers: quote.suppliers.map((s: any) => s.name)
    });
    setShowModal(true);
  };

  const handleApprove = async (id: string | number) => {
    if (!confirm('Approve this quote request?')) return;
    try {
      await apQuotesService.updateStatus(String(id), 'Aprobada');
      await loadQuotes();
      alert('Quote request approved.');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error approving AP quote', error);
      alert('The quote request could not be approved.');
    }
  };

  const handleReject = async (id: string | number) => {
    if (!confirm('Reject this quote request?')) return;
    try {
      await apQuotesService.updateStatus(String(id), 'Rechazada');
      await loadQuotes();
      alert('Quote request rejected.');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error rejecting AP quote', error);
      alert('The quote request could not be rejected.');
    }
  };

  const addSupplier = () => {
    setFormData({
      ...formData,
      suppliers: [...formData.suppliers, '']
    });
  };

  const removeSupplier = (index: number) => {
    if (formData.suppliers.length > 1) {
      setFormData({
        ...formData,
        suppliers: formData.suppliers.filter((_, i) => i !== index)
      });
    }
  };

  const updateSupplier = (index: number, value: string) => {
    const updatedSuppliers = formData.suppliers.map((supplier, i) =>
      i === index ? value : supplier
    );
    setFormData({ ...formData, suppliers: updatedSuppliers });
  };

  const formatDate = (value?: string | null) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString('es-DO');
  };

  const formatCurrency = (amount: number | null | undefined) => {
    const safe = Number(amount || 0);
    return formatMoney(safe, 'RD$');
  };

  const exportToPDF = async () => {
    const doc = new jsPDF();

    // Company header
    let companyName = 'ContaBi';

    try {
      const info = await settingsService.getCompanyInfo();
      if (info && (info as any)) {
        const resolvedName =
          (info as any).name ||
          (info as any).company_name ||
          (info as any).legal_name;
        if (resolvedName) {
          companyName = String(resolvedName);
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error obteniendo información de la empresa para PDF de solicitudes de cotización:', error);
    }

    const pageWidth = doc.internal.pageSize.getWidth();

    // Company name centered
    doc.setFontSize(14);
    doc.text(companyName, pageWidth / 2, 15, { align: 'center' as any });

    // Title centered
    doc.setFontSize(18);
    doc.text('Quote Requests', pageWidth / 2, 25, { align: 'center' as any });

    // Report info
    doc.setFontSize(11);
    doc.text(`Generated: ${new Date().toLocaleDateString('en-US')}`, 20, 40);
    doc.text(`Total Requests: ${filteredQuotes.length}`, 20, 48);

    // Table data
    const tableData = filteredQuotes.map((quote: any) => [
      quote.number,
      formatDate(quote.date),
      quote.description || quote.title,
      quote.requestedBy || '',
      formatDate(quote.dueDate),
      formatCurrency(quote.estimatedAmount),
      quote.status,
      quote.suppliers.length.toString(),
    ]);

    doc.autoTable({
      head: [['Number', 'Date', 'Description', 'Requested By', 'Due Date', 'Est. Amount', 'Status', 'Suppliers']],

      body: tableData,
      startY: 70,
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 3 },
      columnStyles: {
        2: { cellWidth: 50 }, // Descripción
        4: { halign: 'right' }, // Vencimiento
        5: { halign: 'right' }, // Monto Est.
        7: { halign: 'center' }, // Proveedores
      },
    });

    doc.addPage();
    doc.setFontSize(16);
    doc.text('Suppliers Detail by Quote', 20, 20);

    let startY = 40;
    filteredQuotes.forEach((quote: any) => {
      if (startY > 250) {
        doc.addPage();
        startY = 20;
      }

      doc.setFontSize(12);
      doc.text(`${quote.number} - ${quote.title}`, 20, startY);
      startY += 10;

      if (quote.suppliers.length > 0) {
        const supplierData = quote.suppliers.map((supplier: { name: string; amount: number; deliveryTime?: string; notes?: string; status: string }) => [
          supplier.name,
          supplier.amount > 0 ? formatCurrency(supplier.amount) : 'Pendiente',
          supplier.deliveryTime || 'N/A',
          supplier.status,
        ]);

        doc.autoTable({
          head: [['Supplier', 'Amount', 'Delivery Time', 'Status']],

          body: supplierData,
          startY: startY,
          theme: 'grid',
          headStyles: { fillColor: [34, 197, 94], fontSize: 10 },
          styles: { fontSize: 9 },
          columnStyles: {
            1: { halign: 'right' },
          },
          margin: { left: 20, right: 20 }
        });

        const anyDoc = doc as any;
        startY = (anyDoc.lastAutoTable?.finalY || startY) + 15;
      } else {
        startY += 10;
      }
    });

    const pendingQuotes = filteredQuotes.filter(q => q.status === 'Pendiente').length;

    const approvedQuotes = filteredQuotes.filter(q => q.status === 'Aprobada').length;
    const rejectedQuotes = filteredQuotes.filter(q => q.status === 'Rechazada').length;

    doc.addPage();
    doc.setFontSize(16);
    doc.text('Summary', 20, 20);

    doc.autoTable({
      body: [
        ['Pending Requests:', `${pendingQuotes}`],
        ['Approved Requests:', `${approvedQuotes}`],
        ['Rejected Requests:', `${rejectedQuotes}`],
        ['Total Requests:', `${filteredQuotes.length}`]
      ],

      startY: 40,
      theme: 'plain',
      styles: { fontStyle: 'bold' }
    });

    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {

      doc.setPage(i);
      doc.setFontSize(10);
      doc.text(
        `Page ${i} of ${pageCount}`,
        doc.internal.pageSize.width - 50,
        doc.internal.pageSize.height - 10,
      );
      doc.text('ContaBi • Quote Requests', 20, doc.internal.pageSize.height - 10);
    }

    doc.save(`quote-requests-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const exportToExcel = async () => {
    if (!filteredQuotes.length) {
      alert('No quote requests to export.');
      return;
    }

    let companyName = 'ContaBi';
    try {
      const info = await settingsService.getCompanyInfo();
      if (info) {
        companyName = (info as any).name || (info as any).company_name || 'ContaBi';
      }
    } catch {
      // usar default
    }

    const wb = new ExcelJS.Workbook();

    const applyHeaderStyle = (row: ExcelJS.Row) => {
      row.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1F3A' } } as any;
        cell.alignment = { vertical: 'middle', horizontal: 'center' } as any;
      });
    };

    const ws = wb.addWorksheet('Quote Requests');
    const headers = [
      { title: 'Number', width: 18 },
      { title: 'Date', width: 14 },
      { title: 'Title', width: 30 },
      { title: 'Description', width: 40 },
      { title: 'Category', width: 16 },
      { title: 'Due Date', width: 14 },
      { title: 'Estimated Amount', width: 18 },
      { title: 'Status', width: 14 },
      { title: 'Selected Supplier', width: 24 },
    ];

    let currentRow = 1;
    ws.mergeCells(currentRow, 1, currentRow, headers.length);
    ws.getCell(currentRow, 1).value = companyName;
    ws.getCell(currentRow, 1).font = { bold: true, size: 14 };
    currentRow++;

    ws.mergeCells(currentRow, 1, currentRow, headers.length);
    ws.getCell(currentRow, 1).value = 'Quote Requests';

    ws.getCell(currentRow, 1).font = { bold: true, size: 12 };
    currentRow++;

    ws.mergeCells(currentRow, 1, currentRow, headers.length);
    ws.getCell(currentRow, 1).value = `Generated: ${new Date().toLocaleDateString('en-US')}`;

    currentRow++;
    currentRow++;

    const headerRow = ws.getRow(currentRow);
    headers.forEach((h, idx) => {
      headerRow.getCell(idx + 1).value = h.title;
    });
    applyHeaderStyle(headerRow);
    currentRow++;

    for (const q of filteredQuotes) {
      const r = ws.getRow(currentRow);
      r.getCell(1).value = q.number;
      r.getCell(2).value = formatDate(q.date);
      r.getCell(3).value = q.title;
      r.getCell(4).value = q.description;
      r.getCell(5).value = q.category;
      r.getCell(6).value = formatDate(q.dueDate);
      r.getCell(7).value = Number(q.estimatedAmount || 0);
      r.getCell(8).value = q.status;
      r.getCell(9).value = q.selectedSupplier || 'N/A';
      currentRow++;
    }

    ws.getColumn(7).numFmt = '#,##0.00';
    headers.forEach((h, idx) => {
      ws.getColumn(idx + 1).width = h.width;
    });

    currentRow++;
    ws.getCell(currentRow, 1).value = 'Summary';

    ws.getCell(currentRow, 1).font = { bold: true };
    currentRow++;
    ws.getCell(currentRow, 1).value = 'Pending';

    ws.getCell(currentRow, 2).value = filteredQuotes.filter((q) => q.status === 'Pendiente').length;
    currentRow++;
    ws.getCell(currentRow, 1).value = 'Approved';

    ws.getCell(currentRow, 2).value = filteredQuotes.filter((q) => q.status === 'Aprobada').length;
    currentRow++;
    ws.getCell(currentRow, 1).value = 'Rejected';

    ws.getCell(currentRow, 2).value = filteredQuotes.filter((q) => q.status === 'Rechazada').length;
    currentRow++;
    ws.getCell(currentRow, 1).value = 'Total';

    ws.getCell(currentRow, 2).value = filteredQuotes.length;

    const wsSupp = wb.addWorksheet('Suppliers');
    const suppHeaders = [
      { title: 'Quote', width: 18 },
      { title: 'Supplier', width: 30 },
      { title: 'Amount', width: 16 },
      { title: 'Delivery Time', width: 18 },
      { title: 'Notes', width: 30 },
      { title: 'Status', width: 14 },
    ];

    const suppHeaderRow = wsSupp.getRow(1);
    suppHeaders.forEach((h, idx) => {
      suppHeaderRow.getCell(idx + 1).value = h.title;
    });
    applyHeaderStyle(suppHeaderRow);

    let suppRow = 2;
    for (const q of filteredQuotes) {
      for (const s of q.suppliers || []) {
        const r = wsSupp.getRow(suppRow);
        r.getCell(1).value = q.number;
        r.getCell(2).value = s.name;
        r.getCell(3).value = Number(s.amount || 0);
        r.getCell(4).value = s.deliveryTime || '';
        r.getCell(5).value = s.notes || '';
        r.getCell(6).value = s.status;
        suppRow++;
      }
    }

    wsSupp.getColumn(3).numFmt = '#,##0.00';
    suppHeaders.forEach((h, idx) => {
      wsSupp.getColumn(idx + 1).width = h.width;
    });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    saveAs(blob, `quote-requests-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleViewDetails = (quote: any) => {
    setSelectedQuote(quote);
  };

  const sendQuoteRequest = async (quote: any) => {
    if (!confirm(`¿Enviar la solicitud ${quote.number} a proveedores?`)) return;
    try {
      await apQuotesService.updateStatus(String(quote.id), 'En Evaluación');
      await loadQuotes();
      alert('Solicitud de cotización enviada a proveedores y marcada como En Evaluación');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error sending AP quote request', error);
      alert('No se pudo enviar la solicitud de cotización');
    }
  };

  const handleEvaluate = async (id: string | number) => {
    if (!confirm('¿Cambiar estado a En Evaluación?')) return;
    try {
      await apQuotesService.updateStatus(String(id), 'En Evaluación');
      await loadQuotes();
      alert('Estado cambiado a En Evaluación');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error setting AP quote to evaluation', error);
      alert('No se pudo cambiar el estado a En Evaluación');
    }
  };

  const translateStatus = (status: string) => statusLabels[status] || status;

  return (
    <DashboardLayout>
      <div
        className="space-y-6 rounded-3xl"
        style={{ backgroundColor: palette.cream, minHeight: '100vh', padding: '24px' }}
      >
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-wide font-semibold" style={{ color: palette.greenSoft }}>
              Procurement · Vendor Quotes
            </p>
            <h1 className="text-3xl font-bold" style={{ color: palette.greenDark }}>
              Quote Requests
            </h1>
            <p className="text-base" style={{ color: palette.greenSoft }}>
              Manage vendor requests, follow-ups, and comparison workflows
            </p>
          </div>
          <div className="flex space-x-3">
            <button 
              onClick={exportToPDF}
              className="px-4 py-2 rounded-lg font-semibold text-white transition-colors whitespace-nowrap shadow"
              style={{ backgroundColor: palette.greenDark }}
            >
              <i className="ri-file-pdf-line mr-2"></i>
              Export PDF
            </button>
            <button 
              onClick={exportToExcel}
              className="px-4 py-2 rounded-lg font-semibold text-white transition-colors whitespace-nowrap shadow"
              style={{ backgroundColor: palette.greenMid }}
            >
              <i className="ri-file-excel-line mr-2"></i>
              Export Excel
            </button>
            <button 
              onClick={() => setShowModal(true)}
              className="px-4 py-2 rounded-lg font-semibold text-white transition-colors whitespace-nowrap shadow"
              style={{ backgroundColor: palette.green }}
            >
              <i className="ri-add-line mr-2"></i>
              New Request
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white rounded-2xl shadow-sm border border-[rgba(47,79,48,0.15)] p-6">
            <div className="flex items-center">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mr-4" style={{ backgroundColor: palette.badgeSoft }}>
                <i className="ri-file-list-line text-xl" style={{ color: palette.greenDark }}></i>
              </div>
              <div>
                <p className="text-sm font-medium" style={{ color: palette.greenSoft }}>Total Requests</p>
                <p className="text-2xl font-bold" style={{ color: palette.greenDark }}>{quotes.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-[rgba(47,79,48,0.15)] p-6">
            <div className="flex items-center">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mr-4" style={{ backgroundColor: '#F2E3C1' }}>
                <i className="ri-time-line text-xl" style={{ color: palette.greenMid }}></i>
              </div>
              <div>
                <p className="text-sm font-medium" style={{ color: palette.greenSoft }}>Pending</p>
                <p className="text-2xl font-bold" style={{ color: palette.greenDark }}>{quotes.filter(q => q.status === 'Pendiente').length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-[rgba(47,79,48,0.15)] p-6">
            <div className="flex items-center">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mr-4" style={{ backgroundColor: '#E5D7F0' }}>
                <i className="ri-search-line text-xl" style={{ color: palette.green }}></i>
              </div>
              <div>
                <p className="text-sm font-medium" style={{ color: palette.greenSoft }}>In Review</p>
                <p className="text-2xl font-bold" style={{ color: palette.greenDark }}>{quotes.filter(q => q.status === 'En Evaluación').length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-[rgba(47,79,48,0.15)] p-6">
            <div className="flex items-center">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mr-4" style={{ backgroundColor: palette.badgeNeutral }}>
                <i className="ri-check-line text-xl" style={{ color: palette.green }}></i>
              </div>
              <div>
                <p className="text-sm font-medium" style={{ color: palette.greenSoft }}>Approved</p>
                <p className="text-2xl font-bold" style={{ color: palette.greenDark }}>{quotes.filter(q => q.status === 'Aprobada').length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl shadow-sm border border-[rgba(47,79,48,0.15)] p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: palette.greenDark }}>
                Status <span className="text-red-500">*</span>
              </label>
              <select 
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2"
                style={{ borderColor: palette.badgeNeutral, color: palette.greenDark }}
              >
                <option value="all">All Statuses</option>
                <option value="Pendiente">Pending</option>
                <option value="En Evaluación">In Review</option>
                <option value="Aprobada">Approved</option>
                <option value="Rechazada">Rejected</option>
              </select>
            </div>
            <div className="md:col-span-2 flex items-end">
              <button 
                onClick={() => setFilterStatus('all')}
                className="w-full text-white py-2 px-4 rounded-lg transition-colors whitespace-nowrap shadow"
                style={{ backgroundColor: palette.greenDark }}
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>

        {/* Quotes Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-[rgba(47,79,48,0.15)]">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold" style={{ color: palette.greenDark }}>Quote Request List</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Number</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Requested By</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Due Date</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Est. Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredQuotes.map((quote) => (
                  <tr key={quote.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{quote.number}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{quote.date}</td>
                    <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">{quote.description}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{quote.requestedBy}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{quote.dueDate}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold text-gray-900">
                      RD$ {quote.estimatedAmount.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        quote.status === 'Aprobada' ? 'bg-green-100 text-green-800' :
                        quote.status === 'Pendiente' ? 'bg-orange-100 text-orange-800' :
                        quote.status === 'En Evaluación' ? 'bg-purple-100 text-purple-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {translateStatus(quote.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button 
                          onClick={() => handleViewDetails(quote)}
                          className="text-blue-600 hover:text-blue-900 whitespace-nowrap"
                        >
                          <i className="ri-eye-line"></i>
                        </button>
                        {quote.status === 'Pendiente' && (
                          <button 
                            onClick={() => handleEvaluate(quote.id)}
                            className="text-purple-600 hover:text-purple-900 whitespace-nowrap"
                          >
                            <i className="ri-search-line"></i>
                          </button>
                        )}
                        {quote.status === 'En Evaluación' && (
                          <>
                            <button 
                              onClick={() => handleApprove(quote.id)}
                              className="text-green-600 hover:text-green-900 whitespace-nowrap"
                            >
                              <i className="ri-check-line"></i>
                            </button>
                            <button 
                              onClick={() => handleReject(quote.id)}
                              className="text-red-600 hover:text-red-900 whitespace-nowrap"
                            >
                              <i className="ri-close-line"></i>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* New Quote Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">New Quote Request</h3>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Description *</label>
                  <textarea 
                    required
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Describe the products or services you need..."
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Estimated Amount <span className="text-red-500">*</span></label>
                    <input 
                      type="number" min="0"
                      step="0.01"
                      value={formData.estimatedAmount}
                      onChange={(e) => setFormData({...formData, estimatedAmount: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Due Date *</label>
                    <input 
                      type="date"
                      required
                      value={formData.dueDate}
                      onChange={(e) => setFormData({...formData, dueDate: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
                {/* Suppliers */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-medium text-gray-700">Suppliers to Contact *</label>
                    <button 
                      type="button"
                      onClick={addSupplier}
                      className="text-white px-3 py-1 rounded text-sm hover:shadow-md whitespace-nowrap transition-colors"
                      style={{ backgroundColor: '#4b5c4b', boxShadow: '0 2px 6px rgba(75,92,75,0.2)' }}
                    >
                      <i className="ri-add-line mr-1"></i>
                      Add
                    </button>
                  </div>

                  <div className="space-y-2">
                    {formData.suppliers.map((supplier, index) => (
                      <div key={index} className="flex gap-2">
                        <select 
                          required
                          value={supplier}
                          onChange={(e) => updateSupplier(index, e.target.value)}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="">Select supplier</option>
                          {suppliers.map((sup: any) => (
                            <option key={sup.id} value={sup.name}>{sup.name}</option>
                          ))}
                        </select>
                        {formData.suppliers.length > 1 && (
                          <button 
                            type="button"
                            onClick={() => removeSupplier(index)}
                            className="text-red-600 hover:text-red-900 px-2 whitespace-nowrap"
                          >
                            <i className="ri-delete-bin-line"></i>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Additional Specifications</label>
                  <textarea 
                    value={formData.specifications}
                    onChange={(e) => setFormData({...formData, specifications: e.target.value})}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Technical specs, delivery terms, etc."
                  />
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <button 
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 whitespace-nowrap"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="px-4 py-2 text-white rounded-lg whitespace-nowrap transition-colors shadow-sm"
                    style={{ backgroundColor: '#4b5c4b', boxShadow: '0 6px 14px rgba(47,62,30,0.25)' }}
                  >
                    Create Request
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        {selectedQuote && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Quote Details - {selectedQuote.number}</h3>
                  <button 
                    onClick={() => setSelectedQuote(null)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <i className="ri-close-line text-xl"></i>
                  </button>
                </div>
              </div>
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Number</p>
                    <p className="text-sm text-gray-900">{selectedQuote.number}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">Date</p>
                    <p className="text-sm text-gray-900">{selectedQuote.date}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">Requested By</p>
                    <p className="text-sm text-gray-900">{selectedQuote.requestedBy}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">Due Date</p>
                    <p className="text-sm text-gray-900">{selectedQuote.dueDate}</p>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-sm font-medium text-gray-600">Description</p>
                    <p className="text-sm text-gray-900">{selectedQuote.description}</p>
                  </div>
                </div>

                {/* Responses */}
                <div>
                  <h4 className="text-md font-semibold text-gray-900 mb-4">Supplier Responses</h4>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Supplier</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Delivery Time</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {(selectedQuote.responses || []).map((response: any, index: number) => (
                          <tr key={index}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{response.supplier}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold text-gray-900">
                              {response.amount > 0 ? `RD$ ${response.amount.toLocaleString()}` : 'Pending'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{response.deliveryTime || 'N/A'}</td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                                response.status === 'Recibida' ? 'bg-green-100 text-green-800' :
                                response.status === 'Seleccionada' ? 'bg-blue-100 text-blue-800' :
                                response.status === 'Rechazada' ? 'bg-red-100 text-red-800' :
                                'bg-orange-100 text-orange-800'
                              }`}>
                                {response.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}