---
name: Security Hardening Plan
overview: Implement comprehensive security improvements to harden the extension against common vulnerabilities including XSS, SSRF, credential exposure, and permission abuse. Includes credential encryption at rest, permission minimization, and alignment with Chrome extension security best practices.
todos: []
---

# Security Hardening Plan

## Overview

This plan addresses multiple security vulnerabilities identified in the extension, focusing on input validation, credential protection, permission minimization, and defense-in-depth strategies. The plan aligns with Chrome extension security best practices and industry standards for credential management.

## Security Issues Identified

1. **Overly broad permissions** - `<all_urls>` host permission
2. **No credential encryption** - API keys and tokens stored in plain text
3. **Debug logging enabled** - May expose sensitive data
4. **No URL validation** - SSRF risk
5. **Weak input validation** - Path patterns, commit messages, branch names
6. **Error message leakage** - May expose sensitive information
7. **No HTTPS enforcement** - Allows insecure HTTP connections
8. **Missing Content Security Policy** - No CSP in manifest
9. **Content script runs everywhere** - Should only run on n8n pages
10. **No rate limiting** - API abuse risk
11. **No token validation** - Tokens stored without validation
12. **Sensitive data in logs** - Potential credential exposure

## Credential Management Best Practices

### Current State vs Industry Standards

| Aspect | Industry Standard | Current Implementation | Priority |
|--------|------------------|----------------------|----------|
| **Storage API** | `chrome.storage.local` | ✅ Using correctly | ✅ Aligned |
| **Encryption** | Encrypt before storage | ❌ Plain text | 🔴 Critical |
| **Permissions** | Specific domains | ❌ `<all_urls>` | 🔴 Critical |
| **Token Scope** | Minimal scopes | ⚠️ User-dependent | 🟡 Medium |
| **Error Handling** | Sanitized errors | ⚠️ May leak info | 🟡 Medium |

### Storage API Choice

- ✅ **Using `chrome.storage.local`** - Correct choice for credentials
- ❌ **Avoid `chrome.storage.sync`** - Never use for secrets (syncs to Google servers)
- ⚠️ **Consider `chrome.storage.session`** - Optional for temporary credentials (requires re-auth on restart)

## Implementation Plan

### 1. Credential Encryption at Rest ([background.js](background.js))

**Priority: CRITICAL**

Implement Web Crypto API encryption for all sensitive credentials before storage.

#### Implementation Details

- **Encryption Algorithm**: AES-GCM-256
- **Key Derivation**: Use browser profile + user interaction as entropy
- **IV Generation**: Random IV per encryption (stored with encrypted data)
- **Key Storage**: Store key derivation material, not the key itself

#### Functions to Add

```javascript
// Encryption utilities
async function getOrCreateEncryptionKey() {
  // Derive key from browser profile + stored salt
  // Use PBKDF2 or similar for key derivation
}

async function encryptCredential(text) {
  // Encrypt using AES-GCM
  // Return { iv: [...], data: [...], salt: [...] }
}

async function decryptCredential(encrypted) {
  // Decrypt using stored IV and key
  // Handle migration from plain text (one-time)
}

// Migration function for existing plain-text credentials
async function migratePlainTextCredentials() {
  // One-time migration: encrypt existing plain text credentials
  // Remove plain text after successful encryption
}
```

#### Storage Format Change

**Before:**
```javascript
{
  n8nApiKey: "plain-text-key",
  githubToken: "ghp_xxxxxxxxxxxx"
}
```

**After:**
```javascript
{
  n8nApiKey: {
    encrypted: true,
    iv: [...],
    data: [...],
    salt: [...]
  },
  githubToken: {
    encrypted: true,
    iv: [...],
    data: [...],
    salt: [...]
  }
}
```

#### Migration Strategy

1. Check for `encryptionVersion` in storage
2. If missing or version < current, run migration
3. Encrypt all plain-text credentials
4. Set `encryptionVersion` flag
5. Keep old keys temporarily for rollback (remove after verification)

### 2. Minimize Permissions ([manifest.json](manifest.json))

**Priority: CRITICAL**

#### Current Issues
- `<all_urls>` grants access to all websites
- Triggers security warnings
- Unnecessary attack surface

#### Solution: Optional Permissions Pattern

**Step 1: Remove `<all_urls>` from manifest**
```json
{
  "host_permissions": [
    "https://api.github.com/*"
  ]
}
```

**Step 2: Request n8n instance permissions dynamically**
```javascript
// In background.js or content.js
async function requestInstancePermission(n8nUrl) {
  const origin = new URL(n8nUrl).origin;
  const permission = { origins: [origin + '/*'] };
  
  const granted = await chrome.permissions.request(permission);
  if (!granted) {
    throw new Error('Permission denied for n8n instance');
  }
  return granted;
}
```

**Step 3: Update content script matches**
```json
{
  "content_scripts": [{
    "matches": [
      "*://*/workflow/*",
      "*://localhost:*/*",
      "*://127.0.0.1:*/*"
    ],
    "exclude_matches": [
      "*://api.github.com/*"
    ]
  }]
}
```

**Step 4: Add early return in content script**
```javascript
// In content.js
function isN8nPage() {
  const url = window.location.href;
  return url.includes('/workflow/') || 
         document.querySelector('[data-n8n-root]') ||
         document.querySelector('.n8n-workflow');
}

if (!isN8nPage()) {
  return; // Exit early
}
```

### 3. Input Validation & Sanitization ([background.js](background.js), [content.js](content.js), [popup.js](popup.js))

**Priority: HIGH**

#### URL Validation (SSRF Prevention)

```javascript
function validateUrl(url, allowLocalhost = false) {
  try {
    const urlObj = new URL(url);
    
    // Only allow http/https
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      throw new Error('Invalid protocol');
    }
    
    // Block private IPs unless explicitly allowed
    const hostname = urlObj.hostname;
    const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(hostname);
    const isPrivateIP = /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/.test(hostname);
    
    if ((isLocalhost || isPrivateIP) && !allowLocalhost) {
      throw new Error('Private/localhost URLs not allowed');
    }
    
    // Validate format
    if (!urlObj.hostname || urlObj.hostname.length > 253) {
      throw new Error('Invalid hostname');
    }
    
    return true;
  } catch (e) {
    throw new Error(`Invalid URL: ${e.message}`);
  }
}
```

#### GitHub Repository Validation

```javascript
function validateGitHubRepo(repo) {
  // Format: owner/repo
  const repoRegex = /^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?\/[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?$/;
  
  if (!repo || typeof repo !== 'string') {
    throw new Error('Repository must be a string');
  }
  
  if (repo.length > 100) {
    throw new Error('Repository name too long');
  }
  
  if (!repoRegex.test(repo)) {
    throw new Error('Invalid repository format. Use: owner/repo');
  }
  
  return true;
}
```

#### Path Pattern Validation (Directory Traversal Prevention)

```javascript
function sanitizePathPattern(pattern) {
  if (!pattern || typeof pattern !== 'string') {
    throw new Error('Path pattern must be a string');
  }
  
  // Block directory traversal attempts
  if (pattern.includes('..') || pattern.includes('//')) {
    throw new Error('Invalid path pattern: directory traversal detected');
  }
  
  // Block absolute paths
  if (pattern.startsWith('/') && !pattern.startsWith('./')) {
    throw new Error('Path pattern cannot start with /');
  }
  
  // Validate placeholders
  const validPlaceholders = ['{workflow-name}', '{workflow-id}'];
  const placeholders = pattern.match(/\{[^}]+\}/g) || [];
  for (const placeholder of placeholders) {
    if (!validPlaceholders.includes(placeholder)) {
      throw new Error(`Invalid placeholder: ${placeholder}`);
    }
  }
  
  // Length limit
  if (pattern.length > 200) {
    throw new Error('Path pattern too long');
  }
  
  return pattern.trim();
}
```

#### Branch Name Validation

```javascript
function validateBranchName(name) {
  // GitHub branch name rules
  const branchRegex = /^[a-zA-Z0-9._/-]+$/;
  
  if (!name || typeof name !== 'string') {
    throw new Error('Branch name must be a string');
  }
  
  if (name.length === 0 || name.length > 255) {
    throw new Error('Branch name length invalid');
  }
  
  // Cannot start/end with special chars
  if (name.startsWith('.') || name.endsWith('.') || 
      name.startsWith('/') || name.endsWith('/')) {
    throw new Error('Invalid branch name format');
  }
  
  // Cannot contain consecutive dots
  if (name.includes('..')) {
    throw new Error('Branch name cannot contain ..');
  }
  
  if (!branchRegex.test(name)) {
    throw new Error('Branch name contains invalid characters');
  }
  
  return name.trim();
}
```

#### Commit Message Validation

```javascript
function validateCommitMessage(message) {
  if (!message || typeof message !== 'string') {
    throw new Error('Commit message must be a string');
  }
  
  // Length limits (GitHub allows up to 72 chars for subject)
  if (message.length > 500) {
    throw new Error('Commit message too long (max 500 characters)');
  }
  
  // Block potentially dangerous characters
  if (/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/.test(message)) {
    throw new Error('Commit message contains invalid characters');
  }
  
  return message.trim();
}
```

#### Token Format Validation

```javascript
function validateGitHubToken(token) {
  // GitHub PAT format: ghp_xxxxxxxxxxxx (40+ chars)
  // Or: github_pat_xxxxxxxxxxxx (starts with github_pat_)
  const tokenRegex = /^(ghp_|github_pat_)[A-Za-z0-9_]{20,}$/;
  
  if (!token || typeof token !== 'string') {
    throw new Error('GitHub token must be a string');
  }
  
  if (!tokenRegex.test(token)) {
    throw new Error('Invalid GitHub token format');
  }
  
  return token.trim();
}

function validateN8nApiKey(key) {
  // n8n API keys are typically alphanumeric, 20-40 chars
  if (!key || typeof key !== 'string') {
    throw new Error('n8n API key must be a string');
  }
  
  if (key.length < 10 || key.length > 100) {
    throw new Error('Invalid n8n API key length');
  }
  
  // Basic format check (alphanumeric + some special chars)
  if (!/^[A-Za-z0-9_-]+$/.test(key)) {
    throw new Error('Invalid n8n API key format');
  }
  
  return key.trim();
}
```

### 4. Credential Protection ([background.js](background.js), [content.js](content.js))

**Priority: HIGH**

#### Debug Logging

```javascript
// In content.js
const DEBUG = false; // Set to false in production

function log(...args) {
  if (DEBUG) {
    // Redact sensitive data before logging
    const sanitized = args.map(arg => {
      if (typeof arg === 'string') {
        return redactSensitiveData(arg);
      }
      if (typeof arg === 'object') {
        return sanitizeObject(arg);
      }
      return arg;
    });
    console.log('[n8n GitHub Extension]', ...sanitized);
  }
}

function redactSensitiveData(text) {
  // Redact tokens, API keys, URLs with credentials
  return text
    .replace(/ghp_[A-Za-z0-9_]{20,}/g, 'ghp_REDACTED')
    .replace(/github_pat_[A-Za-z0-9_]{20,}/g, 'github_pat_REDACTED')
    .replace(/X-N8N-API-KEY:\s*[^\s]+/gi, 'X-N8N-API-KEY: REDACTED')
    .replace(/Authorization:\s*token\s+[^\s]+/gi, 'Authorization: token REDACTED');
}

function sanitizeObject(obj) {
  const sanitized = { ...obj };
  const sensitiveKeys = ['n8nApiKey', 'githubToken', 'apiKey', 'token', 'password'];
  
  for (const key of sensitiveKeys) {
    if (sanitized[key]) {
      sanitized[key] = '[REDACTED]';
    }
  }
  
  return sanitized;
}
```

#### Error Message Sanitization

```javascript
function sanitizeError(error, isDebug = false) {
  const errorMessage = error.message || String(error);
  
  // Always redact credentials
  let sanitized = errorMessage
    .replace(/ghp_[A-Za-z0-9_]{20,}/g, 'ghp_[REDACTED]')
    .replace(/github_pat_[A-Za-z0-9_]{20,}/g, 'github_pat_[REDACTED]')
    .replace(/token\s+[A-Za-z0-9_-]{20,}/gi, 'token [REDACTED]');
  
  // In production, remove internal details
  if (!isDebug) {
    // Remove URLs that might contain credentials
    sanitized = sanitized.replace(/https?:\/\/[^\s]+/g, '[URL_REDACTED]');
    
    // Remove stack traces
    sanitized = sanitized.split('\n')[0];
    
    // Generic error messages for common cases
    if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
      return 'Authentication failed. Please check your API keys.';
    }
    if (errorMessage.includes('403') || errorMessage.includes('Forbidden')) {
      return 'Access denied. Please check your permissions.';
    }
    if (errorMessage.includes('404')) {
      return 'Resource not found.';
    }
    if (errorMessage.includes('429')) {
      return 'Rate limit exceeded. Please try again later.';
    }
  }
  
  return sanitized;
}
```

### 5. Error Handling ([background.js](background.js))

**Priority: MEDIUM**

#### Error Code System

```javascript
const ERROR_CODES = {
  INVALID_URL: 'ERR_INVALID_URL',
  INVALID_TOKEN: 'ERR_INVALID_TOKEN',
  NETWORK_ERROR: 'ERR_NETWORK',
  RATE_LIMIT: 'ERR_RATE_LIMIT',
  PERMISSION_DENIED: 'ERR_PERMISSION',
  VALIDATION_ERROR: 'ERR_VALIDATION'
};

function createError(code, userMessage, debugDetails = null) {
  return {
    code,
    message: userMessage,
    ...(DEBUG && debugDetails ? { debug: debugDetails } : {})
  };
}

// Usage in API calls
try {
  // ... API call
} catch (error) {
  if (error.response?.status === 401) {
    throw createError(
      ERROR_CODES.INVALID_TOKEN,
      'Authentication failed. Please check your credentials.',
      { status: 401, url: sanitizeUrl(error.config?.url) }
    );
  }
  // ... other error handling
}
```

### 6. HTTPS Enforcement ([background.js](background.js))

**Priority: MEDIUM**

```javascript
function validateHttps(url, allowHttp = false) {
  const urlObj = new URL(url);
  
  if (urlObj.protocol === 'http:') {
    // Allow localhost/127.0.0.1 for development
    const isLocal = ['localhost', '127.0.0.1'].includes(urlObj.hostname);
    
    if (!allowHttp && !isLocal) {
      throw new Error(
        'HTTPS is required for production instances. ' +
        'HTTP is only allowed for localhost.'
      );
    }
    
    if (!isLocal) {
      console.warn('Using HTTP is insecure. Consider using HTTPS.');
    }
  }
  
  return true;
}
```

### 7. Content Script Optimization ([content.js](content.js))

**Priority: HIGH**

```javascript
// Early exit if not n8n page
(function() {
  'use strict';
  
  // Check if we're on an n8n page
  function isN8nPage() {
    const url = window.location.href;
    const hasWorkflowPath = url.includes('/workflow/') && !url.includes('/workflow/new');
    const hasN8nMarker = document.querySelector('[data-n8n-root]') !== null;
    const hasN8nClass = document.querySelector('.n8n-workflow') !== null;
    
    return hasWorkflowPath || hasN8nMarker || hasN8nClass;
  }
  
  // Exit early if not n8n
  if (!isN8nPage()) {
    return;
  }
  
  // Continue with extension logic...
})();
```

### 8. Rate Limiting ([background.js](background.js))

**Priority: MEDIUM**

```javascript
class RateLimiter {
  constructor(maxRequests = 10, windowMs = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = new Map(); // instanceUrl -> [timestamps]
  }
  
  async checkLimit(instanceUrl) {
    const now = Date.now();
    const key = this.normalizeUrl(instanceUrl);
    
    if (!this.requests.has(key)) {
      this.requests.set(key, []);
    }
    
    const timestamps = this.requests.get(key);
    
    // Remove old timestamps outside window
    const validTimestamps = timestamps.filter(ts => now - ts < this.windowMs);
    this.requests.set(key, validTimestamps);
    
    if (validTimestamps.length >= this.maxRequests) {
      const oldest = validTimestamps[0];
      const waitTime = this.windowMs - (now - oldest);
      throw new Error(
        `Rate limit exceeded. Please wait ${Math.ceil(waitTime / 1000)} seconds.`
      );
    }
    
    // Add current request
    validTimestamps.push(now);
    return true;
  }
  
  normalizeUrl(url) {
    try {
      return new URL(url).origin;
    } catch {
      return url;
    }
  }
}

const rateLimiter = new RateLimiter(10, 60000); // 10 requests per minute
```

### 9. Token Validation ([background.js](background.js))

**Priority: MEDIUM**

```javascript
async function validateGitHubToken(token) {
  // Format validation
  validateGitHubTokenFormat(token);
  
  // Optional: Test token validity (with user consent)
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    if (!response.ok) {
      throw new Error('Invalid GitHub token');
    }
    
    const user = await response.json();
    return {
      valid: true,
      username: user.login,
      scopes: response.headers.get('X-OAuth-Scopes')?.split(', ') || []
    };
  } catch (error) {
    throw new Error('Failed to validate GitHub token');
  }
}

async function validateN8nApiKey(n8nUrl, apiKey) {
  validateN8nApiKeyFormat(apiKey);
  
  // Optional: Test API key validity
  try {
    const response = await fetch(`${n8nUrl}/api/v1/workflows`, {
      headers: {
        'X-N8N-API-KEY': apiKey,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error('Invalid n8n API key');
    }
    
    return { valid: true };
  } catch (error) {
    throw new Error('Failed to validate n8n API key');
  }
}
```

### 10. XSS Protection ([content.js](content.js))

**Priority: HIGH**

```javascript
// Replace innerHTML with safer alternatives
function safeSetText(element, text) {
  element.textContent = text;
}

function safeSetHtml(element, html) {
  // Use DOMPurify if available, otherwise escape
  if (typeof DOMPurify !== 'undefined') {
    element.innerHTML = DOMPurify.sanitize(html);
  } else {
    element.innerHTML = escapeHtml(html);
  }
}

// Enhanced escapeHtml
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Use createElement instead of innerHTML strings
function createWorkflowItem(file) {
  const item = document.createElement('label');
  item.className = 'n8n-workflow-item';
  
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = `workflow-${file.index}`;
  
  const nameDiv = document.createElement('div');
  nameDiv.textContent = file.name; // Safe: textContent
  
  const pathDiv = document.createElement('div');
  pathDiv.textContent = `${file.path} • ${file.date}`; // Safe: textContent
  
  item.appendChild(checkbox);
  item.appendChild(nameDiv);
  item.appendChild(pathDiv);
  
  return item;
}
```

### 11. Content Security Policy ([manifest.json](manifest.json))

**Priority: MEDIUM**

```json
{
  "content_security_policy": {
    "extension_pages": "default-src 'self'; script-src 'self'; connect-src https://api.github.com https://*;"
  }
}
```

### 12. Message Listener Security ([background.js](background.js))

**Priority: MEDIUM**

```javascript
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Validate sender origin
  if (sender.origin && !isAllowedOrigin(sender.origin)) {
    sendResponse({ success: false, error: 'Unauthorized origin' });
    return false;
  }
  
  // Validate request structure
  if (!request.action || typeof request.action !== 'string') {
    sendResponse({ success: false, error: 'Invalid request' });
    return false;
  }
  
  // Rate limiting
  rateLimiter.checkLimit(sender.url || 'unknown')
    .then(() => {
      // Process request
    })
    .catch(error => {
      sendResponse({ success: false, error: error.message });
    });
  
  return true; // Keep channel open for async
});

function isAllowedOrigin(origin) {
  const allowed = [
    'chrome-extension://',
    'https://api.github.com'
  ];
  
  return allowed.some(allowedOrigin => origin.startsWith(allowedOrigin));
}
```

## Files to Modify

1. **[manifest.json](manifest.json)**
   - Remove `<all_urls>` from `host_permissions`
   - Add CSP
   - Update content script `matches` pattern
   - Add `permissions` for optional permission requests

2. **[background.js](background.js)**
   - Add encryption/decryption functions
   - Add input validation functions
   - Add error sanitization
   - Add rate limiting
   - Add token validation
   - Update all credential storage to use encryption
   - Add migration function for existing credentials

3. **[content.js](content.js)**
   - Add early return for non-n8n pages
   - Disable debug logging (`DEBUG = false`)
   - Improve XSS protection
   - Add input validation
   - Redact sensitive data in logs

4. **[popup.js](popup.js)**
   - Add input validation
   - Add error handling improvements

## Security Functions to Add

```javascript
// Encryption (background.js)
async function getOrCreateEncryptionKey()
async function encryptCredential(text)
async function decryptCredential(encrypted)
async function migratePlainTextCredentials()

// Validation (background.js, content.js, popup.js)
function validateUrl(url, allowLocalhost)
function validateGitHubRepo(repo)
function sanitizePathPattern(pattern)
function validateBranchName(name)
function validateCommitMessage(message)
function validateGitHubToken(token)
function validateN8nApiKey(key)

// Security utilities
function sanitizeError(error, isDebug)
function redactSensitiveData(text)
function sanitizeObject(obj)
function createError(code, userMessage, debugDetails)

// Rate limiting
class RateLimiter

// Permission management
async function requestInstancePermission(n8nUrl)
function isAllowedOrigin(origin)
```

## Migration Strategy

### Phase 1: Encryption Migration
1. Add encryption functions
2. Add migration function
3. On next load, detect plain-text credentials
4. Encrypt all credentials
5. Set migration flag
6. Test decryption works

### Phase 2: Permission Migration
1. Update manifest (remove `<all_urls>`)
2. Add permission request function
3. Request permissions for existing instances
4. Update content script matching

### Phase 3: Validation & Hardening
1. Add all validation functions
2. Update all input points
3. Add error sanitization
4. Disable debug logging

## Testing Considerations

- **Encryption**: Test encrypt/decrypt cycle, migration from plain text
- **Permissions**: Test optional permission requests, content script on non-n8n pages
- **Validation**: Test with malicious inputs (XSS payloads, SSRF attempts, directory traversal)
- **Error Handling**: Verify error messages don't leak sensitive data
- **Rate Limiting**: Test rate limit behavior, verify limits reset correctly
- **URL Validation**: Test with various edge cases (private IPs, localhost, invalid formats)
- **Token Validation**: Test with invalid tokens, expired tokens
- **XSS Protection**: Test with script injection attempts in all user inputs

## Security Checklist

- [ ] Credentials encrypted at rest
- [ ] Permissions minimized (no `<all_urls>`)
- [ ] Content script only runs on n8n pages
- [ ] All inputs validated and sanitized
- [ ] Error messages sanitized
- [ ] Debug logging disabled in production
- [ ] Rate limiting implemented
- [ ] Token validation added
- [ ] HTTPS enforcement (with localhost exception)
- [ ] CSP added to manifest
- [ ] Message listeners validate sender origin
- [ ] XSS protection improved (no unsafe innerHTML)

## Alignment with Industry Standards

✅ **Aligned:**
- Using `chrome.storage.local` for credentials
- Storing credentials in background script (not content script)
- Using password input types for sensitive fields

❌ **Needs Improvement:**
- Encryption at rest (critical)
- Permission model (critical)
- Input validation (high)
- Error sanitization (high)

🔄 **Optional Enhancements:**
- OAuth2 flow for GitHub (more secure than PATs)
- `chrome.storage.session` for temporary credentials
- Token refresh mechanism
- Credential scope validation UI

