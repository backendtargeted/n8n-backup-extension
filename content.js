// Content script for n8n GitHub Backup Extension

// Check if we're on an n8n workflow page
function isN8nPage() {
  const url = window.location.href;
  // Check URL pattern for workflow pages (exclude /workflow/new)
  const hasWorkflowPath = url.includes('/workflow/') && !url.includes('/workflow/new');
  
  // Check for n8n markers in DOM (may not be present on initial load)
  const hasN8nMarker = document.querySelector('[data-n8n-root]') !== null;
  const hasN8nClass = document.querySelector('.n8n-workflow') !== null;
  const hasN8nId = document.getElementById('n8n-app') !== null;
  
  return hasWorkflowPath || hasN8nMarker || hasN8nClass || hasN8nId;
}

const DEBUG = false; // Set to false in production

// Redact sensitive data from logs
function redactSensitiveData(text) {
  if (typeof text !== 'string') return text;
  
  return text
    .replace(/ghp_[A-Za-z0-9_]{20,}/g, 'ghp_REDACTED')
    .replace(/github_pat_[A-Za-z0-9_]{20,}/g, 'github_pat_REDACTED')
    .replace(/X-N8N-API-KEY:\s*[^\s]+/gi, 'X-N8N-API-KEY: REDACTED')
    .replace(/Authorization:\s*token\s+[^\s]+/gi, 'Authorization: token REDACTED');
}

function sanitizeObject(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  
  const sanitized = { ...obj };
  const sensitiveKeys = ['n8nApiKey', 'githubToken', 'apiKey', 'token', 'password'];
  
  for (const key of sensitiveKeys) {
    if (sanitized[key]) {
      sanitized[key] = '[REDACTED]';
    }
  }
  
  return sanitized;
}

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

// Safe message sender that handles extension context invalidation
async function sendMessageSafe(request) {
  try {
    return await chrome.runtime.sendMessage(request);
  } catch (error) {
    // Check for extension context invalidation
    const isInvalidated = error.message?.includes('Extension context invalidated') || 
                         chrome.runtime.lastError?.message?.includes('Extension context invalidated') ||
                         error.message?.includes('message port closed');
    
    if (isInvalidated) {
      // Extension was reloaded - show user-friendly message
      showNotification(
        'Extension was reloaded. Please refresh this page to continue using the extension.',
        'error'
      );
      throw new Error('Extension context invalidated. Please refresh the page.');
    }
    throw error;
  }
}

let buttonInjected = false;
let settingsPanelInjected = false;
let settingsVisible = false;

// Check if we're on a workflow page
let lastWorkflowCheck = null;
function isWorkflowPage() {
  const url = window.location.href;
  const isWorkflow = url.includes('/workflow/') && !url.includes('/workflow/new');
  // Only log when state changes
  if (lastWorkflowCheck !== isWorkflow) {
    log('Workflow page status changed:', { url, isWorkflow });
    lastWorkflowCheck = isWorkflow;
  }
  return isWorkflow;
}

// Extract workflow ID from URL (supports both numeric and alphanumeric IDs)
function getWorkflowId() {
  // Match /workflow/ followed by alphanumeric characters (n8n uses alphanumeric IDs)
  const match = window.location.href.match(/\/workflow\/([a-zA-Z0-9]+)/);
  const workflowId = match ? match[1] : null;
  log('getWorkflowId:', workflowId);
  return workflowId;
}

// Get current n8n instance URL (normalized)
function getInstanceUrl() {
  const origin = window.location.origin;
  log('getInstanceUrl:', redactSensitiveData(origin));
  return origin;
}

// Find header element with multiple strategies
function findHeader() {
  log('Finding header element...');
  
  // Strategy 1: Try common n8n selectors
  const headerSelectors = [
    '.header-right',
    '[data-test-id="workflow-header-actions"]',
    '.workflow-header .header-right',
    '.main-header .header-right',
    '.header .header-right',
    '.header-actions',
    '.workflow-header-actions',
    '[class*="header"][class*="right"]',
    '[class*="header"][class*="actions"]'
  ];
  
  for (const selector of headerSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      log('Found header with selector:', selector, element);
      // #region agent log
      const computedStyle = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      fetch('http://127.0.0.1:7251/ingest/1fcf315c-cfaf-4e58-9364-1acdfd5b87b8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'content.js:findHeader:found',message:'Header element found',data:{selector,className:element.className,display:computedStyle.display,visibility:computedStyle.visibility,opacity:computedStyle.opacity,zIndex:computedStyle.zIndex,position:computedStyle.position,top:rect.top,left:rect.left,width:rect.width,height:rect.height,isVisible:rect.width>0&&rect.height>0&&computedStyle.display!=='none'&&computedStyle.visibility!=='hidden'&&computedStyle.opacity!=='0'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,D'})}).catch(()=>{});
      // #endregion
      return element;
    }
  }
  
  // Strategy 2: Look for any header with buttons
  const headers = document.querySelectorAll('header, .header, .main-header, [class*="header"]');
  log('Found', headers.length, 'potential header elements');
  
  for (const h of headers) {
    const buttons = h.querySelectorAll('button, .el-button, [role="button"], a[class*="button"]');
    if (buttons.length > 0) {
      log('Found header with buttons:', h.className, buttons.length, 'buttons');
      // #region agent log
      const computedStyle = window.getComputedStyle(h);
      const rect = h.getBoundingClientRect();
      fetch('http://127.0.0.1:7251/ingest/1fcf315c-cfaf-4e58-9364-1acdfd5b87b8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'content.js:findHeader:foundWithButtons',message:'Header with buttons found',data:{className:h.className,buttonCount:buttons.length,display:computedStyle.display,visibility:computedStyle.visibility,opacity:computedStyle.opacity,zIndex:computedStyle.zIndex,position:computedStyle.position,top:rect.top,left:rect.left,width:rect.width,height:rect.height,isVisible:rect.width>0&&rect.height>0&&computedStyle.display!=='none'&&computedStyle.visibility!=='hidden'&&computedStyle.opacity!=='0'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,D'})}).catch(()=>{});
      // #endregion
      return h;
    }
  }
  
  // Strategy 3: Look for action buttons anywhere in the top area
  const allButtons = document.querySelectorAll('button, .el-button, [role="button"]');
  log('Found', allButtons.length, 'total buttons on page');
  
  if (allButtons.length > 0) {
    // Find the first button and try to find its parent container
    const firstButton = allButtons[0];
    let parent = firstButton.parentElement;
    let depth = 0;
    while (parent && depth < 5) {
      if (parent.classList.contains('header') || 
          parent.classList.contains('main-header') ||
          parent.getAttribute('class')?.includes('header')) {
        log('Found header via button parent:', parent);
        // #region agent log
        const computedStyle = window.getComputedStyle(parent);
        const rect = parent.getBoundingClientRect();
        fetch('http://127.0.0.1:7251/ingest/1fcf315c-cfaf-4e58-9364-1acdfd5b87b8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'content.js:findHeader:foundViaParent',message:'Header found via button parent',data:{className:parent.className,display:computedStyle.display,visibility:computedStyle.visibility,opacity:computedStyle.opacity,zIndex:computedStyle.zIndex,position:computedStyle.position,top:rect.top,left:rect.left,width:rect.width,height:rect.height,isVisible:rect.width>0&&rect.height>0&&computedStyle.display!=='none'&&computedStyle.visibility!=='hidden'&&computedStyle.opacity!=='0'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,D'})}).catch(()=>{});
        // #endregion
        return parent;
      }
      parent = parent.parentElement;
      depth++;
    }
    
    // Last resort: use the button's parent
    log('Using button parent as header:', firstButton.parentElement);
    // #region agent log
    const computedStyle = window.getComputedStyle(firstButton.parentElement);
    const rect = firstButton.parentElement.getBoundingClientRect();
    fetch('http://127.0.0.1:7251/ingest/1fcf315c-cfaf-4e58-9364-1acdfd5b87b8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'content.js:findHeader:fallbackParent',message:'Using button parent as fallback header',data:{className:firstButton.parentElement.className,display:computedStyle.display,visibility:computedStyle.visibility,opacity:computedStyle.opacity,zIndex:computedStyle.zIndex,position:computedStyle.position,top:rect.top,left:rect.left,width:rect.width,height:rect.height,isVisible:rect.width>0&&rect.height>0&&computedStyle.display!=='none'&&computedStyle.visibility!=='hidden'&&computedStyle.opacity!=='0'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,D'})}).catch(()=>{});
    // #endregion
    return firstButton.parentElement;
  }
  
  log('No header found, will try to inject at body level');
  // #region agent log
  fetch('http://127.0.0.1:7251/ingest/1fcf315c-cfaf-4e58-9364-1acdfd5b87b8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'content.js:findHeader:notFound',message:'No header found',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  return null;
}

// Inject the Push to GitHub button
function injectPushButton() {
  if (buttonInjected) {
    log('Push button already injected, skipping');
    return;
  }
  
  log('Attempting to inject push button...');
  
  const header = findHeader();
  
  // Check if header is visible before using it
  let useFixedPosition = false;
  if (header) {
    const headerRect = header.getBoundingClientRect();
    const headerStyle = window.getComputedStyle(header);
    const isHeaderVisible = headerRect.width > 0 && 
                           headerRect.height > 0 && 
                           headerStyle.display !== 'none' && 
                           headerStyle.visibility !== 'hidden' &&
                           headerStyle.opacity !== '0';
    
    // #region agent log
    fetch('http://127.0.0.1:7251/ingest/1fcf315c-cfaf-4e58-9364-1acdfd5b87b8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'content.js:injectPushButton:headerCheck',message:'Checking header visibility',data:{headerClassName:header.className,headerWidth:headerRect.width,headerHeight:headerRect.height,headerDisplay:headerStyle.display,headerVisibility:headerStyle.visibility,headerOpacity:headerStyle.opacity,isHeaderVisible,timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    if (!isHeaderVisible) {
      log('Header found but not visible, using fixed position fallback');
      useFixedPosition = true;
    }
  } else {
    useFixedPosition = true;
  }
  
  if (document.getElementById('n8n-github-sync-btn')) {
    log('Push button already exists in DOM');
    buttonInjected = true;
    return;
  }
  
  const container = createPushButton();
  
  // Always use fixed position to ensure visibility
  // Position at bottom right, above the bottom bar
  log('Injecting button with fixed position at bottom');
  container.style.cssText = 'position: fixed; bottom: 60px; right: 10px; z-index: 99999; display: flex; align-items: center; gap: 4px;';
  document.body.appendChild(container);
  buttonInjected = true;
  log('Push button injected with fixed position at bottom');
  
  // #region agent log
  setTimeout(() => {
    const btn = document.getElementById('n8n-github-sync-btn');
    const btnExists = !!btn;
    const containerExists = !!container.parentElement;
    let btnComputed = null, containerComputed = null, btnRect = null, containerRect = null;
    if (btn) {
      btnComputed = window.getComputedStyle(btn);
      btnRect = btn.getBoundingClientRect();
    }
    if (container.parentElement) {
      containerComputed = window.getComputedStyle(container);
      containerRect = container.getBoundingClientRect();
    }
    fetch('http://127.0.0.1:7251/ingest/1fcf315c-cfaf-4e58-9364-1acdfd5b87b8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'content.js:injectPushButton:afterFixedInsert',message:'After fixed position injection - verification',data:{btnExists,containerExists,btnDisplay:btnComputed?.display,btnVisibility:btnComputed?.visibility,btnOpacity:btnComputed?.opacity,btnZIndex:btnComputed?.zIndex,btnTop:btnRect?.top,btnLeft:btnRect?.left,btnWidth:btnRect?.width,btnHeight:btnRect?.height,btnIsVisible:btnRect?.width>0&&btnRect?.height>0&&btnComputed?.display!=='none'&&btnComputed?.visibility!=='hidden'&&btnComputed?.opacity!=='0',containerDisplay:containerComputed?.display,containerVisibility:containerComputed?.visibility,containerOpacity:containerComputed?.opacity,containerZIndex:containerComputed?.zIndex,containerTop:containerRect?.top,containerLeft:containerRect?.left,containerWidth:containerRect?.width,containerHeight:containerRect?.height,containerIsVisible:containerRect?.width>0&&containerRect?.height>0&&containerComputed?.display!=='none'&&containerComputed?.visibility!=='hidden'&&containerComputed?.opacity!=='0'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B,C,D,E'})}).catch(()=>{});
  }, 100);
  // #endregion
}

// Create the push button element
function createPushButton() {
  const container = document.createElement('div');
  container.style.cssText = 'display: inline-flex; align-items: center; gap: 4px; margin-right: 8px;';
  
  const btn = document.createElement('button');
  btn.id = 'n8n-github-sync-btn';
  btn.className = 'n8n-github-sync-btn';
  btn.innerHTML = 'Push to GitHub';
  btn.title = 'Push workflow to GitHub (Right-click for settings)';
  
  // Add settings icon button
  const settingsIcon = document.createElement('button');
  settingsIcon.id = 'n8n-github-settings-icon';
  settingsIcon.className = 'n8n-github-settings-btn';
  settingsIcon.innerHTML = '⚙️';
  settingsIcon.title = 'Configure GitHub backup settings';
  settingsIcon.style.cssText = 'padding: 6px 8px; font-size: 14px;';
  
  settingsIcon.addEventListener('click', (e) => {
    e.stopPropagation();
    log('Settings icon clicked');
    toggleSettingsPanel();
  });
  
  // Right-click on push button opens settings
  btn.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    log('Push button right-clicked');
    toggleSettingsPanel();
  });
  
  btn.addEventListener('click', async () => {
    log('Push button clicked');
    
    // Check if settings are configured first
    const instanceUrl = getInstanceUrl();
    let config = null;
    try {
      const configResponse = await sendMessageSafe({ 
        action: 'getConfig',
        instanceUrl: instanceUrl
      });
      if (configResponse && configResponse.success && configResponse.config) {
        config = configResponse.config;
        if (!config.n8nUrl || !config.n8nApiKey || !config.githubRepo || !config.githubToken) {
          log('Settings not configured, opening settings panel');
          showNotification('Please configure settings first', 'error');
          toggleSettingsPanel();
          return;
        }
      }
    } catch (error) {
      log('Error checking config:', error);
    }
    
    const workflowId = getWorkflowId();
    if (!workflowId) {
      showNotification('Error: Could not detect workflow ID', 'error');
      return;
    }
    
    // Show commit message prompt
    const commitResult = await showCommitMessagePrompt(config);
    if (commitResult === null) {
      // User cancelled
      return;
    }
    
    const commitMessage = commitResult.message;
    const branch = commitResult.branch;
    
    btn.disabled = true;
    btn.innerHTML = 'Pushing...';
    
    try {
      log('Sending message to background script...');
      const response = await sendMessageSafe({
        action: 'pushToGit',
        workflowId: workflowId,
        instanceUrl: instanceUrl,
        commitMessage: commitMessage || undefined,
        branch: branch || undefined
      });
      
      log('Response from background:', JSON.stringify(response, null, 2));
      
      if (response && response.success) {
        const message = response.message || 'Successfully pushed to GitHub!';
        showNotification(message, 'success');
        if (response.commitUrl) {
          log('Commit URL:', response.commitUrl);
        }
        if (response.filePath) {
          log('File path:', response.filePath);
        }
      } else {
        const errorMsg = response?.error || 'Unknown error';
        log('Error response:', errorMsg);
        
        // If error is about missing config, open settings
        if (errorMsg.includes('not configured') || errorMsg.includes('required')) {
          showNotification('Please configure settings first', 'error');
          toggleSettingsPanel();
        } else {
          showNotification(`Error: ${errorMsg}`, 'error');
        }
      }
    } catch (error) {
      log('Error pushing to GitHub:', error);
      showNotification(`Error: ${error.message}`, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = 'Push to GitHub';
    }
  });
  
  // Add Pull from GitHub button
  const pullBtn = document.createElement('button');
  pullBtn.id = 'n8n-github-pull-btn';
  pullBtn.className = 'n8n-github-sync-btn';
  pullBtn.innerHTML = 'Pull from GitHub';
  pullBtn.title = 'Pull workflow from GitHub';
  pullBtn.style.cssText = 'background: #10b981; margin-right: 8px;';
  
  pullBtn.addEventListener('click', async () => {
    log('Pull button clicked');
    
    const instanceUrl = getInstanceUrl();
    const workflowId = getWorkflowId();
    
    if (!workflowId) {
      showNotification('Error: Could not detect workflow ID', 'error');
      return;
    }
    
    try {
      const configResponse = await sendMessageSafe({ 
        action: 'getConfig',
        instanceUrl: instanceUrl
      });
      
      if (!configResponse || !configResponse.success || !configResponse.config) {
        showNotification('Settings not configured', 'error');
        return;
      }
      
      const config = configResponse.config;
      if (!config.n8nUrl || !config.n8nApiKey || !config.githubRepo || !config.githubToken) {
        showNotification('Settings not configured', 'error');
        return;
      }
      
      // Use workflow ID directly in path pattern (don't need to fetch workflow name)
      // The GitHub file should match the pattern with workflow-id
      const filePath = config.githubPathPattern
        .replace('{workflow-id}', workflowId)
        .replace('{workflow-name}', `workflow-${workflowId}`); // Fallback if workflow-name not in pattern
      
      pullBtn.disabled = true;
      pullBtn.innerHTML = 'Pulling...';
      
      const pullResponse = await sendMessageSafe({
        action: 'pullWorkflowFromGitHub',
        instanceUrl: instanceUrl,
        filePath: filePath,
        branch: config.defaultBranch || 'main'
      });
      
      if (pullResponse && pullResponse.success) {
        // Import workflow to n8n
        // Use the workflow ID from the current page instead of searching by name
        const importResponse = await sendMessageSafe({
          action: 'importWorkflowToN8n',
          instanceUrl: instanceUrl,
          workflowData: pullResponse.content.content,
          workflowName: pullResponse.content.name,
          workflowId: workflowId // Pass the current workflow ID to update it directly
        });
        
        if (importResponse && importResponse.success) {
          const action = importResponse.action === 'updated' ? 'updated' : 'imported';
          showNotification(`Workflow ${action} successfully!`, 'success');
          // Reload page to show updated workflow
          setTimeout(() => {
            window.location.reload();
          }, 1500);
        } else {
          throw new Error(importResponse?.error || 'Failed to import workflow');
        }
      } else {
        throw new Error(pullResponse?.error || 'Failed to pull workflow');
      }
    } catch (error) {
      log('Error pulling workflow:', error);
      showNotification(`Error: ${error.message}`, 'error');
    } finally {
      pullBtn.disabled = false;
      pullBtn.innerHTML = 'Pull from GitHub';
    }
  });
  
  container.appendChild(btn);
  container.appendChild(pullBtn);
  container.appendChild(settingsIcon);
  
  return container;
}

// Inject settings button
function injectSettingsButton() {
  if (settingsPanelInjected) {
    log('Settings button already injected, skipping');
    return;
  }
  
  log('Attempting to inject settings button...');
  
  const header = findHeader();
  
  if (!header) {
    log('No header found for settings button');
    // Inject to body as fallback
    const existingBtn = document.getElementById('n8n-github-settings-btn');
    if (!existingBtn) {
      const btn = createSettingsButton();
      btn.style.cssText += 'position: fixed; top: 50px; right: 10px; z-index: 9999;';
      document.body.appendChild(btn);
      settingsPanelInjected = true;
    }
    return;
  }
  
  if (document.getElementById('n8n-github-settings-btn')) {
    log('Settings button already exists in DOM');
    settingsPanelInjected = true;
    return;
  }
  
  const btn = createSettingsButton();
  
  try {
    const pushBtn = document.getElementById('n8n-github-sync-btn');
    if (pushBtn && pushBtn.nextSibling) {
      header.insertBefore(btn, pushBtn.nextSibling);
    } else if (pushBtn) {
      header.insertBefore(btn, pushBtn);
    } else {
      if (header.firstChild) {
        header.insertBefore(btn, header.firstChild);
      } else {
        header.appendChild(btn);
      }
    }
    settingsPanelInjected = true;
    log('Settings button injected successfully');
  } catch (error) {
    log('Error injecting settings button:', error);
    btn.style.cssText += 'position: fixed; top: 50px; right: 10px; z-index: 9999;';
    document.body.appendChild(btn);
    settingsPanelInjected = true;
  }
}

// Create settings button element
function createSettingsButton() {
  const btn = document.createElement('button');
  btn.id = 'n8n-github-settings-btn';
  btn.className = 'n8n-github-settings-btn';
  btn.innerHTML = '⚙️ Settings';
  btn.title = 'Configure GitHub backup settings';
  
  btn.addEventListener('click', () => {
    log('Settings button clicked');
    toggleSettingsPanel();
  });
  
  return btn;
}

let currentEditingInstanceId = null;
let settingsPanelShadowRoot = null;

// Get or create settings panel shadow root
function getSettingsPanelShadowRoot() {
  if (settingsPanelShadowRoot) {
    return settingsPanelShadowRoot;
  }
  
  // Check if host element already exists
  let host = document.getElementById('n8n-github-settings-panel-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'n8n-github-settings-panel-host';
    host.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 10000; pointer-events: none;';
    document.body.appendChild(host);
  }
  
  // Create shadow root if it doesn't exist
  if (!host.shadowRoot) {
    settingsPanelShadowRoot = host.attachShadow({ mode: 'open' });
    log('Shadow root created for settings panel');
  } else {
    settingsPanelShadowRoot = host.shadowRoot;
  }
  
  return settingsPanelShadowRoot;
}

// Inject CSS into shadow DOM
function injectSettingsStyles(shadowRoot) {
  // Check if styles already injected
  if (shadowRoot.querySelector('style#n8n-settings-styles')) {
    return;
  }
  
  // Read styles from the CSS file (we'll inline them)
  // For now, we'll create a style element with all the necessary styles
  const style = document.createElement('style');
  style.id = 'n8n-settings-styles';
  style.textContent = `
    .n8n-github-settings-panel {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      backdrop-filter: blur(2px);
      pointer-events: auto;
    }
    
    .n8n-github-settings-content {
      background: white;
      border-radius: 8px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
      width: 90%;
      max-width: 1200px;
      height: 90vh;
      display: flex;
      animation: slideIn 0.2s ease;
      overflow: hidden;
    }
    
    .n8n-settings-sidebar {
      width: 350px;
      border-right: 1px solid #e5e7eb;
      display: flex;
      flex-direction: column;
      background: #f9fafb;
    }
    
    .n8n-settings-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      border-bottom: 1px solid #e5e7eb;
      background: white;
    }
    
    .n8n-settings-header h3 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      color: #1f2937;
    }
    
    .n8n-settings-close {
      background: none;
      border: none;
      font-size: 24px;
      color: #6b7280;
      cursor: pointer;
      padding: 4px;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: background-color 0.2s ease;
    }
    
    .n8n-settings-close:hover {
      background: #f3f4f6;
      color: #1f2937;
    }
    
    .n8n-settings-search {
      padding: 12px 20px;
      border-bottom: 1px solid #e5e7eb;
      background: white;
    }
    
    .n8n-settings-search input {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 14px;
      box-sizing: border-box;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }
    
    .n8n-settings-search input:focus {
      outline: none;
      border-color: #6366f1;
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
    }
    
    .n8n-instance-list-container {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
    }
    
    .n8n-settings-sidebar-footer {
      padding: 16px 20px;
      border-top: 1px solid #e5e7eb;
      background: white;
    }
    
    .n8n-add-instance-btn {
      width: 100%;
      padding: 10px 16px;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      background: #6366f1;
      color: white;
      transition: background-color 0.2s ease;
    }
    
    .n8n-add-instance-btn:hover {
      background: #4f46e5;
    }
    
    .n8n-settings-details-panel {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: white;
    }
    
    .n8n-details-header {
      padding: 20px;
      border-bottom: 1px solid #e5e7eb;
    }
    
    .n8n-details-header h4 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      color: #1f2937;
    }
    
    .n8n-details-content {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
    }
    
    .n8n-empty-state {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #6b7280;
      font-size: 14px;
    }
    
    .n8n-instance-item {
      cursor: pointer;
      padding: 12px;
      border-radius: 6px;
      margin-bottom: 8px;
      transition: background-color 0.2s ease, border-color 0.2s ease;
      border: 1px solid transparent;
    }
    
    .n8n-instance-item:hover {
      background: #f3f4f6;
    }
    
    .n8n-instance-item.selected {
      background: #ede9fe;
      border-color: #6366f1;
    }
    
    .n8n-instance-item.selected .n8n-instance-url {
      color: #6366f1;
    }
    
    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(-20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    .n8n-github-settings-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px;
      border-bottom: 1px solid #e5e7eb;
    }
    
    .n8n-github-settings-header h3 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      color: #1f2937;
    }
    
    .n8n-github-settings-close {
      background: none;
      border: none;
      font-size: 28px;
      color: #6b7280;
      cursor: pointer;
      padding: 0;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: background-color 0.2s ease;
    }
    
    .n8n-github-settings-close:hover {
      background: #f3f4f6;
      color: #1f2937;
    }
    
    .n8n-github-settings-body {
      padding: 20px;
    }
    
    .n8n-github-settings-field {
      margin-bottom: 20px;
    }
    
    .n8n-github-settings-field label {
      display: block;
      margin-bottom: 6px;
      font-weight: 500;
      color: #374151;
      font-size: 14px;
    }
    
    .n8n-github-settings-field input,
    .n8n-github-settings-field textarea {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 14px;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
      box-sizing: border-box;
      font-family: inherit;
    }
    
    .n8n-github-settings-field textarea {
      resize: vertical;
    }
    
    .n8n-github-settings-field input:focus,
    .n8n-github-settings-field textarea:focus {
      outline: none;
      border-color: #6366f1;
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
    }
    
    .n8n-github-settings-field small {
      display: block;
      margin-top: 4px;
      color: #6b7280;
      font-size: 12px;
    }
    
    .n8n-github-settings-actions {
      display: flex;
      gap: 12px;
      margin-top: 24px;
    }
    
    .n8n-github-settings-save,
    .n8n-github-settings-cancel {
      flex: 1;
      padding: 10px 16px;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: background-color 0.2s ease;
    }
    
    .n8n-github-settings-save {
      background: #6366f1;
      color: white;
    }
    
    .n8n-github-settings-save:hover {
      background: #4f46e5;
    }
    
    .n8n-github-settings-save:active {
      background: #4338ca;
    }
    
    .n8n-github-settings-cancel {
      background: #f3f4f6;
      color: #374151;
    }
    
    .n8n-github-settings-cancel:hover {
      background: #e5e7eb;
    }
    
    .n8n-instance-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    
    
    .n8n-instance-info {
      flex: 1;
      min-width: 0;
    }
    
    .n8n-instance-url {
      font-weight: 600;
      color: #1f2937;
      font-size: 14px;
      margin-bottom: 4px;
      word-break: break-all;
      user-select: text;
    }
    
    .n8n-instance-meta {
      font-size: 12px;
      color: #6b7280;
      margin-top: 4px;
    }
    
    .n8n-instance-current-badge {
      display: inline-block;
      margin-left: 8px;
      padding: 2px 8px;
      background: #10b981;
      color: white;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 500;
    }
    
    .n8n-detail-field {
      margin-bottom: 20px;
    }
    
    .n8n-detail-field-label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      font-weight: 600;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }
    
    .n8n-detail-field-value {
      font-size: 14px;
      color: #1f2937;
      word-break: break-all;
    }
    
    .n8n-detail-field-value a {
      color: #6366f1;
      text-decoration: none;
    }
    
    .n8n-detail-field-value a:hover {
      text-decoration: underline;
    }
    
    .n8n-detail-actions {
      display: flex;
      gap: 12px;
      margin-top: 24px;
      padding-top: 24px;
      border-top: 1px solid #e5e7eb;
    }
    
    .n8n-detail-btn {
      padding: 10px 16px;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: background-color 0.2s ease;
    }
    
    .n8n-detail-btn-primary {
      background: #6366f1;
      color: white;
    }
    
    .n8n-detail-btn-primary:hover {
      background: #4f46e5;
    }
    
    .n8n-detail-btn-danger {
      background: #ef4444;
      color: white;
    }
    
    .n8n-detail-btn-danger:hover {
      background: #dc2626;
    }
    
    .n8n-detail-btn-secondary {
      background: #f3f4f6;
      color: #374151;
    }
    
    .n8n-detail-btn-secondary:hover {
      background: #e5e7eb;
    }
    
    .n8n-status-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
    }
    
    .n8n-status-badge.success {
      background: #d1fae5;
      color: #065f46;
    }
    
    .n8n-status-badge.warning {
      background: #fef3c7;
      color: #92400e;
    }
    
    .n8n-icon {
      display: inline-block;
      width: 16px;
      height: 16px;
      text-align: center;
      line-height: 16px;
    }
    
    .n8n-github-settings-message {
      margin-top: 16px;
      padding: 12px;
      border-radius: 6px;
      font-size: 14px;
      display: none;
    }
    
    .n8n-github-settings-message.success {
      background: #d1fae5;
      color: #065f46;
      border: 1px solid #6ee7b7;
    }
    
    .n8n-github-settings-message.error {
      background: #fee2e2;
      color: #991b1b;
      border: 1px solid #fca5a5;
    }
    
    @media (prefers-color-scheme: dark) {
      .n8n-github-settings-content {
        background: #1f2937;
        color: #f9fafb;
      }
      
      .n8n-settings-sidebar {
        background: #111827;
        border-right-color: #374151;
      }
      
      .n8n-settings-header {
        background: #1f2937;
        border-bottom-color: #374151;
      }
      
      .n8n-settings-header h3 {
        color: #f9fafb;
      }
      
      .n8n-settings-close {
        color: #9ca3af;
      }
      
      .n8n-settings-close:hover {
        background: #374151;
        color: #f9fafb;
      }
      
      .n8n-settings-search {
        background: #1f2937;
        border-bottom-color: #374151;
      }
      
      .n8n-settings-search input {
        background: #111827;
        border-color: #374151;
        color: #f9fafb;
      }
      
      .n8n-settings-search input:focus {
        border-color: #6366f1;
      }
      
      .n8n-settings-sidebar-footer {
        background: #1f2937;
        border-top-color: #374151;
      }
      
      .n8n-settings-details-panel {
        background: #1f2937;
      }
      
      .n8n-details-header {
        border-bottom-color: #374151;
      }
      
      .n8n-details-header h4 {
        color: #f9fafb;
      }
      
      .n8n-empty-state {
        color: #9ca3af;
      }
      
      .n8n-instance-item:hover {
        background: #374151;
      }
      
      .n8n-instance-item.selected {
        background: #312e81;
        border-color: #6366f1;
      }
      
      .n8n-instance-url {
        color: #f9fafb;
      }
      
      .n8n-instance-meta {
        color: #9ca3af;
      }
      
      .n8n-detail-field-label {
        color: #9ca3af;
      }
      
      .n8n-detail-field-value {
        color: #f9fafb;
      }
      
      .n8n-detail-actions {
        border-top-color: #374151;
      }
      
      .n8n-detail-btn-secondary {
        background: #374151;
        color: #e5e7eb;
      }
      
      .n8n-detail-btn-secondary:hover {
        background: #4b5563;
      }
      
      .n8n-github-settings-field label {
        color: #e5e7eb;
      }
      
      .n8n-github-settings-field input,
      .n8n-github-settings-field textarea {
        background: #111827;
        border-color: #374151;
        color: #f9fafb;
      }
      
      .n8n-github-settings-field input:focus,
      .n8n-github-settings-field textarea:focus {
        border-color: #6366f1;
      }
      
      .n8n-github-settings-field small {
        color: #9ca3af;
      }
      
      .n8n-github-settings-cancel {
        background: #374151;
        color: #e5e7eb;
      }
      
      .n8n-github-settings-cancel:hover {
        background: #4b5563;
      }
    }
    
    /* Modal Styles */
    .n8n-github-modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      backdrop-filter: blur(2px);
      pointer-events: auto;
      overflow: auto;
    }
    
    .n8n-github-modal {
      background: white;
      border-radius: 8px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
      width: 90%;
      max-width: 800px;
      max-height: 90vh;
      overflow-y: auto;
      animation: slideIn 0.2s ease;
      display: flex;
      flex-direction: column;
      pointer-events: auto;
      margin: auto;
    }
    
    .n8n-github-modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px;
      border-bottom: 1px solid #e5e7eb;
    }
    
    .n8n-github-modal-header h3 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      color: #1f2937;
    }
    
    .n8n-github-modal-close {
      background: none;
      border: none;
      font-size: 28px;
      color: #6b7280;
      cursor: pointer;
      padding: 0;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: background-color 0.2s ease;
    }
    
    .n8n-github-modal-close:hover {
      background: #f3f4f6;
      color: #1f2937;
    }
    
    .n8n-github-modal-body {
      padding: 20px;
      flex: 1;
      overflow-y: auto;
    }
    
    /* Workflow List Styles */
    .n8n-workflow-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    
    .n8n-workflow-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      border: 2px solid #e5e7eb;
      border-radius: 6px;
      background: #f9fafb;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    
    .n8n-workflow-item:hover {
      border-color: #6366f1;
      background: #f3f4f6;
    }
    
    .n8n-workflow-item input[type="checkbox"] {
      width: 20px;
      height: 20px;
      cursor: pointer;
      flex-shrink: 0;
      accent-color: #6366f1;
    }
    
    @media (prefers-color-scheme: dark) {
      .n8n-workflow-item {
        background: #111827;
        border-color: #374151;
      }
      
      .n8n-workflow-item:hover {
        background: #1f2937;
        border-color: #6366f1;
      }
    }
  `;
  
  shadowRoot.appendChild(style);
}

// Inject settings panel
function injectSettingsPanel() {
  const shadowRoot = getSettingsPanelShadowRoot();
  
  // Check if panel already exists in shadow DOM
  if (shadowRoot.getElementById('n8n-github-settings-panel')) {
    log('Settings panel already exists in shadow DOM');
    return;
  }
  
  log('Injecting settings panel into shadow DOM...');
  
  // Inject styles
  injectSettingsStyles(shadowRoot);
  
  // Create panel
  const panel = document.createElement('div');
  panel.id = 'n8n-github-settings-panel';
  panel.className = 'n8n-github-settings-panel';
  panel.style.display = 'none';
  
  panel.innerHTML = `
    <div class="n8n-github-settings-content">
      <!-- Left Sidebar -->
      <div class="n8n-settings-sidebar">
        <div class="n8n-settings-header">
          <h3>n8n Instances</h3>
          <button class="n8n-settings-close" id="n8n-github-settings-close">×</button>
        </div>
        <div class="n8n-settings-search">
          <input type="text" id="n8n-instance-search" placeholder="Search instances..." autocomplete="off" />
        </div>
        <div class="n8n-instance-list-container" id="n8n-instance-list-container">
          <!-- Instance list will be dynamically loaded -->
        </div>
        <div class="n8n-settings-sidebar-footer">
          <button class="n8n-add-instance-btn" id="n8n-add-instance-btn">+ Add Instance</button>
        </div>
      </div>
      
      <!-- Right Panel -->
      <div class="n8n-settings-details-panel">
        <div class="n8n-details-header">
          <h4 id="n8n-details-title">Instance Details</h4>
        </div>
        <div class="n8n-details-content" id="n8n-details-content">
          <div class="n8n-empty-state">
            <p>Select an instance to view details</p>
          </div>
        </div>
      </div>
    </div>
  `;
  
  shadowRoot.appendChild(panel);
  log('Settings panel injected into shadow DOM');
  
  // Event listeners
  const closeBtn = shadowRoot.getElementById('n8n-github-settings-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      toggleSettingsPanel();
    });
  }
  
  const addBtn = shadowRoot.getElementById('n8n-add-instance-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      log('Add Instance button clicked');
      showInstanceEditView(null);
    });
  }
  
  // Search functionality
  const searchInput = shadowRoot.getElementById('n8n-instance-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      filterInstances(e.target.value.trim());
    });
  }
  
  // Show list view by default
  showInstanceListView();
}

// Show instance list view (sidebar)
async function showInstanceListView() {
  const shadowRoot = getSettingsPanelShadowRoot();
  const container = shadowRoot.getElementById('n8n-instance-list-container');
  if (!container) return;
  
  try {
    const response = await sendMessageSafe({ action: 'getAllInstanceConfigs' });
    const instances = (response && response.success && response.configs) ? response.configs : [];
    const currentInstanceUrl = getInstanceUrl();
    
    // Sort instances by lastUsed (most recent first), then by creation
    instances.sort((a, b) => {
      const aLastUsed = a.lastUsed || 0;
      const bLastUsed = b.lastUsed || 0;
      if (bLastUsed !== aLastUsed) {
        return bLastUsed - aLastUsed;
      }
      return (b.id || '').localeCompare(a.id || '');
    });
    
    let instancesHtml = '';
    if (instances.length === 0) {
      instancesHtml = '<div class="n8n-empty-state" style="padding: 40px 20px;"><p style="text-align: center; color: #6b7280;">No instances configured.<br/>Click "Add Instance" to get started.</p></div>';
    } else {
      instances.forEach(inst => {
        const normalizedUrl = normalizeInstanceUrl(inst.n8nUrl);
        const isCurrent = normalizeInstanceUrl(currentInstanceUrl) === normalizedUrl;
        const currentBadge = isCurrent ? '<span class="n8n-instance-current-badge">Current</span>' : '';
        
        // Format last used timestamp
        let lastUsedText = '';
        if (inst.lastUsed) {
          const lastUsedDate = new Date(inst.lastUsed);
          const now = new Date();
          const diffMs = now - lastUsedDate;
          const diffMins = Math.floor(diffMs / 60000);
          const diffHours = Math.floor(diffMs / 3600000);
          const diffDays = Math.floor(diffMs / 86400000);
          
          if (diffMins < 1) {
            lastUsedText = 'Just now';
          } else if (diffMins < 60) {
            lastUsedText = `${diffMins}m ago`;
          } else if (diffHours < 24) {
            lastUsedText = `${diffHours}h ago`;
          } else if (diffDays < 7) {
            lastUsedText = `${diffDays}d ago`;
          } else {
            lastUsedText = lastUsedDate.toLocaleDateString();
          }
        }
        
        instancesHtml += `
          <div class="n8n-instance-item" data-instance-id="${inst.id}">
            <div class="n8n-instance-info">
              <div class="n8n-instance-url">${escapeHtml(inst.n8nUrl)} ${currentBadge}</div>
              <div class="n8n-instance-meta">
                ${inst.githubRepo ? escapeHtml(inst.githubRepo) : 'No repo'}${lastUsedText ? ' • ' + lastUsedText : ''}
              </div>
            </div>
          </div>
        `;
      });
    }
    
    container.innerHTML = instancesHtml;
    
    // Event listeners for instance clicks
    container.querySelectorAll('.n8n-instance-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const instanceId = item.getAttribute('data-instance-id');
        if (instanceId) {
          // Remove selected class from all items
          container.querySelectorAll('.n8n-instance-item').forEach(i => {
            i.classList.remove('selected');
          });
          // Add selected class to clicked item
          item.classList.add('selected');
          // Show details in right panel
          showInstanceDetailsView(instanceId);
        }
      });
    });
    
    // Auto-select current instance if available
    if (instances.length > 0) {
      const currentInstance = instances.find(inst => {
        const normalizedUrl = normalizeInstanceUrl(inst.n8nUrl);
        return normalizedUrl === normalizeInstanceUrl(currentInstanceUrl);
      });
      
      if (currentInstance) {
        const item = container.querySelector(`[data-instance-id="${currentInstance.id}"]`);
        if (item) {
          item.classList.add('selected');
          showInstanceDetailsView(currentInstance.id);
        }
      } else {
        // Select first instance if no current match
        const firstItem = container.querySelector('.n8n-instance-item');
        if (firstItem) {
          firstItem.classList.add('selected');
          showInstanceDetailsView(firstItem.getAttribute('data-instance-id'));
        }
      }
    }
  } catch (error) {
    log('Error loading instances:', error);
    container.innerHTML = '<div class="n8n-empty-state"><p style="color: #ef4444;">Error loading instances. Please try again.</p></div>';
  }
}

// Filter instances by search query
function filterInstances(searchQuery) {
  const shadowRoot = getSettingsPanelShadowRoot();
  const container = shadowRoot.getElementById('n8n-instance-list-container');
  if (!container) return;
  
  const items = container.querySelectorAll('.n8n-instance-item');
  const query = searchQuery.toLowerCase();
  
  if (!query) {
    // Show all items
    items.forEach(item => {
      item.style.display = '';
    });
    // Remove no results message if it exists
    const noResults = container.querySelector('.n8n-no-results');
    if (noResults) {
      noResults.remove();
    }
    return;
  }
  
  // Filter items
  items.forEach(item => {
    const url = item.querySelector('.n8n-instance-url')?.textContent?.toLowerCase() || '';
    const meta = item.querySelector('.n8n-instance-meta')?.textContent?.toLowerCase() || '';
    const matches = url.includes(query) || meta.includes(query);
    item.style.display = matches ? '' : 'none';
  });
  
  // Show "no results" message if all items are hidden
  const visibleItems = Array.from(items).filter(item => item.style.display !== 'none');
  if (visibleItems.length === 0 && items.length > 0) {
    if (!container.querySelector('.n8n-no-results')) {
      const noResults = document.createElement('div');
      noResults.className = 'n8n-no-results';
      noResults.style.cssText = 'padding: 40px 20px; text-align: center; color: #6b7280;';
      noResults.textContent = 'No instances found matching your search';
      container.appendChild(noResults);
    }
  } else {
    const noResults = container.querySelector('.n8n-no-results');
    if (noResults) {
      noResults.remove();
    }
  }
}

// Show instance details view (right panel)
async function showInstanceDetailsView(instanceId) {
  log('showInstanceDetailsView called with instanceId:', instanceId);
  const shadowRoot = getSettingsPanelShadowRoot();
  const detailsContent = shadowRoot.getElementById('n8n-details-content');
  const detailsTitle = shadowRoot.getElementById('n8n-details-title');
  if (!detailsContent || !detailsTitle) {
    log('Details panel elements not found!');
    return;
  }
  
  try {
    const response = await sendMessageSafe({ 
      action: 'getInstanceById',
      instanceId: instanceId
    });
    
    if (!response || !response.success || !response.config) {
      detailsContent.innerHTML = '<div class="n8n-empty-state"><p style="color: #ef4444;">Error loading instance details.</p></div>';
      return;
    }
    
    const config = response.config;
    
    // Format dates
    let createdDate = 'Unknown';
    if (instanceId && instanceId.startsWith('inst_')) {
      const timestamp = parseInt(instanceId.split('_')[1]);
      if (!isNaN(timestamp)) {
        createdDate = new Date(timestamp).toLocaleDateString();
      }
    }
    
    let lastUsedText = 'Never';
    if (config.lastUsed) {
      const lastUsedDate = new Date(config.lastUsed);
      const now = new Date();
      const diffMs = now - lastUsedDate;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);
      
      if (diffMins < 1) {
        lastUsedText = 'Just now';
      } else if (diffMins < 60) {
        lastUsedText = `${diffMins} minutes ago`;
      } else if (diffHours < 24) {
        lastUsedText = `${diffHours} hours ago`;
      } else if (diffDays < 7) {
        lastUsedText = `${diffDays} days ago`;
      } else {
        lastUsedText = lastUsedDate.toLocaleDateString();
      }
    }
    
    // Commit message preview (first 60 characters)
    const commitMessagePreview = config.commitMessage 
      ? (config.commitMessage.length > 60 ? config.commitMessage.substring(0, 60) + '...' : config.commitMessage)
      : 'Not set';
    
    // Status indicators
    const hasApiKey = config.n8nApiKey && config.n8nApiKey.trim().length > 0;
    const hasToken = config.githubToken && config.githubToken.trim().length > 0;
    const hasRepo = config.githubRepo && config.githubRepo.trim().length > 0;
    
    detailsTitle.textContent = 'Instance Details';
    
    detailsContent.innerHTML = `
      <div class="n8n-detail-field">
        <div class="n8n-detail-field-label">
          <span class="n8n-icon">🌐</span>
          Instance URL
        </div>
        <div class="n8n-detail-field-value">
          ${escapeHtml(config.n8nUrl || 'Not set')}
          <button class="n8n-detail-btn n8n-detail-btn-secondary" style="margin-left: 8px; padding: 4px 8px; font-size: 12px;" onclick="navigator.clipboard.writeText('${escapeHtml(config.n8nUrl || '')}').then(() => alert('URL copied!'))">Copy</button>
        </div>
      </div>
      
      <div class="n8n-detail-field">
        <div class="n8n-detail-field-label">
          <span class="n8n-icon">📦</span>
          GitHub Repository
        </div>
        <div class="n8n-detail-field-value">
          ${hasRepo ? `<a href="https://github.com/${escapeHtml(config.githubRepo)}" target="_blank">${escapeHtml(config.githubRepo)}</a>` : 'Not set'}
        </div>
      </div>
      
      <div class="n8n-detail-field">
        <div class="n8n-detail-field-label">
          <span class="n8n-icon">📁</span>
          Path Pattern
        </div>
        <div class="n8n-detail-field-value">
          ${escapeHtml(config.githubPathPattern || 'workflows/{workflow-name}.json')}
        </div>
      </div>
      
      <div class="n8n-detail-field">
        <div class="n8n-detail-field-label">
          <span class="n8n-icon">🌿</span>
          Default Branch
        </div>
        <div class="n8n-detail-field-value">
          ${escapeHtml(config.defaultBranch || 'main')}
        </div>
      </div>
      
      <div class="n8n-detail-field">
        <div class="n8n-detail-field-label">
          <span class="n8n-icon">💬</span>
          Commit Message
        </div>
        <div class="n8n-detail-field-value">
          ${escapeHtml(commitMessagePreview)}
        </div>
      </div>
      
      <div class="n8n-detail-field">
        <div class="n8n-detail-field-label">
          <span class="n8n-icon">🔑</span>
          Credentials Status
        </div>
        <div class="n8n-detail-field-value">
          <span class="n8n-status-badge ${hasApiKey ? 'success' : 'warning'}">${hasApiKey ? '✓' : '✗'} API Key ${hasApiKey ? 'configured' : 'missing'}</span>
          <span class="n8n-status-badge ${hasToken ? 'success' : 'warning'}" style="margin-left: 8px;">${hasToken ? '✓' : '✗'} Token ${hasToken ? 'configured' : 'missing'}</span>
        </div>
      </div>
      
      <div class="n8n-detail-field">
        <div class="n8n-detail-field-label">
          <span class="n8n-icon">🕒</span>
          Last Used
        </div>
        <div class="n8n-detail-field-value">
          ${lastUsedText}
        </div>
      </div>
      
      <div class="n8n-detail-field">
        <div class="n8n-detail-field-label">
          <span class="n8n-icon">📅</span>
          Created
        </div>
        <div class="n8n-detail-field-value">
          ${createdDate}
        </div>
      </div>
      
      <div class="n8n-detail-actions">
        <button class="n8n-detail-btn n8n-detail-btn-primary" id="n8n-detail-edit-btn">Edit</button>
        <button class="n8n-detail-btn n8n-detail-btn-secondary" id="n8n-detail-test-btn">Test Connection</button>
        <button class="n8n-detail-btn n8n-detail-btn-danger" id="n8n-detail-delete-btn">Delete</button>
      </div>
      
      <div id="n8n-detail-message" class="n8n-github-settings-message"></div>
    `;
    
    // Event listeners
    const editBtn = shadowRoot.getElementById('n8n-detail-edit-btn');
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        showInstanceEditView(instanceId);
      });
    }
    
    const deleteBtn = shadowRoot.getElementById('n8n-detail-delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        if (confirm('Are you sure you want to delete this instance configuration?')) {
          await deleteInstance(instanceId);
        }
      });
    }
    
    const testBtn = shadowRoot.getElementById('n8n-detail-test-btn');
    if (testBtn) {
      testBtn.addEventListener('click', async () => {
        await testInstanceConnection(config);
      });
    }
  } catch (error) {
    log('Error loading instance details:', error);
    detailsContent.innerHTML = '<div class="n8n-empty-state"><p style="color: #ef4444;">Error loading instance details.</p></div>';
  }
}

// Test instance connection
async function testInstanceConnection(config) {
  const shadowRoot = getSettingsPanelShadowRoot();
  const messageEl = shadowRoot.getElementById('n8n-detail-message');
  if (!messageEl) return;
  
  showSettingsMessage('Testing connections...', 'info', messageEl);
  
  try {
    if (!config.n8nUrl || !config.n8nApiKey || !config.githubRepo || !config.githubToken) {
      showSettingsMessage('Missing required credentials', 'error', messageEl);
      return;
    }
    
    // Test n8n connection
    const n8nTestUrl = config.n8nUrl.replace(/\/$/, '') + '/api/v1/workflows';
    const n8nResponse = await fetch(n8nTestUrl, {
      method: 'GET',
      headers: {
        'X-N8N-API-KEY': config.n8nApiKey,
        'Content-Type': 'application/json'
      }
    });
    
    if (!n8nResponse.ok) {
      throw new Error(`n8n API error: ${n8nResponse.status} ${n8nResponse.statusText}`);
    }
    
    // Test GitHub connection
    const [owner, repo] = config.githubRepo.split('/');
    if (!owner || !repo) {
      throw new Error('Invalid GitHub repository format');
    }
    
    const githubResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        'Authorization': `token ${config.githubToken}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    if (!githubResponse.ok) {
      throw new Error(`GitHub API error: ${githubResponse.status} ${githubResponse.statusText}`);
    }
    
    showSettingsMessage('✓ Both connections successful!', 'success', messageEl);
  } catch (error) {
    showSettingsMessage(`Connection test failed: ${error.message}`, 'error', messageEl);
  }
}

// Normalize instance URL helper (matches background.js logic)
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

// Escape HTML to prevent XSS and n8n URL detection
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Show instance edit view (right panel)
async function showInstanceEditView(instanceId) {
  log('showInstanceEditView called with instanceId:', instanceId);
  const shadowRoot = getSettingsPanelShadowRoot();
  const detailsContent = shadowRoot.getElementById('n8n-details-content');
  const detailsTitle = shadowRoot.getElementById('n8n-details-title');
  if (!detailsContent || !detailsTitle) {
    log('Details panel elements not found!');
    return;
  }
  
  currentEditingInstanceId = instanceId;
  let config = {
    n8nUrl: '',
    n8nApiKey: '',
    githubRepo: '',
    githubToken: '',
    githubPathPattern: 'workflows/{workflow-name}.json',
    commitMessage: 'Update workflow: {workflow-name}',
    defaultBranch: 'main'
  };
  
  if (instanceId) {
    // Editing existing instance - load its config
    try {
      const response = await sendMessageSafe({ 
        action: 'getInstanceById',
        instanceId: instanceId
      });
      if (response && response.success && response.config) {
        config = response.config;
      }
    } catch (error) {
      log('Error loading instance:', error);
    }
  } else {
    // Adding new instance - only auto-fill URL from current page
    // Don't load existing config - let user enter fresh values
    const currentUrl = getInstanceUrl();
    config.n8nUrl = currentUrl;
  }
  
  const isNewInstance = !instanceId;
  const urlNote = isNewInstance ? ' (auto-detected from current page)' : '';
  
  detailsTitle.textContent = isNewInstance ? 'Add New Instance' : 'Edit Instance';
  
  detailsContent.innerHTML = `
    <div style="margin-bottom: 16px;">
      <button id="n8n-back-to-details-btn" class="n8n-github-settings-cancel">← Back</button>
    </div>
        <div class="n8n-github-settings-field">
      <label for="n8n-url">n8n Instance URL *${urlNote}</label>
      <input type="text" id="n8n-url" placeholder="https://n8n.example.com or http://localhost:5678" value="${escapeHtml(config.n8nUrl || '')}" autocomplete="off" data-lpignore="true" />
      <small>${isNewInstance ? 'Auto-detected from current page. You can edit this if needed.' : 'Base URL of your n8n instance'}</small>
        </div>
        
        <div class="n8n-github-settings-field">
          <label for="n8n-api-key">n8n API Key *</label>
      <input type="password" id="n8n-api-key" placeholder="Your n8n API key" value="${escapeHtml(config.n8nApiKey || '')}" autocomplete="new-password" data-lpignore="true" />
          <small>Found in n8n Settings > API</small>
        </div>
        
        <div class="n8n-github-settings-field">
          <label for="github-repo">GitHub Repository *</label>
      <div style="display: flex; gap: 8px; align-items: center;">
        <input type="text" id="github-repo" placeholder="owner/repo" value="${escapeHtml(config.githubRepo || '')}" autocomplete="off" data-lpignore="true" style="flex: 1;" />
        <button type="button" id="n8n-create-repo-btn" class="n8n-github-settings-save" style="flex: 0 0 auto; padding: 10px 16px; white-space: nowrap;">Create Repo</button>
      </div>
          <small>Format: owner/repository-name</small>
        </div>
        
        <div class="n8n-github-settings-field">
          <label for="github-token">GitHub Personal Access Token *</label>
      <input type="password" id="github-token" placeholder="ghp_xxxxxxxxxxxx" value="${escapeHtml(config.githubToken || '')}" autocomplete="new-password" data-lpignore="true" />
          <small>Token with 'repo' scope. Create at: github.com/settings/tokens</small>
        </div>
    
    <div class="n8n-github-settings-field">
      <label for="default-branch">Default Branch</label>
      <div style="display: flex; gap: 8px; align-items: center;">
        <select id="default-branch" style="flex: 1; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; background: white;">
          <option value="">Loading branches...</option>
        </select>
        <button type="button" id="n8n-create-branch-btn" class="n8n-github-settings-save" style="flex: 0 0 auto; padding: 10px 16px; white-space: nowrap;">Create Branch</button>
      </div>
      <small>Branch to use for commits (default: main)</small>
    </div>
        
        <div class="n8n-github-settings-field">
          <label for="github-path-pattern">GitHub Path Pattern</label>
      <input type="text" id="github-path-pattern" placeholder="workflows/{workflow-name}.json" value="${escapeHtml(config.githubPathPattern || 'workflows/{workflow-name}.json')}" autocomplete="off" data-lpignore="true" />
          <small>Use {workflow-name} and {workflow-id} as placeholders</small>
        </div>
    
    <div class="n8n-github-settings-field">
      <label for="commit-message">Commit Message</label>
      <input type="text" id="commit-message" placeholder="Update workflow: {workflow-name}" value="${escapeHtml(config.commitMessage || 'Update workflow: {workflow-name}')}" autocomplete="off" data-lpignore="true" />
      <small>Use {workflow-name} and {workflow-id} as placeholders. Leave empty for default.</small>
    </div>
        
        <div class="n8n-github-settings-actions">
          <button id="n8n-github-settings-save" class="n8n-github-settings-save">Save</button>
          <button id="n8n-github-settings-cancel" class="n8n-github-settings-cancel">Cancel</button>
        </div>
        
        <div id="n8n-github-settings-message" class="n8n-github-settings-message"></div>
  `;
  
  // Event listeners
  const backBtn = shadowRoot.getElementById('n8n-back-to-details-btn');
  const cancelBtn = shadowRoot.getElementById('n8n-github-settings-cancel');
  const saveBtn = shadowRoot.getElementById('n8n-github-settings-save');
  
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      if (instanceId) {
        showInstanceDetailsView(instanceId);
      } else {
        // If new instance, just clear the details panel
        const detailsContent = shadowRoot.getElementById('n8n-details-content');
        const detailsTitle = shadowRoot.getElementById('n8n-details-title');
        if (detailsContent) {
          detailsContent.innerHTML = '<div class="n8n-empty-state"><p>Select an instance to view details</p></div>';
        }
        if (detailsTitle) {
          detailsTitle.textContent = 'Instance Details';
        }
      }
    });
  }
  
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      if (instanceId) {
        showInstanceDetailsView(instanceId);
      } else {
        // If new instance, just clear the details panel
        const detailsContent = shadowRoot.getElementById('n8n-details-content');
        const detailsTitle = shadowRoot.getElementById('n8n-details-title');
        if (detailsContent) {
          detailsContent.innerHTML = '<div class="n8n-empty-state"><p>Select an instance to view details</p></div>';
        }
        if (detailsTitle) {
          detailsTitle.textContent = 'Instance Details';
        }
      }
    });
  }
  
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      await saveInstanceSettings();
    });
  }
  
  // Load branches for branch selector
  if (config.githubRepo && config.githubToken) {
    loadBranchesForSelector(shadowRoot, config.githubRepo, config.githubToken, config.defaultBranch || 'main');
  }
  
  // Repository creation button
  const createRepoBtn = shadowRoot.getElementById('n8n-create-repo-btn');
  if (createRepoBtn) {
    createRepoBtn.addEventListener('click', () => {
      showCreateRepoModal(shadowRoot);
    });
  }
  
  // Branch creation button
  const createBranchBtn = shadowRoot.getElementById('n8n-create-branch-btn');
  if (createBranchBtn) {
    createBranchBtn.addEventListener('click', () => {
      showCreateBranchModal(shadowRoot, config.githubRepo, config.githubToken);
    });
  }
  
  // Watch for repo/token changes to reload branches
  const repoInput = shadowRoot.getElementById('github-repo');
  const tokenInput = shadowRoot.getElementById('github-token');
  if (repoInput && tokenInput) {
    const reloadBranches = () => {
      const repo = repoInput.value.trim();
      const token = tokenInput.value.trim();
      if (repo && token) {
        loadBranchesForSelector(shadowRoot, repo, token);
      }
    };
    repoInput.addEventListener('blur', reloadBranches);
    tokenInput.addEventListener('blur', reloadBranches);
  }
  
  // Ensure all input fields are editable
  setTimeout(() => {
    const inputs = shadowRoot.querySelectorAll('#n8n-details-content input, #n8n-details-content select');
    
    inputs.forEach(input => {
      // Remove readonly/disabled attributes
      input.removeAttribute('readonly');
      input.removeAttribute('disabled');
      // Force editable state
      input.readOnly = false;
      input.disabled = false;
      
      // Ensure autocomplete is set
      if (input.type === 'password') {
        input.setAttribute('autocomplete', 'new-password');
      } else {
        input.setAttribute('autocomplete', 'off');
      }
      input.setAttribute('data-lpignore', 'true');
      
      // Add focus handler to ensure field is editable when clicked
      input.addEventListener('focus', function() {
        this.readOnly = false;
        this.removeAttribute('readonly');
        this.disabled = false;
        this.removeAttribute('disabled');
        // Select all text to make it easy to replace
        if (this.value && this.type !== 'password') {
          setTimeout(() => this.select(), 10);
        }
      });
      
      // Also handle click to ensure it's editable
      input.addEventListener('click', function() {
        this.readOnly = false;
        this.removeAttribute('readonly');
        this.disabled = false;
        this.removeAttribute('disabled');
      });
    });
  }, 100);
}

// Delete instance
async function deleteInstance(instanceId) {
  try {
    const response = await sendMessageSafe({
      action: 'deleteInstance',
      instanceId: instanceId
    });
    
    if (response && response.success) {
      // Clear details panel
      const shadowRoot = getSettingsPanelShadowRoot();
      const detailsContent = shadowRoot.getElementById('n8n-details-content');
      const detailsTitle = shadowRoot.getElementById('n8n-details-title');
      if (detailsContent) {
        detailsContent.innerHTML = '<div class="n8n-empty-state"><p>Select an instance to view details</p></div>';
      }
      if (detailsTitle) {
        detailsTitle.textContent = 'Instance Details';
      }
      // Reload list
      await showInstanceListView();
    } else {
      showSettingsMessage(`Error: ${response?.error || 'Failed to delete instance'}`, 'error');
    }
  } catch (error) {
    log('Error deleting instance:', error);
    showSettingsMessage(`Error: ${error.message}`, 'error');
  }
}

// Load branches into selector
async function loadBranchesForSelector(shadowRoot, githubRepo, githubToken, selectedBranch) {
  const branchSelect = shadowRoot.getElementById('default-branch');
  if (!branchSelect) return;
  
  branchSelect.innerHTML = '<option value="">Loading...</option>';
  
  try {
    const [owner, repo] = githubRepo.split('/');
    if (!owner || !repo) {
      branchSelect.innerHTML = '<option value="main">main</option>';
      return;
    }
    
    const response = await sendMessageSafe({
      action: 'listBranches',
      owner: owner,
      repo: repo,
      githubToken: githubToken
    });
    
    if (response && response.success && response.branches) {
      branchSelect.innerHTML = '';
      response.branches.forEach(branch => {
        const option = document.createElement('option');
        option.value = branch;
        option.textContent = branch;
        if (branch === selectedBranch) {
          option.selected = true;
        }
        branchSelect.appendChild(option);
      });
      
      // If no branch selected and we have a default, select it
      if (!selectedBranch && response.branches.length > 0) {
        const defaultBranch = response.branches.find(b => b === 'main') || response.branches.find(b => b === 'master') || response.branches[0];
        branchSelect.value = defaultBranch;
      }
    } else {
      // Fallback to main/master
      branchSelect.innerHTML = '<option value="main">main</option><option value="master">master</option>';
      if (selectedBranch) {
        branchSelect.value = selectedBranch;
      }
    }
  } catch (error) {
    log('Error loading branches:', error);
    branchSelect.innerHTML = '<option value="main">main</option><option value="master">master</option>';
    if (selectedBranch) {
      branchSelect.value = selectedBranch;
    }
  }
}

// Show create repository modal
function showCreateRepoModal(shadowRoot) {
  const modal = document.createElement('div');
  modal.id = 'n8n-create-repo-modal';
  modal.className = 'n8n-github-modal-overlay';
  modal.innerHTML = `
    <div class="n8n-github-modal">
      <div class="n8n-github-modal-header">
        <h3>Create New Repository</h3>
        <button class="n8n-github-modal-close" id="n8n-create-repo-close">×</button>
      </div>
      <div class="n8n-github-modal-body">
        <div class="n8n-github-settings-field">
          <label for="repo-owner">Owner (username or org) *</label>
          <input type="text" id="repo-owner" placeholder="username or org-name" />
          <small>Your GitHub username or organization name</small>
        </div>
        <div class="n8n-github-settings-field">
          <label for="repo-name">Repository Name *</label>
          <input type="text" id="repo-name" placeholder="my-workflows" />
          <small>Repository name (lowercase, no spaces)</small>
        </div>
        <div class="n8n-github-settings-field">
          <label for="repo-description">Description</label>
          <input type="text" id="repo-description" placeholder="n8n workflow backups" />
        </div>
        <div class="n8n-github-settings-field">
          <label style="display: flex; align-items: center; gap: 8px;">
            <input type="checkbox" id="repo-private" />
            <span>Private repository</span>
          </label>
        </div>
        <div class="n8n-github-settings-field">
          <label style="display: flex; align-items: center; gap: 8px;">
            <input type="checkbox" id="repo-readme" />
            <span>Initialize with README</span>
          </label>
        </div>
        <div class="n8n-github-settings-actions">
          <button id="n8n-create-repo-submit" class="n8n-github-settings-save">Create Repository</button>
          <button id="n8n-create-repo-cancel" class="n8n-github-settings-cancel">Cancel</button>
        </div>
        <div id="n8n-create-repo-message" class="n8n-github-settings-message"></div>
      </div>
    </div>
  `;
  
  shadowRoot.appendChild(modal);
  modal.style.display = 'flex';
  
  const closeBtn = shadowRoot.getElementById('n8n-create-repo-close');
  const cancelBtn = shadowRoot.getElementById('n8n-create-repo-cancel');
  const submitBtn = shadowRoot.getElementById('n8n-create-repo-submit');
  
  const closeModal = () => {
    modal.style.display = 'none';
    setTimeout(() => modal.remove(), 300);
  };
  
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
  
  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      const owner = shadowRoot.getElementById('repo-owner')?.value.trim() || '';
      const repoName = shadowRoot.getElementById('repo-name')?.value.trim() || '';
      const description = shadowRoot.getElementById('repo-description')?.value.trim() || '';
      const isPrivate = shadowRoot.getElementById('repo-private')?.checked || false;
      const hasReadme = shadowRoot.getElementById('repo-readme')?.checked || false;
      const githubToken = shadowRoot.getElementById('github-token')?.value.trim() || '';
      
      if (!owner || !repoName) {
        showModalMessage(shadowRoot, 'n8n-create-repo-message', 'Owner and repository name are required', 'error');
        return;
      }
      
      if (!githubToken) {
        showModalMessage(shadowRoot, 'n8n-create-repo-message', 'GitHub token is required', 'error');
        return;
      }
      
      try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating...';
        
        const response = await sendMessageSafe({
          action: 'createGitHubRepo',
          owner: owner,
          repoName: repoName,
          description: description,
          isPrivate: isPrivate,
          hasReadme: hasReadme,
          githubToken: githubToken
        });
        
        if (response && response.success) {
          // Auto-fill repository field
          const repoInput = shadowRoot.getElementById('github-repo');
          if (repoInput) {
            repoInput.value = response.repoFullName;
          }
          
          // Update default branch
          const branchSelect = shadowRoot.getElementById('default-branch');
          if (branchSelect && response.defaultBranch) {
            // Reload branches
            await loadBranchesForSelector(shadowRoot, response.repoFullName, githubToken, response.defaultBranch);
          }
          
          showModalMessage(shadowRoot, 'n8n-create-repo-message', `Repository created! ${response.repoUrl}`, 'success');
          setTimeout(() => {
            closeModal();
          }, 2000);
        } else {
          showModalMessage(shadowRoot, 'n8n-create-repo-message', `Error: ${response?.error || 'Failed to create repository'}`, 'error');
          submitBtn.disabled = false;
          submitBtn.textContent = 'Create Repository';
        }
      } catch (error) {
        showModalMessage(shadowRoot, 'n8n-create-repo-message', `Error: ${error.message}`, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Repository';
      }
    });
  }
}

// Show create branch modal
function showCreateBranchModal(shadowRoot, githubRepo, githubToken) {
  if (!githubRepo || !githubToken) {
    showSettingsMessage('Please configure GitHub repository and token first', 'error');
    return;
  }
  
  const [owner, repo] = githubRepo.split('/');
  if (!owner || !repo) {
    showSettingsMessage('Invalid repository format', 'error');
    return;
  }
  
  const modal = document.createElement('div');
  modal.id = 'n8n-create-branch-modal';
  modal.className = 'n8n-github-modal-overlay';
  modal.innerHTML = `
    <div class="n8n-github-modal">
      <div class="n8n-github-modal-header">
        <h3>Create New Branch</h3>
        <button class="n8n-github-modal-close" id="n8n-create-branch-close">×</button>
      </div>
      <div class="n8n-github-modal-body">
        <div class="n8n-github-settings-field">
          <label for="branch-name">Branch Name *</label>
          <input type="text" id="branch-name" placeholder="feature/my-feature" />
          <small>New branch name</small>
        </div>
        <div class="n8n-github-settings-field">
          <label for="branch-from">Create from Branch *</label>
          <select id="branch-from" style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;">
            <option value="">Loading...</option>
          </select>
          <small>Branch to create from</small>
        </div>
        <div class="n8n-github-settings-actions">
          <button id="n8n-create-branch-submit" class="n8n-github-settings-save">Create Branch</button>
          <button id="n8n-create-branch-cancel" class="n8n-github-settings-cancel">Cancel</button>
        </div>
        <div id="n8n-create-branch-message" class="n8n-github-settings-message"></div>
      </div>
    </div>
  `;
  
  shadowRoot.appendChild(modal);
  modal.style.display = 'flex';
  
  // Load branches for "create from" selector
  loadBranchesForSelector(shadowRoot, githubRepo, githubToken).then(() => {
    const fromSelect = shadowRoot.getElementById('branch-from');
    const branchSelect = shadowRoot.getElementById('default-branch');
    if (fromSelect && branchSelect) {
      // Copy branches from default branch selector
      Array.from(branchSelect.options).forEach(opt => {
        const newOpt = opt.cloneNode(true);
        fromSelect.appendChild(newOpt);
      });
      // Select current default branch
      if (branchSelect.value) {
        fromSelect.value = branchSelect.value;
      }
    }
  });
  
  const closeBtn = shadowRoot.getElementById('n8n-create-branch-close');
  const cancelBtn = shadowRoot.getElementById('n8n-create-branch-cancel');
  const submitBtn = shadowRoot.getElementById('n8n-create-branch-submit');
  
  const closeModal = () => {
    modal.style.display = 'none';
    setTimeout(() => modal.remove(), 300);
  };
  
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
  
  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      const branchName = shadowRoot.getElementById('branch-name')?.value.trim() || '';
      const fromBranch = shadowRoot.getElementById('branch-from')?.value || '';
      
      if (!branchName) {
        showModalMessage(shadowRoot, 'n8n-create-branch-message', 'Branch name is required', 'error');
        return;
      }
      
      if (!fromBranch) {
        showModalMessage(shadowRoot, 'n8n-create-branch-message', 'Source branch is required', 'error');
        return;
      }
      
      try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating...';
        
        const response = await sendMessageSafe({
          action: 'createBranch',
          owner: owner,
          repo: repo,
          branchName: branchName,
          fromBranch: fromBranch,
          githubToken: githubToken
        });
        
        if (response && response.success) {
          // Reload branches and select new branch
          await loadBranchesForSelector(shadowRoot, githubRepo, githubToken, branchName);
          const branchSelect = shadowRoot.getElementById('default-branch');
          if (branchSelect) {
            branchSelect.value = branchName;
          }
          
          showModalMessage(shadowRoot, 'n8n-create-branch-message', 'Branch created successfully!', 'success');
          setTimeout(() => {
            closeModal();
          }, 1500);
        } else {
          showModalMessage(shadowRoot, 'n8n-create-branch-message', `Error: ${response?.error || 'Failed to create branch'}`, 'error');
          submitBtn.disabled = false;
          submitBtn.textContent = 'Create Branch';
        }
      } catch (error) {
        showModalMessage(shadowRoot, 'n8n-create-branch-message', `Error: ${error.message}`, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Branch';
      }
    });
  }
}

// Show message in modal
function showModalMessage(shadowRoot, messageId, message, type) {
  const messageEl = shadowRoot.getElementById(messageId);
  if (messageEl) {
    messageEl.textContent = message;
    messageEl.className = `n8n-github-settings-message ${type}`;
    messageEl.style.display = 'block';
    
    if (type === 'success') {
      setTimeout(() => {
        messageEl.style.display = 'none';
      }, 3000);
    }
  }
}

// Save instance settings
async function saveInstanceSettings() {
  const shadowRoot = getSettingsPanelShadowRoot();
  const n8nUrl = shadowRoot.getElementById('n8n-url')?.value.trim() || '';
  const n8nApiKey = shadowRoot.getElementById('n8n-api-key')?.value.trim() || '';
  const githubRepo = shadowRoot.getElementById('github-repo')?.value.trim() || '';
  const githubToken = shadowRoot.getElementById('github-token')?.value.trim() || '';
  const githubPathPattern = shadowRoot.getElementById('github-path-pattern')?.value.trim() || 'workflows/{workflow-name}.json';
  const commitMessage = shadowRoot.getElementById('commit-message')?.value.trim() || 'Update workflow: {workflow-name}';
  const defaultBranch = shadowRoot.getElementById('default-branch')?.value || 'main';
  
  // Validation
  if (!n8nUrl) {
    showSettingsMessage('n8n Instance URL is required', 'error');
    return;
  }
  
  if (!n8nApiKey) {
    showSettingsMessage('n8n API Key is required', 'error');
    return;
  }
  
  if (!githubRepo || !githubRepo.includes('/')) {
    showSettingsMessage('GitHub Repository must be in format: owner/repo', 'error');
    return;
  }
  
  if (!githubToken) {
    showSettingsMessage('GitHub Personal Access Token is required', 'error');
    return;
  }
  
  try {
    const config = {
        n8nUrl,
        n8nApiKey,
        githubRepo,
        githubToken,
      githubPathPattern,
      commitMessage,
      defaultBranch
    };
    
    let response;
    if (currentEditingInstanceId) {
      // Update existing instance
      response = await sendMessageSafe({
        action: 'updateInstance',
        instanceId: currentEditingInstanceId,
        config: config
      });
    } else {
      // Add new instance
      response = await sendMessageSafe({
        action: 'addInstance',
        config: config
      });
    }
    
    if (response && response.success) {
      showSettingsMessage('Settings saved successfully!', 'success');
      // Reload the instance list
      await showInstanceListView();
      
      // Show details view if editing existing instance, or select the new instance
      const instanceIdToShow = currentEditingInstanceId || response.instanceId;
      if (instanceIdToShow) {
        // Re-select the instance in the list and show details
        const shadowRoot = getSettingsPanelShadowRoot();
        const container = shadowRoot.getElementById('n8n-instance-list-container');
        const item = container?.querySelector(`[data-instance-id="${instanceIdToShow}"]`);
        if (item) {
          container.querySelectorAll('.n8n-instance-item').forEach(i => i.classList.remove('selected'));
          item.classList.add('selected');
          showInstanceDetailsView(instanceIdToShow);
        }
      }
    } else {
      showSettingsMessage(`Error: ${response?.error || 'Failed to save settings'}`, 'error');
    }
  } catch (error) {
    log('Error saving settings:', error);
    showSettingsMessage(`Error: ${error.message}`, 'error');
  }
}

// Legacy functions kept for backward compatibility (not used in new UI)

// Toggle settings panel visibility
function toggleSettingsPanel() {
  // Ensure panel is injected
  if (!settingsPanelShadowRoot) {
    log('Settings panel shadow root not found, injecting...');
    injectSettingsPanel();
  }
  
  const shadowRoot = getSettingsPanelShadowRoot();
  const panel = shadowRoot.getElementById('n8n-github-settings-panel');
  if (!panel) {
    log('Settings panel not found, injecting...');
    injectSettingsPanel();
    // Try again after injection
    setTimeout(() => {
      toggleSettingsPanel();
    }, 100);
    return;
  }
  
  settingsVisible = !settingsVisible;
  panel.style.display = settingsVisible ? 'flex' : 'none';
  
  // Also update host element pointer-events
  const host = document.getElementById('n8n-github-settings-panel-host');
  if (host) {
    host.style.pointerEvents = settingsVisible ? 'auto' : 'none';
  }
  
  log('Settings panel toggled:', settingsVisible);
  
  if (settingsVisible) {
    showInstanceListView();
  }
}

// Show pull workflow modal (for pull button on workflow page)
async function showPullWorkflowModal(instanceUrl, config, currentWorkflowId) {
  // Use the settings panel shadow root which already has styles injected
  const shadowRoot = getSettingsPanelShadowRoot();
  
  // Inject settings styles (includes modal and workflow item styles)
  injectSettingsStyles(shadowRoot);
  
  // Inject overwrite option styles if not already present (modal-specific)
  if (!shadowRoot.getElementById('n8n-pull-overwrite-styles')) {
    const style = document.createElement('style');
    style.id = 'n8n-pull-overwrite-styles';
    style.textContent = `
      .n8n-pull-overwrite-option {
        margin-top: 16px;
        padding: 12px;
        background: #fef3c7;
        border: 1px solid #fbbf24;
        border-radius: 6px;
        display: none;
      }
      .n8n-pull-overwrite-option.show {
        display: block;
      }
      .n8n-pull-overwrite-option label {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        font-size: 14px;
        color: #92400e;
      }
      .n8n-pull-overwrite-option input[type="checkbox"] {
        width: 18px;
        height: 18px;
        accent-color: #f59e0b;
      }
    `;
    shadowRoot.appendChild(style);
  }
  
  const modal = document.createElement('div');
  modal.id = 'n8n-pull-workflow-modal';
  modal.className = 'n8n-github-modal-overlay';
  
  modal.innerHTML = `
    <div class="n8n-github-modal">
      <div class="n8n-github-modal-header">
        <h3>Pull Workflow from GitHub</h3>
        <button class="n8n-github-modal-close" id="n8n-pull-workflow-close">×</button>
      </div>
      <div class="n8n-github-modal-body">
        <div id="n8n-pull-workflow-message" class="n8n-github-settings-message"></div>
        <div id="n8n-pull-workflow-list" style="max-height: 400px; overflow-y: auto;">
          <p style="text-align: center; color: #6b7280; padding: 20px;">Loading workflows...</p>
        </div>
        <div id="n8n-pull-workflow-overwrite-option" class="n8n-pull-overwrite-option">
          <label>
            <input type="checkbox" id="n8n-pull-workflow-overwrite-checkbox">
            <span>Overwrite existing workflow (this will replace the current workflow)</span>
          </label>
        </div>
        <div class="n8n-github-settings-actions" style="margin-top: 16px;">
          <button class="n8n-github-settings-cancel" id="n8n-pull-workflow-cancel">Cancel</button>
          <button class="n8n-github-settings-save" id="n8n-pull-workflow-pull" disabled>Pull Selected</button>
        </div>
      </div>
    </div>
  `;
  
  shadowRoot.appendChild(modal);
  modal.style.display = 'flex';
  
  // Prevent scroll/wheel events from propagating to the underlying canvas
  modal.addEventListener('wheel', (e) => {
    e.stopPropagation();
  }, { passive: false });
  
  modal.addEventListener('scroll', (e) => {
    e.stopPropagation();
  });
  
  const closeBtn = shadowRoot.getElementById('n8n-pull-workflow-close');
  const cancelBtn = shadowRoot.getElementById('n8n-pull-workflow-cancel');
  const pullBtn = shadowRoot.getElementById('n8n-pull-workflow-pull');
  const workflowsList = shadowRoot.getElementById('n8n-pull-workflow-list');
  const overwriteOption = shadowRoot.getElementById('n8n-pull-workflow-overwrite-option');
  const overwriteCheckbox = shadowRoot.getElementById('n8n-pull-workflow-overwrite-checkbox');
  const messageEl = shadowRoot.getElementById('n8n-pull-workflow-message');
  
  let selectedWorkflow = null;
  let workflowFiles = [];
  let existingWorkflows = [];
  
  const closeModal = () => {
    modal.style.display = 'none';
    setTimeout(() => {
      if (modal.parentNode) {
        modal.remove();
      }
    }, 300);
  };
  
  const showMessage = (message, type) => {
    messageEl.textContent = message;
    messageEl.className = `n8n-github-settings-message ${type}`;
  };
  
  const loadWorkflows = async () => {
    workflowsList.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 20px;">Loading workflows...</p>';
    
    try {
      // Load workflows from GitHub
      const [owner, repo] = config.githubRepo.split('/');
      const githubResponse = await sendMessageSafe({
        action: 'listWorkflowFiles',
        owner: owner,
        repo: repo,
        pathPattern: config.githubPathPattern || 'workflows/{workflow-name}.json',
        branch: config.defaultBranch || 'main',
        githubToken: config.githubToken
      });
      
      if (!githubResponse || !githubResponse.success || !githubResponse.files) {
        throw new Error(githubResponse?.error || 'Failed to load workflows from GitHub');
      }
      
      workflowFiles = githubResponse.files;
      
      if (workflowFiles.length === 0) {
        workflowsList.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 20px;">No workflow files found in repository</p>';
        return;
      }
      
      // Load existing workflows from n8n
      const n8nResponse = await sendMessageSafe({
        action: 'listN8nWorkflows',
        instanceUrl: instanceUrl
      });
      
      if (n8nResponse && n8nResponse.success && n8nResponse.workflows) {
        existingWorkflows = n8nResponse.workflows;
      }
      
      // Build workflow list HTML
      let workflowsHtml = '<div class="n8n-workflow-list">';
      workflowFiles.forEach((file, index) => {
        const workflowName = file.name;
        const existingWorkflow = existingWorkflows.find(w => w.name === workflowName);
        const hasConflict = !!existingWorkflow;
        const isCurrentWorkflow = currentWorkflowId && existingWorkflow && existingWorkflow.id === currentWorkflowId;
        
        const date = new Date(file.lastModified).toLocaleDateString();
        const conflictText = isCurrentWorkflow 
          ? '⚠️ This will overwrite the current workflow'
          : hasConflict 
            ? `⚠️ Conflict: Workflow "${workflowName}" already exists`
            : '';
        
        workflowsHtml += `
          <div class="n8n-workflow-item ${hasConflict ? 'has-conflict' : ''}" data-index="${index}">
            <input type="radio" name="workflow-select" id="workflow-${index}" data-index="${index}">
            <div class="n8n-workflow-item-info">
              <div class="n8n-workflow-item-name">${escapeHtml(workflowName)}</div>
              <div class="n8n-workflow-item-details">${escapeHtml(file.path)} • ${date}</div>
              ${conflictText ? `<div class="n8n-workflow-conflict-warning">${escapeHtml(conflictText)}</div>` : ''}
            </div>
          </div>
        `;
      });
      workflowsHtml += '</div>';
      
      workflowsList.innerHTML = workflowsHtml;
      
      // Add click listeners
      workflowFiles.forEach((file, index) => {
        const item = shadowRoot.querySelector(`.n8n-workflow-item[data-index="${index}"]`);
        const radio = shadowRoot.getElementById(`workflow-${index}`);
        
        if (item && radio) {
          // Handle clicks on the item
          item.addEventListener('click', (e) => {
            e.stopPropagation();
            // If clicking on the radio itself, let it handle naturally
            if (e.target === radio) {
              return;
            }
            // Otherwise, programmatically check the radio
            radio.checked = true;
            radio.dispatchEvent(new Event('change', { bubbles: true }));
          });
          
          // Handle radio button changes (fires when radio is checked)
          radio.addEventListener('change', (e) => {
            e.stopPropagation();
            if (radio.checked) {
              // Unselect all items visually
              shadowRoot.querySelectorAll('.n8n-workflow-item').forEach(el => {
                el.classList.remove('selected');
              });
              
              // Select this item
              item.classList.add('selected');
              selectedWorkflow = file;
              
              // Show overwrite option if there's a conflict
              const hasConflict = !!existingWorkflows.find(w => w.name === file.name);
              if (hasConflict) {
                overwriteOption.classList.add('show');
                overwriteCheckbox.checked = false;
              } else {
                overwriteOption.classList.remove('show');
              }
              
              pullBtn.disabled = false;
            }
          });
          
          // Prevent clicks on radio from bubbling
          radio.addEventListener('click', (e) => {
            e.stopPropagation();
          });
        }
      });
    } catch (error) {
      log('Error loading workflows:', error);
      workflowsList.innerHTML = `<p style="color: #ef4444; padding: 20px;">Error: ${escapeHtml(error.message)}</p>`;
    }
  };
  
  // Load workflows on open
  await loadWorkflows();
  
  // Handle pull button
  pullBtn.addEventListener('click', async () => {
    if (!selectedWorkflow) {
      showMessage('Please select a workflow to pull', 'error');
      return;
    }
    
    const hasConflict = !!existingWorkflows.find(w => w.name === selectedWorkflow.name);
    const shouldOverwrite = overwriteCheckbox.checked;
    
    if (hasConflict && !shouldOverwrite) {
      showMessage('Please confirm overwrite to proceed', 'error');
      return;
    }
    
    pullBtn.disabled = true;
    pullBtn.textContent = 'Pulling...';
    
    try {
      // Pull workflow from GitHub
      const pullResponse = await sendMessageSafe({
        action: 'pullWorkflowFromGitHub',
        instanceUrl: instanceUrl,
        filePath: selectedWorkflow.path,
        branch: config.defaultBranch || 'main'
      });
      
      if (!pullResponse || !pullResponse.success) {
        throw new Error(pullResponse?.error || 'Failed to pull workflow');
      }
      
      // Determine workflow ID for import
      let targetWorkflowId = null;
      if (hasConflict && shouldOverwrite) {
        const existingWorkflow = existingWorkflows.find(w => w.name === selectedWorkflow.name);
        if (existingWorkflow) {
          targetWorkflowId = existingWorkflow.id;
        }
      } else if (currentWorkflowId && !hasConflict) {
        // If we're on a workflow page and no conflict, update current workflow
        targetWorkflowId = currentWorkflowId;
      }
      
      // Import workflow to n8n
      const importResponse = await sendMessageSafe({
        action: 'importWorkflowToN8n',
        instanceUrl: instanceUrl,
        workflowData: pullResponse.content.content,
        workflowName: pullResponse.content.name,
        workflowId: targetWorkflowId
      });
      
      if (importResponse && importResponse.success) {
        const action = importResponse.action === 'updated' ? 'updated' : 'imported';
        showMessage(`Workflow ${action} successfully!`, 'success');
        setTimeout(() => {
          closeModal();
          window.location.reload();
        }, 1500);
      } else {
        throw new Error(importResponse?.error || 'Failed to import workflow');
      }
    } catch (error) {
      log('Error pulling workflow:', error);
      showMessage(`Error: ${escapeHtml(error.message)}`, 'error');
      pullBtn.disabled = false;
      pullBtn.textContent = 'Pull Selected';
    }
  });
  
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeModal();
    });
  }
  if (cancelBtn) {
    cancelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeModal();
    });
  }
  
  // Close on overlay click (but not on modal content)
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      e.stopPropagation();
      closeModal();
    }
  });
  
  // Prevent clicks inside modal from closing it
  const modalContent = shadowRoot.querySelector('.n8n-github-modal');
  if (modalContent) {
    modalContent.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }
}

// Show pull workflows modal
async function showPullWorkflowsModal(shadowRoot, instances, currentInstanceUrl) {
  if (instances.length === 0) {
    showSettingsMessage('No instances configured', 'error');
    return;
  }
  
  // Find current instance or let user select
  let selectedInstance = instances.find(inst => {
    const normalizedUrl = normalizeInstanceUrl(inst.n8nUrl);
    return normalizedUrl === normalizeInstanceUrl(currentInstanceUrl);
  });
  
  if (!selectedInstance && instances.length === 1) {
    selectedInstance = instances[0];
  }
  
  const modal = document.createElement('div');
  modal.id = 'n8n-pull-workflows-modal';
  modal.className = 'n8n-github-modal-overlay';
  
  let instanceSelectorHtml = '';
  if (instances.length > 1) {
    instanceSelectorHtml = `
      <div class="n8n-github-settings-field">
        <label for="pull-instance-select">Select Instance</label>
        <select id="pull-instance-select" style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;">
          ${instances.map(inst => `<option value="${inst.id}" ${inst === selectedInstance ? 'selected' : ''}>${inst.n8nUrl} - ${inst.githubRepo || 'No repo'}</option>`).join('')}
        </select>
      </div>
    `;
  }
  
  modal.innerHTML = `
    <div class="n8n-github-modal" style="max-width: 700px;">
      <div class="n8n-github-modal-header">
        <h3>Pull Workflows from GitHub</h3>
        <button class="n8n-github-modal-close" id="n8n-pull-workflows-close">×</button>
      </div>
      <div class="n8n-github-modal-body">
        ${instanceSelectorHtml}
        <div id="pull-workflows-list" style="max-height: 400px; overflow-y: auto; margin-top: 16px;">
          <p style="text-align: center; color: #6b7280; padding: 20px;">Loading workflows...</p>
        </div>
        <div class="n8n-github-settings-actions" style="margin-top: 16px;">
          <button id="n8n-pull-workflows-import" class="n8n-github-settings-save" disabled>Import Selected</button>
          <button id="n8n-pull-workflows-cancel" class="n8n-github-settings-cancel">Cancel</button>
        </div>
        <div id="n8n-pull-workflows-message" class="n8n-github-settings-message"></div>
      </div>
    </div>
  `;
  
  shadowRoot.appendChild(modal);
  modal.style.display = 'flex';
  
  const closeBtn = shadowRoot.getElementById('n8n-pull-workflows-close');
  const cancelBtn = shadowRoot.getElementById('n8n-pull-workflows-cancel');
  const importBtn = shadowRoot.getElementById('n8n-pull-workflows-import');
  const instanceSelect = shadowRoot.getElementById('pull-instance-select');
  const workflowsList = shadowRoot.getElementById('pull-workflows-list');
  
  let currentInstance = selectedInstance;
  let workflowFiles = [];
  
  const loadWorkflows = async (instance) => {
    if (!instance || !instance.githubRepo || !instance.githubToken) {
      workflowsList.innerHTML = '<p style="color: #ef4444; padding: 20px;">Instance not configured with GitHub repository</p>';
      return;
    }
    
    workflowsList.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 20px;">Loading workflows...</p>';
    
    try {
      const [owner, repo] = instance.githubRepo.split('/');
      const response = await sendMessageSafe({
        action: 'listWorkflowFiles',
        owner: owner,
        repo: repo,
        pathPattern: instance.githubPathPattern || 'workflows/{workflow-name}.json',
        branch: instance.defaultBranch || 'main',
        githubToken: instance.githubToken
      });
      
      if (response && response.success && response.files) {
        workflowFiles = response.files;
        
        if (workflowFiles.length === 0) {
          workflowsList.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 20px;">No workflow files found in repository</p>';
          return;
        }
        
        let workflowsHtml = '<div class="n8n-workflow-list">';
        workflowFiles.forEach((file, index) => {
          const date = new Date(file.lastModified).toLocaleDateString();
          workflowsHtml += `
            <label class="n8n-workflow-item" data-index="${index}" style="display: flex; align-items: center; gap: 12px; padding: 12px; border: 2px solid #e5e7eb; border-radius: 6px; background: #f9fafb; cursor: pointer; transition: all 0.2s ease;">
              <input type="checkbox" id="workflow-${index}" data-index="${index}" style="width: 20px; height: 20px; cursor: pointer; flex-shrink: 0; accent-color: #6366f1;" />
              <div style="flex: 1; min-width: 0;">
                <div style="font-weight: 600; color: #1f2937; margin-bottom: 4px;">${escapeHtml(file.name)}</div>
                <div style="font-size: 12px; color: #6b7280;">${escapeHtml(file.path)} • ${date}</div>
              </div>
            </label>
          `;
        });
        workflowsHtml += '</div>';
        workflowsList.innerHTML = workflowsHtml;
        
        // Add checkbox change listeners and make entire row clickable
        workflowFiles.forEach((file, index) => {
          const checkbox = shadowRoot.getElementById(`workflow-${index}`);
          const label = shadowRoot.querySelector(`label[data-index="${index}"]`);
          
          if (checkbox && label) {
            // Toggle checkbox when label is clicked
            label.addEventListener('click', (e) => {
              // Don't toggle twice if clicking directly on checkbox
              if (e.target !== checkbox) {
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event('change', { bubbles: true }));
              }
            });
            
            // Update button state and visual feedback
            checkbox.addEventListener('change', () => {
              const checked = shadowRoot.querySelectorAll('#pull-workflows-list input[type="checkbox"]:checked').length;
              importBtn.disabled = checked === 0;
              
              // Update visual feedback
              if (checkbox.checked) {
                label.style.borderColor = '#6366f1';
                label.style.background = '#eef2ff';
              } else {
                label.style.borderColor = '#e5e7eb';
                label.style.background = '#f9fafb';
              }
            });
          }
        });
      } else {
        workflowsList.innerHTML = `<p style="color: #ef4444; padding: 20px;">Error: ${response?.error || 'Failed to load workflows'}</p>`;
      }
    } catch (error) {
      workflowsList.innerHTML = `<p style="color: #ef4444; padding: 20px;">Error: ${error.message}</p>`;
    }
  };
  
  // Load workflows for selected instance
  if (currentInstance) {
    await loadWorkflows(currentInstance);
  }
  
  // Handle instance selection change
  if (instanceSelect) {
    instanceSelect.addEventListener('change', async (e) => {
      const instanceId = e.target.value;
      currentInstance = instances.find(inst => inst.id === instanceId);
      await loadWorkflows(currentInstance);
    });
  }
  
  const closeModal = () => {
    modal.style.display = 'none';
    setTimeout(() => modal.remove(), 300);
  };
  
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
  
  if (importBtn) {
    importBtn.addEventListener('click', async () => {
      const checked = Array.from(shadowRoot.querySelectorAll('#pull-workflows-list input[type="checkbox"]:checked'));
      if (checked.length === 0) {
        showModalMessage(shadowRoot, 'n8n-pull-workflows-message', 'Please select at least one workflow', 'error');
        return;
      }
      
      if (!currentInstance) {
        showModalMessage(shadowRoot, 'n8n-pull-workflows-message', 'Please select an instance', 'error');
        return;
      }
      
      importBtn.disabled = true;
      importBtn.textContent = 'Importing...';
      
      let successCount = 0;
      let errorCount = 0;
      
      for (const checkbox of checked) {
        const index = parseInt(checkbox.getAttribute('data-index'));
        const file = workflowFiles[index];
        
        try {
          // Pull workflow file
          const pullResponse = await sendMessageSafe({
            action: 'pullWorkflowFromGitHub',
            instanceUrl: currentInstance.n8nUrl,
            filePath: file.path,
            branch: currentInstance.defaultBranch || 'main'
          });
          
          if (pullResponse && pullResponse.success) {
            // Import to n8n
            const importResponse = await sendMessageSafe({
              action: 'importWorkflowToN8n',
              instanceUrl: currentInstance.n8nUrl,
              workflowData: pullResponse.content.content,
              workflowName: pullResponse.content.name
            });
            
            if (importResponse && importResponse.success) {
              successCount++;
            } else {
              errorCount++;
              log('Failed to import workflow:', file.name, importResponse?.error);
            }
          } else {
            errorCount++;
            log('Failed to pull workflow:', file.name, pullResponse?.error);
          }
        } catch (error) {
          errorCount++;
          log('Error importing workflow:', file.name, error);
        }
      }
      
      if (successCount > 0) {
        showModalMessage(shadowRoot, 'n8n-pull-workflows-message', `Successfully imported ${successCount} workflow(s)${errorCount > 0 ? `. ${errorCount} failed.` : ''}`, 'success');
        setTimeout(() => {
          closeModal();
          // Reload page to show imported workflows
          window.location.reload();
        }, 2000);
      } else {
        showModalMessage(shadowRoot, 'n8n-pull-workflows-message', `Failed to import workflows. ${errorCount} error(s).`, 'error');
        importBtn.disabled = false;
        importBtn.textContent = 'Import Selected';
      }
    });
  }
}

// Show message in settings panel
function showSettingsMessage(message, type, element = null) {
  const shadowRoot = getSettingsPanelShadowRoot();
  const messageEl = element || shadowRoot.getElementById('n8n-github-settings-message') || shadowRoot.getElementById('n8n-detail-message');
  if (messageEl) {
    messageEl.textContent = message;
    messageEl.className = `n8n-github-settings-message ${type}`;
    messageEl.style.display = 'block';
    
    if (type === 'success') {
      setTimeout(() => {
        messageEl.style.display = 'none';
      }, 3000);
    }
  }
}

// Show commit message prompt and return the message (or null if cancelled)
async function showCommitMessagePrompt(config) {
  // Fetch workflow name for better default message
  let workflowName = 'workflow';
  const workflowId = getWorkflowId();
  
  if (config && config.n8nUrl && config.n8nApiKey && workflowId) {
    try {
      const n8nUrl = config.n8nUrl.replace(/\/$/, '');
      const workflowUrl = `${n8nUrl}/api/v1/workflows/${workflowId}`;
      const response = await fetch(workflowUrl, {
        method: 'GET',
        headers: {
          'X-N8N-API-KEY': config.n8nApiKey,
          'Content-Type': 'application/json'
        }
      });
      if (response.ok) {
        const workflowData = await response.json();
        workflowName = workflowData.name || `workflow-${workflowId}`;
      }
    } catch (error) {
      log('Could not fetch workflow name, using default:', error);
    }
  }
  
  // Build default message from template
  const commitMessageTemplate = config?.commitMessage || 'Update workflow: {workflow-name}';
  const defaultMessage = commitMessageTemplate
    .replace('{workflow-name}', workflowName)
    .replace('{workflow-id}', workflowId || '');
  
  // Get default branch
  const defaultBranch = config?.defaultBranch || 'main';
  
  // Load branches if repo and token are configured
  let branches = [defaultBranch];
  if (config?.githubRepo && config?.githubToken) {
    try {
      const [owner, repo] = config.githubRepo.split('/');
      if (owner && repo) {
        const branchResponse = await sendMessageSafe({
          action: 'listBranches',
          owner: owner,
          repo: repo,
          githubToken: config.githubToken
        });
        if (branchResponse && branchResponse.success && branchResponse.branches) {
          branches = branchResponse.branches;
        }
      }
    } catch (error) {
      log('Error loading branches:', error);
    }
  }
  
  return new Promise((resolve) => {
    // Remove existing prompt if any
    const existing = document.getElementById('n8n-github-commit-prompt');
    if (existing) {
      existing.remove();
    }
    
    const prompt = document.createElement('div');
    prompt.id = 'n8n-github-commit-prompt';
    prompt.className = 'n8n-github-commit-prompt';
    
    const branchOptions = branches.map(b => `<option value="${b}" ${b === defaultBranch ? 'selected' : ''}>${b}</option>`).join('');
    
    prompt.innerHTML = `
      <div class="n8n-github-commit-content">
        <div class="n8n-github-commit-header">
          <h3>Commit Message</h3>
          <button class="n8n-github-commit-close" id="n8n-github-commit-close">×</button>
        </div>
        <div class="n8n-github-commit-body">
          <div class="n8n-github-commit-field">
            <label for="commit-branch-select">Branch</label>
            <div style="display: flex; gap: 8px; align-items: flex-end;">
              <select id="commit-branch-select" style="flex: 1; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;">
                ${branchOptions}
              </select>
              <button type="button" id="commit-create-branch-btn" class="n8n-github-settings-save" style="flex: 0 0 auto; padding: 10px 16px; white-space: nowrap;">New Branch</button>
            </div>
            <div id="commit-branch-input-container" style="display: none; margin-top: 8px;">
              <div style="display: flex; gap: 8px;">
                <input type="text" id="commit-new-branch-name" placeholder="Enter branch name" style="flex: 1; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;" />
                <button type="button" id="commit-confirm-branch-btn" class="n8n-github-settings-save" style="padding: 8px 16px;">Create</button>
                <button type="button" id="commit-cancel-branch-btn" class="n8n-github-settings-cancel" style="padding: 8px 16px;">Cancel</button>
              </div>
              <small id="commit-branch-error" style="color: #ef4444; display: none;"></small>
            </div>
            <small>Select branch to commit to</small>
          </div>
          <div class="n8n-github-commit-field">
            <label for="commit-message-input">Enter commit message (or use default):</label>
            <textarea id="commit-message-input" rows="3" placeholder="${defaultMessage}">${defaultMessage}</textarea>
            <small>Leave as is to use the default, or edit to customize</small>
          </div>
          <div class="n8n-github-commit-actions">
            <button id="n8n-github-commit-push" class="n8n-github-commit-push">Push to GitHub</button>
            <button id="n8n-github-commit-cancel" class="n8n-github-commit-cancel">Cancel</button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(prompt);
    
    // Show prompt
    setTimeout(() => {
      prompt.style.display = 'flex';
      const textarea = document.getElementById('commit-message-input');
      if (textarea) {
        textarea.focus();
        textarea.select();
      }
    }, 10);
    
    // Event listeners
    const closeBtn = document.getElementById('n8n-github-commit-close');
    const cancelBtn = document.getElementById('n8n-github-commit-cancel');
    const pushBtn = document.getElementById('n8n-github-commit-push');
    const textarea = document.getElementById('commit-message-input');
    const branchSelect = document.getElementById('commit-branch-select');
    const createBranchBtn = document.getElementById('commit-create-branch-btn');
    
    // Handle create branch button
    const branchInputContainer = document.getElementById('commit-branch-input-container');
    const branchNameInput = document.getElementById('commit-new-branch-name');
    const confirmBranchBtn = document.getElementById('commit-confirm-branch-btn');
    const cancelBranchBtn = document.getElementById('commit-cancel-branch-btn');
    const branchErrorMsg = document.getElementById('commit-branch-error');
    
    if (createBranchBtn && config?.githubRepo && config?.githubToken) {
      // Show input field when "New Branch" is clicked
      createBranchBtn.addEventListener('click', () => {
        branchInputContainer.style.display = 'block';
        branchNameInput.focus();
        createBranchBtn.style.display = 'none';
      });
      
      // Cancel branch creation
      if (cancelBranchBtn) {
        cancelBranchBtn.addEventListener('click', () => {
          branchInputContainer.style.display = 'none';
          branchNameInput.value = '';
          branchErrorMsg.style.display = 'none';
          createBranchBtn.style.display = 'block';
        });
      }
      
      // Confirm branch creation
      if (confirmBranchBtn) {
        confirmBranchBtn.addEventListener('click', async () => {
          const newBranchName = branchNameInput.value.trim();
          
          // Validate branch name
          if (!newBranchName) {
            branchErrorMsg.textContent = 'Branch name is required';
            branchErrorMsg.style.display = 'block';
            return;
          }
          
          // Basic validation
          if (newBranchName.includes('..') || newBranchName.startsWith('.') || newBranchName.endsWith('.')) {
            branchErrorMsg.textContent = 'Invalid branch name format';
            branchErrorMsg.style.display = 'block';
            return;
          }
          
          branchErrorMsg.style.display = 'none';
          const fromBranch = branchSelect.value || defaultBranch;
          const [owner, repo] = config.githubRepo.split('/');
          
          if (!owner || !repo) {
            branchErrorMsg.textContent = 'Invalid repository format';
            branchErrorMsg.style.display = 'block';
            return;
          }
          
          try {
            confirmBranchBtn.disabled = true;
            confirmBranchBtn.textContent = 'Creating...';
            
            const response = await sendMessageSafe({
              action: 'createBranch',
              owner: owner,
              repo: repo,
              branchName: newBranchName,
              fromBranch: fromBranch,
              githubToken: config.githubToken
            });
            
            if (response && response.success) {
              // Add new branch to selector and select it
              const option = document.createElement('option');
              option.value = newBranchName;
              option.textContent = newBranchName;
              option.selected = true;
              branchSelect.appendChild(option);
              branchSelect.value = newBranchName;
              
              // Hide input field
              branchInputContainer.style.display = 'none';
              branchNameInput.value = '';
              createBranchBtn.style.display = 'block';
              
              // Show success notification
              showNotification('Branch created successfully!', 'success');
            } else {
              const errorMsg = response?.error || 'Failed to create branch';
              branchErrorMsg.textContent = errorMsg;
              branchErrorMsg.style.display = 'block';
            }
          } catch (error) {
            const errorMsg = error.message || 'Unknown error';
            branchErrorMsg.textContent = errorMsg;
            branchErrorMsg.style.display = 'block';
          } finally {
            confirmBranchBtn.disabled = false;
            confirmBranchBtn.textContent = 'Create';
          }
        });
        
        // Allow Enter key to submit
        if (branchNameInput) {
          branchNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
              confirmBranchBtn.click();
            }
          });
        }
      }
    }
    
    const cleanup = () => {
      prompt.style.display = 'none';
      setTimeout(() => prompt.remove(), 300);
    };
    
    const handlePush = () => {
      const message = textarea?.value.trim() || defaultMessage;
      const branch = branchSelect?.value || defaultBranch;
      cleanup();
      resolve({ message, branch });
    };
    
    const handleCancel = () => {
      cleanup();
      resolve(null);
    };
    
    if (closeBtn) closeBtn.addEventListener('click', handleCancel);
    if (cancelBtn) cancelBtn.addEventListener('click', handleCancel);
    if (pushBtn) pushBtn.addEventListener('click', handlePush);
    
    // Handle Enter key (Ctrl+Enter to submit, Escape to cancel)
    if (textarea) {
      textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          handlePush();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          handleCancel();
        }
      });
    }
    
    // Close on backdrop click
    prompt.addEventListener('click', (e) => {
      if (e.target === prompt) {
        handleCancel();
      }
    });
  });
}

// Show notification toast
function showNotification(message, type = 'info') {
  // Remove existing notification
  const existing = document.getElementById('n8n-github-notification');
  if (existing) {
    existing.remove();
  }
  
  const notification = document.createElement('div');
  notification.id = 'n8n-github-notification';
  notification.className = `n8n-github-notification n8n-github-notification-${type}`;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  // Trigger animation
  setTimeout(() => {
    notification.classList.add('show');
  }, 10);
  
  // Remove after delay
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => {
      notification.remove();
    }, 300);
  }, 3000);
}

// Main initialization
function init() {
  log('Initializing extension...');
  log('Document ready state:', document.readyState);
  log('Current URL:', window.location.href);
  log('Is n8n page?', isN8nPage());
  
  // Only initialize if we're on an n8n page
  if (!isN8nPage()) {
    log('Not an n8n page, skipping initialization');
    return;
  }
  
  log('Is workflow page?', isWorkflowPage());
  
  // Always inject settings panel and button on n8n pages
  injectSettingsPanel();
  injectSettingsButton();
  
  // Inject push button only on workflow pages
  if (isWorkflowPage()) {
    log('On workflow page, injecting push button');
    injectPushButton();
  } else {
    log('Not on workflow page, skipping push button');
  }
  
  log('Initialization complete');
}

// Run on page load
if (document.readyState === 'loading') {
  log('Document loading, waiting for DOMContentLoaded');
  document.addEventListener('DOMContentLoaded', init);
} else {
  log('Document already loaded, initializing immediately');
  init();
}

// Also try after a short delay (for SPAs)
setTimeout(() => {
  log('Delayed initialization check');
  if (!isN8nPage()) {
    log('Not an n8n page on delayed check, skipping');
    return;
  }
  
  if (!settingsPanelInjected) {
    log('Settings panel not injected yet, retrying...');
    injectSettingsPanel();
    injectSettingsButton();
  }
  
  if (!buttonInjected && isWorkflowPage()) {
    log('Button not injected yet, retrying...');
    injectPushButton();
  }
}, 2000);

// Monitor for SPA navigation (n8n uses client-side routing)
let lastUrl = window.location.href;
setInterval(() => {
  const currentUrl = window.location.href;
  if (currentUrl !== lastUrl) {
    log('URL changed:', { from: lastUrl, to: currentUrl });
    lastUrl = currentUrl;
    buttonInjected = false; // Reset to allow re-injection on new page
    if (isWorkflowPage()) {
      injectPushButton();
    } else {
      // Remove button if not on workflow page
      const btn = document.getElementById('n8n-github-sync-btn');
      if (btn) {
        // #region agent log
        fetch('http://127.0.0.1:7251/ingest/1fcf315c-cfaf-4e58-9364-1acdfd5b87b8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'content.js:urlMonitor:removingButton',message:'Removing button on page change',data:{btnExists:!!btn,parentExists:!!btn.parentElement,timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        // Remove the container (parent) if it exists, otherwise just the button
        const container = btn.parentElement;
        if (container && container.id !== 'n8n-github-sync-btn') {
          container.remove();
        } else {
          btn.remove();
        }
        buttonInjected = false;
      }
    }
  }
  
  // Check if button still exists (monitor for removal by n8n)
  // #region agent log
  const btn = document.getElementById('n8n-github-sync-btn');
  if (buttonInjected && !btn) {
    fetch('http://127.0.0.1:7251/ingest/1fcf315c-cfaf-4e58-9364-1acdfd5b87b8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'content.js:urlMonitor:buttonRemoved',message:'Button was removed from DOM',data:{buttonInjected,btnExists:false,timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    buttonInjected = false;
  }
  // #endregion
}, 1000);

// Also use MutationObserver for more reliable detection
let mutationObserverActive = false;
const observer = new MutationObserver((mutations) => {
  // Throttle mutation observer to avoid excessive logging
  if (mutationObserverActive) return;
  mutationObserverActive = true;
  
  setTimeout(() => {
    if (isWorkflowPage() && !buttonInjected) {
      log('MutationObserver: Workflow page detected, injecting button');
      injectPushButton();
    }
    if (!settingsPanelInjected) {
      log('MutationObserver: Injecting settings');
      injectSettingsPanel();
      injectSettingsButton();
    }
    mutationObserverActive = false;
  }, 500);
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

log('Content script loaded and ready');
