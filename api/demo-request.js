import { createClient } from '@supabase/supabase-js';

async function readJsonBody(req) {
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (contentType.includes('application/json') && req.body && typeof req.body === 'object') {
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

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim();
  }
  const xrip = req.headers['x-real-ip'];
  if (typeof xrip === 'string' && xrip.trim()) return xrip.trim();
  return req.socket?.remoteAddress || 'unknown';
}

function normalizeString(value, maxLen) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function normalizeEmail(value) {
  const raw = normalizeString(value, 254);
  return raw ? raw.toLowerCase() : null;
}

function isValidEmail(email) {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getSupabaseAdminClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;
const rateBucket = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const arr = rateBucket.get(ip) || [];
  const next = arr.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (next.length >= RATE_LIMIT_MAX) {
    rateBucket.set(ip, next);
    return { ok: false, retryAfterSeconds: Math.ceil((RATE_LIMIT_WINDOW_MS - (now - next[0])) / 1000) };
  }
  next.push(now);
  rateBucket.set(ip, next);
  return { ok: true, retryAfterSeconds: 0 };
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
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const ip = getClientIp(req);
  const rl = checkRateLimit(ip);
  if (!rl.ok) {
    res.setHeader('Retry-After', String(rl.retryAfterSeconds));
    return res.status(429).json({ success: false, error: 'Too many requests. Please try again shortly.' });
  }

  const body = await readJsonBody(req);
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ success: false, error: 'Invalid JSON body' });
  }

  const honeypot = normalizeString(body.honeypot ?? body.website ?? body.hp, 200);
  if (honeypot) {
    return res.status(400).json({ success: false, error: 'Invalid request' });
  }

  const full_name = normalizeString(body.full_name, 140);
  const email = normalizeEmail(body.email);
  const phone = normalizeString(body.phone, 60);
  const business_name = normalizeString(body.business_name, 160);
  const location = normalizeString(body.location, 140);
  const business_type = normalizeString(body.business_type, 80);
  const description = normalizeString(body.description, 200);
  const message = normalizeString(body.message, 2000);

  if (!full_name) return res.status(400).json({ success: false, error: 'Full name is required.' });
  if (!email) return res.status(400).json({ success: false, error: 'Email is required.' });
  if (!isValidEmail(email)) return res.status(400).json({ success: false, error: 'Invalid email.' });
  if (!phone) return res.status(400).json({ success: false, error: 'Phone is required.' });
  if (!business_type) return res.status(400).json({ success: false, error: 'Business type is required.' });

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return res.status(500).json({ success: false, error: 'Server misconfiguration.' });
  }

  try {
    const { error } = await supabase.from('demo_requests').insert({
      full_name,
      email,
      phone,
      business_name,
      location,
      business_type,
      description,
      message,
      status: 'pending',
    });

    if (error) {
      return res.status(500).json({ success: false, error: 'Could not save request. Please try again.' });
    }

    return res.status(200).json({ success: true });
  } catch {
    return res.status(500).json({ success: false, error: 'Unexpected server error.' });
  }
}
