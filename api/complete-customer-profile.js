import { createClient } from '@supabase/supabase-js';
import { readJsonBody } from './service-documents/_shared.js';

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}

function isValidEmail(input) {
  const email = String(input || '').trim().toLowerCase();
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

  // Validate required fields
  const businessName = typeof body.businessName === 'string' ? body.businessName.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const address = typeof body.address === 'string' ? body.address.trim() : '';
  const city = typeof body.city === 'string' ? body.city.trim() : '';
  const state = typeof body.state === 'string' ? body.state.trim() : '';
  const zip = typeof body.zip === 'string' ? body.zip.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';

  if (!businessName) {
    return res.status(400).json({ ok: false, error: 'Business Name is required' });
  }
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ ok: false, error: 'A valid email is required' });
  }
  if (!address) {
    return res.status(400).json({ ok: false, error: 'Address is required' });
  }
  if (!city) {
    return res.status(400).json({ ok: false, error: 'City is required' });
  }
  if (!state) {
    return res.status(400).json({ ok: false, error: 'State is required' });
  }
  if (!zip) {
    return res.status(400).json({ ok: false, error: 'Zip is required' });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return res.status(500).json({ ok: false, error: 'Server misconfiguration' });
  }

  try {
    // 1. Find and validate the customer by token
    const { data: customer, error: findError } = await supabase
      .from('customers')
      .select('id, user_id, phone, profile_status, token_expiration, profile_completion_token')
      .eq('profile_completion_token', token)
      .maybeSingle();

    if (findError) {
      console.error('[complete-customer-profile] DB find error:', findError);
      throw new Error('Database error');
    }

    if (!customer) {
      return res.status(404).json({ ok: false, error: 'This link is invalid or has already been used.' });
    }

    // Check if already completed
    if (customer.profile_status !== 'pending') {
      return res.status(410).json({ ok: false, error: 'This profile has already been completed.' });
    }

    // Check expiration
    if (customer.token_expiration) {
      const expiration = new Date(customer.token_expiration);
      if (expiration < new Date()) {
        return res.status(410).json({ ok: false, error: 'This link has expired.' });
      }
    }

    // 2. Build combined address
    const addressParts = [
      address,
      [city, state, zip].filter(Boolean).join(', '),
    ].filter(Boolean);
    const combinedAddress = addressParts.join('\n');

    // 3. Update customer record
    const updatePayload = {
      name: businessName,
      email,
      address: combinedAddress,
      profile_status: 'active',
      profile_completion_token: null,  // invalidate token
      token_expiration: null,
      activated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // If phone was edited, update it too
    if (phone) {
      updatePayload.phone = phone;
    }

    const { data: updated, error: updateError } = await supabase
      .from('customers')
      .update(updatePayload)
      .eq('id', customer.id)
      .eq('profile_completion_token', token) // double-check token to prevent race conditions
      .select('id, name, email, phone, address, profile_status, activated_at')
      .single();

    if (updateError) {
      console.error('[complete-customer-profile] Update error:', updateError);
      throw new Error(updateError.message || 'Failed to update customer');
    }

    if (!updated) {
      return res.status(410).json({ ok: false, error: 'This link has already been used.' });
    }

    // 4. Log the activation
    try {
      await supabase.from('audit_logs').insert({
        user_id: customer.user_id,
        action: 'customer_profile_completed',
        entity: 'customer',
        entity_id: customer.id,
        details: {
          name: businessName,
          email,
          phone: phone || customer.phone,
          activated_at: updated.activated_at,
        },
      });
    } catch {
      // ignore audit log errors
    }

    return res.status(200).json({
      ok: true,
      customer: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unexpected error';
    console.error('[complete-customer-profile] Error:', msg);
    return res.status(500).json({ ok: false, error: msg });
  }
}
