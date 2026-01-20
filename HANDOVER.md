# n8n GitHub Backup Extension - Project Handover

**Date:** Current  
**Status:** Functional with minor improvements needed  
**Next Developer:** Please read this before making changes

---

## 🎯 Project Overview

A Chrome extension that allows users to push n8n workflows to GitHub repositories with one click. Supports multiple n8n instances, branch management, workflow pulling, and comprehensive security features.

---

## ✅ What We've Built

### Core Features
1. **Push Workflows to GitHub**
   - One-click push from workflow editor page
   - Custom commit messages with template support
   - Branch selection and creation
   - Automatic file path generation using patterns

2. **Multi-Instance Support**
   - Store settings for multiple n8n instances
   - Auto-detection based on URL
   - Instance management UI (add/edit/delete)
   - Settings persist across tabs

3. **Branch Management**
   - List branches from GitHub
   - Create new branches
   - Select branch for commits
   - Branch creation from commit modal

4. **Pull Workflows**
   - Bulk pull from settings panel
   - Single workflow pull from workflow page
   - Automatic overwrite of existing workflows (by name)
   - Conflict resolution

5. **Repository Creation**
   - Create GitHub repositories directly from settings
   - Auto-fill repository field after creation

### Security Features (Recently Implemented)
- ✅ Credential encryption (AES-GCM-256)
- ✅ Input validation for all user inputs
- ✅ Error sanitization (no sensitive data in errors)
- ✅ Rate limiting (10 requests/minute per instance)
- ✅ HTTPS enforcement (except localhost)
- ✅ XSS protection (HTML escaping)
- ✅ Minimal permissions (no `<all_urls>`)
- ✅ Content Security Policy
- ✅ Origin validation for messages

### UI/UX Features
- Settings panel in Shadow DOM (isolated from n8n UI)
- Push/Pull buttons positioned above n8n bottom bar
- Commit message modal with branch selector
- Inline branch creation input (replaced prompt)
- Notification system for user feedback
- Auto-fill n8n URL when adding new instance

---

## 🔧 Recent Fixes (Last Session)

### Fixed Issues
1. **Extension Context Invalidation**
   - Added `sendMessageSafe()` helper to handle extension reloads gracefully
   - All `chrome.runtime.sendMessage` calls now use safe wrapper
   - Shows user-friendly message when extension is reloaded

2. **Branch Creation in Commit Modal**
   - Replaced `prompt()` with proper inline input field
   - Added validation and error handling
   - Improved UX with inline error messages

3. **Instance Persistence**
   - Fixed URL normalization to handle trailing slashes, ports, case
   - Improved instance matching logic
   - Instances now persist correctly across tabs

4. **Unauthorized Origin Error**
   - Fixed `isAllowedOrigin()` to allow content script messages
   - Content scripts run in page context, so origin is page origin, not extension origin
   - Now properly detects messages from tabs

5. **Extension Not Loading on Tab Open**
   - Removed overly strict early exit logic
   - Improved `isN8nPage()` detection
   - Extension now loads on initial page load

---

## 📁 Key Files

### Core Files
- **`manifest.json`** - Extension configuration, permissions, CSP
- **`background.js`** - Service worker, API calls, storage, encryption, validation
- **`content.js`** - Content script, UI injection, DOM manipulation
- **`popup.js`** - Extension popup logic
- **`popup.html`** - Extension popup UI
- **`styles.css`** - Extension styles

### Important Functions

**background.js:**
- `sendMessageSafe()` - Safe message sender (handles context invalidation)
- `getConfig(instanceUrl)` - Get config for instance (matches by normalized URL)
- `saveConfig(config, instanceUrl)` - Save/update instance config
- `normalizeInstanceUrl(url)` - Normalize URLs for matching (handles trailing slashes, case)
- `encryptCredential()` / `decryptCredential()` - Credential encryption
- `validateN8nApiKeyFormat()` - API key validation (length check removed per user request)
- `isAllowedOrigin(origin, sender)` - Origin validation (allows content scripts)

**content.js:**
- `isN8nPage()` - Detect if on n8n page (currently checks `/workflow/` and DOM markers)
- `isWorkflowPage()` - Detect if on workflow editor page
- `sendMessageSafe()` - Safe message sender wrapper
- `showCommitMessagePrompt()` - Commit message modal with branch selector
- `injectSettingsPanel()` - Settings panel in Shadow DOM
- `injectPushButton()` - Push button injection

---

## 🐛 Known Issues / Blockers

### Minor Issues
1. **n8n Page Detection** - Currently checks for `/workflow/` paths. User confirmed they only use workflow pages, but we should verify this works for all their instances.

2. **API Key Validation** - Length validation was removed per user request. If users report issues with invalid keys, we may need to add it back with correct length requirements.

### No Critical Blockers
The extension is functional and ready for use. All major features work as expected.

---

## 🔄 What Needs to Be Done

### Immediate (If Issues Arise)
1. **Test n8n Page Detection**
   - Verify `isN8nPage()` works for all user's n8n instances
   - User's URLs: `https://high-rise-capital-n8n-hrc-submissions.el1i26.easypanel.host/workflow/uTagXwmS3IDgbJ8M`
   - Currently checks for `/workflow/` path - should work, but verify

2. **Simplify `isN8nPage()`** (User Requested)
   - Remove checks for `/executions/`, `/settings/`, `/credentials/`, `/nodes/`
   - Keep only `/workflow/` path check
   - Keep DOM markers as fallback

### Future Enhancements (Optional)
1. **OAuth2 Flow** - Currently uses PATs. OAuth2 would be more secure but requires:
   - GitHub OAuth app setup
   - OAuth flow implementation
   - Token refresh mechanism
   - More complex UI

2. **Better Error Messages** - Some error messages could be more user-friendly

3. **Settings Export/Import** - Allow users to export/import instance configurations

---

## 🧪 Testing Checklist

When testing changes, verify:
- [ ] Extension loads on initial tab open (no refresh needed)
- [ ] Settings can be saved from both popup and settings panel
- [ ] Instances persist across tabs with same URL
- [ ] Push to GitHub works with custom commit messages
- [ ] Branch creation works from commit modal
- [ ] Pull workflows works (bulk and single)
- [ ] No "Unauthorized origin" errors
- [ ] Extension handles reload gracefully (shows message, doesn't crash)

---

## 🔐 Security Notes

- **Credentials are encrypted** using AES-GCM-256 before storage
- **No sensitive data** in error messages or logs
- **Rate limiting** prevents API abuse
- **Input validation** on all user inputs
- **HTTPS enforced** (except localhost)
- **CSP** restricts script sources
- **Origin validation** for messages

**Important:** Never log or expose:
- `n8nApiKey`
- `githubToken`
- Any credentials

Use `redactSensitiveData()` and `sanitizeObject()` for logging.

---

## 📝 Code Style Notes

- Use `sendMessageSafe()` instead of `chrome.runtime.sendMessage` directly
- Always validate inputs before API calls
- Use `escapeHtml()` for user-generated content in HTML
- Use Shadow DOM for settings panel (prevents n8n UI interference)
- Use `normalizeInstanceUrl()` for URL matching
- Decrypt credentials before use, encrypt before storage

---

## 🚨 Common Pitfalls

1. **Extension Context Invalidation**
   - Always use `sendMessageSafe()` - it handles this automatically
   - If you see "Extension context invalidated" errors, check message sender

2. **Origin Validation**
   - Content scripts have page origin, not extension origin
   - `isAllowedOrigin()` checks `sender.tab` for content scripts

3. **URL Normalization**
   - Always use `normalizeInstanceUrl()` for matching
   - Handles trailing slashes, ports, case differences

4. **Credential Encryption**
   - Always encrypt before storage: `await encryptCredential(plainText)`
   - Always decrypt after retrieval: `await decryptCredential(encrypted)`
   - Check `encrypted.encrypted === true` to detect encrypted format

5. **n8n UI Interference**
   - Settings panel uses Shadow DOM to prevent interference
   - Don't use `data-n8n-ignore` attributes (Shadow DOM handles isolation)
   - Use `escapeHtml()` for URLs in UI to prevent n8n link detection

---

## 📚 Useful Resources

- **Chrome Extension Docs:** https://developer.chrome.com/docs/extensions/
- **n8n API Docs:** https://docs.n8n.io/api/
- **GitHub API Docs:** https://docs.github.com/en/rest

---

## 🎯 User's Use Case

- **Primary Use:** Push n8n workflows to GitHub
- **Instances:** Multiple n8n instances (different URLs)
- **URL Pattern:** `https://*.easypanel.host/workflow/*`
- **Only Workflow Pages:** User confirmed they only use workflow pages, not other n8n pages

---

## 📞 If You Need Help

1. Check browser console for errors
2. Check `background.js` service worker logs (chrome://extensions → service worker)
3. Check content script logs (browser console on n8n page)
4. Verify storage: `chrome.storage.local.get()` in service worker console
5. Check network requests in DevTools



The extension is in good shape. Most issues have been resolved. The main thing to watch for is any user-reported issues with n8n page detection or instance persistence. Everything else should work smoothly.

**Last Updated:** Current session  
**Status:** ✅ Functional  
**Confidence Level:** High

---

## test Credentials
https://leon-data-n8n.el1i26.easypanel.host/
sergiog@lubaphtel.net
PipCommando985!