// Popup script for n8n GitHub Backup Extension

// Input validation functions (client-side)
function validateUrl(url, allowLocalhost = false) {
  try {
    const urlObj = new URL(url);
    
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      throw new Error('Invalid protocol');
    }
    
    const hostname = urlObj.hostname;
    const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(hostname);
    const isPrivateIP = /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/.test(hostname);
    
    if ((isLocalhost || isPrivateIP) && !allowLocalhost) {
      throw new Error('Private/localhost URLs not allowed');
    }
    
    if (!urlObj.hostname || urlObj.hostname.length > 253) {
      throw new Error('Invalid hostname');
    }
    
    return true;
  } catch (e) {
    throw new Error(`Invalid URL: ${e.message}`);
  }
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

function validateGitHubToken(token) {
  const tokenRegex = /^(ghp_|github_pat_)[A-Za-z0-9_]{20,}$/;
  
  if (!token || typeof token !== 'string') {
    throw new Error('GitHub token must be a string');
  }
  
  if (!tokenRegex.test(token)) {
    throw new Error('Invalid GitHub token format');
  }
  
  return true;
}

function validateN8nApiKey(key) {
  if (!key || typeof key !== 'string') {
    throw new Error('n8n API key must be a string');
  }
  
  if (!key.trim()) {
    throw new Error('n8n API key cannot be empty');
  }
  
  return true;
}

let currentInstanceUrl = null;

// Normalize instance URL (matches background.js logic)
function normalizeInstanceUrl(url) {
  if (!url || typeof url !== 'string') {
    return '';
  }
  
  // Remove trailing slashes
  const cleaned = url.trim().replace(/\/+$/, '');
  
  try {
    const urlObj = new URL(cleaned);
    
    // Normalize to protocol + host (includes port if present)
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

// Get current tab's URL to detect instance
async function getCurrentInstanceUrl() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0] && tabs[0].url) {
      try {
        const url = new URL(tabs[0].url);
        return `${url.protocol}//${url.host}`;
      } catch (e) {
        return null;
      }
    }
  } catch (error) {
    console.error('Error getting current tab:', error);
  }
  return null;
}

// Load all instances and populate selector
async function loadInstances() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getAllInstances' });
    const instances = (response && response.success && response.instances) ? response.instances : [];
    
    const selector = document.getElementById('instance-selector');
    const selectorField = document.getElementById('instance-selector-field');
    
    if (instances.length > 0) {
      selectorField.style.display = 'block';
      selector.innerHTML = '<option value="">Select instance...</option>';
      instances.forEach(url => {
        const option = document.createElement('option');
        option.value = url;
        option.textContent = url;
        selector.appendChild(option);
      });
      
      // Set current instance if available (normalize URLs for comparison)
      const currentUrl = await getCurrentInstanceUrl();
      if (currentUrl) {
        const normalizedCurrentUrl = normalizeInstanceUrl(currentUrl);
        const matchingInstance = instances.find(inst => normalizeInstanceUrl(inst) === normalizedCurrentUrl);
        if (matchingInstance) {
          selector.value = matchingInstance;
          currentInstanceUrl = matchingInstance;
        }
      }
      
      selector.addEventListener('change', (e) => {
        currentInstanceUrl = e.target.value || null;
        loadSettings();
      });
    } else {
      selectorField.style.display = 'none';
    }
  } catch (error) {
    console.error('Error loading instances:', error);
  }
}

// Load existing settings
async function loadSettings() {
  try {
    // If no instance selected, try to get current tab's instance
    if (!currentInstanceUrl) {
      const currentUrl = await getCurrentInstanceUrl();
      if (currentUrl) {
        // Try to find matching instance by normalized URL
        const response = await chrome.runtime.sendMessage({ action: 'getAllInstances' });
        const instances = (response && response.success && response.instances) ? response.instances : [];
        const normalizedCurrentUrl = normalizeInstanceUrl(currentUrl);
        const matchingInstance = instances.find(inst => normalizeInstanceUrl(inst) === normalizedCurrentUrl);
        if (matchingInstance) {
          currentInstanceUrl = matchingInstance;
        } else {
          currentInstanceUrl = currentUrl; // Use raw URL as fallback
        }
      }
    }
    
    const response = await chrome.runtime.sendMessage({ 
      action: 'getConfig',
      instanceUrl: currentInstanceUrl
    });
    if (response && response.success && response.config) {
      const config = response.config;
      document.getElementById('n8n-url').value = config.n8nUrl || '';
      document.getElementById('n8n-api-key').value = config.n8nApiKey || '';
      document.getElementById('github-repo').value = config.githubRepo || '';
      document.getElementById('github-token').value = config.githubToken || '';
      document.getElementById('github-path-pattern').value = config.githubPathPattern || 'workflows/{workflow-name}.json';
      document.getElementById('commit-message').value = config.commitMessage || 'Update workflow: {workflow-name}';
    } else {
      // Clear fields if no config found
      document.getElementById('n8n-url').value = '';
      document.getElementById('n8n-api-key').value = '';
      document.getElementById('github-repo').value = '';
      document.getElementById('github-token').value = '';
      document.getElementById('github-path-pattern').value = 'workflows/{workflow-name}.json';
      document.getElementById('commit-message').value = 'Update workflow: {workflow-name}';
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
    showMessage('Failed to load settings', 'error');
  }
}

// Save settings
async function saveSettings() {
  // #region agent log
  fetch('http://127.0.0.1:7251/ingest/1fcf315c-cfaf-4e58-9364-1acdfd5b87b8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'popup.js:saveSettings:entry',message:'Save settings called',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C,D'})}).catch(()=>{});
  // #endregion
  
  const n8nUrl = document.getElementById('n8n-url').value.trim();
  const n8nApiKeyRaw = document.getElementById('n8n-api-key').value;
  const n8nApiKey = n8nApiKeyRaw.trim();
  const githubRepo = document.getElementById('github-repo').value.trim();
  const githubToken = document.getElementById('github-token').value.trim();
  const githubPathPattern = document.getElementById('github-path-pattern').value.trim() || 'workflows/{workflow-name}.json';
  const commitMessage = document.getElementById('commit-message').value.trim() || 'Update workflow: {workflow-name}';
  
  // #region agent log
  fetch('http://127.0.0.1:7251/ingest/1fcf315c-cfaf-4e58-9364-1acdfd5b87b8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'popup.js:saveSettings:afterTrim',message:'Values after trim',data:{n8nApiKeyRawLength:n8nApiKeyRaw?.length,n8nApiKeyLength:n8nApiKey?.length,n8nApiKeyType:typeof n8nApiKey,githubTokenLength:githubToken?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,C'})}).catch(()=>{});
  // #endregion
  
  // Validation
  try {
    if (!n8nUrl) {
      showMessage('n8n Instance URL is required', 'error');
      return;
    }
    validateUrl(n8nUrl, true); // Allow localhost
    
    if (!n8nApiKey) {
      // #region agent log
      fetch('http://127.0.0.1:7251/ingest/1fcf315c-cfaf-4e58-9364-1acdfd5b87b8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'popup.js:saveSettings:emptyKey',message:'n8n API key is empty',data:{n8nApiKey,n8nApiKeyLength:n8nApiKey?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      showMessage('n8n API Key is required', 'error');
      return;
    }
    
    // #region agent log
    fetch('http://127.0.0.1:7251/ingest/1fcf315c-cfaf-4e58-9364-1acdfd5b87b8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'popup.js:saveSettings:beforeValidation',message:'About to validate n8n API key',data:{n8nApiKeyLength:n8nApiKey.length,fieldName:'n8n-api-key'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    
    validateN8nApiKey(n8nApiKey);
    
    if (!githubRepo) {
      showMessage('GitHub Repository is required', 'error');
      return;
    }
    validateGitHubRepo(githubRepo);
    
    if (!githubToken) {
      showMessage('GitHub Personal Access Token is required', 'error');
      return;
    }
    validateGitHubToken(githubToken);
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7251/ingest/1fcf315c-cfaf-4e58-9364-1acdfd5b87b8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'popup.js:saveSettings:validationError',message:'Validation error caught',data:{errorMessage:error.message,errorStack:error.stack,errorName:error.name},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C,D,E'})}).catch(()=>{});
    // #endregion
    showMessage(error.message, 'error');
    return;
  }
  
  // #region agent log
  fetch('http://127.0.0.1:7251/ingest/1fcf315c-cfaf-4e58-9364-1acdfd5b87b8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'popup.js:saveSettings:validationPassed',message:'All validations passed, sending to background',data:{n8nApiKeyLength:n8nApiKey.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C,D,E'})}).catch(()=>{});
  // #endregion
  
  // Use n8nUrl from config as the primary identifier
  // If no instance selected, try to get current tab's instance as fallback
  const instanceUrlToUse = n8nUrl || currentInstanceUrl || await getCurrentInstanceUrl();
  
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'saveConfig',
      config: {
        n8nUrl,
        n8nApiKey,
        githubRepo,
        githubToken,
        githubPathPattern,
        commitMessage
      },
      instanceUrl: instanceUrlToUse
    });
    
    if (response && response.success) {
      showMessage('Settings saved successfully!', 'success');
    } else {
      showMessage(`Error: ${response?.error || 'Failed to save settings'}`, 'error');
    }
  } catch (error) {
    showMessage(`Error: ${error.message}`, 'error');
  }
}

// Test connection
async function testConnection() {
  const n8nUrl = document.getElementById('n8n-url').value.trim();
  const n8nApiKey = document.getElementById('n8n-api-key').value.trim();
  const githubRepo = document.getElementById('github-repo').value.trim();
  const githubToken = document.getElementById('github-token').value.trim();
  
  if (!n8nUrl || !n8nApiKey || !githubRepo || !githubToken) {
    showMessage('Please fill in all required fields first', 'error');
    return;
  }
  
  showMessage('Testing connections...', 'info');
  
  try {
    // Test n8n connection
    const n8nTestUrl = n8nUrl.replace(/\/$/, '') + '/api/v1/workflows';
    const n8nResponse = await fetch(n8nTestUrl, {
      method: 'GET',
      headers: {
        'X-N8N-API-KEY': n8nApiKey,
        'Content-Type': 'application/json'
      }
    });
    
    if (!n8nResponse.ok) {
      throw new Error(`n8n API error: ${n8nResponse.status} ${n8nResponse.statusText}`);
    }
    
    // Test GitHub connection
    const [owner, repo] = githubRepo.split('/');
    if (!owner || !repo) {
      throw new Error('Invalid GitHub repository format');
    }
    
    const githubResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        'Authorization': `token ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    if (!githubResponse.ok) {
      throw new Error(`GitHub API error: ${githubResponse.status} ${githubResponse.statusText}`);
    }
    
    showMessage('✓ Both connections successful!', 'success');
  } catch (error) {
    showMessage(`Connection test failed: ${error.message}`, 'error');
  }
}

// Show message
function showMessage(message, type) {
  const messageEl = document.getElementById('message');
  messageEl.textContent = message;
  messageEl.className = `message ${type}`;
  messageEl.style.display = 'block';
  
  if (type === 'success') {
    setTimeout(() => {
      messageEl.style.display = 'none';
    }, 3000);
  }
}

// Event listeners
document.getElementById('save-btn').addEventListener('click', saveSettings);
document.getElementById('test-btn').addEventListener('click', testConnection);

// Load instances and settings on popup open
loadInstances().then(() => {
  loadSettings();
});

