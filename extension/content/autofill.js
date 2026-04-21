// Auto-fill application forms with the user's parsed resume.
// Injected on LinkedIn + common ATS domains. Waits for an AUTOFILL_FORM
// message from the side panel before touching any fields.

(function () {
  // Use the native setter so React / Angular / Vue inputs re-render.
  function setInputValue(el, value) {
    if (!el || value === undefined || value === null || value === "") return false;
    const proto =
      el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && desc.set) {
      desc.set.call(el, String(value));
    } else {
      el.value = String(value);
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
    return true;
  }

  function setSelectValue(el, candidates) {
    if (!el || !candidates || candidates.length === 0) return false;
    const options = Array.from(el.options || []);
    for (const candidate of candidates.filter(Boolean)) {
      const needle = String(candidate).toLowerCase();
      const match = options.find(
        (o) => o.value.toLowerCase() === needle || (o.textContent || "").trim().toLowerCase() === needle
      ) || options.find(
        (o) => (o.textContent || "").toLowerCase().includes(needle) || o.value.toLowerCase().includes(needle)
      );
      if (match) {
        el.value = match.value;
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
    }
    return false;
  }

  // Try each selector in order, return the first visible empty match.
  function findField(selectors) {
    for (const s of selectors) {
      const list = Array.from(document.querySelectorAll(s));
      for (const el of list) {
        if (!el.offsetParent) continue; // not visible
        if (el.disabled || el.readOnly) continue;
        if (el.value && el.value.trim()) continue; // skip already filled
        return el;
      }
    }
    return null;
  }

  // Label-based field lookup as a catch-all when ids/names don't help.
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
      if (input && !input.disabled && !input.readOnly && !(input.value || "").trim()) {
        return input;
      }
    }
    return null;
  }

  function autofillFromProfile(parsed) {
    if (!parsed) return { filled: 0, missing: ["no parsed resume"] };
    const fullName = parsed.name || "";
    const [firstName, ...rest] = fullName.split(/\s+/);
    const lastName = rest.join(" ");

    const entries = [
      {
        key: "firstName",
        value: firstName,
        selectors: [
          "input[id*='first-name' i]",
          "input[id*='firstName' i]",
          "input[name*='first-name' i]",
          "input[name*='firstName' i]",
          "input[name*='first_name' i]",
          "input[autocomplete='given-name']",
        ],
        labels: ["first name", "given name"],
      },
      {
        key: "lastName",
        value: lastName,
        selectors: [
          "input[id*='last-name' i]",
          "input[id*='lastName' i]",
          "input[name*='last-name' i]",
          "input[name*='lastName' i]",
          "input[name*='last_name' i]",
          "input[autocomplete='family-name']",
        ],
        labels: ["last name", "family name", "surname"],
      },
      {
        key: "fullName",
        value: fullName,
        selectors: [
          "input[id='name']",
          "input[name='name']",
          "input[id*='full-name' i]",
          "input[name*='full-name' i]",
          "input[autocomplete='name']",
        ],
        labels: ["full name", "your name"],
      },
      {
        key: "email",
        value: parsed.email,
        selectors: [
          "input[type='email']",
          "input[id*='email' i]",
          "input[name*='email' i]",
          "input[autocomplete='email']",
        ],
        labels: ["email"],
      },
      {
        key: "phone",
        value: parsed.phone,
        selectors: [
          "input[type='tel']",
          "input[id*='phone' i]",
          "input[id*='mobile' i]",
          "input[name*='phone' i]",
          "input[name*='mobile' i]",
          "input[autocomplete='tel']",
        ],
        labels: ["phone", "mobile", "cell"],
      },
      {
        key: "currentCompany",
        value: parsed.topCompanies?.[0] || "",
        selectors: [
          "input[id*='company' i]",
          "input[name*='company' i]",
          "input[name*='employer' i]",
          "input[autocomplete='organization']",
        ],
        labels: ["current company", "current employer", "company"],
      },
      {
        key: "currentTitle",
        value: parsed.currentTitle || "",
        selectors: [
          "input[id*='title' i]",
          "input[name*='title' i]",
          "input[name*='job-title' i]",
          "input[autocomplete='organization-title']",
        ],
        labels: ["current title", "job title", "position"],
      },
      {
        key: "location",
        value: parsed.location || "",
        selectors: [
          "input[id*='city' i]",
          "input[name*='city' i]",
          "input[id*='location' i]",
          "input[name*='location' i]",
          "input[autocomplete='address-level2']",
        ],
        labels: ["city", "location", "where are you based"],
      },
      {
        key: "summary",
        value: parsed.summary || "",
        selectors: [
          "textarea[id*='summary' i]",
          "textarea[name*='summary' i]",
          "textarea[id*='about' i]",
          "textarea[name*='about' i]",
          "textarea[id*='coverletter' i]",
          "textarea[name*='coverletter' i]",
          "textarea[id*='cover-letter' i]",
        ],
        labels: ["cover letter", "tell us about yourself", "summary"],
      },
    ];

    let filled = 0;
    const missing = [];
    for (const entry of entries) {
      if (!entry.value) continue;
      let el = findField(entry.selectors);
      if (!el && entry.labels) el = findByLabel(entry.labels);
      if (el) {
        if (el.tagName === "SELECT") {
          if (setSelectValue(el, [entry.value])) filled++;
        } else if (setInputValue(el, entry.value)) {
          filled++;
        }
      } else {
        missing.push(entry.key);
      }
    }
    return { filled, missing };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action !== "AUTOFILL_FORM") return;
    chrome.storage.local.get(["resumeParsed"], ({ resumeParsed }) => {
      if (!resumeParsed) {
        sendResponse({ ok: false, error: "No parsed resume. Open JobGuard → Resume → Parse first." });
        return;
      }
      try {
        const result = autofillFromProfile(resumeParsed);
        sendResponse({ ok: true, ...result });
      } catch (e) {
        sendResponse({ ok: false, error: String(e.message || e) });
      }
    });
    return true; // async response
  });
})();
