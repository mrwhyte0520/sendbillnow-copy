import { supabase } from '../../lib/supabase';
import { inventoryService, resolveBusinessId, resolveTenantId } from '../../services/database';
import type { SupplierProductResult } from '../supplier-adapters/SupplierAdapter';
import type {
  NormalizedCatalogProductInput,
  SupplierCatalogPriceHistoryEntry,
  SupplierCatalogProduct,
  SupplierCatalogSyncSchedule,
  SupplierCatalogSyncFrequency,
  SupplierCatalogImportSource,
} from './types';

const PRODUCTS_KEY = 'supplier_catalog_products';
const PRICE_HISTORY_KEY = 'supplier_catalog_price_history';
const SCHEDULES_KEY = 'supplier_catalog_sync_schedules';
const PRODUCTS_TABLE = 'supplier_catalog_products';
const PRICE_HISTORY_TABLE = 'supplier_catalog_price_history';
const SCHEDULES_TABLE = 'supplier_catalog_sync_schedules';

type SupplierCatalogContext = {
  businessId: string;
  userId: string;
  tenantId: string;
};

type SupplierCatalogIdentityDefaults = {
  businessId: string;
  tenantId: string;
  userId: string;
};

const getScopedKey = (baseKey: string, userId: string) => `${baseKey}:${String(userId).trim()}`;

const clearCollectionKeys = (baseKey: string, userId?: string) => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(baseKey);
  if (userId) {
    window.localStorage.removeItem(getScopedKey(baseKey, userId));
  }
  const scopedPrefix = `${baseKey}:`;
  const keysToRemove: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key && key.startsWith(scopedPrefix)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => window.localStorage.removeItem(key));
};

const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const buildId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;

const isPlaceholderName = (value: unknown) => {
  const normalized = String(value || '').trim().toLowerCase();
  return !normalized || normalized === 'unnamed product';
};

const resolveCatalogProductName = (input: Partial<Pick<SupplierCatalogProduct, 'productName' | 'description' | 'sku'>> & Partial<NormalizedCatalogProductInput>) => {
  const candidates = [
    input.productName,
    input.description,
    input.sku,
  ];

  const match = candidates
    .map((value) => String(value || '').trim())
    .find((value) => value && !isPlaceholderName(value) && value.toLowerCase() !== 'no description available.');

  return match || 'Unnamed Product';
};

const getCatalogDisplayName = (product: SupplierCatalogProduct) => {
  return resolveCatalogProductName(product);
};

const mapToSupplierResult = (product: SupplierCatalogProduct): SupplierProductResult => ({
  supplier: product.supplier,
  location: 'Supplier Portal',
  productName: getCatalogDisplayName(product),
  imageUrl: product.imageUrl,
  productId: product.id,
  category: product.category,
  description: product.description,
  sku: product.sku,
  quantity: Math.max(1, Math.min(product.stock || 1, 10)),
  price: product.price,
  discountPercent: 0,
  stock: product.stock,
  delivery: '4d',
  taxPercent: 18,
  amount: product.price,
  source: 'database',
  supplierAdapterId: `catalog-${product.supplier}`,
  supplierRecord: {
    id: slugify(product.supplier),
    name: product.supplier,
    exists: true,
    canCreate: false,
  },
  deliveryDays: 4,
  reliabilityPercent: 92,
  totalOrders: 20,
  totalSpend: product.price * Math.max(product.stock, 1),
  averageDeliveryDays: 4,
  orderHistoryFactor: 84,
});

const normalizeProduct = (
  context: SupplierCatalogContext,
  input: NormalizedCatalogProductInput,
  source: SupplierCatalogImportSource,
  sourceReference?: string,
  existing?: SupplierCatalogProduct,
): SupplierCatalogProduct => {
  const now = new Date().toISOString();
  const productName = resolveCatalogProductName(input);
  return {
    businessId: existing?.businessId || context.businessId,
    id: existing?.id || buildId('scp'),
    tenantId: existing?.tenantId || context.tenantId,
    userId: context.userId,
    supplier: String(input.supplier || 'Imported Supplier').trim() || 'Imported Supplier',
    productName,
    price: Number(input.price) || 0,
    stock: Number(input.stock) || 0,
    category: String(input.category || 'General').trim() || 'General',
    description: String(input.description || 'No description available.').trim() || 'No description available.',
    imageUrl: String(input.imageUrl || '').trim(),
    sku: String(input.sku || `${slugify(input.supplier || 'supplier')}-${slugify(productName || 'product')}`).trim(),
    source,
    sourceReference,
    syncFrequency: existing?.syncFrequency || 'manual',
    lastSyncedAt: existing?.lastSyncedAt,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
};

const sanitizeStoredProduct = (product: SupplierCatalogProduct, defaults?: Partial<SupplierCatalogIdentityDefaults>): SupplierCatalogProduct => {
  const productName = resolveCatalogProductName(product);

  return {
    ...product,
    businessId: String(product.businessId || defaults?.businessId || '').trim(),
    tenantId: String(product.tenantId || defaults?.tenantId || product.userId || '').trim(),
    userId: String(product.userId || defaults?.userId || '').trim(),
    supplier: String(product.supplier || 'Imported Supplier').trim() || 'Imported Supplier',
    productName,
    category: String(product.category || 'General').trim() || 'General',
    description: String(product.description || 'No description available.').trim() || 'No description available.',
    imageUrl: String(product.imageUrl || '').trim(),
    sku: String(product.sku || `${slugify(product.supplier || 'supplier')}-${slugify(productName || 'product')}`).trim(),
  };
};

const sanitizePriceHistory = (entry: SupplierCatalogPriceHistoryEntry, defaults?: Partial<SupplierCatalogIdentityDefaults>): SupplierCatalogPriceHistoryEntry => ({
  ...entry,
  businessId: String(entry.businessId || defaults?.businessId || '').trim(),
  tenantId: String(entry.tenantId || defaults?.tenantId || entry.userId || '').trim(),
  userId: String(entry.userId || defaults?.userId || '').trim(),
  supplierId: String(entry.supplierId || '').trim(),
  oldPrice: Number(entry.oldPrice) || 0,
  newPrice: Number(entry.newPrice) || 0,
  changeDate: String(entry.changeDate || new Date().toISOString()),
});

const sanitizeSchedule = (schedule: SupplierCatalogSyncSchedule, defaults?: Partial<SupplierCatalogIdentityDefaults>): SupplierCatalogSyncSchedule => ({
  ...schedule,
  businessId: String(schedule.businessId || defaults?.businessId || '').trim(),
  tenantId: String(schedule.tenantId || defaults?.tenantId || schedule.userId || '').trim(),
  userId: String(schedule.userId || defaults?.userId || '').trim(),
  supplier: String(schedule.supplier || '').trim(),
  sourceReference: String(schedule.sourceReference || '').trim(),
  createdAt: String(schedule.createdAt || new Date().toISOString()),
  updatedAt: String(schedule.updatedAt || new Date().toISOString()),
});

const normalizeSupplierIntelligenceProduct = (product: SupplierProductResult): NormalizedCatalogProductInput => ({
  productName: String(product.productName || 'Unnamed Product').trim() || 'Unnamed Product',
  price: Number(product.price) || 0,
  stock: Number(product.stock) || 0,
  category: String(product.category || 'General').trim() || 'General',
  description: String(product.description || 'No description available.').trim() || 'No description available.',
  supplier: String(product.supplier || 'Imported Supplier').trim() || 'Imported Supplier',
  imageUrl: String(product.imageUrl || '').trim(),
  sku: String(product.sku || '').trim(),
});

const getCurrentUserId = async () => {
  const { data } = await supabase.auth.getUser();
  return data.user?.id || null;
};

const resolveContext = async (userId?: string): Promise<SupplierCatalogContext | null> => {
  const resolvedUserId = String(userId || await getCurrentUserId() || '').trim();
  if (!resolvedUserId) return null;
  const tenantId = String(await resolveTenantId(resolvedUserId) || resolvedUserId).trim();
  if (!tenantId) return null;
  // business_id is for grouping — RLS is enforced via tenant_id
  const businessId = String(await resolveBusinessId(resolvedUserId) || tenantId).trim();
  return {
    businessId,
    userId: resolvedUserId,
    tenantId,
  };
};

const isMissingRelationError = (error: any) => {
  const message = String(error?.message || '').toLowerCase();
  return error?.code === '42P01'
    || error?.status === 404
    || message.includes('does not exist')
    || message.includes('relation')
    || message.includes('schema cache');
};

const getMissingTablesStore = () => {
  const scope = globalThis as typeof globalThis & {
    __sbnMissingSupplierCatalogTables?: Record<string, boolean>;
  };
  if (!scope.__sbnMissingSupplierCatalogTables) {
    scope.__sbnMissingSupplierCatalogTables = {};
  }
  return scope.__sbnMissingSupplierCatalogTables;
};

const isTableMarkedMissing = (tableName: string) => {
  return Boolean(getMissingTablesStore()[tableName]);
};

const markTableMissing = (tableName: string) => {
  getMissingTablesStore()[tableName] = true;
};

const sortByDateDesc = <T,>(items: T[], getValue: (item: T) => string | undefined) => {
  return [...items].sort((a, b) => {
    const left = new Date(getValue(a) || 0).getTime();
    const right = new Date(getValue(b) || 0).getTime();
    return right - left;
  });
};

const mapProductRow = (row: any): SupplierCatalogProduct => sanitizeStoredProduct({
  id: String(row?.id || ''),
  businessId: String(row?.business_id || ''),
  tenantId: String(row?.tenant_id || ''),
  userId: String(row?.user_id || ''),
  supplier: String(row?.supplier || ''),
  productName: String(row?.product_name || ''),
  price: Number(row?.price) || 0,
  stock: Number(row?.stock) || 0,
  category: String(row?.category || ''),
  description: String(row?.description || ''),
  imageUrl: String(row?.image_url || ''),
  sku: String(row?.sku || ''),
  source: String(row?.source || 'manual') as SupplierCatalogImportSource,
  sourceReference: row?.source_reference ? String(row.source_reference) : undefined,
  syncFrequency: row?.sync_frequency ? String(row.sync_frequency) as SupplierCatalogSyncFrequency : undefined,
  lastSyncedAt: row?.last_synced_at ? String(row.last_synced_at) : undefined,
  createdAt: String(row?.created_at || new Date().toISOString()),
  updatedAt: String(row?.updated_at || new Date().toISOString()),
});

const mapHistoryRow = (row: any): SupplierCatalogPriceHistoryEntry => sanitizePriceHistory({
  id: String(row?.id || ''),
  businessId: String(row?.business_id || ''),
  tenantId: String(row?.tenant_id || ''),
  userId: String(row?.user_id || ''),
  productId: String(row?.product_id || ''),
  supplierId: String(row?.supplier_id || ''),
  oldPrice: Number(row?.old_price) || 0,
  newPrice: Number(row?.new_price) || 0,
  changeDate: String(row?.change_date || new Date().toISOString()),
});

const mapScheduleRow = (row: any): SupplierCatalogSyncSchedule => sanitizeSchedule({
  id: String(row?.id || ''),
  businessId: String(row?.business_id || ''),
  tenantId: String(row?.tenant_id || ''),
  userId: String(row?.user_id || ''),
  supplier: String(row?.supplier || ''),
  frequency: String(row?.frequency || 'manual') as SupplierCatalogSyncFrequency,
  source: String(row?.source || 'csv') as SupplierCatalogImportSource | 'api',
  sourceReference: String(row?.source_reference || ''),
  lastRunAt: row?.last_run_at ? String(row.last_run_at) : undefined,
  createdAt: String(row?.created_at || new Date().toISOString()),
  updatedAt: String(row?.updated_at || new Date().toISOString()),
});

const toProductRow = (product: SupplierCatalogProduct) => ({
  id: product.id,
  business_id: product.businessId,
  tenant_id: product.tenantId,
  user_id: product.userId,
  supplier: product.supplier,
  product_name: product.productName,
  price: product.price,
  stock: product.stock,
  category: product.category,
  description: product.description,
  image_url: product.imageUrl,
  sku: product.sku,
  source: product.source,
  source_reference: product.sourceReference ?? null,
  sync_frequency: product.syncFrequency ?? 'manual',
  last_synced_at: product.lastSyncedAt ?? null,
  created_at: product.createdAt,
  updated_at: product.updatedAt,
});

const toHistoryRow = (entry: SupplierCatalogPriceHistoryEntry) => ({
  id: entry.id,
  business_id: entry.businessId,
  tenant_id: entry.tenantId,
  user_id: entry.userId,
  product_id: entry.productId,
  supplier_id: entry.supplierId,
  old_price: entry.oldPrice,
  new_price: entry.newPrice,
  change_date: entry.changeDate,
});

const toScheduleRow = (schedule: SupplierCatalogSyncSchedule) => ({
  id: schedule.id,
  business_id: schedule.businessId,
  tenant_id: schedule.tenantId,
  user_id: schedule.userId,
  supplier: schedule.supplier,
  frequency: schedule.frequency,
  source: schedule.source,
  source_reference: schedule.sourceReference,
  last_run_at: schedule.lastRunAt ?? null,
  created_at: schedule.createdAt,
  updated_at: schedule.updatedAt,
});

const extractApiProducts = (payload: any): any[] => {
  if (Array.isArray(payload)) {
    return payload;
  }

  const candidates = [
    payload?.products,
    payload?.items,
    payload?.data,
    payload?.results,
    payload?.catalog,
    payload?.catalogs,
    payload?.inventory,
    payload?.entries,
    payload?.rows,
  ];

  const match = candidates.find((value) => Array.isArray(value));
  return Array.isArray(match) ? match : [];
};

const normalizeApiCatalogProduct = (supplier: string, product: any): NormalizedCatalogProductInput => ({
  productName: String(
    product?.productName
    || product?.name
    || product?.title
    || product?.label
    || product?.product
    || product?.description
    || product?.sku
    || product?.id
    || ''
  ).trim(),
  price: Number(
    product?.price
    ?? product?.unit_price
    ?? product?.unitPrice
    ?? product?.cost
    ?? product?.sale_price
    ?? product?.salePrice
    ?? product?.amount
    ?? 0
  ) || 0,
  stock: Number(
    product?.stock
    ?? product?.quantity
    ?? product?.qty
    ?? product?.inventory
    ?? product?.available
    ?? 0
  ) || 0,
  category: String(
    product?.category
    || product?.type
    || product?.segment
    || 'General'
  ).trim() || 'General',
  description: String(
    product?.description
    || product?.details
    || product?.detail
    || ''
  ).trim(),
  supplier: String(
    product?.supplier
    || product?.vendor
    || supplier
    || 'Imported Supplier'
  ).trim() || 'Imported Supplier',
  imageUrl: String(
    product?.imageUrl
    || product?.image_url
    || product?.image
    || product?.thumbnail
    || product?.photo
    || ''
  ).trim(),
  sku: String(
    product?.sku
    || product?.productId
    || product?.product_id
    || product?.id
    || ''
  ).trim(),
});

const isValidApiCatalogProduct = (product: NormalizedCatalogProductInput) => {
  return Boolean(
    String(product.productName || '').trim()
    && String(product.supplier || '').trim()
  );
};

const isRlsViolation = (error: any) => {
  return error?.code === '42501' || error?.status === 403 || String(error?.message || '').includes('row-level security');
};

const readProductsFromDb = async (context: SupplierCatalogContext) => {
  if (isTableMarkedMissing(PRODUCTS_TABLE)) {
    throw { status: 404, message: `${PRODUCTS_TABLE} unavailable` };
  }
  const { data, error } = await supabase
    .from(PRODUCTS_TABLE)
    .select('*')
    .eq('tenant_id', context.tenantId);

  if (error) {
    if (isMissingRelationError(error)) {
      markTableMissing(PRODUCTS_TABLE);
    }
    throw error;
  }
  return sortByDateDesc((data || []).map(mapProductRow), (item) => item.updatedAt);
};

const readHistoryFromDb = async (context: SupplierCatalogContext) => {
  if (isTableMarkedMissing(PRICE_HISTORY_TABLE)) {
    throw { status: 404, message: `${PRICE_HISTORY_TABLE} unavailable` };
  }
  const { data, error } = await supabase
    .from(PRICE_HISTORY_TABLE)
    .select('*')
    .eq('tenant_id', context.tenantId);

  if (error) {
    if (isMissingRelationError(error)) {
      markTableMissing(PRICE_HISTORY_TABLE);
    }
    throw error;
  }
  return sortByDateDesc((data || []).map(mapHistoryRow), (item) => item.changeDate);
};

const readSchedulesFromDb = async (context: SupplierCatalogContext) => {
  if (isTableMarkedMissing(SCHEDULES_TABLE)) {
    throw { status: 404, message: `${SCHEDULES_TABLE} unavailable` };
  }
  const { data, error } = await supabase
    .from(SCHEDULES_TABLE)
    .select('*')
    .eq('tenant_id', context.tenantId);

  if (error) {
    if (isMissingRelationError(error)) {
      markTableMissing(SCHEDULES_TABLE);
    }
    throw error;
  }
  return sortByDateDesc((data || []).map(mapScheduleRow), (item) => item.createdAt);
};

const getProductsByContext = async (context: SupplierCatalogContext) => {
  try {
    const rows = await readProductsFromDb(context);
    return rows.map((item) => sanitizeStoredProduct(item, context));
  } catch (error) {
    if (!isMissingRelationError(error) && !isRlsViolation(error)) {
      throw error;
    }
    clearCollectionKeys(PRODUCTS_KEY, context.userId);
    return [] as SupplierCatalogProduct[];
  }
};

const getPriceHistoryByContext = async (context: SupplierCatalogContext) => {
  try {
    const rows = await readHistoryFromDb(context);
    return rows.map((item) => sanitizePriceHistory(item, context));
  } catch (error) {
    if (!isMissingRelationError(error) && !isRlsViolation(error)) {
      throw error;
    }
    clearCollectionKeys(PRICE_HISTORY_KEY, context.userId);
    return [] as SupplierCatalogPriceHistoryEntry[];
  }
};

const getSchedulesByContext = async (context: SupplierCatalogContext) => {
  try {
    const rows = await readSchedulesFromDb(context);
    return rows.map((item) => sanitizeSchedule(item, context));
  } catch (error) {
    if (!isMissingRelationError(error) && !isRlsViolation(error)) {
      throw error;
    }
    clearCollectionKeys(SCHEDULES_KEY, context.userId);
    return [] as SupplierCatalogSyncSchedule[];
  }
};

const persistProducts = async (context: SupplierCatalogContext, products: SupplierCatalogProduct[]) => {
  if (isTableMarkedMissing(PRODUCTS_TABLE)) {
    throw new Error(`${PRODUCTS_TABLE} unavailable`);
  }
  try {
    const { error } = await supabase.from(PRODUCTS_TABLE).upsert(products.map(toProductRow), { onConflict: 'id' });
    if (error) throw error;
  } catch (error) {
    if (isMissingRelationError(error)) {
      markTableMissing(PRODUCTS_TABLE);
    }
    clearCollectionKeys(PRODUCTS_KEY, context.userId);
    throw error;
  }
};

const persistHistory = async (context: SupplierCatalogContext, entries: SupplierCatalogPriceHistoryEntry[]) => {
  if (isTableMarkedMissing(PRICE_HISTORY_TABLE)) {
    throw new Error(`${PRICE_HISTORY_TABLE} unavailable`);
  }
  try {
    const { error } = await supabase.from(PRICE_HISTORY_TABLE).upsert(entries.map(toHistoryRow), { onConflict: 'id' });
    if (error) throw error;
  } catch (error) {
    if (isMissingRelationError(error)) {
      markTableMissing(PRICE_HISTORY_TABLE);
    }
    clearCollectionKeys(PRICE_HISTORY_KEY, context.userId);
    throw error;
  }
};

const persistSchedules = async (context: SupplierCatalogContext, entries: SupplierCatalogSyncSchedule[]) => {
  if (isTableMarkedMissing(SCHEDULES_TABLE)) {
    throw new Error(`${SCHEDULES_TABLE} unavailable`);
  }
  try {
    const { error } = await supabase.from(SCHEDULES_TABLE).upsert(entries.map(toScheduleRow), { onConflict: 'id' });
    if (error) throw error;
  } catch (error) {
    if (isMissingRelationError(error)) {
      markTableMissing(SCHEDULES_TABLE);
    }
    clearCollectionKeys(SCHEDULES_KEY, context.userId);
    throw error;
  }
};

export const supplierCatalogService = {
  async getProducts(userId?: string) {
    const context = await resolveContext(userId);
    if (!context) return [] as SupplierCatalogProduct[];
    return getProductsByContext(context);
  },

  async saveImportedProducts(
    userId: string,
    products: NormalizedCatalogProductInput[],
    source: SupplierCatalogImportSource,
    sourceReference?: string,
  ) {
    const context = await resolveContext(userId);
    if (!context) return [] as SupplierCatalogProduct[];

    const existing = await getProductsByContext(context);
    const priceHistory = await getPriceHistoryByContext(context);
    const now = new Date().toISOString();

    const nextProducts = [...existing];
    const nextHistory = [...priceHistory];

    products.forEach((product) => {
      const matchIndex = nextProducts.findIndex((item) => (
        item.businessId === context.businessId
        && item.supplier.toLowerCase() === String(product.supplier || '').toLowerCase()
        && item.sku.toLowerCase() === String(product.sku || '').toLowerCase()
      ));

      if (matchIndex >= 0) {
        const previous = nextProducts[matchIndex];
        const normalized = normalizeProduct(context, product, source, sourceReference, previous);
        nextProducts[matchIndex] = normalized;

        if ((previous.price || 0) !== normalized.price) {
          nextHistory.unshift({
            id: buildId('sph'),
            businessId: context.businessId,
            tenantId: context.tenantId,
            userId: context.userId,
            productId: normalized.id,
            supplierId: slugify(normalized.supplier),
            oldPrice: previous.price || 0,
            newPrice: normalized.price || 0,
            changeDate: now,
          });
        }
        return;
      }

      nextProducts.unshift(normalizeProduct(context, product, source, sourceReference));
    });

    await persistProducts(context, nextProducts);
    await persistHistory(context, nextHistory);
    return nextProducts;
  },

  async syncSupplierIntelligenceProducts(
    userId: string,
    products: SupplierProductResult[],
    sourceReference?: string,
  ) {
    const context = await resolveContext(userId);
    if (!context) return [] as SupplierCatalogProduct[];

    const existing = await getProductsByContext(context);
    const priceHistory = await getPriceHistoryByContext(context);
    const now = new Date().toISOString();

    const nextProducts = [...existing];
    const nextHistory = [...priceHistory];

    products.forEach((rawProduct) => {
      const product = normalizeSupplierIntelligenceProduct(rawProduct);
      const normalizedSku = String(product.sku || '').trim().toLowerCase();
      const normalizedName = String(product.productName || '').trim().toLowerCase();

      const matchIndex = nextProducts.findIndex((item) => {
        if (item.businessId !== context.businessId) return false;
        if (normalizedSku) {
          return String(item.sku || '').trim().toLowerCase() === normalizedSku;
        }
        return String(item.productName || '').trim().toLowerCase() === normalizedName;
      });

      if (matchIndex >= 0) {
        const previous = nextProducts[matchIndex];
        const normalized = normalizeProduct(context, product, 'supplier-intelligence', sourceReference, previous);
        nextProducts[matchIndex] = {
          ...normalized,
          lastSyncedAt: now,
        };

        if ((previous.price || 0) !== normalized.price) {
          nextHistory.unshift({
            id: buildId('sph'),
            businessId: context.businessId,
            tenantId: context.tenantId,
            userId: context.userId,
            productId: normalized.id,
            supplierId: slugify(normalized.supplier),
            oldPrice: previous.price || 0,
            newPrice: normalized.price || 0,
            changeDate: now,
          });
        }
        return;
      }

      nextProducts.unshift({
        ...normalizeProduct(context, product, 'supplier-intelligence', sourceReference),
        lastSyncedAt: now,
      });
    });

    await persistProducts(context, nextProducts);
    await persistHistory(context, nextHistory);
    return nextProducts;
  },

  async createManualProduct(userId: string, product: NormalizedCatalogProductInput) {
    const products = await this.saveImportedProducts(userId, [product], 'manual');
    return products[0] || null;
  },

  async updateProduct(userId: string, productId: string, updates: Partial<NormalizedCatalogProductInput & { syncFrequency: SupplierCatalogSyncFrequency }>) {
    const context = await resolveContext(userId);
    if (!context) return null;

    const existing = await getProductsByContext(context);
    const priceHistory = await getPriceHistoryByContext(context);
    const index = existing.findIndex((item) => item.businessId === context.businessId && item.id === productId);
    if (index < 0) return null;

    const current = existing[index];
    const nextBase: SupplierCatalogProduct = {
      ...current,
      tenantId: context.tenantId,
      userId: context.userId,
      supplier: String(updates.supplier ?? current.supplier),
      productName: String(updates.productName ?? current.productName),
      price: Number(updates.price ?? current.price) || 0,
      stock: Number(updates.stock ?? current.stock) || 0,
      category: String(updates.category ?? current.category),
      description: String(updates.description ?? current.description),
      imageUrl: String(updates.imageUrl ?? current.imageUrl),
      sku: String(updates.sku ?? current.sku),
      syncFrequency: updates.syncFrequency ?? current.syncFrequency,
      updatedAt: new Date().toISOString(),
    };
    const next = sanitizeStoredProduct(nextBase, context);

    existing[index] = next;
    if ((current.price || 0) !== (next.price || 0)) {
      priceHistory.unshift({
        id: buildId('sph'),
        businessId: context.businessId,
        tenantId: context.tenantId,
        userId: context.userId,
        productId: next.id,
        supplierId: slugify(next.supplier),
        oldPrice: current.price || 0,
        newPrice: next.price || 0,
        changeDate: new Date().toISOString(),
      });
      await persistHistory(context, priceHistory);
    }
    await persistProducts(context, existing);
    return next;
  },

  async deleteProduct(userId: string, productId: string) {
    const context = await resolveContext(userId);
    if (!context) return;

    try {
      const { error } = await supabase
        .from(PRODUCTS_TABLE)
        .delete()
        .eq('tenant_id', context.tenantId)
        .eq('id', productId);

      if (error) throw error;
    } catch (error) {
      if (!isMissingRelationError(error) && !isRlsViolation(error)) {
        throw error;
      }
    }

    clearCollectionKeys(PRODUCTS_KEY, context.userId);
  },

  async clearAllCatalogData(userId?: string) {
    const context = await resolveContext(userId);
    if (!context) return;

    let catalogProductsToDelete: SupplierCatalogProduct[] = [];
    try {
      catalogProductsToDelete = await getProductsByContext(context);
    } catch (err) {
      console.warn('clearAllCatalogData preload products error:', (err as any)?.message);
    }

    try {
      const inventoryItems = await inventoryService.getItems(context.userId);
      for (const product of catalogProductsToDelete) {
        const normalizedSku = String(product.sku || '').trim().toLowerCase();
        const normalizedName = String(product.productName || '').trim().toLowerCase();
        const match = (inventoryItems || []).find((item: any) => {
          const itemSku = String(item?.sku || '').trim().toLowerCase();
          const itemName = String(item?.name || '').trim().toLowerCase();
          if (normalizedSku && itemSku === normalizedSku) {
            return true;
          }
          return normalizedName && itemName === normalizedName;
        });
        if (match?.id) {
          await inventoryService.deleteItem(String(match.id));
        }
      }
    } catch (err) {
      console.warn('clearAllCatalogData inventory cleanup error:', (err as any)?.message);
    }

    // Clear localStorage (both scoped and legacy keys)
    [PRODUCTS_KEY, PRICE_HISTORY_KEY, SCHEDULES_KEY].forEach((key) => clearCollectionKeys(key, context.userId));

    // Clear DB tables (order matters: FK constraints)
    try {
      await supabase.from(PRICE_HISTORY_TABLE).delete().eq('tenant_id', context.tenantId);
      await supabase.from(SCHEDULES_TABLE).delete().eq('tenant_id', context.tenantId);
      await supabase.from(PRODUCTS_TABLE).delete().eq('tenant_id', context.tenantId);
    } catch (err) {
      console.warn('clearAllCatalogData DB cleanup error:', (err as any)?.message);
    }
  },

  async searchProducts(query: string, userId?: string) {
    const context = await resolveContext(userId);
    if (!context) return [] as SupplierProductResult[];
    const normalizedQuery = String(query || '').trim().toLowerCase();
    const products = await getProductsByContext(context);
    return products
      .filter((item) => {
        if (!normalizedQuery) return true;
        return [item.productName, item.supplier, item.category, item.description, item.sku]
          .some((value) => String(value || '').toLowerCase().includes(normalizedQuery));
      })
      .slice(0, 50)
      .map(mapToSupplierResult);
  },

  async getPriceHistory(userId?: string) {
    const context = await resolveContext(userId);
    if (!context) return [] as SupplierCatalogPriceHistoryEntry[];
    return getPriceHistoryByContext(context);
  },

  async saveSchedule(userId: string, schedule: Omit<SupplierCatalogSyncSchedule, 'id' | 'businessId' | 'tenantId' | 'userId' | 'createdAt' | 'updatedAt'>) {
    const context = await resolveContext(userId);
    if (!context) return null;

    const schedules = await getSchedulesByContext(context);
    const now = new Date().toISOString();
    const next: SupplierCatalogSyncSchedule = {
      id: buildId('scs'),
      businessId: context.businessId,
      tenantId: context.tenantId,
      userId: context.userId,
      supplier: schedule.supplier,
      frequency: schedule.frequency,
      source: schedule.source,
      sourceReference: schedule.sourceReference,
      lastRunAt: schedule.lastRunAt,
      createdAt: now,
      updatedAt: now,
    };
    schedules.unshift(next);
    await persistSchedules(context, schedules);
    return next;
  },

  async getSchedules(userId?: string) {
    const context = await resolveContext(userId);
    if (!context) return [] as SupplierCatalogSyncSchedule[];
    return getSchedulesByContext(context);
  },

  async runApiSync(userId: string, supplier: string, endpoint: string) {
    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new Error('Unable to sync supplier API.');
    }
    const payload = await response.json().catch(() => null);
    const products = extractApiProducts(payload);
    const normalized = products
      .map((product: any) => normalizeApiCatalogProduct(supplier, product))
      .filter(isValidApiCatalogProduct);

    if (normalized.length === 0) {
      throw new Error('Supplier API did not return a recognized product list.');
    }

    await this.saveImportedProducts(userId, normalized, 'api-sync', endpoint);
    return normalized;
  },
};
