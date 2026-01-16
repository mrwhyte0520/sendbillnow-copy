import { supabase } from '../../lib/supabase';

// =============================================================================
// CONTADOR VENDORS SERVICE - READ-ONLY
// Reads from core tables: suppliers, ap_invoices, purchase_orders
// =============================================================================

// =============================================================================
// TYPES (mapped from core tables)
// =============================================================================

export interface Vendor {
  id: string;
  user_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  tax_id: string | null;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrder {
  id: string;
  user_id: string;
  po_number: string;
  vendor_id: string;
  order_date: string;
  status: 'draft' | 'sent' | 'received' | 'cancelled';
  subtotal: number;
  tax: number;
  total: number;
  created_by: string | null;
  created_at: string;
  vendor?: Vendor;
}

export interface VendorBill {
  id: string;
  user_id: string;
  vendor_id: string;
  bill_number: string;
  bill_date: string;
  due_date: string | null;
  status: 'open' | 'partially_paid' | 'paid' | 'void';
  subtotal: number;
  tax: number;
  total: number;
  balance_due: number;
  memo: string | null;
  created_at: string;
  vendor?: Vendor;
}

// =============================================================================
// VENDORS SERVICE (READ-ONLY - reads from core suppliers)
// =============================================================================

export const vendorsService = {
  /**
   * List vendors from core suppliers table (READ-ONLY)
   */
  async list(companyId: string, filters?: { status?: string; search?: string }): Promise<Vendor[]> {
    let query = supabase
      .from('suppliers')
      .select('*')
      .eq('user_id', companyId)
      .order('legal_name');

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.search) {
      query = query.ilike('legal_name', `%${filters.search}%`);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Map suppliers to Vendor interface
    return (data || []).map((s: any) => ({
      id: s.id,
      user_id: s.user_id,
      name: s.legal_name || s.trade_name || '',
      email: s.email,
      phone: s.phone,
      address1: s.address,
      address2: null,
      city: s.city,
      state: s.state,
      zip: s.postal_code,
      tax_id: s.tax_id,
      status: s.status || 'active',
      created_at: s.created_at,
      updated_at: s.updated_at,
    }));
  },

  /**
   * Get vendor by ID (READ-ONLY)
   */
  async getById(id: string): Promise<Vendor | null> {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) return null;

    return {
      id: data.id,
      user_id: data.user_id,
      name: data.legal_name || data.trade_name || '',
      email: data.email,
      phone: data.phone,
      address1: data.address,
      address2: null,
      city: data.city,
      state: data.state,
      zip: data.postal_code,
      tax_id: data.tax_id,
      status: data.status || 'active',
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  },

  /**
   * Get vendor balance from core ap_invoices (READ-ONLY)
   */
  async getBalance(vendorId: string): Promise<number> {
    const { data, error } = await supabase
      .from('ap_invoices')
      .select('balance_amount')
      .eq('supplier_id', vendorId)
      .in('status', ['pending', 'partial']);

    if (error) throw error;
    return (data || []).reduce((sum, b) => sum + (b.balance_amount || 0), 0);
  },

  // NOTE: Write operations removed - Contador is READ-ONLY for vendors
  // Use core supplier management for write operations
};

// =============================================================================
// PURCHASE ORDERS SERVICE (READ-ONLY - reads from core purchase_orders)
// =============================================================================

export const purchaseOrdersService = {
  /**
   * List purchase orders from core table (READ-ONLY)
   */
  async list(companyId: string, filters?: { status?: string; vendorId?: string }): Promise<PurchaseOrder[]> {
    let query = supabase
      .from('purchase_orders')
      .select(`
        *,
        suppliers (id, legal_name)
      `)
      .eq('user_id', companyId)
      .order('order_date', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.vendorId) {
      query = query.eq('supplier_id', filters.vendorId);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Map to PurchaseOrder interface
    return (data || []).map((po: any) => ({
      id: po.id,
      user_id: po.user_id,
      po_number: po.po_number || '',
      vendor_id: po.supplier_id,
      order_date: po.order_date,
      status: po.status || 'draft',
      subtotal: po.subtotal || 0,
      tax: po.tax || 0,
      total: po.total || po.subtotal || 0,
      created_by: null,
      created_at: po.created_at,
      vendor: po.suppliers ? { id: po.suppliers.id, user_id: po.user_id, name: po.suppliers.legal_name || '', email: null, phone: null, address1: null, address2: null, city: null, state: null, zip: null, tax_id: null, status: 'active' as const, created_at: '', updated_at: '' } : undefined,
    }));
  },

  /**
   * Get purchase order by ID (READ-ONLY)
   */
  async getById(id: string): Promise<PurchaseOrder | null> {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select(`
        *,
        suppliers (*)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) return null;

    return {
      id: data.id,
      user_id: data.user_id,
      po_number: data.po_number || '',
      vendor_id: data.supplier_id,
      order_date: data.order_date,
      status: data.status || 'draft',
      subtotal: data.subtotal || 0,
      tax: data.tax || 0,
      total: data.total || data.subtotal || 0,
      created_by: null,
      created_at: data.created_at,
    };
  },

  // NOTE: Write operations removed - Contador is READ-ONLY for purchase orders
  // Use core purchasing module for write operations
};

// =============================================================================
// VENDOR BILLS SERVICE (READ-ONLY - reads from core ap_invoices)
// =============================================================================

export const vendorBillsService = {
  /**
   * List vendor bills from core ap_invoices (READ-ONLY)
   */
  async list(companyId: string, filters?: { status?: string; vendorId?: string }): Promise<VendorBill[]> {
    let query = supabase
      .from('ap_invoices')
      .select(`
        *,
        suppliers (id, legal_name)
      `)
      .eq('user_id', companyId)
      .order('invoice_date', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.vendorId) {
      query = query.eq('supplier_id', filters.vendorId);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Map ap_invoices to VendorBill interface
    return (data || []).map((inv: any) => ({
      id: inv.id,
      user_id: inv.user_id,
      vendor_id: inv.supplier_id,
      bill_number: inv.invoice_number || '',
      bill_date: inv.invoice_date,
      due_date: inv.due_date,
      status: inv.status === 'pending' ? 'open' : inv.status === 'partial' ? 'partially_paid' : inv.status,
      subtotal: inv.total_gross || inv.total_to_pay || 0,
      tax: inv.itbis || 0,
      total: inv.total_to_pay || 0,
      balance_due: inv.balance_amount || 0,
      memo: inv.notes,
      created_at: inv.created_at,
      vendor: inv.suppliers ? { id: inv.suppliers.id, user_id: inv.user_id, name: inv.suppliers.legal_name || '', email: null, phone: null, address1: null, address2: null, city: null, state: null, zip: null, tax_id: null, status: 'active' as const, created_at: '', updated_at: '' } : undefined,
    }));
  },

  /**
   * Get vendor bill by ID (READ-ONLY)
   */
  async getById(id: string): Promise<VendorBill | null> {
    const { data, error } = await supabase
      .from('ap_invoices')
      .select(`
        *,
        suppliers (*)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) return null;

    return {
      id: data.id,
      user_id: data.user_id,
      vendor_id: data.supplier_id,
      bill_number: data.invoice_number || '',
      bill_date: data.invoice_date,
      due_date: data.due_date,
      status: data.status === 'pending' ? 'open' : data.status === 'partial' ? 'partially_paid' : data.status,
      subtotal: data.total_gross || data.total_to_pay || 0,
      tax: data.itbis || 0,
      total: data.total_to_pay || 0,
      balance_due: data.balance_amount || 0,
      memo: data.notes,
      created_at: data.created_at,
    };
  },

  /**
   * Get AP aging report (READ-ONLY)
   */
  async getAgingReport(companyId: string): Promise<{
    current: number;
    days1to30: number;
    days31to60: number;
    days61Plus: number;
    total: number;
  }> {
    const { data, error } = await supabase
      .from('ap_invoices')
      .select('due_date, balance_amount')
      .eq('user_id', companyId)
      .in('status', ['pending', 'partial']);

    if (error) throw error;

    const today = new Date();
    const result = { current: 0, days1to30: 0, days31to60: 0, days61Plus: 0, total: 0 };

    for (const bill of data || []) {
      const dueDate = bill.due_date ? new Date(bill.due_date) : today;
      const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      const balance = bill.balance_amount || 0;

      if (daysOverdue <= 0) {
        result.current += balance;
      } else if (daysOverdue <= 30) {
        result.days1to30 += balance;
      } else if (daysOverdue <= 60) {
        result.days31to60 += balance;
      } else {
        result.days61Plus += balance;
      }
      result.total += balance;
    }

    return result;
  },

  // NOTE: Write operations removed - Contador is READ-ONLY for vendor bills
  // Use core AP module for write operations
};

// =============================================================================
// EXPORT ALL
// =============================================================================

export const vendorsModule = {
  vendors: vendorsService,
  purchaseOrders: purchaseOrdersService,
  bills: vendorBillsService,
};

export default vendorsModule;
