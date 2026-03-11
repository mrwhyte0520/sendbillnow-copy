export type SupplierImportSource = 'manual' | 'csv' | 'excel' | 'json' | 'api';

export type SupplierProductInput = {
  prov: string;
  location: string;
  product: string;
  id: string;
  category: string;
  description: string;
  qty: number;
  price: number;
  margin_percent: number;
  delivery: string;
  tax: number;
  amount: number;
  image: string;
  source?: SupplierImportSource;
};

export type SupplierProductRow = SupplierProductInput & {
  db_id: string;
  business_id: string;
  tenant_id: string;
  created_at: string;
  updated_at: string;
};

export type SupplierContext = {
  userId: string;
  tenantId: string;
  businessId: string;
};

export type SupplierImportResult = {
  processed: number;
  created: number;
  updated: number;
  imported: number;
  skipped: number;
  syncedToInventory: number;
  products: SupplierProductRow[];
};
