(function () {
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

  // Known containers for the RIGHT-hand detail pane, in preference order.
  // We pick the first one that is visible AND contains a top-card element —
  // that way we never accidentally return a container that only holds the
  // left-hand job LIST (which also has its own ancestors on search pages).
  const DETAIL_PANE_SELECTORS = [
    ".jobs-search__job-details--wrapper",
    ".jobs-search__job-details--container",
    ".jobs-search-two-pane__detail-view",
    ".jobs-search__job-details",
    ".scaffold-layout__detail",
    ".jobs-details__main-content",
    ".job-view-layout",
    ".jobs-details",
  ];

  const TOP_CARD_SELECTORS = [
    ".job-details-jobs-unified-top-card",
    ".jobs-unified-top-card",
    ".jobs-details-top-card",
    ".top-card-layout",
  ];

  function isVisible(el) {
    if (!el) return false;
    if (!el.offsetParent && el !== document.body) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function containsTopCard(root) {
    if (!root) return false;
    for (const sel of TOP_CARD_SELECTORS) {
      const card = root.querySelector(sel);
      if (card && isVisible(card)) return true;
    }
    return false;
  }

  function detailPane() {
    // Strategy 1: walk the preference list and return the first visible
    // container that actually HAS a rendered top-card inside.
    for (const sel of DETAIL_PANE_SELECTORS) {
      const candidates = Array.from(document.querySelectorAll(sel));
      for (const c of candidates) {
        if (isVisible(c) && containsTopCard(c)) return c;
      }
    }

    // Strategy 2: anchor on a visible top-card and walk up to its nearest
    // known detail-pane ancestor.
    for (const sel of TOP_CARD_SELECTORS) {
      const card = document.querySelector(sel);
      if (card && isVisible(card)) {
        const container =
          card.closest(DETAIL_PANE_SELECTORS.join(", ")) || card.parentElement;
        if (container) return container;
      }
    }

    // Last resort: a known layout without a top-card (loading state).
    for (const sel of DETAIL_PANE_SELECTORS) {
      const c = document.querySelector(sel);
      if (c && isVisible(c)) return c;
    }
    return null;
  }

  function mainArea() {
    // Prefer the detail pane. Fall back to main only if no detail pane exists.
    return (
      detailPane() ||
      document.querySelector(".scaffold-layout__main") ||
      document.querySelector("[role='main']") ||
      document.querySelector("main") ||
      document.body
    );
  }

  function extractLinkedIn() {
    const main = mainArea();
    // Title: STRICTLY within the detail pane. Never fall back to document.title
    // or a document-wide h1 — on /jobs/search and /jobs/collections the page
    // title is the search query (e.g. "software engineer internship jobs"),
    // not the selected listing.
    const titleSelectors = [
      ".job-details-jobs-unified-top-card__job-title h1",
      ".job-details-jobs-unified-top-card__job-title",
      ".jobs-unified-top-card__job-title",
      ".top-card-layout__title",
      ".jobs-details-top-card__job-title",
      "[data-tracking-control-name='jobs_show_poster_modal_job_title']",
      ".job-details-jobs-unified-top-card h1",
      "h1.t-24",
      "h1.t-bold",
      "h1",
    ];
    const titleEl = firstMatch(titleSelectors, main);
    const jobTitleRaw = getText(titleEl);
    // Reject titles that clearly look like search / navigation headers.
    const sectionHeaderRe =
      /^(top job picks|recommended for you|saved jobs|applied jobs|my jobs|jobs home|job search|jobs)\b/i;
    // Reject titles that look like a search query (multiple lowercase words
    // followed by "jobs" / "internships" / "roles").
    const searchQueryRe = /\b(jobs|internships?|roles?|positions?|careers?)\s*$/i;
    const jobTitle =
      jobTitleRaw &&
      !sectionHeaderRe.test(jobTitleRaw) &&
      !searchQueryRe.test(jobTitleRaw.toLowerCase().trim())
        ? jobTitleRaw
        : "";

    // Company: scope to detail pane first so we don't grab a company from the list card.
    const companySelectors = [
      ".job-details-jobs-unified-top-card__company-name",
      ".job-details-jobs-unified-top-card__company-name a",
      "[data-tracking-control-name='jobs_show_poster_modal_company_name']",
      ".jobs-unified-top-card__company-name",
      ".topcard__org-name-link",
      ".jobs-details-top-card__company-url",
      "a[href*='/company/']",
    ];
    // STRICTLY scope to detail pane — never look document-wide, which would
    // pick up the first "/company/…" link from the left-hand job list.
    let companyEl = firstMatch(companySelectors, main);
    if (!companyEl && main) {
      companyEl = main.querySelector("a[href*='/company/']");
    }
    const companyName = getText(companyEl) || "";

    // Always dump the detail pane's full text so the LLM sees every detail
    // regardless of LinkedIn's current DOM class names. 20KB is plenty for a
    // single listing and fits the backend's prompt budget.
    const description = main
      ? (main.innerText || "").trim().replace(/\s+/g, " ").slice(0, 20000)
      : "";
    const bodyText = description;

    // Location, posted, applicants — look near the title card
    const topCard = document.querySelector(".job-details-jobs-unified-top-card") || main;
    const topCardText = topCard ? (topCard.innerText || "").trim() : "";

    const location =
      getText(firstMatch([
        ".job-details-jobs-unified-top-card__bullet",
        ".job-details-jobs-unified-top-card__primary-description-without-tagline",
        ".job-details-jobs-unified-top-card__primary-description div",
        ".topcard__flavor--bullet",
      ])) ||
      (topCardText.match(/\b([A-Z][a-zA-Z .'-]+,\s*(?:[A-Z]{2}|[A-Z][a-z]+)(?:,\s*[A-Z][a-z]+)?)\b/) || [])[1] ||
      "";

    const postedDate =
      getText(firstMatch([
        ".job-details-jobs-unified-top-card__posted-date",
        ".posted-time-ago__text",
      ])) ||
      (topCardText.match(/(Reposted[^·\n]*|Posted\s+[^·\n]*|\d+\s+(?:hours?|days?|weeks?|months?)\s+ago)/i) || [])[1] ||
      "";

    const applicantCount =
      getText(firstMatch([
        ".job-details-jobs-unified-top-card__applicant-count",
        ".num-applicants__caption",
      ])) ||
      (topCardText.match(/(\d[\d,]*\+?\s*(?:applicants?|people\s+clicked\s+apply))/i) || [])[1] ||
      "";

    // Employment type + salary pills
    const pillsText = topCardText;
    const employmentType =
      (pillsText.match(/\b(Full[- ]time|Part[- ]time|Contract|Temporary|Internship)\b/i) || [])[1] || "";
    const salaryTopCard = /\$\s?\d|\bper\s+(year|hour)\b|\bk\/yr\b|\$\d+[\d,]*(?:\s*[-–]\s*\$\d+[\d,]*)?/i.test(pillsText);

    const salaryMentioned = salaryTopCard || /\$|salary|compensation|pay range|k\/yr|per year/i.test(bodyText);
    const hasResponsibilities = /responsibilities|duties|what you'?ll do|your role/i.test(bodyText);
    const hasRequirements = /requirements|qualifications|must[- ]have|experience|what you'?ll bring|you\s+have/i.test(bodyText);
    const hasBenefits = /benefits|health|401\(?k\)?|vacation|remote|insurance|paid time off/i.test(bodyText);

    const emailMatch = bodyText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const contactInfo = emailMatch ? emailMatch[0] : null;

    const recruiterEl = firstMatch([
      ".job-details-jobs-unified-top-card__poster-name",
      "[data-tracking-control-name='jobs_show_poster_modal_poster_name']",
      ".hirer-card__hirer-information a",
    ]);
    const recruiterVisible = getText(recruiterEl) || null;

    return {
      jobTitle,
      companyName,
      platform: "LinkedIn",
      pageUrl: window.location.href,
      location,
      employmentType,
      postedDate,
      applicantCount,
      salaryMentioned,
      responsibilitiesPresent: hasResponsibilities,
      requirementsPresent: hasRequirements,
      benefitsPresent: hasBenefits,
      contactInfo,
      recruiterVisible,
      descriptionLength: bodyText.length,
      description: bodyText.slice(0, 50000),
    };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action !== "EXTRACT_AND_SCAN") return;
    try {
      const payload = extractLinkedIn();
      // Console breadcrumb so we can diagnose mis-extraction without mining
      // the DOM live. Shows up in the LinkedIn tab's DevTools console.
      try {
        console.log("[JobGuard] extracted", {
          jobTitle: payload.jobTitle,
          companyName: payload.companyName,
          descriptionPreview: (payload.description || "").slice(0, 140),
          descriptionLength: payload.descriptionLength,
          url: payload.pageUrl,
        });
      } catch {}
      sendResponse({ payload });
    } catch (e) {
      sendResponse({ error: String(e.message || e) });
    }
    return true;
  });
})();
