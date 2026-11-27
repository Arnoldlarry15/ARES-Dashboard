import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  GenerationJobsAPI,
  type GenerationJobSummary,
  type UserCreditsSummary
} from '../utils/apiClient';
import { Play, RefreshCw, XCircle, CheckCircle2, AlertTriangle, Clock, Coins, X } from 'lucide-react';

interface GenerationJobsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenVault: () => void;
  selectedFramework?: string;
  frameworkVersion?: string;
  selectedTacticId?: string;
  selectedTacticName?: string;
  selectedVectors?: string[];
  objectives?: string;
  theme?: 'dark' | 'light';
}

const PACKAGE_OPTIONS: Array<{ count: 4 | 12 | 28 | 40; credits: number; label: string }> = [
  { count: 4, credits: 1, label: '4 Prompts (1 Credit)' },
  { count: 12, credits: 3, label: '12 Prompts (3 Credits)' },
  { count: 28, credits: 7, label: '28 Prompts (7 Credits)' },
  { count: 40, credits: 10, label: '40 Prompts (10 Credits)' }
];

export const GenerationJobsPanel: React.FC<GenerationJobsPanelProps> = ({
  isOpen,
  onClose,
  onOpenVault,
  selectedFramework,
  frameworkVersion = '2026',
  selectedTacticId,
  selectedTacticName,
  selectedVectors = [],
  objectives,
  theme = 'dark'
}) => {
  const [jobs, setJobs] = useState<GenerationJobSummary[]>([]);
  const [credits, setCredits] = useState<UserCreditsSummary | null>(null);
  const [packageSize, setPackageSize] = useState<4 | 12 | 28 | 40>(4);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [steppingJobId, setSteppingJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [jobList, creditBal] = await Promise.all([
        GenerationJobsAPI.list(),
        GenerationJobsAPI.getCredits()
      ]);
      setJobs(jobList);
      setCredits(creditBal);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load generation jobs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      void loadData();
    }
  }, [isOpen, loadData]);

  // Poll active jobs every 4s while modal is open
  useEffect(() => {
    if (!isOpen) return;
    const hasActive = jobs.some(j => j.status === 'PENDING' || j.status === 'RUNNING');
    if (!hasActive) return;
    const timer = setInterval(() => {
      void loadData();
    }, 4000);
    return () => clearInterval(timer);
  }, [isOpen, jobs, loadData]);

  if (!isOpen) return null;

  const handleCreateJob = async () => {
    if (!selectedFramework || !selectedTacticId || !selectedTacticName) {
      setError('Select a tactic in the main workspace before creating a generation job.');
      return;
    }
    setSubmitting(true);
    setError(null);
    setStatusMessage(null);
    try {
      const created = await GenerationJobsAPI.create({
        requestedCount: packageSize,
        selectedFramework,
        frameworkVersion,
        selectedTacticId,
        selectedTacticName,
        selectedVectors,
        selectedAttacks: [selectedTacticName],
        objectives,
        idempotencyKey: idempotencyKeyRef.current
      });
      idempotencyKeyRef.current = crypto.randomUUID();
      setStatusMessage(`Job ${created.id} created (${created.status}).`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create generation job');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStepWorker = async (jobId: string) => {
    setSteppingJobId(jobId);
    setError(null);
    try {
      const res = await GenerationJobsAPI.stepWorker(jobId);
      setStatusMessage(`Job ${jobId}: ${res.acceptedCount}/${res.requestedCount} accepted (${res.status}).`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Worker step failed');
    } finally {
      setSteppingJobId(null);
    }
  };

  const handleCancelJob = async (jobId: string) => {
    setError(null);
    try {
      await GenerationJobsAPI.cancel(jobId);
      setStatusMessage(`Job ${jobId} cancelled and reserved credits released.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel job');
    }
  };

  const isLight = theme === 'light';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div
        className={`w-full max-w-3xl max-h-[85vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden ${
          isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-slate-100'
        }`}
      >
        <div className={`flex items-center justify-between px-6 py-4 border-b ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
          <div>
            <h2 className="text-lg font-bold">Persistent Generation Jobs</h2>
            <p className={`text-xs ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
              Atomic credit-reserved packages. Only completed, originality-verified packages are delivered to your Prompt Vault.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {credits && (
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                isLight ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
              }`}>
                <Coins className="w-3.5 h-3.5" />
                <span>{credits.availableTokens} Available</span>
                {credits.reservedTokens > 0 && <span className="opacity-75">({credits.reservedTokens} Reserved)</span>}
              </div>
            )}
            <button
              onClick={onClose}
              aria-label="Close Generation Jobs"
              className={`p-1.5 rounded-lg ${isLight ? 'hover:bg-slate-100 text-slate-600' : 'hover:bg-slate-800 text-slate-400'}`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {error && (
            <div className="p-3 rounded-xl border border-red-500/40 bg-red-500/10 text-red-400 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {statusMessage && (
            <div className="p-3 rounded-xl border border-teal-500/40 bg-teal-500/10 text-teal-400 text-xs flex items-center justify-between gap-2">
              <span>{statusMessage}</span>
              <button onClick={onOpenVault} className="underline font-semibold shrink-0">
                Open Prompt Vault
              </button>
            </div>
          )}

          {/* Create Job Box */}
          <div className={`p-4 rounded-xl border space-y-3 ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'}`}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider opacity-75">New Authenticated Job</div>
                <div className="text-sm font-semibold mt-0.5">
                  {selectedTacticName ? `${selectedFramework} · ${selectedTacticId} — ${selectedTacticName}` : 'No tactic selected'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={packageSize}
                  onChange={(e) => setPackageSize(Number(e.target.value) as 4 | 12 | 28 | 40)}
                  aria-label="Package size"
                  className={`text-xs px-3 py-2 rounded-lg border ${
                    isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-slate-100'
                  }`}
                >
                  {PACKAGE_OPTIONS.map((opt) => (
                    <option key={opt.count} value={opt.count}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleCreateJob}
                  disabled={submitting || !selectedTacticId}
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white transition-all"
                >
                  {submitting ? 'Submitting...' : 'Create Job'}
                </button>
              </div>
            </div>
            <p className={`text-[11px] ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
              Jobs run independently of your browser session via the background worker (<code>npm run worker</code> locally or scheduled recovery in production). You can also trigger individual steps below.
            </p>
          </div>

          {/* Jobs List */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold">Your Jobs</h3>
            <button
              onClick={loadData}
              disabled={loading}
              className={`text-xs flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${
                isLight ? 'border-slate-200 hover:bg-slate-100' : 'border-slate-700 hover:bg-slate-800'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {jobs.length === 0 ? (
            <div className={`text-center py-8 text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              No generation jobs yet.
            </div>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => {
                const pct = Math.min(100, Math.round((job.acceptedCount / Math.max(1, job.requestedCount)) * 100));
                const isActive = job.status === 'PENDING' || job.status === 'RUNNING';
                return (
                  <div
                    key={job.id}
                    className={`p-4 rounded-xl border space-y-2 ${isLight ? 'bg-white border-slate-200' : 'bg-slate-950/60 border-slate-800'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold">{job.selectedTacticName}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-800 text-slate-200">
                            {job.status}
                          </span>
                        </div>
                        <div className={`text-[11px] mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                          {job.selectedFramework} · {job.acceptedCount}/{job.requestedCount} accepted · {job.rejectedCount} rejected · retries {job.retryCount}/{job.maxRetries}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isActive && (
                          <>
                            <button
                              onClick={() => handleStepWorker(job.id)}
                              disabled={steppingJobId === job.id}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white flex items-center gap-1"
                            >
                              <Play className="w-3 h-3" />
                              {steppingJobId === job.id ? 'Stepping...' : 'Run Step'}
                            </button>
                            <button
                              onClick={() => handleCancelJob(job.id)}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-red-500/20 hover:bg-red-500/30 text-red-400 flex items-center gap-1"
                            >
                              <XCircle className="w-3 h-3" />
                              Cancel
                            </button>
                          </>
                        )}
                        {job.status === 'COMPLETED' && (
                          <button
                            onClick={onOpenVault}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            View in Vault
                          </button>
                        )}
                        {(job.status === 'FAILED' || job.status === 'INCOMPLETE' || job.status === 'CANCELLED') && (
                          <span className="text-[11px] flex items-center gap-1 text-amber-400">
                            <Clock className="w-3 h-3" />
                            Credits released
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div className="h-full bg-teal-500 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    {job.failureMessage && (
                      <div className="text-[11px] text-amber-400">{job.failureMessage}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
