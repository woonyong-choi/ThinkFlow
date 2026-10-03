// tokens.json: 생성물, 손으로 고치지 않음
function freeze(node) {
  if (typeof node !== 'object') return node;
  return Object.freeze(Object.fromEntries(Object.entries(node).map(([key, value]) => [key, freeze(value)])));
}

/** CSS에 넣을 토큰 참조. 값은 `var(--…)` 문자열이다. */
export const tokens = freeze({
  "color": {
    "palette": {
      "gray": {
        "0": "var(--color-palette-gray-0)",
        "25": "var(--color-palette-gray-25)",
        "40": "var(--color-palette-gray-40)",
        "100": "var(--color-palette-gray-100)",
        "200": "var(--color-palette-gray-200)",
        "500": "var(--color-palette-gray-500)"
      },
      "neutral": {
        "100": "var(--color-palette-neutral-100)",
        "400": "var(--color-palette-neutral-400)",
        "500": "var(--color-palette-neutral-500)",
        "750": "var(--color-palette-neutral-750)",
        "800": "var(--color-palette-neutral-800)",
        "850": "var(--color-palette-neutral-850)",
        "875": "var(--color-palette-neutral-875)",
        "900": "var(--color-palette-neutral-900)",
        "950": "var(--color-palette-neutral-950)"
      },
      "blue": {
        "50": "var(--color-palette-blue-50)",
        "200": "var(--color-palette-blue-200)",
        "400": "var(--color-palette-blue-400)",
        "450": "var(--color-palette-blue-450)",
        "550": "var(--color-palette-blue-550)",
        "600": "var(--color-palette-blue-600)",
        "700": "var(--color-palette-blue-700)",
        "800": "var(--color-palette-blue-800)",
        "850": "var(--color-palette-blue-850)",
        "900": "var(--color-palette-blue-900)"
      },
      "orange": {
        "400": "var(--color-palette-orange-400)",
        "550": "var(--color-palette-orange-550)"
      },
      "ink": {
        "200": "var(--color-palette-ink-200)",
        "600": "var(--color-palette-ink-600)",
        "850": "var(--color-palette-ink-850)",
        "900": "var(--color-palette-ink-900)",
        "1000": "var(--color-palette-ink-1000)"
      },
      "purple": {
        "500": "var(--color-palette-purple-500)",
        "400": "var(--color-palette-purple-400)",
        "600": "var(--color-palette-purple-600)"
      },
      "green": {
        "500": "var(--color-palette-green-500)",
        "400": "var(--color-palette-green-400)",
        "700": "var(--color-palette-green-700)"
      },
      "slate": {
        "500": "var(--color-palette-slate-500)",
        "400": "var(--color-palette-slate-400)",
        "600": "var(--color-palette-slate-600)"
      },
      "teal": {
        "500": "var(--color-palette-teal-500)",
        "400": "var(--color-palette-teal-400)",
        "700": "var(--color-palette-teal-700)"
      }
    },
    "state": {
      "active": "var(--color-state-active)",
      "active-fill": "var(--color-state-active-fill)",
      "active-text": "var(--color-state-active-text)",
      "on-active": "var(--color-state-on-active)"
    },
    "flow": {
      "purple": "var(--color-flow-purple)",
      "green": "var(--color-flow-green)",
      "teal": "var(--color-flow-teal)",
      "gray": "var(--color-flow-gray)"
    },
    "figure": {
      "icon": "var(--color-figure-icon)"
    },
    "ui": {
      "link": "var(--color-ui-link)",
      "focus": "var(--color-ui-focus)",
      "progress": "var(--color-ui-progress)",
      "control-on": "var(--color-ui-control-on)"
    },
    "data": {
      "main": "var(--color-data-main)",
      "compare": "var(--color-data-compare)",
      "heat-low": "var(--color-data-heat-low)",
      "heat-high": "var(--color-data-heat-high)",
      "heat-ink": "var(--color-data-heat-ink)",
      "heat-ink-on": "var(--color-data-heat-ink-on)",
      "grid": "var(--color-data-grid)"
    },
    "fg": "var(--color-fg)",
    "muted": "var(--color-muted)",
    "bg": "var(--color-bg)",
    "node": "var(--color-node)",
    "surface": "var(--color-surface)",
    "border": "var(--color-border)",
    "card-on": "var(--color-card-on)",
    "group": "var(--color-group)",
    "plate-border": "var(--color-plate-border)",
    "page": "var(--color-page)",
    "tag": {
      "purple": "var(--color-tag-purple)",
      "green": "var(--color-tag-green)",
      "teal": "var(--color-tag-teal)",
      "gray": "var(--color-tag-gray)"
    }
  },
  "font": {
    "sans": "var(--font-sans)",
    "mono": "var(--font-mono)"
  },
  "size": {
    "text": {
      "9": "var(--size-text-9)",
      "11": "var(--size-text-11)",
      "13": "var(--size-text-13)",
      "15": "var(--size-text-15)",
      "22": "var(--size-text-22)"
    },
    "control": {
      "outer": "var(--size-control-outer)",
      "inner": "var(--size-control-inner)",
      "icon": "var(--size-control-icon)"
    },
    "pill": {
      "height": "var(--size-pill-height)"
    },
    "icon": {
      "node": "var(--size-icon-node)",
      "group": "var(--size-icon-group)",
      "tile": "var(--size-icon-tile)",
      "tile-gap": "var(--size-icon-tile-gap)"
    },
    "tag": {
      "height": "var(--size-tag-height)"
    },
    "packet": {
      "radius": "var(--size-packet-radius)",
      "halo": "var(--size-packet-halo)",
      "hop-ref": "var(--size-packet-hop-ref)",
      "chip-reach": "var(--size-packet-chip-reach)"
    },
    "arrow": {
      "head": "var(--size-arrow-head)",
      "head-lit": "var(--size-arrow-head-lit)"
    },
    "node": {
      "card-width": "var(--size-node-card-width)",
      "min-width": "var(--size-node-min-width)",
      "max-width": "var(--size-node-max-width)",
      "min-height": "var(--size-node-min-height)",
      "store-cap": "var(--size-node-store-cap)",
      "state-dot": "var(--size-node-state-dot)",
      "table-row": "var(--size-node-table-row)",
      "circle": "var(--size-node-circle)",
      "tile-width": "var(--size-node-tile-width)",
      "tile-pad": "var(--size-node-tile-pad)"
    },
    "grid": {
      "cell": "var(--size-grid-cell)"
    },
    "figure-canvas": "var(--size-figure-canvas)",
    "figure-canvas-wide": "var(--size-figure-canvas-wide)",
    "chip": {
      "max-width": "var(--size-chip-max-width)"
    },
    "player": {
      "caption-max": "var(--size-player-caption-max)",
      "embedded-chrome": "var(--size-player-embedded-chrome)"
    },
    "gallery": {
      "column": "var(--size-gallery-column)",
      "frame": "var(--size-gallery-frame)"
    },
    "document": {
      "column": "var(--size-document-column)"
    },
    "chart": {
      "width": "var(--size-chart-width)",
      "label": "var(--size-chart-label)",
      "label-max": "var(--size-chart-label-max)",
      "bar": "var(--size-chart-bar)",
      "row": "var(--size-chart-row)",
      "dot": "var(--size-chart-dot)",
      "plot-h": "var(--size-chart-plot-h)",
      "axis": "var(--size-chart-axis)",
      "cell": "var(--size-chart-cell)",
      "cap": "var(--size-chart-cap)",
      "range": "var(--size-chart-range)",
      "arrow-min": "var(--size-chart-arrow-min)"
    },
    "person": {
      "width": "var(--size-person-width)",
      "head": "var(--size-person-head)",
      "shoulder": "var(--size-person-shoulder)",
      "body": "var(--size-person-body)"
    },
    "sequence": {
      "row": "var(--size-sequence-row)"
    },
    "group": {
      "title": "var(--size-group-title)"
    }
  },
  "weight": {
    "medium": "var(--weight-medium)",
    "semibold": "var(--weight-semibold)"
  },
  "leading": {
    "normal": "var(--leading-normal)",
    "snug": "var(--leading-snug)"
  },
  "tracking": {
    "tag": "var(--tracking-tag)",
    "frame": "var(--tracking-frame)"
  },
  "space": {
    "1": "var(--space-1)",
    "2": "var(--space-2)",
    "3": "var(--space-3)",
    "4": "var(--space-4)",
    "5": "var(--space-5)",
    "6": "var(--space-6)",
    "7": "var(--space-7)",
    "8": "var(--space-8)",
    "9": "var(--space-9)",
    "11": "var(--space-11)",
    "12": "var(--space-12)",
    "14": "var(--space-14)",
    "15": "var(--space-15)",
    "16": "var(--space-16)",
    "20": "var(--space-20)",
    "22": "var(--space-22)",
    "30": "var(--space-30)",
    "0-5": "var(--space-0-5)",
    "1-5": "var(--space-1-5)",
    "2-5": "var(--space-2-5)"
  },
  "radius": {
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
    "strong": "var(--border-strong)",
    "casing": "var(--border-casing)",
    "halo": "var(--border-halo)"
  },
  "dash": {
    "line": "var(--dash-line)",
    "gap": "var(--dash-gap)",
    "card": "var(--dash-card)"
  },
  "opacity": {
    "tag": "var(--opacity-tag)",
    "halo": "var(--opacity-halo)",
    "dim": "var(--opacity-dim)",
    "dim-ink": "var(--opacity-dim-ink)",
    "band": "var(--opacity-band)",
    "range": "var(--opacity-range)",
    "chip-visible-min": "var(--opacity-chip-visible-min)"
  },
  "z": {
    "raised": "var(--z-raised)",
    "overlay": "var(--z-overlay)"
  },
  "duration": {
    "fast": "var(--duration-fast)",
    "hop": "var(--duration-hop)",
    "caption-fade": "var(--duration-caption-fade)",
    "hop-min": "var(--duration-hop-min)",
    "chip-slide": "var(--duration-chip-slide)",
    "chip-fade": "var(--duration-chip-fade)",
    "dwell": "var(--duration-dwell)",
    "dwell-per-char": "var(--duration-dwell-per-char)",
    "dwell-max": "var(--duration-dwell-max)",
    "step-end": "var(--duration-step-end)",
    "chart-cycle": "var(--duration-chart-cycle)",
    "reveal": "var(--duration-reveal)",
    "value-flash": "var(--duration-value-flash)",
    "chip-frame": "var(--duration-chip-frame)",
    "flow-step": "var(--duration-flow-step)",
    "cut-fade": "var(--duration-cut-fade)"
  },
  "easing": {
    "move": "var(--easing-move)",
    "reveal": "var(--easing-reveal)"
  },
  "scale": {
    "zoom-max": "var(--scale-zoom-max)",
    "aspect-fit-max": "var(--scale-aspect-fit-max)",
    "fold-aspect": "var(--scale-fold-aspect)",
    "fold-step": "var(--scale-fold-step)",
    "aspect-max": "var(--scale-aspect-max)",
    "zoom-step": "var(--scale-zoom-step)",
    "flow-dots-max": "var(--scale-flow-dots-max)"
  }
});

/** 배치 계산에 쓸 밝은 테마의 실제 값. 크기는 px 숫자, 시간은 ms 숫자다. */
export const values = freeze({
  "color": {
    "palette": {
      "gray": {
        "0": "#ffffff",
        "25": "#f6f7f9",
        "40": "#eef0f3",
        "100": "#e3e7ec",
        "200": "#d5dbe3",
        "500": "#818b99"
      },
      "neutral": {
        "100": "#e3e3e3",
        "400": "#9aa0a6",
        "500": "#72767a",
        "750": "#3c3e42",
        "800": "#2c2d30",
        "850": "#242526",
        "875": "#202123",
        "900": "#1b1b1d",
        "950": "#111214"
      },
      "blue": {
        "50": "#edf5fb",
        "200": "#a9cdea",
        "400": "#79c0ff",
        "450": "#6f9cf5",
        "550": "#218fe5",
        "600": "#1072c2",
        "700": "#125de6",
        "800": "#1d5d91",
        "850": "#2b4254",
        "900": "#1d2933"
      },
      "orange": {
        "400": "#f5a374",
        "550": "#d96c1f"
      },
      "ink": {
        "200": "#c6cacf",
        "600": "#52514e",
        "850": "#0d1117",
        "900": "#0b0b0b",
        "1000": "#000000"
      },
      "purple": {
        "500": "#8b5cf6",
        "400": "#9b90ff",
        "600": "#483c95"
      },
      "green": {
        "500": "#10b981",
        "400": "#b6da70",
        "700": "#517000"
      },
      "slate": {
        "500": "#8b949e",
        "400": "#b0a0a4",
        "600": "#57494d"
      },
      "teal": {
        "500": "#11a6b0",
        "400": "#87f3f6",
        "700": "#008084"
      }
    },
    "state": {
      "active": "#218fe5",
      "active-fill": "#1072c2",
      "active-text": "#1072c2",
      "on-active": "#ffffff"
    },
    "flow": {
      "purple": "#483c95",
      "green": "#517000",
      "teal": "#008084",
      "gray": "#57494d"
    },
    "figure": {
      "icon": "#125de6"
    },
    "ui": {
      "link": "#1072c2",
      "focus": "#218fe5",
      "progress": "#218fe5",
      "control-on": "#ffffff"
    },
    "data": {
      "main": "#218fe5",
      "compare": "#d96c1f",
      "heat-low": "#a9cdea",
      "heat-high": "#1d5d91",
      "heat-ink": "#000000",
      "heat-ink-on": "#ffffff",
      "grid": "#c6cacf"
    },
    "fg": "#0b0b0b",
    "muted": "#52514e",
    "bg": "#f6f7f9",
    "node": "#ffffff",
    "surface": "#eef0f3",
    "border": "#818b99",
    "card-on": "#edf5fb",
    "group": "#eef0f3",
    "plate-border": "#d5dbe3",
    "page": "#ffffff",
    "tag": {
      "purple": "#8b5cf6",
      "green": "#10b981",
      "teal": "#11a6b0",
      "gray": "#8b949e"
    }
  },
  "font": {
    "sans": "FigSans, FigSansKo, FigSansSym, FigSansMath, Inter, 'Inter Variable', 'Noto Sans KR', 'Noto Sans KR Variable', -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', sans-serif",
    "mono": "FigMono, FigSans, FigSansKo, FigSansSym, FigSansMath, ui-monospace, SFMono-Regular, Menlo, monospace"
  },
  "size": {
    "text": {
      "9": 9,
      "11": 11,
      "13": 13,
      "15": 15,
      "22": 22
    },
    "control": {
      "outer": 30,
      "inner": 22,
      "icon": 12
    },
    "pill": {
      "height": 18
    },
    "icon": {
      "node": 20,
      "group": 18,
      "tile": 32,
      "tile-gap": 6
    },
    "tag": {
      "height": 14
    },
    "packet": {
      "radius": 4.5,
      "halo": 10,
      "hop-ref": 300,
      "chip-reach": 12
    },
    "arrow": {
      "head": 5,
      "head-lit": 4
    },
    "node": {
      "card-width": 176,
      "min-width": 100,
      "max-width": 210,
      "min-height": 46,
      "store-cap": 12,
      "state-dot": 14,
      "table-row": 26,
      "circle": 40,
      "tile-width": 80,
      "tile-pad": 8
    },
    "grid": {
      "cell": 32
    },
    "figure-canvas": 960,
    "figure-canvas-wide": 1440,
    "chip": {
      "max-width": 210
    },
    "player": {
      "caption-max": 720,
      "embedded-chrome": 150
    },
    "gallery": {
      "column": 960,
      "frame": 820
    },
    "document": {
      "column": 960
    },
    "chart": {
      "width": 960,
      "label": 140,
      "label-max": 240,
      "bar": 12,
      "row": 40,
      "dot": 5,
      "plot-h": 260,
      "axis": 48,
      "cell": 40,
      "cap": 8,
      "range": 6,
      "arrow-min": 16
    },
    "person": {
      "width": 56,
      "head": 20,
      "shoulder": 14,
      "body": 22
    },
    "sequence": {
      "row": 44
    },
    "group": {
      "title": 28
    }
  },
  "weight": {
    "medium": 500,
    "semibold": 600
  },
  "leading": {
    "normal": 1.5,
    "snug": 1.35
  },
  "tracking": {
    "tag": 0.03,
    "frame": 0.04
  },
  "space": {
    "1": 2,
    "2": 4,
    "3": 6,
    "4": 8,
    "5": 10,
    "6": 12,
    "7": 14,
    "8": 16,
    "9": 18,
    "11": 22,
    "12": 24,
    "14": 28,
    "15": 30,
    "16": 32,
    "20": 40,
    "22": 44,
    "30": 60,
    "0-5": 1,
    "1-5": 3,
    "2-5": 5
  },
  "radius": {
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
    "strong": 2.5,
    "casing": 4.5,
    "halo": 8
  },
  "dash": {
    "line": 5,
    "gap": 4,
    "card": 3
  },
  "opacity": {
    "tag": 0.15,
    "halo": 0.2,
    "dim": 0.3,
    "dim-ink": 0.82,
    "band": 0.22,
    "range": 0.4,
    "chip-visible-min": 0.1
  },
  "z": {
    "raised": 2,
    "overlay": 10
  },
  "duration": {
    "fast": 200,
    "hop": 3750,
    "caption-fade": 200,
    "hop-min": 500,
    "chip-slide": 300,
    "chip-fade": 150,
    "dwell": 700,
    "dwell-per-char": 45,
    "dwell-max": 3200,
    "step-end": 1600,
    "chart-cycle": 7000,
    "reveal": 900,
    "value-flash": 700,
    "chip-frame": 16.666666666666668,
    "flow-step": 12000,
    "cut-fade": 600
  },
  "easing": {
    "move": "cubic-bezier(0.455, 0.03, 0.515, 0.955)",
    "reveal": "cubic-bezier(0, 0, 0.58, 1)"
  },
  "scale": {
    "zoom-max": 6,
    "aspect-fit-max": 1.6,
    "fold-aspect": 1.6,
    "fold-step": 0.75,
    "aspect-max": 3,
    "zoom-step": 1.25,
    "flow-dots-max": 80
  }
});
