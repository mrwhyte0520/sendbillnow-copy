import { createClient } from '@supabase/supabase-js';

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }

  return await new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function getSupabaseAdminClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

function normalizeDeviceId(deviceId) {
  const s = typeof deviceId === 'string' ? deviceId.trim() : '';
  if (!s) return '';
  if (s.length > 128) return '';
  if (!/^[a-zA-Z0-9_-]+$/.test(s)) return '';
  return s;
}

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return res
      .status(500)
      .json({ ok: false, error: 'Server misconfiguration (missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)' });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return res.status(400).json({ ok: false, error: 'Invalid JSON body' });
  }

  const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
  const userEmail = normalizeEmail(body.userEmail);
  const deviceId = normalizeDeviceId(body.deviceId);
  const planId = 'student';
  const days = 15;

  if (!deviceId) {
    return res.status(400).json({ ok: false, error: 'Missing or invalid deviceId' });
  }
  if (!userId && !userEmail) {
    return res.status(400).json({ ok: false, error: 'Missing userId/userEmail' });
  }

  try {
    const { data: existing, error: existingErr } = await supabase
      .from('trial_device_claims')
      .select('device_id, first_user_id, first_user_email, plan_id, claimed_at, claim_count')
      .eq('device_id', deviceId)
      .maybeSingle();

    if (existingErr) throw new Error(existingErr.message);

    if (existing?.device_id) {
      return res.status(403).json({
        ok: false,
        error: 'This device has already claimed a free trial.',
        code: 'DEVICE_ALREADY_CLAIMED',
        meta: {
          claimed_at: existing.claimed_at,
          plan_id: existing.plan_id,
        },
      });
    }

    const now = new Date();
    const trialEnd = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const trialEndIso = trialEnd.toISOString();

    const patch = {
      plan_id: null,
      plan_status: 'inactive',
      trial_end: trialEndIso,
      trial_plan_id: planId,
      billing_period: 'annual',
      updated_at: now.toISOString(),
    };

    if (userId) {
      const { error: updErr } = await supabase.from('users').update(patch).eq('id', userId);
      if (updErr) throw new Error(updErr.message);
    } else {
      const { error: updErr } = await supabase.from('users').update(patch).eq('email', userEmail);
      if (updErr) throw new Error(updErr.message);
    }

    const { error: insErr } = await supabase.from('trial_device_claims').insert({
      device_id: deviceId,
      first_user_id: userId || null,
      first_user_email: userEmail || null,
      plan_id: planId,
      claimed_at: now.toISOString(),
      last_claimed_at: now.toISOString(),
      claim_count: 1,
    });
    if (insErr) throw new Error(insErr.message);

    return res.status(200).json({
      ok: true,
      trial_end: trialEndIso,
      trial_plan_id: planId,
      days,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unexpected error';
    return res.status(500).json({ ok: false, error: msg });
  }
}
