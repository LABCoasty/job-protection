// Auto-fill application forms with the user's parsed resume.
// Injected on LinkedIn + common ATS domains. Waits for an AUTOFILL_FORM
// message from the side panel before touching any fields.
//
// Strategy:
//   1. Detect the platform from the URL (workday, greenhouse, lever, ashby, …)
//   2. Run platform-specific selectors first — they use the ATS's stable
//      attributes (e.g. Workday's data-automation-id, Greenhouse's name)
//      and are far more reliable than generic id/name heuristics.
//   3. Fall through to cross-platform generic selectors and <label> text
//      matching so we still catch weird forms.

(function () {
  // --------------------------------------------------------------------------
  // Value setters
  // --------------------------------------------------------------------------

  function setInputValue(el, value) {
    if (!el || value === undefined || value === null || value === "") return false;
    const proto =
      el.tagName === "TEXTAREA"
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && desc.set) desc.set.call(el, String(value));
    else el.value = String(value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
    return true;
  }

  function setSelectValue(el, candidates) {
    if (!el || !candidates?.length) return false;
    const options = Array.from(el.options || []);
    for (const candidate of candidates.filter(Boolean)) {
      const needle = String(candidate).toLowerCase();
      const exact = options.find(
        (o) =>
          o.value.toLowerCase() === needle ||
          (o.textContent || "").trim().toLowerCase() === needle
      );
      const loose =
        exact ||
        options.find(
          (o) =>
            (o.textContent || "").toLowerCase().includes(needle) ||
            o.value.toLowerCase().includes(needle)
        );
      if (loose) {
        el.value = loose.value;
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
    }
    return false;
  }

  // --------------------------------------------------------------------------
  // Finders
  // --------------------------------------------------------------------------

  function isFillable(el) {
    if (!el) return false;
    if (el.disabled || el.readOnly) return false;
    if (!el.offsetParent && el.type !== "hidden") return false; // visible check
    if (el.value && el.value.trim()) return false; // respect existing values
    return true;
  }

  function findField(selectors) {
    for (const s of selectors) {
      for (const el of document.querySelectorAll(s)) {
        if (isFillable(el)) return el;
      }
    }
    return null;
  }

  function findByLabel(keywords) {
    const labels = Array.from(document.querySelectorAll("label"));
    for (const label of labels) {
      const text = (label.textContent || "").toLowerCase();
      if (!keywords.some((k) => text.includes(k))) continue;
      let input = null;
      const forAttr = label.getAttribute("for");
      if (forAttr) input = document.getElementById(forAttr);
      if (!input) input = label.querySelector("input, textarea, select");
      if (!input) {
        const parent = label.closest("div, fieldset, section");
        if (parent) input = parent.querySelector("input, textarea, select");
      }
      if (isFillable(input)) return input;
    }
    return null;
  }

  // --------------------------------------------------------------------------
  // Platform-specific selector maps
  // Each map is { fieldKey: [selector, ...] } — tried before generic selectors.
  // --------------------------------------------------------------------------

  const WORKDAY_SELECTORS = {
    firstName: [
      "input[data-automation-id='legalNameSection_firstName']",
      "input[data-automation-id='name--legalName--firstName']",
      "input[data-automation-id*='firstName' i]",
    ],
    preferredName: [
      "input[data-automation-id='preferredNameSection_firstName']",
      "input[data-automation-id*='preferredName' i]",
    ],
    lastName: [
      "input[data-automation-id='legalNameSection_lastName']",
      "input[data-automation-id='name--legalName--lastName']",
      "input[data-automation-id*='lastName' i]",
    ],
    middleName: [
      "input[data-automation-id='legalNameSection_middleName']",
      "input[data-automation-id*='middleName' i]",
    ],
    email: [
      "input[data-automation-id='email']",
      "input[data-automation-id='contact-email']",
      "input[data-automation-id*='email' i]",
    ],
    phone: [
      "input[data-automation-id='phone-number']",
      "input[data-automation-id='phoneNumber']",
      "input[data-automation-id*='phone-number' i]",
      "input[data-automation-id*='phoneNumber' i]",
    ],
    addressLine1: [
      "input[data-automation-id='addressSection_addressLine1']",
      "input[data-automation-id*='addressLine1' i]",
    ],
    addressLine2: [
      "input[data-automation-id='addressSection_addressLine2']",
      "input[data-automation-id*='addressLine2' i]",
    ],
    city: [
      "input[data-automation-id='addressSection_city']",
      "input[data-automation-id*='city' i]",
    ],
    postalCode: [
      "input[data-automation-id='addressSection_postalCode']",
      "input[data-automation-id*='postalCode' i]",
      "input[data-automation-id*='postal-code' i]",
      "input[data-automation-id*='zipCode' i]",
    ],
    currentCompany: [
      "input[data-automation-id='workExperiencesSection_companyName']",
      "input[data-automation-id*='companyName' i]",
    ],
    currentTitle: [
      "input[data-automation-id='workExperiencesSection_jobTitle']",
      "input[data-automation-id*='jobTitle' i]",
    ],
    summary: [
      "textarea[data-automation-id='workExperiencesSection_description']",
      "textarea[data-automation-id*='description' i]",
    ],
  };

  // Workday custom dropdowns: the "button" is the visible combobox trigger,
  // not a native <select>. Clicking it opens a listbox of options.
  const WORKDAY_DROPDOWN_SELECTORS = {
    state: [
      "button[data-automation-id='addressSection_countryRegion']",
      "button[data-automation-id='countryRegion']",
      "button[data-automation-id*='countryRegion' i]",
      "button[data-automation-id*='state' i]",
    ],
    country: [
      "button[data-automation-id='countryDropdown']",
      "button[data-automation-id*='country' i]:not([data-automation-id*='Region' i])",
    ],
    phoneCountryCode: [
      "button[data-automation-id='country-phone-code']",
      "button[data-automation-id='countryPhoneCode']",
    ],
    phoneDeviceType: [
      "button[data-automation-id='phone-device-type']",
      "button[data-automation-id='phoneDeviceType']",
    ],
  };

  const GREENHOUSE_SELECTORS = {
    firstName: [
      "input[name='job_application[first_name]']",
      "input[id='first_name']",
      "input[name='first_name']",
    ],
    lastName: [
      "input[name='job_application[last_name]']",
      "input[id='last_name']",
      "input[name='last_name']",
    ],
    email: [
      "input[name='job_application[email]']",
      "input[id='email']",
      "input[name='email']",
    ],
    phone: [
      "input[name='job_application[phone]']",
      "input[id='phone']",
      "input[name='phone']",
    ],
    currentCompany: [
      "input[name='job_application[current_company]']",
      "input[id='current_company']",
    ],
    currentTitle: [
      "input[name='job_application[current_title]']",
      "input[id='current_title']",
    ],
    summary: [
      "textarea[name='job_application[cover_letter_text]']",
      "textarea[id='cover_letter_text']",
    ],
    linkedinUrl: [
      "input[name='job_application[linkedin_url]']",
      "input[id='linkedin_url']",
    ],
  };

  const LEVER_SELECTORS = {
    firstName: ["input[name='firstName' i]"],
    lastName: ["input[name='lastName' i]"],
    email: ["input[name='email' i][type='email']", "input[name='email' i]"],
    phone: ["input[name='phone' i][type='tel']", "input[name='phone' i]"],
    currentCompany: ["input[name='org' i]", "input[name='company' i]"],
    currentTitle: ["input[name='urls[LinkedIn]' i]"], // placeholder
    summary: ["textarea[name='comments' i]"],
  };

  const ASHBY_SELECTORS = {
    firstName: ["input[name='_systemfield_name' i]", "input[name='name' i]"],
    email: ["input[name='_systemfield_email' i]", "input[name='email' i]"],
    phone: ["input[name='_systemfield_phoneNumber' i]"],
    linkedinUrl: ["input[name='_systemfield_linkedin' i]"],
  };

  function platformSelectorsFromUrl() {
    const host = location.hostname;
    if (host.includes("myworkdayjobs.com") || host.includes("workday")) return WORKDAY_SELECTORS;
    if (host.includes("greenhouse.io")) return GREENHOUSE_SELECTORS;
    if (host.includes("lever.co")) return LEVER_SELECTORS;
    if (host.includes("ashbyhq.com")) return ASHBY_SELECTORS;
    return null;
  }

  // --------------------------------------------------------------------------
  // Generic cross-platform selectors (used as fallback and on LinkedIn)
  // --------------------------------------------------------------------------

  function genericSelectors(key) {
    switch (key) {
      case "firstName":
        return [
          "input[id*='first-name' i]",
          "input[id*='firstName' i]",
          "input[name*='first-name' i]",
          "input[name*='firstName' i]",
          "input[name*='first_name' i]",
          "input[autocomplete='given-name']",
        ];
      case "preferredName":
        return [
          "input[id*='preferred-name' i]",
          "input[id*='preferredName' i]",
          "input[name*='preferred-name' i]",
          "input[name*='preferred_name' i]",
          "input[name*='nickname' i]",
          "input[placeholder*='preferred' i]",
        ];
      case "lastName":
        return [
          "input[id*='last-name' i]",
          "input[id*='lastName' i]",
          "input[name*='last-name' i]",
          "input[name*='lastName' i]",
          "input[name*='last_name' i]",
          "input[autocomplete='family-name']",
        ];
      case "fullName":
        return [
          "input[id='name']",
          "input[name='name']",
          "input[id*='full-name' i]",
          "input[name*='full-name' i]",
          "input[autocomplete='name']",
        ];
      case "email":
        return [
          "input[type='email']",
          "input[id*='email' i]",
          "input[name*='email' i]",
          "input[autocomplete='email']",
        ];
      case "phone":
        return [
          "input[type='tel']",
          "input[id*='phone' i]",
          "input[id*='mobile' i]",
          "input[name*='phone' i]",
          "input[name*='mobile' i]",
          "input[autocomplete='tel']",
        ];
      case "currentCompany":
        return [
          "input[id*='company' i]",
          "input[name*='company' i]",
          "input[name*='employer' i]",
          "input[autocomplete='organization']",
        ];
      case "currentTitle":
        return [
          "input[id*='title' i]",
          "input[name*='title' i]",
          "input[name*='job-title' i]",
          "input[autocomplete='organization-title']",
        ];
      case "city":
      case "location":
        return [
          "input[id*='city' i]",
          "input[name*='city' i]",
          "input[id*='location' i]",
          "input[name*='location' i]",
          "input[autocomplete='address-level2']",
        ];
      case "addressLine1":
        return [
          "input[id*='address1' i]",
          "input[name*='address1' i]",
          "input[id*='street' i]",
          "input[name*='street' i]",
          "input[autocomplete='address-line1']",
        ];
      case "postalCode":
        return [
          "input[id*='zip' i]",
          "input[name*='zip' i]",
          "input[id*='postal' i]",
          "input[name*='postal' i]",
          "input[autocomplete='postal-code']",
        ];
      case "summary":
        return [
          "textarea[id*='summary' i]",
          "textarea[name*='summary' i]",
          "textarea[id*='about' i]",
          "textarea[name*='about' i]",
          "textarea[id*='coverletter' i]",
          "textarea[name*='coverletter' i]",
          "textarea[id*='cover-letter' i]",
          "textarea[name*='cover_letter' i]",
        ];
      case "linkedinUrl":
        return [
          "input[id*='linkedin' i]",
          "input[name*='linkedin' i]",
        ];
      default:
        return [];
    }
  }

  function labelsFor(key) {
    switch (key) {
      case "firstName": return ["first name", "given name"];
      case "preferredName": return ["preferred name", "nickname", "name you go by", "preferred first name"];
      case "lastName": return ["last name", "family name", "surname"];
      case "middleName": return ["middle name"];
      case "fullName": return ["full name", "your name"];
      case "email": return ["email"];
      case "phone": return ["phone", "mobile", "cell"];
      case "currentCompany": return ["current company", "current employer", "company"];
      case "currentTitle": return ["current title", "job title", "position"];
      case "city": return ["city"];
      case "location": return ["location", "where are you based"];
      case "addressLine1": return ["address", "street address"];
      case "addressLine2": return ["address line 2", "apt", "suite"];
      case "postalCode": return ["zip", "postal code", "postcode"];
      case "summary": return ["cover letter", "tell us about yourself", "summary"];
      case "linkedinUrl": return ["linkedin"];
      default: return [];
    }
  }

  // --------------------------------------------------------------------------
  // Workday-style custom dropdown: click the trigger, wait for the listbox,
  // click the option whose text matches one of the candidates. Returns a
  // Promise<boolean>.
  // --------------------------------------------------------------------------

  function waitFor(predicate, { timeout = 1500, interval = 50 } = {}) {
    return new Promise((resolve) => {
      const start = Date.now();
      const tick = () => {
        const value = predicate();
        if (value) {
          resolve(value);
          return;
        }
        if (Date.now() - start >= timeout) {
          resolve(null);
          return;
        }
        setTimeout(tick, interval);
      };
      tick();
    });
  }

  async function fillCombobox(trigger, candidates) {
    if (!trigger || !candidates?.length) return false;
    const needles = candidates
      .filter(Boolean)
      .map((c) => String(c).trim().toLowerCase());
    if (!needles.length) return false;

    trigger.click();
    // Wait for the listbox to appear. Workday uses role=listbox OR custom
    // data-automation-id='promptOption'/'promptScroller'.
    const listbox = await waitFor(() => {
      return (
        document.querySelector("[role='listbox']") ||
        document.querySelector("[data-automation-id='promptScroller']") ||
        document.querySelector("[data-automation-id*='promptOption']")?.parentElement
      );
    });
    if (!listbox) return false;

    const options = Array.from(
      listbox.querySelectorAll(
        "[role='option'], [data-automation-id='promptOption'], li, div[data-automation-id*='promptOption']"
      )
    );

    const matchFor = (needle) => {
      const exact = options.find(
        (o) => (o.textContent || "").trim().toLowerCase() === needle
      );
      if (exact) return exact;
      const starts = options.find((o) =>
        (o.textContent || "").trim().toLowerCase().startsWith(needle)
      );
      if (starts) return starts;
      return options.find((o) => (o.textContent || "").toLowerCase().includes(needle));
    };

    let chosen = null;
    for (const needle of needles) {
      chosen = matchFor(needle);
      if (chosen) break;
    }

    if (!chosen) {
      // Close by pressing Escape / clicking outside.
      trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      document.body.click();
      return false;
    }

    chosen.click();
    return true;
  }

  // Map common US state abbreviations to full names so Workday's listbox
  // (which usually has full names) matches.
  const US_STATES = {
    AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
    CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
    HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
    KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
    MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
    MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
    NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
    OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
    SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
    VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
    DC: "District of Columbia",
  };

  function expandState(value) {
    if (!value) return [];
    const up = value.toUpperCase().trim();
    if (US_STATES[up]) return [US_STATES[up], up];
    return [value];
  }

  // --------------------------------------------------------------------------
  // Address parser — the resume's "location" is often "San Francisco, CA 94102"
  // or "New York, NY" or "Remote". Split it into city / region / postal.
  // --------------------------------------------------------------------------

  function splitLocation(loc) {
    if (!loc) return {};
    const s = loc.trim();
    // e.g. "San Francisco, CA 94102" or "New York, NY"
    const m1 = s.match(/^([^,]+?),\s*([A-Z]{2})(?:\s+(\d{4,10}))?$/i);
    if (m1) return { city: m1[1].trim(), state: m1[2].toUpperCase(), postalCode: m1[3] || "" };
    // e.g. "San Francisco, California"
    const m2 = s.match(/^([^,]+?),\s*([A-Za-z][A-Za-z .-]+)$/);
    if (m2) return { city: m2[1].trim(), state: m2[2].trim() };
    return { city: s };
  }

  // --------------------------------------------------------------------------
  // Main fill
  // --------------------------------------------------------------------------

  function buildFieldValues(parsed) {
    const full = parsed.name || "";
    const parts = full.split(/\s+/).filter(Boolean);
    const firstName =
      parsed.firstName || parts[0] || "";
    const lastName =
      parsed.lastName || (parts.length > 1 ? parts.slice(-1)[0] : "");
    const middleName =
      parsed.middleName || (parts.length > 2 ? parts.slice(1, -1).join(" ") : "");
    const preferredName = parsed.preferredName || firstName;

    const addr = parsed.address || {};
    const legacyLoc = splitLocation(parsed.location);
    const links = parsed.links || {};

    const city = addr.city || legacyLoc.city || "";
    const state = addr.state || legacyLoc.state || "";
    const postalCode = addr.postalCode || legacyLoc.postalCode || "";
    const country =
      addr.country || (state ? "United States" : "");

    return {
      firstName,
      middleName,
      lastName,
      preferredName,
      fullName: full,
      email: parsed.email || "",
      phone: parsed.phone || "",
      pronouns: parsed.pronouns || "",
      workAuthorization: parsed.workAuthorization || "",
      currentCompany: (parsed.topCompanies && parsed.topCompanies[0]) || "",
      currentTitle: parsed.currentTitle || "",
      city,
      state,
      location: parsed.location || [city, state, postalCode].filter(Boolean).join(", "),
      addressLine1: addr.street || "",
      postalCode,
      country,
      summary: parsed.summary || "",
      linkedinUrl: links.linkedin || parsed.linkedinUrl || "",
      githubUrl: links.github || "",
      portfolioUrl: links.portfolio || "",
    };
  }

  // --------------------------------------------------------------------------
  // Section-scoped helpers
  // --------------------------------------------------------------------------

  function findByLabelInRoot(root, keywords) {
    if (!root) return null;
    const labels = Array.from(root.querySelectorAll("label"));
    for (const label of labels) {
      const text = (label.textContent || "").toLowerCase();
      if (!keywords.some((k) => text.includes(k))) continue;
      let input = null;
      const forAttr = label.getAttribute("for");
      if (forAttr) {
        try {
          input = root.querySelector(`#${CSS.escape(forAttr)}`) || document.getElementById(forAttr);
        } catch {}
      }
      if (!input) input = label.querySelector("input, textarea, select");
      if (!input) {
        const parent = label.closest("div, fieldset, section");
        if (parent) input = parent.querySelector("input, textarea, select");
      }
      if (isFillable(input)) return input;
    }
    return null;
  }

  // Find a container whose heading (or first strong/label) matches one of the
  // keywords. Used for Work Experience, Education, etc.
  function findSectionByHeading(keywords) {
    const headingSelectors = "h1, h2, h3, h4, h5, legend, strong, [role='heading']";
    for (const c of document.querySelectorAll(headingSelectors)) {
      const text = (c.textContent || "").toLowerCase().trim();
      if (!text) continue;
      if (!keywords.some((k) => text === k || text.startsWith(k))) continue;
      let section = c.closest("fieldset, section, [class*='experience' i], [class*='section' i]");
      if (!section) {
        // Fall back to the heading's parent that also contains at least one input.
        let p = c.parentElement;
        while (p && p !== document.body) {
          if (p.querySelector("input, textarea, select")) {
            section = p;
            break;
          }
          p = p.parentElement;
        }
      }
      if (section) return section;
    }
    return null;
  }

  async function fillWorkExperience(parsed) {
    const section = findSectionByHeading([
      "work experience",
      "work experience 1",
      "experience",
      "employment",
      "work history",
    ]);
    if (!section) return { filled: 0, fields: [] };
    const entry = (parsed.workHistory && parsed.workHistory[0]) || {
      title: parsed.currentTitle,
      company: parsed.topCompanies && parsed.topCompanies[0],
      location: parsed.location,
      description: parsed.summary,
      startDate: "",
      endDate: "",
      current: true,
    };
    let filled = 0;
    const fields = [];

    const titleEl = findByLabelInRoot(section, ["job title", "title", "position"]);
    if (titleEl && entry.title && setInputValue(titleEl, entry.title)) {
      filled++;
      fields.push("we.title");
    }

    const companyEl = findByLabelInRoot(section, ["company", "employer", "organization"]);
    if (companyEl && entry.company && setInputValue(companyEl, entry.company)) {
      filled++;
      fields.push("we.company");
    }

    const locationEl = findByLabelInRoot(section, ["location"]);
    if (locationEl && entry.location && setInputValue(locationEl, entry.location)) {
      filled++;
      fields.push("we.location");
    }

    const descriptionEl = findByLabelInRoot(section, [
      "role description",
      "description",
      "responsibilities",
      "what did you do",
    ]);
    if (descriptionEl && entry.description && setInputValue(descriptionEl, entry.description)) {
      filled++;
      fields.push("we.description");
    }

    // Dates: some forms use MM/YYYY inputs; best-effort fill.
    const fromEl = findByLabelInRoot(section, ["from", "start date", "start"]);
    if (fromEl && entry.startDate && setInputValue(fromEl, entry.startDate)) {
      filled++;
      fields.push("we.from");
    }
    const toEl = findByLabelInRoot(section, ["to", "end date", "end"]);
    if (toEl && entry.endDate && !entry.current && setInputValue(toEl, entry.endDate)) {
      filled++;
      fields.push("we.to");
    }

    // "I currently work here" checkbox
    if (entry.current) {
      const labels = Array.from(section.querySelectorAll("label"));
      for (const l of labels) {
        const text = (l.textContent || "").toLowerCase();
        if (text.includes("currently work") || text.includes("present")) {
          let checkbox = l.querySelector("input[type='checkbox']");
          if (!checkbox) {
            const forAttr = l.getAttribute("for");
            if (forAttr) checkbox = document.getElementById(forAttr);
          }
          if (checkbox && !checkbox.checked) {
            checkbox.click();
            filled++;
            fields.push("we.current");
          }
          break;
        }
      }
    }

    return { filled, fields };
  }

  async function fillSkills(parsed) {
    const skills = (parsed.skills || []).slice(0, 8);
    if (!skills.length) return { filled: 0, fields: [] };

    const searchEl =
      findField([
        "input[placeholder='Search' i][aria-expanded]",
        "input[placeholder*='Search' i][aria-label*='skill' i]",
        "input[aria-label*='skill' i]",
        "input[placeholder*='skill' i]",
      ]) || findByLabel(["type to add skills", "add skills", "skills"]);
    if (!searchEl) return { filled: 0, fields: [] };

    let filled = 0;
    const fields = [];
    for (const skill of skills) {
      searchEl.focus();
      setInputValue(searchEl, skill);
      searchEl.dispatchEvent(new Event("input", { bubbles: true }));
      searchEl.dispatchEvent(new KeyboardEvent("keyup", { key: skill.slice(-1), bubbles: true }));
      const list = await waitFor(
        () =>
          document.querySelector("[role='listbox']") ||
          document.querySelector("ul[class*='suggestion' i]") ||
          document.querySelector("ul[class*='autocomplete' i]"),
        { timeout: 700 }
      );
      if (!list) continue;
      const options = Array.from(
        list.querySelectorAll("[role='option'], li")
      );
      const match =
        options.find(
          (o) => (o.textContent || "").trim().toLowerCase() === skill.toLowerCase()
        ) ||
        options.find((o) =>
          (o.textContent || "").toLowerCase().includes(skill.toLowerCase())
        );
      if (match) {
        match.click();
        filled++;
        fields.push(`skill:${skill}`);
      }
      await new Promise((r) => setTimeout(r, 120));
    }
    // Clear the search input so we don't leave stray text.
    try {
      setInputValue(searchEl, "");
    } catch {}
    return { filled, fields };
  }

  async function fillWebsites(values) {
    const urls = [values.linkedinUrl, values.githubUrl, values.portfolioUrl].filter(Boolean);
    if (!urls.length) return { filled: 0, fields: [] };

    // Look for a heading or label that mentions websites / URLs / links.
    const section = findSectionByHeading([
      "websites",
      "relevant websites",
      "links",
      "online presence",
      "social",
    ]);

    let filled = 0;
    const fields = [];

    // Pattern 1: dedicated LinkedIn / GitHub input (already there).
    const liEl = findField(genericSelectors("linkedinUrl"));
    if (liEl && values.linkedinUrl && setInputValue(liEl, values.linkedinUrl)) {
      filled++;
      fields.push("web.linkedin");
    }

    // Pattern 2: "Add" button pattern (screenshot 1 / Greenhouse custom).
    const addBtn = (section
      ? Array.from(section.querySelectorAll("button"))
      : Array.from(document.querySelectorAll("button"))
    ).find((b) => (b.textContent || "").trim().toLowerCase() === "add");

    if (addBtn && !liEl) {
      for (const url of urls) {
        addBtn.click();
        await new Promise((r) => setTimeout(r, 180));
        const input = findField([
          "input[type='url']:not([value]):not(:read-only)",
          "input[placeholder*='url' i]:not([value])",
          "input[placeholder*='website' i]:not([value])",
          "input[name*='website' i]",
        ]);
        if (input && setInputValue(input, url)) {
          filled++;
          fields.push(`web:${url.includes("linkedin") ? "linkedin" : url.includes("github") ? "github" : "portfolio"}`);
        }
      }
    }

    return { filled, fields };
  }

  async function autofillFromProfile(parsed, options = {}) {
    if (!parsed) return { filled: 0, missing: ["no parsed resume"] };
    const values = buildFieldValues(parsed);
    const platform = platformSelectorsFromUrl();
    const isWorkday = platformName() === "Workday";

    // Replace the plain email with a +company alias when the user opted in.
    let appliedCompanySlug = null;
    if (options.emailAliasEnabled) {
      const slug = detectCompanySlug();
      if (slug && values.email) {
        const aliased = aliasEmail(values.email, slug);
        if (aliased && aliased !== values.email) {
          values.email = aliased;
          appliedCompanySlug = slug;
        }
      }
    }

    // Order matters: fill text inputs first, then try combobox dropdowns
    // (since Workday's state listbox depends on the country being set first).
    const inputKeys = [
      "firstName",
      "preferredName",
      "middleName",
      "lastName",
      "fullName",
      "email",
      "phone",
      "currentCompany",
      "currentTitle",
      "addressLine1",
      "city",
      "location",
      "postalCode",
      "summary",
      "linkedinUrl",
    ];

    let filled = 0;
    const missing = [];
    const filledFields = [];

    for (const key of inputKeys) {
      const value = values[key];
      if (!value) continue;

      let el = null;
      if (platform && platform[key]) el = findField(platform[key]);
      if (!el) el = findField(genericSelectors(key));
      if (!el) el = findByLabel(labelsFor(key));

      if (el) {
        const ok =
          el.tagName === "SELECT"
            ? setSelectValue(el, [value])
            : setInputValue(el, value);
        if (ok) {
          filled++;
          filledFields.push(key);
        } else {
          missing.push(key);
        }
      } else {
        missing.push(key);
      }
    }

    // Work Experience section (all ATS layouts that use "Job Title / Company /
    // Location / Role Description" labels — Greenhouse, Ashby, many custom).
    try {
      const we = await fillWorkExperience(parsed);
      filled += we.filled;
      filledFields.push(...we.fields);
    } catch (e) {
      console.warn("JobGuard: work-experience fill failed:", e);
    }

    // Skills autocomplete (Type to Add Skills pattern).
    try {
      const sk = await fillSkills(parsed);
      filled += sk.filled;
      filledFields.push(...sk.fields);
    } catch (e) {
      console.warn("JobGuard: skills fill failed:", e);
    }

    // Websites / URLs section.
    try {
      const ws = await fillWebsites(values);
      filled += ws.filled;
      filledFields.push(...ws.fields);
    } catch (e) {
      console.warn("JobGuard: websites fill failed:", e);
    }

    // Workday custom dropdowns (State, Country, phone country code).
    if (isWorkday) {
      // Country first so the State listbox is populated correctly.
      if (values.country) {
        const trigger = findField(WORKDAY_DROPDOWN_SELECTORS.country);
        if (trigger) {
          const ok = await fillCombobox(trigger, [values.country]);
          if (ok) {
            filled++;
            filledFields.push("country");
          } else {
            missing.push("country");
          }
        }
      }
      if (values.state) {
        const trigger = findField(WORKDAY_DROPDOWN_SELECTORS.state);
        if (trigger) {
          const ok = await fillCombobox(trigger, expandState(values.state));
          if (ok) {
            filled++;
            filledFields.push("state");
          } else {
            missing.push("state");
          }
        }
      }
    }

    return {
      filled,
      missing,
      filledFields,
      platform: platformName(),
      emailAlias: appliedCompanySlug,  // null unless we aliased this time
      emailUsed: values.email,
    };
  }

  function platformName() {
    const host = location.hostname;
    if (host.includes("myworkdayjobs.com") || host.includes("workday")) return "Workday";
    if (host.includes("greenhouse.io")) return "Greenhouse";
    if (host.includes("lever.co")) return "Lever";
    if (host.includes("ashbyhq.com")) return "Ashby";
    if (host.includes("smartrecruiters.com")) return "SmartRecruiters";
    if (host.includes("workable.com")) return "Workable";
    if (host.includes("bamboohr.com")) return "BambooHR";
    if (host.includes("icims.com")) return "iCIMS";
    if (host.includes("linkedin.com")) return "LinkedIn";
    return "generic";
  }

  // --------------------------------------------------------------------------
  // Company detection for the +alias email trick
  // --------------------------------------------------------------------------

  function detectCompanySlug() {
    const host = location.hostname.toLowerCase();
    const path = location.pathname;

    // Workday: acme.wd1.myworkdayjobs.com, acme.wd5.myworkdayjobs.com, etc.
    let m = host.match(/^([a-z0-9-]+)\.wd\d+\.myworkdayjobs\.com$/);
    if (m) return m[1];

    // Greenhouse: boards.greenhouse.io/<company>/jobs/...
    if (host.endsWith("greenhouse.io")) {
      m = path.match(/^\/([^\/]+)/);
      if (m) return m[1];
    }

    // Lever: jobs.lever.co/<company>/<id>
    if (host.endsWith("lever.co")) {
      m = path.match(/^\/([^\/]+)/);
      if (m) return m[1];
    }

    // Ashby: jobs.ashbyhq.com/<company>/...
    if (host.endsWith("ashbyhq.com")) {
      m = path.match(/^\/([^\/]+)/);
      if (m) return m[1];
    }

    // SmartRecruiters: jobs.smartrecruiters.com/<Company>/<id>
    if (host.endsWith("smartrecruiters.com")) {
      m = path.match(/^\/([^\/]+)/);
      if (m) return m[1];
    }

    // BambooHR: <company>.bamboohr.com/jobs/...
    m = host.match(/^([a-z0-9-]+)\.bamboohr\.com$/);
    if (m) return m[1];

    // iCIMS: careers-<company>.icims.com
    m = host.match(/^(?:careers-)?([a-z0-9-]+)\.icims\.com$/);
    if (m) return m[1];

    // Workable: apply.workable.com/<company>/...
    if (host.endsWith("workable.com")) {
      m = path.match(/^\/([^\/]+)/);
      if (m) return m[1];
    }

    // Generic fallback: take the SLD of the apex domain.
    // e.g., "careers.acme.com" → "acme"
    const parts = host.split(".").filter(Boolean);
    if (parts.length >= 2) {
      const sld = parts[parts.length - 2];
      if (sld && sld.length > 1 && sld !== "www") return sld;
    }
    return null;
  }

  function slugify(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 30);
  }

  function aliasEmail(base, companySlug) {
    if (!base || !base.includes("@") || !companySlug) return base;
    const slug = slugify(companySlug);
    if (!slug) return base;
    const [local, domain] = base.split("@");
    if (!local || !domain) return base;
    // If the user already typed a +tag into their email, replace it rather
    // than stacking (gmail ignores everything after the first +, but we want
    // clean tracking).
    const trunk = local.split("+")[0];
    return `${trunk}+${slug}@${domain}`;
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action !== "AUTOFILL_FORM") return;
    (async () => {
      try {
        const [{ resumeParsed }, { emailAliasEnabled }] = await Promise.all([
          chrome.storage.local.get(["resumeParsed"]),
          chrome.storage.sync.get(["emailAliasEnabled"]),
        ]);
        if (!resumeParsed) {
          sendResponse({
            ok: false,
            error: "No parsed resume. Open JobGuard → Resume → Parse first.",
          });
          return;
        }
        const result = await autofillFromProfile(resumeParsed, {
          emailAliasEnabled: Boolean(emailAliasEnabled),
        });
        sendResponse({ ok: true, ...result });
      } catch (e) {
        sendResponse({ ok: false, error: String(e.message || e) });
      }
    })();
    return true; // async response
  });
})();
