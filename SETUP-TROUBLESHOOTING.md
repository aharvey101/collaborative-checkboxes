# Checkbox Grid - Setup and Troubleshooting Guide

## Issue: "Only One Checkbox Can Be Checked At A Time"

If you're experiencing the issue where checkboxes don't remain checked independently, this is typically caused by **SpacetimeDB backend setup problems**, not frontend logic errors.

## Root Cause Analysis (Completed)

Through systematic debugging, we've confirmed:

✅ **Frontend Logic is CORRECT**: When the database works, multiple checkboxes work perfectly
✅ **Error Handling is ROBUST**: Database failures don't corrupt checkbox state  
🔴 **Backend Setup Issues**: The primary cause is SpacetimeDB configuration problems

## Quick Fix: Verify Backend Status

### Step 1: Check if SpacetimeDB Server is Running

```bash
# Check if SpacetimeDB server is running
ps aux | grep spacetime

# If not running, start it:
cd backend
spacetime start --listen-addr 127.0.0.1:3001
```

### Step 2: Update Frontend Configuration

If your SpacetimeDB server is running on a different port, update the frontend:

```typescript
// In src/SpacetimeDBCheckboxApp.ts, line 37:
constructor(serverUrl: string = 'http://localhost:3001', databaseAddress: string = 'checkboxes-local-demo') {
```

### Step 3: Build and Deploy Backend Module

```bash
cd backend

# Ensure you have Rust 1.93+ (required by SpacetimeDB 2.0.5)
rustup update
rustup default stable

# Build the backend module
cargo build --release

# Create local development configuration
echo '{"server": "http://localhost:3001"}' > spacetime.json

# Publish the database module
spacetime publish checkboxes-local-demo
```

### Step 4: Test the Fix

```bash
cd typescript-frontend
npm test test/checkbox-frontend-isolation.test.ts
```

## Common Setup Issues

### Issue 1: Port Conflicts

**Symptoms**: Connection timeouts, hanging database calls
**Solution**: Use different ports for frontend/backend

```bash
# Frontend (Vite dev server): http://localhost:3000  
# Backend (SpacetimeDB): http://localhost:3001
spacetime start --listen-addr 127.0.0.1:3001
```

### Issue 2: Rust Version Incompatibility  

**Symptoms**: Build errors mentioning "rustc 1.93.0 required"
**Solution**: Update Rust toolchain

```bash
rustup update
rustup default stable
rustc --version  # Should show 1.93.0 or newer
```

### Issue 3: Backend Module Not Published

**Symptoms**: "Database not found" errors  
**Solution**: Publish the backend module

```bash
cd backend
spacetime publish checkboxes-local-demo
```

### Issue 4: Environment Variables Override

**Symptoms**: Rust version shows as older despite updating
**Solution**: Clear environment overrides

```bash
unset RUSTUP_TOOLCHAIN
rustc --version
```

## Development Mode Setup

For development, use this complete setup:

```bash
# Terminal 1: Start SpacetimeDB server
cd backend
spacetime start --listen-addr 127.0.0.1:3001

# Terminal 2: Build and publish backend (once)
cd backend  
unset RUSTUP_TOOLCHAIN  # Clear any version overrides
cargo build --release
spacetime publish checkboxes-local-demo

# Terminal 3: Start frontend dev server  
cd typescript-frontend
npm run dev
```

## Verification Steps

1. **Backend Health**: `curl http://localhost:3001/health` should return 200
2. **Database Published**: `spacetime list` should show your database
3. **Frontend Connection**: Browser console should show "✅ Successfully connected to SpacetimeDB!"
4. **Checkbox Test**: Multiple checkboxes should remain checked independently

## Troubleshooting

If checkboxes still don't work after setup:

1. **Check browser console** for connection errors
2. **Check SpacetimeDB logs** in the server terminal
3. **Run isolated tests** to verify frontend logic:
   ```bash
   npm test test/checkbox-frontend-isolation.test.ts
   npm test test/database-failure-scenarios.test.ts
   ```

## Architecture Notes

- **Frontend**: Handles bit manipulation, local state, UI rendering
- **Backend**: SpacetimeDB module with reducers for persistence  
- **Real-time Sync**: WebSocket connection for collaborative updates
- **Auto-Connection**: Frontend automatically connects on page load

The checkbox grid supports 100×100 = 10,000 checkboxes with efficient bit-packed storage and real-time collaboration.