import { getBearerToken, getSupabaseAdminClient, getSupabaseClient, readJsonBody, requireUser, resolveTenantId } from './_shared.js';

function isHttpUrl(input) {
  return /^https?:\/\//i.test(String(input || '').trim());
}

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

  const admin = getSupabaseAdminClient();

  const { user, error: userError } = await requireUser(supabase);
  if (userError) return res.status(401).json({ ok: false, error: userError });

  const tenantId = await resolveTenantId(supabase, user);
  if (!tenantId) return res.status(400).json({ ok: false, error: 'Missing tenant id' });

  const body = await readJsonBody(req);
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ ok: false, error: 'Invalid JSON body' });
  }

  const documentId = String(body.documentId || body.document_id || body.id || '').trim();
  if (!documentId) return res.status(400).json({ ok: false, error: 'Missing documentId' });

  const { data: doc, error: docError } = await supabase
    .from('service_documents')
    .select('*')
    .eq('id', documentId)
    .eq('user_id', tenantId)
    .limit(1)
    .maybeSingle();

  if (docError) return res.status(500).json({ ok: false, error: docError.message || 'Could not load document' });
  if (!doc?.id) return res.status(404).json({ ok: false, error: 'Document not found' });

  let lines = null;
  let linesError = null;
  {
    const resp = await supabase
      .from('service_document_lines')
      .select('id, position, inventory_item_id, description, quantity, unit_price, unit_cost, taxable, line_total, created_at')
      .eq('document_id', documentId)
      .eq('user_id', tenantId)
      .order('position', { ascending: true });
    lines = resp.data;
    linesError = resp.error;
  }

  // Backward compatibility: allow loading documents even if migration hasn't been applied yet.
  if (linesError && String(linesError.message || '').toLowerCase().includes('unit_cost')) {
    const resp = await supabase
      .from('service_document_lines')
      .select('id, position, inventory_item_id, description, quantity, unit_price, taxable, line_total, created_at')
      .eq('document_id', documentId)
      .eq('user_id', tenantId)
      .order('position', { ascending: true });
    lines = resp.data;
    linesError = resp.error;
  }

  if (linesError) return res.status(500).json({ ok: false, error: linesError.message || 'Could not load lines' });

  const { data: signature, error: sigError } = await supabase
    .from('service_document_signatures')
    .select('client_name, client_signature_image, client_signed_at, contractor_name, contractor_signature_image, contractor_signed_at')
    .eq('document_id', documentId)
    .eq('user_id', tenantId)
    .limit(1)
    .maybeSingle();

  if (sigError) return res.status(500).json({ ok: false, error: sigError.message || 'Could not load signatures' });

  const sigBucket = 'service-doc-signatures';
  let signedSignature = signature ?? null;

  if (signature) {
    signedSignature = { ...signature };

    const clientPathOrUrl = String(signature.client_signature_image || '').trim();
    if (admin && clientPathOrUrl && !isHttpUrl(clientPathOrUrl)) {
      const signed = await admin.storage.from(sigBucket).createSignedUrl(clientPathOrUrl, 60 * 60).catch(() => null);
      if (signed?.data?.signedUrl) signedSignature.client_signature_image = String(signed.data.signedUrl);
    }

    const contractorPathOrUrl = String(signature.contractor_signature_image || '').trim();
    if (admin && contractorPathOrUrl && !isHttpUrl(contractorPathOrUrl)) {
      const signed = await admin.storage.from(sigBucket).createSignedUrl(contractorPathOrUrl, 60 * 60).catch(() => null);
      if (signed?.data?.signedUrl) signedSignature.contractor_signature_image = String(signed.data.signedUrl);
    }
  }

  const pdfBucket = 'service-documents-pdf';
  const sealedPdfPath = String(doc.sealed_pdf_path || '').trim();
  let sealedPdfUrl = null;

  if (admin && sealedPdfPath) {
    const signed = await admin.storage.from(pdfBucket).createSignedUrl(sealedPdfPath, 7 * 24 * 60 * 60).catch(() => null);
    if (signed?.data?.signedUrl) sealedPdfUrl = String(signed.data.signedUrl);
  }

  return res.status(200).json({
    ok: true,
    document: doc,
    lines: lines ?? [],
    signature: signedSignature,
    sealed_pdf_url: sealedPdfUrl,
  });
}
