import { getBearerToken, getSupabaseClient, normalizeTaxRate, readJsonBody, requireUser, resolveTenantId } from './_shared.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
  try {
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST, OPTIONS');
      return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    }

    console.log('=== CREATE SERVICE DOCUMENT START ===', req.body);

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
  const accountNumber = typeof body.accountNumber === 'string' ? body.accountNumber.trim() : (typeof body.account_number === 'string' ? body.account_number.trim() : '');

  const { data: company } = await supabase
    .from('company_info')
    .select('name, ruc, phone, email, address, city, state, zip, logo, currency, terms_and_conditions, default_tax_rate')
    .eq('user_id', tenantId)
    .limit(1)
    .maybeSingle();

  const companyStreet = typeof company?.address === 'string' ? company.address.trim() : '';
  const companyCity = typeof company?.city === 'string' ? company.city.trim() : '';
  const companyState = typeof company?.state === 'string' ? company.state.trim() : '';
  const companyZip = typeof company?.zip === 'string' ? company.zip.trim() : '';

  const companySecondLine = [companyCity, [companyState, companyZip].filter(Boolean).join(' ')].filter(Boolean).join(companyCity ? ', ' : '');
  const companyAddressSnapshot = [companyStreet, companySecondLine].filter(Boolean).join('\n') || null;

  let docNumber;

  let effectiveAccountNumber = accountNumber;

  if (docType === 'JOB_ESTIMATE') {
    // Use the same numbering system as invoices (4873xxx format)
    let rawNum = null;
    try {
      const { data, error: seqError } = await supabase.rpc('next_invoice_number', {
        p_tenant_id: tenantId,
      });
      if (seqError) throw seqError;
      rawNum = data;
    } catch (e) {
      rawNum = `LOCAL-${Date.now()}`;
    }
    // Format: always 8 digits.
    // Rule: 4873 + 4-digit counter (padStart), e.g. 48730100, 48730101
    const s = String(rawNum || '').trim();
    const pfx = '4873';
    if (s.startsWith(pfx) && /^[0-9]+$/.test(s.slice(pfx.length))) {
      const counter = parseInt(s.slice(pfx.length), 10);
      const padded = String(counter).padStart(4, '0');
      docNumber = `${pfx}${padded}`;
    } else {
      docNumber = s;
    }

    if (!effectiveAccountNumber) {
      try {
        const { data: acctNum, error: acctErr } = await supabase.rpc('next_service_document_account_number', {
          p_tenant_id: tenantId,
        });
        if (acctErr) throw acctErr;
        effectiveAccountNumber = String(acctNum || '').trim();
      } catch {
        effectiveAccountNumber = `LOCAL-${Date.now()}`;
      }
    }
  } else {
    try {
      const { data: rawNum, error: seqError } = await supabase.rpc('next_document_number', {
        p_tenant_id: tenantId,
        p_doc_key: 'service_document_classic_invoice',
        p_prefix: 'CI',
        p_padding: 6,
      });
      if (seqError) throw seqError;
      docNumber = rawNum;
    } catch {
      docNumber = `CI-LOCAL-${Date.now()}`;
    }
  }

  const currency = String(body.currency || '').trim() || String(company?.currency || '').trim() || 'USD';
  const defaultTaxRate = Number(company?.default_tax_rate ?? 0.18);
  const taxRate = Number(body.taxRate ?? body.tax_rate ?? defaultTaxRate);
  const safeRate = normalizeTaxRate(taxRate);

  const rawValidDays = Number(body.validForDays ?? body.valid_for_days ?? 30);
  const validForDays = Number.isFinite(rawValidDays) && rawValidDays > 0 ? Math.floor(rawValidDays) : 30;

  const termsSnapshot = String(body.termsSnapshot || body.terms_snapshot || company?.terms_and_conditions || '').trim();

  const payload = {
    user_id: tenantId,
    doc_type: docType,
    status: 'Draft',
    doc_number: String(docNumber || '').trim(),
    currency,
    account_number: effectiveAccountNumber || null,
    valid_for_days: validForDays,
    company_name: company?.name ?? null,
    company_rnc: company?.ruc ?? null,
    company_phone: company?.phone ?? null,
    company_email: company?.email ?? null,
    company_address: companyAddressSnapshot,
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
    .select('id, doc_type, status, doc_number, currency, account_number, valid_for_days, company_name, company_rnc, company_phone, company_email, company_address, company_logo, client_name, client_email, client_phone, client_address, terms_snapshot, tax_rate, subtotal, tax, total, created_at, updated_at')
    .single();

  if (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Could not create document' });
  }

  return res.status(200).json({ ok: true, document: data });
  } catch (err) {
    console.error('[service-documents/create] fatal error:', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Service document create failed' });
  }
}
