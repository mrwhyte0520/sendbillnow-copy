import {
  getBearerToken,
  getSupabaseClient,
  requireUser,
  resolveTenantId,
} from './service-documents/_shared.js';

export function setJsonHeaders(res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
}

export function handleOptions(req, res, methods = 'GET, OPTIONS') {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', methods);
    return res.status(204).end();
  }
  return null;
}

export function ensureGet(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    res.status(405).json({ success: false, error: 'Method Not Allowed' });
    return false;
  }
  return true;
}

export async function getAuthedTenantContext(req) {
  const accessToken = getBearerToken(req);
  if (!accessToken) {
    return { error: { status: 401, body: { success: false, error: 'Missing bearer token' } } };
  }

  const supabase = getSupabaseClient(accessToken);
  if (!supabase) {
    return { error: { status: 500, body: { success: false, error: 'Supabase client is not configured' } } };
  }

  const userData = await requireUser(supabase);
  if (!userData.user?.id) {
    return { error: { status: 401, body: { success: false, error: userData.error || 'Invalid access token' } } };
  }

  const tenantId = await resolveTenantId(supabase, userData.user);
  if (!tenantId) {
    return { error: { status: 400, body: { success: false, error: 'Tenant not found' } } };
  }

  return { supabase, user: userData.user, tenantId };
}

export function sendApiError(res, error, fallbackMessage = 'Unexpected error') {
  const status = Number(error?.status || 500) || 500;
  const message = String(error?.message || error?.body?.error || fallbackMessage);
  return res.status(status).json({ success: false, error: message });
}
