// DOM elements
const emailListTextarea = document.getElementById("emailList");
const fileUpload = document.getElementById("fileUpload");
const fileName = document.getElementById("fileName");
const subjectInput = document.getElementById("subject");
const contentTextarea = document.getElementById("content");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const statusDiv = document.getElementById("status");
const progressDiv = document.getElementById("progress");

let emailList = [];

// Load saved data
chrome.storage.local.get(["emailList", "subject", "content"], (result) => {
  if (result.emailList) {
    emailListTextarea.value = result.emailList.join("\n");
    emailList = result.emailList;
  }
  if (result.subject) {
    subjectInput.value = result.subject;
  }
  if (result.content) {
    contentTextarea.value = result.content;
  }
});

// File upload handler
fileUpload.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  fileName.textContent = `Selected: ${file.name}`;

  const reader = new FileReader();
  reader.onload = (event) => {
    const text = event.target.result;
    const emails = parseEmailList(text);
    emailListTextarea.value = emails.join("\n");
    emailList = emails;
    updateStatus(`Loaded ${emails.length} email(s) from file`, "success");
  };
  reader.readAsText(file);
});

// Parse email list from text
function parseEmailList(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => {
      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return line && emailRegex.test(line);
    });
}

// Update email list from textarea
emailListTextarea.addEventListener("input", () => {
  const text = emailListTextarea.value;
  emailList = parseEmailList(text);
});

// Start sending
startBtn.addEventListener("click", async () => {
  // Get email list from textarea
  const text = emailListTextarea.value;
  const emails = parseEmailList(text);

  if (emails.length === 0) {
    updateStatus("Please enter at least one valid email address", "error");
    return;
  }

  const subject = subjectInput.value.trim();
  if (!subject) {
    updateStatus("Please enter an email subject", "error");
    return;
  }

  const content = contentTextarea.value.trim();
  if (!content) {
    updateStatus("Please enter email content", "error");
    return;
  }

  // Save to storage
  await chrome.storage.local.set({
    emailList: emails,
    subject: subject,
    content: content,
  });

  // Update UI
  startBtn.disabled = true;
  stopBtn.disabled = false;
  updateStatus("Starting...", "info");
  updateProgress(0, emails.length);

  // Send message to background script
  chrome.runtime.sendMessage({
    action: "startSending",
    emails: emails,
    subject: subject,
    content: content,
  });
});

// Stop sending
stopBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "stopSending" });
  startBtn.disabled = false;
  stopBtn.disabled = true;
  updateStatus("Stopped by user", "info");
});

// Listen for updates from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "updateStatus") {
    updateStatus(message.text, message.type || "info");
  } else if (message.action === "updateProgress") {
    updateProgress(message.current, message.total);
  } else if (message.action === "sendingComplete") {
    startBtn.disabled = false;
    stopBtn.disabled = true;
    updateStatus(`Completed! Sent ${message.total} email(s)`, "success");
  } else if (message.action === "sendingStopped") {
    startBtn.disabled = false;
    stopBtn.disabled = true;
    updateStatus("Sending stopped", "info");
  }
});

function updateStatus(text, type = "info") {
  statusDiv.textContent = text;
  statusDiv.className = `status ${type}`;
}

function updateProgress(current, total) {
  progressDiv.textContent = `Progress: ${current} / ${total}`;
}
