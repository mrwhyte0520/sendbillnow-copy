import { sendEmailViaResend } from '../send-receipt-email.js';
import {
  getBaseUrl,
  getBearerToken,
  getSupabaseAdminClient,
  getSupabaseClient,
  readJsonBody,
  requireUser,
  resolveTenantId,
} from './_shared.js';

function buildEmailHtml({ companyName, clientName, docType, docNumber }) {
  const safeCompany = String(companyName || 'Send Bill Now');
  const safeClient = String(clientName || 'Client');
  const safeDoc = String(docNumber || '').trim();
  const safeType = docType === 'JOB_ESTIMATE' ? 'Job Estimate' : 'Invoice';
  const title = safeDoc ? `${safeType} ${safeDoc}` : safeType;

  return `
  <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;">
    <div style="background:linear-gradient(135deg,#008000,#006600);padding:18px 20px;">
      <div style="color:#fff;font-size:18px;font-weight:700;">${safeCompany}</div>
      <div style="color:rgba(255,255,255,0.85);font-size:13px;margin-top:4px;">${title}</div>
    </div>
    <div style="border:1px solid #e6e6e6;border-top:none;padding:20px;">
      <p style="margin:0 0 12px;color:#111;font-size:14px;">Hi ${safeClient},</p>
      <p style="margin:0 0 12px;color:#333;font-size:14px;">Your signed document is attached to this email.</p>
      <p style="margin:0;color:#333;font-size:14px;">Thank you!</p>
    </div>
  </div>`;
}

async function ensureSealedPdf({ req, accessToken, documentId }) {
  const baseUrl = getBaseUrl(req);
  const resp = await fetch(`${baseUrl}/api/service-documents/seal`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ documentId, skipEmail: true }),
  });

  const json = await resp.json().catch(() => null);
  if (!resp.ok || !json?.ok) {
    const msg = (json && (json.error || json.details)) ? String(json.error || json.details) : `HTTP ${resp.status}`;
    throw new Error(msg);
  }

  return {
    sealedPdfPath: String(json.sealed_pdf_path || '').trim() || null,
  };
}

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

    const explicitTo = typeof body.toEmail === 'string' ? body.toEmail.trim() : (typeof body.to === 'string' ? body.to.trim() : '');

    const { data: doc, error: docError } = await supabase
      .from('service_documents')
      .select('id, user_id, doc_type, doc_number, status, client_name, client_email, company_name, sealed_at, sealed_pdf_path, voided_at, expired_at, subtotal, tax, total')
      .eq('id', documentId)
      .eq('user_id', tenantId)
      .maybeSingle();

    if (docError) return res.status(500).json({ ok: false, error: docError.message || 'Could not load document' });
    if (!doc?.id) return res.status(404).json({ ok: false, error: 'Document not found' });

    if (doc.voided_at || String(doc.status || '') === 'Voided') {
      return res.status(400).json({ ok: false, error: 'Document is voided' });
    }
    if (doc.expired_at || String(doc.status || '') === 'Expired') {
      return res.status(400).json({ ok: false, error: 'Document is expired' });
    }

    const toEmail = explicitTo || String(doc.client_email || '').trim();
    if (!toEmail) return res.status(400).json({ ok: false, error: 'Missing client email' });

    let sealedPdfPath = String(doc.sealed_pdf_path || '').trim();
    if (!sealedPdfPath) {
      const ensured = await ensureSealedPdf({ req, accessToken, documentId });
      sealedPdfPath = ensured.sealedPdfPath || '';
    }

    if (!sealedPdfPath) {
      return res.status(500).json({ ok: false, error: 'Missing sealed PDF path' });
    }

    const pdfBucket = 'service-documents-pdf';
    const dl = await admin.storage.from(pdfBucket).download(sealedPdfPath);
    if (dl.error) return res.status(500).json({ ok: false, error: dl.error.message || 'Could not download sealed PDF' });
    if (!dl.data) return res.status(500).json({ ok: false, error: 'Missing sealed PDF' });

    const ab = await dl.data.arrayBuffer();
    const pdfBuf = Buffer.from(ab);

    const subject = `Signed ${doc.doc_type === 'JOB_ESTIMATE' ? 'Job Estimate' : 'Invoice'}${doc.doc_number ? ` ${doc.doc_number}` : ''}`;
    const html = buildEmailHtml({
      companyName: doc.company_name,
      clientName: doc.client_name,
      docType: doc.doc_type,
      docNumber: doc.doc_number,
    });

    const text = `Hi ${String(doc.client_name || 'Client')},\n\nYour signed document is attached to this email.\n`;

    const emailResult = await sendEmailViaResend({
      toEmail,
      companyName: doc.company_name,
      customerName: doc.client_name,
      templateType: 'service-document-sealed',
      subject,
      html,
      text,
      attachment: {
        filename: `${doc.doc_number || 'service-document'}-sealed.pdf`,
        content: pdfBuf.toString('base64'),
        content_type: 'application/pdf',
      },
      sale: {
        date: new Date().toLocaleDateString(),
        time: new Date().toLocaleTimeString(),
        subtotal: doc.subtotal ?? 0,
        tax: doc.tax ?? 0,
        total: doc.total ?? 0,
        items: [],
      },
    });

    if (!emailResult.ok) {
      return res.status(emailResult.status || 502).json({ ok: false, error: 'Email send failed', details: emailResult.error || '' });
    }

    return res.status(200).json({ ok: true, emailed: true, to: toEmail, sealed_pdf_path: sealedPdfPath });
  } catch (e) {
    console.error('[service-documents/send-sealed] error:', e);
    return res.status(500).json({ ok: false, error: 'Internal Server Error', details: e?.message || 'Unknown error' });
  }
}
