import type { SupplierProductRow } from '../types';

export type SupplierInsight = {
  product: string;
  best_supplier: string;
  best_price: number;
  average_price: number;
  potential_margin: number;
};

const round = (value: number) => Number(value.toFixed(2));

export function analyzeSupplierProducts(rows: SupplierProductRow[], businessId: string): SupplierInsight[] {
  const safeRows = rows.filter((row) => row.business_id === businessId && String(row.product || '').trim() && Number.isFinite(Number(row.price)));
  const grouped = new Map<string, SupplierProductRow[]>();

  for (const row of safeRows) {
    const key = String(row.product || '').trim().toLowerCase();
    const current = grouped.get(key) || [];
    current.push(row);
    grouped.set(key, current);
  }

  return Array.from(grouped.entries())
    .map(([, group]) => {
      if (group.length < 2) return null;
      const sorted = [...group].sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
      const total = sorted.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
      const average = total / sorted.length;
      const best = sorted[0];
      const highest = sorted[sorted.length - 1];

      return {
        product: best.product,
        best_supplier: best.prov,
        best_price: round(Number(best.price) || 0),
        average_price: round(average),
        potential_margin: round(Math.max((Number(highest.price) || 0) - (Number(best.price) || 0), 0)),
      } satisfies SupplierInsight;
    })
    .filter((item): item is SupplierInsight => Boolean(item))
    .sort((a, b) => a.best_price - b.best_price);
}
