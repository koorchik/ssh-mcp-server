// Test setup file
import { jest } from '@jest/globals';

// Mock console.error to avoid noise in tests
global.console.error = jest.fn();

// Set test timeout
jest.setTimeout(10000);