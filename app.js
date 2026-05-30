const STORAGE_KEY = "txt_reader_state_v1";

const state = {
  documents: [],
  selectedId: null,
  search: "",
  words: [],
  index: 0,
  isPlaying: false,
  wpm: 320,
  lastStepAt: 0,
  lastInteractionAt: Date.now(),
  chromeVisible: true,
  sidebarCollapsed: false,
};

const els = {
  app: document.getElementById("app"),
  sidebarToggleBtn: document.getElementById("sidebarToggleBtn"),
  sidebarOpenBtn: document.getElementById("sidebarOpenBtn"),
  importBtn: document.getElementById("importBtn"),
  fileInput: document.getElementById("fileInput"),
  searchInput: document.getElementById("searchInput"),
  dropZone: document.getElementById("dropZone"),
  docList: document.getElementById("docList"),
  docTitle: document.getElementById("docTitle"),
  docMeta: document.getElementById("docMeta"),
  wordCount: document.getElementById("wordCount"),
  wpmStat: document.getElementById("wpmStat"),
  prefix: document.getElementById("prefix"),
  pivot: document.getElementById("pivot"),
  suffix: document.getElementById("suffix"),
  backBtn: document.getElementById("backBtn"),
  playBtn: document.getElementById("playBtn"),
  nextBtn: document.getElementById("nextBtn"),
  progressText: document.getElementById("progressText"),
  progressSlider: document.getElementById("progressSlider"),
  speedSlider: document.getElementById("speedSlider"),
  speedValue: document.getElementById("speedValue"),
  readerHeader: document.getElementById("readerHeader"),
  readerFooter: document.getElementById("readerFooter"),
};

init();

function init() {
  loadState();
  ensureSampleIfEmpty();
  bindEvents();
  hydrateSelection();
  renderAll();
  requestAnimationFrame(tick);
}

function bindEvents() {
  els.sidebarToggleBtn.addEventListener("click", () => setSidebarCollapsed(true));
  els.sidebarOpenBtn.addEventListener("click", () => setSidebarCollapsed(false));

  els.importBtn.addEventListener("click", () => els.fileInput.click());
  els.fileInput.addEventListener("change", (e) => handleFileList(e.target.files));

  els.searchInput.addEventListener("input", (e) => {
    state.search = e.target.value.trim().toLowerCase();
    renderDocList();
  });

  ;["dragenter", "dragover"].forEach((name) => {
    document.addEventListener(name, (e) => {
      e.preventDefault();
      els.dropZone.classList.add("drag-over");
    });
  });

  ;["dragleave", "drop"].forEach((name) => {
    els.dropZone.addEventListener(name, (e) => {
      e.preventDefault();
      els.dropZone.classList.remove("drag-over");
    });
  });

  document.addEventListener("drop", (e) => {
    e.preventDefault();
    els.dropZone.classList.remove("drag-over");
    handleFileList(e.dataTransfer.files);
  });

  els.backBtn.addEventListener("click", () => jump(-10));
  els.nextBtn.addEventListener("click", () => jump(10));
  els.playBtn.addEventListener("click", togglePlay);

  els.progressSlider.addEventListener("input", (e) => {
    state.index = Number(e.target.value);
    persistProgress();
    renderReader();
  });

  els.speedSlider.addEventListener("input", (e) => {
    state.wpm = Number(e.target.value);
    renderControls();
    persist();
  });

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      togglePlay();
    } else if (e.code === "ArrowLeft") {
      jump(-10);
    } else if (e.code === "ArrowRight") {
      jump(10);
    }
  });

  ["mousemove", "mousedown", "wheel", "touchstart", "keydown"].forEach((eventName) => {
    window.addEventListener(eventName, noteInteraction, { passive: true });
  });
}

function noteInteraction() {
  state.lastInteractionAt = Date.now();
  if (!state.chromeVisible) {
    state.chromeVisible = true;
    renderChromeVisibility();
  }
}

async function handleFileList(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;

  for (const file of files) {
    try {
      const content = await parseFile(file);
      if (!content.trim()) continue;
      state.documents.push(makeDocument(file.name, content));
      state.selectedId = state.documents[state.documents.length - 1].id;
    } catch {
      // skip unsupported or failed files
    }
  }

  state.documents = state.documents.filter((d) => !d.isSample);
  ensureSampleIfEmpty();
  hydrateSelection();
  persist();
  renderAll();
}

async function parseFile(file) {
  const ext = getExt(file.name);
  if (["txt", "md", "csv", "json"].includes(ext)) {
    const text = await file.text();
    return ext === "json" ? textFromJson(text) : text;
  }

  if (ext === "docx") {
    const buffer = await file.arrayBuffer();
    const result = await window.mammoth.extractRawText({ arrayBuffer: buffer });
    return result.value || "";
  }

  throw new Error("Unsupported file");
}

function textFromJson(raw) {
  try {
    const parsed = JSON.parse(raw);
    const bucket = [];
    collectStrings(parsed, bucket);
    return bucket.join(" ");
  } catch {
    return raw;
  }
}

function collectStrings(value, bucket) {
  if (typeof value === "string") bucket.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, bucket));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => collectStrings(v, bucket));
}

function makeDocument(name, content, isSample = false) {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name,
    title: name.replace(/\.[^/.]+$/, ""),
    content,
    index: 0,
    total: tokenize(content).length,
    createdAt: now,
    updatedAt: now,
    isSample,
  };
}

function ensureSampleIfEmpty() {
  const realDocs = state.documents.filter((d) => !d.isSample);
  if (realDocs.length > 0) {
    state.documents = realDocs;
    return;
  }

  if (!state.documents.length) {
    state.documents = [
      makeDocument(
        "welcome.txt",
        "Welcome to txt. Drag files into the sidebar to get started.",
        true
      ),
    ];
  }

  if (!state.selectedId) state.selectedId = state.documents[0].id;
}

function hydrateSelection() {
  let selected = getSelectedDoc();
  if (!selected) {
    state.selectedId = state.documents[0]?.id || null;
    selected = getSelectedDoc();
  }

  if (!selected) {
    state.words = [];
    state.index = 0;
    return;
  }

  state.words = tokenize(selected.content);
  selected.total = state.words.length;
  state.index = Math.min(selected.index || 0, Math.max(state.words.length - 1, 0));
}

function tokenize(content) {
  const tokens = content.replace(/\s+/g, " ").trim().split(" ");
  return tokens.filter(Boolean).length ? tokens.filter(Boolean) : ["No", "content", "available"];
}

function getSelectedDoc() {
  return state.documents.find((d) => d.id === state.selectedId) || null;
}

function renderAll() {
  renderLayout();
  renderDocList();
  renderReader();
  renderControls();
  renderChromeVisibility();
}

function renderLayout() {
  els.app.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
}

function renderDocList() {
  const q = state.search;
  const docs = [...state.documents]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .filter((d) => !q || d.title.toLowerCase().includes(q) || d.content.toLowerCase().includes(q));

  els.docList.innerHTML = "";

  for (const doc of docs) {
    const li = document.createElement("li");
    li.className = `doc-item ${doc.id === state.selectedId ? "active" : ""}`;
    li.innerHTML = `<h3>${escapeHtml(doc.title)}</h3><p>${escapeHtml(doc.content.slice(0, 92))}</p>`;
    li.addEventListener("click", () => {
      state.selectedId = doc.id;
      state.isPlaying = false;
      hydrateSelection();
      persist();
      renderAll();
    });
    els.docList.appendChild(li);
  }
}

function renderReader() {
  const doc = getSelectedDoc();
  if (!doc) return;

  const word = state.words[state.index] || "";
  const { prefix, pivot, suffix } = splitPivot(word);

  els.docTitle.textContent = doc.title;
  els.docMeta.textContent = doc.name;
  els.wordCount.textContent = `Word ${Math.min(state.index + 1, state.words.length)} / ${state.words.length}`;

  els.prefix.textContent = prefix;
  els.pivot.textContent = pivot;
  els.suffix.textContent = suffix;

  const pct = state.words.length ? Math.round(((state.index + 1) / state.words.length) * 100) : 0;
  els.progressText.textContent = `${pct}%`;

  els.progressSlider.max = String(Math.max(state.words.length - 1, 1));
  els.progressSlider.value = String(Math.min(state.index, Math.max(state.words.length - 1, 0)));
}

function renderControls() {
  els.speedSlider.value = String(state.wpm);
  els.speedValue.textContent = String(state.wpm);
  els.wpmStat.textContent = `${state.wpm} WPM`;
  els.playBtn.textContent = state.isPlaying ? "Pause" : "Play";
}

function renderChromeVisibility() {
  [els.readerHeader, els.readerFooter].forEach((el) => {
    el.classList.toggle("hidden", !state.chromeVisible);
  });
}

function splitPivot(word) {
  if (!word) return { prefix: "", pivot: " ", suffix: "" };
  const chars = [...word];
  const i = pivotIndex(chars.length);
  return {
    prefix: chars.slice(0, i).join(""),
    pivot: chars[i],
    suffix: chars.slice(i + 1).join(""),
  };
}

function pivotIndex(length) {
  if (length <= 1) return 0;
  if (length <= 5) return 1;
  if (length <= 9) return 2;
  return 3;
}

function togglePlay() {
  state.isPlaying = !state.isPlaying;
  if (state.isPlaying && state.index >= state.words.length - 1) state.index = 0;
  renderControls();
}

function jump(n) {
  state.index = clamp(state.index + n, 0, Math.max(state.words.length - 1, 0));
  persistProgress();
  renderReader();
}

function tick(ts) {
  if (state.chromeVisible && Date.now() - state.lastInteractionAt >= 5000) {
    state.chromeVisible = false;
    renderChromeVisibility();
  }

  if (state.isPlaying) {
    const interval = 60000 / Math.max(state.wpm, 1);
    if (!state.lastStepAt || ts - state.lastStepAt >= interval) {
      state.lastStepAt = ts;
      if (state.index < state.words.length - 1) {
        state.index += 1;
        persistProgress(false);
        renderReader();
      } else {
        state.isPlaying = false;
        renderControls();
        persistProgress(true);
      }
    }
  }

  requestAnimationFrame(tick);
}

function persistProgress(force = true) {
  const doc = getSelectedDoc();
  if (!doc) return;
  doc.index = state.index;
  doc.updatedAt = Date.now();
  if (force) persist();
}

function persist() {
  const payload = {
    documents: state.documents,
    selectedId: state.selectedId,
    wpm: state.wpm,
    sidebarCollapsed: state.sidebarCollapsed,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    state.documents = Array.isArray(data.documents) ? data.documents : [];
    state.selectedId = data.selectedId || null;
    state.wpm = Number(data.wpm || 320);
    state.sidebarCollapsed = Boolean(data.sidebarCollapsed);
  } catch {
    state.documents = [];
  }
}

function setSidebarCollapsed(collapsed) {
  state.sidebarCollapsed = collapsed;
  renderLayout();
  persist();
}

function getExt(name) {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i + 1).toLowerCase();
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function escapeHtml(str) {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
