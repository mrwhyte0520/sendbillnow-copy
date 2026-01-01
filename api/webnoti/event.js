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

function getSupabaseClient(accessToken) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) return null;
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

function buildNotification(event, userEmail) {
  const safeEmail = userEmail || 'usuario';
  switch (event) {
    case 'login':
      return {
        title: 'Inicio de sesión',
        message: `Se inició sesión en Sendbillnow (${safeEmail}).`,
        type: 'info',
        priority: 'normal',
      };
    case 'register':
      return {
        title: 'Cuenta creada',
        message: `Se creó una cuenta nueva en Sendbillnow (${safeEmail}).`,
        type: 'info',
        priority: 'normal',
      };
    case 'plan_purchase':
      return {
        title: 'Plan activado',
        message: `Se activó un plan en Sendbillnow (${safeEmail}).`,
        type: 'success',
        priority: 'high',
      };
    default:
      return {
        title: 'Evento',
        message: `Evento recibido: ${String(event || '').trim() || 'unknown'}`,
        type: 'info',
        priority: 'normal',
      };
  }
}

function getWebnotiApiKeys() {
  const raw = process.env.WEBNOTI_API_KEYS;
  if (raw && String(raw).trim()) {
    return String(raw)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const single = process.env.WEBNOTI_API_KEY;
  return single ? [String(single).trim()] : [];
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization, x-api-key');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const baseUrl = process.env.WEBNOTI_BASE_URL;
  const apiKeys = getWebnotiApiKeys();

  if (!baseUrl || apiKeys.length === 0) {
    return res.status(500).json({ ok: false, error: 'Missing WEBNOTI_BASE_URL or WEBNOTI_API_KEYS/WEBNOTI_API_KEY' });
  }

  const body = await readJsonBody(req);
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ ok: false, error: 'Invalid JSON' });
  }

  const accessToken = body.access_token;
  const event = body.event;
  const target = body.target || 'user';

  if (!accessToken || !event) {
    return res.status(400).json({ ok: false, error: 'Missing access_token or event' });
  }

  const supabase = getSupabaseClient(accessToken);
  if (!supabase) {
    return res.status(500).json({ ok: false, error: 'Missing SUPABASE_URL or SUPABASE_ANON_KEY' });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user?.id) {
    return res.status(401).json({ ok: false, error: 'Invalid access token' });
  }

  const userId = userData.user.id;
  const userEmail = userData.user.email || null;

  const defaults = buildNotification(event, userEmail);
  const title = body.title || defaults.title;
  const message = body.message || defaults.message;
  const type = body.type || defaults.type;
  const priority = body.priority || defaults.priority;
  const data = body.data;
  const expires_at = body.expires_at ?? null;

  let url;
  let payload;

  if (target === 'owner') {
    url = `${baseUrl.replace(/\/$/, '')}/api/v1/events`;
    payload = { title, message, type, priority, data, expires_at };
  } else if (target === 'broadcast') {
    url = `${baseUrl.replace(/\/$/, '')}/api/v1/broadcast`;
    payload = { title, message, type, priority, data, expires_at };
  } else {
    url = `${baseUrl.replace(/\/$/, '')}/api/v1/notifications`;
    payload = { user_id: userId, title, message, type, priority, data, expires_at };
  }

  const results = [];
  for (const apiKey of apiKeys) {
    const upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const text = await upstream.text();
    let upstreamData = text;
    try {
      upstreamData = JSON.parse(text);
    } catch {
      upstreamData = text;
    }

    results.push({ ok: upstream.ok, status: upstream.status, data: upstreamData });
  }

  const anyOk = results.some((r) => r.ok);
  if (!anyOk) {
    const first = results[0] || { status: 500, data: null };
    return res.status(first.status || 500).json({ ok: false, error: 'WebNotiCenter error', details: results });
  }

  return res.status(200).json({ ok: true, event, target, user_id: userId, results });
}
