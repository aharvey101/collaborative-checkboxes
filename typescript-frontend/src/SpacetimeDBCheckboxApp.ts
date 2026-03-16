import { DbConnection, type SubscriptionHandle } from './generated/index.js';
import { MemoryManager, type RenderStrategy } from './MemoryManager.js';
import { ViewportManager } from './ViewportManager.js';
import { CanvasRenderer } from './CanvasRenderer.js';
import { NavigationController } from './NavigationController.js';

interface CheckboxState {
  checked: boolean;
}

export class SpacetimeDBCheckboxApp {
  private connection: DbConnection | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private subscription: SubscriptionHandle | null = null;
  private checkboxStates: Map<string, CheckboxState> = new Map();
  private chunkData: Map<number, Uint8Array> = new Map();
  
  // Large canvas components
  private memoryManager: MemoryManager;
  private viewportManager: ViewportManager | null = null;
  private canvasRenderer: CanvasRenderer | null = null;
  private navigationController: NavigationController | null = null;
  private renderStrategy: RenderStrategy;
  
  // Dynamic grid configuration based on memory capabilities
  private gridCols: number = 100; // Target: 100x100 grid
  private gridRows: number = 100;
  private canvasWidth: number = 3200; // Target: 3200x3200px
  private canvasHeight: number = 3200;
  private viewportWidth: number = 800;
  private viewportHeight: number = 600;
  
  private readonly CELL_SIZE = 32;
  private readonly DATABASE_NAME: string;
  private readonly SERVER_URL: string;

  constructor(serverUrl: string = import.meta.env.VITE_SPACETIMEDB_URL || 'http://localhost:3000', databaseName: string = 'checkboxes-local-demo') {
    this.SERVER_URL = serverUrl;
    this.DATABASE_NAME = databaseName;
    console.log('SpacetimeDB server URL:', this.SERVER_URL);
    this.memoryManager = new MemoryManager();
    this.renderStrategy = this.memoryManager.getFallbackStrategy();
    this.adjustConfigurationForStrategy();
  }
  
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
  
  /**
   * Adjust grid and canvas size based on memory capabilities
   */
  private adjustConfigurationForStrategy(): void {
    const recommendedViewport = this.memoryManager.getRecommendedViewportSize();
    this.viewportWidth = recommendedViewport.width;
    this.viewportHeight = recommendedViewport.height;
    
    switch (this.renderStrategy) {
      case 'large-canvas':
        // Keep target 100x100 grid with 3200x3200 canvas
        this.gridCols = 100;
        this.gridRows = 100;
        this.canvasWidth = 3200;
        this.canvasHeight = 3200;
        break;
        
      case 'virtual-scroll':
        // Keep 100x100 grid but use smaller canvas
        this.gridCols = 100;
        this.gridRows = 100;
        this.canvasWidth = this.viewportWidth;
        this.canvasHeight = this.viewportHeight;
        break;
        
      case 'dom-grid':
        // Fallback to smaller grid for DOM-based rendering
        this.gridCols = 50;
        this.gridRows = 50;
        this.canvasWidth = this.viewportWidth;
        this.canvasHeight = this.viewportHeight;
        break;
    }
    
    console.log(`Using ${this.renderStrategy} strategy: ${this.gridCols}x${this.gridRows} grid, ${this.canvasWidth}x${this.canvasHeight} canvas`);
  }

  /**
   * Initialize the canvas and set up click handlers
   */
  public initializeCanvas(canvasElement: HTMLCanvasElement): void {
    this.canvas = canvasElement;
    this.ctx = this.canvas.getContext('2d');
    
    if (!this.ctx) {
      throw new Error('Failed to get 2D rendering context');
    }

    // Set canvas size based on strategy
    this.canvas.width = this.canvasWidth;
    this.canvas.height = this.canvasHeight;
    
    // Initialize viewport manager
    this.viewportManager = new ViewportManager(
      this.viewportWidth,
      this.viewportHeight,
      this.canvasWidth,
      this.canvasHeight
    );
    
    // Initialize canvas renderer
    this.canvasRenderer = new CanvasRenderer(this.canvas);
    
    // Initialize navigation controller
    this.navigationController = new NavigationController(
      this.viewportManager,
      this.canvas
    );
    
    // Set up viewport change handler
    this.navigationController.onViewportChange = (position) => {
      console.log('Viewport moved to:', position);
      this.render();
    };
    
    // Add click handler
    this.canvas.addEventListener('click', (event) => {
      this.handleCanvasClick(event);
    });

    console.log(`Canvas initialized with size ${this.canvas.width}x${this.canvas.height}, strategy: ${this.renderStrategy}`);
    this.render();
  }

  /**
   * Connect to SpacetimeDB using the official TypeScript SDK
   */
  public async connect(): Promise<boolean> {
    try {
      console.log(`Connecting to SpacetimeDB at ${this.SERVER_URL}...`);
      
      // Create connection using the generated DbConnection
      this.connection = DbConnection.builder()
        .withUri(this.SERVER_URL)
        .withDatabaseName(this.DATABASE_NAME)
        .onConnect((_connection, identity, token) => {
          console.log('✅ Connected to SpacetimeDB!', { identity: identity.toHexString(), token });
        })
        .onConnectError((_ctx, error) => {
          console.error('❌ SpacetimeDB connection error:', error);
          this.showConnectionError('Failed to connect to backend. Please check your internet connection.');
        })
        .build();

      // Subscribe to checkbox_chunk table for real-time updates
      this.subscription = this.connection.subscriptionBuilder()
        .onApplied((_ctx) => {
          console.log('📡 Subscription to checkbox_chunk table established');
          this.loadInitialData();
        })
        .onError((ctx) => {
          console.error('❌ Subscription error:', ctx.event);
          this.showConnectionError('Lost connection to backend. Attempting to reconnect...');
        })
        .subscribe('SELECT * FROM checkbox_chunk');

      // Listen for table insert/update events directly on the connection
      this.connection.db.checkbox_chunk.onInsert((_ctx, row) => {
        console.log('➕ New chunk inserted:', row);
        this.handleChunkUpdate(row.chunkId, new Uint8Array(row.state), Number(row.version));
      });

      this.connection.db.checkbox_chunk.onUpdate((_ctx, _oldRow, newRow) => {
        console.log('🔄 Chunk updated:', newRow.chunkId, 'version:', newRow.version);
        this.handleChunkUpdate(newRow.chunkId, new Uint8Array(newRow.state), Number(newRow.version));
      });

      return true;
    } catch (error) {
      console.error('Failed to connect to SpacetimeDB:', error);
      return false;
    }
  }

  /**
   * Load existing chunk data from the database
   */
  private loadInitialData(): void {
    if (!this.connection) {
      console.warn('Cannot load data - not connected');
      return;
    }

    try {
      // Query all existing chunks using the connection's db interface
      const chunks = Array.from(this.connection.db.checkbox_chunk.iter());
      console.log(`Loading ${chunks.length} existing chunks...`);
      
      for (const chunk of chunks) {
        this.handleChunkUpdate(chunk.chunkId, new Uint8Array(chunk.state), Number(chunk.version));
      }
    } catch (error) {
      console.warn('Error loading initial data:', error);
    }
  }

  /**
   * Handle chunk updates from real-time subscriptions
   */
  private handleChunkUpdate(chunkId: number, state: Uint8Array, version: number): void {
    console.log(`Processing chunk ${chunkId} update, version ${version}, ${state.length} bytes`);
    
    this.chunkData.set(chunkId, state);
    
    // Update checkbox states for this chunk
    for (let localY = 0; localY < 1000; localY++) {
      for (let localX = 0; localX < 1000; localX++) {
        const bitOffset = localY * 1000 + localX;
        const checked = this.getBit(state, bitOffset);
        
        // Convert to global coordinates
        const globalX = (chunkId % 1000) * 1000 + localX;
        const globalY = Math.floor(chunkId / 1000) * 1000 + localY;
        
        // Only track checkboxes in our visible grid area
        if (globalX < this.gridCols && globalY < this.gridRows) {
          const key = `${globalX},${globalY}`;
          this.checkboxStates.set(key, { checked });
        }
      }
    }
    
    this.render();
  }

  /**
   * Toggle a checkbox and update the backend
   */
  public async toggleCheckbox(x: number, y: number): Promise<boolean> {
    try {
      // Get current state
      const key = `${x},${y}`;
      const currentState = this.checkboxStates.get(key);
      const newChecked = !currentState?.checked;

      // Update local state immediately (for responsiveness)
      this.checkboxStates.set(key, { checked: newChecked });
      this.render();

      // If not connected, just update local state for testing
      if (!this.connection) {
        console.warn('Cannot sync checkbox - not connected to SpacetimeDB, updating locally only');
        return true;
      }

      // Calculate chunk_id and bit_offset for SpacetimeDB update
      const chunkX = Math.floor(x / 1000);
      const chunkY = Math.floor(y / 1000);
      const chunkId = chunkY * 1000 + chunkX;
      
      const localX = x % 1000;
      const localY = y % 1000;
      const bitOffset = localY * 1000 + localX;

      console.log(`Toggling checkbox at (${x},${y}) -> chunk ${chunkId}, bit ${bitOffset}, checked: ${newChecked}`);

      // Call the SpacetimeDB reducer using the correct API
      await this.connection.reducers.updateCheckbox({
        chunkId: chunkId,
        bitOffset: bitOffset,
        checked: newChecked
      });

      console.log('✅ Checkbox update sent to SpacetimeDB');
      return true;
    } catch (error) {
      console.error('Failed to toggle checkbox:', error);
      return false;
    }
  }

  /**
   * Handle canvas click events
   */
  private handleCanvasClick(event: MouseEvent): void {
    if (!this.canvas || !this.viewportManager) return;

    const rect = this.canvas.getBoundingClientRect();
    const canvasX = event.clientX - rect.left;
    const canvasY = event.clientY - rect.top;

    // Convert canvas coordinates to grid coordinates using viewport manager
    const viewport = this.viewportManager.getPosition();
    
    // For virtual-scroll and dom-grid strategies, canvas shows viewport directly
    if (this.renderStrategy === 'virtual-scroll' || this.renderStrategy === 'dom-grid') {
      const viewportGridX = Math.floor(canvasX / this.CELL_SIZE);
      const viewportGridY = Math.floor(canvasY / this.CELL_SIZE);
      
      const gridX = Math.floor(viewport.x / this.CELL_SIZE) + viewportGridX;
      const gridY = Math.floor(viewport.y / this.CELL_SIZE) + viewportGridY;
      
      if (gridX >= 0 && gridX < this.gridCols && gridY >= 0 && gridY < this.gridRows) {
        this.toggleCheckbox(gridX, gridY);
      }
    } else {
      // For large-canvas strategy, canvas coordinates are global
      const gridX = Math.floor(canvasX / this.CELL_SIZE);
      const gridY = Math.floor(canvasY / this.CELL_SIZE);

      if (gridX >= 0 && gridX < this.gridCols && gridY >= 0 && gridY < this.gridRows) {
        this.toggleCheckbox(gridX, gridY);
      }
    }
  }

  /**
   * Render the checkbox grid
   */
  private render(): void {
    if (!this.ctx || !this.canvas || !this.canvasRenderer) return;

    // Use the canvas renderer to draw the grid
    this.canvasRenderer.renderFullGrid(this.checkboxStates);
  }

  /**
   * Navigate viewport to specific position
   */
  public navigateTo(x: number, y: number): boolean {
    if (!this.navigationController) {
      console.warn('Navigation not available - canvas not initialized');
      return false;
    }
    
    this.navigationController.moveTo(x, y);
    return true;
  }
  
  /**
   * Get current viewport position
   */
  public getViewportPosition(): { x: number; y: number } {
    if (!this.viewportManager) {
      return { x: 0, y: 0 };
    }
    
    return this.viewportManager.getPosition();
  }
  
  /**
   * Get grid configuration info
   */
  public getGridInfo(): {
    cols: number;
    rows: number;
    canvasWidth: number;
    canvasHeight: number;
    strategy: RenderStrategy;
  } {
    return {
      cols: this.gridCols,
      rows: this.gridRows,
      canvasWidth: this.canvasWidth,
      canvasHeight: this.canvasHeight,
      strategy: this.renderStrategy
    };
  }

  /**
   * Get a bit from a byte array
   */
  private getBit(data: Uint8Array, bitIndex: number): boolean {
    const byteIndex = Math.floor(bitIndex / 8);
    const bitOffset = bitIndex % 8;
    
    if (byteIndex >= data.length) {
      return false;
    }
    
    return (data[byteIndex] & (1 << bitOffset)) !== 0;
  }

  /**
   * Get connection status
   */
  public isConnected(): boolean {
    return this.connection !== null;
  }

  /**
   * Get current checkbox count
   */
  public getCheckboxCount(): { total: number, checked: number } {
    let checked = 0;
    const total = this.checkboxStates.size;
    
    for (const state of this.checkboxStates.values()) {
      if (state.checked) checked++;
    }
    
    return { total, checked };
  }

  /**
   * Disconnect from SpacetimeDB
   */
  public disconnect(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
      this.subscription = null;
    }
    
    if (this.connection) {
      // Note: The connection will be cleaned up automatically when the object is garbage collected
      this.connection = null;
    }
    
    console.log('Disconnected from SpacetimeDB');
  }
}