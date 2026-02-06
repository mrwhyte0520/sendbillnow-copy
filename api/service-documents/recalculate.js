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
  if (!supabase) return res.status(500).json({ ok: false, error: 'Server misconfiguration' });

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

  try {
    const document = await recalcTotals({ supabase, tenantId, documentId });
    return res.status(200).json({ ok: true, document });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'Could not recalculate totals' });
  }
}
