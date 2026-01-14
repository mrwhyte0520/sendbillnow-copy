import { formatAmount } from './numberFormat';
import { formatDate } from './dateFormat';

export type InvoiceTemplateType = 'simple' | 'detailed' | 'quotation';

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
}

const GREEN = '#008000';
const GREEN_LIGHT = '#e6f2e6';

export function generateInvoiceHtml(
  invoice: InvoiceData,
  customer: CustomerData,
  company: CompanyData,
  templateType: InvoiceTemplateType
): string {
  const rows = (invoice.items || []).map((item, idx) => 
    `<tr><td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">${idx + 1}</td><td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">${item.description}</td><td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatAmount(item.price)}</td><td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${item.quantity}</td><td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">${formatAmount(item.total)}</td></tr>`
  ).join('');

  const docTitle = templateType === 'quotation' ? 'QUOTATION' : 'INVOICE';

  if (templateType === 'simple') {
    return generateSimpleTemplate(invoice, customer, company, rows, docTitle);
  } else if (templateType === 'detailed') {
    return generateDetailedTemplate(invoice, customer, company, rows, docTitle);
  } else {
    return generateQuotationTemplate(invoice, customer, company);
  }
}

function generateSimpleTemplate(
  invoice: InvoiceData,
  customer: CustomerData,
  company: CompanyData,
  rows: string,
  docTitle: string
): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Invoice ${invoice.invoiceNumber}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:system-ui,sans-serif;background:#f5f5f5;padding:20px;}
.invoice{max-width:800px;margin:0 auto;background:#fff;border:1px solid #ddd;border-radius:8px;overflow:hidden;}
.header{display:flex;justify-content:space-between;padding:24px;border-bottom:3px solid ${GREEN};}
.logo-section h1{font-size:20px;color:${GREEN};margin-bottom:4px;}
.logo-section p{font-size:11px;color:#666;margin:2px 0;}
.invoice-info{text-align:right;}
.invoice-info h2{font-size:24px;color:${GREEN};margin-bottom:8px;}
.invoice-info p{font-size:11px;color:#666;margin:3px 0;}
.customer-section{padding:20px 24px;background:${GREEN_LIGHT};border-bottom:1px solid #ddd;}
.customer-section h3{font-size:12px;color:${GREEN};margin-bottom:8px;text-transform:uppercase;}
.customer-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;}
.customer-grid p{font-size:12px;color:#333;}
table{width:100%;border-collapse:collapse;}
th{background:${GREEN};color:#fff;padding:12px;text-align:left;font-size:12px;text-transform:uppercase;}
th:nth-child(3),th:nth-child(4),th:nth-child(5){text-align:right;}
.totals{padding:20px 24px;display:flex;justify-content:space-between;align-items:flex-start;}
.notes{flex:1;padding-right:40px;}
.notes h4{font-size:11px;color:#666;margin-bottom:8px;text-transform:uppercase;}
.notes-box{border:1px solid #ddd;border-radius:6px;padding:12px;min-height:60px;font-size:11px;color:#666;}
.summary{min-width:240px;}
.summary-row{display:flex;justify-content:space-between;padding:8px 0;font-size:13px;border-bottom:1px solid #eee;}
.summary-row.total{border-top:2px solid ${GREEN};border-bottom:none;font-weight:700;font-size:16px;color:${GREEN};margin-top:8px;padding-top:12px;}
.footer{padding:16px 24px;background:#f9f9f9;border-top:1px solid #ddd;text-align:center;font-size:11px;color:${GREEN};}
@media print{body{background:#fff;padding:0;}.invoice{border:none;border-radius:0;}}
</style></head><body>
<div class="invoice">
  <div class="header">
    <div class="logo-section">
      <h1>${company.name}</h1>
      ${company.address ? `<p>${company.address}</p>` : ''}
      ${company.phone ? `<p>Phone: ${company.phone}</p>` : ''}
      ${company.email ? `<p>Email: ${company.email}</p>` : ''}
    </div>
    <div class="invoice-info">
      <h2>${docTitle}</h2>
      <p><strong>Invoice No.:</strong> ${invoice.invoiceNumber}</p>
      <p><strong>Invoice Date:</strong> ${formatDate(invoice.date)}</p>
      <p><strong>Due Date:</strong> ${formatDate(invoice.dueDate)}</p>
      ${company.rnc ? `<p><strong>RNC:</strong> ${company.rnc}</p>` : ''}
      <p><strong>Invoice Total:</strong> ${formatAmount(invoice.amount)}</p>
    </div>
  </div>
  <div class="customer-section">
    <h3>Customer:</h3>
    <div class="customer-grid">
      <p><strong>Name:</strong> ${customer.name}</p>
      <p><strong>Email:</strong> ${customer.email || '-'}</p>
      <p><strong>Phone:</strong> ${customer.phone || '-'}</p>
    </div>
  </div>
  <table>
    <thead><tr><th>#</th><th>Description</th><th>Price</th><th>QTY</th><th>Amount</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    <div class="notes"><h4>Additional Notes:</h4><div class="notes-box"></div></div>
    <div class="summary">
      <div class="summary-row"><span>Subtotal:</span><span>${formatAmount(invoice.subtotal)}</span></div>
      <div class="summary-row"><span>Taxes:</span><span>${formatAmount(invoice.tax)}</span></div>
      <div class="summary-row total"><span>Grand Total:</span><span>${formatAmount(invoice.amount)}</span></div>
    </div>
  </div>
  <div class="footer">Thank you for your Business!</div>
</div>
<script>window.onload=function(){window.print();setTimeout(()=>window.close(),1000);};</script>
</body></html>`;
}

function generateDetailedTemplate(
  invoice: InvoiceData,
  customer: CustomerData,
  company: CompanyData,
  rows: string,
  docTitle: string
): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Invoice ${invoice.invoiceNumber}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:system-ui,sans-serif;background:#f5f5f5;padding:20px;}
.invoice{max-width:800px;margin:0 auto;background:#fff;border:1px solid #ddd;border-radius:8px;overflow:hidden;}
.header{display:flex;justify-content:space-between;padding:20px 24px;border-bottom:3px solid ${GREEN};}
.logo-section h1{font-size:18px;color:${GREEN};margin-bottom:4px;}
.logo-section p{font-size:10px;color:#666;margin:2px 0;}
.invoice-info{text-align:right;}
.invoice-info h2{font-size:22px;color:${GREEN};margin-bottom:6px;}
.invoice-info p{font-size:10px;color:#666;margin:2px 0;}
.customer-section{padding:16px 24px;background:${GREEN_LIGHT};border-bottom:1px solid #ddd;}
.customer-section h3{font-size:11px;color:${GREEN};margin-bottom:8px;text-transform:uppercase;}
.customer-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
.customer-grid p{font-size:11px;color:#333;margin:2px 0;}
table{width:100%;border-collapse:collapse;}
th{background:${GREEN};color:#fff;padding:10px;text-align:left;font-size:11px;text-transform:uppercase;}
th:nth-child(3),th:nth-child(4),th:nth-child(5){text-align:right;}
.totals{padding:16px 24px;display:flex;justify-content:space-between;align-items:flex-start;gap:20px;}
.notes{flex:1;}
.notes h4{font-size:10px;color:#666;margin-bottom:6px;text-transform:uppercase;}
.notes-box{border:1px solid #ddd;border-radius:4px;padding:10px;min-height:50px;font-size:10px;color:#666;}
.summary{min-width:200px;}
.summary-row{display:flex;justify-content:space-between;padding:6px 0;font-size:12px;border-bottom:1px solid #eee;}
.summary-row.total{border-top:2px solid ${GREEN};border-bottom:none;font-weight:700;font-size:14px;color:${GREEN};margin-top:6px;padding-top:10px;}
.terms{padding:16px 24px;border-top:1px solid #ddd;}
.terms h4{font-size:10px;color:#666;margin-bottom:6px;text-transform:uppercase;}
.terms-box{border:1px solid #ddd;border-radius:4px;padding:10px;min-height:60px;font-size:10px;color:#666;}
.signature{padding:20px 24px;border-top:1px solid #ddd;}
.signature h4{font-size:12px;color:#333;margin-bottom:12px;}
.signature-line{border-bottom:1px solid #333;width:200px;margin-bottom:4px;}
.signature p{font-size:10px;color:${GREEN};}
.footer{padding:14px 24px;background:#f9f9f9;border-top:1px solid #ddd;text-align:center;font-size:11px;color:${GREEN};}
@media print{body{background:#fff;padding:0;}.invoice{border:none;border-radius:0;}}
</style></head><body>
<div class="invoice">
  <div class="header">
    <div class="logo-section">
      <h1>${company.name}</h1>
      ${company.address ? `<p>${company.address}</p>` : ''}
      ${company.phone ? `<p>Phone: ${company.phone}</p>` : ''}
      ${company.email ? `<p>Email: ${company.email}</p>` : ''}
    </div>
    <div class="invoice-info">
      <h2>${docTitle}</h2>
      <p><strong>Invoice No.:</strong> ${invoice.invoiceNumber}</p>
      <p><strong>Invoice Date:</strong> ${formatDate(invoice.date)}</p>
      <p><strong>Due Date:</strong> ${formatDate(invoice.dueDate)}</p>
      <p><strong>Invoice Total:</strong> ${formatAmount(invoice.amount)}</p>
    </div>
  </div>
  <div class="customer-section">
    <h3>Customer:</h3>
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
    <tbody>${rows}</tbody>
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
  <div class="footer">Thank you for your Business!</div>
</div>
<script>window.onload=function(){window.print();setTimeout(()=>window.close(),1000);};</script>
</body></html>`;
}

function generateQuotationTemplate(
  invoice: InvoiceData,
  customer: CustomerData,
  company: CompanyData
): string {
  const quoteRows = (invoice.items || []).map(item => 
    `<tr><td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">${item.quantity}</td><td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">${item.description}</td><td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatAmount(item.price)}</td><td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">${formatAmount(item.total)}</td></tr>`
  ).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Quote ${invoice.invoiceNumber}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:system-ui,sans-serif;background:#f5f5f5;padding:20px;}
.quote{max-width:800px;margin:0 auto;background:#fff;border:1px solid #ddd;border-radius:8px;overflow:hidden;}
.header{display:flex;justify-content:space-between;padding:20px 24px;border-bottom:3px solid ${GREEN};}
.logo-section h1{font-size:16px;color:${GREEN};margin-bottom:4px;}
.logo-section p{font-size:10px;color:#666;margin:2px 0;}
.quote-info{text-align:right;}
.quote-info h2{font-size:20px;color:${GREEN};margin-bottom:6px;}
.quote-info p{font-size:10px;color:#666;margin:2px 0;}
.meta-section{padding:12px 24px;background:${GREEN_LIGHT};border-bottom:1px solid #ddd;display:grid;grid-template-columns:repeat(3,1fr);gap:12px;}
.meta-section p{font-size:10px;color:#333;}
.meta-section strong{color:${GREEN};}
table{width:100%;border-collapse:collapse;}
th{background:${GREEN};color:#fff;padding:10px;text-align:left;font-size:10px;text-transform:uppercase;}
th:nth-child(3),th:nth-child(4){text-align:right;}
.summary-bar{display:grid;grid-template-columns:repeat(4,1fr);padding:12px 24px;background:#f9f9f9;border-top:2px solid ${GREEN};border-bottom:1px solid #ddd;}
.summary-bar div{text-align:center;}
.summary-bar span{display:block;font-size:10px;color:#666;text-transform:uppercase;}
.summary-bar strong{font-size:13px;color:#333;}
.summary-bar .total strong{color:${GREEN};font-size:14px;}
.notes{padding:16px 24px;}
.notes h4{font-size:10px;color:#666;margin-bottom:6px;text-transform:uppercase;}
.notes-box{border:1px solid #ddd;border-radius:4px;padding:10px;min-height:40px;font-size:10px;color:#666;}
.terms{padding:16px 24px;border-top:1px solid #ddd;}
.terms h4{font-size:10px;color:#666;margin-bottom:6px;text-transform:uppercase;}
.terms-box{border:1px solid #ddd;border-radius:4px;padding:10px;min-height:60px;font-size:10px;color:#666;}
.footer{padding:14px 24px;background:${GREEN};text-align:center;font-size:11px;color:#fff;font-weight:600;}
@media print{body{background:#fff;padding:0;}.quote{border:none;border-radius:0;}}
</style></head><body>
<div class="quote">
  <div class="header">
    <div class="logo-section">
      <h1>${company.name}</h1>
      <p>COMPANY INFORMATION</p>
      ${company.address ? `<p>${company.address}</p>` : ''}
      ${company.phone ? `<p>${company.phone}</p>` : ''}
    </div>
    <div class="quote-info">
      <h2>QUOTATION</h2>
      <p><strong>Quote No.:</strong> ${invoice.invoiceNumber}</p>
      <p><strong>Quote Date:</strong> ${formatDate(invoice.date)}</p>
      <p><strong>Quote Total:</strong> ${formatAmount(invoice.amount)}</p>
    </div>
  </div>
  <div class="meta-section">
    <p><strong>Customer:</strong><br/>${customer.name}<br/>${customer.document || '-'}</p>
    <p><strong>Created By:</strong><br/>Admin</p>
    <p><strong>Status:</strong><br/>Pending</p>
  </div>
  <table>
    <thead><tr><th>QTY</th><th>DESCRIPTION</th><th>UNIT PRICE</th><th>AMOUNT</th></tr></thead>
    <tbody>${quoteRows}</tbody>
  </table>
  <div class="summary-bar">
    <div><span>SUBTOTAL:</span><strong>${formatAmount(invoice.subtotal)}</strong></div>
    <div><span>SALES TAX:</span><strong>${formatAmount(invoice.tax)}</strong></div>
    <div><span>TERMS:</span><strong>Net 30</strong></div>
    <div class="total"><span>TOTAL QUOTE:</span><strong>${formatAmount(invoice.amount)}</strong></div>
  </div>
  <div class="notes"><h4>NOTE:</h4><div class="notes-box"></div></div>
  <div class="terms"><h4>GENERAL TERMS AND CONDITIONS:</h4><div class="terms-box"></div></div>
  <div class="footer">THANK YOU FOR YOUR BUSINESS!</div>
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
