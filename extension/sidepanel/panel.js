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
  // Bust Chrome's iframe-level HTML cache so deploys take effect without a browser restart.
  // The fingerprinted JS chunks cache normally.
  params.set("v", String(Date.now()));
  const iframe = document.getElementById("report-frame");
  iframe.src = `${base}/?${params.toString()}`;
}
loadFrontend();

function frameWindow() {
  return document.getElementById("report-frame")?.contentWindow || null;
}

function post(type, payload = {}) {
  frameWindow()?.postMessage({ type, ...payload }, "*");
}

// --- Active-tab platform detection ----------------------------------------

function detectPlatformFromUrl(url) {
  if (!url) return null;
  if (url.includes("linkedin.com")) return "LinkedIn";
  if (url.includes("indeed.com")) return "Indeed";
  if (url.includes("greenhouse.io")) return "Greenhouse";
  if (url.includes("lever.co")) return "Lever";
  if (url.includes("myworkdayjobs.com")) return "Workday";
  if (url.includes("workable.com")) return "Workable";
  if (url.includes("ashbyhq.com")) return "Ashby";
  if (url.includes("smartrecruiters.com")) return "SmartRecruiters";
  if (url.includes("bamboohr.com")) return "BambooHR";
  if (url.includes("icims.com")) return "iCIMS";
  return null;
}

async function pushPlatform() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const platform = detectPlatformFromUrl(tab?.url);
    post("JOBGUARD_PLATFORM", { platform, url: tab?.url || "" });
  } catch {
    post("JOBGUARD_PLATFORM", { platform: null, url: "" });
  }
}

chrome.tabs.onActivated.addListener(() => pushPlatform());
chrome.tabs.onUpdated.addListener((_tabId, info) => {
  if (info.url || info.status === "complete") pushPlatform();
});

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

    // Only log on scan when the user explicitly disabled "log only applied".
    // Default behavior: don't log yet — wait for the user to hit Applied.
    let loggedToSheet = false;
    try {
      const { logOnlyAppliedEnabled } = await chrome.storage.sync.get(["logOnlyAppliedEnabled"]);
      const onlyApplied = logOnlyAppliedEnabled === undefined ? true : Boolean(logOnlyAppliedEnabled);
      if (!onlyApplied) {
        const status = await getStatus();
        if (status.connected && status.autoLog && result) {
          await appendScan(result);
          loggedToSheet = true;
        }
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
      platform: res.platform || null,
      filledFields: res.filledFields || [],
      emailAlias: res.emailAlias || null,
      emailUsed: res.emailUsed || null,
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
      case "JOBGUARD_GET_PLATFORM":
        await pushPlatform();
        break;
      case "JOBGUARD_OPEN_SETTINGS":
        chrome.runtime.openOptionsPage();
        break;
      case "JOBGUARD_GET_ONBOARDING_STATUS": {
        const { resumeText, onboardingDismissedAt } = await chrome.storage.local.get([
          "resumeText",
          "onboardingDismissedAt",
        ]);
        post("JOBGUARD_ONBOARDING_STATUS", {
          hasResume: Boolean(resumeText && resumeText.length > 100),
          dismissed: Boolean(onboardingDismissedAt),
        });
        break;
      }
      case "JOBGUARD_DISMISS_ONBOARDING":
        await chrome.storage.local.set({ onboardingDismissedAt: new Date().toISOString() });
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
      case "JOBGUARD_EXPORT_NOW":
        try {
          if (!data.result) throw new Error("No scan result to export.");
          await appendScan(data.result);
          post("JOBGUARD_EXPORT_RESULT", { ok: true });
        } catch (e) {
          post("JOBGUARD_EXPORT_RESULT", { ok: false, error: String(e.message || e) });
        }
        break;
      case "JOBGUARD_MARK_APPLIED":
        try {
          if (!data.result) throw new Error("No scan result to mark.");
          // Attach applied-at + tracking info so the row in the sheet has it.
          const enriched = {
            ...data.result,
            appliedAt: new Date().toISOString(),
            emailAlias: data.emailAlias || null,
          };
          await appendScan(enriched);
          post("JOBGUARD_APPLIED_RESULT", { ok: true, scanId: data.result.id });
        } catch (e) {
          post("JOBGUARD_APPLIED_RESULT", { ok: false, error: String(e.message || e) });
        }
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
