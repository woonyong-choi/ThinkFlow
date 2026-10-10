/** CSS 축소기가 ms를 s로 바꿔도 같은 시간을 읽는다. */
export function cssTimeMs(value) {
  const text = value.trim();
  const amount = Number.parseFloat(text);
  if (!Number.isFinite(amount) || amount < 0 || !/m?s$/.test(text)) throw new TypeError(`Invalid CSS duration: ${value}`);
  return amount * (text.endsWith('ms') ? 1 : 1000);
}
