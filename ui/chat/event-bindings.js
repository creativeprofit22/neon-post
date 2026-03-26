// Event bindings — replaces all inline onclick/oninput/onkeydown/onchange handlers

function bindClick(id, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', handler);
}

function bindMenuClick(id, action) {
  bindClick(id, () => { playNormalClick(); action(); closeMenu(); });
}

// --- Header / Hamburger Menu ---
bindClick('hamburger-btn', () => { playNormalClick(); toggleMenu(); });
bindMenuClick('menu-fresh-start', clearChat);
bindMenuClick('menu-brain', showFacts);
bindMenuClick('menu-daily-logs', showDailyLogs);
bindMenuClick('menu-soul', showSoul);
bindMenuClick('menu-personalize', openCustomize);
bindMenuClick('menu-routines', openRoutines);
bindMenuClick('menu-docs', openDocs);
bindMenuClick('menu-settings', openSettings);
bindMenuClick('menu-about', openAbout);

// --- About Modal ---
document.getElementById('about-modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeAbout();
});
bindClick('about-close-btn', () => { playNormalClick(); closeAbout(); });
bindClick('about-link-youtube', () => {
  playNormalClick();
  window.pocketAgent.app.openExternal('https://www.youtube.com/@kenkaidoesai');
});
bindClick('about-link-skool', () => {
  playNormalClick();
  window.pocketAgent.app.openExternal('https://www.skool.com/kenkai');
});

// --- Plan Approval ---
bindClick('plan-reject-btn', rejectPlan);
bindClick('plan-approve-btn', approvePlan);

// --- Tabs ---
bindClick('new-tab-btn', () => { playNormalClick(); createNewSession(); });

// --- Global Chat Header ---
bindClick('gchat-back-btn', () => { playNormalClick(); toggleGlobalChat(); });

// --- Scroll Buttons ---
bindClick('scroll-top-btn', () => { playNormalClick(); scrollToTop(); });
bindClick('scroll-bottom-btn', () => { playNormalClick(); scrollToBottom(); });
bindClick('gchat-scroll-top-btn', () => { playNormalClick(); gchatScrollToTop(); });
bindClick('gchat-scroll-bottom-btn', () => { playNormalClick(); gchatScrollToBottom(); });

// --- Search Panel ---
document.getElementById('search-input').addEventListener('input', handleSearchInput);
document.getElementById('search-input').addEventListener('keydown', handleSearchKeydown);
bindClick('search-prev-btn', () => { playNormalClick(); navigateSearch(-1); });
bindClick('search-next-btn', () => { playNormalClick(); navigateSearch(1); });
bindClick('search-close-btn', () => { playNormalClick(); closeSearch(); });

// --- Workflows Panel ---
bindClick('workflows-close-btn', () => { playNormalClick(); closeWorkflows(); });

// --- Input Area ---
bindClick('attach-btn', () => { playNormalClick(); triggerAttach(); });
document.getElementById('message-input').addEventListener('keydown', handleKeydown);
document.getElementById('message-input').addEventListener('input', handleInput);

// --- Input Toolbar ---
bindClick('search-toolbar-btn', () => { playNormalClick(); toggleSearch(); });
bindClick('workflows-toolbar-btn', () => { playNormalClick(); toggleWorkflows(); });
bindClick('chat-toggle-btn', () => { playNormalClick(); toggleGlobalChat(); });
bindClick('bg-tasks-toggle-btn', () => { playNormalClick(); toggleBackgroundTasks(); });
bindClick('bg-dropdown-back-btn', () => { playNormalClick(); closeBackgroundTasks(); });

// --- Controls ---
document.getElementById('mode-select').addEventListener('change', function() {
  playNormalClick();
  setAgentMode(this.value);
});
bindClick('send-btn', handleSendClick);
document.getElementById('file-input').addEventListener('change', handleFileSelect);
