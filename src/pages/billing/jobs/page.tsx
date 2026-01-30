import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { jobsService } from '../../../services/database';
import { toast } from 'sonner';

type JobPortalRow = {
  id: string;
  user_id: string;
  public_token: string;
  is_active: boolean;
  positions: any;
  created_at: string;
  updated_at: string;
};

type JobApplicationRow = {
  id: string;
  user_id: string;
  portal_id: string;
  status: string;
  full_name: string;
  email: string;
  phone: string | null;
  position: string;
  answers: any;
  cv_filename: string | null;
  cv_mime: string | null;
  created_at: string;
  updated_at: string;
};

export function JobsModule() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [portal, setPortal] = useState<JobPortalRow | null>(null);
  const [applications, setApplications] = useState<JobApplicationRow[]>([]);

  const publicLink = useMemo(() => {
    if (!portal?.public_token) return '';
    return `${window.location.origin}/public/jobs/${portal.public_token}`;
  }, [portal?.public_token]);

  const visibleApplications = useMemo(() => {
    return applications.filter((a) => a.status !== 'rejected' && a.status !== 'accepted');
  }, [applications]);

  const load = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const p = (await jobsService.getOrCreatePortal(user.id)) as any;
      setPortal(p || null);
      const apps = (await jobsService.listApplications(user.id)) as any;
      setApplications(Array.isArray(apps) ? apps : []);
    } catch (e: any) {
      console.error('JobsPage load error', e);
      toast.error(e?.message || 'No se pudo cargar el módulo de empleos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleCopyLink = async () => {
    if (!publicLink) return;
    try {
      await navigator.clipboard.writeText(publicLink);
      toast.success('Link copiado');
    } catch {
      toast.error('No se pudo copiar el link');
    }
  };

  const handleAccept = async (id: string) => {
    try {
      await jobsService.updateApplicationStatus(id, 'accepted');
      setApplications((prev) => prev.filter((a) => a.id !== id));
      toast.success('Solicitud aceptada');
    } catch (e: any) {
      console.error('update status error', e);
      toast.error(e?.message || 'No se pudo aceptar la solicitud');
    }
  };

  const handleReject = async (id: string) => {
    try {
      await jobsService.updateApplicationStatus(id, 'rejected');
      setApplications((prev) => prev.filter((a) => a.id !== id));
      toast.success('Solicitud rechazada');
    } catch (e: any) {
      console.error('update status error', e);
      toast.error(e?.message || 'No se pudo rechazar la solicitud');
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#008000]/10 rounded-lg">
            <i className="ri-briefcase-4-line text-2xl text-[#008000]"></i>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Empleos</h1>
            <p className="text-gray-600">Gestiona solicitudes de empleo y el portal público</p>
          </div>
        </div>
        <button
          onClick={load}
          className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
        >
          <i className="ri-refresh-line"></i>
          Actualizar
        </button>
      </div>

      {!user?.id ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <p className="text-gray-700">Debes iniciar sesión.</p>
        </div>
      ) : loading ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <p className="text-gray-700">Cargando...</p>
        </div>
      ) : !portal ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <p className="text-gray-700">No se pudo inicializar el portal de empleos.</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <div className="flex-1">
                <p className="text-sm text-gray-500">Enlace público</p>
                <p className="font-medium text-gray-900 break-all">{publicLink}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCopyLink}
                  className="px-4 py-2 bg-gradient-to-r from-[#0A8A0A] to-[#006B00] text-white rounded-lg font-medium hover:from-[#097509] hover:to-[#005300] flex items-center gap-2"
                >
                  <i className="ri-file-copy-line"></i>
                  Copiar enlace
                </button>
                <a
                  href={publicLink}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
                >
                  <i className="ri-external-link-line"></i>
                  Abrir
                </a>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-200 flex items-center gap-3">
              <div className="font-semibold text-gray-900">Solicitudes</div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Candidato</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Correo</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Posición</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Estado</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Fecha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {visibleApplications.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-gray-600" colSpan={5}>
                        No hay solicitudes.
                      </td>
                    </tr>
                  ) : (
                    visibleApplications.map((a) => (
                      <tr key={a.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{a.full_name}</td>
                        <td className="px-4 py-3 text-gray-700">{a.email}</td>
                        <td className="px-4 py-3 text-gray-700">{a.position}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleAccept(a.id)}
                              className="px-3 py-2 bg-gradient-to-r from-[#0A8A0A] to-[#006B00] text-white rounded-lg text-sm font-medium hover:from-[#097509] hover:to-[#005300]"
                            >
                              Aceptar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReject(a.id)}
                              className="px-3 py-2 border border-red-300 text-red-700 rounded-lg text-sm font-medium hover:bg-red-50"
                            >
                              Rechazar
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {new Date(a.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function JobsPage() {
  return (
    <DashboardLayout>
      <JobsModule />
    </DashboardLayout>
  );
}
