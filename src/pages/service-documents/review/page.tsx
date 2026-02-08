import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useParams } from 'react-router-dom';

import { formatNumber, getCurrencyPrefix } from '../../../utils/numberFormat';

type PublicServiceDocument = {
  id: string;
  doc_type: 'JOB_ESTIMATE' | 'CLASSIC_INVOICE';
  status: string;
  doc_number: string;
  currency: string;
  company_name: string | null;
  company_rnc: string | null;
  company_phone: string | null;
  company_email: string | null;
  company_address: string | null;
  company_logo: string | null;
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
  created_at: string;
  updated_at: string;
};

type PublicServiceLine = {
  id: string;
  position: number;
  description: string;
  quantity: number;
  unit_price: number;
  taxable: boolean;
  line_total: number;
};

type PublicSignature = {
  client_name: string | null;
  client_signature_image: string | null;
  client_signed_at: string | null;
  contractor_name: string | null;
  contractor_signature_image: string | null;
  contractor_signed_at: string | null;
};

function safeTypeLabel(docType: string) {
  return docType === 'JOB_ESTIMATE' ? 'Job Estimate' : 'Invoice';
}

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

function formatInSantoDomingo(raw?: string | null) {
  if (!raw) return '';
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZone: 'America/Santo_Domingo',
    }).format(d);
  } catch {
    const shifted = new Date(d.getTime() - 4 * 60 * 60 * 1000);
    const mm = String(shifted.getUTCMonth() + 1);
    const dd = String(shifted.getUTCDate());
    const yyyy = String(shifted.getUTCFullYear());
    let hh = shifted.getUTCHours();
    const min = String(shifted.getUTCMinutes()).padStart(2, '0');
    const sec = String(shifted.getUTCSeconds()).padStart(2, '0');
    const ampm = hh >= 12 ? 'PM' : 'AM';
    hh = hh % 12;
    if (hh === 0) hh = 12;
    return `${mm}/${dd}/${yyyy}, ${hh}:${min}:${sec} ${ampm}`;
  }
}

export default function ServiceDocumentsReviewPage() {
  const { token } = useParams();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [doc, setDoc] = useState<PublicServiceDocument | null>(null);
  const [lines, setLines] = useState<PublicServiceLine[]>([]);
  const [signature, setSignature] = useState<PublicSignature | null>(null);

  const [clientName, setClientName] = useState('');
  const [signedOk, setSignedOk] = useState(false);
  const [localSignaturePreview, setLocalSignaturePreview] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const drawingRef = useRef({ active: false, lastX: 0, lastY: 0 });

  const currency = doc?.currency || 'USD';
  const money = useCallback(
    (value: number) => {
      const prefix = getCurrencyPrefix(currency);
      const formatted = formatNumber(value) || '';
      return prefix ? `${prefix} ${formatted}` : formatted;
    },
    [currency],
  );

  const normalizedTaxRate = useMemo(() => {
    const raw = Number(doc?.tax_rate ?? 0);
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    // Some installations store 18 for 18%, others store 0.18.
    return raw > 1 ? raw / 100 : raw;
  }, [doc?.tax_rate]);

  const computedSubtotal = useMemo(() => {
    return (lines || []).reduce((sum, l) => sum + Number(l.line_total ?? 0), 0);
  }, [lines]);

  const computedTax = useMemo(() => {
    return (lines || []).reduce((sum, l) => {
      const taxable = l.taxable !== false;
      if (!taxable) return sum;
      return sum + Number(l.line_total ?? 0) * normalizedTaxRate;
    }, 0);
  }, [lines, normalizedTaxRate]);

  const computedMaterialCost = useMemo(() => {
    const n = Number(doc?.material_cost ?? 0);
    return Number.isFinite(n) ? n : 0;
  }, [doc?.material_cost]);

  const computedTotal = useMemo(
    () => computedSubtotal + computedTax + computedMaterialCost,
    [computedMaterialCost, computedSubtotal, computedTax]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setDoc(null);
    setLines([]);
    setSignature(null);
    setSignedOk(false);
    setLocalSignaturePreview(null);

    if (!token) {
      setError('Invalid link.');
      setLoading(false);
      return;
    }

    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL?.trim() || '';
      const resp = await fetch(`${apiBase}/api/service-documents/public/get`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: String(token) }),
      });

      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.ok) {
        throw new Error(parseErrorMessage(json));
      }

      const d = json.document as PublicServiceDocument;
      const l = (Array.isArray(json.lines) ? json.lines : []) as PublicServiceLine[];
      const s = (json.signature || null) as PublicSignature | null;

      setDoc(d);
      setLines(l);
      setSignature(s);
      setClientName(String(d?.client_name || ''));
    } catch (e: any) {
      setError(e?.message || 'Could not load document');
    } finally {
      setLoading(false);
    }
  }, [token]);

  const configureCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
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
    load();
  }, [load]);

  useEffect(() => {
    configureCanvas();

    const onResize = () => configureCanvas();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [configureCanvas]);

  const hasClientSignatureEvidence = useMemo(() => {
    return Boolean(doc?.client_signed_at || signature?.client_signature_image || localSignaturePreview);
  }, [doc?.client_signed_at, signature?.client_signature_image, localSignaturePreview]);

  const canSign = useMemo(() => {
    if (!doc) return false;
    const st = String(doc.status || '');
    if (st === 'Sealed' || st === 'Voided' || st === 'Expired') return false;
    if (st === 'ClientSigned' && hasClientSignatureEvidence) return false;
    return !hasClientSignatureEvidence;
  }, [doc, hasClientSignatureEvidence]);

  const isSigned = useMemo(() => {
    if (!doc) return false;
    const st = String(doc.status || '');
    if (st === 'ClientSigned') return hasClientSignatureEvidence;
    return Boolean(signedOk || doc.client_signed_at);
  }, [doc, signedOk, hasClientSignatureEvidence]);

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    drawingRef.current = { active: true, lastX: x, lastY: y };
    canvas.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { active, lastX, lastY } = drawingRef.current;
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

    drawingRef.current.lastX = x;
    drawingRef.current.lastY = y;
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    drawingRef.current.active = false;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {}
  };

  const clearSignature = () => {
    configureCanvas();
    setLocalSignaturePreview(null);
  };

  const submitSignature = async () => {
    if (!token) return;

    const name = clientName.trim();
    if (!name) {
      setError('Please enter your name.');
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      setError('Signature pad not available.');
      return;
    }

    if (isCanvasBlank(canvas)) {
      setError('Please sign in the box before submitting.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL?.trim() || '';
      const signatureBase64 = canvas.toDataURL('image/png');

      const resp = await fetch(`${apiBase}/api/service-documents/public/sign`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token: String(token),
          clientName: name,
          signature_image_base64: signatureBase64,
        }),
      });

      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.ok) {
        throw new Error(parseErrorMessage(json));
      }

      setSignedOk(true);
      setLocalSignaturePreview(signatureBase64);
      setDoc((prev) => (prev ? { ...prev, status: 'ClientSigned', client_signed_at: new Date().toISOString() } : prev));
      setSignature((prev) => ({
        client_name: name,
        client_signature_image: signatureBase64,
        client_signed_at: new Date().toISOString(),
        contractor_name: prev?.contractor_name ?? null,
        contractor_signature_image: prev?.contractor_signature_image ?? null,
        contractor_signed_at: prev?.contractor_signed_at ?? null,
      }));
    } catch (e: any) {
      setError(e?.message || 'Could not submit signature');
    } finally {
      setSubmitting(false);
    }
  };

  const title = useMemo(() => {
    if (!doc) return 'Review & Sign';
    const typeLabel = safeTypeLabel(doc.doc_type);
    return `${typeLabel}${doc.doc_number ? ` ${doc.doc_number}` : ''}`;
  }, [doc]);

  return (
    <div className="min-h-screen" style={{ background: '#0b1220' }}>
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-4xl rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
          <div
            className="px-6 py-5"
            style={{
              background:
                'radial-gradient(circle at 20% 20%, rgba(34,197,94,0.45), rgba(34,197,94,0.0) 55%), linear-gradient(135deg, rgba(15,23,42,0.96), rgba(2,132,199,0.45))',
            }}
          >
            <div className="text-2xl font-semibold text-white">Review & Sign</div>
            <div className="text-sm text-white/80 mt-1">{title}</div>
          </div>

          <div className="bg-white p-6">
            {loading ? <div className="text-gray-600 text-sm">Loading...</div> : null}
            {error ? (
              <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
            ) : null}

            {!loading && doc ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4">
                <div className="lg:col-span-2">
                  <div className="border border-gray-200 rounded-2xl overflow-hidden">
                    <div className="p-4 bg-gray-50 border-b border-gray-200">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                          <div className="text-sm text-gray-600">{safeTypeLabel(doc.doc_type)}</div>
                          <div className="text-lg font-semibold text-gray-900">{doc.doc_number}</div>
                          <div className="text-xs text-gray-500 mt-1">Status: {doc.status}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-gray-500">Total</div>
                          <div className="text-lg font-bold text-gray-900">{money(Number.isFinite(computedTotal) ? computedTotal : 0)}</div>
                        </div>
                      </div>
                    </div>

                    <div className="p-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="text-sm">
                          <div className="text-xs text-gray-500">From</div>
                          <div className="font-semibold text-gray-900">{doc.company_name || 'Company'}</div>
                          {doc.company_rnc ? <div className="text-gray-700">RNC: {doc.company_rnc}</div> : null}
                          {doc.company_phone ? <div className="text-gray-700">{doc.company_phone}</div> : null}
                          {doc.company_email ? <div className="text-gray-700">{doc.company_email}</div> : null}
                          {doc.company_address ? <div className="text-gray-700">{doc.company_address}</div> : null}
                        </div>
                        <div className="text-sm">
                          <div className="text-xs text-gray-500">To</div>
                          <div className="font-semibold text-gray-900">{doc.client_name}</div>
                          {doc.client_email ? <div className="text-gray-700">{doc.client_email}</div> : null}
                          {doc.client_phone ? <div className="text-gray-700">{doc.client_phone}</div> : null}
                          {doc.client_address ? <div className="text-gray-700">{doc.client_address}</div> : null}
                        </div>
                      </div>

                      <div className="mt-5 overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="text-left px-3 py-2 font-semibold text-gray-700">Description</th>
                              <th className="text-right px-3 py-2 font-semibold text-gray-700">Qty</th>
                              <th className="text-right px-3 py-2 font-semibold text-gray-700">Unit price</th>
                              <th className="text-right px-3 py-2 font-semibold text-gray-700">Line total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lines.length === 0 ? (
                              <tr>
                                <td colSpan={4} className="px-3 py-4 text-gray-600">No lines.</td>
                              </tr>
                            ) : (
                              lines.map((l) => (
                                <tr key={l.id} className="border-t border-gray-200">
                                  <td className="px-3 py-2 text-gray-900">{l.description}</td>
                                  <td className="px-3 py-2 text-right text-gray-700">{Number(l.quantity ?? 0)}</td>
                                  <td className="px-3 py-2 text-right text-gray-700">{money(Number(l.unit_price ?? 0))}</td>
                                  <td className="px-3 py-2 text-right text-gray-900">{money(Number(l.line_total ?? 0))}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>

                      <div className="mt-4 flex justify-end">
                        <div className="w-full max-w-sm text-sm">
                          <div className="flex justify-between py-1 text-gray-700">
                            <span>Subtotal</span>
                            <span className="text-gray-900">{money(Number.isFinite(computedSubtotal) ? computedSubtotal : 0)}</span>
                          </div>
                          <div className="flex justify-between py-1 text-gray-700">
                            <span>Tax</span>
                            <span className="text-gray-900">{money(Number.isFinite(computedTax) ? computedTax : 0)}</span>
                          </div>
                          <div className="flex justify-between py-1 text-gray-700">
                            <span>Material Cost</span>
                            <span className="text-gray-900">{money(Number.isFinite(computedMaterialCost) ? computedMaterialCost : 0)}</span>
                          </div>
                          <div className="flex justify-between py-2 border-t border-gray-200 font-bold text-gray-900">
                            <span>Total</span>
                            <span>{money(Number.isFinite(computedTotal) ? computedTotal : 0)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-5">
                        <div className="text-sm font-semibold text-gray-900">Terms</div>
                        <div className="mt-2 p-3 border border-gray-200 rounded-xl bg-gray-50 text-sm text-gray-800 whitespace-pre-wrap">
                          {String(doc.terms_snapshot || '').trim() || '—'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="border border-gray-200 rounded-2xl p-4">
                    <div className="text-lg font-semibold text-gray-900">Signature</div>
                    <div className="text-sm text-gray-600 mt-1">Please sign below to accept.</div>

                    {isSigned ? (
                      <div className="mt-4 p-3 rounded-xl bg-green-50 border border-green-200">
                        <div className="text-green-800 font-semibold text-sm">Signed</div>
                        <div className="text-green-700 text-xs mt-1">
                          {formatInSantoDomingo(doc.client_signed_at)}
                        </div>
                        {(signature?.client_signature_image || localSignaturePreview) ? (
                          <img
                            src={signature?.client_signature_image || localSignaturePreview || ''}
                            className="mt-3 w-full rounded-lg border border-green-200 bg-white"
                            alt="signature"
                          />
                        ) : null}
                      </div>
                    ) : null}

                    {canSign ? (
                      <>
                        <div className="mt-4">
                          <label className="block text-sm font-medium text-gray-700 mb-1">Your name</label>
                          <input
                            value={clientName}
                            onChange={(e) => setClientName(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            placeholder="Full name"
                          />
                        </div>

                        <div className="mt-4">
                          <label className="block text-sm font-medium text-gray-700 mb-2">Sign here</label>
                          <div ref={containerRef} className="w-full">
                            <canvas
                              ref={canvasRef}
                              className="w-full rounded-xl border border-gray-300 bg-white touch-none"
                              onPointerDown={onPointerDown}
                              onPointerMove={onPointerMove}
                              onPointerUp={onPointerUp}
                              onPointerCancel={onPointerUp}
                            />
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                            <button
                              onClick={clearSignature}
                              className="px-3 py-2 rounded-lg bg-white border border-gray-300 hover:bg-gray-50 text-sm"
                              type="button"
                            >
                              Clear
                            </button>
                          </div>
                        </div>

                        <button
                          onClick={submitSignature}
                          className="mt-4 w-full px-4 py-2 rounded-lg bg-[#008000] hover:bg-[#006B00] text-white font-semibold disabled:opacity-60"
                          disabled={submitting}
                          type="button"
                        >
                          {submitting ? 'Submitting...' : 'Submit signature'}
                        </button>

                        <div className="mt-3 text-xs text-gray-500">
                          By submitting, you confirm the information above and agree to the terms.
                        </div>
                      </>
                    ) : null}

                    {!canSign ? (
                      <div className="mt-4 p-3 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-700">
                        This document cannot be signed in its current state.
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
