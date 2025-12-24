/* ==========================================================
   Tipo de Gasto 606 - Utilidades DGII
   
   Catálogo oficial de tipos de bienes y servicios según DGII
   para el Formato 606 (Compras de Bienes y Servicios)
========================================================== */

// Códigos oficiales DGII (01-11)
export const EXPENSE_TYPES_606 = [
  { code: '01', name: 'Gastos de Personal', category: 'servicios' },
  { code: '02', name: 'Gastos por Trabajos, Suministros y Servicios', category: 'servicios' },
  { code: '03', name: 'Arrendamientos', category: 'servicios' },
  { code: '04', name: 'Gastos de Activos Fijos', category: 'bienes' },
  { code: '05', name: 'Gastos de Representación', category: 'servicios' },
  { code: '06', name: 'Otras Deducciones Admitidas', category: 'servicios' },
  { code: '07', name: 'Gastos Financieros', category: 'servicios' },
  { code: '08', name: 'Gastos Extraordinarios', category: 'bienes' },
  { code: '09', name: 'Compras y Gastos que formarán parte del Costo de Venta', category: 'bienes' },
  { code: '10', name: 'Adquisiciones de Activos', category: 'bienes' },
  { code: '11', name: 'Gastos de Seguros', category: 'servicios' },
] as const;

// Lista formateada para selects
export const EXPENSE_TYPES_606_OPTIONS = EXPENSE_TYPES_606.map(
  (t) => `${t.code} - ${t.name}`
);

// Tipos que corresponden a SERVICIOS (columna 8)
export const SERVICE_EXPENSE_CODES = ['01', '02', '03', '05', '06', '07', '11'];

// Tipos que corresponden a BIENES (columna 9)
export const GOODS_EXPENSE_CODES = ['04', '08', '09', '10'];

// Configuración de tratamiento del ITBIS por tipo de gasto
export interface ItbisTreatment {
  adelantar: boolean;      // Columna 15 - ITBIS por Adelantar
  alCosto: boolean;        // Columna 14 - ITBIS llevado al Costo
  proporcionalidad: boolean; // Columna 13 - ITBIS sujeto a Proporcionalidad
}

// Mapeo de tratamiento del ITBIS según tipo de gasto
export const ITBIS_TREATMENT_BY_TYPE: Record<string, ItbisTreatment> = {
  '01': { adelantar: true, alCosto: false, proporcionalidad: false },  // Personal - adelantar
  '02': { adelantar: true, alCosto: false, proporcionalidad: false },  // Trabajos/Servicios - adelantar
  '03': { adelantar: true, alCosto: false, proporcionalidad: false },  // Arrendamientos - adelantar
  '04': { adelantar: false, alCosto: true, proporcionalidad: false },  // Activos Fijos - al costo
  '05': { adelantar: false, alCosto: false, proporcionalidad: true },  // Representación - proporcionalidad
  '06': { adelantar: true, alCosto: false, proporcionalidad: false },  // Otras Deducciones - adelantar
  '07': { adelantar: false, alCosto: true, proporcionalidad: false },  // Financieros - al costo (no deducible)
  '08': { adelantar: false, alCosto: true, proporcionalidad: false },  // Extraordinarios - al costo
  '09': { adelantar: false, alCosto: true, proporcionalidad: false },  // Costo de Venta - al costo
  '10': { adelantar: false, alCosto: true, proporcionalidad: false },  // Adquisición Activos - al costo
  '11': { adelantar: true, alCosto: false, proporcionalidad: false },  // Seguros - adelantar
};

/**
 * Extrae el código de 2 dígitos del tipo de gasto
 */
export function extractExpenseCode(expenseType: string | null | undefined): string {
  if (!expenseType) return '';
  const match = String(expenseType).trim().match(/^(\d{2})/);
  return match ? match[1] : '';
}

/**
 * Valida si el tipo de gasto es válido (01-11)
 */
export function isValidExpenseType606(expenseType: string | null | undefined): boolean {
  const code = extractExpenseCode(expenseType);
  return EXPENSE_TYPES_606.some((t) => t.code === code);
}

/**
 * Determina si el tipo de gasto corresponde a servicios
 */
export function isServiceExpense(expenseType: string | null | undefined): boolean {
  const code = extractExpenseCode(expenseType);
  return SERVICE_EXPENSE_CODES.includes(code);
}

/**
 * Determina si el tipo de gasto corresponde a bienes
 */
export function isGoodsExpense(expenseType: string | null | undefined): boolean {
  const code = extractExpenseCode(expenseType);
  return GOODS_EXPENSE_CODES.includes(code);
}

/**
 * Obtiene el tratamiento del ITBIS según el tipo de gasto
 */
export function getItbisTreatment(expenseType: string | null | undefined): ItbisTreatment {
  const code = extractExpenseCode(expenseType);
  return ITBIS_TREATMENT_BY_TYPE[code] || { adelantar: false, alCosto: false, proporcionalidad: false };
}

/**
 * Distribuye el monto entre servicios y bienes según el tipo de gasto
 */
export function distributeAmount(
  expenseType: string | null | undefined,
  amount: number
): { servicios: number; bienes: number } {
  if (isServiceExpense(expenseType)) {
    return { servicios: amount, bienes: 0 };
  }
  if (isGoodsExpense(expenseType)) {
    return { servicios: 0, bienes: amount };
  }
  // Si no está especificado, poner en servicios por defecto
  return { servicios: amount, bienes: 0 };
}

/**
 * Distribuye el ITBIS según el tipo de gasto a las columnas correspondientes
 */
export function distributeItbis(
  expenseType: string | null | undefined,
  itbisFacturado: number,
  itbisToCost: boolean = false
): {
  itbisProporcionalidad: number;  // Columna 13
  itbisAlCosto: number;           // Columna 14
  itbisPorAdelantar: number;      // Columna 15
} {
  // Si el usuario marcó explícitamente que el ITBIS va al costo
  if (itbisToCost) {
    return {
      itbisProporcionalidad: 0,
      itbisAlCosto: itbisFacturado,
      itbisPorAdelantar: 0,
    };
  }

  const treatment = getItbisTreatment(expenseType);

  if (treatment.proporcionalidad) {
    return {
      itbisProporcionalidad: itbisFacturado,
      itbisAlCosto: 0,
      itbisPorAdelantar: 0,
    };
  }

  if (treatment.alCosto) {
    return {
      itbisProporcionalidad: 0,
      itbisAlCosto: itbisFacturado,
      itbisPorAdelantar: 0,
    };
  }

  // Por defecto: adelantar
  return {
    itbisProporcionalidad: 0,
    itbisAlCosto: 0,
    itbisPorAdelantar: itbisFacturado,
  };
}

/**
 * Valida que el ITBIS retenido no exceda el ITBIS facturado
 */
export function validateItbisRetention(
  itbisFacturado: number,
  itbisRetenido: number
): { valid: boolean; message: string } {
  if (itbisRetenido > itbisFacturado) {
    return {
      valid: false,
      message: `El ITBIS retenido (${itbisRetenido.toFixed(2)}) no puede exceder el ITBIS facturado (${itbisFacturado.toFixed(2)})`,
    };
  }
  return { valid: true, message: '' };
}

/**
 * Valida un registro completo para el 606
 */
export function validateReport606Record(record: {
  ncf?: string;
  expenseType606?: string;
  itbisFacturado?: number;
  itbisRetenido?: number;
  rnc?: string;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validar NCF presente
  if (!record.ncf || String(record.ncf).trim() === '') {
    errors.push('El NCF es requerido');
  }

  // Validar tipo de gasto presente y válido
  if (!record.expenseType606 || String(record.expenseType606).trim() === '') {
    errors.push('El Tipo de Gasto 606 es requerido para el reporte DGII');
  } else if (!isValidExpenseType606(record.expenseType606)) {
    errors.push(`El Tipo de Gasto "${record.expenseType606}" no es válido (debe ser 01-11)`);
  }

  // Validar ITBIS
  const itbisFacturado = Number(record.itbisFacturado) || 0;
  const itbisRetenido = Number(record.itbisRetenido) || 0;
  const itbisValidation = validateItbisRetention(itbisFacturado, itbisRetenido);
  if (!itbisValidation.valid) {
    errors.push(itbisValidation.message);
  }

  // Validar RNC/Cédula
  if (!record.rnc || String(record.rnc).trim() === '') {
    errors.push('El RNC o Cédula del proveedor es requerido');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Normaliza el valor del tipo de gasto al formato estándar
 */
export function normalizeExpenseType606(value: string | null | undefined): string {
  if (!value) return '';
  const raw = String(value).trim();
  if (!raw) return '';

  const code = extractExpenseCode(raw);
  if (!code) return raw;

  const found = EXPENSE_TYPES_606.find((t) => t.code === code);
  if (found) {
    return `${found.code} - ${found.name}`;
  }

  return raw;
}

/**
 * Obtiene el nombre descriptivo del tipo de gasto
 */
export function getExpenseTypeName(expenseType: string | null | undefined): string {
  const code = extractExpenseCode(expenseType);
  const found = EXPENSE_TYPES_606.find((t) => t.code === code);
  return found ? found.name : '';
}

/**
 * Verifica si un registro tiene tipo de gasto sin especificar
 */
export function hasUnspecifiedExpenseType(expenseType: string | null | undefined): boolean {
  if (!expenseType) return true;
  const trimmed = String(expenseType).trim().toLowerCase();
  return trimmed === '' || trimmed === 'sin especificar' || !isValidExpenseType606(expenseType);
}
