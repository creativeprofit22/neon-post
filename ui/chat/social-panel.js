/* Social Panel — embedded in chat.html
 * Follows the show/hide/toggle + lazy-init pattern of routines-panel.js
 */

let _socInitialized = false;
let _socNotyf = null;
let _socEditingAccountId = null;  // null = adding, string = editing

// ─── Show / Hide / Toggle ──────────────────────────────────────────────────

function showSocialPanel() {
  const chatView = document.getElementById('chat-view');
  const socialView = document.getElementById('social-view');
  if (!socialView) return;

  _dismissOtherPanels('social-view');

  chatView.classList.add('hidden');
  socialView.classList.add('active');

  const sidebarBtn = document.getElementById('sidebar-social-btn');
  if (sidebarBtn) sidebarBtn.classList.add('active');

  if (!_socInitialized) {
    _socInit();
    _socInitialized = true;
  }

  // Refresh the active tab's data on every show
  _socRefreshActiveTab();
}

function hideSocialPanel() {
  const chatView = document.getElementById('chat-view');
  const socialView = document.getElementById('social-view');
  if (!socialView) return;

  socialView.classList.remove('active');
  chatView.classList.remove('hidden');

  const sidebarBtn = document.getElementById('sidebar-social-btn');
  if (sidebarBtn) sidebarBtn.classList.remove('active');
}

function toggleSocialPanel() {
  const socialView = document.getElementById('social-view');
  if (socialView && socialView.classList.contains('active')) {
    hideSocialPanel();
  } else {
    showSocialPanel();
  }
}

// ─── Toast ─────────────────────────────────────────────────────────────────

function _socShowToast(message, type) {
  if (!_socNotyf) {
    _socNotyf = new Notyf({
      duration: 3000,
      position: { x: 'right', y: 'bottom' },
      dismissible: true,
      types: [
        { type: 'success', background: '#4ade80' },
        { type: 'error',   background: '#f87171' },
      ],
    });
  }
  _socNotyf[type === 'error' ? 'error' : 'success'](message);
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function _socEscapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function _socFormatNumber(n) {
  if (n == null) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000)    return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function _socTimeAgo(dateStr) {
  if (!dateStr) return '';
  const now  = Date.now();
  const d    = new Date(dateStr).getTime();
  const diff = now - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + 'h ago';
  const days = Math.floor(hours / 24);
  if (days < 30) return days + 'd ago';
  return new Date(dateStr).toLocaleDateString();
}

function _socPlatformClass(platform) {
  if (!platform) return '';
  return platform.toLowerCase().replace(/\s+/g, '');
}

function _socPlatformIcon(platform) {
  const p = (platform || '').toLowerCase();
  const icons = {
    tiktok:    '♪',
    youtube:   '▶',
    instagram: '📷',
    twitter:   '𝕏',
    x:         '𝕏',
    linkedin:  'in',
    facebook:  'f',
    threads:   '@',
    pinterest: '📌',
  };
  return icons[p] || '●';
}

function _socMakePlatformBadge(platform) {
  return (
    '<span class="platform-badge ' + _socPlatformClass(platform) + '">' +
    _socPlatformIcon(platform) + ' ' + _socEscapeHtml(platform) +
    '</span>'
  );
}

function _socMakeStatusBadge(status) {
  return '<span class="status-badge ' + (status || 'draft') + '">' + _socEscapeHtml(status || 'draft') + '</span>';
}

function _socSkeletonCards(count) {
  let html = '';
  for (let i = 0; i < count; i++) {
    html +=
      '<div class="soc-skeleton-card">' +
        '<div class="soc-skeleton soc-skeleton-thumb"></div>' +
        '<div class="soc-skeleton-body">' +
          '<div class="soc-skeleton soc-skeleton-line" style="width:80%"></div>' +
          '<div class="soc-skeleton soc-skeleton-line" style="width:55%"></div>' +
        '</div>' +
      '</div>';
  }
  return html;
}

// ─── Init ──────────────────────────────────────────────────────────────────

function _socInit() {
  const root = document.getElementById('social-view');
  if (!root) return;

  // ── Tab switching ──
  root.querySelectorAll('.soc-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      root.querySelectorAll('.soc-tab-btn').forEach(b => b.classList.remove('active'));
      root.querySelectorAll('.soc-tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const el = root.querySelector('#soc-tab-' + target);
      if (el) el.classList.add('active');

      // Lazy-load each tab's data
      if (target === 'discover') _socLoadDiscovered();
      if (target === 'posts')    _socLoadPosts();
      if (target === 'gallery')  _socLoadGallery();
      if (target === 'accounts') { _socLoadAccounts(); _socLoadBrand(); }
    });
  });

  // ── Create sub-tabs ──
  root.querySelectorAll('.soc-sub-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.panel;
      root.querySelectorAll('.soc-sub-tab').forEach(b => b.classList.remove('active'));
      root.querySelectorAll('.soc-create-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const el = root.querySelector('#soc-panel-' + target);
      if (el) el.classList.add('active');
    });
  });

  // ── Discover search ──
  const discoverSearch    = root.querySelector('#soc-discover-search');
  const discoverPlatform  = root.querySelector('#soc-discover-platform');
  const discoverSearchBtn = root.querySelector('#soc-discover-search-btn');

  function _runSearch() {
    const query = discoverSearch ? discoverSearch.value.trim() : '';
    if (!query) { _socLoadDiscovered(); return; }
    const platform = discoverPlatform ? (discoverPlatform.value || undefined) : undefined;
    _socDiscoverSearch(query, platform);
  }

  if (discoverSearchBtn)  discoverSearchBtn.addEventListener('click', _runSearch);
  if (discoverSearch)     discoverSearch.addEventListener('keydown', e => { if (e.key === 'Enter') _runSearch(); });

  // ── Generate (Create tab) ──
  const genBtn    = root.querySelector('#soc-create-generate-btn');
  const genOutput = root.querySelector('#soc-create-output');
  if (genBtn) {
    genBtn.addEventListener('click', () => {
      const social = _socAPI();
      if (!social) return;
      const contentType = (root.querySelector('#soc-create-content-type') || {}).value || 'caption';
      const platform    = (root.querySelector('#soc-create-platform')     || {}).value || '';
      const prompt      = ((root.querySelector('#soc-create-prompt')      || {}).value || '').trim();

      if (!prompt) { _socShowToast('Enter a prompt or topic', 'error'); return; }
      if (genOutput) genOutput.textContent = 'Generating…';
      genBtn.disabled = true;

      social.generateContent({ content_type: contentType, platform: platform || null, prompt_used: prompt })
        .then(result => {
          if (result.success && result.data) {
            if (genOutput) genOutput.textContent = result.data.output || 'Generated content will appear here';
            _socShowToast('Content generated!', 'success');
          } else {
            if (genOutput) genOutput.textContent = result.error || 'Generation failed';
            _socShowToast('Generation failed', 'error');
          }
        })
        .catch(err => {
          console.error('[Social] Generate failed:', err);
          if (genOutput) genOutput.textContent = 'Error generating content';
          _socShowToast('Generation error', 'error');
        })
        .finally(() => { genBtn.disabled = false; });
    });
  }

  // ── Repurpose ──
  const repurposeBtn = root.querySelector('#soc-repurpose-btn');
  if (repurposeBtn) {
    repurposeBtn.addEventListener('click', () => {
      const social    = _socAPI();
      if (!social) return;
      const urlEl     = root.querySelector('#soc-repurpose-url');
      const platEl    = root.querySelector('#soc-repurpose-platform');
      const outputEl  = root.querySelector('#soc-repurpose-output');
      if (!urlEl || !urlEl.value.trim()) { _socShowToast('Paste a source URL', 'error'); return; }

      if (outputEl) outputEl.textContent = 'Repurposing…';
      repurposeBtn.disabled = true;

      social.generateContent({
        content_type: 'repurpose',
        platform: platEl ? platEl.value : null,
        prompt_used: 'Repurpose content from: ' + urlEl.value.trim(),
      })
        .then(result => {
          if (result.success && result.data) {
            if (outputEl) outputEl.textContent = result.data.output || 'Repurposed content appears here';
            _socShowToast('Content repurposed!', 'success');
          } else {
            if (outputEl) outputEl.textContent = result.error || 'Repurpose failed';
            _socShowToast('Repurpose failed', 'error');
          }
        })
        .catch(err => {
          console.error('[Social] Repurpose failed:', err);
          if (outputEl) outputEl.textContent = 'Error repurposing content';
          _socShowToast('Repurpose error', 'error');
        })
        .finally(() => { repurposeBtn.disabled = false; });
    });
  }

  // ── Image generate ──
  const imageGenBtn = root.querySelector('#soc-image-gen-btn');
  if (imageGenBtn) {
    imageGenBtn.addEventListener('click', () => {
      const social   = _socAPI();
      if (!social) return;
      const promptEl = root.querySelector('#soc-image-prompt');
      const outputEl = root.querySelector('#soc-image-output');
      if (!promptEl || !promptEl.value.trim()) { _socShowToast('Describe the image you want', 'error'); return; }

      if (outputEl) outputEl.textContent = 'Generating image…';
      imageGenBtn.disabled = true;

      social.generateContent({ content_type: 'image', prompt_used: promptEl.value.trim() })
        .then(result => {
          if (result.success && result.data) {
            const gen = result.data;
            if (outputEl) {
              if (gen.media_url) {
                outputEl.innerHTML = '<img src="' + _socEscapeHtml(gen.media_url) + '" style="max-width:100%;border-radius:8px;" />';
              } else {
                outputEl.textContent = gen.output || 'Image generated (no preview available)';
              }
            }
            _socShowToast('Image generated!', 'success');
          } else {
            if (outputEl) outputEl.textContent = result.error || 'Generation failed';
            _socShowToast('Image generation failed', 'error');
          }
        })
        .catch(err => {
          console.error('[Social] Image gen failed:', err);
          if (outputEl) outputEl.textContent = 'Error generating image';
          _socShowToast('Image error', 'error');
        })
        .finally(() => { imageGenBtn.disabled = false; });
    });
  }

  // ── Post composer ──
  const postCreateBtn = root.querySelector('#soc-post-create-btn');
  if (postCreateBtn) {
    postCreateBtn.addEventListener('click', () => {
      const social    = _socAPI();
      if (!social) return;
      const content   = ((root.querySelector('#soc-post-content')   || {}).value || '').trim();
      const platform  = ((root.querySelector('#soc-post-platform')  || {}).value || 'tiktok');
      const status    = ((root.querySelector('#soc-post-status')    || {}).value || 'draft');
      const schedAt   = ((root.querySelector('#soc-post-schedule')  || {}).value || null);

      if (!content) { _socShowToast('Write some content first', 'error'); return; }
      postCreateBtn.disabled = true;

      social.createPost({ platform, content, status, scheduled_at: schedAt || null })
        .then(result => {
          if (result.success) {
            _socShowToast('Post created!', 'success');
            const ta = root.querySelector('#soc-post-content');
            if (ta) ta.value = '';
            _socLoadPosts();
          } else {
            _socShowToast(result.error || 'Failed to create post', 'error');
          }
        })
        .catch(err => {
          console.error('[Social] Create post failed:', err);
          _socShowToast('Failed to create post', 'error');
        })
        .finally(() => { postCreateBtn.disabled = false; });
    });
  }

  const postsFilter = root.querySelector('#soc-posts-filter');
  if (postsFilter) postsFilter.addEventListener('change', _socLoadPosts);

  // ── Lightbox ──
  const lightbox      = root.querySelector('#soc-lightbox');
  const lightboxClose = root.querySelector('#soc-lightbox-close');
  if (lightboxClose) lightboxClose.addEventListener('click', () => lightbox.classList.remove('active'));
  if (lightbox) lightbox.addEventListener('click', e => { if (e.target === lightbox) lightbox.classList.remove('active'); });

  // ── Save brand ──
  const saveBrandBtn = root.querySelector('#soc-save-brand-btn');
  if (saveBrandBtn) {
    saveBrandBtn.addEventListener('click', () => {
      const social = _socAPI();
      if (!social) return;
      const fields = [
        ['name',               'soc-brand-name'],
        ['voice',              'soc-brand-voice'],
        ['tone',               'soc-brand-tone'],
        ['target_audience',    'soc-brand-target-audience'],
        ['themes',             'soc-brand-themes'],
        ['hashtags',           'soc-brand-hashtags'],
        ['posting_guidelines', 'soc-brand-posting-guidelines'],
        ['visual_style',       'soc-brand-visual-style'],
        ['dos',                'soc-brand-dos'],
        ['donts',              'soc-brand-donts'],
        ['example_posts',      'soc-brand-example-posts'],
      ];
      const data = {};
      fields.forEach(([key, id]) => {
        const el = root.querySelector('#' + id);
        if (el) data[key] = el.value.trim() || null;
      });

      saveBrandBtn.disabled = true;
      social.saveBrand(data)
        .then(result => {
          if (result.success) _socShowToast('Brand saved!', 'success');
          else _socShowToast(result.error || 'Failed to save brand', 'error');
        })
        .catch(err => {
          console.error('[Social] Save brand failed:', err);
          _socShowToast('Failed to save brand', 'error');
        })
        .finally(() => { saveBrandBtn.disabled = false; });
    });
  }

  // ── Platform field toggle ──
  const platformSelect = root.querySelector('#soc-account-platform');
  if (platformSelect) {
    platformSelect.addEventListener('change', () => _socTogglePlatformFields(root, platformSelect.value));
    // Run once to set initial state
    _socTogglePlatformFields(root, platformSelect.value);
  }

  // ── Account save (add / edit) ──
  const accountSaveBtn = root.querySelector('#soc-account-save-btn');
  if (accountSaveBtn) {
    accountSaveBtn.addEventListener('click', () => {
      const social = _socAPI();
      if (!social) return;

      const platform        = (root.querySelector('#soc-account-platform')           || {}).value || 'tiktok';
      const username        = (root.querySelector('#soc-account-username')           || {}).value || '';
      const displayName     = (root.querySelector('#soc-account-display')            || {}).value || '';
      const accessToken     = (root.querySelector('#soc-account-access-token')       || {}).value || '';
      const consumerKey     = (root.querySelector('#soc-account-consumer-key')       || {}).value || '';
      const consumerSecret  = (root.querySelector('#soc-account-consumer-secret')    || {}).value || '';
      const accessTokenSecret = (root.querySelector('#soc-account-access-token-secret') || {}).value || '';
      const pageId          = (root.querySelector('#soc-account-page-id')            || {}).value || '';
      const igId            = (root.querySelector('#soc-account-ig-id')              || {}).value || '';
      const clientId        = (root.querySelector('#soc-account-client-id')          || {}).value || '';
      const clientSecret    = (root.querySelector('#soc-account-client-secret')      || {}).value || '';

      if (!username.trim()) { _socShowToast('Enter a username', 'error'); return; }

      const metadata = {};
      if (accessToken) metadata.accessToken = accessToken;
      if (platform === 'twitter') {
        if (consumerKey)        metadata.consumerKey        = consumerKey;
        if (consumerSecret)     metadata.consumerSecret     = consumerSecret;
        if (accessTokenSecret)  metadata.accessTokenSecret  = accessTokenSecret;
      }
      if (platform === 'instagram') {
        if (pageId) metadata.pageId = pageId;
        if (igId)   metadata.instagramAccountId = igId;
      }
      if (platform === 'tiktok' || platform === 'youtube') {
        if (clientId)     metadata.clientId     = clientId;
        if (clientSecret) metadata.clientSecret = clientSecret;
      }

      const payload = {
        platform,
        account_name: username.trim(),
        display_name: displayName.trim() || null,
        metadata: Object.keys(metadata).length ? JSON.stringify(metadata) : null,
      };

      accountSaveBtn.disabled = true;

      const isEditing = _socEditingAccountId !== null;
      const apiCall = isEditing
        ? social.updateAccount(_socEditingAccountId, payload)
        : social.addAccount(payload);

      apiCall
        .then(result => {
          if (result.success) {
            _socShowToast(isEditing ? 'Account updated!' : 'Account added!', 'success');
            _socResetAccountForm(root);
            _socLoadAccounts();
          } else {
            _socShowToast(result.error || (isEditing ? 'Failed to update account' : 'Failed to add account'), 'error');
          }
        })
        .catch(err => {
          console.error('[Social] Save account failed:', err);
          _socShowToast('Failed to save account', 'error');
        })
        .finally(() => { accountSaveBtn.disabled = false; });
    });
  }

  // ── Account cancel ──
  const accountCancelBtn = root.querySelector('#soc-account-cancel-btn');
  if (accountCancelBtn) {
    accountCancelBtn.addEventListener('click', () => _socResetAccountForm(root));
  }

  // ── Scraping keys ──
  const settings = window.pocketAgent && window.pocketAgent.settings;

  // Load masked values
  if (settings) {
    settings.get('apify.apiKey').then(val => {
      const el = root.querySelector('#soc-apify-key');
      if (el && val) el.placeholder = '••••••••';
    }).catch(() => {});
    settings.get('rapidapi.apiKey').then(val => {
      const el = root.querySelector('#soc-rapidapi-key');
      if (el && val) el.placeholder = '••••••••';
    }).catch(() => {});
  }

  // Apify test
  const apifyTestBtn = root.querySelector('#soc-apify-test-btn');
  if (apifyTestBtn) {
    apifyTestBtn.addEventListener('click', () => {
      const key = (root.querySelector('#soc-apify-key') || {}).value || '';
      const statusEl = root.querySelector('#soc-apify-status');
      if (!key) { _socShowToast('Enter an Apify key first', 'error'); return; }
      apifyTestBtn.disabled = true;
      if (statusEl) statusEl.textContent = 'Testing…';
      const social = _socAPI();
      const testFn = social && social.validateApifyKey
        ? social.validateApifyKey(key)
        : Promise.reject(new Error('validateApifyKey not available'));
      testFn
        .then(result => {
          if (statusEl) { statusEl.textContent = result.valid ? '✓ Valid' : '✗ Invalid'; statusEl.className = 'soc-key-status ' + (result.valid ? 'valid' : 'invalid'); }
          _socShowToast(result.valid ? 'Apify key valid!' : 'Apify key invalid', result.valid ? 'success' : 'error');
        })
        .catch(() => {
          if (statusEl) { statusEl.textContent = '✗ Error'; statusEl.className = 'soc-key-status invalid'; }
          _socShowToast('Test failed', 'error');
        })
        .finally(() => { apifyTestBtn.disabled = false; });
    });
  }

  // Apify save
  const apifySaveBtn = root.querySelector('#soc-apify-save-btn');
  if (apifySaveBtn) {
    apifySaveBtn.addEventListener('click', () => {
      const key = (root.querySelector('#soc-apify-key') || {}).value || '';
      if (!key) { _socShowToast('Enter a key to save', 'error'); return; }
      if (!settings) { _socShowToast('Settings unavailable', 'error'); return; }
      apifySaveBtn.disabled = true;
      settings.set('apify.apiKey', key)
        .then(() => {
          _socShowToast('Apify key saved!', 'success');
          const el = root.querySelector('#soc-apify-key');
          if (el) { el.value = ''; el.placeholder = '••••••••'; }
        })
        .catch(() => _socShowToast('Failed to save key', 'error'))
        .finally(() => { apifySaveBtn.disabled = false; });
    });
  }

  // RapidAPI test
  const rapidTestBtn = root.querySelector('#soc-rapidapi-test-btn');
  if (rapidTestBtn) {
    rapidTestBtn.addEventListener('click', () => {
      const key = (root.querySelector('#soc-rapidapi-key') || {}).value || '';
      const statusEl = root.querySelector('#soc-rapidapi-status');
      if (!key) { _socShowToast('Enter a RapidAPI key first', 'error'); return; }
      rapidTestBtn.disabled = true;
      if (statusEl) statusEl.textContent = 'Testing…';
      const social = _socAPI();
      const testFn = social && social.validateRapidAPIKey
        ? social.validateRapidAPIKey(key)
        : Promise.reject(new Error('validateRapidAPIKey not available'));
      testFn
        .then(result => {
          if (statusEl) { statusEl.textContent = result.valid ? '✓ Valid' : '✗ Invalid'; statusEl.className = 'soc-key-status ' + (result.valid ? 'valid' : 'invalid'); }
          _socShowToast(result.valid ? 'RapidAPI key valid!' : 'RapidAPI key invalid', result.valid ? 'success' : 'error');
        })
        .catch(() => {
          if (statusEl) { statusEl.textContent = '✗ Error'; statusEl.className = 'soc-key-status invalid'; }
          _socShowToast('Test failed', 'error');
        })
        .finally(() => { rapidTestBtn.disabled = false; });
    });
  }

  // RapidAPI save
  const rapidSaveBtn = root.querySelector('#soc-rapidapi-save-btn');
  if (rapidSaveBtn) {
    rapidSaveBtn.addEventListener('click', () => {
      const key = (root.querySelector('#soc-rapidapi-key') || {}).value || '';
      if (!key) { _socShowToast('Enter a key to save', 'error'); return; }
      if (!settings) { _socShowToast('Settings unavailable', 'error'); return; }
      rapidSaveBtn.disabled = true;
      settings.set('rapidapi.apiKey', key)
        .then(() => {
          _socShowToast('RapidAPI key saved!', 'success');
          const el = root.querySelector('#soc-rapidapi-key');
          if (el) { el.value = ''; el.placeholder = '••••••••'; }
        })
        .catch(() => _socShowToast('Failed to save key', 'error'))
        .finally(() => { rapidSaveBtn.disabled = false; });
    });
  }

  // Initial data load for the first visible tab
  _socLoadDiscovered();
}

// ─── Platform field toggle ─────────────────────────────────────────────────

function _socTogglePlatformFields(root, platform) {
  const twitterGroup   = root.querySelector('.soc-cred-twitter');
  const instagramGroup = root.querySelector('.soc-cred-instagram');
  const clientGroup    = root.querySelector('.soc-cred-client');

  if (twitterGroup)   twitterGroup.style.display   = 'none';
  if (instagramGroup) instagramGroup.style.display  = 'none';
  if (clientGroup)    clientGroup.style.display     = 'none';

  if (platform === 'twitter') {
    if (twitterGroup) twitterGroup.style.display = '';
  } else if (platform === 'instagram') {
    if (instagramGroup) instagramGroup.style.display = '';
  } else if (platform === 'tiktok' || platform === 'youtube') {
    if (clientGroup) clientGroup.style.display = '';
  }
  // linkedin: just access token, no extras
}

// ─── Reset account form ────────────────────────────────────────────────────

function _socResetAccountForm(root) {
  _socEditingAccountId = null;

  const titleEl     = root.querySelector('#soc-account-form-title');
  const saveBtn     = root.querySelector('#soc-account-save-btn');
  const cancelBtn   = root.querySelector('#soc-account-cancel-btn');

  if (titleEl)  titleEl.textContent  = 'Add Account';
  if (saveBtn)  saveBtn.textContent  = 'Add Account';
  if (cancelBtn) cancelBtn.style.display = 'none';

  const fields = ['#soc-account-username', '#soc-account-display', '#soc-account-access-token',
    '#soc-account-consumer-key', '#soc-account-consumer-secret', '#soc-account-access-token-secret',
    '#soc-account-page-id', '#soc-account-ig-id', '#soc-account-client-id', '#soc-account-client-secret'];
  fields.forEach(sel => {
    const el = root.querySelector(sel);
    if (el) el.value = '';
  });

  const platformSel = root.querySelector('#soc-account-platform');
  if (platformSel) {
    platformSel.value = 'tiktok';
    _socTogglePlatformFields(root, 'tiktok');
  }
}

// ─── API reference ─────────────────────────────────────────────────────────

function _socAPI() {
  return (window.pocketAgent && window.pocketAgent.social) || null;
}

// ─── Refresh active tab ────────────────────────────────────────────────────

function _socRefreshActiveTab() {
  const root = document.getElementById('social-view');
  if (!root) return;
  const activeBtn = root.querySelector('.soc-tab-btn.active');
  if (!activeBtn) return;
  const tab = activeBtn.dataset.tab;
  if (tab === 'discover') _socLoadDiscovered();
  if (tab === 'posts')    _socLoadPosts();
  if (tab === 'gallery')  _socLoadGallery();
  if (tab === 'accounts') { _socLoadAccounts(); _socLoadBrand(); }
}

// ─── Discover Tab ──────────────────────────────────────────────────────────

function _socLoadDiscovered() {
  const social  = _socAPI();
  const root    = document.getElementById('social-view');
  const results = root && root.querySelector('#soc-discover-results');
  if (!results) return;

  results.innerHTML = '<div class="soc-card-grid">' + _socSkeletonCards(6) + '</div>';

  if (!social) { results.innerHTML = '<div class="soc-empty"><p>Social API unavailable</p></div>'; return; }

  social.getDiscovered(50)
    .then(_socRenderDiscoverResults)
    .catch(err => {
      console.error('[Social] Failed to load discovered:', err);
      results.innerHTML = '<div class="soc-empty"><p>Failed to load content</p></div>';
    });
}

function _socDiscoverSearch(query, platform) {
  const social  = _socAPI();
  const root    = document.getElementById('social-view');
  const results = root && root.querySelector('#soc-discover-results');
  if (!results || !social) return;

  results.innerHTML = '<div class="soc-card-grid">' + _socSkeletonCards(6) + '</div>';

  social.searchContent(query, platform)
    .then(_socRenderDiscoverResults)
    .catch(err => {
      console.error('[Social] Search failed:', err);
      _socShowToast('Search failed', 'error');
    });
}

function _socRenderDiscoverResults(items) {
  const root    = document.getElementById('social-view');
  const results = root && root.querySelector('#soc-discover-results');
  if (!results) return;

  if (!items || items.length === 0) {
    results.innerHTML =
      '<div class="soc-empty">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="m17 17l4 4m-2-10a8 8 0 1 0-16 0a8 8 0 0 0 16 0"/></svg>' +
      '<p>No content discovered yet</p>' +
      '<p class="hint">Search for content or let your agent discover trending posts</p>' +
      '</div>';
    return;
  }

  let html = '<div class="soc-card-grid">';
  items.forEach(item => {
    html +=
      '<div class="soc-card" data-id="' + item.id + '">' +
        '<div class="soc-card-thumb">' + _socPlatformIcon(item.platform) + '</div>' +
        '<div class="soc-card-body">' +
          '<div class="soc-card-title">' + _socEscapeHtml(item.title || item.body || 'Untitled') + '</div>' +
          '<div class="soc-card-meta">' +
            _socMakePlatformBadge(item.platform) +
            (item.source_author ? ' <span>by ' + _socEscapeHtml(item.source_author) + '</span>' : '') +
          '</div>' +
          '<div class="soc-card-stats">' +
            '<span>❤ ' + _socFormatNumber(item.likes)    + '</span>' +
            '<span>💬 ' + _socFormatNumber(item.comments) + '</span>' +
            '<span>🔄 ' + _socFormatNumber(item.shares)   + '</span>' +
            '<span>👁 ' + _socFormatNumber(item.views)    + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="soc-card-actions">' +
          '<span style="font-size:11px;color:var(--text-muted)">' + _socTimeAgo(item.discovered_at) + '</span>' +
          '<button class="soc-btn soc-btn-sm soc-btn-secondary" onclick="socPanelActions.saveDiscovered(\'' + item.id + '\')">Save</button>' +
        '</div>' +
      '</div>';
  });
  html += '</div>';
  results.innerHTML = html;
}

// ─── Posts Tab ─────────────────────────────────────────────────────────────

function _socLoadPosts() {
  const social = _socAPI();
  const root   = document.getElementById('social-view');
  const tbody  = root && root.querySelector('#soc-posts-table-body');
  if (!tbody) return;

  if (!social) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px">Social API unavailable</td></tr>'; return; }

  const filterEl = root.querySelector('#soc-posts-filter');
  let filterStatus = filterEl ? filterEl.value : undefined;
  if (filterStatus === 'all') filterStatus = undefined;

  social.listPosts(filterStatus)
    .then(posts => {
      if (!posts || posts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:28px;color:var(--text-muted)">No posts yet. Compose your first post above!</td></tr>';
        return;
      }
      tbody.innerHTML = posts.map(post =>
        '<tr data-id="' + post.id + '">' +
          '<td>' + _socMakePlatformBadge(post.platform) + '</td>' +
          '<td><div class="content-preview">' + _socEscapeHtml(post.content) + '</div></td>' +
          '<td>' + _socMakeStatusBadge(post.status) + '</td>' +
          '<td style="font-size:11px;color:var(--text-muted)">' + (post.scheduled_at ? new Date(post.scheduled_at).toLocaleString() : '—') + '</td>' +
          '<td style="font-size:11px;color:var(--text-muted)">' + _socTimeAgo(post.created_at) + '</td>' +
          '<td class="actions-cell">' +
            '<button class="soc-icon-btn danger" onclick="socPanelActions.deletePost(\'' + post.id + '\')" title="Delete">' +
              '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5" d="m19.5 5.5l-.62 10.025c-.158 2.561-.237 3.842-.88 4.763a4 4 0 0 1-1.2 1.128c-.957.584-2.24.584-4.806.584c-2.57 0-3.855 0-4.814-.585a4 4 0 0 1-1.2-1.13c-.642-.922-.72-2.205-.874-4.77L4.5 5.5M3 5.5h18m-4.944 0l-.683-1.408c-.453-.936-.68-1.403-1.071-1.695a2 2 0 0 0-.275-.172C13.594 2 13.074 2 12.035 2c-1.066 0-1.599 0-2.04.234a2 2 0 0 0-.278.18c-.395.303-.616.788-1.058 1.757L8.053 5.5"/></svg>' +
            '</button>' +
          '</td>' +
        '</tr>'
      ).join('');
    })
    .catch(err => {
      console.error('[Social] Failed to load posts:', err);
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--error)">Failed to load posts</td></tr>';
    });
}

// ─── Gallery Tab ───────────────────────────────────────────────────────────

function _socLoadGallery() {
  const social = _socAPI();
  const root   = document.getElementById('social-view');
  const grid   = root && root.querySelector('#soc-gallery-grid');
  if (!grid) return;

  grid.className = '';
  grid.innerHTML = _socSkeletonCards(8);

  if (!social) { grid.innerHTML = '<div class="soc-empty" style="grid-column:1/-1"><p>Social API unavailable</p></div>'; return; }

  social.getGenerated(100)
    .then(items => {
      if (!items || items.length === 0) {
        grid.innerHTML =
          '<div class="soc-empty" style="grid-column:1/-1">' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M22 12c0 5.523-4.477 10-10 10S2 17.523 2 12S6.477 2 12 2s10 4.477 10 10"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="m14.5 9.5l-5 5m0-5l5 5"/></svg>' +
          '<p>No generated content yet</p>' +
          '<p class="hint">Use the Create tab to generate copy, images, and more</p>' +
          '</div>';
        return;
      }
      grid.className = 'soc-gallery-grid';
      grid.innerHTML = items.map(item => {
        const isFav = item.rating && item.rating > 0;
        return (
          '<div class="soc-gallery-item" data-id="' + item.id + '">' +
            (item.media_url
              ? '<img class="soc-gallery-item-media" src="' + _socEscapeHtml(item.media_url) + '" />'
              : '<div class="soc-gallery-item-content" onclick="socPanelActions.openLightbox(\'' + item.id + '\')">' + _socEscapeHtml(item.output) + '</div>') +
            '<div class="soc-gallery-item-footer">' +
              '<span>' + _socMakePlatformBadge(item.platform || item.content_type) + ' · ' + _socTimeAgo(item.created_at) + '</span>' +
              '<div class="soc-gallery-item-actions">' +
                '<button class="soc-icon-btn soc-favorite-btn' + (isFav ? ' active' : '') + '" onclick="socPanelActions.toggleFavorite(\'' + item.id + '\',' + (isFav ? '0' : '5') + ')" title="Favorite">' +
                  '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"><path fill="' + (isFav ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="1.5" d="m12 3.5l2.713 5.497L20.7 9.91l-3.85 3.75l.909 5.298L12 16.183l-5.758 2.776l.909-5.298L3.3 9.91l5.987-.914z"/></svg>' +
                '</button>' +
                '<button class="soc-icon-btn danger" onclick="socPanelActions.deleteGenerated(\'' + item.id + '\')" title="Delete">' +
                  '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5" d="m19.5 5.5l-.62 10.025c-.158 2.561-.237 3.842-.88 4.763a4 4 0 0 1-1.2 1.128c-.957.584-2.24.584-4.806.584c-2.57 0-3.855 0-4.814-.585a4 4 0 0 1-1.2-1.13c-.642-.922-.72-2.205-.874-4.77L4.5 5.5M3 5.5h18m-4.944 0l-.683-1.408c-.453-.936-.68-1.403-1.071-1.695a2 2 0 0 0-.275-.172C13.594 2 13.074 2 12.035 2c-1.066 0-1.599 0-2.04.234a2 2 0 0 0-.278.18c-.395.303-.616.788-1.058 1.757L8.053 5.5"/></svg>' +
                '</button>' +
              '</div>' +
            '</div>' +
          '</div>'
        );
      }).join('');
    })
    .catch(err => {
      console.error('[Social] Failed to load gallery:', err);
      grid.innerHTML = '<div class="soc-empty" style="grid-column:1/-1"><p>Failed to load gallery</p></div>';
    });
}

// ─── Accounts & Brand ──────────────────────────────────────────────────────

function _socLoadAccounts() {
  const social = _socAPI();
  const root   = document.getElementById('social-view');
  const list   = root && root.querySelector('#soc-accounts-list');
  if (!list) return;

  if (!social) { list.innerHTML = '<div class="soc-empty"><p>Social API unavailable</p></div>'; return; }

  social.listAccounts()
    .then(accounts => {
      if (!accounts || accounts.length === 0) {
        list.innerHTML =
          '<div class="soc-empty" style="padding:20px"><p>No connected accounts</p><p class="hint">Add a social media account to get started</p></div>';
        return;
      }
      list.innerHTML = accounts.map(acc => {
        const hasCreds = !!acc.hasCredentials;
        const statusDot  = hasCreds
          ? '<span class="soc-account-status connected" title="Has credentials">●</span>'
          : '<span class="soc-account-status no-creds" title="No credentials">●</span>';
        const statusText = hasCreds
          ? '<span class="soc-cred-label connected">Connected</span>'
          : '<span class="soc-cred-label no-creds">No credentials</span>';
        return (
          '<div class="soc-account-row" data-id="' + acc.id + '">' +
            _socMakePlatformBadge(acc.platform) +
            '<div class="soc-account-info">' +
              '<div class="soc-account-name">' + _socEscapeHtml(acc.display_name || acc.account_name) + '</div>' +
              '<div class="soc-account-handle">@' + _socEscapeHtml(acc.account_name) + '</div>' +
            '</div>' +
            '<div class="soc-account-cred-status">' + statusDot + statusText + '</div>' +
            '<button class="soc-icon-btn" onclick="socPanelActions.editAccount(\'' + acc.id + '\')" title="Edit">' +
              '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="m15.214 5.982l1.402-1.401a1.982 1.982 0 0 1 2.803 2.803l-1.401 1.402m-2.804-2.804L6.98 14.216c-1.045 1.046-1.568 1.568-1.924 2.205S4.342 18.561 4 20c1.438-.342 2.942-.7 3.579-1.056s1.16-.879 2.205-1.924l8.234-8.234m-2.804-2.804l2.804 2.804"/></svg>' +
            '</button>' +
            '<button class="soc-btn soc-btn-sm soc-btn-danger" onclick="socPanelActions.removeAccount(\'' + acc.id + '\')">Remove</button>' +
          '</div>'
        );
      }).join('');
    })
    .catch(err => {
      console.error('[Social] Failed to load accounts:', err);
      list.innerHTML = '<div class="soc-empty"><p>Failed to load accounts</p></div>';
    });
}

function _socLoadBrand() {
  const social = _socAPI();
  const root   = document.getElementById('social-view');
  if (!social || !root) return;

  social.getBrand()
    .then(brand => {
      if (!brand) return;
      const fields = ['name', 'voice', 'tone', 'target_audience', 'themes', 'hashtags', 'posting_guidelines', 'visual_style', 'dos', 'donts', 'example_posts'];
      fields.forEach(field => {
        const el = root.querySelector('#soc-brand-' + field.replace(/_/g, '-'));
        if (el && brand[field]) el.value = brand[field];
      });
    })
    .catch(err => console.error('[Social] Failed to load brand:', err));
}

// ─── Global Actions (callable from inline onclick) ─────────────────────────

window.socPanelActions = {
  saveDiscovered(id) {
    _socShowToast('Content saved to library', 'success');
  },

  deletePost(id) {
    if (!confirm('Delete this post?')) return;
    const row = document.querySelector('#social-view tr[data-id="' + id + '"]');
    if (row) row.remove();
    _socShowToast('Post removed', 'success');
  },

  deleteGenerated(id) {
    const social = _socAPI();
    if (!social || !confirm('Delete this item?')) return;
    social.deleteGenerated(id)
      .then(result => {
        if (result.success) {
          const el = document.querySelector('#social-view .soc-gallery-item[data-id="' + id + '"]');
          if (el) el.remove();
          _socShowToast('Deleted', 'success');
        } else {
          _socShowToast('Failed to delete', 'error');
        }
      })
      .catch(() => _socShowToast('Failed to delete', 'error'));
  },

  toggleFavorite(id, rating) {
    const social = _socAPI();
    if (!social) return;
    social.favoriteGenerated(id, rating)
      .then(result => {
        if (result.success) {
          _socLoadGallery();
          _socShowToast(rating > 0 ? 'Favorited ⭐' : 'Unfavorited', 'success');
        }
      })
      .catch(() => _socShowToast('Failed to update', 'error'));
  },

  editAccount(id) {
    const social = _socAPI();
    const root   = document.getElementById('social-view');
    if (!social || !root) return;

    const getAccount = social.getAccount
      ? social.getAccount(id)
      : social.listAccounts().then(list => (list || []).find(a => a.id === id));

    getAccount
      .then(acc => {
        if (!acc) { _socShowToast('Account not found', 'error'); return; }

        _socEditingAccountId = id;

        // Populate form
        const platformSel = root.querySelector('#soc-account-platform');
        const usernameEl  = root.querySelector('#soc-account-username');
        const displayEl   = root.querySelector('#soc-account-display');
        const titleEl     = root.querySelector('#soc-account-form-title');
        const saveBtn     = root.querySelector('#soc-account-save-btn');
        const cancelBtn   = root.querySelector('#soc-account-cancel-btn');

        if (platformSel) { platformSel.value = acc.platform || 'tiktok'; _socTogglePlatformFields(root, platformSel.value); }
        if (usernameEl)  usernameEl.value  = acc.account_name || '';
        if (displayEl)   displayEl.value   = acc.display_name || '';
        if (titleEl)     titleEl.textContent  = 'Edit Account';
        if (saveBtn)     saveBtn.textContent  = 'Save Changes';
        if (cancelBtn)   cancelBtn.style.display = '';

        // Populate credential fields from metadata if available
        if (acc.metadata) {
          try {
            const meta = typeof acc.metadata === 'string' ? JSON.parse(acc.metadata) : acc.metadata;
            const setVal = (sel, val) => { const el = root.querySelector(sel); if (el && val) el.value = val; };
            setVal('#soc-account-access-token', meta.accessToken);
            setVal('#soc-account-consumer-key', meta.consumerKey);
            setVal('#soc-account-consumer-secret', meta.consumerSecret);
            setVal('#soc-account-access-token-secret', meta.accessTokenSecret);
            setVal('#soc-account-page-id', meta.pageId);
            setVal('#soc-account-ig-id', meta.instagramAccountId);
            setVal('#soc-account-client-id', meta.clientId);
            setVal('#soc-account-client-secret', meta.clientSecret);
          } catch (e) { /* ignore parse errors */ }
        }

        // Scroll the form into view
        const formEl = root.querySelector('#soc-account-form');
        if (formEl) formEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      })
      .catch(err => {
        console.error('[Social] Failed to load account for edit:', err);
        _socShowToast('Failed to load account', 'error');
      });
  },

  removeAccount(id) {
    const social = _socAPI();
    if (!social || !confirm('Remove this account?')) return;
    social.removeAccount(id)
      .then(result => {
        if (result.success) {
          _socLoadAccounts();
          _socShowToast('Account removed', 'success');
        } else {
          _socShowToast('Failed to remove', 'error');
        }
      })
      .catch(() => _socShowToast('Failed to remove', 'error'));
  },

  openLightbox(id) {
    const social    = _socAPI();
    const root      = document.getElementById('social-view');
    const lightbox  = root && root.querySelector('#soc-lightbox');
    const lbBody    = root && root.querySelector('#soc-lightbox-body');
    const lbMeta    = root && root.querySelector('#soc-lightbox-meta');
    if (!social || !lightbox) return;

    social.getGenerated(100)
      .then(items => {
        const item = items.find(i => i.id === id);
        if (!item) return;
        if (lbBody) lbBody.textContent = item.output || '';
        if (lbMeta) {
          lbMeta.innerHTML =
            '<span>' + _socMakePlatformBadge(item.platform || item.content_type) + '</span>' +
            '<span>' + _socTimeAgo(item.created_at) + '</span>';
        }
        lightbox.classList.add('active');
      })
      .catch(() => {});
  },
};
