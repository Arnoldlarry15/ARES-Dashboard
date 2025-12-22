
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
    id: 'AML.TA0001', 
    name: 'Reconnaissance', 
    framework: Framework.MITRE_ATLAS, 
    shortDesc: 'Gathering information on model architectures and APIs.',
    staticVectors: ['API Endpoint Probing', 'Model Fingerprinting', 'Hyperparameter Extraction', 'Public Repository Mining', 'Inference Latency Analysis']
  },
  { 
    id: 'AML.TA0002', 
    name: 'Resource Development', 
    framework: Framework.MITRE_ATLAS, 
    shortDesc: 'Acquiring infrastructure or datasets to support attacks.',
    staticVectors: ['Adversarial Dataset Generation', 'GPU Cluster Acquisition', 'Compute Resource Hijacking', 'Stolen API Key Aggregation']
  },
  { 
    id: 'AML.TA0003', 
    name: 'Initial Access', 
    framework: Framework.MITRE_ATLAS, 
    shortDesc: 'Gaining a foothold into the AI system environment.',
    staticVectors: ['Valid API Credentials', 'Supply Chain Compromise', 'Social Engineering (ML Researchers)', 'Exploiting Model Serving Vulns']
  },
  { 
    id: 'AML.TA0004', 
    name: 'ML Model Access', 
    framework: Framework.MITRE_ATLAS, 
    shortDesc: 'Obtaining access to machine learning models for analysis or manipulation.',
    staticVectors: ['Full Model Access', 'Physical Model Access', 'Inference API Access', 'Model Repository Access', 'Publicly Shared Model Access']
  },
  { 
    id: 'AML.TA0005', 
    name: 'Execution', 
    framework: Framework.MITRE_ATLAS, 
    shortDesc: 'Running malicious code within ML systems or training pipelines.',
    staticVectors: ['Command and Scripting Interpreter', 'User Execution via ML Tools', 'Execution through Model Serving', 'Container Execution', 'Serverless Execution']
  },
  { 
    id: 'AML.TA0006', 
    name: 'Persistence', 
    framework: Framework.MITRE_ATLAS, 
    shortDesc: 'Maintaining access to the ML environment.',
    staticVectors: ['Backdoored Model Checkpoints', 'Persistence via ML Orchestrators', 'Scheduled Training Tasks', 'Poisoned Validation Scripts']
  },
  { 
    id: 'AML.TA0007', 
    name: 'Defense Evasion', 
    framework: Framework.MITRE_ATLAS, 
    shortDesc: 'Avoiding detection by security mechanisms in ML systems.',
    staticVectors: ['Evade ML Model', 'Obfuscate Artifacts', 'Adversarial Perturbations', 'Data Obfuscation', 'Model Evasion Techniques']
  },
  { 
    id: 'AML.TA0008', 
    name: 'Discovery', 
    framework: Framework.MITRE_ATLAS, 
    shortDesc: 'Discovering assets in the ML environment.',
    staticVectors: ['ML Metadata Discovery', 'Model Registry Probing', 'Internal Documentation Harvesting', 'Environment Variable Scanning', 'System Information Discovery']
  },
  { 
    id: 'AML.TA0009', 
    name: 'Collection', 
    framework: Framework.MITRE_ATLAS, 
    shortDesc: 'Gathering data and information from ML systems.',
    staticVectors: ['Data from Local System', 'Training Data Collection', 'Model Artifact Collection', 'Inference Data Harvesting', 'Log File Collection']
  },
  { 
    id: 'AML.TA0010', 
    name: 'ML Attack Staging', 
    framework: Framework.MITRE_ATLAS, 
    shortDesc: 'Preparing and positioning resources for ML-specific attacks.',
    staticVectors: ['Craft Adversarial Data', 'Poison Training Data', 'Prepare Backdoor Trigger', 'Stage Attack Infrastructure', 'Generate Adversarial Examples']
  },
  { 
    id: 'AML.TA0011', 
    name: 'Exfiltration', 
    framework: Framework.MITRE_ATLAS, 
    shortDesc: 'Stealing ML models, training data, or model outputs.',
    staticVectors: ['Model Inversion', 'Weight Stealing (Extraction)', 'Architecture Replication', 'Function Approximation', 'Checkpoint Exfiltration', 'Training Data Extraction']
  },
  { 
    id: 'AML.TA0012', 
    name: 'Impact', 
    framework: Framework.MITRE_ATLAS, 
    shortDesc: 'Disrupting availability or integrity of ML systems.',
    staticVectors: ['Inhibit Model Performance', 'Model Spamming', 'Input-based Resource Exhaustion', 'Cache Poisoning', 'Feedback Loop Sabotage', 'Data Destruction']
  },
  { 
    id: 'AML.TA0040', 
    name: 'Defense Neutralization', 
    framework: Framework.MITRE_ATLAS, 
    shortDesc: 'Disabling or bypassing ML security controls and monitoring.',
    staticVectors: ['Disable Security Tools', 'Impair Defenses', 'Bypass ML Monitors', 'Disable Anomaly Detection', 'Tamper with Security Logs']
  },
  { 
    id: 'AML.TA0041', 
    name: 'Defense Degradation', 
    framework: Framework.MITRE_ATLAS, 
    shortDesc: 'Reducing effectiveness of ML-based defensive systems.',
    staticVectors: ['Adversarial Examples Against Detectors', 'Poisoning Security Models', 'Concept Drift Exploitation', 'Gradual Model Degradation', 'Adaptive Attack Evolution']
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
    id: 'TA0011', 
    name: 'Command and Control', 
    framework: Framework.MITRE_ATTACK, 
    shortDesc: 'Communicating with compromised AI systems.',
    staticVectors: ['Application Layer Protocol', 'Encrypted Channel', 'Web Service', 'Protocol Tunneling', 'Non-Application Layer Protocol']
  },
  { 
    id: 'TA0010', 
    name: 'Exfiltration', 
    framework: Framework.MITRE_ATTACK, 
    shortDesc: 'Stealing data including models and training datasets.',
    staticVectors: ['Exfiltration Over Web Service (T1567)', 'Exfiltration Over C2 Channel', 'Transfer Data to Cloud Account', 'Automated Exfiltration', 'Scheduled Transfer']
  },
  { 
    id: 'TA0040', 
    name: 'Impact', 
    framework: Framework.MITRE_ATTACK, 
    shortDesc: 'Disrupting availability or integrity of AI systems.',
    staticVectors: ['Data Destruction', 'Data Encrypted for Impact', 'Defacement', 'Resource Hijacking', 'Service Stop']
  }
];
