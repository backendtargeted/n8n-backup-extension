// Content script for n8n GitHub Backup Extension

const DEBUG = true; // Set to false to disable console logs

function log(...args) {
  if (DEBUG) {
    console.log('[n8n GitHub Extension]', ...args);
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
  log('getInstanceUrl:', origin);
  return origin;
}

// Find header element with multiple strategies
function findHeader() {
  log('Finding header element...');
  
  // #region agent log
  fetch('http://127.0.0.1:7251/ingest/1fcf315c-cfaf-4e58-9364-1acdfd5b87b8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'content.js:findHeader:entry',message:'findHeader called',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  
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
      const configResponse = await chrome.runtime.sendMessage({ 
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
    const commitMessage = await showCommitMessagePrompt(config);
    if (commitMessage === null) {
      // User cancelled
      return;
    }
    
    btn.disabled = true;
    btn.innerHTML = 'Pushing...';
    
    try {
      log('Sending message to background script...');
      const response = await chrome.runtime.sendMessage({
        action: 'pushToGit',
        workflowId: workflowId,
        instanceUrl: instanceUrl,
        commitMessage: commitMessage || undefined
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
  
  container.appendChild(btn);
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
      max-width: 600px;
      max-height: 90vh;
      overflow-y: auto;
      animation: slideIn 0.2s ease;
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
    
    .n8n-instance-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      background: #f9fafb;
      transition: background-color 0.2s ease, border-color 0.2s ease;
    }
    
    .n8n-instance-item:hover {
      background: #f3f4f6;
      border-color: #d1d5db;
    }
    
    .n8n-instance-info {
      flex: 1;
      min-width: 0;
    }
    
    .n8n-instance-url {
      font-weight: 600;
      color: #1f2937;
      font-size: 14px;
      margin-bottom: 6px;
      word-break: break-all;
      pointer-events: none;
      user-select: text;
      cursor: text;
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
    
    .n8n-instance-details {
      display: flex;
      gap: 16px;
      font-size: 12px;
      color: #6b7280;
    }
    
    .n8n-instance-details span {
      white-space: nowrap;
    }
    
    .n8n-instance-actions {
      display: flex;
      gap: 8px;
      margin-left: 16px;
    }
    
    .n8n-instance-edit-btn,
    .n8n-instance-delete-btn {
      padding: 6px 12px;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: background-color 0.2s ease;
    }
    
    .n8n-instance-edit-btn {
      background: #6366f1;
      color: white;
    }
    
    .n8n-instance-edit-btn:hover {
      background: #4f46e5;
    }
    
    .n8n-instance-delete-btn {
      background: #ef4444;
      color: white;
    }
    
    .n8n-instance-delete-btn:hover {
      background: #dc2626;
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
      
      .n8n-github-settings-header {
        border-bottom-color: #374151;
      }
      
      .n8n-github-settings-header h3 {
        color: #f9fafb;
      }
      
      .n8n-github-settings-close {
        color: #9ca3af;
      }
      
      .n8n-github-settings-close:hover {
        background: #374151;
        color: #f9fafb;
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
      
      .n8n-instance-item {
        background: #111827;
        border-color: #374151;
      }
      
      .n8n-instance-item:hover {
        background: #1f2937;
        border-color: #4b5563;
      }
      
      .n8n-instance-url {
        color: #f9fafb;
      }
      
      .n8n-instance-details {
        color: #9ca3af;
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
      <div class="n8n-github-settings-header">
        <div>
          <h3>n8n GitHub Backup Settings</h3>
        </div>
        <button class="n8n-github-settings-close" id="n8n-github-settings-close">×</button>
      </div>
      <div class="n8n-github-settings-body" id="n8n-github-settings-body">
        <!-- Content will be dynamically loaded -->
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
  
  // Show list view by default
  showInstanceListView();
}

// Show instance list view
async function showInstanceListView() {
  const shadowRoot = getSettingsPanelShadowRoot();
  const body = shadowRoot.getElementById('n8n-github-settings-body');
  if (!body) return;
  
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getAllInstanceConfigs' });
    const instances = (response && response.success && response.configs) ? response.configs : [];
    const currentInstanceUrl = getInstanceUrl();
    
    let instancesHtml = '';
    if (instances.length === 0) {
      instancesHtml = '<p style="text-align: center; color: #6b7280; padding: 20px;">No instances configured. Click "Add New Instance" to get started.</p>';
    } else {
      instancesHtml = '<div class="n8n-instance-list">';
      instances.forEach(inst => {
        const normalizedUrl = normalizeInstanceUrl(inst.n8nUrl);
        const isCurrent = normalizeInstanceUrl(currentInstanceUrl) === normalizedUrl;
        const currentBadge = isCurrent ? '<span class="n8n-instance-current-badge">Current</span>' : '';
        
        instancesHtml += `
          <div class="n8n-instance-item">
            <div class="n8n-instance-info">
              <div class="n8n-instance-url">${escapeHtml(inst.n8nUrl)} ${currentBadge}</div>
              <div class="n8n-instance-details">
                <span>Repo: ${escapeHtml(inst.githubRepo || 'Not set')}</span>
                <span>Path: ${escapeHtml(inst.githubPathPattern || 'workflows/{workflow-name}.json')}</span>
              </div>
            </div>
            <div class="n8n-instance-actions">
              <button class="n8n-instance-edit-btn" data-instance-id="${inst.id}">Edit</button>
              <button class="n8n-instance-delete-btn" data-instance-id="${inst.id}">Delete</button>
            </div>
          </div>
        `;
      });
      instancesHtml += '</div>';
    }
    
    body.innerHTML = `
      <div style="margin-bottom: 16px;">
        <button id="n8n-add-instance-btn" class="n8n-github-settings-save">+ Add New Instance</button>
      </div>
      ${instancesHtml}
    `;
    
    // Event listeners
    const addBtn = shadowRoot.getElementById('n8n-add-instance-btn');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        log('Add New Instance button clicked');
        showInstanceEditView(null);
      });
    }
    
    shadowRoot.querySelectorAll('.n8n-instance-edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const instanceId = e.target.getAttribute('data-instance-id');
        log('Edit button clicked for instance:', instanceId);
        showInstanceEditView(instanceId);
      });
    });
    
    shadowRoot.querySelectorAll('.n8n-instance-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const instanceId = e.target.getAttribute('data-instance-id');
        if (confirm('Are you sure you want to delete this instance configuration?')) {
          await deleteInstance(instanceId);
        }
      });
    });
  } catch (error) {
    log('Error loading instances:', error);
    body.innerHTML = '<p style="color: #ef4444;">Error loading instances. Please try again.</p>';
  }
}

// Normalize instance URL helper
function normalizeInstanceUrl(url) {
  try {
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.host}`;
  } catch (e) {
    const match = url.match(/^(https?:\/\/[^\/]+)/);
    return match ? match[1] : url;
  }
}

// Escape HTML to prevent XSS and n8n URL detection
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Show instance edit view
async function showInstanceEditView(instanceId) {
  log('showInstanceEditView called with instanceId:', instanceId);
  const shadowRoot = getSettingsPanelShadowRoot();
  const body = shadowRoot.getElementById('n8n-github-settings-body');
  if (!body) {
    log('Settings body not found!');
    return;
  }
  
  currentEditingInstanceId = instanceId;
  let config = {
    n8nUrl: '',
    n8nApiKey: '',
    githubRepo: '',
    githubToken: '',
    githubPathPattern: 'workflows/{workflow-name}.json',
    commitMessage: 'Update workflow: {workflow-name}'
  };
  
  if (instanceId) {
    // Editing existing instance - load its config
    try {
      const response = await chrome.runtime.sendMessage({ 
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
    // Adding new instance - auto-fill URL from current page
    const currentUrl = getInstanceUrl();
    config.n8nUrl = currentUrl;
    
    // Also try to load existing config for this URL (if it exists from legacy storage)
    try {
      const response = await chrome.runtime.sendMessage({ 
        action: 'getConfig',
        instanceUrl: currentUrl
      });
      if (response && response.success && response.config) {
        const existingConfig = response.config;
        // Only use existing config if it has actual values (not just defaults)
        if (existingConfig.n8nApiKey || existingConfig.githubRepo || existingConfig.githubToken) {
          config = {
            ...config,
            n8nApiKey: existingConfig.n8nApiKey || '',
            githubRepo: existingConfig.githubRepo || '',
            githubToken: existingConfig.githubToken || '',
            githubPathPattern: existingConfig.githubPathPattern || config.githubPathPattern,
            commitMessage: existingConfig.commitMessage || config.commitMessage
          };
        }
      }
    } catch (error) {
      log('Error loading existing config:', error);
    }
  }
  
  const isNewInstance = !instanceId;
  const urlReadonly = isNewInstance ? 'readonly' : '';
  const urlNote = isNewInstance ? ' (auto-detected from current page)' : '';
  
  body.innerHTML = `
    <div style="margin-bottom: 16px;">
      <button id="n8n-back-to-list-btn" class="n8n-github-settings-cancel">← Back to List</button>
    </div>
    <div class="n8n-github-settings-field">
      <label for="n8n-url">n8n Instance URL *${urlNote}</label>
      <input type="text" id="n8n-url" placeholder="https://n8n.example.com or http://localhost:5678" value="${escapeHtml(config.n8nUrl || '')}" autocomplete="off" data-lpignore="true" ${urlReadonly} style="${urlReadonly ? 'background-color: #f3f4f6; cursor: not-allowed;' : ''}" />
      <small>${isNewInstance ? 'Auto-detected from current page. You can edit this if needed.' : 'Base URL of your n8n instance'}</small>
    </div>
    
    <div class="n8n-github-settings-field">
      <label for="n8n-api-key">n8n API Key *</label>
      <input type="password" id="n8n-api-key" placeholder="Your n8n API key" value="${escapeHtml(config.n8nApiKey || '')}" autocomplete="new-password" data-lpignore="true" />
      <small>Found in n8n Settings > API</small>
    </div>
    
    <div class="n8n-github-settings-field">
      <label for="github-repo">GitHub Repository *</label>
      <input type="text" id="github-repo" placeholder="owner/repo" value="${escapeHtml(config.githubRepo || '')}" autocomplete="off" data-lpignore="true" />
      <small>Format: owner/repository-name</small>
    </div>
    
    <div class="n8n-github-settings-field">
      <label for="github-token">GitHub Personal Access Token *</label>
      <input type="password" id="github-token" placeholder="ghp_xxxxxxxxxxxx" value="${escapeHtml(config.githubToken || '')}" autocomplete="new-password" data-lpignore="true" />
      <small>Token with 'repo' scope. Create at: github.com/settings/tokens</small>
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
  const backBtn = shadowRoot.getElementById('n8n-back-to-list-btn');
  const cancelBtn = shadowRoot.getElementById('n8n-github-settings-cancel');
  const saveBtn = shadowRoot.getElementById('n8n-github-settings-save');
  
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      showInstanceListView();
    });
  }
  
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      showInstanceListView();
    });
  }
  
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      await saveInstanceSettings();
    });
  }
  
  // Ensure all input fields are editable (prevent autofill from blocking)
  // But keep URL field readonly for new instances
  setTimeout(() => {
    const inputs = body.querySelectorAll('input');
    const urlInput = shadowRoot.getElementById('n8n-url');
    
    inputs.forEach(input => {
      // Skip URL field if it's a new instance (keep it readonly)
      if (input === urlInput && isNewInstance) {
        // Allow editing URL for new instances if user double-clicks or explicitly wants to change it
        input.addEventListener('dblclick', function() {
          this.readOnly = false;
          this.removeAttribute('readonly');
          this.style.backgroundColor = '';
          this.style.cursor = '';
          this.focus();
          this.select();
        });
        return;
      }
      
      // Remove readonly if it exists (for other fields)
      input.removeAttribute('readonly');
      // Ensure autocomplete is set
      if (input.type === 'password') {
        input.setAttribute('autocomplete', 'new-password');
      } else {
        input.setAttribute('autocomplete', 'off');
      }
      input.setAttribute('data-lpignore', 'true');
      // Force editable
      input.readOnly = false;
      input.disabled = false;
      
      // Add focus handler to ensure field is editable when clicked
      input.addEventListener('focus', function() {
        this.readOnly = false;
        this.removeAttribute('readonly');
        // Select all text to make it easy to replace
        if (this.value) {
          setTimeout(() => this.select(), 10);
        }
      });
    });
  }, 100);
}

// Delete instance
async function deleteInstance(instanceId) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'deleteInstance',
      instanceId: instanceId
    });
    
    if (response && response.success) {
      showInstanceListView();
    } else {
      showSettingsMessage(`Error: ${response?.error || 'Failed to delete instance'}`, 'error');
    }
  } catch (error) {
    log('Error deleting instance:', error);
    showSettingsMessage(`Error: ${error.message}`, 'error');
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
      commitMessage
    };
    
    let response;
    if (currentEditingInstanceId) {
      // Update existing instance
      response = await chrome.runtime.sendMessage({
        action: 'updateInstance',
        instanceId: currentEditingInstanceId,
        config: config
      });
    } else {
      // Add new instance
      response = await chrome.runtime.sendMessage({
        action: 'addInstance',
        config: config
      });
    }
    
    if (response && response.success) {
      showSettingsMessage('Settings saved successfully!', 'success');
      setTimeout(() => {
        showInstanceListView();
      }, 1000);
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
  const shadowRoot = getSettingsPanelShadowRoot();
  const panel = shadowRoot.getElementById('n8n-github-settings-panel');
  if (!panel) {
    log('Settings panel not found, injecting...');
    injectSettingsPanel();
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

// Show message in settings panel
function showSettingsMessage(message, type) {
  const shadowRoot = getSettingsPanelShadowRoot();
  const messageEl = shadowRoot.getElementById('n8n-github-settings-message');
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
  
  return new Promise((resolve) => {
    // Remove existing prompt if any
    const existing = document.getElementById('n8n-github-commit-prompt');
    if (existing) {
      existing.remove();
    }
    
    const prompt = document.createElement('div');
    prompt.id = 'n8n-github-commit-prompt';
    prompt.className = 'n8n-github-commit-prompt';
    
    prompt.innerHTML = `
      <div class="n8n-github-commit-content">
        <div class="n8n-github-commit-header">
          <h3>Commit Message</h3>
          <button class="n8n-github-commit-close" id="n8n-github-commit-close">×</button>
        </div>
        <div class="n8n-github-commit-body">
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
    
    const cleanup = () => {
      prompt.style.display = 'none';
      setTimeout(() => prompt.remove(), 300);
    };
    
    const handlePush = () => {
      const message = textarea?.value.trim() || defaultMessage;
      cleanup();
      resolve(message);
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
  log('Is workflow page?', isWorkflowPage());
  
  // Always inject settings panel and button
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
  if (!buttonInjected && isWorkflowPage()) {
    log('Button not injected yet, retrying...');
    injectPushButton();
  }
  if (!settingsPanelInjected) {
    log('Settings not injected yet, retrying...');
    injectSettingsPanel();
    injectSettingsButton();
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
