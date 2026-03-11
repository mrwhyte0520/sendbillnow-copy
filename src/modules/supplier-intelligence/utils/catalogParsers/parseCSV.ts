import Papa from 'papaparse';
import type { SupplierProductInput } from '../../types';
import { normalizeCatalogRow } from '../../import-utils/normalizeCatalogRow';
import { isImportableProduct } from '../normalizeProduct';

const hasAnyCellValue = (row: Record<string, unknown>) =>
  Object.values(row || {}).some((value) => String(value ?? '').trim() !== '');

const normalizeHeader = (header: string) => String(header || '').toLowerCase().replace(/^\ufeff/, '').trim();

export async function parseCSV(file: File): Promise<SupplierProductInput[]> {
  const raw = await file.text();

  return new Promise((resolve, reject) => {
    Papa.parse(raw, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => normalizeHeader(header),
      complete: (results: any) => {
        try {
          const rows = (results.data || []) as Record<string, unknown>[];
          const normalized = rows
            .filter((row) => hasAnyCellValue(row || {}))
            .map((row) => normalizeCatalogRow(row, 'csv'))
            .filter(isImportableProduct);

          if (!normalized.length) {
            reject(new Error('Catalog format not recognized. Please use the correct template.'));
            return;
          }

          resolve(normalized);
        } catch {
          reject(new Error('Catalog format not recognized. Please use the correct template.'));
        }
      },
      error: () => reject(new Error('Catalog format not recognized. Please use the correct template.')),
    });
  });
}
