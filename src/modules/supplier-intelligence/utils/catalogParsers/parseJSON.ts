import type { SupplierProductInput } from '../../types';
import { detectCatalogArray } from '../../import-utils/detectCatalogArray';
import { normalizeCatalogRow } from '../../import-utils/normalizeCatalogRow';
import { isImportableProduct } from '../normalizeProduct';

const hasAnyCellValue = (row: Record<string, unknown>) =>
  Object.values(row || {}).some((value) => String(value ?? '').trim() !== '');

export async function parseJSON(file: File): Promise<SupplierProductInput[]> {
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

  const normalized = fallbackRows
    .filter((row) => hasAnyCellValue((row || {}) as Record<string, unknown>))
    .map((row) => normalizeCatalogRow((row || {}) as Record<string, unknown>, 'json'))
    .filter(isImportableProduct);

  if (!normalized.length) {
    throw new Error('Catalog format not recognized. Please use the correct template.');
  }

  return normalized;
}
