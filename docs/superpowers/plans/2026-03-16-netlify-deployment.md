# Netlify Deployment Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the 100×100 scrollable checkbox grid application to Netlify with production-ready configuration.

**Architecture:** Static TypeScript/Vite frontend deployed to Netlify CDN with environment-based SpacetimeDB backend configuration and automated TypeScript binding generation.

**Tech Stack:** Netlify, Vite, TypeScript, SpacetimeDB SDK, GitHub Actions integration

---

## File Structure

This plan configures existing files for production deployment:

- **Create**: `typescript-frontend/netlify.toml` - Netlify build configuration with security headers
- **Modify**: `typescript-frontend/package.json` - Add SpacetimeDB binding generation script  
- **Modify**: `typescript-frontend/src/SpacetimeDBCheckboxApp.ts:38-40` - Environment variable configuration
- **Create**: `typescript-frontend/.env.example` - Template for environment variables
- **Test**: Local build verification and deployment testing

## Chunk 1: Environment Configuration

### Task 1: Add Environment Variable Configuration

**Files:**
- Modify: `typescript-frontend/src/SpacetimeDBCheckboxApp.ts:38-40`
- Create: `typescript-frontend/.env.example`
- Test: Local build with environment variables

- [ ] **Step 1: Add environment variable for server URL in constructor**

Replace the constructor parameter with environment variable:
```typescript
constructor(serverUrl: string = import.meta.env.VITE_SPACETIMEDB_URL || 'http://localhost:3000', databaseName: string = 'checkboxes-local-demo') {
  this.SERVER_URL = serverUrl;
  this.DATABASE_NAME = databaseName;
  console.log('SpacetimeDB server URL:', this.SERVER_URL);
  // ... rest of constructor
}
```

- [ ] **Step 2: Create environment variable template**

```bash
# .env.example
# SpacetimeDB server URL for production deployment (HTTP protocol, SDK handles WebSocket upgrade)
VITE_SPACETIMEDB_URL=https://your-spacetimedb-backend.clockworklabs.io
```

- [ ] **Step 3: Test local build with environment variables**

```bash
cd typescript-frontend
echo "VITE_SPACETIMEDB_URL=http://localhost:3000" > .env.local
npm run build
```
Expected: Build succeeds, console shows environment variable

- [ ] **Step 4: Verify environment variable injection in build**

```bash
grep -r "VITE_SPACETIMEDB_URL" dist/
```
Expected: Environment variable found in built JavaScript files

- [ ] **Step 5: Commit environment configuration**

```bash
git add typescript-frontend/src/SpacetimeDBCheckboxApp.ts typescript-frontend/.env.example
git commit -m "feat: add environment variable configuration for SpacetimeDB URL"
```

### Task 2: Configure Package.json for SpacetimeDB Binding Generation

**Files:**
- Modify: `typescript-frontend/package.json:11`
- Test: Binding generation verification

- [ ] **Step 1: Verify SpacetimeDB CLI installation**

```bash
which spacetime || echo "SpacetimeDB CLI not found - install from https://spacetimedb.com"
spacetime version
```
Expected: CLI version displayed, or installation instructions

- [ ] **Step 2: Check existing generate script in package.json**

```bash
cd typescript-frontend
grep -A1 -B1 '"generate"' package.json
```
Expected: Shows current generate script configuration

- [ ] **Step 3: Verify SpacetimeDB module path exists**

```bash
ls -la ../backend/src/lib.rs
```
Expected: SpacetimeDB module file found

- [ ] **Step 4: Test binding generation locally**

```bash
cd typescript-frontend
npm run generate
```
Expected: TypeScript bindings created in `src/generated/`

- [ ] **Step 5: Verify generated bindings exist**

```bash
ls -la src/generated/
cat src/generated/index.ts | head -10
```
Expected: TypeScript interface files with SpacetimeDB imports

## Chunk 2: Netlify Configuration

### Task 3: Create Netlify Build Configuration

**Files:**
- Create: `typescript-frontend/netlify.toml`
- Test: Build configuration validation

- [ ] **Step 1: Create netlify.toml with build settings**

```toml
[build]
  base = "typescript-frontend/"
  command = "npm ci && npm run generate && npm run build"
  publish = "dist/"

[build.environment]
  NODE_VERSION = "18"
  VITE_SPACETIMEDB_URL = "https://your-spacetimedb-backend.clockworklabs.io"

[[headers]]
  for = "/*"
  [headers.values]
    Content-Security-Policy = "default-src 'self'; connect-src 'self' wss: ws:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    X-XSS-Protection = "1; mode=block"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

- [ ] **Step 2: Install dependencies**

```bash
cd typescript-frontend
npm ci
```
Expected: All packages installed successfully

- [ ] **Step 3: Generate SpacetimeDB bindings**

```bash
npm run generate
```
Expected: TypeScript bindings created in src/generated/

- [ ] **Step 4: Run TypeScript compilation**

```bash
npm run build
```
Expected: Complete build with no TypeScript errors

- [ ] **Step 5: Verify build output structure**

Check dist directory:
```bash
ls -la typescript-frontend/dist/
```
Expected: index.html, assets/ directory with JS/CSS files

- [ ] **Step 6: Commit Netlify configuration**

```bash
git add typescript-frontend/netlify.toml
git commit -m "feat: add Netlify build configuration with security headers"
```

### Task 4: Add Error Handling for WebSocket Connection

**Files:**
- Modify: `typescript-frontend/src/SpacetimeDBCheckboxApp.ts:141-147`
- Test: Connection error handling verification

- [ ] **Step 1: Add connection error callback to builder**

Replace the existing onConnectError callback:
```typescript
.onConnectError((_ctx, error) => {
  console.error('❌ SpacetimeDB connection error:', error);
  this.showConnectionError('Failed to connect to backend. Please check your internet connection.');
})
```

- [ ] **Step 2: Add connection error UI method**

Add after the constructor method:
```typescript
private showConnectionError(message: string): void {
  const errorDiv = document.createElement('div');
  errorDiv.style.cssText = 'position:fixed;top:20px;right:20px;background:#ff4444;color:white;padding:15px;border-radius:5px;z-index:9999;max-width:300px;';
  errorDiv.textContent = message;
  document.body.appendChild(errorDiv);
  
  // Auto-remove after 10 seconds
  setTimeout(() => {
    if (errorDiv.parentNode) {
      errorDiv.parentNode.removeChild(errorDiv);
    }
  }, 10000);
}
```

- [ ] **Step 3: Add subscription error handling**

Update the subscription onError callback:
```typescript
.onError((ctx) => {
  console.error('❌ Subscription error:', ctx.event);
  this.showConnectionError('Lost connection to backend. Attempting to reconnect...');
})
```

- [ ] **Step 4: Test error handling locally**

Test with invalid server URL:
```bash
echo "VITE_SPACETIMEDB_URL=http://invalid-backend-url" > .env.local
npm run dev
```
Expected: Error UI displayed in browser

- [ ] **Step 5: Reset to valid local URL and commit**

```bash
echo "VITE_SPACETIMEDB_URL=http://localhost:3000" > .env.local
git add typescript-frontend/src/SpacetimeDBCheckboxApp.ts
git commit -m "feat: add WebSocket connection error handling and user feedback"
```

## Chunk 3: Testing and GitHub Integration

### Task 5: Local Production Build Testing

**Files:**
- Test: Full production build verification

- [ ] **Step 1: Clean build environment**

```bash
cd typescript-frontend
rm -rf node_modules dist .env.local
```

- [ ] **Step 2: Fresh dependency installation**

```bash
npm ci
```
Expected: Clean package installation

- [ ] **Step 3: Test TypeScript binding generation**

```bash
npm run generate
```
Expected: Bindings created in `src/generated/` directory

- [ ] **Step 4: Test production build**

```bash
npm run build
```
Expected: Clean build with no TypeScript errors

- [ ] **Step 5: Test production preview**

```bash
npm run preview
```
Expected: Application loads on http://localhost:4173 with production build

### Task 6: Push to GitHub Repository

**Files:**
- Test: GitHub repository setup and push

- [ ] **Step 1: Verify all changes are committed**

```bash
git status
```
Expected: "working tree clean" or only untracked files

- [ ] **Step 2: Push to GitHub repository**

```bash
git push -u origin main
```
Expected: All commits pushed to GitHub repository

- [ ] **Step 3: Verify GitHub repository structure**

Check that these files exist in GitHub web interface:
- `typescript-frontend/netlify.toml`
- `typescript-frontend/.env.example` 
- Updated `typescript-frontend/src/SpacetimeDBCheckboxApp.ts`

- [ ] **Step 4: Create GitHub release tag**

```bash
git tag -a v1.0.0 -m "Production-ready 100x100 scrollable checkbox grid"
git push origin v1.0.0
```

### Task 7: Functional Testing Verification

**Files:**
- Test: 100×100 grid functionality verification

- [ ] **Step 1: Open production preview in browser**

```bash
npm run preview
# Open http://localhost:4173 in browser
```

- [ ] **Step 2: Verify grid rendering**

Manual checklist:
- Grid displays 100×100 checkboxes (10,000 total)
- Initial viewport shows partial grid (800×600 window)
- Canvas shows 3200×3200px scrollable area

- [ ] **Step 3: Test arrow key navigation**

Manual checklist:
- Arrow keys move viewport smoothly
- Navigation stays within grid bounds
- Console shows viewport position updates

- [ ] **Step 4: Test memory usage**

```bash
# In browser DevTools → Performance tab
# Check memory usage is reasonable (~50MB or less)
```

- [ ] **Step 5: Verify environment configuration**

Check browser console output:
- SpacetimeDB server URL logged correctly
- No environment variable errors

## Deployment Instructions

After plan completion:

1. **GitHub Repository**: Ensure all code is pushed to GitHub
2. **Netlify Account**: Sign up at netlify.com
3. **Connect Repository**: Create new site from GitHub repository
4. **Configure Build**: 
   - Base directory: `typescript-frontend`
   - Build command: `npm ci && npm run generate && npm run build`
   - Publish directory: `typescript-frontend/dist`
5. **Environment Variables**: Set `VITE_SPACETIMEDB_URL` in Netlify dashboard
6. **Deploy**: Push to main branch triggers automatic deployment

## Success Criteria

- [ ] GitHub repository updated with all deployment configuration
- [ ] Local production build succeeds with no errors
- [ ] Environment variable configuration working
- [ ] TypeScript binding generation integrated
- [ ] WebSocket error handling implemented
- [ ] Security headers configured in Netlify
- [ ] 100×100 grid fully functional in production build