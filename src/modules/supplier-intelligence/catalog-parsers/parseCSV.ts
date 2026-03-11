import Papa from 'papaparse';

export type CatalogParserProduct = {
  id: string;
  product_name: string;
  description: string;
  category: string;
  supplier: string;
  price: number;
  stock: number;
  image_url: string;
  source: 'supplier_catalog';
};

const normalizeText = (value: unknown, fallback = '') => String(value ?? fallback).trim();

const normalizeKey = (value: string) => value
  .replace(/^\uFEFF/, '')
  .toLowerCase()
  .trim()
  .replace(/[_\-.]+/g, ' ')
  .replace(/\s+/g, ' ');

const normalizeNumber = (value: unknown, fallback = 0) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const cleaned = String(value ?? '').replace(/[$,\s]/g, '').trim();
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const buildId = (row: Record<string, unknown>, index: number) => {
  const base = [row.product_name, row.supplier, row.category, row.product_name || row.name]
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .join('-');
  return `supplier-catalog-${slugify(base || `product-${index + 1}`)}-${index + 1}`;
};

const getField = (row: Record<string, unknown>, keys: string[]) => {
  const normalizedKeys = Object.keys(row).reduce<Record<string, unknown>>((acc, key) => {
    acc[normalizeKey(key)] = row[key];
    return acc;
  }, {});

  for (const key of keys) {
    const value = normalizedKeys[normalizeKey(key)];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }

  return undefined;
};

const getImageUrl = (row: Record<string, unknown>) => {
  const directImage = getField(row, ['image_url', 'image url', 'image', 'thumbnail', 'thumbnail_url', 'photo', 'photo_url', 'img', 'picture']);
  if (directImage) {
    return normalizeText(directImage);
  }

  const firstUrlField = Object.entries(row).find(([key, value]) => {
    const normalizedKey = key.toLowerCase().trim();
    if (!normalizedKey.includes('image') && !normalizedKey.includes('photo') && !normalizedKey.includes('thumb') && !normalizedKey.includes('img') && !normalizedKey.includes('picture')) {
      return false;
    }
    return /^https?:\/\//i.test(String(value ?? '').trim());
  });

  return normalizeText(firstUrlField?.[1], '');
};

export const mapRawCatalogProduct = (row: Record<string, unknown>, index: number): CatalogParserProduct => {
  const productName = normalizeText(getField(row, [
    'product_name',
    'product name',
    'product',
    'products',
    'name',
    'title',
    'producto',
    'item',
    'item name',
    'nombre',
    'product description',
    'product title',
    'producto',
    'descripcion producto',
  ]), 'Unnamed Product');
  const supplier = normalizeText(getField(row, ['supplier', 'vendor', 'provider', 'prov', 'supplier name', 'proveedor', 'brand', 'manufacturer']), 'Imported Supplier');
  const category = normalizeText(getField(row, ['category', 'type', 'segment', 'department', 'familia', 'linea']), 'General');
  const description = normalizeText(getField(row, ['description', 'details', 'detail', 'specification', 'specifications', 'desc', 'descripcion']), '');
  const imageUrl = getImageUrl(row);
  const price = normalizeNumber(getField(row, ['price', 'unit price', 'cost', 'amount', 'selling price', 'precio', 'valor', 'importe', 'unit cost']), 0);
  const stock = normalizeNumber(getField(row, ['stock', 'qty', 'quantity', 'inventory', 'available qty', 'existence', 'cantidad', 'cant', 'available', 'qty available']), 0);
  const explicitId = normalizeText(getField(row, ['id', 'product id', 'item id', 'sku', 'code', 'codigo', 'item code', 'product code']), '');

  return {
    id: explicitId || buildId({
      ...row,
      product_name: productName,
      supplier,
      category,
    }, index),
    product_name: productName,
    description,
    category,
    supplier,
    price,
    stock,
    image_url: imageUrl,
    source: 'supplier_catalog',
  };
};

export const isValidCatalogProduct = (product: CatalogParserProduct) => {
  return Boolean(String(product.product_name || '').trim() && String(product.supplier || '').trim());
};

export async function parseCSV(file: File): Promise<CatalogParserProduct[]> {
  const raw = await file.text();

  return new Promise((resolve, reject) => {
    Papa.parse(raw, {
      header: true,
      skipEmptyLines: true,
      complete: (results: any) => {
        const products = ((results.data || []) as Record<string, unknown>[])
          .map((row: Record<string, unknown>, index: number) => mapRawCatalogProduct(row, index))
          .filter(isValidCatalogProduct);

        if (!products.length) {
          reject(new Error('Catalog format not recognized. Please use the correct template.'));
          return;
        }

        resolve(products);
      },
      error: () => reject(new Error('Catalog format not recognized. Please use the correct template.')),
    });
  });
}
