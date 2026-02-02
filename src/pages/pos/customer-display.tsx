import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useAuth } from '../../hooks/useAuth';

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  total: number;
  extras?: { name: string; price: number; quantity: number }[];
}

interface CustomerDisplayData {
  cart: CartItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  taxRate: number;
  customerName?: string;
  lastAction?: 'add' | 'remove' | 'update' | 'clear';
  lastItemName?: string;
  cashierName?: string;
  registerLabel?: string;
  updatedAt?: string;
  checkoutUrl?: string;
  checkoutQrDataUrl?: string;
}

export default function CustomerDisplayPage() {
  const { user } = useAuth();
  const brandBlue = '#001B9E';
  const [data, setData] = useState<CustomerDisplayData>({
    cart: [],
    subtotal: 0,
    discount: 0,
    tax: 0,
    total: 0,
    taxRate: 18,
  });
  const [lastAddedItem, setLastAddedItem] = useState<string | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());
  const [showUnlock, setShowUnlock] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockError, setUnlockError] = useState<string>('');
  const [isUnlocking, setIsUnlocking] = useState(false);

  const supabaseUrl = useMemo(() => import.meta.env.VITE_PUBLIC_SUPABASE_URL as string | undefined, []);
  const supabaseAnonKey = useMemo(
    () => import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string | undefined,
    [],
  );

  useEffect(() => {
    // Load initial state (important when the customer display opens after items already exist in the cart)
    try {
      const saved = localStorage.getItem('pos_customer_display_state');
      if (saved) {
        setData(JSON.parse(saved));
      }
    } catch {}

    // Listen for updates from POS via BroadcastChannel
    const channel = new BroadcastChannel('pos_customer_display');
    
    channel.onmessage = (event) => {
      const newData = event.data as CustomerDisplayData;
      setData(newData);
      
      // Highlight last added item
      if (newData.lastAction === 'add' && newData.lastItemName) {
        setLastAddedItem(newData.lastItemName);
        setTimeout(() => setLastAddedItem(null), 1500);
      }
    };

    // Also listen for localStorage updates (backup channel)
    const onStorage = (e: StorageEvent) => {
      if (e.key !== 'pos_customer_display_state' || !e.newValue) return;
      try {
        const newData = JSON.parse(e.newValue) as CustomerDisplayData;
        setData(newData);
      } catch {}
    };
    window.addEventListener('storage', onStorage);

    return () => {
      channel.close();
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const formatMoney = (value: number) => {
    const n = Number(value) || 0;
    return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getTotalItems = () => data.cart.reduce((sum, item) => sum + item.quantity, 0);

  const formatUpdatedAt = (_iso?: string) => now.toLocaleDateString('en-US');

  const formatNow = () => {
    const d = now;
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        setShowUnlock(true);
        setUnlockPassword('');
        setUnlockError('');
        return;
      }
      await document.documentElement.requestFullscreen();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[CustomerDisplay] Failed to toggle fullscreen', error);
    }
  };

  const handleUnlock = async () => {
    if (!user?.email) {
      setUnlockError('No user session found. Please login again.');
      return;
    }
    if (!unlockPassword.trim()) {
      setUnlockError('Password is required.');
      return;
    }
    if (!supabaseUrl || !supabaseAnonKey) {
      setUnlockError('Supabase is not configured.');
      return;
    }

    setIsUnlocking(true);
    setUnlockError('');
    try {
      const tempSupabase = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });

      const { error } = await tempSupabase.auth.signInWithPassword({
        email: user.email,
        password: unlockPassword,
      });

      if (error) {
        setUnlockError('Invalid password.');
        return;
      }

      try {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
        }
      } catch {
        setUnlockError('Could not exit fullscreen.');
        return;
      }

      setShowUnlock(false);
      setUnlockPassword('');
      setUnlockError('');
    } catch {
      setUnlockError('Could not verify password.');
    } finally {
      setIsUnlocking(false);
    }
  };

  return (
    <div
      className="min-h-screen text-gray-900 flex flex-col"
      style={{ background: '#f3f6fb' }}
      onDoubleClick={toggleFullscreen}
      role="presentation"
    >
      {/* Header */}
      <header className="px-6 pt-6 pb-4">
        <div className="max-w-6xl mx-auto flex items-start justify-between gap-6">
          <div>
            <div className="text-2xl font-semibold text-gray-900">Current order</div>
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              <span
                className="px-3 py-1 rounded-full border border-white/15 text-white"
                style={{ background: brandBlue }}
              >
                {data.registerLabel || 'Register #1'}
              </span>
              <span
                className="px-3 py-1 rounded-full border border-white/15 text-white"
                style={{ background: brandBlue }}
              >
                {data.cashierName ? `Cashier: ${data.cashierName}` : 'Cashier'}
              </span>
              {data.customerName ? (
                <span
                  className="px-3 py-1 rounded-full border border-white/15 text-white"
                  style={{ background: brandBlue }}
                >
                  {data.customerName}
                </span>
              ) : null}
              <span
                className="px-3 py-1 rounded-full border border-white/15 text-white"
                style={{ background: brandBlue }}
              >
                {data.updatedAt ? `Date: ${formatUpdatedAt(data.updatedAt)}` : `Date: ${formatUpdatedAt()}`}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="bg-white border border-gray-200 rounded-2xl px-5 py-3 shadow-sm text-center min-w-[120px]">
              <div className="text-xs text-gray-500">Items</div>
              <div className="text-3xl font-semibold" style={{ color: brandBlue }}>{getTotalItems()}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl px-5 py-3 shadow-sm text-center min-w-[140px]">
              <div className="text-xs text-gray-500">Total</div>
              <div className="text-3xl font-semibold" style={{ color: brandBlue }}>{formatMoney(data.total)}</div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 px-6 pb-8">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Items list */}
          <section className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="font-semibold text-gray-900">Order items</div>
              <div className="text-sm text-gray-500">Updated {formatNow()}</div>
            </div>

            {data.cart.length === 0 ? (
              <div className="py-16 flex flex-col items-center justify-center text-center">
                <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-5">
                  <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                </div>
                <div className="text-xl font-semibold text-gray-900">Waiting for items…</div>
                <div className="text-gray-600 mt-1">Products will appear here as they are added</div>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {data.cart.map((item, index) => (
                  <div
                    key={`${item.id}-${index}`}
                    className={`px-6 py-5 flex items-center justify-between transition-colors ${
                      lastAddedItem === item.name ? 'bg-blue-50' : 'bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-12 h-12 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-400">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0H4m16 0l1 7H3l1-7" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-900 truncate">{item.name}</div>
                        <div className="text-sm text-gray-500">{formatMoney(item.price)} each</div>
                        {item.extras && item.extras.length > 0 ? (
                          <div className="text-sm mt-1" style={{ color: brandBlue }}>
                            + {item.extras.map((e) => `${e.name} (${e.quantity})`).join(', ')}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="bg-white border border-gray-200 rounded-xl px-4 py-2 text-center min-w-[70px]">
                        <div className="text-[10px] uppercase tracking-wider text-gray-500">Qty</div>
                        <div className="text-lg font-semibold text-gray-900">{item.quantity}</div>
                      </div>
                      <div className="bg-white border border-gray-200 rounded-xl px-4 py-2 text-right min-w-[110px]">
                        <div className="text-[10px] uppercase tracking-wider text-gray-500">Amount</div>
                        <div className="text-lg font-semibold" style={{ color: brandBlue }}>
                          {formatMoney(item.total)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Totals card */}
          <aside className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <div className="text-sm text-gray-500">Totals</div>
              <div className="text-lg font-semibold text-gray-900">To pay</div>
            </div>
            <div className="p-6 space-y-3">
              <div className="flex items-center justify-between text-gray-600">
                <span>Subtotal</span>
                <span className="font-medium text-gray-900">{formatMoney(data.subtotal)}</span>
              </div>
              {data.discount > 0 ? (
                <div className="flex items-center justify-between text-gray-600">
                  <span>Discount</span>
                  <span className="font-medium text-gray-900">-{formatMoney(data.discount)}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between text-gray-600">
                <span>Sales Tax</span>
                <span className="font-medium text-gray-900">{formatMoney(data.tax)}</span>
              </div>
              <div className="pt-4 mt-4 border-t border-gray-100 flex items-center justify-between">
                <div className="text-sm font-semibold text-gray-900">TOTAL</div>
                <div className="text-3xl font-semibold" style={{ color: brandBlue }}>
                  {formatMoney(data.total)}
                </div>
              </div>

              {data.checkoutQrDataUrl ? (
                <div className="pt-5 mt-4 border-t border-gray-100 flex items-end justify-between gap-4">
                  <div className="text-sm text-gray-600 leading-snug">
                    <div className="font-semibold text-gray-900">Get your invoice by email</div>
                    <div className="text-gray-600">Scan the QR code and enter your details.</div>
                  </div>
                  <div className="w-[140px] h-[140px] rounded-[24px] bg-white shadow-[0_18px_40px_rgba(15,23,42,0.18)] border border-gray-200 p-[8px]">
                    <div className="w-full h-full rounded-[18px] bg-white overflow-hidden flex items-center justify-center p-[6px]">
                      <img src={data.checkoutQrDataUrl} alt="QR" className="w-full h-full object-contain" />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      </main>

      {showUnlock && (
        <div className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
            <div className="p-5 border-b border-gray-200">
              <div className="text-lg font-semibold text-gray-900">Unlock</div>
              <div className="text-sm text-gray-600">
                Enter your password to exit fullscreen.
              </div>
            </div>
            <div className="p-5 space-y-3">
              <div className="space-y-1">
                <div className="text-xs text-gray-500">User</div>
                <div className="text-sm font-medium text-gray-900 truncate">{user?.email || '—'}</div>
              </div>
              <input
                type="password"
                value={unlockPassword}
                onChange={(e) => setUnlockPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleUnlock();
                }}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#001B9E]"
                placeholder="Password"
                autoFocus
              />
              {unlockError ? <div className="text-sm text-red-600">{unlockError}</div> : null}
              <button
                type="button"
                onClick={handleUnlock}
                disabled={isUnlocking}
                className="w-full px-4 py-3 bg-[#001B9E] text-white rounded-xl hover:bg-[#001587] transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isUnlocking ? 'Unlocking...' : 'Unlock'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
