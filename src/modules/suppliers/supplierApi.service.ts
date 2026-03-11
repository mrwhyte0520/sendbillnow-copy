import type { SupplierProductResult, SupplierSearchOptions } from '../supplier-adapters/SupplierAdapter';
import { SUPPLIER_MODE } from '../../config/supplierMode';
import { supabase } from '../../lib/supabase';
import { inventoryService } from '../../services/database';
import { dummyJsonAdapter } from '../supplier-intelligence/adapters/dummyJsonAdapter';
import { liveSupplierAdapter } from '../supplier-intelligence/adapters/liveSupplierAdapter';
import { mockSupplierAdapter } from '../supplier-intelligence/adapters/mockSupplierAdapter';
import { supplierCatalogAdapter } from '../supplier-intelligence/adapters/supplierCatalogAdapter';
import { supplierCatalogService } from '../supplier-catalog/supplierCatalog.service';

const MAX_SUPPLIER_RESULTS = 50;
const REMOTE_RETRY_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 400;

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const withRetry = async (
  label: string,
  action: () => Promise<SupplierProductResult[]>,
): Promise<SupplierProductResult[]> => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= REMOTE_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      console.error(`${label} attempt ${attempt} failed:`, error);

      if (attempt < REMOTE_RETRY_ATTEMPTS) {
        await wait(BASE_BACKOFF_MS * (2 ** (attempt - 1)));
      }
    }
  }

  throw lastError;
};

const searchByMode = async (query: string): Promise<SupplierProductResult[]> => {
  if (SUPPLIER_MODE === 'mock') {
    return mockSupplierAdapter.searchProduct(query);
  }

  if (SUPPLIER_MODE === 'demo') {
    const demoResults = await withRetry('Demo supplier search', () => dummyJsonAdapter.searchProduct(query));
    return demoResults.length > 0 ? demoResults : mockSupplierAdapter.searchProduct(query);
  }

  return withRetry('Live supplier search', () => liveSupplierAdapter.searchProduct(query));
};

const shouldPersistSearchResults = () => SUPPLIER_MODE === 'live';

const getInventoryStockStatus = (stock: number, minimumStock = 5): 'in_stock' | 'low_stock' | 'out_of_stock' => {
  const normalizedStock = Number(stock) || 0;
  if (normalizedStock <= 0) return 'out_of_stock';
  if (normalizedStock <= minimumStock) return 'low_stock';
  return 'in_stock';
};

const normalizeSupplierProductForInventory = (product: SupplierProductResult) => {
  const name = String((product as any).title || product.productName || '').trim() || 'Unnamed Product';
  const price = Number((product as any).price ?? 0) || 0;
  const image = String((product as any).thumbnail || product.imageUrl || '').trim();
  const supplier = String(product.supplier || 'Imported Supplier').trim() || 'Imported Supplier';
  const stock = Math.max(Number((product as any).stock ?? product.quantity ?? 0) || 0, 0);
  const sku = String((product as any).sku || '').trim();
  const minimumStock = 5;

  return {
    name,
    sku,
    supplier,
    image,
    price,
    stock,
    minimumStock,
    stockStatus: getInventoryStockStatus(stock, minimumStock),
    category: String(product.category || 'Supplier Imported').trim() || 'Supplier Imported',
    description: String(product.description || '').trim(),
    supplierProductId: String(product.productId || '').trim() || null,
    source: 'supplier-intelligence' as const,
  };
};

const syncSupplierProductsToInventory = async (userId: string, products: SupplierProductResult[]) => {
  const existingItems = await inventoryService.getItems(userId);
  const existingBySkuOrName = new Map<string, any>();

  (existingItems || []).forEach((item: any) => {
    const skuKey = String(item?.sku || '').trim().toLowerCase();
    const nameKey = String(item?.name || '').trim().toLowerCase();

    if (skuKey) {
      existingBySkuOrName.set(`sku:${skuKey}`, item);
    }

    if (nameKey) {
      existingBySkuOrName.set(`name:${nameKey}`, item);
    }
  });

  for (const supplierProduct of products) {
    const normalized = normalizeSupplierProductForInventory(supplierProduct);
    const skuKey = normalized.sku ? `sku:${normalized.sku.toLowerCase()}` : '';
    const nameKey = `name:${normalized.name.toLowerCase()}`;
    const existingMatch = (skuKey ? existingBySkuOrName.get(skuKey) : null) || existingBySkuOrName.get(nameKey);

    const payload = {
      name: normalized.name,
      sku: normalized.sku,
      category: normalized.category,
      selling_price: normalized.price,
      cost_price: normalized.price,
      current_stock: normalized.stock,
      min_stock: normalized.minimumStock,
      minimum_stock: normalized.minimumStock,
      max_stock: Math.max(normalized.stock, normalized.minimumStock),
      barcode: '',
      description: normalized.description,
      supplier: normalized.supplier,
      image_url: normalized.image,
      is_active: true,
      preferred_supplier: normalized.supplier,
      last_supplier_price: normalized.price,
      supplier_product_id: normalized.supplierProductId,
      source: normalized.source,
      stock_status: normalized.stockStatus,
    };

    if (existingMatch?.id) {
      await inventoryService.updateItem(userId, String(existingMatch.id), payload);
      const updatedMatch = { ...existingMatch, ...payload };
      if (skuKey) {
        existingBySkuOrName.set(skuKey, updatedMatch);
      }
      existingBySkuOrName.set(nameKey, updatedMatch);
    } else {
      const created = await inventoryService.createItem(userId, payload);
      if (created) {
        const createdSkuKey = String(created?.sku || normalized.sku || '').trim().toLowerCase();
        const createdNameKey = String(created?.name || normalized.name || '').trim().toLowerCase();
        if (createdSkuKey) {
          existingBySkuOrName.set(`sku:${createdSkuKey}`, created);
        }
        if (createdNameKey) {
          existingBySkuOrName.set(`name:${createdNameKey}`, created);
        }
      }
    }
  }
};

export const supplierApiService = {
  async searchProducts(query: string, options: SupplierSearchOptions = {}): Promise<SupplierProductResult[]> {
    const normalizedQuery = String(query || '').trim();
    const explicitUserId = String(options.userId || '').trim();

    if (!normalizedQuery) {
      return [];
    }

    try {
      const { data: userData } = explicitUserId
        ? { data: { user: { id: explicitUserId } } }
        : await supabase.auth.getUser();
      const userId = explicitUserId || userData.user?.id || '';
      const [modeResults, catalogResults] = await Promise.all([
        searchByMode(normalizedQuery),
        supplierCatalogAdapter.searchProduct(normalizedQuery, userId || undefined),
      ]);

      if (userId && shouldPersistSearchResults() && Array.isArray(modeResults) && modeResults.length > 0) {
        await syncSupplierProductsToInventory(userId, modeResults).catch((syncError) => {
          console.error('Supplier intelligence inventory sync error:', syncError);
        });

        await supplierCatalogService.syncSupplierIntelligenceProducts(userId, modeResults, normalizedQuery).catch((syncError) => {
          console.error('Supplier intelligence catalog sync error:', syncError);
        });
      }

      const safeResults = [...(Array.isArray(catalogResults) ? catalogResults : []), ...(Array.isArray(modeResults) ? modeResults : [])];
      const limit = Math.max(1, Math.min(options.limit || 20, MAX_SUPPLIER_RESULTS));

      console.log('Supplier search query:', normalizedQuery);
      console.log('Supplier results:', safeResults.length);

      return safeResults.slice(0, limit);
    } catch (error) {
      console.error('Supplier search error:', error);
      return [];
    }
  },

  async createPurchaseOrderFromQuote(quote: SupplierProductResult) {
    const apiBase = import.meta.env.VITE_API_BASE_URL?.trim() || '';
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token || '';
    const response = await fetch(`${apiBase}/api/purchase-orders/create-from-quote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ quote }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || 'No se pudo preparar la orden de compra.');
    }

    return response.json();
  },
};
