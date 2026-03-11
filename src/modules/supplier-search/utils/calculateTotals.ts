import type { SupplierProductResult } from '../../supplier-adapters/SupplierAdapter';

export const parseDeliveryDays = (delivery: string) => {
  const match = String(delivery || '').match(/\d+/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
};

export const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const normalizeSupplierResult = (
  result: SupplierProductResult,
  index = 0,
): SupplierProductResult => {
  const quantity = Math.max(toNumber(result.quantity, 1), 0);
  const price = Math.max(toNumber(result.price, 0), 0);
  const discountPercent = Math.max(toNumber(result.discountPercent, 0), 0);
  const taxPercent = Math.max(toNumber(result.taxPercent, 0), 0);
  const subtotal = quantity * price;
  const discountAmount = subtotal * (discountPercent / 100);
  const taxableBase = subtotal - discountAmount;
  const taxAmount = taxableBase * (taxPercent / 100);
  const totalAmount = taxableBase + taxAmount;

  return {
    ...result,
    supplier: String(result.supplier || 'Unknown Supplier').trim() || 'Unknown Supplier',
    location: String(result.location || 'N/A').trim() || 'N/A',
    productName: String(result.productName || 'Unnamed Product').trim() || 'Unnamed Product',
    productId: String(result.productId || `SUP-${index + 1}`).trim() || `SUP-${index + 1}`,
    category: String(result.category || 'General').trim() || 'General',
    description: String(result.description || 'No description available').trim() || 'No description available',
    sku: String(result.sku || `SKU-${index + 1}`).trim() || `SKU-${index + 1}`,
    quantity,
    price,
    discountPercent,
    stock: Math.max(toNumber(result.stock, quantity), 0),
    delivery: String(result.delivery || 'N/A').trim() || 'N/A',
    taxPercent,
    amount: totalAmount,
    subtotal,
    discountAmount,
    taxAmount,
    totalAmount,
    deliveryDays: result.deliveryDays || parseDeliveryDays(result.delivery),
    availabilityScore: result.availabilityScore ?? Math.max(toNumber(result.stock, quantity), 0),
    supplierRecord: result.supplierRecord || {
      id: null,
      name: String(result.supplier || 'Unknown Supplier').trim() || 'Unknown Supplier',
      exists: false,
      canCreate: true,
    },
    inventoryItem: result.inventoryItem || {
      id: null,
      name: String(result.productName || 'Unnamed Product').trim() || 'Unnamed Product',
      sku: String(result.sku || `SKU-${index + 1}`).trim() || `SKU-${index + 1}`,
      exists: false,
    },
    decisionReasons: Array.isArray(result.decisionReasons) ? result.decisionReasons : [],
  };
};

export const calculateTotals = (results: SupplierProductResult[]) => {
  return results.map((result, index) => normalizeSupplierResult(result, index));
};
