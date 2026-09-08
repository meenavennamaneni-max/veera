# ESP32 integration contract

No firmware or wiring was included in the original archive. This is the contract the updated browser sends, not a claim that existing firmware already supports it.

## BLE

- Advertised device name: `Veera Bot` (case sensitive)
- Service: `0000ffe0-0000-1000-8000-00805f9b34fb`
- Characteristic: `0000ffe1-0000-1000-8000-00805f9b34fb`
- Characteristic must support writes **with response**.
- Each BLE write is one ASCII command. Extended commands end with LF; `S` and `I` are single bytes without LF. Do not wait for a newline before handling those bytes.
- Payloads fit the default 20-byte BLE application payload.

| Payload | Required firmware behavior |
|---|---|
| `M:<left>,<right>\n` | Signed PWM on left and right motor pairs, each integer -255…255. Positive is forward; negative backward; zero stops that side. |
| `S` | Immediately stop **all four motors and the right hand**; cancel pending motion/gesture routines. |
| `H:wave\n` | Trigger one bounded, calibrated right-hand servo wave. The ESP32 owns the entire sequence. |
| `I` | Tell the DFPlayer Mini to play the prerecorded Introduction MP3 from its microSD card through the connected speaker. No text or audio follows this trigger. |

## Introduction and right-hand signal flow

```text
Introduction button -> Website -> ESP32 -> DFPlayer Mini -> prerecorded MP3 -> Speaker
Wave Hand button    -> Website -> ESP32 -> Servo -> Wave movement
```

**Introduction:** The website sends only the single byte `I`, with no text, track file or audio payload, and opens no Introduction panel. Store the prerecorded MP3 on the **DFPlayer Mini's microSD card**, not in website assets. The firmware maps `I` to the chosen DFPlayer track. For example, with a library supporting `playMp3Folder(1)`, an implementation can map the trigger to `/mp3/0001.mp3`; use the naming and indexing required by your actual DFPlayer library/firmware. This is an integration example, not firmware already included in the repository.

The prerecorded introduction may contain the existing message: “Hi, I am Veera Bot. I am developed by Devaansh, Johnson, and Abhiram.” Record/manage that file outside the website. There is no browser speech synthesis, custom message input, voice generation, audio generation, audio upload or browser playback.

**Wave Hand:** The website sends only `H:wave\n`. The ESP32 starts its nonblocking, calibrated right-hand servo wave routine, enforcing safe limits and completion. The browser neither computes servo angles nor sends subsequent wave steps or timed hand-stop signals. Ignore or safely reject new wave requests while a wave is already in progress, instead of accumulating an unbounded sequence. The configurable browser cooldown is not a replacement for this firmware guard.

**Uses:** Informational content only. There is no `U`/audio command. Opening the Uses modal issues the global `S` safety stop so a hidden joystick cannot keep driving.

**Emergency STOP:** `S` stops drive and wave motion independently of the wave cooldown. It must interrupt an active servo sequence. Introduction and wave triggers must not interrupt the motor heartbeat/command processing loop. A command write confirms transport delivery only, not servo movement or MP3 playback.

## Four-motor mapping

```
left-front  = leftSpeed
left-rear   = leftSpeed
right-front = rightSpeed
right-rear  = rightSpeed
```

Account for mirrored wiring and motor-driver polarity in firmware. Verify each side with the wheels off the ground. The browser uses x-positive right and y-positive forward:

```
left  = y + x
right = y - x
normalize both by max(1, abs(left), abs(right))
scale to signed 255 PWM
```

A radial 8% dead zone is rescaled continuously. Input magnitude sets speed. Full left produces negative left PWM and positive right PWM; full right does the opposite. Diagonals slow or stop the inner pair while the outer pair moves. This is turning, not lateral translation.

The browser sends at 20 Hz while a drive gesture is held, including stationary speed heartbeats. Normal acceleration/deceleration is limited to 300 PWM units per second. Reversals pass through zero. Release, cancellation and STOP clear targets and issue `S` without ramping.

## Required firmware safety

1. Start with PWM=0; never restore a previous motion after boot or reconnect.
2. Enforce a **350 ms motor-command watchdog** on the ESP32. If no valid `M` command arrives in that time, stop every drive motor. Do not refresh this timer on wave or Introduction triggers.
3. Stop all motion immediately on BLE disconnect. Keep the watchdog independent of the BLE callback and the main movement routine.
4. Parse numbers strictly; reject out-of-range, malformed or unknown commands safely. Cancel motor motion on invalid motor packets. Limit input-buffer length.
5. `S` must interrupt any running drive/hand sequence. Never block command handling while a gesture or predefined presentation is running.
6. The ESP32 must enforce calibrated servo angle, speed and finite wave-duration limits itself, without relying on a browser timer. Define a safe resting position and hold/de-energize behavior for the actual mechanism; do not assume a universal angle or power-off policy. The UI request indicator clears after 2 seconds only as visual feedback; it does not indicate completion or set the servo duration.
7. Follow motor-driver direction-change dead time and braking/coasting requirements. Browser zero-crossing is not a replacement for hardware timing.
8. Keep a physical emergency stop and safe demonstration area.

## Queue and stop delivery

BLE permits only one write at a time. The browser coalesces unsent motor updates to the latest sample. A STOP discards queued motion/actions and is sent next after any already-in-flight GATT write. That in-flight packet cannot be recalled. A 300 ms write timeout faults and closes the connection rather than replaying stale motion. Manual disconnect flushes STOP first where possible.

A successful GATT write is **not** confirmation of physical braking or proof that the firmware understood an extended command. Lost radio links, killed browser processes, hardware faults and stalled tabs require the ESP32 watchdog and physical safety measures. No motor telemetry or protocol-acknowledgment capability was present in the archive; the UI labels values as commanded PWM and shows unavailable telemetry honestly.

## Bench acceptance before demonstrations

- Wheels lifted: verify all four motors, direction polarity and each motor pair.
- Verify left/right turns and all four diagonals; check speed scales with displacement.
- Confirm release and global STOP act promptly; second-finger Wave Hand and Introduction must not hijack steering.
- Confirm held joystick cannot resume after STOP until a new gesture.
- Pull the radio link / kill the tab; measure firmware stop within the watchdog interval.
- Verify firmware-enforced wave limits/duration, emergency interruption, busy-request handling and browser cooldown.
- Confirm reconnect starts stationary and wave/Introduction routines do not block emergency handling.
- Confirm one Introduction tap plays the correct prerecorded DFPlayer microSD track; disconnected taps send nothing, and opening Uses triggers no audio.


## Wi-Fi / WebSocket / HTTP adapter boundary

`RobotController` accepts a `RobotTransport` with `isConnected()` and `send(payload, kind)`. Its `setJoystick`, `calculateMotorSpeeds`, `sendMotorCommand`, `stopRobot`, `waveRightHand` and `triggerIntroduction` logic is independent of BLE and can be reused unchanged by another adapter.

The included transport is BLE. A future Wi-Fi transport should preserve these exact command semantics and provide real connection/health checks. For WebSocket, enable controls only after a verified connection/handshake, use secure `wss://` when the page is HTTPS, and detect stale sockets with heartbeats. For HTTP, a saved URL alone is not a connection: verify endpoint health and command delivery, serialize requests and use short timeouts. Coalesce pending motor samples and prioritize `S`; never replay movement after reconnect. The firmware watchdog remains mandatory for either method.

Use same-origin relative API URLs with a server proxy if a separate backend is required; never point a user's browser at the development machine's localhost. Endpoint, credentials, handshake and pin assignments are intentionally not invented here: configure the adapter to match your actual ESP32 firmware/network. No Wi-Fi service or unverified connection state is presented as implemented.
