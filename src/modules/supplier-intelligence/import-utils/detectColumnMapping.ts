const normalizeKey = (value: string) => String(value || '').toLowerCase().replace(/^\ufeff/, '').replace(/[\s_\-.]+/g, '').trim();

type InternalField =
  | 'prov'
  | 'location'
  | 'product'
  | 'id'
  | 'category'
  | 'description'
  | 'qty'
  | 'price'
  | 'margin_percent'
  | 'delivery'
  | 'tax'
  | 'amount'
  | 'image';

export type ColumnMapping = Partial<Record<InternalField, string>>;

const COLUMN_ALIASES: Record<InternalField, string[]> = {
  prov: ['prov', 'supplier', 'vendor', 'brand', 'manufacturer', 'provider', 'suppliername'],
  location: ['location', 'warehouse', 'branch', 'origin', 'city', 'country'],
  product: ['product', 'name', 'title', 'item', 'productname', 'product_name'],
  id: ['id', 'productid', 'product_id', 'sku', 'itemid', 'code'],
  category: ['category', 'type', 'group'],
  description: ['description', 'details', 'info', 'detail', 'desc'],
  qty: ['qty', 'stock', 'inventory', 'quantity'],
  price: ['price', 'cost', 'unitprice', 'unit_price', 'value'],
  margin_percent: ['%', 'margin', 'markup', 'markup%'],
  delivery: ['delivery', 'shipping'],
  tax: ['tax', 'vat'],
  amount: ['amount', 'total', 'subtotal'],
  image: ['image', 'img', 'imageurl', 'image_url', 'thumbnail', 'photo', 'images', 'images0', 'images[0]'],
};

export function detectColumnMapping(row: Record<string, unknown>): ColumnMapping {
  const keys = Object.keys(row || {});
  const normalizedKeys = new Map(keys.map((key) => [normalizeKey(key), key]));
  const mapping: ColumnMapping = {};

  (Object.keys(COLUMN_ALIASES) as InternalField[]).forEach((field) => {
    for (const alias of COLUMN_ALIASES[field]) {
      const match = normalizedKeys.get(normalizeKey(alias));
      if (match) {
        mapping[field] = match;
        break;
      }
    }
  });

  return mapping;
}
