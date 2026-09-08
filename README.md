# Veera Bot Control Center

Updated from the React/TypeScript website in `A Veera.zip`, keeping the original black-and-gold styling, robot avatar, Introduction, Uses, Bluetooth panel, status panel and command log.

## Run the website

Requires Node.js 22.12+.

```sh
npm ci
npm run dev -- --host 0.0.0.0
```

For production:

```sh
npm run build
```

Deploy the contents of `dist/` to an HTTPS static host. The downloadable ZIP also includes the prebuilt site in `website/`; upload **all contents of that folder**, including `logo.png`, to your hosting service. Do not just double-click the HTML file: serve it over HTTPS for Web Bluetooth. Browser-facing code makes no localhost API requests.

## Logo

- Replace **`public/logo.png`** to change the shared/deployed logo, then rebuild.
- Public URL: **`/logo.png`**.
- For the prebuilt website, replace **`website/logo.png`** before uploading it.
- Or use **Upload logo** at the top of the website: PNG, JPG or WebP, maximum 2 MB. This saves the image in that browser's local storage, not on a server and not for other users. Reset restores the default. Keep a copy of your image separately.
- The existing `public/images/logo.png` is retained from the archive, but the header uses `/logo.png`.

## Controls

- Drag the large joystick: distance controls speed; horizontal motion turns by independently driving each motor pair. It is differential drive, not sideways strafing.
- Release the controlling pointer to issue immediate STOP, bypassing acceleration/deceleration ramps.
- A second finger can operate the right hand or emergency STOP without stealing the joystick pointer.
- STOP cancels all motion and the current gesture; release and start a new gesture to resume.
- Right hand only: Wave, Raise, Lower, Stop hand. Configurable 200–2000 ms cooldown; Stop hand bypasses the cooldown. Hand actions auto-stop after 2 seconds.
- Focus the joystick and hold arrow keys for keyboard driving. Release all arrow keys to stop. Space/Escape are emergency stops.
- Fullscreen keeps joystick, connection status, STOP and right-hand controls onscreen. Exit Fullscreen leaves demo mode. If the browser denies fullscreen, a screen-filling in-page fallback is used.
- Changing fullscreen, resizing, losing window focus, hiding the page and losing the link cancel motion. A stalled control loop also cancels motion.
- Introduction displays: “Hi, I am Veera Bot. I am developed by Devaansh, Johnson, and Abhiram.” When connected it also sends the predefined `I` command. Uses similarly sends `U`.
- There is no custom speech editor, browser speech synthesis, voice upload or voice API.

## Connect a physical robot — important

The archive did **not** contain ESP32 firmware, motor pin assignments or hand calibration. This update supplies the real BLE communication layer and a documented protocol; it does not flash or verify the physical robot.

**The old single-letter F/B/L/R firmware is not enough for variable-speed joystick driving.** Install compatible firmware implementing [docs/ESP32-PROTOCOL.md](docs/ESP32-PROTOCOL.md), including the hardware watchdog, before operating motors. Connection status reports the actual BLE link after characteristic discovery and a successful initial STOP write. It does not certify firmware compatibility or confirm that motors physically moved. No battery, CPU or signal readings are fabricated.

Use Chrome/Edge on Android or a supported desktop with Bluetooth enabled. Web Bluetooth needs HTTPS and browser permission. If an embedded preview blocks pairing, open the site directly in its own tab. iOS browsers generally do not offer Web Bluetooth; another transport adapter would be needed there.

Test with wheels lifted and low power first. Keep a physical emergency stop accessible. Network/browser software cannot guarantee instantaneous physical braking after a radio failure.

## Architecture

- `src/control/RobotController.ts`: transport-independent differential mixer, ramping, stop, right-hand cooldown.
- `src/control/CommandQueue.ts`: serialized BLE writes, latest-speed coalescing, prioritized stop, write timeout.
- `src/hooks/useBluetooth.ts`: existing BLE service/characteristic connection, real status and logs.
- `src/components/MovementControls.tsx`: pointer ownership, capture, cancel/release and keyboard input.
- `src/hooks/useControlFullscreen.ts`: native fullscreen and fallback.

Wi-Fi/WebSocket/HTTP can be added by implementing `RobotTransport.isConnected()` and `send(payload, kind)` with equivalent stop priority and heartbeat safety. This version uses BLE; no Wi-Fi endpoint or server is included.

## Verification

```sh
npm test
npm run build
```

Unit tests cover mixing, diagonal movement, ramping, reversal, immediate stop, heartbeats, cooldown, disconnect and queue priority/timeouts.

Browser tests are included for desktop and Android-sized portrait/landscape layouts, Pointer Events multitouch, fullscreen, logo upload and disconnect behavior:

```sh
npx playwright install --with-deps chromium
# Start npm run dev in another terminal, then:
npm run test:e2e
```

The production build and 21 unit tests passed during packaging. Browser tests could not run in the packaging environment because Chromium's system libraries were unavailable. Physical ESP32 behavior has not been tested.
