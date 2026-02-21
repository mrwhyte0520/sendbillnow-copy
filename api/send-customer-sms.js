import crypto from 'node:crypto';
import { getBearerToken, getSupabaseClient, readJsonBody, requireUser, resolveTenantId, getBaseUrl } from './service-documents/_shared.js';

/**
 * Send SMS via Brevo Transactional SMS API.
 * Requires BREVO_API_KEY and BREVO_SMS_SENDER env vars.
 */
async function sendSmsViBrevo({ phone, message }) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.warn('[send-customer-sms] BREVO_API_KEY not configured – SMS not sent');
    console.log(`[send-customer-sms] Would send to ${phone}: ${message}`);
    return { sent: false, reason: 'BREVO_API_KEY not configured' };
  }

  const sender = process.env.BREVO_SMS_SENDER || 'SendBillNow';

  // Brevo expects phone in international format e.g. +18095551234
  // Strip dashes and add +1 prefix if not already present
  let recipient = phone.replace(/[\s\-()]/g, '');
  if (!recipient.startsWith('+')) {
    recipient = '+1' + recipient;
  }

  const payload = {
    type: 'transactional',
    sender: sender.substring(0, 11), // Brevo max 11 chars for sender
    recipient,
    content: message,
  };

  const response = await fetch('https://api.brevo.com/v3/transactionalSMS/sms', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    console.error('[send-customer-sms] Brevo SMS error:', response.status, text);
    throw new Error(`Brevo SMS failed (${response.status}): ${text}`);
  }

  const result = await response.json().catch(() => ({}));
  console.log('[send-customer-sms] SMS sent successfully:', result);
  return { sent: true, result };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  // Authenticate caller
  const accessToken = getBearerToken(req);
  if (!accessToken) {
    return res.status(401).json({ ok: false, error: 'Missing Authorization token' });
  }

  const supabase = getSupabaseClient(accessToken);
  if (!supabase) {
    return res.status(500).json({ ok: false, error: 'Missing SUPABASE_URL or SUPABASE_ANON_KEY' });
  }

  const { user, error: userError } = await requireUser(supabase);
  if (userError || !user?.id) {
    return res.status(401).json({ ok: false, error: userError || 'Unauthorized' });
  }

  const tenantId = await resolveTenantId(supabase, user);
  if (!tenantId) {
    return res.status(400).json({ ok: false, error: 'Could not resolve tenant' });
  }

  // Parse body
  const body = await readJsonBody(req);
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ ok: false, error: 'Invalid JSON body' });
  }

  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  if (!phone) {
    return res.status(400).json({ ok: false, error: 'Phone number is required' });
  }

  // Validate phone format (000-000-0000 or raw digits)
  const phoneDigits = phone.replace(/\D/g, '');
  if (phoneDigits.length < 10 || phoneDigits.length > 15) {
    return res.status(400).json({ ok: false, error: 'Invalid phone number' });
  }

  try {
    // Generate unique token and expiration (24 hours)
    const token = crypto.randomUUID();
    const tokenExpiration = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // Create customer record with phone only + pending status
    const payload = {
      user_id: tenantId,
      name: `Pending - ${phone}`,
      phone,
      email: '',
      document: '',
      address: '',
      credit_limit: 0,
      current_balance: 0,
      status: 'active',
      profile_status: 'pending',
      profile_completion_token: token,
      token_expiration: tokenExpiration,
    };

    const { data: customer, error: insertError } = await supabase
      .from('customers')
      .insert(payload)
      .select('id, phone, profile_completion_token')
      .single();

    if (insertError) {
      console.error('[send-customer-sms] Insert error:', insertError);
      throw new Error(insertError.message || 'Failed to create customer');
    }

    // Build the complete-profile URL
    const baseUrl = getBaseUrl(req);
    const completeProfileUrl = `${baseUrl}/complete-profile?token=${token}`;

    // Send SMS via Brevo
    const smsMessage = `Complete your information here: ${completeProfileUrl}`;

    let smsResult = { sent: false, reason: 'not attempted' };
    try {
      smsResult = await sendSmsViBrevo({ phone, message: smsMessage });
    } catch (smsError) {
      console.error('[send-customer-sms] SMS send error:', smsError);
      // Don't fail the whole operation if SMS fails – customer is already created
      smsResult = { sent: false, reason: smsError instanceof Error ? smsError.message : 'Unknown SMS error' };
    }

    // Log the action
    try {
      await supabase.from('audit_logs').insert({
        user_id: tenantId,
        action: 'customer_quick_add_sms',
        entity: 'customer',
        entity_id: customer.id,
        details: {
          phone,
          sms_sent: smsResult.sent,
          sms_reason: smsResult.reason || null,
          complete_profile_url: completeProfileUrl,
        },
      });
    } catch {
      // ignore audit log errors
    }

    return res.status(200).json({
      ok: true,
      customerId: customer.id,
      smsSent: smsResult.sent,
      smsError: smsResult.sent ? null : (smsResult.reason || null),
      completeProfileUrl,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unexpected error';
    console.error('[send-customer-sms] Error:', msg);
    return res.status(500).json({ ok: false, error: msg });
  }
}
