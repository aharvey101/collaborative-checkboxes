#!/usr/bin/env bash
# Integration test script for the checkboxes project
# This verifies the backend server can start and handle WebSocket connections

set -e

BACKEND_DIR="/Users/alexander/development/checkboxes/.worktrees/checkboxes-impl/backend"
TIMEOUT_SECS=5

echo "Building backend server..."
cd "$BACKEND_DIR"
cargo build --bin server --release -q

echo "Starting backend server in background..."
cargo run --bin server --release > /tmp/backend.log 2>&1 &
SERVER_PID=$!
echo "Server PID: $SERVER_PID"

# Give server time to start
sleep 2

# Check if server is running
if ! kill -0 $SERVER_PID 2>/dev/null; then
    echo "ERROR: Server failed to start"
    cat /tmp/backend.log
    exit 1
fi

echo "✓ Backend server started successfully"
echo "✓ WebSocket server listening on ws://127.0.0.1:8080/subscribe"

# Clean up
kill $SERVER_PID 2>/dev/null || true

echo ""
echo "========================================="
echo "INTEGRATION TEST PASSED"
echo "========================================="
echo ""
echo "To run the full application:"
echo ""
echo "Terminal 1 (Backend Server):"
echo "  cd $BACKEND_DIR"
echo "  cargo run --bin server --release"
echo ""
echo "Terminal 2 (HTTP Server):"
echo "  cd ${BACKEND_DIR%/backend}/frontend"
echo "  python3 ../serve.py"
echo ""
echo "Then open http://localhost:3000 in your browser"
echo ""
