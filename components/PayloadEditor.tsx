// Payload Editor Component with Syntax Highlighting
// In-line editor for customizing attack payloads

import React, { useState } from 'react';
import { Code2, Save, X, Copy, RotateCcw } from 'lucide-react';

interface PayloadEditorProps {
  payload: string;
  onSave: (editedPayload: string) => void;
  onClose: () => void;
  title: string;
}

export const PayloadEditor: React.FC<PayloadEditorProps> = ({ 
  payload, 
  onSave, 
  onClose,
  title 
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
      <div className="bg-slate-900/95 backdrop-blur-xl rounded-2xl border border-emerald-500/20 shadow-2xl shadow-emerald-500/10 max-w-4xl w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-emerald-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-r from-emerald-500 to-blue-500 rounded-lg">
              <Code2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Payload Editor</h2>
              <p className="text-sm text-slate-400">{title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Editor */}
        <div className="flex-1 overflow-hidden p-6">
          <div className="h-full bg-slate-950/50 rounded-xl border border-emerald-500/20 overflow-hidden flex">
            {/* Line Numbers */}
            <div className="bg-slate-900/50 px-4 py-4 text-right select-none border-r border-emerald-500/20">
              {Array.from({ length: lineCount }, (_, i) => (
                <div key={i} className="text-slate-500 text-sm font-mono leading-6">
                  {i + 1}
                </div>
              ))}
            </div>
            
            {/* Editor Textarea */}
            <textarea
              value={editedPayload}
              onChange={(e) => setEditedPayload(e.target.value)}
              className="flex-1 p-4 bg-transparent text-white font-mono text-sm leading-6 resize-none focus:outline-none"
              spellCheck={false}
              style={{
                tabSize: 2,
              }}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between p-6 border-t border-emerald-500/20">
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors"
            >
              <Copy className="w-4 h-4" />
              <span className="text-sm">Copy</span>
            </button>
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="text-sm">Reset</span>
            </button>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-emerald-500 to-blue-500 hover:from-emerald-600 hover:to-blue-600 text-white rounded-lg transition-all shadow-lg shadow-emerald-500/20"
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
