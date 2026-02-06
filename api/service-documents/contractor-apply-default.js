import { getBearerToken, getSupabaseAdminClient, getSupabaseClient, readJsonBody, requireUser, resolveTenantId, parseBase64Image, insertEvent } from './_shared.js';

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
  if (!admin) return res.status(500).json({ ok: false, error: 'Server misconfiguration' });

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
    .select('id, status, client_signed_at, contractor_signed_at, sealed_at, voided_at, expired_at')
    .eq('id', documentId)
    .eq('user_id', tenantId)
    .limit(1)
    .maybeSingle();

  if (docError) return res.status(500).json({ ok: false, error: docError.message || 'Could not read document' });
  if (!doc?.id) return res.status(404).json({ ok: false, error: 'Document not found' });

  const status = String(doc.status || '');
  if (doc.sealed_at || status === 'Sealed') {
    return res.status(400).json({ ok: false, error: 'Document is already sealed' });
  }
  if (doc.voided_at || status === 'Voided') {
    return res.status(400).json({ ok: false, error: 'Document is voided' });
  }
  if (doc.expired_at || status === 'Expired') {
    return res.status(400).json({ ok: false, error: 'Document is expired' });
  }

  if (status !== 'ClientSigned') {
    if (status === 'ContractorSigned' && doc.contractor_signed_at) {
      return res.status(200).json({ ok: true, already_signed: true });
    }
    return res.status(400).json({ ok: false, error: 'Contractor signing is only allowed after client signs' });
  }

  if (!doc.client_signed_at) {
    return res.status(400).json({ ok: false, error: 'Document is not client-signed' });
  }

  if (doc.contractor_signed_at) {
    return res.status(200).json({ ok: true, already_signed: true });
  }

  const { data: company, error: companyError } = await supabase
    .from('company_info')
    .select('contractor_signature_name, contractor_signature_image')
    .eq('user_id', tenantId)
    .limit(1)
    .maybeSingle();

  if (companyError) return res.status(500).json({ ok: false, error: companyError.message || 'Could not read company settings' });

  const contractorName = String(company?.contractor_signature_name || '').trim() || null;
  const contractorSignatureBase64Raw = String(company?.contractor_signature_image || '').trim();
  if (!contractorSignatureBase64Raw) {
    return res.status(400).json({ ok: false, error: 'Missing default contractor signature image' });
  }

  const { base64, contentType } = parseBase64Image(contractorSignatureBase64Raw);
  let buf;
  try {
    buf = Buffer.from(base64, 'base64');
  } catch {
    return res.status(400).json({ ok: false, error: 'Invalid signature base64' });
  }

  if (!buf?.length) return res.status(400).json({ ok: false, error: 'Empty signature image' });

  const ext = contentType.includes('jpeg') ? 'jpg' : contentType.includes('webp') ? 'webp' : 'png';
  const random = Math.random().toString(16).slice(2);
  const path = `${tenantId}/${documentId}/contractor-default-${Date.now()}-${random}.${ext}`;
  const bucket = 'service-doc-signatures';

  const upload = await admin.storage.from(bucket).upload(path, buf, {
    contentType,
    upsert: false,
  });

  if (upload.error) {
    return res.status(500).json({ ok: false, error: upload.error.message || 'Could not upload signature' });
  }

  const nowIso = new Date().toISOString();

  const { error: sigError } = await supabase
    .from('service_document_signatures')
    .upsert(
      {
        user_id: tenantId,
        document_id: documentId,
        contractor_name: contractorName,
        contractor_signature_image: path,
        contractor_signed_at: nowIso,
      },
      { onConflict: 'document_id' }
    );

  if (sigError) return res.status(500).json({ ok: false, error: sigError.message || 'Could not save signature' });

  const nextStatus = 'ContractorSigned';

  const { error: docUpdError } = await supabase
    .from('service_documents')
    .update({ status: nextStatus, contractor_signed_at: nowIso })
    .eq('id', documentId)
    .eq('user_id', tenantId);

  if (docUpdError) return res.status(500).json({ ok: false, error: docUpdError.message || 'Could not update document status' });

  await insertEvent({
    supabase,
    tenantId,
    documentId,
    eventType: 'CONTRACTOR_SIGNED',
    meta: { method: 'default', signature_path: path },
  });

  let signedUrl = null;
  const signed = await admin.storage.from(bucket).createSignedUrl(path, 60 * 60).catch(() => null);
  if (signed?.data?.signedUrl) signedUrl = String(signed.data.signedUrl);

  return res.status(200).json({
    ok: true,
    status: nextStatus,
    signature: {
      contractor_name: contractorName,
      contractor_signature_image: signedUrl,
      contractor_signed_at: nowIso,
    },
  });
}
