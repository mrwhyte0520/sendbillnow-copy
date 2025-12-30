import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { settingsService } from '../services/database';
import { setGlobalAccountingFormatSettings } from '../utils/numberFormat';
import { setGlobalDateFormatSettings } from '../utils/dateFormat';

export type AccountingFormatSettings = {
  default_currency?: string | null;
  decimal_places?: number | null;
  date_format?: string | null;
  number_format?: string | null;
};

type AccountingFormatContextValue = {
  settings: AccountingFormatSettings;
  loading: boolean;
  refresh: () => Promise<void>;
};

const AccountingFormatContext = createContext<AccountingFormatContextValue | null>(null);

export function AccountingFormatProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<AccountingFormatSettings>({
    default_currency: 'DOP',
    decimal_places: 2,
    date_format: 'MM/DD/YYYY',
    number_format: '1,234.56',
  });
  const [loading, setLoading] = useState(false);

  const applyGlobals = useCallback((s: AccountingFormatSettings) => {
    setGlobalAccountingFormatSettings(s);
    setGlobalDateFormatSettings(s);
  }, []);

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const data = await settingsService.getAccountingSettings(user.id);
      if (data) {
        const next: AccountingFormatSettings = {
          default_currency: (data as any).default_currency ?? 'DOP',
          decimal_places: (data as any).decimal_places ?? 2,
          date_format: (data as any).date_format ?? 'MM/DD/YYYY',
          number_format: (data as any).number_format ?? '1,234.56',
        };
        setSettings(next);
        applyGlobals(next);
      } else {
        const defaultSettings: AccountingFormatSettings = {
          default_currency: 'DOP',
          decimal_places: 2,
          date_format: 'MM/DD/YYYY',
          number_format: '1,234.56',
        };
        setSettings(defaultSettings);
        applyGlobals(defaultSettings);
      }
    } finally {
      setLoading(false);
    }
  }, [applyGlobals, user?.id]);

  useEffect(() => {
    if (!user?.id) {
      applyGlobals(settings);
      return;
    }

    refresh();
  }, [user?.id]);

  const value = useMemo<AccountingFormatContextValue>(
    () => ({
      settings,
      loading,
      refresh,
    }),
    [settings, loading],
  );

  return <AccountingFormatContext.Provider value={value}>{children}</AccountingFormatContext.Provider>;
}

export function useAccountingFormat() {
  const ctx = useContext(AccountingFormatContext);
  if (!ctx) {
    return {
      settings: {
        default_currency: 'DOP',
        decimal_places: 2,
        date_format: 'MM/DD/YYYY',
        number_format: '1,234.56',
      },
      loading: false,
      refresh: async () => {},
    } as AccountingFormatContextValue;
  }
  return ctx;
}
