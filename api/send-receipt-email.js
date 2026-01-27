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
    <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 24px;">
      <div style="background: linear-gradient(135deg, #008000, #006600); padding: 18px 20px; border-radius: 14px 14px 0 0;">
        <div style="color:#fff; font-size:18px; font-weight:700;">${safeCompanyName}</div>
        <div style="color: rgba(255,255,255,0.85); font-size: 13px; margin-top: 4px;">Receipt • ${safeTemplate}</div>
      </div>

      <div style="background:#fff; border:1px solid #e6e6e6; border-top:none; border-radius: 0 0 14px 14px; padding: 20px;">
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
      </div>
    </div>
  `;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    return res.status(500).json({ success: false, error: 'RESEND_API_KEY is not configured' });
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
    attachment: attachmentRaw,
    subject: subjectRaw,
    invoiceNumber,
    total,
    subtotal,
    tax,
    items,
    pdfBase64,
  } = body;

  const toEmail = typeof to === 'string' ? to.trim() : '';
  if (!isValidEmail(toEmail)) {
    return res.status(400).json({ success: false, error: 'Valid recipient email is required' });
  }

  const derivedItems = Array.isArray(items)
    ? items
    : [];

  const sale = (saleRaw && typeof saleRaw === 'object')
    ? saleRaw
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

  if (!sale || typeof sale !== 'object') {
    return res.status(400).json({ success: false, error: 'Missing sale data' });
  }

  const resendFrom = (process.env.RESEND_FROM && String(process.env.RESEND_FROM).trim())
    ? String(process.env.RESEND_FROM).trim()
    : 'Send Bill Now <onboarding@resend.dev>';
  const resendReplyTo = (process.env.RESEND_REPLY_TO && String(process.env.RESEND_REPLY_TO).trim())
    ? String(process.env.RESEND_REPLY_TO).trim()
    : null;

  const totalFormatted = formatMoney(sale.total);
  const subject = (typeof subjectRaw === 'string' && subjectRaw.trim())
    ? subjectRaw.trim()
    : `Your Receipt - $${totalFormatted}`;

  const html = buildReceiptHtml({
    companyName,
    customerName,
    sale,
    templateType,
  });

  const attachments = [];
  const attachment = (attachmentRaw && typeof attachmentRaw === 'object')
    ? attachmentRaw
    : (typeof pdfBase64 === 'string' && pdfBase64.trim())
      ? {
          filename: `${invoiceNumber || 'document'}.pdf`,
          content: pdfBase64,
          content_type: 'application/pdf',
        }
      : null;

  if (!attachment) {
    return res.status(400).json({ success: false, error: 'Missing PDF attachment' });
  }

  if (attachment && typeof attachment === 'object') {
    const filename = attachment.filename;
    const content = attachment.content;
    const contentType = attachment.contentType || attachment.content_type;

    if (typeof filename === 'string' && filename.trim() && typeof content === 'string' && content.trim()) {
      let sizeBytes = 0;
      let buf = null;
      try {
        buf = Buffer.from(content.trim(), 'base64');
        sizeBytes = buf.length;
      } catch {
        return res.status(400).json({ success: false, error: 'Invalid attachment base64' });
      }

      if (!sizeBytes) {
        return res.status(400).json({ success: false, error: 'Empty attachment' });
      }

      // Validate it's actually a PDF (starts with %PDF)
      const header = buf ? buf.subarray(0, 4).toString('utf8') : '';
      if (header !== '%PDF') {
        return res.status(400).json({ success: false, error: 'Attachment is not a valid PDF' });
      }

      console.log(`[send-receipt-email] Attachment ${filename.trim()} size=${sizeBytes} bytes contentType=${contentType || 'application/pdf'}`);

      attachments.push({
        filename: filename.trim(),
        content: content.trim(),
        content_type: typeof contentType === 'string' && contentType.trim() ? contentType.trim() : 'application/pdf',
      });
    }
  }

  if (!attachments.length) {
    return res.status(400).json({ success: false, error: 'Invalid PDF attachment' });
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
        subject,
        html,
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
      return res.status(502).json({
        success: false,
        error: resendMessage || 'Failed to send email via Resend',
      });
    }

    console.log('[send-receipt-email] Resend success:', responseJson);
    return res.status(200).json({
      success: true,
      data: responseJson,
      attachment: attachments.length
        ? { filename: attachments[0].filename, contentType: attachments[0].content_type }
        : null,
    });
  } catch (error) {
    console.error('Send receipt email failed:', error);
    return res.status(500).json({ success: false, error: 'Internal error sending email' });
  }
}
