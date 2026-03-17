#!/bin/bash

set -euo pipefail

SPACETIMEDB_PORT=${SPACETIMEDB_PORT:-3001}
SPACETIMEDB_HOST=${SPACETIMEDB_HOST:-127.0.0.1}
LOG_FILE="/tmp/spacetimedb-test.log"

check_spacetimedb_installed() {
    if ! command -v spacetime &> /dev/null; then
        echo "❌ SpacetimeDB CLI not found"
        echo "Install: curl --proto '=https' --tlsv1.2 -sSf https://install.spacetimedb.com | sh"
        exit 1
    fi
}

is_running() {
    curl -f "http://${SPACETIMEDB_HOST}:${SPACETIMEDB_PORT}/health" &>/dev/null
}

start_spacetimedb() {
    check_spacetimedb_installed
    
    if is_running; then
        echo "✓ SpacetimeDB already running on ${SPACETIMEDB_HOST}:${SPACETIMEDB_PORT}"
        return 0
    fi
    
    echo "🚀 Starting SpacetimeDB on ${SPACETIMEDB_HOST}:${SPACETIMEDB_PORT}..."
    
    # Start in background and redirect output to log file
    spacetime start --listen "${SPACETIMEDB_HOST}:${SPACETIMEDB_PORT}" > "${LOG_FILE}" 2>&1 &
    local pid=$!
    
    # Save PID for later cleanup
    echo $pid > "/tmp/spacetimedb-test.pid"
    
    # Wait for startup (max 15 seconds)
    local retries=15
    while [[ $retries -gt 0 ]]; do
        if is_running; then
            echo "✅ SpacetimeDB started successfully (PID: $pid)"
            return 0
        fi
        sleep 1
        retries=$((retries - 1))
    done
    
    echo "❌ SpacetimeDB failed to start"
    echo "Log output:"
    cat "${LOG_FILE}"
    exit 1
}

stop_spacetimedb() {
    if [[ -f "/tmp/spacetimedb-test.pid" ]]; then
        local pid=$(cat "/tmp/spacetimedb-test.pid")
        if kill "$pid" 2>/dev/null; then
            echo "✅ Stopped SpacetimeDB (PID: $pid)"
        else
            echo "⚠️ SpacetimeDB process $pid not found"
        fi
        rm -f "/tmp/spacetimedb-test.pid"
    else
        # Fallback: kill by process name
        if pkill -f "spacetime start" 2>/dev/null; then
            echo "✅ Stopped SpacetimeDB"
        else
            echo "⚠️ No SpacetimeDB process found"
        fi
    fi
    
    rm -f "${LOG_FILE}"
}

deploy_test_module() {
    echo "📦 Deploying test module..."
    cd "$(dirname "$0")/../backend"
    
    # Check if wasm32 target is installed
    if ! rustup target list --installed | grep -q "wasm32-unknown-unknown"; then
        echo "🔧 Installing wasm32-unknown-unknown target..."
        rustup target add wasm32-unknown-unknown
    fi
    
    # Build module
    if ! cargo build --release --target wasm32-unknown-unknown; then
        echo "❌ Failed to build SpacetimeDB module"
        exit 1
    fi
    
    # Deploy to local instance
    if ! spacetime publish; then
        echo "❌ Failed to deploy SpacetimeDB module"
        exit 1
    fi
    
    echo "✅ Test module deployed successfully"
}

status() {
    if is_running; then
        echo "✅ SpacetimeDB is running on ${SPACETIMEDB_HOST}:${SPACETIMEDB_PORT}"
        if [[ -f "/tmp/spacetimedb-test.pid" ]]; then
            echo "   PID: $(cat /tmp/spacetimedb-test.pid)"
        fi
    else
        echo "❌ SpacetimeDB is not running"
    fi
}

case "${1:-}" in
    start)
        start_spacetimedb
        ;;
    stop)
        stop_spacetimedb
        ;;
    restart)
        stop_spacetimedb
        start_spacetimedb
        ;;
    deploy)
        deploy_test_module
        ;;
    status)
        status
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|deploy|status}"
        echo ""
        echo "Commands:"
        echo "  start   - Start local SpacetimeDB instance"
        echo "  stop    - Stop local SpacetimeDB instance" 
        echo "  restart - Restart local SpacetimeDB instance"
        echo "  deploy  - Deploy backend module to local instance"
        echo "  status  - Check if SpacetimeDB is running"
        exit 1
        ;;
esac