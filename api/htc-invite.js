import { getBearerToken, getSupabaseAdminClient, getSupabaseClient, readJsonBody, requireUser, resolveTenantId } from './service-documents/_shared.js';

function isValidEmail(input) {
  const email = String(input || '').trim().toLowerCase();
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function randomPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  let out = '';
  for (let i = 0; i < 12; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

async function sendHtcInviteEmail({ toEmail, password, publicBaseUrl }) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const resendFrom = (process.env.RESEND_FROM && String(process.env.RESEND_FROM).trim())
    ? String(process.env.RESEND_FROM).trim()
    : 'Send Bill Now <onboarding@resend.dev>';
  const resendReplyTo = (process.env.RESEND_REPLY_TO && String(process.env.RESEND_REPLY_TO).trim())
    ? String(process.env.RESEND_REPLY_TO).trim()
    : null;

  if (!resendApiKey) {
    console.log('=== HTC INVITE EMAIL (No RESEND_API_KEY configured) ===');
    console.log(`To: ${toEmail}`);
    console.log(`Password: ${password}`);
    console.log('=====================================================');
    return;
  }

  const base = String(publicBaseUrl || '').trim().replace(/\/$/, '') || 'https://sendbillnow.com';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #0f172a, #1f2937); padding: 24px; border-radius: 14px 14px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 22px;">HTC Portal Access</h1>
      </div>
      <div style="background: #fff; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 14px 14px;">
        <p style="font-size: 14px; color: #111827;">Your access to the HTC portal has been enabled.</p>
        <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 12px; padding: 16px; margin: 16px 0;">
          <div style="font-weight: 700; color: #0f172a; margin-bottom: 8px;">Login credentials</div>
          <div style="margin: 8px 0;"><strong>Email:</strong> ${toEmail}</div>
          <div style="margin: 8px 0;"><strong>Password:</strong> <code style="background: #e2e8f0; padding: 3px 8px; border-radius: 6px;">${password}</code></div>
        </div>
        <p style="font-size: 12px; color: #475569;">For security, please change your password after the first login.</p>
        <div style="text-align: center; margin: 18px 0 8px;">
          <a href="${base}/auth/login" style="background: #0f172a; color: white; padding: 12px 20px; text-decoration: none; border-radius: 10px; font-weight: 700; display: inline-block;">
            Open Login
          </a>
        </div>
      </div>
    </div>
  `;

  const payload = {
    from: resendFrom,
    to: [toEmail],
    ...(resendReplyTo ? { reply_to: resendReplyTo } : {}),
    subject: 'HTC Portal Access - Credentials',
    text: `HTC portal access enabled.\n\nEmail: ${toEmail}\nPassword: ${password}\n\nLogin: ${base}/auth/login`,
    html,
  };

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    let data = text;
    try {
      data = text ? JSON.parse(text) : text;
    } catch {
      data = text;
    }
    const msg = (data && typeof data === 'object' && data.message) ? String(data.message) : null;
    throw new Error(msg || 'Failed to send email via Resend');
  }
}

async function isAdminUser({ supabase, userId }) {
  const { data, error } = await supabase
    .from('user_roles')
    .select('id, roles!inner(name)')
    .eq('user_id', userId);

  if (error) return false;
  return Array.isArray(data) && data.some((r) => (r && r.roles && String(r.roles.name).toLowerCase() === 'admin'));
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

  const isAdmin = await isAdminUser({ supabase, userId: user.id });
  if (!isAdmin) {
    return res.status(403).json({ ok: false, error: 'Admin access required' });
  }

  const body = await readJsonBody(req);
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ ok: false, error: 'Invalid JSON body' });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const hourlyRateRaw = body.hourlyRate;
  const hourlyRate = hourlyRateRaw === null || hourlyRateRaw === undefined || hourlyRateRaw === ''
    ? null
    : Number(hourlyRateRaw);

  let resolvedHourlyRate = hourlyRate;

  if (!isValidEmail(email)) {
    return res.status(400).json({ ok: false, error: 'Valid email is required' });
  }

  if (hourlyRate !== null && (!Number.isFinite(hourlyRate) || hourlyRate < 0)) {
    return res.status(400).json({ ok: false, error: 'Invalid hourlyRate' });
  }

  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    return res.status(500).json({ ok: false, error: 'Server misconfiguration (missing SUPABASE_SERVICE_ROLE_KEY)' });
  }

  const password = randomPassword();

  let targetUserId = null;

  try {
    if (resolvedHourlyRate === null) {
      try {
        const { data: companyRow, error: companyErr } = await supabase
          .from('company_info')
          .select('htc_default_hourly_rate')
          .eq('user_id', tenantId)
          .maybeSingle();
        if (!companyErr) {
          const candidate = Number(companyRow?.htc_default_hourly_rate ?? 0);
          if (Number.isFinite(candidate) && candidate >= 0) resolvedHourlyRate = candidate;
        }
      } catch {
      }
    }

    const { data: existingRow } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existingRow?.id) {
      targetUserId = String(existingRow.id);
      const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
        password,
        email_confirm: true,
        user_metadata: {
          htc_portal_only: true,
          ...(resolvedHourlyRate !== null ? { htc_hourly_rate: resolvedHourlyRate } : {}),
        },
      });
      if (updErr) throw new Error(updErr.message);
    } else {
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          htc_portal_only: true,
          ...(resolvedHourlyRate !== null ? { htc_hourly_rate: resolvedHourlyRate } : {}),
        },
      });
      if (createErr) throw new Error(createErr.message);
      targetUserId = created?.user?.id ? String(created.user.id) : null;

      if (!targetUserId) {
        throw new Error('Failed to create user');
      }

      await supabaseAdmin
        .from('users')
        .insert({
          id: targetUserId,
          email,
          status: 'active',
          created_at: new Date().toISOString(),
        })
        .select()
        .maybeSingle();
    }

    const patch = {
      htc_portal_only: true,
      ...(resolvedHourlyRate !== null ? { htc_hourly_rate: resolvedHourlyRate } : {}),
    };

    await supabaseAdmin
      .from('users')
      .update(patch)
      .eq('id', targetUserId);

    // Attach HTC user to the tenant (so they are NOT treated as owner).
    // Create/get a dedicated role and ensure the user has ONLY that role.
    let htcRoleId = null;
    try {
      const { data: existingRole } = await supabaseAdmin
        .from('roles')
        .select('id')
        .eq('owner_user_id', tenantId)
        .eq('name', 'htc_portal')
        .maybeSingle();

      if (existingRole?.id) {
        htcRoleId = String(existingRole.id);
      } else {
        const { data: createdRole, error: roleErr } = await supabaseAdmin
          .from('roles')
          .insert({
            owner_user_id: tenantId,
            name: 'htc_portal',
            description: 'HTC portal-only access',
          })
          .select('id')
          .maybeSingle();

        if (roleErr) {
          const { data: retryRole } = await supabaseAdmin
            .from('roles')
            .select('id')
            .eq('owner_user_id', tenantId)
            .eq('name', 'htc_portal')
            .maybeSingle();
          if (retryRole?.id) htcRoleId = String(retryRole.id);
        } else if (createdRole?.id) {
          htcRoleId = String(createdRole.id);
        }
      }

      if (htcRoleId) {
        // Remove any previous role assignments for this user
        await supabaseAdmin
          .from('user_roles')
          .delete()
          .eq('user_id', targetUserId);

        await supabaseAdmin
          .from('user_roles')
          .insert({
            owner_user_id: tenantId,
            user_id: targetUserId,
            role_id: htcRoleId,
          });
      }
    } catch {
      // ignore RBAC assignment failures; HTC portal-only will still rely on auth metadata
    }

    const publicBaseUrl = (process.env.PUBLIC_BASE_URL && String(process.env.PUBLIC_BASE_URL).trim())
      ? String(process.env.PUBLIC_BASE_URL).trim()
      : '';

    await sendHtcInviteEmail({ toEmail: email, password, publicBaseUrl });

    return res.status(200).json({ ok: true, userId: targetUserId, email });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unexpected error';
    return res.status(500).json({ ok: false, error: msg });
  }
}
