// ============================================================
// APP CÁ NHÂN — Nâng cấp (load sau app.js + app-ext.js)
// Chỉ thêm tính năng, không thay thế logic gốc
// ============================================================

const TASK_URGENCY_META = {
  critical: { emoji: '🔴', label: 'Khẩn cấp', cls: 'badge-urgency-critical', hours: 2 },
  rush:     { emoji: '🟠', label: 'Gấp', cls: 'badge-urgency-rush', hours: 24 },
  soon:     { emoji: '🟡', label: 'Sắp đến', cls: 'badge-urgency-soon', hours: 72 },
  normal:   { emoji: '🟢', label: 'Bình thường', cls: 'badge-urgency-normal', hours: Infinity },
  overdue:  { emoji: '⚠️', label: 'Quá hạn', cls: 'badge-urgency-overdue', hours: 0 },
  none:     { emoji: '', label: '', cls: '', hours: Infinity }
};

const TASK_WARN_LS_PREFIX = 'lifeos_task_deadline_warned_';
const TASK_WARN_WINDOW_MS = 20 * 60 * 1000;
const TASK_UPGRADE_TICK_MS = 60 * 1000;

let taskUpgradeIntervalId = null;

// ---- LOGO SVG ----
const APP_LOGO_SVG = `<svg class="app-logo-svg" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="loGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#7c3aed"/>
      <stop offset="45%" stop-color="#ec4899"/>
      <stop offset="100%" stop-color="#a855f7"/>
    </linearGradient>
    <linearGradient id="loShine" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <filter id="lo3d" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#7c3aed" flood-opacity="0.55"/>
      <feDropShadow dx="0" dy="1" stdDeviation="1" flood-color="#ec4899" flood-opacity="0.35"/>
    </filter>
  </defs>
  <rect x="2" y="2" width="44" height="44" rx="12" fill="url(#loGrad)" filter="url(#lo3d)"/>
  <rect x="2" y="2" width="44" height="22" rx="12" fill="url(#loShine)"/>
  <text x="11" y="33" font-family="Sora,sans-serif" font-size="22" font-weight="800" fill="#fff" opacity="0.95">L</text>
  <text x="26" y="33" font-family="Sora,sans-serif" font-size="22" font-weight="800" fill="#fff" opacity="0.85">O</text>
  <circle cx="38" cy="10" r="3" fill="#fff" opacity="0.5"/>
</svg>`;

function injectAppLogo(){
  document.querySelectorAll('.logo-icon').forEach(el=>{
    if(!el.querySelector('.app-logo-svg')){
      el.classList.add('upgrade-logo-wrap');
      el.innerHTML = APP_LOGO_SVG;
    }
  });
  const sidebar = document.getElementById('sidebar');
  if(sidebar) sidebar.classList.add('upgrade-sidebar');
}

// ---- TASK DEADLINE HELPERS ----
function ensureTaskId(task){
  if(!task.id) task.id = 'tsk_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  return task.id;
}

function getTaskDueDateTime(t){
  if(!t || !t.due) return null;
  const time = (t.dueTime && String(t.dueTime).trim()) ? String(t.dueTime).trim() : '23:59';
  const parts = time.split(':');
  const hh = parts[0] || '23';
  const mm = parts[1] || '59';
  const d = new Date(`${t.due}T${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:00`);
  return isNaN(d.getTime()) ? null : d;
}

function getTaskUrgencyLevel(t){
  if(!t || t.done || !t.due) return 'none';
  const due = getTaskDueDateTime(t);
  if(!due) return 'none';
  const diffMs = due.getTime() - Date.now();
  if(diffMs < 0) return 'overdue';
  const diffH = diffMs / 3600000;
  if(diffH < 2) return 'critical';
  if(diffH < 24) return 'rush';
  if(diffH < 72) return 'soon';
  return 'normal';
}

function getTaskUrgencyBadgeHtml(t){
  const level = getTaskUrgencyLevel(t);
  if(level === 'none') return '';
  const meta = TASK_URGENCY_META[level];
  return `<span class="badge upgrade-urgency-badge ${meta.cls}">${meta.emoji} ${meta.label}</span>`;
}

function getTaskDeadlineSortKey(t){
  if(t.done) return Number.MAX_SAFE_INTEGER;
  const due = getTaskDueDateTime(t);
  if(!due) return Number.MAX_SAFE_INTEGER - 1;
  const priBoost = { urgent: 0, high: 1800000, medium: 3600000, low: 7200000 };
  const p = typeof normalizeTaskPriority === 'function' ? normalizeTaskPriority(t) : (t.priority || 'medium');
  return due.getTime() - (priBoost[p] || 0);
}

function compareTasksByDeadline(a, b, today){
  if(a.done !== b.done) return a.done ? 1 : -1;
  const ka = getTaskDeadlineSortKey(a);
  const kb = getTaskDeadlineSortKey(b);
  if(ka !== kb) return ka - kb;
  if(typeof taskSortScore === 'function'){
    const sa = taskSortScore(a, today);
    const sb = taskSortScore(b, today);
    if(sa !== sb) return sa - sb;
  }
  return (a.due || '9999').localeCompare(b.due || '9999');
}

function estimateTaskMinutes(t){
  const base = { main: 60, sub: 30, extra: 15 };
  let mins = base[t.type] || 30;
  if(t.target > 0) mins = Math.max(mins, Math.min(180, Math.round((t.target - (t.progress || 0)) * 5)));
  const pri = typeof normalizeTaskPriority === 'function' ? normalizeTaskPriority(t) : (t.priority || 'medium');
  if(pri === 'urgent') mins = Math.ceil(mins * 1.2);
  return Math.max(15, mins);
}

function formatDurationVi(mins){
  if(mins >= 60){
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h}h ${m}p` : `${h}h`;
  }
  return `${mins}p`;
}

function getTodayPlanTasks(){
  const s = typeof getState === 'function' ? getState() : { tasks: [] };
  const today = new Date().toISOString().split('T')[0];
  const pending = (s.tasks || []).filter(t => !t.done);
  return [...pending].sort((a, b) => compareTasksByDeadline(a, b, today));
}

function buildWorkflowAnalysis(){
  const s = typeof getState === 'function' ? getState() : { tasks: [] };
  const today = new Date().toISOString().split('T')[0];
  const pending = (s.tasks || []).filter(t => !t.done);
  const typeOrder = { main: 0, sub: 1, extra: 2 };
  const priOrder = { urgent: 0, high: 1, medium: 2, low: 3 };

  const items = pending.map(t => {
    const reasons = [];
    let score = 0;
    const urgency = getTaskUrgencyLevel(t);
    const due = getTaskDueDateTime(t);

    if(urgency === 'overdue'){ score += 10000; reasons.push('Đã quá hạn — cần xử lý ngay'); }
    else if(urgency === 'critical'){ score += 8000; reasons.push('Còn dưới 2 giờ đến deadline'); }
    else if(urgency === 'rush'){ score += 6000; reasons.push('Deadline trong 24 giờ'); }
    else if(urgency === 'soon'){ score += 4000; reasons.push('Deadline trong 3 ngày tới'); }

    const pri = typeof normalizeTaskPriority === 'function' ? normalizeTaskPriority(t) : (t.priority || 'medium');
    score += (4 - (priOrder[pri] ?? 2)) * 500;
    if(pri === 'urgent' || pri === 'high') reasons.push(`Mức ưu tiên: ${TASK_PRIORITY_LABELS?.[pri] || pri}`);

    score += (3 - (typeOrder[t.type] ?? 1)) * 300;
    if(t.type === 'main') reasons.push('Việc chính — nên làm trước việc phụ/phát sinh');
    else if(t.type === 'sub') reasons.push('Việc phụ — làm sau khi xong việc chính');
    else if(t.type === 'extra') reasons.push('Phát sinh — xếp sau các việc đã lên kế hoạch');

    if(t.due === today) { score += 800; reasons.push('Hạn hôm nay'); }
    if(due) score -= due.getTime() / 1e10;

    pending.forEach(other => {
      if(other === t || !other.name) return;
      const note = (t.note || '').toLowerCase();
      if(note.includes(other.name.toLowerCase())){
        score -= 200;
        reasons.push(`Có thể phụ thuộc "${other.name}" — làm việc đó trước`);
      }
    });

    if(!reasons.length) reasons.push('Sắp xếp theo deadline và loại việc');

    return { task: t, score, reasons: [...new Set(reasons)], estMinutes: estimateTaskMinutes(t) };
  });

  items.sort((a, b) => b.score - a.score);
  return items;
}

// ---- DEADLINE WARNINGS (20 phút) ----
function getTaskWarnStorageKey(){
  const u = typeof getActiveUsername === 'function' ? (getActiveUsername() || 'guest') : 'guest';
  return TASK_WARN_LS_PREFIX + u;
}

function getTaskWarnStorage(){
  try { return JSON.parse(localStorage.getItem(getTaskWarnStorageKey()) || '{}'); }
  catch(e){ return {}; }
}

function setTaskWarned(taskId){
  const store = getTaskWarnStorage();
  store[taskId] = Date.now();
  localStorage.setItem(getTaskWarnStorageKey(), JSON.stringify(store));
}

function isTaskWarned(taskId){
  return !!getTaskWarnStorage()[taskId];
}

function clearTaskWarn(taskId){
  const store = getTaskWarnStorage();
  delete store[taskId];
  localStorage.setItem(getTaskWarnStorageKey(), JSON.stringify(store));
}

function playDeadlineWarningBeep(){
  try{
    if(typeof playBeep === 'function'){ playBeep(); return; }
    if(!window._deadlineAudioCtx) window._deadlineAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = window._deadlineAudioCtx;
    if(ctx.state === 'suspended') ctx.resume();
    [0, 0.2, 0.4, 0.6].forEach((delay, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = i % 2 === 0 ? 920 : 740;
      const t = ctx.currentTime + delay;
      gain.gain.setValueAtTime(0.22, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.18);
      osc.start(t);
      osc.stop(t + 0.18);
    });
  }catch(e){}
}

function formatDueTimeLabel(t){
  const due = getTaskDueDateTime(t);
  if(!due) return t.due || '';
  const hh = String(due.getHours()).padStart(2, '0');
  const mm = String(due.getMinutes()).padStart(2, '0');
  return `${t.due} ${hh}:${mm}`;
}

function checkTaskDeadlineWarnings(){
  if(typeof getActiveUsername !== 'function' || !getActiveUsername()) return;
  const s = typeof getState === 'function' ? getState() : null;
  if(!s) return;
  const now = Date.now();
  (s.tasks || []).forEach(t => {
    if(t.done || !t.due) return;
    ensureTaskId(t);
    const due = getTaskDueDateTime(t);
    if(!due) return;
    const diff = due.getTime() - now;
    if(diff <= 0 || diff > TASK_WARN_WINDOW_MS) return;
    if(isTaskWarned(t.id)) return;

    setTaskWarned(t.id);
    playDeadlineWarningBeep();
    const msg = `⏰ ${t.name} sắp trễ hạn trong 20 phút!`;
    if(typeof showToast === 'function') showToast(msg, 'error');
    if(typeof notifyUser === 'function') notifyUser('Deadline', msg, 'error');
    const tgMsg = `⏰ CẢNH BÁO: ${t.name} trễ hạn lúc ${formatDueTimeLabel(t).split(' ').pop() || '—'}!`;
    if(typeof sendTelegram === 'function') sendTelegram(tgMsg);
  });
}

function tickTaskUpgrades(){
  if(typeof currentTab !== 'undefined' && currentTab === 'tasks' && typeof renderTasks === 'function'){
    renderTasks();
  }
  checkTaskDeadlineWarnings();
}

function startTaskUpgradeTimers(){
  stopTaskUpgradeTimers();
  taskUpgradeIntervalId = setInterval(tickTaskUpgrades, TASK_UPGRADE_TICK_MS);
}

function stopTaskUpgradeTimers(){
  if(taskUpgradeIntervalId){
    clearInterval(taskUpgradeIntervalId);
    taskUpgradeIntervalId = null;
  }
}

// ---- MORNING PLAN MODAL ----
function openMorningPlanModal(){
  const tasks = getTodayPlanTasks();
  const body = document.getElementById('morningPlanBody');
  const todayLabel = new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  if(!body) return;

  if(!tasks.length){
    body.innerHTML = `<p style="color:var(--text2);font-size:13px;">Không có việc nào hạn hôm nay hoặc quá hạn. Thêm việc có deadline hôm nay để lên kế hoạch.</p>`;
  }else{
    let totalMins = 0;
    body.innerHTML = `<p style="font-size:12px;color:var(--text2);margin-bottom:14px;">📅 ${esc(todayLabel)} · ${tasks.length} việc</p>
      <ol class="morning-plan-list">${tasks.map((t, i) => {
        const est = estimateTaskMinutes(t);
        totalMins += est;
        const urgency = getTaskUrgencyBadgeHtml(t);
        const timeStr = t.dueTime ? ` 🕐 ${esc(t.dueTime)}` : '';
        return `<li class="morning-plan-item">
          <div class="morning-plan-order">${i + 1}</div>
          <div class="morning-plan-content">
            <div class="morning-plan-name">${esc(t.name)} ${urgency}</div>
            <div class="morning-plan-meta">⏱ Dự kiến ~${formatDurationVi(est)} · Hạn: ${esc(t.due)}${timeStr}</div>
          </div>
        </li>`;
      }).join('')}</ol>
      <div class="morning-plan-total">⏳ Tổng thời gian dự kiến: <strong>${formatDurationVi(totalMins)}</strong></div>`;
  }
  document.getElementById('morningPlanModal')?.classList.remove('hidden');
}

function getMorningPlanText(){
  const tasks = getTodayPlanTasks();
  const todayLabel = new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' });
  let totalMins = 0;
  const lines = [`📋 KẾ HOẠCH HÔM NAY — ${todayLabel}`, ''];
  tasks.forEach((t, i) => {
    const est = estimateTaskMinutes(t);
    totalMins += est;
    const meta = TASK_URGENCY_META[getTaskUrgencyLevel(t)];
    const urg = meta.label ? `${meta.emoji} ${meta.label} · ` : '';
    lines.push(`${i + 1}. ${t.name}`);
    lines.push(`   ${urg}⏱ ~${formatDurationVi(est)} · Hạn: ${t.due}${t.dueTime ? ' ' + t.dueTime : ''}`);
    lines.push('');
  });
  lines.push(`Tổng dự kiến: ${formatDurationVi(totalMins)}`);
  return lines.join('\n');
}

function copyMorningPlan(){
  const text = getMorningPlanText();
  navigator.clipboard.writeText(text).then(() => {
    if(typeof showToast === 'function') showToast('Đã copy kế hoạch vào clipboard!', 'success');
  }).catch(() => {
    if(typeof showToast === 'function') showToast('Không copy được — thử In thay thế', 'error');
  });
}

function printMorningPlan(){
  const text = getMorningPlanText().replace(/\n/g, '<br>');
  const w = window.open('', '_blank');
  if(!w) { if(typeof showToast === 'function') showToast('Cho phép popup để in', 'error'); return; }
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Kế hoạch hôm nay</title>
    <style>body{font-family:system-ui,sans-serif;padding:24px;line-height:1.6;max-width:640px;margin:0 auto;}</style></head>
    <body><h2>Kế hoạch hôm nay</h2><div>${text}</div></body></html>`);
  w.document.close();
  w.focus();
  w.print();
}

// ---- WORKFLOW MODAL ----
function openWorkflowModal(){
  const body = document.getElementById('workflowBody');
  if(!body) return;
  const items = buildWorkflowAnalysis();
  if(!items.length){
    body.innerHTML = `<p style="color:var(--text2);">Chưa có công việc đang chờ. Thêm việc để nhận gợi ý quy trình.</p>`;
  }else{
    body.innerHTML = `<p style="font-size:12px;color:var(--text2);margin-bottom:14px;">Thứ tự gợi ý dựa trên deadline, mức ưu tiên, loại việc và phụ thuộc (ghi chú).</p>
      <ol class="workflow-suggest-list">${items.map((item, i) => {
        const t = item.task;
        return `<li class="workflow-suggest-item">
          <div class="workflow-suggest-num">${i + 1}</div>
          <div class="workflow-suggest-content">
            <div class="workflow-suggest-name">${esc(t.name)} ${getTaskUrgencyBadgeHtml(t)}</div>
            <div class="workflow-suggest-est">⏱ ~${formatDurationVi(item.estMinutes)}${t.due ? ` · 📅 ${esc(t.due)}` : ''}</div>
            <ul class="workflow-suggest-reasons">${item.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
          </div>
        </li>`;
      }).join('')}</ol>`;
  }
  document.getElementById('workflowModal')?.classList.remove('hidden');
}

// ---- PROJECT PHASES ----
function calcProjectPhaseProgress(phases){
  if(!phases || !phases.length) return null;
  const done = phases.filter(p => p.done).length;
  return Math.round(done / phases.length * 100);
}

function getProjectProgressBarClass(pct){
  if(pct <= 30) return 'prog-fill-phase-red';
  if(pct <= 70) return 'prog-fill-phase-yellow';
  return 'prog-fill-phase-green';
}

function renderProjectPhasesEditor(phases){
  const el = document.getElementById('projectPhasesList');
  if(!el) return;
  const list = phases && phases.length ? phases : [];
  if(!list.length){
    el.innerHTML = `<p class="project-phases-empty">Chưa có giai đoạn. Bấm "+ Thêm giai đoạn" bên dưới.</p>`;
    updateProjectProgressFromPhases();
    return;
  }
  el.innerHTML = list.map((p, i) => `
    <div class="project-phase-row" data-phase-idx="${i}" data-phase-id="${esc(p.id || '')}">
      <input type="checkbox" class="project-phase-done" ${p.done ? 'checked' : ''} onchange="onProjectPhaseDoneChange(${i})"/>
      <div class="project-phase-fields">
        <input class="input project-phase-name" placeholder="Tên giai đoạn" value="${esc(p.name || '')}" oninput="updateProjectProgressFromPhases()"/>
        <input class="input project-phase-desc" placeholder="Mô tả mục tiêu giai đoạn" value="${esc(p.description || '')}"/>
      </div>
      <button type="button" class="icon-btn del" onclick="removeProjectPhaseRow(${i})" title="Xóa giai đoạn">🗑️</button>
    </div>`).join('');
  updateProjectProgressFromPhases();
}

function collectProjectPhasesFromEditor(){
  const rows = document.querySelectorAll('#projectPhasesList .project-phase-row');
  const phases = [];
  rows.forEach((row, i) => {
    const name = row.querySelector('.project-phase-name')?.value?.trim() || '';
    const description = row.querySelector('.project-phase-desc')?.value?.trim() || '';
    const done = row.querySelector('.project-phase-done')?.checked || false;
    if(!name && !description) return;
    phases.push({
      id: row.dataset.phaseId || ('ph_' + Date.now() + i),
      name: name || `Giai đoạn ${i + 1}`,
      description,
      done
    });
  });
  return phases;
}

function updateProjectProgressFromPhases(){
  const phases = collectProjectPhasesFromEditor();
  const pct = calcProjectPhaseProgress(phases);
  const inp = document.getElementById('projectProgress');
  const hint = document.getElementById('projectProgressHint');
  if(pct !== null && inp){
    inp.value = pct;
    inp.readOnly = true;
    inp.classList.add('upgrade-readonly');
    if(hint) hint.textContent = `Tự động từ ${phases.length} giai đoạn (${phases.filter(p=>p.done).length} hoàn thành)`;
  }else if(inp){
    inp.readOnly = false;
    inp.classList.remove('upgrade-readonly');
    if(hint) hint.textContent = 'Nhập thủ công hoặc thêm giai đoạn để tự tính';
  }
}

function addProjectPhaseRow(){
  const el = document.getElementById('projectPhasesList');
  if(!el) return;
  const empty = el.querySelector('.project-phases-empty');
  if(empty) empty.remove();
  const idx = el.querySelectorAll('.project-phase-row').length;
  const div = document.createElement('div');
  div.className = 'project-phase-row';
  div.dataset.phaseIdx = idx;
  div.innerHTML = `
    <input type="checkbox" class="project-phase-done" onchange="onProjectPhaseDoneChange(${idx})"/>
    <div class="project-phase-fields">
      <input class="input project-phase-name" placeholder="Tên giai đoạn" oninput="updateProjectProgressFromPhases()"/>
      <input class="input project-phase-desc" placeholder="Mô tả mục tiêu giai đoạn"/>
    </div>
    <button type="button" class="icon-btn del" onclick="removeProjectPhaseRow(${idx})" title="Xóa giai đoạn">🗑️</button>`;
  el.appendChild(div);
  reindexProjectPhaseRows();
  updateProjectProgressFromPhases();
}

function removeProjectPhaseRow(idx){
  const rows = document.querySelectorAll('#projectPhasesList .project-phase-row');
  if(!rows[idx]) return;
  rows[idx].remove();
  reindexProjectPhaseRows();
  if(!document.querySelector('#projectPhasesList .project-phase-row')){
    renderProjectPhasesEditor([]);
  }else{
    updateProjectProgressFromPhases();
  }
}

function reindexProjectPhaseRows(){
  document.querySelectorAll('#projectPhasesList .project-phase-row').forEach((row, i) => {
    row.dataset.phaseIdx = i;
    const cb = row.querySelector('.project-phase-done');
    if(cb) cb.setAttribute('onchange', `onProjectPhaseDoneChange(${i})`);
    const del = row.querySelector('.icon-btn.del');
    if(del) del.setAttribute('onclick', `removeProjectPhaseRow(${i})`);
  });
}

function onProjectPhaseDoneChange(idx){
  updateProjectProgressFromPhases();
  const bar = document.querySelector('#projectPhasesList .project-phase-row:nth-child(' + (idx + 1) + ')');
  if(bar){
    bar.classList.add('phase-done-flash');
    setTimeout(() => bar.classList.remove('phase-done-flash'), 600);
  }
}

function renderProjectPhasesInline(project){
  const phases = project.phases || [];
  if(!phases.length) return '';
  const pct = calcProjectPhaseProgress(phases) ?? (project.progress || 0);
  const barCls = getProjectProgressBarClass(pct);
  return `
    <div class="project-phases-inline">
      <div class="section-title" style="font-size:12px;margin:10px 0 8px;">📑 Giai đoạn (${phases.filter(p=>p.done).length}/${phases.length})</div>
      ${phases.map(p => `
        <label class="project-phase-inline-item ${p.done ? 'done' : ''}">
          <input type="checkbox" ${p.done ? 'checked' : ''} onchange="toggleProjectPhaseDone('${project.id}','${p.id}')"/>
          <span><strong>${esc(p.name)}</strong>${p.description ? ` — <span style="color:var(--text2)">${esc(p.description)}</span>` : ''}</span>
        </label>`).join('')}
      <div class="prog-bar-sm upgrade-phase-bar"><div class="prog-fill-sm ${barCls} upgrade-phase-fill" style="width:${pct}%"></div></div>
      <div class="project-phase-pct upgrade-mono-num">${pct}% hoàn thành</div>
    </div>`;
}

function toggleProjectPhaseDone(projectId, phaseId){
  const s = typeof getState === 'function' ? getState() : null;
  if(!s) return;
  const p = (s.projects || []).find(x => x.id === projectId);
  if(!p || !p.phases) return;
  const ph = p.phases.find(x => x.id === phaseId);
  if(!ph) return;
  ph.done = !ph.done;
  const autoPct = calcProjectPhaseProgress(p.phases);
  if(autoPct !== null) p.progress = autoPct;
  if(typeof saveState === 'function') saveState(s);
  if(typeof renderProjects === 'function') renderProjects();
  if(typeof queueSync === 'function') queueSync();
  document.querySelectorAll('.upgrade-phase-fill').forEach(el => {
    el.classList.add('phase-bar-pop');
    setTimeout(() => el.classList.remove('phase-bar-pop'), 650);
  });
}

function applyUpgradeUIClasses(){
  document.body.classList.add('app-upgraded');
  document.querySelectorAll('.card, .stat-card, .task-item, .spend-limit-card, .auth-card').forEach(el => {
    el.classList.add('upgrade-glass');
  });
  document.querySelectorAll('.stat-val, .spend-triple-item .val, .project-phase-pct').forEach(el => {
    el.classList.add('upgrade-mono-num');
  });
}

function initAppUpgrades(){
  injectAppLogo();
  applyUpgradeUIClasses();
  startTaskUpgradeTimers();
  if(typeof getState === 'function' && typeof saveState === 'function'){
    const s = getState();
    let changed = false;
    (s.tasks || []).forEach(t => {
      if(!t.id){ ensureTaskId(t); changed = true; }
    });
    if(changed) saveState(s);
  }
}

window.openMorningPlanModal = openMorningPlanModal;
window.copyMorningPlan = copyMorningPlan;
window.printMorningPlan = printMorningPlan;
window.openWorkflowModal = openWorkflowModal;
window.compareTasksByDeadline = compareTasksByDeadline;
window.getTaskUrgencyBadgeHtml = getTaskUrgencyBadgeHtml;
window.ensureTaskId = ensureTaskId;
window.clearTaskWarn = clearTaskWarn;
window.renderProjectPhasesEditor = renderProjectPhasesEditor;
window.addProjectPhaseRow = addProjectPhaseRow;
window.removeProjectPhaseRow = removeProjectPhaseRow;
window.updateProjectProgressFromPhases = updateProjectProgressFromPhases;
window.onProjectPhaseDoneChange = onProjectPhaseDoneChange;
window.collectProjectPhasesFromEditor = collectProjectPhasesFromEditor;
window.renderProjectPhasesInline = renderProjectPhasesInline;
window.toggleProjectPhaseDone = toggleProjectPhaseDone;
window.calcProjectPhaseProgress = calcProjectPhaseProgress;
window.getProjectProgressBarClass = getProjectProgressBarClass;
window.stopTaskUpgradeTimers = stopTaskUpgradeTimers;
window.initAppUpgrades = initAppUpgrades;
window.applyUpgradeUIClasses = applyUpgradeUIClasses;
