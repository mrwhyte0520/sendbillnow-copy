import { useState, useRef, useEffect } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { chartAccountsService, accountingSettingsService } from '../../../services/database';
import { useAuth } from '../../../hooks/useAuth';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

const theme = {
  primary: '#4b5c4b',
  primaryHover: '#3f4f3f',
  muted: '#eef2ea',
  softBorder: '#dfe4db',
  softText: '#2f3a2f',
  badgeBg: '#e3e8dd',
};

interface ChartAccount {
  id: string;
  code: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'income' | 'cost' | 'expense';
  parentId?: string;
  level: number;
  balance: number;
  isActive: boolean;
  description?: string;
  normalBalance: 'debit' | 'credit';
  allowPosting: boolean;
  isBankAccount?: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ImportData {
  code: string;
  name: string;
  type: string;
  parentCode?: string;
  description?: string;
  balance?: number;
  category?: string;
  subCategory?: string;
  allowPosting?: boolean; // true = Detalle, false = General (según columna "Tipo" del Excel)
  level?: number; // Nivel de la cuenta si viene en el archivo
}

interface ImportFormat {
  id: string;
  name: string;
  description: string;
  fileTypes: string[];
  icon: string;
  color: string;
}

export default function ChartAccountsPage() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<ChartAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAccountType, setSelectedAccountType] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showFormatModal, setShowFormatModal] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<ImportFormat | null>(null);
  const [editingAccount, setEditingAccount] = useState<ChartAccount | null>(null);
  const [expandedAccounts, setExpandedAccounts] = useState<string[]>([]);
  const [importProgress, setImportProgress] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSeedingBase, setIsSeedingBase] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [newAccount, setNewAccount] = useState<{
    code: string;
    name: string;
    type: ChartAccount['type'];
    parentId: string;
    level: number;
    description: string;
    allowPosting: boolean;
    isBankAccount: boolean;
  }>({
    code: '',
    name: '',
    type: 'asset',
    parentId: '',
    level: 1,
    description: '',
    allowPosting: true,
    isBankAccount: false,
  });

  // Load accounts from database
  useEffect(() => {
    if (user) {
      loadAccounts();
    }
  }, [user]);

  const loadAccounts = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      let data = await chartAccountsService.getAll(user.id);
      console.log('DEBUG cuentas cargadas:', data.length);

      // Si el usuario no tiene plan de cuentas, verificar si ya se sembró antes
      if (!data || data.length === 0) {
        // Verificar si el catálogo ya fue sembrado previamente
        const alreadySeeded = await accountingSettingsService.hasChartAccountsSeeded(user.id);
        console.log('DEBUG catálogo ya sembrado antes:', alreadySeeded);

        // Solo sembrar si NO se ha hecho antes (primera vez del usuario)
        if (!alreadySeeded) {
          try {
            const seedResult = await chartAccountsService.seedFromTemplate(user.id);
            console.log('DEBUG seedFromTemplate result:', seedResult);
            
            if (seedResult && seedResult.created > 0) {
              // Marcar que el catálogo ya fue sembrado para este usuario
              await accountingSettingsService.markChartAccountsSeeded(user.id);
              console.log('DEBUG catálogo marcado como sembrado');
              
              // Recargar las cuentas
              data = await chartAccountsService.getAll(user.id);
              console.log('DEBUG cuentas cargadas tras seed:', data.length);
            }
          } catch (seedError) {
            console.error('Error seeding chart of accounts from template:', seedError);
          }
        } else {
          console.log('DEBUG No se vuelve a cargar el catálogo - usuario ya lo recibió antes');
        }
      }

      setAccounts(data || []);
    } catch (error) {
      console.error('Error loading accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  const getChildAccounts = (parentId: string) => {
    return filteredAccounts.filter(account => account.parentId === parentId);
  };

  const importFormats: ImportFormat[] = [
    {
      id: 'excel',
      name: 'Microsoft Excel',
      description: 'Structured Excel files (.xlsx, .xls)',
      fileTypes: ['.xlsx', '.xls'],
      icon: 'ri-file-excel-line',
      color: 'bg-green-100 text-green-800'
    }
  ];

  const accountTypes = [
    { value: 'all', label: 'All Types' },
    { value: 'asset', label: 'Assets' },
    { value: 'liability', label: 'Liabilities' },
    { value: 'equity', label: 'Equity' },
    { value: 'income', label: 'Income' },
    { value: 'expense', label: 'Expenses' },
    { value: 'cost', label: 'Costs' },
  ];

  const filteredAccounts = accounts.filter(account => {
    const matchesSearch = account.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         account.code.includes(searchTerm);
    const matchesType = selectedAccountType === 'all' || account.type === selectedAccountType;
    return matchesSearch && matchesType;
  });

  const allDisplayedIds = filteredAccounts.map(acc => acc.id);
  const isAllSelected = allDisplayedIds.length > 0 && allDisplayedIds.every(id => selectedIds.includes(id));
  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(prev => prev.filter(id => !allDisplayedIds.includes(id)));
    } else {
      const merged = Array.from(new Set([...selectedIds, ...allDisplayedIds]));
      setSelectedIds(merged);
    }
  };
  const toggleSelectOne = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const clearSelection = () => setSelectedIds([]);

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return;
    const confirmMsg = `Delete ${selectedIds.length} account(s)?\nAccounts with balance or with subaccounts cannot be deleted.`;
    if (!confirm(confirmMsg)) return;
    setIsDeleting(true);
    let deleted = 0;
    const failed: Array<{ code: string; reason: string }> = [];
    try {
      for (const id of selectedIds) {
        const acc = accounts.find(a => a.id === id);
        if (!acc) continue;
        const hasChildren = accounts.some(a => a.parentId === id);
        if (hasChildren) {
          failed.push({ code: acc.code, reason: 'Has subaccounts' });
          continue;
        }
        if (acc.balance !== 0) {
          failed.push({ code: acc.code, reason: 'Has non-zero balance' });
          continue;
        }
        try {
          const relations = await chartAccountsService.checkRelations(id);
          if (relations.hasAccountingSettings) {
            failed.push({ code: acc.code, reason: 'Used in accounting settings' });
            continue;
          }
          if (relations.hasJournalEntries) {
            failed.push({ code: acc.code, reason: 'Has journal entries posted' });
            continue;
          }

          await chartAccountsService.delete(id);
          deleted++;
        } catch (e) {
          failed.push({ code: acc.code, reason: 'Error deleting' });
        }
      }
      await loadAccounts();
      clearSelection();
      const lines = [
        `Eliminadas: ${deleted}`,
        `Fallidas: ${failed.length}`
      ];
      if (failed.length > 0) {
        const sample = failed.slice(0, 5).map(f => `- ${f.code}: ${f.reason}`).join('\n');
        lines.push('Details (sample):');
        lines.push(sample);
        if (failed.length > 5) lines.push(`... and ${failed.length - 5} more`);
      }
      alert(lines.join('\n'));
    } catch (err) {
      console.error('Bulk delete error:', err);
      alert('Error deleting selected accounts.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSeedBaseCatalog = async () => {
    if (!user) return;

    const confirmMsg = `This will load the base chart of accounts again.\n\nIt will only add missing accounts; it will not delete or modify existing ones.\n\nDo you want to continue?`;
    if (!confirm(confirmMsg)) return;

    try {
      setIsSeedingBase(true);
      const seedResult = await chartAccountsService.seedFromTemplate(user.id);
      console.log('DEBUG seedFromTemplate (manual) result:', seedResult);

      if (seedResult && seedResult.created > 0) {
        await accountingSettingsService.markChartAccountsSeeded(user.id);
        await loadAccounts();
        alert(`Catálogo base aplicado. Cuentas creadas: ${seedResult.created}.`);
      } else {
        alert('No se encontraron cuentas nuevas para agregar desde el catálogo base.');
      }
    } catch (error) {
      console.error('Error applying base chart of accounts manually:', error);
      alert('An error occurred while applying the base chart of accounts.');
    } finally {
      setIsSeedingBase(false);
    }
  };

  const getAccountTypeColor = (type: string) => {
    switch (type) {
      case 'asset': return 'bg-[#dfe6d8] text-[#2f3a2f]';
      case 'liability': return 'bg-[#cfd6c6] text-[#2f3a2f]';
      case 'equity': return 'bg-[#e3e8dd] text-[#2f3a2f]';
      case 'income': return 'bg-[#c9e0c9] text-[#244026]';
      case 'cost': return 'bg-[#e9e1c8] text-[#3a3424]';
      case 'expense': return 'bg-[#e7d8d0] text-[#3e2f2b]';
      default: return 'bg-[#e3e8dd] text-[#2f3a2f]';
    }
  };

  const getAccountTypeName = (type: string) => {
    switch (type) {
      case 'asset': return 'Activo';
      case 'liability': return 'Pasivo';
      case 'equity': return 'Patrimonio';
      case 'income': return 'Ingreso';
      case 'cost': return 'Costo';
      case 'expense': return 'Gasto';
      default: return 'Otro';
    }
  };

  const getNormalBalance = (type: string): 'debit' | 'credit' => {
    return ['asset', 'cost', 'expense'].includes(type) ? 'debit' : 'credit';
  };

  const inferLevelFromCode = (code: string): number => {
    const trimmed = (code || '').trim();
    if (!trimmed) return 1;

    // Normalizar separadores: tratar punto, guion y espacios como separadores de nivel
    const normalized = trimmed.replace(/[\.\-\s]+/g, '.');

    // Contar segmentos no vacíos
    const segments = normalized.split('.').filter(Boolean);
    if (segments.length > 1) return segments.length;

    // Si no hay separadores pero el código es solo numérico, inferir por longitud
    if (/^\d+$/.test(trimmed)) {
      const len = trimmed.length;
      if (len <= 2) return 1;       // 1, 10
      if (len <= 4) return 2;       // 1001
      if (len <= 6) return 3;       // 100101
      if (len <= 8) return 4;
      return 5;
    }

    return 1;
  };

  const mapSpanishTypeToInternal = (value: string): string => {
    const v = (value || '').toLowerCase().trim();
    if (['activo', 'activos'].includes(v)) return 'asset';
    if (['pasivo', 'pasivos'].includes(v)) return 'liability';
    if (['patrimonio', 'capital'].includes(v)) return 'equity';
    if (['ingreso', 'ingresos'].includes(v)) return 'income';
    if (['costo', 'costos'].includes(v)) return 'cost';
    if (['gasto', 'gastos'].includes(v)) return 'expense';
    return v;
  };

  const toggleExpanded = (id: string) => {
    setExpandedAccounts(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const calculateLevel = (parentId: string): number => {
    const parent = accounts.find(acc => acc.id === parentId);
    const baseLevel = parent ? (parent.level || 1) + 1 : 1;
    return Math.min(5, Math.max(1, baseLevel));
  };

  const getParentAccounts = (type: ChartAccount['type']): ChartAccount[] => {
    return accounts.filter(acc => acc.type === type);
  };

  const parseExcelData = async (file: File): Promise<ImportData[]> => {
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      const importedData: ImportData[] = [];
      if (!rows || rows.length === 0) return importedData;

      let headerRowIndex = rows.findIndex((row) => {
        const first = String((row && row[0]) ?? '').trim().toLowerCase();
        return first === 'codigo' || first === 'código';
      });
      if (headerRowIndex === -1) headerRowIndex = 0;

      const headerRow = rows[headerRowIndex] || [];
      const tipoColIndex = headerRow.findIndex((cell) => {
        const text = String(cell ?? '').trim().toLowerCase();
        if (!text) return false;
        if (!text.includes('tipo')) return false;
        if (text.includes('grupo')) return false;
        return true;
      });
      const nivelColIndex = headerRow.findIndex((cell) => {
        const text = String(cell ?? '').trim().toLowerCase();
        if (!text) return false;
        return text.includes('nivel');
      });

      for (let i = headerRowIndex + 1; i < rows.length; i++) {
        const row = rows[i] || [];
        const code = String(row[0] ?? '').trim();
        const name = String(row[1] ?? '').trim();
        const group = String(row[2] ?? '').trim();
        const detailType = tipoColIndex >= 0 ? String(row[tipoColIndex] ?? '').trim() : '';
        const levelRaw = nivelColIndex >= 0 ? row[nivelColIndex] : undefined;
        const parentCode = String(row[5] ?? '').trim();
        const description = String(row[6] ?? '').trim();

        if (!code || !name) continue;

        const mappedType = group ? mapSpanishTypeToInternal(group).toLowerCase() : '';

        let allowPosting: boolean | undefined = undefined;
        if (tipoColIndex >= 0 && detailType) {
          const normalized = detailType.trim().toLowerCase();
          if (['detalle', 'detail', 'd'].includes(normalized)) {
            allowPosting = true;
          } else if (['general', 'control', 'g'].includes(normalized)) {
            allowPosting = false;
          }
        }

        const level = typeof levelRaw === 'number'
          ? levelRaw
          : (typeof levelRaw === 'string' && levelRaw.trim() !== '' && !isNaN(Number(levelRaw)))
            ? Number(levelRaw)
            : undefined;

        importedData.push({
          code,
          name,
          type: mappedType,
          parentCode: parentCode || undefined,
          description: description || undefined,
          allowPosting,
          level,
        });
      }

      return importedData;
    } catch (err) {
      console.error('Error parsing Excel:', err);
      return [];
    }
  };

  const handleFormatSelection = (format: ImportFormat) => {
    setSelectedFormat(format);
    setShowFormatModal(false);
    setShowImportModal(true);
  };

  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user || !selectedFormat) return;

    setIsImporting(true);
    setImportProgress(0);

    try {
      let importedData: ImportData[] = [];
      setImportProgress(25);
      importedData = await parseExcelData(file);

      setImportProgress(75);

      const result = await processImportedData(importedData);

      setImportProgress(100);
      setTimeout(() => {
        setIsImporting(false);
        setImportProgress(0);
        setShowImportModal(false);
        const { created, updated, skippedDuplicates, failed } = result as any;
        const messageLines = [
          `Creado: ${created}`,
          `Actualizado: ${updated}`,
          `Duplicados omitidos: ${skippedDuplicates}`,
          `Errores: ${failed.length}`
        ];
        if (failed.length > 0) {
          const sample = failed
            .slice(0, 5)
            .map((f: { code: string; errorMessage: string }) => `- Código ${f.code}: ${f.errorMessage || 'Error'}`)
            .join('\n');
          messageLines.push('Detalles (muestra):');
          messageLines.push(sample);
          if (failed.length > 5) messageLines.push(`... y ${failed.length - 5} más`);
        }
        alert(`Importación finalizada (${selectedFormat.name})\n\n${messageLines.join('\n')}`);
      }, 400);
    } catch (error) {
      setIsImporting(false);
      setImportProgress(0);
      alert(`Error al procesar el archivo ${selectedFormat.name}. Verifique el formato.`);
      console.error('Import error:', error);
    }
  };

  const processImportedData = async (
    importedData: ImportData[]
  ): Promise<{ created: number; updated: number; skippedDuplicates: number; failed: { code: string; errorMessage: string }[] }> => {
    if (!user) return { created: 0, updated: 0, skippedDuplicates: 0, failed: [] };

    const codeToIdMap: { [key: string]: string } = {};
    const existing = await chartAccountsService.getAll(user.id);
    const existingCodes = new Set(existing.map((acc: any) => acc.code));
    const existingByCode: Record<string, typeof existing[number]> = {};
    existing.forEach((acc: any) => { existingByCode[acc.code] = acc; });

    const fileHasExplicitTipo = importedData.some(d => d.allowPosting !== undefined);

    let created = 0;
    let updated = 0;
    let skippedDuplicates = 0;
    const failed: Array<{ code: string; errorMessage: string }> = [];

    for (const data of importedData) {
      if (!data.code || !data.name) continue;

      if (existingCodes.has(data.code)) {
        try {
          const existingAcc = existingByCode[data.code];
          if (existingAcc) {
            const updatePayload: any = {
              balance: data.balance || 0,
              description: data.description ?? existingAcc.description,
            };

            if (!fileHasExplicitTipo) {
              // Archivo sin Tipo: recalcular allow_posting según nivel.
              const levelSource = typeof data.level === 'number' && data.level > 0
                ? data.level
                : (existingAcc.level || inferLevelFromCode(data.code));
              updatePayload.allow_posting = levelSource > 1; // nivel 1 => General, >=2 => Detalle
            } else if (data.allowPosting !== undefined) {
              updatePayload.allow_posting = data.allowPosting;
            }

            await chartAccountsService.update(existingAcc.id, updatePayload);
            updated++;
          } else {
            skippedDuplicates++;
          }
        } catch (err) {
          console.error('Error updating existing account:', data.code, err);
          failed.push({ code: data.code, errorMessage: (err as any)?.message || 'Error al actualizar' });
        }
        continue;
      }

      try {
        const rawType = (data.type || '').toLowerCase().trim();
        let inferredType = rawType;

        if (inferredType) {
          inferredType = mapSpanishTypeToInternal(inferredType).toLowerCase();
        } else if (data.code) {
          const first = data.code.trim()[0];
          if (first === '1') inferredType = 'asset';
          else if (first === '2') inferredType = 'liability';
          else if (first === '3') inferredType = 'equity';
          else if (first === '4') inferredType = 'income';
          else if (first === '5') inferredType = 'cost';
          else if (first === '6') inferredType = 'expense';
        }

        const validTypes = new Set(['asset', 'liability', 'equity', 'income', 'cost', 'expense']);
        const safeType = (validTypes.has(inferredType) ? inferredType : 'asset') as any;

        const levelFinal = typeof data.level === 'number' && data.level > 0
          ? data.level
          : inferLevelFromCode(data.code);

        const account: any = {
          code: data.code,
          name: data.name,
          type: (safeType || 'asset') as any,
          level: levelFinal,
          balance: data.balance || 0,
          is_active: true,
          description: data.description,
          normal_balance: getNormalBalance(safeType || 'asset'),
          parent_id: null,
        };

        // Determinar allow_posting para nuevas cuentas
        let allowPostingToSet: boolean | undefined = undefined;
        if (fileHasExplicitTipo && data.allowPosting !== undefined) {
          // Archivo con Tipo explícito: respetar el valor
          allowPostingToSet = data.allowPosting;
        } else if (!fileHasExplicitTipo) {
          // Archivo sin Tipo: usar regla por nivel
          allowPostingToSet = levelFinal > 1; // nivel 1 => General(false), >=2 => Detalle(true)
        }

        if (allowPostingToSet !== undefined) {
          account.allow_posting = allowPostingToSet;
        }

        const createdAcc = await chartAccountsService.create(user.id, account);
        codeToIdMap[data.code] = createdAcc.id;
        existingCodes.add(data.code);
        created++;
      } catch (error) {
        console.error('Error importing account:', data.code, error);
        failed.push({ code: data.code, errorMessage: (error as any)?.message || 'Error al crear' });
      }
    }

    try {
      const refreshed = await chartAccountsService.getAll(user.id);
      const refreshedByCode: Record<string, typeof refreshed[number]> = {};
      refreshed.forEach((acc: any) => { refreshedByCode[acc.code] = acc; });

      for (const data of importedData) {
        if (!data.code || !data.parentCode) continue;
        const child = refreshedByCode[data.code];
        const parent = refreshedByCode[data.parentCode];
        if (!child || !parent) continue;

        const desiredLevel = (parent.level || 1) + 1;

        if (child.parentId !== parent.id || child.level !== desiredLevel) {
          try {
            await chartAccountsService.update(child.id, {
              parent_id: parent.id,
              level: desiredLevel,
            });
          } catch (err) {
            console.error('Error updating parent/level for', data.code, err);
            failed.push({ code: data.code, errorMessage: (err as any)?.message || 'Error al asignar cuenta madre' });
          }
        }
      }
    } catch (err) {
      console.error('Error refreshing accounts after import:', err);
    }

    await loadAccounts();
    return { created, updated, skippedDuplicates, failed };
  };

  const downloadTemplate = (formatId: string) => {
    let template = '';
    let filename = '';

    switch (formatId) {
      case 'csv':
        template = `Código,Nombre,Tipo,Código Padre,Descripción,Saldo
1000,ACTIVOS,asset,,Activos totales de la empresa,0
1100,ACTIVOS CORRIENTES,asset,1000,Activos de corto plazo,0
1110,Efectivo y Equivalentes,asset,1100,Dinero en efectivo y equivalentes,0
1111,Caja General,asset,1110,Dinero en caja,25000
2000,PASIVOS,liability,,Pasivos totales de la empresa,0
2100,PASIVOS CORRIENTES,liability,2000,Pasivos de corto plazo,0
3000,PATRIMONIO,equity,,Patrimonio de la empresa,0
4000,INGRESOS,income,,Ingresos totales,0
5000,GASTOS,expense,,Gastos totales,0`;
        filename = 'plantilla_catalogo_cuentas.csv';
        break;

      case 'quickbooks':
        template = `!ACCNT	NAME	ACCNTTYPE	DESC	ACCNUM
ACCNT	Caja General	Bank	Cuenta de caja principal	1111
ACCNT	Banco Popular	Bank	Cuenta bancaria principal	1112
ACCNT	Cuentas por Cobrar	Accounts Receivable	Cuentas por cobrar clientes	1120
ACCNT	Inventarios	Other Current Asset	Inventario de productos	1130
ACCNT	Cuentas por Pagar	Accounts Payable	Cuentas por pagar proveedores	2110
ACCNT	Capital Social	Equity	Capital social de la empresa	3100
ACCNT	Ventas	Income	Ingresos por ventas	4100
ACCNT	Gastos Operativos	Expense	Gastos operativos generales	5100`;
        filename = 'plantilla_quickbooks.iif';
        break;

      case 'xml':
        template = `<?xml version="1.0" encoding="UTF-8"?>
<chart_of_accounts>
  <account code="1000" name="ACTIVOS" type="asset" description="Activos totales"/>
  <account code="1100" name="ACTIVOS CORRIENTES" type="asset" parent="1000" description="Activos corrientes"/>
  <account code="1111" name="Caja General" type="asset" parent="1100" description="Caja principal"/>
  <account code="2000" name="PASIVOS" type="liability" description="Pasivos totales"/>
  <account code="2110" name="Cuentas por Pagar" type="liability" parent="2000" description="Cuentas por pagar"/>
  <account code="3000" name="PATRIMONIO" type="equity" description="Patrimonio total"/>
  <account code="4000" name="INGRESOS" type="income" description="Ingresos totales"/>
  <account code="5000" name="GASTOS" type="expense" description="Gastos totales"/>
</chart_of_accounts>`;
        filename = 'plantilla_catalogo.xml';
        break;

      case 'json':
        template = JSON.stringify([
          { code: "1000", name: "ACTIVOS", type: "asset", description: "Activos totales" },
          { code: "1100", name: "ACTIVOS CORRIENTES", type: "asset", parentCode: "1000", description: "Activos corrientes" },
          { code: "1111", name: "Caja General", type: "asset", parentCode: "1100", description: "Caja principal", balance: 25000 },
          { code: "2000", name: "PASIVOS", type: "liability", description: "Pasivos totales" },
          { code: "2110", name: "Cuentas por Pagar", type: "liability", parentCode: "2000", description: "Cuentas por pagar" },
          { code: "3000", name: "PATRIMONIO", type: "equity", description: "Patrimonio total" },
          { code: "4000", name: "INGRESOS", type: "income", description: "Ingresos totales" },
          { code: "5000", name: "GASTOS", type: "expense", description: "Gastos totales" }
        ], null, 2);
        filename = 'plantilla_catalogo.json';
        break;

      default:
        return;
    }

    // Ajustar tipo y codificación para Excel cuando sea CSV
    let dataForDownload = template;
    let mime = 'text/plain';
    if (formatId === 'csv') {
      dataForDownload = '\uFEFF' + template.replace(/\n/g, '\r\n');
      mime = 'text/csv;charset=utf-8;';
    }
    const blob = new Blob([dataForDownload], { type: mime });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  };
  const handleAddAccount = async () => {
    if (!user || !newAccount.code || !newAccount.name) {
      alert('Por favor complete código y nombre.');
      return;
    }

    // Validar que no exista otra cuenta con el mismo código
    const trimmedCode = newAccount.code.trim();
    const exists = accounts.some(acc => acc.code === trimmedCode);
    if (exists) {
      alert(`Ya existe una cuenta con el código ${trimmedCode}. Use un código único.`);
      return;
    }
    try {
      const isControlLevel = newAccount.level <= 2;
      const account = {
        code: trimmedCode,
        name: newAccount.name,
        type: newAccount.type,
        parent_id: newAccount.parentId || null,
        level: newAccount.level,
        balance: 0,
        is_active: true,
        description: newAccount.description,
        normal_balance: getNormalBalance(newAccount.type),
        allow_posting: isControlLevel ? false : newAccount.allowPosting,
        is_bank_account: newAccount.isBankAccount
      };

      console.log('DEBUG account to create:', account);

      await chartAccountsService.create(user.id, account);
      await loadAccounts();

      setNewAccount({
        code: '',
        name: '',
        type: 'asset',
        parentId: '',
        level: 1,
        description: '',
        allowPosting: true,
        isBankAccount: false
      });
      setShowAddModal(false);
      alert('Cuenta creada exitosamente.');
    } catch (error: any) {
      console.error('Error creating account:', error);
      alert(`Error al crear la cuenta: ${error?.message || 'Error desconocido'}`);
    }
  };

  const handleEditAccount = async () => {
    if (!editingAccount || !editingAccount.code || !editingAccount.name) {
      alert('Por favor complete todos los campos requeridos.');
      return;
    }

    // Validar que no exista otra cuenta con el mismo código
    const trimmedCode = editingAccount.code.trim();
    const exists = accounts.some(acc => acc.code === trimmedCode && acc.id !== editingAccount.id);
    if (exists) {
      alert(`Ya existe otra cuenta con el código ${trimmedCode}. Use un código único.`);
      return;
    }

    // Si se cambia el tipo, obligar a cambiar también el código para que corresponda al nuevo tipo
    const originalAccount = accounts.find(acc => acc.id === editingAccount.id);
    if (originalAccount) {
      const originalType = originalAccount.type;
      const originalCode = originalAccount.code;
      if (editingAccount.type !== originalType && trimmedCode === originalCode) {
        alert('Ha cambiado el tipo de la cuenta. Debe generar o modificar el código para que corresponda con el nuevo tipo antes de guardar.');
        return;
      }
    }

    try {
      const isControlLevel = editingAccount.level <= 2;
      const account = {
        code: trimmedCode,
        name: editingAccount.name,
        type: editingAccount.type,
        level: editingAccount.level,
        description: editingAccount.description,
        allow_posting: isControlLevel ? false : editingAccount.allowPosting,
        is_active: editingAccount.isActive,
        normal_balance: getNormalBalance(editingAccount.type),
        is_bank_account: editingAccount.isBankAccount
      };

      await chartAccountsService.update(editingAccount.id, account);
      await loadAccounts();
      
      setEditingAccount(null);
      setShowEditModal(false);
      alert('Cuenta actualizada exitosamente.');
    } catch (error) {
      console.error('Error updating account:', error);
      alert('Error al actualizar la cuenta.');
    }
  };

  const handleDeleteAccount = async (accountId: string) => {
    if (!confirm('¿Está seguro de que desea eliminar esta cuenta? Esta acción no se puede deshacer.')) {
      return;
    }

    try {
      setIsDeleting(true);
      // Verificar si la cuenta tiene movimientos
      const account = accounts.find(acc => acc.id === accountId);
      if (account && account.balance !== 0) {
        alert('No se puede eliminar una cuenta con saldo. Primero debe transferir el saldo a otra cuenta.');
        return;
      }

      // Verificar si tiene cuentas hijas
      const hasChildren = accounts.some(acc => acc.parentId === accountId);
      if (hasChildren) {
        alert('No se puede eliminar una cuenta que tiene subcuentas. Primero elimine o reasigne las subcuentas.');
        return;
      }

      const relations = await chartAccountsService.checkRelations(accountId);
      if (relations.hasAccountingSettings) {
        alert('No se puede eliminar esta cuenta porque está usada en la configuración contable.\nActualice la configuración para usar otra cuenta antes de eliminarla.');
        return;
      }
      if (relations.hasJournalEntries) {
        alert('No se puede eliminar esta cuenta porque tiene asientos contables registrados.\nConsidere inactivarla en lugar de eliminarla.');
        return;
      }

      await chartAccountsService.delete(accountId);
      await loadAccounts();
      alert('Cuenta eliminada exitosamente.');
    } catch (error: any) {
      console.error('Error deleting account:', error);
      const code = error?.code;
      const details: string | undefined = error?.details;

      if (code === '23503' && details?.includes('"bank_accounts"')) {
        alert('No se puede eliminar esta cuenta porque está asociada a uno o más bancos.\nPrimero quite o cambie la cuenta contable en el módulo de Bancos.');
      } else {
        alert('Error al eliminar la cuenta. Verifique que no tenga movimientos ni relaciones asociadas.');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const downloadExcel = async () => {
    try {
      const idToCode: Record<string, string> = {};
      accounts.forEach((acc) => {
        idToCode[acc.id] = acc.code;
      });

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Catalogo');

      const headers = [
        { title: 'Codigo', width: 12 },
        { title: 'Nombre', width: 40 },
        { title: 'Grupo', width: 12 },
        { title: 'Tipo', width: 12 },
        { title: 'Nivel', width: 8 },
        { title: 'Cuenta Madre', width: 14 },
        { title: 'Descripcion', width: 40 },
      ];

      let currentRow = 1;
      const totalColumns = headers.length;

      ws.mergeCells(currentRow, 1, currentRow, totalColumns);
      const titleCell = ws.getCell(currentRow, 1);
      titleCell.value = 'Chart of Accounts';
      titleCell.font = { bold: true, size: 14, underline: true };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      currentRow++;
      currentRow++;

      const headerRow = ws.getRow(currentRow);
      headers.forEach((h, idx) => {
        const cell = headerRow.getCell(idx + 1);
        cell.value = h.title;
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1F3A' } };
        cell.alignment = { vertical: 'middle' };
      });
      currentRow++;

      for (const acc of filteredAccounts) {
        const parentCode = acc.parentId ? idToCode[acc.parentId] || '' : '';
        const group = getAccountTypeName(acc.type);
        const tipo = acc.allowPosting ? 'Detalle' : 'General';

        const dataRow = ws.getRow(currentRow);
        dataRow.getCell(1).value = acc.code;
        dataRow.getCell(2).value = acc.name;
        dataRow.getCell(3).value = group;
        dataRow.getCell(4).value = tipo;
        dataRow.getCell(5).value = acc.level;
        dataRow.getCell(6).value = parentCode;
        dataRow.getCell(7).value = acc.description || '';
        currentRow++;
      }

      headers.forEach((h, idx) => {
        ws.getColumn(idx + 1).width = h.width;
      });

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `catalogo_cuentas_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (error) {
      console.error('Error downloading Excel:', error);
      alert('Error al descargar el archivo');
    }
  };

  const downloadTemplateHeaders = () => {
    try {
      const header = ['Codigo', 'Nombre', 'Grupo', 'Tipo', 'Nivel', 'Cuenta Madre', 'Descripcion'];

      // Solo título, fila en blanco y encabezados, sin filas de datos
      const aoa = [
        ['Chart of Accounts - Template'],
        [],
        header,
      ];

      const ws = XLSX.utils.aoa_to_sheet(aoa);

      ws['!cols'] = [
        { wch: 12 },
        { wch: 40 },
        { wch: 12 },
        { wch: 12 },
        { wch: 8 },
        { wch: 14 },
        { wch: 40 },
      ];

      const titleCellRef = 'A1';
      if (!ws[titleCellRef]) {
        ws[titleCellRef] = { t: 's', v: 'Chart of Accounts - Template' } as any;
      }
      (ws[titleCellRef] as any).s = {
        font: { bold: true, underline: true, sz: 14 },
        alignment: { horizontal: 'center' },
      };
      (ws as any)['!merges'] = (ws as any)['!merges'] || [];
      (ws as any)['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } });

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Plantilla');
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = 'plantilla_catalogo_cuentas.xlsx';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading template headers:', error);
      alert('Error al descargar la plantilla');
    }
  };

  const renderAccountRow = (account: ChartAccount) => {
    const hasChildren = accounts.some(acc => acc.parentId === account.id);
    const isExpanded = expandedAccounts.includes(account.id);
    const children = getChildAccounts(account.id);

    return (
      <div key={account.id}>
        {/* Desktop View */}
        <div className="hidden md:flex items-stretch px-2 sm:px-4 py-2 border-b border-gray-100 hover:bg-gray-50">
          <div className="flex-1 grid grid-cols-[auto,auto,minmax(0,3fr),auto,auto,auto,auto,auto,auto] gap-x-6 items-start text-sm">
            <div className="flex items-center">
              <input
                type="checkbox"
                checked={selectedIds.includes(account.id)}
                onChange={() => toggleSelectOne(account.id)}
              />
            </div>
            <div className="font-semibold text-gray-900 tabular-nums pr-2">{account.code}</div>
            <div
              className="text-gray-900 break-words pl-2 pr-6 flex items-center"
              title={account.name}
              style={{ paddingLeft: `${(account.level - 1) * 16}px` }}
            >
              {hasChildren && (
                <button
                  onClick={() => toggleExpanded(account.id)}
                  className="mr-2 text-gray-400 hover:text-gray-600"
                >
                  <i className={`ri-arrow-${isExpanded ? 'down' : 'right'}-s-line`}></i>
                </button>
              )}
              <span>{account.name}</span>
            </div>
              <div className="flex justify-start pl-2">
                <span
                  className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${getAccountTypeColor(
                    account.type
                  )}`}
                >
                  {getAccountTypeName(account.type)}
                </span>
              </div>
              <div className="flex justify-center">
                <span className="inline-flex items-center justify-center rounded-full bg-gray-100 px-1.5 py-0.5 text-xs font-semibold text-gray-700 min-w-[2rem]">
                  {account.level}
                </span>
              </div>
              <div className="flex justify-center">
                <span className="text-xs text-gray-600">
                  {account.allowPosting ? 'Detalle' : 'General'}
                </span>
              </div>
              <div className="text-right text-gray-900 tabular-nums">
                {Math.abs(account.balance).toLocaleString()}
                {account.balance < 0 && ' (Cr)'}
              </div>
            <div className="flex justify-center">
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                  account.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}
              >
                {account.isActive ? 'Activa' : 'Inactiva'}
              </span>
            </div>
            <div className="flex items-center justify-center gap-3 text-base">
              <button
                onClick={() => {
                  setEditingAccount(account);
                  setShowEditModal(true);
                }}
                className="text-blue-600 hover:text-blue-900"
              >
                <i className="ri-edit-line"></i>
              </button>
              <button
                onClick={() => handleDeleteAccount(account.id)}
                className="text-red-600 hover:text-red-900"
              >
                <i className="ri-delete-bin-line"></i>
              </button>
            </div>
          </div>
        </div>
        
        {/* Mobile View */}
        <div className="md:hidden border-b border-gray-100 hover:bg-gray-50">
          <div className="p-3 space-y-2" style={{ paddingLeft: `${(account.level - 1) * 12 + 12}px` }}>
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-2 flex-1">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(account.id)}
                  onChange={() => toggleSelectOne(account.id)}
                  className="mt-1"
                />
                {hasChildren && (
                  <button
                    onClick={() => toggleExpanded(account.id)}
                    className="text-gray-400 hover:text-gray-600 mt-1"
                  >
                    <i className={`ri-arrow-${isExpanded ? 'down' : 'right'}-s-line`}></i>
                  </button>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900 text-sm">{account.code}</div>
                  <div className="text-gray-900 text-sm break-words">{account.name}</div>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getAccountTypeColor(
                        account.type
                      )}`}
                    >
                      {getAccountTypeName(account.type)}
                    </span>
                    <span className="inline-flex items-center justify-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
                      Nv.{account.level}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        account.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {account.isActive ? 'Activa' : 'Inactiva'}
                    </span>
                  </div>
                  <div className="text-right text-gray-900 text-sm font-semibold mt-1">
                    {Math.abs(account.balance).toLocaleString()}
                    {account.balance < 0 && ' (Cr)'}
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-2 text-base ml-2">
                <button
                  onClick={() => {
                    setEditingAccount(account);
                    setShowEditModal(true);
                  }}
                  className="text-blue-600 hover:text-blue-900"
                >
                  <i className="ri-edit-line"></i>
                </button>
                <button
                  onClick={() => handleDeleteAccount(account.id)}
                  className="text-red-600 hover:text-red-900"
                >
                  <i className="ri-delete-bin-line"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
        
        {hasChildren && isExpanded && children.map(child => renderAccountRow(child))}
      </div>
    );
  };

  // Mostrar todas las cuentas filtradas sin limitar por nivel,
  // para que las cuentas con nivel 2-5 también aparezcan en el listado.
  const topLevelAccounts = filteredAccounts;

  if (loading) {
    return (
      <DashboardLayout>
        <div className="p-6 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading chart of accounts...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 lg:gap-6 mb-6">
          <div className="flex-1">
            <p className="text-sm text-gray-600 mb-1">Full management of the chart of accounts</p>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Chart of Accounts</h1>
          </div>
          <div className="flex flex-wrap gap-3 justify-start lg:justify-end w-full lg:w-auto">
            <button
              onClick={handleSeedBaseCatalog}
              disabled={isSeedingBase}
              className={`w-full sm:w-auto px-4 py-2 rounded-lg transition-colors whitespace-nowrap border ${
                isSeedingBase
                  ? 'bg-[#eef2ea] text-gray-500 cursor-wait border-[#dfe4db]'
                  : 'bg-white text-[#2f3a2f] border-[#dfe4db] hover:bg-[#eef2ea]'
              }`}
            >
              <i className="ri-refresh-line mr-2"></i>
              {isSeedingBase ? 'Loading base catalog...' : 'Base chart of accounts'}
            </button>
            <button
              onClick={downloadExcel}
              className="w-full sm:w-auto px-4 py-2 rounded-lg transition-colors whitespace-nowrap text-white"
              style={{ backgroundColor: theme.primary }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = theme.primaryHover)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = theme.primary)}
            >
              <i className="ri-file-excel-line mr-2"></i>
              Download chart of accounts
            </button>
            <button
              onClick={downloadTemplateHeaders}
              className="w-full sm:w-auto px-4 py-2 rounded-lg transition-colors whitespace-nowrap text-white"
              style={{ backgroundColor: theme.primary }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = theme.primaryHover)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = theme.primary)}
            >
              <i className="ri-file-excel-line mr-2"></i>
              Download template
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="w-full sm:w-auto px-4 py-2 rounded-lg transition-colors whitespace-nowrap text-white"
              style={{ backgroundColor: theme.primary }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = theme.primaryHover)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = theme.primary)}
            >
              <i className="ri-add-line mr-2"></i>
              New Account
            </button>
            <button
              onClick={handleDeleteSelected}
              disabled={selectedIds.length === 0}
              className={`w-full sm:w-auto px-4 py-2 rounded-lg transition-colors whitespace-nowrap ${selectedIds.length === 0 ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'text-white'}`}
              style={selectedIds.length === 0 ? {} : { backgroundColor: '#b94b4b' }}
              onMouseEnter={(e) => {
                if (selectedIds.length !== 0) e.currentTarget.style.backgroundColor = '#a33f3f';
              }}
              onMouseLeave={(e) => {
                if (selectedIds.length !== 0) e.currentTarget.style.backgroundColor = '#b94b4b';
              }}
            >
              <i className="ri-delete-bin-line mr-2"></i>
              Delete selected
            </button>
          </div>
        </div>

        {isDeleting && (
          <div className="mb-4 flex items-center gap-2 text-sm text-blue-700 bg-blue-50 border border-blue-100 px-3 py-2 rounded-lg">
            <span className="inline-block h-4 w-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></span>
            <span>Deleting accounts... Please wait.</span>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex-1">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <i className="ri-search-line text-gray-400"></i>
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                placeholder="Search accounts by code or name..."
              />
            </div>
          </div>
          <div className="w-full md:w-48">
            <select
              value={selectedAccountType}
              onChange={(e) => setSelectedAccountType(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm pr-8"
            >
              {accountTypes.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Chart of Accounts */}
        <div className="bg-white rounded-lg shadow-sm border" style={{ borderColor: theme.softBorder }}>
          <div className="px-2 sm:px-4 py-2 border-b hidden md:block" style={{ borderColor: theme.softBorder, backgroundColor: theme.muted }}>
            <div className="grid grid-cols-[auto,auto,minmax(0,3fr),auto,auto,auto,auto,auto,auto] gap-x-6 text-xs font-semibold uppercase tracking-wide text-[#2f3a2f]">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={toggleSelectAll}
                />
              </div>
              <div className="text-left">Code</div>
              <div className="text-left pl-2">Account Name</div>
              <div className="text-center">Groups</div>
              <div className="text-center w-6">Level</div>
              <div className="text-center">Type</div>
              <div className="text-right">Balance</div>
              <div className="text-center">Status</div>
              <div className="text-center">Actions</div>
            </div>
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {topLevelAccounts.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <i className="ri-file-list-line text-4xl mb-4 block"></i>
                <p className="text-lg font-medium mb-2">No accounts registered</p>
                <p className="text-sm">Start by adding your first account or import an existing catalog.</p>
              </div>
            ) : (
              topLevelAccounts.map(account => renderAccountRow(account))
            )}
          </div>
        </div>

        {/* Format Selection Modal */}
        {showFormatModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[80vh] overflow-y-auto">
              <h3 className="text-lg font-semibold mb-4">Select Import Format</h3>
              <p className="text-gray-600 mb-6">Choose the accounting system format from which you want to import the chart of accounts:</p>
              <div className="grid grid-cols-1 gap-4 mb-6 max-w-md mx-auto">
                {importFormats.map((format) => (
                  <div
                    key={format.id}
                    onClick={() => handleFormatSelection(format)}
                    className="border border-gray-200 rounded-lg p-4 hover:border-blue-500 hover:shadow-md transition-all cursor-pointer"
                  >
                    <div className="flex items-center mb-2">
                      <div className={`w-10 h-10 rounded-lg ${format.color} flex items-center justify-center mr-3`}>
                        <i className={`${format.icon} text-lg`}></i>
                      </div>
                      <div>
                        <h4 className="font-medium">{format.name}</h4>
                        <p className="text-xs text-gray-500">{format.fileTypes.join(', ')}</p>
                      </div>
                    </div>
                    <p className="text-sm text-gray-600">{format.description}</p>
                  </div>
                ))}
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => setShowFormatModal(false)}
                  className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 whitespace-nowrap"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Import File Modal */}
        {showImportModal && selectedFormat && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-semibold mb-4">Import Chart from {selectedFormat.name}</h3>
              <p className="text-gray-600 mb-4">
                Select a {selectedFormat.fileTypes.join(', ')} file with the chart of accounts.
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept={selectedFormat.fileTypes.join(',')}
                onChange={handleFileImport}
                className="w-full mb-4"
              />

              <div className="flex justify-end space-x-3 mt-4">
                <button
                  onClick={() => {
                    setShowImportModal(false);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 whitespace-nowrap"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Account Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-semibold mb-4">Add New Account</h3>
              <div className="space-y-4">
                {/* Tipo primero */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                  <select
                    value={newAccount.type}
                    onChange={(e) => setNewAccount({...newAccount, type: e.target.value as any})}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                  >
                    <option value="asset">Activo</option>
                    <option value="liability">Pasivo</option>
                    <option value="equity">Patrimonio</option>
                    <option value="income">Ingreso</option>
                    <option value="cost">Costo</option>
                    <option value="expense">Gasto</option>
                  </select>
                </div>

                {/* Código + Generar */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Código</label>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={newAccount.code}
                      onChange={(e) => {
                        const value = e.target.value;
                        setNewAccount({ ...newAccount, code: value });
                      }}
                      className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Ej: 1114"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const typeFirstDigitMap: Record<ChartAccount['type'], string> = {
                          asset: '1',
                          liability: '2',
                          equity: '3',
                          income: '4',
                          cost: '5',
                          expense: '6',
                        };
                        const firstDigit = typeFirstDigitMap[newAccount.type] || '1';

                        const numericCodes = accounts
                          .map(acc => acc.code.trim())
                          .filter(code => code.startsWith(firstDigit) && /^\d+$/.test(code))
                          .map(code => parseInt(code, 10))
                          .sort((a, b) => a - b);

                        const base = parseInt(`${firstDigit}000`, 10);
                        const last = numericCodes.length > 0 ? numericCodes[numericCodes.length - 1] : base - 1;
                        const next = Math.max(last + 1, base);

                        setNewAccount(prev => ({ ...prev, code: String(next) }));
                      }}
                      className="px-3 py-2 text-sm bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 whitespace-nowrap"
                    >
                      Generar
                    </button>
                  </div>
                </div>

                {/* Nombre */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                  <input
                    type="text"
                    value={newAccount.name}
                    onChange={(e) => setNewAccount({...newAccount, name: e.target.value})}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Nombre de la cuenta"
                  />
                </div>

                {/* Cuenta Padre */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cuenta Padre</label>
                  <select
                    value={newAccount.parentId}
                    onChange={(e) => {
                      const parentId = e.target.value;
                      const level = parentId ? calculateLevel(parentId) : 1;
                      setNewAccount({
                        ...newAccount,
                        parentId,
                        level: Math.min(5, level),
                      });
                    }}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                  >
                    <option value="">Cuenta Principal</option>
                    {getParentAccounts(newAccount.type).map(account => (
                      <option key={account.id} value={account.id}>
                        {account.code} - {account.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Nivel */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nivel</label>
                  <select
                    value={String(newAccount.level)}
                    onChange={(e) => {
                      const selected = Number(e.target.value);
                      const clamped = Math.min(5, Math.max(1, selected || 1));
                      setNewAccount({
                        ...newAccount,
                        level: clamped,
                      });
                    }}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                  >
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                    <option value="5">5</option>
                  </select>
                </div>

                {/* Descripción */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                  <textarea
                    value={newAccount.description}
                    onChange={(e) => setNewAccount({...newAccount, description: e.target.value})}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    rows={3}
                    placeholder="Descripción opcional"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
                  <select
                    value={newAccount.allowPosting ? 'detail' : 'control'}
                    onChange={(e) =>
                      setNewAccount({
                        ...newAccount,
                        allowPosting: e.target.value === 'detail',
                      })
                    }
                    disabled={newAccount.level <= 2}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                  >
                    <option value="control">Control (no permite movimientos)</option>
                    <option value="detail">Detalle (permite movimientos)</option>
                  </select>
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="newIsBankAccount"
                    checked={newAccount.isBankAccount}
                    onChange={(e) =>
                      setNewAccount({
                        ...newAccount,
                        isBankAccount: e.target.checked,
                      })
                    }
                    className="mr-2"
                  />
                  <label htmlFor="newIsBankAccount" className="text-sm text-gray-700">
                    Cuenta bancaria (para módulo de Bancos)
                  </label>
                </div>
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 whitespace-nowrap"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAddAccount}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 whitespace-nowrap"
                >
                  Agregar Cuenta
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Account Modal */}
        {showEditModal && editingAccount && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-semibold mb-4">Editar Cuenta</h3>
              <div className="space-y-4">
                {/* Tipo */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                  <select
                    value={editingAccount.type}
                    onChange={(e) => setEditingAccount({ ...editingAccount, type: e.target.value as any })}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                  >
                    <option value="asset">Activo</option>
                    <option value="liability">Pasivo</option>
                    <option value="equity">Patrimonio</option>
                    <option value="income">Ingreso</option>
                    <option value="cost">Costo</option>
                    <option value="expense">Gasto</option>
                  </select>
                </div>

                {/* Código + Generar */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Código</label>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={editingAccount.code}
                      onChange={(e) => setEditingAccount({ ...editingAccount, code: e.target.value })}
                      className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const typeFirstDigitMap: Record<ChartAccount['type'], string> = {
                          asset: '1',
                          liability: '2',
                          equity: '3',
                          income: '4',
                          cost: '5',
                          expense: '6',
                        };
                        const firstDigit = typeFirstDigitMap[editingAccount.type] || '1';

                        const numericCodes = accounts
                          .map(acc => acc.code.trim())
                          .filter(code => code.startsWith(firstDigit) && /^\d+$/.test(code))
                          .map(code => parseInt(code, 10))
                          .sort((a, b) => a - b);

                        const base = parseInt(`${firstDigit}000`, 10);
                        const last = numericCodes.length > 0 ? numericCodes[numericCodes.length - 1] : base - 1;
                        const next = Math.max(last + 1, base);

                        setEditingAccount({
                          ...editingAccount,
                          code: String(next),
                        });
                      }}
                      className="px-3 py-2 text-sm bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 whitespace-nowrap"
                    >
                      Generar
                    </button>
                  </div>
                </div>

                {/* Nombre */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                  <input
                    type="text"
                    value={editingAccount.name}
                    onChange={(e) => setEditingAccount({ ...editingAccount, name: e.target.value })}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Cuenta Padre */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cuenta Padre</label>
                  <select
                    value={editingAccount.parentId || ''}
                    onChange={(e) => {
                      const parentId = e.target.value;
                      const level = parentId ? calculateLevel(parentId) : 1;
                      setEditingAccount({
                        ...editingAccount,
                        parentId,
                        level: Math.min(5, level),
                      });
                    }}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                  >
                    <option value="">Cuenta Principal</option>
                    {getParentAccounts(editingAccount.type).map(account => (
                      <option key={account.id} value={account.id}>
                        {account.code} - {account.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Nivel */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nivel</label>
                  <select
                    value={String(editingAccount.level)}
                    onChange={(e) => {
                      const level = Math.min(5, Math.max(1, Number(e.target.value) || 1));
                      setEditingAccount({
                        ...editingAccount,
                        level,
                      });
                    }}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                  >
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                    <option value="5">5</option>
                  </select>
                </div>

                {/* Descripción */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                  <textarea
                    value={editingAccount.description || ''}
                    onChange={(e) => setEditingAccount({ ...editingAccount, description: e.target.value })}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    rows={3}
                  />
                </div>

                {/* Categoría */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
                  <select
                    value={editingAccount.allowPosting ? 'detail' : 'control'}
                    onChange={(e) =>
                      setEditingAccount({
                        ...editingAccount,
                        allowPosting: e.target.value === 'detail',
                      })
                    }
                    disabled={editingAccount.level <= 2}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                  >
                    <option value="control">Control (no permite movimientos)</option>
                    <option value="detail">Detalle (permite movimientos)</option>
                  </select>
                </div>

                {/* Marca de cuenta bancaria */}
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="editIsBankAccount"
                    checked={!!editingAccount.isBankAccount}
                    onChange={(e) =>
                      setEditingAccount({
                        ...editingAccount,
                        isBankAccount: e.target.checked,
                      })
                    }
                    className="mr-2"
                  />
                  <label htmlFor="editIsBankAccount" className="text-sm text-gray-700">
                    Cuenta bancaria (para módulo de Bancos)
                  </label>
                </div>

                {/* Estado */}
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="editIsActive"
                    checked={editingAccount.isActive}
                    onChange={(e) => setEditingAccount({ ...editingAccount, isActive: e.target.checked })}
                    className="mr-2"
                  />
                  <label htmlFor="editIsActive" className="text-sm text-gray-700">
                    Cuenta activa
                  </label>
                </div>
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 whitespace-nowrap"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleEditAccount}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 whitespace-nowrap"
                >
                  Guardar Cambios
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
