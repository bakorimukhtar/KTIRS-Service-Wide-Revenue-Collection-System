// admin/js/lgas.js

// Sidebar + auth UI
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const sidebarBackdrop = document.getElementById('sidebarBackdrop');
const logoutBtn = document.getElementById('logoutBtn');

function openSidebar() {
  if (!sidebar) return;
  sidebar.classList.remove('-translate-x-full');
  if (sidebarBackdrop) sidebarBackdrop.classList.remove('hidden');
}
function closeSidebar() {
  if (!sidebar) return;
  sidebar.classList.add('-translate-x-full');
  if (sidebarBackdrop) sidebarBackdrop.classList.add('hidden');
}
if (sidebarToggle) {
  sidebarToggle.addEventListener('click', () => {
    const isHidden = sidebar.classList.contains('-translate-x-full');
    isHidden ? openSidebar() : closeSidebar();
  });
}
if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', closeSidebar);

// Helpers
function safeText(s) {
  return String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[m]));
}
function formatNaira(amount) {
  const v = Number(amount || 0);
  return '₦' + v.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function populateYearSelect(selectEl, baseYear) {
  if (!selectEl) return;
  const y = Number(baseYear) || new Date().getFullYear();
  const years = [y - 1, y, y + 1, y + 2];
  selectEl.innerHTML = years.map(v => `<option value="${v}">${v}</option>`).join('');
  selectEl.value = String(y);
}
function monthISOFromPicker(val) {
  // input type="month" => "YYYY-MM" -> "YYYY-MM-01"
  if (!val) return null;
  return `${val}-01`;
}
function monthYYYYMMFromPicker(val) {
  // input type="month" => "YYYY-MM"
  if (!val) return '';
  return String(val);
}
function shortId(id) {
  const s = String(id || '');
  return s.length > 10 ? `${s.slice(0, 8)}…` : (s || '—');
}

// Elements
const searchLga = document.getElementById('searchLga');
const lgasTableBody = document.getElementById('lgasTableBody');

const monthPicker = document.getElementById('monthPicker');
const budgetYearFilter = document.getElementById('budgetYearFilter');

// Details modal
const detailsModal = document.getElementById('detailsModal');
const detailsBackdrop = document.getElementById('detailsBackdrop');
const closeDetailsBtn = document.getElementById('closeDetailsBtn');
const closeDetailsBtn2 = document.getElementById('closeDetailsBtn2');

const detailsLgaName = document.getElementById('detailsLgaName');
const detailsOfficersCount = document.getElementById('detailsOfficersCount');
const detailsStreamsCount = document.getElementById('detailsStreamsCount');
const detailsMonthTotal = document.getElementById('detailsMonthTotal');

const tabOfficers = document.getElementById('tabOfficers');
const tabStreams = document.getElementById('tabStreams');
const panelOfficers = document.getElementById('panelOfficers');
const panelStreams = document.getElementById('panelStreams');

const officersTableBody = document.getElementById('officersTableBody');
const streamsPerfTableBody = document.getElementById('streamsPerfTableBody');

// “Generate report” inside details modal (now an <a>)
const openReportBtn = document.getElementById('openReportBtn');

// Create LGA modal
const openCreateLgaBtn = document.getElementById('openCreateLgaBtn');
const createLgaModal = document.getElementById('createLgaModal');
const createLgaBackdrop = document.getElementById('createLgaBackdrop');
const closeCreateLgaBtn = document.getElementById('closeCreateLgaBtn');
const closeCreateLgaBtn2 = document.getElementById('closeCreateLgaBtn2');
const saveCreateLgaBtn = document.getElementById('saveCreateLgaBtn');
const createLgaNameInput = document.getElementById('createLgaNameInput');
const createLgaMessage = document.getElementById('createLgaMessage');

// State
let allLgas = [];
let allStreams = [];
let allCodes = [];
let codesByStream = new Map(); // only active codes grouped by stream

let assignments = []; // officer_assignments (still used for officers list)
let profilesById = new Map(); // officer_id -> profile

let budgetsByStreamYear = new Map(); // key streamId:year -> row

let collectionsByLga = new Map(); // lga_id -> sum month
let collectionsByLgaCode = new Map(); // lga_id -> Map(codeId -> sum)

let currentLgaId = null;
let selectedYear = new Date().getFullYear();

// Default month
(function initMonth() {
  if (!monthPicker) return;
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  monthPicker.value = `${now.getFullYear()}-${mm}`;
})();

function getActiveStreams() {
  return (allStreams || []).filter(s => s && s.is_active === true);
}

// Create LGA modal
function showCreateLga() {
  if (!createLgaModal) return;
  createLgaModal.classList.remove('hidden');
  if (createLgaMessage) createLgaMessage.textContent = '';
  if (createLgaNameInput) createLgaNameInput.value = '';
  setTimeout(() => createLgaNameInput?.focus(), 50);
}
function hideCreateLga() {
  if (!createLgaModal) return;
  createLgaModal.classList.add('hidden');
}

// Tabs
function setTab(which) {
  const activeBtn = "px-3 py-1.5 rounded-md text-xs border border-slate-200 bg-slate-900 text-white";
  const idleBtn = "px-3 py-1.5 rounded-md text-xs border border-slate-200 hover:bg-slate-50";

  if (which === 'officers') {
    tabOfficers.className = activeBtn;
    tabStreams.className = idleBtn;
    panelOfficers?.classList.remove('hidden');
    panelStreams?.classList.add('hidden');
  } else {
    tabOfficers.className = idleBtn;
    tabStreams.className = activeBtn;
    panelOfficers?.classList.add('hidden');
    panelStreams?.classList.remove('hidden');
  }
}
if (tabOfficers) tabOfficers.addEventListener('click', () => setTab('officers'));
if (tabStreams) tabStreams.addEventListener('click', () => setTab('streams'));

// Details modal show/hide
function showDetails() { detailsModal?.classList.remove('hidden'); }
function hideDetails() { detailsModal?.classList.add('hidden'); currentLgaId = null; }

if (detailsBackdrop) detailsBackdrop.addEventListener('click', hideDetails);
if (closeDetailsBtn) closeDetailsBtn.addEventListener('click', hideDetails);
if (closeDetailsBtn2) closeDetailsBtn2.addEventListener('click', hideDetails);

// Logout
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    const supabase = window.supabaseClient;
    if (!supabase) { window.location.href = '../index.html'; return; }
    const { error } = await supabase.auth.signOut();
    if (error) { alert('Unable to log out right now. Please try again.'); return; }
    window.location.href = '../index.html';
  });
}

// Budgets
function keyBudget(streamId, year) { return `${streamId}:${year}`; }
function getBudget(streamId, year) { return budgetsByStreamYear.get(keyBudget(streamId, year)) || null; }

async function loadBudgetsForYear(year) {
  const supabase = window.supabaseClient;
  budgetsByStreamYear = new Map();
  if (!supabase) return;

  const { data, error } = await supabase
    .from('revenue_stream_budgets')
    .select('id, revenue_stream_id, year, annual_budget, monthly_target')
    .eq('year', year);

  if (error) { console.warn('Budgets load error:', error); return; }
  (data || []).forEach(b => budgetsByStreamYear.set(keyBudget(b.revenue_stream_id, b.year), b));
}

// Collections
async function loadCollectionsForMonth(monthISO) {
  const supabase = window.supabaseClient;
  collectionsByLga = new Map();
  collectionsByLgaCode = new Map();
  if (!supabase || !monthISO) return;

  const { data, error } = await supabase
    .from('collections')
    .select('lga_id, economic_code_id, amount_collected')
    .eq('month_year', monthISO);

  if (error) { console.warn('Collections load error:', error); return; }

  (data || []).forEach(r => {
    const lgaId = r.lga_id;
    const codeId = r.economic_code_id;
    const amt = Number(r.amount_collected || 0);

    collectionsByLga.set(lgaId, (collectionsByLga.get(lgaId) || 0) + amt);

    if (!collectionsByLgaCode.has(lgaId)) collectionsByLgaCode.set(lgaId, new Map());
    const m = collectionsByLgaCode.get(lgaId);
    m.set(codeId, (m.get(codeId) || 0) + amt);
  });
}

// Officer assignments + profiles (kept for Officers panel)
async function loadAssignmentsAndProfiles() {
  const supabase = window.supabaseClient;
  if (!supabase) return;

  const { data: ass, error } = await supabase
    .from('officer_assignments')
    .select('id, officer_id, lga_id, revenue_stream_id, is_active')
    .eq('is_active', true);

  if (error) { console.warn('Assignments load error:', error); assignments = []; return; }
  assignments = ass || [];

  const officerIds = [...new Set(assignments.map(a => a.officer_id).filter(Boolean))];
  profilesById = new Map();
  if (officerIds.length === 0) return;

  // Keep this minimal to match your provided schema
  const { data: profs, error: pErr } = await supabase
    .from('profiles')
    .select('user_id, full_name')
    .in('user_id', officerIds);

  if (pErr) { console.warn('Profiles load error:', pErr); return; }
  (profs || []).forEach(p => profilesById.set(p.user_id, p));
}

function getAssignmentsForLga(lgaId) {
  return assignments.filter(a => a.lga_id === lgaId);
}

// Report redirect
function buildReportUrl(lgaId) {
  const month = monthYYYYMMFromPicker(monthPicker?.value || '');
  const year = String(Number(budgetYearFilter?.value) || selectedYear || new Date().getFullYear());
  const qs = new URLSearchParams({
    lga_id: String(lgaId || ''),
    month,
    year
  });
  return `lga-report.html?${qs.toString()}`;
}
function goToLgaReport(lgaId) {
  window.location.href = buildReportUrl(lgaId);
}

// Create LGA
async function createLga() {
  const supabase = window.supabaseClient;
  if (!supabase) return;

  const name = (createLgaNameInput?.value || '').trim();
  if (!name) {
    if (createLgaMessage) createLgaMessage.textContent = 'Please enter an LGA name.';
    return;
  }

  if (createLgaMessage) createLgaMessage.textContent = 'Saving...';

  try {
    const { data, error } = await supabase
      .from('lgas')
      .insert({ name })
      .select('id, name, is_active, created_at')
      .single();

    // Supabase returns inserted rows only when chaining .select() [web:83]
    if (error) throw error;

    allLgas.push(data);
    allLgas.sort((a, b) => String(a.name).localeCompare(String(b.name)));

    renderLgasTable();
    hideCreateLga();
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    const msg = (e?.message || '').toLowerCase();
    if (msg.includes('duplicate') || msg.includes('unique')) {
      if (createLgaMessage) createLgaMessage.textContent = 'This LGA name already exists.';
    } else {
      if (createLgaMessage) createLgaMessage.textContent = 'Unable to create LGA right now.';
    }
    console.error('Create LGA error:', e);
  }
}
if (saveCreateLgaBtn) saveCreateLgaBtn.addEventListener('click', createLga);

// Rendering
function renderLgasTable() {
  if (!lgasTableBody) return;

  const q = (searchLga?.value || '').trim().toLowerCase();
  let rows = allLgas.slice();
  if (q) rows = rows.filter(l => (l.name || '').toLowerCase().includes(q));

  if (rows.length === 0) {
    lgasTableBody.innerHTML = `
      <tr class="text-slate-500">
        <td colspan="5" class="px-3 py-4 text-center">No LGAs found.</td>
      </tr>
    `;
    return;
  }

  const activeStreamCount = getActiveStreams().length;

  lgasTableBody.innerHTML = rows.map(lga => {
    const ass = getAssignmentsForLga(lga.id);
    const officerCount = new Set(ass.map(a => a.officer_id)).size;
    const monthTotal = collectionsByLga.get(lga.id) || 0;

    return `
      <tr>
        <td class="px-3 py-2">${safeText(lga.name)}</td>
        <td class="px-3 py-2">${officerCount}</td>
        <td class="px-3 py-2">${activeStreamCount}</td>
        <td class="px-3 py-2">${formatNaira(monthTotal)}</td>
        <td class="px-3 py-2 text-right space-x-2">
          <button
            class="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-[11px] text-slate-700 hover:bg-slate-50"
            data-view-lga="${lga.id}">
            <i data-lucide="eye" class="w-3.5 h-3.5"></i>
            <span>Details</span>
          </button>

          <button
            class="inline-flex items-center gap-1 rounded-md bg-slate-900 text-white px-2.5 py-1.5 text-[11px] hover:bg-slate-800"
            data-report-lga="${lga.id}">
            <i data-lucide="file-text" class="w-3.5 h-3.5"></i>
            <span>Report</span>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();

  document.querySelectorAll('[data-view-lga]').forEach(btn => {
    btn.addEventListener('click', async () => openLgaDetails(btn.getAttribute('data-view-lga')));
  });
  document.querySelectorAll('[data-report-lga]').forEach(btn => {
    btn.addEventListener('click', () => goToLgaReport(btn.getAttribute('data-report-lga')));
  });
}

function renderOfficersForLga(lgaId) {
  if (!officersTableBody) return;

  const ass = getAssignmentsForLga(lgaId);
  const byOfficer = new Map(); // officerId -> Set(streamId)

  ass.forEach(a => {
    if (!byOfficer.has(a.officer_id)) byOfficer.set(a.officer_id, new Set());
    if (a.revenue_stream_id) byOfficer.get(a.officer_id).add(a.revenue_stream_id);
  });

  const officerIds = [...byOfficer.keys()];
  if (officerIds.length === 0) {
    officersTableBody.innerHTML = `
      <tr class="text-slate-500">
        <td colspan="3" class="px-3 py-4 text-center">No officers assigned to this LGA yet.</td>
      </tr>
    `;
    return;
  }

  const streamName = (id) => (allStreams.find(s => s.id === id)?.name || 'Revenue Stream');

  officersTableBody.innerHTML = officerIds.map(officerId => {
    const prof = profilesById.get(officerId);
    const officerName = (prof?.full_name || '').trim() || shortId(officerId);
    const officerCode = shortId(officerId);

    const streamsList = [...(byOfficer.get(officerId) || [])].map(streamName).join(', ');

    return `
      <tr>
        <td class="px-3 py-2">${safeText(officerCode)}</td>
        <td class="px-3 py-2">${safeText(officerName)}</td>
        <td class="px-3 py-2">${safeText(streamsList || '—')}</td>
      </tr>
    `;
  }).join('');
}

function renderStreamsPerfForLga(lgaId) {
  if (!streamsPerfTableBody) return;

  const activeStreams = getActiveStreams();
  if (activeStreams.length === 0) {
    streamsPerfTableBody.innerHTML = `
      <tr class="text-slate-500">
        <td colspan="5" class="px-3 py-4 text-center">No active revenue streams found.</td>
      </tr>
    `;
    return;
  }

  const codeAgg = collectionsByLgaCode.get(lgaId) || new Map();

  streamsPerfTableBody.innerHTML = activeStreams.map(stream => {
    const codes = codesByStream.get(stream.id) || [];

    const b = getBudget(stream.id, selectedYear);
    const annual = b ? Number(b.annual_budget || 0) : 0;
    const monthly = b ? Number(b.monthly_target || 0) : 0;

    // Sum collected for all codes under this stream in this LGA/month
    let collected = 0;
    codes.forEach(c => { collected += Number(codeAgg.get(c.id) || 0); });

    return `
      <tr>
        <td class="px-3 py-2">${safeText(stream.name || 'Revenue Stream')}</td>
        <td class="px-3 py-2">${codes.length}</td>
        <td class="px-3 py-2">${formatNaira(annual)}</td>
        <td class="px-3 py-2">${formatNaira(monthly)}</td>
        <td class="px-3 py-2">${formatNaira(collected)}</td>
      </tr>
    `;
  }).join('');
}

async function openLgaDetails(lgaId) {
  currentLgaId = lgaId;
  setTab('officers');
  showDetails();

  const lga = allLgas.find(x => x.id === lgaId);
  if (detailsLgaName) detailsLgaName.textContent = lga ? lga.name : 'LGA';

  // Officers count from assignments
  const ass = getAssignmentsForLga(lgaId);
  const officerCount = new Set(ass.map(a => a.officer_id)).size;

  // Streams count is global (active streams)
  const streamCount = getActiveStreams().length;

  if (detailsOfficersCount) detailsOfficersCount.textContent = String(officerCount);
  if (detailsStreamsCount) detailsStreamsCount.textContent = String(streamCount);

  const monthTotal = collectionsByLga.get(lgaId) || 0;
  if (detailsMonthTotal) detailsMonthTotal.textContent = formatNaira(monthTotal);

  // Update report link href so user can open in new tab if desired
  if (openReportBtn) openReportBtn.setAttribute('href', buildReportUrl(lgaId));

  renderOfficersForLga(lgaId);
  renderStreamsPerfForLga(lgaId);

  if (window.lucide) lucide.createIcons();
}

// Events
if (searchLga) searchLga.addEventListener('input', renderLgasTable);

if (budgetYearFilter) {
  budgetYearFilter.addEventListener('change', async () => {
    selectedYear = Number(budgetYearFilter.value) || new Date().getFullYear();
    await loadBudgetsForYear(selectedYear);
    renderLgasTable();
    if (currentLgaId) renderStreamsPerfForLga(currentLgaId);
  });
}

if (monthPicker) {
  monthPicker.addEventListener('change', async () => {
    const monthISO = monthISOFromPicker(monthPicker.value);
    await loadCollectionsForMonth(monthISO);
    renderLgasTable();
    if (currentLgaId) {
      if (detailsMonthTotal) detailsMonthTotal.textContent = formatNaira(collectionsByLga.get(currentLgaId) || 0);
      renderStreamsPerfForLga(currentLgaId);
    }
  });
}

// Create LGA modal events
if (openCreateLgaBtn) openCreateLgaBtn.addEventListener('click', showCreateLga);
if (createLgaBackdrop) createLgaBackdrop.addEventListener('click', hideCreateLga);
if (closeCreateLgaBtn) closeCreateLgaBtn.addEventListener('click', hideCreateLga);
if (closeCreateLgaBtn2) closeCreateLgaBtn2.addEventListener('click', hideCreateLga);

if (createLgaNameInput) {
  createLgaNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveCreateLgaBtn?.click();
    if (e.key === 'Escape') hideCreateLga();
  });
}

// Details modal “Generate report” (redirect)
if (openReportBtn) {
  openReportBtn.addEventListener('click', (e) => {
    if (!currentLgaId) { e.preventDefault(); return; }
    // Force redirect with current filters (month/year)
    e.preventDefault();
    goToLgaReport(currentLgaId);
  });
}

// Main init
(async () => {
  const supabase = window.supabaseClient;
  if (!supabase) return;

  // Session check
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData?.session?.user) { window.location.href = '../index.html'; return; }
  const user = sessionData.session.user;

  // Profile check (admin only)
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, global_role')
    .eq('user_id', user.id)
    .single();

  if (!profile || profile.global_role !== 'admin') {
    window.location.href = '../index.html';
    return;
  }

  // Topbar user
  const name = (profile.full_name || '').trim() || user.email || 'Admin User';
  const initial = name.charAt(0).toUpperCase();
  const topbarUserName = document.getElementById('topbarUserName');
  const topbarUserInitial = document.getElementById('topbarUserInitial');
  if (topbarUserName) topbarUserName.textContent = name;
  if (topbarUserInitial) topbarUserInitial.textContent = initial;

  // Init selectors
  populateYearSelect(budgetYearFilter, selectedYear);

  // Load LGAs (show active only)
  const { data: lgas, error: lgasErr } = await supabase
    .from('lgas')
    .select('id, name, is_active')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (lgasErr) {
    console.error(lgasErr);
    if (lgasTableBody) {
      lgasTableBody.innerHTML = `
        <tr class="text-slate-500">
          <td colspan="5" class="px-3 py-4 text-center">Unable to load LGAs.</td>
        </tr>
      `;
    }
    return;
  }
  allLgas = lgas || [];

  // Load streams (all, but UI uses active ones)
  const { data: streams } = await supabase
    .from('revenue_streams')
    .select('id, name, is_active')
    .order('name', { ascending: true });
  allStreams = streams || [];

  // Load economic codes (active only; used for performance totals)
  const { data: codes } = await supabase
    .from('economic_codes')
    .select('id, revenue_stream_id, code, name, is_active')
    .eq('is_active', true)
    .order('code', { ascending: true });
  allCodes = codes || [];

  // Group codes by stream
  codesByStream = new Map();
  allCodes.forEach(c => {
    if (!codesByStream.has(c.revenue_stream_id)) codesByStream.set(c.revenue_stream_id, []);
    codesByStream.get(c.revenue_stream_id).push(c);
  });

  await loadAssignmentsAndProfiles();
  await loadBudgetsForYear(selectedYear);

  const monthISO = monthISOFromPicker(monthPicker?.value || '');
  await loadCollectionsForMonth(monthISO);

  renderLgasTable();
  if (window.lucide) lucide.createIcons();
})();
