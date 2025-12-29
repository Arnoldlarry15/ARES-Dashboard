// Payload Editor Component with Syntax Highlighting
// In-line editor for customizing attack payloads

import React, { useState } from 'react';
import { Code2, Save, X, Copy, RotateCcw } from 'lucide-react';

interface PayloadEditorProps {
  payload: string;
  onSave: (editedPayload: string) => void;
  onClose: () => void;
  title: string;
  theme?: 'light' | 'dark';
}

export const PayloadEditor: React.FC<PayloadEditorProps> = ({ 
  payload, 
  onSave, 
  onClose,
  title,
  theme = 'dark'
}) => {
  const [editedPayload, setEditedPayload] = useState(payload);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = () => {
    setIsSaving(true);
    onSave(editedPayload);
    setTimeout(() => {
      setIsSaving(false);
    }, 300);
  };

  const handleReset = () => {
    setEditedPayload(payload);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(editedPayload);
  };

  const lineCount = editedPayload.split('\n').length;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`backdrop-blur-xl rounded-2xl border shadow-2xl max-w-4xl w-full max-h-[80vh] flex flex-col ${
        theme === 'light' 
          ? 'bg-white/95 border-slate-200 shadow-lg'
          : 'bg-slate-900/95 border-cyan-500/20 shadow-cyan-500/10'
      }`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b ${
          theme === 'light' ? 'border-slate-200' : 'border-cyan-500/20'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${
              theme === 'light' ? 'bg-teal-100' : 'bg-gradient-to-r from-cyan-500 to-blue-500'
            }`}>
              <Code2 className={`w-5 h-5 ${theme === 'light' ? 'text-teal-600' : 'text-white'}`} />
            </div>
            <div>
              <h2 className={`text-xl font-bold ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>Payload Editor</h2>
              <p className={`text-sm ${theme === 'light' ? 'text-slate-600' : 'text-slate-400'}`}>{title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors ${
              theme === 'light' ? 'hover:bg-slate-100 text-slate-600' : 'hover:bg-slate-800 text-slate-400'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Editor */}
        <div className="flex-1 overflow-hidden p-6">
          <div className={`h-full rounded-xl border overflow-hidden flex ${
            theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/50 border-cyan-500/20'
          }`}>
            {/* Line Numbers */}
            <div className={`px-4 py-4 text-right select-none border-r ${
              theme === 'light' ? 'bg-slate-100 border-slate-200' : 'bg-slate-900/50 border-cyan-500/20'
            }`}>
              {Array.from({ length: lineCount }, (_, i) => (
                <div key={i} className={`text-sm font-mono leading-6 ${
                  theme === 'light' ? 'text-slate-400' : 'text-slate-500'
                }`}>
                  {i + 1}
                </div>
              ))}
            </div>
            
            {/* Editor Textarea */}
            <textarea
              value={editedPayload}
              onChange={(e) => setEditedPayload(e.target.value)}
              className={`flex-1 p-4 bg-transparent font-mono text-sm leading-6 resize-none focus:outline-none ${
                theme === 'light' ? 'text-slate-900' : 'text-white'
              }`}
              spellCheck={false}
              style={{
                tabSize: 2,
              }}
            />
          </div>
        </div>

        {/* Actions */}
        <div className={`flex items-center justify-between p-6 border-t ${
          theme === 'light' ? 'border-slate-200' : 'border-cyan-500/20'
        }`}>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                theme === 'light'
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  : 'bg-slate-800 hover:bg-slate-700 text-white'
              }`}
            >
              <Copy className="w-4 h-4" />
              <span className="text-sm">Copy</span>
            </button>
            <button
              onClick={handleReset}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                theme === 'light'
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  : 'bg-slate-800 hover:bg-slate-700 text-white'
              }`}
            >
              <RotateCcw className="w-4 h-4" />
              <span className="text-sm">Reset</span>
            </button>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className={`px-6 py-2 rounded-lg transition-colors ${
                theme === 'light'
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  : 'bg-slate-800 hover:bg-slate-700 text-white'
              }`}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className={`flex items-center gap-2 px-6 py-2 rounded-lg transition-all shadow-lg ${
                theme === 'light'
                  ? 'bg-teal-600 hover:bg-teal-500 text-white shadow-teal-500/20'
                  : 'bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white shadow-cyan-500/20'
              }`}
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
