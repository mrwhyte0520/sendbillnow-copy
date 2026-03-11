import type { SupplierAdapter, SupplierProductResult } from '../../supplier-adapters/SupplierAdapter';
import { supabase } from '../../../lib/supabase';

const NETWORK_TIMEOUT_MS = 8000;
const MAX_LIVE_RESULTS = 50;

class LiveSupplierAdapter implements SupplierAdapter {
  readonly id = 'live-supplier-adapter';

  readonly supplierName = 'Live Supplier API';

  async searchProduct(query: string): Promise<SupplierProductResult[]> {
    const normalizedQuery = String(query || '').trim();

    if (!normalizedQuery) {
      return [];
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);

    const apiBase = import.meta.env.VITE_API_BASE_URL?.trim() || '';
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token || '';

    try {
      const response = await fetch(`${apiBase}/api/suppliers/search?${new URLSearchParams({ q: normalizedQuery, sortBy: 'price', limit: String(MAX_LIVE_RESULTS) }).toString()}`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Unable to query suppliers in live mode.');
      }

      const payload = await response.json().catch(() => null);
      const results: Array<Record<string, any>> = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.results)
          ? payload.results
          : [];

      return results
        .slice(0, MAX_LIVE_RESULTS)
        .map((product: Record<string, any>) => ({
          supplier: product?.supplier || 'Unknown Supplier',
          location: product?.location || 'Unknown Location',
          productName: product?.productName || 'Unknown Product',
          imageUrl: product?.imageUrl || '',
          productId: product?.productId || `live-${normalizedQuery}`,
          category: product?.category || 'General',
          description: product?.description || 'No description available.',
          sku: product?.sku || `LIVE-${normalizedQuery}`,
          quantity: product?.quantity ?? 1,
          price: product?.price ?? 0,
          discountPercent: product?.discountPercent ?? 0,
          stock: product?.stock ?? 0,
          delivery: product?.delivery || '5d',
          taxPercent: product?.taxPercent ?? 18,
          amount: product?.amount ?? 0,
          source: 'live' as const,
          supplierAdapterId: product?.supplierAdapterId || this.id,
          supplierRecord: product?.supplierRecord,
          inventoryItem: product?.inventoryItem,
          availabilityScore: product?.availabilityScore,
          deliveryDays: product?.deliveryDays,
          subtotal: product?.subtotal,
          discountAmount: product?.discountAmount,
          taxAmount: product?.taxAmount,
          totalAmount: product?.totalAmount,
          reliabilityPercent: product?.reliabilityPercent,
          totalOrders: product?.totalOrders,
          totalSpend: product?.totalSpend,
          averageDeliveryDays: product?.averageDeliveryDays,
          orderHistoryFactor: product?.orderHistoryFactor,
        } satisfies SupplierProductResult));
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('Live supplier search timed out.');
      }

      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }
}

export const liveSupplierAdapter = new LiveSupplierAdapter();
