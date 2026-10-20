const $ = (id) => document.getElementById(id);
const root = document.documentElement;
const stage = $('stage');
const reader = $('reader');
const flow = $('flow');

const PAD = 16;          // .stage 좌우 여백과 맞춘 값
const SIM_HINGE = 24;    // 시뮬레이션 모드에서 보여줄 가상 힌지 두께
const THEMES = ['auto', 'light', 'sepia', 'dark'];

// localStorage는 사생활 보호 모드 등에서 실패할 수 있으니 항상 감싼다
const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(`fold-reader:${key}`);
      return v === null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(`fold-reader:${key}`, JSON.stringify(value)); } catch { /* 무시 */ }
  },
};

const state = {
  mode: 'single',
  cols: 1,
  gap: 32,
  step: 0,
  spread: 0,
  spreads: 1,
  segments: [],
  force: 'auto',
  fontSize: store.get('fontSize', 19),
  theme: store.get('theme', 'auto'),
  bookKey: 'sample',
};

// ---------- 접힘 상태 감지 ----------

function readSegments() {
  try {
    // 표준: window.viewport.segments / 구버전 실험 API: window.getWindowSegments()
    const segs = window.viewport?.segments ?? window.getWindowSegments?.();
    return segs ? Array.from(segs) : [];
  } catch {
    return [];
  }
}

function simulatedSegments(kind) {
  const w = innerWidth;
  const h = innerHeight;
  if (kind === 'book') {
    const half = (w - SIM_HINGE) / 2;
    return [new DOMRect(0, 0, half, h), new DOMRect(half + SIM_HINGE, 0, half, h)];
  }
  const half = (h - SIM_HINGE) / 2;
  return [new DOMRect(0, 0, w, half), new DOMRect(0, half + SIM_HINGE, w, half)];
}

function detect() {
  const { force } = state;
  const segments = force === 'book' || force === 'tabletop'
    ? simulatedSegments(force)
    : force === 'auto' ? readSegments() : [];

  if (segments.length === 2) {
    const [a, b] = segments;
    const sideBySide = Math.abs(a.top - b.top) < 1;
    return { mode: sideBySide ? 'book' : 'tabletop', segments };
  }
  if (force === 'single' || force === 'wide') return { mode: force, segments };

  // 세그먼트가 없으면 화면 비율로 판단: 펼친 Fold는 정사각형에 가깝고, 커버 화면은 길쭉하다
  const wide = innerWidth >= 900 || (innerWidth >= 600 && innerWidth / innerHeight >= 0.75);
  return { mode: wide ? 'wide' : 'single', segments };
}

// ---------- 레이아웃 & 페이지 계산 ----------

function applyLayout() {
  const ratio = state.spreads > 1 ? state.spread / (state.spreads - 1) : 0;
  const { mode, segments } = detect();
  state.mode = mode;
  state.segments = segments;
  root.dataset.mode = mode;

  if (mode === 'book') {
    const [a, b] = segments;
    const hinge = Math.max(0, b.left - a.right);
    root.style.setProperty('--hinge-x', `${a.right}px`);
    root.style.setProperty('--hinge-w', `${hinge}px`);
    // 단 사이 간격 = 힌지 + 양쪽 여백 → 각 쪽이 자기 화면 한가운데 놓인다
    state.cols = 2;
    state.gap = hinge + PAD * 2;
  } else if (mode === 'tabletop') {
    const [a, b] = segments;
    root.style.setProperty('--seg-top-h', `${a.height}px`);
    root.style.setProperty('--hinge-h', `${Math.max(0, b.top - a.bottom)}px`);
    state.cols = innerWidth >= 700 ? 2 : 1;
    state.gap = 56;
  } else if (mode === 'wide') {
    state.cols = 2;
    state.gap = 56;
  } else {
    state.cols = 1;
    state.gap = 32;
  }

  flow.style.columnCount = state.cols;
  flow.style.columnGap = `${state.gap}px`;
  paginate();
  goTo(Math.round(ratio * (state.spreads - 1)), false);
  updateDebug();
}

function paginate() {
  state.step = reader.clientWidth + state.gap;
  // 마지막 펼침면이 한 쪽만 차 있어도 한 장으로 센다
  state.spreads = Math.max(1, Math.ceil((flow.scrollWidth + state.gap) / state.step - 0.02));
  $('pageSlider').max = state.spreads;
}

function goTo(index, animate = true) {
  state.spread = Math.min(Math.max(0, index), state.spreads - 1);
  flow.classList.toggle('no-anim', !animate);
  flow.style.transform = `translateX(${-state.spread * state.step}px)`;

  $('pageSlider').value = state.spread + 1;
  $('pageLabel').textContent = `${state.spread + 1} / ${state.spreads}`;
  $('prevBtn').disabled = state.spread === 0;
  $('nextBtn').disabled = state.spread === state.spreads - 1;

  const ratio = state.spreads > 1 ? state.spread / (state.spreads - 1) : 0;
  store.set(`pos:${state.bookKey}`, ratio);
}

const next = () => goTo(state.spread + 1);
const prev = () => goTo(state.spread - 1);

let layoutQueued = false;
function scheduleLayout() {
  if (layoutQueued) return;
  layoutQueued = true;
  requestAnimationFrame(() => {
    layoutQueued = false;
    applyLayout();
  });
}

// ---------- 본문 ----------

function renderText(text, title) {
  const frag = document.createDocumentFragment();
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const heading = line.match(/^#+\s*(.*)$/);
    const el = document.createElement(heading ? 'h2' : 'p');
    el.textContent = heading ? heading[1] : line;
    frag.append(el);
  }
  flow.replaceChildren(frag);
  $('bookTitle').textContent = title;
}

function openBook(text, key, title) {
  // applyLayout이 위치를 저장하기 전에 먼저 읽어 둔다
  const saved = store.get(`pos:${key}`, 0);
  state.bookKey = key;
  state.spread = 0;
  renderText(text, title);
  applyLayout();
  goTo(Math.round(saved * (state.spreads - 1)), false);
}

async function loadSample() {
  try {
    const res = await fetch('content/sample.txt');
    openBook(await res.text(), 'sample', 'Fold Reader 안내');
  } catch {
    openBook('# 불러오기 실패\n샘플 파일을 읽지 못했어요. 오른쪽 위 "열기"로 텍스트 파일을 선택해 주세요.', 'error', 'Fold Reader');
  }
}

// ---------- 설정 ----------

function applyFontSize() {
  root.style.setProperty('--font-size', `${state.fontSize}px`);
  store.set('fontSize', state.fontSize);
}

function applyTheme() {
  if (state.theme === 'auto') delete root.dataset.theme;
  else root.dataset.theme = state.theme;
  store.set('theme', state.theme);
}

function changeFont(delta) {
  state.fontSize = Math.min(32, Math.max(14, state.fontSize + delta));
  applyFontSize();
  applyLayout();
}

// ---------- 상태 패널 ----------

function updateDebug() {
  $('modeBadge').textContent = state.mode;
  if ($('debug').hidden) return;
  const fmt = (r) => `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}×${Math.round(r.height)}`;
  $('dbgMode').textContent = state.force === 'auto' ? state.mode : `${state.mode} (시뮬레이션)`;
  $('dbgPosture').textContent = navigator.devicePosture?.type ?? '미지원';
  $('dbgSegments').textContent = state.segments.length ? state.segments.map(fmt).join(' | ') : '1개 (분할 없음)';
  $('dbgViewport').textContent = `${innerWidth}×${innerHeight} @${devicePixelRatio}x`;
  $('dbgCols').textContent = `${state.cols}단 / ${state.gap}px`;
}

// ---------- 입력 ----------

$('prevBtn').addEventListener('click', prev);
$('nextBtn').addEventListener('click', next);
$('pageSlider').addEventListener('input', (e) => goTo(Number(e.target.value) - 1));
$('fontDown').addEventListener('click', () => changeFont(-1));
$('fontUp').addEventListener('click', () => changeFont(1));
$('themeBtn').addEventListener('click', () => {
  state.theme = THEMES[(THEMES.indexOf(state.theme) + 1) % THEMES.length];
  applyTheme();
});
$('openBtn').addEventListener('click', () => $('fileInput').click());
$('fileInput').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  openBook(await file.text(), `file:${file.name}:${file.size}`, file.name.replace(/\.txt$/i, ''));
  e.target.value = '';
});
$('debugBtn').addEventListener('click', () => {
  const panel = $('debug');
  panel.hidden = !panel.hidden;
  $('debugBtn').setAttribute('aria-expanded', String(!panel.hidden));
  updateDebug();
});
$('forceMode').addEventListener('change', (e) => {
  state.force = e.target.value;
  applyLayout();
});

document.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); next(); }
  if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); prev(); }
});

// 스와이프로 넘기고, 화면 왼쪽/오른쪽 1/3을 탭해도 넘긴다
let pointerStart = null;
stage.addEventListener('pointerdown', (e) => { pointerStart = { x: e.clientX, y: e.clientY }; });
stage.addEventListener('pointerup', (e) => {
  if (!pointerStart) return;
  const dx = e.clientX - pointerStart.x;
  const dy = e.clientY - pointerStart.y;
  pointerStart = null;
  if (getSelection()?.toString()) return;

  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
    dx < 0 ? next() : prev();
  } else if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
    const rect = stage.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    if (x < 1 / 3) prev();
    else if (x > 2 / 3) next();
  }
});

// 접기/펴기, 회전, 창 크기 변화 모두 다시 배치
new ResizeObserver(scheduleLayout).observe(stage);
addEventListener('resize', scheduleLayout);
navigator.devicePosture?.addEventListener('change', scheduleLayout);

// ---------- 시작 ----------

applyTheme();
applyFontSize();
document.fonts?.ready.then(scheduleLayout);
loadSample();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* 오프라인 캐시 없이도 동작 */ });
}
