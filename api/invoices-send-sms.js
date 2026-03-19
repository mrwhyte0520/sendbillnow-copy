import { getBearerToken, getSupabaseClient, readJsonBody, requireUser, resolveTenantId } from './service-documents/_shared.js';
import { sendInvoiceSMS } from './smsService.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const accessToken = getBearerToken(req);
  if (!accessToken) return res.status(401).json({ ok: false, error: 'Missing Authorization token' });

  const supabase = getSupabaseClient(accessToken);
  if (!supabase) return res.status(500).json({ ok: false, error: 'Missing SUPABASE_URL or SUPABASE_ANON_KEY' });

  const { user, error: userError } = await requireUser(supabase);
  if (userError || !user?.id) {
    return res.status(401).json({ ok: false, error: userError || 'Unauthorized' });
  }

  const tenantId = await resolveTenantId(supabase, user);
  if (!tenantId) {
    return res.status(400).json({ ok: false, error: 'Could not resolve tenant' });
  }

  const body = await readJsonBody(req);
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ ok: false, error: 'Invalid JSON body' });
  }

  const invoiceId = String(body.invoiceId || body.invoice_id || '').trim();
  const templateId = body.templateId;
  const dynamicParams = body.dynamicParams;
  const phoneOverride = typeof body.phoneNumber === 'string' ? body.phoneNumber.trim() : '';

  if (!invoiceId) return res.status(400).json({ ok: false, error: 'Missing invoiceId' });
  if (templateId === undefined || templateId === null || String(templateId).trim() === '') {
    return res.status(400).json({ ok: false, error: 'Missing templateId' });
  }

  // Load invoice and customer phone. (best-effort) — do not fail if customer join changes.
  const { data: inv, error: invErr } = await supabase
    .from('invoices')
    .select('id, invoice_number, total_amount, customer_id, customers (id, name, phone)')
    .eq('id', invoiceId)
    .eq('user_id', tenantId)
    .maybeSingle();

  if (invErr) return res.status(500).json({ ok: false, error: invErr.message || 'Could not load invoice' });
  if (!inv?.id) return res.status(404).json({ ok: false, error: 'Invoice not found' });

  const customer = inv.customers || null;
  const phoneNumber = phoneOverride || String(customer?.phone || '').trim();

  if (!phoneNumber) {
    return res.status(400).json({ ok: false, error: 'Customer phone number not found' });
  }

  // Robust: SMS failures never crash the server; we return ok=false with details.
  const smsResult = await sendInvoiceSMS({
    phoneNumber,
    templateId,
    dynamicParams: (dynamicParams && typeof dynamicParams === 'object') ? dynamicParams : {
      customerName: customer?.name || '',
      invoiceNumber: inv.invoice_number || '',
      total: inv.total_amount || 0,
    },
  });

  if (!smsResult.ok) {
    // Return 200 so invoice flow can treat this as non-fatal (client decides), but mark ok=false.
    return res.status(200).json({ ok: false, sent: false, error: smsResult.error || 'SMS failed', code: smsResult.code || null });
  }

  return res.status(200).json({ ok: true, sent: true, result: smsResult.result || null });
}
