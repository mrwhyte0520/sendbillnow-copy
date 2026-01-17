import { supabase } from '../../lib/supabase';

// =============================================================================
// TYPES
// =============================================================================

export interface CashDrawer {
  id: string;
  user_id: string;
  location_id: string | null;
  drawer_name: string;
  status: 'open' | 'closed';
  opened_by: string | null;
  opened_at: string | null;
  opening_cash: number | null;
  closed_by: string | null;
  closed_at: string | null;
  closing_cash_counted: number | null;
  closing_cash_expected: number | null;
  variance: number | null;
  note: string | null;
  created_at: string;
  opened_by_employee?: { id: string; first_name: string; last_name: string };
  closed_by_employee?: { id: string; first_name: string; last_name: string };
}

export interface CashTransaction {
  id: string;
  user_id: string;
  drawer_id: string;
  type: 'sale_cash_in' | 'cash_drop' | 'paid_out_expense' | 'refund_cash_out' | 'opening_adjustment' | 'closing_adjustment';
  amount: number;
  currency: string;
  reference_type: string | null;
  reference_id: string | null;
  description: string | null;
  created_by: string | null;
  created_at: string;
  created_by_employee?: { id: string; first_name: string; last_name: string };
}

export interface Expense {
  id: string;
  user_id: string;
  location_id: string | null;
  expense_date: string;
  category: string;
  amount: number;
  payment_method: 'cash' | 'card' | 'ach' | 'check';
  vendor_id: string | null;
  memo: string | null;
  created_by: string | null;
  created_at: string;
  vendor?: { id: string; name: string };
  created_by_employee?: { id: string; first_name: string; last_name: string };
}

export interface OpenDrawerPayload {
  user_id: string;
  drawer_name: string;
  location_id?: string | null;
  opened_by: string;
  opening_cash: number;
}

export interface CloseDrawerPayload {
  closed_by: string;
  closing_cash_counted: number;
  note?: string | null;
}

export interface CreateTransactionPayload {
  user_id: string;
  drawer_id: string;
  type: CashTransaction['type'];
  amount: number;
  currency?: string;
  reference_type?: string | null;
  reference_id?: string | null;
  description?: string | null;
  created_by?: string | null;
}

export interface CreateExpensePayload {
  user_id: string;
  location_id?: string | null;
  expense_date: string;
  category: string;
  amount: number;
  payment_method: Expense['payment_method'];
  vendor_id?: string | null;
  memo?: string | null;
  created_by?: string | null;
}

// =============================================================================
// CASH DRAWERS SERVICE
// =============================================================================

export const cashDrawersService = {
  async list(companyId: string, filters?: { status?: string }): Promise<CashDrawer[]> {
    let query = supabase
      .from('contador_cash_drawers')
      .select(`
        *,
        opened_by_employee:contador_employees!contador_cash_drawers_opened_by_fkey(id, first_name, last_name),
        closed_by_employee:contador_employees!contador_cash_drawers_closed_by_fkey(id, first_name, last_name)
      `)
      .eq('user_id', companyId)
      .order('created_at', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  },

  async getById(id: string): Promise<CashDrawer | null> {
    const { data, error } = await supabase
      .from('contador_cash_drawers')
      .select(`
        *,
        opened_by_employee:contador_employees!contador_cash_drawers_opened_by_fkey(id, first_name, last_name),
        closed_by_employee:contador_employees!contador_cash_drawers_closed_by_fkey(id, first_name, last_name)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  },

  async getOpenDrawer(companyId: string, locationId?: string): Promise<CashDrawer | null> {
    let query = supabase
      .from('contador_cash_drawers')
      .select('*')
      .eq('user_id', companyId)
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1);

    if (locationId) {
      query = query.eq('location_id', locationId);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data?.[0] || null;
  },

  async open(payload: OpenDrawerPayload): Promise<CashDrawer> {
    const { data, error } = await supabase
      .from('contador_cash_drawers')
      .insert({
        ...payload,
        status: 'open',
        opened_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async close(id: string, payload: CloseDrawerPayload): Promise<CashDrawer> {
    // First get expected cash
    const drawer = await this.getById(id);
    if (!drawer) throw new Error('Drawer not found');

    const expected = await this.calculateExpectedCash(id);
    const variance = payload.closing_cash_counted - expected;

    const { data, error } = await supabase
      .from('contador_cash_drawers')
      .update({
        status: 'closed',
        closed_by: payload.closed_by,
        closed_at: new Date().toISOString(),
        closing_cash_counted: payload.closing_cash_counted,
        closing_cash_expected: expected,
        variance: variance,
        note: payload.note,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async calculateExpectedCash(drawerId: string): Promise<number> {
    const drawer = await this.getById(drawerId);
    if (!drawer) return 0;

    const { data: transactions, error } = await supabase
      .from('contador_cash_transactions')
      .select('type, amount')
      .eq('drawer_id', drawerId);

    if (error) throw error;

    let balance = drawer.opening_cash || 0;

    for (const tx of transactions || []) {
      switch (tx.type) {
        case 'sale_cash_in':
        case 'opening_adjustment':
          balance += tx.amount;
          break;
        case 'cash_drop':
        case 'paid_out_expense':
        case 'refund_cash_out':
        case 'closing_adjustment':
          balance -= tx.amount;
          break;
      }
    }

    return balance;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('contador_cash_drawers')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },
};

// =============================================================================
// CASH TRANSACTIONS SERVICE
// =============================================================================

export const cashTransactionsService = {
  async list(
    companyId: string,
    filters?: {
      drawerId?: string;
      type?: string;
      startDate?: string;
      endDate?: string;
    }
  ): Promise<CashTransaction[]> {
    let query = supabase
      .from('contador_cash_transactions')
      .select(`
        *,
        created_by_employee:contador_employees!contador_cash_transactions_created_by_fkey(id, first_name, last_name)
      `)
      .eq('user_id', companyId)
      .order('created_at', { ascending: false });

    if (filters?.drawerId) {
      query = query.eq('drawer_id', filters.drawerId);
    }
    if (filters?.type) {
      query = query.eq('type', filters.type);
    }
    if (filters?.startDate) {
      query = query.gte('created_at', filters.startDate);
    }
    if (filters?.endDate) {
      query = query.lte('created_at', filters.endDate);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  },

  async create(payload: CreateTransactionPayload): Promise<CashTransaction> {
    const { data, error } = await supabase
      .from('contador_cash_transactions')
      .insert({
        ...payload,
        currency: payload.currency || 'USD',
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('contador_cash_transactions')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  async getDailySummary(
    companyId: string,
    date: string
  ): Promise<{
    sales: number;
    drops: number;
    paidOuts: number;
    refunds: number;
    netCash: number;
  }> {
    const startOfDay = `${date}T00:00:00.000Z`;
    const endOfDay = `${date}T23:59:59.999Z`;

    const { data, error } = await supabase
      .from('contador_cash_transactions')
      .select('type, amount')
      .eq('user_id', companyId)
      .gte('created_at', startOfDay)
      .lte('created_at', endOfDay);

    if (error) throw error;

    const summary = {
      sales: 0,
      drops: 0,
      paidOuts: 0,
      refunds: 0,
      netCash: 0,
    };

    for (const tx of data || []) {
      switch (tx.type) {
        case 'sale_cash_in':
          summary.sales += tx.amount;
          summary.netCash += tx.amount;
          break;
        case 'cash_drop':
          summary.drops += tx.amount;
          summary.netCash -= tx.amount;
          break;
        case 'paid_out_expense':
          summary.paidOuts += tx.amount;
          summary.netCash -= tx.amount;
          break;
        case 'refund_cash_out':
          summary.refunds += tx.amount;
          summary.netCash -= tx.amount;
          break;
      }
    }

    return summary;
  },
};

// =============================================================================
// EXPENSES SERVICE
// =============================================================================

export const expensesService = {
  async list(
    companyId: string,
    filters?: {
      category?: string;
      startDate?: string;
      endDate?: string;
      vendorId?: string;
    }
  ): Promise<Expense[]> {
    let query = supabase
      .from('contador_expenses')
      .select(`
        *,
        vendor:vendors(id, name),
        created_by_employee:contador_employees!contador_expenses_created_by_fkey(id, first_name, last_name)
      `)
      .eq('user_id', companyId)
      .order('expense_date', { ascending: false });

    if (filters?.category) {
      query = query.eq('category', filters.category);
    }
    if (filters?.startDate) {
      query = query.gte('expense_date', filters.startDate);
    }
    if (filters?.endDate) {
      query = query.lte('expense_date', filters.endDate);
    }
    if (filters?.vendorId) {
      query = query.eq('vendor_id', filters.vendorId);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  },

  async getById(id: string): Promise<Expense | null> {
    const { data, error } = await supabase
      .from('contador_expenses')
      .select(`
        *,
        vendor:vendors(id, name),
        created_by_employee:contador_employees!contador_expenses_created_by_fkey(id, first_name, last_name)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  },

  async create(payload: CreateExpensePayload): Promise<Expense> {
    const { data, error } = await supabase
      .from('contador_expenses')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async update(id: string, payload: Partial<CreateExpensePayload>): Promise<Expense> {
    const { data, error } = await supabase
      .from('contador_expenses')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('contador_expenses')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  async getCategories(companyId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('contador_expenses')
      .select('category')
      .eq('user_id', companyId);

    if (error) throw error;

    const categories = [...new Set((data || []).map((e) => e.category))];
    return categories.sort();
  },

  async getTotalByCategory(
    companyId: string,
    startDate: string,
    endDate: string
  ): Promise<{ category: string; total: number }[]> {
    const { data, error } = await supabase
      .from('contador_expenses')
      .select('category, amount')
      .eq('user_id', companyId)
      .gte('expense_date', startDate)
      .lte('expense_date', endDate);

    if (error) throw error;

    const totals: Record<string, number> = {};
    for (const expense of data || []) {
      totals[expense.category] = (totals[expense.category] || 0) + expense.amount;
    }

    return Object.entries(totals)
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);
  },
};

// =============================================================================
// EXPORT ALL
// =============================================================================

export const cashService = {
  drawers: cashDrawersService,
  transactions: cashTransactionsService,
  expenses: expensesService,
};

export default cashService;
