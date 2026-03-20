use leptos::prelude::*;
use std::cell::Cell;

use crate::bookmark::{load_viewport, parse_bookmark, save_viewport};
use crate::components::{CheckboxCanvas, Header};
use crate::constants::CELL_SIZE;
use crate::state::AppState;
use crate::worker_bridge::{init_worker, send_to_worker, terminate_worker};
use crate::worker_protocol::{MainToWorker, WorkerToMain};

const STYLES: &str = include_str!("styles.css");

#[component]
pub fn App() -> impl IntoView {
    let state = AppState::new();

    // Parse bookmark URL on mount and set initial viewport
    Effect::new(move || {
        if let Some(window) = web_sys::window() {
            if let Ok(search) = window.location().search() {
                let bookmark = parse_bookmark(&search);

                // If URL has coordinates, use those (for shared links)
                if bookmark.x != 0.0 || bookmark.y != 0.0 || bookmark.zoom != 1.0 {
                    // Get canvas size (approximate, will be corrected on resize)
                    let canvas_w = window
                        .inner_width()
                        .ok()
                        .and_then(|v| v.as_f64())
                        .unwrap_or(1200.0)
                        - 40.0;
                    let canvas_h = window
                        .inner_height()
                        .ok()
                        .and_then(|v| v.as_f64())
                        .unwrap_or(800.0)
                        - 120.0;

                    let scale = bookmark.zoom;
                    let cell_size = CELL_SIZE * scale;

                    // Center the bookmark position on screen
                    let offset_x = canvas_w / 2.0 - (bookmark.x as f64) * cell_size;
                    let offset_y = canvas_h / 2.0 - (bookmark.y as f64) * cell_size;

                    state.offset_x.set(offset_x);
                    state.offset_y.set(offset_y);
                    state.scale.set(scale);

                    web_sys::console::log_1(
                        &format!(
                            "Loaded bookmark: ({}, {}) zoom={}",
                            bookmark.x, bookmark.y, bookmark.zoom
                        )
                        .into(),
                    );
                } else if let Some((offset_x, offset_y, scale)) = load_viewport() {
                    // No URL params - restore from localStorage
                    state.offset_x.set(offset_x);
                    state.offset_y.set(offset_y);
                    state.scale.set(scale);

                    web_sys::console::log_1(
                        &format!(
                            "Restored viewport from localStorage: offset=({}, {}), scale={}",
                            offset_x, offset_y, scale
                        )
                        .into(),
                    );
                }
            }
        }

        // Initialize worker (with once-only guard to prevent re-initialization)
        thread_local! {
            static WORKER_INITIALIZED: Cell<bool> = const { Cell::new(false) };
        }

        WORKER_INITIALIZED.with(|initialized| {
            if !initialized.get() {
                initialized.set(true);

                let _ = init_worker(move |msg| {
                    match msg {
                        WorkerToMain::Connected => {
                            state.status.set(crate::state::ConnectionStatus::Connected);
                            state.status_message.set("Connected".to_string());
                        }
                        WorkerToMain::ChunkInserted { chunk_id, state: chunk_state, version } => {
                            web_sys::console::log_1(&format!("Chunk {} inserted, version {}", chunk_id, version).into());
                            state.loaded_chunks.update(|chunks| {
                                chunks.insert(chunk_id, chunk_state);
                            });
                            state.subscribed_chunks.update(|subs| {
                                subs.insert(chunk_id);
                            });
                            state.loading_chunks.update(|loading| {
                                loading.remove(&chunk_id);
                            });
                            state.render_version.update(|v| *v += 1);
                        }
                        WorkerToMain::ChunkUpdated { chunk_id, state: chunk_state, version } => {
                            web_sys::console::log_1(&format!("Chunk {} updated, version {}", chunk_id, version).into());
                            // Note: We don't check versions here - server is source of truth.
                            // Optimistic updates from user actions are intentionally overwritten
                            // by authoritative server state to maintain consistency.
                            state.loaded_chunks.update(|chunks| {
                                chunks.insert(chunk_id, chunk_state);
                            });
                            state.render_version.update(|v| *v += 1);
                        }
                        WorkerToMain::FatalError { message } => {
                            state.status.set(crate::state::ConnectionStatus::Error);
                            state.status_message.set(message);
                        }
                    }
                });

                // Connect to SpacetimeDB via worker
                let uri = get_spacetimedb_uri();
                send_to_worker(MainToWorker::Connect {
                    uri,
                    database: "checkboxes".to_string(),
                });
            }
        });
    });

    // Cleanup: terminate worker when component unmounts
    on_cleanup(|| {
        terminate_worker();
    });

    // Save viewport to localStorage when it changes (debounced via effect)
    Effect::new(move |_| {
        let offset_x = state.offset_x.get();
        let offset_y = state.offset_y.get();
        let scale = state.scale.get();

        save_viewport(offset_x, offset_y, scale);
    });

    view! {
        <style>{STYLES}</style>
        <Header state=state />
        <CheckboxCanvas state=state />
    }
}

/// Get the SpacetimeDB URI based on environment
fn get_spacetimedb_uri() -> String {
    let window = web_sys::window().expect("no window");
    let location = window.location();
    let hostname = location.hostname().unwrap_or_default();

    if hostname == "localhost" || hostname == "127.0.0.1" {
        "ws://127.0.0.1:3000".to_string()
    } else {
        "wss://maincloud.spacetimedb.com".to_string()
    }
}
