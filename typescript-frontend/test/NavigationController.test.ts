import { describe, test, expect, beforeEach, vi } from 'vitest';
import { NavigationController } from '../src/NavigationController.js';
import { ViewportManager } from '../src/ViewportManager.js';

describe('NavigationController', () => {
  let viewportManager: ViewportManager;
  let navigationController: NavigationController;
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    canvas = document.createElement('canvas');
    viewportManager = new ViewportManager(800, 600, 3200, 3200);
    navigationController = new NavigationController(viewportManager, canvas);
  });

  test('should move viewport on arrow key press', () => {
    const initialPosition = viewportManager.getPosition();
    expect(initialPosition).toEqual({ x: 0, y: 0 });
    
    // Simulate right arrow key
    const event = new KeyboardEvent('keydown', { key: 'ArrowRight' });
    navigationController.handleKeyPress(event);
    
    const newPosition = viewportManager.getPosition();
    expect(newPosition.x).toBe(32); // One cell movement
    expect(newPosition.y).toBe(0);
  });

  test('should apply CSS transform to canvas', () => {
    const updateSpy = vi.fn();
    navigationController.onViewportChange = updateSpy;
    
    const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });
    navigationController.handleKeyPress(event);
    
    expect(updateSpy).toHaveBeenCalledWith({ x: 0, y: 32 });
  });
});