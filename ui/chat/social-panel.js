/* Social Panel — embedded in chat.html
 * Follows the show/hide/toggle + lazy-init pattern of routines-panel.js
 */

let _socInitialized = false;
let _socNotyf = null;
let _socEditingAccountId = null;  // null = adding, string = editing
let _socDiscoverCache = null;     // cached discover/search results for tab persistence
let _socDiscoverSearchCache = null; // cached raw search results (ContentResult[]) keyed by index
let _socSavedCache = null;          // cached saved/bookmarked content from DB
let _socGalleryCache = null;        // cached gallery items for client-side filtering
let _socGalleryFavOnly = false;     // favorites-only toggle state
let _socLightboxItems = [];         // current lightbox items array
let _socLightboxIndex = -1;         // current lightbox item index
let _socSelectMode = false;         // gallery multi-select mode
const _socSelectedIds = new Set();  // currently selected gallery item IDs

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

function _socIsImageItem(item) {
  if (!item) return false;
  // content_type 'image' with a URL-like output
  if (item.content_type === 'image' && item.output && /^https?:\/\//.test(item.output)) return true;
  return false;
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

function _socEngagementTier(item) {
  const total = (item.likes || 0) + (item.comments || 0) + (item.shares || 0) + (item.views || 0);
  if (total >= 50000) return { label: '🔥 Viral',    cls: 'tier-viral',   total: total };
  if (total >= 10000) return { label: '🚀 Hot',      cls: 'tier-hot',     total: total };
  if (total >= 1000)  return { label: '⚡ Trending',  cls: 'tier-trend',   total: total };
  if (total >= 100)   return { label: '📈 Decent',    cls: 'tier-decent',  total: total };
  return                     { label: '🌱 Fresh',     cls: 'tier-fresh',   total: total };
}

function _socMakeStatusBadge(status) {
  return '<span class="status-badge ' + (status || 'draft') + '">' + _socEscapeHtml(status || 'draft') + '</span>';
}

/**
 * Render a rich content card used by both Discover (search) and Saved views.
 * @param {object} item        - Content item (DB row or search result)
 * @param {object} opts
 * @param {boolean} opts.showSave   - Show a Save button (search results)
 * @param {boolean} opts.showDelete - Show a Delete button (saved items)
 */
function _socRenderContentCard(item, opts) {
  opts = opts || {};
  var tier      = _socEngagementTier(item);
  var sourceUrl = item.source_url || item.url || '';
  var hasLink   = !!sourceUrl;
  var safeUrl   = _socEscapeHtml(sourceUrl).replace(/'/g, "\\'");
  var clickOpen = hasLink
    ? ' onclick="socPanelActions.openSavedUrl(\'' + safeUrl + '\')"'
    : '';
  var cardCls   = 'soc-content-card' + (hasLink ? ' soc-content-card--clickable' : '');

  var actionsHtml = '';
  if (opts.showSave) {
    actionsHtml =
      '<button class="soc-btn soc-btn-sm soc-btn-secondary" onclick="event.stopPropagation(); socPanelActions.saveDiscovered(\'' + (item.id || '') + '\')">' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 7.8C5 6.12 6.34 4.8 8.02 4.8h7.96C17.66 4.8 19 6.12 19 7.8V18c0 .97-1.11 1.53-1.88.95L12 15l-5.12 3.95C6.11 19.53 5 18.97 5 18z"/></svg>' +
        ' Save' +
      '</button>';
  }
  if (opts.showDelete) {
    actionsHtml =
      '<button class="soc-icon-btn danger" onclick="event.stopPropagation(); socPanelActions.deleteSaved(\'' + item.id + '\')" title="Remove">' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5" d="m19.5 5.5l-.62 10.025c-.158 2.561-.237 3.842-.88 4.763a4 4 0 0 1-1.2 1.128c-.957.584-2.24.584-4.806.584c-2.57 0-3.855 0-4.814-.585a4 4 0 0 1-1.2-1.13c-.642-.922-.72-2.205-.874-4.77L4.5 5.5M3 5.5h18m-4.944 0l-.683-1.408c-.453-.936-.68-1.403-1.071-1.695a2 2 0 0 0-.275-.172C13.594 2 13.074 2 12.035 2c-1.066 0-1.599 0-2.04.234a2 2 0 0 0-.278.18c-.395.303-.616.788-1.058 1.757L8.053 5.5"/></svg>' +
      '</button>';
  }

  return (
    '<div class="' + cardCls + '" data-id="' + (item.id || '') + '"' + clickOpen + '>' +
      '<div class="soc-content-card__header">' +
        '<span class="soc-engagement-tier ' + tier.cls + '">' + tier.label + '</span>' +
        '<span class="soc-engagement-total">' + _socFormatNumber(tier.total) + ' engagement</span>' +
      '</div>' +
      '<div class="soc-content-card__body">' +
        '<div class="soc-content-card__title">' + _socEscapeHtml(item.title || item.body || 'Untitled') + '</div>' +
        '<div class="soc-content-card__meta">' +
          _socMakePlatformBadge(item.platform) +
          (item.source_author || item.creatorUsername
            ? ' <span class="soc-content-card__author">by ' + _socEscapeHtml(item.source_author || item.creatorUsername || '') + '</span>'
            : '') +
        '</div>' +
        '<div class="soc-content-card__stats">' +
          '<div class="soc-stat-cell"><span class="soc-stat-value">' + _socFormatNumber(item.views)    + '</span><span class="soc-stat-label">Views</span></div>' +
          '<div class="soc-stat-cell"><span class="soc-stat-value">' + _socFormatNumber(item.likes)    + '</span><span class="soc-stat-label">Likes</span></div>' +
          '<div class="soc-stat-cell"><span class="soc-stat-value">' + _socFormatNumber(item.comments) + '</span><span class="soc-stat-label">Comments</span></div>' +
          '<div class="soc-stat-cell"><span class="soc-stat-value">' + _socFormatNumber(item.shares)   + '</span><span class="soc-stat-label">Shares</span></div>' +
        '</div>' +
      '</div>' +
      '<div class="soc-content-card__footer">' +
        '<span class="soc-content-card__time">' + _socTimeAgo(item.discovered_at || item.created_at) + '</span>' +
        (hasLink
          ? '<a class="soc-content-card__link" href="#" onclick="event.preventDefault(); event.stopPropagation(); socPanelActions.openSavedUrl(\'' + safeUrl + '\')" title="Open source">' +
              '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6m4-3h6v6m-11 5L21 3"/></svg>' +
            '</a>'
          : '') +
        actionsHtml +
      '</div>' +
    '</div>'
  );
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

  // ── Gallery filter bar ──
  const galSearch    = root.querySelector('#soc-gallery-search');
  const galTypeFilter = root.querySelector('#soc-gallery-type-filter');
  const galFavToggle = root.querySelector('#soc-gallery-fav-toggle');
  const galSort      = root.querySelector('#soc-gallery-sort');
  if (galSearch)     galSearch.addEventListener('input', _socApplyGalleryFilters);
  if (galTypeFilter) galTypeFilter.addEventListener('change', _socApplyGalleryFilters);
  if (galSort)       galSort.addEventListener('change', _socApplyGalleryFilters);
  if (galFavToggle)  galFavToggle.addEventListener('click', () => {
    _socGalleryFavOnly = !_socGalleryFavOnly;
    galFavToggle.classList.toggle('active', _socGalleryFavOnly);
    _socApplyGalleryFilters();
  });

  // ── Gallery select mode ──
  const galSelectToggle = root.querySelector('#soc-gallery-select-toggle');
  if (galSelectToggle) galSelectToggle.addEventListener('click', _socToggleSelectMode);
  const galSelectAll = root.querySelector('#soc-gallery-select-all');
  if (galSelectAll) galSelectAll.addEventListener('click', _socSelectAll);
  const galDeselectAll = root.querySelector('#soc-gallery-deselect-all');
  if (galDeselectAll) galDeselectAll.addEventListener('click', _socDeselectAll);
  const galDeleteSelected = root.querySelector('#soc-gallery-delete-selected');
  if (galDeleteSelected) galDeleteSelected.addEventListener('click', _socDeleteSelected);

  // ── Discover sub-tab switching (Search / Saved) ──
  root.querySelectorAll('.soc-discover-sub-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.discoverView;
      root.querySelectorAll('.soc-discover-sub-tab').forEach(b => b.classList.remove('active'));
      root.querySelectorAll('.soc-discover-view').forEach(v => v.classList.remove('active'));
      btn.classList.add('active');
      const el = root.querySelector('#soc-discover-view-' + target);
      if (el) el.classList.add('active');

      if (target === 'saved') _socLoadSavedContent();
    });
  });

  // ── Saved content controls ──
  const savedPlatformFilter = root.querySelector('#soc-saved-platform-filter');
  const savedSort           = root.querySelector('#soc-saved-sort');
  if (savedPlatformFilter) savedPlatformFilter.addEventListener('change', () => { _socSavedCache = null; _socLoadSavedContent(); });
  if (savedSort)           savedSort.addEventListener('change',           () => _socRenderSavedResults());

  // ── Discover search ──
  const discoverSearch    = root.querySelector('#soc-discover-search');
  const discoverPlatform  = root.querySelector('#soc-discover-platform');
  const discoverSearchBtn = root.querySelector('#soc-discover-search-btn');

  function _runSearch() {
    const query = discoverSearch ? discoverSearch.value.trim() : '';
    if (!query) {
      _socDiscoverCache = null; // clear cache to reload from DB
      _socDiscoverSearchCache = null;
      _socLoadDiscovered();
      return;
    }
    const platform = discoverPlatform ? (discoverPlatform.value || undefined) : undefined;
    _socDiscoverCache = null; // clear cache before new search
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

  // ── Image generate (Kie.ai) ──
  const imageGenBtn = root.querySelector('#soc-image-gen-btn');
  if (imageGenBtn) {
    imageGenBtn.addEventListener('click', () => {
      const social   = _socAPI();
      if (!social) return;
      const promptEl  = root.querySelector('#soc-image-prompt');
      const outputEl  = root.querySelector('#soc-image-output');
      const modelEl   = root.querySelector('#soc-image-model');
      const aspectEl  = root.querySelector('#soc-image-aspect');
      const qualityEl = root.querySelector('#soc-image-quality');

      const prompt = promptEl ? promptEl.value.trim() : '';
      if (!prompt) { _socShowToast('Describe the image you want', 'error'); return; }

      const model       = modelEl   ? modelEl.value   : 'nano-banana-2';
      const aspectRatio = aspectEl  ? aspectEl.value  : '1:1';
      const quality     = qualityEl ? qualityEl.value : '1K';

      // Show spinner
      if (outputEl) {
        outputEl.innerHTML =
          '<div class="soc-image-spinner">' +
            '<div class="soc-spinner"></div>' +
            '<div class="soc-spinner-text">Generating image…</div>' +
            '<div class="soc-spinner-hint">This may take up to 60 seconds</div>' +
          '</div>';
      }
      imageGenBtn.disabled = true;

      social.generateImage({ prompt, model, aspectRatio, quality })
        .then(result => {
          if (result.success && result.imageUrl) {
            if (outputEl) {
              outputEl.innerHTML =
                '<img class="soc-generated-image" src="' + _socEscapeHtml(result.imageUrl) + '" />' +
                '<div class="soc-image-actions">' +
                  '<span class="soc-image-model-tag">' + _socEscapeHtml(model) + ' · ' + _socEscapeHtml(aspectRatio) + '</span>' +
                '</div>';
            }
            _socShowToast('Image generated!', 'success');
          } else {
            if (outputEl) {
              outputEl.innerHTML = '<div class="soc-image-placeholder">' + _socEscapeHtml(result.error || 'Generation failed') + '</div>';
            }
            _socShowToast(result.error || 'Image generation failed', 'error');
          }
        })
        .catch(err => {
          console.error('[Social] Image gen failed:', err);
          if (outputEl) {
            outputEl.innerHTML = '<div class="soc-image-placeholder">Error generating image</div>';
          }
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
  const lightboxPrev  = root.querySelector('#soc-lightbox-prev');
  const lightboxNext  = root.querySelector('#soc-lightbox-next');
  if (lightboxClose) lightboxClose.addEventListener('click', () => { lightbox.classList.remove('active'); _socLightboxItems = []; _socLightboxIndex = -1; });
  if (lightbox) lightbox.addEventListener('click', e => { if (e.target === lightbox) { lightbox.classList.remove('active'); _socLightboxItems = []; _socLightboxIndex = -1; } });
  if (lightboxPrev) lightboxPrev.addEventListener('click', () => _socLightboxNavigate(-1));
  if (lightboxNext) lightboxNext.addEventListener('click', () => _socLightboxNavigate(1));
  document.addEventListener('keydown', e => {
    if (!lightbox || !lightbox.classList.contains('active')) return;
    if (e.key === 'Escape') { lightbox.classList.remove('active'); _socLightboxItems = []; _socLightboxIndex = -1; }
    else if (e.key === 'ArrowLeft') _socLightboxNavigate(-1);
    else if (e.key === 'ArrowRight') _socLightboxNavigate(1);
  });

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
    settings.get('kie.apiKey').then(val => {
      const el = root.querySelector('#soc-kie-key');
      if (el && val) el.placeholder = '••••••••';
    }).catch(() => {});
  }

  // Apify test
  const apifyTestBtn = root.querySelector('#soc-apify-test-btn');
  if (apifyTestBtn) {
    apifyTestBtn.addEventListener('click', () => {
      const key = (root.querySelector('#soc-apify-key') || {}).value || '';
      const statusEl = root.querySelector('#soc-apify-status');
      apifyTestBtn.disabled = true;
      if (statusEl) statusEl.textContent = 'Testing…';
      const social = _socAPI();
      const testFn = social && social.validateApifyKey
        ? social.validateApifyKey(key)
        : Promise.reject(new Error('validateApifyKey not available'));
      testFn
        .then(result => {
          if (statusEl) { statusEl.textContent = result.valid ? '✓ Valid' : '✗ Invalid'; statusEl.className = 'soc-key-status ' + (result.valid ? 'valid' : 'invalid'); }
          if (result.valid) {
            if (key && settings) {
              settings.set('apify.apiKey', key).then(() => {
                _socShowToast('Apify key valid & saved!', 'success');
                const el = root.querySelector('#soc-apify-key');
                if (el) { el.value = ''; el.placeholder = '••••••••'; }
              }).catch(() => _socShowToast('Key valid but failed to save', 'error'));
            } else {
              _socShowToast('Apify key is valid!', 'success');
            }
          } else {
            _socShowToast('Apify key invalid', 'error');
          }
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
      rapidTestBtn.disabled = true;
      if (statusEl) statusEl.textContent = 'Testing…';
      const social = _socAPI();
      const testFn = social && social.validateRapidAPIKey
        ? social.validateRapidAPIKey(key)
        : Promise.reject(new Error('validateRapidAPIKey not available'));
      testFn
        .then(result => {
          if (statusEl) { statusEl.textContent = result.valid ? '✓ Valid' : '✗ Invalid'; statusEl.className = 'soc-key-status ' + (result.valid ? 'valid' : 'invalid'); }
          if (result.valid) {
            if (key && settings) {
              settings.set('rapidapi.apiKey', key).then(() => {
                _socShowToast('RapidAPI key valid & saved!', 'success');
                const el = root.querySelector('#soc-rapidapi-key');
                if (el) { el.value = ''; el.placeholder = '••••••••'; }
              }).catch(() => _socShowToast('Key valid but failed to save', 'error'));
            } else {
              _socShowToast('RapidAPI key is valid!', 'success');
            }
          } else {
            _socShowToast('RapidAPI key invalid', 'error');
          }
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

  // Kie.ai test
  const kieTestBtn = root.querySelector('#soc-kie-test-btn');
  if (kieTestBtn) {
    kieTestBtn.addEventListener('click', () => {
      const key = (root.querySelector('#soc-kie-key') || {}).value || '';
      const statusEl = root.querySelector('#soc-kie-status');
      kieTestBtn.disabled = true;
      if (statusEl) statusEl.textContent = 'Testing…';
      const social = _socAPI();
      const testFn = social && social.validateKieKey
        ? social.validateKieKey(key)
        : Promise.reject(new Error('validateKieKey not available'));
      testFn
        .then(result => {
          if (statusEl) { statusEl.textContent = result.valid ? '✓ Valid' : '✗ Invalid'; statusEl.className = 'soc-key-status ' + (result.valid ? 'valid' : 'invalid'); }
          if (result.valid) {
            if (key && settings) {
              settings.set('kie.apiKey', key).then(() => {
                _socShowToast('Kie.ai key valid & saved!', 'success');
                const el = root.querySelector('#soc-kie-key');
                if (el) { el.value = ''; el.placeholder = '••••••••'; }
              }).catch(() => _socShowToast('Key valid but failed to save', 'error'));
            } else {
              _socShowToast('Kie.ai key is valid!', 'success');
            }
          } else {
            _socShowToast('Kie.ai key invalid', 'error');
          }
        })
        .catch(() => {
          if (statusEl) { statusEl.textContent = '✗ Error'; statusEl.className = 'soc-key-status invalid'; }
          _socShowToast('Test failed', 'error');
        })
        .finally(() => { kieTestBtn.disabled = false; });
    });
  }

  // Kie.ai save
  const kieSaveBtn = root.querySelector('#soc-kie-save-btn');
  if (kieSaveBtn) {
    kieSaveBtn.addEventListener('click', () => {
      const key = (root.querySelector('#soc-kie-key') || {}).value || '';
      if (!key) { _socShowToast('Enter a key to save', 'error'); return; }
      if (!settings) { _socShowToast('Settings unavailable', 'error'); return; }
      kieSaveBtn.disabled = true;
      settings.set('kie.apiKey', key)
        .then(() => {
          _socShowToast('Kie.ai key saved!', 'success');
          const el = root.querySelector('#soc-kie-key');
          if (el) { el.value = ''; el.placeholder = '••••••••'; }
        })
        .catch(() => _socShowToast('Failed to save key', 'error'))
        .finally(() => { kieSaveBtn.disabled = false; });
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
  const root    = document.getElementById('social-view');
  const results = root && root.querySelector('#soc-discover-results');
  if (!results) return;

  // If we have cached results, re-render from cache without hitting API
  if (_socDiscoverCache) {
    _socRenderDiscoverResults(_socDiscoverCache);
    return;
  }

  const social = _socAPI();
  results.innerHTML = '<div class="soc-card-grid">' + _socSkeletonCards(6) + '</div>';

  if (!social) { results.innerHTML = '<div class="soc-empty"><p>Social API unavailable</p></div>'; return; }

  social.getDiscovered(50)
    .then(items => {
      _socDiscoverCache = items;
      _socDiscoverSearchCache = null; // DB items, no raw search data
      _socRenderDiscoverResults(items);
    })
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
    .then(items => {
      // Cache search results so they persist across tab switches
      _socDiscoverCache = items;
      // Store raw search items for the Save button mapping
      _socDiscoverSearchCache = {};
      if (items && items.length) {
        items.forEach((item, idx) => {
          // Use the item's id (or index) as key for later lookup
          const key = item.id || ('search-' + idx);
          _socDiscoverSearchCache[key] = item;
        });
      }
      _socRenderDiscoverResults(items);
    })
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

  // Determine if these are search results (have save button) or DB items
  const isSearch = !!_socDiscoverSearchCache;

  let html = '<div class="soc-card-grid">';
  items.forEach(function (item) {
    html += _socRenderContentCard(item, { showSave: isSearch });
  });
  html += '</div>';
  results.innerHTML = html;
}

// ─── Saved Content (Discover → Saved sub-tab) ─────────────────────────────

function _socLoadSavedContent() {
  const root    = document.getElementById('social-view');
  const results = root && root.querySelector('#soc-saved-results');
  if (!results) return;

  // Re-render from cache if available
  if (_socSavedCache) {
    _socRenderSavedResults();
    return;
  }

  const social = _socAPI();
  results.innerHTML = '<div class="soc-card-grid">' + _socSkeletonCards(6) + '</div>';

  if (!social) { results.innerHTML = '<div class="soc-empty"><p>Social API unavailable</p></div>'; return; }

  social.getDiscovered(200)
    .then(items => {
      // Apply platform filter
      const root2      = document.getElementById('social-view');
      const filterEl   = root2 && root2.querySelector('#soc-saved-platform-filter');
      const filterPlat = filterEl ? filterEl.value : '';
      if (filterPlat) {
        _socSavedCache = (items || []).filter(i => (i.platform || '').toLowerCase() === filterPlat);
      } else {
        _socSavedCache = items || [];
      }
      _socRenderSavedResults();
    })
    .catch(err => {
      console.error('[Social] Failed to load saved content:', err);
      results.innerHTML = '<div class="soc-empty"><p>Failed to load saved content</p></div>';
    });
}

function _socRenderSavedResults() {
  const root    = document.getElementById('social-view');
  const results = root && root.querySelector('#soc-saved-results');
  if (!results || !_socSavedCache) return;

  // Sort
  const sortEl   = root.querySelector('#soc-saved-sort');
  const sortMode = sortEl ? sortEl.value : 'recency';

  const sorted = [..._socSavedCache];
  if (sortMode === 'engagement') {
    sorted.sort((a, b) => {
      const engA = (a.likes || 0) + (a.comments || 0) + (a.shares || 0) + (a.views || 0);
      const engB = (b.likes || 0) + (b.comments || 0) + (b.shares || 0) + (b.views || 0);
      return engB - engA;
    });
  } else {
    sorted.sort((a, b) => {
      const da = new Date(a.discovered_at || a.created_at || 0).getTime();
      const db = new Date(b.discovered_at || b.created_at || 0).getTime();
      return db - da;
    });
  }

  if (sorted.length === 0) {
    results.innerHTML =
      '<div class="soc-empty">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 7.8C5 6.12 6.34 4.8 8.02 4.8h7.96C17.66 4.8 19 6.12 19 7.8V18c0 .97-1.11 1.53-1.88.95L12 15l-5.12 3.95C6.11 19.53 5 18.97 5 18z"/></svg>' +
      '<p>No saved content yet</p>' +
      '<p class="hint">Save content from the Search tab to build your library</p>' +
      '</div>';
    return;
  }

  let html = '<div class="soc-card-grid">';
  sorted.forEach(function (item) {
    html += _socRenderContentCard(item, { showDelete: true });
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
      _socGalleryCache = items || [];
      _socApplyGalleryFilters();
    })
    .catch(err => {
      console.error('[Social] Failed to load gallery:', err);
      grid.innerHTML = '<div class="soc-empty" style="grid-column:1/-1"><p>Failed to load gallery</p></div>';
    });
}

function _socUpdateGalleryStats(root) {
  const statsEl = root && root.querySelector('#soc-gallery-stats');
  if (!statsEl || !_socGalleryCache) return;

  const total  = _socGalleryCache.length;
  const images = _socGalleryCache.filter(i => i.content_type === 'image' || i.media_url || _socIsImageItem(i)).length;
  const favs   = _socGalleryCache.filter(i => i.rating && i.rating > 0).length;

  statsEl.innerHTML =
    '<span class="soc-gallery-stat-pill">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 6h16M4 12h16M4 18h16"/></svg>' +
      total + ' Total</span>' +
    '<span class="soc-gallery-stat-pill">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M2 6h4m0 0v12m0-12l4 12m4-12h4m0 0v12m0-12l4 12"/></svg>' +
      images + ' Images</span>' +
    '<span class="soc-gallery-stat-pill">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"><path fill="' + (favs > 0 ? 'var(--warning)' : 'none') + '" stroke="currentColor" stroke-width="1.5" d="m12 3.5l2.713 5.497L20.7 9.91l-3.85 3.75l.909 5.298L12 16.183l-5.758 2.776l.909-5.298L3.3 9.91l5.987-.914z"/></svg>' +
      favs + ' Favorites</span>';
}

function _socApplyGalleryFilters() {
  const root = document.getElementById('social-view');
  const grid = root && root.querySelector('#soc-gallery-grid');
  if (!grid || !_socGalleryCache) return;

  _socUpdateGalleryStats(root);

  const searchVal  = (root.querySelector('#soc-gallery-search') || {}).value || '';
  const typeVal    = (root.querySelector('#soc-gallery-type-filter') || {}).value || '';
  const sortVal    = (root.querySelector('#soc-gallery-sort') || {}).value || 'newest';
  const searchLow  = searchVal.toLowerCase();

  let filtered = _socGalleryCache.filter(item => {
    if (searchLow && !(item.prompt_used || '').toLowerCase().includes(searchLow) &&
        !(item.output || '').toLowerCase().includes(searchLow)) return false;
    if (typeVal && item.content_type !== typeVal) return false;
    if (_socGalleryFavOnly && !(item.rating && item.rating > 0)) return false;
    return true;
  });

  if (sortVal === 'oldest') {
    filtered.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
  } else if (sortVal === 'top_rated') {
    filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  } else {
    filtered.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  }

  if (filtered.length === 0) {
    grid.className = '';
    grid.innerHTML =
      '<div class="soc-empty" style="grid-column:1/-1">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M22 12c0 5.523-4.477 10-10 10S2 17.523 2 12S6.477 2 12 2s10 4.477 10 10"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="m14.5 9.5l-5 5m0-5l5 5"/></svg>' +
      '<p>' + (_socGalleryCache.length === 0 ? 'No generated content yet' : 'No items match filters') + '</p>' +
      (_socGalleryCache.length === 0 ? '<p class="hint">Use the Create tab to generate copy, images, and more</p>' : '') +
      '</div>';
    return;
  }

  grid.className = 'soc-gallery-grid';
  grid.innerHTML = filtered.map(item => {
    const isFav = item.rating && item.rating > 0;
    const imageUrl = item.media_url || (_socIsImageItem(item) ? item.output : null);
    const isImage = !!imageUrl;
    const isSelected = _socSelectedIds.has(item.id);
    const clickAction = _socSelectMode
      ? 'socPanelActions.toggleSelectItem(\'' + item.id + '\')'
      : 'socPanelActions.openLightbox(\'' + item.id + '\')';
    return (
      '<div class="soc-gallery-item' + (isImage ? ' soc-gallery-image-item' : '') + (isSelected ? ' selected' : '') + '" data-id="' + item.id + '">' +
        (_socSelectMode ? '<div class="soc-gallery-checkbox' + (isSelected ? ' checked' : '') + '" onclick="socPanelActions.toggleSelectItem(\'' + item.id + '\')">' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"><path fill="' + (isSelected ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2" d="M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/>' +
          (isSelected ? '<path fill="none" stroke="var(--bg-primary)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" d="M7 13l3 3l7-7"/>' : '') +
          '</svg></div>' : '') +
        (isImage
          ? '<img class="soc-gallery-item-media" src="' + _socEscapeHtml(imageUrl) + '" onclick="' + clickAction + '" />'
          : '<div class="soc-gallery-item-content" onclick="' + clickAction + '">' + _socEscapeHtml(item.output) + '</div>') +
        '<div class="soc-gallery-item-footer">' +
          '<span>' + _socMakePlatformBadge(item.platform || item.content_type) + ' · ' + _socTimeAgo(item.created_at) + '</span>' +
          '<div class="soc-gallery-item-actions">' +
            (isImage ? '<button class="soc-icon-btn" onclick="socPanelActions.downloadImage(\'' + item.id + '\')" title="Download">' +
              '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 3v13m0 0l-4-4m4 4l4-4M4 21h16"/></svg>' +
            '</button>' : '') +
            '<button class="soc-icon-btn soc-favorite-btn' + (isFav ? ' active' : '') + '" data-id="' + item.id + '" onclick="socPanelActions.toggleFavorite(\'' + item.id + '\',' + (isFav ? '0' : '5') + ')" title="Favorite">' +
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
  if (_socSelectMode) _socUpdateSelectCount();
}

// ─── Gallery Select Mode ──────────────────────────────────────────────────

function _socToggleSelectMode() {
  _socSelectMode = !_socSelectMode;
  _socSelectedIds.clear();
  const root = document.getElementById('social-view');
  if (!root) return;
  const toggle = root.querySelector('#soc-gallery-select-toggle');
  if (toggle) toggle.classList.toggle('active', _socSelectMode);
  const toolbar = root.querySelector('#soc-gallery-select-toolbar');
  if (toolbar) toolbar.classList.toggle('active', _socSelectMode);
  _socApplyGalleryFilters();
}

function _socSelectAll() {
  const root = document.getElementById('social-view');
  if (!root) return;
  root.querySelectorAll('.soc-gallery-item[data-id]').forEach(el => {
    const id = el.dataset.id;
    if (id) { _socSelectedIds.add(id); el.classList.add('selected'); }
  });
  _socUpdateSelectCount();
}

function _socDeselectAll() {
  _socSelectedIds.clear();
  const root = document.getElementById('social-view');
  if (!root) return;
  root.querySelectorAll('.soc-gallery-item.selected').forEach(el => el.classList.remove('selected'));
  _socUpdateSelectCount();
}

function _socToggleSelectItem(id) {
  const root = document.getElementById('social-view');
  const el = root && root.querySelector('.soc-gallery-item[data-id="' + id + '"]');
  if (_socSelectedIds.has(id)) {
    _socSelectedIds.delete(id);
    if (el) el.classList.remove('selected');
  } else {
    _socSelectedIds.add(id);
    if (el) el.classList.add('selected');
  }
  _socUpdateSelectCount();
}

function _socUpdateSelectCount() {
  const root = document.getElementById('social-view');
  const countEl = root && root.querySelector('#soc-gallery-select-count');
  if (countEl) countEl.textContent = _socSelectedIds.size + ' selected';
  const deleteBtn = root && root.querySelector('#soc-gallery-delete-selected');
  if (deleteBtn) deleteBtn.disabled = _socSelectedIds.size === 0;
}

function _socDeleteSelected() {
  const social = _socAPI();
  if (!social || _socSelectedIds.size === 0) return;
  if (!confirm('Delete ' + _socSelectedIds.size + ' selected items?')) return;
  const ids = Array.from(_socSelectedIds);
  social.bulkDeleteGenerated(ids)
    .then(result => {
      if (result.success) {
        _socShowToast('Deleted ' + (result.deleted || ids.length) + ' items', 'success');
        _socSelectedIds.clear();
        _socLoadGallery();
      } else {
        _socShowToast('Failed to delete: ' + (result.error || 'Unknown error'), 'error');
      }
    })
    .catch(() => _socShowToast('Failed to delete selected items', 'error'));
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

// ─── Lightbox Navigation Helper ─────────────────────────────────────────────

function _socLightboxShowItem(item) {
  const root    = document.getElementById('social-view');
  const lbBody  = root && root.querySelector('#soc-lightbox-body');
  const lbMeta  = root && root.querySelector('#soc-lightbox-meta');
  if (!lbBody) return;

  const imageUrl = item.media_url || (_socIsImageItem(item) ? item.output : null);
  if (imageUrl) {
    lbBody.innerHTML = '<img src="' + _socEscapeHtml(imageUrl) + '" style="max-width:100%;border-radius:8px;" />';
  } else {
    lbBody.textContent = item.output || '';
  }

  if (lbMeta) {
    const downloadBtn = imageUrl
      ? '<button class="soc-icon-btn" onclick="socPanelActions.downloadImage(\'' + item.id + '\')" title="Download" style="margin-left:auto">' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 3v13m0 0l-4-4m4 4l4-4M4 21h16"/></svg>' +
        '</button>'
      : '';
    lbMeta.innerHTML =
      '<span>' + _socMakePlatformBadge(item.platform || item.content_type) + '</span>' +
      (item.prompt_used ? '<span style="opacity:0.7;font-style:italic">' + _socEscapeHtml(item.prompt_used) + '</span>' : '') +
      '<span>' + _socTimeAgo(item.created_at) + '</span>' +
      downloadBtn;
  }
}

function _socLightboxNavigate(dir) {
  if (_socLightboxItems.length === 0) return;
  _socLightboxIndex = (_socLightboxIndex + dir + _socLightboxItems.length) % _socLightboxItems.length;
  _socLightboxShowItem(_socLightboxItems[_socLightboxIndex]);
}

// ─── Global Actions (callable from inline onclick) ─────────────────────────

window.socPanelActions = {
  saveDiscovered(id) {
    const social = _socAPI();
    if (!social) { _socShowToast('Social API unavailable', 'error'); return; }

    // Look up the raw search result from cache
    const item = _socDiscoverSearchCache && _socDiscoverSearchCache[id];
    if (!item) {
      // Already a DB item (from getDiscovered), nothing to save
      _socShowToast('Content already saved', 'success');
      return;
    }

    // Map ContentResult → CreateDiscoveredContentInput
    const payload = {
      platform:     item.platform || 'unknown',
      content_type: 'post',
      source_url:   item.url || null,
      source_author: item.creatorUsername || null,
      title:        item.title || null,
      body:         item.caption || null,
      likes:        item.likes || 0,
      comments:     item.comments || 0,
      shares:       item.shares || 0,
      views:        item.views || 0,
    };

    social.saveDiscovered(payload)
      .then(result => {
        if (result.success) {
          _socShowToast('Content saved to library', 'success');
        } else {
          _socShowToast(result.error || 'Failed to save content', 'error');
        }
      })
      .catch(err => {
        console.error('[Social] Save discovered failed:', err);
        _socShowToast('Failed to save content', 'error');
      });
  },

  deleteSaved(id) {
    const social = _socAPI();
    if (!social || !confirm('Remove this saved content?')) return;
    social.deleteDiscovered(id)
      .then(result => {
        if (result.success) {
          // Remove from cache & re-render
          if (_socSavedCache) {
            _socSavedCache = _socSavedCache.filter(i => i.id !== id);
          }
          _socRenderSavedResults();
          _socShowToast('Content removed', 'success');
        } else {
          _socShowToast(result.error || 'Failed to remove', 'error');
        }
      })
      .catch(() => _socShowToast('Failed to remove', 'error'));
  },

  openSavedUrl(url) {
    if (url && window.pocketAgent && window.pocketAgent.app) {
      window.pocketAgent.app.openExternal(url);
    }
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

  toggleSelectItem(id) {
    _socToggleSelectItem(id);
  },

  toggleFavorite(id, rating) {
    const social = _socAPI();
    if (!social) return;
    const btn = document.querySelector('.soc-favorite-btn[data-id="' + id + '"]');
    if (btn) {
      const willBeActive = rating > 0;
      btn.classList.toggle('active', willBeActive);
      const path = btn.querySelector('path');
      if (path) path.setAttribute('fill', willBeActive ? 'currentColor' : 'none');
      btn.classList.remove('soc-fav-pop');
      void btn.offsetWidth;
      btn.classList.add('soc-fav-pop');
    }
    social.favoriteGenerated(id, rating)
      .then(result => {
        if (result.success) {
          _socShowToast(rating > 0 ? 'Favorited ⭐' : 'Unfavorited', 'success');
          _socLoadGallery();
        } else if (btn) {
          btn.classList.toggle('active', !rating);
          const path = btn.querySelector('path');
          if (path) path.setAttribute('fill', rating ? 'none' : 'currentColor');
        }
      })
      .catch(() => {
        if (btn) {
          btn.classList.toggle('active', !rating);
          const path = btn.querySelector('path');
          if (path) path.setAttribute('fill', rating ? 'none' : 'currentColor');
        }
        _socShowToast('Failed to update', 'error');
      });
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

  downloadImage(id) {
    const social = _socAPI();
    if (!social) return;
    social.downloadImage(id)
      .then(result => {
        if (result.success) {
          _socShowToast('Image saved', 'success');
        } else if (result.error !== 'Cancelled') {
          _socShowToast(result.error || 'Download failed', 'error');
        }
      })
      .catch(() => _socShowToast('Download failed', 'error'));
  },

  openLightbox(id) {
    const social    = _socAPI();
    const root      = document.getElementById('social-view');
    const lightbox  = root && root.querySelector('#soc-lightbox');
    if (!social || !lightbox) return;

    social.getGenerated(100)
      .then(items => {
        const idx = items.findIndex(i => i.id === id);
        if (idx === -1) return;

        _socLightboxItems = items;
        _socLightboxIndex = idx;
        _socLightboxShowItem(items[idx]);
        lightbox.classList.add('active');
      })
      .catch(() => {});
  },
};
