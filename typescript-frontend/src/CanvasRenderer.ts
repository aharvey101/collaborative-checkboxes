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