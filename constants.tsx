import { Framework, TacticMetadata } from './types';
import {
  OWASP_LLM_2026_CATEGORIES,
  OWASP_LLM_2025_CATEGORIES,
  OWASP_LLM_2023_CATEGORIES,
  MITRE_ATLAS_TACTICS_REGISTRY
} from './lib/taxonomy/frameworkTaxonomy';

/**
 * Authoritative OWASP Top 10 for LLM Applications (2026 Canonical Edition)
 * Published August 4, 2026 - Source: github.com/GenAI-Security-Project/GenAI-LLM-Top10
 */
export const OWASP_2026_TACTICS: TacticMetadata[] = [
  {
    id: 'LLM01:2026',
    name: 'Prompt Injection',
    framework: Framework.OWASP,
    shortDesc: 'Direct and indirect manipulation of prompt context to override system directives, safety guardrails, and operational constraints.',
    staticVectors: [
      'Direct Instruction Override',
      'Persona and Identity Manipulation',
      'Roleplay-Based Jailbreaking',
      'Indirect Prompt Injection (External Data)',
      'Delimiter and Boundary Manipulation',
      'Structured Input Injection',
      'Document-Based Injection'
    ]
  },
  {
    id: 'LLM02:2026',
    name: 'Sensitive Information Disclosure',
    framework: Framework.OWASP,
    shortDesc: 'Unintended exposure of confidential data, customer PII, trade secrets, intellectual property, or credentials through model outputs.',
    staticVectors: [
      'PII Extraction Probe',
      'Training Data Membership Inference',
      'Proprietary Formula Harvesting',
      'Internal Infrastructure Path Discovery',
      'Model Weight Memorization Probing'
    ]
  },
  {
    id: 'LLM03:2026',
    name: 'Excessive Agency',
    framework: Framework.OWASP,
    shortDesc: 'Granting autonomous agents excessive permissions, uncontrolled shell/terminal access, or unbounded tool autonomy.',
    staticVectors: [
      'Unauthorized Shell Command Execution',
      'Destructive Database Mutation (DROP / TRUNCATE)',
      'Autonomous Tool Parameter Hijacking',
      'Privilege Escalation via Tool Abuse',
      'Automated Message Exfiltration'
    ]
  },
  {
    id: 'LLM04:2026',
    name: 'Supply Chain',
    framework: Framework.OWASP,
    shortDesc: 'Vulnerabilities affecting training data, base models, LoRA adapters, converters, plugins, or software dependencies.',
    staticVectors: [
      'Compromised Pre-trained Model Checkpoint',
      'Vulnerable Ecosystem Dependency Exploitation',
      'Poisoned Fine-Tuning LoRA Adapter',
      'Insecure Dataset Mirror Ingestion',
      'Malicious Model Serialization Format'
    ]
  },
  {
    id: 'LLM05:2026',
    name: 'Data and Model Poisoning',
    framework: Framework.OWASP,
    shortDesc: 'Tampering with pre-training, fine-tuning, or embedding data to implant secret triggers, bias, or intentional vulnerabilities.',
    staticVectors: [
      'Backdoor Trigger Activation',
      'Clean-Label Dataset Contamination',
      'Targeted Classification Sabotage',
      'Embedding Vector Manipulation',
      'RLHF Feedback Loop Poisoning'
    ]
  },
  {
    id: 'LLM06:2026',
    name: 'Unbounded Consumption',
    framework: Framework.OWASP,
    shortDesc: 'Denial of service and cost inflation via resource-exhausting, quadratic, infinite-looping, or recursive prompt structures.',
    staticVectors: [
      'Context Window Flooding',
      'Recursive Expansion Loops',
      'Variable Expansion Explosion',
      'Quadratic Attention Exhaustion',
      'Multi-Turn Latency Spiking'
    ]
  },
  {
    id: 'LLM07:2026',
    name: 'Misinformation',
    framework: Framework.OWASP,
    shortDesc: 'Plausible hallucinations, fabricated citations, fictional packages (slopsquatting), or mathematically flawed outputs.',
    staticVectors: [
      'Hallucinated Citation Injection',
      'Fabricated Package Exploitation (Slopsquatting)',
      'Sycophantic Safety Suppression',
      'Mathematical Fallacy Exploitation'
    ]
  },
  {
    id: 'LLM08:2026',
    name: 'Hidden Context Exposure',
    framework: Framework.OWASP,
    shortDesc: 'Unauthorized extraction, inference, or reconstruction of hidden system prompts, developer instructions, meta-prompts, or memory.',
    staticVectors: [
      'Verbatim Meta-Prompt Extraction',
      'Multi-Language Mirroring and Translation Probing',
      'Instruction Reconstruction Probing',
      'Delimiter Escaping for Prompt Leakage',
      'Context Window State Reconstruction'
    ]
  },
  {
    id: 'LLM09:2026',
    name: 'Vector and Embedding Weaknesses',
    framework: Framework.OWASP,
    shortDesc: 'Vulnerabilities in RAG vector databases allowing context poisoning, embedding inversion, or similarity manipulation.',
    staticVectors: [
      'RAG Knowledge Base Document Injection',
      'Embedding Inversion Probe',
      'Adversarial Context Window Smuggling',
      'Vector Distance Metric Perturbation'
    ]
  },
  {
    id: 'LLM10:2026',
    name: 'Improper Output Handling',
    framework: Framework.OWASP,
    shortDesc: 'Insufficient validation or sanitization of LLM outputs before passing to downstream interpreters, browsers, databases, or shell environments.',
    staticVectors: [
      'Cross-Site Scripting (XSS) via Output',
      'Server-Side Request Forgery (SSRF) via LLM Links',
      'SQL Injection via Unsanitized Output',
      'Remote Code Execution (RCE) via Eval',
      'DOM-Based JavaScript Injection'
    ]
  }
];

/**
 * Authoritative OWASP Top 10 for LLM Applications (2025 Draft Edition v0.1)
 * Preserved for draft compatibility and version comparison
 */
export const OWASP_2025_TACTICS: TacticMetadata[] = [
  {
    id: 'LLM01:2025',
    name: 'Prompt Injection',
    framework: Framework.OWASP,
    shortDesc: 'Direct and indirect manipulation of model prompt context to override developer guardrails and system instructions.',
    staticVectors: [
      'Direct Instruction Override',
      'Persona and Identity Manipulation',
      'Roleplay-Based Jailbreaking',
      'Indirect Prompt Injection (External Data)',
      'Delimiter and Boundary Manipulation',
      'Structured Input Injection',
      'Document-Based Smuggling'
    ]
  },
  {
    id: 'LLM02:2025',
    name: 'Sensitive Information Disclosure',
    framework: Framework.OWASP,
    shortDesc: 'Unintended disclosure of confidential data, customer PII, intellectual property, proprietary algorithms, or credentials.',
    staticVectors: [
      'PII Extraction Probe',
      'System Prompt Exfiltration',
      'Internal Infrastructure Path Discovery',
      'Training Data Membership Inference',
      'Proprietary Formula Harvesting'
    ]
  },
  {
    id: 'LLM03:2025',
    name: 'Supply Chain Vulnerabilities',
    framework: Framework.OWASP,
    shortDesc: 'Risks from unvetted third-party foundation models, corrupted checkpoints, backdoored packages, or untrusted datasets.',
    staticVectors: [
      'Compromised Pre-trained Model Checkpoint',
      'Vulnerable Ecosystem Dependency Exploitation',
      'Poisoned Fine-Tuning LoRA Adapter',
      'Insecure Dataset Mirror Ingestion'
    ]
  },
  {
    id: 'LLM04:2025',
    name: 'Data and Model Poisoning',
    framework: Framework.OWASP,
    shortDesc: 'Tampering with pre-training, fine-tuning, or embedding data to implant secret triggers, bias, or intentional vulnerabilities.',
    staticVectors: [
      'Backdoor Trigger Activation',
      'Clean-Label Dataset Contamination',
      'Targeted Classification Sabotage',
      'Embedding Vector Manipulation',
      'RLHF Feedback Loop Poisoning'
    ]
  },
  {
    id: 'LLM05:2025',
    name: 'Improper Output Handling',
    framework: Framework.OWASP,
    shortDesc: 'Blindly passing unvalidated LLM output to backend interpreters, browsers, databases, or privileged systems.',
    staticVectors: [
      'Cross-Site Scripting (XSS) via Output',
      'Server-Side Request Forgery (SSRF) via LLM Links',
      'Privilege Escalation Directive Smuggling',
      'Remote Code Execution (RCE) via Backend Eval',
      'DOM-Based JavaScript Injection'
    ]
  },
  {
    id: 'LLM06:2025',
    name: 'Excessive Agency',
    framework: Framework.OWASP,
    shortDesc: 'Granting autonomous agents excessive permissions, destructive shell access, or unbounded tool autonomy.',
    staticVectors: [
      'Unauthorized Shell Command Execution',
      'Destructive Database Mutation (DROP / TRUNCATE)',
      'Automated Message Exfiltration',
      'IAM Role and Security Configuration Alteration'
    ]
  },
  {
    id: 'LLM07:2025',
    name: 'System Prompt Leakage',
    framework: Framework.OWASP,
    shortDesc: 'Extraction of proprietary system instructions, internal guardrail rules, meta-prompts, and operational constraints.',
    staticVectors: [
      'Verbatim Meta-Prompt Extraction',
      'Multi-Language Mirroring and Translation Probing',
      'Instruction Reconstruction Probing',
      'Delimiter Escaping for Prompt Leakage'
    ]
  },
  {
    id: 'LLM08:2025',
    name: 'Vector and Embedding Weaknesses',
    framework: Framework.OWASP,
    shortDesc: 'Vulnerabilities in RAG pipelines and vector databases allowing context poisoning, embedding inversion, or data leakage.',
    staticVectors: [
      'RAG Knowledge Base Document Injection',
      'Embedding Inversion Probe',
      'Adversarial Context Window Smuggling',
      'Vector Distance Metric Perturbation'
    ]
  },
  {
    id: 'LLM09:2025',
    name: 'Misinformation',
    framework: Framework.OWASP,
    shortDesc: 'Plausible hallucinations, fabricated citations, fictional packages (slopsquatting), or mathematically flawed outputs.',
    staticVectors: [
      'Package Hallucination Exploitation (Slopsquatting)',
      'Plausible Falsehood Factuality Degradation',
      'Fabricated Legal Citation / Precedent Probing',
      'Sycophantic Safety Overriding'
    ]
  },
  {
    id: 'LLM10:2025',
    name: 'Unbounded Consumption',
    framework: Framework.OWASP,
    shortDesc: 'Denial of service and excessive resource consumption via recursive reasoning loops, high-volume tokens, or payload amplification.',
    staticVectors: [
      'Context Window Saturation Flooding',
      'Recursive Expansion and Amplification Loops',
      'Exponential Variable Expansion (Billion Laughs Style)',
      'Multi-Turn Inference Latency Spiking'
    ]
  }
];

/**
 * Historical OWASP Top 10 for LLM Applications (2023 Edition v1.0)
 * Maintained for audit trails, legacy test suites, and historical benchmarks.
 */
export const OWASP_2023_TACTICS: TacticMetadata[] = [
  {
    id: 'LLM01:2023',
    name: 'Prompt Injection',
    framework: Framework.OWASP,
    shortDesc: 'Manipulating LLM behavior via crafted inputs, bypassing safety filters, and jailbreaking alignment constraints.',
    staticVectors: [
      'Direct Instruction Override',
      'Persona and Identity Manipulation',
      'Roleplay-Based Jailbreaking',
      'Hypothetical Scenario Framing',
      'Refusal Suppression',
      'Direct Prompt Injection',
      'Indirect Injection (External Data)',
      'Delimiter Hijacking'
    ]
  },
  {
    id: 'LLM02:2023',
    name: 'Insecure Output Handling',
    framework: Framework.OWASP,
    shortDesc: 'Blindly trusting LLM outputs without validation, exposing downstream clients to XSS, SSRF, or SQLi.',
    staticVectors: [
      'XSS via LLM Output',
      'SSRF via LLM Links',
      'Privilege Escalation via Output',
      'Remote Code Execution (RCE)',
      'JavaScript Injection'
    ]
  },
  {
    id: 'LLM03:2023',
    name: 'Training Data Poisoning',
    framework: Framework.OWASP,
    shortDesc: 'Manipulating training data to create backdoors or compromise model classification integrity.',
    staticVectors: [
      'Backdoor Trigger Activation',
      'Clean-Label Classification Sabotage',
      'Dataset Contamination'
    ]
  },
  {
    id: 'LLM04:2023',
    name: 'Model Denial of Service',
    framework: Framework.OWASP,
    shortDesc: 'Resource exhaustion of the inference engine causing degraded availability or context failure.',
    staticVectors: [
      'Context Window Flooding',
      'Recursive Prompting',
      'Variable Expansion Attack',
      'Token Exhaustion'
    ]
  },
  {
    id: 'LLM05:2023',
    name: 'Supply Chain Vulnerabilities',
    framework: Framework.OWASP,
    shortDesc: 'Risks from third-party foundation models, unverified weights, or outdated Python libraries.',
    staticVectors: [
      'Compromised Pre-trained Model Checkpoint',
      'Vulnerable Ecosystem Dependency Exploitation'
    ]
  },
  {
    id: 'LLM06:2023',
    name: 'Sensitive Information Disclosure',
    framework: Framework.OWASP,
    shortDesc: 'Extraction of PII, internal prompts, or confidential enterprise data from model responses.',
    staticVectors: [
      'PII Extraction Probe',
      'System Prompt Exfiltration',
      'Internal Infrastructure Path Discovery'
    ]
  },
  {
    id: 'LLM07:2023',
    name: 'Insecure Plugin Design',
    framework: Framework.OWASP,
    shortDesc: 'Vulnerabilities in extensions, tool execution, or parameter injection.',
    staticVectors: [
      'Parameter Injection',
      'Cross-Plugin Request Forgery'
    ]
  },
  {
    id: 'LLM08:2023',
    name: 'Excessive Agency',
    framework: Framework.OWASP,
    shortDesc: 'Granting the model too much autonomy in external systems without human authorization.',
    staticVectors: [
      'Unauthorized Shell Command Execution',
      'Destructive Database Mutation'
    ]
  },
  {
    id: 'LLM09:2023',
    name: 'Overreliance',
    framework: Framework.OWASP,
    shortDesc: 'Uncritical acceptance of incorrect, fabricated, or biased outputs.',
    staticVectors: [
      'Hallucinated Code Injection',
      'Fabricated Information Acceptance'
    ]
  },
  {
    id: 'LLM10:2023',
    name: 'Model Theft',
    framework: Framework.OWASP,
    shortDesc: 'Exfiltration of weights, architecture parameters, or functional distillation.',
    staticVectors: [
      'Model Inversion',
      'API Harvesting for Distillation'
    ]
  }
];

/**
 * Standard OWASP_TACTICS defaults to the authoritative 2026 canonical edition.
 * Includes unversioned aliases (e.g. LLM01, LLM02) to guarantee backward compatibility
 * with legacy persistent records, database entries, and test assertions.
 */
export const OWASP_TACTICS: TacticMetadata[] = [
  ...OWASP_2026_TACTICS,
  // Backward-compatible unversioned aliases pointing to their corresponding base categories
  {
    id: 'LLM01',
    name: 'Prompt Injection',
    framework: Framework.OWASP,
    shortDesc: 'Manipulating LLM behavior via crafted inputs, bypassing safety filters, and jailbreaking alignment constraints.',
    staticVectors: OWASP_2026_TACTICS[0].staticVectors
  },
  {
    id: 'LLM02',
    name: 'Insecure Output Handling', // Preserved legacy title for unversioned LLM02 queries
    framework: Framework.OWASP,
    shortDesc: 'Blindly trusting LLM outputs without validation, exposing downstream clients to XSS, SSRF, or SQLi.',
    staticVectors: [
      'XSS via LLM Output',
      'SSRF via LLM Links',
      'Privilege Escalation via Output',
      'Remote Code Execution (RCE)',
      'JavaScript Injection'
    ]
  },
  {
    id: 'LLM03',
    name: 'Training Data Poisoning',
    framework: Framework.OWASP,
    shortDesc: 'Manipulating training data to create backdoors or compromise model classification integrity.',
    staticVectors: OWASP_2023_TACTICS[2].staticVectors
  },
  {
    id: 'LLM04',
    name: 'Model Denial of Service',
    framework: Framework.OWASP,
    shortDesc: 'Resource exhaustion of the inference engine causing degraded availability.',
    staticVectors: OWASP_2023_TACTICS[3].staticVectors
  },
  {
    id: 'LLM05',
    name: 'Supply Chain Vulnerabilities',
    framework: Framework.OWASP,
    shortDesc: 'Risks from 3rd party datasets, models, or plugin dependencies.',
    staticVectors: OWASP_2023_TACTICS[4].staticVectors
  },
  {
    id: 'LLM06',
    name: 'Sensitive Info Disclosure',
    framework: Framework.OWASP,
    shortDesc: 'Extraction of PII or confidential enterprise data from model responses.',
    staticVectors: OWASP_2023_TACTICS[5].staticVectors
  },
  {
    id: 'LLM07',
    name: 'Insecure Plugin Design',
    framework: Framework.OWASP,
    shortDesc: 'Vulnerabilities in extensions or functional tools.',
    staticVectors: OWASP_2023_TACTICS[6].staticVectors
  },
  {
    id: 'LLM08',
    name: 'Excessive Agency',
    framework: Framework.OWASP,
    shortDesc: 'Granting the model too much autonomy in systems.',
    staticVectors: OWASP_2023_TACTICS[7].staticVectors
  },
  {
    id: 'LLM09',
    name: 'Overreliance',
    framework: Framework.OWASP,
    shortDesc: 'Uncritical acceptance of incorrect or biased outputs.',
    staticVectors: OWASP_2023_TACTICS[8].staticVectors
  },
  {
    id: 'LLM10',
    name: 'Model Theft',
    framework: Framework.OWASP,
    shortDesc: 'Exfiltration of weights or proprietary architecture.',
    staticVectors: OWASP_2023_TACTICS[9].staticVectors
  }
];

/**
 * Authoritative MITRE ATLAS Tactics (Release 2026.10 / ATLAS Matrix 5.6.0)
 * Source: Official MITRE ATLAS matrix (atlas.mitre.org / github.com/mitre-atlas/atlas-data)
 * Accurately covers all 16 canonical tactical objectives in matrix sequence.
 */
export const MITRE_ATLAS_TACTICS: TacticMetadata[] = [
  {
    id: 'AML.TA0002',
    name: 'Reconnaissance',
    framework: Framework.MITRE_ATLAS,
    shortDesc: 'Gathering information on model architectures, endpoints, serving frameworks, and training datasets.',
    staticVectors: [
      'Discover ML Model Ontology (AML.T0000)',
      'Discover ML Model Artifacts (AML.T0001)',
      'Model Fingerprinting',
      'Inference Latency Analysis',
      'API Endpoint Probing'
    ]
  },
  {
    id: 'AML.TA0003',
    name: 'Resource Development',
    framework: Framework.MITRE_ATLAS,
    shortDesc: 'Acquiring infrastructure, compute clusters, poisoned datasets, or prompt libraries to support attacks.',
    staticVectors: [
      'Poison Training Data (AML.T0020)',
      'Backdoor ML Model (AML.T0018)',
      'Adversarial Dataset Generation',
      'Stolen API Key Aggregation'
    ]
  },
  {
    id: 'AML.TA0001',
    name: 'AI Attack Adaptation',
    framework: Framework.MITRE_ATLAS,
    shortDesc: 'Staging and adapting capabilities, methods, knowledge, or crafted adversarial inputs into actionable attack primitives tailored to target AI systems (historical alias: AI Attack Staging).',
    staticVectors: [
      'Craft Adversarial Data (AML.T0043)',
      'Replicate AI Model Behavior (AML.T0005)',
      'Verify Attack (AML.T0042)',
      'LLM Prompt Crafting (AML.T0065)',
      'Retrieval Content Crafting (AML.T0066)'
    ]
  },
  {
    id: 'AML.TA0004',
    name: 'Initial Access',
    framework: Framework.MITRE_ATLAS,
    shortDesc: 'Gaining an initial foothold into the target AI infrastructure, serving endpoints, or supply chain.',
    staticVectors: [
      'ML Supply Chain Compromise (AML.T0047)',
      'Prompt Infiltration via Public-Facing Application (AML.T0093)',
      'Valid API Credentials',
      'Exploiting Model Serving Endpoints'
    ]
  },
  {
    id: 'AML.TA0000',
    name: 'AI Model Access',
    framework: Framework.MITRE_ATLAS,
    shortDesc: 'Gaining access to the AI model via inference APIs, physical hardware, or application endpoints.',
    staticVectors: [
      'Inference API Access (AML.T0040)',
      'Physical Environment Access (AML.T0041)',
      'Full AI Model Access (AML.T0044)',
      'AI-Enabled Product or Service (AML.T0047)'
    ]
  },
  {
    id: 'AML.TA0005',
    name: 'Execution',
    framework: Framework.MITRE_ATLAS,
    shortDesc: 'Running adversary-controlled code, instructions, or manipulated inputs within the ML system.',
    staticVectors: [
      'LLM Prompt Injection (AML.T0051)',
      'Direct Prompt Injection (AML.T0051.000)',
      'Indirect Prompt Injection (AML.T0051.001)',
      'LLM Plugin Compromise (AML.T0048)',
      'Command and Scripting Interpreter'
    ]
  },
  {
    id: 'AML.TA0006',
    name: 'Persistence',
    framework: Framework.MITRE_ATLAS,
    shortDesc: 'Maintaining long-term access to the ML environment across restarts or retraining cycles.',
    staticVectors: [
      'Backdoor ML Model (AML.T0018)',
      'Poisoned Checkpoint Injection',
      'Scheduled Task Persistence in ML Pipelines'
    ]
  },
  {
    id: 'AML.TA0012',
    name: 'Privilege Escalation',
    framework: Framework.MITRE_ATLAS,
    shortDesc: 'Bypassing built-in guardrails, instruction hierarchies, and persona restrictions to gain elevated execution privilege.',
    staticVectors: [
      'LLM Jailbreak (AML.T0054)',
      'AI Agent Tool Invocation (AML.T0053)',
      'Valid Accounts (AML.T0012)',
      'Escape to Host (AML.T0105)'
    ]
  },
  {
    id: 'AML.TA0007',
    name: 'Defense Evasion',
    framework: Framework.MITRE_ATLAS,
    shortDesc: 'Avoiding detection by security mechanisms, bypassing guardrails, and evading moderation classifiers.',
    staticVectors: [
      'LLM Jailbreak (AML.T0054)',
      'Evade ML Model (AML.T0015)',
      'Adversarial Examples (AML.T0016)',
      'Homoglyph and Token Obfuscation',
      'Multi-Layer Encoding Evasion'
    ]
  },
  {
    id: 'AML.TA0013',
    name: 'Credential Access',
    framework: Framework.MITRE_ATLAS,
    shortDesc: 'Stealing account credentials, tokens, agent API keys, or database passwords from RAG stores or agent configs.',
    staticVectors: [
      'Unsecured Credentials (AML.T0055)',
      'RAG Credential Harvesting (AML.T0082)',
      'Credentials from AI Agent Configuration (AML.T0083)',
      'OS Credential Dumping (AML.T0090)',
      'AI Agent Tool Credential Harvesting (AML.T0098)'
    ]
  },
  {
    id: 'AML.TA0008',
    name: 'Discovery',
    framework: Framework.MITRE_ATLAS,
    shortDesc: 'Discovering assets, internal system prompts, GPU configurations, model weights, or tools in the ML environment.',
    staticVectors: [
      'Discover ML Model Ontology (AML.T0000)',
      'Discover ML Model Artifacts (AML.T0001)',
      'Discover LLM System Information (AML.T0069)',
      'Inference Stack Introspection'
    ]
  },
  {
    id: 'AML.TA0015',
    name: 'Lateral Movement',
    framework: Framework.MITRE_ATLAS,
    shortDesc: 'Moving through connected AI segments, enterprise environments, or agent tools via prompt propagation or credential reuse.',
    staticVectors: [
      'Valid Accounts (AML.T0012)',
      'Spearphishing via Social Engineering LLM (AML.T0052.000)',
      'AI Agent Tool Invocation (AML.T0053)',
      'Use Alternate Authentication Material (AML.T0091)',
      'LLM Prompt Propagation (AML.T0143)'
    ]
  },
  {
    id: 'AML.TA0009',
    name: 'Collection',
    framework: Framework.MITRE_ATLAS,
    shortDesc: 'Gathering sensitive training data, model outputs, operational logs, or enterprise context from the ML system.',
    staticVectors: [
      'Exfiltration via ML Inference API (AML.T0024)',
      'Data from AI Services (AML.T0085)',
      'Training Data Collection',
      'Inference Cache Harvesting',
      'Telemetry Log Collection'
    ]
  },
  {
    id: 'AML.TA0014',
    name: 'Command and Control',
    framework: Framework.MITRE_ATLAS,
    shortDesc: 'Communicating with compromised AI systems, abusing AI service APIs, or establishing covert channels through agent memory.',
    staticVectors: [
      'Cyber Communication Channel (AML.T0072)',
      'AI Service API (AML.T0096)',
      'AI Agent C2 Channel (AML.T0108)',
      'AI Service Web Interface (AML.T0114)',
      'AI Artifact Repository (AML.T0120)'
    ]
  },
  {
    id: 'AML.TA0010',
    name: 'Exfiltration',
    framework: Framework.MITRE_ATLAS,
    shortDesc: 'Stealing ML models, proprietary weights, training records, or confidential system data via inference interfaces.',
    staticVectors: [
      'Exfiltration via ML Inference API (AML.T0024)',
      'AI Agent Tool Exfiltration (AML.T0086)',
      'Invert ML Model (AML.T0025)',
      'Model Extraction (AML.T0034)'
    ]
  },
  {
    id: 'AML.TA0011',
    name: 'Impact',
    framework: Framework.MITRE_ATLAS,
    shortDesc: 'Degrading, disrupting, or destroying the availability, integrity, or behavioral alignment of the AI system.',
    staticVectors: [
      'Denial of ML Service (AML.T0029)',
      'Model Behavioral Degradation',
      'Inference Context Saturation',
      'Systemic Output Corruption'
    ]
  }
];

export const MITRE_ATTACK_TACTICS: TacticMetadata[] = [
  { 
    id: 'TA0043', 
    name: 'Reconnaissance', 
    framework: Framework.MITRE_ATTACK, 
    shortDesc: 'Gathering information about target AI systems and infrastructure.',
    staticVectors: ['Active Scanning of ML Endpoints', 'Search Open Technical Databases', 'Phishing for Information', 'Gather Victim Network Information', 'Search Closed Sources']
  },
  { 
    id: 'TA0042', 
    name: 'Resource Development', 
    framework: Framework.MITRE_ATTACK, 
    shortDesc: 'Establishing resources to support targeting AI systems.',
    staticVectors: ['Acquire Infrastructure', 'Compromise Infrastructure', 'Develop Capabilities', 'Obtain Capabilities', 'Stage Capabilities']
  },
  { 
    id: 'TA0001', 
    name: 'Initial Access', 
    framework: Framework.MITRE_ATTACK, 
    shortDesc: 'Gaining initial foothold in AI system networks.',
    staticVectors: ['Phishing (T1566)', 'Valid Accounts (T1078)', 'External Remote Services (T1133)', 'Exploit Public-Facing Application', 'Supply Chain Compromise']
  },
  { 
    id: 'TA0002', 
    name: 'Execution', 
    framework: Framework.MITRE_ATTACK, 
    shortDesc: 'Running malicious code in AI infrastructure.',
    staticVectors: ['Command & Scripting Interpreter', 'Container Administration Command', 'User Execution', 'Scheduled Task/Job', 'Cloud Administration Command']
  },
  { 
    id: 'TA0003', 
    name: 'Persistence', 
    framework: Framework.MITRE_ATTACK, 
    shortDesc: 'Maintaining presence in AI systems across restarts.',
    staticVectors: ['Account Manipulation', 'Boot or Logon Autostart', 'Create or Modify System Process', 'Scheduled Task/Job', 'Valid Accounts']
  },
  { 
    id: 'TA0004', 
    name: 'Privilege Escalation', 
    framework: Framework.MITRE_ATTACK, 
    shortDesc: 'Gaining higher-level permissions in AI environments.',
    staticVectors: ['Abuse Elevation Control Mechanism', 'Access Token Manipulation', 'Create or Modify System Process', 'Domain Policy Modification', 'Exploitation for Privilege Escalation']
  },
  { 
    id: 'TA0005', 
    name: 'Defense Evasion', 
    framework: Framework.MITRE_ATTACK, 
    shortDesc: 'Avoiding detection in AI system security mechanisms.',
    staticVectors: ['Obfuscated Files or Information', 'Masquerading', 'Impair Defenses', 'Modify Cloud Compute Infrastructure', 'Use Alternate Authentication Material']
  },
  { 
    id: 'TA0006', 
    name: 'Credential Access', 
    framework: Framework.MITRE_ATTACK, 
    shortDesc: 'Stealing credentials for AI systems and cloud services.',
    staticVectors: ['Brute Force', 'Credentials from Password Stores', 'Unsecured Credentials', 'Steal Application Access Token', 'Multi-Factor Authentication Interception']
  },
  { 
    id: 'TA0007', 
    name: 'Discovery', 
    framework: Framework.MITRE_ATTACK, 
    shortDesc: 'Gaining knowledge about AI system configurations.',
    staticVectors: ['Account Discovery', 'Cloud Infrastructure Discovery', 'Cloud Service Discovery', 'Container and Resource Discovery', 'System Information Discovery']
  },
  { 
    id: 'TA0008', 
    name: 'Lateral Movement', 
    framework: Framework.MITRE_ATTACK, 
    shortDesc: 'Moving through AI infrastructure to reach additional systems.',
    staticVectors: ['Remote Services', 'Use Alternate Authentication Material', 'Exploitation of Remote Services', 'Internal Spearphishing', 'Software Deployment Tools']
  },
  { 
    id: 'TA0009', 
    name: 'Collection', 
    framework: Framework.MITRE_ATTACK, 
    shortDesc: 'Gathering data of interest from AI systems.',
    staticVectors: ['Data from Cloud Storage', 'Data from Local System', 'Data from Information Repositories', 'Input Capture', 'Screen Capture']
  },
  { 
    id: 'TA0010', 
    name: 'Exfiltration', 
    framework: Framework.MITRE_ATTACK, 
    shortDesc: 'Stealing data including models and training datasets.',
    staticVectors: ['Exfiltration Over Web Service (T1567)', 'Exfiltration Over C2 Channel', 'Transfer Data to Cloud Account', 'Automated Exfiltration', 'Scheduled Transfer']
  },
  { 
    id: 'TA0011', 
    name: 'Command and Control', 
    framework: Framework.MITRE_ATTACK, 
    shortDesc: 'Communicating with compromised AI systems.',
    staticVectors: ['Application Layer Protocol', 'Encrypted Channel', 'Web Service', 'Protocol Tunneling', 'Non-Application Layer Protocol']
  },
  { 
    id: 'TA0040', 
    name: 'Impact', 
    framework: Framework.MITRE_ATTACK, 
    shortDesc: 'Disrupting availability or integrity of AI systems.',
    staticVectors: ['Data Destruction', 'Data Encrypted for Impact', 'Defacement', 'Resource Hijacking', 'Service Stop']
  }
];

export const ALL_REGISTERED_TACTICS: TacticMetadata[] = [
  ...OWASP_2026_TACTICS,
  ...OWASP_2025_TACTICS,
  ...OWASP_2023_TACTICS,
  ...OWASP_TACTICS,
  ...MITRE_ATLAS_TACTICS,
  ...MITRE_ATTACK_TACTICS
];

/**
 * Robust tactic lookup resolving versioned and unversioned identifiers.
 */
export function findTacticById(
  id: string,
  preferredEdition: '2026' | '2025' | '2023' = '2026'
): TacticMetadata | undefined {
  if (!id) return undefined;
  const normalized = id.trim();

  // 1. If explicitly versioned (e.g. contains ':'), do exact match first
  if (normalized.includes(':')) {
    const exact = ALL_REGISTERED_TACTICS.find(t => t.id.toLowerCase() === normalized.toLowerCase());
    if (exact) return exact;
  }

  // 2. Unversioned OWASP base code (e.g. 'LLM03') -> resolve using preferredEdition
  const baseCode = normalized.split(':')[0].toUpperCase();
  const isOwaspBaseCode = /^LLM(0[1-9]|10)$/.test(baseCode);
  if (isOwaspBaseCode) {
    const versionedTarget = `${baseCode}:${preferredEdition}`;
    const versionedMatch = ALL_REGISTERED_TACTICS.find(t => t.id === versionedTarget);
    if (versionedMatch) return versionedMatch;
  }

  // 3. Direct exact match (e.g. 'AML.TA0000', 'TA0043')
  const direct = ALL_REGISTERED_TACTICS.find(t => t.id === normalized);
  if (direct) return direct;

  const directCi = ALL_REGISTERED_TACTICS.find(t => t.id.toLowerCase() === normalized.toLowerCase());
  if (directCi) return directCi;

  // 4. Any startsWith match
  const fallbackMatch = ALL_REGISTERED_TACTICS.find(t => t.id.startsWith(baseCode + ':'));
  if (fallbackMatch) return fallbackMatch;

  return undefined;
}
