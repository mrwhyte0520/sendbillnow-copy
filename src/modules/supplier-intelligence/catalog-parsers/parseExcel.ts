import * as XLSX from 'xlsx';
import type { CatalogParserProduct } from './parseCSV';
import { isValidCatalogProduct, mapRawCatalogProduct } from './parseCSV';

export async function parseExcel(file: File): Promise<CatalogParserProduct[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    throw new Error('Catalog format not recognized. Please use the correct template.');
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  });

  const products = rows.map((row, index) => mapRawCatalogProduct(row, index)).filter(isValidCatalogProduct);

  if (!products.length) {
    throw new Error('Catalog format not recognized. Please use the correct template.');
  }

  return products;
}
