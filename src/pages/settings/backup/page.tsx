import { useEffect, useState } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { settingsService, auditLogsService, dataBackupsService } from '../../../services/database';

interface BackupRecord {
  id: string;
  backup_type: string;
  backup_name: string;
  backup_date: string;
  file_size: number | null;
  status: string;
  created_at?: string;
}

export default function BackupSettingsPage() {
  const [autoBackup, setAutoBackup] = useState(true);
  const [backupFrequency, setBackupFrequency] = useState('daily');
  const [retentionDays, setRetentionDays] = useState(30);
  const [encryptBackups, setEncryptBackups] = useState(true);
  const [auditLogEnabled, setAuditLogEnabled] = useState(true);
  const [autoLogoutEnabled, setAutoLogoutEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [accountingSettings, setAccountingSettings] = useState<any | null>(null);
  const [history, setHistory] = useState<BackupRecord[]>([]);

  const handleDownloadAuditLog = async () => {
    try {
      const logs = await auditLogsService.exportLogs();
      const blob = new Blob([JSON.stringify(logs, null, 2)], {
        type: 'application/json;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-log-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading audit log:', error);
      setMessage({ type: 'error', text: 'Error downloading the audit log' });
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [acc, backups] = await Promise.all([
          settingsService.getAccountingSettings(),
          dataBackupsService.getBackups(),
        ]);
        if (acc) {
          setAccountingSettings(acc);
          setAutoBackup(acc.auto_backup ?? true);
          setBackupFrequency(acc.backup_frequency || 'daily');
          setRetentionDays(acc.retention_period ?? 30);
          setAuditLogEnabled(acc.audit_log_enabled ?? true);
          setAutoLogoutEnabled(acc.auto_logout_enabled ?? true);
        }
        setHistory(backups as BackupRecord[]);
      } catch (error) {
        console.error('Error loading backup settings:', error);
      }
    };

    load();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const payload = {
        ...(accountingSettings || {}),
        auto_backup: autoBackup,
        backup_frequency: backupFrequency,
        retention_period: retentionDays,
        audit_log_enabled: auditLogEnabled,
        auto_logout_enabled: autoLogoutEnabled,
      };
      await settingsService.saveAccountingSettings(payload);
      setAccountingSettings(payload);
      setMessage({ type: 'success', text: 'Backup configuration saved successfully' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Error saving backup settings' });
    } finally {
      setLoading(false);
    }
  };

  const handleBackupNow = async () => {
    setLoading(true);
    setMessage(null);

    try {
      const backup = await dataBackupsService.createBackup({
        backup_type: 'manual',
        backup_name: `Manual Backup - ${new Date().toLocaleString()}`,
        retention_days: retentionDays,
      });
      setHistory((prev) => [backup as BackupRecord, ...prev]);
      setMessage({ type: 'success', text: 'Backup created successfully' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Error creating the backup' });
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = (backup: BackupRecord) => {
    try {
      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: 'application/json;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${backup.backup_name || 'backup'}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading backup:', error);
    }
  };

  const handleDelete = async (backup: BackupRecord) => {
    if (!window.confirm('Delete this backup permanently?')) return;

    try {
      await dataBackupsService.deleteBackup(backup.id);
      setHistory((prev) => prev.filter((b) => b.id !== backup.id));
      setMessage({ type: 'success', text: 'Backup deleted successfully' });
    } catch (error) {
      console.error('Error deleting backup:', error);
      setMessage({ type: 'error', text: 'Error deleting the backup' });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6 bg-[#f7f3e8] min-h-screen">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm border border-[#e4d8c4] p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-wide text-[#6b5c3b]">Security</p>
              <h1 className="text-3xl font-bold text-[#2f3e1e]">Backups & Security</h1>
              <p className="text-[#6b5c3b] mt-1">
                Configure automated backups, retention policies, and audit protections.
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => window.REACT_APP_NAVIGATE('/settings')}
                className="flex items-center space-x-2 text-[#6b5c3b] hover:text-[#2f3e1e]"
              >
                <i className="ri-arrow-left-line"></i>
                <span>Back to Settings</span>
              </button>
              <button
                onClick={handleBackupNow}
                disabled={loading}
                className="bg-[#2f3e1e] text-white px-4 py-2 rounded-lg hover:bg-[#1f2a15] disabled:opacity-50 flex items-center space-x-2"
              >
                <i className="ri-download-cloud-line"></i>
                <span>{loading ? 'Creating...' : 'Backup Now'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Message */}
        {message && (
          <div className={`p-4 rounded-lg ${
            message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Backup Settings */}
          <div className="bg-white rounded-xl shadow-sm border border-[#e4d8c4] p-6">
            <h2 className="text-lg font-semibold text-[#2f3e1e] mb-4">Backup Preferences</h2>
            <div className="space-y-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="auto_backup"
                  checked={autoBackup}
                  onChange={(e) => setAutoBackup(e.target.checked)}
                  className="h-4 w-4 text-[#2f3e1e] focus:ring-[#6b8a45] border-[#d9ceb5] rounded"
                />
                <label htmlFor="auto_backup" className="ml-2 block text-sm text-[#2f3e1e]">
                  Enable automatic backups
                </label>
              </div>
              
              {autoBackup && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                  <div>
                    <label className="block text-sm font-medium text-[#4a3c23] mb-2">
                      Backup frequency
                    </label>
                    <select
                      value={backupFrequency}
                      onChange={(e) => setBackupFrequency(e.target.value)}
                      className="w-full px-3 py-2 border border-[#d9ceb5] rounded-lg focus:ring-2 focus:ring-[#6b8a45] focus:border-[#6b8a45]"
                    >
                      <option value="hourly">Hourly</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#4a3c23] mb-2">
                      Retention period (days)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="365"
                      value={retentionDays}
                      onChange={(e) => setRetentionDays(parseInt(e.target.value))}
                      className="w-full px-3 py-2 border border-[#d9ceb5] rounded-lg focus:ring-2 focus:ring-[#6b8a45] focus:border-[#6b8a45]"
                    />
                  </div>
                </div>
              )}
              
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="encrypt_backups"
                  checked={encryptBackups}
                  onChange={(e) => setEncryptBackups(e.target.checked)}
                  className="h-4 w-4 text-[#2f3e1e] focus:ring-[#6b8a45] border-[#d9ceb5] rounded"
                />
                <label htmlFor="encrypt_backups" className="ml-2 block text-sm text-[#2f3e1e]">
                  Encrypt backups at rest
                </label>
              </div>
            </div>
          </div>

          {/* Security Settings */}
          <div className="bg-white rounded-xl shadow-sm border border-[#e4d8c4] p-6">
            <h2 className="text-lg font-semibold text-[#2f3e1e] mb-4">Security Controls</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-[#f7f3e8] rounded-lg border border-[#e4d8c4]">
                  <div>
                    <h3 className="text-sm font-medium text-[#2f3e1e]">Audit log</h3>
                    <p className="text-xs text-[#6b5c3b]">Capture user activity for compliance</p>
                  </div>
                  <div className="flex items-center space-x-3">
                    <button
                      type="button"
                      onClick={handleDownloadAuditLog}
                      className="px-3 py-1 text-xs rounded bg-white text-[#2f3e1e] hover:bg-[#f3e7cf] border border-[#d9ceb5]"
                    >
                      Download log (JSON)
                    </button>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={auditLogEnabled}
                        onChange={(e) => setAuditLogEnabled(e.target.checked)}
                      />
                      <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#6b8a45] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#2f3e1e]"></div>
                    </label>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-[#f7f3e8] rounded-lg border border-[#e4d8c4]">
                  <div>
                    <h3 className="text-sm font-medium text-[#2f3e1e]">Auto sign-out</h3>
                    <p className="text-xs text-[#6b5c3b]">Force log out after inactivity</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={autoLogoutEnabled}
                      onChange={(e) => setAutoLogoutEnabled(e.target.checked)}
                    />
                    <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#6b8a45] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#2f3e1e]"></div>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-4">
            <button
              type="button"
              onClick={() => window.REACT_APP_NAVIGATE('/settings')}
              className="px-6 py-2 border border-[#d9ceb5] text-[#2f3e1e] rounded-lg hover:bg-[#f3e7cf]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-[#2f3e1e] text-white rounded-lg hover:bg-[#1f2a15] disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>

        {/* Backup History */}
        <div className="bg-white rounded-xl shadow-sm border border-[#e4d8c4]">
          <div className="p-6 border-b border-[#e4d8c4] flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#2f3e1e]">Backup history</h2>
            <span className="text-sm text-[#6b5c3b]">
              {history.length} record{history.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#f7f3e8]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[#6b5c3b] uppercase tracking-wider">
                    Date & time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[#6b5c3b] uppercase tracking-wider">
                    Size
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[#6b5c3b] uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[#6b5c3b] uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-[#f1e4cd]">
                {history.map((backup) => (
                  <tr key={backup.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[#2f3e1e]">
                      {new Date(backup.backup_date || backup.created_at || '').toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[#6b5c3b]">
                      {backup.file_size ? `${(backup.file_size / (1024 * 1024)).toFixed(2)} MB` : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                        {backup.status || 'Completed'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={() => handleDownload(backup)}
                          className="text-[#2f3e1e] hover:text-[#1f2a15]"
                        >
                          <i className="ri-download-line"></i>
                        </button>
                        <button
                          type="button"
                          className="text-[#6b5c3b] cursor-not-allowed"
                          title="Restore (coming soon)"
                          disabled
                        >
                          <i className="ri-refresh-line"></i>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(backup)}
                          className="text-red-600 hover:text-red-900"
                        >
                          <i className="ri-delete-bin-line"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}