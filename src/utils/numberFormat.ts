export type FormatNumberOptions = {
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
};

export type GlobalAccountingFormatSettings = {
  default_currency?: string | null;
  decimal_places?: number | null;
  number_format?: string | null;
};

type NumberSeparators = { thousand: string; decimal: string };

let globalDecimalPlaces: number = 2;
let globalSeparators: NumberSeparators = { thousand: ',', decimal: '.' };
let globalCurrencyLabel: string = 'RD$';

const parseSeparators = (format: string | null | undefined): NumberSeparators => {
  const fmt = String(format || '').trim();
  if (fmt === '1.234,56') return { thousand: '.', decimal: ',' };
  if (fmt === '1 234.56') return { thousand: ' ', decimal: '.' };
  return { thousand: ',', decimal: '.' };
};

const resolveCurrencyLabel = (currency: string | null | undefined): string => {
  const c = String(currency || '').toUpperCase();
  if (c === 'USD') return 'US$';
  if (c === 'EUR') return '€';
  if (c === 'DOP') return '';
  return c || 'RD$';
};

export const getCurrencyPrefix = (
  currency: string | null | undefined,
  options?: { forTotals?: boolean },
): string => {
  const c = String(currency || '').toUpperCase();
  if (c === 'DOP') {
    return options?.forTotals ? 'RD$' : '';
  }
  return resolveCurrencyLabel(c);
};

export const setGlobalAccountingFormatSettings = (settings: GlobalAccountingFormatSettings) => {
  const decimals = Number(settings?.decimal_places);
  if (Number.isFinite(decimals) && decimals >= 0 && decimals <= 6) {
    globalDecimalPlaces = decimals;
  }
  globalSeparators = parseSeparators(settings?.number_format);
  globalCurrencyLabel = resolveCurrencyLabel(settings?.default_currency);
};

const insertThousands = (intPart: string, thousandSep: string): string => {
  const sign = intPart.startsWith('-') ? '-' : '';
  const digits = sign ? intPart.slice(1) : intPart;
  const out = digits.replace(/\B(?=(\d{3})+(?!\d))/g, thousandSep);
  return sign + out;
};

const formatBySeparators = (numeric: number, decimals: number, sep: NumberSeparators): string => {
  const fixed = numeric.toFixed(decimals);
  const [intPart, fracPart] = fixed.split('.');
  const intFormatted = insertThousands(intPart, sep.thousand);
  if (decimals <= 0) return intFormatted;
  return `${intFormatted}${sep.decimal}${fracPart || ''}`;
};

export const formatNumber = (
  value: number | string | null | undefined,
  options?: FormatNumberOptions,
): string => {
  if (value == null || value === '') return '';

  const numeric = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(numeric)) return '';

  const minimumFractionDigits = options?.minimumFractionDigits ?? globalDecimalPlaces;
  const maximumFractionDigits = options?.maximumFractionDigits ?? globalDecimalPlaces;
  const decimals = Math.max(minimumFractionDigits, maximumFractionDigits);
  return formatBySeparators(numeric, decimals, globalSeparators);
};

export const formatAmount = (value: number | string | null | undefined): string => {
  return formatNumber(value, { minimumFractionDigits: globalDecimalPlaces, maximumFractionDigits: globalDecimalPlaces });
};

export const formatMoney = (
  value: number | string | null | undefined,
  currencyLabel?: string,
): string => {
  const amount = formatAmount(value);
  if (!amount) return '';
  const label = currencyLabel ?? globalCurrencyLabel;
  if (!label) return amount;
  return `${label} ${amount}`;
};
