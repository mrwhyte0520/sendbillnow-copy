import { getSupabaseAdminClient, readJsonBody, sha256Hex, parseBase64Image, getClientIp, recalcTotals, insertEvent } from './_shared.js';

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
  const clientName = String(body.client_name || body.clientName || '').trim();
  const signatureBase64Raw = String(body.signature_image_base64 || body.signatureBase64 || body.signature || '').trim();

  if (!tokenRaw) return res.status(400).json({ ok: false, error: 'Missing token' });
  if (!clientName) return res.status(400).json({ ok: false, error: 'Missing clientName' });
  if (!signatureBase64Raw) return res.status(400).json({ ok: false, error: 'Missing signature image' });

  const tokenHash = sha256Hex(tokenRaw);

  const { data: tokenRow, error: tokError } = await supabase
    .from('service_document_tokens')
    .select('id, user_id, document_id, expires_at, revoked_at')
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
    .select('id, user_id, status, client_signed_at, contractor_signed_at, sealed_at, voided_at, expired_at')
    .eq('id', documentId)
    .eq('user_id', tenantId)
    .maybeSingle();

  if (docError) return res.status(500).json({ ok: false, error: docError.message || 'Could not load document' });
  if (!doc?.id) return res.status(404).json({ ok: false, error: 'Document not found' });

  const status = String(doc.status || '');
  if (doc.client_signed_at || status === 'ClientSigned' || status === 'ContractorSigned' || status === 'Sealed' || status === 'Voided' || status === 'Expired') {
    return res.status(400).json({ ok: false, error: 'Document cannot be signed' });
  }

  try {
    await recalcTotals({ supabase, tenantId, documentId });
  } catch {}

  const { base64, contentType } = parseBase64Image(signatureBase64Raw);
  let buf;
  try {
    buf = Buffer.from(base64, 'base64');
  } catch {
    return res.status(400).json({ ok: false, error: 'Invalid signature base64' });
  }

  if (!buf?.length) return res.status(400).json({ ok: false, error: 'Empty signature image' });

  const ext = contentType.includes('jpeg') ? 'jpg' : contentType.includes('webp') ? 'webp' : 'png';
  const random = Math.random().toString(16).slice(2);
  const path = `${tenantId}/${documentId}/client-${Date.now()}-${random}.${ext}`;
  const bucket = 'service-doc-signatures';

  const upload = await supabase.storage.from(bucket).upload(path, buf, {
    contentType,
    upsert: false,
  });

  if (upload.error) {
    return res.status(500).json({ ok: false, error: upload.error.message || 'Could not upload signature' });
  }

  const nowIso = new Date().toISOString();
  const ip = getClientIp(req);
  const userAgent = String(req.headers['user-agent'] || '').trim() || null;

  const { error: sigError } = await supabase
    .from('service_document_signatures')
    .upsert(
      {
        user_id: tenantId,
        document_id: documentId,
        client_name: clientName,
        client_signature_image: path,
        client_signed_ip: ip,
        client_signed_user_agent: userAgent,
        client_signed_at: nowIso,
      },
      { onConflict: 'document_id' }
    );

  if (sigError) return res.status(500).json({ ok: false, error: sigError.message || 'Could not save signature' });

  const nextStatus = doc.contractor_signed_at ? 'ContractorSigned' : 'ClientSigned';

  const { error: docUpdError } = await supabase
    .from('service_documents')
    .update({ status: nextStatus, client_signed_at: nowIso })
    .eq('id', documentId)
    .eq('user_id', tenantId);

  if (docUpdError) return res.status(500).json({ ok: false, error: docUpdError.message || 'Could not update document status' });

  const { error: tokUpdError } = await supabase
    .from('service_document_tokens')
    .update({ revoked_at: nowIso, last_used_at: nowIso })
    .eq('user_id', tenantId)
    .eq('document_id', documentId)
    .is('revoked_at', null);

  if (tokUpdError) return res.status(500).json({ ok: false, error: tokUpdError.message || 'Could not revoke token' });

  await insertEvent({ supabase, tenantId, documentId, eventType: 'CLIENT_SIGNED', meta: { ip, user_agent: userAgent, signature_path: path } });

  return res.status(200).json({ ok: true });
}
