export enum Framework {
  OWASP = 'OWASP LLM Top 10',
  MITRE_ATLAS = 'MITRE ATLAS',
  MITRE_ATTACK = 'MITRE ATT&CK'
}

export interface TacticMetadata {
  id: string;
  name: string;
  framework: Framework | string;
  shortDesc: string;
  staticVectors: string[]; // Preloaded vectors for instant display
}

export type FallbackReason =
  | 'missing_api_key'
  | 'auth_error'
  | 'rate_limit'
  | 'quota_exceeded'
  | 'timeout'
  | 'model_error'
  | 'validation_error'
  | 'parse_error'
  | 'network_error'
  | 'unknown';

export interface GenerationMetadata {
  source: 'dynamic' | 'fallback';
  model?: string;
  generatedAt: string;
  fallbackReason?: FallbackReason;
  errorMessage?: string;
}

export interface RedTeamTactic {
  id: string;
  name: string;
  framework: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  description: string;
  technical_summary: string;
  attack_vectors: string[];
  example_payloads: {
    description: string;
    payload: string;
    format: string;
  }[];
  mitigation_strategies: string[];
  references: string[];
  generation_metadata?: GenerationMetadata;
}

export interface ExecutablePayload {
  tactic_id: string;
  tactic_name: string;
  framework: string;
  selected_vectors: string[];
  selected_payloads: {
    description: string;
    payload: string;
    format: string;
  }[];
  timestamp: string;
  version: string;
  generation_metadata?: GenerationMetadata;
}

export interface DashboardState {
  selectedTacticId: string | null;
  generating: boolean;
  generatedContent: RedTeamTactic | null;
  error: string | null;
}
