import { apiGet } from './client';

export const appApi = {
  getProducts: () => apiGet<any[]>('/api/products'),
  getProductById: (id: string) => apiGet<any>(`/api/products/${encodeURIComponent(id)}`),
  getSuppliers: () => apiGet<any[]>('/api/suppliers'),
  getInvoices: () => apiGet<any[]>('/api/invoices'),
  getClients: () => apiGet<any[]>('/api/clients'),
};

export * from './client';
