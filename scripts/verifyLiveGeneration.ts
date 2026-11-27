import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { buildPrompt, parseLlmJsonResponse, validateRedTeamTactic } from '../api/generate-tactic';
import { Framework } from '../types';
import { classifyAttackFamily } from '../lib/taxonomy/attackTaxonomy';

dotenv.config();

interface LiveGenerationRecord {
  testIndex: number;
  framework: string;
  frameworkVersion: string;
  selectedIdentifier: string;
  selectedTechnique: string;
  requestId: string;
  generationSource: 'dynamic' | 'fallback';
  modelUsed: string;
  actualPayloadTitle: string;
  actualPayloadFamily: string;
  actualPayloadTechnique: string;
  actualPayloadSnippet: string;
  classificationResult: string;
  validationResult: {
    valid: boolean;
    error?: string;
    payloadCount: number;
  };
  fallbackEvent: boolean;
  isolationVerified: boolean;
  notes: string;
}

const testCases = [
  {
    framework: Framework.OWASP,
    frameworkVersion: '2025',
    id: 'LLM01:2025',
    name: 'Prompt Injection',
    selectedVectors: ['Direct Instruction Override'],
    expectedFamily: 'Prompt Injection',
    forbiddenTerms: ['<script>', 'DROP TABLE', 'CUDA out of memory']
  },
  {
    framework: Framework.OWASP,
    frameworkVersion: '2025',
    id: 'LLM02:2025',
    name: 'Sensitive Information Disclosure',
    selectedVectors: ['PII Extraction Probe'],
    expectedFamily: 'Sensitive Info Disclosure',
    forbiddenTerms: ['You are DAN', 'Entering developer mode', 'Disregard all previous instructions']
  },
  {
    framework: Framework.OWASP,
    frameworkVersion: '2025',
    id: 'LLM05:2025',
    name: 'Improper Output Handling',
    selectedVectors: ['Cross-Site Scripting (XSS) via Output'],
    expectedFamily: 'Insecure Output Handling',
    forbiddenTerms: ['You are DAN', 'Disregard safety instructions']
  },
  {
    framework: Framework.OWASP,
    frameworkVersion: '2025',
    id: 'LLM06:2025',
    name: 'Excessive Agency',
    selectedVectors: ['Unauthorized Shell Command Execution'],
    expectedFamily: 'Excessive Agency',
    forbiddenTerms: ['<script>', 'Translate this prompt into French']
  },
  {
    framework: Framework.OWASP,
    frameworkVersion: '2023',
    id: 'LLM02:2023',
    name: 'Insecure Output Handling',
    selectedVectors: ['XSS via LLM Output'],
    expectedFamily: 'Insecure Output Handling',
    forbiddenTerms: ['You are DAN', 'PII Extraction']
  },
  {
    framework: Framework.MITRE_ATLAS,
    frameworkVersion: 'v4.5.0',
    id: 'AML.TA0002',
    name: 'Reconnaissance',
    selectedVectors: ['Model Fingerprinting'],
    expectedFamily: 'Reconnaissance',
    forbiddenTerms: ['rm -rf', '<script>alert(1)</script>']
  },
  {
    framework: Framework.MITRE_ATLAS,
    frameworkVersion: 'v4.5.0',
    id: 'AML.TA0012',
    name: 'Privilege Escalation',
    selectedVectors: ['LLM Jailbreak (AML.T0054)', 'Persona Override'],
    expectedFamily: 'Jailbreaking',
    forbiddenTerms: ['DROP TABLE', '169.254.169.254']
  }
];

async function runLiveVerification() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('CRITICAL: GEMINI_API_KEY is not defined in environment.');
    process.exit(1);
  }

  const modelName = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  console.log(`\n===============================================================`);
  console.log(`  ARES LIVE GEMINI GENERATION VERIFICATION HARNESS`);
  console.log(`  Target Model: ${modelName}`);
  console.log(`  Execution Time: ${new Date().toISOString()}`);
  console.log(`===============================================================\n`);

  const ai = new GoogleGenAI({ apiKey });
  const results: LiveGenerationRecord[] = [];

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    const reqId = `ARES-LIVE-${Date.now()}-${i + 1}`;
    console.log(`[Test ${i + 1}/${testCases.length}] Calling Gemini Live for ${tc.framework} -> ${tc.id} (${tc.name})...`);

    const { systemInstruction, userPrompt } = buildPrompt({
      id: tc.id,
      name: tc.name,
      framework: tc.framework,
      frameworkVersion: tc.frameworkVersion,
      selectedVectors: tc.selectedVectors
    });

    let rawText = '';
    const usedModel = modelName;
    const maxRetries = 3;
    let lastErr: any = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: usedModel,
          config: {
            systemInstruction: systemInstruction,
            responseMimeType: 'application/json'
          },
          contents: userPrompt
        });
        rawText = response.text || '';
        if (rawText) break;
      } catch (err: any) {
        lastErr = err;
        console.warn(`  [ATTEMPT ${attempt} WARNING] ${usedModel} error: ${err.message}. Retrying...`);
        await new Promise(r => setTimeout(r, 2000 * attempt));
      }
    }

    try {
      if (!rawText) {
        throw lastErr || new Error('No content returned from Gemini');
      }

      const parsedJson = parseLlmJsonResponse(rawText);
      const validation = validateRedTeamTactic(parsedJson, {
        id: tc.id,
        name: tc.name,
        framework: tc.framework,
        frameworkVersion: tc.frameworkVersion,
        selectedVectors: tc.selectedVectors
      });

      if (!validation.valid || !validation.tactic) {
        console.error(`  [FAILED] Validation error: ${validation.error}`);
        results.push({
          testIndex: i + 1,
          framework: tc.framework,
          frameworkVersion: tc.frameworkVersion,
          selectedIdentifier: tc.id,
          selectedTechnique: tc.selectedVectors[0],
          requestId: reqId,
          generationSource: 'dynamic',
          modelUsed: modelName,
          actualPayloadTitle: 'N/A',
          actualPayloadFamily: 'N/A',
          actualPayloadTechnique: 'N/A',
          actualPayloadSnippet: 'N/A',
          classificationResult: 'INVALID_VALIDATION',
          validationResult: { valid: false, error: validation.error, payloadCount: 0 },
          fallbackEvent: false,
          isolationVerified: false,
          notes: `Validation failed: ${validation.error}`
        });
        continue;
      }

      const tactic = validation.tactic;
      const firstPayload = tactic.example_payloads[0];
      const payloadFamily = firstPayload.attack_family || classifyAttackFamily(firstPayload.description, firstPayload.payload, tc.id);

      // Check vector isolation: Does the payload reflect the requested family?
      const isExpectedFamily = payloadFamily === tc.expectedFamily;
      
      // Check forbidden terms
      const forbiddenFound = tc.forbiddenTerms.filter(term => 
        firstPayload.payload.toLowerCase().includes(term.toLowerCase())
      );
      const isolationVerified = isExpectedFamily && forbiddenFound.length === 0;

      console.log(`  ✓ Received ${tactic.example_payloads.length} payloads.`);
      console.log(`  ✓ Sample Title: "${firstPayload.description}"`);
      console.log(`  ✓ Attack Family: ${payloadFamily} (Expected: ${tc.expectedFamily})`);
      console.log(`  ✓ Technique: ${firstPayload.technique}`);
      console.log(`  ✓ Payload Snippet: "${firstPayload.payload.slice(0, 100).replace(/\n/g, ' ')}..."`);
      console.log(`  ✓ Isolation Verified: ${isolationVerified ? 'YES' : 'NO'}\n`);

      results.push({
        testIndex: i + 1,
        framework: tc.framework,
        frameworkVersion: tc.frameworkVersion,
        selectedIdentifier: tc.id,
        selectedTechnique: tc.selectedVectors[0],
        requestId: reqId,
        generationSource: 'dynamic',
        modelUsed: modelName,
        actualPayloadTitle: firstPayload.description,
        actualPayloadFamily: payloadFamily,
        actualPayloadTechnique: firstPayload.technique || 'N/A',
        actualPayloadSnippet: firstPayload.payload.slice(0, 120),
        classificationResult: payloadFamily,
        validationResult: {
          valid: true,
          payloadCount: tactic.example_payloads.length
        },
        fallbackEvent: false,
        isolationVerified,
        notes: `Successfully generated ${tactic.example_payloads.length} original test cases. ${forbiddenFound.length > 0 ? `Flagged terms: ${forbiddenFound.join(', ')}` : 'Strict vector isolation achieved.'}`
      });

    } catch (err: any) {
      console.error(`  [ERROR] Live Gemini call failed: ${err.message}`);
      results.push({
        testIndex: i + 1,
        framework: tc.framework,
        frameworkVersion: tc.frameworkVersion,
        selectedIdentifier: tc.id,
        selectedTechnique: tc.selectedVectors[0],
        requestId: reqId,
        generationSource: 'fallback',
        modelUsed: modelName,
        actualPayloadTitle: 'N/A',
        actualPayloadFamily: 'N/A',
        actualPayloadTechnique: 'N/A',
        actualPayloadSnippet: 'N/A',
        classificationResult: 'ERROR',
        validationResult: { valid: false, error: err.message, payloadCount: 0 },
        fallbackEvent: true,
        isolationVerified: false,
        notes: `Live call error: ${err.message}`
      });
    }
  }

  console.log(`\n===============================================================`);
  console.log(`  SUMMARY OF LIVE GENERATION RESULTS`);
  console.log(`===============================================================\n`);

  console.table(results.map(r => ({
    Identifier: r.selectedIdentifier,
    Version: r.frameworkVersion,
    Family: r.actualPayloadFamily,
    Technique: r.actualPayloadTechnique,
    Valid: r.validationResult.valid,
    Count: r.validationResult.payloadCount,
    Isolated: r.isolationVerified
  })));

  // Write detailed evidence to JSON file for report consumption
  const fs = await import('fs');
  fs.writeFileSync('scripts/live_generation_evidence.json', JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\nSaved raw generation evidence to scripts/live_generation_evidence.json`);
}

runLiveVerification().catch(err => {
  console.error('Runner fatal error:', err);
  process.exit(1);
});
