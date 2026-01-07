// Jest setup file
require('@testing-library/jest-dom')

// Mock Electron modules
jest.mock('electron', () => ({
  shell: {
    openExternal: jest.fn().mockResolvedValue(undefined),
  },
  app: {
    getPath: jest.fn().mockReturnValue('/mock/path'),
  },
}));

// Mock keytar
jest.mock('keytar', () => ({
  setPassword: jest.fn().mockResolvedValue(undefined),
  getPassword: jest.fn().mockResolvedValue('mock-password'),
  deletePassword: jest.fn().mockResolvedValue(true),
}));

// Mock electron-store
jest.mock('electron-store', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    clear: jest.fn(),
  }));
});

// Mock window.electronAPI
Object.defineProperty(window, 'electronAPI', {
  value: {
    system: {
      openExternal: jest.fn().mockResolvedValue(true),
    },
    search: {
      execute: jest.fn().mockResolvedValue({
        results: [],
        totalCount: 0,
        hasMore: false,
        searchTime: 100,
        platformStatus: {}
      }),
    },
  },
  writable: true,
});