// =============================================================================
// CONTADOR RETURNS SERVICE
// Reads from credit_debit_notes table for customer returns (credit notes)
// Vendor returns read from AP side if available
// =============================================================================

import { supabase } from '../../lib/supabase';

// Helper to resolve tenant
const resolveTenantId = async (userId: string): Promise<string | null> => {
  if (!userId) return null;
  try {
    const { data } = await supabase
      .from('user_roles')
      .select('owner_user_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();
    if (data?.owner_user_id) return data.owner_user_id;
  } catch { /* ignore */ }
  return userId;
};

// =============================================================================
// TYPES (for interface compatibility)
// =============================================================================

export interface SalesReturn {
  id: string;
  user_id: string;
  return_number: string;
  sale_id: string | null;
  customer_id: string | null;
  return_date: string;
  refund_method: 'cash' | 'card' | 'store_credit' | 'check';
  subtotal_refund: number;
  tax_refund: number;
  total_refund: number;
  reason: string | null;
  processed_by: string | null;
  created_at: string;
  items?: SalesReturnItem[];
}

export interface SalesReturnItem {
  id: string;
  user_id: string;
  sales_return_id: string;
  product_id: string;
  qty: number;
  unit_price: number;
  tax_amount: number;
  line_total_refund: number;
  product?: { id: string; sku: string; name: string };
}

export interface VendorReturn {
  id: string;
  user_id: string;
  vendor_id: string;
  vendor_return_number: string;
  return_date: string;
  status: 'draft' | 'sent' | 'received' | 'credited';
  memo: string | null;
  created_at: string;
  vendor?: { id: string; name: string };
  items?: VendorReturnItem[];
}

export interface VendorReturnItem {
  id: string;
  user_id: string;
  vendor_return_id: string;
  product_id: string;
  qty: number;
  unit_cost: number;
  line_total: number;
  product?: { id: string; sku: string; name: string };
}

// =============================================================================
// SALES RETURNS SERVICE (READ-ONLY PLACEHOLDER)
// Returns empty arrays - returns should be implemented in core module
// =============================================================================

export const salesReturnsService = {
  /**
   * List sales returns from credit_debit_notes (credit notes = customer returns)
   */
  async list(
    companyId: string,
    filters?: {
      startDate?: string;
      endDate?: string;
      customerId?: string;
    }
  ): Promise<SalesReturn[]> {
    try {
      const tenantId = await resolveTenantId(companyId);
      if (!tenantId) return [];

      let query = supabase
        .from('credit_debit_notes')
        .select(`
          *,
          customers (id, name)
        `)
        .eq('user_id', tenantId)
        .eq('note_type', 'credit')
        .order('note_date', { ascending: false });

      if (filters?.startDate) {
        query = query.gte('note_date', filters.startDate);
      }
      if (filters?.endDate) {
        query = query.lte('note_date', filters.endDate);
      }
      if (filters?.customerId) {
        query = query.eq('customer_id', filters.customerId);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data || []).map((note: any) => ({
        id: note.id,
        user_id: note.user_id,
        return_number: note.note_number || `RET-${note.id?.slice(0, 8)}`,
        sale_id: note.invoice_id || null,
        customer_id: note.customer_id || null,
        customer_name: note.customers?.name || 'Walk-in',
        return_date: note.note_date,
        refund_method: 'store_credit' as const,
        subtotal_refund: Number(note.total_amount) || 0,
        tax_refund: 0,
        total_refund: Number(note.total_amount) || 0,
        reason: note.reason || '',
        status: note.status || 'pending',
        processed_by: null,
        created_at: note.created_at,
      }));
    } catch (error) {
      console.error('salesReturnsService.list error:', error);
      return [];
    }
  },

  async getById(id: string): Promise<SalesReturn | null> {
    try {
      const { data, error } = await supabase
        .from('credit_debit_notes')
        .select('*, customers (id, name)')
        .eq('id', id)
        .single();
      if (error) return null;
      return {
        id: data.id,
        user_id: data.user_id,
        return_number: data.note_number,
        sale_id: data.invoice_id,
        customer_id: data.customer_id,
        return_date: data.note_date,
        refund_method: 'store_credit',
        subtotal_refund: data.total_amount,
        tax_refund: 0,
        total_refund: data.total_amount,
        reason: data.reason,
        processed_by: null,
        created_at: data.created_at,
      };
    } catch {
      return null;
    }
  },

  async getTotalRefunds(
    companyId: string,
    startDate: string,
    endDate: string
  ): Promise<{ count: number; total: number }> {
    try {
      const tenantId = await resolveTenantId(companyId);
      if (!tenantId) return { count: 0, total: 0 };

      const { data, error } = await supabase
        .from('credit_debit_notes')
        .select('total_amount')
        .eq('user_id', tenantId)
        .eq('note_type', 'credit')
        .gte('note_date', startDate)
        .lte('note_date', endDate);

      if (error) throw error;

      const count = (data || []).length;
      const total = (data || []).reduce((sum: number, n: any) => sum + (Number(n.total_amount) || 0), 0);
      return { count, total };
    } catch {
      return { count: 0, total: 0 };
    }
  },

  async getReasonAnalysis(
    companyId: string,
    startDate: string,
    endDate: string
  ): Promise<{ reason: string; count: number; total: number }[]> {
    try {
      const tenantId = await resolveTenantId(companyId);
      if (!tenantId) return [];

      const { data, error } = await supabase
        .from('credit_debit_notes')
        .select('reason, total_amount')
        .eq('user_id', tenantId)
        .eq('note_type', 'credit')
        .gte('note_date', startDate)
        .lte('note_date', endDate);

      if (error) throw error;

      const analysis: Record<string, { count: number; total: number }> = {};
      (data || []).forEach((n: any) => {
        const r = n.reason || 'Other';
        if (!analysis[r]) analysis[r] = { count: 0, total: 0 };
        analysis[r].count++;
        analysis[r].total += Number(n.total_amount) || 0;
      });

      return Object.entries(analysis).map(([reason, stats]) => ({
        reason,
        count: stats.count,
        total: stats.total,
      }));
    } catch {
      return [];
    }
  },

  async create(
    companyId: string,
    payload: {
      customer_id?: string;
      invoice_id?: string;
      note_number: string;
      note_date: string;
      total_amount: number;
      reason?: string;
    }
  ): Promise<SalesReturn | null> {
    try {
      const tenantId = await resolveTenantId(companyId);
      if (!tenantId) return null;

      const { data, error } = await supabase
        .from('credit_debit_notes')
        .insert({
          user_id: tenantId,
          note_type: 'credit',
          customer_id: payload.customer_id || null,
          invoice_id: payload.invoice_id || null,
          note_number: payload.note_number,
          note_date: payload.note_date,
          total_amount: payload.total_amount,
          reason: payload.reason || null,
          applied_amount: 0,
          balance_amount: payload.total_amount,
          status: 'pending',
        })
        .select('*')
        .single();

      if (error) throw error;

      return {
        id: data.id,
        user_id: data.user_id,
        return_number: data.note_number,
        sale_id: data.invoice_id,
        customer_id: data.customer_id,
        return_date: data.note_date,
        refund_method: 'store_credit',
        subtotal_refund: data.total_amount,
        tax_refund: 0,
        total_refund: data.total_amount,
        reason: data.reason,
        processed_by: null,
        created_at: data.created_at,
      };
    } catch (error) {
      console.error('salesReturnsService.create error:', error);
      return null;
    }
  },
};

// =============================================================================
// VENDOR RETURNS SERVICE (READ-ONLY PLACEHOLDER)
// =============================================================================

export const vendorReturnsService = {
  async list(
    companyId: string,
    filters?: {
      status?: string;
      vendorId?: string;
      startDate?: string;
      endDate?: string;
    }
  ): Promise<VendorReturn[]> {
    try {
      const tenantId = await resolveTenantId(companyId);
      if (!tenantId) return [];

      // Check if ap_debit_notes table exists and has vendor returns
      // For now, try to read from a potential vendor_returns or ap_credit_notes table
      // If not available, return empty
      let query = supabase
        .from('ap_credit_notes')
        .select(`
          *,
          suppliers (id, name)
        `)
        .eq('user_id', tenantId)
        .order('note_date', { ascending: false });

      if (filters?.startDate) {
        query = query.gte('note_date', filters.startDate);
      }
      if (filters?.endDate) {
        query = query.lte('note_date', filters.endDate);
      }
      if (filters?.vendorId) {
        query = query.eq('supplier_id', filters.vendorId);
      }

      const { data, error } = await query;
      
      // If table doesn't exist or error, return empty
      if (error) {
        console.log('Vendor returns table not available:', error.message);
        return [];
      }

      return (data || []).map((note: any) => ({
        id: note.id,
        user_id: note.user_id,
        vendor_id: note.supplier_id || '',
        vendor_return_number: note.note_number || `VR-${note.id?.slice(0, 8)}`,
        return_date: note.note_date,
        status: note.status === 'applied' ? 'credited' : note.status === 'pending' ? 'draft' : 'received',
        memo: note.reason || note.notes || '',
        created_at: note.created_at,
        vendor: { id: note.supplier_id || '', name: note.suppliers?.name || 'Unknown' },
        total_amount: Number(note.total_amount) || 0,
      }));
    } catch (error) {
      console.log('vendorReturnsService.list - table may not exist:', error);
      return [];
    }
  },

  async getById(id: string): Promise<VendorReturn | null> {
    try {
      const { data, error } = await supabase
        .from('ap_credit_notes')
        .select('*, suppliers (id, name)')
        .eq('id', id)
        .single();
      if (error) return null;
      return {
        id: data.id,
        user_id: data.user_id,
        vendor_id: data.supplier_id,
        vendor_return_number: data.note_number,
        return_date: data.note_date,
        status: data.status === 'applied' ? 'credited' : 'received',
        memo: data.reason,
        created_at: data.created_at,
        vendor: { id: data.supplier_id, name: data.suppliers?.name || '' },
      };
    } catch {
      return null;
    }
  },
};

// =============================================================================
// EXPORT ALL
// =============================================================================

export const returnsService = {
  salesReturns: salesReturnsService,
  vendorReturns: vendorReturnsService,

  // List pending returns (combined count for dashboard badges)
  async listPending(userId: string): Promise<{ salesPending: number; vendorPending: number; total: number }> {
    try {
      const [salesReturns, vendorReturns] = await Promise.all([
        salesReturnsService.list(userId),
        vendorReturnsService.list(userId),
      ]);
      // Count pending: sales returns without status or status != 'completed', vendor returns with status 'draft' or 'sent'
      const salesPending = (salesReturns || []).filter((r: any) => !r.status || r.status !== 'completed').length;
      const vendorPending = (vendorReturns || []).filter((r: any) => r.status === 'draft' || r.status === 'sent').length;
      return { salesPending, vendorPending, total: salesPending + vendorPending };
    } catch {
      return { salesPending: 0, vendorPending: 0, total: 0 };
    }
  },
};

export default returnsService;
