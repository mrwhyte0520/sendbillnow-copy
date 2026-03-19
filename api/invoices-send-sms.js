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
  const dynamicParams = body.dynamicParams;
  const phoneOverride = typeof body.phoneNumber === 'string' ? body.phoneNumber.trim() : '';

  if (!invoiceId) return res.status(400).json({ ok: false, error: 'Missing invoiceId' });

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

  // Fire-and-forget: never block the caller.
  try {
    const dp = (dynamicParams && typeof dynamicParams === 'object') ? dynamicParams : null;
    void sendInvoiceSMS({
      phoneNumber,
      customerName: (dp && typeof dp.customerName === 'string') ? dp.customerName : (customer?.name || ''),
      invoiceNumber: (dp && (typeof dp.invoiceNumber === 'string' || typeof dp.invoiceNumber === 'number')) ? dp.invoiceNumber : (inv.invoice_number || ''),
      total: (dp && (typeof dp.total === 'string' || typeof dp.total === 'number')) ? dp.total : (inv.total_amount || 0),
    });
  } catch (e) {
    // Even if something goes wrong synchronously, never fail the request.
    console.error('[invoices-send-sms] enqueue error:', e);
  }

  return res.status(200).json({ ok: true, queued: true });
}
