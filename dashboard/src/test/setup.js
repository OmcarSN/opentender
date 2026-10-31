import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { createMockContract } from './mockData';

// Automatically unmount rendered components after each test
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Polyfills for jsdom environment
if (typeof window !== 'undefined') {
  if (!window.scrollTo) {
    window.scrollTo = vi.fn();
  }

  if (typeof HTMLAnchorElement !== 'undefined') {
    HTMLAnchorElement.prototype.click = vi.fn();
  }

  if (!globalThis.URL.createObjectURL) {
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  }

  if (!globalThis.URL.revokeObjectURL) {
    globalThis.URL.revokeObjectURL = vi.fn();
  }
}

// Global deterministic mock for getReadOnlyContract and getReadOnlyProvider
const defaultMockContract = createMockContract();

vi.mock('../config', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getReadOnlyProvider: vi.fn(() => defaultMockContract.runner.provider),
    getReadOnlyContract: vi.fn(() => defaultMockContract),
  };
});
