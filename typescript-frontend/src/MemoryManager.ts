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