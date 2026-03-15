import { sendEmailViaResend } from '../send-receipt-email.js';
import { getBaseUrl, getBearerToken, getSupabaseClient, readJsonBody, requireUser, resolveTenantId, randomTokenRaw, sha256Hex, recalcTotals, insertEvent } from './_shared.js';

function buildEmailHtml({ companyName, clientName, link, docNumber, docType }) {
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
      <p style="margin:0 0 16px;color:#333;font-size:14px;">Please review and sign the document using the button below.</p>
      <div style="margin:18px 0;">
        <a href="${link}" style="display:inline-block;background:#008000;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700;">Review &amp; Sign</a>
      </div>
      <p style="margin:16px 0 0;color:#666;font-size:12px;">If the button does not work, open this link:</p>
      <p style="margin:6px 0 0;color:#006600;font-size:12px;word-break:break-all;">${link}</p>
    </div>
  </div>`;
}

async function fallbackSendViaHttp({ req, toEmail, companyName, clientName, subject, html }) {
  const baseUrl = getBaseUrl(req);
  try {
    const resp = await fetch(`${baseUrl}/api/send-receipt-email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        to: toEmail,
        customerName: clientName,
        companyName,
        templateType: 'service-document-link',
        subject,
        html,
        sale: {
          date: new Date().toLocaleDateString(),
          time: new Date().toLocaleTimeString(),
          subtotal: 0,
          tax: 0,
          total: 0,
          items: [],
        },
      }),
    });

    const json = await resp.json().catch(() => null);
    if (!resp.ok || !json?.success) {
      return {
        ok: false,
        status: resp.status || 502,
        error: json?.error || 'Email send fallback failed',
      };
    }

    return { ok: true, status: 200 };
  } catch (error) {
    return {
      ok: false,
      status: 500,
      error: error?.message || 'HTTP fallback send failed',
    };
  }
}

async function safeInsertEvent(args) {
  try {
    await insertEvent(args);
  } catch (error) {
    console.error('[service-documents/send] insertEvent failed:', error);
  }
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

    const documentId = String(body.documentId || body.document_id || body.id || '').trim();
    if (!documentId) return res.status(400).json({ ok: false, error: 'Missing documentId' });

    const { data: doc, error: docError } = await supabase
      .from('service_documents')
      .select('id, user_id, doc_type, status, doc_number, account_number, valid_for_days, client_name, client_email, company_name, terms_snapshot, sent_at, sealed_at, voided_at, expired_at')
      .eq('id', documentId)
      .eq('user_id', tenantId)
      .maybeSingle();

    if (docError) return res.status(500).json({ ok: false, error: docError.message || 'Could not read document' });
    if (!doc?.id) return res.status(404).json({ ok: false, error: 'Document not found' });

    const status = String(doc.status || '');
    const normalizedStatus = status === 'Viewed' ? 'Sent' : status;
    const explicitTo = typeof body.toEmail === 'string' ? body.toEmail.trim() : (typeof body.to === 'string' ? body.to.trim() : '');
    if (doc.sealed_at || status === 'Sealed') {
      return res.status(400).json({ ok: false, error: 'Document is sealed' });
    }
    if (doc.voided_at || status === 'Voided') {
      return res.status(400).json({ ok: false, error: 'Document is voided' });
    }
    if (doc.expired_at || status === 'Expired') {
      return res.status(400).json({ ok: false, error: 'Document is expired' });
    }
    if (status !== 'Draft' && status !== 'Sent' && status !== 'Viewed') {
      return res.status(400).json({ ok: false, error: 'Document cannot be sent in current status' });
    }

    const toEmail = explicitTo || String(doc.client_email || '').trim();
    const shouldEmail = Boolean(toEmail);
    if (!toEmail) return res.status(400).json({ ok: false, error: 'Missing client email' });

    try {
      await recalcTotals({ supabase, tenantId, documentId });
    } catch (error) {
      console.error('[service-documents/send] recalcTotals failed, continuing:', error);
    }

    if (!String(doc.terms_snapshot || '').trim()) {
      try {
        const { data: company } = await supabase
          .from('company_info')
          .select('terms_and_conditions')
          .eq('user_id', tenantId)
          .limit(1)
          .maybeSingle();

        const terms = String(company?.terms_and_conditions || '').trim();
        const { error: termsError } = await supabase
          .from('service_documents')
          .update({ terms_snapshot: terms || '' })
          .eq('id', documentId)
          .eq('user_id', tenantId);

        if (termsError) {
          console.error('[service-documents/send] terms snapshot update failed, continuing:', termsError);
        }
      } catch (error) {
        console.error('[service-documents/send] terms snapshot fetch/update failed, continuing:', error);
      }
    }

    const tokenRaw = randomTokenRaw();
    const tokenHash = sha256Hex(tokenRaw);
    const validDays = (() => {
      const n = Number(doc?.valid_for_days ?? 30);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 30;
    })();
    const expiresAt = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000).toISOString();

    const { error: tokError } = await supabase
      .from('service_document_tokens')
      .insert({
        user_id: tenantId,
        document_id: documentId,
        token_hash: tokenHash,
        expires_at: expiresAt,
      });

    if (tokError) return res.status(500).json({ ok: false, error: tokError.message || 'Could not create token' });

    const baseUrl = getBaseUrl(req);
    const link = `${baseUrl}/service-documents/review/${tokenRaw}`;

    if (!shouldEmail) {
      return res.status(200).json({ ok: true, token: tokenRaw, expires_at: expiresAt, link, emailed: false });
    }

    const html = buildEmailHtml({
      companyName: doc.company_name,
      clientName: doc.client_name,
      link,
      docNumber: doc.doc_number,
      docType: doc.doc_type,
    });

    const subject = `${doc.doc_type === 'JOB_ESTIMATE' ? 'Job Estimate' : 'Invoice'}${doc.doc_number ? ` ${doc.doc_number}` : ''} - Review & Sign`;

    const emailResult = await sendEmailViaResend({
      toEmail,
      companyName: doc.company_name,
      customerName: doc.client_name,
      templateType: 'service-document-link',
      subject,
      html,
      sale: {
        date: new Date().toLocaleDateString(),
        time: new Date().toLocaleTimeString(),
        subtotal: 0,
        tax: 0,
        total: 0,
        items: [],
      },
    });

    let finalEmailResult = emailResult;
    if (!emailResult.ok && (emailResult.status === 500 || !emailResult.status)) {
      finalEmailResult = await fallbackSendViaHttp({
        req,
        toEmail,
        companyName: doc.company_name,
        clientName: doc.client_name,
        subject,
        html,
      });
    }

    if (!finalEmailResult.ok) {
      return res.status(finalEmailResult.status || 502).json({
        ok: false,
        error: 'Email send failed',
        details: finalEmailResult.error || '',
      });
    }

    if (normalizedStatus === 'Draft') {
      const sentAt = doc.sent_at ? doc.sent_at : new Date().toISOString();

      const { error: updError } = await supabase
        .from('service_documents')
        .update({ status: 'Sent', sent_at: sentAt })
        .eq('id', documentId)
        .eq('user_id', tenantId);

      if (updError) {
        console.error('[service-documents/send] status update failed after email send:', updError);
      } else {
        await safeInsertEvent({ supabase, tenantId, documentId, eventType: 'SENT', meta: { to: toEmail } });
      }
    } else {
      await safeInsertEvent({ supabase, tenantId, documentId, eventType: 'RESENT', meta: { to: toEmail } });
    }

    return res.status(200).json({ ok: true, token: tokenRaw, expires_at: expiresAt, link, emailed: true });
  } catch (error) {
    console.error('[service-documents/send] unhandled error:', error);
    return res.status(500).json({
      ok: false,
      error: 'Internal Server Error',
      details: error?.message || 'Unknown error',
    });
  }
}
