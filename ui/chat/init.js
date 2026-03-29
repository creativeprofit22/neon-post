/**
 * Full chat initialization — runs either immediately on load (no onboarding)
 * or after onboarding completes (called by obFinishSetup).
 */
async function initializeChat() {
  // Load current model
  await updateModelBadge();

  // Refresh model badge when window gains focus (in case user changed it in settings)
  window.addEventListener('focus', updateModelBadge);

  // Reload history when window regains visibility (e.g. after sleep/wake)
  // Throttle to avoid nuking image placeholders on quick tab switches
  let lastHistoryLoad = Date.now();
  document.addEventListener('visibilitychange', () => {
    document.body.classList.toggle('animations-paused', document.hidden);
    if (!document.hidden && Date.now() - lastHistoryLoad > 30_000) {
      lastHistoryLoad = Date.now();
      loadHistory();
    }
  });
  window.addEventListener('blur', () => document.body.classList.add('animations-paused'));
  window.addEventListener('focus', () => document.body.classList.remove('animations-paused'));


  // Load user/agent profile for placeholder and empty state
  await loadUserProfile();

  // Refresh profile when window regains focus (in case user changed it in Personalize)
  window.addEventListener('focus', loadUserProfile);

  // Load sessions first (sets currentSessionId), then init mode for correct session
  await loadSessions();
  await initAgentMode();
  ensureStatusListener(currentSessionId);
  await loadHistory();
  updateStats();
  input.focus();

  // Initialize notification sound
  initNotificationSound();

  // Connect to global chat server (stay online while app is open)
  await getOrCreateChatUsername();
  connectChatWs();

  // Listen for chat username changes from settings window
  window.pocketAgent.chat.onUsernameChanged((newUsername) => {
    console.log('[Chat] Username changed via settings:', newUsername);
    globalChatUsername = newUsername;
    // Clear any pending reconnect timer and reconnect with new username
    clearTimeout(chatWsReconnectTimer);
    if (chatWs) {
      chatWs.onclose = null; // Prevent auto-reconnect with old handler
      chatWs.close();
      chatWs = null;
    }
    connectChatWs();
    // Update header badge if in chat mode
    if (globalChatMode) updateHeaderTierBadge();
  });

  // Listen for scheduler messages
  window.pocketAgent.events.onSchedulerMessage((data) => {
    console.log('[Chat] Received scheduler message:', data.jobName, 'sessionId:', data.sessionId, 'currentSession:', currentSessionId);
    handleSchedulerMessage(data);
  });

  // Listen for Telegram messages (cross-channel sync)
  window.pocketAgent.events.onTelegramMessage((data) => {
    handleTelegramMessage(data);
  });

  // Listen for iOS messages (cross-channel sync)
  window.pocketAgent.events.onIOSMessage((data) => {
    console.log('[Chat] Received iOS message:', data);
    handleIOSMessage(data);
  });

  // Listen for session clears from iOS
  window.pocketAgent.sessions.onCleared((sessionId) => {
    console.log('[Chat] Session cleared from iOS:', sessionId);
    if (sessionId === currentSessionId) {
      disableAutoAnimate(); messagesDiv.innerHTML = ''; enableAutoAnimate();
      showEmptyState();
      updateStats();
    }
  });

  // Listen for session changes (e.g., Telegram link/unlink)
  window.pocketAgent.sessions.onChanged(() => {
    console.log('[Chat] Sessions changed, reloading...');
    loadSessions();
  });

  // Listen for model changes (e.g., changed via Telegram)
  window.pocketAgent.events.onModelChanged((model) => {
    console.log('[Chat] Model changed to:', model);
    updateModelBadge();
  });

  // Listen for image generation started (show placeholder)
  if (window.pocketAgent.social?.onImageGenerating) {
    console.log('[Chat] Registering onImageGenerating listener');
    window.pocketAgent.social.onImageGenerating((data) => {
      console.log('[Chat] onImageGenerating fired:', data.predictionId, data.prompt?.slice(0, 60));
      addImagePlaceholder(data.predictionId, data.prompt, data.model);
    });
  }

  // Listen for generated image results
  if (window.pocketAgent.social?.onImageReady) {
    console.log('[Chat] Registering onImageReady listener');
    window.pocketAgent.social.onImageReady((data) => {
      console.log('[Chat] onImageReady fired:', data.predictionId, data.imageUrl?.slice(0, 80));
      replaceImagePlaceholder(data.predictionId, data);
    });
  } else {
    console.warn('[Chat] onImageReady not available on social API');
  }
  if (window.pocketAgent.social?.onImageFailed) {
    console.log('[Chat] Registering onImageFailed listener');
    window.pocketAgent.social.onImageFailed((data) => {
      console.log('[Chat] onImageFailed fired:', data.predictionId, data.error);
      replaceImagePlaceholderWithError(data.predictionId, data);
    });
  } else {
    console.warn('[Chat] onImageFailed not available on social API');
  }
}

/**
 * Called by onboarding.js after setup completes and the transition animation finishes.
 */
// eslint-disable-next-line no-unused-vars
async function initializeChatAfterOnboarding() {
  await initializeChat();
}

window.addEventListener('DOMContentLoaded', async () => {
  // Show app version in titlebar
  try {
    const version = await window.pocketAgent.app.getVersion();
    document.title = `Neon Post v${version}`;
  } catch (err) {
    console.error('Failed to load app version:', err);
  }

  // Check if onboarding is needed
  const onboardingActive = await checkAndShowOnboarding();

  // Now that we know the state, reveal the UI (prevents sidebar flash)
  document.body.classList.add('app-ready');

  if (onboardingActive) {
    // Onboarding is showing — chat init will happen after it completes
    return;
  }

  // No onboarding needed — initialize chat immediately
  await initializeChat();
});
