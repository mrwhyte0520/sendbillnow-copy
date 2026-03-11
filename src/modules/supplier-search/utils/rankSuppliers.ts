import type { SupplierProductResult } from '../../supplier-adapters/SupplierAdapter';
import { normalizeSupplierResult, parseDeliveryDays } from './calculateTotals';

export type SupplierTableSort = 'supplier' | 'unitPrice' | 'totalAmount' | 'deliveryTime' | 'aiScore';

const rankLabelMap: Record<number, string> = {
  1: '🥇',
  2: '🥈',
  3: '🥉',
};

const buildDecisionReasons = (
  result: SupplierProductResult,
  sortedByTotal: SupplierProductResult[],
  fastestResult: SupplierProductResult | undefined,
  lowestTaxResult: SupplierProductResult | undefined,
) => {
  const reasons: string[] = [];

  if (sortedByTotal[0]?.productId === result.productId && sortedByTotal[0]?.supplier === result.supplier) {
    reasons.push('Lowest total price');
  }
  if (fastestResult?.productId === result.productId && fastestResult?.supplier === result.supplier) {
    reasons.push('Fast delivery');
  }
  if (lowestTaxResult?.productId === result.productId && lowestTaxResult?.supplier === result.supplier) {
    reasons.push('Competitive tax rate');
  }
  if (reasons.length === 0 && (result.discountPercent || 0) > 0) {
    reasons.push('Discount improves procurement value');
  }
  if (reasons.length === 0 && (result.stock || 0) >= (result.quantity || 0)) {
    reasons.push('Available stock covers requested quantity');
  }

  return reasons;
};

const clampScore = (value: number) => {
  return Math.max(0, Math.min(100, value));
};

const computeAiScore = (
  result: SupplierProductResult,
  minPrice: number,
  maxPrice: number,
) => {
  const price = result.totalAmount || result.price || 0;
  const deliveryDays = result.deliveryDays || parseDeliveryDays(result.delivery);
  const reliability = result.reliabilityPercent ?? 85;
  const orderHistoryFactor = result.orderHistoryFactor ?? Math.min((result.totalOrders || 0) * 4, 100);
  const normalizedPriceScore = maxPrice > minPrice
    ? ((price - minPrice) / (maxPrice - minPrice)) * 100
    : 0;
  const score =
    (100 - normalizedPriceScore) * 0.4 +
    clampScore(100 - (deliveryDays * 5)) * 0.3 +
    reliability * 0.2 +
    orderHistoryFactor * 0.1;

  return clampScore(score);
};

export const sortSupplierRows = (
  results: SupplierProductResult[],
  sortBy: SupplierTableSort = 'totalAmount',
) => {
  const normalized = results.map((result, index) => normalizeSupplierResult(result, index));

  return [...normalized].sort((left, right) => {
    if (sortBy === 'supplier') {
      const supplierCompare = left.supplier.localeCompare(right.supplier);
      if (supplierCompare !== 0) return supplierCompare;
      return (left.totalAmount || 0) - (right.totalAmount || 0);
    }

    if (sortBy === 'unitPrice') {
      if (left.price !== right.price) return left.price - right.price;
      return (left.totalAmount || 0) - (right.totalAmount || 0);
    }

    if (sortBy === 'deliveryTime') {
      const deliveryCompare = parseDeliveryDays(left.delivery) - parseDeliveryDays(right.delivery);
      if (deliveryCompare !== 0) return deliveryCompare;
      return (left.totalAmount || 0) - (right.totalAmount || 0);
    }

    if (sortBy === 'aiScore') {
      if ((right.aiScore || 0) !== (left.aiScore || 0)) {
        return (right.aiScore || 0) - (left.aiScore || 0);
      }
      return (left.totalAmount || 0) - (right.totalAmount || 0);
    }

    if ((left.totalAmount || 0) !== (right.totalAmount || 0)) {
      return (left.totalAmount || 0) - (right.totalAmount || 0);
    }

    if (left.price !== right.price) return left.price - right.price;
    return parseDeliveryDays(left.delivery) - parseDeliveryDays(right.delivery);
  });
};

export const rankSuppliers = (results: SupplierProductResult[]) => {
  const normalized = results.map((result, index) => normalizeSupplierResult(result, index));
  const minPrice = Math.min(...normalized.map((result) => result.totalAmount || result.price || 0));
  const maxPrice = Math.max(...normalized.map((result) => result.totalAmount || result.price || 0));
  const withAiScore = normalized.map((result) => ({
    ...result,
    aiScore: computeAiScore(result, minPrice, maxPrice),
  }));
  const sortedByTotal = sortSupplierRows(withAiScore, 'totalAmount');
  const fastestResult = sortSupplierRows(results, 'deliveryTime')[0];
  const lowestTaxResult = [...withAiScore]
    .sort((left, right) => left.taxPercent - right.taxPercent)[0];
  const topRatedResult = [...withAiScore].sort((left, right) => (right.reliabilityPercent || 0) - (left.reliabilityPercent || 0))[0];
  const sortedByAi = sortSupplierRows(withAiScore, 'aiScore');

  return sortedByAi.map((result, index) => ({
    ...result,
    rank: index + 1,
    rankLabel: rankLabelMap[index + 1] || `#${index + 1}`,
    isBestPrice: sortedByTotal[0]?.productId === result.productId && sortedByTotal[0]?.supplier === result.supplier,
    isFastestDelivery: fastestResult?.productId === result.productId && fastestResult?.supplier === result.supplier,
    isTopRated: topRatedResult?.productId === result.productId && topRatedResult?.supplier === result.supplier,
    isRecommended: index === 0 || buildDecisionReasons(result, sortedByTotal, fastestResult, lowestTaxResult).length >= 2,
    decisionReasons: buildDecisionReasons(result, sortedByTotal, fastestResult, lowestTaxResult),
  }));
};

export const getBestSupplier = (results: SupplierProductResult[]) => {
  return rankSuppliers(results)[0] || null;
};
