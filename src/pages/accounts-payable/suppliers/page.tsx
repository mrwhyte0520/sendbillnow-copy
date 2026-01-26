import { useEffect, useRef, useState } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { exportToExcelWithHeaders } from '../../../utils/exportImportUtils';
import { normalizeExpenseType606 } from '../../../utils/expenseType606';
import {
  suppliersService,
  chartAccountsService,
  supplierTypesService,
  paymentTermsService,
  bankAccountsService,
  settingsService,
} from '../../../services/database';

const CATEGORY_MAP_KEY_PREFIX = 'suppliers_category_map_v1:';
const CATEGORY_OPTIONS_KEY_PREFIX = 'suppliers_category_options_v1:';

const onlyDigits = (value: any) => String(value || '').replace(/\D/g, '');

const formatTaxId = (documentType: string, digitsRaw: string) => {
  const digits = onlyDigits(digitsRaw);
  if (!digits) return '';

  const type = String(documentType || '').toLowerCase();

  if (type === 'rnc') {
    const d = digits.slice(0, 9);
    if (d.length <= 3) return d;
    if (d.length <= 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
    return `${d.slice(0, 3)}-${d.slice(3, 8)}-${d.slice(8, 9)}`;
  }

  if (type === 'cédula' || type === 'cedula') {
    const d = digits.slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 10) return `${d.slice(0, 3)}-${d.slice(3)}`;
    return `${d.slice(0, 3)}-${d.slice(3, 10)}-${d.slice(10, 11)}`;
  }

  return digits;
};

const readStoredCategoryMap = (userId: string) => {
  try {
    const raw = localStorage.getItem(`${CATEGORY_MAP_KEY_PREFIX}${userId}`);
    if (!raw) return {} as Record<string, string>;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : ({} as Record<string, string>);
  } catch {
    return {} as Record<string, string>;
  }
};

const writeStoredCategoryMap = (userId: string, map: Record<string, string>) => {
  try {
    localStorage.setItem(`${CATEGORY_MAP_KEY_PREFIX}${userId}`, JSON.stringify(map || {}));
  } catch {
  }
};

const setStoredSupplierCategory = (userId: string, supplierId: string, category: string) => {
  if (!userId || !supplierId) return;
  const map = readStoredCategoryMap(userId);
  map[String(supplierId)] = String(category || '').trim();
  writeStoredCategoryMap(userId, map);
};

const readStoredCategoryOptions = (userId: string) => {
  try {
    const raw = localStorage.getItem(`${CATEGORY_OPTIONS_KEY_PREFIX}${userId}`);
    if (!raw) return [] as string[];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : ([] as string[]);
  } catch {
    return [] as string[];
  }
};

const writeStoredCategoryOptions = (userId: string, options: string[]) => {
  try {
    localStorage.setItem(`${CATEGORY_OPTIONS_KEY_PREFIX}${userId}`, JSON.stringify(options || []));
  } catch {
  }
};

const upsertStoredCategory = (userId: string, category: string) => {
  const clean = String(category || '').trim();
  if (!userId || !clean) return;
  const existing = readStoredCategoryOptions(userId);
  const normalized = clean.toLowerCase();
  const has = existing.some((c) => String(c || '').trim().toLowerCase() === normalized);
  if (has) return;
  const next = [...existing, clean].sort((a, b) => String(a).localeCompare(String(b), 'es'));
  writeStoredCategoryOptions(userId, next);
};

function getTaxIdDigitsLimit(documentType: string) {
  if (documentType === 'RNC') return 9;
  if (documentType === 'Cédula') return 11;
  return null;
}

export default function SuppliersPage() {
  const { user } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<any>(null);
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPaymentTerms, setFilterPaymentTerms] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);

  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [supplierTypes, setSupplierTypes] = useState<any[]>([]);
  const [paymentTermsList, setPaymentTermsList] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    name: '',
    rnc: '',
    documentType: 'RNC',
    legalName: '',
    phone: '',
    email: '',
    address: '',
    category: '',
    creditLimit: '',
    paymentTerms: '30 días',
    contact: '',
    contactName: '',
    contactPhone: '',
    contactEmail: '',
    fax: '',
    website: '',
    status: 'Activo',
    apAccountId: '',
    expenseType606: '',
    taxRegime: '',
    defaultInvoiceType: '',
    supplierTypeId: '',
    paymentTermsId: '',
    defaultBankAccountId: '',
  });

  const defaultCategories = ['Materiales', 'Distribución', 'Servicios', 'Construcción', 'Tecnología'];
  const [categoryOptions, setCategoryOptions] = useState<string[]>(defaultCategories);

  const documentTypes = ['RNC', 'Cédula', 'Pasaporte', 'Otro'];
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
  const taxRegimes = ['Régimen Normal', 'RST', 'ONG', 'Fundación', 'Sin fines de lucro', 'Otro'];
  const invoiceTypes = ['CREDITO_FISCAL', 'INFORMAL', 'INTERNACIONAL'];

  const syncCategoryOptions = (userId: string, supplierRows: any[]) => {
    const options = new Set<string>();
    defaultCategories.forEach((c) => options.add(c));

    const stored = readStoredCategoryOptions(userId);
    stored.forEach((c) => options.add(String(c || '').trim()));

    (supplierRows || []).forEach((s: any) => {
      const cat = String(s?.category || '').trim();
      if (cat) options.add(cat);
    });

    const unique = Array.from(options)
      .map((v) => String(v || '').trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'es'));

    setCategoryOptions(unique);
    writeStoredCategoryOptions(userId, unique);
  };

  const defaultSupplierTypes = [
    { name: 'Sin especificar', affects_itbis: false, affects_isr: false, is_non_taxpayer: false },
    { name: 'Persona Jurídica', affects_itbis: true, affects_isr: false, is_non_taxpayer: false, itbis_withholding_rate: 0 },
    { name: 'Persona Física', affects_itbis: true, affects_isr: true, is_non_taxpayer: false, isr_withholding_rate: 10, itbis_withholding_rate: 30 },
    { name: 'Prestador de Servicios', affects_itbis: true, affects_isr: true, is_non_taxpayer: false, isr_withholding_rate: 10, itbis_withholding_rate: 100 },
    { name: 'Proveedor informal', affects_itbis: false, affects_isr: false, is_non_taxpayer: true },
  ];

  const normalizeSupplierTypeName = (value: any) => String(value || '').trim().toLowerCase();
  const supplierTypesSeedStateRef = useRef<{ userId: string; done: boolean; running: boolean } | null>(null);

  const dedupeSupplierTypes = (rows: any[]) => {
    const seen = new Set<string>();
    const out: any[] = [];
    (rows || []).forEach((t: any) => {
      const key = normalizeSupplierTypeName(t?.name);
      if (!key) return;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(t);
    });
    out.sort((a: any, b: any) => String(a?.name || '').localeCompare(String(b?.name || ''), 'es'));
    return out;
  };

  const getSupplierTypeKey = (typeRow: any | null) => {
    const name = normalizeSupplierTypeName(typeRow?.name);
    if (name === 'sin especificar') return 'unspecified';
    if (name === 'persona física' || name === 'persona fisica') return 'persona_fisica';
    if (name === 'persona jurídica' || name === 'persona juridica') return 'persona_juridica';
    if (name === 'prestador de servicios') return 'prestador_servicios';
    if (name === 'proveedor informal') return 'proveedor_informal';
    return null;
  };

  // ... (rest of the code remains the same)

  const loadSuppliers = async () => {
    if (!user?.id) {
      setSuppliers([]);
      return;
    }
    try {
      const rows = await suppliersService.getAll(user.id);

      const categoryMap = readStoredCategoryMap(user.id);
      const mapped = (rows || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        rnc: formatTaxId(s.document_type || 'RNC', String(s.tax_id || '')),
        phone: s.phone || '',
        email: s.email || '',
        address: s.address || '',
        // Campos solo de UI (no existen como columnas reales):
        category: categoryMap[String(s.id)] || '',
        creditLimit: typeof s.credit_limit === 'number'
          ? s.credit_limit
          : (typeof s.current_balance === 'number' ? s.current_balance : 0),
        paymentTerms: s.payment_terms || 'Sin especificar',
        contact: '',
        contactName: s.contact_name || '',
        contactPhone: s.contact_phone || '',
        contactEmail: s.contact_email || '',
        fax: s.fax || '',
        website: s.website || '',
        status: s.is_active === false ? 'Inactivo' : 'Activo',
        balance: typeof s.current_balance === 'number' ? s.current_balance : 0,
        apAccountId: s.ap_account_id || '',
        supplierTypeId: s.supplier_type_id || '',
        paymentTermsId: s.payment_terms_id || '',
        defaultBankAccountId: s.default_bank_account_id || '',
        document_type: s.document_type || 'RNC',
        legal_name: s.legal_name || s.name,
        expense_type_606: normalizeExpenseType606(s.expense_type_606) || '',
        tax_regime: s.tax_regime,
        default_invoice_type: s.default_invoice_type,
      }));
      setSuppliers(mapped);
      syncCategoryOptions(user.id, mapped);

      // Cargar catálogo de cuentas para seleccionar cuentas por pagar específicas
      const accs = await chartAccountsService.getAll(user.id);
      setAccounts(accs || []);

      // Cargar tipos de suplidor
      if (!supplierTypesSeedStateRef.current || supplierTypesSeedStateRef.current.userId !== user.id) {
        supplierTypesSeedStateRef.current = { userId: user.id, done: false, running: false };
      }

      if (!supplierTypesSeedStateRef.current.running && !supplierTypesSeedStateRef.current.done) {
        supplierTypesSeedStateRef.current.running = true;
        try {
          const types = await supplierTypesService.getAll(user.id);
          const existingNames = new Set((types || []).map((t: any) => normalizeSupplierTypeName(t?.name)));
          for (const row of defaultSupplierTypes) {
            const key = normalizeSupplierTypeName((row as any).name);
            if (!existingNames.has(key)) {
              await supplierTypesService.create(user.id, row as any);
              existingNames.add(key);
            }
          }
          supplierTypesSeedStateRef.current.done = true;
        } finally {
          supplierTypesSeedStateRef.current.running = false;
        }
      }

      const typesAfterSeed = await supplierTypesService.getAll(user.id);
      setSupplierTypes(dedupeSupplierTypes(typesAfterSeed || []));

      // Cargar términos de pago reales
      const terms = await paymentTermsService.getAll(user.id);
      setPaymentTermsList(terms || []);

      // Cargar cuentas bancarias para cuenta por defecto del proveedor
      const banks = await bankAccountsService.getAll(user.id);
      setBankAccounts(banks || []);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error loading suppliers from DB, keeping local list empty', error);
      setSuppliers([]);
    }
  };

  const payableAccounts = accounts.filter((acc) => {
    if (!acc.allowPosting) return false;
    if (acc.type !== 'liability') return false;
    const name = String(acc.name || '').toLowerCase();
    return name.includes('cuentas por pagar');
  });

  const filteredSuppliers = suppliers.filter((supplier) => {
    const matchesCategory = filterCategory === 'all' || supplier.category === filterCategory;
    const matchesStatus = filterStatus === 'all' || supplier.status === filterStatus;
    const matchesPaymentTerms = filterPaymentTerms === 'all' || supplier.paymentTerms === filterPaymentTerms;
    const matchesSearch =
      searchTerm === '' ||
      supplier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supplier.rnc.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supplier.email.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesCategory && matchesStatus && matchesPaymentTerms && matchesSearch;
  });

  const resolveStatusLabel = (status: any) => {
    if (status === 'Activo' || status === 'Active') return 'Active';
    if (status === 'Inactivo' || status === 'Inactive') return 'Inactive';
    return String(status || 'Active');
  };

  const statusCircleClasses = (status: any) => {
    const normalized = resolveStatusLabel(status).toLowerCase();
    if (normalized === 'inactive') return 'bg-red-100 text-red-700';
    return 'bg-green-100 text-green-700';
  };

  const resetForm = () => {
    setFormData({
      name: '',
      rnc: '',
      documentType: 'RNC',
      legalName: '',
      phone: '',
      email: '',
      address: '',
      category: '',
      creditLimit: '',
      paymentTerms: '30 días',
      contact: '',
      contactName: '',
      contactPhone: '',
      contactEmail: '',
      fax: '',
      website: '',
      status: 'Activo',
      apAccountId: '',
      expenseType606: '',
      taxRegime: '',
      defaultInvoiceType: '',
      supplierTypeId: '',
      paymentTermsId: '',
      defaultBankAccountId: '',
    });
    setEditingSupplier(null);
    setShowModal(false);
  };

  const handleViewDetails = (supplier: any) => {
    setSelectedSupplier(supplier);
    setShowDetailsModal(true);
  };

  const handleEdit = (supplier: any) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name || '',
      rnc: supplier.rnc || '',
      documentType: supplier.document_type || 'RNC',
      legalName: supplier.legal_name || supplier.name || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      address: supplier.address || '',
      category: supplier.category || '',
      creditLimit: typeof supplier.creditLimit === 'number' ? String(supplier.creditLimit) : '',
      paymentTerms: supplier.paymentTerms || '30 días',
      contact: supplier.contact || '',
      contactName: supplier.contactName || '',
      contactPhone: supplier.contactPhone || '',
      contactEmail: supplier.contactEmail || '',
      fax: supplier.fax || '',
      website: supplier.website || '',
      status: supplier.status || 'Activo',
      apAccountId: supplier.apAccountId || '',
      expenseType606: normalizeExpenseType606(supplier.expense_type_606) || supplier.expenseType606 || '',
      taxRegime: supplier.tax_regime || supplier.taxRegime || '',
      defaultInvoiceType: supplier.default_invoice_type || supplier.defaultInvoiceType || '',
      supplierTypeId: supplier.supplierTypeId || supplier.supplier_type_id || '',
      paymentTermsId: supplier.paymentTermsId || supplier.payment_terms_id || '',
      defaultBankAccountId: supplier.defaultBankAccountId || supplier.default_bank_account_id || '',
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!user?.id) return;
    const ok = confirm('Are you sure you want to delete this supplier?');
    if (!ok) return;
    try {
      await suppliersService.delete(id);
      await loadSuppliers();
    } catch (error) {
      alert('Error deleting supplier');
      console.error('Error deleting supplier:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;

    const payload: any = {
      name: formData.name,
      legal_name: formData.name,
      document_type: null,
      tax_id: null,
      email: formData.email || null,
      phone: formData.phone || null,
      address: formData.address || null,
      city: '',
      country: '',
      contact_name: formData.contactName || null,
      contact_phone: formData.contactPhone || null,
      contact_email: formData.contactEmail || null,
      fax: formData.fax || null,
      website: formData.website || null,
      current_balance: 0,
      credit_limit: 0,
      is_active: formData.status === 'Activo',
      expense_type_606: null,
      tax_regime: null,
      default_invoice_type: null,
      payment_terms: null,
      payment_terms_id: null,
      supplier_type_id: null,
      default_bank_account_id: null,
      ap_account_id: null,
    };

    try {
      if (editingSupplier?.id) {
        await suppliersService.update(editingSupplier.id, payload);
      } else {
        const created = await suppliersService.create(user.id, payload);
        if (created?.id) {
          setStoredSupplierCategory(user.id, String(created.id), formData.category);
        }
      }

      upsertStoredCategory(user.id, formData.category);
      await loadSuppliers();
      resetForm();
    } catch (error) {
      alert('Error saving supplier');
      console.error('Error saving supplier:', error);
    }
  };

  const exportToPDF = async () => {
    alert('PDF export is not available right now.');
  };

  const exportToExcel = async () => {
    let companyName = '';
    try {
      const info = await settingsService.getCompanyInfo();
      const resolvedName = (info as any)?.name || (info as any)?.company_name;
      if (resolvedName) companyName = String(resolvedName);
    } catch (error) {
      console.error('Error obteniendo información de la empresa para Excel de suplidores:', error);
    }

    const todayIso = new Date().toISOString().split('T')[0];
    const todayLocal = new Date().toLocaleDateString();

    const headers = [
      { key: 'name', title: 'Supplier' },
      { key: 'email', title: 'Email' },
      { key: 'phone', title: 'Phone' },
      { key: 'category', title: 'Category' },
      { key: 'status', title: 'Status' },
    ];

    const rows = filteredSuppliers.map((s) => ({
      name: s.name,
      email: s.email,
      phone: s.phone,
      category: s.category,
      status: resolveStatusLabel(s.status),
    }));

    if (!rows.length) {
      alert('There are no suppliers to export with the current filters.');
      return;
    }

    exportToExcelWithHeaders(
      rows,
      headers,
      `suppliers-${todayIso}`,
      'Suppliers',
      [30, 28, 18, 18, 14],
      {
        title: `Supplier Report - ${todayLocal}`,
        companyName,
      },
    );
  };

  useEffect(() => {
    loadSuppliers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return (
    <DashboardLayout>
      <div className="space-y-6 bg-gradient-to-br from-[#f6f1e3] to-[#ebe5d5] min-h-screen p-6 rounded-xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[#2f3c24] drop-shadow-sm">Supplier Management</h1>
            <p className="text-[#5c6b42]">Supplier and vendor database</p>
          </div>
          <div className="flex space-x-3">
            <button 
              onClick={exportToPDF}
              className="bg-[#5e6b3c] text-white px-4 py-2 rounded-lg hover:bg-[#4c582e] transition-colors whitespace-nowrap shadow"
            >
              <i className="ri-file-pdf-line mr-2"></i>
              Export PDF
            </button>
            <button 
              onClick={exportToExcel}
              className="bg-[#7a8b4a] text-white px-4 py-2 rounded-lg hover:bg-[#67753b] transition-colors whitespace-nowrap shadow"
            >
              <i className="ri-file-excel-line mr-2"></i>
              Export Excel
            </button>
            <button 
              onClick={() => setShowModal(true)}
              className="bg-gradient-to-br from-[#008000] to-[#006600] text-white px-6 py-3 rounded-xl shadow-[0_4px_15px_rgb(0,128,0,0.3)] hover:from-[#006600] hover:to-[#005500] hover:shadow-[0_6px_20px_rgb(0,128,0,0.4)] hover:-translate-y-0.5 transition-all duration-300 whitespace-nowrap font-semibold"
            >
              <i className="ri-add-line mr-2"></i>
              New Supplier
            </button>
          </div>

        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-gradient-to-br from-white to-[#faf9f5] rounded-2xl border border-[#e8e0d0] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:shadow-[0_12px_40px_rgb(0,128,0,0.15)] hover:-translate-y-1 transition-all duration-300 cursor-pointer">
            <div className="flex items-center">
              <div className="w-14 h-14 bg-gradient-to-br from-[#dfe9c1] to-[#c8d9a5] rounded-xl flex items-center justify-center mr-4 shadow-lg">
                <i className="ri-truck-line text-2xl text-[#3f4d2c]"></i>
              </div>
              <div>
                <p className="text-sm font-medium text-[#4c5b36]">Total Suppliers</p>
                <p className="text-3xl font-bold text-[#2f3c24] drop-shadow-sm">{suppliers.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-gradient-to-br from-white to-[#faf9f5] rounded-2xl border border-[#e8e0d0] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:shadow-[0_12px_40px_rgb(0,128,0,0.15)] hover:-translate-y-1 transition-all duration-300 cursor-pointer">
            <div className="flex items-center">
              <div className="w-14 h-14 bg-gradient-to-br from-[#e4eed0] to-[#c8dbb0] rounded-xl flex items-center justify-center mr-4 shadow-lg">
                <i className="ri-check-line text-2xl text-[#4f5e35]"></i>
              </div>
              <div>
                <p className="text-sm font-medium text-[#4c5b36]">Active</p>
                <p className="text-3xl font-bold text-[#2f3c24] drop-shadow-sm">
                  {suppliers.filter((s) => s.status === 'Activo' || s.status === 'Active').length}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-gradient-to-br from-white to-[#faf9f5] rounded-2xl border border-[#e8e0d0] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:shadow-[0_12px_40px_rgb(0,128,0,0.15)] hover:-translate-y-1 transition-all duration-300 cursor-pointer">
            <div className="flex items-center">
              <div className="w-14 h-14 bg-gradient-to-br from-[#f3e2c0] to-[#e5d0a5] rounded-xl flex items-center justify-center mr-4 shadow-lg">
                <i className="ri-money-dollar-circle-line text-2xl text-[#b3682f]"></i>
              </div>
              <div>
                <p className="text-sm font-medium text-[#4c5b36]">Total Balance</p>
                <p className="text-3xl font-bold text-[#2f3c24] drop-shadow-sm">
                   {suppliers.reduce((sum, s) => sum + s.balance, 0).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-gradient-to-br from-white to-[#faf9f5] rounded-2xl border border-[#e8e0d0] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:shadow-[0_12px_40px_rgb(0,128,0,0.15)] hover:-translate-y-1 transition-all duration-300 cursor-pointer">
            <div className="flex items-center">
              <div className="w-14 h-14 bg-gradient-to-br from-[#eadfee] to-[#d8c8e0] rounded-xl flex items-center justify-center mr-4 shadow-lg">
                <i className="ri-credit-card-line text-2xl text-[#6a4c5c]"></i>
              </div>
              <div>
                <p className="text-sm font-medium text-[#4c5b36]">Available Credit</p>
                <p className="text-3xl font-bold text-[#2f3c24] drop-shadow-sm">
                   {suppliers.reduce((sum, s) => sum + (s.creditLimit - s.balance), 0).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-gradient-to-br from-white to-[#faf9f5] rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-[#e8e0d0] p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#4c5b36] mb-2">
                Search <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input 
                  type="text"
                  placeholder="Search by name, Tax ID or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-[#c0b596] rounded-lg focus:ring-2 focus:ring-[#4c5b36] focus:border-[#4c5b36] bg-[#fefaf1]"
                />
                <i className="ri-search-line absolute left-3 top-1/2 transform -translate-y-1/2 text-[#b7a98a]"></i>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#4c5b36] mb-2">Category</label>
              <input
                type="text"
                list="supplier-category-options"
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="w-full px-3 py-2 border border-[#c0b596] rounded-lg focus:ring-2 focus:ring-[#4c5b36] focus:border-[#4c5b36] bg-[#fefaf1]"
              />
              <datalist id="supplier-category-options">
                {categoryOptions.map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#4c5b36] mb-2">Status</label>
              <select 
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-2 border border-[#c0b596] rounded-lg focus:ring-2 focus:ring-[#4c5b36] focus:border-[#4c5b36] bg-[#fefaf1]"
              >
                <option value="all">All Statuses</option>
                <option value="Activo">Active</option>
                <option value="Inactivo">Inactive</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#4c5b36] mb-2">Payment Terms</label>
              <select 
                value={filterPaymentTerms}
                onChange={(e) => setFilterPaymentTerms(e.target.value)}
                className="w-full px-3 py-2 border border-[#c0b596] rounded-lg focus:ring-2 focus:ring-[#4c5b36] focus:border-[#4c5b36] bg-[#fefaf1]"
              >
                <option value="all">All</option>
                <option value="Sin especificar">Unspecified</option>
                <option value="Contado">Cash</option>
                <option value="15 días">15 days</option>
                <option value="30 días">30 days</option>
                <option value="45 días">45 days</option>
                <option value="60 días">60 days</option>
              </select>
            </div>
            <div className="flex items-end">
              <button 
                onClick={() => {setSearchTerm(''); setFilterStatus('all'); setFilterCategory('all'); setFilterPaymentTerms('all');}}
                className="w-full bg-[#5a5c55] text-white py-2 px-4 rounded-lg hover:bg-[#43443f] transition-colors whitespace-nowrap shadow-sm"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>

        {/* Suppliers Table */}
        <div className="bg-white rounded-lg shadow-sm border border-[#d7ccb5]">
          <div className="p-6 border-b border-[#d7ccb5] bg-[#fefaf1] rounded-t-lg">
            <h3 className="text-lg font-semibold text-[#2f3c24]">Supplier List</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[#eadfca]">
              <thead className="bg-[#f5ebd6]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[#2f3c24] uppercase tracking-wider">Supplier</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[#2f3c24] uppercase tracking-wider">Category</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[#2f3c24] uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[#2f3c24] uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-[#f0e4cd]">
                {filteredSuppliers.map((supplier) => (
                  <tr key={supplier.id} className="hover:bg-[#f9f3e3] transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-[#2f3c24]">{supplier.name}</div>
                        <div className="text-sm text-[#5c6b42]">{supplier.email}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-[#d7e2b0] text-[#2f3c24]">
                        {supplier.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${statusCircleClasses(supplier.status)}`}>
                        {resolveStatusLabel(supplier.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button 
                          onClick={() => handleViewDetails(supplier)}
                          className="text-[#3f4d2c] hover:text-[#2f3a1f] whitespace-nowrap"
                        >
                          <i className="ri-eye-line"></i>
                        </button>
                        <button 
                          onClick={() => handleEdit(supplier)}
                          className="text-[#4f6131] hover:text-[#374422] whitespace-nowrap"
                        >
                          <i className="ri-edit-line"></i>
                        </button>
                        <button 
                          onClick={() => handleDelete(supplier.id)}
                          className="text-[#9c3d25] hover:text-[#6c1f12] whitespace-nowrap"
                        >
                          <i className="ri-delete-bin-line"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Details Modal */}
        {showDetailsModal && selectedSupplier && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-[#d7ccb5] bg-[#fefaf1] rounded-t-lg">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-[#2f3c24]">Supplier Details</h3>
                  <button 
                    onClick={() => setShowDetailsModal(false)}
                    className="text-[#8c7f62] hover:text-[#5c5139]"
                  >
                    <i className="ri-close-line text-xl"></i>
                  </button>
                </div>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-sm font-medium text-[#5c6b42] mb-1">Name</h4>
                    <p className="text-[#2f3c24]">{selectedSupplier.name}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-[#5c6b42] mb-1">Email</h4>
                    <p className="text-[#2f3c24]">{selectedSupplier.email}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-[#5c6b42] mb-1">Phone</h4>
                    <p className="text-[#2f3c24]">{selectedSupplier.phone}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-[#5c6b42] mb-1">Status</h4>
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${statusCircleClasses(selectedSupplier.status)}`}>
                      {resolveStatusLabel(selectedSupplier.status)}
                    </span>
                  </div>
                  <div className="md:col-span-2">
                    <h4 className="text-sm font-medium text-[#5c6b42] mb-1">Address</h4>
                    <p className="text-[#2f3c24]">{selectedSupplier.address}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-[#5c6b42] mb-1">Category</h4>
                    <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-[#d7e2b0] text-[#2f3c24]">
                      {selectedSupplier.category}
                    </span>
                  </div>
                </div>
                <div className="flex justify-end space-x-3 mt-6">
                  <button 
                    onClick={() => {
                      setShowDetailsModal(false);
                      handleEdit(selectedSupplier);
                    }}
                    className="px-4 py-2 bg-[#3f4d2c] text-white rounded-lg hover:bg-[#2f3a1f] whitespace-nowrap shadow-sm"
                  >
                    Edit
                  </button>
                  <button 
                    onClick={() => setShowDetailsModal(false)}
                    className="px-4 py-2 border border-[#d7ccb5] rounded-lg text-[#4c5b36] hover:bg-[#fefaf1] whitespace-nowrap"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-[#d7ccb5] bg-[#fefaf1] rounded-t-lg">
                <h3 className="text-lg font-semibold text-[#2f3c24]">
                  {editingSupplier ? 'Edit Supplier' : 'New Supplier'}
                </h3>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Business Name *</label>
                    <input 
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                    <input 
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Phone</label>
                    <input 
                      type="text"
                      value={formData.phone}
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Contact Person Name</label>
                    <input
                      type="text"
                      value={formData.contactName}
                      onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Contact Person Phone</label>
                    <input
                      type="text"
                      value={formData.contactPhone}
                      onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Contact Person Email</label>
                    <input
                      type="email"
                      value={formData.contactEmail}
                      onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Fax</label>
                    <input
                      type="text"
                      value={formData.fax}
                      onChange={(e) => setFormData({ ...formData, fax: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Website</label>
                    <input
                      type="text"
                      value={formData.website}
                      onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
                    <textarea 
                      value={formData.address}
                      onChange={(e) => setFormData({...formData, address: e.target.value})}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                    <input
                      type="text"
                      list="supplier-category-options"
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <datalist id="supplier-category-options">
                      {categoryOptions.map((category) => (
                        <option key={category} value={category} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                    <select 
                      value={formData.status}
                      onChange={(e) => setFormData({...formData, status: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="Activo">Active</option>
                      <option value="Inactivo">Inactive</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <button 
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 whitespace-nowrap"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 whitespace-nowrap"
                  >
                    {editingSupplier ? 'Update' : 'Create'} Supplier
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}