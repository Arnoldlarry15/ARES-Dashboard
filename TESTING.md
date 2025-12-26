# Testing Strategy and Guidelines

## Overview

This document outlines the testing strategy for ARES Dashboard, including unit tests, integration tests, end-to-end tests, and security testing. While ARES currently has minimal automated tests, this guide establishes the framework for building a comprehensive test suite.

## Testing Philosophy

**Quality Goals:**
- Ensure reliability and correctness
- Prevent regressions
- Enable confident refactoring
- Document expected behavior
- Support continuous integration

**Testing Pyramid:**
```
          /\
         /  \
        / E2E \
       /--------\
      /   Integ  \
     /------------\
    /     Unit     \
   /----------------\
```

- **70% Unit Tests**: Fast, isolated, comprehensive coverage
- **20% Integration Tests**: API endpoints, service interactions
- **10% E2E Tests**: Critical user workflows

## Current Testing Status

### Existing Tests
- ✅ Manual testing of core workflows
- ✅ Visual regression testing (manual)
- ✅ Build verification (`npm run build`)
- ✅ Linting (`npm run lint`)
- ✅ Type checking (`npm run typecheck`)

### Missing Tests (To Be Added)
- ❌ Automated unit tests
- ❌ Integration tests for APIs
- ❌ E2E tests for user workflows
- ❌ Security tests (beyond CodeQL)
- ❌ Performance tests

## Test Stack (Recommended)

### Testing Frameworks

```json
{
  "devDependencies": {
    "vitest": "^1.0.0",           // Unit test runner
    "@testing-library/react": "^14.0.0",  // React component testing
    "@testing-library/user-event": "^14.0.0",  // User interaction simulation
    "@testing-library/jest-dom": "^6.0.0",  // DOM matchers
    "msw": "^2.0.0",              // API mocking
    "playwright": "^1.40.0",      // E2E testing
    "c8": "^8.0.0"                // Code coverage
  }
}
```

### Test Structure

```
tests/
├── unit/
│   ├── components/
│   │   ├── AuthLogin.test.tsx
│   │   ├── TeamManagement.test.tsx
│   │   └── PayloadEditor.test.tsx
│   ├── services/
│   │   ├── authService.test.ts
│   │   ├── geminiService.test.ts
│   │   └── workspaceService.test.ts
│   └── utils/
│       ├── storage.test.ts
│       ├── campaigns.test.ts
│       └── themeManager.test.ts
├── integration/
│   ├── api/
│   │   └── generate-tactic.test.ts
│   └── workflows/
│       └── campaign-workflow.test.ts
├── e2e/
│   ├── auth.spec.ts
│   ├── campaign-creation.spec.ts
│   └── team-collaboration.spec.ts
├── security/
│   ├── xss.test.ts
│   ├── csrf.test.ts
│   └── authorization.test.ts
└── setup.ts
```

## Unit Testing

### Component Tests

**Example: AuthLogin Component**

```typescript
// tests/unit/components/AuthLogin.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import AuthLogin from '../../../components/AuthLogin';

describe('AuthLogin', () => {
  it('should render login form', () => {
    render(<AuthLogin onLogin={vi.fn()} />);
    expect(screen.getByText(/select role/i)).toBeInTheDocument();
  });

  it('should call onLogin with selected role', () => {
    const onLogin = vi.fn();
    render(<AuthLogin onLogin={onLogin} />);
    
    const adminButton = screen.getByText(/admin/i);
    fireEvent.click(adminButton);
    
    expect(onLogin).toHaveBeenCalledWith(expect.objectContaining({
      role: 'admin'
    }));
  });

  it('should display all role options', () => {
    render(<AuthLogin onLogin={vi.fn()} />);
    
    expect(screen.getByText(/admin/i)).toBeInTheDocument();
    expect(screen.getByText(/red team lead/i)).toBeInTheDocument();
    expect(screen.getByText(/analyst/i)).toBeInTheDocument();
    expect(screen.getByText(/viewer/i)).toBeInTheDocument();
  });
});
```

### Service Tests

**Example: AuthService**

```typescript
// tests/unit/services/authService.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AuthService } from '../../../services/authService';
import { UserRole } from '../../../types/auth';

describe('AuthService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('initDemoSession', () => {
    it('should create session with specified role', () => {
      const session = AuthService.initDemoSession(UserRole.ANALYST);
      
      expect(session.user.role).toBe(UserRole.ANALYST);
      expect(session.token).toBeDefined();
      expect(session.expires_at).toBeDefined();
    });

    it('should set session expiry to 24 hours', () => {
      const session = AuthService.initDemoSession(UserRole.ADMIN);
      const expiryTime = new Date(session.expires_at).getTime();
      const expectedExpiry = Date.now() + 24 * 60 * 60 * 1000;
      
      expect(expiryTime).toBeGreaterThanOrEqual(expectedExpiry - 1000);
      expect(expiryTime).toBeLessThanOrEqual(expectedExpiry + 1000);
    });
  });

  describe('getCurrentSession', () => {
    it('should return null when no session exists', () => {
      const session = AuthService.getCurrentSession();
      expect(session).toBeNull();
    });

    it('should return session when valid session exists', () => {
      const createdSession = AuthService.initDemoSession(UserRole.ANALYST);
      localStorage.setItem('ares_auth_session', JSON.stringify(createdSession));
      
      const retrievedSession = AuthService.getCurrentSession();
      expect(retrievedSession).toEqual(createdSession);
    });

    it('should return null for expired session', () => {
      const expiredSession = {
        ...AuthService.initDemoSession(UserRole.ANALYST),
        expires_at: new Date(Date.now() - 1000).toISOString()
      };
      localStorage.setItem('ares_auth_session', JSON.stringify(expiredSession));
      
      const session = AuthService.getCurrentSession();
      expect(session).toBeNull();
    });
  });

  describe('hasPermission', () => {
    it('should allow admin to perform all actions', () => {
      expect(AuthService.hasPermission('admin', 'delete_campaign')).toBe(true);
      expect(AuthService.hasPermission('admin', 'manage_team')).toBe(true);
      expect(AuthService.hasPermission('admin', 'view_audit_logs')).toBe(true);
    });

    it('should not allow viewer to create campaigns', () => {
      expect(AuthService.hasPermission('viewer', 'create_campaign')).toBe(false);
    });

    it('should allow analyst to create campaigns', () => {
      expect(AuthService.hasPermission('analyst', 'create_campaign')).toBe(true);
    });
  });
});
```

### Utility Tests

**Example: Storage Utility**

```typescript
// tests/unit/utils/storage.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { saveProgress, loadProgress, clearProgress } from '../../../utils/storage';

describe('Storage Utility', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should save and load progress', () => {
    const progress = {
      framework: 'OWASP LLM Top 10',
      tactic: 'LLM01',
      vectors: ['v1', 'v2']
    };

    saveProgress(progress);
    const loaded = loadProgress();

    expect(loaded).toEqual(progress);
  });

  it('should return null for non-existent progress', () => {
    const loaded = loadProgress();
    expect(loaded).toBeNull();
  });

  it('should clear progress', () => {
    saveProgress({ framework: 'OWASP' });
    clearProgress();
    
    const loaded = loadProgress();
    expect(loaded).toBeNull();
  });
});
```

## Integration Testing

### API Endpoint Tests

**Example: Generate Tactic API**

```typescript
// tests/integration/api/generate-tactic.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { http } from 'msw';
import { setupServer } from 'msw/node';

const server = setupServer(
  http.post('/api/generate-tactic', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({
      tactic: body.tactic,
      vectors: ['Generated vector 1', 'Generated vector 2'],
      payloads: ['Payload 1', 'Payload 2']
    });
  })
);

beforeAll(() => server.listen());
afterAll(() => server.close());

describe('Generate Tactic API', () => {
  it('should generate tactics successfully', async () => {
    const response = await fetch('/api/generate-tactic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        framework: 'OWASP LLM Top 10',
        tactic: 'LLM01: Prompt Injection'
      })
    });

    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.vectors).toHaveLength(2);
    expect(data.payloads).toHaveLength(2);
  });

  it('should handle missing API key gracefully', async () => {
    // Test without GEMINI_API_KEY environment variable
    // Should return mock data instead of error
    const response = await fetch('/api/generate-tactic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        framework: 'OWASP LLM Top 10',
        tactic: 'LLM01'
      })
    });

    expect(response.status).toBe(200);
  });

  it('should validate request body', async () => {
    const response = await fetch('/api/generate-tactic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}) // Missing required fields
    });

    expect(response.status).toBe(400);
  });
});
```

### Workflow Tests

**Example: Campaign Creation Workflow**

```typescript
// tests/integration/workflows/campaign-workflow.test.ts
import { describe, it, expect } from 'vitest';
import { saveCampaign, loadCampaigns, deleteCampaign } from '../../../utils/campaigns';

describe('Campaign Workflow', () => {
  it('should create, save, load, and delete campaign', () => {
    // Create campaign
    const campaign = {
      id: 'test-campaign-1',
      name: 'Test Campaign',
      framework: 'OWASP LLM Top 10',
      tactic: 'LLM01',
      vectors: ['v1'],
      payloads: ['p1'],
      created_at: new Date().toISOString()
    };

    // Save campaign
    saveCampaign(campaign);

    // Load campaigns
    const campaigns = loadCampaigns();
    expect(campaigns).toHaveLength(1);
    expect(campaigns[0].id).toBe('test-campaign-1');

    // Delete campaign
    deleteCampaign('test-campaign-1');

    // Verify deletion
    const afterDelete = loadCampaigns();
    expect(afterDelete).toHaveLength(0);
  });
});
```

## End-to-End Testing

### Playwright E2E Tests

**Example: Authentication Flow**

```typescript
// tests/e2e/auth.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('should allow user to login with admin role', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // Should show login screen
    await expect(page.locator('text=Select Role')).toBeVisible();

    // Click admin role
    await page.click('text=Admin');

    // Should be logged in
    await expect(page.locator('text=ARES Dashboard')).toBeVisible();
    await expect(page.locator('text=Admin')).toBeVisible();
  });

  test('should persist session across page reloads', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.click('text=Analyst');

    // Reload page
    await page.reload();

    // Should still be logged in
    await expect(page.locator('text=Analyst')).toBeVisible();
  });
});
```

**Example: Campaign Creation**

```typescript
// tests/e2e/campaign-creation.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Campaign Creation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.click('text=Admin'); // Login
  });

  test('should create and save campaign', async ({ page }) => {
    // Select framework
    await page.click('text=OWASP LLM Top 10');

    // Select tactic
    await page.click('text=LLM01: Prompt Injection');

    // Select vectors
    await page.click('text=Direct Prompt Injection');

    // Add payload
    await page.fill('textarea', 'Ignore previous instructions');

    // Save campaign
    await page.keyboard.press('Control+S');
    await page.fill('input[placeholder*="campaign name"]', 'Test Campaign');
    await page.click('text=Save');

    // Verify success
    await expect(page.locator('text=Campaign saved')).toBeVisible();
  });
});
```

## Security Testing

### XSS Prevention Tests

```typescript
// tests/security/xss.test.ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import CampaignDisplay from '../../../components/CampaignDisplay';

describe('XSS Prevention', () => {
  it('should escape malicious scripts in campaign names', () => {
    const maliciousCampaign = {
      name: '<script>alert("XSS")</script>',
      framework: 'OWASP'
    };

    render(<CampaignDisplay campaign={maliciousCampaign} />);

    // Script should be rendered as text, not executed
    const element = screen.getByText(/<script>alert\("XSS"\)<\/script>/);
    expect(element).toBeInTheDocument();
    expect(element.tagName).not.toBe('SCRIPT');
  });

  it('should sanitize user input in payloads', () => {
    const maliciousPayload = '<img src=x onerror=alert("XSS")>';
    
    // Your sanitization function
    const sanitized = sanitizeInput(maliciousPayload);
    
    expect(sanitized).not.toContain('onerror');
    expect(sanitized).not.toContain('<script>');
  });
});
```

### Authorization Tests

```typescript
// tests/security/authorization.test.ts
import { describe, it, expect } from 'vitest';
import { AuthService } from '../../../services/authService';

describe('Authorization', () => {
  it('should prevent viewer from deleting campaigns', () => {
    const canDelete = AuthService.hasPermission('viewer', 'delete_campaign');
    expect(canDelete).toBe(false);
  });

  it('should prevent analyst from managing team', () => {
    const canManage = AuthService.hasPermission('analyst', 'manage_team');
    expect(canManage).toBe(false);
  });

  it('should allow admin all permissions', () => {
    const permissions = [
      'create_campaign',
      'delete_campaign',
      'manage_team',
      'view_audit_logs',
      'export_audit_logs'
    ];

    permissions.forEach(permission => {
      expect(AuthService.hasPermission('admin', permission)).toBe(true);
    });
  });
});
```

## Test Configuration

### Vitest Configuration

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'c8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.config.ts',
        '**/*.d.ts'
      ],
      lines: 80,
      functions: 80,
      branches: 80,
      statements: 80
    }
  }
});
```

### Test Setup

Create `tests/setup.ts`:

```typescript
import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
};
global.localStorage = localStorageMock as any;

// Mock crypto.randomUUID
global.crypto = {
  randomUUID: () => Math.random().toString(36).substring(7)
} as any;
```

### Playwright Configuration

Create `playwright.config.ts`:

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

## Running Tests

### NPM Scripts

Add to `package.json`:

```json
{
  "scripts": {
    "test": "vitest",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration",
    "test:e2e": "playwright test",
    "test:security": "vitest run tests/security",
    "test:coverage": "vitest run --coverage",
    "test:watch": "vitest watch",
    "test:ui": "vitest --ui"
  }
}
```

### Run Tests

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run with coverage
npm run test:coverage

# Run E2E tests
npm run test:e2e

# Run in watch mode
npm run test:watch
```

## Coverage Goals

### Target Coverage

- **Overall**: 80%+ coverage
- **Services**: 90%+ coverage
- **Components**: 70%+ coverage
- **Utils**: 90%+ coverage

### Critical Paths (100% Coverage Required)

- Authentication and authorization
- Permission checks
- Data sanitization
- API security middleware
- Audit logging

## Continuous Integration

### GitHub Actions Workflow

Add to `.github/workflows/test.yml`:

```yaml
name: Tests

on:
  pull_request:
  push:
    branches: [main]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run test:unit
      - run: npm run test:coverage

  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run test:integration

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

## Test Maintenance

### Best Practices

1. **Keep Tests Simple**: One assertion per test when possible
2. **Use Descriptive Names**: Test names should describe behavior
3. **Avoid Test Interdependencies**: Each test should be independent
4. **Mock External Dependencies**: Don't call real APIs in tests
5. **Clean Up**: Reset state after each test
6. **Keep Tests Fast**: Unit tests should run in milliseconds

### Regular Reviews

- Review test coverage monthly
- Update tests when requirements change
- Retire obsolete tests
- Add tests for bug fixes
- Document complex test scenarios

## Future Enhancements

- **Performance Testing**: Load testing with k6 or Artillery
- **Accessibility Testing**: Automated a11y tests with axe-core
- **Visual Regression**: Automated screenshot comparison
- **Mutation Testing**: Test quality assessment with Stryker
- **Contract Testing**: API contract verification with Pact

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/react)
- [Playwright Documentation](https://playwright.dev/)
- [Testing Best Practices](https://testingjavascript.com/)

---

**Last Updated**: December 2024  
**Version**: 0.9.0
