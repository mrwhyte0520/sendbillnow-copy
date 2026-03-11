import type { SupplierImportSource, SupplierProductInput } from '../types';
import { toSupplierProductInput } from '../utils/normalizeSupplierProduct';
import type { ColumnMapping } from './detectColumnMapping';
import { detectColumnMapping } from './detectColumnMapping';

type CatalogRow = Record<string, unknown>;

const getMappedValue = (row: CatalogRow, mapping: ColumnMapping, field: keyof ColumnMapping) => {
  const key = mapping[field];
  if (!key) return undefined;
  const value = row[key];

  if (field === 'image' && Array.isArray(value) && value.length > 0) {
    return value[0];
  }

  return value;
};

export function normalizeCatalogRow(row: CatalogRow, source: SupplierImportSource, providedMapping?: ColumnMapping): SupplierProductInput {
  const mapping = providedMapping || detectColumnMapping(row);
  const normalizedInput = Object.entries(mapping).reduce<Record<string, unknown>>((acc, [field, key]) => {
    if (!key) return acc;
    const value = getMappedValue(row, mapping, field as keyof ColumnMapping);
    if (value !== undefined) {
      acc[field] = value;
    }
    return acc;
  }, {});

  return toSupplierProductInput({ ...row, ...normalizedInput }, source);
}
