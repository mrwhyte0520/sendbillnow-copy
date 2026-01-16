// =============================================================================
// CONTADOR RETURNS SERVICE - READ-ONLY PLACEHOLDER
// Returns module tables were removed in hybrid refactor
// Returns should be managed through core billing/sales module when implemented
// =============================================================================

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
   * List sales returns (PLACEHOLDER - returns empty until core returns module exists)
   */
  async list(
    _companyId: string,
    _filters?: {
      startDate?: string;
      endDate?: string;
      refundMethod?: string;
      customerId?: string;
    }
  ): Promise<SalesReturn[]> {
    // Returns tables removed in hybrid refactor
    // TODO: Integrate with core returns module when available
    return [];
  },

  async getById(_id: string): Promise<SalesReturn | null> {
    return null;
  },

  async getTotalRefunds(
    _companyId: string,
    _startDate: string,
    _endDate: string
  ): Promise<{ count: number; total: number }> {
    return { count: 0, total: 0 };
  },

  async getReasonAnalysis(
    _companyId: string,
    _startDate: string,
    _endDate: string
  ): Promise<{ reason: string; count: number; total: number }[]> {
    return [];
  },

  // NOTE: Write operations removed - tables deleted in hybrid refactor
};

// =============================================================================
// VENDOR RETURNS SERVICE (READ-ONLY PLACEHOLDER)
// =============================================================================

export const vendorReturnsService = {
  async list(
    _companyId: string,
    _filters?: {
      status?: string;
      vendorId?: string;
      startDate?: string;
      endDate?: string;
    }
  ): Promise<VendorReturn[]> {
    // Tables removed in hybrid refactor
    return [];
  },

  async getById(_id: string): Promise<VendorReturn | null> {
    return null;
  },

  // NOTE: Write operations removed - tables deleted in hybrid refactor
};

// =============================================================================
// EXPORT ALL
// =============================================================================

export const returnsService = {
  salesReturns: salesReturnsService,
  vendorReturns: vendorReturnsService,
};

export default returnsService;
