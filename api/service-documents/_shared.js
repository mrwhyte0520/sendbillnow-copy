import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export async function readJsonBody(req) {
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (contentType.includes('application/json') && req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
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

export function getBaseUrl(req) {
  const env = process.env.PUBLIC_BASE_URL;
  if (env && String(env).trim()) {
    return String(env).trim().replace(/\/$/, '');
  }

  const proto = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (!host) return '';
  return `${proto}://${host}`;
}

export function getBearerToken(req) {
  const header = String(req.headers['authorization'] || '').trim();
  if (!header) return '';
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? String(m[1] || '').trim() : '';
}

export function getSupabaseClient(accessToken) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return null;

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
    global: {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    },
  });
}

export function getSupabaseAdminClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

export async function requireUser(supabase) {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user?.id) {
    return { user: null, error: 'Invalid access token' };
  }
  return { user: data.user, error: null };
}

export async function resolveTenantId(supabase, user) {
  const fallback = String(user?.id || '').trim();
  if (!fallback) return null;

  const { data } = await supabase
    .from('user_roles')
    .select('owner_user_id')
    .eq('user_id', fallback)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const ownerUserId = data && (data.owner_user_id || (data.owner_user_id === null ? null : data.owner_user_id));
  const tenant = ownerUserId ? String(ownerUserId) : fallback;
  return tenant || null;
}

export function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input || ''), 'utf8').digest('hex');
}

export function randomTokenRaw() {
  return crypto.randomBytes(32).toString('hex');
}

export function round2(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100) / 100;
}

export function normalizeTaxRate(input) {
  const raw = Number(input ?? 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return raw > 1 ? raw / 100 : raw;
}

export function parseBase64Image(input) {
  const raw = String(input || '').trim();
  if (!raw) return { base64: '', contentType: 'image/png' };

  const m = raw.match(/^data:([^;]+);base64,(.+)$/i);
  if (m) {
    return { contentType: String(m[1] || 'image/png').trim(), base64: String(m[2] || '').trim() };
  }

  return { base64: raw, contentType: 'image/png' };
}

export function getClientIp(req) {
  const xf = String(req.headers['x-forwarded-for'] || '').trim();
  if (xf) {
    const first = xf.split(',')[0];
    return String(first || '').trim() || null;
  }

  const realIp = String(req.headers['x-real-ip'] || '').trim();
  return realIp || null;
}

export async function recalcTotals({ supabase, tenantId, documentId }) {
  const { data: doc, error: docError } = await supabase
    .from('service_documents')
    .select('id, user_id, tax_rate, status, material_cost')
    .eq('id', documentId)
    .eq('user_id', tenantId)
    .maybeSingle();

  if (docError) throw docError;
  if (!doc?.id) throw new Error('Document not found');

  const { data: lines, error: linesError } = await supabase
    .from('service_document_lines')
    .select('id, description, quantity, unit_price, taxable')
    .eq('document_id', documentId)
    .eq('user_id', tenantId);

  if (linesError) throw linesError;

  const safeLines = Array.isArray(lines) ? lines : [];

  const lineUpdates = [];
  let subtotal = 0;
  let taxableSubtotal = 0;

  for (const l of safeLines) {
    const qty = Number(l?.quantity ?? 0);
    const unit = Number(l?.unit_price ?? 0);
    const computed = round2((Number.isFinite(qty) ? qty : 0) * (Number.isFinite(unit) ? unit : 0));

    subtotal = round2(subtotal + computed);
    if (l?.taxable !== false) {
      taxableSubtotal = round2(taxableSubtotal + computed);
    }

    if (l?.id) {
      // IMPORTANT: Postgres validates NOT NULL constraints on the proposed INSERT row
      // before applying ON CONFLICT DO UPDATE. Include `description` to avoid
      // violating service_document_lines.description NOT NULL.
      lineUpdates.push({
        id: l.id,
        user_id: tenantId,
        document_id: documentId,
        description: String(l?.description ?? ''),
        line_total: computed,
      });
    }
  }

  if (lineUpdates.length) {
    const { error: upError } = await supabase
      .from('service_document_lines')
      .upsert(lineUpdates, { onConflict: 'id' });

    if (upError) throw upError;
  }

  const safeRate = normalizeTaxRate(doc.tax_rate);
  const tax = round2(taxableSubtotal * safeRate);
  const materialCost = round2(Number(doc.material_cost ?? 0));
  const total = round2(subtotal + tax + materialCost);

  const { data: updated, error: updError } = await supabase
    .from('service_documents')
    .update({ subtotal, tax, total })
    .eq('id', documentId)
    .eq('user_id', tenantId)
    .select('id, doc_type, status, doc_number, currency, client_name, client_email, client_phone, client_address, terms_snapshot, tax_rate, subtotal, tax, total, material_cost, sent_at, viewed_at, client_signed_at, created_at, updated_at')
    .maybeSingle();

  if (updError) throw updError;

  return updated;
}

export async function insertEvent({ supabase, tenantId, documentId, eventType, meta }) {
  await supabase.from('service_document_events').insert({
    user_id: tenantId,
    document_id: documentId,
    event_type: eventType,
    meta: meta && typeof meta === 'object' ? meta : {},
  });
}
