/**
 * Emergency dashboard — client-side queue, filter, sort, stats.
 * Uses GET /predict and POST /predict_batch only (no backend changes).
 */

const STORAGE_KEY = "ecs_dashboard_queue_v1";
const THEME_KEY = "ecs_theme";

const PRIORITY_ORDER = { critical: 4, urgent: 3, medium: 2, low: 1 };

function getPreferredTheme() {
  const s = localStorage.getItem(THEME_KEY);
  if (s === "light" || s === "dark") return s;
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function syncThemeButton() {
  const t = document.documentElement.dataset.theme;
  const btn = document.getElementById("themeToggle");
  if (!btn) return;
  const label = btn.querySelector(".theme-toggle__text");
  const isDark = t === "dark";
  if (label) label.textContent = isDark ? "Light" : "Dark";
  btn.setAttribute("aria-pressed", isDark ? "true" : "false");
  btn.setAttribute(
    "aria-label",
    isDark ? "Switch to light theme" : "Switch to dark theme"
  );
}

function applyTheme(theme) {
  if (theme !== "light" && theme !== "dark") return;
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
  syncThemeButton();
}

function initTheme() {
  applyTheme(getPreferredTheme());
}

function normalizePriority(p) {
  if (p == null) return null;
  const s = String(p).toLowerCase();
  return PRIORITY_ORDER[s] != null ? s : s;
}

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveState(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* ignore quota */
  }
}

/** Backend origin for classify requests (same machine as the page when served with the API). */
const API_BASE = "http://127.0.0.1:8000";

function apiBase() {
  return API_BASE.replace(/\/$/, "");
}

async function classifyMessages(texts) {
  const base = apiBase();
  if (!texts.length) return [];

  const tryBatch = async () => {
    const res = await fetch(`${base}/predict_batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(texts),
    });
    if (!res.ok) throw new Error(`Batch ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    const results = data.results;
    if (!Array.isArray(results) || results.length !== texts.length) {
      throw new Error("Unexpected batch response");
    }
    return results.map((r, i) => ({
      message: texts[i],
      priority: normalizePriority(r.priority),
      confidence: typeof r.confidence === "number" ? r.confidence : null,
    }));
  };

  const tryOne = async (msg) => {
    const url = `${base}/predict?msg=${encodeURIComponent(msg)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Predict ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return {
      message: msg,
      priority: normalizePriority(data.priority),
      confidence: typeof data.confidence === "number" ? data.confidence : null,
    };
  };

  try {
    return await tryBatch();
  } catch {
    const out = [];
    for (const t of texts) {
      out.push(await tryOne(t));
    }
    return out;
  }
}

/** @type {Array<{id:string,text:string,createdAt:string,priority:string|null,confidence:number|null,status:string}>} */
let items = loadState();

const els = {
  criticalBanner: document.getElementById("criticalBanner"),
  criticalBannerDetail: document.getElementById("criticalBannerDetail"),
  messageInput: document.getElementById("messageInput"),
  btnEnqueue: document.getElementById("btnEnqueue"),
  btnClassify: document.getElementById("btnClassify"),
  btnClassifyPending: document.getElementById("btnClassifyPending"),
  apiStatus: document.getElementById("apiStatus"),
  filterPriority: document.getElementById("filterPriority"),
  filterSearch: document.getElementById("filterSearch"),
  sortField: document.getElementById("sortField"),
  sortDir: document.getElementById("sortDir"),
  btnClearAll: document.getElementById("btnClearAll"),
  queueBody: document.getElementById("queueBody"),
  emptyState: document.getElementById("emptyState"),
  queueCount: document.getElementById("queueCount"),
  statTotal: document.getElementById("statTotal"),
  statPending: document.getElementById("statPending"),
  statAvgConf: document.getElementById("statAvgConf"),
  statByPriority: document.getElementById("statByPriority"),
};

function splitLines(raw) {
  return raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function setStatus(msg, isError) {
  els.apiStatus.textContent = msg || "";
  els.apiStatus.classList.toggle("status--error", !!isError);
}

function getFilteredSorted() {
  const fp = els.filterPriority.value;
  const q = (els.filterSearch.value || "").trim().toLowerCase();
  let list = items.filter((it) => {
    if (fp === "all") return true;
    if (fp === "pending") return it.status === "pending";
    if (it.status === "pending") return false;
    return normalizePriority(it.priority) === fp;
  });
  if (q) {
    list = list.filter((it) => it.text.toLowerCase().includes(q));
  }

  const field = els.sortField.value;
  const dir = els.sortDir.value === "asc" ? 1 : -1;

  const priVal = (p) => PRIORITY_ORDER[normalizePriority(p)] ?? 0;

  list.sort((a, b) => {
    let cmp = 0;
    if (field === "time") {
      cmp = new Date(a.createdAt) - new Date(b.createdAt);
    } else if (field === "priority") {
      cmp = priVal(a.priority) - priVal(b.priority);
      if (cmp === 0) cmp = a.text.localeCompare(b.text);
    } else if (field === "confidence") {
      const ca = a.confidence ?? -1;
      const cb = b.confidence ?? -1;
      cmp = ca - cb;
      if (cmp === 0) cmp = new Date(a.createdAt) - new Date(b.createdAt);
    }
    return cmp * dir;
  });
  return list;
}

function computeStats(viewList) {
  const classified = viewList.filter((i) => i.status !== "pending");
  const pending = viewList.filter((i) => i.status === "pending").length;
  const byPri = { critical: 0, urgent: 0, medium: 0, low: 0 };
  let confSum = 0;
  let confN = 0;
  for (const it of classified) {
    const p = normalizePriority(it.priority);
    if (p && byPri[p] != null) byPri[p] += 1;
    if (it.confidence != null) {
      confSum += it.confidence;
      confN += 1;
    }
  }
  const avgConf = confN ? confSum / confN : null;
  return {
    totalView: viewList.length,
    pending,
    byPri,
    avgConf,
    maxPri: Math.max(1, ...Object.values(byPri)),
  };
}

function updateCriticalBanner(viewList) {
  const criticalCount = viewList.filter(
    (i) => i.status !== "pending" && normalizePriority(i.priority) === "critical"
  ).length;
  if (criticalCount > 0) {
    els.criticalBanner.classList.remove("critical-banner--hidden");
    els.criticalBannerDetail.textContent = `${criticalCount} classified as critical with the current filter.`;
  } else {
    els.criticalBanner.classList.add("critical-banner--hidden");
  }
}

function pillClass(pri) {
  const p = normalizePriority(pri);
  if (!p || p === "pending") return "pill pill--pending";
  return `pill pill--${p}`;
}

function msgModifier(it) {
  if (it.status === "pending") return "msg--pending";
  const p = normalizePriority(it.priority);
  if (p && ["critical", "urgent", "medium", "low"].includes(p)) {
    return `msg--${p}`;
  }
  return "msg--pending";
}

function formatTime(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "—";
  }
}

function render() {
  const viewList = getFilteredSorted();
  const stats = computeStats(viewList);

  els.statTotal.textContent = String(stats.totalView);
  els.statPending.textContent = String(stats.pending);
  els.statAvgConf.textContent =
    stats.avgConf != null ? stats.avgConf.toFixed(3) : "—";

  const order = ["critical", "urgent", "medium", "low"];
  els.statByPriority.innerHTML = order
    .map((name) => {
      const n = stats.byPri[name];
      const pct = stats.maxPri ? Math.round((n / stats.maxPri) * 100) : 0;
      const colors = {
        critical: "#b54548",
        urgent: "#a67a35",
        medium: "#8f8a3a",
        low: "#4d8a5c",
      };
      return `<li class="stat-list__item">
        <span class="stat-list__name">${name}</span>
        <div class="stat-list__track" aria-hidden="true">
          <div class="stat-list__fill" style="width:${pct}%;background:${colors[name]}"></div>
        </div>
        <span class="stat-list__count">${n}</span>
      </li>`;
    })
    .join("");

  updateCriticalBanner(viewList);

  const pendingAll = items.filter((i) => i.status === "pending");
  if (els.btnClassifyPending) {
    els.btnClassifyPending.hidden = pendingAll.length === 0;
    els.btnClassifyPending.textContent = `Classify pending (${pendingAll.length})`;
  }

  els.queueCount.textContent = `${viewList.length} message${
    viewList.length === 1 ? "" : "s"
  }`;

  els.queueBody.innerHTML = "";
  for (const it of viewList) {
    const card = document.createElement("article");
    card.className = `msg ${msgModifier(it)}`;
    card.setAttribute("role", "listitem");
    const priLabel =
      it.status === "pending"
        ? "Pending"
        : normalizePriority(it.priority) || String(it.priority ?? "—");
    const conf =
      it.confidence != null ? it.confidence.toFixed(3) : "—";
    card.innerHTML = `
      <div class="msg__body">
        <p class="msg__text">${escapeHtml(it.text)}</p>
        <div class="msg__row">
          <time class="msg__time" datetime="${it.createdAt}">${formatTime(it.createdAt)}</time>
          <span class="${pillClass(it.priority)}">${escapeHtml(priLabel)}</span>
          <span class="msg__conf" aria-label="Confidence">${conf === "—" ? "—" : conf}</span>
        </div>
      </div>
      <button type="button" class="msg__remove" data-remove="${it.id}">Remove</button>
    `;
    els.queueBody.appendChild(card);
  }

  els.emptyState.classList.toggle("void--show", viewList.length === 0);

  els.queueBody.querySelectorAll(".msg__remove[data-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-remove");
      items = items.filter((x) => x.id !== id);
      saveState(items);
      render();
    });
  });
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function enqueuePending(lines) {
  const now = new Date().toISOString();
  for (const text of lines) {
    items.unshift({
      id: uid(),
      text,
      createdAt: now,
      priority: null,
      confidence: null,
      status: "pending",
    });
  }
  saveState(items);
}

async function classifyAndAdd(lines) {
  if (!lines.length) {
    setStatus("Enter at least one message.", true);
    return;
  }
  setStatus("Classifying…", false);
  try {
    const results = await classifyMessages(lines);
    const now = new Date().toISOString();
    for (const r of results) {
      items.unshift({
        id: uid(),
        text: r.message,
        createdAt: now,
        priority: r.priority,
        confidence: r.confidence,
        status: "classified",
      });
    }
    saveState(items);
    els.messageInput.value = "";
    setStatus(`Classified ${results.length} message(s).`, false);
    render();
  } catch (e) {
    setStatus(e.message || "Request failed. Is the API running?", true);
  }
}

els.btnEnqueue.addEventListener("click", () => {
  const lines = splitLines(els.messageInput.value);
  if (!lines.length) {
    setStatus("Enter at least one message.", true);
    return;
  }
  enqueuePending(lines);
  els.messageInput.value = "";
  setStatus(`Added ${lines.length} pending message(s).`, false);
  render();
});

els.btnClassify.addEventListener("click", () => {
  const lines = splitLines(els.messageInput.value);
  classifyAndAdd(lines);
});

els.btnClassifyPending?.addEventListener("click", async () => {
  const pending = items.filter((i) => i.status === "pending");
  if (!pending.length) return;
  const texts = pending.map((p) => p.text);
  setStatus("Classifying pending…", false);
  try {
    const results = await classifyMessages(texts);
    const byId = new Map(
      pending.map((p, i) => [
        p.id,
        { priority: results[i].priority, confidence: results[i].confidence },
      ])
    );
    items = items.map((it) => {
      const r = byId.get(it.id);
      if (!r) return it;
      return {
        ...it,
        priority: r.priority,
        confidence: r.confidence,
        status: "classified",
      };
    });
    saveState(items);
    setStatus(`Classified ${pending.length} pending message(s).`, false);
    render();
  } catch (e) {
    setStatus(e.message || "Request failed. Is the API running?", true);
  }
});

[
  els.filterPriority,
  els.filterSearch,
  els.sortField,
  els.sortDir,
].forEach((el) => el.addEventListener("input", render));

els.btnClearAll.addEventListener("click", () => {
  if (items.length && !confirm("Remove all messages from the queue?")) return;
  items = [];
  saveState(items);
  setStatus("Queue cleared.", false);
  render();
});

document.getElementById("themeToggle")?.addEventListener("click", () => {
  const next =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(next);
});

initTheme();
render();
