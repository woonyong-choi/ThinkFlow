// 브라우저에서 돈다(play.js와 한 스크립트로 이어 붙는다). 도구 막대의 문법 복사와 HTML 다운로드. 두 조작 모두 클립보드와 파일 저장만 하고 어디로도 보내지 않는다.
// 복사하는 글은 문서에 실린 원본(.dap) 글이다. HTML 문서의 마크업이나 화면(DOM)을 복사하지 않고, 글을 다시 이스케이프하지 않는다.
// 내려받기는 지금 화면(DOM)을 직렬화하지 않는다. 컴파일러가 만든 정본 템플릿을 문서 머리의 meta 칸에 base64로 넣어 두었으므로, 그 정본에 칸 내용을 다시 채워 내보낸다.
// 그래서 모든 장면, 설정, 글꼴, 아이콘, 원본 글이 들어 있고 현재 장면, 시간, 확대, 테마는 담기지 않으며, 내려받은 파일에서 다시 내려받아도 바이트가 같다.
// CANONICAL_NAME(칸 이름)은 html.js가 이 파일 앞에 상수로 붙인다.

// 내려받기를 시작한 뒤 임시 주소를 거두기까지 기다리는 시간(ms). 브라우저가 파일을 받아 가는 동안 주소가 살아 있어야 한다.
const REVOKE_DELAY_MS = 10_000;

/**
 * 도구 막대의 복사와 내려받기 단추를 붙인다. 정본 칸이 없으면(손으로 고친 문서) 내려받기를, 원본 글이 없으면 복사를 숨긴다. 숨기는 일은 있어도 되는 척하는 일은 없다.
 * @param root `.fl-figure` 요소
 * @param metrics 재생 데이터의 metrics(아이콘 크기와 획, 알림이 보이는 시간 noticeMs)
 */
function bindExport(root, metrics) {
  const tools = { root, metrics, status: root.querySelector('.fl-tool-status'), timer: undefined, shown: undefined };
  bindCopy(tools);
  bindDownload(tools);
}

// ---- 결과 알림 ----

// 결과를 단추 아이콘(확인, 경고)과 짧은 글로 알린다. 글은 화면 읽기 도구에도 알려지고, 시간이 지나면 둘 다 원래대로 돌아온다. 같은 단추를 다시 누르면 새 알림이 앞 알림을 대신한다.
function announce(tools, button, { kind, icon, text }) {
  clearAnnouncement(tools);
  tools.shown = { button, original: button.dataset.icon };
  button.innerHTML = drawUiIcon(tools.metrics, icon);
  button.dataset.state = kind;
  tools.status.dataset.kind = kind;
  tools.status.textContent = text;
  tools.timer = setTimeout(() => clearAnnouncement(tools), tools.metrics.noticeMs);
}

function clearAnnouncement(tools) {
  clearTimeout(tools.timer);
  if (!tools.shown) return;
  const { button, original } = tools.shown;
  button.innerHTML = drawUiIcon(tools.metrics, original);
  delete button.dataset.state;
  tools.status.textContent = '';
  delete tools.status.dataset.kind;
  tools.shown = undefined;
}

// ---- 문법 복사 ----

function bindCopy(tools) {
  const { root, metrics } = tools;
  const button = root.querySelector('.fl-copy');
  button.dataset.icon = 'copy';
  button.innerHTML = drawUiIcon(metrics, 'copy');
  const source = readSource(root);
  button.hidden = source === undefined;
  if (source === undefined) return;
  button.addEventListener('click', async () => {
    if (await copyText(root, source)) announce(tools, button, { kind: 'done', icon: 'check', text: '문법을 복사했습니다' });
    else announce(tools, button, { kind: 'failed', icon: 'alert', text: '복사하지 못했습니다' });
  });
}

// 문서에 실린 원본 글. 칸이 없거나 읽을 수 없으면 undefined다.
function readSource(root) {
  const node = root.querySelector('script.fl-source');
  if (!node) return undefined;
  try {
    const text = JSON.parse(node.textContent);
    return typeof text === 'string' ? text : undefined;
  } catch {
    return undefined;
  }
}

// 글을 클립보드에 쓴다. 비동기 클립보드는 쓰기가 끝난 뒤에야 성공이라고 알린다. 보안 문맥이 아니거나, 쓰기 권한이 막혔거나, 브라우저에 없으면 복사 명령으로 다시 시도한다. 둘 다 안 되면 false이고 성공이라고 알리지 않는다.
async function copyText(root, text) {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 권한 거부나 쓰기 정책: 복사 명령으로 이어서 시도한다. 그것도 안 되면 실패다.
    }
  }
  return copyWithCommand(root, text);
}

// 복사 명령(document.execCommand)으로 쓴다. 눈에 안 보이는 선택 영역을 만들어 명령을 허용시키고, 복사 이벤트에서 원본 글을 그대로 싣는다(글 상자는 줄바꿈을 바꿔 저장하므로 CRLF가 사라진다). 명령이 거절되면 false다.
function copyWithCommand(root, text) {
  const holder = document.createElement('textarea');
  holder.value = text;
  holder.readOnly = true;
  holder.className = 'fl-copy-holder';
  holder.setAttribute('aria-hidden', 'true');
  holder.tabIndex = -1;
  root.append(holder);
  const active = document.activeElement;
  holder.select();
  const onCopy = (event) => {
    event.clipboardData.setData('text/plain', text);
    event.preventDefault();
  };
  document.addEventListener('copy', onCopy, { once: true });
  let isCopied = false;
  try {
    isCopied = document.execCommand('copy');
  } catch {
    isCopied = false;
  }
  document.removeEventListener('copy', onCopy);
  holder.remove();
  active?.focus?.({ preventScroll: true });
  return isCopied;
}

// ---- HTML 다운로드 ----

// 정본 칸이 없으면(손으로 고친 문서) 단추를 숨긴다. 있으면 누를 때 정본을 풀어 파일로 내려보낸다.
function bindDownload(tools) {
  const { root, metrics } = tools;
  const button = root.querySelector('.fl-download');
  button.dataset.icon = 'download';
  button.innerHTML = drawUiIcon(metrics, 'download');
  button.hidden = !document.querySelector(`meta[name="${CANONICAL_NAME}"]`);
  button.addEventListener('click', () => {
    try {
      downloadDocument();
    } catch {
      announce(tools, button, { kind: 'failed', icon: 'alert', text: 'HTML을 만들지 못했습니다' });
      return;
    }
    // 브라우저가 파일을 받아 가는지는 알 수 없으므로 시작했다고만 알린다.
    announce(tools, button, { kind: 'done', icon: 'check', text: '다운로드를 시작했습니다' });
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
