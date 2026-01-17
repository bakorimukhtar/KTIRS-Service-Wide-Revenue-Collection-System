const topbarUserName = document.getElementById('topbarUserName');
const topbarUserInitial = document.getElementById('topbarUserInitial');

const pageTitle = document.getElementById('pageTitle');
const pageModeBadge = document.getElementById('pageModeBadge');

const mdaForm = document.getElementById('mdaForm');
const mdaIdInput = document.getElementById('mdaId');
const mdaNameInput = document.getElementById('mdaName');
const mdaCodeInput = document.getElementById('mdaCode');
const mdaCategorySelect = document.getElementById('mdaCategory');
const mdaStatusSelect = document.getElementById('mdaStatus');
const mdaSubmitBtn = document.getElementById('mdaSubmitBtn');
const mdaSubmitLabel = document.getElementById('mdaSubmitLabel');
const mdaResetBtn = document.getElementById('mdaResetBtn');
const mdaFormMessage = document.getElementById('mdaFormMessage');

let isEditMode = false;

// -------------------------------------------------------------
// Utility: get query param
// -------------------------------------------------------------
function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

// -------------------------------------------------------------
// Initialize: auth, profile, and MDA (if edit mode)
// -------------------------------------------------------------
(async () => {
  const supabase = window.supabaseClient;
  if (!supabase) {
    console.error('Supabase client not found');
    if (mdaFormMessage) {
      mdaFormMessage.textContent =
        'System configuration error. Please contact ICT.';
    }
    return;
  }

  // 1) Check session
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session || !sessionData.session.user) {
    window.location.href = '../index.html';
    return;
  }

  const user = sessionData.session.user;

  // 2) Load profile, enforce admin
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('full_name, global_role')
    .eq('user_id', user.id)
    .single();

  if (profileError || !profile) {
    console.error('Profile not found for current user', profileError);
    window.location.href = '../index.html';
    return;
  }

  if (profile.global_role !== 'admin') {
    window.location.href = '../index.html';
    return;
  }

  const name =
    profile.full_name && profile.full_name.trim().length > 0
      ? profile.full_name.trim()
      : user.email || 'Admin User';
  const initial = name.charAt(0).toUpperCase();

  if (topbarUserName) topbarUserName.textContent = name;
  if (topbarUserInitial) topbarUserInitial.textContent = initial;

  // 3) Determine if editing or creating
  const mdaIdParam = getQueryParam('id');
  if (mdaIdParam) {
    isEditMode = true;
    if (pageTitle) pageTitle.textContent = 'Edit MDA';
    if (pageModeBadge) {
      pageModeBadge.textContent = 'Edit MDA';
      pageModeBadge.classList.remove('bg-slate-900');
      pageModeBadge.classList.add('bg-amber-600');
    }
    if (mdaSubmitLabel) mdaSubmitLabel.textContent = 'Update MDA';

    // Load existing MDA
    const { data: mda, error: mdaError } = await supabase
      .from('mdas')
      .select('id, name, code, category, is_active')
      .eq('id', mdaIdParam)
      .single();

    if (mdaError || !mda) {
      console.error('Error loading MDA:', mdaError);
      if (mdaFormMessage) {
        mdaFormMessage.textContent =
          'Unable to load selected MDA. Return to registry and try again.';
      }
      return;
    }

    // Populate form
    if (mdaIdInput) mdaIdInput.value = mda.id;
    if (mdaNameInput) mdaNameInput.value = mda.name || '';
    if (mdaCodeInput) mdaCodeInput.value = mda.code || '';
    if (mdaCategorySelect) mdaCategorySelect.value = mda.category || '';
    if (mdaStatusSelect) mdaStatusSelect.value = mda.is_active ? 'active' : 'inactive';
  } else {
    // New mode defaults
    if (mdaStatusSelect) mdaStatusSelect.value = 'active';
  }
})();

// -------------------------------------------------------------
// Form submit
// -------------------------------------------------------------
if (mdaForm) {
  mdaForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!mdaSubmitBtn || !mdaSubmitLabel) return;

    const supabase = window.supabaseClient;
    if (!supabase) return;

    mdaFormMessage.textContent = '';
    mdaSubmitBtn.disabled = true;
    mdaSubmitLabel.textContent = isEditMode ? 'Updating...' : 'Saving...';

    const name = mdaNameInput.value.trim();
    const code = mdaCodeInput.value.trim();
    const category = mdaCategorySelect.value;
    const statusValue = mdaStatusSelect.value;

    if (!name) {
      mdaFormMessage.textContent = 'Please enter an MDA name.';
      mdaSubmitBtn.disabled = false;
      mdaSubmitLabel.textContent = isEditMode ? 'Update MDA' : 'Save MDA';
      return;
    }
    if (!code) {
      mdaFormMessage.textContent = 'Please enter a short code.';
      mdaSubmitBtn.disabled = false;
      mdaSubmitLabel.textContent = isEditMode ? 'Update MDA' : 'Save MDA';
      return;
    }
    if (!category) {
      mdaFormMessage.textContent = 'Please select a category.';
      mdaSubmitBtn.disabled = false;
      mdaSubmitLabel.textContent = isEditMode ? 'Update MDA' : 'Save MDA';
      return;
    }

    const isActive = statusValue === 'active';

    try {
      if (isEditMode && mdaIdInput.value) {
        const id = Number(mdaIdInput.value);
        const { error } = await supabase
          .from('mdas')
          .update({
            name,
            code,
            category,
            is_active: isActive
          })
          .eq('id', id);

        if (error) {
          console.error('Update error:', error);
          mdaFormMessage.textContent =
            'Unable to update MDA. Please try again or contact ICT.';
          mdaSubmitBtn.disabled = false;
          mdaSubmitLabel.textContent = 'Update MDA';
          return;
        }

        // On success, go back to registry
        window.location.href = 'mdas.html';
      } else {
        const { data, error } = await supabase
          .from('mdas')
          .insert({
            name,
            code,
            category,
            is_active: isActive
          })
          .select('id')
          .single(); // return inserted row [web:92][web:94]

        if (error) {
          console.error('Insert error:', error);
          mdaFormMessage.textContent =
            'Unable to register MDA. Please ensure the code is unique and try again.';
          mdaSubmitBtn.disabled = false;
          mdaSubmitLabel.textContent = 'Save MDA';
          return;
        }

        // On success, go back to registry
        window.location.href = 'mdas.html';
      }
    } catch (err) {
      console.error('Unexpected MDA save error:', err);
      mdaFormMessage.textContent =
        'Unexpected error while saving. Please try again.';
      mdaSubmitBtn.disabled = false;
      mdaSubmitLabel.textContent = isEditMode ? 'Update MDA' : 'Save MDA';
    }
  });
}

// -------------------------------------------------------------
// Reset button
// -------------------------------------------------------------
if (mdaResetBtn) {
  mdaResetBtn.addEventListener('click', () => {
    mdaFormMessage.textContent = '';
    if (isEditMode) {
      // Reload page to restore original values
      window.location.reload();
    } else {
      if (mdaIdInput) mdaIdInput.value = '';
      if (mdaNameInput) mdaNameInput.value = '';
      if (mdaCodeInput) mdaCodeInput.value = '';
      if (mdaCategorySelect) mdaCategorySelect.value = '';
      if (mdaStatusSelect) mdaStatusSelect.value = 'active';
    }
  });
}
