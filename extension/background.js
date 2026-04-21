import { appendScan, getStatus } from "./services/google.js";

const BACKEND_URL = "http://localhost:8000";
const FRONTEND_URL = "http://localhost:3000";

function enableSidePanelOnActionClick() {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}
chrome.runtime.onInstalled.addListener(enableSidePanelOnActionClick);
enableSidePanelOnActionClick();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "EXTRACT_IN_TAB") {
    const tabId = message.tabId;
    if (!tabId) {
      sendResponse({ error: "No tab" });
      return true;
    }
    chrome.scripting.executeScript(
      { target: { tabId }, func: extractInPage },
      (results) => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: chrome.runtime.lastError.message });
          return;
        }
        const payload = results?.[0]?.result;
        if (!payload?.jobTitle) {
          sendResponse({ error: "Could not extract job data from this page." });
          return;
        }
        sendResponse({ payload });
      }
    );
    return true;
  }
  if (message.type !== "SCAN") return;
  const payload = message.payload;
  if (!payload || !payload.jobTitle) {
    sendResponse({ error: "Missing job data" });
    return;
  }
  (async () => {
    try {
      const { backendUrl, apiToken } = await chrome.storage.sync.get(["backendUrl", "apiToken"]);
      const backend = backendUrl || BACKEND_URL;
      const headers = { "Content-Type": "application/json" };
      if (apiToken) headers["X-API-Token"] = apiToken;
      const res = await fetch(`${backend}/scan`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        sendResponse({ error: `Backend error: ${res.status} ${text}` });
        return;
      }
      const data = await res.json();
      const scanId = data.scanId;
      let loggedToSheet = false;
      try {
        const status = await getStatus();
        if (status.connected && status.autoLog && data.result) {
          await appendScan(data.result);
          loggedToSheet = true;
        }
      } catch (e) {
        console.warn("JobGuard: Sheets log failed:", e);
      }
      sendResponse({ ok: true, scanId, loggedToSheet });
    } catch (e) {
      sendResponse({ error: String(e.message || e) });
    }
  })();
  return true;
});

function extractInPage() {
  function getText(el) {
    return el ? (el.textContent || "").trim() : "";
  }
  const u = window.location.href;
  if (u.includes("indeed.com")) {
    const titleEl = document.querySelector("[data-testid='jobsearch-JobInfoHeader-title']") || document.querySelector(".jobsearch-JobInfoHeader-title") || document.querySelector("h1");
    const companyEl = document.querySelector("[data-testid='inlineHeader-companyName']") || document.querySelector(".jobsearch-InlineCompanyRating-companyHeader a") || document.querySelector(".jobsearch-CompanyInfoContainer a");
    const locationEl = document.querySelector("[data-testid='job-location']") || document.querySelector(".jobsearch-JobInfoHeader-subtitle div");
    const descEl = document.querySelector("#jobDescriptionText") || document.querySelector(".jobsearch-JobComponent-description") || document.querySelector("[data-testid='job-description']");
    const description = getText(descEl);
    const bodyText = description;
    return {
      jobTitle: getText(titleEl) || "Unknown title",
      companyName: getText(companyEl) || "Unknown company",
      platform: "Indeed",
      pageUrl: u,
      location: getText(locationEl) || "",
      employmentType: getText(document.querySelector("[data-testid='attributes-layout']")) || "",
      postedDate: getText(document.querySelector("[data-testid='job-date']")) || "",
      applicantCount: getText(document.querySelector(".jobsearch-JobMetadataFooter-item")) || "",
      salaryMentioned: /\$|salary|compensation|pay range|k\/yr|per year/i.test(bodyText),
      responsibilitiesPresent: /responsibilities|duties|what you'll do/i.test(bodyText),
      requirementsPresent: /requirements|qualifications|must have|experience/i.test(bodyText),
      benefitsPresent: /benefits|health|401|vacation|remote/i.test(bodyText),
      contactInfo: (bodyText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/) || [])[0] || null,
      recruiterVisible: null,
      descriptionLength: bodyText.length,
      description: bodyText.slice(0, 50000),
    };
  }
  if (u.includes("linkedin.com/jobs")) {
    const titleEl = document.querySelector(".job-details-jobs-unified-top-card__job-title") || document.querySelector(".job-details-jobs-unified-top-card h1") || document.querySelector(".scaffold-layout__main h1") || document.querySelector("h1");
    const companyEl = document.querySelector(".job-details-jobs-unified-top-card__company-name") || document.querySelector(".job-details-jobs-unified-top-card__primary-description a") || document.querySelector(".job-details-jobs-unified-top-card a[href*='/company/']");
    const locationEl = document.querySelector(".job-details-jobs-unified-top-card__bullet") || document.querySelector(".job-details-jobs-unified-top-card__primary-description-without-tagline") || document.querySelector(".job-details-jobs-unified-top-card__bullet-item");
    const descEl = document.querySelector(".jobs-description-content__content") || document.querySelector(".jobs-box__html-content") || document.querySelector(".jobs-description__content") || document.querySelector(".jobs-details__main-content") || document.querySelector(".jobs-description");
    const description = getText(descEl);
    const bodyText = description;
    const recruiterEl = document.querySelector(".job-details-jobs-unified-top-card__poster-name");
    return {
      jobTitle: getText(titleEl) || "Unknown title",
      companyName: getText(companyEl) || "Unknown company",
      platform: "LinkedIn",
      pageUrl: u,
      location: getText(locationEl) || "",
      employmentType: "",
      postedDate: getText(document.querySelector(".job-details-jobs-unified-top-card__posted-date")) || "",
      applicantCount: getText(document.querySelector(".job-details-jobs-unified-top-card__applicant-count")) || "",
      salaryMentioned: /\$|salary|compensation|pay range|k\/yr|per year/i.test(bodyText),
      responsibilitiesPresent: /responsibilities|duties|what you'll do/i.test(bodyText),
      requirementsPresent: /requirements|qualifications|must have|experience/i.test(bodyText),
      benefitsPresent: /benefits|health|401|vacation|remote/i.test(bodyText),
      contactInfo: (bodyText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/) || [])[0] || null,
      recruiterVisible: getText(recruiterEl) || null,
      descriptionLength: bodyText.length,
      description: bodyText.slice(0, 50000),
    };
  }
  return null;
}
