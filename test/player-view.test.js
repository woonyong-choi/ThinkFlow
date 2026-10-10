// 전체 화면 초점 상태 전환의 단위 시험. 실제 브라우저 전체화면 API와 화면 검수는 별도로 수행한다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const script = readFileSync(new URL('../src/player/view.js', import.meta.url), 'utf8');
function harness({ native = false } = {}) {
  const document = { fullscreenEnabled: native };
  const calls = [];
  const focusable = () => ({ isConnected: true, focus(options) { document.activeElement = this; calls.push(options); } });
  const fullButton = { ...focusable(), setAttribute() {} };
  const classes = new Set();
  const root = { classList: { contains: (name) => classes.has(name), toggle: (name, on) => on ? classes.add(name) : classes.delete(name), remove: (name) => classes.delete(name) } };
  if (native) root.requestFullscreen = () => Promise.resolve();
  const canvas = { ...focusable(), clientWidth: 800, clientHeight: 600, removeAttribute() {}, scrollTo() {} };
  const panels = { querySelectorAll: () => [{ viewBox: { baseVal: { width: 800, height: 600 } } }], style: { setProperty() {}, removeProperty() {} } };
  const window = {}; window.self = window.top = window;
  const context = { document, window, ToolIcon: () => '' };
  runInNewContext(script, context);
  const viewer = { root, fullButton, canvas, panels, zoom: 1 };
  return { ...context, viewer, calls, focusable };
}

for (const native of [false, true]) {
  test(`fullscreen exit restores the entry focus after ${native ? 'native state changes' : 'fallback state changes'}`, () => {
    const h = harness({ native });
    const entry = h.focusable();
    h.document.activeElement = entry;
    h.showFull(h.viewer, false);
    assert.equal(h.calls.length, 0, 'initialization leaves focus alone');
    h.setFull(h.viewer, true);
    if (native) {
      h.document.activeElement = h.viewer.canvas;
      h.showFull(h.viewer, true);
    }
    h.document.activeElement = h.viewer.canvas;
    h.showFull(h.viewer, false);
    assert.equal(h.document.activeElement, entry);
    assert.equal(h.calls.at(-1).preventScroll, true);
    assert.equal(h.viewer.returnFocus, undefined);
    h.showFull(h.viewer, false);
    assert.equal(h.calls.length, 1, 'duplicate notifications do not move focus again');
  });
}

test('fullscreen exit uses the toolbar button when the entry element was removed', () => {
  const h = harness();
  const entry = h.focusable();
  h.document.activeElement = entry;
  h.setFull(h.viewer, true);
  entry.isConnected = false;
  h.document.activeElement = h.viewer.canvas;
  h.showFull(h.viewer, false);
  assert.equal(h.document.activeElement, h.viewer.fullButton);
});


test('fullscreen exit returns to the toolbar when entry focus was the document body', () => {
  const h = harness();
  h.document.body = h.focusable();
  h.document.activeElement = h.document.body;
  h.setFull(h.viewer, true);
  h.document.activeElement = h.viewer.canvas;
  h.showFull(h.viewer, false);
  assert.equal(h.document.activeElement, h.viewer.fullButton);
});
