import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import DashboardLayout from '../../../components/layout/DashboardLayout';
import { supabase } from '../../../lib/supabase';
import { toast } from 'sonner';

const BASE_CARD_CLASSES =
  'bg-[#FBF7EF] border border-[#D9C8A9] rounded-2xl shadow-[0_18px_38px_rgba(55,74,58,0.12)]';
const INPUT_CLASSES =
  'px-3 py-2 border border-[#D9C8A9] rounded-lg text-sm text-[#2F3D2E] bg-white focus:ring-2 focus:ring-[#3C4F3C] focus:border-[#3C4F3C] transition';
const PRIMARY_BUTTON_CLASSES =
  'px-4 py-2 bg-[#3C4F3C] text-white rounded-lg hover:bg-[#2D3B2E] transition font-semibold flex items-center gap-2 shadow-[0_10px_25px_rgba(60,79,60,0.35)]';
const SECONDARY_BUTTON_CLASSES =
  'px-4 py-2 bg-[#EBDAC0] text-[#2F3D2E] rounded-lg hover:bg-[#DEC6A0] transition font-semibold flex items-center gap-2';
const TERTIARY_BUTTON_CLASSES =
  'px-4 py-2 bg-white border border-[#D9C8A9] text-[#2F3D2E] rounded-lg hover:bg-[#F8F1E3] transition font-semibold flex items-center gap-2';

type ServiceDocumentRow = {
  id: string;
  doc_type: 'JOB_ESTIMATE' | 'CLASSIC_INVOICE';
  status: string;
  doc_number: string;
  client_name: string;
  client_email: string | null;
  total: number;
  created_at: string;
  updated_at: string;
};

export default function ServiceDocumentsListPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ServiceDocumentRow[]>([]);

  const [filterType, setFilterType] = useState<'ALL' | 'JOB_ESTIMATE' | 'CLASSIC_INVOICE'>('ALL');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user?.id) {
        setRows([]);
        return;
      }

      const { data, error } = await supabase
        .from('service_documents')
        .select('id, doc_type, status, doc_number, client_name, client_email, total, created_at, updated_at')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const all = (data as any[] | null) ?? [];
      const filtered = filterType === 'ALL'
        ? all
        : all.filter((d) => String(d?.doc_type) === filterType);
      setRows(filtered as any);
    } catch (e: any) {
      console.error('ServiceDocumentsListPage load error', e);
      toast.error(e?.message || 'Could not load service documents');
    } finally {
      setLoading(false);
    }
  }, [filterType]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (docType: 'JOB_ESTIMATE' | 'CLASSIC_INVOICE') => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) {
        toast.error('Please login again');
        return;
      }

      const apiBase = import.meta.env.VITE_API_BASE_URL?.trim() || '';

      const resp = await fetch(`${apiBase}/api/service-documents/create`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          docType,
          clientName: 'General Customer',
        }),
      });

      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.ok || !json?.document?.id) {
        throw new Error(json?.error || 'Could not create document');
      }

      navigate(`/service-documents/${json.document.id}`, { state: { docType } });
    } catch (e: any) {
      toast.error(e?.message || 'Could not create document');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-8 bg-[#F4ECDC] min-h-screen rounded-[32px] p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-semibold text-[#2F3D2E]">Service Documents</h1>
            <p className="text-sm text-[#5F6652] mt-1">
              Create and send Job Estimates and Classic Invoices for review & signature.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => create('JOB_ESTIMATE')} className={PRIMARY_BUTTON_CLASSES}>
              <i className="ri-file-add-line" />
              <span>New Job Estimate</span>
            </button>
            {/* Classic Invoice button hidden for now */}
          </div>
        </div>

        <div className={`${BASE_CARD_CLASSES} p-6 flex flex-wrap items-center gap-3`}>
          <label className="text-sm font-semibold text-[#7A705A]">Type</label>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value as any)} className={INPUT_CLASSES}>
            <option value="ALL">All</option>
            <option value="JOB_ESTIMATE">Job Estimate</option>
            <option value="CLASSIC_INVOICE">Classic Invoice</option>
          </select>

          <button onClick={load} className={`${TERTIARY_BUTTON_CLASSES} ml-auto`}>
            <i className="ri-refresh-line" />
            <span>Refresh</span>
          </button>
        </div>

        <div className={`${BASE_CARD_CLASSES} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F8F1E3]">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-semibold tracking-[0.08em] uppercase text-[#7A705A]">Number</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold tracking-[0.08em] uppercase text-[#7A705A]">Type</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold tracking-[0.08em] uppercase text-[#7A705A]">Status</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold tracking-[0.08em] uppercase text-[#7A705A]">Client</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold tracking-[0.08em] uppercase text-[#7A705A]">Total</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold tracking-[0.08em] uppercase text-[#7A705A]">Updated</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-[#EADDC4]">
                {loading ? (
                  <tr>
                    <td className="px-6 py-6 text-[#7A705A]" colSpan={6}>Loading...</td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td className="px-6 py-6 text-[#7A705A]" colSpan={6}>No documents yet.</td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr
                      key={r.id}
                      className="hover:bg-[#FFF7E8] cursor-pointer transition"
                      onClick={() => navigate(`/service-documents/${r.id}`)}
                    >
                      <td className="px-6 py-4 font-semibold text-[#2F3D2E]">{r.doc_number}</td>
                      <td className="px-6 py-4 text-[#2F3D2E]">
                        {r.doc_type === 'JOB_ESTIMATE' ? 'Job Estimate' : 'Classic Invoice'}
                      </td>
                      <td className="px-6 py-4 text-[#2F3D2E]">{r.status === 'Viewed' ? 'Sent' : r.status}</td>
                      <td className="px-6 py-4 text-[#2F3D2E]">{r.client_name}</td>
                      <td className="px-6 py-4 text-right font-semibold text-[#2F3D2E]">{Number(r.total ?? 0).toFixed(2)}</td>
                      <td className="px-6 py-4 text-right text-[#7A705A]">
                        {r.updated_at ? new Date(r.updated_at).toLocaleString() : ''}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
