import { getBearerToken, getSupabaseAdminClient, getSupabaseClient, readJsonBody, requireUser, resolveTenantId } from './service-documents/_shared.js';

function normalizeEmail(input) {
  const email = String(input || '').trim().toLowerCase();
  return email || null;
}

function round2(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100) / 100;
}

function formatMoney(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return '$0.00';
  return `$${num.toFixed(2)}`;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function getAdminEmailsForTenant({ supabaseAdmin, tenantId }) {
  const { data: rolesRows, error } = await supabaseAdmin
    .from('user_roles')
    .select('user_id, roles!inner(name)')
    .eq('owner_user_id', tenantId);

  if (error) {
    console.error('htc-submit getAdminEmailsForTenant roles query error', error);
    return [];
  }

  const adminUserIds = (rolesRows || [])
    .filter((r) => r && r.roles && String(r.roles.name).toLowerCase() === 'admin')
    .map((r) => String(r.user_id));

  const uniqueIds = Array.from(new Set(adminUserIds)).filter(Boolean);
  if (!uniqueIds.length) return [];

  const { data: usersRows, error: usersErr } = await supabaseAdmin
    .from('users')
    .select('email')
    .in('id', uniqueIds);

  if (usersErr) {
    console.error('htc-submit getAdminEmailsForTenant users query error', usersErr);
    return [];
  }

  const emails = (usersRows || [])
    .map((u) => normalizeEmail(u?.email))
    .filter(Boolean);

  return Array.from(new Set(emails));
}

async function sendSubmissionEmail({ toEmails, submission, lines, publicBaseUrl }) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const resendFrom = (process.env.RESEND_FROM && String(process.env.RESEND_FROM).trim())
    ? String(process.env.RESEND_FROM).trim()
    : 'Send Bill Now <onboarding@resend.dev>';
  const resendReplyTo = (process.env.RESEND_REPLY_TO && String(process.env.RESEND_REPLY_TO).trim())
    ? String(process.env.RESEND_REPLY_TO).trim()
    : null;

  const base = String(publicBaseUrl || '').trim().replace(/\/$/, '') || 'https://sendbillnow.com';
  const submittedAt = submission?.submitted_at ? new Date(String(submission.submitted_at)).toLocaleString() : '—';

  const totalHours = round2((lines || []).reduce((acc, ln) => acc + (Number(ln?.hours ?? 0) || 0), 0));
  const grandTotal = round2((lines || []).reduce((acc, ln) => acc + (Number(ln?.line_total ?? 0) || 0), 0));

  const who = submission?.submitted_by_name || submission?.submitted_by_email || submission?.submitted_by || '—';
  const notes = submission?.notes ? String(submission.notes) : '';

  const linesHtml = (lines || []).map((ln) => {
    const workDate = ln?.work_date ? escapeHtml(String(ln.work_date)) : '';
    const desc = ln?.description ? escapeHtml(String(ln.description)) : '';
    const start = ln?.start_time ? escapeHtml(String(ln.start_time)) : '';
    const end = ln?.end_time ? escapeHtml(String(ln.end_time)) : '';
    const hours = Number(ln?.hours ?? 0) || 0;
    const total = Number(ln?.line_total ?? 0) || 0;

    return `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;white-space:nowrap;">${workDate}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${desc}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;white-space:nowrap;">${start}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;white-space:nowrap;">${end}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">${hours ? hours.toFixed(2).replace(/\.00$/, '') : ''}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">${total ? formatMoney(total) : ''}</td>
      </tr>
    `;
  }).join('');

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 720px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #0f172a, #1f2937); padding: 20px; border-radius: 14px 14px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 20px;">New HTC Service Hours Submission</h1>
      </div>
      <div style="background: #fff; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 14px 14px;">
        <div style="font-size: 14px; color: #111827; margin-bottom: 14px;">
          <div><strong>Submitted by:</strong> ${escapeHtml(who)}</div>
          <div><strong>Submitted at:</strong> ${escapeHtml(submittedAt)}</div>
          <div><strong>Hourly rate:</strong> ${submission?.hourly_rate ? formatMoney(Number(submission.hourly_rate) || 0) : '—'}</div>
        </div>

        <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:12px;padding:14px;margin:14px 0;">
          <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:13px;color:#0f172a;">
            <div><strong>Total hours:</strong> ${totalHours ? totalHours.toFixed(2).replace(/\.00$/, '') : '0'}</div>
            <div><strong>Grand total:</strong> ${formatMoney(grandTotal)}</div>
          </div>
        </div>

        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr>
              <th style="text-align:left;padding:8px;border-bottom:2px solid #e5e7eb;">Date</th>
              <th style="text-align:left;padding:8px;border-bottom:2px solid #e5e7eb;">Description</th>
              <th style="text-align:left;padding:8px;border-bottom:2px solid #e5e7eb;">Start</th>
              <th style="text-align:left;padding:8px;border-bottom:2px solid #e5e7eb;">End</th>
              <th style="text-align:right;padding:8px;border-bottom:2px solid #e5e7eb;">Hours</th>
              <th style="text-align:right;padding:8px;border-bottom:2px solid #e5e7eb;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${linesHtml || ''}
          </tbody>
        </table>

        ${notes ? `
          <div style="margin-top:14px;font-size:13px;color:#111827;">
            <div style="font-weight:700;margin-bottom:6px;">Notes</div>
            <div style="white-space:pre-wrap;">${escapeHtml(notes)}</div>
          </div>
        ` : ''}

        <div style="text-align:center;margin-top:18px;">
          <a href="${base}/admin/htc-access" style="background:#0f172a;color:#fff;padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:700;display:inline-block;">Open Admin HTC Module</a>
        </div>
      </div>
    </div>
  `;

  if (!resendApiKey) {
    console.log('=== HTC SUBMISSION EMAIL (No RESEND_API_KEY configured) ===');
    console.log(`To: ${toEmails.join(', ')}`);
    console.log(`Submitted by: ${who}`);
    console.log(`Submitted at: ${submittedAt}`);
    console.log(`Total hours: ${totalHours}`);
    console.log(`Grand total: ${grandTotal}`);
    console.log('==========================================================');
    return;
  }

  const payload = {
    from: resendFrom,
    to: toEmails,
    ...(resendReplyTo ? { reply_to: resendReplyTo } : {}),
    subject: `New HTC Service Hours Submission (${escapeHtml(who)})`,
    text: `New HTC Service Hours Submission\n\nSubmitted by: ${who}\nSubmitted at: ${submittedAt}\nTotal hours: ${totalHours}\nGrand total: ${formatMoney(grandTotal)}\n\nOpen admin: ${base}/admin/htc-access`,
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

  const body = await readJsonBody(req);
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ ok: false, error: 'Invalid JSON body' });
  }

  const notes = (typeof body.notes === 'string' ? body.notes.trim() : '') || null;
  const submittedByEmail = normalizeEmail(body.submitted_by_email);
  const submittedByName = (typeof body.submitted_by_name === 'string' ? body.submitted_by_name.trim() : '') || null;
  const rateRaw = body.hourly_rate;
  const hourlyRateNum = Number(rateRaw ?? 0);
  const hourlyRate = Number.isFinite(hourlyRateNum) && hourlyRateNum >= 0 ? hourlyRateNum : 0;

  const contractor = body?.contractor && typeof body.contractor === 'object' ? body.contractor : null;
  let contractorName = contractor && typeof contractor.name === 'string' ? contractor.name.trim() : '';
  let contractorPhone = contractor && typeof contractor.phone === 'string' ? contractor.phone.trim() : '';
  let contractorAddress = contractor && typeof contractor.address === 'string' ? contractor.address.trim() : '';
  let contractorCity = contractor && typeof contractor.city === 'string' ? contractor.city.trim() : '';
  let contractorState = contractor && typeof contractor.state === 'string' ? contractor.state.trim() : '';
  let contractorZip = contractor && typeof contractor.zip === 'string' ? contractor.zip.trim() : '';

  const lines = Array.isArray(body.lines) ? body.lines : [];
  if (!lines.length) {
    return res.status(400).json({ ok: false, error: 'At least one line is required' });
  }

  const normalizedLines = lines
    .map((ln) => {
      const workDate = typeof ln?.work_date === 'string' ? ln.work_date : '';
      const description = typeof ln?.description === 'string' ? ln.description.trim() : '';
      const startTime = typeof ln?.start_time === 'string' ? ln.start_time : null;
      const endTime = typeof ln?.end_time === 'string' ? ln.end_time : null;
      const hoursNum = Number(ln?.hours ?? 0);
      const totalNum = Number(ln?.line_total ?? 0);

      return {
        work_date: workDate,
        description,
        start_time: startTime,
        end_time: endTime,
        hours: Number.isFinite(hoursNum) ? hoursNum : 0,
        line_total: Number.isFinite(totalNum) ? totalNum : 0,
      };
    })
    .filter((ln) => ln.description);

  if (!normalizedLines.length) {
    return res.status(400).json({ ok: false, error: 'At least one line with description is required' });
  }

  try {
    // If contractor info is missing (fully or partially) from payload, fallback to user's profile.
    if (!contractorName || !contractorPhone || !contractorAddress || !contractorCity || !contractorState || !contractorZip) {
      try {
        const { data: profileRow } = await supabase
          .from('users')
          .select('full_name, phone, address, city, state, zip')
          .eq('id', user.id)
          .maybeSingle();

        if (!contractorName && profileRow && typeof profileRow.full_name === 'string') contractorName = profileRow.full_name.trim();
        if (!contractorPhone && profileRow && typeof profileRow.phone === 'string') contractorPhone = profileRow.phone.trim();
        if (!contractorAddress && profileRow && typeof profileRow.address === 'string') contractorAddress = profileRow.address.trim();
        if (!contractorCity && profileRow && typeof profileRow.city === 'string') contractorCity = profileRow.city.trim();
        if (!contractorState && profileRow && typeof profileRow.state === 'string') contractorState = profileRow.state.trim();
        if (!contractorZip && profileRow && typeof profileRow.zip === 'string') contractorZip = profileRow.zip.trim();
      } catch {
      }
    }

    const tenantId = await resolveTenantId(supabase, user);
    if (!tenantId) {
      return res.status(400).json({ ok: false, error: 'Could not resolve tenant' });
    }

    const { data: createdSub, error: subErr } = await supabase
      .from('htc_service_hours_submissions')
      .insert({
        tenant_id: tenantId,
        submitted_by: user.id,
        submitted_by_email: submittedByEmail,
        submitted_by_name: submittedByName,
        hourly_rate: hourlyRate,
        status: 'submitted',
        notes,
        contractor_name: contractorName || null,
        contractor_phone: contractorPhone || null,
        contractor_address: contractorAddress || null,
        contractor_city: contractorCity || null,
        contractor_state: contractorState || null,
        contractor_zip: contractorZip || null,
      })
      .select()
      .single();

    if (subErr) throw subErr;

    const toInsertLines = normalizedLines.map((ln) => ({
      submission_id: createdSub.id,
      work_date: ln.work_date,
      description: ln.description,
      start_time: ln.start_time,
      end_time: ln.end_time,
      hours: ln.hours,
      line_total: ln.line_total,
    }));

    const { data: savedLines, error: linesErr } = await supabase
      .from('htc_service_hours_lines')
      .insert(toInsertLines)
      .select();

    if (linesErr) throw linesErr;

    const supabaseAdmin = getSupabaseAdminClient();
    if (supabaseAdmin) {
      const adminEmails = await getAdminEmailsForTenant({ supabaseAdmin, tenantId });
      if (adminEmails.length) {
        const publicBaseUrl = (process.env.PUBLIC_BASE_URL && String(process.env.PUBLIC_BASE_URL).trim())
          ? String(process.env.PUBLIC_BASE_URL).trim()
          : '';

        try {
          await sendSubmissionEmail({
            toEmails: adminEmails,
            submission: createdSub,
            lines: savedLines || [],
            publicBaseUrl,
          });
        } catch (emailErr) {
          console.error('htc-submit sendSubmissionEmail error', emailErr);
        }
      }
    }

    return res.status(200).json({ ok: true, submission: createdSub, lines: savedLines || [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unexpected error';
    return res.status(500).json({ ok: false, error: msg });
  }
}
