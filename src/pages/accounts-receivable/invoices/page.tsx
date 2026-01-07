import { useEffect, useRef, useState } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as ExcelJS from 'exceljs';
import * as QRCode from 'qrcode';

import { saveAs } from 'file-saver';
import { useAuth } from '../../../hooks/useAuth';
import {
  customersService,
  invoicesService,
  settingsService,
  inventoryService,
  taxService,
  customerTypesService,
  customerPaymentsService,
  accountingSettingsService,
  chartAccountsService,
  journalEntriesService,
  receiptsService,
  receiptApplicationsService,
} from '../../../services/database';
import { supabase } from '../../../lib/supabase';
import { formatAmount } from '../../../utils/numberFormat';
import { formatDate } from '../../../utils/dateFormat';
import DateInput from '../../../components/common/DateInput';
import { accountsReceivableTheme as theme } from '../../../theme/accountsReceivable';

interface Invoice {
  id: string;
  publicToken?: string | null;
  customerId: string;
  customerName: string;
  invoiceNumber: string;
  date: string;
  dueDate: string;
  amount: number;
  paidAmount: number;
  balance: number;
  status: 'pending' | 'partial' | 'paid' | 'overdue' | 'cancelled';
  daysOverdue: number;
  subtotal: number;
  tax: number;
  items: {
    description: string;
    quantity: number;
    price: number;
    total: number;
  }[];
}

interface Customer {
  id: string;
  name: string;
  document: string;
  phone?: string;
  email?: string;
  address?: string;
  type: 'regular' | 'vip';
  paymentTermId?: string | null;
  customerTypeId?: string | null;
  arAccountId?: string | null;
}

export default function InvoicesPage() {
  const { user } = useAuth();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showViewInvoiceModal, setShowViewInvoiceModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [invoiceMovements, setInvoiceMovements] = useState<any[]>([]);
  const [loadingMovements, setLoadingMovements] = useState(false);
  const [selectedMovement, setSelectedMovement] = useState<any | null>(null);
  const [movementLines, setMovementLines] = useState<any[]>([]);
  const [showMovementModal, setShowMovementModal] = useState(false);
  const [loadingMovementLines, setLoadingMovementLines] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [companyInfo, setCompanyInfo] = useState<any | null>(null);

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [customerTypes, setCustomerTypes] = useState<any[]>([]);

  const [cashAccounts, setCashAccounts] = useState<{ id: string; code: string; name: string }[]>([]);

  type NewItem = { itemId?: string; description: string; quantity: number; price: number; total: number };

  const [newInvoiceItems, setNewInvoiceItems] = useState<NewItem[]>([
    { itemId: undefined, description: '', quantity: 1, price: 0, total: 0 },
  ]);
  const [newInvoiceSubtotal, setNewInvoiceSubtotal] = useState(0);
  const [newInvoiceTax, setNewInvoiceTax] = useState(0);
  const [newInvoiceTotal, setNewInvoiceTotal] = useState(0);
  const [newInvoiceDiscountType, setNewInvoiceDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [newInvoiceDiscountPercent, setNewInvoiceDiscountPercent] = useState(0);
  const [newInvoiceNoTax, setNewInvoiceNoTax] = useState(false);
  const [taxConfig, setTaxConfig] = useState<{ itbis_rate: number } | null>(null);

  const [newInvoiceDocumentType, setNewInvoiceDocumentType] = useState<string>('');
  const [ncfSeries, setNcfSeries] = useState<any[]>([]);

  const currentItbisRate = taxConfig?.itbis_rate ?? 18;

  const recalcNewInvoiceTotals = (
    items: NewItem[],
    discountType = newInvoiceDiscountType,
    discountValue = newInvoiceDiscountPercent,
    noTaxFlag = newInvoiceNoTax,
  ) => {
    const rawSubtotal = items.reduce((sum, it) => sum + (it.total || 0), 0);
    let discountAmount = 0;
    if (discountType === 'percentage') {
      discountAmount = rawSubtotal * (discountValue / 100);
    } else if (discountType === 'fixed') {
      discountAmount = discountValue;
    }
    if (discountAmount > rawSubtotal) {
      discountAmount = rawSubtotal;
    }
    const subtotal = rawSubtotal - discountAmount;
    const tax = noTaxFlag ? 0 : subtotal * (currentItbisRate / 100);
    const total = subtotal + tax;
    setNewInvoiceSubtotal(subtotal);
    setNewInvoiceTax(tax);
    setNewInvoiceTotal(total);
  };

  const loadCustomers = async () => {
    if (!user?.id) return;
    setLoadingCustomers(true);
    try {
      const [list, items, types] = await Promise.all([
        customersService.getAll(user.id),
        inventoryService.getItems(user.id),
        customerTypesService.getAll(user.id),
      ]);
      const mapped: Customer[] = (list || []).map((c: any) => ({
        id: c.id,
        name: c.name || c.customer_name || 'Cliente',
        document: c.document || c.tax_id || '',
        phone: c.phone || c.contact_phone || '',
        email: c.email || c.contact_email || '',
        address: c.address || '',
        type: (c.type === 'vip' ? 'vip' : 'regular') as 'regular' | 'vip',
        paymentTermId: c.paymentTermId ?? c.payment_term_id ?? null,
        customerTypeId: c.customerType ?? c.customer_type ?? null,
        arAccountId: c.arAccountId ?? c.ar_account_id ?? null,
      }));
      setCustomers(mapped);
      setInventoryItems(items || []);
      setCustomerTypes(types || []);
    } finally {
      setLoadingCustomers(false);
    }
  };

  const loadInvoices = async () => {
    if (!user?.id) return;
    setLoadingInvoices(true);
    try {
      const data = await invoicesService.getAll(user.id as string);
      const mapped: Invoice[] = (data as any[]).map((inv) => {
        const total = Number(inv.total_amount) || 0;
        const paid = Number(inv.paid_amount) || 0;
        const subtotal = Number(inv.subtotal) || (total - (Number(inv.tax_amount) || 0));
        const tax = Number(inv.tax_amount) || (total - subtotal);
        const rawStatus = String(inv.status || 'pending');
        const balance = rawStatus === 'cancelled' ? 0 : total - paid;
        const today = new Date();
        const due = inv.due_date ? new Date(inv.due_date) : null;
        let daysOverdue = 0;
        if (due && balance > 0) {
          const diff = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
          daysOverdue = diff > 0 ? diff : 0;
        }

        const items = (inv.invoice_lines || []).map((line: any) => {
          const qty = Number(line.quantity) || 0;
          const price = Number(line.unit_price) || 0;
          const lineTotal = Number(line.line_total) || qty * price;
          return {
            description: line.description || (line.inventory_items as any)?.name || 'Ítem',
            quantity: qty,
            price,
            total: lineTotal,
          };
        });

        if (items.length === 0) {
          items.push({
            description: inv.description || 'Servicio/Producto',
            quantity: 1,
            price: total,
            total,
          });
        }
        return {
          id: String(inv.id),
          publicToken: (inv as any).public_token ?? (inv as any).publicToken ?? null,
          customerId: String(inv.customer_id),
          customerName: (inv.customers as any)?.name || 'Cliente',
          invoiceNumber: inv.invoice_number as string,
          date: inv.invoice_date as string,
          dueDate: inv.due_date as string,
          amount: total,
          paidAmount: paid,
          balance,
          status: (rawStatus as Invoice['status']) || 'pending',
          daysOverdue,
          subtotal,
          tax,
          items,
        };
      });
      setInvoices(mapped);
    } finally {
      setLoadingInvoices(false);
    }
  };

  useEffect(() => {
    loadCustomers();
    loadInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    const loadCashAccounts = async () => {
      if (!user?.id) return;
      try {
        const data = await chartAccountsService.getAll(user.id as string);
        const normalizeCode = (code: string | null | undefined) => String(code || '').replace(/\./g, '');
        const filtered = (data || [])
          .filter((acc: any) => {
            const norm = normalizeCode(acc.code);
            return norm === '100101'; // Solo Efectivo en Caja (100101)
          })
          .map((acc: any) => ({
            id: String(acc.id),
            code: String(acc.code || ''),
            name: String(acc.name || ''),
          }));
        setCashAccounts(filtered);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error cargando cuenta 100101 para pagos de clientes:', error);
      }
    };

    loadCashAccounts();
  }, [user?.id]);

  useEffect(() => {
    const loadTaxConfig = async () => {
      try {
        const data = await taxService.getTaxConfiguration();
        if (data && typeof data.itbis_rate === 'number') {
          setTaxConfig({ itbis_rate: data.itbis_rate });
        } else {
          setTaxConfig({ itbis_rate: 18 });
        }
      } catch (error) {
        console.error('Error cargando configuración de impuestos para Cuentas por Cobrar:', error);
        setTaxConfig({ itbis_rate: 18 });
      }
    };
    loadTaxConfig();
  }, [user?.id]);

  useEffect(() => {
    const loadNcfSeries = async () => {
      if (!user?.id) {
        setNcfSeries([]);
        return;
      }
      try {
        const series = await taxService.getNcfSeries(user.id);
        setNcfSeries((series || []).filter((s: any) => s.status === 'active'));
      } catch (error) {
        console.error('Error cargando series NCF:', error);
        setNcfSeries([]);
      }
    };

    loadNcfSeries();
  }, [user?.id]);

  useEffect(() => {
    const loadCompanyInfo = async () => {
      const info = await settingsService.getCompanyInfo();
      setCompanyInfo(info);
    };
    loadCompanyInfo();
  }, [user?.id]);

  const getCustomerTotalBalance = (customerId: string) => {
    return invoices
      .filter((inv) => inv.customerId === customerId && inv.status !== 'paid' && inv.status !== 'cancelled')
      .reduce((sum, inv) => sum + inv.balance, 0);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'bg-[#e4f1e4] text-[#315231]';
      case 'partial': return 'bg-[#fff3d6] text-[#7a5510]';
      case 'pending': return 'bg-[#e3e8dd] text-[#374537]';
      case 'overdue': return 'bg-[#fde2de] text-[#8a2a1c]';
      case 'cancelled': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusName = (status: string) => {
    switch (status) {
      case 'paid': return 'Paid';
      case 'partial': return 'Partial';
      case 'pending': return 'Pending';
      case 'overdue': return 'Overdue';
    }
  };

  const primaryButtonClasses =
    'text-white px-4 py-2 rounded-lg transition-colors whitespace-nowrap flex items-center gap-2 hover:opacity-90';

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);

  const handleNewInvoiceCustomerChange = (customerId: string) => {
    setSelectedCustomerId(customerId);

    const customer = customers.find((c) => c.id === customerId);
    if (!customer) {
      setNewInvoiceDiscountType('percentage');
      setNewInvoiceDiscountPercent(0);
      setNewInvoiceNoTax(false);
      recalcNewInvoiceTotals([...newInvoiceItems], 'percentage', 0, false);
      return;
    }

    const type = customer.customerTypeId
      ? customerTypes.find((t: any) => String(t.id) === String(customer.customerTypeId))
      : null;

    let discountPercent = 0;
    let noTaxFlag = false;
    if (type) {
      discountPercent = Number((type as any).fixedDiscount) || 0;
      noTaxFlag = Boolean((type as any).noTax);
    }

    setNewInvoiceDiscountType('percentage');
    setNewInvoiceDiscountPercent(discountPercent);
    setNewInvoiceNoTax(noTaxFlag);
    recalcNewInvoiceTotals([...newInvoiceItems], 'percentage', discountPercent, noTaxFlag);
  };

  const filteredInvoices = invoices.filter(invoice => {
    const matchesSearch = invoice.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         invoice.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || invoice.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const exportToPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    const companyName =
      (companyInfo as any)?.name ||
      (companyInfo as any)?.company_name ||
      'ContaBi';

    const title = 'Accounts Receivable Report';
    const dateStr = formatDate(new Date());
    const statusText = statusFilter === 'all' ? 'All' : getStatusName(statusFilter);

    // Encabezado: nombre de empresa, título y filtros
    doc.setFontSize(18);
    doc.setTextColor(40, 40, 40);
    doc.text(companyName, pageWidth / 2, 18, { align: 'center' } as any);

    doc.setFontSize(12);
    doc.text(title, pageWidth / 2, 26, { align: 'center' } as any);

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated on: ${dateStr}`, 20, 36);
    doc.text(`Status filter: ${statusText}`, 20, 44);

    const totalAmount = filteredInvoices.reduce((sum, inv) => sum + inv.amount, 0);
    const totalBalance = filteredInvoices.reduce((sum, inv) => sum + inv.balance, 0);
    const totalPaid = filteredInvoices.reduce((sum, inv) => sum + inv.paidAmount, 0);

    doc.setFontSize(14);
    doc.text('Financial Summary', 20, 60);

    const summaryData = [
      ['Metric', 'Amount'],
      ['Total Invoiced', `RD$ ${formatAmount(totalAmount)}`],
      ['Total Paid', `RD$ ${formatAmount(totalPaid)}`],
      ['Outstanding Balance', `RD$ ${formatAmount(totalBalance)}`],
      ['Invoice Count', filteredInvoices.length.toString()]
    ];

    (doc as any).autoTable({
      startY: 70,

      head: [summaryData[0]],
      body: summaryData.slice(1),
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246] },
      styles: { fontSize: 10 }
    });

    doc.setFontSize(14);
    doc.text('Invoice Detail', 20, (doc as any).lastAutoTable.finalY + 20);

    const invoiceData = filteredInvoices.map(invoice => [
      invoice.invoiceNumber,
      invoice.customerName,
      formatDate(invoice.date),
      formatDate(invoice.dueDate),
      `RD$ ${formatAmount(invoice.amount)}`,
      `RD$ ${formatAmount(invoice.paidAmount)}`,
      `RD$ ${formatAmount(invoice.balance)}`,
      getStatusName(invoice.status)
    ]);
    
    (doc as any).autoTable({
      startY: (doc as any).lastAutoTable.finalY + 30,
      head: [['Invoice', 'Customer', 'Issue Date', 'Due Date', 'Amount', 'Paid', 'Balance', 'Status']],

      body: invoiceData,
      theme: 'striped',
      headStyles: { fillColor: [34, 197, 94] },
      styles: { fontSize: 8 }
    });
    
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.text(`Page ${i} of ${pageCount}`, 20, doc.internal.pageSize.height - 10);
      doc.text('Sendbillnow Accounting Suite', doc.internal.pageSize.width - 65, doc.internal.pageSize.height - 10);

    }
    
    doc.save(`accounts-receivable-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const exportToExcel = async () => {
    const totalAmount = filteredInvoices.reduce((sum, inv) => sum + inv.amount, 0);
    const totalBalance = filteredInvoices.reduce((sum, inv) => sum + inv.balance, 0);
    const totalPaid = filteredInvoices.reduce((sum, inv) => sum + inv.paidAmount, 0);

    const companyName =
      (companyInfo as any)?.name ||
      (companyInfo as any)?.company_name ||
      'ContaBi';

    const statusText =
      statusFilter === 'all' ? 'All' : getStatusName(statusFilter as Invoice['status']);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Accounts Receivable');

    // Encabezado principal
    worksheet.mergeCells('A1:I1');
    worksheet.getCell('A1').value = companyName;
    worksheet.getCell('A1').font = { bold: true, size: 16 };
    worksheet.getCell('A1').alignment = { horizontal: 'center' } as any;

    worksheet.mergeCells('A2:I2');
    worksheet.getCell('A2').value = 'Accounts Receivable Report';

    worksheet.getCell('A2').font = { bold: true, size: 12 };
    worksheet.getCell('A2').alignment = { horizontal: 'center' } as any;

    worksheet.getCell('A3').value = `Generated on: ${formatDate(new Date())}`;
    worksheet.getCell('A4').value = `Status filter: ${statusText}`;

    // Resumen financiero
    worksheet.addRow([]);
    const resumenTitleRow = worksheet.addRow(['FINANCIAL SUMMARY']);

    resumenTitleRow.font = { bold: true };

    const resumenStartRow = resumenTitleRow.number + 1;
    worksheet.getCell(`A${resumenStartRow}`).value = 'Total Invoiced';

    worksheet.getCell(`B${resumenStartRow}`).value = formatAmount(totalAmount);

    worksheet.getCell(`A${resumenStartRow + 1}`).value = 'Total Paid';

    worksheet.getCell(`B${resumenStartRow + 1}`).value = formatAmount(totalPaid);

    worksheet.getCell(`A${resumenStartRow + 2}`).value = 'Outstanding Balance';

    worksheet.getCell(`B${resumenStartRow + 2}`).value = formatAmount(totalBalance);

    worksheet.getCell(`A${resumenStartRow + 3}`).value = 'Invoice Count';

    worksheet.getCell(`B${resumenStartRow + 3}`).value = filteredInvoices.length;

    // Formato numérico RD$
    for (let r = resumenStartRow; r <= resumenStartRow + 2; r++) {
      const cell = worksheet.getCell(`B${r}`);
      cell.numFmt = '#,##0.00';
    }

    worksheet.addRow([]);

    // Detalle de facturas
    const detalleTitleRow = worksheet.addRow(['INVOICE DETAIL']);

    detalleTitleRow.font = { bold: true };

    const headerRow = worksheet.addRow([
      'Invoice',
      'Customer',
      'Issue Date',
      'Due Date',
      'Amount',
      'Paid',
      'Balance',
      'Status',

    ]);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1F3A' } };
    });

    filteredInvoices.forEach((invoice) => {
      worksheet.addRow([
        invoice.invoiceNumber,
        invoice.customerName,
        formatDate(invoice.date),
        formatDate(invoice.dueDate),
        formatAmount(invoice.amount),
        formatAmount(invoice.paidAmount),
        formatAmount(invoice.balance),
        getStatusName(invoice.status),
      ]);
    });

    // Anchos de columnas
    worksheet.columns = [
      { width: 20 },  // Factura
      { width: 30 },  // Cliente
      { width: 14 },  // Fecha
      { width: 14 },  // Vencimiento
      { width: 16 },  // Monto
      { width: 16 },  // Pagado
      { width: 16 },  // Saldo
      { width: 14 },  // Estado
    ];

    // Formato numérico en columnas de montos (Monto, Pagado, Saldo)
    ['E', 'F', 'G'].forEach((col) => {
      worksheet.getColumn(col).numFmt = '#,##0.00';
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    saveAs(blob, `facturas-por-cobrar-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleExportInvoiceExcel = async (invoiceId: string) => {
    const invoice = invoices.find((inv) => inv.id === invoiceId);
    if (!invoice) return;

    const companyName =
      (companyInfo as any)?.name ||
      (companyInfo as any)?.company_name ||
      'ContaBi';
    const companyRnc =
      (companyInfo as any)?.rnc ||
      (companyInfo as any)?.tax_id ||
      (companyInfo as any)?.ruc ||
      '';

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Factura');

    worksheet.mergeCells('A1:D1');
    worksheet.getCell('A1').value = companyName;
    worksheet.getCell('A1').font = { bold: true, size: 16 };
    worksheet.getCell('A1').alignment = { horizontal: 'center' } as any;

    if (companyRnc) {
      worksheet.mergeCells('A2:D2');
      worksheet.getCell('A2').value = `RNC: ${companyRnc}`;
      worksheet.getCell('A2').alignment = { horizontal: 'center' } as any;
      worksheet.getCell('A2').font = { size: 10 };
    }

    const headerStartRow = companyRnc ? 3 : 2;
    worksheet.mergeCells(`A${headerStartRow}:D${headerStartRow}`);
    worksheet.getCell(`A${headerStartRow}`).value = `Factura #${invoice.invoiceNumber}`;
    worksheet.getCell(`A${headerStartRow}`).font = { bold: true, size: 12 };

    worksheet.addRow([]);
    worksheet.addRow(['Cliente', invoice.customerName]);
    worksheet.addRow(['Fecha', invoice.date ? formatDate(invoice.date) : '']);
    worksheet.addRow(['Vencimiento', invoice.dueDate ? formatDate(invoice.dueDate) : '']);

    worksheet.addRow([]);
    const itemsHeader = worksheet.addRow([
      'Descripción',
      'Cantidad',
      'Precio',
      'Total',
    ]);
    itemsHeader.font = { bold: true };

    invoice.items.forEach((item) => {
      worksheet.addRow([
        item.description,
        item.quantity,
        formatAmount(item.price),
        formatAmount(item.total),
      ]);
    });

    worksheet.addRow([]);
    worksheet.addRow(['', '', 'Subtotal', formatAmount(invoice.subtotal)]);
    worksheet.addRow(['', '', 'ITBIS', formatAmount(invoice.tax)]);
    worksheet.addRow(['', '', 'Total', formatAmount(invoice.amount)]);
    worksheet.addRow(['', '', 'Pagado', formatAmount(invoice.paidAmount)]);
    worksheet.addRow(['', '', 'Saldo', formatAmount(invoice.balance)]);

    worksheet.columns = [
      { width: 40 },
      { width: 12 },
      { width: 14 },
      { width: 14 },
    ];

    ['C', 'D'].forEach((col) => {
      worksheet.getColumn(col).numFmt = '#,##0.00';
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const safeNumber = invoice.invoiceNumber || invoice.id;
    saveAs(blob, `factura_cxc_${safeNumber}.xlsx`);
  };

  const handleSaveInvoice = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user?.id) {
      alert('Debes iniciar sesión para crear facturas');
      return;
    }

    const formData = new FormData(e.currentTarget);
    const customerId = String(formData.get('customer_id') || '');
    const dueDate = String(formData.get('due_date') || '');
    const description = String(formData.get('description') || '');

    const amount = newInvoiceTotal;

    if (!customerId || !amount) {
      alert('Cliente y al menos un producto/servicio con monto son obligatorios');
      return;
    }

    // Debug trace
    // eslint-disable-next-line no-console
    console.log('[Invoices] handleSaveInvoice payload', { customerId, dueDate, description, amount });

    const todayStr = new Date().toISOString().slice(0, 10);
    let invoiceNumber = `FAC-${Date.now()}`;

    const selectedDocType = String(newInvoiceDocumentType || '');
    if (selectedDocType) {
      const availableDocTypes = Array.from(
        new Set(
          (ncfSeries || [])
            .filter((s: any) => s.status === 'active')
            .map((s: any) => String(s.document_type)),
        ),
      );

      if (!availableDocTypes.includes(selectedDocType)) {
        alert('No hay serie NCF activa disponible para el tipo seleccionado.');
        return;
      }

      try {
        const nextNcf = await taxService.getNextNcf(user.id, selectedDocType);
        if (nextNcf?.ncf) {
          invoiceNumber = nextNcf.ncf;
        }
      } catch {
        // NCF no disponible - se usará número interno
      }
    }

    const invoicePayload = {
      customer_id: customerId,
      invoice_number: invoiceNumber,
      invoice_date: todayStr,
      due_date: dueDate || null,
      currency: 'DOP',
      subtotal: newInvoiceSubtotal,
      tax_amount: newInvoiceTax,
      total_amount: newInvoiceTotal,
      paid_amount: 0,
      status: 'pending',
      notes: description,
    };

    const linesPayload = newInvoiceItems
      .filter((it) => (it.description || it.itemId) && (it.quantity || 0) > 0)
      .map((it, index) => ({
        description: it.description || 'Servicio/Producto',
        quantity: it.quantity || 0,
        unit_price: it.price || 0,
        line_total: it.total || (it.quantity || 0) * (it.price || 0),
        line_number: index + 1,
        item_id: it.itemId ?? null,
      }));

    if (linesPayload.length === 0) {
      alert('Debes agregar al menos un producto o servicio a la factura');
      return;
    }

    try {
      await invoicesService.create(user.id, invoicePayload, linesPayload);
      await loadInvoices();
      alert('Factura creada exitosamente');
      setShowInvoiceModal(false);
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('[Invoices] Error al crear factura', error);
      alert(`Error al crear la factura: ${error?.message || 'revisa la consola para más detalles'}`);
    }
  };

  const handleRegisterPayment = (invoice?: Invoice | null) => {
    // Abre el modal de pago (sin guardar). El guardado lo hace handleSavePayment.
    if (invoice) {
      setSelectedInvoice(invoice);
    } else {
      setSelectedInvoice(null);
    }
    setShowPaymentModal(true);
  };

  const handleSavePayment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!user?.id) {
      alert('Debes iniciar sesión para registrar pagos');
      return;
    }

    const formData = new FormData(e.currentTarget);

    const invoiceId = selectedInvoice ? selectedInvoice.id : String(formData.get('invoice_id') || '');
    const amountToPay = Number(formData.get('amount_to_pay') || 0);
    const paymentMethod = String(formData.get('payment_method') || 'cash');
    const reference = String(formData.get('reference') || '').trim();
    const cashAccountIdFromForm = String(formData.get('cash_account_id') || '');

    if (!invoiceId) {
      alert('Debes seleccionar una factura');
      return;
    }

    if (!amountToPay || amountToPay <= 0) {
      alert('El monto a pagar debe ser mayor que 0');
      return;
    }

    const currentInvoice = invoices.find((inv) => inv.id === invoiceId);
    if (!currentInvoice) {
      alert('La factura seleccionada no es válida');
      return;
    }

    const effectivePayment = Math.min(amountToPay, currentInvoice.balance);
    const change = amountToPay - effectivePayment;
    const paymentDate = new Date().toISOString().slice(0, 10);

    const newPaid = currentInvoice.paidAmount + effectivePayment;
    const newBalance = currentInvoice.amount - newPaid;
    const newStatus: Invoice['status'] = newBalance > 0 ? 'partial' : 'paid';

    try {
      const settings = await accountingSettingsService.get(user.id);
      const normalizeCode = (code: string | null | undefined) => String(code || '').replace(/\./g, '');

      let cashAccountId: string | null = cashAccountIdFromForm ? cashAccountIdFromForm : '';
      if (!cashAccountId) {
        cashAccountId = (settings as any)?.cash_account_id ? String((settings as any).cash_account_id) : '';
      }
      if (!cashAccountId) {
        const fromState = cashAccounts[0]?.id;
        if (fromState) cashAccountId = String(fromState);
      }
      if (!cashAccountId) {
        try {
          const allAccounts = await chartAccountsService.getAll(user.id);
          const cash100101 = (allAccounts || []).find((a: any) => normalizeCode(a.code) === '100101');
          if (cash100101?.id) cashAccountId = String(cash100101.id);
        } catch {
          // ignore
        }
      }

      const customerSpecificArId = customers.find((c) => c.id === currentInvoice.customerId)?.arAccountId;
      const arAccountId = customerSpecificArId || (settings?.ar_account_id as string | undefined);

      const paymentPayload: any = {
        customer_id: currentInvoice.customerId,
        invoice_id: invoiceId,
        bank_account_id: null,
        amount: effectivePayment,
        payment_method: paymentMethod,
        payment_date: paymentDate,
        reference: reference || null,
      };

      const createdPayment = await customerPaymentsService.create(user.id, paymentPayload);

      await invoicesService.updatePayment(invoiceId, newPaid, newStatus);
      await loadInvoices();

      try {
        if (!cashAccountId) {
          alert('Pago registrado, pero no se pudo crear el asiento contable: configure la cuenta de Caja General (100101).');
        } else if (!arAccountId) {
          alert('Pago registrado, pero no se pudo crear el asiento contable: configure la cuenta de Cuentas por Cobrar.');
        } else {
          const lines: any[] = [
            {
              account_id: cashAccountId,
              description: 'Cobro de cliente - Caja General',
              debit_amount: effectivePayment,
              credit_amount: 0,
              line_number: 1,
            },
            {
              account_id: arAccountId,
              description: 'Cobro de cliente - Cuentas por Cobrar',
              debit_amount: 0,
              credit_amount: effectivePayment,
              line_number: 2,
            },
          ];

          const description = `Pago factura ${currentInvoice.invoiceNumber}`;

          const refText = reference || '';
          const entryReference = createdPayment?.id
            ? refText
              ? `Pago:${createdPayment.id} Ref:${refText}`
              : `Pago:${createdPayment.id}`
            : refText || undefined;

          const entryPayload = {
            entry_number: createdPayment?.id || `CP-${Date.now()}`,
            entry_date: paymentDate,
            description,
            reference: entryReference ?? null,
            status: 'posted' as const,
          };

          await journalEntriesService.createWithLines(user.id, entryPayload, lines);
        }
      } catch (jeError) {
        console.error('Error creando asiento contable para pago de factura:', jeError);
        alert('Pago registrado, pero ocurrió un error al crear el asiento contable.');
      }

      try {
        const receiptNumber = `RC-${Date.now()}`;
        const receiptPayload = {
          customer_id: currentInvoice.customerId,
          receipt_number: receiptNumber,
          receipt_date: paymentDate,
          amount: effectivePayment,
          payment_method: paymentMethod,
          reference: reference || null,
          concept: `Pago factura ${currentInvoice.invoiceNumber}`,
          status: 'active' as const,
        };

        const createdReceipt = await receiptsService.create(user.id, receiptPayload);

        await receiptApplicationsService.create(user.id, {
          receipt_id: createdReceipt.id,
          invoice_id: invoiceId,
          amount_applied: effectivePayment,
          application_date: paymentDate,
          notes: null,
        });

        const receiptNo = (createdReceipt as any)?.receipt_number || receiptNumber;

        const companyName = (companyInfo as any)?.name || (companyInfo as any)?.company_name || 'ContaBi';
        const companyRnc =
          (companyInfo as any)?.rnc || (companyInfo as any)?.tax_id || (companyInfo as any)?.ruc || '';

        const amountText = formatAmount(effectivePayment);

        const receiptHtml = `
          <html>
            <head>
              <meta charset="utf-8" />
              <meta name="viewport" content="width=device-width, initial-scale=1" />
              <title>Recibo ${receiptNo}</title>
              <style>
                :root { --bg:#f3f4f6; --card:#fff; --text:#111827; --muted:#6b7280; --border:#e5e7eb; --primary:#2563eb; --primaryDark:#1d4ed8; }
                *{ box-sizing:border-box; }
                body{ margin:0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; background:var(--bg); color:var(--text); }
                .page{ padding:24px; }
                .card{ max-width:860px; margin:0 auto; background:var(--card); border:1px solid var(--border); border-radius:14px; overflow:hidden; box-shadow:0 10px 22px rgba(0,0,0,.08); }
                .header{ padding:20px 22px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; gap:16px; align-items:flex-start; }
                .brand h1{ margin:0; font-size:18px; font-weight:800; }
                .brand p{ margin:4px 0 0; font-size:12px; color:var(--muted); }
                .title{ text-align:right; }
                .title h2{ margin:0; font-size:16px; font-weight:800; color:var(--primary); }
                .title p{ margin:4px 0 0; font-size:12px; color:var(--muted); }
                .content{ padding:18px 22px 22px; }
                .grid{ display:grid; grid-template-columns:1fr; gap:12px; }
                @media (min-width: 720px){ .grid{ grid-template-columns:1fr 1fr; } }
                .field{ border:1px solid var(--border); border-radius:12px; padding:12px 14px; background:#fafafa; }
                .label{ font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:.08em; }
                .value{ margin-top:6px; font-size:14px; font-weight:700; word-break:break-word; }
                .amount{ margin-top:14px; padding:14px; border-radius:12px; border:1px solid rgba(22,163,74,.25); background: rgba(22,163,74,.08); display:flex; justify-content:space-between; gap:12px; align-items:center; }
                .amount .label{ color: rgba(22,163,74,.9); }
                .amount .value{ font-size:18px; }
                .actions{ margin-top:16px; display:flex; justify-content:flex-end; gap:10px; }
                .btn{ appearance:none; border:0; border-radius:10px; padding:10px 14px; font-weight:700; font-size:13px; cursor:pointer; }
                .btnPrimary{ background:var(--primary); color:#fff; }
                .btnPrimary:hover{ background:var(--primaryDark); }
                .footer{ padding:14px 22px; border-top:1px solid var(--border); font-size:12px; color:var(--muted); }
                @media print{ body{ background:#fff; } .page{ padding:0; } .card{ box-shadow:none; border:0; border-radius:0; } .actions{ display:none !important; } }
              </style>
            </head>
            <body>
              <div class="page">
                <div class="card">
                  <div class="header">
                    <div class="brand">
                      <h1>${companyName}</h1>
                      ${companyRnc ? `<p>RNC: ${companyRnc}</p>` : `<p>&nbsp;</p>`}
                    </div>
                    <div class="title">
                      <div>
                        <div class="label">Monto recibido</div>
                        <div class="value">RD$ ${amountText}</div>
                      </div>
                      <div style="color: rgba(22,163,74,.9); font-weight:800;">Cobro</div>
                    </div>

                    <div class="actions">
                      <button class="btn btnPrimary" onclick="window.print()" type="button">Imprimir</button>
                    </div>
                  </div>

                  <div class="footer">Este documento fue generado automáticamente por el sistema.</div>
                </div>
              </div>
            </body>
          </html>
        `;

        openReceiptPreview(receiptHtml, `Recibo de Cobro #${receiptNo}`, `recibo-${receiptNo}.html`);
      } catch (receiptError) {
        console.error('Error generando recibo de cobro automático:', receiptError);
        alert('Pago registrado, pero ocurrió un error al generar el recibo de cobro.');
      }

      if (change > 0) {
        alert(
          `Pago registrado correctamente. Devuelta: RD$ ${formatAmount(change)}`,
        );
      } else {
        alert('Pago registrado exitosamente');
      }

      setShowPaymentModal(false);
      setSelectedInvoice(null);
    } catch (error: any) {
      console.error('[Invoices] Error al registrar pago', error);
      alert(`Error al registrar el pago: ${error?.message || 'revisa la consola para más detalles'}`);
    }
  };

  const [showReceiptPreviewModal, setShowReceiptPreviewModal] = useState(false);
  const [receiptPreviewTitle, setReceiptPreviewTitle] = useState('');
  const [receiptPreviewFilename, setReceiptPreviewFilename] = useState('');
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState('');
  const [receiptPreviewBlob, setReceiptPreviewBlob] = useState<Blob | null>(null);
  const receiptPreviewIframeRef = useRef<HTMLIFrameElement | null>(null);

  const openReceiptPreview = (html: string, title: string, filename: string) => {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    setReceiptPreviewTitle(title);
    setReceiptPreviewFilename(filename);
    setReceiptPreviewBlob(blob);
    setReceiptPreviewUrl(url);
    setShowReceiptPreviewModal(true);
  };

  const handleCloseReceiptPreview = () => {
    setShowReceiptPreviewModal(false);
    setReceiptPreviewTitle('');
    setReceiptPreviewFilename('');
    setReceiptPreviewBlob(null);
    setReceiptPreviewUrl('');
  };

  const handlePrintReceiptPreview = () => {
    const iframe = receiptPreviewIframeRef.current;
    const win = iframe?.contentWindow;
    if (!win) return;
    win.focus();
    win.print();
  };

  const handleDownloadReceiptPreview = () => {
    if (!receiptPreviewBlob || !receiptPreviewFilename) return;
    const url = URL.createObjectURL(receiptPreviewBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = receiptPreviewFilename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const handleNewInvoice = () => {
    setSelectedInvoice(null);
    setSelectedCustomerId('');
    setNewInvoiceItems([{ itemId: undefined, description: '', quantity: 1, price: 0, total: 0 }]);
    setNewInvoiceDiscountType('percentage');
    setNewInvoiceDiscountPercent(0);
    setNewInvoiceNoTax(false);
    setNewInvoiceDocumentType('');
    recalcNewInvoiceTotals([{ itemId: undefined, description: '', quantity: 1, price: 0, total: 0 }]);
    setShowInvoiceModal(true);
  };

  const handleViewInvoice = async (invoiceId: string) => {
    const invoice = invoices.find((inv) => inv.id === invoiceId);
    if (!invoice) return;
    if (!user?.id) return;

    setSelectedInvoice(invoice);
    setShowViewInvoiceModal(true);
    setLoadingMovements(true);
    setInvoiceMovements([]);

    try {
      const invoiceNumber = String(invoice.invoiceNumber || '').trim();
      const invoiceRef = String(invoice.id || '').trim();

      const orFilters = [
        invoiceRef ? `reference.eq.${invoiceRef}` : null,
        invoiceNumber ? `description.ilike.%${invoiceNumber}%` : null,
        invoiceNumber ? `entry_number.ilike.%${invoiceNumber}%` : null,
        invoiceNumber ? `reference.ilike.%${invoiceNumber}%` : null,
      ]
        .filter(Boolean)
        .join(',');

      if (!orFilters) {
        setInvoiceMovements([]);
        return;
      }

      const { data: entries, error } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('user_id', user.id)
        .or(orFilters)
        .order('entry_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      setInvoiceMovements(entries || []);
    } catch (error) {
      console.error('Error loading invoice movements:', error);
      setInvoiceMovements([]);
    } finally {
      setLoadingMovements(false);
    }
  };

  const handleViewMovement = async (movement: any) => {
    setSelectedMovement(movement);
    setShowMovementModal(true);
    setLoadingMovementLines(true);
    try {
      const { data, error } = await supabase
        .from('journal_entry_lines')
        .select(`
          id,
          account_id,
          description,
          debit_amount,
          credit_amount,
          line_number,
          chart_accounts(id, code, name)
        `)
        .eq('journal_entry_id', movement.id)
        .order('line_number', { ascending: true });

      if (error) throw error;
      setMovementLines(data || []);
    } catch (error) {
      console.error('Error loading movement lines:', error);
      setMovementLines([]);
    } finally {
      setLoadingMovementLines(false);
    }
  };

  const handlePrintInvoice = (invoiceId: string) => {
    const invoice = invoices.find((inv) => inv.id === invoiceId);
    if (!invoice) return;

    (async () => {
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert('No se pudo abrir la ventana de impresión');
        return;
      }

      const fullCustomer = invoice.customerId
        ? customers.find((c) => c.id === invoice.customerId)
        : undefined;

      const customerDocument = fullCustomer?.document || '';
      const customerPhone = fullCustomer?.phone || '';
      const customerEmail = fullCustomer?.email || '';
      const customerAddress = fullCustomer?.address || '';

      const companyName =
        (companyInfo as any)?.name ||
        (companyInfo as any)?.company_name ||
        'ContaBi';

      const companyRnc =
        (companyInfo as any)?.rnc ||
        (companyInfo as any)?.tax_id ||
        (companyInfo as any)?.ruc ||
        '';

      const companyPhone =
        (companyInfo as any)?.phone ||
        (companyInfo as any)?.company_phone ||
        (companyInfo as any)?.contact_phone ||
        '';

      const companyEmail =
        (companyInfo as any)?.email ||
        (companyInfo as any)?.company_email ||
        (companyInfo as any)?.contact_email ||
        '';

      const companyAddress =
        (companyInfo as any)?.address ||
        (companyInfo as any)?.company_address ||
        '';

      let qrDataUrl = '';
      try {
        const token = invoice.publicToken;
        const qrUrl = token
          ? `${window.location.origin}/public/document/invoice/${encodeURIComponent(String(token))}`
          : `${window.location.origin}/document/invoice/${encodeURIComponent(String(invoice.id))}`;
        qrDataUrl = await QRCode.toDataURL(qrUrl, {
          errorCorrectionLevel: 'M',
          margin: 1,
          width: 160,
        });
      } catch {
        qrDataUrl = '';
      }

      const itemsHtml = (invoice.items || [])
        .map(
          (item: any, idx: number) => `
            <tr>
              <td>${idx + 1}</td>
              <td>${item.description}</td>
              <td class="num">RD$ ${formatAmount(item.price)}</td>
              <td class="num">${item.quantity}</td>
              <td class="num">RD$ ${formatAmount(item.total)}</td>
            </tr>`,
        )
        .join('');

      const html = `
        <html>
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>Invoice ${invoice.invoiceNumber}</title>
            <style>
              :root { --bg:#f3f4f6; --card:#fff; --text:#111827; --muted:#6b7280; --border:#e5e7eb; --primary:#2563eb; --primaryDark:#1d4ed8; }
              *{ box-sizing:border-box; }
              body{ margin:0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; background:var(--bg); color:var(--text); }
              .page{ padding:24px; }
              .card{ max-width:860px; margin:0 auto; background:var(--card); border:1px solid var(--border); border-radius:14px; overflow:hidden; box-shadow:0 10px 22px rgba(0,0,0,.08); }
              .header{ padding:20px 22px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; gap:16px; align-items:flex-start; }
              .brand h1{ margin:0; font-size:18px; font-weight:800; }
              .brand p{ margin:4px 0 0; font-size:12px; color:var(--muted); }
              .title{ text-align:right; }
              .title h2{ margin:0; font-size:16px; font-weight:800; color:var(--primary); }
              .title p{ margin:4px 0 0; font-size:12px; color:var(--muted); }
              .content{ padding:18px 22px 22px; }
              .grid{ display:grid; grid-template-columns:1fr; gap:12px; }
              @media (min-width: 720px){ .grid{ grid-template-columns:1fr 1fr; } }
              .field{ border:1px solid var(--border); border-radius:12px; padding:12px 14px; background:#fafafa; }
              .label{ font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:.08em; }
              .value{ margin-top:6px; font-size:14px; font-weight:700; word-break:break-word; }
              .amount{ margin-top:14px; padding:14px; border-radius:12px; border:1px solid rgba(22,163,74,.25); background: rgba(22,163,74,.08); display:flex; justify-content:space-between; gap:12px; align-items:center; }
              .amount .label{ color: rgba(22,163,74,.9); }
              .amount .value{ font-size:18px; }
              .actions{ margin-top:16px; display:flex; justify-content:flex-end; gap:10px; }
              .btn{ appearance:none; border:0; border-radius:10px; padding:10px 14px; font-weight:700; font-size:13px; cursor:pointer; }
              .btnPrimary{ background:var(--primary); color:#fff; }
              .btnPrimary:hover{ background:var(--primaryDark); }
              .footer{ padding:14px 22px; border-top:1px solid var(--border); font-size:12px; color:var(--muted); }
              @media print{ body{ background:#fff; } .page{ padding:0; } .card{ box-shadow:none; border:0; border-radius:0; } .actions{ display:none !important; } }
            </style>
            <script>
              window.onload = function() {
                window.print();
                setTimeout(() => window.close(), 1000);
              };
            </script>
          </body>
        </html>
      `;

      printWindow.document.write(html);
      printWindow.document.close();
    })();
  };

  const handleCancelInvoice = async (invoice: Invoice) => {
    if (!user?.id) return;
    if (invoice.status === 'cancelled') return;

    if (!confirm(`¿Desea anular la factura ${invoice.invoiceNumber}? Esta acción no se puede deshacer.`)) {
      return;
    }

    try {
      await invoicesService.cancel(user.id, invoice.id);
      await loadInvoices();
      alert('Factura anulada exitosamente');
    } catch (error: any) {
      console.error('Error anulando factura:', error);
      alert(error?.message || 'Error al anular la factura');
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Accounts Receivable Invoices</h1>
          <div className="flex space-x-3">
            <button
              onClick={handleNewInvoice}
              className={primaryButtonClasses}
              style={{ backgroundColor: theme.primary }}
            >
              <i className="ri-add-line"></i>
              <span>New Invoice</span>
            </button>
            <button
              onClick={() => handleRegisterPayment()}
              className={primaryButtonClasses}
              style={{ backgroundColor: theme.accent }}
            >
              <i className="ri-money-dollar-circle-line"></i>
              <span>Record Payment</span>
            </button>
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
                className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5c4b] focus:border-[#4b5c4b] text-sm"
                placeholder="Search by customer or invoice number..."
              />
            </div>
          </div>

          <div className="w-full md:w-48">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5c4b] focus:border-[#4b5c4b] text-sm pr-8"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={exportToPDF}
              className={primaryButtonClasses}
              style={{ backgroundColor: theme.danger }}
            >
              <i className="ri-file-pdf-line"></i>
              <span>PDF</span>
            </button>
            <button
              onClick={exportToExcel}
              className={primaryButtonClasses}
              style={{ backgroundColor: theme.success }}
            >
              <i className="ri-file-excel-line"></i>
              <span>Excel</span>
            </button>
          </div>
        </div>

        {/* Invoices Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          {(loadingCustomers || loadingInvoices) && (
            <div className="px-6 pt-3 text-sm text-gray-500">Loading data...</div>
          )}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Invoice
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Issue Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Due Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Paid
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Balance
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
                {filteredInvoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {invoice.invoiceNumber}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {invoice.customerName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {invoice.date}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {invoice.dueDate}
                      {invoice.daysOverdue > 0 && (
                        <span className="ml-2 text-red-600 text-xs">
                          ({invoice.daysOverdue} days)
                        </span>
                      )}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      RD${formatAmount(invoice.amount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      RD${formatAmount(invoice.paidAmount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      RD${formatAmount(invoice.balance)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(invoice.status)}`}>
                        {getStatusName(invoice.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        {invoice.status !== 'paid' && invoice.status !== 'cancelled' && invoice.balance > 0 && (
                          <button
                            onClick={() => handleRegisterPayment(invoice)}
                            className="text-[#3c6b3c] hover:text-[#284528]"
                            title="Record payment"
                          >
                            <i className="ri-money-dollar-circle-line"></i>
                          </button>
                        )}
                        <button
                          onClick={() => handleViewInvoice(invoice.id)}
                          className="text-[#1d4ed8] hover:text-[#15359a]"
                          title="View details"
                        >
                          <i className="ri-eye-line"></i>
                        </button>
                        <button
                          onClick={() => handlePrintInvoice(invoice.id)}
                          className="text-[#6d28d9] hover:text-[#5018a7]"
                          title="Print invoice"
                        >
                          <i className="ri-printer-line"></i>
                        </button>
                        <button
                          onClick={() => handleExportInvoiceExcel(invoice.id)}
                          className="text-[#15803d] hover:text-[#116030]"
                          title="Export to Excel"
                        >
                          <i className="ri-file-excel-2-line"></i>
                        </button>
                        {invoice.status !== 'paid' && invoice.status !== 'cancelled' && invoice.paidAmount <= 0 && (
                          <button
                            onClick={() => handleCancelInvoice(invoice)}
                            className="text-[#b64736] hover:text-[#8a3528]"
                            title="Void invoice"
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

        {/* New Invoice Modal */}
        {showInvoiceModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900">New Invoice</h3>
                <button
                  onClick={() => setShowInvoiceModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >

                  <i className="ri-close-line"></i>
                </button>
              </div>
              
              <form onSubmit={handleSaveInvoice} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Customer
                    </label>
                    <select 
                      required
                      name="customer_id"
                      value={selectedCustomerId}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                      onChange={(e) => handleNewInvoiceCustomerChange(e.target.value)}
                    >
                      <option value="">Select customer</option>
                      {customers.map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.name}

                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Due Date
                    </label>
                    <DateInput
                      required
                      name="due_date"

                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Document type (NCF)</label>
                    <select
                      value={newInvoiceDocumentType}
                      onChange={(e) => setNewInvoiceDocumentType(e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                    >
                      <option value="">Not selected...</option>
                      {Array.from(
                        new Set(
                          (ncfSeries || [])

                            .filter((s: any) => s.status === 'active')
                            .map((s: any) => String(s.document_type)),
                        ),
                      ).map((dt) => (
                        <option key={dt} value={dt}>
                          {dt}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                
                {selectedCustomer && (
                  <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-700">
                    <p className="font-medium">{selectedCustomer.name}</p>
                    {selectedCustomer.document && (
                      <p>Document: {selectedCustomer.document}</p>
                    )}
                    {selectedCustomer.phone && (
                      <p>Phone: {selectedCustomer.phone}</p>
                    )}
                    {selectedCustomer.email && (
                      <p>Email: {selectedCustomer.email}</p>
                    )}
                    {selectedCustomer.address && (
                      <p>Address: {selectedCustomer.address}</p>
                    )}
                  </div>
                )}
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Products / Services
                  </label>
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase">Product</th>
                          <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase">Quantity</th>
                          <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase">Price</th>
                          <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase">Total</th>
                          <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {newInvoiceItems.map((item, index) => (
                          <tr key={index}>
                            <td className="px-4 py-2 align-top">
                              <div className="space-y-2">
                                <select
                                  value={item.itemId || ''}
                                  onChange={(e) => {
                                    const selectedId = e.target.value;
                                    const invItem = inventoryItems.find((it: any) => String(it.id) === selectedId);
                                    setNewInvoiceItems((prev) => {
                                      const next = [...prev];
                                      if (invItem) {
                                        const rawPrice =
                                          invItem.selling_price ??
                                          invItem.sale_price ??
                                          invItem.price ??
                                          invItem.cost_price ??
                                          0;
                                        const price = Number(rawPrice) || 0;
                                        const qty = next[index].quantity || 1;
                                        next[index] = {
                                          ...next[index],
                                          itemId: selectedId || undefined,
                                          description: invItem.name || '',
                                          price,
                                          total: qty * price,
                                        };
                                      } else {
                                        next[index] = {
                                          ...next[index],
                                          itemId: undefined,
                                        };
                                      }
                                      recalcNewInvoiceTotals(next);
                                      return next;
                                    });
                                  }}
                                  className="w-full p-2 border border-gray-300 rounded text-sm"
                                >
                                  <option value="">-- Select inventory item (optional) --</option>
                                  {inventoryItems.map((it: any) => (
                                    <option key={it.id} value={String(it.id)}>
                                      {it.name}

                                    </option>
                                  ))}
                                </select>
                                <input
                                  type="text"
                                  value={item.description}
                                  onChange={(e) => {
                                    const desc = e.target.value;
                                    setNewInvoiceItems((prev) => {
                                      const next = [...prev];
                                      next[index] = {
                                        ...next[index],
                                        description: desc,
                                        itemId: undefined,
                                      };
                                      next[index].total =
                                        (next[index].quantity || 0) * (next[index].price || 0);
                                      recalcNewInvoiceTotals(next);
                                      return next;
                                    });
                                  }}
                                  placeholder="Product or service description"
                                  className="w-full p-2 border border-gray-300 rounded text-sm"
                                />
                              </div>
                            </td>
                            <td className="px-4 py-2 align-top">
                              <input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={(e) => {
                                  const qty = Number(e.target.value) || 0;
                                  setNewInvoiceItems((prev) => {
                                    const next = [...prev];
                                    next[index] = {
                                      ...next[index],
                                      quantity: qty,
                                      total: qty * (next[index].price || 0),
                                    };
                                    recalcNewInvoiceTotals(next);
                                    return next;
                                  });
                                }}
                                className="w-full p-2 border border-gray-300 rounded text-sm"
                              />
                            </td>
                            <td className="px-4 py-2 align-top">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.price}
                                onChange={(e) => {
                                  const price = Number(e.target.value) || 0;
                                  setNewInvoiceItems((prev) => {
                                    const next = [...prev];
                                    next[index] = {
                                      ...next[index],
                                      price,
                                      total: price * (next[index].quantity || 0),
                                    };
                                    recalcNewInvoiceTotals(next);
                                    return next;
                                  });
                                }}
                                className="w-full p-2 border border-gray-300 rounded text-sm"
                              />
                            </td>
                            <td className="px-4 py-2 align-top">
                              <span className="font-medium">
                                RD$ {formatAmount(item.total)}
                              </span>
                            </td>
                            <td className="px-4 py-2 align-top">
                              <button
                                type="button"
                                onClick={() => {
                                  setNewInvoiceItems((prev) => {
                                    const next = prev.filter((_, i) => i !== index);
                                    if (next.length === 0) {
                                      next.push({
                                        itemId: undefined,
                                        description: '',
                                        quantity: 1,
                                        price: 0,
                                        total: 0,
                                      });
                                    }
                                    recalcNewInvoiceTotals(next);
                                    return next;
                                  });
                                }}
                                className="text-red-600 hover:text-red-800"
                              >
                                <i className="ri-delete-bin-line"></i>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-between items-center mt-3 text-sm">
                    <button
                      type="button"
                      onClick={() =>
                        setNewInvoiceItems((prev) => [
                          ...prev,
                          { itemId: undefined, description: '', quantity: 1, price: 0, total: 0 },
                        ])
                      }
                      className={primaryButtonClasses}
                      style={{ backgroundColor: theme.success }}
                    >
                      <i className="ri-add-line"></i>
                      <span>Add Product</span>
                    </button>
                    <div className="flex-1 bg-gray-50 p-4 rounded-lg">
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Subtotal:</span>
                          <span className="text-sm font-medium">
                            RD${' '}
                            {formatAmount(newInvoiceSubtotal)}

                          </span>
                        </div>
                        <div className="flex justify-between items-center space-x-2">
                          <span className="text-sm text-gray-600">Global discount:</span>
                          <div className="flex items-center space-x-2">
                            <select
                              value={newInvoiceDiscountType}
                              onChange={(e) => {
                                const t = e.target.value === 'fixed' ? 'fixed' : 'percentage';
                                setNewInvoiceDiscountType(t);
                                recalcNewInvoiceTotals(
                                  [...newInvoiceItems],
                                  t,
                                  newInvoiceDiscountPercent,
                                  newInvoiceNoTax,
                                );
                              }}
                              className="px-2 py-1 border border-gray-300 rounded text-sm"
                            >
                              <option value="percentage">% Percentage</option>
                              <option value="fixed">Amount</option>
                            </select>
                            <input
                              type="number"
                              min={0}
                              value={newInvoiceDiscountPercent}
                              onChange={(e) => {
                                const val = Number(e.target.value) || 0;
                                setNewInvoiceDiscountPercent(val);
                                recalcNewInvoiceTotals(
                                  [...newInvoiceItems],
                                  newInvoiceDiscountType,
                                  val,
                                  newInvoiceNoTax,
                                );
                              }}
                              className="w-24 px-2 py-1 border border-gray-300 rounded text-sm text-right"
                            />
                          </div>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">VAT ({currentItbisRate.toFixed(2)}%):</span>
                          <span className="text-sm font-medium">
                            RD${' '}
                            {formatAmount(newInvoiceTax)}

                          </span>
                        </div>
                        <div className="border-t border-gray-200 pt-2">
                          <div className="flex justify-between">
                            <span className="text-base font-semibold">Total:</span>
                            <span className="text-base font-semibold">
                              RD${' '}
                              {formatAmount(newInvoiceTotal)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description / Notes
                  </label>
                  <textarea
                    rows={3}
                    name="description"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="General description or invoice notes..."
                  />
                </div>
                
                <div className="flex space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowInvoiceModal(false)}
                    className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-100 transition-colors whitespace-nowrap"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className={`${primaryButtonClasses} flex-1 justify-center`}
                    style={{ backgroundColor: theme.primary }}
                  >
                    <span>Create Invoice</span>
                  </button>
                </div>
              </form>
            </div>

          </div>
        )}

        {/* Payment Modal */}
        {showPaymentModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-96">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Registrar Pago</h3>
                <button
                  onClick={() => {
                    setShowPaymentModal(false);
                    setSelectedInvoice(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line"></i>
                </button>
              </div>
              
              {selectedInvoice && (
                <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600">
                    Factura: <span className="font-medium">{selectedInvoice.invoiceNumber}</span>
                  </p>
                  <p className="text-sm text-gray-600">
                    Cliente: <span className="font-medium">{selectedInvoice.customerName}</span>
                  </p>
                  <p className="text-sm text-gray-600">
                    Deuda total del cliente:{' '}
                    <span className="font-semibold">
                      RD$
                      {formatAmount(getCustomerTotalBalance(selectedInvoice.customerId))}
                    </span>
                  </p>
                  <p className="text-lg font-semibold text-blue-600">
                    Saldo de esta factura:{' '}
                    RD$
                    {formatAmount(selectedInvoice.balance)}
                  </p>
                </div>
              )}
              
              <form onSubmit={handleSavePayment} className="space-y-4">
                {!selectedInvoice && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Factura
                    </label>
                    <select 
                      required
                      name="invoice_id"
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                    >
                      <option value="">Seleccionar factura</option>
                      {invoices.filter(inv => inv.balance > 0).map((invoice) => (
                        <option key={invoice.id} value={invoice.id}>
                          {invoice.invoiceNumber} - {invoice.customerName} (RD${formatAmount(invoice.balance)})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Monto a Pagar
                  </label>
                  <input
                    type="number" min="0"
                    step="0.01"
                    required
                    name="amount_to_pay"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Cuenta contable de efectivo / banco
                  </label>
                  <select
                    name="cash_account_id"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                    defaultValue=""
                  >
                    <option value="">Seleccionar cuenta (100101)</option>
                    {cashAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.code} - {acc.name}
                      </option>
                    ))}
                  </select>
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
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Referencia
                  </label>
                  <input
                    type="text"
                    name="reference"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Número de referencia"
                  />
                </div>
                
                <div className="flex space-x-3 mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setShowPaymentModal(false);
                      setSelectedInvoice(null);
                    }}
                    className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400 transition-colors whitespace-nowrap"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap"
                  >
                    Registrar Pago
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showReceiptPreviewModal && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
            onClick={handleCloseReceiptPreview}
          >
            <div
              className="bg-white rounded-lg p-6 w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4">
                <div className="min-w-0">
                  <h3 className="text-xl font-semibold text-gray-900 truncate">{receiptPreviewTitle}</h3>
                  {receiptPreviewFilename ? (
                    <p className="text-sm text-gray-500 truncate">{receiptPreviewFilename}</p>
                  ) : null}
                </div>
                <button
                  onClick={handleCloseReceiptPreview}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <i className="ri-close-line text-2xl"></i>
                </button>
              </div>

              <div className="flex-1 overflow-auto border border-gray-200 rounded-lg bg-white">
                {receiptPreviewUrl ? (
                  <iframe
                    ref={receiptPreviewIframeRef}
                    src={receiptPreviewUrl}
                    title={receiptPreviewTitle}
                    className="w-full h-[70vh]"
                  />
                ) : (
                  <div className="p-6 text-gray-600">No hay vista previa disponible.</div>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-4">
                {receiptPreviewUrl ? (
                  <button
                    onClick={handlePrintReceiptPreview}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
                  >
                    Imprimir
                  </button>
                ) : null}
                <button
                  onClick={handleCloseReceiptPreview}
                  className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Cerrar
                </button>
                <button
                  onClick={handleDownloadReceiptPreview}
                  disabled={!receiptPreviewBlob || !receiptPreviewFilename}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  Descargar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* View Invoice Modal */}
        {showViewInvoiceModal && selectedInvoice && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-bold text-white">Factura #{selectedInvoice.invoiceNumber}</h3>
                  <p className="text-blue-100 text-sm">Detalles de la factura</p>
                </div>
                <button
                  onClick={() => {
                    setShowViewInvoiceModal(false);
                    setSelectedInvoice(null);
                  }}
                  className="text-white hover:text-blue-200 transition-colors"
                >
                  <i className="ri-close-line text-2xl"></i>
                </button>
              </div>

              {/* Content */}
              <div className="p-6 space-y-6">
                {/* Status Badge */}
                <div className="flex justify-between items-center">
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor(selectedInvoice.status)}`}>
                    {getStatusName(selectedInvoice.status)}
                  </span>
                  {selectedInvoice.daysOverdue > 0 && (
                    <span className="text-red-600 text-sm font-medium">
                      <i className="ri-alarm-warning-line mr-1"></i>
                      {selectedInvoice.daysOverdue} días vencida
                    </span>
                  )}
                </div>

                {/* Customer & Invoice Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-gray-500 uppercase mb-3">
                      <i className="ri-user-line mr-2"></i>Cliente
                    </h4>
                    <p className="text-lg font-bold text-gray-900">{selectedInvoice.customerName}</p>
                    {(() => {
                      const customer = customers.find(c => c.id === selectedInvoice.customerId);
                      return customer ? (
                        <div className="mt-2 space-y-1 text-sm text-gray-600">
                          {customer.document && <p><i className="ri-id-card-line mr-2"></i>{customer.document}</p>}
                          {customer.phone && <p><i className="ri-phone-line mr-2"></i>{customer.phone}</p>}
                          {customer.email && <p><i className="ri-mail-line mr-2"></i>{customer.email}</p>}
                          {customer.address && <p><i className="ri-map-pin-line mr-2"></i>{customer.address}</p>}
                        </div>
                      ) : null;
                    })()}
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-gray-500 uppercase mb-3">
                      <i className="ri-calendar-line mr-2"></i>Información
                    </h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Fecha de emisión:</span>
                        <span className="font-medium text-gray-900">{formatDate(selectedInvoice.date)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Fecha de vencimiento:</span>
                        <span className="font-medium text-gray-900">{formatDate(selectedInvoice.dueDate)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Items Table */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-500 uppercase mb-3">
                    <i className="ri-list-check mr-2"></i>Productos/Servicios
                  </h4>
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold text-gray-600">Descripción</th>
                          <th className="px-4 py-3 text-right font-semibold text-gray-600">Cantidad</th>
                          <th className="px-4 py-3 text-right font-semibold text-gray-600">Precio</th>
                          <th className="px-4 py-3 text-right font-semibold text-gray-600">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {selectedInvoice.items.map((item, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-gray-900">{item.description}</td>
                            <td className="px-4 py-3 text-right text-gray-700">{item.quantity}</td>
                            <td className="px-4 py-3 text-right text-gray-700">RD$ {formatAmount(item.price)}</td>
                            <td className="px-4 py-3 text-right font-medium text-gray-900">RD$ {formatAmount(item.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Totals */}
                <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg p-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Subtotal:</span>
                      <span className="font-medium text-gray-900">RD$ {formatAmount(selectedInvoice.subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">ITBIS:</span>
                      <span className="font-medium text-gray-900">RD$ {formatAmount(selectedInvoice.tax)}</span>
                    </div>
                    <div className="border-t border-gray-300 my-2"></div>
                    <div className="flex justify-between text-lg">
                      <span className="font-semibold text-gray-700">Total:</span>
                      <span className="font-bold text-blue-600">RD$ {formatAmount(selectedInvoice.amount)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Pagado:</span>
                      <span className="font-medium text-green-600">RD$ {formatAmount(selectedInvoice.paidAmount)}</span>
                    </div>
                    <div className="flex justify-between text-lg">
                      <span className="font-semibold text-gray-700">Saldo pendiente:</span>
                      <span className={`font-bold ${selectedInvoice.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        RD$ {formatAmount(selectedInvoice.balance)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Movimientos Contables */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-500 uppercase mb-3">
                    <i className="ri-book-2-line mr-2"></i>Movimientos Contables
                  </h4>
                  {loadingMovements ? (
                    <div className="text-center py-6 text-gray-500">
                      <i className="ri-loader-4-line animate-spin text-2xl"></i>
                      <p className="mt-2">Cargando movimientos...</p>
                    </div>
                  ) : invoiceMovements.length === 0 ? (
                    <div className="bg-gray-50 rounded-lg p-4 text-center text-gray-500">
                      <i className="ri-file-list-3-line text-3xl mb-2"></i>
                      <p>No hay movimientos contables registrados para esta factura</p>
                    </div>
                  ) : (
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-indigo-50">
                          <tr>
                            <th className="px-4 py-3 text-left font-semibold text-indigo-700">Fecha</th>
                            <th className="px-4 py-3 text-left font-semibold text-indigo-700">No. Asiento</th>
                            <th className="px-4 py-3 text-left font-semibold text-indigo-700">Descripción</th>
                            <th className="px-4 py-3 text-right font-semibold text-indigo-700">Débito</th>
                            <th className="px-4 py-3 text-right font-semibold text-indigo-700">Crédito</th>
                            <th className="px-4 py-3 text-center font-semibold text-indigo-700">Acción</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {invoiceMovements.map((mov: any) => (
                            <tr key={mov.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-gray-900">{formatDate(mov.entry_date)}</td>
                              <td className="px-4 py-3 font-medium text-indigo-600">{mov.entry_number}</td>
                              <td className="px-4 py-3 text-gray-700 max-w-xs truncate" title={mov.description}>
                                {mov.description}
                              </td>
                              <td className="px-4 py-3 text-right font-medium text-gray-900">
                                RD$ {formatAmount(mov.total_debit || 0)}
                              </td>
                              <td className="px-4 py-3 text-right font-medium text-gray-900">
                                RD$ {formatAmount(mov.total_credit || 0)}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <button
                                  onClick={() => handleViewMovement(mov)}
                                  className="text-indigo-600 hover:text-indigo-900"
                                  title="Ver detalle del asiento"
                                >
                                  <i className="ri-eye-line text-lg"></i>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer Actions */}
              <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3 border-t border-gray-200">
                {selectedInvoice.status !== 'paid' && selectedInvoice.status !== 'cancelled' && selectedInvoice.balance > 0 && (
                  <button
                    onClick={() => {
                      setShowViewInvoiceModal(false);
                      handleRegisterPayment(selectedInvoice);
                    }}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                  >
                    <i className="ri-money-dollar-circle-line"></i>
                    Registrar Pago
                  </button>
                )}
                <button
                  onClick={() => handlePrintInvoice(selectedInvoice.id)}
                  className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
                >
                  <i className="ri-printer-line"></i>
                  Imprimir
                </button>
                <button
                  onClick={() => handleExportInvoiceExcel(selectedInvoice.id)}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                >
                  <i className="ri-file-excel-2-line"></i>
                  Excel
                </button>
                <button
                  onClick={() => {
                    setShowViewInvoiceModal(false);
                    setSelectedInvoice(null);
                  }}
                  className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Movement Detail Modal */}
        {showMovementModal && selectedMovement && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-6 py-4 flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-bold text-white">Asiento #{selectedMovement.entry_number}</h3>
                  <p className="text-indigo-100 text-sm">{selectedMovement.description}</p>
                </div>
                <button
                  onClick={() => {
                    setShowMovementModal(false);
                    setSelectedMovement(null);
                    setMovementLines([]);
                  }}
                  className="text-white hover:text-indigo-200 transition-colors"
                >
                  <i className="ri-close-line text-2xl"></i>
                </button>
              </div>

              {/* Content */}
              <div className="p-6 space-y-6">
                {/* Entry Info */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 uppercase">Fecha</p>
                    <p className="font-semibold text-gray-900">{formatDate(selectedMovement.entry_date)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 uppercase">Estado</p>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      selectedMovement.status === 'posted' ? 'bg-green-100 text-green-800' :
                      selectedMovement.status === 'draft' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {selectedMovement.status === 'posted' ? 'Contabilizado' : selectedMovement.status === 'draft' ? 'Borrador' : selectedMovement.status}
                    </span>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 uppercase">Total Débito</p>
                    <p className="font-semibold text-gray-900">RD$ {formatAmount(selectedMovement.total_debit || 0)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 uppercase">Total Crédito</p>
                    <p className="font-semibold text-gray-900">RD$ {formatAmount(selectedMovement.total_credit || 0)}</p>
                  </div>
                </div>

                {selectedMovement.reference && (
                  <div className="bg-blue-50 rounded-lg p-3">
                    <p className="text-xs text-blue-600 uppercase">Referencia</p>
                    <p className="font-medium text-blue-900">{selectedMovement.reference}</p>
                  </div>
                )}

                {/* Entry Lines */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-500 uppercase mb-3">
                    <i className="ri-list-check mr-2"></i>Líneas del Asiento
                  </h4>
                  {loadingMovementLines ? (
                    <div className="text-center py-8 text-gray-500">
                      <i className="ri-loader-4-line animate-spin text-2xl"></i>
                      <p className="mt-2">Cargando líneas...</p>
                    </div>
                  ) : movementLines.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No se encontraron líneas para este asiento</p>
                  ) : (
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="px-4 py-3 text-left font-semibold text-gray-600">Código</th>
                            <th className="px-4 py-3 text-left font-semibold text-gray-600">Cuenta</th>
                            <th className="px-4 py-3 text-left font-semibold text-gray-600">Descripción</th>
                            <th className="px-4 py-3 text-right font-semibold text-gray-600">Débito</th>
                            <th className="px-4 py-3 text-right font-semibold text-gray-600">Crédito</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {movementLines.map((line: any, idx: number) => (
                            <tr key={line.id || idx} className="hover:bg-gray-50">
                              <td className="px-4 py-3 font-mono text-indigo-600">
                                {(line.chart_accounts as any)?.code || '-'}
                              </td>
                              <td className="px-4 py-3 text-gray-900 font-medium">
                                {(line.chart_accounts as any)?.name || 'Cuenta no encontrada'}
                              </td>
                              <td className="px-4 py-3 text-gray-700">
                                {line.description || '-'}
                              </td>
                              <td className="px-4 py-3 text-right font-medium text-gray-900">
                                {Number(line.debit_amount || 0) > 0 ? `RD$ ${formatAmount(line.debit_amount)}` : '-'}
                              </td>
                              <td className="px-4 py-3 text-right font-medium text-gray-900">
                                {Number(line.credit_amount || 0) > 0 ? `RD$ ${formatAmount(line.credit_amount)}` : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-gray-50 font-semibold">
                          <tr>
                            <td colSpan={3} className="px-4 py-3 text-right text-gray-700">Totales:</td>
                            <td className="px-4 py-3 text-right text-green-700">
                              RD$ {formatAmount(movementLines.reduce((sum: number, l: any) => sum + Number(l.debit_amount || 0), 0))}
                            </td>
                            <td className="px-4 py-3 text-right text-green-700">
                              RD$ {formatAmount(movementLines.reduce((sum: number, l: any) => sum + Number(l.credit_amount || 0), 0))}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3 border-t border-gray-200">
                <button
                  onClick={() => {
                    setShowMovementModal(false);
                    setSelectedMovement(null);
                    setMovementLines([]);
                  }}
                  className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}