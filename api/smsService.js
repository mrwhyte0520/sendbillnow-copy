function normalizeRecipient(phoneNumber) {
  let recipient = String(phoneNumber || '').trim();
  if (!recipient) return '';
  recipient = recipient.replace(/[\s\-()]/g, '');
  if (!recipient.startsWith('+')) {
    recipient = `+1${recipient}`;
  }
  return recipient;
}

export async function sendInvoiceSMS({ phoneNumber, customerName, invoiceNumber, total }) {
  console.log('--- INTENTO DE SMS BREVO ---');

  try {
    // TEMP: Skip disabled to force attempts in localhost for debugging.
    // if (process.env.NODE_ENV !== 'production' || !process.env.BREVO_API_KEY) {
    //   console.log('SMS Skip: Modo desarrollo o falta BREVO_API_KEY');
    //   return;
    // }

    if (!process.env.BREVO_API_KEY) {
      console.log('SMS Skip: falta BREVO_API_KEY');
      return;
    }

    const Brevo = await import('@getbrevo/brevo');
    const { TransactionalSMSApi, TransactionalSMSApiApiKeys } = Brevo;

    const apiInstance = new TransactionalSMSApi();
    apiInstance.setApiKey(TransactionalSMSApiApiKeys.apiKey, process.env.BREVO_API_KEY);

    // HARD CODE TEMPORAL PARA PRUEBA (quitar después)
    const recipient = normalizeRecipient('+19733427507');

    const safeCustomerName = String(customerName || 'Cliente');
    const safeInvoiceNumber = String(invoiceNumber || '').trim();
    const safeTotal = total === null || total === undefined ? '' : String(total);

    const sendParams = {
      sender: String(process.env.BREVO_SMS_SENDER || 'BillNow'),
      recipient,
      content: `PRUEBA DE SISTEMA: Hola ${safeCustomerName}, tu factura ${safeInvoiceNumber} por ${safeTotal} ya está disponible en SendBillNow.`,
      type: 'transactional',
    };

    const data = await apiInstance.sendTransacSms(sendParams);
    console.log('--- SMS ENVIADO CON ÉXITO ---', data);
  } catch (err) {
    console.error('--- ERROR SMS BREVO ---', {
      message: err?.message,
      code: err?.code || err?.status,
      details: err?.response?.body || err,
    });
    // NUNCA hacer throw
  }
}
