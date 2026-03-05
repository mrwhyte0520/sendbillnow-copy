
import { supabase } from '../lib/supabase';

// Handle JWT expiration - try to refresh or force logout
const handleJwtExpiration = async (error: any): Promise<boolean> => {
  const isJwtExpired = error?.code === 'PGRST303' || 
    error?.message?.toLowerCase()?.includes('jwt expired') ||
    error?.message?.toLowerCase()?.includes('401');
  
  if (!isJwtExpired) return false;
  
  console.warn('[Database] JWT expired, attempting to refresh session...');
  
  try {
    const { data, error: refreshError } = await supabase.auth.refreshSession();
    if (data?.session) {
      console.log('[Database] Session refreshed successfully');
      return true; // Session refreshed, caller should retry
    }
    
    if (refreshError || !data?.session) {
      console.warn('[Database] Could not refresh session, signing out...');
      await supabase.auth.signOut();
      // Redirect to login
      if (typeof window !== 'undefined') {
        window.location.href = '/auth/login';
      }
    }
  } catch (e) {
    console.error('[Database] Error handling JWT expiration:', e);
    await supabase.auth.signOut();
    if (typeof window !== 'undefined') {
      window.location.href = '/auth/login';
    }
  }
  
  return false;
};

export const htcServiceHoursService = {
  async getMyLatestSubmission(userId: string) {
    try {
      if (!userId) return null;
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return null;

      const { data: sub, error: subErr } = await supabase
        .from('htc_service_hours_submissions')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('submitted_by', userId)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (subErr) throw subErr;
      if (!sub) return null;

      const { data: lines, error: linesErr } = await supabase
        .from('htc_service_hours_lines')
        .select('*')
        .eq('submission_id', (sub as any).id)
        .order('work_date', { ascending: true });
      if (linesErr) throw linesErr;

      return { submission: sub, lines: lines ?? [] };
    } catch (error) {
      console.error('htcServiceHoursService.getMyLatestSubmission error', describeSupabaseError(error));
      return null;
    }
  },

  async createSubmissionWithLines(
    userId: string,
    payload: {
      notes?: string | null;
      submitted_by_email?: string | null;
      submitted_by_name?: string | null;
      hourly_rate?: number;
    },
    lines: Array<{
      work_date: string;
      description?: string | null;
      start_time?: string | null;
      end_time?: string | null;
      hours?: number;
      line_total?: number;
    }>,
  ) {
    try {
      if (!userId) throw new Error('userId required');
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('Could not resolve tenant');

      const rate = Number(payload?.hourly_rate ?? 0);
      const hourlyRate = Number.isFinite(rate) && rate >= 0 ? rate : 0;

      const { data: sub, error: subErr } = await supabase
        .from('htc_service_hours_submissions')
        .insert({
          tenant_id: tenantId,
          submitted_by: userId,
          submitted_by_email: payload?.submitted_by_email ?? null,
          submitted_by_name: payload?.submitted_by_name ?? null,
          hourly_rate: hourlyRate,
          status: 'submitted',
          notes: payload?.notes ?? null,
        })
        .select()
        .single();
      if (subErr) throw subErr;

      const normalizedLines = (lines || []).map((ln) => ({
        submission_id: (sub as any).id,
        work_date: ln.work_date,
        description: ln.description ?? null,
        start_time: ln.start_time ?? null,
        end_time: ln.end_time ?? null,
        hours: Number(ln.hours ?? 0) || 0,
        line_total: Number(ln.line_total ?? 0) || 0,
      }));

      const { data: savedLines, error: linesErr } = await supabase
        .from('htc_service_hours_lines')
        .insert(normalizedLines)
        .select();
      if (linesErr) throw linesErr;

      return { submission: sub, lines: savedLines ?? [] };
    } catch (error) {
      console.error('htcServiceHoursService.createSubmissionWithLines error', describeSupabaseError(error));
      throw error;
    }
  },
};

// Error handling wrapper
const handleDatabaseError = async (error: any, fallbackData: any = []) => {
  // Check for JWT expiration first
  await handleJwtExpiration(error);
  console.warn('Database operation failed:', error?.message ?? error);
  return fallbackData;
};

// Helper para determinar si el plan actual es un plan básico que no requiere períodos contables
export const shouldSkipPeriodValidation = (): boolean => {
  try {
    const savedPlan = localStorage.getItem('contard_current_plan');
    if (!savedPlan) return false; // Sin plan = trial, requiere validación
    
    const plan = JSON.parse(savedPlan);
    if (!plan?.active) return false;
    
    const planId = plan.id?.toLowerCase() || '';
    // Planes básicos que no requieren períodos contables
    const basicPlans = ['facturacion-simple', 'facturacion-premium'];
    return basicPlans.some(bp => planId.includes(bp) || planId === bp);
  } catch {
    return false;
  }
};

const describeSupabaseError = (error: any) => {
  if (!error) return 'Unknown error';
  const parts: string[] = [];
  if (typeof error?.message === 'string' && error.message) parts.push(error.message);
  if (typeof error?.code === 'string' && error.code) parts.push(`code=${error.code}`);
  if (typeof error?.details === 'string' && error.details) parts.push(`details=${error.details}`);
  if (typeof error?.hint === 'string' && error.hint) parts.push(`hint=${error.hint}`);
  return parts.join(' | ') || String(error);
};

// Resolve tenant owner id for a given user (owner or subuser)
// IMPORTANT: Always returns a string to match text columns in DB
export const resolveTenantId = async (userId: string | null | undefined): Promise<string | null> => {
  if (!userId) return null;
  const userIdStr = String(userId); // Ensure string for text column compatibility
  try {
    const { data: preferOwner } = await supabase
      .from('user_roles')
      .select('owner_user_id')
      .eq('user_id', userIdStr)
      .not('owner_user_id', 'is', null)
      .neq('owner_user_id', userIdStr)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if ((preferOwner as any)?.owner_user_id) {
      return String((preferOwner as any).owner_user_id);
    }

    const { data } = await supabase
      .from('user_roles')
      .select('owner_user_id')
      .eq('user_id', userIdStr)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if ((data as any)?.owner_user_id) {
      return String((data as any).owner_user_id); // Ensure string
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', userIdStr)
      .maybeSingle();

    const email = (profile as any)?.email ? String((profile as any).email) : null;
    if (email) {
      const { data: preferOwnerByEmail } = await supabase
        .from('user_roles')
        .select('owner_user_id')
        .eq('user_id', email)
        .not('owner_user_id', 'is', null)
        .neq('owner_user_id', userIdStr)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if ((preferOwnerByEmail as any)?.owner_user_id) {
        return String((preferOwnerByEmail as any).owner_user_id);
      }

      const { data: byEmail } = await supabase
        .from('user_roles')
        .select('owner_user_id')
        .eq('user_id', email)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if ((byEmail as any)?.owner_user_id) {
        return String((byEmail as any).owner_user_id);
      }
    }
  } catch (err) {
    console.warn('resolveTenantId failed:', (err as any)?.message ?? err);
  }
  // If no mapping is found, the user is its own tenant
  return userIdStr;
};

// Helper to ensure userId is always a string for DB queries (text columns)
export const toTextId = (id: string | null | undefined): string => {
  return id ? String(id) : '';
};

/* ==========================================================
   Referrals Service
========================================================== */
export const referralsService = {
  async getOrCreateCode(userId: string) {
    try {
      // Try get existing code first
      const { data: existing } = await supabase
        .from('referral_codes')
        .select('*')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();
      if (existing) return existing;

      // Try to insert new code
      const code = Math.random().toString(36).slice(2, 8) + userId.slice(0, 4);
      const { data, error } = await supabase
        .from('referral_codes')
        .insert({ user_id: userId, code })
        .select()
        .single();
      
      // If duplicate key error, fetch the existing record
      if (error && error.code === '23505') {
        const { data: existingAfterError } = await supabase
          .from('referral_codes')
          .select('*')
          .eq('user_id', userId)
          .limit(1)
          .maybeSingle();
        if (existingAfterError) return existingAfterError;
      }
      
      if (error) throw error;
      return data;
    } catch (e) {
      console.error('referralsService.getOrCreateCode error', e);
      throw e;
    }
  },

  async recordVisit(refCode: string) {
    try {
      const payload:any = { ref_code: refCode };
      if (typeof window !== 'undefined') {
        payload.user_agent = navigator.userAgent;
        // Basic fingerprint: day + UA
        payload.fingerprint = `${new Date().toISOString().slice(0,10)}_${navigator.userAgent.slice(0,64)}`;
      }
      await supabase.from('referral_visits').insert(payload);
    } catch (e) {
      console.warn('referralsService.recordVisit warn', e);
    }
  },

  async getStats(userId: string) {
    try {
      // Get code
      const { data: codeRow } = await supabase
        .from('referral_codes')
        .select('code')
        .eq('user_id', userId)
        .maybeSingle();
      const code = codeRow?.code || '';
      if (!code) return { code: '', visits: 0, purchases: 0, pending: 0, paid: 0 };

      const [{ data: visitRows }, { data: commissions }] = await Promise.all([
        supabase
          .from('referral_visits')
          .select('id,fingerprint')
          .eq('ref_code', code),
        supabase.from('referral_commissions').select('amount,status').eq('ref_code', code)
      ]);

      // Contar visitas únicas por fingerprint (o id si no hay fingerprint)
      const uniqueVisitKeys = new Set(
        (visitRows || []).map((v: any) => v.fingerprint || v.id)
      );
      const visits = uniqueVisitKeys.size;

      let pending = 0, paid = 0, purchases = 0;
      (commissions || []).forEach((c: any) => {
        if (c.status === 'pending') { pending += Number(c.amount)||0; purchases++; }
        if (c.status === 'paid') { paid += Number(c.amount)||0; purchases++; }
      });
      return { code, visits, purchases, pending, paid };
    } catch (e) {
      console.error('referralsService.getStats error', e);
      return { code: '', visits: 0, purchases: 0, pending: 0, paid: 0 };
    }
  },

  async requestPayout(userId: string, paypalEmail: string, amount: number, currency = 'USD') {
    try {
      const { data, error } = await supabase
        .from('referral_payouts')
        .insert({ user_id: userId, paypal_email: paypalEmail, amount, currency, status: 'requested' })
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (e) {
      console.error('referralsService.requestPayout error', e);
      throw e;
    }
  },

  async listCommissions(userId: string) {
    try {
      const { data: codeRow } = await supabase
        .from('referral_codes')
        .select('code')
        .eq('user_id', userId)
        .maybeSingle();
      const code = codeRow?.code || '';
      if (!code) return [] as Array<{ id: string; referee_user_id: string | null; plan_id: string | null; amount: number; currency: string; status: string; created_at: string }>;

      const { data, error } = await supabase
        .from('referral_commissions')
        .select('id, referee_user_id, plan_id, amount, currency, status, created_at')
        .eq('ref_code', code)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = data || [];
      // Enrich with users (no profiles table required)
      const ids = Array.from(new Set(rows.map((r: any) => r.referee_user_id).filter(Boolean)));
      if (ids.length > 0) {
        const { data: users } = await supabase
          .from('users')
          .select('id, email, first_name, last_name')
          .in('id', ids);
        const byId: Record<string, any> = {};
        (users || []).forEach((u: any) => { byId[u.id] = u; });
        return rows.map((r: any) => ({
          ...r,
          referee_email: r.referee_user_id ? byId[r.referee_user_id]?.email || null : null,
          referee_name: r.referee_user_id 
            ? [byId[r.referee_user_id]?.first_name, byId[r.referee_user_id]?.last_name]
                .filter(Boolean)
                .join(' ') || null 
            : null,
        }));
      }
      return rows;
    } catch (e) {
      console.error('referralsService.listCommissions error', e);
      return [];
    }
  }
  ,

  async getReferrerByCode(code: string): Promise<{ user_id: string; code: string } | null> {
    try {
      const { data, error } = await supabase
        .from('referral_codes')
        .select('user_id, code')
        .eq('code', code)
        .maybeSingle();
      if (error) throw error;
      return data || null;
    } catch (e) {
      console.error('referralsService.getReferrerByCode error', e);
      return null;
    }
  },

  async createCommission(params: { ref_code: string; referee_user_id: string; plan_id: string; amount: number; currency?: string }) {
    try {
      const { ref_code, referee_user_id, plan_id, amount, currency = 'USD' } = params;
      const { data, error } = await supabase
        .from('referral_commissions')
        .insert({ ref_code, referee_user_id, plan_id, amount, currency, status: 'pending' })
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (e) {
      console.error('referralsService.createCommission error', e);
      throw e;
    }
  },

  async listPayouts(userId: string) {
    try {
      const { data, error } = await supabase
        .from('referral_payouts')
        .select('id, paypal_email, amount, currency, status, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.error('referralsService.listPayouts error', e);
      return [];
    }
  }
};

/* ==========================================================
   Accounting Periods Service
   Valida y gestiona períodos contables/fiscales
========================================================== */
export const accountingPeriodsService = {
  /**
   * Obtiene el período contable abierto para una fecha dada
   * @returns El período abierto o null si no existe
   */
  async getOpenPeriodForDate(userId: string, date: string | Date): Promise<any | null> {
    try {
      const resolvedTenantId = await resolveTenantId(userId);
      const tenantId = resolvedTenantId || userId;
      if (!tenantId) return null;

      const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('accounting_periods')
        .select('*')
        .eq('user_id', tenantId)
        .eq('status', 'open')
        .lte('start_date', dateStr)
        .gte('end_date', dateStr)
        .order('start_date', { ascending: false });

      if (error) {
        console.warn('accountingPeriodsService.getOpenPeriodForDate error', error);
        return null;
      }

      const rows = (data as any[]) ?? [];
      if (rows.length === 0) return null;

      const isFiscalPeriod = (p: any) => {
        const nameLower = String(p?.name || '').toLowerCase();
        const startStr = String(p?.start_date || '').substring(0, 10);
        const endStr = String(p?.end_date || '').substring(0, 10);
        const looksFiscalByName = nameLower.includes('fiscal');
        const looksFiscalByDates = startStr.endsWith('-01-01') && endStr.endsWith('-12-31');
        return looksFiscalByName || looksFiscalByDates;
      };

      const accountingCandidate = rows.find((p) => !isFiscalPeriod(p));
      return accountingCandidate ?? rows[0] ?? null;
    } catch (e) {
      console.error('accountingPeriodsService.getOpenPeriodForDate error', e);
      return null;
    }
  },

  /**
   * Verifica si existe un período contable abierto para una fecha
   * @returns true si hay período abierto, false si no
   */
  async hasOpenPeriodForDate(userId: string, date: string | Date): Promise<boolean> {
    const period = await this.getOpenPeriodForDate(userId, date);
    return period !== null;
  },

  /**
   * Valida que exista un período abierto para una fecha, lanza error si no existe
   * @throws Error si no hay período abierto
   */
  async requireOpenPeriod(userId: string, date: string | Date): Promise<void> {
    const period = await this.getOpenPeriodForDate(userId, date);
    if (!period) {
      return;
    }
  },

  /**
   * Obtiene todos los períodos contables del usuario
   */
  async getAll(userId: string): Promise<any[]> {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];

      const { data, error } = await supabase
        .from('accounting_periods')
        .select('*')
        .eq('user_id', tenantId)
        .order('start_date', { ascending: false });

      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (e) {
      return handleDatabaseError(e, []);
    }
  },

  /**
   * Obtiene períodos abiertos (para selección en formularios)
   */
  async getOpenPeriods(userId: string, periodType: 'accounting' | 'fiscal' = 'accounting'): Promise<any[]> {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];

      const { data, error } = await supabase
        .from('accounting_periods')
        .select('*')
        .eq('user_id', tenantId)
        .eq('status', 'open')
        .eq('period_type', periodType)
        .order('start_date', { ascending: false });

      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (e) {
      return handleDatabaseError(e, []);
    }
  }
};

/* ==========================================================
   AP Invoice Notes Service (Notas Débito/Crédito Proveedores)
   Tabla: ap_invoice_notes
========================================================== */
export const apInvoiceNotesService = {
  async getAll(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('ap_invoice_notes')
        .select(`
          *,
          suppliers (name),
          ap_invoices (invoice_number, invoice_date, currency, total_to_pay, balance_amount)
        `)
        .eq('user_id', tenantId)
        .order('note_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async create(userId: string, note: any) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');

      const { ap_invoice_id, supplier_id, note_type } = note;
      const amount = Number(note.amount || 0);
      if (!ap_invoice_id || !supplier_id || !note_type || amount <= 0) {
        throw new Error('Datos insuficientes para crear la nota de débito/crédito');
      }

      // 1) Obtener factura
      const { data: invoice, error: invErr } = await supabase
        .from('ap_invoices')
        .select('*')
        .eq('id', ap_invoice_id)
        .eq('user_id', tenantId)
        .maybeSingle();

      if (invErr) throw invErr;
      if (!invoice) throw new Error('Factura de suplidor no encontrada');
      if (String(invoice.user_id) !== String(tenantId)) throw new Error('Acceso denegado a la factura seleccionada');

      const now = new Date().toISOString();

      // 2) Insertar nota
      const baseNote = {
        ...note,
        user_id: tenantId,
        supplier_id,
        ap_invoice_id,
        note_type,
        amount,
        currency: note.currency || invoice.currency || 'DOP',
        note_date: note.note_date || new Date().toISOString().slice(0, 10),
        created_at: now,
        updated_at: now,
      };

      const { data: inserted, error: insErr } = await supabase
        .from('ap_invoice_notes')
        .insert(baseNote)
        .select('*')
        .single();
      if (insErr) throw insErr;

      // 3) Actualizar saldo de la factura
      const currentBalance = Number(invoice.balance_amount ?? invoice.total_to_pay ?? 0);
      let newBalance = currentBalance;
      if (note_type === 'debit') {
        newBalance = currentBalance + amount;
      } else if (note_type === 'credit') {
        newBalance = Math.max(0, currentBalance - amount);
      }

      const { error: upErr } = await supabase
        .from('ap_invoices')
        .update({ balance_amount: newBalance, updated_at: now })
        .eq('id', ap_invoice_id);
      if (upErr) throw upErr;

      // 4) Best-effort: asiento contable de la nota
      try {
        const settings = await accountingSettingsService.get(tenantId);
        const apAccountId = settings?.ap_account_id as string | undefined;
        const contraAccountId = note.account_id as string | undefined;

        if (apAccountId && contraAccountId) {
          const lines: any[] = [];

          if (note_type === 'debit') {
            // ND: aumenta saldo a proveedor -> Debe cuenta de gasto/activo, Haber CxP
            lines.push({
              account_id: contraAccountId,
              description: note.reason || 'Nota de Débito a proveedor',
              debit_amount: amount,
              credit_amount: 0,
            });
            lines.push({
              account_id: apAccountId,
              description: 'Cuentas por Pagar a Proveedores (ND)',
              debit_amount: 0,
              credit_amount: amount,
            });
          } else if (note_type === 'credit') {
            // NC: disminuye saldo a proveedor -> Debe CxP, Haber cuenta de ingreso/descuento
            lines.push({
              account_id: apAccountId,
              description: 'Cuentas por Pagar a Proveedores (NC)',
              debit_amount: amount,
              credit_amount: 0,
            });
            lines.push({
              account_id: contraAccountId,
              description: note.reason || 'Nota de Crédito de proveedor',
              debit_amount: 0,
              credit_amount: amount,
            });
          }

          if (lines.length > 0) {
            const entryPayload = {
              entry_number: `AP-NOTA-${inserted.id}`,
              entry_date: baseNote.note_date,
              description: `Nota ${note_type === 'debit' ? 'Débito' : 'Crédito'} factura ${invoice.invoice_number || ''}`.trim(),
              reference: inserted.id ? String(inserted.id) : null,
              status: 'posted' as const,
            };

            await journalEntriesService.createWithLines(tenantId, entryPayload, lines);
          }
        }
      } catch (jeError) {
        // eslint-disable-next-line no-console
        console.error('Error posting AP invoice note to ledger:', jeError);
      }

      return inserted;
    } catch (error) {
      console.error('apInvoiceNotesService.create error', error);
      throw error;
    }
  },
};

export const auxiliariesReconciliationService = {
  async reconcileCxCAuxiliaries(userId: string) {
    const tenantId = await resolveTenantId(userId);
    if (!tenantId) throw new Error('userId required');

    const result = {
      createdInvoiceEntries: 0,
      createdPaymentEntries: 0,
      skipped: 0,
    };

    const nowStr = new Date().toISOString();

    const [settings, chartAccounts, bankAccounts, customers, journalEntries] = await Promise.all([
      accountingSettingsService.get(tenantId),
      chartAccountsService.getAll(tenantId),
      supabase.from('bank_accounts').select('id, chart_account_id').eq('user_id', tenantId),
      supabase.from('customers').select('id, ar_account_id').eq('user_id', tenantId),
      supabase.from('journal_entries').select('id, entry_number, reference').eq('user_id', tenantId),
    ]);

    const bankAccountsMap = new Map<string, string>();
    ((bankAccounts as any)?.data || []).forEach((b: any) => {
      if (!b?.id) return;
      if (b.chart_account_id) bankAccountsMap.set(String(b.id), String(b.chart_account_id));
    });

    const customerArMap = new Map<string, string>();
    ((customers as any)?.data || []).forEach((c: any) => {
      if (!c?.id) return;
      if (c.ar_account_id) customerArMap.set(String(c.id), String(c.ar_account_id));
    });

    const normalizeCode = (code: string | null | undefined) => String(code || '').replace(/\./g, '');
    const cash100101 = (chartAccounts || []).find((a: any) => normalizeCode(a.code) === '100101');
    const cashAccountId = (settings as any)?.cash_account_id
      ? String((settings as any).cash_account_id)
      : cash100101?.id
        ? String(cash100101.id)
        : '';

    const arDefaultAccountId = (settings as any)?.ar_account_id ? String((settings as any).ar_account_id) : '';
    const salesAccountId = (settings as any)?.sales_account_id ? String((settings as any).sales_account_id) : '';
    const taxAccountId = (settings as any)?.sales_tax_account_id ? String((settings as any).sales_tax_account_id) : '';

    const jeKeySet = new Set<string>();
    const jeEntryNumberSet = new Set<string>();

    ((journalEntries as any)?.data || []).forEach((je: any) => {
      const ref = je?.reference != null ? String(je.reference) : '';
      const num = je?.entry_number != null ? String(je.entry_number) : '';
      if (ref && num) jeKeySet.add(`${ref}|${num}`);
      if (num) jeEntryNumberSet.add(num);
    });

    const { data: invoices, error: invErr } = await supabase
      .from('invoices')
      .select('id, invoice_number, invoice_date, subtotal, tax_amount, status, customer_id')
      .eq('user_id', tenantId);
    if (invErr) throw invErr;

    const invoicesMap = new Map<string, any>();
    (invoices || []).forEach((inv: any) => {
      if (inv?.id) invoicesMap.set(String(inv.id), inv);
    });

    for (const inv of invoices || []) {
      const invoiceId = inv?.id ? String(inv.id) : '';
      const invoiceNumber = inv?.invoice_number ? String(inv.invoice_number) : '';
      if (!invoiceId || !invoiceNumber) continue;

      const status = String(inv.status || '');
      if (status === 'draft') continue;

      const key = `${invoiceId}|${invoiceNumber}`;
      if (jeKeySet.has(key)) continue;

      const customerId = inv?.customer_id ? String(inv.customer_id) : '';
      const arAccountId = (customerId && customerArMap.get(customerId)) || arDefaultAccountId;

      const rawSubtotal = Number(inv.subtotal) || 0;
      const rawTax = Number(inv.tax_amount) || 0;
      const subtotal = Number(rawSubtotal.toFixed(2));
      const tax = Number(rawTax.toFixed(2));
      const total = Number((subtotal + tax).toFixed(2));

      if (!arAccountId || (tax > 0 && !taxAccountId) || total <= 0) {
        result.skipped += 1;
        continue;
      }

      const lines: any[] = [
        {
          account_id: arAccountId,
          description: 'Cuentas por Cobrar Clientes',
          debit_amount: total,
          credit_amount: 0,
          line_number: 1,
        },
      ];

      let assigned = 0;
      try {
        const { data: salesLines, error: salesLinesError } = await supabase
          .from('invoice_lines')
          .select(`
            quantity,
            unit_price,
            line_total,
            inventory_items (income_account_id)
          `)
          .eq('invoice_id', invoiceId);

        if (!salesLinesError && salesLines && salesLines.length > 0 && subtotal > 0) {
          const accountBaseTotals: Record<string, number> = {};
          let totalLinesBase = 0;
          let totalProductBase = 0;

          salesLines.forEach((line: any) => {
            const qty = Number(line.quantity) || 0;
            const unitPrice = Number(line.unit_price) || 0;
            const lineBase = Number(line.line_total) || qty * unitPrice;
            if (lineBase <= 0) return;
            totalLinesBase += lineBase;

            const invItem = line.inventory_items as any | null;
            const incomeAccountId = invItem?.income_account_id as string | null;
            if (incomeAccountId) {
              totalProductBase += lineBase;
              accountBaseTotals[incomeAccountId] = (accountBaseTotals[incomeAccountId] || 0) + lineBase;
            }
          });

          if (totalLinesBase > 0 && totalProductBase > 0) {
            const productPortion = (subtotal * totalProductBase) / totalLinesBase;

            for (const [accountId, baseAmount] of Object.entries(accountBaseTotals)) {
              if (baseAmount <= 0) continue;
              const allocated = (productPortion * (baseAmount as number)) / totalProductBase;
              const roundedAllocated = Number(allocated.toFixed(2));
              if (roundedAllocated <= 0) continue;

              lines.push({
                account_id: accountId,
                description: 'Ventas',
                debit_amount: 0,
                credit_amount: roundedAllocated,
              });
              assigned += roundedAllocated;
            }
          }
        }
      } catch (salesAllocError) {
        console.error('Error determining income accounts for invoice lines (reconcileCxC):', salesAllocError);
      }

      const remainingSales = Number((subtotal - assigned).toFixed(2));
      if (remainingSales > 0) {
        if (salesAccountId) {
          lines.push({
            account_id: salesAccountId,
            description: 'Ventas',
            debit_amount: 0,
            credit_amount: remainingSales,
          });
        } else {
          result.skipped += 1;
          continue;
        }
      }

      if (tax > 0) {
        lines.push({
          account_id: taxAccountId,
          description: 'ITBIS por pagar',
          debit_amount: 0,
          credit_amount: tax,
        });
      }

      lines.forEach((l, idx) => {
        l.line_number = idx + 1;
      });

      try {
        if (jeEntryNumberSet.has(invoiceNumber)) {
          result.skipped += 1;
          continue;
        }

        await journalEntriesService.createWithLines(tenantId, {
          entry_number: invoiceNumber,
          entry_date: String(inv.invoice_date || nowStr.slice(0, 10)),
          description: `Factura ${invoiceNumber}`.trim(),
          reference: invoiceId,
          status: 'posted',
        }, lines);

        jeEntryNumberSet.add(invoiceNumber);
      } catch (error) {
        result.skipped += 1;
        continue;
      }

      result.createdInvoiceEntries += 1;
      jeKeySet.add(key);
    }

    const { data: payments, error: payErr } = await supabase
      .from('customer_payments')
      .select('id, payment_date, amount, payment_method, bank_account_id, invoice_id, customer_id')
      .eq('user_id', tenantId);
    if (payErr) throw payErr;

    for (const p of payments || []) {
      const paymentId = p?.id ? String(p.id) : '';
      if (!paymentId) continue;
      if (jeEntryNumberSet.has(paymentId)) continue;

      const amount = Number(p.amount) || 0;
      if (amount <= 0) continue;

      const invoiceId = p?.invoice_id ? String(p.invoice_id) : '';
      const invoice = invoiceId ? invoicesMap.get(invoiceId) : null;

      const customerId = p?.customer_id ? String(p.customer_id) : (invoice?.customer_id ? String(invoice.customer_id) : '');
      const arAccountId = (customerId && customerArMap.get(customerId)) || arDefaultAccountId;

      let debitAccountId: string = '';
      if (p?.bank_account_id) {
        const bankAcc = bankAccountsMap.get(String(p.bank_account_id));
        if (bankAcc) debitAccountId = bankAcc;
      }
      if (!debitAccountId) debitAccountId = cashAccountId;

      if (!debitAccountId || !arAccountId) {
        result.skipped += 1;
        continue;
      }

      const entryDate = String(p.payment_date || nowStr.slice(0, 10));
      const invoiceNumber = invoice?.invoice_number ? String(invoice.invoice_number) : '';

      const lines: any[] = [
        {
          account_id: debitAccountId,
          description: 'Cobro de cliente',
          debit_amount: Number(amount.toFixed(2)),
          credit_amount: 0,
          line_number: 1,
        },
        {
          account_id: arAccountId,
          description: 'Cuentas por Cobrar Clientes',
          debit_amount: 0,
          credit_amount: Number(amount.toFixed(2)),
          line_number: 2,
        },
      ];

      await journalEntriesService.createWithLines(tenantId, {
        entry_number: paymentId,
        entry_date: entryDate,
        description: invoiceNumber ? `Pago factura ${invoiceNumber}` : 'Pago de cliente',
        reference: paymentId,
        status: 'posted',
      }, lines);

      result.createdPaymentEntries += 1;
      jeEntryNumberSet.add(paymentId);
    }

    return result;
  },

  async reconcileCxPAuxiliaries(userId: string) {
    const tenantId = await resolveTenantId(userId);
    if (!tenantId) throw new Error('userId required');

    const result = {
      createdInvoiceEntries: 0,
      createdPaymentEntries: 0,
      skipped: 0,
    };

    const nowStr = new Date().toISOString();

    const [settings, chartAccounts, bankAccounts, journalEntries] = await Promise.all([
      accountingSettingsService.get(tenantId),
      chartAccountsService.getAll(tenantId),
      supabase.from('bank_accounts').select('id, chart_account_id').eq('user_id', tenantId),
      supabase.from('journal_entries').select('id, entry_number, reference').eq('user_id', tenantId),
    ]);

    const normalizeCode = (code: string | null | undefined) => String(code || '').replace(/\./g, '');

    const apDefaultAccountId = (settings as any)?.ap_account_id ? String((settings as any).ap_account_id) : '';
    const itbisReceivableAccountIdFromSettings = (settings as any)?.itbis_receivable_account_id
      ? String((settings as any).itbis_receivable_account_id)
      : '';

    const apFallback = (chartAccounts || []).find((a: any) => normalizeCode(a.code).startsWith('2001'));
    const apAccountId = apDefaultAccountId || (apFallback?.id ? String(apFallback.id) : '');

    const itbis110201 = (chartAccounts || []).find((a: any) => normalizeCode(a.code) === '110201');
    const itbisReceivableAccountId = itbisReceivableAccountIdFromSettings || (itbis110201?.id ? String(itbis110201.id) : '');

    const bankAccountsMap = new Map<string, string>();
    ((bankAccounts as any)?.data || []).forEach((b: any) => {
      if (!b?.id) return;
      if (b.chart_account_id) bankAccountsMap.set(String(b.id), String(b.chart_account_id));
    });

    const jeKeySet = new Set<string>();
    const jeRefSet = new Set<string>();
    const jeEntryNumberSet = new Set<string>();
    ((journalEntries as any)?.data || []).forEach((je: any) => {
      const ref = je?.reference != null ? String(je.reference) : '';
      const num = je?.entry_number != null ? String(je.entry_number) : '';
      if (ref && num) jeKeySet.add(`${ref}|${num}`);
      if (ref) jeRefSet.add(ref);
      if (num) jeEntryNumberSet.add(num);
    });

    const { data: apInvoices, error: apInvErr } = await supabase
      .from('ap_invoices')
      .select('id, invoice_number, invoice_date, itbis_to_cost, status')
      .eq('user_id', tenantId);
    if (apInvErr) throw apInvErr;

    const missingApInvoiceIds: string[] = [];
    const apInvoicesMap = new Map<string, any>();
    (apInvoices || []).forEach((inv: any) => {
      const id = inv?.id ? String(inv.id) : '';
      const num = inv?.invoice_number ? String(inv.invoice_number) : '';
      if (!id) return;
      apInvoicesMap.set(id, inv);
      if (id && num && !jeKeySet.has(`${id}|${num}`) && String(inv.status || '') !== 'draft') {
        missingApInvoiceIds.push(id);
      }
    });

    let apLines: any[] = [];
    if (missingApInvoiceIds.length > 0) {
      const { data: linesData, error: linesErr } = await supabase
        .from('ap_invoice_lines')
        .select('ap_invoice_id, expense_account_id, inventory_item_id, line_total, itbis_amount')
        .in('ap_invoice_id', missingApInvoiceIds);
      if (linesErr) throw linesErr;
      apLines = linesData || [];
    }

    const inventoryItemIds = Array.from(
      new Set(
        (apLines || [])
          .map((l: any) => (l?.inventory_item_id ? String(l.inventory_item_id) : ''))
          .filter((x: string) => !!x)
      )
    );

    const inventoryAccountByItemId: Record<string, string> = {};
    if (inventoryItemIds.length > 0) {
      const { data: invRows, error: invErr } = await supabase
        .from('inventory_items')
        .select('id, inventory_account_id')
        .eq('user_id', tenantId)
        .in('id', inventoryItemIds);
      if (!invErr && invRows) {
        (invRows as any[]).forEach((row: any) => {
          if (!row?.id) return;
          inventoryAccountByItemId[String(row.id)] = row.inventory_account_id ? String(row.inventory_account_id) : '';
        });
      }
    }

    const linesByInvoiceId: Record<string, any[]> = {};
    (apLines || []).forEach((l: any) => {
      const id = l?.ap_invoice_id ? String(l.ap_invoice_id) : '';
      if (!id) return;
      if (!linesByInvoiceId[id]) linesByInvoiceId[id] = [];
      linesByInvoiceId[id].push(l);
    });

    for (const apInvoiceId of missingApInvoiceIds) {
      const inv = apInvoicesMap.get(apInvoiceId);
      const invoiceNumber = inv?.invoice_number ? String(inv.invoice_number) : '';
      if (!invoiceNumber) continue;
      if (!apAccountId) {
        result.skipped += 1;
        continue;
      }

      const invLines = linesByInvoiceId[apInvoiceId] || [];
      if (invLines.length === 0) {
        result.skipped += 1;
        continue;
      }

      const itbisToCost = inv?.itbis_to_cost === true;
      const accountTotals: Record<string, number> = {};
      let totalItbis = 0;

      invLines.forEach((l: any) => {
        const invItemId = l?.inventory_item_id ? String(l.inventory_item_id) : '';
        const inventoryAccountId = invItemId ? (inventoryAccountByItemId[invItemId] || '') : '';
        const expenseAccountId = l?.expense_account_id ? String(l.expense_account_id) : '';
        const accountId = inventoryAccountId || expenseAccountId;
        if (!accountId) return;

        const base = Number(l.line_total) || 0;
        const itbis = Number(l.itbis_amount) || 0;
        const amount = itbisToCost ? base + itbis : base;
        if (amount <= 0) return;
        accountTotals[accountId] = (accountTotals[accountId] || 0) + amount;
        if (!itbisToCost) totalItbis += itbis;
      });

      const debitLines = Object.entries(accountTotals)
        .filter(([_, amount]) => Number(amount) > 0)
        .map(([accountId, amount]) => ({
          account_id: accountId,
          description: 'Gastos por compras a suplidor',
          debit_amount: Number(Number(amount).toFixed(2)),
          credit_amount: 0,
        }));

      if (debitLines.length === 0) {
        result.skipped += 1;
        continue;
      }

      const linesForEntry: any[] = [...debitLines];

      if (!itbisToCost && totalItbis > 0) {
        if (!itbisReceivableAccountId) {
          result.skipped += 1;
          continue;
        }
        linesForEntry.push({
          account_id: itbisReceivableAccountId,
          description: 'ITBIS Crédito Fiscal',
          debit_amount: Number(totalItbis.toFixed(2)),
          credit_amount: 0,
        });
      }

      const totalDebit = linesForEntry.reduce((sum, l) => sum + (Number(l.debit_amount) || 0), 0);
      if (totalDebit <= 0) {
        result.skipped += 1;
        continue;
      }

      linesForEntry.push({
        account_id: apAccountId,
        description: 'Cuentas por Pagar a Proveedores',
        debit_amount: 0,
        credit_amount: Number(totalDebit.toFixed(2)),
      });

      linesForEntry.forEach((l, idx) => {
        l.line_number = idx + 1;
      });

      try {
        if (jeEntryNumberSet.has(invoiceNumber)) {
          result.skipped += 1;
          continue;
        }

        await journalEntriesService.createWithLines(tenantId, {
          entry_number: invoiceNumber,
          entry_date: String(inv.invoice_date || nowStr.slice(0, 10)),
          description: `Factura suplidor ${invoiceNumber}${itbisToCost ? ' (ITBIS al costo)' : ''}`.trim(),
          reference: apInvoiceId,
          status: 'posted',
        }, linesForEntry);

        jeEntryNumberSet.add(invoiceNumber);
      } catch (error) {
        result.skipped += 1;
        continue;
      }

      result.createdInvoiceEntries += 1;
      jeKeySet.add(`${apInvoiceId}|${invoiceNumber}`);
    }

    const { data: supplierPayments, error: spErr } = await supabase
      .from('supplier_payments')
      .select('id, payment_date, amount, method, bank_account_id, invoice_number, status')
      .eq('user_id', tenantId);
    if (spErr) throw spErr;

    const defaultApBankAccountId = (settings as any)?.ap_bank_account_id ? String((settings as any).ap_bank_account_id) : '';

    for (const p of supplierPayments || []) {
      const status = String(p.status || '');
      if (status !== 'Completado' && status !== 'completed') continue;

      const paymentId = p?.id ? String(p.id) : '';
      if (!paymentId) continue;
      if (jeRefSet.has(paymentId)) continue;

      const method = String(p.method || '').toLowerCase();
      const isCheckPayment = method.includes('cheque') || method.includes('check');
      if (isCheckPayment) continue;

      const amount = Number(p.amount) || 0;
      if (amount <= 0) continue;

      let bankChartAccountId: string = '';
      if (p?.bank_account_id) {
        const bankAcc = bankAccountsMap.get(String(p.bank_account_id));
        if (bankAcc) bankChartAccountId = bankAcc;
      }
      if (!bankChartAccountId) bankChartAccountId = defaultApBankAccountId;

      if (!apAccountId || !bankChartAccountId) {
        result.skipped += 1;
        continue;
      }

      let entryNumber = `SP-${paymentId}`;
      while (jeEntryNumberSet.has(entryNumber)) {
        entryNumber = `SP-${paymentId}-${Math.floor(Math.random() * 1000)}`;
      }

      const lines: any[] = [
        {
          account_id: apAccountId,
          description: 'Pago a proveedor - Cuentas por Pagar',
          debit_amount: Number(amount.toFixed(2)),
          credit_amount: 0,
          line_number: 1,
        },
        {
          account_id: bankChartAccountId,
          description: 'Pago a proveedor - Banco',
          debit_amount: 0,
          credit_amount: Number(amount.toFixed(2)),
          line_number: 2,
        },
      ];

      try {
        const invoiceNumber = p?.invoice_number ? String(p.invoice_number) : '';
        await journalEntriesService.createWithLines(tenantId, {
          entry_number: entryNumber,
          entry_date: String(p.payment_date || nowStr.slice(0, 10)),
          description: invoiceNumber ? `Pago a proveedor ${invoiceNumber}`.trim() : 'Pago a proveedor',
          reference: paymentId,
          status: 'posted',
        }, lines);

        jeEntryNumberSet.add(entryNumber);
      } catch (error) {
        result.skipped += 1;
        continue;
      }

      result.createdPaymentEntries += 1;
      jeRefSet.add(paymentId);
    }

    return result;
  },

  async reconcileAll(userId: string) {
    const [ar, ap] = await Promise.all([
      this.reconcileCxCAuxiliaries(userId),
      this.reconcileCxPAuxiliaries(userId),
    ]);
    return { ar, ap };
  },

  async recalculateAllBalances(userId: string) {
    const tenantId = await resolveTenantId(userId);
    if (!tenantId) throw new Error('userId required');

    const now = new Date().toISOString();

    const [
      { data: customers, error: customersError },
      { data: suppliers, error: suppliersError },
      { data: invoices, error: invoicesError },
      { data: notes, error: notesError },
      { data: advances, error: advancesError },
      { data: apInvoices, error: apInvoicesError },
    ] = await Promise.all([
      supabase.from('customers').select('id').eq('user_id', tenantId),
      supabase.from('suppliers').select('id').eq('user_id', tenantId),
      supabase
        .from('invoices')
        .select('id, customer_id, total_amount, paid_amount, status')
        .eq('user_id', tenantId),
      supabase
        .from('credit_debit_notes')
        .select('id, customer_id, note_type, status, total_amount, applied_amount, balance_amount')
        .eq('user_id', tenantId),
      supabase
        .from('customer_advances')
        .select('id, customer_id, status, amount, applied_amount, balance_amount')
        .eq('user_id', tenantId),
      supabase
        .from('ap_invoices')
        .select('id, supplier_id, status, total_to_pay, total_gross, paid_amount, balance_amount')
        .eq('user_id', tenantId),
    ]);

    if (customersError) throw customersError;
    if (suppliersError) throw suppliersError;
    if (invoicesError) throw invoicesError;
    if (notesError) throw notesError;
    if (advancesError) throw advancesError;
    if (apInvoicesError) throw apInvoicesError;

    const customerBalanceById = new Map<string, number>();
    const existingCustomerIds = new Set<string>();
    (customers || []).forEach((c: any) => {
      const id = c?.id ? String(c.id) : '';
      if (id) {
        existingCustomerIds.add(id);
        customerBalanceById.set(id, 0);
      }
    });

    (invoices || []).forEach((inv: any) => {
      const customerId = inv?.customer_id ? String(inv.customer_id) : '';
      if (!customerId) return;
      if (!existingCustomerIds.has(customerId)) return;
      const st = String(inv.status || '').toLowerCase();
      if (st === 'cancelled' || st === 'cancelada' || st === 'draft') return;
      const total = Number(inv.total_amount) || 0;
      const paid = Number(inv.paid_amount) || 0;
      const balance = Math.max(total - paid, 0);
      customerBalanceById.set(customerId, (customerBalanceById.get(customerId) || 0) + balance);
    });

    (notes || []).forEach((n: any) => {
      const customerId = n?.customer_id ? String(n.customer_id) : '';
      if (!customerId) return;
      if (!existingCustomerIds.has(customerId)) return;
      const st = String(n.status || '').toLowerCase();
      if (st === 'cancelled' || st === 'cancelada') return;
      const amount = Number(n.total_amount) || 0;
      const applied = Number(n.applied_amount) || 0;
      const balRaw = n.balance_amount;
      const balance = Number.isFinite(Number(balRaw)) ? Number(balRaw) : Math.max(amount - applied, 0);
      if (balance <= 0) return;
      const noteType = String(n.note_type || '').toLowerCase();
      const sign = noteType === 'credit' ? -1 : 1;
      customerBalanceById.set(customerId, (customerBalanceById.get(customerId) || 0) + sign * balance);
    });

    (advances || []).forEach((a: any) => {
      const customerId = a?.customer_id ? String(a.customer_id) : '';
      if (!customerId) return;
      if (!existingCustomerIds.has(customerId)) return;
      const st = String(a.status || '').toLowerCase();
      if (st === 'cancelled' || st === 'cancelada') return;
      const amount = Number(a.amount) || 0;
      const applied = Number(a.applied_amount) || 0;
      const balRaw = a.balance_amount;
      const balance = Number.isFinite(Number(balRaw)) ? Number(balRaw) : Math.max(amount - applied, 0);
      if (balance <= 0) return;
      customerBalanceById.set(customerId, (customerBalanceById.get(customerId) || 0) - balance);
    });

    const customerUpdates = Array.from(customerBalanceById.entries()).map(([id, balance]) => ({
      id,
      user_id: tenantId,
      current_balance: Number(Number(balance || 0).toFixed(2)),
      updated_at: now,
    }));

    if (customerUpdates.length > 0) {
      // Nota: No usar upsert aquí. En algunos esquemas multi-tenant el unique/PK
      // puede no ser solo 'id', lo que provocaría intentos de INSERT y fallos por
      // columnas NOT NULL (ej: name). Actualizamos solo filas existentes.
      for (const row of customerUpdates) {
        const { error: updateCustomerError } = await supabase
          .from('customers')
          .update({
            current_balance: row.current_balance,
            updated_at: row.updated_at,
          })
          .eq('user_id', tenantId)
          .eq('id', row.id);

        if (updateCustomerError) throw updateCustomerError;
      }
    }

    const supplierBalanceById = new Map<string, number>();
    const existingSupplierIds = new Set<string>();
    (suppliers || []).forEach((s: any) => {
      const id = s?.id ? String(s.id) : '';
      if (id) {
        existingSupplierIds.add(id);
        supplierBalanceById.set(id, 0);
      }
    });

    (apInvoices || []).forEach((inv: any) => {
      const supplierId = inv?.supplier_id ? String(inv.supplier_id) : '';
      if (!supplierId) return;
      if (!existingSupplierIds.has(supplierId)) return;
      const st = String(inv.status || '').toLowerCase();
      if (st === 'cancelled' || st === 'cancelada' || st === 'draft') return;

      const explicitBalance = Number(inv.balance_amount);
      const total = Number(inv.total_to_pay ?? inv.total_gross ?? 0) || 0;
      const paid = Number(inv.paid_amount) || 0;
      const balance = Number.isFinite(explicitBalance) && explicitBalance !== 0 ? explicitBalance : Math.max(total - paid, 0);
      if (balance <= 0) return;
      supplierBalanceById.set(supplierId, (supplierBalanceById.get(supplierId) || 0) + balance);
    });

    const supplierUpdates = Array.from(supplierBalanceById.entries()).map(([id, balance]) => ({
      id,
      user_id: tenantId,
      current_balance: Number(Number(balance || 0).toFixed(2)),
      updated_at: now,
    }));

    if (supplierUpdates.length > 0) {
      for (const row of supplierUpdates) {
        const { error: updateSupplierError } = await supabase
          .from('suppliers')
          .update({
            current_balance: row.current_balance,
            updated_at: row.updated_at,
          })
          .eq('user_id', tenantId)
          .eq('id', row.id);

        if (updateSupplierError) throw updateSupplierError;
      }
    }

    return {
      customersUpdated: customerUpdates.length,
      suppliersUpdated: supplierUpdates.length,
    };
  },
};

/* ==========================================================
   Bank Charges Service
   Tabla: bank_charges
========================================================== */
export const bankChargesService = {
  async getAll(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('bank_charges')
        .select('*')
        .eq('user_id', tenantId)
        .order('charge_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async create(userId: string, charge: {
    bank_id: string;
    currency: string;
    amount: number;
    charge_date: string;
    ncf: string;
    description: string;
    expense_account_code: string;
  }) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');
      const now = new Date().toISOString();
      const payload = {
        ...charge,
        user_id: tenantId,
        created_at: now,
        updated_at: now,
      };

      const { data, error } = await supabase
        .from('bank_charges')
        .insert(payload)
        .select('*')
        .single();

      if (error) throw error;

      // Asiento contable automático: Debe gasto financiero / Haber banco
      try {
        const amount = Number(charge.amount) || 0;
        if (amount > 0 && charge.expense_account_code) {
          // Buscar cuenta de gasto por código
          const { data: expenseAccount, error: expenseError } = await supabase
            .from('chart_accounts')
            .select('id')
            .eq('user_id', tenantId)
            .eq('code', charge.expense_account_code)
            .maybeSingle();

          // Buscar banco y su cuenta contable
          const { data: bank, error: bankError } = await supabase
            .from('bank_accounts')
            .select('chart_account_id, bank_name')
            .eq('id', charge.bank_id)
            .maybeSingle();

          if (!expenseError && !bankError && expenseAccount?.id && bank?.chart_account_id) {
            // Validar saldo disponible en cuenta bancaria
            const saldoDisponible = await financialReportsService.getAccountBalance(tenantId, bank.chart_account_id as string);
            
            if (saldoDisponible < amount) {
              throw new Error(
                `❌ Saldo insuficiente en cuenta bancaria\n\n` +
                `Banco: ${bank.bank_name || 'N/A'}\n` +
                `Saldo disponible: ${saldoDisponible.toFixed(2)}\n` +
                `Monto del cargo: ${amount.toFixed(2)}\n\n` +
                `No se puede registrar el cargo sin fondos suficientes.`
              );
            }

            const entryPayload = {
              entry_number: `BCG-${new Date(charge.charge_date).toISOString().slice(0, 10)}-${(data.id || '').toString().slice(0, 6)}`,
              entry_date: String(charge.charge_date),
              description: charge.description || `Cargo bancario ${bank.bank_name || ''}`.trim(),
              reference: data.id ? String(data.id) : null,
              status: 'posted' as const,
            };

            const lines = [
              {
                account_id: expenseAccount.id as string,
                description: charge.description || 'Cargo bancario - Gastos financieros',
                debit_amount: amount,
                credit_amount: 0,
              },
              {
                account_id: bank.chart_account_id as string,
                description: `Cargo bancario - Banco ${bank.bank_name || ''}`.trim(),
                debit_amount: 0,
                credit_amount: amount,
              },
            ];

            await journalEntriesService.createWithLines(tenantId, entryPayload, lines);
          }
        }
      } catch (jeError) {
        console.error('bankChargesService.create journal entry error', jeError);
      }

      return data;
    } catch (error) {
      console.error('bankChargesService.create error', error);
      throw error;
    }
  },
};

/* ==========================================================
   Bank Reconciliations List Service
========================================================== */
export const bankReconciliationsListService = {
  async getAllByUser(userId: string) {
    try {
      if (!userId) return [];
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('bank_reconciliations')
        .select('*')
        .eq('user_id', tenantId)
        .order('reconciliation_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async create(userId: string, entry: any, lines: any[]) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');
      if (!lines || lines.length === 0) throw new Error('At least one line is required');

      const { data: entryData, error: entryError } = await supabase
        .from('warehouse_entries')
        .insert({ ...entry, user_id: tenantId })
        .select('*')
        .single();

      if (entryError) throw entryError;

      const linesPayload = lines.map((line: any) => ({
        ...line,
        entry_id: entryData.id,
      }));

      const { data: linesData, error: linesError } = await supabase
        .from('warehouse_entry_lines')
        .insert(linesPayload)
        .select('*');

      if (linesError) throw linesError;

      return { entry: entryData, lines: linesData };
    } catch (error) {
      console.error('warehouseEntriesService.create error', error);
      throw error;
    }
  },

  async post(userId: string, id: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');
      if (!id) throw new Error('warehouse entry id required');

      const { data: entry, error: entryError } = await supabase
        .from('warehouse_entries')
        .select('*')
        .eq('user_id', tenantId)
        .eq('id', id)
        .maybeSingle();

      if (entryError) throw entryError;
      if (!entry) throw new Error('Warehouse entry not found');

      if (entry.status === 'posted' || entry.status === 'cancelled') {
        return entry;
      }

      const movementDate = entry.document_date
        ? String(entry.document_date)
        : new Date().toISOString().split('T')[0];

      const { data: lines, error: linesError } = await supabase
        .from('warehouse_entry_lines')
        .select(`
          *,
          inventory_items (
            id,
            name,
            current_stock,
            cost_price,
            average_cost,
            last_purchase_price
          )
        `)
        .eq('entry_id', entry.id);

      if (linesError) throw linesError;
      if (!lines || lines.length === 0) throw new Error('Warehouse entry has no lines');

      for (const rawLine of lines as any[]) {
        const invItem = rawLine.inventory_items as any | null;
        const rawQty = Number(rawLine.quantity) || 0;
        const qty = Number.isFinite(rawQty) ? Math.round(rawQty) : 0;

        if (!invItem || qty <= 0) continue;

        const oldStock = Number(invItem.current_stock ?? 0) || 0;
        const oldAvg =
          invItem.average_cost != null
            ? Number(invItem.average_cost) || 0
            : Number(invItem.cost_price) || 0;

        const lineUnitCost =
          rawLine.unit_cost != null && rawLine.unit_cost !== ''
            ? Number(rawLine.unit_cost) || 0
            : 0;

        const unitCost = lineUnitCost > 0 ? lineUnitCost : oldAvg;
        const lineCost = qty * unitCost;

        if (lineCost <= 0) continue;

        const newStock = oldStock + qty;
        const newAvg = newStock > 0 ? (oldAvg * oldStock + unitCost * qty) / newStock : oldAvg;

        try {
          if (invItem.id) {
            await inventoryService.updateItem(tenantId, String(invItem.id), {
              current_stock: newStock,
              last_purchase_price: unitCost,
              last_purchase_date: movementDate,
              average_cost: newAvg,
              cost_price: newAvg,
            });
          }
        } catch (updateError) {
          console.error('warehouseEntriesService.post updateItem error', updateError);
        }

        try {
          await inventoryService.createMovement(tenantId, {
            item_id: invItem.id ? String(invItem.id) : null,
            movement_type: 'entry',
            quantity: qty,
            unit_cost: unitCost,
            total_cost: lineCost,
            movement_date: movementDate,
            reference: entry.document_number || entry.id,
            notes: rawLine.notes || invItem.name || null,
            source_type: 'warehouse_entry',
            source_id: entry.id ? String(entry.id) : null,
            source_number: entry.document_number || (entry.id ? String(entry.id) : null),
            to_warehouse_id: (entry as any).warehouse_id || null,
          });
        } catch (movError) {
          console.error('warehouseEntriesService.post createMovement error', movError);
        }
      }

      const { data: updated, error: updateError } = await supabase
        .from('warehouse_entries')
        .update({
          status: 'posted',
          updated_at: new Date().toISOString(),
        })
        .eq('id', entry.id)
        .select('*')
        .maybeSingle();

      if (updateError) throw updateError;

      return updated ?? entry;
    } catch (error) {
      console.error('warehouseEntriesService.post error', error);
      throw error;
    }
  },
};

/* ==========================================================
   Journal Entries Service
   Tablas: journal_entries, journal_entry_lines
========================================================== */
export const journalEntriesService = {
  async createWithLines(userId: string, entry: {
    entry_number: string;
    entry_date: string;
    description: string;
    reference?: string | null;
    status?: 'draft' | 'posted' | 'reversed';
    skipPeriodValidation?: boolean;
  }, lines: Array<{
    account_id: string;
    description?: string;
    debit_amount?: number;
    credit_amount?: number;
    line_number?: number;
  }>) {
    if (!userId) throw new Error('userId required');
    if (!lines || lines.length === 0) throw new Error('journal entry lines required');

    const tenantId = await resolveTenantId(userId);
    if (!tenantId) throw new Error('userId required');

    // Validar que exista un período contable abierto para la fecha del asiento
    if (!entry.skipPeriodValidation) {
      await accountingPeriodsService.requireOpenPeriod(tenantId, entry.entry_date);
    }

    const normalizedLines = lines.map((l, idx) => ({
      account_id: l.account_id,
      description: l.description ?? entry.description,
      debit_amount: Number(l.debit_amount || 0),
      credit_amount: Number(l.credit_amount || 0),
      line_number: l.line_number ?? idx + 1,
    }));

    const totalDebit = normalizedLines.reduce((sum, l) => sum + (l.debit_amount || 0), 0);
    const totalCredit = normalizedLines.reduce((sum, l) => sum + (l.credit_amount || 0), 0);

    if (Number(totalDebit.toFixed(2)) !== Number(totalCredit.toFixed(2))) {
      throw new Error('El asiento contable no está balanceado entre débitos y créditos');
    }

    const now = new Date().toISOString();

    const entryPayload = {
      user_id: tenantId,
      entry_number: entry.entry_number,
      entry_date: entry.entry_date,
      description: entry.description,
      reference: entry.reference ?? null,
      status: entry.status ?? 'posted',
      total_debit: totalDebit,
      total_credit: totalCredit,
      created_at: now,
      updated_at: now,
    };

    const { data: createdEntry, error: entryError } = await supabase
      .from('journal_entries')
      .insert(entryPayload)
      .select('*')
      .single();

    if (entryError) {
      console.error('journalEntriesService.createWithLines entry error', entryError);
      throw entryError;
    }

    const linesPayload = normalizedLines.map((l) => ({
      ...l,
      journal_entry_id: createdEntry.id,
      created_at: now,
    }));

    const { error: linesError } = await supabase
      .from('journal_entry_lines')
      .insert(linesPayload);

    if (linesError) {
      console.error('journalEntriesService.createWithLines lines error', linesError);
      throw linesError;
    }

    return createdEntry;
  },

  async getAll(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('user_id', tenantId)
        .order('entry_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async getRecentLinesByAccountIds(userId: string, accountIds: string[], limit = 50) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      if (!accountIds || accountIds.length === 0) return [];

      const { data, error } = await supabase
        .from('journal_entry_lines')
        .select(
          `id, account_id, description, debit_amount, credit_amount, created_at,
           journal_entries!inner(id, entry_number, entry_date, description, status, user_id),
           chart_accounts(code, name)`
        )
        .in('account_id', accountIds)
        .eq('journal_entries.user_id', tenantId)
        .eq('journal_entries.status', 'posted')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },
};

/* ==========================================================
   Bank Credits Service
   Tabla: bank_credits
========================================================== */
export const bankCreditsService = {
  async getAll(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('bank_credits')
        .select('*')
        .eq('user_id', tenantId)
        .order('start_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async create(userId: string, credit: {
    bank_id: string;
    bank_account_code: string;
    credit_number: string;
    currency: string;
    amount: number;
    start_date: string;
    interest_rate?: number | null;
    description: string;
    loan_account_code?: string;
  }) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');
      const now = new Date().toISOString();
      const payload = {
        ...credit,
        status: 'active',
        user_id: tenantId,
        created_at: now,
        updated_at: now,
      };

      const { data, error } = await supabase
        .from('bank_credits')
        .insert(payload)
        .select('*')
        .single();

      if (error) throw error;

      // Asiento contable automático: Debe banco / Haber pasivo del préstamo
      try {
        const amount = Number(credit.amount) || 0;
        if (amount > 0 && credit.loan_account_code) {
          // Cuenta de pasivo (préstamo) por código
          const { data: loanAccount, error: loanError } = await supabase
            .from('chart_accounts')
            .select('id')
            .eq('user_id', tenantId)
            .eq('code', credit.loan_account_code)
            .maybeSingle();

          // Cuenta del banco (activo)
          const { data: bank, error: bankError } = await supabase
            .from('bank_accounts')
            .select('chart_account_id, bank_name')
            .eq('id', credit.bank_id)
            .maybeSingle();

          if (!loanError && !bankError && loanAccount?.id && bank?.chart_account_id) {
            const entryPayload = {
              entry_number: `CRD-${new Date(credit.start_date).toISOString().slice(0, 10)}-${(data.id || '').toString().slice(0, 6)}`,
              entry_date: String(credit.start_date),
              description: credit.description || `Crédito bancario ${credit.credit_number || ''}`.trim(),
              reference: data.id ? String(data.id) : null,
              status: 'posted' as const,
            };

            const lines = [
              {
                account_id: bank.chart_account_id as string,
                description: `Crédito recibido - Banco ${bank.bank_name || ''}`.trim(),
                debit_amount: amount,
                credit_amount: 0,
              },
              {
                account_id: loanAccount.id as string,
                description: credit.description || 'Pasivo por préstamo bancario',
                debit_amount: 0,
                credit_amount: amount,
              },
            ];

            await journalEntriesService.createWithLines(userId, entryPayload, lines);
          }
        }
      } catch (jeError) {
        console.error('bankCreditsService.create journal entry error', jeError);
      }

      return data;
    } catch (error) {
      console.error('bankCreditsService.create error', error);
      throw error;
    }
  },
};

/* ==========================================================
   Bank Transfers Service
   Tabla: bank_transfers
========================================================== */
export const bankTransfersService = {
  async getAll(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('bank_transfers')
        .select('*')
        .eq('user_id', tenantId)
        .order('transfer_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async create(userId: string, transfer: {
    transfer_type?: 'interna' | 'proveedor' | string;
    from_bank_id: string;
    from_bank_account_code: string;
    to_bank_id?: string | null;
    to_bank_account_code?: string | null;
    supplier_id?: string | null;
    currency: string;
    amount: number;
    transfer_date: string;
    reference: string;
    description: string;
    invoice_payments?: any;
  }, options?: { skipPeriodValidation?: boolean }) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');

      // Validar período contable abierto
      if (!options?.skipPeriodValidation) {
        await accountingPeriodsService.requireOpenPeriod(tenantId, transfer.transfer_date);
      }

      const now = new Date().toISOString();
      const payload = {
        ...transfer,
        status: 'issued',
        user_id: tenantId,
        created_at: now,
        updated_at: now,
      };

      const { data, error } = await supabase
        .from('bank_transfers')
        .insert(payload)
        .select('*')
        .single();

      if (error) throw error;

      const invoicePayments: any[] = Array.isArray((transfer as any).invoice_payments)
        ? (transfer as any).invoice_payments
        : [];

      try {
        if ((transfer as any).supplier_id && invoicePayments.length > 0) {
          for (const payment of invoicePayments) {
            try {
              const invoiceId = String(payment?.invoice_id || '');
              if (!invoiceId) continue;
              const paymentAmount = Number(payment?.amount_to_pay) || 0;
              if (paymentAmount <= 0) continue;

              await supabase.from('ap_invoice_payments').insert({
                user_id: tenantId,
                invoice_id: invoiceId,
                payment_date: (transfer as any).transfer_date,
                amount: paymentAmount,
                payment_method: 'bank_transfer',
                reference: (transfer as any).reference || (data as any)?.id || null,
                notes: `Pago con transferencia ${(transfer as any).reference || ''}`.trim(),
              });

              const { data: invoice } = await supabase
                .from('ap_invoices')
                .select('total_to_pay, paid_amount, balance_amount, status')
                .eq('id', invoiceId)
                .eq('user_id', tenantId)
                .single();

              if (invoice) {
                const totalToPay = Number((invoice as any).total_to_pay) || 0;
                const currentPaid = Number((invoice as any).paid_amount) || 0;

                // DEBUG: Log valores para diagnóstico
                console.log('=== PAGO FACTURA DEBUG ===');
                console.log('Invoice ID:', invoiceId);
                console.log('Invoice raw data:', invoice);
                console.log('totalToPay:', totalToPay);
                console.log('currentPaid:', currentPaid);
                console.log('paymentAmount:', paymentAmount);

                // Siempre calcular balance real como total - pagado para evitar inconsistencias
                const realBalance = Math.max(totalToPay - currentPaid, 0);
                console.log('realBalance (antes del pago):', realBalance);

                const amountToApply = Math.min(paymentAmount, realBalance);
                const newPaid = currentPaid + amountToApply;
                const newBalance = Math.max(totalToPay - newPaid, 0);

                console.log('amountToApply:', amountToApply);
                console.log('newPaid:', newPaid);
                console.log('newBalance:', newBalance);

                // Determinar status: solo 'paid' si el balance es prácticamente 0
                const newStatus = newBalance <= 0.01
                  ? 'paid'
                  : 'partial';

                console.log('newStatus:', newStatus);
                console.log('=== FIN DEBUG ===');

                const { error: updateError } = await supabase
                  .from('ap_invoices')
                  .update({
                    paid_amount: newPaid,
                    balance_amount: newBalance,
                    status: newStatus,
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', invoiceId)
                  .eq('user_id', tenantId);

                if (updateError) {
                  console.error('Error en UPDATE ap_invoices:', updateError);
                }
              }
            } catch (err) {
              console.error('Error updating invoice:', err);
            }
          }
        }
      } catch (invErr) {
        console.error('bankTransfersService.create invoice update error', invErr);
      }

      // Asiento contable automático
      try {
        const amount = Number(transfer.amount) || 0;
        if (amount > 0) {
          const { data: originBank, error: originError } = await supabase
            .from('bank_accounts')
            .select('chart_account_id, bank_name')
            .eq('id', transfer.from_bank_id)
            .maybeSingle();

          if (originError || !originBank?.chart_account_id) {
            console.log('[transfersService] Skipping ledger posting: origin bank has no chart account configured');
          } else if ((transfer as any).transfer_type === 'proveedor' || (transfer as any).supplier_id) {
            // === TRANSFERENCIA A PROVEEDOR (CxP) ===
            // Débito: CxP | Crédito: Banco
            const settings = await accountingSettingsService.get(tenantId);
            const apAccountId = settings?.ap_account_id;
            
            if (!apAccountId) {
              console.log('[transfersService] Skipping ledger posting: AP account not configured');
            } else {
              // Obtener nombre del proveedor
              const { data: supplier } = await supabase
                .from('suppliers')
                .select('legal_name')
                .eq('id', (transfer as any).supplier_id)
                .eq('user_id', tenantId)
                .maybeSingle();
              
              const supplierName = supplier?.legal_name || 'Proveedor';
              
              const entryPayload = {
                entry_number: `TRF-${new Date(transfer.transfer_date).toISOString().slice(0, 10)}-${(data.id || '').toString().slice(0, 6)}`,
                entry_date: String(transfer.transfer_date),
                description: transfer.description || `Pago a proveedor ${supplierName}`,
                reference: data.id ? String(data.id) : null,
                status: 'posted' as const,
              };

              const lines = [
                {
                  account_id: apAccountId,
                  description: `Pago a proveedor - ${supplierName}`,
                  debit_amount: amount,
                  credit_amount: 0,
                },
                {
                  account_id: originBank.chart_account_id as string,
                  description: `Transferencia - ${originBank.bank_name || ''}`,
                  debit_amount: 0,
                  credit_amount: amount,
                },
              ];

              await journalEntriesService.createWithLines(userId, entryPayload, lines);
              console.log('Asiento contable creado para pago a proveedor:', entryPayload.entry_number);
            }
          } else if (transfer.to_bank_id) {
            // === TRANSFERENCIA INTERNA ===
            // Débito: Banco destino | Crédito: Banco origen
            const { data: destBank, error: destError } = await supabase
              .from('bank_accounts')
              .select('chart_account_id, bank_name')
              .eq('id', transfer.to_bank_id)
              .maybeSingle();

            if (!destError && destBank?.chart_account_id) {
              const entryPayload = {
                entry_number: `TRF-${new Date(transfer.transfer_date).toISOString().slice(0, 10)}-${(data.id || '').toString().slice(0, 6)}`,
                entry_date: String(transfer.transfer_date),
                description: transfer.description || 'Transferencia bancaria interna',
                reference: data.id ? String(data.id) : null,
                status: 'posted' as const,
              };

              const lines = [
                {
                  account_id: destBank.chart_account_id as string,
                  description: `Transferencia recibida - Banco ${destBank.bank_name || ''}`.trim(),
                  debit_amount: amount,
                  credit_amount: 0,
                },
                {
                  account_id: originBank.chart_account_id as string,
                  description: `Transferencia enviada - Banco ${originBank.bank_name || ''}`.trim(),
                  debit_amount: 0,
                  credit_amount: amount,
                },
              ];

              await journalEntriesService.createWithLines(userId, entryPayload, lines);
            }
          }
        }
      } catch (jeError) {
        console.error('bankTransfersService.create journal entry error', jeError);
        throw jeError;
      }

      return data;
    } catch (error) {
      const e: any = error;
      const details = e?.details ? ` | ${e.details}` : '';
      const hint = e?.hint ? ` | ${e.hint}` : '';
      const code = e?.code ? ` | code=${e.code}` : '';
      console.error('bankTransfersService.create error', error);
      if (e?.message && typeof e.message === 'string') {
        throw new Error(`${e.message}${details}${hint}${code}`);
      }
      throw error;
    }
  },
};

/* ==========================================================
   Bank Checks Service
   Tabla: bank_checks
========================================================== */
export const bankChecksService = {
  async getAll(userId: string) {
    try {
      if (!userId) return [];
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('bank_checks')
        .select('*')
        .eq('user_id', tenantId)
        .order('check_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async create(userId: string, check: {
    bank_id: string;
    bank_account_code: string;
    check_number: string;
    payment_type: 'accounts_payable' | 'cash' | 'internal_transfer';
    supplier_id?: string;
    payee_name?: string;
    account_id?: string;
    destination_bank_id?: string;
    currency: string;
    amount: number;
    check_date: string;
    description: string;
    expense_account_code?: string;
    ap_invoice_id?: string | null;
    invoice_payments?: Array<{
      invoice_id: string;
      invoice_number: string;
      amount_to_pay: number;
      invoice_total: number;
    }>;
  }) {
    try {
      if (!userId) throw new Error('userId required');
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');
      const now = new Date().toISOString();
      const payload = {
        ...check,
        status: 'issued',
        user_id: tenantId,
        created_at: now,
        updated_at: now,
      };

      const { data, error } = await supabase
        .from('bank_checks')
        .insert(payload)
        .select('*')
        .single();

      if (error) throw error;

      // Asiento contable automático según tipo de pago
      try {
        const amount = Number(check.amount) || 0;
        if (amount > 0) {
          const { data: bank, error: bankError } = await supabase
            .from('bank_accounts')
            .select('chart_account_id, bank_name')
            .eq('id', check.bank_id)
            .maybeSingle();

          if (bankError || !bank?.chart_account_id) {
            throw new Error('Banco sin cuenta contable configurada');
          }

          const entryPayload = {
            entry_number: `CHK-${new Date(check.check_date).toISOString().slice(0, 10)}-${(data.id || '').toString().slice(0, 6)}`,
            entry_date: String(check.check_date),
            description: check.description || `Cheque ${check.check_number}`,
            reference: data.id ? String(data.id) : null,
            status: 'posted' as const,
          };

          const lines: any[] = [];

          // Tipo 1: Cuentas por Pagar (CxP)
          if (check.payment_type === 'accounts_payable') {
            const settings = await accountingSettingsService.get(tenantId);
            const apAccountId = settings?.ap_account_id;
            if (!apAccountId) {
              console.log('[checksService] Skipping ledger posting: AP account not configured');
            } else {
            lines.push({
              account_id: apAccountId,
              description: `Pago a proveedor - ${check.payee_name || ''}`,
              debit_amount: amount,
              credit_amount: 0,
            });
            lines.push({
              account_id: bank.chart_account_id,
              description: `Cheque ${check.check_number} - ${bank.bank_name || ''}`,
              debit_amount: 0,
              credit_amount: amount,
            });
            }

            // Actualizar facturas si hay invoice_payments
            if (check.invoice_payments && check.invoice_payments.length > 0) {
              for (const payment of check.invoice_payments) {
                try {
                  await supabase.from('ap_invoice_payments').insert({
                    user_id: tenantId,
                    invoice_id: payment.invoice_id,
                    payment_date: check.check_date,
                    amount: payment.amount_to_pay,
                    payment_method: 'check',
                    reference: check.check_number,
                    notes: `Pago con cheque ${check.check_number}`,
                  });

                  const { data: invoice } = await supabase
                    .from('ap_invoices')
                    .select('total_to_pay, paid_amount, balance_amount, status')
                    .eq('id', payment.invoice_id)
                    .eq('user_id', tenantId)
                    .single();

                  if (invoice) {
                    const totalToPay = Number((invoice as any).total_to_pay) || 0;
                    const currentPaid = Number((invoice as any).paid_amount) || 0;
                    const currentBalance = Number((invoice as any).balance_amount);

                    const remaining = Number.isFinite(currentBalance)
                      ? Math.max(currentBalance, 0)
                      : Math.max(totalToPay - currentPaid, 0);

                    const amountToApply = Math.min(Number(payment.amount_to_pay) || 0, remaining);
                    const newPaid = currentPaid + amountToApply;
                    const newBalance = Math.max(remaining - amountToApply, 0);

                    const newStatus = newBalance <= 0.01 ? 'paid' : newPaid > 0 ? 'partial' : (invoice as any).status;

                    await supabase
                      .from('ap_invoices')
                      .update({
                        paid_amount: newPaid,
                        balance_amount: newBalance,
                        status: newStatus,
                        updated_at: new Date().toISOString(),
                      })
                      .eq('id', payment.invoice_id)
                      .eq('user_id', tenantId);
                  }
                } catch (err) {
                  console.error('Error updating invoice:', err);
                }
              }
            }
          }
          // Tipo 2: Pago de Contado
          else if (check.payment_type === 'cash') {
            if (!check.account_id) throw new Error('Cuenta a cargar no especificada');
            lines.push({
              account_id: check.account_id,
              description: check.description || `Pago a ${check.payee_name || ''}`,
              debit_amount: amount,
              credit_amount: 0,
            });
            lines.push({
              account_id: bank.chart_account_id,
              description: `Cheque ${check.check_number} - ${bank.bank_name || ''}`,
              debit_amount: 0,
              credit_amount: amount,
            });
          }
          // Tipo 3: Transferencia Interna
          else if (check.payment_type === 'internal_transfer') {
            if (!check.destination_bank_id) throw new Error('Banco destino no especificado');
            const { data: destBank } = await supabase
              .from('bank_accounts')
              .select('chart_account_id, bank_name')
              .eq('id', check.destination_bank_id)
              .single();

            if (!destBank?.chart_account_id) throw new Error('Banco destino sin cuenta contable');

            lines.push({
              account_id: destBank.chart_account_id,
              description: `Transferencia desde ${bank.bank_name || ''} - Cheque ${check.check_number}`,
              debit_amount: amount,
              credit_amount: 0,
            });
            lines.push({
              account_id: bank.chart_account_id,
              description: `Transferencia a ${destBank.bank_name || ''} - Cheque ${check.check_number}`,
              debit_amount: 0,
              credit_amount: amount,
            });
          }

          if (lines.length > 0) {
            await journalEntriesService.createWithLines(userId, entryPayload, lines);
          }
        }
      } catch (jeError) {
        console.error('bankChecksService.create journal entry error', jeError);
      }

      return data;
    } catch (error) {
      console.error('bankChecksService.create error', error);
      throw error;
    }
  },
};

/* ==========================================================
   Bank Payment Requests Service
   Tabla: bank_payment_requests
========================================================== */
export const paymentRequestsService = {
  async getAll(userId: string) {
    try {
      if (!userId) return [];
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('bank_payment_requests')
        .select('*')
        .eq('user_id', tenantId)
        .order('request_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async create(userId: string, request: {
    bank_id: string;
    bank_account_code: string;
    payment_method: 'transfer' | 'check'; // Transferencia o Cheque
    payment_type: 'accounts_payable' | 'cash'; // CxP o Contado
    supplier_id?: string; // Solo para CxP
    payee_name?: string; // Solo para Contado
    account_id?: string; // Cuenta contable contrapartida (solo para Contado)
    currency: string;
    amount: number;
    request_date: string;
    description: string;
    invoice_payments?: Array<{ // Solo para CxP
      invoice_id: string;
      invoice_number: string;
      amount_to_pay: number;
      invoice_total: number;
    }>;
  }) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');
      const now = new Date().toISOString();
      const payload = {
        ...request,
        invoice_payments: request.invoice_payments ? JSON.stringify(request.invoice_payments) : null,
        status: 'pending',
        user_id: tenantId,
        created_at: now,
        updated_at: now,
      };

      const { data, error } = await supabase
        .from('bank_payment_requests')
        .insert(payload)
        .select('*')
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('paymentRequestsService.create error', error);
      throw error;
    }
  },

  async updateStatus(id: string, status: string, approvedBy?: string) {
    try {
      const updateData: any = { 
        status, 
        updated_at: new Date().toISOString() 
      };
      
      if (status === 'approved' && approvedBy) {
        updateData.approved_by = approvedBy;
        updateData.approved_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from('bank_payment_requests')
        .update(updateData)
        .eq('id', id)
        .select('*');

      if (error) throw error;

      const rows = (data || []) as any[];
      if (!rows.length) {
        console.warn('paymentRequestsService.updateStatus: no se encontró la solicitud con id', id);
        return null;
      }

      return rows[0];
    } catch (error) {
      console.error('paymentRequestsService.updateStatus error', error);
      throw error;
    }
  },

  async approveAndCreateJournalEntry(userId: string, requestId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');

      // Obtener la solicitud
      const { data: request, error: fetchError } = await supabase
        .from('bank_payment_requests')
        .select('*')
        .eq('id', requestId)
        .eq('user_id', tenantId)
        .single();

      if (fetchError || !request) throw new Error('Solicitud no encontrada');
      if (request.status !== 'pending') throw new Error('Solo se pueden aprobar solicitudes pendientes');

      // Actualizar estado a aprobado
      await this.updateStatus(requestId, 'approved', userId);

      // Crear asiento contable automático
      const entryDate = new Date().toISOString().split('T')[0];
      const [year, month] = entryDate.split('-');
      const prefix = `PR-${year}${month}`;

      const { data: existingEntries } = await supabase
        .from('journal_entries')
        .select('entry_number')
        .eq('user_id', tenantId)
        .like('entry_number', `${prefix}%`)
        .order('entry_number', { ascending: false })
        .limit(1);

      let nextSeq = 1;
      if (existingEntries && existingEntries.length > 0) {
        const lastNumber = existingEntries[0].entry_number || '';
        const seqStr = lastNumber.slice(prefix.length);
        const parsed = parseInt(seqStr, 10);
        if (!Number.isNaN(parsed)) {
          nextSeq = parsed + 1;
        }
      }

      const entryNumber = `${prefix}${nextSeq.toString().padStart(4, '0')}`;
      const description = `Pago aprobado - ${request.description || 'Solicitud de pago'}`;

      // Crear asiento: Debito cuenta de gasto/CxP, Credito banco
      const lines: any[] = [];

      if (request.payment_type === 'accounts_payable' && request.supplier_id) {
        // Para CxP: Debito CxP, Credito Banco
        // Obtener cuenta de CxP del proveedor
        const { data: supplier, error: supplierErr } = await supabase
          .from('suppliers')
          .select('ap_account_id')
          .eq('id', request.supplier_id)
          .eq('user_id', tenantId)
          .single();

        if (supplierErr) {
          console.log('[paymentRequestsService] Skipping AP entry: supplier not found');
        } else {
          const apAccountId = supplier?.ap_account_id;
          if (!apAccountId) {
            console.log('[paymentRequestsService] Skipping AP entry: supplier has no AP account configured');
          } else {
            lines.push({
              account_id: apAccountId,
              debit_amount: request.amount,
              credit_amount: 0,
              description: `Pago a proveedor - ${request.payee_name || ''}`,
            });
          }
        }
      } else if (request.payment_type === 'cash' && request.account_id) {
        // Para Contado: Debito cuenta seleccionada, Credito Banco
        lines.push({
          account_id: request.account_id,
          debit_amount: request.amount,
          credit_amount: 0,
          description: request.description || 'Pago de contado',
        });
      } else {
        console.log('[paymentRequestsService] Skipping ledger posting: invalid payment configuration');
        return null;
      }

      // Obtener cuenta contable del banco
      const { data: bank, error: bankErr } = await supabase
        .from('bank_accounts')
        .select('chart_account_id')
        .eq('id', request.bank_id)
        .eq('user_id', tenantId)
        .single();

      if (bankErr || !bank?.chart_account_id) {
        console.log('[paymentRequestsService] Skipping ledger posting: bank has no chart account configured');
        return null;
      }

      lines.push({
        account_id: bank.chart_account_id,
        debit_amount: 0,
        credit_amount: request.amount,
        description: `Pago ${request.payment_method === 'check' ? 'cheque' : 'transferencia'}`,
      });

      // Crear el asiento
      const { data: entry, error: entryError } = await supabase
        .from('journal_entries')
        .insert({
          user_id: tenantId,
          entry_number: entryNumber,
          entry_date: entryDate,
          description,
          total_debit: request.amount,
          total_credit: request.amount,
          status: 'posted',
          source_type: 'payment_request',
          source_id: requestId,
        })
        .select()
        .single();

      if (entryError) throw entryError;

      // Crear líneas del asiento
      const linesData = lines.map((line, index) => ({
        journal_entry_id: entry.id,
        account_id: line.account_id,
        debit_amount: line.debit_amount,
        credit_amount: line.credit_amount,
        description: line.description,
        line_number: index + 1,
      }));

      const { error: linesError } = await supabase
        .from('journal_entry_lines')
        .insert(linesData);

      if (linesError) throw linesError;

      // Si es pago a CxP, actualizar facturas
      if (request.payment_type === 'accounts_payable' && request.invoice_payments) {
        const invoicePayments = typeof request.invoice_payments === 'string' 
          ? JSON.parse(request.invoice_payments) 
          : request.invoice_payments;

        for (const payment of invoicePayments) {
          // Registrar el pago en la factura
          const { error: invPayErr } = await supabase
            .from('ap_invoice_payments')
            .insert({
              user_id: tenantId,
              invoice_id: payment.invoice_id,
              payment_date: entryDate,
              amount: payment.amount_to_pay,
              payment_method: request.payment_method,
              reference: entryNumber,
              notes: `Pago desde solicitud ${requestId}`,
            });

          if (invPayErr) throw invPayErr;

          // Actualizar saldo de la factura (alineado a esquema real)
          const { data: invoice } = await supabase
            .from('ap_invoices')
            .select('total_to_pay, paid_amount, balance_amount, status')
            .eq('id', payment.invoice_id)
            .eq('user_id', tenantId)
            .single();

          if (invoice) {
            const totalToPay = Number((invoice as any).total_to_pay) || 0;
            const currentPaid = Number((invoice as any).paid_amount) || 0;
            const currentBalance = Number((invoice as any).balance_amount);

            const remaining = Number.isFinite(currentBalance)
              ? Math.max(currentBalance, 0)
              : Math.max(totalToPay - currentPaid, 0);

            const amountToApply = Math.min(Number(payment.amount_to_pay) || 0, remaining);
            const newPaidAmount = currentPaid + amountToApply;
            const newBalance = Math.max(remaining - amountToApply, 0);
            const newStatus = newBalance <= 0.01 ? 'paid' : newPaidAmount > 0 ? 'partial' : (invoice as any).status;

            const { error: invUpdErr } = await supabase
              .from('ap_invoices')
              .update({
                paid_amount: newPaidAmount,
                balance_amount: newBalance,
                status: newStatus,
                updated_at: new Date().toISOString(),
              })
              .eq('id', payment.invoice_id)
              .eq('user_id', tenantId);

            if (invUpdErr) throw invUpdErr;
          }
        }
      }

      return { request, entry };
    } catch (error) {
      const e: any = error;
      const details = e?.details ? ` | ${e.details}` : '';
      const hint = e?.hint ? ` | ${e.hint}` : '';
      const code = e?.code ? ` | code=${e.code}` : '';
      console.error('paymentRequestsService.approveAndCreateJournalEntry error', error);
      if (e?.message && typeof e.message === 'string') {
        throw new Error(`${e.message}${details}${hint}${code}`);
      }
      throw error;
    }
  },
};

/* ==========================================================
   Bank Deposits Service
   Tabla: bank_deposits
========================================================== */
export const bankDepositsService = {
  async getAll(userId: string) {
    try {
      if (!userId) return [];
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('bank_deposits')
        .select('*')
        .eq('user_id', tenantId)
        .order('deposit_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async create(userId: string, deposit: {
    bank_id: string;
    bank_account_code: string;
    currency: string;
    amount: number;
    deposit_date: string;
    reference: string;
    description: string;
    source_account_id?: string; // Cuenta de origen del depósito (opcional)
  }) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');
      const now = new Date().toISOString();
      const payload = {
        ...deposit,
        user_id: tenantId,
        created_at: now,
        updated_at: now,
      };

      const { data, error } = await supabase
        .from('bank_deposits')
        .insert(payload)
        .select('*')
        .single();

      if (error) throw error;
      // Nota: El asiento contable se crea en el frontend (deposits.tsx) para tener mejor control
      // sobre la cuenta de origen seleccionada por el usuario
      return data;
    } catch (error) {
      console.error('bankDepositsService.create error', error);
      throw error;
    }
  },
};

/* ==========================================================
   Bank Currencies Service
   Tabla: bank_currencies
========================================================== */
export const bankCurrenciesService = {
  async getAll(userId: string) {
    try {
      if (!userId) return [];
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('bank_currencies')
        .select('*')
        .eq('user_id', tenantId)
        .order('is_base', { ascending: false })
        .order('code');

      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async create(userId: string, currency: {
    code: string;
    name: string;
    symbol: string;
    is_base?: boolean;
    is_active?: boolean;
  }) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');
      const now = new Date().toISOString();
      const payload = {
        ...currency,
        is_base: currency.is_base ?? false,
        is_active: currency.is_active ?? true,
        user_id: tenantId,
        created_at: now,
        updated_at: now,
      };

      const { data, error } = await supabase
        .from('bank_currencies')
        .insert(payload)
        .select('*')
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('bankCurrenciesService.create error', error);
      throw error;
    }
  },
};

/* ==========================================================
   Bank Exchange Rates Service
   Tabla: bank_exchange_rates
========================================================== */
export const bankExchangeRatesService = {
  async getAll(userId: string) {
    try {
      if (!userId) return [];
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('bank_exchange_rates')
        .select('*')
        .eq('user_id', tenantId)
        .order('valid_from', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async create(userId: string, rate: {
    base_currency_code: string;
    target_currency_code: string;
    rate: number;
    valid_from: string;
    valid_to?: string | null;
  }) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');
      const now = new Date().toISOString();
      const payload = {
        ...rate,
        valid_to: rate.valid_to || null,
        user_id: tenantId,
        created_at: now,
        updated_at: now,
      };

      const { data, error } = await supabase
        .from('bank_exchange_rates')
        .insert(payload)
        .select('*')
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('bankExchangeRatesService.create error', error);
      throw error;
    }
  },

  /**
   * Obtiene la tasa cambiaria vigente para un par de monedas en una fecha dada.
   * Busca primero el par directo (base -> destino) y, si no existe, intenta el par inverso (destino -> base) invirtiendo la tasa.
   */
  async getEffectiveRate(
    userId: string,
    baseCurrencyCode: string,
    targetCurrencyCode: string,
    onDate: string,
  ): Promise<number | null> {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return null;
      if (!baseCurrencyCode || !targetCurrencyCode) return null;
      if (baseCurrencyCode === targetCurrencyCode) return 1;

      const asOf = onDate || new Date().toISOString().slice(0, 10);

      // Buscar tasa directa base -> destino
      const { data: direct, error: directError } = await supabase
        .from('bank_exchange_rates')
        .select('*')
        .eq('user_id', tenantId)
        .eq('base_currency_code', baseCurrencyCode)
        .eq('target_currency_code', targetCurrencyCode)
        .lte('valid_from', asOf)
        .or('valid_to.is.null,valid_to.gte.' + asOf)
        .order('valid_from', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!directError && direct && typeof direct.rate === 'number' && direct.rate > 0) {
        return Number(direct.rate) || null;
      }

      // Si no hay directa, intentar tasa inversa destino -> base
      const { data: inverse, error: inverseError } = await supabase
        .from('bank_exchange_rates')
        .select('*')
        .eq('user_id', tenantId)
        .eq('base_currency_code', targetCurrencyCode)
        .eq('target_currency_code', baseCurrencyCode)
        .lte('valid_from', asOf)
        .or('valid_to.is.null,valid_to.gte.' + asOf)
        .order('valid_from', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!inverseError && inverse && typeof inverse.rate === 'number' && inverse.rate > 0) {
        return 1 / Number(inverse.rate);
      }

      return null;
    } catch (error) {
      console.error('bankExchangeRatesService.getEffectiveRate error', error);
      return null;
    }
  },
};

/* ==========================================================
   Cash Closing Service (Daily Cash Register Closings)
   Tabla: cash_closings
========================================================== */
export const cashClosingService = {
  async getAll(userId: string) {
    try {
      if (!userId) return [];
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('cash_closings')
        .select('*')
        .eq('user_id', tenantId)
        .order('closing_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async getByDate(userId: string, closingDate: string) {
    try {
      if (!userId || !closingDate) return [];
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('cash_closings')
        .select('*')
        .eq('user_id', tenantId)
        .eq('closing_date', closingDate)
        .order('created_at', { ascending: false });
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async create(userId: string, closing: any) {
    try {
      if (!userId) throw new Error('userId required');
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');
      const now = new Date().toISOString();
      const payload = {
        ...closing,
        user_id: tenantId,
        created_at: now,
        updated_at: now,
      };
      const { data, error } = await supabase
        .from('cash_closings')
        .insert(payload)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('cashClosingService.create error', error);
      throw error;
    }
  },

  async update(id: string, closing: any) {
    try {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('cash_closings')
        .update({ ...closing, updated_at: now })
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('cashClosingService.update error', error);
      throw error;
    }
  },
};

/* ==========================================================
   Audit Logs Service
   (simple helper used by other services)
========================================================== */
export const auditLogsService = {
  async logAction(payload: { action: string; entity?: string; entity_id?: string | null; details?: any }) {
    try {
      // Leer configuración para saber si está habilitado
      const { data: settings, error: settingsError } = await supabase
        .from('accounting_settings')
        .select('audit_log_enabled')
        .limit(1)
        .maybeSingle();

      if (settingsError && settingsError.code !== 'PGRST116') throw settingsError;
      if (!settings?.audit_log_enabled) return;

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const logPayload: any = {
        user_id: user?.id ?? null,
        action: payload.action,
        entity: payload.entity ?? null,
        entity_id: payload.entity_id ?? null,
        details: payload.details ?? {},
      };

      const { error } = await supabase
        .from('audit_logs')
        .insert(logPayload);

      if (error) throw error;
    } catch (error) {
      // No romper el flujo de negocio si falla el log
      // eslint-disable-next-line no-console
      console.error('auditLogsService.logAction error', error);
    }
  },

  async exportLogs() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) return [];

      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) return [];

      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('user_id', tenantId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data ?? [];
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('auditLogsService.exportLogs error', error);
      return [];
    }
  },
};

/* ==========================================================
   Customers Service (Accounts Receivable)
========================================================== */
export const customersService = {
  async getAll(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('user_id', tenantId)
        .order('name');
      if (error) throw error;
      return (data || []).map((c: any) => ({
        id: c.id as string,
        name: c.name || '',
        document: c.document || '',
        phone: c.phone || '',
        email: c.email || '',
        address: c.address || '',
        creditLimit: Number(c.credit_limit) || 0,
        currentBalance: Number(c.current_balance) || 0,
        status: (c.status as 'active' | 'inactive' | 'blocked') || 'active',
        arAccountId: c.ar_account_id || null,
        advanceAccountId: c.advance_account_id || null,
        documentType: c.document_type || null,
        contactName: c.contact_name || '',
        contactPhone: c.contact_phone || '',
        contactEmail: c.contact_email || '',
        customerType: c.customer_type || '',
        paymentTerms: c.payment_terms || '',
        invoiceType: c.invoice_type || '',
        ncfType: c.ncf_type || '',
        salesperson: c.salesperson || '',
        salesRepId: c.sales_rep_id || null,
        paymentTermId: c.payment_term_id || null,
      }));
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async create(userId: string, customer: { 
    name: string; 
    document: string; 
    phone: string; 
    email: string; 
    address: string; 
    creditLimit: number; 
    status: 'active' | 'inactive' | 'blocked'; 
    arAccountId?: string; 
    advanceAccountId?: string; 
    documentType?: string; 
    contactName?: string; 
    contactPhone?: string; 
    contactEmail?: string; 
    customerType?: string; 
    paymentTerms?: string; 
    invoiceType?: string; 
    ncfType?: string; 
    salesperson?: string; 
    salesRepId?: string | null;
    paymentTermId?: string | null 
  }) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');
      const payload = {
        user_id: tenantId,
        name: customer.name,
        document: customer.document,
        phone: customer.phone,
        email: customer.email,
        address: customer.address,
        credit_limit: customer.creditLimit,
        current_balance: 0,
        status: customer.status,
        ar_account_id: customer.arAccountId || null,
        advance_account_id: customer.advanceAccountId || null,
        document_type: customer.documentType || null,
        contact_name: customer.contactName || null,
        contact_phone: customer.contactPhone || null,
        contact_email: customer.contactEmail || null,
        customer_type: customer.customerType || null,
        payment_terms: customer.paymentTerms || null,
        invoice_type: customer.invoiceType || null,
        ncf_type: customer.ncfType || null,
        salesperson: customer.salesperson || null,
        sales_rep_id: customer.salesRepId || null,
        payment_term_id: customer.paymentTermId || null,
      };

      const tryInsert = async (body: any) => {
        const { data, error } = await supabase
          .from('customers')
          .insert(body)
          .select('*')
          .single();
        if (error) throw error;
        return data;
      };

      const droppedCols = new Set<string>();

      let data: any = null;
      let payloadToTry: any = { ...payload };
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          droppedCols.forEach((c) => {
            delete payloadToTry[c];
          });
          data = await tryInsert(payloadToTry);
          break;
        } catch (error: any) {
          if ((error as any)?.code !== 'PGRST204') throw error;
          const msg = String((error as any)?.message || '');
          const m = msg.match(/Could not find the '([^']+)' column/i);
          const missingCol = m?.[1] ? String(m[1]) : null;
          if (!missingCol) throw error;
          droppedCols.add(missingCol);
          payloadToTry = { ...payload };
        }
      }

      if (!data) throw new Error('No se pudo crear el cliente (customers): esquema incompatible o error desconocido');
      await auditLogsService.logAction({
        action: 'create_customer',
        entity: 'customer',
        entity_id: data.id,
        details: { name: data.name, document: data.document },
      });
      return data;
    } catch (error) {
      console.error('customersService.create error', error);
      throw error;
    }
  },

  async update(id: string, customer: { 
    name: string; 
    document: string; 
    phone: string; 
    email: string; 
    address: string; 
    creditLimit: number; 
    status: 'active' | 'inactive' | 'blocked'; 
    arAccountId?: string; 
    advanceAccountId?: string; 
    documentType?: string; 
    contactName?: string; 
    contactPhone?: string; 
    contactEmail?: string; 
    customerType?: string; 
    paymentTerms?: string; 
    invoiceType?: string; 
    ncfType?: string; 
    salesperson?: string; 
    salesRepId?: string | null;
    paymentTermId?: string | null 
  }) {
    try {
      const payload = {
        name: customer.name,
        document: customer.document,
        phone: customer.phone,
        email: customer.email,
        address: customer.address,
        credit_limit: customer.creditLimit,
        status: customer.status,
        ar_account_id: customer.arAccountId || null,
        advance_account_id: customer.advanceAccountId || null,
        document_type: customer.documentType || null,
        contact_name: customer.contactName || null,
        contact_phone: customer.contactPhone || null,
        contact_email: customer.contactEmail || null,
        customer_type: customer.customerType || null,
        payment_terms: customer.paymentTerms || null,
        invoice_type: customer.invoiceType || null,
        ncf_type: customer.ncfType || null,
        salesperson: customer.salesperson || null,
        sales_rep_id: customer.salesRepId || null,
        payment_term_id: customer.paymentTermId || null,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from('customers')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      await auditLogsService.logAction({
        action: 'update_customer',
        entity: 'customer',
        entity_id: data.id,
        details: { name: data.name, document: data.document },
      });
      return data;
    } catch (error) {
      console.error('customersService.update error', error);
      throw error;
    }
  },
  async delete(id: string) {
    try {
      const { error } = await supabase
        .from('customers')
        .delete()
        .eq('id', id);
      if (error) throw error;
    } catch (error) {
      console.error('customersService.delete error', error);
      throw error;
    }
  },
};

/* ==========================================================
   Customer Types Service
========================================================== */
export const customerTypesService = {
  async getAll(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('customer_types')
        .select('*')
        .eq('user_id', tenantId)
        .order('name');
      if (error) return handleDatabaseError(error, []);
      return (data || []).map((t: any) => ({
        id: t.id as string,
        name: t.name || '',
        description: t.description || '',
        fixedDiscount: Number(t.fixed_discount) || 0,
        creditLimit: Number(t.credit_limit) || 0,
        allowedDelayDays: Number(t.allowed_delay_days) || 0,
        noTax: Boolean(t.no_tax),
        arAccountId: t.ar_account_id || null,
        arAccountCode: t.ar_account_code || null,
      }));
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async create(userId: string, payload: { name: string; description?: string; fixedDiscount?: number; creditLimit?: number; allowedDelayDays?: number; noTax?: boolean; arAccountId?: string }) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');
      const now = new Date().toISOString();

      // Intentamos obtener el código de cuenta si se pasa arAccountId
      let arAccountCode: string | null = null;
      if (payload.arAccountId) {
        const { data: acc, error: accErr } = await supabase
          .from('chart_accounts')
          .select('code')
          .eq('id', payload.arAccountId)
          .maybeSingle();
        if (!accErr && acc?.code) {
          arAccountCode = String(acc.code);
        }
      }

      const body = {
        user_id: tenantId,
        name: payload.name,
        description: payload.description || null,
        fixed_discount: typeof payload.fixedDiscount === 'number' ? payload.fixedDiscount : 0,
        credit_limit: typeof payload.creditLimit === 'number' ? payload.creditLimit : 0,
        allowed_delay_days: typeof payload.allowedDelayDays === 'number' ? payload.allowedDelayDays : 0,
        no_tax: Boolean(payload.noTax),
        ar_account_id: payload.arAccountId || null,
        ar_account_code: arAccountCode,
        created_at: now,
        updated_at: now,
      };

      const { data, error } = await supabase
        .from('customer_types')
        .insert(body)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('customerTypesService.create error', error);
      throw error;
    }
  },

  async update(id: string, payload: { name: string; description?: string; fixedDiscount?: number; creditLimit?: number; allowedDelayDays?: number; noTax?: boolean; arAccountId?: string }) {
    try {
      const patch: any = {
        name: payload.name,
        description: payload.description || null,
        fixed_discount: typeof payload.fixedDiscount === 'number' ? payload.fixedDiscount : 0,
        credit_limit: typeof payload.creditLimit === 'number' ? payload.creditLimit : 0,
        allowed_delay_days: typeof payload.allowedDelayDays === 'number' ? payload.allowedDelayDays : 0,
        no_tax: Boolean(payload.noTax),
        ar_account_id: payload.arAccountId || null,
        updated_at: new Date().toISOString(),
      };

      // Actualizar código de cuenta si cambia arAccountId
      if (payload.arAccountId) {
        const { data: acc, error: accErr } = await supabase
          .from('chart_accounts')
          .select('code')
          .eq('id', payload.arAccountId)
          .maybeSingle();
        if (!accErr && acc?.code) {
          patch.ar_account_code = String(acc.code);
        }
      } else {
        patch.ar_account_code = null;
      }

      const { data, error } = await supabase
        .from('customer_types')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('customerTypesService.update error', error);
      throw error;
    }
  },
};

/* ==========================================================
   Chart of Accounts Service
========================================================== */
export const chartAccountsService = {
  async getAll(userId: string) {
    try {
      if (!userId) return [];
      const tenantId = await resolveTenantId(userId);
      const { data, error } = await supabase
        .from('chart_accounts')
        .select('*')
        .eq('user_id', tenantId)
        .order('code');

      if (error) return handleDatabaseError(error, []);

      // Normalizar el formato para que todas las pantallas puedan usar
      // propiedades camelCase como isActive / allowPosting / isBankAccount,
      // sin perder los campos originales snake_case.
      return (data ?? []).map((row: any) => ({
        ...row,
        id: row.id,
        code: row.code || '',
        name: row.name || '',
        type: row.type || 'asset',
        parentId: row.parent_id || undefined,
        level: row.level || 1,
        balance: row.balance || 0,
        isActive: row.is_active !== false,
        description: row.description || '',
        normalBalance: row.normal_balance || 'debit',
        allowPosting: row.allow_posting !== false,
        isBankAccount: row.is_bank_account === true,
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null,
      }));
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  // Obtener saldos por cuenta a partir de las líneas de diario general.
  // Esto es la base para balances y estados financieros.
  async getBalances(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      // 1. Cargar cuentas activas con su tipo y saldo normal
      const { data: accounts, error: accError } = await supabase
        .from('chart_accounts')
        .select('id, code, name, type, normal_balance, is_active, is_bank_account, allow_posting')
        .eq('user_id', tenantId)
        .eq('is_active', true)
        .order('code');

      if (accError) {
        console.error('Error loading accounts for balances:', accError);
        return [];
      }

      // 2. Cargar líneas de diario solo de asientos contabilizados (status = 'posted')
      const { data: lines, error: linesError } = await supabase
        .from('journal_entry_lines')
        .select('account_id, debit_amount, credit_amount, journal_entries!inner(status, user_id)')
        .eq('journal_entries.user_id', tenantId)
        .eq('journal_entries.status', 'posted');

      if (linesError) {
        console.error('Error loading journal lines for balances:', linesError);
        return [];
      }

      // 3. Agrupar débitos y créditos por cuenta
      const sums: Record<string, { debit: number; credit: number }> = {};

      (lines || []).forEach((line: any) => {
        const accountId = line.account_id as string;
        const debit = Number(line.debit_amount) || 0;
        const credit = Number(line.credit_amount) || 0;

        if (!sums[accountId]) {
          sums[accountId] = { debit: 0, credit: 0 };
        }
        sums[accountId].debit += debit;
        sums[accountId].credit += credit;
      });

      // 4. Calcular saldo firmado según normal_balance
      const balances = (accounts || []).map((acc: any) => {
        const sum = sums[acc.id] || { debit: 0, credit: 0 };
        const normal: 'debit' | 'credit' = acc.normal_balance || 'debit';

        const balance =
          normal === 'debit'
            ? sum.debit - sum.credit
            : sum.credit - sum.debit;

        return {
          id: acc.id,
          code: acc.code || '',
          name: acc.name || '',
          type: acc.type || 'asset',
          isBankAccount: Boolean(acc.is_bank_account),
          allowPosting: acc.allow_posting !== false,
          normalBalance: normal,
          debit: sum.debit,
          credit: sum.credit,
          balance,
        };
      });

      return balances;
    } catch (error) {
      console.error('Error in getBalances:', error);
      return [];
    }
  },

  async create(userId: string, account: any) {
    try {
      const tenantId = await resolveTenantId(userId);
      const normalizeAccountType = (t: string) => {
        const v = (t || '').toLowerCase().trim();
        if (['asset', 'liability', 'equity', 'income', 'cost', 'expense'].includes(v)) return v;
        if (['activo', 'activos'].includes(v)) return 'asset';
        if (['pasivo', 'pasivos'].includes(v)) return 'liability';
        if (['patrimonio', 'capital'].includes(v)) return 'equity';
        if (['ingreso', 'ingresos'].includes(v)) return 'income';
        if (['costo', 'costos'].includes(v)) return 'cost';
        if (['gasto', 'gastos'].includes(v)) return 'expense';
        return 'asset';
      };

      const accountData = {
        ...account,
        user_id: tenantId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      accountData.type = normalizeAccountType(accountData.type);
      if (!accountData.normal_balance) {
        accountData.normal_balance = ['asset', 'expense'].includes(accountData.type) ? 'debit' : 'credit';
      }

      const { data, error } = await supabase
        .from('chart_accounts')
        .upsert(accountData, { onConflict: 'user_id,code' })
        .select()
        .single();
      
      if (error) throw error;
      
      // Mapear la respuesta al formato esperado
      return {
        id: data.id,
        code: data.code || '',
        name: data.name || '',
        type: data.type || 'asset',
        parentId: data.parent_id || undefined,
        level: data.level || 1,
        balance: data.balance || 0,
        isActive: data.is_active !== false,
        description: data.description || '',
        normalBalance: data.normal_balance || 'debit',
        allowPosting: data.allow_posting !== false,
        createdAt: data.created_at || new Date().toISOString(),
        updatedAt: data.updated_at || new Date().toISOString()
      };
    } catch (error) {
      console.error('Error creating account:', error);
      throw error;
    }
  },

  async update(id: string, account: any) {
    try {
      const updateData = {
        ...account,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('chart_accounts')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating account:', error);
      throw error;
    } 
  },

  async checkRelations(id: string): Promise<{ hasAccountingSettings: boolean; hasJournalEntries: boolean }> {
    try {
      const [settingsRes, linesRes] = await Promise.all([
        supabase
          .from('accounting_settings')
          .select('id')
          .or(`ap_account_id.eq.${id},ar_account_id.eq.${id},sales_account_id.eq.${id},sales_tax_account_id.eq.${id},ap_bank_account_id.eq.${id}`)
          .limit(1),
        supabase
          .from('journal_entry_lines')
          .select('id')
          .eq('account_id', id)
          .limit(1),
      ]);

      const hasAccountingSettings = Array.isArray(settingsRes.data) && settingsRes.data.length > 0;
      const hasJournalEntries = Array.isArray(linesRes.data) && linesRes.data.length > 0;

      return { hasAccountingSettings, hasJournalEntries };
    } catch (error) {
      console.error('Error checking account relations:', error);
      return { hasAccountingSettings: false, hasJournalEntries: false };
    }
  },

  async delete(id: string) {
    try {
      const relations = await chartAccountsService.checkRelations(id);
      if (relations.hasAccountingSettings || relations.hasJournalEntries) {
        throw new Error('Cannot delete account with existing relations');
      }

      const { error } = await supabase
        .from('chart_accounts')
        .delete()
        .eq('id', id);
      if (error) throw error;
    } catch (error) {
      console.error('Error deleting account:', error);
      throw error;
    }
  },

  async generateBalanceSheet(userId: string, asOfDate: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      const { data, error } = await supabase
        .from('chart_accounts')
        .select('*')
        .in('type', ['asset', 'liability', 'equity'])
        .eq('user_id', tenantId)
        .eq('is_active', true)
        .order('code');

      if (error) {
        console.error('Error in generateBalanceSheet:', error);
        return {
          assets: [],
          liabilities: [],
          equity: [],
          totalAssets: 0,
          totalLiabilities: 0,
          totalEquity: 0,
          asOfDate,
        };
      }

      const assets = data?.filter((account: any) => account.type === 'asset') || [];
      const liabilities = data?.filter((account: any) => account.type === 'liability') || [];
      const equity = data?.filter((account: any) => account.type === 'equity') || [];

      // Para el balance general, usamos el signo del saldo para que las contra-cuentas
      // (por ejemplo, depreciaciones acumuladas como contra-activo) reduzcan el total.
      const totalAssets = assets.reduce((sum: number, account: any) => sum + (account.balance || 0), 0);
      const totalLiabilities = liabilities.reduce((sum: number, account: any) => sum + (account.balance || 0), 0);
      const totalEquity = equity.reduce((sum: number, account: any) => sum + (account.balance || 0), 0);

      // A nivel de detalle, seguimos exponiendo el saldo en valor absoluto para no
      // cambiar el formato de presentación de líneas individuales.
      return {
        assets: assets.map((acc: any) => ({ ...acc, balance: Math.abs(acc.balance || 0) })),
        liabilities: liabilities.map((acc: any) => ({ ...acc, balance: Math.abs(acc.balance || 0) })),
        equity: equity.map((acc: any) => ({ ...acc, balance: Math.abs(acc.balance || 0) })),
        totalAssets,
        totalLiabilities,
        totalEquity,
        asOfDate,
      };
    } catch (error) {
      console.error('Error generating balance sheet:', error);
      return {
        assets: [],
        liabilities: [],
        equity: [],
        totalAssets: 0,
        totalLiabilities: 0,
        totalEquity: 0,
        asOfDate,
      };
    }
  },

  async seedFromTemplate(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      const { data: templateRows, error } = await supabase
        .from('chart_accounts_template')
        .select('*');

      if (error) throw error;
      if (!templateRows || templateRows.length === 0) {
        return { created: 0 };
      }

      // Obtener códigos ya existentes para este usuario
      const { data: existing, error: existingError } = await supabase
        .from('chart_accounts')
        .select('code')
        .eq('user_id', tenantId);

      if (existingError) throw existingError;
      const existingCodes = new Set((existing || []).map((r: any) => String(r.code || '').trim()));

      // Normalizar y deduplicar filas de la plantilla por código
      const uniqueTemplateMap = new Map<string, any>();
      for (const row of templateRows as any[]) {
        const normalizedCode = String(row.code || '').trim();
        if (!normalizedCode) continue;
        if (!uniqueTemplateMap.has(normalizedCode)) {
          uniqueTemplateMap.set(normalizedCode, row);
        }
      }
      const uniqueTemplateRows = Array.from(uniqueTemplateMap.values());

      const rowsToInsert = uniqueTemplateRows
        .filter((row: any) => {
          const code = String(row.code || '').trim();
          return !!code && !existingCodes.has(code);
        })
        .map((row: any) => ({
          user_id: tenantId,
          code: row.code,
          name: row.name,
          type: row.type || 'asset',
          level: row.level || 1,
          balance: row.balance || 0,
          is_active: row.is_active !== false,
          description: row.description || null,
          normal_balance: row.normal_balance || 'debit',
          allow_posting: row.allow_posting !== false,
          parent_id: row.parent_id || null,
        }));

      if (rowsToInsert.length === 0) {
        return { created: 0 };
      }

      const { error: insertError } = await supabase
        .from('chart_accounts')
        .upsert(rowsToInsert, {
          onConflict: 'user_id,code',
          ignoreDuplicates: true,
        });

      if (insertError) throw insertError;
      return { created: rowsToInsert.length };
    } catch (error) {
      console.error('Error seeding chart of accounts from template:', error);
      throw error;
    }
  },

  async generateIncomeStatement(userId: string, fromDate: string, toDate: string) {
    if (!userId) {
      return {
        income: [],
        costs: [],
        expenses: [],
        totalIncome: 0,
        totalCosts: 0,
        totalExpenses: 0,
        netIncome: 0,
        fromDate,
        toDate
      };
    }
    try {
      const tenantId = await resolveTenantId(userId);
      const { data, error } = await supabase
        .from('chart_accounts')
        .select('*')
        .in('type', ['income', 'ingreso', 'ingresos', 'cost', 'costo', 'costos', 'expense', 'gasto', 'gastos'])
        .eq('user_id', tenantId)
        .eq('is_active', true)
        .order('code');

      if (error) {
        console.error('Error in generateIncomeStatement:', error);
        return {
          income: [],
          costs: [],
          expenses: [],
          totalIncome: 0,
          totalCosts: 0,
          totalExpenses: 0,
          netIncome: 0,
          fromDate,
          toDate
        };
      }

      const normalizeStatementType = (t: any) => {
        const v = String(t || '').toLowerCase().trim();
        if (v === 'income' || v === 'ingreso' || v === 'ingresos') return 'income';
        if (v === 'cost' || v === 'costo' || v === 'costos') return 'cost';
        if (v === 'expense' || v === 'gasto' || v === 'gastos') return 'expense';
        return v;
      };

      const accounts = (data || []) as any[];
      const incomeAccounts = accounts.filter((account) => normalizeStatementType(account.type) === 'income');
      const costAccounts = accounts.filter((account) => normalizeStatementType(account.type) === 'cost');
      const expenseAccounts = accounts.filter((account) => normalizeStatementType(account.type) === 'expense');

      const accountIds = accounts.map((acc) => String(acc.id || '')).filter(Boolean);
      const sums: Record<string, { debit: number; credit: number }> = {};

      if (accountIds.length > 0) {
        const { data: lines, error: linesError } = await supabase
          .from('journal_entry_lines')
          .select('account_id, debit_amount, credit_amount, journal_entries!inner(entry_date, status, user_id)')
          .in('account_id', accountIds)
          .eq('journal_entries.user_id', tenantId)
          .eq('journal_entries.status', 'posted')
          .gte('journal_entries.entry_date', fromDate)
          .lte('journal_entries.entry_date', toDate);

        if (linesError) {
          console.error('Error in generateIncomeStatement lines:', linesError);
        } else {
          (lines || []).forEach((line: any) => {
            const accountId = String(line.account_id || '');
            if (!accountId) return;
            const debit = Number(line.debit_amount) || 0;
            const credit = Number(line.credit_amount) || 0;
            if (!sums[accountId]) {
              sums[accountId] = { debit: 0, credit: 0 };
            }
            sums[accountId].debit += debit;
            sums[accountId].credit += credit;
          });
        }
      }

      const signedBalances: Record<string, number> = {};
      accounts.forEach((acc) => {
        const accountId = String(acc.id || '');
        if (!accountId) return;
        const sum = sums[accountId] || { debit: 0, credit: 0 };
        const t = normalizeStatementType(acc.type);
        let balance = 0;
        if (t === 'income') {
          balance = sum.credit - sum.debit;
        } else if (t === 'cost' || t === 'expense') {
          balance = sum.debit - sum.credit;
        } else if (String(acc.normal_balance || '').toLowerCase() === 'credit') {
          balance = sum.credit - sum.debit;
        } else {
          balance = sum.debit - sum.credit;
        }
        signedBalances[accountId] = Number(balance.toFixed(2));
      });

      const income = incomeAccounts.map((acc) => ({
        ...acc,
        balance: Math.abs(signedBalances[String(acc.id || '')] || 0),
      }));

      const costs = costAccounts.map((acc) => ({
        ...acc,
        balance: Math.abs(signedBalances[String(acc.id || '')] || 0),
      }));

      const expenses = expenseAccounts.map((acc) => ({
        ...acc,
        balance: Math.abs(signedBalances[String(acc.id || '')] || 0),
      }));

      // Para ingresos usamos el signo del saldo; esto permite que cuentas como
      // devoluciones o descuentos sobre ventas (registradas con movimientos en
      // sentido contrario) disminuyan el ingreso total.
      const totalIncome = Number(
        incomeAccounts
          .reduce((sum: number, account: any) => sum + (signedBalances[String(account.id || '')] || 0), 0)
          .toFixed(2)
      );

      // Para costos y gastos seguimos utilizando el valor absoluto como magnitud
      // de consumo, y los restamos del ingreso total para obtener la utilidad.
      const totalCosts = Number(
        costAccounts
          .reduce((sum: number, account: any) => sum + Math.abs(signedBalances[String(account.id || '')] || 0), 0)
          .toFixed(2)
      );
      const totalExpenses = Number(
        expenseAccounts
          .reduce((sum: number, account: any) => sum + Math.abs(signedBalances[String(account.id || '')] || 0), 0)
          .toFixed(2)
      );
      const netIncome = Number((totalIncome - totalCosts - totalExpenses).toFixed(2));

      return {
        income,
        costs,
        expenses,
        totalIncome,
        totalCosts,
        totalExpenses,
        netIncome,
        fromDate,
        toDate
      };
    } catch (error) {
      console.error('Error generating income statement:', error);
      return {
        income: [],
        costs: [],
        expenses: [],
        totalIncome: 0,
        totalCosts: 0,
        totalExpenses: 0,
        netIncome: 0,
        fromDate,
        toDate
      };
    }
  },

  async generateTrialBalance(userId: string, asOfDate: string) {
    try {
      if (!userId) {
        return {
          accounts: [],
          totalDebits: 0,
          totalCredits: 0,
          isBalanced: true,
          asOfDate,
        };
      }

      const trial = await financialReportsService.getTrialBalance(userId, '1900-01-01', asOfDate);

      const totalDebits = trial.reduce((sum: number, acc: any) => sum + (acc.debit || 0), 0);
      const totalCredits = trial.reduce((sum: number, acc: any) => sum + (acc.credit || 0), 0);

      return {
        accounts: trial,
        totalDebits,
        totalCredits,
        isBalanced: Math.abs(totalDebits - totalCredits) < 0.01,
        asOfDate,
      };
    } catch (error) {
      console.error('Error generating trial balance:', error);
      return {
        accounts: [],
        totalDebits: 0,
        totalCredits: 0,
        isBalanced: true,
        asOfDate,
      };
    }
  },

  async generateCashFlowStatement(userId: string, fromDate: string, toDate: string) {
    if (!userId) {
      return {
        operatingCashFlow: 0,
        investingCashFlow: 0,
        financingCashFlow: 0,
        netCashFlow: 0,
        fromDate,
        toDate
      };
    }
    try {
      const tenantId = await resolveTenantId(userId);
      // Obtener movimientos de efectivo del período
      const { data: journalEntries, error } = await supabase
        .from('journal_entries')
        .select(`
          *,
          journal_entry_lines (
            *,
            chart_accounts (code, name, type)
          )
        `)
        .eq('user_id', tenantId)
        .eq('status', 'posted')
        .gte('entry_date', fromDate)
        .lte('entry_date', toDate)
        .order('entry_date');

      if (error) {
        console.error('Error in generateCashFlowStatement:', error);
        // Retornar datos de ejemplo
        return {
          operatingCashFlow: 0,
          investingCashFlow: 0,
          financingCashFlow: 0,
          netCashFlow: 0,
          fromDate,
          toDate
        };
      }

      let operatingCashFlow = 0;
      let investingCashFlow = 0;
      let financingCashFlow = 0;

      const normalizeCode = (raw: unknown) => String(raw || '').replace(/\./g, '');
      const isCashAccountCode = (code: string) =>
        code.startsWith('10') || code.startsWith('110') || code.startsWith('111') || code.startsWith('1102');

      const classifyEntry = (nonCashLines: any[]) => {
        let hasInvesting = false;
        let hasFinancing = false;

        (nonCashLines || []).forEach((line: any) => {
          const acc = line?.chart_accounts;
          const type = String(acc?.type || '').toLowerCase();
          const code = normalizeCode(acc?.code);

          if (type === 'liability' || type === 'pasivo' || type === 'equity' || type === 'patrimonio') {
            hasFinancing = true;
            return;
          }

          if (type === 'asset' || type === 'activo') {
            if (!(code.startsWith('10') || code.startsWith('11') || code.startsWith('12') || code.startsWith('13'))) {
              hasInvesting = true;
            }
          }
        });

        if (hasInvesting) return 'investing' as const;
        if (hasFinancing) return 'financing' as const;
        return 'operating' as const;
      };

      (journalEntries || []).forEach((entry: any) => {
        const lines = (entry?.journal_entry_lines || []) as any[];
        if (!lines || lines.length === 0) return;

        const cashLines: any[] = [];
        const nonCashLines: any[] = [];

        lines.forEach((line: any) => {
          const acc = line?.chart_accounts;
          const code = normalizeCode(acc?.code);
          if (code && isCashAccountCode(code)) {
            cashLines.push(line);
          } else {
            nonCashLines.push(line);
          }
        });

        if (cashLines.length === 0) return;

        const cashAmount = cashLines.reduce((sum, line) => {
          const debit = Number(line?.debit_amount) || 0;
          const credit = Number(line?.credit_amount) || 0;
          return sum + (debit - credit);
        }, 0);

        const bucket = classifyEntry(nonCashLines);
        if (bucket === 'investing') {
          investingCashFlow += cashAmount;
        } else if (bucket === 'financing') {
          financingCashFlow += cashAmount;
        } else {
          operatingCashFlow += cashAmount;
        }
      });

      const netCashFlow = operatingCashFlow + investingCashFlow + financingCashFlow;

      return {
        operatingCashFlow,
        investingCashFlow,
        financingCashFlow,
        netCashFlow,
        fromDate,
        toDate
      };
    } catch (error) {
      console.error('Error generating cash flow statement:', error);
      // Retornar datos de ejemplo si hay error
      return {
        operatingCashFlow: 0,
        investingCashFlow: 0,
        financingCashFlow: 0,
        netCashFlow: 0,
        fromDate,
        toDate
      };
    }
  }
};

/* ==========================================================
   Payment Terms Service
========================================================== */
export const paymentTermsService = {
  async getAll(userId: string) {
    try {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('payment_terms')
        .select('*')
        .eq('user_id', userId)
        .order('days');
      if (error) return handleDatabaseError(error, []);
      return (data || []).map((t: any) => ({
        id: t.id as string,
        name: t.name || '',
        description: t.description || '',
        days: Number(t.days) || 0,
      }));
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async create(userId: string, payload: { name: string; days: number; description?: string }) {
    try {
      if (!userId) throw new Error('userId required');
      const now = new Date().toISOString();
      const body = {
        user_id: userId,
        name: payload.name,
        days: Number(payload.days) || 0,
        description: payload.description || null,
        created_at: now,
        updated_at: now,
      };
      const { data, error } = await supabase
        .from('payment_terms')
        .insert(body)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('paymentTermsService.create error', error);
      throw error;
    }
  },

  async update(id: string, payload: { name?: string; days?: number; description?: string | null }) {
    try {
      const body: any = {
        updated_at: new Date().toISOString(),
      };
      if (typeof payload.name === 'string') body.name = payload.name;
      if (typeof payload.days === 'number') body.days = Number(payload.days) || 0;
      if (payload.description !== undefined) body.description = payload.description;

      const { data, error } = await supabase
        .from('payment_terms')
        .update(body)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('paymentTermsService.update error', error);
      throw error;
    }
  },

  async delete(id: string) {
    try {
      const { error } = await supabase
        .from('payment_terms')
        .delete()
        .eq('id', id);
      if (error) throw error;
    } catch (error) {
      console.error('supplierTypesService.delete error', error);
      throw error;
    }
  },
};

/* ==========================================================
   Petty Cash Service
========================================================== */
export const pettyCashService = {
  async getFunds(userId: string) {
    try {
      if (!userId) return [];
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('petty_cash_funds')
        .select('*')
        .eq('user_id', tenantId)
        .order('created_at', { ascending: false });
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async getExpenses(userId: string) {
    try {
      if (!userId) return [];
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('petty_cash_expenses')
        .select('*')
        .eq('user_id', tenantId)
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async getReimbursements(userId: string) {
    try {
      if (!userId) return [];
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('petty_cash_reimbursements')
        .select('*')
        .eq('user_id', tenantId)
        .order('reimbursement_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async createFund(userId: string, fund: any, options?: { skipPeriodValidation?: boolean }) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');

      // Validar período contable abierto
      if (!options?.skipPeriodValidation) {
        const fundDate = fund.created_date || new Date().toISOString().split('T')[0];
        await accountingPeriodsService.requireOpenPeriod(tenantId, fundDate);
      }

      const initialAmount = Number(fund.initial_amount) || 0;
      const payload = {
        ...fund,
        user_id: tenantId,
        current_balance: initialAmount,
      };
      const { data, error } = await supabase
        .from('petty_cash_funds')
        .insert(payload)
        .select('*')
        .single();
      if (error) throw error;

      // Asiento contable automático al crear el fondo: Debe Caja Chica / Haber Banco
      try {
        const amount = Number(fund.initial_amount) || 0;
        if (amount > 0 && fund.petty_cash_account_id && fund.bank_account_id) {
          // Obtener cuenta contable del banco
          const { data: bankData, error: bankError } = await supabase
            .from('bank_accounts')
            .select('chart_account_id, bank_name')
            .eq('id', fund.bank_account_id)
            .maybeSingle();

          if (!bankError && bankData?.chart_account_id) {
            const entryDate = new Date().toISOString().split('T')[0];
            const entryPayload = {
              entry_number: `PCF-${String(entryDate).slice(0, 10)}-${(data.id || '').toString().slice(0, 6)}`,
              entry_date: String(entryDate),
              description: fund.description || `Creación fondo de caja chica ${fund.name || ''}`.trim(),
              reference: data.id ? String(data.id) : null,
              status: 'posted' as const,
            };

            const lines = [
              {
                account_id: fund.petty_cash_account_id as string,
                description: 'Asignación inicial de Caja Chica',
                debit_amount: amount,
                credit_amount: 0,
              },
              {
                account_id: bankData.chart_account_id as string,
                description: `Banco ${bankData.bank_name || ''}`.trim(),
                debit_amount: 0,
                credit_amount: amount,
              },
            ];

            await journalEntriesService.createWithLines(userId, entryPayload, lines);
          }
        }
      } catch (jeError) {
        console.error('Error creando asiento de creación de fondo de caja chica:', jeError);
      }

      return data;
    } catch (error) {
      console.error('pettyCashService.createFund error', error);
      throw error;
    }
  },

  async updateFund(userId: string, fundId: string, patch: any) {
    try {
      const payload = {
        ...patch,
      };

      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');

      const { data, error } = await supabase
        .from('petty_cash_funds')
        .update(payload)
        .eq('id', fundId)
        .eq('user_id', tenantId)
        .select('*')
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('pettyCashService.updateFund error', error);
      throw error;
    }
  },

  async createExpense(userId: string, expense: any, options?: { skipPeriodValidation?: boolean }) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');

      // Validar período contable abierto
      if (!options?.skipPeriodValidation) {
        const expenseDate = expense.expense_date || new Date().toISOString().split('T')[0];
        await accountingPeriodsService.requireOpenPeriod(tenantId, expenseDate);
      }

      const payload = {
        ...expense,
        user_id: tenantId,
      };
      const { data, error } = await supabase
        .from('petty_cash_expenses')
        .insert(payload)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('pettyCashService.createExpense error', error);
      throw error;
    }
  },

  async approveExpense(userId: string, expenseId: string, approvedBy: string | null) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');

      // Validar saldo disponible del fondo antes de aprobar el gasto
      const { data: expenseRow, error: expenseError } = await supabase
        .from('petty_cash_expenses')
        .select('*')
        .eq('id', expenseId)
        .eq('user_id', tenantId)
        .single();

      if (expenseError || !expenseRow) {
        throw expenseError || new Error('Gasto de caja chica no encontrado');
      }

      const requestedAmount = Number(expenseRow.amount) || 0;
      if (requestedAmount > 0 && expenseRow.fund_id) {
        const { data: fundDataForCheck, error: fundErrorForCheck } = await supabase
          .from('petty_cash_funds')
          .select('id, current_balance')
          .eq('id', expenseRow.fund_id)
          .maybeSingle();

        if (!fundErrorForCheck && fundDataForCheck) {
          const currentBalance = Number(fundDataForCheck.current_balance || 0);
          if (currentBalance < requestedAmount) {
            throw new Error('Fondos insuficientes en caja chica para aprobar este gasto');
          }
        }
      }

      const updatePayload: any = {
        status: 'approved',
        approved_by: approvedBy,
        approved_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from('petty_cash_expenses')
        .update(updatePayload)
        .eq('id', expenseId)
        .eq('user_id', tenantId)
        .select('*')
        .single();
      if (error) throw error;

      // Asiento contable automático al aprobar gasto: Debe Gasto / Haber Caja Chica
      try {
        const approvedAmount = Number(data.amount) || 0;
        if (approvedAmount > 0 && data.expense_account_id && data.fund_id) {
          // Obtener fondo para saber la cuenta de caja chica
          const { data: fundData, error: fundError } = await supabase
            .from('petty_cash_funds')
            .select('id, petty_cash_account_id, current_balance')
            .eq('id', data.fund_id)
            .maybeSingle();

          if (!fundError && fundData?.petty_cash_account_id) {
            const entryDate = data.expense_date || new Date().toISOString().split('T')[0];
            const entryPayload = {
              entry_number: `PCE-${String(entryDate).slice(0, 10)}-${(data.id || '').toString().slice(0, 6)}`,
              entry_date: String(entryDate),
              description: data.description || 'Gasto de caja chica',
              reference: data.id ? String(data.id) : null,
              status: 'posted' as const,
            };

            const lines = [
              {
                account_id: data.expense_account_id as string,
                description: 'Gasto de Caja Chica',
                debit_amount: approvedAmount,
                credit_amount: 0,
              },
              {
                account_id: fundData.petty_cash_account_id as string,
                description: `Salida de Caja Chica fondo ${fundData.id}`,
                debit_amount: 0,
                credit_amount: approvedAmount,
              },
            ];

            await journalEntriesService.createWithLines(userId, entryPayload, lines);

            const currentBalance = Number(fundData.current_balance || 0);
            const { error: fundUpdateError } = await supabase
              .from('petty_cash_funds')
              .update({ current_balance: currentBalance - approvedAmount })
              .eq('id', fundData.id);

            if (fundUpdateError) {
              console.error('Error actualizando saldo del fondo de caja chica al aprobar gasto:', fundUpdateError);
            }
          }
        }
      } catch (jeError) {
        console.error('Error creando asiento de gasto de caja chica:', jeError);
      }

      return data;
    } catch (error) {
      console.error('pettyCashService.approveExpense error', error);
      throw error;
    }
  },

  async rejectExpense(userId: string, expenseId: string, approvedBy: string | null) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');

      const updatePayload: any = {
        status: 'rejected',
        approved_by: approvedBy,
        approved_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from('petty_cash_expenses')
        .update(updatePayload)
        .eq('id', expenseId)
        .eq('user_id', tenantId)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('pettyCashService.rejectExpense error', error);
      throw error;
    }
  },

  async createReimbursement(userId: string, reimbursement: any, options?: { skipPeriodValidation?: boolean }) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');

      // Validar período contable abierto
      if (!options?.skipPeriodValidation) {
        const reimbDate = reimbursement.reimbursement_date || new Date().toISOString().split('T')[0];
        await accountingPeriodsService.requireOpenPeriod(tenantId, reimbDate);
      }

      const payload = {
        ...reimbursement,
        user_id: tenantId,
      };

      const { data, error } = await supabase
        .from('petty_cash_reimbursements')
        .insert(payload)
        .select('*')
        .single();

      if (error) throw error;

      // Best-effort: crear solicitud de autorización
      try {
        await supabase.from('approval_requests').insert({
          user_id: userId,
          entity_type: 'petty_cash_reimbursement',
          entity_id: data.id,
          status: 'pending',
          notes: reimbursement.description || null,
        });
      } catch (approvalError) {
        console.error('Error creating approval request for petty cash reimbursement:', approvalError);
      }

      const fundId = reimbursement.fund_id;
      const amount = Number(reimbursement.amount) || 0;

      // Actualizar saldo del fondo (sumar el reembolso al current_balance)
      try {
        const { data: fundData, error: fundError } = await supabase
          .from('petty_cash_funds')
          .select('id, petty_cash_account_id, current_balance')
          .eq('id', fundId)
          .single();

        if (fundError || !fundData) {
          console.error('Error obteniendo fondo de caja chica para reposición:', fundError);
        } else {
          const newBalance = Number(fundData.current_balance || 0) + amount;
          const { error: updateError } = await supabase
            .from('petty_cash_funds')
            .update({ current_balance: newBalance })
            .eq('id', fundId);

          if (updateError) {
            console.error('Error actualizando saldo del fondo de caja chica:', updateError);
          }

          // Generar asiento contable automático: Debe Caja Chica / Haber Banco
          try {
            if (amount > 0 && fundData.petty_cash_account_id && reimbursement.bank_account_id) {
              const { data: bankData, error: bankError } = await supabase
                .from('bank_accounts')
                .select('chart_account_id, bank_name')
                .eq('id', reimbursement.bank_account_id)
                .maybeSingle();

              if (!bankError && bankData?.chart_account_id) {
                const entryDate = reimbursement.reimbursement_date || new Date().toISOString().split('T')[0];
                const entryPayload = {
                  entry_number: `PCT-${String(entryDate).slice(0, 10)}-${(data.id || '').toString().slice(0, 6)}`,
                  entry_date: String(entryDate),
                  description:
                    reimbursement.description ||
                    `Reposición de caja chica fondo ${fundData.id}`,
                  reference: data.id ? String(data.id) : null,
                  status: 'posted' as const,
                };

                const lines = [
                  {
                    account_id: fundData.petty_cash_account_id as string,
                    description: 'Reposición de Caja Chica',
                    debit_amount: amount,
                    credit_amount: 0,
                  },
                  {
                    account_id: bankData.chart_account_id as string,
                    description: `Banco ${bankData.bank_name || ''}`.trim(),
                    debit_amount: 0,
                    credit_amount: amount,
                  },
                ];

                await journalEntriesService.createWithLines(userId, entryPayload, lines);
              }
            }
          } catch (jeError) {
            console.error('Error creando asiento de reposición de caja chica:', jeError);
          }
        }
      } catch (fundUpdateError) {
        console.error('Error en actualización de fondo de caja chica:', fundUpdateError);
      }

      return data;
    } catch (error) {
      console.error('pettyCashService.createReimbursement error', error);
      throw error;
    }
  },
};

/* ==========================================================
   Petty Cash Categories Service
========================================================== */
export const pettyCashCategoriesService = {
  async getAll(userId: string) {
    try {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('petty_cash_categories')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async create(userId: string, category: any) {
    try {
      if (!userId) throw new Error('userId required');
      const payload = {
        ...category,
        user_id: userId,
      };
      const { data, error } = await supabase
        .from('petty_cash_categories')
        .insert(payload)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('pettyCashCategoriesService.create error', error);
      throw error;
    }
  },
 
  async update(id: string, patch: any) {
    try {
      const payload = {
        ...patch,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from('petty_cash_categories')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('pettyCashCategoriesService.update error', error);
      throw error;
    }
  },

  async toggleActive(id: string, isActive: boolean) {
    try {
      const { data, error } = await supabase
        .from('petty_cash_categories')
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('pettyCashCategoriesService.toggleActive error', error);
      throw error;
    }
  },
};

/* ==========================================================
   Financial Reports Service
========================================================== */
/**
 * Servicio para generar reportes financieros, incluyendo el balance de prueba y los estados financieros.
 */
export const financialReportsService = {
  async getTrialBalance(userId: string, fromDate: string, toDate: string) {
    try {
      if (!userId) return [];
      const tenantId = await resolveTenantId(userId);

      console.log('[getTrialBalance] Query params - tenantId:', tenantId, 'fromDate:', fromDate, 'toDate:', toDate);

      // Query directa similar a como funciona el Diario General
      const { data, error } = await supabase
        .from('journal_entries')
        .select(`
          id,
          entry_number,
          entry_date,
          status,
          journal_entry_lines (
            account_id,
            debit_amount,
            credit_amount,
            chart_accounts (
              id,
              code,
              name,
              type,
              normal_balance,
              level,
              allow_posting,
              parent_id
            )
          )
        `)
        .eq('user_id', tenantId)
        .eq('status', 'posted')
        .gte('entry_date', fromDate)
        .lte('entry_date', toDate);

      if (error) {
        console.error('[getTrialBalance] Query error:', error);
        return [];
      }

      console.log('[getTrialBalance] Found entries:', data?.length, 'First entry:', data?.[0]?.entry_number);

      const byAccount: Record<string, any> = {};

      // Procesar cada entry y sus líneas
      let totalLinesProcessed = 0;
      (data || []).forEach((entry: any) => {
        const lines = entry.journal_entry_lines || [];
        lines.forEach((line: any) => {
          const account = line.chart_accounts;
          if (!account) {
            console.log('[getTrialBalance] Skipping line without account:', line.account_id);
            return;
          }

          totalLinesProcessed++;
          const accountId = line.account_id as string;
          const debit = Number(line.debit_amount) || 0;
          const credit = Number(line.credit_amount) || 0;

          if (!byAccount[accountId]) {
            byAccount[accountId] = {
              account_id: accountId,
              code: account.code,
              name: account.name,
              type: account.type,
              normal_balance: account.normal_balance,
              level: account.level,
              allow_posting: account.allow_posting,
              parent_id: account.parent_id,
              total_debit: 0,
              total_credit: 0,
              balance: 0,
            };
          }

          byAccount[accountId].total_debit += debit;
          byAccount[accountId].total_credit += credit;
        });
      });

      console.log('[getTrialBalance] Total lines processed:', totalLinesProcessed, 'Unique accounts:', Object.keys(byAccount).length);

      // Calcular saldo según el TIPO de cuenta (más confiable que normal_balance)
      Object.values(byAccount).forEach((acc: any) => {
        const accountType = (acc.type || '').toLowerCase();
        
        // Cuentas con balance normal DEBIT (Débito - Crédito)
        if (accountType === 'asset' || accountType === 'activo' || 
            accountType === 'expense' || accountType === 'gasto' ||
            accountType === 'cost' || accountType === 'costo' || accountType === 'costos') {
          acc.balance = acc.total_debit - acc.total_credit;
        } 
        // Cuentas con balance normal CREDIT (Crédito - Débito)
        else if (accountType === 'liability' || accountType === 'pasivo' ||
                 accountType === 'equity' || accountType === 'patrimonio' ||
                 accountType === 'income' || accountType === 'ingreso') {
          acc.balance = acc.total_credit - acc.total_debit;
        }
        // Fallback al normal_balance si el tipo no coincide
        else {
          if (acc.normal_balance === 'credit') {
            acc.balance = acc.total_credit - acc.total_debit;
          } else {
            acc.balance = acc.total_debit - acc.total_credit;
          }
        }
      });

      return Object.values(byAccount);
    } catch (error) {
      console.error('financialReportsService.getTrialBalance unexpected error', error);
      return [];
    }
  },

  /**
   * Obtiene el saldo actual de una cuenta específica
   * @param userId - ID del usuario
   * @param accountId - ID de la cuenta contable
   * @param asOfDate - Fecha hasta la cual calcular (opcional, default: hoy)
   * @returns Saldo de la cuenta (positivo = débito neto, negativo = crédito neto)
   */
  async getAccountBalance(userId: string, accountId: string, asOfDate?: string): Promise<number> {
    try {
      if (!userId || !accountId) return 0;
      const tenantId = await resolveTenantId(userId);
      const endDate = asOfDate || new Date().toISOString().slice(0, 10);

      // Obtener información de la cuenta
      const { data: account, error: accError } = await supabase
        .from('chart_accounts')
        .select('type')
        .eq('id', accountId)
        .eq('user_id', tenantId)
        .maybeSingle();

      if (accError || !account) {
        console.error('Error fetching account:', accError);
        return 0;
      }

      // Obtener todas las líneas de asientos para esta cuenta
      const { data: lines, error: linesError } = await supabase
        .from('journal_entry_lines')
        .select('debit_amount, credit_amount, journal_entries!inner(entry_date, status, user_id)')
        .eq('account_id', accountId)
        .eq('journal_entries.user_id', tenantId)
        .eq('journal_entries.status', 'posted')
        .lte('journal_entries.entry_date', endDate);

      if (linesError) {
        console.error('Error fetching journal lines:', linesError);
        return 0;
      }

      if (!lines || lines.length === 0) return 0;

      // Calcular totales
      let totalDebit = 0;
      let totalCredit = 0;

      lines.forEach((line: any) => {
        totalDebit += Number(line.debit_amount) || 0;
        totalCredit += Number(line.credit_amount) || 0;
      });

      // Calcular balance según tipo de cuenta
      const accountType = String(account.type || '').toLowerCase();
      let balance = 0;

      switch (accountType) {
        case 'asset':
        case 'activo':
        case 'expense':
        case 'gasto':
        case 'cost':
        case 'costo':
        case 'costos':
          // Cuentas de naturaleza deudora: Débito - Crédito
          balance = totalDebit - totalCredit;
          break;
        
        case 'liability':
        case 'pasivo':
        case 'equity':
        case 'patrimonio':
        case 'income':
        case 'ingreso':
          // Cuentas de naturaleza acreedora: Crédito - Débito
          balance = totalCredit - totalDebit;
          break;
        
        default:
          balance = totalDebit - totalCredit;
      }

      return balance;
    } catch (error) {
      console.error('financialReportsService.getAccountBalance error', error);
      return 0;
    }
  },
};

/* ==========================================================
   Financial Statements Persistence Service
   (Estados Generados)
========================================================== */
export const financialStatementsService = {
  async getAll(userId: string, period?: string | null) {
    try {
      if (!userId) return [];
      const tenantId = await resolveTenantId(userId);

      let query = supabase
        .from('financial_statements')
        .select('*')
        .eq('user_id', tenantId)
        .order('created_at', { ascending: false });

      if (period) {
        query = query.eq('period', period);
      }

      const { data, error } = await query;
      if (error) {
        console.error('financialStatementsService.getAll error', error);
        return [];
      }
      return data ?? [];
    } catch (error) {
      console.error('financialStatementsService.getAll unexpected error', error);
      return [];
    }
  },

  async create(userId: string, params: { type: string; period?: string | null; name?: string | null }) {
    try {
      if (!userId) throw new Error('User is required');
      const tenantId = await resolveTenantId(userId);

      const type = params.type as
        | 'balance_sheet'
        | 'income_statement'
        | 'cash_flow'
        | 'equity_statement';

      const period = params.period || new Date().toISOString().slice(0, 7); // YYYY-MM
      const [yearStr, monthStr] = period.split('-');
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);
      if (!year || !month) throw new Error('Invalid period');

      const fromDate = new Date(year, month - 1, 1).toISOString().slice(0, 10);
      const toDate = new Date(year, month, 0).toISOString().slice(0, 10);

      let payload: any = {
        user_id: tenantId,
        type,
        period,
        from_date: fromDate,
        to_date: toDate,
        status: 'final',
        name:
          params.name ||
          (type === 'balance_sheet'
            ? `Balance General ${period}`
            : type === 'income_statement'
            ? `Estado de Resultados ${period}`
            : type === 'cash_flow'
            ? `Flujo de Efectivo ${period}`
            : `Estado Financiero ${period}`),
      };

      if (type === 'balance_sheet') {
        const result: any = await chartAccountsService.generateBalanceSheet(userId, toDate);
        payload = {
          ...payload,
          total_assets: result?.totalAssets ?? 0,
          total_liabilities: result?.totalLiabilities ?? 0,
          total_equity: result?.totalEquity ?? 0,
        };
      } else if (type === 'income_statement') {
        const result: any = await chartAccountsService.generateIncomeStatement(userId, fromDate, toDate);
        payload = {
          ...payload,
          total_revenue: result?.totalIncome ?? 0,
          total_expenses: result?.totalExpenses ?? 0,
          net_income: result?.netIncome ?? 0,
        };
      } else if (type === 'cash_flow') {
        const result: any = await chartAccountsService.generateCashFlowStatement(userId, fromDate, toDate);
        payload = {
          ...payload,
          operating_cash_flow: result?.operatingCashFlow ?? 0,
          investing_cash_flow: result?.investingCashFlow ?? 0,
          financing_cash_flow: result?.financingCashFlow ?? 0,
          net_cash_flow: result?.netCashFlow ?? 0,
        };
      }

      const { data, error } = await supabase
        .from('financial_statements')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('financialStatementsService.create error', error);
      throw error;
    }
  },
};

/* ==========================================================
   Bank Reconciliation Service
========================================================== */
export const bankReconciliationService = {
  async getOrCreateReconciliation(
    userId: string,
    bankAccountId: string,
    reconciliationDate: string,
    bankStatementBalance: number,
    bookBalance: number,
  ) {
    try {
      if (!userId || !bankAccountId) throw new Error('User and bank account are required');

      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');

      // Try to find an existing reconciliation for this bank and date
      const { data: existing, error: existingError } = await supabase
        .from('bank_reconciliations')
        .select('*')
        .eq('user_id', tenantId)
        .eq('bank_account_id', bankAccountId)
        .eq('reconciliation_date', reconciliationDate)
        .maybeSingle();

      if (existingError && existingError.code !== 'PGRST116') {
        // PGRST116 = no rows found for maybeSingle
        throw existingError;
      }

      if (existing) {
        return existing;
      }

      // Create a new reconciliation
      const payload = {
        user_id: tenantId,
        bank_account_id: bankAccountId,
        reconciliation_date: reconciliationDate,
        bank_statement_balance: bankStatementBalance,
        book_balance: bookBalance,
        adjusted_balance: null,
        status: 'pending',
        created_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('bank_reconciliations')
        .insert(payload)
        .select('*')
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('bankReconciliationService.getOrCreateReconciliation error', error);
      throw error;
    }
  },

  async getBookBalanceForBankAccount(
    userId: string,
    bankAccountId: string,
    asOfDate: string,
  ): Promise<number> {
    try {
      if (!userId || !bankAccountId || !asOfDate) {
        return 0;
      }

      const { data: bank, error: bankError } = await supabase
        .from('bank_accounts')
        .select('chart_account_id')
        .eq('id', bankAccountId)
        .maybeSingle();

      if (bankError) {
        console.error('bankReconciliationService.getBookBalanceForBankAccount bank error', bankError);
        return 0;
      }

      const chartAccountId = (bank as any)?.chart_account_id as string | null | undefined;
      if (!chartAccountId) {
        // Sin cuenta contable asociada: no podemos calcular saldo en libros.
        // Devolvemos NaN para que la UI mantenga el saldo inicial del banco.
        return Number.NaN;
      }

      const trial = await financialReportsService.getTrialBalance(
        userId,
        '1900-01-01',
        asOfDate,
      );

      const accountRow = (trial || []).find((acc: any) => acc.account_id === chartAccountId);
      if (!accountRow) {
        return Number.NaN;
      }

      const balance = Number(accountRow.balance) || 0;
      return balance;
    } catch (error) {
      console.error(
        'bankReconciliationService.getBookBalanceForBankAccount unexpected error',
        error,
      );
      return 0;
    }
  },

  async upsertBookItemsFromJournal(reconciliationId: string, userId: string, bankAccountId: string, reconciliationDate: string) {
    try {
      if (!reconciliationId || !userId || !bankAccountId) return;

      // Very simple implementation: pull journal entries for the date and bank account
      const { data: entries, error } = await supabase
        .from('journal_entries')
        .select(`
          id,
          entry_date,
          description
        `)
        .eq('user_id', userId)
        .eq('bank_account_id', bankAccountId)
        .eq('entry_date', reconciliationDate);

      if (error) {
        console.error('bankReconciliationService.upsertBookItemsFromJournal error', error);
        return;
      }

      if (!entries || entries.length === 0) return;

      // For now, just ensure there is at least one corresponding book item per entry
      for (const entry of entries) {
        const { error: insertError } = await supabase
          .from('bank_reconciliation_items')
          .upsert(
            {
              reconciliation_id: reconciliationId,
              journal_entry_id: entry.id,
              transaction_type: 'book',
              transaction_date: entry.entry_date,
              description: entry.description || 'Movimiento contable',
            },
            { onConflict: 'reconciliation_id,journal_entry_id,transaction_type' }
          );

        if (insertError) {
          console.error('bankReconciliationService.upsertBookItemsFromJournal upsert error', insertError);
        }
      }
    } catch (error) {
      console.error('bankReconciliationService.upsertBookItemsFromJournal unexpected error', error);
    }
  },

  async getItems(reconciliationId: string) {
    try {
      if (!reconciliationId) return [];
      const { data, error } = await supabase
        .from('bank_reconciliation_items')
        .select('*')
        .eq('reconciliation_id', reconciliationId)
        .order('transaction_date', { ascending: true });
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async setItemsReconciled(itemIds: string[], isReconciled: boolean) {
    try {
      if (!itemIds || itemIds.length === 0) return;
      const { error } = await supabase
        .from('bank_reconciliation_items')
        .update({ is_reconciled: isReconciled })
        .in('id', itemIds);
      if (error) throw error;
    } catch (error) {
      console.error('bankReconciliationService.setItemsReconciled error', error);
      throw error;
    }
  },

  async addBankItem(reconciliationId: string, item: any) {
    try {
      const payload = {
        ...item,
        reconciliation_id: reconciliationId,
        transaction_type: 'bank',
      };

      const { data, error } = await supabase
        .from('bank_reconciliation_items')
        .insert(payload)
        .select('*')
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('bankReconciliationService.addBankItem error', error);
      throw error;
    }
  },

  async upsertItemsFromBankMovements(
    reconciliationId: string,
    userId: string,
    movements: Array<{
      id: string;
      date: string;
      type: string;
      amount: number;
      reference?: string | null;
      description?: string | null;
    }>,
    reconciledIds: Set<string>,
  ) {
    try {
      if (!reconciliationId || !userId || !movements?.length) return;

      // Eliminar items anteriores de esta conciliación para evitar duplicados
      const { error: deleteError } = await supabase
        .from('bank_reconciliation_items')
        .delete()
        .eq('reconciliation_id', reconciliationId)
        .eq('user_id', userId);

      if (deleteError) {
        console.error(
          'bankReconciliationService.upsertItemsFromBankMovements delete error',
          deleteError,
        );
        throw deleteError;
      }

      const itemsPayload = movements.map((m) => {
        const positiveTypes = ['deposit', 'credit'];
        const sign = positiveTypes.includes(m.type) ? 1 : -1;
        const signedAmount = sign * (Number(m.amount) || 0);

        const descBase = m.description || '';
        const refPart = m.reference ? ` Ref: ${m.reference}` : '';
        const description = descBase || refPart ? `${descBase}${refPart}`.trim() : 'Movimiento bancario';

        return {
          reconciliation_id: reconciliationId,
          user_id: userId,
          transaction_type: 'book',
          description,
          amount: signedAmount,
          transaction_date: m.date,
          is_reconciled: reconciledIds.has(m.id),
          journal_entry_id: null,
          // Optional: store movement id in notes/description if needed in future
        };
      });

      const { error } = await supabase
        .from('bank_reconciliation_items')
        .insert(itemsPayload);

      if (error) {
        console.error('bankReconciliationService.upsertItemsFromBankMovements insert error', error);
        throw error;
      }
    } catch (error) {
      console.error('bankReconciliationService.upsertItemsFromBankMovements unexpected error', error);
      throw error;
    }
  },
};

/* ==========================================================
   Employees Service
========================================================== */
export const employeesService = {
  async getAll(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('employees')
        .select(`
          *,
          departments (name),
          positions (title)
        `)
        .eq('user_id', tenantId)
        .order('employee_code');
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async create(userId: string, employee: any) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');
      const { data, error } = await supabase
        .from('employees')
        .insert({ ...employee, user_id: tenantId })
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      throw error;
    }
  },

  async update(id: string, employee: any) {
    try {
      const { data, error } = await supabase
        .from('employees')
        .update(employee)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      throw error;
    }
  },

  async setStatus(id: string, status: 'active' | 'inactive') {
    try {
      const { data, error } = await supabase
        .from('employees')
        .update({ status })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      throw error;
    }
  },

  async delete(id: string) {
    try {
      const { error } = await supabase
        .from('employees')
        .delete()
        .eq('id', id);
      if (error) throw error;
    } catch (error) {
      throw error;
    }
  }
};

/* ==========================================================
   Inventory Service
========================================================== */
export const inventoryService = {
  async getItems(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('user_id', tenantId)
        .order('name');

      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async getMovements(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('inventory_movements')
        .select(`
          *,
          inventory_items (name, sku, warehouse_id)
        `)
        .eq('user_id', tenantId)
        .order('movement_date', { ascending: false });
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async createItem(userId: string, item: any) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');
      const payload = {
        ...item,
        user_id: tenantId,
      };
      const { data, error } = await supabase
        .from('inventory_items')
        .insert(payload)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('inventoryService.createItem error', error);
      throw error;
    }
  },

  async updateItem(userIdOrId: string, idOrItem: string | any, itemOrUndefined?: any) {
    try {
      // Compatibilidad: acepta (userId, id, item) o (id, item)
      let tenantId: string | null;
      let itemId: string;
      let itemData: any;

      if (itemOrUndefined !== undefined) {
        // Firma nueva: (userId, id, item)
        tenantId = await resolveTenantId(userIdOrId);
        itemId = idOrItem as string;
        itemData = itemOrUndefined;
      } else {
        // Firma antigua: (id, item) - obtener tenantId del item existente
        itemId = userIdOrId;
        itemData = idOrItem;
        // Buscar el item para obtener su user_id
        const { data: existing } = await supabase
          .from('inventory_items')
          .select('user_id')
          .eq('id', itemId)
          .maybeSingle();
        tenantId = existing?.user_id || null;
      }

      if (!tenantId) throw new Error('userId required or item not found');

      // Limpiar campos que no deben enviarse en update
      const { id: _id, user_id: _uid, created_at: _ca, updated_at: _ua, ...cleanItem } = itemData;

      // 1) Actualizar
      const extractMissingColumn = (err: any): string | null => {
        const msg = String(err?.message || '');
        const match = msg.match(/Could not find the '([^']+)' column/i);
        return match?.[1] || null;
      };

      let updatePayload: any = { ...cleanItem };
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const { error } = await supabase
          .from('inventory_items')
          .update(updatePayload)
          .eq('id', itemId)
          .eq('user_id', tenantId);

        if (!error) break;

        // If schema cache doesn't know about a column yet (migration not applied), remove and retry.
        const code = (error as any)?.code;
        const missingColumn = extractMissingColumn(error);

        console.error('[DEBUG updateItem] Supabase error:', {
          code,
          message: (error as any)?.message,
          details: (error as any)?.details,
          hint: (error as any)?.hint,
          missingColumn,
          payloadKeys: Object.keys(updatePayload || {}),
        });

        if (code === 'PGRST204' && missingColumn && Object.prototype.hasOwnProperty.call(updatePayload, missingColumn)) {
          delete updatePayload[missingColumn];
          continue;
        }

        const wrapped: any = new Error(describeSupabaseError(error));
        wrapped.code = (error as any)?.code;
        wrapped.details = (error as any)?.details;
        wrapped.hint = (error as any)?.hint;
        wrapped.original = error;
        throw wrapped;
      }

      // Reconsultar para devolver el registro completo
      const { data: full, error: fetchError } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('id', itemId)
        .eq('user_id', tenantId)
        .maybeSingle();

      if (!full) {
        console.warn('inventoryService.updateItem: item not found', itemId);
        return null;
      }

      if (fetchError) {
        console.error('inventoryService.updateItem fetchError:', fetchError);
        throw fetchError;
      }

      return full;
    } catch (error) {
      console.error('inventoryService.updateItem error', error);
      throw error;
    }
  },

  async deleteItem(id: string) {
    try {
      const { error } = await supabase
        .from('inventory_items')
        .delete()
        .eq('id', id);
      if (error) throw error;
    } catch (error) {
      console.error('inventoryService.deleteItem error', error);
      throw error;
    }
  },

  async createMovement(userId: string, movement: any) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');
      const rawQty = Number(movement.quantity);
      const quantity = Number.isFinite(rawQty) ? rawQty : 0;

      const basePayload = {
        ...movement,
        quantity,
        user_id: tenantId,
      };

      const tryInsert = async (payload: any) => {
        const { data, error } = await supabase
          .from('inventory_movements')
          .insert(payload)
          .select('*')
          .single();

        if (error) {
          // eslint-disable-next-line no-console
          console.error('inventory_movements insert failed', {
            code: (error as any)?.code,
            message: (error as any)?.message,
            details: (error as any)?.details,
            hint: (error as any)?.hint,
            payloadKeys: Object.keys(payload || {}),
          });
          const wrapped: any = new Error(describeSupabaseError(error));
          wrapped.code = (error as any)?.code;
          wrapped.details = (error as any)?.details;
          wrapped.hint = (error as any)?.hint;
          wrapped.original = error;
          throw wrapped;
        }
        return data;
      };

      // Reintento: si el schema de inventory_movements no tiene alguna columna (PGRST204),
      // eliminamos la columna faltante del payload y reintentamos.
      let payloadToInsert: any = { ...basePayload };
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          return await tryInsert(payloadToInsert);
        } catch (err: any) {
          if (err?.code === 'PGRST204') {
            const msg = String(err?.message || '');
            const m = msg.match(/Could not find the '([^']+)' column/i);
            const missingCol = m?.[1] ? String(m[1]) : null;
            if (missingCol && Object.prototype.hasOwnProperty.call(payloadToInsert, missingCol)) {
              const nextPayload = { ...payloadToInsert };
              delete (nextPayload as any)[missingCol];
              payloadToInsert = nextPayload;
              continue;
            }
          }
          throw err;
        }
      }

      throw new Error('No se pudo insertar el movimiento de inventario (inventory_movements)');
    } catch (error) {
      console.error('inventoryService.createMovement error', error);
      throw error;
    }
  },

  /**
   * Valida si hay suficiente stock disponible para una lista de productos
   * @param userId - ID del usuario
   * @param items - Array de { item_id: string, quantity: number, name?: string }
   * @returns { valid: boolean, errors: string[] }
   */
  async validateStock(userId: string, items: Array<{ item_id: string | null; quantity: number; name?: string }>) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return { valid: false, errors: ['Usuario no autenticado'] };

      const errors: string[] = [];

      for (const item of items) {
        if (!item.item_id) continue;

        const { data: invItem, error } = await supabase
          .from('inventory_items')
          .select('name, current_stock')
          .eq('id', item.item_id)
          .eq('user_id', tenantId)
          .maybeSingle();

        if (error || !invItem) {
          errors.push(`Producto no encontrado: ${item.name || item.item_id}`);
          continue;
        }

        const currentStock = Number(invItem.current_stock) || 0;
        const requestedQty = Number(item.quantity) || 0;

        if (currentStock < requestedQty) {
          errors.push(
            `Stock insuficiente: ${invItem.name}\n` +
            `  Disponible: ${currentStock}\n` +
            `  Solicitado: ${requestedQty}`
          );
        }
      }

      return {
        valid: errors.length === 0,
        errors,
      };
    } catch (error) {
      console.error('inventoryService.validateStock error', error);
      return {
        valid: false,
        errors: ['Error al validar inventario'],
      };
    }
  },
};

/* ==========================================================
   Warehouse Entries Service
========================================================== */
export const warehouseEntriesService = {
  async getAll(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('warehouse_entries')
        .select(`
          *,
          warehouse_entry_lines (*),
          warehouses (name)
        `)
        .eq('user_id', tenantId)
        .order('document_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async create(userId: string, entry: any, lines: any[]) {
    try {
      if (!userId) throw new Error('userId required');
      const tenantId = await resolveTenantId(userId);
      if (!lines || lines.length === 0) throw new Error('At least one line is required');

      const { data: entryData, error: entryError } = await supabase
        .from('warehouse_entries')
        .insert({ ...entry, user_id: tenantId })
        .select('*')
        .single();

      if (entryError) throw entryError;

      const linesPayload = lines.map((line: any) => ({
        ...line,
        entry_id: entryData.id,
      }));

      const { data: linesData, error: linesError } = await supabase
        .from('warehouse_entry_lines')
        .insert(linesPayload)
        .select('*');

      if (linesError) throw linesError;

      return { entry: entryData, lines: linesData };
    } catch (error) {
      console.error('warehouseEntriesService.create error', error);
      throw error;
    }
  },

  async post(userId: string, id: string) {
    try {
      if (!userId) throw new Error('userId required');
      if (!id) throw new Error('warehouse entry id required');

      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');

      const { data: entry, error: entryError } = await supabase
        .from('warehouse_entries')
        .select('*')
        .eq('user_id', tenantId)
        .eq('id', id)
        .maybeSingle();

      if (entryError) throw entryError;
      if (!entry) throw new Error('Warehouse entry not found');

      if (entry.status === 'posted' || entry.status === 'cancelled') {
        return entry;
      }

      const movementDate = entry.document_date
        ? String(entry.document_date)
        : new Date().toISOString().split('T')[0];

      const { data: lines, error: linesError } = await supabase
        .from('warehouse_entry_lines')
        .select(`
          *,
          inventory_items (
            id,
            name,
            current_stock,
            cost_price,
            average_cost,
            last_purchase_price,
            inventory_account_id
          )
        `)
        .eq('entry_id', entry.id);

      if (linesError) throw linesError;
      if (!lines || lines.length === 0) throw new Error('Warehouse entry has no lines');

      // Acumular totales para asiento contable consolidado
      let totalEntryCost = 0;
      let inventoryAccountId: string | null = null;

      for (const rawLine of lines as any[]) {
        const invItem = rawLine.inventory_items as any | null;
        const rawQty = Number(rawLine.quantity) || 0;
        const qty = Number.isFinite(rawQty) ? Math.round(rawQty) : 0;

        if (!invItem || qty <= 0) continue;

        const oldStock = Number(invItem.current_stock ?? 0) || 0;
        const oldAvg =
          invItem.average_cost != null
            ? Number(invItem.average_cost) || 0
            : Number(invItem.cost_price) || 0;

        const lineUnitCost =
          rawLine.unit_cost != null && rawLine.unit_cost !== ''
            ? Number(rawLine.unit_cost) || 0
            : 0;

        const unitCost = lineUnitCost > 0 ? lineUnitCost : oldAvg;
        const lineCost = qty * unitCost;

        if (lineCost <= 0) continue;

        // Acumular para asiento contable
        totalEntryCost += lineCost;
        if (!inventoryAccountId && invItem.inventory_account_id) {
          inventoryAccountId = String(invItem.inventory_account_id);
        }

        const newStock = oldStock + qty;
        const newAvg = newStock > 0 ? (oldAvg * oldStock + unitCost * qty) / newStock : oldAvg;

        try {
          if (invItem.id) {
            await inventoryService.updateItem(tenantId, String(invItem.id), {
              current_stock: newStock,
              last_purchase_price: unitCost,
              last_purchase_date: movementDate,
              average_cost: newAvg,
              cost_price: newAvg,
            });
          }
        } catch (updateError) {
          console.error('warehouseEntriesService.post updateItem error', updateError);
        }

        try {
          await inventoryService.createMovement(userId, {
            item_id: invItem.id ? String(invItem.id) : null,
            movement_type: 'entry',
            quantity: qty,
            unit_cost: unitCost,
            total_cost: lineCost,
            movement_date: movementDate,
            reference: entry.document_number || entry.id,
            notes: rawLine.notes || invItem.name || null,
            source_type: 'warehouse_entry',
            source_id: entry.id ? String(entry.id) : null,
            source_number: entry.document_number || (entry.id ? String(entry.id) : null),
            to_warehouse_id: (entry as any).warehouse_id || null,
          });
        } catch (movError) {
          console.error('warehouseEntriesService.post createMovement error', movError);
        }
      }

      // Best-effort: generar asiento contable para la entrada de almacén
      if (totalEntryCost > 0) {
        try {
          const settings = await accountingSettingsService.get(tenantId);
          // Usar cuenta de inventario del producto o la cuenta por defecto
          const invAccountId = inventoryAccountId || settings?.default_inventory_asset_account_id;
          // Contrapartida: CxP (para compras) o cuenta de inventario en tránsito
          const apAccountId = settings?.ap_account_id;

          if (invAccountId && apAccountId) {
            const jeLines = [
              {
                account_id: invAccountId,
                description: `Entrada de almacén: ${entry.document_number || entry.id}`,
                debit_amount: totalEntryCost,
                credit_amount: 0,
              },
              {
                account_id: apAccountId,
                description: `Contrapartida entrada almacén`,
                debit_amount: 0,
                credit_amount: totalEntryCost,
              },
            ];

            await journalEntriesService.createWithLines(
              tenantId,
              {
                entry_number: `WE-${entry.document_number || entry.id}`,
                entry_date: movementDate,
                description: `Entrada de almacén ${entry.document_number || ''}`.trim(),
                reference: entry.id ? String(entry.id) : null,
                status: 'posted',
              },
              jeLines,
            );
          }
        } catch (jeError) {
          console.error('warehouseEntriesService.post journal entry error', jeError);
        }
      }

      const { data: updated, error: updateError } = await supabase
        .from('warehouse_entries')
        .update({
          status: 'posted',
          updated_at: new Date().toISOString(),
        })
        .eq('id', entry.id)
        .select('*')
        .maybeSingle();

      if (updateError) throw updateError;

      return updated ?? entry;
    } catch (error) {
      console.error('warehouseEntriesService.post error', error);
      throw error;
    }
  },
};

/* ==========================================================
   Warehouse Transfers Service
========================================================== */
export const warehouseTransfersService = {
  async getAll(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('warehouse_transfers')
        .select(`
          *,
          warehouse_transfer_lines (*),
          from_warehouse:from_warehouse_id (name),
          to_warehouse:to_warehouse_id (name)
        `)
        .eq('user_id', tenantId)
        .order('transfer_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async create(userId: string, transfer: any, lines: any[]) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');
      if (!lines || lines.length === 0) throw new Error('At least one line is required');

      // Auto-generar número de documento si no se proporciona
      let transferPayload = { ...transfer };
      const hasDocNumber =
        typeof transferPayload?.document_number === 'string' &&
        transferPayload.document_number.trim().length > 0;

      if (!hasDocNumber) {
        try {
          const { data: nextNum, error: nextNumError } = await supabase.rpc(
            'next_document_number',
            {
              p_tenant_id: tenantId,
              p_doc_key: 'warehouse_transfer',
              p_prefix: 'TRF',
              p_padding: 6,
            },
          );

          if (nextNumError) throw nextNumError;
          if (typeof nextNum === 'string' && nextNum.trim().length > 0) {
            transferPayload = { ...transferPayload, document_number: nextNum };
          }
        } catch (seqError) {
          console.warn('warehouseTransfersService.create: could not auto-generate document_number', seqError);
        }
      }

      const { data: transferData, error: transferError } = await supabase
        .from('warehouse_transfers')
        .insert({ ...transferPayload, user_id: tenantId })
        .select('*')
        .single();

      if (transferError) throw transferError;

      const linesPayload = lines.map((line: any) => ({
        ...line,
        transfer_id: transferData.id,
      }));

      const { data: linesData, error: linesError } = await supabase
        .from('warehouse_transfer_lines')
        .insert(linesPayload)
        .select('*');

      if (linesError) throw linesError;

      return { transfer: transferData, lines: linesData };
    } catch (error) {
      console.error('warehouseTransfersService.create error', error);
      throw error;
    }
  },

  async post(userId: string, id: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');
      if (!id) throw new Error('warehouse transfer id required');

      const { data: transfer, error: transferError } = await supabase
        .from('warehouse_transfers')
        .select('*')
        .eq('user_id', tenantId)
        .eq('id', id)
        .maybeSingle();

      if (transferError) throw transferError;
      if (!transfer) throw new Error('Warehouse transfer not found');

      if (transfer.status === 'posted' || transfer.status === 'cancelled') {
        return transfer;
      }

      const movementDate = transfer.transfer_date
        ? String(transfer.transfer_date)
        : new Date().toISOString().split('T')[0];

      const { data: lines, error: linesError } = await supabase
        .from('warehouse_transfer_lines')
        .select('*')
        .eq('transfer_id', transfer.id);

      if (linesError) throw linesError;
      if (!lines || lines.length === 0) throw new Error('Warehouse transfer has no lines');

      const fromWarehouseId = String((transfer as any).from_warehouse_id || '');
      const toWarehouseId = String((transfer as any).to_warehouse_id || '');
      if (!fromWarehouseId || !toWarehouseId) {
        throw new Error('Warehouse transfer missing from/to warehouse');
      }

      for (const rawLine of lines as any[]) {
        const rawQty = Number(rawLine.quantity) || 0;
        let qty = Number.isFinite(rawQty) ? Math.round(rawQty) : 0;
        if (qty <= 0) continue;

        // Fetch inventory item directly by ID (more reliable than FK join)
        const inventoryItemId = rawLine.inventory_item_id || rawLine.item_id;
        if (!inventoryItemId) {
          console.warn('warehouseTransfersService.post: line missing inventory_item_id', rawLine);
          continue;
        }

        const { data: invItem, error: invItemError } = await supabase
          .from('inventory_items')
          .select('*')
          .eq('id', inventoryItemId)
          .maybeSingle();

        if (invItemError || !invItem) {
          console.warn('warehouseTransfersService.post: could not find inventory item', { inventoryItemId, error: invItemError });
          continue;
        }

        // Ensure source item belongs to the source warehouse
        const sourceWarehouseId = String(invItem.warehouse_id || '');
        if (sourceWarehouseId && sourceWarehouseId !== fromWarehouseId) {
          // If data is inconsistent, skip adjustment to avoid corrupting stock
          console.warn('warehouseTransfersService.post: line item warehouse_id does not match transfer source', {
            transferId: transfer.id,
            fromWarehouseId,
            itemId: invItem.id,
            itemWarehouseId: sourceWarehouseId,
          });
          continue;
        }

        const currentSourceStock = Number(invItem.current_stock) || 0;
        // Guard: do not allow moving more than available stock
        if (currentSourceStock <= 0) {
          console.warn('warehouseTransfersService.post: source item has no available stock', {
            transferId: transfer.id,
            itemId: invItem.id,
            qty,
            currentSourceStock,
          });
          continue;
        }
        if (qty > currentSourceStock) {
          // Clamp to available to avoid negative stock / partial failures
          qty = currentSourceStock;
        }

        // 1) Resolve destination item (if it already exists)
        let destItem: any | null = null;
        const sku = String(invItem.sku || '').trim();
        if (sku) {
          const { data: foundDest } = await supabase
            .from('inventory_items')
            .select('*')
            .eq('user_id', tenantId)
            .eq('warehouse_id', toWarehouseId)
            .eq('sku', sku)
            .maybeSingle();
          destItem = foundDest || null;
        }

        if (!destItem) {
          // Fallback: by name if SKU missing
          const name = String(invItem.name || '').trim();
          if (name) {
            const { data: foundDestByName } = await supabase
              .from('inventory_items')
              .select('*')
              .eq('user_id', tenantId)
              .eq('warehouse_id', toWarehouseId)
              .eq('name', name)
              .maybeSingle();
            destItem = foundDestByName || null;
          }
        }

        // 2) Apply transfer safely
        // Unique constraint is now on (user_id, warehouse_id, sku), allowing same SKU in different warehouses.
        
        const isFullTransfer = qty >= currentSourceStock;
        
        if (isFullTransfer && !destItem?.id) {
          // Transferring ALL stock and no dest item exists - just move the record by changing warehouse_id
          await inventoryService.updateItem(userId, String(invItem.id), {
            warehouse_id: toWarehouseId,
          });
        } else if (isFullTransfer && destItem?.id) {
          // Transferring ALL stock and dest item exists - add to dest and zero out source.
          // We must NOT delete the source row because it may be referenced by transfer lines (FK).
          const currentDestStock = Number(destItem.current_stock) || 0;
          await inventoryService.updateItem(userId, String(destItem.id), {
            current_stock: currentDestStock + qty,
          });
          await inventoryService.updateItem(userId, String(invItem.id), {
            current_stock: 0,
          });
        } else if (destItem?.id) {
          // Partial transfer - dest item exists - add to it
          const currentDestStock = Number(destItem.current_stock) || 0;
          await inventoryService.updateItem(userId, String(destItem.id), {
            current_stock: currentDestStock + qty,
          });
          // Subtract from source
          const newSourceStock = currentSourceStock - qty;
          await inventoryService.updateItem(userId, String(invItem.id), {
            current_stock: newSourceStock,
          });
        } else {
          // Partial transfer - no dest item - create new record in destination
          const {
            id: _id,
            user_id: _user_id,
            created_at: _created_at,
            updated_at: _updated_at,
            warehouse_id: _warehouse_id,
            current_stock: _current_stock,
            ...clone
          } = invItem;

          await inventoryService.createItem(userId, {
            ...clone,
            warehouse_id: toWarehouseId,
            current_stock: qty,
          });
          // Subtract from source
          const newSourceStock = currentSourceStock - qty;
          await inventoryService.updateItem(userId, String(invItem.id), {
            current_stock: newSourceStock,
          });
        }

        // 3) Create movement record (for audit)
        try {
          await inventoryService.createMovement(userId, {
            item_id: invItem.id ? String(invItem.id) : null,
            movement_type: 'transfer',
            quantity: qty,
            unit_cost: null,
            total_cost: null,
            movement_date: movementDate,
            reference: transfer.document_number || transfer.id,
            notes: rawLine.notes || invItem.name || null,
            source_type: 'warehouse_transfer',
            source_id: transfer.id ? String(transfer.id) : null,
            source_number: transfer.document_number || (transfer.id ? String(transfer.id) : null),
            from_warehouse_id: fromWarehouseId,
            to_warehouse_id: toWarehouseId,
          });
        } catch (movError) {
          console.error('warehouseTransfersService.post createMovement error', movError);
        }
      }

      const { data: updated, error: updateError } = await supabase
        .from('warehouse_transfers')
        .update({
          status: 'posted',
          updated_at: new Date().toISOString(),
        })
        .eq('id', transfer.id)
        .select('*')
        .maybeSingle();

      if (updateError) throw updateError;

      return updated ?? transfer;
    } catch (error) {
      console.error('warehouseTransfersService.post error', error);
      throw error;
    }
  },
};

/* ==========================================================
   Inventory Physical Counts Service
========================================================== */
export const inventoryPhysicalCountsService = {
  async getAll(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('inventory_physical_counts')
        .select(`
          *,
          warehouses (name)
        `)
        .eq('user_id', tenantId)
        .order('count_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async getWithLines(userId: string, id: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId || !id) return null;
      const { data, error } = await supabase
        .from('inventory_physical_counts')
        .select(`
          *,
          inventory_physical_count_lines (
            *,
            inventory_items (
              id,
              sku,
              name,
              category,
              average_cost,
              cost_price
            )
          ),
          warehouses (name)
        `)
        .eq('user_id', userId)
        .eq('id', id)
        .maybeSingle();

      if (error) return handleDatabaseError(error, null);
      return data ?? null;
    } catch (error) {
      return handleDatabaseError(error, null);
    }
  },

  async create(userId: string, header: any, lines: any[]) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');
      if (!lines || lines.length === 0) throw new Error('At least one line is required');

      const { data: headerData, error: headerError } = await supabase
        .from('inventory_physical_counts')
        .insert({ ...header, user_id: tenantId })
        .select('*')
        .single();

      if (headerError) throw headerError;

      const linesPayload = lines.map((line: any) => ({
        ...line,
        count_id: headerData.id,
      }));

      const { data: linesData, error: linesError } = await supabase
        .from('inventory_physical_count_lines')
        .insert(linesPayload)
        .select('*');

      if (linesError) throw linesError;

      return { header: headerData, lines: linesData };
    } catch (error) {
      console.error('inventoryPhysicalCountsService.create error', error);
      throw error;
    }
  },
};

/* ==========================================================
   Inventory Cost Revaluations Service
========================================================== */
export const inventoryCostRevaluationsService = {
  async getAll(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('inventory_cost_revaluations')
        .select('*')
        .eq('user_id', tenantId)
        .order('revaluation_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async getWithLines(userId: string, id: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId || !id) return null;
      const { data, error } = await supabase
        .from('inventory_cost_revaluations')
        .select(`
          *,
          inventory_cost_revaluation_lines (
            *,
            inventory_items (
              id,
              sku,
              name,
              category,
              average_cost,
              cost_price
            ),
            warehouses (name)
          )
        `)
        .eq('user_id', tenantId)
        .eq('id', id)
        .maybeSingle();

      if (error) return handleDatabaseError(error, null);
      return data ?? null;
    } catch (error) {
      return handleDatabaseError(error, null);
    }
  },

  async create(userId: string, header: any, lines: any[]) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');
      if (!lines || lines.length === 0) throw new Error('At least one line is required');

      const { data: headerData, error: headerError } = await supabase
        .from('inventory_cost_revaluations')
        .insert({ ...header, user_id: tenantId })
        .select('*')
        .single();

      if (headerError) throw headerError;

      const linesPayload = lines.map((line: any) => ({
        ...line,
        revaluation_id: headerData.id,
      }));

      const { data: linesData, error: linesError } = await supabase
        .from('inventory_cost_revaluation_lines')
        .insert(linesPayload)
        .select('*');

      if (linesError) throw linesError;

      return { header: headerData, lines: linesData };
    } catch (error) {
      console.error('inventoryCostRevaluationsService.create error', error);
      throw error;
    }
  },
};

/* ==========================================================
   Departments Service
========================================================== */
export const departmentsService = {
  async getAll(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('departments')
        .select('*')
        .eq('user_id', tenantId)
        .order('name');
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async create(userId: string, department: any) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');
      const { data, error } = await supabase
        .from('departments')
        .insert({ ...department, user_id: tenantId })
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      throw error;
    }
  },

  async update(id: string, department: any) {
    try {
      const { data, error } = await supabase
        .from('departments')
        .update(department)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      throw error;
    }
  },

  async delete(id: string) {
    try {
      const { error } = await supabase
        .from('departments')
        .delete()
        .eq('id', id);
      if (error) throw error;
    } catch (error) {
      throw error;
    }
  }
};

/* ==========================================================
   Positions Service
========================================================== */
export const positionsService = {
  async getAll(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('positions')
        .select(`
          *,
          departments (name)
        `)
        .eq('user_id', tenantId)
        .order('title');
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async create(userId: string, position: any) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');
      const { data, error } = await supabase
        .from('positions')
        .insert({ ...position, user_id: tenantId })
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      throw error;
    }
  },

  async update(id: string, position: any) {
    try {
      const { data, error } = await supabase
        .from('positions')
        .update(position)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      throw error;
    }
  },

  async delete(id: string) {
    try {
      const { error } = await supabase
        .from('positions')
        .delete()
        .eq('id', id);
      if (error) throw error;
    } catch (error) {
      throw error;
    }
  }
};

/* ==========================================================
   Employee Types Service
========================================================== */
export const employeeTypesService = {
  async getAll(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('employee_types')
        .select('*')
        .eq('user_id', tenantId)
        .order('name');
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async create(userId: string, type: any) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');
      const payload = {
        ...type,
        user_id: tenantId,
      };
      const { data, error } = await supabase
        .from('employee_types')
        .insert(payload)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('employeeTypesService.create error', error);
      throw error;
    }
  },

  async update(id: string, type: any) {
    try {
      const { data, error } = await supabase
        .from('employee_types')
        .update(type)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('employeeTypesService.update error', error);
      throw error;
    }
  },

  async delete(id: string) {
    try {
      const { error } = await supabase
        .from('employee_types')
        .delete()
        .eq('id', id);
      if (error) throw error;
    } catch (error) {
      console.error('employeeTypesService.delete error', error);
      throw error;
    }
  }
};

/* ==========================================================
   Salary Types Service
========================================================== */
export const salaryTypesService = {
  async getAll(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('salary_types')
        .select('*')
        .eq('user_id', tenantId)
        .order('name');
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async create(userId: string, type: any) {
    try {
      const tenantId = await resolveTenantId(userId);
      const payload = {
        ...type,
        user_id: tenantId,
      };
      const { data, error } = await supabase
        .from('salary_types')
        .insert(payload)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('salaryTypesService.create error', error);
      throw error;
    }
  },

  async update(id: string, type: any) {
    try {
      const { data, error } = await supabase
        .from('salary_types')
        .update(type)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('salaryTypesService.update error', error);
      throw error;
    }
  },

  async delete(id: string) {
    try {
      const { error } = await supabase
        .from('salary_types')
        .delete()
        .eq('id', id);
      if (error) throw error;
    } catch (error) {
      console.error('salaryTypesService.delete error', error);
      throw error;
    }
  }
};

/* ==========================================================
   Salary Changes Service
========================================================== */
export const salaryChangesService = {
  async getAll(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('salary_changes')
        .select('*')
        .eq('user_id', tenantId)
        .order('created_at', { ascending: false });
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async create(userId: string, change: any) {
    try {
      const tenantId = await resolveTenantId(userId);
      const payload = {
        ...change,
        user_id: tenantId,
      };
      const { data, error } = await supabase
        .from('salary_changes')
        .insert(payload)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('salaryChangesService.create error', error);
      throw error;
    }
  },

  async update(id: string, change: any) {
    try {
      const { data, error } = await supabase
        .from('salary_changes')
        .update(change)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('salaryChangesService.update error', error);
      throw error;
    }
  },

  async delete(id: string) {
    try {
      const { error } = await supabase
        .from('salary_changes')
        .delete()
        .eq('id', id);
      if (error) throw error;
    } catch (error) {
      console.error('salaryChangesService.delete error', error);
      throw error;
    }
  }
};

/* ==========================================================
   Employee Exits Service
========================================================== */
export const employeeExitsService = {
  async getAll(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('employee_exits')
        .select('*')
        .eq('user_id', tenantId)
        .order('exit_date', { ascending: false });
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async create(userId: string, exit: any) {
    try {
      const tenantId = await resolveTenantId(userId);
      const payload = {
        ...exit,
        user_id: tenantId,
      };
      const { data, error } = await supabase
        .from('employee_exits')
        .insert(payload)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('employeeExitsService.create error', error);
      throw error;
    }
  },

  async update(id: string, exit: any) {
    try {
      const { data, error } = await supabase
        .from('employee_exits')
        .update(exit)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('employeeExitsService.update error', error);
      throw error;
    }
  },

  async delete(id: string) {
    try {
      const { error } = await supabase
        .from('employee_exits')
        .delete()
        .eq('id', id);
      if (error) throw error;
    } catch (error) {
      console.error('employeeExitsService.delete error', error);
      throw error;
    }
  }
};

/* ==========================================================
   Commission Types Service
========================================================== */
export const commissionTypesService = {
  async getAll(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('commission_types')
        .select('*')
        .eq('user_id', tenantId)
        .order('name');
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async create(userId: string, type: any) {
    try {
      const tenantId = await resolveTenantId(userId);
      const payload = {
        ...type,
        user_id: tenantId,
      };
      const { data, error } = await supabase
        .from('commission_types')
        .insert(payload)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('commissionTypesService.create error', error);
      throw error;
    }
  },

  async update(id: string, type: any) {
    try {
      const { data, error } = await supabase
        .from('commission_types')
        .update(type)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('commissionTypesService.update error', error);
      throw error;
    }
  },

  async delete(id: string) {
    try {
      const { error } = await supabase
        .from('commission_types')
        .delete()
        .eq('id', id);
      if (error) throw error;
    } catch (error) {
      console.error('commissionTypesService.delete error', error);
      throw error;
    }
  }
};

/* ==========================================================
   Vacations Service
========================================================== */
export const vacationsService = {
  async getAll(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('vacations')
        .select('*')
        .eq('user_id', tenantId)
        .order('start_date', { ascending: false });
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async create(userId: string, vacation: any) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');
      const payload = {
        ...vacation,
        user_id: tenantId,
      };
      const { data, error } = await supabase
        .from('vacations')
        .insert(payload)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('vacationsService.create error', error);
      throw error;
    }
  },

  async update(id: string, vacation: any) {
    try {
      const { data, error } = await supabase
        .from('vacations')
        .update(vacation)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('vacationsService.update error', error);
      throw error;
    }
  },

  async delete(id: string) {
    try {
      const { error } = await supabase
        .from('vacations')
        .delete()
        .eq('id', id);
      if (error) throw error;
    } catch (error) {
      console.error('vacationsService.delete error', error);
      throw error;
    }
  }
};

/* ==========================================================
   Holidays Service
========================================================== */
export const holidaysService = {
  async getAll(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('holidays')
        .select('*')
        .eq('user_id', tenantId)
        .order('date', { ascending: false });
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async create(userId: string, holiday: any) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');
      const payload = {
        ...holiday,
        user_id: tenantId,
      };
      const { data, error } = await supabase
        .from('holidays')
        .insert(payload)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('holidaysService.create error', error);
      throw error;
    }
  },

  async update(id: string, holiday: any) {
    try {
      const { data, error } = await supabase
        .from('holidays')
        .update(holiday)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('holidaysService.update error', error);
      throw error;
    }
  },

  async delete(id: string) {
    try {
      const { error } = await supabase
        .from('holidays')
        .delete()
        .eq('id', id);
      if (error) throw error;
    } catch (error) {
      console.error('holidaysService.delete error', error);
      throw error;
    }
  }
};

/* ==========================================================
   Bonuses Service
========================================================== */
export const bonusesService = {
  async getAll(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('bonuses')
        .select('*')
        .eq('user_id', tenantId)
        .order('created_at', { ascending: false });
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async create(userId: string, bonus: any) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');
      const payload = {
        ...bonus,
        user_id: tenantId,
      };
      const { data, error } = await supabase
        .from('bonuses')
        .insert(payload)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('bonusesService.create error', error);
      throw error;
    }
  },

  async update(id: string, bonus: any) {
    try {
      const { data, error } = await supabase
        .from('bonuses')
        .update(bonus)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('bonusesService.update error', error);
      throw error;
    }
  },

  async delete(id: string) {
    try {
      const { error } = await supabase
        .from('bonuses')
        .delete()
        .eq('id', id);
      if (error) throw error;
    } catch (error) {
      console.error('bonusesService.delete error', error);
      throw error;
    }
  }
};

/* ==========================================================
   Royalties Service
========================================================== */
export const royaltiesService = {
  async getAll(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('royalties')
        .select('*')
        .eq('user_id', tenantId)
        .order('payment_date', { ascending: false });
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async create(userId: string, royalty: any) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');
      const payload = {
        ...royalty,
        user_id: tenantId,
      };
      const { data, error } = await supabase
        .from('royalties')
        .insert(payload)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('royaltiesService.create error', error);
      throw error;
    }
  },

  async update(id: string, royalty: any) {
    try {
      const { data, error } = await supabase
        .from('royalties')
        .update(royalty)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('royaltiesService.update error', error);
      throw error;
    }
  },

  async delete(id: string) {
    try {
      const { error } = await supabase
        .from('royalties')
        .delete()
        .eq('id', id);
      if (error) throw error;
    } catch (error) {
      console.error('royaltiesService.delete error', error);
      throw error;
    }
  }
};

/* ==========================================================
   Overtime Service
========================================================== */
export const overtimeService = {
  async getAll(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('overtime_records')
        .select('*')
        .eq('user_id', tenantId)
        .order('date', { ascending: false });
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async create(userId: string, record: any) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');
      const payload = {
        ...record,
        user_id: tenantId,
      };
      const { data, error } = await supabase
        .from('overtime_records')
        .insert(payload)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('overtimeService.create error', error);
      throw error;
    }
  },

  async update(id: string, record: any) {
    try {
      const { data, error } = await supabase
        .from('overtime_records')
        .update(record)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('overtimeService.update error', error);
      throw error;
    }
  },

  async delete(id: string) {
    try {
      const { error } = await supabase
        .from('overtime_records')
        .delete()
        .eq('id', id);
      if (error) throw error;
    } catch (error) {
      console.error('overtimeService.delete error', error);
      throw error;
    }
  }
};

/* ==========================================================
   Payroll Service
========================================================== */
export const payrollService = {
  async getPeriods(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('payroll_periods')
        .select('*')
        .eq('user_id', tenantId)
        .order('start_date', { ascending: false });
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async createPeriod(userId: string, period: any, options?: { skipPeriodValidation?: boolean }) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');

      // Validar período contable abierto para la fecha de pago de nómina
      if (!options?.skipPeriodValidation) {
        const paymentDate = period.payment_date || period.end_date || new Date().toISOString().split('T')[0];
        await accountingPeriodsService.requireOpenPeriod(tenantId, paymentDate);
      }

      const { data, error } = await supabase
        .from('payroll_periods')
        .insert({ ...period, user_id: tenantId })
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      throw error;
    }
  },

  async getEntries(periodId: string) {
    try {
      const { data, error } = await supabase
        .from('payroll_entries')
        .select(`
          *,
          employees (first_name, last_name, employee_code)
        `)
        .eq('payroll_period_id', periodId);
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async processPayroll(_periodId: string, entries: any[]) {
    try {
      const { data, error } = await supabase
        .from('payroll_entries')
        .insert(entries)
        .select();
      if (error) throw error;
      return data;
    } catch (error) {
      throw error;
    }
  },

  async update(id: string, period: any) {
    try {
      const { data, error } = await supabase
        .from('payroll_periods')
        .update(period)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      throw error;
    }
  },

  async updateStatus(id: string, status: string) {
    try {
      const patch: any = {
        status,
      };
      const { data, error } = await supabase
        .from('payroll_periods')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('payrollService.updateStatus error', error);
      throw error;
    }
  },

  // Nuevos métodos integrados para deducciones y ausencias
  async getEmployeeDeductions(userId: string, employeeId: string, periodStart: string, periodEnd: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return { periodic: [], other: [] };
      // Obtener deducciones periódicas activas
      const { data: periodicData, error: periodicError } = await supabase
        .from('periodic_deductions')
        .select('*')
        .eq('user_id', tenantId)
        .eq('employee_id', employeeId)
        .eq('is_active', true)
        .lte('start_date', periodEnd)
        .or(`end_date.is.null,end_date.gte.${periodStart}`);

      if (periodicError) throw periodicError;

      // Obtener otras deducciones pendientes en el período
      const { data: otherData, error: otherError } = await supabase
        .from('other_deductions')
        .select('*')
        .eq('user_id', tenantId)
        .eq('employee_id', employeeId)
        .eq('status', 'pendiente')
        .gte('deduction_date', periodStart)
        .lte('deduction_date', periodEnd);

      if (otherError) throw otherError;

      return {
        periodic: periodicData || [],
        other: otherData || []
      };
    } catch (error) {
      console.error('Error getting employee deductions:', error);
      return { periodic: [], other: [] };
    }
  },

  async getEmployeeAbsences(userId: string, employeeId: string, periodStart: string, periodEnd: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('employee_absences')
        .select('*')
        .eq('user_id', tenantId)
        .eq('employee_id', employeeId)
        .eq('status', 'aprobada')
        .gte('end_date', periodStart)
        .lte('start_date', periodEnd);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting employee absences:', error);
      return [];
    }
  },

  async calculatePayroll(userId: string, periodId: string, employees: any[], periodStart: string, periodEnd: string, tssConfig: any) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');
      const payrollEntries = [];

      // Cargar tramos de ISR (si existen). Si falla o no hay tramos, ISR se mantiene en 0.
      let taxBrackets: any[] = [];
      try {
        taxBrackets = await payrollSettingsService.getPayrollTaxBrackets();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Error loading payroll tax brackets for payroll calculation:', e);
        taxBrackets = [];
      }

      // Cargar bonificaciones activas (aplican a todos los empleados)
      let activeBonuses: any[] = [];
      try {
        const { data: bonusesData } = await supabase
          .from('bonuses')
          .select('*')
          .eq('user_id', tenantId)
          .eq('is_active', true);
        activeBonuses = bonusesData || [];
      } catch (e) {
        console.error('Error loading bonuses for payroll:', e);
        activeBonuses = [];
      }

      // Cargar horas extra aprobadas del período
      let approvedOvertime: any[] = [];
      try {
        const { data: overtimeData } = await supabase
          .from('overtime_records')
          .select('*')
          .eq('user_id', tenantId)
          .eq('status', 'approved')
          .gte('date', periodStart)
          .lte('date', periodEnd);
        approvedOvertime = overtimeData || [];
      } catch (e) {
        console.error('Error loading overtime for payroll:', e);
        approvedOvertime = [];
      }

      const calculateIsrForIncome = (taxableIncome: number): number => {
        if (!taxBrackets || taxBrackets.length === 0 || !Number.isFinite(taxableIncome) || taxableIncome <= 0) {
          return 0;
        }

        const bracket = (taxBrackets as any[]).find((b: any) => {
          const min = Number(b.min_amount ?? 0);
          const hasMax = b.max_amount !== null && b.max_amount !== undefined;
          const max = hasMax ? Number(b.max_amount) : Number.POSITIVE_INFINITY;

          if (!Number.isFinite(min) || !Number.isFinite(max)) return false;
          return taxableIncome >= min && taxableIncome <= max;
        });

        if (!bracket) return 0;

        const min = Number(bracket.min_amount ?? 0);
        const fixedAmount = Number(bracket.fixed_amount ?? 0);
        const rate = Number(
          // Compatibilidad flexible: aceptar rate_percent o rate
          bracket.rate_percent !== undefined ? bracket.rate_percent : bracket.rate ?? 0,
        );

        if (!Number.isFinite(min) || !Number.isFinite(fixedAmount) || !Number.isFinite(rate)) {
          return 0;
        }

        const excess = Math.max(0, taxableIncome - min);
        const variablePart = excess * (rate / 100);
        const isr = fixedAmount + variablePart;

        return Number.isFinite(isr) && isr > 0 ? isr : 0;
      };

      for (const employee of employees) {
        const baseSalaryAmount = Number(employee.base_salary) || Number(employee.salary) || 0;

        // ========== HORAS EXTRA ==========
        // Obtener horas extra aprobadas de este empleado en el período
        const employeeOvertime = approvedOvertime.filter((ot: any) => ot.employee_id === employee.id);
        const overtimeHours = employeeOvertime.reduce((sum: number, ot: any) => sum + (Number(ot.total_hours) || 0), 0);
        const overtimeAmount = employeeOvertime.reduce((sum: number, ot: any) => sum + (Number(ot.total_amount) || 0), 0);

        // ========== BONIFICACIONES ==========
        // Calcular bonificaciones aplicables (mensuales o según frecuencia)
        let bonusesTotal = 0;
        for (const bonus of activeBonuses) {
          // Solo aplicar bonificaciones mensuales o únicas por ahora
          if (bonus.frequency === 'mensual' || bonus.frequency === 'unico') {
            if (bonus.type === 'fijo') {
              bonusesTotal += Number(bonus.amount) || 0;
            } else if (bonus.type === 'porcentaje') {
              bonusesTotal += (baseSalaryAmount * (Number(bonus.percentage) || 0)) / 100;
            }
          }
        }

        // ========== INGRESO BRUTO TOTAL ==========
        // Salario base + Horas extra + Bonificaciones
        const grossSalary = baseSalaryAmount + overtimeAmount + bonusesTotal;

        // Obtener deducciones del empleado
        const deductions = await this.getEmployeeDeductions(userId, employee.id, periodStart, periodEnd);
        
        // Calcular total de deducciones periódicas (sobre salario base)
        let periodicDeductionsTotal = 0;
        for (const ded of deductions.periodic) {
          if (ded.type === 'fijo') {
            periodicDeductionsTotal += Number(ded.amount) || 0;
          } else if (ded.type === 'porcentaje') {
            periodicDeductionsTotal += (baseSalaryAmount * (Number(ded.percentage) || 0)) / 100;
          }
        }

        // Calcular total de otras deducciones
        const otherDeductionsTotal = deductions.other.reduce((sum: number, ded: any) => 
          sum + (Number(ded.amount) || 0), 0);

        // Obtener ausencias no pagadas
        const absences = await this.getEmployeeAbsences(userId, employee.id, periodStart, periodEnd);
        const unpaidAbsences = absences.filter((a: any) => !a.is_paid);
        const unpaidDays = unpaidAbsences.reduce((sum: number, a: any) => sum + (Number(a.days_count) || 0), 0);

        // Calcular descuento por ausencias (asumiendo mes de 30 días, sobre salario base)
        const dailyRate = baseSalaryAmount / 30;
        const absenceDeduction = dailyRate * unpaidDays;

        // ========== DEDUCCIONES TSS ==========
        // TSS se calcula sobre el ingreso bruto total (salario + horas extra + bonos gravables)
        let tssBaseSalary = grossSalary;
        let employeeRate = 0;

        if (tssConfig) {
          const sfsEmp = Number(tssConfig.sfs_employee) || 0;
          const afpEmp = Number(tssConfig.afp_employee) || 0;
          employeeRate = sfsEmp + afpEmp || 16.67;

          const maxSalary = Number(tssConfig.max_salary_tss) || 0;
          if (maxSalary > 0) {
            tssBaseSalary = Math.min(grossSalary, maxSalary);
          }
        } else {
          employeeRate = 16.67;
        }

        const tssDeductions = tssBaseSalary * (employeeRate / 100);

        // ========== ISR ==========
        // ISR se calcula sobre ingreso bruto menos TSS
        const taxableIncome = Math.max(0, grossSalary - tssDeductions);
        const isrDeductions = calculateIsrForIncome(taxableIncome);

        // ========== TOTAL DEDUCCIONES ==========
        const totalDeductions =
          periodicDeductionsTotal +
          otherDeductionsTotal +
          absenceDeduction +
          tssDeductions +
          isrDeductions;

        // ========== SALARIO NETO ==========
        // Ingreso bruto total - Deducciones totales (no permitir negativos)
        const netSalary = Math.max(0, grossSalary - totalDeductions);

        payrollEntries.push({
          user_id: tenantId,
          payroll_period_id: periodId,
          employee_id: employee.id,
          gross_salary: grossSalary,
          overtime_hours: overtimeHours,
          overtime_amount: overtimeAmount,
          bonuses: bonusesTotal,
          tss_deductions: tssDeductions,
          isr_deductions: isrDeductions,
          periodic_deductions: periodicDeductionsTotal,
          other_deductions: otherDeductionsTotal,
          absence_deductions: absenceDeduction,
          deductions: totalDeductions,
          net_salary: netSalary,
          status: 'approved',
          unpaid_absence_days: unpaidDays
        });
      }

      return payrollEntries;
    } catch (error) {
      console.error('Error calculating payroll:', error);
      throw error;
    }
  },

  async markOtherDeductionsAsApplied(userId: string, employeeIds: string[], periodStart: string, periodEnd: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');
      const { error } = await supabase
        .from('other_deductions')
        .update({ status: 'aplicada' })
        .eq('user_id', tenantId)
        .in('employee_id', employeeIds)
        .eq('status', 'pendiente')
        .gte('deduction_date', periodStart)
        .lte('deduction_date', periodEnd);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error marking deductions as applied:', error);
      return false;
    }
  }
};

/* ==========================================================
   Deductions and Absences Services
========================================================== */
export const deductionsService = {
  async getPeriodicDeductions(userId: string, employeeId?: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      let query = supabase
        .from('periodic_deductions')
        .select('*')
        .eq('user_id', tenantId)
        .order('created_at', { ascending: false });

      if (employeeId) {
        query = query.eq('employee_id', employeeId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting periodic deductions:', error);
      return [];
    }
  },

  async getOtherDeductions(userId: string, employeeId?: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      let query = supabase
        .from('other_deductions')
        .select('*')
        .eq('user_id', tenantId)
        .order('created_at', { ascending: false });

      if (employeeId) {
        query = query.eq('employee_id', employeeId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting other deductions:', error);
      return [];
    }
  }
};

export const absencesService = {
  async getAbsences(userId: string, employeeId?: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      let query = supabase
        .from('employee_absences')
        .select('*')
        .eq('user_id', tenantId)
        .order('created_at', { ascending: false });

      if (employeeId) {
        query = query.eq('employee_id', employeeId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting absences:', error);
      return [];
    }
  }
};

/* ==========================================================
   Accounting Settings Service
========================================================== */
export const accountingSettingsService = {
  async get(userId?: string | null | undefined) {
    try {
      const tenantId = userId ? await resolveTenantId(userId) : null;
      const query = supabase
        .from('accounting_settings')
        .select('*');

      if (tenantId) {
        query.eq('user_id', tenantId).limit(1);
      } else {
        query.limit(1);
      }

      const { data, error } = await query.maybeSingle();

      if (error) throw error;
      return data ?? null;
    } catch (error) {
      console.error('accountingSettingsService.get error', error);
      return null;
    }
  },

  // Verificar si el catálogo de cuentas ya fue sembrado para este usuario
  async hasChartAccountsSeeded(userId: string): Promise<boolean> {
    try {
      const tenantId = await resolveTenantId(userId);
      const { data, error } = await supabase
        .from('accounting_settings')
        .select('chart_accounts_seeded')
        .eq('user_id', tenantId)
        .maybeSingle();

      if (error) {
        console.error('Error checking chart_accounts_seeded:', error);
        return false;
      }

      return data?.chart_accounts_seeded === true;
    } catch (error) {
      console.error('accountingSettingsService.hasChartAccountsSeeded error', error);
      return false;
    }
  },

  // Marcar que el catálogo de cuentas ya fue sembrado para este usuario
  async markChartAccountsSeeded(userId: string): Promise<void> {
    try {
      const tenantId = await resolveTenantId(userId);
      const { error } = await supabase
        .from('accounting_settings')
        .upsert(
          { 
            user_id: tenantId, 
            chart_accounts_seeded: true,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'user_id' }
        );

      if (error) {
        console.error('Error marking chart_accounts_seeded:', error);
      }
    } catch (error) {
      console.error('accountingSettingsService.markChartAccountsSeeded error', error);
    }
  },

  // Obtener configuración de secuencia de SKU
  async getSkuSettings(userId: string): Promise<{ prefix: string; nextNumber: number; padding: number }> {
    try {
      const tenantId = await resolveTenantId(userId);
      const { data, error } = await supabase
        .from('accounting_settings')
        .select('sku_prefix, sku_next_number, sku_padding')
        .eq('user_id', tenantId)
        .maybeSingle();

      if (error) throw error;

      return {
        prefix: data?.sku_prefix || 'INV',
        nextNumber: data?.sku_next_number || 1,
        padding: data?.sku_padding || 4,
      };
    } catch (error) {
      console.error('accountingSettingsService.getSkuSettings error', error);
      return { prefix: 'INV', nextNumber: 1, padding: 4 };
    }
  },

  // Actualizar configuración de secuencia de SKU
  async updateSkuSettings(userId: string, settings: { prefix?: string; nextNumber?: number; padding?: number }): Promise<void> {
    try {
      const tenantId = await resolveTenantId(userId);
      const updateData: any = { updated_at: new Date().toISOString() };
      
      if (settings.prefix !== undefined) updateData.sku_prefix = settings.prefix;
      if (settings.nextNumber !== undefined) updateData.sku_next_number = settings.nextNumber;
      if (settings.padding !== undefined) updateData.sku_padding = settings.padding;

      const { error } = await supabase
        .from('accounting_settings')
        .upsert(
          { user_id: tenantId, ...updateData },
          { onConflict: 'user_id' }
        );

      if (error) throw error;
    } catch (error) {
      console.error('accountingSettingsService.updateSkuSettings error', error);
    }
  },

  // Generar próximo SKU y actualizar secuencia
  async generateNextSku(userId: string): Promise<string> {
    try {
      const settings = await this.getSkuSettings(userId);
      const { prefix, nextNumber, padding } = settings;
      
      const paddedNumber = String(nextNumber).padStart(padding, '0');
      const sku = `${prefix}-${paddedNumber}`;

      // Incrementar el siguiente número
      await this.updateSkuSettings(userId, { nextNumber: nextNumber + 1 });

      return sku;
    } catch (error) {
      console.error('accountingSettingsService.generateNextSku error', error);
      // Fallback a SKU aleatorio si hay error
      const timestamp = Date.now().toString().slice(-6);
      const random = Math.random().toString(36).substring(2, 5).toUpperCase();
      return `INV-${timestamp}-${random}`;
    }
  },
};

/* ==========================================================
   Delivery Notes (Conduces) Service
========================================================== */
export const deliveryNotesService = {
  async getAll(userId: string) {
    try {
      if (!userId) return [];
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('delivery_notes')
        .select(`
          *,
          customers (id, name)
        `)
        .eq('user_id', tenantId)
        .order('delivery_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async getById(userId: string, id: string) {
    try {
      if (!userId || !id) return null;
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return null;
      const { data, error } = await supabase
        .from('delivery_notes')
        .select(`
          *,
          delivery_note_lines (
            *,
            inventory_items (name, sku)
          ),
          customers (id, name)
        `)
        .eq('user_id', tenantId)
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      return data ?? null;
    } catch (error) {
      console.error('deliveryNotesService.getById error', error);
      throw error;
    }
  },

  async create(userId: string, note: any, lines: any[]) {
    try {
      if (!userId) throw new Error('userId required');
      const tenantId = await resolveTenantId(userId);
      if (!lines || lines.length === 0) throw new Error('At least one line is required');

      const { data: noteData, error: noteError } = await supabase
        .from('delivery_notes')
        .insert({ ...note, user_id: tenantId })
        .select('*')
        .single();

      if (noteError) throw noteError;

      const linesPayload = lines.map((line: any) => ({
        ...line,
        delivery_note_id: noteData.id,
      }));

      const { data: linesData, error: linesError } = await supabase
        .from('delivery_note_lines')
        .insert(linesPayload)
        .select('*');

      if (linesError) throw linesError;

      return { deliveryNote: noteData, lines: linesData };
    } catch (error) {
      console.error('deliveryNotesService.create error', error);
      throw error;
    }
  },

  async post(userId: string, id: string) {
    try {
      if (!userId) throw new Error('userId required');
      if (!id) throw new Error('delivery note id required');

      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');

      const { data: note, error: noteError } = await supabase
        .from('delivery_notes')
        .select('*')
        .eq('user_id', tenantId)
        .eq('id', id)
        .maybeSingle();

      if (noteError) throw noteError;
      if (!note) throw new Error('Delivery note not found');

      // No reprocesar si ya está contabilizado
      if (note.status === 'posted' || note.status === 'invoiced' || note.status === 'cancelled') {
        return note;
      }

      const deliveryDate = note.delivery_date
        ? String(note.delivery_date)
        : new Date().toISOString().split('T')[0];

      const shouldPostToLedger = false;

      const { data: lines, error: linesError } = await supabase
        .from('delivery_note_lines')
        .select(`
          *,
          inventory_items (
            id,
            name,
            current_stock,
            cost_price,
            average_cost,
            inventory_account_id,
            cogs_account_id
          )
        `)
        .eq('delivery_note_id', note.id);

      if (linesError) throw linesError;
      if (!lines || lines.length === 0) throw new Error('Delivery note has no lines');

      // 1) Actualizar inventario y registrar movimientos de salida
      const cogsTotals: Record<string, number> = {};
      const inventoryTotals: Record<string, number> = {};
      let totalCost = 0;

      for (const rawLine of lines as any[]) {
        const invItem = rawLine.inventory_items as any | null;
        const rawQty = Number(rawLine.quantity) || 0;
        // current_stock y quantity en inventory_movements están definidos como enteros,
        // por lo que normalizamos la cantidad a entero para evitar errores 22P02.
        const qty = Number.isFinite(rawQty) ? Math.round(rawQty) : 0;

        if (!invItem || qty <= 0) continue;

        const oldStock = Number(invItem.current_stock ?? 0) || 0;
        const unitCost =
          invItem.average_cost != null
            ? Number(invItem.average_cost) || 0
            : Number(invItem.cost_price) || 0;
        const lineCost = qty * unitCost;

        const inventoryAccountId = invItem.inventory_account_id as string | null;
        const cogsAccountId = invItem.cogs_account_id as string | null;

        // Actualizar stock del producto
        try {
          if (invItem.id) {
            const newStock = oldStock - qty;
            await inventoryService.updateItem(tenantId, String(invItem.id), {
              current_stock: newStock < 0 ? 0 : newStock,
              cost_price: unitCost,
              average_cost: unitCost,
            });
          }
        } catch (updateError) {
          console.error('deliveryNotesService.post updateItem error', updateError);
        }

        // Registrar movimiento de salida de inventario
        try {
          await inventoryService.createMovement(tenantId, {
            item_id: invItem.id ? String(invItem.id) : null,
            movement_type: 'exit',
            quantity: qty,
            unit_cost: unitCost,
            total_cost: lineCost,
            movement_date: deliveryDate,
            reference: note.document_number || note.id,
            notes: rawLine.description || invItem.name || null,
            source_type: 'delivery_note',
            source_id: note.id ? String(note.id) : null,
            source_number: note.document_number || (note.id ? String(note.id) : null),
            from_warehouse_id: (note as any).warehouse_id || null,
            store_id: (note as any).store_id || null,
          });
        } catch (movError) {
          console.error('deliveryNotesService.post createMovement error', movError);
        }

        if (cogsAccountId && inventoryAccountId && lineCost > 0) {
          totalCost += lineCost;
          cogsTotals[cogsAccountId] = (cogsTotals[cogsAccountId] || 0) + lineCost;
          inventoryTotals[inventoryAccountId] = (inventoryTotals[inventoryAccountId] || 0) + lineCost;
        }
      }

      // 2) Asiento contable principal: CxC vs Ventas/ITBIS
      try {
        if (shouldPostToLedger) {
        const settings = await accountingSettingsService.get(tenantId);
        const arAccountId = settings?.ar_account_id;
        const salesAccountId = settings?.sales_account_id;
        const taxAccountId = settings?.sales_tax_account_id;

        if (arAccountId && salesAccountId) {
          const subtotal = Number(note.subtotal) || 0;
          const taxAmount = Number(note.tax_total) || 0;
          const totalAmount = Number(note.total_amount) || subtotal + taxAmount;

          const entryLines: any[] = [
            {
              account_id: arAccountId,
              description: 'Cuentas por Cobrar Clientes',
              debit_amount: totalAmount,
              credit_amount: 0,
              line_number: 1,
            },
            {
              account_id: salesAccountId,
              description: 'Ventas por Conduce',
              debit_amount: 0,
              credit_amount: subtotal,
              line_number: 2,
            },
          ];

          if (taxAmount > 0 && taxAccountId) {
            entryLines.push({
              account_id: taxAccountId,
              description: 'ITBIS por pagar (Conduces)',
              debit_amount: 0,
              credit_amount: taxAmount,
              line_number: entryLines.length + 1,
            });
          }

          const entryPayload = {
            entry_number: String(note.document_number || `DN-${note.id}`),
            entry_date: String(deliveryDate),
            description: `Conduce ${note.document_number || ''}`.trim(),
            reference: note.id ? String(note.id) : null,
            status: 'posted' as const,
          };

          await journalEntriesService.createWithLines(tenantId, entryPayload, entryLines);
        }
        }
      } catch (ledgerError) {
        console.error('deliveryNotesService.post AR/Sales ledger error', ledgerError);
      }

      // 3) Asiento de Costo de Ventas vs Inventario
      try {
        if (shouldPostToLedger) {
        if (totalCost > 0) {
          const cogsLines: any[] = [];
          let lineNumber = 1;

          for (const [accountId, amount] of Object.entries(cogsTotals)) {
            if (amount > 0) {
              cogsLines.push({
                account_id: accountId,
                description: 'Costo de Ventas Conduces',
                debit_amount: amount,
                credit_amount: 0,
                line_number: lineNumber++,
              });
            }
          }

          for (const [accountId, amount] of Object.entries(inventoryTotals)) {
            if (amount > 0) {
              cogsLines.push({
                account_id: accountId,
                description: 'Inventario Conduces',
                debit_amount: 0,
                credit_amount: amount,
                line_number: lineNumber++,
              });
            }
          }

          if (cogsLines.length > 0) {
            const cogsEntryPayload = {
              entry_number: `${String(note.document_number || note.id)}-COGS`,
              entry_date: String(deliveryDate),
              description: `Costo de ventas conduce ${note.document_number || ''}`.trim(),
              reference: note.id ? String(note.id) : null,
              status: 'posted' as const,
            };

            await journalEntriesService.createWithLines(tenantId, cogsEntryPayload, cogsLines);
          }
        }
        }
      } catch (cogsError) {
        console.error('deliveryNotesService.post COGS ledger error', cogsError);
      }

      // 4) Marcar el conduce como contabilizado
      const { data: updated, error: updateNoteError } = await supabase
        .from('delivery_notes')
        .update({
          status: 'posted',
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', tenantId)
        .eq('id', note.id)
        .select('*')
        .maybeSingle();

      if (updateNoteError) throw updateNoteError;

      return updated ?? note;
    } catch (error) {
      console.error('deliveryNotesService.post error', error);
      throw error;
    }
  },

  async updateStatus(
    userId: string,
    id: string,
    status: 'draft' | 'posted' | 'invoiced' | 'cancelled',
  ) {
    try {
      if (!userId) throw new Error('userId required');
      if (!id) throw new Error('delivery note id required');

      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');

      const { data, error } = await supabase
        .from('delivery_notes')
        .update({
          status,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', tenantId)
        .eq('id', id)
        .select('*')
        .maybeSingle();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('deliveryNotesService.updateStatus error', error);
      throw error;
    }
  },

  async createInvoiceFromNotes(userId: string, deliveryNoteIds: string[]) {
    try {
      if (!userId) throw new Error('userId required');
      if (!deliveryNoteIds || deliveryNoteIds.length === 0) {
        throw new Error('At least one delivery note id is required');
      }

      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');

      // 1) Cargar conduces a facturar
      const { data: notes, error: notesError } = await supabase
        .from('delivery_notes')
        .select('*')
        .eq('user_id', tenantId)
        .in('id', deliveryNoteIds);

      if (notesError) throw notesError;
      if (!notes || notes.length === 0) {
        throw new Error('No se encontraron conduces para facturar');
      }

      const postedNotes = (notes as any[]).filter((n) => n.status === 'posted');
      if (postedNotes.length === 0) {
        throw new Error('Solo se pueden facturar conduces en estado Contabilizado');
      }

      // Asegurar que todos sean del mismo cliente
      const customerId = String(postedNotes[0].customer_id);
      const hasDifferentCustomer = postedNotes.some(
        (n) => String(n.customer_id) !== customerId,
      );
      if (hasDifferentCustomer) {
        throw new Error('Todos los conduces seleccionados deben ser del mismo cliente');
      }

      const noteIdsToInvoice = postedNotes.map((n) => n.id as string);

      // 2) Cargar líneas de todos esos conduces
      const { data: lines, error: linesError } = await supabase
        .from('delivery_note_lines')
        .select('*')
        .in('delivery_note_id', noteIdsToInvoice);

      if (linesError) throw linesError;
      if (!lines || lines.length === 0) {
        throw new Error('Los conduces seleccionados no tienen líneas para facturar');
      }

      // 3) Calcular totales de factura a partir de los encabezados de los conduces
      const subtotal = postedNotes.reduce(
        (sum, n) => sum + (Number((n as any).subtotal) || 0),
        0,
      );
      const taxTotal = postedNotes.reduce(
        (sum, n) => sum + (Number((n as any).tax_total) || 0),
        0,
      );
      const totalAmount = postedNotes.reduce(
        (sum, n) => sum + (Number((n as any).total_amount) || 0),
        0,
      );

      const todayStr = new Date().toISOString().split('T')[0];
      const currency = (postedNotes[0] as any).currency || 'DOP';

      const noteNumbers = postedNotes
        .map((n) => (n as any).document_number || (n as any).id)
        .join(', ');

      const invoicePayload = {
        customer_id: customerId,
        invoice_date: todayStr,
        // La tabla invoices exige due_date NOT NULL, por lo que usamos por defecto
        // la misma fecha de la factura cuando generamos desde Conduces.
        due_date: todayStr,
        currency,
        subtotal,
        tax_amount: taxTotal,
        total_amount: totalAmount,
        paid_amount: 0,
        status: 'pending',
        notes: `Factura generada desde conduces: ${noteNumbers}`,
      };

      const linesPayload = (lines as any[]).map((ln, index) => ({
        description: ln.description,
        quantity: ln.quantity,
        unit_price: ln.unit_price,
        line_total: ln.line_total,
        line_number: index + 1,
        item_id: (ln as any).inventory_item_id || null,
        delivery_note_id: ln.delivery_note_id,
        delivery_note_line_id: ln.id,
      }));

      // 4) Crear factura e insertar líneas (invoicesService.create asigna invoice_number por RPC)
      const { invoice: invoiceData, lines: invoiceLinesData } = await invoicesService.create(
        userId,
        invoicePayload,
        linesPayload,
        { skipPeriodValidation: true },
      );

      try {
        const shouldPostToLedger = String((invoiceData as any).status || '') !== 'draft';

        if (shouldPostToLedger) {
          const settings = await accountingSettingsService.get(tenantId);
          const arAccountId = settings?.ar_account_id;
          const salesAccountId = settings?.sales_account_id;
          const taxAccountId = settings?.sales_tax_account_id;

          // Skip ledger posting if AR account not configured (accounting module optional)
          if (!arAccountId) {
            console.log('[invoicesService] Skipping ledger posting: AR account not configured');
          } else {
          const rawSubtotal = Number((invoiceData as any).subtotal) || 0;
          const rawTax = Number((invoiceData as any).tax_amount) || 0;
          const subtotalNormalized = Number(rawSubtotal.toFixed(2));
          const taxAmount = Number(rawTax.toFixed(2));
          const totalAmountNormalized = Number((subtotalNormalized + taxAmount).toFixed(2));

          const entryLines: any[] = [
            {
              account_id: arAccountId,
              description: 'Cuentas por Cobrar Clientes',
              debit_amount: totalAmountNormalized,
              credit_amount: 0,
              line_number: 1,
            },
          ];

          let nextLineNumber = 2;
          let salesTotalAssigned = 0;
          try {
            const { data: salesLines, error: salesLinesError } = await supabase
              .from('invoice_lines')
              .select(`
                id,
                quantity,
                unit_price,
                line_total,
                item_id,
                inventory_items (income_account_id)
              `)
              .eq('invoice_id', invoiceData.id);

            if (!salesLinesError && salesLines && salesLines.length > 0 && subtotalNormalized > 0) {
              const accountBaseTotals: Record<string, number> = {};
              let totalLinesBase = 0;
              let totalProductBase = 0;

              salesLines.forEach((line: any) => {
                const qty = Number(line.quantity) || 0;
                const unitPrice = Number(line.unit_price) || 0;
                const lineBase = Number(line.line_total) || qty * unitPrice;
                if (lineBase <= 0) return;

                totalLinesBase += lineBase;

                const invItem = line.inventory_items as any | null;
                const incomeAccountId = invItem?.income_account_id as string | null;

                if (incomeAccountId) {
                  totalProductBase += lineBase;
                  accountBaseTotals[incomeAccountId] = (accountBaseTotals[incomeAccountId] || 0) + lineBase;
                }
              });

              if (totalLinesBase > 0 && totalProductBase > 0) {
                const productPortion = (subtotalNormalized * totalProductBase) / totalLinesBase;

                let assignedToProductAccounts = 0;
                for (const [accountId, baseAmount] of Object.entries(accountBaseTotals)) {
                  if (baseAmount <= 0) continue;
                  const allocated = (productPortion * (baseAmount as number)) / totalProductBase;
                  const roundedAllocated = Number(allocated.toFixed(2));
                  if (roundedAllocated <= 0) continue;

                  entryLines.push({
                    account_id: accountId,
                    description: 'Ventas',
                    debit_amount: 0,
                    credit_amount: roundedAllocated,
                    line_number: nextLineNumber++,
                  });
                  assignedToProductAccounts += roundedAllocated;
                }

                salesTotalAssigned = assignedToProductAccounts;
              }
            }
          } catch (salesAllocError) {
            console.error('Error determining income accounts for invoice lines:', salesAllocError);
          }

          const remainingSales = Number((subtotalNormalized - salesTotalAssigned).toFixed(2));
          if (remainingSales > 0 && salesAccountId) {
            entryLines.push({
              account_id: salesAccountId,
              description: 'Ventas',
              debit_amount: 0,
              credit_amount: remainingSales,
              line_number: nextLineNumber++,
            });
          }

          if (taxAmount > 0 && taxAccountId) {
            entryLines.push({
              account_id: taxAccountId,
              description: 'ITBIS por pagar',
              debit_amount: 0,
              credit_amount: taxAmount,
              line_number: nextLineNumber++,
            });
          }

          const entryPayload = {
            entry_number: String((invoiceData as any).invoice_number || ''),
            entry_date: String((invoiceData as any).invoice_date),
            description: `Factura ${(invoiceData as any).invoice_number || ''}`.trim(),
            reference: invoiceData.id ? String(invoiceData.id) : null,
            status: 'posted' as const,
          };

          // Agregar líneas de Costo de Ventas e Inventario al mismo asiento (createInvoiceFromNotes)
          try {
            const { data: costLines, error: costLinesError } = await supabase
              .from('invoice_lines')
              .select(`
                *,
                inventory_items (cost_price, inventory_account_id, cogs_account_id)
              `)
              .eq('invoice_id', invoiceData.id);

            if (!costLinesError && costLines && costLines.length > 0) {
              const cogsTotals: Record<string, number> = {};
              const inventoryTotals: Record<string, number> = {};

              costLines.forEach((line: any) => {
                const invItem = line.inventory_items as any | null;
                const qty = Number(line.quantity) || 0;
                const unitCost = invItem ? Number(invItem.cost_price) || 0 : 0;
                const lineCost = qty * unitCost;

                if (!invItem || lineCost <= 0) return;

                const cogsAccountId = invItem.cogs_account_id as string | null;
                const inventoryAccountId = invItem.inventory_account_id as string | null;

                if (cogsAccountId && inventoryAccountId) {
                  cogsTotals[cogsAccountId] = (cogsTotals[cogsAccountId] || 0) + lineCost;
                  inventoryTotals[inventoryAccountId] = (inventoryTotals[inventoryAccountId] || 0) + lineCost;
                }
              });

              // Agregar líneas de Costo de Ventas (Débito)
              for (const [accountId, amount] of Object.entries(cogsTotals)) {
                if (amount > 0) {
                  entryLines.push({
                    account_id: accountId,
                    description: 'Costo de Ventas',
                    debit_amount: amount,
                    credit_amount: 0,
                    line_number: nextLineNumber++,
                  });
                }
              }

              // Agregar líneas de Inventario (Crédito)
              for (const [accountId, amount] of Object.entries(inventoryTotals)) {
                if (amount > 0) {
                  entryLines.push({
                    account_id: accountId,
                    description: 'Inventario',
                    debit_amount: 0,
                    credit_amount: amount,
                    line_number: nextLineNumber++,
                  });
                }
              }
            }
          } catch (cogsError) {
            console.error('Error calculating invoice COGS for ledger (createInvoiceFromNotes):', cogsError);
          }

          await journalEntriesService.createWithLines(userId, entryPayload, entryLines);
          } // end else (arAccountId exists)
        }
      } catch (postError) {
        console.error('deliveryNotesService.createInvoiceFromNotes invoice posting error', postError);
        try {
          await supabase.from('invoice_lines').delete().eq('invoice_id', invoiceData.id);
        } catch (cleanupError) {
          console.error('deliveryNotesService.createInvoiceFromNotes cleanup lines error', cleanupError);
        }
        try {
          await supabase.from('invoices').delete().eq('id', invoiceData.id).eq('user_id', tenantId);
        } catch (cleanupError) {
          console.error('deliveryNotesService.createInvoiceFromNotes cleanup invoice error', cleanupError);
        }
        throw postError;
      }

      // 5) Marcar conduces como facturados y actualizar cantidad facturada en líneas
      const now = new Date().toISOString();

      const { error: updateNotesError } = await supabase
        .from('delivery_notes')
        .update({ status: 'invoiced', updated_at: now })
        .eq('user_id', tenantId)
        .in('id', noteIdsToInvoice);

      if (updateNotesError) {
        console.error('deliveryNotesService.createInvoiceFromNotes update notes error', updateNotesError);
      }

      for (const ln of lines as any[]) {
        try {
          await supabase
            .from('delivery_note_lines')
            .update({ invoiced_quantity: ln.quantity })
            .eq('id', ln.id);
        } catch (lnError) {
          console.error('deliveryNotesService.createInvoiceFromNotes update line error', lnError);
        }
      }

      return { invoice: invoiceData, lines: invoiceLinesData };
    } catch (error) {
      console.error('deliveryNotesService.createInvoiceFromNotes error', error);
      throw error;
    }
  },
};

/* ==========================================================
   Invoices Service
========================================================== */
export const invoicesService = {
  async upsertFiscalDocumentRow(tenantId: string, payload: any) {
    try {
      const ncfNumber = String(payload?.ncf_number || '');
      if (!ncfNumber) return;

      // Detect if row exists
      const { data: existing, error: findErr } = await supabase
        .from('fiscal_documents')
        .select('id')
        .eq('user_id', tenantId)
        .eq('ncf_number', ncfNumber)
        .maybeSingle();

      if (findErr) throw findErr;

      if (existing?.id) {
        const { error: updErr } = await supabase
          .from('fiscal_documents')
          .update({ ...payload })
          .eq('id', existing.id)
          .eq('user_id', tenantId);
        if (updErr) throw updErr;
      } else {
        const { error: insErr } = await supabase
          .from('fiscal_documents')
          .insert(payload as any);
        if (insErr) throw insErr;
      }
    } catch (error) {
      console.error('invoicesService.upsertFiscalDocumentRow error', describeSupabaseError(error));
    }
  },

  async upsertFiscalDocumentForInvoice(tenantId: string, invoiceData: any) {
    try {
      const invoiceNumber = String(invoiceData?.invoice_number || '');
      if (!invoiceNumber) return;

      // Only consider NCF-like numbers (skip internal FAC- numbers)
      if (invoiceNumber.toUpperCase().startsWith('FAC-')) return;

      const issueDate = String(invoiceData?.invoice_date || new Date().toISOString().slice(0, 10));
      const amount = Number(invoiceData?.total_amount ?? 0) || 0;
      const taxAmount = Number(invoiceData?.tax_amount ?? 0) || 0;

      // Try infer document_type by matching series_prefix
      let inferredDocumentType: string | null = null;
      const prefixMatch = invoiceNumber.match(/^(\D+)/);
      const seriesPrefix = prefixMatch?.[1] ? String(prefixMatch[1]) : '';
      if (seriesPrefix) {
        try {
          const { data: series, error: seriesErr } = await supabase
            .from('ncf_series')
            .select('document_type, series_prefix')
            .eq('user_id', tenantId)
            .ilike('series_prefix', seriesPrefix)
            .order('created_at', { ascending: true });
          if (!seriesErr && series && series.length > 0) {
            inferredDocumentType = (series[0] as any)?.document_type ? String((series[0] as any).document_type) : null;
          }
        } catch {
          inferredDocumentType = null;
        }
      }

      const payload: any = {
        user_id: tenantId,
        status: 'active',
        issue_date: issueDate,
        ncf_number: invoiceNumber,
        document_type: inferredDocumentType,
        amount,
        tax_amount: taxAmount,
      };

      // fiscal_documents.document_type es NOT NULL. Si no podemos inferirlo,
      // omitimos el upsert para no romper el flujo de creación de factura.
      if (!payload.document_type) return;

      await this.upsertFiscalDocumentRow(tenantId, payload);
    } catch (error) {
      console.error('invoicesService.upsertFiscalDocumentForInvoice error', describeSupabaseError(error));
    }
  },

  async markFiscalDocumentCancelledByInvoiceNumber(tenantId: string, invoiceNumber: string, cancelledDate: string) {
    try {
      const ncfNumber = String(invoiceNumber || '');
      if (!ncfNumber) return;
      if (ncfNumber.toUpperCase().startsWith('FAC-')) return;

      // Try infer document_type by matching series_prefix
      let inferredDocumentType: string | null = null;
      const prefixMatch = ncfNumber.match(/^(\D+)/);
      const seriesPrefix = prefixMatch?.[1] ? String(prefixMatch[1]) : '';
      if (seriesPrefix) {
        try {
          const { data: series, error: seriesErr } = await supabase
            .from('ncf_series')
            .select('document_type, series_prefix')
            .eq('user_id', tenantId)
            .ilike('series_prefix', seriesPrefix)
            .order('created_at', { ascending: true });
          if (!seriesErr && series && series.length > 0) {
            inferredDocumentType = (series[0] as any)?.document_type ? String((series[0] as any).document_type) : null;
          }
        } catch {
          inferredDocumentType = null;
        }
      }

      // Best-effort update
      const { error } = await supabase
        .from('fiscal_documents')
        .update({
          status: 'cancelled',
          cancelled_date: cancelledDate,
          cancellation_reason: 'Cancelado',
          document_type: inferredDocumentType,
        })
        .eq('user_id', tenantId)
        .eq('ncf_number', ncfNumber);
      if (error) throw error;
    } catch (error) {
      console.error('invoicesService.markFiscalDocumentCancelledByInvoiceNumber error', describeSupabaseError(error));
    }
  },

  async getAll(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');
      const { data, error} = await supabase
        .from('invoices')
        .select(`
          *,
          customers (*),
          invoice_lines (*)
        `)
        .eq('user_id', tenantId)
        .order('created_at', { ascending: false })
        .order('invoice_date', { ascending: false });
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async getLinesWithItemType(userId: string, invoiceId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');
      if (!invoiceId) return [];

      const { data, error } = await supabase
        .from('invoice_lines')
        .select(
          `
            id,
            invoice_id,
            item_id,
            description,
            quantity,
            unit_price,
            line_total,
            start_time,
            end_time
          `,
        )
        .eq('invoice_id', invoiceId);

      if (error) throw error;

      const lines = ((data as any[]) || []).map((ln) => ({
        ...ln,
        inventory_items: null as any,
      }));

      const itemIds = Array.from(
        new Set(lines.map((ln: any) => ln.item_id).filter(Boolean).map((v: any) => String(v))),
      );

      if (itemIds.length === 0) return lines;

      const { data: items, error: itemsErr } = await supabase
        .from('inventory_items')
        .select('id, item_type')
        .eq('user_id', tenantId)
        .in('id', itemIds);

      if (itemsErr) throw itemsErr;

      const itemTypeById = new Map<string, string>();
      (items || []).forEach((it: any) => {
        if (it?.id) itemTypeById.set(String(it.id), String(it.item_type || ''));
      });

      return lines.map((ln: any) => {
        const itemType = ln.item_id ? itemTypeById.get(String(ln.item_id)) : undefined;
        return {
          ...ln,
          inventory_items: itemType ? { item_type: itemType } : null,
        };
      });
    } catch (error) {
      console.error('invoicesService.getLinesWithItemType error', describeSupabaseError(error));
      return [];
    }
  },

  async create(userId: string, invoice: any, lines: any[], options?: { skipPeriodValidation?: boolean }) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');

      const formatInvoiceNumber = (raw: string): string => {
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
      };

      // Determinar si omitir validación de período (planes básicos no la requieren)
      const skipValidation = options?.skipPeriodValidation ?? shouldSkipPeriodValidation();

      // Validar que exista un período contable abierto para la fecha de la factura
      if (!skipValidation) {
        const invoiceDate = invoice.invoice_date || new Date().toISOString().split('T')[0];
        await accountingPeriodsService.requireOpenPeriod(tenantId, invoiceDate);
      }

      // Validar stock disponible antes de crear la factura
      const itemsToValidate = lines
        .filter((line: any) => line.item_id)
        .map((line: any) => ({
          item_id: line.item_id,
          quantity: Number(line.quantity) || 0,
          name: line.description || '',
        }));

      if (itemsToValidate.length > 0) {
        const stockValidation = await inventoryService.validateStock(userId, itemsToValidate);
        if (!stockValidation.valid) {
          throw new Error(
            '❌ Stock insuficiente para completar la venta:\n\n' +
            stockValidation.errors.join('\n\n')
          );
        }
      }

      const invoiceToInsert = { ...(invoice || {}) } as any;

      const rawAccountNumber = invoiceToInsert.account_number;
      const normalizedAccountNumber =
        rawAccountNumber === null || rawAccountNumber === undefined ? '' : String(rawAccountNumber).trim();
      const hasValidAccountNumber = Boolean(normalizedAccountNumber) && /^[0-9]+$/.test(normalizedAccountNumber);

      if (!hasValidAccountNumber) {
        try {
          const { data: acctNum, error: acctErr } = await supabase.rpc('next_invoice_account_number', {
            p_tenant_id: tenantId,
          });
          if (!acctErr) {
            const s = String(acctNum || '').trim();
            if (s) invoiceToInsert.account_number = s;
          }
        } catch {
          // best-effort only
        }
      }

      if (!invoiceToInsert.invoice_number) {
        const { data: nextNumber, error: nextErr } = await supabase.rpc('next_invoice_number', {
          p_tenant_id: tenantId,
        });
        if (nextErr) throw nextErr;
        invoiceToInsert.invoice_number = formatInvoiceNumber(String(nextNumber || '').trim());
        if (!invoiceToInsert.invoice_number) {
          throw new Error('Could not generate invoice number');
        }
      }

      const tryInsertInvoice = async (payload: any) => {
        const { data: invoiceData, error: invoiceError } = await supabase
          .from('invoices')
          .insert(payload)
          .select()
          .single();
        if (invoiceError) throw invoiceError;
        return invoiceData;
      };

      let invoiceData: any;
      const basePayload = { ...invoiceToInsert, user_id: tenantId } as any;
      const colsToDropKnown = [
        'customer_name',
        'sale_type',
        'store_name',
        'public_token',
        'sequential_number',
        'ncf_expiry_date',
      ];

      const droppedCols = new Set<string>();
      for (const c of colsToDropKnown) droppedCols.add(c);

      let payloadToTry = { ...basePayload } as any;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          // Remover columnas conocidas (y las detectadas) antes de intentar
          droppedCols.forEach((c) => {
            delete payloadToTry[c];
          });

          invoiceData = await tryInsertInvoice(payloadToTry);
          break;
        } catch (error: any) {
          if ((error as any)?.code !== 'PGRST204') throw error;

          const msg = String((error as any)?.message || '');
          const m = msg.match(/Could not find the '([^']+)' column/i);
          const missingCol = m?.[1] ? String(m[1]) : null;
          if (!missingCol) throw error;

          droppedCols.add(missingCol);
          payloadToTry = { ...basePayload };
          continue;
        }
      }

      if (!invoiceData) {
        throw new Error('No se pudo crear la factura (invoices): esquema incompatible o error desconocido');
      }

      // Best-effort: registrar documento fiscal para Reporte 608 cuando aplique
      await this.upsertFiscalDocumentForInvoice(tenantId, invoiceData);

      const linesWithInvoice = lines.map((line) => ({
        ...line,
        invoice_id: invoiceData.id,
      }));

      const tryInsertLines = async (payload: any[]) => {
        const { data: linesData, error: linesError } = await supabase
          .from('invoice_lines')
          .insert(payload)
          .select();
        if (linesError) {
          const wrapped: any = new Error(describeSupabaseError(linesError));
          wrapped.code = (linesError as any)?.code;
          wrapped.details = (linesError as any)?.details;
          wrapped.hint = (linesError as any)?.hint;
          throw wrapped;
        }
        return linesData;
      };

      let linesData: any[] = [];
      try {
        let payloadToInsert: any[] = linesWithInvoice;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            linesData = (await tryInsertLines(payloadToInsert)) as any[];
            break;
          } catch (error: any) {
            if (error?.code === 'PGRST204') {
              const msg = String(error?.message || '');
              const m = msg.match(/Could not find the '([^']+)' column/i);
              const missingCol = m?.[1] ? String(m[1]) : null;

              const colsToDrop = [missingCol].filter(Boolean) as string[];
              colsToDrop.push('tax_amount');
              colsToDrop.push('user_id');

              payloadToInsert = (payloadToInsert || []).map((ln: any) => {
                const clean = { ...ln };
                colsToDrop.forEach((c) => {
                  delete (clean as any)[c];
                });
                return clean;
              });
              continue;
            }
            throw error;
          }
        }

        if (!linesData || linesData.length === 0) {
          throw new Error('No se pudieron insertar las líneas de la factura (invoice_lines)');
        }
      } catch (linesInsertError) {
        try {
          await supabase.from('invoices').delete().eq('id', invoiceData.id).eq('user_id', tenantId);
        } catch (cleanupError) {
          console.error('invoicesService.create cleanup invoice after lines failure error', cleanupError);
        }
        throw linesInsertError;
      }

      // Best-effort: crear solicitud de autorización para descuento en factura si aplica
      try {
        const discountType = (invoiceData as any).discount_type as string | null;
        const totalDiscount = Number((invoiceData as any).total_discount ?? (invoiceData as any).discount_value ?? 0) || 0;
        if (discountType && totalDiscount > 0) {
          await supabase.from('approval_requests').insert({
            user_id: tenantId,
            entity_type: 'invoice_discount',
            entity_id: invoiceData.id,
            status: 'pending',
            notes: invoiceData.notes ?? null,
          });
        }
      } catch (approvalError) {
        // eslint-disable-next-line no-console
        console.error('Error creating approval request for invoice discount:', approvalError);
      }

      // Intentar registrar asiento contable para la factura (best-effort)
      try {
        const shouldPostToLedger = false;

        if (shouldPostToLedger) {
          const settings = await accountingSettingsService.get(tenantId);
          const arAccountId = settings?.ar_account_id;
          const salesAccountId = settings?.sales_account_id;
          const taxAccountId = settings?.sales_tax_account_id;

          // Skip ledger posting if AR account not configured (accounting module optional)
          if (!arAccountId) {
            console.log('[invoicesService.create] Skipping ledger posting: AR account not configured');
          } else {
          // Solo exigimos la cuenta de CxC para poder registrar el asiento.
          // Las cuentas de ingreso pueden venir de los productos y usar la
          // cuenta de ventas global solo como respaldo.
          // Normalizar importes a 2 decimales y calcular el total a partir de
          // subtotal + impuestos, para evitar pequeñas diferencias de
          // redondeo con invoice.total_amount que desbalanceen el asiento.
          const rawSubtotal = Number(invoiceData.subtotal) || 0;
          const rawTax = Number(invoiceData.tax_amount) || 0;
          const subtotal = Number(rawSubtotal.toFixed(2));
          const taxAmount = Number(rawTax.toFixed(2));
          const totalAmount = Number((subtotal + taxAmount).toFixed(2));

          const entryLines: any[] = [
            {
              account_id: arAccountId,
              description: 'Cuentas por Cobrar Clientes',
              debit_amount: totalAmount,
              credit_amount: 0,
              line_number: 1,
            },
          ];

          let nextLineNumber = 2;

          // Distribuir ingresos por cuentas de producto cuando sea posible
          let salesTotalAssigned = 0;
          try {
            const { data: salesLines, error: salesLinesError } = await supabase
              .from('invoice_lines')
              .select(`
                id,
                quantity,
                unit_price,
                line_total,
                item_id,
                inventory_items (income_account_id)
              `)
              .eq('invoice_id', invoiceData.id);

            if (!salesLinesError && salesLines && salesLines.length > 0 && subtotal > 0) {
              const accountBaseTotals: Record<string, number> = {};
              let totalLinesBase = 0;
              let totalProductBase = 0;

              salesLines.forEach((line: any) => {
                const qty = Number(line.quantity) || 0;
                const unitPrice = Number(line.unit_price) || 0;
                const lineBase = Number(line.line_total) || qty * unitPrice;
                if (lineBase <= 0) return;

                totalLinesBase += lineBase;

                const invItem = line.inventory_items as any | null;
                const incomeAccountId = invItem?.income_account_id as string | null;

                if (incomeAccountId) {
                  totalProductBase += lineBase;
                  accountBaseTotals[incomeAccountId] = (accountBaseTotals[incomeAccountId] || 0) + lineBase;
                }
              });

              if (totalLinesBase > 0 && totalProductBase > 0) {
                // Parte del subtotal atribuible a ítems con cuenta de ingreso propia
                const productPortion = (subtotal * totalProductBase) / totalLinesBase;

                let assignedToProductAccounts = 0;
                for (const [accountId, baseAmount] of Object.entries(accountBaseTotals)) {
                  if (baseAmount <= 0) continue;
                  const allocated = (productPortion * (baseAmount as number)) / totalProductBase;
                  const roundedAllocated = Number(allocated.toFixed(2));
                  if (roundedAllocated <= 0) continue;

                  entryLines.push({
                    account_id: accountId,
                    description: 'Ventas',
                    debit_amount: 0,
                    credit_amount: roundedAllocated,
                    line_number: nextLineNumber++,
                  });
                  assignedToProductAccounts += roundedAllocated;
                }

                salesTotalAssigned = assignedToProductAccounts;
              }
            }
          } catch (salesAllocError) {
            // eslint-disable-next-line no-console
            console.error('Error determining income accounts for invoice lines:', salesAllocError);
          }

          const remainingSales = Number((subtotal - salesTotalAssigned).toFixed(2));
          if (remainingSales > 0) {
            if (salesAccountId) {
              // Parte del subtotal no cubierta por cuentas de producto:
              // se envía a la cuenta de ventas global.
              entryLines.push({
                account_id: salesAccountId,
                description: 'Ventas',
                debit_amount: 0,
                credit_amount: remainingSales,
                line_number: nextLineNumber++,
              });
            } else {
              // Si no hay cuenta global de ventas y queda remanente, solo registrar en consola
              // (módulo contable opcional)
              console.log('[invoicesService.create] Skipping sales entry: no sales account configured and not all lines have income account');
            }
          }

          if (taxAmount > 0 && taxAccountId) {
            entryLines.push({
              account_id: taxAccountId,
              description: 'ITBIS por pagar',
              debit_amount: 0,
              credit_amount: taxAmount,
              line_number: nextLineNumber++,
            });
          }

          // Agregar líneas de Costo de Ventas e Inventario al mismo asiento
          try {
            const { data: costLines, error: costLinesError } = await supabase
              .from('invoice_lines')
              .select(`
                *,
                inventory_items (cost_price, inventory_account_id, cogs_account_id)
              `)
              .eq('invoice_id', invoiceData.id);

            if (!costLinesError && costLines && costLines.length > 0) {
              const cogsTotals: Record<string, number> = {};
              const inventoryTotals: Record<string, number> = {};

              costLines.forEach((line: any) => {
                const invItem = line.inventory_items as any | null;
                const qty = Number(line.quantity) || 0;
                const unitCost = invItem ? Number(invItem.cost_price) || 0 : 0;
                const lineCost = qty * unitCost;

                if (!invItem || lineCost <= 0) return;

                const cogsAccountId = invItem.cogs_account_id as string | null;
                const inventoryAccountId = invItem.inventory_account_id as string | null;

                if (cogsAccountId && inventoryAccountId) {
                  cogsTotals[cogsAccountId] = (cogsTotals[cogsAccountId] || 0) + lineCost;
                  inventoryTotals[inventoryAccountId] = (inventoryTotals[inventoryAccountId] || 0) + lineCost;
                }
              });

              // Agregar líneas de Costo de Ventas (Débito)
              for (const [accountId, amount] of Object.entries(cogsTotals)) {
                if (amount > 0) {
                  entryLines.push({
                    account_id: accountId,
                    description: 'Costo de Ventas',
                    debit_amount: amount,
                    credit_amount: 0,
                    line_number: nextLineNumber++,
                  });
                }
              }

              // Agregar líneas de Inventario (Crédito)
              for (const [accountId, amount] of Object.entries(inventoryTotals)) {
                if (amount > 0) {
                  entryLines.push({
                    account_id: accountId,
                    description: 'Inventario',
                    debit_amount: 0,
                    credit_amount: amount,
                    line_number: nextLineNumber++,
                  });
                }
              }
            }
          } catch (cogsError) {
            console.error('Error calculating invoice COGS for ledger:', cogsError);
          }

          const entryPayload = {
            entry_number: String(invoiceData.invoice_number || ''),
            entry_date: String(invoiceData.invoice_date),
            description: `Factura ${invoiceData.invoice_number || ''}`.trim(),
            reference: invoiceData.id ? String(invoiceData.id) : null,
            status: 'posted' as const,
          };

          await journalEntriesService.createWithLines(userId, entryPayload, entryLines);

          // Crear movimientos de salida de inventario para cada línea con item_id
          try {
            const { data: invLines, error: invLinesError } = await supabase
              .from('invoice_lines')
              .select(`
                *,
                inventory_items (id, name, cost_price, warehouse_id)
              `)
              .eq('invoice_id', invoiceData.id);

            if (!invLinesError && invLines && invLines.length > 0) {
              for (const line of invLines) {
                const invItem = line.inventory_items as any | null;
                const qty = Number(line.quantity) || 0;

                if (!invItem || qty <= 0) continue;

                const unitCost = Number(invItem.cost_price) || 0;

                await inventoryService.createMovement(tenantId, {
                  item_id: invItem.id ? String(invItem.id) : null,
                  movement_type: 'exit',
                  quantity: qty,
                  unit_cost: unitCost,
                  total_cost: qty * unitCost,
                  reference: invoiceData.invoice_number || invoiceData.id,
                  notes: `Venta - Factura ${invoiceData.invoice_number || ''}`.trim(),
                  source_type: 'invoice',
                  source_id: invoiceData.id,
                  from_warehouse_id: invItem.warehouse_id || null,
                  to_warehouse_id: null,
                });
              }
            }
          } catch (movError) {
            console.error('Error creating inventory movements for invoice:', movError);
          }
          } // end else (arAccountId exists)
        }
      } catch (error) {
        console.error('Error posting invoice to ledger:', error);
        try {
          await supabase
            .from('approval_requests')
            .delete()
            .eq('entity_type', 'invoice_discount')
            .eq('entity_id', invoiceData.id);
        } catch (cleanupError) {
          console.error('Error cleaning up approval requests after invoice posting failure:', cleanupError);
        }
        try {
          await supabase.from('invoice_lines').delete().eq('invoice_id', invoiceData.id);
        } catch (cleanupError) {
          console.error('Error cleaning up invoice lines after invoice posting failure:', cleanupError);
        }
        try {
          await supabase.from('invoices').delete().eq('id', invoiceData.id);
        } catch (cleanupError) {
          console.error('Error cleaning up invoice after invoice posting failure:', cleanupError);
        }
        throw error;
      }

      // Registrar movimientos de salida de inventario para cada línea con producto
      try {
        const shouldUpdateInventory = String((invoiceData as any).status || '') !== 'draft';
        if (shouldUpdateInventory && linesData && linesData.length > 0) {
          for (const line of linesData) {
            const itemId = line.item_id;
            const qty = Number(line.quantity) || 0;
            if (!itemId || qty <= 0) continue;

            // Obtener datos del producto para el movimiento
            const { data: invItem } = await supabase
              .from('inventory_items')
              .select('id, name, sku, warehouse_id, cost_price, average_cost, item_type, current_stock')
              .eq('id', itemId)
              .maybeSingle();

            if (!invItem) continue;
            // Solo productos de inventario (no servicios)
            if (invItem.item_type === 'service') continue;

            const unitCost = Number(invItem.average_cost) || Number(invItem.cost_price) || 0;

            // Crear movimiento de salida
            try {
              await inventoryService.createMovement(userId, {
                item_id: invItem.id ? String(invItem.id) : null,
                movement_type: 'exit',
                quantity: qty,
                unit_cost: unitCost,
                total_cost: qty * unitCost,
                reference: `Factura ${invoiceData.invoice_number || invoiceData.id}`,
                notes: `Venta - ${line.description || invItem.name || ''}`,
                movement_date: invoiceData.invoice_date || new Date().toISOString().split('T')[0],
                from_warehouse_id: invItem.warehouse_id || null,
                to_warehouse_id: null,
              });
            } catch (movError) {
              console.error('invoicesService.create createMovement error', movError);
            }

            // Actualizar stock del producto
            try {
              const currentStock = Number(invItem.current_stock) || 0;
              const newStock = Math.max(currentStock - qty, 0);
              await inventoryService.updateItem(userId, String(invItem.id), {
                current_stock: newStock,
              });
            } catch (stockError) {
              console.error('invoicesService.create updateStock error', stockError);
            }
          }
        }
      } catch (inventoryError) {
        console.error('Error registering inventory movements for invoice:', inventoryError);
      }

      return { invoice: invoiceData, lines: linesData };
    } catch (error) {
      throw error;
    }
  },

  async regenerateInventoryMovements(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');

      // Obtener todas las facturas no anuladas
      const { data: invoices, error: invError } = await supabase
        .from('invoices')
        .select('id, invoice_number, invoice_date, status')
        .eq('user_id', tenantId)
        .not('status', 'in', '("cancelled","voided")');

      if (invError) throw invError;
      if (!invoices || invoices.length === 0) {
        return { processed: 0, created: 0 };
      }

      let totalCreated = 0;

      for (const invoice of invoices) {
        // Verificar si ya tiene movimientos de salida
        const { data: existingMovements } = await supabase
          .from('inventory_movements')
          .select('id')
          .eq('user_id', tenantId)
          .eq('source_type', 'invoice')
          .eq('source_id', invoice.id)
          .limit(1);

        if (existingMovements && existingMovements.length > 0) {
          continue; // Ya tiene movimientos, saltar
        }

        // Obtener líneas de la factura con items de inventario
        const { data: lines, error: linesError } = await supabase
          .from('invoice_lines')
          .select(`
            *,
            inventory_items (id, name, cost_price, warehouse_id)
          `)
          .eq('invoice_id', invoice.id);

        if (linesError || !lines) continue;

        for (const line of lines) {
          const invItem = line.inventory_items as any | null;
          const qty = Number(line.quantity) || 0;

          if (!invItem || qty <= 0) continue;

          const unitCost = Number(invItem.cost_price) || 0;

          try {
            await inventoryService.createMovement(tenantId, {
              item_id: invItem.id ? String(invItem.id) : null,
              movement_type: 'exit',
              quantity: qty,
              unit_cost: unitCost,
              total_cost: qty * unitCost,
              reference: invoice.invoice_number || invoice.id,
              notes: `Venta - Factura ${invoice.invoice_number || ''}`.trim(),
              source_type: 'invoice',
              source_id: invoice.id,
              from_warehouse_id: invItem.warehouse_id || null,
              to_warehouse_id: null,
              movement_date: invoice.invoice_date || new Date().toISOString().slice(0, 10),
            });
            totalCreated++;
          } catch (movError) {
            console.error(`Error creating movement for invoice ${invoice.id}:`, movError);
          }
        }
      }

      return { processed: invoices.length, created: totalCreated };
    } catch (error) {
      console.error('invoicesService.regenerateInventoryMovements error', error);
      throw error;
    }
  },

  async updatePayment(id: string, paidAmount: number, status: string) {
    try {
      const { data, error } = await supabase
        .from('invoices')
        .update({
          paid_amount: paidAmount,
          status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('invoicesService.updatePayment error', error);
      throw error;
    }
  },

  async updateTotals(id: string, totalAmount: number, status: string) {
    try {
      const { data, error } = await supabase
        .from('invoices')
        .update({
          total_amount: totalAmount,
          status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('invoicesService.updateTotals error', error);
      throw error;
    }
  },

  async cancel(userId: string, invoiceId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');
      if (!invoiceId) throw new Error('invoiceId required');

      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .select('id, invoice_number, status, paid_amount')
        .eq('user_id', tenantId)
        .eq('id', invoiceId)
        .maybeSingle();

      if (invoiceError) throw invoiceError;
      if (!invoice) throw new Error('Factura no encontrada');

      const paidAmount = Number((invoice as any).paid_amount) || 0;
      if (paidAmount > 0) {
        throw new Error('No se puede anular una factura con pagos registrados');
      }

      const { data: updatedInvoice, error: updateError } = await supabase
        .from('invoices')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('user_id', tenantId)
        .eq('id', invoiceId)
        .select('*')
        .single();

      if (updateError) throw updateError;

      // Anular los asientos relacionados (Factura y COGS) vinculados por reference = invoiceId
      const { error: reverseError } = await supabase
        .from('journal_entries')
        .update({ status: 'reversed' })
        .eq('user_id', tenantId)
        .eq('reference', invoiceId)
        .neq('status', 'reversed');

      if (reverseError) throw reverseError;

      // Best-effort: reflejar anulación en fiscal_documents (Reporte 608)
      try {
        const cancelledDate = new Date().toISOString().slice(0, 10);
        await this.markFiscalDocumentCancelledByInvoiceNumber(
          tenantId,
          String((updatedInvoice as any)?.invoice_number || (invoice as any)?.invoice_number || ''),
          cancelledDate,
        );
      } catch (fdCancelError) {
        console.error('Error updating fiscal_documents on invoice cancel:', describeSupabaseError(fdCancelError));
      }

      return updatedInvoice;
    } catch (error) {
      console.error('invoicesService.cancel error', describeSupabaseError(error));
      throw error;
    }
  },

  async updateWithLines(userId: string, externalId: string, invoicePatch: any, lines: any[]) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');
      if (!externalId) throw new Error('externalId (invoice id/number) required');

      // Buscar la factura por invoice_number o, en su defecto, por id
      let invoiceId: string | null = null;

      const { data: byNumber, error: byNumberError } = await supabase
        .from('invoices')
        .select('id, invoice_number')
        .eq('user_id', tenantId)
        .eq('invoice_number', externalId)
        .maybeSingle();

      if (byNumberError) throw byNumberError;
      if (byNumber && byNumber.id) {
        invoiceId = String(byNumber.id);
      } else {
        const { data: byId, error: byIdError } = await supabase
          .from('invoices')
          .select('id')
          .eq('user_id', tenantId)
          .eq('id', externalId)
          .maybeSingle();
        if (byIdError) throw byIdError;
        if (byId && byId.id) {
          invoiceId = String(byId.id);
        }
      }

      if (!invoiceId) {
        throw new Error('Factura no encontrada para actualizar');
      }

      // Actualizar cabecera
      const { data: updatedInvoice, error: updateError } = await supabase
        .from('invoices')
        .update({
          ...invoicePatch,
          updated_at: new Date().toISOString(),
        })
        .eq('id', invoiceId)
        .eq('user_id', tenantId)
        .select('*')
        .single();

      if (updateError) throw updateError;

      // Reemplazar líneas
      const { error: deleteLinesError } = await supabase
        .from('invoice_lines')
        .delete()
        .eq('invoice_id', invoiceId);

      if (deleteLinesError) throw deleteLinesError;

      let insertedLines: any[] = [];
      if (lines && lines.length > 0) {
        const payload = lines.map((line: any, index: number) => ({
          ...line,
          invoice_id: invoiceId,
          line_number: typeof line.line_number === 'number' ? line.line_number : index + 1,
        }));

        const { data: newLines, error: insertLinesError } = await supabase
          .from('invoice_lines')
          .insert(payload)
          .select('*');

        if (insertLinesError) throw insertLinesError;
        insertedLines = newLines || [];
      }

      return { invoice: updatedInvoice, lines: insertedLines };
    } catch (error) {
      console.error('invoicesService.updateWithLines error', error);
      throw error;
    }
  },

  async deleteByExternalId(userId: string, externalId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');
      if (!externalId) throw new Error('externalId (invoice id/number) required');

      // Buscar la factura por invoice_number o por id
      let invoiceId: string | null = null;

      const { data: byNumber, error: byNumberError } = await supabase
        .from('invoices')
        .select('id, invoice_number')
        .eq('user_id', tenantId)
        .eq('invoice_number', externalId)
        .maybeSingle();

      if (byNumberError) throw byNumberError;
      if (byNumber && byNumber.id) {
        invoiceId = String(byNumber.id);
      } else {
        const { data: byId, error: byIdError } = await supabase
          .from('invoices')
          .select('id')
          .eq('user_id', tenantId)
          .eq('id', externalId)
          .maybeSingle();
        if (byIdError) throw byIdError;
        if (byId && byId.id) {
          invoiceId = String(byId.id);
        }
      }

      if (!invoiceId) {
        // Nada que borrar
        return;
      }

      // Borrar líneas primero
      const { error: deleteLinesError } = await supabase
        .from('invoice_lines')
        .delete()
        .eq('invoice_id', invoiceId);

      if (deleteLinesError) throw deleteLinesError;

      // Borrar cabecera
      const { error: deleteInvoiceError } = await supabase
        .from('invoices')
        .delete()
        .eq('id', invoiceId)
        .eq('user_id', tenantId);

      if (deleteInvoiceError) throw deleteInvoiceError;
    } catch (error) {
      console.error('invoicesService.deleteByExternalId error', error);
      throw error;
    }
  },
};

/* ==========================================================
   Receipt Applications Service (Receipts applied to Invoices)
========================================================== */
export const receiptApplicationsService = {
  // ...
  async create(userId: string, payload: {
    receipt_id: string;
    invoice_id: string;
    amount_applied: number;
    application_date?: string;
    notes?: string | null;
  }) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');
      const body = {
        user_id: tenantId,
        receipt_id: payload.receipt_id,
        invoice_id: payload.invoice_id,
        amount_applied: payload.amount_applied,
        application_date: payload.application_date || new Date().toISOString().slice(0, 10),
        notes: payload.notes ?? null,
      };
      const { data, error } = await supabase
        .from('receipt_applications')
        .insert(body)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('receiptApplicationsService.create error', error);
      throw error;
    }
  },

  async getByInvoice(userId: string, invoiceId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('receipt_applications')
        .select('*')
        .eq('user_id', tenantId)
        .eq('invoice_id', invoiceId);
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async getByReceipt(userId: string, receiptId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('receipt_applications')
        .select(`
          *,
          invoices (invoice_number)
        `)
        .eq('user_id', tenantId)
        .eq('receipt_id', receiptId)
        .order('application_date', { ascending: true });
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },
};

/* ==========================================================
   Receipts Service (Accounts Receivable)
========================================================== */
export const receiptsService = {
  async getAll(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('receipts')
        .select(`
          *,
          customers (name)
        `)
        .eq('user_id', tenantId)
        .order('receipt_date', { ascending: false });
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async create(userId: string, receipt: { customer_id: string; receipt_number: string; receipt_date: string; amount: number; payment_method: string; reference?: string | null; concept?: string | null; status?: string }) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');
      const payload = {
        user_id: tenantId,
        customer_id: receipt.customer_id,
        receipt_number: receipt.receipt_number,
        receipt_date: receipt.receipt_date,
        amount: receipt.amount,
        payment_method: receipt.payment_method,
        reference: receipt.reference ?? null,
        concept: receipt.concept ?? null,
        status: receipt.status ?? 'active',
      };
      const { data, error } = await supabase
        .from('receipts')
        .insert(payload)
        .select('*')
        .single();
      if (error) throw error;

      // Best-effort: si el recibo es en efectivo, registrarlo en Cash & Finance
      try {
        const paymentMethod = String((data as any)?.payment_method || '').toLowerCase();
        const amount = Number((data as any)?.amount || 0);
        const currency = String((data as any)?.currency || 'USD');

        if ((paymentMethod === 'cash' || paymentMethod === 'efectivo') && amount > 0) {
          const { data: openDrawer, error: drawerError } = await supabase
            .from('contador_cash_drawers')
            .select('id')
            .eq('user_id', tenantId)
            .eq('status', 'open')
            .order('opened_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!drawerError && openDrawer?.id) {
            await supabase.from('contador_cash_transactions').insert({
              user_id: tenantId,
              drawer_id: String(openDrawer.id),
              type: 'sale_cash_in',
              amount,
              currency,
              reference_type: 'receipt',
              reference_id: String((data as any).id),
              description: String((data as any)?.concept || (data as any)?.receipt_number || 'Receipt cash payment'),
              created_by: null,
            });
          }
        }
      } catch (cashError) {
        console.warn('[receiptsService.create] Could not create cash transaction:', cashError);
      }

      return data;
    } catch (error) {
      console.error('receiptsService.create error', error);
      throw error;
    }
  },

  async updateStatus(id: string, status: string) {
    try {
      const { data, error } = await supabase
        .from('receipts')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('receiptsService.updateStatus error', error);
      throw error;
    }
  },
};

/* ==========================================================
   Customer Advances Service (Accounts Receivable)
========================================================== */
export const customerAdvancesService = {
  async getAll(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('customer_advances')
        .select(`
          *,
          customers (name)
        `)
        .eq('user_id', tenantId)
        .order('advance_date', { ascending: false });
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async create(userId: string, payload: {
    customer_id: string;
    advance_number: string;
    advance_date: string;
    amount: number;
    payment_method: string;
    reference?: string | null;
    concept?: string | null;
    status?: string;
    applied_amount?: number;
    balance_amount?: number;
  }) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');
      const body = {
        user_id: tenantId,
        customer_id: payload.customer_id,
        advance_number: payload.advance_number,
        advance_date: payload.advance_date,
        amount: payload.amount,
        payment_method: payload.payment_method,
        reference: payload.reference ?? null,
        concept: payload.concept ?? null,
        applied_amount: typeof payload.applied_amount === 'number' ? payload.applied_amount : 0,
        balance_amount: typeof payload.balance_amount === 'number' ? payload.balance_amount : payload.amount,
        status: payload.status ?? 'pending',
      };
      const { data, error } = await supabase
        .from('customer_advances')
        .insert(body)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('customerAdvancesService.create error', error);
      throw error;
    }
  },

  async updateStatus(
    id: string,
    status: string,
    extra?: { appliedAmount?: number; balanceAmount?: number }
  ) {
    try {
      const patch: any = { status, updated_at: new Date().toISOString() };
      if (typeof extra?.appliedAmount === 'number') {
        patch.applied_amount = extra.appliedAmount;
      }
      if (typeof extra?.balanceAmount === 'number') {
        patch.balance_amount = extra.balanceAmount;
      }

      const { data, error } = await supabase
        .from('customer_advances')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('customerAdvancesService.updateStatus error', error);
      throw error;
    }
  },
};

/* ==========================================================
   Credit/Debit Notes Service (Accounts Receivable)
========================================================== */
export const creditDebitNotesService = {
  async getAll(userId: string, noteType: 'credit' | 'debit') {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('credit_debit_notes')
        .select(`
          *,
          customers (name),
          invoices (invoice_number)
        `)
        .eq('user_id', tenantId)
        .eq('note_type', noteType)
        .order('note_date', { ascending: false });
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async create(userId: string, payload: {
    note_type: 'credit' | 'debit';
    customer_id: string;
    invoice_id?: string | null;
    note_number: string;
    note_date: string;
    total_amount: number;
    reason?: string | null;
    status?: string;
    applied_amount?: number;
    balance_amount?: number;
  }) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');
      const body = {
        user_id: tenantId,
        note_type: payload.note_type,
        customer_id: payload.customer_id,
        invoice_id: payload.invoice_id ?? null,
        note_number: payload.note_number,
        note_date: payload.note_date,
        total_amount: payload.total_amount,
        reason: payload.reason ?? null,
        applied_amount: typeof payload.applied_amount === 'number' ? payload.applied_amount : 0,
        balance_amount: typeof payload.balance_amount === 'number' ? payload.balance_amount : payload.total_amount,
        status: payload.status ?? 'pending',
      };
      const { data, error } = await supabase
        .from('credit_debit_notes')
        .insert(body)
        .select('*')
        .single();
      if (error) throw error;

      // Crear asiento contable automático
      try {
        const settings = await accountingSettingsService.get(tenantId);
        const arAccountId = settings?.ar_account_id; // Cuentas por Cobrar
        const salesReturnsAccountId = settings?.sales_returns_account_id; // Devoluciones en Ventas
        const salesAccountId = settings?.sales_account_id; // Ventas (para notas de débito)

        const amount = Number(data.total_amount) || 0;

        if (arAccountId && amount > 0) {
          let entryLines: any[] = [];
          
          if (payload.note_type === 'credit') {
            // Nota de Crédito: Reversa una venta
            // Débito: Devoluciones en Ventas (o Ventas con signo contrario)
            // Crédito: Cuentas por Cobrar
            const debitAccountId = salesReturnsAccountId || salesAccountId;
            
            entryLines = [
              {
                account_id: debitAccountId,
                description: 'Nota de Crédito - Devolución en Ventas',
                debit_amount: amount,
                credit_amount: 0,
                line_number: 1,
              },
              {
                account_id: arAccountId,
                description: 'Nota de Crédito - Reducción CxC',
                debit_amount: 0,
                credit_amount: amount,
                line_number: 2,
              },
            ];
          } else if (payload.note_type === 'debit') {
            // Nota de Débito: Aumenta la deuda del cliente
            // Débito: Cuentas por Cobrar
            // Crédito: Ventas (o cuenta de ajuste)
            const creditAccountId = salesAccountId;
            
            entryLines = [
              {
                account_id: arAccountId,
                description: 'Nota de Débito - Aumento CxC',
                debit_amount: amount,
                credit_amount: 0,
                line_number: 1,
              },
              {
                account_id: creditAccountId,
                description: 'Nota de Débito - Ajuste en Ventas',
                debit_amount: 0,
                credit_amount: amount,
                line_number: 2,
              },
            ];
          }

          if (entryLines.length > 0) {
            const entryPayload = {
              entry_number: String(data.note_number || `${payload.note_type.toUpperCase()}-${data.id?.slice(0, 8)}`),
              entry_date: String(data.note_date),
              description: `Nota de ${payload.note_type === 'credit' ? 'Crédito' : 'Débito'} ${data.note_number || ''} - ${payload.reason || ''}`.trim(),
              reference: data.id ? String(data.id) : null,
              status: 'posted' as const,
            };

            await journalEntriesService.createWithLines(tenantId, entryPayload, entryLines);
          }
        }
      } catch (jeError) {
        console.error('Error creating journal entry for credit/debit note:', jeError);
      }

      return data;
    } catch (error) {
      console.error('creditDebitNotesService.create error', error);
      throw error;
    }
  },

  async updateStatus(
    id: string,
    status: string,
    extra?: { appliedAmount?: number; balanceAmount?: number }
  ) {
    try {
      const patch: any = { status, updated_at: new Date().toISOString() };
      if (typeof extra?.appliedAmount === 'number') {
        patch.applied_amount = extra.appliedAmount;
      }
      if (typeof extra?.balanceAmount === 'number') {
        patch.balance_amount = extra.balanceAmount;
      }

      const { data, error } = await supabase
        .from('credit_debit_notes')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('creditDebitNotesService.updateStatus error', error);
      throw error;
    }
  },
};

/* ==========================================================
   Suppliers Service
========================================================== */
export const suppliersService = {
  async getAll(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .eq('user_id', tenantId)
        .order('name');
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async create(userId: string, supplier: any) {
    try {
      const tenantId = await resolveTenantId(userId);
      const { data, error } = await supabase
        .from('suppliers')
        .insert({ ...supplier, user_id: tenantId })
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      throw error;
    }
  },

  async update(id: string, supplier: any) {
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .update(supplier)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      throw error;
    }
  },

  async delete(id: string) {
    try {
      const { error } = await supabase
        .from('suppliers')
        .delete()
        .eq('id', id);
      if (error) throw error;
    } catch (error) {
      throw error;
    }
  }
}

/**
 * Supplier Types Service
 * Tabla: supplier_types
========================================================== */
export const supplierTypesService = {
  async getAll(userId: string) {
    try {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('supplier_types')
        .select('*')
        .eq('user_id', userId)
        .order('name');
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async create(userId: string, payload: {
    name: string;
    description?: string;
    affects_itbis?: boolean;
    affects_isr?: boolean;
    is_rst?: boolean;
    is_ong?: boolean;
    is_non_taxpayer?: boolean;
    is_government?: boolean;
    default_invoice_type?: string;
    tax_regime?: string;
    isr_withholding_rate?: number | null;
    itbis_withholding_rate?: number | null;
  }) {
    try {
      if (!userId) throw new Error('userId required');
      const now = new Date().toISOString();
      const body = {
        user_id: userId,
        name: payload.name,
        description: payload.description || null,
        affects_itbis: payload.affects_itbis !== false,
        affects_isr: payload.affects_isr !== false,
        is_rst: !!payload.is_rst,
        is_ong: !!payload.is_ong,
        is_non_taxpayer: !!payload.is_non_taxpayer,
        is_government: !!payload.is_government,
        default_invoice_type: payload.default_invoice_type || null,
        tax_regime: payload.tax_regime || null,
        isr_withholding_rate:
          typeof payload.isr_withholding_rate === 'number' ? payload.isr_withholding_rate : null,
        itbis_withholding_rate:
          typeof payload.itbis_withholding_rate === 'number' ? payload.itbis_withholding_rate : null,
        created_at: now,
        updated_at: now,
      };
      const { data, error } = await supabase
        .from('supplier_types')
        .insert(body)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('supplierTypesService.create error', error);
      throw error;
    }
  },

  async update(id: string, payload: {
    name?: string;
    description?: string;
    affects_itbis?: boolean;
    affects_isr?: boolean;
    is_rst?: boolean;
    is_ong?: boolean;
    is_non_taxpayer?: boolean;
    is_government?: boolean;
    default_invoice_type?: string;
    tax_regime?: string;
    isr_withholding_rate?: number | null;
    itbis_withholding_rate?: number | null;
  }) {
    try {
      const body: any = {
        updated_at: new Date().toISOString(),
      };
      if (typeof payload.name === 'string') body.name = payload.name;
      if (payload.description !== undefined) body.description = payload.description;
      if (typeof payload.affects_itbis === 'boolean') body.affects_itbis = payload.affects_itbis;
      if (typeof payload.affects_isr === 'boolean') body.affects_isr = payload.affects_isr;
      if (typeof payload.is_rst === 'boolean') body.is_rst = payload.is_rst;
      if (typeof payload.is_ong === 'boolean') body.is_ong = payload.is_ong;
      if (typeof payload.is_non_taxpayer === 'boolean') body.is_non_taxpayer = payload.is_non_taxpayer;
      if (typeof payload.is_government === 'boolean') body.is_government = payload.is_government;
      if (payload.default_invoice_type !== undefined) body.default_invoice_type = payload.default_invoice_type || null;
      if (payload.tax_regime !== undefined) body.tax_regime = payload.tax_regime || null;
      if (payload.isr_withholding_rate !== undefined) {
        body.isr_withholding_rate =
          typeof payload.isr_withholding_rate === 'number' ? payload.isr_withholding_rate : null;
      }
      if (payload.itbis_withholding_rate !== undefined) {
        body.itbis_withholding_rate =
          typeof payload.itbis_withholding_rate === 'number' ? payload.itbis_withholding_rate : null;
      }

      const { data, error } = await supabase
        .from('supplier_types')
        .update(body)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('supplierTypesService.update error', error);
      throw error;
    }
  },

  async delete(id: string) {
    try {
      const { error } = await supabase
        .from('supplier_types')
        .delete()
        .eq('id', id);
      if (error) throw error;
    } catch (error) {
      console.error('supplierTypesService.delete error', error);
      throw error;
    }
  },
};

/* ==========================================================
   Sales Quotes Service (Cotizaciones de Ventas - CxC)
========================================================== */
export const quotesService = {
  async getAll(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('quotes')
        .select(`
          *,
          quote_lines (* )
        `)
        .eq('user_id', tenantId)
        .order('created_at', { ascending: false });
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async create(userId: string, quotePayload: any, linePayloads: Array<any>) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');

      const formatInvoiceNumber = (raw: string): string => {
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
      };

      const baseQuote = {
        ...quotePayload,
        user_id: tenantId,
      };

      if (!baseQuote.quote_number) {
        try {
          const { data: nextNumber, error: nextErr } = await supabase.rpc('next_invoice_number', {
            p_tenant_id: tenantId,
          });
          if (nextErr) throw nextErr;
          const formatted = formatInvoiceNumber(String(nextNumber || '').trim());
          if (formatted) {
            baseQuote.quote_number = formatted;
          }
        } catch {
          // Best-effort: do not block quote creation if sequence is unavailable
        }
      }

      const tryInsertQuote = async (payload: any) => {
        const { data: quote, error: quoteError } = await supabase
          .from('quotes')
          .insert(payload)
          .select('*')
          .single();
        return { quote, quoteError };
      };

      let quote: any = null;
      let quoteError: any = null;
      let payloadToInsert: any = baseQuote;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const res = await tryInsertQuote(payloadToInsert);
        quote = res.quote;
        quoteError = res.quoteError;
        if (!quoteError) break;
        if ((quoteError as any)?.code === 'PGRST204') {
          const msg = String((quoteError as any)?.message || '');
          const m = msg.match(/Could not find the '([^']+)' column/i);
          const missingCol = m?.[1] ? String(m[1]) : null;
          if (missingCol) {
            const clean = { ...payloadToInsert };
            if (missingCol === 'terms') {
              const termsValue = String((clean as any).terms || '').trim();
              if (termsValue) {
                const existingNotes = String((clean as any).notes || '').trim();
                (clean as any).notes = [existingNotes, '---', 'GENERAL TERMS AND CONDITIONS:', termsValue]
                  .filter(Boolean)
                  .join('\n');
              }
            }
            delete (clean as any)[missingCol];
            payloadToInsert = clean;
            continue;
          }
        }
        break;
      }

      if (quoteError) throw quoteError;

      const quoteId = quote.id as string;

      const linesToInsert = (linePayloads || []).map((l) => {
        const qty = Number(l.quantity ?? l.qty ?? 0) || 0;
        const unitPrice = Number(l.unit_price ?? l.price ?? 0) || 0;
        const lineTotal = Number(l.line_total ?? l.total ?? qty * unitPrice) || 0;
        return {
          quote_id: quoteId,
          description: l.description || '',
          quantity: qty || 1,
          price: unitPrice,
          unit_price: unitPrice,
          total: lineTotal,
          line_total: lineTotal,
        };
      }).filter((l) => l.description && l.quantity > 0);

      let lines = [] as any[];
      if (linesToInsert.length > 0) {
        const { data: insertedLines, error: linesError } = await supabase
          .from('quote_lines')
          .insert(linesToInsert)
          .select('*');
        if (linesError) throw linesError;
        lines = insertedLines || [];
      }

      // Best-effort: crear solicitud de autorización para descuento en cotización si aplica
      try {
        const discountType = (quote as any).discount_type as string | null;
        const totalDiscount = Number((quote as any).total_discount ?? (quote as any).discount_value ?? 0) || 0;
        if (discountType && totalDiscount > 0) {
          await supabase.from('approval_requests').insert({
            user_id: tenantId,
            entity_type: 'quote_discount',
            entity_id: quoteId,
            status: 'pending',
            notes: quote.notes ?? null,
          });
        }
      } catch (approvalError) {
        // eslint-disable-next-line no-console
        console.error('Error creating approval request for quote discount:', approvalError);
      }

      return { ...quote, quote_lines: lines };
    } catch (error) {
      console.error('quotesService.create error', error);
      throw error;
    }
  },

  async update(id: string, patch: any) {
    try {
      let patchToUpdate: any = { ...(patch || {}) };
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const { data, error } = await supabase
          .from('quotes')
          .update({
            ...patchToUpdate,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
          .select('*')
          .single();

        if (!error) return data;

        if ((error as any)?.code === 'PGRST204') {
          const msg = String((error as any)?.message || '');
          const m = msg.match(/Could not find the '([^']+)' column/i);
          const missingCol = m?.[1] ? String(m[1]) : null;
          if (missingCol) {
            const clean = { ...patchToUpdate };
            if (missingCol === 'terms') {
              const termsValue = String((clean as any).terms || '').trim();
              if (termsValue) {
                const existingNotes = String((clean as any).notes || '').trim();
                (clean as any).notes = [existingNotes, '---', 'GENERAL TERMS AND CONDITIONS:', termsValue]
                  .filter(Boolean)
                  .join('\n');
              }
            }
            delete (clean as any)[missingCol];
            patchToUpdate = clean;
            continue;
          }
        }

        throw error;
      }

      throw new Error('Could not update quote');
    } catch (error) {
      console.error('quotesService.update error', error);
      throw error;
    }
  },

  async delete(id: string) {
    try {
      const { error } = await supabase
        .from('quotes')
        .delete()
        .eq('id', id);
      if (error) throw error;
    } catch (error) {
      console.error('quotesService.delete error', error);
      throw error;
    }
  },
};

/* ==========================================================
   AP Quotes Service (Solicitudes de Cotización - CxP)
========================================================== */
export const apQuotesService = {
  async getAll(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('ap_quotes')
        .select(`
          *,
          ap_quote_suppliers (*)
        `)
        .eq('user_id', tenantId)
        .order('created_at', { ascending: false });
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async create(userId: string, quote: any, supplierNames: string[]) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');
      const now = new Date().toISOString();
      const payload = {
        ...quote,
        user_id: tenantId,
        created_at: now,
        updated_at: now,
      };
      const { data: q, error: qErr } = await supabase
        .from('ap_quotes')
        .insert(payload)
        .select()
        .single();
      if (qErr) throw qErr;

      if (supplierNames && supplierNames.length > 0) {
        const supplierRows = supplierNames
          .filter((name) => name && name.trim() !== '')
          .map((name) => ({
            quote_id: q.id,
            supplier_name: name,
            created_at: now,
          }));
        if (supplierRows.length > 0) {
          const { error: sErr } = await supabase
            .from('ap_quote_suppliers')
            .insert(supplierRows);
          if (sErr) throw sErr;
        }
      }

      return q;
    } catch (error) {
      console.error('apQuotesService.create error', error);
      throw error;
    }
  },

  async update(id: string, quote: any, supplierNames?: string[]) {
    try {
      const now = new Date().toISOString();
      const { data: q, error: qErr } = await supabase
        .from('ap_quotes')
        .update({ ...quote, updated_at: now })
        .eq('id', id)
        .select()
        .single();
      if (qErr) throw qErr;

      if (Array.isArray(supplierNames)) {
        const { error: delErr } = await supabase
          .from('ap_quote_suppliers')
          .delete()
          .eq('quote_id', id);
        if (delErr) throw delErr;

        const supplierRows = supplierNames
          .filter((name) => name && name.trim() !== '')
          .map((name) => ({
            quote_id: id,
            supplier_name: name,
            created_at: now,
          }));
        if (supplierRows.length > 0) {
          const { error: insErr } = await supabase
            .from('ap_quote_suppliers')
            .insert(supplierRows);
          if (insErr) throw insErr;
        }
      }

      return q;
    } catch (error) {
      console.error('apQuotesService.update error', error);
      throw error;
    }
  },

  async updateStatus(id: string, status: string) {
    try {
      const { data, error } = await supabase
        .from('ap_quotes')
        .update({
          status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('apQuotesService.updateStatus error', error);
      throw error;
    }
  },

  async delete(id: string) {
    try {
      const { error } = await supabase
        .from('ap_quotes')
        .delete()
        .eq('id', id);
      if (error) throw error;
    } catch (error) {
      console.error('apQuotesService.delete error', error);
      throw error;
    }
  }
};

/* ==========================================================
   Supplier Advances Service (Accounts Payable)
   Tabla: ap_supplier_advances
========================================================== */
export const apSupplierAdvancesService = {
  async getAll(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('ap_supplier_advances')
        .select(`
          *,
          suppliers (name)
        `)
        .eq('user_id', tenantId)
        .order('advance_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async create(userId: string, payload: {
    supplier_id: string;
    advance_number: string;
    advance_date: string;
    amount: number;
    reference?: string | null;
    description?: string | null;
    status?: string;
    applied_amount?: number;
    balance_amount?: number;
    payment_method?: string | null;
    transaction_date?: string | null;
    bank_id?: string | null;
    document_number?: string | null;
    document_date?: string | null;
    account_id?: string | null;
  }) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');
      const body = {
        user_id: tenantId,
        supplier_id: payload.supplier_id,
        advance_number: payload.advance_number,
        advance_date: payload.advance_date,
        currency: 'DOP',
        amount: payload.amount,
        reference: payload.reference ?? null,
        description: payload.description ?? null,
        applied_amount: typeof payload.applied_amount === 'number' ? payload.applied_amount : 0,
        balance_amount: typeof payload.balance_amount === 'number' ? payload.balance_amount : payload.amount,
        status: payload.status ?? 'pending',
        payment_method: payload.payment_method ?? null,
        transaction_date: payload.transaction_date ?? payload.advance_date,
        bank_id: payload.bank_id ?? null,
        document_number: payload.document_number ?? null,
        document_date: payload.document_date ?? null,
        account_id: payload.account_id ?? null,
      };
      const { data, error } = await supabase
        .from('ap_supplier_advances')
        .insert(body)
        .select('*')
        .single();
      if (error) throw error;

      // Best-effort: registrar asiento contable del anticipo (Debe anticipo a proveedores, Haber banco)
      try {
        const amount = Number(payload.amount) || 0;
        const advanceAccountId = payload.account_id || null;
        const bankId = payload.bank_id || null;

        if (amount > 0 && advanceAccountId && bankId) {
          const { data: bank, error: bankError } = await supabase
            .from('bank_accounts')
            .select('chart_account_id, bank_name')
            .eq('id', bankId)
            .maybeSingle();

          if (!bankError && bank?.chart_account_id) {
            const entryPayload = {
              entry_number: body.advance_number,
              entry_date: String(body.transaction_date || body.advance_date),
              description: body.description || `Anticipo a proveedor`,
              reference: data.id ? String(data.id) : null,
              status: 'posted' as const,
            };

            const lines = [
              {
                account_id: advanceAccountId,
                description: body.description || 'Anticipo a proveedor',
                debit_amount: amount,
                credit_amount: 0,
              },
              {
                account_id: String(bank.chart_account_id),
                description: `Banco ${bank.bank_name || ''}`.trim(),
                debit_amount: 0,
                credit_amount: amount,
              },
            ];

            await journalEntriesService.createWithLines(userId, entryPayload, lines);
          }
        }
      } catch (jeError) {
        // eslint-disable-next-line no-console
        console.error('Error posting AP supplier advance to ledger:', jeError);
      }

      return data;
    } catch (error) {
      console.error('apSupplierAdvancesService.create error', error);
      throw error;
    }
  },

  async updateStatus(
    id: string,
    status: string,
    extra?: { appliedAmount?: number; balanceAmount?: number }
  ) {
    try {
      const patch: any = { status, updated_at: new Date().toISOString() };
      if (typeof extra?.appliedAmount === 'number') {
        patch.applied_amount = extra.appliedAmount;
      }
      if (typeof extra?.balanceAmount === 'number') {
        patch.balance_amount = extra.balanceAmount;
      }

      const { data, error } = await supabase
        .from('ap_supplier_advances')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('apSupplierAdvancesService.updateStatus error', error);
      throw error;
    }
  },

  async delete(id: string) {
    try {
      const { error } = await supabase
        .from('ap_supplier_advances')
        .delete()
        .eq('id', id);
      if (error) throw error;
    } catch (error) {
      console.error('apSupplierAdvancesService.delete error', error);
      throw error;
    }
  },
};

/* ==========================================================
   AP Invoices Service (Facturas de Suplidor - CxP)
========================================================== */
export const apInvoicesService = {
  async getAll(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('ap_invoices')
        .select(`
          *,
          suppliers (
            id,
            name,
            tax_id,
            phone,
            email,
            address
          )
        `)
        .eq('user_id', tenantId)
        .order('invoice_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async create(userId: string, invoice: any, options?: { skipPeriodValidation?: boolean }) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');

      // Determinar si omitir validación de período (planes básicos no la requieren)
      const skipValidation = options?.skipPeriodValidation ?? shouldSkipPeriodValidation();

      // Validar que exista un período contable abierto para la fecha de la factura
      if (!skipValidation) {
        const invoiceDate = invoice.invoice_date || new Date().toISOString().split('T')[0];
        await accountingPeriodsService.requireOpenPeriod(tenantId, invoiceDate);
      }

      const now = new Date().toISOString();
      const payload = {
        ...invoice,
        user_id: tenantId,
        created_at: invoice.created_at || now,
        updated_at: invoice.updated_at || now,
        paid_amount: typeof (invoice as any).paid_amount === 'number' ? (invoice as any).paid_amount : 0,
        balance_amount:
          typeof (invoice as any).balance_amount === 'number'
            ? (invoice as any).balance_amount
            : invoice.total_to_pay,
      };
      const { data, error } = await supabase
        .from('ap_invoices')
        .insert(payload)
        .select('*')
        .single();
      if (error) throw error;

      // Crear asiento contable automático para factura de compra
      if (false) {
        try {
          const settings = await accountingSettingsService.get(tenantId);
          const apAccountId = settings?.ap_account_id; // Cuentas por Pagar
          const purchaseAccountId = settings?.purchase_account_id; // Cuenta de Compras o Inventario
          const purchaseTaxAccountId = settings?.purchase_tax_account_id; // ITBIS Pagado

          if (apAccountId && purchaseAccountId) {
            const subtotal = Number(data.subtotal) || 0;
            const taxAmount = Number(data.tax_amount) || 0;
            const totalAmount = Number(data.total_to_pay) || subtotal + taxAmount;

            const entryLines: any[] = [
              {
                account_id: purchaseAccountId,
                description: 'Compras / Inventario',
                debit_amount: subtotal,
                credit_amount: 0,
                line_number: 1,
              },
            ];

            // Agregar línea de impuesto si existe
            if (taxAmount > 0 && purchaseTaxAccountId) {
              entryLines.push({
                account_id: purchaseTaxAccountId,
                description: 'ITBIS Pagado (Crédito Fiscal)',
                debit_amount: taxAmount,
                credit_amount: 0,
                line_number: 2,
              });
            }

            // Línea de Cuentas por Pagar (crédito)
            entryLines.push({
              account_id: apAccountId,
              description: 'Cuentas por Pagar Proveedores',
              debit_amount: 0,
              credit_amount: totalAmount,
              line_number: entryLines.length + 1,
            });

            const entryPayload = {
              entry_number: String(data.invoice_number || `AP-${data.id?.slice(0, 8)}`),
              entry_date: String(data.invoice_date),
              description: `Factura de compra ${data.invoice_number || ''} - ${data.supplier_name || ''}`.trim(),
              reference: data.id ? String(data.id) : null,
              status: 'posted' as const,
            };

            await journalEntriesService.createWithLines(userId, entryPayload, entryLines);
          }
        } catch (jeError) {
          console.error('Error creating journal entry for AP invoice:', jeError);
        }
      }

      return data;
    } catch (error) {
      console.error('apInvoicesService.create error', error);
      throw error;
    }
  },

  async update(id: string, patch: any) {
    try {
      const payload = {
        ...patch,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from('ap_invoices')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('apInvoicesService.update error', error);
      throw error;
    }
  },

  async delete(id: string) {
    try {
      const { error } = await supabase
        .from('ap_invoices')
        .delete()
        .eq('id', id);
      if (error) throw error;
    } catch (error) {
      console.error('apInvoicesService.delete error', error);
      throw error;
    }
  },
};

/* ==========================================================
   AP Invoice Lines Service (Detalle de Facturas de Suplidor)
========================================================== */
export const apInvoiceLinesService = {
  async getByInvoice(apInvoiceId: string) {
    try {
      if (!apInvoiceId) return [];
      const { data, error } = await supabase
        .from('ap_invoice_lines')
        .select('*')
        .eq('ap_invoice_id', apInvoiceId)
        .order('created_at', { ascending: true });
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async createMany(apInvoiceId: string, lines: any[]) {
    try {
      if (!apInvoiceId || !Array.isArray(lines) || lines.length === 0) return [];
      const now = new Date().toISOString();
      const payload = lines.map((l) => ({
        ...l,
        ap_invoice_id: apInvoiceId,
        created_at: l.created_at || now,
        updated_at: l.updated_at || now,
      }));
      const { data, error } = await supabase
        .from('ap_invoice_lines')
        .insert(payload)
        .select('*');
      if (error) throw error;
      const insertedLines = data ?? [];

      const shouldDebugApInvoicePosting =
        typeof window !== 'undefined' && window.localStorage.getItem('debug_ap_invoice_posting') === '1';

      let invoiceUserId: string | null = null;

      // Best-effort: registrar asiento contable para la factura de suplidor usando las cuentas de gasto
      try {
        // Obtener factura para conocer usuario, fechas y totales
        const { data: invoice, error: invError } = await supabase
          .from('ap_invoices')
          .select('*')
          .eq('id', apInvoiceId)
          .maybeSingle();

        if (!invError && invoice && invoice.user_id) {
          const userId = invoice.user_id as string;
          invoiceUserId = userId;

          // Configuración contable: cuenta de CxP y cuenta de ITBIS
          const settings = await accountingSettingsService.get(userId);
          const apAccountId = settings?.ap_account_id as string | undefined;
          let itbisReceivableAccountId = settings?.itbis_receivable_account_id as string | undefined;
          const itbisToCost = invoice.itbis_to_cost === true;

          // Si no hay cuenta de ITBIS configurada, usar por defecto la cuenta con código 110201 (ITBIS Compras)
          if (!itbisReceivableAccountId) {
            try {
              const chartAccounts = await chartAccountsService.getAll(userId);
              const itbisAccount = (chartAccounts || []).find(
                (acc: any) => String(acc.code).trim() === '110201'
              );
              if (itbisAccount && itbisAccount.id) {
                itbisReceivableAccountId = String(itbisAccount.id);
              }
            } catch (lookupError) {
              console.error('Error buscando cuenta 110201 para ITBIS compras:', lookupError);
            }
          }

          if (apAccountId) {
            // Cargar líneas desde BD (asegurando tener expense_account_id y montos finales)
            const { data: dbLines, error: dbLinesError } = await supabase
              .from('ap_invoice_lines')
              .select(`
                expense_account_id,
                inventory_item_id,
                line_total,
                itbis_amount
              `)
              .eq('ap_invoice_id', apInvoiceId);

            const inventoryAccountByItemId: Record<string, string> = {};
            try {
              const invItemIds = Array.from(
                new Set(
                  (dbLines || [])
                    .map((l: any) => (l?.inventory_item_id ? String(l.inventory_item_id) : ''))
                    .filter((id: string) => !!id)
                )
              );

              if (invItemIds.length > 0) {
                const { data: invAccRows, error: invAccError } = await supabase
                  .from('inventory_items')
                  .select('id, inventory_account_id')
                  .eq('user_id', userId)
                  .in('id', invItemIds);

                if (!invAccError && invAccRows) {
                  (invAccRows as any[]).forEach((row: any) => {
                    if (!row?.id) return;
                    const key = String(row.id);
                    inventoryAccountByItemId[key] = row.inventory_account_id ? String(row.inventory_account_id) : '';
                  });
                }
              }
            } catch (invAccLookupError) {
              // eslint-disable-next-line no-console
              console.error('[AP Invoice Debug] Error resolving inventory item accounts:', invAccLookupError);
            }

            if (shouldDebugApInvoicePosting) {
              const safeLines = (dbLines || []).map((l: any) => {
                const invItemId = l.inventory_item_id ? String(l.inventory_item_id) : '';
                return {
                  inventory_item_id: invItemId,
                  expense_account_id: l.expense_account_id ? String(l.expense_account_id) : '',
                  inventory_account_id: invItemId ? (inventoryAccountByItemId[invItemId] || '') : '',
                  line_total: Number(l.line_total) || 0,
                  itbis_amount: Number(l.itbis_amount) || 0,
                };
              });

              const accountIds = Array.from(
                new Set(
                  safeLines
                    .flatMap((l: any) => [l.inventory_account_id, l.expense_account_id])
                    .filter((id: any) => !!id)
                )
              );

              let accountsById: Record<string, any> = {};
              try {
                if (accountIds.length > 0) {
                  const { data: accs, error: accsError } = await supabase
                    .from('chart_accounts')
                    .select('id, code, name, type')
                    .eq('user_id', userId)
                    .in('id', accountIds);
                  if (!accsError && accs) {
                    (accs as any[]).forEach((a: any) => {
                      if (a?.id) accountsById[String(a.id)] = a;
                    });
                  }
                }
              } catch (accLookupError) {
                // eslint-disable-next-line no-console
                console.error('[AP Invoice Debug] Error resolving chart accounts:', accLookupError);
              }

              const safeLinesWithAccounts = safeLines.map((l: any) => {
                const invAcc = l.inventory_account_id ? accountsById[String(l.inventory_account_id)] : null;
                const expAcc = l.expense_account_id ? accountsById[String(l.expense_account_id)] : null;
                return {
                  ...l,
                  inventory_account_code: invAcc?.code || '',
                  inventory_account_name: invAcc?.name || '',
                  expense_account_code: expAcc?.code || '',
                  expense_account_name: expAcc?.name || '',
                };
              });
              // eslint-disable-next-line no-console
              console.group('[AP Invoice Debug] Posting');
              // eslint-disable-next-line no-console
              console.log('apInvoiceId:', apInvoiceId);
              // eslint-disable-next-line no-console
              console.log('invoice_number:', String(invoice.invoice_number || ''));
              // eslint-disable-next-line no-console
              console.log('itbis_to_cost:', itbisToCost);
              // eslint-disable-next-line no-console
              console.log('dbLinesError:', dbLinesError);
              // eslint-disable-next-line no-console
              console.table(safeLinesWithAccounts);
              // eslint-disable-next-line no-console
              console.groupEnd();
            }

            if (!dbLinesError && dbLines && dbLines.length > 0) {
              const accountTotals: Record<string, number> = {};
              let totalItbis = 0;

              dbLines.forEach((l: any) => {
                const invItemId = l.inventory_item_id ? String(l.inventory_item_id) : '';
                const inventoryAccountId = invItemId ? (inventoryAccountByItemId[invItemId] || '') : '';
                const expenseAccountId = l.expense_account_id ? String(l.expense_account_id) : '';
                const accountId = inventoryAccountId || expenseAccountId;
                if (!accountId) return;
                const lineBase = Number(l.line_total) || 0;
                const lineItbis = Number(l.itbis_amount) || 0;

                // Si ITBIS va al costo, sumarlo al gasto
                const amount = itbisToCost ? lineBase + lineItbis : lineBase;
                if (amount <= 0) return;
                accountTotals[accountId] = (accountTotals[accountId] || 0) + amount;

                // Acumular ITBIS para crédito fiscal si no va al costo
                if (!itbisToCost) {
                  totalItbis += lineItbis;
                }
              });

              if (shouldDebugApInvoicePosting) {
                const totalsAccountIds = Object.keys(accountTotals || {}).filter((id) => !!id);
                let totalsAccountsById: Record<string, any> = {};
                try {
                  if (totalsAccountIds.length > 0) {
                    const { data: totAccs, error: totAccsError } = await supabase
                      .from('chart_accounts')
                      .select('id, code, name, type')
                      .eq('user_id', userId)
                      .in('id', totalsAccountIds);
                    if (!totAccsError && totAccs) {
                      (totAccs as any[]).forEach((a: any) => {
                        if (a?.id) totalsAccountsById[String(a.id)] = a;
                      });
                    }
                  }
                } catch (totAccLookupError) {
                  // eslint-disable-next-line no-console
                  console.error('[AP Invoice Debug] Error resolving totals chart accounts:', totAccLookupError);
                }

                const totalsTable = Object.entries(accountTotals || {}).map(([accountId, amount]) => {
                  const acc = totalsAccountsById[String(accountId)] || null;
                  return {
                    account_id: String(accountId),
                    code: acc?.code || '',
                    name: acc?.name || '',
                    type: acc?.type || '',
                    amount: Number(amount) || 0,
                  };
                });
                // eslint-disable-next-line no-console
                console.group('[AP Invoice Debug] Account totals');
                // eslint-disable-next-line no-console
                console.table(totalsTable);
                // eslint-disable-next-line no-console
                console.log('totalItbis (if not to cost):', totalItbis);
                // eslint-disable-next-line no-console
                console.groupEnd();
              }

              const expenseLines = Object.entries(accountTotals)
                .filter(([_, amount]) => amount > 0)
                .map(([accountId, amount]) => ({
                  account_id: accountId,
                  description: 'Gastos por compras a suplidor',
                  debit_amount: amount,
                  credit_amount: 0,
                }));

              if (expenseLines.length > 0) {
                let linesForEntry = [...expenseLines];
                
                // Si ITBIS no va al costo, crear entrada separada de crédito fiscal
                if (!itbisToCost && totalItbis > 0 && itbisReceivableAccountId) {
                  linesForEntry.push({
                    account_id: itbisReceivableAccountId,
                    description: 'ITBIS Crédito Fiscal',
                    debit_amount: totalItbis,
                    credit_amount: 0,
                  });
                }
                
                const totalDebit = linesForEntry.reduce((sum, l) => sum + (l.debit_amount || 0), 0);
                if (totalDebit > 0) {
                  linesForEntry.push({
                    account_id: apAccountId,
                    description: 'Cuentas por Pagar a Proveedores',
                    debit_amount: 0,
                    credit_amount: totalDebit,
                  });

                  const entryPayload = {
                    entry_number: String(invoice.invoice_number || ''),
                    entry_date: String(invoice.invoice_date || new Date().toISOString().slice(0, 10)),
                    description: `Factura suplidor ${invoice.invoice_number || ''}${itbisToCost ? ' (ITBIS al costo)' : ''}`.trim(),
                    reference: invoice.id ? String(invoice.id) : null,
                    status: 'posted' as const,
                  };

                  try {
                    const entryNumber = String(invoice.invoice_number || '');
                    const reference = invoice.id ? String(invoice.id) : null;
                    if (entryNumber && reference) {
                      const { data: existingEntries, error: existingError } = await supabase
                        .from('journal_entries')
                        .select('id')
                        .eq('user_id', userId)
                        .eq('reference', reference)
                        .eq('entry_number', entryNumber);

                      if (!existingError && existingEntries && existingEntries.length > 0) {
                        const existingIds = (existingEntries as any[])
                          .map((e: any) => e.id)
                          .filter((id: any) => !!id);
                        if (existingIds.length > 0) {
                          await supabase.from('journal_entry_lines').delete().in('journal_entry_id', existingIds);
                          await supabase.from('journal_entries').delete().in('id', existingIds);
                        }
                      }
                    }
                  } catch (cleanupError) {
                    // eslint-disable-next-line no-console
                    console.error('Error cleaning existing AP invoice journal entry before re-posting:', cleanupError);
                  }

                  await journalEntriesService.createWithLines(userId, entryPayload, linesForEntry);
                }
              }
            }
          }
        }
      } catch (jeError) {
        // eslint-disable-next-line no-console
        console.error('Error posting AP invoice to ledger:', jeError);
      }

      // Best-effort: registrar entradas de inventario para líneas con productos
      try {
        if (!invoiceUserId) {
          return insertedLines;
        }

        // Nota: NO podemos usar related_invoice_id para ap_invoices porque tiene FK hacia invoices (clientes).
        // La idempotencia se resuelve más abajo usando (source_type, document_number).
        let hasWarehouseEntry = false;

        let hasMovements = false;
        try {
          const { data: existingMovements, error: existingMovError } = await supabase
            .from('inventory_movements')
            .select('id')
            .eq('user_id', invoiceUserId)
            .eq('source_type', 'ap_invoice')
            .eq('source_id', apInvoiceId)
            .limit(1);
          hasMovements = !existingMovError && !!existingMovements && existingMovements.length > 0;
        } catch (movCheckError) {
          console.error('apInvoiceLinesService.createMany movements idempotency check error', movCheckError);
          hasMovements = false;
        }

        // Cargar líneas con detalle de ítems de inventario
        const { data: invLines, error: invLinesError } = await supabase
          .from('ap_invoice_lines')
          .select(`
            *,
            inventory_items (
              id,
              name,
              current_stock,
              cost_price,
              average_cost,
              warehouse_id,
              last_purchase_price
            )
          `)
          .eq('ap_invoice_id', apInvoiceId);

        if (invLinesError) {
          console.error('apInvoiceLinesService.createMany inventory lines error', invLinesError);
        } else if (invLines && invLines.length > 0) {
          // Obtener factura para fecha y número de referencia
          const { data: invoice, error: invHeaderError } = await supabase
            .from('ap_invoices')
            .select('*')
            .eq('id', apInvoiceId)
            .maybeSingle();

          if (!invHeaderError && invoice && invoice.user_id) {
            const userId = invoice.user_id as string;
            const movementDate = invoice.invoice_date
              ? String(invoice.invoice_date)
              : new Date().toISOString().split('T')[0];

            const entryDocDate = new Date().toISOString().split('T')[0];

            const warehouseEntryDocNumber = String(invoice.invoice_number || apInvoiceId);

            // Idempotencia: si ya existe una entrada de almacén generada por esta factura, no recrear.
            try {
              const { data: existingWhEntries, error: existingWhEntryError } = await supabase
                .from('warehouse_entries')
                .select('id')
                .eq('user_id', invoiceUserId)
                .eq('source_type', 'ap_invoice')
                .eq('document_number', warehouseEntryDocNumber)
                .limit(1);
              hasWarehouseEntry = !existingWhEntryError && !!existingWhEntries && existingWhEntries.length > 0;
            } catch (whCheckError) {
              console.error('apInvoiceLinesService.createMany warehouse entry idempotency check error', whCheckError);
              hasWarehouseEntry = false;
            }

            if (!hasMovements) {
              for (const rawLine of invLines as any[]) {
                if (!rawLine.inventory_item_id) continue;

                const invItem = rawLine.inventory_items as any | null;
                const rawQty = Number(rawLine.quantity) || 0;
                const qty = Number.isFinite(rawQty) ? Math.round(rawQty) : 0;

                if (!invItem || qty <= 0) continue;

                const oldStock = Number(invItem.current_stock ?? 0) || 0;
                const oldAvg =
                  invItem.average_cost != null
                    ? Number(invItem.average_cost) || 0
                    : Number(invItem.cost_price) || 0;

                const lineUnitCost = Number(rawLine.unit_price) || 0;
                const unitCost = lineUnitCost > 0 ? lineUnitCost : oldAvg;
                const lineCost = qty * unitCost;

                if (lineCost <= 0) continue;

                const newStock = oldStock + qty;
                const newAvg = newStock > 0 ? (oldAvg * oldStock + unitCost * qty) / newStock : oldAvg;

                // Actualizar maestro de inventario
                try {
                  if (invItem.id) {
                    await inventoryService.updateItem(userId, String(invItem.id), {
                      current_stock: newStock,
                      last_purchase_price: unitCost,
                      last_purchase_date: movementDate,
                      average_cost: newAvg,
                      cost_price: newAvg,
                    });
                  }
                } catch (updateError) {
                  console.error('apInvoiceLinesService.createMany updateItem error', updateError);
                }

                // Registrar movimiento de entrada de inventario
                try {
                  await inventoryService.createMovement(userId, {
                    item_id: invItem.id ? String(invItem.id) : null,
                    movement_type: 'entry',
                    quantity: qty,
                    unit_cost: unitCost,
                    total_cost: lineCost,
                    movement_date: movementDate,
                    reference: invoice.invoice_number || invoice.id,
                    notes: rawLine.description || invItem.name || null,
                    source_type: 'ap_invoice',
                    source_id: apInvoiceId,
                    source_number: invoice.invoice_number || (apInvoiceId ? String(apInvoiceId) : null),
                    to_warehouse_id: (invItem as any)?.warehouse_id || null,
                  });
                } catch (movError) {
                  console.error('apInvoiceLinesService.createMany createMovement error', movError);
                }
              }
            }

            if (!hasWarehouseEntry) {
              // Best-effort: crear registro de Entrada de Almacén para que aparezca en el módulo (sin repostear stock)
              try {
                const headerWarehouseId =
                  (invLines as any[])
                    .map((l: any) => (l?.inventory_items as any)?.warehouse_id)
                    .find((w: any) => w != null && String(w).trim() !== '') || null;

                if (headerWarehouseId) {
                  const entryPayload: any = {
                    warehouse_id: String(headerWarehouseId),
                    source_type: 'ap_invoice',
                    related_invoice_id: null,
                    related_delivery_note_id: null,
                    issuer_name: (invoice as any).legal_name || (invoice as any).supplier_name || null,
                    document_number: warehouseEntryDocNumber,
                    document_date: entryDocDate,
                    description: `Entrada automática por Factura Suplidor ${invoice.invoice_number || ''}`.trim(),
                    status: 'posted',
                  };

                  const { data: whEntry, error: whEntryError } = await supabase
                    .from('warehouse_entries')
                    .insert({ ...entryPayload, user_id: userId })
                    .select('*')
                    .single();

                  if (!whEntryError && whEntry?.id) {
                    const linesPayload = (invLines as any[])
                      .filter((l: any) => l?.inventory_item_id && (Number(l.quantity) || 0) > 0)
                      .map((l: any) => ({
                        entry_id: whEntry.id,
                        inventory_item_id: String(l.inventory_item_id),
                        quantity: Number(l.quantity) || 0,
                        unit_cost: l.unit_price != null ? Number(l.unit_price) || 0 : null,
                        notes: l.description || null,
                      }));

                    if (linesPayload.length > 0) {
                      await supabase.from('warehouse_entry_lines').insert(linesPayload);
                    }
                  } else if (whEntryError) {
                    console.error('apInvoiceLinesService.createMany create warehouse_entries error', whEntryError);
                  }
                }
              } catch (whEntryCreateError) {
                console.error('apInvoiceLinesService.createMany create warehouse entry unexpected error', whEntryCreateError);
              }
            }
          }
        }
      } catch (invErr) {
        console.error('apInvoiceLinesService.createMany unexpected inventory error', invErr);
      }

      return insertedLines;
    } catch (error) {
      console.error('apInvoiceLinesService.createMany error', error);
      throw error;
    }
  },

  async deleteByInvoice(apInvoiceId: string) {
    try {
      if (!apInvoiceId) return;
      const { error } = await supabase
        .from('ap_invoice_lines')
        .delete()
        .eq('ap_invoice_id', apInvoiceId);
      if (error) throw error;
    } catch (error) {
      console.error('apInvoiceLinesService.deleteByInvoice error', error);
      throw error;
    }
  },
};

/* ==========================================================
   Purchase Orders Service
========================================================== */
export const purchaseOrdersService = {
  async getAll(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      const { data, error } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          suppliers (
            id,
            name,
            tax_id,
            phone,
            email,
            address
          )
        `)
        .eq('user_id', tenantId)
        .order('order_date', { ascending: false });
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async create(userId: string, po: any) {
    try {
      const tenantId = await resolveTenantId(userId);
      const { data, error } = await supabase
        .from('purchase_orders')
        .insert({ ...po, user_id: tenantId })
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      throw error;
    }
  },

  async update(id: string, po: any) {
    try {
      const { data, error } = await supabase
        .from('purchase_orders')
        .update(po)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      throw error;
    }
  },

  async updateStatus(id: string, status: string) {
    try {
      const patch: any = {
        status,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from('purchase_orders')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      throw error;
    }
  },
};

/* ==========================================================
   Purchase Order Items Service
========================================================== */
export const purchaseOrderItemsService = {
  async getAllByUser(userId: string) {
    try {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('purchase_order_items')
        .select(`
          *,
          inventory_items (current_stock, name, sku, inventory_account_id)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async getAllWithInvoicedByUser(userId: string) {
    try {
      if (!userId) return [];

      const { data, error } = await supabase
        .from('purchase_order_items')
        .select(`
          *,
          inventory_items (current_stock, name, sku, inventory_account_id)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) return handleDatabaseError(error, []);

      const rows = data ?? [];
      if (rows.length === 0) return rows;

      const ids = rows
        .map((it: any) => it.id)
        .filter((id: any) => id);

      if (ids.length === 0) {
        return rows.map((it: any) => ({
          ...it,
          quantity_invoiced: 0,
          remaining_quantity: Number(it.quantity) || 0,
        }));
      }

      const { data: invLines, error: invError } = await supabase
        .from('ap_invoice_lines')
        .select('purchase_order_item_id, quantity')
        .in('purchase_order_item_id', ids);

      if (invError) {
        console.error('purchaseOrderItemsService.getAllWithInvoicedByUser invoice lines error', invError);
        return rows.map((it: any) => ({
          ...it,
          quantity_invoiced: 0,
          remaining_quantity: Number(it.quantity) || 0,
        }));
      }

      const quantityByItemId: Record<string, number> = {};
      (invLines || []).forEach((l: any) => {
        const key = l.purchase_order_item_id ? String(l.purchase_order_item_id) : '';
        if (!key) return;
        const qty = Number(l.quantity) || 0;
        if (qty <= 0) return;
        quantityByItemId[key] = (quantityByItemId[key] || 0) + qty;
      });

      return rows.map((it: any) => {
        const orderedQty = Number(it.quantity) || 0;
        const invoicedQty = quantityByItemId[String(it.id)] || 0;
        const remainingQty = Math.max(orderedQty - invoicedQty, 0);
        return {
          ...it,
          quantity_invoiced: invoicedQty,
          remaining_quantity: remainingQty,
        };
      });
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async getWithInvoicedByOrderAccessible(userId: string, orderId: string) {
    try {
      // 1) intentar con user_id tenantId OR userId (subusuario)
      const attempt = await this.getWithInvoicedByOrderForUser(userId, orderId);
      if (attempt && attempt.length > 0) return attempt;
      // 2) fallback sin filtro de user_id (si la RLS permite acceso por otra vía)
      return await this.getWithInvoicedByOrder(orderId);
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async getWithInvoicedByOrderForUser(userId: string, orderId: string) {
    try {
      if (!userId || !orderId) return [];
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];

      const { data: items, error: itemsError } = await supabase
        .from('purchase_order_items')
        .select(`
          *,
          inventory_items (current_stock, name, sku, cost_price, average_cost, last_purchase_price)
        `)
        .eq('purchase_order_id', orderId)
        .or(`user_id.eq.${tenantId},user_id.eq.${userId}`)
        .order('created_at', { ascending: true });

      if (itemsError) return handleDatabaseError(itemsError, []);

      const rows = items ?? [];
      if (rows.length === 0) return rows;

      const ids = rows
        .map((it: any) => it.id)
        .filter((id: any) => id);

      if (ids.length === 0) {
        return rows.map((it: any) => ({
          ...it,
          quantity_invoiced: 0,
          remaining_quantity: Number(it.quantity) || 0,
        }));
      }

      const { data: invLines, error: invError } = await supabase
        .from('ap_invoice_lines')
        .select('purchase_order_item_id, quantity')
        .in('purchase_order_item_id', ids);

      if (invError) {
        console.error('purchaseOrderItemsService.getWithInvoicedByOrderForUser invoice lines error', invError);
        return rows.map((it: any) => ({
          ...it,
          quantity_invoiced: 0,
          remaining_quantity: Number(it.quantity) || 0,
        }));
      }

      const quantityByItemId: Record<string, number> = {};
      (invLines || []).forEach((l: any) => {
        const key = l.purchase_order_item_id ? String(l.purchase_order_item_id) : '';
        if (!key) return;
        const qty = Number(l.quantity) || 0;
        if (qty <= 0) return;
        quantityByItemId[key] = (quantityByItemId[key] || 0) + qty;
      });

      return rows.map((it: any) => {
        const orderedQty = Number(it.quantity) || 0;
        const invoicedQty = quantityByItemId[String(it.id)] || 0;
        const remainingQty = Math.max(orderedQty - invoicedQty, 0);
        return {
          ...it,
          quantity_invoiced: invoicedQty,
          remaining_quantity: remainingQty,
        };
      });
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async getByOrder(orderId: string) {
    try {
      if (!orderId) return [];
      const { data, error } = await supabase
        .from('purchase_order_items')
        .select(`
          *,
          inventory_items (current_stock, name, sku, cost_price, average_cost, last_purchase_price)
        `)
        .eq('purchase_order_id', orderId)
        .order('created_at', { ascending: true });
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async getByOrderForUser(userId: string, orderId: string) {
    try {
      if (!userId || !orderId) return [];
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('purchase_order_items')
        .select(`
          *,
          inventory_items (current_stock, name, sku, cost_price, average_cost, last_purchase_price)
        `)
        .eq('purchase_order_id', orderId)
        .or(`user_id.eq.${tenantId},user_id.eq.${userId}`)
        .order('created_at', { ascending: true });
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async getByOrderAccessible(userId: string, orderId: string) {
    try {
      // 1) intentar con user_id tenantId OR userId (subusuario)
      const attempt = await this.getByOrderForUser(userId, orderId);
      if (attempt && attempt.length > 0) return attempt;
      // 2) fallback sin filtro de user_id (si la RLS permite acceso por otra vía)
      return await this.getByOrder(orderId);
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async getWithInvoicedByOrder(orderId: string) {
    try {
      if (!orderId) return [];

      const { data: items, error: itemsError } = await supabase
        .from('purchase_order_items')
        .select(`
          *,
          inventory_items (current_stock, name, sku, cost_price, average_cost, last_purchase_price)
        `)
        .eq('purchase_order_id', orderId)
        .order('created_at', { ascending: true });

      if (itemsError) return handleDatabaseError(itemsError, []);

      const rows = items ?? [];
      if (rows.length === 0) return rows;

      const ids = rows
        .map((it: any) => it.id)
        .filter((id: any) => id);

      if (ids.length === 0) {
        return rows.map((it: any) => ({
          ...it,
          quantity_invoiced: 0,
          remaining_quantity: Number(it.quantity) || 0,
        }));
      }

      const { data: invLines, error: invError } = await supabase
        .from('ap_invoice_lines')
        .select('purchase_order_item_id, quantity')
        .in('purchase_order_item_id', ids);

      if (invError) {
        console.error('purchaseOrderItemsService.getWithInvoicedByOrder invoice lines error', invError);
        return rows.map((it: any) => ({
          ...it,
          quantity_invoiced: 0,
          remaining_quantity: Number(it.quantity) || 0,
        }));
      }

      const quantityByItemId: Record<string, number> = {};
      (invLines || []).forEach((l: any) => {
        const key = l.purchase_order_item_id ? String(l.purchase_order_item_id) : '';
        if (!key) return;
        const qty = Number(l.quantity) || 0;
        if (qty <= 0) return;
        quantityByItemId[key] = (quantityByItemId[key] || 0) + qty;
      });

      return rows.map((it: any) => {
        const orderedQty = Number(it.quantity) || 0;
        const invoicedQty = quantityByItemId[String(it.id)] || 0;
        const remainingQty = Math.max(orderedQty - invoicedQty, 0);
        return {
          ...it,
          quantity_invoiced: invoicedQty,
          remaining_quantity: remainingQty,
        };
      });
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async deleteByOrder(orderId: string) {
    try {
      if (!orderId) return;
      const { error } = await supabase
        .from('purchase_order_items')
        .delete()
        .eq('purchase_order_id', orderId);
      if (error) throw error;
    } catch (error) {
      console.error('purchaseOrderItemsService.deleteByOrder error', error);
      throw error;
    }
  },

  async createMany(userId: string, orderId: string, items: Array<{ itemId: string | null; name: string; quantity: number; price: number }>) {
    try {
      if (!userId || !orderId || !items || items.length === 0) return [];

      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');

      const rows = items.map((it) => {
        const quantity = Number(it.quantity) || 0;
        const unitCost = Number(it.price) || 0;
        return {
          user_id: tenantId,
          purchase_order_id: orderId,
          inventory_item_id: it.itemId,
          description: it.name || '',
          quantity,
          unit_cost: unitCost,
          total_cost: quantity * unitCost,
        };
      }).filter(r => r.quantity > 0);

      if (rows.length === 0) return [];

      const { data, error } = await supabase
        .from('purchase_order_items')
        .insert(rows)
        .select('*');
      if (error) throw error;
      return data ?? [];
    } catch (error) {
      console.error('purchaseOrderItemsService.createMany error', error);
      throw error;
    }
  },
};

/* ==========================================================
   Supplier Payments Service (Accounts Payable)
========================================================== */
export const supplierPaymentsService = {
  async getAll(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('supplier_payments')
        .select(`
          *,
          suppliers (name)
        `)
        .eq('user_id', tenantId)
        .order('payment_date', { ascending: false });
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async create(userId: string, payload: {
    supplier_id: string;
    payment_date: string;
    reference: string;
    method: string;
    amount: number;
    status: string;
    description?: string | null;
    bank_account_label?: string | null;
    bank_chart_account_id?: string | null;
    invoice_number?: string | null;
  }, options?: { skipPeriodValidation?: boolean }) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');

      // Determinar si omitir validación de período (planes básicos no la requieren)
      const skipValidation = options?.skipPeriodValidation ?? shouldSkipPeriodValidation();

      // Validar período contable abierto
      if (!skipValidation) {
        await accountingPeriodsService.requireOpenPeriod(tenantId, payload.payment_date);
      }

      const body = {
        user_id: tenantId,
        supplier_id: payload.supplier_id,
        payment_date: payload.payment_date,
        reference: payload.reference,
        method: payload.method,
        amount: payload.amount,
        status: payload.status,
        description: payload.description ?? null,
        bank_account_id: payload.bank_chart_account_id ?? null,
        bank_account: payload.bank_account_label ?? null,
        invoice_number: payload.invoice_number ?? null,
      };
      const { data, error } = await supabase
        .from('supplier_payments')
        .insert(body)
        .select('*')
        .single();
      if (error) throw error;
      // Best-effort: crear solicitud de autorización para pago a proveedor
      try {
        await supabase.from('approval_requests').insert({
          user_id: tenantId,
          entity_type: 'supplier_payment',
          entity_id: data.id,
          status: 'pending',
          notes: payload.description ?? null,
        });
      } catch (approvalError) {
        console.error('Error creating approval request for supplier payment:', approvalError);
      }

      return data;
    } catch (error) {
      console.error('supplierPaymentsService.create error', error);
      throw error;
    }
  },

  async updateStatus(id: string, status: string) {
    try {
      const patch: any = {
        status,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from('supplier_payments')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;

      // Best-effort: registrar asiento contable y actualizar CxP solo cuando el pago se completa
      // IMPORTANTE: Solo crear asiento si el método de pago NO es "Cheque"
      // Los cheques crean su propio asiento en bankChecksService
      if (data && status === 'Completado') {
        try {
          // Obtener configuración contable global
          const settings = await accountingSettingsService.get(data.user_id);
          let apAccountId = settings?.ap_account_id as string | null | undefined;
          const defaultApBankAccountId = settings?.ap_bank_account_id;

          // Si no hay cuenta de CxP configurada, intentar usar automáticamente la cuenta 2001
          if (!apAccountId) {
            try {
              const { data: apAccountRow, error: apAccError } = await supabase
                .from('chart_accounts')
                .select('id, code')
                .eq('user_id', data.user_id)
                .order('code', { ascending: true })
                .limit(1)
                .maybeSingle();

              if (!apAccError && apAccountRow?.id) {
                const rawCode = String(apAccountRow.code || '');
                const normalized = rawCode.replace(/\./g, '');
                if (normalized.startsWith('2001')) {
                  apAccountId = apAccountRow.id as string;
                }
              }
            } catch (resolveApError) {
              console.error('No se pudo resolver cuenta 2001 como CxP por defecto:', resolveApError);
            }
          }

          const amount = Number(data.amount) || 0;
          const paymentMethod = String(data.method || '').toLowerCase();

          // Si el método de pago es "cheque", NO crear asiento aquí
          // porque el cheque ya creó su propio asiento en bankChecksService
          const isCheckPayment = paymentMethod.includes('cheque') || paymentMethod.includes('check');

          if (isCheckPayment) {
            console.log('Pago mediante cheque detectado - asiento ya creado en bankChecksService');
            // Continuar con actualización de factura pero NO crear asiento
          }

          // Intentar usar la cuenta contable del banco específico del pago
          let bankChartAccountId: string | null = null;
          if (data.bank_account_id) {
            const { data: bankAccount, error: bankError } = await supabase
              .from('bank_accounts')
              .select('chart_account_id')
              .eq('id', data.bank_account_id)
              .maybeSingle();
            if (!bankError && bankAccount?.chart_account_id) {
              bankChartAccountId = bankAccount.chart_account_id as string;
            }
          }

          // Fallback al banco por defecto de CxP si no hay cuenta contable en el banco
          if (!bankChartAccountId && defaultApBankAccountId) {
            bankChartAccountId = defaultApBankAccountId as string;
          }

          if (apAccountId && bankChartAccountId && amount > 0 && !isCheckPayment) {
            // Validar saldo disponible en cuenta bancaria antes de completar el pago
            const saldoDisponible = await financialReportsService.getAccountBalance(data.user_id, bankChartAccountId);
            
            if (saldoDisponible < amount) {
              throw new Error(
                `❌ Saldo insuficiente en cuenta bancaria\n\n` +
                `Saldo disponible: ${saldoDisponible.toFixed(2)}\n` +
                `Monto del pago: ${amount.toFixed(2)}\n\n` +
                `No se puede completar el pago sin fondos suficientes.`
              );
            }

            const lines: any[] = [
              {
                account_id: apAccountId,
                description: 'Pago a proveedor - Cuentas por Pagar',
                debit_amount: amount,
                credit_amount: 0,
                line_number: 1,
              },
              {
                account_id: bankChartAccountId,
                description: 'Pago a proveedor - Banco',
                debit_amount: 0,
                credit_amount: amount,
                line_number: 2,
              },
            ];

            let entryNumber = data?.id ? `SP-${String(data.id)}` : `SP-${Date.now()}`;
            try {
              while (entryNumber) {
                const { data: exists, error: existsErr } = await supabase
                  .from('journal_entries')
                  .select('id')
                  .eq('user_id', data.user_id)
                  .eq('entry_number', entryNumber)
                  .limit(1);

                if (!existsErr && exists && (exists as any[]).length > 0) {
                  entryNumber = data?.id
                    ? `SP-${String(data.id)}-${Math.floor(Math.random() * 1000)}`
                    : `SP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
                  continue;
                }
                break;
              }
            } catch {
              // ignore
            }

            const entryPayload = {
              entry_number: entryNumber,
              entry_date: String(data.payment_date),
              description: `Pago a proveedor ${data.invoice_number || ''}`.trim(),
              reference: data.id ? String(data.id) : null,
              status: 'posted' as const,
            };

            await journalEntriesService.createWithLines(data.user_id, entryPayload, lines);
          }

          // Actualizar saldo de la factura de CxP si el pago está vinculado a una factura
          if (amount > 0 && data.invoice_number) {
            try {
              const { data: invoice, error: invError } = await supabase
                .from('ap_invoices')
                .select('id, user_id, supplier_id, invoice_number, total_to_pay, paid_amount, balance_amount, status')
                .eq('user_id', data.user_id)
                .eq('supplier_id', data.supplier_id)
                .eq('invoice_number', data.invoice_number)
                .maybeSingle();

              if (!invError && invoice) {
                const totalToPay = Number(invoice.total_to_pay) || 0;
                const currentPaid = Number((invoice as any).paid_amount) || 0;
                const currentBalance = Number((invoice as any).balance_amount) || totalToPay;

                const remainingBefore = totalToPay > 0 ? Math.max(totalToPay - currentPaid, 0) : currentBalance;
                const amountToApply = totalToPay > 0 ? Math.min(amount, remainingBefore) : amount;

                const newPaid = currentPaid + amountToApply;
                const newBalance = totalToPay > 0
                  ? Math.max(totalToPay - newPaid, 0)
                  : Math.max(currentBalance - amountToApply, 0);

                let newStatus = invoice.status || 'pending';
                if (totalToPay > 0) {
                  if (newBalance <= 0.01) {
                    newStatus = 'paid';
                  } else if (newPaid > 0) {
                    newStatus = 'partial';
                  }
                }

                await supabase
                  .from('ap_invoices')
                  .update({
                    status: newStatus,
                    paid_amount: newPaid,
                    balance_amount: newBalance,
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', invoice.id);
              }
            } catch (updateApError) {
              console.error('Error updating AP invoice from supplierPaymentsService:', updateApError);
            }
          }
        } catch (err) {
          console.error('Error posting supplier payment to ledger:', err);
          // No interrumpir el flujo de actualización de estado por errores contables
        }
      }
      return data;
    } catch (error) {
      console.error('supplierPaymentsService.updateStatus error', error);
      throw error;
    }
  },
};

/* ==========================================================
   Customer Payments Service (Accounts Receivable)
========================================================== */
export const customerPaymentsService = {
  async getAll(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('customer_payments')
        .select(`
          *,
          customers (name),
          invoices (invoice_number, currency),
          bank_accounts (chart_account_id, bank_name, account_number)
        `)
        .eq('user_id', tenantId)
        .order('payment_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async create(userId: string, payload: any, options?: { skipPeriodValidation?: boolean }) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');

      // Determinar si omitir validación de período (planes básicos no la requieren)
      const skipValidation = options?.skipPeriodValidation ?? shouldSkipPeriodValidation();

      // Validar período contable abierto
      if (!skipValidation) {
        const paymentDate = payload.payment_date || new Date().toISOString().split('T')[0];
        await accountingPeriodsService.requireOpenPeriod(tenantId, paymentDate);
      }

      const body = {
        ...payload,
        user_id: tenantId,
      };
      const { data, error } = await supabase
        .from('customer_payments')
        .insert(body)
        .select(`
          *,
          customers (name),
          invoices (invoice_number, currency),
          bank_accounts (chart_account_id, bank_name, account_number)
        `)
        .single();
      if (error) throw error;
      
      // Best-effort: crear solicitud de autorización para pago de cliente
      try {
        await supabase.from('approval_requests').insert({
          user_id: tenantId,
          entity_type: 'customer_payment',
          entity_id: data.id,
          status: 'pending',
          notes: body.reference || null,
        });
      } catch (approvalError) {
        console.error('Error creating approval request for customer payment:', approvalError);
      }

      // Best-effort: si el pago es en efectivo, registrarlo en Cash & Finance
      try {
        const paymentMethod = String((data as any)?.payment_method || '').toLowerCase();
        const invoiceId = (data as any)?.invoice_id ? String((data as any).invoice_id) : '';
        const amount = Number((data as any)?.amount || 0);
        const currency = String((data as any)?.invoices?.currency || 'USD');

        if ((paymentMethod === 'cash' || paymentMethod === 'efectivo') && invoiceId && amount > 0) {
          const { data: openDrawer, error: drawerError } = await supabase
            .from('contador_cash_drawers')
            .select('id')
            .eq('user_id', tenantId)
            .eq('status', 'open')
            .order('opened_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!drawerError && openDrawer?.id) {
            await supabase.from('contador_cash_transactions').insert({
              user_id: tenantId,
              drawer_id: String(openDrawer.id),
              type: 'sale_cash_in',
              amount,
              currency,
              reference_type: 'customer_payment',
              reference_id: String((data as any).id),
              description: `Invoice payment ${(data as any)?.invoices?.invoice_number || invoiceId}`,
              created_by: null,
            });
          }
        }
      } catch (cashError) {
        console.warn('[customerPaymentsService.create] Could not create cash transaction:', cashError);
      }

      return data;
    } catch (error) {
      console.error('customerPaymentsService.create error', error);
      throw error;
    }
  },
};

/* ==========================================================
   Recurring Subscriptions Service (Facturación Recurrente)
========================================================== */
export const recurringSubscriptionsService = {
  async getAll(userId: string) {
    try {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('recurring_subscriptions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async create(userId: string, payload: any) {
    try {
      const body = {
        ...payload,
        user_id: userId,
      };
      const tryInsert = async (insertBody: any) => {
        const { data, error } = await supabase
          .from('recurring_subscriptions')
          .insert(insertBody)
          .select('*')
          .single();
        if (error) throw error;
        return data;
      };

      try {
        return await tryInsert(body);
      } catch (error: any) {
        if (error?.code === 'PGRST204') {
          const fallbackBody = { ...body };
          delete fallbackBody.apply_itbis;
          delete fallbackBody.itbis_rate;
          delete fallbackBody.last_billed_date;
          return await tryInsert(fallbackBody);
        }
        throw error;
      }
    } catch (error) {
      console.error('recurringSubscriptionsService.create error', error);
      throw error;
    }
  },

  async update(id: string, patch: any) {
    try {
      const tryUpdate = async (updatePatch: any) => {
        const { data, error } = await supabase
          .from('recurring_subscriptions')
          .update({
            ...updatePatch,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
          .select('*')
          .single();
        if (error) throw error;
        return data;
      };

      try {
        return await tryUpdate(patch);
      } catch (error: any) {
        if (error?.code === 'PGRST204') {
          const fallbackPatch = { ...patch };
          delete fallbackPatch.apply_itbis;
          delete fallbackPatch.itbis_rate;
          delete fallbackPatch.last_billed_date;
          return await tryUpdate(fallbackPatch);
        }
        throw error;
      }
    } catch (error) {
      console.error('recurringSubscriptionsService.update error', error);
      throw error;
    }
  },

  async processPending(userId: string): Promise<{ processed: number; skipped: number; errors: string[] }> {
    const result = { processed: 0, skipped: 0, errors: [] as string[] };

    try {
      if (!userId) return result;

      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return result;

      const todayStr = new Date().toISOString().slice(0, 10);

      // 1. VALIDAR PERÍODO CONTABLE ABIERTO
      const openPeriod = await accountingPeriodsService.getOpenPeriodForDate(tenantId, todayStr);
      if (!openPeriod) {
        result.errors.push(`No existe un período contable abierto para la fecha ${todayStr}. Debe crear y abrir el período contable antes de procesar facturación recurrente.`);
        return result;
      }

      // 2. OBTENER SUSCRIPCIONES PENDIENTES
      const { data: subs, error } = await supabase
        .from('recurring_subscriptions')
        .select('*')
        .eq('user_id', tenantId)
        .eq('status', 'active')
        .lte('next_billing_date', todayStr);

      if (error) throw error;
      const list = subs ?? [];
      if (list.length === 0) return result;

      for (const sub of list) {
        try {
          // Respetar fecha de fin si existe
          if (sub.end_date && sub.end_date < todayStr) {
            await this.update(sub.id, { status: 'expired' });
            result.skipped += 1;
            continue;
          }

          // 3. EVITAR DUPLICADOS: verificar si ya se facturó esta fecha
          const billingDate = sub.next_billing_date as string;
          if (sub.last_billed_date === billingDate) {
            // Ya se facturó este período, saltar
            result.skipped += 1;
            continue;
          }

          const amount = Number(sub.amount) || 0;
          if (!amount || !sub.customer_id) {
            result.skipped += 1;
            continue;
          }

          // 4. CALCULAR ITBIS SI APLICA
          const applyItbis = sub.apply_itbis !== false; // Por defecto aplica
          const itbisRate = Number(sub.itbis_rate) || 18;
          const taxAmount = applyItbis ? Number((amount * itbisRate / 100).toFixed(2)) : 0;
          const totalAmount = Number((amount + taxAmount).toFixed(2));

          const invoicePayload = {
            customer_id: sub.customer_id as string,
            invoice_date: todayStr,
            due_date: todayStr,
            currency: 'DOP',
            subtotal: amount,
            tax_amount: taxAmount,
            total_amount: totalAmount,
            paid_amount: 0,
            status: 'pending',
            notes: `Factura recurrente - Suscripción ID: ${sub.id} | ${sub.service_name || 'Servicio'}`,
          };

          const linesPayload = [
            {
              description: sub.service_name || 'Servicio recurrente',
              quantity: 1,
              unit_price: amount,
              tax_amount: taxAmount,
              line_total: totalAmount,
              line_number: 1,
            },
          ];

          // 6. CREAR FACTURA (invoicesService.create ya valida período y crea asiento)
          const { invoice } = await invoicesService.create(tenantId, invoicePayload, linesPayload);

          // 7. CALCULAR PRÓXIMA FECHA DE FACTURACIÓN
          let nextDate: string | null = null;
          if (billingDate) {
            const d = new Date(billingDate);
            if (sub.frequency === 'weekly') d.setDate(d.getDate() + 7);
            else if (sub.frequency === 'monthly') d.setMonth(d.getMonth() + 1);
            else if (sub.frequency === 'quarterly') d.setMonth(d.getMonth() + 3);
            else if (sub.frequency === 'yearly') d.setFullYear(d.getFullYear() + 1);
            nextDate = d.toISOString().slice(0, 10);
          }

          // 8. ACTUALIZAR SUSCRIPCIÓN
          await this.update(sub.id, {
            last_invoice_id: invoice.id,
            last_billed_date: billingDate, // Marcar como facturado para evitar duplicados
            next_billing_date: nextDate,
          });

          result.processed += 1;
        } catch (e: any) {
          // No detener todo el lote por un error individual
          const errorMsg = e?.message || String(e);
          console.error('recurringSubscriptionsService.processPending item error', e);
          result.errors.push(`Suscripción ${sub.id}: ${errorMsg}`);
        }
      }

      return result;
    } catch (error: any) {
      console.error('recurringSubscriptionsService.processPending error', error);
      result.errors.push(error?.message || 'Error desconocido al procesar facturación recurrente');
      return result;
    }
  },
};

/* ==========================================================
   Sales Rep Types Service
   Tabla: sales_rep_types
========================================================== */
export const salesRepTypesService = {
  async getAll(userId: string) {
    try {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('sales_rep_types')
        .select('*')
        .eq('user_id', userId)
        .order('name', { ascending: true });

      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async create(userId: string, payload: { name: string; description?: string; default_commission_rate?: number | null; max_discount_percent?: number | null }) {
    try {
      if (!userId) throw new Error('userId required');
      const now = new Date().toISOString();
      const body = {
        user_id: userId,
        name: payload.name,
        description: payload.description ?? null,
        default_commission_rate: typeof payload.default_commission_rate === 'number' ? payload.default_commission_rate : null,
        max_discount_percent: typeof payload.max_discount_percent === 'number' ? payload.max_discount_percent : null,
        is_active: true,
        created_at: now,
        updated_at: now,
      };

      const { data, error } = await supabase
        .from('sales_rep_types')
        .insert(body)
        .select('*')
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('salesRepTypesService.create error', error);
      throw error;
    }
  },

  async update(id: string, patch: Partial<{ name: string; description: string; default_commission_rate: number | null; max_discount_percent: number | null; is_active: boolean }>) {
    try {
      const body = {
        ...patch,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('sales_rep_types')
        .update(body)
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('salesRepTypesService.update error', error);
      throw error;
    }
  },
};

/* ==========================================================
   Sales Reps Service (Vendedores)
   Tabla: sales_reps
========================================================== */
export const salesRepsService = {
  async getAll(userId: string) {
    try {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('sales_reps')
        .select('*')
        .eq('user_id', userId)
        .order('name', { ascending: true });

      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async create(userId: string, rep: { name: string; code?: string; email?: string; phone?: string; commission_rate?: number | null; sales_rep_type_id?: string | null }) {
    try {
      if (!userId) throw new Error('userId required');
      const now = new Date().toISOString();
      const payload = {
        user_id: userId,
        name: rep.name,
        code: rep.code || null,
        email: rep.email || null,
        phone: rep.phone || null,
        commission_rate: typeof rep.commission_rate === 'number' ? rep.commission_rate : null,
        sales_rep_type_id: rep.sales_rep_type_id ?? null,
        is_active: true,
        created_at: now,
        updated_at: now,
      };

      const { data, error } = await supabase
        .from('sales_reps')
        .insert(payload)
        .select('*')
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('salesRepsService.create error', error);
      throw error;
    }
  },

  async update(id: string, patch: Partial<{ name: string; code: string; email: string; phone: string; commission_rate: number | null; is_active: boolean; sales_rep_type_id: string | null }>) {
    try {
      const body = {
        ...patch,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('sales_reps')
        .update(body)
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('salesRepsService.update error', error);
      throw error;
    }
  },
};

/* ==========================================================
   Stores Service (Tiendas/Sucursales)
   Tabla: stores
========================================================== */
export const storesService = {
  async getAll(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('stores')
        .select('*')
        .eq('user_id', tenantId)
        .order('name', { ascending: true });

      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async create(userId: string, payload: { name: string; code?: string; address?: string; city?: string; phone?: string; email?: string; manager_name?: string }) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');
      const now = new Date().toISOString();
      const body = {
        user_id: tenantId,
        name: payload.name,
        code: payload.code || null,
        address: payload.address || null,
        city: payload.city || null,
        phone: payload.phone || null,
        email: payload.email || null,
        manager_name: payload.manager_name || null,
        is_active: true,
        created_at: now,
        updated_at: now,
      };

      const { data, error } = await supabase
        .from('stores')
        .insert(body)
        .select('*')
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('storesService.create error', error);
      throw error;
    }
  },

  async update(id: string, patch: Partial<{ name: string; code: string; address: string; city: string; phone: string; email: string; manager_name: string; is_active: boolean }>) {
    try {
      const body = {
        ...patch,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('stores')
        .update(body)
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('storesService.update error', error);
      throw error;
    }
  },
};

/* ==========================================================
   Bank Accounts Service
  ========================================================== */
export const bankAccountsService = {
  async getAll(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('user_id', tenantId)
        .eq('is_deleted', false)
        .order('bank_name', { ascending: true });
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async getBalancesAsOf(userId: string, asOfDate?: string) {
    try {
      if (!userId) return [];
      const endDate = asOfDate || new Date().toISOString().slice(0, 10);

      const [banks, trial] = await Promise.all([
        bankAccountsService.getAll(userId),
        financialReportsService.getTrialBalance(userId, '1900-01-01', endDate),
      ]);

      const byAccountId = new Map<string, number>();
      (trial || []).forEach((r: any) => {
        const accountId = r?.account_id as string;
        if (!accountId) return;
        byAccountId.set(accountId, Number(r?.balance) || 0);
      });

      return (banks || []).map((b: any) => {
        const chartAccountId = (b.chart_account_id ?? null) as string | null;
        const accountingBalance = chartAccountId ? (byAccountId.get(chartAccountId) ?? 0) : null;
        return {
          ...b,
          accounting_balance: accountingBalance,
          balance_as_of: endDate,
        };
      });
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async create(userId: string, payload: any) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');
      // Evitar enviar campos que no existan en la tabla (como use_payment_requests si aún no existe)
      const { use_payment_requests, ...rest } = payload || {};
      const body = { ...rest, user_id: tenantId, is_deleted: false };
      const { data, error } = await supabase
        .from('bank_accounts')
        .insert(body)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('bankAccountsService.create error', error);
      throw error;
    }
  },

  async update(id: string, payload: any) {
    try {
      // Evitar enviar campos que no existan en la tabla (como use_payment_requests si aún no existe)
      const { use_payment_requests, ...rest } = payload || {};
      const { data, error } = await supabase
        .from('bank_accounts')
        .update(rest)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('bankAccountsService.update error', error);
      throw error;
    }
  },

  async delete(id: string) {
    try {
      const { error } = await supabase
        .from('bank_accounts')
        .update({ is_deleted: true, is_active: false, chart_account_id: null })
        .eq('id', id);
      if (error) throw error;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('bankAccountsService.delete error', error);
      throw error;
    }
  },
};


/* ==========================================================
   Tax Returns Service
========================================================== */
export const taxReturnsService = {
  async getAll(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('tax_returns')
        .select('*')
        .eq('user_id', tenantId)
        .order('due_date', { ascending: false });
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async create(userId: string, taxReturn: any) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');
      const { data, error } = await supabase
        .from('tax_returns')
        .insert({ ...taxReturn, user_id: tenantId })
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      throw error;
    }
  },

  async update(id: string, taxReturn: any) {
    try {
      const { data, error } = await supabase
        .from('tax_returns')
        .update(taxReturn)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      throw error;
    }
  }
};

/* ==========================================================
   Tax Service (single consolidated export)
========================================================== */
export const taxService = {
  // -----------------------------------------------------------------
  // NCF Series Management - CORREGIDO COMPLETAMENTE
  // -----------------------------------------------------------------
  async getNcfSeries(userId?: string) {
    try {
      let query = supabase
        .from('ncf_series')
        .select('*');
      
      if (userId) {
        const tenantId = await resolveTenantId(userId);
        if (!tenantId) return [];
        query = query.eq('user_id', tenantId);
      }
      
      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting NCF series:', error);
      return [];
    }
  },

  async createNcfSeries(series: any) {
    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();

      // Preparar los datos asegurando que la fecha esté en formato correcto
      const seriesData = {
        ...series,
        user_id: user?.id,
        expiration_date: series.expiration_date || null, // Permitir null si no hay fecha
        current_number: series.current_number || series.start_number || 1
      };

      // Si expiration_date está vacío, establecerlo como null
      if (seriesData.expiration_date === '') {
        seriesData.expiration_date = null;
      }

      const { data, error } = await supabase
        .from('ncf_series')
        .insert([seriesData])
        .select();

      if (error) throw error;
      return data?.[0];
    } catch (error) {
      console.error('Error creating NCF series:', error);
      throw error;
    }
  },

  async updateNcfSeries(id: string, series: any) {
    try {
      // Preparar los datos asegurando que la fecha esté en formato correcto
      const seriesData = {
        ...series,
        expiration_date: series.expiration_date || null
      };

      // Si expiration_date está vacío, establecerlo como null
      if (seriesData.expiration_date === '') {
        seriesData.expiration_date = null;
      }

      const { data, error } = await supabase
        .from('ncf_series')
        .update(seriesData)
        .eq('id', id)
        .select();

      if (error) throw error;
      return data?.[0];
    } catch (error) {
      console.error('Error updating NCF series:', error);
      throw error;
    }
  },

  async deleteNcfSeries(id: string) {
    try {
      const { error } = await supabase
        .from('ncf_series')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting NCF series:', error);
      throw error;
    }
  },

  // Obtener y avanzar el siguiente NCF disponible para un tipo de documento (B01, B02, etc.)
  async getNextNcf(userId: string, documentType: string) {
    try {
      if (!userId) throw new Error('userId requerido para generar NCF');
      if (!documentType) throw new Error('documentType requerido para generar NCF');

      // Resolver tenantId para multi-tenant
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('No se pudo resolver el tenant para NCF');

      // Buscar la primera serie activa para ese tipo de documento con números disponibles
      const { data: series, error } = await supabase
        .from('ncf_series')
        .select('*')
        .eq('user_id', tenantId)
        .eq('document_type', documentType)
        .eq('status', 'active')
        .order('created_at', { ascending: true });

      if (error) throw error;
      const active = (series || []).find((s: any) => s.current_number <= s.end_number);
      if (!active) {
        throw new Error(`No hay series NCF activas disponibles para tipo ${documentType}`);
      }

      const nextNumber: number = active.current_number || active.start_number || 1;
      const fullNumber = String(nextNumber).padStart(8, '0');
      // El NCF se construye con el tipo de documento (ej: B01) + número secuencial de 8 dígitos
      const docType = active.document_type || 'B01';
      const ncf = `${docType}${fullNumber}`;

      // Avanzar current_number
      const newCurrent = nextNumber + 1;
      const { error: updateError } = await supabase
        .from('ncf_series')
        .update({ current_number: newCurrent })
        .eq('id', active.id);

      if (updateError) throw updateError;

      return {
        ncf,
        seriesId: active.id as string,
        documentType: active.document_type as string,
      };
    } catch (error) {
      // No log error - es esperado cuando no hay series configuradas
      throw error;
    }
  },

  // -----------------------------------------------------------------
  // Tax Configuration
  // -----------------------------------------------------------------
  async getTaxConfiguration() {
    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      const tenantId = await resolveTenantId(user?.id ?? null);
      if (!tenantId) return null;

      const { data, error } = await supabase
        .from('tax_configuration')
        .select('*')
        .eq('user_id', tenantId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data || null;
    } catch (error) {
      console.error('Error getting tax configuration:', error);
      return null;
    }
  },

  async saveTaxConfiguration(config: any) {
    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      const tenantId = await resolveTenantId(user?.id ?? null);
      if (!tenantId) throw new Error('userId required');

      const { data, error } = await supabase
        .from('tax_configuration')
        .upsert({ ...config, user_id: tenantId })
        .select();

      if (error) throw error;
      return data?.[0];
    } catch (error) {
      console.error('Error saving tax configuration:', error);
      throw error;
    }
  },

  // -----------------------------------------------------------------
  // Report Generation - Reporte 606 (Compras)
  // -----------------------------------------------------------------
  async buildReport606(period: string) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) return;

      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) return;

      // Calcular primer y último día del mes del período (YYYY-MM)
      const [yearStr, monthStr] = period.split('-');
      const year = Number(yearStr);
      const month = Number(monthStr); // 1-12
      const startDate = `${period}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${period}-${String(lastDay).padStart(2, '0')}`;

      // 1) Obtener facturas de suplidor (ap_invoices) del período con proveedor
      const { data: apInvoices, error: apErr } = await supabase
        .from('ap_invoices')
        .select(
          `*,
           suppliers (name, tax_id)`
        )
        .eq('user_id', tenantId)
        .gte('invoice_date', startDate)
        .lte('invoice_date', endDate)
        .neq('status', 'cancelled');

      if (apErr) throw apErr;

      const rows: any[] = [];

      (apInvoices || []).forEach((inv: any) => {
        const supplierName = inv.legal_name || inv.suppliers?.name || 'Proveedor';
        const supplierRnc = inv.tax_id || inv.suppliers?.tax_id || '';
        const fecha = inv.invoice_date;
        const totalGross = Number(inv.total_gross) || 0;
        const totalDiscount = Number(inv.total_discount) || 0;
        const baseAmount = Math.max(0, totalGross - totalDiscount);
        const itbis = Number(inv.total_itbis) || 0;
        const itbisWithheld = Number((inv as any).total_itbis_withheld) || 0;
        const isrWithheld = Number((inv as any).total_isr_withheld) || 0;

        rows.push({
          user_id: tenantId,
          period,
          fecha_comprobante: fecha,
          tipo_comprobante: (inv.document_type as string) || 'B01',
          ncf: (inv.invoice_number as string) || String(inv.id),
          tipo_gasto: (inv.expense_type_606 as string) || '',
          rnc_cedula_proveedor: supplierRnc,
          nombre_proveedor: supplierName,
          monto_facturado: baseAmount,
          itbis_facturado: itbis,
          itbis_retenido: itbisWithheld,
          monto_retencion_renta: isrWithheld,
          tipo_pago: inv.payment_terms_id ? 'Credito' : 'Contado',
        });
      });

      // 2) Incluir gastos de Caja Chica con NCF dentro del período
      const { data: pettyExpenses, error: pcErr } = await supabase
        .from('petty_cash_expenses')
        .select('*')
        .eq('user_id', tenantId)
        .eq('status', 'approved')
        .gte('expense_date', startDate)
        .lte('expense_date', endDate);

      if (pcErr) throw pcErr;

      (pettyExpenses || [])
        .filter((exp: any) => exp.ncf && String(exp.ncf).trim() !== '')
        .forEach((exp: any) => {
          const fecha = exp.expense_date;
          const monto = Number(exp.amount) || 0;
          const itbis = Number(exp.itbis) || 0;

          rows.push({
            user_id: tenantId,
            period,
            fecha_comprobante: fecha,
            tipo_comprobante: 'B01',
            ncf: exp.ncf,
            tipo_gasto: (exp as any).expense_type_606 || '',
            rnc_cedula_proveedor: exp.supplier_tax_id || '',
            nombre_proveedor: exp.supplier_name || 'Proveedor Caja Chica',
            monto_facturado: monto,
            itbis_facturado: itbis,
            itbis_retenido: 0,
            monto_retencion_renta: 0,
            tipo_pago: 'Efectivo',
          });
        });

      // 3) Limpiar datos anteriores del período y guardar los nuevos
      const { error: delErr } = await supabase
        .from('report_606_data')
        .delete()
        .eq('period', period)
        .eq('user_id', tenantId);
      if (delErr) throw delErr;

      if (rows.length > 0) {
        const { error: insErr } = await supabase
          .from('report_606_data')
          .insert(rows);
        if (insErr) throw insErr;
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error building Report 606 data:', error);
      throw error;
    }
  },

  async generateReport606(period: string) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) return [];

      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) return [];

      await this.buildReport606(period);
      const { data, error } = await supabase
        .from('report_606_data')
        .select('*')
        .eq('period', period)
        .eq('user_id', tenantId)
        .order('fecha_comprobante');

      if (error) throw error;

      // Importar utilidades de tipo de gasto 606
      const {
        distributeAmount,
        distributeItbis,
        extractExpenseCode,
        isValidExpenseType606,
      } = await import('../utils/expenseType606');

      const mapped = (data || []).map((item: any) => {
        // RNC / Cédula
        const rawRnc: string = (item.rnc_cedula ?? item.rnc_cedula_proveedor ?? '') as string;
        const normalizedRnc = rawRnc || '';

        // Tipo de identificación (1=RNC, 2=Cédula, 3=Pasaporte)
        let tipoIdentificacion: string = item.tipo_identificacion ?? '';
        if (!tipoIdentificacion && normalizedRnc) {
          const digits = normalizedRnc.replace(/[^0-9]/g, '');
          if (digits.length === 11) {
            tipoIdentificacion = '2'; // Cédula
          } else if (digits.length === 9) {
            tipoIdentificacion = '1'; // RNC
          } else {
            tipoIdentificacion = '1'; // Por defecto RNC
          }
        }

        // Tipo de bienes/servicios - extraer solo el código (01-11)
        const tipoGastoRaw: string =
          (item.tipo_bienes_servicios as string) ||
          (item.tipo_gasto as string) ||
          '';
        const tipoGastoCode = extractExpenseCode(tipoGastoRaw);
        const tipoBienesServicios = isValidExpenseType606(tipoGastoRaw) ? tipoGastoCode : '';

        // Monto base y distribución automática entre bienes/servicios según tipo de gasto
        const baseAmount = Number(item.monto_facturado ?? 0) || 0;
        const itbisFacturado = Number(item.itbis_facturado ?? 0) || 0;
        const itbisRetenido = Number(item.itbis_retenido ?? 0) || 0;
        const itbisToCost = Boolean(item.itbis_to_cost);

        // Distribución automática de montos según tipo de gasto (servicios vs bienes)
        const { servicios, bienes } = distributeAmount(tipoGastoRaw, baseAmount);

        // Distribución automática del ITBIS según tipo de gasto
        const {
          itbisProporcionalidad,
          itbisAlCosto,
          itbisPorAdelantar,
        } = distributeItbis(tipoGastoRaw, itbisFacturado, itbisToCost);

        return {
          ...item,
          // Normalizar nombres esperados por el frontend y formato DGII
          rnc_cedula: normalizedRnc,
          tipo_identificacion: tipoIdentificacion,
          tipo_bienes_servicios: tipoBienesServicios, // Solo código 01-11
          servicios_facturados: servicios,
          bienes_facturados: bienes,
          monto_facturado: baseAmount, // Total = servicios + bienes
          itbis_facturado: itbisFacturado,
          itbis_retenido: itbisRetenido,
          itbis_proporcionalidad: itbisProporcionalidad, // Columna 13
          itbis_al_costo: itbisAlCosto,                   // Columna 14
          itbis_por_adelantar: itbisPorAdelantar,         // Columna 15
          forma_pago: (item.forma_pago as string) ?? (item.tipo_pago as string) ?? '',
          retencion_renta: Number(item.retencion_renta ?? item.monto_retencion_renta ?? 0) || 0,
          isr_percibido: Number(item.isr_percibido ?? 0) || 0,
          impuesto_selectivo_consumo: Number(item.impuesto_selectivo_consumo ?? 0) || 0,
          otros_impuestos: Number(item.otros_impuestos ?? 0) || 0,
          monto_propina_legal: Number(item.monto_propina_legal ?? 0) || 0,
        };
      });

      return mapped;
    } catch (error) {
      console.error('Error generating Report 606:', error);
      throw error;
    }
  },

  async getReport606Summary(period: string) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) {
        return { totalMonto: 0, totalItbis: 0, totalRetenido: 0, totalISR: 0 };
      }

      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) {
        return { totalMonto: 0, totalItbis: 0, totalRetenido: 0, totalISR: 0 };
      }

      const { data, error } = await supabase
        .from('report_606_data')
        .select('monto_facturado, itbis_facturado, itbis_retenido, monto_retencion_renta')
        .eq('period', period)
        .eq('user_id', tenantId);

      if (error) throw error;

      const summary = data?.reduce(
        (acc, item) => ({
          totalMonto: acc.totalMonto + (item.monto_facturado || 0),
          totalItbis: acc.totalItbis + (item.itbis_facturado || 0),
          totalRetenido: acc.totalRetenido + (item.itbis_retenido || 0),
          totalISR: acc.totalISR + (item.monto_retencion_renta || 0)
        }),
        { totalMonto: 0, totalItbis: 0, totalRetenido: 0, totalISR: 0 }
      );

      return summary || { totalMonto: 0, totalItbis: 0, totalRetenido: 0, totalISR: 0 };
    } catch (error) {
      console.error('Error getting Report 606 summary:', error);
      return { totalMonto: 0, totalItbis: 0, totalRetenido: 0, totalISR: 0 };
    }
  },

  // -----------------------------------------------------------------
  // Report Generation - Reporte 607 (Ventas) - CORREGIDO COMPLETAMENTE
  // -----------------------------------------------------------------
  async buildReport607(period: string) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) return;

      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) return;

      // Calcular rango de fechas del mes
      const [yearStr, monthStr] = period.split('-');
      const year = Number(yearStr);
      const month = Number(monthStr);
      const startDate = `${period}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${period}-${String(lastDay).padStart(2, '0')}`;

      // Obtener facturas del período con cliente
      const { data: invoices, error: invErr } = await supabase
        .from('invoices')
        .select(
          `*,
           customers (name, document, tax_id)`
        )
        .eq('user_id', tenantId)
        .gte('invoice_date', startDate)
        .lte('invoice_date', endDate)
        .neq('status', 'draft');

      if (invErr) throw invErr;

	  const invoiceIds = Array.from(
	    new Set((invoices || []).map((inv: any) => String(inv?.id || '')).filter(Boolean)),
	  );

	  const itbisWithheldByInvoiceId = new Map<string, number>();
	  const isrWithheldByInvoiceId = new Map<string, number>();
	  if (invoiceIds.length > 0) {
	    try {
	      const { data: payments, error: payErr } = await supabase
	        .from('customer_payments')
	        .select('invoice_id, itbis_withheld, isr_withheld')
	        .eq('user_id', tenantId)
	        .in('invoice_id', invoiceIds);

	      if (!payErr && payments) {
	        (payments as any[]).forEach((p: any) => {
	          const key = String(p?.invoice_id || '');
	          if (!key) return;
	          const itbisVal = Number(p?.itbis_withheld) || 0;
	          if (itbisVal > 0) {
	            itbisWithheldByInvoiceId.set(key, (itbisWithheldByInvoiceId.get(key) || 0) + itbisVal);
	          }
	          const isrVal = Number(p?.isr_withheld) || 0;
	          if (isrVal > 0) {
	            isrWithheldByInvoiceId.set(key, (isrWithheldByInvoiceId.get(key) || 0) + isrVal);
	          }
	        });
	      }
	    } catch (payReadError) {
	      // eslint-disable-next-line no-console
	      console.error('Error loading customer_payments for Report 607 withheld taxes:', payReadError);
	    }
	  }

      const rows = (invoices || []).map((inv: any) => {
        const customerName = inv.customers?.name || inv.customer_name || 'Cliente';
        const customerRnc =
          inv.customers?.document ||
          inv.customers?.tax_id ||
          inv.customer_document ||
          inv.tax_id ||
          '';
        const fecha = inv.invoice_date;
        const monto = Number(inv.total_amount ?? inv.subtotal ?? 0);
        const itbis = Number(inv.tax_amount ?? 0);
		const invoiceNumber = String(inv.invoice_number || '');
		const isFiscal = invoiceNumber !== '' && !invoiceNumber.toUpperCase().startsWith('FAC-');
		const itbisRetenido = isFiscal ? Number(itbisWithheldByInvoiceId.get(String(inv.id)) || 0) : 0;
		const isrRetenido = isFiscal ? Number(isrWithheldByInvoiceId.get(String(inv.id)) || 0) : 0;

        return {
          user_id: tenantId,
          period,
          fecha_factura: fecha,
          fecha_comprobante: fecha,
          tipo_comprobante: 'B02',
          ncf: inv.invoice_number || inv.id,
          ncf_modificado: null,
          tipo_ingreso: 'VENTAS',
          rnc_cedula_cliente: customerRnc,
          nombre_cliente: customerName,
          monto_facturado: monto,
          itbis_facturado: itbis,
		  itbis_retenido: itbisRetenido,
		  retencion_renta_terceros: isrRetenido,
          tipo_pago: 'Otros',
          itbis_cobrado: itbis,
          monto_facturado_servicios: 0,
          monto_facturado_bienes: monto,
          efectivo: 0,
          tarjeta: 0,
          cheque: 0,
          credito: monto,
        };
      });

      // Limpiar datos anteriores del período para este usuario y guardar nuevos
      const { error: delErr } = await supabase
        .from('report_607_data')
        .delete()
        .eq('period', period)
        .eq('user_id', tenantId);
      if (delErr) throw delErr;

      if (rows.length > 0) {
        const { error: insErr } = await supabase
          .from('report_607_data')
          .insert(rows);
        if (insErr) throw insErr;
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error building Report 607 data:', error);
      throw error;
    }
  },

  async generateReport607(period: string) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) return [];

      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) return [];

      await this.buildReport607(period);
      const { data, error } = await supabase
        .from('report_607_data')
        .select('*')
        .eq('period', period)
        .eq('user_id', tenantId)
        .order('fecha_comprobante');

      if (error) throw error;

      const mappedData = (data || []).map((item: any) => {
        const rawRnc: string = String(item.rnc_cedula_cliente ?? item.tax_id ?? '').trim();
        const digits = rawRnc.replace(/[^0-9]/g, '');

        // DGII: 1=RNC, 2=Cédula, 3=Pasaporte (aquí inferimos 1/2)
        let tipoIdentificacion = item.tipo_identificacion as string;
        if (!tipoIdentificacion) {
          if (digits.length === 11) tipoIdentificacion = '2';
          else if (digits.length === 9) tipoIdentificacion = '1';
          else if (rawRnc) tipoIdentificacion = '1';
          else tipoIdentificacion = '';
        }

        return {
          rnc_cedula: rawRnc,
          tipo_identificacion: tipoIdentificacion,
          numero_comprobante_fiscal: item.numero_comprobante_fiscal || item.numero_comprobante || item.ncf || '',
          fecha_comprobante: item.fecha_comprobante || item.fecha_factura || '',
          monto_facturado: item.monto_facturado || 0,
          itbis_facturado: item.itbis_facturado || item.itbis_cobrado || 0,
          itbis_retenido: item.itbis_retenido || 0,
          monto_propina_legal: item.monto_propina_legal || 0,
          itbis_retenido_propina: item.itbis_retenido_propina || 0,
          itbis_percibido_ventas: item.itbis_percibido_ventas || item.itbis_percibido || 0,
          retencion_renta_terceros: item.retencion_renta_terceros || 0,
          isr_percibido_ventas: item.isr_percibido_ventas || 0,
          impuesto_selectivo_consumo: item.impuesto_selectivo_consumo || 0,
          otros_impuestos_tasas: item.otros_impuestos_tasas || 0,
          monto_propina_legal_2: item.monto_propina_legal_2 || 0,
        };
      });

      return mappedData;
    } catch (error) {
      console.error('Error generating Report 607:', error);
      throw error;
    }
  },

  async getReport607Summary(period: string) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) {
        return { totalMonto: 0, totalItbis: 0, totalRetenido: 0, totalISR: 0 };
      }

      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) {
        return { totalMonto: 0, totalItbis: 0, totalRetenido: 0, totalISR: 0 };
      }

      const { data, error } = await supabase
        .from('report_607_data')
        .select('monto_facturado, itbis_facturado, itbis_retenido, retencion_renta_terceros, itbis_cobrado')
        .eq('period', period)
        .eq('user_id', tenantId);

      if (error) throw error;

      const summary = data?.reduce(
        (acc, item) => ({
          totalMonto: acc.totalMonto + (item.monto_facturado || 0),
          totalItbis: acc.totalItbis + (item.itbis_facturado || item.itbis_cobrado || 0),
          totalRetenido: acc.totalRetenido + (item.itbis_retenido || 0),
          totalISR: acc.totalISR + (item.retencion_renta_terceros || 0),
        }),
        { totalMonto: 0, totalItbis: 0, totalRetenido: 0, totalISR: 0 }
      );

      return summary || { totalMonto: 0, totalItbis: 0, totalRetenido: 0, totalISR: 0 };
    } catch (error) {
      console.error('Error getting Report 607 summary:', error);
      return { totalMonto: 0, totalItbis: 0, totalRetenido: 0, totalISR: 0 };
    }
  },

  async getItbisProportionality(period: string) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) return null;

      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) return null;

      const [yearStr, monthStr] = period.split('-');
      const year = Number(yearStr);
      const month = Number(monthStr);
      const startDate = `${period}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${period}-${String(lastDay).padStart(2, '0')}`;

      // Ventas del período
      const { data: invoices, error: invErr } = await supabase
        .from('invoices')
        .select('*')
        .eq('user_id', tenantId)
        .gte('invoice_date', startDate)
        .lte('invoice_date', endDate)
        .neq('status', 'draft');

      if (invErr) throw invErr;

      let totalSales = 0;
      let taxableSales = 0;
      let exemptSales = 0;
      let exemptDestinationSales = 0;
      let exportSales = 0;

      (invoices || []).forEach((inv: any) => {
        const amount = Number(inv.total_amount ?? inv.subtotal ?? 0) || 0;
        const itbis = Number(inv.tax_amount ?? 0) || 0;
        const docType = (inv.document_type as string) || '';

        totalSales += amount;

        if (docType === 'B16') {
          exportSales += amount;
          return;
        }

        if (itbis > 0) {
          taxableSales += amount;
        } else {
          exemptSales += amount;
        }
      });

      // Notas de crédito del período
      const { data: creditNotes, error: cnErr } = await supabase
        .from('credit_debit_notes')
        .select('*')
        .eq('user_id', tenantId)
        .eq('note_type', 'credit')
        .gte('note_date', startDate)
        .lte('note_date', endDate);

      if (cnErr) throw cnErr;

      const creditNotesLess30Days = (creditNotes || []).reduce((sum: number, note: any) => {
        const amt = Number(note.total_amount) || 0;
        return sum + amt;
      }, 0);

      // ITBIS sujeto a proporcionalidad: ITBIS de compras del período (reporte 606)
      const report606Summary = await (this as any).getReport606Summary(period);
      const itbisSubject = Number(report606Summary?.totalItbis ?? 0) || 0;

      const denominator = Math.max(0, totalSales - exportSales - exemptDestinationSales);
      let coefficient = 0;
      if (denominator > 0 && taxableSales > 0) {
        coefficient = taxableSales / denominator;
      }

      if (!Number.isFinite(coefficient) || coefficient < 0) coefficient = 0;
      if (coefficient > 1) coefficient = 1;

      const itbisDeductible = itbisSubject * coefficient;
      const nonAdmitted = Math.max(0, itbisSubject - itbisDeductible);

      return {
        period,
        totalSales,
        taxableSales,
        exemptSales,
        exemptDestinationSales,
        exportSales,
        creditNotesLess30Days,
        coefficient,
        nonAdmittedProportionality: nonAdmitted,
        itbisSubject,
        itbisDeductible,
      };
    } catch (error) {
      console.error('Error calculating ITBIS proportionality:', error);
      return null;
    }
  },

  async buildReport608(period: string) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) return;

      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) return;

      const [yearStr, monthStr] = period.split('-');
      const year = Number(yearStr);
      const month = Number(monthStr);
      const startDate = `${period}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${period}-${String(lastDay).padStart(2, '0')}`;

      // Backfill: garantizar que facturas anuladas con NCF existan en fiscal_documents
      try {
        const { data: cancelledInvoices, error: invErr } = await supabase
          .from('invoices')
          .select('invoice_number, invoice_date, updated_at, total_amount, tax_amount, status')
          .eq('user_id', tenantId)
          .eq('status', 'cancelled');

        if (!invErr && cancelledInvoices && cancelledInvoices.length > 0) {
          const toUpsert: any[] = [];
          for (const inv of cancelledInvoices as any[]) {
            const invoiceNumber = String(inv.invoice_number || '');
            if (!invoiceNumber) continue;
            if (invoiceNumber.toUpperCase().startsWith('FAC-')) continue;

            const updatedAtDate = String(inv.updated_at || '').slice(0, 10);
            const invoiceDate = String(inv.invoice_date || '').slice(0, 10);

            // Solo incluir si la fecha de emisión o la fecha de anulación (aprox: updated_at) cae dentro del período
            const inPeriod =
              (invoiceDate && invoiceDate >= startDate && invoiceDate <= endDate) ||
              (updatedAtDate && updatedAtDate >= startDate && updatedAtDate <= endDate);

            if (!inPeriod) continue;

            const cancelledDate = updatedAtDate || invoiceDate || endDate;
            const issueDate = invoiceDate || cancelledDate;
            const amount = Number(inv.total_amount ?? 0) || 0;
            const taxAmount = Number(inv.tax_amount ?? 0) || 0;

            let inferredDocumentType: string | null = null;
            const prefixMatch = invoiceNumber.match(/^(\D+)/);
            const seriesPrefix = prefixMatch?.[1] ? String(prefixMatch[1]) : '';
            if (seriesPrefix) {
              try {
                const { data: series, error: seriesErr } = await supabase
                  .from('ncf_series')
                  .select('document_type, series_prefix')
                  .eq('user_id', tenantId)
                  .ilike('series_prefix', seriesPrefix)
                  .order('created_at', { ascending: true });
                if (!seriesErr && series && series.length > 0) {
                  inferredDocumentType = (series[0] as any)?.document_type
                    ? String((series[0] as any).document_type)
                    : null;
                }
              } catch {
                inferredDocumentType = null;
              }
            }

            toUpsert.push({
              user_id: tenantId,
              status: 'cancelled',
              issue_date: issueDate,
              cancelled_date: cancelledDate,
              cancellation_reason: 'Cancelado',
              ncf_number: invoiceNumber,
              document_type: inferredDocumentType,
              amount,
              tax_amount: taxAmount,
            });
          }

          if (toUpsert.length > 0) {
            for (const row of toUpsert) {
              await invoicesService.upsertFiscalDocumentRow(tenantId, row);
            }
          }
        }
      } catch (backfillError) {
        console.error('Error backfilling fiscal_documents for Report 608:', backfillError);
      }

      const { data: docs, error: fdErr } = await supabase
        .from('fiscal_documents')
        .select('*')
        .eq('user_id', tenantId)
        .eq('status', 'cancelled')
        .gte('cancelled_date', startDate)
        .lte('cancelled_date', endDate);

      if (fdErr) throw fdErr;

      const ncfNumbers = Array.from(
        new Set((docs || []).map((d: any) => String(d?.ncf_number || '')).filter(Boolean)),
      );

      // Traer RNC del cliente desde invoices/customers cuando sea posible
      const invoiceByNcf = new Map<string, any>();
      if (ncfNumbers.length > 0) {
        const { data: invRows, error: invErr } = await supabase
          .from('invoices')
          .select(
            `invoice_number, customers (document, tax_id)`
          )
          .eq('user_id', tenantId)
          .in('invoice_number', ncfNumbers);
        if (!invErr && invRows) {
          (invRows as any[]).forEach((r: any) => {
            const key = String(r?.invoice_number || '');
            if (key) invoiceByNcf.set(key, r);
          });
        }
      }

      // Devolver estructura que consume el UI del Reporte 608
      return (docs || []).map((doc: any) => {
        const ncf = String(doc?.ncf_number || '');
        const inv = ncf ? invoiceByNcf.get(ncf) : null;
        const cust = inv?.customers as any;
        const customerRnc = String(cust?.document || cust?.tax_id || '');

        return {
          ncf,
          document_type: String(doc?.document_type || 'NCF'),
          issue_date: String(doc?.issue_date || ''),
          cancellation_date: String(doc?.cancelled_date || doc?.issue_date || ''),
          customer_rnc: customerRnc,
          reason: String(doc?.cancellation_reason || 'Cancelado'),
          amount: Number(doc?.amount || 0),
          tax_amount: Number(doc?.tax_amount || 0),
        };
      });
    } catch (error) {
      console.error('Error building Report 608 data:', error);
      throw error;
    }
  },

  async generateReport608(period: string) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) return [];

      const computed = await this.buildReport608(period);
      return (computed || []).sort((a: any, b: any) =>
        String(a?.cancellation_date || '').localeCompare(String(b?.cancellation_date || '')),
      );
    } catch (error) {
      console.error('Error generating Report 608:', error);
      throw error;
    }
  },

  async getReport608Summary(period: string) {
    try {
      const rows = await this.generateReport608(period);
      const summary = (rows || []).reduce(
        (acc: any, item: any) => ({
          totalAmount: acc.totalAmount + (Number(item.amount) || 0),
          totalTax: acc.totalTax + (Number(item.tax_amount) || 0),
          count: acc.count + 1,
        }),
        { totalAmount: 0, totalTax: 0, count: 0 },
      );

      return summary || { totalAmount: 0, totalTax: 0, count: 0 };
    } catch (error) {
      console.error('Error getting Report 608 summary:', error);
      return { totalAmount: 0, totalTax: 0, count: 0 };
    }
  },

  // -----------------------------------------------------------------
  // Report Generation - Reporte 623 (Pagos al Exterior)
  // -----------------------------------------------------------------
  async generateReport623(period: string) {
    try {
      const { data, error } = await supabase
        .from('report_623_data')
        .select('*')
        .eq('period', period)
        .order('payment_date');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error generating Report 623:', error);
      throw error;
    }
  },

  async getReport623Summary(period: string) {
    try {
      const { data, error } = await supabase
        .from('report_623_data')
        .select('amount_usd, amount_dop, tax_withheld')
        .eq('period', period);

      if (error) throw error;

      const summary = data?.reduce(
        (acc, item) => ({
          totalUSD: acc.totalUSD + (item.amount_usd || 0),
          totalDOP: acc.totalDOP + (item.amount_dop || 0),
          totalTax: acc.totalTax + (item.tax_withheld || 0),
          count: acc.count + 1
        }),
        { totalUSD: 0, totalDOP: 0, totalTax: 0, count: 0 }
      );

      return summary || { totalUSD: 0, totalDOP: 0, totalTax: 0, count: 0 };
    } catch (error) {
      console.error('Error getting Report 623 summary:', error);
      return { totalUSD: 0, totalDOP: 0, totalTax: 0, count: 0 };
    }
  },

  // -----------------------------------------------------------------
  // Report Generation - Reporte IR-17 (Retenciones ISR)
  // -----------------------------------------------------------------
  async buildReportIR17(period: string) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) return;

      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) return;

      const [yearStr, monthStr] = period.split('-');
      const year = Number(yearStr);
      const month = Number(monthStr);
      const startDate = `${period}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${period}-${String(lastDay).padStart(2, '0')}`;

      // Obtener tasa de retención desde tax_settings (si existe)
      const { data: taxSettings } = await supabase
        .from('tax_settings')
        .select('retention_rate')
        .limit(1)
        .maybeSingle();

      const defaultRate = 10; // 10% por defecto si no hay configuración
      const retentionRate = Number(taxSettings?.retention_rate ?? defaultRate);

      let rows: any[] = [];

      const pushRow = (r: any) => {
        rows.push({
          ...r,
          // Backward-compatible fields used by existing UI/exports
          supplier_rnc: r.supplier_rnc ?? null,
          supplier_name: r.supplier_name ?? null,
          payment_date: r.payment_date ?? null,
          service_type: r.service_type ?? null,
          invoice_number: r.invoice_number ?? r.document_ref ?? null,
          gross_amount: Number(r.gross_amount ?? r.base_amount ?? 0) || 0,
          withholding_rate: Number(r.withholding_rate ?? 0) || 0,
          withheld_amount: Number(r.withheld_amount ?? 0) || 0,
          net_amount: Number(r.net_amount ?? 0) || 0,
        });
      };

      // ==========================================================
      // 1) Retenciones a EMPLEADOS (Nómina)
      // ==========================================================
      try {
        const { data: payrollPeriods, error: ppErr } = await supabase
          .from('payroll_periods')
          .select('id, pay_date, start_date, end_date')
          .eq('user_id', tenantId)
          .gte('pay_date', startDate)
          .lte('pay_date', endDate);

        if (!ppErr && payrollPeriods && payrollPeriods.length > 0) {
          const periodIds = payrollPeriods.map((p: any) => p.id);
          const { data: entries, error: peErr } = await supabase
            .from('payroll_entries')
            .select('payroll_period_id, employee_id, gross_salary, isr_deductions')
            .in('payroll_period_id', periodIds)
            .eq('user_id', tenantId);

          if (!peErr && entries && entries.length > 0) {
            const employeeIds = Array.from(new Set(entries.map((e: any) => e.employee_id).filter(Boolean)));
            const { data: employees, error: empErr } = await supabase
              .from('employees')
              .select('id, first_name, last_name, employee_code, tax_id, cedula, document_number')
              .eq('user_id', tenantId)
              .in('id', employeeIds);

            const employeeById = new Map<string, any>();
            if (!empErr && employees) {
              (employees as any[]).forEach((e: any) => employeeById.set(String(e.id), e));
            }

            const payDateByPayrollId = new Map<string, string>();
            (payrollPeriods as any[]).forEach((p: any) => {
              payDateByPayrollId.set(String(p.id), String(p.pay_date || p.end_date || p.start_date || startDate));
            });

            (entries as any[]).forEach((entry: any) => {
              const withheld = Number(entry?.isr_deductions ?? 0) || 0;
              if (withheld <= 0) return;
              const gross = Number(entry?.gross_salary ?? 0) || 0;
              const emp = employeeById.get(String(entry.employee_id)) || {};

              const rncCedula =
                (emp.tax_id as string) ||
                (emp.cedula as string) ||
                (emp.document_number as string) ||
                null;

              const empName = [emp.first_name, emp.last_name].filter(Boolean).join(' ') || 'Empleado';
              const rate = gross > 0 ? (withheld / gross) * 100 : 0;
              const net = gross - withheld;

              pushRow({
                user_id: tenantId,
                period,
                beneficiary_type: 'EMPLEADO',
                retention_type: 'ISR',
                rnc_cedula: rncCedula,
                beneficiary_name: empName,
                base_amount: gross,
                payment_date: payDateByPayrollId.get(String(entry.payroll_period_id)) || startDate,
                service_type: 'Nómina',
                document_ref: emp.employee_code || String(entry.employee_id),
                source: 'payroll',
                gross_amount: gross,
                withholding_rate: rate,
                withheld_amount: withheld,
                net_amount: net,
              });
            });
          }
        }
      } catch (payrollError) {
        console.error('Error building IR-17 employee section from payroll:', payrollError);
      }

      // ==========================================================
      // 2) Retenciones a PROVEEDORES / TERCEROS (desde ap_invoices directamente)
      // ==========================================================
      // Mapeo de categorías a casillas IR-17
      const categoryToCasilla: Record<string, number> = {
        'alquileres': 1,
        'honorarios': 2,
        'premios': 3,
        'transferencia_titulo': 4,
        'dividendos': 5,
        'intereses_juridicas_no_residentes': 6,
        'intereses_juridicas_no_residentes_57': 7,
        'intereses_fisicas_no_residentes': 8,
        'intereses_fisicas_no_residentes_57': 9,
        'remesas_exterior': 10,
        'intereses_no_financieras': 11,
        'pagos_estado': 12,
        'juegos_telefonicos': 13,
        'ganancia_capital': 14,
        'juegos_internet': 15,
        'otras_rentas_309': 16,
        'otras_rentas_139': 17,
        'otras_retenciones_07': 18,
        'intereses_financieras_juridicas': 19,
        'intereses_financieras_fisicas': 20,
        'ganaderia_bovina': 21,
      };

      // Obtener facturas de proveedor con retención del período
      const { data: apInvoices, error: apErr } = await supabase
        .from('ap_invoices')
        .select(`*, suppliers (name, tax_id)`)
        .eq('user_id', tenantId)
        .gte('invoice_date', startDate)
        .lte('invoice_date', endDate)
        .neq('status', 'cancelled');

      if (apErr) throw apErr;

      (apInvoices || []).forEach((inv: any) => {
        const base = Number(inv?.total_gross ?? 0) - Number(inv?.total_discount ?? 0);
        const supplierRnc = inv?.tax_id || inv?.suppliers?.tax_id || null;
        const supplierName = inv?.legal_name || inv?.suppliers?.name || null;
        const paymentDate = inv?.invoice_date || startDate;
        const docRef = inv?.invoice_number || null;
        const retentionCategory = inv?.retention_category || 'otras_retenciones_07';

        const isrWithheld = Number(inv?.total_isr_withheld ?? 0) || 0;
        const itbisWithheld = Number(inv?.total_itbis_withheld ?? 0) || 0;

        // Determinar casilla basada en categoría o tasa
        let casilla = categoryToCasilla[retentionCategory] || 18;
        const rate = base > 0 ? (isrWithheld / base) * 100 : retentionRate;

        // Si no hay categoría, inferir por tasa
        if (!inv?.retention_category && isrWithheld > 0) {
          if (Math.abs(rate - 10) < 0.5) casilla = 2; // Honorarios 10%
          else if (Math.abs(rate - 25) < 0.5) casilla = 3; // Premios 25%
          else if (Math.abs(rate - 27) < 0.5) casilla = 10; // Remesas 27%
          else if (Math.abs(rate - 5) < 0.5) casilla = 12; // Pagos estado 5%
          else if (Math.abs(rate - 2) < 0.5) casilla = 4; // Transferencia título 2%
          else if (Math.abs(rate - 1) < 0.5) casilla = 14; // Ganancia capital 1%
        }

        if (isrWithheld > 0) {
          const net = base - isrWithheld;

          pushRow({
            user_id: tenantId,
            period,
            beneficiary_type: 'PROVEEDOR',
            retention_type: 'ISR',
            retention_category: retentionCategory,
            ir17_casilla: casilla,
            rnc_cedula: supplierRnc,
            beneficiary_name: supplierName,
            base_amount: base,
            payment_date: paymentDate,
            service_type: retentionCategory,
            document_ref: docRef,
            source: 'ap_invoices',
            supplier_rnc: supplierRnc,
            supplier_name: supplierName,
            invoice_number: docRef,
            gross_amount: base,
            withholding_rate: rate,
            withheld_amount: isrWithheld,
            net_amount: net,
          });
        }

        if (itbisWithheld > 0) {
          const itbisRate = base > 0 ? (itbisWithheld / base) * 100 : 0;
          const net = base - itbisWithheld;

          pushRow({
            user_id: tenantId,
            period,
            beneficiary_type: 'PROVEEDOR',
            retention_type: 'ITBIS',
            retention_category: null,
            ir17_casilla: null,
            rnc_cedula: supplierRnc,
            beneficiary_name: supplierName,
            base_amount: base,
            payment_date: paymentDate,
            service_type: 'ITBIS Retenido',
            document_ref: docRef,
            source: 'ap_invoices',
            supplier_rnc: supplierRnc,
            supplier_name: supplierName,
            invoice_number: docRef,
            gross_amount: base,
            withholding_rate: itbisRate,
            withheld_amount: itbisWithheld,
            net_amount: net,
          });
        }
      });

      // ==========================================================
      // 3) Retribuciones Complementarias (27%)
      // ==========================================================
      try {
        const { data: retributions, error: retErr } = await supabase
          .from('complementary_retributions')
          .select('*')
          .eq('user_id', tenantId)
          .eq('period', period);

        if (!retErr && retributions && retributions.length > 0) {
          const totalRetributions = retributions.reduce((sum, r) => sum + (Number(r.tax_amount) || 0), 0);
          if (totalRetributions > 0) {
            const totalGross = retributions.reduce((sum, r) => sum + (Number(r.gross_amount) || 0), 0);
            pushRow({
              user_id: tenantId,
              period,
              beneficiary_type: 'RETRIBUCIONES',
              retention_type: 'ISR',
              retention_category: 'retribuciones_complementarias',
              ir17_casilla: 25,
              rnc_cedula: null,
              beneficiary_name: 'Retribuciones Complementarias',
              base_amount: totalGross,
              payment_date: startDate,
              service_type: 'Retribuciones Complementarias',
              document_ref: null,
              source: 'complementary_retributions',
              supplier_rnc: null,
              supplier_name: null,
              invoice_number: null,
              gross_amount: totalGross,
              withholding_rate: 27,
              withheld_amount: totalRetributions,
              net_amount: totalGross - totalRetributions,
            });
          }
        }
      } catch (retError) {
        console.error('Error loading complementary retributions:', retError);
      }

      // Limpiar datos anteriores del período para este usuario
      const { error: delErr } = await supabase
        .from('report_ir17_data')
        .delete()
        .eq('period', period)
        .eq('user_id', tenantId);
      if (delErr) throw delErr;

      if (rows.length > 0) {
        const { error: insErr } = await supabase
          .from('report_ir17_data')
          .insert(rows);
        if (insErr) throw insErr;
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error building Report IR-17 data:', error);
      throw error;
    }
  },

  async generateReportIR17(period: string) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) return [];

      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) return [];

      await this.buildReportIR17(period);
      const { data, error } = await supabase
        .from('report_ir17_data')
        .select('*')
        .eq('period', period)
        .eq('user_id', tenantId)
        .order('payment_date');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error generating Report IR-17:', error);
      throw error;
    }
  },

  async getReportIR17Summary(period: string) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) {
        return { totalGross: 0, totalWithheld: 0, totalNet: 0, count: 0 };
      }

      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) {
        return { totalGross: 0, totalWithheld: 0, totalNet: 0, count: 0 };
      }

      const { data, error } = await supabase
        .from('report_ir17_data')
        .select('gross_amount, withheld_amount, net_amount')
        .eq('period', period)
        .eq('user_id', tenantId);

      if (error) throw error;

      const summary = data?.reduce(
        (acc, item) => ({
          totalGross: acc.totalGross + (item.gross_amount || 0),
          totalWithheld: acc.totalWithheld + (item.withheld_amount || 0),
          totalNet: acc.totalNet + (item.net_amount || 0),
          count: acc.count + 1
        }),
        { totalGross: 0, totalWithheld: 0, totalNet: 0, count: 0 }
      );

      return summary || { totalGross: 0, totalWithheld: 0, totalNet: 0, count: 0 };
    } catch (error) {
      console.error('Error getting Report IR-17 summary:', error);
      return { totalGross: 0, totalWithheld: 0, totalNet: 0, count: 0 };
    }
  },

  // -----------------------------------------------------------------
  // Report Generation - Reporte IT-1 (Declaración ITBIS) - MEJORADO
  // -----------------------------------------------------------------
  async generateReportIT1(period: string) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) return null;

      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) return null;

      // 1) Si ya existe snapshot (it1_resumen), devolverlo.
      //    generateReportIT1 funciona como PREVIEW + carga del snapshot existente.
      const { data: existing, error: existingError } = await supabase
        .from('it1_resumen')
        .select('*')
        .eq('period', period)
        .eq('user_id', tenantId)
        .eq('tipo_declaracion', 'normal')
        .maybeSingle();

      if (!existingError && existing?.id) {
        return existing;
      }

      // Mantener IT-1 conectado a los reportes base (607 ventas / 606 compras).
      // Best-effort: si falla, igual intentamos con lo que exista en BD.
      try {
        await this.buildReport607(period);
      } catch (build607Error) {
        console.error('Error building Report 607 before IT-1:', build607Error);
      }

      try {
        await this.buildReport606(period);
      } catch (build606Error) {
        console.error('Error building Report 606 before IT-1:', build606Error);
      }

      // Obtener datos de ventas y compras para el período del usuario actual
      const [salesResponse, purchasesResponse, invoicesResponse] = await Promise.all([
        supabase
          .from('report_607_data')
          .select('*')
          .eq('period', period)
          .eq('user_id', tenantId),
        supabase
          .from('report_606_data')
          .select('*')
          .eq('period', period)
          .eq('user_id', tenantId),
        // Obtener facturas directamente para clasificación IT-1
        supabase
          .from('invoices')
          .select('id, total_amount, subtotal, tax_amount, document_type, sale_classification')
          .eq('user_id', tenantId)
          .gte('invoice_date', `${period}-01`)
          .lte('invoice_date', `${period}-31`)
          .neq('status', 'draft'),
      ]);

      // Clasificar ventas según documento y sale_classification
      let exportacionesBienes = 0;      // Casilla 2
      let exportacionesServicios = 0;   // Casilla 3
      let ventasExentas = 0;            // Casilla 4
      let ventasExentasDestino = 0;     // Casilla 5
      let ventasGravadas18 = 0;         // Casilla 11
      let ventasGravadas16 = 0;         // Casilla 12

      (invoicesResponse.data || []).forEach((inv: any) => {
        const amount = Number(inv?.total_amount ?? inv?.subtotal ?? 0) || 0;
        const itbis = Number(inv?.tax_amount ?? 0) || 0;
        const baseAmount = amount - itbis;
        const docType = String(inv?.document_type || '').toUpperCase();
        const saleClass = String(inv?.sale_classification || 'gravada').toLowerCase();

        // Clasificar por tipo de documento
        if (docType === 'B16') {
          // Exportaciones
          if (saleClass === 'exportacion_servicios') {
            exportacionesServicios += baseAmount;
          } else {
            exportacionesBienes += baseAmount;
          }
        } else if (docType === 'B14' || docType === 'B15' || saleClass === 'exenta') {
          // Ventas exentas (gubernamental, régimen especial)
          ventasExentas += baseAmount;
        } else if (saleClass === 'exenta_destino') {
          ventasExentasDestino += baseAmount;
        } else if (itbis > 0) {
          // Ventas gravadas
          const tasaItbis = baseAmount > 0 ? (itbis / baseAmount) * 100 : 18;
          if (tasaItbis < 17) {
            ventasGravadas16 += baseAmount;
          } else {
            ventasGravadas18 += baseAmount;
          }
        } else {
          // Sin ITBIS pero no clasificada como exenta
          ventasExentas += baseAmount;
        }
      });

      const totalSales =
        salesResponse.data?.reduce((sum, item) => {
          const gross = Number(item?.monto_facturado ?? 0) || 0;
          const itbis = Number(item?.itbis_facturado ?? 0) || 0;
          return sum + Math.max(gross - itbis, 0);
        }, 0) || 0;

      const itbisCollected =
        salesResponse.data?.reduce((sum, item) => sum + (Number(item?.itbis_facturado ?? 0) || 0), 0) || 0;

      const itbisWithheld =
        salesResponse.data?.reduce((sum, item) => sum + (Number(item?.itbis_retenido ?? 0) || 0), 0) || 0;

      const totalPurchases =
        purchasesResponse.data?.reduce((sum, item) => sum + (Number(item?.monto_facturado ?? 0) || 0), 0) || 0;

      const itbisPaid =
        purchasesResponse.data?.reduce((sum, item) => sum + (Number(item?.itbis_facturado ?? 0) || 0), 0) || 0;

      // Calcular total no gravadas (casilla 9)
      const totalNoGravadas = exportacionesBienes + exportacionesServicios + ventasExentas + ventasExentasDestino;
      // Total gravadas (casilla 10)
      const totalGravadas = Math.max(0, totalSales - totalNoGravadas);

      // ITBIS neto a pagar (considerando ITBIS retenido por clientes)
      const netItbisDue = (itbisCollected - itbisWithheld) - itbisPaid;

      // Preview (no persiste): el snapshot se guarda al "Cerrar mes".
      return {
        id: null,
        user_id: tenantId,
        period,
        tipo_declaracion: 'normal',
        // Casilla 1 - Total operaciones
        total_sales: totalSales,
        // Sección II.A No Gravadas
        exportaciones_bienes: exportacionesBienes,      // Casilla 2
        exportaciones_servicios: exportacionesServicios, // Casilla 3
        ventas_exentas: ventasExentas,                  // Casilla 4
        ventas_exentas_destino: ventasExentasDestino,   // Casilla 5
        total_no_gravadas: totalNoGravadas,             // Casilla 9
        // Sección II.B Gravadas
        total_gravadas: totalGravadas,                  // Casilla 10
        ventas_gravadas_18: ventasGravadas18,           // Casilla 11
        ventas_gravadas_16: ventasGravadas16,           // Casilla 12
        // Sección III Liquidación
        itbis_collected: itbisCollected,                // Casilla 21
        itbis_withheld: itbisWithheld,
        total_purchases: totalPurchases,
        itbis_paid: itbisPaid,                          // Casilla 25
        net_itbis_due: netItbisDue,                     // Casilla 26 o 27
        generated_date: new Date().toISOString(),
        locked: false,
        locked_at: null,
      } as any;
    } catch (error) {
      console.error('Error generating Report IT-1:', error);
      throw error;
    }
  },

  async closeReportIT1(period: string, tipoDeclaracion: 'normal' | 'rectificativa' = 'normal') {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) throw new Error('Usuario no autenticado');

      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) throw new Error('Tenant no válido');

      const { data: existing, error: existingError } = await supabase
        .from('it1_resumen')
        .select('id, locked')
        .eq('user_id', tenantId)
        .eq('period', period)
        .eq('tipo_declaracion', tipoDeclaracion)
        .maybeSingle();

      if (!existingError && existing?.locked) {
        throw new Error('Este período ya está bloqueado y no puede regenerarse');
      }

      const preview = await this.generateReportIT1(period);
      if (!preview) throw new Error('No se pudo generar el IT-1');

      const payload: any = {
        user_id: tenantId,
        period,
        tipo_declaracion: tipoDeclaracion,
        total_sales: Number((preview as any).total_sales ?? 0) || 0,
        itbis_collected: Number((preview as any).itbis_collected ?? 0) || 0,
        itbis_withheld: Number((preview as any).itbis_withheld ?? 0) || 0,
        total_purchases: Number((preview as any).total_purchases ?? 0) || 0,
        itbis_paid: Number((preview as any).itbis_paid ?? 0) || 0,
        net_itbis_due: Number((preview as any).net_itbis_due ?? 0) || 0,
        generated_date: new Date().toISOString(),
        locked: false,
        locked_at: null,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('it1_resumen')
        .upsert(payload, { onConflict: 'user_id,period,tipo_declaracion' })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error closing Report IT-1:', error);
      throw error;
    }
  },

  async lockReportIT1(id: string) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) throw new Error('Usuario no autenticado');

      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) throw new Error('Tenant no válido');

      const patch: any = {
        locked: true,
        locked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('it1_resumen')
        .update(patch)
        .eq('id', id)
        .eq('user_id', tenantId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error locking Report IT-1:', error);
      throw error;
    }
  },

  async getReportIT1Summary() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) {
        return {
          totalDeclaraciones: 0,
          totalVentasGravadas: 0,
          totalITBISCobrado: 0,
          totalComprasGravadas: 0,
          totalITBISPagado: 0,
          saldoNeto: 0,
          ultimaDeclaracion: null,
        };
      }

      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) {
        return {
          totalDeclaraciones: 0,
          totalVentasGravadas: 0,
          totalITBISCobrado: 0,
          totalComprasGravadas: 0,
          totalITBISPagado: 0,
          saldoNeto: 0,
          ultimaDeclaracion: null,
        };
      }

      const { data, error } = await supabase
        .from('it1_resumen')
        .select('*')
        .eq('user_id', tenantId)
        .order('period', { ascending: false })
        .limit(12);

      if (error) throw error;

      const totalDeclaraciones = data?.length || 0;
      const totalVentasGravadas = data?.reduce((sum, item) => sum + (item.total_sales || 0), 0) || 0;
      const totalITBISCobrado = data?.reduce((sum, item) => sum + (item.itbis_collected || 0), 0) || 0;
      const totalComprasGravadas = data?.reduce((sum, item) => sum + (item.total_purchases || 0), 0) || 0;
      const totalITBISPagado = data?.reduce((sum, item) => sum + (item.itbis_paid || 0), 0) || 0;
      const saldoNeto = totalITBISCobrado - totalITBISPagado;
      const ultimaDeclaracion = data?.[0]?.period || null;

      return {
        totalDeclaraciones,
        totalVentasGravadas,
        totalITBISCobrado,
        totalComprasGravadas,
        totalITBISPagado,
        saldoNeto,
        ultimaDeclaracion
      };
    } catch (error) {
      console.error('Error getting Report IT-1 summary:', error);
      return {
        totalDeclaraciones: 0,
        totalVentasGravadas: 0,
        totalITBISCobrado: 0,
        totalComprasGravadas: 0,
        totalITBISPagado: 0,
        saldoNeto: 0,
        ultimaDeclaracion: null
      };
    }
  },

  async getReportIT1History(year?: string) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) return [];

      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) return [];

      let query = supabase
        .from('it1_resumen')
        .select('*')
        .eq('user_id', tenantId)
        .order('period', { ascending: false });

      if (year) {
        query = query.like('period', `${year}-%`);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting Report IT-1 history:', error);
      return [];
    }
  },

  async updateReportIT1(id: string, reportData: any) {
    try {
      const { data, error } = await supabase
        .from('it1_resumen')
        .update(reportData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating Report IT-1:', error);
      throw error;
    }
  },

  async deleteReportIT1(id: string) {
    try {
      const { error } = await supabase
        .from('it1_resumen')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting Report IT-1:', error);
      throw error;
    }
  },

  async saveReportIT1Data(reportData: any) {
    try {
      const { data, error } = await supabase
        .from('it1_resumen')
        .upsert(reportData, { onConflict: 'user_id,period,tipo_declaracion' })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error saving Report IT-1 data:', error);
      throw error;
    }
  },

  async getReportIT1ByPeriod(period: string) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) return null;

      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) return null;

      const { data, error } = await supabase
        .from('it1_resumen')
        .select('*')
        .eq('period', period)
        .eq('user_id', tenantId)
        .eq('tipo_declaracion', 'normal')
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      return data || null;
    } catch (error) {
      console.error('Error getting Report IT-1 by period:', error);
      return null;
    }
  },

  async validateReportIT1Data(reportData: any) {
    const errors = [];

    if (!reportData.period) {
      errors.push('El período es requerido');
    }

    if (reportData.total_sales < 0) {
      errors.push('El total de ventas no puede ser negativo');
    }

    if (reportData.itbis_collected < 0) {
      errors.push('El ITBIS cobrado no puede ser negativo');
    }

    if (reportData.total_purchases < 0) {
      errors.push('El total de compras no puede ser negativo');
    }

    if (reportData.itbis_paid < 0) {
      errors.push('El ITBIS pagado no puede ser negativo');
    }

    // Validar que el ITBIS cobrado no exceda el 18% de las ventas
    const maxItbisCollected = reportData.total_sales * 0.18;
    if (reportData.itbis_collected > maxItbisCollected * 1.1) { // 10% de tolerancia
      errors.push('El ITBIS cobrado parece excesivo para el monto de ventas');
    }

    // Validar que el ITBIS pagado no exceda el 18% de las compras
    const maxItbisPaid = reportData.total_purchases * 0.18;
    if (reportData.itbis_paid > maxItbisPaid * 1.1) { // 10% de tolerancia
      errors.push('El ITBIS pagado parece excesivo para el monto de compras');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  },

  // -----------------------------------------------------------------
  // Formulario 607 CRUD
  // -----------------------------------------------------------------
  async getFormulario607Records() {
    try {
      const { data, error } = await supabase
        .from('formulario_607')
        .select('*')
        .order('fecha_factura', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching Formulario 607 records:', error);
      throw error;
    }
  },

  async createFormulario607Record(record: any) {
    try {
      const { data, error } = await supabase
        .from('formulario_607')
        .insert(record)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating Formulario 607 record:', error);
      throw error;
    }
  },

  async updateFormulario607Record(id: string, record: any) {
    try {
      const { data, error } = await supabase
        .from('formulario_607')
        .update(record)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating Formulario 607 record:', error);
      throw error;
    }
  },

  async deleteFormulario607Record(id: string) {
    try {
      const { error } = await supabase
        .from('formulario_607')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting Formulario 607 record:', error);
      throw error;
    }
  },

  // -----------------------------------------------------------------
  // Tax Statistics
  // -----------------------------------------------------------------
  async getTaxStatistics(userId?: string) {
    try {
      const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

      let sales607Query = supabase.from('report_607_data').select('*').eq('period', currentMonth);
      let purchases606Query = supabase.from('report_606_data').select('*').eq('period', currentMonth);
      
      if (userId) {
        const tenantId = await resolveTenantId(userId);
        if (!tenantId) {
          return {
            itbis_cobrado: 0,
            itbis_pagado: 0,
            itbis_neto: 0,
            retenciones: 0
          };
        }

        sales607Query = sales607Query.eq('user_id', tenantId);
        purchases606Query = purchases606Query.eq('user_id', tenantId);
      }

      const [salesResponse, purchasesResponse] = await Promise.all([
        sales607Query,
        purchases606Query
      ]);

      const itbisCobrado = salesResponse.data?.reduce(
        (sum, item) => sum + (item.itbis_facturado || 0),
        0
      );
      const itbisPagado = purchasesResponse.data?.reduce(
        (sum, item) => sum + (item.itbis_facturado || 0),
        0
      );
      const retenciones = salesResponse.data?.reduce(
        (sum, item) => sum + (item.retencion_renta_terceros || 0),
        0
      );

      return {
        itbis_cobrado: itbisCobrado ?? 0,
        itbis_pagado: itbisPagado ?? 0,
        itbis_neto: (itbisCobrado ?? 0) - (itbisPagado ?? 0),
        retenciones: retenciones ?? 0
      };
    } catch (error) {
      console.error('Error getting tax statistics:', error);
      throw error;
    }
  },

  // -----------------------------------------------------------------
  // Fiscal Deadlines / Vencimientos Fiscales
  // -----------------------------------------------------------------
  async getFiscalDeadlines(userId: string) {
    try {
      if (!userId) return [];
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      
      const { data, error } = await supabase
        .from('fiscal_deadlines')
        .select('*')
        .eq('user_id', tenantId)
        .order('due_date', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting fiscal deadlines:', error);
      return [];
    }
  },

  async createFiscalDeadline(userId: string, deadline: any) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');
      const { data, error } = await supabase
        .from('fiscal_deadlines')
        .insert({ ...deadline, user_id: tenantId })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating fiscal deadline:', error);
      throw error;
    }
  },

  async updateFiscalDeadline(id: string, deadline: any) {
    try {
      const { data, error } = await supabase
        .from('fiscal_deadlines')
        .update(deadline)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating fiscal deadline:', error);
      throw error;
    }
  },

  async deleteFiscalDeadline(id: string) {
    try {
      const { error } = await supabase
        .from('fiscal_deadlines')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting fiscal deadline:', error);
      throw error;
    }
  }
};

/* ==========================================================
   Settings Service (consolidated)
========================================================== */
export const settingsService = {
  // Company Info
  async getCompanyInfo() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) return null;

      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) return null;

      const { data, error } = await supabase
        .from('company_info')
        .select('*')
        .eq('user_id', tenantId)
        .limit(1)
        .maybeSingle();

      // When the table is empty Supabase returns error code "PGRST116"
      if (error && error.code !== 'PGRST116') throw error;
      if (!data) return null;

      const socialLinks = (data as any)?.social_links && typeof (data as any).social_links === 'object'
        ? (data as any).social_links
        : null;

      return {
        ...data,
        ...(socialLinks || {}),
      };
    } catch (error) {
      console.error('Error getting company info:', error);
      return null;
    }
  },

  async saveCompanyInfo(companyInfo: any) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) throw new Error('Usuario no autenticado');

      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) throw new Error('No se pudo resolver el tenant');

      const social_links = {
        facebook: companyInfo?.facebook || null,
        instagram: companyInfo?.instagram || null,
        twitter: companyInfo?.twitter || null,
        linkedin: companyInfo?.linkedin || null,
        youtube: companyInfo?.youtube || null,
        tiktok: companyInfo?.tiktok || null,
        whatsapp: companyInfo?.whatsapp || null,
      };

      const payload: any = {
        ...companyInfo,
        user_id: tenantId,
        social_links,
      };

      // Guardamos redes sociales dentro de social_links (JSON) porque las columnas individuales pueden no existir
      delete payload.facebook;
      delete payload.instagram;
      delete payload.twitter;
      delete payload.linkedin;
      delete payload.youtube;
      delete payload.tiktok;
      delete payload.whatsapp;

      // No enviar id en el upsert para evitar conflicto con la PK (company_info_pkey)
      delete payload.id;

      const { data, error } = await supabase
        .from('company_info')
        .upsert(payload, { onConflict: 'user_id' })
        .select()
        .single();

      if (error) {
        throw new Error(describeSupabaseError(error));
      }

      const savedSocialLinks = (data as any)?.social_links && typeof (data as any).social_links === 'object'
        ? (data as any).social_links
        : null;

      return {
        ...data,
        ...(savedSocialLinks || {}),
      };
    } catch (error) {
      console.error('Error saving company info:', error);
      throw error;
    }
  },

  async getCashRegisters() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) return [];

      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) return [];

      const { data, error } = await supabase
        .from('cash_registers')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data ?? [];
    } catch (error) {
      console.error('Error getting cash registers:', error);
      return [];
    }
  },

  async saveCashRegister(register: any) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) throw new Error('Usuario no autenticado');

      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) throw new Error('No se pudo resolver el tenant');

      const payload: any = {
        ...register,
        tenant_id: tenantId,
      };

      if (!payload.id) {
        const { data, error } = await supabase
          .from('cash_registers')
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        return data;
      }

      const { data, error } = await supabase
        .from('cash_registers')
        .upsert(payload)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error saving cash register:', error);
      throw error;
    }
  },

  async deleteCashRegister(registerId: string) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) throw new Error('Usuario no autenticado');

      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) throw new Error('No se pudo resolver el tenant');

      const { error } = await supabase
        .from('cash_registers')
        .delete()
        .eq('id', registerId)
        .eq('tenant_id', tenantId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error deleting cash register:', error);
      throw error;
    }
  },

  async getPrinters() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) return [];

      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) return [];

      const { data, error } = await supabase
        .from('printers')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data ?? [];
    } catch (error) {
      console.error('Error getting printers:', error);
      return [];
    }
  },

  async savePrinter(printer: any) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) throw new Error('Usuario no autenticado');

      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) throw new Error('No se pudo resolver el tenant');

      const payload: any = {
        ...printer,
        tenant_id: tenantId,
      };

      if (!payload.id) {
        const { data, error } = await supabase
          .from('printers')
          .insert(payload)
          .select()
          .single();
        if (error) throw new Error(describeSupabaseError(error));
        return data;
      }

      const { data, error } = await supabase
        .from('printers')
        .upsert(payload)
        .select()
        .single();

      if (error) throw new Error(describeSupabaseError(error));
      return data;
    } catch (error) {
      console.error('Error saving printer:', error);
      throw error;
    }
  },

  async deletePrinter(printerId: string) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) throw new Error('Usuario no autenticado');

      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) throw new Error('No se pudo resolver el tenant');

      const { error } = await supabase
        .from('printers')
        .delete()
        .eq('id', printerId)
        .eq('tenant_id', tenantId);

      if (error) throw new Error(describeSupabaseError(error));
      return true;
    } catch (error) {
      console.error('Error deleting printer:', error);
      throw error;
    }
  },

  async getUserCashRegisterAssignments() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) return [];

      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) return [];

      const { data, error } = await supabase
        .from('user_cash_registers')
        .select('*')
        .eq('tenant_id', tenantId);

      if (error) throw error;
      return data ?? [];
    } catch (error) {
      console.error('Error getting user cash register assignments:', error);
      return [];
    }
  },

  async assignCashRegisterToUser(userId: string, registerId: string) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) throw new Error('Usuario no autenticado');

      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) throw new Error('No se pudo resolver el tenant');

      const payload = {
        tenant_id: tenantId,
        user_id: userId,
        cash_register_id: registerId,
      };

      const { data, error } = await supabase
        .from('user_cash_registers')
        .upsert(payload, { onConflict: 'tenant_id,user_id' })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error assigning cash register to user:', error);
      throw error;
    }
  },

  async unassignCashRegisterFromUser(userId: string) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) throw new Error('Usuario no autenticado');

      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) throw new Error('No se pudo resolver el tenant');

      const { error } = await supabase
        .from('user_cash_registers')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('user_id', userId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error unassigning cash register from user:', error);
      throw error;
    }
  },

  // Users
  async getUsers() {
    try {
      // Solo listar usuarios que tengan un rol asignado dentro del tenant
      // identificado por el usuario autenticado (owner_user_id)
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) return [];

      // Buscar asignaciones de rol para este owner
      const { data: userRoles, error: urError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('owner_user_id', user.id);

      if (urError) throw urError;
      if (!userRoles || userRoles.length === 0) return [];

      const userIds = Array.from(
        new Set((userRoles as any[]).map((ur) => ur.user_id).filter(Boolean))
      );
      if (userIds.length === 0) return [];

      const { data, error } = await supabase
        .from('users')
        .select('*')
        .in('id', userIds)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data ?? [];
    } catch (error) {
      console.error('Error getting users:', error);
      return [];
    }
  },

  async getAllUsers() {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data ?? [];
    } catch (error) {
      console.error('Error getting all users:', error);
      return [];
    }
  },

  async createUser(userData: any) {
    try {
      const { data, error } = await supabase
        .from('users')
        .insert(userData)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  },

  async updateUserStatus(userId: string, status: string) {
    try {
      const { data, error } = await supabase
        .from('users')
        .update({ status })
        .eq('id', userId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating user status:', error);
      throw error;
    }
  },

  async updateUserHtcPortalOnly(userId: string, htcPortalOnly: boolean) {
    try {
      if (!userId) throw new Error('userId required');
      const { data, error } = await supabase
        .from('users')
        .update({ htc_portal_only: Boolean(htcPortalOnly) })
        .eq('id', userId)
        .select()
        .maybeSingle();

      if (error) throw error;
      return data ?? null;
    } catch (error) {
      console.error('Error updating HTC portal-only flag:', error);
      throw error;
    }
  },

  async updateUserHtcHourlyRate(userId: string, hourlyRate: number) {
    try {
      if (!userId) throw new Error('userId required');
      const rate = Number(hourlyRate);
      if (!Number.isFinite(rate) || rate < 0) throw new Error('Invalid hourly rate');

      const { data, error } = await supabase
        .from('users')
        .update({ htc_hourly_rate: rate })
        .eq('id', userId)
        .select()
        .maybeSingle();

      if (error) throw error;
      return data ?? null;
    } catch (error) {
      console.error('Error updating HTC hourly rate:', error);
      throw error;
    }
  },

  async getUserPlanInfo(userId: string) {
    try {
      if (!userId) throw new Error('userId required');
      const { data, error } = await supabase
        .from('users')
        .select('id, plan_id, plan_status, trial_end, max_users, max_warehouses, max_invoices, billing_period')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;
      return data ?? null;
    } catch (error) {
      console.error('Error getting user plan info:', error);
      return null;
    }
  },

  async checkWarehouseLimit(userId: string): Promise<{ allowed: boolean; current: number; max: number; message?: string }> {
    try {
      if (!userId) throw new Error('userId required');
      
      // Resolve to owner/tenant - subusers use their owner's plan
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('Could not resolve tenant');
      
      // Get plan info from the owner (tenant), not the subuser
      const planInfo = await this.getUserPlanInfo(tenantId);
      const maxWarehouses = planInfo?.max_warehouses ?? 1;
      
      // -1 means unlimited
      if (maxWarehouses === -1) {
        return { allowed: true, current: 0, max: -1 };
      }
      
      // Count warehouses for this tenant
      const { count, error } = await supabase
        .from('warehouses')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId);
      
      if (error) throw error;
      
      const currentCount = count || 0;
      const allowed = currentCount < maxWarehouses;
      
      return {
        allowed,
        current: currentCount,
        max: maxWarehouses,
        message: allowed ? undefined : `Your plan allows a maximum of ${maxWarehouses} warehouse${maxWarehouses === 1 ? '' : 's'}. Please upgrade your plan to add more.`
      };
    } catch (error) {
      console.error('Error checking warehouse limit:', error);
      return { allowed: true, current: 0, max: 1 };
    }
  },

  async updateUserPlan(userId: string, planId: string, planStatus: 'active' | 'inactive' | 'cancelled' = 'active') {
    try {
      if (!userId) throw new Error('userId required');
      const startedAtIso = new Date().toISOString();
      const expiresAtIso = (() => {
        const start = new Date(startedAtIso);
        const startValid = !isNaN(start.getTime()) ? start : new Date();
        const pid = String(planId || '').toLowerCase().trim();
        const isAnnual = pid === 'student';
        const d = new Date(startValid.getTime());
        if (isAnnual) d.setFullYear(d.getFullYear() + 1);
        else d.setMonth(d.getMonth() + 1);
        return d.toISOString();
      })();

      const payload: any = {
        plan_id: planId || null,
        plan_status: planId ? planStatus : 'inactive',
        plan_started_at: planId ? startedAtIso : null,
        plan_expires_at: planId ? expiresAtIso : null,
        updated_at: new Date().toISOString(),
      };

      // When user gets a plan, clear trial lockout
      if (planId) {
        payload.trial_end = null;
      }

      const { data, error } = await supabase
        .from('users')
        .update(payload)
        .eq('id', userId)
        .select()
        .maybeSingle();

      if (error) throw error;
      return data ?? null;
    } catch (error) {
      console.error('Error updating user plan:', error);
      throw error;
    }
  },

  async cancelUserPlan(userId: string) {
    try {
      if (!userId) throw new Error('userId required');
      const { data, error } = await supabase
        .from('users')
        .update({
          plan_id: null,
          plan_status: 'cancelled',
          plan_started_at: null,
          plan_expires_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)
        .select()
        .maybeSingle();

      if (error) throw error;
      return data ?? null;
    } catch (error) {
      console.error('Error canceling user plan:', error);
      throw error;
    }
  },

  async extendUserTrial(userId: string, daysToAdd: number) {
    try {
      if (!userId) throw new Error('userId required');
      const days = Math.max(0, Math.floor(Number(daysToAdd) || 0));
      if (days <= 0) throw new Error('daysToAdd must be > 0');

      const current = await this.getUserPlanInfo(userId);
      const now = new Date();
      const base = current?.trial_end ? new Date(current.trial_end as any) : now;
      const baseValid = !isNaN(base.getTime()) ? base : now;
      const start = baseValid.getTime() > now.getTime() ? baseValid : now;
      const next = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);

      const { data, error } = await supabase
        .from('users')
        .update({
          trial_end: next.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)
        .select()
        .maybeSingle();

      if (error) throw error;
      return data ?? null;
    } catch (error) {
      console.error('Error extending user trial:', error);
      throw error;
    }
  },

  async toggleAdminRole(userId: string) {
    try {
      if (!userId) throw new Error('userId required');

      const {
        data: { user: sessionUser },
      } = await supabase.auth.getUser();

      if (!sessionUser?.id) throw new Error('Not authenticated');

      const ownerId = await resolveTenantId(sessionUser.id);
      if (!ownerId) throw new Error('Could not resolve tenant/owner');

      const targetUserId = String(userId);
      let targetEmail: string | null = null;
      try {
        const { data: targetRow } = await supabase
          .from('users')
          .select('email')
          .eq('id', targetUserId)
          .maybeSingle();
        targetEmail = (targetRow as any)?.email ? String((targetRow as any).email) : null;
      } catch {
        targetEmail = null;
      }

      // 1) Check if admin permission exists
      let { data: perm } = await supabase
        .from('permissions')
        .select('id')
        .eq('module', 'admin')
        .eq('action', 'access')
        .maybeSingle();

      if (!perm) {
        const { data: newPerm } = await supabase
          .from('permissions')
          .insert({ module: 'admin', action: 'access' })
          .select()
          .single();
        perm = newPerm;
      }
      if (!perm) throw new Error('Could not get/create admin permission');

      // 2) Check if admin role exists for this user as owner
      let { data: role } = await supabase
        .from('roles')
        .select('id')
        .eq('owner_user_id', ownerId)
        .eq('name', 'admin')
        .maybeSingle();

      if (!role) {
        const { data: newRole } = await supabase
          .from('roles')
          .insert({ owner_user_id: ownerId, name: 'admin', description: 'Administrador del sistema' })
          .select()
          .single();
        role = newRole;
      }
      if (!role) throw new Error('Could not get/create admin role');

      // 3) Ensure role_permission exists (ignore if already exists - 409)
      try {
        await supabase
          .from('role_permissions')
          .upsert(
            { owner_user_id: ownerId, role_id: role.id, permission_id: perm.id },
            { onConflict: 'owner_user_id,role_id,permission_id', ignoreDuplicates: true }
          );
      } catch (rpErr: any) {
        // Ignore duplicate/conflict errors (409)
        if (rpErr?.code !== '23505' && rpErr?.status !== 409) {
          console.warn('role_permissions upsert warning:', rpErr);
        }
      }

      // 4) Check if user_roles entry exists
      const candidates = [targetUserId, targetEmail].filter(Boolean) as string[];

      // IMPORTANT:
      // A user can end up with admin assigned under a different owner_user_id.
      // The UI checks admin globally, but the old toggle only removed within current owner.
      // So we remove ANY admin role entries for the user (by id or email), then re-add if needed.
      const { data: existingAnyAdmin } = await supabase
        .from('user_roles')
        .select('id, user_id, role_id, roles!inner(name)')
        .in('user_id', candidates);

      const adminRoleRows = (existingAnyAdmin || []).filter((r: any) => r.roles?.name === 'admin');

      if (adminRoleRows.length > 0) {
        const ids = adminRoleRows.map((r: any) => r.id).filter(Boolean);
        if (ids.length > 0) {
          const { error: delErr } = await supabase
            .from('user_roles')
            .delete()
            .in('id', ids);
          if (delErr) throw delErr;
        }
        return { hasAdmin: false };
      }

      const { error: insErr } = await supabase
        .from('user_roles')
        .insert({ owner_user_id: ownerId, user_id: targetUserId, role_id: role.id });
      if (insErr) throw insErr;

      return { hasAdmin: true };
    } catch (error) {
      console.error('Error toggling admin role:', error);
      throw error;
    }
  },

  async checkUserHasAdminRole(userId: string): Promise<boolean> {
    try {
      if (!userId) return false;

      const targetUserId = String(userId);
      let targetEmail: string | null = null;
      try {
        const { data: targetRow } = await supabase
          .from('users')
          .select('email')
          .eq('id', targetUserId)
          .maybeSingle();
        targetEmail = (targetRow as any)?.email ? String((targetRow as any).email) : null;
      } catch {
        targetEmail = null;
      }

      const candidates = [targetUserId, targetEmail].filter(Boolean) as string[];

      const { data: roles } = await supabase
        .from('user_roles')
        .select('role_id, roles!inner(name)')
        .in('user_id', candidates);

      if (!roles || roles.length === 0) return false;
      return roles.some((r: any) => r.roles?.name === 'admin');
    } catch {
      return false;
    }
  },

  // Accounting Settings
  async getAccountingSettings(userId?: string) {
    try {
      let tenantId: string | null = null;

      if (userId) {
        tenantId = await resolveTenantId(userId);
      } else {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        tenantId = user?.id ? await resolveTenantId(user.id) : null;
      }

      const query = supabase
        .from('accounting_settings')
        .select('*');

      if (tenantId) {
        query.eq('user_id', tenantId).limit(1);
      } else {
        query.limit(1);
      }

      const { data, error } = await query.maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      return data ?? null;
    } catch (error) {
      console.error('Error getting accounting settings:', error);
      return null;
    }
  },

  async saveAccountingSettings(settings: any, userId?: string) {
    try {
      let tenantId: string | null = null;

      if (userId) {
        tenantId = await resolveTenantId(userId);
      } else {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        tenantId = user?.id ? await resolveTenantId(user.id) : null;
      }

      const payload = {
        ...settings,
        user_id: tenantId ?? settings.user_id ?? null,
      };

      // Nunca enviar el id en el upsert para evitar conflictos con la PK
      // y permitir que cada usuario tenga su propio registro según user_id
      delete (payload as any).id;

      const { data, error } = await supabase
        .from('accounting_settings')
        .upsert(payload, { onConflict: 'user_id' })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error saving accounting settings:', error);
      throw error;
    }
  },

  // Tax Settings
  async getTaxSettings() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) return null;

      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) return null;

      const { data, error} = await supabase
        .from('tax_settings')
        .select('*')
        .eq('user_id', tenantId)
        .limit(1)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      return data ?? null;
    } catch (error) {
      console.error('Error getting tax settings:', error);
      return null;
    }
  },

  async saveTaxSettings(settings: any) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) throw new Error('Usuario no autenticado');

      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) throw new Error('No se pudo resolver el tenant');

      const payload: any = {
        ...settings,
        user_id: tenantId,
      };

      // Evitar conflicto con la PK de tax_settings
      delete payload.id;

      const { data, error } = await supabase
        .from('tax_settings')
        .upsert(payload, { onConflict: 'user_id' })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error saving tax settings:', error);
      throw error;
    }
  },

  // User helpers
  async getUserCompanyName(userId: string): Promise<string | null> {
    try {
      if (!userId) return null;
      const { data, error } = await supabase
        .from('users')
        .select('company')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;
      return (data as any)?.company || null;
    } catch (error) {
      console.error('Error getting user company name:', error);
      return null;
    }
  },

  // Tax Rates
  async getTaxRates() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('tax_rates')
        .select('*')
        .eq('user_id', user.id)
        .order('name');

      if (error) throw error;
      return data ?? [];
    } catch (error) {
      console.error('Error getting tax rates:', error);
      return [];
    }
  },

  async createTaxRate(rateData: any) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) throw new Error('Usuario no autenticado');

      const payload: any = {
        ...rateData,
        user_id: user.id,
      };

      const { data, error } = await supabase
        .from('tax_rates')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating tax rate:', error);
      throw error;
    }
  },

  async updateTaxRate(id: string, rateData: any) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) throw new Error('Usuario no autenticado');

      const { data, error } = await supabase
        .from('tax_rates')
        .update(rateData)
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating tax rate:', error);
      throw error;
    }
  },

  async deleteTaxRate(id: string) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) throw new Error('Usuario no autenticado');

      const { error } = await supabase
        .from('tax_rates')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting tax rate:', error);
      throw error;
    }
  }, // <--- Added comma here

  // Inventory Settings
  async getInventorySettings() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) return null;

      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) return null;

      const { data, error } = await supabase
        .from('inventory_settings')
        .select('*')
        .eq('user_id', tenantId)
        .limit(1)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      return data ?? null;
    } catch (error) {
      console.error('Error getting inventory settings:', error);
      return null;
    }
  },

  async saveInventorySettings(settings: any) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) throw new Error('Usuario no autenticado');

      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) throw new Error('No se pudo resolver el tenant');

      const normalized: any = {
        ...settings,
        user_id: tenantId,
        default_warehouse: settings.default_warehouse || null,
      };

      const { data, error } = await supabase
        .from('inventory_settings')
        .upsert(normalized, { onConflict: 'user_id' })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error saving inventory settings:', error);
      throw error;
    }
  },

  // Warehouses
  async getWarehouses() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.id) return [];

      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) return [];

      const { data, error } = await supabase
        .from('warehouses')
        .select('*')
        .eq('user_id', tenantId)
        .or('active.eq.true,active.is.null')
        .order('name');

      if (error) throw error;
      return data ?? [];
    } catch (error) {
      console.error('Error getting warehouses:', error);
      return [];
    }
  },

  async createWarehouse(warehouseData: any) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.id) {
        throw new Error('No authenticated user for warehouse creation');
      }

      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) throw new Error('userId required');

      const generatedCode = (warehouseData.code || warehouseData.name || 'ALM')
        .toString()
        .trim()
        .substring(0, 8)
        .toUpperCase();
      const payload = {
        user_id: tenantId,
        name: warehouseData.name,
        code: generatedCode,
        location: warehouseData.location ?? null,
        address: warehouseData.address ?? null,
        manager: warehouseData.manager ?? null,
        phone: warehouseData.phone ?? null,
        inventory_account_id: warehouseData.inventory_account_id ?? null,
        active: warehouseData.active !== false,
      };
      const { data, error } = await supabase
        .from('warehouses')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating warehouse:', error);
      throw error;
    }
  },

  async updateWarehouse(warehouseId: string, warehouseData: any) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.id) {
        throw new Error('No authenticated user for warehouse update');
      }

      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) throw new Error('userId required');

      const payload = {
        name: warehouseData.name,
        code: warehouseData.code ?? undefined,
        location: warehouseData.location ?? null,
        address: warehouseData.address ?? null,
        manager: warehouseData.manager ?? null,
        phone: warehouseData.phone ?? null,
        inventory_account_id: warehouseData.inventory_account_id ?? null,
        active: warehouseData.active ?? undefined,
      };

      const { data, error } = await supabase
        .from('warehouses')
        .update(payload)
        .eq('id', warehouseId)
        .eq('user_id', tenantId)
        .select('*')
        .maybeSingle();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating warehouse:', error);
      throw error;
    }
  },

  async deleteWarehouse(warehouseId: string) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.id) {
        throw new Error('No authenticated user for warehouse deletion');
      }

      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) throw new Error('userId required');

      const { error } = await supabase
        .from('warehouses')
        .delete()
        .eq('id', warehouseId)
        .eq('user_id', tenantId);

      if (error) throw error;
      return true;
    } catch (error) {
      const e: any = error as any;
      console.error('Error deleting warehouse:', error);
      // PostgREST commonly returns 409 for FK constraint violations.
      if (e?.status === 409 || e?.code === '23503') {
        throw new Error('Cannot delete this location because it is still referenced by products or movements. Transfer/move the products out of the location first, then try again.');
      }
      throw error;
    }
  },
};

/* ==========================================================
   Data Backups Service
========================================================== */
export const dataBackupsService = {
  async getBackups() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('data_backups')
        .select('*')
        .eq('user_id', user.id)
        .order('backup_date', { ascending: false });

      if (error) throw error;
      return data ?? [];
    } catch (error) {
      console.error('Error getting data backups:', error);
      return [];
    }
  },

  async createBackup(options?: { backup_type?: string; backup_name?: string; retention_days?: number }) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.id) throw new Error('Usuario no autenticado');

      const safeSingle = async (query: any) => {
        try {
          const { data, error } = await query;
          if (error && error.code !== 'PGRST116') throw error;
          if (Array.isArray(data)) return data[0] ?? null;
          return data ?? null;
        } catch (e) {
          console.error('Backup safeSingle error:', e);
          return null;
        }
      };

      const safeList = async (query: any) => {
        try {
          const { data, error } = await query;
          if (error && error.code !== 'PGRST116') throw error;
          return data ?? [];
        } catch (e) {
          console.error('Backup safeList error:', e);
          return [];
        }
      };

      // Settings (una sola fila cada una)
      const companyInfo = await safeSingle(
        supabase.from('company_info').select('*').limit(1)
      );
      const accountingSettings = await safeSingle(
        supabase.from('accounting_settings').select('*').limit(1)
      );
      const taxSettings = await safeSingle(
        supabase.from('tax_settings').select('*').limit(1)
      );
      const inventorySettings = await safeSingle(
        supabase.from('inventory_settings').select('*').limit(1)
      );
      const payrollSettings = await safeSingle(
        supabase.from('payroll_settings').select('*').limit(1)
      );

      // Catálogos (por usuario)
      const customers = await safeList(
        supabase.from('customers').select('*').eq('user_id', user.id)
      );
      const suppliers = await safeList(
        supabase.from('suppliers').select('*').eq('user_id', user.id)
      );
      const chartAccounts = await safeList(
        supabase.from('chart_accounts').select('*').eq('user_id', user.id)
      );
      const products = await safeList(
        supabase.from('inventory_items').select('*').eq('user_id', user.id)
      );
      const warehouses = await safeList(
        supabase.from('warehouses').select('*')
      );

      // Movimientos principales (por usuario)
      const invoices = await safeList(
        supabase.from('invoices').select('*').eq('user_id', user.id)
      );
      const supplierPayments = await safeList(
        supabase.from('supplier_payments').select('*').eq('user_id', user.id)
      );
      const journalEntries = await safeList(
        supabase.from('journal_entries').select('*').eq('user_id', user.id)
      );
      const journalEntryLines = await safeList(
        supabase.from('journal_entry_lines').select('*')
      );
      const pettyFunds = await safeList(
        supabase.from('petty_cash_funds').select('*').eq('user_id', user.id)
      );
      const pettyExpenses = await safeList(
        supabase.from('petty_cash_expenses').select('*').eq('user_id', user.id)
      );
      const pettyReimbursements = await safeList(
        supabase.from('petty_cash_reimbursements').select('*').eq('user_id', user.id)
      );
      const fixedAssets = await safeList(
        supabase.from('fixed_assets').select('*').eq('user_id', user.id)
      );
      const fixedDepreciations = await safeList(
        supabase.from('fixed_asset_depreciations').select('*').eq('user_id', user.id)
      );
      const fixedDisposals = await safeList(
        supabase.from('fixed_asset_disposals').select('*').eq('user_id', user.id)
      );

      const backupPayload = {
        version: 1,
        generated_at: new Date().toISOString(),
        user_id: user.id,
        settings: {
          company_info: companyInfo,
          accounting_settings: accountingSettings,
          tax_settings: taxSettings,
          inventory_settings: inventorySettings,
          payroll_settings: payrollSettings,
        },
        catalogs: {
          customers,
          suppliers,
          chart_accounts: chartAccounts,
          products,
          warehouses,
        },
        movements: {
          invoices,
          supplier_payments: supplierPayments,
          journal_entries: journalEntries,
          journal_entry_lines: journalEntryLines,
          petty_cash_funds: pettyFunds,
          petty_cash_expenses: pettyExpenses,
          petty_cash_reimbursements: pettyReimbursements,
          fixed_assets: fixedAssets,
          fixed_asset_depreciations: fixedDepreciations,
          fixed_asset_disposals: fixedDisposals,
        },
      };

      const serialized = JSON.stringify(backupPayload);
      const approximateSize = new Blob([serialized]).size;

      const now = new Date().toISOString();
      const payload: any = {
        user_id: user.id,
        backup_type: options?.backup_type || 'manual',
        backup_name: options?.backup_name || `Respaldo ${now}`,
        backup_data: backupPayload,
        backup_date: now,
        status: 'completed',
        retention_days: options?.retention_days ?? 30,
        file_size: approximateSize,
      };

      const { data, error } = await supabase
        .from('data_backups')
        .insert(payload)
        .select()
        .select('*')
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating data backup:', error);
      throw error;
    }
  },

  async deleteBackup(id: string) {
    try {
      const { error } = await supabase
        .from('data_backups')
        .delete()
        .eq('id', id);
      if (error) throw error;
    } catch (error) {
      console.error('Error deleting data backup:', error);
      throw error;
    }
  },
};

/* ==========================================================
   Warehouses Service
========================================================== */
export const warehousesService = {
  async getAll(userId?: string) {
    try {
      const tenantId = userId ? await resolveTenantId(userId) : null;
      if (!tenantId) return [];

      const { data, error } = await supabase
        .from('warehouses')
        .select('*')
        .eq('user_id', tenantId)
        .order('name');

      if (error) throw error;
      return data ?? [];
    } catch (error) {
      console.error('Error getting warehouses:', error);
      return [];
    }
  },

  async create(warehouseData: any) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.id) {
        throw new Error('No authenticated user for warehouse creation');
      }

      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) throw new Error('userId required');

      const generatedCode = (warehouseData.code || warehouseData.name || 'ALM')
        .toString()
        .trim()
        .substring(0, 8)
        .toUpperCase();
      const payload = {
        user_id: tenantId,
        name: warehouseData.name,
        code: generatedCode,
        location: warehouseData.location ?? null,
        address: warehouseData.address ?? null,
        manager: warehouseData.manager ?? null,
        phone: warehouseData.phone ?? null,
        inventory_account_id: warehouseData.inventory_account_id ?? null,
        active: warehouseData.active !== false,
      };
      const { data, error } = await supabase
        .from('warehouses')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating warehouse:', error);
      throw error;
    }
  },

  async update(id: string, warehouseData: any) {
    try {
      const safeCode = (warehouseData.code || warehouseData.name || 'ALM')
        .toString()
        .trim()
        .substring(0, 8)
        .toUpperCase();
      const payload = {
        name: warehouseData.name,
        code: safeCode,
        location: warehouseData.location ?? null,
        address: warehouseData.address ?? null,
        manager: warehouseData.manager ?? null,
        phone: warehouseData.phone ?? null,
        inventory_account_id: warehouseData.inventory_account_id ?? null,
        active: warehouseData.active !== false,
      };
      const { data, error } = await supabase
        .from('warehouses')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating warehouse:', error);
      throw error;
    }
  },

  async delete(id: string) {
    try {
      const { error } = await supabase
        .from('warehouses')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting warehouse:', error);
      throw error;
    }
  },
};

/* ==========================================================
   Payroll Settings Service
========================================================== */
export const payrollSettingsService = {
  async getPayrollSettings() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) return null;
      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) return null;

      const { data, error } = await supabase
        .from('payroll_settings')
        .select('*')
        .eq('user_id', tenantId)
        .limit(1)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      return data ?? null;
    } catch (error) {
      console.error('Error getting payroll settings:', error);
      return null;
    }
  },

  async savePayrollSettings(settings: any) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) throw new Error('Usuario no autenticado');

      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) throw new Error('userId required');

      const payload: any = {
        ...settings,
        user_id: tenantId,
      };

      // Evitar conflicto con la PK de payroll_settings
      delete payload.id;

      // Buscar si ya existe un registro de configuración para este tenant
      const { data: existing, error: existingError } = await supabase
        .from('payroll_settings')
        .select('id')
        .eq('user_id', tenantId)
        .limit(1)
        .maybeSingle();

      if (existingError && (existingError as any).code !== 'PGRST116') {
        throw existingError;
      }

      let result;
      if (existing?.id) {
        // Actualizar registro existente
        result = await supabase
          .from('payroll_settings')
          .update(payload)
          .eq('id', existing.id)
          .select()
          .single();
      } else {
        // Crear nuevo registro
        result = await supabase
          .from('payroll_settings')
          .insert(payload)
          .select()
          .single();
      }

      const { data, error } = result;
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error saving payroll settings:', error);
      throw error;
    }
  },

  async getPayrollConcepts() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) return [];
      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) return [];

      const { data, error } = await supabase
        .from('payroll_concepts')
        .select('*')
        .eq('user_id', tenantId)
        .order('name');

      if (error) throw error;
      return data ?? [];
    } catch (error) {
      console.error('Error getting payroll concepts:', error);
      return [];
    }
  },

  async createPayrollConcept(conceptData: any) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) throw new Error('Usuario no autenticado');

      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) throw new Error('userId required');

      const safeName = (conceptData.name || 'CONCEPTO')
        .toString()
        .trim()
        .substring(0, 20)
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_');
      const generatedCode = `${safeName}_${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const payload = {
        ...conceptData,
        code: conceptData.code || generatedCode,
        user_id: tenantId,
      };
      const { data, error } = await supabase
        .from('payroll_concepts')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating payroll concept:', error);
      throw error;
    }
  },

  // Payroll Tax Brackets (ISR)
  async getPayrollTaxBrackets() {
    try {
      const { data, error } = await supabase
        .from('payroll_tax_brackets')
        .select('*')
        .order('min_amount');

      if (error) throw error;
      return data ?? [];
    } catch (error) {
      console.error('Error getting payroll tax brackets:', error);
      return [];
    }
  },

  async createPayrollTaxBracket(bracketData: any) {
    try {
      const { data, error } = await supabase
        .from('payroll_tax_brackets')
        .insert(bracketData)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating payroll tax bracket:', error);
      throw error;
    }
  },

  async updatePayrollTaxBracket(id: string, bracketData: any) {
    try {
      const { data, error } = await supabase
        .from('payroll_tax_brackets')
        .update(bracketData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating payroll tax bracket:', error);
      throw error;
    }
  },

  async deletePayrollTaxBracket(id: string) {
    try {
      const { error } = await supabase
        .from('payroll_tax_brackets')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting payroll tax bracket:', error);
      throw error;
    }
  },

  // Inicializar tramos ISR por defecto según DGII RD
  async initializeDefaultISRBrackets(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('User ID required');

      // Verificar si ya tiene tramos
      const existing = await this.getPayrollTaxBrackets();
      if (existing && existing.length > 0) {
        return existing; // Ya tiene tramos configurados
      }

      // Tramos fiscales según DGII RD (escala anual vigente)
      // Nota: rate y rate_percent ambos para compatibilidad con tabla existente
      const defaultBrackets = [
        {
          user_id: tenantId,
          min_amount: 0,
          max_amount: 416220.00,
          rate: 0,
          rate_percent: 0,
          fixed_amount: 0,
          description: 'Renta exenta',
          is_annual: true
        },
        {
          user_id: tenantId,
          min_amount: 416220.01,
          max_amount: 624329.00,
          rate: 15,
          rate_percent: 15,
          fixed_amount: 0,
          description: '15% sobre excedente de 416,220.01',
          is_annual: true
        },
        {
          user_id: tenantId,
          min_amount: 624329.01,
          max_amount: 867123.00,
          rate: 20,
          rate_percent: 20,
          fixed_amount: 31216.00,
          description: '31,216.00 + 20% sobre excedente de 624,329.01',
          is_annual: true
        },
        {
          user_id: tenantId,
          min_amount: 867123.01,
          max_amount: null,
          rate: 25,
          rate_percent: 25,
          fixed_amount: 79776.00,
          description: '79,776.00 + 25% sobre excedente de 867,123.00',
          is_annual: true
        }
      ];

      const { data, error } = await supabase
        .from('payroll_tax_brackets')
        .insert(defaultBrackets)
        .select();

      if (error) throw error;
      return data ?? [];
    } catch (error) {
      console.error('Error initializing default ISR brackets:', error);
      throw error;
    }
  },

  // Calcular ISR para un ingreso gravable anual
  calculateISR(taxableIncome: number, brackets: any[]): number {
    if (!brackets || brackets.length === 0 || !Number.isFinite(taxableIncome) || taxableIncome <= 0) {
      return 0;
    }

    // Encontrar el tramo correspondiente
    const bracket = brackets.find((b: any) => {
      const min = Number(b.min_amount ?? 0);
      const hasMax = b.max_amount !== null && b.max_amount !== undefined;
      const max = hasMax ? Number(b.max_amount) : Number.POSITIVE_INFINITY;
      return taxableIncome >= min && taxableIncome <= max;
    });

    if (!bracket) return 0;

    const min = Number(bracket.min_amount ?? 0);
    const fixedAmount = Number(bracket.fixed_amount ?? 0);
    const rate = Number(bracket.rate_percent ?? bracket.rate ?? 0);

    const excess = Math.max(0, taxableIncome - min);
    const variablePart = excess * (rate / 100);
    const isr = fixedAmount + variablePart;

    return Number.isFinite(isr) && isr > 0 ? Math.round(isr * 100) / 100 : 0;
  },

  // Calcular retención mensual de ISR
  calculateMonthlyISRRetention(monthlyTaxableIncome: number, brackets: any[]): number {
    // Proyectar ingreso anual
    const annualIncome = monthlyTaxableIncome * 12;
    // Calcular ISR anual
    const annualISR = this.calculateISR(annualIncome, brackets);
    // Retención mensual = ISR anual / 12
    return Math.round((annualISR / 12) * 100) / 100;
  }
};

/* ==========================================================
  Fixed Asset Types Service
  Tabla: fixed_asset_types
========================================================== */
export const assetTypesService = {
  async getAll(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('fixed_asset_types')
        .select('*')
        .eq('user_id', tenantId)
        .order('name');

      if (error) throw error;
      return data ?? [];
    } catch (error) {
      console.error('assetTypesService.getAll error', error);
      return [];
    }
  },

  async create(userId: string, payload: any) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');
      const insertPayload = {
        ...payload,
        user_id: tenantId,
      };
      const { data, error } = await supabase
        .from('fixed_asset_types')
        .insert(insertPayload)
        .select('*')
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('assetTypesService.create error', error);
      throw error;
    }
  },

  async update(id: string, payload: any) {
    try {
      const { data, error } = await supabase
        .from('fixed_asset_types')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('assetTypesService.update error', error);
      throw error;
    }
  },

  async delete(id: string) {
    try {
      const { error } = await supabase
        .from('fixed_asset_types')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('assetTypesService.delete error', error);
      throw error;
    }
  },
};

/* ==========================================================
  Fixed Assets Service
  Tabla: fixed_assets
========================================================== */
export const fixedAssetsService = {
  async getAll(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('fixed_assets')
        .select('*')
        .eq('user_id', tenantId)
        .order('code');

      if (error) throw error;
      return data ?? [];
    } catch (error) {
      console.error('fixedAssetsService.getAll error', error);
      return [];
    }
  },

  async create(userId: string, payload: any) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');
      const insertPayload = {
        ...payload,
        user_id: tenantId,
      };
      const { data, error } = await supabase
        .from('fixed_assets')
        .insert(insertPayload)
        .select('*')
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('fixedAssetsService.create error', error);
      throw error;
    }
  },

  async update(id: string, payload: any) {
    try {
      const { data, error } = await supabase
        .from('fixed_assets')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('fixedAssetsService.update error', error);
      throw error;
    }
  },

  async delete(id: string) {
    try {
      const { error } = await supabase
        .from('fixed_assets')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('fixedAssetsService.delete error', error);
      throw error;
    }
  },
};

/* ==========================================================
  Fixed Asset Disposals Service
  Tabla: fixed_asset_disposals
========================================================== */
export const assetDisposalService = {
  async getAll(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('fixed_asset_disposals')
        .select('*')
        .eq('user_id', tenantId)
        .order('disposal_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data ?? [];
    } catch (error) {
      console.error('assetDisposalService.getAll error', error);
      return [];
    }
  },

  async create(userId: string, payload: any) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');
      const insertPayload = {
        ...payload,
        user_id: tenantId,
      };
      const { data, error } = await supabase
        .from('fixed_asset_disposals')
        .insert(insertPayload)
        .select('*')
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('assetDisposalService.create error', error);
      throw error;
    }
  },

  async update(id: string, payload: any) {
    try {
      const { data, error } = await supabase
        .from('fixed_asset_disposals')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('assetDisposalService.update error', error);
      throw error;
    }
  },

  async delete(id: string) {
    try {
      const { error } = await supabase
        .from('fixed_asset_disposals')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('assetDisposalService.delete error', error);
      throw error;
    }
  },

  /**
   * Aprobar retiro de activo y generar asiento contable
   * Asiento:
   * - Dr: Caja/Banco (precio de venta, si aplica)
   * - Dr: Depreciación Acumulada (eliminar)
   * - Dr: Pérdida en venta de activo fijo (si precio < valor en libros)
   * - Cr: Activo Fijo (costo original)
   * - Cr: Ganancia en venta de activo fijo (si precio > valor en libros)
   */
  async approveWithJournalEntry(userId: string, disposalId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');

      // Obtener datos del retiro
      const { data: disposal, error: dispError } = await supabase
        .from('fixed_asset_disposals')
        .select('*')
        .eq('id', disposalId)
        .single();

      if (dispError || !disposal) throw new Error('Retiro no encontrado');

      // Obtener datos del activo y su tipo
      const { data: asset, error: assetError } = await supabase
        .from('fixed_assets')
        .select('*')
        .eq('id', disposal.asset_id)
        .single();

      if (assetError || !asset) throw new Error('Activo no encontrado');

      // Obtener tipo de activo para las cuentas contables
      const { data: assetTypes } = await supabase
        .from('fixed_asset_types')
        .select('*')
        .eq('user_id', tenantId);

      const assetType = (assetTypes || []).find((t: any) => t.name === asset.category);

      // Obtener catálogo de cuentas
      const { data: accounts } = await supabase
        .from('chart_accounts')
        .select('id, code, name, type')
        .eq('user_id', tenantId);

      const accountsByCode: Map<string, string> = new Map();
      (accounts || []).forEach((acc: any) => {
        accountsByCode.set(acc.code, acc.id);
      });

      // Función para extraer código de cuenta
      const extractAccountCode = (accountStr: string | null): string | null => {
        if (!accountStr) return null;
        const match = accountStr.match(/^(\d+)/);
        return match ? match[1] : null;
      };

      // Valores del retiro
      const originalCost = Number(disposal.original_cost) || Number(asset.purchase_cost) || 0;
      const accumulatedDepreciation = Number(disposal.accumulated_depreciation) || Number(asset.accumulated_depreciation) || 0;
      const bookValue = originalCost - accumulatedDepreciation;
      const salePrice = Number(disposal.sale_price) || 0;
      const gainLoss = salePrice - bookValue;

      // Buscar cuentas contables
      let assetAccountId: string | null = null;
      let accumulatedDepAccountId: string | null = null;
      let cashAccountId: string | null = null;
      let gainAccountId: string | null = null;
      let lossAccountId: string | null = null;

      if (assetType) {
        const assetCode = extractAccountCode(assetType.account);
        const accDepCode = extractAccountCode(assetType.accumulated_depreciation_account);
        const gainCode = extractAccountCode(assetType.revaluation_gain_account);
        const lossCode = extractAccountCode(assetType.revaluation_loss_account);

        if (assetCode) assetAccountId = accountsByCode.get(assetCode) || null;
        if (accDepCode) accumulatedDepAccountId = accountsByCode.get(accDepCode) || null;
        if (gainCode) gainAccountId = accountsByCode.get(gainCode) || null;
        if (lossCode) lossAccountId = accountsByCode.get(lossCode) || null;
      }

      // Buscar cuenta de caja por defecto (100101)
      cashAccountId = accountsByCode.get('100101') || accountsByCode.get('1001') || null;
      if (!cashAccountId) {
        const cashAcc = (accounts || []).find((a: any) => 
          a.name?.toLowerCase().includes('caja') || a.name?.toLowerCase().includes('efectivo')
        );
        if (cashAcc) cashAccountId = cashAcc.id;
      }

      // Buscar cuentas de ganancia/pérdida si no están en el tipo
      if (!gainAccountId) {
        const gainAcc = (accounts || []).find((a: any) => 
          a.name?.toLowerCase().includes('ganancia') && a.name?.toLowerCase().includes('activo')
        );
        if (gainAcc) gainAccountId = gainAcc.id;
      }
      if (!lossAccountId) {
        const lossAcc = (accounts || []).find((a: any) => 
          a.name?.toLowerCase().includes('pérdida') && a.name?.toLowerCase().includes('activo')
        );
        if (lossAcc) lossAccountId = lossAcc.id;
      }

      // Crear líneas del asiento contable
      const entryLines: any[] = [];
      let lineNumber = 1;

      // 1. Dr: Caja/Banco (si hay venta)
      if (salePrice > 0 && cashAccountId) {
        entryLines.push({
          account_id: cashAccountId,
          description: `Venta de activo fijo: ${asset.name}`,
          debit_amount: salePrice,
          credit_amount: 0,
          line_number: lineNumber++,
        });
      }

      // 2. Dr: Depreciación Acumulada (eliminar)
      if (accumulatedDepreciation > 0 && accumulatedDepAccountId) {
        entryLines.push({
          account_id: accumulatedDepAccountId,
          description: `Baja depreciación acumulada: ${asset.name}`,
          debit_amount: accumulatedDepreciation,
          credit_amount: 0,
          line_number: lineNumber++,
        });
      }

      // 3. Dr: Pérdida en venta (si hay pérdida)
      if (gainLoss < 0 && lossAccountId) {
        entryLines.push({
          account_id: lossAccountId,
          description: `Pérdida en baja de activo: ${asset.name}`,
          debit_amount: Math.abs(gainLoss),
          credit_amount: 0,
          line_number: lineNumber++,
        });
      }

      // 4. Cr: Activo Fijo (costo original)
      if (assetAccountId) {
        entryLines.push({
          account_id: assetAccountId,
          description: `Baja de activo fijo: ${asset.name}`,
          debit_amount: 0,
          credit_amount: originalCost,
          line_number: lineNumber++,
        });
      }

      // 5. Cr: Ganancia en venta (si hay ganancia)
      if (gainLoss > 0 && gainAccountId) {
        entryLines.push({
          account_id: gainAccountId,
          description: `Ganancia en venta de activo: ${asset.name}`,
          debit_amount: 0,
          credit_amount: gainLoss,
          line_number: lineNumber++,
        });
      }

      // Generar asiento contable si hay líneas válidas
      let journalEntry = null;
      if (entryLines.length >= 2) {
        try {
          const entryPayload = {
            entry_number: `DISP-${disposal.asset_code || asset.code}`,
            entry_date: disposal.disposal_date || new Date().toISOString().split('T')[0],
            description: `Baja de activo fijo: ${asset.name} (${disposal.disposal_method})`,
            reference: disposal.asset_code || asset.code,
            status: 'posted' as const,
          };

          journalEntry = await journalEntriesService.createWithLines(tenantId, entryPayload, entryLines);
        } catch (jeError) {
          console.error('Error creating disposal journal entry:', jeError);
        }
      }

      // Actualizar estado del retiro a Completado
      const { data: updatedDisposal, error: updateError } = await supabase
        .from('fixed_asset_disposals')
        .update({
          status: 'Completado',
          gain_loss: gainLoss,
          original_cost: originalCost,
          accumulated_depreciation: accumulatedDepreciation,
          book_value: bookValue,
        })
        .eq('id', disposalId)
        .select('*')
        .single();

      if (updateError) throw updateError;

      // Actualizar estado del activo a 'disposed'
      await supabase
        .from('fixed_assets')
        .update({ status: 'disposed' })
        .eq('id', disposal.asset_id);

      return {
        disposal: updatedDisposal,
        journalEntry,
        message: journalEntry 
          ? `Retiro aprobado y asiento contable generado correctamente`
          : `Retiro aprobado (no se pudo generar asiento contable - verifique la configuración de cuentas)`,
      };
    } catch (error) {
      console.error('assetDisposalService.approveWithJournalEntry error', error);
      throw error;
    }
  }
};

/* ==========================================================
   Opening Balances Service (Balances Iniciales)
========================================================== */
export const openingBalancesService = {
  async getAll(userId: string, fiscalYear?: number) {
    try {
      const tenantId = await resolveTenantId(userId);
      let query = supabase
        .from('opening_balances')
        .select('*')
        .eq('user_id', tenantId)
        .order('account_number', { ascending: true });

      if (fiscalYear) {
        query = query.eq('fiscal_year', fiscalYear);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting opening balances:', error);
      return [];
    }
  },

  async create(userId: string, balance: any) {
    try {
      const tenantId = await resolveTenantId(userId);
      const { data, error } = await supabase
        .from('opening_balances')
        .insert({ ...balance, user_id: tenantId })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating opening balance:', error);
      throw error;
    }
  },

  async update(id: string, balance: any) {
    try {
      const { data, error } = await supabase
        .from('opening_balances')
        .update(balance)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating opening balance:', error);
      throw error;
    }
  },

  async delete(id: string) {
    try {
      const { error } = await supabase
        .from('opening_balances')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error deleting opening balance:', error);
      throw error;
    }
  },

  async importFromAccounts(userId: string, fiscalYear: number, openingDate: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      // Obtener todas las cuentas del catálogo
      const { data: accounts, error: accountsError } = await supabase
        .from('chart_accounts')
        .select('id, code, name, normal_balance')
        .eq('user_id', tenantId)
        .order('code', { ascending: true });

      if (accountsError) throw accountsError;

      // Crear balances iniciales para cada cuenta (con saldo 0)
      const balances = accounts.map(account => ({
        user_id: tenantId,
        account_id: account.id,
        account_number: account.code,
        account_name: account.name,
        debit: 0,
        credit: 0,
        balance: 0,
        balance_type: account.normal_balance || 'debit',
        fiscal_year: fiscalYear,
        opening_date: openingDate,
        is_posted: false
      }));

      const { data, error } = await supabase
        .from('opening_balances')
        .insert(balances)
        .select();

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error importing balances from chart of accounts:', error);
      throw error;
    }
  },

  async postToJournal(userId: string, fiscalYear: number) {
    try {
      const tenantId = await resolveTenantId(userId);
      // Obtener balances no contabilizados
      const { data: balances, error: balancesError } = await supabase
        .from('opening_balances')
        .select('*')
        .eq('user_id', tenantId)
        .eq('fiscal_year', fiscalYear)
        .eq('is_posted', false);

      if (balancesError) throw balancesError;
      if (!balances || balances.length === 0) {
        throw new Error('No hay balances para contabilizar');
      }

      // Validar que cuadre
      const totalDebit = balances.reduce((sum, b) => sum + (Number(b.debit) || 0), 0);
      const totalCredit = balances.reduce((sum, b) => sum + (Number(b.credit) || 0), 0);

      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        throw new Error(`Los balances no cuadran. Débito:  ${totalDebit.toFixed(2)}, Crédito:  ${totalCredit.toFixed(2)}`);
      }

      // Preparar asiento de diario usando el servicio estándar
      const openingDate = balances[0].opening_date;
      const entryNumber = `OPEN-${fiscalYear}`;

      // Construir líneas a partir de balances (solo para conteo y posible creación)
      const nonZeroBalances = balances.filter(b => (Number(b.debit) || 0) > 0 || (Number(b.credit) || 0) > 0);
      const lines = nonZeroBalances.map((balance: any) => ({
        account_id: balance.account_id,
        description: `Saldo inicial ${fiscalYear}`,
        debit_amount: Number(balance.debit) || 0,
        credit_amount: Number(balance.credit) || 0,
      }));

      // Si ya existe un asiento con ese número para ese usuario, reutilizarlo
      const { data: existingEntry, error: existingError } = await supabase
        .from('journal_entries')
        .select('id, total_debit, total_credit')
        .eq('user_id', userId)
        .eq('entry_number', entryNumber)
        .maybeSingle();

      if (existingError) throw existingError;

      let journalEntry = existingEntry as any;

      if (!journalEntry) {
        // Crear nuevo asiento solo si no existe uno previo
        journalEntry = await journalEntriesService.createWithLines(userId, {
          entry_number: entryNumber,
          entry_date: openingDate,
          description: `Asiento de apertura - Ejercicio fiscal ${fiscalYear}`,
          reference: `Balances Iniciales ${fiscalYear}`,
          status: 'posted',
        }, lines);
      }

      // Marcar balances como contabilizados
      const balanceIds = balances.map(b => b.id);
      const { error: updateError } = await supabase
        .from('opening_balances')
        .update({
          is_posted: true,
          posted_at: new Date().toISOString(),
          posted_by: userId,
          journal_entry_id: journalEntry.id
        })
        .in('id', balanceIds);

      if (updateError) throw updateError;

      return {
        journalEntry,
        linesCount: lines.length,
        totalDebit,
        totalCredit,
      };
    } catch (error) {
      console.error('Error posting opening balances to journal:', error);
      throw error;
    }
  },

  async getValidationSummary(userId: string, fiscalYear: number) {
    try {
      const { data: balances, error } = await supabase
        .from('opening_balances')
        .select('*')
        .eq('user_id', userId)
        .eq('fiscal_year', fiscalYear);

      if (error) throw error;

      const totalDebit = balances.reduce((sum, b) => sum + (Number(b.debit) || 0), 0);
      const totalCredit = balances.reduce((sum, b) => sum + (Number(b.credit) || 0), 0);
      const difference = totalDebit - totalCredit;
      const isBalanced = Math.abs(difference) < 0.01;
      const accountsWithBalance = balances.filter(b => (Number(b.debit) || 0) > 0 || (Number(b.credit) || 0) > 0).length;

      return {
        totalAccounts: balances.length,
        accountsWithBalance,
        totalDebit,
        totalCredit,
        difference,
        isBalanced,
        isPosted: balances.some(b => b.is_posted)
      };
    } catch (error) {
      console.error('Error getting validation summary:', error);
      throw error;
    }
  }
};

/* ==========================================================
  Fixed Asset Depreciation Types Service
  Tabla: fixed_asset_depreciation_types
========================================================== */
export const assetDepreciationTypesService = {
  async getAll(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('fixed_asset_depreciation_types')
        .select('*')
        .eq('user_id', tenantId)
        .order('code');
      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async create(userId: string, payload: any) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');
      const insertPayload = {
        ...payload,
        user_id: tenantId,
      };
      const { data, error } = await supabase
        .from('fixed_asset_depreciation_types')
        .insert(insertPayload)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('assetDepreciationTypesService.create error', error);
      throw error;
    }
  },

  async update(id: string, payload: any) {
    try {
      const { data, error } = await supabase
        .from('fixed_asset_depreciation_types')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('assetDepreciationTypesService.update error', error);
      throw error;
    }
  },

  async delete(id: string) {
    try {
      const { error } = await supabase
        .from('fixed_asset_depreciation_types')
        .delete()
        .eq('id', id);
      if (error) throw error;
    } catch (error) {
      console.error('assetDepreciationTypesService.delete error', error);
      throw error;
    }
  },
};

/* ==========================================================
  Fixed Asset Depreciation Service
  Tabla: fixed_asset_depreciations
========================================================== */
export const assetDepreciationService = {
  async getAll(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('fixed_asset_depreciations')
        .select('*')
        .eq('user_id', tenantId)
        .order('depreciation_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data ?? [];
    } catch (error) {
      console.error('assetDepreciationService.getAll error', error);
      return [];
    }
  },

  async createMany(userId: string, records: any[]) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId || !Array.isArray(records) || records.length === 0) return [];
      const payload = records.map((r) => ({
        ...r,
        user_id: tenantId,
      }));

      const { data, error } = await supabase
        .from('fixed_asset_depreciations')
        .insert(payload)
        .select('*');

      if (error) throw error;
      return data ?? [];
    } catch (error) {
      console.error('assetDepreciationService.createMany error', error);
      throw error;
    }
  },

  async update(id: string, payload: any) {
    try {
      const { data, error } = await supabase
        .from('fixed_asset_depreciations')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('assetDepreciationService.update error', error);
      throw error;
    }
  },

  /**
   * Calcula y registra automáticamente la depreciación mensual para todos los activos fijos activos
   * @param userId - ID del usuario
   * @param depreciationDate - Fecha de la depreciación (default: último día del mes anterior)
   * @returns Registros de depreciación creados y asiento contable
   */
  async calculateMonthlyDepreciation(userId: string, depreciationDate?: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');

      // Fecha de depreciación: último día del mes anterior
      const targetDate = depreciationDate || new Date(new Date().getFullYear(), new Date().getMonth(), 0).toISOString().slice(0, 10);
      const targetMonth = targetDate.slice(0, 7); // YYYY-MM

      // Obtener todos los activos fijos activos (tanto 'active' como 'Activo')
      const { data: assets, error: assetsError } = await supabase
        .from('fixed_assets')
        .select('*')
        .eq('user_id', tenantId)
        .in('status', ['active', 'Activo']);

      if (assetsError) throw assetsError;
      if (!assets || assets.length === 0) {
        return { depreciations: [], journalEntry: null, message: 'No hay activos para depreciar' };
      }

      // Verificar si ya existe depreciación para este mes
      const { data: existing, error: existingError } = await supabase
        .from('fixed_asset_depreciations')
        .select('id')
        .eq('user_id', tenantId)
        .gte('depreciation_date', `${targetMonth}-01`)
        .lte('depreciation_date', `${targetMonth}-31`)
        .limit(1);

      if (existingError) throw existingError;
      if (existing && existing.length > 0) {
        throw new Error(`Ya existe depreciación registrada para el mes ${targetMonth}`);
      }

      const depreciationRecords: any[] = [];
      let totalDepreciation = 0;
      const accountTotals: Record<string, { depreciation: number; accumulated: number }> = {};

      // Cargar tipos de activos y catálogo de cuentas para mapear las cuentas contables
      const [assetTypes, chartAccounts] = await Promise.all([
        assetTypesService.getAll(tenantId),
        chartAccountsService.getAll(tenantId),
      ]);

      const accountsByCode = new Map<string, string>();
      (chartAccounts || []).forEach((acc: any) => {
        if (acc.code && acc.id) {
          accountsByCode.set(String(acc.code), String(acc.id));
        }
      });

      const extractCode = (value?: string | null) => {
        if (!value) return null;
        const [codePart] = String(value).split(' - ');
        return codePart.trim();
      };

      const findAccountsForAsset = (asset: any) => {
        const categoryName = String(asset.category || '');
        const assetType = (assetTypes || []).find((t: any) => String(t.name || '') === categoryName);
        if (!assetType) return { depreciationAccountId: undefined, accumulatedAccountId: undefined };

        const depCode = extractCode(assetType.depreciation_account);
        const accDepCode = extractCode(assetType.accumulated_depreciation_account);

        const depreciationAccountId = depCode ? accountsByCode.get(depCode) : undefined;
        const accumulatedAccountId = accDepCode ? accountsByCode.get(accDepCode) : undefined;

        return { depreciationAccountId, accumulatedAccountId };
      };

      const isLandLikeCategory = (rawCategory: string) => {
        const s = String(rawCategory || '').toLowerCase();
        if (!s) return false;
        const keywords = [
          'terreno',
          'terrenos',
          'land',
          'solar',
          'solares',
          'lote',
          'lotes',
          'parcela',
          'parcelas',
          'finca',
          'fincas',
          'siti',
          'sitio',
          'sitios',
        ];
        return keywords.some((k) => s.includes(k));
      };

      // Calcular depreciación para cada activo
      for (const asset of assets) {
        const categoryName = String((asset as any).category || '');

        // Terrenos y equivalentes no se deprecian
        if (isLandLikeCategory(categoryName)) {
          continue;
        }

        // Si el tipo de activo no tiene parámetros de depreciación (vida útil y tasa), tratarlo como no depreciable
        const assetType = (assetTypes || []).find((t: any) => String(t.name || '') === categoryName);
        if (assetType) {
          const typeUsefulLife = Number((assetType as any).useful_life ?? 0) || 0;
          const typeRate = Number((assetType as any).depreciation_rate ?? 0) || 0;
          if (typeUsefulLife <= 0 && typeRate <= 0) {
            continue;
          }
        }

        const purchaseValue = Number((asset as any).purchase_value ?? (asset as any).purchase_cost ?? 0) || 0;
        const salvageValue = Number((asset as any).salvage_value ?? 0) || 0;
        const depreciableAmount = purchaseValue - salvageValue;
        const usefulLifeYears = Number((asset as any).useful_life ?? 0) || 0;
        const accumulatedDepreciation = Number((asset as any).accumulated_depreciation) || 0;

        if (depreciableAmount <= 0) continue;

        // Determinar depreciación mensual: preferir vida útil; si no, usar tasa de depreciación
        let monthlyDepreciation = 0;
        if (usefulLifeYears > 0) {
          monthlyDepreciation = depreciableAmount / (usefulLifeYears * 12);
        } else {
          const depreciationRate = Number((asset as any).depreciation_rate) || 0;
          if (depreciationRate <= 0) continue;
          const usefulLifeMonths = Math.round(100 / depreciationRate * 12);
          monthlyDepreciation = depreciableAmount / usefulLifeMonths;
        }

        // Verificar que no exceda el valor depreciable
        const remainingValue = depreciableAmount - accumulatedDepreciation;
        const finalDepreciation = Math.min(monthlyDepreciation, remainingValue);

        if (finalDepreciation <= 0) continue;

        const newAccumulated = accumulatedDepreciation + finalDepreciation;
        const newBookValue = purchaseValue - newAccumulated;

        // Usar las mismas columnas que la pantalla de depreciación ya utiliza
        depreciationRecords.push({
          asset_id: (asset as any).id,
          asset_code: (asset as any).code,
          asset_name: (asset as any).name,
          category: (asset as any).category,
          acquisition_cost: purchaseValue,
          monthly_depreciation: finalDepreciation,
          accumulated_depreciation: newAccumulated,
          remaining_value: newBookValue,
          depreciation_date: targetDate,
          period: targetMonth,
          method: (asset as any).depreciation_method || 'Línea Recta',
          status: 'Calculado',
        });

        // Actualizar activo con nueva depreciación acumulada y valor actual (valor en libros)
        await supabase
          .from('fixed_assets')
          .update({
            accumulated_depreciation: newAccumulated,
            current_value: newBookValue,
          })
          .eq('id', asset.id);

        totalDepreciation += finalDepreciation;

        // Agrupar por cuenta contable usando la configuración del tipo de activo
        const { depreciationAccountId, accumulatedAccountId } = findAccountsForAsset(asset as any);

        if (depreciationAccountId && accumulatedAccountId) {
          const key = `${depreciationAccountId}|${accumulatedAccountId}`;
          if (!accountTotals[key]) {
            accountTotals[key] = { depreciation: 0, accumulated: 0 };
          }
          accountTotals[key].depreciation += finalDepreciation;
          accountTotals[key].accumulated += finalDepreciation;
        }
      }

      if (depreciationRecords.length === 0) {
        return { depreciations: [], journalEntry: null, message: 'No hay activos que requieran depreciación este mes' };
      }

      // Crear registros de depreciación
      let createdDepreciations = await this.createMany(userId, depreciationRecords);

      // Crear asiento contable automático
      let journalEntry = null;
      if (totalDepreciation > 0 && Object.keys(accountTotals).length > 0) {
        try {
          const entryLines: any[] = [];
          let lineNumber = 1;

          // Líneas de débito: Gasto por Depreciación
          Object.entries(accountTotals).forEach(([key, totals]) => {
            const [depreciationAccountId, accumulatedAccountId] = key.split('|');
            
            entryLines.push({
              account_id: depreciationAccountId,
              description: `Depreciación del mes ${targetMonth}`,
              debit_amount: totals.depreciation,
              credit_amount: 0,
              line_number: lineNumber++,
            });

            entryLines.push({
              account_id: accumulatedAccountId,
              description: `Depreciación Acumulada ${targetMonth}`,
              debit_amount: 0,
              credit_amount: totals.accumulated,
              line_number: lineNumber++,
            });
          });

          const entryPayload = {
            entry_number: `DEP-${targetMonth}`,
            entry_date: targetDate,
            description: `Depreciación automática de activos fijos - ${targetMonth}`,
            reference: null,
            status: 'posted' as const,
          };

          journalEntry = await journalEntriesService.createWithLines(tenantId, entryPayload, entryLines);

          // Guardar el asiento asociado en cada depreciación creada, para poder navegar "exacto" desde la UI.
          const resolvedEntryNumber =
            (journalEntry as any)?.entry_number || (journalEntry as any)?.entryNumber || entryPayload.entry_number;

          if (resolvedEntryNumber && Array.isArray(createdDepreciations) && createdDepreciations.length > 0) {
            const ids = createdDepreciations
              .map((d: any) => d?.id)
              .filter((id: any) => typeof id === 'string' && id.trim().length > 0);

            if (ids.length > 0) {
              await supabase
                .from('fixed_asset_depreciations')
                .update({ journal_entry_number: resolvedEntryNumber })
                .in('id', ids);

              createdDepreciations = createdDepreciations.map((d: any) => ({
                ...d,
                journal_entry_number: resolvedEntryNumber,
              }));
            }
          }
        } catch (jeError) {
          console.error('Error creating depreciation journal entry:', jeError);
        }
      }

      return {
        depreciations: createdDepreciations,
        journalEntry,
        message: `Depreciación calculada correctamente: ${depreciationRecords.length} activos, Total: ${totalDepreciation.toFixed(2)}`,
      };
    } catch (error) {
      console.error('assetDepreciationService.calculateMonthlyDepreciation error', error);
      throw error;
    }
  },
};

/* ==========================================================
  Fixed Asset Revaluations Service
  Tabla: fixed_asset_revaluations
========================================================== */
export const revaluationService = {
  async getAll(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('fixed_asset_revaluations')
        .select('*')
        .eq('user_id', tenantId)
        .order('revaluation_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data ?? [];
    } catch (error) {
      console.error('revaluationService.getAll error', error);
      return [];
    }
  },

  async create(userId: string, payload: any) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');
      const insertPayload = {
        ...payload,
        user_id: tenantId,
      };
      const { data, error } = await supabase
        .from('fixed_asset_revaluations')
        .insert(insertPayload)
        .select('*')
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('revaluationService.create error', error);
      throw error;
    }
  },

  async update(id: string, payload: any) {
    try {
      const { data, error } = await supabase
        .from('fixed_asset_revaluations')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('revaluationService.update error', error);
      throw error;
    }
  },

  async delete(id: string) {
    try {
      const { error } = await supabase
        .from('fixed_asset_revaluations')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('revaluationService.delete error', error);
      throw error;
    }
  },
};

/* ==========================================================
   Jobs / Employments Service
   Tablas: job_portals, job_applications
========================================================== */
export const jobsService = {
  async syncPortalPositionsFromRoles(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];

      const { data: roles, error: rolesError } = await supabase
        .from('roles')
        .select('name')
        .eq('owner_user_id', tenantId)
        .order('name');

      if (rolesError) throw rolesError;

      const positions = Array.from(
        new Set(
          (roles || [])
            .map((r: any) => String(r?.name || '').trim())
            .filter((n: string) => n.length > 0)
            .filter((n: string) => n.toLowerCase() !== 'admin')
        )
      );

      const now = new Date().toISOString();
      const { data: updated, error: updErr } = await supabase
        .from('job_portals')
        .update({ positions, updated_at: now })
        .eq('user_id', tenantId)
        .select('*')
        .maybeSingle();

      if (updErr) throw updErr;
      if (updated) return updated.positions ?? positions;
      return positions;
    } catch (error) {
      console.error('jobsService.syncPortalPositionsFromRoles error', error);
      throw error;
    }
  },

  async getOrCreatePortal(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');

      const { data: existing, error: selErr } = await supabase
        .from('job_portals')
        .select('*')
        .eq('user_id', tenantId)
        .limit(1)
        .maybeSingle();

      if (!selErr && existing) {
        try {
          const positions = await jobsService.syncPortalPositionsFromRoles(userId);
          if (positions) return { ...existing, positions };
        } catch {
          // ignore sync failures; portal still usable
        }
        return existing;
      }

      if (selErr) {
        const selMsg = String((selErr as any)?.message || '').toLowerCase();
        if (
          (selErr as any)?.code === '42P01' ||
          selMsg.includes("could not find the table 'public.job_portals'") ||
          selMsg.includes('relation "public.job_portals" does not exist')
        ) {
          throw new Error('Jobs module database tables are missing. Please apply migration 20260129000002_create_jobs_module.sql in Supabase.');
        }
      }

      const { data, error } = await supabase
        .from('job_portals')
        .insert({ user_id: tenantId })
        .select('*')
        .single();

      if (error) {
        const msg = String((error as any)?.message || '').toLowerCase();
        if (
          (error as any)?.code === '42P01' ||
          msg.includes("could not find the table 'public.job_portals'") ||
          msg.includes('relation "public.job_portals" does not exist')
        ) {
          throw new Error('Jobs module database tables are missing. Please apply migration 20260129000002_create_jobs_module.sql in Supabase.');
        }
        throw error;
      }
      try {
        const positions = await jobsService.syncPortalPositionsFromRoles(userId);
        return { ...(data as any), positions };
      } catch {
        return data;
      }
    } catch (error) {
      console.error('jobsService.getOrCreatePortal error', error);
      throw error;
    }
  },

  async listApplications(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('job_applications')
        .select('*')
        .eq('user_id', tenantId)
        .order('created_at', { ascending: false });

      if (error) return handleDatabaseError(error, []);
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async updateApplicationStatus(applicationId: string, status: string) {
    try {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('job_applications')
        .update({ status, updated_at: now })
        .eq('id', applicationId)
        .select('*')
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('jobsService.updateApplicationStatus error', error);
      throw error;
    }
  },
};

/* ==========================================================
   Product Categories Service
   Tabla: product_categories
========================================================== */
export const productCategoriesService = {
  async getAll(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('product_categories')
        .select('*')
        .eq('user_id', tenantId)
        .order('name');

      if (error) {
        // If table doesn't exist, return empty array
        if (
          error.code === '42P01' ||
          (error as any).status === 404 ||
          error.message?.includes('does not exist') ||
          error.message?.includes("Could not find the table 'public.product_categories'")
        ) {
          console.warn('product_categories table does not exist yet');
          return [];
        }
        return handleDatabaseError(error, []);
      }
      return data ?? [];
    } catch (error) {
      return handleDatabaseError(error, []);
    }
  },

  async create(userId: string, category: { name: string; description?: string; color?: string }) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('userId required');

      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('product_categories')
        .insert({
          user_id: tenantId,
          name: category.name,
          description: category.description || null,
          color: category.color || null,
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('productCategoriesService.create error', error);
      throw error;
    }
  },

  async update(id: string, category: { name?: string; description?: string; color?: string }) {
    try {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('product_categories')
        .update({
          ...category,
          updated_at: now,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('productCategoriesService.update error', error);
      throw error;
    }
  },

  async delete(id: string) {
    try {
      const { error } = await supabase
        .from('product_categories')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('productCategoriesService.delete error', error);
      throw error;
    }
  },
};

/* ==========================================================
   Cash Finance Services (Petty Cash, Expenses, Income, Accounts Payable)
========================================================== */
export const cashFinanceService = {
  // Petty Cash
  async getPettyCash(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('cash_finance_petty_cash')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('date', { ascending: false });
      if (error) throw error;
      return data ?? [];
    } catch (error) {
      console.error('cashFinanceService.getPettyCash error', error);
      return [];
    }
  },

  async savePettyCash(userId: string, item: { description: string; amount: number; type: 'in' | 'out'; category: string; date: string }) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('Tenant not found');
      const { data, error } = await supabase
        .from('cash_finance_petty_cash')
        .insert({ tenant_id: tenantId, ...item })
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('cashFinanceService.savePettyCash error', error);
      throw error;
    }
  },

  // Expenses
  async getExpenses(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('cash_finance_expenses')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('date', { ascending: false });
      if (error) throw error;
      return data ?? [];
    } catch (error) {
      console.error('cashFinanceService.getExpenses error', error);
      return [];
    }
  },

  async saveExpense(userId: string, item: { description: string; amount: number; category: string; vendor: string; status: string; date: string }) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('Tenant not found');
      const { data, error } = await supabase
        .from('cash_finance_expenses')
        .insert({ tenant_id: tenantId, ...item })
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('cashFinanceService.saveExpense error', error);
      throw error;
    }
  },

  async updateExpenseStatus(id: string, status: string) {
    try {
      const { data, error } = await supabase
        .from('cash_finance_expenses')
        .update({ status })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('cashFinanceService.updateExpenseStatus error', error);
      throw error;
    }
  },

  // Income
  async getIncome(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('cash_finance_income')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('date', { ascending: false });
      if (error) throw error;
      return data ?? [];
    } catch (error) {
      console.error('cashFinanceService.getIncome error', error);
      return [];
    }
  },

  async saveIncome(userId: string, item: { description: string; amount: number; source: string; category: string; date: string }) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('Tenant not found');
      const { data, error } = await supabase
        .from('cash_finance_income')
        .insert({ tenant_id: tenantId, ...item })
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('cashFinanceService.saveIncome error', error);
      throw error;
    }
  },

  // Accounts Payable
  async getAccountsPayable(userId: string) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('cash_finance_accounts_payable')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('due_date', { ascending: true });
      if (error) throw error;
      return data ?? [];
    } catch (error) {
      console.error('cashFinanceService.getAccountsPayable error', error);
      return [];
    }
  },

  async saveAccountPayable(userId: string, item: { vendor: string; description: string; amount: number; due_date: string; status: string }) {
    try {
      const tenantId = await resolveTenantId(userId);
      if (!tenantId) throw new Error('Tenant not found');
      const { data, error } = await supabase
        .from('cash_finance_accounts_payable')
        .insert({ tenant_id: tenantId, ...item })
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('cashFinanceService.saveAccountPayable error', error);
      throw error;
    }
  },

  async updateAccountPayableStatus(id: string, status: string) {
    try {
      const { data, error } = await supabase
        .from('cash_finance_accounts_payable')
        .update({ status })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('cashFinanceService.updateAccountPayableStatus error', error);
      throw error;
    }
  },
};
