// Content script for Gmail page interaction
// This script runs on Gmail pages and handles filling compose fields and sending emails

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "sendEmail") {
    sendEmailToRecipient(message.email, message.subject, message.content)
      .then((result) => {
        sendResponse(result);
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep channel open for async response
  } else if (message.action === "openCompose") {
    openComposeWindow()
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
});

// Open compose window
function openComposeWindow() {
  return new Promise((resolve, reject) => {
    // Check if compose window is already open by looking for the To field
    const existingToField = findToField();
    if (existingToField) {
      // Compose window is already open
      resolve();
      return;
    }

    // Check if we're already on a compose page URL
    if (window.location.hash.includes("compose=")) {
      // Wait a moment for compose window to appear
      waitForElement('input[aria-label*="To"], textarea[name="to"]', 3000)
        .then(() => resolve())
        .catch(() => {
          // Compose URL but window not loaded, try clicking compose button
          tryClickComposeButton();
        });
      return;
    }

    // Try to click compose button
    tryClickComposeButton();

    function tryClickComposeButton() {
      const composeButton =
        document.querySelector('div[role="button"][aria-label*="Compose"]') ||
        document.querySelector('div[role="button"][data-tooltip*="Compose"]') ||
        document.querySelector('div[gh="cm"]') ||
        document.querySelector('div[aria-label*="Compose" i][role="button"]');

      if (composeButton) {
        composeButton.click();

        // Wait for compose window to appear
        waitForElement('input[aria-label*="To"], textarea[name="to"]', 5000)
          .then(() => resolve())
          .catch(() => {
            // If clicking didn't work, try navigating to compose URL
            window.location.href =
              "https://mail.google.com/mail/u/0/#inbox?compose=new";
            waitForElement(
              'input[aria-label*="To"], textarea[name="to"]',
              10000,
            )
              .then(() => resolve())
              .catch(() => reject(new Error("Compose window did not open")));
          });
      } else {
        // Navigate to compose URL
        window.location.href =
          "https://mail.google.com/mail/u/0/#inbox?compose=new";
        waitForElement('input[aria-label*="To"], textarea[name="to"]', 10000)
          .then(() => resolve())
          .catch(() => reject(new Error("Compose window did not open")));
      }
    }
  });
}

// Send email to recipient
function sendEmailToRecipient(email, subject, content) {
  return new Promise((resolve, reject) => {
    // First, ensure compose window is open
    openComposeWindow()
      .then(() => {
        // Compose window is open, now fill and send
        const maxAttempts = 50;
        let attempts = 0;

        function tryFillAndSend() {
          attempts++;

          // Wait for compose window to be ready
          const toField = findToField();
          const subjectField = findSubjectField();
          const bodyField = findBodyField();

          // Find send button within the compose window context
          const sendButton = findSendButtonInCompose();

          if (toField && subjectField && bodyField && sendButton) {
            try {
              // Clear any existing content first
              clearField(toField);
              clearField(subjectField);
              clearField(bodyField);

              // Fill recipient
              fillField(toField, email);

              // Small delay to let recipient field process
              setTimeout(() => {
                // Fill subject
                fillField(subjectField, subject);

                // Fill body
                fillField(bodyField, content);

                // Wait a moment for all fields to update
                setTimeout(() => {
                  // Verify fields are filled
                  if (
                    isFieldFilled(toField, email) &&
                    isFieldFilled(subjectField, subject)
                  ) {
                    // Focus on body field first to ensure we're in the compose context
                    if (bodyField) {
                      bodyField.focus();
                    }

                    // Wait a bit more for Gmail to process the fields
                    setTimeout(() => {
                      // Try to send using keyboard shortcut first (most reliable)
                      let sendSuccess = false;

                      // Method 1: Keyboard shortcut (Ctrl+Enter) - Gmail's native shortcut
                      try {
                        // Focus on the compose window
                        const composeWindow = findComposeWindow();
                        if (composeWindow) {
                          composeWindow.focus();
                        }

                        // Dispatch Ctrl+Enter keyboard event
                        const keyboardEvent = new KeyboardEvent("keydown", {
                          key: "Enter",
                          code: "Enter",
                          keyCode: 13,
                          which: 13,
                          ctrlKey: true,
                          bubbles: true,
                          cancelable: true,
                          view: window,
                        });

                        // Try on active element, body field, and document
                        if (document.activeElement) {
                          document.activeElement.dispatchEvent(keyboardEvent);
                        }
                        if (bodyField) {
                          bodyField.dispatchEvent(keyboardEvent);
                        }
                        document.dispatchEvent(keyboardEvent);
                        sendSuccess = true;
                      } catch (e) {
                        console.log("Keyboard shortcut failed:", e);
                      }

                      // Method 2: Click send button if keyboard didn't work
                      if (!sendSuccess && sendButton) {
                        try {
                          // Scroll button into view
                          sendButton.scrollIntoView({
                            behavior: "smooth",
                            block: "center",
                          });

                          // Wait a moment, then click
                          setTimeout(() => {
                            sendButton.focus();
                            sendButton.click();

                            // Also try mouse events
                            const mouseDown = new MouseEvent("mousedown", {
                              bubbles: true,
                              cancelable: true,
                              view: window,
                              button: 0,
                            });
                            const mouseUp = new MouseEvent("mouseup", {
                              bubbles: true,
                              cancelable: true,
                              view: window,
                              button: 0,
                            });
                            const clickEvent = new MouseEvent("click", {
                              bubbles: true,
                              cancelable: true,
                              view: window,
                              button: 0,
                            });
                            sendButton.dispatchEvent(mouseDown);
                            sendButton.dispatchEvent(mouseUp);
                            sendButton.dispatchEvent(clickEvent);
                            sendSuccess = true;
                          }, 200);
                        } catch (e) {
                          console.log("Button click failed:", e);
                        }
                      }

                      // Wait for confirmation that email was sent
                      setTimeout(() => {
                        // Verify email was sent by checking if compose window is gone
                        const composeStillOpen = findToField() !== null;
                        if (!composeStillOpen) {
                          resolve({ success: true });
                        } else if (sendSuccess) {
                          // Assume success if we triggered send
                          resolve({ success: true });
                        } else {
                          // Last resort: try keyboard shortcut one more time
                          try {
                            const keyboardEvent = new KeyboardEvent("keydown", {
                              key: "Enter",
                              code: "Enter",
                              keyCode: 13,
                              which: 13,
                              ctrlKey: true,
                              bubbles: true,
                              cancelable: true,
                              view: window,
                            });
                            document.dispatchEvent(keyboardEvent);
                            resolve({ success: true });
                          } catch (e) {
                            reject(
                              new Error(
                                "Failed to send email - all methods failed",
                              ),
                            );
                          }
                        }
                      }, 2500);
                    }, 800);
                  } else {
                    if (attempts < maxAttempts) {
                      setTimeout(tryFillAndSend, 300);
                    } else {
                      reject(new Error("Failed to fill email fields"));
                    }
                  }
                }, 500);
              }, 500);
            } catch (error) {
              if (attempts < maxAttempts) {
                setTimeout(tryFillAndSend, 500);
              } else {
                reject(error);
              }
            }
          } else if (attempts < maxAttempts) {
            // Retry after a short delay
            setTimeout(tryFillAndSend, 500);
          } else {
            reject(new Error("Could not find Gmail compose fields"));
          }
        }

        // Start trying
        tryFillAndSend();
      })
      .catch((error) => {
        reject(error);
      });
  });
}

// Find recipient (To) field
function findToField() {
  return (
    document.querySelector('input[aria-label*="To"]') ||
    document.querySelector('textarea[name="to"]') ||
    document.querySelector('div[aria-label*="To"] input') ||
    document.querySelector('div[aria-label*="To"] textarea') ||
    document.querySelector('div[aria-label*="To"][contenteditable="true"]') ||
    document.querySelector('div[role="combobox"][aria-label*="To"] input') ||
    document.querySelector('div[role="combobox"][aria-label*="To"] textarea')
  );
}

// Find subject field
function findSubjectField() {
  return (
    document.querySelector('input[name="subjectbox"]') ||
    document.querySelector('input[aria-label*="Subject"]') ||
    document.querySelector('input[placeholder*="Subject"]') ||
    document.querySelector('input[aria-label*="subject" i]')
  );
}

// Find body field
function findBodyField() {
  return (
    document.querySelector('div[aria-label*="Message Body"]') ||
    document.querySelector(
      'div[contenteditable="true"][aria-label*="Message"]',
    ) ||
    document.querySelector('div[role="textbox"][aria-label*="Message"]') ||
    document.querySelector('div[contenteditable="true"].Am') ||
    document.querySelector('div[contenteditable="true"][g_editable="true"]') ||
    document.querySelector(
      'div[aria-label*="Message Body"][contenteditable="true"]',
    )
  );
}

// Find send button within compose window context
function findSendButtonInCompose() {
  // First, find the compose window/dialog
  const composeWindow = findComposeWindow();
  if (!composeWindow) {
    return findSendButton();
  }

  // Look for send button within compose window
  const selectors = [
    'div[aria-label*="Send"][role="button"]',
    'div[aria-label*="Send"]',
    'div[role="button"][aria-label*="Send"]',
    'div[data-tooltip*="Send"]',
    'div[jslog*="send"]',
    'div[jslog*="Send"]',
    'div[data-tooltip="Send ‪(Ctrl+Enter)‬"]',
    'table[role="button"][aria-label*="Send"]',
    'div[aria-label="Send"]',
    'div[aria-label="Send ‪(Ctrl+Enter)‬"]',
  ];

  for (const selector of selectors) {
    const button = composeWindow.querySelector(selector);
    if (button) {
      const style = window.getComputedStyle(button);
      if (style.display !== "none" && style.visibility !== "hidden") {
        return button;
      }
    }
  }

  // Fallback to global search
  return findSendButton();
}

// Find the compose window/dialog element
function findComposeWindow() {
  // Try to find compose window by looking for the To field's parent container
  const toField = findToField();
  if (toField) {
    // Walk up the DOM to find the compose window container
    let parent = toField.parentElement;
    let depth = 0;
    while (parent && depth < 10) {
      const role = parent.getAttribute("role");
      const className = parent.className || "";
      if (
        role === "dialog" ||
        className.includes("compose") ||
        parent.querySelector('input[aria-label*="To"]')
      ) {
        return parent;
      }
      parent = parent.parentElement;
      depth++;
    }
    // If we found the To field, return its closest container
    return (
      toField.closest('div[role="dialog"]') ||
      toField.closest('div[class*="compose"]') ||
      toField.closest("div")
    );
  }
  return null;
}

// Find send button (fallback method)
function findSendButton() {
  // Try multiple selectors - Gmail uses various structures
  const selectors = [
    'div[aria-label*="Send"][role="button"]',
    'div[aria-label*="Send"]',
    'div[role="button"][aria-label*="Send"]',
    'div[data-tooltip*="Send"]',
    'div[aria-label*="Send"] div[role="button"]',
    'div[role="button"][aria-label*="Send" i]',
    'div[jslog*="send"]',
    'div[jslog*="Send"]',
    'div[data-tooltip="Send ‪(Ctrl+Enter)‬"]',
    'table[role="button"][aria-label*="Send"]',
    'div[aria-label="Send"]',
    'div[aria-label="Send ‪(Ctrl+Enter)‬"]',
  ];

  for (const selector of selectors) {
    const button = document.querySelector(selector);
    if (button) {
      // Check if button is visible and not disabled
      const style = window.getComputedStyle(button);
      if (style.display !== "none" && style.visibility !== "hidden") {
        return button;
      }
    }
  }

  // Try to find by text content
  const allButtons = document.querySelectorAll('div[role="button"]');
  for (const button of allButtons) {
    const ariaLabel = button.getAttribute("aria-label") || "";
    const tooltip = button.getAttribute("data-tooltip") || "";
    if (
      (ariaLabel.toLowerCase().includes("send") ||
        tooltip.toLowerCase().includes("send")) &&
      !ariaLabel.toLowerCase().includes("schedule") &&
      !ariaLabel.toLowerCase().includes("save")
    ) {
      const style = window.getComputedStyle(button);
      if (style.display !== "none" && style.visibility !== "hidden") {
        return button;
      }
    }
  }

  return null;
}

// Fill a field with value (simulating user typing)
function fillField(field, value) {
  if (!field || !value) return;

  // For input/textarea elements
  if (field.tagName === "INPUT" || field.tagName === "TEXTAREA") {
    field.focus();

    // Clear first
    field.value = "";
    field.dispatchEvent(new Event("input", { bubbles: true }));

    // Simulate typing character by character for better Gmail compatibility
    let index = 0;
    const typeChar = () => {
      if (index < value.length) {
        field.value += value[index];
        field.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: value[index],
            bubbles: true,
            cancelable: true,
          }),
        );
        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.dispatchEvent(
          new KeyboardEvent("keyup", {
            key: value[index],
            bubbles: true,
            cancelable: true,
          }),
        );
        index++;
        if (index < value.length) {
          setTimeout(typeChar, 10); // Small delay between characters
        } else {
          field.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
    };

    // For short values, just set directly; for longer, simulate typing
    if (value.length < 50) {
      field.value = value;
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      typeChar();
    }
  }
  // For contenteditable divs
  else if (
    field.contentEditable === "true" ||
    field.getAttribute("contenteditable") === "true"
  ) {
    field.focus();

    // Clear first
    field.textContent = "";
    field.innerText = "";

    // Set value
    field.textContent = value;
    field.innerText = value;

    // Trigger multiple events for Gmail's React handlers
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));

    const inputEvent = new InputEvent("input", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: value,
    });
    field.dispatchEvent(inputEvent);

    // Also trigger composition events if available
    try {
      if (typeof CompositionEvent !== "undefined") {
        field.dispatchEvent(
          new CompositionEvent("compositionstart", { bubbles: true }),
        );
        field.dispatchEvent(
          new CompositionEvent("compositionupdate", {
            bubbles: true,
            data: value,
          }),
        );
        field.dispatchEvent(
          new CompositionEvent("compositionend", {
            bubbles: true,
            data: value,
          }),
        );
      }
    } catch (e) {
      // CompositionEvent not available, skip
    }
  }
}

// Clear a field
function clearField(field) {
  if (!field) return;

  if (field.tagName === "INPUT" || field.tagName === "TEXTAREA") {
    field.value = "";
    field.dispatchEvent(new Event("input", { bubbles: true }));
  } else if (field.contentEditable === "true") {
    field.textContent = "";
    field.innerText = "";
    field.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

// Check if field is filled with expected value
function isFieldFilled(field, expectedValue) {
  if (!field || !expectedValue) return false;

  if (field.tagName === "INPUT" || field.tagName === "TEXTAREA") {
    return (
      field.value.includes(expectedValue) ||
      field.value.trim() === expectedValue.trim()
    );
  } else if (field.contentEditable === "true") {
    return (
      field.textContent.includes(expectedValue) ||
      field.textContent.trim() === expectedValue.trim()
    );
  }
  return false;
}

// Wait for element to appear
function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (element) {
        observer.disconnect();
        resolve(element);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Element ${selector} not found within ${timeout}ms`));
    }, timeout);
  });
}
