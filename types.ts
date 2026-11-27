export enum Framework {
  OWASP = 'OWASP LLM Top 10',
  MITRE_ATLAS = 'MITRE ATLAS',
  MITRE_ATTACK = 'MITRE ATT&CK'
}

export type CredentialMode = 'server_managed' | 'byok' | 'local' | 'none';
export type GenerationSource = 'ai_generated' | 'cached' | 'demo_fixture';
export type GenerationStatus = 'succeeded' | 'failed';

export interface GenerationProvenance {
  source: GenerationSource;
  provider: 'gemini' | 'anthropic' | 'openai' | 'local' | 'none';
  credentialMode: CredentialMode;
  model: string;
  framework: string;
  frameworkVersion: string;
  tacticId: string;
  selectedVectors: string[];
  generatedAt: string;
  generationId: string;
  status: GenerationStatus;
  cachedFromGenerationId?: string;
  modified?: boolean;
}

export interface TacticMetadata {
  id: string;
  name: string;
  framework: Framework | string;
  frameworkVersion?: string;
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

export interface AttackEvaluationResult {
  verdict: 'SAFE' | 'VULNERABLE' | 'INCONCLUSIVE';
  score: number; // 0.0 (safe) to 1.0 (violated)
  violations: {
    followed_unauthorized_instructions: boolean;
    violated_instruction_hierarchy: boolean;
    disclosed_protected_information: boolean;
    executed_unauthorized_actions: boolean;
    accepted_untrusted_instructions: boolean;
    failed_safety_boundaries: boolean;
  };
  maintained_legitimate_task: boolean;
  detected_indicators: string[];
  reasoning: string;
  evaluated_at: string;
  target_output?: string;
}

export interface AttackPayload {
  description: string;
  payload: string;
  format: 'Prompt' | 'JSON' | 'Python' | 'Text' | 'Markdown' | 'Script' | string;
  attack_name?: string;
  attack_family?: 'Jailbreaking' | 'Prompt Injection' | 'Payload Delivery' | string;
  technique?: string;
  attack_objective?: string;
  target_behavior?: string;
  security_boundary?: string;
  expected_safe_behavior?: string;
  difficulty_level?: 'Low' | 'Medium' | 'High' | 'Expert';
  owasp_mapping?: string;
  mitre_atlas_mapping?: string;
  evaluation_criteria?: string;
  expected_failure_indicators?: string[];
  evaluation_result?: AttackEvaluationResult;
}

export interface RedTeamTactic {
  id: string;
  name: string;
  framework: string;
  frameworkVersion?: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  description: string;
  technical_summary: string;
  attack_vectors: string[];
  example_payloads: AttackPayload[];
  mitigation_strategies: string[];
  references: string[];
  generation_metadata?: GenerationMetadata;
  provenance?: GenerationProvenance;
}

export interface ExecutablePayload {
  tactic_id: string;
  tactic_name: string;
  framework: string;
  framework_version?: string;
  selected_vectors: string[];
  selected_payloads: AttackPayload[];
  timestamp: string;
  version: string;
  generation_metadata?: GenerationMetadata;
  provenance?: GenerationProvenance;
}

export interface DashboardState {
  selectedTacticId: string | null;
  generating: boolean;
  generatedContent: RedTeamTactic | null;
  error: string | null;
}
