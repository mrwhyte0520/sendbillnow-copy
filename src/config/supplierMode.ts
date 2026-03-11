export type SupplierMode = 'mock' | 'demo' | 'live';

const normalizeSupplierMode = (value: string | undefined): SupplierMode => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'mock' || normalized === 'demo' || normalized === 'live') {
    return normalized;
  }
  return 'live';
};

export const SUPPLIER_MODE: SupplierMode = normalizeSupplierMode(import.meta.env.VITE_SUPPLIER_MODE);
