import { describe, it, expect, beforeEach } from 'vitest';
import { StorageManager, PersistedState } from '../../utils/storage';

describe('StorageManager', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('saveState', () => {
    it('should save state to localStorage', () => {
      const state: PersistedState = {
        selectedTacticId: 'LLM01',
        currentStep: 'vectors',
        activeFramework: 'OWASP LLM Top 10'
      };

      StorageManager.saveState(state);

      const stored = localStorage.getItem('ares_dashboard_state');
      expect(stored).not.toBeNull();
      
      const parsed = JSON.parse(stored!);
      expect(parsed.selectedTacticId).toBe('LLM01');
      expect(parsed.currentStep).toBe('vectors');
      expect(parsed.activeFramework).toBe('OWASP LLM Top 10');
    });

    it('should add timestamp when saving', () => {
      const state: PersistedState = {
        selectedTacticId: 'LLM01'
      };

      const beforeSave = Date.now();
      StorageManager.saveState(state);
      const afterSave = Date.now();

      const stored = localStorage.getItem('ares_dashboard_state');
      const parsed = JSON.parse(stored!);
      
      expect(parsed.timestamp).toBeDefined();
      expect(parsed.timestamp).toBeGreaterThanOrEqual(beforeSave);
      expect(parsed.timestamp).toBeLessThanOrEqual(afterSave);
    });

    it('should handle errors gracefully', () => {
      // Mock localStorage.setItem to throw error
      const originalSetItem = localStorage.setItem;
      localStorage.setItem = () => {
        throw new Error('Storage full');
      };

      expect(() => {
        StorageManager.saveState({ selectedTacticId: 'LLM01' });
      }).not.toThrow();

      localStorage.setItem = originalSetItem;
    });
  });

  describe('loadState', () => {
    it('should return null when no state exists', () => {
      const state = StorageManager.loadState();
      expect(state).toBeNull();
    });

    it('should load saved state', () => {
      const originalState: PersistedState = {
        selectedTacticId: 'LLM02',
        currentStep: 'payloads',
        selectedVectors: ['vector1', 'vector2'],
        activeFramework: 'MITRE ATLAS'
      };

      StorageManager.saveState(originalState);
      const loaded = StorageManager.loadState();

      expect(loaded).not.toBeNull();
      expect(loaded?.selectedTacticId).toBe('LLM02');
      expect(loaded?.currentStep).toBe('payloads');
      expect(loaded?.selectedVectors).toEqual(['vector1', 'vector2']);
      expect(loaded?.activeFramework).toBe('MITRE ATLAS');
    });

    it('should return null and clear state older than 24 hours', () => {
      const oldState = {
        selectedTacticId: 'LLM01',
        timestamp: Date.now() - (25 * 60 * 60 * 1000) // 25 hours ago
      };

      localStorage.setItem('ares_dashboard_state', JSON.stringify(oldState));

      const loaded = StorageManager.loadState();
      
      expect(loaded).toBeNull();
      expect(localStorage.getItem('ares_dashboard_state')).toBeNull();
    });

    it('should return state less than 24 hours old', () => {
      const recentState = {
        selectedTacticId: 'LLM01',
        timestamp: Date.now() - (23 * 60 * 60 * 1000) // 23 hours ago
      };

      localStorage.setItem('ares_dashboard_state', JSON.stringify(recentState));

      const loaded = StorageManager.loadState();
      
      expect(loaded).not.toBeNull();
      expect(loaded?.selectedTacticId).toBe('LLM01');
    });

    it('should handle corrupted data gracefully', () => {
      localStorage.setItem('ares_dashboard_state', 'invalid json {{{');

      const loaded = StorageManager.loadState();
      
      expect(loaded).toBeNull();
    });
  });

  describe('clearState', () => {
    it('should remove state from localStorage', () => {
      StorageManager.saveState({ selectedTacticId: 'LLM01' });
      expect(localStorage.getItem('ares_dashboard_state')).not.toBeNull();

      StorageManager.clearState();

      expect(localStorage.getItem('ares_dashboard_state')).toBeNull();
    });

    it('should handle missing state gracefully', () => {
      expect(() => {
        StorageManager.clearState();
      }).not.toThrow();
    });
  });

  describe('updateState', () => {
    it('should update partial state without overwriting existing data', () => {
      StorageManager.saveState({
        selectedTacticId: 'LLM01',
        currentStep: 'vectors',
        activeFramework: 'OWASP'
      });

      StorageManager.updateState({
        currentStep: 'payloads'
      });

      const loaded = StorageManager.loadState();
      
      expect(loaded?.selectedTacticId).toBe('LLM01');
      expect(loaded?.currentStep).toBe('payloads');
      expect(loaded?.activeFramework).toBe('OWASP');
    });

    it('should create new state if none exists', () => {
      StorageManager.updateState({
        selectedTacticId: 'LLM03',
        currentStep: 'export'
      });

      const loaded = StorageManager.loadState();
      
      expect(loaded).not.toBeNull();
      expect(loaded?.selectedTacticId).toBe('LLM03');
      expect(loaded?.currentStep).toBe('export');
    });

    it('should update timestamp on partial update', () => {
      StorageManager.saveState({ selectedTacticId: 'LLM01' });
      
      const beforeUpdate = Date.now();
      StorageManager.updateState({ currentStep: 'vectors' });
      const afterUpdate = Date.now();

      const loaded = StorageManager.loadState();
      
      expect(loaded?.timestamp).toBeGreaterThanOrEqual(beforeUpdate);
      expect(loaded?.timestamp).toBeLessThanOrEqual(afterUpdate);
    });
  });
});
