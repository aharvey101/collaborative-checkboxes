# Panning 2D Checkbox Grid Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the checkbox frontend from a 1D 10K-checkbox view into a pannable 2D 1000×1000 grid where users can navigate with arrow keys or mouse drag while maintaining state for all 1M checkboxes.

**Architecture:** Extend the existing BitArray state management with a Viewport tracker (100×100 visible window). Modify the render function to calculate visible checkboxes based on viewport position and map 2D coordinates to 1D bit array indices. Add keyboard and mouse event handlers for panning.

**Tech Stack:** Vanilla WASM (web-sys), existing frontend code (no new dependencies)

---

## File Structure

**Modified files:**
- `frontend/src/lib.rs` - Main frontend logic
  - Add `Viewport` struct to track current position
  - Update `render_grid` to use viewport-aware index calculation
  - Add keyboard event listener for arrow keys
  - Add mouse drag event listeners
  - Update click handler to compute correct global index from viewport + local position

**Test approach:** Manual testing (no test framework for WASM frontend)
- Test index mapping (2D↔1D conversion) 
- Test viewport clamping at boundaries
- Test panning with arrow keys
- Test panning with mouse drag
- Test state persistence across pan

---

## Chunk 1: Viewport Data Structure & Index Mapping

### Task 1: Add Viewport struct and helper functions

**Files:**
- Modify: `frontend/src/lib.rs` (before `BitArray` struct)

- [ ] **Step 1: Add Viewport struct**

Add this code right after the `CheckboxMessage` enum and before the `BitArray` struct:

```rust
/// Tracks the current viewport position in the 1000×1000 grid
#[derive(Clone, Copy)]
struct Viewport {
    x: u16,  // top-left x coordinate (0-900)
    y: u16,  // top-left y coordinate (0-900)
}

impl Viewport {
    fn new() -> Self {
        Viewport { x: 450, y: 450 } // Start in the middle
    }

    /// Pan by an offset, clamped to valid range [0, 900]
    fn pan(&mut self, dx: i16, dy: i16) {
        let new_x = (self.x as i16 + dx).clamp(0, 900) as u16;
        let new_y = (self.y as i16 + dy).clamp(0, 900) as u16;
        self.x = new_x;
        self.y = new_y;
    }

    /// Convert 2D grid coordinates to 1D bit array index
    fn coords_to_index(x: u16, y: u16) -> usize {
        (y as usize) * 1000 + (x as usize)
    }

    /// Convert 1D bit array index to 2D grid coordinates
    fn index_to_coords(index: usize) -> (u16, u16) {
        let x = (index % 1000) as u16;
        let y = (index / 1000) as u16;
        (x, y)
    }
}
```

- [ ] **Step 2: Update the main() function to create Viewport**

Find this line in the `main()` function (around line 100):
```rust
let bit_array = BitArray::new(TOTAL_CHECKBOXES);
```

Add right after it:
```rust
let viewport = Viewport::new();
```

Also update the `const TOTAL_CHECKBOXES: usize = 1_000_000;` comment to clarify:
```rust
const TOTAL_CHECKBOXES: usize = 1_000_000; // 1000×1000 grid
const GRID_SIZE: usize = 1000;
const VIEWPORT_SIZE: usize = 100;
const CHECKBOX_SIZE: f64 = 26.0;
```

- [ ] **Step 3: Update render_grid to use viewport**

Find the `render_grid` closure definition (around line 199). Replace the entire closure with:

```rust
let render_grid = |bit_array: &BitArray, viewport: Viewport, cols: usize| {
    grid_elem.set_inner_html("");
    grid_elem
        .set_attribute(
            "style",
            &format!("grid-template-columns: repeat({}, 24px);", cols),
        )
        .ok();

    // Render only the visible 100×100 checkboxes from the viewport
    for local_y in 0..VIEWPORT_SIZE {
        for local_x in 0..VIEWPORT_SIZE {
            let grid_x = viewport.x as usize + local_x;
            let grid_y = viewport.y as usize + local_y;
            
            // Skip if out of bounds (shouldn't happen with proper clamping, but be safe)
            if grid_x >= GRID_SIZE || grid_y >= GRID_SIZE {
                continue;
            }

            let global_index = Viewport::coords_to_index(grid_x as u16, grid_y as u16);
            
            let checkbox = document.create_element("label").expect("create label");
            checkbox.set_class_name(&format!(
                "checkbox-item {}",
                if bit_array.get(global_index) { "checked" } else { "" }
            ));
            checkbox
                .set_attribute("title", &format!("Checkbox {}", global_index))
                .ok();

            let input = document.create_element("input").expect("create input");
            input.set_attribute("type", "checkbox").ok();
            input.set_attribute("data-index", &global_index.to_string()).ok();

            if bit_array.get(global_index) {
                if let Some(input_elem) = input.dyn_ref::<HtmlInputElement>() {
                    input_elem.set_checked(true);
                }
            }

            checkbox.append_child(&input).ok();
            grid_elem.append_child(&checkbox).ok();
        }
    }

    checked_elem.set_inner_html(&bit_array.count_checked(RENDER_LIMIT).to_string());
};
```

- [ ] **Step 4: Update initial render call**

Find the line `render_grid(&bit_array, cols);` (around line 257) and replace with:
```rust
render_grid(&bit_array, viewport, cols);
```

- [ ] **Step 5: Build and verify no compilation errors**

Run:
```bash
cd /Users/alexander/development/checkboxes/.worktrees/checkboxes-impl/frontend
cargo build --target wasm32-unknown-unknown 2>&1 | head -50
```

Expected: Should compile (may have unused variable warnings, which we'll fix)

- [ ] **Step 6: Commit**

```bash
cd /Users/alexander/development/checkboxes/.worktrees/checkboxes-impl
git add frontend/src/lib.rs
git commit -m "feat: add Viewport struct and 2D index mapping"
```

---

## Chunk 2: Arrow Key Panning

### Task 2: Add keyboard event handler for arrow keys

**Files:**
- Modify: `frontend/src/lib.rs` (in main(), after grid rendering setup)

- [ ] **Step 1: Make viewport mutable and wrap it in RefCell**

Find the line `let viewport = Viewport::new();` and replace it with:

```rust
let viewport = Rc::new(RefCell::new(Viewport::new()));
```

You'll also need to add `Rc` import at the top (it's already there from BitArray).

- [ ] **Step 2: Update all render_grid calls to dereference viewport**

Find both `render_grid(&bit_array, viewport, cols);` calls and replace with:
```rust
render_grid(&bit_array, *viewport.borrow(), cols);
```

There should be two of them: one in the initial setup, one in the window resize handler.

- [ ] **Step 3: Add keyboard event handler**

Add this code after the viewport setup and before the checkbox click handler (around line 310):

```rust
// Setup keyboard handler for arrow key panning
let viewport_clone = viewport.clone();
let onkeydown = Closure::wrap(Box::new(move |event: web_sys::KeyboardEvent| {
    let mut vp = viewport_clone.borrow_mut();
    let pan_amount = 10i16; // Move 10 checkboxes per key press
    
    match event.key().as_str() {
        "ArrowLeft" => vp.pan(-pan_amount, 0),
        "ArrowRight" => vp.pan(pan_amount, 0),
        "ArrowUp" => vp.pan(0, -pan_amount),
        "ArrowDown" => vp.pan(0, pan_amount),
        _ => return, // Ignore other keys
    }
    
    // Re-render after pan
    let cols = calculate_cols();
    render_grid(&bit_array.clone(), *vp, cols);
}) as Box<dyn Fn(web_sys::KeyboardEvent)>);

document
    .add_event_listener_with_callback("keydown", onkeydown.as_ref().unchecked_ref())
    .ok();
onkeydown.forget();
```

- [ ] **Step 4: Build and test arrow keys**

Run:
```bash
cd /Users/alexander/development/checkboxes/.worktrees/checkboxes-impl/frontend
cargo build --target wasm32-unknown-unknown 2>&1 | grep -E "error|Finished"
```

Expected: Should compile with no errors

Then rebuild WASM and test in browser:
```bash
wasm-pack build --target web --dev
```

Open http://localhost:3000 and press arrow keys - grid should pan.

- [ ] **Step 5: Commit**

```bash
cd /Users/alexander/development/checkboxes/.worktrees/checkboxes-impl
git add frontend/src/lib.rs
git commit -m "feat: add arrow key panning"
```

---

## Chunk 3: Mouse Drag Panning

### Task 3: Add mouse drag event handlers

**Files:**
- Modify: `frontend/src/lib.rs` (after keyboard handler, before checkbox click handler)

- [ ] **Step 1: Add mouse drag state tracking**

Add this code right after the keyboard handler and before the checkbox click handler:

```rust
// Setup mouse drag handler for panning
let viewport_clone = viewport.clone();
let grid_clone = grid_elem.clone();
let bit_array_clone = bit_array.clone();

// Track drag state
let drag_state = Rc::new(RefCell::new(Option::<(f64, f64)>::None));
let drag_state_clone = drag_state.clone();

// Mouse down: start tracking
let onmousedown = Closure::wrap(Box::new(move |event: web_sys::MouseEvent| {
    *drag_state_clone.borrow_mut() = Some((event.client_x() as f64, event.client_y() as f64));
}) as Box<dyn Fn(web_sys::MouseEvent)>);

grid_elem
    .add_event_listener_with_callback("mousedown", onmousedown.as_ref().unchecked_ref())
    .ok();
onmousedown.forget();

// Mouse move: pan based on delta
let viewport_clone = viewport.clone();
let onmousemove = Closure::wrap(Box::new(move |event: web_sys::MouseEvent| {
    if let Some((start_x, start_y)) = *drag_state.borrow() {
        let current_x = event.client_x() as f64;
        let current_y = event.client_y() as f64;
        
        let delta_x = (start_x - current_x) / CHECKBOX_SIZE;
        let delta_y = (start_y - current_y) / CHECKBOX_SIZE;
        
        let mut vp = viewport_clone.borrow_mut();
        vp.pan(delta_x as i16, delta_y as i16);
        
        // Update drag start to current position for smooth dragging
        *drag_state.borrow_mut() = Some((current_x, current_y));
        
        // Re-render
        let cols = calculate_cols();
        render_grid(&bit_array_clone, *vp, cols);
    }
}) as Box<dyn Fn(web_sys::MouseEvent)>);

document
    .add_event_listener_with_callback("mousemove", onmousemove.as_ref().unchecked_ref())
    .ok();
onmousemove.forget();

// Mouse up: stop tracking
let drag_state_clone = drag_state.clone();
let onmouseup = Closure::wrap(Box::new(move |_event: web_sys::MouseEvent| {
    *drag_state_clone.borrow_mut() = None;
}) as Box<dyn Fn(web_sys::MouseEvent)>);

document
    .add_event_listener_with_callback("mouseup", onmouseup.as_ref().unchecked_ref())
    .ok();
onmouseup.forget();
```

- [ ] **Step 2: Build and test mouse dragging**

Run:
```bash
cd /Users/alexander/development/checkboxes/.worktrees/checkboxes-impl/frontend
cargo build --target wasm32-unknown-unknown 2>&1 | grep -E "error|Finished"
```

Expected: Should compile with no errors

Rebuild WASM:
```bash
wasm-pack build --target web --dev
```

Test in browser: Click and drag on the grid - it should pan.

- [ ] **Step 3: Commit**

```bash
cd /Users/alexander/development/checkboxes/.worktrees/checkboxes-impl
git add frontend/src/lib.rs
git commit -m "feat: add mouse drag panning"
```

---

## Chunk 4: Checkbox Click Handling & Final Polish

### Task 4: Update click handler to work with viewport

**Files:**
- Modify: `frontend/src/lib.rs` (update the existing checkbox click handler)

- [ ] **Step 1: Update the onclick handler to use global indices**

The click handler already stores `data-index` as the global index from render_grid, so it should work as-is. However, we need to verify it correctly computes the chunk_id and bit_offset.

Find the onclick closure (around line 318) and verify this logic is correct:

```rust
let chunk_id = (index / 1_000_000) as u32;
let bit_offset = (index % 1_000_000) as u16;
```

This is correct for mapping a global 1M index to chunk/offset. Since we're still using a single chunk (chunk_id=0), all indices will be 0-999999 within that chunk.

No changes needed here - it should already work!

- [ ] **Step 2: Build final version**

```bash
cd /Users/alexander/development/checkboxes/.worktrees/checkboxes-impl/frontend
cargo build --target wasm32-unknown-unknown 2>&1 | grep -E "error|Finished"
```

Expected: Clean compilation

- [ ] **Step 3: Rebuild WASM and test E2E**

```bash
wasm-pack build --target web --dev
```

Test in browser:
1. Confirm grid renders 100×100 checkboxes
2. Press arrow keys - grid pans (verify with edge cases: 0,0 and 900,900)
3. Click and drag - grid pans smoothly
4. Click a checkbox - it checks and sends WebSocket update to backend
5. Pan away and back - previously checked boxes remain checked

- [ ] **Step 4: Commit**

```bash
cd /Users/alexander/development/checkboxes/.worktrees/checkboxes-impl
git add frontend/src/lib.rs
git commit -m "feat: complete 2D panning grid with keyboard and mouse"
```

---

## Manual Testing Checklist

After implementation, verify:

- [ ] Grid renders exactly 100×100 checkboxes
- [ ] Arrow keys pan in all directions
- [ ] Viewport never goes below 0 or above 900
- [ ] Mouse drag pans smoothly
- [ ] Clicking a checkbox at (0,0) sends correct global_index to server
- [ ] Checking a box, panning away, panning back shows it still checked
- [ ] Works at all viewport positions (0,0), (900,900), (500,500)
- [ ] WebSocket updates still work (check backend logs)

---

## Known Limitations & Future Work

- Render limit check (`count_checked(RENDER_LIMIT)`) only counts visible 10K - could extend to count all 1M
- No visual indicator of current position (could add minimap)
- Pan amount (10 checkboxes per key) is hardcoded - could make configurable
- No smooth animation on pan - just jump to new position
