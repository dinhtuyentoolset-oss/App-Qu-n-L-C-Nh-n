// ============================================================
// APP CÁ NHÂN — logic chính (load sau config.js)
// ============================================================

// ============================================================
// STATE
// ============================================================
const MONTHS = ['T1','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11','T12'];
const MONTH_NAMES = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6','Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'];
let currentTab = 'finance';
let currentMonth = new Date().getMonth(); // 0-11
let currentYear = new Date().getFullYear();
let savCalMonth = new Date().getMonth();
let savCalYear = new Date().getFullYear();
let taskFilter = 'all';
let notiTimers = [];
let journeyCalView = {};
const POMO_WORK = 25 * 60;
const POMO_BREAK = 5 * 60;
let pomoMode = 'work';
let pomoSecondsLeft = POMO_WORK;
let pomoRunning = false;
let pomoTimerId = null;
let pomoAudioCtx = null;


const MODULE_NOTI_KEYS = ['expense','savings','task','journey'];
const MODULE_NOTI_LABELS = {
  expense:'💰 Chi tiêu',
  savings:'🎯 Tiết kiệm',
  task:'📋 Công việc',
  journey:'🏆 Hành trình'
};
const NOTI_WEEKDAYS = [
  {v:0,l:'CN'},{v:1,l:'T2'},{v:2,l:'T3'},{v:3,l:'T4'},{v:4,l:'T5'},{v:5,l:'T6'},{v:6,l:'T7'}
];
const DEFAULT_NOTI_MESSAGES = {
  expense:'💰 Nhắc nhở: Nhập chi tiêu cuối ngày - {name}!',
  savings:'🐷 Nhắc tiết kiệm hôm nay: {daily} - {name}!',
  task:'⚠️ Kiểm tra công việc sắp đến hạn - {name}',
  journey:'🏆 Nhắc tick hành trình hôm nay - {name}!'
};
let moduleNotiPanelKey = null;
let moduleNotiEditId = null;

function esc(s){
  if(s==null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const AUTH_SESSION_KEY = 'lifeos_session';
const AUTH_DISPLAY_NAME_KEY = 'lifeos_display_name';
const AUTH_ACCOUNTS_KEY = 'lifeos_accounts';

function getGsUrl(){
  return (GS_WEBAPP_URL||'').trim();
}

/** Luôn gắn link backend cố định — tránh cfg cũ từ Sheet khác */
function pinBackendUrl(cfg){
  if(cfg && GS_WEBAPP_URL) cfg.gsUrl = GS_WEBAPP_URL;
}

function setGlobalGsUrl(url){
  /* giữ tương thích code cũ — URL chỉ lấy từ GS_WEBAPP_URL */
  if(url && url.trim() !== getGsUrl()) console.warn('Bỏ qua URL khác GS_WEBAPP_URL trong config.js');
}

function updateBackendInfo(extra){
  const el = document.getElementById('backend-sheet-info');
  const inp = document.getElementById('cfg-gsurl');
  const url = getGsUrl();
  if(inp) inp.value = url;
  if(!el) return;
  if(!url){
    el.innerHTML = '<span style="color:var(--accent5);">Chưa có GS_WEBAPP_URL trong config.js.</span>';
    return;
  }
  const sheet = extra?.spreadsheetName ? esc(extra.spreadsheetName) : '—';
  const sid = extra?.spreadsheetId ? esc(extra.spreadsheetId) : '';
  el.innerHTML = `
    <div><strong style="color:var(--text);">Sheet đang kết nối:</strong> ${sheet}</div>
    ${sid ? `<div style="margin-top:4px;font-size:11px;color:var(--text3);">ID: ${sid}</div>`:''}
    <div style="margin-top:6px;word-break:break-all;font-family:var(--mono);font-size:10px;">${esc(url)}</div>
    ${extra?.ok ? '<div style="margin-top:6px;color:var(--accent3);">✅ Backend OK</div>' : ''}`;
}

function getActiveUsername(){
  return sessionStorage.getItem(AUTH_SESSION_KEY);
}
function userDataKey(u){ return 'lifeos_data_'+u; }
function userThemeKey(u){ return 'lifeos_theme_'+u; }
async function hashPassword(pw){
  const buf = await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(pw));
  return Array.from(new Uint8Array(buf))
    .map(b=>b.toString(16).padStart(2,'0')).join('');
}
function normalizeUsername(u){
  return String(u||'').trim().toLowerCase().replace(/\s+/g,'');
}
function getAccounts(){
  try{
    const d=JSON.parse(localStorage.getItem(AUTH_ACCOUNTS_KEY)||'{}');
    if(!d.users) d.users={};
    return d;
  }catch(e){ return {users:{}}; }
}
function saveAccounts(acc){
  localStorage.setItem(AUTH_ACCOUNTS_KEY, JSON.stringify(acc));
}
function getCurrentAccount(){
  const u=getActiveUsername();
  if(!u) return null;
  const acc=getAccounts().users[u];
  const displayName=sessionStorage.getItem(AUTH_DISPLAY_NAME_KEY)||acc?.displayName||getState().cfg?.name||u;
  return {username:u, displayName};
}
function showAuthError(msg){
  const el=document.getElementById('authError');
  if(!el) return;
  if(msg){ el.textContent=msg; el.classList.add('show'); }
  else{ el.textContent=''; el.classList.remove('show'); }
}
function showAuthLoading(msg){
  const el=document.getElementById('authLoading');
  if(el){
    el.textContent=msg||'Đang tải dữ liệu…';
    el.classList.remove('hidden');
  }
  document.getElementById('authPanelLogin')?.classList.add('hidden');
  document.getElementById('authPanelRegister')?.classList.add('hidden');
  document.getElementById('authPanelForgot')?.classList.add('hidden');
}
function hideAuthLoading(){
  document.getElementById('authLoading')?.classList.add('hidden');
}
function switchAuthTab(tab){
  hideAuthLoading();
  document.getElementById('authTabLogin')?.classList.toggle('active', tab==='login');
  document.getElementById('authTabRegister')?.classList.toggle('active', tab==='register');
  document.getElementById('authPanelLogin')?.classList.toggle('hidden', tab!=='login');
  document.getElementById('authPanelRegister')?.classList.toggle('hidden', tab!=='register');
  document.getElementById('authPanelForgot')?.classList.toggle('hidden', tab!=='forgot');
  if(tab!=='forgot'){
    const fr=document.getElementById('forgotResult');
    fr?.classList.add('hidden');
    if(fr) fr.textContent='';
  }
  showAuthError('');
}
function createInitialState(displayName){
  return {
    months:{}, tasks:[], journeys:[],
    cfg:{...DEFAULT_CFG, name:displayName, gsUrl:GS_WEBAPP_URL},
    savings:{savedDays:{},goal:0,goalName:'',goalYear:new Date().getFullYear()},
    pomodoro:{daily:{}}, spendDaily:{}, spendLimitMonthly:{}, spendNoti:{},
    notiSent:{}
  };
}
async function gsApiPost(body){
  const url=getGsUrl();
  if(!url) throw new Error('Chưa có GS_WEBAPP_URL trong config.js.');
  const res=await fetch(url,{method:'POST',body:JSON.stringify(body)});
  if(!res.ok) throw new Error('Lỗi kết nối server');
  return res.json();
}
async function gsApiGet(params){
  const url=getGsUrl();
  if(!url) throw new Error('Chưa có GS_WEBAPP_URL trong config.js.');
  const qs=new URLSearchParams(params).toString();
  const res=await fetch(url+'?'+qs);
  if(!res.ok) throw new Error('Lỗi kết nối server');
  return res.json();
}
async function pullUserDataFromSheets(username, opts){
  const silent=!!(opts&&opts.silent);
  if(!silent) setSyncStatus('saving','Đang tải dữ liệu…');
  const remote=await gsApiGet({action:'load', username});
  if(remote.status==='error') throw new Error(remote.error||'Không tải được dữ liệu');
  const data=remote.data||createInitialState(sessionStorage.getItem(AUTH_DISPLAY_NAME_KEY)||username);
  localStorage.setItem(userDataKey(username), JSON.stringify(data));
  if(!silent) setSyncStatus('saved','');
  return data;
}
async function doRegister(){
  const displayName=document.getElementById('regDisplayName')?.value?.trim();
  const username=normalizeUsername(document.getElementById('regUsername')?.value);
  const pw=document.getElementById('regPassword')?.value||'';
  const pw2=document.getElementById('regPassword2')?.value||'';
  if(!displayName){ showAuthError('Vui lòng nhập tên hiển thị.'); return; }
  if(!username||username.length<3){ showAuthError('Username tối thiểu 3 ký tự.'); return; }
  if(!/^[a-z0-9_]+$/.test(username)){ showAuthError('Username chỉ gồm chữ thường, số và _'); return; }
  if(pw.length<4){ showAuthError('Mật khẩu tối thiểu 4 ký tự.'); return; }
  if(pw!==pw2){ showAuthError('Xác nhận mật khẩu không khớp.'); return; }
  if(!getGsUrl()){ showAuthError('Chưa cấu hình Google Sheets URL. Dán URL vào GS_WEBAPP_URL trong config.js.'); return; }
  showAuthLoading('Đang đăng ký…');
  showAuthError('');
  try{
    const check=await gsApiGet({action:'checkUsername', username});
    if(check.exists){ showAuthError('Username đã tồn tại. Chọn tên khác hoặc đăng nhập.'); hideAuthLoading(); switchAuthTab('register'); return; }
    const pwHash=await hashPassword(pw);
    const result=await gsApiPost({action:'register', username, password:pwHash, displayName});
    if(result.status!=='ok'){ showAuthError(result.error||'Lỗi đăng ký.'); hideAuthLoading(); switchAuthTab('register'); return; }
    sessionStorage.setItem(AUTH_SESSION_KEY, username);
    sessionStorage.setItem(AUTH_DISPLAY_NAME_KEY, result.displayName||displayName);
    showAuthLoading('Đang tải dữ liệu…');
    await pullUserDataFromSheets(username,{silent:true});
    hideAuthLoading();
    bootApp();
  }catch(e){
    hideAuthLoading();
    switchAuthTab('register');
    showAuthError('Lỗi kết nối: '+e.message);
  }
}
async function doLogin(){
  const username=normalizeUsername(document.getElementById('loginUsername')?.value);
  const pw=document.getElementById('loginPassword')?.value||'';
  if(!username){ showAuthError('Vui lòng nhập username.'); return; }
  if(!getGsUrl()){ showAuthError('Chưa cấu hình Google Sheets URL. Dán URL vào GS_WEBAPP_URL trong config.js.'); return; }
  showAuthLoading('Đang đăng nhập…');
  showAuthError('');
  try{
    const pwHash=await hashPassword(pw);
    const result=await gsApiPost({action:'login', username, password:pwHash});
    if(result.status!=='ok'){ showAuthError(result.error||'Đăng nhập thất bại.'); hideAuthLoading(); switchAuthTab('login'); return; }
    sessionStorage.setItem(AUTH_SESSION_KEY, username);
    sessionStorage.setItem(AUTH_DISPLAY_NAME_KEY, result.displayName||username);
    showAuthLoading('Đang tải dữ liệu…');
    await pullUserDataFromSheets(username,{silent:true});
    hideAuthLoading();
    bootApp();
  }catch(e){
    hideAuthLoading();
    switchAuthTab('login');
    showAuthError('Lỗi kết nối: '+e.message);
  }
}
async function doForgotPassword(){
  const username=normalizeUsername(document.getElementById('forgotUsername')?.value);
  const resultEl=document.getElementById('forgotResult');
  if(!username){ showAuthError('Vui lòng nhập username.'); return; }
  if(!getGsUrl()){ showAuthError('Chưa cấu hình Google Sheets URL. Dán URL vào GS_WEBAPP_URL trong config.js.'); return; }
  showAuthError('');
  resultEl?.classList.add('hidden');
  showAuthLoading('Đang tìm tài khoản…');
  try{
    const result=await gsApiGet({action:'forgot', username});
    hideAuthLoading();
    switchAuthTab('forgot');
    if(result.status!=='ok'){
      showAuthError(result.error||'Không tìm thấy username.');
      return;
    }
    if(resultEl){
      resultEl.textContent='Vui lòng liên hệ admin để reset mật khẩu';
      resultEl.classList.remove('hidden');
    }
  }catch(e){
    hideAuthLoading();
    switchAuthTab('forgot');
    showAuthError('Lỗi kết nối: '+e.message);
  }
}
function doLogout(){
  if(!confirm('Đăng xuất trên thiết bị này? Dữ liệu trên máy này sẽ xoá cache; thiết bị khác vẫn đăng nhập bình thường. Lần sau đăng nhập lại sẽ tải từ Google Sheets.')) return;
  const u=getActiveUsername();
  if(u){
    localStorage.removeItem(userDataKey(u));
    localStorage.removeItem(userThemeKey(u));
  }
  sessionStorage.removeItem(AUTH_SESSION_KEY);
  sessionStorage.removeItem(AUTH_DISPLAY_NAME_KEY);
  stopMultiDeviceSync();
  document.body.classList.remove('logged-in');
  document.getElementById('authScreen')?.classList.remove('hidden');
  switchAuthTab('login');
  showAuthError('');
  hideAuthLoading();
}
function bootApp(){
  document.body.classList.add('logged-in');
  document.getElementById('authScreen')?.classList.add('hidden');
  init();
  startMultiDeviceSync();
}
async function initAuth(){
  const u=getActiveUsername();
  if(u){
    if(!getGsUrl()){
      sessionStorage.removeItem(AUTH_SESSION_KEY);
      sessionStorage.removeItem(AUTH_DISPLAY_NAME_KEY);
      document.body.classList.remove('logged-in');
      document.getElementById('authScreen')?.classList.remove('hidden');
      switchAuthTab('login');
      showAuthError('Chưa cấu hình Google Sheets URL. Dán URL vào GS_WEBAPP_URL trong config.js.');
      return;
    }
    showAuthLoading('Đang tải dữ liệu…');
    try{
      await pullUserDataFromSheets(u,{silent:true});
      hideAuthLoading();
      bootApp();
    }catch(e){
      hideAuthLoading();
      sessionStorage.removeItem(AUTH_SESSION_KEY);
      sessionStorage.removeItem(AUTH_DISPLAY_NAME_KEY);
      document.body.classList.remove('logged-in');
      document.getElementById('authScreen')?.classList.remove('hidden');
      switchAuthTab('login');
      showAuthError('Không tải được dữ liệu: '+e.message);
    }
  }else{
    sessionStorage.removeItem(AUTH_SESSION_KEY);
    sessionStorage.removeItem(AUTH_DISPLAY_NAME_KEY);
    document.body.classList.remove('logged-in');
    document.getElementById('authScreen')?.classList.remove('hidden');
    switchAuthTab('login');
  }
}

function loadState(){
  const u=getActiveUsername();
  if(!u) return {};
  try{ return JSON.parse(localStorage.getItem(userDataKey(u))||'{}'); }catch(e){ return {}; }
}
let multiDeviceSyncTimer = null;

function saveState(s){
  const u=getActiveUsername();
  if(!u) return;
  s.stateUpdatedAt = new Date().toISOString();
  pinBackendUrl(s.cfg);
  localStorage.setItem(userDataKey(u), JSON.stringify(s));
  queueSync();
}

/** Đồng bộ định kỳ khi app mở — nhiều thiết bị cùng tài khoản luôn gần giống Sheets */
function startMultiDeviceSync(){
  if(multiDeviceSyncTimer) clearInterval(multiDeviceSyncTimer);
  if(!getActiveUsername()||!getGsUrl()) return;
  multiDeviceSyncTimer = setInterval(()=>{
    if(document.hidden||!getActiveUsername()) return;
    syncNow({silent:true, pullOnly:true});
  }, 45000);
  if(!window._lifeosVisSync){
    window._lifeosVisSync = true;
    document.addEventListener('visibilitychange', ()=>{
      if(!document.hidden && getActiveUsername() && getGsUrl()){
        syncNow({silent:true, pullOnly:true});
      }
    });
  }
}

function stopMultiDeviceSync(){
  if(multiDeviceSyncTimer){ clearInterval(multiDeviceSyncTimer); multiDeviceSyncTimer = null; }
}
function getState(){
  const s = loadState();
  if(!s.months) s.months = {};
  if(!s.tasks) s.tasks = [];
  if(!s.cfg) s.cfg = {...DEFAULT_CFG};
  else s.cfg = {...DEFAULT_CFG, ...s.cfg};
  pinBackendUrl(s.cfg);
  if(!s.savings) s.savings = { savedDays:{}, goal: 0, goalName:'', goalYear: new Date().getFullYear() };
  if(!s.journeys) s.journeys = [];
  if(!s.pomodoro) s.pomodoro = { daily:{} };
  if(!s.pomodoro.daily) s.pomodoro.daily = {};
  if(!s.spendDaily) s.spendDaily = {};
  if(!s.spendLimitMonthly) s.spendLimitMonthly = {};
  if(!s.spendNoti) s.spendNoti = {};
  if(!s.notiSent) s.notiSent = {};
  ensureModuleNoti(s.cfg);
  pruneNotiSent(s);
  return s;
}

function notiId(){
  return 'n_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7);
}

function defaultModuleNotiBlock(){
  return { schedules:[], dueReminderEnabled:true, dueBeforeMin:15 };
}

function ensureModuleNoti(cfg){
  if(!cfg) return;
  if(!cfg.moduleNoti) cfg.moduleNoti = {};
  MODULE_NOTI_KEYS.forEach(k=>{
    if(!cfg.moduleNoti[k]) cfg.moduleNoti[k] = defaultModuleNotiBlock();
    if(!cfg.moduleNoti[k].schedules) cfg.moduleNoti[k].schedules = [];
    if(cfg.moduleNoti[k].dueReminderEnabled==null) cfg.moduleNoti[k].dueReminderEnabled = true;
    if(!cfg.moduleNoti[k].dueBeforeMin) cfg.moduleNoti[k].dueBeforeMin = 15;
  });
  migrateLegacyNotiToModule(cfg);
}

function migrateLegacyNotiToModule(cfg){
  const legacyMap = { expense:'expense', savings:'savings', task:'task' };
  Object.keys(legacyMap).forEach(k=>{
    const mod = cfg.moduleNoti[k];
    if(mod.schedules.length) return;
    const on = cfg.noti && cfg.noti[k];
    const times = (cfg.notiTimes && cfg.notiTimes[k]) || [];
    if(!on && !times.length) return;
    const defaults = { expense:'21:00', task:'08:00', savings:'09:00' };
    const list = times.length ? times : [defaults[k]];
    list.forEach((time,i)=>{
      mod.schedules.push({
        id:notiId(),
        name: k==='expense'?'Nhắc chi tiêu':k==='savings'?'Nhắc tiết kiệm':'Nhắc công việc',
        time,
        days:[0,1,2,3,4,5,6],
        message:'',
        enabled: !!on
      });
    });
  });
}

function syncModuleNotiToLegacy(cfg){
  ensureModuleNoti(cfg);
  if(!cfg.noti) cfg.noti = { expense:false, task:false, savings:false };
  if(!cfg.notiTimes) cfg.notiTimes = { expense:[], task:[], savings:[] };
  ['expense','task','savings'].forEach(k=>{
    const sch = (cfg.moduleNoti[k]&&cfg.moduleNoti[k].schedules)||[];
    const enabled = sch.some(s=>s.enabled);
    cfg.noti[k] = enabled;
    cfg.notiTimes[k] = [...new Set(sch.filter(s=>s.enabled).map(s=>s.time).filter(Boolean))];
    if(!cfg.notiTimes[k].length && enabled){
      cfg.notiTimes[k] = sch.map(s=>s.time).filter(Boolean);
    }
  });
}

function pruneNotiSent(s){
  const today = localDateKey(new Date());
  Object.keys(s.notiSent||{}).forEach(k=>{
    if(!k.includes(today) && !k.match(/\d{4}-\d{2}-\d{2}/)) delete s.notiSent[k];
    else if(k.match(/\d{4}-\d{2}-\d{2}/) && !k.includes(today)) delete s.notiSent[k];
  });
}

function notiWasSent(key){
  const s = getState();
  return !!(s.notiSent && s.notiSent[key]);
}

function markNotiSent(key){
  const s = getState();
  if(!s.notiSent) s.notiSent = {};
  s.notiSent[key] = Date.now();
  saveState(s);
}

function updateModuleNotiBells(){
  const s = getState();
  ensureModuleNoti(s.cfg);
  MODULE_NOTI_KEYS.forEach(k=>{
    const el = document.getElementById('bell-'+k);
    if(!el) return;
    const sch = s.cfg.moduleNoti[k].schedules||[];
    const on = sch.some(x=>x.enabled) || (k==='task' && s.cfg.moduleNoti.task.dueReminderEnabled);
    el.classList.toggle('active', !!on);
  });
}

// Current month data
function getMonthKey(){ return `${currentYear}-${String(currentMonth+1).padStart(2,'0')}`; }
function getMonthData(){
  const s = getState();
  const k = getMonthKey();
  if(!s.months[k]) s.months[k] = { income:[], fixed:[], living:[], saving:[], note:'' };
  return s.months[k];
}
function saveMonthData(md){
  const s = getState();
  s.months[getMonthKey()] = md;
  saveState(s);
}

// ============================================================
// FORMAT hiển thị (n = nghìn nội bộ: 500 → 500K, 1000 → 1tr) | Ô nhập: gõ VND 1.000.000 = 1tr
// <1tr → 500K | ≥1tr → 1tr, 1.5tr | ≥1T → 1T
// ============================================================
function formatMoneyPart(val){
  if(Math.abs(val - Math.round(val)) < 1e-6) return String(Math.round(val));
  return val.toLocaleString('vi-VN',{maximumFractionDigits:1}).replace(',','.');
}
function formatMoney(n){
  const vnd = n * 1000;
  const abs = Math.abs(vnd);
  const sign = n < 0 ? '-' : '';
  if(abs >= 1e9) return sign + formatMoneyPart(abs / 1e9) + 'T';
  if(abs >= 1e6) return sign + formatMoneyPart(abs / 1e6) + 'tr';
  return sign + formatMoneyPart(abs / 1000) + 'K';
}
function fmt(n){ return formatMoney(n); }
function fmtFull(n){ return formatMoney(n); }
function fmtNum(n){ return formatMoney(n); }

function parseMoneyInputVnd(val){
  if(val==null) return 0;
  const cleaned=String(val).replace(/\./g,'').replace(/\s/g,'').replace(/,/g,'.');
  if(cleaned===''||cleaned==='-') return 0;
  const n=parseFloat(cleaned);
  return isNaN(n)?0:n;
}
/** Hiển thị / nhập theo VND đầy đủ; lưu nội bộ vẫn theo nghìn (÷1000) */
function setMoneyInput(el,nThousands){
  if(!el) return;
  if(nThousands===''||nThousands==null||nThousands===undefined){ el.value=''; return; }
  if(!nThousands){ el.value=''; return; }
  el.value=Math.round(nThousands*1000).toLocaleString('vi-VN');
}
function getMoneyInput(el){
  return parseMoneyInputVnd(el?.value)/1000;
}
function onMoneyInput(e){
  const el=e.target;
  const digits=el.value.replace(/\D/g,'');
  if(digits===''){ el.value=''; return; }
  el.value=parseInt(digits,10).toLocaleString('vi-VN');
}
function initMoneyInputs(){
  document.querySelectorAll('.money-input').forEach(el=>{
    if(el.dataset.moneyBound) return;
    el.dataset.moneyBound='1';
    el.type='text';
    el.setAttribute('inputmode','numeric');
    el.setAttribute('autocomplete','off');
    el.addEventListener('input',onMoneyInput);
  });
}

// ============================================================
// GREETING
// ============================================================
function updateGreeting(){
  const s = getState();
  const cfg = s.cfg;
  const th = getTheme();
  const acc = getCurrentAccount();
  const h = new Date().getHours();
  const name = acc?.displayName || th.displayName || cfg.name || 'Bạn';
  let tpl = th.greeting || '';
  if(!tpl){
    tpl = cfg.morning;
    if(h>=12 && h<18) tpl = cfg.afternoon;
    else if(h>=18) tpl = cfg.evening;
  }
  const msg = (tpl||'Xin chào {name}!').replace('{name}', name);
  document.getElementById('greetingTitle').textContent = msg;
  const now = new Date();
  const days = ['Chủ nhật','Thứ hai','Thứ ba','Thứ tư','Thứ năm','Thứ sáu','Thứ bảy'];
  document.getElementById('greetingDate').textContent = `${days[now.getDay()]}, ${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()}`;
}

// ============================================================
// TABS
// ============================================================
const TAB_IDS = ['finance','savings','tasks','journey','time','settings'];
function switchTab(tab){
  currentTab = tab;
  TAB_IDS.forEach(t=>{
    const el=document.getElementById('tab-'+t);
    if(el) el.classList.toggle('hidden', t!==tab);
  });
  const gd=document.getElementById('page-giaodien');
  if(gd) gd.classList.toggle('hidden', tab!=='giaodien');
  document.querySelectorAll('.nav-item[data-tab]').forEach(el=>{
    el.classList.toggle('active', el.dataset.tab===tab);
  });
  document.querySelectorAll('.bottom-nav-item[data-tab]').forEach(el=>{
    el.classList.toggle('active', el.dataset.tab===tab);
  });
  refreshCurrentTab();
}

function refreshCurrentTab(){
  if(currentTab==='finance') renderFinance();
  else if(currentTab==='savings') renderSavings();
  else if(currentTab==='tasks') renderTasks();
  else if(currentTab==='journey') renderJourneys();
  else if(currentTab==='time') renderPomodoro();
  else if(currentTab==='giaodien') renderGiaoDien();
  else if(currentTab==='settings') loadSettings();
}

// ============================================================
// FINANCE
// ============================================================
function renderMonthTabs(){
  document.getElementById('financeYearLabel').textContent = currentYear;
  const tabs = document.getElementById('monthTabs');
  tabs.innerHTML = MONTHS.map((m,i)=>`
    <div class="month-tab ${i===currentMonth?'active':''}" onclick="selectMonth(${i})">${m}/${currentYear}</div>
  `).join('');
}

function selectMonth(idx){
  currentMonth = idx;
  renderFinance();
}

function changeYear(delta){
  currentYear += delta;
  renderFinance();
}

function copyPrevMonth(){
  let m = currentMonth - 1, y = currentYear;
  if(m < 0){ m = 11; y--; }
  const prevKey = `${y}-${String(m+1).padStart(2,'0')}`;
  const prev = getState().months[prevKey];
  if(!prev || (!(prev.fixed||[]).length && !(prev.living||[]).length)){
    showToast('Tháng trước chưa có chi phí cố định/sinh hoạt!','error');
    return;
  }
  if(!confirm('Sao chép chi phí cố định & sinh hoạt từ tháng trước? (ghi đè mục hiện tại)')) return;
  const md = getMonthData();
  md.fixed = JSON.parse(JSON.stringify(prev.fixed||[]));
  md.living = JSON.parse(JSON.stringify(prev.living||[]));
  saveMonthData(md);
  renderFinance();
  showToast('Đã sao chép chi phí từ tháng trước!','success');
  queueSync();
}

function renderList(id, arr, type){
  const div = document.getElementById(id);
  const colorMap = { income:'income', fixed:'expense', living:'expense', saving:'saving' };
  div.innerHTML = arr.map((e,i)=>`
    <div class="entry-row">
      <span class="entry-name">${esc(e.name)}</span>
      <span class="entry-amount ${colorMap[type]}">${fmtFull(e.amount)}</span>
      <button class="icon-btn edit" onclick="editEntry('${type}',${i})">✏️</button>
      <button class="icon-btn del" onclick="deleteEntry('${type}',${i})">🗑️</button>
    </div>
  `).join('') || `<div style="text-align:center;color:var(--text3);padding:12px;font-size:12px;">Chưa có mục nào</div>`;
}

function renderFinance(){
  renderMonthTabs();
  const md = getMonthData();
  renderList('income-list', md.income||[], 'income');
  renderList('fixed-list', md.fixed||[], 'fixed');
  renderList('living-list', md.living||[], 'living');
  renderList('saving-list', md.saving||[], 'saving');
  document.getElementById('month-note').value = md.note||'';
  calcSummary(md);
  renderSpendLimit();
}

function calcSummary(md){
  const sumArr = arr => (arr||[]).reduce((a,b)=>a+b.amount,0);
  const income = sumArr(md.income);
  const fixed = sumArr(md.fixed);
  const living = sumArr(md.living);
  const saving = sumArr(md.saving);
  const remain = income - fixed - living - saving;

  document.getElementById('sum-income').textContent = fmtFull(income);
  document.getElementById('sum-fixed').textContent = fmtFull(fixed);
  document.getElementById('sum-living').textContent = fmtFull(living);
  document.getElementById('sum-saving').textContent = fmtFull(saving);
  document.getElementById('sum-remain').textContent = fmtFull(remain);
  document.getElementById('sum-remain').className = remain>=0?'result-positive':'result-negative';
  document.getElementById('remain-label').textContent = remain>=0?'Còn dư':'Thiếu';

  // stats bar
  document.getElementById('s-income').textContent = fmtNum(income);
  document.getElementById('s-expense').textContent = fmtNum(fixed+living);
  document.getElementById('s-saving').textContent = fmtNum(saving);
  document.getElementById('s-remain').textContent = fmtNum(Math.abs(remain));
  document.getElementById('s-remain-lbl').textContent = remain>=0?'VNĐ (dư)':'VNĐ (thiếu)';
  document.getElementById('s-remain').className = `stat-val ${remain>=0?'result-positive':'result-negative'}`;
}

// ============================================================
// SPEND LIMIT (Hạn mức chi tiêu)
// ============================================================
function spendDateKey(d){
  const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
  return `spend_${y}-${m}-${day}`;
}
function spendMonthKey(d){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function daysInCalendarMonth(y,m){
  return new Date(y,m+1,0).getDate();
}
function getSpendForDate(d){
  const s=getState();
  return s.spendDaily[spendDateKey(d)]||0;
}
function getMonthlySpendLimit(d){
  return getState().spendLimitMonthly[spendMonthKey(d)]||0;
}
function computeCarryBeforeDay(y,m,dayOfMonth){
  const monthly=getState().spendLimitMonthly[`${y}-${String(m+1).padStart(2,'0')}`]||0;
  if(!monthly) return 0;
  const base=monthly/daysInCalendarMonth(y,m);
  let carry=0;
  for(let d=1;d<dayOfMonth;d++){
    const date=new Date(y,m,d);
    const spent=getSpendForDate(date);
    const available=base+carry;
    carry=available-spent;
  }
  return carry;
}
function getDaySpendBudget(date){
  const y=date.getFullYear(),m=date.getMonth(),day=date.getDate();
  const monthly=getMonthlySpendLimit(date);
  if(!monthly) return {allowed:0,baseDaily:0,carry:0};
  const baseDaily=monthly/daysInCalendarMonth(y,m);
  const carry=computeCarryBeforeDay(y,m,day);
  return {allowed:baseDaily+carry,baseDaily,carry};
}
function saveSpendMonthlyLimit(){
  const val=getMoneyInput(document.getElementById('spend-monthly-limit'));
  const s=getState();
  const k=spendMonthKey(new Date());
  s.spendLimitMonthly[k]=val;
  saveState(s);
  renderSpendLimit();
  showToast('Đã lưu hạn mức tháng!','success');
  queueSync();
}
function checkSpendTelegram(spent,allowed){
  if(allowed<=0) return;
  const s=getState();
  const key=spendDateKey(new Date());
  if(!s.spendNoti[key]) s.spendNoti[key]={};
  const pct=spent/allowed*100;
  if(pct>=100&&!s.spendNoti[key].p100){
    s.spendNoti[key].p100=true;
    saveState(s);
    sendTelegram('🚨 Đã vượt hạn mức chi tiêu hôm nay!');
    notifyUser('Hạn mức','🚨 Đã vượt hạn mức chi tiêu hôm nay!','error');
  }else if(pct>=90&&!s.spendNoti[key].p90){
    s.spendNoti[key].p90=true;
    saveState(s);
    sendTelegram('⚠️ Sắp đạt hạn mức chi tiêu hôm nay!');
    notifyUser('Hạn mức','⚠️ Sắp đạt hạn mức chi tiêu hôm nay!','info');
  }
}
function saveTodaySpend(){
  const amount=getMoneyInput(document.getElementById('spend-today-input'));
  if(isNaN(amount)||amount<0){ showToast('Nhập số tiền hợp lệ!','error'); return; }
  const s=getState();
  const key=spendDateKey(new Date());
  s.spendDaily[key]=amount;
  saveState(s);
  const {allowed}=getDaySpendBudget(new Date());
  checkSpendTelegram(amount,allowed);
  renderSpendLimit();
  showToast('Đã lưu chi tiêu hôm nay!','success');
  queueSync();
}
function renderSpendLimit(){
  const today=new Date();
  const s=getState();
  const mKey=spendMonthKey(today);
  const monthlyInput=document.getElementById('spend-monthly-limit');
  if(monthlyInput && document.activeElement!==monthlyInput){
    setMoneyInput(monthlyInput,s.spendLimitMonthly[mKey]||0);
  }
  const monthly=getMonthlySpendLimit(today);
  const {allowed}=getDaySpendBudget(today);
  const spent=getSpendForDate(today);
  const remain=allowed-spent;
  const todayInput=document.getElementById('spend-today-input');
  if(todayInput && document.activeElement!==todayInput){
    setMoneyInput(todayInput,spent||0);
  }
  const hero=document.getElementById('spend-hero-amount');
  if(hero) hero.textContent=monthly>0?fmtFull(allowed):'—';
  document.getElementById('sl-day-limit').textContent=monthly>0?fmtFull(allowed):'—';
  document.getElementById('sl-spent').textContent=monthly>0?fmtFull(spent):'—';
  const remainEl=document.getElementById('sl-remain');
  if(remainEl){
    remainEl.textContent=monthly>0?fmtFull(Math.abs(remain)):'—';
    remainEl.style.color=remain>=0?'var(--accent3)':'var(--accent5)';
  }
  const bar=document.getElementById('spend-progress-fill');
  if(bar){
    const pct=allowed>0?spent/allowed*100:0;
    bar.style.width=Math.min(100,pct)+'%';
    bar.className='spend-progress-fill '+(pct>=90?'danger':pct>=70?'warn':'ok');
  }
  const tbody=document.getElementById('spend-7day-body');
  if(tbody){
    const rows=[];
    for(let i=6;i>=0;i--){
      const d=new Date(today);
      d.setDate(today.getDate()-i);
      const bud=getDaySpendBudget(d);
      const sp=getSpendForDate(d);
      const diff=bud.allowed-sp;
      const isToday=i===0;
      const over=sp>bud.allowed&&bud.allowed>0;
      const dayNames=['CN','T2','T3','T4','T5','T6','T7'];
      const label=`${dayNames[d.getDay()]} ${d.getDate()}/${d.getMonth()+1}`;
      rows.push(`<tr class="${over?'over':''} ${isToday?'today':''}">
        <td>${label}${isToday?' <span class="badge badge-blue">Hôm nay</span>':''}</td>
        <td>${bud.allowed>0?fmtFull(bud.allowed):'—'}</td>
        <td>${sp>0||isToday?fmtFull(sp):'—'}</td>
        <td style="color:${diff>=0?'var(--accent3)':'var(--accent5)'}">${bud.allowed>0?(diff>=0?'+':'')+fmtFull(diff):'—'}</td>
      </tr>`);
    }
    tbody.innerHTML=rows.join('');
  }
}

function addEntry(type){
  document.getElementById('entryType').value = type;
  document.getElementById('entryEditIdx').value = '';
  document.getElementById('entryName').value = '';
  setMoneyInput(document.getElementById('entryAmount'),'');
  const titles = {income:'Thu nhập',fixed:'Chi tiêu cố định',living:'Chi tiêu sinh hoạt',saving:'Tích lũy & Đầu tư'};
  document.getElementById('entryModalTitle').textContent = '+ ' + titles[type];
  document.getElementById('entryModal').classList.remove('hidden');
}

function editEntry(type, idx){
  const md = getMonthData();
  const e = md[type][idx];
  document.getElementById('entryType').value = type;
  document.getElementById('entryEditIdx').value = idx;
  document.getElementById('entryName').value = e.name;
  setMoneyInput(document.getElementById('entryAmount'),e.amount);
  const titles = {income:'Thu nhập',fixed:'Chi tiêu cố định',living:'Chi tiêu sinh hoạt',saving:'Tích lũy & Đầu tư'};
  document.getElementById('entryModalTitle').textContent = '✏️ Sửa ' + titles[type];
  document.getElementById('entryModal').classList.remove('hidden');
}

function saveEntry(){
  const type = document.getElementById('entryType').value;
  const idx = document.getElementById('entryEditIdx').value;
  const name = document.getElementById('entryName').value.trim();
  const amount = getMoneyInput(document.getElementById('entryAmount'));
  if(!name){ showToast('Vui lòng nhập tên mục!','error'); return; }
  const md = getMonthData();
  if(!md[type]) md[type] = [];
  if(idx!==''){
    md[type][parseInt(idx)] = {name, amount};
  } else {
    md[type].push({name, amount});
  }
  saveMonthData(md);
  closeModal('entryModal');
  renderFinance();
  showToast('Đã lưu!','success');
  queueSync();
}

function deleteEntry(type, idx){
  if(!confirm('Xóa mục này?')) return;
  const md = getMonthData();
  md[type].splice(idx,1);
  saveMonthData(md);
  renderFinance();
  queueSync();
}

function saveNote(){
  const md = getMonthData();
  md.note = document.getElementById('month-note').value;
  saveMonthData(md);
  showToast('Đã lưu ghi chú!','success');
  queueSync();
}

// ============================================================
// SAVINGS
// ============================================================
function renderSavings(){
  const s = getState();
  const cfg = s.cfg;
  const sav = s.savings;
  const goal = parseFloat(cfg.goalAmount)||parseFloat(sav.goal)||0;
  const goalName = cfg.goalName||sav.goalName||'Chưa đặt';
  const goalYear = parseInt(cfg.goalYear)||parseInt(sav.goalYear)||new Date().getFullYear();
  const now = new Date();
  // Months remaining in goal year
  const monthsLeft = goalYear > now.getFullYear()
    ? (goalYear - now.getFullYear())*12 + (12 - now.getMonth())
    : Math.max(1, 12 - now.getMonth());
  const daysInYear = (goalYear - now.getFullYear())*365 + Math.max(1,(new Date(goalYear,11,31)-now)/86400000);
  const monthly = goal>0 ? Math.ceil(goal/monthsLeft) : 0;
  const daily = goal>0 ? Math.ceil(goal/Math.max(1,daysInYear)) : 0;

  // Count saved days in goal year only
  const savedDays = sav.savedDays||{};
  const yearPrefix = goalYear + '-';
  const savedCountInYear = Object.keys(savedDays).filter(k=>k.startsWith(yearPrefix)&&savedDays[k]).length;
  const totalSaved = savedCountInYear * daily;

  document.getElementById('sv-goal').textContent = fmtNum(goal);
  document.getElementById('sv-monthly').textContent = fmtNum(monthly);
  document.getElementById('sv-daily').textContent = fmtNum(daily);
  document.getElementById('sv-saved').textContent = fmtNum(totalSaved);
  document.getElementById('sv-goal-name').textContent = goalName;
  document.getElementById('sv-goal-display').textContent = fmtFull(goal);
  document.getElementById('sv-saved-display').textContent = fmtFull(totalSaved);
  const pct = goal>0 ? Math.min(100, Math.round(totalSaved/goal*100)) : 0;
  document.getElementById('sv-progress').style.width = pct+'%';
  document.getElementById('sv-pct').textContent = pct+'%';
  const daysRemain = Math.max(0, Math.ceil((new Date(goalYear,11,31) - now)/86400000));
  document.getElementById('sv-remain-days').textContent = `Còn ${daysRemain} ngày`;

  renderSavCalendar(savedDays);
}

function renderSavCalendar(savedDays){
  const cal = document.getElementById('savCalendar');
  const lbl = document.getElementById('sav-month-label');
  lbl.textContent = `${MONTH_NAMES[savCalMonth]} ${savCalYear}`;
  const days = ['CN','T2','T3','T4','T5','T6','T7'];
  const daysInMonth = new Date(savCalYear, savCalMonth+1, 0).getDate();
  const firstDay = new Date(savCalYear, savCalMonth, 1).getDay();
  const today = new Date();
  let html = days.map(d=>`<div class="cal-day-label">${d}</div>`).join('');
  for(let i=0;i<firstDay;i++) html += `<div class="cal-day empty"></div>`;
  let monthCount = 0;
  for(let d=1;d<=daysInMonth;d++){
    const key = `${savCalYear}-${String(savCalMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isSaved = savedDays[key];
    const isToday = d===today.getDate() && savCalMonth===today.getMonth() && savCalYear===today.getFullYear();
    if(isSaved) monthCount++;
    html += `<div class="cal-day ${isSaved?'saved':''} ${isToday?'today':''}" onclick="toggleSavDay('${key}')">${d}</div>`;
  }
  cal.innerHTML = html;
  document.getElementById('sav-month-count').textContent = monthCount;
}

function toggleSavDay(key){
  const s = getState();
  if(!s.savings) s.savings = {savedDays:{},goal:0,goalName:'',goalYear:new Date().getFullYear()};
  if(!s.savings.savedDays) s.savings.savedDays = {};
  if(s.savings.savedDays[key]){
    delete s.savings.savedDays[key];
  } else {
    s.savings.savedDays[key] = true;
  }
  saveState(s);
  renderSavings();
  queueSync();
}

function prevSavMonth(){ savCalMonth--; if(savCalMonth<0){savCalMonth=11;savCalYear--;} renderSavings(); }
function nextSavMonth(){ savCalMonth++; if(savCalMonth>11){savCalMonth=0;savCalYear++;} renderSavings(); }

function editSavingsGoal(){
  const s = getState();
  document.getElementById('sv-name').value = s.cfg.goalName||'';
  setMoneyInput(document.getElementById('sv-amount'),s.cfg.goalAmount||0);
  document.getElementById('sv-year').value = s.cfg.goalYear||new Date().getFullYear();
  document.getElementById('savingsModal').classList.remove('hidden');
}

function applySavingsGoal(){
  const s = getState();
  s.cfg.goalName = document.getElementById('sv-name').value;
  s.cfg.goalAmount = getMoneyInput(document.getElementById('sv-amount'));
  s.cfg.goalYear = parseInt(document.getElementById('sv-year').value)||new Date().getFullYear();
  saveState(s);
  closeModal('savingsModal');
  renderSavings();
  showToast('Đã cập nhật mục tiêu!','success');
  queueSync();
}

// ============================================================
// TASKS
// ============================================================
function renderTasks(){
  const s = getState();
  let tasks = s.tasks||[];
  const today = new Date().toISOString().split('T')[0];
  const total = tasks.length;
  const done = tasks.filter(t=>t.done).length;
  const pending = total-done;
  const todayTasks = tasks.filter(t=>!t.done && t.due===today).length;
  document.getElementById('t-total').textContent = total;
  document.getElementById('t-done').textContent = done;
  document.getElementById('t-pending').textContent = pending;
  document.getElementById('t-today').textContent = todayTasks;

  let filtered = tasks;
  if(taskFilter==='main') filtered = tasks.filter(t=>t.type==='main');
  else if(taskFilter==='sub') filtered = tasks.filter(t=>t.type==='sub');
  else if(taskFilter==='extra') filtered = tasks.filter(t=>t.type==='extra');
  else if(taskFilter==='today') filtered = tasks.filter(t=>!t.done && t.due===today);
  else if(taskFilter==='overdue') filtered = tasks.filter(t=>!t.done && t.due && t.due<today);
  else if(taskFilter==='done') filtered = tasks.filter(t=>t.done);

  const typeMap = {main:'Việc chính',sub:'Việc phụ',extra:'Phát sinh'};
  const typeBadge = {main:'badge-blue',sub:'badge-purple',extra:'badge-yellow'};

  document.getElementById('task-list').innerHTML = filtered.map((t,i)=>{
    const realIdx = tasks.indexOf(t);
    const isOverdue = !t.done && t.due && t.due < today;
    const hasProgress = t.target>0;
    const pct = hasProgress ? Math.min(100,Math.round((t.progress||0)/t.target*100)) : 0;
    const dueLabel = t.due
      ? `${isOverdue?'⚠️ Quá hạn · ':''}📅 ${esc(t.due)}${t.dueTime?` 🕐 ${esc(t.dueTime)}`:''}`
      : '';
    return `
    <div class="task-item ${t.done?'done':''}" data-task-idx="${realIdx}">
      <div class="task-check ${t.done?'checked':''}" onclick="toggleTask(${realIdx})">${t.done?'✓':''}</div>
      <div class="task-body">
        <div class="task-title">${esc(t.name)}</div>
        <div class="task-meta">
          <span class="badge ${typeBadge[t.type]||'badge-blue'}">${typeMap[t.type]||esc(t.type)}</span>
          ${t.due?`<span class="badge ${isOverdue?'badge-red':'badge-green'}">${dueLabel}</span>`:''}
          ${hasProgress && t.unit?`<span class="badge badge-yellow">📊 ${esc(t.unit)}</span>`:''}
        </div>
        ${hasProgress?`<div class="progress-inline">
          <div class="task-progress-nums">
            <span class="task-num-bracket">[</span><button type="button" class="task-num-btn" onclick="beginTaskNumEdit(${realIdx},'progress',event)" title="Sửa đã làm">${t.progress||0}</button><span class="task-num-bracket">]</span>
            <span class="task-num-sep">/</span>
            <span class="task-num-bracket">[</span><button type="button" class="task-num-btn" onclick="beginTaskNumEdit(${realIdx},'target',event)" title="Sửa mục tiêu">${t.target}</button><span class="task-num-bracket">]</span>
            ${t.unit?`<span class="task-unit-tag">${esc(t.unit)}</span>`:''}
          </div>
          <div class="prog-bar-sm"><div class="prog-fill-sm" style="width:${pct}%"></div></div>
          <div class="prog-text">${pct}%</div>
        </div>`:''}
        ${t.note?`<div style="font-size:11px;color:var(--text3);margin-top:6px;">${esc(t.note)}</div>`:''}
      </div>
      <div class="task-actions">
        <button class="icon-btn edit" onclick="editTask(${realIdx})">✏️</button>
        <button class="icon-btn del" onclick="deleteTask(${realIdx})">🗑️</button>
      </div>
    </div>`;
  }).join('') || `<div style="text-align:center;color:var(--text3);padding:32px;font-size:13px;">Không có công việc nào${taskFilter!=='all'?' (thử đổi bộ lọc)':''}</div>`;
}

function filterTasks(f, el){
  taskFilter = f;
  document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  renderTasks();
}

function openAddTask(){
  document.getElementById('taskEditIdx').value = '';
  document.getElementById('taskName').value = '';
  document.getElementById('taskType').value = 'main';
  document.getElementById('taskDue').valueAsDate = new Date();
  document.getElementById('taskDueTime').value = '';
  document.getElementById('taskTarget').value = '';
  document.getElementById('taskProgress').value = '';
  document.getElementById('taskUnit').value = '';
  document.getElementById('taskNote').value = '';
  document.getElementById('taskModalTitle').textContent = '+ Thêm công việc';
  document.getElementById('taskModal').classList.remove('hidden');
}

function editTask(idx){
  const s = getState();
  const t = s.tasks[idx];
  document.getElementById('taskEditIdx').value = idx;
  document.getElementById('taskName').value = t.name||'';
  document.getElementById('taskType').value = t.type||'main';
  document.getElementById('taskDue').value = t.due||'';
  document.getElementById('taskDueTime').value = t.dueTime||'';
  document.getElementById('taskTarget').value = t.target||'';
  document.getElementById('taskProgress').value = t.progress||'';
  document.getElementById('taskUnit').value = t.unit||'';
  document.getElementById('taskNote').value = t.note||'';
  document.getElementById('taskModalTitle').textContent = '✏️ Sửa công việc';
  document.getElementById('taskModal').classList.remove('hidden');
}

function saveTask(){
  const idx = document.getElementById('taskEditIdx').value;
  const name = document.getElementById('taskName').value.trim();
  if(!name){ showToast('Vui lòng nhập tên việc!','error'); return; }
  const task = {
    name,
    type: document.getElementById('taskType').value,
    due: document.getElementById('taskDue').value,
    dueTime: document.getElementById('taskDueTime').value,
    target: parseInt(document.getElementById('taskTarget').value)||0,
    progress: parseInt(document.getElementById('taskProgress').value)||0,
    unit: document.getElementById('taskUnit').value.trim(),
    note: document.getElementById('taskNote').value.trim(),
    done: false,
    createdAt: new Date().toISOString()
  };
  const s = getState();
  if(idx!==''){
    task.done = s.tasks[idx].done;
    task.createdAt = s.tasks[idx].createdAt;
    s.tasks[parseInt(idx)] = task;
  } else {
    s.tasks.push(task);
  }
  saveState(s);
  closeModal('taskModal');
  renderTasks();
  setupNotifications();
  showToast('Đã lưu công việc!','success');
  queueSync();
}

function toggleTask(idx){
  const s = getState();
  s.tasks[idx].done = !s.tasks[idx].done;
  saveState(s);
  renderTasks();
  queueSync();
}

function deleteTask(idx){
  if(!confirm('Xóa việc này?')) return;
  const s = getState();
  s.tasks.splice(idx,1);
  saveState(s);
  renderTasks();
  queueSync();
}

function beginTaskNumEdit(idx, field, ev){
  ev.stopPropagation();
  const btn = ev.currentTarget;
  if(btn.querySelector('.task-num-input')) return;
  const s = getState();
  const t = s.tasks[idx];
  if(!t || !(t.target>0)) return;
  const val = field==='progress' ? (t.progress||0) : t.target;
  const input = document.createElement('input');
  input.type = 'number';
  input.min = '0';
  input.className = 'task-num-input';
  input.value = val;
  const saved = String(val);
  btn.textContent = '';
  btn.appendChild(input);
  input.focus();
  input.select();
  function finish(save){
    if(!btn.contains(input)) return;
    if(save){
      let num = parseInt(input.value,10);
      if(isNaN(num) || num<0) num = 0;
      if(field==='progress'){
        t.progress = t.target>0 ? Math.min(num, t.target) : num;
      } else {
        t.target = num;
        if(t.target>0 && (t.progress||0)>t.target) t.progress = t.target;
      }
      saveState(s);
      queueSync();
      if(!(t.target>0)){ renderTasks(); return; }
      btn.textContent = field==='progress' ? (t.progress||0) : t.target;
      updateTaskCardProgress(idx);
    } else {
      btn.textContent = saved;
    }
  }
  input.addEventListener('blur', ()=>finish(true));
  input.addEventListener('keydown', e=>{
    if(e.key==='Enter'){ e.preventDefault(); input.blur(); }
    if(e.key==='Escape'){ e.preventDefault(); finish(false); }
  });
}

function updateTaskCardProgress(idx){
  const s = getState();
  const t = s.tasks[idx];
  if(!t || !(t.target>0)) return;
  const pct = Math.min(100, Math.round((t.progress||0)/t.target*100));
  const item = document.querySelector(`.task-item[data-task-idx="${idx}"]`);
  if(!item){ renderTasks(); return; }
  const btns = item.querySelectorAll('.task-num-btn');
  if(btns[0]) btns[0].textContent = t.progress||0;
  if(btns[1]) btns[1].textContent = t.target;
  const fill = item.querySelector('.prog-fill-sm');
  const text = item.querySelector('.prog-text');
  if(fill) fill.style.width = pct+'%';
  if(text) text.textContent = pct+'%';
}

// ============================================================
// JOURNEY (Hành trình N ngày)
// ============================================================
function localDateKey(d){
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function parseLocalDate(str){
  const [y,m,d]=str.split('-').map(Number);
  return new Date(y,m-1,d);
}
function getJourneyEnd(j){
  const end=parseLocalDate(j.startDate);
  end.setDate(end.getDate()+(parseInt(j.totalDays,10)||1)-1);
  return end;
}
function getJourneyKeys(j){
  const keys=[];
  const start=parseLocalDate(j.startDate);
  const n=Math.max(1,parseInt(j.totalDays,10)||1);
  for(let i=0;i<n;i++){
    const d=new Date(start);
    d.setDate(start.getDate()+i);
    keys.push(localDateKey(d));
  }
  return keys;
}
function isKeyInJourney(j,key){
  return getJourneyKeys(j).includes(key);
}
function getJourneyStats(j){
  const keys=getJourneyKeys(j);
  const done=j.completedDays||{};
  const completed=keys.filter(k=>done[k]).length;
  const total=keys.length;
  const pct=total>0?Math.round(completed/total*100):0;
  const today=new Date();
  today.setHours(0,0,0,0);
  const end=getJourneyEnd(j);
  end.setHours(0,0,0,0);
  let remaining=0;
  if(today<=end){
    const start=parseLocalDate(j.startDate);
    start.setHours(0,0,0,0);
    if(today<start) remaining=total;
    else remaining=Math.max(0,Math.round((end-today)/86400000)+1);
  }
  let streak=0;
  let d=new Date(today);
  if(d>end) d=new Date(end);
  const start=parseLocalDate(j.startDate);
  start.setHours(0,0,0,0);
  if(!done[localDateKey(d)]) d.setDate(d.getDate()-1);
  while(d>=start){
    if(done[localDateKey(d)]){ streak++; d.setDate(d.getDate()-1); }
    else break;
  }
  return {streak,pct,remaining,completed,total};
}
function ensureJourneyCalView(j){
  if(!journeyCalView[j.id]){
    const start=parseLocalDate(j.startDate);
    journeyCalView[j.id]={month:start.getMonth(),year:start.getFullYear()};
  }
  return journeyCalView[j.id];
}
function renderJourneyCalendar(j){
  const view=ensureJourneyCalView(j);
  const calId='jcal-'+j.id;
  const lblId='jcal-lbl-'+j.id;
  const lbl=document.getElementById(lblId);
  if(lbl) lbl.textContent=`${MONTH_NAMES[view.month]} ${view.year}`;
  const cal=document.getElementById(calId);
  if(!cal) return;
  const days=['CN','T2','T3','T4','T5','T6','T7'];
  const daysInMonth=new Date(view.year,view.month+1,0).getDate();
  const firstDay=new Date(view.year,view.month,1).getDay();
  const today=new Date();
  const done=j.completedDays||{};
  const journeyKeys=new Set(getJourneyKeys(j));
  let html=days.map(d=>`<div class="cal-day-label">${d}</div>`).join('');
  for(let i=0;i<firstDay;i++) html+=`<div class="cal-day empty"></div>`;
  for(let d=1;d<=daysInMonth;d++){
    const key=`${view.year}-${String(view.month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const inJ=journeyKeys.has(key);
    const isDone=!!done[key];
    const isToday=d===today.getDate()&&view.month===today.getMonth()&&view.year===today.getFullYear();
    let cls='cal-day';
    if(inJ){ cls+=' in-journey'; if(isDone) cls+=' journey-done'; if(isToday) cls+=' journey-today'; }
    else cls+=' out-journey';
    const click=inJ?`onclick="toggleJourneyDay('${j.id}','${key}')"`:'';
    html+=`<div class="${cls}" ${click}>${d}</div>`;
  }
  cal.innerHTML=html;
}
function renderJourneys(){
  const journeys=getState().journeys||[];
  const list=document.getElementById('journey-list');
  if(!journeys.length){
    list.innerHTML=`<div class="card" style="text-align:center;padding:40px;color:var(--text3);">
      <div style="font-size:40px;margin-bottom:12px;">🏆</div>
      <div style="font-size:14px;font-weight:600;margin-bottom:6px;">Chưa có hành trình nào</div>
      <div style="font-size:12px;">Tạo hành trình 7, 21, 30 ngày... và tick từng ngày hoàn thành!</div>
    </div>`;
    return;
  }
  list.innerHTML=journeys.map(j=>{
    const st=getJourneyStats(j);
    const end=getJourneyEnd(j);
    const endStr=`${end.getDate()}/${end.getMonth()+1}/${end.getFullYear()}`;
    const startParts=j.startDate.split('-');
    const startStr=`${startParts[2]}/${startParts[1]}/${startParts[0]}`;
    return `
    <div class="card journey-card">
      <div class="card-header">
        <div>
          <div class="card-title">🏆 ${esc(j.name)}</div>
          <div class="journey-range">${esc(j.totalDays)} ngày · ${startStr} → ${endStr}</div>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-ghost btn-sm" onclick="openJourneyModal('${j.id}')">✏️</button>
          <button class="icon-btn del" onclick="deleteJourney('${j.id}')" title="Xóa">🗑️</button>
        </div>
      </div>
      <div class="journey-stats">
        <div class="journey-stat"><div class="val" style="color:var(--accent4);">🔥 ${st.streak}</div><div class="lbl">Streak ngày</div></div>
        <div class="journey-stat"><div class="val" style="color:var(--accent3);">${st.pct}%</div><div class="lbl">Hoàn thành</div></div>
        <div class="journey-stat"><div class="val" style="color:var(--accent);">${st.remaining}</div><div class="lbl">Còn lại</div></div>
      </div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:10px;">Đã hoàn thành <strong style="color:var(--accent3);">${st.completed}/${st.total}</strong> ngày · Click ngày trong lịch để tick</div>
      <div class="month-nav">
        <button class="btn btn-ghost btn-sm" onclick="prevJourneyMonth('${j.id}')">‹</button>
        <span id="jcal-lbl-${j.id}" style="font-size:13px;font-weight:700;flex:1;text-align:center;"></span>
        <button class="btn btn-ghost btn-sm" onclick="nextJourneyMonth('${j.id}')">›</button>
      </div>
      <div class="calendar-grid" id="jcal-${j.id}"></div>
    </div>`;
  }).join('');
  journeys.forEach(j=>renderJourneyCalendar(j));
}
function openJourneyModal(editId){
  document.getElementById('journeyEditId').value=editId||'';
  if(editId){
    const j=getState().journeys.find(x=>x.id===editId);
    if(!j) return;
    document.getElementById('journeyModalTitle').textContent='✏️ Sửa hành trình';
    document.getElementById('journeyName').value=j.name||'';
    document.getElementById('journeyDays').value=j.totalDays||'';
    document.getElementById('journeyStart').value=j.startDate||'';
  }else{
    document.getElementById('journeyModalTitle').textContent='🏆 Thêm hành trình';
    document.getElementById('journeyName').value='';
    document.getElementById('journeyDays').value='30';
    document.getElementById('journeyStart').value=localDateKey(new Date());
  }
  document.getElementById('journeyModal').classList.remove('hidden');
}
function saveJourney(){
  const name=document.getElementById('journeyName').value.trim();
  const totalDays=parseInt(document.getElementById('journeyDays').value,10);
  const startDate=document.getElementById('journeyStart').value;
  const editId=document.getElementById('journeyEditId').value;
  if(!name){ showToast('Vui lòng nhập tên hành trình!','error'); return; }
  if(!totalDays||totalDays<1){ showToast('Số ngày phải ≥ 1!','error'); return; }
  if(!startDate){ showToast('Chọn ngày bắt đầu!','error'); return; }
  const s=getState();
  if(editId){
    const j=s.journeys.find(x=>x.id===editId);
    if(j){
      const oldDone={...(j.completedDays||{})};
      j.name=name; j.totalDays=totalDays; j.startDate=startDate;
      const newDone={};
      getJourneyKeys(j).forEach(k=>{ if(oldDone[k]) newDone[k]=true; });
      j.completedDays=newDone;
    }
  }else{
    s.journeys.push({
      id:'j'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),
      name, totalDays, startDate,
      completedDays:{}
    });
  }
  saveState(s);
  delete journeyCalView[editId];
  closeModal('journeyModal');
  renderJourneys();
  showToast('Đã lưu hành trình!','success');
  queueSync();
}
function deleteJourney(id){
  if(!confirm('Xóa hành trình này?')) return;
  const s=getState();
  s.journeys=s.journeys.filter(j=>j.id!==id);
  delete journeyCalView[id];
  saveState(s);
  renderJourneys();
  showToast('Đã xóa hành trình!','success');
  queueSync();
}
function toggleJourneyDay(id,key){
  const s=getState();
  const j=s.journeys.find(x=>x.id===id);
  if(!j||!isKeyInJourney(j,key)) return;
  if(!j.completedDays) j.completedDays={};
  if(j.completedDays[key]) delete j.completedDays[key];
  else j.completedDays[key]=true;
  saveState(s);
  renderJourneys();
  queueSync();
}
function prevJourneyMonth(id){
  const j=getState().journeys.find(x=>x.id===id);
  if(!j) return;
  const v=ensureJourneyCalView(j);
  v.month--; if(v.month<0){ v.month=11; v.year--; }
  renderJourneyCalendar(j);
}
function nextJourneyMonth(id){
  const j=getState().journeys.find(x=>x.id===id);
  if(!j) return;
  const v=ensureJourneyCalView(j);
  v.month++; if(v.month>11){ v.month=0; v.year++; }
  renderJourneyCalendar(j);
}

// ============================================================
// POMODORO
// ============================================================
function pomoTodayKey(){
  return localDateKey(new Date());
}

function getPomoTodayCount(){
  const s = getState();
  return s.pomodoro.daily[pomoTodayKey()] || 0;
}

function incrementPomoToday(){
  const s = getState();
  const k = pomoTodayKey();
  s.pomodoro.daily[k] = (s.pomodoro.daily[k] || 0) + 1;
  saveState(s);
}

function pomoTotalSeconds(){
  return pomoMode === 'work' ? POMO_WORK : POMO_BREAK;
}

function formatPomoTime(sec){
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function playBeep(){
  try{
    if(!pomoAudioCtx) pomoAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = pomoAudioCtx;
    if(ctx.state === 'suspended') ctx.resume();
    [0, 0.35, 0.7].forEach((delay, i)=>{
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = i === 2 ? 660 : 880;
      const t = ctx.currentTime + delay;
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.25);
      osc.start(t);
      osc.stop(t + 0.25);
    });
  }catch(e){}
}

function updatePomoUI(){
  const disp = document.getElementById('pomo-display');
  const status = document.getElementById('pomo-status');
  const ring = document.getElementById('pomo-ring');
  const startBtn = document.getElementById('pomo-start-btn');
  const modeLbl = document.getElementById('pomo-mode-label');
  const modeSub = document.getElementById('pomo-mode-sub');
  const todayEl = document.getElementById('pomo-today-count');
  if(!disp) return;
  disp.textContent = formatPomoTime(pomoSecondsLeft);
  const total = pomoTotalSeconds();
  if(ring) ring.style.width = (pomoSecondsLeft / total * 100) + '%';
  if(status){
    status.className = 'pomo-mode ' + pomoMode;
    status.textContent = pomoMode === 'work' ? '🎯 Thời gian làm việc' : '☕ Thời gian nghỉ';
  }
  if(modeLbl) modeLbl.textContent = pomoMode === 'work' ? 'Làm việc' : 'Nghỉ';
  if(modeSub) modeSub.textContent = formatPomoTime(pomoSecondsLeft);
  if(startBtn) startBtn.textContent = pomoRunning ? '⏸ Pause' : '▶ Start';
  if(todayEl) todayEl.textContent = getPomoTodayCount();
}

function renderPomodoro(){
  updatePomoUI();
}

function pomoTick(){
  if(pomoSecondsLeft <= 0){
    pomoOnComplete();
    return;
  }
  pomoSecondsLeft--;
  updatePomoUI();
}

function pomoOnComplete(){
  clearInterval(pomoTimerId);
  pomoTimerId = null;
  pomoRunning = false;
  playBeep();
  if(pomoMode === 'work'){
    incrementPomoToday();
    showToast('🍅 Pomodoro hoàn thành! Nghỉ 5 phút nhé.', 'success');
    notifyUser('Pomodoro', '🍅 Hoàn thành! Bắt đầu nghỉ 5 phút.', 'success');
    pomoMode = 'break';
    pomoSecondsLeft = POMO_BREAK;
  }else{
    showToast('☕ Hết giờ nghỉ! Sẵn sàng làm việc tiếp.', 'info');
    notifyUser('Pomodoro', '☕ Hết giờ nghỉ. Bắt đầu phiên làm việc mới!', 'info');
    pomoMode = 'work';
    pomoSecondsLeft = POMO_WORK;
  }
  updatePomoUI();
}

function pomoStartPause(){
  if(pomoRunning){
    clearInterval(pomoTimerId);
    pomoTimerId = null;
    pomoRunning = false;
    updatePomoUI();
    return;
  }
  if(pomoSecondsLeft <= 0){
    pomoSecondsLeft = pomoTotalSeconds();
  }
  pomoRunning = true;
  if(pomoAudioCtx && pomoAudioCtx.state === 'suspended') pomoAudioCtx.resume();
  else if(!pomoAudioCtx) try{ pomoAudioCtx = new (window.AudioContext || window.webkitAudioContext)(); }catch(e){}
  pomoTimerId = setInterval(pomoTick, 1000);
  updatePomoUI();
}

function pomoReset(){
  clearInterval(pomoTimerId);
  pomoTimerId = null;
  pomoRunning = false;
  pomoSecondsLeft = pomoTotalSeconds();
  updatePomoUI();
}

// ============================================================
// SETTINGS
// ============================================================
function loadSettings(){
  const s = getState();
  const cfg = s.cfg;
  document.getElementById('cfg-name').value = cfg.name||'';
  document.getElementById('cfg-morning').value = cfg.morning||'';
  document.getElementById('cfg-afternoon').value = cfg.afternoon||'';
  document.getElementById('cfg-evening').value = cfg.evening||'';
  pinBackendUrl(cfg);
  document.getElementById('cfg-gsurl').value = getGsUrl();
  updateBackendInfo();
  document.getElementById('cfg-tg-token').value = cfg.tgToken||'';
  document.getElementById('cfg-tg-chatid').value = cfg.tgChatId||'';
  document.getElementById('cfg-goal-name').value = cfg.goalName||'';
  setMoneyInput(document.getElementById('cfg-goal-amount'),cfg.goalAmount||0);
  document.getElementById('cfg-goal-year').value = cfg.goalYear||new Date().getFullYear();
  // Toggle states
  ['expense','task','savings'].forEach(k=>{
    const on = cfg.noti&&cfg.noti[k];
    const tog = document.getElementById('tog-'+k);
    tog.className = 'toggle'+(on?' on':'');
  });
  renderNotiTimes('expense');
  renderNotiTimes('task');
  renderNotiTimes('savings');
  updateExpenseTimesVisibility();
  updateTaskTimesVisibility();
  updateSavingsTimesVisibility();
  updateModuleNotiBells();
  updateVersionDisplay();
  updateTelegramDiagnostics();
}

function saveCfg(){
  const s = getState();
  s.cfg.name = document.getElementById('cfg-name').value;
  s.cfg.morning = document.getElementById('cfg-morning').value;
  s.cfg.afternoon = document.getElementById('cfg-afternoon').value;
  s.cfg.evening = document.getElementById('cfg-evening').value;
  pinBackendUrl(s.cfg);
  s.cfg.tgToken = normalizeTelegramToken(document.getElementById('cfg-tg-token').value);
  s.cfg.tgChatId = normalizeTelegramChatId(document.getElementById('cfg-tg-chatid').value);
  document.getElementById('cfg-tg-token').value = s.cfg.tgToken;
  document.getElementById('cfg-tg-chatid').value = s.cfg.tgChatId;
  s.cfg.goalName = document.getElementById('cfg-goal-name').value;
  s.cfg.goalAmount = getMoneyInput(document.getElementById('cfg-goal-amount'));
  s.cfg.goalYear = parseInt(document.getElementById('cfg-goal-year').value)||new Date().getFullYear();
  saveState(s);
  updateGreeting();
  updateTelegramDiagnostics();
  showToast('Đã lưu cài đặt!','success');
  queueSync();
}

function toggleSetting(key){
  const s = getState();
  if(!s.cfg.noti) s.cfg.noti = {};
  s.cfg.noti[key] = !s.cfg.noti[key];
  ensureModuleNoti(s.cfg);
  const mod = s.cfg.moduleNoti[key];
  if(mod){
    if(!mod.schedules.length){
      const defaults = { expense:'21:00', task:'08:00', savings:'09:00' };
      mod.schedules.push({
        id:notiId(),
        name: key==='expense'?'Nhắc chi tiêu':key==='savings'?'Nhắc tiết kiệm':'Nhắc công việc',
        time:defaults[key]||'09:00',
        days:[0,1,2,3,4,5,6],
        message:'',
        enabled: s.cfg.noti[key]
      });
    } else {
      mod.schedules.forEach(sch=>{ sch.enabled = s.cfg.noti[key]; });
    }
  }
  saveState(s);
  const tog = document.getElementById('tog-'+key);
  tog.className = 'toggle'+(s.cfg.noti[key]?' on':'');
  updateExpenseTimesVisibility();
  updateTaskTimesVisibility();
  updateSavingsTimesVisibility();
  if(s.cfg.noti[key]) requestNotiPermission();
  setupNotifications();
  updateModuleNotiBells();
}

function updateExpenseTimesVisibility(){
  const s = getState();
  const on = s.cfg.noti&&s.cfg.noti.expense;
  document.getElementById('expense-noti-times').classList.toggle('hidden',!on);
}
function updateTaskTimesVisibility(){
  const s = getState();
  const on = s.cfg.noti&&s.cfg.noti.task;
  document.getElementById('task-noti-times').classList.toggle('hidden',!on);
}
function updateSavingsTimesVisibility(){
  const s = getState();
  const on = s.cfg.noti&&s.cfg.noti.savings;
  document.getElementById('savings-noti-times').classList.toggle('hidden',!on);
}

function renderNotiTimes(key){
  const s = getState();
  const times = s.cfg.notiTimes&&s.cfg.notiTimes[key]||[];
  const container = document.getElementById(key+'-times-list');
  container.innerHTML = times.map((t,i)=>`
    <div class="time-badge">${t}<span class="remove" onclick="removeNotiTime('${key}',${i})">✕</span></div>
  `).join('');
}

function addNotiTime(key){
  const val = document.getElementById('new-'+key+'-time').value;
  if(!val) return;
  const s = getState();
  if(!s.cfg.notiTimes) s.cfg.notiTimes = {};
  if(!s.cfg.notiTimes[key]) s.cfg.notiTimes[key] = [];
  if(!s.cfg.notiTimes[key].includes(val)) s.cfg.notiTimes[key].push(val);
  ensureModuleNoti(s.cfg);
  const mod = s.cfg.moduleNoti[key];
  if(mod && !mod.schedules.some(sch=>sch.time===val)){
    mod.schedules.push({
      id:notiId(),
      name:'Lịch '+val,
      time:val,
      days:[0,1,2,3,4,5,6],
      message:'',
      enabled: !!(s.cfg.noti&&s.cfg.noti[key])
    });
  }
  syncModuleNotiToLegacy(s.cfg);
  saveState(s);
  renderNotiTimes(key);
  setupNotifications();
  updateModuleNotiBells();
}

function removeNotiTime(key,idx){
  const s = getState();
  const removed = s.cfg.notiTimes[key][idx];
  s.cfg.notiTimes[key].splice(idx,1);
  ensureModuleNoti(s.cfg);
  const mod = s.cfg.moduleNoti[key];
  if(mod && removed){
    const i = mod.schedules.findIndex(sch=>sch.time===removed);
    if(i>=0) mod.schedules.splice(i,1);
  }
  syncModuleNotiToLegacy(s.cfg);
  saveState(s);
  renderNotiTimes(key);
  setupNotifications();
  updateModuleNotiBells();
}

function openSettings(){ switchTab('settings'); }

function exportData(){
  const data = getState();
  const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `app-ca-nhan-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('Đã xuất file backup!','success');
}

function importData(evt){
  const file = evt.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = e=>{
    try{
      const data = JSON.parse(e.target.result);
      if(!data || (typeof data!=='object')) throw new Error('File không hợp lệ');
      const cur = getState();
      const merged = {
        months: {...cur.months, ...(data.months||{})},
        tasks: data.tasks||cur.tasks,
        savings: {...cur.savings, ...(data.savings||{}), savedDays:{...(cur.savings?.savedDays||{}), ...(data.savings?.savedDays||{})}},
        journeys: data.journeys||cur.journeys||[],
        pomodoro: {daily:{...(cur.pomodoro?.daily||{}), ...(data.pomodoro?.daily||{})}},
        spendDaily: {...(cur.spendDaily||{}), ...(data.spendDaily||{})},
        spendLimitMonthly: {...(cur.spendLimitMonthly||{}), ...(data.spendLimitMonthly||{})},
        spendNoti: {...(cur.spendNoti||{}), ...(data.spendNoti||{})},
        notiSent: {...(cur.notiSent||{}), ...(data.notiSent||{})},
        cfg: {
          ...cur.cfg,
          ...(data.cfg||{}),
          gsUrl: GS_WEBAPP_URL,
          noti:{...cur.cfg?.noti, ...data.cfg?.noti},
          notiTimes:{...cur.cfg?.notiTimes, ...data.cfg?.notiTimes},
          moduleNoti: mergeModuleNoti(cur.cfg?.moduleNoti, data.cfg?.moduleNoti)
        }
      };
      pinBackendUrl(merged.cfg);
      saveState(merged);
      refreshCurrentTab();
      updateGreeting();
      setupNotifications();
      showToast('Đã nhập dữ liệu từ backup!','success');
    }catch(err){
      showToast('Lỗi đọc file: '+err.message,'error');
    }
  };
  reader.readAsText(file);
  evt.target.value = '';
}

// ============================================================
// MODULE NOTIFICATIONS (panel per mục)
// ============================================================
function openModuleNotiPanel(moduleKey){
  moduleNotiPanelKey = moduleKey;
  moduleNotiEditId = null;
  document.getElementById('moduleNotiTitle').textContent = '🔔 '+ (MODULE_NOTI_LABELS[moduleKey]||moduleKey);
  renderModuleNotiPanel();
  document.getElementById('moduleNotiModal').classList.remove('hidden');
  requestNotiPermission();
}

function renderModuleNotiPanel(){
  const key = moduleNotiPanelKey;
  const body = document.getElementById('moduleNotiBody');
  if(!key||!body) return;
  const s = getState();
  ensureModuleNoti(s.cfg);
  const mod = s.cfg.moduleNoti[key];
  const schedules = mod.schedules||[];

  let taskExtra = '';
  if(key==='task'){
    const before = mod.dueBeforeMin===60 ? 60 : 15;
    taskExtra = `
    <div class="module-noti-task-extra">
      <div style="font-size:13px;font-weight:600;margin-bottom:8px;">⚡ Nhắc trước giờ hoàn thành</div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:10px;">Tự nhắc khi việc có hạn + giờ hoàn thành (gửi Telegram)</div>
      <div class="settings-row" style="padding:6px 0;border:none;">
        <span style="font-size:12px;">Bật nhắc sắp đến hạn</span>
        <div class="toggle ${mod.dueReminderEnabled?'on':''}" onclick="toggleTaskDueReminder()"></div>
      </div>
      <div style="margin-top:10px;font-size:12px;color:var(--text2);">Nhắc trước:</div>
      <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap;">
        <button type="button" class="btn btn-sm ${before===15?'btn-primary':'btn-ghost'}" onclick="setTaskDueBefore(15)">15 phút</button>
        <button type="button" class="btn btn-sm ${before===60?'btn-primary':'btn-ghost'}" onclick="setTaskDueBefore(60)">1 giờ</button>
      </div>
      <div style="font-size:11px;color:var(--text3);margin-top:8px;">Mẫu: ⚡ Sắp đến hạn: [tên việc] lúc [giờ]</div>
    </div>`;
  }

  const listHtml = schedules.length ? schedules.map(sch=>`
    <div class="noti-schedule-card ${sch.enabled?'':'off'}">
      <div class="noti-schedule-head">
        <div>
          <div style="font-weight:600;font-size:13px;">${esc(sch.name||'Lịch nhắc')}</div>
          <div style="font-size:12px;color:var(--text2);margin-top:4px;">🕐 ${esc(sch.time)} · ${formatNotiDays(sch.days)}</div>
          ${sch.message?`<div style="font-size:11px;color:var(--text3);margin-top:4px;">${esc(sch.message.slice(0,80))}${sch.message.length>80?'…':''}</div>`:''}
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <div class="toggle ${sch.enabled?'on':''}" onclick="toggleModuleSchedule('${sch.id}')"></div>
          <button type="button" class="icon-btn edit" onclick="editModuleSchedule('${sch.id}')">✏️</button>
          <button type="button" class="icon-btn del" onclick="removeModuleSchedule('${sch.id}')">🗑️</button>
        </div>
      </div>
    </div>
  `).join('') : '<div style="font-size:12px;color:var(--text3);padding:8px 0;">Chưa có lịch nhắc. Thêm lịch bên dưới.</div>';

  const formHtml = moduleNotiEditId===null ? renderModuleNotiForm(null) : renderModuleNotiForm(schedules.find(s=>s.id===moduleNotiEditId)||null);

  body.innerHTML = taskExtra + `
    <div style="font-size:13px;font-weight:600;margin-bottom:8px;">Lịch nhắc (${schedules.length})</div>
    ${listHtml}
    <div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border);">
      <div style="font-size:13px;font-weight:600;margin-bottom:10px;">${moduleNotiEditId?'✏️ Sửa lịch':'+ Thêm lịch nhắc'}</div>
      ${formHtml}
    </div>`;
}

function formatNotiDays(days){
  const d = Array.isArray(days)&&days.length ? days : [0,1,2,3,4,5,6];
  if(d.length===7) return 'Mỗi ngày';
  return NOTI_WEEKDAYS.filter(w=>d.includes(w.v)).map(w=>w.l).join(' ');
}

function renderModuleNotiForm(sch){
  const days = sch&&sch.days ? [...sch.days] : [0,1,2,3,4,5,6];
  const dayChips = NOTI_WEEKDAYS.map(w=>`
    <span class="noti-day-chip ${days.includes(w.v)?'on':''}" data-day="${w.v}" onclick="toggleNotiFormDay(this)">${w.l}</span>
  `).join('');
  return `
    <input type="hidden" id="mnf-days" value="${days.join(',')}"/>
    <div class="modal-row">
      <label>Tên thông báo</label>
      <input class="input" id="mnf-name" placeholder="VD: Nhắc chi tiêu tối" value="${esc(sch?sch.name:'')}"/>
    </div>
    <div class="modal-row">
      <label>Giờ nhắc</label>
      <input class="input" type="time" id="mnf-time" value="${esc(sch?sch.time:'09:00')}"/>
    </div>
    <div class="modal-row">
      <label>Ngày trong tuần</label>
      <div class="noti-weekdays" id="mnf-weekdays">${dayChips}</div>
    </div>
    <div class="modal-row">
      <label>Nội dung Telegram <span style="font-weight:400;color:var(--text3);">(để trống = mặc định)</span></label>
      <textarea class="note-area" id="mnf-message" placeholder="${esc(DEFAULT_NOTI_MESSAGES[moduleNotiPanelKey]||'')}" style="min-height:56px;">${esc(sch?sch.message:'')}</textarea>
      <div style="font-size:11px;color:var(--text3);margin-top:4px;">Biến: {name} · {daily} (tiết kiệm)</div>
    </div>
    <div class="settings-row" style="padding:4px 0 12px;border:none;">
      <span style="font-size:12px;">Bật lịch này</span>
      <div class="toggle ${!sch||sch.enabled!==false?'on':''}" id="mnf-enabled-tog" onclick="this.classList.toggle('on')"></div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button type="button" class="btn btn-primary btn-sm" onclick="saveModuleSchedule()">${sch?'💾 Cập nhật':'+ Thêm lịch'}</button>
      ${sch?'<button type="button" class="btn btn-ghost btn-sm" onclick="cancelModuleScheduleEdit()">Hủy sửa</button>':''}
    </div>`;
}

function toggleNotiFormDay(el){
  el.classList.toggle('on');
  const days = [];
  document.querySelectorAll('#mnf-weekdays .noti-day-chip.on').forEach(c=>{
    days.push(parseInt(c.dataset.day,10));
  });
  document.getElementById('mnf-days').value = days.join(',');
}

function editModuleSchedule(id){
  moduleNotiEditId = id;
  renderModuleNotiPanel();
}

function cancelModuleScheduleEdit(){
  moduleNotiEditId = null;
  renderModuleNotiPanel();
}

function toggleModuleSchedule(id){
  const s = getState();
  const mod = s.cfg.moduleNoti[moduleNotiPanelKey];
  const sch = mod.schedules.find(x=>x.id===id);
  if(sch){ sch.enabled = !sch.enabled; }
  syncModuleNotiToLegacy(s.cfg);
  saveState(s);
  renderModuleNotiPanel();
  setupNotifications();
  updateModuleNotiBells();
}

function removeModuleSchedule(id){
  if(!confirm('Xóa lịch nhắc này?')) return;
  const s = getState();
  const mod = s.cfg.moduleNoti[moduleNotiPanelKey];
  mod.schedules = mod.schedules.filter(x=>x.id!==id);
  if(moduleNotiEditId===id) moduleNotiEditId = null;
  syncModuleNotiToLegacy(s.cfg);
  saveState(s);
  renderModuleNotiPanel();
  setupNotifications();
  updateModuleNotiBells();
}

function saveModuleSchedule(){
  const key = moduleNotiPanelKey;
  if(!key) return;
  const name = document.getElementById('mnf-name').value.trim();
  const time = document.getElementById('mnf-time').value;
  if(!name){ showToast('Nhập tên thông báo!','error'); return; }
  if(!time){ showToast('Chọn giờ nhắc!','error'); return; }
  const daysStr = document.getElementById('mnf-days').value;
  let days = daysStr ? daysStr.split(',').map(Number).filter(n=>!isNaN(n)) : [];
  if(!days.length){ showToast('Chọn ít nhất 1 ngày trong tuần!','error'); return; }
  const message = document.getElementById('mnf-message').value.trim();
  const enabled = document.getElementById('mnf-enabled-tog').classList.contains('on');
  const s = getState();
  ensureModuleNoti(s.cfg);
  const mod = s.cfg.moduleNoti[key];
  if(moduleNotiEditId){
    const sch = mod.schedules.find(x=>x.id===moduleNotiEditId);
    if(sch){ Object.assign(sch,{name,time,days,message,enabled}); }
  } else {
    mod.schedules.push({ id:notiId(), name, time, days, message, enabled });
  }
  moduleNotiEditId = null;
  syncModuleNotiToLegacy(s.cfg);
  saveState(s);
  renderModuleNotiPanel();
  setupNotifications();
  updateModuleNotiBells();
  showToast('Đã lưu lịch nhắc!','success');
}

function toggleTaskDueReminder(){
  const s = getState();
  const mod = s.cfg.moduleNoti.task;
  mod.dueReminderEnabled = !mod.dueReminderEnabled;
  saveState(s);
  renderModuleNotiPanel();
  setupNotifications();
  updateModuleNotiBells();
}

function setTaskDueBefore(min){
  const s = getState();
  s.cfg.moduleNoti.task.dueBeforeMin = min;
  saveState(s);
  renderModuleNotiPanel();
  setupNotifications();
}

function buildModuleNotiMessage(moduleKey, sch, cfg){
  const tpl = (sch&&sch.message&&sch.message.trim()) || DEFAULT_NOTI_MESSAGES[moduleKey] || 'Nhắc nhở - {name}';
  const name = cfg.name||'Bạn';
  const daily = fmtFull(getDailyTarget());
  return tpl.replace(/\{name\}/g,name).replace(/\{daily\}/g,daily);
}

function fireModuleSchedule(moduleKey, sch){
  const s = getState();
  const cfg = s.cfg;
  const today = localDateKey(new Date());
  const slotKey = `mod_${moduleKey}_${sch.id}_${today}_${sch.time}`;
  if(notiWasSent(slotKey)) return;
  const msg = buildModuleNotiMessage(moduleKey, sch, cfg);
  const title = MODULE_NOTI_LABELS[moduleKey]||'App Cá Nhân';
  if(moduleKey==='task') checkOverdueTasks();
  notifyUser(title, msg, 'info');
  sendTelegram(msg, { showError: false });
  markNotiSent(slotKey);
}

// ============================================================
// NOTIFICATIONS
// ============================================================
function requestNotiPermission(){
  if('Notification' in window && Notification.permission==='default'){
    Notification.requestPermission();
  }
}

function notifyUser(title, msg, type='info'){
  showToast(msg, type);
  if('Notification' in window && Notification.permission==='granted'){
    try{ new Notification(title, { body: msg }); }catch(e){}
  }
}

function msUntilNextWeeklySlot(timeStr, days){
  const [h,m] = timeStr.split(':').map(Number);
  const now = new Date();
  const allowed = Array.isArray(days)&&days.length ? days : [0,1,2,3,4,5,6];
  for(let add=0; add<8; add++){
    const d = new Date(now);
    d.setDate(d.getDate()+add);
    d.setHours(h,m,0,0);
    if(allowed.includes(d.getDay()) && d>now) return d-now;
  }
  return 86400000;
}

function scheduleWeeklyNoti(timeStr, days, callback){
  function arm(){
    const ms = msUntilNextWeeklySlot(timeStr, days);
    const t = setTimeout(()=>{
      callback();
      arm();
    }, ms);
    notiTimers.push(t);
  }
  arm();
}

function scheduleTaskDueReminders(){
  const s = getState();
  ensureModuleNoti(s.cfg);
  const mod = s.cfg.moduleNoti.task;
  if(!mod.dueReminderEnabled) return;
  const beforeMin = mod.dueBeforeMin===60 ? 60 : 15;
  const today = localDateKey(new Date());
  const now = new Date();
  (s.tasks||[]).forEach((t,idx)=>{
    if(t.done||!t.due||t.due!==today||!t.dueTime) return;
    const [h,m] = t.dueTime.split(':').map(Number);
    if(isNaN(h)) return;
    const dueAt = new Date(now);
    dueAt.setHours(h,m,0,0);
    const fireAt = new Date(dueAt.getTime()-beforeMin*60000);
    if(fireAt<=now) return;
    const slotKey = `taskdue_${t.createdAt||idx}_${today}_${t.dueTime}_${beforeMin}`;
    const ms = fireAt-now;
    const timer = setTimeout(()=>{
      if(notiWasSent(slotKey)) return;
      const msg = `⚡ Sắp đến hạn: ${t.name} lúc ${t.dueTime}`;
      notifyUser('Công việc', msg, 'info');
      sendTelegram(msg);
      markNotiSent(slotKey);
    }, ms);
    notiTimers.push(timer);
  });
}

function setupNotifications(){
  notiTimers.forEach(t=>clearTimeout(t));
  notiTimers = [];
  if(getGsUrl() && versionCheckReady && !isTelegramVersionActive()){
    updateModuleNotiBells();
    return;
  }
  const s = getState();
  const cfg = s.cfg;
  ensureModuleNoti(cfg);
  syncModuleNotiToLegacy(cfg);

  MODULE_NOTI_KEYS.forEach(moduleKey=>{
    const mod = cfg.moduleNoti[moduleKey];
    (mod.schedules||[]).forEach(sch=>{
      if(!sch.enabled||!sch.time) return;
      scheduleWeeklyNoti(sch.time, sch.days, ()=> fireModuleSchedule(moduleKey, sch));
    });
  });

  scheduleTaskDueReminders();
  updateModuleNotiBells();
}

function getDailyTarget(){
  const s = getState();
  const goal = parseFloat(s.cfg.goalAmount)||0;
  const goalYear = parseInt(s.cfg.goalYear)||new Date().getFullYear();
  const now = new Date();
  const daysLeft = Math.max(1, Math.ceil((new Date(goalYear,11,31)-now)/86400000));
  return Math.ceil(goal/daysLeft);
}

function checkOverdueTasks(){
  const s = getState();
  const today = new Date().toISOString().split('T')[0];
  const overdue = (s.tasks||[]).filter(t=>!t.done && t.due && t.due<=today);
  if(overdue.length>0){
    const msg = `⚠️ Bạn có ${overdue.length} việc cần xử lý gấp: ${overdue.map(t=>t.name).join(', ')}`;
    notifyUser('App Cá Nhân', msg, 'error');
    sendTelegram(msg);
  }
}

// ============================================================
// ACTIVE VERSION (Config sheet B4)
// ============================================================
let sheetActiveVersion = null;
let versionCheckReady = false;
let versionWatchTimer = null;

async function fetchSheetActiveVersion(){
  if(!getGsUrl()) return null;
  try{
    const data = await gsApiGet({ action:'getActiveVersion' });
    if(data.status==='ok') return String(data.activeVersion||'').trim();
    if(data.error==='Unknown action'){
      return null;
    }
  }catch(e){ console.warn('getActiveVersion', e); }
  return null;
}

/** Gọi Apps Script ghi Config B4 — POST, fallback GET nếu bản deploy cũ */
async function syncActiveVersionToSheet(){
  if(!getGsUrl()) return { ok:false, error:'Chưa cấu hình Google Sheets URL.' };
  let data = null;
  let lastErr = '';
  try{
    data = await gsApiPost({ action:'setActiveVersion', version: APP_VERSION });
  }catch(e){
    lastErr = e.message||String(e);
    try{
      data = await gsApiGet({ action:'setActiveVersion', version: APP_VERSION });
    }catch(e2){
      return { ok:false, error: lastErr || (e2.message||'Không kết nối được server') };
    }
  }
  if(!data){
    return { ok:false, error:'Server không trả dữ liệu.' };
  }
  if(data.status==='ok'){
    sheetActiveVersion = String(data.activeVersion||APP_VERSION).trim();
    versionCheckReady = true;
    updateVersionDisplay();
    return { ok:true };
  }
  const err = data.error || '';
  if(err==='Unknown action' || (typeof data.error==='string' && data.error.includes('Unknown'))){
    return {
      ok:false,
      error:'Web App chưa có setActiveVersion — cần dán code Apps Script mới và Deploy lại (New deployment).'
    };
  }
  return { ok:false, error: err || JSON.stringify(data) };
}

async function checkVersionApiReady(){
  try{
    const data = await gsApiGet({ action:'getActiveVersion' });
    return data.status==='ok';
  }catch(e){
    return false;
  }
}

async function refreshActiveVersionCheck(){
  sheetActiveVersion = await fetchSheetActiveVersion();
  versionCheckReady = true;
  updateVersionDisplay();
}

function isTelegramVersionActive(){
  if(!getGsUrl()) return true;
  if(!versionCheckReady) return false;
  const active = sheetActiveVersion==null ? '' : String(sheetActiveVersion).trim();
  if(!active) return false;
  return active === APP_VERSION;
}

function updateVersionDisplay(){
  const el = document.getElementById('active-version-display');
  const btn = document.getElementById('btn-activate-version');
  if(!el) return;
  if(!getGsUrl()){
    el.innerHTML = `<div>Phiên bản file này: <strong style="color:var(--accent);">${esc(APP_VERSION)}</strong></div>
      <div style="margin-top:6px;font-size:12px;">Chưa cấu hình Google Sheets URL.</div>`;
    if(btn) btn.disabled = true;
    applyVersionInactiveBanner();
    return;
  }
  if(!versionCheckReady){
    el.textContent = 'Đang đọc bản đang active trên Sheet…';
    return;
  }
  const sheetV = sheetActiveVersion==null ? '—' : esc(sheetActiveVersion);
  const match = isTelegramVersionActive();
  if(btn){
    btn.disabled = false;
    btn.textContent = match ? '✅ Đang là bản active (Telegram đã gắn)' : '✅ Chốt dùng bản này (gán Telegram)';
    btn.className = match ? 'btn btn-ghost btn-sm' : 'btn btn-primary btn-sm';
  }
  el.innerHTML = `
    <div>File HTML này: <strong style="color:var(--accent);font-family:var(--mono);">${esc(APP_VERSION)}</strong></div>
    <div style="margin-top:6px;">Đang chốt trên Sheet (Config B4): <strong style="font-family:var(--mono);">${sheetV}</strong></div>
    <div style="margin-top:8px;padding:8px 10px;border-radius:8px;font-size:12px;background:${match?'rgba(46,213,115,.12)':'rgba(255,107,107,.12)'};color:${match?'var(--accent3)':'var(--accent5)'};">
      ${match
        ? '✅ Bản này đang được dùng — Telegram chỉ hoạt động trên file này.'
        : `⛔ Bản thừa — Telegram đã ngắt. ${sheetV!=='—' ? 'Bản <strong>'+sheetV+'</strong> đang giữ bot.' : 'Chưa chốt bản nào — nhấn nút bên dưới.'}`}
    </div>`;
  applyVersionInactiveBanner();
}

function applyVersionInactiveBanner(){
  const banner = document.getElementById('version-inactive-banner');
  const label = document.getElementById('version-banner-active');
  if(!banner) return;
  const show = getGsUrl() && versionCheckReady && !isTelegramVersionActive();
  banner.classList.toggle('hidden', !show);
  if(label) label.textContent = sheetActiveVersion || '—';
}

async function activateThisAppVersion(){
  if(!getGsUrl()){
    showToast('Cần cấu hình Google Sheets URL trước!','error');
    return;
  }
  const cur = sheetActiveVersion;
  let msg = `Chốt dùng bản ${APP_VERSION}?\n\n• Telegram Bot chỉ nhắc qua file HTML này.\n• Các file cũ / bản sao khác sẽ NGẮT Telegram (dù vẫn mở trình duyệt).`;
  if(cur && cur !== APP_VERSION){
    msg += `\n\nBản "${cur}" sẽ bị ngắt hoàn toàn.`;
  }
  if(!confirm(msg)) return;
  const result = await syncActiveVersionToSheet();
  if(result.ok){
    showToast(`Đã chốt bản ${APP_VERSION} — Telegram chỉ còn trên file này.`,'success');
    setupNotifications();
    applyVersionInactiveBanner();
    updateVersionDisplay();
    updateTelegramDiagnostics();
    const n = countEnabledNotiSchedules();
    if(n===0){
      showToast('Chưa có lịch nhắc bật. Bấm 🔔 trên mục hoặc "Nhắc thử sau 2 phút".','info');
    }
  }else{
    const hint = result.error || 'Lỗi không xác định';
    showToast('Không ghi Config B4: '+hint,'error');
    if(hint.includes('setActiveVersion') || hint.includes('Unknown')){
      alert(
        'Cách sửa nhanh:\n\n'+
        '1. Mở Google Sheet → Extensions → Apps Script\n'+
        '2. Dán code từ file App Mới/appsscript.js\n'+
        '3. Deploy → New deployment → Web app → Anyone\n'+
        '4. Copy URL mới vào Cài đặt → Google Sheets URL\n'+
        '5. Chạy setupSheets() một lần (tạo Config A4/B4)\n\n'+
        'Tạm thời: gõ tay '+APP_VERSION+' vào tab Config, ô B4.'
      );
    }
  }
}

function startVersionWatch(){
  if(versionWatchTimer) clearInterval(versionWatchTimer);
  if(!getGsUrl()) return;
  versionWatchTimer = setInterval(async ()=>{
    const prev = sheetActiveVersion;
    await refreshActiveVersionCheck();
    if(prev !== sheetActiveVersion){
      setupNotifications();
    }
  }, 60000);
}

async function initVersionControl(){
  if(!getGsUrl()){
    versionCheckReady = true;
    sheetActiveVersion = null;
    updateVersionDisplay();
    return;
  }
  await refreshActiveVersionCheck();
  startVersionWatch();
}

// ============================================================
// TELEGRAM
// ============================================================
function countEnabledNotiSchedules(){
  const s = getState();
  ensureModuleNoti(s.cfg);
  let n = 0;
  MODULE_NOTI_KEYS.forEach(k=>{
    n += (s.cfg.moduleNoti[k].schedules||[]).filter(sch=>sch.enabled).length;
  });
  return n;
}

function updateTelegramDiagnostics(){
  const el = document.getElementById('tg-diagnostics');
  if(!el) return;
  const s = getState();
  const token = !!(s.cfg?.tgToken&&String(s.cfg.tgToken).trim());
  const chat = !!(s.cfg?.tgChatId&&String(s.cfg.tgChatId).trim());
  const verOk = isTelegramVersionActive();
  const sched = countEnabledNotiSchedules();
  const logged = !!getActiveUsername();
  el.innerHTML = `
    <div><strong>Kiểm tra Telegram</strong></div>
    <div style="margin-top:6px;">${logged?'✅':'❌'} Đã đăng nhập</div>
    <div>${token?'✅':'❌'} Bot Token (Cài đặt)</div>
    <div>${chat?'✅':'❌'} Chat ID (Cài đặt)</div>
    <div>${verOk?'✅':'❌'} Đã chốt bản <code>${esc(APP_VERSION)}</code> (Config B4 = ${esc(sheetActiveVersion||'—')})</div>
    <div>${sched>0?'✅':'❌'} Lịch nhắc đang bật: <strong>${sched}</strong> (cần 🔔 hoặc toggle bên dưới)</div>
    <div style="margin-top:8px;font-size:11px;color:var(--text3);">Nhắc khi <strong>đóng app</strong>: <code>runScheduledNotifications</code> mỗi 1 phút (chạy <code>setupTriggers()</code> một lần). Giờ nhắc do bạn cài 🔔 trong app.</div>`;
}

function normalizeTelegramToken(raw){
  return String(raw||'').trim().replace(/\s+/g,'');
}

function normalizeTelegramChatId(raw){
  let s = String(raw||'').trim();
  if(!s) return '';
  s = s.replace(/[\u00a0\u202f]/g,' ').replace(/\s+/g,'');
  s = s.replace(/^chat[_\s-]*id\s*[:=]\s*/i,'').replace(/^id\s*[:=]\s*/i,'');
  s = s.replace(/^["']|["']$/g,'');
  const m = s.match(/^-?\d{5,20}$/);
  if(m) return m[0];
  if(/^@/.test(s)) return s;
  const digits = s.replace(/[^\d-]/g,'');
  const m2 = digits.match(/^-?\d{5,20}$/);
  return m2 ? m2[0] : s;
}

function telegramErrorHint(desc){
  const d = String(desc||'').toLowerCase();
  if(d.includes('chat not found')){
    return 'Chat ID sai hoặc bot chưa được nhắn. Mở Telegram → đúng bot của Token → gửi /start → bấm «Lấy Chat ID từ bot» → Gửi tin thử. Nhóm: thêm bot, dùng ID -100…';
  }
  if(d.includes('bot was blocked')){
    return 'Bạn đã chặn bot. Mở lại bot trong Telegram → Bỏ chặn → /start.';
  }
  if(d.includes('unauthorized')||d.includes('not found')&&d.includes('token')){
    return 'Bot Token sai. Lấy token mới từ @BotFather.';
  }
  if(d.includes('group chat was upgraded')){
    return 'Nhóm đã nâng cấp supergroup — lấy Chat ID mới (bấm «Lấy Chat ID từ bot» trong nhóm).';
  }
  return desc || 'Lỗi Telegram';
}

async function discoverTelegramChatId(){
  const token = normalizeTelegramToken(document.getElementById('cfg-tg-token').value);
  if(!token){ showToast('Nhập Bot Token trước!','error'); return; }
  showToast('Đang lấy Chat ID từ Telegram…','');
  try{
    const res = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/getUpdates?limit=25`);
    const data = await res.json().catch(()=>({}));
    if(!data.ok){
      showToast('Bot lỗi: '+telegramErrorHint(data.description),'error');
      return;
    }
    const list = data.result||[];
    if(!list.length){
      showToast('Chưa có tin nhắn. Mở Telegram → tìm ĐÚNG bot → gửi /start → bấm lại «Lấy Chat ID».','error');
      return;
    }
    const chats = new Map();
    [...list].reverse().forEach(u=>{
      const c = (u.message&&u.message.chat)||(u.my_chat_member&&u.my_chat_member.chat)||(u.channel_post&&u.channel_post.chat);
      if(c&&c.id!=null) chats.set(String(c.id), c);
    });
    if(!chats.size){
      showToast('Không đọc được chat. Gửi /start cho bot rồi thử lại.','error');
      return;
    }
    const arr = Array.from(chats.values());
    const pick = arr[0];
    const id = String(pick.id);
    document.getElementById('cfg-tg-chatid').value = id;
    saveCfg();
    const label = pick.title||[pick.first_name,pick.last_name].filter(Boolean).join(' ')||pick.username||'chat';
    showToast(`Đã điền Chat ID: ${id} (${label}, ${pick.type||'?'}). Bấm Gửi tin thử.`,'success');
    if(arr.length>1) console.info('Telegram — nhiều chat:', arr.map(c=>`${c.id} ${c.type} ${c.title||c.first_name||c.username}`));
  }catch(e){
    showToast('Không kết nối Telegram: '+e.message,'error');
  }
}

async function sendTelegram(text, opts){
  const s = getState();
  const token = normalizeTelegramToken(s.cfg.tgToken);
  const chatId = normalizeTelegramChatId(s.cfg.tgChatId);
  if(!token||!chatId){
    if(opts?.showError) showToast('Chưa có Bot Token hoặc Chat ID trong Cài đặt!','error');
    return false;
  }
  if(/^@/.test(chatId)){
    if(opts?.showError) showToast('Chat ID phải là số (vd 123456789), không phải @username. Dùng «Lấy Chat ID từ bot».','error');
    return false;
  }
  if(!opts?.skipVersionCheck && !isTelegramVersionActive()){
    if(opts?.showError){
      showToast(`Telegram tắt: file ${APP_VERSION} ≠ B4 (${sheetActiveVersion||'—'}). Chốt lại bản này.`,'error');
      updateVersionDisplay();
    }
    return false;
  }
  try{
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ chat_id: chatId, text: String(text) })
    });
    const data = await res.json().catch(()=>({}));
    if(!data.ok){
      const err = data.description || ('HTTP '+res.status);
      console.error('Telegram API', data);
      if(opts?.showError) showToast('Telegram: '+telegramErrorHint(err),'error');
      return false;
    }
    return true;
  }catch(e){
    console.error('Telegram error', e);
    if(opts?.showError) showToast('Không gửi được Telegram: '+e.message,'error');
    return false;
  }
}

async function testTelegram(){
  updateTelegramDiagnostics();
  if(!getActiveUsername()){
    showToast('Hãy đăng nhập trước!','error');
    return;
  }
  if(!isTelegramVersionActive()){
    showToast(`Chưa chốt bản ${APP_VERSION} (B4 hiện: ${sheetActiveVersion||'—'}).`,'error');
    updateVersionDisplay();
    return;
  }
  const s = getState();
  const name = s.cfg.name||'Bạn';
  const ok = await sendTelegram(`👋 Test từ App Cá Nhân (${APP_VERSION})\nXin chào ${name}! Nếu thấy tin này là Telegram OK ✅`, { showError: true });
  if(ok){
    showToast('Đã gửi tin thử — kiểm tra Telegram!','success');
    queueSync();
  }
}

function quickTestNotiSchedule(){
  if(!getActiveUsername()){ showToast('Hãy đăng nhập!','error'); return; }
  if(!isTelegramVersionActive()){ showToast('Chốt bản này trước (Phiên bản Active).','error'); return; }
  const s = getState();
  if(!s.cfg.tgToken||!s.cfg.tgChatId){ showToast('Nhập Bot Token + Chat ID rồi Lưu (đổi ô là tự lưu).','error'); return; }
  ensureModuleNoti(s.cfg);
  const t = new Date();
  t.setMinutes(t.getMinutes()+2);
  const time = `${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;
  s.cfg.moduleNoti.expense.schedules.push({
    id: notiId(),
    name: 'Test nhắc Telegram',
    time,
    days: [0,1,2,3,4,5,6],
    message: '🧪 Nhắc thử Telegram — {name}',
    enabled: true
  });
  saveState(s);
  setupNotifications();
  updateTelegramDiagnostics();
  showToast(`Sẽ nhắc lúc ${time} (giữ tab app mở 2 phút, hoặc dùng Apps Script khi đóng app).`,'success');
}

// ============================================================
// GOOGLE SHEETS SYNC
// ============================================================
let syncTimeout = null;
let syncInProgress = false;

function setSyncStatus(mode, text){
  const dot=document.getElementById('syncDot');
  const lbl=document.getElementById('syncLabel');
  if(lbl && text!=null) lbl.textContent=text;
  if(!dot) return;
  dot.classList.remove('syncing');
  if(mode==='saving'){
    dot.classList.add('syncing');
    dot.style.background='var(--accent4)';
  }else if(mode==='saved'){
    dot.style.background='var(--accent3)';
  }else if(mode==='error'){
    dot.style.background='var(--accent5)';
  }else{
    dot.style.background='var(--accent3)';
  }
}

function queueSync(){
  if(!getGsUrl()) return;
  clearTimeout(syncTimeout);
  syncTimeout=setTimeout(()=>syncNow({silent:true}),3000);
}

async function syncPullOnOpen(){
  const u=getActiveUsername();
  if(!u||!getGsUrl()) return;
  await syncNow({silent:true, pullOnly:true});
}

async function syncNow(opts){
  const silent=!!(opts&&opts.silent);
  const pullOnly=!!(opts&&opts.pullOnly);
  const u=getActiveUsername();
  const gsUrl=getGsUrl();
  if(!gsUrl){
    if(!silent) showToast('Chưa cấu hình Google Sheets URL!','error');
    return;
  }
  if(!u){
    if(!silent) showToast('Chưa đăng nhập!','error');
    return;
  }
  if(syncInProgress){
    if(silent) queueSync();
    return;
  }
  syncInProgress=true;
  setSyncStatus('saving', pullOnly ? 'Đang tải dữ liệu…' : 'Đang lưu…');
  try{
    const s=getState();
    if(!pullOnly){
      await fetch(gsUrl,{
        method:'POST',
        body:JSON.stringify({action:'save', username:u, data:s})
      });
    }
    const getRes=await fetch(gsUrl+'?action=load&username='+encodeURIComponent(u));
    if(!getRes.ok) throw new Error('network');
    const remote=await getRes.json();
    if(remote&&remote.data){
      const merged=mergeData(getState(), remote.data);
      localStorage.setItem(userDataKey(u), JSON.stringify(merged));
      refreshCurrentTab();
      updateGreeting();
      applyTheme(getTheme());
      applySidebarProfile(getTheme());
      setupNotifications();
      updateModuleNotiBells();
      await refreshActiveVersionCheck();
    }
    setSyncStatus('saved','Đã lưu ✅');
    if(!silent) showToast('Đã đồng bộ Google Sheets!','success');
  }catch(e){
    if(!silent){
      setSyncStatus('error','Lỗi sync');
      showToast('Lỗi đồng bộ: '+e.message,'error');
    }
  }finally{
    syncInProgress=false;
  }
}

function mergeEntries(arr1, arr2){
  const map = new Map();
  [...(arr1||[]), ...(arr2||[])].forEach(e=>{
    if(!e||!e.name) return;
    const k = e.name.trim().toLowerCase();
    const prev = map.get(k);
    map.set(k, prev ? {name:e.name, amount:Math.max(prev.amount||0, e.amount||0)} : {name:e.name, amount:e.amount||0});
  });
  return Array.from(map.values());
}

function mergeMonthData(a, b){
  const empty = {income:[],fixed:[],living:[],saving:[],note:''};
  if(!a) return b ? {...empty,...b} : {...empty};
  if(!b) return {...empty,...a};
  return {
    income: mergeEntries(a.income, b.income),
    fixed: mergeEntries(a.fixed, b.fixed),
    living: mergeEntries(a.living, b.living),
    saving: mergeEntries(a.saving, b.saving),
    note: b.note || a.note || ''
  };
}

function mergeTasks(local, remote){
  const map = new Map();
  [...(local||[]), ...(remote||[])].forEach(t=>{
    const key = t.createdAt || `${(t.name||'').trim()}_${t.due||''}`;
    if(!map.has(key)) map.set(key, {...t});
    else {
      const a = map.get(key), b = t;
      map.set(key, {
        ...a, ...b,
        done: a.done || b.done,
        progress: Math.max(a.progress||0, b.progress||0),
        target: Math.max(a.target||0, b.target||0),
        due: b.due || a.due,
        dueTime: b.dueTime || a.dueTime
      });
    }
  });
  return Array.from(map.values());
}

function mergeData(local, remote){
  const months = {...(local.months||{})};
  Object.keys(remote.months||{}).forEach(k=>{
    months[k] = mergeMonthData(months[k], remote.months[k]);
  });
  const savedDays = {...(local.savings?.savedDays||{}), ...(remote.savings?.savedDays||{})};
  Object.keys(savedDays).forEach(k=>{ if(!savedDays[k]) delete savedDays[k]; });
  const journeysMap=new Map();
  [...(local.journeys||[]), ...(remote.journeys||[])].forEach(j=>{
    if(!j||!j.id) return;
    if(!journeysMap.has(j.id)) journeysMap.set(j.id,{...j,completedDays:{...(j.completedDays||{})}});
    else{
      const a=journeysMap.get(j.id), b=j;
      journeysMap.set(j.id,{...a,...b,completedDays:{...(a.completedDays||{}),...(b.completedDays||{})}});
    }
  });
  journeysMap.forEach(j=>{ Object.keys(j.completedDays).forEach(k=>{ if(!j.completedDays[k]) delete j.completedDays[k]; }); });
  return {
    months,
    tasks: mergeTasks(local.tasks, remote.tasks),
    savings: {...(local.savings||{}), ...(remote.savings||{}), savedDays},
    journeys: Array.from(journeysMap.values()),
    pomodoro: {daily:{...(local.pomodoro?.daily||{}), ...(remote.pomodoro?.daily||{})}},
    spendDaily: {...(local.spendDaily||{}), ...(remote.spendDaily||{})},
    spendLimitMonthly: {...(local.spendLimitMonthly||{}), ...(remote.spendLimitMonthly||{})},
    spendNoti: {...(local.spendNoti||{}), ...(remote.spendNoti||{})},
    cfg: mergeCfgMultiDevice(local.cfg, remote.cfg, local.stateUpdatedAt, remote.stateUpdatedAt),
    notiSent: {...(local.notiSent||{}), ...(remote.notiSent||{})},
    stateUpdatedAt: (remote.stateUpdatedAt||'') >= (local.stateUpdatedAt||'') ? (remote.stateUpdatedAt||local.stateUpdatedAt) : local.stateUpdatedAt
  };
}

function mergeCfgMultiDevice(local, remote, localAt, remoteAt){
  const lc = local||{}, rc = remote||{};
  const pick = (preferRemote)=>{
    if(preferRemote) return {...lc, ...rc};
    return {...rc, ...lc};
  };
  const newerRemote = (remoteAt||'') > (localAt||'');
  const base = pick(newerRemote);
  return {
    ...base,
    gsUrl: GS_WEBAPP_URL,
    tgToken: rc.tgToken || lc.tgToken || '',
    tgChatId: rc.tgChatId || lc.tgChatId || '',
    noti: {
      expense: !!(lc.noti?.expense || rc.noti?.expense),
      task: !!(lc.noti?.task || rc.noti?.task),
      savings: !!(lc.noti?.savings || rc.noti?.savings)
    },
    notiTimes: {
      expense: [...new Set([...(lc.notiTimes?.expense||[]), ...(rc.notiTimes?.expense||[])])],
      task: [...new Set([...(lc.notiTimes?.task||[]), ...(rc.notiTimes?.task||[])])],
      savings: [...new Set([...(lc.notiTimes?.savings||[]), ...(rc.notiTimes?.savings||[])])]
    },
    moduleNoti: mergeModuleNoti(lc.moduleNoti, rc.moduleNoti)
  };
}

function mergeModuleNoti(a, b){
  const out = {};
  MODULE_NOTI_KEYS.forEach(k=>{
    const la = a&&a[k], lb = b&&b[k];
    const map = new Map();
    [...(la?.schedules||[]), ...(lb?.schedules||[])].forEach(sch=>{
      if(!sch||!sch.id) return;
      const prev = map.get(sch.id);
      map.set(sch.id, prev ? {...prev, ...sch, enabled: prev.enabled||sch.enabled} : {...sch});
    });
    out[k] = {
      schedules: Array.from(map.values()),
      dueReminderEnabled: (la?.dueReminderEnabled!==false) || (lb?.dueReminderEnabled!==false),
      dueBeforeMin: (la?.dueBeforeMin===60 || lb?.dueBeforeMin===60) ? 60 : (la?.dueBeforeMin||lb?.dueBeforeMin||15)
    };
  });
  return out;
}

async function testConnection(){
  const url = getGsUrl();
  if(!url){ showToast('Chưa có GS_WEBAPP_URL trong config.js!','error'); return; }
  const status = document.getElementById('conn-status');
  status.textContent = 'Đang kiểm tra...';
  try{
    const res = await fetch(url+'?action=ping');
    const data = await res.json();
    if(data.status!=='ok'){
      status.innerHTML = '<span style="color:var(--accent5)">❌ Phản hồi ping không hợp lệ</span>';
      updateBackendInfo();
      return;
    }
    updateBackendInfo({
      ok:true,
      spreadsheetName: data.spreadsheetName,
      spreadsheetId: data.spreadsheetId
    });
    let verLine = '';
    try{
      const ver = await gsApiGet({ action:'getActiveVersion' });
      if(ver.status==='ok'){
        verLine = `<br><span style="color:var(--accent3)">✅ Active Version (Config B4) = "${esc(ver.activeVersion||'')}.</span>`;
      }else if(ver.error){
        verLine = `<br><span style="color:var(--accent5)">⚠️ Chạy setupSheets() và deploy lại Apps Script.</span>`;
      }
    }catch(e2){
      verLine = `<br><span style="color:var(--accent5)">⚠️ Không gọi được getActiveVersion.</span>`;
    }
    status.innerHTML = '<span style="color:var(--accent3)">✅ Kết nối Sheet backend OK!</span>'+verLine;
    await refreshActiveVersionCheck();
    const s = getState();
    pinBackendUrl(s.cfg);
    saveState(s);
  }catch(e){
    status.innerHTML = `<span style="color:var(--accent5)">❌ Lỗi: ${esc(e.message)}</span>`;
    updateBackendInfo();
  }
}

// ============================================================
// MODAL
// ============================================================
function closeModal(id){
  document.getElementById(id).classList.add('hidden');
}
// Close on overlay click
document.querySelectorAll('.modal-overlay').forEach(el=>{
  el.addEventListener('click',function(e){
    if(e.target===this) this.classList.add('hidden');
  });
});
document.addEventListener('keydown', e=>{
  if(e.key==='Escape'){
    document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(m=>m.classList.add('hidden'));
  }
});

// ============================================================
// TOAST
// ============================================================
function showToast(msg, type='info'){
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${type==='success'?'✅':type==='error'?'❌':'ℹ️'}</span><span>${msg}</span>`;
  c.appendChild(t);
  setTimeout(()=>{
    t.style.animation = 'fadeOut .3s ease forwards';
    setTimeout(()=>t.remove(),300);
  }, 3500);
}

// ============================================================
// THEME (lifeos_theme)
// ============================================================
const DEFAULT_ACCENT = '#4f9eff';
const DEFAULT_THEME = {
  preset:'dark', accent:DEFAULT_ACCENT, bgImage:null, bgOverlay:40,
  font:'default', radius:16, avatar:null, displayName:'', greeting:''
};
const THEME_PRESETS = {
  dark:{bg:'#0a0e1a',bg2:'#111827',bg3:'#1a2235',card:'#141c2e',card2:'#1e2a40',border:'rgba(99,179,255,0.12)',text:'#e8eef8',text2:'#8fa3c0',text3:'#4a5f7a',accent2:'#7c3aed'},
  light:{bg:'#eef2f7',bg2:'#ffffff',bg3:'#e2e8f0',card:'#ffffff',card2:'#f8fafc',border:'rgba(0,0,0,0.08)',text:'#0f172a',text2:'#475569',text3:'#94a3b8',accent2:'#6366f1'},
  midnight:{bg:'#050510',bg2:'#0c0c1d',bg3:'#12122a',card:'#0f0f24',card2:'#161633',border:'rgba(129,140,248,0.15)',text:'#e0e7ff',text2:'#a5b4fc',text3:'#6366f1',accent2:'#818cf8'},
  forest:{bg:'#0a120e',bg2:'#111f17',bg3:'#1a2e22',card:'#142018',card2:'#1c2e24',border:'rgba(52,211,153,0.12)',text:'#e8f5e9',text2:'#86efac',text3:'#4ade80',accent2:'#22c55e'},
  ocean:{bg:'#061018',bg2:'#0c1a24',bg3:'#122535',card:'#0f1e2d',card2:'#152a3d',border:'rgba(56,189,248,0.12)',text:'#e0f2fe',text2:'#7dd3fc',text3:'#38bdf8',accent2:'#0ea5e9'}
};
const THEME_FONTS = {
  default:{family:"'Sora', sans-serif",url:''},
  roboto:{family:"'Roboto', sans-serif",url:'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;600;700&display=swap'},
  playfair:{family:"'Playfair Display', serif",url:'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&display=swap'},
  spacemono:{family:"'Space Mono', monospace",url:'https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap'},
  nunito:{family:"'Nunito', sans-serif",url:'https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700&display=swap'}
};
const THEME_PREVIEW_COLORS = {dark:['#0a0e1a','#141c2e','#4f9eff'],light:['#eef2f7','#ffffff','#4f9eff'],midnight:['#050510','#0f0f24','#818cf8'],forest:['#0a120e','#142018','#22c55e'],ocean:['#061018','#0f1e2d','#0ea5e9']};

function loadThemeStore(){
  const u=getActiveUsername();
  if(!u) return null;
  try{ const r=localStorage.getItem(userThemeKey(u)); return r?JSON.parse(r):null; }catch(e){ return null; }
}
function saveThemeStore(t){
  const u=getActiveUsername();
  if(!u) return;
  localStorage.setItem(userThemeKey(u), JSON.stringify(t));
  queueSync();
}
function getTheme(){ return {...DEFAULT_THEME, ...loadThemeStore()}; }
function patchTheme(partial){
  const t={...getTheme(),...partial};
  saveThemeStore(t);
  applyTheme(t);
  return t;
}

function applyPresetVars(preset){
  const p=THEME_PRESETS[preset]||THEME_PRESETS.dark;
  const root=document.documentElement;
  root.style.setProperty('--bg',p.bg);
  root.style.setProperty('--bg2',p.bg2);
  root.style.setProperty('--bg3',p.bg3);
  root.style.setProperty('--card',p.card);
  root.style.setProperty('--card2',p.card2);
  root.style.setProperty('--border',p.border);
  root.style.setProperty('--text',p.text);
  root.style.setProperty('--text2',p.text2);
  root.style.setProperty('--text3',p.text3);
  root.style.setProperty('--accent2',p.accent2);
}

function loadThemeFont(key){
  const f=THEME_FONTS[key]||THEME_FONTS.default;
  let link=document.getElementById('themeFontLink');
  if(f.url){
    if(!link){ link=document.createElement('link'); link.id='themeFontLink'; link.rel='stylesheet'; document.head.appendChild(link); }
    link.href=f.url;
  }else if(link){ link.remove(); }
  document.documentElement.style.setProperty('--font', f.family);
}

function applyTheme(t){
  t=t||getTheme();
  applyPresetVars(t.preset==='custom'?'dark':(t.preset||'dark'));
  document.documentElement.style.setProperty('--accent', t.accent||DEFAULT_ACCENT);
  const r=Math.max(0,Math.min(20,parseInt(t.radius,10)||16));
  document.documentElement.style.setProperty('--radius', r+'px');
  document.documentElement.style.setProperty('--radius-sm', Math.max(0,r-6)+'px');
  loadThemeFont(t.font||'default');
  const hasBg=!!t.bgImage;
  document.body.classList.toggle('has-wallpaper', hasBg);
  const bgEl=document.getElementById('appBgImage');
  const ovEl=document.getElementById('appBgOverlay');
  if(bgEl){
    if(hasBg){ bgEl.style.backgroundImage=`url(${t.bgImage})`; bgEl.style.display='block'; }
    else{ bgEl.style.backgroundImage=''; bgEl.style.display='none'; }
  }
  if(ovEl){
    const op=Math.max(0,Math.min(90,parseInt(t.bgOverlay,10)||0))/100;
    ovEl.style.opacity=String(op);
    ovEl.style.display=hasBg?'block':'none';
  }
  applySidebarProfile(t);
  updateGreeting();
}

function applySidebarProfile(t){
  t=t||getTheme();
  const s=getState();
  const acc=getCurrentAccount();
  const name=acc?.displayName||t.displayName||s.cfg?.name||'Bạn';
  const av=document.getElementById('sidebarAvatar');
  const ph=document.getElementById('sidebarAvatarPh');
  const nm=document.getElementById('sidebarProfileName');
  if(nm) nm.textContent=acc?`Xin chào, ${name}!`:name;
  if(t.avatar && av && ph){
    av.src=t.avatar; av.classList.remove('hidden'); ph.style.display='none';
  }else if(av && ph){
    av.classList.add('hidden'); av.src=''; ph.style.display='flex';
  }
}

function updateThemeCustomPreview(){
  const bg=document.getElementById('themeCustomBg');
  if(!bg) return;
  const t=getTheme();
  if(t.bgImage && t.preset==='custom'){
    bg.style.backgroundImage=`url(${t.bgImage})`;
  }else{
    bg.style.backgroundImage='linear-gradient(135deg,var(--bg3),var(--card))';
  }
}

function buildThemeGrid(){
  const grid=document.getElementById('themeGrid');
  if(!grid) return;
  const t=getTheme();
  const cur=t.bgImage?'custom':(t.preset||'dark');
  let html=Object.keys(THEME_PRESETS).map(key=>{
    const cols=THEME_PREVIEW_COLORS[key];
    const lbl=key.charAt(0).toUpperCase()+key.slice(1);
    return `<button type="button" class="theme-preview ${key===cur?'active':''}" data-preset="${key}" onclick="selectThemePreset('${key}')">
      <div class="theme-preview-inner">
        <div class="theme-preview-bar" style="background:${cols[0]}"></div>
        <div class="theme-preview-bar" style="background:${cols[1]};flex:0.6"></div>
        <div class="theme-preview-bar" style="background:${cols[2]};flex:0.25"></div>
        <div class="theme-preview-lbl">${lbl}</div>
      </div>
    </button>`;
  }).join('');
  html+=`<div class="theme-preview theme-preview-upload ${cur==='custom'?'active':''}" id="themeCustomTile">
    <label title="Tải ảnh nền">
      <input type="file" accept="image/*" class="hidden" onchange="uploadThemeImage(event)"/>
      <div class="theme-preview-inner">
        <div class="theme-custom-bg" id="themeCustomBg"></div>
        <div class="theme-preview-lbl">📷 Tùy chỉnh</div>
      </div>
    </label>
  </div>`;
  grid.innerHTML=html;
  updateThemeCustomPreview();
}

function renderGiaoDien(){
  const t=getTheme();
  buildThemeGrid();
  const acc=document.getElementById('gd-accent');
  if(acc) acc.value=t.accent||DEFAULT_ACCENT;
  const ov=document.getElementById('gd-overlay');
  if(ov){ ov.value=t.bgOverlay??40; document.getElementById('gd-overlay-val').textContent=ov.value; }
  const rad=document.getElementById('gd-radius');
  if(rad){ rad.value=t.radius??16; document.getElementById('gd-radius-val').textContent=rad.value; }
  const font=document.getElementById('gd-font');
  if(font) font.value=t.font||'default';
  const s=getState();
  const dn=document.getElementById('gd-display-name');
  if(dn) dn.value=t.displayName||s.cfg?.name||'';
  const gr=document.getElementById('gd-greeting');
  if(gr) gr.value=t.greeting||'';
  const avImg=document.getElementById('gd-avatar-img');
  const avPh=document.getElementById('gd-avatar-ph');
  if(t.avatar && avImg && avPh){
    avImg.src=t.avatar; avImg.classList.remove('hidden'); avPh.style.display='none';
  }else if(avImg && avPh){
    avImg.classList.add('hidden'); avPh.style.display='flex';
  }
  onRadiusChange(t.radius??16, true);
}

function selectThemePreset(key){
  if(key==='custom'){
    document.getElementById('gd-theme-file')?.click();
    return;
  }
  patchTheme({preset:key});
  buildThemeGrid();
  showToast('Đã áp dụng theme '+key+(getTheme().bgImage?' (giữ ảnh nền)':''),'success');
}
function uploadThemeImage(evt){
  const f=evt.target.files[0];
  if(!f) return;
  readImageFile(f, data=>{
    const cur=getTheme();
    patchTheme({bgImage:data, preset:cur.preset==='custom'||!cur.preset?'dark':cur.preset});
    buildThemeGrid();
    showToast('Đã đặt ảnh nền cho toàn app!','success');
    evt.target.value='';
    const tf=document.getElementById('gd-theme-file');
    if(tf) tf.value='';
  });
}
function removeThemeImage(){
  patchTheme({bgImage:null});
  buildThemeGrid();
  showToast('Đã xoá ảnh nền','success');
}
function onAccentPick(val){ patchTheme({accent:val}); }
function resetAccent(){ patchTheme({accent:DEFAULT_ACCENT}); const a=document.getElementById('gd-accent'); if(a)a.value=DEFAULT_ACCENT; showToast('Đã reset màu accent','success'); }
function onOverlayChange(val){
  document.getElementById('gd-overlay-val').textContent=val;
  patchTheme({bgOverlay:parseInt(val,10)});
}
function onFontChange(val){ patchTheme({font:val}); showToast('Đã đổi font','success'); }
function onRadiusChange(val, silent){
  document.getElementById('gd-radius-val').textContent=val;
  patchTheme({radius:parseInt(val,10)});
  if(!silent) showToast('Đã đổi bo góc','success');
}
function readImageFile(file, cb){
  if(!file || !file.type.startsWith('image/')){ showToast('Chọn file ảnh hợp lệ','error'); return; }
  if(file.size>2.5*1024*1024){ showToast('Ảnh tối đa 2.5MB','error'); return; }
  const r=new FileReader();
  r.onload=e=>cb(e.target.result);
  r.readAsDataURL(file);
}
function uploadAvatar(evt){
  const f=evt.target.files[0];
  readImageFile(f, data=>{ patchTheme({avatar:data}); renderGiaoDien(); showToast('Đã cập nhật ảnh đại diện','success'); evt.target.value=''; });
}
function saveAppearancePersonal(){
  const name=document.getElementById('gd-display-name')?.value?.trim()||'';
  const greeting=document.getElementById('gd-greeting')?.value?.trim()||'';
  patchTheme({displayName:name, greeting});
  const s=getState();
  if(name){ s.cfg.name=name; saveState(s); }
  updateGreeting();
}
function resetAllTheme(){
  if(!confirm('Reset toàn bộ giao diện về mặc định?')) return;
  const u=getActiveUsername();
  if(u) localStorage.removeItem(userThemeKey(u));
  applyTheme(DEFAULT_THEME);
  renderGiaoDien();
  showToast('Đã reset giao diện','success');
}

// ============================================================
// INIT
// ============================================================
async function init(){
  applyTheme(getTheme());
  updateGreeting();
  setInterval(updateGreeting, 60000);
  renderFinance();
  await initVersionControl();
  setupNotifications();
  updateModuleNotiBells();
  const gs0 = getState();
  const anyNotiOn = (gs0.cfg?.noti && Object.values(gs0.cfg.noti).some(Boolean))
    || MODULE_NOTI_KEYS.some(k=>(gs0.cfg?.moduleNoti?.[k]?.schedules||[]).some(s=>s.enabled));
  if(anyNotiOn) requestNotiPermission();
  // Kéo data mới nhất từ Sheets khi mở app
  syncPullOnOpen();
  // Set today as default due date in task modal
  document.getElementById('taskDue').valueAsDate = new Date();
  initMoneyInputs();
  applySidebarProfile(getTheme());
  updateBackendInfo();
  updateTelegramDiagnostics();
}
initAuth();
