import type { SupplierImportSource, SupplierProductInput } from './types';
import { adaptGenericApiProducts } from './adapters/genericApiAdapter';
import { parseCSV as parseLegacyCSV, type CatalogParserProduct } from './catalog-parsers/parseCSV';
import { parseExcel as parseLegacyExcel } from './catalog-parsers/parseExcel';
import { parseJSON as parseLegacyJSON } from './catalog-parsers/parseJSON';
import { isImportableProduct } from './utils/normalizeProduct';

const mapLegacyItem = (item: CatalogParserProduct, source: SupplierImportSource): SupplierProductInput => ({
  prov: String(item.supplier || '').trim() || 'Imported Supplier',
  location: '',
  product: String(item.product_name || item.description || item.id || '').trim(),
  id: String(item.id || '').trim(),
  category: String(item.category || 'General').trim() || 'General',
  description: String(item.description || '').trim(),
  qty: Math.max(Number(item.stock) || 0, 0),
  price: Number(item.price) || 0,
  margin_percent: 0,
  delivery: '',
  tax: 0,
  amount: (Number(item.price) || 0) * Math.max(Number(item.stock) || 0, 0),
  image: String(item.image_url || '').trim(),
  source,
});

const normalizeItem = (item: SupplierProductInput, source: SupplierImportSource): SupplierProductInput => ({
  prov: String(item.prov || '').trim(),
  location: String(item.location || '').trim(),
  product: String(item.product || '').trim(),
  id: String(item.id || '').trim(),
  category: String(item.category || 'General').trim() || 'General',
  description: String(item.description || '').trim(),
  qty: Math.max(Number(item.qty) || 0, 0),
  price: Number(item.price),
  margin_percent: Number(item.margin_percent) || 0,
  delivery: String(item.delivery || '').trim(),
  tax: Number(item.tax) || 0,
  amount: Number(item.amount) || ((Number(item.price) || 0) * (Math.max(Number(item.qty) || 0, 0))),
  image: String(item.image || '').trim(),
  source,
});

export const validateImportProducts = (items: SupplierProductInput[]) => {
  return items
    .map((item) => normalizeItem(item, item.source || 'manual'))
    .filter(isImportableProduct);
};

export async function parseCatalogFile(file: File): Promise<SupplierProductInput[]> {
  const name = String(file?.name || '').toLowerCase();

  if (name.endsWith('.csv')) {
    return validateImportProducts((await parseLegacyCSV(file)).map((item) => mapLegacyItem(item, 'csv')));
  }

  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    return validateImportProducts((await parseLegacyExcel(file)).map((item) => mapLegacyItem(item, 'excel')));
  }

  if (name.endsWith('.json')) {
    return validateImportProducts((await parseLegacyJSON(file)).map((item) => mapLegacyItem(item, 'json')));
  }

  throw new Error('Catalog format not recognized. Please use the correct template.');
}

export async function parseProductsFromApi(endpoint: string): Promise<SupplierProductInput[]> {
  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error('Catalog format not recognized. Please use the correct template.');
  }

  const payload = await response.json().catch(() => null);
  const rows = adaptGenericApiProducts(payload);

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Catalog format not recognized. Please use the correct template.');
  }

  return validateImportProducts(rows as SupplierProductInput[]);
}
