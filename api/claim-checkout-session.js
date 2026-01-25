import Stripe from 'stripe';
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

const PLAN_LIMITS = {
  'pos-basic': {
    max_users: 1,
    max_warehouses: 1,
    max_invoices: 2000,
  },
  'pos-premium': {
    max_users: 30,
    max_warehouses: -1,
    max_invoices: 2000,
  },
  pyme: {
    max_users: 3,
    max_warehouses: 1,
    max_invoices: 500,
  },
  pro: {
    max_users: 10,
    max_warehouses: 3,
    max_invoices: 2000,
  },
  plus: {
    max_users: 50,
    max_warehouses: -1,
    max_invoices: 5000,
  },
  'facturacion-simple': {
    max_users: 1,
    max_warehouses: 0,
    max_invoices: 500,
  },
  'facturacion-premium': {
    max_users: 5,
    max_warehouses: 0,
    max_invoices: 2000,
  },
};

function getPlanLimits(planId) {
  const normalizedPlanId = String(planId || '').toLowerCase().trim();
  return PLAN_LIMITS[normalizedPlanId] || {
    max_users: 1,
    max_warehouses: 1,
    max_invoices: 500,
  };
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

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey || !String(secretKey).trim()) {
    return res.status(500).json({ ok: false, error: 'Server misconfiguration (missing STRIPE_SECRET_KEY)' });
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return res.status(500).json({ ok: false, error: 'Server misconfiguration (missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)' });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return res.status(400).json({ ok: false, error: 'Invalid JSON body' });
  }

  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
  const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
  const userEmail = typeof body.userEmail === 'string' ? body.userEmail.trim().toLowerCase() : '';

  if (!sessionId) {
    return res.status(400).json({ ok: false, error: 'Missing sessionId' });
  }
  if (!userId && !userEmail) {
    return res.status(400).json({ ok: false, error: 'Missing userId/userEmail' });
  }

  const stripe = new Stripe(String(secretKey).trim(), { apiVersion: '2023-10-16' });

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session?.status !== 'complete') {
      return res.status(400).json({ ok: false, error: 'Checkout session is not complete' });
    }

    const planId = session?.metadata?.planId ? String(session.metadata.planId) : '';
    const billingPeriod = session?.metadata?.billingPeriod ? String(session.metadata.billingPeriod) : 'monthly';

    const sessionEmailRaw = session?.customer_details?.email || session?.customer_email || null;
    const sessionEmail = sessionEmailRaw ? String(sessionEmailRaw).toLowerCase() : '';

    if (!planId) {
      return res.status(400).json({ ok: false, error: 'No planId found in checkout metadata' });
    }

    if (userEmail && sessionEmail && userEmail !== sessionEmail) {
      return res.status(403).json({ ok: false, error: 'Email mismatch for checkout session' });
    }

    const limits = getPlanLimits(planId);

    const patch = {
      plan_id: planId,
      plan_status: 'active',
      trial_end: null,
      max_users: limits.max_users,
      max_warehouses: limits.max_warehouses,
      max_invoices: limits.max_invoices,
      billing_period: billingPeriod || 'monthly',
      updated_at: new Date().toISOString(),
    };

    if (userId) {
      const { error } = await supabase.from('users').update(patch).eq('id', userId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from('users').update(patch).eq('email', userEmail);
      if (error) throw new Error(error.message);
    }

    return res.status(200).json({ ok: true, planId });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unexpected error';
    return res.status(500).json({ ok: false, error: msg });
  }
}
