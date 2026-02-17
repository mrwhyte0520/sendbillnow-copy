import { formatAmount } from './numberFormat';



import { formatDate } from './dateFormat';







export type InvoiceTemplateType =

  | 'simple'

  | 'detailed'

  | 'quotation'

  | 'corporate'

  | 'job-estimate'

  | 'classic'

  | 'rent-receipt'

  | 'blue-invoice'

  | 'cash-receipt'

  | 'service-hours';



export interface JobEstimateSignatureFields {

  clientName?: string;

  clientSignature?: string;

  clientDate?: string;

  contractorName?: string;

  contractorSignature?: string;

  contractorDate?: string;

}



function generateServiceHoursInvoiceTemplate(invoice: InvoiceData, customer: CustomerData, company: CompanyData): string {
  const items = Array.isArray(invoice.items) ? invoice.items : [];
  const rows = items
    .map((item) => {
      const qty = Number((item as any).quantity ?? 0) || 0;
      const rate = Number((item as any).price ?? 0) || 0;
      const amount = Number((item as any).total ?? qty * rate) || 0;

      const timeStr = (() => {
        const sRaw = (item as any).startTime ?? (item as any).start_time ?? '';
        const eRaw = (item as any).endTime ?? (item as any).end_time ?? '';
        const s = sRaw === null || sRaw === undefined ? '' : String(sRaw).trim();
        const e = eRaw === null || eRaw === undefined ? '' : String(eRaw).trim();
        if (!s && !e) return '';
        if (s && e) return `${s} - ${e}`;
        return s || e;
      })();
      return `

        <tr>

          <td class="cell"><span class="sb_print_date_cell"></span></td>

          <td class="cell">${escapeHtml(String((item as any).description || ''))}</td>

          <td class="cell">${escapeHtml(timeStr || '')}</td>

          <td class="cell num">${escapeHtml(qty ? String(qty) : '')}</td>

          <td class="cell num">${escapeHtml(rate ? formatAmount(rate) : '')}</td>

          <td class="cell num">${escapeHtml(formatAmount(amount))}</td>

        </tr>

      `.trim();
    })
    .join('\n');



  const accountNumberStr = (() => {
    const raw = (invoice as any).accountNumber ?? (invoice as any).account_number ?? '';
    const s = raw === null || raw === undefined ? '' : String(raw).trim();
    return s ? escapeHtml(s) : '';
  })();



  const createdByStr = (() => {
    const raw = (invoice as any).createdBy ?? (invoice as any).created_by ?? '';
    const s = raw === null || raw === undefined ? '' : String(raw).trim();
    return s ? escapeHtml(s) : '';
  })();



  const footerLinks = (() => {
    const items: string[] = [];
    const has = (value: any) => {
      const v = value === null || value === undefined ? '' : String(value).trim();
      return Boolean(v);
    };

    if (has((company as any).facebook)) items.push('Facebook');
    if (has((company as any).instagram)) items.push('Instagram');
    if (has((company as any).twitter)) items.push('X');
    if (has((company as any).linkedin)) items.push('LinkedIn');
    if (has((company as any).youtube)) items.push('YouTube');
    if (has((company as any).tiktok)) items.push('TikTok');

    const waRaw = (company as any).whatsapp;
    const wa = waRaw === null || waRaw === undefined ? '' : String(waRaw).trim();
    if (wa) items.push(`WhatsApp: ${escapeHtml(wa)}`);

    return items;
  })();



  const poweredBy = (() => {
    const w = (company as any).website;
    const s = w === null || w === undefined ? '' : String(w).trim();
    return s ? escapeHtml(s) : 'sendbillnow.com';
  })();



  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Invoice ${escapeHtml(invoice.invoiceNumber)}</title>

<style>

  html,body{margin:0;padding:0;min-height:100%;background:#fff;color:#000;font-family:Georgia, 'Times New Roman', serif;}
  .page{padding:56px 64px 130px;position:relative;overflow:hidden;}
  .bg{position:fixed;left:0;top:0;right:0;bottom:0;z-index:0;pointer-events:none;}
  .bg:before{content:'';position:absolute;left:-160px;top:-180px;width:420px;height:420px;border-radius:999px;background:radial-gradient(circle at 30% 30%, rgba(0,27,158,0.10) 0%, rgba(0,27,158,0.00) 62%);}
  .bg:after{content:'';position:absolute;right:-220px;bottom:-220px;width:560px;height:560px;border-radius:999px;background:radial-gradient(circle at 60% 60%, rgba(0,27,158,0.07) 0%, rgba(0,27,158,0.00) 66%);}
  .bgBlobA{position:absolute;right:-140px;top:110px;width:320px;height:220px;border-radius:180px;filter:blur(0.2px);background:radial-gradient(circle at 30% 30%, rgba(37,99,235,0.10) 0%, rgba(37,99,235,0.00) 70%);transform:rotate(-10deg);}
  .bgBlobB{position:absolute;left:120px;bottom:-120px;width:360px;height:240px;border-radius:220px;background:radial-gradient(circle at 60% 40%, rgba(0,27,158,0.08) 0%, rgba(0,27,158,0.00) 72%);transform:rotate(12deg);}
  .bgStroke{position:absolute;left:52px;top:36px;width:240px;height:180px;border-radius:28px;transform:rotate(-8deg);border:2px solid rgba(0,27,158,0.10);border-left-color:rgba(0,27,158,0.00);border-bottom-color:rgba(0,27,158,0.00);}
  .bgStripe{position:absolute;left:0;right:0;top:44px;height:2px;background:linear-gradient(90deg, rgba(0,27,158,0.00) 0%, rgba(0,27,158,0.22) 20%, rgba(0,27,158,0.00) 72%);}
  .bgFadeBottom{position:absolute;left:0;right:0;bottom:0;height:360px;background:linear-gradient(180deg, rgba(0,27,158,0.00) 0%, rgba(0,27,158,0.06) 60%, rgba(0,27,158,0.10) 100%);}
  .bgMesh{position:absolute;inset:-40px;opacity:0.65;filter:saturate(1.05);background:
    radial-gradient(520px 420px at 16% 18%, rgba(37,99,235,0.15) 0%, rgba(37,99,235,0.00) 62%),
    radial-gradient(540px 460px at 84% 22%, rgba(0,27,158,0.13) 0%, rgba(0,27,158,0.00) 60%),
    radial-gradient(700px 560px at 58% 72%, rgba(37,99,235,0.10) 0%, rgba(37,99,235,0.00) 64%),
    linear-gradient(140deg, rgba(0,27,158,0.00) 0%, rgba(0,27,158,0.06) 42%, rgba(0,27,158,0.00) 78%);
    mix-blend-mode:multiply;}
  .bgTopGlow{position:absolute;left:-40px;right:-40px;top:-40px;height:320px;background:linear-gradient(180deg, rgba(0,27,158,0.10) 0%, rgba(0,27,158,0.06) 30%, rgba(0,27,158,0.00) 92%);filter:blur(10px);opacity:0.95;}
  .bgDots{position:absolute;inset:0;opacity:0.22;background-image:radial-gradient(rgba(0,27,158,0.18) 0.7px, rgba(0,0,0,0) 0.8px);background-size:22px 22px;background-position:10px 14px;}
  .bgDiag{position:absolute;left:-120px;top:260px;width:520px;height:220px;transform:rotate(-18deg);background:linear-gradient(90deg, rgba(0,27,158,0.00) 0%, rgba(0,27,158,0.06) 35%, rgba(0,27,158,0.00) 75%);border-radius:28px;}
  .bgFrame{position:absolute;inset:18px;border:1px solid rgba(0,27,158,0.10);border-radius:22px;}
  .bgWave{position:absolute;left:-120px;right:-120px;top:-170px;height:340px;border-radius:0 0 620px 620px;background:radial-gradient(circle at 50% 120%, rgba(0,27,158,0.14) 0%, rgba(0,27,158,0.08) 38%, rgba(0,27,158,0.00) 82%);transform:rotate(-2deg);filter:blur(6px);opacity:0.85;}
  .content{position:relative;z-index:1;}
  .top{display:flex;justify-content:space-between;align-items:flex-start;}
  .companyName{font-size:22px;font-weight:700;margin-bottom:4px;color:${BLUE};}
  .companyMeta{font-size:13px;line-height:1.35;}
  .invoiceTitle{font-size:32px;font-weight:800;letter-spacing:1px;color:${BLUE};text-align:right;}
  .metaRight{margin-top:10px;font-size:13px;line-height:1.5;text-align:right;}
  .metaLabel{font-weight:700;}
  .totalLabel{font-weight:800;color:${BLUE};}
  .totalAmount{font-weight:900;color:#16a34a;}
  .customerNameLine{font-weight:900;font-size:14px;}
  .billRow{display:flex;justify-content:space-between;gap:32px;margin-top:48px;font-size:13px;}
  .billBox{min-width:280px;}
  .card{border:1px solid rgba(0,27,158,0.12);border-radius:14px;padding:12px 14px;background:linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0.90) 100%);box-shadow:0 1px 0 rgba(0,27,158,0.06);}
  .card .billHead{margin-bottom:8px;}
  .billHead{font-weight:900;margin-bottom:6px;display:inline-block;padding:4px 10px;border-radius:999px;background:linear-gradient(90deg, rgba(0,27,158,0.95) 0%, rgba(37,99,235,0.85) 100%);color:#fff;letter-spacing:0.3px;font-size:11px;}
  table{width:100%;border-collapse:collapse;margin-top:42px;font-size:12px;}
  th,td{border:1px solid ${BLUE};padding:6px 8px;vertical-align:top;}
  th{font-weight:800;text-align:center;color:#fff;background:${BLUE};}
  td.num{text-align:right;}
  .grand{display:flex;justify-content:flex-end;margin-top:18px;}
  .grandRow{display:flex;gap:10px;align-items:baseline;}
  .grandText{font-weight:900;color:${BLUE};font-size:13px;}
  .grandValue{font-weight:900;font-size:18px;color:#16a34a;}
  .thanks{margin-top:36px;text-align:center;font-weight:800;color:${BLUE};font-size:13px;}

  .footerBar{position:absolute;left:0;right:0;bottom:0;background:${BLUE};color:#fff;padding:18px 64px;border-radius:0;}
  .footerTitle{text-align:center;font-weight:800;font-size:12px;}
  .footerLinks{margin-top:8px;text-align:center;font-size:10px;opacity:0.95;}
  .footerDivider{height:1px;background:rgba(255,255,255,0.25);margin:12px 0;}
  .footerPowered{text-align:center;font-size:10px;opacity:0.9;}

  @media print{
    @page{margin:12mm;}
    html,body{min-height:0;height:auto;}
    .page{padding-bottom:130px;}
    *{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
    th{background:${BLUE}!important;color:#fff!important;}
    .bg:before{background:radial-gradient(circle at 30% 30%, rgba(0,27,158,0.10) 0%, rgba(0,27,158,0.00) 62%)!important;}
    .bg:after{background:radial-gradient(circle at 60% 60%, rgba(0,27,158,0.07) 0%, rgba(0,27,158,0.00) 66%)!important;}
    .bgBlobA{background:radial-gradient(circle at 30% 30%, rgba(37,99,235,0.10) 0%, rgba(37,99,235,0.00) 70%)!important;}
    .bgBlobB{background:radial-gradient(circle at 60% 40%, rgba(0,27,158,0.08) 0%, rgba(0,27,158,0.00) 72%)!important;}
    .bgStroke{border-color:rgba(0,27,158,0.10)!important;border-left-color:rgba(0,27,158,0.00)!important;border-bottom-color:rgba(0,27,158,0.00)!important;}
    .bgStripe{background:linear-gradient(90deg, rgba(0,27,158,0.00) 0%, rgba(0,27,158,0.22) 20%, rgba(0,27,158,0.00) 72%)!important;}
    .bgMesh{background:
      radial-gradient(520px 420px at 16% 18%, rgba(37,99,235,0.15) 0%, rgba(37,99,235,0.00) 62%),
      radial-gradient(540px 460px at 84% 22%, rgba(0,27,158,0.13) 0%, rgba(0,27,158,0.00) 60%),
      radial-gradient(700px 560px at 58% 72%, rgba(37,99,235,0.10) 0%, rgba(37,99,235,0.00) 64%),
      linear-gradient(140deg, rgba(0,27,158,0.00) 0%, rgba(0,27,158,0.06) 42%, rgba(0,27,158,0.00) 78%)!important;}
    .bgTopGlow{background:linear-gradient(180deg, rgba(0,27,158,0.10) 0%, rgba(0,27,158,0.06) 30%, rgba(0,27,158,0.00) 92%)!important;}
    .bgDots{background-image:radial-gradient(rgba(0,27,158,0.18) 0.7px, rgba(0,0,0,0) 0.8px)!important;}
    .bgDiag{background:linear-gradient(90deg, rgba(0,27,158,0.00) 0%, rgba(0,27,158,0.06) 35%, rgba(0,27,158,0.00) 75%)!important;}
    .bgFrame{border-color:rgba(0,27,158,0.10)!important;}
    .bgWave{background:radial-gradient(circle at 50% 120%, rgba(0,27,158,0.14) 0%, rgba(0,27,158,0.08) 38%, rgba(0,27,158,0.00) 82%)!important;}
    .footerBar{position:fixed;left:0;right:0;bottom:0;background:${BLUE}!important;color:#fff!important;border-radius:0!important;}
  }

</style>

</head><body>

  <div class="page">

    <div class="bg" aria-hidden="true">
      <div class="bgWave"></div>
      <div class="bgMesh"></div>
      <div class="bgTopGlow"></div>
      <div class="bgFrame"></div>
      <div class="bgDots"></div>
      <div class="bgStripe"></div>
      <div class="bgDiag"></div>
      <div class="bgBlobA"></div>
      <div class="bgBlobB"></div>
      <div class="bgStroke"></div>
      <div class="bgFadeBottom"></div>
    </div>

    <div class="content">

    <div class="top">

      <div>

        <div class="companyName">${escapeHtml(company.name || 'Company Name')}</div>

        <div class="companyMeta">

          ${(() => {
            const lines = companyAddressLines(company);
            const line1 = lines.line1 ? String(lines.line1) : '';
            const line2 = lines.line2 ? String(lines.line2) : '';
            const addr1 = line1.trim() ? `<div>Address: ${escapeHtml(line1.trim())}</div>` : '';
            const addr2 = line2.trim() ? `<div>${escapeHtml(line2.trim())}</div>` : '';
            return `${addr1}${addr2}`;
          })()}

          ${company.phone ? `<div>Phone: ${escapeHtml(company.phone)}</div>` : ''}

          ${company.email ? `<div>Email: ${escapeHtml(company.email)}</div>` : ''}

          ${(company as any).website ? `<div>Website: ${escapeHtml(String((company as any).website))}</div>` : ''}

        </div>

      </div>

      <div>

        <div class="invoiceTitle">INVOICE</div>

        <div class="metaRight">

          ${accountNumberStr ? `<div><span class="metaLabel">Account #:</span> ${accountNumberStr}</div>` : ''}

          <div><span class="metaLabel">INVOICE:</span> ${escapeHtml(invoice.invoiceNumber)}</div>

          <div><span class="metaLabel">Invoice Date:</span> <span id="sb_print_date"></span></div>

          <div><span class="metaLabel">Time:</span> <span id="sb_print_time"></span></div>

          ${createdByStr ? `<div><span class="metaLabel">Created By:</span> ${createdByStr}</div>` : ''}

          <div><span class="totalLabel">Total:</span> <span class="totalAmount">${escapeHtml(
            formatAmount(
              (() => {
                const raw = (invoice as any).total ?? (invoice as any).grandTotal ?? (invoice as any).grand_total;
                const direct = Number(raw);
                if (Number.isFinite(direct)) return direct;

                const sum = items.reduce((acc, it: any) => {
                  const qty = Number(it?.quantity ?? 0) || 0;
                  const rate = Number(it?.price ?? 0) || 0;
                  const amount = Number(it?.total ?? qty * rate) || 0;
                  return acc + amount;
                }, 0);

                return Number.isFinite(sum) ? sum : 0;
              })(),
            ),
          )}</span></div>

        </div>

      </div>

    </div>

    <div class="billRow">

      <div class="billBox">

        <div class="card">

        <div class="billHead">TO:</div>

        <div class="customerNameLine">${escapeHtml(customer.name || '')}</div>

        ${customer.document ? `<div>${escapeHtml(String(customer.document))}</div>` : ''}

        ${(() => {
          const lines = customerAddressLines(customer);
          const line1 = lines.line1 ? `<div>${escapeHtml(lines.line1)}</div>` : '';
          const line2 = lines.line2 ? `<div>${escapeHtml(lines.line2)}</div>` : '';
          return `${line1}${line2}`;
        })()}

        ${customer.email ? `<div>${escapeHtml(String(customer.email))}</div>` : ''}

        ${customer.phone ? `<div>${escapeHtml(String(customer.phone))}</div>` : ''}

        </div>

      </div>

      <div class="billBox">

        <div class="card">

        <div class="billHead">FOR:</div>

        <div>${escapeHtml(String((invoice as any).serviceDescription || (invoice as any).job || (invoice as any).project || 'Consulting Services'))}</div>

        </div>

      </div>

    </div>

    <table>

      <thead>

        <tr>

          <th style="width:12%">Date</th>

          <th>Description of Services</th>

          <th style="width:20%">Start Time and End Time</th>

          <th style="width:12%">Total Hours</th>

          <th style="width:12%">Hourly Rate</th>

          <th style="width:12%">Total Amount</th>

        </tr>

      </thead>

      <tbody>

        ${rows || `<tr><td class="cell">&nbsp;</td><td class="cell">&nbsp;</td><td class="cell">&nbsp;</td><td class="cell">&nbsp;</td><td class="cell">&nbsp;</td><td class="cell">&nbsp;</td></tr>`}

      </tbody>

    </table>

    <div class="grand">
      <div class="grandRow">
        <div class="grandText">Grand Total:</div>
        <div class="grandValue">${escapeHtml(
        formatAmount(
          (() => {
            const raw = (invoice as any).total ?? (invoice as any).grandTotal ?? (invoice as any).grand_total;
            const direct = Number(raw);
            if (Number.isFinite(direct)) return direct;

            const sum = items.reduce((acc, it: any) => {
              const qty = Number(it?.quantity ?? 0) || 0;
              const rate = Number(it?.price ?? 0) || 0;
              const amount = Number(it?.total ?? qty * rate) || 0;
              return acc + amount;
            }, 0);

            return Number.isFinite(sum) ? sum : 0;
          })(),
        ),
      )}</div>
      </div>
    </div>

    </div>

    <div class="footerBar">
      <div class="footerTitle">Thank you for your business.</div>
      ${footerLinks.length ? `<div class="footerLinks">${footerLinks.join(' | ')}</div>` : ''}
      <div class="footerDivider"></div>
      <div class="footerPowered">Powered by: ${poweredBy}</div>
    </div>

  </div>



<script>(function(){
  const setNow=function(){
    const d=new Date();
    const date=d.toLocaleDateString();
    const time=d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateEl=document.getElementById('sb_print_date');
    if(dateEl) dateEl.textContent=date;
    const timeEl=document.getElementById('sb_print_time');
    if(timeEl) timeEl.textContent=time;
    document.querySelectorAll('.sb_print_date_cell').forEach((el)=>{ el.textContent=date; });
  };
  window.onbeforeprint=setNow;
  window.onload=function(){ setNow(); window.print(); setTimeout(()=>window.close(),1000); };
})();</script>

</body></html>`;



}



export interface InvoicePrintOptions {

  jobEstimate?: JobEstimateSignatureFields;

}







interface InvoiceData {



  invoiceNumber: string;

  accountNumber?: string;



  date: string;



  dueDate: string;



  createdBy?: string;

  paymentMethod?: string;

  paymentReference?: string;



  amount: number;



  subtotal: number;



  tax: number;



  discount_type?: 'percentage' | 'fixed';



  discount_value?: number;



  total_discount?: number;



  items: { description: string; quantity: number; price: number; total: number }[];



  notes?: string | null;



  terms?: string | null;



}



function generateClassicInvoiceTemplate(



  invoice: InvoiceData,



  customer: CustomerData,



  company: CompanyData



): string {



  const notesHtml = invoice.notes ? escapeHtml(String(invoice.notes)) : '';



  const classicDiscountType = (invoice as any).discount_type as 'percentage' | 'fixed' | undefined;

  const classicDiscountValue = Number((invoice as any).discount_value ?? 0) || 0;

  const classicDiscountAmount = Number((invoice as any).total_discount ?? 0) || 0;

  const classicDiscountLabel = classicDiscountType === 'percentage' ? `${classicDiscountValue}%` : '';

  const classicAccountNumber = (() => {
    const raw = (invoice as any)?.accountNumber ?? (invoice as any)?.account_number;
    const s = raw === null || raw === undefined ? '' : String(raw).trim();
    if (!s) return 'N/A';
    if (!/^[0-9]+$/.test(s)) return 'N/A';
    return s;
  })();

  const customerAddr = (() => {
    const raw = customer.address ? String(customer.address) : '';
    if (!raw) return { street: '', city: '', state: '', zip: '' };

    const parsed = parseAddress(raw);
    const onlyStreet = Boolean(parsed.street) && !parsed.city && !parsed.state && !parsed.zip;
    if (onlyStreet && raw.includes(',')) {
      const parts = raw
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
      return {
        street: parts[0] || parsed.street || '',
        city: parts[1] || '',
        state: parts[2] || '',
        zip: parts[3] || '',
      };
    }

    return parsed;
  })();

  const customerAddressHtml = customer.address
    ? (() => {
        const line1 = customerAddr.street ? `<div>${escapeHtml(customerAddr.street)}</div>` : '';
        const city = String(customerAddr.city || '').trim();
        const state = String(customerAddr.state || '').trim();
        const zip = String(customerAddr.zip || '').trim();
        const tail = [state, zip].filter(Boolean).join(' ');
        const line2Text = [city, tail].filter(Boolean).join(city && tail ? ', ' : '');
        const line2 = line2Text ? `<div>${escapeHtml(line2Text)}</div>` : '';
        return `${line1}${line2}`;
      })()
    : '';



  const rows = (invoice.items || [])

    .map(

      (item) => `

        <tr>

          <td style="padding:8px 10px;border:1px solid ${BLUE};">${escapeHtml(String(item.description || ''))}</td>

          <td style="padding:8px 10px;border:1px solid ${BLUE};text-align:center;">${item.quantity}</td>

          <td style="padding:8px 10px;border:1px solid ${BLUE};text-align:right;">${formatAmount(item.total)}</td>

        </tr>

      `.trim()

    )

    .join('');



  const footerLinksParts: string[] = [];

  if (company.facebook) footerLinksParts.push('Facebook');

  if (company.instagram) footerLinksParts.push('Instagram');

  if (company.twitter) footerLinksParts.push('X');

  if (company.linkedin) footerLinksParts.push('LinkedIn');

  if (company.youtube) footerLinksParts.push('YouTube');

  if (company.tiktok) footerLinksParts.push('TikTok');

  if (company.whatsapp) footerLinksParts.push(`WhatsApp: ${escapeHtml(company.whatsapp)}`);

  const footerLinksText = footerLinksParts.join(' | ');



  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Invoice ${invoice.invoiceNumber}</title>

<style>

*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}

@page{margin:12mm;}

body{font-family:Arial, sans-serif;background:#fff;color:#000;}

.invoice{max-width:900px;margin:0 auto;background:#fff;min-height:100vh;position:relative;padding-bottom:200px;}

.invoice::before{content:'';position:absolute;inset:0;pointer-events:none;z-index:0;background:
  radial-gradient(520px 220px at 20% 18%, rgba(0,27,158,0.10), transparent 60%),
  radial-gradient(420px 200px at 85% 28%, rgba(22,163,74,0.08), transparent 60%);
}

.invoice::after{content:'';position:absolute;left:-40px;top:120px;width:260px;height:260px;border-radius:999px;pointer-events:none;z-index:0;background:linear-gradient(135deg, rgba(0,27,158,0.10), rgba(0,27,158,0));filter:blur(0px);}

.invoice > *{position:relative;z-index:1;}

.top{display:flex;justify-content:space-between;align-items:flex-start;padding:18px 10px 0 10px;}

.logo{width:170px;height:95px;border:none;display:flex;align-items:center;justify-content:center;font-weight:700;}

.logo img{max-width:170px;max-height:95px;object-fit:contain;}

.company{font-size:12px;line-height:1.4;text-align:right;}

.company .companyName{font-weight:800;font-size:16px;}

.title{margin-top:8px;text-align:center;font-size:44px;font-weight:800;text-decoration:underline;letter-spacing:1px;color:${BLUE};}

.powered a{color:inherit;text-decoration:underline;}

.footer a{color:inherit;text-decoration:underline;}

.footerBlue a{color:#fff !important;text-decoration:underline;}

.meta{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;padding:0 10px;font-size:12px;align-items:start;}

.meta .billTo{justify-self:start;line-height:1.35;}

.meta .invoiceInfo{justify-self:end;text-align:right;line-height:1.35;}

.meta .box{min-height:40px;}

.meta .label{font-weight:800;color:#111;margin-bottom:4px;text-transform:uppercase;font-size:10px;letter-spacing:0.4px;}

.meta .row{margin:2px 0;font-size:11px;}

.meta .row .label{margin-bottom:0;text-transform:none;font-size:11px;letter-spacing:0;}

.meta .row .label{display:inline-block;min-width:88px;}

.meta .billTo .customerName{font-weight:900;font-size:14px;color:#111;}

.meta .invoiceInfo .row.invoiceTotalRow{margin-top:6px;font-size:13px;}
.meta .invoiceInfo .row.invoiceTotalRow .label{font-weight:900;color:${BLUE};}
.meta .invoiceInfo .row.invoiceTotalRow .value{font-size:14px;font-weight:900;color:#16a34a;}

.metaDivider{height:2px;background:${BLUE} !important;margin:10px 10px 6px 10px;}

.table-wrap{margin-top:22px;padding:0 10px;}

table{width:100%;border-collapse:collapse;}

th{border:2px solid ${BLUE};padding:8px 10px;text-align:left;font-size:12px;background-color:${BLUE} !important;color:#fff !important;}

th:nth-child(2){text-align:center;width:80px;}

th:nth-child(3){text-align:right;width:140px;}

td{font-size:12px;padding:8px 10px;border-left:1px solid ${BLUE};border-right:1px solid ${BLUE};}

tbody tr{border-bottom:1px solid ${BLUE};}

tbody tr:nth-child(even){background:#f9fafb;}

.bottom{display:grid;grid-template-columns:1.2fr 0.8fr;gap:18px;margin-top:28px;padding:0 10px;}

.notes{border:2px solid ${BLUE};min-height:180px;padding:10px;}

.notes .label{font-weight:700;margin-bottom:6px;background-color:${BLUE} !important;color:#fff !important;padding:6px 8px;margin:-10px -10px 8px -10px;}

.totals{font-size:12px;line-height:1.9;padding-top:6px;}

.totals .row{display:flex;justify-content:space-between;gap:12px;}

.totals .row span:last-child{font-variant-numeric:tabular-nums;}

.footer{margin-top:26px;text-align:center;font-size:12px;padding-bottom:16px;}

.footerBlue{background-color:${BLUE} !important;color:#fff !important;padding:16px 14px;text-align:center;position:absolute;left:10px;right:10px;bottom:0;}

.footerBlue .thanks{font-weight:700;font-size:12px;margin-bottom:8px;}

.footerBlue .links{font-size:10px;opacity:0.95;}

.footerBlue .divider{height:1px;background:rgba(255,255,255,0.35);margin:10px 0;}

.footerBlue .powered{font-size:10px;opacity:0.9;}

</style>

</head><body>

  <div class="invoice">

    <div class="top">

      <div class="logo">${company.logo ? `<img src="${company.logo}" alt="${escapeHtml(company.name || 'Company')}"/>` : 'LOGO'}</div>

      <div class="company">

        <div class="companyName">${escapeHtml(company.name || 'COMPANY NAME')}</div>

        ${(() => {
          const lines = companyAddressLines(company);
          return `${lines.line1 ? `<div>${escapeHtml(lines.line1)}</div>` : ''}${lines.line2 ? `<div>${escapeHtml(lines.line2)}</div>` : ''}`;
        })()}

        ${company.phone ? `<div>${escapeHtml(company.phone)}</div>` : ''}

        ${company.email ? `<div>${escapeHtml(company.email)}</div>` : ''}

        ${company.website ? `<div>${escapeHtml(company.website)}</div>` : ''}

      </div>

    </div>



    <div class="title">INVOICE</div>



    <div class="meta">

      <div class="box billTo">

        <div class="label">Bill To:</div>

        <div class="customerName">${escapeHtml(customer.name || 'Customer')}</div>

        ${customerAddressHtml}

        ${customer.phone ? `<div>${escapeHtml(customer.phone)}</div>` : ''}

        ${customer.email ? `<div>${escapeHtml(customer.email)}</div>` : ''}

      </div>

      <div class="box invoiceInfo">

        <div class="row"><span class="label">Account #:</span> ${escapeHtml(classicAccountNumber)}</div>

        <div class="row"><span class="label">Invoice #:</span> ${escapeHtml(invoice.invoiceNumber)}</div>

        <div class="row"><span class="label">Invoice Date:</span> <span id="sb_print_date"></span></div>

        <div class="row"><span class="label">Time:</span> <span id="sb_print_time"></span></div>

        ${invoice.createdBy
          ? `<div class="row"><span class="label">Created By:</span> ${escapeHtml(invoice.createdBy)}</div>`
          : ''}

        <div class="row invoiceTotalRow"><span class="label">Invoice Total:</span> <span class="value">${formatAmount(invoice.amount)}</span></div>

      </div>

    </div>



    <div class="metaDivider"></div>



    <div class="table-wrap">

      <table>

        <thead>

          <tr>

            <th>Description of Service</th>

            <th>Qty</th>

            <th>Amount</th>

          </tr>

        </thead>

        <tbody>

          ${rows || `<tr><td style="padding:10px;border:1px solid ${BLUE};">&nbsp;</td><td style="padding:10px;border:1px solid ${BLUE};">&nbsp;</td><td style="padding:10px;border:1px solid ${BLUE};">&nbsp;</td></tr>`}

        </tbody>

      </table>

    </div>



    <div class="bottom">

      <div class="notes">

        <div class="label">Notes:</div>

        <div style="white-space:pre-wrap;">${notesHtml}</div>

      </div>

      <div class="totals">

        <div class="row"><span>Subtotal:</span><span>${formatAmount(invoice.subtotal)}</span></div>

        <div class="row"><span>Discount${classicDiscountLabel ? ` (${escapeHtml(classicDiscountLabel)})` : ''}:</span><span>(-) ${formatAmount(classicDiscountAmount)}</span></div>

        <div class="row"><span>Taxes:</span><span>${formatAmount(invoice.tax)}</span></div>

        <div class="row" style="font-weight:800;"><span>Grand Total:</span><span style="color:#16a34a;font-weight:900;">${formatAmount(invoice.amount)}</span></div>

      </div>

    </div>



    <div class="footerBlue">

      <div class="thanks">Thank you for your purchase.</div>

      ${footerLinksText ? `<div class="links">${footerLinksText}</div>` : ''}

      <div class="divider"></div>

      <div class="powered">Powered by: <a href="https://sendbillnow.com" target="_blank" rel="noopener noreferrer">sendbillnow.com</a></div>

    </div>

  </div>



<script>(function(){
  const setNow=function(){
    const d=new Date();
    const date=d.toLocaleDateString();
    const time=d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateEl=document.getElementById('sb_print_date');
    if(dateEl) dateEl.textContent=date;
    const timeEl=document.getElementById('sb_print_time');
    if(timeEl) timeEl.textContent=time;
  };
  window.onbeforeprint=setNow;
  window.onload=function(){ setNow(); window.print(); setTimeout(()=>window.close(),1000); };
})();</script>



</body></html>`;

}



function generateCashReceiptTemplate(



  invoice: InvoiceData,



  customer: CustomerData,



  company: CompanyData



): string {



  const rows = (invoice.items || [])

    .map(

      (item) => `

        <tr>

          <td style="padding:8px 10px;border:1px solid #d1d5db;">${escapeHtml(String(item.description || ''))}</td>

          <td style="padding:8px 10px;border:1px solid #d1d5db;text-align:right;">${formatAmount(item.total)}</td>

        </tr>

      `.trim()

    )

    .join('');

  const notesHtml = invoice.notes ? escapeHtml(String(invoice.notes)) : '';

  const paymentMethodStr = String(
    (invoice as any).paymentMethod ?? (invoice as any).payment_method ?? ''
  )
    .trim()
    .toLowerCase();

  const paymentRefStr = String(
    (invoice as any).paymentReference ?? (invoice as any).payment_reference ?? ''
  ).trim();

  const depositAmount = Number(
    (invoice as any).deposit ?? (invoice as any).depositAmount ?? (invoice as any).deposit_amount ?? 0
  ) || 0;



  const balanceDueAmount = Number(
    (invoice as any).balanceDue ?? (invoice as any).balance_due ?? (invoice as any).balance_due_amount ?? invoice.amount
  ) || 0;



  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Cash Receipt ${escapeHtml(invoice.invoiceNumber)}</title>

<style>

*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}

@page{margin:10mm;}

html,body{height:100%;}

body{font-family:Arial, sans-serif;background:linear-gradient(135deg,#ffffff 0%,#f6f9ff 55%,#ffffff 100%);color:#111;margin:0;}

.doc{width:100%;min-height:100vh;display:flex;flex-direction:column;}

.bar{height:10px;background:${BLUE};}

.content{padding:18px 18px 0 18px;flex:1;display:flex;flex-direction:column;position:relative;overflow:hidden;}

.shape{position:absolute;border-radius:999px;pointer-events:none;z-index:0;opacity:0.35;filter:blur(0px);}
.shape.s1{width:220px;height:220px;left:-70px;top:70px;background:radial-gradient(circle at 30% 30%,rgba(37,99,235,0.28),rgba(37,99,235,0));}
.shape.s2{width:180px;height:180px;right:-60px;top:170px;background:radial-gradient(circle at 30% 30%,rgba(16,185,129,0.22),rgba(16,185,129,0));}
.shape.s3{width:240px;height:240px;right:-80px;bottom:180px;background:radial-gradient(circle at 30% 30%,rgba(37,99,235,0.18),rgba(37,99,235,0));}



.top{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;}

.title{font-size:24px;font-weight:900;color:${BLUE};letter-spacing:0.3px;margin-top:58px;margin-left:18px;}

.rightBox{display:flex;flex-direction:column;align-items:center;gap:10px;}

.logoCircle{width:74px;height:74px;border-radius:999px;background:#6b7280;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:11px;overflow:hidden;flex:0 0 auto;}

.logoCircle img{width:100%;height:100%;object-fit:cover;}

.meta{min-width:170px;text-align:center;}

.metaBox{background:rgba(255,255,255,0.38);border:1px solid rgba(209,213,219,0.18);border-radius:12px;padding:10px 12px;box-shadow:0 2px 7px rgba(17,24,39,0.025);}


.metaRow{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid #d1d5db;font-size:11px;width:100%;}

.metaRow .label{font-weight:900;color:#111;font-size:11px;letter-spacing:0;}

.metaRow .value{font-weight:700;color:#111;text-align:right;}

.metaRow:last-child{border-bottom:1px solid #d1d5db;}



.fromTo{margin-top:-138px;display:grid;grid-template-columns:1fr 1fr;gap:26px;font-size:11px;max-width:560px;margin-left:18px;margin-right:auto;position:relative;z-index:1;}

.fromTo .head{font-weight:900;margin-bottom:8px;text-transform:uppercase;color:#6b7280;font-size:10px;}

.toCol{margin-left:0;}

.line{margin:4px 0;line-height:1.25;}

.addrBox{background:rgba(255,255,255,0.34);border:1px solid rgba(209,213,219,0.16);border-radius:12px;padding:12px 14px;box-shadow:0 2px 7px rgba(17,24,39,0.02);}

.companyName{font-weight:900;font-size:13px;color:#111;letter-spacing:0.2px;}

.customerName{font-weight:900;color:#111;}



table{width:100%;border-collapse:collapse;margin-top:18px;}

th{background:${BLUE} !important;color:#fff !important;text-align:left;font-size:11px;padding:8px 10px;border:1px solid ${BLUE};text-transform:uppercase;letter-spacing:0.3px;}

th:nth-child(2){text-align:right;width:160px;}

td{font-size:11px;}



.bottom{margin-top:14px;display:grid;grid-template-columns:1fr 320px;gap:20px;align-items:start;}

.notes{font-size:11px;color:#111;}

.notes .head{font-weight:900;margin-bottom:6px;color:#111;}

.notes .box{min-height:110px;white-space:pre-wrap;}

.totals{font-size:11px;color:#111;}

.totalsRow{display:flex;justify-content:space-between;gap:10px;padding:3px 0;}

.totalsRow .label{text-transform:uppercase;font-weight:900;color:#6b7280;}

.totalsRow .value{text-align:right;min-width:110px;}

.balance{margin-top:4px;display:flex;justify-content:space-between;align-items:center;gap:10px;font-weight:900;font-size:14px;color:#111;}

.balanceBox{flex:1;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;min-height:44px;}

.balanceBox .curr{font-weight:900;}

.balanceBox .amt{font-weight:900;color:#16a34a;}



.payment{margin-top:18px;display:flex;justify-content:space-between;align-items:flex-end;gap:18px;font-size:11px;}

.payment .left{display:flex;gap:12px;align-items:flex-start;}

.checks{display:flex;flex-direction:column;gap:6px;margin-top:2px;}

.checks label{display:flex;align-items:center;gap:6px;}

.signLine{flex:1;border-bottom:1px solid ${BLUE};height:16px;min-width:160px;display:flex;align-items:flex-end;padding-left:6px;font-weight:700;}



.footer{margin-top:auto;text-align:center;padding:14px 18px;background:${BLUE};color:#fff;}

.footerThanks{font-weight:700;font-size:12px;margin-bottom:6px;}

.footerPowered{font-size:10px;opacity:0.95;}

.footer a{color:#fff !important;text-decoration:underline;}

.metaRow.emphasis .label{color:${BLUE};}

.metaRow.emphasis .value{color:#16a34a;font-weight:900;}

.metaRow.emphasis{border-bottom:2px solid rgba(22,163,74,0.25);}

</style>

</head><body>

  <div class="doc">

    <div class="bar"></div>

    <div class="content">

      <div class="shape s1"></div>

      <div class="shape s2"></div>

      <div class="shape s3"></div>

      <div class="top">

        <div class="title">CASH RECEIPT</div>

        <div class="rightBox">

          <div class="logoCircle">${company.logo ? `<img src="${company.logo}" alt="${escapeHtml(company.name || 'Company')}"/>` : 'LOGO'}</div>

          <div class="meta metaBox">

            ${(() => {
              const raw = (invoice as any).accountNumber ?? (invoice as any).account_number ?? undefined;
              const s = raw === null || raw === undefined ? '' : String(raw).trim();
              return s ? `<div class="metaRow"><span class="label">Account #:</span><span class="value">${escapeHtml(s)}</span></div>` : '';
            })()}

            <div class="metaRow"><span class="label">Invoice #:</span><span class="value">${escapeHtml(invoice.invoiceNumber)}</span></div>

            <div class="metaRow"><span class="label">Invoice Date:</span><span class="value"><span id="sb_print_date"></span></span></div>

            <div class="metaRow"><span class="label">Time:</span><span class="value"><span id="sb_print_time"></span></span></div>

            ${invoice.createdBy ? `<div class="metaRow"><span class="label">Created By:</span><span class="value">${escapeHtml(String(invoice.createdBy))}</span></div>` : ''}

            <div class="metaRow emphasis"><span class="label">Invoice Total:</span><span class="value">${formatAmount(invoice.amount)}</span></div>

          </div>

        </div>

      </div>



      <div class="fromTo">

        <div class="addrBox">

          <div class="head">From</div>

          <div class="line companyName">${escapeHtml(company.name || 'Your Company Name')}</div>

          ${(() => {
            const lines = companyAddressLines(company);
            return `${lines.line1 ? `<div class="line">${escapeHtml(lines.line1)}</div>` : ''}${lines.line2 ? `<div class="line">${escapeHtml(lines.line2)}</div>` : ''}`;
          })()}

          ${company.email ? `<div class="line">${escapeHtml(company.email)}</div>` : ''}

          ${company.website ? `<div class="line">${escapeHtml(company.website)}</div>` : ''}

          ${company.phone ? `<div class="line">${escapeHtml(company.phone)}</div>` : ''}

        </div>

        <div class="toCol addrBox">

          <div class="head">To</div>

          <div class="line customerName">${escapeHtml(customer.name || 'Client Name')}</div>

          ${(() => {
            const lines = customerAddressLines(customer);
            return `${lines.line1 ? `<div class="line">${escapeHtml(lines.line1)}</div>` : ''}${lines.line2 ? `<div class="line">${escapeHtml(lines.line2)}</div>` : ''}`;
          })()}

          ${customer.email ? `<div class="line">${escapeHtml(customer.email)}</div>` : ''}

          ${customer.phone ? `<div class="line">${escapeHtml(customer.phone)}</div>` : ''}

        </div>

      </div>



      <table>

        <thead>

          <tr>

            <th>Description</th>

            <th>Total</th>

          </tr>

        </thead>

        <tbody>

          ${

            rows ||

            `<tr><td style="padding:8px 10px;border:1px solid #d1d5db;">Payment</td><td style="padding:8px 10px;border:1px solid #d1d5db;text-align:right;">${formatAmount(invoice.amount)}</td></tr>`

          }

        </tbody>

      </table>



      <div class="bottom">

        <div class="notes">

          <div class="head">Notes</div>

          <div class="box">${notesHtml || '-'}</div>



          <div class="payment">

            <div class="left">

              <div>Payment received as:</div>

              <div class="checks">

                <label><input type="checkbox" ${paymentMethodStr === 'cash' ? 'checked' : ''}/> Cash</label>

                <label><input type="checkbox" ${(paymentMethodStr === 'check' || paymentMethodStr === 'cheque') ? 'checked' : ''}/> Cheque</label>

              </div>

            </div>

            <div style="display:flex;gap:10px;align-items:flex-end;">

              <div style="min-width:14px;">#</div>

              <div class="signLine">${paymentRefStr ? escapeHtml(paymentRefStr) : ''}</div>

            </div>

          </div>

        </div>



        <div class="totals">

          <div class="totalsRow"><div class="label">Total</div><div class="value">${formatAmount(invoice.amount)}</div></div>

          <div class="totalsRow"><div class="label">Deposit</div><div class="value">${formatAmount(depositAmount)}</div></div>

          <div class="balance">

            <div>Balance Due</div>

            <div class="balanceBox"><div class="curr">$</div><div class="amt">${formatAmount(balanceDueAmount)}</div></div>

          </div>

        </div>

      </div>



      <div class="footer">

        <div class="footerThanks">Thank you for your Business!</div>

        <div class="footerPowered">Powered by: <a href="https://sendbillnow.com" target="_blank" rel="noopener noreferrer">sendbillnow.com</a></div>

      </div>

    </div>

  </div>



<script>(function(){
  const setNow=function(){
    const d=new Date();
    const date=d.toLocaleDateString();
    const time=d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateEl=document.getElementById('sb_print_date');
    if(dateEl) dateEl.textContent=date;
    const timeEl=document.getElementById('sb_print_time');
    if(timeEl) timeEl.textContent=time;
    document.querySelectorAll('.sb_print_date_cell').forEach((el)=>{ el.textContent=date; });
  };
  window.onbeforeprint=setNow;
  window.onload=function(){ setNow(); window.print(); setTimeout(()=>window.close(),1000); };
})();</script>



</body></html>`;

}



function generateRentReceiptTemplate(



  invoice: InvoiceData,



  customer: CustomerData,



  company: CompanyData



): string {



  const rows = (invoice.items || [])

    .map(

      (item) => `

        <tr>

          <td style="padding:8px 10px;border:1px solid #d1d5db;">${escapeHtml(String(item.description || ''))}</td>

          <td style="padding:8px 10px;border:1px solid #d1d5db;text-align:right;">${formatAmount(item.total)}</td>

        </tr>

      `.trim()

    )

    .join('');



  const notesHtml = invoice.notes ? escapeHtml(String(invoice.notes)) : '';
  const discountType = (invoice as any).discount_type as 'percentage' | 'fixed' | undefined;
  const discountValue = Number((invoice as any).discount_value ?? 0) || 0;
  const discountAmount = Number((invoice as any).total_discount ?? (invoice as any).discountAmount ?? 0) || 0;
  const discountLabel = discountType === 'percentage' ? `${discountValue}%` : String((invoice as any).discountLabel ?? '').trim();



  const lateFeeAmount = Number(
    (invoice as any).lateFee ?? (invoice as any).late_fee ?? (invoice as any).late_fee_amount ?? 0
  ) || 0;



  const bouncedCheckFeeAmount = Number(
    (invoice as any).bouncedCheckFee ?? (invoice as any).bounced_check_fee ?? (invoice as any).bounced_check_fee_amount ?? 0
  ) || 0;



  const depositAmount = Number(
    (invoice as any).deposit ?? (invoice as any).depositAmount ?? (invoice as any).deposit_amount ?? 0
  ) || 0;



  const balanceDueAmount = Number(
    (invoice as any).balanceDue ?? (invoice as any).balance_due ?? (invoice as any).balance_due_amount ?? invoice.amount
  ) || 0;



  const footerLinksParts: string[] = [];

  if (company.facebook) footerLinksParts.push('Facebook');

  if (company.instagram) footerLinksParts.push('Instagram');

  if (company.twitter) footerLinksParts.push('X');

  if (company.linkedin) footerLinksParts.push('LinkedIn');

  if (company.youtube) footerLinksParts.push('YouTube');

  if (company.tiktok) footerLinksParts.push('TikTok');

  if (company.whatsapp) footerLinksParts.push(`WhatsApp: ${escapeHtml(company.whatsapp)}`);

  const footerLinksText = footerLinksParts.join(' | ');



  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Rent Receipt ${escapeHtml(invoice.invoiceNumber)}</title>

<style>

*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}

@page{margin:10mm;}

html,body{height:100%;}

body{font-family:Arial, sans-serif;background:linear-gradient(135deg,#ffffff 0%,#f6f9ff 55%,#ffffff 100%);color:#111;margin:0;}

.receipt{width:100%;max-width:100%;min-height:100vh;display:flex;flex-direction:column;background:transparent;position:relative;overflow:hidden;}

.bar{height:10px;background:${BLUE};}

.bar.bottom{}

.header{padding:18px 18px 10px 18px;display:flex;justify-content:space-between;align-items:flex-start;gap:18px;background:#f7f7f7;}

.shape{position:absolute;border-radius:999px;pointer-events:none;z-index:0;opacity:0.35;filter:blur(0px);}
.shape.s1{width:240px;height:240px;left:-90px;top:90px;background:radial-gradient(circle at 30% 30%,rgba(37,99,235,0.22),rgba(37,99,235,0));}
.shape.s2{width:200px;height:200px;right:-80px;top:160px;background:radial-gradient(circle at 30% 30%,rgba(16,185,129,0.18),rgba(16,185,129,0));}
.shape.s3{width:280px;height:280px;right:-110px;bottom:140px;background:radial-gradient(circle at 30% 30%,rgba(37,99,235,0.16),rgba(37,99,235,0));}

.companyLeft{display:flex;gap:14px;align-items:flex-start;}

.logo{width:70px;height:70px;border-radius:999px;background:#6b7280;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;overflow:hidden;flex:0 0 auto;}

.logo img{width:100%;height:100%;object-fit:cover;}

.companyText{font-size:11px;line-height:1.35;color:#374151;}

.companyText .name{font-weight:900;color:${BLUE};margin-bottom:2px;font-size:14px;}

.rightTitle{min-width:280px;text-align:right;}

.rightTitle .title{font-size:28px;font-weight:900;letter-spacing:0.4px;color:${BLUE};}

.rightMeta{margin-top:10px;display:inline-block;width:260px;}

.rightMetaRow{display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-top:1px solid #d1d5db;font-size:11px;color:#111;}

.rightMetaRow:last-child{border-bottom:1px solid #d1d5db;}

.rightMetaRow .label{text-transform:uppercase;font-weight:800;color:#1f2937;}



.content{padding:18px 18px 0 18px;flex:1;display:flex;flex-direction:column;position:relative;z-index:1;}

.billedTo{width:420px;}

.billedTo .head{font-size:11px;font-weight:900;color:#1f2937;text-transform:uppercase;margin-bottom:8px;}

.billedTo .line{font-size:11px;color:#111;margin:3px 0;}

.spacer{height:14px;}



table{width:100%;border-collapse:collapse;margin-top:14px;}

th{background:${BLUE} !important;color:#fff !important;text-align:left;font-size:11px;padding:8px 10px;border:1px solid ${BLUE};text-transform:uppercase;letter-spacing:0.3px;}

th:nth-child(2){text-align:right;width:160px;}

td{font-size:11px;}



.bottom{margin-top:14px;display:grid;grid-template-columns:1fr 320px;gap:20px;align-items:start;}

.notes{font-size:11px;color:#111;}

.notes .head{font-weight:900;margin-bottom:6px;color:#111;}

.notes .box{min-height:90px;white-space:pre-wrap;}

.totals{font-size:11px;color:#111;}

.totalsRow{display:flex;justify-content:space-between;gap:10px;padding:3px 0;}

.totalsRow .label{text-transform:uppercase;font-weight:800;color:#1f2937;}

.totalsRow .value{text-align:right;min-width:110px;}

.balance{margin-top:10px;display:flex;justify-content:space-between;align-items:center;gap:10px;font-weight:900;font-size:14px;color:#111;}

.balanceBox{flex:1;background:#dbeafe;border:1px solid #93c5fd;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;min-height:44px;}

.balanceBox .curr{font-weight:900;}

.balanceBox .amt{font-weight:900;color:#16a34a;}



.footer{padding:12px 18px 12px 18px;margin-top:auto;text-align:center;background:${BLUE};color:#fff;font-size:10px;}

.footer a{color:#fff !important;text-decoration:underline;}

.rightMetaRow.emphasis .label{color:${BLUE};font-weight:900;}
.rightMetaRow.emphasis div:last-child{color:#16a34a;font-weight:900;}

</style>

</head><body>

  <div class="receipt">

    <div class="shape s1"></div>

    <div class="shape s2"></div>

    <div class="shape s3"></div>

    <div class="bar"></div>



    <div class="header">

      <div class="companyLeft">

        <div class="logo">${company.logo ? `<img src="${company.logo}" alt="${escapeHtml(company.name || 'Company')}"/>` : 'LOGO'}</div>

        <div class="companyText">

          <div class="name">${escapeHtml(company.name || 'Your Company Name')}</div>

          ${(() => {
            const lines = companyAddressLines(company);
            return `${lines.line1 ? `<div>${escapeHtml(lines.line1)}</div>` : ''}${lines.line2 ? `<div>${escapeHtml(lines.line2)}</div>` : ''}`;
          })()}

          ${company.email ? `<div>${escapeHtml(String(company.email))}</div>` : ''}

          ${company.website ? `<div>${escapeHtml(String(company.website))}</div>` : ''}

          ${company.phone ? `<div>${escapeHtml(String(company.phone))}</div>` : ''}

        </div>

      </div>



      <div class="rightTitle">

        <div class="title">RENT RECEIPT</div>

        <div class="rightMeta">

          ${(() => {
            const raw = (invoice as any).accountNumber ?? (invoice as any).account_number ?? undefined;
            const s = raw === null || raw === undefined ? '' : String(raw).trim();
            return s ? `<div class="rightMetaRow"><div class="label">ACCOUNT #:</div><div>${escapeHtml(s)}</div></div>` : '';
          })()}

          <div class="rightMetaRow"><div class="label">INVOICE #:</div><div>${escapeHtml(invoice.invoiceNumber)}</div></div>

          <div class="rightMetaRow"><div class="label">INVOICE DATE:</div><div><span id="sb_print_date"></span></div></div>

          <div class="rightMetaRow"><div class="label">TIME:</div><div><span id="sb_print_time"></span></div></div>

          ${invoice.createdBy ? `<div class="rightMetaRow"><div class="label">CREATED BY:</div><div>${escapeHtml(String(invoice.createdBy))}</div></div>` : ''}

          <div class="rightMetaRow emphasis"><div class="label">INVOICE TOTAL:</div><div>${formatAmount(invoice.amount)}</div></div>

        </div>

      </div>

    </div>



    <div class="content">

      <div class="billedTo">

        <div class="head">BILLED TO</div>

        <div class="line"><strong>${escapeHtml(customer.name || 'Tenant Name')}</strong></div>

        ${(() => {
          const lines = customerAddressLines(customer);
          return `${lines.line1 ? `<div class="line">${escapeHtml(lines.line1)}</div>` : ''}${lines.line2 ? `<div class="line">${escapeHtml(lines.line2)}</div>` : ''}`;
        })()}

        ${customer.email ? `<div class="line">${escapeHtml(customer.email)}</div>` : ''}

        ${customer.phone ? `<div class="line">${escapeHtml(customer.phone)}</div>` : ''}

      </div>



      <div class="spacer"></div>



      <table>

        <thead>

          <tr>

            <th>Description</th>

            <th>Total</th>

          </tr>

        </thead>

        <tbody>

          ${

            rows ||

            `<tr><td style="padding:8px 10px;border:1px solid #d1d5db;">Rent Payment</td><td style="padding:8px 10px;border:1px solid #d1d5db;text-align:right;">${formatAmount(invoice.amount)}</td></tr>`

          }

        </tbody>

      </table>



      <div class="bottom">

        <div class="notes">

          <div class="head">Notes</div>

          <div class="box">${notesHtml || '-'}</div>

        </div>



        <div class="totals">

          <div class="totalsRow"><div class="label">SUBTOTAL</div><div class="value">${formatAmount(invoice.subtotal)}</div></div>

          <div class="totalsRow"><div class="label">DISCOUNT${discountLabel ? ` (${escapeHtml(discountLabel)})` : ''}</div><div class="value">${formatAmount(discountAmount)}</div></div>

          <div class="totalsRow"><div class="label">SUBTOTAL LESS DISCOUNT</div><div class="value">${formatAmount(Number(invoice.subtotal) - discountAmount)}</div></div>

          <div class="totalsRow"><div class="label">SALES TAX</div><div class="value">${formatAmount(invoice.tax)}</div></div>

          <div class="totalsRow"><div class="label">LATE FEE</div><div class="value">${formatAmount(lateFeeAmount)}</div></div>

          <div class="totalsRow"><div class="label">BOUNCED CHECK FEE</div><div class="value">${formatAmount(bouncedCheckFeeAmount)}</div></div>

          <div class="totalsRow"><div class="label">TOTAL</div><div class="value">${formatAmount(invoice.amount)}</div></div>

          <div class="totalsRow"><div class="label">DEPOSIT</div><div class="value">${formatAmount(depositAmount)}</div></div>



          <div class="balance">

            <div>Balance Due</div>

            <div class="balanceBox"><div class="curr">$</div><div class="amt">${formatAmount(balanceDueAmount)}</div></div>

          </div>

        </div>

      </div>



      <div class="footer">

        ${footerLinksText ? `<div style="margin-bottom:6px;">${footerLinksText}</div>` : ''}

        Powered by: <a href="https://sendbillnow.com" target="_blank" rel="noopener noreferrer">sendbillnow.com</a>

      </div>

    </div>



    <div class="bar bottom"></div>

  </div>



<script>(function(){
  const setNow=function(){
    const d=new Date();
    const date=d.toLocaleDateString();
    const time=d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateEl=document.getElementById('sb_print_date');
    if(dateEl) dateEl.textContent=date;
    const timeEl=document.getElementById('sb_print_time');
    if(timeEl) timeEl.textContent=time;
    document.querySelectorAll('.sb_print_date_cell').forEach((el)=>{ el.textContent=date; });
  };
  window.onbeforeprint=setNow;
  window.onload=function(){ setNow(); window.print(); setTimeout(()=>window.close(),1000); };
})();</script>



</body></html>`;

}



function generateBlueInvoiceTemplate(



  invoice: InvoiceData,



  customer: CustomerData,



  company: CompanyData



): string {



  const notesHtml = invoice.notes ? escapeHtml(String(invoice.notes)) : '';



  const discountAmount = Number((invoice as any).total_discount ?? (invoice as any).discountAmount ?? 0) || 0;

  const subtotalLessDiscount = Number(invoice.subtotal) - discountAmount;

  const taxRate = ((): number => {

    const base = subtotalLessDiscount;

    if (!base) return 0;

    return (Number(invoice.tax) / base) * 100;

  })();

  const shippingHandling = Number((invoice as any).shipping ?? (invoice as any).shippingHandling ?? 0) || 0;



  const rows = (invoice.items || [])

    .map(

      (item) => `

        <tr>

          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">${escapeHtml(String(item.description || ''))}</td>

          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${item.quantity}</td>

          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatAmount(item.price)}</td>

          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:700;color:${BLUE};">${formatAmount(item.total)}</td>

        </tr>

      `.trim()

    )

    .join('');



  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Invoice ${escapeHtml(invoice.invoiceNumber)}</title>

<style>

*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}

@page{margin:8mm;}

html,body{height:100%;}

body{font-family:Arial, sans-serif;background:linear-gradient(135deg,#ffffff 0%,#f6f9ff 55%,#ffffff 100%);color:#111;}



.doc{max-width:100%;margin:0 auto;min-height:100vh;display:flex;flex-direction:column;position:relative;overflow:hidden;}

.shape{position:absolute;border-radius:999px;pointer-events:none;z-index:0;opacity:0.35;filter:blur(0px);}
.shape.s1{width:260px;height:260px;left:-95px;top:120px;background:radial-gradient(circle at 30% 30%,rgba(37,99,235,0.22),rgba(37,99,235,0));}
.shape.s2{width:210px;height:210px;right:-85px;top:190px;background:radial-gradient(circle at 30% 30%,rgba(16,185,129,0.18),rgba(16,185,129,0));}
.shape.s3{width:320px;height:320px;right:-120px;bottom:160px;background:radial-gradient(circle at 30% 30%,rgba(37,99,235,0.16),rgba(37,99,235,0));}

.main{flex:1;display:flex;flex-direction:column;}



.top{display:flex;justify-content:space-between;align-items:flex-start;padding:22px 0 0 0;}

.companyBox{width:300px;background:transparent !important;color:#111 !important;padding:16px 16px;font-size:11px;line-height:1.35;text-align:center;border:2px solid ${BLUE};}

.companyBox .name{font-weight:900;font-size:14px;letter-spacing:0.4px;margin-bottom:6px;color:${BLUE};}

.logoBox{width:230px;height:120px;border:none;display:flex;align-items:center;justify-content:center;overflow:hidden;background:transparent;}

.logoBox img{max-width:100%;max-height:100%;object-fit:contain;}



.mid{display:grid;grid-template-columns:1fr 1fr 280px;gap:26px;margin-top:28px;font-size:12px;align-items:start;}

.blockTitle{font-weight:900;margin-bottom:6px;}

.line{margin:4px 0;}

.addrLine2{white-space:nowrap;}

.details{justify-self:end;text-align:right;padding-right:12px;}

.invoiceTitle{font-size:40px;font-weight:900;letter-spacing:0.6px;text-align:right;margin-bottom:10px;color:${BLUE};}

.details .line strong{display:inline-block;min-width:95px;}

.shipTo{padding-left:36px;}

.details .line.invoiceTotalLine strong{color:${BLUE};}

.details .line.invoiceTotalLine .invoiceTotalAmt{color:#16a34a;font-weight:900;}



.tableWrap{margin-top:38px;}

table{width:100%;border-collapse:collapse;}

th{background:${BLUE} !important;color:#fff !important;text-align:left;font-size:12px;padding:12px 14px;border:2px solid ${BLUE};text-transform:uppercase;letter-spacing:0.4px;}

th:nth-child(2){text-align:center;width:60px;}

th:nth-child(3){text-align:right;width:110px;}

th:nth-child(4){text-align:right;width:105px;}

td{font-size:12px;padding:12px 14px;border-left:1px solid ${BLUE};border-right:1px solid ${BLUE};}

tbody tr{border-bottom:1px solid ${BLUE};}



.bottom{display:grid;grid-template-columns:1.1fr 0.9fr;gap:34px;margin-top:22px;align-items:start;}

.notesBox{border:2px solid ${BLUE};min-height:90px;}

.notesHead{background:${BLUE} !important;color:#fff !important;font-weight:900;padding:12px 14px;font-size:12px;}

.notesBody{padding:12px 14px;font-size:12px;white-space:pre-wrap;min-height:80px;}



.totals{font-size:12px;padding-top:10px;}

.totalsRow{display:flex;justify-content:space-between;gap:12px;margin:10px 0;}

.totalsRow .value{min-width:140px;text-align:right;font-variant-numeric:tabular-nums;}

.grand{margin-top:14px;background:${BLUE} !important;color:#fff !important;border:2px solid ${BLUE};display:flex;justify-content:space-between;align-items:center;padding:10px 14px;font-weight:900;font-size:13px;}

.grand .value{min-width:140px;text-align:right;}



.thanks{margin:46px 0 0 0;text-align:center;font-weight:700;font-size:13px;}

.footer{margin-top:auto;text-align:center;background:${BLUE} !important;color:#fff !important;padding:14px 14px;}

.footer .thanksFooter{font-weight:700;font-size:12px;margin-bottom:6px;}

.footer .poweredFooter{font-size:10px;opacity:0.95;}

.footer a{color:#fff !important;text-decoration:underline;}

</style>

</head><body>

  <div class="doc">

    <div class="shape s1"></div>

    <div class="shape s2"></div>

    <div class="shape s3"></div>

    <div class="main">

      <div class="top">

        <div class="companyBox">

          <div class="name">${escapeHtml(company.name || 'COMPANY NAME')}</div>

          ${(() => {
            const lines = companyAddressLines(company);
            return `${lines.line1 ? `<div>${escapeHtml(lines.line1)}</div>` : ''}${lines.line2 ? `<div>${escapeHtml(lines.line2)}</div>` : ''}`;
          })()}

          ${(() => {

            const parts = [company.phone, company.email, company.website].filter(Boolean).map((v) => escapeHtml(String(v)));

            return parts.length ? `<div>${parts.join('<br/>')}</div>` : '';

          })()}

        </div>

        <div class="logoBox">

          ${company.logo ? `<img src="${company.logo}" alt="${escapeHtml(company.name || 'Company')}"/>` : `<div style="font-weight:900;">LOGO</div>`}

        </div>

      </div>



      <div class="mid">

        <div>

          <div class="blockTitle">Bill To:</div>

          <div class="line" style="font-weight:800;">${escapeHtml(customer.name || 'Customer')}</div>

          ${(() => {
            const lines = customerAddressLines(customer);
            return `${lines.line1 ? `<div class="line">${escapeHtml(lines.line1)}</div>` : ''}${lines.line2 ? `<div class="line addrLine2">${escapeHtml(lines.line2)}</div>` : ''}`;
          })()}

          ${customer.phone ? `<div class="line"><strong>Phone:</strong> ${escapeHtml(customer.phone)}</div>` : ''}

          ${customer.email ? `<div class="line"><strong>Email:</strong> ${escapeHtml(customer.email)}</div>` : ''}

        </div>

        <div class="shipTo">

          <div class="blockTitle">Ship To:</div>

          <div class="line" style="font-weight:800;">${escapeHtml(customer.name || 'Customer')}</div>

          ${(() => {
            const lines = customerAddressLines(customer);
            return `${lines.line1 ? `<div class="line">${escapeHtml(lines.line1)}</div>` : ''}${lines.line2 ? `<div class="line addrLine2">${escapeHtml(lines.line2)}</div>` : ''}`;
          })()}

          ${customer.phone ? `<div class="line"><strong>Phone:</strong> ${escapeHtml(customer.phone)}</div>` : ''}

        </div>

        <div class="details">

          <div class="invoiceTitle">INVOICE</div>

          ${(() => {
            const raw = (invoice as any).accountNumber ?? (invoice as any).account_number ?? undefined;
            const s = raw === null || raw === undefined ? '' : String(raw).trim();
            return s ? `<div class="line"><strong>Account #:</strong> ${escapeHtml(s)}</div>` : '';
          })()}

          <div class="line"><strong>Invoice #:</strong> ${escapeHtml(invoice.invoiceNumber)}</div>

          <div class="line"><strong>Time:</strong> <span id="sb_print_time"></span></div>

          <div class="line"><strong>Invoice Date:</strong> <span id="sb_print_date"></span></div>

          ${invoice.createdBy ? `<div class="line"><strong>Created By:</strong> ${escapeHtml(invoice.createdBy)}</div>` : ''}

          <div class="line invoiceTotalLine"><strong>Invoice Total:</strong> <span class="invoiceTotalAmt">${formatAmount(invoice.amount)}</span></div>

        </div>

      </div>



      <div class="tableWrap">

        <table>

          <thead>

            <tr>

              <th>Description</th>

              <th>QTY</th>

              <th>Unit Price</th>

              <th>Total</th>

            </tr>

          </thead>

          <tbody>

            ${

              rows ||

              `<tr><td style="padding:10px 12px;border-bottom:1px solid ${BLUE};">&nbsp;</td><td style="padding:10px 12px;border-bottom:1px solid ${BLUE};text-align:center;">&nbsp;</td><td style="padding:10px 12px;border-bottom:1px solid ${BLUE};text-align:right;">&nbsp;</td><td style="padding:10px 12px;border-bottom:1px solid ${BLUE};text-align:right;">&nbsp;</td></tr>`

            }

          </tbody>

        </table>

      </div>



      <div class="bottom">

        <div class="notesBox">

          <div class="notesHead">Additional Notes:</div>

          <div class="notesBody">${notesHtml || '-'}</div>

        </div>

        <div>

          <div class="totals">

            <div class="totalsRow"><span>Subtotal:</span><span class="value">${formatAmount(invoice.subtotal)}</span></div>

            <div class="totalsRow"><span>Discount:</span><span class="value">${formatAmount(discountAmount)}</span></div>

            <div class="totalsRow"><span>Subtotal (less Disc)</span><span class="value">${formatAmount(subtotalLessDiscount)}</span></div>

            <div class="totalsRow"><span>Tax Rate</span><span class="value">${taxRate.toFixed(2)}%</span></div>

            <div class="totalsRow"><span>Tax:</span><span class="value">${formatAmount(invoice.tax)}</span></div>

            <div class="totalsRow"><span>Total &amp; Tax</span><span class="value">${formatAmount(Number(invoice.amount))}</span></div>

            <div class="totalsRow"><span>Shipping Handling</span><span class="value">${formatAmount(shippingHandling)}</span></div>

          </div>

          <div class="grand"><span>Grand Total:</span><span class="value">${formatAmount(invoice.amount)}</span></div>

        </div>

      </div>



      

    </div>



    <div class="footer">

      <div class="thanksFooter">Thank you for your Business!</div>

      <div class="poweredFooter">Powered by: <a href="https://sendbillnow.com" target="_blank" rel="noopener noreferrer">sendbillnow.com</a></div>

    </div>

  </div>



<script>(function(){
  const setNow=function(){
    const d=new Date();
    const date=d.toLocaleDateString();
    const time=d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateEl=document.getElementById('sb_print_date');
    if(dateEl) dateEl.textContent=date;
    const timeEl=document.getElementById('sb_print_time');
    if(timeEl) timeEl.textContent=time;
    document.querySelectorAll('.sb_print_date_cell').forEach((el)=>{ el.textContent=date; });
  };
  window.onbeforeprint=setNow;
  window.onload=function(){ setNow(); window.print(); setTimeout(()=>window.close(),1000); };
})();</script>



</body></html>`;

}



function generateJobEstimateTemplate(



  invoice: InvoiceData,



  customer: CustomerData,



  company: CompanyData,



  options?: InvoicePrintOptions



): string {



  const terms = invoice.terms ? escapeHtml(String(invoice.terms)) : '';

  const notes = invoice.notes ? escapeHtml(String(invoice.notes)) : '';

  const discountAmount = Number((invoice as any).total_discount ?? (invoice as any).discountAmount ?? 0) || 0;



  const rows = (invoice.items || [])

    .map(

      (item) => `

        <tr>

          <td style="border:1px solid ${BLUE};padding:8px 10px;">${escapeHtml(String(item.description || ''))}</td>

          <td style="border:1px solid ${BLUE};padding:8px 10px;text-align:center;">${item.quantity}</td>

          <td style="border:1px solid ${BLUE};padding:8px 10px;text-align:right;">${formatAmount(item.price)}</td>

          <td style="border:1px solid ${BLUE};padding:8px 10px;text-align:right;">${formatAmount(item.total)}</td>

        </tr>

      `.trim()

    )

    .join('');



  const paymentTermsHtml = terms

    ? `<div style="white-space:pre-wrap;">${terms}</div>`

    : `

      <div>-20% Due Upon Contract Signing</div>

      <div>-40% Due at Product Midpoint (Date)</div>

      <div>-20% Due to Close to Completion (Date)</div>

      <div>-10% Upon Final Inspection and Approval</div>

    `.trim();



  const footerLinksParts: string[] = [];

  if (company.facebook) footerLinksParts.push('Facebook');

  if (company.instagram) footerLinksParts.push('Instagram');

  if (company.twitter) footerLinksParts.push('X');

  if (company.linkedin) footerLinksParts.push('LinkedIn');

  if (company.youtube) footerLinksParts.push('YouTube');

  if (company.tiktok) footerLinksParts.push('TikTok');

  if (company.whatsapp) footerLinksParts.push(`WhatsApp: ${escapeHtml(company.whatsapp)}`);

  const footerLinksText = footerLinksParts.join(' | ');



  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Job Estimate ${invoice.invoiceNumber}</title>

<style>

*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}

@page{margin:12mm;}

body{font-family:Arial, sans-serif;background:#fff;color:#000;}

.estimate{max-width:900px;margin:0 auto;min-height:100vh;padding:18px 10px 16px 10px;}

.top{display:flex;justify-content:space-between;align-items:flex-start;}

.title{font-size:34px;font-weight:900;letter-spacing:1px;color:${BLUE};}

.valid{font-size:16px;font-weight:900;letter-spacing:0.2px;color:${BLUE};margin-left:10px;}

.companyBox{border:2px solid ${BLUE};padding:10px;width:240px;font-size:11px;line-height:1.35;background-color:${BLUE} !important;color:#fff !important;}

.companyBox img{background:#fff;padding:4px;border-radius:4px;}

.addrLine2{white-space:nowrap;}

.line{border-top:2px solid ${BLUE};margin:14px 0;}

.grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;font-size:11px;}

.grid .label{font-weight:800;}

.items{margin-top:18px;}

table{width:100%;border-collapse:collapse;}

th{border:1px solid ${BLUE};padding:8px 10px;font-size:12px;text-align:left;background-color:${BLUE} !important;color:#fff !important;}

th:nth-child(2){width:80px;text-align:center;}

th:nth-child(3){width:120px;text-align:right;}

th:nth-child(4){width:140px;text-align:right;}

.below{display:grid;grid-template-columns:1.2fr 0.8fr;gap:16px;margin-top:18px;}

.box{border:2px solid ${BLUE};padding:10px;font-size:11px;min-height:120px;}

.box .head{font-weight:900;margin-bottom:6px;background-color:${BLUE} !important;color:#fff !important;padding:6px 8px;margin:-10px -10px 8px -10px;}

.totals{font-size:12px;}

.totals .row{display:flex;justify-content:space-between;margin:6px 0;}

.totals .grand{font-weight:900;border-top:2px solid ${BLUE};padding-top:8px;margin-top:8px;}

.termsBox{border:2px solid ${BLUE};padding:10px;font-size:11px;margin-top:16px;}

.termsHead{font-weight:900;background-color:${BLUE} !important;color:#fff !important;padding:6px 8px;margin:-10px -10px 8px -10px;}

.termsBody{white-space:pre-wrap;}

.sign{display:grid;grid-template-columns:1fr 1fr;gap:50px;margin-top:40px;font-size:12px;}

.sign .line{border-top:1px solid ${BLUE};margin:18px 0 6px 0;}

.footerBlue{margin-top:26px;background-color:${BLUE} !important;color:#fff !important;padding:16px 14px;text-align:center;}

.footerBlue .thanks{font-weight:700;font-size:12px;margin-bottom:8px;}

.footerBlue .links{font-size:10px;opacity:0.95;}

.footerBlue .divider{height:1px;background:rgba(255,255,255,0.35);margin:10px 0;}

.footerBlue .powered{font-size:10px;opacity:0.9;}

</style>

</head><body>

  <div class="estimate">

    <div class="top">

      <div>

        <div class="title">JOB ESTIMATE <span class="valid">(Valid for 30 days)</span></div>

        <div style="margin-top:10px;font-size:11px;line-height:1.5;display:grid;grid-template-columns:1fr 1fr;gap:10px;">

          <div>

            <div><span class="label">CUSTOMER:</span> ${escapeHtml(customer.name || '')}</div>

            ${customer.email ? `<div><span class="label">EMAIL:</span> ${escapeHtml(customer.email)}</div>` : ''}

            ${customer.phone ? `<div><span class="label">PHONE:</span> ${escapeHtml(customer.phone)}</div>` : ''}

          </div>

          <div>

            ${(() => { const a = parseAddress(customer.address); return `

            <div><span class="label">ADDRESS:</span> ${escapeHtml(a.street || '-')}</div>

            <div><span class="label">CITY:</span> ${escapeHtml(a.city || '-')}</div>

            <div><span class="label">STATE:</span> ${escapeHtml(a.state || '-')}</div>

            <div><span class="label">ZIP:</span> ${escapeHtml(a.zip || '-')}</div>

            `; })()}

          </div>

        </div>

      </div>

      <div class="companyBox">

        ${company.logo ? `<img src="${company.logo}" alt="${escapeHtml(company.name || 'Company')}" style="display:block;max-width:110px;max-height:60px;object-fit:contain;margin-bottom:8px;"/>` : `<div style="font-weight:900;">LOGO</div>`}

        <div style="margin-top:6px;">

          <div style="font-weight:800;">${escapeHtml(company.name || 'COMPANY NAME')}</div>

          ${(() => {
            const lines = companyAddressLines(company);
            return `${lines.line1 ? `<div>${escapeHtml(lines.line1)}</div>` : ''}${lines.line2 ? `<div class="addrLine2">${escapeHtml(lines.line2)}</div>` : ''}`;
          })()}

          ${company.phone ? `<div>${escapeHtml(company.phone)}</div>` : ''}

          ${company.email ? `<div>${escapeHtml(company.email)}</div>` : ''}

          ${company.website ? `<div>${escapeHtml(company.website)}</div>` : ''}

        </div>

      </div>

    </div>



    <div class="line"></div>



    <div class="grid">

      <div>

        <div><span class="label">ESTIMATE #:</span> ${escapeHtml(invoice.invoiceNumber)}</div>

        <div><span class="label">PO #:</span> </div>

      </div>

      <div>

        <div><span class="label">ESTIMATE DATE:</span> <span id="sb_print_date"></span></div>

        <div><span class="label">MATERIAL COST:</span> </div>

      </div>

      <div>

        <div><span class="label">CREATED BY:</span> ${escapeHtml(invoice.createdBy || '')}</div>

        <div><span class="label">ESTIMATED COST:</span> ${formatAmount(invoice.amount)}</div>

      </div>

    </div>



    <div class="items">

      <table>

        <thead>

          <tr>

            <th>Description</th>

            <th>Qty</th>

            <th>Price</th>

            <th>Amount</th>

          </tr>

        </thead>

        <tbody>

          ${rows || `<tr><td style="border:1px solid ${BLUE};padding:8px 10px;">&nbsp;</td><td style="border:1px solid ${BLUE};padding:8px 10px;">&nbsp;</td><td style="border:1px solid ${BLUE};padding:8px 10px;">&nbsp;</td><td style="border:1px solid ${BLUE};padding:8px 10px;">&nbsp;</td></tr>`}

        </tbody>

      </table>

    </div>



    <div class="below">

      <div class="box">

        <div class="head">Payment Terms:</div>

        ${paymentTermsHtml}

      </div>

      <div class="totals">

        <div class="row"><span>Subtotal:</span><span>${formatAmount(invoice.subtotal)}</span></div>

        <div class="row"><span>Discount:</span><span>${formatAmount(discountAmount)}</span></div>

        <div class="row"><span>Taxes:</span><span>${formatAmount(invoice.tax)}</span></div>

        <div class="row grand"><span>Grand Total:</span><span>${formatAmount(invoice.amount)}</span></div>

      </div>

    </div>



    <div class="termsBox">

      <div class="termsHead">Terms and Conditions:</div>

      <div class="termsBody">${notes || 'This project estimate is based on information and requirements provided by the client and is not guaranteed. Actual cost and terms may change once all project elements are discussed, negotiated and finalized.'}</div>

    </div>



    <div class="sign">

      <div>

        <div style="font-weight:800;">CLIENT</div>

        <div class="line"></div>

        <div>Name: ${escapeHtml(String(options?.jobEstimate?.clientName || ''))}</div>

        <div class="line"></div>

        <div>Signature: ${escapeHtml(String(options?.jobEstimate?.clientSignature || ''))}</div>

        <div class="line"></div>

        <div>Date: ${escapeHtml(String(options?.jobEstimate?.clientDate || ''))}</div>

      </div>

      <div>

        <div style="font-weight:800;">CONTRACTOR</div>

        <div class="line"></div>

        <div>Name: ${escapeHtml(String(options?.jobEstimate?.contractorName || ''))}</div>

        <div class="line"></div>

        <div>Signature: ${escapeHtml(String(options?.jobEstimate?.contractorSignature || ''))}</div>

        <div class="line"></div>

        <div>Date: ${escapeHtml(String(options?.jobEstimate?.contractorDate || ''))}</div>

      </div>

    </div>



    <div class="footerBlue">

      <div class="thanks">Thank you for your purchase.</div>

      ${footerLinksText ? `<div class="links">${footerLinksText}</div>` : ''}

      <div class="divider"></div>

      <div class="powered">Powered by: <a href="https://sendbillnow.com" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline;">sendbillnow.com</a></div>

    </div>

  </div>



<script>(function(){
  const setNow=function(){
    const d=new Date();
    const date=d.toLocaleDateString();
    const time=d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateEl=document.getElementById('sb_print_date');
    if(dateEl) dateEl.textContent=date;
    const timeEl=document.getElementById('sb_print_time');
    if(timeEl) timeEl.textContent=time;
    document.querySelectorAll('.sb_print_date_cell').forEach((el)=>{ el.textContent=date; });
  };
  window.onbeforeprint=setNow;
  window.onload=function(){ setNow(); window.print(); setTimeout(()=>window.close(),1000); };
})();</script>



</body></html>`;

}



function escapeHtml(input: string): string {



  return input



    .replace(/&/g, '&amp;')



    .replace(/</g, '&lt;')



    .replace(/>/g, '&gt;')



    .replace(/"/g, '&quot;')



    .replace(/'/g, '&#39;');



}







interface CustomerData {



  name: string;



  document?: string;



  phone?: string;



  email?: string;



  website?: string;



  address?: string;



  contactName?: string;



  contactPhone?: string;



  contactEmail?: string;



}







interface CompanyData {



  name: string;



  rnc?: string;



  phone?: string;



  email?: string;



  website?: string;



  address?: string;



  city?: string;



  state?: string;



  zip?: string;



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



function companyAddressLines(company: CompanyData): { line1: string; line2: string } {

  const hasStructuredParts = Boolean(company.city || company.state || company.zip);
  const parsed = !hasStructuredParts ? parseAddress(company.address) : { street: '', city: '', state: '', zip: '' };

  const street = String(company.address || parsed.street || '').trim();
  const city = String(company.city || (!hasStructuredParts ? parsed.city : '') || '').trim();
  const state = String(company.state || (!hasStructuredParts ? parsed.state : '') || '').trim();
  const zip = String(company.zip || (!hasStructuredParts ? parsed.zip : '') || '').trim();

  const tail = [state, zip].filter(Boolean).join(' ');
  const line2 = [city, tail].filter(Boolean).join(city && tail ? ', ' : '').trim();

  return { line1: street, line2 };
}



function customerAddressLines(customer: CustomerData): { line1: string; line2: string } {

  const raw = customer.address ? String(customer.address) : '';
  if (!raw) return { line1: '', line2: '' };

  const parsed = parseAddress(raw);
  const onlyStreet = Boolean(parsed.street) && !parsed.city && !parsed.state && !parsed.zip;
  const addr = onlyStreet && raw.includes(',')
    ? (() => {
        const parts = raw
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean);
        return {
          street: parts[0] || parsed.street || '',
          city: parts[1] || '',
          state: parts[2] || '',
          zip: parts[3] || '',
        };
      })()
    : parsed;

  const street = String(addr.street || '').trim();
  const city = String(addr.city || '').trim();
  const state = String(addr.state || '').trim();
  const zip = String(addr.zip || '').trim();

  const tail = [state, zip].filter(Boolean).join(' ');
  const line2 = [city, tail].filter(Boolean).join(city && tail ? ', ' : '').trim();

  return { line1: street, line2 };
}



function parseAddress(raw?: string): { street: string; city: string; state: string; zip: string } {

  const s = String(raw || '').replace(/\r\n/g, '\n');

  const lines = s.split('\n').map(l => l.trim()).filter(Boolean);

  const street = lines[0] || '';

  if (lines.length === 1 && street.includes(',')) {
    const parts = street
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    return {
      street: parts[0] || '',
      city: parts[1] || '',
      state: parts[2] || '',
      zip: parts[3] || '',
    };
  }

  const secondLine = lines.slice(1).join(' ').trim();

  const segs = secondLine.split(',').map(x => x.trim()).filter(Boolean);

  const city = segs[0] || '';

  const rest = segs.slice(1).join(' ').trim();

  const tokens = rest.split(/\s+/).filter(Boolean);

  const state = tokens[0] || '';

  const zip = tokens.slice(1).join(' ').trim();

  return { street, city, state, zip };

}



function customerBlockHtml(customer: CustomerData): string {

  const addr = customerAddressLines(customer);

  return `

    <div class="customer-section">

      <h3>CUSTOMER</h3>

      <div class="customer-grid">

        <div>

          <p><strong>Name:</strong> ${customer.name}</p>

          <p><strong>Email:</strong> ${customer.email || '-'}</p>

          ${customer.contactEmail ? `<p><strong>Contact Email:</strong> ${customer.contactEmail}</p>` : ''}

          <p><strong>Phone:</strong> ${customer.phone || '-'}</p>

          ${customer.contactPhone ? `<p><strong>Contact Phone:</strong> ${customer.contactPhone}</p>` : ''}

        </div>

        <div>

          <p><strong>Address:</strong> ${addr.line1 || '-'}</p>
          <p><strong>City/State/Zip:</strong> ${addr.line2 || '-'}</p>

        </div>

      </div>

    </div>`;

}







export function generateInvoiceHtml(



  invoice: InvoiceData,



  customer: CustomerData,



  company: CompanyData,



  templateType: InvoiceTemplateType,



  options?: InvoicePrintOptions



): string {



  const docTitle = templateType === 'quotation' ? 'ESTIMATED COST' : templateType === 'rent-receipt' ? 'RENT RECEIPT' : 'INVOICE';







  if (templateType === 'simple') {



    return generateSimpleTemplate(invoice, customer, company, docTitle);



  } else if (templateType === 'detailed') {



    return generateDetailedTemplate(invoice, customer, company, docTitle);



  } else if (templateType === 'classic') {



    return generateClassicInvoiceTemplate(invoice, customer, company);



  } else if (templateType === 'corporate') {



    return generateCorporateTemplate(invoice, customer, company, docTitle);



  } else if (templateType === 'job-estimate') {



    return generateJobEstimateTemplate(invoice, customer, company, options);



  } else if (templateType === 'rent-receipt') {



    return generateRentReceiptTemplate(invoice, customer, company);



  } else if (templateType === 'blue-invoice') {



    return generateBlueInvoiceTemplate(invoice, customer, company);



  } else if (templateType === 'cash-receipt') {



    return generateCashReceiptTemplate(invoice, customer, company);



  } else if (templateType === 'service-hours') {



    return generateServiceHoursInvoiceTemplate(invoice, customer, company);



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



  const notesHtml = invoice.notes ? escapeHtml(String(invoice.notes)) : '';



  const discountAmount = Number((invoice as any).total_discount ?? (invoice as any).discountAmount ?? 0) || 0;



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



.customer-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;}



.customer-grid p{font-size:12px;color:#333;margin:3px 0;}



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



.footer{padding:20px 28px;text-align:center;border-top:1px solid #eee;margin-top:auto;background:${BLUE};color:#fff;}



.footer p{font-size:13px;color:#fff;font-weight:600;margin-bottom:8px;}



.footer a{color:#fff!important;text-decoration:none!important;}



.footer span{color:#fff!important;}



.footer .powered{font-size:10px;color:#fff;border-top:1px solid rgba(255,255,255,0.3);padding-top:10px;margin-top:10px;}



@media print{body{background:#fff!important;padding:0!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important;}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important;}.invoice{width:100%!important;max-width:100%!important;box-shadow:none!important;border-radius:0!important;}th{background:${BLUE}!important;color:#fff!important;}.customer-section{background:${BLUE_LIGHT}!important;}.footer{margin-bottom:8mm!important;}}



</style></head><body>



<div class="invoice">



  <div class="header">



    <div class="logo-section">



      ${company.logo ? `<img src="${company.logo}" alt="${company.name}" style="max-width:80px;max-height:80px;object-fit:contain;margin-bottom:8px;border-radius:8px;"/>` : ''}



      <h1>${company.name}</h1>



      ${(() => {
        const lines = companyAddressLines(company);
        return `${lines.line1 ? `<p>${escapeHtml(lines.line1)}</p>` : ''}${lines.line2 ? `<p>${escapeHtml(lines.line2)}</p>` : ''}`;
      })()}



      ${company.phone ? `<p>${company.phone}</p>` : ''}



      ${company.email ? `<p>${company.email}</p>` : ''}

      ${company.website ? `<p>${company.website}</p>` : ''}



    </div>



    <div class="invoice-info">



      <h2>${docTitle}</h2>



      <p><strong>Invoice #:</strong> ${invoice.invoiceNumber}</p>



      <p><strong>Due Date:</strong> ${formatDate(invoice.dueDate)}</p>



      <p><strong>Created By:</strong> ${invoice.createdBy || ''}</p>



      ${company.rnc ? `<p><strong>RNC:</strong> ${company.rnc}</p>` : ''}



      <p style="margin-top:8px;font-size:14px;font-weight:700;"><strong>Total:</strong> <span style="color:${BLUE};font-weight:900;">${formatAmount(invoice.amount)}</span></p>



    </div>



  </div>



  ${customerBlockHtml(customer)}



  <table>



    <thead><tr><th>#</th><th>Description</th><th>Price</th><th>QTY</th><th>Amount</th></tr></thead>



    <tbody>${coloredRows}</tbody>



  </table>



  <div class="totals">



    <div class="notes"><h4>Additional Notes:</h4><div class="notes-box">${notesHtml || '-'}</div></div>



    <div class="summary">



      <div class="summary-row"><span>Subtotal:</span><span>${formatAmount(invoice.subtotal)}</span></div>



      <div class="summary-row"><span>Discount:</span><span>${formatAmount(discountAmount)}</span></div>



      <div class="summary-row"><span>Taxes:</span><span>${formatAmount(invoice.tax)}</span></div>



      <div class="summary-row total"><span>Grand Total:</span><span>${formatAmount(invoice.amount)}</span></div>



    </div>



  </div>



  <div class="footer">



    <p>Thank you for your purchase.</p>



    ${generateSocialLinksHtml(company)}



    <div class="powered">Powered by: <a href="https://sendbillnow.com" target="_blank" rel="noopener noreferrer">sendbillnow.com</a></div>



  </div>



</div>



<script>(function(){
  const setNow=function(){
    const d=new Date();
    const date=d.toLocaleDateString();
    const time=d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateEl=document.getElementById('sb_print_date');
    if(dateEl) dateEl.textContent=date;
    const timeEl=document.getElementById('sb_print_time');
    if(timeEl) timeEl.textContent=time;
    document.querySelectorAll('.sb_print_date_cell').forEach((el)=>{ el.textContent=date; });
  };
  window.onbeforeprint=setNow;
  window.onload=function(){ setNow(); window.print(); setTimeout(()=>window.close(),1000); };
})();</script>



</body></html>`;



}







function generateSocialLinksHtml(company: CompanyData): string {



  const links: string[] = [];



  if (company.facebook) links.push(`<a href="${company.facebook}" style="text-decoration:none;margin:0 6px;" target="_blank">Facebook</a>`);



  if (company.instagram) links.push(`<a href="${company.instagram}" style="text-decoration:none;margin:0 6px;" target="_blank">Instagram</a>`);



  if (company.twitter) links.push(`<a href="${company.twitter}" style="text-decoration:none;margin:0 6px;" target="_blank">X</a>`);



  if (company.linkedin) links.push(`<a href="${company.linkedin}" style="text-decoration:none;margin:0 6px;" target="_blank">LinkedIn</a>`);



  if (company.youtube) links.push(`<a href="${company.youtube}" style="text-decoration:none;margin:0 6px;" target="_blank">YouTube</a>`);



  if (company.tiktok) links.push(`<a href="${company.tiktok}" style="text-decoration:none;margin:0 6px;" target="_blank">TikTok</a>`);



  if (company.whatsapp) links.push(`<span style="font-weight:600;margin:0 6px;">WhatsApp: ${company.whatsapp}</span>`);



  



  if (links.length === 0) return '';



  return `<div style="margin:10px 0;font-size:11px;">${links.join(' | ')}</div>`;



}







function generateDetailedTemplate(



  invoice: InvoiceData,



  customer: CustomerData,



  company: CompanyData,



  docTitle: string



): string {



  const notesHtml = invoice.notes ? escapeHtml(String(invoice.notes)) : '';



  const discountAmount = Number((invoice as any).total_discount ?? (invoice as any).discountAmount ?? 0) || 0;



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



.footer{padding:10px 20px;text-align:center;border-top:1px solid #eee;margin-top:auto;background:${BLUE};color:#fff;}



.footer p{font-size:13px;color:#fff;font-weight:600;margin-bottom:8px;}



.footer a{color:#fff!important;text-decoration:none!important;}



.footer span{color:#fff!important;}



.footer .powered{font-size:10px;color:#fff;border-top:1px solid rgba(255,255,255,0.3);padding-top:10px;margin-top:10px;}



@media print{body{background:#fff!important;padding:0!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important;}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important;}.invoice{width:100%!important;max-width:100%!important;box-shadow:none!important;border-radius:0!important;}th{background:${BLUE}!important;color:#fff!important;}.customer-section{background:${BLUE_LIGHT}!important;}.footer{margin-bottom:8mm!important;}}



</style></head><body>



<div class="invoice">



  <div class="header">



    <div class="company-wrap">



      ${company.logo ? `<img src="${company.logo}" alt="${company.name}"/>` : ''}



      <div class="company-info">



        <h1>${company.name}</h1>



        ${(() => {
          const lines = companyAddressLines(company);
          return `${lines.line1 ? `<p>${escapeHtml(lines.line1)}</p>` : ''}${lines.line2 ? `<p>${escapeHtml(lines.line2)}</p>` : ''}`;
        })()}



        ${company.phone ? `<p>${company.phone}</p>` : ''}



        ${company.email ? `<p>${company.email}</p>` : ''}

        ${company.website ? `<p>${company.website}</p>` : ''}



      </div>



    </div>



    <div class="invoice-info">



      <h2>${docTitle}</h2>



      <p><strong>Invoice #:</strong> ${invoice.invoiceNumber}</p>



      <p><strong>Due Date:</strong> ${formatDate(invoice.dueDate)}</p>



      <p><strong>Created By:</strong> ${invoice.createdBy || ''}</p>



      ${company.rnc ? `<p><strong>RNC:</strong> ${company.rnc}</p>` : ''}



      <p style="margin-top:8px;font-size:13px;font-weight:700;"><strong>Total:</strong> <span style="color:${BLUE};font-weight:900;">${formatAmount(invoice.amount)}</span></p>



    </div>



  </div>



  ${customerBlockHtml(customer)}



  <table>



    <thead><tr><th>#</th><th>Description</th><th>Price</th><th>QTY</th><th>Amount</th></tr></thead>



    <tbody>${coloredRows}</tbody>



  </table>



  <div class="totals">



    <div class="notes"><h4>Additional Notes:</h4><div class="notes-box">${notesHtml || '-'}</div></div>



    <div class="summary">



      <div class="summary-row"><span>Subtotal:</span><span>${formatAmount(invoice.subtotal)}</span></div>



      <div class="summary-row"><span>Discount:</span><span>${formatAmount(discountAmount)}</span></div>



      <div class="summary-row"><span>Taxes:</span><span>${formatAmount(invoice.tax)}</span></div>



      <div class="summary-row total"><span>Grand Total:</span><span>${formatAmount(invoice.amount)}</span></div>



    </div>



  </div>



  <div class="footer">



    <p>Thank you for your purchase.</p>



    ${generateSocialLinksHtml(company)}



    <div class="powered">Powered by: <a href="https://sendbillnow.com" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline;">sendbillnow.com</a></div>



  </div>



</div>



<script>(function(){
  const setNow=function(){
    const d=new Date();
    const date=d.toLocaleDateString();
    const time=d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateEl=document.getElementById('sb_print_date');
    if(dateEl) dateEl.textContent=date;
    const timeEl=document.getElementById('sb_print_time');
    if(timeEl) timeEl.textContent=time;
    document.querySelectorAll('.sb_print_date_cell').forEach((el)=>{ el.textContent=date; });
  };
  window.onbeforeprint=setNow;
  window.onload=function(){ setNow(); window.print(); setTimeout(()=>window.close(),1000); };
})();</script>



</body></html>`;



}







function generateQuotationTemplate(



  invoice: InvoiceData,



  customer: CustomerData,



  company: CompanyData



): string {



  const notesHtml = invoice.notes ? escapeHtml(String(invoice.notes)) : '';



  const termsHtml = invoice.terms ? escapeHtml(String(invoice.terms)) : '';



  const discountAmount = Number((invoice as any).total_discount ?? (invoice as any).discountAmount ?? 0) || 0;



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



.meta-section{padding:18px 28px;background:${BLUE_LIGHT};border-bottom:3px solid ${BLUE};display:grid;grid-template-columns:repeat(4,1fr);gap:16px;}



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



.footer{padding:20px 28px;text-align:center;border-top:1px solid #eee;margin-top:auto;background:${BLUE};color:#fff;}



.footer p{font-size:13px;color:#fff;font-weight:600;margin-bottom:8px;}



.footer a{color:#fff!important;text-decoration:none!important;}



.footer span{color:#fff!important;}



.footer .powered{font-size:10px;color:#fff;border-top:1px solid rgba(255,255,255,0.3);padding-top:10px;margin-top:10px;}



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



      ${company.website ? `<p>${company.website}</p>` : ''}



    </div>



    <div class="quote-info">



      <h2>ESTIMATED COST</h2>



      <p><strong>Estimate #:</strong> ${invoice.invoiceNumber}</p>



      <p><strong>Estimate Date:</strong> <span id="sb_print_date"></span></p>



      <p><strong>Created By:</strong> ${invoice.createdBy || ''}</p>



      <p style="margin-top:8px;font-size:13px;font-weight:700;"><strong>Total:</strong> ${formatAmount(invoice.amount)}</p>



    </div>



  </div>



  <div class="meta-section">



    <p><strong>Customer:</strong><br/>${customer.name}<br/>${customer.document || '-'}</p>



    <p><strong>Email:</strong><br/>${customer.email || '-'}</p>



    <p><strong>Phone:</strong><br/>${customer.phone || '-'}</p>



    <p><strong>Address:</strong><br/>${customer.address || '-'}</p>



    <p><strong>Contact:</strong><br/>${customer.contactName || '-'}</p>



    <p><strong>Contact Email:</strong><br/>${customer.contactEmail || '-'}</p>



    <p><strong>Contact Phone:</strong><br/>${customer.contactPhone || '-'}</p>



  </div>



  <table>



    <thead><tr><th>QTY</th><th>DESCRIPTION</th><th>UNIT PRICE</th><th>AMOUNT</th></tr></thead>



    <tbody>${quoteRows}</tbody>



  </table>



  <div class="summary-bar">



    <div><span>SUBTOTAL:</span><strong>${formatAmount(invoice.subtotal)}</strong></div>



    <div><span>DISCOUNT:</span><strong>${formatAmount(discountAmount)}</strong></div>



    <div><span>SALES TAX:</span><strong>${formatAmount(invoice.tax)}</strong></div>



    <div class="total"><span>ESTIMATED COST:</span><strong>${formatAmount(invoice.amount)}</strong></div>



  </div>



  <div class="notes"><h4>NOTE:</h4><div class="notes-box">${notesHtml || '-'}</div></div>



  <div class="terms"><h4>GENERAL TERMS AND CONDITIONS:</h4><div class="terms-box">${termsHtml || '-'}</div></div>



  <div class="footer">



    <p>Thank you for your purchase.</p>



    ${generateSocialLinksHtml(company)}



    <div class="powered">Powered by: <a href="https://sendbillnow.com" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline;">sendbillnow.com</a></div>



  </div>



</div>



<script>(function(){
  const setNow=function(){
    const d=new Date();
    const date=d.toLocaleDateString();
    const time=d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateEl=document.getElementById('sb_print_date');
    if(dateEl) dateEl.textContent=date;
    const timeEl=document.getElementById('sb_print_time');
    if(timeEl) timeEl.textContent=time;
    document.querySelectorAll('.sb_print_date_cell').forEach((el)=>{ el.textContent=date; });
  };
  window.onbeforeprint=setNow;
  window.onload=function(){ setNow(); window.print(); setTimeout(()=>window.close(),1000); };
})();</script>



</body></html>`;



}







function generateCorporateTemplate(



  invoice: InvoiceData,



  customer: CustomerData,



  company: CompanyData,



  docTitle: string



): string {



  const notesHtml = invoice.notes ? escapeHtml(String(invoice.notes)) : '';



  const discountAmount = Number((invoice as any).total_discount ?? (invoice as any).discountAmount ?? 0) || 0;

  const subtotalLessDiscount = Number(invoice.subtotal) - discountAmount;



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



.footer{padding:20px 28px;text-align:center;border-top:1px solid #eee;margin-top:auto;background:${BLUE};color:#fff;}



.footer p{font-size:13px;color:#fff;font-weight:600;margin-bottom:8px;}



.footer a{color:#fff!important;text-decoration:none!important;}



.footer span{color:#fff!important;}



.footer .powered{font-size:10px;color:#fff;border-top:1px solid rgba(255,255,255,0.3);padding-top:10px;margin-top:10px;}



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



        ${company.website ? `<p>${company.website}</p>` : ''}



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



      <p><strong>Due Date:</strong> ${formatDate(invoice.dueDate)}</p>



      <p><strong>Created By:</strong> ${invoice.createdBy || ''}</p>



      <p style="margin-top:8px;font-size:13px;font-weight:700;"><strong>Total:</strong> <span style="color:${BLUE};font-weight:900;">${formatAmount(invoice.amount)}</span></p>



    </div>



  </div>



  <table>



    <thead><tr><th>Description of Services</th><th>QTY</th><th>Price</th><th>Amount</th></tr></thead>



    <tbody>${coloredRows}</tbody>



  </table>



  <div class="bottom-section">



    <div class="notes">



      <h4>Additional Notes:</h4>



      <div class="notes-box">${notesHtml || '-'}</div>



    </div>



    <div class="summary">



      <div class="summary-row"><span>Subtotal:</span><span>${formatAmount(invoice.subtotal)}</span></div>



      <div class="summary-row"><span>Discount:</span><span>${formatAmount(discountAmount)}</span></div>



      <div class="summary-row"><span>Subtotal Less Discount:</span><span>${formatAmount(subtotalLessDiscount)}</span></div>



      <div class="summary-row"><span>Tax Rate:</span><span>${subtotalLessDiscount > 0 ? ((invoice.tax / subtotalLessDiscount) * 100).toFixed(0) + '%' : '0%'}</span></div>



      <div class="summary-row"><span>Total & Tax:</span><span>${formatAmount(invoice.amount)}</span></div>



      <div class="summary-row"><span>Shipping:</span><span>$0.00</span></div>



      <div class="balance-due"><span>Balance Due:</span><span>${formatAmount(invoice.amount)}</span></div>



    </div>



  </div>



  <div class="footer">



    <p>Thank you for your purchase.</p>



    ${generateSocialLinksHtml(company)}



    <div class="powered">Powered by: <a href="https://sendbillnow.com" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline;">sendbillnow.com</a></div>



  </div>



</div>



<script>(function(){
  const setNow=function(){
    const d=new Date();
    const date=d.toLocaleDateString();
    const time=d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateEl=document.getElementById('sb_print_date');
    if(dateEl) dateEl.textContent=date;
    const timeEl=document.getElementById('sb_print_time');
    if(timeEl) timeEl.textContent=time;
    document.querySelectorAll('.sb_print_date_cell').forEach((el)=>{ el.textContent=date; });
  };
  window.onbeforeprint=setNow;
  window.onload=function(){ setNow(); window.print(); setTimeout(()=>window.close(),1000); };
})();</script>



</body></html>`;



}







export function printInvoice(



  invoice: InvoiceData,



  customer: CustomerData,



  company: CompanyData,



  templateType: InvoiceTemplateType,



  options?: InvoicePrintOptions



): void {



  const printWindow = window.open('', '_blank');



  if (!printWindow) {



    alert('Could not open print window');



    return;



  }



  const html = generateInvoiceHtml(invoice, customer, company, templateType, options);



  printWindow.document.write(html);



  printWindow.document.close();



}



