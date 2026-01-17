import { useEffect, useState } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import {
  customersService,
  invoicesService,
  receiptsService,
  creditDebitNotesService,
  customerAdvancesService,
  bankCurrenciesService,
  bankExchangeRatesService,
  settingsService,
} from '../../../services/database';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { formatAmount, formatMoney, getCurrencyPrefix } from '../../../utils/numberFormat';
import { addPdfBrandedHeader, getPdfTableStyles } from '../../../utils/exportImportUtils';

interface ReportCustomer {
  id: string;
  name: string;
  currentBalance: number;
  creditLimit: number;
  status: 'Activo' | 'Inactivo' | 'Bloqueado';
}

interface ReportInvoice {
  id: string;
  customerId: string;
  customerName: string;
  invoiceNumber: string;
  amount: number;
  balance: number;
  daysOverdue: number;
  dueDate: string;
  currency: string;
  baseAmount?: number | null;
  baseBalance?: number | null;
}

interface ReportPayment {
  id: string;
  customerName: string;
  amount: number;
  paymentMethod: string;
  date: string;
}

interface ReportNote {
  id: string;
  customerId: string;
  customerName: string;
  type: 'credit' | 'debit';
  noteNumber: string;
  date: string;
  amount: number;
  appliedAmount: number;
  balance: number;
}

interface ReportAdvance {
  id: string;
  customerId: string;
  customerName: string;
  advanceNumber: string;
  date: string;
  amount: number;
  appliedAmount: number;
  balance: number;
}

export default function ReportsPage() {
  const { user } = useAuth();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [customers, setCustomers] = useState<ReportCustomer[]>([]);
  const [invoices, setInvoices] = useState<ReportInvoice[]>([]);
  const [payments, setPayments] = useState<ReportPayment[]>([]);
  const [creditNotes, setCreditNotes] = useState<ReportNote[]>([]);
  const [debitNotes, setDebitNotes] = useState<ReportNote[]>([]);
  const [advances, setAdvances] = useState<ReportAdvance[]>([]);
  const [baseCurrencyCode, setBaseCurrencyCode] = useState<string>('DOP');
  const [companyInfo, setCompanyInfo] = useState<any | null>(null);
  const [showReportPreviewModal, setShowReportPreviewModal] = useState(false);
  const [reportPreviewType, setReportPreviewType] = useState<'pdf' | 'table'>('pdf');
  const [reportPreviewTitle, setReportPreviewTitle] = useState('');
  const [reportPreviewFilename, setReportPreviewFilename] = useState('');
  const [reportPreviewUrl, setReportPreviewUrl] = useState('');
  const [reportPreviewBlob, setReportPreviewBlob] = useState<Blob | null>(null);
  const [reportPreviewHeaders, setReportPreviewHeaders] = useState<string[]>([]);
  const [reportPreviewRows, setReportPreviewRows] = useState<Array<Array<string | number>>>([]);
  const [reportPreviewSummary, setReportPreviewSummary] = useState<Array<{ label: string; value: string }>>([]);

  useEffect(() => {
    const loadData = async () => {
      if (!user?.id) return;
      try {
        const [
          customerRows,
          invoiceRows,
          receiptRows,
          creditRows,
          debitRows,
          advanceRows,
          currencyRows,
        ] = await Promise.all([
          customersService.getAll(user.id),
          invoicesService.getAll(user.id),
          receiptsService.getAll(user.id),
          creditDebitNotesService.getAll(user.id, 'credit'),
          creditDebitNotesService.getAll(user.id, 'debit'),
          customerAdvancesService.getAll(user.id),
          bankCurrenciesService.getAll(user.id),
        ]);

        const mappedCustomers: ReportCustomer[] = (customerRows || []).map((c: any) => ({
          id: c.id,
          name: c.name,
          currentBalance: Number(c.currentBalance ?? c.current_balance ?? 0),
          creditLimit: Number(c.creditLimit ?? c.credit_limit ?? 0),
          status: (c.status === 'inactive'
            ? 'Inactivo'
            : c.status === 'blocked'
              ? 'Bloqueado'
              : 'Activo') as ReportCustomer['status'],
        }));

        const baseCurrency = (currencyRows || []).find((c: any) => c.is_base) || (currencyRows || [])[0];
        const baseCode = baseCurrency?.code || 'DOP';
        setBaseCurrencyCode(baseCode);

        const todayStr = new Date().toISOString().slice(0, 10);

        const mappedInvoices: ReportInvoice[] = await Promise.all((invoiceRows || []).map(async (inv: any) => {
          const total = Number(inv.total_amount) || 0;
          const paid = Number(inv.paid_amount) || 0;
          const balance = total - paid;
          const today = new Date();
          const due = inv.due_date ? new Date(inv.due_date) : null;
          let daysOverdue = 0;
          if (due && balance > 0) {
            const diff = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
            daysOverdue = diff > 0 ? diff : 0;
          }

          const currency = (inv.currency as string) || baseCode;
          const invoiceDate = (inv.invoice_date as string) || todayStr;

          let baseAmount: number | null = total;
          let baseBalance: number | null = balance;

          if (currency !== baseCode) {
            try {
              const rate = await bankExchangeRatesService.getEffectiveRate(
                user.id,
                currency,
                baseCode,
                invoiceDate,
              );
              if (rate && rate > 0) {
                baseAmount = total * rate;
                baseBalance = balance * rate;
              } else {
                baseAmount = null;
                baseBalance = null;
              }
            } catch (fxError) {
              // eslint-disable-next-line no-console
              console.error('Error calculando equivalente en moneda base para factura CxC (reportes)', fxError);
              baseAmount = null;
              baseBalance = null;
            }
          }

          return {
            id: String(inv.id),
            customerId: String(inv.customer_id),
            customerName: (inv.customers as any)?.name || 'Cliente',
            invoiceNumber: inv.invoice_number as string,
            amount: total,
            balance,
            daysOverdue,
            dueDate: (inv.due_date as string) || '',
            currency,
            baseAmount,
            baseBalance,
          };
        }));

        const mappedPayments: ReportPayment[] = (receiptRows || []).map((r: any) => ({
          id: String(r.id),
          customerName: (r.customers as any)?.name || 'Cliente',
          amount: Number(r.amount) || 0,
          paymentMethod: String(r.payment_method || 'cash'),
          date: (r.receipt_date as string) || '',
        }));

        const mapNoteRows = (rows: any[], type: 'credit' | 'debit'): ReportNote[] => {
          return (rows || []).map((n: any) => {
            const amount = Number(n.total_amount) || 0;
            const dbApplied = Number((n as any).applied_amount) || 0;
            const dbBalance = Number((n as any).balance_amount);
            let appliedAmount = dbApplied;
            let balance = Number.isFinite(dbBalance) ? dbBalance : amount - appliedAmount;
            if (n.status === 'cancelled') {
              appliedAmount = 0;
              balance = 0;
            }
            return {
              id: String(n.id),
              customerId: String(n.customer_id),
              customerName: (n.customers as any)?.name || 'Cliente',
              type,
              noteNumber: n.note_number as string,
              date: n.note_date as string,
              amount,
              appliedAmount,
              balance,
            };
          });
        };

        const mappedCreditNotes = mapNoteRows(creditRows as any[], 'credit');
        const mappedDebitNotes = mapNoteRows(debitRows as any[], 'debit');

        const mappedAdvances: ReportAdvance[] = (advanceRows || []).map((a: any) => {
          const amount = Number(a.amount) || 0;
          const applied = Number(a.applied_amount) || 0;
          const balance = Number(a.balance_amount);
          return {
            id: String(a.id),
            customerId: String(a.customer_id),
            customerName: (a.customers as any)?.name || 'Cliente',
            advanceNumber: a.advance_number as string,
            date: a.advance_date as string,
            amount,
            appliedAmount: applied,
            balance: Number.isFinite(balance) ? balance : amount - applied,
          };
        });

        setCustomers(mappedCustomers);
        setInvoices(mappedInvoices);
        setPayments(mappedPayments);
        setCreditNotes(mappedCreditNotes);
        setDebitNotes(mappedDebitNotes);
        setAdvances(mappedAdvances);
      } catch (error) {
        // Si hay error, dejar arrays vacÃ­os; los reportes simplemente saldrÃ¡n en blanco
        console.error('Error loading AR reports data:', error);
        setCustomers([]);
        setInvoices([]);
        setPayments([]);
        setCreditNotes([]);
        setDebitNotes([]);
        setAdvances([]);
      }
    };

    loadData();
  }, [user?.id]);

  useEffect(() => {
    const loadCompany = async () => {
      if (!user?.id) return;
      try {
        const info = await settingsService.getCompanyInfo();
        setCompanyInfo(info);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error cargando informaciÃ³n de la empresa para reportes de CxC', error);
      }
    };

    void loadCompany();
  }, [user?.id]);

  useEffect(() => {
    return () => {
      if (reportPreviewUrl) {
        URL.revokeObjectURL(reportPreviewUrl);
      }
    };
  }, [reportPreviewUrl]);

  const companyName =
    (companyInfo as any)?.name ||
    (companyInfo as any)?.company_name ||
    '';

  const handleCloseReportPreview = () => {
    setShowReportPreviewModal(false);
    setReportPreviewType('pdf');
    setReportPreviewTitle('');
    setReportPreviewFilename('');
    setReportPreviewUrl('');
    setReportPreviewBlob(null);
    setReportPreviewHeaders([]);
    setReportPreviewRows([]);
    setReportPreviewSummary([]);
  };

  const handleDownloadReportPreview = () => {
    if (!reportPreviewBlob || !reportPreviewFilename) return;
    const url = URL.createObjectURL(reportPreviewBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = reportPreviewFilename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const openPdfPreview = (doc: jsPDF, title: string, filename: string) => {
    const blob = doc.output('blob') as Blob;
    const url = URL.createObjectURL(blob);
    setReportPreviewType('pdf');
    setReportPreviewTitle(title);
    setReportPreviewFilename(filename);
    setReportPreviewBlob(blob);
    setReportPreviewUrl(url);
    setReportPreviewHeaders([]);
    setReportPreviewRows([]);
    setReportPreviewSummary([]);
    setShowReportPreviewModal(true);
  };

  const openTablePreview = (payload: {
    title: string;
    filename: string;
    blob: Blob;
    headers: string[];
    rows: Array<Array<string | number>>;
    summary?: Array<{ label: string; value: string }>;
  }) => {
    setReportPreviewType('table');
    setReportPreviewTitle(payload.title);
    setReportPreviewFilename(payload.filename);
    setReportPreviewBlob(payload.blob);
    setReportPreviewUrl('');
    setReportPreviewHeaders(payload.headers);
    setReportPreviewRows(payload.rows);
    setReportPreviewSummary(payload.summary || []);
    setShowReportPreviewModal(true);
  };

  const getPaymentMethodLabel = (method: string) => {
    switch (method) {
      case 'transfer':
        return 'Transfer';
      case 'check':
        return 'Check';
      case 'cash':
        return 'Cash';
      case 'card':
        return 'Card';
      default:
        return method ? method.charAt(0).toUpperCase() + method.slice(1) : 'Other';
    }
  };

  const getCustomerStatusLabel = (status: ReportCustomer['status']) => {
    switch (status) {
      case 'Activo':
        return 'Active';
      case 'Inactivo':
        return 'Inactive';
      case 'Bloqueado':
        return 'Blocked';
      default:
        return 'Unknown';
    }
  };

  const handleGenerateAgingReport = async () => {
    const doc = new jsPDF();
    const pdfStyles = getPdfTableStyles();
    
    // Add branded header with logo
    const startY = await addPdfBrandedHeader(doc, 'Accounts Receivable Aging Report', {
      subtitle: 'Past-due balances by customer and aging bucket'
    });

    // AnÃ¡lisis por perÃ­odos
    const agingData = customers.map(customer => {
      const customerInvoices = invoices.filter(inv => inv.customerId === customer.id && inv.balance > 0);
      const current = customerInvoices.filter(inv => inv.daysOverdue === 0).reduce((sum, inv) => sum + inv.balance, 0);

      const days1to30 = customerInvoices.filter(inv => inv.daysOverdue >= 1 && inv.daysOverdue <= 30).reduce((sum, inv) => sum + inv.balance, 0);
      const days31to60 = customerInvoices.filter(inv => inv.daysOverdue >= 31 && inv.daysOverdue <= 60).reduce((sum, inv) => sum + inv.balance, 0);
      const days61to90 = customerInvoices.filter(inv => inv.daysOverdue >= 61 && inv.daysOverdue <= 90).reduce((sum, inv) => sum + inv.balance, 0);
      const over90 = customerInvoices.filter(inv => inv.daysOverdue > 90).reduce((sum, inv) => sum + inv.balance, 0);

      return [
        customer.name,
        formatMoney(current),
        formatMoney(days1to30),
        formatMoney(days31to60),
        formatMoney(days61to90),
        formatMoney(over90),
        formatMoney(customer.currentBalance),
      ];
    });

    (doc as any).autoTable({
      startY,
      head: [['Customer', 'Current', '1-30 days', '31-60 days', '61-90 days', '+90 days', 'Total']],
      body: agingData,
      theme: 'striped',
      ...pdfStyles
    });

    const filename = `aging-report-${new Date().toISOString().split('T')[0]}.pdf`;
    openPdfPreview(doc, 'Accounts Receivable Aging Report', filename);
  };

  const handleGenerateStatementReport = async () => {
    const doc = new jsPDF();
    const pdfStyles = getPdfTableStyles();
    
    // Add branded header with logo on first page
    let currentY = await addPdfBrandedHeader(doc, 'Account Statement Report', {
      subtitle: 'Detailed movement per customer with invoices and payments'
    });

    for (let index = 0; index < customers.length; index++) {
      const customer = customers[index];
      if (index > 0) {
        doc.addPage();
        currentY = await addPdfBrandedHeader(doc, 'Account Statement Report', {
          subtitle: `Customer: ${customer.name}`
        });
      }

      doc.setFontSize(14);
      doc.setTextColor(47, 62, 30);
      doc.text(`Account Statement - ${customer.name}`, 20, currentY);
      currentY += 15;

      const customerInvoices = invoices.filter(inv => inv.customerId === customer.id);
      const customerPayments = payments.filter(pay => pay.customerName === customer.name);
      const customerCreditNotes = creditNotes.filter(n => n.customerId === customer.id && n.balance > 0);
      const customerDebitNotes = debitNotes.filter(n => n.customerId === customer.id && n.balance > 0);
      const customerAdvances = advances.filter(a => a.customerId === customer.id && a.balance > 0);

      // Invoices
      if (customerInvoices.length > 0) {
        doc.setFontSize(12);
        doc.text('Invoices:', 20, currentY);
        currentY += 10;

        const invoiceData = customerInvoices.map(inv => {
          const invPrefix = getCurrencyPrefix(inv.currency);
          const basePrefix = getCurrencyPrefix(baseCurrencyCode);
          const amountStr = inv.baseAmount != null && inv.currency !== baseCurrencyCode
            ? `${invPrefix ? `${invPrefix} ` : ''}${formatAmount(inv.amount)} (â‰ˆ ${basePrefix ? `${basePrefix} ` : ''}${formatAmount(inv.baseAmount)})`
            : `${invPrefix ? `${invPrefix} ` : ''}${formatAmount(inv.amount)}`;
          const balanceStr = inv.baseBalance != null && inv.currency !== baseCurrencyCode
            ? `${invPrefix ? `${invPrefix} ` : ''}${formatAmount(inv.balance)} (â‰ˆ ${basePrefix ? `${basePrefix} ` : ''}${formatAmount(inv.baseBalance)})`
            : `${invPrefix ? `${invPrefix} ` : ''}${formatAmount(inv.balance)}`;

          return [
            inv.invoiceNumber,
            amountStr,
            balanceStr,
            inv.daysOverdue > 0 ? `${inv.daysOverdue} days` : 'Current',
          ];
        });

        (doc as any).autoTable({
          startY: currentY,
          head: [['Invoice', 'Amount', 'Balance', 'Status']],
          body: invoiceData,
          theme: 'grid',
          ...pdfStyles
        });

        currentY = (doc as any).lastAutoTable.finalY + 20;
      }

      // Payments
      if (customerPayments.length > 0) {
        doc.setFontSize(12);
        doc.text('Payments Received:', 20, currentY);
        currentY += 10;

        const paymentData = customerPayments.map(pay => [
          pay.date,
          formatMoney(pay.amount),
          getPaymentMethodLabel(pay.paymentMethod)
        ]);

        (doc as any).autoTable({
          startY: currentY,
          head: [['Date', 'Amount', 'Method']],
          body: paymentData,
          theme: 'grid',
          ...pdfStyles
        });

        currentY = (doc as any).lastAutoTable.finalY + 20;
      }

      // Credit Notes
      if (customerCreditNotes.length > 0) {
        doc.setFontSize(12);
        doc.text('Credit Notes:', 20, currentY);
        currentY += 10;

        const creditData = customerCreditNotes.map(n => [
          n.noteNumber,
          formatMoney(n.amount),
          formatMoney(n.appliedAmount),
          formatMoney(n.balance),
        ]);

        (doc as any).autoTable({
          startY: currentY,
          head: [['Note', 'Amount', 'Applied', 'Balance']],
          body: creditData,
          theme: 'grid',
          ...pdfStyles
        });

        currentY = (doc as any).lastAutoTable.finalY + 20;
      }

      // Debit Notes
      if (customerDebitNotes.length > 0) {
        doc.setFontSize(12);
        doc.text('Debit Notes:', 20, currentY);
        currentY += 10;

        const debitData = customerDebitNotes.map(n => [
          n.noteNumber,
          formatMoney(n.amount),
          formatMoney(n.appliedAmount),
          formatMoney(n.balance),
        ]);

        (doc as any).autoTable({
          startY: currentY,
          head: [['Note', 'Amount', 'Applied', 'Balance']],
          body: debitData,
          theme: 'grid',
          ...pdfStyles
        });

        currentY = (doc as any).lastAutoTable.finalY + 20;
      }

      // Customer Advances
      if (customerAdvances.length > 0) {
        doc.setFontSize(12);
        doc.text('Customer Advances:', 20, currentY);
        currentY += 10;

        const advanceData = customerAdvances.map(a => [
          a.advanceNumber,
          formatMoney(a.amount),
          formatMoney(a.appliedAmount),
          formatMoney(a.balance),
        ]);

        (doc as any).autoTable({
          startY: currentY,
          head: [['Advance', 'Amount', 'Applied', 'Balance']],
          body: advanceData,
          theme: 'grid',
          ...pdfStyles
        });
      }

      // Summary
      doc.setFontSize(12);
      doc.text(`Current Balance: ${formatMoney(customer.currentBalance)}`, 20, doc.internal.pageSize.height - 30);
    }

    const filename = `account-statements-${new Date().toISOString().split('T')[0]}.pdf`;
    openPdfPreview(doc, 'Account Statement Report', filename);
  };

  const handleGenerateCollectionReport = async () => {
    const doc = new jsPDF();
    const pdfStyles = getPdfTableStyles();
    
    // Add branded header with logo
    const periodText = dateFrom && dateTo ? `Period: ${dateFrom} to ${dateTo}` : undefined;
    let startY = await addPdfBrandedHeader(doc, 'Collection Summary Report', {
      subtitle: 'Payments by period and method',
      periodText
    });

    const totalPayments = payments.reduce((sum, p) => sum + p.amount, 0);
    const paymentsByMethod = payments.reduce((acc, payment) => {
      acc[payment.paymentMethod] = (acc[payment.paymentMethod] || 0) + payment.amount;
      return acc;
    }, {} as Record<string, number>);

    doc.setFontSize(12);
    doc.setTextColor(47, 62, 30);
    doc.text('Collection Summary', 20, startY);
    startY += 8;

    const summaryData = [
      ['Concepto', 'Monto'],
      ['Total Cobrado', formatMoney(totalPayments)],
      ['NÃºmero de Pagos', payments.length.toString()],
      ['Efectivo', formatMoney(paymentsByMethod.cash || 0)],
      ['Transferencias', formatMoney(paymentsByMethod.transfer || 0)],
      ['Cheques', formatMoney(paymentsByMethod.check || 0)],
      ['Tarjetas', formatMoney(paymentsByMethod.card || 0)]
    ];

    (doc as any).autoTable({
      startY,
      head: [summaryData[0]],
      body: summaryData.slice(1),
      theme: 'grid',
      ...pdfStyles
    });

    doc.setFontSize(14);
    doc.text('Detalle de Pagos', 20, (doc as any).lastAutoTable.finalY + 20);

    const paymentData = payments.map(payment => [
      payment.date,
      payment.customerName,
      formatMoney(payment.amount),
      getPaymentMethodLabel(payment.paymentMethod)
    ]);

    (doc as any).autoTable({
      startY: (doc as any).lastAutoTable.finalY + 30,
      head: [['Fecha', 'Cliente', 'Monto', 'MÃ©todo']],
      body: paymentData,
      theme: 'striped',
      ...pdfStyles
    });

    const filename = `reporte-cobranza-${new Date().toISOString().split('T')[0]}.pdf`;
    openPdfPreview(doc, 'Reporte de Cobranza', filename);
  };

  const handleGenerateCollectionExcel = () => {
    const totalPayments = payments.reduce((sum, p) => sum + p.amount, 0);
    const paymentsByMethod = payments.reduce((acc, payment) => {
      acc[payment.paymentMethod] = (acc[payment.paymentMethod] || 0) + payment.amount;
      return acc;
    }, {} as Record<string, number>);

    const fmt = (value: number) => formatAmount(value);

    const rows: (string | number)[][] = [
      [companyName],
      ['Reporte de Cobranza'],
      [`Fecha de generaciÃ³n: ${new Date().toLocaleDateString('es-DO')}`],
      dateFrom && dateTo ? [`PerÃ­odo: ${dateFrom} al ${dateTo}`] : [],
      [''],
      ['RESUMEN DE COBRANZA'],
      ['Total Cobrado', ` ${fmt(totalPayments)}`],
      ['NÃºmero de Pagos', payments.length.toString()],
      ['Efectivo', ` ${fmt(paymentsByMethod.cash || 0)}`],
      ['Transferencias', ` ${fmt(paymentsByMethod.transfer || 0)}`],
      ['Cheques', ` ${fmt(paymentsByMethod.check || 0)}`],
      ['Tarjetas', ` ${fmt(paymentsByMethod.card || 0)}`],

      [''],
      ['DETALLE DE PAGOS'],
      ['Fecha', 'Cliente', 'Monto', 'MÃ©todo'],
      ...payments.map(payment => [
        payment.date,
        payment.customerName,
        formatMoney(payment.amount),
        getPaymentMethodLabel(payment.paymentMethod)
      ])
    ];

    // CSV amigable para Excel (UTF-8 BOM + saltos de lÃ­nea Windows)
    const csvBody = rows
      .map(row =>
        row
          .map(col => {
            const str = String(col ?? '');
            // Si el texto contiene comillas, punto y coma o saltos de lÃ­nea, lo encerramos entre comillas
            return /[";\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
          })
          .join(';') // Usar ; como separador para que Excel en espaÃ±ol lo detecte como columnas
      )
      .join('\r\n');

    const csvContent = '\uFEFF' + csvBody;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const filename = `reporte-cobranza-${new Date().toISOString().split('T')[0]}.csv`;
    openTablePreview({
      title: 'Reporte de Cobranza',
      filename,
      blob,
      headers: ['Fecha', 'Cliente', 'Monto', 'MÃ©todo'],
      rows: payments.map(payment => [
        payment.date,
        payment.customerName,
      ]),
      summary: [
        { label: 'Total Cobrado', value: formatMoney(totalPayments) },
        { label: 'NÃºmero de Pagos', value: payments.length.toString() },
        { label: 'Transferencias', value: formatMoney(paymentsByMethod.transfer || 0) },
        { label: 'Cheques', value: formatMoney(paymentsByMethod.check || 0) },
        { label: 'Efectivo', value: formatMoney(paymentsByMethod.cash || 0) },
        { label: 'Tarjetas', value: formatMoney(paymentsByMethod.card || 0) },
      ],
    });
  };

  const handleGenerateCustomerBalanceReport = async () => {
    const doc = new jsPDF();
    const pdfStyles = getPdfTableStyles();
    
    // Add branded header with logo
    let startY = await addPdfBrandedHeader(doc, 'Customer Balances Report', {
      subtitle: 'Current receivables vs. credit limits with utilization'
    });

    // EstadÃ­sticas generales
    const totalBalance = customers.reduce((sum, c) => sum + c.currentBalance, 0);
    const totalCreditLimit = customers.reduce((sum, c) => sum + c.creditLimit, 0);
    const activeCustomers = customers.filter(c => c.status === 'Activo').length;
    const customersWithBalance = customers.filter(c => c.currentBalance > 0).length;
    const creditUtilizationPercent = totalCreditLimit > 0
      ? (totalBalance / totalCreditLimit) * 100
      : 0;

    doc.setFontSize(12);
    doc.setTextColor(47, 62, 30);
    doc.text('General Summary', 20, startY);
    startY += 8;

    const summaryData = [
      ['Total Receivables', formatMoney(totalBalance)],
      ['Total Credit Limits', formatMoney(totalCreditLimit)],
      ['Active Customers', activeCustomers.toString()],
      ['Customers with Balance', customersWithBalance.toString()],
      ['Credit Utilization', `${creditUtilizationPercent.toFixed(1)}%`]
    ];

    (doc as any).autoTable({
      startY,
      head: [['Concept', 'Value']],
      body: summaryData,
      theme: 'grid',
      ...pdfStyles
    });

    doc.setFontSize(14);
    doc.text('Customer Details', 20, (doc as any).lastAutoTable.finalY + 20);

    const customerData = customers.map(customer => {
      const utilizationPercent = customer.creditLimit > 0 ? ((customer.currentBalance / customer.creditLimit) * 100).toFixed(1) : '0';
      const availableCredit = customer.creditLimit - customer.currentBalance;

      return [
        customer.name,
        formatMoney(customer.currentBalance),
        formatMoney(customer.creditLimit),
        formatMoney(availableCredit),
        `${utilizationPercent}%`,
        getCustomerStatusLabel(customer.status)
      ];
    });

    (doc as any).autoTable({
      startY: (doc as any).lastAutoTable.finalY + 30,
      head: [['Customer', 'Current Balance', 'Credit Limit', 'Available Credit', 'Utilization', 'Status']],
      body: customerData,
      theme: 'striped',
      ...pdfStyles
    });

    const filename = `customer-balances-${new Date().toISOString().split('T')[0]}.pdf`;
    openPdfPreview(doc, 'Customer Balances Report', filename);
  };

  const handleGenerateOverdueReport = async () => {
    const doc = new jsPDF();
    const pdfStyles = getPdfTableStyles();
    
    // Add branded header with logo
    let startY = await addPdfBrandedHeader(doc, 'Overdue Invoices Report', {
      subtitle: 'Invoices past due grouped by days late and customer'
    });

    // Filtrar facturas vencidas
    const overdueInvoices = invoices.filter(inv => inv.daysOverdue > 0 && inv.balance > 0);
    const totalOverdue = overdueInvoices.reduce((sum, inv) => sum + (inv.baseBalance ?? inv.balance), 0);

    // AnÃ¡lisis por perÃ­odos
    const overdue1to30 = overdueInvoices.filter(inv => inv.daysOverdue >= 1 && inv.daysOverdue <= 30);
    const overdue31to60 = overdueInvoices.filter(inv => inv.daysOverdue >= 31 && inv.daysOverdue <= 60);
    const overdue61to90 = overdueInvoices.filter(inv => inv.daysOverdue >= 61 && inv.daysOverdue <= 90);
    const overdueOver90 = overdueInvoices.filter(inv => inv.daysOverdue > 90);

    doc.setFontSize(12);
    doc.setTextColor(47, 62, 30);
    doc.text('Overdue Summary', 20, startY);
    startY += 8;

    const summaryData = [
      ['Total Overdue Invoices', overdueInvoices.length.toString()],
      ['Total Overdue Amount', formatMoney(totalOverdue)],
      ['1-30 days', `${overdue1to30.length} invoices - ${formatMoney(overdue1to30.reduce((sum, inv) => sum + (inv.baseBalance ?? inv.balance), 0))}`],
      ['31-60 days', `${overdue31to60.length} invoices - ${formatMoney(overdue31to60.reduce((sum, inv) => sum + (inv.baseBalance ?? inv.balance), 0))}`],
      ['61-90 days', `${overdue61to90.length} invoices - ${formatMoney(overdue61to90.reduce((sum, inv) => sum + (inv.baseBalance ?? inv.balance), 0))}`],
      ['Over 90 days', `${overdueOver90.length} invoices - ${formatMoney(overdueOver90.reduce((sum, inv) => sum + (inv.baseBalance ?? inv.balance), 0))}`]
    ];

    (doc as any).autoTable({
      startY,
      head: [['Concept', 'Detail']],
      body: summaryData,
      theme: 'grid',
      ...pdfStyles
    });

    if (overdueInvoices.length > 0) {
      doc.setFontSize(14);
      doc.text('Overdue Invoice Details', 20, (doc as any).lastAutoTable.finalY + 20);

      const overdueData = overdueInvoices.map(invoice => {
        const invPrefix = getCurrencyPrefix(invoice.currency);
        const basePrefix = getCurrencyPrefix(baseCurrencyCode);
        const amountStr = invoice.baseAmount != null && invoice.currency !== baseCurrencyCode
          ? `${invPrefix ? `${invPrefix} ` : ''}${formatAmount(invoice.amount)} (â‰ˆ ${basePrefix ? `${basePrefix} ` : ''}${formatAmount(invoice.baseAmount)})`
          : `${invPrefix ? `${invPrefix} ` : ''}${formatAmount(invoice.amount)}`;
        const balanceStr = invoice.baseBalance != null && invoice.currency !== baseCurrencyCode
          ? `${invPrefix ? `${invPrefix} ` : ''}${formatAmount(invoice.balance)} (â‰ˆ ${basePrefix ? `${basePrefix} ` : ''}${formatAmount(invoice.baseBalance)})`
          : `${invPrefix ? `${invPrefix} ` : ''}${formatAmount(invoice.balance)}`;

        return [
          invoice.invoiceNumber,
          invoice.customerName,
          invoice.dueDate,
          `${invoice.daysOverdue} days`,
          amountStr,
          balanceStr,
        ];
      });

      (doc as any).autoTable({
        startY: (doc as any).lastAutoTable.finalY + 30,
        head: [['Invoice', 'Customer', 'Due Date', 'Days Late', 'Original Amount', 'Balance']],
        body: overdueData,
        theme: 'striped',
        ...pdfStyles
      });
    }

    const filename = `overdue-invoices-${new Date().toISOString().split('T')[0]}.pdf`;
    openPdfPreview(doc, 'Overdue Invoices Report', filename);
  };

  const handleGeneratePaymentAnalysisReport = async () => {
    const doc = new jsPDF();
    const pdfStyles = getPdfTableStyles();
    
    // Add branded header with logo
    let startY = await addPdfBrandedHeader(doc, 'Payment Analysis Report', {
      subtitle: 'Statistical trends for payment frequency and methods'
    });

    // AnÃ¡lisis por cliente
    const customerPaymentAnalysis = customers.map(customer => {
      const customerPayments = payments.filter(p => p.customerName === customer.name);
      const totalPaid = customerPayments.reduce((sum, p) => sum + p.amount, 0);
      const avgPayment = customerPayments.length > 0 ? totalPaid / customerPayments.length : 0;
      const paymentFrequency = customerPayments.length;

      // MÃ©todo de pago preferido
      const methodCount = customerPayments.reduce((acc, p) => {
        acc[p.paymentMethod] = (acc[p.paymentMethod] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const preferredMethod = Object.entries(methodCount).reduce((a, b) =>
        methodCount[a[0]] > methodCount[b[0]] ? a : b, ['N/A', 0])[0];

      return {
        customer: customer.name,
        totalPaid,
        avgPayment,
        paymentFrequency,
        preferredMethod,
        currentBalance: customer.currentBalance
      };
    });

    // EstadÃ­sticas generales
    const totalPaymentsAmount = payments.reduce((sum, p) => sum + p.amount, 0);
    const avgPaymentAmount = payments.length > 0 ? totalPaymentsAmount / payments.length : 0;

    const methodStats = payments.reduce((acc, payment) => {
      acc[payment.paymentMethod] = (acc[payment.paymentMethod] || 0) + payment.amount;
      return acc;
    }, {} as Record<string, number>);

    doc.setFontSize(12);
    doc.setTextColor(47, 62, 30);
    doc.text('General Statistics', 20, startY);
    startY += 8;

    const generalStats = [
      ['Total Payments Received', formatMoney(totalPaymentsAmount)],
      ['Number of Transactions', payments.length.toString()],
      ['Average Payment', formatMoney(avgPaymentAmount)],
      ['Transfers', formatMoney(methodStats.transfer || 0)],
      ['Checks', formatMoney(methodStats.check || 0)],
      ['Cash', formatMoney(methodStats.cash || 0)],
      ['Cards', formatMoney(methodStats.card || 0)]
    ];

    (doc as any).autoTable({
      startY,
      head: [['Concept', 'Value']],
      body: generalStats,
      theme: 'grid',
      ...pdfStyles
    });

    doc.setFontSize(14);
    doc.text('Analysis by Customer', 20, (doc as any).lastAutoTable.finalY + 20);

    const analysisData = customerPaymentAnalysis.map(analysis => {
      const methodName = analysis.preferredMethod === 'transfer' ? 'Transfer' :
                        analysis.preferredMethod === 'check' ? 'Check' :
                        analysis.preferredMethod === 'cash' ? 'Cash' :
                        analysis.preferredMethod === 'card' ? 'Card' : 'N/A';

      return [
        analysis.customer,
        formatMoney(analysis.totalPaid),
        analysis.paymentFrequency.toString(),
        formatMoney(analysis.avgPayment),
        methodName,
        formatMoney(analysis.currentBalance),
      ];
    });

    (doc as any).autoTable({
      startY: (doc as any).lastAutoTable.finalY + 30,
      head: [['Customer', 'Total Paid', 'Frequency', 'Avg Payment', 'Preferred Method', 'Current Balance']],
      body: analysisData,
      theme: 'striped',
      ...pdfStyles
    });

    const filename = `payment-analysis-${new Date().toISOString().split('T')[0]}.pdf`;
    openPdfPreview(doc, 'Payment Analysis Report', filename);
  };

  return (
    <DashboardLayout>
      <div className="p-6 bg-gradient-to-br from-[#f6f1e3] to-[#ebe5d5] min-h-screen">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <p className="text-sm uppercase tracking-wide text-[#6b5c3b]">Analytics</p>
            <h1 className="text-3xl font-bold text-[#2f3e1e] drop-shadow-sm">Accounts Receivable Reports</h1>
          </div>
          <div className="flex items-center gap-2 text-[#6b5c3b] bg-white border border-[#e4d8c4] px-4 py-2 rounded-full shadow-sm">
            <i className="ri-bar-chart-grouped-line text-xl"></i>
            <span className="text-sm font-medium">Military Green dashboard</span>
          </div>
        </div>

        {/* Date Filter */}
        <div className="bg-gradient-to-br from-white to-[#faf9f5] rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-[#e8e0d0] p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-[#2f3e1e]">Date Filters</h3>
            <div className="text-sm text-[#6b5c3b] flex items-center gap-2">
              <i className="ri-time-line"></i>
              <span>Choose the analysis window</span>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#4a3c24] mb-2">Date From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full p-3 border border-[#d8cbb5] bg-[#fffdf6] rounded-lg focus:ring-2 focus:ring-[#6b5c3b] focus:border-[#6b5c3b]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#4a3c24] mb-2">Date To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full p-3 border border-[#d8cbb5] bg-[#fffdf6] rounded-lg focus:ring-2 focus:ring-[#6b5c3b] focus:border-[#6b5c3b]"
              />
            </div>
          </div>
        </div>

        {/* Reports Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Aging Report */}
          <div className="bg-gradient-to-br from-white to-[#faf9f5] p-6 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-[#e8e0d0] hover:shadow-[0_12px_40px_rgb(0,128,0,0.12)] hover:-translate-y-1 transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-[#2f3e1e]">Aging Analysis</h3>
                <p className="text-sm text-[#6b5c3b]">Track past-due balances by customer and bucket</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-[#f3ecda] text-[#2f3e1e] flex items-center justify-center">
                <i className="ri-calendar-schedule-line text-xl"></i>
              </div>
            </div>
            <button
              onClick={handleGenerateAgingReport}
              className="w-full bg-[#7a2e1b] text-white py-2.5 rounded-lg hover:bg-[#5c1f12] transition-colors shadow-sm"
            >
              <i className="ri-file-pdf-line mr-2"></i>Generate PDF
            </button>
          </div>

          {/* Statement Report */}
          <div className="bg-gradient-to-br from-white to-[#faf9f5] p-6 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-[#e8e0d0] hover:shadow-[0_12px_40px_rgb(0,128,0,0.12)] hover:-translate-y-1 transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-[#2f3e1e]">Account Statement</h3>
                <p className="text-sm text-[#6b5c3b]">Detailed movement per customer with invoices and payments</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-[#f3ecda] text-[#2f3e1e] flex items-center justify-center">
                <i className="ri-file-list-line text-xl"></i>
              </div>
            </div>
            <button
              onClick={handleGenerateStatementReport}
              className="w-full bg-[#2f3e1e] text-white py-2.5 rounded-lg hover:bg-[#1f2913] transition-colors shadow-sm"
            >
              <i className="ri-file-pdf-line mr-2"></i>Generate PDF
            </button>
          </div>

          {/* Collection Report */}
          <div className="bg-gradient-to-br from-white to-[#faf9f5] p-6 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-[#e8e0d0] hover:shadow-[0_12px_40px_rgb(0,128,0,0.12)] hover:-translate-y-1 transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-[#2f3e1e]">Collection Summary</h3>
                <p className="text-sm text-[#6b5c3b]">Payments by period and method to monitor inflows</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-[#f3ecda] text-[#2f3e1e] flex items-center justify-center">
                <i className="ri-money-dollar-circle-line text-xl"></i>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleGenerateCollectionReport}
                className="flex-1 bg-[#7a2e1b] text-white py-2.5 rounded-lg hover:bg-[#5c1f12] transition-colors shadow-sm"
              >
                <i className="ri-file-pdf-line mr-2"></i>PDF
              </button>
              <button
                onClick={handleGenerateCollectionExcel}
                className="flex-1 bg-[#2f3e1e] text-white py-2.5 rounded-lg hover:bg-[#1f2913] transition-colors shadow-sm"
              >
                <i className="ri-file-excel-line mr-2"></i>Excel
              </button>
            </div>
          </div>

          {/* Customer Balance Report */}
          <div className="bg-gradient-to-br from-white to-[#faf9f5] p-6 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-[#e8e0d0] hover:shadow-[0_12px_40px_rgb(0,128,0,0.12)] hover:-translate-y-1 transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-[#2f3e1e]">Customer Balances</h3>
                <p className="text-sm text-[#6b5c3b]">Current receivables vs. credit limits with utilization</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-[#f3ecda] text-[#2f3e1e] flex items-center justify-center">
                <i className="ri-user-line text-xl"></i>
              </div>
            </div>
            <button
              onClick={handleGenerateCustomerBalanceReport}
              className="w-full bg-[#2f3e1e] text-white py-2.5 rounded-lg hover:bg-[#1f2913] transition-colors shadow-sm"
            >
              <i className="ri-file-pdf-line mr-2"></i>Generate PDF
            </button>
          </div>

          {/* Overdue Report */}
          <div className="bg-gradient-to-br from-white to-[#faf9f5] p-6 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-[#e8e0d0] hover:shadow-[0_12px_40px_rgb(0,128,0,0.12)] hover:-translate-y-1 transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-[#2f3e1e]">Overdue Invoices</h3>
                <p className="text-sm text-[#6b5c3b]">Invoices past due grouped by days late and customer</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-[#f3ecda] text-[#2f3e1e] flex items-center justify-center">
                <i className="ri-alarm-warning-line text-xl"></i>
              </div>
            </div>
            <button
              onClick={handleGenerateOverdueReport}
              className="w-full bg-[#7a2e1b] text-white py-2.5 rounded-lg hover:bg-[#5c1f12] transition-colors shadow-sm"
            >
              <i className="ri-file-pdf-line mr-2"></i>Generate PDF
            </button>
          </div>

          {/* Payment Analysis */}
          <div className="bg-gradient-to-br from-white to-[#faf9f5] p-6 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-[#e8e0d0] hover:shadow-[0_12px_40px_rgb(0,128,0,0.12)] hover:-translate-y-1 transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-[#2f3e1e]">Payment Analysis</h3>
                <p className="text-sm text-[#6b5c3b]">Statistical trends for payment frequency and methods</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-[#f3ecda] text-[#2f3e1e] flex items-center justify-center">
                <i className="ri-bar-chart-line text-xl"></i>
              </div>
            </div>
            <button
              onClick={handleGeneratePaymentAnalysisReport}
              className="w-full bg-[#2f3e1e] text-white py-2.5 rounded-lg hover:bg-[#1f2913] transition-colors shadow-sm"
            >
              <i className="ri-file-pdf-line mr-2"></i>Generate PDF
            </button>
          </div>
        </div>
      </div>

      {showReportPreviewModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={handleCloseReportPreview}
        >
          <div
            className="bg-white rounded-2xl p-6 w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col border border-[#e4d8c4]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <div className="min-w-0">
                <h3 className="text-xl font-semibold text-[#2f3e1e] truncate">{reportPreviewTitle}</h3>
                {reportPreviewFilename ? (
                  <p className="text-sm text-[#6b5c3b] truncate">{reportPreviewFilename}</p>
                ) : null}
              </div>
              <button
                onClick={handleCloseReportPreview}
                className="text-[#6b5c3b] hover:text-[#2f3e1e] transition-colors"
              >
                <i className="ri-close-line text-2xl"></i>
              </button>
            </div>

            <div className="flex-1 overflow-auto border border-[#e4d8c4] rounded-xl bg-white">
              {reportPreviewType === 'pdf' ? (
                reportPreviewUrl ? (
                  <iframe
                    src={reportPreviewUrl}
                    title={reportPreviewTitle}
                    className="w-full h-[70vh]"
                  />
                ) : (
                  <div className="p-6 text-[#6b5c3b]">No preview available.</div>
                )
              ) : (
                <div className="p-4 space-y-4">
                  {reportPreviewSummary.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {reportPreviewSummary.map((item, idx) => (
                        <div key={idx} className="bg-[#f3ecda] border border-[#e4d8c4] rounded-xl p-3">
                          <div className="text-xs text-[#6b5c3b] uppercase tracking-wide">{item.label}</div>
                          <div className="text-sm font-semibold text-[#2f3e1e]">{item.value}</div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="border border-[#e4d8c4] rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-[#e4d8c4]">
                        <thead className="bg-[#f7f3e8] sticky top-0">
                          <tr>
                            {reportPreviewHeaders.map((header, idx) => (
                              <th
                                key={idx}
                                className="px-4 py-2 text-left text-xs font-semibold text-[#6b5c3b] uppercase whitespace-nowrap"
                              >
                                {header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-[#f3ecda]">
                          {reportPreviewRows.map((row, rowIdx) => (
                            <tr key={rowIdx} className="hover:bg-[#fffdf6]">
                              {row.map((cell, cellIdx) => (
                                <td
                                  key={cellIdx}
                                  className="px-4 py-2 text-sm text-[#2f3e1e] whitespace-nowrap"
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
              )}
            </div>

            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={handleCloseReportPreview}
                className="bg-[#f3ecda] text-[#6b5c3b] px-4 py-2 rounded-lg hover:bg-[#e6ddc4] transition-colors"
              >
                Close
              </button>
              <button
                onClick={handleDownloadReportPreview}
                disabled={!reportPreviewBlob || !reportPreviewFilename}
                className="bg-[#2f3e1e] text-white px-4 py-2 rounded-lg hover:bg-[#1f2913] transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                Download
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
