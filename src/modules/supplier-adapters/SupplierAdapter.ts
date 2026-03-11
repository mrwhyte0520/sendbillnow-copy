export type SupplierSortBy = 'price' | 'delivery' | 'availability';

export type SupplierResultSource = 'mock' | 'demo' | 'live' | 'database' | 'hybrid';

export interface SupplierSearchOptions {
  sortBy?: SupplierSortBy;
  limit?: number;
  userId?: string;
}

export interface SupplierRecordLink {
  id: string | null;
  name: string;
  exists: boolean;
  canCreate: boolean;
}

export interface InventoryItemLink {
  id: string | null;
  name: string;
  sku: string;
  exists: boolean;
}

export interface SupplierProductResult {
  supplier: string;
  location: string;
  productName: string;
  imageUrl?: string;
  productId: string;
  category: string;
  description: string;
  sku: string;
  quantity: number;
  price: number;
  discountPercent: number;
  stock: number;
  delivery: string;
  taxPercent: number;
  amount: number;
  source?: SupplierResultSource;
  supplierAdapterId?: string;
  supplierRecord?: SupplierRecordLink;
  inventoryItem?: InventoryItemLink;
  availabilityScore?: number;
  deliveryDays?: number;
  isBestPrice?: boolean;
  isFastestDelivery?: boolean;
  isRecommended?: boolean;
  subtotal?: number;
  discountAmount?: number;
  taxAmount?: number;
  totalAmount?: number;
  rank?: number;
  rankLabel?: string;
  decisionReasons?: string[];
  aiScore?: number;
  reliabilityPercent?: number;
  totalOrders?: number;
  totalSpend?: number;
  averageDeliveryDays?: number;
  orderHistoryFactor?: number;
  isTopRated?: boolean;
  markupPercent?: number;
  sellingPrice?: number;
  profitPerUnit?: number;
  totalProfit?: number;
}

export interface SupplierAdapter {
  readonly id: string;
  readonly supplierName: string;
  searchProduct(query: string): Promise<SupplierProductResult[]>;
}
