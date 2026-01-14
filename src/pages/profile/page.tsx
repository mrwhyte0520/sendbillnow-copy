import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { usePlans } from '../../hooks/usePlans';
import { settingsService } from '../../services/database';

export default function ProfilePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // Obtener información del plan actual
  const { 
    currentPlan, 
    trialInfo, 
    getTrialStatus,
    // No necesitamos subscribeToPlan aquí, se usa en la página de planes
  } = usePlans();
  
  const trialStatus = getTrialStatus();
  interface Plan {
    id: string;
    name: string;
    price: number;
    features: string[];
    active: boolean;
    color?: string;
    icon?: string;
  }

  const [currentPlanState, setCurrentPlanState] = useState<Plan | null>(null);
  
  // Sincronizar el estado local con el estado global del plan
  useEffect(() => {
    setCurrentPlanState(currentPlan);
  }, [currentPlan]);
  
  // Escuchar cambios en el plan actual
  useEffect(() => {
    // Este efecto asegura que si el plan cambia en otra parte de la aplicación,
    // el perfil se actualice para reflejarlo
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'contard_current_plan' || event.key === null) {
        const savedPlan = localStorage.getItem('contard_current_plan');
        if (savedPlan) {
          try {
            const plan = JSON.parse(savedPlan);
            setCurrentPlanState(plan);
          } catch (error) {
            console.error('Error parsing saved plan:', error);
          }
        } else {
          setCurrentPlanState(null);
        }
      }
    };

    // Escuchar cambios en el localStorage
    window.addEventListener('storage', handleStorageChange);
    
    // Cargar el plan actual al montar el componente
    const savedPlan = localStorage.getItem('contard_current_plan');
    if (savedPlan) {
      try {
        const plan = JSON.parse(savedPlan);
        setCurrentPlanState(plan);
      } catch (error) {
        console.error('Error parsing saved plan:', error);
      }
    } else {
      setCurrentPlanState(null);
    }
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const [profileData, setProfileData] = useState({
    email: user?.email || '',
    fullName: '',
    phone: '',
    company: '',
    position: '',
    address: '',
    city: '',
    country: 'República Dominicana'
  });

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    loadProfileData();
  }, [user, navigate]);

  const loadProfileData = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', user?.id)
        .single();

      if (error) throw error;

      if (data) {
        let companyFromSettings: string | undefined;
        try {
          const info = await settingsService.getCompanyInfo();
          if (info && (info as any)) {
            const resolvedName =
              (info as any).name ||
              (info as any).company_name ||
              (info as any).legal_name;
            if (resolvedName) {
              companyFromSettings = String(resolvedName);
            }
          }
        } catch (e) {
          console.error('Error obteniendo información de la empresa en ProfilePage:', e);
        }

        setProfileData({
          email: data.email || user?.email || '',
          fullName: data.full_name || '',
          phone: data.phone || '',
          company: data.company || companyFromSettings || '',
          position: data.position || '',
          address: data.address || '',
          city: data.city || '',
          country: data.country || 'República Dominicana'
        });
      }
    } catch (error) {
      console.error('Error al cargar perfil:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const { error } = await supabase
        .from('users')
        .update({
          full_name: profileData.fullName,
          phone: profileData.phone,
          company: profileData.company,
          position: profileData.position,
          address: profileData.address,
          city: profileData.city,
          country: profileData.country,
          updated_at: new Date().toISOString()
        })
        .eq('id', user?.id);

      if (error) throw error;

      setMessage({ type: 'success', text: 'Perfil actualizado correctamente' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Error al actualizar perfil' });
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setMessage({ type: 'error', text: 'Las contraseñas no coinciden' });
      return;
    }

    if (passwordData.newPassword.length < 6) {
      setMessage({ type: 'error', text: 'La contraseña debe tener al menos 6 caracteres' });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const { error } = await supabase.auth.updateUser({
        password: passwordData.newPassword
      });

      if (error) throw error;

      setMessage({ type: 'success', text: 'Contraseña actualizada correctamente' });
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Error al cambiar contraseña' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <i className="ri-loader-4-line text-4xl text-blue-600 animate-spin"></i>
            <p className="mt-4 text-gray-600">Cargando perfil...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto p-6 bg-gradient-to-br from-[#f6f1e3] to-[#ebe5d5] min-h-screen">
        {/* Header */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-wide text-[#6b5c3b]">Account</p>
            <h1 className="text-3xl font-bold text-[#2f3e1e] drop-shadow-sm">My Profile</h1>
            <p className="mt-2 text-[#6b5c3b]">Manage your personal information and account settings</p>
          </div>
          <div className="flex items-center gap-2 text-[#6b5c3b] bg-white border border-[#e4d8c4] px-4 py-2 rounded-full shadow-sm">
            <i className="ri-user-settings-line text-xl"></i>
            <span className="text-sm font-medium">Settings</span>
          </div>
        </div>

        {/* Message Alert */}
        {message && (
          <div className={`mb-6 p-4 rounded-xl flex items-center ${
            message.type === 'success' 
              ? 'bg-[#e0e9cf] text-[#2f3e1e] border border-[#c6d4a8]' 
              : 'bg-[#fef2f2] text-[#991b1b] border border-[#fecaca]'
          }`}>
            <i className={`${message.type === 'success' ? 'ri-check-line' : 'ri-error-warning-line'} text-xl mr-3`}></i>
            <span>{message.text}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Profile Card */}
          <div className="lg:col-span-1">
            <div className="bg-gradient-to-br from-white to-[#faf9f5] rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-[#e8e0d0] p-6 hover:shadow-[0_12px_40px_rgb(0,128,0,0.12)] transition-all duration-300">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg mb-4">
                  <span className="text-3xl font-bold text-white">
                    {profileData.fullName?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || 'U'}
                  </span>
                </div>
                <h2 className="text-xl font-bold text-gray-900">{profileData.fullName || 'Usuario'}</h2>
                <p className="text-sm text-gray-500 mt-1">{profileData.email}</p>
                <div className="mt-4 pt-4 border-t border-gray-200">
                  {currentPlanState ? (
                    <div className="text-center">
                      <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl mb-3 ${currentPlanState.color || 'bg-gradient-to-br from-gray-500 to-gray-600'} text-white`}>
                        <i className={`${currentPlanState.icon || 'ri-vip-crown-line'} text-xl`}></i>
                      </div>
                      <h3 className="text-sm font-semibold text-gray-900 mb-1">
                        {currentPlanState.name}
                      </h3>
                      <p className="text-sm text-gray-600 mb-3">
                        Plan actual
                      </p>
                      <button
                        onClick={() => navigate('/plans')}
                        className="w-full px-4 py-2 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white rounded-lg transition-all duration-200 text-sm font-medium"
                      >
                        Gestionar Plan
                      </button>
                    </div>
                  ) : (
                    <div className="text-center">
                      <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-500 to-yellow-600 text-white mb-3">
                        <i className="ri-timer-line text-xl"></i>
                      </div>
                      <h3 className="text-sm font-semibold text-gray-900 mb-1">
                        {trialStatus === 'expired' ? 'Sin plan activo' : 'Plan de Prueba'}
                      </h3>
                      {trialStatus === 'active' && (
                        <p className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-full inline-block mb-3">
                          {trialInfo.daysLeft} días restantes
                        </p>
                      )}
                      <button
                        onClick={() => navigate('/plans')}
                        className="w-full px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-lg transition-all duration-200 text-sm font-medium"
                      >
                        Mejorar Plan
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="mt-6 bg-gradient-to-br from-white to-[#faf9f5] rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-[#e8e0d0] p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Estadísticas</h3>
              <div className="space-y-4">
                {/* Estado del Plan */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">Estado del Plan</h4>
                  <div className="bg-blue-50 p-3 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">Plan Actual</span>
                      <span className="text-sm font-semibold text-blue-700">
                        {currentPlan?.name || 'Gratis'}
                      </span>
                    </div>
                    
                    {trialStatus === 'active' && (
                      <div className="mt-2">
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-blue-600 h-2 rounded-full" 
                            style={{ width: `${(trialInfo.daysLeft / 15) * 100}%` }}
                          ></div>
                        </div>
                        <p className="text-xs text-gray-600 mt-1">
                          {trialInfo.daysLeft} días restantes de prueba
                        </p>
                      </div>
                    )}
                    
                    {trialStatus === 'expired' && (
                      <p className="text-xs text-red-600 mt-1">
                        Tu período de prueba ha expirado
                      </p>
                    )}
                  </div>
                </div>
                
                {/* Límites del Plan */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">Límites del Plan</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Empresas</span>
                      <span className="text-sm font-semibold text-gray-900">1/1</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Usuarios</span>
                      <span className="text-sm font-semibold text-gray-900">1/1</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Facturas/mes</span>
                      <span className="text-sm font-semibold text-gray-900">Ilimitadas</span>
                    </div>
                  </div>
                </div>
                
                {/* Acciones */}
                <div className="pt-2">
                  <button
                    onClick={() => navigate('/plans')}
                    className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors duration-200"
                  >
                    {trialStatus === 'expired' ? 'Actualizar Plan' : 'Ver Planes'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Forms */}
          <div className="lg:col-span-2 space-y-6">
            {/* Personal Information Form */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center mb-6">
                <i className="ri-user-line text-2xl text-blue-600 mr-3"></i>
                <h2 className="text-xl font-bold text-gray-900">Información Personal</h2>
              </div>
              
              <form onSubmit={handleProfileUpdate} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Nombre Completo
                    </label>
                    <input
                      type="text"
                      value={profileData.fullName}
                      onChange={(e) => setProfileData({ ...profileData, fullName: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Juan Pérez"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Correo Electrónico
                    </label>
                    <input
                      type="email"
                      value={profileData.email}
                      disabled
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Teléfono
                    </label>
                    <input
                      type="tel"
                      value={profileData.phone}
                      onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="(809) 555-5555"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Empresa
                    </label>
                    <input
                      type="text"
                      value={profileData.company}
                      onChange={(e) => setProfileData({ ...profileData, company: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Mi Empresa S.A."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Cargo
                    </label>
                    <input
                      type="text"
                      value={profileData.position}
                      onChange={(e) => setProfileData({ ...profileData, position: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Contador"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Ciudad
                    </label>
                    <input
                      type="text"
                      value={profileData.city}
                      onChange={(e) => setProfileData({ ...profileData, city: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Santo Domingo"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Dirección
                    </label>
                    <input
                      type="text"
                      value={profileData.address}
                      onChange={(e) => setProfileData({ ...profileData, address: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Calle Principal #123"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      País
                    </label>
                    <input
                      type="text"
                      value={profileData.country}
                      onChange={(e) => setProfileData({ ...profileData, country: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-4">
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center whitespace-nowrap"
                  >
                    {saving ? (
                      <>
                        <i className="ri-loader-4-line animate-spin mr-2"></i>
                        Guardando...
                      </>
                    ) : (
                      <>
                        <i className="ri-save-line mr-2"></i>
                        Guardar Cambios
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Change Password Form */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center mb-6">
                <i className="ri-lock-password-line text-2xl text-blue-600 mr-3"></i>
                <h2 className="text-xl font-bold text-gray-900">Cambiar Contraseña</h2>
              </div>
              
              <form onSubmit={handlePasswordChange} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nueva Contraseña
                  </label>
                  <input
                    type="password"
                    value={passwordData.newPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Mínimo 6 caracteres"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Confirmar Nueva Contraseña
                  </label>
                  <input
                    type="password"
                    value={passwordData.confirmPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Repite la contraseña"
                  />
                </div>

                <div className="flex justify-end pt-4">
                  <button
                    type="submit"
                    disabled={saving || !passwordData.newPassword || !passwordData.confirmPassword}
                    className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center whitespace-nowrap"
                  >
                    {saving ? (
                      <>
                        <i className="ri-loader-4-line animate-spin mr-2"></i>
                        Actualizando...
                      </>
                    ) : (
                      <>
                        <i className="ri-key-line mr-2"></i>
                        Cambiar Contraseña
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
