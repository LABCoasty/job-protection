import { connect, disconnect, getStatus, setAutoLog } from "../services/google.js";

const DEFAULT_FRONTEND_URL = "http://localhost:3000";

async function showReport(scanId) {
  const { frontendUrl, apiToken } = await chrome.storage.sync.get(["frontendUrl", "apiToken"]);
  const base = frontendUrl || DEFAULT_FRONTEND_URL;
  const params = new URLSearchParams({ scanId });
  if (apiToken) params.set("t", apiToken);
  const iframe = document.getElementById("report-frame");
  iframe.src = `${base}/?${params.toString()}`;
  document.body.classList.add("report");
}

// Bridge messages from the frontend iframe (Export screen, etc.) to chrome
// APIs that iframes can't call directly (chrome.identity, chrome.storage).
async function pushGoogleStatus() {
  const iframe = document.getElementById("report-frame");
  if (!iframe?.contentWindow) return;
  const s = await getStatus().catch(() => ({ connected: false }));
  iframe.contentWindow.postMessage(
    {
      type: "JOBGUARD_GOOGLE_STATUS",
      connected: s.connected,
      spreadsheetUrl: s.spreadsheetUrl,
      autoLog: s.autoLog,
    },
    "*"
  );
}

window.addEventListener("message", async (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;
  try {
    if (data.type === "JOBGUARD_GET_GOOGLE_STATUS") {
      await pushGoogleStatus();
    } else if (data.type === "JOBGUARD_CONNECT_GOOGLE") {
      await connect();
      await pushGoogleStatus();
    } else if (data.type === "JOBGUARD_DISCONNECT_GOOGLE") {
      await disconnect();
      await pushGoogleStatus();
    } else if (data.type === "JOBGUARD_SET_AUTOLOG") {
      await setAutoLog(Boolean(data.value));
      await pushGoogleStatus();
    }
  } catch (e) {
    console.warn("JobGuard bridge error:", e);
  }
});

function showScan() {
  document.getElementById("report-frame").src = "";
  document.body.classList.remove("report");
}

document.getElementById("scan-another").addEventListener("click", showScan);
document.getElementById("open-options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById("scan").addEventListener("click", async () => {
  const btn = document.getElementById("scan");
  const status = document.getElementById("status");
  btn.disabled = true;
  status.textContent = "Extracting job data…";
  status.classList.remove("error");

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    status.textContent = "No active tab.";
    status.classList.add("error");
    btn.disabled = false;
    return;
  }

  const hasContent = (p) =>
    p && (
      (p.jobTitle && p.jobTitle.length > 0) ||
      (p.description && p.description.length > 200)
    );

  let payload = null;
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action: "EXTRACT_AND_SCAN" });
    if (hasContent(response?.payload)) payload = response.payload;
    else if (response?.error) status.textContent = response.error;
  } catch (_) {
    try {
      const fallback = await chrome.runtime.sendMessage({ type: "EXTRACT_IN_TAB", tabId: tab.id });
      if (hasContent(fallback?.payload)) payload = fallback.payload;
      else if (fallback?.error) status.textContent = fallback.error;
    } catch (e) {
      status.textContent = "Could not read this page. Open a LinkedIn or Indeed job and try again.";
      status.classList.add("error");
      btn.disabled = false;
      return;
    }
  }

  if (!payload) {
    status.textContent = status.textContent || "Could not extract job data. Open a LinkedIn or Indeed job page.";
    status.classList.add("error");
    btn.disabled = false;
    return;
  }
  // Provide sensible defaults for fields we expect to be non-empty server-side
  // so the LLM can still analyze. It'll extract the real values from description.
  if (!payload.jobTitle) payload.jobTitle = "Unknown (extract from description)";
  if (!payload.companyName) payload.companyName = "Unknown (extract from description)";

  status.textContent = "Analyzing…";
  try {
    const backResponse = await chrome.runtime.sendMessage({ type: "SCAN", payload });
    if (backResponse?.error) {
      status.textContent = backResponse.error;
      status.classList.add("error");
    } else {
      if (backResponse.loggedToSheet) {
        status.textContent = "Logged to Google Sheets";
        status.classList.add("success");
      }
      await showReport(backResponse.scanId);
    }
  } catch (e) {
    status.textContent = "Backend error. Is the server running?";
    status.classList.add("error");
  }
  btn.disabled = false;
});
