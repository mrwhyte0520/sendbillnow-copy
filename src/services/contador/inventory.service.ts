import { supabase } from '../../lib/supabase';

// =============================================================================
// CONTADOR INVENTORY SERVICE - READ-ONLY
// Reads from core tables: warehouses, inventory_items, inventory_movements
// =============================================================================

// =============================================================================
// TYPES (mapped from core tables)
// =============================================================================

export interface InventoryLocation {
  id: string;
  user_id: string;
  name: string;
  address: string | null;
  created_at: string;
}

export interface InventoryBalance {
  id: string;
  user_id: string;
  location_id: string;
  product_id: string;
  qty_on_hand: number;
  reorder_level: number;
  updated_at: string;
  location?: InventoryLocation;
  product?: { id: string; sku: string; name: string; cost: number };
}

export interface InventoryMovement {
  id: string;
  user_id: string;
  location_id: string;
  product_id: string;
  movement_type: string;
  qty: number;
  unit_cost: number | null;
  reference_type: string | null;
  reference_id: string | null;
  created_by: string | null;
  created_at: string;
  note: string | null;
  location?: InventoryLocation;
  product?: { id: string; sku: string; name: string };
}

export type ValuationMethod = 'fifo' | 'lifo' | 'average';

// =============================================================================
// LOCATIONS SERVICE (READ-ONLY - reads from core warehouses)
// =============================================================================

export const locationsService = {
  /**
   * List warehouses from core table (READ-ONLY)
   */
  async list(companyId: string): Promise<InventoryLocation[]> {
    const { data, error } = await supabase
      .from('warehouses')
      .select('*')
      .eq('user_id', companyId)
      .order('name');

    if (error) throw error;
    return (data || []).map((w: any) => ({
      id: w.id,
      user_id: w.user_id,
      name: w.name,
      address: w.address || null,
      created_at: w.created_at,
    }));
  },

  /**
   * Get warehouse by ID (READ-ONLY)
   */
  async getById(id: string): Promise<InventoryLocation | null> {
    const { data, error } = await supabase
      .from('warehouses')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  },

  // NOTE: Write operations removed - Contador is READ-ONLY for locations
  // Use core warehouse management for write operations
};

// =============================================================================
// INVENTORY BALANCES SERVICE (READ-ONLY - reads from core inventory_items)
// =============================================================================

export const balancesService = {
  /**
   * List inventory balances from core inventory_items (READ-ONLY)
   */
  async list(
    companyId: string,
    filters?: {
      locationId?: string;
      lowStock?: boolean;
      outOfStock?: boolean;
    }
  ): Promise<InventoryBalance[]> {
    let query = supabase
      .from('inventory_items')
      .select(`
        *,
        warehouse:warehouses(id, name)
      `)
      .eq('user_id', companyId);

    if (filters?.locationId) {
      query = query.eq('warehouse_id', filters.locationId);
    }
    if (filters?.outOfStock) {
      query = query.lte('current_stock', 0);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Map inventory_items to InventoryBalance interface
    let balances = (data || []).map((item: any) => ({
      id: item.id,
      user_id: item.user_id,
      location_id: item.warehouse_id || '',
      product_id: item.id,
      qty_on_hand: item.current_stock || 0,
      reorder_level: item.minimum_stock ?? item.reorder_point ?? item.reorder_level ?? 0,
      updated_at: item.updated_at,
      location: item.warehouse ? { id: item.warehouse.id, user_id: item.user_id, name: item.warehouse.name, address: null, created_at: '' } : undefined,
      product: {
        id: item.id,
        sku: item.sku || '',
        name: item.name,
        cost: item.average_cost ?? item.cost_price ?? item.cost ?? 0,
      },
    }));

    if (filters?.lowStock) {
      balances = balances.filter((b: InventoryBalance) => b.qty_on_hand <= b.reorder_level && b.reorder_level > 0);
    }

    return balances;
  },

  /**
   * Get low stock alerts (READ-ONLY)
   */
  async getLowStockAlerts(companyId: string): Promise<InventoryBalance[]> {
    return this.list(companyId, { lowStock: true });
  },

  /**
   * Get out of stock items (READ-ONLY)
   */
  async getOutOfStock(companyId: string): Promise<InventoryBalance[]> {
    return this.list(companyId, { outOfStock: true });
  },

  /**
   * Get total inventory value (READ-ONLY)
   */
  async getTotalValue(companyId: string, locationId?: string): Promise<number> {
    const balances = await this.list(companyId, { locationId });

    return balances.reduce((total, balance) => {
      const cost = balance.product?.cost || 0;
      return total + balance.qty_on_hand * cost;
    }, 0);
  },

  // NOTE: Write operations removed - Contador is READ-ONLY for inventory
  // Use core inventory module for write operations
};

// =============================================================================
// INVENTORY MOVEMENTS SERVICE (READ-ONLY - reads from core inventory_movements)
// =============================================================================

export const movementsService = {
  /**
   * List inventory movements from core table (READ-ONLY)
   */
  async list(
    companyId: string,
    filters?: {
      locationId?: string;
      productId?: string;
      movementType?: string;
      startDate?: string;
      endDate?: string;
    }
  ): Promise<InventoryMovement[]> {
    let query = supabase
      .from('inventory_movements')
      .select(`
        *,
        inventory_items (id, sku, name, warehouse_id)
      `)
      .eq('user_id', companyId)
      .order('created_at', { ascending: false });

    if (filters?.productId) {
      query = query.eq('item_id', filters.productId);
    }
    if (filters?.movementType) {
      query = query.eq('movement_type', filters.movementType);
    }
    if (filters?.startDate) {
      query = query.gte('created_at', filters.startDate);
    }
    if (filters?.endDate) {
      query = query.lte('created_at', filters.endDate);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Map core inventory_movements to InventoryMovement interface
    return (data || []).map((m: any) => ({
      id: m.id,
      user_id: m.user_id,
      location_id: m.inventory_items?.warehouse_id || '',
      product_id: m.item_id,
      movement_type: m.movement_type,
      qty: m.quantity,
      unit_cost: m.unit_cost,
      reference_type: m.reference_type,
      reference_id: m.reference_id,
      created_by: null,
      created_at: m.created_at,
      note: m.notes,
      product: m.inventory_items ? { id: m.inventory_items.id, sku: m.inventory_items.sku || '', name: m.inventory_items.name } : undefined,
    }));
  },

  /**
   * Get kardex/stock card for a product (READ-ONLY)
   */
  async getKardex(
    productId: string,
    _locationId: string,
    startDate?: string,
    endDate?: string
  ): Promise<{
    movements: InventoryMovement[];
    runningBalance: { movement: InventoryMovement; balance: number }[];
  }> {
    let query = supabase
      .from('inventory_movements')
      .select('*')
      .eq('item_id', productId)
      .order('created_at', { ascending: true });

    if (startDate) {
      query = query.gte('created_at', startDate);
    }
    if (endDate) {
      query = query.lte('created_at', endDate);
    }

    const { data, error } = await query;

    if (error) throw error;

    let balance = 0;
    const movements = (data || []).map((m: any) => ({
      id: m.id,
      user_id: m.user_id,
      location_id: '',
      product_id: m.item_id,
      movement_type: m.movement_type,
      qty: m.quantity,
      unit_cost: m.unit_cost,
      reference_type: m.reference_type,
      reference_id: m.reference_id,
      created_by: null,
      created_at: m.created_at,
      note: m.notes,
    }));

    const runningBalance = movements.map((movement: InventoryMovement) => {
      balance += movement.qty;
      return { movement, balance };
    });

    return { movements, runningBalance };
  },

  // NOTE: Write operations removed - Contador is READ-ONLY for movements
  // Use core inventory module for write operations
};

// =============================================================================
// VALUATION SERVICE
// =============================================================================

export const valuationService = {
  /**
   * Calculate FIFO valuation (READ-ONLY - reads from core inventory_movements)
   */
  async calculateFIFO(
    productId: string,
    _locationId: string,
    qtyToValue: number
  ): Promise<number> {
    const { data, error } = await supabase
      .from('inventory_movements')
      .select('quantity, unit_cost')
      .eq('item_id', productId)
      .gt('quantity', 0)
      .not('unit_cost', 'is', null)
      .order('created_at', { ascending: true });

    if (error) throw error;

    let remaining = qtyToValue;
    let totalCost = 0;

    for (const movement of data || []) {
      if (remaining <= 0) break;
      const qtyFromThisLot = Math.min(remaining, movement.quantity);
      totalCost += qtyFromThisLot * (movement.unit_cost || 0);
      remaining -= qtyFromThisLot;
    }

    return Math.round(totalCost * 100) / 100;
  },

  /**
   * Calculate LIFO valuation (READ-ONLY)
   */
  async calculateLIFO(
    productId: string,
    _locationId: string,
    qtyToValue: number
  ): Promise<number> {
    const { data, error } = await supabase
      .from('inventory_movements')
      .select('quantity, unit_cost')
      .eq('item_id', productId)
      .gt('quantity', 0)
      .not('unit_cost', 'is', null)
      .order('created_at', { ascending: false });

    if (error) throw error;

    let remaining = qtyToValue;
    let totalCost = 0;

    for (const movement of data || []) {
      if (remaining <= 0) break;
      const qtyFromThisLot = Math.min(remaining, movement.quantity);
      totalCost += qtyFromThisLot * (movement.unit_cost || 0);
      remaining -= qtyFromThisLot;
    }

    return Math.round(totalCost * 100) / 100;
  },

  /**
   * Calculate weighted average valuation (READ-ONLY)
   */
  async calculateWeightedAverage(
    productId: string,
    _locationId: string,
    qtyToValue: number
  ): Promise<number> {
    const { data, error } = await supabase
      .from('inventory_movements')
      .select('quantity, unit_cost')
      .eq('item_id', productId)
      .gt('quantity', 0)
      .not('unit_cost', 'is', null);

    if (error) throw error;

    let totalQty = 0;
    let totalCost = 0;

    for (const movement of data || []) {
      totalQty += movement.quantity;
      totalCost += movement.quantity * (movement.unit_cost || 0);
    }

    if (totalQty === 0) return 0;

    const avgCost = totalCost / totalQty;
    return Math.round(qtyToValue * avgCost * 100) / 100;
  },

  /**
   * Get full inventory valuation (READ-ONLY)
   */
  async getValuation(
    companyId: string,
    method: ValuationMethod,
    locationId?: string
  ): Promise<{
    items: Array<{
      product_id: string;
      product_name: string;
      qty: number;
      value: number;
    }>;
    totalValue: number;
  }> {
    const balances = await balancesService.list(companyId, { locationId });
    const items: Array<{ product_id: string; product_name: string; qty: number; value: number }> = [];
    let totalValue = 0;

    for (const balance of balances) {
      if (balance.qty_on_hand <= 0) continue;

      let value = 0;
      switch (method) {
        case 'fifo':
          value = await this.calculateFIFO(balance.product_id, balance.location_id, balance.qty_on_hand);
          break;
        case 'lifo':
          value = await this.calculateLIFO(balance.product_id, balance.location_id, balance.qty_on_hand);
          break;
        case 'average':
          value = await this.calculateWeightedAverage(balance.product_id, balance.location_id, balance.qty_on_hand);
          break;
      }

      items.push({
        product_id: balance.product_id,
        product_name: balance.product?.name || '',
        qty: balance.qty_on_hand,
        value,
      });

      totalValue += value;
    }

    return { items, totalValue };
  },
};

// =============================================================================
// EXPORT ALL
// =============================================================================

export const inventoryService = {
  locations: locationsService,
  balances: balancesService,
  movements: movementsService,
  valuation: valuationService,
};

export default inventoryService;
