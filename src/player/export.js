// Daphnis는 문법 원본과 정본 HTML만 제공하고 조작과 알림은 공통 도구 막대가 맡는다.
const REVOKE_DELAY_MS = 10_000;

function bindExport(root) {
  const node = root.querySelector('script.fl-source');
  let source;
  try { const value = JSON.parse(node?.textContent); if (typeof value === 'string') source = value; } catch { /* 원본이 없거나 손상되면 복사를 숨긴다. */ }
  bindToolbar(root, {
    source,
    download: document.querySelector(`meta[name="${CANONICAL_NAME}"]`) ? downloadDocument : undefined,
  });
}

// 정본 템플릿을 풀고 칸에 같은 base64를 채워 파일로 내려보낸다. 파일은 서버 없이 만든다.
function downloadDocument() {
  const encoded = document.querySelector(`meta[name="${CANONICAL_NAME}"]`).content;
  const template = new TextDecoder().decode(Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0)));
  // 칸 머리글을 조각으로 이어 만들어, 이 스크립트 글 안에는 같은 글이 따로 나오지 않는다. 그래서 템플릿에서 첫 번째로 찾은 것이 문서 머리의 칸이다.
  const head = '<meta name="' + CANONICAL_NAME + '" content="';
  const at = template.indexOf(head) + head.length;
  const text = template.slice(0, at) + encoded + template.slice(at);
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([text], { type: 'text/html;charset=utf-8' }));
  link.download = downloadName();
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), REVOKE_DELAY_MS);
}

// 문서 제목에서 파일 이름을 만든다. 파일 이름에 못 쓰는 글자와 공백은 줄표로 바꾼다.
function downloadName() {
  const stem = document.title.replace(/[\\/:*?"<>|\u0000-\u001f\s]+/g, '-').replace(/^[-.]+|[-.]+$/g, '');
  return `${stem || 'daphnis'}.html`;
}
