import type { SupplierProductResult, SupplierSearchOptions } from '../supplier-adapters/SupplierAdapter';

const CACHE_TTL_MS = 30_000;

type CacheEntry = {
  expiresAt: number;
  results: SupplierProductResult[];
};

class SupplierCache {
  private entries = new Map<string, CacheEntry>();

  private buildKey(query: string, options?: SupplierSearchOptions) {
    const normalizedQuery = String(query || '').trim().toLowerCase();
    const sortBy = options?.sortBy || 'price';
    const limit = options?.limit || 20;
    return `${normalizedQuery}::${sortBy}::${limit}`;
  }

  get(query: string, options?: SupplierSearchOptions): SupplierProductResult[] | null {
    const key = this.buildKey(query, options);
    const entry = this.entries.get(key);

    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.entries.delete(key);
      return null;
    }

    return entry.results;
  }

  set(query: string, options: SupplierSearchOptions | undefined, results: SupplierProductResult[]) {
    const key = this.buildKey(query, options);
    this.entries.set(key, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      results,
    });
  }
}

export const supplierCache = new SupplierCache();
