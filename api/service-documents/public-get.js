import { getSupabaseAdminClient, readJsonBody, sha256Hex, insertEvent } from './_shared.js';

function isHttpUrl(input) {
  return /^https?:\/\//i.test(String(input || '').trim());
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) return res.status(500).json({ ok: false, error: 'Server misconfiguration' });

  const body = await readJsonBody(req);
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ ok: false, error: 'Invalid JSON body' });
  }

  const tokenRaw = String(body.token || '').trim();
  if (!tokenRaw) return res.status(400).json({ ok: false, error: 'Missing token' });

  const tokenHash = sha256Hex(tokenRaw);

  const { data: tokenRow, error: tokError } = await supabase
    .from('service_document_tokens')
    .select('id, user_id, document_id, expires_at, revoked_at, last_viewed_at')
    .eq('token_hash', tokenHash)
    .limit(1)
    .maybeSingle();

  if (tokError) return res.status(500).json({ ok: false, error: tokError.message || 'Token lookup failed' });
  if (!tokenRow?.id) return res.status(404).json({ ok: false, error: 'Invalid token' });

  if (tokenRow.revoked_at) return res.status(400).json({ ok: false, error: 'Token revoked' });
  if (tokenRow.expires_at && new Date(tokenRow.expires_at).getTime() <= Date.now()) {
    return res.status(400).json({ ok: false, error: 'Token expired' });
  }

  const tenantId = String(tokenRow.user_id);
  const documentId = String(tokenRow.document_id);

  const { data: doc, error: docError } = await supabase
    .from('service_documents')
    .select('id, user_id, doc_type, status, doc_number, currency, account_number, company_name, company_rnc, company_phone, company_email, company_address, company_logo, client_name, client_email, client_phone, client_address, terms_snapshot, tax_rate, subtotal, tax, total, material_cost, sent_at, viewed_at, client_signed_at, created_at, updated_at, voided_at, expired_at')
    .eq('id', documentId)
    .eq('user_id', tenantId)
    .maybeSingle();

  if (docError) return res.status(500).json({ ok: false, error: docError.message || 'Could not load document' });
  if (!doc?.id) return res.status(404).json({ ok: false, error: 'Document not found' });

  if (doc.voided_at || doc.expired_at || doc.status === 'Voided' || doc.status === 'Expired') {
    return res.status(400).json({ ok: false, error: 'Document not available' });
  }

  const { data: lines, error: linesError } = await supabase
    .from('service_document_lines')
    .select('id, position, inventory_item_id, description, quantity, unit_price, taxable, line_total, created_at')
    .eq('document_id', documentId)
    .eq('user_id', tenantId)
    .order('position', { ascending: true });

  if (linesError) return res.status(500).json({ ok: false, error: linesError.message || 'Could not load lines' });

  const { data: signature } = await supabase
    .from('service_document_signatures')
    .select('client_name, client_signature_image, client_signed_at, contractor_name, contractor_signature_image, contractor_signed_at')
    .eq('document_id', documentId)
    .eq('user_id', tenantId)
    .limit(1)
    .maybeSingle();

  const bucket = 'service-doc-signatures';
  let signedSignature = signature ?? null;
  if (signature) {
    signedSignature = { ...signature };

    const clientPathOrUrl = String(signature.client_signature_image || '').trim();
    if (clientPathOrUrl && !isHttpUrl(clientPathOrUrl)) {
      const signed = await supabase.storage.from(bucket).createSignedUrl(clientPathOrUrl, 60 * 60).catch(() => null);
      if (signed?.data?.signedUrl) signedSignature.client_signature_image = String(signed.data.signedUrl);
    }

    const contractorPathOrUrl = String(signature.contractor_signature_image || '').trim();
    if (contractorPathOrUrl && !isHttpUrl(contractorPathOrUrl)) {
      const signed = await supabase.storage.from(bucket).createSignedUrl(contractorPathOrUrl, 60 * 60).catch(() => null);
      if (signed?.data?.signedUrl) signedSignature.contractor_signature_image = String(signed.data.signedUrl);
    }
  }

  const nowIso = new Date().toISOString();

  await supabase
    .from('service_document_tokens')
    .update({ last_viewed_at: nowIso })
    .eq('id', tokenRow.id);

  const firstView = !doc.viewed_at;
  if (firstView && (doc.status === 'Sent' || doc.status === 'Viewed')) {
    await supabase
      .from('service_documents')
      .update({ viewed_at: nowIso })
      .eq('id', documentId)
      .eq('user_id', tenantId);

    await insertEvent({ supabase, tenantId, documentId, eventType: 'VIEWED', meta: {} });

    doc.viewed_at = nowIso;
  }

  return res.status(200).json({
    ok: true,
    document: doc,
    lines: lines ?? [],
    signature: signedSignature,
  });
}
