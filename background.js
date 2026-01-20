// Background service worker for n8n GitHub Backup Extension

// ============================================================================
// SECURITY UTILITIES
// ============================================================================

const DEBUG = false; // Set to false in production

// Error codes
const ERROR_CODES = {
  INVALID_URL: 'ERR_INVALID_URL',
  INVALID_TOKEN: 'ERR_INVALID_TOKEN',
  NETWORK_ERROR: 'ERR_NETWORK',
  RATE_LIMIT: 'ERR_RATE_LIMIT',
  PERMISSION_DENIED: 'ERR_PERMISSION',
  VALIDATION_ERROR: 'ERR_VALIDATION'
};

// Rate Limiter
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

// Encryption utilities
let encryptionKeyCache = null;

async function getOrCreateEncryptionKey() {
  if (encryptionKeyCache) {
    return encryptionKeyCache;
  }
  
  // Get or create salt
  const storage = await chrome.storage.local.get(['encryptionSalt']);
  let salt = storage.encryptionSalt;
  
  if (!salt) {
    // Generate new salt
    salt = crypto.getRandomValues(new Uint8Array(16));
    await chrome.storage.local.set({ encryptionSalt: Array.from(salt) });
  } else {
    salt = new Uint8Array(salt);
  }
  
  // Derive key from salt using PBKDF2
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    salt,
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );
  
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  
  encryptionKeyCache = key;
  return key;
}

async function encryptCredential(text) {
  // Return empty string as-is (don't encrypt empty strings)
  if (!text || (typeof text === 'string' && text.trim() === '')) {
    return '';
  }
  
  // If not a string, return as-is
  if (typeof text !== 'string') {
    return text;
  }
  
  // Check if already encrypted
  if (typeof text === 'object' && text.encrypted) {
    return text;
  }
  
  try {
    const key = await getOrCreateEncryptionKey();
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );
    
    return {
      encrypted: true,
      iv: Array.from(iv),
      data: Array.from(new Uint8Array(encrypted))
    };
  } catch (error) {
    console.error('Encryption failed:', error);
    // Return empty string on encryption failure to prevent storing invalid data
    return '';
  }
}

async function decryptCredential(encrypted) {
  // Handle empty values
  if (!encrypted) {
    return '';
  }
  
  // If not encrypted (plain text string), return as-is (for migration)
  if (typeof encrypted === 'string') {
    return encrypted;
  }
  
  // If not an encrypted object, return empty string
  if (typeof encrypted !== 'object' || !encrypted.encrypted) {
    return '';
  }
  
  try {
    const key = await getOrCreateEncryptionKey();
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(encrypted.iv) },
      key,
      new Uint8Array(encrypted.data)
    );
    
    const decoded = new TextDecoder().decode(decrypted);
    return decoded;
  } catch (error) {
    // Always log decryption failures as they indicate a critical issue
    console.error('[n8n Extension] Decryption failed:', error);
    console.error('[n8n Extension] Encrypted data structure:', {
      hasIv: !!encrypted.iv,
      hasData: !!encrypted.data,
      ivLength: encrypted.iv?.length,
      dataLength: encrypted.data?.length,
      encryptedType: typeof encrypted
    });
    return ''; // Return empty string on failure
  }
}

// Input validation functions
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

function validateHttps(url, allowHttp = false) {
  const urlObj = new URL(url);
  
  if (urlObj.protocol === 'http:') {
    const isLocal = ['localhost', '127.0.0.1'].includes(urlObj.hostname);
    
    if (!allowHttp && !isLocal) {
      throw new Error(
        'HTTPS is required for production instances. HTTP is only allowed for localhost.'
      );
    }
    
    if (!isLocal) {
      console.warn('Using HTTP is insecure. Consider using HTTPS.');
    }
  }
  
  return true;
}

function validateGitHubRepo(repo) {
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

function validateBranchName(name) {
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

function validateCommitMessage(message) {
  if (!message || typeof message !== 'string') {
    throw new Error('Commit message must be a string');
  }
  
  if (message.length > 500) {
    throw new Error('Commit message too long (max 500 characters)');
  }
  
  // Block potentially dangerous characters
  if (/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/.test(message)) {
    throw new Error('Commit message contains invalid characters');
  }
  
  return message.trim();
}

function validateGitHubTokenFormat(token) {
  const tokenRegex = /^(ghp_|github_pat_)[A-Za-z0-9_]{20,}$/;
  
  if (!token || typeof token !== 'string') {
    throw new Error('GitHub token must be a string');
  }
  
  if (!tokenRegex.test(token)) {
    throw new Error('Invalid GitHub token format');
  }
  
  return token.trim();
}

function validateN8nApiKeyFormat(key) {
  if (!key || typeof key !== 'string') {
    throw new Error('n8n API key must be a string');
  }
  
  if (!key.trim()) {
    throw new Error('n8n API key cannot be empty');
  }
  
  return key.trim();
}

// Error sanitization
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

function createError(code, userMessage, debugDetails = null) {
  return {
    code,
    message: userMessage,
    ...(DEBUG && debugDetails ? { debug: debugDetails } : {})
  };
}

// Permission management
async function requestInstancePermission(n8nUrl) {
  try {
    const origin = new URL(n8nUrl).origin;
    const permission = { origins: [origin + '/*'] };
    
    const granted = await chrome.permissions.request(permission);
    if (!granted) {
      throw new Error('Permission denied for n8n instance');
    }
    return granted;
  } catch (error) {
    // If URL is invalid or permission already granted, continue
    return true;
  }
}

function isAllowedOrigin(origin, sender) {
  // Allow messages from extension pages (popup, options, etc.)
  if (!origin) return true;
  
  // Allow messages from content scripts (they have sender.tab)
  // Content scripts run in page context, so origin will be the page origin
  if (sender && sender.tab) {
    // This is a content script message - allow it
    // Additional validation: ensure it's from a valid tab URL
    const tabUrl = sender.url || sender.tab?.url || '';
    if (tabUrl) {
      try {
        const url = new URL(tabUrl);
        // Allow http/https URLs (n8n instances)
        if (['http:', 'https:'].includes(url.protocol)) {
          return true;
        }
      } catch (e) {
        // Invalid URL, reject
        return false;
      }
    }
    return true; // Allow content script messages
  }
  
  // Allow extension pages and GitHub API
  const allowed = [
    'chrome-extension://',
    'https://api.github.com'
  ];
  
  return allowed.some(allowedOrigin => origin.startsWith(allowedOrigin));
}

// Migration function for plain-text credentials
async function migratePlainTextCredentials() {
  const storage = await chrome.storage.local.get(['encryptionVersion', 'instanceConfigs']);
  
  // Check if already migrated
  if (storage.encryptionVersion === '1.0') {
    return;
  }
  
  try {
    // Migrate instance configs
    if (storage.instanceConfigs && Array.isArray(storage.instanceConfigs)) {
      const migrated = [];
      for (const instance of storage.instanceConfigs) {
        const migratedInstance = { ...instance };
        
        // Encrypt credentials if they're plain text
        if (typeof instance.n8nApiKey === 'string' && instance.n8nApiKey) {
          migratedInstance.n8nApiKey = await encryptCredential(instance.n8nApiKey);
        }
        if (typeof instance.githubToken === 'string' && instance.githubToken) {
          migratedInstance.githubToken = await encryptCredential(instance.githubToken);
        }
        
        migrated.push(migratedInstance);
      }
      
      await chrome.storage.local.set({ instanceConfigs: migrated });
    }
    
    // Set migration flag
    await chrome.storage.local.set({ encryptionVersion: '1.0' });
  } catch (error) {
    console.error('Migration failed:', error);
    // Don't throw - allow extension to continue
  }
}

// Initialize migration on startup
migratePlainTextCredentials();

// ============================================================================
// MESSAGE LISTENER (with security)
// ============================================================================

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Validate sender origin
  if (sender.origin && !isAllowedOrigin(sender.origin, sender)) {
    sendResponse({ success: false, error: 'Unauthorized origin' });
    return false;
  }
  
  // Validate request structure
  if (!request.action || typeof request.action !== 'string') {
    sendResponse({ success: false, error: 'Invalid request' });
    return false;
  }
  
  // Rate limiting (async, but we handle it in each handler)
  const senderUrl = sender.url || sender.tab?.url || 'unknown';
  
  if (request.action === 'pushToGit') {
    handlePushToGit(request.workflowId, request.instanceUrl, request.commitMessage, request.branch)
      .then(result => {
        // Update lastUsed timestamp for the instance
        if (request.instanceUrl) {
          updateInstanceLastUsedByUrl(request.instanceUrl).catch(() => {});
        }
        sendResponse({ success: true, ...result });
      })
      .catch(error => sendResponse({ success: false, error: sanitizeError(error, DEBUG) }));
    return true;
  }
  
  if (request.action === 'updateInstanceLastUsed') {
    updateInstanceLastUsed(request.instanceId)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: sanitizeError(error, DEBUG) }));
    return true;
  }
  
  if (request.action === 'getConfig') {
    getConfig(request.instanceUrl)
      .then(config => sendResponse({ success: true, config }))
      .catch(error => sendResponse({ success: false, error: sanitizeError(error, DEBUG) }));
    return true;
  }
  
  if (request.action === 'saveConfig') {
    saveConfig(request.config, request.instanceUrl)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: sanitizeError(error, DEBUG) }));
    return true;
  }
  
  if (request.action === 'getAllInstances') {
    getAllInstances()
      .then(instances => sendResponse({ success: true, instances }))
      .catch(error => sendResponse({ success: false, error: sanitizeError(error, DEBUG) }));
    return true;
  }
  
  if (request.action === 'getAllInstanceConfigs') {
    getAllInstanceConfigs()
      .then(configs => sendResponse({ success: true, configs }))
      .catch(error => sendResponse({ success: false, error: sanitizeError(error, DEBUG) }));
    return true;
  }
  
  if (request.action === 'getInstanceById') {
    getInstanceById(request.instanceId)
      .then(config => sendResponse({ success: true, config }))
      .catch(error => sendResponse({ success: false, error: sanitizeError(error, DEBUG) }));
    return true;
  }
  
  if (request.action === 'addInstance') {
    addInstance(request.config)
      .then(instanceId => sendResponse({ success: true, instanceId }))
      .catch(error => sendResponse({ success: false, error: sanitizeError(error, DEBUG) }));
    return true;
  }
  
  if (request.action === 'updateInstance') {
    updateInstance(request.instanceId, request.config)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: sanitizeError(error, DEBUG) }));
    return true;
  }
  
  if (request.action === 'deleteInstance') {
    deleteInstance(request.instanceId)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: sanitizeError(error, DEBUG) }));
    return true;
  }
  
  if (request.action === 'createGitHubRepo') {
    createGitHubRepo(request.owner, request.repoName, request.description, request.isPrivate, request.hasReadme, request.githubToken)
      .then(result => sendResponse({ success: true, ...result }))
      .catch(error => sendResponse({ success: false, error: sanitizeError(error, DEBUG) }));
    return true;
  }
  
  if (request.action === 'listBranches') {
    listBranches(request.owner, request.repo, request.githubToken)
      .then(branches => sendResponse({ success: true, branches }))
      .catch(error => sendResponse({ success: false, error: sanitizeError(error, DEBUG) }));
    return true;
  }
  
  if (request.action === 'createBranch') {
    createBranch(request.owner, request.repo, request.branchName, request.fromBranch, request.githubToken)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: sanitizeError(error, DEBUG) }));
    return true;
  }
  
  if (request.action === 'getDefaultBranch') {
    getDefaultBranch(request.owner, request.repo, request.githubToken)
      .then(branch => sendResponse({ success: true, branch }))
      .catch(error => sendResponse({ success: false, error: sanitizeError(error, DEBUG) }));
    return true;
  }
  
  if (request.action === 'listWorkflowFiles') {
    listWorkflowFiles(request.owner, request.repo, request.pathPattern, request.branch, request.githubToken)
      .then(files => sendResponse({ success: true, files }))
      .catch(error => sendResponse({ success: false, error: sanitizeError(error, DEBUG) }));
    return true;
  }
  
  if (request.action === 'getWorkflowFile') {
    getWorkflowFile(request.owner, request.repo, request.filePath, request.branch, request.githubToken)
      .then(content => sendResponse({ success: true, content }))
      .catch(error => sendResponse({ success: false, error: sanitizeError(error, DEBUG) }));
    return true;
  }
  
  if (request.action === 'pullWorkflowFromGitHub') {
    pullWorkflowFromGitHub(request.instanceUrl, request.filePath, request.branch)
      .then(result => sendResponse({ success: true, ...result }))
      .catch(error => sendResponse({ success: false, error: sanitizeError(error, DEBUG) }));
    return true;
  }
  
  if (request.action === 'importWorkflowToN8n') {
    importWorkflowToN8n(request.instanceUrl, request.workflowData, request.workflowName)
      .then(result => sendResponse({ success: true, ...result }))
      .catch(error => sendResponse({ success: false, error: sanitizeError(error, DEBUG) }));
    return true;
  }
  
  if (request.action === 'requestInstancePermission') {
    requestInstancePermission(request.n8nUrl)
      .then(granted => sendResponse({ success: true, granted }))
      .catch(error => sendResponse({ success: false, error: sanitizeError(error, DEBUG) }));
    return true;
  }
});

// Normalize instance URL (extract origin, handle edge cases)
function normalizeInstanceUrl(url) {
  if (!url || typeof url !== 'string') {
    return '';
  }
  
  // Remove trailing slashes
  const cleaned = url.trim().replace(/\/+$/, '');
  
  try {
    const urlObj = new URL(cleaned);
    
    // Normalize to protocol + host (includes port if present)
    // This ensures same instance with/without trailing slash matches
    const normalized = `${urlObj.protocol}//${urlObj.host}`;
    
    // Convert to lowercase for case-insensitive matching
    return normalized.toLowerCase();
  } catch (e) {
    // If URL parsing fails, try to extract base URL manually
    const match = cleaned.match(/^(https?:\/\/[^\/]+)/i);
    if (match) {
      return match[1].toLowerCase();
    }
    return cleaned.toLowerCase();
  }
}

// Get stored configuration for a specific instance URL (matches by URL)
async function getConfig(instanceUrl) {
  if (DEBUG) {
    console.log('getConfig called with instanceUrl:', instanceUrl);
  }
  
  if (!instanceUrl) {
    // Fallback to legacy global config for backward compatibility
    const result = await chrome.storage.local.get([
      'n8nUrl',
      'n8nApiKey',
      'githubRepo',
      'githubToken',
      'githubPathPattern',
      'commitMessage'
    ]);
    
    if (DEBUG) {
      console.log('Using legacy global config:', {
        hasN8nUrl: !!result.n8nUrl,
        hasApiKey: !!result.n8nApiKey,
        hasGithubRepo: !!result.githubRepo,
        hasGithubToken: !!result.githubToken
      });
    }
    
    return {
      n8nUrl: result.n8nUrl || '',
      n8nApiKey: await decryptCredential(result.n8nApiKey) || '',
      githubRepo: result.githubRepo || '',
      githubToken: await decryptCredential(result.githubToken) || '',
      githubPathPattern: result.githubPathPattern || 'workflows/{workflow-name}.json',
      commitMessage: result.commitMessage || 'Update workflow: {workflow-name}'
    };
  }
  
  // Try to find instance by matching URL
  const normalizedUrl = normalizeInstanceUrl(instanceUrl);
  const instances = await getAllInstanceConfigs();
  
  if (DEBUG) {
    console.log('Looking for instance:', {
      instanceUrl,
      normalizedUrl,
      totalInstances: instances.length,
      instanceUrls: instances.map(inst => inst.n8nUrl)
    });
  }
  
  // Find instance that matches this URL
  const matchingInstance = instances.find(inst => {
    if (!inst.n8nUrl) return false;
    const instNormalized = normalizeInstanceUrl(inst.n8nUrl);
    return instNormalized === normalizedUrl;
  });
  
  if (matchingInstance) {
    if (DEBUG) {
      console.log('Found matching instance:', {
        id: matchingInstance.id,
        n8nUrl: matchingInstance.n8nUrl,
        hasApiKey: !!matchingInstance.n8nApiKey,
        hasGithubToken: !!matchingInstance.githubToken
      });
    }
    
    // Update lastUsed timestamp
    await updateInstanceLastUsed(matchingInstance.id);
    
    const decryptedApiKey = await decryptCredential(matchingInstance.n8nApiKey);
    const decryptedGithubToken = await decryptCredential(matchingInstance.githubToken);
    
    if (DEBUG) {
      console.log('Decrypted credentials:', {
        apiKeyLength: decryptedApiKey?.length || 0,
        githubTokenLength: decryptedGithubToken?.length || 0
      });
    }
    
    return {
      n8nUrl: matchingInstance.n8nUrl || '',
      n8nApiKey: decryptedApiKey || '',
      githubRepo: matchingInstance.githubRepo || '',
      githubToken: decryptedGithubToken || '',
      githubPathPattern: matchingInstance.githubPathPattern || 'workflows/{workflow-name}.json',
      commitMessage: matchingInstance.commitMessage || 'Update workflow: {workflow-name}',
      defaultBranch: matchingInstance.defaultBranch || 'main'
    };
  }
  
  if (DEBUG) {
    console.log('No matching instance found, trying legacy storage');
  }
  
  // Fallback to legacy per-URL storage for backward compatibility
  const storageKey = `config_${normalizedUrl}`;
  const result = await chrome.storage.local.get([storageKey]);
  const config = result[storageKey] || {};
  
  return {
    n8nUrl: config.n8nUrl || '',
    n8nApiKey: await decryptCredential(config.n8nApiKey) || '',
    githubRepo: config.githubRepo || '',
    githubToken: await decryptCredential(config.githubToken) || '',
    githubPathPattern: config.githubPathPattern || 'workflows/{workflow-name}.json',
    commitMessage: config.commitMessage || 'Update workflow: {workflow-name}'
  };
}

// Save configuration for a specific instance (legacy - for backward compatibility)
async function saveConfig(config, instanceUrl) {
  // Use config.n8nUrl if available, otherwise use instanceUrl parameter
  const urlToMatch = config.n8nUrl || instanceUrl;
  
  // If no URL provided, fallback to legacy global config for backward compatibility
  if (!urlToMatch && !config.n8nUrl) {
    // Encrypt credentials before saving to legacy storage
    const encryptedApiKey = config.n8nApiKey ? await encryptCredential(config.n8nApiKey) : '';
    const encryptedGithubToken = config.githubToken ? await encryptCredential(config.githubToken) : '';
    
    await chrome.storage.local.set({
      n8nUrl: config.n8nUrl || '',
      n8nApiKey: encryptedApiKey,
      githubRepo: config.githubRepo || '',
      githubToken: encryptedGithubToken,
      githubPathPattern: config.githubPathPattern || 'workflows/{workflow-name}.json',
      commitMessage: config.commitMessage || 'Update workflow: {workflow-name}'
    });
    return;
  }
  
  if (!urlToMatch) {
    throw new Error('Instance URL is required');
  }
  
  // Try to find existing instance by URL and update it
  const normalizedUrl = normalizeInstanceUrl(urlToMatch);
  const instances = await getAllInstanceConfigs();
  const existingInstance = instances.find(inst => {
    if (!inst.n8nUrl) return false;
    const instNormalized = normalizeInstanceUrl(inst.n8nUrl);
    return instNormalized === normalizedUrl;
  });
  
  if (existingInstance) {
    // Update existing instance
    await updateInstance(existingInstance.id, config);
  } else {
    // Ensure config has n8nUrl set
    if (!config.n8nUrl) {
      config.n8nUrl = urlToMatch;
    }
    // Create new instance
    await addInstance(config);
  }
}

// Get all configured instances (returns array of URLs for backward compatibility)
async function getAllInstances() {
  const configs = await getAllInstanceConfigs();
  return configs.map(inst => normalizeInstanceUrl(inst.n8nUrl));
}

// Get all instance configurations with full details
async function getAllInstanceConfigs() {
  const result = await chrome.storage.local.get(['instanceConfigs']);
  return result.instanceConfigs || [];
}

// Get instance by ID
async function getInstanceById(instanceId) {
  const instances = await getAllInstanceConfigs();
  const instance = instances.find(inst => inst.id === instanceId);
  if (!instance) {
    throw new Error('Instance not found');
  }
  
  // Decrypt credentials before returning
  const decryptedInstance = {
    ...instance,
    n8nApiKey: await decryptCredential(instance.n8nApiKey) || '',
    githubToken: await decryptCredential(instance.githubToken) || ''
  };
  
  return decryptedInstance;
}

// Update instance lastUsed timestamp
async function updateInstanceLastUsed(instanceId) {
  if (!instanceId) return;
  
  try {
    const instances = await getAllInstanceConfigs();
    const index = instances.findIndex(inst => inst.id === instanceId);
    
    if (index !== -1) {
      instances[index].lastUsed = Date.now();
      await chrome.storage.local.set({ instanceConfigs: instances });
    }
  } catch (error) {
    console.error('Error updating lastUsed:', error);
    // Don't throw - this is not critical
  }
}

// Update instance lastUsed by URL (helper for push/pull operations)
async function updateInstanceLastUsedByUrl(instanceUrl) {
  if (!instanceUrl) return;
  
  try {
    const normalizedUrl = normalizeInstanceUrl(instanceUrl);
    const instances = await getAllInstanceConfigs();
    const matchingInstance = instances.find(inst => {
      if (!inst.n8nUrl) return false;
      const instNormalized = normalizeInstanceUrl(inst.n8nUrl);
      return instNormalized === normalizedUrl;
    });
    
    if (matchingInstance) {
      await updateInstanceLastUsed(matchingInstance.id);
    }
  } catch (error) {
    console.error('Error updating lastUsed by URL:', error);
    // Don't throw - this is not critical
  }
}

// Add a new instance
async function addInstance(config) {
  // Validate inputs
  if (config.n8nUrl) {
    validateUrl(config.n8nUrl, true); // Allow localhost
    validateHttps(config.n8nUrl, true);
  }
  if (config.githubRepo) {
    validateGitHubRepo(config.githubRepo);
  }
  if (config.githubPathPattern) {
    sanitizePathPattern(config.githubPathPattern);
  }
  if (config.githubToken) {
    validateGitHubTokenFormat(config.githubToken);
  }
  if (config.n8nApiKey) {
    validateN8nApiKeyFormat(config.n8nApiKey);
  }
  if (config.defaultBranch) {
    validateBranchName(config.defaultBranch);
  }
  if (config.commitMessage) {
    validateCommitMessage(config.commitMessage);
  }
  
  const instances = await getAllInstanceConfigs();
  
  // Generate unique ID
  const instanceId = `inst_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Normalize and clean the URL before storing
  // Store the full URL (not just origin) but normalize it for consistent matching
  let normalizedN8nUrl = config.n8nUrl || '';
  if (normalizedN8nUrl) {
    // Remove trailing slashes
    normalizedN8nUrl = normalizedN8nUrl.trim().replace(/\/+$/, '');
    // Note: We don't lowercase here because we want to preserve the original URL format
    // The normalizeInstanceUrl function handles case-insensitive matching
  }
  
  // Encrypt credentials before storing (only if they have values)
  const newInstance = {
    id: instanceId,
    n8nUrl: normalizedN8nUrl,
    n8nApiKey: (config.n8nApiKey && config.n8nApiKey.trim()) ? await encryptCredential(config.n8nApiKey) : '',
    githubRepo: config.githubRepo || '',
    githubToken: (config.githubToken && config.githubToken.trim()) ? await encryptCredential(config.githubToken) : '',
    githubPathPattern: config.githubPathPattern || 'workflows/{workflow-name}.json',
    commitMessage: config.commitMessage || 'Update workflow: {workflow-name}',
    defaultBranch: config.defaultBranch || 'main',
    lastUsed: null // Will be set when instance is first used
  };
  
  instances.push(newInstance);
  await chrome.storage.local.set({ instanceConfigs: instances });
  
  return instanceId;
}

// Update an existing instance
async function updateInstance(instanceId, config) {
  // Validate inputs
  if (config.n8nUrl !== undefined) {
    validateUrl(config.n8nUrl, true);
    validateHttps(config.n8nUrl, true);
  }
  if (config.githubRepo !== undefined) {
    validateGitHubRepo(config.githubRepo);
  }
  if (config.githubPathPattern !== undefined) {
    sanitizePathPattern(config.githubPathPattern);
  }
  if (config.githubToken !== undefined) {
    validateGitHubTokenFormat(config.githubToken);
  }
  if (config.n8nApiKey !== undefined) {
    validateN8nApiKeyFormat(config.n8nApiKey);
  }
  if (config.defaultBranch !== undefined) {
    validateBranchName(config.defaultBranch);
  }
  if (config.commitMessage !== undefined) {
    validateCommitMessage(config.commitMessage);
  }
  
  const instances = await getAllInstanceConfigs();
  const index = instances.findIndex(inst => inst.id === instanceId);
  
  if (index === -1) {
    throw new Error('Instance not found');
  }
  
  // Normalize URL if provided
  let normalizedN8nUrl = instances[index].n8nUrl;
  if (config.n8nUrl !== undefined && config.n8nUrl) {
    normalizedN8nUrl = config.n8nUrl.trim().replace(/\/+$/, '');
  }
  
  const updatedInstance = {
    ...instances[index],
    n8nUrl: normalizedN8nUrl,
    githubRepo: config.githubRepo !== undefined ? config.githubRepo : instances[index].githubRepo,
    githubPathPattern: config.githubPathPattern !== undefined ? config.githubPathPattern : instances[index].githubPathPattern,
    commitMessage: config.commitMessage !== undefined ? config.commitMessage : instances[index].commitMessage,
    defaultBranch: config.defaultBranch !== undefined ? config.defaultBranch : (instances[index].defaultBranch || 'main')
  };
  
  // Encrypt credentials if provided (only if they have a value)
  if (config.n8nApiKey !== undefined) {
    updatedInstance.n8nApiKey = config.n8nApiKey ? await encryptCredential(config.n8nApiKey) : '';
  }
  if (config.githubToken !== undefined) {
    updatedInstance.githubToken = config.githubToken ? await encryptCredential(config.githubToken) : '';
  }
  
  instances[index] = updatedInstance;
  await chrome.storage.local.set({ instanceConfigs: instances });
}

// Delete an instance
async function deleteInstance(instanceId) {
  const instances = await getAllInstanceConfigs();
  const filtered = instances.filter(inst => inst.id !== instanceId);
  
  if (filtered.length === instances.length) {
    throw new Error('Instance not found');
  }
  
  await chrome.storage.local.set({ instanceConfigs: filtered });
}

// Main function to push workflow to GitHub
async function handlePushToGit(workflowId, instanceUrl, customCommitMessage, branch) {
  // Rate limiting
  await rateLimiter.checkLimit(instanceUrl || 'unknown');
  
  // Validate inputs
  if (!workflowId || typeof workflowId !== 'string') {
    throw new Error('Invalid workflow ID');
  }
  
  // Get configuration for this instance
  const config = await getConfig(instanceUrl);
  
  // Validate configuration
  if (!config.n8nUrl) {
    throw new Error('n8n Instance URL is not configured');
  }
  if (!config.n8nApiKey) {
    throw new Error('n8n API Key is not configured');
  }
  if (!config.githubRepo) {
    throw new Error('GitHub Repository is not configured');
  }
  if (!config.githubToken) {
    throw new Error('GitHub Personal Access Token is not configured');
  }
  
  // Validate URLs and inputs
  validateUrl(config.n8nUrl, true);
  validateHttps(config.n8nUrl, true);
  validateGitHubRepo(config.githubRepo);
  if (branch) {
    validateBranchName(branch);
  }
  if (customCommitMessage) {
    validateCommitMessage(customCommitMessage);
  }
  
  // Request permission for n8n instance if needed
  await requestInstancePermission(config.n8nUrl);
  
  // Step 1: Fetch workflow from n8n API
  const n8nUrl = config.n8nUrl.replace(/\/$/, ''); // Remove trailing slash
  const workflowUrl = `${n8nUrl}/api/v1/workflows/${workflowId}`;
  
  const workflowResponse = await fetch(workflowUrl, {
    method: 'GET',
    headers: {
      'X-N8N-API-KEY': config.n8nApiKey,
      'Content-Type': 'application/json'
    }
  });
  
  if (!workflowResponse.ok) {
    const errorText = await workflowResponse.text();
    const error = new Error(sanitizeError(new Error(`Failed to fetch workflow from n8n: ${workflowResponse.status}`), DEBUG));
    error.code = ERROR_CODES.NETWORK_ERROR;
    throw error;
  }
  
  const workflowData = await workflowResponse.json();
  
  // Step 2: Prepare GitHub file path
  const workflowName = workflowData.name || `workflow-${workflowId}`;
  const sanitizedName = workflowName.replace(/[^a-zA-Z0-9-_]/g, '-');
  
  // Validate and sanitize path pattern
  const pathPattern = sanitizePathPattern(config.githubPathPattern);
  const filePath = pathPattern
    .replace('{workflow-name}', sanitizedName)
    .replace('{workflow-id}', workflowId);
  
  // Step 3: Check if file exists in GitHub (to get SHA for update)
  const [owner, repo] = config.githubRepo.split('/');
  // Already validated by validateGitHubRepo above
  
  // Use specified branch or default branch
  const targetBranch = branch || config.defaultBranch || 'main';
  const githubApiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
  
  let existingFileSha = null;
  try {
    const existingFileResponse = await fetch(`${githubApiUrl}?ref=${targetBranch}`, {
      headers: {
        'Authorization': `token ${config.githubToken}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    if (existingFileResponse.ok) {
      const existingFile = await existingFileResponse.json();
      existingFileSha = existingFile.sha;
    } else if (existingFileResponse.status !== 404) {
      const errorText = await existingFileResponse.text();
      throw new Error(`Failed to check existing file: ${existingFileResponse.status} ${errorText}`);
    }
  } catch (error) {
    // If it's a 404, file doesn't exist (that's fine)
    if (!error.message.includes('404')) {
      throw error;
    }
  }
  
  // Step 4: Prepare file content (Base64 encoded)
  const workflowJson = JSON.stringify(workflowData, null, 2);
  const base64Content = btoa(unescape(encodeURIComponent(workflowJson)));
  
  // Step 5: Prepare commit message
  let commitMessage;
  if (customCommitMessage) {
    commitMessage = customCommitMessage;
  } else {
    // Use configured commit message pattern or default
    const messageTemplate = config.commitMessage || 'Update workflow: {workflow-name}';
    commitMessage = messageTemplate
      .replace('{workflow-name}', workflowName)
      .replace('{workflow-id}', workflowId);
    
    // If it's a new file, adjust message if needed
    if (!existingFileSha && !messageTemplate.includes('Add') && !messageTemplate.includes('{action}')) {
      commitMessage = `Add workflow: ${workflowName}`;
    } else if (existingFileSha && !messageTemplate.includes('Update') && !messageTemplate.includes('{action}')) {
      commitMessage = `Update workflow: ${workflowName}`;
    }
  }
  
  const putBody = {
    message: commitMessage,
    content: base64Content,
    branch: targetBranch
  };
  
  // Only include sha if file exists (for updates)
  if (existingFileSha) {
    putBody.sha = existingFileSha;
  }
  
  const putResponse = await fetch(githubApiUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${config.githubToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(putBody)
  });
  
  if (!putResponse.ok) {
    const errorText = await putResponse.text();
    const error = new Error(sanitizeError(new Error(`Failed to push to GitHub: ${putResponse.status}`), DEBUG));
    error.code = ERROR_CODES.NETWORK_ERROR;
    throw error;
  }
  
  const result = await putResponse.json();
  
  return {
    message: existingFileSha ? 'Workflow updated in GitHub' : 'Workflow pushed to GitHub',
    filePath: filePath,
    commitUrl: result.commit.html_url,
    branch: targetBranch
  };
}

// Create GitHub repository
async function createGitHubRepo(owner, repoName, description, isPrivate, hasReadme, githubToken) {
  const url = owner.includes('/') 
    ? `https://api.github.com/orgs/${owner.split('/')[0]}/repos`
    : 'https://api.github.com/user/repos';
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `token ${githubToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: repoName,
      description: description || '',
      private: isPrivate || false,
      auto_init: hasReadme || false
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create repository: ${response.status} ${errorText}`);
  }
  
  const repo = await response.json();
  return {
    repoUrl: repo.html_url,
    repoFullName: repo.full_name,
    defaultBranch: repo.default_branch || 'main'
  };
}

// List branches for a repository
async function listBranches(owner, repo, githubToken) {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/branches`, {
    headers: {
      'Authorization': `token ${githubToken}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to list branches: ${response.status} ${errorText}`);
  }
  
  const branches = await response.json();
  return branches.map(b => b.name);
}

// Create a new branch
async function createBranch(owner, repo, branchName, fromBranch, githubToken) {
  // First, get the SHA of the branch we're creating from
  const refResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${fromBranch}`, {
    headers: {
      'Authorization': `token ${githubToken}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });
  
  if (!refResponse.ok) {
    const errorText = await refResponse.text();
    throw new Error(`Failed to get source branch: ${refResponse.status} ${errorText}`);
  }
  
  const ref = await refResponse.json();
  const sha = ref.object.sha;
  
  // Create new branch
  const createResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs`, {
    method: 'POST',
    headers: {
      'Authorization': `token ${githubToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      ref: `refs/heads/${branchName}`,
      sha: sha
    })
  });
  
  if (!createResponse.ok) {
    const errorText = await createResponse.text();
    throw new Error(`Failed to create branch: ${createResponse.status} ${errorText}`);
  }
}

// Get default branch for a repository
async function getDefaultBranch(owner, repo, githubToken) {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: {
      'Authorization': `token ${githubToken}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get repository info: ${response.status} ${errorText}`);
  }
  
  const repoInfo = await response.json();
  return repoInfo.default_branch || 'main';
}

// List workflow files in repository
async function listWorkflowFiles(owner, repo, pathPattern, branch, githubToken) {
  // Extract base path from pattern (e.g., "workflows/" from "workflows/{workflow-name}.json")
  const basePath = pathPattern.split('{')[0].replace(/\/$/, '') || '';
  const searchPath = basePath || '';
  
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${searchPath}?ref=${branch || 'main'}`, {
    headers: {
      'Authorization': `token ${githubToken}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });
  
  if (!response.ok) {
    // If path doesn't exist, return empty array
    if (response.status === 404) {
      return [];
    }
    const errorText = await response.text();
    throw new Error(`Failed to list files: ${response.status} ${errorText}`);
  }
  
  const contents = await response.json();
  const workflowFiles = [];
  
  // Filter for JSON files and recursively search if needed
  for (const item of contents) {
    if (item.type === 'file' && item.name.endsWith('.json')) {
      try {
        const fileResponse = await fetch(item.download_url);
        const fileContent = await fileResponse.json();
        workflowFiles.push({
          name: fileContent.name || item.name.replace('.json', ''),
          path: item.path,
          sha: item.sha,
          size: item.size,
          lastModified: item.updated_at || item.created_at,
          content: fileContent
        });
      } catch (e) {
        // Skip files that aren't valid JSON workflows
        continue;
      }
    } else if (item.type === 'dir') {
      // Recursively search subdirectories
      const subFiles = await listWorkflowFilesRecursive(owner, repo, pathPattern, branch, githubToken, item.path);
      workflowFiles.push(...subFiles);
    }
  }
  
  return workflowFiles;
}

// Helper for recursive directory search
async function listWorkflowFilesRecursive(owner, repo, pathPattern, branch, githubToken, currentPath) {
  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${currentPath}?ref=${branch || 'main'}`, {
      headers: {
        'Authorization': `token ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    if (!response.ok) {
      return [];
    }
    
    const contents = await response.json();
    const workflowFiles = [];
    
    // Handle both single file and directory responses
    if (!Array.isArray(contents)) {
      if (contents.type === 'file' && contents.name.endsWith('.json')) {
        try {
          const fileResponse = await fetch(contents.download_url);
          const fileContent = await fileResponse.json();
          workflowFiles.push({
            name: fileContent.name || contents.name.replace('.json', ''),
            path: contents.path,
            sha: contents.sha,
            size: contents.size,
            lastModified: contents.updated_at || contents.created_at,
            content: fileContent
          });
        } catch (e) {
          // Skip invalid JSON files
        }
      }
      return workflowFiles;
    }
    
    for (const item of contents) {
      if (item.type === 'file' && item.name.endsWith('.json')) {
        try {
          const fileResponse = await fetch(item.download_url);
          const fileContent = await fileResponse.json();
          workflowFiles.push({
            name: fileContent.name || item.name.replace('.json', ''),
            path: item.path,
            sha: item.sha,
            size: item.size,
            lastModified: item.updated_at || item.created_at,
            content: fileContent
          });
        } catch (e) {
          continue;
        }
      } else if (item.type === 'dir') {
        const subFiles = await listWorkflowFilesRecursive(owner, repo, pathPattern, branch, githubToken, item.path);
        workflowFiles.push(...subFiles);
      }
    }
    
    return workflowFiles;
  } catch (error) {
    return [];
  }
}

// Get workflow file content
async function getWorkflowFile(owner, repo, filePath, branch, githubToken) {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch || 'main'}`, {
    headers: {
      'Authorization': `token ${githubToken}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get file: ${response.status} ${errorText}`);
  }
  
  const file = await response.json();
  const content = JSON.parse(atob(file.content.replace(/\s/g, '')));
  
  return {
    name: content.name || filePath.split('/').pop().replace('.json', ''),
    path: file.path,
    sha: file.sha,
    content: content
  };
}

// Pull workflow from GitHub and return workflow data
async function pullWorkflowFromGitHub(instanceUrl, filePath, branch) {
  const config = await getConfig(instanceUrl);
  
  if (!config.githubRepo || !config.githubToken) {
    throw new Error('GitHub repository or token not configured');
  }
  
  const [owner, repo] = config.githubRepo.split('/');
  if (!owner || !repo) {
    throw new Error('Invalid GitHub repository format');
  }
  
  const targetBranch = branch || config.defaultBranch || 'main';
  return await getWorkflowFile(owner, repo, filePath, targetBranch, config.githubToken);
}

// Find workflow by name in n8n
async function findWorkflowByName(n8nUrl, apiKey, workflowName) {
  const url = `${n8nUrl.replace(/\/$/, '')}/api/v1/workflows`;
  const response = await fetch(url, {
    headers: {
      'X-N8N-API-KEY': apiKey,
      'Content-Type': 'application/json'
    }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to list workflows: ${response.status}`);
  }
  
  const workflows = await response.json();
  return workflows.data?.find(w => w.name === workflowName) || null;
}

// Import workflow to n8n (create or update)
async function importWorkflowToN8n(instanceUrl, workflowData, workflowName) {
  const config = await getConfig(instanceUrl);
  
  if (!config.n8nUrl || !config.n8nApiKey) {
    throw new Error('n8n URL or API key not configured');
  }
  
  const n8nUrl = config.n8nUrl.replace(/\/$/, '');
  
  // Try to find existing workflow by name
  const existingWorkflow = await findWorkflowByName(n8nUrl, config.n8nApiKey, workflowName);
  
  // Prepare workflow data (remove id if updating, keep if creating new)
  const workflowPayload = {
    ...workflowData,
    name: workflowName
  };
  
  if (existingWorkflow) {
    // Update existing workflow
    workflowPayload.id = existingWorkflow.id;
    const response = await fetch(`${n8nUrl}/api/v1/workflows/${existingWorkflow.id}`, {
      method: 'PUT',
      headers: {
        'X-N8N-API-KEY': config.n8nApiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(workflowPayload)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to update workflow: ${response.status} ${errorText}`);
    }
    
    const updated = await response.json();
    return {
      action: 'updated',
      workflowId: updated.id,
      workflowName: updated.name
    };
  } else {
    // Create new workflow
    delete workflowPayload.id; // Remove ID for new workflow
    const response = await fetch(`${n8nUrl}/api/v1/workflows`, {
      method: 'POST',
      headers: {
        'X-N8N-API-KEY': config.n8nApiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(workflowPayload)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create workflow: ${response.status} ${errorText}`);
    }
    
    const created = await response.json();
    return {
      action: 'created',
      workflowId: created.id,
      workflowName: created.name
    };
  }
}

