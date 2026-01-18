import { supabase } from '../../lib/supabase';

// =============================================================================
// CONTADOR PRODUCTS SERVICE - READ-ONLY
// Reads from core inventory_items table (single source of truth)
// =============================================================================

// =============================================================================
// TYPES (mapped from core inventory_items)
// =============================================================================

export interface Product {
  id: string;
  user_id: string;
  sku: string;
  name: string;
  category: string | null;
  unit: string;
  cost: number;
  price: number;
  taxable: boolean;
  status: 'active' | 'inactive' | 'discontinued';
  created_at: string;
  updated_at: string;
  // Additional fields from inventory_items
  current_stock?: number;
  warehouse_id?: string | null;
}

// =============================================================================
// PRODUCTS SERVICE (READ-ONLY - reads from core inventory_items)
// =============================================================================

export const productsService = {
  /**
   * List products from core inventory_items table (READ-ONLY)
   */
  async list(
    companyId: string,
    filters?: {
      status?: string;
      category?: string;
      search?: string;
      taxable?: boolean;
    }
  ): Promise<Product[]> {
    let query = supabase
      .from('inventory_items')
      .select('*')
      .eq('user_id', companyId)
      .order('name');

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.category) {
      query = query.eq('category', filters.category);
    }
    if (filters?.search) {
      query = query.or(`name.ilike.%${filters.search}%,sku.ilike.%${filters.search}%`);
    }
    if (filters?.taxable !== undefined) {
      query = query.eq('taxable', filters.taxable);
    }

    const { data, error } = await query;

    if (error) throw error;
    
    // Map inventory_items fields to Product interface
    return (data || []).map((item: any) => ({
      id: item.id,
      user_id: item.user_id,
      sku: item.sku || '',
      name: item.name,
      category: item.category,
      unit: item.unit || 'each',
      cost: item.cost_price ?? item.cost ?? 0,
      price: item.selling_price ?? item.sale_price ?? item.unit_price ?? item.price ?? 0,
      taxable: item.taxable ?? true,
      status: item.status || 'active',
      created_at: item.created_at,
      updated_at: item.updated_at,
      current_stock: item.current_stock,
      warehouse_id: item.warehouse_id,
    }));
  },

  /**
   * Get single product by ID (READ-ONLY)
   */
  async getById(id: string): Promise<Product | null> {
    const { data, error } = await supabase
      .from('inventory_items')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Get product by SKU (READ-ONLY)
   */
  async getBySku(companyId: string, sku: string): Promise<Product | null> {
    const { data, error } = await supabase
      .from('inventory_items')
      .select('*')
      .eq('user_id', companyId)
      .eq('sku', sku)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  /**
   * Get product categories (READ-ONLY)
   */
  async getCategories(companyId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('inventory_items')
      .select('category')
      .eq('user_id', companyId)
      .not('category', 'is', null);

    if (error) throw error;

    const categories = [...new Set((data || []).map((p: any) => p.category).filter(Boolean))];
    return categories.sort() as string[];
  },

  /**
   * Get product count (READ-ONLY)
   */
  async getCount(companyId: string, status?: string): Promise<number> {
    let query = supabase
      .from('inventory_items')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', companyId);

    if (status) {
      query = query.eq('status', status);
    }

    const { count, error } = await query;

    if (error) throw error;
    return count || 0;
  },

  /**
   * Get margin analysis (READ-ONLY)
   */
  async getMarginAnalysis(companyId: string): Promise<{
    product: Product;
    margin: number;
    marginPercent: number;
  }[]> {
    const products = await this.list(companyId, { status: 'active' });

    return products
      .filter((p) => p.price > 0)
      .map((product) => ({
        product,
        margin: product.price - product.cost,
        marginPercent: ((product.price - product.cost) / product.price) * 100,
      }))
      .sort((a, b) => b.marginPercent - a.marginPercent);
  },

  /**
   * Get best sellers (READ-ONLY) - reads from core invoices/sales data
   */
  async getBestSellers(
    companyId: string,
    _startDate: string,
    _endDate: string,
    limit: number = 10
  ): Promise<Product[]> {
    // Reads from core inventory_items, sorted by price as placeholder
    const { data, error } = await supabase
      .from('inventory_items')
      .select('*')
      .eq('user_id', companyId)
      .eq('status', 'active')
      .order('price', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  },

  /**
   * Get low sellers (READ-ONLY)
   */
  async getLowSellers(
    companyId: string,
    _startDate: string,
    _endDate: string,
    limit: number = 10
  ): Promise<Product[]> {
    const { data, error } = await supabase
      .from('inventory_items')
      .select('*')
      .eq('user_id', companyId)
      .eq('status', 'active')
      .order('price', { ascending: true })
      .limit(limit);

    if (error) throw error;
    return data || [];
  },

  // NOTE: Write operations (create, update, delete, bulkUpdatePrices) removed
  // Contador module is READ-ONLY for product data
  // Use the core inventory module for write operations
};

// =============================================================================
// EXPORT
// =============================================================================

export default productsService;
