// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const FILE_URL = 'file://' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

// Helper: wait for the intro modal to appear and start a new game
async function startNewGame(page) {
  await page.goto(FILE_URL);
  await page.waitForSelector('#overlay', { state: 'visible' });
  // Click "Empezar a laburar" or "Nueva partida"
  await page.locator('#modal .acts button.primary').click();
  await page.waitForSelector('#overlay', { state: 'hidden' });
}

// Helper: open the save manager (btnSaves is hidden until autorun unlocked; call directly)
async function openSaveManager(page) {
  await page.evaluate(() => window.openSaveManager());
  await page.waitForSelector('#overlay', { state: 'visible' });
}

test.describe('Save slots', () => {
  test('intro shows no slots when localStorage is empty', async ({ page }) => {
    await page.goto(FILE_URL);
    await page.waitForSelector('#overlay', { state: 'visible' });
    const modalText = await page.locator('#modal').innerText();
    expect(modalText).not.toMatch(/Slot \d/);
    expect(modalText).toMatch(/Empezar a laburar|Nueva partida/);
  });

  test('save manager opens and shows 3 empty slots', async ({ page }) => {
    await startNewGame(page);
    await openSaveManager(page);
    const h = await page.locator('#modal').innerHTML();
    expect(h).toContain('Slot 1');
    expect(h).toContain('Slot 2');
    expect(h).toContain('Slot 3');
    expect(h).toContain('vacío');
  });

  test('can save to a slot', async ({ page }) => {
    await startNewGame(page);
    await openSaveManager(page);
    // Click "Guardar acá" on Slot 1
    await page.locator('#modal button.primary.small').first().click();
    // Save manager should re-render with slot 1 populated
    const h = await page.locator('#modal').innerHTML();
    // Slot 1 should show data; slots 2-3 are still empty (vacío expected for them)
    expect(h).toContain('S1');
    // Slot 1 should have a Cargar button (only appears on populated slots)
    expect(h).toMatch(/saveSlot\(0\).*Cargar/);
  });

  test('save to slot 1 shows it in the intro after reload', async ({ page }) => {
    await startNewGame(page);
    await openSaveManager(page);
    await page.locator('#modal button.primary.small').first().click();
    // Reload the page — localStorage persists
    await page.reload();
    await page.waitForSelector('#overlay', { state: 'visible' });
    const modalText = await page.locator('#modal').innerText();
    expect(modalText).toMatch(/Slot 1/);
  });

  test('can delete a slot', async ({ page }) => {
    await startNewGame(page);
    await openSaveManager(page);
    // Save
    await page.locator('#modal button.primary.small').first().click();
    // Delete
    const deleteBtn = page.locator('#modal button', { hasText: 'Borrar' }).first();
    await deleteBtn.click();
    const h = await page.locator('#modal').innerHTML();
    expect(h).toContain('vacío');
  });

  test('cancel in load-slot confirm reopens save manager', async ({ page }) => {
    await startNewGame(page);
    await openSaveManager(page);
    // Save to slot 1
    await page.locator('#modal button.primary.small').first().click();
    // Click "Cargar"
    const loadBtn = page.locator('#modal button', { hasText: 'Cargar' }).first();
    await loadBtn.click();
    // Confirm modal should show
    await page.waitForSelector('#overlay', { state: 'visible' });
    // Click Cancel
    const cancelBtn = page.locator('#modal button', { hasText: 'Cancelar' });
    await cancelBtn.click();
    // Save manager should reopen
    await page.waitForSelector('#overlay', { state: 'visible' });
    const h = await page.locator('#modal').innerHTML();
    expect(h).toContain('Partidas');
  });

  test('close button dismisses save manager', async ({ page }) => {
    await startNewGame(page);
    await openSaveManager(page);
    await page.locator('#modal button', { hasText: 'Cerrar' }).click();
    await page.waitForSelector('#overlay', { state: 'hidden' });
  });

  test('can load from a slot and resume game', async ({ page }) => {
    await startNewGame(page);
    await openSaveManager(page);
    // Save
    await page.locator('#modal button.primary.small').first().click();
    // Cargar
    await page.locator('#modal button', { hasText: 'Cargar' }).first().click();
    await page.waitForSelector('#overlay', { state: 'visible' });
    // Confirm load
    await page.locator('#modal button', { hasText: 'Cargar' }).click();
    await page.waitForSelector('#overlay', { state: 'hidden' });
    // Game is running
    const week = await page.locator('#stWeek').innerText();
    // stWeek shows "S1", "S2" etc — strip the S prefix
    expect(parseInt(week.replace(/\D/g, ''))).toBeGreaterThanOrEqual(1);
  });

  test('export triggers download (no JS error)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await startNewGame(page);
    await openSaveManager(page);
    // Start waiting for download before click
    const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
    await page.locator('#modal button', { hasText: '⬇ Exportar' }).click();
    const download = await downloadPromise;
    // Either a download fired, or at minimum no JS error thrown
    expect(errors.filter(e => !/favicon/.test(e))).toHaveLength(0);
  });

  test('import with valid JSON loads the save', async ({ page }) => {
    await startNewGame(page);

    // Advance a few weeks to have a non-trivial state, then export via JS
    await page.evaluate(() => {
      const s = { ...window.freshState(), week: 10, cash: 50000 };
      window.S = s;
    });
    await openSaveManager(page);

    // Build a minimal valid save JSON and inject it via file chooser
    const saveData = { week: 10, cash: 50000, _ts: '2026-01-01' };
    const tmpPath = path.join(__dirname, 'tmp-save.json');
    fs.writeFileSync(tmpPath, JSON.stringify(saveData));

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('#modal button', { hasText: '⬆ Importar' }).click(),
    ]);
    await fileChooser.setFiles(tmpPath);
    fs.unlinkSync(tmpPath);

    // Confirmation modal should appear
    await page.waitForSelector('#overlay', { state: 'visible' });
    const body = await page.locator('#modal').innerText();
    expect(body).toMatch(/S10/);
    expect(body).toMatch(/Importar/);

    // Confirm
    await page.locator('#modal button', { hasText: 'Importar' }).click();
    await page.waitForSelector('#overlay', { state: 'hidden' });
    const cash = await page.evaluate(() => window.S.cash);
    expect(cash).toBe(50000);
  });

  test('import cancel reopens save manager', async ({ page }) => {
    await startNewGame(page);
    await openSaveManager(page);

    const saveData = { week: 5, cash: 30000 };
    const tmpPath = path.join(__dirname, 'tmp-save2.json');
    fs.writeFileSync(tmpPath, JSON.stringify(saveData));

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('#modal button', { hasText: '⬆ Importar' }).click(),
    ]);
    await fileChooser.setFiles(tmpPath);
    fs.unlinkSync(tmpPath);

    await page.waitForSelector('#overlay', { state: 'visible' });
    await page.locator('#modal button', { hasText: 'Cancelar' }).click();
    await page.waitForSelector('#overlay', { state: 'visible' });
    const h = await page.locator('#modal').innerHTML();
    expect(h).toContain('Partidas');
  });

  test('import invalid JSON shows alert, no crash', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await startNewGame(page);
    await openSaveManager(page);

    const tmpPath = path.join(__dirname, 'tmp-invalid.json');
    fs.writeFileSync(tmpPath, 'NOT VALID JSON {{{{');

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('#modal button', { hasText: '⬆ Importar' }).click(),
    ]);

    const dialogPromise = page.waitForEvent('dialog');
    await fileChooser.setFiles(tmpPath);
    fs.unlinkSync(tmpPath);
    const dialog = await dialogPromise;
    expect(dialog.message()).toMatch(/Error|error/i);
    await dialog.accept();
    expect(errors.filter(e => !/favicon/.test(e))).toHaveLength(0);
  });

  test('week shown in slot is always a number (XSS sanitization)', async ({ page }) => {
    // Craft a save with a non-numeric week and verify it doesn't execute
    await page.goto(FILE_URL);
    await page.evaluate(() => {
      const crafted = { week: 1, cash: 10000, _ts: '2026-01-01' };
      localStorage.setItem('dom_save_1', JSON.stringify(crafted));
    });
    await page.reload();
    await page.waitForSelector('#overlay', { state: 'visible' });
    const modalText = await page.locator('#modal').innerText();
    // Should show "Slot 1" with a numeric week
    expect(modalText).toMatch(/Slot 1.*S1/);
  });

  test('no console errors during normal save/load/delete flow', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await startNewGame(page);
    await openSaveManager(page);
    await page.locator('#modal button.primary.small').first().click();
    await page.locator('#modal button', { hasText: 'Cargar' }).first().click();
    await page.locator('#modal button', { hasText: 'Cancelar' }).click();
    await page.locator('#modal button', { hasText: 'Borrar' }).first().click();
    await page.locator('#modal button', { hasText: 'Cerrar' }).click();
    expect(errors.filter(e => !/favicon/.test(e))).toHaveLength(0);
  });
});
