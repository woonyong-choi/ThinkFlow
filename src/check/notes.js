// 12번: 순서 그림 메모가 그림 안에 있고 화살표, 라벨, 다른 생명선을 가리지 않는다.
import { FIT_SLACK } from '../measure/fonts.js';
import { overlaps, pillBox } from './geometry.js';

// 오류 메시지에 넣는 메모 글 길이
const NAME_MAX = 24;

// cost: time O(n·(e + l)), heap O(1), stack O(1)
// vars: n = 메모 수, e = 선 수, l = 생명선 수
// basis: estimate
// 12번: 순서 그림 메모가 그림 안에 있고, 같은 행 메시지의 화살표와 라벨을 가리지 않으며(오류), 다른 참여자의 생명선에 걸치지 않는다(경고).
export function checkNotes({ scene }, problems) {
  for (const note of scene.notes ?? []) {
    const name = note.text.length > NAME_MAX ? `${note.text.slice(0, NAME_MAX)}...` : note.text;
    if (note.x < -FIT_SLACK || note.x + note.w > scene.width + FIT_SLACK) problems.error(note.line, `[check 12] note "${name}" leaves the figure. Shorten the note`);
    for (const e of scene.edges.filter((edge) => edge.index === note.m)) checkNoteOnMessage({ note, name }, e, problems);
    for (const life of scene.lifelines.filter((l) => l.id !== note.node)) {
      if (life.x > note.x && life.x < note.x + note.w && life.y1 < note.y + note.h && note.y < life.y2) problems.warn(note.line, `[check 12] note "${name}" crosses the lifeline of "${life.id}". Shorten the note`);
    }
  }
}

// cost: time O(p), heap O(p), stack O(1)
// vars: p = 경로 점 수
// basis: estimate
function checkNoteOnMessage({ note, name }, e, problems) {
  const xs = e.points.map((p) => p.x);
  const ys = e.points.map((p) => p.y);
  const arrow = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  if (overlaps(note, arrow)) problems.error(note.line, `[check 12] note "${name}" covers the arrow of message ${e.from} -> ${e.to} (line ${e.line}). Put the note on another participant or shorten the message`);
  if (e.label && e.labelAt && overlaps(note, pillBox(e))) problems.error(note.line, `[check 12] note "${name}" covers the label "${e.label}" of message ${e.from} -> ${e.to} (line ${e.line}). Put the note on another participant or shorten the label`);
}
