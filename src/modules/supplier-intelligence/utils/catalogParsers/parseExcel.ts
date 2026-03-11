import * as XLSX from 'xlsx';
import type { SupplierProductInput } from '../../types';
import { normalizeCatalogRow } from '../../import-utils/normalizeCatalogRow';
import { isImportableProduct } from '../normalizeProduct';

const hasAnyCellValue = (row: Record<string, unknown>) =>
  Object.values(row || {}).some((value) => String(value ?? '').trim() !== '');

export async function parseExcel(file: File): Promise<SupplierProductInput[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error('Catalog format not recognized. Please use the correct template.');
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  });

  const normalized = rows
    .filter((row) => hasAnyCellValue(row || {}))
    .map((row) => normalizeCatalogRow(row, 'excel'))
    .filter(isImportableProduct);

  if (!normalized.length) {
    throw new Error('Catalog format not recognized. Please use the correct template.');
  }

  return normalized;
}
