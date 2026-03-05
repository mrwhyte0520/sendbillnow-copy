import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import QRCode from 'qrcode';

type CardPayload = {
  companyName?: string | null;
  companyLogo?: string | null;
  fullName?: string | null;
  department?: string | null;
  employeeId?: string | null;
  dob?: string | null;
  issueDate?: string | null;
  expiresDate?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  photoDataUrl?: string | null;
};

export default function PublicIdCardPage() {
  const { token } = useParams();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [payload, setPayload] = useState<CardPayload | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      setPayload(null);

      if (!token) {
        setError('Invalid card link.');
        setLoading(false);
        return;
      }

      try {
        const { data, error: rpcError } = await supabase.rpc('get_public_id_card_by_token', {
          card_token: String(token),
        });
        if (rpcError) throw rpcError;
        if (!data) {
          setError('Card not found or expired.');
          setLoading(false);
          return;
        }

        const parsed = data as any;
        const p = (parsed?.payload || null) as CardPayload | null;
        if (!p) {
          setError('Card not found or expired.');
          setLoading(false);
          return;
        }
        setPayload(p);
      } catch (e: any) {
        setError(e?.message || 'Could not load card');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  useEffect(() => {
    const run = async () => {
      if (!token) {
        setQrDataUrl('');
        return;
      }
      try {
        const url = `${window.location.origin}/public/id-card/${encodeURIComponent(String(token))}`;
        const qr = await QRCode.toDataURL(url, {
          margin: 0,
          width: 240,
          errorCorrectionLevel: 'M',
          color: { dark: '#0f172a', light: '#ffffff' },
        });
        setQrDataUrl(qr);
      } catch {
        setQrDataUrl('');
      }
    };
    void run();
  }, [token]);

  const buildHtml = () => {
    if (!payload) return '';

    const safe = (v: any) => String(v ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    }[c] as string));

    const companyName = safe(payload.companyName || 'Company');
    const logoHtml = payload.companyLogo
      ? `<img class="company-logo" src="${safe(payload.companyLogo)}" alt="logo" />`
      : '🏢';

    const photoHtml = payload.photoDataUrl
      ? `<img src="${safe(payload.photoDataUrl)}" alt="photo" />`
      : '👤';

    const qrImg = qrDataUrl
      ? `<img class="qr-img" src="${safe(qrDataUrl)}" alt="QR" />`
      : '▦▦▦<br/>▦▦▦<br/>▦▦▦';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ID Card</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; background: #f3f4f6; padding: 20px; }

    .print-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .card-container { display: block; }

    .id-card { width: 350px; height: 550px; background: white; border-radius: 22px; overflow: hidden; box-shadow: 0 18px 55px rgba(0,0,0,0.22); position: relative; border: 1px solid rgba(229,231,235,0.9); }
    .scale-wrap { width: 100%; height: 100%; position: relative; }
    .pattern { position: absolute; inset: 0; pointer-events: none; opacity: 0.10; background-image: radial-gradient(circle at 20px 20px, rgba(2,132,199,0.35) 1px, transparent 1px); background-size: 22px 22px; mix-blend-mode: multiply; }
    .accent-strip { position: absolute; left: 0; right: 0; bottom: 0; height: 10px; background: linear-gradient(90deg, #2563eb, #06b6d4, #22c55e); opacity: 0.95; }

    .wave-bg { position: absolute; width: 100%; height: 100%; overflow: hidden; }
    .wave { position: absolute; width: 200%; height: 200%; background: linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%); border-radius: 45%; }
    .wave-top { top: -120%; left: -50%; opacity: 0.1; }
    .wave-bottom { bottom: -120%; right: -50%; opacity: 0.15; }

    .card-front, .card-back { position: relative; z-index: 1; padding: 30px; height: 100%; display: flex; flex-direction: column; }
    .card-front { background: linear-gradient(to bottom, #1e293b 0%, #1e293b 35%, white 35%, white 100%); }
    .card-back { background: linear-gradient(180deg, #f0f9ff 0%, #ffffff 55%, #ffffff 100%); }

    .header { display: flex; align-items: center; gap: 14px; margin-bottom: 28px; }
    .logo { width: 60px; height: 60px; background: radial-gradient(circle at 30% 30%, rgba(255,255,255,0.18), rgba(255,255,255,0.0) 55%), linear-gradient(135deg, #3b82f6, #06b6d4); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 30px; color: white; overflow: hidden; box-shadow: 0 14px 30px rgba(59,130,246,0.22); border: 1px solid rgba(255,255,255,0.10); }
    .company-logo { width: 100%; height: 100%; object-fit: cover; display: block; }
    .hospital-name { color: white; font-weight: 800; font-size: 18px; line-height: 1.1; text-transform: uppercase; letter-spacing: 0.6px; max-width: 235px; }
    .card-back .hospital-name { color: #1e293b; }

    .photo-container { width: 180px; height: 180px; background: linear-gradient(135deg, #3b82f6, #06b6d4); border-radius: 30px; padding: 8px; margin: 0 auto 20px; box-shadow: 0 10px 30px rgba(59, 130, 246, 0.3); }
    .photo { width: 100%; height: 100%; background: #e5e7eb; border-radius: 25px; overflow: hidden; display: flex; align-items: center; justify-content: center; }
    .photo img { width: 100%; height: 100%; object-fit: cover; display: block; }

    .doctor-name { font-size: 30px; font-weight: 800; color: #0f172a; margin-bottom: 6px; text-align: center; letter-spacing: -0.5px; }
    .specialty { background: linear-gradient(135deg, #3b82f6, #06b6d4); color: white; padding: 8px 20px; border-radius: 20px; display: inline-block; font-size: 14px; font-weight: bold; text-transform: uppercase; margin: 0 auto 20px; }

    .info-table { width: 100%; margin-top: auto; padding-bottom: 44px; }
    .info-row { display: flex; border-bottom: 1px solid #e5e7eb; padding: 12px 0; }
    .info-label { font-weight: 700; color: #0f172a; width: 40%; font-size: 12px; text-transform: uppercase; letter-spacing: 0.6px; }
    .info-value { color: #334155; width: 60%; font-size: 14px; font-weight: 600; }

    .contact-info { margin-bottom: 30px; }
    .contact-row { display: flex; align-items: center; margin-bottom: 15px; padding-bottom: 15px; border-bottom: 2px solid #e5e7eb; }
    .contact-label { font-weight: bold; color: #1e293b; width: 100px; font-size: 14px; }
    .contact-value { color: #475569; font-size: 14px; flex: 1; }
    .contact-value.address-value {
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow-wrap: anywhere;
      word-break: break-word;
      white-space: normal;
    }

    .disclaimer { background: linear-gradient(135deg, #2563eb, #06b6d4); padding: 16px; border-radius: 16px; margin-bottom: 20px; box-shadow: 0 12px 30px rgba(37, 99, 235, 0.20); }
    .disclaimer-title { color: white; font-weight: bold; font-size: 16px; margin-bottom: 10px; text-transform: uppercase; }
    .disclaimer-text { color: white; font-size: 12px; line-height: 1.5; display: flex; align-items: start; gap: 10px; }
    .check-icon { width: 20px; height: 20px; background: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #3b82f6; font-weight: bold; flex-shrink: 0; }

    .signature-section { margin-top: auto; text-align: center; padding-top: 20px; border-top: 2px solid #1e293b; }
    .signature-label { font-weight: bold; color: #1e293b; font-size: 14px; text-transform: uppercase; }

    .footer { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: 12px; padding-top: 10px; border-top: 1px solid rgba(226,232,240,0.9); }
    .footer-text { font-size: 11px; color: #64748b; font-weight: 600; letter-spacing: 0.4px; }
    .microtext { font-size: 10px; color: #94a3b8; letter-spacing: 0.8px; text-transform: uppercase; }

    .qr-code { width: 60px; height: 60px; background: #0f172a; position: absolute; bottom: 18px; right: 18px; display: flex; align-items: center; justify-content: center; border-radius: 12px; font-size: 10px; color: white; border: 1px solid rgba(255,255,255,0.10); box-shadow: 0 14px 30px rgba(15,23,42,0.26); overflow: hidden; }
    .qr-code::after { content: ''; position: absolute; inset: 8px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.12); }
    .qr-img { width: 100%; height: 100%; object-fit: cover; display: block; }

    @media print {
      @page { margin: 10mm; }
      body { background: white !important; padding: 0 !important; margin: 0 !important; }
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      .print-page { page-break-after: always; break-after: page; }
      .print-page:last-child { page-break-after: auto; break-after: auto; }
      .id-card { box-shadow: none; transform: scale(1.25); transform-origin: center; }
    }
  </style>
</head>
<body>
  <div class="card-container">
    <div class="print-page">
      <div class="id-card">
        <div class="scale-wrap">
          <div class="pattern"></div>
          <div class="wave-bg"><div class="wave wave-top"></div><div class="wave wave-bottom"></div></div>
          <div class="card-front">
            <div class="header">
              <div class="logo">${logoHtml}</div>
              <div class="hospital-name">${companyName}<br/>ID CARD</div>
            </div>
            <div class="photo-container"><div class="photo">${photoHtml}</div></div>
            <div class="doctor-name">${safe(payload.fullName)}</div>
            <div class="specialty">${safe(payload.department)}</div>
            <div class="info-table">
              <div class="info-row"><div class="info-label">DOB:</div><div class="info-value">${safe(payload.dob)}</div></div>
              <div class="info-row"><div class="info-label">Employee ID:</div><div class="info-value">${safe(payload.employeeId)}</div></div>
              <div class="info-row"><div class="info-label">Issue:</div><div class="info-value">${safe(payload.issueDate)}</div></div>
            </div>
            <div style="position:absolute;left:0;right:0;bottom:0;height:34px;background:#1d4ed8;display:flex;align-items:center;padding:0 16px;color:#fff;font-weight:800;letter-spacing:0.8px;font-size:13px;text-transform:uppercase;">
              <div style="margin-left:auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">EXPIRES: ${safe(payload.expiresDate)}</div>
            </div>
            <div class="accent-strip"></div>
          </div>
        </div>
      </div>
    </div>

    <div class="print-page">
      <div class="id-card">
        <div class="scale-wrap">
          <div class="pattern"></div>
          <div class="wave-bg"><div class="wave wave-top"></div><div class="wave wave-bottom"></div></div>
          <div class="card-back">
            <div class="header">
              <div class="logo">${logoHtml}</div>
              <div class="hospital-name">${companyName}<br/>ID CARD</div>
            </div>
            <div class="contact-info">
              <div class="contact-row"><div class="contact-label">Phone:</div><div class="contact-value">${safe(payload.phone)}</div></div>
              <div class="contact-row"><div class="contact-label">Email:</div><div class="contact-value">${safe(payload.email)}</div></div>
              <div class="contact-row"><div class="contact-label">Address:</div><div class="contact-value address-value">${safe(payload.address)}</div></div>
            </div>
            <div class="disclaimer">
              <div class="disclaimer-title">Disclaimer:</div>
              <div class="disclaimer-text"><div class="check-icon">✓</div><div>This ID card is the property of the company and must be returned upon request or termination of employment.</div></div>
            </div>
            <div class="signature-section"><div class="signature-label">Authorized Signature</div></div>
            <div class="footer">
              <div class="footer-text">${safe((payload.companyName || 'company').toLowerCase().replace(/\s+/g, ''))}.com</div>
              <div class="microtext">Scan to verify</div>
            </div>
            <div class="qr-code">${qrImg}</div>
            <div class="accent-strip"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
  };

  const htmlStr = useMemo(() => buildHtml(), [payload, qrDataUrl]);

  const handlePrint = () => {
    if (!iframeRef.current) return;
    try {
      const win = iframeRef.current.contentWindow;
      if (!win) return;
      win.focus();
      win.print();
    } catch {
      // ignore
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto p-0 md:p-4 space-y-4">
        <div className="flex justify-end">
          <button
            onClick={handlePrint}
            disabled={!payload || !!error || loading}
            className="m-4 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            type="button"
          >
            Print
          </button>
        </div>

        {loading ? (
          <div className="bg-white border border-gray-200 rounded-lg p-6 text-sm text-gray-600">Loading...</div>
        ) : null}

        {error ? (
          <div className="bg-white border border-red-200 rounded-lg p-6 text-sm text-red-700">{error}</div>
        ) : null}

        {!loading && !error && payload ? (
          <div className="bg-white border border-gray-200 overflow-hidden">
            <iframe ref={iframeRef} title="public-id-card" className="w-full h-[90vh]" srcDoc={htmlStr} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
