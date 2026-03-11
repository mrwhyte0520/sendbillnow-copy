import type { SupplierAdapter, SupplierProductResult } from '../../supplier-adapters/SupplierAdapter';

const NETWORK_TIMEOUT_MS = 8000;
const MAX_PRODUCTS = 50;

type DummyJsonProduct = {
  id: number;
  title: string;
  description: string;
  category: string;
  price: number;
  stock: number;
  thumbnail: string;
  sku?: string;
};

type DummyJsonResponse = {
  products: DummyJsonProduct[];
};

const supplierProfiles = [
  {
    id: 'demo-global-tools',
    name: 'Global Tools Inc',
    location: 'Miami, FL',
    reliabilityPercent: 94,
    totalOrders: 24,
    totalSpend: 12420,
    averageDeliveryDays: 3.1,
    orderHistoryFactor: 88,
    priceMultiplier: 0.98,
    deliveryDays: 3,
    stockMultiplier: 1.15,
  },
  {
    id: 'demo-industrial-supply',
    name: 'Industrial Supply Group',
    location: 'Houston, TX',
    reliabilityPercent: 91,
    totalOrders: 19,
    totalSpend: 10980,
    averageDeliveryDays: 4.2,
    orderHistoryFactor: 82,
    priceMultiplier: 1.04,
    deliveryDays: 5,
    stockMultiplier: 1.05,
  },
  {
    id: 'demo-prime-industrial',
    name: 'Prime Industrial Co',
    location: 'Santo Domingo, DO',
    reliabilityPercent: 96,
    totalOrders: 31,
    totalSpend: 18340,
    averageDeliveryDays: 3.6,
    orderHistoryFactor: 93,
    priceMultiplier: 1.01,
    deliveryDays: 4,
    stockMultiplier: 1.2,
  },
  {
    id: 'demo-quickparts',
    name: 'QuickParts Ltd',
    location: 'Orlando, FL',
    reliabilityPercent: 89,
    totalOrders: 17,
    totalSpend: 9785,
    averageDeliveryDays: 2.4,
    orderHistoryFactor: 79,
    priceMultiplier: 0.96,
    deliveryDays: 2,
    stockMultiplier: 0.95,
  },
];

const normalizeCategory = (category: string) => {
  if (!category) return 'General Supplies';
  return category
    .split(/[-_]/g)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

class DummyJsonAdapter implements SupplierAdapter {
  readonly id = 'dummy-json-adapter';

  readonly supplierName = 'DummyJSON Procurement Feed';

  async searchProduct(query: string): Promise<SupplierProductResult[]> {
    const normalizedQuery = String(query || '').trim();

    if (!normalizedQuery) {
      return [];
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);

    try {
      const response = await fetch(`https://dummyjson.com/products/search?q=${encodeURIComponent(normalizedQuery)}`, {
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error('Failed to fetch demo supplier products.');
      }

      const payload = await response.json().catch(() => null) as DummyJsonResponse | null;

      if (!payload || !Array.isArray(payload.products)) {
        return [];
      }

      const products = payload.products.slice(0, MAX_PRODUCTS);

      return products.flatMap((product) => {
        const productId = product?.id ?? 0;
        const productTitle = product?.title || 'Unknown Product';
        const productPrice = product?.price ?? 0;
        const productStock = product?.stock ?? 0;
        const productCategory = product?.category || 'General';
        const productDescription = product?.description || 'No description available.';
        const productImage = product?.thumbnail || '';
        const productSku = product?.sku || `DJ-${productId}`;

        return supplierProfiles.map((supplier, index) => {
          const unitPrice = Number((productPrice * supplier.priceMultiplier).toFixed(2));
          const stock = Math.max(0, Math.round(productStock * supplier.stockMultiplier) - (index * 3));
          const quantity = Math.min(Math.max(Math.round(productStock / 4), 1), 25);
          const discountPercent = Math.max(2, 6 - index);

          return {
            supplier: supplier.name || 'Unknown Supplier',
            location: supplier.location || 'Unknown Location',
            productName: productTitle,
            imageUrl: productImage,
            productId: `DJ-${productId}`,
            category: normalizeCategory(productCategory),
            description: productDescription,
            sku: `${productSku}-${index + 1}`,
            quantity,
            price: unitPrice,
            discountPercent,
            stock,
            delivery: `${supplier.deliveryDays}d`,
            taxPercent: 18,
            amount: 0,
            source: 'demo' as const,
            supplierAdapterId: `${this.id}-${supplier.id}`,
            supplierRecord: {
              id: supplier.id,
              name: supplier.name,
              exists: false,
              canCreate: true,
            },
            deliveryDays: supplier.deliveryDays,
            reliabilityPercent: supplier.reliabilityPercent,
            totalOrders: supplier.totalOrders,
            totalSpend: supplier.totalSpend,
            averageDeliveryDays: supplier.averageDeliveryDays,
            orderHistoryFactor: supplier.orderHistoryFactor,
          } satisfies SupplierProductResult;
        });
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        console.error('DummyJSON supplier search timed out.');
        return [];
      }

      console.error('DummyJSON supplier search failed:', error);
      return [];
    } finally {
      window.clearTimeout(timeoutId);
    }
  }
}

export const dummyJsonAdapter = new DummyJsonAdapter();
