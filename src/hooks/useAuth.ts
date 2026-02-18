import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';

function getPasswordResetRedirectUrl() {
  const origin = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : '';
  return origin ? `${origin}/auth/reset-password` : undefined;
}

function getSignupRedirectUrl() {
  const origin = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : '';
  return origin ? `${origin}/auth/login` : undefined;
}

async function postWebnotiEvent(accessToken: string, event: 'login' | 'register') {
  try {
    const apiBase = import.meta.env.VITE_API_BASE_URL?.trim() || '';

    if (!apiBase) return;

    const resp = await fetch(`${apiBase}/api/webnoti/event`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        access_token: accessToken,
        event,
        target: 'user',
      }),
    });

    if (!resp.ok) return;
  } catch {
    // ignore
  }
}

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Cargar sesión primero (no bloqueante)
    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      // If session expired, try to refresh it
      if (error?.message?.includes('expired') || (!session && !error)) {
        const { data: refreshData } = await supabase.auth.refreshSession();
        if (refreshData?.session) {
          setUser(refreshData.session.user);
          setLoading(false);
          setTimeout(() => checkUserStatus(refreshData.session!.user.id), 100);
          return;
        }
      }
      
      setUser(session?.user ?? null);
      setLoading(false);
      
      // Verificar status en segundo plano (después de cargar)
      if (session?.user) {
        setTimeout(() => checkUserStatus(session.user.id), 100);
      }
    });

    // Escuchar cambios de autenticación
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Handle token refresh events
      if (event === 'TOKEN_REFRESHED') {
        console.log('[Auth] Token refreshed successfully');
      }
      
      setUser(session?.user ?? null);
      setLoading(false);
      
      // Verificar status en segundo plano
      if (session?.user) {
        setTimeout(() => checkUserStatus(session.user.id), 100);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Función para verificar status (ejecutada en segundo plano)
  const checkUserStatus = async (userId: string) => {
    try {
      const { data: userData } = await supabase
        .from('users')
        .select('status')
        .eq('id', userId)
        .maybeSingle();

      const status = userData?.status || 'active';

      if (status === 'inactive') {
        await supabase.auth.signOut();
        setUser(null);
        alert('Tu cuenta ha sido desactivada. Contacta al administrador.');
      }
    } catch (error) {
      // No bloquear si hay error (tabla no existe, RLS, etc)
      console.warn('No se pudo verificar status:', error);
    }
  };

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    extra?: { address?: string; city?: string; state?: string; zip?: string }
  ) => {
    try {
      const redirectTo = getSignupRedirectUrl();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            address: extra?.address || undefined,
            city: extra?.city || undefined,
            state: extra?.state || undefined,
            zip: extra?.zip || undefined,
          },
          ...(redirectTo ? { emailRedirectTo: redirectTo } : {}),
        },
      });

      if (error) throw error;

       const accessToken = data?.session?.access_token;
       if (accessToken) {
         await postWebnotiEvent(accessToken, 'register');
       }

      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

       const accessToken = data?.session?.access_token;
       if (accessToken) {
         await postWebnotiEvent(accessToken, 'login');
       }

      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setUser(null);
      try {
        localStorage.removeItem('htc_portal_only');
      } catch {
      }
      return { error: null };
    } catch (error: any) {
      // Even if Supabase returns an error, clear local user state to avoid stuck sessions
      setUser(null);
      try {
        localStorage.removeItem('htc_portal_only');
      } catch {
      }
      return { error: error.message };
    }
  };

  const resetPassword = async (email: string) => {
    try {
      const redirectTo = getPasswordResetRedirectUrl();
      const { error } = await supabase.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined);

      if (error) throw error;

      return { error: null };
    } catch (error: any) {
      return { error: error.message };
    }
  };

  const updatePassword = async (newPassword: string) => {
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      return { error: null };
    } catch (error: any) {
      return { error: error.message };
    }
  };

  return {
    user,
    loading,
    signUp,
    signIn,
    signOut,
    resetPassword,
    updatePassword,
  };
};
