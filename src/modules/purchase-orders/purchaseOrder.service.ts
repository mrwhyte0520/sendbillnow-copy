import type { SupplierProductResult } from '../supplier-adapters/SupplierAdapter';

export interface PurchaseOrderDraft {
  supplier: string;
  supplierId?: string | null;
  product: string;
  inventoryItemId?: string | null;
  quantity: number;
  price: number;
  delivery: string;
  status: string;
  supplierProductId: string;
  taxPercent?: number;
  notes: string;
}

export const purchaseOrderService = {
  prepareFromSupplierQuote(
    quote: SupplierProductResult,
    overrides?: Partial<Pick<PurchaseOrderDraft, 'quantity' | 'status' | 'notes'>>,
  ): PurchaseOrderDraft {
    return {
      supplier: quote.supplier,
      supplierId: quote.supplierRecord?.id || null,
      product: quote.productName,
      inventoryItemId: quote.inventoryItem?.id || null,
      quantity: overrides?.quantity || quote.quantity || 1,
      price: quote.price,
      delivery: quote.delivery,
      status: overrides?.status || 'Pending',
      supplierProductId: quote.productId,
      taxPercent: quote.taxPercent,
      notes:
        overrides?.notes ||
        `Prepared from Supplier Intelligence quote ${quote.productId} (${quote.supplier})`,
    };
  },
};
