import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import QRCode from 'qrcode';
import { useAuth } from '../../../hooks/useAuth';
import { customersService, invoicesService, customerAdvancesService, bankAccountsService, settingsService } from '../../../services/database';
import { exportToExcelWithHeaders, addPdfBrandedHeader, getPdfTableStyles } from '../../../utils/exportImportUtils';
import { formatMoney } from '../../../utils/numberFormat';
import InvoiceTypeModal from '../../../components/common/InvoiceTypeModal';
import { printInvoice, type InvoiceTemplateType } from '../../../utils/invoicePrintTemplates';

interface Advance {
  id: string;
  advanceNumber: string;
  customerId: string;
  customerName: string;
  date: string;
  amount: number;
  appliedAmount: number;
  balance: number;
  paymentMethod: 'cash' | 'check' | 'transfer' | 'card';
  reference: string;
  concept: string;
  status: 'pending' | 'applied' | 'partial' | 'cancelled';
  appliedInvoices: string[];
}

interface CustomerOption {
  id: string;
  name: string;
  document?: string;
  phone?: string;
  email?: string;
  address?: string;
}

interface BankAccountOption {
  id: string;
  name: string;
  chartAccountId: string | null;
}

export default function AdvancesPage() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [showAdvanceDetails, setShowAdvanceDetails] = useState(false);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [selectedAdvance, setSelectedAdvance] = useState<Advance | null>(null);
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [loadingAdvances, setLoadingAdvances] = useState(false);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [invoices, setInvoices] = useState<
    Array<{ id: string; invoiceNumber: string; totalAmount: number; paidAmount: number; customerId: string }>
  >([]);
  const [loadingSupport, setLoadingSupport] = useState(false);
  const [bankAccounts, setBankAccounts] = useState<BankAccountOption[]>([]);
  const [customerAdvanceAccounts, setCustomerAdvanceAccounts] = useState<Record<string, string>>({});
  const [customerArAccounts, setCustomerArAccounts] = useState<Record<string, string>>({});
  const [showPrintTypeModal, setShowPrintTypeModal] = useState(false);
  const [advanceToPrint, setAdvanceToPrint] = useState<Advance | null>(null);

  const getPaymentMethodName = (method: string) => {
    switch (method) {
      case 'cash': return 'Cash';
      case 'check': return 'Check';
      case 'transfer': return 'Bank Transfer';
      case 'card': return 'Card';
      default: return 'Other';
    }
  };

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
      case 'pending': return 'Pending';
      case 'applied': return 'Applied';
      case 'partial': return 'Partial';
      case 'cancelled': return 'Cancelled';
      default: return 'Unknown';
    }
  };

  const filteredAdvances = advances.filter(advance => {
    const matchesSearch = advance.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         advance.advanceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         advance.reference.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || advance.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId) || null;

  const loadSupportData = async () => {
    if (!user?.id) return;
    setLoadingSupport(true);
    try {
      const [custList, invList, bankList] = await Promise.all([
        customersService.getAll(user.id),
        invoicesService.getAll(user.id),
        bankAccountsService.getAll(user.id),
      ]);
      setCustomers(
        (custList || []).map((c: any) => ({
          id: String(c.id),
          name: c.name || c.customer_name || 'Cliente',
          document: c.document || c.tax_id || '',
          phone: c.phone || c.contact_phone || '',
          email: c.email || c.contact_email || '',
          address: c.address || '',
        })),
      );

      setInvoices(
        (invList as any[]).map((inv) => ({
          id: String(inv.id),
          invoiceNumber: inv.invoice_number as string,
          totalAmount: Number(inv.total_amount) || 0,
          paidAmount: Number(inv.paid_amount) || 0,
          customerId: String(inv.customer_id),
        }))
      );

      // Mapa de cuentas de anticipos por cliente
      const advMap: Record<string, string> = {};
      (custList || []).forEach((c: any) => {
        if (c.id && c.advanceAccountId) {
          advMap[String(c.id)] = String(c.advanceAccountId);
        }
      });
      setCustomerAdvanceAccounts(advMap);

      // Mapa de cuentas de CxC por cliente (para cruces de anticipos vs facturas)
      const arMap: Record<string, string> = {};
      (custList || []).forEach((c: any) => {
        if (c.id && c.arAccountId) {
          arMap[String(c.id)] = String(c.arAccountId);
        }
      });
      setCustomerArAccounts(arMap);

      // Cuentas bancarias para poder generar asientos Banco vs Anticipos
      const mappedBanks: BankAccountOption[] = (bankList || []).map((ba: any) => ({
        id: String(ba.id),
        name: `${ba.bank_name} - ${ba.account_number}`,
        chartAccountId: ba.chart_account_id ? String(ba.chart_account_id) : null,
      }));
      setBankAccounts(mappedBanks);
    } finally {
      setLoadingSupport(false);
    }
  };

  const loadAdvances = async () => {
    if (!user?.id) return;
    setLoadingAdvances(true);
    try {
      const data = await customerAdvancesService.getAll(user.id);
      const mapped: Advance[] = (data as any[]).map((a) => {
        const amount = Number(a.amount) || 0;
        const appliedAmount = Number(a.applied_amount) || 0;
        const balance = Number.isFinite(Number(a.balance_amount))
          ? Number(a.balance_amount)
          : amount - appliedAmount;
        const rawStatus = (a.status as string) || 'pending';
        const status: Advance['status'] = (['pending', 'applied', 'partial', 'cancelled'] as const).includes(
          rawStatus as any
        )
          ? (rawStatus as Advance['status'])
          : 'pending';

        let finalApplied = appliedAmount;
        let finalBalance = balance;
        if (status === 'cancelled') {
          finalApplied = 0;
          finalBalance = 0;
        }

        return {
          id: String(a.id),
          advanceNumber: a.advance_number as string,
          customerId: String(a.customer_id),
          customerName: (a.customers as any)?.name || 'Cliente',
          date: a.advance_date as string,
          amount,
          appliedAmount: finalApplied,
          balance: finalBalance,
          paymentMethod: (a.payment_method as any) || 'cash',
          reference: (a.reference as string) || '',
          concept: (a.concept as string) || '',
          status,
          appliedInvoices: [],
        };
      });
      setAdvances(mapped);
    } finally {
      setLoadingAdvances(false);
    }
  };

  useEffect(() => {
    loadSupportData();
    loadAdvances();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const exportToPDF = async () => {
    const doc = new jsPDF();
    const pdfStyles = getPdfTableStyles();

    // Add branded header with logo
    const startY = await addPdfBrandedHeader(doc, 'Customer Advances Report', {
      subtitle: `Status: ${statusFilter === 'all' ? 'All' : getStatusName(statusFilter)}`
    });
    
    // Summary Stats
    const activeAdvances = filteredAdvances.filter(a => a.status !== 'cancelled');
    const totalAmount = activeAdvances.reduce((sum, advance) => sum + advance.amount, 0);
    const totalApplied = activeAdvances.reduce((sum, advance) => sum + advance.appliedAmount, 0);
    const totalBalance = activeAdvances.reduce((sum, advance) => sum + advance.balance, 0);
    const pendingAdvances = activeAdvances.filter(a => a.status === 'pending').length;
    
    doc.setFontSize(12);
    doc.setTextColor(51, 51, 51);
    doc.text('Advance Summary', 20, startY);
    
    const summaryData = [
      ['Metric', 'Value'],
      ['Total Advances', `${formatMoney(totalAmount, '')}`],
      ['Applied Amount', `${formatMoney(totalApplied, '')}`],
      ['Outstanding Balance', `${formatMoney(totalBalance, '')}`],
      ['Pending Advances', pendingAdvances.toString()],
      ['Active Advances', activeAdvances.length.toString()]
    ];
    
    (doc as any).autoTable({
      startY: startY + 5,
      head: [summaryData[0]],
      body: summaryData.slice(1),
      theme: 'grid',
      ...pdfStyles
    });
    
    // Advances table
    doc.setFontSize(14);
    doc.text('Advance Details', 20, (doc as any).lastAutoTable.finalY + 20);
    
    const advanceData = activeAdvances.map(advance => [
      advance.advanceNumber,
      advance.customerName,
      advance.date,
      `${formatMoney(advance.amount, '')}`,
      `${formatMoney(advance.appliedAmount, '')}`,
      `${formatMoney(advance.balance, '')}`,
      getStatusName(advance.status)
    ]);
    
    (doc as any).autoTable({
      startY: (doc as any).lastAutoTable.finalY + 30,
      head: [['Advance', 'Customer', 'Date', 'Amount', 'Applied', 'Balance', 'Status']],
      body: advanceData,
      theme: 'striped',
      headStyles: { fillColor: [0, 128, 0] },
      styles: { fontSize: 8 }
    });
    
    doc.save(`anticipos-clientes-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const exportToExcel = async () => {
    const activeAdvances: Advance[] = filteredAdvances.filter(a => a.status !== 'cancelled');

    if (!activeAdvances.length) {
      alert('There are no advances to export with the current filters.');
      return;
    }

    let companyName = '';
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
      console.error('Error obteniendo información de la empresa para Excel de anticipos:', error);
    }

    const rows = activeAdvances.map((advance) => ({
      advanceNumber: advance.advanceNumber,
      customerName: advance.customerName,
      date: advance.date,
      amount: formatMoney(advance.amount, ''),
      appliedAmount: formatMoney(advance.appliedAmount, ''),
      balance: formatMoney(advance.balance, ''),
      status: getStatusName(advance.status),
    }));

    const todayIso = new Date().toISOString().split('T')[0];
    const todayLocal = new Date().toLocaleDateString();

    const headers = [
      { key: 'advanceNumber', title: 'Advance' },
      { key: 'customerName', title: 'Customer' },
      { key: 'date', title: 'Date' },
      { key: 'amount', title: 'Amount' },
      { key: 'appliedAmount', title: 'Applied' },
      { key: 'balance', title: 'Balance' },
      { key: 'status', title: 'Status' },
    ];

    exportToExcelWithHeaders(
      rows,
      headers,
      `anticipos-clientes-${todayIso}`,
      'Anticipos',
      [18, 28, 14, 16, 16, 16, 16],
      {
        title: `Customer Advances - ${todayLocal}`,
        companyName,
      },
    );
  };

  const handleNewAdvance = () => {
    setSelectedAdvance(null);
    setSelectedCustomerId('');
    setShowAdvanceModal(true);
  };

  const handleViewAdvance = (advance: Advance) => {
    setSelectedAdvance(advance);
    setShowAdvanceDetails(true);
  };

  const handlePrintAdvance = (advance: Advance) => {
    setAdvanceToPrint(advance);
    setShowPrintTypeModal(true);
  };

  const handlePrintTypeSelect = async (type: InvoiceTemplateType) => {
    if (!advanceToPrint) return;
    const customer = customers.find((c) => c.id === advanceToPrint.customerId);
    let companyInfo: any = {};
    try { companyInfo = await settingsService.getCompanyInfo() || {}; } catch { /* ignore */ }

    const advanceData = {
      invoiceNumber: advanceToPrint.advanceNumber,
      date: advanceToPrint.date,
      dueDate: advanceToPrint.date,
      amount: advanceToPrint.amount,
      subtotal: advanceToPrint.amount,
      tax: 0,
      items: [{ description: `${advanceToPrint.concept || 'Customer Advance'} - ${getPaymentMethodName(advanceToPrint.paymentMethod)}`, quantity: 1, price: advanceToPrint.amount, total: advanceToPrint.amount }],
    };
    const customerData = {
      name: advanceToPrint.customerName || customer?.name || 'Customer',
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

    printInvoice(advanceData, customerData, companyData, type);
    setAdvanceToPrint(null);
  };

  const handlePrintAdvanceLegacy = async (advance: Advance) => {
    let companyName = '';
    let companyRnc = '';
    let companyPhone = '';
    let companyEmail = '';
    let companyAddress = '';
    try {
      const info = await settingsService.getCompanyInfo();
      if (info) {
        companyName = (info as any).name || (info as any).company_name || '';
        companyRnc = (info as any).rnc || (info as any).ruc || (info as any).tax_id || '';
        companyPhone = (info as any).phone || '';
        companyEmail = (info as any).email || '';
        companyAddress = (info as any).address || '';
      }
    } catch { /* usar defaults */ }

    const customer = customers.find((c) => c.id === advance.customerId);
    const customerName = customer?.name || advance.customerName;
    const customerDoc = customer?.document || '';
    const customerPhone = customer?.phone || '';
    const customerEmail = customer?.email || '';
    const customerAddress = customer?.address || '';

    let qrDataUrl = '';
    try {
      const qrUrl = `${window.location.origin}/document/advance/${encodeURIComponent(advance.id)}`;
      qrDataUrl = await QRCode.toDataURL(qrUrl, { errorCorrectionLevel: 'M', margin: 1, width: 160 });
    } catch { qrDataUrl = ''; }

    const printWindow = window.open('', '_blank');
    if (!printWindow) { alert('No se pudo abrir la ventana de impresión'); return; }

    const html = `
      <html>
        <head>
          <title>Anticipo ${advance.advanceNumber}</title>
          <style>
            :root { --primary:#0b2a6f; --accent:#19a34a; --text:#111827; --muted:#6b7280; --border:#e5e7eb; --bg:#ffffff; }
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; padding: 28px; color: var(--text); background: var(--bg); }
            .top { display:grid; grid-template-columns: 1.1fr 0.9fr; gap: 20px; align-items: start; }
            .company-name { font-weight: 800; font-size: 18px; color: var(--primary); }
            .company-meta { font-size: 12px; color: var(--muted); line-height: 1.35; }
            .doc { text-align: right; }
            .doc-title { font-size: 44px; font-weight: 800; color: #9ca3af; letter-spacing: 1px; line-height: 1; }
            .doc-number { margin-top: 6px; font-size: 22px; font-weight: 800; color: var(--accent); }
            .doc-kv { margin-top: 10px; font-size: 12px; color: var(--muted); line-height: 1.45; }
            .qr { margin-top: 10px; width: 110px; height: 110px; }
            .grid { display:grid; grid-template-columns: 1.1fr 0.9fr; gap: 20px; margin-top: 16px; }
            .card { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: #fff; }
            .card-head { background: var(--primary); padding: 10px 12px; color: #fff; font-weight: 800; font-size: 13px; }
            .card-body { padding: 12px; font-size: 12px; }
            .kv { display:grid; grid-template-columns: 140px 1fr; gap: 6px 10px; }
            .kv .k { color: var(--muted); }
            .kv .v { color: var(--text); font-weight: 600; }
            .totals { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
            .totals-head { background: var(--primary); color: #fff; padding: 10px 12px; font-weight: 800; font-size: 13px; }
            .totals-body { padding: 12px; }
            .totals-row { display:grid; grid-template-columns: 1fr auto; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 12px; }
            .totals-row:last-child { border-bottom: none; }
            .totals-row .label { color: var(--muted); font-weight: 700; }
            .totals-row .value { font-weight: 800; color: var(--text); }
            .totals-row.total .value { color: var(--primary); }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="top">
            <div>
              <div class="company-name">${companyName}</div>
              ${companyRnc ? `<div class="company-meta">RNC: ${companyRnc}</div>` : ''}
              ${companyPhone ? `<div class="company-meta">Tel: ${companyPhone}</div>` : ''}
              ${companyEmail ? `<div class="company-meta">Email: ${companyEmail}</div>` : ''}
              ${companyAddress ? `<div class="company-meta">Dirección: ${companyAddress}</div>` : ''}
            </div>
            <div class="doc">
              <div class="doc-title">ANTICIPO</div>
              <div class="doc-number">#${advance.advanceNumber}</div>
              <div class="doc-kv">
                <div><strong>Fecha:</strong> ${advance.date ? new Date(advance.date).toLocaleDateString('es-DO') : ''}</div>
                <div><strong>Método:</strong> ${getPaymentMethodName(advance.paymentMethod)}</div>
                <div><strong>Estado:</strong> ${getStatusName(advance.status)}</div>
                ${advance.reference ? `<div><strong>Referencia:</strong> ${advance.reference}</div>` : ''}
              </div>
              ${qrDataUrl ? `<img class="qr" alt="QR" src="${qrDataUrl}" />` : ''}
            </div>
          </div>

          <div class="grid">
            <div class="card">
              <div class="card-head">Cliente</div>
              <div class="card-body">
                <div class="kv">
                  <div class="k">Nombre</div>
                  <div class="v">${customerName}</div>
                  ${customerDoc ? `<div class="k">RNC/Cédula</div><div class="v">${customerDoc}</div>` : ''}
                  ${customerPhone ? `<div class="k">Teléfono</div><div class="v">${customerPhone}</div>` : ''}
                  ${customerEmail ? `<div class="k">Email</div><div class="v">${customerEmail}</div>` : ''}
                  ${customerAddress ? `<div class="k">Dirección</div><div class="v">${customerAddress}</div>` : ''}
                </div>
              </div>
            </div>
            <div class="totals">
              <div class="totals-head">Resumen</div>
              <div class="totals-body">
                <div class="totals-row"><div class="label">Monto</div><div class="value"> ${formatMoney(advance.amount, '')}</div></div>
                <div class="totals-row"><div class="label">Aplicado</div><div class="value"> ${formatMoney(advance.appliedAmount, '')}</div></div>
                <div class="totals-row total"><div class="label">Balance</div><div class="value"> ${formatMoney(advance.balance, '')}</div></div>
              </div>
            </div>
          </div>

          ${advance.concept ? `
          <div style="margin-top: 16px; padding: 12px; border: 1px solid var(--border); border-radius: 12px;">
            <div style="font-weight: 700; color: var(--muted); margin-bottom: 6px;">Concepto</div>
            <div style="font-size: 12px;">${advance.concept}</div>
          </div>
          ` : ''}

          <script>
            window.onload = function() { window.print(); setTimeout(() => window.close(), 1000); };
          <\/script>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handleApplyAdvance = (advance: Advance) => {
    setSelectedAdvance(advance);
    setShowApplyModal(true);
  };

  const handleCancelAdvance = async (advanceId: string) => {
    if (!user?.id) {
      alert('Debes iniciar sesión para cancelar anticipos');
      return;
    }
    if (!confirm('¿Está seguro de que desea cancelar este anticipo?')) return;
    try {
      await customerAdvancesService.updateStatus(advanceId, 'cancelled', {
        appliedAmount: 0,
        balanceAmount: 0,
      });
      await loadAdvances();
      alert('Anticipo cancelado exitosamente');
    } catch (error: any) {
      console.error('[Advances] Error al cancelar anticipo', error);
      alert(`Error al cancelar el anticipo: ${error?.message || 'revisa la consola para más detalles'}`);
    }
  };

  const handleSaveAdvance = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user?.id) {
      alert('Debes iniciar sesión para crear anticipos');
      return;
    }

    const formData = new FormData(e.currentTarget);
    const customerId = String(formData.get('customer_id') || '');
    const date = String(formData.get('date') || '');
    const amount = Number(formData.get('amount') || 0);
    const paymentMethod = String(formData.get('payment_method') || '') as 'cash' | 'check' | 'transfer' | 'card';
    const reference = String(formData.get('reference') || '');
    const concept = String(formData.get('concept') || '');
    const bankAccountId = String(formData.get('bank_account_id') || '');

    if (!customerId || !amount || !paymentMethod) {
      alert('Cliente, monto y método de pago son obligatorios');
      return;
    }

    if (paymentMethod !== 'cash' && !bankAccountId) {
      alert('Debe seleccionar una cuenta de banco para este método de pago');
      return;
    }

    const advanceNumber = `ANT-${Date.now()}`;
    const advanceDate = date || new Date().toISOString().slice(0, 10);

    const payload = {
      customer_id: customerId,
      advance_number: advanceNumber,
      advance_date: advanceDate,
      amount,
      payment_method: paymentMethod,
      reference,
      concept,
      applied_amount: 0,
      balance_amount: amount,
      status: 'pending',
    };

    try {
      await customerAdvancesService.create(user.id, payload);

      await loadAdvances();
      alert('Anticipo creado exitosamente');
      setShowAdvanceModal(false);
    } catch (error: any) {
      console.error('[Advances] Error al crear anticipo', error);
      alert(`Error al crear el anticipo: ${error?.message || 'revisa la consola para más detalles'}`);
    }
  };

  const handleSaveApplication = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user?.id || !selectedAdvance) {
      alert('Debes iniciar sesión y seleccionar un anticipo válido');
      return;
    }

    const formData = new FormData(e.currentTarget);
    const invoiceId = String(formData.get('invoice_id') || '');
    const amountToApply = Number(formData.get('amount_to_apply') || 0);

    if (!invoiceId) {
      alert('Debes seleccionar una factura para aplicar el anticipo');
      return;
    }

    if (!amountToApply || amountToApply <= 0) {
      alert('El monto a aplicar debe ser mayor que 0');
      return;
    }

    if (amountToApply > selectedAdvance.balance) {
      alert('El monto a aplicar no puede ser mayor que el saldo disponible del anticipo');
      return;
    }

    const newApplied = selectedAdvance.appliedAmount + amountToApply;
    const newBalance = selectedAdvance.balance - amountToApply;
    const newStatus: Advance['status'] = newBalance > 0 ? 'partial' : 'applied';

    const targetInvoice = invoices.find((inv) => inv.id === invoiceId);
    if (!targetInvoice) {
      alert('La factura seleccionada no es válida');
      return;
    }

    if (targetInvoice.customerId !== selectedAdvance.customerId) {
      alert('La factura seleccionada no pertenece al mismo cliente del anticipo');
      return;
    }

    const invoiceBalanceBefore = targetInvoice.totalAmount - targetInvoice.paidAmount;
    if (amountToApply > invoiceBalanceBefore) {
      alert('El monto a aplicar no puede ser mayor que el saldo pendiente de la factura');
      return;
    }

    const newInvoicePaid = targetInvoice.paidAmount + amountToApply;
    const invoiceBalanceAfter = targetInvoice.totalAmount - newInvoicePaid;
    const newInvoiceStatus: 'pending' | 'partial' | 'paid' = invoiceBalanceAfter > 0 ? (newInvoicePaid > 0 ? 'partial' : 'pending') : 'paid';

    try {
      await invoicesService.updatePayment(invoiceId, newInvoicePaid, newInvoiceStatus);

      await customerAdvancesService.updateStatus(selectedAdvance.id, newStatus, {
        appliedAmount: newApplied,
        balanceAmount: newBalance,
      });

      await loadAdvances();
      alert('Anticipo aplicado exitosamente');
      setShowApplyModal(false);
      setSelectedAdvance(null);
    } catch (error: any) {
      console.error('[Advances] Error al aplicar anticipo', error);
      alert(`Error al aplicar el anticipo: ${error?.message || 'revisa la consola para más detalles'}`);
    }
  };

  return (
    <DashboardLayout>
      <div className="min-h-screen p-6 bg-gradient-to-br from-[#f6f1e3] to-[#ebe5d5]">

        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#2f3e1e] drop-shadow-sm">Customer Advances</h1>
            <nav className="flex space-x-2 text-sm text-[#6b5c3b] mt-2">
              <Link to="/accounts-receivable" className="hover:text-[#2f3e1e]">Accounts Receivable</Link>
              <span>/</span>
              <span>Advances</span>
            </nav>
          </div>
          <button 
            onClick={handleNewAdvance}
            className="bg-[#2f3e1e] text-white px-4 py-2 rounded-lg hover:bg-[#1f2913] transition-colors whitespace-nowrap shadow-sm"
          >
            <i className="ri-add-line mr-2"></i>
            New Advance
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <div className="bg-gradient-to-br from-white to-[#faf9f5] p-6 rounded-2xl border border-[#e8e0d0] shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:shadow-[0_12px_40px_rgb(0,128,0,0.15)] hover:-translate-y-1 transition-all duration-300 cursor-pointer">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#6b5c3b]">Total Advances</p>
                <p className="text-2xl font-semibold text-[#2f3e1e]">
                  {formatMoney(filteredAdvances.reduce((sum, a) => sum + a.amount, 0), '')}
                </p>
              </div>
              <div className="w-12 h-12 bg-[#f3ecda] rounded-xl flex items-center justify-center text-[#2f3e1e]">
                <i className="ri-money-dollar-circle-line text-2xl"></i>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-white to-[#faf9f5] p-6 rounded-2xl border border-[#e8e0d0] shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:shadow-[0_12px_40px_rgb(0,128,0,0.15)] hover:-translate-y-1 transition-all duration-300 cursor-pointer">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#6b5c3b]">Available Balance</p>
                <p className="text-2xl font-semibold text-[#1f2913]">
                  {formatMoney(filteredAdvances.reduce((sum, a) => sum + a.balance, 0), '')}
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
                  {formatMoney(filteredAdvances.reduce((sum, a) => sum + a.appliedAmount, 0), '')}
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
                <p className="text-sm font-medium text-[#6b5c3b]">Pending Advances</p>
                <p className="text-2xl font-semibold text-[#bc6c2b]">
                  {filteredAdvances.filter(a => a.status === 'pending').length}
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
                placeholder="Search by customer, advance number, or reference..."
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

        {/* Advances Table */}
        <div className="bg-gradient-to-br from-white to-[#faf9f5] rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-[#e8e0d0]">
          {(loadingAdvances || loadingSupport) && (
            <div className="px-6 pt-3 text-sm text-gray-500">Loading data...</div>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gradient-to-r from-[#f8f6f0] to-[#f0ece0]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Advance
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
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>

                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredAdvances.map((advance) => (
                  <tr key={advance.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {advance.advanceNumber}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {advance.customerName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {advance.date}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {formatMoney(advance.amount, '')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatMoney(advance.appliedAmount, '')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">
                      {formatMoney(advance.balance, '')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(advance.status)}`}>
                        {getStatusName(advance.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleViewAdvance(advance)}
                          className="text-[#2f3e1e] hover:text-[#1f2913]"
                          title="View details"
                        >
                          <i className="ri-eye-line"></i>
                        </button>
                        <button
                          onClick={() => handlePrintAdvance(advance)}
                          className="text-[#4a3c24] hover:text-[#2f2112]"
                          title="Print advance"
                        >
                          <i className="ri-printer-line"></i>
                        </button>
                        {advance.balance > 0 && advance.status !== 'cancelled' && (
                          <button
                            onClick={() => handleApplyAdvance(advance)}
                            className="text-[#3b5c2e] hover:text-[#2a3f20]"
                            title="Apply advance"
                          >
                            <i className="ri-check-line"></i>
                          </button>
                        )}
                        {advance.status === 'pending' && (
                          <button
                            onClick={() => handleCancelAdvance(advance.id)}
                            className="text-[#7a2e1b] hover:text-[#5c1f12]"
                            title="Cancel advance"
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

        {/* New Advance Modal */}
        {showAdvanceModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-[#2f3e1e]">New Customer Advance</h3>
                <button
                  onClick={() => setShowAdvanceModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line"></i>
                </button>
              </div>
              
              <form onSubmit={handleSaveAdvance} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#4a3c24] mb-2">
                      Customer
                    </label>
                    <select 
                      required
                      name="customer_id"
                      value={selectedCustomerId}
                      onChange={(e) => setSelectedCustomerId(e.target.value)}
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
                      type="text"
                      required
                      name="date"
                      defaultValue={new Date().toISOString().split('T')[0]}
                      className="w-full p-3 border border-[#d8cbb5] bg-white rounded-lg focus:ring-2 focus:ring-[#6b5c3b] focus:border-[#6b5c3b]"
                    />
                  </div>
                </div>
                
                {selectedCustomer && (
                  <div className="mt-2 p-4 bg-[#f7f3e8] rounded-lg border border-[#d8cbb5]">
                    <p className="text-sm font-medium text-[#4a3c24] mb-1">Customer details</p>
                    {selectedCustomer.document && (
                      <p className="text-sm text-[#6b5c3b]">
                        <span className="font-semibold">Document: </span>
                        {selectedCustomer.document}
                      </p>
                    )}
                    {selectedCustomer.phone && (
                      <p className="text-sm text-[#6b5c3b]">
                        <span className="font-semibold">Phone: </span>
                        {selectedCustomer.phone}
                      </p>
                    )}
                    {selectedCustomer.email && (
                      <p className="text-sm text-[#6b5c3b]">
                        <span className="font-semibold">Email: </span>
                        {selectedCustomer.email}
                      </p>
                    )}
                    {selectedCustomer.address && (
                      <p className="text-sm text-[#6b5c3b]">
                        <span className="font-semibold">Address: </span>
                        {selectedCustomer.address}
                      </p>
                    )}
                  </div>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#4a3c24] mb-2">
                      Advance amount
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
                      Payment method
                    </label>
                    <select 
                      required
                      name="payment_method"
                      className="w-full p-3 border border-[#d8cbb5] bg-[#fffdf6] rounded-lg focus:ring-2 focus:ring-[#6b5c3b] focus:border-[#6b5c3b] pr-8"
                    >
                      <option value="cash">Cash</option>
                      <option value="check">Check</option>
                      <option value="transfer">Bank transfer</option>
                      <option value="card">Card</option>
                    </select>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-[#4a3c24] mb-2">
                    Bank account
                  </label>
                  <select
                    name="bank_account_id"
                    className="w-full p-3 border border-[#d8cbb5] bg-[#fffdf6] rounded-lg focus:ring-2 focus:ring-[#6b5c3b] focus:border-[#6b5c3b] pr-8"
                  >
                    <option value="">
                      Select an account (required for Check, Transfer, or Card)
                    </option>
                    {bankAccounts.map((ba) => (
                      <option key={ba.id} value={ba.id}>
                        {ba.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-[#6b5c3b]">
                    If the payment method is Cash, leave this blank and the default Cash account from Accounting Settings will be used.
                  </p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-[#4a3c24] mb-2">
                    Reference
                  </label>
                  <input
                    type="text"
                    required
                    name="reference"
                    className="w-full p-3 border border-[#d8cbb5] bg-white rounded-lg focus:ring-2 focus:ring-[#6b5c3b] focus:border-[#6b5c3b]"
                    placeholder="Payment reference number"
                  />
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
                    placeholder="Describe the received advance..."
                  />
                </div>
                
                <div className="flex space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowAdvanceModal(false)}
                    className="flex-1 bg-[#f3ecda] text-[#6b5c3b] py-2 rounded-lg hover:bg-[#e6ddc4] transition-colors whitespace-nowrap"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-[#2f3e1e] text-white py-2 rounded-lg hover:bg-[#1f2913] transition-colors whitespace-nowrap"
                  >
                    Create Advance
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Apply Advance Modal */}
        {showApplyModal && selectedAdvance && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-[#2f3e1e]">Apply Advance</h3>
                <button
                  onClick={() => {
                    setShowApplyModal(false);
                    setSelectedAdvance(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line"></i>
                </button>
              </div>
              
              <div className="mb-4 p-4 bg-[#f7f3e8] rounded-lg border border-[#d8cbb5]">
                <p className="text-sm text-[#4a3c24]">
                  Advance: <span className="font-medium text-[#2f3e1e]">{selectedAdvance.advanceNumber}</span>
                </p>
                <p className="text-sm text-[#4a3c24]">
                  Customer: <span className="font-medium text-[#2f3e1e]">{selectedAdvance.customerName}</span>
                </p>
                <p className="text-lg font-semibold text-[#1f2913]">
                  Available balance: {formatMoney(selectedAdvance.balance, '')}
                </p>
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
                      .filter(
                        (inv) =>
                          inv.customerId === selectedAdvance.customerId &&
                          inv.totalAmount > inv.paidAmount,
                      )
                      .map((inv) => (
                        <option key={inv.id} value={inv.id}>
                          {inv.invoiceNumber} - {formatMoney(inv.totalAmount, '')}
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
                    max={selectedAdvance.balance}
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
                    placeholder="Observations about this application..."
                  />
                </div>
                
                <div className="flex space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowApplyModal(false);
                      setSelectedAdvance(null);
                    }}
                    className="flex-1 bg-[#f3ecda] text-[#6b5c3b] py-2 rounded-lg hover:bg-[#e6ddc4] transition-colors whitespace-nowrap"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-[#2f3e1e] text-white py-2 rounded-lg hover:bg-[#1f2913] transition-colors whitespace-nowrap"
                  >
                    Apply Advance
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Advance Details Modal */}
        {showAdvanceDetails && selectedAdvance && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold">Detalles del Anticipo</h3>
                <button
                  onClick={() => {
                    setShowAdvanceDetails(false);
                    setSelectedAdvance(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line"></i>
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-500">Número de Anticipo</label>
                    <p className="text-lg font-semibold text-gray-900">{selectedAdvance.advanceNumber}</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-500">Cliente</label>
                    <p className="text-gray-900">{selectedAdvance.customerName}</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-500">Fecha</label>
                    <p className="text-gray-900">{selectedAdvance.date}</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-500">Monto Original</label>
                    <p className="text-2xl font-bold text-blue-600">{formatMoney(selectedAdvance.amount, '')}</p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-500">Método de Pago</label>
                    <p className="text-gray-900">{getPaymentMethodName(selectedAdvance.paymentMethod)}</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-500">Referencia</label>
                    <p className="text-gray-900">{selectedAdvance.reference}</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-500">Monto Aplicado</label>
                    <p className="text-lg font-semibold text-purple-600">{formatMoney(selectedAdvance.appliedAmount, '')}</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-500">Saldo Disponible</label>
                    <p className="text-2xl font-bold text-green-600">{formatMoney(selectedAdvance.balance, '')}</p>
                  </div>
                </div>
              </div>
              
              <div className="mt-6">
                <label className="block text-sm font-medium text-gray-500">Estado</label>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(selectedAdvance.status)} mt-1`}>
                  {getStatusName(selectedAdvance.status)}
                </span>
              </div>
              
              <div className="mt-6">
                <label className="block text-sm font-medium text-gray-500">Concepto</label>
                <p className="text-gray-900 mt-1">{selectedAdvance.concept}</p>
              </div>
              
              {selectedAdvance.appliedInvoices.length > 0 && (
                <div className="mt-6">
                  <label className="block text-sm font-medium text-gray-500">Facturas Aplicadas</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {selectedAdvance.appliedInvoices.map((invoice, index) => (
                      <span key={index} className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm">
                        {invoice}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="flex space-x-3 mt-6">
                {selectedAdvance.balance > 0 && selectedAdvance.status !== 'cancelled' && (
                  <button
                    onClick={() => {
                      setShowAdvanceDetails(false);
                      setShowApplyModal(true);
                    }}
                    className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap"
                  >
                    <i className="ri-check-line mr-2"></i>
                    Aplicar Anticipo
                  </button>
                )}
                {selectedAdvance.status === 'pending' && (
                  <button
                    onClick={() => handleCancelAdvance(selectedAdvance.id)}
                    className="flex-1 bg-red-600 text-white py-2 rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap"
                  >
                    <i className="ri-close-circle-line mr-2"></i>
                    Cancelar Anticipo
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
            setAdvanceToPrint(null);
          }}
          onSelect={handlePrintTypeSelect}
          documentType="invoice"
          title="Select Advance Format"
        />
      </div>
    </DashboardLayout>
  );
}