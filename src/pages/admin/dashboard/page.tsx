import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { settingsService } from '../../../services/database';

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  role?: string | null;
  status?: 'active' | 'inactive' | string | null;
  plan_id?: string | null;
  plan_status?: string | null;
  trial_end?: string | null;
  created_at?: string;
  hasAdminRole?: boolean;
  htc_portal_only?: boolean | null;
  htc_hourly_rate?: number | null;
}

const AVAILABLE_PLANS = [
  { id: 'pos-basic', name: 'Basic Plan', price: '$99.99/monthly' },
  { id: 'pos-premium', name: 'Premium Plan', price: '$399.99/monthly' },
  { id: 'student', name: 'Contractor Plan', price: '$85.00/yearly' },
];

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  const [modalType, setModalType] = useState<'plan' | 'trial' | null>(null);
  const [modalUser, setModalUser] = useState<UserRow | null>(null);
  const [selectedPlan, setSelectedPlan] = useState('');
  const [trialDays, setTrialDays] = useState(7);
  const [modalLoading, setModalLoading] = useState(false);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const data = await settingsService.getAllUsers();
      const usersWithAdmin = await Promise.all(
        ((data as any) || []).map(async (u: any) => {
          const hasAdminRole = await settingsService.checkUserHasAdminRole(String(u.id));
          return { ...u, hasAdminRole };
        })
      );
      setUsers(usersWithAdmin);
    } catch (e) {
      console.error('AdminDashboardPage loadUsers error', e);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const getPlanDisplayName = (planIdRaw: string) => {
    const pid = String(planIdRaw || '').trim();
    if (!pid) return '';
    const match = AVAILABLE_PLANS.find((p) => p.id === pid);
    return match?.name || pid;
  };

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return users;
    return users.filter((u) => {
      const email = String(u.email || '').toLowerCase();
      const name = String(u.full_name || '').toLowerCase();
      const id = String(u.id || '').toLowerCase();
      return email.includes(term) || name.includes(term) || id.includes(term);
    });
  }, [users, searchTerm]);

  const counts = useMemo(() => {
    let noPlan = 0;
    let basic = 0;
    let premium = 0;
    let contractor = 0;
    for (const u of users) {
      const planId = String((u as any)?.plan_id || '').toLowerCase();
      if (!planId) noPlan += 1;
      else if (planId === 'pos-basic') basic += 1;
      else if (planId === 'pos-premium') premium += 1;
      else if (planId === 'student') contractor += 1;
      else noPlan += 1;
    }
    return { noPlan, basic, premium, contractor, total: users.length };
  }, [users]);

  const handleToggleBan = async (u: UserRow) => {
    const nextStatus = String(u.status || 'active') === 'active' ? 'inactive' : 'active';
    try {
      await settingsService.updateUserStatus(String(u.id), nextStatus);
      await loadUsers();
    } catch (e: any) {
      alert(e?.message || 'Error updating user status');
    }
  };

  const openTrialModal = (u: UserRow) => {
    setModalUser(u);
    setTrialDays(7);
    setModalType('trial');
  };

  const openPlanModal = (u: UserRow) => {
    setModalUser(u);
    setSelectedPlan(String((u as any)?.plan_id || ''));
    setModalType('plan');
  };

  const closeModal = () => {
    setModalType(null);
    setModalUser(null);
    setSelectedPlan('');
    setTrialDays(7);
  };

  const handleConfirmTrial = async () => {
    if (!modalUser) return;
    const days = Math.floor(Number(trialDays) || 0);
    if (!Number.isFinite(days) || days <= 0) {
      alert('Días inválidos');
      return;
    }
    try {
      setModalLoading(true);
      await settingsService.extendUserTrial(String(modalUser.id), days);
      await loadUsers();
      closeModal();
    } catch (e: any) {
      alert(e?.message || 'Error extending trial');
    } finally {
      setModalLoading(false);
    }
  };

  const handleConfirmPlan = async () => {
    if (!modalUser || !selectedPlan) {
      alert('Selecciona un plan');
      return;
    }
    try {
      setModalLoading(true);
      await settingsService.updateUserPlan(String(modalUser.id), selectedPlan, 'active');
      await loadUsers();
      closeModal();
    } catch (e: any) {
      alert(e?.message || 'Error changing plan');
    } finally {
      setModalLoading(false);
    }
  };

  const handleCancelPlan = async (u: UserRow) => {
    if (!confirm('¿Cancelar plan de este usuario?')) return;
    try {
      await settingsService.cancelUserPlan(String(u.id));
      await loadUsers();
    } catch (e: any) {
      alert(e?.message || 'Error canceling plan');
    }
  };

  const handleToggleAdmin = async (u: UserRow) => {
    const action = u.hasAdminRole ? 'quitar' : 'asignar';
    if (!confirm(`¿${action.charAt(0).toUpperCase() + action.slice(1)} rol de Admin a ${u.email || u.id}?`)) return;
    try {
      await settingsService.toggleAdminRole(String(u.id));
      await loadUsers();
    } catch (e: any) {
      alert(e?.message || 'Error toggling admin role');
    }
  };

  const handleSetHtcHourlyRate = async (u: UserRow) => {
    const current = Number((u as any)?.htc_hourly_rate ?? 0) || 0;
    const raw = prompt(`Hourly rate for ${u.email || u.id}`, String(current));
    if (raw === null) return;
    const rate = Number(raw);
    if (!Number.isFinite(rate) || rate < 0) {
      alert('Invalid hourly rate');
      return;
    }
    try {
      await settingsService.updateUserHtcHourlyRate(String(u.id), rate);
      await loadUsers();
    } catch (e: any) {
      alert(e?.message || 'Error updating hourly rate');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Dashboard Administrativo</h1>
              <p className="text-gray-600 mt-1">Gestión avanzada de usuarios (ban, trial, planes)</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-3 py-1 bg-gray-200 text-gray-700 rounded-full text-sm font-medium">Sin plan: {counts.noPlan}</span>
              <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">Basic: {counts.basic}</span>
              <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm font-medium">Premium: {counts.premium}</span>
              <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm font-medium">Contractor: {counts.contractor}</span>
              <button
                onClick={() => navigate('/admin/htc-access')}
                className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800"
                disabled={loading}
              >
                HTC Access
              </button>
              <button
                onClick={loadUsers}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                disabled={loading}
              >
                <i className="ri-refresh-line mr-2"></i>
                Actualizar
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Buscar usuario</label>
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                placeholder="email, nombre o id"
              />
            </div>
            <div className="text-sm text-gray-600">Total: {filtered.length}</div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[1000px] w-full table-fixed divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Usuario</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-40">Estado</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-28">Rol</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">Trial</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-40">Plan</th>
                  <th className="px-4 py-2 pr-6 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-80">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filtered.map((u) => {
                  const status = String(u.status || 'active');
                  const isBanned = status === 'inactive';
                  const planId = String((u as any).plan_id || '').trim();
                  const planStatus = String((u as any).plan_status || '').trim();
                  const trialEndRaw = (u as any).trial_end ? new Date((u as any).trial_end) : null;
                  const trialEnd = trialEndRaw && !isNaN(trialEndRaw.getTime()) ? trialEndRaw : null;
                  const trialText = trialEnd ? trialEnd.toLocaleDateString() : '—';
                  const planText = planId
                    ? `${getPlanDisplayName(planId)}${planStatus ? ` (${planStatus})` : ''}`
                    : '—';
                  const hasAdmin = u.hasAdminRole === true;
                  return (
                    <tr key={u.id} className={isBanned ? 'bg-red-50' : ''}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate min-w-0">{u.full_name || '—'}</div>
                          {hasAdmin && (
                            <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-xs font-semibold rounded">Admin</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 truncate">{u.email || u.id}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-3 py-1.5 text-sm font-bold rounded border ${
                            status === 'active'
                              ? 'bg-green-700 text-black border-green-800'
                              : 'bg-yellow-300 text-black border-yellow-400'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                              'bg-black'
                            }`}
                          ></span>
                          {status === 'active' ? 'Activo' : 'Suspendido'}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-sm text-gray-700">{String((u as any).role || 'user')}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{trialText}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{planText}</td>
                      <td className="px-4 py-3 pr-6 text-right align-top">
                        <div className="flex items-center justify-end gap-1 flex-wrap">
                          <button
                            onClick={() => handleToggleBan(u)}
                            className={`shrink-0 px-2 py-1.5 rounded-lg text-white text-xs font-medium ${
                              isBanned ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                            }`}
                          >
                            {isBanned ? 'Activar' : 'Suspender'}
                          </button>
                          <button
                            onClick={() => handleToggleAdmin(u)}
                            className={`shrink-0 px-2 py-1.5 rounded-lg text-white text-xs font-medium ${
                              hasAdmin ? 'bg-purple-600 hover:bg-purple-700' : 'bg-gray-500 hover:bg-gray-600'
                            }`}
                          >
                            {hasAdmin ? 'Quitar Admin' : 'Dar Admin'}
                          </button>
                          <button
                            onClick={() => openTrialModal(u)}
                            className="shrink-0 px-2 py-1.5 rounded-lg text-white text-xs font-medium bg-gray-800 hover:bg-gray-900"
                          >
                            Trial
                          </button>
                          <button
                            onClick={() => openPlanModal(u)}
                            className="shrink-0 px-2 py-1.5 rounded-lg text-white text-xs font-medium bg-blue-600 hover:bg-blue-700"
                          >
                            Plan
                          </button>
                          <button
                            onClick={() => handleCancelPlan(u)}
                            className="shrink-0 px-2 py-1.5 rounded-lg text-white text-xs font-medium bg-orange-600 hover:bg-orange-700"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={() => handleSetHtcHourlyRate(u)}
                            className="shrink-0 px-2 py-1.5 rounded-lg text-white text-xs font-medium bg-teal-600 hover:bg-teal-700"
                          >
                            Rate
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal Extender Trial */}
      {modalType === 'trial' && modalUser && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-2">Extender Trial</h2>
            <p className="text-gray-600 text-sm mb-4">
              Usuario: <strong>{modalUser.email || modalUser.id}</strong>
            </p>
            <label className="block text-sm font-medium text-gray-700 mb-1">Días a agregar</label>
            <input
              type="number"
              min={1}
              value={trialDays}
              onChange={(e) => setTrialDays(Number(e.target.value) || 0)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-4 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="7"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                disabled={modalLoading}
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmTrial}
                className="px-4 py-2 text-white bg-gray-800 rounded-lg hover:bg-gray-900"
                disabled={modalLoading}
              >
                {modalLoading ? 'Guardando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Cambiar Plan */}
      {modalType === 'plan' && modalUser && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-2">Cambiar Plan</h2>
            <p className="text-gray-600 text-sm mb-4">
              Usuario: <strong>{modalUser.email || modalUser.id}</strong>
            </p>
            <label className="block text-sm font-medium text-gray-700 mb-1">Selecciona un plan</label>
            <div className="space-y-2 mb-4">
              {AVAILABLE_PLANS.map((plan) => (
                <label
                  key={plan.id}
                  className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition ${
                    selectedPlan === plan.id
                      ? 'border-green-600 bg-green-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="plan"
                    value={plan.id}
                    checked={selectedPlan === plan.id}
                    onChange={() => setSelectedPlan(plan.id)}
                    className="accent-green-600"
                  />
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900">{plan.name}</div>
                    <div className="text-sm text-gray-500">{plan.price}</div>
                  </div>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                disabled={modalLoading}
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmPlan}
                className="px-4 py-2 text-white bg-green-600 rounded-lg hover:bg-green-700"
                disabled={modalLoading || !selectedPlan}
              >
                {modalLoading ? 'Guardando...' : 'Asignar Plan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
