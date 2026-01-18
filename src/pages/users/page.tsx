import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { resolveTenantId } from '../../services/database';

interface Role { id: string; name: string; description?: string }
interface Permission { id: string; module: string; action: string }
interface RolePermission { role_id: string; permission_id: string }
interface UserRole { id: string; user_id: string; role_id: string }
interface UserWithRole { id: string; email: string; status: string; role_id: string; role_name: string; user_role_id: string }

const APP_MODULES = [
  'dashboard','statistics','accounting','accounts-receivable','accounts-payable','billing','pos','inventory','plans','referrals','users','settings','admin'
];

const MODULE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  statistics: 'Statistics',
  accounting: 'Accounting',
  'accounts-receivable': 'Accounts Receivable',
  'accounts-payable': 'Accounts Payable',
  billing: 'Billing',
  pos: 'Point of Sale',
  inventory: 'Inventory',
  plans: 'Plans',
  referrals: 'Referrals',
  users: 'Users',
  settings: 'Settings',
  admin: 'Admin',
};

export default function UsersPage() {
  const { user } = useAuth();

  const [activeDepartment, setActiveDepartment] = useState<'roles' | 'employee'>('roles');

  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [rolePerms, setRolePerms] = useState<RolePermission[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [usersWithRoles, setUsersWithRoles] = useState<UserWithRole[]>([]);

  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');

  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRoleId, setNewUserRoleId] = useState('');
  const [creatingUser, setCreatingUser] = useState(false);
  const [isOwner, setIsOwner] = useState(true);

  const storageKey = (key: string) => `contabi_rbac_${key}`;

  const loadLocal = () => {
    setRoles(JSON.parse(localStorage.getItem(storageKey('roles')) || '[]'));
    const localPerms = JSON.parse(localStorage.getItem(storageKey('permissions')) || '[]');
    // Filtrar permisos de 'settings'
    setPermissions(localPerms.filter((p: Permission) => p.module !== 'settings'));
    setRolePerms(JSON.parse(localStorage.getItem(storageKey('role_permissions')) || '[]'));
    setUserRoles(JSON.parse(localStorage.getItem(storageKey('user_roles')) || '[]'));
  };

  const createUser = async () => {
    const email = newUserEmail.trim().toLowerCase();
    if (!email || !newUserPassword || !newUserRoleId) return;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      alert('Invalid email. Check the format (e.g. user@email.com).');
      return;
    }
    if (newUserPassword.length < 6) {
      alert('Password must be at least 6 characters long');
      return;
    }
    try {
      setCreatingUser(true);

      // Verificar si el email ya existe en auth.users
      const { data: existingUsers } = await supabase
        .from('users')
        .select('id, email')
        .eq('email', email)
        .maybeSingle();

      if (existingUsers) {
        // El usuario ya existe, verificar si es owner de otro tenant
        const { data: ownerCheck } = await supabase
          .from('user_roles')
          .select('owner_user_id, user_id')
          .eq('user_id', existingUsers.id)
          .eq('owner_user_id', existingUsers.id)
          .maybeSingle();

        if (ownerCheck) {
          alert('This user already owns another tenant and cannot be added as a sub-user.');
          return;
        }

        // Usuario existe pero no es owner, agregarlo como subusuario
        const ownerId = await resolveTenantId(user!.id);
        await supabase
          .from('user_roles')
          .insert({ user_id: existingUsers.id, role_id: newUserRoleId, owner_user_id: ownerId || user!.id });
        
        setNewUserEmail('');
        setNewUserPassword('');
        setNewUserRoleId('');
        await load();
        alert('Existing user added as a sub-user successfully.');
        return;
      }

      // Usuario no existe, crear nuevo
      const redirectTo = typeof window !== 'undefined' && window.location?.origin
        ? `${window.location.origin}/auth/login`
        : undefined;
      
      const { data, error } = await supabase.auth.signUp({
        email,
        password: newUserPassword,
        options: {
          ...(redirectTo ? { emailRedirectTo: redirectTo } : {}),
        },
      });

      if (error) {
        console.error('Error creating user:', error);
        alert(error.message || 'Error creating user');
        return;
      }

      const createdUser = data.user;

      // Si tenemos user.id real, registrar rol en user_roles usando el owner del tenant
      if (user?.id && createdUser?.id) {
        try {
          const ownerId = await resolveTenantId(user.id);
          await supabase
            .from('user_roles')
            .insert({ user_id: createdUser.id, role_id: newUserRoleId, owner_user_id: ownerId || user.id });
        } catch (err) {
          console.error('Error al asignar rol al nuevo usuario:', err);
        }
      }

      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserRoleId('');
      await load();
      alert('User created successfully. Please check their email to activate the account if necessary.');
    } finally {
      setCreatingUser(false);
    }
  };
  const saveLocal = (key: string, data: any) => localStorage.setItem(storageKey(key), JSON.stringify(data));

  const load = async () => {
    try {
      if (!user?.id) { loadLocal(); return; }
      const ownerId = await resolveTenantId(user.id);
      if (!ownerId) { loadLocal(); return; }
      
      // Verificar si el usuario actual es el owner del tenant
      setIsOwner(user.id === ownerId);

      const { data: r } = await supabase
        .from('roles')
        .select('*')
        .eq('owner_user_id', ownerId)
        .order('name');

      const { data: p } = await supabase
        .from('permissions')
        .select('*'); // permisos son globales, no por tenant

      // If permissions table is empty (or not readable due to RLS), seed base access permissions
      let permissionsData: any[] | null | undefined = p;
      if (!permissionsData || permissionsData.length === 0) {
        try {
          const basePerms = APP_MODULES.map((m) => ({ module: m, action: 'access' }));
          await supabase
            .from('permissions')
            .upsert(basePerms, { onConflict: 'module,action' });
          const { data: p2 } = await supabase
            .from('permissions')
            .select('*');
          permissionsData = p2;
        } catch (e) {
          console.error('Error seeding base permissions:', e);
        }
      }

      const { data: rp } = await supabase
        .from('role_permissions')
        .select('*')
        .eq('owner_user_id', ownerId);

      const { data: ur } = await supabase
        .from('user_roles')
        .select('*')
        .eq('owner_user_id', ownerId);
      
      // Cargar información completa de usuarios
      let usersData: UserWithRole[] = [];
      if (ur && ur.length > 0) {
        const userIds = ur.map((u: any) => u.user_id);
        const { data: usersInfo } = await supabase
          .from('users')
          .select('id, email, status')
          .in('id', userIds);
        
        if (usersInfo) {
          usersData = ur.map((userRole: any) => {
            const userInfo = usersInfo.find((u: any) => u.id === userRole.user_id);
            const role = (r || []).find((role: any) => role.id === userRole.role_id);
            return {
              id: userInfo?.id || userRole.user_id,
              email: userInfo?.email || 'Sin email',
              status: userInfo?.status || 'active',
              role_id: userRole.role_id,
              role_name: role?.name || '—',
              user_role_id: userRole.id
            };
          });
        }
      }

      if (r && permissionsData && ur) {
        // Combinar permisos: si Supabase devuelve role_permissions, usarlos; si no, usar los de localStorage
        const localRp: RolePermission[] = JSON.parse(localStorage.getItem(storageKey('role_permissions')) || '[]');
        const effectiveRp = rp && rp.length > 0 ? (rp as any as RolePermission[]) : localRp;

        // Filtrar permisos para excluir 'settings'
        const filteredPermissions = (permissionsData as any[]).filter((perm: any) => perm.module !== 'settings');

        setRoles(r as any);
        setPermissions(filteredPermissions as any);
        setRolePerms(effectiveRp);
        setUserRoles(ur as any);
        setUsersWithRoles(usersData);
        return;
      }
      loadLocal();
    } catch {
      loadLocal();
    }
  };

  useEffect(() => { load(); }, [user]);

  // Ensure base permissions for modules exist (view access per module)
  useEffect(() => {
    if (permissions.length === 0) {
      const base: Permission[] = APP_MODULES.map((m) => ({ id: `perm-${m}`, module: m, action: 'access' }));
      setPermissions(base);
      saveLocal('permissions', base);
    }
  }, [permissions.length]);

  const toggleRolePerm = async (roleId: string, permId: string, checked: boolean) => {
    // Ensure we always persist real permission UUIDs (DB) when possible.
    // Local placeholders look like "perm-<module>".
    const resolvePermissionId = (id: string) => {
      if (!id.startsWith('perm-')) return id;
      const module = id.replace(/^perm-/, '');
      const found = permissions.find((p) => p.module === module && p.action === 'access');
      return found?.id || id;
    };

    const effectivePermId = resolvePermissionId(permId);

    // Actualización optimista en memoria y en localStorage (siempre)
    const next = checked
      ? [...rolePerms, { role_id: roleId, permission_id: effectivePermId }]
      : rolePerms.filter(rp => !(rp.role_id === roleId && rp.permission_id === effectivePermId));
    setRolePerms(next);
    saveLocal('role_permissions', next);

    // Sincronizar con Supabase si hay usuario propietario
    if (user?.id) {
      try {
        const ownerId = await resolveTenantId(user.id);
        const ownerUserId = ownerId || user.id;

        // If we still have a placeholder permission id, we can't persist to DB reliably.
        if (effectivePermId.startsWith('perm-')) {
          console.warn('Cannot persist role permission: unresolved permission id', { permId, effectivePermId });
          alert('No se pudo guardar el permiso porque falta el Permission ID real. Recarga la página y vuelve a intentar.');
          return;
        }

        if (checked) {
          const { error } = await supabase
            .from('role_permissions')
            .upsert(
              { role_id: roleId, permission_id: effectivePermId, owner_user_id: ownerUserId },
              { onConflict: 'role_id,permission_id,owner_user_id' }
            );
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('role_permissions')
            .delete()
            .match({ role_id: roleId, permission_id: effectivePermId, owner_user_id: ownerUserId });
          if (error) throw error;
        }
      } catch (error) {
        console.error('Error al actualizar permisos de rol:', error);
        alert('Error al guardar permisos del rol. Verifica permisos/RLS en Supabase.');
      }
    }
  };

  const addRole = async () => {
    if (!newRoleName.trim()) {
      alert('Role name is required');
      return;
    }
    if (user?.id) {
      try {
        const { data } = await supabase
          .from('roles')
          .insert({
            name: newRoleName.trim(),
            description: newRoleDesc,
            owner_user_id: user.id,
          })
          .select()
          .single();
        if (data) { setNewRoleName(''); setNewRoleDesc(''); await load(); return; }
      } catch {}
    }
    const local: Role = { id: `role-${Date.now()}`, name: newRoleName.trim(), description: newRoleDesc };
    const next = [local, ...roles];
    setRoles(next); saveLocal('roles', next); setNewRoleName(''); setNewRoleDesc('');
  };

  const deleteRole = async (roleId: string) => {
    if (!confirm('Delete this role?')) return;
    if (user?.id) {
      try {
        await supabase
          .from('role_permissions')
          .delete()
          .eq('role_id', roleId)
          .eq('owner_user_id', user.id);

        await supabase
          .from('user_roles')
          .delete()
          .eq('role_id', roleId)
          .eq('owner_user_id', user.id);

        await supabase
          .from('roles')
          .delete()
          .eq('id', roleId)
          .eq('owner_user_id', user.id);
        await load();
        return;
      } catch {}
    }
    const next = roles.filter(r => r.id !== roleId);
    setRoles(next); saveLocal('roles', next);
    const rp = rolePerms.filter(rp => rp.role_id !== roleId); setRolePerms(rp); saveLocal('role_permissions', rp);
    const ur = userRoles.filter(ur => ur.role_id !== roleId); setUserRoles(ur); saveLocal('user_roles', ur);
  };

  const toggleUserStatus = async (userId: string, currentStatus: string) => {
    if (!user?.id || !isOwner) return;
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    try {
      await supabase
        .from('users')
        .update({ status: newStatus })
        .eq('id', userId);
      await load();
    } catch (error) {
      console.error('Error al cambiar status del usuario:', error);
      alert('Error al cambiar el estado del usuario');
    }
  };

  const deleteUser = async (_userId: string, userRoleId: string) => {
    if (!user?.id || !isOwner) return;
    if (!confirm('¿Eliminar este usuario? Se eliminará su acceso al sistema.')) return;
    try {
      const ownerId = await resolveTenantId(user.id);
      // Eliminar user_role
      await supabase
        .from('user_roles')
        .delete()
        .eq('id', userRoleId)
        .eq('owner_user_id', ownerId || user.id);
      
      await load();
      alert('Usuario eliminado correctamente');
    } catch (error) {
      console.error('Error al eliminar usuario:', error);
      alert('Error al eliminar el usuario');
    }
  };

  const grid = useMemo(() => roles.map(r => ({
    role: r,
    perms: permissions.map(p => ({ perm: p, checked: rolePerms.some(rp => rp.role_id === r.id && rp.permission_id === p.id) }))
  })), [roles, permissions, rolePerms]);

  const employeeForms = useMemo(
    () => [
      { title: 'Formulario 1', path: '/formulario1.pdf' },
      { title: 'Formulario 2', path: '/formulario2.pdf' },
      { title: 'Formulario 3', path: '/formulario3.pdf' },
    ],
    []
  );

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6 bg-[#F8F3E7] min-h-full">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#1F2618]">Users & Roles</h1>
            <p className="text-[#5B6844]">Manage roles and permissions per module</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-[#E0E7C8] p-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveDepartment('roles')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                activeDepartment === 'roles'
                  ? 'bg-[#566738] text-white shadow shadow-[#566738]/30'
                  : 'bg-[#FBF8EE] text-[#3E4D2C] border border-[#E2D6BD] hover:bg-[#F4EEDC]'
              }`}
            >
              Roles
            </button>
            <button
              type="button"
              onClick={() => setActiveDepartment('employee')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                activeDepartment === 'employee'
                  ? 'bg-[#566738] text-white shadow shadow-[#566738]/30'
                  : 'bg-[#FBF8EE] text-[#3E4D2C] border border-[#E2D6BD] hover:bg-[#F4EEDC]'
              }`}
            >
              Employee
            </button>
          </div>
        </div>

        {activeDepartment === 'employee' ? (
          <div className="bg-white rounded-2xl shadow-sm border border-[#E0E7C8] p-6">
            <div className="flex items-start justify-between gap-4 flex-col md:flex-row">
              <div>
                <h3 className="text-lg font-semibold text-[#1F2618]">Employee</h3>
                <p className="text-sm text-[#5B6844]">
                  Keep these forms ready to share with applicants.
                </p>
              </div>
              <a
                href={`mailto:?subject=${encodeURIComponent('Employee Forms')}&body=${encodeURIComponent(
                  employeeForms.map(f => `${f.title}: ${window.location.origin}${f.path}`).join('\n')
                )}`}
                className="px-4 py-2 bg-[#566738] text-white rounded-lg hover:bg-[#45532B] whitespace-nowrap shadow shadow-[#566738]/30"
              >
                Email forms
              </a>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6">
              {employeeForms.map((form) => (
                <div key={form.title} className="rounded-2xl border border-[#E0E7C8] overflow-hidden">
                  <div className="flex items-center justify-between gap-3 px-4 py-3 bg-[#FBF8EE] border-b border-[#E2D6BD]">
                    <div className="font-semibold text-[#1F2618]">{form.title}</div>
                    <div className="flex items-center gap-2">
                      <a
                        href={form.path}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 text-sm rounded-lg bg-white border border-[#E2D6BD] hover:bg-[#F4EEDC]"
                      >
                        Open
                      </a>
                      <a
                        href={form.path}
                        download
                        className="px-3 py-1.5 text-sm rounded-lg bg-white border border-[#E2D6BD] hover:bg-[#F4EEDC]"
                      >
                        Download
                      </a>
                    </div>
                  </div>
                  <div className="bg-white">
                    <object data={form.path} type="application/pdf" className="w-full h-[70vh]">
                      <div className="p-4 text-sm text-gray-600">
                        Preview not available. Use the Open button to view the PDF.
                      </div>
                    </object>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Roles */}
            <div className="bg-white rounded-2xl shadow-sm border border-[#E0E7C8] p-6">
              <div className="flex flex-col md:flex-row md:items-end gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role Name</label>
                  <input value={newRoleName} onChange={e => setNewRoleName(e.target.value)} className="w-full p-2 border border-[#E2D6BD] rounded-lg focus:ring-2 focus:ring-[#C6B383] focus:border-[#C6B383] bg-[#FBF8EE]" placeholder="Ex. Supervisor" />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <input value={newRoleDesc} onChange={e => setNewRoleDesc(e.target.value)} className="w-full p-2 border border-[#E2D6BD] rounded-lg focus:ring-2 focus:ring-[#C6B383] focus:border-[#C6B383] bg-[#FBF8EE]" placeholder="Optional" />
                </div>
                <button 
                  onClick={addRole} 
                  disabled={!isOwner}
                  className="px-4 py-2 bg-[#566738] text-white rounded-lg hover:bg-[#45532B] whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed shadow shadow-[#566738]/30"
                >
                  Create Role
                </button>
              </div>

              <div className="mt-6 overflow-x-auto">
                <table className="min-w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Permissions by module</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {grid.map(row => (
                      <tr key={row.role.id}>
                        <td className="px-4 py-2 align-top">
                          <div className="font-medium text-gray-900">{row.role.name}</div>
                          <div className="text-xs text-gray-500">{row.role.description || '—'}</div>
                        </td>
                        <td className="px-4 py-2">
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                            {row.perms.map(({ perm, checked }) => (
                              <label key={perm.id} className="inline-flex items-center gap-2 text-sm">
                                <input 
                                  type="checkbox" 
                                  checked={checked} 
                                  onChange={(e) => toggleRolePerm(row.role.id, perm.id, e.target.checked)} 
                                  disabled={!isOwner}
                                  className={!isOwner ? 'cursor-not-allowed opacity-50' : ''}
                                />
                                <span className={!isOwner ? 'text-gray-400' : ''}>{MODULE_LABELS[perm.module] || perm.module}</span>
                              </label>
                            ))}
                          </div>
                          {!isOwner && (
                            <div className="text-xs text-gray-500 mt-2">
                              Solo el usuario principal puede modificar permisos
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <button 
                            onClick={() => deleteRole(row.role.id)} 
                            disabled={!isOwner}
                            className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                    {roles.length === 0 && (
                      <tr><td colSpan={3} className="px-4 py-6 text-center text-sm text-gray-500">No roles yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Create User */}
            <div className="bg-white rounded-2xl shadow-sm border border-[#E0E7C8] p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Create User</h3>
                {!isOwner && (
                  <span className="text-xs text-gray-500">Only the primary account owner can create users</span>
                )}
              </div>
              <div className="flex flex-col md:flex-row gap-3 md:items-end">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={newUserEmail}
                    onChange={e => setNewUserEmail(e.target.value)}
                    disabled={!isOwner}
                    className="w-full p-2 border border-[#E2D6BD] rounded-lg focus:ring-2 focus:ring-[#C6B383] focus:border-[#C6B383] disabled:bg-gray-100 disabled:cursor-not-allowed"
                    placeholder="usuario@gmail.com"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <input
                    type="password"
                    value={newUserPassword}
                    onChange={e => setNewUserPassword(e.target.value)}
                    disabled={!isOwner}
                    className="w-full p-2 border border-[#E2D6BD] rounded-lg focus:ring-2 focus:ring-[#C6B383] focus:border-[#C6B383] disabled:bg-gray-100 disabled:cursor-not-allowed"
                    placeholder="At least 6 characters"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                  <select
                    value={newUserRoleId}
                    onChange={e => setNewUserRoleId(e.target.value)}
                    disabled={!isOwner}
                    className="w-full p-2 border border-[#E2D6BD] rounded-lg focus:ring-2 focus:ring-[#C6B383] focus:border-[#C6B383] disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    <option value="">Select…</option>
                    {roles.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={createUser}
                  disabled={!isOwner || creatingUser || !newUserEmail || !newUserPassword || !newUserRoleId}
                  className="px-4 py-2 bg-[#3E4D2C] text-white rounded-lg hover:bg-[#2D3A1C] whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed shadow shadow-[#3E4D2C]/30"
                >
                  {creatingUser ? 'Creating…' : 'Create User'}
                </button>
              </div>
            </div>

            {/* Users with assigned roles */}
            <div className="bg-white rounded-2xl shadow-sm border border-[#E0E7C8] p-6">
              <h3 className="text-lg font-semibold mb-4">Users with Assigned Roles</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {usersWithRoles.map(u => (
                      <tr key={u.id}>
                        <td className="px-4 py-2 text-sm text-gray-700">{u.email}</td>
                        <td className="px-4 py-2 text-sm text-gray-700">
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                            {u.role_name}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-sm">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            u.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {u.status === 'active' ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <div className="flex items-center justify-end space-x-2">
                            <button
                              onClick={() => toggleUserStatus(u.id, u.status)}
                              disabled={!isOwner}
                              className={`px-3 py-1 text-xs rounded ${
                                u.status === 'active'
                                  ? 'bg-yellow-600 text-white hover:bg-yellow-700'
                                  : 'bg-green-600 text-white hover:bg-green-700'
                              } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                              {u.status === 'active' ? 'Deactivate' : 'Activate'}
                            </button>
                            <button
                              onClick={() => deleteUser(u.id, u.user_role_id)}
                              disabled={!isOwner}
                              className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {usersWithRoles.length === 0 && (
                      <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-500">No users assigned</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
