import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import html2canvas from 'html2canvas';
import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

import { useAuth } from '../../../hooks/useAuth';
import { customersService, receiptsService, invoicesService, receiptApplicationsService, settingsService } from '../../../services/database';
import { formatDate } from '../../../utils/dateFormat';
import { formatAmount } from '../../../utils/numberFormat';
import DateInput from '../../../components/common/DateInput';
import InvoiceTypeModal from '../../../components/common/InvoiceTypeModal';
import { generateInvoiceHtml, printInvoice, type InvoiceTemplateType } from '../../../utils/invoicePrintTemplates';
import { addPdfBrandedHeader, getPdfTableStyles } from '../../../utils/exportImportUtils';

const isGeneralCustomerName = (name?: string | null) => {
  if (!name) return false;
  return String(name).trim().toLowerCase() === 'general customer';
};

const stripPrintScripts = (html: string) => html.replace(/<script>[\s\S]*?<\/script>/gi, '');

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

const generatePdfBase64FromHtml = async (html: string): Promise<string> => {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:1024px;height:1400px;border:0;opacity:0';
  document.body.appendChild(iframe);
  const safeHtml = stripPrintScripts(html);
  await new Promise<void>((resolve) => {
    iframe.onload = () => resolve();
    iframe.srcdoc = safeHtml;
  });
  const body = iframe.contentDocument?.body;
  if (!body) {
    document.body.removeChild(iframe);
    throw new Error('Failed to render document for PDF');
  }
  const canvas = await html2canvas(body, { scale: 1.25, useCORS: true, backgroundColor: '#ffffff' });
  const imgData = canvas.toDataURL('image/jpeg', 0.72);
  const pdf = new jsPDF('p', 'pt', 'a4');
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();
  const scale = pdfWidth / canvas.width;
  const scaledHeight = canvas.height * scale;
  let y = 0;
  let remaining = scaledHeight;
  while (remaining > 0) {
    pdf.addImage(imgData, 'JPEG', 0, y, pdfWidth, scaledHeight);
    remaining -= pdfHeight;
    if (remaining > 0) {
      pdf.addPage();
      y -= pdfHeight;
    }
  }
  document.body.removeChild(iframe);
  const arrayBuffer = pdf.output('arraybuffer');
  return arrayBufferToBase64(arrayBuffer);
};

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

  const [showPrintTypeModal, setShowPrintTypeModal] = useState(false);
  const [receiptToPrint, setReceiptToPrint] = useState<Receipt | null>(null);

  const getPaymentMethodName = (method: string) => {
    switch (method) {
      case 'cash': return 'Cash';
      case 'check': return 'Check';
      case 'transfer': return 'Transfer';
      case 'card': return 'Card';
      default: return 'Other';
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
    return 'bg-[#001B9E] text-white';
  };

  const getStatusName = (status: string) => {
    switch (status) {
      case 'active': return 'Active';
      case 'cancelled': return 'Cancelled';
      default: return 'Unknown';
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

  const loadInvoicesForReceipt = async (receipt: Receipt) => {
    if (!user?.id) return;
    setLoadingApplyInvoices(true);
    try {
      const data = await invoicesService.getAll(user.id);
      const mapped = (data as any[])
        .filter(
          (inv) =>
            String(inv.customer_id) === String(receipt.customerId) &&
            inv.status !== 'Cancelada',
        )
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

      setApplyInvoices(mapped);
    } finally {
      setLoadingApplyInvoices(false);
    }
  };

  const exportToPDF = async () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    const pdfStyles = getPdfTableStyles();

    // Add branded header with logo
    const startY = await addPdfBrandedHeader(doc, 'Receipt Report', {
      subtitle: `Status: ${statusFilter === 'all' ? 'All' : getStatusName(statusFilter)} | Method: ${paymentMethodFilter === 'all' ? 'All' : getPaymentMethodName(paymentMethodFilter)}`
    });
    
    // Estadísticas
    const totalAmount = filteredReceipts.reduce((sum, receipt) => sum + receipt.amount, 0);
    const activeReceipts = filteredReceipts.filter(r => r.status === 'active').length;
    const cancelledReceipts = filteredReceipts.filter(r => r.status === 'cancelled').length;
    
    doc.setFontSize(12);
    doc.setTextColor(51, 51, 51);
    doc.text('Receipt summary', 20, startY);
    
    const summaryData = [
      ['Metric', 'Value'],
      ['Total received', ` ${formatAmount(totalAmount)}`],
      ['Active receipts', activeReceipts.toString()],
      ['Cancelled receipts', cancelledReceipts.toString()],
      ['Total receipts', filteredReceipts.length.toString()]
    ];
    
    (doc as any).autoTable({
      startY: startY + 5,
      head: [summaryData[0]],
      body: summaryData.slice(1),
      theme: 'grid',
      ...pdfStyles
    });
    
    // Tabla de recibos
    doc.setFontSize(14);
    doc.text('Receipt detail', 20, (doc as any).lastAutoTable.finalY + 20);

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
        ` ${formatAmount(receipt.amount)}`,
        getPaymentMethodName(receipt.paymentMethod),
        receipt.reference,
        getStatusName(receipt.status),
      ];
    });

    (doc as any).autoTable({
      startY: (doc as any).lastAutoTable.finalY + 30,
      head: [['Receipt', 'Customer', 'Document', 'Phone', 'Email', 'Address', 'Date', 'Amount', 'Method', 'Reference', 'Status']],
      body: receiptData,
      theme: 'striped',
      headStyles: { fillColor: [0, 128, 0] },
      styles: { fontSize: 8 }
    });
    
    doc.save(`receipts-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const exportToExcel = async () => {
    let companyName = '';
    try {
      const info = await settingsService.getCompanyInfo();
      if (info && (info as any)) {
        const resolvedName = (info as any).name || (info as any).company_name;
        if (resolvedName) {
          companyName = String(resolvedName);
        }
      }
    } catch (error: any) {
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
    const worksheet = workbook.addWorksheet('Receipt Report');

    // Encabezado principal
    worksheet.mergeCells('A1:L1');
    worksheet.getCell('A1').value = companyName;
    worksheet.getCell('A1').font = { bold: true, size: 16 } as any;
    worksheet.getCell('A1').alignment = { horizontal: 'center' } as any;

    worksheet.mergeCells('A2:L2');
    worksheet.getCell('A2').value = 'Receipt Report';
    worksheet.getCell('A2').font = { bold: true, size: 12 } as any;
    worksheet.getCell('A2').alignment = { horizontal: 'center' } as any;

    worksheet.getCell('A3').value = `Generated on: ${todayLocal}`;
    worksheet.getCell('A4').value = `Status: ${statusFilter === 'all' ? 'All' : getStatusName(statusFilter)}`;
    worksheet.getCell('A5').value = `Payment method: ${paymentMethodFilter === 'all' ? 'All' : getPaymentMethodName(paymentMethodFilter)}`;

    // Resumen de recibos
    worksheet.addRow([]);
    const resumenTitleRow = worksheet.addRow(['RECEIPTS SUMMARY']);
    resumenTitleRow.font = { bold: true } as any;

    const resumenStartRow = resumenTitleRow.number + 1;
    worksheet.getCell(`A${resumenStartRow}`).value = 'Total received';
    worksheet.getCell(`B${resumenStartRow}`).value = totalAmount;

    worksheet.getCell(`A${resumenStartRow + 1}`).value = 'Active receipts';
    worksheet.getCell(`B${resumenStartRow + 1}`).value = activeReceipts;

    worksheet.getCell(`A${resumenStartRow + 2}`).value = 'Cancelled receipts';
    worksheet.getCell(`B${resumenStartRow + 2}`).value = cancelledReceipts;

    worksheet.getCell(`A${resumenStartRow + 3}`).value = 'Total receipts';
    worksheet.getCell(`B${resumenStartRow + 3}`).value = filteredReceipts.length;

    // Formato numérico  para total recibido
    const totalCell = worksheet.getCell(`B${resumenStartRow}`);
    totalCell.numFmt = '#,##0.00';

    worksheet.addRow([]);

    // Detalle de recibos
    const detalleTitleRow = worksheet.addRow(['RECEIPT DETAIL']);
    detalleTitleRow.font = { bold: true } as any;

    const headerRow = worksheet.addRow([
      'Receipt',
      'Customer',
      'Document',
      'Phone',
      'Email',
      'Address',
      'Date',
      'Amount',
      'Method',
      'Reference',
      'Concept',
      'Status',
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

  const handlePrintReceipt = (receipt: Receipt) => {
    setReceiptToPrint(receipt);
    setShowPrintTypeModal(true);
  };

  const handlePrintTypeSelect = async (type: InvoiceTemplateType) => {
    if (!receiptToPrint) return;
    const enriched = await enrichReceiptWithInvoices(receiptToPrint);
    const customer = customers.find((c) => c.id === enriched.customerId);
    
    let companyInfo: any = {};
    try {
      companyInfo = await settingsService.getCompanyInfo() || {};
    } catch { /* ignore */ }

    const receiptData = {
      invoiceNumber: enriched.receiptNumber,
      date: enriched.date,
      dueDate: enriched.date,
      amount: enriched.amount,
      subtotal: enriched.amount,
      tax: 0,
      items: [{ description: `${enriched.concept || 'Receipt'} - ${getPaymentMethodName(enriched.paymentMethod)}${enriched.reference ? ` (Ref: ${enriched.reference})` : ''}`, quantity: 1, price: enriched.amount, total: enriched.amount }],
    };
    const customerData = {
      name: enriched.customerName || customer?.name || 'Customer',
      document: customer?.document,
      phone: customer?.phone,
      email: customer?.email,
      address: customer?.address,
    };
    const companyData = {
      name: companyInfo?.name || companyInfo?.company_name || 'Send Bill Now',
      rnc: companyInfo?.rnc || companyInfo?.tax_id,
      phone: companyInfo?.phone,
      email: companyInfo?.email,
      address: companyInfo?.address,
      logo: companyInfo?.logo,
    };

    printInvoice(receiptData, customerData, companyData, type);
    setReceiptToPrint(null);
  };

  const handlePrintReceiptLegacy = async (receipt: Receipt) => {
    const enriched = await enrichReceiptWithInvoices(receipt);

    const customer = customers.find((c) => c.id === enriched.customerId);
    const customerDocument = customer?.document || '';
    const customerPhone = customer?.phone || '';
    const customerEmail = customer?.email || '';
    const customerAddress = customer?.address || '';

    let companyName = '';
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
            <p class="amount">Monto:  ${formatAmount(enriched.amount)}</p>
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
    let companyName = '';
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
      console.error('[Receipts] Error al crear recibo', error);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 bg-gradient-to-br from-[#f6f1e3] to-[#ebe5d5] min-h-screen space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#1e2814] drop-shadow-sm">Receipt Center</h1>
            <nav className="flex flex-wrap items-center gap-2 text-sm text-[#4c5535] mt-2">
              <Link to="/accounts-receivable" className="hover:text-[#2f3e1e]">
                Accounts Receivable
              </Link>
              <span>/</span>
              <span>Receipts</span>
            </nav>
          </div>
          <button
            onClick={handleNewReceipt}
            className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-gradient-to-br from-[#008000] to-[#006600] text-white shadow-[0_4px_15px_rgb(0,128,0,0.3)] hover:from-[#006600] hover:to-[#005500] hover:shadow-[0_6px_20px_rgb(0,128,0,0.4)] hover:-translate-y-0.5 transition-all duration-300 whitespace-nowrap font-semibold"
          >
            <i className="ri-add-line mr-2" />
            New Receipt
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-gradient-to-br from-white to-[#faf9f5] p-6 rounded-2xl border border-[#e8e0d0] shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:shadow-[0_12px_40px_rgb(0,128,0,0.15)] hover:-translate-y-1 transition-all duration-300 cursor-pointer">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#4c5535]">Total received</p>
                <p className="text-2xl font-bold text-[#2f3e1e]">
                  
                  {formatAmount(
                    filteredReceipts
                      .filter((r) => r.status === 'active')
                      .reduce((sum, r) => sum + r.amount, 0),
                  )}
                </p>
              </div>
              <div className="w-12 h-12 bg-[#f0f7e6] rounded-lg flex items-center justify-center">
                <i className="ri-money-dollar-circle-line text-2xl text-[#2f3e1e]" />
              </div>
            </div>
          </div>
          <div className="bg-gradient-to-br from-white to-[#faf9f5] p-6 rounded-2xl border border-[#e8e0d0] shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:shadow-[0_12px_40px_rgb(0,128,0,0.15)] hover:-translate-y-1 transition-all duration-300 cursor-pointer">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#4c5535]">Active receipts</p>
                <p className="text-2l font-bold text-[#2f3e1e]">
                  {filteredReceipts.filter((r) => r.status === 'active').length}
                </p>
              </div>
              <div className="w-12 h-12 bg-[#ede7d7] rounded-lg flex items-center justify-center">
                <i className="ri-file-list-line text-2xl text-[#4c5535]" />
              </div>
            </div>
          </div>
          <div className="bg-gradient-to-br from-white to-[#faf9f5] p-6 rounded-2xl border border-[#e8e0d0] shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:shadow-[0_12px_40px_rgb(0,128,0,0.15)] hover:-translate-y-1 transition-all duration-300 cursor-pointer">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#4c5535]">Cancelled receipts</p>
                <p className="text-2l font-bold text-[#7a2e1b]">
                  {filteredReceipts.filter((r) => r.status === 'cancelled').length}
                </p>
              </div>
              <div className="w-12 h-12 bg-[#f6d6ce] rounded-lg flex items-center justify-center">
                <i className="ri-close-circle-line text-2xl text-[#7a2e1b]" />
              </div>
            </div>
          </div>
          <div className="bg-gradient-to-br from-white to-[#faf9f5] p-6 rounded-2xl border border-[#e8e0d0] shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:shadow-[0_12px_40px_rgb(0,128,0,0.15)] hover:-translate-y-1 transition-all duration-300 cursor-pointer">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#4c5535]">Average per receipt</p>
                <p className="text-2l font-bold text-[#2f3e1e]">
                  
                  {filteredReceipts.length
                    ? formatAmount(
                        Math.round(
                          filteredReceipts.reduce((sum, r) => sum + r.amount, 0) / filteredReceipts.length,
                        ),
                      )
                    : '0'}
                </p>
              </div>
              <div className="w-12 h-12 bg-[#f7f0df] rounded-lg flex items-center justify-center">
                <i className="ri-bar-chart-line text-2xl text-[#6b5c3b]" />
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <i className="ri-search-line text-gray-400" />
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full pl-10 pr-3 py-3 border border-[#d6cfbf] rounded-lg bg-white focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e] text-sm text-[#1e2814] placeholder:text-gray-500"
                placeholder="Search by customer, receipt, or reference..."
              />
            </div>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full md:w-48 p-3 border border-[#d6cfbf] rounded-lg bg-white focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e] text-sm text-[#1e2814]"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select
            value={paymentMethodFilter}
            onChange={(e) => setPaymentMethodFilter(e.target.value)}
            className="w-full md:w-48 p-3 border border-[#d6cfbf] rounded-lg bg-white focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e] text-sm text-[#1e2814]"
          >
            <option value="all">All methods</option>
            <option value="cash">Cash</option>
            <option value="check">Check</option>
            <option value="transfer">Transfer</option>
            <option value="card">Card</option>
          </select>
          <div className="flex space-x-2">
            <button
              onClick={exportToPDF}
              className="px-4 py-2 rounded-lg border border-[#d6cfbf] bg-[#f7f0df] text-[#2f3e1e] hover:bg-[#ede3cb] transition-colors whitespace-nowrap"
            >
              <i className="ri-file-pdf-line mr-2" />
              PDF
            </button>
            <button
              onClick={exportToExcel}
              className="px-4 py-2 rounded-lg bg-[#3f5d2a] text-white hover:bg-[#2d451f] transition-colors whitespace-nowrap shadow-sm"
            >
              <i className="ri-file-excel-line mr-2" />
              Excel
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-[#e0d7c4]">
          {(loadingCustomers || loadingReceipts) && (
            <div className="px-6 pt-3 text-sm text-[#4c5535]">Loading data…</div>
          )}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[#ede7d7]">
              <thead className="bg-[#ede7d7]">
                <tr>
                  {['Receipt', 'Customer', 'Date', 'Amount', 'Method', 'Reference', 'Status', 'Actions'].map(
                    (header) => (
                      <th
                        key={header}
                        className="px-6 py-3 text-left text-xs font-semibold text-[#4c5535] uppercase tracking-wider"
                      >
                        {header}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-[#f2ead5]">
                {filteredReceipts.map((receipt) => (
                  <tr key={receipt.id} className="hover:bg-[#f7f0df]">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-[#1e2814]">
                      {receipt.receiptNumber}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[#1e2814]">
                      {receipt.customerName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[#1e2814]">
                      {formatDate(receipt.date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-[#1e2814]">
                      {formatAmount(receipt.amount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[#1e2814]">
                      {getPaymentMethodName(receipt.paymentMethod)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[#1e2814]">
                      {receipt.reference || '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                          receipt.status,
                        )}`}
                      >
                        {getStatusName(receipt.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center space-x-2 text-[#1e2814]">
                        <button
                          onClick={() => handleViewReceipt(receipt)}
                          className="p-2 rounded-full hover:bg-[#f0f7e6]"
                          title="View details"
                        >
                          <i className="ri-eye-line" />
                        </button>
                        <button
                          onClick={() => handlePrintReceipt(receipt)}
                          className="p-2 rounded-full hover:bg-[#f0f7e6]"
                          title="Print receipt"
                        >
                          <i className="ri-printer-line" />
                        </button>
                        <button
                          onClick={() => handleExportReceiptExcel(receipt)}
                          className="p-2 rounded-full hover:bg-[#f0f7e6]"
                          title="Export to Excel"
                        >
                          <i className="ri-file-excel-2-line" />
                        </button>
                        {receipt.status === 'active' ? (
                          <>
                            <button
                              onClick={() => handleApplyReceipt(receipt)}
                              className="p-2 rounded-full hover:bg-[#f0f7e6]"
                              title="Apply to invoice"
                            >
                              <i className="ri-money-dollar-circle-line" />
                            </button>
                            <button
                              onClick={() => handleCancelReceipt(receipt.id)}
                              className="p-2 rounded-full hover:bg-[#f0f7e6] text-[#7a2e1b]"
                              title="Cancel receipt"
                            >
                              <i className="ri-close-circle-line" />
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => handleReactivateReceipt(receipt.id)}
                            className="p-2 rounded-full hover:bg-[#f0f7e6]"
                            title="Reactivate receipt"
                          >
                            <i className="ri-arrow-go-back-line" />
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

        {showApplyModal && selectedReceipt && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-[#e6dec8]">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-[#1e2814]">Apply receipt</h3>
                <button
                  onClick={() => {
                    setShowApplyModal(false);
                    setSelectedReceipt(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line" />
                </button>
              </div>
              <div className="mb-4 p-4 bg-[#f0f7e6] rounded-lg border border-[#d3e0b2] text-[#1e2814]">
                <p className="text-sm">
                  Receipt <span className="font-semibold">{selectedReceipt.receiptNumber}</span>
                </p>
                <p className="text-sm">
                  Customer <span className="font-semibold">{selectedReceipt.customerName}</span>
                </p>
                <p className="text-lg font-bold text-[#2f3e1e]">
                  Available {formatAmount(selectedReceiptAvailableAmount)}
                </p>
              </div>
              {loadingApplyInvoices && (
                <div className="mb-2 text-sm text-[#4c5535]">Loading eligible invoices…</div>
              )}
              {!loadingApplyInvoices && applyInvoices.length === 0 && (
                <div className="mb-4 text-sm text-[#7a2e1b]">
                  No pending invoices are available for this receipt.
                </div>
              )}
              {applyInvoices.length > 0 && (
                <form onSubmit={handleSaveApplication} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-[#1e2814] mb-2">Invoice</label>
                    <select
                      required
                      name="invoice_id"
                      className="w-full p-3 border border-[#d6cfbf] rounded-lg focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e]"
                    >
                      <option value="">Select invoice</option>
                      {applyInvoices.map((inv) => (
                        <option key={inv.id} value={inv.id}>
                          {inv.invoiceNumber} ·  {formatAmount(inv.totalAmount)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#1e2814] mb-2">Amount to apply</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      name="amount_to_apply"
                      required
                      max={selectedReceiptAvailableAmount || selectedReceipt.amount}
                      className="w-full p-3 border border-[#d6cfbf] rounded-lg focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e]"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#1e2814] mb-2">Notes</label>
                    <textarea
                      rows={3}
                      name="notes"
                      className="w-full p-3 border border-[#d6cfbf] rounded-lg focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e]"
                      placeholder="Add context about this application..."
                    />
                  </div>
                  <div className="flex space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setShowApplyModal(false);
                        setSelectedReceipt(null);
                      }}
                      className="flex-1 bg-[#ede7d7] text-[#4c5535] py-2 rounded-lg hover:bg-[#e0d7c4] transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex-1 bg-[#2f3e1e] text-white py-2 rounded-lg hover:bg-[#243015] transition-colors"
                    >
                      Apply receipt
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {showReceiptModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-[#e6dec8]">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-[#1e2814]">New receipt</h3>
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
                  <i className="ri-close-line" />
                </button>
              </div>
              <form onSubmit={handleSaveReceipt} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#1e2814] mb-2">Customer</label>
                    <select
                      required
                      name="customer_id"
                      value={selectedCustomerId}
                      onChange={(e) => void handleNewReceiptCustomerChange(e.target.value)}
                      className="w-full p-3 border border-[#d6cfbf] rounded-lg focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e]"
                    >
                      <option value="">Select customer</option>
                      {customers.map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.name}
                        </option>
                      ))}
                    </select>
                    {selectedCustomer && (
                      <div className="mt-3 text-sm text-[#1e2814] bg-[#f0f7e6] border border-[#d3e0b2] rounded-lg p-3 space-y-1">
                        <p>
                          <span className="font-medium">Document:</span> {selectedCustomer.document || '—'}
                        </p>
                        <p>
                          <span className="font-medium">Phone:</span> {selectedCustomer.phone || '—'}
                        </p>
                        <p>
                          <span className="font-medium">Email:</span> {selectedCustomer.email || '—'}
                        </p>
                        <p>
                          <span className="font-medium">Address:</span> {selectedCustomer.address || '—'}
                        </p>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#1e2814] mb-2">Date</label>
                    <DateInput
                      required
                      name="date"
                      defaultValue={new Date().toISOString().split('T')[0]}
                      className="w-full p-3 border border-[#d6cfbf] rounded-lg focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1e2814] mb-2">Invoices</label>
                  {!selectedCustomerId && (
                    <div className="text-sm text-[#4c5535]">Select a customer to list their invoices.</div>
                  )}
                  {selectedCustomerId && loadingNewReceiptInvoices && (
                    <div className="text-sm text-[#4c5535]">Loading invoices…</div>
                  )}
                  {selectedCustomerId && !loadingNewReceiptInvoices && (
                    <>
                      <select
                        name="invoice_id"
                        value={newReceiptInvoiceId}
                        onChange={(e) => handleNewReceiptInvoiceChange(e.target.value)}
                        className="w-full p-3 border border-[#d6cfbf] rounded-lg focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e]"
                      >
                        <option value="">Select invoice (optional)</option>
                        {newReceiptInvoices.map((inv) => (
                          <option key={inv.id} value={inv.id}>
                            {inv.invoiceNumber} · Balance  {formatAmount(inv.balance)}
                          </option>
                        ))}
                      </select>
                      {selectedNewReceiptInvoice && (
                        <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2 text-sm text-[#1e2814] bg-[#f7f0df] border border-[#d6cfbf] rounded-lg p-3">
                          <p>
                            <span className="font-medium">Amount:</span> 
                            {formatAmount(selectedNewReceiptInvoice.totalAmount)}
                          </p>
                          <p>
                            <span className="font-medium">Paid:</span> 
                            {formatAmount(selectedNewReceiptInvoice.paidAmount)}
                          </p>
                          <p>
                            <span className="font-medium">Balance:</span>{' '}
                            <span className="text-[#2f3e1e] font-semibold">
                              {formatAmount(selectedNewReceiptInvoice.balance)}
                            </span>
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#1e2814] mb-2">Amount</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      name="amount"
                      value={newReceiptAmount}
                      onChange={(e) => setNewReceiptAmount(e.target.value)}
                      className="w-full p-3 border border-[#d6cfbf] rounded-lg focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e]"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#1e2814] mb-2">Payment method</label>
                    <select
                      required
                      name="payment_method"
                      className="w-full p-3 border border-[#d6cfbf] rounded-lg focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e]"
                    >
                      <option value="cash">Cash</option>
                      <option value="check">Check</option>
                      <option value="transfer">Transfer</option>
                      <option value="card">Card</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1e2814] mb-2">Reference</label>
                  <input
                    type="text"
                    required
                    name="reference"
                    className="w-full p-3 border border-[#d6cfbf] rounded-lg focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e]"
                    placeholder="Payment reference"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1e2814] mb-2">Concept</label>
                  <textarea
                    rows={3}
                    required
                    name="concept"
                    className="w-full p-3 border border-[#d6cfbf] rounded-lg focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e]"
                    placeholder="Describe the receipt concept..."
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
                    className="flex-1 bg-[#ede7d7] text-[#4c5535] py-2 rounded-lg hover:bg-[#e0d7c4] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-[#2f3e1e] text-white py-2 rounded-lg hover:bg-[#243015] transition-colors"
                  >
                    Save receipt
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showReceiptDetails && selectedReceipt && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-[#e6dec8]">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold text-[#1e2814]">Receipt details</h3>
                <button
                  onClick={() => {
                    setShowReceiptDetails(false);
                    setSelectedReceipt(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line" />
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-[#4c5535]">Receipt number</label>
                    <p className="text-lg font-semibold text-[#1e2814]">{selectedReceipt.receiptNumber}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#4c5535]">Customer</label>
                    <p className="text-[#1e2814]">{selectedReceipt.customerName}</p>
                    {selectedReceiptCustomer && (
                      <div className="mt-2 text-sm text-[#4c5535] space-y-1">
                        {selectedReceiptCustomer.document && (
                          <p>
                            <span className="font-medium">Document:</span> {selectedReceiptCustomer.document}
                          </p>
                        )}
                        {selectedReceiptCustomer.phone && (
                          <p>
                            <span className="font-medium">Phone:</span> {selectedReceiptCustomer.phone}
                          </p>
                        )}
                        {selectedReceiptCustomer.email && (
                          <p>
                            <span className="font-medium">Email:</span> {selectedReceiptCustomer.email}
                          </p>
                        )}
                        {selectedReceiptCustomer.address && (
                          <p>
                            <span className="font-medium">Address:</span> {selectedReceiptCustomer.address}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#4c5535]">Date</label>
                    <p className="text-[#1e2814]">{formatDate(selectedReceipt.date)}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#4c5535]">Amount</label>
                    <p className="text-2xl font-bold text-[#2f3e1e]">{formatAmount(selectedReceipt.amount)}</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-[#4c5535]">Payment method</label>
                    <p className="text-[#1e2814]">{getPaymentMethodName(selectedReceipt.paymentMethod)}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#4c5535]">Reference</label>
                    <p className="text-[#1e2814]">{selectedReceipt.reference || '—'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#4c5535]">Status</label>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${getStatusColor(
                        selectedReceipt.status,
                      )}`}
                    >
                      {getStatusName(selectedReceipt.status)}
                    </span>
                  </div>
                  {selectedReceipt.invoiceNumbers.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-[#4c5535]">Linked invoices</label>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {selectedReceipt.invoiceNumbers.map((invoice, index) => (
                          <span key={index} className="bg-[#e3edd3] text-[#1e2814] px-2 py-1 rounded text-sm">
                            {invoice}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-6">
                <label className="block text-sm font-medium text-[#4c5535]">Concept</label>
                <p className="text-[#1e2814] mt-1">{selectedReceipt.concept || '—'}</p>
              </div>
              <div className="flex flex-col md:flex-row gap-3 mt-6">
                <button
                  onClick={() => handlePrintReceipt(selectedReceipt)}
                  className="flex-1 inline-flex items-center justify-center px-4 py-2 rounded-lg bg-[#3f5d2a] text-white hover:bg-[#2d451f] transition-colors"
                >
                  <i className="ri-printer-line mr-2" />
                  Print
                </button>
                {selectedReceipt.status === 'active' && (
                  <button
                    onClick={() => handleCancelReceipt(selectedReceipt.id)}
                    className="flex-1 inline-flex items-center justify-center px-4 py-2 rounded-lg bg-[#7a2e1b] text-white hover:bg-[#5a1f13] transition-colors"
                  >
                    <i className="ri-close-circle-line mr-2" />
                    Cancel receipt
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        {/* Print Type Modal */}
        <InvoiceTypeModal
          isOpen={showPrintTypeModal}
          onClose={() => {
            setShowPrintTypeModal(false);
            setReceiptToPrint(null);
          }}
          onSelect={handlePrintTypeSelect}
          documentType="invoice"
          title="Select Receipt Format"
          customerEmail={
            receiptToPrint && !isGeneralCustomerName(receiptToPrint.customerName)
              ? customers.find((c) => c.id === receiptToPrint.customerId)?.email
              : undefined
          }
          onSendEmail={async (templateType) => {
            if (!receiptToPrint) return;
            const fullCustomer = customers.find((c) => c.id === receiptToPrint.customerId);
            const email = fullCustomer?.email;
            if (!email || !email.includes('@')) {
              alert('Customer email not available');
              return;
            }
            let companyInfo: any = null;
            try { companyInfo = await settingsService.getCompanyInfo(); } catch { companyInfo = null; }
            const receiptData = {
              invoiceNumber: receiptToPrint.receiptNumber,
              date: receiptToPrint.date,
              dueDate: receiptToPrint.date,
              amount: receiptToPrint.amount,
              subtotal: receiptToPrint.amount,
              tax: 0,
              items: [{ description: receiptToPrint.concept || 'Payment', quantity: 1, price: receiptToPrint.amount, total: receiptToPrint.amount }],
            };
            const customerData = {
              name: receiptToPrint.customerName || fullCustomer?.name || 'Customer',
              document: fullCustomer?.document,
              phone: fullCustomer?.phone,
              email: fullCustomer?.email,
              address: fullCustomer?.address,
            };
            const companyData = {
              name: companyInfo?.name || companyInfo?.company_name || 'Send Bill Now',
              rnc: companyInfo?.rnc || companyInfo?.tax_id || '',
              phone: companyInfo?.phone || '',
              email: companyInfo?.email || '',
              address: companyInfo?.address || '',
              logo: companyInfo?.logo,
            };
            try {
              const receiptHtml = generateInvoiceHtml(receiptData, customerData, companyData, templateType);
              const pdfBase64 = await generatePdfBase64FromHtml(receiptHtml);
              const res = await fetch('/api/send-receipt-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  to: email,
                  subject: `Receipt ${receiptToPrint.receiptNumber}`,
                  invoiceNumber: receiptToPrint.receiptNumber,
                  customerName: customerData.name,
                  total: receiptToPrint.amount,
                  pdfBase64,
                }),
              });
              if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || 'Failed to send email');
              }
              alert('Email sent successfully!');
            } catch (err: any) {
              console.error('Error sending receipt email:', err);
              alert(err.message || 'Failed to send email');
            }
          }}
        />
      </div>
    </DashboardLayout>
  );
}