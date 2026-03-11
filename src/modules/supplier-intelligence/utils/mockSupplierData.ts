import type { SupplierProductResult } from '../../supplier-adapters/SupplierAdapter';

const productImageMap: Record<string, string> = {
  Hammer: 'https://images.unsplash.com/photo-1586864387967-d02ef85d93e8?auto=format&fit=crop&w=120&q=80',
  'Electric Drill': 'https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=120&q=80',
  'Steel Screws': 'https://images.unsplash.com/photo-1581092580497-e0d23cbdf1dc?auto=format&fit=crop&w=120&q=80',
  'Ceramic Tiles': 'https://images.unsplash.com/photo-1615874694520-474822394e73?auto=format&fit=crop&w=120&q=80',
};

const demoSuppliers = [
  {
    id: 'demo-global-tools',
    name: 'Global Tools Inc',
    location: 'Miami, FL',
    reliabilityPercent: 94,
    totalOrders: 24,
    totalSpend: 12420,
    averageDeliveryDays: 3.1,
    orderHistoryFactor: 88,
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
  },
];

const demoProducts = [
  {
    productName: 'Hammer',
    imageUrl: productImageMap.Hammer,
    productId: 'HAM-1001',
    category: 'Hand Tools',
    description: '16 oz fiberglass claw hammer for general construction work.',
    sku: 'HAM-1001',
    quantity: 20,
    price: [12.5, 13.4, 12.9, 13.1],
    discountPercent: [4, 3, 2, 5],
    taxPercent: [18, 18, 18, 18],
    deliveryDays: [3, 5, 2, 4],
    stock: [120, 95, 80, 140],
  },
  {
    productName: 'Electric Drill',
    imageUrl: productImageMap['Electric Drill'],
    productId: 'DRL-2200',
    category: 'Power Tools',
    description: 'Cordless electric drill kit with dual battery pack.',
    sku: 'DRL-2200',
    quantity: 8,
    price: [78.5, 82.0, 76.9, 80.25],
    discountPercent: [6, 4, 5, 3],
    taxPercent: [18, 18, 18, 18],
    deliveryDays: [4, 6, 3, 5],
    stock: [40, 28, 34, 50],
  },
  {
    productName: 'Steel Screws',
    imageUrl: productImageMap['Steel Screws'],
    productId: 'SCR-5000',
    category: 'Fasteners',
    description: 'Box of zinc-coated steel screws for industrial use.',
    sku: 'SCR-5000',
    quantity: 60,
    price: [4.8, 5.1, 4.65, 4.95],
    discountPercent: [8, 6, 7, 5],
    taxPercent: [18, 18, 18, 18],
    deliveryDays: [2, 4, 2, 3],
    stock: [500, 460, 510, 620],
  },
  {
    productName: 'Ceramic Tiles',
    imageUrl: productImageMap['Ceramic Tiles'],
    productId: 'TIL-9080',
    category: 'Construction Materials',
    description: 'Premium ceramic tiles for commercial and residential projects.',
    sku: 'TIL-9080',
    quantity: 120,
    price: [9.4, 9.85, 9.2, 9.6],
    discountPercent: [5, 4, 6, 5],
    taxPercent: [18, 18, 18, 18],
    deliveryDays: [5, 6, 4, 5],
    stock: [700, 650, 820, 760],
  },
];

export const generateMockSupplierResults = (query = '') => {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  const filteredProducts = normalizedQuery
    ? demoProducts.filter((product) => {
        return [product.productName, product.category, product.description, product.sku]
          .some((value) => value.toLowerCase().includes(normalizedQuery));
      })
    : demoProducts;

  const productsToUse = filteredProducts.length > 0 ? filteredProducts : demoProducts;

  return demoSuppliers.flatMap((supplier, supplierIndex) => {
    return productsToUse.map((product) => ({
      supplier: supplier.name,
      location: supplier.location,
      productName: product.productName,
      imageUrl: product.imageUrl,
      productId: product.productId,
      category: product.category,
      description: product.description,
      sku: `${product.sku}-${supplierIndex + 1}`,
      quantity: product.quantity,
      price: product.price[supplierIndex],
      discountPercent: product.discountPercent[supplierIndex],
      stock: product.stock[supplierIndex],
      delivery: `${product.deliveryDays[supplierIndex]}d`,
      taxPercent: product.taxPercent[supplierIndex],
      amount: 0,
      source: 'mock' as const,
      supplierRecord: {
        id: supplier.id,
        name: supplier.name,
        exists: false,
        canCreate: true,
      },
      deliveryDays: product.deliveryDays[supplierIndex],
      reliabilityPercent: supplier.reliabilityPercent,
      totalOrders: supplier.totalOrders,
      totalSpend: supplier.totalSpend,
      averageDeliveryDays: supplier.averageDeliveryDays,
      orderHistoryFactor: supplier.orderHistoryFactor,
    } satisfies SupplierProductResult));
  });
};
