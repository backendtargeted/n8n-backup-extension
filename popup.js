// Popup script for n8n GitHub Backup Extension

let currentInstanceUrl = null;

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
      
      // Set current instance if available
      const currentUrl = await getCurrentInstanceUrl();
      if (currentUrl && instances.includes(currentUrl)) {
        selector.value = currentUrl;
        currentInstanceUrl = currentUrl;
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
      currentInstanceUrl = await getCurrentInstanceUrl();
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
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
    showMessage('Failed to load settings', 'error');
  }
}

// Save settings
async function saveSettings() {
  const n8nUrl = document.getElementById('n8n-url').value.trim();
  const n8nApiKey = document.getElementById('n8n-api-key').value.trim();
  const githubRepo = document.getElementById('github-repo').value.trim();
  const githubToken = document.getElementById('github-token').value.trim();
  const githubPathPattern = document.getElementById('github-path-pattern').value.trim() || 'workflows/{workflow-name}.json';
  const commitMessage = document.getElementById('commit-message').value.trim() || 'Update workflow: {workflow-name}';
  
  // Validation
  if (!n8nUrl) {
    showMessage('n8n Instance URL is required', 'error');
    return;
  }
  
  if (!n8nApiKey) {
    showMessage('n8n API Key is required', 'error');
    return;
  }
  
  if (!githubRepo || !githubRepo.includes('/')) {
    showMessage('GitHub Repository must be in format: owner/repo', 'error');
    return;
  }
  
  if (!githubToken) {
    showMessage('GitHub Personal Access Token is required', 'error');
    return;
  }
  
  // If no instance selected, try to get current tab's instance
  if (!currentInstanceUrl) {
    currentInstanceUrl = await getCurrentInstanceUrl();
  }
  
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
      instanceUrl: currentInstanceUrl
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

