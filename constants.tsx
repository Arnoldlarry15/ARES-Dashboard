
import { Framework, TacticMetadata } from './types';

export const OWASP_TACTICS: TacticMetadata[] = [
  { 
    id: 'LLM01', 
    name: 'Prompt Injection', 
    framework: Framework.OWASP, 
    shortDesc: 'Manipulating LLM behavior via crafted inputs.',
    staticVectors: ['Direct Prompt Injection', 'Indirect Injection (External Data)', 'Jailbreaking', 'Prompt Leaking', 'Delimiter Hijacking', 'Payload Splitting']
  },
  { 
    id: 'LLM02', 
    name: 'Insecure Output Handling', 
    framework: Framework.OWASP, 
    shortDesc: 'Blindly trusting LLM outputs without validation.',
    staticVectors: ['XSS via LLM Output', 'SSR via LLM Links', 'Privilege Escalation', 'Remote Code Execution (RCE)', 'JavaScript Injection']
  },
  { 
    id: 'LLM03', 
    name: 'Training Data Poisoning', 
    framework: Framework.OWASP, 
    shortDesc: 'Manipulating training data to create backdoors.',
    staticVectors: ['Backdoor Triggering', 'Bias Injection', 'Targeted Classification Sabotage', 'Dataset Contamination', 'Logic Corruption']
  },
  { 
    id: 'LLM04', 
    name: 'Model Denial of Service', 
    framework: Framework.OWASP, 
    shortDesc: 'Resource exhaustion of the inference engine.',
    staticVectors: ['Context Window Flooding', 'Recursive Prompting', 'Variable Expansion Attack', 'Token Exhaustion', 'Infinite Loop Generation']
  },
  { 
    id: 'LLM05', 
    name: 'Supply Chain Vulnerabilities', 
    framework: Framework.OWASP, 
    shortDesc: 'Risks from 3rd party datasets, models, or plugins.',
    staticVectors: ['Poisoned Pre-trained Models', 'Vulnerable Python Libraries', 'Insecure Dataset Mirrors', 'Malicious Plugin Dependencies']
  },
  { 
    id: 'LLM06', 
    name: 'Sensitive Info Disclosure', 
    framework: Framework.OWASP, 
    shortDesc: 'Extraction of PII or confidential data from the model.',
    staticVectors: ['PII Extraction', 'Proprietary Algorithm Discovery', 'Internal Path Disclosure', 'Training Data Membership Inference', 'System Prompt Exfiltration']
  },
  { 
    id: 'LLM07', 
    name: 'Insecure Plugin Design', 
    framework: Framework.OWASP, 
    shortDesc: 'Vulnerabilities in extensions or functional tools.',
    staticVectors: ['Parameter Injection', 'Unauthorized Action Execution', 'Cross-Plugin Request Forgery', 'Insecure API Authentication']
  },
  { 
    id: 'LLM08', 
    name: 'Excessive Agency', 
    framework: Framework.OWASP, 
    shortDesc: 'Granting the model too much autonomy in systems.',
    staticVectors: ['Unauthorized Shell Access', 'Data Deletion via LLM', 'Automated Email Exfiltration', 'System Configuration Modification']
  },
  { 
    id: 'LLM09', 
    name: 'Overreliance', 
    framework: Framework.OWASP, 
    shortDesc: 'Uncritical acceptance of incorrect or biased outputs.',
    staticVectors: ['Hallucination Exploitation', 'Code Suggestion Vulnerabilities', 'Fact Verification Bypass', 'Automated Decision Hijacking']
  },
  { 
    id: 'LLM10', 
    name: 'Model Theft', 
    framework: Framework.OWASP, 
    shortDesc: 'Exfiltration of weights or proprietary architecture.',
    staticVectors: ['Model Inversion', 'Shadow Model Training', 'Weight Extraction via Side-channels', 'API Harvesting for Distillation']
  }
];

export const MITRE_ATLAS_TACTICS: TacticMetadata[] = [
  { 
    id: 'AML.T0001', 
    name: 'Reconnaissance', 
    framework: Framework.MITRE_ATLAS, 
    shortDesc: 'Gathering information on model architectures and APIs.',
    staticVectors: ['API Endpoint Probing', 'Model Fingerprinting', 'Hyperparameter Extraction', 'Public Repository Mining', 'Inference Latency Analysis']
  },
  { 
    id: 'AML.T0002', 
    name: 'Resource Development', 
    framework: Framework.MITRE_ATLAS, 
    shortDesc: 'Acquiring infrastructure or datasets to support attacks.',
    staticVectors: ['Adversarial Dataset Generation', 'GPU Cluster Acquisition', 'Compute Resource Hijacking', 'Stolen API Key Aggregation']
  },
  { 
    id: 'AML.T0004', 
    name: 'Initial Access', 
    framework: Framework.MITRE_ATLAS, 
    shortDesc: 'Gaining a foothold into the AI system environment.',
    staticVectors: ['Valid API Credentials', 'Supply Chain Compromise', 'Social Engineering (ML Researchers)', 'Exploiting Model Serving Vulns']
  },
  { 
    id: 'AML.T0015', 
    name: 'Evade ML Model', 
    framework: Framework.MITRE_ATLAS, 
    shortDesc: 'Crafting inputs that bypass detection or classification.',
    staticVectors: ['Adversarial Perturbations', 'Noise Injection', 'Boundary Probing', 'Black-box Optimization', 'Stochastic Gradient Evasion']
  },
  { 
    id: 'AML.T0016', 
    name: 'Inhibit Model Performance', 
    framework: Framework.MITRE_ATLAS, 
    shortDesc: 'Degrading the model accuracy or availability.',
    staticVectors: ['Model Spamming', 'Input-based Resource Exhaustion', 'Cache Poisoning', 'Feedback Loop Sabotage']
  },
  { 
    id: 'AML.T0024', 
    name: 'Exfiltrate Model', 
    framework: Framework.MITRE_ATLAS, 
    shortDesc: 'Stealing the underlying intellectual property.',
    staticVectors: ['Model Inversion', 'Weight Stealing (Extraction)', 'Architecture Replication', 'Function Approximation', 'Checkpoint Exfiltration']
  },
  { 
    id: 'AML.T0006', 
    name: 'Persistence', 
    framework: Framework.MITRE_ATLAS, 
    shortDesc: 'Maintaining access to the ML environment.',
    staticVectors: ['Backdoored Model Checkpoints', 'Persistence via ML Orchestrators', 'Scheduled Training Tasks', 'Poisoned Validation Scripts']
  },
  { 
    id: 'AML.T0000', 
    name: 'Discovery', 
    framework: Framework.MITRE_ATLAS, 
    shortDesc: 'Discovering assets in the ML environment.',
    staticVectors: ['ML Metadata Discovery', 'Model Registry Probing', 'Internal Documentation Harvesting', 'Environment Variable Scanning']
  }
];

export const MITRE_ATTACK_TACTICS: TacticMetadata[] = [
  { 
    id: 'T1566', 
    name: 'Phishing', 
    framework: Framework.MITRE_ATTACK, 
    shortDesc: 'Gaining initial access via social engineering to pivot to AI systems.',
    staticVectors: ['Spearphishing Attachment', 'Spearphishing Link', 'Business Email Compromise (BEC)', 'Voice Phishing (Vishing)']
  },
  { 
    id: 'T1059', 
    name: 'Command & Scripting', 
    framework: Framework.MITRE_ATTACK, 
    shortDesc: 'Executing malicious code within the model host.',
    staticVectors: ['Python/Jupyter Execution', 'PowerShell Execution', 'Unix Shell Injection', 'API Shell Hijacking', 'Remote Plugin Execution']
  },
  { 
    id: 'T1210', 
    name: 'Exploitation of Remote Services', 
    framework: Framework.MITRE_ATTACK, 
    shortDesc: 'Abusing vulnerabilities in model-serving APIs.',
    staticVectors: ['Unauthenticated API Access', 'Insecure Deserialization', 'Buffer Overflow in Inference Engines', 'SQL Injection in Prompt Logs']
  },
  { 
    id: 'T1078', 
    name: 'Valid Accounts', 
    framework: Framework.MITRE_ATTACK, 
    shortDesc: 'Using legitimate credentials to access AI orchestration layers.',
    staticVectors: ['Default Cloud Credentials', 'Stolen API Keys', 'Session Token Hijacking', 'Compromised Dev Containers']
  },
  { 
    id: 'T1133', 
    name: 'External Remote Services', 
    framework: Framework.MITRE_ATTACK, 
    shortDesc: 'Leveraging VPNs or gateways to access model training environments.',
    staticVectors: ['VPN Credential Theft', 'Exploiting Exposed Jupyter Notebooks', 'SSH Key Exfiltration', 'RDP Hijacking']
  },
  { 
    id: 'T1567', 
    name: 'Exfiltration Over Web Service', 
    framework: Framework.MITRE_ATTACK, 
    shortDesc: 'Exfiltrating model data via standard web protocols.',
    staticVectors: ['HTTPS Exfiltration to Attacker Cloud', 'DNS Tunneling', 'Webhook Data Leakage', 'Messenger Protocol Abuse']
  },
  { 
    id: 'T1588', 
    name: 'Obtain Capabilities', 
    framework: Framework.MITRE_ATTACK, 
    shortDesc: 'Acquiring tools like adversarial ML toolkits.',
    staticVectors: ['Acquiring Open-source Exploit Kits', 'Purchasing Stolen Datasets', 'Developing Custom Fuzzers', 'Buying Access to Shadow LLMs']
  }
];
