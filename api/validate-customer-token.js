import { createClient } from '@supabase/supabase-js';
import { readJsonBody } from './service-documents/_shared.js';

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const body = await readJsonBody(req);
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ ok: false, error: 'Invalid JSON body' });
  }

  const token = typeof body.token === 'string' ? body.token.trim() : '';
  if (!token) {
    return res.status(400).json({ ok: false, error: 'Token is required' });
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(token)) {
    return res.status(400).json({ ok: false, error: 'Invalid token format' });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return res.status(500).json({ ok: false, error: 'Server misconfiguration' });
  }

  try {
    const { data: customer, error } = await supabase
      .from('customers')
      .select('id, phone, name, profile_status, token_expiration, profile_completion_token')
      .eq('profile_completion_token', token)
      .maybeSingle();

    if (error) {
      console.error('[validate-customer-token] DB error:', error);
      throw new Error('Database error');
    }

    if (!customer) {
      return res.status(404).json({ ok: false, error: 'This link is invalid or has already been used.' });
    }

    // Check if already completed
    if (customer.profile_status !== 'pending') {
      return res.status(410).json({ ok: false, error: 'This link has already been used.' });
    }

    // Check expiration
    if (customer.token_expiration) {
      const expiration = new Date(customer.token_expiration);
      if (expiration < new Date()) {
        return res.status(410).json({ ok: false, error: 'This link has expired.' });
      }
    }

    return res.status(200).json({
      ok: true,
      customer: {
        id: customer.id,
        phone: customer.phone,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unexpected error';
    console.error('[validate-customer-token] Error:', msg);
    return res.status(500).json({ ok: false, error: msg });
  }
}
