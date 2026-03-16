# Design: Panning 2D Checkbox Grid (1000×1000)

**Date**: 2026-03-16  
**Status**: Approved

## Goal
Transform the checkbox grid from a 1D linear view (10K of 1M checkboxes) into a 2D pannable map interface where users can navigate a 1000×1000 grid like Google Maps, maintaining full state across all 1M checkboxes.

## Requirements
- **Grid Dimensions**: 1000×1000 = 1M checkboxes
- **Viewport Size**: 100×100 visible checkboxes (~10K rendered at a time)
- **Panning Methods**: Arrow keys (← → ↑ ↓) + mouse drag
- **State Persistence**: All 1M checkbox states persist in memory; pan anywhere and state remains
- **Position Display**: No position indicator needed, just pan

## Architecture

### Data Model
```
BitArray: stores 1M checkbox states (same as before)
Viewport: { x: u16, y: u16 }  // top-left corner of 100×100 window
  - Valid range: x: 0-900, y: 0-900
```

### Index Mapping
Convert between 2D coordinates and 1D bit array indices:
```
global_index = y * 1000 + x
where x ∈ [0, 999], y ∈ [0, 999]

visible_indices = {
  (vp_x + dx, vp_y + dy)
  for dx in [0, 99], dy in [0, 99]
}
```

### Rendering Pipeline
1. **Viewport Change** (arrow key or mouse drag)
   - Calculate new viewport position (clamped to 0-900 range)
   - Clear grid DOM
   
2. **Calculate Visible Range**
   - x_range: [viewport.x, viewport.x + 100)
   - y_range: [viewport.y, viewport.y + 100)
   
3. **Render Grid**
   - Set CSS Grid: `grid-template-columns: repeat(100, 24px)`
   - For each visible (x, y):
     - Calculate global_index = y * 1000 + x
     - Get state from BitArray.get(global_index)
     - Create checkbox element with data-index=global_index
   
4. **Event Handlers** (unchanged)
   - Click checkbox → BitArray.set() + WebSocket update

### Input Handling

**Arrow Keys**:
- Listen for keydown events on document
- ← : viewport.x = max(0, viewport.x - 10)
- → : viewport.x = min(900, viewport.x + 10)
- ↑ : viewport.y = max(0, viewport.y - 10)
- ↓ : viewport.y = min(900, viewport.y + 10)
- On any change, trigger re-render

**Mouse Drag**:
- Track mousedown position (x0, y0)
- On mousemove: calculate delta_pixels = current_mouse_pos - (x0, y0)
- Convert pixels to checkbox units: delta_checkboxes = delta_pixels / 24 (checkbox size)
- Update viewport: viewport = clamped_to_0_900(initial_viewport - delta_checkboxes)
- Render on mousemove (throttle if needed)
- On mouseup: lock in the final position

### State Management
- **BitArray**: Unchanged - continues to store all 1M bits in memory
- **Viewport**: New - tracks current 100×100 window position
- **Syncing**: 
  - When checkbox clicked: compute global_index from current (x,y) + viewport offset
  - Send to WebSocket as before
  - BitArray receives update and persists (invisible checkboxes still update)

## Performance Considerations

**Rendering**: Only 10K checkboxes in DOM (same as current) - panning doesn't increase DOM size
**State**: 125KB in memory for all 1M bits (same as current)
**Interaction**: Re-render on viewport change is fast (just re-arrange 10K DOM elements)
**Optimization Potential**: Could virtualize checkbox rendering further, but 10K is already reasonable

## Testing Strategy
1. **Unit**: Verify index mapping (2D ↔ 1D conversion)
2. **Manual**: 
   - Pan to corners (0,0), (900,900), edges
   - Check that clicked checkboxes update correctly at any viewport
   - Pan away and back - state should persist
   - Verify arrow keys and mouse drag both work
3. **E2E**: 
   - WebSocket still receives updates with correct global indices
   - Backend receives and updates correct bits

## Implementation Notes
- Reuse existing BitArray, CheckboxMessage, WebSocket code
- Main changes: viewport tracking + index mapping in render function
- Arrow key handler: document.addEventListener('keydown', ...)
- Mouse drag handler: grid_elem.addEventListener('mousedown', ...) with move/up listeners
- Clamp viewport to valid range (0-900 for 100×100 window)
