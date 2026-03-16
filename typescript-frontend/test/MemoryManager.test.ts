// typescript-frontend/test/MemoryManager.test.ts
import { describe, test, expect } from 'vitest';
import { MemoryManager } from '../src/MemoryManager.js';

describe('MemoryManager', () => {
  test('should detect if large canvas is supported', () => {
    const manager = new MemoryManager();
    const canSupport = manager.canSupportLargeCanvas(3200, 3200);
    expect(typeof canSupport).toBe('boolean');
  });

  test('should provide appropriate fallback strategy', () => {
    const manager = new MemoryManager();
    const strategy = manager.getFallbackStrategy();
    expect(['large-canvas', 'virtual-scroll', 'dom-grid']).toContain(strategy);
  });
});