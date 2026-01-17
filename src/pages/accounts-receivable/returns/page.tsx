import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import * as QRCode from 'qrcode';
import {
  customersService,
  invoicesService,
  settingsService,
} from '../../../services/database';
import { formatAmount } from '../../../utils/numberFormat';
import { formatDate } from '../../../utils/dateFormat';

interface ArReturn {
  id: string;
  entryNumber: string;
  date: string;
  customerId?: string;
  customerName: string;
  invoiceId?: string;
  invoiceNumber?: string;
  amount: number;
  concept: string;
}

export default function ReturnsPage() {
  const { user } = useAuth();
  const [returns, setReturns] = useState<ArReturn[]>([]);
  const [customers, setCustomers] = useState<Array<{ id: string; name: string }>>([]);
  const [invoices, setInvoices] = useState<
    Array<{
      id: string;
      publicToken?: string | null;
      invoiceNumber: string;
      customerId: string;
      customerName: string;
      dueDate?: string;
      totalAmount: number;
      subtotal: number;
      tax: number;
      paidAmount: number;
      pendingAmount: number;
      items: {
        description: string;
        quantity: number;
        price: number;
        total: number;
      }[];
    }>
  >([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [accountingSettings, setAccountingSettings] = useState<any | null>(null);
  const [companyInfo, setCompanyInfo] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [noteCustomerId, setNoteCustomerId] = useState<string>('');
  const [noteInvoiceId, setNoteInvoiceId] = useState<string>('');
  const [noteAmount, setNoteAmount] = useState<number>(0);
  const [originAccountId, setOriginAccountId] = useState<string>('');
  const [returnsAccountId, setReturnsAccountId] = useState<string>('');

  const incomeAccounts = accounts.filter((acc) => acc.allowPosting && acc.type === 'income');

  useEffect(() => {
    const loadCompanyInfo = async () => {
      try {
        const info = await settingsService.getCompanyInfo();
        setCompanyInfo(info);
      } catch {
        setCompanyInfo(null);
      }
    };
    loadCompanyInfo();
  }, [user?.id]);

  const loadData = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [custList, invList] = await Promise.all([
        customersService.getAll(user.id),
        invoicesService.getAll(user.id),
      ]);

      const customersArray = (custList || []).map((c: any) => ({ id: String(c.id), name: String(c.name) }));
      setCustomers(customersArray);

      const invoicesArray = (invList as any[]).map((inv) => {
        const totalAmount = Number(inv.total_amount) || 0;
        const paidAmount = Number((inv as any).paid_amount) || 0;
        const pendingAmount = totalAmount > 0 ? Math.max(totalAmount - paidAmount, 0) : 0;

        const customerName = String((inv as any)?.customers?.name || '');
        const publicToken = (inv as any)?.public_token ?? (inv as any)?.publicToken ?? null;
        const dueDate = String((inv as any)?.due_date || (inv as any)?.dueDate || '');
        const subtotal = Number((inv as any)?.subtotal_amount ?? (inv as any)?.subtotal ?? (totalAmount - (Number((inv as any)?.tax_amount) || 0))) || 0;
        const tax = Number((inv as any)?.tax_amount ?? (inv as any)?.tax ?? 0) || 0;
        const items = ((inv as any)?.invoice_lines || []).map((ln: any) => {
          const quantity = Number(ln.quantity) || 0;
          const price = Number(ln.unit_price) || 0;
          const lineTotal = Number(ln.line_total) || quantity * price;
          return {
            description: String(ln.description || ''),
            quantity,
            price,
            total: lineTotal,
          };
        });

        return {
          id: String(inv.id),
          publicToken,
          invoiceNumber: inv.invoice_number as string,
          customerId: String(inv.customer_id),
          customerName,
          dueDate,
          totalAmount,
          subtotal,
          tax,
          paidAmount,
          pendingAmount,
          items,
        };
      });
      setInvoices(invoicesArray);

      // Returns are now tracked directly, not via journal entries
      setReturns([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handlePrintInvoice = (invoiceId: string, returnedAmount: number) => {
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

      const customerDocument = (fullCustomer as any)?.document || '';
      const customerPhone = (fullCustomer as any)?.phone || '';
      const customerEmail = (fullCustomer as any)?.email || '';
      const customerAddress = (fullCustomer as any)?.address || '';

      const companyName =
        (companyInfo as any)?.name ||
        (companyInfo as any)?.company_name ||
        '';

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
          (item, idx) => `
            <tr>
              <td>${idx + 1}</td>
              <td>${item.description}</td>
              <td class="num"> ${formatAmount(item.price)}</td>
              <td class="num">${item.quantity}</td>
              <td class="num"> ${formatAmount(item.total)}</td>
            </tr>`,
        )
        .join('');

      const invoiceTotal = Number(invoice.totalAmount) || 0;
      const returned = Number(returnedAmount) || 0;
      const remaining = Math.max(invoiceTotal - returned, 0);

      const html = `
        <html>
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>Factura ${invoice.invoiceNumber}</title>
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
              .table-wrap { margin-top: 18px; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
              table { width: 100%; border-collapse: collapse; }
              thead th { background: var(--primary); color: #fff; font-size: 12px; text-transform: uppercase; letter-spacing: 0.4px; padding: 10px; text-align: left; }
              tbody td { border-bottom: 1px solid var(--border); padding: 10px; font-size: 12px; vertical-align: top; }
              tbody tr:last-child td { border-bottom: none; }
              .num { text-align: right; font-variant-numeric: tabular-nums; }
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
                <div class="doc-title">FACTURA</div>
                <div class="doc-number">NCF: ${invoice.invoiceNumber}</div>
                <div class="doc-kv">
                  <div><strong>Fecha Límite de Pago:</strong> ${invoice.dueDate ? formatDate(invoice.dueDate) : ''}</div>
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
                    <div class="v">${invoice.customerName}</div>
                    ${customerDocument ? `<div class="k">Documento</div><div class="v">${customerDocument}</div>` : ''}
                    ${customerPhone ? `<div class="k">Teléfono</div><div class="v">${customerPhone}</div>` : ''}
                    ${customerEmail ? `<div class="k">Email</div><div class="v">${customerEmail}</div>` : ''}
                    ${customerAddress ? `<div class="k">Dirección</div><div class="v">${customerAddress}</div>` : ''}
                  </div>
                </div>
              </div>
              <div class="totals">
                <div class="totals-head">Resumen</div>
                <div class="totals-body">
                  <div class="totals-row"><div class="label">Monto factura</div><div class="value"> ${formatAmount(invoiceTotal)}</div></div>
                  <div class="totals-row"><div class="label">Devuelto</div><div class="value"> ${formatAmount(returned)}</div></div>
                  <div class="totals-row total"><div class="label">Resto</div><div class="value"> ${formatAmount(remaining)}</div></div>
                </div>
              </div>
            </div>

            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style="width: 54px;">No.</th>
                    <th>Descripción</th>
                    <th class="num" style="width: 110px;">Precio</th>
                    <th class="num" style="width: 80px;">Cant.</th>
                    <th class="num" style="width: 120px;">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsHtml}
                </tbody>
              </table>
            </div>

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

  const filteredReturns = returns.filter((r) => {
    const term = searchTerm.toLowerCase();
    return (
      r.customerName.toLowerCase().includes(term) ||
      (r.invoiceNumber || '').toLowerCase().includes(term) ||
      r.entryNumber.toLowerCase().includes(term) ||
      r.concept.toLowerCase().includes(term)
    );
  });

  const handleInvoiceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newInvoiceId = e.target.value;
    setNoteInvoiceId(newInvoiceId);

    if (!newInvoiceId) {
      setNoteAmount(0);
      return;
    }

    const selectedInvoice = invoices.find((inv) => inv.id === newInvoiceId);
    if (selectedInvoice) {
      const pending = Number(selectedInvoice.pendingAmount) || 0;
      if (pending > 0) {
        setNoteAmount(pending);
      } else if (selectedInvoice.totalAmount > 0) {
        // Si no hay pendiente (ya pagada / ajustada), sugerimos total solo como referencia
        // y permitimos que el usuario ajuste manualmente si necesita un crédito especial.
        setNoteAmount(selectedInvoice.totalAmount);
      } else {
        setNoteAmount(0);
      }
    }

    if (accountingSettings) {
      const originId = (accountingSettings as any).sales_account_id as string | undefined;
      const returnsId = (accountingSettings as any).sales_returns_account_id as string | undefined;

      if (!originAccountId && originId) {
        setOriginAccountId(String(originId));
      }

      if (!returnsAccountId) {
        const target = returnsId || originId;
        if (target) {
          setReturnsAccountId(String(target));
        }
      }
    }
  };

  const handleSaveReturn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user?.id) {
      alert('Debes iniciar sesión para registrar devoluciones');
      return;
    }

    const formData = new FormData(e.currentTarget);
    const customerId = String(formData.get('customer_id') || '');
    const date = String(formData.get('date') || '');
    const amount = Number(formData.get('amount') || 0);
    const invoiceId = String(formData.get('invoice_id') || '');
    const originAccountFromForm = String(formData.get('origin_account_id') || '');
    const returnsAccountFromForm = String(formData.get('returns_account_id') || '');
    const concept = String(formData.get('concept') || '');

    if (!amount || amount <= 0) {
      alert('El monto debe ser mayor que 0');
      return;
    }

    if (!invoiceId) {
      alert('Debes seleccionar una factura para aplicar la devolución');
      return;
    }

    // Validar que no se pueda devolver más que el saldo pendiente de la factura seleccionada
    if (invoiceId) {
      const selectedInvoice = invoices.find((inv) => inv.id === invoiceId);
      if (selectedInvoice) {
        const pending = Number(selectedInvoice.pendingAmount) || 0;
        if (pending <= 0) {
          alert('La factura seleccionada no tiene saldo pendiente para devolver.');
          return;
        }
        if (amount > pending) {
          alert(
            `El monto de la devolución no puede ser mayor que el saldo pendiente de la factura (pendiente: ${formatAmount(pending)}).`,
          );
          return;
        }
      }
    }

    if (!originAccountFromForm || !returnsAccountFromForm) {
      alert('Debes seleccionar la cuenta de ingresos original y la cuenta "Devoluciones en ventas"');
      return;
    }

    const entryDate = date || new Date().toISOString().slice(0, 10);
    const entryNumber = `DEV-${Date.now()}`;

    const customerName = customerId
      ? customers.find((c) => c.id === customerId)?.name || ''
      : '';
    const invoiceNumber = invoiceId
      ? invoices.find((inv) => inv.id === invoiceId)?.invoiceNumber || ''
      : '';

    const descriptionParts = ['Devolución en ventas'];
    if (customerName) descriptionParts.push(`Cliente: ${customerName}`);
    if (invoiceNumber) descriptionParts.push(`Factura: ${invoiceNumber}`);

    const description = descriptionParts.join(' - ');
    const reference = `RET|${customerId}|${invoiceId}|${concept}`;

    try {
      // Si hay una factura relacionada, actualizar su total y estado
      if (invoiceId) {
        const targetInvoice = invoices.find((inv) => inv.id === invoiceId);
        if (targetInvoice) {
          const originalTotal = Number(targetInvoice.totalAmount) || 0;
          const paidAmount = Number(targetInvoice.paidAmount) || 0;
          let newInvoiceTotal = originalTotal - amount;
          if (newInvoiceTotal < 0) newInvoiceTotal = 0;

          let newInvoiceStatus: string;
          if (newInvoiceTotal <= 0) {
            newInvoiceStatus = 'paid';
          } else if (paidAmount > 0) {
            newInvoiceStatus = 'partial';
          } else {
            newInvoiceStatus = 'pending';
          }

          await invoicesService.updateTotals(invoiceId, newInvoiceTotal, newInvoiceStatus);
        }
      }

      await loadData();
      alert('Devolución registrada exitosamente');
      setShowModal(false);
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('[Returns] Error al registrar devolución', error);
      alert(error?.message || 'Error al registrar la devolución.');
    }
  };

  const totalAmount = filteredReturns.reduce((sum, r) => sum + r.amount, 0);

  return (
    <DashboardLayout>
      <div className="p-6 bg-gradient-to-br from-[#f6f1e3] to-[#ebe5d5] min-h-screen">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#2f3e1e] drop-shadow-sm">Devoluciones en Ventas (CxC)</h1>
            <nav className="flex space-x-2 text-sm text-gray-600 mt-2">
              <Link to="/accounts-receivable" className="hover:text-blue-600">Cuentas por Cobrar</Link>
              <span>/</span>
              <span>Devoluciones</span>
            </nav>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="bg-gradient-to-br from-[#008000] to-[#006600] text-white px-6 py-3 rounded-xl shadow-[0_4px_15px_rgb(0,128,0,0.3)] hover:from-[#006600] hover:to-[#005500] hover:shadow-[0_6px_20px_rgb(0,128,0,0.4)] hover:-translate-y-0.5 transition-all duration-300 whitespace-nowrap font-semibold"
          >
            <i className="ri-add-line mr-2"></i>
            Nueva Devolución
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="bg-gradient-to-br from-white to-[#faf9f5] p-6 rounded-2xl border border-[#e8e0d0] shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:shadow-[0_12px_40px_rgb(0,128,0,0.15)] hover:-translate-y-1 transition-all duration-300 cursor-pointer">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Devoluciones</p>
                <p className="text-2xl font-bold text-blue-600">
                  {formatAmount(totalAmount)}
                </p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <i className="ri-refresh-line text-2xl text-blue-600"></i>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-white to-[#faf9f5] p-6 rounded-2xl border border-[#e8e0d0] shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:shadow-[0_12px_40px_rgb(0,128,0,0.15)] hover:-translate-y-1 transition-all duration-300 cursor-pointer">
            <p className="text-sm font-medium text-gray-600">Cantidad de Devoluciones</p>
            <p className="text-2xl font-bold text-gray-900">{filteredReturns.length}</p>
          </div>

          <div className="bg-gradient-to-br from-white to-[#faf9f5] p-6 rounded-2xl border border-[#e8e0d0] shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:shadow-[0_12px_40px_rgb(0,128,0,0.15)] hover:-translate-y-1 transition-all duration-300 cursor-pointer">
            <p className="text-sm font-medium text-gray-600">Clientes impactados</p>
            <p className="text-2xl font-bold text-gray-900">
              {new Set(filteredReturns.map((r) => r.customerName).filter(Boolean)).size}
            </p>
          </div>
        </div>

        {/* Filters */}
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
                placeholder="Buscar por cliente, número de documento, factura o concepto..."
              />
            </div>
          </div>
        </div>

        {/* Returns Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          {loading && (
            <div className="px-6 pt-3 text-sm text-gray-500">Cargando datos...</div>
          )}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Documento
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fecha
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cliente
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Factura
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Monto
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Concepto
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredReturns.map((ret) => (
                  <tr key={ret.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {ret.entryNumber}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {ret.date}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {ret.customerName || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {ret.invoiceNumber || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-red-600">
                      {formatAmount(ret.amount)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                      {ret.concept}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <button
                        type="button"
                        onClick={() => {
                          if (!ret.invoiceId) return;
                          handlePrintInvoice(ret.invoiceId, ret.amount);
                        }}
                        disabled={!ret.invoiceId}
                        className={`inline-flex items-center px-3 py-1.5 rounded-lg border transition-colors whitespace-nowrap ${
                          ret.invoiceId
                            ? 'border-gray-300 text-gray-700 hover:bg-gray-100'
                            : 'border-gray-200 text-gray-300 cursor-not-allowed'
                        }`}
                        title={ret.invoiceId ? 'Imprimir factura' : 'Sin factura asociada'}
                      >
                        <i className="ri-printer-line mr-2"></i>
                        Imprimir
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredReturns.length === 0 && !loading && (
                  <tr>
                    <td colSpan={7} className="px-6 py-4 text-sm text-gray-500 text-center">
                      No hay devoluciones registradas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* New Return Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Nueva Devolución en Ventas</h3>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line"></i>
                </button>
              </div>

              <form onSubmit={handleSaveReturn} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Cliente
                    </label>
                    <select
                      name="customer_id"
                      value={noteCustomerId}
                      onChange={(e) => {
                        const newCustomerId = e.target.value;
                        setNoteCustomerId(newCustomerId);
                        setNoteInvoiceId('');
                        setNoteAmount(0);
                      }}
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
                      type="number"
                      min="0"
                      step="0.01"
                      name="amount"
                      required
                      value={noteAmount || ''}
                      onChange={(e) => setNoteAmount(Number(e.target.value || 0))}
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
                      value={noteInvoiceId}
                      onChange={handleInvoiceChange}
                      required
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                    >
                      <option value="">Seleccionar factura</option>
                      {invoices
                        .filter((inv) => !noteCustomerId || inv.customerId === noteCustomerId)
                        .map((inv) => (
                          <option key={inv.id} value={inv.id}>{inv.invoiceNumber}</option>
                        ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Cuenta de ingresos original <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="origin_account_id"
                    required
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                    value={originAccountId}
                    onChange={(e) => setOriginAccountId(e.target.value)}
                  >
                    <option value="">Seleccionar cuenta de ingresos original</option>
                    {incomeAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.code} - {acc.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Cuenta "Devoluciones en ventas" <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="returns_account_id"
                    required
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                    value={returnsAccountId}
                    onChange={(e) => setReturnsAccountId(e.target.value)}
                  >
                    <option value="">Seleccionar cuenta de ingresos para devoluciones</option>
                    {incomeAccounts.map((acc) => (
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
                    name="concept"
                    rows={3}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Descripción detallada de la devolución..."
                    required
                  />
                </div>

                <div className="flex space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false);
                      setNoteCustomerId('');
                      setNoteInvoiceId('');
                      setNoteAmount(0);
                    }}
                    className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400 transition-colors whitespace-nowrap"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                  >
                    Registrar Devolución
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
