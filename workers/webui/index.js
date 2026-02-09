import SmartmonParse from "./smartmon_parse.js";

const form = document.getElementById("smart-form");
const snInput = document.getElementById("device-sn");
const modelInput = document.getElementById("device-model");
const fwInput = document.getElementById("device-fw");
const rawInput = document.getElementById("raw-data");
const rawCount = document.getElementById("raw-count");
const statusEl = document.getElementById("status");
const outputEl = document.getElementById("output");
const jsonToggle = document.getElementById("json-toggle");
const jsonCopy = document.getElementById("json-copy");
const themeToggle = document.getElementById("theme-toggle");
const vizSection = document.querySelector(".viz");
const outputSection = document.querySelector(".output");
const summaryEl = document.getElementById("summary");
const attrBody = document.getElementById("attr-body");
const attrMeta = document.getElementById("attr-meta");

let wasmModule = null;
let parseFn = null;
let freeFn = null;

const RAW_HEX_LENGTH = 1024;

const setStatus = (message, isError = false) => {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "var(--accent)" : "var(--muted)";
};

const setOutput = (data) => {
  outputEl.textContent = data;
};

const updateRawCount = () => {
  const raw = rawInput.value.replace(/\s+/g, "");
  rawCount.textContent = `${raw.length} / ${RAW_HEX_LENGTH}`;
};

const setResultsVisible = (visible) => {
  [vizSection, outputSection].forEach((section) => {
    if (!section) {
      return;
    }
    section.classList.toggle("is-hidden", !visible);
  });
};

const locateWasmFile = (path) => {
  if (path.endsWith(".wasm")) {
    return new URL("smartmon_parse.wasm", import.meta.url).href;
  }
  return path;
};

const ensureWasm = async () => {
  if (wasmModule) {
    return;
  }
  setStatus("Loading WASM module...");
  wasmModule = await SmartmonParse({ locateFile: locateWasmFile });
  parseFn = wasmModule.cwrap("smartmon_parse_ata_smart_json", "number", [
    "string",
    "string",
    "string",
    "string",
  ]);
  freeFn = wasmModule.cwrap("smartmon_parse_only_free", null, ["number"]);
};

const createEl = (tag, className, text) => {
  const el = document.createElement(tag);
  if (className) {
    el.className = className;
  }
  if (text !== undefined && text !== null) {
    el.textContent = text;
  }
  return el;
};

const renderSummary = (data) => {
  summaryEl.innerHTML = "";
  const input = data.input || {};
  const attrs = data.ata_smart_attributes?.table || [];
  const revision = data.ata_smart_attributes?.revision;
  const eventCount = attrs.filter((item) => item.flags?.event_count).length;

  const cards = [
    { label: "Serial Number", value: input.sn || snInput.value || "-" },
    { label: "Device Model", value: input.md || modelInput.value || "-" },
    { label: "Firmware Version", value: input.fw || fwInput.value || "-" },
    { label: "SMART Revision", value: revision ?? "-" },
  ];

  cards.forEach((card) => {
    const wrap = createEl("div", "stat-card");
    wrap.appendChild(createEl("div", "label", card.label));
    wrap.appendChild(createEl("div", "value", String(card.value)));
    if (card.sub) {
      wrap.appendChild(createEl("div", "sub", card.sub));
    }
    summaryEl.appendChild(wrap);
  });
};

const renderAttributes = (data) => {
  attrBody.innerHTML = "";
  const attrs = data.ata_smart_attributes?.table || [];

  if (!attrs.length) {
    const row = createEl("tr");
    const cell = createEl("td", null, "No SMART attributes found.");
    cell.colSpan = 5;
    row.appendChild(cell);
    attrBody.appendChild(row);
    attrMeta.textContent = "";
    return;
  }

  attrMeta.textContent = `${attrs.length} attributes`;

  const flagLabels = [
    { key: "prefailure", label: "P", title: "Prefailure warning" },
    { key: "updated_online", label: "O", title: "Updated online" },
    { key: "performance", label: "S", title: "Speed/performance" },
    { key: "error_rate", label: "R", title: "Error rate" },
    { key: "event_count", label: "C", title: "Event count" },
    { key: "auto_keep", label: "K", title: "Auto-keep" },
  ];

  attrs.forEach((attr) => {
    const row = createEl("tr");

    const idCell = createEl("td", "mono", attr.id);
    row.appendChild(idCell);

    const nameCell = createEl("td");
    nameCell.appendChild(createEl("div", "attr-name", attr.name || "Unknown"));
    row.appendChild(nameCell);

    const valueCell = createEl("td");
    valueCell.appendChild(createEl("div", "value-chip", String(attr.value ?? "-")));
    row.appendChild(valueCell);

    const worstCell = createEl("td");
    worstCell.appendChild(createEl("div", "value-chip secondary", String(attr.worst ?? "-")));
    row.appendChild(worstCell);

    const rawCell = createEl("td", "mono", attr.raw?.string ?? attr.raw?.value ?? "-");
    row.appendChild(rawCell);

    const flagsCell = createEl("td");
    const flagSet = createEl("div", "flag-set");
    flagLabels.forEach((flag) => {
      if (attr.flags?.[flag.key]) {
        const pill = createEl("span", "pill", flag.label);
        pill.title = flag.title;
        flagSet.appendChild(pill);
      }
    });
    if (!flagSet.childElementCount) {
      flagSet.appendChild(createEl("span", "hint", "-"));
    }
    flagsCell.appendChild(flagSet);
    row.appendChild(flagsCell);

    attrBody.appendChild(row);
  });
};

const renderVisualization = (data) => {
  const attrs = data.ata_smart_attributes?.table || [];
  renderSummary(data);
  renderAttributes(data);
};

const parseSmart = async () => {
  const sn = snInput.value.trim();
  const model = modelInput.value.trim();
  const fw = fwInput.value.trim();
  const raw = rawInput.value.replace(/\s+/g, "");

  updateRawCount();

  if (!raw) {
    setStatus("Raw SMART data is required.", true);
    setResultsVisible(false);
    return;
  }

  if (/[^0-9a-fA-F]/.test(raw)) {
    setStatus("Raw data must be hex only.", true);
    setResultsVisible(false);
    return;
  }

  if (raw.length !== RAW_HEX_LENGTH) {
    setStatus(`Raw data must be ${RAW_HEX_LENGTH} hex characters.`, true);
    setResultsVisible(false);
    return;
  }

  try {
    await ensureWasm();
    setStatus("Parsing SMART data...");

    const ptr = parseFn(sn, model, fw, raw);
    const jsonStr = wasmModule.UTF8ToString(ptr);
    freeFn(ptr);

    const data = JSON.parse(jsonStr);
    const formatted = JSON.stringify(data, null, 2);

    setOutput(formatted);
    renderVisualization(data);
    setResultsVisible(true);
    setStatus("Done");
  } catch (err) {
    setStatus("Parsing failed. Check console for details.", true);
    summaryEl.innerHTML = "";
    attrBody.innerHTML = "";
    setOutput("{}");
    setResultsVisible(false);
    console.error(err);
  }
};

const setThemeIcon = (theme) => {
  const icon = themeToggle.querySelector("i");
  if (!icon) {
    return;
  }
  icon.classList.toggle("fa-sun", theme === "dark");
  icon.classList.toggle("fa-moon", theme !== "dark");
};

const applyTheme = (theme) => {
  document.documentElement.setAttribute("data-theme", theme);
  setThemeIcon(theme);
};

const initTheme = () => {
  const saved = localStorage.getItem("theme");
  if (saved === "light" || saved === "dark") {
    applyTheme(saved);
    return;
  }
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(prefersDark ? "dark" : "light");

  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", (event) => {
    if (localStorage.getItem("theme")) {
      return;
    }
    applyTheme(event.matches ? "dark" : "light");
  });
};

const applyUrlParams = () => {
  const params = new URLSearchParams(window.location.search);
  const sn = params.get("sn");
  const model = params.get("md");
  const fw = params.get("fw");
  const raw = params.get("rd");

  if (sn) {
    snInput.value = sn;
  }
  if (model) {
    modelInput.value = model;
  }
  if (fw) {
    fwInput.value = fw;
  }
  if (raw) {
    rawInput.value = raw;
  }
  return Boolean(raw);
};

form.addEventListener("submit", (event) => {
  event.preventDefault();
  parseSmart();
});

rawInput.addEventListener("input", updateRawCount);

const copyJson = async () => {
  try {
    await navigator.clipboard.writeText(outputEl.textContent);
    setStatus("JSON copied to clipboard.");
  } catch (err) {
    setStatus("Copy failed. Check clipboard permissions.", true);
  }
};

jsonCopy.addEventListener("click", copyJson);

jsonToggle.addEventListener("click", () => {
  const outputSection = jsonToggle.closest(".output");
  if (!outputSection) {
    return;
  }
  const isCollapsed = outputSection.classList.toggle("is-collapsed");
  jsonToggle.setAttribute("aria-expanded", String(!isCollapsed));
  jsonToggle.setAttribute("aria-label", isCollapsed ? "Unfold JSON" : "Fold JSON");
  const icon = jsonToggle.querySelector("i");
  if (icon) {
    icon.classList.toggle("fa-chevron-down", isCollapsed);
    icon.classList.toggle("fa-chevron-up", !isCollapsed);
  }
});

themeToggle.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme") || "light";
  const next = current === "dark" ? "light" : "dark";
  localStorage.setItem("theme", next);
  applyTheme(next);
});

initTheme();
const hasRawParam = applyUrlParams();
updateRawCount();
setResultsVisible(false);

if (hasRawParam) {
  parseSmart();
}
