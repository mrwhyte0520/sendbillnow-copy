import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { formatAmount, getCurrencyPrefix } from '../../utils/numberFormat';

type DocType = 'quote' | 'invoice';

type DocState = {
  type: DocType;
  header: any;
  lines: any[];
  company?: { name?: string | null; rnc?: string | null } | null;
};

export default function PublicDocumentPage() {
  const { type, token } = useParams();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [doc, setDoc] = useState<DocState | null>(null);

  const normalizedType: DocType | null = useMemo(() => {
    const raw = String(type || '').trim().toLowerCase();
    if (raw === 'quote') return 'quote';
    if (raw === 'invoice') return 'invoice';
    return null;
  }, [type]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      setDoc(null);

      if (!normalizedType || !token) {
        setError('Documento inválido.');
        setLoading(false);
        return;
      }

      try {
        const { data, error: rpcError } = await supabase.rpc('get_public_document_by_token', {
          doc_type: normalizedType,
          doc_token: String(token),
        });

        if (rpcError) throw rpcError;
        if (!data) {
          setError('Documento no encontrado o expirado.');
          setLoading(false);
          return;
        }

        const parsed = data as any;
        const header = parsed?.header || null;
        const lines = Array.isArray(parsed?.lines) ? parsed.lines : [];
        const company = parsed?.company || null;
        if (!header) {
          setError('Documento no encontrado o expirado.');
          setLoading(false);
          return;
        }

        setDoc({ type: normalizedType, header, lines, company });
      } catch (e: any) {
        setError(e?.message || 'No se pudo cargar el documento');
      } finally {
        setLoading(false);
      }
    })();
  }, [normalizedType, token]);

  const buildHtml = () => {
    if (!doc) return '';

    const titleMap: Record<DocType, string> = {
      quote: 'COTIZACIÓN',
      invoice: 'FACTURA',
    };

    const header = doc.header || {};
    const safeNumber =
      header.invoice_number ||
      header.invoiceNumber ||
      header.quote_number ||
      header.id ||
      '';

    const currency = header.currency || 'DOP';
    const money = (value: number, opts?: { forTotals?: boolean }) => {
      const prefix = getCurrencyPrefix(currency, { forTotals: opts?.forTotals });
      return `${prefix ? `${prefix} ` : ''}${formatAmount(value)}`;
    };

    const companyName =
      (doc.company as any)?.name ||
      header.company_name ||
      header.companyName ||
      '';

    const companyRnc =
      (doc.company as any)?.rnc ||
      header.company_rnc ||
      header.companyRnc ||
      '';

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
            <td style="text-align:right;">${money(unit)}</td>
            <td style="text-align:right;">${qty}</td>
            <td style="text-align:right;">${money(total)}</td>
          </tr>`;
      })
      .join('');

    const subtotal = Number(header.subtotal ?? header.subtotal_amount ?? header.total_gross ?? header.amount ?? 0) || 0;
    const tax = Number(header.tax_amount ?? header.total_itbis ?? header.tax ?? 0) || 0;
    const total = Number(header.total_amount ?? header.total_to_pay ?? header.total ?? 0) || 0;

    const customerName = header.customers?.name || header.customer_name || '';
    const customerDoc = header.customers?.document || header.customers?.tax_id || header.customer_document || header.tax_id || '';
    const customerPhone = header.customers?.phone || header.customer_phone || '';
    const customerEmail = header.customers?.email || header.customer_email || '';
    const customerAddress = header.customers?.address || header.customer_address || '';

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
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="top">
            <div>
              <div class="company">${companyName}</div>
              ${companyRnc ? `<div class="meta">RNC: ${companyRnc}</div>` : ''}
            </div>
            <div style="text-align:right;">
              <div class="doc-title">${titleMap[doc.type]} ${(header as any).sale_type === 'cash' ? 'CONTADO' : 'CRÉDITO'}</div>
              <div class="doc-number">NCF: ${safeNumber}</div>
              <div class="meta" style="margin-top:8px;">
                ${(header as any).ncf_expiry_date ? `<div><strong>Válida hasta:</strong> ${new Date((header as any).ncf_expiry_date).toLocaleDateString('es-DO')}</div>` : ''}
                ${(header as any).sequential_number ? `<div><strong>Número:</strong> ${(header as any).sequential_number}</div>` : ''}
                ${(header as any).sales_reps?.name ? `<div><strong>Vendedor:</strong> ${(header as any).sales_reps.name}</div>` : ''}
                <div><strong>Moneda:</strong> ${currency === 'DOP' ? 'Peso Dominicano' : currency}</div>
                ${(header as any).store_name ? `<div><strong>Tienda:</strong> ${(header as any).store_name}</div>` : ''}
                ${(header as any).due_date ? `<div><strong>Fecha Límite de Pago:</strong> ${new Date((header as any).due_date).toLocaleDateString('es-DO')}</div>` : ''}
              </div>
            </div>
          </div>
          ${customerName ? `
          <div class="client-section">
            <div class="client-title">Cliente</div>
            <div class="client-info">
              <div><strong>${customerName}</strong></div>
              ${customerDoc ? `<div><span class="label">RNC/Cédula:</span> ${customerDoc}</div>` : ''}
              ${customerPhone ? `<div><span class="label">Teléfono:</span> ${customerPhone}</div>` : ''}
              ${customerEmail ? `<div><span class="label">Email:</span> ${customerEmail}</div>` : ''}
              ${customerAddress ? `<div><span class="label">Dirección:</span> ${customerAddress}</div>` : ''}
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
            <div class="totals-row"><span>Subtotal</span><span>${money(subtotal, { forTotals: true })}</span></div>
            <div class="totals-row"><span>ITBIS/Impuestos</span><span>${money(tax)}</span></div>
            <div class="totals-row"><span>Total</span><span>${money(total, { forTotals: true })}</span></div>
          </div>
        </body>
      </html>
    `;
  };

  const handlePrint = () => {
    const htmlStr = buildHtml();
    if (!htmlStr) return;

    // First try printing the already rendered iframe (most reliable on Android/Chrome)
    try {
      const existingFrame = iframeRef.current;
      const existingWin = existingFrame?.contentWindow;
      if (existingWin) {
        existingWin.focus();
        existingWin.print();
        return;
      }
    } catch {
      // ignore and fallback
    }

    // Prefer Blob URL + new tab printing (more reliable on mobile Safari than document.write)
    const blob = new Blob([htmlStr], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    try {
      const win = window.open(url, '_blank', 'noopener,noreferrer');
      if (win) {
        const cleanup = () => {
          try {
            URL.revokeObjectURL(url);
          } catch {
            // ignore
          }
        };

        const doPrint = () => {
          try {
            win.focus();
            win.print();
            setTimeout(cleanup, 2000);
          } catch {
            // ignore
          }
        };

        // Some browsers don't reliably fire onload for blob windows; keep a delayed fallback
        win.onload = () => setTimeout(doPrint, 150);
        setTimeout(doPrint, 900);
        return;
      }
    } catch {
      // ignore and fallback
    }

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
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto p-0 md:p-4 space-y-4">
        <div className="flex justify-end">
          <button
            onClick={handlePrint}
            disabled={!doc || !!error || loading}
            className="m-4 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
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
          <div className="bg-white border border-gray-200 overflow-hidden">
            <iframe ref={iframeRef} title="public-document" className="w-full h-[90vh]" srcDoc={buildHtml()} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
