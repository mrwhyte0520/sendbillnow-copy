async function readJsonBody(req) {
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (contentType.includes('application/json') && req.body && typeof req.body === 'object') {
    return req.body;
  }

  const raw = await new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });

  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function escapeHtml(input) {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatMoney(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return '0.00';
  return num.toFixed(2);
}

function isValidEmail(input) {
  const email = String(input || '').trim();
  if (!email) return false;
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailPattern.test(email);
}

function buildReceiptText({ companyName, customerName, sale, templateType }) {
  const safeCompanyName = String(companyName || 'Send Bill Now').trim();
  const safeCustomerName = String(customerName || 'Customer').trim();
  const safeTemplate = String(templateType || 'receipt').trim();
  const safeDate = String(sale?.date || '').trim();
  const safeTime = String(sale?.time || '').trim();

  const lines = [];
  lines.push(`${safeCompanyName}`);
  lines.push('');
  lines.push(`Document: ${safeTemplate}`);
  if (safeCustomerName) lines.push(`Customer: ${safeCustomerName}`);
  if (safeDate || safeTime) lines.push(`Date: ${[safeDate, safeTime].filter(Boolean).join(' ')}`);
  lines.push('');

  const items = Array.isArray(sale?.items) ? sale.items : [];
  if (items.length) {
    lines.push('Items:');
    for (const i of items) {
      const name = String(i?.name || 'Item');
      const qty = Number(i?.quantity ?? 0);
      const total = formatMoney(i?.total ?? 0);
      lines.push(`- ${name} (x${Number.isFinite(qty) ? qty : 0}): $${total}`);
    }
    lines.push('');
  }

  lines.push(`Subtotal: $${formatMoney(sale?.subtotal ?? 0)}`);
  lines.push(`Tax: $${formatMoney(sale?.tax ?? 0)}`);
  lines.push(`Total: $${formatMoney(sale?.total ?? 0)}`);
  lines.push('');
  lines.push('Your PDF is attached.');
  return lines.join('\n');
}

function buildReceiptHtml({ companyName, customerName, sale, templateType }) {
  const safeCompanyName = escapeHtml(companyName || 'Send Bill Now');
  const safeCustomerName = escapeHtml(customerName || 'Customer');

  const itemsHtml = (sale.items || [])
    .map((i) => {
      const name = escapeHtml(i.name || 'Item');
      const qty = escapeHtml(i.quantity ?? 0);
      const total = escapeHtml(formatMoney(i.total));
      return `
        <tr>
          <td style="padding:8px 0; border-bottom:1px solid #eee;">${name}</td>
          <td style="padding:8px 0; border-bottom:1px solid #eee; text-align:center;">${qty}</td>
          <td style="padding:8px 0; border-bottom:1px solid #eee; text-align:right;">$${total}</td>
        </tr>
      `;
    })
    .join('');

  const safeDate = escapeHtml(sale.date || '');
  const safeTime = escapeHtml(sale.time || '');
  const safeTemplate = escapeHtml(templateType || 'receipt');

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; margin:0; padding:0; border-collapse:collapse;">
      <tr>
        <td style="padding:0; margin:0;">
          <div style="font-family: Arial, sans-serif; width: 100%; max-width: 100%; margin: 0; padding: 0;">
            <div style="background: linear-gradient(135deg, #008000, #006600); padding: 18px 20px; border-radius: 0;">
              <div style="color:#fff; font-size:18px; font-weight:700;">${safeCompanyName}</div>
              <div style="color: rgba(255,255,255,0.85); font-size: 13px; margin-top: 4px;">Receipt • ${safeTemplate}</div>
            </div>

            <div style="background:#fff; border:1px solid #e6e6e6; border-top:none; border-radius: 0; padding: 20px;">
        <div style="display:flex; justify-content:space-between; gap: 16px; flex-wrap: wrap;">
          <div>
            <div style="font-size: 13px; color:#666;">Billed To</div>
            <div style="font-size: 16px; color:#111; font-weight:600; margin-top:2px;">${safeCustomerName}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size: 13px; color:#666;">Date</div>
            <div style="font-size: 14px; color:#111; margin-top:2px;">${safeDate} ${safeTime}</div>
          </div>
        </div>

        <div style="margin-top: 18px;">
          <table style="width:100%; border-collapse: collapse;">
            <thead>
              <tr>
                <th style="text-align:left; padding: 8px 0; border-bottom: 2px solid #ddd; font-size: 12px; color:#555;">Item</th>
                <th style="text-align:center; padding: 8px 0; border-bottom: 2px solid #ddd; font-size: 12px; color:#555; width: 80px;">Qty</th>
                <th style="text-align:right; padding: 8px 0; border-bottom: 2px solid #ddd; font-size: 12px; color:#555; width: 120px;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml || '<tr><td colspan="3" style="padding:10px 0; color:#666;">No items</td></tr>'}
            </tbody>
          </table>
        </div>

        <div style="margin-top: 16px; display:flex; justify-content:flex-end;">
          <div style="width: 260px;">
            <div style="display:flex; justify-content:space-between; padding: 4px 0; color:#333;">
              <span>Subtotal</span><span>$${escapeHtml(formatMoney(sale.subtotal))}</span>
            </div>
            <div style="display:flex; justify-content:space-between; padding: 4px 0; color:#333;">
              <span>Tax</span><span>$${escapeHtml(formatMoney(sale.tax))}</span>
            </div>
            <div style="display:flex; justify-content:space-between; padding: 10px 0; margin-top: 6px; border-top: 1px solid #eee; font-weight: 700; font-size: 16px;">
              <span>Total</span><span>$${escapeHtml(formatMoney(sale.total))}</span>
            </div>
          </div>
        </div>

        <div style="margin-top: 18px; font-size: 12px; color:#777;">
          Thank you for your purchase!
        </div>

        <div style="margin-top: 14px; background: #001b9e; color: #fff; text-align: center; font-size: 14px; padding: 6px 14px 14px 14px; line-height: 1.15;">
          Powered by: <a href="https://sendbillnow.com" target="_blank" rel="noopener noreferrer" style="color: #fff; text-decoration: underline;">sendbillnow.com</a>
        </div>
            </div>
          </div>
        </td>
      </tr>
    </table>
  `;
}

function stripHtmlScripts(html) {
  return String(html || '').replace(/<script[\s\S]*?<\/script>/gi, '');
}

function tuneInvoiceHtmlForEmail(html) {
  let cleaned = stripHtmlScripts(html);

  cleaned = cleaned.replace(/<body(\s[^>]*)?>/i, '<body style="margin:0!important;padding:0!important;background:#fff!important;width:100%!important;">');
  cleaned = cleaned
    .replace(
      /<div\s+class=("|')invoice\1>/i,
      '<div class="invoice" style="width:100%!important;max-width:100%!important;margin:0!important;border-radius:0!important;box-shadow:none!important;min-height:0!important;height:auto!important;">'
    )
    .replace(
      /<div\s+class=("|')quote\1>/i,
      '<div class="quote" style="width:100%!important;max-width:100%!important;margin:0!important;border-radius:0!important;box-shadow:none!important;min-height:0!important;height:auto!important;">'
    );

  const overrides = [
    '<style>',
    'html,body{margin:0!important;padding:0!important;background:#fff!important;width:100%!important;}',
    'body{padding:0!important;}',
    '.invoice,.quote{width:100%!important;max-width:100%!important;margin:0!important;border-radius:0!important;box-shadow:none!important;min-height:0!important;height:auto!important;display:block!important;}',
    '.invoice table,.quote table{width:100%!important;max-width:100%!important;}',
    'img{max-width:100%!important;height:auto!important;}',
    '</style>',
  ].join('');

  if (/<\/head>/i.test(cleaned)) {
    return cleaned.replace(/<\/head>/i, `${overrides}</head>`);
  }

  return `${overrides}${cleaned}`;
}

export async function sendEmailViaResend({
  toEmail,
  companyName,
  customerName,
  sale,
  templateType,
  invoiceHtml,
  html,
  invoiceHtmlSnake,
  attachment,
  subject,
  invoiceNumber,
  total,
  subtotal,
  tax,
  items,
  pdfBase64,
}) {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    return { ok: false, status: 500, error: 'RESEND_API_KEY is not configured' };
  }

  if (!isValidEmail(toEmail)) {
    return { ok: false, status: 400, error: 'Valid recipient email is required' };
  }

  const derivedItems = Array.isArray(items)
    ? items
    : [];

  const normalizedSale = (sale && typeof sale === 'object')
    ? sale
    : {
        date: new Date().toLocaleDateString(),
        time: new Date().toLocaleTimeString(),
        subtotal: subtotal ?? total ?? 0,
        tax: tax ?? 0,
        total: total ?? 0,
        items: derivedItems.map((i) => ({
          name: i.name ?? i.description ?? 'Item',
          quantity: i.quantity ?? 1,
          total: i.total ?? i.amount ?? i.price ?? 0,
        })),
      };

  if (!normalizedSale || typeof normalizedSale !== 'object') {
    return { ok: false, status: 400, error: 'Missing sale data' };
  }

  const resendFrom = (process.env.RESEND_FROM && String(process.env.RESEND_FROM).trim())
    ? String(process.env.RESEND_FROM).trim()
    : 'Send Bill Now <onboarding@resend.dev>';
  const resendReplyTo = (process.env.RESEND_REPLY_TO && String(process.env.RESEND_REPLY_TO).trim())
    ? String(process.env.RESEND_REPLY_TO).trim()
    : null;

  const totalFormatted = formatMoney(normalizedSale.total);
  const resolvedSubject = (typeof subject === 'string' && subject.trim())
    ? subject.trim()
    : `Your Receipt - $${totalFormatted}`;

  const preferredHtml =
    (typeof invoiceHtml === 'string' && invoiceHtml.trim())
      ? invoiceHtml.trim()
      : (typeof html === 'string' && html.trim())
        ? html.trim()
        : (typeof invoiceHtmlSnake === 'string' && invoiceHtmlSnake.trim())
          ? invoiceHtmlSnake.trim()
          : '';

  const usedCustomHtml = Boolean(preferredHtml);
  const resolvedHtml = preferredHtml
    ? tuneInvoiceHtmlForEmail(preferredHtml)
    : buildReceiptHtml({
        companyName,
        customerName,
        sale: normalizedSale,
        templateType,
      });

  const text = buildReceiptText({
    companyName,
    customerName,
    sale: normalizedSale,
    templateType,
  });

  const normalizedTemplateType = String(templateType || '').trim().toLowerCase();
  const allowNoAttachment =
    normalizedTemplateType === 'id-card' ||
    normalizedTemplateType === 'idcard' ||
    normalizedTemplateType === 'invoice-link' ||
    normalizedTemplateType === 'pos-invoice-link' ||
    normalizedTemplateType === 'service-document-link';

  const attachments = [];
  const normalizedAttachment = (attachment && typeof attachment === 'object')
    ? attachment
    : (typeof pdfBase64 === 'string' && pdfBase64.trim())
      ? {
          filename: `${invoiceNumber || 'document'}.pdf`,
          content: pdfBase64,
          content_type: 'application/pdf',
        }
      : null;

  if (!normalizedAttachment && !allowNoAttachment) {
    return { ok: false, status: 400, error: 'Missing PDF attachment' };
  }

  if (normalizedAttachment && typeof normalizedAttachment === 'object') {
    const filename = normalizedAttachment.filename;
    const content = normalizedAttachment.content;
    const contentType = normalizedAttachment.contentType || normalizedAttachment.content_type;

    if (typeof filename === 'string' && filename.trim() && typeof content === 'string' && content.trim()) {
      const normalizedContent = content.trim().replace(/^data:application\/pdf;base64,/i, '');
      let sizeBytes = 0;
      let buf = null;
      try {
        buf = Buffer.from(normalizedContent, 'base64');
        sizeBytes = buf.length;
      } catch {
        return { ok: false, status: 400, error: 'Invalid attachment base64' };
      }

      if (!sizeBytes) {
        return { ok: false, status: 400, error: 'Empty attachment' };
      }

      const header = buf ? buf.subarray(0, 4).toString('utf8') : '';
      if (header !== '%PDF') {
        return { ok: false, status: 400, error: 'Attachment is not a valid PDF' };
      }

      console.log(`[send-receipt-email] Attachment ${filename.trim()} size=${sizeBytes} bytes contentType=${contentType || 'application/pdf'}`);

      attachments.push({
        filename: filename.trim(),
        content: normalizedContent,
        content_type: typeof contentType === 'string' && contentType.trim() ? contentType.trim() : 'application/pdf',
      });
    }
  }

  if (!allowNoAttachment && !attachments.length) {
    return { ok: false, status: 400, error: 'Invalid PDF attachment' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: resendFrom,
        to: [toEmail],
        ...(resendReplyTo ? { reply_to: resendReplyTo } : {}),
        subject: resolvedSubject,
        text,
        html: resolvedHtml,
        ...(attachments.length ? { attachments } : {}),
      }),
    });

    const responseText = await response.text().catch(() => '');
    let responseJson = null;
    try {
      responseJson = responseText ? JSON.parse(responseText) : null;
    } catch {
      responseJson = responseText;
    }

    if (!response.ok) {
      console.error('Resend error response:', responseJson);
      const resendMessage =
        (responseJson && typeof responseJson === 'object' && responseJson.message)
          ? String(responseJson.message)
          : null;
      return {
        ok: false,
        status: 502,
        error: resendMessage || 'Failed to send email via Resend',
      };
    }

    console.log('[send-receipt-email] Resend success:', responseJson);
    return {
      ok: true,
      status: 200,
      usedCustomHtml,
      data: responseJson,
      attachment: attachments.length
        ? { filename: attachments[0].filename, contentType: attachments[0].content_type }
        : null,
    };
  } catch (error) {
    console.error('Send receipt email failed:', error);
    return { ok: false, status: 500, error: 'Internal error sending email' };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  const handlerVersion = '2026-02-02-2';
  res.setHeader('X-Send-Receipt-Email-Version', handlerVersion);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({ success: true, version: handlerVersion });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const body = await readJsonBody(req);
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ success: false, error: 'Invalid JSON body' });
  }

  const {
    to,
    customerName,
    companyName,
    sale: saleRaw,
    templateType,
    invoiceHtml: invoiceHtmlRaw,
    html: htmlRaw,
    invoice_html: invoiceHtmlSnakeRaw,
    attachment: attachmentRaw,
    subject: subjectRaw,
    invoiceNumber,
    total,
    subtotal,
    tax,
    items,
    pdfBase64,
  } = body;

  const result = await sendEmailViaResend({
    toEmail: typeof to === 'string' ? to.trim() : '',
    customerName,
    companyName,
    sale: saleRaw,
    templateType,
    invoiceHtml: invoiceHtmlRaw,
    html: htmlRaw,
    invoiceHtmlSnake: invoiceHtmlSnakeRaw,
    attachment: attachmentRaw,
    subject: subjectRaw,
    invoiceNumber,
    total,
    subtotal,
    tax,
    items,
    pdfBase64,
  });

  if (!result.ok) {
    return res.status(result.status || 500).json({ success: false, error: result.error || 'Email send failed' });
  }

  return res.status(200).json({
    success: true,
    version: handlerVersion,
    usedCustomHtml: Boolean(result.usedCustomHtml),
    data: result.data || null,
    attachment: result.attachment || null,
  });
}
