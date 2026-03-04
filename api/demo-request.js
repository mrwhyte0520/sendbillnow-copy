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
      console.error('Resend error response:', errorData);
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
    const now = new Date();
    const trialDays = 15;
    const password = generatePassword();

    const { data: insertReq, error: insertReqErr } = await supabase.from('demo_requests').insert({
      full_name,
      email,
      phone,
      business_name,
      location,
      business_type,
      description,
      message,
      status: 'confirmed',
    }).select('id').maybeSingle();

    if (insertReqErr) {
      return res.status(500).json({ success: false, error: 'Could not save request. Please try again.' });
    }

    let userId = null;
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: email.toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: {
        full_name: full_name || '',
        company: business_name || '',
      },
    });

    if (authError) {
      const msg = String(authError.message || '');
      const alreadyExists = msg.toLowerCase().includes('already') || msg.toLowerCase().includes('exists');

      if (!alreadyExists) {
        console.error('Auth creation error:', authError);
        return res.status(500).json({ success: false, error: authError.message || 'Failed to create user account.' });
      }

      const { data: existingProfile, error: existingProfileErr } = await supabase
        .from('users')
        .select('id')
        .eq('email', email.toLowerCase())
        .maybeSingle();

      if (existingProfileErr || !existingProfile?.id) {
        console.error('Existing user lookup error:', existingProfileErr);
        return res.status(400).json({ success: false, error: 'A user with this email already exists.' });
      }

      userId = existingProfile.id;
      const { error: updAuthErr } = await supabase.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
        user_metadata: {
          full_name: full_name || '',
          company: business_name || '',
        },
      });

      if (updAuthErr) {
        console.error('Auth update error:', updAuthErr);
        return res.status(500).json({ success: false, error: 'Failed to update existing user password.' });
      }
    } else {
      userId = authData.user?.id || null;
    }

    if (!userId) {
      return res.status(500).json({ success: false, error: 'Failed to resolve user ID.' });
    }

    const trialEndDate = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

    const { error: updProfileErr } = await supabase
      .from('users')
      .update({
        trial_end: trialEndDate.toISOString(),
        trial_plan_id: 'student',
        plan_id: null,
        plan_status: 'inactive',
        billing_period: 'annual',
        updated_at: now.toISOString(),
      })
      .eq('id', userId);

    if (updProfileErr) {
      console.error('Profile update error:', updProfileErr);
    }

    const requestId = insertReq?.id || null;
    if (requestId) {
      const { error: updReqErr } = await supabase
        .from('demo_requests')
        .update({
          status: 'confirmed',
          approved_at: now.toISOString(),
          trial_days: trialDays,
        })
        .eq('id', requestId);
      if (updReqErr) {
        console.error('Demo request update error:', updReqErr);
      }
    }

    try {
      await sendCredentialsEmail(email, full_name, password, trialDays);
    } catch (emailError) {
      console.error('Email sending error:', emailError);
    }

    return res.status(200).json({ success: true });
  } catch {
    return res.status(500).json({ success: false, error: 'Unexpected server error.' });
  }
}
