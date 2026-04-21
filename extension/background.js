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
    return el ? (el.textContent || "").trim().replace(/\s+/g, " ") : "";
  }
  function firstMatch(selectors, root) {
    const scope = root || document;
    for (const sel of selectors) {
      const el = scope.querySelector(sel);
      if (el && (el.textContent || "").trim()) return el;
    }
    return null;
  }
  function detailPane() {
    return (
      document.querySelector(".jobs-details__main-content") ||
      document.querySelector(".job-view-layout") ||
      document.querySelector(".jobs-search__job-details--wrapper") ||
      document.querySelector(".jobs-search__job-details--container") ||
      document.querySelector(".jobs-search__job-details") ||
      document.querySelector(".scaffold-layout__detail") ||
      null
    );
  }
  function mainArea() {
    return (
      detailPane() ||
      document.querySelector(".scaffold-layout__main") ||
      document.querySelector("[role='main']") ||
      document.querySelector("main") ||
      document.body
    );
  }

  const u = window.location.href;
  const isLinkedIn = u.includes("linkedin.com");
  const isIndeed = u.includes("indeed.com");
  if (!isLinkedIn && !isIndeed) return null;

  const main = mainArea();

  const liTitleSel = [
    ".job-details-jobs-unified-top-card__job-title h1",
    ".job-details-jobs-unified-top-card__job-title",
    ".jobs-unified-top-card__job-title",
    ".top-card-layout__title",
    "h1.t-24",
    "h1",
  ];
  const idTitleSel = [
    "[data-testid='jobsearch-JobInfoHeader-title']",
    ".jobsearch-JobInfoHeader-title",
    "h1",
  ];
  const titleEl = isLinkedIn
    ? firstMatch(liTitleSel, main) || firstMatch(liTitleSel)
    : firstMatch(idTitleSel, main) || firstMatch(idTitleSel);

  const jobTitleRaw = getText(titleEl);
  const docTitleClean = (document.title || "")
    .replace(/^\(\d+\)\s*/, "")
    .replace(/\s+[|·]\s+(LinkedIn|Indeed).*$/i, "")
    .trim();
  const sectionHeaderRe = /^(top job picks|recommended for you|saved jobs|applied jobs|my jobs|jobs home|job search|jobs)\b/i;
  const titleCandidates = [jobTitleRaw, docTitleClean].filter(
    (t) => t && !sectionHeaderRe.test(t)
  );
  const jobTitle = titleCandidates[0] || "";

  const liCompanySel = [
    ".job-details-jobs-unified-top-card__company-name",
    ".job-details-jobs-unified-top-card__company-name a",
    ".jobs-unified-top-card__company-name",
    ".topcard__org-name-link",
    "a[href*='/company/']",
  ];
  const idCompanySel = [
    "[data-testid='inlineHeader-companyName']",
    ".jobsearch-InlineCompanyRating-companyHeader a",
    ".jobsearch-CompanyInfoContainer a",
  ];
  let companyEl = isLinkedIn
    ? firstMatch(liCompanySel, main) || firstMatch(liCompanySel)
    : firstMatch(idCompanySel, main) || firstMatch(idCompanySel);
  if (!companyEl && main && isLinkedIn) {
    companyEl = main.querySelector("a[href*='/company/']");
  }
  const companyName = getText(companyEl) || "";

  // Always capture the detail pane's full text so the LLM sees everything,
  // regardless of which LinkedIn/Indeed DOM class names are in play today.
  const description = main
    ? (main.innerText || "").trim().replace(/\s+/g, " ").slice(0, 20000)
    : "";
  const bodyText = description;

  const topCard =
    (isLinkedIn && document.querySelector(".job-details-jobs-unified-top-card")) ||
    main ||
    document.body;
  const topCardText = topCard ? (topCard.innerText || "").trim() : "";

  const location =
    getText(
      firstMatch(
        isLinkedIn
          ? [
              ".job-details-jobs-unified-top-card__bullet",
              ".job-details-jobs-unified-top-card__primary-description-without-tagline",
              ".topcard__flavor--bullet",
            ]
          : [
              "[data-testid='job-location']",
              ".jobsearch-JobInfoHeader-subtitle div",
            ]
      )
    ) ||
    (topCardText.match(/\b([A-Z][a-zA-Z .'-]+,\s*(?:[A-Z]{2}|[A-Z][a-z]+))\b/) || [])[1] ||
    "";

  const postedDate =
    getText(
      firstMatch([
        ".job-details-jobs-unified-top-card__posted-date",
        ".posted-time-ago__text",
        "[data-testid='job-date']",
      ])
    ) ||
    (topCardText.match(/(Reposted[^·\n]*|Posted\s+[^·\n]*|\d+\s+(?:hours?|days?|weeks?|months?)\s+ago)/i) || [])[1] ||
    "";

  const applicantCount =
    getText(
      firstMatch([
        ".job-details-jobs-unified-top-card__applicant-count",
        ".num-applicants__caption",
        ".jobsearch-JobMetadataFooter-item",
      ])
    ) ||
    (topCardText.match(/(\d[\d,]*\+?\s*(?:applicants?|people\s+clicked\s+apply))/i) || [])[1] ||
    "";

  const employmentType =
    (topCardText.match(/\b(Full[- ]time|Part[- ]time|Contract|Temporary|Internship)\b/i) || [])[1] || "";

  const salaryMentioned =
    /\$\s?\d|\bper\s+(year|hour)\b|\bk\/yr\b/i.test(topCardText) ||
    /\$|salary|compensation|pay range|k\/yr|per year/i.test(bodyText);
  const hasResponsibilities = /responsibilities|duties|what you'?ll do|your role/i.test(bodyText);
  const hasRequirements = /requirements|qualifications|must[- ]have|experience|what you'?ll bring/i.test(bodyText);
  const hasBenefits = /benefits|health|401\(?k\)?|vacation|remote|insurance|paid time off/i.test(bodyText);

  const recruiterEl = isLinkedIn
    ? firstMatch([
        ".job-details-jobs-unified-top-card__poster-name",
        ".hirer-card__hirer-information a",
      ])
    : null;

  return {
    jobTitle,
    companyName,
    platform: isLinkedIn ? "LinkedIn" : "Indeed",
    pageUrl: u,
    location,
    employmentType,
    postedDate,
    applicantCount,
    salaryMentioned,
    responsibilitiesPresent: hasResponsibilities,
    requirementsPresent: hasRequirements,
    benefitsPresent: hasBenefits,
    contactInfo: (bodyText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/) || [])[0] || null,
    recruiterVisible: getText(recruiterEl) || null,
    descriptionLength: bodyText.length,
    description: bodyText.slice(0, 50000),
  };
}
