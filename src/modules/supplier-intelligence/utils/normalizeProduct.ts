import type { SupplierImportSource, SupplierProductInput } from '../types';
import { hasRecognizableSupplierProductRow, toSupplierProductInput } from './normalizeSupplierProduct';

export function hasRecognizableProductData(row: Record<string, unknown>) {
  return hasRecognizableSupplierProductRow(row);
}

export function normalizeProduct(row: Record<string, unknown>, source: SupplierImportSource): SupplierProductInput {
  return toSupplierProductInput(row, source);
}

export function isImportableProduct(item: SupplierProductInput) {
  return Boolean(String(item.product || '').trim());
}
