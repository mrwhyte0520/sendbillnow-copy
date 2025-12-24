import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import type { ReactElement } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { usePlanPermissions } from '../../hooks/usePlanPermissions';

const STORAGE_PREFIX = 'contabi_rbac_';

async function fetchAllowedModules(userId: string | null, userEmail?: string | null): Promise<Set<string>> {
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
    const { data: rp } = await supabase.from('role_permissions').select('permission_id').in('role_id', roleIds);
    const permIds = (rp || []).map(r => r.permission_id);
    if (permIds.length === 0) return new Set();
    const { data: perms } = await supabase.from('permissions').select('*').in('id', permIds).eq('action', 'access');
    const modules = new Set<string>((perms || []).map(p => (p as any).module));
    return modules;
  } catch {
    return new Set();
  }
}

function mapPathToModule(pathname: string): string {
  const first = pathname.split('/').filter(Boolean)[0] || 'dashboard';
  return first;
}

export default function ProtectedRoute({ children }: { children: ReactElement }) {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState<Set<string> | null>(null);
  const [userStatus, setUserStatus] = useState<string | null>(null);
  
  const { 
    canAccessRoute, 
    getRequiredPlanForRoute,
    currentPlanName,
    isTrialExpired,
    hasActivePlan
  } = usePlanPermissions();

  useEffect(() => {
    async function checkAccess() {
      if (!user?.id) {
        setAllowed(new Set());
        setUserStatus(null);
        return;
      }

      // Verificar status del usuario
      try {
        const { data: userData } = await supabase
          .from('users')
          .select('status')
          .eq('id', user.id)
          .maybeSingle();

        const status = userData?.status || 'active';
        setUserStatus(status);

        // Si el usuario está inactivo, bloquear acceso
        if (status === 'inactive') {
          alert('Tu cuenta ha sido desactivada. Contacta al administrador.');
          await signOut();
          return;
        }
      } catch (error) {
        console.error('Error verificando status del usuario:', error);
      }

      // Si está activo, verificar permisos
      const modules = await fetchAllowedModules(user.id);
      setAllowed(modules);
    }

    checkAccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  if (allowed === null || userStatus === null) return null; // could show a spinner

  // Si el usuario está inactivo, no renderizar nada (ya se hizo signOut arriba)
  if (userStatus === 'inactive') return null;

  const moduleName = mapPathToModule(window.location.pathname);
  const currentPath = location.pathname;

  // Rutas siempre permitidas (sin verificación de plan)
  const alwaysAllowed = ['/plans', '/profile', '/settings', '/dashboard'];
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

  // If no RBAC configured (no roles/permissions), allow by default
  if (allowed.size === 0) return children;

  if (allowed.has(moduleName)) return children;
  return <Navigate to="/dashboard" replace />;
}
