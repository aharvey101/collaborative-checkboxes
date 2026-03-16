// typescript-frontend/test/ViewportManager.test.ts
import { describe, test, expect } from 'vitest';
import { ViewportManager } from '../src/ViewportManager.js';

describe('ViewportManager', () => {
  test('should initialize with default position', () => {
    const manager = new ViewportManager(800, 600, 3200, 3200);
    const position = manager.getPosition();
    expect(position).toEqual({ x: 0, y: 0 });
  });

  test('should move viewport within bounds', () => {
    const manager = new ViewportManager(800, 600, 3200, 3200);
    manager.moveBy(100, 50);
    const position = manager.getPosition();
    expect(position).toEqual({ x: 100, y: 50 });
  });

  test('should clamp movement to stay within canvas bounds', () => {
    const manager = new ViewportManager(800, 600, 3200, 3200);
    manager.moveBy(3000, 3000); // Try to move beyond bounds
    const position = manager.getPosition();
    expect(position.x).toBeLessThanOrEqual(2400); // 3200 - 800
    expect(position.y).toBeLessThanOrEqual(2600); // 3200 - 600
  });
});