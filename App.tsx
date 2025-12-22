
import React, { useState, useMemo, useEffect } from 'react';
import { Framework, TacticMetadata, RedTeamTactic, ExecutablePayload } from './types';
import { OWASP_TACTICS, MITRE_ATLAS_TACTICS, MITRE_ATTACK_TACTICS } from './constants';
import { GeminiService } from './services/geminiService';
import { StorageManager } from './utils/storage';
import { CampaignManager, Campaign } from './utils/campaigns';
import { AuthService } from './services/authService';
import { User, hasPermission } from './types/auth';
import { AuthLogin } from './components/AuthLogin';
import { TeamManagement } from './components/TeamManagement';
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
  Trash2,
  Save,
  FolderOpen,
  X,
  Keyboard,
  LogOut,
  UserIcon,
  Users
} from 'lucide-react';

const gemini = new GeminiService();

type BuilderStep = 'vectors' | 'payloads' | 'export';

export default function App() {
  // Authentication State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

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
  
  // Campaign Management State
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [showSaveCampaignModal, setShowSaveCampaignModal] = useState(false);
  const [campaignName, setCampaignName] = useState('');
  const [campaignDescription, setCampaignDescription] = useState('');
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);
  
  // Team Management State
  const [showTeamManagement, setShowTeamManagement] = useState(false);

  // Check authentication on mount
  useEffect(() => {
    const user = AuthService.getCurrentUser();
    if (user) {
      setCurrentUser(user);
      setIsAuthenticated(true);
    }
  }, []);

  // Handle login
  const handleLogin = () => {
    const user = AuthService.getCurrentUser();
    if (user) {
      setCurrentUser(user);
      setIsAuthenticated(true);
      setNotification(`Welcome, ${user.name}!`);
      setTimeout(() => setNotification(null), 2000);
    }
  };

  // Handle logout
  const handleLogout = () => {
    AuthService.clearSession();
    setCurrentUser(null);
    setIsAuthenticated(false);
    setNotification('Logged out successfully');
    setTimeout(() => setNotification(null), 2000);
  };

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    return <AuthLogin onLogin={handleLogin} />;
  }
  
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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Close modals with ESC
      if (e.key === 'Escape') {
        if (showCampaignModal) setShowCampaignModal(false);
        if (showSaveCampaignModal) setShowSaveCampaignModal(false);
        if (showKeyboardShortcuts) setShowKeyboardShortcuts(false);
        return;
      }

      // Show keyboard shortcuts help
      if (e.key === '?') {
        e.preventDefault();
        setShowKeyboardShortcuts(true);
        return;
      }

      // Prevent shortcuts when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Navigation shortcuts
      if (selectedTactic) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          if (currentStep === 'payloads') setCurrentStep('vectors');
          else if (currentStep === 'export') setCurrentStep('payloads');
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          if (currentStep === 'vectors' && selectedVectors.length > 0) setCurrentStep('payloads');
          else if (currentStep === 'payloads' && selectedPayloadIndices.length > 0) setCurrentStep('export');
        }
      }

      // Global shortcuts
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (selectedTactic && selectedVectors.length > 0) {
          setShowSaveCampaignModal(true);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        setShowCampaignModal(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const searchInput = document.querySelector('input[type="text"][placeholder="Search tactics..."]') as HTMLInputElement;
        if (searchInput) searchInput.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTactic, currentStep, selectedVectors, selectedPayloadIndices, showCampaignModal, showSaveCampaignModal, showKeyboardShortcuts]);

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

  // Campaign Management Functions
  useEffect(() => {
    setCampaigns(CampaignManager.getAllCampaigns());
  }, []);

  const saveCampaign = () => {
    if (!selectedTactic || !campaignName.trim()) return;
    
    try {
      const campaign = CampaignManager.saveCampaign({
        name: campaignName,
        description: campaignDescription,
        tactic_id: selectedTactic.id,
        tactic_name: selectedTactic.name,
        framework: selectedTactic.framework,
        selected_vectors: selectedVectors,
        selected_payload_indices: selectedPayloadIndices
      });
      
      // Audit log
      AuthService.logAuditEvent({
        user_id: currentUser?.id || 'unknown',
        user_email: currentUser?.email || 'unknown',
        action: 'create',
        resource_type: 'campaign',
        resource_id: campaign.id,
        details: { 
          campaign_name: campaign.name,
          tactic_id: selectedTactic.id,
          vectors_count: selectedVectors.length,
          payloads_count: selectedPayloadIndices.length
        }
      });
      
      setCampaigns(CampaignManager.getAllCampaigns());
      setShowSaveCampaignModal(false);
      setCampaignName('');
      setCampaignDescription('');
      setNotification(`Campaign "${campaign.name}" saved`);
      setTimeout(() => setNotification(null), 2000);
    } catch (error) {
      setNotification("Failed to save campaign");
      setTimeout(() => setNotification(null), 2000);
    }
  };

  const loadCampaign = async (campaign: Campaign) => {
    const allTactics = [...OWASP_TACTICS, ...MITRE_ATLAS_TACTICS, ...MITRE_ATTACK_TACTICS];
    const tactic = allTactics.find(t => t.id === campaign.tactic_id);
    
    if (!tactic) {
      setNotification("Tactic not found");
      setTimeout(() => setNotification(null), 2000);
      return;
    }
    
    // Audit log
    AuthService.logAuditEvent({
      user_id: currentUser?.id || 'unknown',
      user_email: currentUser?.email || 'unknown',
      action: 'load',
      resource_type: 'campaign',
      resource_id: campaign.id,
      details: { campaign_name: campaign.name, tactic_id: campaign.tactic_id }
    });
    
    await handleTacticSelect(tactic);
    setSelectedVectors(campaign.selected_vectors);
    setSelectedPayloadIndices(campaign.selected_payload_indices);
    setShowCampaignModal(false);
    setNotification(`Campaign "${campaign.name}" loaded`);
    setTimeout(() => setNotification(null), 2000);
  };

  const deleteCampaign = (id: string, name: string) => {
    if (CampaignManager.deleteCampaign(id)) {
      // Audit log
      AuthService.logAuditEvent({
        user_id: currentUser?.id || 'unknown',
        user_email: currentUser?.email || 'unknown',
        action: 'delete',
        resource_type: 'campaign',
        resource_id: id,
        details: { campaign_name: name }
      });
      
      setCampaigns(CampaignManager.getAllCampaigns());
      setNotification(`Campaign "${name}" deleted`);
      setTimeout(() => setNotification(null), 2000);
    }
  };

  return (
    <div className="min-h-screen flex flex-col text-slate-200 relative overflow-hidden">
      {/* Animated background gradient */}
      <div className="fixed inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950"></div>
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse" style={{animationDelay: '1s'}}></div>
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Notification Toast */}
        {notification && (
          <div className="fixed top-6 right-6 z-[100] animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="glass-strong px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 border border-emerald-500/30 glow-emerald">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <span className="font-semibold text-white">{notification}</span>
            </div>
          </div>
        )}
        
        {/* Header */}
        <header className="glass border-b border-white/10 sticky top-0 z-50 backdrop-blur-xl">
          <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-2xl blur-lg opacity-50"></div>
                <div className="relative p-3 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl shadow-lg">
                  <ShieldAlert className="w-7 h-7 text-white" />
                </div>
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight">
                  <span className="text-white">ARES</span>
                  <span className="gradient-text ml-2">Dashboard</span>
                </h1>
                <p className="text-xs text-slate-400 mono font-semibold uppercase tracking-wider">Attack Engineering System</p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-[10px] mono text-slate-400">
             {/* User profile */}
             {currentUser && (
               <div className="flex items-center gap-2 px-3 py-2 glass rounded-xl border border-white/10">
                 <UserIcon className="w-3.5 h-3.5 text-emerald-400" />
                 <div className="flex flex-col">
                   <span className="text-[9px] font-bold text-slate-500 uppercase">Logged in as</span>
                   <span className="text-[10px] font-bold text-white">{currentUser.name}</span>
                 </div>
               </div>
             )}

             {isGenerating ? (
               <div className="flex items-center gap-2 px-3 py-2 glass rounded-xl">
                 <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                 <span className="font-bold text-emerald-400">PREPARING PAYLOADS...</span>
               </div>
             ) : (
               <div className="flex items-center gap-2 px-3 py-2 glass rounded-xl">
                 <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
                 <span className="font-bold text-emerald-400">SYSTEM READY</span>
               </div>
             )}
             <button 
               onClick={() => setShowTeamManagement(true)}
               className="flex items-center gap-2 px-4 py-2 glass hover:glass-strong rounded-xl transition-all text-slate-300 hover:text-white group relative overflow-hidden"
               title="Team management"
             >
               <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/0 via-emerald-500/10 to-emerald-500/0 translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-700"></div>
               <Users className="w-3.5 h-3.5 relative z-10" />
               <span className="hidden sm:inline font-bold relative z-10">TEAM</span>
             </button>
             <button 
               onClick={() => setShowCampaignModal(true)}
               className="flex items-center gap-2 px-4 py-2 glass hover:glass-strong rounded-xl transition-all text-slate-300 hover:text-white group relative overflow-hidden"
               title="Load campaign"
             >
               <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/0 via-emerald-500/10 to-emerald-500/0 translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-700"></div>
               <FolderOpen className="w-3.5 h-3.5 relative z-10" />
               <span className="hidden sm:inline font-bold relative z-10">CAMPAIGNS</span>
               {campaigns.length > 0 && (
                 <span className="px-2 py-0.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-lg text-[8px] font-black relative z-10 shadow-lg">
                   {campaigns.length}
                 </span>
               )}
             </button>
             {selectedTactic && selectedVectors.length > 0 && (
               <button 
                 onClick={() => setShowSaveCampaignModal(true)}
                 className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 rounded-xl transition-all text-white shadow-lg glow-emerald hover:glow-emerald-strong group"
                 title="Save as campaign"
               >
                 <Save className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                 <span className="hidden sm:inline font-bold">SAVE</span>
               </button>
             )}
             {selectedTactic && (
               <button 
                 onClick={clearProgress}
                 className="flex items-center gap-2 px-4 py-2 glass hover:glass-strong rounded-xl transition-all text-red-400 hover:text-red-300 group"
                 title="Clear saved progress"
               >
                 <Trash2 className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                 <span className="hidden sm:inline font-bold">CLEAR</span>
               </button>
             )}
             <button 
               onClick={handleLogout}
               className="flex items-center gap-2 px-4 py-2 glass hover:glass-strong rounded-xl transition-all text-slate-400 hover:text-white group"
               title="Logout"
             >
               <LogOut className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
               <span className="hidden sm:inline font-bold">LOGOUT</span>
             </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8 flex flex-col md:flex-row gap-6 overflow-hidden">
        {/* Sidebar: Framework Explorer */}
        <div className="w-full md:w-80 flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-2 p-2 glass rounded-2xl shadow-xl">
            {(Object.values(Framework) as Framework[]).map((f) => (
              <button 
                key={f}
                onClick={() => setActiveTab(f)}
                className={`py-3 text-[11px] font-black rounded-xl transition-all duration-300 uppercase tracking-wider relative overflow-hidden group ${
                  activeTab === f 
                    ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-lg glow-emerald' 
                    : 'text-slate-400 hover:text-white glass-strong hover:scale-[1.02]'
                }`}
              >
                {activeTab !== f && (
                  <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/0 via-emerald-500/20 to-emerald-500/0 translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-700"></div>
                )}
                <span className="relative z-10">{f}</span>
              </button>
            ))}
          </div>

          <div className="flex-1 glass rounded-2xl flex flex-col overflow-hidden shadow-xl">
            <div className="p-5 border-b border-white/10 glass-strong">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-emerald-400" />
                  <span className="text-sm font-bold text-white uppercase tracking-wider">Tactics</span>
                </div>
                <div className="px-2 py-1 bg-emerald-500/20 rounded-lg text-emerald-400 text-xs font-bold">
                  {filteredTactics.length}
                </div>
              </div>
              {/* Search Input */}
              <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-emerald-400 transition-colors" />
                <input
                  type="text"
                  placeholder="Search tactics..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-10 py-3 glass-strong rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all font-medium"
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
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {filteredTactics.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="p-4 glass rounded-2xl mb-3">
                    <Search className="w-8 h-8 text-slate-600" />
                  </div>
                  <p className="text-sm font-bold text-slate-400">No tactics found</p>
                  <p className="text-xs text-slate-600 mt-1">Try a different search</p>
                </div>
              ) : (
                filteredTactics.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleTacticSelect(t)}
                  className={`w-full text-left p-4 rounded-xl transition-all duration-300 flex items-start justify-between group relative overflow-hidden ${
                    selectedTactic?.id === t.id 
                    ? 'glass-strong border border-emerald-500/30 shadow-lg glow-emerald' 
                    : 'glass border border-white/5 hover:border-white/10 hover:scale-[1.02]'
                  }`}
                >
                  {selectedTactic?.id !== t.id && (
                    <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/0 via-emerald-500/10 to-emerald-500/0 translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-700"></div>
                  )}
                  <div className="flex flex-col gap-2 relative z-10 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-black px-2 py-1 rounded-lg transition-all ${
                         selectedTactic?.id === t.id 
                         ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-md' 
                         : 'glass text-slate-400 group-hover:text-emerald-400'
                      }`}>
                        {t.id}
                      </span>
                      <span className={`font-bold text-sm truncate ${
                        selectedTactic?.id === t.id ? 'text-white' : 'text-slate-300 group-hover:text-white'
                      }`}>{t.name}</span>
                    </div>
                    <p className={`text-xs line-clamp-1 transition-colors ${
                      selectedTactic?.id === t.id ? 'text-emerald-200/70' : 'text-slate-500 group-hover:text-slate-400'
                    }`}>{t.shortDesc}</p>
                  </div>
                  <ChevronRight className={`w-5 h-5 mt-1 transition-all relative z-10 ${
                    selectedTactic?.id === t.id 
                    ? 'translate-x-1 text-emerald-400' 
                    : 'opacity-0 group-hover:opacity-100 group-hover:translate-x-1 text-slate-400'
                  }`} />
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

      <footer className="glass border-t border-white/10 py-4 px-6 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-slate-400 text-[10px] mono uppercase font-bold">
           <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
                <span className="text-emerald-400">Attack Engine: Online</span>
              </div>
              <span className="w-1 h-1 bg-slate-600 rounded-full"></span>
              <span>Gemini 3 Pro Reasoning</span>
           </div>
           <div className="flex items-center gap-4">
              <button
                onClick={() => setShowKeyboardShortcuts(true)}
                className="flex items-center gap-2 glass-strong px-3 py-2 rounded-lg hover:text-emerald-400 transition-all group"
                title="Keyboard shortcuts"
              >
                <Keyboard className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                <span className="hidden sm:inline">Shortcuts</span>
              </button>
              <span className="text-slate-500">ARES <span className="text-emerald-400">v1.4.1</span></span>
           </div>
        </div>
      </footer>

      {/* Team Management Modal */}
      {showTeamManagement && (
        <TeamManagement onClose={() => setShowTeamManagement(false)} />
      )}

      {/* Keyboard Shortcuts Modal */}
      {showKeyboardShortcuts && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Keyboard className="w-5 h-5 text-emerald-400" />
                <h3 className="text-lg font-bold text-white">Keyboard Shortcuts</h3>
              </div>
              <button 
                onClick={() => setShowKeyboardShortcuts(false)}
                className="p-1 hover:bg-slate-800 rounded-lg transition-all text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Global</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between py-2 border-b border-slate-800">
                    <span className="text-sm text-slate-300">Show shortcuts</span>
                    <kbd className="px-2 py-1 bg-slate-950 border border-slate-700 rounded text-xs font-mono text-slate-400">?</kbd>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-slate-800">
                    <span className="text-sm text-slate-300">Open campaigns</span>
                    <div className="flex items-center gap-1">
                      <kbd className="px-2 py-1 bg-slate-950 border border-slate-700 rounded text-xs font-mono text-slate-400">Ctrl</kbd>
                      <span className="text-slate-600">+</span>
                      <kbd className="px-2 py-1 bg-slate-950 border border-slate-700 rounded text-xs font-mono text-slate-400">O</kbd>
                    </div>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-slate-800">
                    <span className="text-sm text-slate-300">Save campaign</span>
                    <div className="flex items-center gap-1">
                      <kbd className="px-2 py-1 bg-slate-950 border border-slate-700 rounded text-xs font-mono text-slate-400">Ctrl</kbd>
                      <span className="text-slate-600">+</span>
                      <kbd className="px-2 py-1 bg-slate-950 border border-slate-700 rounded text-xs font-mono text-slate-400">S</kbd>
                    </div>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-slate-800">
                    <span className="text-sm text-slate-300">Focus search</span>
                    <div className="flex items-center gap-1">
                      <kbd className="px-2 py-1 bg-slate-950 border border-slate-700 rounded text-xs font-mono text-slate-400">Ctrl</kbd>
                      <span className="text-slate-600">+</span>
                      <kbd className="px-2 py-1 bg-slate-950 border border-slate-700 rounded text-xs font-mono text-slate-400">K</kbd>
                    </div>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-slate-300">Close modal</span>
                    <kbd className="px-2 py-1 bg-slate-950 border border-slate-700 rounded text-xs font-mono text-slate-400">Esc</kbd>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Navigation</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between py-2 border-b border-slate-800">
                    <span className="text-sm text-slate-300">Previous step</span>
                    <kbd className="px-2 py-1 bg-slate-950 border border-slate-700 rounded text-xs font-mono text-slate-400">←</kbd>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-slate-300">Next step</span>
                    <kbd className="px-2 py-1 bg-slate-950 border border-slate-700 rounded text-xs font-mono text-slate-400">→</kbd>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 p-3 bg-slate-950 border border-slate-800 rounded-lg">
              <p className="text-xs text-slate-500">
                <span className="text-emerald-400">Tip:</span> Press <kbd className="px-1.5 py-0.5 bg-slate-900 border border-slate-700 rounded text-[10px] font-mono">?</kbd> anytime to see this help
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Save Campaign Modal */}
      {showSaveCampaignModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-white">Save Campaign</h3>
              <button 
                onClick={() => setShowSaveCampaignModal(false)}
                className="p-1 hover:bg-slate-800 rounded-lg transition-all text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Campaign Name *</label>
                <input
                  type="text"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="e.g., Prompt Injection Test Suite"
                  className="w-full px-4 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 transition-all"
                  autoFocus
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Description (Optional)</label>
                <textarea
                  value={campaignDescription}
                  onChange={(e) => setCampaignDescription(e.target.value)}
                  placeholder="Brief description of this attack campaign..."
                  rows={3}
                  className="w-full px-4 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 transition-all resize-none"
                />
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
                <div className="text-xs text-slate-400 space-y-1">
                  <p><span className="text-slate-500">Tactic:</span> {selectedTactic?.name}</p>
                  <p><span className="text-slate-500">Vectors:</span> {selectedVectors.length} selected</p>
                  <p><span className="text-slate-500">Payloads:</span> {selectedPayloadIndices.length} selected</p>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowSaveCampaignModal(false)}
                className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-medium transition-all"
              >
                Cancel
              </button>
              <button
                onClick={saveCampaign}
                disabled={!campaignName.trim()}
                className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                Save Campaign
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Load Campaign Modal */}
      {showCampaignModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-2xl shadow-2xl animate-in zoom-in-95 duration-200 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-white">Saved Campaigns</h3>
              <button 
                onClick={() => setShowCampaignModal(false)}
                className="p-1 hover:bg-slate-800 rounded-lg transition-all text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {campaigns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FolderOpen className="w-12 h-12 text-slate-700 mb-4" />
                <h4 className="text-sm font-bold text-slate-300 mb-2">No Campaigns Yet</h4>
                <p className="text-xs text-slate-500 max-w-sm">
                  Create attack scenarios and save them as campaigns for quick access later.
                </p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                {campaigns.map((campaign) => (
                  <div key={campaign.id} className="bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition-all group">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-bold text-white truncate">{campaign.name}</h4>
                          <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded shrink-0">
                            {campaign.tactic_id}
                          </span>
                        </div>
                        {campaign.description && (
                          <p className="text-xs text-slate-400 mb-2 line-clamp-2">{campaign.description}</p>
                        )}
                        <div className="flex items-center gap-4 text-[10px] text-slate-500">
                          <span>{campaign.selected_vectors.length} vectors</span>
                          <span>•</span>
                          <span>{campaign.selected_payload_indices.length} payloads</span>
                          <span>•</span>
                          <span>{new Date(campaign.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => loadCampaign(campaign)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-all"
                        >
                          Load
                        </button>
                        <button
                          onClick={() => deleteCampaign(campaign.id, campaign.name)}
                          className="p-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-400 rounded-lg transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  </div>
  );
}
