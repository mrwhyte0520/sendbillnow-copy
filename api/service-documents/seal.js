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
const PRIMARY_LOGO_PATH = path.join(__dirname, '..', '..', 'public', 'logo-invoice.png');
const LEGACY_LOGO_PATH = path.join(__dirname, '..', '..', 'public', 'logo.png');

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

function readNonEmptyFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size <= 0) return null;
    const buf = fs.readFileSync(filePath);
    return buf.length ? buf : null;
  } catch {
    return null;
  }
}

function toImageDataUrl(buf, format) {
  if (!buf?.length) return null;
  const normalized = String(format || 'PNG').toUpperCase();
  const mime = normalized === 'JPEG' ? 'image/jpeg' : normalized === 'WEBP' ? 'image/webp' : 'image/png';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

function loadInvoiceLogoDataUrl() {
  try {
    const primary = readNonEmptyFile(PRIMARY_LOGO_PATH);
    if (primary) return toImageDataUrl(primary, 'PNG');
    const legacy = readNonEmptyFile(LEGACY_LOGO_PATH);
    if (legacy) return toImageDataUrl(legacy, 'PNG');
    return null;
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
    const skipEmail = Boolean(body.skipEmail || body.skip_email);
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
    if (!skipEmail && !doc.sealed_email_sent_at && isValidEmail(clientEmail)) {
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

  const isQuote = doc.doc_type === 'JOB_ESTIMATE';
  const docLabel = isQuote ? 'QUOTE' : 'INVOICE';
  const docNumber = safeText(doc.doc_number || String(documentId).slice(0, 8));
  const dateStr = doc?.created_at ? formatDateOnlyUtcMinus4(doc.created_at) : formatDateOnlyUtcMinus4(new Date().toISOString());
  const timeStr = (() => {
    const d = parseTimestampUtc(doc?.created_at || '') || new Date();
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  })();
  const validDays = (() => {
    const n = Number(doc.valid_for_days ?? 30);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 30;
  })();

  const rawAddr = String(doc.client_address || '').replace(/\r\n/g, '\n');
  const addrLines = rawAddr.split('\n').map((l) => l.trim()).filter(Boolean);
  const addrLine1 = addrLines[0] || '';
  const addrLine2 = addrLines.slice(1).join(' ') || '';
  const addrCityStateZipRaw = addrLines.length > 1 ? addrLines[addrLines.length - 1] : addrLine1;
  const structuredShip = {
    city: safeText(doc.client_city || doc.clientCity || ''),
    state: safeText(doc.client_state || doc.clientState || ''),
    zip: safeText(doc.client_zip || doc.clientZip || doc.client_postal_code || doc.clientPostalCode || ''),
  };
  const parseCombinedShipLocation = (input) => {
    const combined = safeText(String(input || '')).replace(/\s+/g, ' ').trim();
    if (!combined) return { city: '', state: '', zip: '' };

    const zipRegex = /(\d{4,10}(?:-\d{2,6})?)\s*$/;
    const firstCommaIdx = combined.indexOf(',');
    if (firstCommaIdx > 0) {
      const city = safeText(combined.slice(0, firstCommaIdx).trim());
      const right = safeText(combined.slice(firstCommaIdx + 1).trim());
      if (city && right) {
        const zipMatch = right.match(zipRegex);
        if (zipMatch && typeof zipMatch.index === 'number') {
          const zip = safeText(zipMatch[1] || '');
          const state = safeText(right.slice(0, zipMatch.index).replace(/,\s*$/, '').trim());
          if (city && state && zip) {
            return { city, state, zip };
          }
        }
      }
    }

    return { city: combined, state: '', zip: '' };
  };
  const parsedShip = (() => {
    const hasStructured = !!(structuredShip.city || structuredShip.state || structuredShip.zip);
    const cityLooksCombined = /,/.test(structuredShip.city) || /(\d{4,10}(?:-\d{2,6})?)\s*$/.test(structuredShip.city);
    const structuredLooksPolluted = !!structuredShip.city && !structuredShip.state && !structuredShip.zip && cityLooksCombined;

    if (structuredLooksPolluted) {
      return parseCombinedShipLocation(structuredShip.city);
    }

    if (hasStructured) {
      return structuredShip;
    }
    return parseCombinedShipLocation(addrCityStateZipRaw);
  })();
  const shipCity = parsedShip.city;
  const shipState = parsedShip.state;
  const shipZip = parsedShip.zip;

  const invoiceLogoDataUrl = loadInvoiceLogoDataUrl();
  const { data: lines } = await supabase
    .from('service_document_lines')
    .select('position, description, quantity, unit_price, line_total, taxable')
    .eq('document_id', documentId)
    .eq('user_id', tenantId)
    .order('position', { ascending: true });

  const safeLines = Array.isArray(lines) ? lines : [];

  const { data: companyInfoAll } = await supabase
    .from('company_info')
    .select('*')
    .eq('user_id', tenantId)
    .limit(1)
    .maybeSingle();

  const safeRate = normalizeTaxRate(doc?.tax_rate);
  const computedSubtotal = safeLines.reduce((sum, l) => sum + normalizeMoney(l?.line_total), 0);
  const computedTaxableSubtotal = safeLines.reduce((sum, l) => {
    if (l?.taxable === false) return sum;
    return sum + normalizeMoney(l?.line_total);
  }, 0);

  const subtotalValue = Number.isFinite(computedSubtotal) && computedSubtotal > 0 ? computedSubtotal : normalizeMoney(doc.subtotal);
  const taxValue = round2(computedTaxableSubtotal * safeRate);
  const totalValue = round2(subtotalValue + taxValue);

  if (isQuote) {
    const companyName = truncateToWidth(
      pdf,
      safeText(doc.company_name || companyInfoAll?.name || companyInfoAll?.company_name || 'COMPANY NAME'),
      250
    );
    const companyAddressRaw = String(doc.company_address || companyInfoAll?.address || companyInfoAll?.company_address || '').replace(/\r\n/g, '\n');
    const companyAddressLines = companyAddressRaw.split('\n').map((line) => safeText(line)).filter(Boolean);
    const companyLine1 = truncateToWidth(pdf, companyAddressLines[0] || '', 220);
    const companyLine2 = truncateToWidth(pdf, companyAddressLines[1] || companyAddressLines.slice(1).join(' '), 220);
    const companyPhone = truncateToWidth(
      pdf,
      safeText(doc.company_phone || companyInfoAll?.phone || companyInfoAll?.company_phone || companyInfoAll?.contact_phone || ''),
      140
    );
    const companyEmail = truncateToWidth(
      pdf,
      safeText(doc.company_email || companyInfoAll?.email || companyInfoAll?.company_email || companyInfoAll?.contact_email || ''),
      140
    );
    const expiresAt = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000);
    const expiresOn = formatDateOnlyUtcMinus4(expiresAt.toISOString()) || dateStr;
    const topRightX = 418;
    const lineEndX = pageWidth - marginX;
    const sectionLineColor = [159, 202, 179];

    if (invoiceLogoDataUrl) {
      try {
        pdf.addImage(invoiceLogoDataUrl, 'PNG', 42, 34, 124, 68);
      } catch {}
    }

    // Expires On drawn centered below company block (see below near divider)

    pdf.setTextColor(17, 17, 17);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(22);
    pdf.text('QUOTE', topRightX, 60);

    const drawMetaRow = (label, value, y) => {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(12);
      pdf.setTextColor(17, 17, 17);
      pdf.text(label, topRightX, y);
      const labelWidth = pdf.getTextWidth(label);
      const valueText = safeText(value || '');
      const valueWidth = valueText ? pdf.getTextWidth(valueText) : 0;
      const lineStart = topRightX + labelWidth + 8;
      const textX = lineEndX - valueWidth;
      if (valueText) pdf.text(valueText, textX, y);
      pdf.setDrawColor(150, 150, 150);
      pdf.line(lineStart, y + 3, valueText ? textX - 6 : lineEndX, y + 3);
    };

    drawMetaRow('ACCT. #:', safeText(doc.account_number || ''), 92);
    drawMetaRow('QUOTE #:', docNumber, 114);
    drawMetaRow('QUOTE DATE:', dateStr, 136);
    drawMetaRow('TIME:', timeStr, 158);
    drawMetaRow('QUOTE COSTS: $', safeMoney(totalValue), 180);

    pdf.setTextColor(22, 57, 119);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(17);
    pdf.text(companyName, marginX + 18, 126);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(12);
    pdf.setTextColor(33, 46, 71);
    if (companyLine1) pdf.text(companyLine1, marginX + 50, 150);
    if (companyLine2) pdf.text(companyLine2, marginX + 50, 170);
    pdf.text('Phone:', marginX + 50, 192);
    pdf.text('Email:', marginX + 50, 214);
    pdf.setDrawColor(180, 180, 180);
    pdf.line(marginX + 95, 189, marginX + 245, 189);
    pdf.line(marginX + 92, 211, marginX + 245, 211);
    if (companyPhone) pdf.text(companyPhone, marginX + 99, 192);
    if (companyEmail) pdf.text(companyEmail, marginX + 96, 214);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.setTextColor(23, 133, 78);
    pdf.text(`Expires On: ${expiresOn}`, pageWidth / 2, 222, { align: 'center' });
    pdf.setDrawColor(...sectionLineColor);
    pdf.setLineWidth(1);
    pdf.line(marginX, 232, pageWidth - marginX, 232);

    pdf.setTextColor(17, 17, 17);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(16);
    pdf.text('QUOTE FOR:', marginX + 4, 270);
    pdf.setTextColor(23, 133, 78);
    pdf.text('SHIP TO:', 415, 270);

    pdf.setFillColor(232, 241, 247);
    pdf.rect(marginX + 6, 286, 326, 20, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(23, 97, 63);
    pdf.setFontSize(12.5);
    pdf.text(`CUSTOMER NAME: ${truncateToWidth(pdf, safeText(doc.client_name || ''), 222)}`, marginX + 14, 300);

    pdf.setTextColor(17, 17, 17);
    pdf.setFontSize(12.5);
    pdf.text('CUSTOMER ID:', marginX + 14, 325);
    const customerIdText = truncateToWidth(pdf, safeText(doc.account_number || ''), 204);
    if (customerIdText) pdf.text(customerIdText, marginX + 128, 325);

    const drawShipLine = (label, value, y) => {
      const shipLabelX = 400;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(12.5);
      pdf.setTextColor(17, 17, 17);
      pdf.text(label, shipLabelX, y);
      const labelWidth = pdf.getTextWidth(label);
      const textValue = safeText(value || '');
      const lineStart = shipLabelX + labelWidth + 6;
      const endX = pageWidth - marginX;
      const textX = lineStart + 4;
      const valueLines = textValue ? splitText(pdf, textValue, Math.max(30, endX - textX - 4)) : [];
      let textY = y;
      if (valueLines.length) {
        for (const line of valueLines) {
          pdf.text(String(line), textX, textY);
          textY += 11;
        }
      }
      pdf.setDrawColor(150, 150, 150);
      const lineY = (valueLines.length ? textY : y + 3) + 1;
      pdf.line(lineStart, lineY, endX, lineY);
      return lineY + 10;
    };

    let shipY = 296;
    shipY = drawShipLine('CITY:', shipCity, shipY);
    shipY = drawShipLine('STATE:', shipState, shipY);
    shipY = drawShipLine('ZIP CODE:', shipZip, shipY);

    const shipBlockBottomY = Math.max(340, shipY - 8);

    pdf.setDrawColor(180, 180, 180);
    pdf.setLineWidth(1);
    pdf.line(376, 252, 376, shipBlockBottomY);

    pdf.setDrawColor(...sectionLineColor);
    pdf.setLineWidth(1);
    const sectionDividerY = shipBlockBottomY + 8;
    pdf.line(marginX, sectionDividerY, pageWidth - marginX, sectionDividerY);

    const secRowY = sectionDividerY + 5;
    const secRowH = 24;
    const secCols = ['SHIP VIA', 'QUOTED BY:', 'P.O.#:', 'DEPT.', 'PYMT METHOD'];
    const secColW = contentW / 5;
    pdf.setFillColor(22, 57, 121);
    pdf.rect(marginX, secRowY, contentW, secRowH, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    for (let si = 0; si < secCols.length; si++) {
      pdf.text(secCols[si], marginX + si * secColW + secColW / 2, secRowY + 15, { align: 'center' });
    }
    const valRowY = secRowY + secRowH;
    const valRowH = 20;
    pdf.setDrawColor(180, 180, 180);
    pdf.rect(marginX, valRowY, contentW, valRowH, 'S');
    for (let si = 1; si < secCols.length; si++) {
      pdf.line(marginX + si * secColW, valRowY, marginX + si * secColW, valRowY + valRowH);
    }
    const tableX = marginX;
    const tableY = valRowY + valRowH + 2;
    const tableW = contentW;
    const colWidths = [44, 212, 56, 110, 110];
    const headerH = 28;
    const rowH = 26;
    const headers = ['ID', 'DESCRIPTION', 'QTY', 'ORIGINAL PRICE', 'CURRENT PRICE'];
    const aligns = ['center', 'left', 'center', 'right', 'right'];

    pdf.setFillColor(21, 103, 71);
    pdf.setDrawColor(43, 95, 67);
    pdf.setLineWidth(1);
    pdf.rect(tableX, tableY, tableW, headerH, 'FD');
    let headerX = tableX;
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    for (let i = 0; i < headers.length; i += 1) {
      const cw = colWidths[i];
      const align = aligns[i];
      const tx = align === 'right' ? headerX + cw - 8 : align === 'center' ? headerX + cw / 2 : headerX + 8;
      pdf.text(headers[i], tx, tableY + 19, align === 'right' ? { align: 'right' } : align === 'center' ? { align: 'center' } : {});
      if (i < headers.length - 1) {
        pdf.setDrawColor(72, 120, 92);
        pdf.line(headerX + cw, tableY, headerX + cw, tableY + headerH);
      }
      headerX += cw;
    }

    const quoteRows = safeLines.map((line, index) => {
      const qty = Number(line?.quantity ?? 0) || 0;
      const unitP = Number(line?.unit_price ?? 0) || 0;
      const lineTotal = Number(line?.line_total ?? line?.total ?? (qty * unitP)) || 0;
      return [
        String(index + 1),
        safeText(line?.description || ''),
        String(qty || ''),
        moneyWithCurrency(unitP, doc.currency),
        moneyWithCurrency(lineTotal, doc.currency),
      ];
    });

    let dataY = tableY + headerH;
    pdf.setTextColor(17, 17, 17);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    for (let rowIndex = 0; rowIndex < quoteRows.length; rowIndex += 1) {
      const row = quoteRows[rowIndex];
      pdf.setDrawColor(180, 180, 180);
      pdf.rect(tableX, dataY, tableW, rowH, 'S');
      let cellX = tableX;
      for (let ci = 0; ci < row.length; ci += 1) {
        const cw = colWidths[ci];
        const align = aligns[ci];
        const raw = String(row[ci] || '');
        const txt = ci === 1 ? truncateToWidth(pdf, raw, cw - 12) : raw;
        const tx = align === 'right' ? cellX + cw - 8 : align === 'center' ? cellX + cw / 2 : cellX + 8;
        pdf.text(txt, tx, dataY + 18, align === 'right' ? { align: 'right' } : align === 'center' ? { align: 'center' } : {});
        if (ci < row.length - 1) pdf.line(cellX + cw, dataY, cellX + cw, dataY + rowH);
        cellX += cw;
      }
      dataY += rowH;
    }
    while ((dataY - (tableY + headerH)) / rowH < 4) {
      pdf.setDrawColor(180, 180, 180);
      pdf.rect(tableX, dataY, tableW, rowH, 'S');
      let cellX = tableX;
      for (let ci = 0; ci < colWidths.length - 1; ci += 1) {
        cellX += colWidths[ci];
        pdf.line(cellX, dataY, cellX, dataY + rowH);
      }
      dataY += rowH;
    }

    const notesY = dataY + 20;
    const notesW = 336;
    const notesH = 112;
    pdf.setDrawColor(180, 180, 180);
    pdf.rect(marginX, notesY, notesW, notesH, 'S');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.setTextColor(22, 57, 119);
    pdf.text('NOTES:', marginX + 12, notesY + 20);
    const notesText = safeText(doc.terms_snapshot || companyInfoAll?.terms_and_conditions || '');
    const noteLines = splitText(pdf, notesText.replace(/\\n/g, '\n'), notesW - 24);
    let noteY = notesY + 40;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(17, 17, 17);
    for (const line of noteLines) {
      pdf.text(String(line), marginX + 12, noteY);
      noteY += 11;
      if (noteY > notesY + notesH - 10) break;
    }

    const totalsX = 394;
    const totalsRight = pageWidth - marginX;
    const drawTotalRow = (label, value, y, green) => {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(13);
      pdf.setTextColor(17, 17, 17);
      pdf.text(label, totalsX, y);
      const textValue = safeMoney(value);
      const valueWidth = pdf.getTextWidth(textValue);
      const textX = totalsRight - valueWidth;
      pdf.text(textValue, textX, y);
      pdf.setDrawColor(...(green ? sectionLineColor : [170, 170, 170]));
      pdf.line(totalsX + 96, y - 2, textX - 6, y - 2);
    };

    drawTotalRow('SUB TOTAL:', subtotalValue, notesY + 18, false);
    drawTotalRow('SHIPPING:', 0, notesY + 44, false);
    drawTotalRow('SALES TAX:', taxValue, notesY + 70, false);
    drawTotalRow('GRAND TOTAL:', totalValue, notesY + 96, true);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(15);
    pdf.setTextColor(22, 57, 119);
    pdf.text('WE LOOK FORWARD TO YOUR BUSINESS!', pageWidth / 2, 722, { align: 'center' });
    pdf.setFillColor(34, 197, 94);
    pdf.rect(0, 756, pageWidth, 12, 'F');
    pdf.setFillColor(11, 60, 148);
    pdf.rect(0, 768, pageWidth, 24, 'F');
  } else {
    if (invoiceLogoDataUrl) {
      try {
        pdf.addImage(invoiceLogoDataUrl, 'PNG', marginX, 40, 135, 82);
      } catch {}
    }

    const headerRightX = pageWidth - 230;
    pdf.setTextColor(0, 0, 0);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(18);
    pdf.text(docLabel, headerRightX, 62);
    pdf.setFontSize(11);
    const headerRows = [
      `ACCT. #: ${safeText(doc.account_number || '')}`,
      `${docLabel} #: ${docNumber}`,
      `${docLabel} DATE: ${dateStr}`,
      `TIME: ${timeStr}`,
      `${docLabel} COSTS: ${moneyWithCurrency(doc.total ?? 0, doc.currency)}`,
    ];
    let headerY = 86;
    for (const row of headerRows) {
      pdf.text(row, headerRightX, headerY);
      headerY += 18;
    }

    const dividerY = 165;
    pdf.setDrawColor(120, 120, 120);
    pdf.setLineWidth(1);
    pdf.line(marginX, dividerY, pageWidth - marginX, dividerY);

    const sectionTopY = 210;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.text('SOLD TO:', marginX, sectionTopY);
    pdf.text('SHIP TO:', pageWidth - marginX - 190, sectionTopY);
    pdf.setFontSize(11);
    pdf.text(`CUSTOMER ID: ${safeText(doc.account_number || '')}`, marginX, sectionTopY + 18);
    pdf.text(`CUSTOMER NAME: ${truncateToWidth(pdf, safeText(doc.client_name || ''), 220)}`, marginX, sectionTopY + 36);
    pdf.text(`ADDRESS ${truncateToWidth(pdf, addrLine1 || '-', 170)}`, pageWidth - marginX - 190, sectionTopY + 18);
    pdf.text(`ADDRESS ${truncateToWidth(pdf, addrLine2 || '-', 170)}`, pageWidth - marginX - 190, sectionTopY + 36);
    pdf.line(marginX, sectionTopY + 44, pageWidth - marginX, sectionTopY + 44);

    const infoTopY = sectionTopY + 64;
    const infoCols = [105, 82, 115, 100, 100, 98];
    const infoLabels = ['SHIPPING\nMETHOD', 'TERMS', 'INVOICED BY:', 'PO#:', 'DEPT.', 'PAYMENT\nMETHOD'];
    const createdByName = truncateToWidth(pdf, safeText(signature?.contractor_name || ''), 92);
    const infoValues = [
      '',
      safeText(doc.terms_snapshot || ''),
      createdByName,
      '',
      '',
      '',
    ];
    let infoX = marginX;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    for (let i = 0; i < infoCols.length; i += 1) {
      const w = infoCols[i];
      pdf.rect(infoX, infoTopY, w, 38);
      const labelParts = String(infoLabels[i]).split('\n');
      pdf.text(labelParts[0], infoX + 6, infoTopY + 12);
      if (labelParts[1]) pdf.text(labelParts[1], infoX + 6, infoTopY + 24);
      if (infoValues[i]) {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        pdf.text(infoValues[i], infoX + 6, infoTopY + 33);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(10);
      }
      infoX += w;
    }

    const linesY = infoTopY + 56;
    const rows = safeLines.map((l) => [
      String(l?.description ?? ''),
      String(Number(l?.quantity ?? 0)),
      moneyWithCurrency(l?.unit_price, doc.currency),
      moneyWithCurrency(l?.line_total, doc.currency),
    ]);
    const tblX = marginX;
    const tblW = contentW;
    const colWidths = [36, tblW - 36 - 70 - 112 - 112, 70, 112, 112];
    const headerH = 26;
    const rowH = 20;
    const headers = ['ID', 'DESCRIPTION', 'QTY', 'ORIGINAL PRICE', 'CURRENT PRICE'];
    const headerAligns = ['left', 'left', 'center', 'right', 'right'];

    pdf.setDrawColor(140, 140, 140);
    pdf.setLineWidth(1);
    pdf.rect(tblX, linesY, tblW, headerH, 'S');
    pdf.setTextColor(0, 0, 0);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
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

    pdf.setTextColor(0, 0, 0);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    let dataY = linesY + headerH;
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const r = [
        String(rowIndex + 1),
        String(rows[rowIndex][0] || ''),
        String(rows[rowIndex][1] || ''),
        String(rows[rowIndex][2] || ''),
        String(rows[rowIndex][3] || ''),
      ];
      pdf.setDrawColor(140, 140, 140);
      pdf.setLineWidth(1);
      pdf.rect(tblX, dataY, tblW, rowH, 'S');
      let dColX = tblX;
      for (let ci = 0; ci < r.length; ci++) {
        const cw = colWidths[ci];
        const align = headerAligns[ci];
        const tx = align === 'right' ? dColX + cw - 8 : align === 'center' ? dColX + cw / 2 : dColX + 8;
        const opts = align === 'right' ? { align: 'right' } : align === 'center' ? { align: 'center' } : {};
        const rawText = String(r[ci]);
        const cellText = ci === 1 ? truncateToWidth(pdf, rawText, cw - 16) : rawText;
        pdf.text(cellText, tx, dataY + 15, opts);
        if (ci < r.length - 1) pdf.line(dColX + cw, dataY, dColX + cw, dataY + rowH);
        dColX += cw;
      }
      dataY += rowH;
    }
    const minRows = 4;
    while ((dataY - (linesY + headerH)) / rowH < minRows) {
      pdf.setDrawColor(140, 140, 140);
      pdf.setLineWidth(1);
      pdf.rect(tblX, dataY, tblW, rowH, 'S');
      let emptyX = tblX;
      for (let ci = 0; ci < colWidths.length - 1; ci += 1) {
        emptyX += colWidths[ci];
        pdf.line(emptyX, dataY, emptyX, dataY + rowH);
      }
      dataY += rowH;
    }
    const afterTableY = dataY + 18;

    const belowY = afterTableY;
    const boxGap = 16;
    const leftBoxW = contentW * 0.55;
    const rightBoxW = contentW - leftBoxW - boxGap;
    const leftBoxX = marginX;
    const rightBoxX = marginX + leftBoxW + boxGap;
    const boxH = 86;

    pdf.setDrawColor(140, 140, 140);
    pdf.setLineWidth(1);
    pdf.rect(leftBoxX, belowY, leftBoxW, boxH);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(0, 0, 0);
    pdf.text('NOTES:', leftBoxX + 8, belowY + 15);
    pdf.setTextColor(0, 0, 0);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    const notesText = safeText(doc.terms_snapshot || companyInfoAll?.terms_and_conditions || '');
    const noteLines = splitText(pdf, notesText.replace(/\\n/g, '\n'), leftBoxW - 16);
    let noteY = belowY + 30;
    for (const line of noteLines) {
      pdf.text(String(line), leftBoxX + 8, noteY);
      noteY += 11;
      if (noteY > belowY + boxH - 8) break;
    }

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    const t1 = 'SUBTOTAL:';
    const t2 = 'SHIPPING:';
    const t3 = 'SALES TAX:';
    const t4 = 'GRAND TOTAL:';
    const valX = rightBoxX + rightBoxW;
    const grandTotalValue = totalValue;
    let tY = belowY + 16;
    pdf.text(t1, rightBoxX, tY);
    pdf.text(moneyWithCurrency(subtotalValue, doc.currency), valX, tY, { align: 'right' });
    tY += 18;
    pdf.text(t2, rightBoxX, tY);
    pdf.text(moneyWithCurrency(0, doc.currency), valX, tY, { align: 'right' });
    tY += 18;
    pdf.text(t3, rightBoxX, tY);
    pdf.text(moneyWithCurrency(taxValue, doc.currency), valX, tY, { align: 'right' });
    tY += 26;
    pdf.text(t4, rightBoxX, tY);
    pdf.text(moneyWithCurrency(grandTotalValue, doc.currency), valX, tY, { align: 'right' });
    const footerY = pageHeight - 60;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(16);
    pdf.setTextColor(0, 0, 0);
    pdf.text('WE LOOK FORWARD TO YOUR BUSINESS!', pageWidth / 2, footerY, { align: 'center' });
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
  if (!skipEmail && !latest?.sealed_email_sent_at && isValidEmail(clientEmail)) {
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


