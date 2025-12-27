# Developer Onboarding Guide

Welcome to the ARES Dashboard project! This guide will help you get started with development.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Development Setup](#development-setup)
3. [Project Structure](#project-structure)
4. [Development Workflow](#development-workflow)
5. [Testing](#testing)
6. [Code Style](#code-style)
7. [Git Workflow](#git-workflow)
8. [Common Tasks](#common-tasks)
9. [Troubleshooting](#troubleshooting)

## Quick Start

### Prerequisites

- **Node.js**: 20.x or higher
- **npm**: 9.x or higher
- **Git**: 2.x or higher
- **Code Editor**: VS Code recommended

### Initial Setup

```bash
# 1. Clone the repository
git clone https://github.com/Arnoldlarry15/ARES-Dashboard.git
cd ARES-Dashboard

# 2. Install dependencies
npm install

# 3. Start development server
npm run dev

# 4. Open browser
# Navigate to http://localhost:5173
```

That's it! You're ready to develop.

## Development Setup

### Recommended VS Code Extensions

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "ms-playwright.playwright",
    "vitest.explorer"
  ]
}
```

### Environment Variables

Create `.env.local` for local development:

```bash
# Optional: Google Gemini API for AI features
GEMINI_API_KEY=your_api_key_here

# Development mode
NODE_ENV=development
```

### Database Setup (Optional)

For local database development:

```bash
# Install PostgreSQL locally
# macOS
brew install postgresql

# Start PostgreSQL
brew services start postgresql

# Create database
createdb ares_dashboard

# Apply schema
psql -d ares_dashboard -f database/schema/postgresql.sql
```

## Project Structure

```
ARES-Dashboard/
├── api/                      # Backend API endpoints
│   ├── generate-tactic.ts   # AI payload generation
│   ├── middleware/          # API middleware
│   └── openapi.yaml         # API documentation
├── components/              # React components
│   ├── AuthLogin.tsx
│   ├── TeamManagement.tsx
│   └── PayloadEditor.tsx
├── services/                # Business logic
│   ├── authService.ts       # Authentication
│   ├── geminiService.ts     # AI integration
│   └── workspaceService.ts  # Team collaboration
├── utils/                   # Utility functions
│   ├── storage.ts           # LocalStorage
│   ├── campaigns.ts         # Campaign management
│   └── themeManager.ts      # Theme system
├── types/                   # TypeScript types
│   ├── auth.ts
│   └── workspace.ts
├── tests/                   # Test suites
│   ├── unit/
│   ├── integration/
│   ├── security/
│   └── e2e/
├── database/                # Database schemas
│   ├── schema/
│   └── migrations/
├── docs/                    # Documentation
├── App.tsx                  # Main component
├── index.tsx                # Entry point
└── constants.tsx            # Framework data
```

### Key Files

- **App.tsx**: Main application component
- **constants.tsx**: OWASP, MITRE framework definitions
- **types.ts**: Global TypeScript types
- **vercel.json**: Deployment configuration
- **vite.config.ts**: Build configuration
- **vitest.config.ts**: Test configuration
- **playwright.config.ts**: E2E test configuration

## Development Workflow

### 1. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
```

### 2. Make Changes

Edit code in your preferred editor. The dev server has Hot Module Replacement (HMR), so changes appear instantly.

### 3. Run Tests

```bash
# Unit tests
npm run test:unit

# All tests
npm test

# E2E tests
npm run test:e2e
```

### 4. Lint and Format

```bash
# Lint
npm run lint

# Type check
npm run typecheck
```

### 5. Commit Changes

```bash
git add .
git commit -m "feat: add new feature"
```

### 6. Push and Create PR

```bash
git push origin feature/your-feature-name
```

Then create a Pull Request on GitHub.

## Testing

### Running Tests

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests
npm run test:integration

# Security tests
npm run test:security

# E2E tests
npm run test:e2e

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

### Writing Tests

#### Unit Test Example

```typescript
// tests/unit/myService.test.ts
import { describe, it, expect } from 'vitest';
import { MyService } from '../../services/myService';

describe('MyService', () => {
  it('should do something', () => {
    const result = MyService.doSomething();
    expect(result).toBe('expected value');
  });
});
```

#### E2E Test Example

```typescript
// tests/e2e/feature.spec.ts
import { test, expect } from '@playwright/test';

test('should perform action', async ({ page }) => {
  await page.goto('/');
  await page.click('text=Button');
  await expect(page.locator('text=Result')).toBeVisible();
});
```

## Code Style

### TypeScript

- Use TypeScript for all new code
- Define types/interfaces for data structures
- Avoid `any` type when possible
- Use strict mode

```typescript
// Good
interface User {
  id: string;
  name: string;
  email: string;
}

function getUser(id: string): User {
  // ...
}

// Avoid
function getUser(id: any): any {
  // ...
}
```

### React

- Use functional components with hooks
- Prefer named exports
- Use descriptive component names
- Extract complex logic to custom hooks

```typescript
// Good
export function UserProfile({ userId }: { userId: string }) {
  const user = useUser(userId);
  return <div>{user.name}</div>;
}

// Avoid
export default ({ id }) => {
  const u = getData(id);
  return <div>{u.n}</div>;
}
```

### File Naming

- Components: PascalCase (e.g., `AuthLogin.tsx`)
- Services: camelCase (e.g., `authService.ts`)
- Types: camelCase (e.g., `auth.ts`)
- Tests: `*.test.ts` or `*.spec.ts`

### Comments

Add comments for:
- Complex logic
- Non-obvious decisions
- Public APIs
- TODO items

```typescript
// Calculate session expiry (24 hours from now)
const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

// TODO: Implement token refresh logic
```

## Git Workflow

### Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting, missing semicolons, etc.
- `refactor`: Code restructuring
- `test`: Adding tests
- `chore`: Maintenance

**Examples:**

```
feat(auth): add OAuth integration

Implement OAuth 2.0 authentication with Auth0, Azure AD, and Okta.

Closes #123
```

```
fix(api): handle rate limit errors

Add proper error handling for 429 responses.
```

### Branch Naming

- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation updates
- `refactor/` - Code refactoring
- `test/` - Test additions

Examples:
- `feature/oauth-integration`
- `fix/session-expiry`
- `docs/api-guide`

## Common Tasks

### Add a New Component

```bash
# Create component file
touch components/MyComponent.tsx

# Write component
cat > components/MyComponent.tsx << 'EOF'
import { useState } from 'react';

export function MyComponent() {
  const [state, setState] = useState('');
  
  return (
    <div>
      {/* Component JSX */}
    </div>
  );
}
EOF

# Add tests
touch tests/unit/components/MyComponent.test.tsx
```

### Add a New API Endpoint

```bash
# Create endpoint file
touch api/my-endpoint.ts

# Write endpoint
cat > api/my-endpoint.ts << 'EOF'
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  // Handle request
  res.json({ success: true });
}
EOF

# Add tests
touch tests/integration/my-endpoint.test.ts
```

### Add a New Service

```bash
# Create service file
touch services/myService.ts

# Write service
cat > services/myService.ts << 'EOF'
export class MyService {
  static async doSomething(): Promise<void> {
    // Implementation
  }
}
EOF

# Add tests
touch tests/unit/myService.test.ts
```

### Update Dependencies

```bash
# Check for updates
npm outdated

# Update all dependencies
npm update

# Update specific dependency
npm install package-name@latest

# Audit for vulnerabilities
npm audit

# Fix vulnerabilities
npm audit fix
```

## Troubleshooting

### Port Already in Use

```bash
# Kill process on port 5173
lsof -ti:5173 | xargs kill -9

# Or use different port
npm run dev -- --port 3000
```

### Module Not Found

```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Build Errors

```bash
# Clear Vite cache
rm -rf node_modules/.vite

# Rebuild
npm run build
```

### Test Failures

```bash
# Run tests in watch mode to debug
npm run test:watch

# Run specific test file
npm test tests/unit/myTest.test.ts

# Enable debug logging
DEBUG=* npm test
```

### TypeScript Errors

```bash
# Check types
npm run typecheck

# Regenerate type definitions
npm run build
```

## Getting Help

- **Documentation**: Check `/docs` folder
- **Issues**: Search [GitHub Issues](https://github.com/Arnoldlarry15/ARES-Dashboard/issues)
- **Discussions**: Join [GitHub Discussions](https://github.com/Arnoldlarry15/ARES-Dashboard/discussions)
- **Code Review**: Ask in your PR

## Next Steps

1. Read [CONTRIBUTING.md](../CONTRIBUTING.md)
2. Explore [ARCHITECTURE.md](../ARCHITECTURE.md)
3. Review [TESTING.md](../TESTING.md)
4. Check [ROADMAP.md](../ROADMAP.md)

## Resources

- [React Documentation](https://react.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Vite Guide](https://vitejs.dev/guide/)
- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)

---

**Happy Coding! 🚀**

If you have questions or need help, don't hesitate to ask in the discussions or open an issue.
