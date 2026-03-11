import type { SupplierAdapter, SupplierProductResult } from '../../supplier-adapters/SupplierAdapter';
import { generateMockSupplierResults } from '../utils/mockSupplierData';

class MockSupplierAdapter implements SupplierAdapter {
  readonly id = 'procurement-mock-adapter';

  readonly supplierName = 'Mock Procurement Engine';

  async searchProduct(query: string): Promise<SupplierProductResult[]> {
    const normalizedQuery = String(query || '').trim().toLowerCase();
    const results = generateMockSupplierResults(normalizedQuery);

    return results.map((result, index) => ({
      ...result,
      supplierAdapterId: `${this.id}-${index + 1}`,
      source: 'mock' as const,
    }));
  }
}

export const mockSupplierAdapter = new MockSupplierAdapter();
