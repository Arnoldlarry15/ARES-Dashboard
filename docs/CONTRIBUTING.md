# Contributing to ARES Dashboard

Thank you for your interest in contributing to ARES Dashboard! This document provides guidelines for contributing to the project.

## Getting Started

### Prerequisites

- Node.js 20.x
- npm (comes with Node.js)
- Git
- (Optional) Vercel CLI for local API testing
- (Optional) Google Gemini API key for AI features

### Installation

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/ARES-Dashboard.git
   cd ARES-Dashboard
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables (optional)**
   ```bash
   cp .env.example .env.local
   # Add your GEMINI_API_KEY if testing AI features
   ```

### Running the Project

**For frontend development (no API key needed):**
```bash
npm run dev
```
Access at: `http://localhost:5173`

**For full-stack development (with API testing):**
```bash
npm install -g vercel
vercel dev
```
Access at: `http://localhost:3000`

**Useful commands:**
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
- `npm run typecheck` - Run TypeScript type checking

## Pull Request Process

### Before Submitting

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Keep changes focused and minimal
   - Follow existing code style and patterns
   - Add comments for complex logic

3. **Test your changes**
   ```bash
   npm run lint        # Check code style
   npm run typecheck   # Check TypeScript types
   npm run build       # Ensure build succeeds
   ```

4. **Commit with clear messages**
   ```bash
   git commit -m "Add feature: brief description"
   ```
   Follow conventional commit format when possible:
   - `feat:` new features
   - `fix:` bug fixes
   - `docs:` documentation changes
   - `style:` formatting, missing semicolons, etc.
   - `refactor:` code restructuring
   - `test:` adding tests
   - `chore:` maintenance tasks

### Submitting a Pull Request

1. **Push your branch**
   ```bash
   git push origin feature/your-feature-name
   ```

2. **Open a Pull Request**
   - Provide a clear title and description
   - Reference any related issues
   - Explain what changes were made and why
   - Include screenshots for UI changes

3. **Respond to feedback**
   - Address review comments promptly
   - Update your PR based on feedback
   - Request re-review when ready

## CI Expectations

All pull requests must pass the following automated checks:

### Required Checks

1. **Lint** - Code must pass ESLint rules
   ```bash
   npm run lint
   ```

2. **Type Check** - TypeScript must compile without errors
   ```bash
   npm run typecheck
   ```

3. **Build** - Project must build successfully
   ```bash
   npm run build
   ```

4. **CodeQL** - Security scanning must pass (automatic on PRs)

### CI Pipeline

Our GitHub Actions CI pipeline runs on:
- All pull requests
- Pushes to `main` branch

The pipeline:
- Uses Node.js 20.x
- Installs dependencies with `npm ci`
- Runs lint, typecheck, and build in sequence
- Must complete successfully before merge

**Note**: Fix any CI failures before requesting review. Check the Actions tab for detailed error logs.

## Code Style Guidelines

- **TypeScript**: Use strict typing, avoid `any` when possible
- **React**: Use functional components with hooks
- **Formatting**: Prettier configuration is included (`.prettierrc`)
- **Imports**: Group by external, internal, then relative imports
- **Comments**: Add JSDoc comments for exported functions/components
- **Naming**: 
  - Components: PascalCase (`AuthLogin.tsx`)
  - Functions/variables: camelCase (`generatePayload`)
  - Constants: UPPER_SNAKE_CASE (`API_BASE_URL`)

## What to Contribute

### Good First Issues

- Documentation improvements
- Bug fixes
- UI/UX enhancements
- Test coverage improvements
- Performance optimizations

### Feature Requests

Before implementing new features:
1. Open an issue to discuss the feature
2. Wait for maintainer feedback
3. Implement after approval

### Bug Reports

Include:
- Clear description of the issue
- Steps to reproduce
- Expected vs actual behavior
- Environment details (OS, browser, Node version)
- Screenshots/logs if applicable

## Security

- Never commit API keys or secrets
- Report security vulnerabilities privately (see README)
- Follow secure coding practices
- API keys must be stored in environment variables

## Questions?

- Open an issue for general questions
- Check existing documentation (README, DEPLOY, ARCHITECTURE)
- Review closed issues and PRs for similar topics

## License

By contributing, you agree that your contributions will be licensed under the MIT License (see LICENSE file).

---

**Thank you for contributing to ARES Dashboard!** 🚀
