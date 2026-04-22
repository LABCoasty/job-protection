import { connect, disconnect, getStatus, setAutoLog } from "../services/google.js";

const el = (id) => document.getElementById(id);
const pill = el("sheets-pill");
const pillText = el("sheets-pill-text");
const info = el("sheets-info");
const btnConnect = el("btn-connect");
const btnDisconnect = el("btn-disconnect");
const rowAutolog = el("row-autolog");
const toggleAutolog = el("toggle-autolog");
const backendInput = el("backend-url");
const btnSaveBackend = el("btn-save-backend");
const frontendInput = el("frontend-url");
const btnSaveFrontend = el("btn-save-frontend");
const tokenInput = el("api-token");
const btnSaveToken = el("btn-save-token");
const resumeFileInput = el("resume-file");
const resumeTextarea = el("resume-text");
const resumeInfo = el("resume-info");
const btnSaveResume = el("btn-save-resume");
const btnClearResume = el("btn-clear-resume");
const toggleEmailAlias = el("toggle-email-alias");
const toggleLogOnlyApplied = el("toggle-log-only-applied");
const toast = el("toast");

function showToast(text, { error = false } = {}) {
  toast.textContent = text;
  toast.classList.toggle("error", error);
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2400);
}

async function refreshStatus() {
  const status = await getStatus();
  if (status.connected) {
    pill.className = "status-pill connected";
    pillText.textContent = "Connected";
    if (status.spreadsheetUrl) {
      info.innerHTML = `Logging to <a href="${status.spreadsheetUrl}" target="_blank" rel="noreferrer">your JobGuard Scans sheet</a>.`;
    } else {
      info.textContent = "Connected. Sheet will be created on next scan.";
    }
    btnConnect.style.display = "none";
    btnDisconnect.style.display = "inline-block";
    rowAutolog.style.display = "flex";
    toggleAutolog.checked = status.autoLog;
  } else {
    pill.className = "status-pill disconnected";
    pillText.textContent = "Not connected";
    info.textContent = "Connect to log every scan to your own Google Sheet.";
    btnConnect.style.display = "inline-block";
    btnDisconnect.style.display = "none";
    rowAutolog.style.display = "none";
  }
}

btnConnect.addEventListener("click", async () => {
  btnConnect.disabled = true;
  try {
    await connect();
    showToast("Connected to Google Sheets");
    await refreshStatus();
  } catch (e) {
    showToast(`Connect failed: ${e.message}`, { error: true });
  } finally {
    btnConnect.disabled = false;
  }
});

btnDisconnect.addEventListener("click", async () => {
  btnDisconnect.disabled = true;
  try {
    await disconnect();
    showToast("Disconnected");
    await refreshStatus();
  } catch (e) {
    showToast(`Disconnect failed: ${e.message}`, { error: true });
  } finally {
    btnDisconnect.disabled = false;
  }
});

toggleAutolog.addEventListener("change", async () => {
  await setAutoLog(toggleAutolog.checked);
  showToast(toggleAutolog.checked ? "Auto-log on" : "Auto-log off");
});

async function loadBackend() {
  const { backendUrl } = await chrome.storage.sync.get(["backendUrl"]);
  backendInput.value = backendUrl || "http://localhost:8000";
}

async function loadFrontend() {
  const { frontendUrl } = await chrome.storage.sync.get(["frontendUrl"]);
  frontendInput.value = frontendUrl || "http://localhost:3000";
}

async function loadToken() {
  const { apiToken } = await chrome.storage.sync.get(["apiToken"]);
  tokenInput.value = apiToken || "";
}

btnSaveBackend.addEventListener("click", async () => {
  const value = backendInput.value.trim() || "http://localhost:8000";
  await chrome.storage.sync.set({ backendUrl: value });
  showToast("Backend URL saved");
});

btnSaveFrontend.addEventListener("click", async () => {
  const value = frontendInput.value.trim() || "http://localhost:3000";
  await chrome.storage.sync.set({ frontendUrl: value });
  showToast("Frontend URL saved");
});

btnSaveToken.addEventListener("click", async () => {
  const value = tokenInput.value.trim();
  await chrome.storage.sync.set({ apiToken: value });
  showToast(value ? "Access token saved" : "Access token cleared");
});

// --- Resume handling ---
// chrome.storage.sync has 8KB per-item and 100KB total limits, so resumes
// (which can be long) live in chrome.storage.local instead.

async function loadResume() {
  const { resumeText, resumeUpdatedAt } = await chrome.storage.local.get([
    "resumeText",
    "resumeUpdatedAt",
  ]);
  resumeTextarea.value = resumeText || "";
  if (resumeText) {
    const chars = resumeText.length;
    const when = resumeUpdatedAt ? new Date(resumeUpdatedAt).toLocaleString() : "unknown time";
    resumeInfo.textContent = `Saved (${chars.toLocaleString()} chars, updated ${when}).`;
  } else {
    resumeInfo.textContent = "No resume saved yet.";
  }
}

resumeFileInput.addEventListener("change", async () => {
  const file = resumeFileInput.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    resumeTextarea.value = text;
    showToast(`Loaded ${file.name}. Click Save to store.`);
  } catch (e) {
    showToast(`Could not read file: ${e.message || e}`, { error: true });
  }
});

btnSaveResume.addEventListener("click", async () => {
  const text = (resumeTextarea.value || "").trim();
  if (!text) {
    showToast("Paste resume text or upload a .txt file first.", { error: true });
    return;
  }
  // Keep a reasonable ceiling — the prompt budget is already tight.
  const MAX = 40000;
  const clipped = text.length > MAX ? text.slice(0, MAX) : text;
  await chrome.storage.local.set({
    resumeText: clipped,
    resumeUpdatedAt: new Date().toISOString(),
  });
  await loadResume();
  showToast("Resume saved");
});

btnClearResume.addEventListener("click", async () => {
  await chrome.storage.local.remove(["resumeText", "resumeUpdatedAt"]);
  resumeTextarea.value = "";
  resumeFileInput.value = "";
  await loadResume();
  showToast("Resume cleared");
});

async function loadTrackingPrefs() {
  const { emailAliasEnabled, logOnlyAppliedEnabled } = await chrome.storage.sync.get([
    "emailAliasEnabled",
    "logOnlyAppliedEnabled",
  ]);
  toggleEmailAlias.checked = Boolean(emailAliasEnabled);
  // Default "log only applied" to ON so we don't spam sheets with un-applied scans.
  toggleLogOnlyApplied.checked = logOnlyAppliedEnabled === undefined ? true : Boolean(logOnlyAppliedEnabled);
}

toggleEmailAlias.addEventListener("change", async () => {
  await chrome.storage.sync.set({ emailAliasEnabled: toggleEmailAlias.checked });
  showToast(toggleEmailAlias.checked ? "Email alias on" : "Email alias off");
});

toggleLogOnlyApplied.addEventListener("change", async () => {
  await chrome.storage.sync.set({ logOnlyAppliedEnabled: toggleLogOnlyApplied.checked });
  showToast(
    toggleLogOnlyApplied.checked
      ? "Sheets log: only applied jobs"
      : "Sheets log: every scan"
  );
});

refreshStatus();
loadBackend();
loadFrontend();
loadToken();
loadResume();
loadTrackingPrefs();
