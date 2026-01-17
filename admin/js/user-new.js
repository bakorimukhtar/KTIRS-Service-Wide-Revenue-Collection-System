const topbarUserName = document.getElementById('topbarUserName');
const topbarUserInitial = document.getElementById('topbarUserInitial');

const pageTitle = document.getElementById('pageTitle');
const pageModeBadge = document.getElementById('pageModeBadge');

const userForm = document.getElementById('userForm');
const userIdHidden = document.getElementById('userIdHidden');

const fullNameInput = document.getElementById('fullName');
const emailInput = document.getElementById('email');
const roleSelect = document.getElementById('roleSelect');
const primaryMdaSelect = document.getElementById('primaryMdaSelect');
const passwordInput = document.getElementById('password');
const confirmPasswordInput = document.getElementById('confirmPassword');
const passwordHelpText = document.getElementById('passwordHelpText');

const userSubmitBtn = document.getElementById('userSubmitBtn');
const userSubmitLabel = document.getElementById('userSubmitLabel');
const userResetBtn = document.getElementById('userResetBtn');
const userFormMessage = document.getElementById('userFormMessage');

let allMdas = [];
let isEditMode = false;

// Util
function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

// Init
(async () => {
  const supabase = window.supabaseClient;
  if (!supabase) {
    if (userFormMessage) userFormMessage.textContent = 'System configuration error. Contact ICT.';
    return;
  }

  // 1) Session & admin profile
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session || !sessionData.session.user) {
    window.location.href = '../index.html';
    return;
  }

  const currentUser = sessionData.session.user;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('full_name, global_role')
    .eq('user_id', currentUser.id)
    .single();

  if (profileError || !profile || profile.global_role !== 'admin') {
    window.location.href = '../index.html';
    return;
  }

  const name =
    profile.full_name && profile.full_name.trim().length > 0
      ? profile.full_name.trim()
      : currentUser.email || 'Admin User';
  const initial = name.charAt(0).toUpperCase();

  if (topbarUserName) topbarUserName.textContent = name;
  if (topbarUserInitial) topbarUserInitial.textContent = initial;

  // 2) Load MDAs
  const { data: mdas, error: mdasError } = await supabase
    .from('mdas')
    .select('id, name')
    .order('name', { ascending: true });

  if (mdasError) {
    console.error('Error loading MDAs for user page:', mdasError);
    if (userFormMessage) {
      userFormMessage.textContent = 'Unable to load MDAs. Please try again.';
    }
    return;
  }

  allMdas = mdas || [];
  allMdas.forEach((m) => {
    const opt = document.createElement('option');
    opt.value = String(m.id);
    opt.textContent = m.name;
    primaryMdaSelect.appendChild(opt);
  });

  // 3) Determine mode (create / edit)
  const userIdParam = getQueryParam('id');
  if (userIdParam) {
    isEditMode = true;
    if (pageTitle) pageTitle.textContent = 'Edit user';
    if (pageModeBadge) {
      pageModeBadge.textContent = 'Edit user';
      pageModeBadge.classList.remove('bg-slate-900');
      pageModeBadge.classList.add('bg-amber-600');
    }
    if (userSubmitLabel) userSubmitLabel.textContent = 'Update user';
    if (passwordHelpText) {
      passwordHelpText.textContent =
        'Password changes are not done here. Ask the user to reset via login.';
    }

    // Load profile + primary scope
    const { data: userProfile, error: userProfileError } = await supabase
      .from('profiles')
      .select('user_id, full_name, email, global_role')
      .eq('user_id', userIdParam)
      .single();

    if (userProfileError || !userProfile) {
      console.error('Error loading user profile:', userProfileError);
      if (userFormMessage) {
        userFormMessage.textContent =
          'Unable to load selected user. Return to list and try again.';
      }
      return;
    }

    const { data: scopes, error: scopesError } = await supabase
      .from('user_scopes')
      .select('id, mda_id')
      .eq('user_id', userIdParam)
      .order('id', { ascending: true });

    if (scopesError) {
      console.error('Error loading user scopes:', scopesError);
    }

    const primaryScope = scopes && scopes.length > 0 ? scopes[0] : null;

    if (userIdHidden) userIdHidden.value = userProfile.user_id;
    fullNameInput.value = userProfile.full_name || '';
    emailInput.value = userProfile.email;
    roleSelect.value = userProfile.global_role || 'mda_user';
    if (primaryScope && primaryScope.mda_id) {
      primaryMdaSelect.value = String(primaryScope.mda_id);
    }

    passwordInput.value = '';
    confirmPasswordInput.value = '';
    passwordInput.disabled = true;
    confirmPasswordInput.disabled = true;
  } else {
    isEditMode = false;
    if (userSubmitLabel) userSubmitLabel.textContent = 'Create user';
    if (passwordHelpText) {
      passwordHelpText.textContent = 'Required when creating a new user.';
    }
  }
})();

// Submit
if (userForm) {
  userForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const supabase = window.supabaseClient;
    if (!supabase) return;

    userFormMessage.textContent = '';
    userSubmitBtn.disabled = true;
    userSubmitLabel.textContent = isEditMode ? 'Updating...' : 'Creating...';

    const fullName = fullNameInput.value.trim();
    const email = emailInput.value.trim().toLowerCase();
    const role = roleSelect.value;
    const primaryMdaId = primaryMdaSelect.value ? Number(primaryMdaSelect.value) : null;
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if (!fullName) {
      userFormMessage.textContent = 'Please enter full name.';
      resetButtonState();
      return;
    }
    if (!email) {
      userFormMessage.textContent = 'Please enter official email.';
      resetButtonState();
      return;
    }
    if (!role) {
      userFormMessage.textContent = 'Please select a role.';
      resetButtonState();
      return;
    }
    if (!primaryMdaId) {
      userFormMessage.textContent = 'Please select a primary MDA.';
      resetButtonState();
      return;
    }

    if (!isEditMode) {
      if (!password || !confirmPassword) {
        userFormMessage.textContent = 'Please enter and confirm the password.';
        resetButtonState();
        return;
      }
      if (password !== confirmPassword) {
        userFormMessage.textContent = 'Passwords do not match.';
        resetButtonState();
        return;
      }
    }

    try {
      if (isEditMode && userIdHidden.value) {
        const userId = userIdHidden.value;

        // 1) Update profile
        const { error: profileError } = await supabase
          .from('profiles')
          .update({
            full_name: fullName,
            email,
            global_role: role
          })
          .eq('user_id', userId);

        if (profileError) {
          console.error('Update profile error:', profileError);
          userFormMessage.textContent =
            'Unable to update user profile. Please try again.';
          resetButtonState('Update user');
          return;
        }

        // 2) Update primary scope
        const { data: scopes, error: scopesError } = await supabase
          .from('user_scopes')
          .select('id')
          .eq('user_id', userId)
          .order('id', { ascending: true });

        if (scopesError) {
          console.error('Load scopes for update error:', scopesError);
        }

        if (scopes && scopes.length > 0) {
          const firstScopeId = scopes[0].id;
          const { error: scopeUpdateError } = await supabase
            .from('user_scopes')
            .update({
              mda_id: primaryMdaId,
              zone_id: null,
              lga_id: null
            })
            .eq('id', firstScopeId);

          if (scopeUpdateError) {
            console.error('Update user scope error:', scopeUpdateError);
            userFormMessage.textContent =
              'User updated, but unable to update MDA scope.';
            resetButtonState('Update user');
            return;
          }
        } else {
          const { error: scopeInsertError } = await supabase
            .from('user_scopes')
            .insert({
              user_id: userId,
              mda_id: primaryMdaId,
              zone_id: null,
              lga_id: null
            });
          if (scopeInsertError) {
            console.error('Insert user scope error:', scopeInsertError);
            userFormMessage.textContent =
              'User updated, but unable to create MDA scope.';
            resetButtonState('Update user');
            return;
          }
        }

        window.location.href = 'users.html';
      } else {
        // CREATE MODE using signUp
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: null
          }
        });

        if (signUpError || !signUpData || !signUpData.user) {
          console.error('Create auth user error:', signUpError);
          const msg =
            signUpError && signUpError.message
              ? signUpError.message
              : 'Unable to create authentication account. Please try again.';
          userFormMessage.textContent = msg;
          resetButtonState('Create user');
          return;
        }

        const newUser = signUpData.user;

        const { error: profileInsertError } = await supabase
          .from('profiles')
          .insert({
            user_id: newUser.id,
            email,
            full_name: fullName,
            global_role: role
          });

        if (profileInsertError) {
          console.error('Insert profile error:', profileInsertError);
          userFormMessage.textContent =
            'Account created, but unable to save profile.';
          resetButtonState('Create user');
          return;
        }

        const { error: scopeInsertError } = await supabase
          .from('user_scopes')
          .insert({
            user_id: newUser.id,
            mda_id: primaryMdaId,
            zone_id: null,
            lga_id: null
          });

        if (scopeInsertError) {
          console.error('Insert user scope error:', scopeInsertError);
          userFormMessage.textContent =
            'User created, but unable to assign MDA scope.';
          resetButtonState('Create user');
          return;
        }

        window.location.href = 'users.html';
      }
    } catch (err) {
      console.error('Unexpected user save error:', err);
      userFormMessage.textContent =
        'Unexpected error while saving user. Please try again.';
      resetButtonState(isEditMode ? 'Update user' : 'Create user');
    }
  });
}

// Reset
function resetButtonState(labelOverride) {
  userSubmitBtn.disabled = false;
  if (userSubmitLabel) {
    userSubmitLabel.textContent =
      labelOverride || (isEditMode ? 'Update user' : 'Create user');
  }
}

if (userResetBtn) {
  userResetBtn.addEventListener('click', () => {
    userFormMessage.textContent = '';
    if (isEditMode) {
      window.location.reload();
    } else {
      fullNameInput.value = '';
      emailInput.value = '';
      roleSelect.value = 'mda_user';
      primaryMdaSelect.value = '';
      passwordInput.value = '';
      confirmPasswordInput.value = '';
    }
  });
}
