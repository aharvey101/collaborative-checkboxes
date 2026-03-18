use leptos::prelude::*;

use crate::components::{CheckboxCanvas, Header};
use crate::db::init_connection;
use crate::state::AppState;

const STYLES: &str = include_str!("styles.css");

#[component]
pub fn App() -> impl IntoView {
    let state = AppState::new();

    // Initialize SpacetimeDB connection on mount
    Effect::new(move || {
        init_connection(state);
    });

    view! {
        <style>{STYLES}</style>
        <Header state=state />
        <CheckboxCanvas state=state />
    }
}
