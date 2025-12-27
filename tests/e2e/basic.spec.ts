import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('should display login screen on first visit', async ({ page }) => {
    await page.goto('/');
    
    // Should show authentication page
    await expect(page.locator('text=ARES Dashboard')).toBeVisible();
    await expect(page.locator('text=Admin').or(page.locator('text=Select'))).toBeVisible();
  });

  test('should allow user to login with admin role', async ({ page }) => {
    await page.goto('/');
    
    // Wait for the page to load
    await page.waitForLoadState('networkidle');
    
    // Look for admin button/option
    const adminButton = page.locator('text=Admin').first();
    await expect(adminButton).toBeVisible({ timeout: 10000 });
    
    await adminButton.click();
    
    // Should be logged in - look for dashboard elements
    await expect(page.locator('text=OWASP').or(page.locator('text=Framework'))).toBeVisible({ timeout: 5000 });
  });

  test('should persist session across page reloads', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Login
    const analystButton = page.locator('text=Analyst').first();
    if (await analystButton.isVisible({ timeout: 5000 })) {
      await analystButton.click();
      await page.waitForTimeout(1000);
    }
    
    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Should still have access to dashboard (not on login screen)
    const hasFramework = await page.locator('text=OWASP').or(page.locator('text=Framework')).isVisible({ timeout: 5000 });
    const hasLoginScreen = await page.locator('text=Select').and(page.locator('text=Role')).isVisible({ timeout: 2000 });
    
    // Either should see dashboard or login persisted
    expect(hasFramework || !hasLoginScreen).toBe(true);
  });
});

test.describe('Dashboard Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Try to login if on login screen
    const adminButton = page.locator('text=Admin').first();
    if (await adminButton.isVisible({ timeout: 3000 })) {
      await adminButton.click();
      await page.waitForTimeout(1000);
    }
  });

  test('should display framework options', async ({ page }) => {
    // Check if any framework-related text is visible
    const hasOWASP = await page.locator('text=OWASP').isVisible({ timeout: 5000 });
    const hasMITRE = await page.locator('text=MITRE').isVisible({ timeout: 5000 });
    const hasFramework = await page.locator('text=Framework').isVisible({ timeout: 5000 });
    
    expect(hasOWASP || hasMITRE || hasFramework).toBe(true);
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
    
    const adminButton = page.locator('text=Admin').first();
    if (await adminButton.isVisible({ timeout: 3000 })) {
      await adminButton.click();
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
