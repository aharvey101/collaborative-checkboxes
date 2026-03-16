# Collaborative Mode

This document explains how to use the collaborative real-time features of the checkbox application.

## Overview

The frontend supports two modes:
- **Local Mode**: Standalone operation with in-memory state
- **Collaborative Mode**: Real-time synchronization with SpacetimeDB backend

## Usage

### Local Mode (Default)
```javascript
import init, { create_checkbox_app_local } from './pkg/checkboxes_frontend.js';

await init();
const app = create_checkbox_app_local();
```

### Collaborative Mode
```javascript
import init, { create_checkbox_app_collaborative } from './pkg/checkboxes_frontend.js';

await init();
const app = create_checkbox_app_collaborative('http://localhost:3000', 'checkboxes');

if (app) {
    // Connect to server
    const connected = await app.connectIfNeeded();
    
    if (connected) {
        // Process any pending updates periodically
        setInterval(async () => {
            await app.processPendingUpdates();
        }, 100);
    }
}
```

## Features

### Optimistic Updates
Checkbox toggles are immediately reflected in the UI, then synchronized with the server in the background.

### Viewport Subscriptions
Only chunks visible in the current viewport are synchronized, reducing bandwidth usage.

### LRU Cache
Recently viewed chunks are kept in memory for fast access, with automatic eviction when memory limits are reached.

### Error Handling
Connection failures are handled gracefully, allowing offline operation with pending updates queued for later sync.

## Configuration

- Cache size: Configurable number of chunks to keep in memory (default: 20)
- Chunk size: 32x32 pixels per chunk (optimized for typical viewport sizes)
- Server URL: Configurable SpacetimeDB server endpoint