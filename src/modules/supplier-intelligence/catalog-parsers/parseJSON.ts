import type { CatalogParserProduct } from './parseCSV';
import { isValidCatalogProduct, mapRawCatalogProduct } from './parseCSV';
import { detectCatalogArray } from '../import-utils/detectCatalogArray';

export async function parseJSON(file: File): Promise<CatalogParserProduct[]> {
  let payload: any;
  try {
    payload = JSON.parse(await file.text());
  } catch {
    throw new Error('Catalog format not recognized. Please use the correct template.');
  }

  const rows = detectCatalogArray(payload);
  const fallbackRows = rows.length === 0 && payload && typeof payload === 'object'
    ? [payload as Record<string, unknown>]
    : rows;

  if (!Array.isArray(fallbackRows) || fallbackRows.length === 0) {
    throw new Error('Catalog format not recognized. Please use the correct template.');
  }

  const products = fallbackRows
    .map((row, index) => mapRawCatalogProduct((row || {}) as Record<string, unknown>, index))
    .filter(isValidCatalogProduct);

  if (!products.length) {
    throw new Error('Catalog format not recognized. Please use the correct template.');
  }

  return products;
}
