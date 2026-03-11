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

    const { data, error } = await ctx.supabase
      .from('invoices')
      .select(`
        *,
        customers (*),
        invoice_lines (*)
      `)
      .eq('user_id', ctx.tenantId)
      .order('created_at', { ascending: false })
      .order('invoice_date', { ascending: false });

    if (error) throw error;

    return res.status(200).json({ success: true, data: data || [] });
  } catch (error) {
    return res.status(500).json({ success: false, error: String(error?.message || 'Failed to fetch invoices') });
  }
}
