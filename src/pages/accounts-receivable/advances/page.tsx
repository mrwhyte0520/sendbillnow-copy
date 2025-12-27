import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import QRCode from 'qrcode';
import { useAuth } from '../../../hooks/useAuth';
import { customersService, invoicesService, customerAdvancesService, bankAccountsService, journalEntriesService, settingsService, accountingSettingsService } from '../../../services/database';
import { exportToExcelWithHeaders } from '../../../utils/exportImportUtils';
import { formatMoney } from '../../../utils/numberFormat';

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

  const getPaymentMethodName = (method: string) => {
    switch (method) {
      case 'cash': return 'Efectivo';
      case 'check': return 'Cheque';
      case 'transfer': return 'Transferencia';
      case 'card': return 'Tarjeta';
      default: return 'Otro';
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
      case 'pending': return 'Pendiente';
      case 'applied': return 'Aplicado';
      case 'partial': return 'Parcial';
      case 'cancelled': return 'Cancelado';
      default: return 'Desconocido';
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
      console.error('[Advances] Error obteniendo información de la empresa para PDF de anticipos:', error);
    }

    doc.setFontSize(16);
    doc.text(companyName, pageWidth / 2, 15, { align: 'center' } as any);

    doc.setFontSize(20);
    doc.text('Reporte de Anticipos de Clientes', 20, 30);
    
    doc.setFontSize(12);
    doc.text(`Fecha de generación: ${new Date().toLocaleDateString()}`, 20, 45);
    doc.text(`Estado: ${statusFilter === 'all' ? 'Todos' : getStatusName(statusFilter)}`, 20, 55);
    
    // Estadísticas
    const activeAdvances = filteredAdvances.filter(a => a.status !== 'cancelled');
    const totalAmount = activeAdvances.reduce((sum, advance) => sum + advance.amount, 0);
    const totalApplied = activeAdvances.reduce((sum, advance) => sum + advance.appliedAmount, 0);
    const totalBalance = activeAdvances.reduce((sum, advance) => sum + advance.balance, 0);
    const pendingAdvances = activeAdvances.filter(a => a.status === 'pending').length;
    
    doc.setFontSize(14);
    doc.text('Resumen de Anticipos', 20, 75);
    
    const summaryData = [
      ['Concepto', 'Valor'],
      ['Total Anticipos', `${formatMoney(totalAmount, 'RD$')}`],
      ['Total Aplicado', `${formatMoney(totalApplied, 'RD$')}`],
      ['Saldo Pendiente', `${formatMoney(totalBalance, 'RD$')}`],
      ['Anticipos Pendientes', pendingAdvances.toString()],
      ['Total de Anticipos', activeAdvances.length.toString()]
    ];
    
    (doc as any).autoTable({
      startY: 85,
      head: [summaryData[0]],
      body: summaryData.slice(1),
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246] }
    });
    
    // Tabla de anticipos
    doc.setFontSize(14);
    doc.text('Detalle de Anticipos', 20, (doc as any).lastAutoTable.finalY + 20);
    
    const advanceData = activeAdvances.map(advance => [
      advance.advanceNumber,
      advance.customerName,
      advance.date,
      `${formatMoney(advance.amount, 'RD$')}`,
      `${formatMoney(advance.appliedAmount, 'RD$')}`,
      `${formatMoney(advance.balance, 'RD$')}`,
      getStatusName(advance.status)
    ]);
    
    (doc as any).autoTable({
      startY: (doc as any).lastAutoTable.finalY + 30,
      head: [['Anticipo', 'Cliente', 'Fecha', 'Monto', 'Aplicado', 'Saldo', 'Estado']],
      body: advanceData,
      theme: 'striped',
      headStyles: { fillColor: [34, 197, 94] },
      styles: { fontSize: 8 }
    });
    
    doc.save(`anticipos-clientes-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const exportToExcel = async () => {
    const activeAdvances: Advance[] = filteredAdvances.filter(a => a.status !== 'cancelled');

    if (!activeAdvances.length) {
      alert('No hay anticipos para exportar con los filtros actuales.');
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
      console.error('Error obteniendo información de la empresa para Excel de anticipos:', error);
    }

    const rows = activeAdvances.map((advance) => ({
      advanceNumber: advance.advanceNumber,
      customerName: advance.customerName,
      date: advance.date,
      amount: formatMoney(advance.amount, 'RD$'),
      appliedAmount: formatMoney(advance.appliedAmount, 'RD$'),
      balance: formatMoney(advance.balance, 'RD$'),
      status: getStatusName(advance.status),
    }));

    const todayIso = new Date().toISOString().split('T')[0];
    const todayLocal = new Date().toLocaleDateString();

    const headers = [
      { key: 'advanceNumber', title: 'Anticipo' },
      { key: 'customerName', title: 'Cliente' },
      { key: 'date', title: 'Fecha' },
      { key: 'amount', title: 'Monto' },
      { key: 'appliedAmount', title: 'Aplicado' },
      { key: 'balance', title: 'Saldo' },
      { key: 'status', title: 'Estado' },
    ];

    exportToExcelWithHeaders(
      rows,
      headers,
      `anticipos-clientes-${todayIso}`,
      'Anticipos',
      [18, 28, 14, 16, 16, 16, 16],
      {
        title: `Anticipos de Clientes - ${todayLocal}`,
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

  const handlePrintAdvance = async (advance: Advance) => {
    let companyName = 'ContaBi';
    let companyRnc = '';
    let companyPhone = '';
    let companyEmail = '';
    let companyAddress = '';
    try {
      const info = await settingsService.getCompanyInfo();
      if (info) {
        companyName = (info as any).name || (info as any).company_name || 'ContaBi';
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
                <div class="totals-row"><div class="label">Monto</div><div class="value">RD$ ${formatMoney(advance.amount, '')}</div></div>
                <div class="totals-row"><div class="label">Aplicado</div><div class="value">RD$ ${formatMoney(advance.appliedAmount, '')}</div></div>
                <div class="totals-row total"><div class="label">Balance</div><div class="value">RD$ ${formatMoney(advance.balance, '')}</div></div>
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
      const created = await customerAdvancesService.create(user.id, payload);

      // Best-effort: registrar asiento contable del anticipo (Banco/Caja vs Anticipos de cliente)
      try {
        const customerAdvanceAccountId = customerAdvanceAccounts[customerId];

        if (!customerAdvanceAccountId) {
          alert('Anticipo registrado, pero no se pudo crear el asiento: el cliente no tiene configurada una cuenta de Anticipos.');
        } else {
          let bankChartAccountId: string | null = null;

          if (bankAccountId) {
            const bank = bankAccounts.find((b) => b.id === bankAccountId);
            bankChartAccountId = bank?.chartAccountId || null;
          }

          // Si es efectivo y no hay banco, intentar usar cuenta de Caja/Efectivo global
          if (!bankChartAccountId && paymentMethod === 'cash') {
            const settings = await accountingSettingsService.get(user.id);
            const cashAccountId = (settings as any)?.cash_account_id as string | undefined;
            if (cashAccountId) {
              bankChartAccountId = cashAccountId;
            }
          }

          if (!bankChartAccountId) {
            if (paymentMethod === 'cash') {
              alert('Anticipo registrado en efectivo, pero no se pudo crear el asiento: configure una cuenta de Caja/Efectivo en Ajustes Contables o use una cuenta bancaria con cuenta contable asociada.');
            } else {
              alert('Anticipo registrado, pero no se pudo crear el asiento: la cuenta de banco seleccionada no tiene cuenta contable asociada.');
            }
          } else {
            const entryAmount = Number(created.amount) || amount;

            const lines: any[] = [
              {
                account_id: bankChartAccountId,
                description: paymentMethod === 'cash' ? 'Anticipo de cliente - Caja/Efectivo' : 'Anticipo de cliente - Banco',
                debit_amount: entryAmount,
                credit_amount: 0,
                line_number: 1,
              },
              {
                account_id: customerAdvanceAccountId,
                description: 'Anticipo de cliente - Pasivo',
                debit_amount: 0,
                credit_amount: entryAmount,
                line_number: 2,
              },
            ];

            const customerName = customers.find((c) => c.id === customerId)?.name || '';
            const descriptionText = customerName
              ? `Anticipo ${created.advance_number || advanceNumber} - ${customerName}`
              : `Anticipo ${created.advance_number || advanceNumber}`;

            const refText = created.reference || reference || '';
            const entryReference = refText
              ? `Anticipo:${created.id} Ref:${refText}`
              : `Anticipo:${created.id}`;

            const entryDate = created.advance_date || advanceDate;

            const entryPayload = {
              entry_number: created.id,
              entry_date: entryDate,
              description: descriptionText,
              reference: entryReference,
              total_debit: entryAmount,
              total_credit: entryAmount,
              status: 'posted' as const,
            };

            await journalEntriesService.createWithLines(user.id, entryPayload, lines);
          }
        }
      } catch (jeError) {
        // eslint-disable-next-line no-console
        console.error('[Advances] Error creando asiento contable de anticipo:', jeError);
        alert('Anticipo registrado, pero ocurrió un error al crear el asiento contable. Revise el libro diario y la configuración.');
      }

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

      // Best-effort: registrar asiento contable de aplicación de anticipo (Anticipos vs CxC)
      try {
        const customerId = selectedAdvance.customerId;
        const advanceAccountId = customerAdvanceAccounts[customerId];

        if (!advanceAccountId) {
          alert('Anticipo aplicado, pero no se pudo crear el asiento: el cliente no tiene configurada una cuenta de Anticipos.');
        } else {
          const settings = await accountingSettingsService.get(user.id);
          const customerSpecificArId = customerArAccounts[customerId];
          const arAccountId = customerSpecificArId || settings?.ar_account_id;

          if (!arAccountId) {
            alert('Anticipo aplicado, pero no se pudo crear el asiento: configure una cuenta de Cuentas por Cobrar en el cliente o en Ajustes Contables.');
          } else {
            const amountForEntry = amountToApply;

            const lines: any[] = [
              {
                account_id: advanceAccountId,
                description: 'Aplicación de anticipo a factura - Anticipos de Cliente',
                debit_amount: amountForEntry,
                credit_amount: 0,
                line_number: 1,
              },
              {
                account_id: arAccountId,
                description: 'Aplicación de anticipo a factura - Cuentas por Cobrar',
                debit_amount: 0,
                credit_amount: amountForEntry,
                line_number: 2,
              },
            ];

            const customerName = customers.find(c => c.id === customerId)?.name || selectedAdvance.customerName;
            const descriptionText = customerName
              ? `Aplicación anticipo ${selectedAdvance.advanceNumber} a factura ${targetInvoice.invoiceNumber} - ${customerName}`
              : `Aplicación anticipo ${selectedAdvance.advanceNumber} a factura ${targetInvoice.invoiceNumber}`;

            const entryDate = new Date().toISOString().split('T')[0];
            const entryReference = `AdvApply:${selectedAdvance.id}-Inv:${invoiceId}`;

            const entryPayload = {
              entry_number: `${selectedAdvance.id}-APP-${Date.now()}`,
              entry_date: entryDate,
              description: descriptionText,
              reference: entryReference,
              total_debit: amountForEntry,
              total_credit: amountForEntry,
              status: 'posted' as const,
            };

            await journalEntriesService.createWithLines(user.id, entryPayload, lines);
          }
        }
      } catch (jeError) {
        // eslint-disable-next-line no-console
        console.error('[Advances] Error creando asiento contable de aplicación de anticipo:', jeError);
        alert('Anticipo aplicado, pero ocurrió un error al crear el asiento contable. Revise el libro diario y la configuración.');
      }

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
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Anticipos de Clientes</h1>
            <nav className="flex space-x-2 text-sm text-gray-600 mt-2">
              <Link to="/accounts-receivable" className="hover:text-blue-600">Cuentas por Cobrar</Link>
              <span>/</span>
              <span>Anticipos</span>
            </nav>
          </div>
          <button 
            onClick={handleNewAdvance}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            <i className="ri-add-line mr-2"></i>
            Nuevo Anticipo
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Anticipos</p>
                <p className="text-2xl font-bold text-blue-600">
                  {formatMoney(filteredAdvances.reduce((sum, a) => sum + a.amount, 0), 'RD$')}
                </p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <i className="ri-money-dollar-circle-line text-2xl text-blue-600"></i>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Saldo Disponible</p>
                <p className="text-2xl font-bold text-green-600">
                  {formatMoney(filteredAdvances.reduce((sum, a) => sum + a.balance, 0), 'RD$')}
                </p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <i className="ri-wallet-line text-2xl text-green-600"></i>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Monto Aplicado</p>
                <p className="text-2xl font-bold text-purple-600">
                  {formatMoney(filteredAdvances.reduce((sum, a) => sum + a.appliedAmount, 0), 'RD$')}
                </p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <i className="ri-check-double-line text-2xl text-purple-600"></i>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Anticipos Pendientes</p>
                <p className="text-2xl font-bold text-orange-600">
                  {filteredAdvances.filter(a => a.status === 'pending').length}
                </p>
              </div>
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                <i className="ri-time-line text-2xl text-orange-600"></i>
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
                placeholder="Buscar por cliente, número de anticipo o referencia..."
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
              <option value="applied">Aplicados</option>
              <option value="cancelled">Cancelados</option>
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

        {/* Advances Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          {(loadingAdvances || loadingSupport) && (
            <div className="px-6 pt-3 text-sm text-gray-500">Cargando datos...</div>
          )}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Anticipo
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
                    Estado
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
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
                      {formatMoney(advance.amount, 'RD$')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatMoney(advance.appliedAmount, 'RD$')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">
                      {formatMoney(advance.balance, 'RD$')}
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
                          className="text-blue-600 hover:text-blue-900"
                          title="Ver detalles"
                        >
                          <i className="ri-eye-line"></i>
                        </button>
                        <button
                          onClick={() => handlePrintAdvance(advance)}
                          className="text-purple-600 hover:text-purple-900"
                          title="Imprimir"
                        >
                          <i className="ri-printer-line"></i>
                        </button>
                        {advance.balance > 0 && advance.status !== 'cancelled' && (
                          <button
                            onClick={() => handleApplyAdvance(advance)}
                            className="text-green-600 hover:text-green-900"
                            title="Aplicar anticipo"
                          >
                            <i className="ri-check-line"></i>
                          </button>
                        )}
                        {advance.status === 'pending' && (
                          <button
                            onClick={() => handleCancelAdvance(advance.id)}
                            className="text-red-600 hover:text-red-900"
                            title="Cancelar anticipo"
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
                <h3 className="text-lg font-semibold">Nuevo Anticipo de Cliente</h3>
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Cliente
                    </label>
                    <select 
                      required
                      name="customer_id"
                      value={selectedCustomerId}
                      onChange={(e) => setSelectedCustomerId(e.target.value)}
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
                      type="text"
                      required
                      name="date"
                      defaultValue={new Date().toISOString().split('T')[0]}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
                
                {selectedCustomer && (
                  <div className="mt-2 p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <p className="text-sm font-medium text-gray-700 mb-1">Datos del Cliente</p>
                    {selectedCustomer.document && (
                      <p className="text-sm text-gray-600">
                        <span className="font-semibold">Documento: </span>
                        {selectedCustomer.document}
                      </p>
                    )}
                    {selectedCustomer.phone && (
                      <p className="text-sm text-gray-600">
                        <span className="font-semibold">Teléfono: </span>
                        {selectedCustomer.phone}
                      </p>
                    )}
                    {selectedCustomer.email && (
                      <p className="text-sm text-gray-600">
                        <span className="font-semibold">Email: </span>
                        {selectedCustomer.email}
                      </p>
                    )}
                    {selectedCustomer.address && (
                      <p className="text-sm text-gray-600">
                        <span className="font-semibold">Dirección: </span>
                        {selectedCustomer.address}
                      </p>
                    )}
                  </div>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Monto del Anticipo
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
                    Cuenta de Banco
                  </label>
                  <select
                    name="bank_account_id"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                  >
                    <option value="">
                      Seleccionar cuenta (obligatoria para Cheque, Transferencia o Tarjeta)
                    </option>
                    {bankAccounts.map((ba) => (
                      <option key={ba.id} value={ba.id}>
                        {ba.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    Si el método de pago es Efectivo, puede dejar este campo en blanco y se usará la cuenta de Caja/Efectivo configurada en Ajustes Contables.
                  </p>
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
                    placeholder="Número de referencia del pago"
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
                    placeholder="Descripción del anticipo recibido..."
                  />
                </div>
                
                <div className="flex space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowAdvanceModal(false)}
                    className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400 transition-colors whitespace-nowrap"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                  >
                    Crear Anticipo
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
                <h3 className="text-lg font-semibold">Aplicar Anticipo</h3>
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
              
              <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">Anticipo: <span className="font-medium">{selectedAdvance.advanceNumber}</span></p>
                <p className="text-sm text-gray-600">Cliente: <span className="font-medium">{selectedAdvance.customerName}</span></p>
                <p className="text-lg font-semibold text-green-600">Saldo disponible: {formatMoney(selectedAdvance.balance, 'RD$')}</p>
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
                      .filter(
                        (inv) =>
                          inv.customerId === selectedAdvance.customerId &&
                          inv.totalAmount > inv.paidAmount,
                      )
                      .map((inv) => (
                        <option key={inv.id} value={inv.id}>
                          {inv.invoiceNumber} - {formatMoney(inv.totalAmount, 'RD$')}
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
                    max={selectedAdvance.balance}
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
                    placeholder="Observaciones sobre la aplicación del anticipo..."
                  />
                </div>
                
                <div className="flex space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowApplyModal(false);
                      setSelectedAdvance(null);
                    }}
                    className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400 transition-colors whitespace-nowrap"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap"
                  >
                    Aplicar Anticipo
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
                    <p className="text-2xl font-bold text-blue-600">{formatMoney(selectedAdvance.amount, 'RD$')}</p>
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
                    <p className="text-lg font-semibold text-purple-600">{formatMoney(selectedAdvance.appliedAmount, 'RD$')}</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-500">Saldo Disponible</label>
                    <p className="text-2xl font-bold text-green-600">{formatMoney(selectedAdvance.balance, 'RD$')}</p>
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
      </div>
    </DashboardLayout>
  );
}