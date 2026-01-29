let sendingQueues = {}; // { tabId: { emails: [], currentIndex: 0 } }
let isSending = false;
let totalEmails = 0;
let totalSent = 0;
let delayBetweenEmails = 2500; // Base delay in ms (will be set from user input)
let accountTabs = []; // Array of Gmail tab IDs

// Returns a randomized delay (base ± 25%) to make timing less predictable
function getRandomDelay() {
  const variation = 0.25; // ±25%
  const factor = 1 + (Math.random() * 2 - 1) * variation;
  return Math.round(delayBetweenEmails * factor);
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "startSending") {
    startSending(
      message.emails,
      message.subject,
      message.content,
      message.accountRange,
      message.timeInterval,
    );
    sendResponse({ success: true });
  } else if (message.action === "stopSending") {
    stopSending();
    sendResponse({ success: true });
  } else if (message.action === "emailSent") {
    handleEmailSent(sender.tab.id);
    sendResponse({ success: true });
  } else if (message.action === "emailError") {
    handleEmailError(message.error, sender.tab.id);
    sendResponse({ success: true });
  }
  return true; // Keep channel open for async response
});

function startSending(emails, subject, content, accountRange, timeInterval) {
  totalEmails = emails.length;
  totalSent = 0;
  isSending = true;
  sendingQueues = {};
  accountTabs = [];

  // Set delay between emails (convert seconds to milliseconds)
  delayBetweenEmails = (timeInterval || 8) * 1000;

  // Save to storage
  chrome.storage.local.set({
    subject: subject,
    content: content,
    timeInterval: timeInterval || 8,
  });

  // Notify popup
  notifyPopup("updateStatus", {
    text: "Checking for Gmail tabs...",
    type: "info",
  });
  notifyPopup("updateProgress", { current: 0, total: totalEmails });

  // Find all Gmail tabs
  chrome.tabs.query({ url: "https://mail.google.com/*" }, (tabs) => {
    if (!tabs || tabs.length === 0) {
      // No Gmail tabs found
      if (accountRange) {
        notifyPopup("updateStatus", {
          text: "No Gmail tabs found. Please open Gmail tabs first.",
          type: "error",
        });
        isSending = false;
        return;
      } else {
        // Open a new Gmail tab
        notifyPopup("updateStatus", { text: "Opening Gmail...", type: "info" });
        chrome.tabs.create(
          {
            url: "https://mail.google.com/mail/u/0/#inbox?compose=new",
            active: true,
          },
          (tab) => {
            chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
              if (tabId === tab.id && info.status === "complete") {
                chrome.tabs.onUpdated.removeListener(listener);
                setTimeout(() => {
                  distributeEmailsToTabs([tab.id], emails, subject, content);
                }, 3000);
              }
            });
          },
        );
        return;
      }
    }

    // If account range is specified, use those tabs
    if (accountRange) {
      const { start, end } = accountRange;

      // Validate range
      if (start < 1 || end < start) {
        notifyPopup("updateStatus", {
          text: `Invalid account range. Start must be >= 1 and end must be >= start.`,
          type: "error",
        });
        isSending = false;
        return;
      }

      if (start > tabs.length) {
        notifyPopup("updateStatus", {
          text: `Account range ${start}-${end} is out of bounds. Only ${tabs.length} Gmail tab(s) found.`,
          type: "error",
        });
        isSending = false;
        return;
      }

      // Gmail tabs are 0-indexed in the array, but user thinks 1-indexed
      const selectedTabs = tabs.slice(start - 1, Math.min(end, tabs.length));

      if (selectedTabs.length === 0) {
        notifyPopup("updateStatus", {
          text: `No Gmail tabs found in range ${start}-${end}. Found ${tabs.length} tab(s).`,
          type: "error",
        });
        isSending = false;
        return;
      }

      accountTabs = selectedTabs.map((tab) => tab.id);
      notifyPopup("updateStatus", {
        text: `Using ${selectedTabs.length} Gmail account(s) (${start}-${end})...`,
        type: "info",
      });
    } else {
      // Use current active tab if it's Gmail, otherwise use first tab
      chrome.tabs.query({ active: true, currentWindow: true }, (activeTabs) => {
        let targetTab = null;
        if (
          activeTabs &&
          activeTabs.length > 0 &&
          activeTabs[0].url &&
          activeTabs[0].url.includes("mail.google.com")
        ) {
          targetTab = activeTabs[0];
        } else {
          targetTab = tabs[0];
        }

        if (targetTab) {
          accountTabs = [targetTab.id];
          notifyPopup("updateStatus", {
            text: "Using current Gmail tab...",
            type: "info",
          });
        } else {
          accountTabs = [tabs[0].id];
        }

        distributeEmailsToTabs(accountTabs, emails, subject, content);
      });
      return;
    }

    distributeEmailsToTabs(accountTabs, emails, subject, content);
  });
}

function distributeEmailsToTabs(tabIds, emails, subject, content) {
  const numAccounts = tabIds.length;
  const totalEmails = emails.length;

  // Calculate base emails per account and remainder
  const baseEmailsPerAccount = Math.floor(totalEmails / numAccounts);
  const remainder = totalEmails % numAccounts;

  // Distribute emails across accounts more evenly
  // First 'remainder' accounts get one extra email
  let currentIndex = 0;
  tabIds.forEach((tabId, index) => {
    const emailsForThisAccount =
      baseEmailsPerAccount + (index < remainder ? 1 : 0);
    const startIndex = currentIndex;
    const endIndex = currentIndex + emailsForThisAccount;
    const accountEmails = emails.slice(startIndex, endIndex);
    currentIndex = endIndex;

    sendingQueues[tabId] = {
      emails: accountEmails,
      currentIndex: 0,
      total: accountEmails.length,
    };

    // Activate and prepare the tab
    chrome.tabs.update(tabId, { active: false }, () => {
      // Wait a moment, then start sending from this account
      setTimeout(() => {
        chrome.tabs.sendMessage(
          tabId,
          { action: "openCompose" },
          (response) => {
            if (chrome.runtime.lastError) {
              // Content script might not be ready
              setTimeout(() => {
                startSendingFromTab(tabId, subject, content);
              }, 2000);
            } else {
              setTimeout(() => {
                startSendingFromTab(tabId, subject, content);
              }, 2000);
            }
          },
        );
      }, index * 1000); // Stagger starts by 1 second per account
    });
  });

  notifyPopup("updateStatus", {
    text: `Distributed ${emails.length} email(s) across ${numAccounts} account(s). Starting...`,
    type: "info",
  });
}

function startSendingFromTab(tabId, subject, content) {
  const queue = sendingQueues[tabId];
  if (!queue || queue.currentIndex >= queue.emails.length) {
    // This account is done
    return;
  }

  sendNextEmail(tabId, subject, content);
}

function sendNextEmail(tabId, subject, content) {
  if (!isSending) {
    return;
  }

  const queue = sendingQueues[tabId];
  if (!queue || queue.currentIndex >= queue.emails.length) {
    // This account is done, check if all accounts are done
    checkAllAccountsComplete();
    return;
  }

  const email = queue.emails[queue.currentIndex];

  notifyPopup("updateStatus", {
    text: `Account ${accountTabs.indexOf(tabId) + 1}: Sending to ${email}...`,
    type: "info",
  });
  notifyPopup("updateProgress", {
    current: totalSent,
    total: totalEmails,
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
        handleEmailError(chrome.runtime.lastError.message, tabId);
        return;
      }

      if (response && response.success) {
        // Email sent successfully
        setTimeout(() => {
          queue.currentIndex++;
          totalSent++;

          if (isSending && queue.currentIndex < queue.emails.length) {
            // Open compose window for next email
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
                            }, getRandomDelay());
                          }
                        },
                      );
                    },
                  );
                } else {
                  // Compose window opened, proceed after delay
                  setTimeout(() => {
                    sendNextEmail(tabId, subject, content);
                  }, getRandomDelay());
                }
              },
            );
          } else {
            // This account is done
            checkAllAccountsComplete();
          }
        }, 2000);
      } else {
        handleEmailError(response?.error || "Failed to send email", tabId);
      }
    },
  );
}

function handleEmailError(error, tabId) {
  notifyPopup("updateStatus", {
    text: `Error: ${error}`,
    type: "error",
  });

  const queue = sendingQueues[tabId];
  if (queue) {
    queue.currentIndex++;
    totalSent++;

    if (isSending && queue.currentIndex < queue.emails.length) {
      chrome.storage.local.get(["subject", "content"], (result) => {
        setTimeout(() => {
          chrome.tabs.sendMessage(
            tabId,
            { action: "openCompose" },
            (openResponse) => {
              if (chrome.runtime.lastError) {
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
                            sendNextEmail(
                              tabId,
                              result.subject,
                              result.content,
                            );
                          }, getRandomDelay());
                        }
                      },
                    );
                  },
                );
              } else {
                setTimeout(() => {
                  sendNextEmail(tabId, result.subject, result.content);
                }, getRandomDelay());
              }
            },
          );
        }, getRandomDelay());
      });
    } else {
      checkAllAccountsComplete();
    }
  }
}

function checkAllAccountsComplete() {
  // Check if all accounts have finished sending
  let allComplete = true;
  for (const tabId of accountTabs) {
    const queue = sendingQueues[tabId];
    if (queue && queue.currentIndex < queue.emails.length) {
      allComplete = false;
      break;
    }
  }

  if (allComplete && isSending) {
    completeSending();
  }
}

function stopSending() {
  isSending = false;
  notifyPopup("sendingStopped", {});
}

function completeSending() {
  isSending = false;
  notifyPopup("sendingComplete", { total: totalSent });
  sendingQueues = {};
  accountTabs = [];
  totalEmails = 0;
  totalSent = 0;
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
