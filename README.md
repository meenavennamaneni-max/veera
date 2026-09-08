# Veera Bot Control Center

Updated from the React/TypeScript website in `A Veera.zip`, keeping the original black-and-gold styling, robot avatar, Introduction, Uses, Bluetooth panel, status panel and command log.

## Which download to use

**`Veera-Bot-v3.1-Ready-To-Host.zip` is the deployment package.** It contains the compiled `index.html` and `logo.png` directly at its root, with no source entry page to confuse with the built page. Extract it into a **new empty folder** and replace the current deployed site with those files. Do not extract it over an old download and then open a different `index.html`.

The page title includes **v3.1**, and the header says **VEERA v3.1 / TRIGGER-ONLY CONTROLS**. If those labels are missing, you are not viewing this release. Changes in the GitHub working branch do not automatically replace an existing live deployment. Redeploy the new build, then refresh any browser/hosting cache. No service worker is included by this project.

`Veera-Bot-Updated.zip` remains available as the full source + built-website package for developers; its deployable files are inside `website/`, not its root source `index.html`.

## Replace the live Netlify deployment

The live site `https://veerabot.netlify.app` was checked and was still serving the older controls (Wave, Raise, Lower, Stop hand). Updating a GitHub branch or downloading a ZIP does not replace that deployment automatically.

For a manual Netlify deployment:

1. Download `Veera-Bot-v3.1-Ready-To-Host.zip` and extract it into a fresh folder.
2. Sign in to your Netlify dashboard and open the **existing project** serving `veerabot.netlify.app`.
3. Open **Deploys** and use the manual deploy/upload area. Upload the extracted folder containing `index.html` and `logo.png` directly inside it. Do not upload the source project or the old `A Veera.zip`.
4. Wait for Netlify to mark the deployment **Published**, then reload the live URL. Ensure production publishing is not locked to an older deployment.
5. Confirm the header says **VEERA v3.1 / TRIGGER-ONLY CONTROLS**, there is only **Wave Hand**, and Introduction no longer opens a popup. `https://veerabot.netlify.app/VERSION.txt` will also identify this manual package.

If your Netlify project is configured for Git-based deployment instead, use `npm run build` as the build command and `dist` as the publish directory. `netlify.toml` contains those settings. Ensure Netlify builds the revision containing these changes; this session's code is on `arena/01a0813d-veera`, not the original `main` branch. A Git integration still targeting the unchanged `main` branch will not use this update.

No Netlify production deployment has been performed by this repository update. The site owner must publish the files or configure the appropriate Git deployment.

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
- The header and favicon use **`./logo.png`**, resolved next to the deployed page, including on subdirectory hosting.
- For the prebuilt website, replace **`website/logo.png`** before uploading it.
- Use your file explorer to replace the image, keeping the filename **`logo.png`**. There are no logo upload/reset controls on the website, and previously saved browser logo overrides are ignored. If an old image is cached after replacement, refresh the browser cache.
- The existing `public/images/logo.png` is retained from the archive, but the header uses the top-level `logo.png`.

## Controls

- Drag the large joystick: distance controls speed; horizontal motion turns by independently driving each motor pair. It is differential drive, not sideways strafing.
- Release the controlling pointer to issue immediate STOP, bypassing acceleration/deceleration ramps.
- A second finger can press Wave Hand, Introduction or emergency STOP without stealing the joystick pointer.
- STOP cancels all motion and the current gesture; release and start a new gesture to resume.
- Right hand only: **Wave Hand** sends `H:wave\n` once to the ESP32. The ESP32 controls the servo and the complete wave sequence. A configurable 200–2000 ms cooldown limits requests. There are no Raise, Lower or separate Stop hand controls; emergency STOP still cancels all motion. The website does not generate servo angles or send a timed hand-stop command.
- Focus the joystick and hold arrow keys for keyboard driving. Release all arrow keys to stop. Space/Escape are emergency stops.
- Fullscreen keeps joystick, connection status, STOP, Wave Hand and Introduction onscreen. Exit Fullscreen leaves demo mode. If the browser denies fullscreen, a screen-filling in-page fallback is used.
- Changing fullscreen, resizing, losing window focus, hiding the page and losing the link cancel motion. A stalled control loop also cancels motion.
- **Introduction** is a simple connection-gated button that sends `I` once to the ESP32. It does not open a popup, contain an audio player, or generate speech. The ESP32 instructs the DFPlayer Mini to play the prerecorded Introduction MP3 from the DFPlayer Mini’s microSD card through the speaker.
- **Uses** is informational, available even when disconnected. It sends no Uses/audio trigger. Opening its modal cancels motion with `S` for safety.
- There is no custom speech editor, browser speech synthesis, voice upload or voice API.

## Trigger-only hardware flow

```text
Introduction button -> Website sends I -> ESP32 -> DFPlayer Mini
                    -> prerecorded Introduction MP3 on microSD -> Speaker

Wave Hand button -> Website sends H:wave -> ESP32 -> Servo -> Wave movement
```

Store your prerecorded introduction on the DFPlayer Mini’s microSD card using the track naming/index convention configured in the ESP32 firmware. The MP3 is not stored, uploaded or played by the website. The website does not communicate directly with the DFPlayer Mini or servo.

The wave request indicator briefly records that a trigger was requested; it is not servo feedback or a wave-duration controller. Logs show written commands, not confirmed motor movement or audio playback.

## Connect a physical robot — important

The archive did **not** contain ESP32 firmware, motor pin assignments or hand calibration. This update supplies the real BLE communication layer and a documented protocol; it does not flash or verify the physical robot.

**The old single-letter F/B/L/R firmware is not enough for variable-speed joystick driving.** Install compatible firmware implementing [docs/ESP32-PROTOCOL.md](docs/ESP32-PROTOCOL.md), including the hardware watchdog, before operating motors. Connection status reports the actual BLE link after characteristic discovery and a successful initial STOP write. It does not certify firmware compatibility or confirm that motors physically moved. No battery, CPU or signal readings are fabricated.

Use Chrome/Edge on Android or a supported desktop with Bluetooth enabled. Web Bluetooth needs HTTPS and browser permission. If an embedded preview blocks pairing, open the site directly in its own tab. iOS browsers generally do not offer Web Bluetooth; another transport adapter would be needed there.

Test with wheels lifted and low power first. Keep a physical emergency stop accessible. Network/browser software cannot guarantee instantaneous physical braking after a radio failure.

## Architecture

- `src/control/RobotController.ts`: transport-independent differential mixer, ramping, stop, wave trigger/cooldown and Introduction trigger.
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

Unit tests cover mixing, diagonal movement, ramping, reversal, immediate stop, heartbeats, cooldown, independent wave/introduction triggers, disconnected trigger rejection, single-action UI and queue priority/timeouts.

Browser tests are included for desktop and Android-sized portrait/landscape layouts, Pointer Events multitouch, fullscreen, the fixed file-based logo and disconnect behavior:

```sh
npx playwright install --with-deps chromium
# Start npm run dev in another terminal, then:
npm run test:e2e
```

The production build and 28 unit tests passed during packaging. Browser tests could not run in the packaging environment because Chromium's system libraries were unavailable. Physical ESP32 behavior has not been tested.
