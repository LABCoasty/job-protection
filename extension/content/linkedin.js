(function () {
  function getText(el) {
    return el ? (el.textContent || "").trim() : "";
  }

  function extractLinkedIn() {
    // Job view (e.g. /jobs/view/...) and collections/recommended main detail area
    const titleEl =
      document.querySelector(".job-details-jobs-unified-top-card__job-title") ||
      document.querySelector("[data-tracking-control-name='jobs_show_poster_modal_job_title']") ||
      document.querySelector(".job-details-jobs-unified-top-card h1") ||
      document.querySelector(".scaffold-layout__main h1") ||
      document.querySelector("h1.t-24") ||
      document.querySelector("h1");
    const companyEl =
      document.querySelector(".job-details-jobs-unified-top-card__company-name") ||
      document.querySelector("[data-tracking-control-name='jobs_show_poster_modal_company_name']") ||
      document.querySelector(".job-details-jobs-unified-top-card__primary-description a") ||
      document.querySelector(".jobs-unified-top-card__company-name") ||
      document.querySelector(".job-details-jobs-unified-top-card a[href*='/company/']");
    const locationEl =
      document.querySelector(".job-details-jobs-unified-top-card__bullet") ||
      document.querySelector(".job-details-jobs-unified-top-card__primary-description-without-tagline") ||
      document.querySelector(".job-details-jobs-unified-top-card__bullet-item") ||
      document.querySelector("[data-tracking-control-name='jobs_show_poster_modal_company_name']")?.parentElement;
    const descEl =
      document.querySelector(".jobs-description-content__content") ||
      document.querySelector(".jobs-box__html-content") ||
      document.querySelector(".jobs-description__content") ||
      document.querySelector("[data-tracking-control-name='jobs_show_poster_modal_job_description']") ||
      document.querySelector(".jobs-details__main-content") ||
      document.querySelector(".jobs-description");
    const description = getText(descEl) || getText(document.querySelector(".jobs-description"));
    const jobTitle = getText(titleEl) || "Unknown title";
    const companyName = getText(companyEl) || "Unknown company";
    const location = getText(locationEl) || "";
    const bodyText = description;
    const hasResponsibilities = /responsibilities|duties|what you'll do/i.test(bodyText);
    const hasRequirements = /requirements|qualifications|must have|experience/i.test(bodyText);
    const hasBenefits = /benefits|health|401|vacation|remote/i.test(bodyText);
    const salaryMentioned = /\$|salary|compensation|pay range|k\/yr|per year/i.test(bodyText);
    const emailMatch = bodyText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const contactInfo = emailMatch ? emailMatch[0] : null;
    const recruiterEl = document.querySelector(".job-details-jobs-unified-top-card__poster-name") ||
      document.querySelector("[data-tracking-control-name='jobs_show_poster_modal_poster_name']");
    const recruiterVisible = getText(recruiterEl) || null;
    const applicantEl = document.querySelector(".job-details-jobs-unified-top-card__applicant-count");
    const applicantCount = getText(applicantEl) || "";
    const postedEl = document.querySelector(".job-details-jobs-unified-top-card__posted-date");
    const postedDate = getText(postedEl) || "";
    const employmentType = "";

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
