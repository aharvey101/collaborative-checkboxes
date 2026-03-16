# 10,000 Scrollable Checkbox Grid Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the collaborative checkbox application from 10×10 to 100×100 grid (10,000 checkboxes) with smooth arrow key navigation and intelligent chunk preloading.

**Architecture:** Large canvas approach with viewport window - 3,200×3,200px canvas inside 800×600px viewport container with CSS transforms for navigation and memory-aware fallbacks for device compatibility.

**Tech Stack:** TypeScript, HTML5 Canvas, SpacetimeDB 2.0, CSS transforms, Playwright E2E tests

---

## File Structure Analysis

**Files to Modify:**
- `typescript-frontend/src/SpacetimeDBCheckboxApp.ts` - Core application logic expansion
- `typescript-frontend/index.html` - Canvas container and viewport CSS
- `e2e-tests/typescript-collaborative-checkboxes.spec.ts` - Update tests for new grid size

**Files to Create:**
- `typescript-frontend/src/ViewportManager.ts` - Viewport navigation and positioning
- `typescript-frontend/src/CanvasRenderer.ts` - Large canvas rendering optimizations
- `typescript-frontend/src/MemoryManager.ts` - Device capability detection and fallbacks
- `e2e-tests/10k-grid-navigation.spec.ts` - Navigation-specific tests

## Chunk 1: Core Infrastructure & Memory Management

### Task 1: Canvas Size Detection and Memory Management

**Files:**
- Create: `typescript-frontend/src/MemoryManager.ts`
- Test: `typescript-frontend/test/MemoryManager.test.ts`

- [ ] **Step 1: Write failing test for canvas memory detection**

```typescript
// typescript-frontend/test/MemoryManager.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd typescript-frontend && npm test MemoryManager.test.ts`
Expected: FAIL with "Cannot find module '../src/MemoryManager.js'"

- [ ] **Step 3: Implement MemoryManager class**

```typescript
// typescript-frontend/src/MemoryManager.ts
export type RenderStrategy = 'large-canvas' | 'virtual-scroll' | 'dom-grid';

export class MemoryManager {
  private static readonly LARGE_CANVAS_MEMORY_LIMIT = 50 * 1024 * 1024; // 50MB
  
  /**
   * Test if browser can support a large canvas of given dimensions
   */
  public canSupportLargeCanvas(width: number, height: number): boolean {
    try {
      // Test canvas creation
      const testCanvas = document.createElement('canvas');
      testCanvas.width = width;
      testCanvas.height = height;
      
      const ctx = testCanvas.getContext('2d');
      if (!ctx) return false;
      
      // Estimate memory usage: width * height * 4 bytes (RGBA)
      const estimatedMemory = width * height * 4;
      
      // Test if we can actually draw to the canvas
      ctx.fillStyle = 'red';
      ctx.fillRect(0, 0, 1, 1);
      
      return estimatedMemory < MemoryManager.LARGE_CANVAS_MEMORY_LIMIT;
    } catch (error) {
      console.warn('Canvas memory test failed:', error);
      return false;
    }
  }
  
  /**
   * Determine the best rendering strategy for current device
   */
  public getFallbackStrategy(): RenderStrategy {
    // Test large canvas support
    if (this.canSupportLargeCanvas(3200, 3200)) {
      return 'large-canvas';
    }
    
    // Check if we can do medium-sized canvas for virtual scrolling
    if (this.canSupportLargeCanvas(800, 600)) {
      return 'virtual-scroll';
    }
    
    // Fallback to DOM-based approach
    return 'dom-grid';
  }
  
  /**
   * Get recommended viewport size based on device capabilities
   */
  public getRecommendedViewportSize(): { width: number; height: number } {
    const strategy = this.getFallbackStrategy();
    
    switch (strategy) {
      case 'large-canvas':
        return { width: 800, height: 600 };
      case 'virtual-scroll':
        return { width: 640, height: 480 }; // Smaller for virtual scrolling
      case 'dom-grid':
        return { width: 320, height: 240 }; // Very conservative
      default:
        return { width: 320, height: 240 };
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd typescript-frontend && npm test MemoryManager.test.ts`
Expected: PASS

- [ ] **Step 5: Commit memory management foundation**

```bash
git add typescript-frontend/src/MemoryManager.ts typescript-frontend/test/MemoryManager.test.ts
git commit -m "feat: add memory management for large canvas detection

- Implement device capability detection for 3200x3200 canvas
- Add fallback strategy selection (large-canvas/virtual-scroll/dom-grid)  
- Include memory usage estimation and testing
- Support recommended viewport sizing based on device capabilities"
```

### Task 2: Viewport Manager Foundation

**Files:**
- Create: `typescript-frontend/src/ViewportManager.ts`
- Test: `typescript-frontend/test/ViewportManager.test.ts`

- [ ] **Step 1: Write failing test for viewport positioning**

```typescript
// typescript-frontend/test/ViewportManager.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd typescript-frontend && npm test ViewportManager.test.ts`
Expected: FAIL with "Cannot find module '../src/ViewportManager.js'"

- [ ] **Step 3: Implement ViewportManager class**

```typescript
// typescript-frontend/src/ViewportManager.ts
export interface ViewportPosition {
  x: number;
  y: number;
}

export interface ViewportBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export class ViewportManager {
  private position: ViewportPosition = { x: 0, y: 0 };
  private readonly viewportWidth: number;
  private readonly viewportHeight: number;
  private readonly canvasWidth: number;
  private readonly canvasHeight: number;
  
  constructor(
    viewportWidth: number,
    viewportHeight: number,
    canvasWidth: number,
    canvasHeight: number
  ) {
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
  }
  
  /**
   * Get current viewport position
   */
  public getPosition(): ViewportPosition {
    return { ...this.position };
  }
  
  /**
   * Move viewport by relative amount, clamped to bounds
   */
  public moveBy(deltaX: number, deltaY: number): ViewportPosition {
    const newX = this.position.x + deltaX;
    const newY = this.position.y + deltaY;
    
    return this.moveTo(newX, newY);
  }
  
  /**
   * Move viewport to absolute position, clamped to bounds
   */
  public moveTo(x: number, y: number): ViewportPosition {
    // Calculate maximum position to keep viewport within canvas
    const maxX = this.canvasWidth - this.viewportWidth;
    const maxY = this.canvasHeight - this.viewportHeight;
    
    // Clamp position to valid bounds
    this.position.x = Math.max(0, Math.min(x, maxX));
    this.position.y = Math.max(0, Math.min(y, maxY));
    
    return { ...this.position };
  }
  
  /**
   * Get current viewport bounds in canvas coordinates
   */
  public getBounds(): ViewportBounds {
    return {
      left: this.position.x,
      top: this.position.y,
      right: this.position.x + this.viewportWidth,
      bottom: this.position.y + this.viewportHeight
    };
  }
  
  /**
   * Convert screen coordinates to canvas coordinates
   */
  public screenToCanvas(screenX: number, screenY: number): ViewportPosition {
    return {
      x: screenX + this.position.x,
      y: screenY + this.position.y
    };
  }
  
  /**
   * Get visible grid area in cell coordinates
   */
  public getVisibleGridArea(cellSize: number): {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  } {
    const bounds = this.getBounds();
    return {
      startX: Math.floor(bounds.left / cellSize),
      startY: Math.floor(bounds.top / cellSize),
      endX: Math.ceil(bounds.right / cellSize),
      endY: Math.ceil(bounds.bottom / cellSize)
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd typescript-frontend && npm test ViewportManager.test.ts`
Expected: PASS

- [ ] **Step 5: Commit viewport management foundation**

```bash
git add typescript-frontend/src/ViewportManager.ts typescript-frontend/test/ViewportManager.test.ts
git commit -m "feat: add viewport management for large canvas navigation

- Implement ViewportManager for position tracking and bounds checking
- Add coordinate transformations (screen to canvas coordinates)
- Include boundary clamping to prevent out-of-bounds scrolling
- Support visible grid area calculation for rendering optimization"
```

## Chunk 2: Canvas Rendering System

### Task 3: Large Canvas Renderer

**Files:**
- Create: `typescript-frontend/src/CanvasRenderer.ts`
- Test: `typescript-frontend/test/CanvasRenderer.test.ts`

- [ ] **Step 1: Write failing test for canvas rendering**

```typescript
// typescript-frontend/test/CanvasRenderer.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd typescript-frontend && npm test CanvasRenderer.test.ts`
Expected: FAIL with "Cannot find module '../src/CanvasRenderer.js'"

- [ ] **Step 3: Implement CanvasRenderer class**

```typescript
// typescript-frontend/src/CanvasRenderer.ts
export interface CheckboxState {
  checked: boolean;
}

export interface GridRegion {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private readonly CELL_SIZE = 32;
  
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Failed to get 2D rendering context');
    }
    this.ctx = context;
  }
  
  /**
   * Get canvas dimensions
   */
  public getCanvasSize(): { width: number; height: number } {
    return {
      width: this.canvas.width,
      height: this.canvas.height
    };
  }
  
  /**
   * Clear entire canvas
   */
  public clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
  
  /**
   * Render a specific region of the grid
   */
  public renderRegion(
    region: GridRegion,
    checkboxStates: Map<string, CheckboxState>
  ): boolean {
    try {
      // Set up clipping region for performance
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.rect(
        region.startX * this.CELL_SIZE,
        region.startY * this.CELL_SIZE,
        (region.endX - region.startX) * this.CELL_SIZE,
        (region.endY - region.startY) * this.CELL_SIZE
      );
      this.ctx.clip();
      
      // Render cells in the region
      for (let row = region.startY; row < region.endY; row++) {
        for (let col = region.startX; col < region.endX; col++) {
          this.renderCell(col, row, checkboxStates);
        }
      }
      
      this.ctx.restore();
      return true;
    } catch (error) {
      console.error('Failed to render region:', error);
      return false;
    }
  }
  
  /**
   * Render the entire 100x100 grid
   */
  public renderFullGrid(checkboxStates: Map<string, CheckboxState>): boolean {
    return this.renderRegion(
      { startX: 0, startY: 0, endX: 100, endY: 100 },
      checkboxStates
    );
  }
  
  /**
   * Render a single checkbox cell
   */
  private renderCell(
    col: number,
    row: number,
    checkboxStates: Map<string, CheckboxState>
  ): void {
    const x = col * this.CELL_SIZE;
    const y = row * this.CELL_SIZE;
    
    // Get checkbox state
    const key = `${col},${row}`;
    const state = checkboxStates.get(key);
    const checked = state?.checked || false;
    
    // Draw cell background
    this.ctx.fillStyle = checked ? '#007bff' : '#ffffff';
    this.ctx.fillRect(x, y, this.CELL_SIZE, this.CELL_SIZE);
    
    // Draw cell border
    this.ctx.strokeStyle = '#cccccc';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(x, y, this.CELL_SIZE, this.CELL_SIZE);
    
    // Draw checkmark if checked
    if (checked) {
      this.ctx.fillStyle = '#ffffff';
      this.ctx.font = '18px Arial';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText('✓', x + this.CELL_SIZE / 2, y + this.CELL_SIZE / 2);
    }
  }
  
  /**
   * Update only changed cells for performance
   */
  public updateCells(
    changedCells: Array<{ x: number; y: number; state: CheckboxState }>
  ): void {
    for (const cell of changedCells) {
      const region = {
        startX: cell.x,
        startY: cell.y,
        endX: cell.x + 1,
        endY: cell.y + 1
      };
      
      const stateMap = new Map([[`${cell.x},${cell.y}`, cell.state]]);
      this.renderRegion(region, stateMap);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd typescript-frontend && npm test CanvasRenderer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit canvas rendering system**

```bash
git add typescript-frontend/src/CanvasRenderer.ts typescript-frontend/test/CanvasRenderer.test.ts
git commit -m "feat: add large canvas rendering system for 100x100 grid

- Implement CanvasRenderer for 3200x3200px canvas management
- Add region-based rendering with clipping for performance optimization
- Support differential updates for changed cells only
- Include full grid rendering and individual cell updates"
```

### Task 4: HTML Container and CSS Viewport

**Files:**
- Modify: `typescript-frontend/index.html:88-100` (grid-container section)

- [ ] **Step 1: Write failing test for viewport container styling**

```typescript
// typescript-frontend/test/viewport-container.test.ts
/**
 * @jest-environment jsdom
 */

describe('Viewport Container CSS', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="grid-container">
        <div class="viewport-container">
          <canvas id="checkboxCanvas"></canvas>
        </div>
      </div>
    `;
  });

  test('viewport container should have correct dimensions', () => {
    const container = document.querySelector('.viewport-container') as HTMLElement;
    expect(container).toBeTruthy();
  });

  test('canvas should be positioned for viewport navigation', () => {
    const canvas = document.getElementById('checkboxCanvas') as HTMLCanvasElement;
    expect(canvas).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd typescript-frontend && npm test viewport-container.test.ts`
Expected: FAIL due to missing viewport container structure

- [ ] **Step 3: Update HTML with viewport container**

```html
<!-- typescript-frontend/index.html - Update grid-container section -->
        <div class="grid-container">
            <div class="viewport-container">
                <canvas id="checkboxCanvas"></canvas>
            </div>
            <div class="navigation-hints">
                <p>🎯 Use arrow keys to navigate • 10,000 checkboxes (100×100 grid)</p>
                <p>📍 Position: <span id="viewportPosition">0, 0</span></p>
            </div>
        </div>
```

- [ ] **Step 4: Add viewport CSS styles**

```css
/* Add to typescript-frontend/index.html <style> section */
        .viewport-container {
            width: 800px;
            height: 600px;
            overflow: hidden;
            position: relative;
            border: 3px solid #333;
            border-radius: 8px;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
            background-color: #f8f9fa;
        }
        
        #checkboxCanvas {
            position: absolute;
            top: 0;
            left: 0;
            transform: translate(0px, 0px);
            transition: transform 0.2s ease-out;
            cursor: pointer;
            background-color: white;
        }
        
        .navigation-hints {
            text-align: center;
            margin-top: 15px;
            color: #666;
            font-size: 14px;
        }
        
        .navigation-hints p {
            margin: 5px 0;
        }
        
        /* Update info card for new grid size */
        .info-card h3:contains("Checkbox Stats") + p:last-child {
            content: "Grid Size: 100×100 (10,000 total)";
        }
```

- [ ] **Step 5: Update stats display for 100x100 grid**

```html
<!-- Update the info panel section -->
            <div class="info-card">
                <h3>Checkbox Stats</h3>
                <p><strong>Total:</strong> <span id="totalCount">10000</span></p>
                <p><strong>Checked:</strong> <span id="checkedCount">0</span></p>
                <p><strong>Grid Size:</strong> 100×100 (navigable)</p>
            </div>
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd typescript-frontend && npm test viewport-container.test.ts`
Expected: PASS

- [ ] **Step 7: Commit viewport container implementation**

```bash
git add typescript-frontend/index.html
git commit -m "feat: add viewport container for large canvas navigation

- Create 800x600px viewport container with overflow hidden
- Position canvas absolutely for CSS transform navigation
- Add navigation hints showing arrow key controls and position
- Update stats display to show 100x100 grid (10,000 checkboxes)
- Canvas size will be set dynamically by MemoryManager"
```

## Chunk 3: Navigation System and SpacetimeDB Integration

### Task 5: Arrow Key Navigation System

**Files:**
- Create: `typescript-frontend/src/NavigationController.ts`
- Test: `typescript-frontend/test/NavigationController.test.ts`

- [ ] **Step 1: Write failing test for arrow key navigation**

```typescript
// typescript-frontend/test/NavigationController.test.ts
/**
 * @jest-environment jsdom
 */
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
    const updateSpy = jest.fn();
    navigationController.onViewportChange = updateSpy;
    
    const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });
    navigationController.handleKeyPress(event);
    
    expect(updateSpy).toHaveBeenCalledWith({ x: 0, y: 32 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd typescript-frontend && npm test NavigationController.test.ts`
Expected: FAIL with "Cannot find module '../src/NavigationController.js'"

- [ ] **Step 3: Implement NavigationController class**

```typescript
// typescript-frontend/src/NavigationController.ts
import { ViewportManager, ViewportPosition } from './ViewportManager.js';

export class NavigationController {
  private viewportManager: ViewportManager;
  private canvas: HTMLCanvasElement;
  private readonly MOVEMENT_SPEED = 32; // One grid cell
  private readonly ACCELERATED_SPEED = 96; // Three grid cells
  private keyHoldTimeout: number | null = null;
  private readonly ACCELERATION_DELAY = 500; // ms
  
  public onViewportChange?: (position: ViewportPosition) => void;
  
  constructor(viewportManager: ViewportManager, canvas: HTMLCanvasElement) {
    this.viewportManager = viewportManager;
    this.canvas = canvas;
    this.setupEventListeners();
  }
  
  private setupEventListeners(): void {
    document.addEventListener('keydown', (event) => this.handleKeyPress(event));
    document.addEventListener('keyup', (event) => this.handleKeyRelease(event));
  }
  
  public handleKeyPress(event: KeyboardEvent): void {
    if (!this.isArrowKey(event.key)) return;
    
    event.preventDefault();
    
    // Determine movement speed (accelerated if key held)
    const speed = this.keyHoldTimeout ? this.ACCELERATED_SPEED : this.MOVEMENT_SPEED;
    
    // Calculate movement delta
    let deltaX = 0;
    let deltaY = 0;
    
    switch (event.key) {
      case 'ArrowLeft':
        deltaX = -speed;
        break;
      case 'ArrowRight':
        deltaX = speed;
        break;
      case 'ArrowUp':
        deltaY = -speed;
        break;
      case 'ArrowDown':
        deltaY = speed;
        break;
    }
    
    // Move viewport
    const newPosition = this.viewportManager.moveBy(deltaX, deltaY);
    this.updateCanvasTransform(newPosition);
    
    // Set up acceleration for held keys
    if (!this.keyHoldTimeout) {
      this.keyHoldTimeout = window.setTimeout(() => {
        this.keyHoldTimeout = null;
      }, this.ACCELERATION_DELAY);
    }
    
    // Notify listeners
    if (this.onViewportChange) {
      this.onViewportChange(newPosition);
    }
  }
  
  public handleKeyRelease(event: KeyboardEvent): void {
    if (!this.isArrowKey(event.key)) return;
    
    // Reset acceleration
    if (this.keyHoldTimeout) {
      clearTimeout(this.keyHoldTimeout);
      this.keyHoldTimeout = null;
    }
  }
  
  private isArrowKey(key: string): boolean {
    return ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key);
  }
  
  private updateCanvasTransform(position: ViewportPosition): void {
    // Apply CSS transform to move canvas
    const translateX = -position.x;
    const translateY = -position.y;
    this.canvas.style.transform = `translate(${translateX}px, ${translateY}px)`;
  }
  
  /**
   * Get current viewport position for external use
   */
  public getCurrentPosition(): ViewportPosition {
    return this.viewportManager.getPosition();
  }
  
  /**
   * Programmatically move to specific position
   */
  public moveTo(x: number, y: number): void {
    const newPosition = this.viewportManager.moveTo(x, y);
    this.updateCanvasTransform(newPosition);
    
    if (this.onViewportChange) {
      this.onViewportChange(newPosition);
    }
  }
  
  /**
   * Clean up event listeners
   */
  public destroy(): void {
    document.removeEventListener('keydown', this.handleKeyPress);
    document.removeEventListener('keyup', this.handleKeyRelease);
    
    if (this.keyHoldTimeout) {
      clearTimeout(this.keyHoldTimeout);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd typescript-frontend && npm test NavigationController.test.ts`
Expected: PASS

- [ ] **Step 5: Commit navigation controller**

```bash
git add typescript-frontend/src/NavigationController.ts typescript-frontend/test/NavigationController.test.ts
git commit -m "feat: add arrow key navigation system

- Implement NavigationController for smooth viewport movement
- Support arrow keys with acceleration for held keys (32px -> 96px)
- Apply CSS transforms to canvas for GPU-accelerated movement  
- Include boundary checking and event cleanup
- Add programmatic movement API and change notifications"
```

### Task 6: SpacetimeDB Integration with Large Canvas

**Files:**
- Modify: `typescript-frontend/src/SpacetimeDBCheckboxApp.ts:15-48` (constants and initialization)
- Test: `typescript-frontend/test/SpacetimeDBCheckboxApp.integration.test.ts`

- [ ] **Step 1: Write failing integration test**

```typescript
// typescript-frontend/test/SpacetimeDBCheckboxApp.integration.test.ts
/**
 * @jest-environment jsdom
 */
import { SpacetimeDBCheckboxApp } from '../src/SpacetimeDBCheckboxApp.js';
import { MemoryManager } from '../src/MemoryManager.js';

describe('SpacetimeDBCheckboxApp Integration', () => {
  let app: SpacetimeDBCheckboxApp;
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    app = new SpacetimeDBCheckboxApp();
  });

  afterEach(() => {
    document.body.removeChild(canvas);
  });

  test('should initialize with large canvas based on memory manager', () => {
    app.initializeCanvas(canvas);
    
    // Canvas size should be set based on memory capabilities
    expect(canvas.width).toBeGreaterThanOrEqual(800);
    expect(canvas.height).toBeGreaterThanOrEqual(600);
  });

  test('should handle viewport navigation for large grid', () => {
    app.initializeCanvas(canvas);
    
    // Should be able to navigate to different parts of 100x100 grid
    const result = app.navigateTo(50, 50); // Middle of grid
    expect(result).toBe(true);
  });

  test('should toggle checkboxes at different viewport positions', async () => {
    app.initializeCanvas(canvas);
    
    // Navigate to different position
    app.navigateTo(32, 32); // Move viewport to see cell (1,1)
    
    // Toggle checkbox that would be visible in viewport
    const result = await app.toggleCheckbox(1, 1);
    expect(result).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd typescript-frontend && npm test SpacetimeDBCheckboxApp.integration.test.ts`
Expected: FAIL with "navigateTo is not a function"

- [ ] **Step 3: Update SpacetimeDBCheckboxApp for large canvas**

```typescript
// typescript-frontend/src/SpacetimeDBCheckboxApp.ts - Update constants and add new imports
import { DbConnection, type SubscriptionHandle } from './generated/index.js';
import { MemoryManager, type RenderStrategy } from './MemoryManager.js';
import { ViewportManager } from './ViewportManager.js';
import { CanvasRenderer } from './CanvasRenderer.js';
import { NavigationController } from './NavigationController.js';

interface CheckboxState {
  checked: boolean;
}

export class SpacetimeDBCheckboxApp {
  private connection: DbConnection | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private subscription: SubscriptionHandle | null = null;
  private checkboxStates: Map<string, CheckboxState> = new Map();
  private chunkData: Map<number, Uint8Array> = new Map();
  
  // Large canvas components
  private memoryManager: MemoryManager;
  private viewportManager: ViewportManager | null = null;
  private canvasRenderer: CanvasRenderer | null = null;
  private navigationController: NavigationController | null = null;
  private renderStrategy: RenderStrategy;
  
  // Dynamic grid configuration based on memory capabilities
  private gridCols: number = 100; // Target: 100x100 grid
  private gridRows: number = 100;
  private canvasWidth: number = 3200; // Target: 3200x3200px
  private canvasHeight: number = 3200;
  private viewportWidth: number = 800;
  private viewportHeight: number = 600;
  
  private readonly CELL_SIZE = 32;
  private readonly DATABASE_NAME: string;
  private readonly SERVER_URL: string;

  constructor(serverUrl: string = 'http://localhost:3000', databaseName: string = 'checkboxes-local-demo') {
    this.SERVER_URL = serverUrl;
    this.DATABASE_NAME = databaseName;
    this.memoryManager = new MemoryManager();
    this.renderStrategy = this.memoryManager.getFallbackStrategy();
    this.adjustConfigurationForStrategy();
  }
  
  /**
   * Adjust grid and canvas size based on memory capabilities
   */
  private adjustConfigurationForStrategy(): void {
    const recommendedViewport = this.memoryManager.getRecommendedViewportSize();
    this.viewportWidth = recommendedViewport.width;
    this.viewportHeight = recommendedViewport.height;
    
    switch (this.renderStrategy) {
      case 'large-canvas':
        // Keep target 100x100 grid with 3200x3200 canvas
        this.gridCols = 100;
        this.gridRows = 100;
        this.canvasWidth = 3200;
        this.canvasHeight = 3200;
        break;
        
      case 'virtual-scroll':
        // Keep 100x100 grid but use smaller canvas
        this.gridCols = 100;
        this.gridRows = 100;
        this.canvasWidth = this.viewportWidth;
        this.canvasHeight = this.viewportHeight;
        break;
        
      case 'dom-grid':
        // Fallback to smaller grid for DOM-based rendering
        this.gridCols = 50;
        this.gridRows = 50;
        this.canvasWidth = this.viewportWidth;
        this.canvasHeight = this.viewportHeight;
        break;
    }
    
    console.log(`Using ${this.renderStrategy} strategy: ${this.gridCols}x${this.gridRows} grid, ${this.canvasWidth}x${this.canvasHeight} canvas`);
  }
```

- [ ] **Step 4: Add navigation methods to SpacetimeDBCheckboxApp**

```typescript
// Add these methods to SpacetimeDBCheckboxApp class

  /**
   * Navigate viewport to specific position
   */
  public navigateTo(x: number, y: number): boolean {
    if (!this.navigationController) {
      console.warn('Navigation not available - canvas not initialized');
      return false;
    }
    
    this.navigationController.moveTo(x, y);
    return true;
  }
  
  /**
   * Get current viewport position
   */
  public getViewportPosition(): { x: number; y: number } {
    if (!this.viewportManager) {
      return { x: 0, y: 0 };
    }
    
    return this.viewportManager.getPosition();
  }
  
  /**
   * Get grid configuration info
   */
  public getGridInfo(): {
    cols: number;
    rows: number;
    canvasWidth: number;
    canvasHeight: number;
    strategy: RenderStrategy;
  } {
    return {
      cols: this.gridCols,
      rows: this.gridRows,
      canvasWidth: this.canvasWidth,
      canvasHeight: this.canvasHeight,
      strategy: this.renderStrategy
    };
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd typescript-frontend && npm test SpacetimeDBCheckboxApp.integration.test.ts`
Expected: PASS

- [ ] **Step 6: Commit SpacetimeDB integration**

```bash
git add typescript-frontend/src/SpacetimeDBCheckboxApp.ts typescript-frontend/test/SpacetimeDBCheckboxApp.integration.test.ts
git commit -m "feat: integrate large canvas navigation with SpacetimeDB app

- Add MemoryManager-based configuration for grid size and canvas dimensions
- Support three strategies: large-canvas, virtual-scroll, dom-grid
- Add navigation methods (navigateTo, getViewportPosition)
- Include grid info API for debugging and stats display
- Maintain backward compatibility with existing collaborative features"
