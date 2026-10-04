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
      "27": "var(--color-gray-27)",
      "43": "var(--color-gray-43)",
      "59": "var(--color-gray-59)",
      "71": "var(--color-gray-71)",
      "106": "var(--color-gray-106)",
      "118": "var(--color-gray-118)",
      "145": "var(--color-gray-145)",
      "161": "var(--color-gray-161)",
      "212": "var(--color-gray-212)",
      "220": "var(--color-gray-220)",
      "282": "var(--color-gray-282)",
      "333": "var(--color-gray-333)",
      "467": "var(--color-gray-467)",
      "529": "var(--color-gray-529)",
      "545": "var(--color-gray-545)",
      "635": "var(--color-gray-635)",
      "651": "var(--color-gray-651)",
      "757": "var(--color-gray-757)",
      "776": "var(--color-gray-776)",
      "788": "var(--color-gray-788)",
      "796": "var(--color-gray-796)",
      "835": "var(--color-gray-835)",
      "875": "var(--color-gray-875)",
      "878": "var(--color-gray-878)",
      "910": "var(--color-gray-910)",
      "929": "var(--color-gray-929)",
      "933": "var(--color-gray-933)",
      "1000": "var(--color-gray-1000)"
    },
    "blue": {
      "anchor": "var(--color-blue-anchor)",
      "light-fill": "var(--color-blue-light-fill)",
      "light-stroke": "var(--color-blue-light-stroke)",
      "light-ink": "var(--color-blue-light-ink)",
      "light-heat-low": "var(--color-blue-light-heat-low)",
      "light-heat-high": "var(--color-blue-light-heat-high)",
      "light-outline": "var(--color-blue-light-outline)",
      "light-tint-1": "var(--color-blue-light-tint-1)",
      "light-tint-2": "var(--color-blue-light-tint-2)",
      "light-tint-3": "var(--color-blue-light-tint-3)",
      "dark-fill": "var(--color-blue-dark-fill)",
      "dark-stroke": "var(--color-blue-dark-stroke)",
      "dark-ink": "var(--color-blue-dark-ink)",
      "dark-heat-low": "var(--color-blue-dark-heat-low)",
      "dark-heat-high": "var(--color-blue-dark-heat-high)",
      "dark-outline": "var(--color-blue-dark-outline)",
      "dark-tint-1": "var(--color-blue-dark-tint-1)",
      "dark-tint-2": "var(--color-blue-dark-tint-2)",
      "dark-tint-3": "var(--color-blue-dark-tint-3)"
    },
    "purple": {
      "anchor": "var(--color-purple-anchor)",
      "light-fill": "var(--color-purple-light-fill)",
      "light-stroke": "var(--color-purple-light-stroke)",
      "light-ink": "var(--color-purple-light-ink)",
      "light-dot": "var(--color-purple-light-dot)",
      "light-outline": "var(--color-purple-light-outline)",
      "light-tint-1": "var(--color-purple-light-tint-1)",
      "light-tint-2": "var(--color-purple-light-tint-2)",
      "light-tint-3": "var(--color-purple-light-tint-3)",
      "dark-fill": "var(--color-purple-dark-fill)",
      "dark-stroke": "var(--color-purple-dark-stroke)",
      "dark-ink": "var(--color-purple-dark-ink)",
      "dark-dot": "var(--color-purple-dark-dot)",
      "dark-outline": "var(--color-purple-dark-outline)",
      "dark-tint-1": "var(--color-purple-dark-tint-1)",
      "dark-tint-2": "var(--color-purple-dark-tint-2)",
      "dark-tint-3": "var(--color-purple-dark-tint-3)"
    },
    "red": {
      "anchor": "var(--color-red-anchor)",
      "light-fill": "var(--color-red-light-fill)",
      "light-stroke": "var(--color-red-light-stroke)",
      "light-ink": "var(--color-red-light-ink)",
      "light-dot": "var(--color-red-light-dot)",
      "light-outline": "var(--color-red-light-outline)",
      "dark-fill": "var(--color-red-dark-fill)",
      "dark-stroke": "var(--color-red-dark-stroke)",
      "dark-ink": "var(--color-red-dark-ink)",
      "dark-dot": "var(--color-red-dark-dot)",
      "dark-outline": "var(--color-red-dark-outline)"
    },
    "green": {
      "anchor": "var(--color-green-anchor)",
      "light-fill": "var(--color-green-light-fill)",
      "light-stroke": "var(--color-green-light-stroke)",
      "light-ink": "var(--color-green-light-ink)",
      "light-dot": "var(--color-green-light-dot)",
      "light-outline": "var(--color-green-light-outline)",
      "dark-fill": "var(--color-green-dark-fill)",
      "dark-stroke": "var(--color-green-dark-stroke)",
      "dark-ink": "var(--color-green-dark-ink)",
      "dark-dot": "var(--color-green-dark-dot)",
      "dark-outline": "var(--color-green-dark-outline)"
    },
    "orange": {
      "anchor": "var(--color-orange-anchor)",
      "light-fill": "var(--color-orange-light-fill)",
      "light-stroke": "var(--color-orange-light-stroke)",
      "light-ink": "var(--color-orange-light-ink)",
      "light-outline": "var(--color-orange-light-outline)",
      "dark-fill": "var(--color-orange-dark-fill)",
      "dark-stroke": "var(--color-orange-dark-stroke)",
      "dark-ink": "var(--color-orange-dark-ink)",
      "dark-outline": "var(--color-orange-dark-outline)"
    },
    "fg": "var(--color-fg)",
    "muted": "var(--color-muted)",
    "group-title": "var(--color-group-title)",
    "bg": "var(--color-bg)",
    "group-1": "var(--color-group-1)",
    "group-2": "var(--color-group-2)",
    "group-3": "var(--color-group-3)",
    "node": "var(--color-node)",
    "surface": "var(--color-surface)",
    "card": "var(--color-card)",
    "card-on": "var(--color-card-on)",
    "page": "var(--color-page)",
    "outline": "var(--color-outline)",
    "border": "var(--color-border)",
    "plate-border": "var(--color-plate-border)",
    "line": "var(--color-line)",
    "state": {
      "active": "var(--color-state-active)",
      "active-fill": "var(--color-state-active-fill)",
      "active-text": "var(--color-state-active-text)",
      "on-active": "var(--color-state-on-active)",
      "error": "var(--color-state-error)",
      "success": "var(--color-state-success)",
      "warning": "var(--color-state-warning)",
      "glow": "var(--color-state-glow)"
    },
    "flow": {
      "brand": "var(--color-flow-brand)",
      "purple": "var(--color-flow-purple)",
      "green": "var(--color-flow-green)",
      "gray": "var(--color-flow-gray)",
      "red": "var(--color-flow-red)"
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
    "accent": "var(--color-accent)",
    "palette": {
      "amber": {
        "light-fill": "var(--color-palette-amber-light-fill)",
        "light-stroke": "var(--color-palette-amber-light-stroke)",
        "light-ink": "var(--color-palette-amber-light-ink)",
        "light-outline": "var(--color-palette-amber-light-outline)",
        "dark-fill": "var(--color-palette-amber-dark-fill)",
        "dark-stroke": "var(--color-palette-amber-dark-stroke)",
        "dark-ink": "var(--color-palette-amber-dark-ink)",
        "dark-outline": "var(--color-palette-amber-dark-outline)"
      },
      "teal": {
        "light-fill": "var(--color-palette-teal-light-fill)",
        "light-stroke": "var(--color-palette-teal-light-stroke)",
        "light-ink": "var(--color-palette-teal-light-ink)",
        "light-dot": "var(--color-palette-teal-light-dot)",
        "light-outline": "var(--color-palette-teal-light-outline)",
        "dark-fill": "var(--color-palette-teal-dark-fill)",
        "dark-stroke": "var(--color-palette-teal-dark-stroke)",
        "dark-ink": "var(--color-palette-teal-dark-ink)",
        "dark-dot": "var(--color-palette-teal-dark-dot)",
        "dark-outline": "var(--color-palette-teal-dark-outline)"
      },
      "navy": {
        "light-fill": "var(--color-palette-navy-light-fill)",
        "light-stroke": "var(--color-palette-navy-light-stroke)",
        "light-ink": "var(--color-palette-navy-light-ink)",
        "light-outline": "var(--color-palette-navy-light-outline)",
        "dark-fill": "var(--color-palette-navy-dark-fill)",
        "dark-stroke": "var(--color-palette-navy-dark-stroke)",
        "dark-ink": "var(--color-palette-navy-dark-ink)",
        "dark-outline": "var(--color-palette-navy-dark-outline)"
      },
      "pink": {
        "light-fill": "var(--color-palette-pink-light-fill)",
        "light-stroke": "var(--color-palette-pink-light-stroke)",
        "light-ink": "var(--color-palette-pink-light-ink)",
        "light-outline": "var(--color-palette-pink-light-outline)",
        "dark-fill": "var(--color-palette-pink-dark-fill)",
        "dark-stroke": "var(--color-palette-pink-dark-stroke)",
        "dark-ink": "var(--color-palette-pink-dark-ink)",
        "dark-outline": "var(--color-palette-pink-dark-outline)"
      },
      "sky": {
        "light-fill": "var(--color-palette-sky-light-fill)",
        "light-stroke": "var(--color-palette-sky-light-stroke)",
        "light-ink": "var(--color-palette-sky-light-ink)",
        "light-tint-1": "var(--color-palette-sky-light-tint-1)",
        "light-tint-2": "var(--color-palette-sky-light-tint-2)",
        "light-tint-3": "var(--color-palette-sky-light-tint-3)",
        "light-outline": "var(--color-palette-sky-light-outline)",
        "dark-fill": "var(--color-palette-sky-dark-fill)",
        "dark-stroke": "var(--color-palette-sky-dark-stroke)",
        "dark-ink": "var(--color-palette-sky-dark-ink)",
        "dark-tint-1": "var(--color-palette-sky-dark-tint-1)",
        "dark-tint-2": "var(--color-palette-sky-dark-tint-2)",
        "dark-tint-3": "var(--color-palette-sky-dark-tint-3)",
        "dark-outline": "var(--color-palette-sky-dark-outline)"
      },
      "slate": {
        "light-fill": "var(--color-palette-slate-light-fill)",
        "light-stroke": "var(--color-palette-slate-light-stroke)",
        "light-ink": "var(--color-palette-slate-light-ink)",
        "light-dot": "var(--color-palette-slate-light-dot)",
        "dark-fill": "var(--color-palette-slate-dark-fill)",
        "dark-stroke": "var(--color-palette-slate-dark-stroke)",
        "dark-ink": "var(--color-palette-slate-dark-ink)",
        "dark-dot": "var(--color-palette-slate-dark-dot)",
        "light-outline": "var(--color-palette-slate-light-outline)",
        "dark-outline": "var(--color-palette-slate-dark-outline)"
      }
    },
    "figure": {
      "icon": "var(--color-figure-icon)",
      "icon-tile": "var(--color-figure-icon-tile)"
    },
    "paint": {
      "red": {
        "fill": "var(--color-paint-red-fill)",
        "stroke": "var(--color-paint-red-stroke)",
        "outline": "var(--color-paint-red-outline)",
        "ink": "var(--color-paint-red-ink)",
        "dot": "var(--color-paint-red-dot)"
      },
      "amber": {
        "fill": "var(--color-paint-amber-fill)",
        "stroke": "var(--color-paint-amber-stroke)",
        "outline": "var(--color-paint-amber-outline)",
        "ink": "var(--color-paint-amber-ink)"
      },
      "green": {
        "fill": "var(--color-paint-green-fill)",
        "stroke": "var(--color-paint-green-stroke)",
        "outline": "var(--color-paint-green-outline)",
        "ink": "var(--color-paint-green-ink)",
        "dot": "var(--color-paint-green-dot)"
      },
      "teal": {
        "fill": "var(--color-paint-teal-fill)",
        "stroke": "var(--color-paint-teal-stroke)",
        "outline": "var(--color-paint-teal-outline)",
        "ink": "var(--color-paint-teal-ink)",
        "dot": "var(--color-paint-teal-dot)"
      },
      "navy": {
        "fill": "var(--color-paint-navy-fill)",
        "stroke": "var(--color-paint-navy-stroke)",
        "outline": "var(--color-paint-navy-outline)",
        "ink": "var(--color-paint-navy-ink)"
      },
      "purple": {
        "fill": "var(--color-paint-purple-fill)",
        "stroke": "var(--color-paint-purple-stroke)",
        "outline": "var(--color-paint-purple-outline)",
        "ink": "var(--color-paint-purple-ink)",
        "dot": "var(--color-paint-purple-dot)",
        "group-1": "var(--color-paint-purple-group-1)",
        "group-2": "var(--color-paint-purple-group-2)",
        "group-3": "var(--color-paint-purple-group-3)"
      },
      "pink": {
        "fill": "var(--color-paint-pink-fill)",
        "stroke": "var(--color-paint-pink-stroke)",
        "outline": "var(--color-paint-pink-outline)",
        "ink": "var(--color-paint-pink-ink)"
      },
      "sky": {
        "fill": "var(--color-paint-sky-fill)",
        "stroke": "var(--color-paint-sky-stroke)",
        "outline": "var(--color-paint-sky-outline)",
        "ink": "var(--color-paint-sky-ink)",
        "group-1": "var(--color-paint-sky-group-1)",
        "group-2": "var(--color-paint-sky-group-2)",
        "group-3": "var(--color-paint-sky-group-3)"
      },
      "gray": {
        "fill": "var(--color-paint-gray-fill)",
        "stroke": "var(--color-paint-gray-stroke)",
        "outline": "var(--color-paint-gray-outline)",
        "ink": "var(--color-paint-gray-ink)",
        "dot": "var(--color-paint-gray-dot)"
      }
    },
    "tag": {
      "purple": "var(--color-tag-purple)",
      "green": "var(--color-tag-green)",
      "gray": "var(--color-tag-gray)",
      "red": "var(--color-tag-red)",
      "brand": "var(--color-tag-brand)"
    }
  },
  "font": {
    "sans": "var(--font-sans)",
    "mono": "var(--font-mono)",
    "figure-sans": "var(--font-figure-sans)",
    "figure-mono": "var(--font-figure-mono)"
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
      "icon": "var(--size-control-icon)",
      "icon-stroke": "var(--size-control-icon-stroke)"
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
    "text": "var(--tracking-text)",
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
    "full": "var(--radius-full)",
    "route": "var(--radius-route)"
  },
  "border": {
    "hair": "var(--border-hair)",
    "thin": "var(--border-thin)",
    "strong": "var(--border-strong)",
    "lifeline": "var(--border-lifeline)",
    "tag": "var(--border-tag)",
    "edge": "var(--border-edge)",
    "casing": "var(--border-casing)",
    "halo": "var(--border-halo)"
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
    "pulse": "var(--duration-pulse)",
    "chip-frame": "var(--duration-chip-frame)",
    "flow-step": "var(--duration-flow-step)",
    "cut-fade": "var(--duration-cut-fade)"
  },
  "easing": {
    "move": "var(--easing-move)",
    "reveal": "var(--easing-reveal)"
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
  "distance": {
    "card": {
      "min": "var(--distance-card-min)",
      "max": "var(--distance-card-max)"
    },
    "flow": "var(--distance-flow)",
    "neighbor": "var(--distance-neighbor)",
    "neighbor-cvd": "var(--distance-neighbor-cvd)",
    "fill": "var(--distance-fill)",
    "fill-dark": {
      "bg": "var(--distance-fill-dark-bg)",
      "node": "var(--distance-fill-dark-node)"
    }
  },
  "scale": {
    "zoom-max": "var(--scale-zoom-max)",
    "aspect-fit-max": "var(--scale-aspect-fit-max)",
    "fold-aspect": "var(--scale-fold-aspect)",
    "fold-step": "var(--scale-fold-step)",
    "aspect-max": "var(--scale-aspect-max)",
    "zoom-step": "var(--scale-zoom-step)",
    "flow-dots-max": "var(--scale-flow-dots-max)",
    "chip-visible-share": "var(--scale-chip-visible-share)"
  }
});

/** 배치 계산에 쓸 밝은 테마의 실제 값. 크기는 px 숫자, 시간은 ms 숫자다. */
export const values = freeze({
  "color": {
    "gray": {
      "0": "#ffffff",
      "27": "#f8f8f8",
      "43": "#f4f4f4",
      "59": "#f0f0f0",
      "71": "#ededed",
      "106": "#e4e4e4",
      "118": "#e1e1e1",
      "145": "#dadada",
      "161": "#d6d6d6",
      "212": "#c9c9c9",
      "220": "#c7c7c7",
      "282": "#b7b7b7",
      "333": "#aaaaaa",
      "467": "#888888",
      "529": "#787878",
      "545": "#747474",
      "635": "#5d5d5d",
      "651": "#595959",
      "757": "#3e3e3e",
      "776": "#393939",
      "788": "#363636",
      "796": "#343434",
      "835": "#2a2a2a",
      "875": "#202020",
      "878": "#1f1f1f",
      "910": "#171717",
      "929": "#121212",
      "933": "#111111",
      "1000": "#000000"
    },
    "blue": {
      "anchor": "#125de6",
      "light-fill": "#edf4ff",
      "light-stroke": "#125de6",
      "light-ink": "#0151d9",
      "light-heat-low": "#b7cdf5",
      "light-heat-high": "#004dd2",
      "light-outline": "#658dd5",
      "light-tint-1": "#e5eefc",
      "light-tint-2": "#d7e2f4",
      "light-tint-3": "#cad7ed",
      "dark-fill": "#1c2a43",
      "dark-stroke": "#70a3ff",
      "dark-ink": "#78a9ff",
      "dark-heat-low": "#293751",
      "dark-heat-high": "#4474cc",
      "dark-outline": "#6789c4",
      "dark-tint-1": "#1a202b",
      "dark-tint-2": "#222a38",
      "dark-tint-3": "#2a3446"
    },
    "purple": {
      "anchor": "#b28fd1",
      "light-fill": "#f7f0ff",
      "light-stroke": "#8c6aaa",
      "light-ink": "#704f8c",
      "light-dot": "#704f8c",
      "light-outline": "#9884ac",
      "light-tint-1": "#f1eaf9",
      "light-tint-2": "#e6ddf0",
      "light-tint-3": "#dcd1e8",
      "dark-fill": "#31233d",
      "dark-stroke": "#b693d6",
      "dark-ink": "#be9ade",
      "dark-dot": "#9c7abb",
      "dark-outline": "#977eae",
      "dark-tint-1": "#231d28",
      "dark-tint-2": "#2e2635",
      "dark-tint-3": "#393042"
    },
    "red": {
      "anchor": "#ef0f0f",
      "light-fill": "#ffefed",
      "light-stroke": "#c70005",
      "light-ink": "#be0004",
      "light-dot": "#6c0001",
      "light-outline": "#cd7367",
      "dark-fill": "#40201c",
      "dark-stroke": "#fc7182",
      "dark-ink": "#ff8390",
      "dark-dot": "#e25971",
      "dark-outline": "#c56f73"
    },
    "green": {
      "anchor": "#09c72c",
      "light-fill": "#eaf8e9",
      "light-stroke": "#008c1a",
      "light-ink": "#006d12",
      "light-dot": "#006d12",
      "light-outline": "#629a61",
      "dark-fill": "#1a301a",
      "dark-stroke": "#58bf5a",
      "dark-ink": "#58bf5a",
      "dark-dot": "#62c963",
      "dark-outline": "#5a9659"
    },
    "orange": {
      "anchor": "#e65200",
      "light-fill": "#fff0ea",
      "light-stroke": "#d44b00",
      "light-ink": "#a63900",
      "light-outline": "#c47a5f",
      "dark-fill": "#3f2116",
      "dark-stroke": "#fa7a49",
      "dark-ink": "#ff875a",
      "dark-outline": "#c37356"
    },
    "fg": "#1f1f1f",
    "muted": "#5d5d5d",
    "group-title": "#595959",
    "bg": "#f8f8f8",
    "group-1": "#ededed",
    "group-2": "#e1e1e1",
    "group-3": "#d6d6d6",
    "node": "#ffffff",
    "surface": "#f0f0f0",
    "card": "#f4f4f4",
    "card-on": "#edf4ff",
    "page": "#ffffff",
    "outline": "#787878",
    "border": "#e4e4e4",
    "plate-border": "#dadada",
    "line": "#b7b7b7",
    "state": {
      "active": "#125de6",
      "active-fill": "#0151d9",
      "active-text": "#0151d9",
      "on-active": "#ffffff",
      "error": "#c70005",
      "success": "#008c1a",
      "warning": "#d44b00",
      "glow": "#edf4ff"
    },
    "flow": {
      "brand": "#125de6",
      "purple": "#704f8c",
      "green": "#006d12",
      "gray": "#747474",
      "red": "#6c0001"
    },
    "ui": {
      "link": "#0151d9",
      "focus": "#125de6",
      "progress": "#125de6",
      "control-on": "#ffffff"
    },
    "data": {
      "main": "#125de6",
      "compare": "#d44b00",
      "heat-low": "#b7cdf5",
      "heat-high": "#004dd2",
      "heat-ink": "#000000",
      "heat-ink-on": "#ffffff",
      "grid": "#c9c9c9"
    },
    "accent": "#125de6",
    "palette": {
      "amber": {
        "light-fill": "#fff0ea",
        "light-stroke": "#d44b00",
        "light-ink": "#a63900",
        "light-outline": "#c47a5f",
        "dark-fill": "#3f2116",
        "dark-stroke": "#fa7a49",
        "dark-ink": "#ff875a",
        "dark-outline": "#c37356"
      },
      "teal": {
        "light-fill": "#eaf8e9",
        "light-stroke": "#008c1a",
        "light-ink": "#006d12",
        "light-dot": "#006d12",
        "light-outline": "#629a61",
        "dark-fill": "#1a301a",
        "dark-stroke": "#58bf5a",
        "dark-ink": "#58bf5a",
        "dark-dot": "#62c963",
        "dark-outline": "#5a9659"
      },
      "navy": {
        "light-fill": "#edf4ff",
        "light-stroke": "#125de6",
        "light-ink": "#0151d9",
        "light-outline": "#658dd5",
        "dark-fill": "#1c2a43",
        "dark-stroke": "#70a3ff",
        "dark-ink": "#78a9ff",
        "dark-outline": "#6789c4"
      },
      "pink": {
        "light-fill": "#f7f0ff",
        "light-stroke": "#8c6aaa",
        "light-ink": "#704f8c",
        "light-outline": "#9884ac",
        "dark-fill": "#31233d",
        "dark-stroke": "#b693d6",
        "dark-ink": "#be9ade",
        "dark-outline": "#977eae"
      },
      "sky": {
        "light-fill": "#e9f1fe",
        "light-stroke": "#125de6",
        "light-ink": "#0151d9",
        "light-tint-1": "#e5eefc",
        "light-tint-2": "#d7e2f4",
        "light-tint-3": "#cad7ed",
        "light-outline": "#628ad3",
        "dark-fill": "#1c2a43",
        "dark-stroke": "#70a3ff",
        "dark-ink": "#78a9ff",
        "dark-tint-1": "#1a202b",
        "dark-tint-2": "#222a38",
        "dark-tint-3": "#2a3446",
        "dark-outline": "#6789c4"
      },
      "slate": {
        "light-fill": "#e7e7e7",
        "light-stroke": "#5d5d5d",
        "light-ink": "#5d5d5d",
        "light-dot": "#747474",
        "dark-fill": "#363636",
        "dark-stroke": "#aaaaaa",
        "dark-ink": "#aaaaaa",
        "dark-dot": "#c7c7c7",
        "light-outline": "#848484",
        "dark-outline": "#888888"
      }
    },
    "figure": {
      "icon": "#125de6",
      "icon-tile": "#edf4ff"
    },
    "paint": {
      "red": {
        "fill": "#ffefed",
        "stroke": "#c70005",
        "outline": "#cd7367",
        "ink": "#be0004",
        "dot": "#6c0001"
      },
      "amber": {
        "fill": "#fff0ea",
        "stroke": "#d44b00",
        "outline": "#c47a5f",
        "ink": "#a63900"
      },
      "green": {
        "fill": "#eaf8e9",
        "stroke": "#008c1a",
        "outline": "#629a61",
        "ink": "#006d12",
        "dot": "#006d12"
      },
      "teal": {
        "fill": "#eaf8e9",
        "stroke": "#008c1a",
        "outline": "#629a61",
        "ink": "#006d12",
        "dot": "#006d12"
      },
      "navy": {
        "fill": "#edf4ff",
        "stroke": "#125de6",
        "outline": "#658dd5",
        "ink": "#0151d9"
      },
      "purple": {
        "fill": "#f7f0ff",
        "stroke": "#8c6aaa",
        "outline": "#9884ac",
        "ink": "#704f8c",
        "dot": "#704f8c",
        "group-1": "#f1eaf9",
        "group-2": "#e6ddf0",
        "group-3": "#dcd1e8"
      },
      "pink": {
        "fill": "#f7f0ff",
        "stroke": "#8c6aaa",
        "outline": "#9884ac",
        "ink": "#704f8c"
      },
      "sky": {
        "fill": "#e9f1fe",
        "stroke": "#125de6",
        "outline": "#628ad3",
        "ink": "#0151d9",
        "group-1": "#e5eefc",
        "group-2": "#d7e2f4",
        "group-3": "#cad7ed"
      },
      "gray": {
        "fill": "#e7e7e7",
        "stroke": "#5d5d5d",
        "outline": "#848484",
        "ink": "#5d5d5d",
        "dot": "#747474"
      }
    },
    "tag": {
      "purple": "#8c6aaa",
      "green": "#008c1a",
      "gray": "#5d5d5d",
      "red": "#c70005",
      "brand": "#125de6"
    }
  },
  "font": {
    "sans": "Pretendard, 'Pretendard Variable', -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', sans-serif",
    "mono": "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
    "figure-sans": "FigSans, FigSansSym, FigSansMath, Pretendard, 'Pretendard Variable', -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', sans-serif",
    "figure-mono": "FigMono, FigSans, FigSansSym, FigSansMath, ui-monospace, SFMono-Regular, Menlo, monospace"
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
      "outer": 36,
      "inner": 28,
      "icon": 16,
      "icon-stroke": 1.75
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
      "chip-reach": 16
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
    "text": -0.3,
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
    "full": 999,
    "route": 22
  },
  "border": {
    "hair": 0.75,
    "thin": 1,
    "strong": 2.5,
    "lifeline": 1.25,
    "tag": 1.5,
    "edge": 1.75,
    "casing": 4.5,
    "halo": 8
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
    "pulse": 450,
    "chip-frame": 16.666666666666668,
    "flow-step": 12000,
    "cut-fade": 600
  },
  "easing": {
    "move": "cubic-bezier(0.455, 0.03, 0.515, 0.955)",
    "reveal": "cubic-bezier(0, 0, 0.58, 1)"
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
    "dim-ink": 0.9,
    "band": 0.22,
    "range": 0.4,
    "chip-visible-min": 0.1
  },
  "distance": {
    "card": {
      "min": 0.015,
      "max": 0.04
    },
    "flow": 0.1,
    "neighbor": 0.06,
    "neighbor-cvd": 0.025,
    "fill": 0.015,
    "fill-dark": {
      "bg": 0.07,
      "node": 0.03
    }
  },
  "scale": {
    "zoom-max": 6,
    "aspect-fit-max": 1.6,
    "fold-aspect": 1.6,
    "fold-step": 0.75,
    "aspect-max": 3,
    "zoom-step": 1.25,
    "flow-dots-max": 80,
    "chip-visible-share": 0.6
  }
});
