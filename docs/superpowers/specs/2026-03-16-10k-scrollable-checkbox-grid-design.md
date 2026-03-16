# 10,000 Scrollable Checkbox Grid - Design Specification

**Date:** 2026-03-16  
**Status:** Draft  
**Author:** OpenCode AI Assistant  

## Overview

This specification outlines the expansion of the current SpacetimeDB collaborative checkbox application from a 10×10 grid (100 checkboxes) to a 100×100 grid (10,000 checkboxes) with arrow key navigation and intelligent chunk preloading. The system maintains all existing real-time collaborative features while adding smooth scrolling navigation across the larger grid.

## Current State Analysis

### Existing Implementation
- **Grid Size:** 10×10 (100 checkboxes) 
- **Canvas:** 320×320px with 32px cell size
- **Backend:** SpacetimeDB with chunk-based storage (1M checkboxes per chunk)
- **Coordinates:** Smart chunking system with chunk_id and bit_offset calculations
- **Real-time:** Working subscriptions, collaborative updates, multi-browser sync

### Technical Foundation
The current SpacetimeDB backend already supports massive scale with its chunk architecture. Each chunk stores 1 million checkboxes (125KB), so a 100×100 grid (10,000 checkboxes) easily fits within a single chunk.

## Requirements

### Functional Requirements
1. **Grid Expansion**: Display 10,000 checkboxes in 100×100 layout
2. **Navigation**: Arrow key control for smooth movement across grid
3. **Chunk Management**: Intelligent preloading of neighboring chunks
4. **Real-time Sync**: Maintain collaborative features during navigation
5. **Performance**: Smooth scrolling without UI lag or stuttering

### Non-Functional Requirements
1. **Scalability**: Architecture that can extend beyond 100×100 if needed
2. **Memory Efficiency**: Smart loading/unloading of chunks
3. **Responsiveness**: <16ms frame time for 60fps navigation
4. **Compatibility**: Works across all browsers that support current system

## Architecture Design

### Approach: Large Canvas with Viewport Window

The system uses a large canvas (3,200×3,200px) with a smaller viewport container (800×600px) that acts as a "window" into the full grid. Arrow keys move this viewport smoothly across the large canvas.

**Memory Considerations**: A 3,200×3,200px canvas requires ~40MB of memory (100x increase from current 320×320px). This specification includes fallback strategies for devices with memory constraints.

```
┌─────────────────────────────────────────┐
│ Full Canvas (3,200×3,200px)             │
│ ┌─────────────────┐                     │
│ │ Viewport        │                     │ 
│ │ (800×600px)     │                     │
│ │ Visible Area    │                     │
│ └─────────────────┘                     │
│                                         │
│         100×100 Grid (10,000 boxes)     │
└─────────────────────────────────────────┘
```

### Component Architecture

**1. Canvas System**
- Full canvas: 3,200×3,200px (100×100 grid × 32px cells)
- Viewport container: 800×600px with `overflow: hidden`
- Canvas positioning via CSS `transform: translate(x, y)`
- **Fallback Strategy**: Virtual scrolling with smaller canvas on memory-constrained devices

**2. Navigation System** 
- Arrow key event handlers with smooth movement
- Movement increment: 32px (one grid cell) with acceleration
- Boundary checking to prevent out-of-bounds scrolling

**3. Chunk Management**
- Viewport-based loading with neighboring chunk preloading
- Memory management for large grid expansions
- Real-time synchronization with SpacetimeDB

**4. Performance Safeguards**
- Canvas size feature detection with automatic fallbacks
- Memory usage monitoring with adaptive quality reduction
- Progressive enhancement: DOM → Canvas → WebGL (future)

## Detailed Component Design

### Viewport Management

**Viewport State**
```typescript
interface ViewportState {
  position: { x: number, y: number };    // Current viewport position in canvas pixels
  bounds: { left: number, top: number, right: number, bottom: number }; // Visible area
  target: { x: number, y: number };     // Target position for animations
  isMoving: boolean;                    // Animation state
}
```

**Movement Mechanics**
- Base movement: 32px per keypress (one grid cell)
- Key acceleration: After 500ms hold, increase to 96px per keypress
- Smooth transitions: CSS transitions or requestAnimationFrame
- **Edge constraints**: Clamp viewport to stay within bounds that ensure full grid visibility
  - Max X position: 2,400px (3,200px canvas - 800px viewport width)
  - Max Y position: 2,600px (3,200px canvas - 600px viewport height)

**Visible Area Calculation**
```typescript
function getVisibleGridArea(viewport: ViewportState): GridBounds {
  return {
    startX: Math.floor(viewport.bounds.left / 32),
    startY: Math.floor(viewport.bounds.top / 32), 
    endX: Math.ceil(viewport.bounds.right / 32),
    endY: Math.ceil(viewport.bounds.bottom / 32)
  };
}
```

### Chunk Loading Strategy

**Chunk Requirements for 100×100 Grid**
- Primary chunk: chunk_id 0 contains coordinates (0-99, 0-99)
- Future expansion: Additional chunks for grids >100×100
- Buffer strategy: Preload adjacent chunks when approaching boundaries

**Loading Lifecycle**
```typescript
class ChunkManager {
  loadedChunks: Map<number, ChunkData>;
  
  // Load chunks intersecting viewport + buffer zone
  async loadRequiredChunks(viewport: ViewportState): Promise<void>;
  
  // Preload neighboring chunks proactively  
  async preloadNeighboringChunks(currentChunks: number[]): Promise<void>;
  
  // Unload chunks beyond memory threshold
  unloadDistantChunks(viewport: ViewportState): void;
}
```

**Synchronization Strategy**
- Maintain existing SpacetimeDB subscription to `checkbox_chunk` table
- Process updates for all loaded chunks, not just visible ones
- Queue rendering updates for visible areas only

### Rendering Optimizations

**Canvas Rendering Strategy**
```typescript
class GridRenderer {
  canvas: HTMLCanvasElement;           // Full 3,200×3,200px canvas
  ctx: CanvasRenderingContext2D;
  
  // Render entire grid or specific regions
  render(viewport?: ViewportState): void;
  
  // Update only changed cells for efficiency
  updateCells(changedCells: GridCell[]): void;
  
  // Clip rendering to visible area during updates
  renderVisibleArea(viewport: ViewportState): void;
}
```

**Performance Optimizations**
- **Viewport Clipping**: Use canvas clip regions during partial updates
- **Differential Rendering**: Only redraw cells that changed state
- **Animation Sync**: Use requestAnimationFrame for smooth movement
- **GPU Acceleration**: CSS transforms for viewport movement

**Memory Management**
- Single canvas context reuse
- Checkbox state caching independent of chunk storage
- Garbage collection of unused rendering resources

## Implementation Considerations

### Grid Coordinate Systems

**Coordinate Mapping**
```typescript
// Screen → Canvas → Grid → Chunk coordinates
function screenToGrid(screenX: number, screenY: number, viewport: ViewportState): GridCoord {
  // Account for viewport offset in click/touch events
  const canvasX = screenX + viewport.position.x;
  const canvasY = screenY + viewport.position.y;
  return {
    x: Math.floor(canvasX / 32),
    y: Math.floor(canvasY / 32)
  };
}

function gridToChunk(gridX: number, gridY: number): ChunkCoord {
  // Match existing backend coordinate system (SpacetimeDBCheckboxApp.ts:160-166)
  const chunkX = Math.floor(gridX / 1000);
  const chunkY = Math.floor(gridY / 1000);
  const chunkId = chunkY * 1000 + chunkX;
  
  const localX = gridX % 1000;
  const localY = gridY % 1000;
  const bitOffset = localY * 1000 + localX; // Match backend: localY * 1000 + localX
  
  return { chunkId, bitOffset };
}
```

### Error Handling & Edge Cases

**Memory Management**
- **Canvas Size Detection**: Test if browser can allocate 3,200×3,200px canvas
- **Progressive Fallbacks**: 
  1. Primary: Large canvas approach (this spec)
  2. Fallback 1: Virtual scrolling with 800×600px canvas rendering visible cells only  
  3. Fallback 2: DOM-based grid with CSS transform for movement
- **Memory Monitoring**: Track canvas memory usage and switch to fallback if >50MB

**Boundary Conditions**
- Prevent viewport from showing areas outside 100×100 grid
- Handle edge cases where click events occur near grid boundaries  
- Graceful degradation for chunk loading failures

**Performance Safeguards**
- Debounce chunk loading during rapid navigation (100ms delay)
- **Frame Rate Monitoring**: Target 60fps, reduce quality if <30fps detected
- **Device Capability Detection**: Disable smooth animations on low-end devices
- Canvas rendering timeout protection (abort if render takes >16ms)

### User Experience

**Navigation Feel**
- Responsive arrow key handling with no input lag
- Smooth movement animations (200ms duration)
- Visual indicators for current position within larger grid
- Mini-map overlay showing viewport position (optional future feature)

**Visual Feedback**
- Loading indicators for chunk operations
- Debug info panel showing viewport coordinates and loaded chunks
- Performance metrics display in development mode

## Migration Strategy

### Phase 1: Core Infrastructure & Performance Validation
1. **Memory Testing**: Test large canvas allocation across target browsers/devices
2. **Canvas Size Detection**: Implement feature detection for 3,200×3,200px canvas support
3. **Fallback Implementation**: Virtual scrolling as backup for memory-constrained devices
4. Update coordinate mapping for larger grid with viewport offset handling

### Phase 2: Navigation System  
1. Implement arrow key navigation with proper boundary constraints
2. Add smooth movement animations with performance monitoring
3. **Event Handling Update**: Fix click coordinate mapping to account for viewport position

### Phase 3: Chunk Management
1. Implement viewport-based chunk loading
2. Add neighboring chunk preloading with memory thresholds
3. Memory management and unloading with device capability detection

### Phase 4: Performance Optimization & Testing
1. Implement differential rendering and viewport clipping
2. **Cross-device Testing**: Validate performance on mobile browsers  
3. Add frame rate monitoring with adaptive quality reduction
4. Multi-user navigation testing with memory usage analysis

## Testing Strategy

**Unit Tests**
- Coordinate system transformations
- Viewport boundary calculations
- Chunk loading/unloading logic

**Integration Tests**
- Arrow key navigation functionality
- Real-time synchronization during scrolling
- Multi-browser collaborative navigation

**Performance Tests**
- Rendering performance with 10,000 checkboxes
- Memory usage during extended navigation
- FPS maintenance during rapid scrolling

**User Experience Tests**
- Navigation smoothness and responsiveness
- Collaborative user experience with multiple navigating users
- Edge case handling (rapid key presses, boundary navigation)

## Future Considerations

**Extensibility**
- Architecture supports grids larger than 100×100
- Chunk system scales to millions of checkboxes
- Navigation system can accommodate different movement patterns

**Enhancements**
- Zoom in/out functionality
- Mini-map for large grid navigation
- Search/goto specific coordinates
- Custom viewport sizes for different screen resolutions

**Performance Scaling**
- WebGL rendering for ultra-large grids
- Web Workers for chunk processing
- Streaming chunk updates for massive collaborative sessions

## Conclusion

This design expands the collaborative checkbox grid from 100 to 10,000 checkboxes while maintaining all existing real-time collaborative features. The large canvas + viewport approach provides smooth arrow key navigation with intelligent chunk preloading, creating a scalable foundation for even larger grids in the future.

The implementation preserves the current SpacetimeDB architecture and TypeScript frontend while adding sophisticated viewport management and rendering optimizations for optimal performance and user experience.