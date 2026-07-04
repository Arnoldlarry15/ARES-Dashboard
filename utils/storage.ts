// LocalStorage utility for persisting dashboard state

const STORAGE_KEY = 'ares_dashboard_state';
const AI_SETTINGS_KEY = 'ares_dashboard_ai_settings';

export interface AiModelSettings {
  preferredProvider?: 'auto' | 'gemini' | 'openai' | 'anthropic' | 'local';
  geminiApiKey?: string;
  openaiApiKey?: string;
  anthropicApiKey?: string;
  localBaseUrl?: string;
  localApiKey?: string;
  localModel?: string;
}

export interface PersistedState {
  selectedTacticId?: string;
  currentStep?: 'vectors' | 'payloads' | 'export';
  selectedVectors?: string[];
  selectedPayloadIndices?: number[];
  activeFramework?: string;
  timestamp?: number;
}

export const StorageManager = {
  // Save current state to localStorage
  saveState(state: PersistedState): void {
    try {
      const dataToSave = {
        ...state,
        timestamp: Date.now()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
    } catch (error) {
      console.error('Failed to save state to localStorage:', error);
    }
  },

  // Load state from localStorage
  loadState(): PersistedState | null {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return null;

      const state: PersistedState = JSON.parse(stored);
      
      // Check if state is older than 24 hours
      const ONE_DAY = 24 * 60 * 60 * 1000;
      if (state.timestamp && Date.now() - state.timestamp > ONE_DAY) {
        // State is stale, clear it
        this.clearState();
        return null;
      }

      return state;
    } catch (error) {
      console.error('Failed to load state from localStorage:', error);
      return null;
    }
  },

  // Clear stored state
  clearState(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('Failed to clear localStorage:', error);
    }
  },

  // Update partial state
  updateState(partialState: Partial<PersistedState>): void {
    const currentState = this.loadState() || {};
    this.saveState({ ...currentState, ...partialState });
  },

  // Save AI provider settings to localStorage
  saveAiSettings(settings: AiModelSettings): void {
    try {
      localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('Failed to save AI settings to localStorage:', error);
    }
  },

  // Load AI provider settings from localStorage
  loadAiSettings(): AiModelSettings {
    try {
      const stored = localStorage.getItem(AI_SETTINGS_KEY);
      if (!stored) return {};
      return JSON.parse(stored) as AiModelSettings;
    } catch (error) {
      console.error('Failed to load AI settings from localStorage:', error);
      return {};
    }
  },

  // Clear AI provider settings from localStorage
  clearAiSettings(): void {
    try {
      localStorage.removeItem(AI_SETTINGS_KEY);
    } catch (error) {
      console.error('Failed to clear AI settings from localStorage:', error);
    }
  }
};
