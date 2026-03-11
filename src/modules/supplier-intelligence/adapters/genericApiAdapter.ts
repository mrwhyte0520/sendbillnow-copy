import type { SupplierProductInput } from '../types';
import { detectCatalogArray } from '../import-utils/detectCatalogArray';
import { normalizeCatalogRow } from '../import-utils/normalizeCatalogRow';

type UnknownRow = Record<string, unknown>;

export const collectApiProductRows = (payload: unknown): UnknownRow[] => {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is UnknownRow => Boolean(item) && typeof item === 'object');
  }

  const record = (payload && typeof payload === 'object') ? payload as Record<string, unknown> : null;
  if (!record) {
    return [];
  }

  const candidates = [
    record.products,
    record.items,
    record.data,
    record.results,
    record.catalog,
    record.catalogs,
    record.inventory,
    record.entries,
    record.rows,
  ];

  const directMatch = candidates.find((value) => Array.isArray(value));
  if (Array.isArray(directMatch)) {
    return directMatch.filter((item): item is UnknownRow => Boolean(item) && typeof item === 'object');
  }

  return detectCatalogArray(payload);
};

const normalizeApiFieldProduct = (row: UnknownRow): Partial<SupplierProductInput> => ({
  prov: String(
    row.supplier
    ?? row.vendor
    ?? row.prov
    ?? 'Imported Supplier',
  ).trim() || 'Imported Supplier',
  location: '',
  product: String(
    row.productName
    ?? row.name
    ?? row.title
    ?? row.label
    ?? row.product
    ?? row.description
    ?? row.sku
    ?? row.id
    ?? '',
  ).trim(),
  id: String(
    row.sku
    ?? row.productId
    ?? row.product_id
    ?? row.id
    ?? '',
  ).trim(),
  category: String(
    row.category
    ?? row.type
    ?? row.segment
    ?? 'General',
  ).trim() || 'General',
  description: String(
    row.description
    ?? row.details
    ?? row.detail
    ?? '',
  ).trim(),
  qty: Number(
    row.stock
    ?? row.quantity
    ?? row.qty
    ?? row.inventory
    ?? row.available
    ?? 0,
  ) || 0,
  price: Number(
    row.price
    ?? row.unit_price
    ?? row.unitPrice
    ?? row.cost
    ?? row.sale_price
    ?? row.salePrice
    ?? row.amount
    ?? 0,
  ) || 0,
  margin_percent: 0,
  delivery: '',
  tax: 0,
  amount: 0,
  image: String(
    row.imageUrl
    ?? row.image_url
    ?? row.image
    ?? row.thumbnail
    ?? row.photo
    ?? '',
  ).trim(),
  source: 'api',
});

export const adaptGenericApiProducts = (payload: unknown): Partial<SupplierProductInput>[] => {
  return collectApiProductRows(payload).map((row) => {
    const exactLegacyMatch = normalizeApiFieldProduct(row);
    if (String(exactLegacyMatch.image || '').trim()) {
      return exactLegacyMatch;
    }
    return normalizeCatalogRow(row, 'api');
  });
};
