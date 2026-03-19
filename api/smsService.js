import SibApiV3Sdk from 'sib-api-v3-sdk';

function normalizeRecipient(phoneNumber) {
  let recipient = String(phoneNumber || '').trim();
  if (!recipient) return '';
  recipient = recipient.replace(/[\s\-()]/g, '');
  if (!recipient.startsWith('+')) {
    recipient = `+1${recipient}`;
  }
  return recipient;
}

export async function sendInvoiceSMS({ phoneNumber, templateId, dynamicParams }) {
  const apiKey = process.env.BREVO_API_KEY;
  const sender = String(process.env.BREVO_SMS_SENDER || 'SendBillNow');

  const recipient = normalizeRecipient(phoneNumber);
  const tplId = Number(templateId);

  if (!apiKey || !String(apiKey).trim()) {
    console.warn('[smsService.sendInvoiceSMS] BREVO_API_KEY not configured – SMS not sent');
    return { ok: false, sent: false, error: 'BREVO_API_KEY not configured' };
  }

  if (!recipient) {
    return { ok: false, sent: false, error: 'Missing phoneNumber' };
  }

  if (!Number.isFinite(tplId) || tplId <= 0) {
    return { ok: false, sent: false, error: 'Invalid templateId' };
  }

  try {
    SibApiV3Sdk.ApiClient.instance.authentications['api-key'].apiKey = apiKey;

    const apiInstance = new SibApiV3Sdk.TransactionalSMSApi();

    const payload = {
      type: 'transactional',
      sender: sender.substring(0, 11),
      recipient,
      templateId: tplId,
      params: (dynamicParams && typeof dynamicParams === 'object') ? dynamicParams : {},
    };

    const result = await apiInstance.sendTransacSms(payload);
    return { ok: true, sent: true, result };
  } catch (err) {
    const message = err?.response?.body?.message || err?.message || 'Brevo SMS failed';
    const code = err?.response?.body?.code || err?.code || null;

    console.error('[smsService.sendInvoiceSMS] error:', code, message);

    return {
      ok: false,
      sent: false,
      error: String(message),
      code: code ? String(code) : null,
    };
  }
}
