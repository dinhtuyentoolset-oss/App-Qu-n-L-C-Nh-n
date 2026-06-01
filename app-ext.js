// ============================================================
// APP CÁ NHÂN — mở rộng (load sau app.js)
// Dashboard, Nhật ký, Dự án, cảnh báo, thống kê Pomodoro
// ============================================================

const MOOD_LABELS = {good:'Tốt',normal:'Bình thường',tired:'Mệt',stress:'Căng thẳng',happy:'Vui'};
const MOOD_EMOJI = {good:'😊',normal:'😐',tired:'😴',stress:'😰',happy:'🎉'};
const PROJECT_STATUS = {idea:'Ý tưởng',active:'Đang làm',paused:'Tạm dừng',done:'Hoàn thành'};
const PROJECT_STATUS_CLS = {idea:'badge-purple',active:'badge-blue',paused:'badge-yellow',done:'badge-green'};

let lifeLogFilterMonth = null;
let projectFilter = 'all';

// ---- FINANCE DASHBOARDS ----
function sumEntries(arr){
  return (arr||[]).reduce((a,b)=>a+(b.amount||0),0);
}

function getMonthSummary(year, monthIndex){
  const key=`${year}-${String(monthIndex+1).padStart(2,'0')}`;
  const md=getState().months[key]||{income:[],fixed:[],living:[],saving:[],note:''};
  const income=sumEntries(md.income);
  const fixed=sumEntries(md.fixed);
  const living=sumEntries(md.living);
  const saving=sumEntries(md.saving);
  const spent=fixed+living+saving;
  const remain=income-spent;
  const spentRate=income>0?(spent/income*100):0;
  const savingRate=income>0?(saving/income*100):0;
  const fixedRate=income>0?(fixed/income*100):0;
  const allExpenses=[...(md.fixed||[]).map(e=>({...e,cat:'fixed'})),...(md.living||[]).map(e=>({...e,cat:'living'})),...(md.saving||[]).map(e=>({...e,cat:'saving'}))];
  const top3=[...allExpenses].sort((a,b)=>b.amount-a.amount).slice(0,3);
  return {key,income,fixed,living,saving,spent,remain,spentRate,savingRate,fixedRate,top3,md};
}

function getPreviousMonthSummary(year, monthIndex){
  let m=monthIndex-1, y=year;
  if(m<0){ m=11; y--; }
  return getMonthSummary(y,m);
}

function getYearSummary(year){
  let income=0, spent=0, saving=0, remain=0;
  const monthTotals=[];
  for(let i=0;i<12;i++){
    const sm=getMonthSummary(year,i);
    if(sm.income||sm.spent){
      monthTotals.push({month:i,...sm});
      income+=sm.income;
      spent+=sm.spent;
      saving+=sm.saving;
      remain+=sm.remain;
    }
  }
  if(!monthTotals.length) return null;
  const maxSpend=monthTotals.reduce((a,b)=>b.spent>a.spent?b:a,monthTotals[0]);
  const bestSave=monthTotals.filter(m=>m.income>0).sort((a,b)=>b.savingRate-a.savingRate)[0];
  return {income,spent,saving,remain,monthTotals,maxSpend,bestSave};
}

function formatDelta(n){
  const sign=n>=0?'+':'';
  return sign+fmtFull(Math.abs(n));
}

function financeInsight(md){
  const lines=[];
  if(!md.income) lines.push('Bạn chưa nhập thu nhập tháng này.');
  else if(md.remain>=0) lines.push(`Tháng này bạn đang còn dư ${fmtFull(md.remain)}.`);
  else lines.push(`Tháng này bạn đang thiếu ${fmtFull(Math.abs(md.remain))}, cần giảm chi tiêu.`);
  if(md.fixedRate>60) lines.push('Chi phí cố định đang khá cao.');
  if(md.savingRate>=20) lines.push('Tỷ lệ tích lũy tốt.');
  return lines;
}

function spentRateClass(rate){
  if(rate<70) return 'ok';
  if(rate<90) return 'warn';
  return 'danger';
}

function financeStatusLabel(rateCls, md){
  if(!md.income) return 'Chưa có thu nhập — nhập dữ liệu để phân tích.';
  if(rateCls==='danger') return 'Chi tiêu gần hoặc vượt thu nhập.';
  if(rateCls==='warn') return 'Chi tiêu đang ở mức cần theo dõi.';
  return 'Tài chính tháng đang ổn.';
}

function renderMonthlyDashboard(){
  const el=document.getElementById('finance-monthly-dashboard');
  if(!el) return;
  const md=getMonthSummary(currentYear,currentMonth);
  const prev=getPreviousMonthSummary(currentYear,currentMonth);
  const insights=financeInsight(md);
  const rateCls=spentRateClass(md.spentRate);
  const monthLabel=`${String(currentMonth+1).padStart(2,'0')}/${currentYear}`;
  const pct=md.income?Math.min(100,Math.round(md.spentRate)):0;

  let compareHtml='';
  if(prev.income||prev.spent){
    compareHtml=`<div class="finance-compare">
      <div class="finance-compare-title">So với tháng trước</div>
      <div class="finance-compare-grid">
        <div class="finance-compare-cell"><span class="lbl">Thu nhập</span><span class="val">${formatDelta(md.income-prev.income)}</span></div>
        <div class="finance-compare-cell"><span class="lbl">Tổng chi</span><span class="val">${formatDelta(md.spent-prev.spent)}</span></div>
        <div class="finance-compare-cell"><span class="lbl">Còn lại</span><span class="val">${formatDelta(md.remain-prev.remain)}</span></div>
      </div>
    </div>`;
  }else{
    compareHtml='<p class="finance-muted">Chưa có dữ liệu tháng trước để so sánh.</p>';
  }

  const top3Html=md.top3.length?md.top3.map((e,i)=>`
    <li class="finance-expense-item">
      <span class="finance-expense-rank">${i+1}</span>
      <span class="finance-expense-name">${esc(e.name)}</span>
      <span class="finance-expense-amount">${fmtFull(e.amount)}</span>
    </li>`).join('')
    :'<li class="finance-muted" style="list-style:none;padding:12px 0;">Chưa có khoản chi.</li>';

  const alertItems=[
    {text:financeStatusLabel(rateCls,md),tone:rateCls},
    ...insights.map(t=>({text:t,tone:'info'}))
  ];
  const alertListHtml=alertItems.map(a=>`<li class="finance-alert-item ${a.tone}">${esc(a.text)}</li>`).join('');

  el.innerHTML=`
  <div class="finance-dashboard">
    <section class="finance-dashboard-month os-surface">
      <header class="finance-dashboard-header">
        <h2 class="finance-dashboard-title">Tổng quan tháng ${monthLabel}</h2>
        <button type="button" class="btn btn-ghost btn-sm finance-refresh-btn" onclick="renderFinance()">Làm mới</button>
      </header>
      <div class="finance-stats-grid">
        <div class="finance-stat-card"><span class="finance-stat-label">Tổng thu nhập</span><span class="finance-stat-value tone-income">${fmtFull(md.income)}</span></div>
        <div class="finance-stat-card"><span class="finance-stat-label">Tổng đã chi</span><span class="finance-stat-value tone-expense">${fmtFull(md.spent)}</span></div>
        <div class="finance-stat-card"><span class="finance-stat-label">Còn lại</span><span class="finance-stat-value ${md.remain>=0?'tone-ok':'tone-danger'}">${fmtFull(md.remain)}</span></div>
        <div class="finance-stat-card"><span class="finance-stat-label">Tỷ lệ tiết kiệm</span><span class="finance-stat-value">${md.income?Math.round(md.savingRate)+'%':'—'}</span></div>
        <div class="finance-stat-card"><span class="finance-stat-label">Chi cố định / Thu</span><span class="finance-stat-value">${md.income?Math.round(md.fixedRate)+'%':'—'}</span></div>
      </div>
    </section>
    <section class="finance-progress-card os-surface">
      <div class="finance-progress-head">
        <span class="finance-progress-title">Chi tiêu / Thu nhập</span>
        <span class="finance-progress-pct">${md.income?pct+'%':'—'}</span>
      </div>
      <div class="finance-progress-track"><div class="finance-progress-fill ${rateCls}" style="width:${md.income?pct:0}%"></div></div>
      <p class="finance-progress-status ${rateCls}">${esc(financeStatusLabel(rateCls,md))}</p>
    </section>
    <div class="finance-split-grid">
      <section class="finance-split-col os-surface">
        <h3 class="finance-split-title">3 khoản chi lớn nhất</h3>
        <ul class="finance-expense-list">${top3Html}</ul>
      </section>
      <section class="finance-split-col os-surface">
        <h3 class="finance-split-title">Nhận xét &amp; cảnh báo</h3>
        <ul class="finance-alert-list">${alertListHtml}</ul>
      </section>
    </div>
    ${compareHtml}
    <div id="finance-year-dashboard"></div>
  </div>`;
  renderYearDashboard();
}

function renderYearDashboard(){
  const el=document.getElementById('finance-year-dashboard');
  if(!el) return;
  const ys=getYearSummary(currentYear);
  if(!ys){
    el.innerHTML=`<section class="finance-year-card os-surface"><h2 class="finance-dashboard-title">Tổng quan năm ${currentYear}</h2><p class="finance-muted">Chưa có dữ liệu năm nay.</p></section>`;
    return;
  }
  const maxM=MONTH_NAMES[ys.maxSpend.month];
  const bestM=ys.bestSave?MONTH_NAMES[ys.bestSave.month]:'—';
  el.innerHTML=`
  <section class="finance-year-card os-surface">
    <h2 class="finance-dashboard-title">Tổng quan năm ${currentYear}</h2>
    <div class="finance-year-grid">
      <div class="finance-stat-card"><span class="finance-stat-label">Thu năm</span><span class="finance-stat-value">${fmtFull(ys.income)}</span></div>
      <div class="finance-stat-card"><span class="finance-stat-label">Chi năm</span><span class="finance-stat-value tone-expense">${fmtFull(ys.spent)}</span></div>
      <div class="finance-stat-card"><span class="finance-stat-label">Tích lũy</span><span class="finance-stat-value tone-income">${fmtFull(ys.saving)}</span></div>
      <div class="finance-stat-card"><span class="finance-stat-label">Còn lại</span><span class="finance-stat-value ${ys.remain>=0?'tone-ok':'tone-danger'}">${fmtFull(ys.remain)}</span></div>
    </div>
    <p class="finance-year-meta">Tháng chi nhiều nhất: <strong>${esc(maxM)}</strong> · Tháng tiết kiệm tốt: <strong>${esc(bestM)}</strong></p>
  </section>`;
}

// ---- OVERVIEW ----
function getOverviewAlerts(){
  const s=getState();
  const today=new Date().toISOString().split('T')[0];
  const alerts=[];
  const md=getMonthSummary(currentYear,currentMonth);
  if(!md.income) alerts.push({t:'Chưa nhập thu nhập tháng này',tab:'finance'});
  if(md.remain<0) alerts.push({t:`Thiếu ${fmtFull(Math.abs(md.remain))} trong tháng`,tab:'finance'});
  const overdue=(s.tasks||[]).filter(t=>!t.done&&t.due&&t.due<today);
  if(overdue.length) alerts.push({t:`${overdue.length} việc quá hạn`,tab:'tasks'});
  const cfg=s.cfg;
  const goal=parseFloat(cfg.goalAmount)||0;
  if(!goal) alerts.push({t:'Chưa đặt mục tiêu tiết kiệm',tab:'savings'});
  const todaySav=`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-${String(new Date().getDate()).padStart(2,'0')}`;
  if(goal&&!(s.savings?.savedDays||{})[todaySav]) alerts.push({t:'Hôm nay chưa tick tiết kiệm',tab:'savings'});
  (s.journeys||[]).forEach(j=>{
    const k=localDateKey(new Date());
    if(getJourneyKeys(j).includes(k)&&!(j.completedDays||{})[k]){
      const st=getJourneyStatus(j);
      if(st.label==='Trễ nhịp') alerts.push({t:`Hành trình "${j.name}" chưa tick hôm nay`,tab:'journey'});
    }
  });
  (s.projects||[]).filter(p=>p.status==='active'&&p.deadline&&p.deadline<=today).forEach(p=>{
    alerts.push({t:`Dự án "${p.name}" đến/sau hạn`,tab:'projects'});
  });
  return alerts;
}

function overviewHeroSummary(alerts, md){
  if(!alerts.length) return 'Mọi thứ đang ổn — duy trì nhịp sống cân bằng hôm nay.';
  if(md.remain<0) return 'Chi tiêu tháng đang thiếu — nên xem lại kế hoạch tài chính.';
  return `${alerts.length} mục cần chú ý — xem danh sách bên dưới.`;
}

function overviewCard(iconClass, title, value, meta, tab){
  return `<button type="button" class="overview-card" onclick="switchTab('${tab}')">
    <span class="overview-card-icon ${iconClass}" aria-hidden="true"></span>
    <span class="overview-card-title">${esc(title)}</span>
    <span class="overview-card-value">${value}</span>
    <span class="overview-card-meta">${meta}</span>
  </button>`;
}

function renderOverview(){
  const el=document.getElementById('tab-overview');
  if(!el) return;
  const s=getState();
  const today=new Date().toISOString().split('T')[0];
  const md=getMonthSummary(currentYear,currentMonth);
  const tasks=s.tasks||[];
  const todayTasks=tasks.filter(t=>!t.done&&t.due===today);
  const overdueTasks=tasks.filter(t=>!t.done&&t.due&&t.due<today);
  const cfg=s.cfg;
  const goal=parseFloat(cfg.goalAmount)||0;
  const goalName=cfg.goalName||'Chưa đặt';
  const sav=s.savings?.savedDays||{};
  const yearPrefix=(cfg.goalYear||new Date().getFullYear())+'-';
  const savedDays=Object.keys(sav).filter(k=>k.startsWith(yearPrefix)&&sav[k]).length;
  const daily=goal>0?Math.ceil(goal/365):0;
  const savedAmt=savedDays*daily;
  const savPct=goal>0?Math.min(100,Math.round(savedAmt/goal*100)):0;
  const activeJourneys=(s.journeys||[]).filter(j=>getJourneyStatus(j).label!=='Hoàn thành');
  const pomoToday=getPomoTodayCount();
  const alerts=getOverviewAlerts();
  const recentLogs=(s.lifeLog||[]).slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,1);
  const latestLog=recentLogs[0];
  const now=new Date();
  const dateStr=now.toLocaleDateString('vi-VN',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const greeting=document.getElementById('greetingTitle')?.textContent||'Xin chào!';
  const remainCls=md.remain>=0?'tone-ok':'tone-danger';
  const alertBody=alerts.length
    ?`<ul class="overview-alert-list">${alerts.map(a=>`<li><button type="button" class="overview-alert-chip" onclick="switchTab('${a.tab}')">${esc(a.t)}</button></li>`).join('')}</ul>`
    :`<div class="overview-alert-ok"><span class="overview-alert-ok-dot"></span>Mọi thứ đang ổn</div>`;

  el.innerHTML=`
  <div class="overview-page">
    <header class="overview-hero os-surface">
      <p class="overview-hero-eyebrow">Personal OS</p>
      <h1 class="overview-hero-greeting" id="ov-greeting">${esc(greeting)}</h1>
      <p class="overview-hero-date">${esc(dateStr)}</p>
      <p class="overview-hero-summary">${esc(overviewHeroSummary(alerts,md))}</p>
    </header>
    <div class="overview-grid">
      ${overviewCard('ic-finance','Tài chính tháng này',`<span class="${remainCls}">${fmtFull(md.remain)}</span>`,'Còn lại · Thu '+fmtNum(md.income)+' · Chi '+fmtNum(md.spent),'finance')}
      ${overviewCard('ic-tasks','Công việc hôm nay',`${todayTasks.length}`,`${overdueTasks.length} quá hạn · ${tasks.length} việc tổng`,'tasks')}
      ${overviewCard('ic-savings','Tiết kiệm',`${savPct}%`,esc(goalName)+(goal?' · '+fmtFull(goal):''),'savings')}
      ${overviewCard('ic-journey','Hành trình',`${activeJourneys.length}`,activeJourneys[0]?esc(activeJourneys[0].name):'Chưa có hành trình','journey')}
      ${overviewCard('ic-focus','Thời gian tập trung',`${pomoToday}`,'Tuần '+getPomoWeekCount()+' · Tháng '+getPomoMonthCount(),'time')}
      ${overviewCard('ic-log','Nhật ký gần đây',latestLog?esc(latestLog.title||'Nhật ký'):'—',latestLog?esc(latestLog.date):'Chưa có bài ghi','lifelog')}
    </div>
    <section class="overview-alert-card os-surface">
      <h2 class="overview-alert-title">Hôm nay cần chú ý</h2>
      ${alertBody}
    </section>
  </div>`;
}

// ---- SAVINGS ALERTS ----
function renderSavingsAlerts(){
  const el=document.getElementById('savings-alerts');
  if(!el) return;
  const s=getState();
  const cfg=s.cfg;
  const goal=parseFloat(cfg.goalAmount)||0;
  const todayKey=localDateKey(new Date());
  const msgs=[];
  if(!goal) msgs.push({t:'Chưa đặt mục tiêu tiết kiệm.',c:'warn'});
  else{
    if(!(s.savings?.savedDays||{})[todayKey]) msgs.push({t:'Hôm nay chưa tick tiết kiệm.',c:'warn'});
    const yearPrefix=(cfg.goalYear||new Date().getFullYear())+'-';
    const saved=Object.keys(s.savings?.savedDays||{}).filter(k=>k.startsWith(yearPrefix)&&s.savings.savedDays[k]).length;
    const daysLeft=Math.max(1,Math.ceil((new Date(cfg.goalYear,11,31)-new Date())/86400000));
    const needPerDay=goal/daysLeft;
    const got=saved*needPerDay;
    const expectedPct=Math.min(100,(365-daysLeft)/365*100);
    const actualPct=goal>0?got/goal*100:0;
    if(actualPct<expectedPct-5) msgs.push({t:'Tiến độ đang chậm so với mục tiêu năm.',c:'warn'});
    else if(actualPct>=expectedPct) msgs.push({t:'Tiến độ đang tốt — tiếp tục duy trì!',c:'ok'});
  }
  el.innerHTML=msgs.length?msgs.map(m=>`<div class="module-alert ${m.c}">${esc(m.t)}</div>`).join(''):'';
}

// ---- POMODORO STATS ----
function getPomoWeekCount(){
  const s=getState();
  const daily=s.pomodoro?.daily||{};
  const now=new Date();
  const day=now.getDay();
  const mon=new Date(now);
  mon.setDate(now.getDate()-(day===0?6:day-1));
  let sum=0;
  for(let i=0;i<7;i++){
    const d=new Date(mon);
    d.setDate(mon.getDate()+i);
    sum+=daily[localDateKey(d)]||0;
  }
  return sum;
}

function getPomoMonthCount(){
  const s=getState();
  const daily=s.pomodoro?.daily||{};
  const prefix=`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`;
  return Object.keys(daily).filter(k=>k.startsWith(prefix)).reduce((a,k)=>a+(daily[k]||0),0);
}

function resetPomoToday(){
  if(!confirm('Reset số Pomodoro hôm nay về 0?')) return;
  const s=getState();
  delete s.pomodoro.daily[pomoTodayKey()];
  saveState(s);
  renderPomodoro();
  showToast('Đã reset Pomodoro hôm nay','success');
}

// ---- LIFE LOG ----
function renderLifeLog(){
  const el=document.getElementById('tab-lifelog');
  if(!el) return;
  const s=getState();
  let logs=(s.lifeLog||[]).slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const now=new Date();
  const filterKey=lifeLogFilterMonth||`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  if(lifeLogFilterMonth) logs=logs.filter(l=>(l.date||'').startsWith(filterKey));

  const listHtml=logs.length?logs.map(l=>`
    <div class="lifelog-item card">
      <div class="lifelog-head">
        <span>${MOOD_EMOJI[l.mood]||'📝'} <strong>${esc(l.title||'Không tiêu đề')}</strong></span>
        <span class="ov-muted">${esc(l.date)}</span>
      </div>
      <p class="lifelog-body">${esc((l.content||'').slice(0,200))}${(l.content||'').length>200?'…':''}</p>
      ${(l.tags||[]).length?`<div class="lifelog-tags">${l.tags.map(t=>`<span class="badge badge-blue">${esc(t)}</span>`).join('')}</div>`:''}
      <div class="lifelog-actions">
        <button class="btn btn-ghost btn-sm" onclick="editLifeLog('${l.id}')">✏️</button>
        <button class="icon-btn del" onclick="deleteLifeLog('${l.id}')">🗑️</button>
      </div>
    </div>`).join(''):emptyStateHtml('📔','Chưa có nhật ký','Ghi lại cảm xúc và sự kiện trong ngày.');

  el.innerHTML=`
  <div class="module-header">
    <div><div class="page-title">📔 Nhật ký</div><div class="page-sub">Life log — đồng bộ theo tài khoản</div></div>
    <button class="btn btn-primary" onclick="openLifeLogModal()">+ Thêm nhật ký</button>
  </div>
  <div class="lifelog-toolbar">
    <label>Lọc tháng <input type="month" class="input" id="lifelog-filter-month" value="${filterKey}" onchange="setLifeLogFilter(this.value)"/></label>
    <button class="btn btn-ghost btn-sm" onclick="setLifeLogFilter(null)">Tất cả</button>
  </div>
  <div class="lifelog-list">${listHtml}</div>`;
}

function setLifeLogFilter(v){
  lifeLogFilterMonth=v||null;
  renderLifeLog();
}

function openLifeLogModal(editId){
  document.getElementById('lifeLogEditId').value=editId||'';
  if(editId){
    const l=getState().lifeLog.find(x=>x.id===editId);
    if(!l) return;
    document.getElementById('lifeLogTitle').value=l.title||'';
    document.getElementById('lifeLogDate').value=l.date||localDateKey(new Date());
    document.getElementById('lifeLogContent').value=l.content||'';
    document.getElementById('lifeLogMood').value=l.mood||'normal';
    document.getElementById('lifeLogTags').value=(l.tags||[]).join(', ');
    document.getElementById('lifeLogModalTitle').textContent='✏️ Sửa nhật ký';
  }else{
    document.getElementById('lifeLogTitle').value='';
    document.getElementById('lifeLogDate').value=localDateKey(new Date());
    document.getElementById('lifeLogContent').value='';
    document.getElementById('lifeLogMood').value='normal';
    document.getElementById('lifeLogTags').value='';
    document.getElementById('lifeLogModalTitle').textContent='📔 Thêm nhật ký';
  }
  document.getElementById('lifeLogModal').classList.remove('hidden');
}

function saveLifeLog(){
  const editId=document.getElementById('lifeLogEditId').value;
  const title=document.getElementById('lifeLogTitle').value.trim();
  const date=document.getElementById('lifeLogDate').value;
  const content=document.getElementById('lifeLogContent').value.trim();
  const mood=document.getElementById('lifeLogMood').value;
  const tags=document.getElementById('lifeLogTags').value.split(',').map(t=>t.trim()).filter(Boolean);
  if(!title){ showToast('Nhập tiêu đề nhật ký','error'); return; }
  if(!date){ showToast('Chọn ngày','error'); return; }
  const s=getState();
  if(!s.lifeLog) s.lifeLog=[];
  if(editId){
    const l=s.lifeLog.find(x=>x.id===editId);
    if(l){ Object.assign(l,{title,date,content,mood,tags}); }
  }else{
    s.lifeLog.push({id:'log_'+Date.now().toString(36),title,date,content,mood,tags,createdAt:new Date().toISOString()});
  }
  saveState(s);
  closeModal('lifeLogModal');
  renderLifeLog();
  showToast('Đã lưu nhật ký','success');
}

function editLifeLog(id){ openLifeLogModal(id); }
function deleteLifeLog(id){
  if(!confirm('Xóa nhật ký này?')) return;
  const s=getState();
  s.lifeLog=(s.lifeLog||[]).filter(l=>l.id!==id);
  saveState(s);
  renderLifeLog();
  showToast('Đã xóa','success');
}

// ---- PROJECTS ----
function renderProjects(){
  const el=document.getElementById('tab-projects');
  if(!el) return;
  const s=getState();
  let list=s.projects||[];
  const today=new Date().toISOString().split('T')[0];
  if(projectFilter==='active') list=list.filter(p=>p.status==='active');
  else if(projectFilter==='deadline') list=list.filter(p=>p.deadline&&p.deadline<=today&&p.status!=='done');

  const listHtml=list.length?list.map(p=>{
    const pri=p.priority||'medium';
    const tasks=(p.tasks||[]);
    const doneT=tasks.filter(t=>t.done).length;
    const near=p.deadline&&p.deadline<=today&&p.status!=='done';
    return `
    <div class="project-item card ${near?'project-warn':''}">
      <div class="project-head">
        <div>
          <strong>${esc(p.name)}</strong>
          <span class="badge ${PROJECT_STATUS_CLS[p.status]||'badge-blue'}">${PROJECT_STATUS[p.status]||p.status}</span>
          <span class="badge ${TASK_PRIORITY_BADGE[pri]||'badge-blue'}">${TASK_PRIORITY_LABELS[pri]||pri}</span>
        </div>
        <div class="project-actions">
          <button class="btn btn-ghost btn-sm" onclick="editProject('${p.id}')">✏️</button>
          <button class="icon-btn del" onclick="deleteProject('${p.id}')">🗑️</button>
        </div>
      </div>
      <div class="project-meta">
        <span>📅 ${p.deadline?esc(p.deadline):'Không hạn'}</span>
        <span>📊 ${p.progress||0}%</span>
        <span>✓ ${doneT}/${tasks.length} việc nhỏ</span>
      </div>
      <div class="prog-bar-sm"><div class="prog-fill-sm" style="width:${Math.min(100,p.progress||0)}%"></div></div>
      ${p.note?`<p class="project-note">${esc(p.note)}</p>`:''}
      ${near?'<div class="module-alert warn">⚠️ Dự án gần hoặc quá hạn!</div>':''}
    </div>`;
  }).join(''):emptyStateHtml('📁','Chưa có dự án','Tạo dự án để theo dõi tiến độ và deadline.');

  el.innerHTML=`
  <div class="module-header">
    <div><div class="page-title">📁 Dự án</div><div class="page-sub">Quản lý dự án và task nhỏ</div></div>
    <button class="btn btn-primary" onclick="openProjectModal()">+ Thêm dự án</button>
  </div>
  <div class="task-filters" style="margin-bottom:16px;">
    <button class="filter-btn ${projectFilter==='all'?'active':''}" onclick="setProjectFilter('all',this)">Tất cả</button>
    <button class="filter-btn ${projectFilter==='active'?'active':''}" onclick="setProjectFilter('active',this)">Đang làm</button>
    <button class="filter-btn ${projectFilter==='deadline'?'active':''}" onclick="setProjectFilter('deadline',this)">Gần hạn</button>
  </div>
  <div class="project-list">${listHtml}</div>`;
}

function setProjectFilter(f, el){
  projectFilter=f;
  document.querySelectorAll('#tab-projects .filter-btn').forEach(b=>b.classList.remove('active'));
  if(el) el.classList.add('active');
  renderProjects();
}

function openProjectModal(editId){
  document.getElementById('projectEditId').value=editId||'';
  const tasksEl=document.getElementById('projectTasksJson');
  if(editId){
    const p=getState().projects.find(x=>x.id===editId);
    if(!p) return;
    document.getElementById('projectName').value=p.name||'';
    document.getElementById('projectStatus').value=p.status||'idea';
    document.getElementById('projectPriority').value=p.priority||'medium';
    document.getElementById('projectStart').value=p.startDate||'';
    document.getElementById('projectDeadline').value=p.deadline||'';
    document.getElementById('projectProgress').value=p.progress||0;
    document.getElementById('projectNote').value=p.note||'';
    if(tasksEl) tasksEl.value=(p.tasks||[]).map(t=>t.name).join('\n');
    document.getElementById('projectModalTitle').textContent='✏️ Sửa dự án';
  }else{
    document.getElementById('projectName').value='';
    document.getElementById('projectStatus').value='idea';
    document.getElementById('projectPriority').value='medium';
    document.getElementById('projectStart').value=localDateKey(new Date());
    document.getElementById('projectDeadline').value='';
    document.getElementById('projectProgress').value=0;
    document.getElementById('projectNote').value='';
    if(tasksEl) tasksEl.value='';
    document.getElementById('projectModalTitle').textContent='📁 Thêm dự án';
  }
  document.getElementById('projectModal').classList.remove('hidden');
}

function saveProject(){
  const editId=document.getElementById('projectEditId').value;
  const name=document.getElementById('projectName').value.trim();
  if(!name){ showToast('Nhập tên dự án','error'); return; }
  const status=document.getElementById('projectStatus').value;
  const priority=document.getElementById('projectPriority').value;
  const startDate=document.getElementById('projectStart').value;
  const deadline=document.getElementById('projectDeadline').value;
  const progress=Math.min(100,Math.max(0,parseInt(document.getElementById('projectProgress').value,10)||0));
  const note=document.getElementById('projectNote').value.trim();
  const taskLines=(document.getElementById('projectTasksJson')?.value||'').split('\n').map(l=>l.trim()).filter(Boolean);
  const s=getState();
  if(!s.projects) s.projects=[];
  let tasks=[];
  if(editId){
    const old=s.projects.find(x=>x.id===editId);
    const oldMap=new Map((old?.tasks||[]).map(t=>[t.name,t]));
    tasks=taskLines.map((n,i)=>{
      const prev=oldMap.get(n);
      return prev||{id:'pt_'+Date.now()+i,name:n,done:false};
    });
  }else{
    tasks=taskLines.map((n,i)=>({id:'pt_'+Date.now()+i,name:n,done:false}));
  }
  const payload={name,status,priority,startDate,deadline,progress,note,tasks,createdAt:new Date().toISOString()};
  if(editId){
    const p=s.projects.find(x=>x.id===editId);
    if(p) Object.assign(p,payload,{createdAt:p.createdAt||payload.createdAt});
  }else{
    s.projects.push({id:'prj_'+Date.now().toString(36),...payload});
  }
  saveState(s);
  closeModal('projectModal');
  renderProjects();
  showToast('Đã lưu dự án','success');
}

function editProject(id){ openProjectModal(id); }
function deleteProject(id){
  if(!confirm('Xóa dự án này?')) return;
  const s=getState();
  s.projects=(s.projects||[]).filter(p=>p.id!==id);
  saveState(s);
  renderProjects();
  showToast('Đã xóa dự án','success');
}

// ---- SYSTEM STATUS (settings advanced) ----
async function updateSystemStatus(){
  const el=document.getElementById('system-status-panel');
  if(!el) return;
  const u=getActiveUsername();
  const gsOk=!!getGsUrl();
  let sheetsLine='⏳ Đang kiểm tra…';
  let tgLine='—';
  const s=getState();
  if(s.cfg?.tgToken&&s.cfg?.tgChatId) tgLine='✅ Đã cấu hình token & chat ID';
  else tgLine='⚠️ Chưa đủ Telegram';
  try{
    if(gsOk){
      const r=await gsApiGet({action:'ping'});
      sheetsLine=r.status==='ok'?'✅ Google Sheets OK':'❌ '+ (r.error||'Lỗi');
    }else sheetsLine='❌ Thiếu GS_WEBAPP_URL';
  }catch(e){ sheetsLine='❌ '+e.message; }
  const verEl=document.getElementById('active-version-display');
  const verOk=verEl&&!verEl.textContent.includes('không active');
  const syncStr=lastSyncTime?lastSyncTime.toLocaleString('vi-VN'):'Chưa đồng bộ';
  el.innerHTML=`
    <div class="sys-status-row"><span>Đăng nhập</span><strong>${u?'✅ OK ('+esc(u)+')':'❌ Chưa đăng nhập'}</strong></div>
    <div class="sys-status-row"><span>Google Sheets</span><strong>${sheetsLine}</strong></div>
    <div class="sys-status-row"><span>Telegram</span><strong>${tgLine}</strong></div>
    <div class="sys-status-row"><span>Active Version</span><strong>${verOk?'✅ OK':'⚠️ Chưa chốt / không active'}</strong></div>
    <div class="sys-status-row"><span>Đồng bộ gần nhất</span><strong>${esc(syncStr)}</strong></div>`;
}

window.renderOverview=renderOverview;
window.renderMonthlyDashboard=renderMonthlyDashboard;
window.renderYearDashboard=renderYearDashboard;
window.renderLifeLog=renderLifeLog;
window.renderProjects=renderProjects;
window.renderSavingsAlerts=renderSavingsAlerts;
window.updateSystemStatus=updateSystemStatus;
window.getPomoWeekCount=getPomoWeekCount;
window.getPomoMonthCount=getPomoMonthCount;
window.resetPomoToday=resetPomoToday;
window.toggleSettingsAdvanced=toggleSettingsAdvanced;
window.setLifeLogFilter=setLifeLogFilter;
window.openLifeLogModal=openLifeLogModal;
window.saveLifeLog=saveLifeLog;
window.editLifeLog=editLifeLog;
window.deleteLifeLog=deleteLifeLog;
window.setProjectFilter=setProjectFilter;
window.openProjectModal=openProjectModal;
window.saveProject=saveProject;
window.editProject=editProject;
window.deleteProject=deleteProject;
