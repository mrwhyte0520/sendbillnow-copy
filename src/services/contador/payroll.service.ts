import { supabase } from '../../lib/supabase';

// =============================================================================
// TYPES
// =============================================================================

export interface PayrollRun {
  id: string;
  user_id: string;
  period_start: string;
  period_end: string;
  pay_date: string;
  status: 'draft' | 'approved' | 'paid' | 'void';
  created_by: string | null;
  created_at: string;
  approved_by: string | null;
  approved_at: string | null;
  items?: PayrollItem[];
}

export interface EmployeePayProfile {
  id: string;
  user_id: string;
  employee_id: string;
  pay_type: 'hourly' | 'salary';
  hourly_rate: number | null;
  salary_amount: number | null;
  salary_frequency: 'weekly' | 'biweekly' | 'semimonthly' | 'monthly' | null;
  federal_filing_status: string | null;
  state_code: string | null;
  state_filing_status: string | null;
  allowances: number | null;
  created_at: string;
  updated_at: string;
  employee?: { id: string; first_name: string; last_name: string; employee_no: string };
}

export interface PayrollItem {
  id: string;
  user_id: string;
  payroll_run_id: string;
  employee_id: string;
  gross_pay: number;
  overtime_pay: number;
  bonuses: number;
  pre_tax_deductions: number;
  taxes_total: number;
  post_tax_deductions: number;
  net_pay: number;
  payment_method: 'ach' | 'check' | 'cash';
  paid_at: string | null;
  created_at: string;
  employee?: { id: string; first_name: string; last_name: string; employee_no: string };
  tax_lines?: PayrollTaxLine[];
}

export interface PayrollTaxLine {
  id: string;
  user_id: string;
  payroll_item_id: string;
  tax_type: 'federal_withholding' | 'state_withholding' | 'social_security' | 'medicare' | 'local_tax' | 'futa' | 'suta';
  amount: number;
  employer_amount: number;
  jurisdiction: string | null;
  created_at: string;
}

export interface CreatePayrollRunPayload {
  user_id: string;
  period_start: string;
  period_end: string;
  pay_date: string;
  created_by?: string | null;
}

export interface CreatePayProfilePayload {
  user_id: string;
  employee_id: string;
  pay_type: 'hourly' | 'salary';
  hourly_rate?: number | null;
  salary_amount?: number | null;
  salary_frequency?: 'weekly' | 'biweekly' | 'semimonthly' | 'monthly' | null;
  federal_filing_status?: string | null;
  state_code?: string | null;
  state_filing_status?: string | null;
  allowances?: number | null;
}

export interface CreatePayrollItemPayload {
  user_id: string;
  payroll_run_id: string;
  employee_id: string;
  gross_pay: number;
  overtime_pay?: number;
  bonuses?: number;
  pre_tax_deductions?: number;
  taxes_total?: number;
  post_tax_deductions?: number;
  net_pay: number;
  payment_method?: 'ach' | 'check' | 'cash';
}

// =============================================================================
// US TAX CONSTANTS (2024)
// =============================================================================

export const US_TAX_RATES = {
  SOCIAL_SECURITY_RATE: 0.062,
  SOCIAL_SECURITY_WAGE_BASE: 168600,
  MEDICARE_RATE: 0.0145,
  ADDITIONAL_MEDICARE_RATE: 0.009,
  ADDITIONAL_MEDICARE_THRESHOLD: 200000,
  FUTA_RATE: 0.006,
  FUTA_WAGE_BASE: 7000,
};

// =============================================================================
// PAYROLL RUNS SERVICE
// =============================================================================

export const payrollRunsService = {
  async list(companyId: string, filters?: { status?: string; year?: number }): Promise<PayrollRun[]> {
    let query = supabase
      .from('contador_payroll_runs')
      .select('*')
      .eq('user_id', companyId)
      .order('period_start', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.year) {
      query = query
        .gte('period_start', `${filters.year}-01-01`)
        .lte('period_end', `${filters.year}-12-31`);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  },

  async getById(id: string): Promise<PayrollRun | null> {
    const { data, error } = await supabase
      .from('contador_payroll_runs')
      .select(`
        *,
        items:contador_payroll_items(
          *,
          employee:contador_employees(id, first_name, last_name, employee_no),
          tax_lines:contador_payroll_tax_lines(*)
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  },

  async create(payload: CreatePayrollRunPayload): Promise<PayrollRun> {
    const { data, error } = await supabase
      .from('contador_payroll_runs')
      .insert({
        ...payload,
        status: 'draft',
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async approve(id: string, approvedBy: string): Promise<PayrollRun> {
    const { data, error } = await supabase
      .from('contador_payroll_runs')
      .update({
        status: 'approved',
        approved_by: approvedBy,
        approved_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async markPaid(id: string): Promise<PayrollRun> {
    const { data, error } = await supabase
      .from('contador_payroll_runs')
      .update({ status: 'paid' })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Mark all items as paid
    await supabase
      .from('contador_payroll_items')
      .update({ paid_at: new Date().toISOString() })
      .eq('payroll_run_id', id);

    return data;
  },

  async void(id: string): Promise<PayrollRun> {
    const { data, error } = await supabase
      .from('contador_payroll_runs')
      .update({ status: 'void' })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('contador_payroll_runs')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  async getTotals(id: string): Promise<{
    totalGross: number;
    totalTaxes: number;
    totalNet: number;
    employeeCount: number;
  }> {
    const { data, error } = await supabase
      .from('contador_payroll_items')
      .select('gross_pay, taxes_total, net_pay')
      .eq('payroll_run_id', id);

    if (error) throw error;

    return {
      totalGross: (data || []).reduce((sum, i) => sum + i.gross_pay, 0),
      totalTaxes: (data || []).reduce((sum, i) => sum + i.taxes_total, 0),
      totalNet: (data || []).reduce((sum, i) => sum + i.net_pay, 0),
      employeeCount: data?.length || 0,
    };
  },
};

// =============================================================================
// EMPLOYEE PAY PROFILES SERVICE
// =============================================================================

export const payProfilesService = {
  async list(companyId: string): Promise<EmployeePayProfile[]> {
    const { data, error } = await supabase
      .from('contador_employee_pay_profiles')
      .select(`
        *,
        employee:contador_employees(id, first_name, last_name, employee_no)
      `)
      .eq('user_id', companyId);

    if (error) throw error;
    return data || [];
  },

  async getByEmployee(employeeId: string): Promise<EmployeePayProfile | null> {
    const { data, error } = await supabase
      .from('contador_employee_pay_profiles')
      .select('*')
      .eq('employee_id', employeeId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async create(payload: CreatePayProfilePayload): Promise<EmployeePayProfile> {
    const { data, error } = await supabase
      .from('contador_employee_pay_profiles')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async update(id: string, payload: Partial<CreatePayProfilePayload>): Promise<EmployeePayProfile> {
    const { data, error } = await supabase
      .from('contador_employee_pay_profiles')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async upsert(payload: CreatePayProfilePayload): Promise<EmployeePayProfile> {
    const existing = await this.getByEmployee(payload.employee_id);
    if (existing) {
      return this.update(existing.id, payload);
    }
    return this.create(payload);
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('contador_employee_pay_profiles')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },
};

// =============================================================================
// PAYROLL ITEMS SERVICE
// =============================================================================

export const payrollItemsService = {
  async listByRun(payrollRunId: string): Promise<PayrollItem[]> {
    const { data, error } = await supabase
      .from('contador_payroll_items')
      .select(`
        *,
        employee:contador_employees(id, first_name, last_name, employee_no),
        tax_lines:contador_payroll_tax_lines(*)
      `)
      .eq('payroll_run_id', payrollRunId);

    if (error) throw error;
    return data || [];
  },

  async getById(id: string): Promise<PayrollItem | null> {
    const { data, error } = await supabase
      .from('contador_payroll_items')
      .select(`
        *,
        employee:contador_employees(id, first_name, last_name, employee_no),
        tax_lines:contador_payroll_tax_lines(*)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  },

  async create(payload: CreatePayrollItemPayload): Promise<PayrollItem> {
    const { data, error } = await supabase
      .from('contador_payroll_items')
      .insert({
        ...payload,
        overtime_pay: payload.overtime_pay || 0,
        bonuses: payload.bonuses || 0,
        pre_tax_deductions: payload.pre_tax_deductions || 0,
        taxes_total: payload.taxes_total || 0,
        post_tax_deductions: payload.post_tax_deductions || 0,
        payment_method: payload.payment_method || 'check',
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async update(id: string, payload: Partial<CreatePayrollItemPayload>): Promise<PayrollItem> {
    const { data, error } = await supabase
      .from('contador_payroll_items')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('contador_payroll_items')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },
};

// =============================================================================
// PAYROLL TAX LINES SERVICE
// =============================================================================

export const payrollTaxLinesService = {
  async listByItem(payrollItemId: string): Promise<PayrollTaxLine[]> {
    const { data, error } = await supabase
      .from('contador_payroll_tax_lines')
      .select('*')
      .eq('payroll_item_id', payrollItemId);

    if (error) throw error;
    return data || [];
  },

  async create(payload: {
    user_id: string;
    payroll_item_id: string;
    tax_type: PayrollTaxLine['tax_type'];
    amount: number;
    employer_amount?: number;
    jurisdiction?: string | null;
  }): Promise<PayrollTaxLine> {
    const { data, error } = await supabase
      .from('contador_payroll_tax_lines')
      .insert({
        ...payload,
        employer_amount: payload.employer_amount || 0,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async bulkCreate(lines: Array<{
    user_id: string;
    payroll_item_id: string;
    tax_type: PayrollTaxLine['tax_type'];
    amount: number;
    employer_amount?: number;
    jurisdiction?: string | null;
  }>): Promise<PayrollTaxLine[]> {
    const { data, error } = await supabase
      .from('contador_payroll_tax_lines')
      .insert(lines.map(l => ({ ...l, employer_amount: l.employer_amount || 0 })))
      .select();

    if (error) throw error;
    return data || [];
  },

  async deleteByItem(payrollItemId: string): Promise<void> {
    const { error } = await supabase
      .from('contador_payroll_tax_lines')
      .delete()
      .eq('payroll_item_id', payrollItemId);

    if (error) throw error;
  },
};

// =============================================================================
// TAX CALCULATION HELPERS
// =============================================================================

export const taxCalculator = {
  calculateFICA(grossPay: number, ytdWages: number = 0): {
    socialSecurity: number;
    socialSecurityEmployer: number;
    medicare: number;
    medicareEmployer: number;
    additionalMedicare: number;
  } {
    const { SOCIAL_SECURITY_RATE, SOCIAL_SECURITY_WAGE_BASE, MEDICARE_RATE, ADDITIONAL_MEDICARE_RATE, ADDITIONAL_MEDICARE_THRESHOLD } = US_TAX_RATES;

    // Social Security (capped at wage base)
    let socialSecurityWages = grossPay;
    if (ytdWages >= SOCIAL_SECURITY_WAGE_BASE) {
      socialSecurityWages = 0;
    } else if (ytdWages + grossPay > SOCIAL_SECURITY_WAGE_BASE) {
      socialSecurityWages = SOCIAL_SECURITY_WAGE_BASE - ytdWages;
    }

    const socialSecurity = socialSecurityWages * SOCIAL_SECURITY_RATE;
    const socialSecurityEmployer = socialSecurityWages * SOCIAL_SECURITY_RATE;

    // Medicare (no cap)
    const medicare = grossPay * MEDICARE_RATE;
    const medicareEmployer = grossPay * MEDICARE_RATE;

    // Additional Medicare (employee only, over threshold)
    let additionalMedicare = 0;
    if (ytdWages + grossPay > ADDITIONAL_MEDICARE_THRESHOLD) {
      const additionalWages = ytdWages >= ADDITIONAL_MEDICARE_THRESHOLD
        ? grossPay
        : (ytdWages + grossPay - ADDITIONAL_MEDICARE_THRESHOLD);
      additionalMedicare = additionalWages * ADDITIONAL_MEDICARE_RATE;
    }

    return {
      socialSecurity: Math.round(socialSecurity * 100) / 100,
      socialSecurityEmployer: Math.round(socialSecurityEmployer * 100) / 100,
      medicare: Math.round(medicare * 100) / 100,
      medicareEmployer: Math.round(medicareEmployer * 100) / 100,
      additionalMedicare: Math.round(additionalMedicare * 100) / 100,
    };
  },

  calculateFUTA(grossPay: number, ytdWages: number = 0): number {
    const { FUTA_RATE, FUTA_WAGE_BASE } = US_TAX_RATES;

    if (ytdWages >= FUTA_WAGE_BASE) return 0;

    const futaWages = Math.min(grossPay, FUTA_WAGE_BASE - ytdWages);
    return Math.round(futaWages * FUTA_RATE * 100) / 100;
  },

  calculateNetPay(
    grossPay: number,
    preTaxDeductions: number,
    taxes: number,
    postTaxDeductions: number
  ): number {
    return Math.round((grossPay - preTaxDeductions - taxes - postTaxDeductions) * 100) / 100;
  },

  calculateOvertimePay(regularHours: number, overtimeHours: number, hourlyRate: number): {
    regularPay: number;
    overtimePay: number;
    totalPay: number;
  } {
    const regularPay = regularHours * hourlyRate;
    const overtimePay = overtimeHours * hourlyRate * 1.5;
    return {
      regularPay: Math.round(regularPay * 100) / 100,
      overtimePay: Math.round(overtimePay * 100) / 100,
      totalPay: Math.round((regularPay + overtimePay) * 100) / 100,
    };
  },
};

// =============================================================================
// EXPORT ALL
// =============================================================================

export const payrollService = {
  runs: payrollRunsService,
  profiles: payProfilesService,
  items: payrollItemsService,
  taxLines: payrollTaxLinesService,
  calculator: taxCalculator,
  taxRates: US_TAX_RATES,
};

export default payrollService;
