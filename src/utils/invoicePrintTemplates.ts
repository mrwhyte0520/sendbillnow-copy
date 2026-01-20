import { formatAmount } from './numberFormat';
import { formatDate } from './dateFormat';

export type InvoiceTemplateType = 'simple' | 'detailed' | 'quotation' | 'corporate';

interface InvoiceData {
  invoiceNumber: string;
  date: string;
  dueDate: string;
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
body{font-family:system-ui,-apple-system,sans-serif;background:#f0f0f0;padding:24px;}
.invoice{max-width:800px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);}
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
table{width:100%;border-collapse:collapse;}
th{background:${BLUE};color:#fff;padding:14px 16px;text-align:left;font-size:12px;text-transform:uppercase;font-weight:700;letter-spacing:0.5px;}
th:nth-child(3),th:nth-child(5){text-align:right;}
th:nth-child(4){text-align:center;}
.totals{padding:24px 28px;display:flex;justify-content:space-between;align-items:flex-start;background:#fafafa;border-top:2px solid ${BLUE};}
.notes{flex:1;padding-right:40px;}
.notes h4{font-size:11px;color:${BLUE};margin-bottom:10px;text-transform:uppercase;font-weight:700;}
.notes-box{border:2px solid ${BLUE_LIGHT};border-radius:8px;padding:14px;min-height:70px;font-size:11px;color:#666;background:#fff;}
.summary{min-width:260px;background:#fff;border-radius:8px;padding:16px;border:2px solid ${BLUE_LIGHT};}
.summary-row{display:flex;justify-content:space-between;padding:10px 0;font-size:13px;border-bottom:1px solid #eee;}
.summary-row span:first-child{color:#666;}
.summary-row span:last-child{font-weight:600;color:#333;}
.summary-row.total{border-top:3px solid ${BLUE};border-bottom:none;font-weight:700;font-size:18px;margin-top:10px;padding-top:14px;background:${BLUE_LIGHT};margin:-16px;margin-top:10px;padding:14px 16px;border-radius:0 0 6px 6px;}
.summary-row.total span:first-child{color:${BLUE};}
.summary-row.total span:last-child{color:${BLUE};}
.footer{padding:20px 28px;background:${BLUE};text-align:center;font-size:13px;color:#fff;font-weight:600;letter-spacing:0.5px;}
@media print{body{background:#fff!important;padding:0!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important;}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important;}.invoice{box-shadow:none!important;border-radius:0!important;}th{background:${BLUE}!important;color:#fff!important;}.customer-section{background:${BLUE_LIGHT}!important;}.footer{background:${BLUE}!important;color:#fff!important;}}
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
  <div class="footer">THANK YOU FOR YOUR BUSINESS!</div>
</div>
<script>window.onload=function(){window.print();setTimeout(()=>window.close(),1000);};</script>
</body></html>`;
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
body{font-family:system-ui,-apple-system,sans-serif;background:#f0f0f0;padding:24px;}
.invoice{max-width:800px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);}
.header{display:flex;justify-content:space-between;padding:28px;background:#fff;border-bottom:4px solid ${BLUE};}
.logo-section h1{font-size:20px;color:${BLUE};margin-bottom:6px;font-weight:700;}
.logo-section p{font-size:10px;color:#666;margin:3px 0;}
.invoice-info{text-align:right;}
.invoice-info h2{font-size:30px;color:${BLUE};margin-bottom:10px;font-weight:800;letter-spacing:1px;}
.invoice-info p{font-size:10px;color:#666;margin:4px 0;}
.invoice-info strong{color:#333;}
.customer-section{padding:20px 28px;background:${BLUE_LIGHT};border-bottom:3px solid ${BLUE};}
.customer-section h3{font-size:12px;color:${BLUE};margin-bottom:12px;text-transform:uppercase;font-weight:700;letter-spacing:0.5px;}
.customer-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
.customer-grid p{font-size:11px;color:#333;margin:3px 0;}
.customer-grid strong{color:${BLUE};}
table{width:100%;border-collapse:collapse;}
th{background:${BLUE};color:#fff;padding:14px 16px;text-align:left;font-size:11px;text-transform:uppercase;font-weight:700;letter-spacing:0.5px;}
th:nth-child(3),th:nth-child(5){text-align:right;}
th:nth-child(4){text-align:center;}
.totals{padding:20px 28px;display:flex;justify-content:space-between;align-items:flex-start;gap:24px;background:#fafafa;border-top:2px solid ${BLUE};}
.notes{flex:1;}
.notes h4{font-size:10px;color:${BLUE};margin-bottom:8px;text-transform:uppercase;font-weight:700;}
.notes-box{border:2px solid ${BLUE_LIGHT};border-radius:8px;padding:12px;min-height:60px;font-size:10px;color:#666;background:#fff;}
.summary{min-width:220px;background:#fff;border-radius:8px;padding:14px;border:2px solid ${BLUE_LIGHT};}
.summary-row{display:flex;justify-content:space-between;padding:8px 0;font-size:12px;border-bottom:1px solid #eee;}
.summary-row span:first-child{color:#666;}
.summary-row span:last-child{font-weight:600;color:#333;}
.summary-row.total{border-top:3px solid ${BLUE};border-bottom:none;font-weight:700;font-size:16px;margin-top:8px;padding-top:12px;background:${BLUE_LIGHT};margin:-14px;margin-top:8px;padding:12px 14px;border-radius:0 0 6px 6px;}
.summary-row.total span{color:${BLUE};}
.terms{padding:18px 28px;border-top:1px solid #e5e7eb;}
.terms h4{font-size:10px;color:${BLUE};margin-bottom:8px;text-transform:uppercase;font-weight:700;}
.terms-box{border:2px solid ${BLUE_LIGHT};border-radius:8px;padding:12px;min-height:60px;font-size:10px;color:#666;background:#fff;}
.signature{padding:20px 28px;border-top:1px solid #e5e7eb;background:#fafafa;}
.signature h4{font-size:12px;color:${BLUE};margin-bottom:14px;font-weight:700;}
.signature-line{border-bottom:2px solid ${BLUE};width:220px;margin-bottom:6px;}
.signature p{font-size:11px;color:${BLUE};font-weight:600;}
.footer{padding:20px 28px;background:${BLUE};text-align:center;font-size:13px;color:#fff;font-weight:600;letter-spacing:0.5px;}
@media print{body{background:#fff!important;padding:0!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important;}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important;}.invoice{box-shadow:none!important;border-radius:0!important;}th{background:${BLUE}!important;color:#fff!important;}.customer-section{background:${BLUE_LIGHT}!important;}.footer{background:${BLUE}!important;color:#fff!important;}}
</style></head><body>
<div class="invoice">
  <div class="header">
    <div class="logo-section">
      ${company.logo ? `<img src="${company.logo}" alt="${company.name}" style="max-width:70px;max-height:70px;object-fit:contain;margin-bottom:6px;border-radius:8px;"/>` : ''}
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
      <p style="margin-top:8px;font-size:13px;font-weight:700;"><strong>Total:</strong> ${formatAmount(invoice.amount)}</p>
    </div>
  </div>
  <div class="customer-section">
    <h3>CUSTOMER</h3>
    <div class="customer-grid">
      <div>
        <p><strong>Name:</strong> ${customer.name}</p>
        <p><strong>Email:</strong> ${customer.email || '-'}</p>
        <p><strong>Phone:</strong> ${customer.phone || '-'}</p>
      </div>
      <div>
        <p><strong>Address:</strong> ${customer.address || '-'}</p>
        <p><strong>Document:</strong> ${customer.document || '-'}</p>
      </div>
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
      <div class="summary-row"><span>Sales Tax:</span><span>${formatAmount(invoice.tax)}</span></div>
      <div class="summary-row total"><span>Grand Total:</span><span>${formatAmount(invoice.amount)}</span></div>
    </div>
  </div>
  <div class="terms"><h4>Terms & Conditions:</h4><div class="terms-box"></div></div>
  <div class="signature"><h4>Signature</h4><div class="signature-line"></div><p>X_________________</p></div>
  <div class="footer">THANK YOU FOR YOUR BUSINESS!</div>
</div>
<script>window.onload=function(){window.print();setTimeout(()=>window.close(),1000);};</script>
</body></html>`;
}

function generateQuotationTemplate(
  invoice: InvoiceData,
  customer: CustomerData,
  company: CompanyData
): string {
  // Generate rows with alternating colors
  const quoteRows = (invoice.items || []).map((item, idx) => 
    `<tr style="background:${idx % 2 === 0 ? '#fff' : BLUE_LIGHT};"><td style="padding:14px 16px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:600;">${item.quantity}</td><td style="padding:14px 16px;border-bottom:1px solid #e5e7eb;">${item.description}</td><td style="padding:14px 16px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatAmount(item.price)}</td><td style="padding:14px 16px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:700;color:${BLUE};">${formatAmount(item.total)}</td></tr>`
  ).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Estimate ${invoice.invoiceNumber}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:system-ui,-apple-system,sans-serif;background:#f0f0f0;padding:24px;}
.quote{max-width:800px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);}
.header{display:flex;justify-content:space-between;padding:28px;background:#fff;border-bottom:4px solid ${BLUE};}
.logo-section h1{font-size:20px;color:${BLUE};margin-bottom:6px;font-weight:700;}
.logo-section p{font-size:10px;color:#666;margin:3px 0;}
.quote-info{text-align:right;}
.quote-info h2{font-size:26px;color:${BLUE};margin-bottom:10px;font-weight:800;letter-spacing:1px;}
.quote-info p{font-size:10px;color:#666;margin:4px 0;}
.quote-info strong{color:#333;}
.meta-section{padding:16px 28px;background:${BLUE_LIGHT};border-bottom:3px solid ${BLUE};display:grid;grid-template-columns:repeat(3,1fr);gap:16px;}
.meta-section p{font-size:11px;color:#333;}
.meta-section strong{color:${BLUE};font-size:12px;}
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
.notes-box{border:2px solid ${BLUE_LIGHT};border-radius:8px;padding:12px;min-height:50px;font-size:10px;color:#666;background:#fff;}
.terms{padding:18px 28px;border-top:1px solid #e5e7eb;}
.terms h4{font-size:10px;color:${BLUE};margin-bottom:8px;text-transform:uppercase;font-weight:700;}
.terms-box{border:2px solid ${BLUE_LIGHT};border-radius:8px;padding:12px;min-height:70px;font-size:10px;color:#666;background:#fff;}
.footer{padding:20px 28px;background:${BLUE};text-align:center;font-size:13px;color:#fff;font-weight:600;letter-spacing:0.5px;}
@media print{body{background:#fff!important;padding:0!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important;}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important;}.quote{box-shadow:none!important;border-radius:0!important;}th{background:${BLUE}!important;color:#fff!important;}.meta-section{background:${BLUE_LIGHT}!important;}.footer{background:${BLUE}!important;color:#fff!important;}.summary-bar .total{background:${BLUE_LIGHT}!important;}}
</style></head><body>
<div class="quote">
  <div class="header">
    <div class="logo-section">
      ${company.logo ? `<img src="${company.logo}" alt="${company.name}" style="max-width:70px;max-height:70px;object-fit:contain;margin-bottom:6px;border-radius:8px;"/>` : ''}
      <h1>${company.name}</h1>
      <p>COMPANY INFORMATION</p>
      ${company.address ? `<p>${company.address}</p>` : ''}
      ${company.phone ? `<p>${company.phone}</p>` : ''}
    </div>
    <div class="quote-info">
      <h2>ESTIMATED COST</h2>
      <p><strong>Estimate #:</strong> ${invoice.invoiceNumber}</p>
      <p><strong>Estimate Date:</strong> ${formatDate(invoice.date)}</p>
      <p style="margin-top:8px;font-size:13px;font-weight:700;"><strong>Total:</strong> ${formatAmount(invoice.amount)}</p>
    </div>
  </div>
  <div class="meta-section">
    <p><strong>Customer:</strong><br/>${customer.name}<br/>${customer.document || '-'}</p>
    <p><strong>Created By:</strong><br/>Admin</p>
    <p><strong>Status:</strong><br/><span style="background:${BLUE_LIGHT};color:${BLUE};padding:4px 10px;border-radius:12px;font-weight:700;font-size:10px;">Pending</span></p>
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
  <div class="footer">THANK YOU FOR YOUR BUSINESS!</div>
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
body{font-family:system-ui,-apple-system,sans-serif;background:#f5f5f5;padding:24px;}
.invoice{max-width:800px;margin:0 auto;background:#fff;border:2px solid #333;overflow:hidden;}
.top-header{background:${BLUE};color:#fff;padding:20px 28px;text-align:center;}
.top-header h1{font-size:20px;font-weight:700;margin-bottom:4px;display:flex;align-items:center;justify-content:center;gap:12px;}
.top-header p{font-size:11px;margin:2px 0;opacity:0.9;}
.invoice-title{padding:20px 28px;text-align:right;}
.invoice-title h2{font-size:36px;font-weight:800;color:#333;margin-bottom:12px;}
.invoice-title p{font-size:11px;color:#666;margin:4px 0;}
.invoice-title strong{color:#333;}
.billing-section{padding:20px 28px;display:grid;grid-template-columns:1fr 1fr;gap:32px;border-bottom:2px solid ${BLUE};}
.billing-section h3{font-size:11px;font-weight:700;color:#333;margin-bottom:10px;text-transform:uppercase;}
.billing-section p{font-size:11px;color:#555;margin:4px 0;}
table{width:100%;border-collapse:collapse;}
th{background:${BLUE};color:#fff;padding:12px 16px;text-align:left;font-size:11px;text-transform:uppercase;font-weight:700;}
th:nth-child(2){text-align:center;}
th:nth-child(3),th:nth-child(4){text-align:right;}
.bottom-section{padding:20px 28px;display:grid;grid-template-columns:1fr 280px;gap:24px;}
.notes h4{font-size:11px;font-weight:700;color:#333;margin-bottom:8px;text-transform:uppercase;}
.notes-box{border:2px solid #ddd;border-radius:4px;padding:12px;min-height:100px;font-size:10px;color:#666;}
.summary{background:#fafafa;border:2px solid #ddd;border-radius:4px;padding:16px;}
.summary-row{display:flex;justify-content:space-between;padding:8px 0;font-size:12px;border-bottom:1px solid #eee;}
.summary-row span:first-child{color:#666;}
.summary-row span:last-child{font-weight:600;color:#333;}
.balance-due{background:${BLUE};color:#fff;padding:14px 16px;margin:12px -16px -16px -16px;display:flex;justify-content:space-between;align-items:center;font-weight:700;font-size:16px;}
.balance-due span:last-child{font-size:18px;}
@media print{body{background:#fff!important;padding:0!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important;}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important;}.invoice{border:2px solid #333!important;}th{background:${BLUE}!important;color:#fff!important;}.top-header{background:${BLUE}!important;}.balance-due{background:${BLUE}!important;color:#fff!important;}}
</style></head><body>
<div class="invoice">
  <div class="top-header">
    <h1>
      ${company.logo ? `<img src="${company.logo}" alt="" style="max-width:50px;max-height:50px;object-fit:contain;border-radius:4px;background:#fff;padding:4px;"/>` : ''}
      ${company.name}
    </h1>
    ${company.address ? `<p>${company.address}</p>` : ''}
    <p>${[company.phone, company.email].filter(Boolean).join(' • ')}</p>
  </div>
  <div class="invoice-title">
    <h2>${docTitle}</h2>
    <p><strong>DATE:</strong> ${formatDate(invoice.date)}</p>
    <p><strong>INVOICE NO:</strong> ${invoice.invoiceNumber}</p>
    <p><strong>Payment terms:</strong> Due on receipt</p>
  </div>
  <div class="billing-section">
    <div>
      <h3>Bill To:</h3>
      <p><strong>${customer.name}</strong></p>
      <p>${customer.address || ''}</p>
      <p>${customer.phone ? `Phone: ${customer.phone}` : ''}</p>
    </div>
    <div>
      <h3>Ship To:</h3>
      <p>${customer.name}</p>
      <p>${customer.address || ''}</p>
      <p>${customer.phone ? `Phone: ${customer.phone}` : ''}</p>
    </div>
  </div>
  <table>
    <thead><tr><th>Description</th><th>QTY</th><th>Unit Price</th><th>Total</th></tr></thead>
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
