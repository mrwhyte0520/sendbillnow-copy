import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import type { ReactElement } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { usePlanPermissions } from '../../hooks/usePlanPermissions';
import { resolveTenantId } from '../../services/database';

const STORAGE_PREFIX = 'contabi_rbac_';

async function fetchAllowedModules(userId: string | null, userEmail?: string | null, ownerUserId?: string | null): Promise<Set<string>> {
  try {
    if (!userId) {
      // local fallback
      const perms = JSON.parse(localStorage.getItem(STORAGE_PREFIX + 'permissions') || '[]');
      const rolePerms = JSON.parse(localStorage.getItem(STORAGE_PREFIX + 'role_permissions') || '[]');
      const userRoles = JSON.parse(localStorage.getItem(STORAGE_PREFIX + 'user_roles') || '[]');
      const myRoleIds = userRoles.filter((ur: any) => ur.user_id === 'local').map((ur: any) => ur.role_id);
      const permIds = rolePerms.filter((rp: any) => myRoleIds.includes(rp.role_id)).map((rp: any) => rp.permission_id);
      const modules = new Set<string>();
      perms.forEach((p: any) => { if (p.action === 'access' && permIds.includes(p.id)) modules.add(p.module); });
      return modules;
    }
    // Supabase
    // Resolver roles por user_id o por email (soportar subusuarios invitados por email)
    let roleIds: string[] = [];
    const { data: urById } = await supabase.from('user_roles').select('*').eq('user_id', userId);
    roleIds = (urById || []).map((r: any) => r.role_id);
    if (roleIds.length === 0 && userEmail) {
      const { data: urByEmail } = await supabase.from('user_roles').select('*').eq('user_id', userEmail);
      roleIds = (urByEmail || []).map((r: any) => r.role_id);
    }
    if (roleIds.length === 0) return new Set();
    // IMPORTANT: role_permissions is tenant-scoped; filter by owner_user_id to satisfy RLS
    const rpQuery = supabase
      .from('role_permissions')
      .select('permission_id')
      .in('role_id', roleIds);
    const { data: rp } = ownerUserId ? await rpQuery.eq('owner_user_id', ownerUserId) : await rpQuery;
    const permIds = (rp || []).map(r => r.permission_id);
    if (permIds.length === 0) return new Set();
    const { data: perms } = await supabase.from('permissions').select('*').in('id', permIds).eq('action', 'access');
    const modules = new Set<string>((perms || []).map(p => (p as any).module));
    return modules;
  } catch {
    return new Set();
  }
}

// Map href segments to permission module names (handle mismatches like contador → accounting)
const MODULE_MAP: Record<string, string> = {
  'contador': 'accounting',
};

function mapPathToModule(pathname: string): string {
  const first = pathname.split('/').filter(Boolean)[0] || 'dashboard';
  return MODULE_MAP[first] || first;
}

export default function ProtectedRoute({ children }: { children: ReactElement }) {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState<Set<string> | null>(null);
  const [userStatus, setUserStatus] = useState<string | null>(null);
  const [hasAdminRole, setHasAdminRole] = useState(false);
  const [isHtcPortalOnly, setIsHtcPortalOnly] = useState(() => {
    try {
      return localStorage.getItem('htc_portal_only') === '1';
    } catch {
      return false;
    }
  });
  const [isOwner, setIsOwner] = useState(true); // Default true (fail-open for owner)
  const [isLoading, setIsLoading] = useState(true);
  
  const { 
    canAccessRoute, 
    getRequiredPlanForRoute,
    currentPlanName,
    isTrialExpired,
    hasActivePlan
  } = usePlanPermissions();

  useEffect(() => {
    async function checkAccess() {
      setIsLoading(true);
      if (!user?.id) {
        setAllowed(new Set());
        setUserStatus(null);
        setHasAdminRole(false);
        setIsLoading(false);
        return;
      }

      try {
        const isAdminRoute = window.location.pathname.startsWith('/admin');

      // Definitive Admin check (server-side, service role) for /admin routes.
      // This avoids client-side RLS issues on user_roles/roles.
      if (isAdminRoute) {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const token = sessionData?.session?.access_token || '';
          if (token) {
            const host = String(window.location.hostname || '').toLowerCase();
            const isLocalHost = host === 'localhost' || host === '127.0.0.1';
            let apiBase = (import.meta as any)?.env?.VITE_API_BASE_URL?.trim() || '';
            // If a production build accidentally has a localhost API base configured,
            // ignore it and use same-origin so /api/* resolves correctly.
            if (!isLocalHost && apiBase && apiBase.includes('localhost')) {
              apiBase = '';
            }
            const controller = new AbortController();
            const timeoutId = window.setTimeout(() => controller.abort(), 8000);
            const resp = await fetch(`${apiBase}/api/admin/verify`, {
              method: 'GET',
              headers: {
                authorization: `Bearer ${token}`,
              },
              signal: controller.signal,
            }).finally(() => window.clearTimeout(timeoutId));

            if (resp.ok) {
              const json = await resp.json().catch(() => null);
              if (json && json.success) {
                const status = String(json.status || 'active');
                const isAdmin = Boolean(json.isAdmin);
                setUserStatus(status);
                setHasAdminRole(isAdmin);
                if (status === 'inactive') {
                  alert('Tu cuenta ha sido desactivada. Contacta al administrador.');
                  try {
                    await signOut();
                  } finally {
                    setAllowed(new Set());
                    setIsLoading(false);
                    navigate('/login', { replace: true });
                  }
                  return;
                }

                if (isAdmin) {
                  setAllowed(new Set(['admin']));
                  setIsLoading(false);
                  return;
                }
              }
            }
          }
        } catch {
          // ignore and fallback to client checks
        }
      }

      // Determine admin role directly (avoid tenant-scoped role_permissions issues)
      let adminRole = false;
      try {
        const candidates = [user.id, user.email].filter(Boolean) as string[];
        if (candidates.length > 0) {
          const { data: roleRows, error: roleErr } = await supabase
            .from('user_roles')
            .select('id, roles!inner(name)')
            .in('user_id', candidates);

          adminRole = !roleErr && Array.isArray(roleRows) && roleRows.some((r: any) => String(r?.roles?.name || '').toLowerCase() === 'admin');
        }
      } catch {
        adminRole = false;
      }
      // Note: we may also infer admin from public.users.role (fallback) below.

      // Verificar status del usuario
      try {
        let metaFlag = Boolean((user as any)?.user_metadata?.htc_portal_only);
        if (!metaFlag) {
          try {
            metaFlag = localStorage.getItem('htc_portal_only') === '1';
          } catch {
            // ignore
          }
        }
        if (!metaFlag) {
          try {
            const { data: authData, error: authErr } = await supabase.auth.getUser();
            metaFlag = !authErr && Boolean((authData as any)?.user?.user_metadata?.htc_portal_only);
          } catch {
            // ignore
          }
        }

        if (!metaFlag) {
          try {
            const { data: roleRows, error: roleErr } = await supabase
              .from('user_roles')
              .select('id, roles!inner(name)')
              .eq('user_id', user.id);

            metaFlag = !roleErr && Array.isArray(roleRows) && roleRows.some((r: any) => String(r?.roles?.name || '').toLowerCase() === 'htc_portal');
          } catch {
            // ignore
          }
        }
        const { data: userData } = await supabase
          .from('users')
          .select('status, htc_portal_only')
          .eq('id', user.id)
          .maybeSingle();

        const status = userData?.status || 'active';
        setUserStatus(status);
        const resolvedHtc = Boolean((userData as any)?.htc_portal_only) || metaFlag;
        setIsHtcPortalOnly(resolvedHtc);

        setHasAdminRole(adminRole);
        try {
          if (resolvedHtc) localStorage.setItem('htc_portal_only', '1');
          else localStorage.removeItem('htc_portal_only');
        } catch {
          // ignore
        }

        // Si el usuario está inactivo, bloquear acceso
        if (status === 'inactive') {
          alert('Tu cuenta ha sido desactivada. Contacta al administrador.');
          try {
            await signOut();
          } finally {
            setAllowed(new Set());
            setIsLoading(false);
            navigate('/login', { replace: true });
          }
          return;
        }
      } catch (error) {
        console.error('Error verificando status del usuario:', error);
        // Fail-open: do not block navigation for transient read errors
        setUserStatus('active');
        setHasAdminRole(adminRole);
        try {
          const { data: authData, error: authErr } = await supabase.auth.getUser();
          const resolvedHtc = !authErr && Boolean((authData as any)?.user?.user_metadata?.htc_portal_only);
          setIsHtcPortalOnly(resolvedHtc);
          try {
            if (resolvedHtc) localStorage.setItem('htc_portal_only', '1');
            else localStorage.removeItem('htc_portal_only');
          } catch {
            // ignore
          }
        } catch {
          const resolvedHtc = Boolean((user as any)?.user_metadata?.htc_portal_only);
          setIsHtcPortalOnly(resolvedHtc);
          try {
            if (resolvedHtc) localStorage.setItem('htc_portal_only', '1');
            else localStorage.removeItem('htc_portal_only');
          } catch {
            // ignore
          }
        }
      }

      // Si está activo, verificar si es owner
      let owner = false;
      let tenantIdResolved: string | null = null;
      try {
        const tenantId = await resolveTenantId(user.id);
        tenantIdResolved = tenantId;
        owner = tenantId === user.id;
      } catch {
        // If resolveTenantId fails, check if user has any user_roles entries
        // If no entries, assume they are the owner (self-tenant)
        try {
          const { data: urCheck } = await supabase
            .from('user_roles')
            .select('id')
            .eq('user_id', user.id)
            .limit(1);
          // If user has no roles assigned, they are likely the owner
          owner = !urCheck || urCheck.length === 0;
        } catch {
          // On complete failure, default to owner to avoid blocking
          owner = true;
        }
      }

      setIsOwner(owner);
      // Owner is normally fail-open, but Admin module is ALWAYS role-gated.
      // For /admin routes, even owner must have RBAC module 'admin'.
      if (owner && !isAdminRoute) {
        setAllowed(new Set(['*']));
        setIsLoading(false);
        return;
      }

      // Admin routes: if user has admin role, allow regardless of plan/tenant RBAC resolution
      if (isAdminRoute && adminRole) {
        setAllowed(new Set(['admin']));
        setIsLoading(false);
        return;
      }

        const modules = await fetchAllowedModules(user.id, user.email, tenantIdResolved);
        setAllowed(modules);
        setIsLoading(false);
      } catch (err) {
        console.error('ProtectedRoute checkAccess failed:', err);
        setAllowed(new Set());
        setUserStatus('active');
        setHasAdminRole(false);
        setIsLoading(false);
      } finally {
        setIsLoading(false);
      }
    }

    checkAccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Wait for access check to complete before making decisions
  if (isLoading || allowed === null || userStatus === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-gray-700">Loading...</div>
      </div>
    );
  }

  // Si el usuario está inactivo, no renderizar nada (ya se hizo signOut arriba)
  if (userStatus === 'inactive') return null;

  const moduleName = mapPathToModule(window.location.pathname);
  const currentPath = location.pathname;
  const isAdminRoute = currentPath.startsWith('/admin');
  const isHtcRoute = currentPath.startsWith('/htc');

  // Admin routes: do not enforce plan rules; admin is role-gated
  if (isAdminRoute && hasAdminRole) return children;

  if (isHtcPortalOnly && !isHtcRoute) {
    return <Navigate to="/htc/service-hours" replace />;
  }
  if (!isHtcPortalOnly && isHtcRoute) {
    return <Navigate to="/dashboard" replace />;
  }

  if (isHtcPortalOnly && isHtcRoute) {
    return children;
  }

  // Owner has full access (skip plan + RBAC checks)
  if (isOwner && !isAdminRoute) return children;

  // Rutas siempre permitidas (sin verificación de plan)
  const alwaysAllowed = ['/plans', '/profile', '/settings', '/dashboard', '/admin'];
  const isAlwaysAllowed = alwaysAllowed.some(r => 
    currentPath === r || currentPath.startsWith(r + '/')
  );

  // Verificar permisos de plan
  if (!isAlwaysAllowed && !canAccessRoute(currentPath)) {
    const requiredPlan = getRequiredPlanForRoute(currentPath);
    const pathModule = currentPath.split('/').filter(Boolean)[0] || 'este módulo';

    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-gradient-to-r from-gray-700 to-gray-800 p-8 text-center">
            <div className="w-24 h-24 mx-auto bg-white/10 rounded-full flex items-center justify-center mb-4">
              <i className="ri-lock-2-line text-5xl text-white"></i>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Acceso Restringido</h2>
            <p className="text-gray-300 capitalize">{pathModule.replace(/-/g, ' ')}</p>
          </div>
          <div className="p-6 space-y-4">
            {isTrialExpired && !hasActivePlan ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start">
                  <i className="ri-error-warning-line text-red-500 text-xl mr-3 mt-0.5"></i>
                  <div>
                    <h3 className="font-semibold text-red-800">Período de prueba expirado</h3>
                    <p className="text-sm text-red-600 mt-1">
                      Tu período de prueba ha terminado. Suscríbete a un plan para continuar.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <div className="flex items-start">
                    <i className="ri-shield-star-line text-amber-500 text-xl mr-3 mt-0.5"></i>
                    <div>
                      <h3 className="font-semibold text-amber-800">Módulo no disponible</h3>
                      <p className="text-sm text-amber-600 mt-1">
                        Este módulo no está incluido en tu plan actual.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Tu plan:</span>
                    <span className="font-medium text-gray-900 bg-gray-200 px-2 py-1 rounded">{currentPlanName}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Plan requerido:</span>
                    <span className="font-medium text-blue-600 bg-blue-100 px-2 py-1 rounded">{requiredPlan}</span>
                  </div>
                </div>
              </>
            )}
            <div className="flex flex-col gap-3 pt-4">
              <button
                onClick={() => navigate('/plans')}
                className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg font-semibold hover:from-blue-700 hover:to-blue-800 transition-all flex items-center justify-center"
              >
                <i className="ri-arrow-up-circle-line mr-2"></i>
                Ver Planes y Actualizar
              </button>
              <button
                onClick={() => navigate('/dashboard')}
                className="w-full py-3 px-4 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
              >
                Ir al Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // If no RBAC configured (no roles/permissions), allow minimal routes
  if (allowed.size === 0) {
    // Minimal access when permissions cannot be resolved
    const minimalAllowed = ['/dashboard', '/profile', '/plans'];
    const ok = minimalAllowed.some(r => currentPath === r || currentPath.startsWith(r + '/'));
    if (ok) return children;
    return <Navigate to="/dashboard" replace />;
  }

  // Check if allowed contains the module OR the wildcard '*' (owner full access)
  if (allowed.has('*') || allowed.has(moduleName)) return children;
  return <Navigate to="/dashboard" replace />;
}
