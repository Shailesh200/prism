import type { ReactElement } from "react";

/** Job-rail motif from the Stitch Wake screen. */
export function WakeJobRailArt(): ReactElement {
  return (
    <svg
      viewBox="0 0 496 176"
      className="wake-door__svg"
      fill="none"
      aria-hidden
      focusable={false}
    >
      <defs>
        <pattern
          id="wake-dispatch-grid"
          width="20"
          height="20"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 20 0 L 0 0 0 20"
            fill="none"
            stroke="#2A334A"
            strokeOpacity="0.35"
            strokeWidth="0.75"
          />
        </pattern>
      </defs>
      <rect width="496" height="176" fill="#0A0E1A" />
      <rect width="496" height="176" fill="url(#wake-dispatch-grid)" />
      <line
        x1="16"
        x2="480"
        y1="42"
        y2="42"
        stroke="#2A334A"
        strokeDasharray="2 4"
        strokeOpacity="0.6"
        strokeWidth="1"
      />
      <line
        x1="16"
        x2="480"
        y1="82"
        y2="82"
        stroke="#2A334A"
        strokeDasharray="2 4"
        strokeOpacity="0.6"
        strokeWidth="1"
      />
      <line
        x1="16"
        x2="480"
        y1="122"
        y2="122"
        stroke="#2A334A"
        strokeDasharray="2 4"
        strokeOpacity="0.6"
        strokeWidth="1"
      />
      <rect
        fill="#00C2C2"
        fillOpacity="0.8"
        height="16"
        rx="4"
        width="76"
        x="36"
        y="34"
      />
      <rect
        fill="#00C2C2"
        fillOpacity="0.25"
        height="16"
        rx="4"
        width="134"
        x="120"
        y="34"
      />
      <rect
        fill="#00C2C2"
        fillOpacity="0.6"
        height="16"
        rx="4"
        width="92"
        x="264"
        y="34"
      />
      <rect
        fill="#00C2C2"
        fillOpacity="0.4"
        height="16"
        rx="4"
        width="84"
        x="366"
        y="34"
      />
      <rect
        fill="#00C2C2"
        fillOpacity="0.4"
        height="16"
        rx="4"
        width="128"
        x="24"
        y="74"
      />
      <rect
        fill="#00C2C2"
        fillOpacity="0.8"
        height="16"
        rx="4"
        width="60"
        x="160"
        y="74"
      />
      <rect
        fill="#00C2C2"
        fillOpacity="0.25"
        height="16"
        rx="4"
        width="144"
        x="228"
        y="74"
      />
      <rect
        fill="#00C2C2"
        fillOpacity="0.6"
        height="16"
        rx="4"
        width="72"
        x="382"
        y="74"
      />
      <rect
        fill="#00C2C2"
        fillOpacity="0.6"
        height="16"
        rx="4"
        width="170"
        x="52"
        y="114"
      />
      <rect
        fill="#00C2C2"
        fillOpacity="0.4"
        height="16"
        rx="4"
        width="86"
        x="230"
        y="114"
      />
      <rect
        fill="#00C2C2"
        fillOpacity="0.8"
        height="16"
        rx="4"
        width="130"
        x="324"
        y="114"
      />
      <line
        x1="214"
        x2="214"
        y1="12"
        y2="152"
        stroke="#00C2C2"
        strokeWidth="1.5"
      />
      <polygon fill="#00C2C2" points="210,14 218,14 214,20" />
      <rect
        fill="#131926"
        height="14"
        rx="2"
        stroke="#00C2C2"
        strokeWidth="0.75"
        width="56"
        x="186"
        y="6"
      />
      <text
        fill="#00C2C2"
        fontFamily="var(--prism-font-mono, 'JetBrains Mono', ui-monospace, monospace)"
        fontSize="8.5"
        fontWeight="500"
        textAnchor="middle"
        x="214"
        y="16.5"
      >
        t = 042ms
      </text>
      <line
        x1="0"
        x2="496"
        y1="152"
        y2="152"
        stroke="#2A334A"
        strokeWidth="1"
      />
      <g stroke="#2A334A" strokeWidth="1">
        <line x1="40" x2="40" y1="152" y2="158" />
        <line x1="80" x2="80" y1="152" y2="155" />
        <line x1="120" x2="120" y1="152" y2="158" />
        <line x1="160" x2="160" y1="152" y2="155" />
        <line x1="200" x2="200" y1="152" y2="158" />
        <line x1="240" x2="240" y1="152" y2="155" />
        <line x1="280" x2="280" y1="152" y2="158" />
        <line x1="320" x2="320" y1="152" y2="155" />
        <line x1="360" x2="360" y1="152" y2="158" />
        <line x1="400" x2="400" y1="152" y2="155" />
        <line x1="440" x2="440" y1="152" y2="158" />
      </g>
      <g
        fill="#94A3B8"
        fontFamily="var(--prism-font-mono, 'JetBrains Mono', ui-monospace, monospace)"
        fontSize="8"
        letterSpacing="0.02em"
      >
        <text textAnchor="middle" x="40" y="168">
          00ms
        </text>
        <text textAnchor="middle" x="120" y="168">
          20ms
        </text>
        <text textAnchor="middle" x="200" y="168">
          40ms
        </text>
        <text textAnchor="middle" x="280" y="168">
          60ms
        </text>
        <text textAnchor="middle" x="360" y="168">
          80ms
        </text>
        <text textAnchor="middle" x="440" y="168">
          100ms
        </text>
      </g>
    </svg>
  );
}

/** Hex / blast-radius motif from the Stitch Wake screen. */
export function WakeHexMapArt(): ReactElement {
  return (
    <svg
      viewBox="0 0 496 176"
      className="wake-door__svg"
      fill="none"
      aria-hidden
      focusable={false}
    >
      <rect width="496" height="176" fill="#0A0E1A" />
      <circle
        cx="248"
        cy="88"
        r="38"
        fill="none"
        stroke="#00C2C2"
        strokeDasharray="3 3"
        strokeOpacity="0.3"
        strokeWidth="1"
      />
      <circle
        cx="248"
        cy="88"
        r="74"
        fill="none"
        stroke="#00C2C2"
        strokeDasharray="4 4"
        strokeOpacity="0.2"
        strokeWidth="1"
      />
      <circle
        cx="248"
        cy="88"
        r="114"
        fill="none"
        stroke="#00C2C2"
        strokeDasharray="2 6"
        strokeOpacity="0.15"
        strokeWidth="0.75"
      />
      <path
        d="M 248 88 L 188 54 M 248 88 L 308 54 M 248 88 L 248 156 M 248 88 L 128 88 M 248 88 L 368 88 M 188 54 L 128 88 M 308 54 L 368 88"
        stroke="#00C2C2"
        strokeOpacity="0.45"
        strokeWidth="0.9"
      />
      <g stroke="#2A334A" strokeWidth="1">
        <polygon
          fill="#131926"
          points="248,68 265,78 265,98 248,108 231,98 231,78"
          stroke="#00C2C2"
          strokeWidth="1.2"
        />
        <polygon
          fill="#00C2C2"
          fillOpacity="0.35"
          points="188,34 205,44 205,64 188,74 171,64 171,44"
        />
        <polygon
          fill="#00C2C2"
          fillOpacity="0.15"
          points="308,34 325,44 325,64 308,74 291,64 291,44"
        />
        <polygon
          fill="#00C2C2"
          fillOpacity="0.15"
          points="128,68 145,78 145,98 128,108 111,98 111,78"
        />
        <polygon
          fill="#00C2C2"
          fillOpacity="0.7"
          points="368,68 385,78 385,98 368,108 351,98 351,78"
        />
        <polygon
          fill="#00C2C2"
          fillOpacity="0.35"
          points="248,136 265,146 265,166 248,176 231,166 231,146"
        />
        <polygon
          fill="none"
          points="248,0 265,10 265,30 248,40 231,30 231,10"
          strokeOpacity="0.4"
        />
        <polygon
          fill="none"
          points="68,34 85,44 85,64 68,74 51,64 51,44"
          strokeOpacity="0.3"
        />
        <polygon
          fill="#00C2C2"
          fillOpacity="0.1"
          points="68,102 85,112 85,132 68,142 51,132 51,112"
          strokeOpacity="0.35"
        />
        <polygon
          fill="none"
          points="188,102 205,112 205,132 188,142 171,132 171,112"
          strokeOpacity="0.4"
        />
        <polygon
          fill="#00C2C2"
          fillOpacity="0.25"
          points="308,102 325,112 325,132 308,142 291,132 291,112"
          strokeOpacity="0.5"
        />
        <polygon
          fill="none"
          points="428,34 445,44 445,64 428,74 411,64 411,44"
          strokeOpacity="0.3"
        />
        <polygon
          fill="#00C2C2"
          fillOpacity="0.15"
          points="428,102 445,112 445,132 428,142 411,132 411,112"
          strokeOpacity="0.4"
        />
      </g>
      <circle cx="248" cy="88" fill="#00C2C2" r="4.5" />
      <circle cx="248" cy="88" fill="#0A0E1A" r="1.5" />
      <line
        x1="248"
        x2="248"
        y1="62"
        y2="66"
        stroke="#00C2C2"
        strokeWidth="1.2"
      />
      <line
        x1="248"
        x2="248"
        y1="110"
        y2="114"
        stroke="#00C2C2"
        strokeWidth="1.2"
      />
      <line
        x1="222"
        x2="226"
        y1="88"
        y2="88"
        stroke="#00C2C2"
        strokeWidth="1.2"
      />
      <line
        x1="270"
        x2="274"
        y1="88"
        y2="88"
        stroke="#00C2C2"
        strokeWidth="1.2"
      />
      <text
        fill="#94A3B8"
        fillOpacity="0.7"
        fontFamily="var(--prism-font-mono, 'JetBrains Mono', ui-monospace, monospace)"
        fontSize="8"
        x="16"
        y="24"
      >
        RADIAL: 124μm
      </text>
      <text
        fill="#94A3B8"
        fillOpacity="0.7"
        fontFamily="var(--prism-font-mono, 'JetBrains Mono', ui-monospace, monospace)"
        fontSize="8"
        x="16"
        y="36"
      >
        INDEX : 0x7E2
      </text>
      <text
        fill="#00C2C2"
        fillOpacity="0.8"
        fontFamily="var(--prism-font-mono, 'JetBrains Mono', ui-monospace, monospace)"
        fontSize="8"
        textAnchor="end"
        x="480"
        y="24"
      >
        BLAST: 14 NODES
      </text>
      <text
        fill="#94A3B8"
        fillOpacity="0.7"
        fontFamily="var(--prism-font-mono, 'JetBrains Mono', ui-monospace, monospace)"
        fontSize="8"
        textAnchor="end"
        x="480"
        y="36"
      >
        MAP : STABLE
      </text>
    </svg>
  );
}
