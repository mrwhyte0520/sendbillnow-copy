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

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return res.status(400).json({ ok: false, error: 'Invalid JSON body' });
  }

  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
  if (!sessionId) {
    return res.status(400).json({ ok: false, error: 'Missing sessionId' });
  }

  const stripe = new Stripe(String(secretKey).trim(), { apiVersion: '2023-10-16' });

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    return res.status(200).json({
      ok: true,
      session: {
        id: session.id,
        mode: session.mode,
        status: session.status,
        payment_status: session.payment_status,
        client_reference_id: session.client_reference_id,
        customer_email: session.customer_details?.email || session.customer_email || null,
        metadata: session.metadata || {},
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unexpected error';
    return res.status(500).json({ ok: false, error: msg });
  }
}
