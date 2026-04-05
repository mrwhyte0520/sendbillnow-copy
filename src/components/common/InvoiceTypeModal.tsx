import { useEffect, useMemo, useState } from 'react';

import type { InvoicePrintOptions, InvoiceTemplateType } from '../../utils/invoicePrintTemplates';

interface InvoiceTypeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (type: InvoiceTemplateType, options?: InvoicePrintOptions) => void;
  documentType?: 'invoice' | 'supplier_invoice' | 'quote';
  allowedTypes?: InvoiceTemplateType[];
  hiddenTypes?: InvoiceTemplateType[];
  title?: string;
  customerEmail?: string;
  onSendEmail?: (type: InvoiceTemplateType, options?: InvoicePrintOptions) => void;
}

const BRAND_BLUE = '#0d3b66';
const ACCENT_BLUE = '#2563eb';
const ACCENT_BLUE_DARK = '#1d4ed8';

export default function InvoiceTypeModal({
  isOpen,
  onClose,
  onSelect,
  documentType = 'invoice',
  allowedTypes,
  hiddenTypes,
  title = 'Select Document Format',
  customerEmail,
  onSendEmail,
}: InvoiceTypeModalProps) {
  const [selectedType, setSelectedType] = useState<InvoiceTemplateType>('simple');
  const [showJobEstimateForm, setShowJobEstimateForm] = useState(false);
  const [jobEstimateAction, setJobEstimateAction] = useState<'print' | 'email' | null>(null);
  const [jobEstimateFields, setJobEstimateFields] = useState({
    clientName: '',
    clientSignature: '',
    clientDate: '',
    contractorName: '',
    contractorSignature: '',
    contractorDate: '',
  });

  const previewLogo = '/logo-invoice.png';

  useEffect(() => {
    if (!isOpen) return;
    if (documentType === 'quote' || documentType === 'supplier_invoice') {
      setSelectedType('quotation');
      return;
    }
    setSelectedType('simple');
    setShowJobEstimateForm(false);
    setJobEstimateAction(null);
    setJobEstimateFields({
      clientName: '',
      clientSignature: '',
      clientDate: '',
      contractorName: '',
      contractorSignature: '',
      contractorDate: '',
    });
  }, [documentType, isOpen]);

  const templates = useMemo(
    () => [
    {
      id: 'simple' as InvoiceTemplateType,
      name: 'Simple Invoice',
      description: 'Clean and minimal format with essential information',
      icon: 'ri-file-text-line',
      preview: (
        <div className="bg-white border border-gray-200 rounded p-2 text-[6px] leading-tight">
          <div className="flex justify-between mb-1">
            <div className="font-bold text-[7px]">LOGO</div>
            <div className="text-right font-bold" style={{ color: BRAND_BLUE }}>INVOICE</div>
          </div>
          <div className="border-t border-gray-200 my-1"></div>
          <div className="mb-1">Customer: ___</div>
          <div className="border border-gray-200 rounded p-1 mb-1">
            <div className="grid grid-cols-4 gap-1 text-[5px] font-semibold border-b border-gray-100 pb-0.5">
              <span>Description</span>
              <span>Qty</span>
              <span>Price</span>
              <span>Amount</span>
            </div>
            <div className="h-3"></div>
          </div>
          <div className="text-right">
            <div>Subtotal: ___</div>
            <div>Tax: ___</div>
            <div className="font-bold">Total: ___</div>
          </div>
        </div>
      ),
    },
    {
      id: 'detailed' as InvoiceTemplateType,
      name: 'Detailed Invoice',
      description: 'Complete format with terms, signature and additional notes',
      icon: 'ri-file-list-3-line',
      preview: (
        <div className="bg-white border border-gray-200 rounded p-2 text-[6px] leading-tight">
          <div className="flex justify-between mb-1">
            <div className="font-bold text-[7px]">LOGO</div>
            <div className="text-right font-bold" style={{ color: BRAND_BLUE }}>INVOICE</div>
          </div>
          <div className="border-t border-gray-200 my-1"></div>
          <div className="grid grid-cols-2 gap-1 mb-1">
            <div>Customer: ___</div>
            <div>Address: ___</div>
          </div>
          <div className="border border-gray-200 rounded p-1 mb-1">
            <div className="grid grid-cols-4 gap-1 text-[5px] font-semibold border-b border-gray-100 pb-0.5">
              <span>Description</span>
              <span>Qty</span>
              <span>Price</span>
              <span>Amount</span>
            </div>
            <div className="h-2"></div>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <div className="border border-gray-200 rounded p-1 text-[5px]">
              <div className="font-semibold">Terms & Conditions</div>
              <div className="h-2"></div>
            </div>
            <div className="text-right text-[5px]">
              <div>Subtotal: ___</div>
              <div>Tax: ___</div>
              <div className="font-bold">Total: ___</div>
            </div>
          </div>
          <div className="mt-1 text-[5px]">Signature: X___</div>
        </div>
      ),
    },
    {
      id: 'quotation' as InvoiceTemplateType,
      name: documentType === 'supplier_invoice' ? 'Purchase Order' : 'Estimate',
      description: documentType === 'supplier_invoice' 
        ? 'Purchase order format for suppliers' 
        : 'Quote format with terms and validity',
      icon: 'ri-draft-line',
      preview: (
        <div className="bg-white border border-gray-200 rounded p-2 text-[6px] leading-tight">
          <div className="flex justify-between mb-1">
            <div className="font-bold text-[7px]">LOGO</div>
            <div className="text-right font-bold" style={{ color: BRAND_BLUE }}>
              {documentType === 'supplier_invoice' ? 'PURCHASE ORDER' : 'ESTIMATE'}
            </div>
          </div>
          <div className="border-t border-gray-200 my-1"></div>
          <div className="grid grid-cols-3 gap-1 mb-1 text-[5px]">
            <div>Customer Info</div>
            <div>Created By</div>
            <div>Status</div>
          </div>
          <div className="border border-gray-200 rounded p-1 mb-1">
            <div className="grid grid-cols-4 gap-1 text-[5px] font-semibold border-b border-gray-100 pb-0.5">
              <span>Qty</span>
              <span>Description</span>
              <span>Price</span>
              <span>Amount</span>
            </div>
            <div className="h-2"></div>
          </div>
          <div className="grid grid-cols-4 gap-1 text-[5px] border-t border-gray-200 pt-1">
            <div>Subtotal</div>
            <div>Tax</div>
            <div>Terms</div>
            <div className="font-bold">Total</div>
          </div>
          <div className="mt-1 border border-gray-200 rounded p-1 text-[5px]">
            <div className="font-semibold">General Terms</div>
          </div>
        </div>
      ),
    },
    {
      id: 'finalStyledQuote' as InvoiceTemplateType,
      name: documentType === 'supplier_invoice' ? 'Final Purchase Order' : 'Final Quote',
      description: documentType === 'supplier_invoice'
        ? 'Blue and green final purchase order style'
        : 'Blue and green final quote style',
      icon: 'ri-file-copy-line',
      preview: (
        <div className="bg-white border border-gray-200 rounded p-2 text-[4.5px] leading-tight text-[#173b8f]">
          <div className="flex justify-between items-start gap-2 mb-2">
            <div className="flex items-start gap-1.5">
              <div className="w-12 h-8 flex items-center justify-center overflow-hidden">
                <img src={previewLogo} alt="Quote logo" className="max-w-full max-h-full object-contain" />
              </div>
              <div className="pt-0.5">
                <div className="text-[#179a55] font-bold text-[5px]">(Valid for 30 days)</div>
                <div className="text-[#1f2937] font-bold text-[4.5px]">EXPIRES ON: MM/DD/YYYY</div>
                <div className="mt-0.5 w-20 border-b border-[#79d1a0]"></div>
              </div>
            </div>
            <div className="w-20 text-left font-bold text-[4.5px]">
              <div className="text-[7px] mb-1" style={{ color: BRAND_BLUE }}>
                {documentType === 'supplier_invoice' ? 'PURCHASE ORDER' : 'QUOTE'}
              </div>
              <div>ACCT. #:</div>
              <div>QUOTE #:</div>
              <div>QUOTE DATE:</div>
              <div>TIME:</div>
              <div>QUOTE COSTS: $</div>
            </div>
          </div>
          <div className="border-t border-[#9bb3df] mb-2"></div>
          <div className="grid grid-cols-2 gap-2 mb-2 font-bold text-[4.5px]">
            <div className="border-r border-[#cbd5e1] pr-2">
              <div className="mb-1" style={{ color: BRAND_BLUE }}>QUOTE FOR:</div>
              <div className="bg-[#e8f0fb] px-1 py-0.5 mb-1">CUSTOMER NAME:</div>
              <div>CUSTOMER ID:</div>
            </div>
            <div className="pl-1">
              <div className="mb-1" style={{ color: BRAND_BLUE }}>SHIP TO:</div>
              <div>CITY:</div>
              <div>STATE:</div>
              <div>ZIP CODE:</div>
            </div>
          </div>
          <div className="border-t border-[#9bb3df] mb-2"></div>
          <div className="grid grid-cols-5 border border-[#173b8f] border-b-0 text-white text-[4px] font-bold" style={{ backgroundColor: BRAND_BLUE }}>
            <div className="p-1">SHIPPING METHOD</div>
            <div className="p-1">TERMS: 30 DAYS</div>
            <div className="p-1">PO#:</div>
            <div className="p-1">DEPT.</div>
            <div className="p-1">METHOD</div>
          </div>
          <div className="border border-[#9bb3df] mb-2">
            <div className="grid grid-cols-[0.4fr_2.3fr_0.7fr_1fr_1fr] text-[4px] font-bold border-b border-[#9bb3df] text-[#334155]">
              <div className="border-r border-[#9bb3df] p-1">ID</div>
              <div className="border-r border-[#9bb3df] p-1">DESCRIPTION</div>
              <div className="border-r border-[#9bb3df] p-1">QTY</div>
              <div className="border-r border-[#9bb3df] p-1">ORIGINAL PRICE</div>
              <div className="p-1 text-[#173b8f]">CURRENT PRICE</div>
            </div>
            <div className="h-8"></div>
          </div>
          <div className="grid grid-cols-2 gap-2 items-start text-[4.5px] font-bold">
            <div className="border border-[#7f97ca] h-12 overflow-hidden bg-white">
              <div className="text-white px-1 py-0.5" style={{ backgroundColor: BRAND_BLUE }}>NOTES:</div>
            </div>
            <div className="space-y-1 pt-1">
              <div>SUBTOTAL:</div>
              <div>SHIPPING:</div>
              <div>SALES TAX:</div>
              <div className="pt-1 border-b border-[#79d1a0]">GRAND TOTAL:</div>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'corporate' as InvoiceTemplateType,
      name: 'Corporate Invoice',
      description: 'Professional format with header banner, Bill To/Ship To and Balance Due',
      icon: 'ri-building-2-line',
      preview: (
        <div className="bg-white border border-gray-200 rounded overflow-hidden text-[6px] leading-tight">
          <div className="bg-[#001B9E] text-white p-1.5 text-center">
            <div className="font-bold text-[7px]">COMPANY NAME</div>
            <div className="text-[5px] opacity-80">Address • Phone</div>
          </div>
          <div className="p-2">
            <div className="text-right font-bold text-[8px] mb-1">INVOICE</div>
            <div className="grid grid-cols-2 gap-2 mb-1 text-[5px]">
              <div><span className="font-semibold">Bill To:</span><br/>Customer</div>
              <div><span className="font-semibold">Ship To:</span><br/>Address</div>
            </div>
            <div className="border border-gray-200 rounded p-1 mb-1">
              <div className="grid grid-cols-4 gap-1 text-[5px] font-semibold bg-[#001B9E] text-white -m-1 mb-1 p-1">
                <span>Desc</span>
                <span>Qty</span>
                <span>Price</span>
                <span>Total</span>
              </div>
              <div className="h-2"></div>
            </div>
            <div className="flex justify-between">
              <div className="text-[5px] border border-gray-200 rounded p-1 flex-1 mr-1">Notes</div>
              <div className="text-[5px] w-20">
                <div className="flex justify-between"><span>Subtotal:</span><span>___</span></div>
                <div className="flex justify-between"><span>Tax:</span><span>___</span></div>
                <div className="bg-[#001B9E] text-white p-1 rounded mt-1 flex justify-between font-bold">
                  <span>Balance:</span><span>$___</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ),
    },

    {
      id: 'job-estimate' as InvoiceTemplateType,
      name: 'Job Estimate',
      description: 'Estimate format with payment terms and signature section',
      icon: 'ri-briefcase-4-line',
      preview: (
        <div className="bg-white border border-gray-200 rounded p-2 text-[6px] leading-tight">
          <div className="flex justify-between mb-1">
            <div className="font-bold text-[7px]">JOB ESTIMATE</div>
            <div className="border border-gray-300 p-1 text-[5px]">
              <div className="font-semibold">LOGO</div>
              <div className="h-2"></div>
            </div>
          </div>
          <div className="border-t border-gray-200 my-1"></div>
          <div className="grid grid-cols-3 gap-1 mb-1 text-[5px]">
            <div>Customer</div>
            <div>Estimate Date</div>
            <div>Created By</div>
          </div>
          <div className="border border-gray-200 rounded p-1 mb-1">
            <div className="grid grid-cols-4 gap-1 text-[5px] font-semibold border-b border-gray-100 pb-0.5">
              <span>Description</span>
              <span>Qty</span>
              <span>Price</span>
              <span>Amount</span>
            </div>
            <div className="h-2"></div>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <div className="border border-gray-200 rounded p-1 text-[5px]">
              <div className="font-semibold">Payment Terms</div>
              <div className="h-2"></div>
            </div>
            <div className="text-right text-[5px]">
              <div>Subtotal: ___</div>
              <div>Tax: ___</div>
              <div className="font-bold" style={{ color: BRAND_BLUE }}>Grand Total: ___</div>
            </div>
          </div>
          <div className="mt-1 text-center text-[5px]">Thank you for your Business!</div>
        </div>
      ),
    },

    {
      id: 'classic' as InvoiceTemplateType,
      name: 'Classic Invoice',
      description: 'Final invoice layout with sold-to/ship-to, pricing table and totals',
      icon: 'ri-file-paper-2-line',
      preview: (
        <div className="bg-white border border-gray-200 rounded p-2 text-[4.8px] leading-tight text-[#0f234a]">
          <div className="grid grid-cols-2 gap-2 items-start mb-1">
            <div>
              <div className="font-extrabold text-[7px]" style={{ color: BRAND_BLUE }}>LOGO</div>
              <div className="mt-1">Business Name</div>
              <div>Add</div>
              <div>City, State Zip Code</div>
              <div className="mt-1">Phone:</div>
              <div>Email:</div>
            </div>
            <div className="text-right">
              <div className="font-extrabold text-[8px]" style={{ color: BRAND_BLUE }}>INVOICE</div>
              <div className="mt-1">ACCT. #:</div>
              <div>INVOICE #:</div>
              <div>INVOICE DATE:</div>
              <div>TIME:</div>
              <div>INVOICE COSTS:</div>
            </div>
          </div>
          <div className="border-t border-[#cbd5e1] my-1"></div>
          <div className="grid grid-cols-2 gap-2 text-[5px] font-semibold mb-1">
            <div>
              <div>SOLD TO:</div>
              <div>CUSTOMER ID:</div>
              <div>CUSTOMER NAME:</div>
            </div>
            <div>
              <div>SHIP TO:</div>
              <div>Name</div>
              <div>Add</div>
              <div>City, State Zip Code</div>
            </div>
          </div>
          <div className="grid grid-cols-5 border border-[#94a3b8] text-[4.2px] font-bold mb-1">
            <span className="p-0.5">SHIP METHOD</span>
            <span className="p-0.5">INVOICED BY:</span>
            <span className="p-0.5">PO#:</span>
            <span className="p-0.5">DEPT.</span>
            <span className="p-0.5">PYMT METHOD</span>
          </div>
          <div className="border border-[#94a3b8] overflow-hidden mb-1">
            <div className="grid grid-cols-[0.35fr_2fr_0.55fr_1fr_1fr] text-[4.2px] font-bold text-white" style={{ backgroundColor: '#205f4d' }}>
              <span className="p-0.5">ID</span>
              <span className="p-0.5">DESCRIPTION</span>
              <span className="p-0.5">QTY</span>
              <span className="p-0.5">ORIGINAL PRICE</span>
              <span className="p-0.5">CURRENT PRICE</span>
            </div>
            <div className="h-5"></div>
          </div>
          <div className="grid grid-cols-2 gap-1 text-[5px] font-semibold">
            <div className="border border-[#94a3b8] h-6">
              <div className="text-white px-1 py-0.5" style={{ backgroundColor: BRAND_BLUE }}>NOTES:</div>
            </div>
            <div>
              <div>SUB TOTAL:</div>
              <div>SHIPPING:</div>
              <div>SALES TAXES:</div>
              <div>GRAND TOTAL:</div>
            </div>
          </div>
          <div className="grid grid-cols-4 border border-[#94a3b8] mt-1 text-[4.6px] font-semibold">
            <span className="p-0.5">TRANS ID:</span>
            <span className="p-0.5">STORE:</span>
            <span className="p-0.5">REGISTER:</span>
            <span className="p-0.5">CASHIER:</span>
          </div>
          <div className="mt-1 text-center text-[5.3px] font-bold">THANK YOU FOR SHOPPING WITH US!</div>
        </div>
      ),
    },
    {
      id: 'finalStyledInvoice' as InvoiceTemplateType,
      name: 'Final Invoice',
      description: 'Blue and green final invoice style',
      icon: 'ri-file-copy-line',
      preview: (
        <div className="bg-white border border-gray-200 rounded p-2 text-[4.5px] leading-tight text-[#173b8f]">
          <div className="flex justify-between items-start gap-2 mb-2">
            <div className="w-12 h-8 flex items-center justify-center overflow-hidden">
              <img src={previewLogo} alt="Invoice logo" className="max-w-full max-h-full object-contain" />
            </div>
            <div className="text-right text-[4.5px] font-bold flex-1">
              <div className="text-[7px] mb-0.5">COMPANY INFO</div>
              <div>Address</div>
              <div>Phone:</div>
              <div>Email:</div>
            </div>
          </div>
          <div className="text-center text-[8px] font-extrabold mb-2" style={{ color: BRAND_BLUE }}>INVOICE</div>
          <div className="border-t border-[#9bb3df] mb-2"></div>
          <div className="grid grid-cols-2 gap-2 mb-2 text-[4.5px] font-bold">
            <div className="border-r border-[#cbd5e1] pr-2">
              <div className="mb-1">BILL TO:</div>
              <div className="font-normal">Address</div>
              <div className="font-normal">City, State ZIP</div>
            </div>
            <div className="pl-1">
              <div>Account #:</div>
              <div>Invoice #:</div>
              <div>Invoice Date: MM/DD/YYYY</div>
              <div>Time: HH:MM AM/PM</div>
            </div>
          </div>
          <div className="border-t border-[#9bb3df] mb-2"></div>
          <div className="border border-[#9bb3df] overflow-hidden mb-2">
            <div className="grid grid-cols-[2.3fr_0.5fr_1.4fr] text-[4.5px] font-bold text-white" style={{ backgroundColor: BRAND_BLUE }}>
              <div className="border-r border-[#5878bc] p-1">Description of Service</div>
              <div className="border-r border-[#5878bc] p-1 text-center">Qty</div>
              <div className="p-1 text-right">Amount</div>
            </div>
            <div className="h-8 bg-white"></div>
          </div>
          <div className="grid grid-cols-2 gap-2 items-start text-[4.5px] font-bold">
            <div className="border border-[#7f97ca] h-12 overflow-hidden bg-white">
              <div className="text-white px-1 py-0.5" style={{ backgroundColor: BRAND_BLUE }}>NOTES:</div>
            </div>
            <div className="space-y-1 pt-1">
              <div>SUBTOTAL:</div>
              <div>DISCOUNT:</div>
              <div>SALES TAX:</div>
              <div className="pt-1 border-b border-[#79d1a0]">GRAND TOTAL:</div>
            </div>
          </div>
        </div>
      ),
    },

    ...(documentType === 'invoice'
      ? [
          {
            id: 'rent-receipt' as InvoiceTemplateType,
            name: 'Rent Receipt',
            description: 'Receipt-style template for rent payments',
            icon: 'ri-home-4-line',
            preview: (
              <div className="bg-white border border-gray-200 rounded p-2 text-[6px] leading-tight">
                <div className="flex justify-between mb-1">
                  <div className="font-bold text-[7px]">LOGO</div>
                  <div className="text-right font-bold" style={{ color: BRAND_BLUE }}>
                    RENT RECEIPT
                  </div>
                </div>
                <div className="border-t border-gray-200 my-1"></div>
                <div className="grid grid-cols-2 gap-2 text-[5px]">
                  <div>
                    <div className="font-semibold">Received From</div>
                    <div className="h-2"></div>
                  </div>
                  <div>
                    <div className="font-semibold">Amount</div>
                    <div className="h-2"></div>
                  </div>
                </div>
                <div className="mt-1 border border-gray-200 rounded p-1">
                  <div className="font-semibold text-[5px]">Description</div>
                  <div className="h-2"></div>
                </div>
                <div className="mt-1 text-[5px]">Signature: X___</div>
              </div>
            ),
          },

          {
            id: 'cash-receipt' as InvoiceTemplateType,
            name: 'Cash Receipt',
            description: 'Receipt format with red header bars and payment section',
            icon: 'ri-receipt-line',
            preview: (
              <div className="bg-white border border-gray-200 rounded overflow-hidden text-[6px] leading-tight">
                <div className="h-1" style={{ backgroundColor: BRAND_BLUE }} />
                <div className="p-2">
                  <div className="flex justify-between items-start">
                    <div className="font-bold text-[7px] text-gray-500">CASH RECEIPT</div>
                    <div className="flex items-start gap-2">
                      <div className="w-6 h-6 rounded-full bg-gray-500 text-white flex items-center justify-center text-[5px] font-bold">
                        LOGO
                      </div>
                      <div className="text-[5px]">
                        <div className="flex justify-between gap-2 border-b border-gray-200 pb-0.5 mb-0.5">
                          <span className="font-semibold text-gray-500">Date</span>
                          <span>__/__/__</span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="font-semibold text-gray-500">Receipt</span>
                          <span>___</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2 text-[5px]">
                    <div>
                      <div className="font-semibold text-gray-500">From</div>
                      <div className="h-2" />
                    </div>
                    <div>
                      <div className="font-semibold text-gray-500">To</div>
                      <div className="h-2" />
                    </div>
                  </div>
                  <div className="mt-2 border border-gray-200 rounded">
                    <div className="flex justify-between px-1 py-0.5 text-white text-[5px] font-semibold" style={{ backgroundColor: BRAND_BLUE }}>
                      <span>Description</span>
                      <span>Total</span>
                    </div>
                    <div className="h-2" />
                  </div>
                </div>
                <div className="h-1" style={{ backgroundColor: BRAND_BLUE }} />
              </div>
            ),
          },

          {
            id: 'blue-invoice' as InvoiceTemplateType,
            name: 'Blue Invoice',
            description: 'Modern blue header layout with clean totals section',
            icon: 'ri-file-copy-2-line',
            preview: (
              <div className="bg-white border border-gray-200 rounded overflow-hidden text-[6px] leading-tight">
                <div className="p-2 text-white" style={{ backgroundColor: BRAND_BLUE }}>
                  <div className="flex justify-between items-center">
                    <div className="font-bold text-[7px]">COMPANY</div>
                    <div className="font-bold">INVOICE</div>
                  </div>
                  <div className="text-[5px] opacity-90">Address • Phone</div>
                </div>
                <div className="p-2">
                  <div className="grid grid-cols-2 gap-2 mb-1 text-[5px]">
                    <div>
                      <span className="font-semibold">Bill To:</span>
                      <br />
                      Customer
                    </div>
                    <div className="text-right">
                      <span className="font-semibold">Invoice #</span>
                      <br />
                      ___
                    </div>
                  </div>
                  <div className="border border-gray-200 rounded p-1 mb-1">
                    <div className="grid grid-cols-4 gap-1 text-[5px] font-semibold border-b border-gray-100 pb-0.5">
                      <span>Description</span>
                      <span className="text-center">Qty</span>
                      <span className="text-right">Price</span>
                      <span className="text-right">Amount</span>
                    </div>
                    <div className="h-2"></div>
                  </div>
                  <div className="text-right text-[5px]">
                    <div>Subtotal: ___</div>
                    <div>Tax: ___</div>
                    <div className="font-bold" style={{ color: BRAND_BLUE }}>
                      Total: ___
                    </div>
                  </div>
                </div>
              </div>
            ),
          },



          {
            id: 'service-hours' as InvoiceTemplateType,
            name: 'Service Hours Invoice',
            description: 'Timesheet-style layout (hours & rate) like the classic service invoice',
            icon: 'ri-time-line',
            preview: (
              <div className="bg-white border border-gray-200 rounded p-2 text-[6px] leading-tight">
                <div className="flex justify-between">
                  <div>
                    <div className="font-bold text-[7px]">Company Name</div>
                    <div className="text-[5px]">Address</div>
                  </div>
                  <div className="text-right">
                    <div className="font-extrabold text-[9px]" style={{ color: '#0f6e73' }}>INVOICE</div>
                    <div className="text-[5px] font-semibold">INVOICE: ____</div>
                    <div className="text-[5px] font-semibold">DATE: __/__/__</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-3 text-[5px]">
                  <div><span className="font-semibold">TO:</span> Customer</div>
                  <div><span className="font-semibold">FOR:</span> Services</div>
                </div>
                <div className="mt-3 border border-black">
                  <div className="grid grid-cols-6 text-[5px] font-semibold border-b border-black text-center">
                    <div className="p-1 border-r border-black">Date</div>
                    <div className="p-1 border-r border-black col-span-2">Description</div>
                    <div className="p-1 border-r border-black">Time</div>
                    <div className="p-1 border-r border-black">Hours</div>
                    <div className="p-1">Amount</div>
                  </div>
                  <div className="h-6"></div>
                </div>
                <div className="mt-2 flex justify-end text-[5px]"><span className="font-semibold">Grand Total:</span><span className="inline-block ml-2 w-12 border-b border-black"></span></div>
              </div>
            ),
          },
        ]
      : []),
  ],
    [documentType]
  );

  const visibleTemplates = useMemo(() => {
    let next = templates;
    if (allowedTypes?.length) {
      const allowedSet = new Set<InvoiceTemplateType>(allowedTypes);
      next = next.filter((t) => allowedSet.has(t.id));
    }
    if (hiddenTypes?.length) {
      next = next.filter((t) => !hiddenTypes.includes(t.id));
    }
    return next;
  }, [allowedTypes, hiddenTypes, templates]);

  useEffect(() => {
    if (!isOpen) return;
    if (!visibleTemplates.length) return;
    if (visibleTemplates.some((t) => t.id === selectedType)) return;
    setSelectedType(visibleTemplates[0].id);
  }, [isOpen, selectedType, visibleTemplates]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (selectedType === 'job-estimate') {
      setJobEstimateAction('print');
      setShowJobEstimateForm(true);
      return;
    }
    onSelect(selectedType);
    onClose();
  };

  const handleSendEmail = () => {
    if (onSendEmail) {
      if (selectedType === 'job-estimate') {
        setJobEstimateAction('email');
        setShowJobEstimateForm(true);
        return;
      }
      onSendEmail(selectedType);
    }
    onClose();
  };

  const handleJobEstimateSubmit = () => {
    const options: InvoicePrintOptions = {
      jobEstimate: {
        clientName: jobEstimateFields.clientName || undefined,
        clientSignature: jobEstimateFields.clientSignature || undefined,
        clientDate: jobEstimateFields.clientDate || undefined,
        contractorName: jobEstimateFields.contractorName || undefined,
        contractorSignature: jobEstimateFields.contractorSignature || undefined,
        contractorDate: jobEstimateFields.contractorDate || undefined,
      },
    };

    if (jobEstimateAction === 'email' && onSendEmail) {
      onSendEmail(selectedType, options);
      onClose();
      return;
    }
    onSelect(selectedType, options);
    onClose();
  };

  const canSendEmail = Boolean(customerEmail && customerEmail.includes('@'));

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />
        
        <div className="relative bg-white rounded-2xl shadow-2xl max-w-5xl w-full overflow-hidden animate-in zoom-in-95 duration-200">
          {/* Header */}
          <div 
            className="p-6 text-center text-white"
            style={{ background: `linear-gradient(135deg, ${ACCENT_BLUE} 0%, ${ACCENT_BLUE_DARK} 100%)` }}
          >
            <div className="w-16 h-16 mx-auto bg-white/20 rounded-full flex items-center justify-center mb-4 backdrop-blur-sm">
              <i className="ri-printer-line text-3xl text-white"></i>
            </div>
            <h2 className="text-2xl font-bold">{title}</h2>
            <p className="text-white/80 mt-1">
              Choose the format that best suits your needs
            </p>
          </div>

          {/* Content */}
          <div className="p-6">
            <div className={visibleTemplates.length === 1 ? 'flex justify-center' : ''}>
              <div
                className={
                  visibleTemplates.length === 1
                    ? 'grid grid-cols-1 gap-4 w-full max-w-sm'
                    : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'
                }
              >
                {visibleTemplates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => setSelectedType(template.id)}
                    className={`relative p-4 rounded-xl border-2 transition-all duration-200 text-left hover:shadow-lg ${
                      selectedType === template.id
                        ? 'border-blue-600 bg-blue-50 shadow-md'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                  {selectedType === template.id && (
                    <div 
                      className="absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: ACCENT_BLUE }}
                    >
                      <i className="ri-printer-line text-white text-sm"></i>
                    </div>
                  )}
                  
                  <div className="flex items-center gap-3 mb-3">
                    <div 
                      className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        selectedType === template.id 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      <i className={`${template.icon} text-xl`}></i>
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{template.name}</h3>
                    </div>
                  </div>
                  
                  <p className="text-xs text-gray-500 mb-3">{template.description}</p>
                  
                  {/* Preview */}
                  <div className="transform scale-100 origin-top-left">
                    {template.preview}
                  </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
              <button
                onClick={onClose}
                className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              {onSendEmail && (
                <button
                  onClick={handleSendEmail}
                  disabled={!canSendEmail}
                  className={`px-5 py-2.5 rounded-lg font-semibold transition-all flex items-center gap-2 ${
                    canSendEmail
                      ? 'bg-blue-600 text-white shadow-lg hover:shadow-xl hover:bg-blue-700'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                  title={canSendEmail ? `Send to ${customerEmail}` : 'Customer email required'}
                >
                  <i className="ri-mail-send-line"></i>
                  Send via Email
                </button>
              )}
              <button
                onClick={handleConfirm}
                className="px-5 py-2.5 text-white rounded-lg font-semibold transition-all shadow-lg hover:shadow-xl flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
              >
                <i className="ri-printer-line"></i>
                Print {visibleTemplates.find((t) => t.id === selectedType)?.name}
              </button>
            </div>
          </div>
        </div>
      </div>

      {showJobEstimateForm && (
        <div className="fixed inset-0 z-[60] overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
              onClick={() => {
                setShowJobEstimateForm(false);
                setJobEstimateAction(null);
              }}
            />
            <div className="relative bg-white rounded-2xl shadow-2xl max-w-3xl w-full overflow-hidden animate-in zoom-in-95 duration-200">
              <div
                className="p-6 text-center text-white"
                style={{ background: `linear-gradient(135deg, ${ACCENT_BLUE} 0%, ${ACCENT_BLUE_DARK} 100%)` }}
              >
                <h2 className="text-2xl font-bold">Job Estimate Signatures</h2>
                <p className="text-white/80 mt-1">Fill in the signature fields for printing</p>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="border border-gray-200 rounded-xl p-4">
                    <div className="font-semibold text-gray-900 mb-3">CLIENT</div>
                    <label className="block text-sm text-gray-700 mb-1">Name</label>
                    <input
                      value={jobEstimateFields.clientName}
                      onChange={(e) => setJobEstimateFields((p) => ({ ...p, clientName: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                    <label className="block text-sm text-gray-700 mb-1 mt-3">Signature</label>
                    <input
                      value={jobEstimateFields.clientSignature}
                      onChange={(e) => setJobEstimateFields((p) => ({ ...p, clientSignature: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                    <label className="block text-sm text-gray-700 mb-1 mt-3">Date</label>
                    <input
                      type="date"
                      value={jobEstimateFields.clientDate}
                      onChange={(e) => setJobEstimateFields((p) => ({ ...p, clientDate: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div className="border border-gray-200 rounded-xl p-4">
                    <div className="font-semibold text-gray-900 mb-3">CONTRACTOR</div>
                    <label className="block text-sm text-gray-700 mb-1">Name</label>
                    <input
                      value={jobEstimateFields.contractorName}
                      onChange={(e) => setJobEstimateFields((p) => ({ ...p, contractorName: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                    <label className="block text-sm text-gray-700 mb-1 mt-3">Signature</label>
                    <input
                      value={jobEstimateFields.contractorSignature}
                      onChange={(e) => setJobEstimateFields((p) => ({ ...p, contractorSignature: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                    <label className="block text-sm text-gray-700 mb-1 mt-3">Date</label>
                    <input
                      type="date"
                      value={jobEstimateFields.contractorDate}
                      onChange={(e) => setJobEstimateFields((p) => ({ ...p, contractorDate: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
                  <button
                    onClick={() => {
                      setShowJobEstimateForm(false);
                      setJobEstimateAction(null);
                    }}
                    className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleJobEstimateSubmit}
                    className="px-5 py-2.5 text-white rounded-lg font-semibold transition-all shadow-lg hover:shadow-xl flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
                  >
                    <i className={jobEstimateAction === 'email' ? 'ri-mail-send-line' : 'ri-printer-line'}></i>
                    {jobEstimateAction === 'email' ? 'Send Job Estimate' : 'Print Job Estimate'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
