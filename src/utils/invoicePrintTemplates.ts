import { formatAmount } from './numberFormat';
import { formatDate } from './dateFormat';

export type InvoiceTemplateType = 'simple' | 'detailed' | 'quotation' | 'corporate';

interface InvoiceData {
  invoiceNumber: string;
  date: string;
  dueDate: string;
  createdBy?: string;
  amount: number;
  subtotal: number;
  tax: number;
  items: { description: string; quantity: number; price: number; total: number }[];
}

interface CustomerData {
  name: string;
  document?: string;
  phone?: string;
  email?: string;
  address?: string;
}

interface CompanyData {
  name: string;
  rnc?: string;
  phone?: string;
  email?: string;
  address?: string;
  logo?: string;
  facebook?: string;
  instagram?: string;
  twitter?: string;
  linkedin?: string;
  youtube?: string;
  tiktok?: string;
  whatsapp?: string;
}

const BLUE = '#001B9E';
const BLUE_LIGHT = '#e6e9f7';
 

export function generateInvoiceHtml(
  invoice: InvoiceData,
  customer: CustomerData,
  company: CompanyData,
  templateType: InvoiceTemplateType
): string {
  const docTitle = templateType === 'quotation' ? 'ESTIMATED COST' : 'INVOICE';

  if (templateType === 'simple') {
    return generateSimpleTemplate(invoice, customer, company, docTitle);
  } else if (templateType === 'detailed') {
    return generateDetailedTemplate(invoice, customer, company, docTitle);
  } else if (templateType === 'corporate') {
    return generateCorporateTemplate(invoice, customer, company, docTitle);
  } else {
    return generateQuotationTemplate(invoice, customer, company);
  }
}

function generateSimpleTemplate(
  invoice: InvoiceData,
  customer: CustomerData,
  company: CompanyData,
  docTitle: string
): string {
  // Generate rows with alternating colors
  const coloredRows = (invoice.items || []).map((item, idx) => 
    `<tr style="background:${idx % 2 === 0 ? '#fff' : BLUE_LIGHT};"><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;">${idx + 1}</td><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;">${item.description}</td><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatAmount(item.price)}</td><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;text-align:center;">${item.quantity}</td><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:700;color:${BLUE};">${formatAmount(item.total)}</td></tr>`
  ).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Invoice ${invoice.invoiceNumber}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
@page{margin:10mm;}
body{font-family:system-ui,-apple-system,sans-serif;background:#f0f0f0;padding:10px;}
.invoice{max-width:980px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);min-height:100vh;display:flex;flex-direction:column;}
.header{display:flex;justify-content:space-between;padding:28px;background:#fff;border-bottom:4px solid ${BLUE};}
.logo-section h1{font-size:22px;color:${BLUE};margin-bottom:6px;font-weight:700;}
.logo-section p{font-size:11px;color:#666;margin:3px 0;}
.invoice-info{text-align:right;}
.invoice-info h2{font-size:32px;color:${BLUE};margin-bottom:10px;font-weight:800;letter-spacing:1px;}
.invoice-info p{font-size:11px;color:#666;margin:4px 0;}
.invoice-info strong{color:#333;}
.customer-section{padding:20px 28px;background:${BLUE_LIGHT};border-bottom:3px solid ${BLUE};}
.customer-section h3{font-size:13px;color:${BLUE};margin-bottom:10px;text-transform:uppercase;font-weight:700;letter-spacing:0.5px;}
.customer-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;}
.customer-grid p{font-size:12px;color:#333;}
.customer-grid strong{color:${BLUE};}
table{width:100%;border-collapse:collapse;table-layout:fixed;}
th,td{padding:12px 10px!important;}
th:nth-child(1),td:nth-child(1){width:6%;}
th:nth-child(2),td:nth-child(2){width:54%;white-space:normal;word-break:break-word;}
th:nth-child(3),td:nth-child(3){width:13%;}
th:nth-child(4),td:nth-child(4){width:9%;}
th:nth-child(5),td:nth-child(5){width:18%;}
th:nth-child(3),td:nth-child(3),th:nth-child(4),td:nth-child(4){padding-right:6px!important;}
th:nth-child(4),td:nth-child(4){text-align:right!important;}
th{background:${BLUE};color:#fff;padding:14px 16px;text-align:left;font-size:12px;text-transform:uppercase;font-weight:700;letter-spacing:0.5px;}
th:nth-child(3),th:nth-child(5){text-align:right;}
th:nth-child(4){text-align:center;}
.totals{padding:24px 28px;display:flex;justify-content:space-between;align-items:flex-start;background:#fafafa;border-top:2px solid ${BLUE};}
.notes{flex:1;padding-right:40px;}
.notes h4{font-size:11px;color:${BLUE};margin-bottom:10px;text-transform:uppercase;font-weight:700;}
.notes-box{border:2px solid ${BLUE_LIGHT};border-radius:8px;padding:14px;min-height:155px;font-size:11px;color:#666;background:#fff;}
.summary{min-width:260px;background:#fff;border-radius:8px;padding:16px;border:2px solid ${BLUE_LIGHT};}
.summary-row{display:flex;justify-content:space-between;padding:10px 0;font-size:13px;border-bottom:1px solid #eee;}
.summary-row span:first-child{color:#666;}
.summary-row span:last-child{font-weight:600;color:#333;}
.summary-row.total{border-top:3px solid ${BLUE};border-bottom:none;font-weight:700;font-size:18px;margin-top:10px;padding-top:14px;background:${BLUE_LIGHT};margin:-16px;margin-top:10px;padding:14px 16px;border-radius:0 0 6px 6px;}
.summary-row.total span:first-child{color:${BLUE};}
.summary-row.total span:last-child{color:${BLUE};}
.footer{padding:20px 28px;text-align:center;border-top:1px solid #eee;margin-top:auto;}
.footer p{font-size:13px;color:#333;font-weight:600;margin-bottom:8px;}
.footer .powered{font-size:10px;color:#888;border-top:1px solid #ddd;padding-top:10px;margin-top:10px;}
@media print{body{background:#fff!important;padding:0!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important;}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important;}.invoice{width:100%!important;max-width:100%!important;box-shadow:none!important;border-radius:0!important;}th{background:${BLUE}!important;color:#fff!important;}.customer-section{background:${BLUE_LIGHT}!important;}.footer{margin-bottom:8mm!important;}}
</style></head><body>
<div class="invoice">
  <div class="header">
    <div class="logo-section">
      ${company.logo ? `<img src="${company.logo}" alt="${company.name}" style="max-width:80px;max-height:80px;object-fit:contain;margin-bottom:8px;border-radius:8px;"/>` : ''}
      <h1>${company.name}</h1>
      ${company.address ? `<p>${company.address}</p>` : ''}
      ${company.phone ? `<p>${company.phone}</p>` : ''}
      ${company.email ? `<p>${company.email}</p>` : ''}
    </div>
    <div class="invoice-info">
      <h2>${docTitle}</h2>
      <p><strong>Invoice #:</strong> ${invoice.invoiceNumber}</p>
      <p><strong>Invoice Date:</strong> ${formatDate(invoice.date)}</p>
      <p><strong>Due Date:</strong> ${formatDate(invoice.dueDate)}</p>
      <p><strong>Created By:</strong> ${invoice.createdBy || ''}</p>
      ${company.rnc ? `<p><strong>RNC:</strong> ${company.rnc}</p>` : ''}
      <p style="margin-top:8px;font-size:14px;font-weight:700;"><strong>Total:</strong> ${formatAmount(invoice.amount)}</p>
    </div>
  </div>
  <div class="customer-section">
    <h3>CUSTOMER</h3>
    <div class="customer-grid">
      <p><strong>Name:</strong> ${customer.name}</p>
      <p><strong>Email:</strong> ${customer.email || '-'}</p>
      <p><strong>Phone:</strong> ${customer.phone || '-'}</p>
    </div>
  </div>
  <table>
    <thead><tr><th>#</th><th>Description</th><th>Price</th><th>QTY</th><th>Amount</th></tr></thead>
    <tbody>${coloredRows}</tbody>
  </table>
  <div class="totals">
    <div class="notes"><h4>Additional Notes:</h4><div class="notes-box"></div></div>
    <div class="summary">
      <div class="summary-row"><span>Subtotal:</span><span>${formatAmount(invoice.subtotal)}</span></div>
      <div class="summary-row"><span>Taxes:</span><span>${formatAmount(invoice.tax)}</span></div>
      <div class="summary-row total"><span>Grand Total:</span><span>${formatAmount(invoice.amount)}</span></div>
    </div>
  </div>
  <div class="footer">
    <p>Thank you for your purchase.</p>
    ${generateSocialLinksHtml(company)}
    <div class="powered">Powered by: sendbillnow.com</div>
  </div>
</div>
<script>window.onload=function(){window.print();setTimeout(()=>window.close(),1000);};</script>
</body></html>`;
}

function generateSocialLinksHtml(company: CompanyData): string {
  const links: string[] = [];
  if (company.facebook) links.push(`<a href="${company.facebook}" style="color:#1877F2;text-decoration:none;margin:0 6px;" target="_blank">Facebook</a>`);
  if (company.instagram) links.push(`<a href="${company.instagram}" style="color:#E4405F;text-decoration:none;margin:0 6px;" target="_blank">Instagram</a>`);
  if (company.twitter) links.push(`<a href="${company.twitter}" style="color:#000;text-decoration:none;margin:0 6px;" target="_blank">X</a>`);
  if (company.linkedin) links.push(`<a href="${company.linkedin}" style="color:#0A66C2;text-decoration:none;margin:0 6px;" target="_blank">LinkedIn</a>`);
  if (company.youtube) links.push(`<a href="${company.youtube}" style="color:#FF0000;text-decoration:none;margin:0 6px;" target="_blank">YouTube</a>`);
  if (company.tiktok) links.push(`<a href="${company.tiktok}" style="color:#000;text-decoration:none;margin:0 6px;" target="_blank">TikTok</a>`);
  if (company.whatsapp) links.push(`<span style="color:#25D366;font-weight:600;margin:0 6px;">WhatsApp: ${company.whatsapp}</span>`);
  
  if (links.length === 0) return '';
  return `<div style="margin:10px 0;font-size:11px;">${links.join(' | ')}</div>`;
}

function generateDetailedTemplate(
  invoice: InvoiceData,
  customer: CustomerData,
  company: CompanyData,
  docTitle: string
): string {
  // Generate rows with alternating colors
  const coloredRows = (invoice.items || []).map((item, idx) => 
    `<tr style="background:${idx % 2 === 0 ? '#fff' : BLUE_LIGHT};"><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;">${idx + 1}</td><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;">${item.description}</td><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatAmount(item.price)}</td><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;text-align:center;">${item.quantity}</td><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:700;color:${BLUE};">${formatAmount(item.total)}</td></tr>`
  ).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Invoice ${invoice.invoiceNumber}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
@page{margin:10mm;}
body{font-family:system-ui,-apple-system,sans-serif;background:#f0f0f0;padding:10px;}
.invoice{max-width:980px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);}
.header{display:flex;justify-content:space-between;align-items:flex-start;padding:28px;background:#fff;border-bottom:4px solid ${BLUE};}
.company-wrap{display:flex;align-items:center;gap:14px;margin-top:22px;}
.company-wrap img{max-width:70px;max-height:70px;object-fit:contain;border-radius:8px;}
.company-info{margin-top:0;}
.company-info h1{font-size:20px;color:${BLUE};margin-bottom:6px;font-weight:700;}
.company-info p{font-size:10px;color:#666;margin:3px 0;}
.invoice-info{text-align:right;}
.invoice-info h2{font-size:30px;color:${BLUE};margin-bottom:10px;font-weight:800;letter-spacing:1px;}
.invoice-info p{font-size:10px;color:#666;margin:4px 0;}
.invoice-info strong{color:#333;}
.customer-section{padding:20px 28px;background:${BLUE_LIGHT};border-bottom:3px solid ${BLUE};}
.customer-section h3{font-size:12px;color:${BLUE};margin-bottom:12px;text-transform:uppercase;font-weight:700;letter-spacing:0.5px;}
.customer-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
.customer-grid p{font-size:11px;color:#333;margin:3px 0;}
.customer-grid strong{color:${BLUE};}
table{width:100%;border-collapse:collapse;table-layout:fixed;}
th,td{padding:12px 10px!important;}
th:nth-child(1),td:nth-child(1){width:6%;}
th:nth-child(2),td:nth-child(2){width:54%;white-space:normal;word-break:break-word;}
th:nth-child(3),td:nth-child(3){width:13%;}
th:nth-child(4),td:nth-child(4){width:9%;}
th:nth-child(5),td:nth-child(5){width:18%;}
th:nth-child(3),td:nth-child(3),th:nth-child(4),td:nth-child(4){padding-right:6px!important;}
th:nth-child(4),td:nth-child(4){text-align:right!important;}
th{background:${BLUE};color:#fff;padding:14px 16px;text-align:left;font-size:11px;text-transform:uppercase;font-weight:700;letter-spacing:0.5px;}
th:nth-child(3),th:nth-child(5){text-align:right;}
th:nth-child(4){text-align:center;}
.totals{padding:20px 28px;display:flex;justify-content:space-between;align-items:flex-start;gap:24px;background:#fafafa;border-top:2px solid ${BLUE};}
.notes{flex:1;}
.notes h4{font-size:10px;color:${BLUE};margin-bottom:8px;text-transform:uppercase;font-weight:700;}
.notes-box{border:2px solid ${BLUE_LIGHT};border-radius:8px;padding:12px;min-height:145px;font-size:10px;color:#666;background:#fff;}
.summary{min-width:220px;background:#fff;border-radius:8px;padding:14px;border:2px solid ${BLUE_LIGHT};}
.summary-row{display:flex;justify-content:space-between;padding:8px 0;font-size:12px;border-bottom:1px solid #eee;}
.summary-row span:first-child{color:#666;}
.summary-row span:last-child{font-weight:600;color:#333;}
.summary-row.total{border-top:3px solid ${BLUE};border-bottom:none;font-weight:700;font-size:16px;margin-top:8px;padding-top:12px;background:${BLUE_LIGHT};margin:-14px;margin-top:8px;padding:12px 14px;border-radius:0 0 6px 6px;}
.summary-row.total span{color:${BLUE};}
.terms{padding:18px 28px;border-top:1px solid #e5e7eb;}
.terms h4{font-size:10px;color:${BLUE};margin-bottom:8px;text-transform:uppercase;font-weight:700;}
.terms-box{border:2px solid ${BLUE_LIGHT};border-radius:8px;padding:12px;min-height:132px;font-size:10px;color:#666;background:#fff;}
.signature{padding:20px 28px;border-top:1px solid #e5e7eb;background:#fafafa;}
.signature h4{font-size:12px;color:${BLUE};margin-bottom:14px;font-weight:700;}
.signature-line{border-bottom:2px solid ${BLUE};width:220px;margin-bottom:6px;}
.signature p{font-size:11px;color:${BLUE};font-weight:600;}
.footer{padding:10px 20px;text-align:center;border-top:1px solid #eee;margin-top:auto;}
.footer p{font-size:13px;color:#333;font-weight:600;margin-bottom:8px;}
.footer .powered{font-size:10px;color:#888;border-top:1px solid #ddd;padding-top:10px;margin-top:10px;}
@media print{body{background:#fff!important;padding:0!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important;}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important;}.invoice{width:100%!important;max-width:100%!important;box-shadow:none!important;border-radius:0!important;}th{background:${BLUE}!important;color:#fff!important;}.customer-section{background:${BLUE_LIGHT}!important;}.footer{margin-bottom:8mm!important;}}
</style></head><body>
<div class="invoice">
  <div class="header">
    <div class="company-wrap">
      ${company.logo ? `<img src="${company.logo}" alt="${company.name}"/>` : ''}
      <div class="company-info">
        <h1>${company.name}</h1>
        ${company.address ? `<p>${company.address}</p>` : ''}
        ${company.phone ? `<p>${company.phone}</p>` : ''}
        ${company.email ? `<p>${company.email}</p>` : ''}
      </div>
    </div>
    <div class="invoice-info">
      <h2>${docTitle}</h2>
      <p><strong>Invoice #:</strong> ${invoice.invoiceNumber}</p>
      <p><strong>Invoice Date:</strong> ${formatDate(invoice.date)}</p>
      <p><strong>Due Date:</strong> ${formatDate(invoice.dueDate)}</p>
      <p><strong>Created By:</strong> ${invoice.createdBy || ''}</p>
      ${company.rnc ? `<p><strong>RNC:</strong> ${company.rnc}</p>` : ''}
      <p style="margin-top:8px;font-size:13px;font-weight:700;"><strong>Total:</strong> ${formatAmount(invoice.amount)}</p>
    </div>
  </div>
  <div class="customer-section">
    <h3>CUSTOMER</h3>
    <div class="customer-grid">
      <p><strong>Name:</strong> ${customer.name}</p>
      <p><strong>Email:</strong> ${customer.email || '-'}</p>
      <p><strong>Phone:</strong> ${customer.phone || '-'}</p>
      <p><strong>Address:</strong> ${customer.address || '-'}</p>
    </div>
  </div>
  <table>
    <thead><tr><th>#</th><th>Description</th><th>Price</th><th>QTY</th><th>Amount</th></tr></thead>
    <tbody>${coloredRows}</tbody>
  </table>
  <div class="totals">
    <div class="notes"><h4>Additional Notes:</h4><div class="notes-box"></div></div>
    <div class="summary">
      <div class="summary-row"><span>Subtotal:</span><span>${formatAmount(invoice.subtotal)}</span></div>
      <div class="summary-row"><span>Taxes:</span><span>${formatAmount(invoice.tax)}</span></div>
      <div class="summary-row total"><span>Grand Total:</span><span>${formatAmount(invoice.amount)}</span></div>
    </div>
  </div>
  <div class="footer">
    <p>Thank you for your purchase.</p>
    ${generateSocialLinksHtml(company)}
    <div class="powered">Powered by: sendbillnow.com</div>
  </div>
</div>
<script>window.onload=function(){window.print();setTimeout(()=>window.close(),1000);};</script>
</body></html>`;
}

function generateQuotationTemplate(
  invoice: InvoiceData,
  customer: CustomerData,
  company: CompanyData
): string {
  const quoteRows = (invoice.items || []).map((item) =>
    `<tr><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;text-align:center;">${item.quantity}</td><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;">${item.description}</td><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatAmount(item.price)}</td><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:700;color:${BLUE};">${formatAmount(item.total)}</td></tr>`
  ).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Estimate ${invoice.invoiceNumber}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
@page{margin:10mm;}
body{font-family:system-ui,-apple-system,sans-serif;background:#f0f0f0;padding:10px;}
.quote{max-width:980px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);min-height:100vh;display:flex;flex-direction:column;}
.header{display:flex;justify-content:space-between;padding:28px;background:#fff;border-bottom:4px solid ${BLUE};}
.logo-section h1{font-size:20px;color:${BLUE};margin-bottom:6px;font-weight:700;}
.logo-section p{font-size:11px;color:#666;margin:3px 0;}
.quote-info{text-align:right;}
.quote-info h2{font-size:28px;color:${BLUE};margin-bottom:10px;font-weight:800;letter-spacing:1px;}
.quote-info p{font-size:11px;color:#666;margin:4px 0;}
.quote-info strong{color:#333;}
.meta-section{padding:18px 28px;background:${BLUE_LIGHT};border-bottom:3px solid ${BLUE};display:grid;grid-template-columns:repeat(3,1fr);gap:16px;}
.meta-section p{font-size:11px;color:#333;}
.meta-section strong{color:${BLUE};font-size:11px;}
table{width:100%;border-collapse:collapse;}
th{background:${BLUE};color:#fff;padding:14px 16px;text-align:left;font-size:11px;text-transform:uppercase;font-weight:700;letter-spacing:0.5px;}
th:nth-child(1){text-align:center;}
th:nth-child(3),th:nth-child(4){text-align:right;}
.summary-bar{display:grid;grid-template-columns:repeat(4,1fr);padding:16px 28px;background:#fafafa;border-top:3px solid ${BLUE};border-bottom:1px solid #e5e7eb;}
.summary-bar div{text-align:center;padding:8px;}
.summary-bar span{display:block;font-size:10px;color:#666;text-transform:uppercase;margin-bottom:4px;font-weight:600;}
.summary-bar strong{font-size:14px;color:#333;}
.summary-bar .total{background:${BLUE_LIGHT};border-radius:8px;margin:-8px;padding:16px;}
.summary-bar .total strong{color:${BLUE};font-size:16px;}
.notes{padding:18px 28px;}
.notes h4{font-size:10px;color:${BLUE};margin-bottom:8px;text-transform:uppercase;font-weight:700;}
.notes-box{border:2px solid ${BLUE_LIGHT};border-radius:8px;padding:12px;min-height:132px;font-size:10px;color:#666;background:#fff;}
.terms{padding:18px 28px;border-top:1px solid #e5e7eb;}
.terms h4{font-size:10px;color:${BLUE};margin-bottom:8px;text-transform:uppercase;font-weight:700;}
.terms-box{border:2px solid ${BLUE_LIGHT};border-radius:8px;padding:12px;min-height:154px;font-size:10px;color:#666;background:#fff;}
.footer{padding:20px 28px;text-align:center;border-top:1px solid #eee;margin-top:auto;}
.footer p{font-size:13px;color:#333;font-weight:600;margin-bottom:8px;}
.footer .powered{font-size:10px;color:#888;border-top:1px solid #ddd;padding-top:10px;margin-top:10px;}
@media print{body{background:#fff!important;padding:0!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important;}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important;}.quote{width:100%!important;max-width:100%!important;box-shadow:none!important;border-radius:0!important;}th{background:${BLUE}!important;color:#fff!important;}.meta-section{background:${BLUE_LIGHT}!important;}.summary-bar .total{background:${BLUE_LIGHT}!important;}.footer{margin-bottom:8mm!important;}}
</style></head><body>
<div class="quote">
  <div class="header">
    <div class="logo-section">
      ${company.logo ? `<img src="${company.logo}" alt="${company.name}" style="max-width:70px;max-height:70px;object-fit:contain;margin-bottom:6px;border-radius:8px;"/>` : ''}
      <h1>${company.name}</h1>
      ${company.address ? `<p>${company.address}</p>` : ''}
      ${company.phone ? `<p>${company.phone}</p>` : ''}
      ${company.email ? `<p>${company.email}</p>` : ''}
    </div>
    <div class="quote-info">
      <h2>ESTIMATED COST</h2>
      <p><strong>Estimate #:</strong> ${invoice.invoiceNumber}</p>
      <p><strong>Estimate Date:</strong> ${formatDate(invoice.date)}</p>
      <p><strong>Created By:</strong> ${invoice.createdBy || ''}</p>
      <p style="margin-top:8px;font-size:13px;font-weight:700;"><strong>Total:</strong> ${formatAmount(invoice.amount)}</p>
    </div>
  </div>
  <div class="meta-section">
    <p><strong>Customer:</strong><br/>${customer.name}<br/>${customer.document || '-'}</p>
    <p><strong>Email:</strong><br/>${customer.email || '-'}</p>
    <p><strong>Phone:</strong><br/>${customer.phone || '-'}</p>
  </div>
  <table>
    <thead><tr><th>QTY</th><th>DESCRIPTION</th><th>UNIT PRICE</th><th>AMOUNT</th></tr></thead>
    <tbody>${quoteRows}</tbody>
  </table>
  <div class="summary-bar">
    <div><span>SUBTOTAL:</span><strong>${formatAmount(invoice.subtotal)}</strong></div>
    <div><span>SALES TAX:</span><strong>${formatAmount(invoice.tax)}</strong></div>
    <div><span>TERMS:</span><strong>Net 30</strong></div>
    <div class="total"><span>ESTIMATED COST:</span><strong>${formatAmount(invoice.amount)}</strong></div>
  </div>
  <div class="notes"><h4>NOTE:</h4><div class="notes-box"></div></div>
  <div class="terms"><h4>GENERAL TERMS AND CONDITIONS:</h4><div class="terms-box"></div></div>
  <div class="footer">
    <p>Thank you for your purchase.</p>
    ${generateSocialLinksHtml(company)}
    <div class="powered">Powered by: sendbillnow.com</div>
  </div>
</div>
<script>window.onload=function(){window.print();setTimeout(()=>window.close(),1000);};</script>
</body></html>`;
}

function generateCorporateTemplate(
  invoice: InvoiceData,
  customer: CustomerData,
  company: CompanyData,
  docTitle: string
): string {
  const coloredRows = (invoice.items || []).map((item, idx) => 
    `<tr style="background:${idx % 2 === 0 ? '#fff' : BLUE_LIGHT};"><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;">${item.description}</td><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;text-align:center;">${item.quantity}</td><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatAmount(item.price)}</td><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:700;color:${BLUE};">${formatAmount(item.total)}</td></tr>`
  ).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Invoice ${invoice.invoiceNumber}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
@page{margin:10mm;}
body{font-family:system-ui,-apple-system,sans-serif;background:#f5f5f5;padding:10px;}
.invoice{max-width:980px;margin:0 auto;background:#fff;border:2px solid #333;overflow:hidden;min-height:100vh;display:flex;flex-direction:column;}
.top-header{background:${BLUE};color:#fff;padding:20px 28px;display:flex;align-items:center;justify-content:center;gap:16px;}
.company-wrap{display:flex;align-items:center;gap:14px;}
.top-header img{height:68px;width:auto;max-width:130px;object-fit:contain;border-radius:6px;}
.company-info{flex:0;}
.company-info h1{font-size:18px;font-weight:700;margin-bottom:4px;color:#fff;}
.company-info p{font-size:10px;margin:2px 0;color:#fff;}
.invoice-info{text-align:right;min-width:220px;}
.invoice-info h2{font-size:32px;font-weight:800;color:${BLUE};margin-bottom:10px;letter-spacing:0.5px;}
.invoice-info p{font-size:10px;color:#666;margin:3px 0;}
.invoice-info strong{color:#333;}
.header-line{height:3px;background:${BLUE};}
.billing-section{padding:16px 28px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:32px;border-bottom:2px solid ${BLUE};}
.billing-section h3{font-size:11px;font-weight:700;color:#333;margin-bottom:8px;text-transform:uppercase;}
.billing-section p{font-size:11px;color:#555;margin:3px 0;}
table{width:100%;border-collapse:collapse;}
th{background:${BLUE};color:#fff;padding:12px 16px;text-align:left;font-size:11px;text-transform:uppercase;font-weight:700;}
th:nth-child(2){text-align:center;}
th:nth-child(3),th:nth-child(4){text-align:right;}
.bottom-section{padding:20px 28px;display:grid;grid-template-columns:1fr 280px;gap:24px;}
.notes h4{font-size:11px;font-weight:700;color:#333;margin-bottom:8px;text-transform:uppercase;}
.notes-box{border:2px solid #ddd;border-radius:4px;padding:12px;min-height:200px;font-size:10px;color:#666;}
.summary{background:#fafafa;border:2px solid #ddd;border-radius:4px;padding:16px;}
.summary-row{display:flex;justify-content:space-between;padding:8px 0;font-size:12px;border-bottom:1px solid #eee;}
.summary-row span:first-child{color:#666;}
.summary-row span:last-child{font-weight:600;color:#333;}
.balance-due{background:${BLUE};color:#fff;padding:14px 16px;margin:12px -16px -16px -16px;display:flex;justify-content:space-between;align-items:center;font-weight:700;font-size:16px;}
.balance-due span:last-child{font-size:18px;}
.footer{padding:20px 28px;text-align:center;border-top:1px solid #eee;margin-top:auto;}
.footer p{font-size:13px;color:#333;font-weight:600;margin-bottom:8px;}
.footer .powered{font-size:10px;color:#888;border-top:1px solid #ddd;padding-top:10px;margin-top:10px;}
@media print{body{background:#fff!important;padding:0!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important;}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important;}.invoice{width:100%!important;max-width:100%!important;border:2px solid #333!important;}th{background:${BLUE}!important;color:#fff!important;}.top-header{background:${BLUE}!important;}.balance-due{background:${BLUE}!important;color:#fff!important;}.footer{margin-bottom:8mm!important;}}
</style></head><body>
<div class="invoice">
  <div class="top-header">
    <div class="company-wrap">
      ${company.logo ? `<img src="${company.logo}" alt="${company.name}"/>` : ''}
      <div class="company-info">
        <h1>${company.name}</h1>
        ${company.address ? `<p>${company.address}</p>` : ''}
        ${company.phone ? `<p>${company.phone}</p>` : ''}
        ${company.email ? `<p>${company.email}</p>` : ''}
      </div>
    </div>
  </div>
  <div class="header-line"></div>
  <div class="billing-section">
    <div>
      <h3>Bill To:</h3>
      <p><strong>${customer.name}</strong></p>
      ${customer.email ? `<p>Email: ${customer.email}</p>` : ''}
      ${customer.phone ? `<p>Phone: ${customer.phone}</p>` : ''}
    </div>
    <div>
      <h3>Ship To:</h3>
      <p>${customer.name}</p>
      <p>${customer.address || ''}</p>
      ${customer.phone ? `<p>Phone: ${customer.phone}</p>` : ''}
    </div>
    <div class="invoice-info">
      <h2>${docTitle}</h2>
      <p><strong>Invoice #:</strong> ${invoice.invoiceNumber}</p>
      <p><strong>Invoice Date & Time:</strong> ${formatDate(invoice.date)}</p>
      <p><strong>Due Date:</strong> ${formatDate(invoice.dueDate)}</p>
      <p><strong>Created By:</strong> ${invoice.createdBy || ''}</p>
      <p style="margin-top:8px;font-size:13px;font-weight:700;"><strong>Total:</strong> ${formatAmount(invoice.amount)}</p>
    </div>
  </div>
  <table>
    <thead><tr><th>Description of Services</th><th>QTY</th><th>Price</th><th>Amount</th></tr></thead>
    <tbody>${coloredRows}</tbody>
  </table>
  <div class="bottom-section">
    <div class="notes">
      <h4>Additional Notes:</h4>
      <div class="notes-box"></div>
    </div>
    <div class="summary">
      <div class="summary-row"><span>Subtotal:</span><span>${formatAmount(invoice.subtotal)}</span></div>
      <div class="summary-row"><span>Discount:</span><span>$0.00</span></div>
      <div class="summary-row"><span>Tax Rate:</span><span>${invoice.tax > 0 ? ((invoice.tax / invoice.subtotal) * 100).toFixed(0) + '%' : '0%'}</span></div>
      <div class="summary-row"><span>Total & Tax:</span><span>${formatAmount(invoice.amount)}</span></div>
      <div class="summary-row"><span>Shipping:</span><span>$0.00</span></div>
      <div class="balance-due"><span>Balance Due:</span><span>${formatAmount(invoice.amount)}</span></div>
    </div>
  </div>
  <div class="footer">
    <p>Thank you for your purchase.</p>
    ${generateSocialLinksHtml(company)}
    <div class="powered">Powered by: sendbillnow.com</div>
  </div>
</div>
<script>window.onload=function(){window.print();setTimeout(()=>window.close(),1000);};</script>
</body></html>`;
}

export function printInvoice(
  invoice: InvoiceData,
  customer: CustomerData,
  company: CompanyData,
  templateType: InvoiceTemplateType
): void {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Could not open print window');
    return;
  }
  const html = generateInvoiceHtml(invoice, customer, company, templateType);
  printWindow.document.write(html);
  printWindow.document.close();
}
