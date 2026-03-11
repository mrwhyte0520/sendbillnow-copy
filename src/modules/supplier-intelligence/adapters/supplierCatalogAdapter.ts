import type { SupplierAdapter, SupplierProductResult } from '../../supplier-adapters/SupplierAdapter';
import { supplierCatalogService } from '../../supplier-catalog/supplierCatalog.service';

class SupplierCatalogAdapter implements SupplierAdapter {
  readonly id = 'supplier-catalog-adapter';

  readonly supplierName = 'Imported Supplier Catalog';

  async searchProduct(query: string, userId?: string): Promise<SupplierProductResult[]> {
    const normalizedQuery = String(query || '').trim();
    if (!normalizedQuery) {
      return [];
    }

    return supplierCatalogService.searchProducts(normalizedQuery, userId);
  }
}

export const supplierCatalogAdapter = new SupplierCatalogAdapter();
