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

  // TEST MODE (temporary): always send to the owner's phone for activation tests.
  // IMPORTANT: This intentionally ignores the DB/params phoneNumber.
  const recipient = normalizeRecipient('+18093921464');

  if (!apiKey || !String(apiKey).trim()) {
    console.warn('[smsService.sendInvoiceSMS] BREVO_API_KEY not configured – SMS not sent');
    return { ok: false, sent: false, error: 'BREVO_API_KEY not configured' };
  }

  if (!recipient) {
    return { ok: false, sent: false, error: 'Missing phoneNumber' };
  }

  const params = (dynamicParams && typeof dynamicParams === 'object') ? dynamicParams : {};
  const customerName = String(params.customerName || '').trim();
  const invoiceNumber = String(params.invoiceNumber || '').trim();
  const total = String(params.total ?? '').trim();
  const content = `PRUEBA DE SISTEMA: Hola ${customerName}, tu factura ${invoiceNumber} por un monto de ${total} ya está disponible en SendBillNow.`;

  try {
    SibApiV3Sdk.ApiClient.instance.authentications['api-key'].apiKey = apiKey;

    const apiInstance = new SibApiV3Sdk.TransactionalSMSApi();

    const payload = {
      type: 'transactional',
      sender: sender.substring(0, 11),
      recipient,
      content,
    };

    const result = await apiInstance.sendTransacSms(payload);

    const messageId = result?.messageId || result?.reference || result?.id || null;
    console.log('[smsService.sendInvoiceSMS] SMS sent OK. messageId=', messageId, 'result=', result);
    return { ok: true, sent: true, result, messageId };
  } catch (err) {
    const message = err?.response?.body?.message || err?.message || 'Brevo SMS failed';
    const code = err?.response?.body?.code || err?.code || null;

    console.error('[smsService.sendInvoiceSMS] error:', {
      code,
      message,
      details: err?.response?.body || null,
      status: err?.response?.status || err?.status || null,
    });

    return {
      ok: false,
      sent: false,
      error: String(message),
      code: code ? String(code) : null,
    };
  }
}
