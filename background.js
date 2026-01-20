// Background service worker for n8n GitHub Backup Extension

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'pushToGit') {
    handlePushToGit(request.workflowId)
      .then(result => sendResponse({ success: true, ...result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }
  
  if (request.action === 'getConfig') {
    getConfig()
      .then(config => sendResponse({ success: true, config }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  if (request.action === 'saveConfig') {
    saveConfig(request.config)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// Get stored configuration
async function getConfig() {
  const result = await chrome.storage.local.get([
    'n8nUrl',
    'n8nApiKey',
    'githubRepo',
    'githubToken',
    'githubPathPattern'
  ]);
  
  return {
    n8nUrl: result.n8nUrl || '',
    n8nApiKey: result.n8nApiKey || '',
    githubRepo: result.githubRepo || '',
    githubToken: result.githubToken || '',
    githubPathPattern: result.githubPathPattern || 'workflows/{workflow-name}.json'
  };
}

// Save configuration
async function saveConfig(config) {
  await chrome.storage.local.set({
    n8nUrl: config.n8nUrl || '',
    n8nApiKey: config.n8nApiKey || '',
    githubRepo: config.githubRepo || '',
    githubToken: config.githubToken || '',
    githubPathPattern: config.githubPathPattern || 'workflows/{workflow-name}.json'
  });
}

// Main function to push workflow to GitHub
async function handlePushToGit(workflowId) {
  // Get configuration
  const config = await getConfig();
  
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
  
  // Step 5: Push to GitHub
  const commitMessage = existingFileSha 
    ? `Update workflow: ${workflowName}`
    : `Add workflow: ${workflowName}`;
  
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

