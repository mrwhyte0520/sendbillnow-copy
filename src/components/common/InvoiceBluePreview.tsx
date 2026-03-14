import React from 'react';

type InvoiceBluePreviewItem = {
  id?: string;
  description: string;
  qty: number;
  price: number;
  total: number;
};

type InvoiceBluePreviewProps = {
  invoiceNumber: string;
  businessName: string;
  dateLabel: string;
  subtotal: string;
  tax: string;
  total: string;
  notes?: string | null;
  items: InvoiceBluePreviewItem[];
  accountNumber?: string | null;
  dueDateLabel?: string | null;
  createdBy?: string | null;
  companyName?: string | null;
  companyAddress?: string | null;
  companyPhone?: string | null;
  companyEmail?: string | null;
  companyWebsite?: string | null;
  companyLogo?: string | null;
  customerAddress?: string | null;
  customerEmail?: string | null;
  showCloseButton?: boolean;
  onClose?: () => void;
  footerActions?: React.ReactNode;
};

const clean = (value?: string | null) => String(value || '').trim();
const DEFAULT_INVOICE_LOGO = '/logo-invoice.png';

const addExtraZeroBeforeLastTwoDigits = (value?: string | null) => {
  const raw = clean(value);
  if (!raw) return '';
  if (raw.length < 3) return raw;

  const digitsOnly = raw.replace(/\D/g, '');
  if (digitsOnly.length < 3 || digitsOnly.length !== raw.length) return raw;

  return `${raw.slice(0, -2)}0${raw.slice(-2)}`;
};

export default function InvoiceBluePreview({
  invoiceNumber,
  businessName,
  dateLabel,
  subtotal,
  tax,
  total,
  notes,
  items,
  accountNumber,
  dueDateLabel,
  createdBy,
  companyName,
  companyAddress,
  companyPhone,
  companyEmail,
  companyWebsite,
  companyLogo,
  customerAddress,
  customerEmail,
  showCloseButton = true,
  onClose,
  footerActions,
}: InvoiceBluePreviewProps) {
  const normalizedItems = (items || []).map((item, index) => ({
    id: item.id || `${item.description}-${index}`,
    description: item.description || 'Item',
    qty: Number(item.qty) || 0,
    price: Number(item.price) || 0,
    total: Number(item.total) || 0,
  }));

  const safeNotes = clean(notes) || 'No notes added';
  const safeAddress = clean(customerAddress);
  const safeCustomerEmail = clean(customerEmail);
  const safeCompanyName = clean(companyName) || 'Company';
  const safeCompanyAddress = clean(companyAddress);
  const safeCompanyPhone = clean(companyPhone);
  const safeCompanyEmail = clean(companyEmail);
  const safeCompanyWebsite = clean(companyWebsite);
  const safeAccountNumber = addExtraZeroBeforeLastTwoDigits(accountNumber);
  const safeDueDate = clean(dueDateLabel);
  const safeCreatedBy = clean(createdBy);
  const displayInvoiceNumber = addExtraZeroBeforeLastTwoDigits(invoiceNumber);
  const safeProvidedLogo = clean(companyLogo);
  const resolvedCompanyLogo = safeProvidedLogo && safeProvidedLogo !== '/logo.png'
    ? safeProvidedLogo
    : DEFAULT_INVOICE_LOGO;

  return (
    <div className="w-full rounded-[28px] bg-white shadow-[0_20px_60px_rgba(15,23,42,0.14)] overflow-hidden border border-[#dbe2f1]">
      <div className="flex items-start justify-between gap-4 border-b border-[#e2e8f0] px-5 py-4 sm:px-7">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#1d4ed8]">Invoice Details</p>
          <h3 className="mt-2 text-[26px] font-extrabold tracking-tight text-[#0f172a]">{displayInvoiceNumber}</h3>
        </div>
        {showCloseButton && onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            Close
          </button>
        ) : null}
      </div>

      <div className="p-4 sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="h-[92px] w-[150px] overflow-hidden rounded-sm border border-[#dbe2f1] bg-slate-50">
              {resolvedCompanyLogo ? (
                <img src={resolvedCompanyLogo} alt="Company logo" className="h-full w-full object-contain bg-white" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-slate-100 text-sm font-semibold text-slate-400">
                  LOGO
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 text-center">
            <h2 className="mt-2 text-4xl font-black uppercase tracking-tight text-[#1436b3] underline decoration-[#1436b3] decoration-[3px] underline-offset-[6px] sm:text-6xl">
              Invoice
            </h2>
          </div>

          <div className="max-w-[320px] text-right text-[15px] leading-6 text-[#111827]">
            <div className="text-[18px] font-extrabold leading-6 text-[#111827]">{safeCompanyName}</div>
            {safeCompanyAddress ? <div>{safeCompanyAddress}</div> : null}
            {safeCompanyPhone ? <div className="text-[#1d4ed8] underline">{safeCompanyPhone}</div> : null}
            {safeCompanyEmail ? <div>{safeCompanyEmail}</div> : null}
            {safeCompanyWebsite ? <div>{safeCompanyWebsite}</div> : null}
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="relative overflow-hidden rounded-[24px] border border-[#e5ecfb] bg-gradient-to-br from-[#eef3ff] to-white px-6 py-7 lg:min-h-[210px] lg:w-[48%]">
            <div className="absolute -left-14 top-4 h-[240px] w-[240px] rounded-full bg-[#dfe9ff] opacity-80" />
            <div className="relative z-10 max-w-[260px] text-[15px] leading-7 text-[#111827]">
              <div className="text-sm font-extrabold uppercase tracking-wide text-[#374151]">Bill To:</div>
              <div className="mt-2 text-[17px] font-extrabold leading-6">{businessName}</div>
              {safeAddress ? <div>{safeAddress}</div> : null}
              {safeCustomerEmail ? <div>{safeCustomerEmail}</div> : null}
            </div>
          </div>

          <div className="text-right text-[15px] leading-7 text-[#111827] lg:w-[34%]">
            {safeAccountNumber ? <div><span className="font-extrabold">Account #:</span> {safeAccountNumber}</div> : null}
            <div><span className="font-extrabold">Invoice #:</span> {displayInvoiceNumber}</div>
            {safeDueDate ? <div><span className="font-extrabold">Invoice Date:</span> {safeDueDate}</div> : null}
            <div><span className="font-extrabold">Date:</span> {dateLabel}</div>
            {safeCreatedBy ? <div><span className="font-extrabold">Created By:</span> {safeCreatedBy}</div> : null}
            <div className="mt-3 text-[17px] font-extrabold text-[#1436b3]">
              Invoice Total: <span className="text-[#159947]">{total}</span>
            </div>
          </div>
        </div>

        <div className="mt-6 border-t-2 border-[#1436b3] pt-6">
          <div className="overflow-hidden rounded-[4px] border border-[#1436b3]">
            <div className="grid grid-cols-[minmax(0,1fr)_100px_140px] bg-[#1436b3] text-sm font-extrabold text-white">
              <div className="px-4 py-3 text-left">Description of Service</div>
              <div className="px-4 py-3 text-center">Qty</div>
              <div className="px-4 py-3 text-right">Amount</div>
            </div>
            <div className="divide-y divide-[#1436b3] bg-white">
              {normalizedItems.map((item) => (
                <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_100px_140px] text-[15px] text-[#111827]">
                  <div className="px-4 py-3">{item.description}</div>
                  <div className="px-4 py-3 text-center">{item.qty}</div>
                  <div className="px-4 py-3 text-right">{item.total.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.3fr)_420px]">
          <div className="overflow-hidden rounded-[4px] border-2 border-[#1436b3]">
            <div className="bg-[#1436b3] px-4 py-3 text-[18px] font-extrabold text-white">Notes:</div>
            <div className="min-h-[170px] bg-white px-4 py-5 text-[17px] leading-7 text-[#111827]">
              {safeNotes}
            </div>
          </div>

          <div className="space-y-2 self-start text-[16px] text-[#111827]">
            <div className="flex items-center justify-between gap-4 px-2">
              <span>Subtotal:</span>
              <span>{subtotal}</span>
            </div>
            <div className="flex items-center justify-between gap-4 px-2">
              <span>Discount:</span>
              <span>(-) $0.00</span>
            </div>
            <div className="flex items-center justify-between gap-4 px-2">
              <span>Sales Tax:</span>
              <span>{tax}</span>
            </div>
            <div className="mt-3 rounded-[8px] bg-[#1436b3] px-5 py-4 text-[18px] font-extrabold text-white">
              <div className="flex items-center justify-between gap-4">
                <span>Grand Total:</span>
                <span className="text-[#4ade80]">{total}</span>
              </div>
            </div>
          </div>
        </div>

        {footerActions ? <div className="mt-6 flex justify-end gap-3">{footerActions}</div> : null}
      </div>
    </div>
  );
}
