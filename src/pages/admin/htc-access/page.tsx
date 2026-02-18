import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { supabase } from '../../../lib/supabase';
import { resolveTenantId, settingsService } from '../../../services/database';
import { printInvoice } from '../../../utils/invoicePrintTemplates';

type SubmissionRow = {
  id: string;
  tenant_id: string;
  submitted_by: string;
  submitted_by_email: string | null;
  submitted_by_name: string | null;
  contractor_name?: string | null;
  contractor_phone?: string | null;
  contractor_address?: string | null;
  contractor_city?: string | null;
  contractor_state?: string | null;
  contractor_zip?: string | null;
  hourly_rate: number | null;
  status: string | null;
  submitted_at: string | null;
  notes: string | null;
};

type SubmissionLineRow = {
  id: string;
  submission_id: string;
  work_date: string;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  hours: number | null;
  line_total: number | null;
};

function formatInvoiceNumber(raw: string): string {
  const s = String(raw || '').trim();
  const prefix = '4873';
  if (!s) return s;
  if (!s.startsWith(prefix)) return s;

  const suffixRaw = s.slice(prefix.length);
  if (!/^[0-9]+$/.test(suffixRaw)) return s;

  const counter = Number.parseInt(suffixRaw, 10);
  if (!Number.isFinite(counter) || counter < 0) return s;

  const padded = String(counter).padStart(4, '0');
  return `${prefix}${padded}`;
}

function isValidEmail(input: string) {
  const email = String(input || '').trim().toLowerCase();
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function AdminHtcAccessPage() {
  const [email, setEmail] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [sending, setSending] = useState(false);

  const [defaultHourlyRate, setDefaultHourlyRate] = useState('');
  const [savingDefaultRate, setSavingDefaultRate] = useState(false);
  const [tenantId, setTenantId] = useState<string | null>(null);

  const [loadingSubs, setLoadingSubs] = useState(true);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);

  const [loadingInvoiceId, setLoadingInvoiceId] = useState<string | null>(null);

  const rateNumber = useMemo(() => {
    const raw = hourlyRate.trim();
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : NaN;
  }, [hourlyRate]);

  const defaultRateNumber = useMemo(() => {
    const raw = defaultHourlyRate.trim();
    if (!raw) return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : NaN;
  }, [defaultHourlyRate]);

  const loadDefaultRate = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const tid = await resolveTenantId(user?.id);
      setTenantId(tid);
      if (!tid) return;

      const { data, error } = await supabase
        .from('company_info')
        .select('htc_default_hourly_rate')
        .eq('user_id', tid)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      const n = Number((data as any)?.htc_default_hourly_rate ?? 0);
      const v = Number.isFinite(n) && n >= 0 ? n : 0;
      setDefaultHourlyRate(v ? String(v) : '');
    } catch (e) {
      console.error('AdminHtcAccessPage loadDefaultRate error', e);
    }
  };

  const handleSaveDefaultRate = async () => {
    if (!tenantId) {
      alert('No se pudo resolver el tenant');
      return;
    }
    if (!Number.isFinite(defaultRateNumber) || defaultRateNumber < 0) {
      alert('Default hourly rate inválido');
      return;
    }
    try {
      setSavingDefaultRate(true);

      const { data: updatedRows, error: updErr } = await supabase
        .from('company_info')
        .update({ htc_default_hourly_rate: defaultRateNumber })
        .eq('user_id', tenantId)
        .select('user_id')
        .limit(1);
      if (updErr) throw updErr;

      const updatedAny = Array.isArray(updatedRows) && updatedRows.length > 0;
      if (!updatedAny) {
        const payload: any = {
          user_id: tenantId,
          name: 'Company',
          htc_default_hourly_rate: defaultRateNumber,
        };
        const { error: insErr } = await supabase.from('company_info').insert(payload);
        if (insErr) throw insErr;
      }

      await loadDefaultRate();
      alert('Default hourly rate guardado');
    } catch (e: any) {
      alert(e?.message || 'Error guardando default hourly rate');
    } finally {
      setSavingDefaultRate(false);
    }
  };

  const loadSubmissions = async () => {
    try {
      setLoadingSubs(true);
      const { data, error } = await supabase
        .from('htc_service_hours_submissions')
        .select('*')
        .order('submitted_at', { ascending: false })
        .limit(25);

      if (error) throw error;
      setSubmissions((data as any) || []);
    } catch (e) {
      console.error('AdminHtcAccessPage loadSubmissions error', e);
      setSubmissions([]);
    } finally {
      setLoadingSubs(false);
    }
  };

  useEffect(() => {
    loadSubmissions();
    loadDefaultRate();
  }, []);

  const handleOpenInvoice = async (s: SubmissionRow) => {
    try {
      setLoadingInvoiceId(s.id);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      const tid = await resolveTenantId(user?.id);

      const { data: submissionRow, error: subErr } = await supabase
        .from('htc_service_hours_submissions')
        .select('*')
        .eq('id', s.id)
        .maybeSingle();
      if (subErr) throw subErr;

      const sub = (submissionRow as any) || (s as any);

      let invoiceNumber = '';
      let accountNumber = '';
      try {
        if (tid) {
          const [{ data: invNum, error: invErr }, { data: acctNum, error: acctErr }] = await Promise.all([
            supabase.rpc('next_invoice_number', { p_tenant_id: tid }),
            supabase.rpc('next_invoice_account_number', { p_tenant_id: tid }),
          ]);
          if (!invErr) invoiceNumber = formatInvoiceNumber(String(invNum || '').trim());
          if (!acctErr) accountNumber = String(acctNum || '').trim();
        }
      } catch {
      }

      const { data: lines, error: linesErr } = await supabase
        .from('htc_service_hours_lines')
        .select('*')
        .eq('submission_id', s.id)
        .order('work_date', { ascending: true });
      if (linesErr) throw linesErr;

      const companyInfo = (await settingsService.getCompanyInfo()) as any;
      const company = {
        name: String(companyInfo?.name || companyInfo?.company_name || 'HTC'),
        address: String(companyInfo?.address || ''),
        phone: companyInfo?.phone ? String(companyInfo.phone) : undefined,
        email: companyInfo?.email ? String(companyInfo.email) : undefined,
        website: companyInfo?.website ? String(companyInfo.website) : undefined,
        facebook: companyInfo?.facebook ? String(companyInfo.facebook) : undefined,
        instagram: companyInfo?.instagram ? String(companyInfo.instagram) : undefined,
        twitter: companyInfo?.twitter ? String(companyInfo.twitter) : undefined,
        linkedin: companyInfo?.linkedin ? String(companyInfo.linkedin) : undefined,
        youtube: companyInfo?.youtube ? String(companyInfo.youtube) : undefined,
        tiktok: companyInfo?.tiktok ? String(companyInfo.tiktok) : undefined,
        whatsapp: companyInfo?.whatsapp ? String(companyInfo.whatsapp) : undefined,
      };

      const who = sub.submitted_by_name || sub.submitted_by_email || sub.submitted_by || 'Contractor';
      const contractorName = sub.contractor_name ? String(sub.contractor_name) : '';
      const contractorPhone = sub.contractor_phone ? String(sub.contractor_phone) : '';
      const contractorAddress = sub.contractor_address ? String(sub.contractor_address) : '';
      const contractorCity = sub.contractor_city ? String(sub.contractor_city) : '';
      const contractorState = sub.contractor_state ? String(sub.contractor_state) : '';
      const contractorZip = sub.contractor_zip ? String(sub.contractor_zip) : '';
      const customerAddress = [
        contractorAddress.trim(),
        contractorCity.trim(),
        contractorState.trim(),
        contractorZip.trim(),
      ]
        .filter(Boolean)
        .join(', ');

      const submittedByName = sub.submitted_by_name ? String(sub.submitted_by_name) : '';
      const submittedByEmail = sub.submitted_by_email ? String(sub.submitted_by_email) : '';
      const customerName = contractorName.trim() || submittedByName.trim() || submittedByEmail.trim() || who;
      const customerEmail = submittedByEmail.trim();
      const customer = {
        name: customerName,
        email: customerEmail && customerEmail.toLowerCase() !== customerName.trim().toLowerCase() ? customerEmail : undefined,
        phone: contractorPhone.trim() || undefined,
        address: customerAddress,
      };

      const safeLines = Array.isArray(lines) ? (lines as any as SubmissionLineRow[]) : [];
      const items = safeLines.map((ln) => {
        const qty = Number(ln.hours ?? 0) || 0;
        const rate = Number(sub.hourly_rate ?? 0) || 0;
        const total = Number(ln.line_total ?? qty * rate) || 0;
        return {
          description: String(ln.description ?? ''),
          quantity: qty,
          price: rate,
          total,
          workDate: ln.work_date,
          startTime: ln.start_time,
          endTime: ln.end_time,
        };
      });

      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');

      const invoice = {
        invoiceNumber: invoiceNumber || String(s.id).slice(0, 8).toUpperCase(),
        accountNumber: accountNumber || undefined,
        date: `${yyyy}-${mm}-${dd}`,
        dueDate: `${yyyy}-${mm}-${dd}`,
        createdBy: who,
        amount: items.reduce((acc, it: any) => acc + (Number(it.total) || 0), 0),
        subtotal: items.reduce((acc, it: any) => acc + (Number(it.total) || 0), 0),
        tax: 0,
        items,
        serviceDescription: 'Consulting Services',
        total: items.reduce((acc, it: any) => acc + (Number(it.total) || 0), 0),
        grandTotal: items.reduce((acc, it: any) => acc + (Number(it.total) || 0), 0),
      };

      printInvoice(invoice as any, customer as any, company as any, 'service-hours');
    } catch (e: any) {
      alert(e?.message || 'Error generando invoice');
    } finally {
      setLoadingInvoiceId(null);
    }
  };

  const handleSendInvite = async () => {
    const to = email.trim().toLowerCase();
    if (!isValidEmail(to)) {
      alert('Email inválido');
      return;
    }

    if (rateNumber !== null && (!Number.isFinite(rateNumber) || rateNumber < 0)) {
      alert('Hourly rate inválido');
      return;
    }

    try {
      setSending(true);

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        alert('Sesión no válida. Inicia sesión nuevamente.');
        return;
      }

      const apiBase = (import.meta.env.VITE_API_BASE_URL?.trim() || window.location.origin).replace(/\/$/, '');

      const resp = await fetch(`${apiBase}/api/htc/invite`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          email: to,
          hourlyRate: rateNumber,
        }),
      });

      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data?.ok) {
        throw new Error(data?.error || 'No se pudo enviar la invitación');
      }

      alert('Acceso HTC enviado por correo');
      setEmail('');
      setHourlyRate('');
      await loadSubmissions();
    } catch (e: any) {
      alert(e?.message || 'Error enviando invitación');
    } finally {
      setSending(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">HTC Access</h1>
              <p className="text-gray-600 mt-1">Invitar por correo y ver actividad del portal HTC</p>
            </div>
            <button
              onClick={loadSubmissions}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              disabled={loadingSubs}
            >
              <i className="ri-refresh-line mr-2"></i>
              Actualizar
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Dar acceso</h2>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div className="md:col-span-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Default Hourly Rate (HTC)</label>
              <input
                value={defaultHourlyRate}
                onChange={(e) => setDefaultHourlyRate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                placeholder="0"
                disabled={savingDefaultRate}
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={handleSaveDefaultRate}
                className="w-full px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                disabled={savingDefaultRate}
              >
                {savingDefaultRate ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                placeholder="name@example.com"
                disabled={sending}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hourly Rate (opcional)</label>
              <input
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                placeholder={defaultHourlyRate.trim() ? defaultHourlyRate.trim() : '0'}
                disabled={sending}
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              onClick={handleSendInvite}
              className="px-4 py-2 text-white bg-slate-800 rounded-lg hover:bg-slate-900"
              disabled={sending}
            >
              {sending ? 'Enviando...' : 'Enviar acceso'}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Últimas submissions (notificaciones)</h2>

          {loadingSubs ? null : (
            <div className="text-sm text-gray-600 mb-3">Total: {submissions.length}</div>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full table-fixed divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-52">Fecha</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Usuario</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">Rate</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-28">Status</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notas</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-28">Invoice</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {submissions.map((s) => {
                  const at = s.submitted_at ? new Date(s.submitted_at).toLocaleString() : '—';
                  const who =
                    (s.contractor_name && String(s.contractor_name).trim()) ||
                    s.submitted_by_name ||
                    s.submitted_by_email ||
                    s.submitted_by ||
                    '—';
                  const rate = Number(s.hourly_rate ?? 0) || 0;
                  const hasContractor = Boolean(
                    (s.contractor_name && String(s.contractor_name).trim()) ||
                      (s.contractor_phone && String(s.contractor_phone).trim()) ||
                      (s.contractor_address && String(s.contractor_address).trim())
                  );
                  return (
                    <tr key={s.id}>
                      <td className="px-4 py-3 text-sm text-gray-700">{at}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 truncate">
                        <div className="truncate">{who}</div>
                        {!hasContractor ? (
                          <div className="text-xs text-amber-700 truncate">Missing contractor info</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{rate ? `$${rate.toFixed(2)}` : '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{String(s.status || 'submitted')}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 truncate">{s.notes || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        <button
                          onClick={() => handleOpenInvoice(s)}
                          className="px-3 py-1.5 text-white bg-slate-800 rounded-md hover:bg-slate-900"
                          disabled={Boolean(loadingInvoiceId)}
                        >
                          {loadingInvoiceId === s.id ? 'Abriendo...' : 'Invoice'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
