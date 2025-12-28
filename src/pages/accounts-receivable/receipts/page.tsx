import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

import { useAuth } from '../../../hooks/useAuth';
import { customersService, receiptsService, invoicesService, receiptApplicationsService, settingsService } from '../../../services/database';
import { exportToExcelWithHeaders } from '../../../utils/exportImportUtils';
import { formatDate } from '../../../utils/dateFormat';
import { formatAmount } from '../../../utils/numberFormat';
import DateInput from '../../../components/common/DateInput';

interface Receipt {
  id: string;
  receiptNumber: string;
  customerId: string;
  customerName: string;
  date: string;
  amount: number;
  paymentMethod: 'cash' | 'check' | 'transfer' | 'card';
  reference: string;
  concept: string;
  status: 'active' | 'cancelled';
  invoiceNumbers: string[];
}

interface CustomerOption {
  id: string;
  name: string;
  document?: string;
  phone?: string;
  email?: string;
  address?: string;
}

interface NewReceiptInvoiceOption {
  id: string;
  invoiceNumber: string;
  totalAmount: number;
  paidAmount: number;
  balance: number;
}

export default function ReceiptsPage() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('all');
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showReceiptDetails, setShowReceiptDetails] = useState(false);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);
  const [selectedReceiptAvailableAmount, setSelectedReceiptAvailableAmount] = useState<number>(0);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loadingReceipts, setLoadingReceipts] = useState(false);

  const [applyInvoices, setApplyInvoices] = useState<Array<{ id: string; invoiceNumber: string; totalAmount: number; paidAmount: number; balance: number }>>([]);
  const [loadingApplyInvoices, setLoadingApplyInvoices] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');

  const [newReceiptInvoices, setNewReceiptInvoices] = useState<NewReceiptInvoiceOption[]>([]);
  const [loadingNewReceiptInvoices, setLoadingNewReceiptInvoices] = useState(false);
  const [newReceiptInvoiceId, setNewReceiptInvoiceId] = useState<string>('');
  const [newReceiptAmount, setNewReceiptAmount] = useState<string>('');

  const getPaymentMethodName = (method: string) => {
    switch (method) {
      case 'cash': return 'Efectivo';
      case 'check': return 'Cheque';
      case 'transfer': return 'Transferencia';
      case 'card': return 'Tarjeta';
      default: return 'Otro';
    }
  };

  const calculateReceiptAvailableAmount = async (receipt: Receipt): Promise<number> => {
    if (!user?.id) return receipt.amount;
    try {
      const apps = await receiptApplicationsService.getByReceipt(user.id, receipt.id);
      const alreadyApplied = ((apps || []) as any[]).reduce(
        (sum, app) => sum + (Number((app as any).amount_applied) || 0),
        0,
      );
      const remaining = receipt.amount - alreadyApplied;
      return remaining > 0 ? remaining : 0;
    } catch {
      return receipt.amount;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusName = (status: string) => {
    switch (status) {
      case 'active': return 'Activo';
      case 'cancelled': return 'Anulado';
      default: return 'Desconocido';
    }
  };

  const enrichReceiptWithInvoices = async (receipt: Receipt): Promise<Receipt> => {
    if (!user?.id) return receipt;
    try {
      const apps = await receiptApplicationsService.getByReceipt(user.id, receipt.id);
      const invoiceNumbers = ((apps || []) as any[])
        .map((app) => (app.invoices as any)?.invoice_number as string | undefined)
        .filter((num) => !!num) as string[];
      return { ...receipt, invoiceNumbers };
    } catch {
      return receipt;
    }
  };

  const filteredReceipts = receipts.filter(receipt => {
    const matchesSearch = receipt.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         receipt.receiptNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         receipt.reference.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || receipt.status === statusFilter;
    const matchesPaymentMethod = paymentMethodFilter === 'all' || receipt.paymentMethod === paymentMethodFilter;
    return matchesSearch && matchesStatus && matchesPaymentMethod;
  });

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId) || null;
  const selectedReceiptCustomer = selectedReceipt
    ? customers.find((c) => c.id === selectedReceipt.customerId) || null
    : null;

  const selectedNewReceiptInvoice = newReceiptInvoices.find((inv) => inv.id === newReceiptInvoiceId) || null;

  const loadCustomers = async () => {
    if (!user?.id) return;
    setLoadingCustomers(true);
    try {
      const list = await customersService.getAll(user.id);
      setCustomers(
        (list || []).map((c: any) => ({
          id: String(c.id),
          name: String(c.name),
          document: c.document ? String(c.document) : '',
          phone: c.phone ? String(c.phone) : '',
          email: c.email ? String(c.email) : '',
          address: c.address ? String(c.address) : '',
        })),
      );
    } finally {
      setLoadingCustomers(false);
    }
  };

  useEffect(() => {
    loadCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const loadReceipts = async () => {
    if (!user?.id) return;
    setLoadingReceipts(true);
    try {
      const data = await receiptsService.getAll(user.id);
      const mapped: Receipt[] = (data as any[]).map((r) => ({
        id: String(r.id),
        receiptNumber: r.receipt_number as string,
        customerId: String(r.customer_id),
        customerName: (r.customers as any)?.name || 'Cliente',
        date: r.receipt_date as string,
        amount: Number(r.amount) || 0,
        paymentMethod: (r.payment_method as Receipt['paymentMethod']) || 'cash',
        reference: (r.reference as string) || '',
        concept: (r.concept as string) || '',
        status: (r.status as Receipt['status']) || 'active',
        invoiceNumbers: [],
      }));
      setReceipts(mapped);
    } finally {
      setLoadingReceipts(false);
    }
  };

  useEffect(() => {
    loadReceipts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const loadInvoicesForNewReceiptCustomer = async (customerId: string) => {
    if (!user?.id || !customerId) {
      setNewReceiptInvoices([]);
      return;
    }
    setLoadingNewReceiptInvoices(true);
    try {
      const data = await invoicesService.getAll(user.id);
      const mapped: NewReceiptInvoiceOption[] = (data as any[])
        .filter((inv) => String(inv.customer_id) === String(customerId) && inv.status !== 'Cancelada')
        .map((inv) => {
          const total = Number(inv.total_amount) || 0;
          const paid = Number(inv.paid_amount) || 0;
          const balance = total - paid;
          return {
            id: String(inv.id),
            invoiceNumber: String(inv.invoice_number || ''),
            totalAmount: total,
            paidAmount: paid,
            balance: balance > 0 ? balance : 0,
          };
        })
        .filter((inv) => inv.balance > 0);

      setNewReceiptInvoices(mapped);
    } finally {
      setLoadingNewReceiptInvoices(false);
    }
  };

  const handleNewReceiptCustomerChange = async (customerId: string) => {
    setSelectedCustomerId(customerId);
    setNewReceiptInvoiceId('');
    setNewReceiptAmount('');
    await loadInvoicesForNewReceiptCustomer(customerId);
  };

  const handleNewReceiptInvoiceChange = (invoiceId: string) => {
    setNewReceiptInvoiceId(invoiceId);
    const inv = newReceiptInvoices.find((x) => x.id === invoiceId);
    if (inv) {
      setNewReceiptAmount(inv.balance ? String(inv.balance) : '');
    } else {
      setNewReceiptAmount('');
    }
  };

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
      console.error('Error obteniendo información de la empresa para PDF de recibos de cobro:', error);
    }

    doc.setFontSize(16);
    doc.text(companyName, pageWidth / 2, 15, { align: 'center' } as any);

    doc.setFontSize(20);
    doc.text('Reporte de Recibos de Cobro', 20, 30);
    
    doc.setFontSize(12);
    doc.text(`Fecha de generación: ${formatDate(new Date())}`, 20, 45);
    doc.text(`Estado: ${statusFilter === 'all' ? 'Todos' : statusFilter}`, 20, 55);
    doc.text(`Método de pago: ${paymentMethodFilter === 'all' ? 'Todos' : getPaymentMethodName(paymentMethodFilter)}`, 20, 65);
    
    // Estadísticas
    const totalAmount = filteredReceipts.reduce((sum, receipt) => sum + receipt.amount, 0);
    const activeReceipts = filteredReceipts.filter(r => r.status === 'active').length;
    const cancelledReceipts = filteredReceipts.filter(r => r.status === 'cancelled').length;
    
    doc.setFontSize(14);
    doc.text('Resumen de Recibos', 20, 80);
    
    const summaryData = [
      ['Concepto', 'Valor'],
      ['Total Recibido', `RD$ ${formatAmount(totalAmount)}`],
      ['Recibos Activos', activeReceipts.toString()],
      ['Recibos Anulados', cancelledReceipts.toString()],
      ['Total de Recibos', filteredReceipts.length.toString()]
    ];
    
    (doc as any).autoTable({
      startY: 90,
      head: [summaryData[0]],
      body: summaryData.slice(1),
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246] }
    });
    
    // Tabla de recibos
    doc.setFontSize(14);
    doc.text('Detalle de Recibos', 20, (doc as any).lastAutoTable.finalY + 20);

    const receiptData = filteredReceipts.map((receipt) => {
      const customer = customers.find((c) => c.id === receipt.customerId);
      const customerDocument = customer?.document || '';
      const customerPhone = customer?.phone || '';
      const customerEmail = customer?.email || '';
      const customerAddress = customer?.address || '';
      return [
        receipt.receiptNumber,
        receipt.customerName,
        customerDocument,
        customerPhone,
        customerEmail,
        customerAddress,
        formatDate(receipt.date),
        `RD$ ${formatAmount(receipt.amount)}`,
        getPaymentMethodName(receipt.paymentMethod),
        receipt.reference,
        getStatusName(receipt.status),
      ];
    });

    (doc as any).autoTable({
      startY: (doc as any).lastAutoTable.finalY + 30,
      head: [['Recibo', 'Cliente', 'Documento', 'Teléfono', 'Email', 'Dirección', 'Fecha', 'Monto', 'Método', 'Referencia', 'Estado']],
      body: receiptData,
      theme: 'striped',
      headStyles: { fillColor: [34, 197, 94] },
      styles: { fontSize: 8 }
    });
    
    doc.save(`recibos-cobro-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const exportToExcel = async () => {
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
      console.error('Error obteniendo información de la empresa para Excel de recibos de cobro:', error);
    }

    if (!filteredReceipts.length) {
      alert('No hay recibos para exportar con los filtros actuales.');
      return;
    }

    const totalAmount = filteredReceipts.reduce((sum, receipt) => sum + receipt.amount, 0);
    const activeReceipts = filteredReceipts.filter((r) => r.status === 'active').length;
    const cancelledReceipts = filteredReceipts.filter((r) => r.status === 'cancelled').length;

    const todayIso = new Date().toISOString().split('T')[0];
    const todayLocal = formatDate(new Date());

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Recibos de Cobro');

    // Encabezado principal
    worksheet.mergeCells('A1:L1');
    worksheet.getCell('A1').value = companyName;
    worksheet.getCell('A1').font = { bold: true, size: 16 } as any;
    worksheet.getCell('A1').alignment = { horizontal: 'center' } as any;

    worksheet.mergeCells('A2:L2');
    worksheet.getCell('A2').value = 'Reporte de Recibos de Cobro';
    worksheet.getCell('A2').font = { bold: true, size: 12 } as any;
    worksheet.getCell('A2').alignment = { horizontal: 'center' } as any;

    worksheet.getCell('A3').value = `Fecha de generación: ${todayLocal}`;
    worksheet.getCell('A4').value = `Estado: ${statusFilter === 'all' ? 'Todos' : statusFilter}`;
    worksheet.getCell('A5').value = `Método de pago: ${paymentMethodFilter === 'all' ? 'Todos' : getPaymentMethodName(paymentMethodFilter)}`;

    // Resumen de recibos
    worksheet.addRow([]);
    const resumenTitleRow = worksheet.addRow(['RESUMEN DE RECIBOS']);
    resumenTitleRow.font = { bold: true } as any;

    const resumenStartRow = resumenTitleRow.number + 1;
    worksheet.getCell(`A${resumenStartRow}`).value = 'Total Recibido';
    worksheet.getCell(`B${resumenStartRow}`).value = totalAmount;

    worksheet.getCell(`A${resumenStartRow + 1}`).value = 'Recibos Activos';
    worksheet.getCell(`B${resumenStartRow + 1}`).value = activeReceipts;

    worksheet.getCell(`A${resumenStartRow + 2}`).value = 'Recibos Anulados';
    worksheet.getCell(`B${resumenStartRow + 2}`).value = cancelledReceipts;

    worksheet.getCell(`A${resumenStartRow + 3}`).value = 'Total de Recibos';
    worksheet.getCell(`B${resumenStartRow + 3}`).value = filteredReceipts.length;

    // Formato numérico RD$ para total recibido
    const totalCell = worksheet.getCell(`B${resumenStartRow}`);
    totalCell.numFmt = '#,##0.00';

    worksheet.addRow([]);

    // Detalle de recibos
    const detalleTitleRow = worksheet.addRow(['DETALLE DE RECIBOS']);
    detalleTitleRow.font = { bold: true } as any;

    const headerRow = worksheet.addRow([
      'Recibo',
      'Cliente',
      'Documento',
      'Teléfono',
      'Email',
      'Dirección',
      'Fecha',
      'Monto',
      'Método',
      'Referencia',
      'Concepto',
      'Estado',
    ]);
    headerRow.font = { bold: true } as any;

    filteredReceipts.forEach((receipt) => {
      const customer = customers.find((c) => c.id === receipt.customerId);
      const customerDocument = customer?.document || '';
      const customerPhone = customer?.phone || '';
      const customerEmail = customer?.email || '';
      const customerAddress = customer?.address || '';

      worksheet.addRow([
        receipt.receiptNumber,
        receipt.customerName,
        customerDocument,
        customerPhone,
        customerEmail,
        customerAddress,
        formatDate(receipt.date),
        receipt.amount,
        getPaymentMethodName(receipt.paymentMethod),
        receipt.reference,
        receipt.concept,
        getStatusName(receipt.status),
      ]);
    });

    // Anchos de columnas
    worksheet.columns = [
      { width: 16 },
      { width: 28 },
      { width: 20 },
      { width: 16 },
      { width: 28 },
      { width: 40 },
      { width: 14 },
      { width: 16 },
      { width: 18 },
      { width: 24 },
      { width: 32 },
      { width: 14 },
    ];

    // Formato numérico para la columna de monto
    const amountColumn = worksheet.getColumn(8);
    (amountColumn as any).numFmt = '#,##0.00';

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    saveAs(blob, `recibos-cobro-${todayIso}.xlsx`);
  };

  const handleNewReceipt = () => {
    setSelectedReceipt(null);
    setSelectedCustomerId('');
    setNewReceiptInvoices([]);
    setNewReceiptInvoiceId('');
    setNewReceiptAmount('');
    setShowReceiptModal(true);
  };

  const handleViewReceipt = (receipt: Receipt) => {
    setSelectedReceipt(receipt);
    setShowReceiptDetails(true);
  };

  const handleApplyReceipt = async (receipt: Receipt) => {
    const available = await calculateReceiptAvailableAmount(receipt);

    if (!available || available <= 0) {
      alert('Este recibo ya fue aplicado completamente. Solo está disponible para reimpresión.');
      return;
    }

    setSelectedReceipt(receipt);
    setSelectedReceiptAvailableAmount(available);
    await loadInvoicesForReceipt(receipt);
    setShowApplyModal(true);
  };

  const handleSaveApplication = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user?.id || !selectedReceipt) {
      alert('Debes iniciar sesión y seleccionar un recibo válido');
      return;
    }

    const formData = new FormData(e.currentTarget);
    const invoiceId = String(formData.get('invoice_id') || '');
    const amountToApply = Number(formData.get('amount_to_apply') || 0);
    const notes = String(formData.get('notes') || '');

    if (!invoiceId) {
      alert('Debes seleccionar una factura');
      return;
    }
    if (!amountToApply || amountToApply <= 0) {
      alert('El monto a aplicar debe ser mayor que 0');
      return;
    }

    const targetInvoice = applyInvoices.find((inv) => inv.id === invoiceId);
    if (!targetInvoice) {
      alert('La factura seleccionada no es válida');
      return;
    }
    if (amountToApply > targetInvoice.totalAmount) {
      alert('El monto a aplicar no puede ser mayor que el monto de la factura');
      return;
    }

    try {
      const apps = await receiptApplicationsService.getByReceipt(user.id, selectedReceipt.id);
      const alreadyApplied = ((apps || []) as any[]).reduce(
        (sum, app) => sum + (Number((app as any).amount_applied) || 0),
        0,
      );
      const availableForReceipt = selectedReceipt.amount - alreadyApplied;
      if (amountToApply > availableForReceipt) {
        alert('El monto a aplicar no puede ser mayor que el monto disponible del recibo.');
        return;
      }
    } catch (checkError) {
      // eslint-disable-next-line no-console
      console.error('[Receipts] Error verificando monto disponible del recibo', checkError);
    }

    try {
      await receiptApplicationsService.create(user.id, {
        receipt_id: selectedReceipt.id,
        invoice_id: invoiceId,
        amount_applied: amountToApply,
        notes: notes || null,
      });

      alert('Recibo aplicado exitosamente a la factura');
      setShowApplyModal(false);
      setSelectedReceipt(null);
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('[Receipts] Error al aplicar recibo', error);
      alert(`Error al aplicar el recibo: ${error?.message || 'revisa la consola para más detalles'}`);
    }
  };

  const handleCancelReceipt = async (receiptId: string) => {
    if (!user?.id) {
      alert('Debes iniciar sesión para anular recibos');
      return;
    }
    if (!confirm('¿Está seguro de que desea anular este recibo?')) return;
    try {
      await receiptsService.updateStatus(receiptId, 'cancelled');
      await loadReceipts();
      alert('Recibo anulado exitosamente');
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('[Receipts] Error al anular recibo', error);
      alert(`Error al anular el recibo: ${error?.message || 'revisa la consola para más detalles'}`);
    }
  };

  const handleReactivateReceipt = async (receiptId: string) => {
    if (!user?.id) {
      alert('Debes iniciar sesión para reactivar recibos');
      return;
    }
    if (!confirm('¿Desea reactivar este recibo anulado?')) return;
    try {
      await receiptsService.updateStatus(receiptId, 'active');
      await loadReceipts();
      alert('Recibo reactivado exitosamente');
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('[Receipts] Error al reactivar recibo', error);
      alert(`Error al reactivar el recibo: ${error?.message || 'revisa la consola para más detalles'}`);
    }
  };

  const handlePrintReceipt = async (receipt: Receipt) => {
    const enriched = await enrichReceiptWithInvoices(receipt);

    const customer = customers.find((c) => c.id === enriched.customerId);
    const customerDocument = customer?.document || '';
    const customerPhone = customer?.phone || '';
    const customerEmail = customer?.email || '';
    const customerAddress = customer?.address || '';

    let companyName = 'ContaBi';
    let companyRnc = '';
    try {
      const info = await settingsService.getCompanyInfo();
      if (info && (info as any)) {
        const name = (info as any).name || (info as any).company_name;
        const rnc = (info as any).rnc || (info as any).tax_id;
        if (name) {
          companyName = String(name);
        }
        if (rnc) {
          companyRnc = String(rnc);
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[Receipts] Error obteniendo información de la empresa para impresión de recibo:', error);
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('No se pudo abrir la ventana de impresión.');
      return;
    }

    const appliedInvoicesHtml =
      enriched.invoiceNumbers && enriched.invoiceNumbers.length
        ? `<p><strong>Facturas aplicadas:</strong></p>
           <ul>
             ${enriched.invoiceNumbers.map((inv) => `<li>${inv}</li>`).join('')}
           </ul>`
        : '';

    printWindow.document.write(`
      <html>
        <head>
          <title>Recibo ${enriched.receiptNumber}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            .header { text-align: center; margin-bottom: 20px; }
            .details { margin: 20px 0; }
            .amount { font-size: 18px; font-weight: bold; margin-top: 10px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${companyName}</h1>
            ${companyRnc ? `<p>RNC: ${companyRnc}</p>` : ''}
            <h2>Recibo de Cobro #${enriched.receiptNumber}</h2>
            <p>Fecha: ${formatDate(enriched.date)}</p>
          </div>

          <div class="details">
            <p><strong>Cliente:</strong> ${enriched.customerName}</p>
            ${customerDocument ? `<p><strong>Documento:</strong> ${customerDocument}</p>` : ''}
            ${customerPhone ? `<p><strong>Teléfono:</strong> ${customerPhone}</p>` : ''}
            ${customerEmail ? `<p><strong>Email:</strong> ${customerEmail}</p>` : ''}
            ${customerAddress ? `<p><strong>Dirección:</strong> ${customerAddress}</p>` : ''}
            ${enriched.concept ? `<p><strong>Concepto:</strong> ${enriched.concept}</p>` : ''}
            <p><strong>Método de pago:</strong> ${getPaymentMethodName(enriched.paymentMethod)}</p>
            ${enriched.reference ? `<p><strong>Referencia:</strong> ${enriched.reference}</p>` : ''}
            <p class="amount">Monto: RD$ ${formatAmount(enriched.amount)}</p>
            ${appliedInvoicesHtml}
          </div>

          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 800);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleExportReceiptExcel = async (receipt: Receipt) => {
    let companyName = 'ContaBi';
    let companyRnc = '';
    try {
      const info = await settingsService.getCompanyInfo();
      if (info && (info as any)) {
        const name = (info as any).name || (info as any).company_name;
        const rnc = (info as any).rnc || (info as any).tax_id || (info as any).ruc;
        if (name) {
          companyName = String(name);
        }
        if (rnc) {
          companyRnc = String(rnc);
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error obteniendo información de la empresa para Excel de recibo:', error);
    }

    const customer = customers.find((c) => c.id === receipt.customerId);
    const customerName = customer?.name || receipt.customerName;
    const customerDoc = customer?.document || '';
    const customerEmail = customer?.email || '';
    const customerPhone = customer?.phone || '';
    const customerAddress = customer?.address || '';

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Recibo');

    // Encabezado de empresa
    worksheet.mergeCells('A1:D1');
    worksheet.getCell('A1').value = companyName;
    worksheet.getCell('A1').font = { bold: true, size: 16 } as any;
    worksheet.getCell('A1').alignment = { horizontal: 'center' } as any;

    if (companyRnc) {
      worksheet.mergeCells('A2:D2');
      worksheet.getCell('A2').value = `RNC: ${companyRnc}`;
      worksheet.getCell('A2').alignment = { horizontal: 'center' } as any;
      worksheet.getCell('A2').font = { size: 10 } as any;
    }

    const headerStartRow = companyRnc ? 3 : 2;
    worksheet.mergeCells(`A${headerStartRow}:D${headerStartRow}`);
    worksheet.getCell(`A${headerStartRow}`).value = `Recibo #${receipt.receiptNumber}`;
    worksheet.getCell(`A${headerStartRow}`).font = { bold: true, size: 12 } as any;

    worksheet.addRow([]);

    // Datos del cliente
    worksheet.addRow(['Cliente', customerName]);
    if (customerDoc) worksheet.addRow(['Documento', customerDoc]);
    if (customerEmail) worksheet.addRow(['Correo', customerEmail]);
    if (customerPhone) worksheet.addRow(['Teléfono', customerPhone]);
    if (customerAddress) worksheet.addRow(['Dirección', customerAddress]);
    worksheet.addRow([
      'Fecha',
      receipt.date ? formatDate(receipt.date) : '',
    ]);
    worksheet.addRow(['Método de pago', getPaymentMethodName(receipt.paymentMethod)]);
    if (receipt.reference) worksheet.addRow(['Referencia', receipt.reference]);
    if (receipt.concept) worksheet.addRow(['Concepto', receipt.concept]);

    worksheet.addRow([]);

    // Detalle del recibo (similar a detalle de factura)
    const itemsHeader = worksheet.addRow(['Descripción', 'Cantidad', 'Precio', 'Total']);
    itemsHeader.font = { bold: true } as any;

    worksheet.addRow([
      receipt.concept || 'Pago de recibo',
      1,
      receipt.amount,
      receipt.amount,
    ]);

    worksheet.addRow([]);

    // Totales del recibo (mismo layout que la factura)
    worksheet.addRow(['', '', 'Subtotal', receipt.amount]);
    worksheet.addRow(['', '', 'ITBIS', 0]);
    worksheet.addRow(['', '', 'Total', receipt.amount]);
    worksheet.addRow(['', '', 'Pagado', receipt.amount]);
    worksheet.addRow(['', '', 'Saldo', 0]);

    worksheet.columns = [
      { width: 40 },
      { width: 12 },
      { width: 14 },
      { width: 14 },
    ];

    ['C', 'D'].forEach((col) => {
      const column = worksheet.getColumn(col as any);
      (column as any).numFmt = '#,##0.00';
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const safeNumber = receipt.receiptNumber || receipt.id;
    saveAs(blob, `recibo_cxc_${safeNumber}.xlsx`);
  };

  const handleSaveReceipt = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user?.id) {
      alert('Debes iniciar sesión para crear recibos');
      return;
    }
    const formData = new FormData(e.currentTarget);
    const customerId = String(formData.get('customer_id') || '');
    const date = String(formData.get('date') || '');
    const amount = Number(formData.get('amount') || 0);
    const invoiceId = String(formData.get('invoice_id') || '');
    const paymentMethod = String(formData.get('payment_method') || 'cash');
    const reference = String(formData.get('reference') || '');
    const concept = String(formData.get('concept') || '');

    if (!customerId || !amount) {
      alert('Cliente y monto son obligatorios');
      return;
    }

    const todayStr = date || new Date().toISOString().split('T')[0];

    const receiptNumber = `RC-${Date.now()}`;

    const payload = {
      customer_id: customerId,
      receipt_number: receiptNumber,
      receipt_date: todayStr,
      amount,
      payment_method: paymentMethod,
      reference: reference || null,
      concept: concept || null,
      status: 'active',
    };

    try {
      if (invoiceId) {
        const inv = newReceiptInvoices.find((x) => x.id === invoiceId);
        if (!inv) {
          alert('La factura seleccionada no es válida');
          return;
        }
        if (amount > inv.balance) {
          alert('El monto no puede ser mayor que el saldo pendiente de la factura seleccionada');
          return;
        }
      }

      const created = await receiptsService.create(user.id, payload);

      if (invoiceId && created?.id) {
        await receiptApplicationsService.create(user.id, {
          receipt_id: String(created.id),
          invoice_id: invoiceId,
          amount_applied: amount,
          notes: null,
        });
      }

      await loadReceipts();
      alert('Recibo creado exitosamente');
      setShowReceiptModal(false);
      setSelectedCustomerId('');
      setNewReceiptInvoices([]);
      setNewReceiptInvoiceId('');
      setNewReceiptAmount('');
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('[Receipts] Error al crear recibo', error);
      alert(`Error al crear el recibo: ${error?.message || 'revisa la consola para más detalles'}`);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Recibos de Cobro</h1>
            <nav className="flex space-x-2 text-sm text-gray-600 mt-2">
              <Link to="/accounts-receivable" className="hover:text-blue-600">Cuentas por Cobrar</Link>
              <span>/</span>
              <span>Recibos de Cobro</span>
            </nav>
          </div>
          <button 
            onClick={handleNewReceipt}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            <i className="ri-add-line mr-2"></i>
            Nuevo Recibo
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Recibido</p>
                <p className="text-2xl font-bold text-green-600">
                  RD${formatAmount(filteredReceipts.filter(r => r.status === 'active').reduce((sum, r) => sum + r.amount, 0))}
                </p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <i className="ri-money-dollar-circle-line text-2xl text-green-600"></i>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Recibos Activos</p>
                <p className="text-2xl font-bold text-blue-600">
                  {filteredReceipts.filter(r => r.status === 'active').length}
                </p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <i className="ri-file-list-line text-2xl text-blue-600"></i>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Recibos Anulados</p>
                <p className="text-2xl font-bold text-red-600">
                  {filteredReceipts.filter(r => r.status === 'cancelled').length}
                </p>
              </div>
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                <i className="ri-close-circle-line text-2xl text-red-600"></i>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Promedio por Recibo</p>
                <p className="text-2xl font-bold text-purple-600">
                  RD${filteredReceipts.length > 0 ? formatAmount(Math.round(filteredReceipts.reduce((sum, r) => sum + r.amount, 0) / filteredReceipts.length)) : '0'}
                </p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <i className="ri-bar-chart-line text-2xl text-purple-600"></i>
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
                placeholder="Buscar por cliente, número de recibo o referencia..."
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
              <option value="active">Activos</option>
              <option value="cancelled">Anulados</option>
            </select>
          </div>

          <div className="w-full md:w-48">
            <select
              value={paymentMethodFilter}
              onChange={(e) => setPaymentMethodFilter(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm pr-8"
            >
              <option value="all">Todos los Métodos</option>
              <option value="cash">Efectivo</option>
              <option value="check">Cheque</option>
              <option value="transfer">Transferencia</option>
              <option value="card">Tarjeta</option>
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

        {/* Receipts Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          {(loadingCustomers || loadingReceipts) && (
            <div className="px-6 pt-3 text-sm text-gray-500">Cargando datos...</div>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Recibo
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
                    Método
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Referencia
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
                {filteredReceipts.map((receipt) => (
                  <tr key={receipt.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {receipt.receiptNumber}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {receipt.customerName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(receipt.date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      RD${formatAmount(receipt.amount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {getPaymentMethodName(receipt.paymentMethod)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {receipt.reference}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(receipt.status)}`}>
                        {getStatusName(receipt.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleViewReceipt(receipt)}
                          className="text-blue-600 hover:text-blue-900 p-1"
                          title="Ver detalles del recibo"
                        >
                          <i className="ri-eye-line"></i>
                        </button>
                        <button
                          onClick={() => handlePrintReceipt(receipt)}
                          className="text-purple-600 hover:text-purple-900 p-1"
                          title="Imprimir recibo"
                        >
                          <i className="ri-printer-line"></i>
                        </button>
                        <button
                          onClick={() => handleExportReceiptExcel(receipt)}
                          className="text-green-600 hover:text-green-900 p-1"
                          title="Exportar recibo a Excel"
                        >
                          <i className="ri-file-excel-2-line"></i>
                        </button>
                        {receipt.status === 'active' && (
                          <>
                            <button
                              onClick={() => handleApplyReceipt(receipt)}
                              className="text-emerald-600 hover:text-emerald-900 p-1"
                              title="Aplicar a factura"
                            >
                              <i className="ri-money-dollar-circle-line"></i>
                            </button>
                            <button
                              onClick={() => handleCancelReceipt(receipt.id)}
                              className="text-red-600 hover:text-red-900 p-1"
                              title="Anular recibo"
                            >
                              <i className="ri-close-circle-line"></i>
                            </button>
                          </>
                        )}
                        {receipt.status === 'cancelled' && (
                          <button
                            onClick={() => handleReactivateReceipt(receipt.id)}
                            className="text-green-600 hover:text-green-900 p-1"
                            title="Reactivar recibo"
                          >
                            <i className="ri-arrow-go-back-line"></i>
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

        {/* Apply Receipt Modal */}
        {showApplyModal && selectedReceipt && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Aplicar Recibo</h3>
                <button
                  onClick={() => {
                    setShowApplyModal(false);
                    setSelectedReceipt(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line"></i>
                </button>
              </div>

              <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">
                  Recibo: <span className="font-medium">{selectedReceipt.receiptNumber}</span>
                </p>
                <p className="text-sm text-gray-600">
                  Cliente: <span className="font-medium">{selectedReceipt.customerName}</span>
                </p>
                <p className="text-lg font-semibold text-green-600">
                  Monto disponible: RD${formatAmount(selectedReceiptAvailableAmount)}
                </p>
              </div>

              {loadingApplyInvoices && (
                <div className="mb-2 text-sm text-gray-500">Cargando facturas disponibles...</div>
              )}

              {!loadingApplyInvoices && applyInvoices.length === 0 && (
                <div className="mb-4 text-sm text-red-600">
                  No se encontraron facturas elegibles para aplicar este recibo.
                </div>
              )}

              {applyInvoices.length > 0 && (
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
                      {applyInvoices.map((inv) => (
                        <option key={inv.id} value={inv.id}>
                          {inv.invoiceNumber} - RD$ {formatAmount(inv.totalAmount)}
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
                      max={selectedReceiptAvailableAmount || selectedReceipt.amount}
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
                      name="notes"
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Observaciones sobre la aplicación del recibo..."
                    />
                  </div>

                  <div className="flex space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setShowApplyModal(false);
                        setSelectedReceipt(null);
                      }}
                      className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400 transition-colors whitespace-nowrap"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap"
                    >
                      Aplicar Recibo
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* New Receipt Modal */}
        {showReceiptModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Nuevo Recibo de Cobro</h3>
                <button
                  onClick={() => {
                    setShowReceiptModal(false);
                    setSelectedCustomerId('');
                    setNewReceiptInvoices([]);
                    setNewReceiptInvoiceId('');
                    setNewReceiptAmount('');
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line"></i>
                </button>
              </div>
              
              <form onSubmit={handleSaveReceipt} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Cliente
                    </label>
                    <select 
                      required
                      name="customer_id"
                      value={selectedCustomerId}
                      onChange={(e) => void handleNewReceiptCustomerChange(e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                    >
                      <option value="">Seleccionar cliente</option>
                      {customers.map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.name}
                        </option>
                      ))}
                    </select>
                    {selectedCustomer && (
                      <div className="mt-3 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-1">
                        <p>
                          <span className="font-medium">Documento:</span>{' '}
                          {selectedCustomer.document || '—'}
                        </p>
                        <p>
                          <span className="font-medium">Teléfono:</span>{' '}
                          {selectedCustomer.phone || '—'}
                        </p>
                        <p>
                          <span className="font-medium">Email:</span>{' '}
                          {selectedCustomer.email || '—'}
                        </p>
                        <p>
                          <span className="font-medium">Dirección:</span>{' '}
                          {selectedCustomer.address || '—'}
                        </p>
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Fecha
                    </label>
                    <DateInput
                      required
                      name="date"
                      defaultValue={new Date().toISOString().split('T')[0]}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Facturas
                  </label>
                  {!selectedCustomerId && (
                    <div className="text-sm text-gray-500">
                      Selecciona un cliente para ver sus facturas.
                    </div>
                  )}
                  {selectedCustomerId && loadingNewReceiptInvoices && (
                    <div className="text-sm text-gray-500">Cargando facturas...</div>
                  )}
                  {selectedCustomerId && !loadingNewReceiptInvoices && (
                    <>
                      <select
                        name="invoice_id"
                        value={newReceiptInvoiceId}
                        onChange={(e) => handleNewReceiptInvoiceChange(e.target.value)}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                      >
                        <option value="">Seleccionar factura</option>
                        {newReceiptInvoices.map((inv) => (
                          <option key={inv.id} value={inv.id}>
                            {inv.invoiceNumber} - Saldo RD$ {formatAmount(inv.balance)}
                          </option>
                        ))}
                      </select>

                      {selectedNewReceiptInvoice && (
                        <div className="mt-2 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-3 grid grid-cols-1 md:grid-cols-3 gap-2">
                          <div>
                            <span className="font-medium">Monto:</span>{' '}
                            RD${formatAmount(selectedNewReceiptInvoice.totalAmount)}
                          </div>
                          <div>
                            <span className="font-medium">Pagado:</span>{' '}
                            RD${formatAmount(selectedNewReceiptInvoice.paidAmount)}
                          </div>
                          <div>
                            <span className="font-medium">Saldo:</span>{' '}
                            <span className="text-emerald-700 font-semibold">RD${formatAmount(selectedNewReceiptInvoice.balance)}</span>
                          </div>
                        </div>
                      )}
                    </>
                  )}
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
                      value={newReceiptAmount}
                      onChange={(e) => setNewReceiptAmount(e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="0.00"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Método de Pago
                    </label>
                    <select 
                      required
                      name="payment_method"
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                    >
                      <option value="cash">Efectivo</option>
                      <option value="check">Cheque</option>
                      <option value="transfer">Transferencia</option>
                      <option value="card">Tarjeta</option>
                    </select>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Referencia
                  </label>
                  <input
                    type="text"
                    required
                    name="reference"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
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
                    placeholder="Descripción del pago recibido..."
                  />
                </div>
                
                <div className="flex space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowReceiptModal(false);
                      setSelectedCustomerId('');
                      setNewReceiptInvoices([]);
                      setNewReceiptInvoiceId('');
                      setNewReceiptAmount('');
                    }}
                    className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400 transition-colors whitespace-nowrap"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                  >
                    Crear Recibo
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Receipt Details Modal */}
        {showReceiptDetails && selectedReceipt && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold">Detalles del Recibo</h3>
                <button
                  onClick={() => {
                    setShowReceiptDetails(false);
                    setSelectedReceipt(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line"></i>
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-500">Número de Recibo</label>
                    <p className="text-lg font-semibold text-gray-900">{selectedReceipt.receiptNumber}</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-500">Cliente</label>
                    <p className="text-gray-900">{selectedReceipt.customerName}</p>
                    {selectedReceiptCustomer && (
                      <div className="mt-2 text-sm text-gray-600 space-y-1">
                        {selectedReceiptCustomer.document && (
                          <p>
                            <span className="font-medium">Documento:</span>{' '}
                            {selectedReceiptCustomer.document}
                          </p>
                        )}
                        {selectedReceiptCustomer.phone && (
                          <p>
                            <span className="font-medium">Teléfono:</span>{' '}
                            {selectedReceiptCustomer.phone}
                          </p>
                        )}
                        {selectedReceiptCustomer.email && (
                          <p>
                            <span className="font-medium">Email:</span>{' '}
                            {selectedReceiptCustomer.email}
                          </p>
                        )}
                        {selectedReceiptCustomer.address && (
                          <p>
                            <span className="font-medium">Dirección:</span>{' '}
                            {selectedReceiptCustomer.address}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-500">Fecha</label>
                    <p className="text-gray-900">{formatDate(selectedReceipt.date)}</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-500">Monto</label>
                    <p className="text-2xl font-bold text-green-600">RD${formatAmount(selectedReceipt.amount)}</p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-500">Método de Pago</label>
                    <p className="text-gray-900">{getPaymentMethodName(selectedReceipt.paymentMethod)}</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-500">Referencia</label>
                    <p className="text-gray-900">{selectedReceipt.reference}</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-500">Estado</label>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(selectedReceipt.status)}`}>
                      {getStatusName(selectedReceipt.status)}
                    </span>
                  </div>
                  
                  {selectedReceipt.invoiceNumbers.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-500">Facturas Aplicadas</label>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {selectedReceipt.invoiceNumbers.map((invoice, index) => (
                          <span key={index} className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm">
                            {invoice}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="mt-6">
                <label className="block text-sm font-medium text-gray-500">Concepto</label>
                <p className="text-gray-900 mt-1">{selectedReceipt.concept}</p>
              </div>
              
              <div className="flex space-x-3 mt-6">
                <button
                  onClick={() => handlePrintReceipt(selectedReceipt)}
                  className="flex-1 bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700 transition-colors whitespace-nowrap"
                >
                  <i className="ri-printer-line mr-2"></i>
                  Imprimir Recibo
                </button>
                {selectedReceipt.status === 'active' && (
                  <button
                    onClick={() => handleCancelReceipt(selectedReceipt.id)}
                    className="flex-1 bg-red-600 text-white py-2 rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap"
                  >
                    <i className="ri-close-circle-line mr-2"></i>
                    Anular Recibo
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