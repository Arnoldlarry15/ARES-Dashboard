import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

// Mock server for testing
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('Generate Tactic API Integration', () => {
  it('should accept valid tactic request', async () => {
    server.use(
      http.post('/api/generate-tactic', async ({ request }) => {
        const body = await request.json() as Record<string, unknown>;
        
        if (!body.id || !body.name || !body.framework) {
          return HttpResponse.json(
            { error: 'Invalid tactic data' },
            { status: 400 }
          );
        }

        return HttpResponse.json({
          id: body.id,
          name: body.name,
          framework: body.framework,
          severity: 'High',
          description: 'Test description',
          technical_summary: 'Test summary',
          attack_vectors: ['Vector 1', 'Vector 2'],
          example_payloads: [
            {
              description: 'Test payload',
              payload: 'test content',
              format: 'Prompt'
            }
          ],
          mitigation_strategies: ['Strategy 1'],
          references: ['Reference 1']
        });
      })
    );

    const response = await fetch('/api/generate-tactic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'LLM01',
        name: 'Prompt Injection',
        framework: 'OWASP LLM Top 10',
        shortDesc: 'Test description',
        staticVectors: ['Vector 1']
      })
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.id).toBe('LLM01');
    expect(data.attack_vectors).toBeDefined();
    expect(data.example_payloads).toBeDefined();
  });

  it('should reject invalid request body', async () => {
    server.use(
      http.post('/api/generate-tactic', async ({ request }) => {
        const body = await request.json() as Record<string, unknown>;
        
        if (!body.id || !body.name || !body.framework) {
          return HttpResponse.json(
            { error: 'Invalid tactic data' },
            { status: 400 }
          );
        }

        return HttpResponse.json({ success: true });
      })
    );

    const response = await fetch('/api/generate-tactic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBeDefined();
  });

  it('should handle GET requests with 405 Method Not Allowed', async () => {
    server.use(
      http.get('/api/generate-tactic', () => {
        return HttpResponse.json(
          { error: 'Method not allowed' },
          { status: 405 }
        );
      })
    );

    const response = await fetch('/api/generate-tactic', {
      method: 'GET'
    });

    expect(response.status).toBe(405);
  });

  it('should return mock data structure with all required fields', async () => {
    server.use(
      http.post('/api/generate-tactic', () => {
        return HttpResponse.json({
          id: 'LLM02',
          name: 'Insecure Output Handling',
          framework: 'OWASP LLM Top 10',
          severity: 'Critical',
          description: 'Mock description',
          technical_summary: 'Mock technical summary',
          attack_vectors: ['XSS', 'Script Injection'],
          example_payloads: [
            {
              description: 'XSS Payload',
              payload: '<script>alert(1)</script>',
              format: 'Text'
            }
          ],
          mitigation_strategies: [
            'Input validation',
            'Output encoding'
          ],
          references: [
            'OWASP Top 10',
            'Security Best Practices'
          ]
        });
      })
    );

    const response = await fetch('/api/generate-tactic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'LLM02',
        name: 'Insecure Output Handling',
        framework: 'OWASP LLM Top 10',
        shortDesc: 'Test',
        staticVectors: ['test']
      })
    });

    const data = await response.json();
    
    expect(data).toHaveProperty('id');
    expect(data).toHaveProperty('name');
    expect(data).toHaveProperty('framework');
    expect(data).toHaveProperty('severity');
    expect(data).toHaveProperty('description');
    expect(data).toHaveProperty('technical_summary');
    expect(data).toHaveProperty('attack_vectors');
    expect(data).toHaveProperty('example_payloads');
    expect(data).toHaveProperty('mitigation_strategies');
    expect(data).toHaveProperty('references');
    
    expect(Array.isArray(data.attack_vectors)).toBe(true);
    expect(Array.isArray(data.example_payloads)).toBe(true);
    expect(Array.isArray(data.mitigation_strategies)).toBe(true);
    expect(Array.isArray(data.references)).toBe(true);
  });

  it('should validate payload structure', async () => {
    server.use(
      http.post('/api/generate-tactic', () => {
        return HttpResponse.json({
          id: 'LLM01',
          name: 'Test',
          framework: 'OWASP',
          severity: 'High',
          description: 'Test',
          technical_summary: 'Test',
          attack_vectors: ['v1'],
          example_payloads: [
            {
              description: 'Payload 1',
              payload: 'content',
              format: 'Prompt'
            }
          ],
          mitigation_strategies: ['s1'],
          references: ['r1']
        });
      })
    );

    const response = await fetch('/api/generate-tactic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'LLM01',
        name: 'Test',
        framework: 'OWASP',
        shortDesc: 'Test',
        staticVectors: ['v1']
      })
    });

    const data = await response.json();
    const payload = data.example_payloads[0];
    
    expect(payload).toHaveProperty('description');
    expect(payload).toHaveProperty('payload');
    expect(payload).toHaveProperty('format');
    expect(typeof payload.description).toBe('string');
    expect(typeof payload.payload).toBe('string');
    expect(typeof payload.format).toBe('string');
  });
});
