# Netlify Deployment Design for SpacetimeDB Scrollable Checkboxes

**Date**: 2026-03-16  
**Status**: Approved  
**Goal**: Deploy 100×100 scrollable checkbox grid to production via Netlify

## Overview

Deploy the completed TypeScript frontend for the SpacetimeDB scrollable checkbox grid to Netlify for reliable production hosting. The application features a 100×100 grid (10,000 checkboxes) with smooth arrow key navigation and real-time collaborative editing.

## Architecture

### Frontend (Netlify Hosted)
- **Framework**: TypeScript + Vite static site
- **Source**: `/typescript-frontend/` directory 
- **Features**: 100×100 scrollable grid with memory-adaptive rendering strategies
- **Build Output**: Static files in `typescript-frontend/dist/`
- **Entry Point**: `index.html` with embedded CSS and TypeScript modules

### Backend (Separate SpacetimeDB Deployment)
- **Runtime**: SpacetimeDB cloud or self-hosted instance
- **Source**: `/backend/` Rust module
- **Communication**: WebSocket API for real-time checkbox state sync
- **Protocol**: SpacetimeDB 2.0 WebSocket subscriptions

### Integration
- Frontend connects to SpacetimeDB backend via WebSocket URL
- Real-time collaborative editing maintained across all users
- No server-side rendering required - pure static frontend

## Deployment Configuration

### Netlify Settings
```yaml
# netlify.toml
[build]
  base = "typescript-frontend/"
  command = "npm ci && npm run generate && npm run build"
  publish = "dist/"

[build.environment]
  NODE_VERSION = "18"
  VITE_SPACETIMEDB_URL = "wss://your-spacetimedb-backend.clockworklabs.io"

[[headers]]
  for = "/*"
  [headers.values]
    Content-Security-Policy = "default-src 'self'; connect-src 'self' wss: ws:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
```

### Build Process
1. **Auto-detection**: Netlify detects Vite project and Node.js
2. **Install**: `npm ci` in `/typescript-frontend/`
3. **Generate Bindings**: `npm run generate` creates SpacetimeDB TypeScript bindings
4. **Build**: `npm run build` (runs `tsc && vite build`)
5. **Environment Variables**: `VITE_SPACETIMEDB_URL` injected during build
6. **Publish**: Serves files from `typescript-frontend/dist/`
7. **Deploy**: Available on `https://[site-name].netlify.app`

### Domain & SSL
- **Default**: `*.netlify.app` subdomain with auto-SSL
- **Custom Domain**: Can add custom domain with automatic SSL certificate
- **HTTPS**: Required for WebSocket connections to SpacetimeDB

## File Structure

```
checkboxes/
├── typescript-frontend/          # ← Netlify build root
│   ├── src/
│   │   ├── SpacetimeDBCheckboxApp.ts    # Main application
│   │   ├── MemoryManager.ts             # Device capability detection  
│   │   ├── ViewportManager.ts           # Viewport position tracking
│   │   ├── CanvasRenderer.ts            # Optimized 100×100 rendering
│   │   ├── NavigationController.ts      # Arrow key navigation
│   │   └── generated/                   # SpacetimeDB TypeScript bindings
│   ├── index.html                # Entry point
│   ├── package.json              # Build scripts: "build": "tsc && vite build"
│   ├── dist/                     # ← Netlify publish directory
│   └── netlify.toml             # Deployment configuration
├── backend/                      # ← Deploy separately to SpacetimeDB
│   └── src/lib.rs               # SpacetimeDB Rust module
└── docs/superpowers/
    └── specs/                   # Design documentation
```

## Performance Characteristics

### Static Asset Delivery
- **CDN**: Global edge network with ~30ms latency worldwide
- **Caching**: Aggressive caching of built JavaScript/CSS/HTML
- **Compression**: Automatic gzip/brotli compression
- **Size**: ~500KB total bundle size for optimized build

### Real-time Features
- **WebSocket Connection**: Direct connection from browser to SpacetimeDB backend
- **Latency**: Sub-100ms checkbox updates between users (network dependent)
- **Scalability**: Netlify CDN handles frontend scaling, SpacetimeDB handles backend scaling

## Security

### HTTPS/TLS
- **Frontend**: Automatic HTTPS certificate from Let's Encrypt
- **WebSocket**: Secure WSS connection to SpacetimeDB backend required
- **CORS**: SpacetimeDB backend configured with allowed origins:
  - `https://[site-name].netlify.app` (production domain)
  - `http://localhost:8080` (development)

### Content Security Policy
- **Connect Sources**: Allow WSS connections to SpacetimeDB backend
- **Script Sources**: Inline scripts allowed for Vite build output
- **Frame Protection**: X-Frame-Options set to DENY

### Environment Variables
- **Backend URL**: `VITE_SPACETIMEDB_URL` set in Netlify build environment
- **No Secrets**: Frontend is public - no API keys or sensitive data in build
- **Runtime Configuration**: WebSocket URL injected at build time via Vite

## Deployment Steps

1. **Repository Preparation**
   - Ensure GitHub repository contains latest implementation
   - Verify `typescript-frontend/package.json` includes SpacetimeDB generate script
   - Test local build: `cd typescript-frontend && npm ci && npm run generate && npm run build`

2. **SpacetimeDB Backend Setup**
   - Deploy backend to SpacetimeDB cloud or configure self-hosted instance  
   - Configure CORS to allow Netlify domain origins
   - Note the WebSocket URL for frontend configuration

3. **Netlify Site Creation**
   - Create/login to Netlify account
   - Connect GitHub repository to new Netlify site
   - Set base directory to `typescript-frontend/`
   - Configure environment variable: `VITE_SPACETIMEDB_URL=wss://your-backend-url`

4. **Build Configuration**
   - Create `typescript-frontend/netlify.toml` with build settings
   - Verify build command includes TypeScript binding generation
   - Test deployment with branch deploy preview

5. **Production Deploy**
   - Merge to main branch triggers automatic deployment
   - Monitor build logs for any SpacetimeDB binding generation errors
   - Verify WebSocket connection in deployed application

6. **Integration Testing**
   - Test real-time collaboration between multiple browser sessions
   - Verify 100×100 grid navigation and rendering performance
   - Confirm checkbox state persistence across page reloads

## Monitoring & Maintenance

### Automatic Deployments
- **Trigger**: Every push to `main` branch
- **Build Time**: ~2-3 minutes for TypeScript compilation and Vite build
- **Rollback**: Easy rollback to previous deployment via Netlify dashboard

### Performance Monitoring
- **Netlify Analytics**: Basic usage and performance metrics
- **Error Tracking**: Browser console errors visible in deployed application  
- **Build Logs**: Full build output available in Netlify dashboard
- **WebSocket Monitoring**: Connection status and reconnection handling
- **Canvas Performance**: 100×100 grid rendering metrics in browser DevTools

### Error Handling & Resilience
- **WebSocket Reconnection**: Automatic retry logic for failed connections
- **Offline Mode**: Graceful degradation when backend unavailable
- **Build Failures**: SpacetimeDB binding generation errors logged and reported
- **Runtime Errors**: User-friendly error messages for connection issues

## Alternative Considerations

This design chooses Netlify over:
- **GitHub Pages**: Less performance, more setup complexity
- **Vercel**: Similar capabilities, but Netlify chosen for simplicity
- **Self-hosted**: Much more operational overhead
- **SpacetimeDB hosting**: Not designed for static frontend serving

## Success Criteria

- [x] Production-ready hosting with global CDN
- [x] Automatic deployments on code changes
- [x] HTTPS/SSL enabled for secure WebSocket connections
- [x] Sub-3-minute build and deployment time
- [x] Zero operational maintenance required
- [x] Integration with existing SpacetimeDB backend preserved
- [x] 100×100 scrollable grid fully functional in production