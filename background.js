// Background service worker for n8n GitHub Backup Extension

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'pushToGit') {
    handlePushToGit(request.workflowId, request.instanceUrl, request.commitMessage)
      .then(result => sendResponse({ success: true, ...result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }
  
  if (request.action === 'getConfig') {
    getConfig(request.instanceUrl)
      .then(config => sendResponse({ success: true, config }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  if (request.action === 'saveConfig') {
    saveConfig(request.config, request.instanceUrl)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  if (request.action === 'getAllInstances') {
    getAllInstances()
      .then(instances => sendResponse({ success: true, instances }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  if (request.action === 'getAllInstanceConfigs') {
    getAllInstanceConfigs()
      .then(configs => sendResponse({ success: true, configs }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  if (request.action === 'getInstanceById') {
    getInstanceById(request.instanceId)
      .then(config => sendResponse({ success: true, config }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  if (request.action === 'addInstance') {
    addInstance(request.config)
      .then(instanceId => sendResponse({ success: true, instanceId }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  if (request.action === 'updateInstance') {
    updateInstance(request.instanceId, request.config)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  if (request.action === 'deleteInstance') {
    deleteInstance(request.instanceId)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// Normalize instance URL (extract origin)
function normalizeInstanceUrl(url) {
  try {
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.host}`;
  } catch (e) {
    // If URL parsing fails, try to extract base URL manually
    const match = url.match(/^(https?:\/\/[^\/]+)/);
    return match ? match[1] : url;
  }
}

// Get stored configuration for a specific instance URL (matches by URL)
async function getConfig(instanceUrl) {
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
    
    return {
      n8nUrl: result.n8nUrl || '',
      n8nApiKey: result.n8nApiKey || '',
      githubRepo: result.githubRepo || '',
      githubToken: result.githubToken || '',
      githubPathPattern: result.githubPathPattern || 'workflows/{workflow-name}.json',
      commitMessage: result.commitMessage || 'Update workflow: {workflow-name}'
    };
  }
  
  // Try to find instance by matching URL
  const normalizedUrl = normalizeInstanceUrl(instanceUrl);
  const instances = await getAllInstanceConfigs();
  
  // Find instance that matches this URL
  const matchingInstance = instances.find(inst => {
    const instNormalized = normalizeInstanceUrl(inst.n8nUrl);
    return instNormalized === normalizedUrl;
  });
  
  if (matchingInstance) {
    return {
      n8nUrl: matchingInstance.n8nUrl || '',
      n8nApiKey: matchingInstance.n8nApiKey || '',
      githubRepo: matchingInstance.githubRepo || '',
      githubToken: matchingInstance.githubToken || '',
      githubPathPattern: matchingInstance.githubPathPattern || 'workflows/{workflow-name}.json',
      commitMessage: matchingInstance.commitMessage || 'Update workflow: {workflow-name}'
    };
  }
  
  // Fallback to legacy per-URL storage for backward compatibility
  const storageKey = `config_${normalizedUrl}`;
  const result = await chrome.storage.local.get([storageKey]);
  const config = result[storageKey] || {};
  
  return {
    n8nUrl: config.n8nUrl || '',
    n8nApiKey: config.n8nApiKey || '',
    githubRepo: config.githubRepo || '',
    githubToken: config.githubToken || '',
    githubPathPattern: config.githubPathPattern || 'workflows/{workflow-name}.json',
    commitMessage: config.commitMessage || 'Update workflow: {workflow-name}'
  };
}

// Save configuration for a specific instance (legacy - for backward compatibility)
async function saveConfig(config, instanceUrl) {
  if (!instanceUrl) {
    // Fallback to legacy global config for backward compatibility
    await chrome.storage.local.set({
      n8nUrl: config.n8nUrl || '',
      n8nApiKey: config.n8nApiKey || '',
      githubRepo: config.githubRepo || '',
      githubToken: config.githubToken || '',
      githubPathPattern: config.githubPathPattern || 'workflows/{workflow-name}.json',
      commitMessage: config.commitMessage || 'Update workflow: {workflow-name}'
    });
    return;
  }
  
  // Try to find existing instance by URL and update it
  const normalizedUrl = normalizeInstanceUrl(instanceUrl);
  const instances = await getAllInstanceConfigs();
  const existingInstance = instances.find(inst => {
    const instNormalized = normalizeInstanceUrl(inst.n8nUrl);
    return instNormalized === normalizedUrl;
  });
  
  if (existingInstance) {
    // Update existing instance
    await updateInstance(existingInstance.id, config);
  } else {
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
  return instance;
}

// Add a new instance
async function addInstance(config) {
  const instances = await getAllInstanceConfigs();
  
  // Generate unique ID
  const instanceId = `inst_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const newInstance = {
    id: instanceId,
    n8nUrl: config.n8nUrl || '',
    n8nApiKey: config.n8nApiKey || '',
    githubRepo: config.githubRepo || '',
    githubToken: config.githubToken || '',
    githubPathPattern: config.githubPathPattern || 'workflows/{workflow-name}.json',
    commitMessage: config.commitMessage || 'Update workflow: {workflow-name}'
  };
  
  instances.push(newInstance);
  await chrome.storage.local.set({ instanceConfigs: instances });
  
  return instanceId;
}

// Update an existing instance
async function updateInstance(instanceId, config) {
  const instances = await getAllInstanceConfigs();
  const index = instances.findIndex(inst => inst.id === instanceId);
  
  if (index === -1) {
    throw new Error('Instance not found');
  }
  
  instances[index] = {
    ...instances[index],
    n8nUrl: config.n8nUrl || instances[index].n8nUrl,
    n8nApiKey: config.n8nApiKey || instances[index].n8nApiKey,
    githubRepo: config.githubRepo || instances[index].githubRepo,
    githubToken: config.githubToken || instances[index].githubToken,
    githubPathPattern: config.githubPathPattern || instances[index].githubPathPattern,
    commitMessage: config.commitMessage || instances[index].commitMessage
  };
  
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
async function handlePushToGit(workflowId, instanceUrl, customCommitMessage) {
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
    throw new Error(`Failed to fetch workflow from n8n: ${workflowResponse.status} ${errorText}`);
  }
  
  const workflowData = await workflowResponse.json();
  
  // Step 2: Prepare GitHub file path
  const workflowName = workflowData.name || `workflow-${workflowId}`;
  const sanitizedName = workflowName.replace(/[^a-zA-Z0-9-_]/g, '-');
  const filePath = config.githubPathPattern
    .replace('{workflow-name}', sanitizedName)
    .replace('{workflow-id}', workflowId);
  
  // Step 3: Check if file exists in GitHub (to get SHA for update)
  const [owner, repo] = config.githubRepo.split('/');
  if (!owner || !repo) {
    throw new Error('Invalid GitHub repository format. Use: owner/repo');
  }
  
  const githubApiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
  
  let existingFileSha = null;
  try {
    const existingFileResponse = await fetch(githubApiUrl, {
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
  
  const putResponse = await fetch(githubApiUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${config.githubToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: commitMessage,
      content: base64Content,
      sha: existingFileSha // Required for updates, null for new files
    })
  });
  
  if (!putResponse.ok) {
    const errorText = await putResponse.text();
    throw new Error(`Failed to push to GitHub: ${putResponse.status} ${errorText}`);
  }
  
  const result = await putResponse.json();
  
  return {
    message: existingFileSha ? 'Workflow updated in GitHub' : 'Workflow pushed to GitHub',
    filePath: filePath,
    commitUrl: result.commit.html_url
  };
}

