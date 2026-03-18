use crate::state::AppState;
use leptos::prelude::*;

#[component]
pub fn Header(state: AppState) -> impl IntoView {
    let status_class = move || state.status.get().as_class();
    let status_text = move || state.status_message.get();

    let stats_text = move || {
        let scale = state.scale.get();
        format!("Zoom: {:.1}x | Shift+drag to pan, scroll to zoom", scale)
    };

    view! {
        <div class="header">
            <h1>"1 Billion Checkboxes"</h1>
            <div class=status_class>{status_text}</div>
            <div class="stats">{stats_text}</div>
        </div>
    }
}
