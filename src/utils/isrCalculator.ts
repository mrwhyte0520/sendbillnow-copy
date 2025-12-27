/**
 * Calculadora de Impuesto Sobre la Renta (ISR) para Personas Físicas
 * Conforme a la escala anual vigente de la DGII - República Dominicana
 * 
 * Escala Anual Vigente:
 * - Hasta RD$416,220.00: Exento (0%)
 * - RD$416,220.01 - RD$624,329.00: 15% sobre excedente de RD$416,220.01
 * - RD$624,329.01 - RD$867,123.00: RD$31,216.00 + 20% sobre excedente de RD$624,329.01
 * - Más de RD$867,123.00: RD$79,776.00 + 25% sobre excedente de RD$867,123.00
 */

export interface ISRBracket {
  id?: string;
  min_amount: number;
  max_amount: number | null; // null = sin límite
  rate_percent: number;
  fixed_amount: number;
  description?: string;
}

// Tramos fiscales por defecto según DGII (Año Fiscal 2024-2025)
export const DEFAULT_ISR_BRACKETS: ISRBracket[] = [
  {
    min_amount: 0,
    max_amount: 416220.00,
    rate_percent: 0,
    fixed_amount: 0,
    description: 'Renta exenta'
  },
  {
    min_amount: 416220.01,
    max_amount: 624329.00,
    rate_percent: 15,
    fixed_amount: 0,
    description: '15% sobre excedente de RD$416,220.01'
  },
  {
    min_amount: 624329.01,
    max_amount: 867123.00,
    rate_percent: 20,
    fixed_amount: 31216.00,
    description: 'RD$31,216.00 + 20% sobre excedente de RD$624,329.01'
  },
  {
    min_amount: 867123.01,
    max_amount: null, // Sin límite superior
    rate_percent: 25,
    fixed_amount: 79776.00,
    description: 'RD$79,776.00 + 25% sobre excedente de RD$867,123.00'
  }
];

// Tramos mensuales (para retención mensual de nómina)
// Valores anuales divididos entre 12
export const DEFAULT_ISR_BRACKETS_MONTHLY: ISRBracket[] = [
  {
    min_amount: 0,
    max_amount: 34685.00, // 416,220 / 12
    rate_percent: 0,
    fixed_amount: 0,
    description: 'Renta exenta (mensual)'
  },
  {
    min_amount: 34685.01,
    max_amount: 52027.42, // 624,329 / 12
    rate_percent: 15,
    fixed_amount: 0,
    description: '15% sobre excedente de RD$34,685.01'
  },
  {
    min_amount: 52027.43,
    max_amount: 72260.25, // 867,123 / 12
    rate_percent: 20,
    fixed_amount: 2601.33, // 31,216 / 12
    description: 'RD$2,601.33 + 20% sobre excedente de RD$52,027.43'
  },
  {
    min_amount: 72260.26,
    max_amount: null,
    rate_percent: 25,
    fixed_amount: 6648.00, // 79,776 / 12
    description: 'RD$6,648.00 + 25% sobre excedente de RD$72,260.26'
  }
];

export interface ISRCalculationResult {
  taxableIncome: number;        // Renta gravable
  bracket: ISRBracket | null;   // Tramo aplicado
  bracketDescription: string;   // Descripción del tramo
  fixedAmount: number;          // Monto fijo del tramo
  excessAmount: number;         // Excedente sobre el mínimo del tramo
  variableAmount: number;       // Impuesto variable (excedente * tasa)
  totalISR: number;             // ISR total calculado
  effectiveRate: number;        // Tasa efectiva (ISR / renta gravable * 100)
  monthlyRetention: number;     // Retención mensual (ISR anual / 12)
}

/**
 * Calcula el ISR anual para una renta gravable dada
 * @param taxableIncome Renta gravable anual en RD$
 * @param brackets Tramos fiscales a usar (opcional, usa los por defecto de DGII)
 * @returns Resultado detallado del cálculo
 */
export function calculateAnnualISR(
  taxableIncome: number,
  brackets: ISRBracket[] = DEFAULT_ISR_BRACKETS
): ISRCalculationResult {
  // Validar entrada
  if (!Number.isFinite(taxableIncome) || taxableIncome <= 0) {
    return {
      taxableIncome: 0,
      bracket: null,
      bracketDescription: 'Sin renta gravable',
      fixedAmount: 0,
      excessAmount: 0,
      variableAmount: 0,
      totalISR: 0,
      effectiveRate: 0,
      monthlyRetention: 0
    };
  }

  // Encontrar el tramo correspondiente
  const bracket = brackets.find(b => {
    const min = b.min_amount;
    const max = b.max_amount !== null ? b.max_amount : Number.POSITIVE_INFINITY;
    return taxableIncome >= min && taxableIncome <= max;
  });

  if (!bracket) {
    // Si no se encuentra tramo, usar el último (sin límite superior)
    const lastBracket = brackets[brackets.length - 1];
    if (lastBracket && taxableIncome >= lastBracket.min_amount) {
      return calculateWithBracket(taxableIncome, lastBracket);
    }
    
    return {
      taxableIncome,
      bracket: null,
      bracketDescription: 'No se encontró tramo aplicable',
      fixedAmount: 0,
      excessAmount: 0,
      variableAmount: 0,
      totalISR: 0,
      effectiveRate: 0,
      monthlyRetention: 0
    };
  }

  return calculateWithBracket(taxableIncome, bracket);
}

/**
 * Calcula el ISR usando un tramo específico
 */
function calculateWithBracket(taxableIncome: number, bracket: ISRBracket): ISRCalculationResult {
  const fixedAmount = bracket.fixed_amount;
  const excessAmount = Math.max(0, taxableIncome - bracket.min_amount);
  const variableAmount = excessAmount * (bracket.rate_percent / 100);
  const totalISR = fixedAmount + variableAmount;
  const effectiveRate = taxableIncome > 0 ? (totalISR / taxableIncome) * 100 : 0;
  const monthlyRetention = totalISR / 12;

  return {
    taxableIncome,
    bracket,
    bracketDescription: bracket.description || `${bracket.rate_percent}% sobre excedente`,
    fixedAmount,
    excessAmount,
    variableAmount,
    totalISR: Math.round(totalISR * 100) / 100, // Redondear a 2 decimales
    effectiveRate: Math.round(effectiveRate * 100) / 100,
    monthlyRetention: Math.round(monthlyRetention * 100) / 100
  };
}

/**
 * Calcula el ISR mensual para una renta gravable mensual
 * Útil para retención de nómina mensual
 * @param monthlyTaxableIncome Renta gravable mensual en RD$
 * @param brackets Tramos fiscales mensuales (opcional)
 * @returns ISR mensual a retener
 */
export function calculateMonthlyISR(
  monthlyTaxableIncome: number,
  brackets: ISRBracket[] = DEFAULT_ISR_BRACKETS_MONTHLY
): number {
  const result = calculateAnnualISR(monthlyTaxableIncome, brackets);
  return result.totalISR;
}

/**
 * Calcula el ISR anual proyectado desde un salario mensual
 * @param monthlySalary Salario mensual bruto
 * @param monthlyDeductions Deducciones mensuales (TSS, etc.)
 * @returns Resultado del cálculo anual proyectado
 */
export function calculateProjectedAnnualISR(
  monthlySalary: number,
  monthlyDeductions: number = 0
): ISRCalculationResult {
  const monthlyTaxable = Math.max(0, monthlySalary - monthlyDeductions);
  const annualTaxable = monthlyTaxable * 12;
  return calculateAnnualISR(annualTaxable);
}

/**
 * Obtiene la retención mensual recomendada basada en el salario
 * @param monthlySalary Salario mensual bruto
 * @param monthlyDeductions Deducciones mensuales (TSS, etc.)
 * @returns Monto de retención mensual
 */
export function getMonthlyRetention(
  monthlySalary: number,
  monthlyDeductions: number = 0
): number {
  const result = calculateProjectedAnnualISR(monthlySalary, monthlyDeductions);
  return result.monthlyRetention;
}

/**
 * Formatea el resultado del cálculo para mostrar al usuario
 */
export function formatISRResult(result: ISRCalculationResult): string {
  if (result.totalISR === 0) {
    return 'Exento de ISR';
  }
  
  return `ISR Anual: RD$${result.totalISR.toLocaleString('es-DO', { minimumFractionDigits: 2 })} | ` +
         `Retención Mensual: RD$${result.monthlyRetention.toLocaleString('es-DO', { minimumFractionDigits: 2 })} | ` +
         `Tasa Efectiva: ${result.effectiveRate.toFixed(2)}%`;
}

/**
 * Determina el tramo fiscal para un monto dado
 * @param amount Monto a evaluar
 * @param brackets Tramos fiscales
 * @returns Índice del tramo (0-3) o -1 si no aplica
 */
export function getBracketIndex(
  amount: number,
  brackets: ISRBracket[] = DEFAULT_ISR_BRACKETS
): number {
  for (let i = 0; i < brackets.length; i++) {
    const b = brackets[i];
    const max = b.max_amount !== null ? b.max_amount : Number.POSITIVE_INFINITY;
    if (amount >= b.min_amount && amount <= max) {
      return i;
    }
  }
  return -1;
}

/**
 * Obtiene el nombre descriptivo del tramo
 */
export function getBracketName(index: number): string {
  const names = [
    'Exento',
    'Tramo 1 (15%)',
    'Tramo 2 (20%)',
    'Tramo 3 (25%)'
  ];
  return names[index] || 'Desconocido';
}
