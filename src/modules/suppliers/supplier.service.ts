import { mockSupplierAAdapter } from '../supplier-adapters/mockSupplierA.adapter';
import { mockSupplierBAdapter } from '../supplier-adapters/mockSupplierB.adapter';
import type { SupplierProductResult, SupplierSearchOptions } from '../supplier-adapters/SupplierAdapter';
import { searchSuppliers } from '../supplier-search/searchSuppliers.service';
import { supplierCache } from './supplierCache';
import { supplierRegistry } from './supplierRegistry';

supplierRegistry.registerSupplier(mockSupplierAAdapter);
supplierRegistry.registerSupplier(mockSupplierBAdapter);

export const supplierService = {
  async searchProducts(query: string, options?: SupplierSearchOptions): Promise<SupplierProductResult[]> {
    const cachedResults = supplierCache.get(query, options);
    if (cachedResults) {
      return cachedResults;
    }

    const results = await searchSuppliers(query, supplierRegistry.getSuppliers(), options);
    supplierCache.set(query, options, results);
    return results;
  },
};
