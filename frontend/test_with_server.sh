#!/bin/bash
# frontend/test_with_server.sh

set -e

echo "Starting SpacetimeDB 2.0 integration test..."

# Check if server is running
if ! curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo "❌ SpacetimeDB server not running on localhost:3000"
    echo "Please start the server with: ../spacetimedb.sh start"
    exit 1
fi

echo "✅ SpacetimeDB server is running"

# Build and test Rust components
echo "Running Rust tests..."
mise exec -- cargo test --test integration_test

# Build WASM package
echo "Building WASM package..."
mise exec -- wasm-pack build --target web --out-dir pkg

echo "✅ All tests passed!"
echo ""
echo "Integration test complete. Frontend is ready for collaborative mode with SpacetimeDB 2.0."
echo ""
echo "To use collaborative mode:"
echo "1. Start SpacetimeDB server: ../spacetimedb.sh start"
echo "2. Serve the frontend with a web server"
echo "3. Use create_checkbox_app_collaborative() in JavaScript"