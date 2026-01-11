import { useEffect, useMemo, useState } from 'react';
import { bankAccountsService } from '../services/database';
import { isBanksModuleEnabled } from '../config/featureFlags';

export interface BankCatalogEntry {
  id: string;
  bank_name?: string;
  account_number?: string;
  account_type?: string;
  currency?: string;
  bank_code?: string;
  swift_bic?: string;
  contact_info?: string;
  chart_account_id?: string | null;
  is_active?: boolean;
  [key: string]: any;
}

const DEFAULT_BANK_PLACEHOLDER: BankCatalogEntry[] = [
  {
    id: 'placeholder-bank',
    bank_name: 'Bank module disabled',
    account_number: '000-0000000-0',
    currency: 'DOP',
    is_active: true,
  },
];

interface UseBankCatalogOptions {
  userId?: string | null;
  mockBanks?: BankCatalogEntry[];
}

export const useBankCatalog = (options?: UseBankCatalogOptions) => {
  const { userId = null, mockBanks } = options || {};
  const featureEnabled = isBanksModuleEnabled();
  const [banks, setBanks] = useState<BankCatalogEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  const fallbackBanks = useMemo(() => mockBanks || DEFAULT_BANK_PLACEHOLDER, [mockBanks]);

  useEffect(() => {
    if (!featureEnabled) {
      setBanks(fallbackBanks);
      setIsLoading(false);
      setError(null);
      return;
    }

    if (!userId) {
      setBanks([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    bankAccountsService
      .getAll(userId)
      .then((rows) => {
        if (cancelled) return;
        setBanks((rows as BankCatalogEntry[]) || []);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('useBankCatalog: error loading bank accounts', err);
        setError(err as Error);
        setBanks([]);
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, featureEnabled, fallbackBanks]);

  return {
    banks,
    isLoading,
    error,
    featureEnabled,
    isDisabled: !featureEnabled,
  };
};
