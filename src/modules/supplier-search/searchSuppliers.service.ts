import type {
  SupplierAdapter,
  SupplierProductResult,
  SupplierSearchOptions,
} from '../supplier-adapters/SupplierAdapter';
import { calculateTotals, parseDeliveryDays } from './utils/calculateTotals';
import { rankSuppliers } from './utils/rankSuppliers';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const buildResultKey = (result: SupplierProductResult) => {
  return [
    String(result.supplierAdapterId || result.supplier || '').trim().toLowerCase(),
    String(result.sku || '').trim().toLowerCase(),
    String(result.productName || '').trim().toLowerCase(),
  ].join('::');
};

const sortResults = (results: SupplierProductResult[], sortBy: NonNullable<SupplierSearchOptions['sortBy']>) => {
  return [...results].sort((left, right) => {
    if (sortBy === 'delivery') {
      const deliveryDifference = (left.deliveryDays || parseDeliveryDays(left.delivery)) - (right.deliveryDays || parseDeliveryDays(right.delivery));
      if (deliveryDifference !== 0) return deliveryDifference;
      if (left.price !== right.price) return left.price - right.price;
      return right.stock - left.stock;
    }

    if (sortBy === 'availability') {
      if (right.stock !== left.stock) return right.stock - left.stock;
      const deliveryDifference = (left.deliveryDays || parseDeliveryDays(left.delivery)) - (right.deliveryDays || parseDeliveryDays(right.delivery));
      if (deliveryDifference !== 0) return deliveryDifference;
      return left.price - right.price;
    }

    const priceDifference = left.price - right.price;
    if (priceDifference !== 0) return priceDifference;
    const deliveryDifference = (left.deliveryDays || parseDeliveryDays(left.delivery)) - (right.deliveryDays || parseDeliveryDays(right.delivery));
    if (deliveryDifference !== 0) return deliveryDifference;
    return right.stock - left.stock;
  });
};

export async function searchSuppliers(
  query: string,
  adapters: SupplierAdapter[],
  options: SupplierSearchOptions = {},
): Promise<SupplierProductResult[]> {
  const normalizedQuery = String(query || '').trim().toLowerCase();

  if (!normalizedQuery) {
    return [];
  }

  const settledResults = await Promise.allSettled(
    adapters.map((adapter) => adapter.searchProduct(normalizedQuery)),
  );

  const mergedResults = settledResults
    .filter((result): result is PromiseFulfilledResult<SupplierProductResult[]> => result.status === 'fulfilled')
    .flatMap((result) => result.value)
    .map((result) => ({
      ...result,
      deliveryDays: result.deliveryDays || parseDeliveryDays(result.delivery),
      availabilityScore: result.availabilityScore ?? Math.max(Number(result.stock) || 0, 0),
    }));

  const dedupedMap = new Map<string, SupplierProductResult>();
  for (const result of mergedResults) {
    const key = buildResultKey(result);
    const existing = dedupedMap.get(key);
    if (!existing) {
      dedupedMap.set(key, result);
      continue;
    }

    const preferred = sortResults([existing, result], 'price')[0];
    dedupedMap.set(key, preferred);
  }

  const sortBy = options.sortBy || 'price';
  const limit = Math.max(1, Math.min(options.limit || DEFAULT_LIMIT, MAX_LIMIT));

  const sortedResults = sortResults(Array.from(dedupedMap.values()), sortBy).slice(0, limit);
  return rankSuppliers(calculateTotals(sortedResults));
}
