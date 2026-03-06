
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

async function postWebnotiPlanPurchaseEvent() {
  try {
    const { data } = await supabase.auth.getSession();
    const accessToken = data?.session?.access_token;
    if (!accessToken) return;

    const apiBase = import.meta.env.VITE_API_BASE_URL?.trim() || '';

    await fetch(`${apiBase}/api/webnoti/event`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        access_token: accessToken,
        event: 'plan_purchase',
        target: 'user',
      }),
    });
  } catch {
    // ignore
  }
}

interface Plan {
  id: string;
  name: string;
  price: number;
  features: string[];
  active: boolean;
  color?: string;
  icon?: string;
}

interface TrialInfo {
  isActive: boolean;
  daysLeft: number;
  hoursLeft: number;
  minutesLeft: number;
  startDate: Date;
  endDate: Date;
  hasExpired: boolean;
}

function getPlanPrice(planId: string): number {
  const prices: Record<string, number> = {
    'pyme': 39.99,
    'pro': 99.99,
    'plus': 199.99,
    'facturacion-simple': 19.99,
    'facturacion-premium': 29.99,
    'pos-basic': 99.99,
    'pos-premium': 399.99,
    'student': 85.0,
  };
  return prices[planId] || 0;
}

function getPlanFeatures(planId: string): string[] {
  const features: Record<string, string[]> = {
    'pyme': [
      'Una empresa',
      'Facturación básica con NCF',
      'Dashboard básico',
      'Reportes DGII básicos',
      'Inventario limitado (500 productos)',
      '2 usuarios',
    ],
    'pro': [
      '3 empresas',
      'Contabilidad completa',
      'Dashboard básico',
      'Gestión bancaria básica',
      'Inventario limitado (2,000 productos)',
      'Nómina básica (10 empleados)',
      '5 usuarios',
    ],
    'plus': [
      'Empresas ilimitadas',
      'Todas las funciones contables',
      'Dashboard KPI avanzado',
      'Inventario ilimitado',
      'Nómina completa',
      'Análisis financiero avanzado',
      'Usuarios ilimitados',
    ],
    'pos-basic': [
      'Full dashboard',
      'POS system',
      '3 users',
      'Unlimited products',
      '1 inventory warehouse',
      'Customer management',
      '2,000 electronic invoices',
      'Backup every 48 hours',
    ],
    'pos-premium': [
      'Full dashboard',
      'POS system',
      'Unlimited users',
      'Unlimited products',
      'Unlimited inventory warehouses',
      'Customer management',
      'Unlimited electronic invoices',
      'Backup every 48 hours',
    ],
    'student': [
      'Dashboard Access',
      'Invoices: Unlimited',
      'Quotes: Unlimited',
      'Customers: Unlimited',
      'Organizations: 1',
      'Products',
      'Inventory',
      'Vendors',
      'Expenses',
      'Custom Templates',
      'PDF Emails',
      'Online Payments',
    ],
  };
  return features[planId] || [];
}

function buildPlan(planId: string): Plan {
  const plansInfo: { [key: string]: { name: string; color: string; icon: string } } = {
    'pyme': {
      name: 'PYME',
      color: 'from-blue-500 to-blue-600',
      icon: 'ri-building-2-line',
    },
    'pro': {
      name: 'PRO',
      color: 'from-indigo-500 to-indigo-600',
      icon: 'ri-rocket-line',
    },
    'plus': {
      name: 'PLUS',
      color: 'from-purple-500 to-purple-600',
      icon: 'ri-vip-crown-line',
    },
    'facturacion-simple': {
      name: 'Facturación Simple',
      color: 'from-emerald-500 to-emerald-600',
      icon: 'ri-file-text-line',
    },
    'facturacion-premium': {
      name: 'Facturación Premium',
      color: 'from-green-500 to-green-600',
      icon: 'ri-file-list-3-line',
    },
    'pos-basic': {
      name: 'POS Basic',
      color: 'from-slate-500 to-slate-600',
      icon: 'ri-shopping-cart-line',
    },
    'pos-premium': {
      name: 'POS Premium',
      color: 'from-amber-500 to-amber-600',
      icon: 'ri-shopping-cart-2-line',
    },
    'student': {
      name: 'Contractor Plan',
      color: 'from-[#001B9E] to-[#001B9E]',
      icon: 'ri-graduation-cap-line',
    },
  };

  const info = plansInfo[planId] || {
    name: planId.toUpperCase(),
    color: 'from-gray-500 to-gray-600',
    icon: 'ri-question-line',
  };

  return {
    id: planId,
    name: info.name,
    price: getPlanPrice(planId),
    features: getPlanFeatures(planId),
    active: true,
    color: info.color,
    icon: info.icon,
  };
}

export function usePlans() {
  const [currentPlan, setCurrentPlan] = useState<Plan | null>(null);
  const [trialPlanId, setTrialPlanId] = useState<string | null>(null);
  const [trialInfo, setTrialInfo] = useState<TrialInfo>({
    isActive: false,
    daysLeft: 0,
    hoursLeft: 0,
    minutesLeft: 0,
    startDate: new Date(),
    endDate: new Date(),
    hasExpired: true
  });

  // Función para calcular el tiempo restante
  const calculateTimeLeft = (endDate: Date) => {
    const now = new Date();
    const timeLeft = endDate.getTime() - now.getTime();
    
    if (timeLeft <= 0) {
      return {
        daysLeft: 0,
        hoursLeft: 0,
        minutesLeft: 0,
        isActive: false,
        hasExpired: true
      };
    }

    const daysLeft = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
    const hoursLeft = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutesLeft = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));

    return {
      daysLeft,
      hoursLeft,
      minutesLeft,
      isActive: timeLeft > 0,
      hasExpired: false
    };
  };

  // Inicializar o recuperar información del trial
  useEffect(() => {
    const initializeFromDbOrLocal = async () => {
      const now = new Date();

      // 1) Try DB first
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user?.id) {
          const { data: row, error } = await supabase
            .from('users')
            .select('plan_id, plan_status, trial_end, trial_plan_id')
            .eq('id', user.id)
            .maybeSingle();

          if (!error && row) {
            const planId = (row as any).plan_id ? String((row as any).plan_id) : '';
            const planStatus = (row as any).plan_status ? String((row as any).plan_status) : '';
            const trialEndRaw = (row as any).trial_end ? new Date((row as any).trial_end) : null;
            const trialEnd = trialEndRaw && !isNaN(trialEndRaw.getTime()) ? trialEndRaw : null;
            const trialPlan = (row as any).trial_plan_id ? String((row as any).trial_plan_id) : '';

            if (planId) {
              const plan = buildPlan(planId);
              setCurrentPlan(plan);
              setTrialPlanId(null);
              localStorage.setItem('contard_current_plan', JSON.stringify(plan));
              // If plan active, trial considered inactive
              setTrialInfo((prev) => ({
                ...prev,
                isActive: false,
                hasExpired: false,
              }));
              return;
            }

            if (trialEnd) {
              const timeLeft = calculateTimeLeft(trialEnd);
              setCurrentPlan(null);
              setTrialPlanId(trialPlan || null);
              localStorage.removeItem('contard_current_plan');
              setTrialInfo({
                startDate: now,
                endDate: trialEnd,
                ...timeLeft,
              });
              localStorage.setItem('contard_trial_info', JSON.stringify({
                startDate: now.toISOString(),
                endDate: trialEnd.toISOString(),
              }));
              if (trialPlan) {
                localStorage.setItem('contard_trial_plan', trialPlan);
              }
              if (timeLeft.hasExpired) {
                localStorage.setItem('contard_trial_expired', 'true');
              } else {
                localStorage.removeItem('contard_trial_expired');
              }
              return;
            }
          }
        }
      } catch {
        // ignore and fallback
      }

      // 2) Fallback to localStorage
      const savedTrialInfo = localStorage.getItem('contard_trial_info');
      const savedPlan = localStorage.getItem('contard_current_plan');
      const savedTrialPlan = localStorage.getItem('contard_trial_plan');

      if (savedPlan) {
        try {
          const plan = JSON.parse(savedPlan);
          setCurrentPlan(plan);
        } catch (error) {
          console.error('Error parsing saved plan:', error);
          localStorage.removeItem('contard_current_plan');
        }
      }

      if (savedTrialInfo) {
        try {
          const parsed = JSON.parse(savedTrialInfo);
          const endDate = new Date(parsed.endDate);
          const startDate = new Date(parsed.startDate);
          if (isNaN(endDate.getTime()) || isNaN(startDate.getTime())) {
            throw new Error('Invalid dates');
          }
          const timeLeft = calculateTimeLeft(endDate);
          setTrialPlanId(savedTrialPlan ? String(savedTrialPlan) : null);
          setTrialInfo({
            startDate,
            endDate,
            ...timeLeft,
          });
          return;
        } catch (error) {
          console.error('Error parsing trial info:', error);
        }
      }

      // 3) Final fallback: no trial unless explicitly granted
      setTrialPlanId(null);
      setTrialInfo((prev) => ({
        ...prev,
        isActive: false,
        hasExpired: true,
        daysLeft: 0,
        hoursLeft: 0,
        minutesLeft: 0,
        startDate: now,
        endDate: now,
      }));
    };

    initializeFromDbOrLocal();
  }, []);

  // Actualizar contador cada minuto
  useEffect(() => {
    const updateTimer = () => {
      if (trialInfo.endDate && !currentPlan?.active) {
        const timeLeft = calculateTimeLeft(trialInfo.endDate);
        
        setTrialInfo(prev => ({
          ...prev,
          ...timeLeft
        }));

        // Si el trial expiró, limpiar cualquier acceso
        if (timeLeft.hasExpired) {
          localStorage.setItem('contard_trial_expired', 'true');
        }
      }
    };

    // Actualizar inmediatamente
    updateTimer();

    // Actualizar cada minuto
    const interval = setInterval(updateTimer, 60000);

    return () => clearInterval(interval);
  }, [trialInfo.endDate, currentPlan?.active]);

  const subscribeToPlan = async (planId: string) => {
    try {
      // Permitir suscripción siempre - especialmente cuando el trial ha expirado
      // El usuario necesita poder pagar para reactivar su cuenta
      console.log('Subscribing to plan:', planId);
      
      const plan: Plan = buildPlan(planId);
      
      setCurrentPlan(plan);
      
      // Marcar trial como completado (no expirado, sino completado por suscripción)
      setTrialInfo(prev => ({
        ...prev,
        isActive: false,
        hasExpired: false
      }));
      
      localStorage.setItem('contard_current_plan', JSON.stringify(plan));
      localStorage.removeItem('contard_trial_expired');

      // Persist to DB when available
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user?.id) {
          await supabase
            .from('users')
            .update({
              plan_id: planId,
              plan_status: 'active',
              trial_end: null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', user.id);
        }
      } catch {
        // ignore
      }

      await postWebnotiPlanPurchaseEvent();
      
      return { success: true };
    } catch (error) {
      console.error('Error subscribing to plan:', error);
      return { success: false, error: 'Error al procesar la suscripción' };
    }
  };

  const cancelSubscription = async () => {
    try {
      setCurrentPlan(null);
      localStorage.removeItem('contard_current_plan');

      // Persist to DB when available
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user?.id) {
          await supabase
            .from('users')
            .update({
              plan_id: null,
              plan_status: 'cancelled',
              updated_at: new Date().toISOString(),
            })
            .eq('id', user.id);
        }
      } catch {
        // ignore
      }
      
      // NO iniciar nuevo trial automáticamente al cancelar
      // El usuario debe contactar soporte o pagar nuevamente
      setTrialInfo(prev => ({
        ...prev,
        isActive: false,
        hasExpired: true,
        daysLeft: 0,
        hoursLeft: 0,
        minutesLeft: 0
      }));
      
      localStorage.setItem('contard_trial_expired', 'true');
      
      return { success: true };
    } catch (error) {
      console.error('Error canceling subscription:', error);
      return { success: false, error: 'Error al cancelar la suscripción' };
    }
  };

  const hasAccess = () => {
    // Tiene acceso si tiene plan activo O si el trial está activo y no ha expirado
    return (currentPlan?.active === true) || (trialInfo.isActive && !trialInfo.hasExpired);
  };

  const canSelectPlan = () => {
    // Siempre puede seleccionar un plan para poder pagar
    // Especialmente importante cuando el trial ha expirado
    return true;
  };

  const getTrialStatus = () => {
    if (currentPlan?.active) {
      return 'subscribed';
    }
    
    if (trialInfo.hasExpired) {
      return 'expired';
    }
    
    if (trialInfo.daysLeft <= 3) {
      return 'warning';
    }
    
    return 'active';
  };

  const hasUsedTrial = () => {
    return localStorage.getItem('contard_trial_used') === 'true';
  };

  const startTrialWithPlan = async (planId: string) => {
    // Iniciar trial solo si no se ha usado antes
    if (hasUsedTrial()) {
      return { success: false, error: 'Ya has utilizado tu período de prueba gratuito' };
    }

    const startDate = new Date();
    const endDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    
    const newTrialInfo = {
      isActive: true,
      daysLeft: 7,
      hoursLeft: 0,
      minutesLeft: 0,
      startDate,
      endDate,
      hasExpired: false
    };
    
    localStorage.setItem('contard_trial_info', JSON.stringify({
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    }));
    
    // Marcar que el trial fue usado
    localStorage.setItem('contard_trial_used', 'true');
    
    localStorage.setItem('contard_trial_plan', planId);
    setTrialPlanId(planId);
    
    setTrialInfo(newTrialInfo);

    // Persist trial_end to DB when available
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.id) {
        await supabase
          .from('users')
          .update({
            trial_end: endDate.toISOString(),
            trial_plan_id: planId,
            plan_id: null,
            plan_status: 'inactive',
            updated_at: new Date().toISOString(),
          })
          .eq('id', user.id);
      }
    } catch {
      // ignore
    }
    
    return { success: true };
  };

  return {
    currentPlan,
    trialPlanId,
    trialInfo,
    subscribeToPlan,
    cancelSubscription,
    hasAccess,
    canSelectPlan,
    getTrialStatus,
    hasUsedTrial,
    startTrialWithPlan
  };
}
