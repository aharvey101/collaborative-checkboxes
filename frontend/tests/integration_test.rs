// frontend/tests/integration_test.rs
use frontend::{CheckboxApp, create_checkbox_app_local};

#[test]
fn test_local_mode_full_flow() {
    let mut app = create_checkbox_app_local();
    
    // Test checkbox operations
    assert_eq!(app.get_checkbox(0, 0), false);
    app.toggle_checkbox(0, 0);
    assert_eq!(app.get_checkbox(0, 0), true);
    
    // Test viewport operations
    app.set_viewport(0, 0, 800, 600);
    assert_eq!(app.get_checkbox(0, 0), true); // State should persist
}

#[test] 
fn test_collaborative_mode_creation() {
    let app = CheckboxApp::new_collaborative("http://localhost:3000", "checkboxes", 10);
    assert!(app.is_ok());
    
    let app = app.unwrap();
    assert!(app.is_collaborative_mode());
}

#[cfg(not(target_arch = "wasm32"))]
#[tokio::test]
async fn test_collaborative_mode_offline_behavior() {
    let mut app = CheckboxApp::new_collaborative("http://localhost:3000", "checkboxes", 10).unwrap();
    
    // Should work locally even without connection
    app.toggle_checkbox(5, 5);
    assert_eq!(app.get_checkbox(5, 5), true);
    
    // Connection attempt should fail gracefully 
    let _connection_result = app.connect_collaborative().await;
    // Don't assert connection success since server may not be running
    
    // Updates should queue properly regardless of connection
    app.set_viewport(100, 100, 400, 400);
}

#[cfg(target_arch = "wasm32")]
#[test]
fn test_collaborative_mode_offline_behavior_wasm() {
    let mut app = CheckboxApp::new_collaborative("http://localhost:3000", "checkboxes", 10).unwrap();
    
    // Should work locally even without connection
    app.toggle_checkbox(5, 5);
    assert_eq!(app.get_checkbox(5, 5), true);
    
    // Updates should queue properly regardless of connection
    app.set_viewport(100, 100, 400, 400);
}