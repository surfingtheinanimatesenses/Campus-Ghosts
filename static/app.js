/**
 * app.js — Multi-Portal & Multi-Page Controller for CampusGhosts v3.0
 *
 * Strictly separates user experiences into 4 isolated application views:
 *   0. Role Gateway (#view-portal-gate)
 *   1. Student Portal (#portal-student): Overview | Solo Practice Lab | Placement Vault | Leaderboard
 *   2. Faculty Console (#portal-faculty): k-Anonymous Telemetry | Remedial Planner | DB Audit
 *   3. 1v1 Dueling Portal (#portal-arena): Live Server Browser & Lobby -> Active Match Arena
 */

import { AntiCheatGuard } from "./guard.js";
import { GhostReplayEngine, DEMO_PRESETS } from "./replay.js";

// ---------------------------------------------------------------------------
// Embedded Fallback Problem Catalog (Synced dynamically from /api/problems)
// ---------------------------------------------------------------------------
const FALLBACK_PROBLEMS = {
  "arr-bound": {
    id: "arr-bound",
    title: "Bounded Array Sum",
    concept_tag: "ARRAY_OUT_OF_BOUNDS",
    difficulty: "Easy",
    description: "Sum array elements strictly respecting boundary invariants [0, N-1] without off-by-one overruns.",
    starter_code: {
      cpp: `// Target: Bounded Array Sum Accumulator (C++)\n#include <iostream>\n#include <vector>\n\nint sumArrayElements(const std::vector<int>& arr) {\n    int total = 0;\n    for (size_t i = 0; i < arr.size(); ++i) {\n        total += arr[i];\n    }\n    return total;\n}`,
      python: `# Target: Bounded Array Sum Accumulator (Python)\ndef sum_array_elements(arr: list[int]) -> int:\n    total = 0\n    for x in arr:\n        total += x\n    return total`,
    },
    buggy_code: {
      cpp: `// Buggy C++: Off-by-one <= causes buffer overread\n#include <vector>\n\nint sumArrayElements(const std::vector<int>& arr) {\n    int total = 0;\n    for (size_t i = 0; i <= arr.size(); ++i) {\n        total += arr[i];\n    }\n    return total;\n}`,
      python: `# Buggy Python: range(len + 1) raises IndexError\ndef sum_array_elements(arr: list[int]) -> int:\n    total = 0\n    for i in range(len(arr) + 1):\n        total += arr[i]\n    return total`,
    },
  },
  "ptr-swap": {
    id: "ptr-swap",
    title: "Safe Pointer Swap",
    concept_tag: "POINTER_DEREF_NULL",
    difficulty: "Medium",
    description: "Swap two values in-place via pointers. Invariant: Never dereference null or uninitialized memory.",
    starter_code: {
      cpp: `// Target: In-Place Pointer Swap (C++)\nvoid swapValues(int* a, int* b) {\n    if (!a || !b) return;\n    int temp = *a;\n    *a = *b;\n    *b = temp;\n}`,
      python: `# Target: In-Place Reference Swap (Python)\ndef swap_values(box_a: list, box_b: list) -> None:\n    if box_a is not None and box_b is not None and len(box_a) > 0 and len(box_b) > 0:\n        box_a[0], box_b[0] = box_b[0], box_a[0]`,
    },
    buggy_code: {
      cpp: `// Buggy C++: Dereferencing uninitialized pointer\nvoid swapValues(int* a, int* b) {\n    int* temp;\n    *temp = *a;\n    *a = *b;\n    *b = *temp;\n}`,
      python: `def swap_values(box_a: list, box_b: list) -> None:\n    temp = None\n    val = temp[0]\n    box_a[0], box_b[0] = box_b[0], val`,
    },
  },
  "loop-converge": {
    id: "loop-converge",
    title: "Collatz Loop Invariant",
    concept_tag: "LOOP_INFINITE_BOUND",
    difficulty: "Medium",
    description: "Calculate Collatz steps to reach 1. Invariant: Loop must strictly progress toward termination.",
    starter_code: {
      cpp: `// Target: Collatz Convergence (C++)\nint collatzSteps(int n) {\n    int steps = 0;\n    while (n > 1) {\n        if (n % 2 == 0) n /= 2;\n        else n = 3 * n + 1;\n        steps++;\n    }\n    return steps;\n}`,
      python: `# Target: Collatz Convergence (Python)\ndef collatz_steps(n: int) -> int:\n    steps = 0\n    while n > 1:\n        n = n // 2 if n % 2 == 0 else 3 * n + 1\n        steps += 1\n    return steps`,
    },
    buggy_code: {
      cpp: `// Buggy C++: Non-terminating while loop\nint collatzSteps(int n) {\n    int steps = 0;\n    while (true) { steps += 0; }\n    return steps;\n}`,
      python: `def collatz_steps(n: int) -> int:\n    steps = 0\n    while True:\n        steps += 1`,
    },
  },
  "rec-fact": {
    id: "rec-fact",
    title: "Guarded Recursion",
    concept_tag: "RECURSION_NO_BASE",
    difficulty: "Easy",
    description: "Compute factorial recursively with an explicit base condition preventing stack overflow.",
    starter_code: {
      cpp: `// Target: Guarded Recursive Factorial (C++)\nlong long factorial(int n) {\n    if (n <= 1) return 1;\n    return n * factorial(n - 1);\n}`,
      python: `# Target: Guarded Recursive Factorial (Python)\ndef factorial(n: int) -> int:\n    if n <= 1:\n        return 1\n    return n * factorial(n - 1)`,
    },
    buggy_code: {
      cpp: `// Buggy C++: Missing recursion base guard\nlong long factorial(int n) {\n    return n * factorial(n - 1);\n}`,
      python: `def factorial(n: int) -> int:\n    return n * factorial(n - 1)`,
    },
  },
  "str-palindrome": {
    id: "str-palindrome",
    title: "Two-Pointer Palindrome",
    concept_tag: "ARRAY_OUT_OF_BOUNDS",
    difficulty: "Easy",
    description: "Verify symmetric palindrome invariants using converging left/right pointers.",
    starter_code: {
      cpp: `// Target: Two-Pointer Palindrome (C++)\n#include <string>\n\nbool isPalindrome(const std::string& s) {\n    if (s.empty()) return true;\n    int left = 0, right = (int)s.size() - 1;\n    while (left < right) {\n        if (s[left] != s[right]) return false;\n        left++; right--;\n    }\n    return true;\n}`,
      python: `# Target: Two-Pointer Palindrome (Python)\ndef is_palindrome(s: str) -> bool:\n    left, right = 0, len(s) - 1\n    while left < right:\n        if s[left] != s[right]:\n            return False\n        left += 1\n        right -= 1\n    return True`,
    },
    buggy_code: {
      cpp: `// Buggy C++: <= size causes out-of-bounds read\n#include <string>\n\nbool isPalindrome(const std::string& s) {\n    for (size_t i = 0; i <= s.size(); ++i) {\n        if (s[i] != s[s.size() - 1 - i]) return false;\n    }\n    return true;\n}`,
      python: `def is_palindrome(s: str) -> bool:\n    for i in range(len(s) + 1):\n        if s[i] != s[len(s) - 1 - i]:\n            return False\n    return True`,
    },
  },
};

// ---------------------------------------------------------------------------
// Unified Application State
// ---------------------------------------------------------------------------
const state = {
  activePortal: "gate", // gate | student | faculty | arena
  currentGhost: null,
  facultySession: null,
  problems: FALLBACK_PROBLEMS,

  // Student Practice State
  practiceProblemId: "arr-bound",
  practiceLanguage: "cpp",
  practiceGuard: null,

  // Faculty Telemetry State
  telemetryMode: "safe",
  heatmapChart: null,

  // Arena Lobby & Live Match State
  servers: [],
  selectedServerId: "IN-KRMU-01",
  duelProblemId: "arr-bound",
  duelLanguage: "cpp",
  duelMode: "ranked",
  isDuelActive: false,
  activeMatch: null,
  roundDurationSec: 180,
  roundRemainingSec: 180,
  timerIntervalId: null,
  duelStartTimeMs: null,
  duelGuard: null,
  replay: null,
};

// ---------------------------------------------------------------------------
// Utility Helpers
// ---------------------------------------------------------------------------
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showToast(message, type = "info") {
  const box = document.getElementById("global-toast");
  const dot = document.getElementById("global-toast-dot");
  const msg = document.getElementById("global-toast-msg");
  if (!box || !msg || !dot) return;

  const dotColors = {
    success: "bg-emerald-500",
    error: "bg-rose-500",
    warning: "bg-amber-500",
    info: "bg-cyan-500",
  };
  dot.className = `w-2 h-2 rounded-full shrink-0 ${dotColors[type] || dotColors.info}`;
  msg.textContent = message;
  box.classList.remove("hidden");

  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    box.classList.add("hidden");
  }, 4200);
}

function getProblemMeta(problemId) {
  return state.problems[problemId] || state.problems["arr-bound"];
}

function getProblemCode(problemId, language, kind = "starter_code") {
  const prob = getProblemMeta(problemId);
  const lang = (language || "cpp").toLowerCase();
  return prob?.[kind]?.[lang] || DEMO_PRESETS[problemId] || "";
}

function syncGhostPills() {
  const g = state.currentGhost;
  const alias = g?.alias || "Not Anchored";
  const elo = String(g?.elo_rating ?? 1200);
  const trust = `${g?.human_trust_score ?? 100}%`;

  // Student header & overview dashboard
  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  setTxt("stu-pill-alias", alias);
  setTxt("stu-pill-elo", elo);
  setTxt("stu-pill-trust", trust);
  setTxt("stu-dash-alias", alias);
  setTxt("stu-dash-elo", elo);
  setTxt("stu-dash-trust", trust);
  setTxt("stu-dash-hash", g?.commitment_hash ? `${g.commitment_hash.slice(0, 20)}...` : "Not anchored yet");

  // Arena pills
  setTxt("arena-pill-alias", g ? alias : "Guest Standby");
  setTxt("arena-pill-elo", elo);
  setTxt("lobby-ghost-status", g ? `Anchored: ${alias} (${elo} ELO)` : "Auto-Provision Guest on Join");
}

// ---------------------------------------------------------------------------
// Portal & Page Navigation Core
// ---------------------------------------------------------------------------
function openPortal(portalName) {
  state.activePortal = portalName;
  ["view-portal-gate", "portal-student", "portal-faculty", "portal-arena"].forEach((id) => {
    document.getElementById(id)?.classList.add("hidden");
  });

  if (portalName === "gate") {
    if (state.isDuelActive) stopDuelSession();
    document.getElementById("view-portal-gate")?.classList.remove("hidden");
  } else if (portalName === "student") {
    document.getElementById("portal-student")?.classList.remove("hidden");
    syncGhostPills();
  } else if (portalName === "faculty") {
    document.getElementById("portal-faculty")?.classList.remove("hidden");
  } else if (portalName === "arena") {
    document.getElementById("portal-arena")?.classList.remove("hidden");
    syncGhostPills();
    openArenaLobby();
  }
}

function openStudentPage(pageName) {
  const pages = ["overview", "practice", "credentials", "leaderboard"];
  pages.forEach((p) => {
    document.getElementById(`student-page-${p}`)?.classList.add("hidden");
  });
  document.getElementById(`student-page-${pageName}`)?.classList.remove("hidden");

  document.querySelectorAll("[data-student-page]").forEach((btn) => {
    const active = btn.dataset.studentPage === pageName;
    btn.classList.toggle("active-emerald", active);
    btn.classList.toggle("text-zinc-400", !active);
  });

  if (pageName === "leaderboard") loadLeaderboard();
  if (pageName === "practice") loadPracticeProblem();
}

function openFacultyPage(pageName) {
  const pages = ["telemetry", "remedial", "audit"];
  pages.forEach((p) => {
    document.getElementById(`faculty-page-${p}`)?.classList.add("hidden");
  });
  document.getElementById(`faculty-page-${pageName}`)?.classList.remove("hidden");

  document.querySelectorAll("[data-faculty-page]").forEach((btn) => {
    const active = btn.dataset.facultyPage === pageName;
    btn.classList.toggle("active-amber", active);
    btn.classList.toggle("text-zinc-400", !active);
  });

  if (pageName === "telemetry") loadHeatmapData();
  if (pageName === "audit") loadSchemaInspect();
}

function openArenaLobby() {
  if (state.isDuelActive) stopDuelSession();
  document.getElementById("arena-page-match")?.classList.add("hidden");
  document.getElementById("arena-page-lobby")?.classList.remove("hidden");

  const lobbyNav = document.getElementById("btn-arena-nav-lobby");
  const matchBadge = document.getElementById("arena-nav-match-indicator");
  if (lobbyNav) lobbyNav.className = "nav-pill active-cyan px-3 py-1 rounded border border-transparent cursor-pointer";
  if (matchBadge) matchBadge.className = "px-3 py-1 rounded text-zinc-500 border border-zinc-800 bg-zinc-950";

  loadArenaServers();
}

function openArenaMatchView() {
  document.getElementById("arena-page-lobby")?.classList.add("hidden");
  document.getElementById("arena-page-match")?.classList.remove("hidden");

  const lobbyNav = document.getElementById("btn-arena-nav-lobby");
  const matchBadge = document.getElementById("arena-nav-match-indicator");
  if (lobbyNav) lobbyNav.className = "nav-pill text-zinc-400 hover:text-zinc-200 px-3 py-1 rounded border border-transparent cursor-pointer";
  if (matchBadge) matchBadge.className = "px-3 py-1 rounded text-cyan-400 border border-cyan-800 bg-cyan-950 font-semibold";
}

// ---------------------------------------------------------------------------
// Initialization on DOMContentLoaded
// ---------------------------------------------------------------------------
window.addEventListener("DOMContentLoaded", async () => {
  await loadProblemCatalog();
  initRoleGateway();
  initStudentPortal();
  initFacultyPortal();
  initArenaPortal();
  initPlacementClaim();
  initOutcomeModal();
  if (window.lucide) window.lucide.createIcons();
});

async function loadProblemCatalog() {
  try {
    const resp = await fetch("/api/problems");
    if (resp.ok) {
      const data = await resp.json();
      if (Array.isArray(data.problems) && data.problems.length > 0) {
        state.problems = {};
        data.problems.forEach((p) => {
          state.problems[p.id] = p;
        });
      }
    }
  } catch (e) {
    console.info("Using fallback catalog:", e);
  }
}

// ---------------------------------------------------------------------------
// Shared Commitment Helper (Used by Student Gate & Lobby Guest/Handle Setup)
// ---------------------------------------------------------------------------
async function anchorGhostIdentity(rollNo, secretSalt) {
  const resp = await fetch("/api/auth/commit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roll_no: rollNo.trim(), secret_salt: secretSalt.trim() }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.detail || "Commitment anchoring failed");
  }
  const data = await resp.json();
  state.currentGhost = data;
  syncGhostPills();

  const claimRoll = document.getElementById("claim-roll-no");
  const claimSalt = document.getElementById("claim-secret-salt");
  if (claimRoll) claimRoll.value = rollNo.trim();
  if (claimSalt) claimSalt.value = secretSalt.trim();

  return data;
}

// ---------------------------------------------------------------------------
// Shared Submission Helper (Used by Practice Lab & 1v1 Match Arena)
// ---------------------------------------------------------------------------
async function submitCodeToEngine({ code, language, problemId, trustScore, matchCtx = {} }) {
  if (!state.currentGhost) {
    const guestRoll = "GUEST_" + Math.floor(1000 + Math.random() * 9000);
    await anchorGhostIdentity(guestRoll, "krmu_guest_practice_salt");
  }

  const payload = {
    commitment_hash: state.currentGhost.commitment_hash,
    code,
    language,
    problem_id: problemId,
    human_trust_score: trustScore ?? 100.0,
    opponent_elo: matchCtx.rivalElo ?? 1200,
    match_id: matchCtx.matchId ?? "practice_solo",
    rival_alias: matchCtx.rivalAlias ?? "Practice_Benchmark",
    elapsed_time_sec: matchCtx.elapsedSec ?? 15.0,
    rival_finished: Boolean(matchCtx.rivalFinished),
  };

  const resp = await fetch("/api/duel/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.detail || "Submission evaluation failed");
  }
  const result = await resp.json();
  if (state.currentGhost && typeof result.new_elo === "number") {
    state.currentGhost.elo_rating = result.new_elo;
    syncGhostPills();
  }
  return result;
}

// ---------------------------------------------------------------------------
// Role Gateway Controller (#view-portal-gate)
// ---------------------------------------------------------------------------
function initRoleGateway() {
  const portalRoll = document.getElementById("portal-input-roll");
  const portalSalt = document.getElementById("portal-input-salt");
  const btnGenSalt = document.getElementById("btn-portal-gen-salt");
  const btnDemoFill = document.getElementById("btn-portal-demo-fill");
  const btnStudentEnter = document.getElementById("btn-portal-student-enter");

  const facEmail = document.getElementById("portal-input-faculty-email");
  const facKey = document.getElementById("portal-input-faculty-passcode");
  const facCohort = document.getElementById("portal-select-cohort");
  const btnFacFill = document.getElementById("btn-portal-fac-fill");
  const btnFacultyEnter = document.getElementById("btn-portal-faculty-enter");

  const btnArenaEnter = document.getElementById("btn-portal-arena-enter");

  // Exit portal triggers across all shells
  document.querySelectorAll("[data-exit-portal]").forEach((btn) => {
    btn.addEventListener("click", () => {
      openPortal("gate");
      showToast("Returned to CampusGhosts Role Gateway.", "info");
    });
  });

  btnGenSalt?.addEventListener("click", () => {
    const arr = new Uint8Array(16);
    window.crypto.getRandomValues(arr);
    const hex = Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
    if (portalSalt) portalSalt.value = `krmu_${hex}`;
    showToast("Generated cryptographic 128-bit secret salt.", "info");
  });

  btnDemoFill?.addEventListener("click", () => {
    if (portalRoll) portalRoll.value = "2601010043";
    if (portalSalt) portalSalt.value = "krmu2026_salt";
    showToast("Populated Student demo credentials (2601010043).", "info");
  });

  btnFacFill?.addEventListener("click", () => {
    if (facEmail) facEmail.value = "prof.sharma@krmangalam.edu.in";
    if (facKey) facKey.value = "KRMU-FAC-2026";
    if (facCohort) facCohort.value = "CSE-1C";
    showToast("Populated Faculty demo credentials.", "info");
  });

  // Card 1: Enter Dedicated Student Portal
  btnStudentEnter?.addEventListener("click", async () => {
    const roll = (portalRoll?.value || "").trim();
    const salt = (portalSalt?.value || "").trim();
    if (!roll) {
      showToast("Enter your institutional roll number.", "warning");
      portalRoll?.focus();
      return;
    }
    if (salt.length < 8) {
      showToast("Secret salt must be at least 8 characters.", "warning");
      portalSalt?.focus();
      return;
    }

    btnStudentEnter.disabled = true;
    btnStudentEnter.innerHTML = "<span>Anchoring ZK Identity...</span>";
    try {
      const data = await anchorGhostIdentity(roll, salt);
      openPortal("student");
      openStudentPage("overview");
      showToast(`Signed in to Student Portal as ${data.alias}`, "success");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      btnStudentEnter.disabled = false;
      btnStudentEnter.innerHTML = "<span>Enter Student Portal &rarr;</span>";
    }
  });

  // Card 2: Authenticate & Enter Dedicated Faculty Console
  btnFacultyEnter?.addEventListener("click", async () => {
    const email = (facEmail?.value || "").trim();
    const accessKey = (facKey?.value || "").trim();
    const cohort = facCohort?.value || "CSE-1C";

    btnFacultyEnter.disabled = true;
    btnFacultyEnter.innerHTML = "<span>Authenticating...</span>";
    try {
      const resp = await fetch("/api/faculty/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, access_key: accessKey, cohort }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || "Faculty authentication failed");
      }
      const session = await resp.json();
      state.facultySession = session;

      const userEl = document.getElementById("fac-header-user");
      if (userEl) userEl.textContent = `${session.faculty_name} • ${session.cohort}`;

      openPortal("faculty");
      openFacultyPage("telemetry");
      showToast(`Authenticated Faculty Console (${session.cohort})`, "success");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      btnFacultyEnter.disabled = false;
      btnFacultyEnter.innerHTML = "<span>Enter Faculty Console &rarr;</span>";
    }
  });

  // Card 3: Enter Dedicated 1v1 Dueling Portal -> Starts on Server Browser Lobby!
  btnArenaEnter?.addEventListener("click", () => {
    openPortal("arena");
    showToast("Connected to 1v1 Server Browser. Select a server & room.", "info");
  });
}

// ---------------------------------------------------------------------------
// Portal 1: Student Multi-Page Controller (#portal-student)
// ---------------------------------------------------------------------------
function initStudentPortal() {
  // Top nav pills
  document.querySelectorAll("[data-student-page]").forEach((btn) => {
    btn.addEventListener("click", () => openStudentPage(btn.dataset.studentPage));
  });

  // Dashboard service jump buttons
  document.querySelectorAll("[data-student-page-jump]").forEach((btn) => {
    btn.addEventListener("click", () => openStudentPage(btn.dataset.studentPageJump));
  });

  // Jump from Student Portal to 1v1 Server Browser Lobby
  document.getElementById("btn-student-to-arena")?.addEventListener("click", () => openPortal("arena"));
  document.getElementById("btn-overview-to-arena")?.addEventListener("click", () => openPortal("arena"));

  // Leaderboard refresh
  document.getElementById("btn-refresh-leaderboard")?.addEventListener("click", () => {
    loadLeaderboard();
    showToast("Cohort leaderboard refreshed.", "info");
  });

  // Initialize Solo Practice Lab
  const pSelect = document.getElementById("practice-select-problem");
  const lSelect = document.getElementById("practice-select-language");
  const editor = document.getElementById("editor-practice-student");

  if (editor) {
    state.practiceGuard = new AntiCheatGuard({
      editorEl: editor,
      mode: "relaxed",
      onPasteBlocked: () => showToast("Paste disabled in Solo Practice Lab.", "warning"),
    });
    editor.addEventListener("input", () => {
      const stats = document.getElementById("practice-editor-stats");
      if (stats) stats.textContent = `${editor.value.split("\n").length} lines • ${editor.value.length} chars`;
      syncPracticeGutter();
    });
    editor.addEventListener("scroll", () => {
      const gutter = document.getElementById("practice-gutter");
      if (gutter) gutter.scrollTop = editor.scrollTop;
    });
  }

  pSelect?.addEventListener("change", () => {
    state.practiceProblemId = pSelect.value;
    loadPracticeProblem();
  });
  lSelect?.addEventListener("change", () => {
    state.practiceLanguage = lSelect.value;
    loadPracticeProblem();
  });

  document.getElementById("btn-practice-reset")?.addEventListener("click", () => {
    loadPracticeProblem();
    showToast("Reset to clean starter code.", "info");
  });
  document.getElementById("btn-practice-buggy")?.addEventListener("click", () => {
    if (editor) editor.value = getProblemCode(state.practiceProblemId, state.practiceLanguage, "buggy_code");
    syncPracticeGutter();
    showToast("Loaded buggy invariant sample for testing.", "warning");
  });
  document.getElementById("btn-practice-clean")?.addEventListener("click", () => {
    if (editor) editor.value = getProblemCode(state.practiceProblemId, state.practiceLanguage, "starter_code");
    syncPracticeGutter();
    showToast("Loaded verified solution.", "success");
  });

  const submitBtn = document.getElementById("btn-practice-submit");
  submitBtn?.addEventListener("click", async () => {
    const code = (editor?.value || "").trim();
    if (!code) {
      showToast("Write code before evaluating.", "warning");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Evaluating...";
    try {
      const res = await submitCodeToEngine({
        code,
        language: state.practiceLanguage,
        problemId: state.practiceProblemId,
        trustScore: state.practiceGuard?.humanTrustScore ?? 100,
      });
      renderPracticeResult(res);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Run & Evaluate";
    }
  });
}

function syncPracticeGutter() {
  const editor = document.getElementById("editor-practice-student");
  const gutter = document.getElementById("practice-gutter");
  if (!editor || !gutter) return;
  const lineCount = Math.max(1, editor.value.split("\n").length);
  gutter.textContent = Array.from({ length: lineCount }, (_, i) => i + 1).join("\n");
}

function loadPracticeProblem() {
  const prob = getProblemMeta(state.practiceProblemId);
  const titleEl = document.getElementById("practice-prob-title");
  const badgeEl = document.getElementById("practice-prob-badge");
  const descEl = document.getElementById("practice-prob-desc");
  const fileTab = document.getElementById("practice-file-tab");
  const editor = document.getElementById("editor-practice-student");

  if (titleEl) titleEl.textContent = prob.title;
  if (badgeEl) badgeEl.textContent = `${prob.concept_tag} • ${prob.difficulty}`;
  if (descEl) descEl.textContent = prob.description;
  if (fileTab) fileTab.textContent = state.practiceLanguage === "python" ? "solution.py" : "solution.cpp";
  if (editor) {
    editor.value = getProblemCode(state.practiceProblemId, state.practiceLanguage, "starter_code");
    syncPracticeGutter();
  }
}

function renderPracticeResult(result) {
  const diag = result.diagnostic || {};
  const passed = Boolean(diag.passed);
  const delta = result.elo_delta || 0;

  const tagEl = document.getElementById("practice-diag-tag");
  if (tagEl) {
    tagEl.textContent = diag.concept_tag || (passed ? "OPTIMAL" : "ERROR");
    tagEl.className = passed
      ? "px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800"
      : "px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-rose-950 text-rose-400 border border-rose-800";
  }

  document.getElementById("practice-diag-time").textContent = `${diag.est_time_ms ?? 0} ms`;
  document.getElementById("practice-diag-mem").textContent = `${diag.est_memory_kb ?? 0} KB`;
  const deltaEl = document.getElementById("practice-diag-delta");
  if (deltaEl) {
    deltaEl.textContent = delta >= 0 ? `+${delta}` : String(delta);
    deltaEl.className = delta >= 0 ? "text-emerald-400" : "text-rose-400";
  }

  document.getElementById("practice-diag-hint").textContent = diag.socratic_hint || "Analysis complete.";
  document.getElementById("practice-diag-log").textContent =
    `[PRACTICE TRACE]\nTarget   : ${state.practiceProblemId} (${state.practiceLanguage.toUpperCase()})\nTag      : ${diag.concept_tag}\nStatus   : ${passed ? "PASSED" : "FAILED"}\nSource   : ${diag.source || "offline"}\nHint     : ${diag.socratic_hint}`;

  showToast(passed ? `Practice passed! (+${delta} ELO)` : `Detected ${diag.concept_tag} (${delta} ELO)`, passed ? "success" : "error");
}

// ---------------------------------------------------------------------------
// Portal 2: Faculty Multi-Page Controller (#portal-faculty)
// ---------------------------------------------------------------------------
function initFacultyPortal() {
  document.querySelectorAll("[data-faculty-page]").forEach((btn) => {
    btn.addEventListener("click", () => openFacultyPage(btn.dataset.facultyPage));
  });

  document.getElementById("btn-goto-remedial")?.addEventListener("click", () => openFacultyPage("remedial"));

  const toggleBtn = document.getElementById("btn-toggle-telemetry-mode");
  toggleBtn?.addEventListener("click", () => {
    state.telemetryMode = state.telemetryMode === "safe" ? "raw" : "safe";
    const descEl = document.getElementById("telemetry-mode-desc");
    if (state.telemetryMode === "safe") {
      toggleBtn.textContent = "Safe View (k \u2265 5 Masked)";
      toggleBtn.className = "bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold px-3 py-1.5 rounded text-xs font-mono transition-colors cursor-pointer";
      if (descEl) descEl.textContent = "Clusters < 5 ghosts are mathematically masked";
    } else {
      toggleBtn.textContent = "Raw DB Audit Mode";
      toggleBtn.className = "bg-rose-600 hover:bg-rose-500 text-zinc-950 font-bold px-3 py-1.5 rounded text-xs font-mono transition-colors cursor-pointer";
      if (descEl) descEl.textContent = "Exposes raw failure counts for institutional audit";
    }
    loadHeatmapData();
  });

  document.getElementById("btn-refresh-heatmap")?.addEventListener("click", () => {
    loadHeatmapData();
    showToast("Telemetry refreshed.", "info");
  });

  document.getElementById("btn-remedial-plan")?.addEventListener("click", () => {
    const tag = document.getElementById("select-remedial-concept")?.value || "ARRAY_OUT_OF_BOUNDS";
    loadRemedialPlan(tag);
  });

  document.getElementById("btn-refresh-inspector")?.addEventListener("click", () => {
    loadSchemaInspect();
    showToast("Schema audit refreshed.", "info");
  });
}

async function loadHeatmapData() {
  try {
    const resp = await fetch(`/api/faculty/telemetry?mode=${state.telemetryMode}`);
    if (!resp.ok) return;
    const data = await resp.json();
    const clusters = data.clusters || [];

    const kpiClusters = document.getElementById("fac-kpi-clusters");
    const kpiMasked = document.getElementById("fac-kpi-masked");
    const kpiTop = document.getElementById("fac-kpi-top-tag");
    if (kpiClusters) kpiClusters.textContent = String(clusters.length);
    if (kpiMasked) kpiMasked.textContent = `${clusters.filter((c) => c.masked).length} Masked`;
    const topUnmasked = clusters.find((c) => !c.masked) || clusters[0];
    if (kpiTop) kpiTop.textContent = topUnmasked ? topUnmasked.concept_tag : "None";

    renderHeatmapChart(clusters);
    renderTelemetryTable(clusters);
  } catch (e) {
    console.warn("Telemetry error:", e);
  }
}

function renderTelemetryTable(clusters) {
  const tbody = document.getElementById("tbody-telemetry-clusters");
  if (!tbody) return;

  tbody.innerHTML = clusters.map((c) => {
    const statusBadge = c.masked
      ? `<span class="px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 text-[10px]">MASKED (k &lt; 5)</span>`
      : `<span class="px-2 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800 text-[10px]">UNMASKED (k &ge; 5)</span>`;
    return `
      <tr class="hover:bg-zinc-900/40">
        <td class="p-3 font-bold text-zinc-200">${escapeHtml(c.concept_tag)}</td>
        <td class="p-3">${c.masked ? "Hidden (&lt; 5)" : escapeHtml(String(c.count))}</td>
        <td class="p-3">${statusBadge}</td>
        <td class="p-3">
          <button type="button" data-remedial-tag="${escapeHtml(c.concept_tag)}" class="text-amber-400 hover:underline font-mono text-[11px] cursor-pointer">
            Build Remedial Plan &rarr;
          </button>
        </td>
      </tr>
    `;
  }).join("") || `<tr><td colspan="4" class="p-4 text-center text-zinc-500">No telemetry recorded</td></tr>`;

  tbody.querySelectorAll("[data-remedial-tag]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tag = btn.dataset.remedialTag;
      const sel = document.getElementById("select-remedial-concept");
      if (sel) sel.value = tag;
      openFacultyPage("remedial");
      loadRemedialPlan(tag);
    });
  });
}

function renderHeatmapChart(clusters) {
  const canvas = document.getElementById("canvas-heatmap");
  if (!canvas || !window.Chart) return;

  const labels = clusters.map((c) => c.concept_tag);
  const values = clusters.map((c) => (c.masked ? 0 : c.count || 0));
  const bgColors = clusters.map((c) => (c.masked ? "rgba(113,113,122,0.4)" : "rgba(245,158,11,0.75)"));

  if (state.heatmapChart) {
    state.heatmapChart.destroy();
    state.heatmapChart = null;
  }

  state.heatmapChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: "Distinct Student Ghosts", data: values, backgroundColor: bgColors, borderRadius: 4 }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      onClick: (_evt, elements) => {
        if (elements?.length > 0) {
          const tag = labels[elements[0].index];
          const sel = document.getElementById("select-remedial-concept");
          if (sel) sel.value = tag;
          openFacultyPage("remedial");
          loadRemedialPlan(tag);
        }
      },
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, grid: { color: "#27272A" }, ticks: { color: "#A1A1AA" } },
        y: { grid: { display: false }, ticks: { color: "#FAFAFA" } },
      },
    },
  });
}

async function loadRemedialPlan(conceptTag) {
  const titleEl = document.getElementById("remedial-title");
  const slidesGrid = document.getElementById("remedial-slides-grid");
  const vivaList = document.getElementById("remedial-viva-list");

  try {
    const resp = await fetch("/api/faculty/remedial", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ concept_tag: conceptTag, ghost_count: 5 }),
    });
    if (!resp.ok) throw new Error("Remedial request failed");
    const plan = await resp.json();

    if (titleEl) titleEl.textContent = plan.title;
    if (slidesGrid) {
      slidesGrid.innerHTML = (plan.slides || []).map((s) => `
        <div class="bg-zinc-950 p-3 rounded border border-zinc-800 text-xs space-y-1.5">
          <span class="text-amber-400 font-bold block font-mono text-[10px]">SLIDE ${s.slide_num}</span>
          <strong class="text-zinc-100 block">${escapeHtml(s.heading)}</strong>
          <p class="text-zinc-400 text-[11px] leading-relaxed">${escapeHtml(s.content)}</p>
        </div>
      `).join("");
    }
    if (vivaList) {
      vivaList.innerHTML = (plan.viva_questions || []).map((v, idx) => `
        <div class="bg-zinc-950 p-3 rounded border border-zinc-800 text-xs">
          <span class="text-emerald-400 font-bold font-mono">Q${idx + 1}: ${escapeHtml(v.question)}</span>
          <p class="text-zinc-300 mt-1 leading-relaxed"><strong class="text-zinc-500">Model Answer:</strong> ${escapeHtml(v.answer)}</p>
        </div>
      `).join("");
    }
    showToast(`Generated 5-slide plan for ${conceptTag}.`, "success");
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function loadSchemaInspect() {
  const tbodyStudents = document.getElementById("tbody-verified-students");
  const tbodyGhosts = document.getElementById("tbody-ghost-profiles");
  try {
    const resp = await fetch("/api/debug/schema-inspect");
    if (!resp.ok) return;
    const data = await resp.json();

    if (tbodyStudents) {
      tbodyStudents.innerHTML = (data.verified_students_sample || []).map((s) => `
        <tr>
          <td class="p-2.5 font-bold text-zinc-100">${escapeHtml(s.roll_no)}</td>
          <td class="p-2.5 text-zinc-400 text-[10px]">${escapeHtml((s.verified_at || "").slice(0, 19))}</td>
        </tr>
      `).join("");
    }
    if (tbodyGhosts) {
      tbodyGhosts.innerHTML = (data.ghost_profiles_sample || []).map((g) => `
        <tr>
          <td class="p-2.5 text-zinc-400 text-[10px]">${escapeHtml((g.commitment_hash || "").slice(0, 14))}...</td>
          <td class="p-2.5 font-bold text-emerald-400">${escapeHtml(g.alias)}</td>
          <td class="p-2.5 text-zinc-200">${escapeHtml(String(g.elo_rating))}</td>
        </tr>
      `).join("");
    }
    const fkBadge = document.getElementById("badge-fk-status");
    if (fkBadge && data.zero_foreign_keys_verified) {
      fkBadge.textContent = "PRAGMA foreign_key_list = [] (0 FKs Verified)";
    }
  } catch (e) {
    console.warn("Schema inspect failed:", e);
  }
}

// ---------------------------------------------------------------------------
// Portal 3: 1v1 Dueling Portal (#portal-arena — Server Lobby -> Match)
// ---------------------------------------------------------------------------
function initArenaPortal() {
  const studentEditor = document.getElementById("editor-duel-student");
  const rivalEditor = document.getElementById("editor-duel-competitor");

  // Guard strictly attached to Duel Match editor
  state.duelGuard = new AntiCheatGuard({
    editorEl: studentEditor,
    onStrike: (count, reason) => {
      const el = document.getElementById("pill-strikes");
      if (el) el.textContent = `${count}/3`;
      showToast(`Strike ${count}/3: ${reason}`, "warning");
    },
    onDisqualify: async (reason) => {
      const el = document.getElementById("pill-strikes");
      if (el) el.textContent = "3/3 (DQ)";
      stopDuelSession();
      if (state.currentGhost?.commitment_hash) {
        await fetch("/api/duel/penalty", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ commitment_hash: state.currentGhost.commitment_hash, reason }),
        }).catch(() => {});
      }
      showToast(`DISQUALIFIED: -25 ELO penalty! ${reason}`, "error");
    },
    onTrustUpdate: (score, metrics) => {
      const strip = document.getElementById("duel-anti-cheat-strip");
      if (strip) strip.textContent = `Anti-Cheat Armed • Paste Blocked: ${metrics.blockedPasteAttempts} • Trust: ${score}%`;
    },
    onPasteBlocked: () => showToast("PASTE BLOCKED in Ranked Duel! (-18 trust)", "error"),
  });

  state.replay = new GhostReplayEngine({
    targetEl: rivalEditor,
    baseDelayMs: 40,
    onProgress: (pct) => {
      const lbl = document.getElementById("replay-progress-label");
      const bar = document.getElementById("rival-progress-bar");
      if (lbl) lbl.textContent = `${pct}%`;
      if (bar) bar.style.width = `${pct}%`;
    },
    onComplete: () => {
      const lbl = document.getElementById("replay-progress-label");
      if (lbl) lbl.textContent = "100% (Finished)";
      showToast(`${state.activeMatch?.rival?.alias || "Rival"} finished coding!`, "info");
    },
  });

  studentEditor?.addEventListener("input", () => {
    const lbl = document.getElementById("student-progress-label");
    const bar = document.getElementById("student-progress-bar");
    if (lbl) lbl.textContent = `${studentEditor.value.length} chars • Anti-Cheat Armed`;
    if (bar) bar.style.width = `${Math.min(100, Math.round((studentEditor.value.length / 240) * 100))}%`;
  });

  // Lobby Controls
  document.getElementById("btn-arena-nav-lobby")?.addEventListener("click", () => openArenaLobby());
  document.getElementById("btn-arena-leave-match")?.addEventListener("click", () => openArenaLobby());
  document.getElementById("btn-arena-refresh-servers")?.addEventListener("click", () => {
    loadArenaServers();
    showToast("Server latencies & rooms refreshed.", "info");
  });

  document.getElementById("btn-lobby-anchor")?.addEventListener("click", async () => {
    const roll = (document.getElementById("lobby-input-roll")?.value || "").trim();
    if (!roll) {
      showToast("Enter a roll number or handle.", "warning");
      return;
    }
    try {
      const g = await anchorGhostIdentity(roll, `krmu_lobby_${roll}`);
      showToast(`Anchored competitor as ${g.alias} (${g.elo_rating} ELO)`, "success");
    } catch (err) {
      showToast(err.message, "error");
    }
  });

  document.getElementById("btn-arena-quick-match")?.addEventListener("click", () => {
    const probId = document.getElementById("arena-select-problem")?.value || "arr-bound";
    const lang = document.getElementById("arena-select-language")?.value || "cpp";
    const mode = document.getElementById("arena-select-mode")?.value || "ranked";
    launchDuelMatch({ serverId: state.selectedServerId, problemId: probId, language: lang, mode });
  });

  document.getElementById("btn-arena-create-room")?.addEventListener("click", async () => {
    if (!state.currentGhost) {
      const guestRoll = "HOST_" + Math.floor(1000 + Math.random() * 9000);
      await anchorGhostIdentity(guestRoll, "krmu_host_room_salt");
    }
    const probId = document.getElementById("arena-select-problem")?.value || "arr-bound";
    const lang = document.getElementById("arena-select-language")?.value || "cpp";
    const mode = document.getElementById("arena-select-mode")?.value || "ranked";

    const resp = await fetch("/api/arena/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        server_id: state.selectedServerId,
        problem_id: probId,
        language: lang,
        mode,
        commitment_hash: state.currentGhost.commitment_hash,
        host_alias: state.currentGhost.alias,
        host_elo: state.currentGhost.elo_rating,
      }),
    });
    if (resp.ok) {
      await loadArenaServers();
      showToast(`Created open room on ${state.selectedServerId}!`, "success");
    }
  });

  // Match Sample & Anti-Cheat Buttons
  document.getElementById("btn-reset-strikes")?.addEventListener("click", () => {
    state.duelGuard?.resetStrikes();
    const el = document.getElementById("pill-strikes");
    if (el) el.textContent = "0/3";
    showToast("Match strikes reset.", "info");
  });

  const modeBtn = document.getElementById("btn-toggle-anticheat-mode");
  modeBtn?.addEventListener("click", () => {
    if (!state.duelGuard) return;
    const next = state.duelGuard.mode === "strict" ? "relaxed" : "strict";
    state.duelGuard.setMode(next);
    modeBtn.textContent = next === "strict" ? "Strict" : "Relaxed";
    showToast(`Anti-Cheat mode: ${next.toUpperCase()}`, "info");
  });

  document.getElementById("btn-duel-reset")?.addEventListener("click", () => {
    if (studentEditor) studentEditor.value = getProblemCode(state.duelProblemId, state.duelLanguage, "starter_code");
  });
  document.getElementById("btn-duel-buggy")?.addEventListener("click", () => {
    if (studentEditor) studentEditor.value = getProblemCode(state.duelProblemId, state.duelLanguage, "buggy_code");
  });
  document.getElementById("btn-duel-clean")?.addEventListener("click", () => {
    if (studentEditor) studentEditor.value = getProblemCode(state.duelProblemId, state.duelLanguage, "starter_code");
  });

  const duelSubmitBtn = document.getElementById("btn-duel-submit");
  duelSubmitBtn?.addEventListener("click", async () => {
    const code = (studentEditor?.value || "").trim();
    if (!code) {
      showToast("Write code before submitting.", "warning");
      return;
    }

    duelSubmitBtn.disabled = true;
    duelSubmitBtn.textContent = "Judging Match...";
    try {
      const elapsedSec = state.duelStartTimeMs ? (Date.now() - state.duelStartTimeMs) / 1000.0 : 12.0;
      const result = await submitCodeToEngine({
        code,
        language: state.duelLanguage,
        problemId: state.duelProblemId,
        trustScore: state.duelGuard?.humanTrustScore ?? 100.0,
        matchCtx: {
          rivalAlias: state.activeMatch?.rival?.alias || "Rival_Ghost",
          rivalElo: state.activeMatch?.rival?.elo || 1200,
          matchId: state.activeMatch?.match_id || "duel_live",
          elapsedSec,
          rivalFinished: state.replay ? state.replay.isFinished() : false,
        },
      });

      const diag = result.diagnostic || {};
      const badge = document.getElementById("duel-diag-badge");
      const hint = document.getElementById("duel-diag-hint");
      if (badge) {
        badge.textContent = diag.concept_tag || "DONE";
        badge.className = diag.passed
          ? "px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800"
          : "px-2 py-0.5 rounded bg-rose-950 text-rose-400 border border-rose-800";
      }
      if (hint) hint.textContent = diag.socratic_hint || "Match judged.";

      showDuelOutcomeModal(result, elapsedSec);
      stopDuelSession();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      duelSubmitBtn.disabled = false;
      duelSubmitBtn.textContent = "Submit Match Code";
    }
  });
}

async function loadArenaServers() {
  const srvContainer = document.getElementById("arena-server-list");
  try {
    const resp = await fetch("/api/arena/servers");
    if (!resp.ok) throw new Error("Failed to load servers");
    const data = await resp.json();
    state.servers = data.servers || [];
    if (state.servers.length > 0 && !state.servers.some((s) => s.server_id === state.selectedServerId)) {
      state.selectedServerId = state.servers[0].server_id;
    }
    renderArenaServers();
    renderSelectedServerRooms();
  } catch (err) {
    if (srvContainer) srvContainer.innerHTML = `<div class="p-3 text-rose-400 font-mono text-xs">${escapeHtml(err.message)}</div>`;
  }
}

function renderArenaServers() {
  const srvContainer = document.getElementById("arena-server-list");
  if (!srvContainer) return;

  srvContainer.innerHTML = state.servers.map((srv) => {
    const isSelected = srv.server_id === state.selectedServerId;
    const loadPct = Math.min(100, Math.round((srv.active_players / Math.max(1, srv.capacity)) * 100));
    const pingColor = srv.ping_ms <= 20 ? "text-emerald-400" : srv.ping_ms <= 45 ? "text-cyan-400" : "text-amber-400";
    return `
      <button type="button" data-select-server="${escapeHtml(srv.server_id)}" class="server-card ${isSelected ? "selected" : ""} w-full text-left p-3.5 rounded-md border border-zinc-800 bg-zinc-950/95 hover:border-cyan-700/80 cursor-pointer">
        <div class="flex items-center justify-between font-mono">
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full ${isSelected ? "bg-cyan-400 shadow-[0_0_8px_#22D3EE]" : "bg-emerald-500"}"></span>
            <span class="font-bold text-zinc-100 text-xs">${escapeHtml(srv.server_id)}</span>
            <span class="text-zinc-400 text-[11px]">${escapeHtml(srv.name)}</span>
          </div>
          <span class="${pingColor} text-[10px] font-bold bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">${srv.ping_ms} ms</span>
        </div>
        <div class="flex items-center justify-between text-[10px] font-mono text-zinc-500 mt-2">
          <span>${escapeHtml(srv.ruleset)}</span>
          <span>${srv.active_players}/${srv.capacity} Online &bull; ${srv.open_rooms} Rooms</span>
        </div>
        <div class="w-full h-1 bg-zinc-900 rounded-full overflow-hidden mt-2">
          <div class="h-full ${isSelected ? "bg-cyan-400" : "bg-emerald-500/70"}" style="width:${loadPct}%"></div>
        </div>
      </button>
    `;
  }).join("");

  srvContainer.querySelectorAll("[data-select-server]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.selectedServerId = btn.dataset.selectServer;
      const modeSel = document.getElementById("arena-select-mode");
      const targetSrv = state.servers.find((s) => s.server_id === state.selectedServerId);
      if (modeSel && targetSrv) modeSel.value = targetSrv.mode;
      renderArenaServers();
      renderSelectedServerRooms();
    });
  });
}

function renderSelectedServerRooms() {
  const srv = state.servers.find((s) => s.server_id === state.selectedServerId) || state.servers[0];
  if (!srv) return;

  const pillSrv = document.getElementById("arena-pill-server");
  const titleSrv = document.getElementById("lobby-selected-server-name");
  const countBadge = document.getElementById("lobby-room-count-badge");
  const roomsList = document.getElementById("arena-rooms-list");

  if (pillSrv) pillSrv.textContent = srv.server_id;
  if (titleSrv) titleSrv.textContent = `${srv.server_id} (${srv.region})`;
  if (countBadge) countBadge.textContent = `${srv.rooms.length} Active Rooms`;

  if (!roomsList) return;
  roomsList.innerHTML = srv.rooms.map((rm) => `
    <div class="p-4 flex items-center justify-between gap-3 hover:bg-zinc-900/40 transition-colors">
      <div class="space-y-1 font-mono">
        <div class="flex items-center gap-2">
          <span class="font-bold text-zinc-100 text-xs">${escapeHtml(rm.host_alias)}</span>
          <span class="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px]">ELO ${rm.host_elo}</span>
          <span class="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px]">${escapeHtml(rm.status)}</span>
        </div>
        <div class="text-[11px] text-zinc-400">
          Challenge: <strong class="text-zinc-200">${escapeHtml(rm.problem_title)}</strong> &bull; ${escapeHtml(rm.language.toUpperCase())} &bull; ${rm.duration_sec}s
        </div>
      </div>
      <button type="button" data-join-room="${escapeHtml(rm.room_id)}" class="bg-cyan-600 hover:bg-cyan-500 text-zinc-950 font-bold px-3.5 py-1.5 rounded text-[11px] font-mono transition-colors shrink-0 cursor-pointer">
        Challenge &rarr;
      </button>
    </div>
  `).join("") || `<div class="p-6 text-center text-zinc-500 font-mono text-xs">No open rooms on this server. Click Auto-Pair or Host New Room!</div>`;

  roomsList.querySelectorAll("[data-join-room]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const room = srv.rooms.find((r) => r.room_id === btn.dataset.joinRoom);
      if (!room) return;
      launchDuelMatch({
        serverId: room.server_id,
        problemId: room.problem_id,
        language: room.language,
        mode: room.mode,
        targetRivalHash: room.host_hash,
      });
    });
  });
}

async function launchDuelMatch({ serverId, problemId, language, mode, targetRivalHash = null }) {
  if (!state.currentGhost) {
    const guestRoll = "ARENA_" + Math.floor(1000 + Math.random() * 9000);
    await anchorGhostIdentity(guestRoll, "krmu_arena_guest_salt");
  }

  state.selectedServerId = serverId || state.selectedServerId;
  state.duelProblemId = problemId || "arr-bound";
  state.duelLanguage = language || "cpp";
  state.duelMode = mode || "ranked";

  openArenaMatchView();

  const prob = getProblemMeta(state.duelProblemId);
  document.getElementById("match-server-badge").textContent = `${state.selectedServerId} • ${state.duelMode.toUpperCase()}`;
  document.getElementById("duel-problem-title").textContent = prob.title;
  document.getElementById("duel-problem-badge").textContent = `${prob.concept_tag} • ${prob.difficulty}`;
  document.getElementById("duel-problem-desc").textContent = prob.description;
  document.getElementById("duel-lang-badge").textContent = state.duelLanguage.toUpperCase();

  const studentEditor = document.getElementById("editor-duel-student");
  if (studentEditor) studentEditor.value = getProblemCode(state.duelProblemId, state.duelLanguage, "starter_code");

  const statusPill = document.getElementById("duel-status-pill");
  if (statusPill) statusPill.textContent = "MATCHMAKING...";

  try {
    const resp = await fetch("/api/duel/matchmake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commitment_hash: state.currentGhost.commitment_hash,
        problem_id: state.duelProblemId,
        language: state.duelLanguage,
        server_id: state.selectedServerId,
        mode: state.duelMode,
        target_rival_hash: targetRivalHash,
      }),
    });
    if (!resp.ok) throw new Error("Matchmaking failed");
    const matchData = await resp.json();

    state.activeMatch = matchData;
    state.isDuelActive = true;
    state.duelStartTimeMs = Date.now();
    state.roundDurationSec = matchData.round_duration_sec || 180;
    state.roundRemainingSec = state.roundDurationSec;

    const rival = matchData.rival;
    document.getElementById("student-pane-header").textContent = `You (${state.currentGhost.alias} • ELO ${state.currentGhost.elo_rating})`;
    document.getElementById("rival-pane-header").textContent = `Rival (${rival.alias} • ELO ${rival.elo})`;
    if (statusPill) statusPill.textContent = "LIVE MATCH";

    state.duelGuard?.setMode(state.duelMode === "practice" ? "relaxed" : "strict");
    const acModeBtn = document.getElementById("btn-toggle-anticheat-mode");
    if (acModeBtn) acModeBtn.textContent = state.duelMode === "practice" ? "Relaxed" : "Strict";

    state.duelGuard?.startDuel();
    state.replay?.configureRival({
      name: rival.alias,
      elo: rival.elo,
      targetTimeSec: rival.target_time_sec,
      cps: rival.cps,
    });
    state.replay?.start(state.duelProblemId, state.duelLanguage);

    startRoundCountdown();
    showToast(`Paired on ${state.selectedServerId} vs ${rival.alias} (${rival.elo} ELO)`, "success");
  } catch (err) {
    showToast(err.message, "error");
  }
}

function startRoundCountdown() {
  clearInterval(state.timerIntervalId);
  const update = () => {
    const clockEl = document.getElementById("duel-countdown-clock");
    if (!clockEl) return;
    const mins = Math.floor(Math.max(0, state.roundRemainingSec) / 60);
    const secs = Math.max(0, state.roundRemainingSec) % 60;
    clockEl.textContent = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };
  update();
  state.timerIntervalId = setInterval(() => {
    state.roundRemainingSec -= 1;
    update();
    if (state.roundRemainingSec <= 0) {
      clearInterval(state.timerIntervalId);
      stopDuelSession();
      showToast("Round clock expired!", "error");
    }
  }, 1000);
}

function stopDuelSession() {
  state.isDuelActive = false;
  clearInterval(state.timerIntervalId);
  state.timerIntervalId = null;
  state.duelGuard?.stopDuel();
  state.replay?.stop();
}

function initOutcomeModal() {
  const modal = document.getElementById("duel-outcome-modal");
  document.getElementById("btn-outcome-lobby")?.addEventListener("click", () => {
    modal?.classList.add("hidden");
    openArenaLobby();
  });
  document.getElementById("btn-outcome-next")?.addEventListener("click", () => {
    modal?.classList.add("hidden");
    launchDuelMatch({
      serverId: state.selectedServerId,
      problemId: state.duelProblemId,
      language: state.duelLanguage,
      mode: state.duelMode,
    });
  });
}

function showDuelOutcomeModal(result, elapsedSec) {
  const modal = document.getElementById("duel-outcome-modal");
  if (!modal) return;
  const diag = result.diagnostic || {};
  const summary = result.match_summary || {};
  const passed = Boolean(diag.passed);
  const delta = result.elo_delta || 0;
  const newElo = result.new_elo || state.currentGhost?.elo_rating || 1200;

  document.getElementById("duel-outcome-title").textContent =
    summary.outcome === "VICTORY" ? "DUEL CONCLUDED: VICTORY" : summary.outcome === "RUNNER_UP" ? "DUEL CONCLUDED: RUNNER-UP" : "DUEL CONCLUDED: DEFEAT";
  document.getElementById("duel-outcome-badge").textContent = `${delta >= 0 ? "+" : ""}${delta} ELO`;
  document.getElementById("duel-outcome-message").textContent = summary.outcome_message || "Verification complete.";
  document.getElementById("outcome-student-alias").textContent = state.currentGhost?.alias || "You";
  document.getElementById("outcome-student-elo").textContent = String(newElo);
  document.getElementById("outcome-student-time").textContent = `${elapsedSec.toFixed(1)}s`;
  document.getElementById("outcome-student-verdict").textContent = diag.concept_tag || (passed ? "OPTIMAL" : "FAILED");
  document.getElementById("outcome-rival-alias").textContent = summary.rival_alias || state.activeMatch?.rival?.alias || "Rival";
  document.getElementById("outcome-rival-elo").textContent = String(summary.rival_elo || state.activeMatch?.rival?.elo || 1200);
  document.getElementById("outcome-rival-status").textContent = summary.rival_finished ? "Completed Code" : "In Progress";
  document.getElementById("outcome-elo-calc").textContent = `${delta >= 0 ? "+" : ""}${delta} ELO → ${newElo}`;
  document.getElementById("outcome-socratic-note").textContent = diag.socratic_hint || "";

  modal.classList.remove("hidden");
}

// ---------------------------------------------------------------------------
// Placement Credentials & Leaderboard (Student Portal Pages 3 & 4)
// ---------------------------------------------------------------------------
function initPlacementClaim() {
  const btn = document.getElementById("btn-verify-claim");
  btn?.addEventListener("click", async () => {
    const roll = (document.getElementById("claim-roll-no")?.value || "").trim();
    const salt = (document.getElementById("claim-secret-salt")?.value || "").trim();
    const box = document.getElementById("claim-result-box");
    if (!roll || !salt) {
      showToast("Enter roll number and secret salt.", "warning");
      return;
    }

    btn.disabled = true;
    btn.textContent = "Verifying...";
    try {
      const resp = await fetch("/api/claim/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roll_no: roll, secret_salt: salt }),
      });
      const res = await resp.json();
      if (!box) return;
      box.classList.remove("hidden");

      if (res.verified) {
        box.className = "p-4 rounded-lg border border-emerald-800 bg-emerald-950/20 font-mono text-xs space-y-2";
        box.innerHTML = `
          <div class="text-emerald-400 font-bold">Cryptographic Ownership Verified &bull; Rank #${res.rank} (${escapeHtml(res.alias)} &bull; ${res.elo_rating} ELO)</div>
          <div class="text-[11px] text-zinc-400">Signed Proof: <span class="text-zinc-200 select-all">${escapeHtml(res.signed_proof_hash)}</span></div>
          ${res.hmac_signature ? `<div class="text-[11px] text-zinc-400">HMAC-SHA256: <span class="text-emerald-400 select-all">${escapeHtml(res.hmac_signature)}</span></div>` : ""}
        `;
        showToast("Placement certificate verified!", "success");
      } else {
        box.className = "p-4 rounded-lg border border-rose-800 bg-rose-950/20 font-mono text-xs text-rose-400";
        box.textContent = "Verification Failed: Invalid roll number or private secret salt.";
        showToast("Verification failed.", "error");
      }
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Generate & Verify Placement Certificate";
    }
  });
}

async function loadLeaderboard() {
  const tbody = document.getElementById("tbody-leaderboard");
  if (!tbody) return;
  try {
    const resp = await fetch("/api/leaderboard");
    if (!resp.ok) return;
    const data = await resp.json();
    const myAlias = state.currentGhost?.alias;
    tbody.innerHTML = (data.leaderboard || []).map((item) => {
      const isMe = myAlias && item.alias === myAlias;
      return `
        <tr class="${isMe ? "bg-emerald-950/30" : "hover:bg-zinc-900/50"}">
          <td class="p-3 font-bold text-zinc-400">#${item.rank}</td>
          <td class="p-3 font-bold text-emerald-400">${escapeHtml(item.alias)} ${isMe ? "(You)" : ""}</td>
          <td class="p-3 text-zinc-200">${item.elo_rating}</td>
          <td class="p-3 text-zinc-400">${item.human_trust_score}%</td>
        </tr>
      `;
    }).join("");
  } catch (e) {
    console.warn("Leaderboard error:", e);
  }
}
