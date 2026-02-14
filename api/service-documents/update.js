import { getBearerToken, getSupabaseClient, normalizeTaxRate, readJsonBody, requireUser, resolveTenantId } from './_shared.js';

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
  if (!accessToken) return res.status(401).json({ ok: false, error: 'Missing access token' });

  const supabase = getSupabaseClient(accessToken);
  if (!supabase) return res.status(500).json({ ok: false, error: 'Server misconfiguration' });

  const { user, error: userError } = await requireUser(supabase);
  if (userError) return res.status(401).json({ ok: false, error: userError });

  const tenantId = await resolveTenantId(supabase, user);
  if (!tenantId) return res.status(400).json({ ok: false, error: 'Missing tenant id' });

  const body = await readJsonBody(req);
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ ok: false, error: 'Invalid JSON body' });
  }

  const id = String(body.id || body.documentId || body.document_id || '').trim();
  if (!id) return res.status(400).json({ ok: false, error: 'Missing document id' });

  const { data: current, error: currError } = await supabase
    .from('service_documents')
    .select('id, status, sealed_at, voided_at, expired_at')
    .eq('id', id)
    .eq('user_id', tenantId)
    .maybeSingle();

  if (currError) return res.status(500).json({ ok: false, error: currError.message || 'Could not read document' });
  if (!current?.id) return res.status(404).json({ ok: false, error: 'Document not found' });

  const status = String(current.status || '');
  if (current.sealed_at || status === 'Sealed') {
    return res.status(400).json({ ok: false, error: 'Document is sealed' });
  }
  if (current.voided_at || status === 'Voided') {
    return res.status(400).json({ ok: false, error: 'Document is voided' });
  }
  if (current.expired_at || status === 'Expired') {
    return res.status(400).json({ ok: false, error: 'Document is expired' });
  }
  if (status !== 'Draft' && status !== 'Sent' && status !== 'Viewed') {
    return res.status(400).json({ ok: false, error: 'Document cannot be edited in current status' });
  }

  const patch = {};

  if (body.clientName !== undefined || body.client_name !== undefined) {
    const v = String(body.clientName ?? body.client_name ?? '').trim();
    if (!v) return res.status(400).json({ ok: false, error: 'clientName is required' });
    patch.client_name = v;
  }

  if (body.clientEmail !== undefined || body.client_email !== undefined) {
    const v = String(body.clientEmail ?? body.client_email ?? '').trim();
    patch.client_email = v || null;
  }

  if (body.clientPhone !== undefined || body.client_phone !== undefined) {
    const v = String(body.clientPhone ?? body.client_phone ?? '').trim();
    patch.client_phone = v || null;
  }

  if (body.clientAddress !== undefined || body.client_address !== undefined) {
    const v = String(body.clientAddress ?? body.client_address ?? '').trim();
    patch.client_address = v || null;
  }

  if (body.accountNumber !== undefined || body.account_number !== undefined) {
    const v = String(body.accountNumber ?? body.account_number ?? '').trim();
    patch.account_number = v || null;
  }

  if (body.currency !== undefined) {
    const v = String(body.currency ?? '').trim();
    if (v) patch.currency = v;
  }

  if (body.taxRate !== undefined || body.tax_rate !== undefined) {
    const n = Number(body.taxRate ?? body.tax_rate);
    if (!Number.isFinite(n) || n < 0) {
      return res.status(400).json({ ok: false, error: 'Invalid taxRate' });
    }
    patch.tax_rate = normalizeTaxRate(n);
  }

  if (body.termsSnapshot !== undefined || body.terms_snapshot !== undefined) {
    const v = String(body.termsSnapshot ?? body.terms_snapshot ?? '').trim();
    patch.terms_snapshot = v || '';
  }

  if (!Object.keys(patch).length) {
    return res.status(200).json({ ok: true, document: null });
  }

  const { data: updated, error } = await supabase
    .from('service_documents')
    .update(patch)
    .eq('id', id)
    .eq('user_id', tenantId)
    .select('id, doc_type, status, doc_number, currency, account_number, company_name, company_rnc, company_phone, company_email, company_address, company_logo, client_name, client_email, client_phone, client_address, terms_snapshot, tax_rate, subtotal, tax, total, sent_at, viewed_at, client_signed_at, created_at, updated_at')
    .maybeSingle();

  if (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Could not update document' });
  }

  return res.status(200).json({ ok: true, document: updated });
}
