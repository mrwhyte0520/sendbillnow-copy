function preparePurchaseOrderFromQuote(quote) {
  const normalizedQuote = quote || {};

  return {
    supplier: String(normalizedQuote.supplier || '').trim(),
    supplierId: normalizedQuote.supplierRecord?.id || null,
    product: String(normalizedQuote.productName || '').trim(),
    inventoryItemId: normalizedQuote.inventoryItem?.id || null,
    quantity: Number(normalizedQuote.quantity || 1) || 1,
    price: Number(normalizedQuote.price || 0) || 0,
    delivery: String(normalizedQuote.delivery || '').trim(),
    status: 'Pending',
    supplierProductId: String(normalizedQuote.productId || '').trim(),
    sku: String(normalizedQuote.sku || '').trim(),
    taxPercent: Number(normalizedQuote.taxPercent || 0) || 0,
    notes: `Prepared from Supplier Intelligence quote ${String(normalizedQuote.productId || '').trim()}`,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const quote = req.body?.quote;
  if (!quote) {
    return res.status(400).json({ success: false, error: 'Quote payload is required.' });
  }

  const purchaseOrderDraft = preparePurchaseOrderFromQuote(quote);
  return res.status(200).json({ success: true, purchaseOrderDraft });
}
