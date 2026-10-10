// 재생기에 데이터로 넘기는 값. 브라우저 코드는 tokens.js를 불러올 수 없어 토큰에서 읽은 값을 재생 데이터(data.metrics)에 실어 보낸다.
import { STYLE } from '../measure/texts.js';
import { GEOMETRY_ATTRS } from '../chart/pulse-overlay.js';
import { curveOf } from '../easing.js';
import { PULSE, PULSE_MS } from '../pulse.js';
import { TONE_FILLS, TONE_INKS, TONE_OUTLINES } from '../tone.js';
import { tokens, values } from '../vendor/theme/tokens.js';

const DURATION = values.duration;

// 효과 시간(표시 ms, 장면 speed와 상관없음)은 src/pulse.js의 PULSE가 주인이다(올라가고, 유지하고, 내려오는 세 토큰의 읽기). 비는 선의 고정 알약은 세 시간의 합(PULSE_MS) 동안 줄어든다. 재생기는 합을 다시 계산하지 않고 이 값을 읽는다.
const PULSE_TIMING = Object.freeze({ riseMs: PULSE.rise, holdMs: PULSE.hold, decayMs: PULSE.fall, fadeMs: PULSE_MS });

// 점과 글 상자, 아이콘, 후광을 그릴 때 쓰는 값.
export const PLAYER_METRICS = Object.freeze({
  readableText: values.text["figure-meta"],
  active: tokens.color.state.active,
  chipFill: tokens.color.state['active-fill'],
  chipInk: tokens.color.state['on-active'],
  halo: values.spacing.figure.packet.halo,
  haloOpacity: values.opacity.halo,
  packet: values.spacing.figure.packet.radius,
  chipRadius: values.radius.lg,
  pulse: PULSE_TIMING,
  markGeometry: GEOMETRY_ATTRS,
  chipLine: STYLE.chip.line,
  chipPadX: values.spacing["4-5"],
  chipPadY: values.spacing["2"],
  chipGap: values.spacing["3"],
  icon: values.spacing.figure.control.icon,
  iconStroke: values.spacing.figure.control["icon-stroke"],
  zoomMax: values.scale['zoom-max'],
  zoomStep: values.scale['zoom-step'],
  noticeMs: DURATION.notice,
  move: curveOf('move'),
});

// 갈래색(tone)이나 값 줄을 쓰는 그림에만 더하는 재생기 값. 쓰지 않는 그림의 재생기 파일은 그대로다.
// 색 이름과 각 이름의 면, 글자, 윤곽은 범주 색 도우미에서 오는 tone.js 하나가 정한다(옛 color.flow 토큰은 읽지 않는다).
export const FLOW_METRICS = Object.freeze({ tones: TONE_FILLS, toneInks: TONE_INKS, toneOutlines: TONE_OUTLINES, chipStroke: values["border-width"].edge, cutFadeMs: values.duration['cut-fade'] });
