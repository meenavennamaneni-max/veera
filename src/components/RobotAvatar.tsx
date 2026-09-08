import { Fragment } from 'react';
import type { ConnectionStatus } from '../types/robot';

interface RobotAvatarProps {
  status: ConnectionStatus;
  isMoving: boolean;
  isHandMoving: boolean;
}

export default function RobotAvatar({ status, isMoving, isHandMoving }: RobotAvatarProps) {
  const isConnected = status === 'connected';
  const eyeColor = isConnected ? '#FFD700' : '#444';
  const bodyGlow = isConnected ? 'drop-shadow(0 0 12px rgba(255,215,0,0.5))' : 'drop-shadow(0 0 4px rgba(80,80,80,0.3))';

  return (
    <div className="flex flex-col items-center justify-center select-none">
      <svg
        width="160"
        height="220"
        viewBox="0 0 160 220"
        style={{ filter: bodyGlow }}
        className={isMoving ? 'animate-bounce' : ''}
      >
        {/* Antenna */}
        <line x1="80" y1="8" x2="80" y2="22" stroke="#888" strokeWidth="3" strokeLinecap="round" />
        <circle
          cx="80"
          cy="6"
          r="5"
          fill={isConnected ? '#FFD700' : '#444'}
          className={isConnected ? 'pulse-ring' : ''}
          style={isConnected ? { filter: 'drop-shadow(0 0 6px #FFD700)' } : {}}
        />

        {/* HEAD - Square */}
        <rect
          x="30"
          y="22"
          width="100"
          height="80"
          rx="6"
          ry="6"
          fill="#1a1a2e"
          stroke={isConnected ? '#FFD700' : '#555'}
          strokeWidth="2"
        />

        {/* Head panel lines */}
        <line x1="30" y1="42" x2="130" y2="42" stroke="#333" strokeWidth="1" />
        <line x1="80" y1="22" x2="80" y2="102" stroke="#333" strokeWidth="1" />

        {/* HEAD corner bolts */}
        <circle cx="36" cy="28" r="3" fill="#333" stroke="#555" strokeWidth="1" />
        <circle cx="124" cy="28" r="3" fill="#333" stroke="#555" strokeWidth="1" />
        <circle cx="36" cy="96" r="3" fill="#333" stroke="#555" strokeWidth="1" />
        <circle cx="124" cy="96" r="3" fill="#333" stroke="#555" strokeWidth="1" />

        {/* EYES */}
        {/* Left Eye */}
        <rect x="38" y="48" width="30" height="20" rx="3" fill="#0a0a1a" stroke={eyeColor} strokeWidth="1.5" />
        <rect
          x="42"
          y="52"
          width="22"
          height="12"
          rx="2"
          fill={eyeColor}
          style={isConnected ? { filter: `drop-shadow(0 0 6px ${eyeColor})` } : {}}
          opacity={isConnected ? 1 : 0.3}
        />
        {/* Eye scan line */}
        {isConnected && (
          <rect x="42" y="55" width="22" height="2" fill="#fff" opacity="0.4">
            <animate attributeName="y" values="52;60;52" dur="2s" repeatCount="indefinite" />
          </rect>
        )}

        {/* Right Eye */}
        <rect x="92" y="48" width="30" height="20" rx="3" fill="#0a0a1a" stroke={eyeColor} strokeWidth="1.5" />
        <rect
          x="96"
          y="52"
          width="22"
          height="12"
          rx="2"
          fill={eyeColor}
          style={isConnected ? { filter: `drop-shadow(0 0 6px ${eyeColor})` } : {}}
          opacity={isConnected ? 1 : 0.3}
        />
        {isConnected && (
          <rect x="96" y="55" width="22" height="2" fill="#fff" opacity="0.4">
            <animate attributeName="y" values="52;60;52" dur="2s" begin="0.3s" repeatCount="indefinite" />
          </rect>
        )}

        {/* MOUTH / Speaker grille */}
        <rect x="45" y="78" width="70" height="16" rx="4" fill="#0a0a1a" stroke="#444" strokeWidth="1" />
        {/* Grille bars */}
        {[50, 58, 66, 74, 82, 90, 98, 106].map((x, i) => (
          <rect
            key={i}
            x={x}
            y="80"
            width="3"
            height="12"
            rx="1"
            fill="#333"
          >
          </rect>
        ))}

        {/* NECK */}
        <rect x="65" y="102" width="30" height="14" rx="3" fill="#222" stroke="#444" strokeWidth="1" />
        <rect x="70" y="105" width="20" height="2" rx="1" fill="#555" />
        <rect x="70" y="110" width="20" height="2" rx="1" fill="#555" />

        {/* BODY - Square */}
        <rect
          x="20"
          y="116"
          width="120"
          height="90"
          rx="8"
          ry="8"
          fill="#141424"
          stroke={isConnected ? '#FFD700' : '#444'}
          strokeWidth="2"
        />

        {/* Body panel details */}
        <rect x="30" y="126" width="100" height="60" rx="4" fill="#0f0f1e" stroke="#333" strokeWidth="1" />

        {/* Center chest display */}
        <rect x="45" y="132" width="70" height="35" rx="3" fill="#0a0a18" stroke={isConnected ? '#FFD700' : '#333'} strokeWidth="1" />

        {/* Chest display content */}
        {isConnected ? (
          <>
            <text x="80" y="148" textAnchor="middle" fill="#FFD700" fontSize="7" fontFamily="monospace" fontWeight="bold">
              VEERA BOT
            </text>
            <text x="80" y="158" textAnchor="middle" fill="#00ff88" fontSize="5.5" fontFamily="monospace">
              {isMoving ? 'MOVING...' : isHandMoving ? 'RIGHT HAND' : 'STANDBY'}
            </text>
            {/* Mini bar graph */}
            {[0, 1, 2, 3, 4].map((i) => (
              <rect
                key={i}
                x={53 + i * 10}
                y={170 - (i % 3 + 1) * 4}
                width="6"
                height={(i % 3 + 1) * 4}
                rx="1"
                fill="#FFD700"
                opacity="0.6"
              />
            ))}
          </>
        ) : (
          <text x="80" y="152" textAnchor="middle" fill="#444" fontSize="6" fontFamily="monospace">
            OFFLINE
          </text>
        )}

        {/* Body corner bolts */}
        <circle cx="28" cy="124" r="3" fill="#222" stroke="#444" strokeWidth="1" />
        <circle cx="132" cy="124" r="3" fill="#222" stroke="#444" strokeWidth="1" />
        <circle cx="28" cy="198" r="3" fill="#222" stroke="#444" strokeWidth="1" />
        <circle cx="132" cy="198" r="3" fill="#222" stroke="#444" strokeWidth="1" />

        {/* Body side vents */}
        {[195, 203].map((y, i) => (
          <Fragment key={i}>
            <rect x="24" y={y} width="16" height="3" rx="1" fill="#333" />
            <rect x="120" y={y} width="16" height="3" rx="1" fill="#333" />
          </Fragment>
        ))}

        {/* Robot right hand (front-facing view) */}
        <g style={{ transformOrigin: '20px 130px' }}>
          <rect
            x="0"
            y="120"
            width="18"
            height="55"
            rx="6"
            fill="#181828"
            stroke={isConnected ? '#555' : '#333'}
            strokeWidth="1.5"
          />
          {/* Arm joint */}
          <circle cx="9" cy="120" r="6" fill="#222" stroke={isConnected ? '#FFD700' : '#444'} strokeWidth="1.5" />
          {/* Arm detail */}
          <rect x="4" y="130" width="10" height="2" rx="1" fill="#333" />
          <rect x="4" y="138" width="10" height="2" rx="1" fill="#333" />
          {/* Hand */}
          <rect
            x="1"
            y="172"
            width="16"
            height="14"
            rx="4"
            fill="#1a1a2e"
            stroke={isHandMoving && isConnected ? '#FFD700' : '#444'}
            strokeWidth="1.5"
          />
          {/* Fingers hint */}
          {[3, 7, 11].map((x, i) => (
            <rect key={i} x={x} y="183" width="3" height="6" rx="1" fill="#333" />
          ))}
        </g>

        {/* LEGS */}
        {/* Left leg */}
        <rect x="35" y="206" width="28" height="12" rx="3" fill="#1a1a2e" stroke="#444" strokeWidth="1" />
        {/* Right leg */}
        <rect x="97" y="206" width="28" height="12" rx="3" fill="#1a1a2e" stroke="#444" strokeWidth="1" />

        {/* Feet */}
        <rect x="30" y="214" width="36" height="6" rx="3" fill="#222" stroke="#444" strokeWidth="1" />
        <rect x="94" y="214" width="36" height="6" rx="3" fill="#222" stroke="#444" strokeWidth="1" />
      </svg>

      {/* Status label below robot */}
      <div
        className={`mt-2 px-4 py-1 rounded-full text-xs font-bold tracking-widest uppercase font-mono ${
          isConnected
            ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30'
            : 'bg-gray-800 text-gray-500 border border-gray-700'
        }`}
      >
        {isConnected
          ? isMoving
            ? 'MOVING'
            : isHandMoving
            ? 'RIGHT HAND'
            : 'STANDBY'
          : 'OFFLINE'}
      </div>
    </div>
  );
}
