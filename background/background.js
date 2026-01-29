let sendingQueue = [];
let isSending = false;
let currentIndex = 0;
let delayBetweenEmails = 2500; // 2.5 seconds

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "startSending") {
    startSending(message.emails, message.subject, message.content);
    sendResponse({ success: true });
  } else if (message.action === "stopSending") {
    stopSending();
    sendResponse({ success: true });
  } else if (message.action === "emailSent") {
    handleEmailSent();
    sendResponse({ success: true });
  } else if (message.action === "emailError") {
    handleEmailError(message.error);
    sendResponse({ success: true });
  }
  return true; // Keep channel open for async response
});

function startSending(emails, subject, content) {
  sendingQueue = emails;
  currentIndex = 0;
  isSending = true;

  // Notify popup
  notifyPopup("updateStatus", {
    text: "Checking for Gmail tab...",
    type: "info",
  });
  notifyPopup("updateProgress", { current: 0, total: emails.length });

  // First, check if user is already on a Gmail tab
  chrome.tabs.query({ url: "https://mail.google.com/*" }, (tabs) => {
    let gmailTab = null;

    // Find active Gmail tab first, or any Gmail tab
    if (tabs && tabs.length > 0) {
      // Prefer the active tab if it's Gmail
      chrome.tabs.query({ active: true, currentWindow: true }, (activeTabs) => {
        if (
          activeTabs &&
          activeTabs.length > 0 &&
          activeTabs[0].url &&
          activeTabs[0].url.includes("mail.google.com")
        ) {
          gmailTab = activeTabs[0];
        } else {
          // Use the first Gmail tab found
          gmailTab = tabs[0];
        }

        if (gmailTab) {
          // Use existing Gmail tab
          notifyPopup("updateStatus", {
            text: "Using active Gmail tab...",
            type: "info",
          });

          // Activate the tab
          chrome.tabs.update(gmailTab.id, { active: true }, () => {
            // Wait a moment for tab to be active, then start sending
            setTimeout(() => {
              // Open compose window if not already open
              chrome.tabs.sendMessage(
                gmailTab.id,
                { action: "openCompose" },
                (response) => {
                  if (chrome.runtime.lastError) {
                    // Content script might not be ready, wait a bit more
                    setTimeout(() => {
                      sendNextEmail(gmailTab.id, subject, content);
                    }, 2000);
                  } else {
                    setTimeout(() => {
                      sendNextEmail(gmailTab.id, subject, content);
                    }, 2000);
                  }
                },
              );
            }, 1000);
          });
        } else {
          // No Gmail tab found, open a new one
          notifyPopup("updateStatus", {
            text: "Opening Gmail...",
            type: "info",
          });

          chrome.tabs.create(
            {
              url: "https://mail.google.com/mail/u/0/#inbox?compose=new",
              active: true,
            },
            (tab) => {
              // Wait for tab to load and content script to be ready
              chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
                if (tabId === tab.id && info.status === "complete") {
                  chrome.tabs.onUpdated.removeListener(listener);
                  // Give Gmail a moment to fully load and content script to initialize
                  setTimeout(() => {
                    sendNextEmail(tab.id, subject, content);
                  }, 3000);
                }
              });
            },
          );
        }
      });
    } else {
      // No Gmail tab found, open a new one
      notifyPopup("updateStatus", { text: "Opening Gmail...", type: "info" });

      chrome.tabs.create(
        {
          url: "https://mail.google.com/mail/u/0/#inbox?compose=new",
          active: true,
        },
        (tab) => {
          // Wait for tab to load and content script to be ready
          chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
            if (tabId === tab.id && info.status === "complete") {
              chrome.tabs.onUpdated.removeListener(listener);
              // Give Gmail a moment to fully load and content script to initialize
              setTimeout(() => {
                sendNextEmail(tab.id, subject, content);
              }, 3000);
            }
          });
        },
      );
    }
  });
}

function sendNextEmail(tabId, subject, content) {
  if (!isSending || currentIndex >= sendingQueue.length) {
    completeSending();
    return;
  }

  const email = sendingQueue[currentIndex];

  notifyPopup("updateStatus", {
    text: `Sending to ${email}...`,
    type: "info",
  });
  notifyPopup("updateProgress", {
    current: currentIndex,
    total: sendingQueue.length,
  });

  // Send message to content script
  chrome.tabs.sendMessage(
    tabId,
    {
      action: "sendEmail",
      email: email,
      subject: subject,
      content: content,
    },
    (response) => {
      if (chrome.runtime.lastError) {
        handleEmailError(chrome.runtime.lastError.message);
        return;
      }

      if (response && response.success) {
        // Wait a moment, then proceed to next email
        setTimeout(() => {
          currentIndex++;
          if (isSending && currentIndex < sendingQueue.length) {
            // Open compose window for next email (using content script)
            chrome.tabs.sendMessage(
              tabId,
              { action: "openCompose" },
              (openResponse) => {
                if (chrome.runtime.lastError) {
                  // If content script not ready, navigate to compose URL
                  chrome.tabs.update(
                    tabId,
                    {
                      url: "https://mail.google.com/mail/u/0/#inbox?compose=new",
                    },
                    () => {
                      chrome.tabs.onUpdated.addListener(
                        function listener(updatedTabId, info) {
                          if (
                            updatedTabId === tabId &&
                            info.status === "complete"
                          ) {
                            chrome.tabs.onUpdated.removeListener(listener);
                            setTimeout(() => {
                              sendNextEmail(tabId, subject, content);
                            }, delayBetweenEmails);
                          }
                        },
                      );
                    },
                  );
                } else {
                  // Compose window opened, proceed after delay
                  setTimeout(() => {
                    sendNextEmail(tabId, subject, content);
                  }, delayBetweenEmails);
                }
              },
            );
          } else {
            completeSending();
          }
        }, 2000);
      } else {
        handleEmailError(response?.error || "Failed to send email");
      }
    },
  );
}

function handleEmailError(error) {
  notifyPopup("updateStatus", {
    text: `Error: ${error}`,
    type: "error",
  });

  // Continue with next email after error
  currentIndex++;
  if (isSending && currentIndex < sendingQueue.length) {
    chrome.storage.local.get(["subject", "content"], (result) => {
      chrome.tabs.query({ url: "https://mail.google.com/*" }, (tabs) => {
        if (tabs && tabs.length > 0) {
          const gmailTab = tabs[0];
          // Try to open compose window using content script
          chrome.tabs.sendMessage(
            gmailTab.id,
            { action: "openCompose" },
            (openResponse) => {
              if (chrome.runtime.lastError) {
                // If content script not ready, navigate to compose URL
                chrome.tabs.update(
                  gmailTab.id,
                  {
                    url: "https://mail.google.com/mail/u/0/#inbox?compose=new",
                  },
                  () => {
                    chrome.tabs.onUpdated.addListener(
                      function listener(tabId, info) {
                        if (
                          tabId === gmailTab.id &&
                          info.status === "complete"
                        ) {
                          chrome.tabs.onUpdated.removeListener(listener);
                          setTimeout(() => {
                            sendNextEmail(
                              gmailTab.id,
                              result.subject,
                              result.content,
                            );
                          }, delayBetweenEmails);
                        }
                      },
                    );
                  },
                );
              } else {
                // Compose window opened, proceed after delay
                setTimeout(() => {
                  sendNextEmail(gmailTab.id, result.subject, result.content);
                }, delayBetweenEmails);
              }
            },
          );
        }
      });
    });
  } else {
    completeSending();
  }
}

function stopSending() {
  isSending = false;
  notifyPopup("sendingStopped", {});
}

function completeSending() {
  isSending = false;
  notifyPopup("sendingComplete", { total: sendingQueue.length });
  sendingQueue = [];
  currentIndex = 0;
}

function notifyPopup(action, data) {
  chrome.runtime
    .sendMessage({
      action: action,
      ...data,
    })
    .catch(() => {
      // Popup might be closed, ignore error
    });
}
