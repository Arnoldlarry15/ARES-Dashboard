
import React, { useState, useMemo, useEffect } from 'react';
import { Framework, TacticMetadata, RedTeamTactic, ExecutablePayload } from './types';
import { OWASP_TACTICS, MITRE_ATLAS_TACTICS, MITRE_ATTACK_TACTICS } from './constants';
import { GeminiService } from './services/geminiService';
import { StorageManager } from './utils/storage';
import { 
  ShieldAlert, 
  Terminal, 
  Activity, 
  ChevronRight, 
  Search, 
  Download, 
  Cpu, 
  FileJson,
  AlertTriangle,
  RefreshCw,
  Copy,
  Layers,
  CheckCircle2,
  PlayCircle,
  ArrowRight,
  ArrowLeft,
  Settings2,
  Code2,
  Trash2
} from 'lucide-react';

const gemini = new GeminiService();

type BuilderStep = 'vectors' | 'payloads' | 'export';

export default function App() {
  const [activeTab, setActiveTab] = useState<Framework>(Framework.OWASP);
  const [selectedTactic, setSelectedTactic] = useState<TacticMetadata | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<RedTeamTactic | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Builder Flow State
  const [currentStep, setCurrentStep] = useState<BuilderStep>('vectors');
  const [selectedVectors, setSelectedVectors] = useState<string[]>([]);
  const [selectedPayloadIndices, setSelectedPayloadIndices] = useState<number[]>([]);
  const [notification, setNotification] = useState<string | null>(null);
  
  // Search and Filter State
  const [searchQuery, setSearchQuery] = useState('');

  const tactics = useMemo(() => {
    switch (activeTab) {
      case Framework.OWASP: return OWASP_TACTICS;
      case Framework.MITRE_ATLAS: return MITRE_ATLAS_TACTICS;
      case Framework.MITRE_ATTACK: return MITRE_ATTACK_TACTICS;
      default: return OWASP_TACTICS;
    }
  }, [activeTab]);

  // Filtered tactics based on search query
  const filteredTactics = useMemo(() => {
    if (!searchQuery.trim()) return tactics;
    
    const query = searchQuery.toLowerCase();
    return tactics.filter(tactic => 
      tactic.id.toLowerCase().includes(query) ||
      tactic.name.toLowerCase().includes(query) ||
      tactic.shortDesc.toLowerCase().includes(query)
    );
  }, [tactics, searchQuery]);

  // Load persisted state on mount
  useEffect(() => {
    const savedState = StorageManager.loadState();
    if (savedState) {
      // Restore framework
      if (savedState.activeFramework) {
        const framework = savedState.activeFramework as Framework;
        if (Object.values(Framework).includes(framework)) {
          setActiveTab(framework);
        }
      }

      // Restore selected tactic
      if (savedState.selectedTacticId) {
        const allTactics = [...OWASP_TACTICS, ...MITRE_ATLAS_TACTICS, ...MITRE_ATTACK_TACTICS];
        const tactic = allTactics.find(t => t.id === savedState.selectedTacticId);
        if (tactic) {
          handleTacticSelect(tactic);
          // Restore vectors and step after tactic is loaded
          if (savedState.selectedVectors) {
            setSelectedVectors(savedState.selectedVectors);
          }
          if (savedState.currentStep) {
            setCurrentStep(savedState.currentStep);
          }
          if (savedState.selectedPayloadIndices) {
            setSelectedPayloadIndices(savedState.selectedPayloadIndices);
          }
        }
      }
    }
  }, []); // Run only once on mount

  // Save state whenever it changes
  useEffect(() => {
    if (selectedTactic) {
      StorageManager.updateState({
        selectedTacticId: selectedTactic.id,
        currentStep,
        selectedVectors,
        selectedPayloadIndices,
        activeFramework: activeTab
      });
    }
  }, [selectedTactic, currentStep, selectedVectors, selectedPayloadIndices, activeTab]);

  const handleTacticSelect = async (tactic: TacticMetadata) => {
    // 1. Instant UI update to Vector Step
    setSelectedTactic(tactic);
    setCurrentStep('vectors');
    setSelectedVectors([]);
    setSelectedPayloadIndices([]);
    setResult(null);
    setError(null);
    setIsGenerating(true);

    // 2. Start dynamic generation of Payloads in background
    try {
      const details = await gemini.generateTacticDetails(tactic);
      setResult(details);
    } catch (err: any) {
      setError(err.message || "Content generation failed.");
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleVector = (vector: string) => {
    setSelectedVectors(prev => 
      prev.includes(vector) ? prev.filter(v => v !== vector) : [...prev, vector]
    );
  };

  const togglePayload = (index: number) => {
    setSelectedPayloadIndices(prev => 
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    );
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setNotification("Copied to clipboard");
    setTimeout(() => setNotification(null), 2000);
  };

  const downloadJson = (data: any, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const getExecutableData = (): ExecutablePayload | null => {
    if (!selectedTactic || !result) return null;
    return {
      tactic_id: selectedTactic.id,
      tactic_name: selectedTactic.name,
      framework: selectedTactic.framework,
      selected_vectors: selectedVectors,
      selected_payloads: result.example_payloads.filter((_, idx) => selectedPayloadIndices.includes(idx)),
      timestamp: new Date().toISOString(),
      version: "1.0.0"
    };
  };

  const exportExecutable = () => {
    const data = getExecutableData();
    if (!data || !selectedTactic) return;
    downloadJson(data, `ARES_EXEC_${selectedTactic.id}_${Date.now()}.json`);
  };

  const clearProgress = () => {
    StorageManager.clearState();
    setSelectedTactic(null);
    setCurrentStep('vectors');
    setSelectedVectors([]);
    setSelectedPayloadIndices([]);
    setResult(null);
    setError(null);
    setNotification("Progress cleared");
    setTimeout(() => setNotification(null), 2000);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-200">
      {/* Notification Toast */}
      {notification && (
        <div className="fixed top-4 right-4 z-[100] animate-in fade-in slide-in-from-top-2">
          <div className="bg-emerald-500 text-white px-6 py-3 rounded-lg shadow-2xl flex items-center gap-3 border border-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
            <span className="font-medium">{notification}</span>
          </div>
        </div>
      )}
      
      {/* Header */}
      <header className="border-b border-slate-800/60 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
              <ShieldAlert className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">ARES <span className="text-emerald-400 font-normal">Dashboard</span></h1>
              <p className="text-xs text-slate-500 mono font-medium uppercase">Attack Engineering System</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-[10px] mono text-slate-500">
             {isGenerating ? (
               <div className="flex items-center gap-2">
                 <RefreshCw className="w-3 h-3 animate-spin text-emerald-500" />
                 <span>PREPARING PAYLOADS...</span>
               </div>
             ) : (
               <span className="text-emerald-500/60">SYSTEM READY</span>
             )}
             {selectedTactic && (
               <button 
                 onClick={clearProgress}
                 className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/60 hover:bg-slate-800 border border-slate-700 rounded-lg transition-all text-slate-400 hover:text-slate-200"
                 title="Clear saved progress"
               >
                 <Trash2 className="w-3 h-3" />
                 <span className="hidden sm:inline">CLEAR</span>
               </button>
             )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 flex flex-col md:flex-row gap-6 overflow-hidden">
        {/* Sidebar: Framework Explorer */}
        <div className="w-full md:w-80 flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-1 p-1 bg-slate-900/80 border border-slate-800 rounded-xl">
            {(Object.values(Framework) as Framework[]).map((f) => (
              <button 
                key={f}
                onClick={() => setActiveTab(f)}
                className={`py-2 text-[10px] font-bold rounded-lg transition-all uppercase tracking-wider ${activeTab === f ? 'bg-slate-800 text-white shadow-lg border border-slate-700' : 'text-slate-500 hover:text-slate-300'}`}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="flex-1 bg-slate-900/40 border border-slate-800/60 rounded-xl flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-800/60 bg-slate-900/60">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tactics List</span>
                <Layers className="w-4 h-4 text-slate-600" />
              </div>
              {/* Search Input */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search tactics..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-800 rounded transition-all"
                  >
                    <span className="text-slate-500 text-xs">✕</span>
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {filteredTactics.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Search className="w-8 h-8 text-slate-700 mb-2" />
                  <p className="text-sm text-slate-500">No tactics found</p>
                  <p className="text-xs text-slate-600 mt-1">Try a different search</p>
                </div>
              ) : (
                filteredTactics.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleTacticSelect(t)}
                  className={`w-full text-left p-3 rounded-lg border transition-all flex items-start justify-between group ${
                    selectedTactic?.id === t.id 
                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-100' 
                    : 'bg-transparent border-transparent hover:bg-slate-800/60 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                         selectedTactic?.id === t.id ? 'bg-emerald-500/20 border-emerald-500/40' : 'bg-slate-800 border-slate-700'
                      }`}>
                        {t.id}
                      </span>
                      <span className="font-semibold text-sm">{t.name}</span>
                    </div>
                    <p className="text-xs text-slate-500 line-clamp-1">{t.shortDesc}</p>
                  </div>
                  <ChevronRight className={`w-4 h-4 mt-1 transition-transform ${selectedTactic?.id === t.id ? 'translate-x-1 text-emerald-400' : 'opacity-0 group-hover:opacity-100'}`} />
                </button>
              )))}
            </div>
          </div>
        </div>

        {/* Workspace */}
        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          {!selectedTactic ? (
            <div className="flex-1 bg-slate-900/20 border-2 border-dashed border-slate-800/60 rounded-2xl flex flex-col items-center justify-center text-center p-8">
              <div className="p-5 bg-slate-900 rounded-full border border-slate-800 mb-6 shadow-2xl shadow-emerald-500/10">
                <Search className="w-10 h-10 text-slate-700" />
              </div>
              <h2 className="text-2xl font-bold text-slate-100 mb-2">Build Executable Red-Team JSONs</h2>
              <p className="text-slate-500 max-w-md mx-auto leading-relaxed">
                Select a tactic to configure <span className="text-emerald-400">Attack Vectors</span> and specialized payloads.
              </p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col gap-4 overflow-hidden animate-in fade-in slide-in-from-right-4 duration-500">
              {/* Profile Brief */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 relative overflow-hidden shrink-0">
                <div className="relative flex justify-between items-start gap-6">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xs font-bold px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded">
                        {selectedTactic.id}
                      </span>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{selectedTactic.framework}</span>
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-1">{selectedTactic.name}</h2>
                    <p className="text-slate-400 text-sm line-clamp-1">{selectedTactic.shortDesc}</p>
                  </div>
                  
                  {/* Stepper Indicator */}
                  <div className="hidden lg:flex items-center gap-4 bg-slate-950/50 border border-slate-800 rounded-xl p-2 px-4">
                    <div className={`flex items-center gap-2 ${currentStep === 'vectors' ? 'text-emerald-400' : 'text-slate-600'}`}>
                      <Settings2 className="w-4 h-4" />
                      <span className="text-[10px] font-bold uppercase">Vectors</span>
                    </div>
                    <ChevronRight className="w-3 h-3 text-slate-800" />
                    <div className={`flex items-center gap-2 ${currentStep === 'payloads' ? 'text-emerald-400' : 'text-slate-600'}`}>
                      <Code2 className="w-4 h-4" />
                      <span className="text-[10px] font-bold uppercase">Payloads</span>
                    </div>
                    <ChevronRight className="w-3 h-3 text-slate-800" />
                    <div className={`flex items-center gap-2 ${currentStep === 'export' ? 'text-emerald-400' : 'text-slate-600'}`}>
                      <Download className="w-4 h-4" />
                      <span className="text-[10px] font-bold uppercase">Export</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex-1 bg-slate-900/40 border border-slate-800/60 rounded-2xl flex flex-col overflow-hidden shadow-2xl relative">
                
                {/* 1. Attack Vector Selection */}
                {currentStep === 'vectors' && (
                  <div className="flex-1 flex flex-col p-6 animate-in fade-in slide-in-from-bottom-2">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-500/20 rounded-lg">
                          <Settings2 className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-white">Step 1: Attack Vectors</h3>
                          <p className="text-xs text-slate-500">Delivery methods identified for {selectedTactic.name}.</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSelectedVectors(selectedTactic.staticVectors)}
                          className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg uppercase tracking-tighter transition-all border border-slate-700"
                        >
                          Select All
                        </button>
                        <button
                          onClick={() => setSelectedVectors([])}
                          className="text-[10px] font-bold text-slate-400 hover:text-slate-300 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg uppercase tracking-tighter transition-all border border-slate-700"
                        >
                          Clear All
                        </button>
                        <div className="text-[10px] font-bold text-slate-600 bg-slate-800 px-3 py-1 rounded-full uppercase tracking-tighter">
                          {selectedVectors.length} Selected
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-3 content-start">
                      {selectedTactic.staticVectors.map((vec, idx) => {
                        const isSelected = selectedVectors.includes(vec);
                        return (
                          <button 
                            key={idx} 
                            onClick={() => toggleVector(vec)}
                            className={`p-4 rounded-xl text-sm font-medium transition-all text-left flex items-start gap-4 border group ${
                              isSelected 
                              ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300' 
                              : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-600 hover:bg-slate-800'
                            }`}
                          >
                            <div className={`mt-0.5 shrink-0 w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                              isSelected ? 'bg-emerald-500 border-emerald-400 text-white shadow-lg' : 'border-slate-700 bg-slate-950'
                            }`}>
                              {isSelected && <CheckCircle2 className="w-4 h-4" />}
                            </div>
                            <span>{vec}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-6 pt-6 border-t border-slate-800 flex justify-end">
                      <button 
                        onClick={() => setCurrentStep('payloads')}
                        className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold flex items-center gap-2 transition-all disabled:opacity-50 disabled:grayscale"
                        disabled={selectedVectors.length === 0}
                      >
                        Continue to Payloads
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* 2. Payload Selection */}
                {currentStep === 'payloads' && (
                  <div className="flex-1 flex flex-col p-6 animate-in fade-in slide-in-from-right-2">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <button onClick={() => setCurrentStep('vectors')} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400">
                           <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div>
                          <h3 className="text-lg font-bold text-white">Step 2: Payloads</h3>
                          <p className="text-xs text-slate-500">Attack payloads based on threat intelligence.</p>
                        </div>
                      </div>
                      {result && result.example_payloads.length > 0 && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setSelectedPayloadIndices(result.example_payloads.map((_, idx) => idx))}
                            className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg uppercase tracking-tighter transition-all border border-slate-700"
                          >
                            Select All
                          </button>
                          <button
                            onClick={() => setSelectedPayloadIndices([])}
                            className="text-[10px] font-bold text-slate-400 hover:text-slate-300 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg uppercase tracking-tighter transition-all border border-slate-700"
                          >
                            Clear All
                          </button>
                          <div className="text-[10px] font-bold text-slate-600 bg-slate-800 px-3 py-1 rounded-full uppercase tracking-tighter">
                            {selectedPayloadIndices.length} Selected
                          </div>
                        </div>
                      )}
                    </div>

                    {isGenerating && !result ? (
                      <div className="flex-1 flex flex-col items-center justify-center text-center">
                        <Activity className="w-10 h-10 text-emerald-500/40 animate-pulse mb-4" />
                        <h4 className="text-sm font-bold text-slate-300">Generating Payloads...</h4>
                        <p className="text-xs text-slate-500 mt-2">Analysis of {selectedTactic.name} in progress.</p>
                      </div>
                    ) : error ? (
                      <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                         <AlertTriangle className="w-10 h-10 text-red-500/60 mb-4" />
                         <p className="text-red-400 text-sm mb-4">{error}</p>
                         <button onClick={() => handleTacticSelect(selectedTactic)} className="flex items-center gap-2 text-xs font-bold text-slate-300 bg-slate-800 px-4 py-2 rounded-lg">
                           <RefreshCw className="w-3 h-3" /> RETRY
                         </button>
                      </div>
                    ) : (
                      <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                        {result?.example_payloads.map((p, idx) => {
                          const isSelected = selectedPayloadIndices.includes(idx);
                          return (
                            <div key={idx} className={`rounded-2xl border transition-all overflow-hidden ${isSelected ? 'border-emerald-500/40 bg-emerald-500/5 shadow-lg' : 'border-slate-800 bg-slate-900/40'}`}>
                               <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/40">
                                  <div className="flex items-center gap-3">
                                    <button 
                                      onClick={() => togglePayload(idx)}
                                      className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${
                                        isSelected ? 'bg-emerald-500 border-emerald-400 text-white shadow-md' : 'border-slate-700 bg-slate-950 text-transparent'
                                      }`}
                                    >
                                      <CheckCircle2 className="w-4 h-4" />
                                    </button>
                                    <h4 className={`text-xs font-bold uppercase tracking-wider ${isSelected ? 'text-emerald-400' : 'text-slate-500'}`}>
                                      {p.description}
                                    </h4>
                                  </div>
                                  <span className="text-[10px] font-bold text-slate-600 mono">{p.format}</span>
                               </div>
                               <div className="relative group p-5">
                                  <pre className={`text-xs mono whitespace-pre-wrap break-all max-h-48 overflow-y-auto ${isSelected ? 'text-emerald-300' : 'text-emerald-500/50'}`}>
                                    {p.payload}
                                  </pre>
                                  <button onClick={() => copyToClipboard(p.payload)} className="absolute top-4 right-4 p-2 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 opacity-0 group-hover:opacity-100 transition-all text-slate-400">
                                    <Copy className="w-3 h-3" />
                                  </button>
                               </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="mt-6 pt-6 border-t border-slate-800 flex justify-between items-center shrink-0">
                      <button onClick={() => setCurrentStep('vectors')} className="px-6 py-3 text-slate-400 hover:text-white font-bold flex items-center gap-2 transition-all">
                        <ArrowLeft className="w-4 h-4" /> Back to Vectors
                      </button>
                      <button 
                        onClick={() => setCurrentStep('export')}
                        className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold flex items-center gap-2 transition-all disabled:opacity-50"
                        disabled={selectedPayloadIndices.length === 0 || !result}
                      >
                        Finalize & Export
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* 3. Final Export & Review */}
                {currentStep === 'export' && (
                  <div className="flex-1 flex flex-col p-6 animate-in fade-in slide-in-from-right-2">
                    <div className="flex items-center gap-3 mb-8">
                       <button onClick={() => setCurrentStep('payloads')} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400">
                           <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div>
                          <h3 className="text-lg font-bold text-white">Step 3: Review</h3>
                          <p className="text-xs text-slate-500">Confirm parameters and download the attack manifest.</p>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto pr-2 space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-slate-900/60 p-5 rounded-2xl border border-slate-800">
                           <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Selected Vectors</h4>
                           <div className="flex flex-wrap gap-2">
                              {selectedVectors.map((v, i) => (
                                <span key={i} className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-lg">{v}</span>
                              ))}
                           </div>
                        </div>
                        <div className="bg-slate-900/60 p-5 rounded-2xl border border-slate-800">
                           <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Payload Count</h4>
                           <div className="flex items-center gap-3">
                              <span className="text-4xl font-bold text-white">{selectedPayloadIndices.length}</span>
                              <span className="text-xs text-slate-500 font-medium">Injection-ready samples.</span>
                           </div>
                        </div>
                      </div>

                      <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden">
                        <div className="px-5 py-3 bg-slate-900/40 border-b border-slate-800 flex items-center justify-between">
                           <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">JSON Manifest Preview</span>
                           <FileJson className="w-4 h-4 text-slate-600" />
                        </div>
                        <pre className="p-6 text-[10px] mono text-emerald-500/80 overflow-x-auto bg-black/40">
                          {JSON.stringify(getExecutableData(), null, 2)}
                        </pre>
                      </div>
                    </div>

                    <div className="mt-6 pt-6 border-t border-slate-800 flex justify-between items-center">
                      <button onClick={() => setCurrentStep('payloads')} className="px-6 py-3 text-slate-400 hover:text-white font-bold flex items-center gap-2 transition-all">
                        <ArrowLeft className="w-4 h-4" /> Review Payloads
                      </button>
                      <button 
                        onClick={exportExecutable}
                        className="px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold flex items-center gap-3 shadow-2xl shadow-emerald-500/20 group"
                      >
                        <PlayCircle className="w-6 h-6 group-hover:scale-110 transition-transform" />
                        DOWNLOAD MANIFEST
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="border-t border-slate-800/40 py-3 px-6 bg-slate-900/20">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-slate-600 text-[10px] mono uppercase font-bold">
           <div className="flex items-center gap-4">
              <span>Attack Engine: Online</span>
              <span className="w-1 h-1 bg-slate-800 rounded-full"></span>
              <span>Gemini 3 Pro Reasoning</span>
           </div>
           <span>ARES v1.4.1</span>
        </div>
      </footer>
    </div>
  );
}
