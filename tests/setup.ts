import '@testing-library/jest-dom';
import { vi, beforeEach } from 'vitest';

// Set up test environment variables
process.env.JWT_SECRET = 'test_jwt_secret_for_unit_tests_only';
process.env.JWT_REFRESH_SECRET = 'test_jwt_refresh_secret_for_unit_tests_only';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
});

// Mock crypto.randomUUID
if (!global.crypto) {
  Object.defineProperty(global, 'crypto', {
    value: {
      randomUUID: () => Math.random().toString(36).substring(2, 15),
    },
  });
}

// Mock console methods to suppress output during tests
// This prevents logger output from being treated as unhandled errors
const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info,
};

// Suppress console output during tests unless explicitly needed
global.console = {
  ...console,
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  // Keep debug for troubleshooting
  debug: console.debug,
};

// Reset mocks before each test
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});
