export type SupplierCatalogImportSource = 'excel' | 'csv' | 'google-sheets' | 'json' | 'manual' | 'api-sync' | 'supplier-intelligence';

export type SupplierCatalogSyncFrequency = 'manual' | 'daily' | 'weekly';

export interface SupplierCatalogProduct {
  id: string;
  businessId: string;
  tenantId: string;
  userId: string;
  supplier: string;
  productName: string;
  price: number;
  stock: number;
  category: string;
  description: string;
  imageUrl: string;
  sku: string;
  source: SupplierCatalogImportSource;
  sourceReference?: string;
  syncFrequency?: SupplierCatalogSyncFrequency;
  lastSyncedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierCatalogPriceHistoryEntry {
  id: string;
  businessId: string;
  tenantId: string;
  userId: string;
  productId: string;
  supplierId: string;
  oldPrice: number;
  newPrice: number;
  changeDate: string;
}

export interface SupplierCatalogSyncSchedule {
  id: string;
  businessId: string;
  tenantId: string;
  userId: string;
  supplier: string;
  frequency: SupplierCatalogSyncFrequency;
  source: SupplierCatalogImportSource | 'api';
  sourceReference: string;
  lastRunAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NormalizedCatalogProductInput {
  productName: string;
  price: number;
  stock: number;
  category: string;
  description: string;
  supplier: string;
  imageUrl: string;
  sku?: string;
}
