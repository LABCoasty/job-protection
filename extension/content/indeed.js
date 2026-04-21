(function () {
  function getText(el) {
    return el ? (el.textContent || "").trim() : "";
  }

  function extractIndeed() {
    const titleEl =
      document.querySelector("[data-testid='jobsearch-JobInfoHeader-title"]") ||
      document.querySelector(".jobsearch-JobInfoHeader-title") ||
      document.querySelector("h1.jobsearch-JobInfoHeader-title") ||
      document.querySelector("h1");
    const companyEl =
      document.querySelector("[data-testid='inlineHeader-companyName']") ||
      document.querySelector(".jobsearch-InlineCompanyRating-companyHeader a") ||
      document.querySelector(".jobsearch-CompanyInfoContainer a");
    const locationEl =
      document.querySelector("[data-testid='job-location']") ||
      document.querySelector(".jobsearch-JobInfoHeader-subtitle div") ||
      document.querySelector(".jobsearch-InlineCompanyRating");
    const descEl =
      document.querySelector("#jobDescriptionText") ||
      document.querySelector(".jobsearch-JobComponent-description") ||
      document.querySelector("[data-testid='job-description']");
    const description = getText(descEl);
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
    const recruiterVisible = null;
    const applicantEl = document.querySelector(".jobsearch-JobMetadataFooter-item");
    const applicantCount = getText(applicantEl) || "";
    const postedEl = document.querySelector("[data-testid='job-date']") || document.querySelector(".jobsearch-JobMetadataFooter-item");
    const postedDate = getText(postedEl) || "";
    const employmentTypeEl = document.querySelector("[data-testid='attributes-layout']");
    const employmentType = getText(employmentTypeEl) || "";

    return {
      jobTitle,
      companyName,
      platform: "Indeed",
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
      const payload = extractIndeed();
      sendResponse({ payload });
    } catch (e) {
      sendResponse({ error: String(e.message || e) });
    }
    return true;
  });
})();
