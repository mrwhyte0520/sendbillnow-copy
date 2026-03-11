import { ensureGet, getAuthedTenantContext, handleOptions, setJsonHeaders } from './_readonly-api.js';

export default async function handler(req, res) {
  setJsonHeaders(res);
  if (handleOptions(req, res)) return;
  if (!ensureGet(req, res)) return;

  try {
    const ctx = await getAuthedTenantContext(req);
    if (ctx.error) {
      return res.status(ctx.error.status).json(ctx.error.body);
    }

    const rawId = req.params?.id ?? req.query?.id;
    const id = String(rawId || '').trim();
    if (!id) {
      return res.status(400).json({ success: false, error: 'Product id is required' });
    }

    const { data, error } = await ctx.supabase
      .from('inventory_items')
      .select('*')
      .eq('user_id', ctx.tenantId)
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, error: String(error?.message || 'Failed to fetch product') });
  }
}
