import { getBearerToken, getSupabaseClient, readJsonBody, requireUser, resolveTenantId, recalcTotals } from './_shared.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const accessToken = getBearerToken(req);
  if (!accessToken) return res.status(401).json({ ok: false, error: 'Missing access token' });

  const supabase = getSupabaseClient(accessToken);
  if (!supabase) {
    const missing = [];
    if (!process.env.SUPABASE_URL) missing.push('SUPABASE_URL');
    if (!process.env.SUPABASE_ANON_KEY) missing.push('SUPABASE_ANON_KEY');
    const extra = missing.length ? `Missing ${missing.join(', ')}` : 'Missing SUPABASE_* configuration';
    return res.status(500).json({ ok: false, error: `Server misconfiguration. ${extra}` });
  }

  const { user, error: userError } = await requireUser(supabase);
  if (userError) return res.status(401).json({ ok: false, error: userError });

  const tenantId = await resolveTenantId(supabase, user);
  if (!tenantId) return res.status(400).json({ ok: false, error: 'Missing tenant id' });

  const body = await readJsonBody(req);
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ ok: false, error: 'Invalid JSON body' });
  }

  const documentId = String(body.documentId || body.document_id || body.id || '').trim();
  if (!documentId) return res.status(400).json({ ok: false, error: 'Missing documentId' });

  const { data: doc, error: docError } = await supabase
    .from('service_documents')
    .select('id, status, sealed_at, voided_at, expired_at')
    .eq('id', documentId)
    .eq('user_id', tenantId)
    .limit(1)
    .maybeSingle();

  if (docError) return res.status(500).json({ ok: false, error: docError.message || 'Could not read document' });
  if (!doc?.id) return res.status(404).json({ ok: false, error: 'Document not found' });

  const status = String(doc.status || '');
  if (doc.sealed_at || status === 'Sealed') {
    return res.status(400).json({ ok: false, error: 'Document is sealed' });
  }
  if (doc.voided_at || status === 'Voided') {
    return res.status(400).json({ ok: false, error: 'Document is voided' });
  }
  if (doc.expired_at || status === 'Expired') {
    return res.status(400).json({ ok: false, error: 'Document is expired' });
  }
  if (status !== 'Draft' && status !== 'Sent' && status !== 'Viewed') {
    return res.status(400).json({ ok: false, error: 'Document cannot be edited in current status' });
  }

  const lines = Array.isArray(body.lines) ? body.lines : [];

  const deleteIds = [];
  const upserts = [];

  for (const raw of lines) {
    if (!raw || typeof raw !== 'object') continue;

    const id = raw.id ? String(raw.id).trim() : '';
    const deleted = raw.deleted === true || raw._delete === true;

    if (deleted) {
      if (id) deleteIds.push(id);
      continue;
    }

    const description = String(raw.description || '').trim();
    if (!description) {
      return res.status(400).json({ ok: false, error: 'Line description is required' });
    }

    const quantity = Number(raw.quantity ?? 1);
    const unitPrice = Number(raw.unitPrice ?? raw.unit_price ?? 0);
    const taxable = raw.taxable === false ? false : true;
    const position = Number.isFinite(Number(raw.position)) ? Number(raw.position) : 0;

    const inventoryItemId = raw.inventoryItemId || raw.inventory_item_id ? String(raw.inventoryItemId ?? raw.inventory_item_id).trim() : null;
    const unitCost = Number(raw.unitCost ?? raw.unit_cost ?? 0);

    upserts.push({
      ...(id ? { id } : {}),
      user_id: tenantId,
      document_id: documentId,
      position,
      inventory_item_id: inventoryItemId || null,
      description,
      quantity: Number.isFinite(quantity) ? quantity : 1,
      unit_price: Number.isFinite(unitPrice) ? unitPrice : 0,
      unit_cost: Number.isFinite(unitCost) ? unitCost : 0,
      taxable,
    });
  }

  if (deleteIds.length) {
    const { error: delError } = await supabase
      .from('service_document_lines')
      .delete()
      .eq('user_id', tenantId)
      .eq('document_id', documentId)
      .in('id', deleteIds);

    if (delError) return res.status(500).json({ ok: false, error: delError.message || 'Could not delete lines' });
  }

  if (upserts.length) {
    const { error: upError } = await supabase
      .from('service_document_lines')
      .upsert(upserts, { onConflict: 'id' });

    if (upError) return res.status(500).json({ ok: false, error: upError.message || 'Could not save lines' });
  }

  try {
    const document = await recalcTotals({ supabase, tenantId, documentId });

    const { data: savedLines, error: linesError } = await supabase
      .from('service_document_lines')
      .select('id, position, inventory_item_id, description, quantity, unit_price, unit_cost, taxable, line_total, created_at')
      .eq('user_id', tenantId)
      .eq('document_id', documentId)
      .order('position', { ascending: true });

    if (linesError) {
      return res.status(500).json({ ok: false, error: linesError.message || 'Could not load lines' });
    }

    const overrideRaw = body?.materialCost ?? body?.material_cost;
    const overrideProvided = overrideRaw !== undefined && overrideRaw !== null && String(overrideRaw).trim() !== '';
    const overrideVal = Number(overrideRaw);

    let totalMaterialCost = 0;

    if (overrideProvided && Number.isFinite(overrideVal) && overrideVal >= 0) {
      await supabase
        .from('service_documents')
        .update({ material_cost: overrideVal })
        .eq('id', documentId)
        .eq('user_id', tenantId);

      totalMaterialCost = overrideVal;
    } else {
      const inventoryIds = (savedLines ?? [])
        .map((l) => l.inventory_item_id)
        .filter(Boolean);

      let costMap = {};
      if (inventoryIds.length) {
        const { data: items } = await supabase
          .from('inventory_items')
          .select('id, cost_price')
          .in('id', [...new Set(inventoryIds)]);
        for (const item of (items || [])) {
          costMap[item.id] = Number(item.cost_price ?? 0);
        }
      }

      for (const line of (savedLines ?? [])) {
        const invId = line.inventory_item_id;
        const costFromInventory = invId && costMap[invId] != null ? costMap[invId] : 0;
        const qty = Number(line.quantity ?? 0);

        if (invId && costFromInventory > 0 && Number(line.unit_cost ?? 0) !== costFromInventory) {
          await supabase
            .from('service_document_lines')
            .update({ unit_cost: costFromInventory })
            .eq('id', line.id);
          line.unit_cost = costFromInventory;
        }

        totalMaterialCost += (Number(line.unit_cost ?? 0) || costFromInventory) * qty;
      }

      await supabase
        .from('service_documents')
        .update({ material_cost: Math.round(totalMaterialCost * 100) / 100 })
        .eq('id', documentId)
        .eq('user_id', tenantId);
    }

    const safeMaterialCost = Number.isFinite(totalMaterialCost) && totalMaterialCost >= 0
      ? Math.round(totalMaterialCost * 100) / 100
      : 0;

    return res.status(200).json({ ok: true, document: { ...document, material_cost: safeMaterialCost }, lines: savedLines ?? [] });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'Could not recalculate totals' });
  }
}
