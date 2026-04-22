const SHEETS_API = "https://sheets.googleapis.com/v4";
const SHEET_TAB = "Scans";
const DEFAULT_SPREADSHEET_TITLE = "JobGuard Scans";
const HEADER_ROW = [
  "Scanned At",
  "Job Title",
  "Company",
  "URL",
  "Platform",
  "Trust Score",
  "Risk Level",
  "Primary Warning",
  "Applied At",
  "Email Alias",
  "Notes",
];

function getAuthToken({ interactive }) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(new Error(chrome.runtime.lastError?.message || "No token"));
        return;
      }
      resolve(token);
    });
  });
}

function removeCachedToken(token) {
  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token }, resolve);
  });
}

async function authedFetch(url, options = {}, { retried = false } = {}) {
  const token = await getAuthToken({ interactive: false }).catch(() =>
    getAuthToken({ interactive: true })
  );
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401 && !retried) {
    await removeCachedToken(token);
    return authedFetch(url, options, { retried: true });
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google API ${res.status}: ${text}`);
  }
  return res;
}

async function createSpreadsheet() {
  const res = await authedFetch(`${SHEETS_API}/spreadsheets`, {
    method: "POST",
    body: JSON.stringify({
      properties: { title: DEFAULT_SPREADSHEET_TITLE },
      sheets: [{ properties: { title: SHEET_TAB } }],
    }),
  });
  const data = await res.json();
  const spreadsheetId = data.spreadsheetId;
  const spreadsheetUrl = data.spreadsheetUrl;
  await authedFetch(
    `${SHEETS_API}/spreadsheets/${spreadsheetId}/values/${SHEET_TAB}!A1:append?valueInputOption=RAW`,
    { method: "POST", body: JSON.stringify({ values: [HEADER_ROW] }) }
  );
  await chrome.storage.sync.set({ spreadsheetId, spreadsheetUrl });
  return { spreadsheetId, spreadsheetUrl };
}

export async function ensureSheet() {
  const stored = await chrome.storage.sync.get(["spreadsheetId", "spreadsheetUrl"]);
  if (stored.spreadsheetId) {
    return { spreadsheetId: stored.spreadsheetId, spreadsheetUrl: stored.spreadsheetUrl };
  }
  return createSpreadsheet();
}

export async function connect() {
  await getAuthToken({ interactive: true });
  const sheet = await ensureSheet();
  const existing = await chrome.storage.sync.get(["autoLog"]);
  if (existing.autoLog === undefined) {
    await chrome.storage.sync.set({ autoLog: true });
  }
  return sheet;
}

export async function disconnect() {
  try {
    const token = await getAuthToken({ interactive: false }).catch(() => null);
    if (token) {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
        method: "POST",
      }).catch(() => {});
      await removeCachedToken(token);
    }
  } finally {
    await chrome.storage.sync.remove(["spreadsheetId", "spreadsheetUrl"]);
  }
}

export async function getStatus() {
  const token = await getAuthToken({ interactive: false }).catch(() => null);
  const { spreadsheetId, spreadsheetUrl, autoLog } = await chrome.storage.sync.get([
    "spreadsheetId",
    "spreadsheetUrl",
    "autoLog",
  ]);
  return {
    connected: Boolean(token && spreadsheetId),
    spreadsheetId: spreadsheetId || null,
    spreadsheetUrl: spreadsheetUrl || null,
    autoLog: autoLog !== false,
  };
}

export async function setAutoLog(value) {
  await chrome.storage.sync.set({ autoLog: Boolean(value) });
}

export async function appendScan(result) {
  const { spreadsheetId } = await ensureSheet();
  const snapshot = result.snapshot || {};
  const row = [
    new Date(result.timestamp || Date.now()).toISOString(),
    snapshot.jobTitle || "",
    snapshot.companyName || "",
    snapshot.pageUrl || "",
    snapshot.platform || "",
    result.trustScore ?? "",
    result.riskLevel || "",
    result.primaryWarning || "",
    result.appliedAt || "",
    result.emailAlias || "",
    "",
  ];
  await authedFetch(
    `${SHEETS_API}/spreadsheets/${spreadsheetId}/values/${SHEET_TAB}!A:K:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ values: [row] }) }
  );
}

export async function markApplied(pageUrl) {
  const { spreadsheetId } = await chrome.storage.sync.get(["spreadsheetId"]);
  if (!spreadsheetId || !pageUrl) return false;
  const res = await authedFetch(
    `${SHEETS_API}/spreadsheets/${spreadsheetId}/values/${SHEET_TAB}!D:D`
  );
  const data = await res.json();
  const rows = data.values || [];
  for (let i = rows.length - 1; i >= 1; i--) {
    if (rows[i][0] === pageUrl) {
      const rowNum = i + 1;
      await authedFetch(
        `${SHEETS_API}/spreadsheets/${spreadsheetId}/values/${SHEET_TAB}!I${rowNum}?valueInputOption=USER_ENTERED`,
        { method: "PUT", body: JSON.stringify({ values: [[new Date().toISOString()]] }) }
      );
      return true;
    }
  }
  return false;
}
