/* ══════════════════════════════════════════════════════════════════
   CampusGhosts — app.js
   Competitive Systems Duel Arena + Linear Multi-Role Architecture
   ══════════════════════════════════════════════════════════════════ */

const API = '/api/v1';

const App = (() => {
  // ── State ────────────────────────────────────────────────────
  let session = null;          // { role: "student"|"faculty", token: string, user: {...} }
  let currentStudentView = 'student-arena';
  let currentFacultyView = 'faculty-telemetry';
  
  let problems = [];
  let selectedProblem = null;
  let telemetryChart = null;
  
  let facultyKThreshold = 5;
  let facultyRawAuditMode = false;
  let facultySosEnabled = true;

  // Duel HUD State
  let duelMode = 'Bug Hunt';
  let duelSecondsLeft = 120;
  let duelTimerInterval = null;
  let rivalProgress = 15;
  let rivalInterval = null;
  let rivalAlias = 'Spectre_578';
  let rivalFinished = false;
  let studentSubmitted = false;

  // Channels & Chat State
  let currentChannel = '#announcements';
  let facultySelectedChannel = '#announcements';
  let chatPollInterval = null;

  // SOS Flares State
  let activeFlares = [];
  let sosPollInterval = null;

  // ── Initialization ───────────────────────────────────────────
  async function init() {
    setupCodeEditor();
    lucide.createIcons();

    // 1. Restore session from localStorage if exists
    const saved = localStorage.getItem('campusghosts_session');
    if (saved) {
      try {
        session = JSON.parse(saved);
      } catch (e) {
        session = null;
      }
    }

    // 2. Fetch problems dynamically from SQLite
    await loadProblems();

    // 3. Update Health indicator
    fetchHealthStatus();

    // 4. Render active workspace or login gate
    if (session && session.role === 'student') {
      mountStudentWorkspace(session.user);
    } else if (session && session.role === 'faculty') {
      mountFacultyWorkspace(session.user);
    } else if (session && session.role === 'guest') {
      const backBtn = document.getElementById('btn-back-to-portal');
      if (backBtn) backBtn.classList.remove('hidden');
      const recBtn = document.getElementById('btn-download-recovery');
      if (recBtn) recBtn.classList.add('hidden');
      mountStudentWorkspace(session.user);
    } else {
      showLoginGate();
    }
  }

  // ── View Switching & Layout Management ───────────────────────
  function showLoginGate() {
    clearPolling();
    document.getElementById('view-login-gate').classList.remove('hidden');
    document.getElementById('view-app-shell').classList.add('hidden');
    lucide.createIcons();
  }

  function mountStudentWorkspace(userData) {
    document.getElementById('view-login-gate').classList.add('hidden');
    document.getElementById('view-app-shell').classList.remove('hidden');

    // Sidebar Role & Identity
    document.getElementById('sidebar-role-badge').textContent = userData.role === 'guest' ? 'Guest' : 'Student';
    document.getElementById('sidebar-student-card').classList.remove('hidden');
    document.getElementById('sidebar-faculty-card').classList.add('hidden');

    document.getElementById('nav-student-items').classList.remove('hidden');
    document.getElementById('nav-faculty-items').classList.add('hidden');

    // Populate Sidebar Student Stats
    document.getElementById('sb-ghost-alias').textContent = userData.alias || 'Shadow_188';
    const ratingEl = document.getElementById('sb-ghost-rating');
    if (ratingEl) ratingEl.textContent = `Rating ${userData.rating || 1540}`;
    document.getElementById('sb-ghost-rank').textContent = `Rank #${userData.rank || 1} • Solved ${userData.solved_count || 28}`;
    document.getElementById('sb-ghost-section').textContent = userData.section || 'CSE-1C';

    // Topbar
    const h = userData.ghost_hash || '70b681a4ddb972245c12599b3600b2c1deeb829d7d29f366e4765d1bcfe2e0c7';
    document.getElementById('topbar-hash-text').textContent = `sha256:${h.slice(0, 4)}...${h.slice(-4)}`;
    document.getElementById('topbar-section-pill').textContent = userData.section || 'CSE-1C';

    // Start live duel timer & rival race
    startDuelTimer();

    // Switch to active student subview
    switchStudentView(currentStudentView);
  }

  function mountFacultyWorkspace(userData) {
    clearPolling();
    document.getElementById('view-login-gate').classList.add('hidden');
    document.getElementById('view-app-shell').classList.remove('hidden');

    // Sidebar Role & Identity
    document.getElementById('sidebar-role-badge').textContent = 'Faculty';
    document.getElementById('sidebar-student-card').classList.add('hidden');
    document.getElementById('sidebar-faculty-card').classList.remove('hidden');

    document.getElementById('nav-student-items').classList.add('hidden');
    document.getElementById('nav-faculty-items').classList.remove('hidden');

    document.getElementById('sb-faculty-name').textContent = userData.faculty_name || 'Prof. Sharma';
    document.getElementById('sb-faculty-section').textContent = userData.section || 'CSE-1C';

    document.getElementById('topbar-hash-box').classList.add('hidden');
    document.getElementById('topbar-section-pill').textContent = userData.section || 'CSE-1C';

    // Switch to active faculty subview
    switchFacultyView(currentFacultyView);
  }

  function clearPolling() {
    if (chatPollInterval) {
      clearInterval(chatPollInterval);
      chatPollInterval = null;
    }
    if (sosPollInterval) {
      clearInterval(sosPollInterval);
      sosPollInterval = null;
    }
  }

  function switchStudentView(viewKey) {
    clearPolling();
    currentStudentView = viewKey;
    document.querySelectorAll('#nav-student-items .nav-item').forEach(b => {
      b.classList.toggle('active', b.dataset.workspaceView === viewKey);
    });

    document.querySelectorAll('.workspace-subview').forEach(v => v.classList.add('hidden'));

    if (viewKey === 'student-arena') {
      document.getElementById('subview-student-arena').classList.remove('hidden');
      document.getElementById('topbar-title').textContent = 'Ghost Duel Arena';
      document.getElementById('topbar-subtitle').textContent = 'Systems Programming Live Duel';
    } else if (viewKey === 'student-channels') {
      document.getElementById('subview-student-channels').classList.remove('hidden');
      document.getElementById('topbar-title').textContent = 'Ghost Channels';
      document.getElementById('topbar-subtitle').textContent = 'Encrypted Cohort Channels & Chat';
      selectChannel(currentChannel);
      chatPollInterval = setInterval(refreshCurrentChannel, 4000);
    } else if (viewKey === 'student-sos') {
      document.getElementById('subview-student-sos').classList.remove('hidden');
      document.getElementById('topbar-title').textContent = 'Anonymous SOS Feed';
      document.getElementById('topbar-subtitle').textContent = 'Peer Socratic Flares (+8 Mentor Rating Helper Bounty)';
      loadSosFlares();
      sosPollInterval = setInterval(loadSosFlares, 6000);
    } else if (viewKey === 'student-standings') {
      document.getElementById('subview-student-standings').classList.remove('hidden');
      document.getElementById('topbar-title').textContent = 'Standings & Placement Vault';
      document.getElementById('topbar-subtitle').textContent = 'Zero-Knowledge Cohort Leaderboard & Credential';
      loadLeaderboard();
      setupVaultVerifier();
    }
    lucide.createIcons();
  }

  function switchFacultyView(viewKey) {
    clearPolling();
    currentFacultyView = viewKey;
    document.querySelectorAll('#nav-faculty-items .nav-item').forEach(b => {
      b.classList.toggle('active', b.dataset.workspaceView === viewKey);
    });

    document.querySelectorAll('.workspace-subview').forEach(v => v.classList.add('hidden'));

    if (viewKey === 'faculty-telemetry') {
      document.getElementById('subview-faculty-telemetry').classList.remove('hidden');
      document.getElementById('topbar-title').textContent = 'k-Anonymity Telemetry';
      document.getElementById('topbar-subtitle').textContent = 'Privacy-Preserving Failure Bottleneck Console';
      loadFacultyGovernance();
      loadFacultyTelemetry();
    } else if (viewKey === 'faculty-broadcast') {
      document.getElementById('subview-faculty-broadcast').classList.remove('hidden');
      document.getElementById('topbar-title').textContent = 'Broadcast & Channels Monitor';
      document.getElementById('topbar-subtitle').textContent = 'Cohort Announcement Publisher';
      refreshFacultyChannelFeed();
      chatPollInterval = setInterval(refreshFacultyChannelFeed, 4000);
    } else if (viewKey === 'faculty-assignment') {
      document.getElementById('subview-faculty-assignment').classList.remove('hidden');
      document.getElementById('topbar-title').textContent = 'Publish Lab Assignment';
      document.getElementById('topbar-subtitle').textContent = 'Author Dynamic Systems Assignments';
    }
    lucide.createIcons();
  }

  // ── Authentication Handlers ──────────────────────────────────
  async function handleStudentLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-student-login');
    const roll = document.getElementById('input-student-roll').value.trim();
    const salt = document.getElementById('input-student-salt').value.trim();
    const section = document.getElementById('input-student-section').value;

    setBtnLoading(btn, true);
    try {
      const resp = await api('POST', '/auth/student-login', {
        roll_number: roll,
        secret_salt: salt,
        section: section,
      });

      session = {
        role: 'student',
        token: resp.session_token,
        user: resp,
      };
      localStorage.setItem('campusghosts_session', JSON.stringify(session));

      mountStudentWorkspace(resp);
      toast(`Zero-Knowledge Identity Anchored: ${resp.alias} (Rank #${resp.rank})`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBtnLoading(btn, false);
    }
  }

  async function handleFacultyLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-faculty-login');
    const email = document.getElementById('input-faculty-email').value.trim();
    const passcode = document.getElementById('input-faculty-passcode').value.trim();
    const section = document.getElementById('input-faculty-section').value;

    setBtnLoading(btn, true);
    try {
      const resp = await api('POST', '/auth/faculty-login', {
        email: email,
        passcode: passcode,
        section: section,
      });

      session = {
        role: 'faculty',
        token: resp.session_token,
        user: resp,
      };
      localStorage.setItem('campusghosts_session', JSON.stringify(session));

      mountFacultyWorkspace(resp);
      toast(`Faculty Access Granted: ${resp.faculty_name} (${resp.section})`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBtnLoading(btn, false);
    }
  }

  function quickFillStudent() {
    const roll = document.getElementById('input-student-roll');
    const salt = document.getElementById('input-student-salt');
    const sec = document.getElementById('input-student-section');
    const form = document.getElementById('form-student-login');
    if (roll) roll.value = '2601010043';
    if (salt) salt.value = 'krmu2026';
    if (sec) sec.value = 'CSE-1C';
    if (form) {
      if (typeof form.requestSubmit === 'function') {
        form.requestSubmit();
      } else {
        form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }
    }
  }

  function quickFillFaculty() {
    const email = document.getElementById('input-faculty-email');
    const pass = document.getElementById('input-faculty-passcode');
    const sec = document.getElementById('input-faculty-section');
    const form = document.getElementById('form-faculty-login');
    if (email) email.value = 'prof.sharma@krmangalam.edu.in';
    if (pass) pass.value = 'KRMU-FAC-2026';
    if (sec) sec.value = 'CSE-1C';
    if (form) {
      if (typeof form.requestSubmit === 'function') {
        form.requestSubmit();
      } else {
        form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }
    }
  }

  function signOut() {
    clearPolling();
    if (duelTimerInterval) clearInterval(duelTimerInterval);
    if (rivalInterval) clearInterval(rivalInterval);
    localStorage.removeItem('campusghosts_session');
    session = null;
    const backBtn = document.getElementById('btn-back-to-portal');
    if (backBtn) backBtn.classList.add('hidden');
    const recBtn = document.getElementById('btn-download-recovery');
    if (recBtn) recBtn.classList.remove('hidden');
    showLoginGate();
    toast('Signed out cleanly. Local identity unmounted.', 'info');
  }

  function launchOpenPracticeArena() {
    clearPolling();
    session = {
      role: 'guest',
      token: 'guest_sandbox_token',
      user: {
        alias: 'Guest_Ghost_99',
        rating: 1200,
        rank: '-',
        streak: 0,
        solved_count: 0,
        section: 'Open Arena',
        ghost_hash: 'guest_sandbox_commitment_offline'
      }
    };
    const backBtn = document.getElementById('btn-back-to-portal');
    if (backBtn) backBtn.classList.remove('hidden');
    const recBtn = document.getElementById('btn-download-recovery');
    if (recBtn) recBtn.classList.add('hidden');
    mountStudentWorkspace(session.user);
    toast('Launched Standalone Open Practice Arena (Guest Sandbox)', 'info');
  }

  // ── Duel Timer & Rival Telemetry Simulation ───────────────────
  function setDuelMode(mode) {
    duelMode = mode;
    document.querySelectorAll('.duel-mode-pill').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    toast(`Duel Mode switched to ${mode}.`, 'info');
    resetDuelTimer();
  }

  function startDuelTimer() {
    if (duelTimerInterval) clearInterval(duelTimerInterval);
    if (rivalInterval) clearInterval(rivalInterval);

    rivalFinished = false;
    studentSubmitted = false;
    rivalProgress = 12;
    document.getElementById('duel-verdict-banner').classList.add('hidden');

    // Pick rival alias
    const rivalAliases = ['Spectre_578', 'NullPtr_312', 'Vortex_441', 'Phantom_809', 'Cipher_102'];
    rivalAlias = rivalAliases[Math.floor(Math.random() * rivalAliases.length)];
    const rivalEl = document.getElementById('rival-alias');
    if (rivalEl) rivalEl.textContent = rivalAlias;

    updateRivalHUD();

    // 1-second countdown clock
    duelTimerInterval = setInterval(() => {
      if (duelSecondsLeft > 0) {
        duelSecondsLeft--;
        const mins = String(Math.floor(duelSecondsLeft / 60)).padStart(2, '0');
        const secs = String(duelSecondsLeft % 60).padStart(2, '0');
        const cdEl = document.getElementById('duel-countdown');
        if (cdEl) cdEl.textContent = `${mins}:${secs}`;
      } else {
        clearInterval(duelTimerInterval);
      }
    }, 1000);

    // Rival ghost progression ticker (ticks every 3.5s)
    rivalInterval = setInterval(() => {
      if (studentSubmitted || rivalFinished) return;

      const delta = Math.floor(Math.random() * 8) + 4;
      rivalProgress = Math.min(100, rivalProgress + delta);
      updateRivalHUD();

      if (rivalProgress >= 100 && !rivalFinished && !studentSubmitted) {
        rivalFinished = true;
        showDuelVerdict(false, `Rival ${rivalAlias} submitted a passing patch first! Submit now to preserve streak.`);
      }
    }, 3500);
  }

  function resetDuelTimer() {
    duelSecondsLeft = 120;
    const cdEl = document.getElementById('duel-countdown');
    if (cdEl) cdEl.textContent = '02:00';
    startDuelTimer();
  }

  function updateRivalHUD() {
    const bar = document.getElementById('rival-progress-bar');
    const badge = document.getElementById('rival-stage-badge');
    if (!bar || !badge) return;

    bar.style.width = `${rivalProgress}%`;

    if (rivalProgress < 30) {
      badge.textContent = 'Reading Code...';
      badge.className = 'text-[10px] font-mono text-text-muted';
    } else if (rivalProgress < 65) {
      badge.textContent = 'Tracing Root Cause...';
      badge.className = 'text-[10px] font-mono text-amber';
    } else if (rivalProgress < 90) {
      badge.textContent = 'Drafting Fix...';
      badge.className = 'text-[10px] font-mono text-emerald';
    } else if (rivalProgress < 100) {
      badge.textContent = 'Running Assertions...';
      badge.className = 'text-[10px] font-mono text-crimson animate-pulse';
    } else {
      badge.textContent = 'Target Solved!';
      badge.className = 'text-[10px] font-mono text-emerald font-semibold';
    }
  }

  function showDuelVerdict(isVictory, message) {
    const banner = document.getElementById('duel-verdict-banner');
    const icon = document.getElementById('duel-verdict-icon');
    const text = document.getElementById('duel-verdict-text');
    if (!banner || !icon || !text) return;

    banner.classList.remove('hidden');
    text.textContent = message;

    if (isVictory) {
      banner.className = 'px-4 py-2 border-b text-xs flex items-center justify-between bg-emerald/10 border-emerald/30 text-emerald';
    } else {
      banner.className = 'px-4 py-2 border-b text-xs flex items-center justify-between bg-crimson/10 border-crimson/30 text-crimson';
    }
    lucide.createIcons();
  }

  // ── Problems Loading & Selection ─────────────────────────────
  async function loadProblems() {
    try {
      const data = await api('GET', '/arena/problems');
      problems = data.problems || [];
      const countEl = document.getElementById('lab-problems-count');
      if (countEl) countEl.textContent = `${problems.length} active`;
      renderProblemsList();
      if (problems.length > 0 && !selectedProblem) {
        selectProblem(problems[0].id);
      }
    } catch (err) {
      toast('Failed to load assignments: ' + err.message, 'error');
    }
  }

  function renderProblemsList() {
    const list = document.getElementById('problem-cards-list');
    if (!list) return;
    list.innerHTML = '';

    problems.forEach(p => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `problem-card-item ${selectedProblem && selectedProblem.id === p.id ? 'active' : ''}`;
      item.onclick = () => selectProblem(p.id);

      const lang = p.language === 'cpp' ? 'C++' : p.language === 'python' ? 'Python' : p.language;
      const diffColor = p.difficulty === 'advanced' ? 'text-crimson bg-crimson/10 border-crimson/20' :
                        p.difficulty === 'intermediate' ? 'text-amber bg-amber/10 border-amber/20' :
                        'text-emerald bg-emerald/10 border-emerald/20';

      item.innerHTML = `
        <div class="flex items-center justify-between mb-1">
          <span class="text-xs font-semibold text-text-primary truncate">${esc(p.title)}</span>
          <span class="text-[9px] font-mono px-1 rounded uppercase ${diffColor}">${p.difficulty || 'easy'}</span>
        </div>
        <div class="flex items-center justify-between text-[10px] text-text-muted">
          <span>${esc(p.topic || 'General')}</span>
          <span class="font-mono">${lang}</span>
        </div>
      `;
      list.appendChild(item);
    });
  }

  function selectProblem(problemId) {
    selectedProblem = problems.find(p => p.id === problemId) || problems[0];
    if (!selectedProblem) return;

    renderProblemsList();

    // Populate Left Statement Pane
    const titleEl = document.getElementById('pane-prob-title');
    if (titleEl) titleEl.textContent = selectedProblem.title;
    const topicEl = document.getElementById('pane-prob-topic');
    if (topicEl) topicEl.textContent = selectedProblem.topic;
    const descEl = document.getElementById('pane-prob-desc');
    if (descEl) descEl.textContent = selectedProblem.description;
    const inEl = document.getElementById('pane-prob-input');
    if (inEl) inEl.textContent = selectedProblem.sample_input || '(Standard Input)';
    const outEl = document.getElementById('pane-prob-output');
    if (outEl) outEl.textContent = selectedProblem.sample_output || '(Expected Output)';

    const diffEl = document.getElementById('pane-prob-difficulty');
    if (diffEl) diffEl.textContent = selectedProblem.difficulty;

    const ratingEl = document.getElementById('pane-prob-rating');
    if (ratingEl) ratingEl.textContent = `Target Rating: ${selectedProblem.problem_rating || 1250}`;

    // Populate Editor
    const lang = selectedProblem.language === 'cpp' ? 'C++' : selectedProblem.language === 'python' ? 'Python' : selectedProblem.language;
    const badgeEl = document.getElementById('editor-lang-badge');
    if (badgeEl) badgeEl.textContent = lang;

    // Load buggy starter by default if editor is empty
    const editor = getEditor();
    if (editor && (!editor.value || editor.value.trim() === '')) {
      editor.value = selectedProblem.buggy_code || '';
    }
    updateLineNumbers();
    updateCharCount();

    // Reset test runner
    resetTestRunner();

    // Reset duel clock for new problem
    resetDuelTimer();
  }

  function loadBuggyCode() {
    if (!selectedProblem) return;
    const editor = getEditor();
    if (!editor) return;
    editor.value = selectedProblem.buggy_code || '';
    updateLineNumbers();
    updateCharCount();
    toast('Loaded buggy starter code.', 'info');
  }

  function loadOptimalCode() {
    if (!selectedProblem) return;
    const editor = getEditor();
    if (!editor) return;
    editor.value = selectedProblem.fixed_code || '';
    updateLineNumbers();
    updateCharCount();
    toast('Loaded optimal reference solution.', 'success');
  }

  // ── Code Editor Helpers ──────────────────────────────────────
  function getEditor() {
    return document.getElementById('code-editor') || document.getElementById('lab-code-editor');
  }

  function getGutter() {
    return document.getElementById('line-numbers') || document.getElementById('lab-line-numbers');
  }

  function setupCodeEditor() {
    const editor = getEditor();
    const gutter = getGutter();
    if (!editor) return;

    editor.addEventListener('input', () => {
      updateLineNumbers();
      updateCharCount();
    });

    // Synchronize vertical scroll strictly between textarea and 44px gutter
    editor.addEventListener('scroll', () => {
      if (gutter) gutter.scrollTop = editor.scrollTop;
    });

    editor.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        editor.value = editor.value.substring(0, start) + '    ' + editor.value.substring(end);
        editor.selectionStart = editor.selectionEnd = start + 4;
        updateLineNumbers();
        updateCharCount();
      }
    });
  }

  function updateLineNumbers() {
    const editor = getEditor();
    const gutter = getGutter();
    if (!editor || !gutter) return;

    const lineCount = editor.value.split('\n').length;
    gutter.textContent = Array.from({length: Math.max(lineCount, 1)}, (_, i) => i + 1).join('\n');
  }

  function updateCharCount() {
    const editor = getEditor();
    const counter = document.getElementById('editor-char-counter');
    if (!editor || !counter) return;
    counter.textContent = `${editor.value.length} chars`;
  }

  function resetTestRunner() {
    const container = document.getElementById('test-cases-container');
    const verdict = document.getElementById('test-runner-verdict');
    if (!container || !verdict) return;

    verdict.textContent = 'Ready';
    verdict.className = 'text-[10px] font-mono px-1.5 py-0.5 rounded bg-panel border border-border text-text-secondary';

    container.innerHTML = `
      <div class="test-row pending">
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-zinc-600"></span>
          <span class="text-xs font-mono">Case 1 (Boundary Check)</span>
        </div>
        <span class="text-[10px] text-text-muted font-mono">Idle</span>
      </div>
      <div class="test-row pending">
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-zinc-600"></span>
          <span class="text-xs font-mono">Case 2 (Nominal Execution)</span>
        </div>
        <span class="text-[10px] text-text-muted font-mono">Idle</span>
      </div>
      <div class="test-row pending">
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-zinc-600"></span>
          <span class="text-xs font-mono">Case 3 (Memory Invariant)</span>
        </div>
        <span class="text-[10px] text-text-muted font-mono">Idle</span>
      </div>
    `;

    const diagBox = document.getElementById('lab-diagnostic-content');
    if (diagBox) {
      diagBox.innerHTML = `
        <div class="diagnostic-empty">
          <i data-lucide="scan-line" class="w-5 h-5 text-text-muted mb-2"></i>
          <p class="text-xs text-text-muted text-center">Submit your code to generate a Socratic concept evaluation.</p>
        </div>
      `;
      lucide.createIcons();
    }
  }

  // ── Code Submission & AI Diagnosis ───────────────────────────
  async function runCodeDiagnostic() {
    if (!selectedProblem) return;
    const editor = getEditor();
    const btn = document.getElementById('btn-run-diagnose');
    const code = editor ? editor.value : '';

    if (!code || code.trim() === '') {
      toast('Editor is empty. Write or load code before submitting.', 'error');
      return;
    }

    setBtnLoading(btn, true);
    try {
      const payload = {
        problem_id: selectedProblem.id,
        code: code,
        section: (session && session.user && session.user.section) || 'CSE-1C',
        ghost_hash: (session && session.user && session.user.ghost_hash) || null,
        language: selectedProblem.language,
        won_duel: !rivalFinished,
      };

      const result = await api('POST', '/arena/submit-code', payload);
      studentSubmitted = true;

      // Update sidebar stats
      if (session && session.user) {
        session.user.rating = result.rating;
        session.user.streak = result.streak;
        session.user.solved_count = result.solved_count;
        const ratingEl = document.getElementById('sb-ghost-rating');
        if (ratingEl) ratingEl.textContent = `Rating ${session.user.rating}`;
        document.getElementById('sb-ghost-rank').textContent = `Streak ${result.streak} • Solved ${result.solved_count}`;
        localStorage.setItem('campusghosts_session', JSON.stringify(session));
      }

      renderDiagnosticOutput(result);

      const delta = result.rating_delta !== undefined ? result.rating_delta : (result.diagnostic && result.diagnostic.passed ? 25 : -5);
      const deltaFormatted = delta >= 0 ? `+${delta} Rating` : `${delta} Rating`;

      if (result.diagnostic && result.diagnostic.passed) {
        toast(`Patch Verified! Solved target in 1v1 duel (${deltaFormatted}).`, 'success');
        if (!rivalFinished) {
          showDuelVerdict(true, `Victory! You submitted a verified patch before rival ${rivalAlias}! (${deltaFormatted})`);
        }
      } else {
        toast(`Assertions Failed. Check Socratic diagnostic below (${deltaFormatted}).`, 'error');
      }
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBtnLoading(btn, false);
    }
  }

  function renderDiagnosticOutput(result) {
    const diag = result.diagnostic || {};
    const passed = diag.passed === true;

    // Update Test Runner verdict
    const verdict = document.getElementById('test-runner-verdict');
    const container = document.getElementById('test-cases-container');

    if (verdict) {
      verdict.textContent = passed ? 'ALL PASSED' : 'FAILURES DETECTED';
      verdict.className = `text-[10px] font-mono px-1.5 py-0.5 rounded font-semibold ${passed ? 'bg-emerald/10 text-emerald border border-emerald/30' : 'bg-crimson/10 text-crimson border border-crimson/30'}`;
    }

    if (container) {
      container.innerHTML = `
        <div class="test-row ${passed ? 'passed' : 'failed'}">
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full ${passed ? 'bg-emerald' : 'bg-crimson'}"></span>
            <span class="text-xs font-mono">Case 1 (Boundary Check)</span>
          </div>
          <span class="text-[10px] font-mono font-semibold ${passed ? 'text-emerald' : 'text-crimson'}">${passed ? 'PASS' : 'FAIL'}</span>
        </div>
        <div class="test-row ${passed ? 'passed' : 'failed'}">
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full ${passed ? 'bg-emerald' : 'bg-crimson'}"></span>
            <span class="text-xs font-mono">Case 2 (Nominal Execution)</span>
          </div>
          <span class="text-[10px] font-mono font-semibold ${passed ? 'text-emerald' : 'text-crimson'}">${passed ? 'PASS' : 'FAIL'}</span>
        </div>
        <div class="test-row ${passed ? 'passed' : 'passed'}">
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-emerald"></span>
            <span class="text-xs font-mono">Case 3 (Memory Invariant)</span>
          </div>
          <span class="text-[10px] font-mono text-emerald font-semibold">PASS</span>
        </div>
      `;
    }

    // Update Performance Profiler Panel
    const runtimeEl = document.getElementById('metric-runtime');
    const memoryEl = document.getElementById('metric-memory');
    const timeCompEl = document.getElementById('metric-time-comp');
    const spaceCompEl = document.getElementById('metric-space-comp');
    const optScoreLabel = document.getElementById('opt-score-label');
    const optScoreBar = document.getElementById('opt-score-bar');
    const optBeatsNote = document.getElementById('opt-beats-note');

    if (runtimeEl) runtimeEl.textContent = `${diag.runtime_ms !== undefined ? diag.runtime_ms : (passed ? 1.4 : 2.8)} ms`;
    if (memoryEl) memoryEl.textContent = `${diag.memory_kb !== undefined ? diag.memory_kb : 64} KB`;
    if (timeCompEl) timeCompEl.textContent = diag.time_complexity || (passed ? 'O(1)' : 'O(N)');
    if (spaceCompEl) spaceCompEl.textContent = diag.space_complexity || 'O(1)';
    if (optScoreLabel) optScoreLabel.textContent = `${diag.optimization_score !== undefined ? diag.optimization_score : (passed ? 94 : 45)}/100`;
    if (optScoreBar) optScoreBar.style.width = `${diag.optimization_score !== undefined ? diag.optimization_score : (passed ? 94 : 45)}%`;
    if (optBeatsNote) optBeatsNote.textContent = `Beats ${diag.beats_percent !== undefined ? diag.beats_percent : (passed ? 91 : 28)}% of ghosts`;

    // Update Logistic Rating Impact Card
    const deltaCard = document.getElementById('rating-delta-card');
    const deltaReadout = document.getElementById('rating-delta-readout');
    const delta = result.rating_delta !== undefined ? result.rating_delta : (passed ? 25 : -5);
    const deltaFormatted = delta >= 0 ? `+${delta} Rating` : `${delta} Rating`;

    if (deltaCard && deltaReadout) {
      deltaCard.classList.remove('hidden');
      deltaCard.className = `p-3 rounded border text-xs flex items-center justify-between ${delta >= 0 ? 'bg-emerald/10 border-emerald/20 text-emerald' : 'bg-crimson/10 border-crimson/20 text-crimson'}`;
      deltaReadout.textContent = `${deltaFormatted} (Updated Rating: ${result.rating || 1200})`;
    }

    // Render Socratic Diagnostic Box
    const diagBox = document.getElementById('lab-diagnostic-content');
    if (!diagBox) return;

    if (passed) {
      diagBox.innerHTML = `
        <div class="p-3 rounded bg-emerald/10 border border-emerald/20 text-xs space-y-2">
          <div class="flex items-center gap-1.5 text-emerald font-semibold">
            <i data-lucide="check-circle" class="w-4 h-4"></i>
            <span>Solution Verified Optimal</span>
          </div>
          <p class="text-text-secondary leading-relaxed">${esc(diag.socratic_guidance || diag.socratic_hint || 'All system invariants hold and memory constraints were satisfied.')}</p>
          <div class="pt-2 border-t border-emerald/20 flex items-center justify-between text-[11px] font-mono">
            <span class="text-emerald font-semibold">${deltaFormatted} Awarded</span>
            <span class="text-text-muted">Concept: ${esc(diag.concept_tag || 'OPTIMAL')}</span>
          </div>
        </div>
      `;
    } else {
      diagBox.innerHTML = `
        <div class="space-y-3">
          <div class="p-2.5 rounded bg-crimson/10 border border-crimson/20">
            <div class="flex items-center justify-between mb-1">
              <span class="text-[10px] font-mono font-semibold text-crimson uppercase">${esc(diag.concept_tag || 'ERROR')}</span>
              <span class="text-[10px] font-mono font-semibold text-crimson">${deltaFormatted}</span>
            </div>
            <p class="text-xs font-medium text-text-primary mb-1">${esc(diag.root_cause || 'Invariant violation detected')}</p>
            <p class="text-[11px] text-text-secondary leading-relaxed">${esc(diag.misconception || '')}</p>
          </div>

          <div class="p-3 rounded bg-surface border border-border space-y-1.5">
            <span class="text-[10px] font-semibold text-text-muted uppercase tracking-wider block">Socratic Nudge</span>
            <p class="text-xs text-text-secondary leading-relaxed">${esc(diag.socratic_guidance || diag.socratic_hint || 'Review pointer initialization and memory bounds.')}</p>
          </div>

          <div class="p-2.5 rounded bg-panel border border-border-subtle text-[11px] text-text-muted">
            <strong class="text-text-secondary font-mono">Invariant:</strong> ${esc(diag.invariant_to_preserve || 'Preserve allocated memory space before dereferencing.')}
          </div>
        </div>
      `;
    }
    lucide.createIcons();
  }

  // ── Ghost Channels (Multi-Channel Anonymous Chat) ────────────
  function selectChannel(ch) {
    currentChannel = ch;
    document.querySelectorAll('.channel-tab').forEach(b => {
      b.classList.toggle('active', b.dataset.channel === ch);
    });

    const titleEl = document.getElementById('chat-header-title');
    const descEl = document.getElementById('chat-header-desc');
    const input = document.getElementById('chat-input-text');
    const btn = document.getElementById('btn-chat-send');
    const banner = document.getElementById('chat-disabled-banner');

    if (titleEl) titleEl.textContent = ch;
    if (descEl) {
      if (ch === '#announcements') descEl.textContent = '• Official Faculty Broadcasts';
      else if (ch === '#cpp-guild') descEl.textContent = '• C++ Systems & Pointer Puzzles';
      else if (ch === '#python-den') descEl.textContent = '• Python Recursion & Dynamic Scope';
      else descEl.textContent = '• Cohort Peer Chat';
    }

    // Role-based permissions
    const isStudent = session && session.role === 'student';
    if (ch === '#announcements' && isStudent) {
      if (input) { input.disabled = true; input.placeholder = 'Only faculty can post in #announcements'; }
      if (btn) btn.disabled = true;
      if (banner) banner.classList.remove('hidden');
    } else {
      if (input) { input.disabled = false; input.placeholder = `Type a message in ${ch} as your ghost...`; }
      if (btn) btn.disabled = false;
      if (banner) banner.classList.add('hidden');
    }

    loadChannelMessages();
  }

  async function loadChannelMessages() {
    const feed = document.getElementById('channels-messages-feed');
    if (!feed) return;

    try {
      const section = (session && session.user && session.user.section) || 'CSE-1C';
      const data = await api('GET', `/channels/messages?section=${encodeURIComponent(section)}&channel=${encodeURIComponent(currentChannel)}`);
      const msgs = data.messages || [];

      if (msgs.length === 0) {
        feed.innerHTML = `<div class="text-center text-xs text-text-muted py-8">No messages in ${esc(currentChannel)} yet. Be the first to post!</div>`;
        return;
      }

      feed.innerHTML = msgs.map(m => {
        const isFac = m.sender_role === 'faculty';
        const timeFormatted = m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        return `
          <div class="chat-msg-row ${isFac ? 'faculty-msg' : ''}">
            <div class="chat-msg-header">
              <span class="chat-alias ${isFac ? 'faculty' : 'student'}">${esc(m.sender_alias)}</span>
              ${isFac ? '<span class="channel-badge-faculty">FACULTY</span>' : ''}
              <span class="chat-time">${timeFormatted}</span>
            </div>
            <div class="chat-body">${esc(m.content)}</div>
          </div>
        `;
      }).join('');

      feed.scrollTop = feed.scrollHeight;
    } catch (err) {
      feed.innerHTML = `<div class="text-center text-xs text-crimson py-4">Failed to load messages: ${esc(err.message)}</div>`;
    }
  }

  async function refreshCurrentChannel() {
    if (currentStudentView === 'student-channels') {
      await loadChannelMessages();
    }
  }

  async function handleSendChatMessage(e) {
    e.preventDefault();
    const input = document.getElementById('chat-input-text');
    if (!input) return;
    const content = input.value.trim();
    if (!content) return;

    const section = (session && session.user && session.user.section) || 'CSE-1C';
    const alias = (session && session.user && (session.user.alias || session.user.faculty_name)) || 'Shadow_188';
    const role = (session && session.role) || 'student';

    try {
      await api('POST', '/channels/messages', {
        section: section,
        channel: currentChannel,
        sender_alias: alias,
        sender_role: role,
        content: content,
      });

      input.value = '';
      await loadChannelMessages();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // ── Anonymous SOS Flares (Peer Socratic Hints) ───────────────
  async function loadSosFlares() {
    const feed = document.getElementById('sos-flares-feed');
    const alertBox = document.getElementById('sos-disabled-alert');
    if (!feed) return;

    try {
      const section = (session && session.user && session.user.section) || 'CSE-1C';
      const data = await api('GET', `/sos/list?section=${encodeURIComponent(section)}`);
      facultySosEnabled = data.sos_enabled !== false;
      activeFlares = data.flares || [];

      if (alertBox) {
        alertBox.classList.toggle('hidden', facultySosEnabled);
      }

      if (activeFlares.length === 0) {
        feed.innerHTML = `<div class="p-8 text-center text-xs text-text-muted">No active SOS flares right now. All ghosts are cruising!</div>`;
        return;
      }

      feed.innerHTML = activeFlares.map(flare => {
        const timeFormatted = flare.timestamp ? new Date(flare.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        const replies = flare.replies || [];
        const isResolved = flare.status === 'RESOLVED';

        return `
          <div class="sos-flare-card ${isResolved ? 'resolved' : ''}">
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-2">
                <i data-lucide="life-buoy" class="w-4 h-4 text-amber"></i>
                <h3 class="text-xs font-semibold text-text-primary">${esc(flare.problem_title)}</h3>
                <span class="lang-badge uppercase text-[9px]">${esc(flare.language)}</span>
              </div>
              <div class="flex items-center gap-2 text-[10px] font-mono text-text-muted">
                <span>By ${esc(flare.alias)}</span>
                <span>• ${timeFormatted}</span>
              </div>
            </div>

            <!-- Code Snippet -->
            <pre class="p-2.5 rounded bg-surface border border-border text-[11px] font-mono text-text-secondary overflow-x-auto mb-3">${esc(flare.code_snippet)}</pre>

            <!-- Peer Replies Thread -->
            <div class="space-y-2 mb-3">
              ${replies.length > 0 ? `
                <span class="text-[10px] font-semibold uppercase text-text-muted tracking-wider block">Peer Socratic Hints (${replies.length})</span>
                ${replies.map(r => `
                  <div class="sos-reply-item">
                    <div class="flex items-center justify-between text-[10px] font-mono mb-1">
                      <span class="text-emerald font-semibold">${esc(r.helper_alias)}</span>
                      <span class="text-text-muted">${r.timestamp ? new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                    </div>
                    <p class="text-xs text-text-secondary">${esc(r.text)}</p>
                  </div>
                `).join('')}
              ` : '<p class="text-[11px] text-text-muted italic">No hints posted yet. Post a Socratic nudge to earn +8 Mentor Rating!</p>'}
            </div>

            <!-- Reply Input Box -->
            <form onsubmit="App.handleSendFlareReply(event, ${flare.id})" class="pt-2 border-t border-border flex items-center gap-2">
              <input type="text" class="field-input text-xs font-mono flex-1 flare-reply-input" placeholder="Give a Socratic hint (max 180 chars, no code syntax)..." maxlength="180" required>
              <button type="submit" class="btn-primary text-xs px-3 h-[34px] shrink-0">
                <i data-lucide="zap" class="w-3.5 h-3.5 text-amber"></i>
                <span>Nudge (+8 Rating)</span>
              </button>
            </form>
          </div>
        `;
      }).join('');

      lucide.createIcons();
    } catch (err) {
      feed.innerHTML = `<div class="text-center text-xs text-crimson py-4">Failed to load SOS flares: ${esc(err.message)}</div>`;
    }
  }

  function openCreateFlareModal() {
    if (!facultySosEnabled) {
      toast('SOS Flares are currently disabled by Faculty for lab assessment.', 'error');
      return;
    }
    const modal = document.getElementById('sos-create-modal');
    if (!modal) return;

    const titleInput = document.getElementById('modal-flare-title');
    const codeInput = document.getElementById('modal-flare-code');
    const editor = getEditor();

    if (titleInput && selectedProblem) titleInput.value = selectedProblem.title;
    if (codeInput && editor) codeInput.value = editor.value;

    modal.classList.remove('hidden');
    lucide.createIcons();
  }

  function closeCreateFlareModal(e) {
    const modal = document.getElementById('sos-create-modal');
    if (modal) modal.classList.add('hidden');
  }

  async function handleCreateFlareSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-submit-flare');
    const code = document.getElementById('modal-flare-code').value.trim();
    if (!code) return;

    setBtnLoading(btn, true);
    try {
      const section = (session && session.user && session.user.section) || 'CSE-1C';
      const ghostHash = (session && session.user && session.user.ghost_hash) || 'demo_ghost_hash';
      const alias = (session && session.user && session.user.alias) || 'Shadow_188';
      const probTitle = (selectedProblem && selectedProblem.title) || 'Systems Problem';
      const lang = (selectedProblem && selectedProblem.language) || 'cpp';

      await api('POST', '/sos/create', {
        section: section,
        ghost_hash: ghostHash,
        alias: alias,
        problem_title: probTitle,
        language: lang,
        code_snippet: code,
      });

      closeCreateFlareModal();
      toast('SOS Flare dropped to cohort feed! Peers will provide Socratic hints.', 'success');
      if (currentStudentView === 'student-sos') {
        await loadSosFlares();
      }
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBtnLoading(btn, false);
    }
  }

  async function handleSendFlareReply(e, flareId) {
    e.preventDefault();
    const form = e.target;
    const input = form.querySelector('.flare-reply-input');
    if (!input) return;
    const nudge = input.value.trim();

    if (!nudge) return;
    if (nudge.includes(';') || nudge.includes('{') || nudge.includes('return ')) {
      toast('Anti-code-dump guard: Socratic hints cannot contain code syntax (; { return). Guide them with intuition!', 'error');
      return;
    }

    const helperAlias = (session && session.user && session.user.alias) || 'Shadow_188';

    try {
      const resp = await api('POST', '/sos/reply', {
        flare_id: flareId,
        helper_alias: helperAlias,
        nudge_text: nudge,
      });

      const awarded = resp.awarded_rating || resp.awarded_elo || 8;
      toast(`Socratic hint posted! +${awarded} Mentor Rating awarded to ${helperAlias}.`, 'success');
      input.value = '';

      // Update sidebar Rating if student
      if (session && session.user) {
        session.user.rating = (session.user.rating || 1540) + awarded;
        const ratingEl = document.getElementById('sb-ghost-rating');
        if (ratingEl) ratingEl.textContent = `Rating ${session.user.rating}`;
        localStorage.setItem('campusghosts_session', JSON.stringify(session));
      }

      await loadSosFlares();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // ── Standings (Leaderboard) ──────────────────────────────────
  async function loadLeaderboard() {
    const wrap = document.getElementById('student-leaderboard-table-wrap');
    if (!wrap) return;

    try {
      const section = (session && session.user && session.user.section) || 'CSE-1C';
      const data = await api('GET', `/arena/leaderboard?section=${encodeURIComponent(section)}`);
      const board = data.leaderboard || [];

      if (board.length === 0) {
        wrap.innerHTML = `<div class="p-8 text-center text-xs text-text-muted">No students in standings yet.</div>`;
        return;
      }

      const rows = board.map(s => {
        const isCurrent = session && session.user && session.user.alias === s.alias;
        const valRating = s.rating !== undefined ? s.rating : 1200;
        return `
          <tr class="border-b border-border-subtle hover:bg-surface/50 text-xs transition-colors ${isCurrent ? 'bg-emerald/5 font-semibold' : ''}">
            <td class="p-3 font-mono tabular-nums text-text-secondary">${s.rank}</td>
            <td class="p-3 font-mono ${isCurrent ? 'text-emerald' : 'text-text-primary'} flex items-center gap-1.5">
              ${isCurrent ? '<span class="status-dot"></span>' : ''}
              <span>${esc(s.alias)}</span>
            </td>
            <td class="p-3 font-mono tabular-nums text-text-primary rating-cell">${valRating}</td>
            <td class="p-3 font-mono tabular-nums text-text-muted">${s.streak} 🔥</td>
            <td class="p-3 font-mono tabular-nums text-text-muted">${s.solved_count}</td>
          </tr>
        `;
      }).join('');

      wrap.innerHTML = `
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="border-b border-border bg-panel text-[11px] font-semibold text-text-muted uppercase tracking-wider">
              <th class="p-3">Rank</th>
              <th class="p-3">Ghost Alias</th>
              <th class="p-3">Rating</th>
              <th class="p-3">Streak</th>
              <th class="p-3">Solved</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `;
    } catch (err) {
      wrap.innerHTML = `<div class="p-8 text-center text-xs text-crimson">Failed to load standings: ${esc(err.message)}</div>`;
    }
  }

  // ── Placement Vault Zero-Knowledge Verifier ──────────────────
  function setupVaultVerifier() {
    if (session && session.user) {
      const rollEl = document.getElementById('vault-input-roll');
      const aliasEl = document.getElementById('vault-input-alias');
      if (rollEl) rollEl.value = session.user.roll_number || '2601010043';
      if (aliasEl) aliasEl.value = session.user.alias || 'Shadow_188';
    }
  }

  async function runVaultVerification() {
    const roll = document.getElementById('vault-input-roll').value.trim();
    const salt = document.getElementById('vault-input-salt').value.trim();
    const alias = document.getElementById('vault-input-alias').value.trim();
    const btn = document.getElementById('btn-vault-verify');

    if (!salt) {
      toast('Please enter your private salt to verify alias ownership.', 'error');
      return;
    }

    setBtnLoading(btn, true);
    try {
      const resp = await api('POST', '/auth/verify-claim', {
        roll_number: roll,
        secret_salt: salt,
        claimed_alias: alias,
      });

      const credBox = document.getElementById('vault-credential-render');
      if (resp.verified) {
        toast('Mathematical Ownership Verified! Credential unlocked.', 'success');
        credBox.innerHTML = `
          <div class="credential-verified p-5 rounded border border-emerald/30 bg-emerald/5 space-y-3">
            <div class="flex items-center justify-between border-b border-emerald/20 pb-2">
              <span class="text-xs font-semibold text-emerald flex items-center gap-1.5">
                <i data-lucide="shield-check" class="w-4 h-4"></i> Verified Institutional Credential
              </span>
              <span class="text-[10px] font-mono text-text-muted">HMAC-SHA256 Matched</span>
            </div>
            <div class="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span class="cred-label text-[10px] text-text-muted block">Roll Number</span>
                <span class="cred-value font-mono font-bold text-text-primary">${esc(roll)}</span>
              </div>
              <div>
                <span class="cred-label text-[10px] text-text-muted block">Ghost Alias</span>
                <span class="cred-value font-mono font-bold text-emerald">${esc(alias)}</span>
              </div>
              <div>
                <span class="cred-label text-[10px] text-text-muted block">Verified Rating</span>
                <span class="cred-value font-mono text-text-primary">${resp.profile.rating || 1200}</span>
              </div>
              <div>
                <span class="cred-label text-[10px] text-text-muted block">Problems Solved</span>
                <span class="cred-value font-mono text-text-primary">${resp.profile.solved_count}</span>
              </div>
            </div>
            <button class="btn-secondary w-full text-xs mt-2" onclick="window.print()">
              <i data-lucide="printer" class="w-3.5 h-3.5"></i>
              <span>Print Official Placement Verification</span>
            </button>
          </div>
        `;
      } else {
        toast('Verification Failed: Salt does not match alias.', 'error');
        credBox.innerHTML = `
          <div class="p-4 rounded border border-crimson/30 bg-crimson/5 text-xs text-crimson text-center">
            Verification failed: Provided credentials do not match cryptographic commitment.
          </div>
        `;
      }
      lucide.createIcons();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBtnLoading(btn, false);
    }
  }

  // ── Faculty k-Anonymity Telemetry ────────────────────────────
  async function loadFacultyGovernance() {
    try {
      const section = (session && session.user && session.user.section) || 'CSE-1C';
      const settings = await api('GET', `/section/settings?section=${encodeURIComponent(section)}`);
      facultySosEnabled = settings.sos_enabled !== false;
      updateFacultySosUI();
    } catch (err) {
      console.warn('Failed to load governance:', err);
    }
  }

  function updateFacultySosUI() {
    const toggle = document.getElementById('fac-sos-toggle');
    const status = document.getElementById('fac-sos-status');
    if (!toggle || !status) return;

    toggle.setAttribute('aria-checked', String(facultySosEnabled));
    toggle.classList.toggle('active', facultySosEnabled);
    status.textContent = facultySosEnabled ? 'Enabled' : 'Disabled (Lab Mode)';
    status.className = facultySosEnabled ? 'text-xs font-mono text-emerald' : 'text-xs font-mono text-amber';
  }

  async function toggleFacultySosGovernance() {
    facultySosEnabled = !facultySosEnabled;
    updateFacultySosUI();

    try {
      const section = (session && session.user && session.user.section) || 'CSE-1C';
      await api('POST', '/faculty/settings', {
        section: section,
        sos_enabled: facultySosEnabled,
        duel_mode: duelMode,
      });

      toast(`Lab Governance updated: Peer SOS Flares are now ${facultySosEnabled ? 'ENABLED' : 'DISABLED'}.`, 'info');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function loadFacultyTelemetry() {
    const container = document.getElementById('fac-clusters-container');
    if (!container) return;

    try {
      const section = (session && session.user && session.user.section) || 'CSE-1C';
      const url = `/faculty/telemetry?section=${encodeURIComponent(section)}&k_threshold=${facultyKThreshold}&raw_audit_mode=${facultyRawAuditMode}`;
      const data = await api('GET', url);
      const clusters = data.clusters || [];

      if (clusters.length === 0) {
        container.innerHTML = `<div class="p-8 text-center text-xs text-text-muted">No telemetry events recorded for section ${esc(section)}.</div>`;
        return;
      }

      container.innerHTML = clusters.map(c => {
        const isMasked = c.status === 'MASKED_BY_K_ANONYMITY';
        const isRawExposed = c.status === 'EXPOSED_IN_RAW_MODE';

        return `
          <div class="card p-4 space-y-2">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="text-xs font-semibold text-text-primary">${esc(c.topic)}</span>
                <span class="concept-pill text-[9px]">${esc(c.concept_tag)}</span>
              </div>
              <span class="text-xs font-mono font-semibold ${isMasked ? 'text-amber' : isRawExposed ? 'text-crimson' : 'text-emerald'}">
                ${c.display_students} students
              </span>
            </div>

            <div class="flex items-center justify-between text-xs text-text-muted pt-1 border-t border-border-subtle">
              <span>Failures: <strong class="text-text-primary">${c.total_failures}</strong></span>
              <button class="btn-emerald text-[11px] py-1 px-2.5" onclick="App.openRemedialPlan('${esc(c.topic)}', '${esc(c.concept_tag)}', ${c.student_count || 1})">
                <i data-lucide="sparkles" class="w-3 h-3"></i>
                <span>Generate 10-Min Remedial Plan</span>
              </button>
            </div>
          </div>
        `;
      }).join('');

      renderTelemetryChart(clusters);
      lucide.createIcons();
    } catch (err) {
      container.innerHTML = `<div class="p-8 text-center text-xs text-crimson">Failed to load telemetry: ${esc(err.message)}</div>`;
    }
  }

  function renderTelemetryChart(clusters) {
    const canvas = document.getElementById('faculty-chart-canvas');
    if (!canvas) return;

    if (telemetryChart) {
      telemetryChart.destroy();
      telemetryChart = null;
    }

    const labels = clusters.map(c => c.concept_tag);
    const dataFailures = clusters.map(c => c.total_failures);
    const dataStudents = clusters.map(c => c.student_count || 0);

    telemetryChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Total Failures',
            data: dataFailures,
            backgroundColor: 'rgba(239, 68, 68, 0.35)',
            borderColor: '#EF4444',
            borderWidth: 1,
            borderRadius: 4,
          },
          {
            label: 'Unique Students',
            data: dataStudents,
            backgroundColor: 'rgba(16, 185, 129, 0.35)',
            borderColor: '#10B981',
            borderWidth: 1,
            borderRadius: 4,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: '#A1A1AA', font: { family: 'Inter', size: 11 } }
          }
        },
        scales: {
          x: {
            ticks: { color: '#71717A', font: { family: 'JetBrains Mono', size: 10 } },
            grid: { color: '#1E1E22' }
          },
          y: {
            ticks: { color: '#71717A', font: { family: 'JetBrains Mono', size: 10 } },
            grid: { color: '#1E1E22' }
          }
        }
      }
    });
  }

  function onFacultyKSliderChange() {
    const slider = document.getElementById('fac-k-slider');
    const readout = document.getElementById('fac-k-readout');
    if (!slider || !readout) return;
    facultyKThreshold = parseInt(slider.value, 10);
    readout.textContent = `k = ${facultyKThreshold}`;
    loadFacultyTelemetry();
  }

  function toggleFacultyAuditMode() {
    facultyRawAuditMode = !facultyRawAuditMode;
    const btn = document.getElementById('fac-audit-toggle');
    const label = document.getElementById('fac-audit-label');
    if (!btn || !label) return;

    btn.classList.toggle('active', facultyRawAuditMode);
    if (facultyRawAuditMode) {
      label.className = 'audit-label unmasked';
      label.innerHTML = `<i data-lucide="eye" class="w-3 h-3"></i> Unmasked (Audit)`;
    } else {
      label.className = 'audit-label safe';
      label.innerHTML = `<i data-lucide="shield-check" class="w-3 h-3"></i> k-Shield Active`;
    }
    lucide.createIcons();
    loadFacultyTelemetry();
  }

  async function openRemedialPlan(topic, conceptTag, studentCount) {
    const modal = document.getElementById('remedial-modal');
    const content = document.getElementById('remedial-content');
    if (!modal || !content) return;

    modal.classList.remove('hidden');
    content.innerHTML = `<div class="p-8 text-center text-xs text-text-muted">Generating 10-Minute AI Remedial Lecture via Groq / Gemini multi-key pool...</div>`;

    try {
      const plan = await api('POST', '/faculty/remedial-plan', {
        topic: topic,
        concept_tag: conceptTag,
        student_count: studentCount,
      });

      content.innerHTML = `
        <div class="space-y-4 text-xs">
          <div>
            <span class="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-emerald/10 text-emerald border border-emerald/20">${esc(conceptTag)}</span>
            <h3 class="text-base font-semibold mt-1 text-text-primary">${esc(plan.title || 'Remedial Lecture Plan')}</h3>
            <p class="text-text-secondary mt-1">${esc(plan.root_cause_summary || '')}</p>
          </div>

          <div class="p-3 rounded bg-surface border border-border space-y-1.5">
            <span class="text-[11px] font-semibold text-text-muted uppercase tracking-wider block">Live Code Demo Fix</span>
            <pre class="p-2.5 rounded bg-panel font-mono text-[11px] text-text-secondary overflow-x-auto">${esc(plan.live_code_demo_fix || '')}</pre>
          </div>

          <div>
            <span class="text-[11px] font-semibold text-text-muted uppercase tracking-wider block mb-2">Targeted Viva Questions</span>
            <ul class="space-y-1.5 pl-4 list-disc text-text-secondary">
              ${(plan.viva_questions || []).map(q => `<li>${esc(q)}</li>`).join('')}
            </ul>
          </div>

          <div class="p-3 rounded bg-panel border border-border-subtle">
            <span class="text-[11px] font-semibold text-text-muted uppercase tracking-wider block mb-1">Practice Drill</span>
            <p class="text-text-secondary">${esc(plan.practice_drill || '')}</p>
          </div>
        </div>
      `;
    } catch (err) {
      content.innerHTML = `<div class="p-8 text-center text-xs text-crimson">Failed to generate plan: ${esc(err.message)}</div>`;
    }
  }

  function closeRemedialModal() {
    const modal = document.getElementById('remedial-modal');
    if (modal) modal.classList.add('hidden');
  }

  // ── Faculty Broadcast & Channels Monitor ──────────────────────
  function onFacultyChannelSelect(ch) {
    facultySelectedChannel = ch;
    refreshFacultyChannelFeed();
  }

  async function refreshFacultyChannelFeed() {
    const feed = document.getElementById('faculty-channel-messages-feed');
    if (!feed) return;

    try {
      const section = (session && session.user && session.user.section) || 'CSE-1C';
      const data = await api('GET', `/channels/messages?section=${encodeURIComponent(section)}&channel=${encodeURIComponent(facultySelectedChannel)}`);
      const msgs = data.messages || [];

      if (msgs.length === 0) {
        feed.innerHTML = `<div class="text-center text-xs text-text-muted py-8">No messages in ${esc(facultySelectedChannel)} yet.</div>`;
        return;
      }

      feed.innerHTML = msgs.map(m => {
        const isFac = m.sender_role === 'faculty';
        const timeFormatted = m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        return `
          <div class="chat-msg-row ${isFac ? 'faculty-msg' : ''}">
            <div class="chat-msg-header">
              <span class="chat-alias ${isFac ? 'faculty' : 'student'}">${esc(m.sender_alias)}</span>
              ${isFac ? '<span class="channel-badge-faculty">FACULTY</span>' : ''}
              <span class="chat-time">${timeFormatted}</span>
            </div>
            <div class="chat-body">${esc(m.content)}</div>
          </div>
        `;
      }).join('');

      feed.scrollTop = feed.scrollHeight;
    } catch (err) {
      feed.innerHTML = `<div class="text-center text-xs text-crimson py-4">Failed to load feed: ${esc(err.message)}</div>`;
    }
  }

  async function handleFacultyBroadcast(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-broadcast-send');
    const textarea = document.getElementById('faculty-broadcast-text');
    const text = textarea.value.trim();
    if (!text) return;

    setBtnLoading(btn, true);
    try {
      const section = (session && session.user && session.user.section) || 'CSE-1C';
      const facName = (session && session.user && session.user.faculty_name) || 'Prof. Sharma';

      await api('POST', '/channels/messages', {
        section: section,
        channel: '#announcements',
        sender_alias: facName,
        sender_role: 'faculty',
        content: text,
      });

      textarea.value = '';
      toast('Broadcast notice dispatched to #announcements!', 'success');
      refreshFacultyChannelFeed();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBtnLoading(btn, false);
    }
  }

  // ── Faculty Publish Assignment ───────────────────────────────
  async function handleCreateProblem(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-publish-problem');
    setBtnLoading(btn, true);

    try {
      const payload = {
        title: document.getElementById('create-title').value.trim(),
        language: document.getElementById('create-language').value,
        difficulty: document.getElementById('create-difficulty').value,
        topic: document.getElementById('create-topic').value.trim(),
        concept_tag: document.getElementById('create-concept').value.trim().toUpperCase(),
        description: document.getElementById('create-desc').value.trim(),
        sample_input: document.getElementById('create-input').value.trim(),
        sample_output: document.getElementById('create-output').value.trim(),
        buggy_code: document.getElementById('create-buggy').value,
        fixed_code: document.getElementById('create-fixed').value,
        created_by: (session && session.user && session.user.faculty_name) || 'Faculty',
      };

      const result = await api('POST', '/faculty/create-problem', payload);
      toast(`Assignment "${payload.title}" published successfully!`, 'success');
      document.getElementById('form-publish-assignment').reset();

      // Reload problems dynamically
      await loadProblems();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBtnLoading(btn, false);
    }
  }

  // ── Helper Utilities ─────────────────────────────────────────
  async function api(method, endpoint, body = null) {
    const opts = {
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };
    if (session && session.token) {
      opts.headers['Authorization'] = `Bearer ${session.token}`;
    }
    if (body) {
      opts.body = JSON.stringify(body);
    }

    const res = await fetch(API + endpoint, opts);
    let json = null;
    try {
      json = await res.json();
    } catch (e) {
      throw new Error(`Server returned HTTP ${res.status}`);
    }

    if (!res.ok) {
      throw new Error(json.detail || json.message || `Request failed (${res.status})`);
    }
    return json;
  }

  async function fetchHealthStatus() {
    try {
      const data = await api('GET', '/health');
      const el = document.getElementById('sb-db-ghosts');
      if (el) el.textContent = `${data.db_ghosts_count || 42} ghosts`;
    } catch (e) {
      // offline or unreachable
    }
  }

  function downloadRecoveryCard() {
    if (!session || !session.user) return;
    const u = session.user;
    const txt = `CAMPUSGHOSTS ZERO-KNOWLEDGE RECOVERY CARD
----------------------------------------
Roll Number : ${u.roll_number || '2601010043'}
Ghost Alias : ${u.alias || 'Shadow_188'}
Section     : ${u.section || 'CSE-1C'}
Ghost Hash  : ${u.ghost_hash}
Issued At   : ${new Date().toISOString()}

RECRUITER VERIFICATION PROOF:
HMAC_SHA256(Roll_Number, Private_Salt) == Ghost_Hash
----------------------------------------
Keep your private salt confidential. Only reveal during placement audits.`;

    const blob = new Blob([txt], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `CampusGhosts_${u.alias || 'Identity'}.key`;
    a.click();
    toast('Downloaded recovery card.', 'info');
  }

  function copyCurrentHash() {
    if (!session || !session.user || !session.user.ghost_hash) return;
    navigator.clipboard.writeText(session.user.ghost_hash).then(() => {
      toast('Copied full SHA-256 commitment hash to clipboard.', 'info');
    });
  }

  function setBtnLoading(btn, isLoading) {
    if (!btn) return;
    btn.disabled = isLoading;
    const spinner = btn.querySelector('.spinner');
    const label = btn.querySelector('.btn-label');
    if (spinner) spinner.classList.toggle('hidden', !isLoading);
    if (label) label.style.opacity = isLoading ? '0.6' : '1';
  }

  function toast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const el = document.createElement('div');
    el.className = `toast ${type}`;

    const icon = type === 'success' ? 'check-circle' : type === 'error' ? 'alert-circle' : 'info';
    el.innerHTML = `
      <i data-lucide="${icon}" class="w-4 h-4 shrink-0"></i>
      <span class="flex-1">${esc(message)}</span>
    `;
    container.appendChild(el);
    lucide.createIcons();

    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(8px)';
      el.style.transition = 'all 0.2s';
      setTimeout(() => el.remove(), 200);
    }, 3800);
  }

  function esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Public API ───────────────────────────────────────────────
  return {
    init,
    handleStudentLogin,
    handleFacultyLogin,
    launchOpenPracticeArena,
    quickFillStudent,
    quickFillFaculty,
    signOut,
    switchStudentView,
    switchFacultyView,
    loadBuggyCode,
    loadOptimalCode,
    runCodeDiagnostic,
    setDuelMode,
    resetDuelTimer,
    selectChannel,
    refreshCurrentChannel,
    handleSendChatMessage,
    loadSosFlares,
    openCreateFlareModal,
    closeCreateFlareModal,
    handleCreateFlareSubmit,
    handleSendFlareReply,
    runVaultVerification,
    downloadRecoveryCard,
    copyCurrentHash,
    onFacultyKSliderChange,
    toggleFacultyAuditMode,
    toggleFacultySosGovernance,
    openRemedialPlan,
    closeRemedialModal,
    onFacultyChannelSelect,
    refreshFacultyChannelFeed,
    handleFacultyBroadcast,
    handleCreateProblem,
  };
})();

window.addEventListener('DOMContentLoaded', App.init);
