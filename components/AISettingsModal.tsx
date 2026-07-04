import React from 'react';
import { Settings2, KeyRound, Globe, Bot, X, RotateCcw, Save } from 'lucide-react';
import { AiModelSettings } from '../utils/storage';

interface AISettingsModalProps {
  settings: AiModelSettings;
  onChange: (settings: AiModelSettings) => void;
  onSave: () => void;
  onClose: () => void;
  onReset: () => void;
  theme?: 'light' | 'dark';
}

export const AISettingsModal: React.FC<AISettingsModalProps> = ({
  settings,
  onChange,
  onSave,
  onClose,
  onReset,
  theme = 'dark'
}) => {
  const updateField = <K extends keyof AiModelSettings>(field: K, value: AiModelSettings[K]) => {
    onChange({
      ...settings,
      [field]: value
    });
  };

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in p-4">
      <div className={`w-full max-w-2xl rounded-3xl border shadow-2xl overflow-hidden ${
        theme === 'light'
          ? 'bg-white border-slate-200'
          : 'bg-slate-950 border-slate-800'
      }`}>
        <div className={`flex items-start justify-between gap-4 p-6 border-b ${
          theme === 'light' ? 'border-slate-200' : 'border-slate-800'
        }`}>
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-xl ${
              theme === 'light' ? 'bg-teal-100' : 'bg-teal-500/15'
            }`}>
              <Settings2 className={`w-5 h-5 ${theme === 'light' ? 'text-teal-700' : 'text-teal-400'}`} />
            </div>
            <div>
              <h2 className={`text-xl font-bold ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
                AI Provider Settings
              </h2>
              <p className={`text-sm mt-1 ${theme === 'light' ? 'text-slate-600' : 'text-slate-400'}`}>
                Configure Gemini, OpenAI, Claude, or a local OpenAI-compatible model. Settings are stored locally in your browser and sent only when generating payloads.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            title="Close AI provider settings"
            aria-label="Close AI provider settings"
            className={`p-2 rounded-xl transition-colors ${
              theme === 'light' ? 'hover:bg-slate-100 text-slate-500' : 'hover:bg-slate-900 text-slate-400'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className={`block rounded-2xl border p-4 ${
              theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-slate-800'
            }`}>
              <span className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider mb-3 ${
                theme === 'light' ? 'text-slate-600' : 'text-slate-400'
              }`}>
                <Bot className="w-4 h-4" /> Preferred Provider
              </span>
              <select
                value={settings.preferredProvider || 'auto'}
                onChange={(e) => updateField('preferredProvider', e.target.value as AiModelSettings['preferredProvider'])}
                className={`w-full rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 ${
                  theme === 'light'
                    ? 'bg-white border-slate-200 text-slate-900 focus:ring-teal-500/30'
                    : 'bg-slate-950 border-slate-700 text-slate-100 focus:ring-teal-500/30'
                }`}
              >
                <option value="auto">Auto</option>
                <option value="gemini">Gemini</option>
                <option value="openai">OpenAI / ChatGPT</option>
                <option value="anthropic">Claude</option>
                <option value="local">Local / OpenAI-compatible</option>
              </select>
            </label>

            <label className={`block rounded-2xl border p-4 ${
              theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-slate-800'
            }`}>
              <span className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider mb-3 ${
                theme === 'light' ? 'text-slate-600' : 'text-slate-400'
              }`}>
                <Globe className="w-4 h-4" /> Local Base URL
              </span>
              <input
                type="text"
                value={settings.localBaseUrl || ''}
                onChange={(e) => updateField('localBaseUrl', e.target.value)}
                placeholder="http://localhost:11434/v1"
                className={`w-full rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 ${
                  theme === 'light'
                    ? 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:ring-teal-500/30'
                    : 'bg-slate-950 border-slate-700 text-slate-100 placeholder-slate-500 focus:ring-teal-500/30'
                }`}
              />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className={`block rounded-2xl border p-4 ${
              theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-slate-800'
            }`}>
              <span className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider mb-3 ${
                theme === 'light' ? 'text-slate-600' : 'text-slate-400'
              }`}>
                <KeyRound className="w-4 h-4" /> Gemini API Key
              </span>
              <input
                type="password"
                value={settings.geminiApiKey || ''}
                onChange={(e) => updateField('geminiApiKey', e.target.value)}
                placeholder="AIza..."
                className={`w-full rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 ${
                  theme === 'light'
                    ? 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:ring-teal-500/30'
                    : 'bg-slate-950 border-slate-700 text-slate-100 placeholder-slate-500 focus:ring-teal-500/30'
                }`}
              />
            </label>

            <label className={`block rounded-2xl border p-4 ${
              theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-slate-800'
            }`}>
              <span className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider mb-3 ${
                theme === 'light' ? 'text-slate-600' : 'text-slate-400'
              }`}>
                <KeyRound className="w-4 h-4" /> OpenAI API Key
              </span>
              <input
                type="password"
                value={settings.openaiApiKey || ''}
                onChange={(e) => updateField('openaiApiKey', e.target.value)}
                placeholder="sk-..."
                className={`w-full rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 ${
                  theme === 'light'
                    ? 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:ring-teal-500/30'
                    : 'bg-slate-950 border-slate-700 text-slate-100 placeholder-slate-500 focus:ring-teal-500/30'
                }`}
              />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className={`block rounded-2xl border p-4 ${
              theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-slate-800'
            }`}>
              <span className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider mb-3 ${
                theme === 'light' ? 'text-slate-600' : 'text-slate-400'
              }`}>
                <KeyRound className="w-4 h-4" /> Claude API Key
              </span>
              <input
                type="password"
                value={settings.anthropicApiKey || ''}
                onChange={(e) => updateField('anthropicApiKey', e.target.value)}
                placeholder="sk-ant-..."
                className={`w-full rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 ${
                  theme === 'light'
                    ? 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:ring-teal-500/30'
                    : 'bg-slate-950 border-slate-700 text-slate-100 placeholder-slate-500 focus:ring-teal-500/30'
                }`}
              />
            </label>

            <label className={`block rounded-2xl border p-4 ${
              theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-slate-800'
            }`}>
              <span className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider mb-3 ${
                theme === 'light' ? 'text-slate-600' : 'text-slate-400'
              }`}>
                <KeyRound className="w-4 h-4" /> Local API Key
              </span>
              <input
                type="password"
                value={settings.localApiKey || ''}
                onChange={(e) => updateField('localApiKey', e.target.value)}
                placeholder="Optional bearer token"
                className={`w-full rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 ${
                  theme === 'light'
                    ? 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:ring-teal-500/30'
                    : 'bg-slate-950 border-slate-700 text-slate-100 placeholder-slate-500 focus:ring-teal-500/30'
                }`}
              />
            </label>
          </div>

          <label className={`block rounded-2xl border p-4 ${
            theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}>
            <span className={`text-xs font-bold uppercase tracking-wider mb-3 block ${
              theme === 'light' ? 'text-slate-600' : 'text-slate-400'
            }`}>
              Local Model Name
            </span>
            <input
              type="text"
              value={settings.localModel || ''}
              onChange={(e) => updateField('localModel', e.target.value)}
              placeholder="llama3.1:8b-instruct"
              className={`w-full rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 ${
                theme === 'light'
                  ? 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:ring-teal-500/30'
                  : 'bg-slate-950 border-slate-700 text-slate-100 placeholder-slate-500 focus:ring-teal-500/30'
              }`}
            />
          </label>

          <div className={`rounded-2xl border p-4 ${
            theme === 'light' ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-amber-500/10 border-amber-500/20 text-amber-200'
          }`}>
            <p className="text-sm font-medium">
              Keys are only used for payload generation requests. If you leave them blank, the app falls back to built-in deterministic payload templates.
            </p>
          </div>
        </div>

        <div className={`flex items-center justify-between gap-3 p-6 border-t ${
          theme === 'light' ? 'border-slate-200 bg-slate-50/40' : 'border-slate-800 bg-slate-950/60'
        }`}>
          <button
            onClick={onReset}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition-colors ${
              theme === 'light'
                ? 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800'
            }`}
          >
            <RotateCcw className="w-4 h-4" /> Reset
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className={`rounded-xl px-4 py-3 text-sm font-bold transition-colors ${
                theme === 'light'
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-200'
              }`}
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 shadow-lg shadow-cyan-500/20"
            >
              <Save className="w-4 h-4" /> Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
