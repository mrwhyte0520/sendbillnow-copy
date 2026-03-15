import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jsPDF as JsPDFNamed } from 'jspdf';

import {
  getBaseUrl,
  getBearerToken,
  getSupabaseAdminClient,
  getSupabaseClient,
  insertEvent,
  normalizeTaxRate,
  round2,
  readJsonBody,
  requireUser,
  resolveTenantId,
} from './_shared.js';

const BLUE = '#001B9E';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const INVOICE_LOGO_PATH = path.join(__dirname, '..', '..', 'public', 'logo-invoice.png');

function inferImageType(pathOrUrl) {
  const raw = String(pathOrUrl || '').toLowerCase();
  if (raw.includes('.jpg') || raw.includes('.jpeg')) return { format: 'JPEG', mime: 'image/jpeg' };
  if (raw.includes('.webp')) return { format: 'WEBP', mime: 'image/webp' };
  return { format: 'PNG', mime: 'image/png' };
}

async function fetchBufferFromUrl(url) {
  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Could not fetch url (${resp.status}): ${text}`);
  }
  const ab = await resp.arrayBuffer();
  return Buffer.from(ab);
}

async function fetchSignatureBuffer({ admin, bucket, pathOrUrl }) {
  const raw = String(pathOrUrl || '').trim();
  if (!raw) return null;

  if (/^https?:\/\//i.test(raw)) {
    return await fetchBufferFromUrl(raw);
  }

  const dl = await admin.storage.from(bucket).download(raw);
  if (dl.error) throw new Error(dl.error.message || 'Could not download signature');
  if (!dl.data) return null;

  const ab = await dl.data.arrayBuffer();
  return Buffer.from(ab);
}

async function fetchPdfBuffer({ admin, bucket, path }) {
  const raw = String(path || '').trim();
  if (!raw) return null;
  const dl = await admin.storage.from(bucket).download(raw);
  if (dl.error) throw new Error(dl.error.message || 'Could not download PDF');
  if (!dl.data) return null;
  const ab = await dl.data.arrayBuffer();
  return Buffer.from(ab);
}

function loadInvoiceLogoBuffer() {
  try {
    if (!fs.existsSync(INVOICE_LOGO_PATH)) return null;
    return fs.readFileSync(INVOICE_LOGO_PATH);
  } catch {
    return null;
  }
}

function buildEmailHtml({ companyName, clientName, docType, docNumber, sealedPdfUrl }) {
  const safeCompany = String(companyName || 'Send Bill Now');
  const safeClient = String(clientName || 'Client');
  const safeDoc = String(docNumber || '').trim();
  const safeType = docType === 'JOB_ESTIMATE' ? 'Job Estimate' : 'Invoice';
  const title = safeDoc ? `${safeType} ${safeDoc}` : safeType;
  const safeUrl = sealedPdfUrl ? String(sealedPdfUrl) : '';

  return `
  <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;">
    <div style="background:linear-gradient(135deg,#008000,#006600);padding:18px 20px;">
      <div style="color:#fff;font-size:18px;font-weight:700;">${safeCompany}</div>
      <div style="color:rgba(255,255,255,0.85);font-size:13px;margin-top:4px;">${title}</div>
    </div>
    <div style="border:1px solid #e6e6e6;border-top:none;padding:20px;">
      <p style="margin:0 0 12px;color:#111;font-size:14px;">Hi ${safeClient},</p>
      <p style="margin:0 0 12px;color:#333;font-size:14px;">Your agreement has been confirmed and sealed.</p>
      <p style="margin:0 0 12px;color:#333;font-size:14px;">The sealed PDF is attached to this email.</p>
      ${safeUrl ? `
      <div style="margin:18px 0;">
        <a href="${safeUrl}" style="display:inline-block;background:#008000;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700;">Download Sealed PDF</a>
      </div>
      <p style="margin:16px 0 0;color:#666;font-size:12px;">If the button does not work, open this link:</p>
      <p style="margin:6px 0 0;color:#006600;font-size:12px;word-break:break-all;">${safeUrl}</p>
      ` : ''}
    </div>
  </div>`;
}

function safeMoney(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return '0.00';
  const fixed = num.toFixed(2);
  const [intPart, fracPart] = fixed.split('.');
  const sign = intPart.startsWith('-') ? '-' : '';
  const digits = sign ? intPart.slice(1) : intPart;
  const withCommas = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${withCommas}.${fracPart || '00'}`;
}

function currencyPrefix(code) {
  return '$';
}

function moneyWithCurrency(n, currency) {
  return `${currencyPrefix(currency)}${safeMoney(n)}`;
}

function normalizeMoney(n) {
  const num = Number(n);
  return Number.isFinite(num) ? num : 0;
}

function safeText(input) {
  return String(input ?? '').replace(/\s+/g, ' ').trim();
}

function parseTimestampUtc(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  const hasTz = /([zZ]|[+-]\d{2}:?\d{2})$/.test(s);
  const looksIsoNoTz = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/.test(s);

  const d = new Date(hasTz ? s : looksIsoNoTz ? `${s}Z` : s);
  return Number.isFinite(d.getTime()) ? d : null;
}

function formatDateOnlyUtcMinus4(raw) {
  const d = parseTimestampUtc(raw);
  if (!d) return '';
  const shifted = new Date(d.getTime() - 4 * 60 * 60 * 1000);
  const mm = String(shifted.getUTCMonth() + 1);
  const dd = String(shifted.getUTCDate());
  const yyyy = String(shifted.getUTCFullYear());
  return `${mm}/${dd}/${yyyy}`;
}

function formatSignedAt(raw) {
  if (!raw) return '';
  const d = parseTimestampUtc(raw);
  if (!d) return '';

  // Always format as Dominican Republic time (UTC-4, no DST).
  // We avoid Intl timezone formatting because some production runtimes ignore
  // the `timeZone` option without throwing, causing UTC timestamps (+4h).
  const shifted = new Date(d.getTime() - 4 * 60 * 60 * 1000);
  const mm = String(shifted.getUTCMonth() + 1);
  const dd = String(shifted.getUTCDate());
  const yyyy = String(shifted.getUTCFullYear());

  let hh = shifted.getUTCHours();
  const min = String(shifted.getUTCMinutes()).padStart(2, '0');
  const sec = String(shifted.getUTCSeconds()).padStart(2, '0');
  const ampm = hh >= 12 ? 'PM' : 'AM';
  hh = hh % 12;
  if (hh === 0) hh = 12;

  return `${mm}/${dd}/${yyyy}, ${hh}:${min}:${sec} ${ampm}`;
}

function splitText(pdf, text, maxWidth) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  try {
    return pdf.splitTextToSize(raw, maxWidth);
  } catch {
    return [raw];
  }
}

function truncateToWidth(pdf, raw, maxWidth) {
  const s = safeText(raw);
  if (!s) return '';
  if (!Number.isFinite(maxWidth) || maxWidth <= 0) return '';
  if (pdf.getTextWidth(s) <= maxWidth) return s;
  const ellipsis = '…';
  let out = s;
  while (out.length > 1 && pdf.getTextWidth(`${out}${ellipsis}`) > maxWidth) {
    out = out.slice(0, -1);
  }
  return out.length ? `${out}${ellipsis}` : '';
}

function isValidEmail(input) {
  const email = String(input || '').trim();
  if (!email) return false;
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailPattern.test(email);
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
    if (!supabase) return res.status(500).json({ ok: false, error: 'Server misconfiguration' });

    const admin = getSupabaseAdminClient();

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

    const forceRegenerate = Boolean(body.forceRegenerate || body.force_regenerate);
    const requestUrl = String(req.url || '').toLowerCase();
    const previewHeader = String(req.headers['x-preview-pdf'] || '').trim().toLowerCase();
    const previewOnly = Boolean(
      body.previewOnly ||
      body.preview_only ||
      previewHeader === '1' ||
      previewHeader === 'true' ||
      requestUrl.includes('/preview') ||
      requestUrl.includes('preview=1') ||
      requestUrl.includes('preview=true')
    );

    // Pre-formatted dates from UI (so PDF matches exactly what user sees)
    const formattedClientSignedAt = String(body.formattedClientSignedAt || '').trim();
    const formattedContractorSignedAt = String(body.formattedContractorSignedAt || '').trim();

    const { data: doc, error: docError } = await supabase
      .from('service_documents')
      .select(
        'id, user_id, doc_type, status, doc_number, currency, account_number, valid_for_days, company_name, company_rnc, company_phone, company_email, company_address, company_logo, client_name, client_email, client_phone, client_address, terms_snapshot, tax_rate, subtotal, tax, total, material_cost, client_signed_at, contractor_signed_at, sealed_at, sealed_pdf_path, sealed_email_sent_at, voided_at, expired_at, created_at'
      )
      .eq('id', documentId)
      .eq('user_id', tenantId)
      .maybeSingle();

  if (docError) return res.status(500).json({ ok: false, error: docError.message || 'Could not read document' });
  if (!doc?.id) return res.status(404).json({ ok: false, error: 'Document not found' });

  if (doc.voided_at || doc.status === 'Voided') {
    return res.status(400).json({ ok: false, error: 'Document is voided' });
  }
  if (doc.expired_at || doc.status === 'Expired') {
    return res.status(400).json({ ok: false, error: 'Document is expired' });
  }

  const { data: signature, error: sigError } = await supabase
    .from('service_document_signatures')
    .select('client_name, client_signature_image, client_signed_at, contractor_name, contractor_signature_image, contractor_signed_at')
    .eq('document_id', documentId)
    .eq('user_id', tenantId)
    .limit(1)
    .maybeSingle();

  if (sigError) return res.status(500).json({ ok: false, error: sigError.message || 'Could not read signatures' });

  const clientSig = String(signature?.client_signature_image || '').trim();
  const contractorSig = String(signature?.contractor_signature_image || '').trim();

  const status = String(doc.status || '');

  // Load current company info (so city/state/zip can be used even for older documents)
  const { data: companyInfoRow } = await supabase
    .from('company_info')
    .select('address, city, state, zip, website')
    .eq('user_id', tenantId)
    .limit(1)
    .maybeSingle();

  const liveStreet = String(companyInfoRow?.address || '').trim();
  const liveCity = String(companyInfoRow?.city || '').trim();
  const liveState = String(companyInfoRow?.state || '').trim();
  const liveZip = String(companyInfoRow?.zip || '').trim();
  const liveWebsite = String(companyInfoRow?.website || '').trim();
  const hasLiveParts = Boolean(liveStreet || liveCity || liveState || liveZip);
  const liveSecondLine = [
    liveCity,
    [liveState, liveZip].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(liveCity ? ', ' : '');
  const companyAddressForPdf = hasLiveParts
    ? [liveStreet, liveSecondLine].filter(Boolean).join('\n')
    : String(doc.company_address || '').trim();

  const pdfBucket = 'service-documents-pdf';
  const defaultPdfPath = `${tenantId}/${documentId}/sealed.pdf`;
  const currentPdfPath = String(doc.sealed_pdf_path || '').trim() || defaultPdfPath;

  const nowIso = new Date().toISOString();

  // If already sealed and we have a PDF, don't regenerate it (unless explicitly requested).
  if (!previewOnly && doc.sealed_at && currentPdfPath && !forceRegenerate) {
    const signedPdf = await admin.storage.from(pdfBucket).createSignedUrl(currentPdfPath, 7 * 24 * 60 * 60).catch(() => null);
    const sealedPdfUrl = signedPdf?.data?.signedUrl ? String(signedPdf.data.signedUrl) : null;

    // Email may not have been sent if previous attempt failed.
    const clientEmail = String(doc.client_email || '').trim();
    if (!doc.sealed_email_sent_at && isValidEmail(clientEmail)) {
      const claimIso = new Date().toISOString();
      const { data: claim } = await supabase
        .from('service_documents')
        .update({ sealed_email_sent_at: claimIso })
        .eq('id', documentId)
        .eq('user_id', tenantId)
        .is('sealed_email_sent_at', null)
        .select('id')
        .maybeSingle();

      if (claim?.id) {
        try {
          const baseUrl = getBaseUrl(req);
          const pdfBuf = await fetchPdfBuffer({ admin, bucket: pdfBucket, path: currentPdfPath });
          if (!pdfBuf?.length) throw new Error('Missing sealed PDF');

          const html = buildEmailHtml({
            companyName: doc.company_name,
            clientName: doc.client_name,
            docType: doc.doc_type,
            docNumber: doc.doc_number,
            sealedPdfUrl: sealedPdfUrl,
          });

          const subject = `Agreement Confirmed${doc.doc_number ? ` - ${doc.doc_number}` : ''}`;

          const resp = await fetch(`${baseUrl}/api/send-receipt-email`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              to: clientEmail,
              customerName: doc.client_name,
              companyName: doc.company_name,
              templateType: 'service-document-sealed',
              subject,
              html,
              attachment: {
                filename: `${doc.doc_number || 'service-document'}-sealed.pdf`,
                content: pdfBuf.toString('base64'),
                content_type: 'application/pdf',
              },
              sale: {
                date: new Date().toLocaleDateString(),
                time: new Date().toLocaleTimeString(),
                subtotal: doc.subtotal ?? 0,
                tax: doc.tax ?? 0,
                total: doc.total ?? 0,
                items: [],
              },
            }),
          });

          if (!resp.ok) {
            const text = await resp.text().catch(() => '');
            throw new Error(text || 'Email send failed');
          }

          const businessEmail = String(doc.company_email || '').trim();
          if (businessEmail && businessEmail !== clientEmail && isValidEmail(businessEmail)) {
            try {
              await fetch(`${baseUrl}/api/send-receipt-email`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  to: businessEmail,
                  customerName: doc.client_name,
                  companyName: doc.company_name,
                  templateType: 'service-document-sealed',
                  subject,
                  html,
                  attachment: {
                    filename: `${doc.doc_number || 'service-document'}-sealed.pdf`,
                    content: pdfBuf.toString('base64'),
                    content_type: 'application/pdf',
                  },
                  sale: {
                    date: new Date().toLocaleDateString(),
                    time: new Date().toLocaleTimeString(),
                    subtotal: doc.subtotal ?? 0,
                    tax: doc.tax ?? 0,
                    total: doc.total ?? 0,
                    items: [],
                  },
                }),
              });
            } catch (e) {
              console.error('Business copy email failed', e);
            }
          }
        } catch (e) {
          await supabase
            .from('service_documents')
            .update({ sealed_email_sent_at: null })
            .eq('id', documentId)
            .eq('user_id', tenantId)
            .eq('sealed_email_sent_at', claimIso);
          return res.status(502).json({ ok: false, error: e?.message || 'Email send failed' });
        }
      }
    }

    return res.status(200).json({
      ok: true,
      already_sealed: true,
      sealed_pdf_url: sealedPdfUrl,
      sealed_pdf_path: currentPdfPath,
    });
  }

  if (!previewOnly && !clientSig && !contractorSig) {
    return res.status(400).json({ ok: false, error: 'Add at least one signature or use preview mode' });
  }

  if (!previewOnly && (!clientSig || !contractorSig)) {
    return res.status(400).json({ ok: false, error: 'Both client and contractor signatures are required' });
  }

  if (!previewOnly && (!doc.client_signed_at || !doc.contractor_signed_at)) {
    return res.status(400).json({ ok: false, error: 'Document must be signed by both parties before sealing' });
  }

  if (!previewOnly && !doc.sealed_at && status !== 'ContractorSigned') {
    return res.status(400).json({ ok: false, error: 'Document cannot be sealed in current status' });
  }

  if (!previewOnly && !admin) {
    return res.status(500).json({ ok: false, error: 'Server misconfiguration' });
  }

  const clientBuf = previewOnly || !clientSig
    ? null
    : await fetchSignatureBuffer({ admin, bucket: 'service-doc-signatures', pathOrUrl: clientSig });
  const contractorBuf = previewOnly || !contractorSig
    ? null
    : await fetchSignatureBuffer({ admin, bucket: 'service-doc-signatures', pathOrUrl: contractorSig });

  const jsPDF = typeof JsPDFNamed === 'function' ? JsPDFNamed : null;
  if (!jsPDF) {
    throw new Error('PDF engine not available (jsPDF)');
  }

  const pdf = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const marginX = 40;
  const contentW = pageWidth - marginX * 2;

  const docLabel = doc.doc_type === 'JOB_ESTIMATE' ? 'JOB ESTIMATE' : 'INVOICE';
  const docNumber = safeText(doc.doc_number);
  const estimateNo = docNumber || String(documentId).slice(0, 8);

  // Title
  pdf.setTextColor(0, 27, 158);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(30);
  pdf.text(docLabel, marginX, 56);

  // Company box width (defined early so customer text can respect it)
  const companyBoxW = 170;

  // Parse address into components
  const rawAddr = String(doc.client_address || '').replace(/\r\n/g, '\n');
  const addrLines = rawAddr.split('\n').map(l => l.trim()).filter(Boolean);
  const addrStreet = addrLines[0] || '';
  const addrSecond = addrLines.slice(1).join(' ').trim();
  const addrSegs = addrSecond.split(',').map(x => x.trim()).filter(Boolean);
  const addrCity = addrSegs[0] || '';
  const addrRest = addrSegs.slice(1).join(' ').trim();
  const addrTokens = addrRest.split(/\s+/).filter(Boolean);
  const zipStartIdx = addrTokens.findIndex((t) => /\d/.test(t));
  const addrState = (zipStartIdx === -1 ? addrTokens : addrTokens.slice(0, zipStartIdx)).join(' ').trim();
  const addrZip = (zipStartIdx === -1 ? '' : addrTokens.slice(zipStartIdx).join(' ')).trim();

  // Customer block (left column: Name/Email/Phone, right column: Address)
  const customerColsW = pageWidth - marginX - companyBoxW - marginX - 20;
  const customerColGap = 18;
  const leftColW = customerColsW * 0.43;
  const maxCustTextW = customerColsW - leftColW - customerColGap; // right column width
  const customerY = 78;
  const leftX = marginX;
  const rightX = marginX + leftColW + customerColGap;

  // Left column: Name, Address, Phone, Email
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(0, 0, 0);
  pdf.text('CUSTOMER:', leftX, customerY);
  pdf.setFont('helvetica', 'bold');
  pdf.text(safeText(doc.client_name).substring(0, 40), leftX + 66, customerY);

  pdf.setFontSize(9);
  let customerInfoY = customerY + 14;

  // Address (2 lines)
  pdf.setFont('helvetica', 'bold');
  pdf.text('ADDRESS:', leftX, customerInfoY);
  pdf.setFont('helvetica', 'normal');
  const addrValueXLeft = leftX + 50;
  const addrLeftMaxW = leftColW - (addrValueXLeft - leftX) - 6;
  pdf.text(truncateToWidth(pdf, addrStreet || '-', addrLeftMaxW), addrValueXLeft, customerInfoY);
  customerInfoY += 12;

  const addrTail = [addrState, addrZip].filter(Boolean).join(' ').trim();
  const addrLine2 = [addrCity, addrTail].filter(Boolean).join(addrCity && addrTail ? ', ' : '');
  pdf.text(truncateToWidth(pdf, addrLine2 || '-', leftColW - 6), leftX, customerInfoY);
  customerInfoY += 12;

  if (doc.client_phone) {
    pdf.setFont('helvetica', 'bold');
    pdf.text('PHONE:', leftX, customerInfoY);
    pdf.setFont('helvetica', 'normal');
    pdf.text(safeText(doc.client_phone).substring(0, 35), leftX + 36, customerInfoY);
    customerInfoY += 12;
  }

  if (doc.client_email) {
    pdf.setFont('helvetica', 'bold');
    pdf.text('EMAIL:', leftX, customerInfoY);
    pdf.setFont('helvetica', 'normal');
    pdf.text(safeText(doc.client_email).substring(0, 35), leftX + 32, customerInfoY);
    customerInfoY += 12;
  }

  // Right column: validity block
  const validityX = rightX + 24;
  let rightY = customerInfoY + 12;
  if (doc.doc_type === 'JOB_ESTIMATE') {
    const validDays = (() => {
      const n = Number(doc.valid_for_days ?? 30);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 30;
    })();

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.setTextColor(22, 163, 74);
    const validLineY = rightY;
    const expiresLineY = validLineY + 15;
    pdf.text(`(Valid for ${validDays} days)`, validityX, validLineY);

    const startRaw = doc?.created_at || null;
    const endDate = (() => {
      const d = parseTimestampUtc(startRaw);
      if (!d) return '';
      const plus = new Date(d.getTime() + validDays * 24 * 60 * 60 * 1000);
      return formatDateOnlyUtcMinus4(plus.toISOString());
    })();

    pdf.setFontSize(9);
    pdf.setTextColor(0, 0, 0);
    pdf.setFont('helvetica', 'bold');
    const expiresLabelX = validityX + 16;
    const dateColonX = expiresLabelX + 27;
    pdf.text('EXPIRES ON', dateColonX, expiresLineY, { align: 'right' });
    pdf.text(':', dateColonX + 2, expiresLineY);
    pdf.setFont('helvetica', 'normal');
    pdf.text(endDate || '-', expiresLabelX + 33, expiresLineY);
    rightY = expiresLineY + 8;
  }

  pdf.setTextColor(0, 0, 0);
  customerInfoY = Math.max(customerInfoY, rightY);

  // Company box (right)
  const companyBoxX = pageWidth - marginX - companyBoxW;
  const companyBoxY = 34;

  // Compute box height dynamically
  const invoiceLogoBuffer = loadInvoiceLogoBuffer();
  const logo = invoiceLogoBuffer;
  const hasLogo = Boolean(logo);
  const logoWidth = 74;
  const logoHeight = 58;

  // Company address formatting (street on one line, city/state/zip on the next)
  const rawCompanyAddr = String(companyAddressForPdf || '').replace(/\r\n/g, '\n');
  const companyAddrLines = rawCompanyAddr.split('\n').map((l) => l.trim()).filter(Boolean);
  const companyStreet = companyAddrLines[0] || '';
  const companySecondLine = companyAddrLines.slice(1).join(' ').trim();
  const companySegs = companySecondLine.split(',').map((x) => x.trim()).filter(Boolean);
  const companyCity = companySegs[0] || '';
  const companyRest = companySegs.slice(1).join(' ').trim();
  const companyTokens = companyRest.split(/\s+/).filter(Boolean);
  const companyState = companyTokens[0] || '';
  const companyZip = companyTokens.slice(1).join(' ').trim();

  const companyAddrLine1 = companyStreet;
  const companyTail = [companyState, companyZip].filter(Boolean).join(' ');
  const companyAddrLine2 = [companyCity, companyTail].filter(Boolean).join(companyCity && companyTail ? ', ' : '');

  const companyWebsiteForPdf = String(doc.company_website || '').trim() || liveWebsite;

  const companyLines = [
    safeText(doc.company_name || 'COMPANY'),
    companyAddrLine1 ? safeText(companyAddrLine1) : '',
    companyAddrLine2 ? safeText(companyAddrLine2) : '',
    doc.company_phone ? safeText(doc.company_phone) : '',
    doc.company_email ? safeText(doc.company_email) : '',
    companyWebsiteForPdf ? safeText(companyWebsiteForPdf) : '',
  ].filter(Boolean);
  const companyBoxH = (hasLogo ? logoHeight + 10 : 0) + companyLines.length * 12 + 16;

  pdf.setFillColor(255, 255, 255);
  pdf.rect(companyBoxX, companyBoxY, companyBoxW, companyBoxH, 'F');

  const centerX = companyBoxX + companyBoxW / 2;
  let companyTextY = customerY + 2;

  if (hasLogo) {
    try {
      const logoX = companyBoxX + companyBoxW - logoWidth - 48;
      const logoY = companyBoxY - 10;
      pdf.addImage(logo, 'PNG', logoX, logoY, logoWidth, logoHeight);
    } catch {
      companyTextY = customerY + 2;
    }
  }

  pdf.setTextColor(0, 0, 0);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13);
  pdf.setTextColor(0, 27, 158);
  pdf.text(companyLines[0], centerX, companyTextY, { align: 'center' });
  pdf.setTextColor(0, 0, 0);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  let cY = companyTextY + 12;
  for (let ci = 1; ci < companyLines.length; ci++) {
    pdf.text(companyLines[ci], centerX, cY, { align: 'center' });
    cY += 10;
  }

  // Divider line — positioned below both customer info and company box
  const companyBoxBottom = companyBoxY + companyBoxH;
  const dividerY = Math.max(customerInfoY + 10, companyBoxBottom + 10);
  pdf.setDrawColor(0, 27, 158);
  pdf.setLineWidth(2);
  pdf.line(marginX, dividerY, pageWidth - marginX, dividerY);

  // Info grid
  const infoY = dividerY + 18;
  pdf.setTextColor(0, 0, 0);
  pdf.setFontSize(10);
  const colW = contentW / 3;
  const dateStr = doc?.created_at ? formatDateOnlyUtcMinus4(doc.created_at) : formatDateOnlyUtcMinus4(new Date().toISOString());
  pdf.setFont('helvetica', 'bold');
  const pad = 6;
  const l1a = 'ESTIMATE #:';
  const l1b = 'ESTIMATE DATE:';
  const l1c = 'CREATED BY:';
  pdf.text(l1a, marginX, infoY);
  pdf.text(l1b, marginX + colW, infoY);
  pdf.text(l1c, marginX + colW * 2, infoY);
  const createdBy = safeText(signature?.contractor_name || '').slice(0, 26);
  pdf.setFont('helvetica', 'normal');
  pdf.text(estimateNo, marginX + pdf.getTextWidth(l1a) + pad, infoY);
  pdf.text(dateStr, marginX + colW + pdf.getTextWidth(l1b) + pad, infoY);
  pdf.text(createdBy, marginX + colW * 2 + pdf.getTextWidth(l1c) + pad, infoY);

  const infoY2 = infoY + 16;
  pdf.setFont('helvetica', 'bold');
  const l2a = 'Account #:';
  const l2b = 'MATERIAL COST:';
  const l2c = 'ESTIMATED COST:';
  pdf.text(l2a, marginX, infoY2);
  pdf.text(l2b, marginX + colW, infoY2);
  pdf.setTextColor(0, 27, 158);
  pdf.text(l2c, marginX + colW * 2, infoY2);
  pdf.setTextColor(0, 0, 0);
  pdf.setFont('helvetica', 'normal');
  const acctText = safeText(doc.account_number || '').trim();
  pdf.text(acctText || 'N/A', marginX + pdf.getTextWidth(l2a) + pad, infoY2);
  const materialCostVal = Number(doc.material_cost ?? 0);
  pdf.text(materialCostVal > 0 ? moneyWithCurrency(materialCostVal, doc.currency) : '', marginX + colW + pdf.getTextWidth(l2b) + pad, infoY2);
  const estimatedCostVal = Number(doc.total ?? 0);

  // Estimated cost: inline next to label, green
  const estimatedCostText = estimatedCostVal > 0 ? moneyWithCurrency(estimatedCostVal, doc.currency) : '';
  if (estimatedCostText) {
    const estimatedValueX = marginX + colW * 2 + pdf.getTextWidth(l2c) + pad;
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(22, 163, 74);
    pdf.text(estimatedCostText, estimatedValueX, infoY2);
    pdf.setTextColor(0, 0, 0);
    pdf.setFont('helvetica', 'normal');
  }

  const linesY = infoY2 + 30;

  const { data: lines } = await supabase
    .from('service_document_lines')
    .select('position, description, quantity, unit_price, line_total, taxable')
    .eq('document_id', documentId)
    .eq('user_id', tenantId)
    .order('position', { ascending: true });

  const safeLines = Array.isArray(lines) ? lines : [];

  const rows = safeLines.map((l) => [
    String(l?.description ?? ''),
    String(Number(l?.quantity ?? 0)),
    moneyWithCurrency(l?.unit_price, doc.currency),
    moneyWithCurrency(l?.line_total, doc.currency),
  ]);

  const { data: companyInfoAll } = await supabase
    .from('company_info')
    .select('*')
    .eq('user_id', tenantId)
    .limit(1)
    .maybeSingle();

  // ── Manual table drawing (matches Job Estimate HTML template) ──
  const tblX = marginX;
  const tblW = contentW;
  const colWidths = [tblW - 190, 50, 70, 70]; // Description, Qty, Price, Amount
  const headerH = 26;
  const rowH = 22;
  const headers = ['Description', 'Qty', 'Price', 'Amount'];
  const headerAligns = ['left', 'center', 'right', 'right'];

  // Header row (blue fill, white text)
  pdf.setFillColor(0, 27, 158);
  pdf.rect(tblX, linesY, tblW, headerH, 'F');
  pdf.setDrawColor(0, 27, 158);
  pdf.setLineWidth(1);
  pdf.rect(tblX, linesY, tblW, headerH, 'S');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  let hColX = tblX;
  for (let ci = 0; ci < headers.length; ci++) {
    const cw = colWidths[ci];
    const align = headerAligns[ci];
    const tx = align === 'right' ? hColX + cw - 8 : align === 'center' ? hColX + cw / 2 : hColX + 8;
    const opts = align === 'right' ? { align: 'right' } : align === 'center' ? { align: 'center' } : {};
    pdf.text(headers[ci], tx, linesY + 17, opts);
    if (ci < headers.length - 1) pdf.line(hColX + cw, linesY, hColX + cw, linesY + headerH);
    hColX += cw;
  }

  // Data rows
  pdf.setTextColor(0, 0, 0);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  let dataY = linesY + headerH;
  for (const r of rows) {
    pdf.setDrawColor(0, 27, 158);
    pdf.setLineWidth(1);
    pdf.rect(tblX, dataY, tblW, rowH, 'S');
    let dColX = tblX;
    for (let ci = 0; ci < r.length; ci++) {
      const cw = colWidths[ci];
      const align = headerAligns[ci];
      const tx = align === 'right' ? dColX + cw - 8 : align === 'center' ? dColX + cw / 2 : dColX + 8;
      const opts = align === 'right' ? { align: 'right' } : align === 'center' ? { align: 'center' } : {};
      const rawText = String(r[ci]);
      const cellText = ci === 0 ? truncateToWidth(pdf, rawText, cw - 16) : rawText;
      pdf.text(cellText, tx, dataY + 15, opts);
      if (ci < r.length - 1) pdf.line(dColX + cw, dataY, dColX + cw, dataY + rowH);
      dColX += cw;
    }
    dataY += rowH;
  }
  // If no rows, draw one empty row
  if (rows.length === 0) {
    pdf.setDrawColor(0, 27, 158);
    pdf.setLineWidth(1);
    pdf.rect(tblX, dataY, tblW, rowH, 'S');
    dataY += rowH;
  }
  const afterTableY = dataY + 16;

  const safeRate = normalizeTaxRate(doc?.tax_rate);
  const computedSubtotal = safeLines.reduce((sum, l) => sum + normalizeMoney(l?.line_total), 0);
  const computedTaxableSubtotal = safeLines.reduce((sum, l) => {
    if (l?.taxable === false) return sum;
    return sum + normalizeMoney(l?.line_total);
  }, 0);

  const subtotalValue = Number.isFinite(computedSubtotal) && computedSubtotal > 0 ? computedSubtotal : normalizeMoney(doc.subtotal);
  const taxValue = round2(computedTaxableSubtotal * safeRate);
  const totalValue = round2(subtotalValue + taxValue);

  // Below section: Payment Terms + Totals
  const belowY = afterTableY + 18;
  const boxGap = 16;
  const leftBoxW = contentW * 0.58;
  const rightBoxW = contentW - leftBoxW - boxGap;
  const leftBoxX = marginX;
  const rightBoxX = marginX + leftBoxW + boxGap;
  const boxH = 95;

  // Payment terms box
  pdf.setDrawColor(0, 27, 158);
  pdf.setLineWidth(2);
  pdf.rect(leftBoxX, belowY, leftBoxW, boxH);
  pdf.setFillColor(0, 27, 158);
  pdf.rect(leftBoxX, belowY, leftBoxW, 20, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.text('Payment Terms:', leftBoxX + 8, belowY + 14);

  pdf.setTextColor(0, 0, 0);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  const defaultJobEstimateTerms =
    '-20% Due Upon Contract Signing\n-40% Due at Product Midpoint (Date)\n-20% Due to Close to Completion (Date)\n-10% Upon Final Inspection and Approval';
  const paymentTermsText = safeText(doc.terms_snapshot) || defaultJobEstimateTerms;
  const paymentLines = splitText(pdf, paymentTermsText.replace(/\\n/g, '\n'), leftBoxW - 16);
  let payY = belowY + 34;
  for (const line of paymentLines) {
    pdf.text(String(line), leftBoxX + 8, payY);
    payY += 12;
    if (payY > belowY + boxH - 8) break;
  }

  // Totals box (right)
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  const t1 = `Subtotal:`;
  const t2 = `Sales Tax:`;
  const t2b = `Material Cost:`;
  const t3 = `Grand Total:`;
  const valX = rightBoxX + rightBoxW;
  const materialCostValue = Number(doc?.material_cost ?? 0);
  const grandTotalValue = Number(subtotalValue) + Number(taxValue) + (Number.isFinite(materialCostValue) ? materialCostValue : 0);
  let tY = belowY + 30;
  pdf.text(t1, rightBoxX, tY);
  pdf.text(moneyWithCurrency(subtotalValue, doc.currency), valX, tY, { align: 'right' });
  tY += 18;
  pdf.text(t2, rightBoxX, tY);
  pdf.text(moneyWithCurrency(taxValue, doc.currency), valX, tY, { align: 'right' });
  tY += 18;
  pdf.text(t2b, rightBoxX, tY);
  pdf.text(moneyWithCurrency(materialCostValue, doc.currency), valX, tY, { align: 'right' });
  tY += 22;
  pdf.setDrawColor(0, 27, 158);
  pdf.setLineWidth(2);
  pdf.line(rightBoxX, tY, valX, tY);
  tY += 18;
  pdf.setFont('helvetica', 'bold');
  pdf.text(t3, rightBoxX, tY);
  pdf.text(moneyWithCurrency(grandTotalValue, doc.currency), valX, tY, { align: 'right' });

  // Terms and conditions box
  const termsBoxY = belowY + boxH + 16;
  const termsBoxH = 60;
  pdf.setDrawColor(0, 27, 158);
  pdf.setLineWidth(2);
  pdf.rect(marginX, termsBoxY, contentW, termsBoxH);
  pdf.setFillColor(0, 27, 158);
  pdf.rect(marginX, termsBoxY, contentW, 20, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.text('Terms and Conditions:', marginX + 8, termsBoxY + 14);
  pdf.setTextColor(0, 0, 0);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  const termsText = safeText(companyInfoAll?.terms_and_conditions);
  if (!termsText) {
    const fallbackTerms = 'This project estimate is based on information and requirements provided by the client and is not guaranteed. Actual cost and terms may change once all project elements are discussed, negotiated and finalized.';
    const termsLines = splitText(pdf, fallbackTerms.replace(/\\n/g, '\n'), contentW - 16);
    let termsY = termsBoxY + 34;
    for (const line of termsLines) {
      pdf.text(String(line), marginX + 8, termsY);
      termsY += 12;
      if (termsY > termsBoxY + termsBoxH - 8) break;
    }
  } else {
    const termsLines = splitText(pdf, termsText.replace(/\\n/g, '\n'), contentW - 16);
    let termsY = termsBoxY + 34;
    for (const line of termsLines) {
      pdf.text(String(line), marginX + 8, termsY);
      termsY += 12;
      if (termsY > termsBoxY + termsBoxH - 8) break;
    }
  }

  // Signature blocks (simple lines like Job Estimate template)
  const sigTopY = Math.min(termsBoxY + termsBoxH + 30, pageHeight - 200);
  const sigColW = (contentW - 50) / 2;
  const sigLeftX = marginX;
  const sigRightX = marginX + sigColW + 50;

  const clientNameText = safeText(signature?.client_name || doc.client_name || '');
  const contractorNameText = safeText(signature?.contractor_name || '');

  // Use pre-formatted dates from UI if provided, otherwise fallback to formatSignedAt
  const clientDateText = formattedClientSignedAt || formatSignedAt(signature?.client_signed_at);
  const contractorDateText = formattedContractorSignedAt || formatSignedAt(signature?.contractor_signed_at);

  pdf.setTextColor(0, 0, 0);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.text('CLIENT', sigLeftX, sigTopY);
  pdf.text('CONTRACTOR', sigRightX, sigTopY);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(0.5);

  const labelW = 65;
  const lineEnd = sigColW;
  const fieldGap = 36;
  const nameFieldY = sigTopY + 28;
  const sigFieldY = nameFieldY + fieldGap;
  const dateFieldY = sigFieldY + fieldGap;

  // Helper: draw label + underline
  function drawSigField(baseX, fieldY, label) {
    pdf.text(label, baseX, fieldY);
    pdf.line(baseX + labelW, fieldY + 2, baseX + lineEnd, fieldY + 2);
  }

  // Left (Client)
  drawSigField(sigLeftX, nameFieldY, 'Name:');
  drawSigField(sigLeftX, sigFieldY, 'Signature:');
  drawSigField(sigLeftX, dateFieldY, 'Date:');

  // Right (Contractor)
  drawSigField(sigRightX, nameFieldY, 'Name:');
  drawSigField(sigRightX, sigFieldY, 'Signature:');
  drawSigField(sigRightX, dateFieldY, 'Date:');

  // Fill in name/date text
  pdf.text(clientNameText, sigLeftX + labelW, nameFieldY);
  pdf.text(clientDateText, sigLeftX + labelW, dateFieldY);
  pdf.text(contractorNameText, sigRightX + labelW, nameFieldY);
  pdf.text(contractorDateText, sigRightX + labelW, dateFieldY);

  // Place signature images above signature line
  const clientType = inferImageType(clientSig);
  const contractorType = inferImageType(contractorSig);
  const sigImgW = lineEnd - labelW - 10;
  const sigImgH = 28;

  if (clientBuf?.length) {
    const dataUri = `data:${clientType.mime};base64,${clientBuf.toString('base64')}`;
    try {
      pdf.addImage(dataUri, clientType.format, sigLeftX + labelW, sigFieldY - sigImgH - 2, sigImgW, sigImgH);
    } catch {}
  }

  if (contractorBuf?.length) {
    const dataUri = `data:${contractorType.mime};base64,${contractorBuf.toString('base64')}`;
    try {
      pdf.addImage(dataUri, contractorType.format, sigRightX + labelW, sigFieldY - sigImgH - 2, sigImgW, sigImgH);
    } catch {}
  }

  // Footer
  const footerParts = [];
  if (companyInfoAll?.facebook) footerParts.push('Facebook');
  if (companyInfoAll?.instagram) footerParts.push('Instagram');
  if (companyInfoAll?.twitter) footerParts.push('X');
  if (companyInfoAll?.linkedin) footerParts.push('LinkedIn');
  if (companyInfoAll?.youtube) footerParts.push('YouTube');
  if (companyInfoAll?.tiktok) footerParts.push('TikTok');
  if (companyInfoAll?.whatsapp) footerParts.push(`WhatsApp: ${safeText(companyInfoAll.whatsapp)}`);
  const footerLinksText = footerParts.filter(Boolean).join(' | ');

  const poweredText = 'Powered by: sendbillnow.com';
  const poweredUrl = 'https://sendbillnow.com';
  const poweredH = 18;
  const thanksH = footerLinksText ? 42 : 30;
  const footerH = thanksH + poweredH;
  const footerY = pageHeight - 26 - footerH;

  // Thanks / social links panel (blend into page background; no box/border)

  pdf.setTextColor(15, 23, 42);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.text('Thank you for your purchase.', marginX + contentW / 2, footerY + 18, { align: 'center' });

  if (footerLinksText) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.text(footerLinksText, marginX + contentW / 2, footerY + 34, { align: 'center' });
  }

  // Powered-by bar (blue background, white text)
  const poweredY = footerY + thanksH;
  pdf.setFillColor(0, 27, 158);
  pdf.rect(marginX, poweredY, contentW, poweredH, 'F');

  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text(poweredText, marginX + contentW / 2, poweredY + 12, { align: 'center' });
  {
    const w = pdf.getTextWidth(poweredText);
    const x = marginX + contentW / 2 - w / 2;
    pdf.link(x, poweredY + 12 - 8, w, 10, { url: poweredUrl });
  }

  const pdfAb = pdf.output('arraybuffer');
  const pdfBuf = Buffer.from(pdfAb);

  if (previewOnly) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${doc.doc_number || 'service-document'}-preview.pdf"`);
    return res.status(200).send(pdfBuf);
  }

  const upload = await admin.storage.from(pdfBucket).upload(defaultPdfPath, pdfBuf, {
    contentType: 'application/pdf',
    upsert: true,
  });

  if (upload.error) {
    return res.status(500).json({ ok: false, error: upload.error.message || 'Could not upload sealed PDF' });
  }

  const signedPdf = await admin.storage.from(pdfBucket).createSignedUrl(defaultPdfPath, 7 * 24 * 60 * 60).catch(() => null);
  const sealedPdfUrl = signedPdf?.data?.signedUrl ? String(signedPdf.data.signedUrl) : null;

  if (!doc.sealed_at) {
    const { data: sealedRow, error: sealError } = await supabase
      .from('service_documents')
      .update({ status: 'Sealed', sealed_at: nowIso, sealed_pdf_path: defaultPdfPath })
      .eq('id', documentId)
      .eq('user_id', tenantId)
      .is('sealed_at', null)
      .select('id, sealed_at, sealed_pdf_path, sealed_email_sent_at')
      .maybeSingle();

    if (sealError) return res.status(500).json({ ok: false, error: sealError.message || 'Could not seal document' });

    if (sealedRow?.sealed_at) {
      await supabase
        .from('service_document_tokens')
        .update({ revoked_at: nowIso })
        .eq('document_id', documentId)
        .eq('user_id', tenantId)
        .is('revoked_at', null);

      await insertEvent({ supabase, tenantId, documentId, eventType: 'SEALED', meta: { sealed_pdf_path: defaultPdfPath } });
    }
  }

  const { data: latest } = await supabase
    .from('service_documents')
    .select('sealed_at, sealed_email_sent_at')
    .eq('id', documentId)
    .eq('user_id', tenantId)
    .limit(1)
    .maybeSingle();

  const alreadySealed = Boolean(doc.sealed_at || latest?.sealed_at);

  const clientEmail = String(doc.client_email || '').trim();
  if (!latest?.sealed_email_sent_at && isValidEmail(clientEmail)) {
    const claimIso = new Date().toISOString();
    const { data: claim } = await supabase
      .from('service_documents')
      .update({ sealed_email_sent_at: claimIso })
      .eq('id', documentId)
      .eq('user_id', tenantId)
      .is('sealed_email_sent_at', null)
      .select('id')
      .maybeSingle();

    if (claim?.id) {
      try {
        const baseUrl = getBaseUrl(req);

        const html = buildEmailHtml({
          companyName: doc.company_name,
          clientName: doc.client_name,
          docType: doc.doc_type,
          docNumber: doc.doc_number,
          sealedPdfUrl: sealedPdfUrl,
        });

        const subject = `Agreement Confirmed${doc.doc_number ? ` - ${doc.doc_number}` : ''}`;

        const resp = await fetch(`${baseUrl}/api/send-receipt-email`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            to: clientEmail,
            customerName: doc.client_name,
            companyName: doc.company_name,
            templateType: 'service-document-sealed',
            subject,
            html,
            attachment: {
              filename: `${doc.doc_number || 'service-document'}-sealed.pdf`,
              content: pdfBuf.toString('base64'),
              content_type: 'application/pdf',
            },
            sale: {
              date: new Date().toLocaleDateString(),
              time: new Date().toLocaleTimeString(),
              subtotal: doc.subtotal ?? 0,
              tax: doc.tax ?? 0,
              total: doc.total ?? 0,
              items: [],
            },
          }),
        });

        if (!resp.ok) {
          const text = await resp.text().catch(() => '');
          throw new Error(text || 'Email send failed');
        }

        const businessEmail = String(doc.company_email || '').trim();
        if (businessEmail && businessEmail !== clientEmail && isValidEmail(businessEmail)) {
          try {
            await fetch(`${baseUrl}/api/send-receipt-email`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                to: businessEmail,
                customerName: doc.client_name,
                companyName: doc.company_name,
                templateType: 'service-document-sealed',
                subject,
                html,
                attachment: {
                  filename: `${doc.doc_number || 'service-document'}-sealed.pdf`,
                  content: pdfBuf.toString('base64'),
                  content_type: 'application/pdf',
                },
                sale: {
                  date: new Date().toLocaleDateString(),
                  time: new Date().toLocaleTimeString(),
                  subtotal: doc.subtotal ?? 0,
                  tax: doc.tax ?? 0,
                  total: doc.total ?? 0,
                  items: [],
                },
              }),
            });
          } catch (e) {
            console.error('Business copy email failed', e);
          }
        }
      } catch (e) {
        await supabase
          .from('service_documents')
          .update({ sealed_email_sent_at: null })
          .eq('id', documentId)
          .eq('user_id', tenantId)
          .eq('sealed_email_sent_at', claimIso);
        return res.status(502).json({ ok: false, error: e?.message || 'Email send failed' });
      }
    }
  }

    return res.status(200).json({
      ok: true,
      already_sealed: alreadySealed,
      sealed_pdf_url: sealedPdfUrl,
      sealed_pdf_path: defaultPdfPath,
    });
  } catch (e) {
    console.error('service-documents/seal failed', e);
    const msg = e?.message ? String(e.message) : 'Internal Server Error';
    return res.status(500).json({ ok: false, error: msg });
  }
}
