import type { SupplierProductResult } from '../supplier-adapters/SupplierAdapter';
import { purchaseOrderService } from './purchaseOrder.service';

export function preparePurchaseOrderFromQuoteController(quote: SupplierProductResult) {
  return purchaseOrderService.prepareFromSupplierQuote(quote);
}
