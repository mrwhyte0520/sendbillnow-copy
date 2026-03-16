import { getSupabaseAdminClient, readJsonBody, sha256Hex, parseBase64Image, getClientIp, recalcTotals, insertEvent } from './_shared.js';

function escapeHtml(input) {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function isValidEmail(input) {
  const email = String(input || '').trim();
  if (!email) return false;
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailPattern.test(email);
}

async function sendCompanySignedNotification({ to, companyName, docNumber, client }) {
  const resendApiKey = String(process.env.RESEND_API_KEY || '').trim();
  if (!resendApiKey) return;
  if (!isValidEmail(to)) return;

  const resendFrom = (process.env.RESEND_FROM && String(process.env.RESEND_FROM).trim())
    ? String(process.env.RESEND_FROM).trim()
    : 'Send Bill Now <onboarding@resend.dev>';
  const resendReplyTo = (process.env.RESEND_REPLY_TO && String(process.env.RESEND_REPLY_TO).trim())
    ? String(process.env.RESEND_REPLY_TO).trim()
    : null;

  const safeCompany = escapeHtml(companyName || 'Send Bill Now');
  const safeDocNumber = escapeHtml(docNumber || '');
  const safeClientName = escapeHtml(client?.name || '');
  const safeClientEmail = escapeHtml(client?.email || '');
  const safeClientPhone = escapeHtml(client?.phone || '');
  const safeClientAddress = escapeHtml(client?.address || '');

  const subject = `Job Estimate ${docNumber || ''} signed by ${client?.name || 'customer'}`.trim();

  const html = `
    <div style="font-family: Arial, sans-serif; color: #111;">
      <h2 style="margin:0 0 12px 0;">Job Estimate Signed</h2>
      <p style="margin:0 0 12px 0;"><strong>${safeCompany}</strong> — your Job Estimate has been signed.</p>

      <div style="padding:12px; border:1px solid #e5e7eb; border-radius:10px; background:#f9fafb;">
        <div style="margin-bottom:6px;"><strong>Job Estimate #:</strong> ${safeDocNumber}</div>
        <div style="margin-bottom:6px;"><strong>Customer:</strong> ${safeClientName}</div>
        ${safeClientEmail ? `<div style="margin-bottom:6px;"><strong>Email:</strong> ${safeClientEmail}</div>` : ''}
        ${safeClientPhone ? `<div style="margin-bottom:6px;"><strong>Phone:</strong> ${safeClientPhone}</div>` : ''}
        ${safeClientAddress ? `<div style="margin-bottom:6px;"><strong>Address:</strong> ${safeClientAddress}</div>` : ''}
      </div>

      <p style="margin:12px 0 0 0; font-size: 12px; color:#6b7280;">This is an automated notification from Send Bill Now.</p>
    </div>
  `;

  const payload = {
    from: resendFrom,
    to: [to],
    subject,
    html,
    text: `Job Estimate Signed\n\nJob Estimate #: ${docNumber || ''}\nCustomer: ${client?.name || ''}\nEmail: ${client?.email || ''}\nPhone: ${client?.phone || ''}\nAddress: ${client?.address || ''}`,
  };

  if (resendReplyTo) {
    payload.reply_to = resendReplyTo;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const msg = (result && (result.message || result.error)) ? String(result.message || result.error) : `HTTP ${response.status}`;
    throw new Error(msg);
  }
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
    .select('id, user_id, doc_type, doc_number, status, client_name, client_email, client_phone, client_address, company_name, company_email, client_signed_at, contractor_signed_at, sealed_at, voided_at, expired_at')
    .eq('id', documentId)
    .eq('user_id', tenantId)
    .maybeSingle();

  if (docError) return res.status(500).json({ ok: false, error: docError.message || 'Could not load document' });
  if (!doc?.id) return res.status(404).json({ ok: false, error: 'Document not found' });

  if (doc.sealed_at || doc.voided_at || doc.expired_at) {
    return res.status(400).json({ ok: false, error: 'Document cannot be signed' });
  }

  if (doc.client_signed_at || doc.contractor_signed_at) {
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

  try {
    const docType = String(doc?.doc_type || '').trim();
    if (docType === 'JOB_ESTIMATE') {
      const to = String(doc?.company_email || '').trim();
      await sendCompanySignedNotification({
        to,
        companyName: doc?.company_name || null,
        docNumber: doc?.doc_number || null,
        client: {
          name: doc?.client_name || clientName,
          email: doc?.client_email || null,
          phone: doc?.client_phone || null,
          address: doc?.client_address || null,
        },
      });
    }
  } catch (e) {
    console.error('[service-documents/public-sign] Company email notification failed:', e);
  }

  return res.status(200).json({ ok: true });
}
