import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { useAuth } from '../../hooks/useAuth';
import { usePlanPermissions } from '../../hooks/usePlanPermissions';
import { supabase } from '../../lib/supabase';
import { jobsService, resolveTenantId, settingsService } from '../../services/database';
import { JobsModule } from '../billing/jobs/page';

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
  const { limits } = usePlanPermissions();

  const [activeDepartment, setActiveDepartment] = useState<'roles' | 'employee' | 'jobs' | 'idcards'>('roles');

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

  const [acceptedApplicants, setAcceptedApplicants] = useState<Array<{ email: string; position: string }>>([]);
  const [showApplicantSuggestions, setShowApplicantSuggestions] = useState(false);

  const [selectedCardUserId, setSelectedCardUserId] = useState('');
  const [cardFullName, setCardFullName] = useState('');
  const [cardDepartment, setCardDepartment] = useState('');
  const [cardEmployeeId, setCardEmployeeId] = useState('');
  const [cardBloodGroup, setCardBloodGroup] = useState('');
  const [cardPhone, setCardPhone] = useState('');
  const [cardEmail, setCardEmail] = useState('');
  const [cardAddress, setCardAddress] = useState('');
  const [cardPhotoUrl, setCardPhotoUrl] = useState<string>('');
  const [cardPhotoName, setCardPhotoName] = useState('');
  const [cardPhotoDataUrl, setCardPhotoDataUrl] = useState('');
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const [companyName, setCompanyName] = useState('');
  const [companyLogoUrl, setCompanyLogoUrl] = useState('');
  const [companyLogoDataUrl, setCompanyLogoDataUrl] = useState('');

  const companyLogoSrc = useMemo(() => companyLogoDataUrl || companyLogoUrl, [companyLogoDataUrl, companyLogoUrl]);

  const [idCardPublicToken, setIdCardPublicToken] = useState('');
  const [idCardPublicUrl, setIdCardPublicUrl] = useState('');
  const [idCardQrDataUrl, setIdCardQrDataUrl] = useState('');
  const [idCardQrError, setIdCardQrError] = useState('');

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

    // Check user limit based on plan
    if (limits.users !== -1 && usersWithRoles.length >= limits.users) {
      alert(`You have reached the maximum number of users (${limits.users}) for your plan. Please upgrade to add more users.`);
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

  const loadAcceptedApplicants = async () => {
    if (!user?.id) return;
    try {
      const apps = (await jobsService.listApplications(user.id)) as any[];
      const items = (apps || [])
        .filter((a: any) => String(a?.status || '').toLowerCase() === 'accepted')
        .map((a: any) => ({
          email: String(a?.email || '').trim().toLowerCase(),
          position: String(a?.position || '').trim(),
        }))
        .filter((x: any) => x.email.length > 0);

      const seen = new Set<string>();
      const unique = items.filter((x: any) => {
        if (seen.has(x.email)) return false;
        seen.add(x.email);
        return true;
      });

      setAcceptedApplicants(unique);
    } catch {
      setAcceptedApplicants([]);
    }
  };

  const filteredApplicantSuggestions = useMemo(() => {
    const q = newUserEmail.trim().toLowerCase();
    if (!q) return acceptedApplicants;
    return acceptedApplicants.filter((a) => a.email.includes(q));
  }, [acceptedApplicants, newUserEmail]);

  const applyApplicantSuggestion = (email: string, position: string) => {
    setNewUserEmail(email);
    const match = roles.find((r) => String(r?.name || '').trim().toLowerCase() === String(position || '').trim().toLowerCase());
    if (match) setNewUserRoleId(match.id);
    setShowApplicantSuggestions(false);
  };

  useEffect(() => {
    loadAcceptedApplicants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    // Refresh suggestions when returning to Roles tab (after accepting in Jobs)
    if (activeDepartment === 'roles') {
      loadAcceptedApplicants();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDepartment]);

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
        if (data) {
          setNewRoleName('');
          setNewRoleDesc('');
          await load();
          try {
            await jobsService.syncPortalPositionsFromRoles(user.id);
          } catch {}
          return;
        }
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
        try {
          await jobsService.syncPortalPositionsFromRoles(user.id);
        } catch {}
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

  const selectedCardUser = useMemo(() => {
    if (!selectedCardUserId) return null;
    return usersWithRoles.find((u) => u.id === selectedCardUserId) || null;
  }, [selectedCardUserId, usersWithRoles]);

  useEffect(() => {
    if (!selectedCardUser) return;
    const email = String(selectedCardUser.email || '').trim();
    const defaultName = email && email.includes('@') ? email.split('@')[0] : email;
    setCardFullName(defaultName);
    setCardDepartment(String(selectedCardUser.role_name || '').trim());
    setCardEmployeeId(String(selectedCardUser.id || '').slice(0, 8).toUpperCase());
    setCardEmail(email);
  }, [selectedCardUser]);

  useEffect(() => {
    const loadCompany = async () => {
      try {
        const info: any = await settingsService.getCompanyInfo();
        const resolvedName =
          (info as any)?.name ||
          (info as any)?.company_name ||
          (info as any)?.legal_name ||
          '';
        setCompanyName(String(resolvedName || '').trim());

        const logo = String((info as any)?.logo || '').trim();
        setCompanyLogoUrl(logo);

        // Try to convert logo URL to DataURL for reliable printing
        if (logo && /^https?:\/\//i.test(logo)) {
          try {
            const res = await fetch(logo);
            const blob = await res.blob();
            const dataUrl = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
              reader.onerror = () => resolve('');
              reader.readAsDataURL(blob);
            });
            setCompanyLogoDataUrl(dataUrl);
          } catch {
            setCompanyLogoDataUrl('');
          }
        } else {
          setCompanyLogoDataUrl('');
        }
      } catch {
        setCompanyName('');
        setCompanyLogoUrl('');
        setCompanyLogoDataUrl('');
      }
    };

    loadCompany();
  }, [user?.id]);

  useEffect(() => {
    const syncPublicCard = async () => {
      if (!user?.id) return;
      if (!selectedCardUserId) {
        setIdCardPublicToken('');
        setIdCardPublicUrl('');
        setIdCardQrDataUrl('');
        setIdCardQrError('');
        return;
      }

      try {
        const tenantId = (await resolveTenantId(user.id)) || user.id;
        if (!tenantId) return;

        const payload = {
          companyName: companyName || null,
          companyLogo: (companyLogoDataUrl || companyLogoUrl) || null,
          fullName: cardFullName || null,
          department: cardDepartment || null,
          employeeId: cardEmployeeId || null,
          bloodGroup: cardBloodGroup || null,
          phone: cardPhone || null,
          email: cardEmail || null,
          address: cardAddress || null,
          photoDataUrl: cardPhotoDataUrl || null,
        };

        const { data, error } = await supabase
          .from('public_id_cards')
          .upsert(
            {
              tenant_id: tenantId,
              employee_user_id: selectedCardUserId,
              payload,
              public_expires_at: null,
            },
            { onConflict: 'tenant_id,employee_user_id' },
          )
          .select('public_token')
          .single();
        if (error) throw error;

        const token = String((data as any)?.public_token || '').trim();
        if (!token) return;
        setIdCardPublicToken(token);

        const url = `${window.location.origin}/public/id-card/${encodeURIComponent(token)}`;
        setIdCardPublicUrl(url);

        const qr = await QRCode.toDataURL(url, {
          margin: 0,
          width: 240,
          errorCorrectionLevel: 'M',
          color: { dark: '#0f172a', light: '#ffffff' },
        });
        setIdCardQrDataUrl(qr);
        setIdCardQrError('');
      } catch {
        // If the table/RPC doesn't exist yet in this environment, keep UI working.
        setIdCardPublicToken('');
        setIdCardPublicUrl('');
        setIdCardQrDataUrl('');
        setIdCardQrError('QR could not be generated. Please apply the Supabase migration for public_id_cards and verify RLS permissions.');
      }
    };

    // Debounce slightly to avoid spamming upserts while typing
    const t = window.setTimeout(() => { void syncPublicCard(); }, 350);
    return () => window.clearTimeout(t);
  }, [
    user?.id,
    selectedCardUserId,
    companyName,
    companyLogoUrl,
    companyLogoDataUrl,
    cardFullName,
    cardDepartment,
    cardEmployeeId,
    cardBloodGroup,
    cardPhone,
    cardEmail,
    cardAddress,
    cardPhotoDataUrl,
  ]);

  useEffect(() => {
    return () => {
      if (cardPhotoUrl && cardPhotoUrl.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(cardPhotoUrl);
        } catch {
          // ignore
        }
      }
    };
  }, [cardPhotoUrl]);

  const handlePrintIdCard = () => {
    const safe = (v: any) => String(v ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    }[c] as string));

    const photoHtml = cardPhotoDataUrl
      ? `<img src="${safe(cardPhotoDataUrl)}" alt="photo" />`
      : (cardPhotoUrl ? `<img src="${safe(cardPhotoUrl)}" alt="photo" />` : '👤');

    const logoHtml = companyLogoDataUrl
      ? `<img class="company-logo" src="${safe(companyLogoDataUrl)}" alt="logo" />`
      : (companyLogoUrl ? `<img class="company-logo" src="${safe(companyLogoUrl)}" alt="logo" />` : '🏢');

    const qrHtml = idCardQrDataUrl
      ? `<img class="qr-img" src="${safe(idCardQrDataUrl)}" alt="QR" />`
      : '▦▦▦<br/>▦▦▦<br/>▦▦▦';

    const headerTitle = safe(companyName || 'Company');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ID Card</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; }
    body { font-family: Arial, sans-serif; background: #f3f4f6; padding: 20px; }
    .print-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .card-container { display: block; }
    .id-card { width: 350px; height: 550px; background: white; border-radius: 22px; overflow: hidden; box-shadow: 0 18px 55px rgba(0,0,0,0.22); position: relative; border: 1px solid rgba(229,231,235,0.9); }
    .scale-wrap { width: 100%; height: 100%; position: relative; }
    .pattern { position: absolute; inset: 0; pointer-events: none; opacity: 0.10; background-image: radial-gradient(circle at 20px 20px, rgba(2,132,199,0.35) 1px, transparent 1px); background-size: 22px 22px; mix-blend-mode: multiply; }
    .accent-strip { position: absolute; left: 0; right: 0; bottom: 0; height: 10px; background: linear-gradient(90deg, #2563eb, #06b6d4, #22c55e); opacity: 0.95; }
    .footer { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: 12px; padding-top: 10px; border-top: 1px solid rgba(226,232,240,0.9); }
    .footer-text { font-size: 11px; color: #64748b; font-weight: 600; letter-spacing: 0.4px; }
    .microtext { font-size: 10px; color: #94a3b8; letter-spacing: 0.8px; text-transform: uppercase; }
    .wave-bg { position: absolute; width: 100%; height: 100%; overflow: hidden; }
    .wave { position: absolute; width: 200%; height: 200%; background: linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%); border-radius: 45%; }
    .wave-top { top: -120%; left: -50%; opacity: 0.1; }
    .wave-bottom { bottom: -120%; right: -50%; opacity: 0.15; }
    .card-front, .card-back { position: relative; z-index: 1; padding: 30px; height: 100%; display: flex; flex-direction: column; }
    .card-front { background: linear-gradient(to bottom, #1e293b 0%, #1e293b 35%, white 35%, white 100%); }
    .header { display: flex; align-items: center; gap: 14px; margin-bottom: 28px; }
    .logo { width: 60px; height: 60px; background: radial-gradient(circle at 30% 30%, rgba(255,255,255,0.18), rgba(255,255,255,0.0) 55%), linear-gradient(135deg, #3b82f6, #06b6d4); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 30px; color: white; overflow: hidden; box-shadow: 0 14px 30px rgba(59,130,246,0.22); border: 1px solid rgba(255,255,255,0.10); }
    .company-logo { width: 100%; height: 100%; object-fit: cover; display: block; }
    .hospital-name { color: white; font-weight: 800; font-size: 18px; line-height: 1.1; text-transform: uppercase; letter-spacing: 0.6px; max-width: 235px; }
    .photo-container { width: 180px; height: 180px; background: linear-gradient(135deg, #3b82f6, #06b6d4); border-radius: 30px; padding: 8px; margin: 0 auto 20px; box-shadow: 0 10px 30px rgba(59, 130, 246, 0.3); }
    .photo { width: 100%; height: 100%; background: #e5e7eb; border-radius: 25px; overflow: hidden; display: flex; align-items: center; justify-content: center; }
    .photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .doctor-name { font-size: 30px; font-weight: 800; color: #0f172a; margin-bottom: 6px; text-align: center; letter-spacing: -0.5px; }
    .specialty { background: linear-gradient(135deg, #3b82f6, #06b6d4); color: white; padding: 8px 20px; border-radius: 20px; display: inline-block; font-size: 14px; font-weight: bold; text-transform: uppercase; margin: 0 auto 20px; }
    .info-table { width: 100%; margin-top: auto; }
    .info-row { display: flex; border-bottom: 1px solid #e5e7eb; padding: 12px 0; }
    .info-label { font-weight: 700; color: #0f172a; width: 40%; font-size: 12px; text-transform: uppercase; letter-spacing: 0.6px; }
    .info-value { color: #334155; width: 60%; font-size: 14px; font-weight: 600; }
    .qr-code { width: 60px; height: 60px; background: #0f172a; position: absolute; bottom: 18px; right: 18px; display: flex; align-items: center; justify-content: center; border-radius: 12px; font-size: 10px; color: white; border: 1px solid rgba(255,255,255,0.10); box-shadow: 0 14px 30px rgba(15,23,42,0.26); overflow: hidden; }
    .qr-code::after { content: ''; position: absolute; inset: 8px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.12); }
    .qr-img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .card-back { background: linear-gradient(180deg, #f0f9ff 0%, #ffffff 55%, #ffffff 100%); }
    .card-back .hospital-name { color: #1e293b; }
    .contact-info { margin-bottom: 30px; }
    .contact-row { display: flex; align-items: center; margin-bottom: 15px; padding-bottom: 15px; border-bottom: 2px solid #e5e7eb; }
    .contact-label { font-weight: bold; color: #1e293b; width: 100px; font-size: 14px; }
    .contact-value { color: #475569; font-size: 14px; flex: 1; }
    .disclaimer { background: linear-gradient(135deg, #2563eb, #06b6d4); padding: 16px; border-radius: 16px; margin-bottom: 20px; box-shadow: 0 12px 30px rgba(37, 99, 235, 0.20); }
    .disclaimer-title { color: white; font-weight: bold; font-size: 16px; margin-bottom: 10px; text-transform: uppercase; }
    .disclaimer-text { color: white; font-size: 12px; line-height: 1.5; display: flex; align-items: start; gap: 10px; }
    .check-icon { width: 20px; height: 20px; background: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #3b82f6; font-weight: bold; flex-shrink: 0; }
    .signature-section { margin-top: auto; text-align: center; padding-top: 20px; border-top: 2px solid #1e293b; }
    .signature-label { font-weight: bold; color: #1e293b; font-size: 14px; text-transform: uppercase; }
    @media print {
      @page { margin: 10mm; }
      html, body { height: auto; }
      body { background: white !important; padding: 0 !important; margin: 0 !important; }

      /* Preserve gradients/backgrounds when printing (user may still need to enable “Background graphics”). */
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }

      .print-page { page-break-after: always; break-after: page; }
      .print-page:last-child { page-break-after: auto; break-after: auto; }

      /* Bigger on page (not real ID size) */
      .id-card {
        margin: 0;
        box-shadow: none;
        page-break-inside: avoid;
        break-inside: avoid-page;
        transform: scale(1.25);
        transform-origin: center;
      }
      .scale-wrap { transform: none; }
    }
  </style>
</head>
<body>
  <div class="card-container">
    <div class="print-page">
      <div class="id-card">
        <div class="scale-wrap">
          <div class="pattern"></div>
          <div class="wave-bg"><div class="wave wave-top"></div><div class="wave wave-bottom"></div></div>
          <div class="card-front">
            <div class="header">
              <div class="logo">${logoHtml}</div>
              <div class="hospital-name">${headerTitle}<br/>ID CARD</div>
            </div>
            <div class="photo-container"><div class="photo">${photoHtml}</div></div>
            <div class="doctor-name">${safe(cardFullName)}</div>
            <div class="specialty">${safe(cardDepartment)}</div>
            <div class="info-table">
              <div class="info-row"><div class="info-label">Department:</div><div class="info-value">${safe(cardDepartment)}</div></div>
              <div class="info-row"><div class="info-label">Employee ID:</div><div class="info-value">${safe(cardEmployeeId)}</div></div>
              <div class="info-row"><div class="info-label">Blood Group:</div><div class="info-value">${safe(cardBloodGroup)}</div></div>
            </div>
            <div class="footer">
              <div class="footer-text">${safe((companyName || 'company').toLowerCase().replace(/\s+/g, ''))}.com</div>
              <div class="microtext">Issued ${safe(new Date().toISOString().slice(0, 10))}</div>
            </div>
            <div class="qr-code">${qrHtml}</div>
            <div class="accent-strip"></div>
          </div>
        </div>
      </div>
    </div>

    <div class="print-page">
      <div class="id-card">
        <div class="scale-wrap">
          <div class="pattern"></div>
          <div class="wave-bg"><div class="wave wave-top"></div><div class="wave wave-bottom"></div></div>
          <div class="card-back">
            <div class="header">
              <div class="logo">${logoHtml}</div>
              <div class="hospital-name">${headerTitle}<br/>ID CARD</div>
            </div>
            <div class="contact-info">
              <div class="contact-row"><div class="contact-label">Phone:</div><div class="contact-value">${safe(cardPhone)}</div></div>
              <div class="contact-row"><div class="contact-label">Email:</div><div class="contact-value">${safe(cardEmail)}</div></div>
              <div class="contact-row"><div class="contact-label">Address:</div><div class="contact-value">${safe(cardAddress)}</div></div>
            </div>
            <div class="disclaimer">
              <div class="disclaimer-title">Disclaimer:</div>
              <div class="disclaimer-text"><div class="check-icon">✓</div><div>This ID card is the property of the company and must be returned upon request or termination of employment.</div></div>
            </div>
            <div class="signature-section"><div class="signature-label">Authorized Signature</div></div>
            <div class="footer">
              <div class="footer-text">${safe((companyName || 'company').toLowerCase().replace(/\s+/g, ''))}.com</div>
              <div class="microtext">Keep this card safe</div>
            </div>
            <div class="qr-code">${qrHtml}</div>
            <div class="accent-strip"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <script>
    (function(){
      function done(){
        setTimeout(function(){
          try { window.focus(); } catch(e) {}
          try { window.print(); } catch(e) {}
        }, 250);
      }
      var img = document.querySelector('.photo img');
      if (!img) return done();
      if (img.complete) return done();
      img.addEventListener('load', done);
      img.addEventListener('error', done);
    })();
  </script>
</body>
</html>`;

    // Print via hidden iframe to avoid popup blockers.
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(iframe);

    const cleanup = () => {
      try {
        document.body.removeChild(iframe);
      } catch {
        // ignore
      }
    };

    const win = iframe.contentWindow;
    const doc = iframe.contentDocument || win?.document;
    if (!doc) {
      cleanup();
      alert('Could not open print preview.');
      return;
    }
    doc.open();
    doc.write(html);
    doc.close();

    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } finally {
        window.setTimeout(cleanup, 2_000);
      }
    };
  };

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
            <button
              type="button"
              onClick={() => setActiveDepartment('jobs')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                activeDepartment === 'jobs'
                  ? 'bg-[#566738] text-white shadow shadow-[#566738]/30'
                  : 'bg-[#FBF8EE] text-[#3E4D2C] border border-[#E2D6BD] hover:bg-[#F4EEDC]'
              }`}
            >
              Jobs
            </button>
            <button
              type="button"
              onClick={() => setActiveDepartment('idcards')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                activeDepartment === 'idcards'
                  ? 'bg-[#566738] text-white shadow shadow-[#566738]/30'
                  : 'bg-[#FBF8EE] text-[#3E4D2C] border border-[#E2D6BD] hover:bg-[#F4EEDC]'
              }`}
            >
              ID Cards
            </button>
          </div>
        </div>

        {activeDepartment === 'jobs' ? (
          <div className="bg-white rounded-2xl shadow-sm border border-[#E0E7C8]">
            <JobsModule />
          </div>
        ) : activeDepartment === 'idcards' ? (
          <div className="bg-white rounded-2xl shadow-sm border border-[#E0E7C8] p-6">
            <div className="flex items-start justify-between gap-4 flex-col lg:flex-row">
              <div>
                <h3 className="text-lg font-semibold text-[#1F2618]">Employee ID Cards</h3>
                <p className="text-sm text-[#5B6844]">Select an employee, upload a photo, preview, and print an ID card.</p>
              </div>
              <button
                type="button"
                onClick={handlePrintIdCard}
                disabled={!selectedCardUserId}
                className="px-4 py-2 bg-[#566738] text-white rounded-lg hover:bg-[#45532B] whitespace-nowrap shadow shadow-[#566738]/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Print
              </button>
            </div>

            <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-2xl border border-[#E0E7C8] p-4">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Employee</label>
                    <select
                      value={selectedCardUserId}
                      onChange={(e) => setSelectedCardUserId(e.target.value)}
                      className="w-full p-2 border border-[#E2D6BD] rounded-lg focus:ring-2 focus:ring-[#C6B383] focus:border-[#C6B383]"
                    >
                      <option value="">Select…</option>
                      {usersWithRoles.map((u) => (
                        <option key={u.id} value={u.id}>{u.email} ({u.role_name})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Public link (QR)</label>
                    <div className="flex items-center gap-2">
                      <input
                        value={idCardPublicUrl || ''}
                        readOnly
                        className="flex-1 p-2 border border-[#E2D6BD] rounded-lg bg-gray-50"
                        placeholder="Select an employee to generate link"
                      />
                      <button
                        type="button"
                        disabled={!idCardPublicUrl}
                        onClick={async () => {
                          try {
                            if (!idCardPublicUrl) return;
                            await navigator.clipboard.writeText(idCardPublicUrl);
                          } catch {
                            // ignore
                          }
                        }}
                        className="px-3 py-2 border border-[#E2D6BD] rounded-lg bg-white hover:bg-[#F4EEDC] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Copy
                      </button>
                    </div>
                    {idCardPublicToken ? (
                      <div className="text-xs text-gray-500 mt-1">Token: {idCardPublicToken}</div>
                    ) : null}
                    {idCardQrError ? (
                      <div className="text-xs text-red-600 mt-1">{idCardQrError}</div>
                    ) : null}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Photo</label>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const url = URL.createObjectURL(f);
                        setCardPhotoUrl(url);
                        setCardPhotoName(f.name || '');

                        const reader = new FileReader();
                        reader.onload = () => {
                          const result = typeof reader.result === 'string' ? reader.result : '';
                          setCardPhotoDataUrl(result);
                        };
                        reader.onerror = () => {
                          setCardPhotoDataUrl('');
                        };
                        reader.readAsDataURL(f);
                      }}
                      className="hidden"
                    />
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => photoInputRef.current?.click()}
                        className="px-4 py-2 border border-[#E2D6BD] rounded-lg bg-white hover:bg-[#F4EEDC]"
                      >
                        Choose file
                      </button>
                      <div className="text-sm text-gray-600 truncate">
                        {cardPhotoName ? cardPhotoName : 'No file chosen'}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
                      <input value={cardFullName} onChange={(e) => setCardFullName(e.target.value)} className="w-full p-2 border border-[#E2D6BD] rounded-lg" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                      <input value={cardDepartment} onChange={(e) => setCardDepartment(e.target.value)} className="w-full p-2 border border-[#E2D6BD] rounded-lg" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Employee ID</label>
                      <input value={cardEmployeeId} onChange={(e) => setCardEmployeeId(e.target.value)} className="w-full p-2 border border-[#E2D6BD] rounded-lg" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Blood group</label>
                      <input value={cardBloodGroup} onChange={(e) => setCardBloodGroup(e.target.value)} className="w-full p-2 border border-[#E2D6BD] rounded-lg" placeholder="Optional" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                      <input value={cardPhone} onChange={(e) => setCardPhone(e.target.value)} className="w-full p-2 border border-[#E2D6BD] rounded-lg" placeholder="Optional" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                      <input value={cardEmail} onChange={(e) => setCardEmail(e.target.value)} className="w-full p-2 border border-[#E2D6BD] rounded-lg" placeholder="Optional" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                    <input value={cardAddress} onChange={(e) => setCardAddress(e.target.value)} className="w-full p-2 border border-[#E2D6BD] rounded-lg" placeholder="Optional" />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-[#E0E7C8] p-4">
                <div className="flex flex-wrap gap-4 justify-center">
                  <div className="w-[350px] h-[550px] bg-white rounded-[20px] overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.15)] relative">
                    <div className="absolute inset-0 overflow-hidden">
                      <div className="absolute w-[200%] h-[200%] rounded-[45%] bg-gradient-to-br from-[#3b82f6] to-[#06b6d4] top-[-120%] left-[-50%] opacity-10" />
                      <div className="absolute w-[200%] h-[200%] rounded-[45%] bg-gradient-to-br from-[#3b82f6] to-[#06b6d4] bottom-[-120%] right-[-50%] opacity-15" />
                    </div>
                    <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 20px 20px, rgba(2,132,199,0.35) 1px, transparent 1px)', backgroundSize: '22px 22px', mixBlendMode: 'multiply' }} />
                    <div className="relative z-[1] p-[30px] h-full flex flex-col" style={{ background: 'linear-gradient(to bottom, #1e293b 0%, #1e293b 35%, white 35%, white 100%)' }}>
                      <div className="flex items-center gap-3 mb-7">
                        <div className="w-[60px] h-[60px] rounded-full flex items-center justify-center text-white text-2xl overflow-hidden shadow-[0_14px_30px_rgba(59,130,246,0.22)] border border-white/10" style={{ background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.18), rgba(255,255,255,0.0) 55%), linear-gradient(135deg, #3b82f6, #06b6d4)' }}>
                          {companyLogoSrc ? <img src={companyLogoSrc} alt="Logo" className="w-full h-full object-cover" /> : '🏢'}
                        </div>
                        <div className="text-white font-extrabold text-[18px] leading-[1.1] uppercase tracking-[0.6px] max-w-[235px]">
                          {(companyName || 'Company')}<br />ID Card
                        </div>
                      </div>
                      <div className="w-[180px] h-[180px] rounded-[30px] p-2 mx-auto mb-5 shadow-[0_10px_30px_rgba(59,130,246,0.3)]" style={{ background: 'linear-gradient(135deg, #3b82f6, #06b6d4)' }}>
                        <div className="w-full h-full bg-[#e5e7eb] rounded-[25px] overflow-hidden flex items-center justify-center text-5xl text-[#9ca3af]">
                          {cardPhotoUrl ? <img src={cardPhotoUrl} alt="Employee" className="w-full h-full object-cover" /> : '👤'}
                        </div>
                      </div>
                      <div className="text-[28px] font-extrabold text-[#0f172a] text-center mb-1 tracking-[-0.5px]">{cardFullName || 'Employee'}</div>
                      <div className="mx-auto mb-5 px-5 py-2 rounded-[20px] text-white text-[13px] font-bold uppercase" style={{ background: 'linear-gradient(135deg, #3b82f6, #06b6d4)' }}>
                        {cardDepartment || 'Department'}
                      </div>
                      <div className="w-full mt-auto">
                        <div className="flex border-b border-[#e5e7eb] py-3">
                          <div className="w-[40%] font-semibold text-[#0f172a] text-[12px] uppercase tracking-[0.6px]">Department</div>
                          <div className="w-[60%] text-[#334155] text-sm font-semibold">{cardDepartment || '—'}</div>
                        </div>
                        <div className="flex border-b border-[#e5e7eb] py-3">
                          <div className="w-[40%] font-semibold text-[#0f172a] text-[12px] uppercase tracking-[0.6px]">Employee ID</div>
                          <div className="w-[60%] text-[#334155] text-sm font-semibold">{cardEmployeeId || '—'}</div>
                        </div>
                        <div className="flex border-b border-[#e5e7eb] py-3">
                          <div className="w-[40%] font-semibold text-[#0f172a] text-[12px] uppercase tracking-[0.6px]">Blood Group</div>
                          <div className="w-[60%] text-[#334155] text-sm font-semibold">{cardBloodGroup || '—'}</div>
                        </div>
                      </div>
                      <div className="mt-3 pt-2.5 border-t border-slate-200/90 flex items-center justify-between gap-2">
                        <div className="text-[11px] text-slate-500 font-semibold tracking-[0.4px]">
                          {(companyName || 'company').toLowerCase().replace(/\s+/g, '')}.com
                        </div>
                        <div className="text-[10px] text-slate-400 tracking-[0.8px] uppercase">Issued {new Date().toISOString().slice(0, 10)}</div>
                      </div>
                      <div className="absolute bottom-5 right-5">
                        <div className="w-[64px] h-[64px] rounded-[14px] bg-white shadow-[0_12px_26px_rgba(15,23,42,0.22)] border border-slate-200 p-[4px]">
                          <div className="w-full h-full rounded-[10px] bg-[#0f172a] border border-white/10 overflow-hidden flex items-center justify-center text-white text-[10px]">
                            {idCardQrDataUrl ? <img src={idCardQrDataUrl} alt="QR" className="w-full h-full object-cover" /> : <>▦▦▦<br />▦▦▦<br />▦▦▦</>}
                          </div>
                        </div>
                      </div>
                      <div className="absolute left-0 right-0 bottom-0 h-[10px]" style={{ background: 'linear-gradient(90deg, #2563eb, #06b6d4, #22c55e)' }} />
                    </div>
                  </div>

                  <div className="w-[350px] h-[550px] bg-white rounded-[22px] overflow-hidden shadow-[0_18px_55px_rgba(0,0,0,0.15)] relative border border-[#e5e7eb]">
                    <div className="absolute inset-0 overflow-hidden">
                      <div className="absolute w-[200%] h-[200%] rounded-[45%] bg-gradient-to-br from-[#3b82f6] to-[#06b6d4] top-[-120%] left-[-50%] opacity-10" />
                      <div className="absolute w-[200%] h-[200%] rounded-[45%] bg-gradient-to-br from-[#3b82f6] to-[#06b6d4] bottom-[-120%] right-[-50%] opacity-15" />
                    </div>
                    <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 20px 20px, rgba(2,132,199,0.35) 1px, transparent 1px)', backgroundSize: '22px 22px', mixBlendMode: 'multiply' }} />
                    <div className="relative z-[1] p-[30px] h-full flex flex-col">
                      <div className="flex items-center gap-3 mb-10">
                        <div className="w-[60px] h-[60px] rounded-full flex items-center justify-center text-white text-2xl overflow-hidden shadow-[0_14px_30px_rgba(59,130,246,0.22)] border border-white/10" style={{ background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.18), rgba(255,255,255,0.0) 55%), linear-gradient(135deg, #3b82f6, #06b6d4)' }}>
                          {companyLogoSrc ? <img src={companyLogoSrc} alt="Logo" className="w-full h-full object-cover" /> : '🏢'}
                        </div>
                        <div className="text-[#0f172a] font-extrabold text-[18px] leading-[1.1] uppercase tracking-[0.6px] max-w-[235px]">
                          {(companyName || 'Company')}<br />ID Card
                        </div>
                      </div>
                      <div className="mb-7">
                        <div className="flex items-center mb-4 pb-4 border-b-2 border-[#e5e7eb]">
                          <div className="w-[100px] font-bold text-[#1e293b] text-sm">Phone:</div>
                          <div className="text-[#475569] text-sm flex-1">{cardPhone || '—'}</div>
                        </div>
                        <div className="flex items-center mb-4 pb-4 border-b-2 border-[#e5e7eb]">
                          <div className="w-[100px] font-bold text-[#1e293b] text-sm">Email:</div>
                          <div className="text-[#475569] text-sm flex-1">{cardEmail || '—'}</div>
                        </div>
                        <div className="flex items-center mb-4 pb-4 border-b-2 border-[#e5e7eb]">
                          <div className="w-[100px] font-bold text-[#1e293b] text-sm">Address:</div>
                          <div className="text-[#475569] text-sm flex-1">{cardAddress || '—'}</div>
                        </div>
                      </div>
                      <div className="p-4 rounded-[16px] mb-5 shadow-[0_12px_30px_rgba(37,99,235,0.20)]" style={{ background: 'linear-gradient(135deg, #2563eb, #06b6d4)' }}>
                        <div className="text-white font-bold text-[16px] mb-2 uppercase">Disclaimer:</div>
                        <div className="text-white text-[12px] leading-[1.5] flex items-start gap-2.5">
                          <div className="w-5 h-5 bg-white rounded-full flex items-center justify-center text-[#3b82f6] font-bold flex-shrink-0">✓</div>
                          <div>This ID card is the property of the company and must be returned upon request or termination of employment.</div>
                        </div>
                      </div>
                      <div className="mt-auto text-center pt-5 border-t-2 border-[#1e293b]">
                        <div className="font-bold text-[#1e293b] text-sm uppercase">Authorized Signature</div>
                      </div>
                      <div className="mt-3 pt-2.5 border-t border-slate-200/90 flex items-center justify-between gap-2">
                        <div className="text-[11px] text-slate-500 font-semibold tracking-[0.4px]">
                          {(companyName || 'company').toLowerCase().replace(/\s+/g, '')}.com
                        </div>
                        <div className="text-[10px] text-slate-400 tracking-[0.8px] uppercase">Keep this card safe</div>
                      </div>
                      <div className="absolute bottom-5 right-5">
                        <div className="w-[64px] h-[64px] rounded-[14px] bg-white shadow-[0_12px_26px_rgba(15,23,42,0.22)] border border-slate-200 p-[4px]">
                          <div className="w-full h-full rounded-[10px] bg-[#0f172a] border border-white/10 overflow-hidden flex items-center justify-center text-white text-[10px]">
                            {idCardQrDataUrl ? <img src={idCardQrDataUrl} alt="QR" className="w-full h-full object-cover" /> : <>▦▦▦<br />▦▦▦<br />▦▦▦</>}
                          </div>
                        </div>
                      </div>
                      <div className="absolute left-0 right-0 bottom-0 h-[10px]" style={{ background: 'linear-gradient(90deg, #2563eb, #06b6d4, #22c55e)' }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : activeDepartment === 'employee' ? (
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
                  <div className="relative">
                    <input
                      type="email"
                      value={newUserEmail}
                      onChange={e => {
                        setNewUserEmail(e.target.value);
                        setShowApplicantSuggestions(true);
                      }}
                      onFocus={() => setShowApplicantSuggestions(true)}
                      onBlur={() => {
                        // delay closing to allow click
                        window.setTimeout(() => setShowApplicantSuggestions(false), 150);
                      }}
                      disabled={!isOwner}
                      className="w-full p-2 border border-[#E2D6BD] rounded-lg focus:ring-2 focus:ring-[#C6B383] focus:border-[#C6B383] disabled:bg-gray-100 disabled:cursor-not-allowed"
                      placeholder="usuario@gmail.com"
                    />

                    {isOwner && showApplicantSuggestions && filteredApplicantSuggestions.length > 0 ? (
                      <div className="absolute z-20 mt-1 w-full bg-white border border-[#E2D6BD] rounded-lg shadow-lg overflow-hidden">
                        {filteredApplicantSuggestions.slice(0, 8).map((a) => (
                          <button
                            key={a.email}
                            type="button"
                            onClick={() => applyApplicantSuggestion(a.email, a.position)}
                            className="w-full text-left px-3 py-2 hover:bg-[#FBF8EE]"
                          >
                            <div className="text-sm text-gray-900">{a.email}</div>
                            <div className="text-xs text-gray-500">{a.position}</div>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
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
