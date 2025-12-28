import { useEffect, useState } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import {
  suppliersService,
  chartAccountsService,
  supplierTypesService,
  paymentTermsService,
  bankAccountsService,
  settingsService,
} from '../../../services/database';
import { exportToExcelWithHeaders } from '../../../utils/exportImportUtils';

declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

function onlyDigits(value: string) {
  return value.replace(/\D+/g, '');
}

function formatRnc(digits: string) {
  const d = digits.slice(0, 9);
  const a = d.slice(0, 1);
  const b = d.slice(1, 3);
  const c = d.slice(3, 8);
  const e = d.slice(8, 9);
  if (!d) return '';
  if (d.length <= 1) return a;
  if (d.length <= 3) return `${a}-${b}`;
  if (d.length <= 8) return `${a}-${b}-${c}`;
  return `${a}-${b}-${c}-${e}`;
}

function formatCedula(digits: string) {
  const d = digits.slice(0, 11);
  const a = d.slice(0, 3);
  const b = d.slice(3, 10);
  const c = d.slice(10, 11);
  if (!d) return '';
  if (d.length <= 3) return a;
  if (d.length <= 10) return `${a}-${b}`;
  return `${a}-${b}-${c}`;
}

function formatTaxId(documentType: string, inputValue: string) {
  const digits = onlyDigits(inputValue);
  if (documentType === 'RNC') return formatRnc(digits);
  if (documentType === 'Cédula') return formatCedula(digits);
  return inputValue;
}

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

  const getSupplierCategoriesKey = (uid: string) => `supplier_categories_${uid}`;
  const getSupplierCategoryMapKey = (uid: string) => `supplier_category_map_${uid}`;

  const readStoredCategories = (uid: string): string[] => {
    try {
      const raw = localStorage.getItem(getSupplierCategoriesKey(uid));
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((v) => String(v || '').trim())
        .filter((v) => v.length > 0);
    } catch {
      return [];
    }
  };

  const readStoredCategoryMap = (uid: string): Record<string, string> => {
    try {
      const raw = localStorage.getItem(getSupplierCategoryMapKey(uid));
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return {};
      const out: Record<string, string> = {};
      Object.entries(parsed as any).forEach(([k, v]) => {
        const key = String(k || '').trim();
        const val = String(v || '').trim();
        if (key && val) out[key] = val;
      });
      return out;
    } catch {
      return {};
    }
  };

  const upsertStoredCategory = (uid: string, category: string) => {
    const c = String(category || '').trim();
    if (!c) return;

    const existing = readStoredCategories(uid);
    const normalized = new Set(existing.map((x) => x.toLowerCase()));
    if (!normalized.has(c.toLowerCase())) {
      const next = [...existing, c];
      localStorage.setItem(getSupplierCategoriesKey(uid), JSON.stringify(next));
    }
  };

  const setStoredSupplierCategory = (uid: string, supplierId: string, category: string) => {
    const id = String(supplierId || '').trim();
    const c = String(category || '').trim();
    if (!id || !c) return;

    const map = readStoredCategoryMap(uid);
    map[id] = c;
    localStorage.setItem(getSupplierCategoryMapKey(uid), JSON.stringify(map));
    upsertStoredCategory(uid, c);
  };

  const syncCategoryOptions = (uid: string | null, supplierList: any[]) => {
    const fromSuppliers = (supplierList || [])
      .map((s: any) => String(s?.category || '').trim())
      .filter((v) => v.length > 0);
    const stored = uid ? readStoredCategories(uid) : [];

    const all = [...defaultCategories, ...stored, ...fromSuppliers];
    const unique: string[] = [];
    const seen = new Set<string>();
    for (const v of all) {
      const key = v.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(v);
      }
    }
    setCategoryOptions(unique);
  };

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

  const defaultSupplierTypes = [
    { name: 'Sin especificar', affects_itbis: false, affects_isr: false, is_non_taxpayer: false },
    { name: 'Persona Jurídica', affects_itbis: true, affects_isr: false, is_non_taxpayer: false, itbis_withholding_rate: 0 },
    { name: 'Persona Física', affects_itbis: true, affects_isr: true, is_non_taxpayer: false, isr_withholding_rate: 10, itbis_withholding_rate: 30 },
    { name: 'Prestador de Servicios', affects_itbis: true, affects_isr: true, is_non_taxpayer: false, itbis_withholding_rate: 30 },
    { name: 'Proveedor informal', affects_itbis: false, affects_isr: true, is_non_taxpayer: true, itbis_withholding_rate: 100 },
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
        paymentTerms: '30 días',
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
      let types = await supplierTypesService.getAll(user.id);
      const existingNames = new Set((types || []).map((t: any) => normalizeSupplierTypeName(t?.name)));
      for (const row of defaultSupplierTypes) {
        const key = normalizeSupplierTypeName((row as any).name);
        if (!existingNames.has(key)) {
          await supplierTypesService.create(user.id, row as any);
          existingNames.add(key);
        }
      }
      types = await supplierTypesService.getAll(user.id);
      setSupplierTypes(types || []);

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

  // Cuentas por pagar permitidas para proveedores: pasivo posteable con 'cuentas por pagar' en el nombre
  const payableAccounts = accounts.filter((acc) => {
    if (!acc.allowPosting) return false;
    if (acc.type !== 'liability') return false;
    const name = String(acc.name || '').toLowerCase();
    return name.includes('cuentas por pagar');
  });

  useEffect(() => {
    loadSuppliers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const filteredSuppliers = suppliers.filter((supplier) => {
    const matchesCategory = filterCategory === 'all' || supplier.category === filterCategory;
    const matchesStatus = filterStatus === 'all' || supplier.status === filterStatus;
    const matchesPaymentTerms = filterPaymentTerms === 'all' || supplier.paymentTerms === filterPaymentTerms;
    const matchesSearch = searchTerm === '' ||
      supplier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supplier.rnc.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supplier.email.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesStatus && matchesPaymentTerms && matchesSearch;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) {
      alert('Debes iniciar sesión para gestionar proveedores');
      return;
    }

    const selectedType =
      supplierTypes.find((t: any) => String(t.id) === String(formData.supplierTypeId)) || null;
    const supplierTypeKey = getSupplierTypeKey(selectedType);

    const taxIdDigits = onlyDigits(formData.rnc);
    if (supplierTypeKey === 'persona_juridica') {
      if (taxIdDigits.length !== 9) {
        alert('Para Persona Jurídica el RNC debe tener 9 dígitos');
        return;
      }
    } else if (supplierTypeKey === 'persona_fisica') {
      if (taxIdDigits.length !== 11) {
        alert('Para Persona Física la Cédula debe tener 11 dígitos');
        return;
      }
    } else if (supplierTypeKey === 'prestador_servicios') {
      if (!(taxIdDigits.length === 9 || taxIdDigits.length === 11)) {
        alert('Para Prestador de Servicios el RNC debe tener 9 dígitos o la Cédula 11 dígitos');
        return;
      }
    } else if (supplierTypeKey === 'proveedor_informal') {
      if (taxIdDigits.length > 0) {
        alert('Para Proveedor informal no debe registrarse RNC/Cédula');
        return;
      }
    } else if (formData.documentType === 'RNC' && taxIdDigits.length !== 9) {
      alert('El RNC debe tener 9 dígitos');
      return;
    } else if (formData.documentType === 'Cédula' && taxIdDigits.length !== 11) {
      alert('La Cédula debe tener 11 dígitos');
      return;
    }

    const resolvedDocumentType =
      supplierTypeKey === 'persona_juridica'
        ? 'RNC'
        : supplierTypeKey === 'persona_fisica'
          ? 'Cédula'
          : supplierTypeKey === 'proveedor_informal'
            ? 'Otro'
            : formData.documentType;

    const payload: any = {
      // Columnas reales de la tabla suppliers
      name: formData.name,
      legal_name: formData.legalName || formData.name,
      document_type: resolvedDocumentType,
      tax_id: taxIdDigits || null,
      email: formData.email,
      phone: formData.phone,
      address: formData.address,
      // city y country opcionales, por ahora vacíos
      city: '',
      country: '',
      contact_name: formData.contactName || null,
      contact_phone: formData.contactPhone || null,
      contact_email: formData.contactEmail || null,
      fax: formData.fax || null,
      website: formData.website || null,
      current_balance: typeof formData.creditLimit === 'string' && formData.creditLimit !== ''
        ? parseFloat(formData.creditLimit)
        : 0,
      credit_limit: typeof formData.creditLimit === 'string' && formData.creditLimit !== ''
        ? parseFloat(formData.creditLimit)
        : 0,
      is_active: formData.status === 'Activo',
      expense_type_606: normalizeExpenseType606(formData.expenseType606) || null,
      tax_regime: formData.taxRegime || null,
      default_invoice_type: formData.defaultInvoiceType || null,
    };

    if (formData.apAccountId) {
      payload.ap_account_id = formData.apAccountId;
    } else {
      payload.ap_account_id = null;
    }

    try {
      if (editingSupplier?.id) {
        await suppliersService.update(editingSupplier.id, payload);
        setStoredSupplierCategory(user.id, String(editingSupplier.id), formData.category);
      } else {
        const created = await suppliersService.create(user.id, payload);
        if (created?.id) {
          setStoredSupplierCategory(user.id, String(created.id), formData.category);
        }
      }

      // Guardar siempre la categoría en el historial de sugerencias (aunque no haya id retornado)
      upsertStoredCategory(user.id, formData.category);

      await loadSuppliers();
      resetForm();
      alert(editingSupplier ? 'Proveedor actualizado exitosamente' : 'Proveedor creado exitosamente');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error saving supplier', error);
      alert('Error al guardar el proveedor');
    }
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

  const handleEdit = (supplier: any) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name,
      rnc: supplier.rnc,
      documentType: supplier.document_type || 'RNC',
      legalName: supplier.legal_name || supplier.name,
      phone: supplier.phone,
      email: supplier.email,
      address: supplier.address,
      category: supplier.category || '',
      creditLimit: supplier.creditLimit.toString(),
      paymentTerms: supplier.paymentTerms,
      contact: supplier.contact,
      contactName: supplier.contactName || '',
      contactPhone: supplier.contactPhone || '',
      contactEmail: supplier.contactEmail || '',
      fax: supplier.fax || '',
      website: supplier.website || '',
      status: supplier.status || 'Activo',
      apAccountId: supplier.apAccountId || '',
      expenseType606: normalizeExpenseType606(supplier.expense_type_606) || '',
      taxRegime: supplier.tax_regime || '',
      defaultInvoiceType: supplier.default_invoice_type || '',
      supplierTypeId: supplier.supplierTypeId || '',
      paymentTermsId: supplier.paymentTermsId || '',
      defaultBankAccountId: supplier.defaultBankAccountId || '',
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string | number) => {
    if (!user?.id) {
      alert('Debes iniciar sesión para eliminar proveedores');
      return;
    }
    if (!confirm('¿Estás seguro de eliminar este proveedor?')) return;

    try {
      await suppliersService.delete(String(id));
      await loadSuppliers();
      alert('Proveedor eliminado exitosamente');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error deleting supplier', error);
      alert('No se pudo eliminar el proveedor');
    }
  };

  const exportToPDF = async () => {
    const { default: jsPDF } = await import('jspdf');
    await import('jspdf-autotable');
    const doc = new jsPDF();

    // Encabezado: nombre de la empresa
    let companyName = 'ContaBi';
    try {
      const info = await settingsService.getCompanyInfo();
      if (info && (info as any)) {
        const resolvedName =
          (info as any).name ||
          (info as any).company_name ||
          (info as any).legal_name;
        if (resolvedName) {
          companyName = String(resolvedName);
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error obteniendo información de la empresa para PDF de proveedores:', error);
    }

    const pageWidth = doc.internal.pageSize.getWidth();

    // Nombre de empresa centrado
    doc.setFontSize(14);
    doc.text(companyName, pageWidth / 2, 15, { align: 'center' as any });

    // Título
    doc.setFontSize(18);
    doc.text('Lista de Proveedores', pageWidth / 2, 25, { align: 'center' as any });
    
    // Información del reporte
    doc.setFontSize(12);
    doc.text(`Fecha de Generación: ${new Date().toLocaleDateString('es-DO')}`, 20, 40);
    doc.text(`Total de Proveedores: ${filteredSuppliers.length}`, 20, 48);

    // Preparar datos para la tabla
    const tableData = filteredSuppliers.map((supplier) => [
      supplier.name,
      supplier.rnc,
      supplier.phone,
      supplier.category,
      `RD$ ${supplier.creditLimit.toLocaleString()}`,
      `RD$ ${supplier.balance.toLocaleString()}`,
      supplier.status
    ]);

    // Crear la tabla
    doc.autoTable({
      head: [['Nombre', 'RNC', 'Teléfono', 'Categoría', 'Límite Crédito', 'Balance', 'Estado']],
      body: tableData,
      startY: 70,
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
      styles: { fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 40 },
        1: { cellWidth: 25 },
        2: { cellWidth: 25 },
        3: { cellWidth: 25 },
        4: { cellWidth: 25, halign: 'right' },
        5: { cellWidth: 25, halign: 'right' },
        6: { cellWidth: 20, halign: 'center' },
      },
    });

    // Estadísticas adicionales
    const totalCreditLimit = filteredSuppliers.reduce((sum, s) => sum + s.creditLimit, 0);
    const totalBalance = filteredSuppliers.reduce((sum, s) => sum + s.balance, 0);
    const activeSuppliers = filteredSuppliers.filter((s) => s.status === 'Activo').length;

    doc.autoTable({
      body: [
        ['Total Límite de Crédito:', `RD$ ${totalCreditLimit.toLocaleString()}`],
        ['Total Balance Actual:', `RD$ ${totalBalance.toLocaleString()}`],
        ['Proveedores Activos:', `${activeSuppliers} de ${filteredSuppliers.length}`]
      ],
      startY: ((doc as any).lastAutoTable?.finalY ?? 70) + 20,
      theme: 'plain',
      styles: { fontStyle: 'bold' }
    });

    // Pie de página
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(10);
      doc.text(`Página ${i} de ${pageCount}`, doc.internal.pageSize.width - 50, doc.internal.pageSize.height - 10);
      doc.text('Sistema Contable - Gestión de Proveedores', 20, doc.internal.pageSize.height - 10);
    }

    doc.save(`proveedores-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const exportToExcel = async () => {
    let companyName = 'ContaBi';
    try {
      const info = await settingsService.getCompanyInfo();
      if (info && (info as any)) {
        const resolvedName =
          (info as any).name ||
          (info as any).company_name ||
          (info as any).legal_name;
        if (resolvedName) {
          companyName = String(resolvedName);
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error obteniendo información de la empresa para Excel de proveedores:', error);
    }

    const rows = filteredSuppliers.map((supplier) => ({
      name: supplier.name,
      rnc: supplier.rnc,
      phone: supplier.phone,
      email: supplier.email,
      address: supplier.address,
      category: supplier.category,
      creditLimit: supplier.creditLimit,
      balance: supplier.balance,
      status: supplier.status,
      paymentTerms: supplier.paymentTerms,
      contact: supplier.contact,
    }));

    const headers = [
      { key: 'name', title: 'Nombre' },
      { key: 'rnc', title: 'RNC' },
      { key: 'phone', title: 'Teléfono' },
      { key: 'email', title: 'Email' },
      { key: 'address', title: 'Dirección' },
      { key: 'category', title: 'Categoría' },
      { key: 'creditLimit', title: 'Límite Crédito' },
      { key: 'balance', title: 'Balance Actual' },
      { key: 'status', title: 'Estado' },
      { key: 'paymentTerms', title: 'Términos de Pago' },
      { key: 'contact', title: 'Contacto' },
    ];

    const today = new Date().toISOString().split('T')[0];
    const fileBase = `proveedores_${today}`;

    exportToExcelWithHeaders(
      rows,
      headers,
      fileBase,
      'Proveedores',
      [24, 14, 16, 26, 32, 18, 18, 18, 14, 18, 20],
      {
        title: 'Lista de Proveedores',
        companyName,
      },
    );
  };

  const handleViewDetails = (supplier: any) => {
    setSelectedSupplier(supplier);
    setShowDetailsModal(true);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Gestión de Proveedores</h1>
            <p className="text-gray-600">Base de datos de proveedores y vendedores</p>
          </div>
          <div className="flex space-x-3">
            <button 
              onClick={exportToPDF}
              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap"
            >
              <i className="ri-file-pdf-line mr-2"></i>
              Exportar PDF
            </button>
            <button 
              onClick={exportToExcel}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap"
            >
              <i className="ri-file-excel-line mr-2"></i>
              Exportar Excel
            </button>
            <button 
              onClick={() => setShowModal(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              <i className="ri-add-line mr-2"></i>
              Nuevo Proveedor
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mr-4">
                <i className="ri-truck-line text-xl text-blue-600"></i>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Total Proveedores</p>
                <p className="text-2xl font-bold text-gray-900">{suppliers.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mr-4">
                <i className="ri-check-line text-xl text-green-600"></i>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Activos</p>
                <p className="text-2xl font-bold text-gray-900">{suppliers.filter(s => s.status === 'Activo').length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mr-4">
                <i className="ri-money-dollar-circle-line text-xl text-orange-600"></i>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Balance Total</p>
                <p className="text-2xl font-bold text-gray-900">RD$ {suppliers.reduce((sum, s) => sum + s.balance, 0).toLocaleString()}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mr-4">
                <i className="ri-credit-card-line text-xl text-purple-600"></i>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Crédito Disponible</p>
                <p className="text-2xl font-bold text-gray-900">RD$ {suppliers.reduce((sum, s) => sum + (s.creditLimit - s.balance), 0).toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Buscar <span className="text-red-500">*</span></label>
              <div className="relative">
                <input 
                  type="text"
                  placeholder="Buscar por nombre, RNC o email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <i className="ri-search-line absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Categoría</label>
              <input
                type="text"
                list="supplier-category-options"
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <datalist id="supplier-category-options">
                {categoryOptions.map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Estado</label>
              <select 
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">Todos los Estados</option>
                <option value="Activo">Activo</option>
                <option value="Inactivo">Inactivo</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Términos de Pago</label>
              <select 
                value={filterPaymentTerms}
                onChange={(e) => setFilterPaymentTerms(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">Todos</option>
                <option value="Sin especificar">Sin especificar</option>
                <option value="Contado">Contado</option>
                <option value="15 días">15 días</option>
                <option value="30 días">30 días</option>
                <option value="45 días">45 días</option>
                <option value="60 días">60 días</option>
              </select>
            </div>
            <div className="flex items-end">
              <button 
                onClick={() => {setSearchTerm(''); setFilterStatus('all'); setFilterCategory('all'); setFilterPaymentTerms('all');}}
                className="w-full bg-gray-600 text-white py-2 px-4 rounded-lg hover:bg-gray-700 transition-colors whitespace-nowrap"
              >
                Limpiar Filtros
              </button>
            </div>
          </div>
        </div>

        {/* Suppliers Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Lista de Proveedores</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Proveedor</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">RNC</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Categoría</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Balance</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Límite Crédito</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredSuppliers.map((supplier) => (
                  <tr key={supplier.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{supplier.name}</div>
                        <div className="text-sm text-gray-500">{supplier.email}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{supplier.rnc}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                        {supplier.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                      RD$ {supplier.balance.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                      RD$ {supplier.creditLimit.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        supplier.status === 'Activo' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {supplier.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button 
                          onClick={() => handleViewDetails(supplier)}
                          className="text-blue-600 hover:text-blue-900 whitespace-nowrap"
                        >
                          <i className="ri-eye-line"></i>
                        </button>
                        <button 
                          onClick={() => handleEdit(supplier)}
                          className="text-indigo-600 hover:text-indigo-900 whitespace-nowrap"
                        >
                          <i className="ri-edit-line"></i>
                        </button>
                        <button 
                          onClick={() => handleDelete(supplier.id)}
                          className="text-red-600 hover:text-red-900 whitespace-nowrap"
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
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Detalles del Proveedor</h3>
                  <button 
                    onClick={() => setShowDetailsModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <i className="ri-close-line text-xl"></i>
                  </button>
                </div>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">Nombre</h4>
                    <p className="text-gray-900">{selectedSupplier.name}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">RNC</h4>
                    <p className="text-gray-900">{selectedSupplier.rnc}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">Email</h4>
                    <p className="text-gray-900">{selectedSupplier.email}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">Teléfono</h4>
                    <p className="text-gray-900">{selectedSupplier.phone}</p>
                  </div>
                  <div className="md:col-span-2">
                    <h4 className="text-sm font-medium text-gray-500 mb-1">Dirección</h4>
                    <p className="text-gray-900">{selectedSupplier.address}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">Categoría</h4>
                    <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                      {selectedSupplier.category}
                    </span>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">Estado</h4>
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                      selectedSupplier.status === 'Activo' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {selectedSupplier.status}
                    </span>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">Límite de Crédito</h4>
                    <p className="text-gray-900">RD$ {selectedSupplier.creditLimit.toLocaleString()}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">Balance Actual</h4>
                    <p className="text-gray-900">RD$ {selectedSupplier.balance.toLocaleString()}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">Términos de Pago</h4>
                    <p className="text-gray-900">{selectedSupplier.paymentTerms}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">Contacto</h4>
                    <p className="text-gray-900">{selectedSupplier.contact}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">Persona de Contacto</h4>
                    <p className="text-gray-900">{selectedSupplier.contactName || '-'}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">Teléfono Contacto</h4>
                    <p className="text-gray-900">{selectedSupplier.contactPhone || '-'}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">Email Contacto</h4>
                    <p className="text-gray-900">{selectedSupplier.contactEmail || '-'}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">Fax</h4>
                    <p className="text-gray-900">{selectedSupplier.fax || '-'}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">Website</h4>
                    <p className="text-gray-900">{selectedSupplier.website || '-'}</p>
                  </div>
                </div>
                <div className="flex justify-end space-x-3 mt-6">
                  <button 
                    onClick={() => {
                      setShowDetailsModal(false);
                      handleEdit(selectedSupplier);
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 whitespace-nowrap"
                  >
                    Editar
                  </button>
                  <button 
                    onClick={() => setShowDetailsModal(false)}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 whitespace-nowrap"
                  >
                    Cerrar
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
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">
                  {editingSupplier ? 'Editar Proveedor' : 'Nuevo Proveedor'}
                </h3>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Nombre *</label>
                    <input 
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de documento <span className="text-red-500">*</span></label>
                    <select
                      value={formData.documentType}
                      onChange={(e) => setFormData({ ...formData, documentType: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      {documentTypes.map((dt) => (
                        <option key={dt} value={dt}>{dt}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Número documento (RNC/Cédula) *</label>
                    <input 
                      type="text"
                      required
                      value={formData.rnc}
                      onChange={(e) => {
                        const limit = getTaxIdDigitsLimit(formData.documentType);
                        if (limit === null) {
                          setFormData({ ...formData, rnc: e.target.value });
                          return;
                        }
                        const digits = onlyDigits(e.target.value).slice(0, limit);
                        const formatted = formatTaxId(formData.documentType, digits);
                        setFormData({ ...formData, rnc: formatted });
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Razón Social</label>
                    <input
                      type="text"
                      value={formData.legalName}
                      onChange={(e) => setFormData({ ...formData, legalName: e.target.value })}
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">Teléfono</label>
                    <input 
                      type="text"
                      value={formData.phone}
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Nombre Persona de Contacto</label>
                    <input
                      type="text"
                      value={formData.contactName}
                      onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Teléfono Persona de Contacto</label>
                    <input
                      type="text"
                      value={formData.contactPhone}
                      onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Email Persona de Contacto</label>
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">Dirección</label>
                    <textarea 
                      value={formData.address}
                      onChange={(e) => setFormData({...formData, address: e.target.value})}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Límite de Crédito</label>
                    <input 
                      type="number" min="0"
                      value={formData.creditLimit}
                      onChange={(e) => setFormData({...formData, creditLimit: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Términos de Pago</label>
                    <select 
                      value={formData.paymentTermsId}
                      onChange={(e) => {
                        const selected = paymentTermsList.find((t: any) => String(t.id) === e.target.value);
                        setFormData({
                          ...formData,
                          paymentTermsId: e.target.value,
                          paymentTerms: selected?.name || formData.paymentTerms,
                        });
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Sin especificar</option>
                      {paymentTermsList.map((term: any) => (
                        <option key={term.id} value={term.id}>{term.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de gasto 606</label>
                    <select
                      value={formData.expenseType606}
                      onChange={(e) => setFormData({ ...formData, expenseType606: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Sin especificar</option>
                      {expenseTypes606.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Régimen Tributario</label>
                    <select
                      value={formData.taxRegime}
                      onChange={(e) => setFormData({ ...formData, taxRegime: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Sin especificar</option>
                      {taxRegimes.map((reg) => (
                        <option key={reg} value={reg}>{reg}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de Factura Habitual</label>
                    <select
                      value={formData.defaultInvoiceType}
                      onChange={(e) => setFormData({ ...formData, defaultInvoiceType: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Sin especificar</option>
                      {invoiceTypes.map((it) => (
                        <option key={it} value={it}>{it}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de Suplidor</label>
                    <select
                      value={formData.supplierTypeId}
                      onChange={(e) => setFormData({ ...formData, supplierTypeId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Sin especificar</option>
                      {supplierTypes.map((st: any) => (
                        <option key={st.id} value={st.id}>{st.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Categoría</label>
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">Estado</label>
                    <select 
                      value={formData.status}
                      onChange={(e) => setFormData({...formData, status: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="Activo">Activo</option>
                      <option value="Inactivo">Inactivo</option>
                    </select>
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Cuenta por Pagar (opcional)
                  </label>
                  <select
                    value={formData.apAccountId}
                    onChange={(e) => setFormData({ ...formData, apAccountId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                  >
                    <option value="">Usar cuenta por defecto</option>
                    {payableAccounts.map((acc: any) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.code} - {acc.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    Si no seleccionas una cuenta, se usará la cuenta por pagar configurada por defecto.
                  </p>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Cuenta Bancaria Predeterminada (opcional)
                  </label>
                  <select
                    value={formData.defaultBankAccountId}
                    onChange={(e) => setFormData({ ...formData, defaultBankAccountId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                  >
                    <option value="">Sin cuenta predeterminada</option>
                    {bankAccounts.map((ba: any) => (
                      <option key={ba.id} value={ba.id}>
                        {ba.bank_name} - {ba.account_number}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end space-x-3 pt-4">
                  <button 
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 whitespace-nowrap"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 whitespace-nowrap"
                  >
                    {editingSupplier ? 'Actualizar' : 'Crear'} Proveedor
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