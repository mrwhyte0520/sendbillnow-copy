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

async function activateUserPlan({ userId, email, planId }) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  const patch = {
    plan_id: planId,
    plan_status: 'active',
    trial_end: null,
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
      const userId = session?.metadata?.userId
        ? String(session.metadata.userId)
        : (session?.client_reference_id ? String(session.client_reference_id) : '');
      const email = session?.customer_details?.email
        ? String(session.customer_details.email)
        : (session?.customer_email ? String(session.customer_email) : '');

      if (planId) {
        await activateUserPlan({ userId, email, planId });
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
      const userId = subscription?.metadata?.userId ? String(subscription.metadata.userId) : '';
      const email = subscription?.metadata?.userEmail ? String(subscription.metadata.userEmail) : '';

      if (planId) {
        await activateUserPlan({ userId, email, planId });
      }

      return res.status(200).json({ ok: true });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Webhook handler error';
    return res.status(500).json({ ok: false, error: msg });
  }
}
