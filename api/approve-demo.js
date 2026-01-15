import { createClient } from '@supabase/supabase-js';

const SUPER_ADMIN_EMAIL = 'rolianaurora30@gmail.com';

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

  const body = await readJsonBody(req);
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ success: false, error: 'Invalid JSON body' });
  }

  const { requestId, email, fullName, password, trialDays, businessName } = body;

  if (!requestId || !email || !password || !trialDays) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return res.status(500).json({ success: false, error: 'Server misconfiguration.' });
  }

  try {
    // 1. Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: email.toLowerCase(),
      password: password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName || '',
        company: businessName || ''
      }
    });

    if (authError) {
      console.error('Auth creation error:', authError);
      // Check if user already exists
      if (authError.message?.includes('already') || authError.message?.includes('exists')) {
        return res.status(400).json({ success: false, error: 'A user with this email already exists.' });
      }
      return res.status(500).json({ success: false, error: authError.message || 'Failed to create user account.' });
    }

    const userId = authData.user?.id;
    if (!userId) {
      return res.status(500).json({ success: false, error: 'Failed to get user ID after creation.' });
    }

    // 2. Calculate trial end date
    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + Number(trialDays));

    // 3. Insert into users table
    const { error: userInsertError } = await supabase.from('users').insert({
      id: userId,
      email: email.toLowerCase(),
      full_name: fullName || '',
      company: businessName || '',
      status: 'active',
      trial_start: new Date().toISOString(),
      trial_end: trialEndDate.toISOString(),
      created_at: new Date().toISOString()
    });

    if (userInsertError) {
      console.error('User insert error:', userInsertError);
      // Don't fail completely - the auth user was created
    }

    // 4. Update demo_request status
    const { error: updateError } = await supabase
      .from('demo_requests')
      .update({ 
        status: 'approved',
        approved_at: new Date().toISOString(),
        trial_days: trialDays
      })
      .eq('id', requestId);

    if (updateError) {
      console.error('Demo request update error:', updateError);
    }

    // 5. Send email with credentials (using a simple approach)
    // You can replace this with your preferred email service (SendGrid, Resend, etc.)
    try {
      await sendCredentialsEmail(email, fullName, password, trialDays);
    } catch (emailError) {
      console.error('Email sending error:', emailError);
      // Don't fail the request - user was created successfully
    }

    return res.status(200).json({ 
      success: true, 
      userId,
      message: 'User created successfully'
    });

  } catch (error) {
    console.error('Approve demo error:', error);
    return res.status(500).json({ success: false, error: 'Unexpected server error.' });
  }
}

async function sendCredentialsEmail(email, fullName, password, trialDays) {
  // Option 1: Use Resend if available
  const resendApiKey = process.env.RESEND_API_KEY;
  
  if (resendApiKey) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Send Bill Now <noreply@sendbillnow.com>',
        to: [email],
        subject: 'Welcome to Send Bill Now - Your Account is Ready!',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #008000, #006600); padding: 30px; border-radius: 16px 16px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to Send Bill Now!</h1>
            </div>
            <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 16px 16px;">
              <p style="font-size: 16px; color: #333;">Hello <strong>${fullName || 'there'}</strong>,</p>
              <p style="font-size: 16px; color: #333;">Great news! Your demo request has been approved. Your account is now active and ready to use.</p>
              
              <div style="background: #f8f8f8; border: 2px solid #008000; border-radius: 12px; padding: 20px; margin: 20px 0;">
                <h3 style="color: #008000; margin-top: 0;">Your Login Credentials</h3>
                <p style="margin: 10px 0;"><strong>Email:</strong> ${email}</p>
                <p style="margin: 10px 0;"><strong>Password:</strong> <code style="background: #e8e8e8; padding: 4px 8px; border-radius: 4px;">${password}</code></p>
                <p style="margin: 10px 0;"><strong>Trial Period:</strong> ${trialDays} days</p>
              </div>

              <p style="font-size: 14px; color: #666;">For security, we recommend changing your password after your first login.</p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="https://sendbillnow.com/auth/login" style="background: #008000; color: white; padding: 14px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
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
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Failed to send email via Resend');
    }
    
    return true;
  }

  // Option 2: Log to console if no email service configured
  console.log('=== EMAIL CREDENTIALS (No email service configured) ===');
  console.log(`To: ${email}`);
  console.log(`Name: ${fullName}`);
  console.log(`Password: ${password}`);
  console.log(`Trial: ${trialDays} days`);
  console.log('========================================================');
  
  return true;
}
