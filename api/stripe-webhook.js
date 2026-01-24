import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

function getSupabaseAdminClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

// Plan limits configuration
const PLAN_LIMITS = {
  'pos-basic': {
    max_users: 1,
    max_warehouses: 1,
    max_invoices: 2000,
  },
  'pos-premium': {
    max_users: 30,
    max_warehouses: -1, // -1 = unlimited
    max_invoices: 2000,
  },
  // Legacy plans
  'pyme': {
    max_users: 3,
    max_warehouses: 1,
    max_invoices: 500,
  },
  'pro': {
    max_users: 10,
    max_warehouses: 3,
    max_invoices: 2000,
  },
  'plus': {
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

async function activateUserPlan({ userId, email, planId, billingPeriod }) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  // Get plan limits based on planId
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
    return;
  }

  if (email) {
    const { error } = await supabase.from('users').update(patch).eq('email', email);
    if (error) throw new Error(error.message);
    return;
  }

  throw new Error('Missing userId/email for plan activation');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secretKey || !String(secretKey).trim()) {
    return res.status(500).json({ ok: false, error: 'Missing STRIPE_SECRET_KEY' });
  }
  if (!webhookSecret || !String(webhookSecret).trim()) {
    return res.status(500).json({ ok: false, error: 'Missing STRIPE_WEBHOOK_SECRET' });
  }

  const stripe = new Stripe(String(secretKey).trim(), {
    apiVersion: '2023-10-16',
  });

  const sig = req.headers['stripe-signature'];
  if (!sig) {
    return res.status(400).json({ ok: false, error: 'Missing stripe-signature header' });
  }

  const rawBody = Buffer.isBuffer(req.body)
    ? req.body
    : (typeof req.body === 'string' ? Buffer.from(req.body) : null);

  if (!rawBody) {
    return res.status(400).json({ ok: false, error: 'Invalid raw body' });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, String(sig), String(webhookSecret).trim());
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Invalid signature';
    return res.status(400).json({ ok: false, error: msg });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;

      const planId = session?.metadata?.planId ? String(session.metadata.planId) : '';
      const billingPeriod = session?.metadata?.billingPeriod ? String(session.metadata.billingPeriod) : 'monthly';
      const userId = session?.metadata?.userId
        ? String(session.metadata.userId)
        : (session?.client_reference_id ? String(session.client_reference_id) : '');
      const email = session?.customer_details?.email
        ? String(session.customer_details.email)
        : (session?.customer_email ? String(session.customer_email) : '');

      if (planId) {
        await activateUserPlan({ userId, email, planId, billingPeriod });
      }

      return res.status(200).json({ ok: true });
    }

    if (event.type === 'invoice.paid') {
      const invoice = event.data.object;
      const subscriptionId = invoice?.subscription ? String(invoice.subscription) : '';

      if (!subscriptionId) {
        return res.status(200).json({ ok: true });
      }

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);

      const planId = subscription?.metadata?.planId ? String(subscription.metadata.planId) : '';
      const billingPeriod = subscription?.metadata?.billingPeriod ? String(subscription.metadata.billingPeriod) : 'monthly';
      const userId = subscription?.metadata?.userId ? String(subscription.metadata.userId) : '';
      const email = subscription?.metadata?.userEmail ? String(subscription.metadata.userEmail) : '';

      if (planId) {
        await activateUserPlan({ userId, email, planId, billingPeriod });
      }

      return res.status(200).json({ ok: true });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Webhook handler error';
    return res.status(500).json({ ok: false, error: msg });
  }
}
