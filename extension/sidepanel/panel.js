import { connect, disconnect, getStatus, setAutoLog, appendScan } from "../services/google.js";

const DEFAULT_FRONTEND_URL = "http://localhost:3000";
const DEFAULT_BACKEND_URL = "http://localhost:8000";

// --- Iframe bootstrap -----------------------------------------------------
// Load the frontend immediately so the user sees JobGuard's real home screen
// (not a native side-panel stub). Everything — scan, auto-fill, resume,
// sheets — is driven by postMessage between this panel and the iframe.

async function loadFrontend() {
  const { frontendUrl, apiToken } = await chrome.storage.sync.get(["frontendUrl", "apiToken"]);
  const base = (frontendUrl || DEFAULT_FRONTEND_URL).replace(/\/$/, "");
  const params = new URLSearchParams();
  if (apiToken) params.set("t", apiToken);
  const qs = params.toString();
  const iframe = document.getElementById("report-frame");
  iframe.src = qs ? `${base}/?${qs}` : `${base}/`;
}
loadFrontend();

function frameWindow() {
  return document.getElementById("report-frame")?.contentWindow || null;
}

function post(type, payload = {}) {
  frameWindow()?.postMessage({ type, ...payload }, "*");
}

// --- Extraction + scan orchestration --------------------------------------

const hasContent = (p) =>
  p && ((p.jobTitle && p.jobTitle.length > 0) || (p.description && p.description.length > 200));

async function extractFromActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab.");
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action: "EXTRACT_AND_SCAN" });
    if (hasContent(response?.payload)) return response.payload;
    if (response?.error) throw new Error(response.error);
  } catch (_) {
    // content script not injected — fall back via background
    const fallback = await chrome.runtime.sendMessage({ type: "EXTRACT_IN_TAB", tabId: tab.id });
    if (hasContent(fallback?.payload)) return fallback.payload;
    if (fallback?.error) throw new Error(fallback.error);
  }
  throw new Error("Could not read this page. Open a LinkedIn or Indeed job and try again.");
}

async function runScan(requestId) {
  try {
    post("SCAN_PROGRESS", { requestId, step: "extract" });
    const payload = await extractFromActiveTab();
    if (!payload.jobTitle) payload.jobTitle = "Unknown (extract from description)";
    if (!payload.companyName) payload.companyName = "Unknown (extract from description)";
    post("SCAN_PROGRESS", { requestId, step: "analyze" });

    const { backendUrl, apiToken } = await chrome.storage.sync.get(["backendUrl", "apiToken"]);
    const { resumeText } = await chrome.storage.local.get(["resumeText"]);
    const backend = backendUrl || DEFAULT_BACKEND_URL;
    const headers = { "Content-Type": "application/json" };
    if (apiToken) headers["X-API-Token"] = apiToken;
    const body = { ...payload };
    if (resumeText) body.resumeText = resumeText;

    const res = await fetch(`${backend}/scan`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Backend ${res.status}: ${text}`);
    }
    const data = await res.json();
    const scanId = data.scanId;
    const result = data.result;

    let loggedToSheet = false;
    try {
      const status = await getStatus();
      if (status.connected && status.autoLog && result) {
        await appendScan(result);
        loggedToSheet = true;
      }
    } catch (e) {
      console.warn("JobGuard: Sheets log failed:", e);
    }

    post("SCAN_COMPLETE", { requestId, scanId, result, loggedToSheet });
  } catch (e) {
    post("SCAN_ERROR", { requestId, error: String(e.message || e) });
  }
}

// --- Google Sheets bridge -------------------------------------------------

async function pushGoogleStatus() {
  const s = await getStatus().catch(() => ({ connected: false }));
  post("JOBGUARD_GOOGLE_STATUS", {
    connected: s.connected,
    spreadsheetUrl: s.spreadsheetUrl,
    autoLog: s.autoLog,
  });
}

// --- Resume bridge --------------------------------------------------------

async function pushResumeData() {
  const { resumeText, resumeUpdatedAt, resumeParsed } = await chrome.storage.local.get([
    "resumeText",
    "resumeUpdatedAt",
    "resumeParsed",
  ]);
  post("JOBGUARD_RESUME_DATA", {
    text: resumeText || "",
    length: resumeText ? resumeText.length : 0,
    updatedAt: resumeUpdatedAt || null,
    parsed: resumeParsed || null,
  });
}

async function parseResumeOnBackend(text) {
  const { backendUrl, apiToken } = await chrome.storage.sync.get(["backendUrl", "apiToken"]);
  const backend = backendUrl || DEFAULT_BACKEND_URL;
  const headers = { "Content-Type": "application/json" };
  if (apiToken) headers["X-API-Token"] = apiToken;
  const res = await fetch(`${backend}/parse-resume`, {
    method: "POST",
    headers,
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`parse-resume failed: ${res.status}`);
  const data = await res.json();
  return data.parsed || null;
}

// --- Auto-fill ------------------------------------------------------------

async function runAutofill(requestId) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("No active tab.");
    const { resumeParsed } = await chrome.storage.local.get(["resumeParsed"]);
    if (!resumeParsed) {
      throw new Error("No parsed resume yet. Open the Resume tab and click Parse first.");
    }
    const res = await chrome.tabs.sendMessage(tab.id, { action: "AUTOFILL_FORM" }).catch((e) => ({
      ok: false,
      error:
        "Auto-fill isn't available on this page. Open an apply form on LinkedIn, Greenhouse, Lever, Workday, Workable, Ashby, SmartRecruiters, BambooHR, iCIMS, or Taleo.",
      detail: e?.message,
    }));
    if (!res?.ok) {
      throw new Error(res?.error || "Auto-fill failed.");
    }
    post("AUTOFILL_COMPLETE", {
      requestId,
      filled: res.filled || 0,
      missing: res.missing || [],
    });
  } catch (e) {
    post("AUTOFILL_ERROR", { requestId, error: String(e.message || e) });
  }
}

// --- Message router -------------------------------------------------------

window.addEventListener("message", async (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;
  try {
    switch (data.type) {
      case "SCAN_REQUEST":
        runScan(data.requestId || null);
        break;
      case "AUTOFILL_REQUEST":
        runAutofill(data.requestId || null);
        break;
      case "JOBGUARD_GET_GOOGLE_STATUS":
        await pushGoogleStatus();
        break;
      case "JOBGUARD_CONNECT_GOOGLE":
        try {
          await connect();
          await pushGoogleStatus();
        } catch (err) {
          console.warn("Direct connect failed, opening options page:", err);
          chrome.runtime.openOptionsPage();
        }
        break;
      case "JOBGUARD_DISCONNECT_GOOGLE":
        await disconnect();
        await pushGoogleStatus();
        break;
      case "JOBGUARD_SET_AUTOLOG":
        await setAutoLog(Boolean(data.value));
        await pushGoogleStatus();
        break;
      case "JOBGUARD_GET_RESUME":
        await pushResumeData();
        break;
      case "JOBGUARD_SAVE_RESUME": {
        const text = (data.text || "").toString().slice(0, 40000);
        await chrome.storage.local.set({
          resumeText: text,
          resumeUpdatedAt: new Date().toISOString(),
        });
        await pushResumeData();
        break;
      }
      case "JOBGUARD_CLEAR_RESUME":
        await chrome.storage.local.remove(["resumeText", "resumeUpdatedAt", "resumeParsed"]);
        await pushResumeData();
        break;
      case "JOBGUARD_PARSE_RESUME": {
        let parsed = null;
        try {
          parsed = await parseResumeOnBackend((data.text || "").toString());
        } catch (e) {
          console.warn("parse-resume error:", e);
        }
        if (parsed) {
          await chrome.storage.local.set({ resumeParsed: parsed });
        }
        post("JOBGUARD_RESUME_PARSED", { parsed });
        await pushResumeData();
        break;
      }
    }
  } catch (e) {
    console.warn("JobGuard bridge error:", e);
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && ("spreadsheetId" in changes || "autoLog" in changes)) {
    pushGoogleStatus();
  }
  if (area === "local" && ("resumeText" in changes || "resumeParsed" in changes || "resumeUpdatedAt" in changes)) {
    pushResumeData();
  }
});
