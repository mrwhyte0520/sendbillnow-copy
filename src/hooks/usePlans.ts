
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

async function postWebnotiPlanPurchaseEvent() {
  try {
    const { data } = await supabase.auth.getSession();
    const accessToken = data?.session?.access_token;
    if (!accessToken) return;

    await fetch('/api/webnoti/event', {
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

export function usePlans() {
  const [currentPlan, setCurrentPlan] = useState<Plan | null>(null);
  const [trialInfo, setTrialInfo] = useState<TrialInfo>({
    isActive: true,
    daysLeft: 7,
    hoursLeft: 0,
    minutesLeft: 0,
    startDate: new Date(),
    endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    hasExpired: false
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
    const initializeTrial = () => {
      const savedTrialInfo = localStorage.getItem('contard_trial_info');
      const savedPlan = localStorage.getItem('contard_current_plan');
      
      // Cargar plan actual si existe
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
          
          // Validar que las fechas sean válidas
          if (isNaN(endDate.getTime()) || isNaN(startDate.getTime())) {
            throw new Error('Invalid dates');
          }

          const timeLeft = calculateTimeLeft(endDate);
          
          setTrialInfo({
            startDate,
            endDate,
            ...timeLeft
          });
        } catch (error) {
          console.error('Error parsing trial info:', error);
          // Si hay error, iniciar nuevo trial
          startNewTrial();
        }
      } else {
        // Primera vez - iniciar trial
        startNewTrial();
      }
    };

    const startNewTrial = () => {
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
      
      setTrialInfo(newTrialInfo);
    };

    initializeTrial();
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
      
      // Mapear el ID del plan a su información correspondiente
      const plansInfo: {[key: string]: {name: string, color: string, icon: string}} = {
        'pyme': { 
          name: 'PYME',
          color: 'from-blue-500 to-blue-600',
          icon: 'ri-building-2-line'
        },
        'pro': { 
          name: 'PRO',
          color: 'from-indigo-500 to-indigo-600',
          icon: 'ri-rocket-line'
        },
        'plus': { 
          name: 'PLUS',
          color: 'from-purple-500 to-purple-600',
          icon: 'ri-vip-crown-line'
        }
      };
      
      const planInfo = plansInfo[planId] || { 
        name: planId.toUpperCase(),
        color: 'from-gray-500 to-gray-600',
        icon: 'ri-question-line'
      };
      
      const plan: Plan = {
        id: planId,
        name: planInfo.name,
        price: getPlanPrice(planId),
        features: getPlanFeatures(planId),
        active: true,
        color: planInfo.color,
        icon: planInfo.icon
      };
      
      setCurrentPlan(plan);
      
      // Marcar trial como completado (no expirado, sino completado por suscripción)
      setTrialInfo(prev => ({
        ...prev,
        isActive: false,
        hasExpired: false
      }));
      
      localStorage.setItem('contard_current_plan', JSON.stringify(plan));
      localStorage.removeItem('contard_trial_expired');

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

  const getPlanPrice = (planId: string): number => {
    const prices: Record<string, number> = {
      'pyme': 19.97,
      'pro': 49.97,
      'plus': 99.97
    };
    return prices[planId] || 0;
  };

  const getPlanFeatures = (planId: string): string[] => {
    const features: Record<string, string[]> = {
      'pyme': [
        'Una empresa', 
        'Facturación básica con NCF', 
        'Dashboard básico',
        'Reportes DGII básicos', 
        'Inventario limitado (500 productos)',
        '2 usuarios'
      ],
      'pro': [
        '3 empresas', 
        'Contabilidad completa', 
        'Dashboard básico',
        'Gestión bancaria básica', 
        'Inventario limitado (2,000 productos)',
        'Nómina básica (10 empleados)',
        '5 usuarios'
      ],
      'plus': [
        'Empresas ilimitadas', 
        'Todas las funciones contables', 
        'Dashboard KPI avanzado',
        'Inventario ilimitado',
        'Nómina completa',
        'Análisis financiero avanzado',
        'Usuarios ilimitados'
      ]
    };
    return features[planId] || [];
  };

  const hasUsedTrial = () => {
    return localStorage.getItem('contard_trial_used') === 'true';
  };

  const startTrialWithPlan = (planId: string) => {
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
    
    // Guardar el plan seleccionado para el trial
    const plan: Plan = {
      id: planId,
      name: getPlanNameFromId(planId),
      price: 0, // Gratis durante trial
      features: [],
      active: false, // No activo hasta que pague
      color: 'from-blue-500 to-blue-600',
      icon: 'ri-gift-line'
    };
    
    localStorage.setItem('contard_trial_plan', planId);
    
    setTrialInfo(newTrialInfo);
    
    return { success: true };
  };

  const getPlanNameFromId = (planId: string): string => {
    const names: Record<string, string> = {
      'facturacion-simple': 'Facturación Simple',
      'facturacion-premium': 'Facturación Premium',
      'pos-premium': 'POS Premium',
      'pos-super-plus': 'POS Super Plus'
    };
    return names[planId] || planId;
  };

  return {
    currentPlan,
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
