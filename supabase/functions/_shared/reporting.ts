import { Buffer } from 'node:buffer';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export type ReportKind = 'monthly' | 'yearly';

export interface ReportCustomer {
  id: string;
  name: string;
  email: string;
  raw: Record<string, unknown>;
}

export interface ReportInvoiceLine {
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  discount: number;
  serviceDate: string;
  raw: Record<string, unknown>;
}

export interface ReportInvoice {
  id: string;
  userId: string;
  customerId: string;
  invoiceNumber: string;
  invoiceDate: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  invoiceDiscount: number;
  status: string;
  customer: ReportCustomer;
  lines: ReportInvoiceLine[];
  raw: Record<string, unknown>;
}

export interface CompanyBranding {
  name: string;
  email: string;
  phone: string;
  address: string;
  logo: string;
}

export interface DateRange {
  start: string;
  end: string;
  label: string;
  year: number;
}

export function createServiceRoleClient() {
  const supabaseUrl = readEnv('SUPABASE_URL') ?? readEnv('SUPABASE_PROJECT_URL') ?? '';
  const serviceRoleKey = readEnv('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function getPreviousMonthRange(now = new Date()): DateRange {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const label = start.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    label,
    year: start.getUTCFullYear(),
  };
}

export function getPreviousYearRange(now = new Date()): DateRange {
  const year = now.getUTCFullYear() - 1;
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year + 1, 0, 1));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    label: String(year),
    year,
  };
}

export async function fetchCompanyBranding(supabase: SupabaseClient, userId: string): Promise<CompanyBranding> {
  const { data } = await supabase
    .from('company_info')
    .select('*')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  return {
    name: String((data as any)?.name || (data as any)?.company_name || 'SendBillNow').trim() || 'SendBillNow',
    email: String((data as any)?.email || '').trim(),
    phone: String((data as any)?.phone || '').trim(),
    address: String((data as any)?.address || '').trim(),
    logo: String((data as any)?.logo || '').trim(),
  };
}

export async function fetchInvoicesInRange(supabase: SupabaseClient, range: DateRange) {
  const invoices: ReportInvoice[] = [];
  const pageSize = 250;

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from('invoices')
      .select(`
        *,
        customers (*),
        invoice_lines (*)
      `)
      .gte('invoice_date', range.start)
      .lt('invoice_date', range.end)
      .order('invoice_date', { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(`Failed to fetch invoices: ${error.message}`);
    }

    const rows = (data || []) as Array<Record<string, unknown>>;
    invoices.push(...rows.map(normalizeInvoice).filter(Boolean) as ReportInvoice[]);

    if (rows.length < pageSize) {
      break;
    }
  }

  return invoices.filter((invoice) => {
    const status = invoice.status.toLowerCase();
    return status !== 'cancelled' && status !== 'cancelada' && status !== 'draft';
  });
}

function normalizeInvoice(input: Record<string, unknown>): ReportInvoice | null {
  const userId = String(input.user_id || '').trim();
  const customerRaw = (input.customers as Record<string, unknown> | null) || null;
  const customerId = String(input.customer_id || customerRaw?.id || '').trim();
  const customerEmail = resolveCustomerEmail(customerRaw || {});
  if (!userId || !customerId || !customerEmail) {
    return null;
  }

  const customer: ReportCustomer = {
    id: customerId,
    name: String(customerRaw?.name || 'Customer').trim() || 'Customer',
    email: customerEmail,
    raw: customerRaw || {},
  };

  const lines = Array.isArray(input.invoice_lines)
    ? input.invoice_lines.map((line) => normalizeInvoiceLine(line as Record<string, unknown>, input)).filter(Boolean) as ReportInvoiceLine[]
    : [];

  return {
    id: String(input.id || '').trim(),
    userId,
    customerId,
    invoiceNumber: String(input.invoice_number || input.id || '').trim(),
    invoiceDate: String(input.invoice_date || input.created_at || '').trim(),
    subtotal: toNumber(input.subtotal),
    taxAmount: toNumber(input.tax_amount),
    totalAmount: toNumber(input.total_amount) || Number((toNumber(input.subtotal) + toNumber(input.tax_amount)).toFixed(2)),
    invoiceDiscount: getInvoiceDiscount(input),
    status: String(input.status || '').trim(),
    customer,
    lines,
    raw: input,
  };
}

function normalizeInvoiceLine(line: Record<string, unknown>, invoice: Record<string, unknown>): ReportInvoiceLine | null {
  const description = String(line.description || line.service_name || line.name || 'Service').trim();
  if (!description) return null;

  return {
    description,
    quantity: toNumber(line.quantity) || 1,
    unitPrice: toNumber(line.unit_price),
    lineTotal: toNumber(line.line_total) || Number(((toNumber(line.quantity) || 1) * toNumber(line.unit_price)).toFixed(2)),
    discount: getLineDiscount(line),
    serviceDate: String(line.service_date || line.date_of_service || invoice.invoice_date || invoice.created_at || '').trim(),
    raw: line,
  };
}

export function groupInvoicesByCustomer(invoices: ReportInvoice[]) {
  const groups = new Map<string, { customer: ReportCustomer; userId: string; invoices: ReportInvoice[] }>();

  for (const invoice of invoices) {
    const key = `${invoice.userId}::${invoice.customerId}`;
    const current = groups.get(key);
    if (current) {
      current.invoices.push(invoice);
      continue;
    }
    groups.set(key, {
      customer: invoice.customer,
      userId: invoice.userId,
      invoices: [invoice],
    });
  }

  return Array.from(groups.values());
}

export async function sendEmailWithPdf(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
  pdfBytes: Uint8Array;
  filename: string;
}) {
  const resendApiKey = readEnv('RESEND_API_KEY') ?? '';
  if (!resendApiKey) {
    throw new Error('Missing RESEND_API_KEY environment variable.');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'info@sendbillnow.com',
      to: [params.to],
      subject: params.subject,
      html: params.html,
      text: params.text,
      attachments: [
        {
          filename: params.filename,
          content: toBase64(params.pdfBytes),
        },
      ],
    }),
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`Failed to send email via Resend: ${payload}`);
  }

  return response.json().catch(() => null);
}

export async function buildMonthlyStatementPdf(params: {
  company: CompanyBranding;
  customer: ReportCustomer;
  invoices: ReportInvoice[];
  periodLabel: string;
}) {
  const rows = params.invoices.flatMap((invoice) => {
    if (invoice.lines.length === 0) {
      return [{
        invoiceNumber: invoice.invoiceNumber,
        date: invoice.invoiceDate,
        description: 'Invoice summary',
        quantity: 1,
        unitPrice: invoice.subtotal,
        discount: invoice.invoiceDiscount,
        total: invoice.totalAmount,
      }];
    }

    return invoice.lines.map((line) => ({
      invoiceNumber: invoice.invoiceNumber,
      date: line.serviceDate || invoice.invoiceDate,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discount: line.discount,
      total: line.lineTotal,
    }));
  });

  const subtotal = sum(params.invoices.map((invoice) => invoice.subtotal));
  const salesTax = sum(params.invoices.map((invoice) => invoice.taxAmount));
  const grandTotal = sum(params.invoices.map((invoice) => invoice.totalAmount));
  const discountTotal = sum(params.invoices.map((invoice) => invoice.invoiceDiscount || sum(invoice.lines.map((line) => line.discount))));

  return renderPdfDocument({
    title: 'Monthly Statement',
    subtitle: params.periodLabel,
    company: params.company,
    customerName: params.customer.name,
    summaryRows: [
      ['Business Name', params.company.name],
      ['Customer', params.customer.name],
      ['Period', params.periodLabel],
      ['Invoices', String(params.invoices.length)],
    ],
    tableHeaders: ['DATE OF SERVICE', 'DESCRIPTION', 'QTY', 'PRICE', 'DISCOUNT', 'TOTAL'],
    tableRows: rows.map((row) => [
      formatDate(row.date),
      `${row.invoiceNumber} · ${row.description}`,
      formatQty(row.quantity),
      formatMoney(row.unitPrice),
      formatMoney(row.discount),
      formatMoney(row.total),
    ]),
    totals: [
      ['TOTAL', subtotal],
      ['DISCOUNT', discountTotal],
      ['SALES TAX', salesTax],
      ['GRAND TOTAL', grandTotal],
    ],
  });
}

export async function buildYearlySummaryPdf(params: {
  company: CompanyBranding;
  customer: ReportCustomer;
  invoices: ReportInvoice[];
  periodLabel: string;
}) {
  const totalInvoices = params.invoices.length;
  const totalSpent = sum(params.invoices.map((invoice) => invoice.totalAmount));
  const averageInvoice = totalInvoices > 0 ? totalSpent / totalInvoices : 0;
  const serviceTotals = new Map<string, number>();

  for (const invoice of params.invoices) {
    for (const line of invoice.lines) {
      const key = line.description || 'Service';
      serviceTotals.set(key, (serviceTotals.get(key) || 0) + line.quantity);
    }
  }

  const mostPurchasedService = Array.from(serviceTotals.entries())
    .sort((left, right) => right[1] - left[1])[0]?.[0] || 'N/A';

  const invoiceRows = params.invoices.map((invoice) => [
    formatDate(invoice.invoiceDate),
    invoice.invoiceNumber,
    formatMoney(invoice.subtotal),
    formatMoney(invoice.taxAmount),
    formatMoney(invoice.totalAmount),
  ]);

  return renderPdfDocument({
    title: 'Annual Invoice Summary',
    subtitle: params.periodLabel,
    company: params.company,
    customerName: params.customer.name,
    summaryRows: [
      ['Business Name', params.company.name],
      ['Customer', params.customer.name],
      ['Year', params.periodLabel],
      ['Total invoices', String(totalInvoices)],
      ['Total spent', formatMoney(totalSpent)],
      ['Average invoice', formatMoney(averageInvoice)],
      ['Most purchased service', mostPurchasedService],
    ],
    tableHeaders: ['DATE OF SERVICE', 'DESCRIPTION', 'TOTAL', 'SALES TAX', 'GRAND TOTAL'],
    tableRows: invoiceRows,
    totals: [
      ['TOTAL INVOICES', totalInvoices],
      ['TOTAL SPENT', totalSpent],
      ['AVERAGE INVOICE', averageInvoice],
    ],
  });
}

async function renderPdfDocument(params: {
  title: string;
  subtitle: string;
  company: CompanyBranding;
  customerName: string;
  summaryRows: Array<[string, string]>;
  tableHeaders: string[];
  tableRows: string[][];
  totals: Array<[string, number]>;
}) {
  const lines = buildPdfTextLines(params);
  return buildSimplePdf(lines);
}

function buildPdfTextLines(params: {
  title: string;
  subtitle: string;
  company: CompanyBranding;
  customerName: string;
  summaryRows: Array<[string, string]>;
  tableHeaders: string[];
  tableRows: string[][];
  totals: Array<[string, number]>;
}) {
  const lines: string[] = [];
  lines.push(params.company.name || 'SendBillNow');
  lines.push(params.title);
  lines.push(params.subtitle);
  lines.push(`Customer: ${params.customerName}`);
  lines.push(' ');

  for (const [label, value] of params.summaryRows) {
    lines.push(`${label}: ${value}`);
  }

  lines.push(' ');
  lines.push(params.tableHeaders.join(' | '));
  lines.push('-'.repeat(110));

  if (params.tableRows.length === 0) {
    lines.push('No invoices found for this period.');
  } else {
    for (const row of params.tableRows) {
      lines.push(row.map((cell) => truncateText(cell, 28)).join(' | '));
    }
  }

  lines.push(' ');
  for (const [label, value] of params.totals) {
    lines.push(`${label}: ${typeof value === 'number' ? formatMoney(value) : String(value)}`);
  }

  return lines;
}

function buildSimplePdf(lines: string[]) {
  const pageWidth = 612;
  const pageHeight = 792;
  const fontSize = 10;
  const lineHeight = 14;
  const marginTop = 48;
  const marginBottom = 48;
  const linesPerPage = Math.max(1, Math.floor((pageHeight - marginTop - marginBottom) / lineHeight));
  const pages: string[][] = [];

  for (let index = 0; index < lines.length; index += linesPerPage) {
    pages.push(lines.slice(index, index + linesPerPage));
  }

  if (pages.length === 0) {
    pages.push(['SendBillNow']);
  }

  const objects: string[] = [];
  const pageObjectIds: number[] = [];
  const contentObjectIds: number[] = [];
  const totalObjects = 3 + pages.length * 2;

  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';

  let nextId = 3;
  for (let i = 0; i < pages.length; i += 1) {
    pageObjectIds.push(nextId);
    contentObjectIds.push(nextId + 1);
    nextId += 2;
  }

  objects[2] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const pageId = pageObjectIds[pageIndex];
    const contentId = contentObjectIds[pageIndex];
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${totalObjects} 0 R >> >> /Contents ${contentId} 0 R >>`;

    const commands: string[] = ['BT', `/F1 ${fontSize} Tf`, '0 g'];
    let y = pageHeight - marginTop;
    for (const line of pages[pageIndex]) {
      commands.push(`1 0 0 1 40 ${y} Tm (${escapePdfText(line)}) Tj`);
      y -= lineHeight;
    }
    commands.push('ET');
    const stream = commands.join('\n');
    objects[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  }

  objects[totalObjects] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];

  for (let id = 1; id <= totalObjects; id += 1) {
    offsets[id] = pdf.length;
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${totalObjects + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let id = 1; id <= totalObjects; id += 1) {
    pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return new TextEncoder().encode(pdf);
}

function resolveCustomerEmail(customer: Record<string, unknown>) {
  return String(customer.email || customer.contact_email || '').trim();
}

function getInvoiceDiscount(invoice: Record<string, unknown>) {
  return toNumber(
    invoice.discount_amount
    ?? invoice.discount_total
    ?? invoice.total_discount
    ?? invoice.discount
    ?? 0,
  );
}

function getLineDiscount(line: Record<string, unknown>) {
  return toNumber(
    line.discount_amount
    ?? line.discount_total
    ?? line.discount
    ?? line.line_discount
    ?? 0,
  );
}

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sum(values: number[]) {
  return Number(values.reduce((acc, value) => acc + (Number.isFinite(value) ? value : 0), 0).toFixed(2));
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatDate(value: string) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return value || '-';
  return date.toLocaleDateString('en-US', { timeZone: 'UTC' });
}

function formatQty(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function truncateText(value: string, length: number) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= length) return text;
  return `${text.slice(0, Math.max(0, length - 3))}...`;
}

export function sanitizeFileName(value: string) {
  return String(value || 'report').replace(/[^a-z0-9-_]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

function toBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function readEnv(key: string) {
  const runtime = globalThis as typeof globalThis & {
    Deno?: {
      env?: {
        get?: (name: string) => string | undefined;
      };
    };
  };

  return runtime.Deno?.env?.get?.(key);
}

function escapePdfText(value: string) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\r/g, ' ')
    .replace(/\n/g, ' ');
}
