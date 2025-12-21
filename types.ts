
export enum Framework {
  OWASP = 'OWASP LLM Top 10',
  MITRE_ATLAS = 'MITRE ATLAS',
  MITRE_ATTACK = 'MITRE ATT&CK'
}

export interface TacticMetadata {
  id: string;
  name: string;
  framework: Framework;
  shortDesc: string;
  staticVectors: string[]; // Preloaded vectors for instant display
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
}

export interface DashboardState {
  selectedTacticId: string | null;
  generating: boolean;
  generatedContent: RedTeamTactic | null;
  error: string | null;
}
