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