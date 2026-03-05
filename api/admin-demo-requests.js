import { createClient } from '@supabase/supabase-js';

function getSupabaseAdminClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

async function isAdminUser(supabase, userId, userEmail) {
  const candidates = [userId, userEmail].filter(Boolean);
  if (candidates.length === 0) return false;

  const { data, error } = await supabase
    .from('user_roles')
    .select('id, roles!inner(name)')
    .in('user_id', candidates);

  if (error) return false;
  return Array.isArray(data) && data.some((r) => String(r?.roles?.name || '').toLowerCase() === 'admin');
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
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }

    const userId = userData.user.id;
    const userEmail = userData.user.email || null;

    const isAdmin = await isAdminUser(supabase, userId, userEmail);
    if (!isAdmin) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const { data, error } = await supabase
      .from('demo_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ success: false, error: 'Failed to load demo requests' });
    }

    return res.status(200).json({ success: true, data: data || [] });
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Unexpected server error.' });
  }
}
