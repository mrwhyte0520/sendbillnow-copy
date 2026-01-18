import { supabase } from '../../lib/supabase';
import { chartAccountsService } from '../database';

// =============================================================================
// TYPES
// =============================================================================

export interface AccountingPeriod {
  id: string;
  user_id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: 'open' | 'closed';
  closed_at: string | null;
  closed_by: string | null;
  created_at: string;
}

export interface FinancialReportSnapshot {
  id: string;
  user_id: string;
  period_id: string;
  report_type: 'pnl' | 'balance_sheet' | 'cash_flow' | 'sales_tax';
  generated_at: string;
  generated_by: string | null;
  filters_json: Record<string, any> | null;
  data_json: Record<string, any>;
}

export interface TaxJurisdiction {
  id: string;
  user_id: string;
  state: string;
  county: string | null;
  city: string | null;
  zip: string | null;
  name: string;
  created_at: string;
}

export interface TaxRate {
  id: string;
  user_id: string;
  jurisdiction_id: string;
  rate: number;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
  jurisdiction?: TaxJurisdiction;
}

export interface ProfitAndLossReport {
  period: { start: string; end: string };
  revenue: { category: string; amount: number }[];
  totalRevenue: number;
  expenses: { category: string; amount: number }[];
  totalExpenses: number;
  netIncome: number;
}

export interface BalanceSheetReport {
  asOfDate: string;
  assets: { name: string; amount: number }[];
  totalAssets: number;
  liabilities: { name: string; amount: number }[];
  totalLiabilities: number;
  equity: { name: string; amount: number }[];
  totalEquity: number;
}

export interface CashFlowReport {
  period: { start: string; end: string };
  operating: { description: string; amount: number }[];
  totalOperating: number;
  investing: { description: string; amount: number }[];
  totalInvesting: number;
  financing: { description: string; amount: number }[];
  totalFinancing: number;
  netChange: number;
}

export interface SalesTaxReport {
  period: { start: string; end: string };
  byJurisdiction: {
    jurisdiction: string;
    state: string;
    taxableSales: number;
    taxRate: number;
    taxCollected: number;
  }[];
  totalTaxableSales: number;
  totalTaxCollected: number;
}

// =============================================================================
// ACCOUNTING PERIODS SERVICE
// =============================================================================

export const accountingPeriodsService = {
  async list(companyId: string, filters?: { status?: string; year?: number }): Promise<AccountingPeriod[]> {
    let query = supabase
      .from('contador_accounting_periods')
      .select('*')
      .eq('user_id', companyId)
      .order('start_date', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.year) {
      query = query
        .gte('start_date', `${filters.year}-01-01`)
        .lte('end_date', `${filters.year}-12-31`);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  },

  async getById(id: string): Promise<AccountingPeriod | null> {
    const { data, error } = await supabase
      .from('contador_accounting_periods')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  },

  async getCurrent(companyId: string): Promise<AccountingPeriod | null> {
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('contador_accounting_periods')
      .select('*')
      .eq('user_id', companyId)
      .eq('status', 'open')
      .lte('start_date', today)
      .gte('end_date', today)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async create(payload: {
    user_id: string;
    name: string;
    start_date: string;
    end_date: string;
  }): Promise<AccountingPeriod> {
    const { data, error } = await supabase
      .from('contador_accounting_periods')
      .insert({ ...payload, status: 'open' })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async close(id: string, closedBy: string): Promise<AccountingPeriod> {
    const { data, error } = await supabase
      .from('contador_accounting_periods')
      .update({
        status: 'closed',
        closed_at: new Date().toISOString(),
        closed_by: closedBy,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async reopen(id: string): Promise<AccountingPeriod> {
    const { data, error } = await supabase
      .from('contador_accounting_periods')
      .update({
        status: 'open',
        closed_at: null,
        closed_by: null,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('contador_accounting_periods')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  async generateMonthlyPeriods(companyId: string, year: number): Promise<AccountingPeriod[]> {
    const periods: AccountingPeriod[] = [];
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];

    for (let month = 0; month < 12; month++) {
      const startDate = new Date(year, month, 1);
      const endDate = new Date(year, month + 1, 0);

      const period = await this.create({
        user_id: companyId,
        name: `${months[month]} ${year}`,
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
      });

      periods.push(period);
    }

    return periods;
  },
};

// =============================================================================
// FINANCIAL REPORT SNAPSHOTS SERVICE
// =============================================================================

export const reportSnapshotsService = {
  async list(
    companyId: string,
    filters?: { periodId?: string; reportType?: string }
  ): Promise<FinancialReportSnapshot[]> {
    let query = supabase
      .from('contador_financial_report_snapshots')
      .select('*')
      .eq('user_id', companyId)
      .order('generated_at', { ascending: false });

    if (filters?.periodId) {
      query = query.eq('period_id', filters.periodId);
    }
    if (filters?.reportType) {
      query = query.eq('report_type', filters.reportType);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  },

  async getById(id: string): Promise<FinancialReportSnapshot | null> {
    const { data, error } = await supabase
      .from('contador_financial_report_snapshots')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  },

  async create(payload: {
    user_id: string;
    period_id: string;
    report_type: 'pnl' | 'balance_sheet' | 'cash_flow' | 'sales_tax';
    generated_by?: string | null;
    filters_json?: Record<string, any> | null;
    data_json: Record<string, any>;
  }): Promise<FinancialReportSnapshot> {
    const { data, error } = await supabase
      .from('contador_financial_report_snapshots')
      .insert({
        ...payload,
        generated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('contador_financial_report_snapshots')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },
};

// =============================================================================
// TAX JURISDICTIONS SERVICE
// =============================================================================

export const taxJurisdictionsService = {
  async list(companyId: string, filters?: { state?: string }): Promise<TaxJurisdiction[]> {
    let query = supabase
      .from('contador_tax_jurisdictions')
      .select('*')
      .eq('user_id', companyId)
      .order('state')
      .order('name');

    if (filters?.state) {
      query = query.eq('state', filters.state);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  },

  async getById(id: string): Promise<TaxJurisdiction | null> {
    const { data, error } = await supabase
      .from('contador_tax_jurisdictions')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  },

  async create(payload: {
    user_id: string;
    state: string;
    county?: string | null;
    city?: string | null;
    zip?: string | null;
    name: string;
  }): Promise<TaxJurisdiction> {
    const { data, error } = await supabase
      .from('contador_tax_jurisdictions')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async update(id: string, payload: Partial<Omit<TaxJurisdiction, 'id' | 'user_id' | 'created_at'>>): Promise<TaxJurisdiction> {
    const { data, error } = await supabase
      .from('contador_tax_jurisdictions')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('contador_tax_jurisdictions')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },
};

// =============================================================================
// TAX RATES SERVICE
// =============================================================================

export const taxRatesService = {
  async list(companyId: string, filters?: { jurisdictionId?: string; effectiveDate?: string }): Promise<TaxRate[]> {
    let query = supabase
      .from('contador_tax_rates')
      .select(`
        *,
        jurisdiction:tax_jurisdictions(*)
      `)
      .eq('user_id', companyId)
      .order('effective_from', { ascending: false });

    if (filters?.jurisdictionId) {
      query = query.eq('jurisdiction_id', filters.jurisdictionId);
    }
    if (filters?.effectiveDate) {
      query = query
        .lte('effective_from', filters.effectiveDate)
        .or(`effective_to.is.null,effective_to.gte.${filters.effectiveDate}`);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  },

  async getCurrentRate(jurisdictionId: string): Promise<number> {
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('contador_tax_rates')
      .select('rate')
      .eq('jurisdiction_id', jurisdictionId)
      .lte('effective_from', today)
      .or(`effective_to.is.null,effective_to.gte.${today}`)
      .order('effective_from', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data?.rate || 0;
  },

  async create(payload: {
    user_id: string;
    jurisdiction_id: string;
    rate: number;
    effective_from: string;
    effective_to?: string | null;
  }): Promise<TaxRate> {
    const { data, error } = await supabase
      .from('contador_tax_rates')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async update(id: string, payload: { rate?: number; effective_from?: string; effective_to?: string | null }): Promise<TaxRate> {
    const { data, error } = await supabase
      .from('contador_tax_rates')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('contador_tax_rates')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },
};

// =============================================================================
// REPORT GENERATION SERVICE - Uses real journal entries and chart of accounts
// =============================================================================

export const reportGeneratorService = {
  async generateProfitAndLoss(
    companyId: string,
    startDate: string,
    endDate: string
  ): Promise<ProfitAndLossReport> {
    try {
      // Use the existing chartAccountsService which queries real journal entries
      const result = await chartAccountsService.generateIncomeStatement(companyId, startDate, endDate);

      // Map income accounts to revenue categories
      const revenue = (result.income || []).map((acc: any) => ({
        category: acc.name || 'Revenue',
        amount: acc.balance || 0,
      })).filter((r: any) => r.amount > 0);

      // Combine costs and expenses
      const expenses = [
        ...(result.costs || []).map((acc: any) => ({
          category: acc.name || 'Cost of Goods Sold',
          amount: acc.balance || 0,
        })),
        ...(result.expenses || []).map((acc: any) => ({
          category: acc.name || 'Expense',
          amount: acc.balance || 0,
        })),
      ].filter((e: any) => e.amount > 0);

      return {
        period: { start: startDate, end: endDate },
        revenue: revenue.length > 0 ? revenue : [{ category: 'Sales', amount: 0 }],
        totalRevenue: result.totalIncome || 0,
        expenses: expenses.length > 0 ? expenses : [{ category: 'Expenses', amount: 0 }],
        totalExpenses: (result.totalCosts || 0) + (result.totalExpenses || 0),
        netIncome: result.netIncome || 0,
      };
    } catch (error) {
      console.error('generateProfitAndLoss error:', error);
      return {
        period: { start: startDate, end: endDate },
        revenue: [{ category: 'Sales', amount: 0 }],
        totalRevenue: 0,
        expenses: [{ category: 'Expenses', amount: 0 }],
        totalExpenses: 0,
        netIncome: 0,
      };
    }
  },

  async generateBalanceSheet(
    companyId: string,
    asOfDate: string
  ): Promise<BalanceSheetReport> {
    try {
      // Use the existing chartAccountsService which queries real chart of accounts
      const result = await chartAccountsService.generateBalanceSheet(companyId, asOfDate);

      // Map assets
      const assets = (result.assets || []).map((acc: any) => ({
        name: acc.name || 'Asset',
        amount: acc.balance || 0,
      })).filter((a: any) => a.amount > 0);

      // Map liabilities
      const liabilities = (result.liabilities || []).map((acc: any) => ({
        name: acc.name || 'Liability',
        amount: acc.balance || 0,
      })).filter((l: any) => l.amount > 0);

      // Map equity
      const equity = (result.equity || []).map((acc: any) => ({
        name: acc.name || 'Equity',
        amount: acc.balance || 0,
      })).filter((e: any) => e.amount > 0);

      return {
        asOfDate,
        assets: assets.length > 0 ? assets : [{ name: 'Total Assets', amount: 0 }],
        totalAssets: result.totalAssets || 0,
        liabilities: liabilities.length > 0 ? liabilities : [{ name: 'Total Liabilities', amount: 0 }],
        totalLiabilities: result.totalLiabilities || 0,
        equity: equity.length > 0 ? equity : [{ name: 'Retained Earnings', amount: result.totalEquity || 0 }],
        totalEquity: result.totalEquity || 0,
      };
    } catch (error) {
      console.error('generateBalanceSheet error:', error);
      return {
        asOfDate,
        assets: [{ name: 'Total Assets', amount: 0 }],
        totalAssets: 0,
        liabilities: [{ name: 'Total Liabilities', amount: 0 }],
        totalLiabilities: 0,
        equity: [{ name: 'Retained Earnings', amount: 0 }],
        totalEquity: 0,
      };
    }
  },

  async generateCashFlow(
    companyId: string,
    startDate: string,
    endDate: string
  ): Promise<CashFlowReport> {
    try {
      // Use the existing chartAccountsService which queries real journal entries
      const result = await chartAccountsService.generateCashFlowStatement(companyId, startDate, endDate);

      const operating = [
        { description: 'Net Operating Cash', amount: result.operatingCashFlow || 0 },
      ];

      const investing = [
        { description: 'Net Investing Cash', amount: result.investingCashFlow || 0 },
      ];

      const financing = [
        { description: 'Net Financing Cash', amount: result.financingCashFlow || 0 },
      ];

      return {
        period: { start: startDate, end: endDate },
        operating,
        totalOperating: result.operatingCashFlow || 0,
        investing,
        totalInvesting: result.investingCashFlow || 0,
        financing,
        totalFinancing: result.financingCashFlow || 0,
        netChange: result.netCashFlow || 0,
      };
    } catch (error) {
      console.error('generateCashFlow error:', error);
      return {
        period: { start: startDate, end: endDate },
        operating: [{ description: 'Net Operating Cash', amount: 0 }],
        totalOperating: 0,
        investing: [{ description: 'Net Investing Cash', amount: 0 }],
        totalInvesting: 0,
        financing: [{ description: 'Net Financing Cash', amount: 0 }],
        totalFinancing: 0,
        netChange: 0,
      };
    }
  },

  async generateSalesTaxReport(
    companyId: string,
    startDate: string,
    endDate: string
  ): Promise<SalesTaxReport> {
    try {
      // Get invoices with tax data from the period
      const { data: invoices, error } = await supabase
        .from('invoices')
        .select('subtotal, tax_amount, status')
        .eq('user_id', companyId)
        .gte('invoice_date', startDate)
        .lte('invoice_date', endDate)
        .in('status', ['paid', 'partial', 'sent']);

      if (error) throw error;

      const totalTaxableSales = (invoices || []).reduce((sum, inv: any) => 
        sum + (Number(inv.subtotal) || 0), 0);
      const totalTaxCollected = (invoices || []).reduce((sum, inv: any) => 
        sum + (Number(inv.tax_amount) || 0), 0);

      // Calculate average tax rate
      const avgTaxRate = totalTaxableSales > 0 
        ? (totalTaxCollected / totalTaxableSales) * 100 
        : 0;

      // Get jurisdictions if configured
      const jurisdictions = await taxJurisdictionsService.list(companyId);
      const byJurisdiction: SalesTaxReport['byJurisdiction'] = [];

      if (jurisdictions.length > 0) {
        for (const jurisdiction of jurisdictions) {
          const rate = await taxRatesService.getCurrentRate(jurisdiction.id);
          byJurisdiction.push({
            jurisdiction: jurisdiction.name,
            state: jurisdiction.state,
            taxableSales: totalTaxableSales / jurisdictions.length,
            taxRate: rate * 100,
            taxCollected: totalTaxCollected / jurisdictions.length,
          });
        }
      } else {
        // Default single jurisdiction with aggregated data
        byJurisdiction.push({
          jurisdiction: 'Total',
          state: '-',
          taxableSales: totalTaxableSales,
          taxRate: avgTaxRate,
          taxCollected: totalTaxCollected,
        });
      }

      return {
        period: { start: startDate, end: endDate },
        byJurisdiction,
        totalTaxableSales,
        totalTaxCollected,
      };
    } catch (error) {
      console.error('generateSalesTaxReport error:', error);
      return {
        period: { start: startDate, end: endDate },
        byJurisdiction: [{
          jurisdiction: 'Total',
          state: '-',
          taxableSales: 0,
          taxRate: 0,
          taxCollected: 0,
        }],
        totalTaxableSales: 0,
        totalTaxCollected: 0,
      };
    }
  },

  async saveSnapshot(
    companyId: string,
    periodId: string,
    reportType: 'pnl' | 'balance_sheet' | 'cash_flow' | 'sales_tax',
    data: Record<string, any>,
    generatedBy?: string
  ): Promise<FinancialReportSnapshot> {
    return reportSnapshotsService.create({
      user_id: companyId,
      period_id: periodId,
      report_type: reportType,
      generated_by: generatedBy || null,
      data_json: data,
    });
  },
};

// =============================================================================
// EXPORT ALL
// =============================================================================

export const reportsService = {
  periods: accountingPeriodsService,
  snapshots: reportSnapshotsService,
  jurisdictions: taxJurisdictionsService,
  taxRates: taxRatesService,
  generator: reportGeneratorService,
};

export default reportsService;
