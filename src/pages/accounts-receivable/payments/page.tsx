import { useRef, useState, useEffect, type FormEvent } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { useAuth } from '../../../hooks/useAuth';
import { customerPaymentsService, invoicesService, bankAccountsService, customersService, receiptsService, receiptApplicationsService, settingsService } from '../../../services/database';
import ExcelJS from 'exceljs';
import { formatAmount, formatMoney } from '../../../utils/numberFormat';
import { addPdfBrandedHeader, getPdfTableStyles } from '../../../utils/exportImportUtils';
import { formatDate } from '../../../utils/dateFormat';

interface Payment {
  id: string;
  customerId: string;
  customerName: string;
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  paymentMethod: 'cash' | 'check' | 'transfer' | 'card';
  date: string;
  reference: string;
  itbisWithheld: number;
  isrWithheld: number;
}

interface InvoiceOption {
  id: string;
  invoiceNumber: string;
  customerName: string;
  balance: number;
  customerId: string;
  totalAmount: number;
  paidAmount: number;
  taxAmount?: number;
  status?: string;
}

interface BankAccountOption {
  id: string;
  name: string;
  accountNumber?: string | null;
  isActive?: boolean;
  chartAccountId?: string | null;
}

export default function PaymentsPage() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [methodFilter, setMethodFilter] = useState('all');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showPaymentDetailModal, setShowPaymentDetailModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [companyRnc, setCompanyRnc] = useState('');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoices, setInvoices] = useState<InvoiceOption[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccountOption[]>([]);
  const [customerArAccounts, setCustomerArAccounts] = useState<Record<string, string>>({});
  const [customerDocuments, setCustomerDocuments] = useState<Record<string, string>>({});
  const [accounts, setAccounts] = useState<any[]>([]);
  const [showDocumentPreviewModal, setShowDocumentPreviewModal] = useState(false);
  const [documentPreviewType, setDocumentPreviewType] = useState<'pdf' | 'table' | 'html'>('pdf');
  const [documentPreviewTitle, setDocumentPreviewTitle] = useState('');
  const [documentPreviewFilename, setDocumentPreviewFilename] = useState('');
  const [documentPreviewUrl, setDocumentPreviewUrl] = useState('');
  const [documentPreviewBlob, setDocumentPreviewBlob] = useState<Blob | null>(null);
  const [documentPreviewHeaders, setDocumentPreviewHeaders] = useState<string[]>([]);
  const [documentPreviewRows, setDocumentPreviewRows] = useState<Array<Array<string | number>>>([]);
  const [documentPreviewSummary, setDocumentPreviewSummary] = useState<Array<{ label: string; value: string }>>([]);
  const documentPreviewIframeRef = useRef<HTMLIFrameElement | null>(null);

  const [paymentInvoiceId, setPaymentInvoiceId] = useState<string>('');
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentItbisWithheld, setPaymentItbisWithheld] = useState<number>(0);
  const [paymentIsrWithheld, setPaymentIsrWithheld] = useState<number>(0);
  const [invoiceHasServiceLines, setInvoiceHasServiceLines] = useState<Record<string, boolean>>({});
  const [isrServiceRatePct] = useState<number>(0);
  const [customers, setCustomers] = useState<Array<{ id: string; name: string }>>([]);
  const [paymentCustomerId, setPaymentCustomerId] = useState<string>('');

  const receivableAccounts = accounts.filter((acc) => {
    if (!acc.allowPosting) return false;
    if (acc.type !== 'asset') return false;
    const name = String(acc.name || '').toLowerCase();
    return name.includes('cuentas por cobrar');
  });

  const getPaymentMethodName = (method: string) => {
    switch (method) {
      case 'cash': return 'Cash';
      case 'check': return 'Check';
      case 'transfer': return 'Transfer';
      case 'card': return 'Card';
      default: return method;
    }
  };

  const getPaymentMethodColor = (method: string) => {
    switch (method) {
      case 'cash': return 'bg-[#e3edd3] text-[#2f3e1e]';
      case 'check': return 'bg-[#f3ecda] text-[#6b5c3b]';
      case 'transfer': return 'bg-[#e0f0e8] text-[#2f3e1e]';
      case 'card': return 'bg-[#f6d6ce] text-[#7a2e1b]';
      default: return 'bg-[#ede7d7] text-[#4c5535]';
    }
  };

  const formatLocalDate = (dateStr: string) => formatDate(dateStr);

  useEffect(() => {
    const loadData = async () => {
      if (!user?.id) return;
      try {
        const [paymentsData, invoicesData, bankAccountsData, customersData] = await Promise.all([
          customerPaymentsService.getAll(user.id),
          invoicesService.getAll(user.id),
          bankAccountsService.getAll(user.id),
          customersService.getAll(user.id),
        ]);

        const mappedPayments: Payment[] = (paymentsData || []).map((p: any) => ({
          id: p.id,
          customerId: p.customer_id,
          customerName: p.customers?.name || '',
          invoiceId: p.invoice_id,
          invoiceNumber: p.invoices?.invoice_number || '',
          amount: Number(p.amount) || 0,
          paymentMethod: p.payment_method,
          date: p.payment_date,
          reference: p.reference || '',
          itbisWithheld: Number(p.itbis_withheld) || 0,
          isrWithheld: Number(p.isr_withheld) || 0,
        }));
        setPayments(mappedPayments);

        const mappedInvoices: InvoiceOption[] = (invoicesData || [])
          .filter((inv: any) => inv.status !== 'Cancelada')
          .map((inv: any) => {
            const total = Number(inv.total_amount) || 0;
            const paid = Number(inv.paid_amount) || 0;
            const taxAmount = Number(inv.tax_amount) || 0;
            return {
              id: inv.id,
              invoiceNumber: inv.invoice_number,
              customerName: inv.customers?.name || '',
              customerId: inv.customer_id,
              balance: Math.max(total - paid, 0),
              totalAmount: total,
              paidAmount: paid,
              taxAmount,
              status: inv.status,
            };
          });
        setInvoices(mappedInvoices);

        const mappedBankAccounts: BankAccountOption[] = (bankAccountsData || [])
          .map((b: any) => {
            const id = String(b.id);
            const name = String(b.bank_name || b.name || b.account_name || '').trim();
            const accountNumber = b.account_number ? String(b.account_number) : null;
            const fallback = accountNumber
              ? `Cuenta (${accountNumber})`
              : `Cuenta ${id.slice(0, 8)}`;

            return {
              id,
              name: name || fallback,
              accountNumber,
              isActive: b.is_active !== false,
              chartAccountId: b.chart_account_id ? String(b.chart_account_id) : null,
            };
          })
          .filter((b: BankAccountOption) => b.isActive !== false)
          .sort((a: BankAccountOption, c: BankAccountOption) => String(a.name || '').localeCompare(String(c.name || '')));
        setBankAccounts(mappedBankAccounts);

        const mappedCustomerArAccounts = (customersData || []).reduce((acc: Record<string, string>, c: any) => {
          const id = String(c.id);
          const ar = c.ar_account_id || c.arAccountId || c.ar_accountId;
          if (ar) {
            acc[id] = String(ar);
          }
          return acc;
        }, {} as Record<string, string>);
        setCustomerArAccounts(mappedCustomerArAccounts);

        // Mapear lista de clientes para el dropdown
        const mappedCustomers = (customersData || [])
          .map((c: any) => ({
            id: String(c.id),
            name: String(c.name || '').trim(),
          }))
          .filter((c: { id: string; name: string }) => c.name !== '')
          .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));
        setCustomers(mappedCustomers);

        const mappedCustomerDocuments = (customersData || []).reduce((acc: Record<string, string>, c: any) => {
          const id = String(c.id);
          const doc = c.document || c.rnc || c.tax_id || c.ruc || '';
          if (doc) {
            acc[id] = String(doc);
          }
          return acc;
        }, {} as Record<string, string>);
        setCustomerDocuments(mappedCustomerDocuments);

        setAccounts([]);
      } catch (error) {
        console.error('Error cargando datos de pagos recibidos:', error);
      }
    };

    void loadData();
  }, [user?.id]);

  useEffect(() => {
    const loadCompany = async () => {
      try {
        const info = await settingsService.getCompanyInfo();
        if (info && (info as any)) {
          const name = (info as any).name || (info as any).company_name;
          const rnc = (info as any).rnc || (info as any).tax_id || (info as any).ruc;
          if (name) setCompanyName(String(name));
          if (rnc) setCompanyRnc(String(rnc));
        }
      } catch (error) {
        console.error('Error cargando información de la empresa (Pagos Recibidos):', error);
      }
    };

    void loadCompany();
  }, [user?.id]);

  useEffect(() => {
    return () => {
      if (documentPreviewUrl) {
        URL.revokeObjectURL(documentPreviewUrl);
      }
    };
  }, [documentPreviewUrl]);

  const handleCloseDocumentPreview = () => {
    setShowDocumentPreviewModal(false);
    setDocumentPreviewType('pdf');
    setDocumentPreviewTitle('');
    setDocumentPreviewFilename('');
    setDocumentPreviewUrl('');
    setDocumentPreviewBlob(null);
    setDocumentPreviewHeaders([]);
    setDocumentPreviewRows([]);
    setDocumentPreviewSummary([]);
  };

  const handleDownloadDocumentPreview = () => {
    if (!documentPreviewBlob || !documentPreviewFilename) return;
    const url = URL.createObjectURL(documentPreviewBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = documentPreviewFilename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const handlePrintDocumentPreview = () => {
    const iframe = documentPreviewIframeRef.current;
    const win = iframe?.contentWindow;
    if (!win) return;
    win.focus();
    win.print();
  };

  const openPdfPreview = (doc: jsPDF, title: string, filename: string) => {
    const blob = doc.output('blob') as Blob;
    const url = URL.createObjectURL(blob);
    setDocumentPreviewType('pdf');
    setDocumentPreviewTitle(title);
    setDocumentPreviewFilename(filename);
    setDocumentPreviewBlob(blob);
    setDocumentPreviewUrl(url);
    setDocumentPreviewHeaders([]);
    setDocumentPreviewRows([]);
    setDocumentPreviewSummary([]);
    setShowDocumentPreviewModal(true);
  };

  const openHtmlPreview = (html: string, title: string, filename: string) => {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    setDocumentPreviewType('html');
    setDocumentPreviewTitle(title);
    setDocumentPreviewFilename(filename);
    setDocumentPreviewBlob(blob);
    setDocumentPreviewUrl(url);
    setDocumentPreviewHeaders([]);
    setDocumentPreviewRows([]);
    setDocumentPreviewSummary([]);
    setShowDocumentPreviewModal(true);
  };

  const openTablePreview = (payload: {
    title: string;
    filename: string;
    blob: Blob;
    headers: string[];
    rows: Array<Array<string | number>>;
    summary?: Array<{ label: string; value: string }>;
  }) => {
    setDocumentPreviewType('table');
    setDocumentPreviewTitle(payload.title);
    setDocumentPreviewFilename(payload.filename);
    setDocumentPreviewBlob(payload.blob);
    setDocumentPreviewUrl('');
    setDocumentPreviewHeaders(payload.headers);
    setDocumentPreviewRows(payload.rows);
    setDocumentPreviewSummary(payload.summary || []);
    setShowDocumentPreviewModal(true);
  };

  const filteredPayments = payments.filter(payment => {
    const matchesSearch = payment.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         payment.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         payment.reference.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesMethod = methodFilter === 'all' || payment.paymentMethod === methodFilter;
    return matchesSearch && matchesMethod;
  });

  const exportToPDF = async () => {
    const doc = new jsPDF();
    const pdfStyles = getPdfTableStyles();

    // Add branded header with logo
    const startY = await addPdfBrandedHeader(doc, 'Received Payments Report');

    const totalPayments = filteredPayments.reduce((sum, p) => sum + p.amount, 0);
    const paymentsByMethod = filteredPayments.reduce((acc, payment) => {
      acc[payment.paymentMethod] = (acc[payment.paymentMethod] || 0) + payment.amount;
      return acc;
    }, {} as Record<string, number>);

    doc.setFontSize(12);
    doc.setTextColor(51, 51, 51);
    doc.text('Payment Summary', 20, startY);

    const summaryData = [
      ['Metric', 'Amount'],
      ['Total Received', formatMoney(totalPayments)],
      ['Payments Count', filteredPayments.length.toString()],
      ['Cash', formatMoney(paymentsByMethod.cash || 0)],
      ['Transfers', formatMoney(paymentsByMethod.transfer || 0)],
      ['Checks', formatMoney(paymentsByMethod.check || 0)],
      ['Cards', formatMoney(paymentsByMethod.card || 0)]
    ];

    (doc as any).autoTable({
      startY: startY + 5,
      head: [summaryData[0]],
      body: summaryData.slice(1),
      theme: 'grid',
      ...pdfStyles
    });

    doc.setFontSize(14);
    doc.text('Payment Detail', 20, (doc as any).lastAutoTable.finalY + 20);

    const paymentData = filteredPayments.map(payment => [
      formatDate(payment.date),
      payment.customerName,
      payment.invoiceNumber,
      formatMoney(payment.amount),
      getPaymentMethodName(payment.paymentMethod),
      payment.reference,
      formatMoney(payment.itbisWithheld),
      formatMoney(payment.isrWithheld)
    ]);

    (doc as any).autoTable({
      startY: (doc as any).lastAutoTable.finalY + 30,
      head: [['Date', 'Customer', 'Invoice', 'Amount', 'Method', 'Reference', 'VAT Withheld', 'ISR Withheld']],
      body: paymentData,
      theme: 'striped',
      headStyles: { fillColor: [16, 185, 129] },
      styles: { fontSize: 9 }
    });

    const filename = `received-payments-${new Date().toISOString().split('T')[0]}.pdf`;
    openPdfPreview(doc, 'Received Payments Report', filename);
  };

  const exportToExcel = async () => {
    const rows = filteredPayments.map((payment) => ({
      date: formatDate(payment.date),
      customer: payment.customerName,
      invoice: payment.invoiceNumber,
      amount: payment.amount,
      method: getPaymentMethodName(payment.paymentMethod),
      reference: payment.reference,
      itbisWithheld: payment.itbisWithheld,
      isrWithheld: payment.isrWithheld,
    }));

    if (!rows.length) {
      alert('There are no payments to export with the current filters.');
      return;
    }

    const todayIso = new Date().toISOString().split('T')[0];
    const todayLocal = formatDate(new Date());

    const headers = [
      { key: 'date', title: 'Fecha' },
      { key: 'customer', title: 'Cliente' },
      { key: 'invoice', title: 'Factura' },
      { key: 'amount', title: 'Monto' },
      { key: 'method', title: 'Método' },
      { key: 'reference', title: 'Referencia' },
      { key: 'itbisWithheld', title: 'ITBIS Retenido' },
      { key: 'isrWithheld', title: 'ISR Retenido' },
    ];

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Payments', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = [
      { key: 'date', header: 'Date', width: 14 },
      { key: 'customer', header: 'Customer', width: 28 },
      { key: 'invoice', header: 'Invoice', width: 24 },
      { key: 'amount', header: 'Amount', width: 16 },
      { key: 'method', header: 'Method', width: 18 },
      { key: 'reference', header: 'Reference', width: 24 },
      { key: 'itbisWithheld', header: 'VAT Withheld', width: 16 },
      { key: 'isrWithheld', header: 'ISR Withheld', width: 16 },
    ];

    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF008000' } };
    });

    rows.forEach((r) => {
      ws.addRow(r);
    });

    const amountCol = ws.getColumn('amount');
    amountCol.numFmt = '#,##0.00';

    const itbisCol = ws.getColumn('itbisWithheld');
    itbisCol.numFmt = '#,##0.00';

    const isrCol = ws.getColumn('isrWithheld');
    isrCol.numFmt = '#,##0.00';

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const totalPayments = filteredPayments.reduce((sum, p) => sum + p.amount, 0);
    const paymentsByMethod = filteredPayments.reduce((acc, payment) => {
      acc[payment.paymentMethod] = (acc[payment.paymentMethod] || 0) + payment.amount;
      return acc;
    }, {} as Record<string, number>);

    openTablePreview({
      title: `Pagos Recibidos - ${todayLocal}`,
      filename: `pagos-recibidos-${todayIso}.xlsx`,
      blob,
      headers: headers.map(h => h.title),
      rows: rows.map(r => [r.date, r.customer, r.invoice, formatMoney(r.amount), r.method, r.reference, formatMoney(r.itbisWithheld), formatMoney(r.isrWithheld)]),
      summary: [
        { label: 'Empresa', value: companyName },
        { label: 'Total Recibido', value: formatMoney(totalPayments) },
        { label: 'Número de Pagos', value: filteredPayments.length.toString() },
        { label: 'Efectivo', value: formatMoney(paymentsByMethod.cash || 0) },
        { label: 'Transferencias', value: formatMoney(paymentsByMethod.transfer || 0) },
        { label: 'Cheques', value: formatMoney(paymentsByMethod.check || 0) },
        { label: 'Tarjetas', value: formatMoney(paymentsByMethod.card || 0) },
      ],
    });
  };

  const handleNewPayment = () => {
    setPaymentInvoiceId('');
    setPaymentAmount(0);
    setPaymentItbisWithheld(0);
    setPaymentIsrWithheld(0);
    setShowPaymentModal(true);
  };

  const resolveInvoiceForPayment = () => {
    const invoice = invoices.find((inv) => inv.id === paymentInvoiceId);
    return invoice || null;
  };

  const isFiscalInvoiceNumber = (invoiceNumber: string) => {
    const no = String(invoiceNumber || '');
    return no !== '' && !no.toUpperCase().startsWith('FAC-');
  };

  const recomputeWithheldDefaults = (nextInvoiceId?: string, nextAmount?: number) => {
    const invoiceId = typeof nextInvoiceId === 'string' ? nextInvoiceId : paymentInvoiceId;
    const amount = typeof nextAmount === 'number' ? nextAmount : paymentAmount;
    const invoice = invoices.find((inv) => inv.id === invoiceId);
    if (!invoice) {
      setPaymentItbisWithheld(0);
      setPaymentIsrWithheld(0);
      return;
    }
    const invoiceNumber = String(invoice.invoiceNumber || '');
    if (!isFiscalInvoiceNumber(invoiceNumber)) {
      setPaymentItbisWithheld(0);
      setPaymentIsrWithheld(0);
      return;
    }
    const effectivePayment = Math.min(Number(amount || 0), Number(invoice.balance || 0));
    const total = Number(invoice.totalAmount || 0);
    const ratio = total > 0 ? Math.max(0, Math.min(1, effectivePayment / total)) : 0;
    const itbis = Number((invoice as any).taxAmount || 0);
    const suggestedItbisWithheld = Math.round(itbis * ratio * 100) / 100;
    setPaymentItbisWithheld(suggestedItbisWithheld);
    setPaymentIsrWithheld(0);
  };

  const handleSavePayment = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!user?.id) {
      alert('Debes iniciar sesión para registrar pagos');
      return;
    }

    const formData = new FormData(e.currentTarget);

    const invoiceId = String(formData.get('invoiceId') || '');
    const bankAccountId = String(formData.get('bankAccountId') || '');
    const arAccountIdOverride = String(formData.get('arAccountId') || '');
    const amountToPay = Number(formData.get('amount') || 0);
    const paymentMethod = String(formData.get('paymentMethod') || 'cash');
    const reference = String(formData.get('reference') || '').trim();
    const itbisWithheld = Number(formData.get('itbisWithheld') || 0) || 0;
    const isrWithheld = Number(formData.get('isrWithheld') || 0) || 0;

    if (!invoiceId) {
      alert('Debes seleccionar una factura');
      return;
    }

    if (!amountToPay || amountToPay <= 0) {
      alert('El monto a pagar debe ser mayor que 0');
      return;
    }

    const invoice = invoices.find((inv) => inv.id === invoiceId);
    if (!invoice) {
      alert('La factura seleccionada no es válida');
      return;
    }

    const invoiceNo = String(invoice.invoiceNumber || '');
    const isFiscal = isFiscalInvoiceNumber(invoiceNo);
    if (!isFiscal && (itbisWithheld > 0 || isrWithheld > 0)) {
      alert('No se puede registrar retención en una factura sin NCF (FAC-*)');
      return;
    }

    const effectivePayment = Math.min(amountToPay, invoice.balance);
    const change = amountToPay - effectivePayment;

    const paymentDate = new Date().toISOString().slice(0, 10);
    const newPaidAmount = (Number(invoice.paidAmount) || 0) + effectivePayment;
    const newBalance = (Number(invoice.totalAmount) || 0) - newPaidAmount;
    const newStatus = newBalance > 0 ? 'partial' : 'paid';

    try {
      const paymentPayload: any = {
        customer_id: invoice.customerId,
        invoice_id: invoiceId,
        bank_account_id: bankAccountId ? bankAccountId : null,
        amount: effectivePayment,
        payment_method: paymentMethod,
        payment_date: paymentDate,
        reference: reference || null,
        itbis_withheld: isFiscal ? itbisWithheld : 0,
        isr_withheld: isFiscal ? isrWithheld : 0,
      };

      const createdPayment = await customerPaymentsService.create(user.id, paymentPayload);

      await invoicesService.updatePayment(invoiceId, newPaidAmount, newStatus);

      try {
        const [paymentsData, invoicesData] = await Promise.all([
          customerPaymentsService.getAll(user.id),
          invoicesService.getAll(user.id),
        ]);

        const mappedPayments: Payment[] = (paymentsData || []).map((p: any) => ({
          id: p.id,
          customerId: p.customer_id,
          customerName: p.customers?.name || '',
          invoiceId: p.invoice_id,
          invoiceNumber: p.invoices?.invoice_number || '',
          amount: Number(p.amount) || 0,
          paymentMethod: p.payment_method,
          date: p.payment_date,
          reference: p.reference || '',
          itbisWithheld: Number(p.itbis_withheld) || 0,
          isrWithheld: Number(p.isr_withheld) || 0,
        }));
        setPayments(mappedPayments);

        const mappedInvoices: InvoiceOption[] = (invoicesData || [])
          .filter((inv: any) => inv.status !== 'Cancelada')
          .map((inv: any) => {
            const total = Number(inv.total_amount) || 0;
            const paid = Number(inv.paid_amount) || 0;
            const taxAmount = Number(inv.tax_amount) || 0;
            return {
              id: inv.id,
              invoiceNumber: inv.invoice_number,
              customerName: inv.customers?.name || '',
              customerId: inv.customer_id,
              balance: Math.max(total - paid, 0),
              totalAmount: total,
              paidAmount: paid,
              taxAmount,
              status: inv.status,
            };
          });
        setInvoices(mappedInvoices);
      } catch (refreshError) {
        console.error('Error recargando pagos/facturas luego del registro:', refreshError);
      }

      try {
        const receiptNumber = `RC-${Date.now()}`;
        const receiptPayload = {
          customer_id: invoice.customerId,
          receipt_number: receiptNumber,
          receipt_date: paymentDate,
          amount: effectivePayment,
          payment_method: paymentMethod,
          reference: reference || null,
          concept: `Pago factura ${invoice.invoiceNumber}`,
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
        const receiptDate = (createdReceipt as any)?.receipt_date || paymentDate;

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
        } catch (err) {
          console.error('Error obteniendo información de la empresa para impresión de recibo:', err);
        }

        const amountText = formatAmount(effectivePayment);

        const customerRnc = customerDocuments[String(invoice.customerId)] || '';

        const receiptHtml = `
          <html>
            <head>
              <meta charset="utf-8" />
              <meta name="viewport" content="width=device-width, initial-scale=1" />
              <title>Recibo ${receiptNo}</title>
              <style>
                :root {
                  --bg: #f3f4f6;
                  --card: #ffffff;
                  --text: #111827;
                  --muted: #6b7280;
                  --border: #e5e7eb;
                  --primary: #2563eb;
                  --primary-dark: #1d4ed8;
                  --success: #16a34a;
                }
                * { box-sizing: border-box; }
                body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, "Noto Sans", "Apple Color Emoji", "Segoe UI Emoji"; background: var(--bg); color: var(--text); }
                .page { padding: 24px; }
                .card { max-width: 860px; margin: 0 auto; background: var(--card); border: 1px solid var(--border); border-radius: 14px; overflow: hidden; box-shadow: 0 10px 22px rgba(0,0,0,.08); }
                .header { padding: 20px 22px; border-bottom: 1px solid var(--border); display: flex; gap: 16px; align-items: flex-start; justify-content: space-between; }
                .brand h1 { margin: 0; font-size: 18px; font-weight: 800; letter-spacing: .2px; }
                .brand p { margin: 4px 0 0; font-size: 12px; color: var(--muted); }
                .title { text-align: right; }
                .title h2 { margin: 0; font-size: 16px; font-weight: 800; color: var(--primary); }
                .title p { margin: 4px 0 0; font-size: 12px; color: var(--muted); }
                .content { padding: 18px 22px 22px; }
                .grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
                @media (min-width: 720px) { .grid { grid-template-columns: 1fr 1fr; } }
                .field { border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; background: #fafafa; }
                .label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .08em; }
                .value { margin-top: 6px; font-size: 14px; font-weight: 700; color: var(--text); word-break: break-word; }
                .amount { margin-top: 14px; padding: 14px; border-radius: 12px; border: 1px solid rgba(22,163,74,.25); background: rgba(22,163,74,.08); display: flex; align-items: center; justify-content: space-between; gap: 12px; }
                .amount .label { color: rgba(22,163,74,.9); }
                .amount .value { font-size: 18px; }
                .actions { margin-top: 16px; display: flex; justify-content: flex-end; gap: 10px; }
                .btn { appearance: none; border: 0; border-radius: 10px; padding: 10px 14px; font-weight: 700; font-size: 13px; cursor: pointer; }
                .btn-primary { background: var(--primary); color: #fff; }
                .btn-primary:hover { background: var(--primary-dark); }
                .btn-outline { background: #fff; color: var(--text); border: 1px solid var(--border); }
                .btn-outline:hover { background: #f9fafb; }
                .footer { padding: 14px 22px; border-top: 1px solid var(--border); font-size: 12px; color: var(--muted); }
                @media print {
                  body { background: #fff; }
                  .page { padding: 0; }
                  .card { box-shadow: none; border: 0; border-radius: 0; }
                  .actions { display: none !important; }
                }
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
                      <h2>Recibo de Cobro #${receiptNo}</h2>
                      <p>Fecha: ${formatDate(receiptDate)}</p>
                    </div>
                  </div>

                  <div class="content">
                    <div class="grid">
                      <div class="field">
                        <div class="label">Cliente</div>
                        <div class="value">${invoice.customerName}</div>
                      </div>
                      ${customerRnc ? `
                        <div class="field">
                          <div class="label">RNC del cliente</div>
                          <div class="value">${customerRnc}</div>
                        </div>
                      ` : ''}
                      <div class="field">
                        <div class="label">Factura aplicada</div>
                        <div class="value">${invoice.invoiceNumber}</div>
                      </div>
                      ${receiptPayload.concept ? `
                        <div class="field" style="grid-column: 1 / -1;">
                          <div class="label">Concepto</div>
                          <div class="value">${receiptPayload.concept}</div>
                        </div>
                      ` : ''}
                      <div class="field">
                        <div class="label">Método de pago</div>
                        <div class="value">${getPaymentMethodName(paymentMethod)}</div>
                      </div>
                      ${reference ? `
                        <div class="field">
                          <div class="label">Referencia</div>
                          <div class="value">${reference}</div>
                        </div>
                      ` : ''}
                    </div>

                    <div class="amount">
                      <div>
                        <div class="label">Monto recibido</div>
                        <div class="value"> ${amountText}</div>
                      </div>
                      <div style="color: rgba(22,163,74,.9); font-weight: 800;">Cobro</div>
                    </div>

                    <div class="actions">
                      <button class="btn btn-outline" onclick="window.close && window.close()" type="button">Cerrar</button>
                      <button class="btn btn-primary" onclick="window.print()" type="button">Imprimir</button>
                    </div>
                  </div>

                  <div class="footer">
                    Este documento fue generado automáticamente por el sistema.
                  </div>
                </div>
              </div>
            </body>
          </html>
        `;

        openHtmlPreview(receiptHtml, `Recibo de Cobro #${receiptNo}`, `recibo-${receiptNo}.html`);
      } catch (receiptError) {
        console.error('Error generando recibo de cobro automático:', receiptError);
        alert('Pago registrado, pero ocurrió un error al generar el recibo de cobro.');
      }

      if (change > 0) {
        alert(
          `Pago registrado correctamente. Devuelta: ${formatMoney(change)}`,
        );
      } else {
        alert('Pago registrado exitosamente');
      }

      setShowPaymentModal(false);
    } catch (error: any) {
      console.error('[Payments] Error al registrar pago', error);
      alert(`Error al registrar el pago: ${error?.message || 'revisa la consola para más detalles'}`);
    }
  };

  const handleViewPayment = (paymentId: string) => {
    const payment = payments.find((pay) => pay.id === paymentId);
    if (!payment) return;
    setSelectedPayment(payment);
    setShowPaymentDetailModal(true);
  };

  const handleClosePaymentDetail = () => {
    setShowPaymentDetailModal(false);
    setSelectedPayment(null);
  };

  return (
    <DashboardLayout>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #payment-detail-print, #payment-detail-print * { visibility: visible !important; }
          #payment-detail-print { position: fixed !important; left: 0 !important; top: 0 !important; width: 100% !important; }
          .no-print { display: none !important; }
        }
      `}</style>
      <div className="p-6 bg-gradient-to-br from-[#f6f1e3] to-[#ebe5d5] min-h-screen space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#1e2814] drop-shadow-sm">Received Payments</h1>
            <p className="text-sm text-[#4c5535]">Track customer collections, filters, and exports from a single console.</p>
          </div>
          <button 
            onClick={handleNewPayment}
            className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-gradient-to-br from-[#008000] to-[#006600] text-white shadow-[0_4px_15px_rgb(0,128,0,0.3)] hover:from-[#006600] hover:to-[#005500] hover:shadow-[0_6px_20px_rgb(0,128,0,0.4)] hover:-translate-y-0.5 transition-all duration-300 whitespace-nowrap font-semibold"
          >
            <i className="ri-money-dollar-circle-line mr-2"></i>
            Record Payment
          </button>
        </div>

        {/* Filters and Export */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <i className="ri-search-line text-gray-400"></i>
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full pl-10 pr-3 py-3 border border-[#d6cfbf] rounded-lg bg-white focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e] text-sm text-gray-800 placeholder:text-gray-500"
                placeholder="Search by customer, invoice, or reference..."
              />
            </div>
          </div>

          <div className="w-full md:w-48">
            <select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              className="w-full p-3 border border-[#d6cfbf] rounded-lg focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e] pr-8 bg-white text-gray-800"
            >
              <option value="all">All methods</option>
              <option value="cash">Cash</option>
              <option value="check">Check</option>
              <option value="transfer">Transfer</option>
              <option value="card">Card</option>
            </select>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={exportToPDF}
              className="px-4 py-2 rounded-lg border border-[#d6cfbf] bg-[#f7f0df] text-[#2f3e1e] hover:bg-[#ede3cb] transition-colors whitespace-nowrap"
            >
              <i className="ri-file-pdf-line mr-2"></i>PDF
            </button>
            <button
              onClick={exportToExcel}
              className="px-4 py-2 rounded-lg bg-[#3f5d2a] text-white hover:bg-[#2d451f] transition-colors whitespace-nowrap shadow-sm"
            >
              <i className="ri-file-excel-line mr-2"></i>Excel
            </button>
          </div>
        </div>

        {/* Payments Table */}
        <div className="bg-gradient-to-br from-white to-[#faf9f5] rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-[#e8e0d0]">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gradient-to-r from-[#f8f6f0] to-[#f0ece0]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Invoice
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Method
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Reference
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                    VAT withheld
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                    ISR withheld
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredPayments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatLocalDate(payment.date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {payment.customerName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {payment.invoiceNumber}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {formatMoney(payment.amount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPaymentMethodColor(payment.paymentMethod)}`}>
                        {getPaymentMethodName(payment.paymentMethod)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {payment.reference}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatMoney(payment.itbisWithheld)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatMoney(payment.isrWithheld)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button 
                          onClick={() => handleViewPayment(payment.id)}
                          className="text-[#2f3e1e] hover:text-[#1b250f]"
                          title="View details"
                        >
                          <i className="ri-eye-line"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {showPaymentDetailModal && selectedPayment && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
            onClick={handleClosePaymentDetail}
          >
            <div
              id="payment-detail-print"
              className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-gray-200 flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Payment Details</h3>
                  <p className="text-sm text-gray-500">
                    {companyName}{companyRnc ? ` • Tax ID: ${companyRnc}` : ''}
                  </p>
                </div>
                <button
                  onClick={handleClosePaymentDetail}
                  className="no-print text-gray-400 hover:text-gray-600"
                  aria-label="Cerrar"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>

              <div className="p-6 space-y-6">
                <div className="bg-gradient-to-r from-[#f0f7e6] to-[#e4efcf] border border-[#d3e0b2] rounded-lg p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">Amount received</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {formatMoney(selectedPayment.amount)}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getPaymentMethodColor(
                        selectedPayment.paymentMethod,
                      )}`}
                    >
                      {getPaymentMethodName(selectedPayment.paymentMethod)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-lg border border-gray-200 p-4">
                    <p className="text-xs text-gray-500">Customer</p>
                    <p className="text-sm font-semibold text-gray-900">{selectedPayment.customerName}</p>
                  </div>

                  <div className="rounded-lg border border-gray-200 p-4">
                    <p className="text-xs text-gray-500">Invoice</p>
                    <p className="text-sm font-semibold text-gray-900">{selectedPayment.invoiceNumber}</p>
                  </div>

                  <div className="rounded-lg border border-gray-200 p-4">
                    <p className="text-xs text-gray-500">Date</p>
                    <p className="text-sm font-semibold text-gray-900">{formatLocalDate(selectedPayment.date)}</p>
                  </div>

                  <div className="rounded-lg border border-gray-200 p-4">
                    <p className="text-xs text-gray-500">Reference</p>
                    <p className="text-sm font-semibold text-gray-900 break-words">
                      {selectedPayment.reference || '—'}
                    </p>
                  </div>

                  <div className="rounded-lg border border-gray-200 p-4">
                    <p className="text-xs text-gray-500">VAT withheld</p>
                    <p className="text-sm font-semibold text-gray-900">{formatMoney(selectedPayment.itbisWithheld)}</p>
                  </div>

                  <div className="rounded-lg border border-gray-200 p-4">
                    <p className="text-xs text-gray-500">ISR withheld</p>
                    <p className="text-sm font-semibold text-gray-900">{formatMoney(selectedPayment.isrWithheld)}</p>
                  </div>
                </div>

                <div className="no-print flex justify-end space-x-3 pt-4 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={handleClosePaymentDetail}
                    className="px-4 py-2 border border-[#d6cfbf] text-[#2f3e1e] rounded-lg hover:bg-[#f7f0df] transition-colors text-sm"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="px-4 py-2 bg-[#2f3e1e] text-white rounded-lg hover:bg-[#243015] transition-colors text-sm"
                  >
                    Print
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showDocumentPreviewModal && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
            onClick={handleCloseDocumentPreview}
          >
            <div
              className="bg-white rounded-lg p-6 w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4">
                <div className="min-w-0">
                  <h3 className="text-xl font-semibold text-gray-900 truncate">{documentPreviewTitle}</h3>
                  {documentPreviewFilename ? (
                    <p className="text-sm text-gray-500 truncate">{documentPreviewFilename}</p>
                  ) : null}
                </div>
                <button
                  onClick={handleCloseDocumentPreview}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <i className="ri-close-line text-2xl"></i>
                </button>
              </div>

              <div className="flex-1 overflow-auto border border-gray-200 rounded-lg bg-white">
                {documentPreviewType === 'table' ? (
                  <div className="p-4 space-y-4">
                    {documentPreviewSummary.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {documentPreviewSummary.map((item, idx) => (
                          <div key={idx} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                            <div className="text-xs text-gray-500">{item.label}</div>
                            <div className="text-sm font-semibold text-gray-900">{item.value}</div>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50 sticky top-0">
                            <tr>
                              {documentPreviewHeaders.map((header, idx) => (
                                <th
                                  key={idx}
                                  className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap"
                                >
                                  {header}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {documentPreviewRows.map((row, rowIdx) => (
                              <tr key={rowIdx} className="hover:bg-gray-50">
                                {row.map((cell, cellIdx) => (
                                  <td
                                    key={cellIdx}
                                    className="px-4 py-2 text-sm text-gray-900 whitespace-nowrap"
                                  >
                                    {cell !== null && cell !== undefined ? String(cell) : ''}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ) : documentPreviewUrl ? (
                  <iframe
                    ref={documentPreviewIframeRef}
                    src={documentPreviewUrl}
                    title={documentPreviewTitle}
                    className="w-full h-[70vh]"
                  />
                ) : (
                  <div className="p-6 text-gray-600">No hay vista previa disponible.</div>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-4">
                {(documentPreviewType === 'pdf' || documentPreviewType === 'html') && documentPreviewUrl ? (
                  <button
                    onClick={handlePrintDocumentPreview}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
                  >
                    Imprimir
                  </button>
                ) : null}
                <button
                  onClick={handleCloseDocumentPreview}
                  className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Cerrar
                </button>
                <button
                  onClick={handleDownloadDocumentPreview}
                  disabled={!documentPreviewBlob || !documentPreviewFilename}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  Descargar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Payment Modal */}
        {showPaymentModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto border border-[#e6dec8] shadow-xl">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-[#1e2814]">Record Payment</h3>
                <button
                  onClick={() => {
                    setPaymentCustomerId('');
                    setPaymentInvoiceId('');
                    setPaymentAmount(0);
                    setPaymentItbisWithheld(0);
                    setPaymentIsrWithheld(0);
                    setShowPaymentModal(false);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line"></i>
                </button>
              </div>
              
              <form onSubmit={handleSavePayment} className="space-y-4">
                {/* Dropdown de Cliente */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Customer
                  </label>
                  <select 
                    required
                    name="customerId"
                    value={paymentCustomerId}
                    onChange={(e) => {
                      const nextCustomer = String(e.target.value || '');
                      setPaymentCustomerId(nextCustomer);
                      // Limpiar factura seleccionada al cambiar cliente
                      setPaymentInvoiceId('');
                      setPaymentAmount(0);
                      setPaymentItbisWithheld(0);
                      setPaymentIsrWithheld(0);
                    }}
                    className="w-full p-3 border border-[#d6cfbf] rounded-lg bg-white focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e] pr-8 text-gray-800"
                  >
                    <option value="">Select customer</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Dropdown de Factura (filtrado por cliente) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Invoice
                  </label>
                  <select 
                    required
                    name="invoiceId"
                    value={paymentInvoiceId}
                    disabled={!paymentCustomerId}
                    onChange={async (e) => {
                      const next = String(e.target.value || '');
                      setPaymentInvoiceId(next);

                      if (next && user?.id && invoiceHasServiceLines[next] === undefined) {
                        try {
                          const lines = await invoicesService.getLinesWithItemType(user.id, next);
                          const hasServices = (lines || []).some((ln: any) => {
                            const itemType = String((ln as any)?.inventory_items?.item_type || '').toLowerCase();
                            return itemType === 'service';
                          });
                          setInvoiceHasServiceLines((prev: Record<string, boolean>) => ({ ...prev, [next]: hasServices }));
                          // Recompute after caching
                          const inv = invoices.find((i) => i.id === next);
                          const invNumber = String(inv?.invoiceNumber || '');
                          if (inv && isFiscalInvoiceNumber(invNumber)) {
                            const total = Number(inv.totalAmount || 0);
                            const itbis = Number((inv as any).taxAmount || 0);
                            const effectivePayment = Math.min(Number(paymentAmount || 0), Number(inv.balance || 0));
                            const ratio = total > 0 ? Math.max(0, Math.min(1, effectivePayment / total)) : 0;
                            const suggestedItbisWithheld = Math.round(itbis * ratio * 100) / 100;
                            setPaymentItbisWithheld(suggestedItbisWithheld);

                            const baseSubtotal = Math.max(0, total - itbis);
                            const isrRate = Math.max(0, Number(isrServiceRatePct) || 0) / 100;
                            const suggestedIsrWithheld = hasServices && isrRate > 0
                              ? Math.round(baseSubtotal * ratio * isrRate * 100) / 100
                              : 0;
                            setPaymentIsrWithheld(suggestedIsrWithheld);
                          } else {
                            recomputeWithheldDefaults(next, paymentAmount);
                          }
                        } catch {
                          setInvoiceHasServiceLines((prev: Record<string, boolean>) => ({ ...prev, [next]: false }));
                          recomputeWithheldDefaults(next, paymentAmount);
                        }
                      } else {
                        recomputeWithheldDefaults(next, paymentAmount);
                      }
                    }}
                    className="w-full p-3 border border-[#d6cfbf] rounded-lg bg-white focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e] pr-8 disabled:bg-gray-100 disabled:cursor-not-allowed text-gray-800"
                  >
                    <option value="">{paymentCustomerId ? 'Select invoice' : 'Select a customer first'}</option>
                    {invoices
                      .filter(inv => inv.balance > 0 && inv.status !== 'cancelled' && inv.status !== 'paid' && inv.customerId === paymentCustomerId)
                      .map((invoice) => (
                      <option key={invoice.id} value={invoice.id}>
                        {invoice.invoiceNumber} ({formatMoney(invoice.balance)})
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Bank account (optional)
                  </label>
                  <select 
                    name="bankAccountId"
                    className="w-full p-3 border border-[#d6cfbf] rounded-lg bg-white focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e] pr-8 text-gray-800"
                  >
                    <option value="">Select account</option>
                    {bankAccounts
                      .map((ba) => {
                        const baseName = String(ba.name || '').trim();
                        const label = baseName
                          ? (ba.accountNumber ? `${baseName} (${ba.accountNumber})` : baseName)
                          : `Cuenta ${String(ba.id || '').slice(0, 8)}`;
                        return { ...ba, __label: label };
                      })
                      .filter((ba: any) => String(ba.__label || '').trim() !== '')
                      .map((ba: any) => (
                        <option key={ba.id} value={ba.id}>
                          {ba.__label}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Accounts receivable account (optional)
                  </label>
                  <select
                    name="arAccountId"
                    className="w-full p-3 border border-[#d6cfbf] rounded-lg bg-white focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e] pr-8 text-gray-800"
                    defaultValue=""
                  >
                    <option value="">Use default account</option>
                    {receivableAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.code} - {acc.name}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Amount to pay
                  </label>
                  <input
                    type="number" min="0"
                    step="0.01"
                    required
                    name="amount"
                    value={Number.isFinite(paymentAmount) ? String(paymentAmount) : '0'}
                    onChange={(e) => {
                      const next = Number(e.target.value) || 0;
                      setPaymentAmount(next);
                      recomputeWithheldDefaults(paymentInvoiceId, next);
                    }}
                    className="w-full p-3 border border-[#d6cfbf] rounded-lg bg-white focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e]"
                    placeholder="0.00"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Payment method
                  </label>
                  <select 
                    required
                    name="paymentMethod"
                    className="w-full p-3 border border-[#d6cfbf] rounded-lg bg-white focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e] pr-8 text-gray-800"
                  >
                    <option value="cash">Cash</option>
                    <option value="check">Check</option>
                    <option value="transfer">Transfer</option>
                    <option value="card">Card</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Reference
                  </label>
                  <input
                    type="text"
                    name="reference"
                    className="w-full p-3 border border-[#d6cfbf] rounded-lg bg-white focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e]"
                    placeholder="Reference number"
                  />
                </div>

                {(() => {
                  const inv = resolveInvoiceForPayment();
                  const isFiscal = inv ? isFiscalInvoiceNumber(String(inv.invoiceNumber || '')) : false;
                  const disabled = !inv || !isFiscal;
                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          VAT withheld
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          name="itbisWithheld"
                          disabled={disabled}
                          value={Number.isFinite(paymentItbisWithheld) ? String(paymentItbisWithheld) : '0'}
                          onChange={(e) => setPaymentItbisWithheld(Number(e.target.value) || 0)}
                          className="w-full p-3 border border-[#d6cfbf] rounded-lg bg-white focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e] disabled:bg-gray-100"
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          ISR withheld
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          name="isrWithheld"
                          disabled={disabled}
                          value={Number.isFinite(paymentIsrWithheld) ? String(paymentIsrWithheld) : '0'}
                          onChange={(e) => setPaymentIsrWithheld(Number(e.target.value) || 0)}
                          className="w-full p-3 border border-[#d6cfbf] rounded-lg bg-white focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e] disabled:bg-gray-100"
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  );
                })()}
                
                <div className="flex space-x-3 mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentInvoiceId('');
                      setPaymentCustomerId('');
                      setPaymentAmount(0);
                      setPaymentItbisWithheld(0);
                      setPaymentIsrWithheld(0);
                      setShowPaymentModal(false);
                    }}
                    className="flex-1 border border-[#d6cfbf] text-[#2f3e1e] py-2 rounded-lg hover:bg-[#f7f0df] transition-colors whitespace-nowrap"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-[#2f3e1e] text-white py-2 rounded-lg hover:bg-[#243015] transition-colors whitespace-nowrap"
                  >
                    Save Payment
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
