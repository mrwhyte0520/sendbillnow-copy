import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import * as QRCode from 'qrcode';
import { formatAmount, formatMoney } from '../../../utils/numberFormat';

import { useAuth } from '../../../hooks/useAuth';
import {
  bankAccountsService,
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
  storesService,
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
  id: string; // número visible (NCF)
  internalId: string; // id real en DB
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
  saleType?: 'credit' | 'cash' | null;
  sequentialNumber?: number | null;
}

export default function InvoicingPage() {
  const { user } = useAuth();
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
  const [stores, setStores] = useState<Array<{ id: string; name: string; is_active?: boolean }>>([]);

  const [taxConfig, setTaxConfig] = useState<{ itbis_rate: number } | null>(null);

  const [newInvoiceCustomerId, setNewInvoiceCustomerId] = useState('');
  const [newInvoiceCustomerSearch, setNewInvoiceCustomerSearch] = useState('');
  const [newInvoiceDate, setNewInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [newInvoicePaymentTermId, setNewInvoicePaymentTermId] = useState<string | null>(null);
  const [newInvoiceDueDate, setNewInvoiceDueDate] = useState(newInvoiceDate);
  const [newInvoiceSalesRepId, setNewInvoiceSalesRepId] = useState<string | null>(null);
  const [newInvoiceCurrency, setNewInvoiceCurrency] = useState<string>('DOP');
  const [newInvoiceDiscountType, setNewInvoiceDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [newInvoiceDiscountPercent, setNewInvoiceDiscountPercent] = useState(0);
  const [newInvoiceNoTax, setNewInvoiceNoTax] = useState(false);
  const [newInvoiceNotes, setNewInvoiceNotes] = useState('');
  const [newInvoiceStoreName, setNewInvoiceStoreName] = useState('Main Store');
  const [newInvoiceSaleType, setNewInvoiceSaleType] = useState<'credit' | 'cash'>('credit');
  const [newInvoiceDocumentType, setNewInvoiceDocumentType] = useState<string>('');
  const [ncfSeries, setNcfSeries] = useState<any[]>([]);
  const [newInvoicePaymentMethod, setNewInvoicePaymentMethod] = useState<string>('');
  const [newInvoiceBankAccountId, setNewInvoiceBankAccountId] = useState<string>('');
  const [newInvoicePaymentReference, setNewInvoicePaymentReference] = useState<string>('');
  const [bankAccounts, setBankAccounts] = useState<Array<{ id: string; name: string; chartAccountId: string | null }>>([]);

  type NewItem = { itemId?: string; description: string; quantity: number; price: number; total: number };
  const [newInvoiceItems, setNewInvoiceItems] = useState<NewItem[]>([
    { itemId: undefined, description: '', quantity: 1, price: 0, total: 0 },
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
    let discountAmount = 0;
    if (discountType === 'percentage') {
      discountAmount = rawSubtotal * (discountValue / 100);
    } else if (discountType === 'fixed') {
      discountAmount = discountValue;
    }
    if (discountAmount > rawSubtotal) {
      discountAmount = rawSubtotal;
    }
    const subtotal = rawSubtotal - discountAmount;
    const tax = noTaxFlag ? 0 : subtotal * (currentItbisRate / 100);
    const total = subtotal + tax;
    setNewInvoiceSubtotal(subtotal);
    setNewInvoiceTax(tax);
    setNewInvoiceTotal(total);
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
          customerId: String((inv as any).customer_id || customerData.id || ''),
          customer: customerData.name || 'Customer',
          customerEmail: customerData.email || '',
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
        };
      }));

      setInvoices(mapped);
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
        const [terms, reps, storesData] = await Promise.all([
          paymentTermsService.getAll(user.id),
          salesRepsService.getAll(user.id),
          storesService.getAll(user.id),
        ]);

        const mappedTerms = (terms || []).map((t: any) => ({
          id: t.id as string,
          name: t.name as string,
          days: typeof t.days === 'number' ? t.days : undefined,
        }));
        setPaymentTerms(mappedTerms);
        setSalesReps((reps || []).filter((r: any) => r.is_active));
        setStores((storesData || []).filter((s: any) => s.is_active !== false));
      } catch (error) {
        console.error('Error loading payment terms for invoicing:', error);
      }
    };
    loadPaymentTerms();
  }, [user?.id]);

  useEffect(() => {
    const loadNcfSeries = async () => {
      if (!user?.id) {
        setNcfSeries([]);
        return;
      }
      try {
        const series = await taxService.getNcfSeries(user.id);
        setNcfSeries((series || []).filter((s: any) => s.status === 'active'));
      } catch (error) {
        console.error('Error cargando series NCF:', error);
        setNcfSeries([]);
      }
    };
    loadNcfSeries();
  }, [user?.id]);

  useEffect(() => {
    const loadBankAccounts = async () => {
      if (!user?.id) return;
      try {
        const data = await bankAccountsService.getAll(user.id);
        const mapped = (data || []).map((b: any) => ({
          id: String(b.id),
          name: String(b.name || ''),
          chartAccountId: b.chart_account_id ? String(b.chart_account_id) : null,
        }));
        setBankAccounts(mapped);
      } catch (error) {
        console.error('Error loading bank accounts for invoicing:', error);
        setBankAccounts([]);
      }
    };
    loadBankAccounts();
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
    paid: 'bg-[#DDE7D0] text-[#2F3D2E]',
    pending: 'bg-[#F3E9C8] text-[#7A705A]',
    overdue: 'bg-[#F7D8CF] text-[#7C392C]',
    draft: 'bg-[#E5E2D9] text-[#7A705A]',
    cancelled: 'bg-[#E0D8C5] text-[#7A705A]',
  };

  const getStatusBadgeClasses = (status: UiInvoice['status']) =>
    STATUS_BADGE_CLASSES[status] || 'bg-[#E5E2D9] text-[#7A705A]';

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
    const matchesSearch = invoice.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         invoice.id.toLowerCase().includes(searchTerm.toLowerCase());
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
    setNewInvoiceItems([{ itemId: undefined, description: '', quantity: 1, price: 0, total: 0 }]);
    setNewInvoiceSubtotal(0);
    setNewInvoiceTax(0);
    setNewInvoiceTotal(0);
    setNewInvoiceDiscountType('percentage');
    setNewInvoiceDiscountPercent(0);
    setNewInvoiceNoTax(false);
    setNewInvoiceNotes('');
    setNewInvoiceCustomerSearch('');
    setNewInvoiceSaleType('credit');
    setNewInvoicePaymentMethod('');
    setNewInvoiceBankAccountId('');
    setNewInvoicePaymentReference('');

    const activeSeries = (ncfSeries || []).find((s: any) => s.status === 'active');
    setNewInvoiceDocumentType(activeSeries?.document_type || 'B02');

    const defaultStore = stores.find((s) => s.is_active !== false) || stores[0];
    setNewInvoiceStoreName(defaultStore?.name || 'Main Store');

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

  const handlePrintInvoice = async (invoiceId: string) => {
    const invoice = invoices.find((inv) => inv.id === invoiceId);
    if (!invoice) return;

    const fullCustomer = invoice.customerId
      ? customers.find((c) => c.id === invoice.customerId)
      : undefined;

    const printCustomerDocument = fullCustomer?.document || invoice.customerDocument || '';
    const printCustomerPhone = fullCustomer?.phone || invoice.customerPhone || '';
    const printCustomerEmail = fullCustomer?.email || invoice.customerEmail || '';
    const printCustomerAddress = fullCustomer?.address || invoice.customerAddress || '';

    const companyName = (companyInfo as any)?.name || (companyInfo as any)?.company_name || 'ContaBi';
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
          <title>Invoice ${invoice.id}</title>
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
                <div class="doc-number">NCF: ${invoice.id}</div>
                <div class="doc-kv">
                  ${invoice.ncfExpiryDate ? `<div><strong>Valid until:</strong> ${new Date(invoice.ncfExpiryDate).toLocaleDateString('es-DO')}</div>` : ''}
                  ${invoice.sequentialNumber ? `<div><strong>Invoice Number:</strong> ${invoice.sequentialNumber}</div>` : ''}
                  ${invoice.salesRepName ? `<div><strong>Sales Rep:</strong> ${invoice.salesRepName}</div>` : ''}
                  <div><strong>Currency:</strong> ${invoice.currency === 'DOP' ? 'Dominican Peso' : invoice.currency}</div>
                  ${invoice.storeName ? `<div><strong>Store:</strong> ${invoice.storeName}</div>` : ''}
                  <div><strong>Payment Due Date:</strong> ${new Date(invoice.dueDate).toLocaleDateString('es-DO')}</div>
                </div>
                ${qrDataUrl ? `<img class="qr" alt="QR" src="${qrDataUrl}" />` : ''}
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
                  <div class="totals-row"><div class="label">ITBIS (${itbisLabel}%)</div><div class="value"> ${formatAmount(invoice.tax)}</div></div>
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
                <div class="notes-body">Thank you for your purchase.</div>
              </div>
              <div></div>
            </div>
          </div>
        </body>
      </html>
    `;

    openHtmlPreview(html, `Invoice #${invoice.id}`, `invoice-${invoice.id}.html`);
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
      'ContaBi';

    const companyRnc =
      (companyInfo as any)?.rnc ||
      (companyInfo as any)?.tax_id ||
      (companyInfo as any)?.ruc ||
      '';

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Invoice');

    worksheet.mergeCells('A1:D1');
    worksheet.getCell('A1').value = companyName;
    worksheet.getCell('A1').font = { bold: true, size: 16 };
    worksheet.getCell('A1').alignment = { horizontal: 'center' } as any;

    if (companyRnc) {
      worksheet.mergeCells('A2:D2');
      worksheet.getCell('A2').value = `RNC: ${companyRnc}`;
      worksheet.getCell('A2').alignment = { horizontal: 'center' } as any;
      worksheet.getCell('A2').font = { bold: true, size: 12, color: { argb: 'FF0b2a6f' } };
      worksheet.getCell('A2').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFe0e7ff' }
      };
    }

    const headerStartRow = companyRnc ? 3 : 2;
    worksheet.mergeCells(`A${headerStartRow}:D${headerStartRow}`);
    worksheet.getCell(`A${headerStartRow}`).value = `Invoice #${invoice.id}`;
    worksheet.getCell(`A${headerStartRow}`).font = { bold: true, size: 12 };

    const ncfRow = headerStartRow + 1;
    worksheet.mergeCells(`A${ncfRow}:D${ncfRow}`);
    worksheet.getCell(`A${ncfRow}`).value = `NCF: ${invoice.id}`;
    worksheet.getCell(`A${ncfRow}`).font = { bold: true, size: 14, color: { argb: 'FF166534' } };
    worksheet.getCell(`A${ncfRow}`).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFdcfce7' }
    };
    worksheet.getCell(`A${ncfRow}`).alignment = { horizontal: 'center' } as any;
    worksheet.getCell(`A${ncfRow}`).border = {
      top: { style: 'medium', color: { argb: 'FF16a34a' } },
      bottom: { style: 'medium', color: { argb: 'FF16a34a' } },
      left: { style: 'medium', color: { argb: 'FF16a34a' } },
      right: { style: 'medium', color: { argb: 'FF16a34a' } }
    };

    if (String(invoice.id || '').toUpperCase().startsWith('B')) {
      const fiscalRow = ncfRow + 1;
      worksheet.mergeCells(`A${fiscalRow}:D${fiscalRow}`);
      worksheet.getCell(`A${fiscalRow}`).value = '✓ VALID INVOICE FOR TAX CREDIT';
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
      new Date(invoice.date).toLocaleDateString('es-DO'),
    ]);
    worksheet.addRow([
      'Due Date',
      new Date(invoice.dueDate).toLocaleDateString('es-DO'),
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
    saveAs(blob, `invoice_${invoice.id}.xlsx`);
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
      'ContaBi';

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
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1F3A' } };
    });

    const data = filteredInvoices.map(invoice => [
      invoice.id,
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

  const exportToPdf = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const companyName =
      (companyInfo as any)?.name ||
      (companyInfo as any)?.company_name ||
      'ContaBi';
    const title = 'INVOICES REPORT';
    const date = `Generated on: ${new Date().toLocaleDateString('es-DO')}`;

    doc.setFontSize(18);
    doc.setTextColor(40, 40, 40);
    doc.text(companyName, pageWidth / 2, 18, { align: 'center' } as any);

    doc.setFontSize(12);
    doc.text(title, pageWidth / 2, 26, { align: 'center' } as any);

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(date, 14, 34);

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
      invoice.id,
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
      startY: 40,
      theme: 'grid',
      headStyles: {
        fillColor: [41, 128, 185],
        textColor: 255,
        fontStyle: 'bold'
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245]
      },
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
    if (!user?.id) {
      alert('You must be logged in to create invoices');
      return;
    }
    if (!newInvoiceCustomerId) {
      alert('Select a customer');
      return;
    }

    const isCashSale = mode === 'final' && newInvoiceSaleType === 'cash';
    if (isCashSale && !newInvoicePaymentMethod) {
      alert('You must select a payment method for cash sales');
      return;
    }

    const validItems = newInvoiceItems.filter(i => i.description && i.quantity > 0 && i.price > 0);
    if (validItems.length === 0) {
      alert('Add at least one line with quantity and price greater than 0');
      return;
    }

    const subtotal = newInvoiceSubtotal;
    const tax = newInvoiceTax;
    const total = newInvoiceTotal;

    let invoiceNumber = `FAC-${Date.now()}`;
    // Si el usuario NO selecciona tipo de documento, entonces la factura se crea SIN NCF.
    // Solo se genera NCF cuando el usuario selecciona explícitamente un tipo.
    const selectedDocType = String(newInvoiceDocumentType || '');
    if (selectedDocType) {
      const availableDocTypes = Array.from(
        new Set(
          (ncfSeries || [])
            .filter((s: any) => s.status === 'active')
            .map((s: any) => String(s.document_type)),
        ),
      );

      if (!availableDocTypes.includes(selectedDocType)) {
        alert('No active NCF series available for the selected type.');
        return;
      }

      try {
        const nextNcf = await taxService.getNextNcf(user.id, selectedDocType);
        if (nextNcf?.ncf) {
          invoiceNumber = nextNcf.ncf;
        }
      } catch {
        // NCF no disponible - se usará número interno
      }
    }

    const invoicePayload = {
      customer_id: newInvoiceCustomerId,
      invoice_number: invoiceNumber,
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
      notes: newInvoiceNotes || null,
      store_name: newInvoiceStoreName || null,
      discount_type: newInvoiceDiscountType,
      discount_value: newInvoiceDiscountPercent,
      total_discount: subtotal - (subtotal - newInvoiceDiscountPercent),
    };

    const linesPayload = validItems.map((item, index) => ({
      description: item.description,
      quantity: item.quantity,
      unit_price: item.price,
      line_total: item.total,
      line_number: index + 1,
      item_id: item.itemId ?? null,
    }));

    try {
      const created = await invoicesService.create(user.id, invoicePayload, linesPayload);

      if (isCashSale && created?.invoice?.id) {
        const createdInvoice = created.invoice as any;
        const invoiceId = String(createdInvoice.id);
        const createdInvoiceNumber = String(createdInvoice.invoice_number || `FAC-${Date.now()}`);
        const paymentDate = String(createdInvoice.invoice_date || newInvoiceDate);
        const amountToPay = Number(createdInvoice.total_amount) || total;

        try {
          const paymentPayload: any = {
            customer_id: newInvoiceCustomerId,
            invoice_id: invoiceId,
            bank_account_id: newInvoiceBankAccountId ? newInvoiceBankAccountId : null,
            amount: amountToPay,
            payment_method: newInvoicePaymentMethod,
            payment_date: paymentDate,
            reference: newInvoicePaymentReference ? newInvoicePaymentReference.trim() : null,
          };

          await customerPaymentsService.create(user.id, paymentPayload);
          await invoicesService.updatePayment(invoiceId, amountToPay, 'paid');

          try {
            const receiptNumber = `RC-${Date.now()}`;
            const receiptPayload = {
              customer_id: newInvoiceCustomerId,
              receipt_number: receiptNumber,
              receipt_date: paymentDate,
              amount: amountToPay,
              payment_method: newInvoicePaymentMethod,
              reference: newInvoicePaymentReference ? newInvoicePaymentReference.trim() : null,
              concept: `Invoice payment ${createdInvoiceNumber}`,
              status: 'active' as const,
            };

            const createdReceipt = await receiptsService.create(user.id, receiptPayload);

            await receiptApplicationsService.create(user.id, {
              receipt_id: createdReceipt.id,
              invoice_id: invoiceId,
              amount_applied: amountToPay,
              application_date: paymentDate,
              notes: null,
            });
          } catch (receiptError) {
            console.error('Error creating automatic receipt for cash sale:', receiptError);
          }
        } catch (cashSaleError) {
          console.error('Error applying automatic payment to cash sale:', cashSaleError);
          alert('Invoice created, but an error occurred registering the payment/receipt.');
        }
      }

      await loadInvoices();
      setShowNewInvoiceModal(false);
      alert(mode === 'draft' ? 'Invoice saved as draft' : 'Invoice created successfully');
    } catch (error: any) {
      console.error('Error creating invoice:', error);
      const msg =
        (error?.message as string) ||
        (error?.details as string) ||
        (error?.hint as string) ||
        'Error creating the invoice';
      alert(msg);
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
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">
              Invoices ({filteredInvoices.length})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
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
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredInvoices.map((invoice) => {
                  const rep = salesReps.find((r) => r.id === invoice.salesRepId);
                  return (
                    <tr key={invoice.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{invoice.id}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{invoice.customer}</div>
                        <div className="text-sm text-gray-500">{invoice.customerEmail}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {rep ? rep.name : '—'}
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
                            ≈ {formatAmount(invoice.baseTotal)}
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
                            onClick={() => handlePrintInvoice(invoice.id)}
                            className="text-gray-600 hover:text-gray-900 p-1"
                            title="Print invoice"
                          >
                            <i className="ri-printer-line"></i>
                          </button>
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
                              <td colSpan={3} className="px-4 py-2 text-right text-xs text-gray-500">ITBIS ({(taxConfig?.itbis_rate ?? 18).toFixed(2)}%)</td>
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
                  <h3 className="text-lg font-semibold text-gray-900">New Invoice</h3>
                  <button
                    onClick={() => setShowNewInvoiceModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <i className="ri-close-line text-xl"></i>
                  </button>
                </div>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Customer</label>
                    <div className="space-y-2">
                      <select
                        value={newInvoiceCustomerId}
                        onChange={handleNewInvoiceCustomerChange}
                        className="mb-2 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8 text-sm"
                      >
                        <option value="">Select customer...</option>
                        {customers
                          .filter((c: { name: string; document: string | null }) => {
                            if (!newInvoiceCustomerSearch) return true;
                            const term = newInvoiceCustomerSearch.toLowerCase();
                            return (
                              c.name.toLowerCase().includes(term) ||
                              (c.document || '').toLowerCase().includes(term)
                            );
                          })
                          .map((customer) => (
                            <option key={customer.id} value={customer.id}>
                              {customer.name} {customer.document ? `- ${customer.document}` : ''}
                            </option>
                          ))}
                      </select>
                      <input
                        type="text"
                        value={newInvoiceCustomerSearch}
                        onChange={(e) => setNewInvoiceCustomerSearch(e.target.value)}
                        placeholder="Search by name or RNC..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                      />
                    </div>
                    {selectedNewInvoiceCustomer && (
                      <div className="mt-2 p-3 bg-gray-50 rounded-lg text-xs md:text-sm text-gray-700">
                        <p className="font-medium">{selectedNewInvoiceCustomer.name}</p>
                        {selectedNewInvoiceCustomer.document && (
                          <p>Document: {selectedNewInvoiceCustomer.document}</p>
                        )}
                        {selectedNewInvoiceCustomer.email && (
                          <p>Email: {selectedNewInvoiceCustomer.email}</p>
                        )}
                        {selectedNewInvoiceCustomer.phone && (
                          <p>Phone: {selectedNewInvoiceCustomer.phone}</p>
                        )}
                        {selectedNewInvoiceCustomer.address && (
                          <p>Address: {selectedNewInvoiceCustomer.address}</p>
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Sales Rep (optional)</label>
                    <select
                      value={newInvoiceSalesRepId || ''}
                      onChange={(e) => setNewInvoiceSalesRepId(e.target.value || null)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                    >
                      <option value="">No sales rep assigned</option>
                      {salesReps.map((rep) => (
                        <option key={rep.id} value={rep.id}>{rep.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Sale Type</label>
                    <select
                      value={newInvoiceSaleType}
                      onChange={(e) => {
                        const nextType = (e.target.value || 'credit') as 'credit' | 'cash';
                        setNewInvoiceSaleType(nextType);
                        if (nextType === 'cash') {
                          setNewInvoicePaymentTermId(null);
                          setNewInvoiceDueDate(newInvoiceDate);
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                    >
                      <option value="credit">Credit</option>
                      <option value="cash">Cash</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Document Type (NCF)</label>
                    <select
                      value={newInvoiceDocumentType}
                      onChange={(e) => setNewInvoiceDocumentType(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                    >
                      <option value="">Not selected...</option>
                      {Array.from(
                        new Set(
                          (ncfSeries || [])
                            .filter((s: any) => s.status === 'active')
                            .map((s: any) => String(s.document_type)),
                        ),
                      ).map((dt) => (
                        <option key={dt} value={dt}>
                          {dt}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Payment Terms</label>
                    <select
                      value={newInvoicePaymentTermId ?? ''}
                      onChange={(e) => {
                        const termId = e.target.value || null;
                        setNewInvoicePaymentTermId(termId);
                        const term = paymentTerms.find((t) => t.id === termId);
                        if (term?.days != null) {
                          const base = new Date(newInvoiceDate);
                          const d = new Date(base);
                          d.setDate(base.getDate() + term.days);
                          setNewInvoiceDueDate(d.toISOString().slice(0, 10));
                        }
                      }}
                      disabled={newInvoiceSaleType === 'cash'}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                    >
                      <option value="">No specific terms</option>
                      {paymentTerms.map((term) => (
                        <option key={term.id} value={term.id}>
                          {term.name}{typeof term.days === 'number' ? ` (${term.days} days)` : ''}
                        </option>
                      ))}
                    </select>
                    {newInvoiceSaleType === 'cash' ? (
                      <p className="mt-1 text-xs text-gray-500">Cash sale: the system will automatically register the payment.</p>
                    ) : null}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Payment Method</label>
                    <select
                      value={newInvoicePaymentMethod}
                      onChange={(e) => setNewInvoicePaymentMethod(e.target.value)}
                      disabled={newInvoiceSaleType !== 'cash'}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                    >
                      <option value="">Select...</option>
                      <option value="cash">Cash</option>
                      <option value="transfer">Transfer</option>
                      <option value="card">Card</option>
                      <option value="check">Check</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Bank Account (optional)</label>
                    <select
                      value={newInvoiceBankAccountId}
                      onChange={(e) => setNewInvoiceBankAccountId(e.target.value)}
                      disabled={newInvoiceSaleType !== 'cash'}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                    >
                      <option value="">Select account</option>
                      {bankAccounts.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Reference (optional)</label>
                    <input
                      type="text"
                      value={newInvoicePaymentReference}
                      onChange={(e) => setNewInvoicePaymentReference(e.target.value)}
                      disabled={newInvoiceSaleType !== 'cash'}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="E.g.: #authorization, #transfer, etc."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Due Date</label>
                    <input
                      type="date"
                      value={newInvoiceDueDate}
                      onChange={(e) => setNewInvoiceDueDate(e.target.value)}
                      disabled={newInvoiceSaleType === 'cash'}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Store / Branch</label>
                    {stores.length > 0 ? (
                      <select
                        value={newInvoiceStoreName}
                        onChange={(e) => setNewInvoiceStoreName(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm pr-8"
                      >
                        <option value="">Select store...</option>
                        {stores.map((s) => (
                          <option key={s.id} value={s.name}>{s.name}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={newInvoiceStoreName}
                        onChange={(e) => setNewInvoiceStoreName(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                        placeholder="E.g.: Main store"
                      />
                    )}
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
                                      next.push({ itemId: undefined, description: '', quantity: 1, price: 0, total: 0 });
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
                    onClick={() => setNewInvoiceItems((prev) => [...prev, { itemId: undefined, description: '', quantity: 1, price: 0, total: 0 }])}
                  >
                    <i className="ri-add-line mr-2"></i>
                    Add Product
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
                        <span className="text-sm text-gray-600">ITBIS ({currentItbisRate.toFixed(2)}%):</span>
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
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleSaveNewInvoice('draft')}
                  className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors whitespace-nowrap"
                >
                  Save Draft
                </button>
                <button
                  onClick={() => handleSaveNewInvoice('final')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                >
                  Create Invoice
                </button>
              </div>
            </div>
          </div>
        )}

        {showDocumentPreviewModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl mx-4 max-h-[92vh] overflow-hidden flex flex-col">
              <div className="p-4 border-b border-gray-200 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900 truncate">{documentPreviewTitle}</h3>
                  {documentPreviewFilename ? (
                    <p className="text-xs text-gray-500 truncate">{documentPreviewFilename}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <button
                    onClick={handleDownloadDocumentPreview}
                    className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap"
                    type="button"
                  >
                    Download
                  </button>
                  <button
                    onClick={handlePrintDocumentPreview}
                    className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                    type="button"
                  >
                    Print
                  </button>
                  <button
                    onClick={handleCloseDocumentPreview}
                    className="px-3 py-2 bg-gray-900 text-white rounded-lg hover:bg-black transition-colors whitespace-nowrap"
                    type="button"
                  >
                    Close
                  </button>
                </div>
              </div>
              <div className="flex-1 bg-gray-50">
                {documentPreviewUrl ? (
                  <iframe
                    ref={documentPreviewIframeRef}
                    title={documentPreviewTitle}
                    src={documentPreviewUrl}
                    className="w-full h-[80vh] bg-white"
                  />
                ) : (
                  <div className="p-6 text-sm text-gray-600">No document to preview.</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}