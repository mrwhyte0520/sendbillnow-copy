import Stripe from 'stripe';

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

function getBaseUrl(req) {
  const env = process.env.PUBLIC_BASE_URL;
  if (env && String(env).trim()) {
    return String(env).trim().replace(/\/$/, '');
  }

  const proto = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (!host) return '';
  return `${proto}://${host}`;
}

const PLAN_PRICES_MONTHLY = {
  pyme: 3999,
  pro: 9999,
  plus: 19999,
  'facturacion-simple': 1999,
  'facturacion-premium': 4999,
  'pos-basic': 9999,
  'pos-premium': 39999,
};

const PLAN_PRICES_ANNUAL = {
  pyme: 23988,
  pro: 71988,
  plus: 155988,
  'facturacion-simple': 10788,
  'facturacion-premium': 23988,
  'pos-basic': 83992,
  'pos-premium': 335992,
  student: 8500,
};

const PLAN_NAMES = {
  pyme: 'PYME',
  pro: 'PRO',
  plus: 'PLUS',
  'facturacion-simple': 'Facturación Simple',
  'facturacion-premium': 'Facturación Premium',
  'pos-basic': 'POS Basic',
  'pos-premium': 'POS Premium',
  student: 'Contractor Plan',
};

function normalizePlanIdForEnv(planId) {
  return String(planId || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function getStripePriceId(planId, billingPeriod) {
  const pid = normalizePlanIdForEnv(planId);
  const period = String(billingPeriod || 'monthly').toUpperCase();
  const key = `STRIPE_PRICE_ID_${pid}_${period}`;
  const value = process.env[key];
  return value && String(value).trim() ? String(value).trim() : '';
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

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return res.status(400).json({ ok: false, error: 'Invalid JSON body' });
  }

  const planId = typeof body.planId === 'string' ? body.planId.trim() : '';
  const billingPeriod = body.billingPeriod === 'annual' ? 'annual' : 'monthly';
  const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
  const userEmail = typeof body.userEmail === 'string' ? body.userEmail.trim() : '';
  const refCode = typeof body.refCode === 'string' ? body.refCode.trim() : '';

  if (!planId) {
    return res.status(400).json({ ok: false, error: 'Missing planId' });
  }

  if (planId === 'student' && billingPeriod !== 'annual') {
    return res.status(400).json({ ok: false, error: 'Student plan is annual-only' });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey || !String(secretKey).trim()) {
    return res.status(500).json({ ok: false, error: 'Server misconfiguration (missing STRIPE_SECRET_KEY)' });
  }

  const unitAmount = billingPeriod === 'annual'
    ? PLAN_PRICES_ANNUAL[planId]
    : PLAN_PRICES_MONTHLY[planId];

  if (!unitAmount) {
    return res.status(400).json({ ok: false, error: 'Unknown planId' });
  }

  const planName = PLAN_NAMES[planId] || planId;
  const stripe = new Stripe(String(secretKey).trim(), { apiVersion: '2023-10-16' });

  try {
    const baseUrl = getBaseUrl(req);
    if (!baseUrl) {
      return res.status(500).json({ ok: false, error: 'Could not determine PUBLIC_BASE_URL' });
    }

    const interval = billingPeriod === 'annual' ? 'year' : 'month';
    const priceId = getStripePriceId(planId, billingPeriod);

    const subscriptionMetadata = {
      planId,
      billingPeriod,
      ...(userId && { userId }),
      ...(userEmail && { userEmail }),
      ...(refCode && { refCode }),
    };

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      ...(userEmail && { customer_email: userEmail }),
      ...(userId && { client_reference_id: userId }),
      line_items: [
        priceId
          ? { quantity: 1, price: priceId }
          : {
              quantity: 1,
              price_data: {
                currency: 'usd',
                unit_amount: unitAmount,
                recurring: { interval },
                product_data: { name: `Sendbillnow - ${planName}` },
              },
            },
      ],
      success_url: userId 
        ? `${baseUrl}/plans?checkout=success&session_id={CHECKOUT_SESSION_ID}`
        : `${baseUrl}/auth/register?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: userId 
        ? `${baseUrl}/plans?checkout=cancel`
        : `${baseUrl}/?checkout=cancel`,
      metadata: subscriptionMetadata,
      subscription_data: {
        metadata: subscriptionMetadata,
      },
    });

    return res.status(200).json({ ok: true, url: session.url, sessionId: session.id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unexpected error';
    return res.status(500).json({ ok: false, error: msg });
  }
}
