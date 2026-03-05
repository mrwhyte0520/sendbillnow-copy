import { createClient } from '@supabase/supabase-js';

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < 10; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

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

function getSupabaseAdminClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

async function isAdminUser(supabase, userId, userEmail) {
  const candidates = [userId, userEmail].filter(Boolean);
  if (candidates.length === 0) return false;

  const { data, error } = await supabase
    .from('user_roles')
    .select('id, roles!inner(name)')
    .in('user_id', candidates);

  if (error) return false;
  return Array.isArray(data) && data.some((r) => String(r?.roles?.name || '').toLowerCase() === 'admin');
}

async function sendCredentialsEmail(email, fullName, password, trialDays) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const resendFrom = (process.env.RESEND_FROM && String(process.env.RESEND_FROM).trim())
    ? String(process.env.RESEND_FROM).trim()
    : 'Send Bill Now <onboarding@resend.dev>';
  const resendReplyTo = (process.env.RESEND_REPLY_TO && String(process.env.RESEND_REPLY_TO).trim())
    ? String(process.env.RESEND_REPLY_TO).trim()
    : null;
  const publicBaseUrl = (process.env.PUBLIC_BASE_URL && String(process.env.PUBLIC_BASE_URL).trim())
    ? String(process.env.PUBLIC_BASE_URL).trim().replace(/\/$/, '')
    : 'https://sendbillnow.com';

  if (resendApiKey) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: resendFrom,
        to: [email],
        ...(resendReplyTo ? { reply_to: resendReplyTo } : {}),
        subject: 'Welcome to Send Bill Now - Your Account is Ready!',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #008000, #006600); padding: 30px; border-radius: 16px 16px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to Send Bill Now!</h1>
            </div>
            <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 16px 16px;">
              <p style="font-size: 16px; color: #333;">Hello <strong>${fullName || 'there'}</strong>,</p>
              <p style="font-size: 16px; color: #333;">Your request has been received and your account is now active and ready to use.</p>

              <div style="background: #f8f8f8; border: 2px solid #008000; border-radius: 12px; padding: 20px; margin: 20px 0;">
                <h3 style="color: #008000; margin-top: 0;">Your Login Credentials</h3>
                <p style="margin: 10px 0;"><strong>Email:</strong> ${email}</p>
                <p style="margin: 10px 0;"><strong>Password:</strong> <code style="background: #e8e8e8; padding: 4px 8px; border-radius: 4px;">${password}</code></p>
                <p style="margin: 10px 0;"><strong>Trial Period:</strong> ${trialDays} days</p>
              </div>

              <p style="font-size: 14px; color: #666;">For security, we recommend changing your password after your first login.</p>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${publicBaseUrl}/auth/login" style="background: #008000; color: white; padding: 14px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                  Login to Your Account
                </a>
              </div>

              <p style="font-size: 14px; color: #666;">If you have any questions, reply to this email and we'll be happy to help!</p>

              <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
              <p style="font-size: 12px; color: #999; text-align: center;">
                © ${new Date().getFullYear()} Send Bill Now. All rights reserved.
              </p>
            </div>
          </div>
        `
      })
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      let errorData = null;
      try {
        errorData = errorText ? JSON.parse(errorText) : null;
      } catch {
        errorData = errorText;
      }
      throw new Error((errorData && errorData.message) || 'Failed to send email via Resend');
    }

    return true;
  }

  console.log('=== EMAIL CREDENTIALS (No email service configured) ===');
  console.log(`To: ${email}`);
  console.log(`Name: ${fullName}`);
  console.log(`Password: ${password}`);
  console.log(`Trial: ${trialDays} days`);
  console.log('========================================================');

  return true;
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
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    console.error('admin-confirm-demo: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return res.status(500).json({ success: false, error: 'Server misconfiguration.' });
  }

  const authHeader = String(req.headers.authorization || '');
  const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    return res.status(401).json({ success: false, error: 'Missing authorization token' });
  }

  const body = await readJsonBody(req);
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ success: false, error: 'Invalid JSON body' });
  }

  const requestId = body.requestId;
  if (!requestId) {
    return res.status(400).json({ success: false, error: 'Missing requestId' });
  }

  try {
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user?.id) {
      if (userErr) console.error('admin-confirm-demo: auth.getUser failed:', userErr);
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }

    const userId = userData.user.id;
    const userEmail = userData.user.email || null;

    const adminOk = await isAdminUser(supabase, userId, userEmail);
    if (!adminOk) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const { data: reqRow, error: reqErr } = await supabase
      .from('demo_requests')
      .select('*')
      .eq('id', requestId)
      .maybeSingle();

    if (reqErr || !reqRow?.email) {
      if (reqErr) console.error('admin-confirm-demo: failed loading demo request:', reqErr);
      return res.status(404).json({ success: false, error: 'Demo request not found' });
    }

    const now = new Date();
    const email = String(reqRow.email).toLowerCase();
    const fullName = reqRow.full_name || '';
    const businessName = reqRow.business_name || '';

    const trialDays = typeof body.trialDays === 'number' ? body.trialDays : (reqRow.trial_days || 15);
    const password = generatePassword();

    let targetUserId = null;
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        company: businessName,
      },
    });

    if (authError) {
      const msg = String(authError.message || '').toLowerCase();
      const alreadyExists = msg.includes('already') || msg.includes('exists');

      if (!alreadyExists) {
        console.error('admin-confirm-demo: createUser failed:', authError);
        return res.status(500).json({ success: false, error: authError.message || 'Failed to create user account.' });
      }

      const { data: existingProfile, error: existingProfileErr } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .limit(1);

      const existingUserId = Array.isArray(existingProfile) ? existingProfile[0]?.id : null;

      if (existingProfileErr || !existingUserId) {
        if (existingProfileErr) console.error('admin-confirm-demo: existing profile lookup failed:', existingProfileErr);
        return res.status(400).json({ success: false, error: 'A user with this email already exists.' });
      }

      targetUserId = existingUserId;

      const { error: updAuthErr } = await supabase.auth.admin.updateUserById(targetUserId, {
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          company: businessName,
        },
      });

      if (updAuthErr) {
        console.error('admin-confirm-demo: updateUserById failed:', updAuthErr);
        return res.status(500).json({ success: false, error: 'Failed to update existing user password.' });
      }
    } else {
      targetUserId = authData.user?.id || null;
    }

    if (!targetUserId) {
      return res.status(500).json({ success: false, error: 'Failed to resolve user ID.' });
    }

    const trialEndDate = new Date(now.getTime() + Number(trialDays) * 24 * 60 * 60 * 1000);

    await supabase
      .from('users')
      .upsert({
        id: targetUserId,
        email,
        full_name: fullName,
        company: businessName,
        status: 'active',
        trial_start: now.toISOString(),
        trial_end: trialEndDate.toISOString(),
        updated_at: now.toISOString(),
      }, { onConflict: 'id' });

    const { error: updReqErr } = await supabase
      .from('demo_requests')
      .update({
        status: 'confirmed',
      })
      .eq('id', requestId);

    if (updReqErr) {
      console.error('admin-confirm-demo: failed updating demo request:', updReqErr);
      return res.status(500).json({ success: false, error: 'Failed to update demo request' });
    }

    try {
      await sendCredentialsEmail(email, fullName, password, trialDays);
    } catch {
    }

    return res.status(200).json({ success: true });
  } catch (e) {
    console.error('admin-confirm-demo: unexpected error:', e);
    return res.status(500).json({
      success: false,
      error: (e && typeof e === 'object' && 'message' in e) ? String(e.message) : 'Unexpected server error.',
    });
  }
}
