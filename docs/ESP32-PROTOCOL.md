# ESP32 integration contract

No firmware or wiring was included in the original archive. This is the contract the updated browser sends, not a claim that existing firmware already supports it.

## BLE

- Advertised device name: `Veera Bot` (case sensitive)
- Service: `0000ffe0-0000-1000-8000-00805f9b34fb`
- Characteristic: `0000ffe1-0000-1000-8000-00805f9b34fb`
- Characteristic must support writes **with response**.
- Each BLE write is one ASCII command. Extended commands end with LF; legacy `S`, `I`, `U` are single bytes without LF. Do not wait for a newline before handling those bytes.
- Payloads fit the default 20-byte BLE application payload.

| Payload | Required firmware behavior |
|---|---|
| `M:<left>,<right>\n` | Signed PWM on left and right motor pairs, each integer -255…255. Positive is forward; negative backward; zero stops that side. |
| `S` | Immediately stop **all four motors and the right hand**; cancel pending motion/gesture routines. |
| `H:wave\n` | Run a bounded, calibrated right-hand wave. |
| `H:raise\n` | Raise only the right hand within safe limits. |
| `H:lower\n` | Lower only the right hand within safe limits. |
| `H:stop\n` | Cancel right-hand movement without changing drive speeds. |
| `I` | Optional predefined introduction routine; no custom text follows. |
| `U` | Optional predefined uses routine; no custom text follows. |

If onboard predefined audio exists, `I` should use: “Hi, I am Veera Bot. I am developed by Devaansh, Johnson, and Abhiram.” The website itself only displays the text and sends `I`; it does not synthesize speech.

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
2. Enforce a **350 ms motor-command watchdog** on the ESP32. If no valid `M` command arrives in that time, stop every drive motor. Do not refresh this timer on hand, intro or uses commands.
3. Stop all motion immediately on BLE disconnect. Keep the watchdog independent of the BLE callback and the main movement routine.
4. Parse numbers strictly; reject out-of-range, malformed or unknown commands safely. Cancel motor motion on invalid motor packets. Limit input-buffer length.
5. `S` must interrupt any running drive/hand sequence. Never block command handling while a gesture or predefined presentation is running.
6. Hand actions must have firmware-enforced angle, speed and duration limits. The browser also sends a hand stop after 2 seconds, but firmware must independently bound each gesture to 2 seconds. Define the safe hold/de-energize behavior for the actual servo/mechanism; do not assume a universal angle or power-off policy.
7. Follow motor-driver direction-change dead time and braking/coasting requirements. Browser zero-crossing is not a replacement for hardware timing.
8. Keep a physical emergency stop and safe demonstration area.

## Queue and stop delivery

BLE permits only one write at a time. The browser coalesces unsent motor updates to the latest sample. A STOP discards queued motion/actions and is sent next after any already-in-flight GATT write. That in-flight packet cannot be recalled. A 300 ms write timeout faults and closes the connection rather than replaying stale motion. Manual disconnect flushes STOP first where possible.

A successful GATT write is **not** confirmation of physical braking or proof that the firmware understood an extended command. Lost radio links, killed browser processes, hardware faults and stalled tabs require the ESP32 watchdog and physical safety measures. No motor telemetry or protocol-acknowledgment capability was present in the archive; the UI labels values as commanded PWM and shows unavailable telemetry honestly.

## Bench acceptance before demonstrations

- Wheels lifted: verify all four motors, direction polarity and each motor pair.
- Verify left/right turns and all four diagonals; check speed scales with displacement.
- Confirm release, STOP and hand-stop act promptly; second touch must not hijack steering.
- Confirm held joystick cannot resume after STOP until a new gesture.
- Pull the radio link / kill the tab; measure firmware stop within the watchdog interval.
- Verify hand limits, 2-second maximum duration, stop interruption and cooldown.
- Confirm reconnect starts stationary and INTRO/USES do not block emergency handling.
