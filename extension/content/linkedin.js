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

  function detailPane() {
    // On /jobs/collections/... and /jobs/search/... the detail is in a right pane.
    // On /jobs/view/<id> the whole page is the detail. Try specific → generic.
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
    // Title: prefer matches inside the detail pane so we don't pick up
    // section headers like "Top job picks for you".
    const titleSelectors = [
      ".job-details-jobs-unified-top-card__job-title h1",
      ".job-details-jobs-unified-top-card__job-title",
      ".jobs-unified-top-card__job-title",
      ".top-card-layout__title",
      ".jobs-details-top-card__job-title",
      "[data-tracking-control-name='jobs_show_poster_modal_job_title']",
      ".job-details-jobs-unified-top-card h1",
      "h1.t-24",
      "h1",
    ];
    const titleEl = firstMatch(titleSelectors, main) || firstMatch(titleSelectors);
    const jobTitleRaw = getText(titleEl);
    // Strip LinkedIn's "(N) " unread prefix and " | LinkedIn" suffix, then reject
    // known navigation headers so we don't send "Top job picks for you" as a job title.
    const docTitleClean = (document.title || "")
      .replace(/^\(\d+\)\s*/, "")
      .replace(/\s+[|·]\s+LinkedIn.*$/i, "")
      .trim();
    const sectionHeaderRe = /^(top job picks|recommended for you|saved jobs|applied jobs|my jobs|jobs home|job search|jobs)\b/i;
    const candidates = [jobTitleRaw, docTitleClean].filter(
      (t) => t && !sectionHeaderRe.test(t)
    );
    const jobTitle = candidates[0] || "";

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
    let companyEl = firstMatch(companySelectors, main) || firstMatch(companySelectors);
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
      sendResponse({ payload });
    } catch (e) {
      sendResponse({ error: String(e.message || e) });
    }
    return true;
  });
})();
