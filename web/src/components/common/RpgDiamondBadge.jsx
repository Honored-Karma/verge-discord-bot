import React from 'react';

/**
 * RPG Diamond Perk Badge
 * Implements the authentic glowing diamond perk style with halftone pattern and crisp icons
 * (As requested in user reference)
 */
export function RpgDiamondBadge({ 
  type = 'attribute', 
  color = 'purple', 
  size = 56, 
  glow = true,
  className = '',
  style = {}
}) {
  const colorMap = {
    purple: {
      from: '#d946ef',
      mid: '#9333ea',
      to: '#3b0764',
      border: 'rgba(216, 180, 254, 0.8)',
      glow: 'rgba(168, 85, 247, 0.6)',
      icon: '#ffffff'
    },
    crimson: {
      from: '#f43f5e',
      mid: '#e11d48',
      to: '#4c0519',
      border: 'rgba(254, 205, 211, 0.8)',
      glow: 'rgba(244, 63, 94, 0.6)',
      icon: '#ffffff'
    },
    cyan: {
      from: '#38bdf8',
      mid: '#0284c7',
      to: '#082f49',
      border: 'rgba(186, 230, 253, 0.8)',
      glow: 'rgba(56, 189, 248, 0.6)',
      icon: '#ffffff'
    },
    amber: {
      from: '#fde047',
      mid: '#d97706',
      to: '#451a03',
      border: 'rgba(254, 240, 138, 0.8)',
      glow: 'rgba(245, 158, 11, 0.6)',
      icon: '#ffffff'
    },
    emerald: {
      from: '#4ade80',
      mid: '#059669',
      to: '#022c22',
      border: 'rgba(187, 247, 208, 0.8)',
      glow: 'rgba(16, 185, 129, 0.6)',
      icon: '#ffffff'
    }
  };

  const scheme = colorMap[color] || colorMap.purple;
  const uniqueId = `rpg-diamond-${type}-${color}`;

  // SVG glyph based on perk type
  const renderGlyph = () => {
    switch (type) {
      case 'attribute': // Chakra / Wheel of energy
        return (
          <g fill={scheme.icon} stroke={scheme.icon} strokeWidth="1.5">
            <circle cx="50" cy="50" r="10" fill="none" strokeWidth="2.5" />
            <circle cx="50" cy="50" r="4" fill={scheme.icon} />
            <circle cx="50" cy="22" r="3.5" />
            <circle cx="50" cy="78" r="3.5" />
            <circle cx="22" cy="50" r="3.5" />
            <circle cx="78" cy="50" r="3.5" />
            <circle cx="30" cy="30" r="3.5" />
            <circle cx="70" cy="70" r="3.5" />
            <circle cx="30" cy="70" r="3.5" />
            <circle cx="70" cy="30" r="3.5" />
            <line x1="50" y1="26" x2="50" y2="40" />
            <line x1="50" y1="60" x2="50" y2="74" />
            <line x1="26" y1="50" x2="40" y2="50" />
            <line x1="60" y1="50" x2="74" y2="50" />
            <line x1="33" y1="33" x2="43" y2="43" />
            <line x1="57" y1="57" x2="67" y2="67" />
            <line x1="33" y1="67" x2="43" y2="57" />
            <line x1="57" y1="43" x2="67" y2="33" />
          </g>
        );

      case 'vitality': // Heart / Life force
      case 'heart':
        return (
          <path
            d="M50 74 C50 74 26 56 26 38 C26 28 34 22 42 22 C46.5 22 49 24.5 50 26.5 C51 24.5 53.5 22 58 22 C66 22 74 28 74 38 C74 56 50 74 50 74 Z"
            fill={scheme.icon}
            opacity="0.95"
          />
        );

      case 'strength': // Bicep / Muscle strength
        return (
          <path
            d="M28 54 C28 42 38 34 50 34 C58 34 64 38 68 44 C72 50 72 58 66 64 C60 70 50 70 42 66 L34 72 C30 68 28 62 28 54 Z M48 40 C42 40 36 45 36 52 C36 56 38 60 42 61 L54 53 C56 51 57 48 56 45 C54 42 51 40 48 40 Z"
            fill={scheme.icon}
          />
        );

      case 'awakening': // Silhouette head with glowing eyes / Olitsetvorenie
        return (
          <g fill={scheme.icon}>
            <path d="M50 20 C38 20 30 28 30 40 C30 48 34 54 36 60 L40 68 C44 72 56 72 60 68 L64 60 C66 54 70 48 70 40 C70 28 62 20 50 20 Z" />
            <path d="M30 36 L24 28 L34 32 Z M70 36 L76 28 L66 32 Z" />
            <ellipse cx="42" cy="42" rx="4" ry="2" fill="#fff" />
            <ellipse cx="58" cy="42" rx="4" ry="2" fill="#fff" />
          </g>
        );

      case 'exchange': // Dual opposing arrows / Economy swap
      case 'economy':
        return (
          <g fill={scheme.icon}>
            <path d="M38 26 L38 58 L28 48 L24 52 L38 66 L52 52 L48 48 L38 58 Z" transform="scale(0.85) translate(4, 4)" />
            <path d="M62 74 L62 42 L72 52 L76 48 L62 34 L48 48 L52 52 L62 42 Z" transform="scale(0.85) translate(14, 8)" />
          </g>
        );

      case 'sword': // Crossed Katanas / Martial styles
        return (
          <g stroke={scheme.icon} strokeWidth="3" strokeLinecap="round">
            <line x1="28" y1="72" x2="72" y2="28" />
            <line x1="28" y1="28" x2="72" y2="72" />
            <line x1="24" y1="76" x2="32" y2="68" strokeWidth="4" />
            <line x1="24" y1="24" x2="32" y2="32" strokeWidth="4" />
          </g>
        );

      case 'shield': // Aegis / Defense
        return (
          <path
            d="M50 22 L72 32 L72 52 C72 66 50 76 50 76 C50 76 28 66 28 52 L28 32 Z"
            fill={scheme.icon}
            opacity="0.9"
          />
        );

      case 'crystal': // Well Anomaly / Majin
      default:
        return (
          <polygon
            points="50,20 68,38 60,74 40,74 32,38"
            fill={scheme.icon}
            opacity="0.9"
          />
        );
    }
  };

  return (
    <div 
      className={`rpg-diamond-badge ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        filter: glow ? `drop-shadow(0 0 ${size * 0.18}px ${scheme.glow})` : undefined,
        ...style
      }}
    >
      <svg 
        viewBox="0 0 100 100" 
        width="100%" 
        height="100%"
        style={{ overflow: 'visible' }}
      >
        <defs>
          <radialGradient id={`${uniqueId}-grad`} cx="50%" cy="35%" r="65%">
            <stop offset="0%" stopColor={scheme.from} stopOpacity="1" />
            <stop offset="45%" stopColor={scheme.mid} stopOpacity="0.95" />
            <stop offset="100%" stopColor={scheme.to} stopOpacity="1" />
          </radialGradient>

          <pattern id={`${uniqueId}-dots`} x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.1" fill="rgba(255, 255, 255, 0.22)" />
            <circle cx="6" cy="6" r="0.8" fill="rgba(0, 0, 0, 0.35)" />
          </pattern>

          <radialGradient id={`${uniqueId}-flare`} cx="50%" cy="15%" r="40%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>

          <clipPath id={`${uniqueId}-clip`}>
            <polygon points="50,4 96,50 50,96 4,50" />
          </clipPath>
        </defs>

        {/* Diamond Outer Border Glow */}
        <polygon 
          points="50,2 98,50 50,98 2,50" 
          fill="none" 
          stroke={scheme.border} 
          strokeWidth="2.5"
          opacity="0.8"
        />

        {/* Diamond Inner Body with Gradient & Halftone Clip */}
        <g clipPath={`url(#${uniqueId}-clip)`}>
          <polygon points="50,4 96,50 50,96 4,50" fill={`url(#${uniqueId}-grad)`} />
          <rect x="0" y="0" width="100" height="100" fill={`url(#${uniqueId}-dots)`} opacity="0.8" />
          <circle cx="50" cy="25" r="35" fill={`url(#${uniqueId}-flare)`} />
          {renderGlyph()}
        </g>

        {/* Subtle Bevel Highlight */}
        <polyline 
          points="4,50 50,4 96,50" 
          fill="none" 
          stroke="rgba(255, 255, 255, 0.7)" 
          strokeWidth="1.5" 
        />
      </svg>
    </div>
  );
}
