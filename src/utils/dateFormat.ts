export type DateFormatSettings = {
  date_format?: string | null;
};

let globalDateFormat: string = 'DD/MM/YYYY';

export const setGlobalDateFormatSettings = (settings: DateFormatSettings) => {
  const fmt = String(settings?.date_format || '').trim();
  if (fmt) globalDateFormat = fmt;
};

const pad2 = (n: number) => String(n).padStart(2, '0');

export const formatDate = (value: string | Date | null | undefined): string => {
  if (!value) return '';

  let d: Date;
  
  // Si es un string en formato ISO (YYYY-MM-DD), parsearlo manualmente para evitar problemas de zona horaria
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const [year, month, day] = value.split('T')[0].split('-').map(Number);
    d = new Date(year, month - 1, day);
  } else {
    d = value instanceof Date ? value : new Date(value);
  }
  
  if (Number.isNaN(d.getTime())) return '';

  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());

  switch (globalDateFormat) {
    case 'YYYY-MM-DD':
      return `${yyyy}-${mm}-${dd}`;
    case 'MM/DD/YYYY':
      return `${mm}/${dd}/${yyyy}`;
    case 'DD/MM/YYYY':
    default:
      return `${dd}/${mm}/${yyyy}`;
  }
};
