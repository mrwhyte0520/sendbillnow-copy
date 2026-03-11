import type { SupplierImportSource, SupplierProductInput } from '../types';

type SupplierRow = Record<string, unknown>;

export type NormalizedSupplierProduct = {
  prov: string;
  location: string;
  product: string;
  id: string;
  category: string;
  description: string;
  qty: number;
  price: number;
  margin: number;
  delivery: number;
  tax: number;
  amount: number;
  image: string;
};

const normalizeKey = (value: string) => String(value || '').toLowerCase().replace(/^\ufeff/, '').replace(/[\s_\-.]+/g, '').trim();
const asText = (value: unknown, fallback = '') => String(value ?? fallback).trim();
const asNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(String(value ?? '').replace(/[$,%\s,]/g, ''));
  return Number.isFinite(parsed) ? parsed : fallback;
};
const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const extractImageValue = (value: unknown): string => {
  if (Array.isArray(value)) {
    for (const item of value) {
      const resolved = extractImageValue(item);
      if (resolved) return resolved;
    }
    return '';
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const candidates = [record.url, record.src, record.link, record.image, record.thumbnail];
    for (const candidate of candidates) {
      const resolved = extractImageValue(candidate);
      if (resolved) return resolved;
    }
    return '';
  }

  return asText(value, '');
};

const extractImageFromAnyField = (row: SupplierRow): string => {
  const direct = extractImageValue(
    getField(row, FIELD_ALIASES.image)
    ?? row.images
    ?? row.thumbnail
    ?? row.image_url
    ?? row.imageUrl
    ?? row.photo
    ?? row.picture,
  );

  if (direct) {
    return direct;
  }

  for (const [key, value] of Object.entries(row || {})) {
    const normalizedKey = normalizeKey(key);
    if (
      normalizedKey.includes('image')
      || normalizedKey.includes('img')
      || normalizedKey.includes('photo')
      || normalizedKey.includes('picture')
      || normalizedKey.includes('thumb')
    ) {
      const resolved = extractImageValue(value);
      if (resolved) {
        return resolved;
      }
    }
  }

  return '';
};

const FIELD_ALIASES = {
  prov: ['prov', 'supplier', 'vendor', 'brand', 'manufacturer'],
  location: ['location', 'warehouse', 'origin'],
  product: ['product', 'name', 'title', 'item', 'product_name', 'productname'],
  id: ['id', 'product_id', 'productid', 'sku', 'code'],
  category: ['category', 'type', 'group'],
  description: ['description', 'details', 'info', 'summary'],
  qty: ['qty', 'quantity', 'stock', 'inventory'],
  price: ['price', 'cost', 'unit_price', 'unitprice', 'value'],
  margin: ['margin', 'markup', 'profit_margin', 'profitmargin', '%'],
  delivery: ['delivery', 'shipping', 'lead_time', 'leadtime'],
  tax: ['tax', 'vat', 'tax_rate', 'taxrate'],
  amount: ['amount', 'total', 'price_total', 'pricetotal'],
  image: ['image', 'img', 'thumbnail', 'photo', 'picture', 'image_url', 'imageurl', 'images', 'images[0]', 'images0'],
} as const;

const getField = (row: SupplierRow, aliases: readonly string[]) => {
  const normalized = Object.entries(row || {}).reduce<Record<string, unknown>>((acc, [key, value]) => {
    acc[normalizeKey(key)] = value;
    return acc;
  }, {});

  for (const alias of aliases) {
    const value = normalized[normalizeKey(alias)];
    if (Array.isArray(value) && value.length > 0) {
      const first = value[0];
      if (first !== undefined && first !== null && String(first).trim() !== '') {
        return first;
      }
    }
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }

  return undefined;
};

export function hasRecognizableSupplierProductRow(row: SupplierRow) {
  return [
    getField(row, FIELD_ALIASES.product),
    getField(row, FIELD_ALIASES.price),
    getField(row, FIELD_ALIASES.prov),
    getField(row, FIELD_ALIASES.id),
    getField(row, FIELD_ALIASES.qty),
    getField(row, FIELD_ALIASES.image),
  ].some((value) => value !== undefined && value !== null && String(value).trim() !== '');
}

export function normalizeSupplierProduct(row: SupplierRow): NormalizedSupplierProduct {
  const prov = asText(getField(row, FIELD_ALIASES.prov), 'Imported Supplier');
  const explicitId = asText(getField(row, FIELD_ALIASES.id), '');
  const fallbackDescription = asText(getField(row, FIELD_ALIASES.description), '');
  const product = asText(getField(row, FIELD_ALIASES.product), '') || fallbackDescription || explicitId;
  const price = asNumber(getField(row, FIELD_ALIASES.price), 0);
  const qty = Math.max(asNumber(getField(row, FIELD_ALIASES.qty), 0), 0);
  const id = explicitId || slugify(`${prov}-${product}`) || `product-${Date.now()}`;

  return {
    prov,
    location: asText(getField(row, FIELD_ALIASES.location), ''),
    product,
    id,
    category: asText(getField(row, FIELD_ALIASES.category), 'General') || 'General',
    description: fallbackDescription,
    qty,
    price,
    margin: asNumber(getField(row, FIELD_ALIASES.margin), 0),
    delivery: Math.max(asNumber(getField(row, FIELD_ALIASES.delivery), 0), 0),
    tax: asNumber(getField(row, FIELD_ALIASES.tax), 0),
    amount: asNumber(getField(row, FIELD_ALIASES.amount), (Number.isFinite(price) ? price : 0) * qty),
    image: extractImageFromAnyField(row),
  };
}

export function toSupplierProductInput(row: SupplierRow, source: SupplierImportSource): SupplierProductInput {
  const normalized = normalizeSupplierProduct(row);

  return {
    prov: normalized.prov,
    location: normalized.location,
    product: normalized.product,
    id: normalized.id,
    category: normalized.category,
    description: normalized.description,
    qty: normalized.qty,
    price: normalized.price,
    margin_percent: normalized.margin,
    delivery: String(normalized.delivery || 0),
    tax: normalized.tax,
    amount: normalized.amount,
    image: normalized.image,
    source,
  };
}
