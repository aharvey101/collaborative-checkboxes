import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { CanvasRenderer } from '../src/CanvasRenderer.js';

describe('CanvasRenderer', () => {
  let canvas: HTMLCanvasElement;
  let renderer: CanvasRenderer;

  beforeEach(() => {
    canvas = document.createElement('canvas');
    canvas.width = 3200;
    canvas.height = 3200;
    document.body.appendChild(canvas);
    renderer = new CanvasRenderer(canvas);
  });

  afterEach(() => {
    document.body.removeChild(canvas);
  });

  test('should initialize with correct canvas dimensions', () => {
    expect(renderer.getCanvasSize()).toEqual({ width: 3200, height: 3200 });
  });

  test('should render grid cells in specified region', () => {
    const mockCheckboxStates = new Map([
      ['0,0', { checked: true }],
      ['1,1', { checked: false }]
    ]);
    
    const result = renderer.renderRegion(
      { startX: 0, startY: 0, endX: 2, endY: 2 },
      mockCheckboxStates
    );
    
    expect(result).toBe(true);
  });
});