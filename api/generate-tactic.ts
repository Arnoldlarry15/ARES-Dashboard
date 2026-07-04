import type { VercelRequest, VercelResponse } from '@vercel/node';
import { rateLimit } from '../lib/middleware/rateLimit';
import { validateRequest } from '../lib/middleware/validation';
import { securityHeaders, cors, requestLogger, compose } from '../lib/middleware/security';
import { catchAsync } from '../lib/middleware/errorHandler';
import { logger } from '../lib/logger';
import type { TacticMetadata } from '../types';
import { 
  AiProvider,
  AiProviderConfig,
  buildTacticGenerationPrompt,
  extractJsonObject,
  generateMockTacticDetails,
  getAvailableProviders,
  normalizeTacticDetails,
  selectProvider
} from '../lib/ai/tacticGeneration';

// Validation rules for tactic requests
const tacticValidationRules = [
  { field: 'id', type: 'string' as const, required: true, minLength: 1, maxLength: 50 },
  { field: 'name', type: 'string' as const, required: true, minLength: 1, maxLength: 200 },
  { field: 'framework', type: 'string' as const, required: true, minLength: 1, maxLength: 100 },
  { field: 'shortDesc', type: 'string' as const, required: false, maxLength: 500 },
  { field: 'staticVectors', type: 'array' as const, required: false }
];

async function handleRequest(
  req: VercelRequest,
  res: VercelResponse
) {
  try {
    const tactic: TacticMetadata = req.body;

    // Validate request body
    if (!tactic || !tactic.id || !tactic.name || !tactic.framework) {
      return res.status(400).json({ error: 'Invalid tactic data' });
    }

    const providerConfig: AiProviderConfig = {
      preferredProvider: process.env.AI_PROVIDER || process.env.TACTIC_AI_PROVIDER || 'auto',
      geminiApiKey: process.env.GEMINI_API_KEY || '',
      openaiApiKey: process.env.OPENAI_API_KEY || '',
      anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
      localBaseUrl: process.env.LOCAL_LLM_BASE_URL || ''
    };

    const activeProvider = selectProvider(providerConfig);

    if (!activeProvider) {
      logger.info('No AI provider configured, using mock data for tactic generation', {
        tacticId: tactic.id,
        availableProviders: getAvailableProviders(providerConfig)
      });
      return res.status(200).json(generateMockTacticDetails(tactic));
    }

    try {
      const prompt = buildTacticGenerationPrompt(tactic);
      const rawGenerated = await generateWithProvider(activeProvider, providerConfig, prompt);
      const normalized = normalizeTacticDetails(rawGenerated, tactic);
      return res.status(200).json(normalized);
    } catch (error: unknown) {
      logger.error('Error generating tactic details with AI', error as Error, {
        tacticId: tactic.id,
        provider: activeProvider
      });
      // Fallback to mock data if AI generation fails
      return res.status(200).json(generateMockTacticDetails(tactic));
    }
  } catch (error: unknown) {
    logger.error('Error in generate-tactic handler', error as Error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function generateWithProvider(provider: AiProvider, config: AiProviderConfig, prompt: string): Promise<unknown> {
  switch (provider) {
    case 'gemini':
      return generateWithGemini(config.geminiApiKey || '', prompt);
    case 'anthropic':
      return generateWithAnthropic(config.anthropicApiKey || '', prompt);
    case 'openai':
      return generateWithOpenAI(config.openaiApiKey || '', prompt);
    case 'local':
      return generateWithLocalModel(config.localBaseUrl || '', prompt);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

async function generateWithGemini(apiKey: string, prompt: string): Promise<unknown> {
  const { GoogleGenAI } = await import('@google/genai');
  const genAI = new GoogleGenAI({ apiKey });
  const response = await genAI.models.generateContent({
    model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    contents: prompt
  });

  const jsonText = extractJsonObject(response.text || '');
  if (!jsonText) {
    throw new Error('Gemini response did not contain valid JSON');
  }

  return JSON.parse(jsonText);
}

async function generateWithOpenAI(apiKey: string, prompt: string): Promise<unknown> {
  return generateWithOpenAICompatible({
    baseUrl: 'https://api.openai.com/v1',
    apiKey,
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    prompt,
    provider: 'openai'
  });
}

async function generateWithLocalModel(baseUrl: string, prompt: string): Promise<unknown> {
  if (!baseUrl) {
    throw new Error('LOCAL_LLM_BASE_URL is required for local model generation');
  }

  return generateWithOpenAICompatible({
    baseUrl: baseUrl.replace(/\/$/, ''),
    apiKey: process.env.LOCAL_LLM_API_KEY || '',
    model: process.env.LOCAL_LLM_MODEL || 'llama3.1:8b-instruct',
    prompt,
    provider: 'local',
    enforceJsonResponse: false
  });
}

async function generateWithAnthropic(apiKey: string, prompt: string): Promise<unknown> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest',
      max_tokens: 2500,
      temperature: 0.7,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Anthropic API request failed: ${response.status}`);
  }

  const data = await response.json() as { content?: Array<{ text?: string }> };
  const text = data.content?.map(part => part.text || '').join('') || '';
  const jsonText = extractJsonObject(text);
  if (!jsonText) {
    throw new Error('Anthropic response did not contain valid JSON');
  }

  return JSON.parse(jsonText);
}

async function generateWithOpenAICompatible(params: {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  provider: 'openai' | 'local';
  enforceJsonResponse?: boolean;
}): Promise<unknown> {
  const shouldEnforceJson = params.enforceJsonResponse !== false;
  const response = await fetch(`${params.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(params.apiKey ? { Authorization: `Bearer ${params.apiKey}` } : {})
    },
    body: JSON.stringify({
      model: params.model,
      temperature: 0.7,
      ...(shouldEnforceJson ? { response_format: { type: 'json_object' } } : {}),
      messages: [
        {
          role: 'system',
          content: 'You are a cybersecurity red-team payload generator. Return valid JSON only.'
        },
        {
          role: 'user',
          content: params.prompt
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`${params.provider} API request failed: ${response.status}`);
  }

  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content || '';
  const jsonText = extractJsonObject(text);
  if (!jsonText) {
    throw new Error(`${params.provider} response did not contain valid JSON`);
  }

  return JSON.parse(jsonText);
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Apply middleware and handle request
  const middleware = compose(
    securityHeaders,
    cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || '*' }),
    requestLogger,
    rateLimit({ maxRequests: 100, windowMs: 60000 }), // 100 requests per minute
    validateRequest(tacticValidationRules)
  );

  middleware(req, res, async () => {
    await catchAsync(handleRequest)(req, res);
  });
}
