import { useState, useEffect, useRef, type ChangeEvent } from 'react';



import DashboardLayout from '../../../components/layout/DashboardLayout';



import * as ExcelJS from 'exceljs';



import { saveAs } from 'file-saver';



import { jsPDF } from 'jspdf';



import 'jspdf-autotable';



import html2canvas from 'html2canvas';



import * as QRCode from 'qrcode';



import { formatAmount, formatMoney } from '../../../utils/numberFormat';



import { formatDate } from '../../../utils/dateFormat';



import InvoiceTypeModal from '../../../components/common/InvoiceTypeModal';



import { generateInvoiceHtml, printInvoice, type InvoiceTemplateType, type InvoicePrintOptions } from '../../../utils/invoicePrintTemplates';



import { addPdfBrandedHeader, getPdfTableStyles } from '../../../utils/exportImportUtils';







import { useAuth } from '../../../hooks/useAuth';



import { usePlanPermissions } from '../../../hooks/usePlanPermissions';



import {



  bankCurrenciesService,



  bankExchangeRatesService,



  customerPaymentsService,



  customerTypesService,



  customersService,



  inventoryService,



  invoicesService,



  paymentTermsService,



  receiptApplicationsService,



  receiptsService,



  salesRepsService,



  settingsService,



  taxService,



} from '../../../services/database';







const BASE_CARD_CLASSES =



  'bg-[#FBF7EF] border border-[#D9C8A9] rounded-2xl shadow-[0_18px_38px_rgba(55,74,58,0.12)]';



const ICON_WRAPPER_BASE = 'w-12 h-12 rounded-xl flex items-center justify-center';



const PRIMARY_BUTTON_CLASSES =



  'px-4 py-2 bg-[#3C4F3C] text-white rounded-lg hover:bg-[#2D3B2E] transition font-semibold flex items-center gap-2 shadow-[0_10px_25px_rgba(60,79,60,0.35)]';



const ACCENT_BUTTON_CLASSES =



  'px-4 py-2 bg-[#B9583C] text-white rounded-lg hover:bg-[#a24b31] transition font-semibold flex items-center gap-2 shadow-[0_10px_20px_rgba(185,88,60,0.35)]';



const SECONDARY_BUTTON_CLASSES =



  'px-4 py-2 bg-[#EBDAC0] text-[#2F3D2E] rounded-lg hover:bg-[#DEC6A0] transition font-semibold flex items-center gap-2';







interface UiInvoiceItem {



  itemId?: string;



  description: string;



  quantity: number;



  price: number;



  total: number;



}







interface UiInvoice {



  id: string; // n├║mero visible (NCF)



  internalId: string; // id real en DB



  account_number?: string;



  customerId?: string;



  customer: string;



  customerEmail: string;



  customerDocument?: string;



  customerPhone?: string;



  customerAddress?: string;



  amount: number; // subtotal



  tax: number;



  total: number;



  status: 'paid' | 'pending' | 'overdue' | 'draft' | 'cancelled';



  date: string;



  dueDate: string;



  items: UiInvoiceItem[];



  salesRepId?: string | null;



  salesRepName?: string | null;



  currency: string;



  baseTotal?: number | null;



  publicToken?: string | null;



  ncfExpiryDate?: string | null;



  storeName?: string | null;



  saleType?: string | null;



  sequentialNumber?: number | null;



  notes?: string | null;



  createdAt?: string | null;



  totalDiscount: number;



  discountType?: 'percentage' | 'fixed' | null;



  discountValue?: number;



}



const isGeneralCustomerName = (name?: string | null) => {



  if (!name) return false;



  return String(name).trim().toLowerCase() === 'general customer';



};







const formatInvoiceNumberDisplay = (raw: string): string => {



  const s = String(raw || '').trim();



  const prefix = '4873';



  if (!s) return s;



  if (!s.startsWith(prefix)) return s;



  const suffixRaw = s.slice(prefix.length);



  if (!/^[0-9]+$/.test(suffixRaw)) return s;



  const counter = Number.parseInt(suffixRaw, 10);



  if (!Number.isFinite(counter) || counter < 0) return s;



  const padded = String(counter).padStart(4, '0');

  return `${prefix}${padded}`;



};







const stripPrintScripts = (html: string) => html.replace(/<script>[\s\S]*?<\/script>/gi, '');







const tuneHtmlForEmailPdf = (html: string) =>

  html

    .replace(/min-height\s*:\s*100vh\s*(?:!important)?\s*;?/gi, 'min-height:100%!important;')

    .replace(/height\s*:\s*100vh\s*(?:!important)?\s*;?/gi, 'height:100%!important;')

    .replace(/<img(?![^>]*\bcrossorigin=)([^>]*?)\ssrc=("|')((?!data:)[^"']+)\2/gi, '<img crossorigin="anonymous"$1 src=$2$3$2')

    .replace(

      /<\/style>/i,

      [

        '*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important;}',

        'html,body{background:#fff!important;padding:0!important;margin:0!important;height:100%!important;}',

        '.invoice,.quote{width:100%!important;max-width:100%!important;margin:0!important;border-radius:0!important;box-shadow:none!important;min-height:100%!important;height:auto!important;display:flex!important;flex-direction:column!important;}',

        '</style>',

      ].join('')

    );







const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {



  const bytes = new Uint8Array(buffer);



  const chunkSize = 0x8000;



  let binary = '';



  for (let i = 0; i < bytes.length; i += chunkSize) {



    const chunk = bytes.subarray(i, i + chunkSize);



    binary += String.fromCharCode(...chunk);



  }



  return btoa(binary);

};



const parseCustomerAddressFields = (raw: string): { street: string; city: string; state: string; zip: string } => {



  const normalized = String(raw || '')



    .replace(/\r\n/g, '\n')



    .split('\n')



    .map((l) => l.trim())



    .filter(Boolean)



     .join(', ');



   const parts = normalized



     ? normalized.split(',').map((p) => p.trim()).filter(Boolean)



     : [];



   let street = '';



   let city = '';



   let state = '';



   let zip = '';



   const looksLikeZip = (s: string) => {



     const v = String(s || '').trim();



     if (!v) return false;



     return /^[0-9]{3,6}([\-\s][0-9]{3,4})?$/.test(v);



   };



   const splitAlphaZip = (s: string): { left: string; zip: string } | null => {



     const v = String(s || '').trim();



     if (!v) return null;



     const m = v.match(/^(.+?)[\s\-]+([0-9]{1,6})$/);



     if (!m) return null;



     const left = String(m[1] || '').trim();



     const z = String(m[2] || '').trim();



     if (!left || !z) return null;



     return { left, zip: z };



   };



   if (parts.length === 1) {



     street = parts[0] || '';



   } else if (parts.length === 2) {



     street = parts[0] || '';



     const b = parts[1] || '';



     const m = splitAlphaZip(b);



     if (m) {



       city = m.left;



       zip = m.zip;



     } else if (looksLikeZip(b)) {



       zip = b;



     } else {



       city = b;



     }



   } else if (parts.length === 3) {



     street = parts[0] || '';



     city = parts[1] || '';



     const tail = parts[2] || '';



     const m = splitAlphaZip(tail);



     if (m) {



       state = m.left;



       zip = m.zip;



     } else if (looksLikeZip(tail)) {



       zip = tail;



     } else {



       state = tail;



     }



   } else if (parts.length >= 4) {



     const streetParts = parts.slice(0, Math.max(1, parts.length - 3));



     street = streetParts.join(' ').trim();



     city = String(parts[parts.length - 3] || '').trim();



     state = String(parts[parts.length - 2] || '').trim();



     zip = String(parts[parts.length - 1] || '').trim();



   }



   return { street, city, state, zip };



 };



const generatePdfBase64FromHtml = async (html: string): Promise<string> => {



  const iframe = document.createElement('iframe');



  iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:816px;height:1056px;border:0;opacity:0';



  document.body.appendChild(iframe);



  const safeHtml = tuneHtmlForEmailPdf(stripPrintScripts(html));



  await new Promise<void>((resolve) => {



    iframe.onload = () => resolve();



    iframe.srcdoc = safeHtml;



  });



  const doc = iframe.contentDocument;



  const body = doc?.body;



  if (!body) {



    document.body.removeChild(iframe);



    throw new Error('Failed to render invoice for PDF');



  }



  const printable = (doc?.querySelector('.invoice') || doc?.querySelector('.quote') || body) as HTMLElement;



  const canvas = await html2canvas(printable, { scale: 1, useCORS: true, backgroundColor: '#ffffff' });



  const imgData = canvas.toDataURL('image/jpeg', 0.65);



  const pdf = new jsPDF('p', 'pt', 'letter');



  const marginX = 10;

  const marginY = 14;

  const pdfWidth = pdf.internal.pageSize.getWidth();

  const pdfHeight = pdf.internal.pageSize.getHeight();

  const contentWidth = pdfWidth - marginX * 2;

  const contentHeight = pdfHeight - marginY * 2;



  const pxToPt = 72 / 96;

  const canvasWidthPt = canvas.width * pxToPt;

  const canvasHeightPt = canvas.height * pxToPt;



  let scale = contentWidth / canvasWidthPt;

  let scaledHeight = canvasHeightPt * scale;



  const epsilon = 2;

  const overflow = scaledHeight - contentHeight;

  if (overflow > 0 && overflow < 24) {

    const shrink = (contentHeight / scaledHeight) * 0.995;

    scale *= shrink;

    scaledHeight = canvasHeightPt * scale;

  }



  let y = 0;

  let remaining = scaledHeight;

  while (remaining > epsilon) {

    pdf.addImage(imgData, 'JPEG', marginX, marginY + y, contentWidth, scaledHeight, undefined, 'FAST');

    remaining -= contentHeight;

    if (remaining > epsilon) {

      pdf.addPage();

      y -= contentHeight;

    }

  }



  document.body.removeChild(iframe);



  const arrayBuffer = pdf.output('arraybuffer');



  return arrayBufferToBase64(arrayBuffer);



};







export default function InvoicingPage() {



  const { user } = useAuth();

  const createdByName = String((user?.user_metadata as any)?.full_name || user?.email || '').trim();



  const { limits } = usePlanPermissions();



  const [showDocumentPreviewModal, setShowDocumentPreviewModal] = useState(false);



  const [documentPreviewTitle, setDocumentPreviewTitle] = useState('');



  const [documentPreviewFilename, setDocumentPreviewFilename] = useState('');



  const [documentPreviewUrl, setDocumentPreviewUrl] = useState('');



  const [documentPreviewBlob, setDocumentPreviewBlob] = useState<Blob | null>(null);



  const documentPreviewIframeRef = useRef<HTMLIFrameElement | null>(null);







  const [showNewInvoiceModal, setShowNewInvoiceModal] = useState(false);



  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null);



  const [searchTerm, setSearchTerm] = useState('');



  const [statusFilter, setStatusFilter] = useState('all');



  const [invoices, setInvoices] = useState<UiInvoice[]>([]);



  const [, setLoading] = useState(false);







  const [showInvoiceDetailModal, setShowInvoiceDetailModal] = useState(false);



  const [isEditingInvoice, setIsEditingInvoice] = useState(false);







  const [showPrintTypeModal, setShowPrintTypeModal] = useState(false);



  const [invoiceToPrint, setInvoiceToPrint] = useState<UiInvoice | null>(null);







  const [paymentTerms, setPaymentTerms] = useState<Array<{ id: string; name: string; days?: number }>>([]);



  const [salesReps, setSalesReps] = useState<Array<{ id: string; name: string; is_active: boolean }>>([]);



  const [currencies, setCurrencies] = useState<



    Array<{ code: string; name: string; symbol: string; is_base?: boolean; is_active?: boolean }>



  >([]);



  const [baseCurrencyCode, setBaseCurrencyCode] = useState<string>('DOP');



  const [customers, setCustomers] = useState<



    Array<{



      id: string;



      name: string;



      email: string;



      document: string;



      phone?: string;



      address?: string;



      customerTypeId?: string | null;



      paymentTermId?: string | null;



      ncfType?: string | null;



      documentType?: string | null;



      arAccountId?: string | null;



    }>



  >([]);



  const [customerTypes, setCustomerTypes] = useState<any[]>([]);



  const [inventoryItems, setInventoryItems] = useState<any[]>([]);







  const [taxConfig, setTaxConfig] = useState<{ itbis_rate: number } | null>(null);







  type NewItem = {



    itemId?: string;



    description: string;



    quantity: number;



    price: number;



    total: number;



    taxable?: boolean;



  };







  const [newInvoiceCustomerId, setNewInvoiceCustomerId] = useState('');



  const [newInvoiceCustomerSearch, setNewInvoiceCustomerSearch] = useState('');



  const [newInvoiceCustomerPhone, setNewInvoiceCustomerPhone] = useState('');



  const [newInvoiceCustomerAddress, setNewInvoiceCustomerAddress] = useState('');



  const [newInvoiceCustomerCity, setNewInvoiceCustomerCity] = useState('');



  const [newInvoiceCustomerState, setNewInvoiceCustomerState] = useState('');



  const [newInvoiceCustomerZip, setNewInvoiceCustomerZip] = useState('');



  const [newInvoiceDate, setNewInvoiceDate] = useState(new Date().toISOString().slice(0, 10));



  const [newInvoicePaymentTermId, setNewInvoicePaymentTermId] = useState<string | null>(null);



  const [newInvoiceDueDate, setNewInvoiceDueDate] = useState(newInvoiceDate);



  const [newInvoiceSalesRepId, setNewInvoiceSalesRepId] = useState<string | null>(null);



  const [newInvoiceCurrency, setNewInvoiceCurrency] = useState<string>('DOP');



  const [newInvoiceDiscountType, setNewInvoiceDiscountType] = useState<'percentage' | 'fixed'>('percentage');



  const [newInvoiceDiscountPercent, setNewInvoiceDiscountPercent] = useState(0);



  const [newInvoiceNoTax, setNewInvoiceNoTax] = useState(false);



  const [newInvoiceNotes, setNewInvoiceNotes] = useState('');



  const [newInvoiceCustomerEmail, setNewInvoiceCustomerEmail] = useState('');



  const [isManualNewCustomer, setIsManualNewCustomer] = useState(false);



  const [newInvoiceSaleType, setNewInvoiceSaleType] = useState<'credit' | 'cash'>('credit');



  const [newInvoicePaymentMethod, setNewInvoicePaymentMethod] = useState<string>('');



  const [newInvoicePaymentReference, setNewInvoicePaymentReference] = useState<string>('');



  const [isClientPickerOpen, setIsClientPickerOpen] = useState(false);



  const [isSavingNewInvoice, setIsSavingNewInvoice] = useState(false);



  const clientPickerRef = useRef<HTMLDivElement | null>(null);







  const [newInvoiceItems, setNewInvoiceItems] = useState<NewItem[]>([



    { itemId: undefined, description: '', quantity: 1, price: 0, total: 0, taxable: true },



  ]);



  const [newInvoiceSubtotal, setNewInvoiceSubtotal] = useState(0);



  const [newInvoiceTax, setNewInvoiceTax] = useState(0);



  const [newInvoiceTotal, setNewInvoiceTotal] = useState(0);







  const currentItbisRate = taxConfig?.itbis_rate ?? 18;







  const recalcNewInvoiceTotals = (



    items: NewItem[],



    discountType = newInvoiceDiscountType,



    discountValue = newInvoiceDiscountPercent,



    noTaxFlag = newInvoiceNoTax,



  ) => {



    const rawSubtotal = items.reduce((sum, it) => sum + (it.total || 0), 0);



    const rawTaxableSubtotal = items.reduce((sum, it) => sum + (it.taxable === false ? 0 : (it.total || 0)), 0);



    let discountAmount = 0;



    if (discountType === 'percentage') {



      discountAmount = rawSubtotal * (discountValue / 100);



    } else if (discountType === 'fixed') {



      discountAmount = discountValue;



    }



    if (discountAmount > rawSubtotal) {



      discountAmount = rawSubtotal;



    }



    const subtotalAfterDiscount = rawSubtotal - discountAmount;



    const taxableAfterDiscount = rawSubtotal > 0



      ? rawTaxableSubtotal - discountAmount * (rawTaxableSubtotal / rawSubtotal)



      : 0;



    const taxAmount = noTaxFlag ? 0 : taxableAfterDiscount * (currentItbisRate / 100);



    setNewInvoiceSubtotal(subtotalAfterDiscount);



    setNewInvoiceTax(taxAmount);



    setNewInvoiceTotal(subtotalAfterDiscount + taxAmount);



  };







  const openHtmlPreview = (html: string, title: string, filename: string) => {



    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });



    const url = URL.createObjectURL(blob);







    setDocumentPreviewTitle(title);



    setDocumentPreviewFilename(filename);



    setDocumentPreviewBlob(blob);



    setDocumentPreviewUrl(url);



    setShowDocumentPreviewModal(true);



  };







  const handleCloseDocumentPreview = () => {



    setShowDocumentPreviewModal(false);



    if (documentPreviewUrl) {



      URL.revokeObjectURL(documentPreviewUrl);



    }



    setDocumentPreviewTitle('');



    setDocumentPreviewFilename('');



    setDocumentPreviewBlob(null);



    setDocumentPreviewUrl('');



  };







  const handleDownloadDocumentPreview = () => {



    if (!documentPreviewBlob) return;



    saveAs(documentPreviewBlob, documentPreviewFilename || 'document.html');



  };







  const handlePrintDocumentPreview = () => {



    const iframe = documentPreviewIframeRef.current;



    const win = iframe?.contentWindow;



    if (!win) return;



    win.focus();



    win.print();



  };







  const loadTaxConfig = async () => {



    try {



      const data = await taxService.getTaxConfiguration();



      if (data && typeof data.itbis_rate === 'number') {



        setTaxConfig({ itbis_rate: data.itbis_rate });



      } else {



        setTaxConfig({ itbis_rate: 18 });



      }



    } catch (error) {



      console.error('Error loading tax configuration for invoicing:', error);



      setTaxConfig({ itbis_rate: 18 });

    }



  };







  const loadInvoices = async () => {



    if (!user?.id) return;



    setLoading(true);



    try {



      const [data, currs] = await Promise.all([



        invoicesService.getAll(user.id as string),



        bankCurrenciesService.getAll(user.id as string),



      ]);







      const mappedCurrencies = (currs || []).map((c: any) => ({



        code: c.code as string,



        name: c.name as string,



        symbol: c.symbol as string,



        is_base: !!c.is_base,



        is_active: c.is_active !== false,



      })).filter((c: { is_active?: boolean }) => c.is_active);



      setCurrencies(mappedCurrencies);







      const baseCurrency = mappedCurrencies.find((c: { is_base?: boolean }) => c.is_base) || mappedCurrencies[0];



      const baseCode = baseCurrency?.code || 'DOP';



      setBaseCurrencyCode(baseCode);







      const mapped: UiInvoice[] = await Promise.all((data as any[]).map(async (inv) => {



        const subtotal = Number(inv.subtotal) || 0;



        const tax = Number(inv.tax_amount) || 0;



        const total = Number(inv.total_amount) || subtotal + tax;



        const invCurrency = (inv.currency as string) || baseCode;







        const customerData = (inv.customers as any) || {};







        const items: UiInvoiceItem[] = (inv.invoice_lines || []).map((line: any) => {



          const qty = Number(line.quantity) || 0;



          const unitPrice = Number(line.unit_price) || 0;



          const lineTotal = Number(line.line_total) || qty * unitPrice;



          return {



            itemId: line.item_id ? String(line.item_id) : undefined,



            description: line.description || line.inventory_items?.name || 'Item',



            quantity: qty,



            price: unitPrice,



            total: lineTotal,



          };



        });







        if (items.length === 0) {



          items.push({



            description: inv.description || 'Service/Product',



            quantity: 1,



            price: total,



            total,



          });



        }







        const statusDb = (inv.status as string) || 'pending';



        let status: UiInvoice['status'];



        if (statusDb === 'paid') status = 'paid';



        else if (statusDb === 'overdue') status = 'overdue';



        else if (statusDb === 'draft') status = 'draft';



        else if (statusDb === 'cancelled') status = 'cancelled';



        else status = 'pending';







        let baseTotal: number | null = total;



        if (invCurrency !== baseCode) {



          try {



            const rate = await bankExchangeRatesService.getEffectiveRate(



              user.id as string,



              invCurrency,



              baseCode,



              (inv.invoice_date as string) || new Date().toISOString().slice(0, 10),



            );



            if (rate && rate > 0) {



              baseTotal = total * rate;



            } else {



              baseTotal = null;



            }



          } catch (fxError) {



            console.error('Error calculating base currency equivalent for invoice', fxError);



            baseTotal = null;



          }



        }







        return {



          id: (inv.invoice_number as string) || String(inv.id),



          internalId: String(inv.id),



          account_number:



            (inv as any).account_number === null || (inv as any).account_number === undefined



              ? undefined



              : String((inv as any).account_number),



          customerId: String((inv as any).customer_id || customerData.id || ''),



          customer: customerData.name || 'Customer',



          customerEmail: customerData.email || customerData.contact_email || '',



          customerDocument: customerData.document || customerData.tax_id || '',



          customerPhone: customerData.phone || customerData.contact_phone || '',



          customerAddress: customerData.address || '',



          amount: subtotal,



          tax,



          total,



          status,



          date: (inv.invoice_date as string) || new Date().toISOString().slice(0, 10),



          dueDate: (inv.due_date as string) || (inv.invoice_date as string) || new Date().toISOString().slice(0, 10),



          items,



          salesRepId: (inv as any).sales_rep_id || null,



          salesRepName: (inv as any).sales_reps?.name || null,



          currency: invCurrency,



          baseTotal,



          publicToken: (inv as any).public_token || null,



          ncfExpiryDate: (inv as any).ncf_expiry_date || null,



          storeName: (inv as any).store_name || null,



          saleType: (inv as any).sale_type || null,



          sequentialNumber: (inv as any).sequential_number || null,



          notes: (inv as any).notes ?? null,



        createdAt: (inv as any).created_at || null,



        totalDiscount: Number((inv as any).total_discount) || 0,



          discountType: (inv as any).discount_type ?? null,



          discountValue: Number((inv as any).discount_value) || 0,



        };



      }));







      const sorted = [...mapped].sort((a, b) => {



        // Sort by createdAt descending (newest first)

        const ca = Date.parse(a.createdAt || '') || 0;

        const cb = Date.parse(b.createdAt || '') || 0;

        if (cb !== ca) return cb - ca;



        const da = Date.parse(a.date || '') || 0;



        const db = Date.parse(b.date || '') || 0;



        if (db !== da) return db - da;



        return String(b.id).localeCompare(String(a.id));



      });



      setInvoices((prev) => {

        const key = (x: UiInvoice) => String(x.internalId || x.id);

        const existing = new Set(sorted.map((x) => key(x)));

        const merged: UiInvoice[] = [...sorted];

        (prev || []).forEach((inv) => {

          const k = key(inv);

          if (!existing.has(k)) merged.push(inv);

        });

        return merged.sort((a, b) => {

          // Sort by createdAt descending (newest first)

          const ca = Date.parse(a.createdAt || '') || 0;

          const cb = Date.parse(b.createdAt || '') || 0;

          if (cb !== ca) return cb - ca;

          const da = Date.parse(a.date || '') || 0;

          const db = Date.parse(b.date || '') || 0;

          if (db !== da) return db - da;

          return String(b.id).localeCompare(String(a.id));

        });

      });



    } catch (error) {



      console.error('Error loading invoices for Invoicing:', error);



    } finally {



      setLoading(false);



    }



  };







  useEffect(() => {



    if (user?.id) {



      loadInvoices();



      loadTaxConfig();



    }



    // eslint-disable-next-line react-hooks/exhaustive-deps



  }, [user?.id]);







  useEffect(() => {



    const loadPaymentTerms = async () => {



      if (!user?.id) return;



      try {



        const [terms, reps] = await Promise.all([



          paymentTermsService.getAll(user.id),



          salesRepsService.getAll(user.id),



        ]);







        const mappedTerms = (terms || []).map((t: any) => ({



          id: t.id as string,



          name: t.name as string,



          days: typeof t.days === 'number' ? t.days : undefined,



        }));



        setPaymentTerms(mappedTerms);



        setSalesReps((reps || []).filter((r: any) => r.is_active));



      } catch (error) {



        console.error('Error loading payment terms for invoicing:', error);



      }



    };



    loadPaymentTerms();



  }, [user?.id]);







  useEffect(() => {



    const loadCustomersAndTypes = async () => {



      if (!user?.id) {



        setCustomers([]);



        setCustomerTypes([]);



        setInventoryItems([]);



        return;



      }



      try {



        const [rows, types, items] = await Promise.all([



          customersService.getAll(user.id),



          customerTypesService.getAll(user.id),



          inventoryService.getItems(user.id),



        ]);







        const mappedCustomers = (rows || []).map((c: any) => ({



          id: c.id as string,



          name: c.name || c.customer_name || 'Customer',



          email: c.email || c.contact_email || '',



          document: c.document || c.tax_id || '',



          phone: c.phone || c.contact_phone || '',



          address: c.address || '',



          customerTypeId: c.customerType ?? c.customer_type ?? null,



          paymentTermId: c.paymentTermId ?? c.payment_term_id ?? null,



          ncfType: c.ncfType ?? c.ncf_type ?? null,



          documentType: c.documentType ?? c.document_type ?? null,



          arAccountId: c.arAccountId ?? c.ar_account_id ?? null,



        }));



        setCustomers(mappedCustomers);



        setCustomerTypes(types || []);



        setInventoryItems(items || []);



      } catch (error) {



        console.error('Error loading customers for invoicing:', error);



      }



    };



    loadCustomersAndTypes();



  }, [user?.id]);







  const [companyInfo, setCompanyInfo] = useState<any | null>(null);







  useEffect(() => {



    const loadCompanyInfo = async () => {



      const info = await settingsService.getCompanyInfo();



      setCompanyInfo(info);



    };



    loadCompanyInfo();



  }, [user?.id]);







  const STATUS_BADGE_CLASSES: Record<UiInvoice['status'], string> = {



    paid: 'bg-[#001B9E] text-white',



    pending: 'bg-[#001B9E] text-white',



    overdue: 'bg-[#001B9E] text-white',



    draft: 'bg-[#001B9E] text-white',



    cancelled: 'bg-[#001B9E] text-white',



  };







  const getStatusBadgeClasses = (status: UiInvoice['status']) =>



    STATUS_BADGE_CLASSES[status] || 'bg-[#001B9E] text-white';







  const getStatusText = (status: string) => {



    switch (status) {



      case 'paid': return 'Paid';



      case 'pending': return 'Pending';



      case 'overdue': return 'Overdue';



      case 'draft': return 'Draft';



      case 'cancelled': return 'Cancelled';



      default: return status;



    }



  };







  const filteredInvoices = invoices.filter(invoice => {



    const matchesSearch =



      invoice.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||



      invoice.id.toLowerCase().includes(searchTerm.toLowerCase()) ||



      formatInvoiceNumberDisplay(invoice.id).toLowerCase().includes(searchTerm.toLowerCase());



    const matchesStatus = statusFilter === 'all' || invoice.status === statusFilter;



    return matchesSearch && matchesStatus;



  });







  const selectedNewInvoiceCustomer = customers.find((c) => c.id === newInvoiceCustomerId);







  const handleCreateInvoice = () => {



    const today = new Date().toISOString().slice(0, 10);



    setNewInvoiceCustomerId('');



    setNewInvoiceDate(today);



    setNewInvoicePaymentTermId(null);



    setNewInvoiceSalesRepId(null);



    setNewInvoiceDueDate(today);







    const defaultCurrency = currencies.find((c) => c.is_base) || currencies[0];



    setNewInvoiceCurrency(defaultCurrency?.code || 'DOP');



    setNewInvoiceItems([{ itemId: undefined, description: '', quantity: 1, price: 0, total: 0, taxable: true }]);



    setNewInvoiceSubtotal(0);



    setNewInvoiceTax(0);



    setNewInvoiceTotal(0);



    setNewInvoiceDiscountType('percentage');



    setNewInvoiceDiscountPercent(0);



    setNewInvoiceNoTax(false);



    const defaultNotes = String((companyInfo as any)?.default_notes || '').trim();

    setNewInvoiceNotes(defaultNotes);



    setNewInvoiceCustomerSearch('');



    setNewInvoiceCustomerPhone('');



    setNewInvoiceCustomerAddress('');



    setNewInvoiceCustomerCity('');



    setNewInvoiceCustomerState('');



    setNewInvoiceCustomerZip('');



    setNewInvoiceSaleType('credit');



    setNewInvoicePaymentMethod('');



    setNewInvoicePaymentReference('');



    setNewInvoiceCustomerEmail('');







    setShowNewInvoiceModal(true);



  };







  const handleNewInvoiceCustomerChange = (e: ChangeEvent<HTMLSelectElement>) => {



    const customerId = e.target.value;



    setNewInvoiceCustomerId(customerId);



    const customer = customers.find((c) => c.id === customerId);



    if (!customer) {



      setNewInvoiceDiscountPercent(0);



      setNewInvoiceNoTax(false);



      return;



    }



    const type = customer.customerTypeId ? customerTypes.find((t: any) => t.id === customer.customerTypeId) : null;



    let discountPercent = 0;



    let noTaxFlag = false;



    if (type) {



      discountPercent = Number(type.fixedDiscount) || 0;



      noTaxFlag = Boolean(type.noTax);



    }



    setNewInvoiceDiscountType('percentage');



    setNewInvoiceDiscountPercent(discountPercent);



    setNewInvoiceNoTax(noTaxFlag);



    setNewInvoiceCustomerSearch(customer?.name || '');



    setNewInvoiceCustomerEmail(customer?.email || '');



    setNewInvoiceCustomerPhone(customer?.phone || '');



    {



      const parsed = parseCustomerAddressFields(String(customer?.address || '').trim());



      setNewInvoiceCustomerAddress(parsed.street);



      setNewInvoiceCustomerCity(parsed.city);



      setNewInvoiceCustomerState(parsed.state);



      setNewInvoiceCustomerZip(parsed.zip);



    }







    let dueDate = newInvoiceDate;



    if (customer.paymentTermId) {



      const term = paymentTerms.find((t) => t.id === customer.paymentTermId);



      if (term && typeof term.days === 'number') {



        const base = new Date(newInvoiceDate);



        const d = new Date(base);



        d.setDate(base.getDate() + term.days);



        dueDate = d.toISOString().slice(0, 10);



        setNewInvoicePaymentTermId(customer.paymentTermId);



      }



    } else if (type && typeof type.allowedDelayDays === 'number' && type.allowedDelayDays > 0) {



      const base = new Date(newInvoiceDate);



      const d = new Date(base);



      d.setDate(base.getDate() + type.allowedDelayDays);



      dueDate = d.toISOString().slice(0, 10);



    }



    setNewInvoiceDueDate(dueDate);



    recalcNewInvoiceTotals([...newInvoiceItems], 'percentage', discountPercent, noTaxFlag);



  };







  const handleViewInvoice = (invoiceId: string) => {



    const invoice = invoices.find((inv) => inv.id === invoiceId);



    if (!invoice) return;



    setSelectedInvoice(invoiceId);



    setIsEditingInvoice(false);



    setShowInvoiceDetailModal(true);



  };







  const handleEditInvoice = (invoiceId: string) => {



    const invoice = invoices.find((inv) => inv.id === invoiceId);



    if (!invoice) return;



    if (invoice.status !== 'pending') {



      alert('Only pending invoices can be edited.');



      return;



    }



    setSelectedInvoice(invoiceId);



    setIsEditingInvoice(true);



    setShowInvoiceDetailModal(true);



  };







  const handleCancelInvoice = async (invoiceId: string) => {



    if (!user?.id) {



      alert('You must be logged in to cancel invoices');



      return;



    }







    const invoice = invoices.find((inv) => inv.id === invoiceId);



    if (!invoice) return;







    if (invoice.status === 'paid') {



      alert('Cannot cancel a paid invoice. First delete/reverse the payment.');



      return;



    }







    if (invoice.status === 'cancelled') {



      alert('The invoice is already cancelled.');



      return;



    }







    if (!confirm(`Are you sure you want to cancel invoice ${invoiceId}?`)) return;







    try {



      await invoicesService.cancel(user.id as string, invoice.internalId);



      await loadInvoices();



      if (selectedInvoice === invoiceId) {



        setSelectedInvoice(null);



        setShowInvoiceDetailModal(false);



      }



      alert(`Invoice ${invoiceId} cancelled successfully`);



    } catch (error: any) {



      console.error('Error cancelling invoice:', error);



      alert(error?.message || 'Error cancelling the invoice');



    }



  };







  const handlePrintInvoice = async (



    invoiceId: string,



  ) => {



    const invoice = invoices.find((inv) => inv.id === invoiceId);



    if (!invoice) return;



    setInvoiceToPrint(invoice);



    setShowPrintTypeModal(true);



  };







  const handlePrintTypeSelect = (type: InvoiceTemplateType, options?: InvoicePrintOptions) => {



    if (!invoiceToPrint) return;



    const fullCustomer = invoiceToPrint.customerId ? customers.find((c) => c.id === invoiceToPrint.customerId) : undefined;



    const invoiceData = {



      invoiceNumber: formatInvoiceNumberDisplay(invoiceToPrint.id),

      accountNumber: (invoiceToPrint as any).account_number ?? (invoiceToPrint as any).accountNumber ?? undefined,



      date: invoiceToPrint.date,



      dueDate: invoiceToPrint.dueDate,



      amount: invoiceToPrint.total,



      subtotal:



        Number(invoiceToPrint.amount || 0) +



        Number((invoiceToPrint as any).totalDiscount ?? (invoiceToPrint as any).total_discount ?? 0),



      tax: invoiceToPrint.tax,



      total_discount: (invoiceToPrint as any).totalDiscount ?? (invoiceToPrint as any).total_discount ?? 0,



      discount_type: (invoiceToPrint as any).discountType ?? (invoiceToPrint as any).discount_type ?? undefined,



      discount_value: (invoiceToPrint as any).discountValue ?? (invoiceToPrint as any).discount_value ?? undefined,



      items: invoiceToPrint.items.map((item) => ({



        description: item.description,



        quantity: item.quantity,



        price: item.price,



        total: item.total,



      })),



      createdBy: createdByName,



      notes: (invoiceToPrint as any).notes ?? null,



    };



    const customerData = {



      name: invoiceToPrint.customer || fullCustomer?.name || 'Customer',



      document: fullCustomer?.document || invoiceToPrint.customerDocument,



      phone: fullCustomer?.phone || invoiceToPrint.customerPhone,



      email: fullCustomer?.email || invoiceToPrint.customerEmail,



      address: fullCustomer?.address || invoiceToPrint.customerAddress,



    };



    const companyData = {



      name: (companyInfo as any)?.name || (companyInfo as any)?.company_name || 'Send Bill Now',



      rnc: (companyInfo as any)?.rnc || (companyInfo as any)?.tax_id,



      phone: (companyInfo as any)?.phone,



      email: (companyInfo as any)?.email,



      address: (companyInfo as any)?.address,



      city: (companyInfo as any)?.city,



      state: (companyInfo as any)?.state,



      zip: (companyInfo as any)?.zip,



      logo: (companyInfo as any)?.logo,



      facebook: (companyInfo as any)?.facebook,



      instagram: (companyInfo as any)?.instagram,



      twitter: (companyInfo as any)?.twitter,



      linkedin: (companyInfo as any)?.linkedin,



      youtube: (companyInfo as any)?.youtube,



      tiktok: (companyInfo as any)?.tiktok,



      whatsapp: (companyInfo as any)?.whatsapp,



    };



    printInvoice(invoiceData, customerData, companyData, type, options);



    setInvoiceToPrint(null);



  };







  const handlePrintInvoiceLegacy = async (invoiceId: string) => {



    const invoice = invoices.find((inv) => inv.id === invoiceId);



    if (!invoice) return;







    const fullCustomer = invoice.customerId



      ? customers.find((c) => c.id === invoice.customerId)



      : undefined;







    const printCustomerDocument = fullCustomer?.document || invoice.customerDocument || '';



    const printCustomerPhone = fullCustomer?.phone || invoice.customerPhone || '';



    const printCustomerEmail = fullCustomer?.email || invoice.customerEmail || '';



    const printCustomerAddress = fullCustomer?.address || invoice.customerAddress || '';







    const companyName = (companyInfo as any)?.name || (companyInfo as any)?.company_name || '';



    const companyRnc = (companyInfo as any)?.rnc || (companyInfo as any)?.tax_id || (companyInfo as any)?.ruc || '';



    const companyPhone = (companyInfo as any)?.phone || '';



    const companyEmail = (companyInfo as any)?.email || '';



    const companyAddress = (companyInfo as any)?.address || '';







    const itbisLabel = (taxConfig?.itbis_rate ?? 18).toFixed(2);







    let qrDataUrl = '';



    try {



      const publicToken = invoice.publicToken || (invoice as any).public_token || (invoice as any).publicToken;



      const qrUrl = publicToken



        ? `${window.location.origin}/public/document/invoice/${encodeURIComponent(String(publicToken))}`



        : `${window.location.origin}/document/invoice/${encodeURIComponent(String((invoice as any).internalId || invoice.id))}`;



      qrDataUrl = await QRCode.toDataURL(qrUrl, {



        errorCorrectionLevel: 'M',



        margin: 1,



        width: 160,



      });



    } catch {



      qrDataUrl = '';



    }







    const html = `



      <html>



        <head>



          <meta charset="utf-8" />



          <meta name="viewport" content="width=device-width, initial-scale=1" />



          <title>Invoice ${formatInvoiceNumberDisplay(invoice.id)}</title>



          <style>



            :root {



              --primary: #0b2a6f;



              --accent: #19a34a;



              --text: #111827;



              --muted: #6b7280;



              --border: #e5e7eb;



              --bg: #ffffff;



              --soft: #f3f4f6;



            }



            * { box-sizing: border-box; }



            body { font-family: Arial, sans-serif; padding: 28px; color: var(--text); background: var(--bg); }



            .page { width: 100%; }



            .top { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 20px; align-items: start; }



            .company { display: grid; grid-template-columns: 1fr; gap: 6px; }



            .company-name { font-weight: 800; font-size: 18px; letter-spacing: 0.2px; color: var(--primary); }



            .company-meta { font-size: 12px; color: var(--muted); line-height: 1.35; }



            .doc { text-align: right; }



            .doc-title { font-size: 44px; font-weight: 800; color: #9ca3af; letter-spacing: 1px; line-height: 1; }



            .doc-number { margin-top: 6px; font-size: 22px; font-weight: 800; color: var(--accent); }



            .doc-kv { margin-top: 10px; font-size: 12px; color: var(--muted); line-height: 1.45; }



            .qr { margin-top: 10px; width: 110px; height: 110px; }



            .section-grid { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 20px; margin-top: 16px; }



            .card { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: #fff; }



            .card-head { background: var(--primary); padding: 10px 12px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }



            .card-head-title { font-weight: 800; font-size: 14px; color: #fff; }



            .badge { background: #fff; color: var(--primary); padding: 6px 10px; border-radius: 10px; font-weight: 800; font-size: 12px; }



            .card-body { padding: 12px; }



            .kv { display: grid; grid-template-columns: 140px 1fr; gap: 6px 10px; font-size: 12px; }



            .kv .k { color: var(--muted); }



            .kv .v { color: var(--text); font-weight: 600; }



            .table-wrap { margin-top: 18px; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }



            table { width: 100%; border-collapse: collapse; }



            thead th { background: var(--primary); color: #fff; font-size: 12px; text-transform: uppercase; letter-spacing: 0.4px; padding: 10px; text-align: left; }



            tbody td { border-bottom: 1px solid var(--border); padding: 10px; font-size: 12px; vertical-align: top; }



            tbody tr:last-child td { border-bottom: none; }



            .num { text-align: right; font-variant-numeric: tabular-nums; }



            .totals { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }



            .totals-head { background: var(--primary); color: #fff; padding: 10px 12px; font-weight: 800; font-size: 13px; }



            .totals-body { padding: 12px; }



            .totals-row { display: grid; grid-template-columns: 1fr auto; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 12px; }



            .totals-row:last-child { border-bottom: none; }



            .totals-row .label { color: var(--muted); font-weight: 700; }



            .totals-row .value { font-weight: 800; color: var(--text); font-variant-numeric: tabular-nums; }



            .totals-row.total .label, .totals-row.total .value { font-size: 14px; }



            .totals-row.total .value { color: var(--primary); }



            .footer-grid { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 20px; margin-top: 16px; }



            .notes { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }



            .notes-head { background: var(--primary); color: #fff; padding: 10px 12px; font-weight: 800; font-size: 13px; }



            .notes-body { padding: 12px; color: var(--muted); font-size: 12px; line-height: 1.45; }



            @media print { body { padding: 0; } }



          </style>



        </head>



        <body>



          <div class="page">



            <div class="top">



              <div class="company">



                <div class="company-name">${companyName}</div>



                ${companyRnc ? `<div class="company-meta">RNC: ${companyRnc}</div>` : ''}



                ${companyPhone ? `<div class="company-meta">Tel: ${companyPhone}</div>` : ''}



                ${companyEmail ? `<div class="company-meta">Email: ${companyEmail}</div>` : ''}



                ${companyAddress ? `<div class="company-meta">Address: ${companyAddress}</div>` : ''}



              </div>



              <div class="doc">



                <div class="doc-title">INVOICE ${invoice.saleType === 'cash' ? 'CASH' : 'CREDIT'}</div>



                <div class="doc-number">NCF: ${formatInvoiceNumberDisplay(invoice.id)}</div>



                ${invoice.ncfExpiryDate ? `<div><strong>Valid until:</strong> ${formatDate(invoice.ncfExpiryDate)}</div>` : ''}



                ${invoice.sequentialNumber ? `<div><strong>Invoice Number:</strong> ${invoice.sequentialNumber}</div>` : ''}



                ${invoice.salesRepName ? `<div><strong>Sales Rep:</strong> ${invoice.salesRepName}</div>` : ''}



                <div><strong>Currency:</strong> ${invoice.currency === 'DOP' ? 'Dominican Peso' : invoice.currency}</div>



                ${invoice.storeName ? `<div><strong>Store:</strong> ${invoice.storeName}</div>` : ''}



                <div><strong>Payment Due Date:</strong> ${formatDate(invoice.dueDate)}</div>



                <div><strong>Created By:</strong> ${createdByName}</div>



              </div>



            </div>



            <div class="section-grid">



              <div class="card">



                <div class="card-head">



                  <div class="card-head-title">Customer</div>



                </div>



                <div class="card-body">



                  <div class="kv">



                    <div class="k">Name</div>



                    <div class="v">${invoice.customer}</div>



                    ${printCustomerDocument ? `<div class="k">Document</div><div class="v">${printCustomerDocument}</div>` : ''}



                    ${printCustomerPhone ? `<div class="k">Phone</div><div class="v">${printCustomerPhone}</div>` : ''}



                    ${printCustomerEmail ? `<div class="k">Email</div><div class="v">${printCustomerEmail}</div>` : ''}



                    ${printCustomerAddress ? `<div class="k">Address</div><div class="v">${printCustomerAddress}</div>` : ''}



                  </div>



                </div>



              </div>



              <div class="totals">



                <div class="totals-head">Summary</div>



                <div class="totals-body">



                  <div class="totals-row"><div class="label">Subtotal</div><div class="value"> ${formatAmount(invoice.amount)}</div></div>



                  <div class="totals-row"><div class="label">Tax (${itbisLabel}%)</div><div class="value"> ${formatAmount(invoice.tax)}</div></div>



                  <div class="totals-row total"><div class="label">Total</div><div class="value"> ${formatAmount(invoice.total)}</div></div>



                </div>



              </div>



            </div>



            <div class="table-wrap">



              <table>



                <thead>



                  <tr>



                    <th style="width: 54px;">No.</th>



                    <th>Description</th>



                    <th class="num" style="width: 110px;">Price</th>



                    <th class="num" style="width: 80px;">Qty.</th>



                    <th class="num" style="width: 120px;">Amount</th>



                  </tr>



                </thead>



                <tbody>



                  ${invoice.items



                    .map(



                      (item, idx) => `



                      <tr>



                        <td>${idx + 1}</td>



                        <td>${item.description}</td>



                        <td class="num"> ${formatAmount(item.price)}</td>



                        <td class="num">${item.quantity}</td>



                        <td class="num"> ${formatAmount(item.total)}</td>



                      </tr>`



                    )



                    .join('')}



                </tbody>



              </table>



            </div>



            <div class="footer-grid">



              <div class="notes">



                <div class="notes-head">Notes</div>



                <div class="notes-body">${invoice.notes}</div>



              </div>



              <div></div>



            </div>



          </div>



        </body>



      </html>



    `;



    const displayId = formatInvoiceNumberDisplay(invoice.id);



    openHtmlPreview(html, `Invoice #${displayId}`, `invoice-${displayId}.html`);



  };







  const handleExportInvoiceExcel = async (invoiceId: string) => {



    const invoice = invoices.find((inv) => inv.id === invoiceId);



    if (!invoice) return;



    const fullCustomer = invoice.customerId



      ? customers.find((c) => c.id === invoice.customerId)



      : undefined;



    const companyName =



      (companyInfo as any)?.name ||



      (companyInfo as any)?.company_name ||



      '';



    const companyRnc =



      (companyInfo as any)?.rnc ||



      (companyInfo as any)?.tax_id ||



      (companyInfo as any)?.ruc ||



      '';



    const workbook = new ExcelJS.Workbook();



    const worksheet = workbook.addWorksheet('Invoice');



    worksheet.mergeCells('A1:D1');



    worksheet.getCell('A1').value = companyName;



    worksheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };



    worksheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' } as any;



    worksheet.getCell('A1').fill = {



      type: 'pattern',



      pattern: 'solid',



      fgColor: { argb: 'FF008000' },



    };



    worksheet.getRow(1).height = 24;



    const headerStartRow = 2;



    worksheet.mergeCells(`A${headerStartRow}:D${headerStartRow}`);



    worksheet.getCell(`A${headerStartRow}`).value = `Invoice #${formatInvoiceNumberDisplay(invoice.id)}`;



    worksheet.getCell(`A${headerStartRow}`).font = { bold: true, size: 12 };



    if (String(invoice.id || '').toUpperCase().startsWith('B')) {



      const fiscalRow = headerStartRow + 1;



      worksheet.mergeCells(`A${fiscalRow}:D${fiscalRow}`);



      worksheet.getCell(`A${fiscalRow}`).value = 'Ô£ô VALID INVOICE FOR TAX CREDIT';



      worksheet.getCell(`A${fiscalRow}`).font = { bold: true, size: 11, color: { argb: 'FF92400e' } };



      worksheet.getCell(`A${fiscalRow}`).fill = {



        type: 'pattern',



        pattern: 'solid',



        fgColor: { argb: 'FFfef3c7' }



      };



      worksheet.getCell(`A${fiscalRow}`).alignment = { horizontal: 'center' } as any;



      worksheet.getCell(`A${fiscalRow}`).border = {



        top: { style: 'medium', color: { argb: 'FFf59e0b' } },



        bottom: { style: 'medium', color: { argb: 'FFf59e0b' } },



        left: { style: 'medium', color: { argb: 'FFf59e0b' } },



        right: { style: 'medium', color: { argb: 'FFf59e0b' } }



      };



    }



    worksheet.addRow([]);



    const customerName = invoice.customer;



    const customerDoc = fullCustomer?.document || invoice.customerDocument || '';



    const customerEmail = fullCustomer?.email || invoice.customerEmail || '';



    const customerPhone = fullCustomer?.phone || invoice.customerPhone || '';



    worksheet.addRow(['Customer', customerName]);



    if (customerDoc) worksheet.addRow(['Document', customerDoc]);



    if (customerEmail) worksheet.addRow(['Email', customerEmail]);



    if (customerPhone) worksheet.addRow(['Phone', customerPhone]);



    worksheet.addRow([



      'Date',



      formatDate(invoice.date),



    ]);



    worksheet.addRow([



      'Due Date',



      formatDate(invoice.dueDate),



    ]);



    worksheet.addRow([]);







    const itemsHeader = worksheet.addRow(['Description', 'Quantity', 'Price', 'Total']);



    itemsHeader.font = { bold: true };







    invoice.items.forEach((item) => {



      worksheet.addRow([



        item.description,



        item.quantity,



        item.price,



        item.total,



      ]);



    });







    worksheet.addRow([]);



    worksheet.addRow(['', '', 'Subtotal', invoice.amount]);



    worksheet.addRow([



      '',



      '',



      `Tax (${(taxConfig?.itbis_rate ?? 18).toFixed(2)}%)`,



      invoice.tax,



    ]);



    worksheet.addRow(['', '', 'Total', invoice.total]);







    worksheet.columns = [



      { width: 40 },



      { width: 12 },



      { width: 14 },



      { width: 14 },



    ];







    ['C', 'D'].forEach((col) => {



      worksheet.getColumn(col).numFmt = '#,##0.00';



    });







    const buffer = await workbook.xlsx.writeBuffer();



    const blob = new Blob([buffer], {



      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',



    });



    saveAs(blob, `invoice_${formatInvoiceNumberDisplay(invoice.id)}.xlsx`);



  };







  const handleDuplicateInvoice = (invoiceId: string) => {



    const original = invoices.find((inv) => inv.id === invoiceId);



    if (!original) return;



    const randomSuffix = Math.floor(100 + Math.random() * 900);



    const newId = `FAC-${new Date().getFullYear()}-${randomSuffix}`;



    const today = new Date().toISOString().split('T')[0];







    const duplicated: UiInvoice = {



      ...original,



      id: newId,



      date: today,



      status: 'draft',



      dueDate: original.dueDate,



      items: original.items,



    };







    setInvoices((prev) => [duplicated, ...prev]);



    alert(`Invoice duplicated (frontend only). New invoice: ${newId}`);



  };







  const handleSaveInvoiceChanges = async () => {



    if (!user?.id) {



      alert('You must be logged in to edit invoices');



      return;



    }



    if (!selectedInvoice) return;







    const invoice = invoices.find((inv) => inv.id === selectedInvoice);



    if (!invoice) return;







    try {



      const linesPayload = invoice.items.map((item, index) => ({



        description: item.description,



        quantity: item.quantity,



        unit_price: item.price,



        line_total: item.total,



        line_number: index + 1,



        item_id: item.itemId ?? null,



      }));







      const invoicePatch = {



        subtotal: invoice.amount,



        tax_amount: invoice.tax,



        total_amount: invoice.total,



        invoice_date: invoice.date,



        due_date: invoice.dueDate,



        notes: (invoice as any).notes ?? null,



      };







      await invoicesService.updateWithLines(



        user.id as string,



        invoice.id,



        invoicePatch,



        linesPayload,



      );







      await loadInvoices();



      setShowInvoiceDetailModal(false);



      setSelectedInvoice(null);



      setIsEditingInvoice(false);



      alert('Invoice updated successfully');



    } catch (error) {



      console.error('Error updating invoice:', error);



      alert('Error updating the invoice');



    }



  };







  const handleExportInvoices = async (format: 'excel' | 'pdf') => {



    try {



      if (format === 'excel') {



        await exportToExcel();



      } else {



        await exportToPdf();



      }



    } catch (error) {



      console.error('Error exporting:', error);



      alert('Error exporting data. Please try again.');



    }



  };







  const exportToExcel = async () => {



    const workbook = new ExcelJS.Workbook();



    const worksheet = workbook.addWorksheet('Invoices');







    const headerCompanyName =



      (companyInfo as any)?.name ||



      (companyInfo as any)?.company_name ||



      '';







    worksheet.addRow([headerCompanyName]);



    worksheet.getRow(1).font = { bold: true, size: 14 };



    worksheet.addRow(['INVOICES REPORT']);



    worksheet.getRow(2).font = { bold: true, size: 12 };



    worksheet.addRow([`Generated on: ${new Date().toLocaleDateString('es-DO')}`]);



    worksheet.addRow([]);







    const headerRow = worksheet.addRow([



      'Invoice #',



      'Customer',



      'Date',



      'Due Date',



      'Amount',



      'Tax',



      'Total',



      'Status'



    ]);



    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };



    headerRow.eachCell((cell) => {



      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF008000' } };



    });







    const data = filteredInvoices.map(invoice => [



      formatInvoiceNumberDisplay(invoice.id),



      invoice.customer,



      new Date(invoice.date).toLocaleDateString('es-DO'),



      new Date(invoice.dueDate).toLocaleDateString('es-DO'),



      invoice.amount,



      invoice.tax,



      invoice.total,



      getStatusText(invoice.status)



    ]);







    worksheet.addRows(data);







    worksheet.columns = [



      { key: 'id', width: 15 },



      { key: 'customer', width: 30 },



      { key: 'date', width: 12 },



      { key: 'dueDate', width: 12 },



      { key: 'amount', width: 15 },



      { key: 'tax', width: 15 },



      { key: 'total', width: 15 },



      { key: 'status', width: 15 }



    ];







    const currencyColumns = ['E', 'F', 'G'];



    currencyColumns.forEach(col => {



      for (let i = 6; i <= filteredInvoices.length + 5; i++) {



        const cell = worksheet.getCell(`${col}${i}`);



        cell.numFmt = '#,##0.00';



      }



    });







    const buffer = await workbook.xlsx.writeBuffer();



    const blob = new Blob([buffer], { 



      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 



    });



    saveAs(blob, `invoices_${new Date().toISOString().split('T')[0]}.xlsx`);



  };







  const exportToPdf = async () => {



    const doc = new jsPDF();



    const pdfStyles = getPdfTableStyles();







    // Add branded header with logo



    const startY = await addPdfBrandedHeader(doc, 'Invoices Report');







    const headers = [



      'Invoice #',



      'Customer',



      'Date',



      'Due Date',



      'Amount',



      'Tax',



      'Total',



      'Status'



    ];



    



    const data = filteredInvoices.map(invoice => [



      formatInvoiceNumberDisplay(invoice.id),



      invoice.customer,



      new Date(invoice.date).toLocaleDateString('es-DO'),



      new Date(invoice.dueDate).toLocaleDateString('es-DO'),



      formatAmount(invoice.amount),



      formatAmount(invoice.tax),



      formatAmount(invoice.total),



      getStatusText(invoice.status)



    ]);



    



    (doc as any).autoTable({



      head: [headers],



      body: data,



      startY: startY,



      theme: 'grid',



      ...pdfStyles,



      columnStyles: {



        0: { cellWidth: 25 },



        1: { cellWidth: 40 },



        2: { cellWidth: 20 },



        3: { cellWidth: 20 },



        4: { cellWidth: 20 },



        5: { cellWidth: 20 },



        6: { cellWidth: 20 },



        7: { cellWidth: 20 }



      }



    });



    



    doc.save(`invoices_${new Date().toISOString().split('T')[0]}.pdf`);



  };







  const handleSaveNewInvoice = async (mode: 'draft' | 'final') => {

    if (isSavingNewInvoice) return;

    setIsSavingNewInvoice(true);



    const showError = (err: any, fallback: string) => {

      const parts: string[] = [];

      const message = err?.message ? String(err.message) : '';

      const code = err?.code ? String(err.code) : '';

      const details = err?.details ? String(err.details) : '';

      const hint = err?.hint ? String(err.hint) : '';

      if (message) parts.push(message);

      if (code) parts.push(`code: ${code}`);

      if (details) parts.push(`details: ${details}`);

      if (hint) parts.push(`hint: ${hint}`);

      if (parts.length === 0) {

        try {

          parts.push(JSON.stringify(err, null, 2));

        } catch {

          parts.push(fallback);

        }

      }

      alert(parts.join('\n'));

    };



    try {

      if (!user?.id) {

        alert('You must be logged in to create invoices');

        return;

      }



      const clientName = String(newInvoiceCustomerSearch || '').trim();

      if (!clientName) {

        alert(isManualNewCustomer ? 'Client name is required' : 'Please select an existing customer');

        return;

      }



      if (limits.invoicesPerMonth !== -1) {

        const currentMonth = new Date().toISOString().slice(0, 7);

        const invoicesThisMonth = invoices.filter(inv => inv.date.startsWith(currentMonth)).length;

        if (invoicesThisMonth >= limits.invoicesPerMonth) {

          alert(`You have reached the maximum number of invoices (${limits.invoicesPerMonth}) for this month. Please upgrade your plan to create more invoices.`);

          return;

        }

      }



      const isCashSale = mode === 'final' && newInvoiceSaleType === 'cash';

      if (isCashSale && !newInvoicePaymentMethod) {

        alert('You must select a payment method for cash sales');

        return;

      }



      const validItems = newInvoiceItems.filter((i) => {

        const desc = String(i.description || '').trim();

        const qty = Number(i.quantity) || 0;

        const price = Number(i.price);

        return desc.length > 0 && qty > 0 && Number.isFinite(price) && price >= 0;

      });

      if (validItems.length === 0) {

        alert('Add at least one line with quantity and price greater than 0');

        return;

      }



      const subtotal = newInvoiceSubtotal;

      const tax = newInvoiceTax;

      const total = newInvoiceTotal;

      const notesTrimmed = String(newInvoiceNotes ?? '').trim();



      let effectiveCustomerId = String(newInvoiceCustomerId || '').trim();



      if (!isManualNewCustomer && !effectiveCustomerId) {

        alert('Please select an existing customer, or enable New customer to enter manually.');

        return;

      }



      if (isManualNewCustomer && !effectiveCustomerId) {

        const emailKey = String(newInvoiceCustomerEmail || '').trim().toLowerCase();

        if (emailKey && emailKey.includes('@')) {

          const byEmail = customers.find((c) => String(c.email || '').trim().toLowerCase() === emailKey);

          if (byEmail?.id) {

            effectiveCustomerId = String(byEmail.id);

            setNewInvoiceCustomerId(String(byEmail.id));

          }

        }

      }



      if (isManualNewCustomer && !effectiveCustomerId) {

        const nameKey = String(clientName || '').trim().toLowerCase();

        if (nameKey) {

          const byName = customers.find((c) => String(c.name || '').trim().toLowerCase() === nameKey);

          if (byName?.id) {

            effectiveCustomerId = String(byName.id);

            setNewInvoiceCustomerId(String(byName.id));

          }

        }

      }



      if (isManualNewCustomer && !effectiveCustomerId) {

        const addressParts = [

          String(newInvoiceCustomerAddress || '').trim(),

          String(newInvoiceCustomerCity || '').trim(),

          String(newInvoiceCustomerState || '').trim(),

          String(newInvoiceCustomerZip || '').trim(),

        ].filter(Boolean);

        const address = addressParts.join(', ');



        const uniqueDocument = `AUTO-${Date.now()}`;

        const createdCustomer = await customersService.create(user.id, {

          name: clientName,

          document: uniqueDocument,

          phone: String(newInvoiceCustomerPhone || '').trim(),

          email: String(newInvoiceCustomerEmail || '').trim(),

          address,

          creditLimit: 0,

          status: 'active',

          paymentTermId: null,

        });



        effectiveCustomerId = String((createdCustomer as any)?.id || '');

        if (!effectiveCustomerId) {

          alert('Could not create customer');

          return;

        }



        setCustomers((prev) => {

          const exists = prev.some((c) => String(c.id) === String((createdCustomer as any)?.id));

          if (exists) return prev;

          return [

            {

              id: String((createdCustomer as any)?.id),

              name: (createdCustomer as any)?.name || clientName,

              email: (createdCustomer as any)?.email || String(newInvoiceCustomerEmail || '').trim(),

              document: (createdCustomer as any)?.document || '',

              phone: (createdCustomer as any)?.phone || String(newInvoiceCustomerPhone || '').trim(),

              address: (createdCustomer as any)?.address || address,

              customerTypeId: (createdCustomer as any)?.customer_type ?? null,

              paymentTermId: (createdCustomer as any)?.payment_term_id ?? null,

              ncfType: (createdCustomer as any)?.ncf_type ?? null,

              documentType: (createdCustomer as any)?.document_type ?? null,

              arAccountId: (createdCustomer as any)?.ar_account_id ?? null,

            } as any,

            ...prev,

          ];

        });

      }



      const invoicePayload = {

        customer_id: effectiveCustomerId,

        customer_name: String(newInvoiceCustomerSearch || '').trim() || null,

        invoice_date: newInvoiceDate,

        due_date: newInvoiceDueDate,

        currency: newInvoiceCurrency || baseCurrencyCode,

        subtotal,

        tax_amount: tax,

        total_amount: total,

        paid_amount: 0,

        status: mode === 'draft' ? 'draft' : 'pending',

        payment_term_id: newInvoicePaymentTermId || null,

        sales_rep_id: newInvoiceSalesRepId || null,

        notes: notesTrimmed || null,

        discount_type: newInvoiceDiscountType,

        discount_value: newInvoiceDiscountPercent,

        total_discount: (() => {

          const t = String(newInvoiceDiscountType || 'percentage');

          const v = Number(newInvoiceDiscountPercent) || 0;

          const grossSubtotal = validItems.reduce((sum, it) => sum + (Number(it.total) || 0), 0);

          const raw = t === 'fixed' ? v : grossSubtotal * (v / 100);

          if (!Number.isFinite(raw)) return 0;

          return Math.max(0, Math.min(grossSubtotal, raw));

        })(),

      };



      const linesPayload = validItems.map((item, index) => ({

        description: item.description,

        quantity: item.quantity,

        unit_price: item.price,

        line_total: item.total,

        line_number: index + 1,

        item_id: item.itemId ?? null,

      }));



      const created = await invoicesService.create(user.id, invoicePayload, linesPayload);



      // Optimistic update

      try {

        const createdInvoice = created?.invoice as any;

        if (createdInvoice?.id) {

          const subtotalNow = Number(createdInvoice.subtotal ?? subtotal) || 0;

          const taxNow = Number(createdInvoice.tax_amount ?? tax) || 0;

          const totalNow = Number(createdInvoice.total_amount ?? total) || subtotalNow + taxNow;



          const invCustomer = customers.find((c) => String(c.id) === String(effectiveCustomerId));

          const uiCustomerName = invCustomer?.name || String(newInvoiceCustomerSearch || '').trim() || 'Customer';

          const uiCustomerEmail = invCustomer?.email || String(newInvoiceCustomerEmail || '').trim();

          const uiCustomerPhone = invCustomer?.phone || String(newInvoiceCustomerPhone || '').trim();

          const uiCustomerAddress = invCustomer?.address || String(newInvoiceCustomerAddress || '').trim();



          const uiItems: UiInvoiceItem[] = validItems.map((it) => ({

            itemId: it.itemId ? String(it.itemId) : undefined,

            description: it.description,

            quantity: it.quantity,

            price: it.price,

            total: it.total,

          }));



          const nextUi: UiInvoice = {

            id: String(createdInvoice.invoice_number || createdInvoice.id),

            internalId: String(createdInvoice.id),

            customerId: String(effectiveCustomerId || createdInvoice.customer_id || ''),

            customer: uiCustomerName,

            customerEmail: uiCustomerEmail,

            customerDocument: invCustomer?.document || '',

            customerPhone: uiCustomerPhone,

            customerAddress: uiCustomerAddress,

            amount: subtotalNow,

            tax: taxNow,

            total: totalNow,

            status: mode === 'draft' ? 'draft' : 'pending',

            date: String(createdInvoice.invoice_date || newInvoiceDate),

            dueDate: String(createdInvoice.due_date || newInvoiceDueDate || createdInvoice.invoice_date || newInvoiceDate),

            items: uiItems.length > 0 ? uiItems : [],

            salesRepId: createdInvoice.sales_rep_id || null,

            salesRepName: null,

            currency: String(createdInvoice.currency || newInvoiceCurrency || baseCurrencyCode),

            baseTotal: totalNow,

            publicToken: createdInvoice.public_token || null,

            ncfExpiryDate: createdInvoice.ncf_expiry_date || null,

            storeName: createdInvoice.store_name || null,

            saleType: createdInvoice.sale_type || null,

            sequentialNumber: createdInvoice.sequential_number || null,

            notes: createdInvoice.notes ?? null,

            totalDiscount: Number(createdInvoice.total_discount ?? invoicePayload.total_discount ?? 0) || 0,

            discountType: (createdInvoice.discount_type ?? invoicePayload.discount_type ?? null) as any,

            discountValue: Number(createdInvoice.discount_value ?? invoicePayload.discount_value ?? 0) || 0,

          };



          setInvoices((prev) => {

            const exists = prev.some((x) => String(x.internalId) === String(nextUi.internalId));

            if (exists) return prev;

            return [nextUi, ...prev];

          });

        }

      } catch (optimisticError) {

        console.error('Error applying optimistic invoice update:', optimisticError);

      }



      setShowNewInvoiceModal(false);

      loadInvoices();

      alert(mode === 'draft' ? 'Invoice saved as draft' : 'Invoice created successfully');

    } catch (error: any) {

      console.error('Error creating invoice:', error);

      showError(error, 'Error creating the invoice');

    } finally {

      setIsSavingNewInvoice(false);

    }



  };







  useEffect(() => {



    return () => {



      if (documentPreviewUrl) {



        URL.revokeObjectURL(documentPreviewUrl);



      }



      setDocumentPreviewBlob(null);



      setDocumentPreviewUrl('');



    };



  }, [documentPreviewUrl]);







  useEffect(() => {



    if (!isClientPickerOpen) return;



    const onMouseDown = (e: MouseEvent) => {



      const el = clientPickerRef.current;



      if (!el) return;



      if (e.target instanceof Node && !el.contains(e.target)) {



        setIsClientPickerOpen(false);



      }



    };



    const onKeyDown = (e: KeyboardEvent) => {



      if (e.key === 'Escape') {



        setIsClientPickerOpen(false);



      }



    };



    document.addEventListener('mousedown', onMouseDown);

    document.addEventListener('keydown', onKeyDown);



    return () => {



      document.removeEventListener('mousedown', onMouseDown);

      document.removeEventListener('keydown', onKeyDown);



    };



  }, [isClientPickerOpen]);







  return (



    <DashboardLayout>



      <div className="space-y-8 bg-[#F4ECDC] min-h-screen rounded-[32px] p-6">



        <div className="flex flex-wrap items-center justify-between gap-4">



          <div>



            <span className="inline-flex text-xs font-semibold tracking-[0.2em] uppercase text-[#7A705A]">



              Billing



            </span>



            <h1 className="text-3xl font-semibold text-[#2F3D2E] mt-1">Invoicing Hub</h1>



            <p className="text-[#5F6652]">



              Generate invoices, manage fiscal documents, and monitor payment performance.



            </p>



          </div>



          <div className="flex flex-wrap gap-3">



            <button onClick={() => handleExportInvoices('pdf')} className={ACCENT_BUTTON_CLASSES}>



              <i className="ri-file-pdf-line" />



              <span>Export PDF</span>



            </button>



            <button onClick={() => handleExportInvoices('excel')} className={PRIMARY_BUTTON_CLASSES}>



              <i className="ri-file-excel-line" />



              <span>Export Excel</span>



            </button>



            <button onClick={handleCreateInvoice} className={SECONDARY_BUTTON_CLASSES}>



              <i className="ri-add-line" />



              <span>New Invoice</span>



            </button>



          </div>



        </div>







        {/* Stats Cards */}



        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">



          {[



            {



              label: 'Total Invoices',



              value: invoices.length,



              icon: 'ri-file-text-line',



              accent: 'bg-[#DDE7D0]',



            },



            {



              label: 'Paid Invoices',



              value: invoices.filter((inv) => inv.status === 'paid').length,



              icon: 'ri-check-line',



              accent: 'bg-[#E1EFE3]',



            },



            {



              label: 'Pending Invoices',



              value: invoices.filter((inv) => inv.status === 'pending').length,



              icon: 'ri-time-line',



              accent: 'bg-[#F3E9C8]',



            },



            {



              label: 'Overdue Invoices',



              value: invoices.filter((inv) => inv.status === 'overdue').length,



              icon: 'ri-alert-line',



              accent: 'bg-[#F7D8CF]',



            },



          ].map((card) => (



            <div key={card.label} className={`${BASE_CARD_CLASSES} p-6`}>



              <div className="flex items-center justify-between gap-4">



                <div>



                  <p className="text-sm font-medium text-[#5F6652]">{card.label}</p>



                  <p className="text-2xl font-semibold text-[#2F3D2E] mt-1">{card.value}</p>



                </div>



                <div className={`${ICON_WRAPPER_BASE} ${card.accent}`}>



                  <i className={`${card.icon} text-xl text-[#2F3D2E]`}></i>



                </div>



              </div>



            </div>



          ))}



        </div>







        {/* Filters */}



        <div className={`${BASE_CARD_CLASSES} p-6`}>



          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">



            <div>



              <label className="block text-sm font-medium text-[#5F6652] mb-2">Search</label>



              <div className="relative">



                <input



                  type="text"



                  placeholder="Search by customer or invoice number..."



                  value={searchTerm}



                  onChange={(e) => setSearchTerm(e.target.value)}



                  className="w-full pl-10 pr-4 py-2 border border-[#D9C8A9] rounded-lg focus:ring-2 focus:ring-[#3C4F3C] focus:border-[#3C4F3C] text-sm bg-white"



                />



                <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-[#7A705A]"></i>



              </div>



            </div>



            <div>



              <label className="block text-sm font-medium text-[#5F6652] mb-2">Status</label>



              <select



                value={statusFilter}



                onChange={(e) => setStatusFilter(e.target.value)}



                className="w-full px-3 py-2 border border-[#D9C8A9] rounded-lg focus:ring-2 focus:ring-[#3C4F3C] focus:border-[#3C4F3C] text-sm pr-8 bg-white"



              >



                <option value="all">All statuses</option>



                <option value="paid">Paid</option>



                <option value="pending">Pending</option>



                <option value="overdue">Overdue</option>



                <option value="draft">Drafts</option>



                <option value="cancelled">Cancelled</option>



              </select>



            </div>



            <div className="flex items-end">



              <button



                onClick={() => {



                  setSearchTerm('');



                  setStatusFilter('all');



                }}



                className={`${SECONDARY_BUTTON_CLASSES} w-full justify-center`}



              >



                <i className="ri-refresh-line" />



                <span>Clear Filters</span>



              </button>



            </div>



          </div>



        </div>







        {/* Invoices Table */}



        <div className="bg-gradient-to-br from-white to-[#faf9f5] rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-[#e8e0d0] overflow-hidden">



          <div className="p-6 border-b border-gray-200 flex items-center justify-between">



            <h3 className="text-xl font-bold text-gray-900">



              Invoices ({filteredInvoices.length})



            </h3>



          </div>



          <div className="overflow-x-auto">



            <table className="w-full">



              <thead className="bg-gradient-to-r from-[#f8f6f0] to-[#f0ece0]">



                <tr>



                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Number</th>



                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>



                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sales Rep</th>



                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>



                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Due Date</th>



                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>



                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>



                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>



                </tr>



              </thead>



              <tbody className="bg-white divide-y divide-[#e8e0d0]">



                {filteredInvoices.map((invoice) => {



                  const rep = salesReps.find((r) => r.id === invoice.salesRepId);



                  return (



                    <tr key={invoice.id} className="hover:bg-gradient-to-r hover:from-[#f8f6f0] hover:to-transparent transition-all duration-200">



                      <td className="px-6 py-4 whitespace-nowrap">



                        <div className="text-sm font-medium text-gray-900">{formatInvoiceNumberDisplay(invoice.id)}</div>



                      </td>



                      <td className="px-6 py-4 whitespace-nowrap">



                        <div className="text-sm text-gray-900">{invoice.customer}</div>



                        <div className="text-sm text-gray-500">{invoice.customerEmail}</div>



                      </td>



                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">



                        {rep ? rep.name : 'ÔÇö'}



                      </td>



                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">



                        {new Date(invoice.date).toLocaleDateString('es-DO')}



                      </td>



                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">



                        {new Date(invoice.dueDate).toLocaleDateString('es-DO')}



                      </td>



                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">



                        <div className="text-sm font-medium text-gray-900">



                          {formatAmount(invoice.total)}



                        </div>



                        {invoice.baseTotal != null && invoice.currency !== baseCurrencyCode && (



                          <div className="text-xs text-gray-500">



                            Ôëê {formatAmount(invoice.baseTotal)}



                          </div>



                        )}



                      </td>



                      <td className="px-6 py-4 whitespace-nowrap">



                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusBadgeClasses(invoice.status)}`}>



                          {getStatusText(invoice.status)}



                        </span>



                      </td>



                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">



                        <div className="flex space-x-2">



                          <button



                            onClick={() => handlePrintInvoice(invoice.id)}



                            className="text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 p-2 text-lg rounded"



                            title="Print invoice"



                          >



                            <i className="ri-printer-line"></i>



                          </button>



                          <button



                            onClick={() => handleViewInvoice(invoice.id)}



                            className="text-blue-600 hover:text-blue-900 p-1"



                            title="View invoice"



                          >



                            <i className="ri-eye-line"></i>



                          </button>



                          {invoice.status !== 'paid' && invoice.status !== 'cancelled' && (



                            <button



                              onClick={() => handleEditInvoice(invoice.id)}



                              className="text-green-600 hover:text-green-900 p-1"



                              title="Edit invoice"



                            >



                              <i className="ri-edit-line"></i>



                            </button>



                          )}



                          {invoice.status !== 'paid' && invoice.status !== 'cancelled' && (



                            <button



                              onClick={() => handleCancelInvoice(invoice.id)}



                              className="text-red-600 hover:text-red-900 p-1"



                              title="Cancel invoice"



                            >



                              <i className="ri-close-circle-line"></i>



                            </button>



                          )}



                          <button



                            onClick={() => handleExportInvoiceExcel(invoice.id)}



                            className="text-green-600 hover:text-green-900 p-1"



                            title="Export invoice to Excel"



                          >



                            <i className="ri-file-excel-2-line"></i>



                          </button>



                          <button



                            onClick={() => handleDuplicateInvoice(invoice.id)}



                            className="text-orange-600 hover:text-orange-900 p-1"



                            title="Duplicate invoice"



                          >



                            <i className="ri-file-copy-line"></i>



                          </button>



                        </div>



                      </td>



                    </tr>



                  );



                })}



              </tbody>



            </table>



          </div>



        </div>







        {/* Invoice Detail / Edit Modal */}



        {showInvoiceDetailModal && selectedInvoice && (



          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">



            <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">



              <div className="p-6 border-b border-gray-200 flex items-center justify-between">



                <div>



                  <h3 className="text-lg font-semibold text-gray-900">



                    {isEditingInvoice ? 'Edit Invoice' : 'Invoice Details'}



                  </h3>



                  <p className="text-sm text-gray-500">



                    {isEditingInvoice



                      ? 'Modify the invoice data and save changes (frontend only).'



                      : 'Invoice template preview.'}



                  </p>



                </div>



                <button



                  onClick={() => {



                    setShowInvoiceDetailModal(false);



                    setSelectedInvoice(null);



                    setIsEditingInvoice(false);



                  }}



                  className="text-gray-400 hover:text-gray-600"



                >



                  <i className="ri-close-line text-xl"></i>



                </button>



              </div>







              <div className="p-6">



                {(() => {



                  const invoice = invoices.find((inv) => inv.id === selectedInvoice);



                  if (!invoice) return null;







                  const handleFieldChange = (field: 'customer' | 'customerEmail' | 'date' | 'dueDate', value: string) => {



                    if (!isEditingInvoice) return;



                    setInvoices((prev) =>



                      prev.map((inv) =>



                        inv.id === invoice.id



                          ? {



                              ...inv,



                              [field]: value



                            }



                          : inv



                      )



                    );



                  };







                  const handleItemChange = (



                    index: number,



                    field: 'description' | 'quantity' | 'price',



                    value: string



                  ) => {



                    if (!isEditingInvoice) return;



                    setInvoices((prev) =>



                      prev.map((inv) => {



                        if (inv.id !== invoice.id) return inv as any;







                        const items = inv.items.map((item: any, i: number) => {



                          if (i !== index) return item;







                          const updated: any = { ...item };



                          if (field === 'description') {



                            updated.description = value;



                          } else {



                            const num = Number(value) || 0;



                            if (field === 'quantity') {



                              updated.quantity = num;



                            }



                            if (field === 'price') {



                              updated.price = num;



                            }



                          }



                          updated.total = (updated.quantity || 0) * (updated.price || 0);



                          return updated;



                        });







                        const newAmount = items.reduce(



                          (sum: number, item: any) => sum + (item.total || 0),



                          0



                        );



                        const newTax = Math.round(newAmount * 0.18);



                        const newTotal = newAmount + newTax;







                        return {



                          ...inv,



                          items,



                          amount: newAmount,



                          tax: newTax,



                          total: newTotal,



                        };



                      }),



                    );



                  };







                  const renderInvoiceDetail = () => (



                    <div className="space-y-6">



                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">



                        <div className="space-y-2">



                          <div className="text-xs font-medium text-gray-500">Customer</div>



                          {isEditingInvoice ? (



                            <input



                              type="text"



                              value={invoice.customer}



                              onChange={(e) => handleFieldChange('customer', e.target.value)}



                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"



                            />



                          ) : (



                            <div className="text-sm font-medium text-gray-900">{invoice.customer}</div>



                          )}



                          <div className="text-xs text-gray-500 mt-1">Email</div>



                          {isEditingInvoice ? (



                            <input



                              type="email"



                              value={invoice.customerEmail}



                              onChange={(e) => handleFieldChange('customerEmail', e.target.value)}



                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"



                            />



                          ) : (



                            <div className="text-sm text-gray-600">{invoice.customerEmail}</div>



                          )}



                        </div>



                        <div className="space-y-3">



                          <div>



                            <div className="text-xs font-medium text-gray-500">Date</div>



                            {isEditingInvoice ? (



                              <input



                                type="date"



                                value={invoice.date}



                                onChange={(e) => handleFieldChange('date', e.target.value)}



                                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"



                              />



                            ) : (



                              <div className="text-sm text-gray-900 mt-1">



                                {new Date(invoice.date).toLocaleDateString('es-DO')}



                              </div>



                            )}



                          </div>



                          <div>



                            <div className="text-xs font-medium text-gray-500">Due Date</div>



                            {isEditingInvoice ? (



                              <input



                                type="date"



                                value={invoice.dueDate}



                                onChange={(e) => handleFieldChange('dueDate', e.target.value)}



                                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"



                              />



                            ) : (



                              <div className="text-sm text-gray-900 mt-1">



                                {new Date(invoice.dueDate).toLocaleDateString('es-DO')}



                              </div>



                            )}



                          </div>



                        </div>



                      </div>







                      <div className="border border-gray-200 rounded-lg overflow-hidden">



                        <table className="w-full">



                          <thead className="bg-gray-50">



                            <tr>



                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>



                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Quantity</th>



                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Price</th>



                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total</th>



                            </tr>



                          </thead>



                          <tbody className="divide-y divide-gray-200">



                            {invoice.items.map((item, index) => (



                              <tr key={item.description ?? index}>



                                <td className="px-4 py-2 text-sm text-gray-900">



                                  {isEditingInvoice ? (



                                    <input



                                      type="text"



                                      value={item.description}



                                      onChange={(e) => handleItemChange(index, 'description', e.target.value)}



                                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm"



                                    />



                                  ) : (



                                    item.description



                                  )}



                                </td>



                                <td className="px-4 py-2 text-sm text-gray-900 text-right">



                                  {isEditingInvoice ? (



                                    <input



                                      type="number"



                                      min={0}



                                      value={item.quantity}



                                      onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}



                                      className="w-20 px-2 py-1 border border-gray-300 rounded text-sm text-right"



                                    />



                                  ) : (



                                    item.quantity



                                  )}



                                </td>



                                <td className="px-4 py-2 text-sm text-gray-900 text-right">



                                  {isEditingInvoice ? (



                                    <input



                                      type="number"



                                      min={0}



                                      value={item.price}



                                      onChange={(e) => handleItemChange(index, 'price', e.target.value)}



                                      className="w-24 px-2 py-1 border border-gray-300 rounded text-sm text-right"



                                    />



                                  ) : (



                                    <>{formatMoney(item.price)}</>



                                  )}



                                </td>



                                <td className="px-4 py-2 text-sm text-gray-900 text-right">



                                  {formatMoney(item.total)}



                                </td>



                              </tr>



                            ))}



                          </tbody>



                          <tfoot className="bg-gray-50">



                            <tr>



                              <td colSpan={3} className="px-4 py-2 text-right text-xs text-gray-500">Subtotal</td>



                              <td className="px-4 py-2 text-right text-sm font-semibold text-gray-900">{formatMoney(invoice.amount)}</td>



                            </tr>



                            <tr>



                              <td colSpan={3} className="px-4 py-2 text-right text-xs text-gray-500">Tax ({(taxConfig?.itbis_rate ?? 18).toFixed(2)}%)</td>



                              <td className="px-4 py-2 text-right text-sm font-semibold text-gray-900">{formatMoney(invoice.tax)}</td>



                            </tr>



                            <tr>



                              <td colSpan={3} className="px-4 py-2 text-right text-xs font-semibold text-gray-700">Total</td>



                              <td className="px-4 py-2 text-right text-base font-bold text-gray-900">{formatMoney(invoice.total)}</td>



                            </tr>



                          </tfoot>



                        </table>



                      </div>



                    </div>



                  );







                  return (



                    <div className="space-y-6">



                      {renderInvoiceDetail()}



                      <div className="border border-gray-200 rounded-lg overflow-hidden">



                        <table className="w-full">



                          <thead className="bg-gray-50">



                            <tr>



                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">



                                Description



                              </th>



                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">



                                Quantity



                              </th>



                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">



                                Price



                              </th>



                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">



                                Total



                              </th>



                            </tr>



                          </thead>



                          <tbody className="divide-y divide-gray-200">



                            {invoice.items.map((item, index) => (



                              <tr key={item.description ?? index}>



                                <td className="px-4 py-2 text-sm text-gray-900">



                                  {isEditingInvoice ? (



                                    <input



                                      type="text"



                                      value={item.description}



                                      onChange={(e) => handleItemChange(index, 'description', e.target.value)}



                                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm"



                                    />



                                  ) : (



                                    item.description



                                  )}



                                </td>



                                <td className="px-4 py-2 text-sm text-gray-900 text-right">



                                  {isEditingInvoice ? (



                                    <input



                                      type="number"



                                      min={0}



                                      value={item.quantity}



                                      onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}



                                      className="w-20 px-2 py-1 border border-gray-300 rounded text-sm text-right"



                                    />



                                  ) : (



                                    item.quantity



                                  )}



                                </td>



                                <td className="px-4 py-2 text-sm text-gray-900 text-right">



                                  {isEditingInvoice ? (



                                    <input



                                      type="number"



                                      min={0}



                                      value={item.price}



                                      onChange={(e) => handleItemChange(index, 'price', e.target.value)}



                                      className="w-24 px-2 py-1 border border-gray-300 rounded text-sm text-right"



                                    />



                                  ) : (



                                    <>{formatMoney(item.price)}</>



                                  )}



                                </td>



                                <td className="px-4 py-2 text-sm text-gray-900 text-right">



                                  {formatMoney(item.total)}



                                </td>



                              </tr>



                            ))}



                          </tbody>



                        </table>



                      </div>



                    </div>



                  );



                })()}



              </div>







              <div className="p-6 border-t border-gray-200 flex justify-end space-x-3">



                <button



                  onClick={() => {



                    setShowInvoiceDetailModal(false);



                    setSelectedInvoice(null);



                    setIsEditingInvoice(false);



                  }}



                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap"



                >



                  Close



                </button>



                {isEditingInvoice && (



                  <button



                    onClick={handleSaveInvoiceChanges}



                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"



                  >



                    Save Changes



                  </button>



                )}



              </div>



            </div>



          </div>



        )}







        {/* New Invoice Modal */}



        {showNewInvoiceModal && (



          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">



            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">



              <div className="p-6 border-b border-gray-200">



                <div className="flex items-center justify-between">



                  <div>



                    <h3 className="text-lg font-semibold text-gray-900">Client & Items</h3>



                    <p className="text-sm text-gray-500">Update client info, terms, and line items.</p>



                  </div>



                  <button



                    onClick={() => setShowNewInvoiceModal(false)}



                    className="text-gray-400 hover:text-gray-600"



                  >



                    <i className="ri-close-line text-xl"></i>



                  </button>



                </div>



              </div>



              <div className="p-6">



                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">



                  <div>



                    <label className="block text-sm font-medium text-gray-700 mb-2">Client name</label>



                    <div className="flex items-center justify-between mb-2">



                      <label className="inline-flex items-center gap-2 text-xs text-gray-600 select-none">



                        <input



                          type="checkbox"



                          checked={isManualNewCustomer}



                          onChange={(e) => {



                            const next = e.target.checked;



                            setIsManualNewCustomer(next);



                            if (next) {



                              setNewInvoiceCustomerId('');



                              setIsClientPickerOpen(false);



                            } else {



                              // Switching back to existing customer selection

                              setNewInvoiceCustomerId('');



                              setNewInvoiceCustomerSearch('');



                              setNewInvoiceCustomerEmail('');



                              setNewInvoiceCustomerPhone('');



                              setNewInvoiceCustomerAddress('');



                              setNewInvoiceCustomerCity('');



                              setNewInvoiceCustomerState('');



                              setNewInvoiceCustomerZip('');



                              setIsClientPickerOpen(true);



                            }



                          }}



                        />



                        New customer (manual)



                      </label>



                    </div>



                    <div ref={clientPickerRef} className="relative">



                      <input



                        type="text"



                        value={newInvoiceCustomerSearch}



                        onFocus={() => {



                          if (!isManualNewCustomer) setIsClientPickerOpen(true);



                        }}



                        onChange={(e) => {



                          const val = e.target.value;



                          setNewInvoiceCustomerSearch(val);



                          if (!isManualNewCustomer) {



                            setIsClientPickerOpen(true);



                          }



                        }}



                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-10"





                        placeholder={



                          isManualNewCustomer



                            ? 'Enter customer name...'



                            : 'Start typing to select a customer...'



                        }



                      />



                      <button



                        type="button"



                        onClick={() => setIsClientPickerOpen((v) => !v)}



                        disabled={isManualNewCustomer}



                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"



                        aria-label="Toggle customer list"



                      >



                        <i className="ri-arrow-down-s-line text-xl" />



                      </button>



                      {newInvoiceCustomerId ? (



                        <button



                          type="button"



                          onClick={() => {



                            setNewInvoiceCustomerId('');



                            setNewInvoiceCustomerSearch('');



                            setNewInvoiceCustomerEmail('');



                            setNewInvoiceCustomerPhone('');



                            setNewInvoiceCustomerAddress('');



                            setNewInvoiceCustomerCity('');



                            setNewInvoiceCustomerState('');



                            setNewInvoiceCustomerZip('');



                            setIsClientPickerOpen(true);



                          }}



                          className="absolute right-10 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"



                          aria-label="Clear selected customer"



                          title="Clear selected customer"



                        >



                          <i className="ri-close-circle-line text-lg" />



                        </button>



                      ) : null}



                      {!isManualNewCustomer && isClientPickerOpen && (



                        <div className="absolute z-50 mt-2 w-full rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden">



                          <div className="max-h-56 overflow-auto">



                            {customers



                              .filter((c) =>



                                !newInvoiceCustomerSearch



                                  ? true



                                  : String(c.name || '')



                                    .toLowerCase()



                                    .includes(String(newInvoiceCustomerSearch || '').toLowerCase())



                              )



                              .slice(0, 50)



                              .map((c) => (



                                <button



                                  type="button"



                                  key={c.id}



                                  onClick={() => {



                                    setNewInvoiceCustomerId(c.id);



                                    setNewInvoiceCustomerSearch(c.name || '');



                                    setNewInvoiceCustomerEmail(c.email || '');



                                    setNewInvoiceCustomerPhone(c.phone || '');



                                    const parsed = parseCustomerAddressFields(String(c.address || '').trim());



                                    setNewInvoiceCustomerAddress(parsed.street);



                                    setNewInvoiceCustomerCity(parsed.city);



                                    setNewInvoiceCustomerState(parsed.state);



                                    setNewInvoiceCustomerZip(parsed.zip);



                                    setIsClientPickerOpen(false);



                                  }}



                                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 focus:outline-none focus:bg-gray-50"



                                >



                                  <div className="font-medium text-gray-900">{c.name}</div>



                                  {c.document ? (



                                    <div className="text-xs text-gray-500">{c.document}</div>



                                  ) : null}



                                </button>



                              ))}



                            {customers.length === 0 ? (



                              <div className="px-3 py-2 text-sm text-gray-500">No customers found.</div>



                            ) : null}



                          </div>



                        </div>



                      )}



                    </div>



                  </div>



                  <div>



                    <label className="block text-sm font-medium text-gray-700 mb-2">Client email</label>



                    <input



                      type="email"



                      value={newInvoiceCustomerEmail}



                      onChange={(e) => setNewInvoiceCustomerEmail(e.target.value)}



                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"



                    />



                  </div>



                  <div>



                    <label className="block text-sm font-medium text-gray-700 mb-2">Client phone</label>



                    <input



                      type="text"



                      value={newInvoiceCustomerPhone}



                      onChange={(e) => setNewInvoiceCustomerPhone(e.target.value)}



                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"



                    />



                  </div>



                  <div>



                    <label className="block text-sm font-medium text-gray-700 mb-2">Client address</label>



                    <input



                      type="text"



                      value={newInvoiceCustomerAddress}



                      onChange={(e) => setNewInvoiceCustomerAddress(e.target.value)}



                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"



                    />



                  </div>



                  <div>



                    <label className="block text-sm font-medium text-gray-700 mb-2">City</label>



                    <input



                      type="text"



                      autoComplete="address-level2"



                      value={newInvoiceCustomerCity}



                      onChange={(e) => setNewInvoiceCustomerCity(e.target.value)}



                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"



                    />



                  </div>



                  <div>



                    <label className="block text-sm font-medium text-gray-700 mb-2">State</label>



                    <input



                      type="text"



                      autoComplete="address-level1"



                      value={newInvoiceCustomerState}



                      onChange={(e) => setNewInvoiceCustomerState(e.target.value)}



                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"



                    />



                  </div>



                  <div className="md:col-span-2">



                    <label className="block text-sm font-medium text-gray-700 mb-2">ZIP</label>



                    <input



                      type="text"



                      autoComplete="postal-code"



                      value={newInvoiceCustomerZip}



                      onChange={(e) => setNewInvoiceCustomerZip(e.target.value)}



                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"



                    />



                  </div>



                </div>







                <div className="mt-6">



                  <h4 className="text-md font-medium text-gray-900 mb-4">Products/Services</h4>



                  <div className="border border-gray-200 rounded-lg overflow-hidden">



                    <table className="w-full">



                      <thead className="bg-gray-50">



                        <tr>



                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>



                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quantity</th>



                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>



                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Taxable</th>



                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>



                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>



                        </tr>



                      </thead>



                      <tbody>



                        {newInvoiceItems.map((item, index) => (



                          <tr key={index}>



                            <td className="px-4 py-3">



                              <div className="space-y-2">



                                <select



                                  value={item.itemId || ''}



                                  onChange={(e) => {



                                    const selectedId = e.target.value;



                                    const invItem = inventoryItems.find((it: any) => String(it.id) === selectedId);



                                    setNewInvoiceItems((prev) => {



                                      const next = [...prev];



                                      if (invItem) {



                                        const rawPrice =



                                          invItem.selling_price ??



                                          invItem.sale_price ??



                                          invItem.price ??



                                          invItem.cost_price ??



                                          0;



                                        const price = Number(rawPrice) || 0;



                                        const qty = next[index].quantity || 1;



                                        next[index] = {



                                          ...next[index],



                                          itemId: selectedId || undefined,



                                          description: invItem.name || '',



                                          price,



                                          total: qty * price,



                                        };



                                      }



                                      recalcNewInvoiceTotals(next);



                                      return next;



                                    });



                                  }}



                                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm"



                                >



                                  <option value="">-- Select inventory item (optional) --</option>



                                  {inventoryItems.map((it: any) => (



                                    <option key={it.id} value={String(it.id)}>



                                      {it.name}



                                    </option>



                                  ))}



                                </select>



                                <input



                                  type="text"



                                  value={item.description}



                                  onChange={(e) => {



                                    const desc = e.target.value;



                                    setNewInvoiceItems((prev) => {



                                      const next = [...prev];



                                      next[index] = { ...next[index], description: desc, itemId: undefined };



                                      next[index].total = (next[index].quantity || 0) * (next[index].price || 0);



                                      recalcNewInvoiceTotals(next);



                                      return next;



                                    });



                                  }}



                                  placeholder="Product/service description"



                                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm"



                                />



                              </div>



                            </td>



                            <td className="px-4 py-3">



                              <input



                                type="number"



                                min="1"



                                value={item.quantity}



                                onChange={(e) => {



                                  const qty = Number(e.target.value) || 0;



                                  setNewInvoiceItems((prev) => {



                                    const next = [...prev];



                                    next[index] = { ...next[index], quantity: qty, total: qty * (next[index].price || 0) };



                                    recalcNewInvoiceTotals(next);



                                    return next;



                                  });



                                }}



                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"



                              />



                            </td>



                            <td className="px-4 py-3">



                              <input



                                type="number"



                                min="0"



                                value={item.price}



                                onChange={(e) => {



                                  const price = Number(e.target.value) || 0;



                                  setNewInvoiceItems((prev) => {



                                    const next = [...prev];



                                    next[index] = { ...next[index], price, total: price * (next[index].quantity || 0) };



                                    recalcNewInvoiceTotals(next);



                                    return next;



                                  });



                                }}



                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"



                              />



                            </td>



                            <td className="px-4 py-3">



                              <span className="text-sm font-medium">{formatMoney(item.total)}</span>



                            </td>



                            <td className="px-4 py-3">



                              <button



                                onClick={() => {



                                  setNewInvoiceItems((prev) => {



                                    const next = prev.filter((_, i) => i !== index);



                                    if (next.length === 0) {



                                      next.push({ itemId: undefined, description: '', quantity: 1, price: 0, total: 0, taxable: true });



                                    }



                                    recalcNewInvoiceTotals(next);



                                    return next;



                                  });



                                }}



                                className="text-red-600 hover:text-red-800"



                              >



                                <i className="ri-delete-bin-line"></i>



                              </button>



                            </td>



                          </tr>



                        ))}



                      </tbody>



                    </table>



                  </div>



                  <button



                    className="mt-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap"



                    onClick={() => {



                      setNewInvoiceItems((prev) => {



                        const next = [...prev, { itemId: undefined, description: '', quantity: 1, price: 0, total: 0, taxable: true }];



                        recalcNewInvoiceTotals(next);



                        return next;



                      });



                    }}



                  >



                    <i className="ri-add-line mr-2"></i>



                    Add Line



                  </button>



                </div>







                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">



                  <div>



                    <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>



                    <textarea



                      rows={4}



                      value={newInvoiceNotes}



                      onChange={(e) => setNewInvoiceNotes(e.target.value)}



                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"



                      placeholder="Additional notes..."



                    ></textarea>



                  </div>



                  <div className="bg-gray-50 p-4 rounded-lg">



                    <div className="space-y-2">



                      <div className="flex justify-between">



                        <span className="text-sm text-gray-600">Subtotal:</span>



                        <span className="text-sm font-medium">{formatMoney(newInvoiceSubtotal)}</span>



                      </div>



                      <div className="flex justify-between items-center space-x-2">



                        <span className="text-sm text-gray-600">Global Discount:</span>



                        <div className="flex items-center space-x-2">



                          <select



                            value={newInvoiceDiscountType}



                            onChange={(e) => {



                              const t = e.target.value === 'fixed' ? 'fixed' : 'percentage';



                              setNewInvoiceDiscountType(t);



                              recalcNewInvoiceTotals([...newInvoiceItems], t, newInvoiceDiscountPercent, newInvoiceNoTax);



                            }}



                            className="px-2 py-1 border border-gray-300 rounded text-sm"



                          >



                            <option value="percentage">% Percentage</option>



                            <option value="fixed">Amount</option>



                          </select>



                          <input



                            type="number"



                            min={0}



                            value={newInvoiceDiscountPercent}



                            onChange={(e) => {



                              const val = Number(e.target.value) || 0;



                              setNewInvoiceDiscountPercent(val);



                              recalcNewInvoiceTotals([...newInvoiceItems], newInvoiceDiscountType, val, newInvoiceNoTax);



                            }}



                            className="w-24 px-2 py-1 border border-gray-300 rounded text-sm text-right"



                          />



                        </div>



                      </div>



                      <div className="flex justify-between">



                        <span className="text-sm text-gray-600">Tax ({currentItbisRate.toFixed(2)}%):</span>



                        <span className="text-sm font-medium">{formatMoney(newInvoiceTax)}</span>



                      </div>



                      <div className="border-t border-gray-200 pt-2">



                        <div className="flex justify-between">



                          <span className="text-base font-semibold">Total:</span>



                          <span className="text-base font-semibold">{formatMoney(newInvoiceTotal)}</span>



                        </div>



                      </div>



                    </div>



                  </div>



                </div>



              </div>



              <div className="p-6 border-t border-gray-200 flex justify-end space-x-3">



                <button



                  onClick={() => setShowNewInvoiceModal(false)}



                  disabled={isSavingNewInvoice}



                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap"



                >



                  Cancel



                </button>



                <button



                  onClick={() => handleSaveNewInvoice('draft')}



                  disabled={isSavingNewInvoice}



                  className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors whitespace-nowrap"



                >



                  Save Draft



                </button>



                <button



                  onClick={() => handleSaveNewInvoice('final')}



                  disabled={isSavingNewInvoice}



                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"



                >



                  Create Invoice



                </button>



              </div>



            </div>



          </div>



        )}







        {/* Print Type Modal */}



        <InvoiceTypeModal



          isOpen={showPrintTypeModal}



          onClose={() => {



            setShowPrintTypeModal(false);



            setInvoiceToPrint(null);



          }}



          onSelect={handlePrintTypeSelect}



          documentType="invoice"



          hiddenTypes={['job-estimate', 'quotation', 'simple', 'detailed', 'corporate']}



          title="Select Invoice Format"



          customerEmail={



            invoiceToPrint && !isGeneralCustomerName(invoiceToPrint.customer)



              ? invoiceToPrint.customerEmail



              : undefined



          }



          onSendEmail={async (templateType, options) => {



            if (!invoiceToPrint) return;



            const fullCustomer = invoiceToPrint.customerId



              ? customers.find((c) => c.id === invoiceToPrint.customerId)



              : undefined;



            const email = fullCustomer?.email || invoiceToPrint.customerEmail;



            if (!email || !email.includes('@')) {



              alert('Customer email not available');



              return;



            }



            let freshCompanyInfo: any = null;



            try {



              freshCompanyInfo = await settingsService.getCompanyInfo();



            } catch {



              freshCompanyInfo = null;



            }



            const invoiceData = {



              invoiceNumber: invoiceToPrint.id,



              createdBy: createdByName,



              date: invoiceToPrint.date,



              dueDate: invoiceToPrint.dueDate,



              amount: invoiceToPrint.total,



              subtotal:

                Number(invoiceToPrint.amount || 0) +

                Number((invoiceToPrint as any).totalDiscount ?? (invoiceToPrint as any).total_discount ?? 0),



              tax: invoiceToPrint.tax,



              total_discount: (invoiceToPrint as any).totalDiscount ?? (invoiceToPrint as any).total_discount ?? 0,



              discount_type: (invoiceToPrint as any).discountType ?? (invoiceToPrint as any).discount_type ?? undefined,



              discount_value: (invoiceToPrint as any).discountValue ?? (invoiceToPrint as any).discount_value ?? undefined,



              items: invoiceToPrint.items.map((item) => ({



                description: item.description,



                quantity: item.quantity,



                price: item.price,



                total: item.total,



              })),



              notes: (invoiceToPrint as any).notes || null,



            };



            const customerData = {



              name: invoiceToPrint.customer || fullCustomer?.name || 'Customer',



              document: fullCustomer?.document || invoiceToPrint.customerDocument,



              phone: fullCustomer?.phone || invoiceToPrint.customerPhone,



              email: fullCustomer?.email || invoiceToPrint.customerEmail,



              address: fullCustomer?.address || invoiceToPrint.customerAddress,



            };



            const companyData = {



              name: (freshCompanyInfo as any)?.name || (freshCompanyInfo as any)?.company_name || 'Send Bill Now',



              rnc: (freshCompanyInfo as any)?.rnc || (freshCompanyInfo as any)?.tax_id,



              phone: (freshCompanyInfo as any)?.phone,



              email: (freshCompanyInfo as any)?.email,



              address: (freshCompanyInfo as any)?.address,



              city: (freshCompanyInfo as any)?.city,



              state: (freshCompanyInfo as any)?.state,



              zip: (freshCompanyInfo as any)?.zip,



              logo: (freshCompanyInfo as any)?.logo,



              facebook: (freshCompanyInfo as any)?.facebook || '',



              instagram: (freshCompanyInfo as any)?.instagram || '',



              twitter: (freshCompanyInfo as any)?.twitter || '',



              linkedin: (freshCompanyInfo as any)?.linkedin || '',



              youtube: (freshCompanyInfo as any)?.youtube || '',



              tiktok: (freshCompanyInfo as any)?.tiktok || '',



              whatsapp: (freshCompanyInfo as any)?.whatsapp || '',



            };



            try {



              const invoiceHtml = generateInvoiceHtml(invoiceData, customerData, companyData, templateType, options);



              const pdfBase64 = await generatePdfBase64FromHtml(invoiceHtml);



              const res = await fetch('/api/send-receipt-email', {



                method: 'POST',



                headers: { 'Content-Type': 'application/json' },



                body: JSON.stringify({



                  to: email,



                  subject: `Invoice ${invoiceToPrint.id}`,



                  invoiceNumber: invoiceToPrint.id,



                  customerName: customerData.name,



                  total: invoiceToPrint.total,



                  pdfBase64,



                }),



              });



              if (!res.ok) {



                const errData = await res.json().catch(() => ({}));



                throw new Error(errData.error || 'Failed to send email');



              }



              alert('Email sent successfully!');



            } catch (err: any) {



              console.error('Error sending invoice email:', err);



              alert(err.message || 'Failed to send email');



            }



          }}



        />



      </div>



    </DashboardLayout>



  );



}

