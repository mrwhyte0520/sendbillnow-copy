import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../hooks/useAuth';
import { htcServiceHoursService, resolveTenantId, settingsService } from '../../../services/database';
import { printInvoice } from '../../../utils/invoicePrintTemplates';
import DashboardLayout from '../../../components/layout/DashboardLayout';

type UiLine = {
  id: string;
  workDate: string;
  description: string;
  startTime: string;
  endTime: string;
};

function newLine(now: Date): UiLine {
  const d = new Date(now);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return {
    id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
    workDate: `${yyyy}-${mm}-${dd}`,
    description: '',
    startTime: '',
    endTime: '',
  };
}

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

function parseTimeToMinutes(t: string): number | null {
  const s = String(t || '').trim();
  if (!s) return null;
  const m = s.match(/^([0-9]{1,2}):([0-9]{2})/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function computeHours(startTime: string, endTime: string): number {
  const s = parseTimeToMinutes(startTime);
  const e = parseTimeToMinutes(endTime);
  if (s === null || e === null) return 0;

  let end = e;
  if (end < s) {
    // If user entered times in 12h-style (e.g. 08:55 to 05:54 meaning 5:54pm)
    // and both are in the AM range, assume end is PM.
    const twelveHours = 12 * 60;
    const twentyFourHours = 24 * 60;
    if (s < twelveHours && end < twelveHours) {
      end = end + twelveHours;
    } else {
      end = end + twentyFourHours;
    }

    // Safety: if still not after start, treat as next day.
    if (end <= s) end = end + (24 * 60);
  }

  const diff = end - s;
  if (!Number.isFinite(diff) || diff <= 0) return 0;
  return Math.round((diff / 60) * 100) / 100;
}

export default function HtcServiceHoursPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [locked, setLocked] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [hourlyRate, setHourlyRate] = useState(0);
  const [contractorPanelOpen, setContractorPanelOpen] = useState(false);
  const [contractorInfo, setContractorInfo] = useState(() => ({
    name: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zip: '',
  }));
  const [lines, setLines] = useState<UiLine[]>(() => [newLine(new Date())]);
  const [notes, setNotes] = useState('');

  const contractorStorageKey = useMemo(() => {
    const uid = user?.id ? String(user.id) : '';
    return uid ? `htc_contractor_info_${uid}` : 'htc_contractor_info';
  }, [user?.id]);

  const isContractorInfoComplete = useMemo(() => {
    const n = String(contractorInfo.name || '').trim();
    const p = String(contractorInfo.phone || '').trim();
    const a = String(contractorInfo.address || '').trim();
    const c = String(contractorInfo.city || '').trim();
    const s = String(contractorInfo.state || '').trim();
    const z = String(contractorInfo.zip || '').trim();
    return Boolean(n && p && a && c && s && z);
  }, [contractorInfo]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(contractorStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      setContractorInfo((prev) => ({
        ...prev,
        name: typeof parsed.name === 'string' ? parsed.name : prev.name,
        phone: typeof parsed.phone === 'string' ? parsed.phone : prev.phone,
        address: typeof parsed.address === 'string' ? parsed.address : prev.address,
        city: typeof parsed.city === 'string' ? parsed.city : prev.city,
        state: typeof parsed.state === 'string' ? parsed.state : prev.state,
        zip: typeof parsed.zip === 'string' ? parsed.zip : prev.zip,
      }));
    } catch {
    }
  }, [contractorStorageKey]);

  useEffect(() => {
    if (!contractorStorageKey) return;
    try {
      localStorage.setItem(contractorStorageKey, JSON.stringify(contractorInfo));
    } catch {
    }
  }, [contractorStorageKey, contractorInfo]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        if (!user?.id) return;
        setLoading(true);

        const profilePromise = supabase
          .from('users')
          .select('full_name, email, phone, address, city, state, zip, htc_hourly_rate')
          .eq('id', user.id)
          .maybeSingle();

        const latestPromise = htcServiceHoursService.getMyLatestSubmission(user.id);

        const [{ data: profileRow }, latest] = await Promise.all([profilePromise, latestPromise]);
        if (!mounted) return;

        const nameFromDb = (profileRow as any)?.full_name ? String((profileRow as any).full_name) : '';
        const emailFromDb = (profileRow as any)?.email ? String((profileRow as any).email) : '';
        const metaRateNum = Number(((user as any)?.user_metadata as any)?.htc_hourly_rate ?? 0);
        const metaRate = Number.isFinite(metaRateNum) && metaRateNum >= 0 ? metaRateNum : 0;
        const dbRateNum = Number((profileRow as any)?.htc_hourly_rate ?? 0);
        const dbRate = Number.isFinite(dbRateNum) && dbRateNum >= 0 ? dbRateNum : 0;
        const rateFromDb = dbRate > 0 ? dbRate : metaRate;

        setFullName(nameFromDb || (user.user_metadata as any)?.full_name || user.email?.split('@')[0] || '');
        setEmail(emailFromDb || user.email || '');
        setHourlyRate(rateFromDb);

        // Prefill contractor info from profile if missing locally.
        setContractorInfo((prev) => {
          const phoneFromDb = (profileRow as any)?.phone ? String((profileRow as any).phone) : '';
          const addressFromDb = (profileRow as any)?.address ? String((profileRow as any).address) : '';
          const cityFromDb = (profileRow as any)?.city ? String((profileRow as any).city) : '';
          const stateFromDb = (profileRow as any)?.state ? String((profileRow as any).state) : '';
          const zipFromDb = (profileRow as any)?.zip ? String((profileRow as any).zip) : '';
          return {
            ...prev,
            name: String(prev.name || '').trim() ? prev.name : (nameFromDb || prev.name),
            phone: String(prev.phone || '').trim() ? prev.phone : (phoneFromDb || prev.phone),
            address: String(prev.address || '').trim() ? prev.address : (addressFromDb || prev.address),
            city: String(prev.city || '').trim() ? prev.city : (cityFromDb || prev.city),
            state: String(prev.state || '').trim() ? prev.state : (stateFromDb || prev.state),
            zip: String(prev.zip || '').trim() ? prev.zip : (zipFromDb || prev.zip),
          };
        });

        if (latest?.submission) {
          setLocked(true);
          const at = (latest.submission as any)?.submitted_at ? String((latest.submission as any).submitted_at) : null;
          setSubmittedAt(at);
          const subRateNum = Number((latest.submission as any)?.hourly_rate ?? rateFromDb);
          const subRate = Number.isFinite(subRateNum) && subRateNum >= 0 ? subRateNum : 0;
          setHourlyRate(subRate > 0 ? subRate : rateFromDb);
          const nextLines: UiLine[] = (latest.lines || []).map((ln: any) => ({
            id: ln?.id ? String(ln.id) : `${Date.now()}_${Math.random().toString(16).slice(2)}`,
            workDate: ln?.work_date ? String(ln.work_date) : newLine(new Date()).workDate,
            description: ln?.description ? String(ln.description) : '',
            startTime: ln?.start_time ? String(ln.start_time) : '',
            endTime: ln?.end_time ? String(ln.end_time) : '',
          }));
          setLines(nextLines.length ? nextLines : [newLine(new Date())]);
        } else {
          setLocked(false);
          setSubmittedAt(null);
          setLines([newLine(new Date())]);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  const computed = useMemo(() => {
    const rate = Number(hourlyRate) || 0;
    const lineComputed = lines.map((ln) => {
      const hrs = computeHours(ln.startTime, ln.endTime);
      const lineTotal = Math.round(hrs * rate * 100) / 100;
      return { ...ln, hours: hrs, lineTotal };
    });
    const totalHours = Math.round(lineComputed.reduce((acc, ln) => acc + (Number(ln.hours) || 0), 0) * 100) / 100;
    const grandTotal = Math.round(lineComputed.reduce((acc, ln) => acc + (Number((ln as any).lineTotal) || 0), 0) * 100) / 100;
    return { lineComputed, totalHours, hourlyRate: rate, grandTotal };
  }, [lines, hourlyRate]);

  const canSubmit = useMemo(() => {
    if (locked || submitting) return false;
    if (!isContractorInfoComplete) return false;
    const hasAny = computed.lineComputed.some((ln) => ln.description.trim() && ln.workDate);
    return hasAny;
  }, [locked, submitting, computed.lineComputed, isContractorInfoComplete]);

  const handleChangeLine = (id: string, patch: Partial<UiLine>) => {
    setLines((prev) => prev.map((ln) => (ln.id === id ? { ...ln, ...patch } : ln)));
  };

  const handleAddLine = () => {
    if (locked) return;
    setLines((prev) => [...prev, newLine(new Date())]);
  };

  const handleRemoveLine = (id: string) => {
    if (locked) return;
    setLines((prev) => {
      const next = prev.filter((ln) => ln.id !== id);
      return next.length ? next : [newLine(new Date())];
    });
  };

  const handlePrint = async () => {
    if (!isContractorInfoComplete) {
      setContractorPanelOpen(true);
      alert('Please complete Contractor Info before printing.');
      return;
    }
    let invoiceNumber = '';
    let accountNumber = '';
    try {
      const tenantId = await resolveTenantId(user?.id);
      if (tenantId) {
        const [{ data: invNum, error: invErr }, { data: acctNum, error: acctErr }] = await Promise.all([
          supabase.rpc('next_invoice_number', { p_tenant_id: tenantId }),
          supabase.rpc('next_invoice_account_number', { p_tenant_id: tenantId }),
        ]);
        if (!invErr) invoiceNumber = formatInvoiceNumber(String(invNum || '').trim());
        if (!acctErr) accountNumber = String(acctNum || '').trim();
      }
    } catch {
    }

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

    const customer = {
      name: String(contractorInfo.name || '').trim() || fullName || email || 'Contractor',
      email: email || undefined,
      phone: String(contractorInfo.phone || '').trim() || undefined,
      address: `${String(contractorInfo.address || '').trim()}, ${String(contractorInfo.city || '').trim()}, ${String(contractorInfo.state || '').trim()} ${String(contractorInfo.zip || '').trim()}`.replace(/\s+/g, ' ').trim(),
    };

    const items = computed.lineComputed
      .filter((ln) => ln.description.trim())
      .map((ln) => ({
        description: ln.description,
        quantity: Number(ln.hours) || 0,
        price: Number(computed.hourlyRate) || 0,
        total: Number((ln as any).lineTotal) || 0,
        workDate: ln.workDate,
        startTime: ln.startTime,
        endTime: ln.endTime,
      }));

    const itemsTotalAmount = items.reduce((acc, it: any) => acc + (Number(it?.total ?? 0) || 0), 0);

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');

    const invoice = {
      invoiceNumber: invoiceNumber || `HTC-${yyyy}${mm}${dd}-${String(Date.now()).slice(-4)}`,
      accountNumber: accountNumber || undefined,
      date: `${yyyy}-${mm}-${dd}`,
      dueDate: `${yyyy}-${mm}-${dd}`,
      createdBy: fullName || email || undefined,
      amount: Number(itemsTotalAmount) || 0,
      subtotal: Number(itemsTotalAmount) || 0,
      tax: 0,
      items,
      serviceDescription: 'Consulting Services',
      total: Number(itemsTotalAmount) || 0,
      grandTotal: Number(itemsTotalAmount) || 0,
    };

    printInvoice(invoice, customer as any, company as any, 'service-hours');
  };

  const handleSubmit = async () => {
    if (!user?.id) return;
    if (!canSubmit) return;

    setSubmitting(true);
    try {
      const dbLines = computed.lineComputed
        .filter((ln) => ln.description.trim())
        .map((ln) => ({
          work_date: ln.workDate,
          description: ln.description.trim(),
          start_time: ln.startTime || null,
          end_time: ln.endTime || null,
          hours: Number(ln.hours) || 0,
          line_total: Number((ln as any).lineTotal) || 0,
        }));

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        alert('Sesión no válida. Inicia sesión nuevamente.');
        return;
      }

      const apiBase = (import.meta.env.VITE_API_BASE_URL?.trim() || window.location.origin).replace(/\/$/, '');

      const resp = await fetch(`${apiBase}/api/htc/submit`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          notes: notes.trim() ? notes.trim() : null,
          submitted_by_email: email || null,
          submitted_by_name: fullName || null,
          hourly_rate: Number(computed.hourlyRate) || 0,
          contractor: {
            name: String(contractorInfo.name || '').trim() || null,
            phone: String(contractorInfo.phone || '').trim() || null,
            address: String(contractorInfo.address || '').trim() || null,
            city: String(contractorInfo.city || '').trim() || null,
            state: String(contractorInfo.state || '').trim() || null,
            zip: String(contractorInfo.zip || '').trim() || null,
          },
          lines: dbLines,
        }),
      });

      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data?.ok) {
        throw new Error(data?.error || 'No se pudo enviar la submission');
      }

      const at = data?.submission?.submitted_at ? String(data.submission.submitted_at) : null;
      setSubmittedAt(at);
      setLocked(true);
    } catch (e: any) {
      alert(e?.message || 'Error enviando submission');
    } finally {
      setSubmitting(false);
    }
  };

  const handleNew = () => {
    setLocked(false);
    setSubmittedAt(null);
    setLines([newLine(new Date())]);
    setNotes('');
  };

  if (!user?.id) return null;
  if (loading) return null;

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <div className="text-2xl font-bold text-slate-900">HTC Service Hours</div>
            <div className="text-slate-600 text-sm">Submit your hours for approval and payment</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setContractorPanelOpen(true)}
              className="px-4 py-2 rounded-lg bg-white border border-slate-300 text-slate-800 text-sm font-semibold hover:bg-slate-50"
            >
              Contractor Info
            </button>
            <button
              onClick={handlePrint}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
            >
              Print
            </button>
            <button
              onClick={async () => {
                await signOut();
                navigate('/auth/login');
              }}
              className="px-4 py-2 rounded-lg bg-white border border-slate-300 text-slate-800 text-sm font-semibold hover:bg-slate-50"
            >
              Logout
            </button>
          </div>
        </div>

        {contractorPanelOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setContractorPanelOpen(false)}
            />
            <div className="relative w-full max-w-xl rounded-xl bg-white border border-slate-200 shadow-lg p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="text-lg font-bold text-slate-900">Contractor Info</div>
                <button
                  onClick={() => setContractorPanelOpen(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold hover:bg-slate-200"
                >
                  Close
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="text-xs font-semibold text-slate-500 mb-1">Name *</div>
                  <input
                    value={contractorInfo.name}
                    onChange={(e) => setContractorInfo((p) => ({ ...p, name: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500 mb-1">Phone *</div>
                  <input
                    value={contractorInfo.phone}
                    onChange={(e) => setContractorInfo((p) => ({ ...p, phone: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div className="md:col-span-2">
                  <div className="text-xs font-semibold text-slate-500 mb-1">Address *</div>
                  <input
                    value={contractorInfo.address}
                    onChange={(e) => setContractorInfo((p) => ({ ...p, address: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500 mb-1">City *</div>
                  <input
                    value={contractorInfo.city}
                    onChange={(e) => setContractorInfo((p) => ({ ...p, city: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500 mb-1">State *</div>
                  <input
                    value={contractorInfo.state}
                    onChange={(e) => setContractorInfo((p) => ({ ...p, state: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500 mb-1">Zip *</div>
                  <input
                    value={contractorInfo.zip}
                    onChange={(e) => setContractorInfo((p) => ({ ...p, zip: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              {!isContractorInfoComplete ? (
                <div className="mt-3 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  All fields marked with * are required.
                </div>
              ) : null}

              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  onClick={async () => {
                    if (!isContractorInfoComplete) {
                      alert('Please complete all required fields.');
                      return;
                    }

                    try {
                      if (user?.id) {
                        await supabase
                          .from('users')
                          .update({
                            full_name: String(contractorInfo.name || '').trim() || null,
                            phone: String(contractorInfo.phone || '').trim() || null,
                            address: String(contractorInfo.address || '').trim() || null,
                            city: String(contractorInfo.city || '').trim() || null,
                            state: String(contractorInfo.state || '').trim() || null,
                            zip: String(contractorInfo.zip || '').trim() || null,
                            updated_at: new Date().toISOString(),
                          } as any)
                          .eq('id', user.id);
                      }
                    } catch (e) {
                      console.warn('Failed to persist contractor info to profile', e);
                    }

                    setContractorPanelOpen(false);
                  }}
                  className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {locked ? (
          <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900 text-sm flex items-center justify-between gap-3">
            <div>
              Submitted{submittedAt ? `: ${new Date(submittedAt).toLocaleString()}` : ''}
            </div>
            <button
              onClick={handleNew}
              className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800"
            >
              New
            </button>
          </div>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="rounded-xl bg-white border border-slate-200 p-4">
            <div className="text-xs font-semibold text-slate-500 mb-1">Name</div>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={locked}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <div className="rounded-xl bg-white border border-slate-200 p-4">
            <div className="text-xs font-semibold text-slate-500 mb-1">Email</div>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={locked}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
        </div>

        <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider w-36">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Description</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider w-40">Start</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider w-40">End</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider w-24">Hours</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {computed.lineComputed.map((ln) => (
                  <tr key={ln.id}>
                    <td className="px-4 py-2">
                      <input
                        type="date"
                        value={ln.workDate}
                        onChange={(e) => handleChangeLine(ln.id, { workDate: e.target.value })}
                        disabled={locked}
                        className="w-full px-2 py-1.5 rounded-lg border border-slate-300"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        value={ln.description}
                        onChange={(e) => handleChangeLine(ln.id, { description: e.target.value })}
                        disabled={locked}
                        className="w-full px-2 py-1.5 rounded-lg border border-slate-300"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="time"
                        value={ln.startTime}
                        onChange={(e) => handleChangeLine(ln.id, { startTime: e.target.value })}
                        disabled={locked}
                        className="w-full px-2 py-1.5 rounded-lg border border-slate-300"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="time"
                        value={ln.endTime}
                        onChange={(e) => handleChangeLine(ln.id, { endTime: e.target.value })}
                        disabled={locked}
                        className="w-full px-2 py-1.5 rounded-lg border border-slate-300"
                      />
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-700">
                      {ln.hours ? ln.hours.toFixed(2).replace(/\.00$/, '') : ''}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => handleRemoveLine(ln.id)}
                        disabled={locked}
                        className="px-2 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold hover:bg-slate-200 disabled:opacity-40"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-4 border-t border-slate-200 flex items-center justify-between gap-4 flex-wrap">
            <button
              onClick={handleAddLine}
              disabled={locked}
              className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-950 disabled:opacity-40"
            >
              Add line
            </button>

            <div className="flex items-center gap-6">
              <div className="text-lg font-extrabold text-slate-900">
                Grand Total Hours: <span className="text-emerald-700">{computed.totalHours ? computed.totalHours.toFixed(2).replace(/\.00$/, '') : '0'}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-xl bg-white border border-slate-200 p-4">
          <div className="text-xs font-semibold text-slate-500 mb-1">Notes</div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={locked}
            className="w-full min-h-[90px] px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 disabled:opacity-40"
            >
              {submitting ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
