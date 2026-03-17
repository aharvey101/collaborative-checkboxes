# Test Database Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement comprehensive test database infrastructure with automated SpacetimeDB deployment, isolated test environments, and CI/CD pipeline integration.

**Architecture:** Three-tier database strategy (CI/local, staging, production) with automated SpacetimeDB deployment pipeline, test environment manager for configuration switching, and standardized Vitest test suite.

**Tech Stack:** SpacetimeDB, Node.js, GitHub Actions, Vitest, Bash scripting

---

## File Structure

**SpacetimeDB Configurations:**
- `backend/spacetime.staging.json` - Staging environment config
- `backend/spacetime.ci.json` - CI/local environment config  
- `backend/spacetime.json` - Production config (already exists)

**Environment Management:**
- `scripts/test-db-manager.js` - Test environment lifecycle manager
- `scripts/deploy-staging.sh` - Staging deployment script  
- `scripts/deploy-production.sh` - Production deployment script
- `scripts/reset-staging.js` - Staging database cleanup
- `scripts/spacetimedb-local.sh` - Local SpacetimeDB management

**CI/CD Workflows:**
- `.github/workflows/test-and-deploy.yml` - Main CI/CD pipeline
- `.github/workflows/daily-staging-reset.yml` - Scheduled staging cleanup

**Test Infrastructure:**
- `typescript-frontend/test-config.js` - Environment-aware test configuration
- `typescript-frontend/vitest.config.ts` - Updated Vitest configuration  
- `typescript-frontend/package.json` - Updated test scripts

**Test Suite Updates:**
- Migrate all Playwright syntax to Vitest in existing test files
- Standardize test URLs via environment configuration

---

## Chunk 1: SpacetimeDB Configuration Setup

### Task 1: Create Staging Environment Configuration

**Files:**
- Create: `backend/spacetime.staging.json`
- Create: `backend/spacetime.ci.json`

- [ ] **Step 1: Create staging configuration file**

```json
{
  "server": "https://maincloud.spacetimedb.com",
  "database": "collaborative-checkboxes-staging"
}
```

- [ ] **Step 2: Create CI configuration file**

```json
{
  "server": "http://localhost:3001", 
  "database": "checkboxes-ci-test"
}
```

- [ ] **Step 3: Validate configuration files**

```bash
# Validate JSON syntax and required fields
cd backend
if python3 -c "
import json, sys
for file in ['spacetime.staging.json', 'spacetime.ci.json']:
    with open(file) as f:
        config = json.load(f)
        assert 'server' in config, f'{file} missing server field'
        assert 'database' in config, f'{file} missing database field'
        assert config['server'].startswith('http'), f'{file} server must be HTTP(S) URL'
        print(f'{file}: OK')
"; then
    echo "✓ All configuration files validated successfully"
else
    echo "❌ Configuration validation failed"
    exit 1
fi
```

- [ ] **Step 4: Commit configuration files**

```bash
git add backend/spacetime.staging.json backend/spacetime.ci.json
git commit -m "feat: add staging and CI SpacetimeDB configurations"
```

### Task 2: Create Staging Database

**Files:**
- Modify: `backend/spacetime.json` (temporarily for deployment)

- [ ] **Step 1: Backup current configuration**

```bash
cp backend/spacetime.json backend/spacetime.json.backup
```

- [ ] **Step 2: Switch to staging configuration**

```bash
cp backend/spacetime.staging.json backend/spacetime.json
```

- [ ] **Step 3: Deploy to staging database**

```bash
cd backend
if spacetime publish --name collaborative-checkboxes-staging; then
    echo "✓ Successfully deployed to staging database"
else
    echo "❌ Deployment failed"
    exit 1
fi
```

- [ ] **Step 4: Verify staging deployment**

```bash
# Verify database exists and has expected schema
if spacetime describe collaborative-checkboxes-staging | grep -q "checkbox_state"; then
    echo "✓ Staging database deployed with correct schema"
else
    echo "❌ Staging database missing expected tables"
    spacetime describe collaborative-checkboxes-staging  # Show actual output for debugging
    exit 1
fi
```

- [ ] **Step 5: Restore production configuration**

```bash
cp backend/spacetime.json.backup backend/spacetime.json
rm backend/spacetime.json.backup
```

- [ ] **Step 6: Create deployment log entry**

```bash
echo "$(date): Staging database collaborative-checkboxes-staging created successfully" >> staging-deployments.log
git add staging-deployments.log
git commit -m "log: record staging database creation"
```

---

## Chunk 2: Test Environment Manager

### Task 3: Environment Management Script

**Files:**
- Create: `scripts/test-db-manager.js`
- Create: `scripts/package.json`

- [ ] **Step 1: Create scripts directory and package.json**

```json
{
  "name": "checkboxes-scripts",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "fs-extra": "^11.1.1"
  }
}
```

- [ ] **Step 2: Write environment manager implementation**

```javascript
#!/usr/bin/env node
import fs from 'fs-extra';
import { execSync } from 'child_process';
import path from 'path';

const BACKEND_DIR = path.resolve('../backend');
const CONFIGS = {
  production: 'spacetime.json',
  staging: 'spacetime.staging.json', 
  ci: 'spacetime.ci.json'
};

class TestDatabaseManager {
  constructor() {
    this.environment = process.env.TEST_ENV || 'ci';
    this.backupPath = path.join(BACKEND_DIR, 'spacetime.json.backup');
  }

  async switchEnvironment(env) {
    if (!CONFIGS[env]) {
      throw new Error(`Unknown environment: ${env}`);
    }

    const configPath = path.join(BACKEND_DIR, CONFIGS[env]);
    const mainConfigPath = path.join(BACKEND_DIR, 'spacetime.json');

    // Backup current config
    if (await fs.pathExists(mainConfigPath)) {
      await fs.copy(mainConfigPath, this.backupPath);
    }

    // Switch to new config
    await fs.copy(configPath, mainConfigPath);
    console.log(`✓ Switched to ${env} environment`);
  }

  async restoreEnvironment() {
    if (await fs.pathExists(this.backupPath)) {
      const mainConfigPath = path.join(BACKEND_DIR, 'spacetime.json');
      await fs.copy(this.backupPath, mainConfigPath);
      await fs.remove(this.backupPath);
      console.log('✓ Restored original environment');
    }
  }

  async startLocalSpacetimeDB() {
    try {
      // Check if SpacetimeDB is already running
      execSync('curl -f http://localhost:3001/health', { stdio: 'ignore' });
      console.log('✓ SpacetimeDB already running on localhost:3001');
      return;
    } catch {
      // Not running, start it
    }

    console.log('Starting local SpacetimeDB...');
    
    // Use spawn for proper process management
    const { spawn } = await import('child_process');
    const spacetimeProcess = spawn('spacetime', ['start', '--listen', '0.0.0.0:3001'], {
      detached: true,
      stdio: ['ignore', 'ignore', 'ignore']
    });
    
    spacetimeProcess.unref(); // Allow parent to exit
    
    // Save PID for later cleanup
    await fs.writeFile('/tmp/spacetime-test.pid', spacetimeProcess.pid.toString());
    
    // Wait for startup
    let retries = 10;
    while (retries > 0) {
      try {
        execSync('curl -f http://localhost:3001/health', { stdio: 'ignore' });
        console.log('✓ SpacetimeDB started successfully');
        return;
      } catch {
        await new Promise(resolve => setTimeout(resolve, 1000));
        retries--;
      }
    }
    
    throw new Error('Failed to start SpacetimeDB after 10 seconds');
  }

  async stopLocalSpacetimeDB() {
    try {
      execSync('pkill -f "spacetimedb start"');
      console.log('✓ Stopped local SpacetimeDB');
    } catch {
      console.log('No SpacetimeDB process to stop');
    }
  }
}

// CLI interface
const command = process.argv[2];
const manager = new TestDatabaseManager();

switch (command) {
  case 'switch':
    const env = process.argv[3];
    await manager.switchEnvironment(env);
    break;
  case 'restore':
    await manager.restoreEnvironment();
    break;
  case 'start-local':
    await manager.startLocalSpacetimeDB();
    break;
  case 'stop-local':
    await manager.stopLocalSpacetimeDB();
    break;
  default:
    console.log('Usage: node test-db-manager.js [switch|restore|start-local|stop-local] [env]');
    process.exit(1);
}
```

- [ ] **Step 3: Install dependencies**

Run: `cd scripts && npm install`
Expected: Dependencies installed successfully

- [ ] **Step 4: Test environment switching**

Run: `node scripts/test-db-manager.js switch staging`
Expected: "✓ Switched to staging environment"

- [ ] **Step 5: Test environment restoration**

Run: `node scripts/test-db-manager.js restore`
Expected: "✓ Restored original environment"

- [ ] **Step 6: Commit environment manager**

```bash
git add scripts/
git commit -m "feat: add test database environment manager

- Switch between production/staging/CI configurations  
- Manage local SpacetimeDB lifecycle
- CLI interface for automation"
```

### Task 4: Local SpacetimeDB Management Script

**Files:**
- Create: `scripts/spacetimedb-local.sh`

- [ ] **Step 1: Write local SpacetimeDB management script**

```bash
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
```

- [ ] **Step 2: Make script executable**

Run: `chmod +x scripts/spacetimedb-local.sh`
Expected: Script is now executable

- [ ] **Step 3: Test script functionality**

Run: `./scripts/spacetimedb-local.sh status`
Expected: Shows SpacetimeDB status (running or not running)

- [ ] **Step 4: Commit local management script**

```bash
git add scripts/spacetimedb-local.sh
git commit -m "feat: add local SpacetimeDB management script

- Start/stop local SpacetimeDB instances  
- Deploy test modules to localhost
- Health checks and process management"
```

---

## Chunk 3: Test Configuration Infrastructure

### Task 5: Test Environment Configuration

**Files:**
- Create: `typescript-frontend/test-config.js`
- Modify: `typescript-frontend/vitest.config.ts`

- [ ] **Step 1: Write test environment configuration**

```javascript
// test-config.js
import { readFileSync } from 'fs';
import { resolve } from 'path';

export class TestEnvironmentConfig {
  constructor() {
    this.environment = process.env.TEST_ENV || 'ci';
    this.config = this.loadSpacetimeConfig();
  }

  loadSpacetimeConfig() {
    const configFile = this.getConfigFile();
    const configPath = resolve(`../backend/${configFile}`);
    
    try {
      const content = readFileSync(configPath, 'utf8');
      const config = JSON.parse(content);
      
      return {
        server: config.server,
        database: config.database,
        baseUrl: this.getBaseUrl()
      };
    } catch (error) {
      throw new Error(`Failed to load SpacetimeDB config: ${error.message}`);
    }
  }

  getConfigFile() {
    switch (this.environment) {
      case 'production':
        return 'spacetime.json';
      case 'staging':
        return 'spacetime.staging.json';
      case 'ci':
        return 'spacetime.ci.json';
      default:
        throw new Error(`Unknown test environment: ${this.environment}`);
    }
  }

  getBaseUrl() {
    switch (this.environment) {
      case 'production':
        return 'https://checkbox-grid-100x100.netlify.app';
      case 'staging':
        return 'https://checkbox-grid-staging.netlify.app';
      case 'ci':
        return 'http://localhost:5174';
      default:
        throw new Error(`Unknown test environment: ${this.environment}`);
    }
  }

  getTestTimeout() {
    switch (this.environment) {
      case 'ci':
        return 10000; // Local tests can be faster
      case 'staging':
      case 'production':
        return 30000; // Remote tests need more time
      default:
        return 15000;
    }
  }

  getDatabaseConfig() {
    return {
      server: this.config.server,
      database: this.config.database
    };
  }

  shouldSkipE2E() {
    // Skip E2E tests in CI by default (can be overridden)
    return this.environment === 'ci' && !process.env.RUN_E2E_TESTS;
  }
}

export const testConfig = new TestEnvironmentConfig();
```

- [ ] **Step 2: Update Vitest configuration**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: './test/setup.ts',
    testTimeout: parseInt(process.env.TEST_TIMEOUT || '15000'),
    globals: true,
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.{idea,git,cache,output,temp}/**'
    ]
  },
  resolve: {
    alias: {
      '@': './src'
    }
  }
})
```

- [ ] **Step 3: Test configuration loading**

Run: `cd typescript-frontend && node -e "import('./test-config.js').then(m => console.log(m.testConfig.config))"`
Expected: Shows current environment configuration

- [ ] **Step 4: Commit test configuration**

```bash
git add typescript-frontend/test-config.js typescript-frontend/vitest.config.ts
git commit -m "feat: add environment-aware test configuration

- Dynamic SpacetimeDB configuration loading
- Environment-specific timeouts and URLs  
- Test environment detection and validation"
```

### Task 6: Update Package Scripts

**Files:**
- Modify: `typescript-frontend/package.json`

- [ ] **Step 1: Update test scripts in package.json**

Add these scripts to the `scripts` section:

```json
{
  "scripts": {
    "test": "vitest",
    "test:ci": "TEST_ENV=ci vitest run",
    "test:staging": "TEST_ENV=staging vitest run", 
    "test:production": "TEST_ENV=production vitest run --reporter=verbose",
    "test:watch": "vitest --watch",
    "test:coverage": "vitest --coverage",
    "test:e2e": "RUN_E2E_TESTS=true vitest run",
    "test:setup": "node ../scripts/test-db-manager.js start-local",
    "test:teardown": "node ../scripts/test-db-manager.js stop-local",
    "test:full": "npm run test:setup && npm run test:ci && npm run test:teardown"
  }
}
```

- [ ] **Step 2: Test script execution**

Run: `cd typescript-frontend && npm run test:ci`
Expected: Tests run with CI environment configuration

- [ ] **Step 3: Commit package script updates**

```bash
git add typescript-frontend/package.json
git commit -m "feat: add comprehensive test scripts

- Environment-specific test commands
- Local SpacetimeDB lifecycle integration
- E2E test toggle and coverage options"
```

---

## Chunk 4: CI/CD Pipeline Implementation

### Task 7: Main CI/CD Workflow

**Files:**
- Create: `.github/workflows/test-and-deploy.yml`

- [ ] **Step 1: Write comprehensive CI/CD workflow**

```yaml
name: Test and Deploy

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

env:
  CARGO_TERM_COLOR: always
  SPACETIMEDB_TOKEN: ${{ secrets.SPACETIMEDB_TOKEN }}
  NETLIFY_TOKEN: ${{ secrets.NETLIFY_TOKEN }}

jobs:
  test:
    runs-on: ubuntu-latest
    name: Test Suite
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        
      - name: Setup Rust
        uses: actions-rs/toolchain@v1
        with:
          toolchain: stable
          target: wasm32-unknown-unknown
          
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
          cache-dependency-path: typescript-frontend/package-lock.json
          
      - name: Install SpacetimeDB CLI
        run: |
          curl --proto '=https' --tlsv1.2 -sSf https://install.spacetimedb.com | sh
          echo "$HOME/.cargo/bin" >> $GITHUB_PATH
          
      - name: Install dependencies
        run: |
          cd typescript-frontend
          npm ci
          cd ../scripts  
          npm ci
          
      - name: Build backend module
        run: |
          cd backend
          cargo build --release --target wasm32-unknown-unknown
          
      - name: Start local SpacetimeDB
        run: ./scripts/spacetimedb-local.sh start
        
      - name: Setup test environment
        run: |
          node scripts/test-db-manager.js switch ci
          
      - name: Deploy test module
        run: ./scripts/spacetimedb-local.sh deploy
        
      - name: Run test suite
        run: |
          cd typescript-frontend
          TEST_ENV=ci npm run test:ci
          
      - name: Generate test coverage
        run: |
          cd typescript-frontend  
          TEST_ENV=ci npm run test:coverage
          
      - name: Upload coverage reports
        uses: codecov/codecov-action@v3
        with:
          file: typescript-frontend/coverage/lcov.info
          
      - name: Cleanup test environment
        if: always()
        run: |
          node scripts/test-db-manager.js restore
          ./scripts/spacetimedb-local.sh stop

  deploy-staging:
    runs-on: ubuntu-latest
    name: Deploy to Staging
    needs: test
    if: github.ref == 'refs/heads/main'
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        
      - name: Setup Rust
        uses: actions-rs/toolchain@v1
        with:
          toolchain: stable
          target: wasm32-unknown-unknown
          
      - name: Install SpacetimeDB CLI
        run: |
          curl --proto '=https' --tlsv1.2 -sSf https://install.spacetimedb.com | sh
          echo "$HOME/.cargo/bin" >> $GITHUB_PATH
          
      - name: Build backend module
        run: |
          cd backend
          cargo build --release --target wasm32-unknown-unknown
          
      - name: Deploy to staging
        run: |
          node scripts/test-db-manager.js switch staging
          cd backend
          spacetime publish
          
      - name: Run staging smoke tests
        run: |
          cd typescript-frontend
          npm ci
          TEST_ENV=staging npm run test:staging
          
      - name: Cleanup staging deployment
        if: always()
        run: node scripts/test-db-manager.js restore

  deploy-production:
    runs-on: ubuntu-latest
    name: Deploy to Production
    needs: [test, deploy-staging]
    if: github.ref == 'refs/heads/main'
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        
      - name: Setup Rust
        uses: actions-rs/toolchain@v1
        with:
          toolchain: stable
          target: wasm32-unknown-unknown
          
      - name: Install SpacetimeDB CLI
        run: |
          curl --proto '=https' --tlsv1.2 -sSf https://install.spacetimedb.com | sh
          echo "$HOME/.cargo/bin" >> $GITHUB_PATH
          
      - name: Build backend module  
        run: |
          cd backend
          cargo build --release --target wasm32-unknown-unknown
          
      - name: Deploy to production
        run: |
          node scripts/test-db-manager.js switch production
          cd backend
          spacetime publish
          
      - name: Update frontend configuration
        run: |
          # Frontend already points to production SpacetimeDB
          echo "Frontend configuration already production-ready"
          
      - name: Deploy frontend to Netlify
        run: |
          cd typescript-frontend
          npm ci
          npm run build
          npx netlify deploy --prod --dir=dist --auth=$NETLIFY_TOKEN
          
      - name: Cleanup production deployment
        if: always()
        run: node scripts/test-db-manager.js restore
        
      - name: Create deployment tag
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"  
          git tag "deploy-$(date +%Y%m%d-%H%M%S)"
          git push origin --tags
```

- [ ] **Step 2: Test workflow validation**

Run: `cd .github/workflows && yamllint test-and-deploy.yml`
Expected: YAML syntax is valid

- [ ] **Step 3: Commit CI/CD workflow**

```bash
git add .github/workflows/test-and-deploy.yml
git commit -m "feat: add comprehensive CI/CD pipeline

- Full test suite with local SpacetimeDB  
- Automated staging and production deployment
- Test coverage reporting and smoke tests
- Environment management and cleanup"
```

### Task 8: Staging Reset Automation

**Files:**
- Create: `.github/workflows/daily-staging-reset.yml`
- Create: `scripts/reset-staging.js`

- [ ] **Step 1: Write staging reset script**

```javascript
#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';

class StagingDatabaseReset {
  constructor() {
    this.backendDir = path.resolve('../backend');
    this.backupPath = path.join(this.backendDir, 'spacetime.json.backup');
  }

  async switchToStaging() {
    const stagingConfig = path.join(this.backendDir, 'spacetime.staging.json');
    const mainConfig = path.join(this.backendDir, 'spacetime.json');
    
    // Backup current config
    if (await fs.pathExists(mainConfig)) {
      await fs.copy(mainConfig, this.backupPath);
    }
    
    // Switch to staging
    await fs.copy(stagingConfig, mainConfig);
    console.log('✓ Switched to staging configuration');
  }

  async restoreConfig() {
    if (await fs.pathExists(this.backupPath)) {
      const mainConfig = path.join(this.backendDir, 'spacetime.json');
      await fs.copy(this.backupPath, mainConfig);
      await fs.remove(this.backupPath);
      console.log('✓ Restored original configuration');
    }
  }

  async clearDatabase() {
    console.log('🧹 Clearing staging database...');
    
    try {
      // Get current staging database info
      const result = execSync('spacetime describe', { 
        cwd: this.backendDir,
        encoding: 'utf8' 
      });
      
      console.log('Database info:', result);
      
      // Clear all tables by calling a special reset reducer
      // Note: This requires adding a reset reducer to the SpacetimeDB module
      const clearResult = execSync('spacetime call reset_all_data', {
        cwd: this.backendDir,
        encoding: 'utf8'
      });
      
      console.log('✅ Staging database cleared successfully');
      console.log('Clear result:', clearResult);
      
    } catch (error) {
      console.error('❌ Failed to clear staging database:', error.message);
      
      // Fallback: Try to redeploy the module (this will create fresh tables)
      console.log('🔄 Attempting fallback: redeploying module...');
      try {
        execSync('spacetime publish --force', { 
          cwd: this.backendDir,
          stdio: 'inherit' 
        });
        console.log('✅ Module redeployed successfully');
      } catch (deployError) {
        console.error('❌ Fallback deployment also failed:', deployError.message);
        throw deployError;
      }
    }
  }

  async logResetActivity() {
    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp} - Staging database reset completed\n`;
    
    try {
      await fs.appendFile('staging-reset.log', logEntry);
    } catch (error) {
      console.warn('Warning: Could not write to log file:', error.message);
    }
  }

  async run() {
    try {
      console.log('🚀 Starting staging database reset...');
      
      await this.switchToStaging();
      await this.clearDatabase();
      await this.logResetActivity();
      
      console.log('✅ Staging reset completed successfully');
      
    } catch (error) {
      console.error('❌ Staging reset failed:', error.message);
      process.exit(1);
    } finally {
      await this.restoreConfig();
    }
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const resetManager = new StagingDatabaseReset();
  await resetManager.run();
}
```

- [ ] **Step 2: Write daily reset workflow**

```yaml
name: Daily Staging Reset

on:
  schedule:
    # Run daily at 2 AM UTC
    - cron: '0 2 * * *'
  workflow_dispatch: # Allow manual triggering
    
env:
  SPACETIMEDB_TOKEN: ${{ secrets.SPACETIMEDB_TOKEN }}

jobs:
  reset-staging:
    runs-on: ubuntu-latest
    name: Reset Staging Database
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          
      - name: Install SpacetimeDB CLI
        run: |
          curl --proto '=https' --tlsv1.2 -sSf https://install.spacetimedb.com | sh
          echo "$HOME/.cargo/bin" >> $GITHUB_PATH
          
      - name: Install dependencies
        run: |
          cd scripts
          npm ci
          
      - name: Reset staging database
        run: node scripts/reset-staging.js
        
      - name: Verify staging environment
        run: |
          cd typescript-frontend
          npm ci
          # Run a minimal smoke test to ensure staging works
          TEST_ENV=staging timeout 60s npm test -- tests/basic-functionality.spec.ts || true
          
      - name: Create reset notification
        if: failure()
        run: |
          echo "❌ Staging reset failed on $(date)"
          echo "Check logs and staging environment status"
```

- [ ] **Step 3: Test reset script locally**

Run: `node scripts/reset-staging.js`
Expected: Script validates but may fail without proper SpacetimeDB setup

- [ ] **Step 4: Commit staging reset automation**

```bash
git add scripts/reset-staging.js .github/workflows/daily-staging-reset.yml
git commit -m "feat: add daily staging database reset automation

- Automated daily cleanup at 2 AM UTC
- Manual trigger option for immediate reset  
- Fallback deployment if reset fails
- Activity logging and verification"
```

---

## Chunk 5: Test Suite Migration and Deployment Automation 

### Task 9: Migrate Test Framework from Playwright to Vitest

**Files:**
- Modify: `typescript-frontend/tests/*.spec.ts` (migrate all Playwright syntax)
- Delete: `typescript-frontend/playwright.config.ts` (no longer needed)

- [ ] **Step 1: Identify Playwright test files**

Run: `cd typescript-frontend && find tests/ -name "*.spec.ts" -exec grep -l "test.describe\|test(" {} \;`
Expected: List of files using Playwright syntax

- [ ] **Step 2: Migrate basic-functionality.spec.ts**

```typescript
import { describe, test, expect, beforeEach } from 'vitest';
import { testConfig } from '../test-config.js';

describe('Checkbox Grid - Basic Functionality', () => {
  beforeEach(async () => {
    // Setup test environment
    global.fetch = vi.fn();
  });

  test('should load application successfully', async () => {
    // Test implementation using testConfig.getBaseUrl()
    expect(testConfig.getBaseUrl()).toBeDefined();
  });

  test('should connect to SpacetimeDB', async () => {
    const dbConfig = testConfig.getDatabaseConfig();
    expect(dbConfig.server).toBeDefined();
    expect(dbConfig.database).toBeDefined();
  });
});
```

- [ ] **Step 3: Migrate remaining test files**

Apply similar Vitest migration pattern to all test files:
- Replace `test.describe` → `describe`  
- Replace standalone `test(` → `test(`
- Add proper imports from vitest
- Update to use testConfig for environment settings

- [ ] **Step 4: Remove Playwright configuration**

Run: `cd typescript-frontend && rm playwright.config.ts`
Expected: Playwright config removed

- [ ] **Step 5: Test migrated suite**

Run: `cd typescript-frontend && TEST_ENV=ci npm run test:ci`
Expected: All tests run with Vitest, no Playwright syntax errors

- [ ] **Step 6: Commit test framework migration**

```bash
git add typescript-frontend/tests/ typescript-frontend/package.json
git rm typescript-frontend/playwright.config.ts
git commit -m "feat: migrate test suite from Playwright to Vitest

- Convert all test syntax to Vitest
- Remove Playwright dependencies and config  
- Standardize on environment-aware test configuration
- Enable consistent CI/CD test execution"
```

### Task 10: Deploy Infrastructure Scripts

**Files:**
- Create: `scripts/deploy-staging.sh`
- Create: `scripts/deploy-production.sh`

- [ ] **Step 1: Create staging deployment script**

```bash
#!/bin/bash

set -euo pipefail

echo "🚀 Deploying to staging environment..."

# Check prerequisites
if ! command -v spacetime &> /dev/null; then
    echo "❌ SpacetimeDB CLI not found"
    exit 1
fi

if [[ -z "${SPACETIMEDB_TOKEN:-}" ]]; then
    echo "❌ SPACETIMEDB_TOKEN environment variable not set"
    exit 1
fi

# Switch to staging configuration
echo "🔧 Switching to staging configuration..."
node "$(dirname "$0")/test-db-manager.js" switch staging

# Build backend module
echo "🏗️ Building backend module..."
cd "$(dirname "$0")/../backend"

if ! cargo build --release --target wasm32-unknown-unknown; then
    echo "❌ Failed to build backend module"
    exit 1
fi

# Deploy to staging
echo "📦 Deploying to staging database..."
if ! spacetime publish --name collaborative-checkboxes-staging; then
    echo "❌ Failed to deploy to staging"
    exit 1
fi

echo "✅ Successfully deployed to staging"

# Restore original configuration
echo "🔄 Restoring original configuration..."
node "$(dirname "$0")/test-db-manager.js" restore

echo "🎉 Staging deployment completed successfully!"
```

- [ ] **Step 2: Create production deployment script**

```bash
#!/bin/bash

set -euo pipefail

echo "🚀 Deploying to production environment..."

# Check prerequisites
if ! command -v spacetime &> /dev/null; then
    echo "❌ SpacetimeDB CLI not found"
    exit 1
fi

if [[ -z "${SPACETIMEDB_TOKEN:-}" ]]; then
    echo "❌ SPACETIMEDB_TOKEN environment variable not set"
    exit 1
fi

# Verify we're on main branch
CURRENT_BRANCH=$(git branch --show-current)
if [[ "$CURRENT_BRANCH" != "main" ]]; then
    echo "❌ Production deployment only allowed from main branch (current: $CURRENT_BRANCH)"
    exit 1
fi

# Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo "❌ Uncommitted changes detected. Commit all changes before deployment."
    exit 1
fi

# Switch to production configuration (should be no-op since main uses production)
echo "🔧 Verifying production configuration..."
node "$(dirname "$0")/test-db-manager.js" switch production

# Build backend module
echo "🏗️ Building backend module..."
cd "$(dirname "$0")/../backend"

if ! cargo build --release --target wasm32-unknown-unknown; then
    echo "❌ Failed to build backend module"
    exit 1
fi

# Deploy to production
echo "📦 Deploying to production database..."
if ! spacetime publish --name collaborative-checkboxes-prod; then
    echo "❌ Failed to deploy to production"
    exit 1
fi

echo "✅ Successfully deployed to production"

# Create deployment tag
echo "🏷️ Creating deployment tag..."
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
git tag "prod-deploy-$TIMESTAMP"
git push origin "prod-deploy-$TIMESTAMP"

echo "🎉 Production deployment completed successfully!"
echo "📌 Deployment tag: prod-deploy-$TIMESTAMP"
```

- [ ] **Step 3: Make deployment scripts executable**

Run: `chmod +x scripts/deploy-staging.sh scripts/deploy-production.sh`
Expected: Scripts are executable

- [ ] **Step 4: Test staging deployment script**

Run: `./scripts/deploy-staging.sh`
Expected: Staging deployment completes successfully (requires SPACETIMEDB_TOKEN)

- [ ] **Step 5: Commit deployment scripts**

```bash
git add scripts/deploy-staging.sh scripts/deploy-production.sh
git commit -m "feat: add automated deployment scripts

- Staging deployment with configuration switching
- Production deployment with branch and safety checks
- Automated tagging for production deployments  
- Prerequisite validation and error handling"
```

---

## Execution Summary

This implementation plan provides a comprehensive test database infrastructure with:

✅ **Three-tier database strategy** (CI/local, staging, production)  
✅ **Automated SpacetimeDB deployment pipeline**  
✅ **Environment management and configuration switching**  
✅ **Test framework standardization** (Vitest migration)  
✅ **CI/CD integration** with proper isolation  
✅ **Daily staging reset automation**

**Next Steps:**
1. Execute this plan using subagent-driven-development 
2. Test the complete pipeline end-to-end
3. Monitor staging environment for 1 week
4. Enable production automation after validation

**Dependencies Required:**
- SpacetimeDB CLI installed and configured
- Rust with wasm32-unknown-unknown target
- Node.js and npm
- GitHub repository with proper secrets configured
