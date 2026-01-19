// admin/js/officers.js

// Sidebar + auth UI
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const sidebarBackdrop = document.getElementById('sidebarBackdrop');
const logoutBtn = document.getElementById('logoutBtn');

function openSidebar() {
  if (!sidebar) return;
  sidebar.classList.remove('-translate-x-full');
  sidebarBackdrop?.classList.remove('hidden');
}
function closeSidebar() {
  if (!sidebar) return;
  sidebar.classList.add('-translate-x-full');
  sidebarBackdrop?.classList.add('hidden');
}
if (sidebarToggle) {
  sidebarToggle.addEventListener('click', () => {
    const isHidden = sidebar.classList.contains('-translate-x-full');
    isHidden ? openSidebar() : closeSidebar();
  });
}
sidebarBackdrop?.addEventListener('click', closeSidebar);

// Helpers
function safeText(s) {
  return String(s ?? '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[m]));
}
function shortId(id) {
  const s = String(id || '');
  return s.length > 10 ? `${s.slice(0, 8)}…` : (s || '—');
}
function uniq(arr) { return [...new Set(arr)]; }
function setMsg(el, msg) { if (el) el.textContent = msg || ''; }

function cleanEmail(input) {
  return String(input ?? '').replace(/\s+/g, '').toLowerCase().trim();
}

// Page elements
const officersTableBody = document.getElementById('officersTableBody');
const searchOfficer = document.getElementById('searchOfficer');
const filterUnassigned = document.getElementById('filterUnassigned');

// Create officer modal
const openCreateOfficerBtn = document.getElementById('openCreateOfficerBtn');
const createOfficerModal = document.getElementById('createOfficerModal');
const createOfficerBackdrop = document.getElementById('createOfficerBackdrop');
const closeCreateOfficerBtn = document.getElementById('closeCreateOfficerBtn');
const closeCreateOfficerBtn2 = document.getElementById('closeCreateOfficerBtn2');
const saveCreateOfficerBtn = document.getElementById('saveCreateOfficerBtn');

const createOfficerName = document.getElementById('createOfficerName');
const createOfficerEmail = document.getElementById('createOfficerEmail');
const createOfficerPhone = document.getElementById('createOfficerPhone');
const createOfficerPassword = document.getElementById('createOfficerPassword');
const createOfficerPassword2 = document.getElementById('createOfficerPassword2');
const createOfficerMessage = document.getElementById('createOfficerMessage');

const createAssignNow = document.getElementById('createAssignNow');
const createAssignFields = document.getElementById('createAssignFields');
const createAssignLga = document.getElementById('createAssignLga');
const createAssignStream = document.getElementById('createAssignStream');

// Assign modal
const assignModal = document.getElementById('assignModal');
const assignBackdrop = document.getElementById('assignBackdrop');
const closeAssignBtn = document.getElementById('closeAssignBtn');
const closeAssignBtn2 = document.getElementById('closeAssignBtn2');
const saveAssignBtn = document.getElementById('saveAssignBtn');

const assignTitle = document.getElementById('assignTitle');
const assignOfficerName = document.getElementById('assignOfficerName');
const assignOfficerId = document.getElementById('assignOfficerId');
const assignLgaSelect = document.getElementById('assignLgaSelect');
const assignStreamSelect = document.getElementById('assignStreamSelect');
const assignCurrentTableBody = document.getElementById('assignCurrentTableBody');
const assignMessage = document.getElementById('assignMessage');

// NEW: unassign button inside assign modal
const unassignOfficerBtn = document.getElementById('unassignOfficerBtn');

// Credentials modal (Admin reset only)
const credentialsModal = document.getElementById('credentialsModal');
const credentialsBackdrop = document.getElementById('credentialsBackdrop');
const closeCredentialsBtn = document.getElementById('closeCredentialsBtn');
const closeCredentialsBtn2 = document.getElementById('closeCredentialsBtn2');

const credentialsTitle = document.getElementById('credentialsTitle');
const credentialsOfficerName = document.getElementById('credentialsOfficerName');
const credentialsOfficerId = document.getElementById('credentialsOfficerId');

const resetOfficerPassword = document.getElementById('resetOfficerPassword');
const resetOfficerPassword2 = document.getElementById('resetOfficerPassword2');
const saveResetPasswordBtn = document.getElementById('saveResetPasswordBtn');

const credentialsMessage = document.getElementById('credentialsMessage');

// NEW: delete officer modal
const deleteOfficerModal = document.getElementById('deleteOfficerModal');
const deleteOfficerBackdrop = document.getElementById('deleteOfficerBackdrop');
const closeDeleteOfficerBtn = document.getElementById('closeDeleteOfficerBtn');
const closeDeleteOfficerBtn2 = document.getElementById('closeDeleteOfficerBtn2');
const confirmDeleteOfficerBtn = document.getElementById('confirmDeleteOfficerBtn');
const deleteOfficerName = document.getElementById('deleteOfficerName');
const deleteOfficerId = document.getElementById('deleteOfficerId');
const deleteOfficerMessage = document.getElementById('deleteOfficerMessage');

// Config
const OFFICER_ROLE = 'officer';
const ADMIN_SET_PASSWORD_FUNCTION = 'admin-set-password'; // Edge function (service role)
const ADMIN_DELETE_USER_FUNCTION = 'admin-delete-user';   // OPTIONAL Edge function (service role)

// State
let allLgas = [];
let allStreams = [];
let allOfficers = [];
let activeAssignments = [];

let lgaById = new Map();
let streamById = new Map();
let assignmentsByOfficer = new Map();

let currentAssignOfficerId = null;
let currentCredentialsOfficerId = null;
let currentDeleteOfficerId = null;

let currentAdminUserId = null;

// Modal helpers
function showCreateOfficer() {
  createOfficerModal?.classList.remove('hidden');

  setMsg(createOfficerMessage, '');
  if (createOfficerName) createOfficerName.value = '';
  if (createOfficerEmail) createOfficerEmail.value = '';
  if (createOfficerPhone) createOfficerPhone.value = '';
  if (createOfficerPassword) createOfficerPassword.value = '';
  if (createOfficerPassword2) createOfficerPassword2.value = '';

  if (createAssignNow) createAssignNow.checked = false;
  createAssignFields?.classList.add('hidden');
  if (createAssignLga) createAssignLga.value = '';
  if (createAssignStream) createAssignStream.value = '';

  setTimeout(() => createOfficerName?.focus(), 50);
}
function hideCreateOfficer() { createOfficerModal?.classList.add('hidden'); }

function showAssign() { assignModal?.classList.remove('hidden'); }
function hideAssign() {
  assignModal?.classList.add('hidden');
  currentAssignOfficerId = null;
  setMsg(assignMessage, '');
  if (assignLgaSelect) assignLgaSelect.value = '';
  if (assignStreamSelect) assignStreamSelect.value = '';
}

function showCredentials() { credentialsModal?.classList.remove('hidden'); }
function hideCredentials() {
  credentialsModal?.classList.add('hidden');
  currentCredentialsOfficerId = null;
  setMsg(credentialsMessage, '');
  if (resetOfficerPassword) resetOfficerPassword.value = '';
  if (resetOfficerPassword2) resetOfficerPassword2.value = '';
}

function showDeleteOfficer() { deleteOfficerModal?.classList.remove('hidden'); }
function hideDeleteOfficer() {
  deleteOfficerModal?.classList.add('hidden');
  currentDeleteOfficerId = null;
  setMsg(deleteOfficerMessage, '');
}

// Modal events
openCreateOfficerBtn?.addEventListener('click', showCreateOfficer);
createOfficerBackdrop?.addEventListener('click', hideCreateOfficer);
closeCreateOfficerBtn?.addEventListener('click', hideCreateOfficer);
closeCreateOfficerBtn2?.addEventListener('click', hideCreateOfficer);

assignBackdrop?.addEventListener('click', hideAssign);
closeAssignBtn?.addEventListener('click', hideAssign);
closeAssignBtn2?.addEventListener('click', hideAssign);

credentialsBackdrop?.addEventListener('click', hideCredentials);
closeCredentialsBtn?.addEventListener('click', hideCredentials);
closeCredentialsBtn2?.addEventListener('click', hideCredentials);

deleteOfficerBackdrop?.addEventListener('click', hideDeleteOfficer);
closeDeleteOfficerBtn?.addEventListener('click', hideDeleteOfficer);
closeDeleteOfficerBtn2?.addEventListener('click', hideDeleteOfficer);

// Esc closes any open modal
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  hideCreateOfficer();
  hideAssign();
  hideCredentials();
  hideDeleteOfficer();
});

// Create officer: show/hide assign fields
if (createAssignNow) {
  createAssignNow.addEventListener('change', () => {
    if (createAssignNow.checked) createAssignFields?.classList.remove('hidden');
    else createAssignFields?.classList.add('hidden');
  });
}

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

// ---------- Supabase client helpers ----------

// Separate client used ONLY for signUp, so admin session isn't overwritten.
function getCreateUserClient() {
  if (window.supabaseCreateUserClient) return window.supabaseCreateUserClient;

  if (!window.supabase?.createClient) throw new Error('Supabase library missing.');
  if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
    throw new Error('Missing SUPABASE_URL / SUPABASE_ANON_KEY on window.');
  }

  const c = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
    auth: {
      storageKey: 'ktirs-officer-create',
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    }
  });

  window.supabaseCreateUserClient = c;
  return c;
}

// ---------- Data loaders ----------

async function loadCoreLookups() {
  const supabase = window.supabaseClient;
  if (!supabase) return;

  const { data: lgas, error: lErr } = await supabase
    .from('lgas')
    .select('id, name, is_active')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (lErr) { console.warn('LGAs load error:', lErr); allLgas = []; }
  else allLgas = lgas || [];

  const { data: streams, error: sErr } = await supabase
    .from('revenue_streams')
    .select('id, name, is_active')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (sErr) { console.warn('Streams load error:', sErr); allStreams = []; }
  else allStreams = streams || [];

  lgaById = new Map(allLgas.map(l => [l.id, l]));
  streamById = new Map(allStreams.map(s => [s.id, s]));

  const lgaOptions = `<option value="">Select LGA…</option>` + allLgas.map(l => (
    `<option value="${safeText(l.id)}">${safeText(l.name)}</option>`
  )).join('');

  const streamOptions = `<option value="">Select stream…</option>` + allStreams.map(s => (
    `<option value="${safeText(s.id)}">${safeText(s.name)}</option>`
  )).join('');

  if (createAssignLga) createAssignLga.innerHTML = lgaOptions;
  if (assignLgaSelect) assignLgaSelect.innerHTML = lgaOptions;
  if (createAssignStream) createAssignStream.innerHTML = streamOptions;
  if (assignStreamSelect) assignStreamSelect.innerHTML = streamOptions;
}

async function loadOfficers() {
  const supabase = window.supabaseClient;
  if (!supabase) return;

  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, full_name, global_role, created_at')
    .eq('global_role', OFFICER_ROLE)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('Officers load error:', error);
    allOfficers = [];
    return;
  }
  allOfficers = data || [];
}

async function loadActiveAssignments() {
  const supabase = window.supabaseClient;
  if (!supabase) return;

  const { data, error } = await supabase
    .from('officer_assignments')
    .select('id, officer_id, lga_id, revenue_stream_id, is_active, created_at')
    .eq('is_active', true);

  if (error) {
    console.warn('Assignments load error:', error);
    activeAssignments = [];
    assignmentsByOfficer = new Map();
    return;
  }

  activeAssignments = data || [];
  assignmentsByOfficer = new Map();

  activeAssignments.forEach(a => {
    if (!assignmentsByOfficer.has(a.officer_id)) assignmentsByOfficer.set(a.officer_id, []);
    assignmentsByOfficer.get(a.officer_id).push(a);
  });
}

async function refreshAndRender() {
  await loadOfficers();
  await loadActiveAssignments();
  renderOfficersTable();
  if (window.lucide) lucide.createIcons();
}

function getOfficerAssignments(officerId) {
  return assignmentsByOfficer.get(officerId) || [];
}

// ---------- Rendering ----------

function renderOfficersTable() {
  if (!officersTableBody) return;

  const q = (searchOfficer?.value || '').trim().toLowerCase();
  const unassignedOnly = !!filterUnassigned?.checked;

  let rows = allOfficers.slice();

  if (q) {
    rows = rows.filter(o => {
      const name = String(o.full_name || '').toLowerCase();
      const id = String(o.user_id || '').toLowerCase();
      return name.includes(q) || id.includes(q);
    });
  }

  if (unassignedOnly) {
    rows = rows.filter(o => getOfficerAssignments(o.user_id).length === 0);
  }

  if (rows.length === 0) {
    officersTableBody.innerHTML = `
      <tr class="text-slate-500">
        <td colspan="5" class="px-3 py-4 text-center">No officers found.</td>
      </tr>
    `;
    return;
  }

  officersTableBody.innerHTML = rows.map(o => {
    const officerId = o.user_id;
    const name = (o.full_name || '').trim() || shortId(officerId);

    const ass = getOfficerAssignments(officerId);
    const isUnassigned = ass.length === 0;

    const statusBadge = isUnassigned
      ? `<span class="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[11px] font-medium">
           <span class="h-1.5 w-1.5 rounded-full bg-amber-500"></span> Unassigned
         </span>`
      : `<span class="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[11px] font-medium">
           <span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span> Assigned
         </span>`;

    const lgaNames = uniq(ass.map(a => lgaById.get(a.lga_id)?.name).filter(Boolean));
    const streamNames = uniq(ass.map(a => streamById.get(a.revenue_stream_id)?.name).filter(Boolean));

    const lgaCell = isUnassigned ? '—' : safeText(lgaNames.join(', ') || '—');
    const streamCell = isUnassigned ? '—' : safeText(streamNames.join(', ') || '—');

    const actionLabel = isUnassigned ? 'Assign' : 'Assign/Reassign';

    const unassignBtn = isUnassigned ? '' : `
      <button
        class="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-700 hover:bg-rose-100"
        data-unassign-officer="${safeText(officerId)}">
        <i data-lucide="unlink" class="w-3.5 h-3.5"></i>
        <span>Unassign</span>
      </button>
    `;

    return `
      <tr>
        <td class="px-3 py-2">
          <div class="flex flex-col">
            <span class="font-medium text-slate-900">${safeText(name)}</span>
            <span class="text-[11px] text-slate-500">${safeText(officerId)}</span>
          </div>
        </td>
        <td class="px-3 py-2">${statusBadge}</td>
        <td class="px-3 py-2">${lgaCell}</td>
        <td class="px-3 py-2">${streamCell}</td>
        <td class="px-3 py-2 text-right">
          <div class="flex flex-wrap gap-2 justify-end">
            <button
              class="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-[11px] text-slate-700 hover:bg-slate-50"
              data-assign-officer="${safeText(officerId)}">
              <i data-lucide="shuffle" class="w-3.5 h-3.5"></i>
              <span>${actionLabel}</span>
            </button>

            ${unassignBtn}

            <button
              class="inline-flex items-center gap-1 rounded-md bg-slate-900 text-white px-2.5 py-1.5 text-[11px] hover:bg-slate-800"
              data-credentials-officer="${safeText(officerId)}">
              <i data-lucide="key-round" class="w-3.5 h-3.5"></i>
              <span>Credentials</span>
            </button>

            <button
              class="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-white px-2.5 py-1.5 text-[11px] text-rose-700 hover:bg-rose-50"
              data-delete-officer="${safeText(officerId)}">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              <span>Delete</span>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Event delegation for action buttons (prevents duplicate listeners after re-render)
officersTableBody?.addEventListener('click', (e) => {
  const target = e.target;

  const assignBtn = target.closest?.('[data-assign-officer]');
  if (assignBtn) {
    const id = assignBtn.getAttribute('data-assign-officer');
    if (id) openAssignModal(id);
    return;
  }

  const credBtn = target.closest?.('[data-credentials-officer]');
  if (credBtn) {
    const id = credBtn.getAttribute('data-credentials-officer');
    if (id) openCredentialsModal(id);
    return;
  }

  const unassignBtn = target.closest?.('[data-unassign-officer]');
  if (unassignBtn) {
    const id = unassignBtn.getAttribute('data-unassign-officer');
    if (id) unassignOfficerAssignments(id);
    return;
  }

  const delBtn = target.closest?.('[data-delete-officer]');
  if (delBtn) {
    const id = delBtn.getAttribute('data-delete-officer');
    if (id) openDeleteOfficerModal(id);
    return;
  }
});

// ---------- Assignments ----------

async function openAssignModal(officerId) {
  currentAssignOfficerId = officerId;

  const officer = allOfficers.find(o => o.user_id === officerId);
  const name = (officer?.full_name || '').trim() || shortId(officerId);

  if (assignTitle) assignTitle.textContent = `Assign officer – ${name}`;
  if (assignOfficerName) assignOfficerName.textContent = name;
  if (assignOfficerId) assignOfficerId.textContent = officerId;
  setMsg(assignMessage, '');

  renderAssignCurrentTable(officerId);
  showAssign();
  if (window.lucide) lucide.createIcons();
}

function renderAssignCurrentTable(officerId) {
  const ass = getOfficerAssignments(officerId);
  if (!assignCurrentTableBody) return;

  if (!ass || ass.length === 0) {
    assignCurrentTableBody.innerHTML = `
      <tr class="text-slate-500">
        <td colspan="2" class="px-3 py-4 text-center">No active assignments.</td>
      </tr>
    `;
    return;
  }

  assignCurrentTableBody.innerHTML = ass.map(a => {
    const lgaName = lgaById.get(a.lga_id)?.name || '—';
    const streamName = streamById.get(a.revenue_stream_id)?.name || '—';
    return `
      <tr>
        <td class="px-3 py-2">${safeText(lgaName)}</td>
        <td class="px-3 py-2">${safeText(streamName)}</td>
      </tr>
    `;
  }).join('');
}

function getAssignMode() {
  const el = document.querySelector('input[name="assignMode"]:checked');
  return (el?.value || 'replace');
}

async function saveAssignment() {
  const supabase = window.supabaseClient;
  if (!supabase) return;

  const officerId = currentAssignOfficerId;
  const lgaId = assignLgaSelect?.value || '';
  const streamId = assignStreamSelect?.value || '';
  const mode = getAssignMode();

  if (!officerId) return;

  if (!lgaId || !streamId) {
    setMsg(assignMessage, 'Please select both LGA and revenue stream.');
    return;
  }

  setMsg(assignMessage, 'Saving assignment...');

  try {
    if (mode === 'replace') {
      const { error: deactErr } = await supabase
        .from('officer_assignments')
        .update({ is_active: false })
        .eq('officer_id', officerId)
        .eq('is_active', true);

      if (deactErr) throw deactErr;
    }

    const { error: insErr } = await supabase
      .from('officer_assignments')
      .insert({
        officer_id: officerId,
        lga_id: lgaId,
        revenue_stream_id: streamId,
        is_active: true
      });

    if (insErr) throw insErr;

    await refreshAndRender();
    hideAssign();
  } catch (e) {
    console.error('Save assignment error:', e);
    setMsg(assignMessage, e?.message || 'Unable to save assignment right now.');
  }
}
saveAssignBtn?.addEventListener('click', saveAssignment);

async function unassignOfficerAssignments(officerId) {
  const supabase = window.supabaseClient;
  if (!supabase) return;

  const confirmMsg = 'Unassign this officer? This will deactivate all active assignments.';
  if (!window.confirm(confirmMsg)) return;

  setMsg(assignMessage, 'Unassigning officer...');

  try {
    const { error } = await supabase
      .from('officer_assignments')
      .update({ is_active: false })
      .eq('officer_id', officerId)
      .eq('is_active', true);

    if (error) throw error;

    await refreshAndRender();

    // If assign modal is open for this same officer, refresh its inner table
    if (currentAssignOfficerId === officerId) {
      renderAssignCurrentTable(officerId);
      setMsg(assignMessage, 'Officer unassigned.');
    }
  } catch (e) {
    console.error('Unassign error:', e);
    setMsg(assignMessage, e?.message || 'Unable to unassign right now.');
    alert(e?.message || 'Unable to unassign right now.');
  }
}

unassignOfficerBtn?.addEventListener('click', () => {
  if (!currentAssignOfficerId) return;
  unassignOfficerAssignments(currentAssignOfficerId);
});

// ---------- Credentials (Admin reset via Edge Function) ----------

function openCredentialsModal(officerId) {
  currentCredentialsOfficerId = officerId;

  const officer = allOfficers.find(o => o.user_id === officerId);
  const name = (officer?.full_name || '').trim() || shortId(officerId);

  if (credentialsTitle) credentialsTitle.textContent = `Manage credentials – ${name}`;
  if (credentialsOfficerName) credentialsOfficerName.textContent = name;
  if (credentialsOfficerId) credentialsOfficerId.textContent = officerId;

  setMsg(credentialsMessage, '');
  if (resetOfficerPassword) resetOfficerPassword.value = '';
  if (resetOfficerPassword2) resetOfficerPassword2.value = '';

  showCredentials();
  if (window.lucide) lucide.createIcons();
}

async function adminResetOfficerPassword() {
  const supabase = window.supabaseClient;
  if (!supabase) return;

  const officerId = currentCredentialsOfficerId;
  const p1 = (resetOfficerPassword?.value || '').trim();
  const p2 = (resetOfficerPassword2?.value || '').trim();

  if (!officerId) return;
  if (!p1 || !p2) { setMsg(credentialsMessage, 'Please enter and confirm the new password.'); return; }
  if (p1 !== p2) { setMsg(credentialsMessage, 'Passwords do not match.'); return; }
  if (p1.length < 6) { setMsg(credentialsMessage, 'Password must be at least 6 characters.'); return; }

  setMsg(credentialsMessage, 'Saving password...');

  try {
    const { data, error } = await supabase.functions.invoke(ADMIN_SET_PASSWORD_FUNCTION, {
      body: { officer_id: officerId, new_password: p1 }
    });

    if (error) throw error;

    setMsg(credentialsMessage, data?.message || 'Password updated successfully.');
    if (resetOfficerPassword) resetOfficerPassword.value = '';
    if (resetOfficerPassword2) resetOfficerPassword2.value = '';
  } catch (e) {
    console.error('Reset password error:', e);
    setMsg(credentialsMessage, e?.message || 'Unable to reset password. Deploy Edge Function: admin-set-password.');
  }
}
saveResetPasswordBtn?.addEventListener('click', adminResetOfficerPassword);

// ---------- Delete Officer ----------

function openDeleteOfficerModal(officerId) {
  currentDeleteOfficerId = officerId;

  const officer = allOfficers.find(o => o.user_id === officerId);
  const name = (officer?.full_name || '').trim() || shortId(officerId);

  if (deleteOfficerName) deleteOfficerName.textContent = name;
  if (deleteOfficerId) deleteOfficerId.textContent = officerId;
  setMsg(deleteOfficerMessage, '');

  showDeleteOfficer();
  if (window.lucide) lucide.createIcons();
}

async function deleteOfficerConfirmed() {
  const supabase = window.supabaseClient;
  if (!supabase) return;

  const officerId = currentDeleteOfficerId;
  if (!officerId) return;

  // safety: never delete yourself
  if (currentAdminUserId && officerId === currentAdminUserId) {
    setMsg(deleteOfficerMessage, 'You cannot delete the currently logged-in admin.');
    return;
  }

  if (!window.confirm('Are you sure? This will delete the officer profile and deactivate assignments.')) return;

  setMsg(deleteOfficerMessage, 'Deleting officer...');

  try {
    // 1) Deactivate assignments
    const { error: deactErr } = await supabase
      .from('officer_assignments')
      .update({ is_active: false })
      .eq('officer_id', officerId)
      .eq('is_active', true);

    if (deactErr) throw deactErr;

    // 2) Delete officer profile row
    const { error: profDelErr } = await supabase
      .from('profiles')
      .delete()
      .eq('user_id', officerId)
      .eq('global_role', OFFICER_ROLE);

    if (profDelErr) throw profDelErr;

    // 3) OPTIONAL: delete auth user (requires Edge Function with service_role)
    // If you haven't deployed it, this will fail gracefully.
    let authDeleted = false;
    try {
      const { error: fnErr } = await supabase.functions.invoke(ADMIN_DELETE_USER_FUNCTION, {
        body: { user_id: officerId }
      });
      if (!fnErr) authDeleted = true;
    } catch (_) {
      authDeleted = false;
    }

    await refreshAndRender();
    hideDeleteOfficer();

    if (!authDeleted) {
      alert('Officer profile deleted. Note: Auth user deletion requires Edge Function "admin-delete-user".');
    }
  } catch (e) {
    console.error('Delete officer error:', e);
    setMsg(deleteOfficerMessage, e?.message || 'Unable to delete officer right now.');
  }
}
confirmDeleteOfficerBtn?.addEventListener('click', deleteOfficerConfirmed);

// ---------- Create officer ----------

async function createOfficer() {
  const supabase = window.supabaseClient;
  if (!supabase) return;

  const full_name = (createOfficerName?.value || '').trim();
  const email = cleanEmail(createOfficerEmail?.value || '');
  const phone = (createOfficerPhone?.value || '').trim();
  const password = (createOfficerPassword?.value || '').trim();
  const password2 = (createOfficerPassword2?.value || '').trim();

  if (!full_name || !email || !password) {
    setMsg(createOfficerMessage, 'Please enter full name, email, and password.');
    return;
  }
  if (password !== password2) {
    setMsg(createOfficerMessage, 'Passwords do not match.');
    return;
  }
  if (password.length < 6) {
    setMsg(createOfficerMessage, 'Password must be at least 6 characters.');
    return;
  }

  setMsg(createOfficerMessage, 'Creating officer...');

  try {
    const createUserClient = getCreateUserClient();

    const { data: signUpData, error: signUpErr } = await createUserClient.auth.signUp({
      email,
      password,
      options: { data: { full_name, phone } }
    });

    if (signUpErr) throw signUpErr;

    const officerId = signUpData?.user?.id;
    if (!officerId) throw new Error('User created but missing user id.');

    const { error: profErr } = await supabase
      .from('profiles')
      .insert({ user_id: officerId, full_name, global_role: OFFICER_ROLE });

    if (profErr) throw profErr;

    // Optional assign now
    const assignNow = !!createAssignNow?.checked;
    const lgaId = createAssignLga?.value || '';
    const streamId = createAssignStream?.value || '';

    if (assignNow && lgaId && streamId) {
      const { error: insErr } = await supabase
        .from('officer_assignments')
        .insert({
          officer_id: officerId,
          lga_id: lgaId,
          revenue_stream_id: streamId,
          is_active: true
        });

      if (insErr) throw insErr;
    }

    // discard any temporary auth session created by signUp client
    await createUserClient.auth.signOut();

    await refreshAndRender();
    hideCreateOfficer();
  } catch (e) {
    console.error('Create officer error:', e);
    setMsg(createOfficerMessage, e?.message || 'Unable to create officer right now.');
  }
}
saveCreateOfficerBtn?.addEventListener('click', createOfficer);

// Search/filter events
searchOfficer?.addEventListener('input', renderOfficersTable);
filterUnassigned?.addEventListener('change', renderOfficersTable);

// ---------- Main init ----------
(async () => {
  const supabase = window.supabaseClient;
  if (!supabase) return;

  // Session check
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData?.session?.user) { window.location.href = '../index.html'; return; }
  const user = sessionData.session.user;
  currentAdminUserId = user.id;

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

  await loadCoreLookups();
  await refreshAndRender();

  if (window.lucide) lucide.createIcons();
})();
