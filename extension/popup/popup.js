document.getElementById("scan").addEventListener("click", async () => {
  const btn = document.getElementById("scan");
  const status = document.getElementById("status");
  btn.disabled = true;
  status.textContent = "Extracting job data…";
  status.classList.remove("error");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      status.textContent = "No active tab.";
      status.classList.add("error");
      btn.disabled = false;
      return;
    }
    const response = await chrome.tabs.sendMessage(tab.id, { action: "EXTRACT_AND_SCAN" });
    if (response?.error) {
      status.textContent = response.error;
      status.classList.add("error");
      btn.disabled = false;
      return;
    }
    const payload = response?.payload;
    if (!payload?.jobTitle) {
      status.textContent = "Could not extract job data. Open a LinkedIn or Indeed job page.";
      status.classList.add("error");
      btn.disabled = false;
      return;
    }
    status.textContent = "Analyzing…";
    const backResponse = await chrome.runtime.sendMessage({ type: "SCAN", payload });
    if (backResponse?.error) {
      status.textContent = backResponse.error;
      status.classList.add("error");
      btn.disabled = false;
      return;
    }
    status.textContent = "Opening report…";
    window.close();
  } catch (e) {
    status.textContent = "Not on a job page? Try LinkedIn or Indeed.";
    status.classList.add("error");
    btn.disabled = false;
  }
});
