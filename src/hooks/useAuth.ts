import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';

async function postWebnotiEvent(accessToken: string, event: 'login' | 'register') {
  try {
    await fetch('/api/webnoti/event', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        access_token: accessToken,
        event,
        target: 'user',
      }),
    });
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
      
      // If signed out due to expired token, try to refresh
      if (event === 'SIGNED_OUT' && !session) {
        const { data: refreshData } = await supabase.auth.refreshSession();
        if (refreshData?.session) {
          setUser(refreshData.session.user);
          return;
        }
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

  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
          emailRedirectTo: "https://prueba3-contabi-5kna2.vercel.app/auth/reset-password",
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
      return { error: null };
    } catch (error: any) {
      return { error: error.message };
    }
  };

  const resetPassword = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: "https://prueba3-contabi-5kna2.vercel.app/auth/reset-password",
      });

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
