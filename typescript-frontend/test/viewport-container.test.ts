import { describe, test, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Viewport Container HTML Structure', () => {
  test('index.html should contain viewport-container div structure', () => {
    const htmlPath = join(__dirname, '../index.html');
    const htmlContent = readFileSync(htmlPath, 'utf-8');
    
    // Should contain viewport-container div
    expect(htmlContent).toMatch(/<div\s+class="viewport-container">/);
    
    // Should contain navigation hints
    expect(htmlContent).toMatch(/navigation-hints/);
    expect(htmlContent).toMatch(/Use arrow keys to navigate/);
    
    // Should show 10,000 total checkboxes
    expect(htmlContent).toMatch(/10000/);
    expect(htmlContent).toMatch(/100×100/);
  });
  
  test('index.html should contain viewport container CSS styles', () => {
    const htmlPath = join(__dirname, '../index.html');
    const htmlContent = readFileSync(htmlPath, 'utf-8');
    
    // Should contain viewport-container CSS class
    expect(htmlContent).toMatch(/\.viewport-container\s*{/);
    expect(htmlContent).toMatch(/width:\s*800px/);
    expect(htmlContent).toMatch(/height:\s*600px/);
    expect(htmlContent).toMatch(/overflow:\s*hidden/);
    
    // Canvas should be positioned absolutely
    expect(htmlContent).toMatch(/#checkboxCanvas\s*{[\s\S]*position:\s*absolute/);
    expect(htmlContent).toMatch(/transform:\s*translate/);
  });
});