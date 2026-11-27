import React, { useCallback, useEffect, useState } from 'react';
import { PromptVaultAPI, type VaultPromptItem } from '../utils/apiClient';
import { Download, Flag, RefreshCw, ShieldCheck, X, AlertTriangle } from 'lucide-react';

interface PromptVaultPanelProps {
  isOpen: boolean;
  onClose: () => void;
  theme?: 'dark' | 'light';
}

export const PromptVaultPanel: React.FC<PromptVaultPanelProps> = ({
  isOpen,
  onClose,
  theme = 'dark'
}) => {
  const [prompts, setPrompts] = useState<VaultPromptItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState('');

  const loadVault = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await PromptVaultAPI.list();
      setPrompts(data.prompts || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Prompt Vault');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      void loadVault();
    }
  }, [isOpen, loadVault]);

  if (!isOpen) return null;

  const handleExportVault = () => {
    const exportPayload = {
      exportedAt: new Date().toISOString(),
      totalPrompts: prompts.length,
      prompts: prompts.map((p) => ({
        vaultId: p.vaultId,
        jobId: p.jobId,
        framework: p.framework,
        frameworkVersion: p.frameworkVersion,
        attackVector: p.attackVector,
        attackName: p.attackName,
        acquiredAt: p.acquiredAt,
        payload: p.payload
      }))
    };
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ARES_VAULT_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleReportDuplicate = async (vaultId: string) => {
    if (!reportReason.trim()) {
      setError('Please enter a reason before reporting a duplicate.');
      return;
    }
    setError(null);
    setMessage(null);
    try {
      const res = await PromptVaultAPI.reportDuplicate(vaultId, reportReason.trim());
      if (res.confirmed) {
        setMessage(`Duplicate confirmed. Replacement job ${res.replacementJobId} queued at 0 credits.`);
      } else {
        setMessage('Independent evaluator reviewed this prompt and determined it is distinct (not a substantive duplicate).');
      }
      setReportingId(null);
      setReportReason('');
      await loadVault();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit duplicate report');
    }
  };

  const isLight = theme === 'light';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div
        className={`w-full max-w-4xl max-h-[85vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden ${
          isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-slate-100'
        }`}
      >
        <div className={`flex items-center justify-between px-6 py-4 border-b ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-teal-400" />
            <div>
              <h2 className="text-lg font-bold">Customer Prompt Vault</h2>
              <p className={`text-xs ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                Delivered, originality-verified prompts from your completed generation jobs.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportVault}
              disabled={prompts.length === 0}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Export JSON
            </button>
            <button
              onClick={loadVault}
              disabled={loading}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 ${
                isLight ? 'border-slate-200 hover:bg-slate-100' : 'border-slate-700 hover:bg-slate-800'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={onClose}
              aria-label="Close Prompt Vault"
              className={`p-1.5 rounded-lg ${isLight ? 'hover:bg-slate-100 text-slate-600' : 'hover:bg-slate-800 text-slate-400'}`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3 rounded-xl border border-red-500/40 bg-red-500/10 text-red-400 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {message && (
            <div className="p-3 rounded-xl border border-teal-500/40 bg-teal-500/10 text-teal-400 text-xs">
              {message}
            </div>
          )}

          {prompts.length === 0 ? (
            <div className={`text-center py-12 text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Your Prompt Vault is empty. Complete a Generation Job to receive verified prompts here.
            </div>
          ) : (
            prompts.map((item) => (
              <div
                key={item.vaultId}
                className={`p-4 rounded-xl border space-y-2 ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold">{item.attackName}</div>
                    <div className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      {item.framework} ({item.frameworkVersion}) · {item.attackVector} · Acquired {new Date(item.acquiredAt).toLocaleString()}
                    </div>
                  </div>
                  {!item.isDuplicateReported ? (
                    <button
                      onClick={() => setReportingId(reportingId === item.vaultId ? null : item.vaultId)}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 flex items-center gap-1"
                    >
                      <Flag className="w-3 h-3" />
                      Report Duplicate
                    </button>
                  ) : (
                    <span className="text-[11px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">
                      Duplicate Reported
                    </span>
                  )}
                </div>

                {item.payload?.description && (
                  <p className={`text-xs ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>{item.payload.description}</p>
                )}
                <pre className={`text-xs p-3 rounded-lg overflow-x-auto whitespace-pre-wrap border ${
                  isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-cyan-200'
                }`}>
                  {item.payload?.payload || ''}
                </pre>

                {reportingId === item.vaultId && (
                  <div className="flex items-center gap-2 pt-2">
                    <input
                      type="text"
                      value={reportReason}
                      onChange={(e) => setReportReason(e.target.value)}
                      placeholder="Describe why this prompt duplicates an existing one..."
                      className={`flex-1 text-xs px-3 py-2 rounded-lg border ${
                        isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-slate-100'
                      }`}
                    />
                    <button
                      onClick={() => handleReportDuplicate(item.vaultId)}
                      className="px-3 py-2 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white"
                    >
                      Submit
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
