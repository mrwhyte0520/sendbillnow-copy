import { createClient } from '@supabase/supabase-js';

function getSupabaseAdminClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}

function safeErrorMessage(err) {
  try {
    if (!err) return 'Unknown error';
    if (typeof err === 'string') return err;
    if (err instanceof Error) return err.message || 'Error';
    return JSON.stringify(err);
  } catch {
    return 'Unknown error';
  }
}

async function computeIsAdmin(supabase, userId, userEmail) {
  try {
    const candidates = [userId, userEmail].filter(Boolean);
    if (candidates.length === 0) return false;

    const { data, error } = await supabase
      .from('user_roles')
      .select('id, roles!inner(name)')
      .in('user_id', candidates);

    if (error) return false;
    return Array.isArray(data) && data.some((r) => String(r?.roles?.name || '').toLowerCase() === 'admin');
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    console.error('[admin-verify] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return res.status(500).json({ success: false, error: 'Server misconfiguration.' });
  }

  const authHeader = String(req.headers.authorization || '');
  const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    return res.status(401).json({ success: false, error: 'Missing authorization token' });
  }

  try {
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user?.id) {
      if (userErr) console.error('[admin-verify] auth.getUser failed:', userErr);
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }

    const userId = userData.user.id;
    const userEmail = userData.user.email || null;

    const { data: profileRow, error: profileErr } = await supabase
      .from('users')
      .select('status')
      .eq('id', userId)
      .maybeSingle();

    if (profileErr) {
      console.error('[admin-verify] users status query failed:', profileErr);
    }

    const status = String(profileRow && profileRow.status ? profileRow.status : 'active');

    const isAdmin = await computeIsAdmin(supabase, userId, userEmail);

    return res.status(200).json({ success: true, isAdmin, status });
  } catch (err) {
    console.error('[admin-verify] Unexpected error:', err);
    const msg = safeErrorMessage(err);
    const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
    return res.status(500).json({ success: false, error: 'Unexpected server error.', detail: isProd ? undefined : msg });
  }
}
