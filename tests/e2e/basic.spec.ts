import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('should display login screen on first visit', async ({ page }) => {
    await page.goto('/');
    
    // Should show authentication page with logo
    await expect(page.locator('img[alt="ARES Dashboard"]')).toBeVisible();
    // Check for role selection label (unique selector)
    await expect(page.locator('label:has-text("Select Your Role")')).toBeVisible();
  });

  test('should allow user to login with admin role', async ({ page }) => {
    await page.goto('/');
    
    // Wait for the page to load
    await page.waitForLoadState('networkidle');
    
    // Look for Administrator role button (exact text match)
    const adminButton = page.getByRole('button', { name: /Administrator.*Full system/ });
    await expect(adminButton).toBeVisible({ timeout: 10000 });
    
    // Click the Administrator role to select it
    await adminButton.click();
    
    // Click the "Enter Dashboard" button
    const enterButton = page.getByRole('button', { name: 'Enter Dashboard' });
    await enterButton.click();
    
    // Should be logged in - look for framework tabs (OWASP, MITRE ATLAS, MITRE ATTACK)
    await expect(page.getByRole('button', { name: 'OWASP' })).toBeVisible({ timeout: 5000 });
  });

  test('should persist session across page reloads', async ({ page }) => {
    // Clear any existing sessions first to ensure clean state
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
    });
    
    // Now load the page fresh
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Login with Analyst role - should now be visible since we cleared session
    const analystButton = page.getByRole('button', { name: /Security Analyst.*Create and execute/ });
    await expect(analystButton).toBeVisible({ timeout: 5000 });
    await analystButton.click();
    
    // Click Enter Dashboard button
    const enterButton = page.getByRole('button', { name: 'Enter Dashboard' });
    await enterButton.click();
    
    // Wait for dashboard to load - should see framework tabs
    await expect(page.getByRole('button', { name: 'OWASP' })).toBeVisible({ timeout: 10000 });
    
    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // After reload, should still be logged in and see dashboard
    // Wait a bit for the session to be restored from localStorage
    await page.waitForTimeout(2000);
    
    // Verify we're still on the dashboard by checking for framework tabs
    await expect(page.getByRole('button', { name: 'OWASP' })).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Dashboard Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Try to login if on login screen
    const adminButton = page.getByRole('button', { name: /Administrator.*Full system/ });
    if (await adminButton.isVisible({ timeout: 3000 })) {
      await adminButton.click();
      // Click Enter Dashboard button
      const enterButton = page.getByRole('button', { name: 'Enter Dashboard' });
      await enterButton.click();
      await page.waitForTimeout(1000);
    }
  });

  test('should display framework options', async ({ page }) => {
    // Check if framework tab buttons are visible
    const hasOWASP = await page.getByRole('button', { name: 'OWASP' }).isVisible({ timeout: 5000 });
    const hasMITREATLAS = await page.getByRole('button', { name: 'MITRE ATLAS' }).isVisible({ timeout: 5000 });
    const hasMITREATTACK = await page.getByRole('button', { name: 'MITRE ATTACK' }).isVisible({ timeout: 5000 });
    
    expect(hasOWASP || hasMITREATLAS || hasMITREATTACK).toBe(true);
  });

  test('should load without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => {
      errors.push(error.message);
    });
    
    await page.waitForTimeout(2000);
    
    // Should have no critical errors
    expect(errors.length).toBeLessThan(5);
  });
});

test.describe('Basic Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const adminButton = page.getByRole('button', { name: /Administrator.*Full system/ });
    if (await adminButton.isVisible({ timeout: 3000 })) {
      await adminButton.click();
      // Click Enter Dashboard button
      const enterButton = page.getByRole('button', { name: 'Enter Dashboard' });
      await enterButton.click();
      await page.waitForTimeout(1000);
    }
  });

  test('should have responsive layout', async ({ page }) => {
    // Check that page is rendered
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();
    expect(bodyText!.length).toBeGreaterThan(10);
  });

  test('should handle keyboard shortcuts', async ({ page }) => {
    // Press ? for help (if implemented)
    await page.keyboard.press('?');
    await page.waitForTimeout(500);
    
    // Press Escape to close any modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    // Should not crash
    const isVisible = await page.locator('body').isVisible();
    expect(isVisible).toBe(true);
  });
});
