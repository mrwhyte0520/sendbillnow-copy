import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import DashboardLayout from '../../../components/layout/DashboardLayout';
import { supabase } from '../../../lib/supabase';
import { inventoryService } from '../../../services/database';
import { toast } from 'sonner';

const BASE_CARD_CLASSES =
  'bg-[#FBF7EF] border border-[#D9C8A9] rounded-2xl shadow-[0_18px_38px_rgba(55,74,58,0.12)]';
const TABLE_HEADER_CLASSES =
  'px-6 py-3 text-left text-xs font-semibold tracking-[0.08em] uppercase text-[#7A705A]';
const TABLE_CELL_CLASSES = 'px-6 py-4 text-sm text-[#2F3D2E]';
const INPUT_CLASSES =
  'w-full px-3 py-2 border border-[#D9C8A9] rounded-lg text-sm text-[#2F3D2E] bg-white focus:ring-2 focus:ring-[#3C4F3C] focus:border-[#3C4F3C] transition';
const PRIMARY_BUTTON_CLASSES =
  'px-4 py-2 bg-[#3C4F3C] text-white rounded-lg hover:bg-[#2D3B2E] transition font-semibold flex items-center gap-2 shadow-[0_10px_25px_rgba(60,79,60,0.35)]';
const SECONDARY_BUTTON_CLASSES =
  'px-4 py-2 bg-[#EBDAC0] text-[#2F3D2E] rounded-lg hover:bg-[#DEC6A0] transition font-semibold flex items-center gap-2';
const TERTIARY_BUTTON_CLASSES =
  'px-4 py-2 bg-white border border-[#D9C8A9] text-[#2F3D2E] rounded-lg hover:bg-[#F8F1E3] transition font-semibold flex items-center gap-2';

function withDisabledStyle(base: string, disabled: boolean) {
  return `${base}${disabled ? ' opacity-50 cursor-not-allowed pointer-events-none' : ''}`;
}

type ServiceDocument = {
  id: string;
  doc_type: 'JOB_ESTIMATE' | 'CLASSIC_INVOICE';
  status: string;
  doc_number: string;
  currency: string;
  client_name: string;
  client_email: string | null;
  client_phone: string | null;
  client_address: string | null;
  terms_snapshot: string;
  tax_rate: number;
  subtotal: number;
  tax: number;
  total: number;
  material_cost: number;
  sent_at: string | null;
  viewed_at: string | null;
  client_signed_at: string | null;
  contractor_signed_at: string | null;
  sealed_at: string | null;
  sealed_pdf_path: string | null;
  created_at: string;
  updated_at: string;
};

type InventoryItem = {
  id: string;
  name: string;
  sku: string;
  selling_price: number;
  cost_price: number;
  description?: string;
  taxable?: boolean;
};

type ServiceLine = {
  id?: string;
  position: number;
  inventory_item_id?: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  unit_cost?: number;
  taxable: boolean;
  line_total?: number;
  _deleted?: boolean;
};

type ServiceSignature = {
  client_name: string | null;
  client_signature_image: string | null;
  client_signed_at: string | null;
  contractor_name: string | null;
  contractor_signature_image: string | null;
  contractor_signed_at: string | null;
};

function parseErrorMessage(payload: any): string {
  if (!payload) return 'Something went wrong.';
  if (typeof payload.error === 'string' && payload.error.trim()) return payload.error.trim();
  return 'Something went wrong.';
}

function isCanvasBlank(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return true;
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 0) return false;
  }
  return true;
}

function parseClientAddress(raw?: string): { street: string; city: string; state: string; zip: string } {
  const s = String(raw || '').replace(/\r\n/g, '\n');
  const lines = s
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const street = lines[0] || '';
  const secondLine = lines.slice(1).join(' ').trim();
  const segs = secondLine
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

  const city = segs[0] || '';
  const rest = segs.slice(1).join(' ').trim();
  const tokens = rest.split(/\s+/).filter(Boolean);
  const state = tokens[0] || '';
  const zip = tokens.slice(1).join(' ').trim();
  return { street, city, state, zip };
}

function buildClientAddress(input: { street: string; city: string; state: string; zip: string }): string {
  const street = String(input.street || '').trim();
  const city = String(input.city || '').trim();
  const state = String(input.state || '').trim();
  const zip = String(input.zip || '').trim();

  const line2Parts: string[] = [];
  if (city) line2Parts.push(city);

  const stateZip = [state, zip].filter(Boolean).join(' ').trim();
  if (stateZip) {
    if (city) line2Parts.push(stateZip);
    else line2Parts.push(stateZip);
  }

  const line2 = line2Parts.join(city && stateZip ? ', ' : '').trim();
  return [street, line2].filter(Boolean).join('\n').trim();
}

export default function ServiceDocumentsEditPage() {
  const params = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const id = params.id as string | undefined;

  const [loading, setLoading] = useState(true);
  const [savingHeader, setSavingHeader] = useState(false);
  const [savingLines, setSavingLines] = useState(false);
  const [sending, setSending] = useState(false);
  const [applyingDefaultSig, setApplyingDefaultSig] = useState(false);
  const [sealing, setSealing] = useState(false);

  const [doc, setDoc] = useState<ServiceDocument | null>(null);
  const [lines, setLines] = useState<ServiceLine[]>([]);
  const [signature, setSignature] = useState<ServiceSignature | null>(null);
  const [sealedPdfUrl, setSealedPdfUrl] = useState<string | null>(null);

  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [clientCity, setClientCity] = useState('');
  const [clientState, setClientState] = useState('');
  const [clientZip, setClientZip] = useState('');
  const [terms, setTerms] = useState('');
  const [taxRate, setTaxRate] = useState('');
  const [materialCost, setMaterialCost] = useState('');

  const [showContractorSignModal, setShowContractorSignModal] = useState(false);
  const [showClientModal, setShowClientModal] = useState(false);
  const [showLinesModal, setShowLinesModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [latestSendLink, setLatestSendLink] = useState<string | null>(null);
  const [contractorNameInput, setContractorNameInput] = useState('');
  const [contractorSigning, setContractorSigning] = useState(false);
  const [contractorSignError, setContractorSignError] = useState('');

  // Inventory search
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [activeSearchIdx, setActiveSearchIdx] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const contractorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const contractorContainerRef = useRef<HTMLDivElement | null>(null);
  const contractorDrawingRef = useRef({ active: false, lastX: 0, lastY: 0 });

  const safeDocTitle = useMemo(() => {
    const fallbackType = String((location as any)?.state?.docType || '').trim();
    const docType = (doc?.doc_type || fallbackType) as any;
    const n = doc?.doc_number ? ` ${doc.doc_number}` : '';
    const t = docType === 'JOB_ESTIMATE' ? 'Job Estimate' : 'Classic Invoice';
    return `${t}${n}`;
  }, [doc?.doc_number, doc?.doc_type, location]);

  const flowStatus = useMemo(() => {
    const st = String(doc?.status || '');
    return st === 'Viewed' ? 'Sent' : st;
  }, [doc?.status]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user?.id) {
        navigate('/auth/login');
        return;
      }

      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) throw new Error('Please login again');

      const apiBase = import.meta.env.VITE_API_BASE_URL?.trim() || '';
      const resp = await fetch(`${apiBase}/api/service-documents/get`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ documentId: id }),
      });

      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.ok) {
        throw new Error(parseErrorMessage(json));
      }

      const d = (json.document || null) as ServiceDocument | null;
      const l = Array.isArray(json.lines) ? (json.lines as any[]) : [];
      const s = (json.signature || null) as ServiceSignature | null;
      const sp = typeof json.sealed_pdf_url === 'string' && json.sealed_pdf_url.trim() ? String(json.sealed_pdf_url) : null;

      if (!d?.id) {
        toast.error('Document not found');
        navigate('/service-documents');
        return;
      }

      setDoc(d as any);
      setSignature(s);
      setSealedPdfUrl(sp);

      setLines((l || []).map((x) => ({
        id: x.id,
        position: Number(x.position ?? 0),
        inventory_item_id: x.inventory_item_id ?? null,
        description: String(x.description ?? ''),
        quantity: Number(x.quantity ?? 1),
        unit_price: Number(x.unit_price ?? 0),
        unit_cost: Number(x.unit_cost ?? 0),
        taxable: x.taxable === false ? false : true,
        line_total: Number(x.line_total ?? 0),
      })));

      setClientName(String((d as any).client_name || ''));
      setClientEmail(String((d as any).client_email || ''));
      setClientPhone(String((d as any).client_phone || ''));
      {
        const rawAddr = String((d as any).client_address || '');
        const parsed = parseClientAddress(rawAddr);
        setClientAddress(parsed.street);
        setClientCity(parsed.city);
        setClientState(parsed.state);
        setClientZip(parsed.zip);
      }
      setTerms(String((d as any).terms_snapshot || ''));
      setTaxRate(String((d as any).tax_rate ?? ''));
      setMaterialCost(String((d as any).material_cost ?? ''));
    } catch (e: any) {
      console.error('ServiceDocumentsEditPage load error', e);
      toast.error(e?.message || 'Could not load document');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    load();
  }, [load]);

  // Load inventory items for product search
  const loadInventory = useCallback(async () => {
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user?.id) return;
      const items = await inventoryService.getItems(auth.user.id);
      setInventoryItems((items ?? []).map((it: any) => ({
        id: it.id,
        name: it.name || '',
        sku: it.sku || '',
        selling_price: Number(it.selling_price ?? 0),
        cost_price: Number(it.cost_price ?? 0),
        description: it.description || '',
        taxable: it.taxable !== false,
      })));
    } catch {
      // silently ignore
    }
  }, []);

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  const filteredInventory = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return inventoryItems.slice(0, 20);
    return inventoryItems
      .filter((item) => item.name.toLowerCase().includes(q) || (item.sku && item.sku.toLowerCase().includes(q)))
      .slice(0, 20);
  }, [inventoryItems, searchQuery]);

  const selectInventoryItem = useCallback((idx: number, item: InventoryItem) => {
    setLines((prev) =>
      prev.map((l, i) =>
        i === idx
          ? {
              ...l,
              inventory_item_id: item.id,
              description: item.name,
              unit_price: Number(item.selling_price ?? 0),
              unit_cost: Number(item.cost_price ?? 0),
              taxable: item.taxable !== false,
            }
          : l,
      ),
    );
    setActiveSearchIdx(null);
    setSearchQuery('');
  }, []);

  const headerDirty = useMemo(() => {
    if (!doc) return false;
    const composedAddress = buildClientAddress({
      street: clientAddress,
      city: clientCity,
      state: clientState,
      zip: clientZip,
    });
    return (
      clientName !== String(doc.client_name || '') ||
      clientEmail !== String(doc.client_email || '') ||
      clientPhone !== String(doc.client_phone || '') ||
      composedAddress !== String(doc.client_address || '') ||
      terms !== String(doc.terms_snapshot || '') ||
      taxRate !== String(doc.tax_rate ?? '')
    );
  }, [clientAddress, clientCity, clientEmail, clientName, clientPhone, clientState, clientZip, doc, taxRate, terms]);

  const numericTaxRate = useMemo(() => {
    const raw = String(taxRate ?? '').trim();
    if (!raw) return 0;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return 0;
    return n;
  }, [taxRate]);

  const visibleLines = useMemo(() => lines.filter((l) => !l._deleted), [lines]);

  const computeLineAmount = useCallback((l: ServiceLine) => {
    const qty = Number(l.quantity);
    const price = Number(l.unit_price);
    const q = Number.isFinite(qty) ? qty : 0;
    const p = Number.isFinite(price) ? price : 0;
    return q * p;
  }, []);

  const computedSubtotal = useMemo(() => {
    return visibleLines.reduce((sum, l) => sum + computeLineAmount(l), 0);
  }, [computeLineAmount, visibleLines]);

  const computedTax = useMemo(() => {
    return visibleLines.reduce((sum, l) => {
      const taxable = l.taxable !== false;
      if (!taxable) return sum;
      return sum + computeLineAmount(l) * numericTaxRate;
    }, 0);
  }, [computeLineAmount, numericTaxRate, visibleLines]);

  const numericMaterialCost = useMemo(() => {
    const n = Number(materialCost);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [materialCost]);

  const computedTotal = useMemo(
    () => computedSubtotal + computedTax + numericMaterialCost,
    [computedSubtotal, computedTax, numericMaterialCost],
  );

  const canEdit = useMemo(() => {
    if (!doc?.id) return false;
    if (doc.sealed_at || flowStatus === 'Sealed' || flowStatus === 'Voided' || flowStatus === 'Expired') return false;
    return flowStatus === 'Draft' || flowStatus === 'Sent';
  }, [doc?.id, doc?.sealed_at, flowStatus]);

  const canContractorSign = useMemo(() => {
    if (!doc?.id) return false;
    if (doc.sealed_at || flowStatus === 'Sealed' || flowStatus === 'Voided' || flowStatus === 'Expired') return false;
    if (doc.contractor_signed_at || signature?.contractor_signed_at) return false;
    return flowStatus === 'ClientSigned';
  }, [doc?.contractor_signed_at, doc?.id, doc?.sealed_at, flowStatus, signature?.contractor_signed_at]);

  const canSeal = useMemo(() => {
    if (!doc?.id) return false;
    if (doc.sealed_at || flowStatus === 'Sealed' || flowStatus === 'Voided' || flowStatus === 'Expired') return false;
    const clientSigned = Boolean(doc.client_signed_at || signature?.client_signed_at);
    const contractorSigned = Boolean(doc.contractor_signed_at || signature?.contractor_signed_at);
    return flowStatus === 'ContractorSigned' && clientSigned && contractorSigned;
  }, [doc?.client_signed_at, doc?.contractor_signed_at, doc?.id, doc?.sealed_at, flowStatus, signature?.client_signed_at, signature?.contractor_signed_at]);

  const configureContractorCanvas = useCallback(() => {
    const canvas = contractorCanvasRef.current;
    const container = contractorContainerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const cssWidth = Math.max(260, Math.floor(rect.width));
    const cssHeight = 160;
    const dpr = window.devicePixelRatio || 1;

    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    canvas.width = Math.floor(cssWidth * dpr);
    canvas.height = Math.floor(cssHeight * dpr);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111827';
    ctx.clearRect(0, 0, cssWidth, cssHeight);
  }, []);

  useEffect(() => {
    if (!showContractorSignModal) return;
    setContractorNameInput(String(signature?.contractor_name || ''));
    setContractorSignError('');
    configureContractorCanvas();
    const onResize = () => configureContractorCanvas();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [configureContractorCanvas, showContractorSignModal, signature?.contractor_name]);

  const onContractorPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = contractorCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    contractorDrawingRef.current = { active: true, lastX: x, lastY: y };
    canvas.setPointerCapture(e.pointerId);
  };

  const onContractorPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = contractorCanvasRef.current;
    if (!canvas) return;

    const { active, lastX, lastY } = contractorDrawingRef.current;
    if (!active) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(x, y);
    ctx.stroke();

    contractorDrawingRef.current.lastX = x;
    contractorDrawingRef.current.lastY = y;
  };

  const onContractorPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = contractorCanvasRef.current;
    if (!canvas) return;

    contractorDrawingRef.current.active = false;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {}
  };

  const clearContractorSignature = () => {
    configureContractorCanvas();
    setContractorSignError('');
  };

  const applyDefaultContractorSignature = async () => {
    if (!doc?.id) return;
    setApplyingDefaultSig(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) throw new Error('Please login again');

      const apiBase = import.meta.env.VITE_API_BASE_URL?.trim() || '';
      const resp = await fetch(`${apiBase}/api/service-documents/contractor/apply-default`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ documentId: doc.id }),
      });

      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.ok) throw new Error(parseErrorMessage(json));

      toast.success(json?.already_signed ? 'Already signed' : 'Contractor signature applied');
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Could not apply signature');
    } finally {
      setApplyingDefaultSig(false);
    }
  };

  const submitContractorSignature = async () => {
    if (!doc?.id) return;

    const canvas = contractorCanvasRef.current;
    if (!canvas) {
      setContractorSignError('Signature pad not available.');
      return;
    }
    if (isCanvasBlank(canvas)) {
      setContractorSignError('Please sign in the box before submitting.');
      return;
    }

    setContractorSigning(true);
    setContractorSignError('');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) throw new Error('Please login again');

      const apiBase = import.meta.env.VITE_API_BASE_URL?.trim() || '';
      const signatureBase64 = canvas.toDataURL('image/png');
      const contractorName = contractorNameInput.trim();

      const resp = await fetch(`${apiBase}/api/service-documents/contractor/sign`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          documentId: doc.id,
          signature_image_base64: signatureBase64,
          contractorName: contractorName || undefined,
        }),
      });

      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.ok) throw new Error(parseErrorMessage(json));

      toast.success(json?.already_signed ? 'Already signed' : 'Signed');
      setShowContractorSignModal(false);
      await load();
    } catch (e: any) {
      setContractorSignError(e?.message || 'Could not submit signature');
    } finally {
      setContractorSigning(false);
    }
  };

  const sealAgreement = async () => {
    if (!doc?.id) return;
    setSealing(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) throw new Error('Please login again');

      const apiBase = import.meta.env.VITE_API_BASE_URL?.trim() || '';
      const resp = await fetch(`${apiBase}/api/service-documents/seal`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          documentId: doc.id,
          ...(doc.sealed_at ? { forceRegenerate: true } : {}),
        }),
      });

      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.ok) throw new Error(parseErrorMessage(json));

      if (typeof json?.sealed_pdf_url === 'string' && json.sealed_pdf_url.trim()) {
        setSealedPdfUrl(String(json.sealed_pdf_url));
      }

      toast.success(json?.already_sealed ? 'Already sealed' : 'Agreement sealed');
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Could not seal agreement');
    } finally {
      setSealing(false);
    }
  };

  const addLine = () => {
    setLines((prev) => {
      const nextPos = prev.length ? Math.max(...prev.map((x) => Number(x.position || 0))) + 1 : 0;
      return [
        ...prev,
        {
          position: nextPos,
          description: '',
          quantity: 1,
          unit_price: 0,
          taxable: true,
        },
      ];
    });
  };

  const markDeleteLine = (idx: number) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, _deleted: true } : l)));
  };

  const updateLine = (idx: number, patch: Partial<ServiceLine>) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const saveHeader = async () => {
    if (!doc?.id) return;

    const name = clientName.trim();
    if (!name) {
      toast.error('Client name is required');
      return;
    }

    const rateNum = Number(taxRate);
    if (!Number.isFinite(rateNum) || rateNum < 0) {
      toast.error('Invalid tax rate');
      return;
    }

    setSavingHeader(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) throw new Error('Please login again');

      const apiBase = import.meta.env.VITE_API_BASE_URL?.trim() || '';
      const resp = await fetch(`${apiBase}/api/service-documents/update`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: doc.id,
          clientName: name,
          clientEmail: clientEmail.trim(),
          clientPhone: clientPhone.trim(),
          clientAddress: buildClientAddress({
            street: clientAddress,
            city: clientCity,
            state: clientState,
            zip: clientZip,
          }),
          termsSnapshot: terms,
          taxRate: rateNum,
        }),
      });

      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.ok) throw new Error(json?.error || 'Could not save');

      if (json?.document) {
        setDoc((prev) => (prev ? { ...prev, ...json.document } : json.document));
      } else {
        await load();
      }

      toast.success('Saved');
    } catch (e: any) {
      toast.error(e?.message || 'Could not save');
    } finally {
      setSavingHeader(false);
    }
  };

  const saveLines = async () => {
    if (!doc?.id) return;

    const prepared = lines
      .map((l, idx) => ({
        ...l,
        position: Number.isFinite(Number(l.position)) ? Number(l.position) : idx,
      }))
      .map((l, idx) => ({ ...l, position: idx }));

    for (const l of prepared) {
      if (l._deleted) continue;
      if (!String(l.description || '').trim()) {
        toast.error('Each line needs a description');
        return;
      }
      const qty = Number(l.quantity);
      const price = Number(l.unit_price);
      if (!Number.isFinite(qty) || qty < 0) {
        toast.error('Invalid quantity');
        return;
      }
      if (!Number.isFinite(price) || price < 0) {
        toast.error('Invalid unit price');
        return;
      }
    }

    setSavingLines(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) throw new Error('Please login again');

      const apiBase = import.meta.env.VITE_API_BASE_URL?.trim() || '';
      const resp = await fetch(`${apiBase}/api/service-documents/lines/upsert`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          documentId: doc.id,
          materialCost: materialCost.trim() === '' ? null : Number(materialCost),
          lines: prepared.map((l) => ({
            id: l.id,
            position: l.position,
            inventory_item_id: l.inventory_item_id ?? null,
            description: l.description,
            quantity: Number(l.quantity),
            unit_price: Number(l.unit_price),
            unit_cost: Number(l.unit_cost ?? 0),
            taxable: l.taxable !== false,
            deleted: l._deleted === true,
          })),
        }),
      });

      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.ok) throw new Error(json?.error || 'Could not save lines');

      if (json?.document) setDoc((prev) => (prev ? { ...prev, ...json.document } : json.document));
      if (json?.document?.material_cost !== undefined) setMaterialCost(String(json.document.material_cost ?? ''));
      if (Array.isArray(json?.lines)) {
        setLines((json.lines as any[]).map((x, idx) => ({
          id: x.id,
          position: idx,
          inventory_item_id: x.inventory_item_id ?? null,
          description: String(x.description ?? ''),
          quantity: Number(x.quantity ?? 1),
          unit_price: Number(x.unit_price ?? 0),
          unit_cost: Number(x.unit_cost ?? 0),
          taxable: x.taxable === false ? false : true,
          line_total: Number(x.line_total ?? 0),
        })));
      }

      toast.success('Lines saved');
    } catch (e: any) {
      toast.error(e?.message || 'Could not save lines');
    } finally {
      setSavingLines(false);
    }
  };

  const recalc = async () => {
    if (!doc?.id) return;
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) throw new Error('Please login again');

      const apiBase = import.meta.env.VITE_API_BASE_URL?.trim() || '';
      const resp = await fetch(`${apiBase}/api/service-documents/recalculate`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ documentId: doc.id }),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.ok) throw new Error(json?.error || 'Could not recalculate');
      setDoc((prev) => (prev ? { ...prev, ...json.document } : json.document));
    } catch (e: any) {
      toast.error(e?.message || 'Could not recalculate');
    }
  };

  const send = async () => {
    if (!doc?.id) return;
    const toEmail = clientEmail.trim();
    if (!toEmail && flowStatus === 'Draft') {
      toast.error('Client email is required to send');
      return;
    }

    setSending(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) throw new Error('Please login again');

      const apiBase = import.meta.env.VITE_API_BASE_URL?.trim() || '';
      const resp = await fetch(`${apiBase}/api/service-documents/send`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ documentId: doc.id, toEmail }),
      });

      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.ok) throw new Error(json?.error || 'Could not send');

      setLatestSendLink(json?.link ? String(json.link) : null);

      const emailed = Boolean(json?.emailed);
      toast.success(emailed ? 'Email sent' : 'Link generated');

      if (json?.link) {
        try {
          await navigator.clipboard.writeText(String(json.link));
          toast.success('Link copied to clipboard');
        } catch {}
      }

      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Could not send');
    } finally {
      setSending(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-8 bg-[#F4ECDC] min-h-screen rounded-[32px] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <button
              className="inline-flex items-center gap-2 text-sm font-semibold text-[#7A705A] hover:text-[#2F3D2E]"
              onClick={() => navigate('/service-documents')}
            >
              <i className="ri-arrow-left-line" />
              <span>Back</span>
            </button>
            <h1 className="text-3xl font-semibold text-[#2F3D2E] mt-2">{safeDocTitle}</h1>
            <div className="mt-1 text-sm text-[#5F6652]">Status: {flowStatus || '-'}</div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                setShowClientModal(true);
              }}
              className={SECONDARY_BUTTON_CLASSES}
              disabled={!doc?.id || loading || !canEdit}
            >
              <i className="ri-user-line" />
              <span>Client</span>
            </button>
            <button
              onClick={() => setShowLinesModal(true)}
              className={SECONDARY_BUTTON_CLASSES}
              disabled={!doc?.id || loading || !canEdit}
            >
              <i className="ri-list-check" />
              <span>Items</span>
            </button>
            <button onClick={recalc} className={TERTIARY_BUTTON_CLASSES} disabled={loading || !doc?.id}>
              <i className="ri-refresh-line" />
              <span>Recalculate</span>
            </button>
            <button
              onClick={() => {
                setLatestSendLink(null);
                setShowSendModal(true);
              }}
              className={PRIMARY_BUTTON_CLASSES}
              disabled={
                loading ||
                sending ||
                !doc?.id ||
                doc?.sealed_at != null ||
                flowStatus === 'Sealed' ||
                flowStatus === 'Voided' ||
                flowStatus === 'Expired' ||
                (flowStatus !== 'Draft' && flowStatus !== 'Sent')
              }
            >
              <i className="ri-send-plane-2-line" />
              <span>{sending ? 'Sending...' : flowStatus === 'Draft' ? 'Send' : 'Get Link'}</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className={`${BASE_CARD_CLASSES} p-6`}>Loading...</div>
        ) : !doc ? (
          <div className={`${BASE_CARD_CLASSES} p-6 text-[#B9583C]`}>Not found</div>
        ) : (
          <>
            <div className={`${BASE_CARD_CLASSES} p-6`}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-[#7A705A] tracking-[0.18em] uppercase">Client</div>
                  <div className="text-xl font-semibold text-[#2F3D2E] mt-1">{clientName || '-'}</div>
                  <div className="text-sm text-[#5F6652] mt-2">
                    {clientEmail ? <div>{clientEmail}</div> : null}
                    {clientPhone ? <div>{clientPhone}</div> : null}
                    {clientAddress ? <div>{clientAddress}</div> : null}
                  </div>
                </div>
                <div className="text-sm text-[#2F3D2E]">
                  <div className="flex justify-end gap-10">
                    <div className="text-right text-[#7A705A]">
                      <div>Subtotal</div>
                      <div>Tax</div>
                      <div className="font-semibold text-[#2F3D2E]">Total</div>
                      {Number(doc?.material_cost ?? 0) > 0 && <div className="mt-1 text-xs">Material Cost</div>}
                    </div>
                    <div className="text-right">
                      <div>{Number(computedSubtotal ?? 0).toFixed(2)}</div>
                      <div>{Number(computedTax ?? 0).toFixed(2)}</div>
                      <div className="font-semibold">{Number(computedTotal ?? 0).toFixed(2)}</div>
                      {Number(doc?.material_cost ?? 0) > 0 && <div className="mt-1 text-xs">{Number(doc.material_cost).toFixed(2)}</div>}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className={`${BASE_CARD_CLASSES} overflow-hidden`}>
              <div className="px-6 py-5 border-b border-[#D9C8A9] bg-[#FFF9EE] flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <div className="text-lg font-semibold text-[#2F3D2E]">Items</div>
                  <div className="text-sm text-[#7A705A]">Manage line items and pricing.</div>
                </div>
                <button
                  onClick={() => setShowLinesModal(true)}
                  className={SECONDARY_BUTTON_CLASSES}
                  disabled={!canEdit}
                >
                  <i className="ri-edit-line" />
                  <span>Edit Items</span>
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-[#F8F1E3]">
                    <tr>
                      <th className={TABLE_HEADER_CLASSES}>Description</th>
                      <th className={`${TABLE_HEADER_CLASSES} text-right`}>Qty</th>
                      <th className={`${TABLE_HEADER_CLASSES} text-right`}>Unit</th>
                      <th className={`${TABLE_HEADER_CLASSES} text-right`}>Amount</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-[#EADDC4]">
                    {lines.filter((l) => !l._deleted).length === 0 ? (
                      <tr>
                        <td className={`${TABLE_CELL_CLASSES} py-6 text-[#7A705A]`} colSpan={4}>No items yet.</td>
                      </tr>
                    ) : (
                      lines.filter((l) => !l._deleted).map((l, idx) => (
                        <tr key={l.id || idx} className="hover:bg-[#FFF7E8] transition">
                          <td className={TABLE_CELL_CLASSES}>{l.description}</td>
                          <td className={`${TABLE_CELL_CLASSES} text-right`}>{Number(l.quantity ?? 0)}</td>
                          <td className={`${TABLE_CELL_CLASSES} text-right`}>{Number(l.unit_price ?? 0).toFixed(2)}</td>
                          <td className={`${TABLE_CELL_CLASSES} text-right font-semibold`}>{Number(computeLineAmount(l) ?? 0).toFixed(2)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className={`${BASE_CARD_CLASSES} p-6`}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-lg font-semibold text-[#2F3D2E]">Signatures</h2>
                  <p className="text-sm text-[#7A705A] mt-1">
                    Viewed: {doc.viewed_at ? new Date(doc.viewed_at).toLocaleString() : '-'}
                    <br />
                    Client signed: {doc.client_signed_at ? new Date(doc.client_signed_at).toLocaleString() : '-'}
                    <br />
                    Contractor signed: {doc.contractor_signed_at ? new Date(doc.contractor_signed_at).toLocaleString() : '-'}
                    <br />
                    Sealed: {doc.sealed_at ? new Date(doc.sealed_at).toLocaleString() : '-'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {sealedPdfUrl ? (
                    <a
                      href={sealedPdfUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={TERTIARY_BUTTON_CLASSES}
                    >
                      Download Sealed PDF
                    </a>
                  ) : null}
                  <button
                    onClick={sealAgreement}
                    className={withDisabledStyle(PRIMARY_BUTTON_CLASSES, !canSeal || sealing)}
                    disabled={!canSeal || sealing}
                  >
                    <i className="ri-lock-line" />
                    <span>{sealing ? 'Sealing...' : 'Seal Agreement'}</span>
                  </button>
                </div>
              </div>

              {!canSeal && (flowStatus === 'Draft' || flowStatus === 'Sent' || flowStatus === 'ClientSigned') ? (
                <div className="mt-3 text-sm text-[#7A705A]">
                  To seal, the client must sign first, then the contractor must sign.
                </div>
              ) : null}

              <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="border border-[#EADDC4] rounded-2xl p-4 bg-white">
                  <div className="text-sm font-semibold text-[#2F3D2E]">Client</div>
                  <div className="text-xs text-[#7A705A] mt-1">
                    {signature?.client_name ? `Name: ${signature.client_name}` : 'Name: -'}
                    <br />
                    {signature?.client_signed_at ? `Signed: ${new Date(signature.client_signed_at).toLocaleString()}` : 'Signed: -'}
                  </div>
                  {signature?.client_signature_image ? (
                    <img
                      src={signature.client_signature_image}
                      alt="Client signature"
                      className="mt-3 w-full max-w-sm h-24 object-contain bg-white border border-[#EADDC4] rounded-lg"
                    />
                  ) : (
                    <div className="mt-3 text-sm text-[#7A705A]">Not signed</div>
                  )}
                </div>

                <div className="border border-[#EADDC4] rounded-2xl p-4 bg-white">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="text-sm font-semibold text-[#2F3D2E]">Contractor</div>
                      <div className="text-xs text-[#7A705A] mt-1">
                        {signature?.contractor_name ? `Name: ${signature.contractor_name}` : 'Name: -'}
                        <br />
                        {signature?.contractor_signed_at ? `Signed: ${new Date(signature.contractor_signed_at).toLocaleString()}` : 'Signed: -'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {flowStatus !== 'ClientSigned' ? (
                        <div className="hidden md:block text-xs text-[#7A705A] mr-2">
                          Available after client signs
                        </div>
                      ) : null}
                      <button
                        onClick={applyDefaultContractorSignature}
                        className={withDisabledStyle(TERTIARY_BUTTON_CLASSES, !canContractorSign || applyingDefaultSig)}
                        disabled={!canContractorSign || applyingDefaultSig}
                      >
                        <i className="ri-quill-pen-line" />
                        <span>{applyingDefaultSig ? 'Applying...' : 'Apply Default'}</span>
                      </button>
                      <button
                        onClick={() => setShowContractorSignModal(true)}
                        className={withDisabledStyle(TERTIARY_BUTTON_CLASSES, !canContractorSign)}
                        disabled={!canContractorSign}
                      >
                        <i className="ri-edit-2-line" />
                        <span>Manual Sign</span>
                      </button>
                    </div>
                  </div>
                  {signature?.contractor_signature_image ? (
                    <img
                      src={signature.contractor_signature_image}
                      alt="Contractor signature"
                      className="mt-3 w-full max-w-sm h-24 object-contain bg-white border border-[#EADDC4] rounded-lg"
                    />
                  ) : (
                    <div className="mt-3 text-sm text-[#7A705A]">Not signed</div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {showClientModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className={`${BASE_CARD_CLASSES} w-full max-w-3xl p-6`}>
            <div className="flex items-center justify-between border-b border-[#D9C8A9] pb-4 mb-4">
              <div>
                <h3 className="text-xl font-semibold text-[#2F3D2E]">Client & Terms</h3>
                <p className="text-sm text-[#7A705A]">Update client info, tax rate, and terms.</p>
              </div>
              <button
                onClick={() => setShowClientModal(false)}
                className="text-[#7A705A] hover:text-[#3C4F3C]"
                disabled={savingHeader}
              >
                <i className="ri-close-line text-xl" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#5F6652] mb-1">Client name</label>
                <input value={clientName} onChange={(e) => setClientName(e.target.value)} className={INPUT_CLASSES} />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#5F6652] mb-1">Client email</label>
                <input value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} className={INPUT_CLASSES} />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#5F6652] mb-1">Client phone</label>
                <input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} className={INPUT_CLASSES} />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#5F6652] mb-1">Tax rate</label>
                <input value={taxRate} onChange={(e) => setTaxRate(e.target.value)} className={INPUT_CLASSES} placeholder="0.18" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-[#5F6652] mb-1">Client address</label>
                <input value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} className={INPUT_CLASSES} />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#5F6652] mb-1">City</label>
                <input value={clientCity} onChange={(e) => setClientCity(e.target.value)} className={INPUT_CLASSES} />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#5F6652] mb-1">State</label>
                <input value={clientState} onChange={(e) => setClientState(e.target.value)} className={INPUT_CLASSES} />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-[#5F6652] mb-1">ZIP</label>
                <input value={clientZip} onChange={(e) => setClientZip(e.target.value)} className={INPUT_CLASSES} />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-[#5F6652] mb-1">Terms snapshot</label>
                <textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={6} className={INPUT_CLASSES} />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-[#D9C8A9] mt-6">
              <button
                onClick={() => setShowClientModal(false)}
                className={SECONDARY_BUTTON_CLASSES}
                disabled={savingHeader}
              >
                <i className="ri-close-line" />
                <span>Close</span>
              </button>
              <button
                onClick={async () => {
                  await saveHeader();
                }}
                className={PRIMARY_BUTTON_CLASSES}
                disabled={!canEdit || !headerDirty || savingHeader}
              >
                <i className="ri-save-3-line" />
                <span>{savingHeader ? 'Saving...' : 'Save'}</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showLinesModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className={`${BASE_CARD_CLASSES} w-full max-w-5xl p-6`}>
            <div className="flex items-center justify-between border-b border-[#D9C8A9] pb-4 mb-4">
              <div>
                <h3 className="text-xl font-semibold text-[#2F3D2E]">Items</h3>
                <p className="text-sm text-[#7A705A]">Add, edit, or remove line items.</p>
              </div>
              <button
                onClick={() => setShowLinesModal(false)}
                className="text-[#7A705A] hover:text-[#3C4F3C]"
                disabled={savingLines}
              >
                <i className="ri-close-line text-xl" />
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <button onClick={addLine} className={SECONDARY_BUTTON_CLASSES} disabled={!canEdit}>
                <i className="ri-add-line" />
                <span>Add line</span>
              </button>
              <div className="text-sm text-[#7A705A]">Subtotal/Tax/Total update after Save or Recalculate.</div>
            </div>

            <div className="mt-4 overflow-x-auto bg-white border border-[#EADDC4] rounded-2xl">
              <table className="w-full text-sm">
                <thead className="bg-[#F8F1E3]">
                  <tr>
                    <th className={TABLE_HEADER_CLASSES}>Description</th>
                    <th className={`${TABLE_HEADER_CLASSES} text-right`}>Qty</th>
                    <th className={`${TABLE_HEADER_CLASSES} text-right`}>Unit price</th>
                    <th className={`${TABLE_HEADER_CLASSES} text-center`}>Taxable</th>
                    <th className={`${TABLE_HEADER_CLASSES} text-right`}>Line total</th>
                    <th className={`${TABLE_HEADER_CLASSES} text-right`}></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EADDC4]">
                  {lines.filter((l) => !l._deleted).length === 0 ? (
                    <tr>
                      <td className="px-6 py-6 text-[#7A705A]" colSpan={6}>No lines.</td>
                    </tr>
                  ) : (
                    lines.map((l, idx) =>
                      l._deleted ? null : (
                        <tr key={l.id || idx}>
                          <td className="px-6 py-3 relative">
                            <input
                              value={activeSearchIdx === idx ? searchQuery : l.description}
                              onChange={(e) => {
                                if (activeSearchIdx === idx) {
                                  setSearchQuery(e.target.value);
                                }
                                updateLine(idx, { description: e.target.value, inventory_item_id: null });
                              }}
                              onFocus={() => {
                                setActiveSearchIdx(idx);
                                setSearchQuery(l.description);
                              }}
                              onBlur={() => {
                                setTimeout(() => {
                                  setActiveSearchIdx((prev) => (prev === idx ? null : prev));
                                }, 200);
                              }}
                              className={INPUT_CLASSES}
                              disabled={!canEdit}
                              placeholder="Type or search product..."
                              autoComplete="off"
                            />
                            {activeSearchIdx === idx && filteredInventory.length > 0 && (
                              <div className="absolute left-6 right-6 top-full z-50 bg-white border border-[#D9C8A9] rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                {filteredInventory.map((item) => (
                                  <button
                                    key={item.id}
                                    type="button"
                                    className="w-full text-left px-3 py-2 hover:bg-[#F8F1E3] text-sm flex justify-between items-center gap-2"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      selectInventoryItem(idx, item);
                                    }}
                                  >
                                    <span className="truncate font-medium text-[#2F3D2E]">{item.name}</span>
                                    <span className="text-xs text-[#7A705A] whitespace-nowrap">
                                      {item.sku ? `${item.sku} · ` : ''}{Number(item.selling_price ?? 0).toFixed(2)}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-3 text-right">
                            <input
                              value={String(l.quantity)}
                              onChange={(e) => updateLine(idx, { quantity: Number(e.target.value) })}
                              className={`${INPUT_CLASSES} w-24 text-right`}
                              disabled={!canEdit}
                            />
                          </td>
                          <td className="px-6 py-3 text-right">
                            <input
                              value={String(l.unit_price)}
                              onChange={(e) => updateLine(idx, { unit_price: Number(e.target.value) })}
                              className={`${INPUT_CLASSES} w-32 text-right`}
                              disabled={!canEdit}
                            />
                          </td>
                          <td className="px-6 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={l.taxable !== false}
                              onChange={(e) => updateLine(idx, { taxable: e.target.checked })}
                              disabled={!canEdit}
                            />
                          </td>
                          <td className="px-6 py-3 text-right font-semibold text-[#2F3D2E]">
                            {Number(computeLineAmount(l) ?? 0).toFixed(2)}
                          </td>
                          <td className="px-6 py-3 text-right">
                            <button
                              onClick={() => markDeleteLine(idx)}
                              className={TERTIARY_BUTTON_CLASSES}
                              disabled={!canEdit}
                            >
                              <i className="ri-delete-bin-line" />
                              <span>Remove</span>
                            </button>
                          </td>
                        </tr>
                      )
                    )
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex justify-end text-sm text-[#2F3D2E]">
              <div className="bg-white border border-[#EADDC4] rounded-2xl px-4 py-3 min-w-[280px]">
                <div className="flex justify-between gap-6">
                  <div className="text-[#7A705A]">Subtotal</div>
                  <div className="font-semibold">{Number(computedSubtotal ?? 0).toFixed(2)}</div>
                </div>
                <div className="flex justify-between gap-6 mt-1">
                  <div className="text-[#7A705A]">Tax</div>
                  <div className="font-semibold">{Number(computedTax ?? 0).toFixed(2)}</div>
                </div>
                <div className="flex justify-between gap-6 mt-1 items-center">
                  <div className="text-[#7A705A]">Material Cost</div>
                  <input
                    value={materialCost}
                    onChange={(e) => setMaterialCost(e.target.value)}
                    className={`${INPUT_CLASSES} w-32 text-right`}
                    disabled={!canEdit || savingLines}
                  />
                </div>
                <div className="flex justify-between gap-6 mt-2 pt-2 border-t border-[#EADDC4]">
                  <div className="text-[#2F3D2E] font-semibold">Total</div>
                  <div className="font-semibold">{Number(computedTotal ?? 0).toFixed(2)}</div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-[#D9C8A9] mt-6">
              <button onClick={() => setShowLinesModal(false)} className={SECONDARY_BUTTON_CLASSES} disabled={savingLines}>
                <i className="ri-close-line" />
                <span>Close</span>
              </button>
              <button onClick={saveLines} className={PRIMARY_BUTTON_CLASSES} disabled={!canEdit || savingLines}>
                <i className="ri-save-3-line" />
                <span>{savingLines ? 'Saving...' : 'Save Items'}</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showSendModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className={`${BASE_CARD_CLASSES} w-full max-w-xl p-6`}>
            <div className="flex items-center justify-between border-b border-[#D9C8A9] pb-4 mb-4">
              <div>
                <h3 className="text-xl font-semibold text-[#2F3D2E]">Send</h3>
                <p className="text-sm text-[#7A705A]">
                  {flowStatus === 'Draft'
                    ? 'Send an email to the client with a link to review & sign.'
                    : 'Generate a new link (no email will be sent).'}
                </p>
              </div>
              <button
                onClick={() => setShowSendModal(false)}
                className="text-[#7A705A] hover:text-[#3C4F3C]"
                disabled={sending}
              >
                <i className="ri-close-line text-xl" />
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#5F6652] mb-1">To email</label>
              <input
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                className={INPUT_CLASSES}
                disabled={sending || flowStatus !== 'Draft'}
              />
            </div>

            {latestSendLink ? (
              <div className="mt-4">
                <div className="text-sm font-semibold text-[#2F3D2E]">Link</div>
                <div className="mt-2 p-3 rounded-xl bg-white border border-[#EADDC4] text-sm text-[#2F3D2E] break-all">
                  {latestSendLink}
                </div>
                <div className="mt-2 flex justify-end">
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(String(latestSendLink));
                        toast.success('Link copied to clipboard');
                      } catch {
                        toast.error('Could not copy link');
                      }
                    }}
                    className={TERTIARY_BUTTON_CLASSES}
                  >
                    <i className="ri-file-copy-line" />
                    <span>Copy</span>
                  </button>
                </div>
              </div>
            ) : null}

            <div className="flex justify-end gap-3 pt-4 border-t border-[#D9C8A9] mt-6">
              <button onClick={() => setShowSendModal(false)} className={SECONDARY_BUTTON_CLASSES} disabled={sending}>
                <i className="ri-close-line" />
                <span>Close</span>
              </button>
              <button onClick={send} className={PRIMARY_BUTTON_CLASSES} disabled={sending}>
                <i className="ri-send-plane-2-line" />
                <span>{sending ? 'Sending...' : flowStatus === 'Draft' ? 'Send' : 'Get Link'}</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showContractorSignModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white border border-gray-200 rounded-xl w-full max-w-xl p-6">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold text-gray-900">Contractor Signature</div>
              <button
                onClick={() => setShowContractorSignModal(false)}
                className="text-gray-500 hover:text-gray-800"
                disabled={contractorSigning}
              >
                <i className="ri-close-line text-xl" />
              </button>
            </div>

            {contractorSignError ? (
              <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{contractorSignError}</div>
            ) : null}

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Contractor name (optional)</label>
              <input
                value={contractorNameInput}
                onChange={(e) => setContractorNameInput(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                disabled={contractorSigning}
              />
            </div>

            <div className="mt-4">
              <div ref={contractorContainerRef} className="w-full">
                <canvas
                  ref={contractorCanvasRef}
                  onPointerDown={onContractorPointerDown}
                  onPointerMove={onContractorPointerMove}
                  onPointerUp={onContractorPointerUp}
                  className="border border-gray-300 rounded-lg bg-white w-full touch-none"
                />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <button
                  onClick={clearContractorSignature}
                  className="px-3 py-2 rounded-lg bg-white border border-gray-300 hover:bg-gray-50 text-sm"
                  disabled={contractorSigning}
                >
                  Clear
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowContractorSignModal(false)}
                    className="px-3 py-2 rounded-lg bg-white border border-gray-300 hover:bg-gray-50 text-sm"
                    disabled={contractorSigning}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitContractorSignature}
                    className="px-4 py-2 rounded-lg bg-[#008000] hover:bg-[#006B00] text-white font-semibold"
                    disabled={contractorSigning}
                  >
                    {contractorSigning ? 'Submitting...' : 'Submit Signature'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </DashboardLayout>
  );
}
