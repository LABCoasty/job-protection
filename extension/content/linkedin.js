(function () {
  function getText(el) {
    return el ? (el.textContent || "").trim().replace(/\s+/g, " ") : "";
  }

  function firstMatch(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && (el.textContent || "").trim()) return el;
    }
    return null;
  }

  function mainArea() {
    return (
      document.querySelector(".scaffold-layout__main") ||
      document.querySelector("[role='main']") ||
      document.querySelector("main") ||
      document.body
    );
  }

  function extractLinkedIn() {
    // Title: current + legacy + generic
    const titleEl = firstMatch([
      ".job-details-jobs-unified-top-card__job-title h1",
      ".job-details-jobs-unified-top-card__job-title",
      ".jobs-unified-top-card__job-title",
      ".top-card-layout__title",
      ".jobs-details-top-card__job-title",
      "[data-tracking-control-name='jobs_show_poster_modal_job_title']",
      ".job-details-jobs-unified-top-card h1",
      ".scaffold-layout__main h1",
      "h1.t-24",
      "h1",
    ]);
    const jobTitleRaw = getText(titleEl);
    const docTitle = (document.title || "").split(/\s+[|·]\s+/)[0].trim();
    const jobTitle = jobTitleRaw || docTitle || "Unknown title";

    // Company: known selectors, then any /company/ link inside main area
    const main = mainArea();
    let companyEl = firstMatch([
      ".job-details-jobs-unified-top-card__company-name",
      ".job-details-jobs-unified-top-card__company-name a",
      "[data-tracking-control-name='jobs_show_poster_modal_company_name']",
      ".jobs-unified-top-card__company-name",
      ".topcard__org-name-link",
      ".jobs-details-top-card__company-url",
    ]);
    if (!companyEl && main) {
      companyEl = main.querySelector("a[href*='/company/']");
    }
    const companyName = getText(companyEl) || "Unknown company";

    // Description: scope to main, try specific -> fall back to main text
    let descEl = null;
    if (main) {
      descEl =
        main.querySelector(".jobs-description-content__text") ||
        main.querySelector(".jobs-description-content__content") ||
        main.querySelector(".jobs-description__content") ||
        main.querySelector(".jobs-box__html-content") ||
        main.querySelector("[class*='jobs-description']") ||
        main.querySelector("[data-tracking-control-name='jobs_show_poster_modal_job_description']") ||
        main.querySelector(".description__text") ||
        main.querySelector("article");
    }
    let description = getText(descEl);
    // Last-resort: dump full main-area text so the LLM has content to analyze.
    if (description.length < 200 && main) {
      description = (main.innerText || "").trim().replace(/\s+/g, " ").slice(0, 20000);
    }
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
