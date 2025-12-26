import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { useAuth } from '../../hooks/useAuth';
import {
  apInvoiceLinesService,
  apInvoicesService,
  invoicesService,
  purchaseOrderItemsService,
  purchaseOrdersService,
  quotesService,
  settingsService,
} from '../../services/database';
import { formatAmount } from '../../utils/numberFormat';

type DocType = 'quote' | 'invoice' | 'ap-invoice' | 'purchase-order';

type DocState =
  | { type: 'quote'; header: any; lines: any[] }
  | { type: 'invoice'; header: any; lines: any[] }
  | { type: 'ap-invoice'; header: any; lines: any[] }
  | { type: 'purchase-order'; header: any; lines: any[] };

export default function DocumentPage() {
  const { user } = useAuth();
  const { type, id } = useParams();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const [companyInfo, setCompanyInfo] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [doc, setDoc] = useState<DocState | null>(null);

  const normalizedType: DocType | null = useMemo(() => {
    const raw = String(type || '').trim().toLowerCase();
    if (raw === 'quote') return 'quote';
    if (raw === 'invoice') return 'invoice';
    if (raw === 'ap-invoice') return 'ap-invoice';
    if (raw === 'purchase-order') return 'purchase-order';
    return null;
  }, [type]);

  useEffect(() => {
    (async () => {
      try {
        const info = await settingsService.getCompanyInfo();
        setCompanyInfo(info);
      } catch {
        setCompanyInfo(null);
      }
    })();
  }, [user?.id]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      setDoc(null);

      if (!user?.id) {
        setError('Debes iniciar sesión para ver este documento.');
        setLoading(false);
        return;
      }
      if (!normalizedType || !id) {
        setError('Documento inválido.');
        setLoading(false);
        return;
      }

      try {
        if (normalizedType === 'quote') {
          const rows = await quotesService.getAll(user.id);
          const q = (rows || []).find((r: any) => String(r.id) === String(id));
          if (!q) throw new Error('Cotización no encontrada');
          setDoc({ type: 'quote', header: q, lines: (q.quote_lines || []) as any[] });
        }

        if (normalizedType === 'invoice') {
          const rows = await invoicesService.getAll(user.id);
          const inv = (rows || []).find((r: any) => String(r.id) === String(id));
          if (!inv) throw new Error('Factura no encontrada');
          setDoc({ type: 'invoice', header: inv, lines: (inv.invoice_lines || []) as any[] });
        }

        if (normalizedType === 'ap-invoice') {
          const rows = await apInvoicesService.getAll(user.id);
          const inv = (rows || []).find((r: any) => String(r.id) === String(id));
          if (!inv) throw new Error('Factura de suplidor no encontrada');
          const lines = await apInvoiceLinesService.getByInvoice(String(inv.id));
          setDoc({ type: 'ap-invoice', header: inv, lines: (lines || []) as any[] });
        }

        if (normalizedType === 'purchase-order') {
          const rows = await purchaseOrdersService.getAll(user.id);
          const po = (rows || []).find((r: any) => String(r.id) === String(id));
          if (!po) throw new Error('Orden de compra no encontrada');
          const lines = await purchaseOrderItemsService.getByOrder(String(po.id));
          setDoc({ type: 'purchase-order', header: po, lines: (lines || []) as any[] });
        }
      } catch (e: any) {
        setError(e?.message || 'No se pudo cargar el documento');
      } finally {
        setLoading(false);
      }
    })();
  }, [id, normalizedType, user?.id]);

  const companyName = (companyInfo as any)?.name || (companyInfo as any)?.company_name || 'ContaBi';
  const companyRnc = (companyInfo as any)?.ruc || (companyInfo as any)?.tax_id || (companyInfo as any)?.rnc || '';

  const buildHtml = () => {
    if (!doc) return '';

    const titleMap: Record<DocType, string> = {
      quote: 'COTIZACIÓN',
      invoice: 'FACTURA',
      'ap-invoice': 'FACTURA',
      'purchase-order': 'ORDEN',
    };

    const header = doc.header || {};
    const safeNumber =
      header.invoice_number ||
      header.invoiceNumber ||
      header.po_number ||
      header.id ||
      id ||
      '';

    const currency = header.currency || 'DOP';

    const linesHtml = (doc.lines || [])
      .map((ln: any, idx: number) => {
        const desc = ln.description || '';
        const qty = Number(ln.quantity || 0) || 0;
        const unit = Number(ln.unit_price ?? ln.price ?? ln.unit_cost ?? 0) || 0;
        const total = Number(ln.line_total ?? ln.total ?? ln.total_cost ?? qty * unit) || 0;
        return `
          <tr>
            <td>${idx + 1}</td>
            <td>${desc}</td>
            <td style="text-align:right;">${currency} ${formatAmount(unit)}</td>
            <td style="text-align:right;">${qty}</td>
            <td style="text-align:right;">${currency} ${formatAmount(total)}</td>
          </tr>`;
      })
      .join('');

    const subtotal = Number(header.subtotal ?? header.subtotal_amount ?? header.total_gross ?? 0) || 0;
    const tax = Number(header.tax_amount ?? header.total_itbis ?? header.tax ?? 0) || 0;
    const total = Number(header.total_amount ?? header.total_to_pay ?? header.total ?? 0) || 0;

    const isSupplierDoc = doc.type === 'ap-invoice' || doc.type === 'purchase-order';
    const customerOrSupplierName = isSupplierDoc
      ? (header.suppliers?.name || header.supplier_name || header.vendor_name || '')
      : (header.customers?.name || header.customer_name || '');
    const customerOrSupplierDoc = isSupplierDoc
      ? (header.suppliers?.document || header.suppliers?.tax_id || header.supplier_rnc || header.supplier_document || '')
      : (header.customers?.document || header.customers?.tax_id || header.customer_document || header.tax_id || '');
    const customerOrSupplierPhone = isSupplierDoc
      ? (header.suppliers?.phone || header.supplier_phone || '')
      : (header.customers?.phone || header.customer_phone || '');
    const customerOrSupplierEmail = isSupplierDoc
      ? (header.suppliers?.email || header.supplier_email || '')
      : (header.customers?.email || header.customer_email || '');
    const customerOrSupplierAddress = isSupplierDoc
      ? (header.suppliers?.address || header.supplier_address || '')
      : (header.customers?.address || header.customer_address || '');
    const entityLabel = isSupplierDoc ? 'Suplidor' : 'Cliente';

    return `
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>${titleMap[doc.type]} ${safeNumber}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
            .top { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; }
            .company { font-weight: 800; color:#0b2a6f; }
            .meta { font-size: 12px; color:#6b7280; }
            .doc-title { font-size: 40px; font-weight: 800; color:#9ca3af; text-align:right; }
            .doc-number { font-size: 20px; font-weight: 800; color:#19a34a; text-align:right; }
            table { width:100%; border-collapse: collapse; margin-top: 16px; }
            th { background:#0b2a6f; color:white; padding:8px; text-align:left; font-size: 12px; }
            td { border-bottom: 1px solid #e5e7eb; padding:8px; font-size: 12px; }
            .totals { margin-top: 12px; width: 260px; margin-left: auto; }
            .totals-row { display:flex; justify-content:space-between; padding:6px 0; border-bottom: 1px solid #e5e7eb; font-size: 12px; }
            .totals-row:last-child { border-bottom:none; font-weight:800; }
            .client-section { margin-top: 16px; padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px; background: #f9fafb; }
            .client-title { font-weight: 700; color: #0b2a6f; margin-bottom: 8px; font-size: 13px; }
            .client-info { font-size: 12px; color: #374151; line-height: 1.5; }
            .client-info .label { color: #6b7280; }
          </style>
        </head>
        <body>
          <div class="top">
            <div>
              <div class="company">${companyName}</div>
              ${companyRnc ? `<div class="meta">RNC: ${companyRnc}</div>` : ''}
            </div>
            <div>
              <div class="doc-title">${titleMap[doc.type]}</div>
              <div class="doc-number">#${safeNumber}</div>
            </div>
          </div>
          ${customerOrSupplierName ? `
          <div class="client-section">
            <div class="client-title">${entityLabel}</div>
            <div class="client-info">
              <div><strong>${customerOrSupplierName}</strong></div>
              ${customerOrSupplierDoc ? `<div><span class="label">RNC/Cédula:</span> ${customerOrSupplierDoc}</div>` : ''}
              ${customerOrSupplierPhone ? `<div><span class="label">Teléfono:</span> ${customerOrSupplierPhone}</div>` : ''}
              ${customerOrSupplierEmail ? `<div><span class="label">Email:</span> ${customerOrSupplierEmail}</div>` : ''}
              ${customerOrSupplierAddress ? `<div><span class="label">Dirección:</span> ${customerOrSupplierAddress}</div>` : ''}
            </div>
          </div>
          ` : ''}
          <table>
            <thead>
              <tr>
                <th style="width:54px;">No.</th>
                <th>Descripción</th>
                <th style="width:110px; text-align:right;">Precio</th>
                <th style="width:80px; text-align:right;">Cant.</th>
                <th style="width:120px; text-align:right;">Importe</th>
              </tr>
            </thead>
            <tbody>
              ${linesHtml}
            </tbody>
          </table>
          <div class="totals">
            <div class="totals-row"><span>Subtotal</span><span>${currency} ${formatAmount(subtotal)}</span></div>
            <div class="totals-row"><span>ITBIS/Impuestos</span><span>${currency} ${formatAmount(tax)}</span></div>
            <div class="totals-row"><span>Total</span><span>${currency} ${formatAmount(total)}</span></div>
          </div>
        </body>
      </html>
    `;
  };

  const handlePrint = () => {
    const htmlStr = buildHtml();
    if (!htmlStr) return;
    const blob = new Blob([htmlStr], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const iframe = iframeRef.current;
    if (!iframe) return;

    iframe.onload = () => {
      const win = iframe.contentWindow;
      if (!win) return;
      win.focus();
      win.print();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    };

    iframe.src = url;
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Documento</h1>
            <p className="text-sm text-gray-600">{normalizedType} / {id}</p>
          </div>
          <button
            onClick={handlePrint}
            disabled={!doc || !!error || loading}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            type="button"
          >
            Imprimir
          </button>
        </div>

        {loading ? (
          <div className="bg-white border border-gray-200 rounded-lg p-6 text-sm text-gray-600">Cargando...</div>
        ) : null}

        {error ? (
          <div className="bg-white border border-red-200 rounded-lg p-6 text-sm text-red-700">{error}</div>
        ) : null}

        {!loading && !error && doc ? (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <iframe ref={iframeRef} title="document" className="w-full h-[80vh]" srcDoc={buildHtml()} />
          </div>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
