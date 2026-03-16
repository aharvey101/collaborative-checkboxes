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