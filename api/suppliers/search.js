import {
  getBearerToken,
  getSupabaseClient,
  requireUser,
  resolveTenantId,
} from '../service-documents/_shared.js';

const CACHE_TTL_MS = 30_000;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const supplierCache = new Map();

const mockSupplierAProducts = [
  { supplier: 'Juan Ferretería', location: 'Miami, US', productName: 'Hammer', productId: 'A-PROD-1001', category: 'Hand Tools', description: 'Forged steel claw hammer for general maintenance and construction tasks.', sku: 'HAM123', quantity: 20, price: 12.5, discountPercent: 3, stock: 20, delivery: '2 days', taxPercent: 7, amount: 259.25, source: 'mock', supplierAdapterId: 'mock-supplier-a' },
  { supplier: 'Juan Ferretería', location: 'Miami, US', productName: 'Drill', productId: 'A-PROD-1002', category: 'Power Tools', description: 'Compact electric drill with variable speed and impact mode.', sku: 'DRL456', quantity: 8, price: 54.99, discountPercent: 5, stock: 8, delivery: '3 days', taxPercent: 7, amount: 447.12, source: 'mock', supplierAdapterId: 'mock-supplier-a' },
  { supplier: 'Juan Ferretería', location: 'Orlando, US', productName: 'Screwdriver', productId: 'A-PROD-1003', category: 'Hand Tools', description: 'Magnetic tip screwdriver designed for assembly and repair work.', sku: 'SCR789', quantity: 35, price: 7.25, discountPercent: 2, stock: 35, delivery: '1 day', taxPercent: 7, amount: 266.12, source: 'mock', supplierAdapterId: 'mock-supplier-a' },
  { supplier: 'Juan Ferretería', location: 'Orlando, US', productName: 'Bolts', productId: 'A-PROD-1004', category: 'Fasteners', description: 'Zinc-coated industrial bolts suitable for general assembly operations.', sku: 'BLT159', quantity: 150, price: 0.35, discountPercent: 1, stock: 400, delivery: '2 days', taxPercent: 7, amount: 56.18, source: 'mock', supplierAdapterId: 'mock-supplier-a' },
  { supplier: 'Juan Ferretería', location: 'Tampa, US', productName: 'Nails', productId: 'A-PROD-1005', category: 'Fasteners', description: 'Galvanized nails packed for construction, carpentry, and repairs.', sku: 'NAL753', quantity: 300, price: 0.08, discountPercent: 0, stock: 1200, delivery: '2 days', taxPercent: 7, amount: 25.68, source: 'mock', supplierAdapterId: 'mock-supplier-a' },
  { supplier: 'Juan Ferretería', location: 'Miami, US', productName: 'Wrench', productId: 'A-PROD-1006', category: 'Mechanical Tools', description: 'Adjustable chrome wrench for mechanical maintenance and installation teams.', sku: 'WRN258', quantity: 14, price: 16.75, discountPercent: 4, stock: 24, delivery: '3 days', taxPercent: 7, amount: 250.75, source: 'mock', supplierAdapterId: 'mock-supplier-a' },
  { supplier: 'Juan Ferretería', location: 'Jacksonville, US', productName: 'Pliers', productId: 'A-PROD-1007', category: 'Hand Tools', description: 'Multi-purpose pliers with insulated grip for workshop and field tasks.', sku: 'PLR951', quantity: 18, price: 9.9, discountPercent: 2, stock: 31, delivery: '2 days', taxPercent: 7, amount: 190.6, source: 'mock', supplierAdapterId: 'mock-supplier-a' },
  { supplier: 'Juan Ferretería', location: 'Tampa, US', productName: 'Tape Measure', productId: 'A-PROD-1008', category: 'Measuring Tools', description: '5-meter tape measure with reinforced blade and lock mechanism.', sku: 'TPM357', quantity: 20, price: 6.8, discountPercent: 3, stock: 42, delivery: '2 days', taxPercent: 7, amount: 141.2, source: 'mock', supplierAdapterId: 'mock-supplier-a' },
  { supplier: 'Juan Ferretería', location: 'Miami, US', productName: 'Level', productId: 'A-PROD-1009', category: 'Measuring Tools', description: 'Aluminum level for alignment and framing applications.', sku: 'LVL852', quantity: 9, price: 18.4, discountPercent: 4, stock: 15, delivery: '4 days', taxPercent: 7, amount: 170.12, source: 'mock', supplierAdapterId: 'mock-supplier-a' },
  { supplier: 'Juan Ferretería', location: 'Orlando, US', productName: 'Saw', productId: 'A-PROD-1010', category: 'Cutting Tools', description: 'Hand saw with triple-ground teeth for wood and PVC cutting.', sku: 'SAW741', quantity: 11, price: 21.25, discountPercent: 5, stock: 17, delivery: '3 days', taxPercent: 7, amount: 237.36, source: 'mock', supplierAdapterId: 'mock-supplier-a' },
];

const mockSupplierBProducts = [
  { supplier: 'Pedro Centro de Cerámicas', location: 'Bogotá, CO', productName: 'Hammer', productId: 'B-PROD-2101', category: 'Industrial Tools', description: 'Heavy-duty hammer with anti-slip grip for warehouse and field use.', sku: 'HAM222', quantity: 12, price: 11, discountPercent: 4, stock: 12, delivery: '4 days', taxPercent: 19, amount: 150.86, source: 'mock', supplierAdapterId: 'mock-supplier-b' },
  { supplier: 'Pedro Centro de Cerámicas', location: 'Medellín, CO', productName: 'Saw', productId: 'B-PROD-2102', category: 'Cutting Tools', description: 'Professional hand saw with hardened teeth for wood cutting.', sku: 'SAW333', quantity: 16, price: 19.75, discountPercent: 6, stock: 16, delivery: '5 days', taxPercent: 19, amount: 355.97, source: 'mock', supplierAdapterId: 'mock-supplier-b' },
  { supplier: 'Pedro Centro de Cerámicas', location: 'Cali, CO', productName: 'Wrench', productId: 'B-PROD-2103', category: 'Mechanical Tools', description: 'Adjustable wrench for maintenance teams and workshop operations.', sku: 'WRN444', quantity: 10, price: 14.4, discountPercent: 3, stock: 10, delivery: '2 days', taxPercent: 19, amount: 166.32, source: 'mock', supplierAdapterId: 'mock-supplier-b' },
  { supplier: 'Pedro Centro de Cerámicas', location: 'Bogotá, CO', productName: 'Drill', productId: 'B-PROD-2104', category: 'Power Tools', description: 'Corded impact drill designed for commercial maintenance operations.', sku: 'DRL620', quantity: 7, price: 52.4, discountPercent: 4, stock: 11, delivery: '3 days', taxPercent: 19, amount: 416.13, source: 'mock', supplierAdapterId: 'mock-supplier-b' },
  { supplier: 'Pedro Centro de Cerámicas', location: 'Medellín, CO', productName: 'Screwdriver', productId: 'B-PROD-2105', category: 'Hand Tools', description: 'Precision screwdriver with ergonomic handle for daily repair tasks.', sku: 'SCR512', quantity: 24, price: 6.95, discountPercent: 2, stock: 60, delivery: '2 days', taxPercent: 19, amount: 198.31, source: 'mock', supplierAdapterId: 'mock-supplier-b' },
  { supplier: 'Pedro Centro de Cerámicas', location: 'Cali, CO', productName: 'Bolts', productId: 'B-PROD-2106', category: 'Fasteners', description: 'Industrial bolts packed for machinery support and light construction.', sku: 'BLT601', quantity: 200, price: 0.31, discountPercent: 3, stock: 650, delivery: '3 days', taxPercent: 19, amount: 71.62, source: 'mock', supplierAdapterId: 'mock-supplier-b' },
  { supplier: 'Pedro Centro de Cerámicas', location: 'Bogotá, CO', productName: 'Nails', productId: 'B-PROD-2107', category: 'Fasteners', description: 'Construction-grade nails available in high-volume commercial packs.', sku: 'NAL844', quantity: 350, price: 0.07, discountPercent: 0, stock: 1500, delivery: '2 days', taxPercent: 19, amount: 29.16, source: 'mock', supplierAdapterId: 'mock-supplier-b' },
  { supplier: 'Pedro Centro de Cerámicas', location: 'Medellín, CO', productName: 'Pliers', productId: 'B-PROD-2108', category: 'Hand Tools', description: 'Long-nose pliers ideal for electrical and precision work.', sku: 'PLR909', quantity: 13, price: 10.6, discountPercent: 3, stock: 26, delivery: '4 days', taxPercent: 19, amount: 159.82, source: 'mock', supplierAdapterId: 'mock-supplier-b' },
  { supplier: 'Pedro Centro de Cerámicas', location: 'Cali, CO', productName: 'Tape Measure', productId: 'B-PROD-2109', category: 'Measuring Tools', description: 'Durable tape measure suitable for warehouse counting and installations.', sku: 'TPM114', quantity: 19, price: 6.1, discountPercent: 2, stock: 35, delivery: '2 days', taxPercent: 19, amount: 136.37, source: 'mock', supplierAdapterId: 'mock-supplier-b' },
  { supplier: 'Pedro Centro de Cerámicas', location: 'Bogotá, CO', productName: 'Level', productId: 'B-PROD-2110', category: 'Measuring Tools', description: 'Compact spirit level for finishing work and alignment checks.', sku: 'LVL330', quantity: 10, price: 17.8, discountPercent: 4, stock: 19, delivery: '3 days', taxPercent: 19, amount: 203.25, source: 'mock', supplierAdapterId: 'mock-supplier-b' },
];

function parseDeliveryDays(delivery) {
  const match = String(delivery || '').match(/\d+/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function getCacheKey(query, sortBy, limit, tenantId) {
  return `${normalizeText(query)}::${sortBy}::${limit}::${tenantId || 'anonymous'}`;
}

function buildResultKey(result) {
  return [
    normalizeText(result.supplierAdapterId || result.supplier),
    normalizeText(result.sku),
    normalizeText(result.productName),
  ].join('::');
}

function sortResults(results, sortBy) {
  return [...results].sort((left, right) => {
    if (sortBy === 'delivery') {
      const deliveryDiff = (left.deliveryDays || parseDeliveryDays(left.delivery)) - (right.deliveryDays || parseDeliveryDays(right.delivery));
      if (deliveryDiff !== 0) return deliveryDiff;
      if (left.price !== right.price) return left.price - right.price;
      return right.stock - left.stock;
    }

    if (sortBy === 'availability') {
      if (right.stock !== left.stock) return right.stock - left.stock;
      const deliveryDiff = (left.deliveryDays || parseDeliveryDays(left.delivery)) - (right.deliveryDays || parseDeliveryDays(right.delivery));
      if (deliveryDiff !== 0) return deliveryDiff;
      return left.price - right.price;
    }

    const priceDiff = left.price - right.price;
    if (priceDiff !== 0) return priceDiff;
    const deliveryDiff = (left.deliveryDays || parseDeliveryDays(left.delivery)) - (right.deliveryDays || parseDeliveryDays(right.delivery));
    if (deliveryDiff !== 0) return deliveryDiff;
    return right.stock - left.stock;
  });
}

function decorateInsights(results) {
  const bestPrice = sortResults(results, 'price')[0];
  const fastest = sortResults(results, 'delivery')[0];
  const recommended = [...results]
    .sort((left, right) => {
      const leftScore = left.price + (left.deliveryDays || 0) - Math.min(left.stock, 100) / 100;
      const rightScore = right.price + (right.deliveryDays || 0) - Math.min(right.stock, 100) / 100;
      return leftScore - rightScore;
    })[0];

  return results.map((result) => ({
    ...result,
    isBestPrice: !!bestPrice && result.productId === bestPrice.productId,
    isFastestDelivery: !!fastest && result.productId === fastest.productId,
    isRecommended: !!recommended && result.productId === recommended.productId,
  }));
}

async function enrichWithDatabase(results, supabase, tenantId) {
  if (!supabase || !tenantId || results.length === 0) {
    return results.map((result) => ({
      ...result,
      supplierRecord: { id: null, name: result.supplier, exists: false, canCreate: true },
      inventoryItem: { id: null, name: result.productName, sku: result.sku, exists: false },
    }));
  }

  const supplierNames = [...new Set(results.map((result) => normalizeText(result.supplier)).filter(Boolean))];
  const skus = [...new Set(results.map((result) => String(result.sku || '').trim()).filter(Boolean))];
  const productNames = [...new Set(results.map((result) => String(result.productName || '').trim()).filter(Boolean))];

  let supplierRows = [];
  let inventoryRows = [];

  try {
    const { data } = await supabase
      .from('suppliers')
      .select('id, legal_name, trade_name, name')
      .eq('user_id', tenantId);
    supplierRows = Array.isArray(data) ? data : [];
  } catch {
    supplierRows = [];
  }

  try {
    let inventoryQuery = supabase
      .from('inventory_items')
      .select('id, name, sku')
      .eq('user_id', tenantId)
      .limit(200);

    if (skus.length > 0) {
      inventoryQuery = inventoryQuery.in('sku', skus);
    }

    const { data } = await inventoryQuery;
    inventoryRows = Array.isArray(data) ? data : [];

    if (inventoryRows.length === 0 && productNames.length > 0) {
      const { data: fallbackRows } = await supabase
        .from('inventory_items')
        .select('id, name, sku')
        .eq('user_id', tenantId)
        .limit(200);
      inventoryRows = Array.isArray(fallbackRows) ? fallbackRows : [];
    }
  } catch {
    inventoryRows = [];
  }

  const supplierMap = new Map();
  supplierRows.forEach((row) => {
    const keys = [row?.legal_name, row?.trade_name, row?.name].map(normalizeText).filter(Boolean);
    keys.forEach((key) => {
      if (!supplierMap.has(key)) {
        supplierMap.set(key, row);
      }
    });
  });

  const inventoryBySku = new Map();
  const inventoryByName = new Map();
  inventoryRows.forEach((row) => {
    const skuKey = normalizeText(row?.sku);
    const nameKey = normalizeText(row?.name);
    if (skuKey && !inventoryBySku.has(skuKey)) inventoryBySku.set(skuKey, row);
    if (nameKey && !inventoryByName.has(nameKey)) inventoryByName.set(nameKey, row);
  });

  return results.map((result) => {
    const supplierRow = supplierMap.get(normalizeText(result.supplier)) || null;
    const inventoryRow = inventoryBySku.get(normalizeText(result.sku)) || inventoryByName.get(normalizeText(result.productName)) || null;
    const linked = !!supplierRow || !!inventoryRow;

    return {
      ...result,
      source: linked && result.source === 'mock' ? 'hybrid' : result.source || 'mock',
      supplierRecord: supplierRow
        ? {
            id: supplierRow.id ? String(supplierRow.id) : null,
            name: supplierRow.legal_name || supplierRow.trade_name || supplierRow.name || result.supplier,
            exists: true,
            canCreate: false,
          }
        : {
            id: null,
            name: result.supplier,
            exists: false,
            canCreate: true,
          },
      inventoryItem: inventoryRow
        ? {
            id: inventoryRow.id ? String(inventoryRow.id) : null,
            name: inventoryRow.name || result.productName,
            sku: inventoryRow.sku || result.sku,
            exists: true,
          }
        : {
            id: null,
            name: result.productName,
            sku: result.sku,
            exists: false,
          },
    };
  });
}

async function searchSupplierProducts(query, options = {}) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return [];

  const sortBy = ['price', 'delivery', 'availability'].includes(options.sortBy) ? options.sortBy : 'price';
  const limit = Math.max(1, Math.min(Number(options.limit) || DEFAULT_LIMIT, MAX_LIMIT));
  const cacheKey = getCacheKey(normalizedQuery, sortBy, limit, options.tenantId);
  const cachedEntry = supplierCache.get(cacheKey);

  if (cachedEntry && cachedEntry.expiresAt > Date.now()) {
    return cachedEntry.results;
  }

  const merged = [...mockSupplierAProducts, ...mockSupplierBProducts]
    .filter((product) =>
      normalizeText(product.productName).includes(normalizedQuery) ||
      normalizeText(product.sku).includes(normalizedQuery) ||
      normalizeText(product.category).includes(normalizedQuery),
    )
    .map((result) => ({
      ...result,
      deliveryDays: parseDeliveryDays(result.delivery),
      availabilityScore: Math.max(Number(result.stock) || 0, 0),
    }));

  const dedupedMap = new Map();
  merged.forEach((result) => {
    const key = buildResultKey(result);
    const existing = dedupedMap.get(key);
    if (!existing) {
      dedupedMap.set(key, result);
      return;
    }
    dedupedMap.set(key, sortResults([existing, result], 'price')[0]);
  });

  const enriched = await enrichWithDatabase(Array.from(dedupedMap.values()), options.supabase, options.tenantId);
  const sorted = decorateInsights(sortResults(enriched, sortBy).slice(0, limit));

  supplierCache.set(cacheKey, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    results: sorted,
  });

  return sorted;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const query = String(req.query?.q || '').trim();
  const sortBy = String(req.query?.sortBy || 'price').trim();
  const limit = Number(req.query?.limit || DEFAULT_LIMIT);
  if (!query) {
    return res.status(400).json({ success: false, error: 'Query parameter q is required.' });
  }

  let tenantId = null;
  let supabase = null;

  try {
    const accessToken = getBearerToken(req);
    if (accessToken) {
      supabase = getSupabaseClient(accessToken);
      if (supabase) {
        const { user } = await requireUser(supabase);
        if (user?.id) {
          tenantId = await resolveTenantId(supabase, user);
        }
      }
    }
  } catch {
    tenantId = null;
    supabase = null;
  }

  const results = await searchSupplierProducts(query, { sortBy, limit, tenantId, supabase });
  return res.status(200).json(results);
}
