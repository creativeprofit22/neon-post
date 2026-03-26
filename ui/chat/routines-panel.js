/* Routines Panel — embedded in chat.html */

let _rtnInitialized = false;
let _rtnNotyf = null;
let _rtnCurrentScheduleType = 'daily';
const _rtnSelectedDays = new Set();
let _rtnSessionsMap = {};
let _rtnWorkflowCommands = [];

// ---- Show / Hide ----

function showRoutinesPanel() {
  const chatView = document.getElementById('chat-view');
  const routinesView = document.getElementById('routines-view');
  if (!routinesView) return;

  _dismissOtherPanels('routines-view');

  chatView.classList.add('hidden');
  routinesView.classList.add('active');

  const sidebarBtn = document.getElementById('sidebar-routines-btn');
  if (sidebarBtn) sidebarBtn.classList.add('active');

  if (!_rtnInitialized) {
    _rtnInit();
    _rtnInitialized = true;
  }

  _rtnLoadJobs();
}

function hideRoutinesPanel() {
  const chatView = document.getElementById('chat-view');
  const routinesView = document.getElementById('routines-view');
  if (!routinesView) return;

  routinesView.classList.remove('active');
  chatView.classList.remove('hidden');

  const sidebarBtn = document.getElementById('sidebar-routines-btn');
  if (sidebarBtn) sidebarBtn.classList.remove('active');
}

function toggleRoutinesPanel() {
  const routinesView = document.getElementById('routines-view');
  if (routinesView && routinesView.classList.contains('active')) {
    hideRoutinesPanel();
  } else {
    showRoutinesPanel();
  }
}

// ---- Toast ----

function _rtnShowToast(message, type) {
  if (!_rtnNotyf) {
    _rtnNotyf = new Notyf({
      duration: 3000, position: { x: 'right', y: 'bottom' },
      dismissible: true,
      types: [
        { type: 'success', background: '#4ade80' },
        { type: 'error', background: '#f87171' }
      ]
    });
  }
  _rtnNotyf[type === 'error' ? 'error' : 'success'](message);
}

// ---- Helpers ----

function _rtnEscapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function _rtnEscapeAttr(text) {
  return text.replace(/'/g, "\\'").replace(/"/g, '\\"');
}

// ---- Init ----

function _rtnInit() {
  const root = document.getElementById('routines-view');
  if (!root) return;

  // Generate hour/minute options
  root.querySelectorAll('select[id^="rtn-hour-"]').forEach(el => {
    let html = '';
    for (let i = 1; i <= 12; i++) {
      html += `<option value="${i}" ${i === 9 ? 'selected' : ''}>${i}</option>`;
    }
    el.innerHTML = html;
  });
  root.querySelectorAll('select[id^="rtn-minute-"]').forEach(el => {
    el.innerHTML = '<option value="0">00</option><option value="15">15</option><option value="30">30</option><option value="45">45</option>';
  });

  // Schedule tabs
  root.querySelectorAll('.rtn-schedule-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      root.querySelectorAll('.rtn-schedule-tab').forEach(t => t.classList.remove('active'));
      root.querySelectorAll('.rtn-schedule-options').forEach(o => o.classList.remove('active'));
      tab.classList.add('active');
      _rtnCurrentScheduleType = tab.dataset.type;
      document.getElementById(`rtn-options-${_rtnCurrentScheduleType}`).classList.add('active');
    });
  });

  // Day buttons
  root.querySelectorAll('.rtn-day-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const day = btn.dataset.day;
      if (_rtnSelectedDays.has(day)) { _rtnSelectedDays.delete(day); btn.classList.remove('selected'); }
      else { _rtnSelectedDays.add(day); btn.classList.add('selected'); }
    });
  });

  // Load sessions & workflows
  _rtnLoadSessions();
  _rtnLoadWorkflows();
}

// ---- Schedule ----

function _rtnTo24Hour(hour, minute, ampm) {
  let h = parseInt(hour);
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return { hour: h, minute: parseInt(minute) };
}

function _rtnBuildCronExpression() {
  if (_rtnCurrentScheduleType === 'interval') {
    const hours = parseInt(document.getElementById('rtn-interval-hours').value);
    const minutes = parseInt(document.getElementById('rtn-interval-minutes').value);
    const totalMinutes = (hours * 60) + minutes;
    if (totalMinutes === 0) return '*/30 * * * *';
    if (hours > 0 && minutes === 0) return `0 */${hours} * * *`;
    if (hours === 0) return `*/${minutes} * * * *`;
    return `*/${totalMinutes} * * * *`;
  }

  const suffix = _rtnCurrentScheduleType === 'weekdays' ? 'weekdays' :
                 _rtnCurrentScheduleType === 'custom' ? 'custom' : 'daily';
  const hour = document.getElementById(`rtn-hour-${suffix}`).value;
  const minute = document.getElementById(`rtn-minute-${suffix}`).value;
  const ampm = document.getElementById(`rtn-ampm-${suffix}`).value;
  const time = _rtnTo24Hour(hour, minute, ampm);

  if (_rtnCurrentScheduleType === 'daily') return `${time.minute} ${time.hour} * * *`;
  if (_rtnCurrentScheduleType === 'weekdays') return `${time.minute} ${time.hour} * * 1-5`;
  if (_rtnCurrentScheduleType === 'custom') {
    if (_rtnSelectedDays.size === 0) return `${time.minute} ${time.hour} * * *`;
    return `${time.minute} ${time.hour} * * ${Array.from(_rtnSelectedDays).sort().join(',')}`;
  }
}

function _rtnParseDbTimestamp(timestamp) {
  if (!timestamp) return new Date();
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(timestamp)) return new Date(timestamp);
  return new Date(timestamp.replace(' ', 'T') + 'Z');
}

function _rtnScheduleToHuman(job) {
  const scheduleType = job.schedule_type || 'cron';

  if (scheduleType === 'at' && job.run_at) {
    const runAt = _rtnParseDbTimestamp(job.run_at);
    const now = new Date();
    const h = runAt.getHours(), m = runAt.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    const dh = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const timeStr = `${dh}:${m.toString().padStart(2, '0')} ${ampm}`;
    if (runAt.toDateString() === now.toDateString()) return `Today at ${timeStr}`;
    const tmrw = new Date(now); tmrw.setDate(tmrw.getDate() + 1);
    if (runAt.toDateString() === tmrw.toDateString()) return `Tomorrow at ${timeStr}`;
    return `${runAt.toLocaleDateString()} at ${timeStr}`;
  }

  if (scheduleType === 'every' && job.interval_ms) {
    const ms = job.interval_ms;
    if (ms < 60000) return `Every ${Math.round(ms / 1000)} seconds`;
    if (ms < 3600000) return `Every ${Math.round(ms / 60000)} minutes`;
    if (ms < 86400000) { const hrs = Math.round(ms / 3600000); return `Every ${hrs} hour${hrs === 1 ? '' : 's'}`; }
    const days = Math.round(ms / 86400000); return `Every ${days} day${days === 1 ? '' : 's'}`;
  }

  const cron = job.schedule;
  if (!cron) return 'Unknown schedule';
  const parts = cron.split(' ');
  if (parts.length !== 5) return cron;
  const [minute, hour, , , dow] = parts;

  if (minute.startsWith('*/')) return `Every ${minute.slice(2)} minutes`;
  if (hour.startsWith('*/')) { const hrs = hour.slice(2); return `Every ${hrs} hour${hrs === '1' ? '' : 's'}`; }

  const h = parseInt(hour), m = parseInt(minute);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const dh = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const timeStr = `${dh}:${m.toString().padStart(2, '0')} ${ampm}`;

  if (dow === '*') return `${timeStr} daily`;
  if (dow === '1-5') return `${timeStr} weekdays`;
  if (dow === '0,6') return `${timeStr} weekends`;
  if (dow !== '*') {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return `${timeStr} on ${dow.split(',').map(d => dayNames[parseInt(d)]).join(', ')}`;
  }
  return `${timeStr} daily`;
}

// ---- Data Loading ----

async function _rtnLoadSessions() {
  try {
    const sessions = await window.pocketAgent.sessions.list();
    const sel = document.getElementById('rtn-job-session');
    if (!sel) return;
    _rtnSessionsMap = {};
    sel.innerHTML = sessions.map(s => {
      _rtnSessionsMap[s.id] = s.name;
      return `<option value="${_rtnEscapeAttr(s.id)}"${s.id === 'default' ? ' selected' : ''}>${_rtnEscapeHtml(s.name)}</option>`;
    }).join('');
  } catch (err) { console.error('[Routines] Failed to load sessions:', err); }
}

async function _rtnLoadWorkflows() {
  try {
    _rtnWorkflowCommands = await window.pocketAgent.commands.list();
    const sel = document.getElementById('rtn-prompt-source');
    if (!sel) return;
    _rtnWorkflowCommands.forEach(cmd => {
      const opt = document.createElement('option');
      opt.value = cmd.name;
      opt.textContent = cmd.name;
      sel.appendChild(opt);
    });
  } catch (err) { console.error('[Routines] Failed to load workflows:', err); }
}

async function _rtnLoadJobs() {
  const jobsList = document.getElementById('rtn-jobs-list');
  if (!jobsList) return;

  try {
    const allJobs = await window.pocketAgent.cron.list();
    const jobs = allJobs.filter(job => (job.schedule_type || 'cron') !== 'at');

    if (jobs.length === 0) {
      jobsList.innerHTML = '<div class="rtn-empty"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><p>nothing scheduled yet!</p></div>';
      return;
    }

    jobsList.innerHTML = jobs.map(job => {
      const sessionName = _rtnSessionsMap[job.session_id] || job.session_id || 'Default';
      const promptDisplay = job.prompt.startsWith('[Workflow: ')
        ? '⚡ ' + _rtnEscapeHtml(job.prompt.substring(11, job.prompt.indexOf(']')))
        : _rtnEscapeHtml(job.prompt);
      return `
        <div class="rtn-job-item ${job.enabled ? '' : 'disabled'}">
          <div class="rtn-job-status"></div>
          <div class="rtn-job-info">
            <div class="rtn-job-name">${_rtnEscapeHtml(job.name)}<span class="rtn-job-session-badge">${_rtnEscapeHtml(sessionName)}</span></div>
            <div class="rtn-job-schedule">${_rtnScheduleToHuman(job)}</div>
            <div class="rtn-job-prompt">${promptDisplay}</div>
          </div>
          <div class="rtn-job-actions">
            <button class="rtn-icon-btn" onclick="playNormalClick(); rtnToggleJob('${_rtnEscapeAttr(job.name)}', ${!job.enabled})" title="${job.enabled ? 'Pause' : 'Resume'}">
              ${job.enabled
                ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
                : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>'
              }
            </button>
            <button class="rtn-icon-btn" onclick="playNormalClick(); rtnRunJob('${_rtnEscapeAttr(job.name)}')" title="Test run">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6v5l3 9H6l3-9V3z"/><path d="M9 3h6"/><path d="M10 12h4"/></svg>
            </button>
            <button class="rtn-icon-btn danger" onclick="playNormalClick(); rtnDeleteJob('${_rtnEscapeAttr(job.name)}')" title="Delete">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>`;
    }).join('');
  } catch (err) {
    jobsList.innerHTML = `<div class="rtn-empty"><p>Error: ${_rtnEscapeHtml(err.message)}</p></div>`;
  }
}

// ---- Actions (global for onclick) ----

function rtnHandlePromptSourceChange() {
  const source = document.getElementById('rtn-prompt-source').value;
  const promptRow = document.getElementById('rtn-prompt-row');
  const textarea = document.getElementById('rtn-job-prompt');
  if (source === 'custom') {
    promptRow.classList.remove('hidden');
    textarea.value = '';
    textarea.readOnly = false;
    textarea.placeholder = "what should i do when this kicks off?";
  } else {
    const cmd = _rtnWorkflowCommands.find(c => c.name === source);
    if (cmd) {
      promptRow.classList.add('hidden');
      textarea.value = `[Workflow: ${cmd.name}]\n${cmd.content}\n[/Workflow]`;
    }
  }
}

async function rtnCreateJob() {
  const name = document.getElementById('rtn-job-name').value.trim();
  const source = document.getElementById('rtn-prompt-source').value;
  const prompt = document.getElementById('rtn-job-prompt').value.trim();
  const sessionId = document.getElementById('rtn-job-session').value;

  if (!name) { _rtnShowToast('Need a name!', 'error'); return; }
  if (source === 'custom' && !prompt) { _rtnShowToast('Need a prompt!', 'error'); return; }

  const schedule = _rtnBuildCronExpression();
  try {
    const result = await window.pocketAgent.cron.create(name, schedule, prompt, 'default', sessionId);
    if (result.success) {
      document.getElementById('rtn-job-name').value = '';
      document.getElementById('rtn-job-prompt').value = '';
      document.getElementById('rtn-prompt-source').value = 'custom';
      rtnHandlePromptSourceChange();
      _rtnShowToast('Routine created!', 'success');
      _rtnLoadJobs();
    } else { _rtnShowToast('Couldn\'t create that', 'error'); }
  } catch (err) { _rtnShowToast(err.message, 'error'); }
}

async function rtnToggleJob(name, enabled) {
  try {
    await window.pocketAgent.cron.toggle(name, enabled);
    _rtnShowToast(enabled ? 'Back at it!' : 'Taking a break', 'success');
    _rtnLoadJobs();
  } catch (err) { _rtnShowToast(err.message, 'error'); }
}

async function rtnRunJob(name) {
  _rtnShowToast('On it!', 'success');
  try { await window.pocketAgent.cron.run(name); }
  catch (err) { _rtnShowToast(err.message, 'error'); }
}

async function rtnDeleteJob(name) {
  if (!confirm(`Delete "${name}"?`)) return;
  try {
    await window.pocketAgent.cron.delete(name);
    _rtnShowToast('Poof! Gone.', 'success');
    _rtnLoadJobs();
  } catch (err) { _rtnShowToast(err.message, 'error'); }
}
