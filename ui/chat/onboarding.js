/**
 * Onboarding flow — embedded in chat.html
 *
 * Checks isFirstRun on load. If true, shows the onboarding wizard
 * inside the main-content container. On completion, animates to
 * reveal the full chat UI.
 */

/* eslint-disable no-unused-vars */
// These functions are called from onclick handlers in the onboarding HTML

let obSelectedAuth = null;
let obKeychainInitialized = false;
let obPermissionsShown = false;

/**
 * Check if onboarding is needed and show it if so.
 * Returns true if onboarding is active (caller should defer chat init).
 */
async function checkAndShowOnboarding() {
  try {
    const isFirstRun = await window.pocketAgent.settings.isFirstRun();
    if (!isFirstRun) return false;
  } catch {
    return false;
  }

  // Show onboarding
  document.body.classList.add('onboarding-active');
  const container = document.getElementById('onboarding-container');
  if (container) container.classList.remove('hidden');

  // Apply platform-specific text
  const platform = window.pocketAgent.app.getPlatform();
  const platformText = getPlatformText(platform);
  const infoEl = document.getElementById('ob-keychain-info-text');
  if (infoEl) infoEl.textContent = platformText.storageInfo;

  return true;
}

function getPlatformText(platform) {
  if (platform === 'darwin') {
    return {
      storageInfo: "Pocket Agent uses your Mac's Keychain to securely store API keys. You may be prompted for your Mac password.",
      storageFallback: 'Could not access Keychain. Keys will be stored unencrypted.',
    };
  } else if (platform === 'win32') {
    return {
      storageInfo: 'Pocket Agent uses Windows Credential Store to securely store API keys.',
      storageFallback: 'Could not access Credential Store. Keys will be stored unencrypted.',
    };
  }
  return {
    storageInfo: 'Pocket Agent uses your system keyring to securely store API keys. You may be prompted for your keyring password.',
    storageFallback: 'Could not access system keyring. Keys will be stored unencrypted.',
  };
}

// SVG icons used across onboarding
const OB_ICONS = {
  check: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 14.5s1.5 0 3.5 3.5c0 0 5.559-9.167 10.5-11"/></svg>',
  cross: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M18 6L6 18m12 0L6 6"/></svg>',
  arrow: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 6s6 4.419 6 6s-6 6-6 6"/></svg>',
  lock: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 12c0 5.523-4.477 10-10 10S2 17.523 2 12S6.477 2 12 2s10 4.477 10 10Z"/><path stroke-linecap="round" d="M12 13a2 2 0 1 0 0-4a2 2 0 0 0 0 4Zm0 0v3"/></g></svg>',
  shield: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M18.709 3.495C16.817 2.554 14.5 2 12 2s-4.816.554-6.709 1.495c-.928.462-1.392.693-1.841 1.419S3 6.342 3 7.748v3.49c0 5.683 4.542 8.842 7.173 10.196c.734.377 1.1.566 1.827.566s1.093-.189 1.827-.566C16.457 20.08 21 16.92 21 11.237V7.748c0-1.406 0-2.108-.45-2.834s-.913-.957-1.841-1.419"/></svg>',
  refresh: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="m15.167 1l.598 1.118c.404.755.606 1.133.472 1.295c-.133.162-.573.031-1.454-.23A9.8 9.8 0 0 0 12 2.78c-5.247 0-9.5 4.128-9.5 9.22a8.97 8.97 0 0 0 1.27 4.61M8.834 23l-.598-1.118c-.404-.756-.606-1.134-.472-1.295c.133-.162.573-.032 1.454.23c.88.261 1.815.402 2.783.402c5.247 0 9.5-4.128 9.5-9.22a8.97 8.97 0 0 0-1.27-4.609"/></svg>',
  signin: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M8 8c0-.575 0-.822.045-1.075A2.98 2.98 0 0 1 9.833 4.7c.24-.1.523-.165 1.09-.294l2.728-.623c3.39-.774 5.084-1.161 6.217-.27C21 4.405 21 6.126 21 9.568v4.864c0 3.442 0 5.164-1.132 6.055c-1.133.891-2.827.504-6.217-.27l-2.728-.623c-.567-.13-.85-.194-1.09-.294a2.98 2.98 0 0 1-1.788-2.225C8 16.822 8 16.575 8 16"/><path d="M13 9s3 2.21 3 3s-3 3-3 3m2.5-3H3"/></g></svg>',
  minus: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 12H4"/></svg>',
  info: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" stroke-width="1.5"/><path stroke-width="1.5" d="M12 16v-4.5"/><path stroke-width="1.8" d="M12 8.012v-.01"/></g></svg>',
  chat: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7.5 8.5h9m-9 4H13m-11-2c0-.77.013-1.523.04-2.25c.083-2.373.125-3.56 1.09-4.533c.965-.972 2.186-1.024 4.626-1.129A100 100 0 0 1 12 2.5c1.48 0 2.905.03 4.244.088c2.44.105 3.66.157 4.626 1.13c.965.972 1.007 2.159 1.09 4.532a64 64 0 0 1 0 4.5c-.083 2.373-.125 3.56-1.09 4.533c-.965.972-2.186 1.024-4.626 1.129q-1.102.047-2.275.07c-.74.014-1.111.02-1.437.145s-.6.358-1.148.828l-2.179 1.87A.73.73 0 0 1 8 20.77v-2.348l-.244-.01c-2.44-.105-3.66-.157-4.626-1.13c-.965-.972-1.007-2.159-1.09-4.532A64 64 0 0 1 2 10.5"/></svg>',
};

function obShowStep(stepId) {
  document.querySelectorAll('.ob-step').forEach(s => s.classList.remove('active'));
  const step = document.getElementById(stepId);
  if (step) step.classList.add('active');

  // Reset step states on navigation
  if (stepId === 'ob-step-keychain') {
    const btn = document.getElementById('ob-keychain-btn');
    btn.disabled = false;
    if (obKeychainInitialized) {
      btn.innerHTML = OB_ICONS.check + ' Secured';
    } else {
      btn.innerHTML = OB_ICONS.lock + ' Secure My Keys';
    }
    document.getElementById('ob-keychain-status').innerHTML = '';
  } else if (stepId === 'ob-step-permissions') {
    const btn = document.getElementById('ob-perm-refresh-btn');
    btn.disabled = false;
    btn.innerHTML = OB_ICONS.refresh + ' Refresh';
    obRefreshPermissions();
  } else if (stepId === 'ob-step-auth') {
    document.querySelectorAll('.ob-auth-option').forEach(el => el.classList.remove('selected'));
  } else if (stepId === 'ob-step-oauth') {
    document.getElementById('ob-oauth-status').innerHTML = '';
    const btn = document.getElementById('ob-oauth-btn');
    btn.disabled = false;
    btn.innerHTML = OB_ICONS.signin + ' Sign in';
  } else if (stepId === 'ob-step-oauth-code') {
    document.getElementById('ob-oauth-code-status').innerHTML = '';
    document.getElementById('ob-oauth-code').value = '';
    const btn = document.getElementById('ob-oauth-complete-btn');
    btn.disabled = false;
    btn.innerHTML = 'Continue ' + OB_ICONS.arrow;
  } else if (stepId === 'ob-step-api') {
    document.getElementById('ob-api-status').innerHTML = '';
    const btn = document.getElementById('ob-api-btn');
    btn.disabled = false;
    btn.innerHTML = 'Continue ' + OB_ICONS.arrow;
  }
}

async function obInitKeychain() {
  const btn = document.getElementById('ob-keychain-btn');
  const statusDiv = document.getElementById('ob-keychain-status');

  btn.disabled = true;
  btn.innerHTML = '<span class="ob-spinner"></span> Initializing...';

  try {
    const result = await window.pocketAgent.settings.initializeKeychain();
    if (result.available) {
      obKeychainInitialized = true;
      statusDiv.innerHTML = `<div class="ob-status success">${OB_ICONS.check} Secure storage enabled! Your keys are safe with me</div>`;
      setTimeout(() => obCheckAndShowPermissions(), 1000);
    } else {
      const platform = window.pocketAgent.app.getPlatform();
      statusDiv.innerHTML = `<div class="ob-status error">${OB_ICONS.cross} ${result.error || getPlatformText(platform).storageFallback}</div>`;
      btn.disabled = false;
      btn.innerHTML = OB_ICONS.lock + ' Try Again';
    }
  } catch (err) {
    statusDiv.innerHTML = `<div class="ob-status error">${OB_ICONS.cross} <span>${err.message || 'Failed to initialize secure storage'}</span></div>`;
    btn.disabled = false;
    btn.innerHTML = OB_ICONS.lock + ' Try Again';
  }
}

function obSkipKeychain() {
  obCheckAndShowPermissions();
}

async function obCheckAndShowPermissions() {
  try {
    const mac = await window.pocketAgent.permissions.isMacOS();
    if (!mac) {
      obShowStep('ob-step-auth');
      return;
    }
    obPermissionsShown = true;
    obShowStep('ob-step-permissions');
    obRefreshPermissions();
  } catch {
    obShowStep('ob-step-auth');
  }
}

async function obRefreshPermissions() {
  const container = document.getElementById('ob-permissions-list');
  const btn = document.getElementById('ob-perm-refresh-btn');

  btn.disabled = true;
  btn.innerHTML = '<span class="ob-spinner"></span> Checking...';

  try {
    const statuses = await window.pocketAgent.permissions.check([
      'full-disk-access',
      'accessibility',
      'screen-recording',
    ]);
    container.innerHTML = statuses.map(s => {
      const iconClass = s.granted ? 'granted' : 'missing';
      const iconSvg = s.granted ? OB_ICONS.check : OB_ICONS.minus;
      const hint = (!s.granted && s.type === 'full-disk-access')
        ? '<p style="color: var(--orange); margin-top: 2px;">Requires app restart to detect</p>'
        : '';
      const actionHtml = s.granted
        ? ''
        : `<div class="ob-perm-action"><button class="ob-btn secondary" onclick="obOpenPermSettings('${s.type}')">Open Settings</button></div>`;
      return `
        <div class="ob-perm-item">
          <div class="ob-perm-icon ${iconClass}">${iconSvg}</div>
          <div class="ob-perm-text">
            <h4>${s.label}</h4>
            <p>${s.description}</p>
            ${hint}
          </div>
          ${actionHtml}
        </div>
      `;
    }).join('');
  } catch {
    container.innerHTML = `<div class="ob-status error">${OB_ICONS.cross} <span>Could not check permissions</span></div>`;
  }

  btn.disabled = false;
  btn.innerHTML = OB_ICONS.refresh + ' Refresh';
}

async function obOpenPermSettings(type) {
  try {
    await window.pocketAgent.permissions.openSettings(type);
  } catch (err) {
    console.error('Failed to open permission settings:', err);
  }
}

function obGoBackFromAuth() {
  if (obPermissionsShown) {
    obShowStep('ob-step-permissions');
  } else {
    obShowStep('ob-step-keychain');
  }
}

function obSelectAuth(method, el) {
  obSelectedAuth = method;
  document.querySelectorAll('.ob-auth-option').forEach(opt => opt.classList.remove('selected'));
  el.classList.add('selected');

  setTimeout(() => {
    if (method === 'oauth') {
      obShowStep('ob-step-oauth');
    } else {
      obShowStep('ob-step-api');
      document.getElementById('ob-anthropic-key').focus();
    }
  }, 200);
}

function obToggleOptional(header) {
  const content = header.nextElementSibling;
  header.classList.toggle('expanded');
  content.classList.toggle('show');
}

async function obStartOAuth() {
  const btn = document.getElementById('ob-oauth-btn');
  const statusDiv = document.getElementById('ob-oauth-status');

  btn.disabled = true;
  btn.innerHTML = '<span class="ob-spinner"></span> Opening browser...';

  try {
    const result = await window.pocketAgent.auth.startOAuth();
    if (result.success) {
      obShowStep('ob-step-oauth-code');
      document.getElementById('ob-oauth-code').focus();
    } else {
      statusDiv.innerHTML = `<div class="ob-status error">${OB_ICONS.cross} ${result.error || 'Failed to open browser. Please try again.'}</div>`;
    }
  } catch (err) {
    statusDiv.innerHTML = `<div class="ob-status error">${OB_ICONS.cross} ${err.message || 'Connection failed'}</div>`;
  }

  btn.disabled = false;
  btn.innerHTML = OB_ICONS.signin + ' Sign in';
}

async function obCompleteOAuth() {
  const code = document.getElementById('ob-oauth-code').value.trim();
  const statusDiv = document.getElementById('ob-oauth-code-status');
  const btn = document.getElementById('ob-oauth-complete-btn');

  if (!code) {
    statusDiv.innerHTML = `<div class="ob-status error">${OB_ICONS.cross} Please paste the authorization code from your browser</div>`;
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="ob-spinner"></span> Verifying...';
  statusDiv.innerHTML = '';

  try {
    const result = await window.pocketAgent.auth.completeOAuth(code);
    if (result.success) {
      // Save optional keys
      const kimiKey = document.getElementById('ob-kimi-key-oauth').value.trim();
      if (kimiKey) await window.pocketAgent.settings.set('moonshot.apiKey', kimiKey);
      const glmKey = document.getElementById('ob-glm-key-oauth').value.trim();
      if (glmKey) await window.pocketAgent.settings.set('glm.apiKey', glmKey);
      obShowStep('ob-step-success');
    } else {
      statusDiv.innerHTML = `<div class="ob-status error">${OB_ICONS.cross} ${result.error || 'Invalid code. Please try again.'}</div>`;
    }
  } catch (err) {
    statusDiv.innerHTML = `<div class="ob-status error">${OB_ICONS.cross} ${err.message || 'Verification failed'}</div>`;
  }

  btn.disabled = false;
  btn.innerHTML = 'Continue ' + OB_ICONS.arrow;
}

async function obCancelOAuth() {
  try {
    await window.pocketAgent.auth.cancelOAuth();
  } catch (err) {
    console.error('Failed to cancel OAuth:', err);
  }
  document.getElementById('ob-oauth-code').value = '';
  document.getElementById('ob-oauth-code-status').innerHTML = '';
  obShowStep('ob-step-auth');
}

async function obValidateAndSave() {
  const anthropicKey = document.getElementById('ob-anthropic-key').value.trim();
  const kimiKey = document.getElementById('ob-kimi-key-api').value.trim();
  const glmKey = document.getElementById('ob-glm-key-api').value.trim();
  const statusDiv = document.getElementById('ob-api-status');
  const btn = document.getElementById('ob-api-btn');

  if (!anthropicKey && !kimiKey && !glmKey) {
    statusDiv.innerHTML = `<div class="ob-status error">${OB_ICONS.cross} Please enter at least one API key</div>`;
    return;
  }

  if (anthropicKey && !/^sk-ant-[A-Za-z0-9_-]{90,}$/.test(anthropicKey)) {
    statusDiv.innerHTML = `<div class="ob-status error">${OB_ICONS.cross} Anthropic keys start with "sk-ant-"</div>`;
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="ob-spinner"></span> Validating...';
  statusDiv.innerHTML = '';

  try {
    if (anthropicKey) {
      const result = await window.pocketAgent.validate.anthropicKey(anthropicKey);
      if (!result.valid) {
        statusDiv.innerHTML = `<div class="ob-status error">${OB_ICONS.cross} ${result.error || 'Invalid Anthropic API key'}</div>`;
        btn.disabled = false;
        btn.innerHTML = 'Continue ' + OB_ICONS.arrow;
        return;
      }
    }

    await window.pocketAgent.settings.set('auth.method', 'api_key');
    if (anthropicKey) await window.pocketAgent.settings.set('anthropic.apiKey', anthropicKey);
    if (kimiKey) await window.pocketAgent.settings.set('moonshot.apiKey', kimiKey);
    if (glmKey) await window.pocketAgent.settings.set('glm.apiKey', glmKey);

    // Auto-select matching model if default doesn't match available keys
    const currentModel = await window.pocketAgent.settings.get('agent.model');
    const isAnthropicModel = !currentModel || currentModel.startsWith('claude-');
    if (isAnthropicModel && !anthropicKey) {
      if (kimiKey) {
        await window.pocketAgent.settings.set('agent.model', 'kimi-k2.5');
      } else if (glmKey) {
        await window.pocketAgent.settings.set('agent.model', 'glm-4.7');
      }
    }

    obShowStep('ob-step-success');
  } catch (err) {
    statusDiv.innerHTML = `<div class="ob-status error">${OB_ICONS.cross} ${err.message || 'Validation failed'}</div>`;
    btn.disabled = false;
    btn.innerHTML = 'Continue ' + OB_ICONS.arrow;
  }
}

async function obFinishSetup() {
  const btn = document.querySelector('#ob-step-success .ob-btn.primary');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="ob-spinner"></span> Setting up...';
  }

  try {
    // Mark onboarding as completed
    await window.pocketAgent.settings.set('onboarding.completed', 'true');
    // Restart agent with new settings
    await window.pocketAgent.agent.restart();
  } catch (err) {
    console.error('Failed to finish setup:', err);
  }

  // Animate transition: hide onboarding, reveal chat
  const container = document.getElementById('onboarding-container');
  container.classList.add('hiding');

  // After fade out, remove onboarding and reveal chat
  setTimeout(() => {
    document.body.classList.remove('onboarding-active');
    container.remove();

    // Now run the normal chat initialization
    if (typeof initializeChatAfterOnboarding === 'function') {
      initializeChatAfterOnboarding();
    }
  }, 500);
}

// Enter key handlers
document.addEventListener('DOMContentLoaded', () => {
  const anthropicInput = document.getElementById('ob-anthropic-key');
  if (anthropicInput) {
    anthropicInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') obValidateAndSave();
    });
  }
  const oauthCodeInput = document.getElementById('ob-oauth-code');
  if (oauthCodeInput) {
    oauthCodeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') obCompleteOAuth();
    });
  }
});
