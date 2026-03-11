type ImportedRow = Record<string, unknown>;

export type NormalizedProductRow = {
  image: string;
  supplier: string;
  product: string;
  category: string;
  price: number;
  stock: number;
  margin: number;
  status: string;
};

const normalizeKey = (value: string) => String(value || '').toLowerCase().replace(/^\ufeff/, '').replace(/[\s_\-.]+/g, '').trim();
const asText = (value: unknown, fallback = '') => String(value ?? fallback).trim();
const asNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(String(value ?? '').replace(/[$,%\s,]/g, ''));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const FIELD_ALIASES = {
  image: ['image', 'img', 'thumbnail', 'photo', 'picture', 'image_url', 'imageurl', 'images', 'images[0]', 'images0'],
  supplier: ['supplier', 'vendor', 'brand', 'manufacturer', 'prov'],
  product: ['product', 'name', 'title', 'item', 'product_name', 'productname'],
  category: ['category', 'type', 'group'],
  price: ['price', 'cost', 'unit_price', 'unitprice', 'value'],
  stock: ['stock', 'qty', 'quantity', 'inventory'],
  margin: ['margin', 'markup', 'profit_margin', 'profitmargin'],
  status: ['status', 'availability', 'state'],
} as const;

const getField = (row: ImportedRow, aliases: readonly string[]) => {
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

export function normalizeProductRow(row: ImportedRow): NormalizedProductRow {
  const imageValue = getField(row, FIELD_ALIASES.image);
  return {
    image: Array.isArray(imageValue) ? asText(imageValue[0], '') : asText(imageValue, ''),
    supplier: asText(getField(row, FIELD_ALIASES.supplier), 'Imported Supplier'),
    product: asText(getField(row, FIELD_ALIASES.product), ''),
    category: asText(getField(row, FIELD_ALIASES.category), 'General'),
    price: asNumber(getField(row, FIELD_ALIASES.price), NaN),
    stock: Math.max(asNumber(getField(row, FIELD_ALIASES.stock), 0), 0),
    margin: asNumber(getField(row, FIELD_ALIASES.margin), 0),
    status: asText(getField(row, FIELD_ALIASES.status), 'active') || 'active',
  };
}
