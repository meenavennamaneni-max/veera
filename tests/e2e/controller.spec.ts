import { test, expect, type Page } from '@playwright/test';

async function mockBLE(page: Page) {
  // Test-only peripheral. Production code never simulates a connection.
  await page.addInitScript(() => {
    const w = window as any;
    w.bleWrites = [];
    w.failWrite = false;
    const device = new EventTarget() as any;
    device.name = 'Veera Bot';
    device.gatt = {
      connected: false,
      async connect() { this.connected = true; return this; },
      disconnect() { this.connected = false; device.dispatchEvent(new Event('gattserverdisconnected')); },
      async getPrimaryService() { return { async getCharacteristic() { return {
        properties: { write: true },
        async writeValueWithResponse(data: BufferSource) {
          if (w.failWrite) throw new Error('GATT write failed');
          w.bleWrites.push(new TextDecoder().decode(data));
          await new Promise(resolve => setTimeout(resolve, 5));
        },
      }; } }; },
    };
    w.dropBLE = () => device.gatt.disconnect();
    Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: {
      async requestDevice() { if (w.cancelPairing) throw new Error('User cancelled pairing'); return device; },
    } });
  });
}
async function connect(page: Page) {
  await page.getByRole('button', { name: 'CONNECT ROBOT', exact: true }).click();
  await expect(page.locator('.connection-badge')).toHaveText('Connected');
}
async function demo(page: Page) {
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  await expect(page.locator('.control-interface')).toHaveClass(/demo-mode/);
}
const writes = (page: Page) => page.evaluate(() => (window as any).bleWrites as string[]);

for (const mode of ['normal', 'fallback'] as const) {
  test(`layout, safe disconnected state, ${mode} fullscreen`, async ({ page }, info) => {
    await page.goto('/');
    if (mode === 'fallback') await page.evaluate(() => { Element.prototype.requestFullscreen = async () => { throw new Error('Not allowed'); }; });
    await expect(page.locator('.connection-badge')).toHaveText('Disconnected');
    await expect(page.getByRole('group', { name: 'Driving joystick' })).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByRole('button', { name: 'Wave Hand', exact: true })).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await demo(page);
    for (const name of ['Emergency STOP', 'Exit Fullscreen', 'Wave Hand', 'Introduction']) {
      const box = await page.getByRole('button', { name, exact: true }).boundingBox();
      expect(box).not.toBeNull();
      const viewport = page.viewportSize()!;
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
    }
    const pad = await page.locator('.joystick').boundingBox();
    expect(pad!.height).toBeGreaterThan(180);
    await page.screenshot({ path: `.cache/${info.project.name}-${mode}.png` });
    await page.getByRole('button', { name: 'Exit Fullscreen' }).click();
    await expect(page.locator('.control-interface')).not.toHaveClass(/demo-mode/);
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  });
}

test('preserves predefined sections and file-based logo without visitor upload controls', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('veera-logo', 'data:image/png;base64,old-browser-override'));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Introduction', exact: true })).toBeDisabled();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^(Raise|Lower|Stop hand)$/i })).toHaveCount(0);
  await page.getByRole('button', { name: 'Uses Explore the possibilities' }).click();
  const text = await page.getByRole('dialog').innerText();
  for (const term of ['schools', 'colleges', 'science fairs', 'robotics events', 'exhibitions', 'museums', 'tourist places', 'public demonstrations', 'mobile device', 'customized']) expect(text.toLowerCase()).toContain(term);
  await page.getByRole('button', { name: 'Close uses', exact: true }).first().click();
  await expect(page.locator('textarea, audio, input[type=\"file\"]')).toHaveCount(0);
  await expect(page.getByText('Developed By', { exact: false })).toContainText('Team DAJ');
  await expect(page.locator('.brand-logo')).toHaveAttribute('src', './logo.png');
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /upload logo|reset/i })).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.brand-logo')).toHaveAttribute('src', './logo.png');
});

test('left/right steering, release, keyboard and blur stops', async ({ page }) => {
  await mockBLE(page); await page.goto('/'); await connect(page); await demo(page);
  const pad = page.getByRole('group', { name: 'Driving joystick' });
  let box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + box.width * .2, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(async () => (await writes(page)).some(v => /^M:-\d+,[1-9]\d*\n$/.test(v))).toBe(true);
  await page.mouse.up();
  await expect.poll(async () => (await writes(page)).at(-1)).toBe('S');
  await expect(page.getByTestId('left-speed')).toHaveText('0');
  box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + box.width * .8, box.y + box.height / 2); await page.mouse.down();
  await expect.poll(async () => (await writes(page)).some(v => /^M:[1-9]\d*,-\d+\n$/.test(v))).toBe(true);
  await page.getByRole('button', { name: 'Emergency STOP' }).dispatchEvent('pointerdown', { pointerId: 2, pointerType: 'touch', button: 0 });
  await expect(page.getByTestId('left-speed')).toHaveText('0');
  const afterStop = (await writes(page)).length;
  await page.mouse.move(box.x + box.width / 2, box.y + 10); await page.waitForTimeout(180);
  expect((await writes(page)).slice(afterStop).filter(v => v.startsWith('M:'))).toEqual([]);
  await page.mouse.up();
  await pad.focus(); await page.keyboard.down('ArrowUp');
  await expect.poll(async () => Number(await page.getByTestId('left-speed').innerText())).toBeGreaterThan(0);
  await page.keyboard.up('ArrowUp'); await expect(page.getByTestId('left-speed')).toHaveText('0');
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => Number(await page.getByTestId('right-speed').innerText())).toBeLessThan(0);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.getByTestId('right-speed')).toHaveText('0');
  await page.keyboard.up('ArrowRight');
});

test('real two-finger touch keeps joystick owner independent and emergency stop latched', async ({ page }) => {
  await mockBLE(page); await page.goto('/'); await connect(page); await demo(page);
  const session = await page.context().newCDPSession(page);
  const box = (await page.locator('.joystick').boundingBox())!;
  const hand = (await page.getByRole('button', { name: 'Wave Hand', exact: true }).boundingBox())!;
  const stop = (await page.getByRole('button', { name: 'Emergency STOP' }).boundingBox())!;
  const finger1 = { id: 1, x: box.x + box.width * .5, y: box.y + box.height * .22 };
  const finger2 = { id: 2, x: hand.x + hand.width / 2, y: hand.y + hand.height / 2 };
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', points: typeof finger1[]) => session.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  const scroll = await page.evaluate(() => scrollY);
  await touch('touchStart', [finger1]);
  await expect.poll(async () => Number(await page.getByTestId('left-speed').innerText())).toBeGreaterThan(0);
  await touch('touchStart', [finger1, finger2]);
  await expect.poll(async () => (await writes(page)).includes('H:wave\n')).toBe(true);
  // Second pointer crosses onto pad, but cannot steal it or release it.
  await touch('touchMove', [finger1, { ...finger2, x: box.x + box.width * .8, y: box.y + box.height / 2 }]);
  await touch('touchEnd', [finger1]);
  await expect.poll(async () => Number(await page.getByTestId('left-speed').innerText())).toBeGreaterThan(0);
  expect(await page.getByTestId('left-speed').innerText()).toBe(await page.getByTestId('right-speed').innerText());
  expect(await page.evaluate(() => scrollY)).toBe(scroll);
  const intro = (await page.getByRole('button', { name: 'Introduction', exact: true }).boundingBox())!;
  const introFinger = { id: 4, x: intro.x + intro.width / 2, y: intro.y + intro.height / 2 };
  await touch('touchStart', [finger1, introFinger]);
  await touch('touchEnd', [finger1]);
  await expect.poll(async () => (await writes(page)).filter(v => v === 'I').length).toBe(1);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(async () => Number(await page.getByTestId('left-speed').innerText())).toBeGreaterThan(0);
  expect((await writes(page)).filter(v => v === 'H:wave\n')).toHaveLength(1);
  const emergencyFinger = { id: 3, x: stop.x + stop.width / 2, y: stop.y + stop.height / 2 };
  await touch('touchStart', [finger1, emergencyFinger]);
  await expect(page.getByTestId('left-speed')).toHaveText('0');
  await expect.poll(async () => (await writes(page)).at(-1)).toBe('S');
  const count = (await writes(page)).length;
  await touch('touchEnd', [finger1]);
  await touch('touchMove', [{ ...finger1, x: box.x + box.width * .8 }]);
  await page.waitForTimeout(180);
  expect((await writes(page)).slice(count).filter(v => v.startsWith('M:'))).toEqual([]);
  await touch('touchEnd', []);
  // A fresh gesture is allowed; OS touch cancellation stops it.
  await touch('touchStart', [finger1]);
  await expect.poll(async () => Number(await page.getByTestId('left-speed').innerText())).toBeGreaterThan(0);
  await touch('touchCancel', []);
  await expect(page.getByTestId('left-speed')).toHaveText('0');
});

test('connection loss and write errors disable motion, never auto-resume', async ({ page }) => {
  await mockBLE(page); await page.goto('/'); await connect(page); await demo(page);
  const pad = page.getByRole('group', { name: 'Driving joystick' });
  await pad.focus(); await page.keyboard.down('ArrowUp');
  await expect.poll(async () => Number(await page.getByTestId('left-speed').innerText())).toBeGreaterThan(0);
  await page.evaluate(() => (window as any).dropBLE());
  await expect(page.locator('.connection-badge')).toHaveText('Disconnected');
  await expect(page.getByTestId('left-speed')).toHaveText('0');
  await page.keyboard.up('ArrowUp');
  await page.getByRole('button', { name: 'Exit Fullscreen' }).click();
  await connect(page); await demo(page);
  await expect(page.getByTestId('left-speed')).toHaveText('0');
  await page.evaluate(() => { (window as any).failWrite = true; });
  await pad.focus(); await page.keyboard.down('ArrowUp');
  await expect(page.locator('.connection-badge')).toHaveText('Disconnected');
  await expect(page.getByTestId('left-speed')).toHaveText('0');
  await page.keyboard.up('ArrowUp');
});


test('Introduction is one ESP32 trigger; Uses is informational; no web audio', async ({ page }) => {
  await mockBLE(page);
  await page.addInitScript(() => {
    const w = window as any;
    w.browserAudioCalls = 0;
    w.Audio = function () { w.browserAudioCalls++; throw new Error('Browser audio is forbidden'); };
    if (window.speechSynthesis) window.speechSynthesis.speak = () => { w.browserAudioCalls++; };
  });
  await page.goto('/'); await connect(page);
  const intro = page.getByRole('button', { name: 'Introduction', exact: true });
  await intro.click();
  await expect.poll(async () => (await writes(page)).filter(v => v === 'I').length).toBe(1);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await intro.focus(); await page.keyboard.press('Enter');
  await expect.poll(async () => (await writes(page)).filter(v => v === 'I').length).toBe(2);
  await page.getByRole('button', { name: 'Uses Explore the possibilities' }).click();
  await expect(page.getByRole('dialog', { name: 'Uses' })).toBeVisible();
  expect((await writes(page)).filter(v => v === 'U')).toHaveLength(0);
  expect((await writes(page)).filter(v => v === 'I')).toHaveLength(2);
  expect(await page.evaluate(() => (window as any).browserAudioCalls)).toBe(0);
});
