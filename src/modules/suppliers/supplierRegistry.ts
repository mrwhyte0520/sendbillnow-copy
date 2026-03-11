import type { SupplierAdapter } from '../supplier-adapters/SupplierAdapter';

class SupplierRegistry {
  private adapters = new Map<string, SupplierAdapter>();

  registerSupplier(adapter: SupplierAdapter) {
    if (!adapter?.id) return;
    this.adapters.set(adapter.id, adapter);
  }

  getSuppliers(): SupplierAdapter[] {
    return Array.from(this.adapters.values());
  }
}

export const supplierRegistry = new SupplierRegistry();
