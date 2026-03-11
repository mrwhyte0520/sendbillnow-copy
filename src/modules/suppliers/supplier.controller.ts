import type { SupplierSearchOptions } from '../supplier-adapters/SupplierAdapter';
import { supplierService } from './supplier.service';

export async function searchSupplierProductsController(query: string, options?: SupplierSearchOptions) {
  return supplierService.searchProducts(query, options);
}
