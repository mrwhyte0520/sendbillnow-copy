import { useEffect, useRef, useState } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import * as ExcelJS from 'exceljs';
import * as QRCode from 'qrcode';
import { useAuth } from '../../../hooks/useAuth';
import {
  apInvoicesService,
  apInvoiceLinesService,
  suppliersService,
  paymentTermsService,
  chartAccountsService,
  bankCurrenciesService,
  bankExchangeRatesService,
  inventoryService,
  supplierTypesService,
  purchaseOrdersService,
  purchaseOrderItemsService,
  storesService,
  taxService,
  settingsService,
} from '../../../services/database';
import { formatAmount, getCurrencyPrefix } from '../../../utils/numberFormat';
import InvoiceTypeModal from '../../../components/common/InvoiceTypeModal';
import { printInvoice, type InvoiceTemplateType } from '../../../utils/invoicePrintTemplates';

interface APInvoice {
  id: string;
  supplierId: string;
  supplierName: string;
  invoiceNumber: string;
  documentType: string;
  taxId: string;
  legalName: string;
  invoiceDate: string;
  dueDate: string | null;
  paymentTermsId: string | null;
  currency: string;
  totalGross: number;
  totalItbis: number;
  totalItbisWithheld?: number;
  totalIsrWithheld: number;
  totalDiscount?: number;
  totalOtherTaxes?: number;
  otherTaxes?: Array<{ name: string; rate: number; amount: number }>;
  itbisToCost?: boolean;
  totalToPay: number;
  status: string;
  storeName?: string;
  notes?: string;
  expenseType606?: string;
  purchaseOrderId?: string | null;
}

interface LineFormRow {
  description: string;
  expenseAccountId: string;
  quantity: string;
  unitPrice: string;
  inventoryItemId?: string;
  discountPercentage?: string;
  purchaseOrderItemId?: string;
  maxQuantityFromPo?: number;
  alreadyInvoicedQty?: number;
}

export default function APInvoicesPage() {
  const { user } = useAuth();

  const [invoices, setInvoices] = useState<APInvoice[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [supplierTypes, setSupplierTypes] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [paymentTerms, setPaymentTerms] = useState<any[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<any[]>([]);
  const [currencies, setCurrencies] = useState<
    Array<{ code: string; name: string; symbol: string; is_base?: boolean; is_active?: boolean }>
  >([]);
  const [baseCurrencyCode, setBaseCurrencyCode] = useState<string>('DOP');
  const [stores, setStores] = useState<Array<{ id: string; name: string; is_active?: boolean }>>([]);

  const [taxConfig, setTaxConfig] = useState<{
    itbis_rate: number;
    withholding_rates: { [key: string]: number };
  } | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [showModal, setShowModal] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<APInvoice | null>(null);


  const [showDocumentPreviewModal, setShowDocumentPreviewModal] = useState(false);
  const [documentPreviewType, setDocumentPreviewType] = useState<'pdf' | 'table' | 'html'>('html');
  const [documentPreviewTitle, setDocumentPreviewTitle] = useState('');
  const [documentPreviewFilename, setDocumentPreviewFilename] = useState('');
  const [documentPreviewUrl, setDocumentPreviewUrl] = useState('');
  const [documentPreviewBlob, setDocumentPreviewBlob] = useState<Blob | null>(null);
  const [documentPreviewHeaders, setDocumentPreviewHeaders] = useState<string[]>([]);
  const [documentPreviewRows, setDocumentPreviewRows] = useState<Array<Array<string | number>>>([]);
  const [documentPreviewSummary, setDocumentPreviewSummary] = useState<Array<{ label: string; value: string }>>([]);
  const documentPreviewIframeRef = useRef<HTMLIFrameElement | null>(null);

  const formatTaxId = (raw: string) => {
    const digits = (raw || '').replace(/\D/g, '');
    // RNC (9 dígitos): 000-00000-0   |   Cédula (11 dígitos): 000-0000000-0
    if (digits.length <= 9) {
      const d = digits.slice(0, 9);
      if (d.length <= 3) return d;
      if (d.length <= 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
      return `${d.slice(0, 3)}-${d.slice(3, 8)}-${d.slice(8)}`;
    }
    const d = digits.slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 10) return `${d.slice(0, 3)}-${d.slice(3)}`;
    return `${d.slice(0, 3)}-${d.slice(3, 10)}-${d.slice(10)}`;
  };

  const [headerForm, setHeaderForm] = useState({
    supplierId: '',
    documentType: 'B01',
    taxId: '',
    legalName: '',
    invoiceNumber: '',
    invoiceDate: new Date().toISOString().slice(0, 10),
    dueDate: '',
    paymentTermsId: '',
    currency: 'DOP',
    storeName: 'Tienda principal',
    notes: '',
    expenseType606: '',
    itbisToCost: false,
    exentoItbis: false,
    discountType: '',
    discountValue: '',
    purchaseOrderId: '',
  });

  const [otherTaxes, setOtherTaxes] = useState<Array<{ name: string; rate: string }>>([]);

  const expenseTypes606 = [
    '01 - Gastos de Personal',
    '02 - Gastos por Trabajos, Suministros y Servicios',
    '03 - Arrendamientos',
    '04 - Gastos de Activos Fijos',
    '05 - Gastos de Representación',
    '06 - Otras Deducciones Admitidas',
    '07 - Gastos Financieros',
    '08 - Gastos Extraordinarios',
    '09 - Compras y Gastos que formarán parte del Costo de Venta',
    '10 - Adquisiciones de Activos',
    '11 - Gastos de Seguros',
  ];

  const normalizeExpenseType606 = (value: any) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const needle = raw.toLowerCase();

    // Compatibilidad con valores antiguos que usaban otra codificación o descripciones
    if (needle.includes('gastos de seguros')) {
      return '11 - Gastos de Seguros';
    }

    const legacyCodeMap: Record<string, string> = {
      '06': '07', // antes: financieros
      '07': '11', // antes: seguros
      '08': '02', // antes: provisión bienes/servicios
      '09': '08', // antes: otros conceptos
      '10': '09', // antes: compras de bienes
      '11': '02', // antes: servicios profesionales
    };

    const match = expenseTypes606.find((opt) => opt.toLowerCase() === needle);
    if (match) return match;
    const codeMatch = needle.match(/^\s*(\d{2})\s*-/);
    if (codeMatch) {
      const code = codeMatch[1];
      const mappedCode = legacyCodeMap[code] ?? code;
      const byCode = expenseTypes606.find((opt) => opt.startsWith(`${mappedCode} -`));
      if (byCode) return byCode;
    }
    return raw;
  };

  const [lines, setLines] = useState<LineFormRow[]>([
    { description: '', expenseAccountId: '', quantity: '1', unitPrice: '0', inventoryItemId: '', discountPercentage: '0' },
  ]);

  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [companyInfo, setCompanyInfo] = useState<any | null>(null);

  const [showPrintTypeModal, setShowPrintTypeModal] = useState(false);
  const [invoiceToPrint, setInvoiceToPrint] = useState<APInvoice | null>(null);

  const normalizeSupplierTypeName = (value: any) => String(value || '').trim().toLowerCase();
  const getSupplierTypeKey = (typeRow: any | null) => {
    const name = normalizeSupplierTypeName(typeRow?.name);
    if (name === 'sin especificar') return 'unspecified';
    if (name === 'persona física' || name === 'persona fisica') return 'persona_fisica';
    if (name === 'persona jurídica' || name === 'persona juridica') return 'persona_juridica';
    if (name === 'prestador de servicios') return 'prestador_servicios';
    if (name === 'proveedor informal') return 'proveedor_informal';
    return null;
  };

  const normalizeTaxRegime = (value: any) => String(value || '').trim().toLowerCase();
  const getTaxRegimeKey = (value: any) => {
    const v = normalizeTaxRegime(value);
    if (!v) return null;
    if (v === 'rst' || v.includes('régimen simplificado') || v.includes('regimen simplificado')) return 'rst';
    if (v === 'ong' || v.includes('sin fines de lucro') || v.includes('fundación') || v.includes('fundacion')) return 'ong';
    if (v.includes('no contribuyente') || v.includes('no-contribuyente')) return 'non_taxpayer';
    return 'normal';
  };

  const handleAddTax = () => {
    setOtherTaxes(prev => [...prev, { name: '', rate: '0' }]);
  };

  const handleRemoveTax = (index: number) => {
    setOtherTaxes(prev => prev.filter((_, i) => i !== index));
  };

  const handleTaxChange = (index: number, field: 'name' | 'rate', value: string) => {
    setOtherTaxes(prev => prev.map((tax, i) => (i === index ? { ...tax, [field]: value } : tax)));
  };

  const loadLookups = async () => {
    if (!user?.id) return;
    try {
      const [supRows, termRows, accounts, inventory, typeRows, poRows, storesData] = await Promise.all([
        suppliersService.getAll(user.id),
        paymentTermsService.getAll(user.id),
        chartAccountsService.getAll(user.id),
        inventoryService.getItems(user.id),
        supplierTypesService.getAll(user.id),
        purchaseOrdersService.getAll(user.id),
        storesService.getAll(user.id),
      ]);

      setSuppliers(supRows || []);

      setPaymentTerms(termRows || []);
      setInventoryItems(inventory || []);
      setSupplierTypes(typeRows || []);
      setPurchaseOrders(poRows || []);
      setStores((storesData || []).filter((s: any) => s.is_active !== false));

      const expense = (accounts || [])
        .filter((acc: any) => {
          const code = String(acc.code || '').trim();
          const normalized = code.replace(/\./g, '');
          return normalized.startsWith('5') || normalized.startsWith('6');
        })
        .sort((a: any, b: any) => String(a.code || '').localeCompare(String(b.code || '')));
      setExpenseAccounts(expense);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error cargando catálogos para facturas de suplidor', error);
    }
  };

  const loadTaxConfig = async () => {
    try {
      const data = await taxService.getTaxConfiguration();
      if (data) {
        setTaxConfig({
          itbis_rate: typeof data.itbis_rate === 'number' ? data.itbis_rate : 18,
          withholding_rates: data.withholding_rates || { itbis: 0, isr: 0 },
        });
      } else {
        setTaxConfig({
          itbis_rate: 18,
          withholding_rates: { itbis: 0, isr: 0 },
        });
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error cargando configuración de impuestos para facturas de suplidor', error);
      setTaxConfig({
        itbis_rate: 18,
        withholding_rates: { itbis: 0, isr: 0 },
      });
    }
  };

  const loadInvoices = async () => {
    if (!user?.id) return;
    try {
      const uid = user.id;

      const [rows, currs] = await Promise.all([
        apInvoicesService.getAll(uid),
        bankCurrenciesService.getAll(uid),
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

      const today = new Date().toISOString().slice(0, 10);

      const mapped: APInvoice[] = await Promise.all((rows || []).map(async (inv: any) => {
        const currency = (inv.currency as string) || baseCode;
        const totalGross = Number(inv.total_gross) || 0;
        const totalItbis = Number(inv.total_itbis) || 0;
        const totalItbisWithheld = Number(inv.total_itbis_withheld) || 0;
        const totalIsrWithheld = Number(inv.total_isr_withheld) || 0;
        const totalDiscount = Number(inv.total_discount) || 0;
        const totalOtherTaxes = Number(inv.total_other_taxes) || 0;
        let otherTaxes: Array<{ name: string; rate: number; amount: number }> = [];
        try {
          const rawOther = (inv.other_taxes as any) || null;
          if (rawOther) {
            const parsed = typeof rawOther === 'string' ? JSON.parse(rawOther) : rawOther;
            if (Array.isArray(parsed)) {
              otherTaxes = parsed
                .map((t: any) => ({
                  name: String(t?.name || ''),
                  rate: Number(t?.rate || 0) || 0,
                  amount: Number(t?.amount || 0) || 0,
                }))
                .filter((t) => t.name && Number.isFinite(t.amount));
            }
          }
        } catch {
          otherTaxes = [];
        }
        const totalToPay = Number(inv.total_to_pay) || 0;

        let baseTotalToPay: number | null = totalToPay;
        if (currency !== baseCode) {
          try {
            const rate = await bankExchangeRatesService.getEffectiveRate(
              uid,
              currency,
              baseCode,
              (inv.invoice_date as string) || today,
            );
            if (rate && rate > 0) {
              baseTotalToPay = totalToPay * rate;
            } else {
              baseTotalToPay = null;
            }
          } catch (fxError) {
            // eslint-disable-next-line no-console
            console.error('Error calculando equivalente en moneda base para factura CxP', fxError);
            baseTotalToPay = null;
          }
        }

        return {
          id: String(inv.id),
          supplierId: String(inv.supplier_id),
          supplierName: (inv.suppliers as any)?.name || 'Suplidor',
          invoiceNumber: inv.invoice_number || '',
          documentType: inv.document_type || '',
          taxId: inv.tax_id || '',
          legalName: inv.legal_name || '',
          invoiceDate: inv.invoice_date || '',
          dueDate: inv.due_date || null,
          paymentTermsId: inv.payment_terms_id || null,
          currency,
          totalGross,
          totalItbis,
          totalItbisWithheld,
          totalIsrWithheld,
          totalDiscount,
          totalOtherTaxes,
          otherTaxes,
          itbisToCost: !!(inv as any).itbis_to_cost,
          totalToPay,
          status: inv.status || 'pending',
          storeName: (inv as any).store_name || '',
          notes: (inv as any).notes || '',
          expenseType606: normalizeExpenseType606((inv as any).expense_type_606) || '',
          purchaseOrderId: (inv as any).purchase_order_id || null,
          // campo adicional usado solo en UI; TypeScript lo admite porque APInvoice es estructura abierta
          baseTotalToPay,
        } as APInvoice;
      }));

      setInvoices(mapped);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error cargando facturas de suplidor', error);
      setInvoices([]);
    }
  };

  useEffect(() => {
    loadLookups();
    loadInvoices();
    loadTaxConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    const loadCompanyInfo = async () => {
      const info = await settingsService.getCompanyInfo();
      setCompanyInfo(info);
    };
    loadCompanyInfo();
  }, [user?.id]);

  const handleAddLine = () => {
    setLines(prev => [...prev, { description: '', expenseAccountId: '', quantity: '1', unitPrice: '0', inventoryItemId: '', discountPercentage: '0' }]);
  };

  const handleLineChange = (index: number, field: keyof LineFormRow, value: string) => {
    setLines(prev => prev.map((line, i) => (i === index ? { ...line, [field]: value } : line)));
  };

  const handleRemoveLine = (index: number) => {
    setLines(prev => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  const getCurrentSupplierTaxProfile = () => {
    const selected = suppliers.find((s: any) => String(s.id) === String(headerForm.supplierId));

    let supplierType: any | null = null;
    if (selected?.supplier_type_id && supplierTypes.length > 0) {
      supplierType = supplierTypes.find((t: any) => String(t.id) === String(selected.supplier_type_id)) || null;
    }

    const supplierTypeKey = getSupplierTypeKey(supplierType);

    const regimeKey = getTaxRegimeKey((selected as any)?.tax_regime);

    const baseIsNonTaxpayer = !!supplierType?.is_non_taxpayer;
    const baseIsRst = !!supplierType?.is_rst;
    const baseIsOng = !!supplierType?.is_ong;

    const isNonTaxpayer = baseIsNonTaxpayer || regimeKey === 'non_taxpayer';
    const isRst = baseIsRst || regimeKey === 'rst';
    const isOng = baseIsOng || regimeKey === 'ong';

    // Reglas mínimas por régimen:
    // - ONG / no contribuyente: no ITBIS, no retención ISR (por defecto)
    // - RST: normalmente no factura ITBIS (no crédito fiscal) -> desactivar ITBIS
    const affectsItbis =
      supplierType
        ? (supplierType.affects_itbis !== false && !isNonTaxpayer && !isRst && !isOng)
        : (!isNonTaxpayer && !isRst && !isOng);

    const affectsIsr =
      supplierType
        ? (supplierType.affects_isr !== false && !isOng)
        : !isOng;

    const defaultItbisWithholding =
      taxConfig?.withholding_rates && typeof taxConfig.withholding_rates.itbis === 'number'
        ? Number(taxConfig.withholding_rates.itbis)
        : 0;
    const defaultIsrWithholding =
      taxConfig?.withholding_rates && typeof taxConfig.withholding_rates.isr === 'number'
        ? Number(taxConfig.withholding_rates.isr)
        : 0;

    const itbisWithholdingRate =
      !affectsItbis
        ? 0
        : supplierType && typeof supplierType.itbis_withholding_rate === 'number'
          ? Number(supplierType.itbis_withholding_rate)
          : defaultItbisWithholding;
    const isrWithholdingRate = defaultIsrWithholding;

    const resolvedItbisWithholdingRate =
      !affectsItbis
        ? 0
        : supplierType && typeof supplierType.itbis_withholding_rate === 'number'
          ? Number(supplierType.itbis_withholding_rate)
          : supplierTypeKey === 'prestador_servicios'
            ? 30
            : supplierTypeKey === 'persona_fisica'
              ? 30
              : supplierTypeKey === 'proveedor_informal'
                ? 100
                : 0;

    const resolvedIsrWithholdingRate =
      !affectsIsr
        ? 0
        : supplierTypeKey === 'persona_fisica' && typeof (supplierType as any)?.isr_withholding_rate === 'number'
          ? Number((supplierType as any).isr_withholding_rate)
          : supplierTypeKey === 'persona_juridica'
            ? 0
            : supplierTypeKey === 'prestador_servicios'
              ? 10
              : supplierTypeKey === 'persona_fisica'
                ? 10
                : supplierTypeKey === 'proveedor_informal'
                  ? 10
                  : isrWithholdingRate;

    const fallbackItbisWithholding =
      supplierTypeKey === 'unspecified'
        ? itbisWithholdingRate
        : resolvedItbisWithholdingRate;

    const fallbackIsrWithholding =
      supplierTypeKey === 'unspecified'
        ? isrWithholdingRate
        : resolvedIsrWithholdingRate;

    return {
      affectsItbis,
      affectsIsr,
      isNonTaxpayer,
      isRst,
      isOng,
      itbisWithholdingRate: fallbackItbisWithholding,
      isrWithholdingRate: fallbackIsrWithholding,
      supplierTypeKey,
    };
  };

  const calculateTotals = () => {
    const { affectsItbis: baseAffectsItbis, affectsIsr, itbisWithholdingRate, isrWithholdingRate } = getCurrentSupplierTaxProfile();
    // Si está marcado como exento de ITBIS, no aplicar ITBIS
    const affectsItbis = headerForm.exentoItbis ? false : baseAffectsItbis;
    // Calcular subtotales por línea (con descuentos de línea)
    let grossBeforeDiscount = 0;
    let totalLineDiscounts = 0;
    
    lines.forEach(line => {
      const qty = Number(line.quantity) || 0;
      const price = Number(line.unitPrice) || 0;
      const lineTotal = qty * price;
      const discountPct = Number(line.discountPercentage) || 0;
      const lineDiscount = lineTotal * (discountPct / 100);
      
      grossBeforeDiscount += lineTotal;
      totalLineDiscounts += lineDiscount;
    });

    const grossAfterLineDiscounts = grossBeforeDiscount - totalLineDiscounts;

    // Aplicar descuento global
    let globalDiscount = 0;
    if (headerForm.discountType === 'percentage') {
      const discountPct = Number(headerForm.discountValue) || 0;
      globalDiscount = grossAfterLineDiscounts * (discountPct / 100);
    } else if (headerForm.discountType === 'fixed') {
      globalDiscount = Number(headerForm.discountValue) || 0;
    }

    const grossAfterAllDiscounts = Math.max(0, grossAfterLineDiscounts - globalDiscount);
    const totalDiscount = totalLineDiscounts + globalDiscount;

    // Calcular ITBIS según tasa configurada
    const itbisRate = taxConfig?.itbis_rate ?? 18;
    const baseItbis = grossAfterAllDiscounts * (itbisRate / 100);
    const itbis = affectsItbis ? baseItbis : 0;

    // Calcular otros impuestos
    let totalOtherTaxes = 0;
    const otherTaxesDetail = otherTaxes
      .filter(tax => tax.name.trim() && Number(tax.rate) > 0)
      .map(tax => {
        const rate = Number(tax.rate) / 100;
        const amount = grossAfterAllDiscounts * rate;
        totalOtherTaxes += amount;
        return { name: tax.name, rate: Number(tax.rate), amount };
      });

    // Calcular ITBIS retenido (porcentaje del ITBIS facturado)
    let itbisWithheld = 0;
    if (affectsItbis && itbisWithholdingRate > 0 && itbis > 0) {
      itbisWithheld = itbis * (itbisWithholdingRate / 100);
    }

    // Calcular retenciones ISR sobre el monto neto (sin ITBIS)
    let isr = 0;
    if (affectsIsr && isrWithholdingRate > 0) {
      const isrBase = grossAfterAllDiscounts;
      isr = isrBase * (isrWithholdingRate / 100);
    }

    const toPay = grossAfterAllDiscounts + itbis + totalOtherTaxes - itbisWithheld - isr;

    return { 
      gross: grossBeforeDiscount, 
      totalDiscount,
      grossAfterDiscount: grossAfterAllDiscounts,
      itbis, 
      totalOtherTaxes,
      otherTaxesDetail,
      itbisWithheld,
      isr, 
      toPay 
    };
  };

  const resetForm = () => {
    setHeaderForm({
      supplierId: '',
      documentType: 'B01',
      taxId: '',
      legalName: '',
      invoiceNumber: '',
      invoiceDate: new Date().toISOString().slice(0, 10),
      dueDate: '',
      paymentTermsId: '',
      currency: baseCurrencyCode || 'DOP',
      storeName: 'Tienda principal',
      notes: '',
      expenseType606: '',
      itbisToCost: false,
      exentoItbis: false,
      discountType: '',
      discountValue: '',
      purchaseOrderId: '',
    });
    setLines([{ description: '', expenseAccountId: '', quantity: '1', unitPrice: '0', inventoryItemId: '', discountPercentage: '0' }]);
    setOtherTaxes([]);
    setEditingInvoice(null);
  };

  const handleNewInvoice = () => {
    resetForm();
    setShowModal(true);
  };

  const handleEditInvoice = async (invoice: APInvoice) => {
    const selectedSupplier = suppliers.find((s: any) => String(s.id) === String(invoice.supplierId));

    setEditingInvoice(invoice);
    setHeaderForm({
      supplierId: invoice.supplierId,
      documentType: invoice.documentType || 'B01',
      taxId: invoice.taxId || selectedSupplier?.tax_id || selectedSupplier?.rnc || '',
      legalName: invoice.legalName || selectedSupplier?.legal_name || selectedSupplier?.name || invoice.supplierName,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate || new Date().toISOString().slice(0, 10),
      dueDate: invoice.dueDate || '',
      paymentTermsId: invoice.paymentTermsId || '',
      currency: invoice.currency || 'DOP',
      storeName: invoice.storeName || 'Tienda principal',
      notes: invoice.notes || '',
      expenseType606: invoice.expenseType606 || '',
      itbisToCost: false,
      exentoItbis: false,
      discountType: '',
      discountValue: '',
      purchaseOrderId: '',
    });

    try {
      const dbLines = await apInvoiceLinesService.getByInvoice(invoice.id);
      const mappedLines: LineFormRow[] = (dbLines || []).map((l: any) => ({
        description: l.description || '',
        expenseAccountId: l.expense_account_id || '',
        quantity: String(l.quantity ?? '1'),
        unitPrice: String(l.unit_price ?? '0'),
        inventoryItemId: l.inventory_item_id ? String(l.inventory_item_id) : '',
        discountPercentage: l.discount_percentage != null ? String(l.discount_percentage) : '0',
        purchaseOrderItemId: l.purchase_order_item_id ? String(l.purchase_order_item_id) : undefined,
      }));
      setLines(
        mappedLines.length > 0
          ? mappedLines
          : [{ description: '', expenseAccountId: '', quantity: '1', unitPrice: '0', inventoryItemId: '', discountPercentage: '0' }]
      );
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error cargando líneas de factura de suplidor', error);
      setLines([{ description: '', expenseAccountId: '', quantity: '1', unitPrice: '0', inventoryItemId: '', discountPercentage: '0' }]);
    }

    setShowModal(true);
  };

  const handleSupplierChange = (supplierId: string) => {
    setHeaderForm((prev) => {
      const selected = suppliers.find((s: any) => String(s.id) === String(supplierId));
      return {
        ...prev,
        supplierId,
        taxId: selected?.tax_id || selected?.rnc || prev.taxId,
        legalName: selected?.legal_name || selected?.name || prev.legalName,
        paymentTermsId: selected?.payment_terms_id ? String(selected.payment_terms_id) : prev.paymentTermsId,
        expenseType606: normalizeExpenseType606(selected?.expense_type_606) || '',
        purchaseOrderId: '',
      };
    });
  };

  const handlePurchaseOrderChange = async (poId: string) => {
    setHeaderForm((prev) => ({ ...prev, purchaseOrderId: poId }));

    if (!poId || !user?.id) return;

    try {
      let orderItems: any[] = [];
      try {
        orderItems = await purchaseOrderItemsService.getWithInvoicedByOrderAccessible(user.id, poId);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('handlePurchaseOrderChange getWithInvoicedByOrderAccessible error', error);
        orderItems = [];
      }

      // Fallback: si por cualquier razón la consulta con “invoiced” no devuelve filas,
      // cargar al menos las líneas básicas de la OC.
      if (!orderItems || orderItems.length === 0) {
        try {
          orderItems = await purchaseOrderItemsService.getByOrderAccessible(user.id, poId);
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('handlePurchaseOrderChange getByOrderAccessible error', error);
          orderItems = [];
        }
      }

      if (!orderItems || orderItems.length === 0) {
        setLines([{ description: '', expenseAccountId: '', quantity: '1', unitPrice: '0', inventoryItemId: '', discountPercentage: '0' }]);
        return;
      }

      const rawLines = (orderItems as any[]).map((it: any) => {
        const orderedQty = Number(it.quantity) || 0;
        const invoicedQty = Number(it.quantity_invoiced || 0);
        const remainingQty = Number.isFinite(Number(it.quantity_invoiced))
          ? Math.max(orderedQty - invoicedQty, 0)
          : orderedQty;

        if (remainingQty <= 0) {
          return null;
        }

        return {
          description: it.description || (it.inventory_items as any)?.name || '',
          expenseAccountId: '',
          quantity: String(remainingQty),
          unitPrice: String(it.unit_cost ?? '0'),
          inventoryItemId: it.inventory_item_id ? String(it.inventory_item_id) : '',
          discountPercentage: '0',
          purchaseOrderItemId: it.id ? String(it.id) : undefined,
          maxQuantityFromPo: orderedQty,
          alreadyInvoicedQty: invoicedQty,
        } as LineFormRow;
      });

      const mappedLines: LineFormRow[] = rawLines.filter((l) => l !== null) as LineFormRow[];

      setLines(mappedLines.length > 0
        ? mappedLines
        : [{ description: '', expenseAccountId: '', quantity: '1', unitPrice: '0', inventoryItemId: '', discountPercentage: '0' }]);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error cargando líneas desde orden de compra', error);
    }
  };

  const generateInvoiceNumber = () => {
    const year = new Date().getFullYear();
    const timestamp = Date.now().toString().slice(-6);
    const generatedNumber = `AP-${year}-${timestamp}`;
    setHeaderForm(prev => ({ ...prev, invoiceNumber: generatedNumber }));
  };

  const handleDeleteInvoice = async (id: string) => {
    if (!confirm('¿Eliminar esta factura de suplidor?')) return;
    try {
      await apInvoiceLinesService.deleteByInvoice(id);
      await apInvoicesService.delete(id);
      await loadInvoices();
      alert('Factura eliminada exitosamente');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error eliminando factura de suplidor', error);
      alert('No se pudo eliminar la factura');
    }
  };

  useEffect(() => {
    return () => {
      if (documentPreviewUrl) {
        URL.revokeObjectURL(documentPreviewUrl);
      }
    };
  }, [documentPreviewUrl]);

  const handleCloseDocumentPreview = () => {
    setShowDocumentPreviewModal(false);
    setDocumentPreviewType('html');
    setDocumentPreviewTitle('');
    setDocumentPreviewFilename('');
    setDocumentPreviewUrl('');
    setDocumentPreviewBlob(null);
    setDocumentPreviewHeaders([]);
    setDocumentPreviewRows([]);
    setDocumentPreviewSummary([]);
  };

  const handleDownloadDocumentPreview = () => {
    if (!documentPreviewBlob || !documentPreviewFilename) return;
    const url = URL.createObjectURL(documentPreviewBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = documentPreviewFilename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const handlePrintDocumentPreview = () => {
    const iframe = documentPreviewIframeRef.current;
    const win = iframe?.contentWindow;
    if (!win) return;
    win.focus();
    win.print();
  };

  const openHtmlPreview = (html: string, title: string, filename: string) => {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    setDocumentPreviewType('html');
    setDocumentPreviewTitle(title);
    setDocumentPreviewFilename(filename);
    setDocumentPreviewBlob(blob);
    setDocumentPreviewUrl(url);
    setDocumentPreviewHeaders([]);
    setDocumentPreviewRows([]);
    setDocumentPreviewSummary([]);
    setShowDocumentPreviewModal(true);
  };

  const openTablePreview = (payload: {
    title: string;
    filename: string;
    blob: Blob;
    headers: string[];
    rows: Array<Array<string | number>>;
    summary?: Array<{ label: string; value: string }>;
  }) => {
    setDocumentPreviewType('table');
    setDocumentPreviewTitle(payload.title);
    setDocumentPreviewFilename(payload.filename);
    setDocumentPreviewBlob(payload.blob);
    setDocumentPreviewUrl('');
    setDocumentPreviewHeaders(payload.headers);
    setDocumentPreviewRows(payload.rows);
    setDocumentPreviewSummary(payload.summary || []);
    setShowDocumentPreviewModal(true);
  };

  const handlePrintInvoice = (invoice: APInvoice) => {
    setInvoiceToPrint(invoice);
    setShowPrintTypeModal(true);
  };

  const handlePrintTypeSelect = async (type: InvoiceTemplateType) => {
    const invoice = invoiceToPrint;
    if (!invoice) return;
    
    const supplier = suppliers.find((s: any) => String(s.id) === String(invoice.supplierId));
    const supplierData = {
      name: invoice.legalName || invoice.supplierName || 'Supplier',
      document: String(invoice.taxId || (supplier as any)?.tax_id || '').trim(),
      phone: String((supplier as any)?.phone || '').trim(),
      email: String((supplier as any)?.email || '').trim(),
      address: String((supplier as any)?.address || '').trim(),
    };
    const companyData = {
      name: (companyInfo as any)?.name || (companyInfo as any)?.company_name || 'Send Bill Now',
      rnc: (companyInfo as any)?.rnc || (companyInfo as any)?.tax_id,
      phone: (companyInfo as any)?.phone,
      email: (companyInfo as any)?.email,
      address: (companyInfo as any)?.address,
    };

    try {
      const dbLines = await apInvoiceLinesService.getByInvoice(invoice.id);
      const items = (dbLines || []).map((l: any) => {
        const qty = Number(l.quantity) || 0;
        const price = Number(l.unit_price) || 0;
        const total = Number(l.line_total) || qty * price;
        return {
          description: l.description || (l.inventory_items as any)?.name || 'Expense / Service',
          quantity: qty,
          price,
          total,
        };
      });

      if (items.length === 0) {
        items.push({
          description: invoice.expenseType606 || 'Expense / Service',
          quantity: 1,
          price: invoice.totalToPay,
          total: invoice.totalToPay,
        });
      }

      const invoiceData = {
        invoiceNumber: invoice.invoiceNumber || invoice.id,
        date: invoice.invoiceDate,
        dueDate: invoice.dueDate || invoice.invoiceDate,
        amount: invoice.totalToPay,
        subtotal: invoice.totalGross - (invoice.totalDiscount || 0),
        tax: invoice.totalItbis,
        items,
      };

      printInvoice(invoiceData, supplierData, companyData, type);
      setInvoiceToPrint(null);
    } catch (error) {
      console.error('Error preparing print:', error);
      alert('Could not prepare the invoice for printing.');
      setInvoiceToPrint(null);
    }
  };

  const handlePrintInvoiceLegacy = async (invoice: APInvoice) => {
    try {
      const dbLines = await apInvoiceLinesService.getByInvoice(invoice.id);
      const items = (dbLines || []).map((l: any) => {
        const qty = Number(l.quantity) || 0;
        const price = Number(l.unit_price) || 0;
        const total = Number(l.line_total) || qty * price;
        return {
          description: l.description || (l.inventory_items as any)?.name || 'Gasto / Servicio',
          quantity: qty,
          unitPrice: price,
          total,
        };
      });

      if (items.length === 0) {
        items.push({
          description: invoice.expenseType606 || 'Gasto / Servicio',
          quantity: 1,
          unitPrice: invoice.totalToPay,
          total: invoice.totalToPay,
        });
      }

      const supplierName = invoice.legalName || invoice.supplierName;
      const supplier = suppliers.find((s: any) => String(s.id) === String(invoice.supplierId));
      const supplierTaxId = String(invoice.taxId || (supplier as any)?.tax_id || (supplier as any)?.rnc || '').trim();
      const supplierPhone = String((supplier as any)?.phone || '').trim();
      const supplierEmail = String((supplier as any)?.email || '').trim();
      const supplierAddress = String((supplier as any)?.address || '').trim();
      const companyName = (companyInfo as any)?.name || (companyInfo as any)?.company_name || 'ContaBi';
      const companyRnc = (companyInfo as any)?.rnc || (companyInfo as any)?.tax_id || (companyInfo as any)?.ruc || '';
      const companyPhone = (companyInfo as any)?.phone || '';
      const companyEmail = (companyInfo as any)?.email || '';
      const companyAddress = (companyInfo as any)?.address || '';

      const safeNumber = invoice.invoiceNumber || invoice.id;

      const subtotalAfterDiscount = Math.max(0, Number(invoice.totalGross || 0) - Number(invoice.totalDiscount || 0));
      const otherTaxesDetail = Array.isArray((invoice as any).otherTaxes) ? (invoice as any).otherTaxes : [];
      const totalItbisWithheld = Number(invoice.totalItbisWithheld || 0) || 0;

      let qrDataUrl = '';
      try {
        const qrUrl = `${window.location.origin}/document/ap-invoice/${encodeURIComponent(String(invoice.id || safeNumber))}`;
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
            <title>Factura de Suplidor ${safeNumber}</title>
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
              .section-grid { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 20px; align-items: start; margin-top: 16px; }
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
                  ${companyAddress ? `<div class="company-meta">Dirección: ${companyAddress}</div>` : ''}
                </div>
                <div class="doc">
                  <div class="doc-title">FACTURA DE SUPLIDOR</div>
                  <div class="doc-number">${safeNumber}</div>
                  <div class="doc-kv">
                    ${invoice.documentType ? `<div><strong>NCF / Tipo:</strong> ${invoice.documentType}</div>` : ''}
                    <div><strong>Fecha:</strong> ${invoice.invoiceDate ? new Date(invoice.invoiceDate).toLocaleDateString('es-DO') : ''}</div>
                    <div><strong>Moneda:</strong> ${invoice.currency === 'DOP' ? 'Peso Dominicano' : (invoice.currency || 'DOP')}</div>
                    ${invoice.storeName ? `<div><strong>Tienda:</strong> ${invoice.storeName}</div>` : ''}
                    <div><strong>Vencimiento:</strong> ${invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString('es-DO') : ''}</div>
                  </div>
                  ${qrDataUrl ? `<img class="qr" alt="QR" src="${qrDataUrl}" />` : ''}
                </div>
              </div>

              ${String(safeNumber || '').toUpperCase().startsWith('B') ? `
              <div style="margin-top: 12px; padding: 10px 16px; background: #fef3c7; border: 2px solid #f59e0b; border-radius: 8px; text-align: center;">
                <span style="font-size: 13px; font-weight: 700; color: #92400e;">✓ FACTURA VÁLIDA PARA CRÉDITO FISCAL</span>
              </div>
              ` : ''}

              <div class="section-grid">
                <div class="card">
                  <div class="card-head">
                    <div class="card-head-title">Suplidor</div>
                  </div>
                  <div class="card-body">
                    <div class="kv">
                      <div class="k">Nombre</div>
                      <div class="v">${supplierName}</div>
                      ${supplierTaxId ? `<div class="k">RNC / Tax ID</div><div class="v">${supplierTaxId}</div>` : ''}
                      ${supplierPhone ? `<div class="k">Teléfono</div><div class="v">${supplierPhone}</div>` : ''}
                      ${supplierEmail ? `<div class="k">Email</div><div class="v">${supplierEmail}</div>` : ''}
                      ${supplierAddress ? `<div class="k">Dirección</div><div class="v">${supplierAddress}</div>` : ''}
                      ${invoice.storeName ? `<div class="k">Tienda</div><div class="v">${invoice.storeName}</div>` : ''}
                    </div>
                  </div>
                </div>

<div class="totals">
<div class="totals-head">Resumen</div>
<div class="totals-body">
<div class="totals-row"><div class="label">Bruto</div><div class="value">${getCurrencyPrefix(invoice.currency, { forTotals: true }) ? `${getCurrencyPrefix(invoice.currency, { forTotals: true })} ` : ''}${formatAmount(invoice.totalGross)}</div></div>
${(Number(invoice.totalDiscount || 0) > 0)
? `<div class="totals-row"><div class="label">Descuentos</div><div class="value">-${getCurrencyPrefix(invoice.currency) ? `${getCurrencyPrefix(invoice.currency)} ` : ''}${formatAmount(Number(invoice.totalDiscount || 0))}</div></div>
<div class="totals-row"><div class="label">Subtotal</div><div class="value">${getCurrencyPrefix(invoice.currency, { forTotals: true }) ? `${getCurrencyPrefix(invoice.currency, { forTotals: true })} ` : ''}${formatAmount(subtotalAfterDiscount)}</div></div>`
: ''}
<div class="totals-row"><div class="label">ITBIS${invoice.itbisToCost ? ' (al costo)' : ''}</div><div class="value">${getCurrencyPrefix(invoice.currency) ? `${getCurrencyPrefix(invoice.currency)} ` : ''}${formatAmount(invoice.totalItbis)}</div></div>
${(totalItbisWithheld > 0)
? `<div class="totals-row"><div class="label">ITBIS Retenido</div><div class="value">-${getCurrencyPrefix(invoice.currency) ? `${getCurrencyPrefix(invoice.currency)} ` : ''}${formatAmount(totalItbisWithheld)}</div></div>`
: ''}
${otherTaxesDetail
.map((t: any) => {
const name = String(t?.name || '').trim();
const amount = Number(t?.amount || 0) || 0;
const rate = Number(t?.rate || 0) || 0;
if (!name || amount <= 0) return '';
return `<div class="totals-row"><div class="label">${name}${rate ? ` (${rate}%)` : ''}</div><div class="value">${getCurrencyPrefix(invoice.currency) ? `${getCurrencyPrefix(invoice.currency)} ` : ''}${formatAmount(amount)}</div></div>`;
})
.join('')}
${(Number(invoice.totalIsrWithheld || 0) > 0)
? `<div class="totals-row"><div class="label">ISR Retenido</div><div class="value">-${getCurrencyPrefix(invoice.currency) ? `${getCurrencyPrefix(invoice.currency)} ` : ''}${formatAmount(Number(invoice.totalIsrWithheld || 0))}</div></div>`
: ''}
<div class="totals-row total"><div class="label">Total a pagar</div><div class="value">${getCurrencyPrefix(invoice.currency, { forTotals: true }) ? `${getCurrencyPrefix(invoice.currency, { forTotals: true })} ` : ''}${formatAmount(invoice.totalToPay)}</div></div>
</div>
</div>
</div>

<div class="table-wrap">
<table>
<thead>
<tr>
<th style="width: 54px;">No.</th>
<th>Descripción</th>
<th class="num" style="width: 110px;">Precio</th>
<th class="num" style="width: 80px;">Cant.</th>
<th class="num" style="width: 120px;">Importe</th>
</tr>
</thead>
<tbody>
${items
.map(
(item: any, idx: number) => `
<tr>
<td>${idx + 1}</td>
<td>${item.description}</td>
<td class="num">${getCurrencyPrefix(invoice.currency) ? `${getCurrencyPrefix(invoice.currency)} ` : ''}${formatAmount(item.unitPrice)}</td>
<td class="num">${item.quantity}</td>
<td class="num">${getCurrencyPrefix(invoice.currency) ? `${getCurrencyPrefix(invoice.currency)} ` : ''}${formatAmount(item.total)}</td>
</tr>`
)
.join('')}
</tbody>
</table>
</div>

              <div class="footer-grid">
                <div class="notes">
                  <div class="notes-head">Observaciones</div>
                  <div class="notes-body">${invoice.notes ? invoice.notes : 'Sin observaciones.'}</div>
                </div>
                <div></div>
              </div>
            </div>
          </body>
        </html>
      `;

      openHtmlPreview(html, `Factura de Suplidor #${safeNumber}`, `factura_cxp_${safeNumber}.html`);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error al preparar impresión de factura de suplidor', error);
      alert('No se pudo preparar la impresión de la factura.');
    }
  };

  const handleExportInvoiceExcel = async (invoice: APInvoice) => {
    try {
      const dbLines = await apInvoiceLinesService.getByInvoice(invoice.id);
      const items = (dbLines || []).map((l: any) => {
        const qty = Number(l.quantity) || 0;
        const price = Number(l.unit_price) || 0;
        const total = Number(l.line_total) || qty * price;
        return {
          description: l.description || (l.inventory_items as any)?.name || 'Gasto / Servicio',
          quantity: qty,
          unitPrice: price,
          total,
        };
      });

      if (items.length === 0) {
        items.push({
          description: invoice.expenseType606 || 'Gasto / Servicio',
          quantity: 1,
          unitPrice: invoice.totalToPay,
          total: invoice.totalToPay,
        });
      }

      const supplierName = invoice.legalName || invoice.supplierName;
      const supplier = suppliers.find((s: any) => String(s.id) === String(invoice.supplierId));
      const supplierTaxId = String(invoice.taxId || (supplier as any)?.tax_id || (supplier as any)?.rnc || '').trim();
      const supplierPhone = String((supplier as any)?.phone || '').trim();
      const supplierEmail = String((supplier as any)?.email || '').trim();
      const supplierAddress = String((supplier as any)?.address || '').trim();
      const companyName = (companyInfo as any)?.name || (companyInfo as any)?.company_name || 'ContaBi';
      const companyRnc = (companyInfo as any)?.rnc || (companyInfo as any)?.tax_id || (companyInfo as any)?.ruc || '';

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Factura');

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
      worksheet.getCell(`A${headerStartRow}`).value = `Factura de Suplidor #${invoice.invoiceNumber}`;
      worksheet.getCell(`A${headerStartRow}`).font = { bold: true, size: 12 };

      const ncfRow = headerStartRow + 1;
      worksheet.mergeCells(`A${ncfRow}:D${ncfRow}`);
      worksheet.getCell(`A${ncfRow}`).value = invoice.documentType
        ? `NCF / Tipo: ${invoice.documentType}`
        : 'NCF / Tipo: -';
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

      if (String(invoice.invoiceNumber || '').toUpperCase().startsWith('B')) {
        const fiscalRow = ncfRow + 1;
        worksheet.mergeCells(`A${fiscalRow}:D${fiscalRow}`);
        worksheet.getCell(`A${fiscalRow}`).value = '✓ FACTURA VÁLIDA PARA CRÉDITO FISCAL';
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

      worksheet.addRow(['Suplidor', supplierName]);
      if (supplierTaxId) worksheet.addRow(['RNC / Tax ID', supplierTaxId]);
      if (supplierPhone) worksheet.addRow(['Teléfono', supplierPhone]);
      if (supplierEmail) worksheet.addRow(['Email', supplierEmail]);
      if (supplierAddress) worksheet.addRow(['Dirección', supplierAddress]);
      if (invoice.storeName) worksheet.addRow(['Tienda', invoice.storeName]);
      worksheet.addRow([
        'Moneda',
        invoice.currency,
      ]);
      worksheet.addRow([
        'Fecha',
        invoice.invoiceDate ? new Date(invoice.invoiceDate).toLocaleDateString('es-DO') : '',
      ]);
      worksheet.addRow([
        'Vencimiento',
        invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString('es-DO') : '',
      ]);
      if (invoice.notes) worksheet.addRow(['Notas', invoice.notes]);

      worksheet.addRow([]);

      const itemsHeader = worksheet.addRow(['Descripción', 'Cantidad', 'Precio', 'Total']);
      itemsHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      itemsHeader.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1F3A' } };
      });

      items.forEach((item: any) => {
        worksheet.addRow([
          item.description,
          item.quantity,
          item.unitPrice,
          item.total,
        ]);
      });

      worksheet.addRow([]);
      worksheet.addRow(['', '', 'Bruto', invoice.totalGross]);
      if (Number((invoice as any).totalDiscount || 0) > 0) {
        worksheet.addRow(['', '', 'Descuentos', -Number((invoice as any).totalDiscount || 0)]);
        worksheet.addRow(['', '', 'Subtotal', Math.max(0, Number(invoice.totalGross || 0) - Number((invoice as any).totalDiscount || 0))]);
      }
      worksheet.addRow(['', '', 'ITBIS', invoice.totalItbis]);
      if (Number((invoice as any).totalItbisWithheld || 0) > 0) {
        worksheet.addRow(['', '', 'ITBIS Retenido', -Number((invoice as any).totalItbisWithheld || 0)]);
      }
      const otherTaxesDetail = Array.isArray((invoice as any).otherTaxes) ? (invoice as any).otherTaxes : [];
      otherTaxesDetail.forEach((t: any) => {
        const name = String(t?.name || '').trim();
        const amount = Number(t?.amount || 0) || 0;
        const rate = Number(t?.rate || 0) || 0;
        if (!name || amount <= 0) return;
        worksheet.addRow(['', '', `${name}${rate ? ` (${rate}%)` : ''}`, amount]);
      });
      worksheet.addRow(['', '', 'Total a pagar', invoice.totalToPay]);
      if (invoice.totalIsrWithheld) {
        worksheet.addRow(['', '', 'ISR Retenido', invoice.totalIsrWithheld]);
      }

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
      const safeNumber = invoice.invoiceNumber || invoice.id;

      openTablePreview({
        title: `Factura de Suplidor #${safeNumber}`,
        filename: `factura_cxp_${safeNumber}.xlsx`,
        blob,
        headers: ['Descripción', 'Cantidad', 'Precio', 'Total'],
        rows: items.map((item: any) => [
          item.description,
          item.quantity,
          `${getCurrencyPrefix(invoice.currency) ? `${getCurrencyPrefix(invoice.currency)} ` : ''}${formatAmount(Number(item.unitPrice || 0))}`,
          `${getCurrencyPrefix(invoice.currency) ? `${getCurrencyPrefix(invoice.currency)} ` : ''}${formatAmount(Number(item.total || 0))}`,
        ]),
        summary: [
          { label: 'Suplidor', value: supplierName },
          { label: 'Fecha', value: invoice.invoiceDate ? new Date(invoice.invoiceDate).toLocaleDateString('es-DO') : '' },
          { label: 'Total a pagar', value: `${getCurrencyPrefix(invoice.currency, { forTotals: true }) ? `${getCurrencyPrefix(invoice.currency, { forTotals: true })} ` : ''}${formatAmount(invoice.totalToPay)}` },
        ],
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error exportando factura de suplidor a Excel', error);
      alert('No se pudo exportar la factura a Excel.');
    }
  };

  const handleSaveInvoice = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user?.id) {
      alert('Debes iniciar sesión para registrar facturas de suplidor');
      return;
    }

    if (!headerForm.supplierId) {
      alert('Debes seleccionar un suplidor');
      return;
    }

    if (!headerForm.documentType || headerForm.documentType.trim() === '') {
      alert('Debes ingresar el NCF / Tipo de Comprobante de la factura');
      return;
    }

    if (!headerForm.storeName || headerForm.storeName.trim() === '') {
      alert('Debes indicar la tienda o sucursal que registra la compra');
      return;
    }

    const activeLines = lines.filter(l => l.description.trim() !== '' && Number(l.quantity) > 0 && Number(l.unitPrice) >= 0);
    if (activeLines.length === 0) {
      alert('Agrega al menos una línea con descripción y cantidad > 0');
      return;
    }

    // Validar que la cantidad no exceda lo pendiente por facturar de la orden de compra
    if (headerForm.purchaseOrderId) {
      const invalidLine = activeLines.find((l) => {
        if (!l.purchaseOrderItemId || l.maxQuantityFromPo == null || l.alreadyInvoicedQty == null) return false;
        const qty = Number(l.quantity) || 0;
        const maxAvailable = (Number(l.maxQuantityFromPo) || 0) - (Number(l.alreadyInvoicedQty) || 0);
        return qty > maxAvailable + 1e-6;
      });

      if (invalidLine) {
        alert('La cantidad de una o más líneas supera lo pendiente por facturar de la orden de compra seleccionada.');
        return;
      }
    }

    const { gross, totalDiscount, itbis, totalOtherTaxes, otherTaxesDetail, itbisWithheld, isr, toPay } = calculateTotals();
    const { affectsItbis, supplierTypeKey, isrWithholdingRate } = getCurrentSupplierTaxProfile();

    if (supplierTypeKey === 'proveedor_informal') {
      if (itbis > 0) {
        alert('Proveedor informal no puede registrar ITBIS');
        return;
      }
      if (!(isrWithholdingRate > 0)) {
        alert('Proveedor informal requiere retención de ISR mayor a 0');
        return;
      }
      if (headerForm.documentType && String(headerForm.documentType).trim() !== '' && String(headerForm.documentType).trim() !== 'B17') {
        alert('Proveedor informal debe registrarse con comprobante B17 (o equivalente interno)');
        return;
      }
    }

    if (supplierTypeKey === 'persona_juridica') {
      const taxIdDigits = String(headerForm.taxId || '').replace(/\D+/g, '');
      if (taxIdDigits.length !== 9) {
        alert('Para Persona Jurídica el RNC debe tener 9 dígitos');
        return;
      }
    }

    if (supplierTypeKey === 'persona_fisica') {
      const taxIdDigits = String(headerForm.taxId || '').replace(/\D+/g, '');
      if (taxIdDigits.length !== 11) {
        alert('Para Persona Física la Cédula debe tener 11 dígitos');
        return;
      }
    }

    if (supplierTypeKey === 'prestador_servicios') {
      const taxIdDigits = String(headerForm.taxId || '').replace(/\D+/g, '');
      if (!(taxIdDigits.length === 9 || taxIdDigits.length === 11)) {
        alert('Para Prestador de Servicios el RNC debe tener 9 dígitos o la Cédula 11 dígitos');
        return;
      }
    }

    const invoiceNumber = headerForm.invoiceNumber.trim() || `AP-${Date.now()}`;
    const invoiceDate = headerForm.invoiceDate || new Date().toISOString().slice(0, 10);
    const dueDate = headerForm.dueDate || null;

    const payload: any = {
      supplier_id: headerForm.supplierId,
      invoice_number: invoiceNumber,
      invoice_date: invoiceDate,
      due_date: dueDate,
      document_type: headerForm.documentType || null,
      tax_id: headerForm.taxId || null,
      legal_name: headerForm.legalName || null,
      payment_terms_id: headerForm.paymentTermsId || null,
      currency: headerForm.currency || 'DOP',
      total_gross: gross,
      total_itbis: itbis,
      total_itbis_withheld: itbisWithheld,
      total_isr_withheld: isr,
      total_to_pay: toPay,
      store_name: headerForm.storeName || null,
      notes: headerForm.notes || null,
      expense_type_606: headerForm.expenseType606 || null,
      discount_type: headerForm.discountType || null,
      discount_value: headerForm.discountValue ? Number(headerForm.discountValue) : 0,
      total_discount: totalDiscount,
      itbis_to_cost: headerForm.itbisToCost,
      other_taxes: otherTaxesDetail.length > 0 ? JSON.stringify(otherTaxesDetail) : null,
      total_other_taxes: totalOtherTaxes,
      purchase_order_id: headerForm.purchaseOrderId || null,
      status: editingInvoice?.status || 'pending',
    };

    const linesPayload = activeLines.map((l) => {
      const qty = Number(l.quantity) || 0;
      const price = Number(l.unitPrice) || 0;
      const lineTotal = qty * price;
      const discountPct = Number(l.discountPercentage) || 0;
      const lineDiscountAmt = lineTotal * (discountPct / 100);
      const lineTotalAfterDiscount = lineTotal - lineDiscountAmt;
      const itbisRate = taxConfig?.itbis_rate ?? 18;
      const lineItbis = affectsItbis ? lineTotalAfterDiscount * (itbisRate / 100) : 0;
      return {
        description: l.description,
        expense_account_id: l.expenseAccountId || null,
        inventory_item_id: l.inventoryItemId || null,
        purchase_order_item_id: l.purchaseOrderItemId || null,
        quantity: qty,
        unit_price: price,
        line_total: lineTotal,
        discount_percentage: discountPct,
        discount_amount: lineDiscountAmt,
        itbis_amount: lineItbis,
        isr_amount: 0,
      };
    });

    try {
      let invoiceId: string;
      if (editingInvoice) {
        const updated = await apInvoicesService.update(editingInvoice.id, payload);
        invoiceId = String(updated.id);
        await apInvoiceLinesService.deleteByInvoice(invoiceId);
      } else {
        const created = await apInvoicesService.create(user.id, payload);
        invoiceId = String(created.id);
      }

      await apInvoiceLinesService.createMany(invoiceId, linesPayload);
      await loadInvoices();
      setShowModal(false);
      alert(editingInvoice ? 'Factura actualizada exitosamente' : 'Factura creada exitosamente');
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('Error guardando factura de suplidor', error);
      alert(error?.message || 'Error al guardar la factura');
    }
  };

  const filteredInvoices = invoices.filter((inv) => {
    const matchesSearch =
      searchTerm === '' ||
      inv.supplierName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || inv.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'approved':
      case 'paid':
        return 'bg-green-100 text-green-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

  const inputBaseClass =
    'w-full px-3 py-2 text-sm border border-[#d8cbb5] rounded-lg bg-[#fffdf6] focus:ring-2 focus:ring-[#6b5c3b] focus:border-[#6b5c3b]';
  const subtleButtonClass =
    'px-3 py-2 bg-[#f3ecda] text-[#2f3e1e] border border-[#d8cbb5] rounded-lg hover:bg-[#e3dcc8] text-sm font-medium transition-colors';

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6 bg-[#f7f3e8] min-h-screen rounded-2xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-wide text-[#6b5c3b]">Procurement</p>
            <h1 className="text-3xl font-bold text-[#2f3e1e]">Supplier Invoices</h1>
            <p className="text-[#6b5c3b] text-sm max-w-2xl">
              Register supplier invoices for the AP module, using payment terms and tax configuration per vendor.
            </p>
          </div>
          <button
            onClick={handleNewInvoice}
            className="bg-[#2f3e1e] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#1f2913] transition-colors shadow-sm"
          >
            <i className="ri-add-line mr-2" />
            New Invoice
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-[#e4d8c4] p-4 flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#9b8a64]">
                <i className="ri-search-line" />
              </span>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-[#d8cbb5] rounded-lg text-sm bg-[#fffdf6] focus:ring-2 focus:ring-[#6b5c3b] focus:border-[#6b5c3b]"
                placeholder="Search by supplier or invoice number..."
              />
            </div>
          </div>
          <div className="w-full md:w-56">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-[#d8cbb5] rounded-lg text-sm bg-[#fffdf6] focus:ring-2 focus:ring-[#6b5c3b] focus:border-[#6b5c3b]"
            >
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="paid">Paid</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-[#e4d8c4] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#e4d8c4] flex items-center justify-between bg-[#f7f3e8]">
            <h2 className="text-sm font-semibold text-[#2f3e1e]">Registered invoices</h2>
            <span className="text-xs text-[#6b5c3b]">Total: {filteredInvoices.length}</span>
          </div>
          {filteredInvoices.length === 0 ? (
            <div className="p-6 text-center text-[#6b5c3b] text-sm">
              No supplier invoices have been recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[#e4d8c4] text-sm">
                <thead className="bg-[#f7f3e8]">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-[#6b5c3b] uppercase text-xs">Invoice</th>
                    <th className="px-4 py-2 text-left font-semibold text-[#6b5c3b] uppercase text-xs">Supplier</th>
                    <th className="px-4 py-2 text-left font-semibold text-[#6b5c3b] uppercase text-xs">Date</th>
                    <th className="px-4 py-2 text-left font-semibold text-[#6b5c3b] uppercase text-xs">Due Date</th>
                    <th className="px-4 py-2 text-right font-semibold text-[#6b5c3b] uppercase text-xs">Gross</th>
                    <th className="px-4 py-2 text-right font-semibold text-[#6b5c3b] uppercase text-xs">ITBIS</th>
                    <th className="px-4 py-2 text-right font-semibold text-[#6b5c3b] uppercase text-xs">Total Payable</th>
                    <th className="px-4 py-2 text-left font-semibold text-[#6b5c3b] uppercase text-xs">Status</th>
                    <th className="px-4 py-2 text-left font-semibold text-[#6b5c3b] uppercase text-xs">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f3ecda] bg-white">
                  {filteredInvoices.map(inv => (
                    <tr key={inv.id} className="hover:bg-[#fffdf6]">
                      <td className="px-4 py-2 whitespace-nowrap text-[#2f3e1e]">{inv.invoiceNumber}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-[#2f3e1e]">{inv.supplierName}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-[#2f3e1e]">{inv.invoiceDate}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-[#2f3e1e]">{inv.dueDate || '-'}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-right text-[#2f3e1e]">{inv.currency} {formatAmount(inv.totalGross)}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-right text-[#2f3e1e]">{inv.currency} {formatAmount(inv.totalItbis)}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-right text-[#2f3e1e] font-semibold">
                        <div>
                          {inv.currency} {formatAmount(inv.totalToPay)}
                        </div>
                        {(inv as any).baseTotalToPay != null && inv.currency !== baseCurrencyCode && (
                          <div className="text-xs text-[#6b5c3b]">
                            ≈ {baseCurrencyCode}{' '}
                            {formatAmount((inv as any).baseTotalToPay)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusBadgeClass(inv.status)}`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleEditInvoice(inv)}
                            className="text-[#4b5c4b] hover:text-[#2f3e1e]"
                            title="Edit"
                          >
                            <i className="ri-edit-line" />
                          </button>
                          <button
                            onClick={() => handlePrintInvoice(inv)}
                            className="text-[#7a2e1b] hover:text-[#5c1f12]"
                            title="Print"
                          >
                            <i className="ri-printer-line" />
                          </button>
                          <button
                            onClick={() => handleExportInvoiceExcel(inv)}
                            className="text-[#2f3e1e] hover:text-[#1f2913]"
                            title="Export to Excel"
                          >
                            <i className="ri-file-excel-2-line" />
                          </button>
                          <button
                            onClick={() => handleDeleteInvoice(inv.id)}
                            className="text-[#b64736] hover:text-[#7a2e1b]"
                            title="Delete"
                          >
                            <i className="ri-delete-bin-line" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {showDocumentPreviewModal && (
          <div
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
            onClick={handleCloseDocumentPreview}
          >
            <div
              className="bg-[#fffdf6] border border-[#e4d8c4] rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center px-6 py-4 border-b border-[#e4d8c4] bg-[#f7f3e8]">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#6b5c3b] mb-1">Document preview</p>
                  <h3 className="text-2xl font-semibold text-[#2f3e1e] truncate">{documentPreviewTitle}</h3>
                  {documentPreviewFilename ? (
                    <p className="text-sm text-[#6b5c3b] truncate">{documentPreviewFilename}</p>
                  ) : null}
                </div>
                <button
                  onClick={handleCloseDocumentPreview}
                  className="text-[#6b5c3b] hover:text-[#2f3e1e] transition-colors"
                >
                  <i className="ri-close-line text-2xl" />
                </button>
              </div>

              <div className="flex-1 overflow-auto border-b border-[#e4d8c4] bg-white">
                {documentPreviewType === 'table' ? (
                  <div className="p-6 space-y-4">
                    {documentPreviewSummary.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {documentPreviewSummary.map((item, idx) => (
                          <div key={idx} className="bg-[#fffdf6] border border-[#e4d8c4] rounded-xl p-4">
                            <div className="text-xs uppercase text-[#6b5c3b]">{item.label}</div>
                            <div className="text-sm font-semibold text-[#2f3e1e]">{item.value}</div>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <div className="border border-[#e4d8c4] rounded-2xl overflow-hidden shadow-sm">
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-[#e4d8c4]">
                          <thead className="bg-[#f7f3e8] sticky top-0">
                            <tr>
                              {documentPreviewHeaders.map((header, idx) => (
                                <th
                                  key={idx}
                                  className="px-4 py-3 text-left text-xs font-semibold text-[#6b5c3b] uppercase tracking-wide"
                                >
                                  {header}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-[#f3ecda]">
                            {documentPreviewRows.map((row, rowIdx) => (
                              <tr key={rowIdx} className="hover:bg-[#fffdf6]">
                                {row.map((cell, cellIdx) => (
                                  <td
                                    key={cellIdx}
                                    className="px-4 py-3 text-sm text-[#2f3e1e] whitespace-nowrap"
                                  >
                                    {cell !== null && cell !== undefined ? String(cell) : ''}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ) : documentPreviewUrl ? (
                  <iframe
                    ref={documentPreviewIframeRef}
                    src={documentPreviewUrl}
                    title={documentPreviewTitle}
                    className="w-full h-[70vh]"
                  />
                ) : (
                  <div className="p-6 text-[#6b5c3b]">No preview is available.</div>
                )}
              </div>

              <div className="flex flex-wrap justify-end gap-3 px-6 py-4 bg-[#fffdf6]">
                {(documentPreviewType === 'pdf' || documentPreviewType === 'html') && documentPreviewUrl ? (
                  <button
                    onClick={handlePrintDocumentPreview}
                    className="px-4 py-2 rounded-lg bg-[#2f3e1e] text-white text-sm font-medium hover:bg-[#1f2913] transition-colors"
                  >
                    Print
                  </button>
                ) : null}
                <button
                  onClick={handleCloseDocumentPreview}
                  className="px-4 py-2 rounded-lg border border-[#d8cbb5] text-[#2f3e1e] text-sm font-medium hover:bg-[#f7f3e8] transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={handleDownloadDocumentPreview}
                  disabled={!documentPreviewBlob || !documentPreviewFilename}
                  className="px-4 py-2 rounded-lg bg-[#6b5c3b] text-white text-sm font-medium hover:bg-[#4a3c24] transition-colors disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
                >
                  Download
                </button>
              </div>
            </div>
          </div>
        )}

        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
            <div className="bg-[#fffdf6] border border-[#e4d8c4] rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
              <div className="px-6 py-5 border-b border-[#e4d8c4] flex items-center justify-between bg-[#f7f3e8] rounded-t-2xl">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-[#6b5c3b] mb-1">Supplier invoice</p>
                  <h2 className="text-2xl font-semibold text-[#2f3e1e]">
                    {editingInvoice ? 'Edit Supplier Invoice' : 'New Supplier Invoice'}
                  </h2>
                </div>
                <button
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                  className="text-[#6b5c3b] hover:text-[#2f3e1e] transition-colors"
                >
                  <i className="ri-close-line text-2xl" />
                </button>
              </div>

              <form onSubmit={handleSaveInvoice} className="px-6 py-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#2f3e1e] mb-1">Supplier *</label>
                    <select
                      required
                      value={headerForm.supplierId}
                      onChange={(e) => handleSupplierChange(e.target.value)}
                      className={inputBaseClass}
                    >
                      <option value="">Select a supplier...</option>
                      {suppliers.map((s: any) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  {headerForm.supplierId ? (
                    <div className="md:col-span-2 lg:col-span-3">
                      {(() => {
                        const s = suppliers.find((row: any) => String(row.id) === String(headerForm.supplierId));
                        if (!s) return null;
                        const name = String(s.legal_name || s.name || '').trim();
                        const taxId = String(s.tax_id || s.rnc || '').trim();
                        const phone = String(s.phone || '').trim();
                        const email = String(s.email || '').trim();
                        const address = String(s.address || '').trim();
                        if (!name && !taxId && !phone && !email && !address) return null;
                        return (
                          <div className="p-3 bg-[#fffdf6] border border-[#e4d8c4] rounded-xl text-xs md:text-sm text-[#2f3e1e] space-y-0.5">
                            {name ? <p className="font-semibold">{name}</p> : null}
                            {taxId ? <p>RNC / Tax ID: {taxId}</p> : null}
                            {phone ? <p>Phone: {phone}</p> : null}
                            {email ? <p>Email: {email}</p> : null}
                            {address ? <p>Address: {address}</p> : null}
                          </div>
                        );
                      })()}
                    </div>
                  ) : null}

                  <div>
                    <label className="block text-sm font-medium text-[#2f3e1e] mb-1">
                      Purchase Order <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={headerForm.purchaseOrderId || ''}
                      onChange={(e) => handlePurchaseOrderChange(e.target.value)}
                      className={inputBaseClass}
                    >
                      <option value="">No purchase order</option>
                      {purchaseOrders
                        .filter((po: any) => headerForm.supplierId && String(po.supplier_id) === String(headerForm.supplierId))
                        .filter((po: any) => po.status !== 'cancelled')
                        .map((po: any) => (
                          <option key={po.id} value={po.id}>
                            {(po.po_number || po.id)} - {po.order_date} - Total {formatAmount(Number(po.total_amount || 0))}
                          </option>
                        ))}
                    </select>
                    <p className="mt-1 text-xs text-[#6b5c3b]">
                      Selecting a PO will load its lines into the invoice. You can still adjust quantities or remove rows.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#2f3e1e] mb-1">NCF / Vouchers *</label>
                    <input
                      type="text"
                      required
                      value={headerForm.documentType}
                      onChange={(e) => setHeaderForm(prev => ({ ...prev, documentType: e.target.value }))}
                      className={inputBaseClass}
                      placeholder="Ex: B01, B02..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#2f3e1e] mb-1">Invoice Number</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={headerForm.invoiceNumber}
                        onChange={(e) => setHeaderForm(prev => ({ ...prev, invoiceNumber: e.target.value }))}
                        className={`${inputBaseClass} flex-1`}
                        placeholder="Ex: FAC-0001"
                      />
                      <button
                        type="button"
                        onClick={generateInvoiceNumber}
                        className={subtleButtonClass}
                        title="Generate automatically"
                      >
                        <i className="ri-refresh-line" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#2f3e1e] mb-1">RNC / Tax ID</label>
                    <input
                      type="text"
                      value={headerForm.taxId}
                      onChange={(e) => {
                        const formatted = formatTaxId(e.target.value);
                        setHeaderForm(prev => ({ ...prev, taxId: formatted }));
                      }}
                      className={inputBaseClass}
                      placeholder="000-00000-0 / 000-0000000-0"
                    />
                  </div>

                  <div className="md:col-span-1 lg:col-span-2">
                    <label className="block text-sm font-medium text-[#2f3e1e] mb-1">Legal Name</label>
                    <input
                      type="text"
                      value={headerForm.legalName}
                      onChange={(e) => setHeaderForm(prev => ({ ...prev, legalName: e.target.value }))}
                      className={inputBaseClass}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#2f3e1e] mb-1">Invoice Date</label>
                    <input
                      type="date"
                      value={headerForm.invoiceDate}
                      onChange={(e) => setHeaderForm(prev => ({ ...prev, invoiceDate: e.target.value }))}
                      className={inputBaseClass}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#2f3e1e] mb-1">Due Date</label>
                    <input
                      type="date"
                      value={headerForm.dueDate || ''}
                      onChange={(e) => setHeaderForm(prev => ({ ...prev, dueDate: e.target.value }))}
                      className={inputBaseClass}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#2f3e1e] mb-1">Payment Terms</label>
                    <select
                      value={headerForm.paymentTermsId || ''}
                      onChange={(e) => setHeaderForm(prev => ({ ...prev, paymentTermsId: e.target.value }))}
                      className={inputBaseClass}
                    >
                      <option value="">No specific terms</option>
                      {paymentTerms.map((t: any) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.days} days)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#2f3e1e] mb-1">Currency</label>
                    <select
                      value={headerForm.currency}
                      onChange={(e) => setHeaderForm(prev => ({ ...prev, currency: e.target.value }))}
                      className={inputBaseClass}
                    >
                      {currencies.length === 0 ? (
                        <>
                          <option value="DOP">DOP</option>
                          <option value="USD">USD</option>
                          <option value="EUR">EUR</option>
                        </>
                      ) : (
                        currencies.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.code} - {c.name}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#2f3e1e] mb-1">606 Expense Type</label>
                    <select
                      value={headerForm.expenseType606}
                      onChange={(e) => setHeaderForm(prev => ({ ...prev, expenseType606: e.target.value }))}
                      className={inputBaseClass}
                    >
                      <option value="">Not specified</option>
                      {expenseTypes606.map((type) => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-[#6b5c3b]">
                      Recommended for the DGII 606 filing
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#2f3e1e] mb-1">Store / Branch *</label>
                    {stores.length > 0 ? (
                      <select
                        value={headerForm.storeName}
                        onChange={(e) => setHeaderForm(prev => ({ ...prev, storeName: e.target.value }))}
                        className={`${inputBaseClass} pr-8`}
                      >
                        <option value="">Select a store...</option>
                        {stores.map((s) => (
                          <option key={s.id} value={s.name}>{s.name}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={headerForm.storeName}
                        onChange={(e) => setHeaderForm(prev => ({ ...prev, storeName: e.target.value }))}
                        className={inputBaseClass}
                        placeholder="Ex: Main store"
                      />
                    )}
                  </div>
                  <div className="md:col-span-2 lg:col-span-3">
                    <label className="block text-sm font-medium text-[#2f3e1e] mb-1">Notes</label>
                    <textarea
                      value={headerForm.notes}
                      onChange={(e) => setHeaderForm(prev => ({ ...prev, notes: e.target.value }))}
                      rows={2}
                      className={inputBaseClass}
                      placeholder="Observations or comments about this invoice"
                    />
                  </div>
                </div>

                {/* Discounts & special options */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-[#e4d8c4]">
                  <div>
                    <label className="block text-sm font-medium text-[#2f3e1e] mb-1">Discount type</label>
                    <select
                      value={headerForm.discountType}
                      onChange={(e) => setHeaderForm(prev => ({ ...prev, discountType: e.target.value }))}
                      className={inputBaseClass}
                    >
                      <option value="">No global discount</option>
                      <option value="percentage">Percentage (%)</option>
                      <option value="fixed">Fixed amount</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#2f3e1e] mb-1">Discount value</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={headerForm.discountValue || ''}
                      onChange={(e) => setHeaderForm(prev => ({ ...prev, discountValue: e.target.value }))}
                      className={inputBaseClass}
                      placeholder={headerForm.discountType === 'percentage' ? 'Ex: 10' : 'Ex: 100.00'}
                      disabled={!headerForm.discountType}
                    />
                    {headerForm.discountType && (
                      <p className="mt-1 text-xs text-[#6b5c3b]">
                        {headerForm.discountType === 'percentage'
                          ? 'Percentage applied to the entire invoice'
                          : 'Fixed amount deducted from the total'}
                      </p>
                    )}
                  </div>
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={headerForm.exentoItbis}
                      onChange={(e) =>
                        setHeaderForm(prev => ({
                          ...prev,
                          exentoItbis: e.target.checked,
                          itbisToCost: e.target.checked ? false : prev.itbisToCost,
                        }))
                      }
                      className="mt-1 h-4 w-4 text-[#2f3e1e] focus:ring-[#2f3e1e] border-[#d8cbb5] rounded"
                    />
                    <span className="text-sm text-[#2f3e1e]">
                      No ITBIS (Exempt)
                      <span className="block text-xs text-[#6b5c3b]">Fixed assets, real estate, or other exempt expenses</span>
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={headerForm.itbisToCost}
                      onChange={(e) => setHeaderForm(prev => ({ ...prev, itbisToCost: e.target.checked }))}
                      className="mt-1 h-4 w-4 text-[#2f3e1e] focus:ring-[#2f3e1e] border-[#d8cbb5] rounded"
                      disabled={headerForm.exentoItbis}
                    />
                    <span className={`text-sm ${headerForm.exentoItbis ? 'text-gray-400' : 'text-[#2f3e1e]'}`}>
                      Capitalize ITBIS
                      <span className="block text-xs text-[#6b5c3b]">Adds ITBIS to the expense instead of crediting it</span>
                    </span>
                  </div>
                </div>

                {/* Additional taxes */}
                <div className="pt-4 border-t border-[#e4d8c4]">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-sm font-semibold text-[#2f3e1e]">Other taxes (besides ITBIS)</h3>
                    <button
                      type="button"
                      onClick={handleAddTax}
                      className="text-xs text-[#2f3e1e] hover:text-[#1f2913] flex items-center"
                    >
                      <i className="ri-add-line mr-1" />
                      Add tax
                    </button>
                  </div>
                  {otherTaxes.length > 0 && (
                    <div className="space-y-2">
                      {otherTaxes.map((tax, index) => (
                        <div key={index} className="flex gap-2 items-center">
                          <input
                            type="text"
                            value={tax.name || ''}
                            onChange={(e) => handleTaxChange(index, 'name', e.target.value)}
                            placeholder="Ex: Selective tax"
                            className={`${inputBaseClass} flex-1`}
                          />
                          <div className="relative w-32">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.01"
                              value={tax.rate || ''}
                              onChange={(e) => handleTaxChange(index, 'rate', e.target.value)}
                              placeholder="0"
                              className="w-full px-3 py-2 pr-8 text-sm text-right border border-[#d8cbb5] rounded-lg bg-[#fffdf6] focus:ring-2 focus:ring-[#6b5c3b] focus:border-[#6b5c3b]"
                            />
                            <span className="absolute right-3 top-2 text-gray-500 text-sm">%</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveTax(index)}
                            className="text-[#b64736] hover:text-[#7a2e1b] px-2"
                          >
                            <i className="ri-delete-bin-line" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {otherTaxes.length === 0 && (
                    <p className="text-xs text-[#6b5c3b]">No additional taxes added</p>
                  )}
                </div>

                <div className="mt-4">
                  <h3 className="text-sm font-semibold text-[#2f3e1e] mb-2">Invoice lines</h3>
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="min-w-full text-xs md:text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-2 py-2 text-left font-medium text-gray-600 text-xs">Item / Description</th>
                          <th className="px-2 py-2 text-left font-medium text-gray-600 text-xs">Account</th>
                          <th className="px-2 py-2 text-right font-medium text-gray-600 text-xs">Qty.</th>
                          <th className="px-2 py-2 text-right font-medium text-gray-600 text-xs">Price</th>
                          <th className="px-2 py-2 text-right font-medium text-gray-600 text-xs">Disc.%</th>
                          <th className="px-2 py-2 text-right font-medium text-gray-600 text-xs">Total</th>
                          <th className="px-2 py-2 text-center font-medium text-gray-600 text-xs">-</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {lines.map((line, index) => {
                          const qty = Number(line.quantity) || 0;
                          const price = Number(line.unitPrice) || 0;
                          const lineTotal = qty * price;
                          const discountPct = Number(line.discountPercentage || 0);
                          const discountAmt = lineTotal * (discountPct / 100);
                          const totalAfterDiscount = lineTotal - discountAmt;
                          return (
                            <tr key={index}>
                              <td className="px-2 py-2">
                                <select
                                  value={line.inventoryItemId || ''}
                                  onChange={(e) => {
                                    const selectedId = e.target.value;
                                    handleLineChange(index, 'inventoryItemId', selectedId);
                                    const item = inventoryItems.find((i: any) => String(i.id) === String(selectedId));
                                    if (item) {
                                      if (!line.description) {
                                        handleLineChange(index, 'description', item.name || '');
                                      }
                                      const cost = Number(item.cost_price ?? item.purchase_cost ?? 0) || 0;
                                      if (cost > 0) {
                                        handleLineChange(index, 'unitPrice', String(cost));
                                      }
                                    }
                                  }}
                                  className="w-full border border-gray-300 rounded-md px-1 py-1 text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 mb-1"
                                >
                                  <option value="">No item</option>
                                  {inventoryItems.map((item: any) => (
                                    <option key={item.id} value={item.id}>
                                      {item.name} ({item.sku || 'No SKU'})
                                    </option>
                                  ))}
                                </select>
                                <input
                                  type="text"
                                  value={line.description || ''}
                                  onChange={(e) => handleLineChange(index, 'description', e.target.value)}
                                  className="w-full border border-gray-300 rounded-md px-1 py-1 text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                  placeholder="Description"
                                />
                              </td>
                              <td className="px-2 py-2">
                                <select
                                  value={line.expenseAccountId || ''}
                                  onChange={(e) => handleLineChange(index, 'expenseAccountId', e.target.value)}
                                  className="w-full border border-gray-300 rounded-md px-1 py-1 text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                >
                                  <option value="">Select account...</option>
                                  {expenseAccounts.map((acc: any) => (
                                    <option key={acc.id} value={acc.id}>
                                      {acc.code} - {acc.name}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-2 py-2">
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={line.quantity}
                                  onChange={(e) => handleLineChange(index, 'quantity', e.target.value)}
                                  className="w-full border border-gray-300 rounded-md px-1 py-1 text-xs text-right focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                />
                              </td>
                              <td className="px-2 py-2">
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={line.unitPrice}
                                  onChange={(e) => handleLineChange(index, 'unitPrice', e.target.value)}
                                  className="w-full border border-gray-300 rounded-md px-1 py-1 text-xs text-right focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                />
                              </td>
                              <td className="px-2 py-2">
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="0.01"
                                  value={line.discountPercentage}
                                  onChange={(e) => handleLineChange(index, 'discountPercentage', e.target.value)}
                                  className="w-full border border-gray-300 rounded-md px-1 py-1 text-xs text-right focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                />
                              </td>
                              <td className="px-2 py-2 text-right">
                                <div>{headerForm.currency} {formatAmount(totalAfterDiscount)}</div>
                                {discountAmt > 0 && (
                                  <div className="text-[#b64736] text-xs">-{headerForm.currency} {formatAmount(discountAmt)}</div>
                                )}
                              </td>
                              <td className="px-2 py-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveLine(index)}
                                  className="text-red-500 hover:text-red-700"
                                >
                                  <i className="ri-delete-bin-line" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-2 flex justify-between items-center">
                    <button
                      type="button"
                      onClick={handleAddLine}
                      className="text-sm text-[#2f3e1e] hover:text-[#1f2913] flex items-center"
                    >
                      <i className="ri-add-line mr-1" />
                      Add line
                    </button>
                    <div className="text-right text-sm text-[#2f3e1e] space-y-1">
                      {(() => {
                        const { gross, totalDiscount, grossAfterDiscount, itbis, otherTaxesDetail, itbisWithheld, isr, toPay } = calculateTotals();
                        return (
                          <>
                            <div>Gross: {headerForm.currency} {formatAmount(gross)}</div>
                            {totalDiscount > 0 && (
                              <>
                                <div className="text-[#b64736]">Discounts: -{headerForm.currency} {formatAmount(totalDiscount)}</div>
                                <div className="text-[#2f3e1e] font-semibold">Subtotal: {headerForm.currency} {formatAmount(grossAfterDiscount)}</div>
                              </>
                            )}
                            <div>ITBIS (18%){headerForm.itbisToCost ? ' (capitalized)' : ''}: {headerForm.currency} {formatAmount(itbis)}</div>
                            {itbisWithheld > 0 && (
                              <div className="text-[#6b5c3b]">Withheld ITBIS: -{headerForm.currency} {formatAmount(itbisWithheld)}</div>
                            )}
                            {otherTaxesDetail.map((tax, idx) => (
                              <div key={idx} className="text-[#6b5c3b]">
                                {tax.name} ({tax.rate}%): {headerForm.currency} {formatAmount(tax.amount)}
                              </div>
                            ))}
                            {isr > 0 && <div>Withheld ISR: -{headerForm.currency} {formatAmount(isr)}</div>}
                            <div className="font-semibold text-lg border-t border-[#e4d8c4] pt-1 text-[#2f3e1e]">
                              Total Payable: {headerForm.currency} {formatAmount(toPay)}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false);
                      resetForm();
                    }}
                    className="px-4 py-2 border border-[#d8cbb5] rounded-lg text-[#2f3e1e] hover:bg-[#f7f3e8] text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-[#2f3e1e] text-white rounded-lg hover:bg-[#1f2913] text-sm font-semibold shadow-sm"
                  >
                    {editingInvoice ? 'Save Changes' : 'Save Invoice'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Invoice Print Type Modal */}
        <InvoiceTypeModal
          isOpen={showPrintTypeModal}
          onClose={() => {
            setShowPrintTypeModal(false);
            setInvoiceToPrint(null);
          }}
          onSelect={handlePrintTypeSelect}
          documentType="supplier_invoice"
          title="Select Invoice Format"
        />
      </div>
    </DashboardLayout>
  );
}
