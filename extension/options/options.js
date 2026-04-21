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

refreshStatus();
loadBackend();
loadFrontend();
