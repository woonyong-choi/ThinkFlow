// tokens.json: 생성물, 손으로 고치지 않음
function freeze(node) {
  if (typeof node !== 'object') return node;
  return Object.freeze(Object.fromEntries(Object.entries(node).map(([key, value]) => [key, freeze(value)])));
}

/** CSS에 넣을 토큰 참조. 값은 `var(--…)` 문자열이다. */
export const tokens = freeze({
  "color": {
    "gray": {
      "0": "var(--color-gray-0)",
      "25": "var(--color-gray-25)",
      "50": "var(--color-gray-50)",
      "100": "var(--color-gray-100)",
      "200": "var(--color-gray-200)",
      "300": "var(--color-gray-300)",
      "600": "var(--color-gray-600)",
      "900": "var(--color-gray-900)"
    },
    "neutral": {
      "100": "var(--color-neutral-100)",
      "400": "var(--color-neutral-400)",
      "700": "var(--color-neutral-700)",
      "750": "var(--color-neutral-750)",
      "800": "var(--color-neutral-800)",
      "850": "var(--color-neutral-850)",
      "900": "var(--color-neutral-900)",
      "950": "var(--color-neutral-950)"
    },
    "blue": {
      "50": "var(--color-blue-50)",
      "400": "var(--color-blue-400)",
      "600": "var(--color-blue-600)",
      "900": "var(--color-blue-900)",
      "800": "var(--color-blue-800)"
    },
    "tone": {
      "blue": "var(--color-tone-blue)",
      "purple": "var(--color-tone-purple)",
      "green": "var(--color-tone-green)",
      "orange": "var(--color-tone-orange)",
      "gray": "var(--color-tone-gray)"
    },
    "accent": "var(--color-accent)",
    "on-accent": "var(--color-on-accent)",
    "fg": "var(--color-fg)",
    "muted": "var(--color-muted)",
    "bg": "var(--color-bg)",
    "surface": "var(--color-surface)",
    "border": "var(--color-border)",
    "card-on": "var(--color-card-on)",
    "dot": "var(--color-dot)",
    "frame": "var(--color-frame)",
    "page": "var(--color-page)",
    "gallery": "var(--color-gallery)",
    "tag": {
      "blue": "var(--color-tag-blue)",
      "purple": "var(--color-tag-purple)",
      "green": "var(--color-tag-green)",
      "orange": "var(--color-tag-orange)",
      "gray": "var(--color-tag-gray)"
    },
    "orange": {
      "100": "var(--color-orange-100)",
      "600": "var(--color-orange-600)"
    },
    "ink": {
      "900": "var(--color-ink-900)",
      "600": "var(--color-ink-600)",
      "200": "var(--color-ink-200)"
    },
    "series-1": "var(--color-series-1)",
    "series-2": "var(--color-series-2)",
    "grid": "var(--color-grid)"
  },
  "font": {
    "sans": "var(--font-sans)",
    "mono": "var(--font-mono)"
  },
  "size": {
    "text": {
      "9": "var(--size-text-9)",
      "10-5": "var(--size-text-10-5)",
      "11": "var(--size-text-11)",
      "11-5": "var(--size-text-11-5)",
      "12": "var(--size-text-12)",
      "13": "var(--size-text-13)",
      "13-5": "var(--size-text-13-5)",
      "14": "var(--size-text-14)",
      "14-5": "var(--size-text-14-5)",
      "15": "var(--size-text-15)",
      "22": "var(--size-text-22)"
    },
    "line": {
      "15": "var(--size-line-15)",
      "18": "var(--size-line-18)",
      "20": "var(--size-line-20)",
      "22": "var(--size-line-22)"
    },
    "control": "var(--size-control)",
    "pill": "var(--size-pill)",
    "tag": "var(--size-tag)",
    "icon": "var(--size-icon)",
    "packet": "var(--size-packet)",
    "halo": "var(--size-halo)",
    "marker": "var(--size-marker)",
    "marker-on": "var(--size-marker-on)",
    "grid": "var(--size-grid)",
    "grid-dot": "var(--size-grid-dot)",
    "card": "var(--size-card)",
    "node-min": "var(--size-node-min)",
    "node-max": "var(--size-node-max)",
    "node-min-h": "var(--size-node-min-h)",
    "store-min-h": "var(--size-store-min-h)",
    "store-cap": "var(--size-store-cap)",
    "figure-min": "var(--size-figure-min)",
    "chip-max": "var(--size-chip-max)",
    "caption-max": "var(--size-caption-max)",
    "figure-max": "var(--size-figure-max)",
    "gallery-column": "var(--size-gallery-column)",
    "gallery-frame": "var(--size-gallery-frame)",
    "player-chrome": "var(--size-player-chrome)",
    "embedded-chrome": "var(--size-embedded-chrome)",
    "chart-width": "var(--size-chart-width)",
    "chart-label": "var(--size-chart-label)",
    "chart-bar": "var(--size-chart-bar)",
    "chart-row": "var(--size-chart-row)",
    "chart-dot": "var(--size-chart-dot)",
    "person-w": "var(--size-person-w)",
    "person-head": "var(--size-person-head)",
    "person-shoulder": "var(--size-person-shoulder)",
    "person-body": "var(--size-person-body)",
    "state-dot": "var(--size-state-dot)",
    "table-row": "var(--size-table-row)",
    "seq-row": "var(--size-seq-row)",
    "group-title": "var(--size-group-title)",
    "chart-plot-h": "var(--size-chart-plot-h)",
    "chart-axis": "var(--size-chart-axis)",
    "chart-cell": "var(--size-chart-cell)"
  },
  "weight": {
    "medium": "var(--weight-medium)",
    "semibold": "var(--weight-semibold)"
  },
  "leading": {
    "normal": "var(--leading-normal)"
  },
  "tracking": {
    "tag": "var(--tracking-tag)",
    "frame": "var(--tracking-frame)"
  },
  "space": {
    "0-5": "var(--space-0-5)",
    "1": "var(--space-1)",
    "1-5": "var(--space-1-5)",
    "2": "var(--space-2)",
    "2-5": "var(--space-2-5)",
    "3": "var(--space-3)",
    "3-5": "var(--space-3-5)",
    "4": "var(--space-4)",
    "5": "var(--space-5)",
    "6": "var(--space-6)",
    "6-5": "var(--space-6-5)",
    "7": "var(--space-7)",
    "8": "var(--space-8)",
    "8-5": "var(--space-8-5)",
    "9": "var(--space-9)",
    "11": "var(--space-11)",
    "12": "var(--space-12)",
    "13": "var(--space-13)",
    "14": "var(--space-14)",
    "15": "var(--space-15)",
    "16": "var(--space-16)",
    "17": "var(--space-17)",
    "18": "var(--space-18)",
    "20": "var(--space-20)",
    "22": "var(--space-22)",
    "30": "var(--space-30)",
    "32": "var(--space-32)"
  },
  "radius": {
    "xs": "var(--radius-xs)",
    "sm": "var(--radius-sm)",
    "md": "var(--radius-md)",
    "lg": "var(--radius-lg)",
    "xl": "var(--radius-xl)",
    "2xl": "var(--radius-2xl)",
    "route": "var(--radius-route)",
    "full": "var(--radius-full)"
  },
  "border": {
    "hair": "var(--border-hair)",
    "thin": "var(--border-thin)",
    "lifeline": "var(--border-lifeline)",
    "tag": "var(--border-tag)",
    "edge": "var(--border-edge)",
    "strong": "var(--border-strong)"
  },
  "dash": {
    "line": "var(--dash-line)",
    "gap": "var(--dash-gap)",
    "card": "var(--dash-card)"
  },
  "opacity": {
    "tag": "var(--opacity-tag)",
    "halo": "var(--opacity-halo)",
    "tab-on": "var(--opacity-tab-on)",
    "dim": "var(--opacity-dim)"
  },
  "z": {
    "raised": "var(--z-raised)",
    "overlay": "var(--z-overlay)"
  },
  "duration": {
    "fast": "var(--duration-fast)",
    "hop": "var(--duration-hop)",
    "dwell": "var(--duration-dwell)",
    "dwell-per-char": "var(--duration-dwell-per-char)",
    "dwell-max": "var(--duration-dwell-max)",
    "step-end": "var(--duration-step-end)",
    "stagger": "var(--duration-stagger)",
    "chart-cycle": "var(--duration-chart-cycle)",
    "reveal": "var(--duration-reveal)"
  },
  "scale": {
    "zoom-max": "var(--scale-zoom-max)",
    "zoom-step": "var(--scale-zoom-step)"
  }
});

/** 배치 계산에 쓸 밝은 테마의 실제 값. 크기는 px 숫자, 시간은 ms 숫자다. */
export const values = freeze({
  "color": {
    "gray": {
      "0": "#ffffff",
      "25": "#f7f8fa",
      "50": "#f5f7fa",
      "100": "#e3e7ec",
      "200": "#d5dbe3",
      "300": "#b6c0cc",
      "600": "#4b5563",
      "900": "#111418"
    },
    "neutral": {
      "100": "#e3e3e3",
      "400": "#9aa0a6",
      "700": "#3a3b3c",
      "750": "#34363a",
      "800": "#2c2d30",
      "850": "#242526",
      "900": "#1b1b1d",
      "950": "#111214"
    },
    "blue": {
      "50": "#edf3fb",
      "400": "#3396e8",
      "600": "#2a78d6",
      "900": "#1d2733",
      "800": "#1d4f91"
    },
    "tone": {
      "blue": "#3b82f6",
      "purple": "#8b5cf6",
      "green": "#10b981",
      "orange": "#f59e0b",
      "gray": "#8b949e"
    },
    "accent": "#2a78d6",
    "on-accent": "#ffffff",
    "fg": "#0b0b0b",
    "muted": "#52514e",
    "bg": "#ffffff",
    "surface": "#f5f7fa",
    "border": "#b6c0cc",
    "card-on": "#edf3fb",
    "dot": "#d5dbe3",
    "frame": "#e3e7ec",
    "page": "#ffffff",
    "gallery": "#f7f8fa",
    "tag": {
      "blue": "#3b82f6",
      "purple": "#8b5cf6",
      "green": "#10b981",
      "orange": "#f59e0b",
      "gray": "#8b949e"
    },
    "orange": {
      "100": "#fbe1d5",
      "600": "#eb6834"
    },
    "ink": {
      "900": "#0b0b0b",
      "600": "#52514e",
      "200": "#e6e5e1"
    },
    "series-1": "#2a78d6",
    "series-2": "#eb6834",
    "grid": "#e6e5e1"
  },
  "font": {
    "sans": "FigSans, Pretendard, -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif",
    "mono": "FigMono, D2Coding, ui-monospace, SFMono-Regular, Menlo, monospace"
  },
  "size": {
    "text": {
      "9": 9,
      "10-5": 10.5,
      "11": 11,
      "11-5": 11.5,
      "12": 12,
      "13": 13,
      "13-5": 13.5,
      "14": 14,
      "14-5": 14.5,
      "15": 15,
      "22": 22
    },
    "line": {
      "15": 15,
      "18": 18,
      "20": 20,
      "22": 22
    },
    "control": 30,
    "pill": 18,
    "tag": 14,
    "icon": 20,
    "packet": 4.5,
    "halo": 10,
    "marker": 5,
    "marker-on": 4,
    "grid": 16,
    "grid-dot": 1,
    "card": 176,
    "node-min": 100,
    "node-max": 210,
    "node-min-h": 46,
    "store-min-h": 70,
    "store-cap": 12,
    "figure-min": 560,
    "chip-max": 210,
    "caption-max": 720,
    "figure-max": 1400,
    "gallery-column": 760,
    "gallery-frame": 820,
    "player-chrome": 190,
    "embedded-chrome": 150,
    "chart-width": 640,
    "chart-label": 140,
    "chart-bar": 12,
    "chart-row": 40,
    "chart-dot": 5,
    "person-w": 56,
    "person-head": 20,
    "person-shoulder": 14,
    "person-body": 22,
    "state-dot": 14,
    "table-row": 26,
    "seq-row": 44,
    "group-title": 28,
    "chart-plot-h": 260,
    "chart-axis": 48,
    "chart-cell": 40
  },
  "weight": {
    "medium": 500,
    "semibold": 600
  },
  "leading": {
    "normal": 1.5
  },
  "tracking": {
    "tag": 0.03,
    "frame": 0.04
  },
  "space": {
    "0-5": 1,
    "1": 2,
    "1-5": 3,
    "2": 4,
    "2-5": 5,
    "3": 6,
    "3-5": 7,
    "4": 8,
    "5": 10,
    "6": 12,
    "6-5": 13,
    "7": 14,
    "8": 16,
    "8-5": 17,
    "9": 18,
    "11": 22,
    "12": 24,
    "13": 26,
    "14": 28,
    "15": 30,
    "16": 32,
    "17": 34,
    "18": 36,
    "20": 40,
    "22": 44,
    "30": 60,
    "32": 64
  },
  "radius": {
    "xs": 2,
    "sm": 4,
    "md": 6,
    "lg": 8,
    "xl": 10,
    "2xl": 14,
    "route": 22,
    "full": 999
  },
  "border": {
    "hair": 0.75,
    "thin": 1,
    "lifeline": 1.25,
    "tag": 1.5,
    "edge": 1.75,
    "strong": 2.5
  },
  "dash": {
    "line": 5,
    "gap": 4,
    "card": 3
  },
  "opacity": {
    "tag": 0.15,
    "halo": 0.2,
    "tab-on": 0.06,
    "dim": 0.3
  },
  "z": {
    "raised": 2,
    "overlay": 10
  },
  "duration": {
    "fast": 200,
    "hop": 3750,
    "dwell": 700,
    "dwell-per-char": 45,
    "dwell-max": 3200,
    "step-end": 1600,
    "stagger": 120,
    "chart-cycle": 7000,
    "reveal": 900
  },
  "scale": {
    "zoom-max": 6,
    "zoom-step": 1.25
  }
});
