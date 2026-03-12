import { supabase } from '../../lib/supabase';
import { inventoryService, resolveBusinessId, resolveTenantId, settingsService } from '../../services/database';
import { uploadProductImage } from './utils/imageStorage';
import type { SupplierContext, SupplierImportResult, SupplierProductInput, SupplierProductRow } from './types';

const SUPPLIER_PRODUCTS_TABLE = 'supplier_products';

const toSafeNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeTaxRate = (value: unknown) => {
  const numeric = toSafeNumber(value, 0);
  if (numeric <= 0) return 0;
  return numeric > 1 ? numeric / 100 : numeric;
};

const calculateSupplierAmount = (item: Pick<SupplierProductInput, 'qty' | 'price' | 'delivery' | 'tax'>) => {
  const subtotal = Math.max(toSafeNumber(item.qty, 0), 0) * Math.max(toSafeNumber(item.price, 0), 0);
  const delivery = Math.max(toSafeNumber(item.delivery, 0), 0);
  const tax = Math.max(toSafeNumber(item.tax, 0), 0);
  return subtotal + delivery + tax;
};

const calculateTaxFromRate = (item: Pick<SupplierProductInput, 'qty' | 'price'>, defaultTaxRate: unknown) => {
  const subtotal = Math.max(toSafeNumber(item.qty, 0), 0) * Math.max(toSafeNumber(item.price, 0), 0);
  const normalizedRate = normalizeTaxRate(defaultTaxRate);
  return subtotal * normalizedRate;
};

const buildSupplierFinancials = (
  item: Pick<SupplierProductInput, 'qty' | 'price' | 'delivery' | 'tax'>,
  defaultTaxRate?: unknown,
  forceDefaultTaxRate = false,
) => {
  const tax = forceDefaultTaxRate
    ? calculateTaxFromRate(item, defaultTaxRate)
    : Math.max(toSafeNumber(item.tax, calculateTaxFromRate(item, defaultTaxRate)), 0);

  return {
    tax,
    amount: calculateSupplierAmount({
      qty: item.qty,
      price: item.price,
      delivery: item.delivery,
      tax,
    }),
  };
};

const resolveImageValue = (value: unknown): string => {
  if (Array.isArray(value)) {
    for (const item of value) {
      const resolved = resolveImageValue(item);
      if (resolved) return resolved;
    }
    return '';
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return resolveImageValue(
      record.url
      ?? record.src
      ?? record.link
      ?? record.image
      ?? record.image_url
      ?? record.imageUrl
      ?? record.thumbnail
      ?? record.photo,
    );
  }

  return String(value || '').trim();
};

const normalizeProductInput = (
  item: SupplierProductInput,
  options?: { defaultTaxRate?: unknown; forceDefaultTaxRate?: boolean },
): SupplierProductInput => {
  const normalized = {
    prov: String(item.prov || '').trim(),
    location: String(item.location || '').trim(),
    product: String(item.product || '').trim(),
    id: String(item.id || '').trim(),
    category: String(item.category || 'General').trim() || 'General',
    description: String(item.description || '').trim(),
    qty: Math.max(toSafeNumber(item.qty, 0), 0),
    price: Math.max(toSafeNumber(item.price, 0), 0),
    margin_percent: toSafeNumber(item.margin_percent, 0),
    delivery: String(item.delivery || '').trim(),
    image: resolveImageValue(item.image),
    source: item.source || 'manual',
  };

  const financials = buildSupplierFinancials(
    {
      qty: normalized.qty,
      price: normalized.price,
      delivery: normalized.delivery,
      tax: item.tax,
    },
    options?.defaultTaxRate,
    options?.forceDefaultTaxRate === true,
  );

  return {
    ...normalized,
    tax: financials.tax,
    amount: financials.amount,
  };
};

const mapSupplierRow = (row: any): SupplierProductRow => ({
  db_id: String(row?.id || ''),
  business_id: String(row?.business_id || ''),
  tenant_id: String(row?.tenant_id || ''),
  prov: String(row?.prov || row?.supplier_name || ''),
  location: String(row?.location || ''),
  product: String(row?.product || row?.product_name || ''),
  id: String(row?.external_id || row?.product_id || ''),
  category: String(row?.category || ''),
  description: String(row?.description || ''),
  qty: Math.max(toSafeNumber(row?.qty ?? row?.stock, 0), 0),
  price: toSafeNumber(row?.price, 0),
  margin_percent: toSafeNumber(row?.margin_percent, 0),
  delivery: String(row?.delivery || ''),
  tax: toSafeNumber(row?.tax, 0),
  amount: toSafeNumber(row?.amount, 0),
  image: resolveImageValue(row?.image) || resolveImageValue(row?.image_url),
  source: row?.source || 'manual',
  created_at: String(row?.created_at || new Date().toISOString()),
  updated_at: String(row?.updated_at || new Date().toISOString()),
});

const resolveContext = async (explicitUserId?: string): Promise<SupplierContext> => {
  const userId = String(explicitUserId || '').trim() || String((await supabase.auth.getUser()).data.user?.id || '').trim();
  if (!userId) throw new Error('User context is required to access Supplier Intelligence.');

  const tenantId = String((await resolveTenantId(userId)) || '').trim();
  const businessId = String((await resolveBusinessId(userId)) || '').trim();

  if (!tenantId || !businessId) {
    throw new Error('Unable to resolve business context.');
  }

  return { userId, tenantId, businessId };
};

const getDefaultTaxRate = async () => {
  const companyInfo = await settingsService.getCompanyInfo();
  return Number((companyInfo as any)?.default_tax_rate);
};

const validateRequired = (context: SupplierContext, items: SupplierProductInput[]) => {
  if (!context.businessId) {
    throw new Error('business_id is required.');
  }

  for (const item of items) {
    if (!String(item.product || '').trim()) throw new Error('product is required.');
    if (!Number.isFinite(Number(item.price))) {
      throw new Error('price must be numeric.');
    }
  }
};

const syncToInventory = async (context: SupplierContext, items: SupplierProductInput[]) => {
  if (!items.length) return 0;

  const existing = await inventoryService.getItems(context.userId);
  const byNameSupplier = new Map<string, any>();

  (existing || []).forEach((row: any) => {
    const key = `${String(row?.name || '').trim().toLowerCase()}::${String(row?.supplier || '').trim().toLowerCase()}`;
    if (key !== '::') {
      byNameSupplier.set(key, row);
    }
  });

  let synced = 0;
  for (const item of items) {
    const normalized = normalizeProductInput(item);
    const key = `${normalized.product.toLowerCase()}::${normalized.prov.toLowerCase()}`;

    const payload = {
      name: normalized.product,
      sku: `${normalized.prov}-${normalized.id || normalized.product}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60),
      category: normalized.category,
      selling_price: normalized.price,
      cost_price: normalized.price,
      current_stock: normalized.qty,
      min_stock: 0,
      max_stock: Math.max(normalized.qty, 0),
      description: normalized.description,
      supplier: normalized.prov,
      image_url: normalized.image,
      is_active: true,
      preferred_supplier: normalized.prov,
      last_supplier_price: normalized.price,
      source: 'supplier-intelligence',
    };

    const existingRow = byNameSupplier.get(key);
    if (existingRow?.id) {
      await inventoryService.updateItem(context.userId, String(existingRow.id), payload);
      byNameSupplier.set(key, { ...existingRow, ...payload });
      synced += 1;
      continue;
    }

    const created = await inventoryService.createItem(context.userId, payload);
    if (created) {
      byNameSupplier.set(key, created);
      synced += 1;
    }
  }

  return synced;
};

export const supplierService = {
  async getContext(userId?: string) {
    return resolveContext(userId);
  },

  async listProducts(userId?: string) {
    const context = await resolveContext(userId);
    const defaultTaxRate = await getDefaultTaxRate();

    const { data, error } = await supabase
      .from(SUPPLIER_PRODUCTS_TABLE)
      .select('*')
      .eq('business_id', context.businessId)
      .eq('tenant_id', context.tenantId)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    return (data || [])
      .map((row) => {
        const mapped = mapSupplierRow(row);
        const financials = buildSupplierFinancials(
          {
            qty: mapped.qty,
            price: mapped.price,
            delivery: mapped.delivery,
            tax: mapped.tax,
          },
          defaultTaxRate,
          Number.isFinite(defaultTaxRate) && defaultTaxRate >= 0,
        );

        return {
          ...mapped,
          tax: financials.tax,
          amount: financials.amount,
        };
      })
      .filter((row) => row.business_id === context.businessId);
  },

  async importProducts(rawItems: SupplierProductInput[], source: SupplierProductInput['source'] = 'manual', userId?: string): Promise<SupplierImportResult> {
    const context = await resolveContext(userId);
    const defaultTaxRate = await getDefaultTaxRate();
    const items = rawItems.map((item) => normalizeProductInput(
      { ...item, source: source || item.source || 'manual' },
      { defaultTaxRate, forceDefaultTaxRate: Number.isFinite(defaultTaxRate) && defaultTaxRate >= 0 },
    ));
    validateRequired(context, items);

    const existing = await this.listProducts(context.userId);
    const byNameSupplier = new Map<string, SupplierProductRow>();

    existing.forEach((row) => {
      const key = `${row.product.trim().toLowerCase()}::${row.prov.trim().toLowerCase()}`;
      byNameSupplier.set(key, row);
    });

    let processed = 0;
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let syncedToInventory = 0;

    for (const rawItem of items) {
      processed += 1;
      try {
        const item = normalizeProductInput(rawItem, {
          defaultTaxRate,
          forceDefaultTaxRate: Number.isFinite(defaultTaxRate) && defaultTaxRate >= 0,
        });
        validateRequired(context, [item]);
        const key = `${item.product.toLowerCase()}::${item.prov.toLowerCase()}`;
        const match = byNameSupplier.get(key);
        const now = new Date().toISOString();
        const uploadedImageUrl = item.image
          ? await uploadProductImage(item.image, context.businessId, item.id || key.replace(/[^a-z0-9]+/g, '-')).catch(() => '')
          : '';
        const imageUrl = item.image || uploadedImageUrl || '';

        const payload = match
          ? {
              id: match.db_id,
              business_id: context.businessId,
              tenant_id: context.tenantId,
              prov: item.prov,
              location: item.location,
              product: item.product,
              external_id: item.id,
              product_name: item.product,
              supplier_name: item.prov,
              category: item.category,
              description: item.description,
              qty: item.qty,
              stock: item.qty,
              price: item.price,
              margin_percent: item.margin_percent,
              delivery: item.delivery,
              tax: item.tax,
              amount: item.amount,
              image: imageUrl,
              image_url: imageUrl,
              source: item.source || source || 'manual',
              created_at: match.created_at,
              updated_at: now,
            }
          : {
              business_id: context.businessId,
              tenant_id: context.tenantId,
              prov: item.prov,
              location: item.location,
              product: item.product,
              external_id: item.id,
              product_name: item.product,
              supplier_name: item.prov,
              category: item.category,
              description: item.description,
              qty: item.qty,
              stock: item.qty,
              price: item.price,
              margin_percent: item.margin_percent,
              delivery: item.delivery,
              tax: item.tax,
              amount: item.amount,
              image: imageUrl,
              image_url: imageUrl,
              source: item.source || source || 'manual',
            };

        const { data, error } = await supabase
          .from(SUPPLIER_PRODUCTS_TABLE)
          .upsert(payload, { onConflict: 'business_id,supplier_name,product_name' })
          .select('*')
          .single();

        if (error) throw error;

        if (match) {
          updated += 1;
        } else {
          created += 1;
        }

        try {
          const synced = await syncToInventory(context, [{ ...item, image: imageUrl }]);
          syncedToInventory += synced;
        } catch {
        }

        if (data) {
          const mapped = mapSupplierRow(data);
          byNameSupplier.set(key, mapped);
        }
      } catch {
        skipped += 1;
      }
    }

    const products = await this.listProducts(context.userId);

    return {
      processed,
      created,
      updated,
      imported: created + updated,
      skipped,
      syncedToInventory,
      products,
    };
  },

  async createManualProduct(item: SupplierProductInput, userId?: string) {
    const result = await this.importProducts([item], 'manual', userId);
    return result.products[0] || null;
  },

  async updateProduct(productId: string, updates: SupplierProductInput, userId?: string) {
    const context = await resolveContext(userId);
    const defaultTaxRate = await getDefaultTaxRate();
    const existing = await this.listProducts(context.userId);
    const match = existing.find((row) => row.db_id === productId && row.business_id === context.businessId);
    if (!match) {
      throw new Error('Supplier product not found.');
    }

    const item = normalizeProductInput(updates, {
      defaultTaxRate,
      forceDefaultTaxRate: false,
    });
    validateRequired(context, [item]);

    const key = `${item.product.toLowerCase()}::${item.prov.toLowerCase()}`;
    const shouldUploadImage = Boolean(item.image) && !/^https?:\/\//i.test(item.image) && !item.image.startsWith('data:image/svg+xml');
    const uploadedImageUrl = shouldUploadImage
      ? await uploadProductImage(item.image, context.businessId, item.id || key.replace(/[^a-z0-9]+/g, '-')).catch(() => '')
      : '';
    const imageUrl = uploadedImageUrl || item.image || match.image || '';
    const now = new Date().toISOString();

    const payload = {
      prov: item.prov,
      location: item.location,
      product: item.product,
      external_id: item.id,
      product_name: item.product,
      supplier_name: item.prov,
      category: item.category,
      description: item.description,
      qty: item.qty,
      stock: item.qty,
      price: item.price,
      margin_percent: item.margin_percent,
      delivery: item.delivery,
      tax: item.tax,
      amount: item.amount,
      image: imageUrl,
      image_url: imageUrl,
      source: item.source || match.source || 'manual',
      created_at: match.created_at,
      updated_at: now,
    };

    const { data, error } = await supabase
      .from(SUPPLIER_PRODUCTS_TABLE)
      .update(payload)
      .eq('id', match.db_id)
      .eq('business_id', context.businessId)
      .eq('tenant_id', context.tenantId)
      .select('*')
      .single();

    if (error) throw error;

    try {
      await syncToInventory(context, [{ ...item, image: imageUrl }]);
    } catch {
    }

    return data ? mapSupplierRow(data) : null;
  },

  async syncDefaultTaxRate(defaultTaxRate: number, userId?: string) {
    const context = await resolveContext(userId);
    const products = await this.listProducts(context.userId);
    const normalizedRate = normalizeTaxRate(defaultTaxRate);

    for (const product of products) {
      const subtotal = Math.max(toSafeNumber(product.qty, 0), 0) * Math.max(toSafeNumber(product.price, 0), 0);
      const deliveryValue = Math.max(toSafeNumber(product.delivery, 0), 0);
      const taxAmount = subtotal * normalizedRate;
      const amount = subtotal + deliveryValue + taxAmount;

      const payload = {
        tax: taxAmount,
        amount,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from(SUPPLIER_PRODUCTS_TABLE)
        .update(payload)
        .eq('id', product.db_id)
        .eq('business_id', context.businessId)
        .eq('tenant_id', context.tenantId);

      if (error) throw error;
    }

    return this.listProducts(context.userId);
  },

  async deleteProduct(productId: string, userId?: string) {
    const context = await resolveContext(userId);

    const { error } = await supabase
      .from(SUPPLIER_PRODUCTS_TABLE)
      .delete()
      .eq('id', productId)
      .eq('business_id', context.businessId)
      .eq('tenant_id', context.tenantId);

    if (error) throw error;
  },
};
