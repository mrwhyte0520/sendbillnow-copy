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
  if (!supabase) {
    const missing = [];
    if (!process.env.SUPABASE_URL) missing.push('SUPABASE_URL');
    if (!process.env.SUPABASE_ANON_KEY) missing.push('SUPABASE_ANON_KEY');
    const extra = missing.length ? `Missing ${missing.join(', ')}` : 'Missing SUPABASE_* configuration';
    return res.status(500).json({ ok: false, error: `Server misconfiguration. ${extra}` });
  }

  const { user, error: userError } = await requireUser(supabase);
  if (userError) return res.status(401).json({ ok: false, error: userError });

  const tenantId = await resolveTenantId(supabase, user);
  if (!tenantId) return res.status(400).json({ ok: false, error: 'Missing tenant id' });

  const body = await readJsonBody(req);
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ ok: false, error: 'Invalid JSON body' });
  }

  const docType = String(body.docType || body.doc_type || '').trim();
  if (!docType || (docType !== 'JOB_ESTIMATE' && docType !== 'CLASSIC_INVOICE')) {
    return res.status(400).json({ ok: false, error: 'Invalid docType' });
  }

  const clientName = String(body.clientName || body.client_name || '').trim();
  if (!clientName) return res.status(400).json({ ok: false, error: 'clientName is required' });

  const clientEmail = typeof body.clientEmail === 'string' ? body.clientEmail.trim() : (typeof body.client_email === 'string' ? body.client_email.trim() : '');
  const clientPhone = typeof body.clientPhone === 'string' ? body.clientPhone.trim() : (typeof body.client_phone === 'string' ? body.client_phone.trim() : '');
  const clientAddress = typeof body.clientAddress === 'string' ? body.clientAddress.trim() : (typeof body.client_address === 'string' ? body.client_address.trim() : '');

  const { data: company } = await supabase
    .from('company_info')
    .select('name, ruc, phone, email, address, logo, currency, terms_and_conditions, default_tax_rate')
    .eq('user_id', tenantId)
    .limit(1)
    .maybeSingle();

  let docNumber;

  if (docType === 'JOB_ESTIMATE') {
    // Use the same numbering system as invoices (4873xxx format)
    const { data: rawNum, error: seqError } = await supabase.rpc('next_invoice_number', {
      p_tenant_id: tenantId,
    });
    if (seqError) {
      return res.status(500).json({ ok: false, error: seqError.message || 'Could not generate document number' });
    }
    // Format: 4873000031 → 4873031 (same display as invoices)
    const s = String(rawNum || '').trim();
    const pfx = '4873';
    if (s.startsWith(pfx) && /^[0-9]+$/.test(s.slice(pfx.length))) {
      const counter = parseInt(s.slice(pfx.length), 10);
      const block = Math.floor(counter / 1000);
      const remainder = counter % 1000;
      const padded = String(remainder).padStart(3, '0');
      docNumber = `${pfx}${block > 0 ? String(block) : ''}${padded}`;
    } else {
      docNumber = s;
    }
  } else {
    const { data: rawNum, error: seqError } = await supabase.rpc('next_document_number', {
      p_tenant_id: tenantId,
      p_doc_key: 'service_document_classic_invoice',
      p_prefix: 'CI',
      p_padding: 6,
    });
    if (seqError) {
      return res.status(500).json({ ok: false, error: seqError.message || 'Could not generate document number' });
    }
    docNumber = rawNum;
  }

  const currency = String(body.currency || '').trim() || String(company?.currency || '').trim() || 'USD';
  const defaultTaxRate = Number(company?.default_tax_rate ?? 0.18);
  const taxRate = Number(body.taxRate ?? body.tax_rate ?? defaultTaxRate);
  const safeRate = normalizeTaxRate(taxRate);

  const termsSnapshot = String(body.termsSnapshot || body.terms_snapshot || company?.terms_and_conditions || '').trim();

  const payload = {
    user_id: tenantId,
    doc_type: docType,
    status: 'Draft',
    doc_number: String(docNumber || '').trim(),
    currency,
    company_name: company?.name ?? null,
    company_rnc: company?.ruc ?? null,
    company_phone: company?.phone ?? null,
    company_email: company?.email ?? null,
    company_address: company?.address ?? null,
    company_logo: company?.logo ?? null,
    client_name: clientName,
    client_email: clientEmail || null,
    client_phone: clientPhone || null,
    client_address: clientAddress || null,
    terms_snapshot: termsSnapshot || '',
    tax_rate: safeRate,
    subtotal: 0,
    tax: 0,
    total: 0,
  };

  const { data, error } = await supabase
    .from('service_documents')
    .insert(payload)
    .select('id, doc_type, status, doc_number, currency, company_name, company_rnc, company_phone, company_email, company_address, company_logo, client_name, client_email, client_phone, client_address, terms_snapshot, tax_rate, subtotal, tax, total, created_at, updated_at')
    .single();

  if (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Could not create document' });
  }

  return res.status(200).json({ ok: true, document: data });
}
