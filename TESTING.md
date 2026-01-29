# Testing Guide for Gmail Auto-Email Extension

## Step 1: Load the Extension in Chrome

1. Open Google Chrome
2. Navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **"Load unpacked"** button
5. Select the `auto-emailing` folder (the folder containing `manifest.json`)
6. The extension should now appear in your extensions list

## Step 2: Prepare Test Data

### Option A: Use Textarea

- Create a simple test email list:
  ```
  test1@example.com
  test2@example.com
  test3@example.com
  ```

### Option B: Create a Test File

- Create a text file (e.g., `test-emails.txt`) with one email per line:
  ```
  test1@example.com
  test2@example.com
  test3@example.com
  ```

## Step 3: Test the Extension

1. **Open the Extension Popup**
   - Click the extension icon in Chrome's toolbar
   - The popup should open with the UI

2. **Test Email List Input**
   - Type a few test email addresses in the textarea (one per line)
   - OR click "Upload Email List File" and select your test file
   - Verify that valid emails are recognized

3. **Fill in Subject and Content**
   - Enter a test subject: `Test Email`
   - Enter test content: `This is a test email from the extension`

4. **Start Sending (IMPORTANT: Use Test Emails!)**
   - **⚠️ WARNING**: Only test with email addresses you control or test accounts
   - Click "Start Sending"
   - A new Gmail tab should open
   - The extension will automatically fill and send emails

5. **Monitor Progress**
   - Watch the status messages in the popup
   - Check the progress counter (X / Y)
   - Observe the Gmail tab to see emails being sent

6. **Test Stop Functionality**
   - Click "Stop" button while sending is in progress
   - Verify that sending stops immediately

## Step 4: Verify Email Sending

1. Check your Gmail **Sent** folder to confirm emails were sent
2. If testing with real recipients, check their inboxes
3. Verify that all emails have the same subject and content

## Step 5: Check Browser Console for Errors

1. Open Chrome DevTools (F12)
2. Go to **Console** tab
3. Look for any JavaScript errors
4. Check the **Extensions** service worker console:
   - Go to `chrome://extensions/`
   - Find your extension
   - Click "service worker" link to open the background script console

## Common Issues and Solutions

### Extension doesn't appear

- Make sure you selected the correct folder (the one with `manifest.json`)
- Check that Developer mode is enabled
- Refresh the extensions page

### Gmail fields not found

- Gmail's UI may have changed
- Check the browser console for selector errors
- The content script tries multiple selectors, but Gmail updates frequently

### Emails not sending

- Make sure you're logged into Gmail
- Check that Gmail compose window fully loads
- Verify you have internet connection
- Check browser console for errors

### Popup closes during sending

- The popup can be closed - the background script continues working
- Reopen the popup to see current status
- Progress is saved in Chrome storage

## Testing Checklist

- [ ] Extension loads without errors
- [ ] Popup UI displays correctly
- [ ] Email list textarea accepts input
- [ ] File upload works
- [ ] Email validation works (invalid emails are filtered)
- [ ] Subject and content fields accept input
- [ ] Start button opens Gmail
- [ ] Gmail compose fields are filled correctly
- [ ] Send button is clicked automatically
- [ ] Email is sent successfully
- [ ] Progress updates correctly
- [ ] Stop button works
- [ ] Multiple emails send sequentially
- [ ] Delay between emails works (2.5 seconds)

## Recommended Test Flow

1. **First Test**: Send 1 email to yourself
2. **Second Test**: Send 2-3 emails to test accounts
3. **Third Test**: Test with file upload
4. **Fourth Test**: Test stop functionality mid-send
5. **Fifth Test**: Test with a larger list (5-10 emails)

## Safety Tips

- Always test with email addresses you control first
- Start with 1-2 test emails before sending to many recipients
- Be aware that sending many emails quickly might trigger Gmail's spam detection
- The 2.5-second delay helps, but be cautious with large lists
- Consider Gmail's sending limits (typically 500 emails/day for regular accounts)
