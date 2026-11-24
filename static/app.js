/**
 * app.js — Main ES Module Controller for CampusGhosts Phase 4
 *
 * Coordinates:
 * 1. AntiCheatGuard & telemetry monitoring.
 * 2. GhostReplayEngine & dynamic rival simulation.
 * 3. Dynamic Chart.js k-anonymity heatmap with live safe/raw view toggling.
 * 4. Zero-knowledge commitment auth, live duel submission, and placement claim verification.
 * 5. Dynamic multi-problem catalog, starter code management, and dynamic test evaluation.
 */

import { AntiCheatGuard } from "./guard.js";
import { GhostReplayEngine, DEMO_PRESETS, getPresetForProblem } from "./replay.js";

// ---------------------------------------------------------------------------
// Client-Side Fallback Problem Catalog (mirrors backend /api/problems)
// ---------------------------------------------------------------------------
const CLIENT_PROBLEMS = {
  "arr-bound": {
    id: "arr-bound",
    title: "Bounded Array Sum",
    concept_tag: "ARRAY_OUT_OF_BOUNDS",
    difficulty: "Easy",
    description: "Sum array elements strictly respecting boundary invariants [0, N-1] without off-by-one overruns.",
    starter_code: {
      cpp: `// Target: Bounded Array Sum Accumulator (C++)
#include <iostream>
#include <vector>

int sumArrayElements(const std::vector<int>& arr) {
    int total = 0;
    // TODO: Sum all elements in arr safely within [0, arr.size() - 1]
    for (size_t i = 0; i < arr.size(); ++i) {
        total += arr[i];
    }
    return total;
}`,
      python: `# Target: Bounded Array Sum Accumulator (Python)
def sum_array_elements(arr: list[int]) -> int:
    total = 0
    # TODO: Safely accumulate array elements without exceeding bounds
    for x in arr:
        total += x
    return total`,
    },
    buggy_code: {
      cpp: `// Buggy C++: Off-by-one <= causes buffer overread
#include <iostream>
#include <vector>

int sumArrayElements(const std::vector<int>& arr) {
    int total = 0;
    for (size_t i = 0; i <= arr.size(); ++i) {
        total += arr[i];
    }
    return total;
}`,
      python: `# Buggy Python: range(len + 1) raises IndexError
def sum_array_elements(arr: list[int]) -> int:
    total = 0
    for i in range(len(arr) + 1):
        total += arr[i]
    return total`,
    },
  },
  "ptr-swap": {
    id: "ptr-swap",
    title: "Safe Pointer Memory Swap",
    concept_tag: "POINTER_DEREF_NULL",
    difficulty: "Medium",
    description: "Swap two values in-place via memory pointers. Invariant: Never dereference null or uninitialized pointers.",
    starter_code: {
      cpp: `// Target: In-Place Integer Pointer Swap (C++)
#include <iostream>

void swapValues(int* a, int* b) {
    // TODO: Guard against nullptr, then swap pointed values
    if (!a || !b) return;
    int temp = *a;
    *a = *b;
    *b = temp;
}`,
      python: `# Target: In-Place Reference Swap (Python)
def swap_values(box_a: list, box_b: list) -> None:
    # TODO: Safely swap first element of both single-element lists
    if box_a is not None and box_b is not None and len(box_a) > 0 and len(box_b) > 0:
        box_a[0], box_b[0] = box_b[0], box_a[0]`,
    },
    buggy_code: {
      cpp: `// Buggy C++: Dereferencing uninitialized pointer
#include <iostream>

void swapValues(int* a, int* b) {
    int* temp;
    *temp = *a;
    *a = *b;
    *b = *temp;
}`,
      python: `def swap_values(box_a: list, box_b: list) -> None:
    temp = None
    val = temp[0]
    box_a[0], box_b[0] = box_b[0], val`,
    },
  },
  "loop-converge": {
    id: "loop-converge",
    title: "Collatz Loop Invariant",
    concept_tag: "LOOP_INFINITE_BOUND",
    difficulty: "Medium",
    description: "Calculate steps to reach 1 (even -> n/2, odd -> 3n+1). Invariant: Loop variant must strictly converge.",
    starter_code: {
      cpp: `// Target: Collatz Convergence Counter (C++)
#include <iostream>

int collatzSteps(int n) {
    int steps = 0;
    while (n > 1) {
        if (n % 2 == 0) n /= 2;
        else n = 3 * n + 1;
        steps++;
    }
    return steps;
}`,
      python: `# Target: Collatz Convergence Counter (Python)
def collatz_steps(n: int) -> int:
    steps = 0
    while n > 1:
        if n % 2 == 0:
            n = n // 2
        else:
            n = 3 * n + 1
        steps += 1
    return steps`,
    },
    buggy_code: {
      cpp: `// Buggy C++: Loop without progression
#include <iostream>

int collatzSteps(int n) {
    int steps = 0;
    while (true) {
        int dummy = 1;
    }
    return steps;
}`,
      python: `def collatz_steps(n: int) -> int:
    steps = 0
    while True:
        steps += 1`,
    },
  },
  "rec-fact": {
    id: "rec-fact",
    title: "Guarded Recursion",
    concept_tag: "RECURSION_NO_BASE",
    difficulty: "Easy",
    description: "Calculate factorial of n recursively with strict guarded base condition to prevent stack overflow.",
    starter_code: {
      cpp: `// Target: Guarded Recursive Factorial (C++)
#include <iostream>

long long factorial(int n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
}`,
      python: `# Target: Guarded Recursive Factorial (Python)
def factorial(n: int) -> int:
    if n <= 1:
        return 1
    return n * factorial(n - 1)`,
    },
    buggy_code: {
      cpp: `// Buggy C++: Missing base condition
#include <iostream>

long long factorial(int n) {
    return n * factorial(n - 1);
}`,
      python: `def factorial(n: int) -> int:
    return n * factorial(n - 1)`,
    },
  },
  "str-palindrome": {
    id: "str-palindrome",
    title: "Two-Pointer Palindrome",
    concept_tag: "ARRAY_OUT_OF_BOUNDS",
    difficulty: "Easy",
    description: "Verify palindrome symmetric invariants using two converging pointers with left < right checks.",
    starter_code: {
      cpp: `// Target: Two-Pointer Palindrome Check (C++)
#include <iostream>
#include <string>

bool isPalindrome(const std::string& s) {
    if (s.empty()) return true;
    int left = 0, right = (int)s.size() - 1;
    while (left < right) {
        if (s[left] != s[right]) return false;
        left++;
        right--;
    }
    return true;
}`,
      python: `# Target: Two-Pointer Palindrome Check (Python)
def is_palindrome(s: str) -> bool:
    if not s:
        return True
    left, right = 0, len(s) - 1
    while left < right:
        if s[left] != s[right]:
            return False
        left += 1
        right -= 1
    return True`,
    },
    buggy_code: {
      cpp: `// Buggy C++: Off-by-one indexing
#include <iostream>
#include <string>

bool isPalindrome(const std::string& s) {
    for (size_t i = 0; i <= s.size(); ++i) {
        if (s[i] != s[s.size() - 1 - i]) return false;
    }
    return true;
}`,
      python: `def is_palindrome(s: str) -> bool:
    for i in range(len(s) + 1):
        if s[i] != s[len(s) - 1 - i]:
            return False
    return True`,
    },
  },
};

// ---------------------------------------------------------------------------
// Global Application State
// ---------------------------------------------------------------------------
const state = {
  currentGhost: null,
  telemetryMode: "safe",
  isDuelActive: false,
  activeProblemId: "arr-bound",
  activeLanguage: "cpp",
  heatmapChart: null,
  guard: null,
  replay: null,
  problems: CLIENT_PROBLEMS,
  // 1v1 Matchmaking & Clock Tracking
  activeMatch: null,
  roundDurationSec: 180,
  roundRemainingSec: 180,
  timerIntervalId: null,
  duelStartTimeMs: null,
};

// ---------------------------------------------------------------------------
// Toast Notification Utility
// ---------------------------------------------------------------------------
function showToast(message, type = "info") {
  const toastText = document.getElementById("toast-anti-cheat-text");
  if (!toastText) return;

  const colorClass =
    type === "error" ? "text-rose-400" :
    type === "warning" ? "text-amber-400" :
    type === "success" ? "text-emerald-400" : "text-zinc-300";

  toastText.innerHTML = `<span class="${colorClass} font-semibold">${escapeHtml(message)}</span>`;

  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    if (state.guard) {
      const m = state.guard.getMetrics();
      toastText.innerHTML = `Anti-Cheat Active • Paste blocked: ${m.blockedPasteAttempts} • Tab strikes: ${m.strikes}/3 • Trust: ${m.humanTrustScore}%`;
    }
  }, 4200);
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------
window.addEventListener("DOMContentLoaded", async () => {
  await loadProblemCatalog();
  initGuardAndReplay();
  initTabs();
  initAuthCommit();
  initProblemSelector();
  initDuelControls();
  initPresets();
  initCodeSubmit();
  initHeatmap();
  initSchemaInspector();
  initPlacementClaim();

  // Load initial views
  loadHeatmapData();
  loadLeaderboard();
});

// ---------------------------------------------------------------------------
// Problem Catalog & Selector
// ---------------------------------------------------------------------------
async function loadProblemCatalog() {
  try {
    const resp = await fetch("/api/problems");
    if (resp.ok) {
      const data = await resp.json();
      if (Array.isArray(data.problems) && data.problems.length > 0) {
        state.problems = {};
        data.problems.forEach(p => {
          state.problems[p.id] = p;
        });
      }
    }
  } catch (e) {
    console.info("Using embedded problem catalog:", e);
  }
}

function initProblemSelector() {
  const selectProb = document.getElementById("select-problem");
  const selectLang = document.getElementById("select-language");

  if (selectProb) {
    selectProb.addEventListener("change", () => {
      state.activeProblemId = selectProb.value;
      updateProblemUI();
      loadStarterCode();
    });
  }

  if (selectLang) {
    selectLang.addEventListener("change", () => {
      state.activeLanguage = selectLang.value;
      loadStarterCode();
    });
  }

  // Set initial problem UI
  updateProblemUI();
  loadStarterCode();
}

function updateProblemUI() {
  const prob = state.problems[state.activeProblemId] || state.problems["arr-bound"];
  const titleEl = document.getElementById("problem-title");
  const badgeEl = document.getElementById("problem-badge");
  const descEl = document.getElementById("problem-desc");
  const diagProbLabel = document.getElementById("diag-problem-label");

  if (titleEl) titleEl.textContent = prob.title;
  if (badgeEl) {
    badgeEl.textContent = `${prob.concept_tag} • ${prob.difficulty}`;
    badgeEl.className = prob.concept_tag === "POINTER_DEREF_NULL"
      ? "px-1.5 py-0.5 rounded text-[10px] bg-rose-950 text-rose-400 border border-rose-800"
      : "px-1.5 py-0.5 rounded text-[10px] bg-amber-950 text-amber-400 border border-amber-800";
  }
  if (descEl) descEl.textContent = prob.description;
  if (diagProbLabel) diagProbLabel.textContent = `${prob.id} (${prob.title})`;

  // Update Remedial concept selector default
  const remSelect = document.getElementById("select-remedial-concept");
  if (remSelect && prob.concept_tag) {
    remSelect.value = prob.concept_tag;
  }
}

function loadStarterCode() {
  const editor = document.getElementById("editor-student");
  const prob = state.problems[state.activeProblemId] || state.problems["arr-bound"];
  const lang = state.activeLanguage || "cpp";

  if (editor && prob.starter_code && prob.starter_code[lang]) {
    editor.value = prob.starter_code[lang];
  }
}

// ---------------------------------------------------------------------------
// Guard & Replay Engine Setup
// ---------------------------------------------------------------------------
function initGuardAndReplay() {
  const studentEditor = document.getElementById("editor-student");
  const competitorEditor = document.getElementById("editor-competitor");

  // 1. Initialize AntiCheatGuard
  state.guard = new AntiCheatGuard({
    editorEl: studentEditor,
    onStrike: (count, reason) => {
      const strikesEl = document.getElementById("pill-strikes");
      if (strikesEl) strikesEl.textContent = `${count}/3`;
      showToast(`Warning Strike ${count}/3: ${reason}`, "warning");
    },
    onDisqualify: async (reason) => {
      const strikesEl = document.getElementById("pill-strikes");
      if (strikesEl) {
        strikesEl.textContent = "3/3 (DISQUALIFIED)";
        strikesEl.className = "text-rose-500 font-bold";
      }

      stopDuelSession();

      if (state.currentGhost && state.currentGhost.commitment_hash) {
        try {
          const resp = await fetch("/api/duel/penalty", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              commitment_hash: state.currentGhost.commitment_hash,
              reason: `Disqualified on Strike 3: ${reason}`,
            }),
          });
          if (resp.ok) {
            const data = await resp.json();
            state.currentGhost.elo_rating = data.new_elo;
            const eloEl = document.getElementById("pill-elo");
            if (eloEl) eloEl.textContent = String(data.new_elo);
          }
        } catch (e) {
          console.warn("Failed to apply penalty:", e);
        }
      }

      showToast(`DISQUALIFIED (3 Strikes): 25 ELO penalty deducted! ${reason}`, "error");
    },
    onTrustUpdate: (score, metrics) => {
      const trustEl = document.getElementById("pill-trust");
      if (trustEl) {
        trustEl.textContent = `${score}%`;
        trustEl.className = score >= 80 ? "text-emerald-400 font-bold" :
                            score >= 50 ? "text-amber-400 font-bold" : "text-rose-500 font-bold";
      }

      const toastText = document.getElementById("toast-anti-cheat-text");
      if (toastText && !showToast._timer) {
        toastText.textContent = `Anti-Cheat Active • Paste blocked: ${metrics.blockedPasteAttempts} • Flight σ: ${metrics.flightTimeStdDev}ms • Velocity var: ${metrics.velocityVariance}`;
      }
    },
    onPasteBlocked: () => {
      showToast(`PASTE BLOCKED: External clipboard paste intercepted! (-18 trust score)`, "error");
    },
  });

  // 2. Initialize GhostReplayEngine
  state.replay = new GhostReplayEngine({
    targetEl: competitorEditor,
    rivalName: "Cipher_14",
    rivalElo: 1220,
    baseDelayMs: 40,
    onProgress: (percent) => {
      const progressLabel = document.getElementById("replay-progress-label");
      if (progressLabel) progressLabel.textContent = `${percent}%`;
      const rivalBar = document.getElementById("rival-progress-bar");
      if (rivalBar) rivalBar.style.width = `${percent}%`;
    },
    onComplete: () => {
      const progressLabel = document.getElementById("replay-progress-label");
      if (progressLabel) progressLabel.textContent = "100% (Finished)";
      const rivalBar = document.getElementById("rival-progress-bar");
      if (rivalBar) rivalBar.style.width = "100%";
      const rivalName = state.activeMatch?.rival?.alias || state.replay?.rivalName || "Rival Ghost";
      showToast(`${rivalName} completed writing code! Submit now to claim match speed advantage.`, "info");
    },
  });

  // Track student editor keystrokes for live progress bar
  if (studentEditor) {
    studentEditor.addEventListener("input", () => {
      const text = studentEditor.value;
      const lines = text.split("\n").length;
      const chars = text.length;
      const progLabel = document.getElementById("student-progress-label");
      if (progLabel) progLabel.textContent = `L:${lines} • C:${chars}`;
      const studentBar = document.getElementById("student-progress-bar");
      if (studentBar) {
        const pct = Math.min(100, Math.round((chars / 250) * 100));
        studentBar.style.width = `${pct}%`;
      }
    });
  }

  // 3. Reset strikes button
  const resetBtn = document.getElementById("btn-reset-strikes");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (state.guard) {
        state.guard.resetStrikes();
        const strikesEl = document.getElementById("pill-strikes");
        if (strikesEl) {
          strikesEl.textContent = "0/3";
          strikesEl.className = "text-amber-400 font-bold";
        }
        showToast("Strikes reset to 0/3 for live rehearsal.", "success");
      }
    });
  }

  // 4. Anti-Cheat Mode Toggle (Strict vs Relaxed)
  const modeBtn = document.getElementById("btn-toggle-anticheat-mode");
  if (modeBtn) {
    modeBtn.addEventListener("click", () => {
      if (state.guard) {
        const nextMode = state.guard.mode === "strict" ? "relaxed" : "strict";
        state.guard.setMode(nextMode);
        modeBtn.textContent = nextMode === "strict" ? "Strict" : "Relaxed (Dev)";
        modeBtn.className = nextMode === "strict"
          ? "text-[9px] text-amber-400 hover:text-amber-300 font-mono underline ml-1"
          : "text-[9px] text-cyan-400 hover:text-cyan-300 font-mono underline ml-1";
        showToast(`Anti-Cheat set to ${nextMode.toUpperCase()} mode (${nextMode === "relaxed" ? "Multi-monitor / rehearsal friendly" : "Strict tab & blur enforcement"}).`, "info");
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Duel Controls (Start / Stop 1v1 Duel)
// ---------------------------------------------------------------------------
function initDuelControls() {
  const startDuelBtn = document.getElementById("btn-start-duel");
  if (!startDuelBtn) return;

  startDuelBtn.addEventListener("click", () => {
    if (!state.currentGhost) {
      showToast("Please enter as Ghost first using the Top Bar!", "warning");
      return;
    }

    if (!state.isDuelActive) {
      startDuelSession();
    } else {
      stopDuelSession();
    }
  });

  initOutcomeModal();
}

async function startDuelSession() {
  if (!state.currentGhost || !state.currentGhost.commitment_hash) {
    showToast("Please enter as Ghost first using the Top Bar!", "warning");
    return;
  }

  const startDuelBtn = document.getElementById("btn-start-duel");
  const labelEl = document.getElementById("btn-start-duel-label");
  const statusPill = document.getElementById("duel-status-pill");
  const timerBox = document.getElementById("duel-timer-box");

  try {
    if (labelEl) labelEl.textContent = "Matching Ghost...";
    if (statusPill) {
      statusPill.textContent = "SCANNING PEERS...";
      statusPill.className = "px-2 py-0.5 rounded font-mono text-[10px] font-semibold bg-amber-950 text-amber-400 border border-amber-800 animate-pulse";
      statusPill.classList.remove("hidden");
    }

    // Call real matchmaking endpoint against institutional DB
    const resp = await fetch("/api/duel/matchmake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commitment_hash: state.currentGhost.commitment_hash,
        problem_id: state.activeProblemId || "arr-bound",
        language: state.activeLanguage || "cpp",
      }),
    });

    if (!resp.ok) {
      throw new Error("Matchmaking endpoint returned " + resp.status);
    }

    const matchData = await resp.json();
    state.activeMatch = matchData;
    state.isDuelActive = true;
    state.duelStartTimeMs = Date.now();
    state.roundDurationSec = matchData.round_duration_sec || 180;
    state.roundRemainingSec = state.roundDurationSec;

    // Configure matched rival in replay engine
    const rival = matchData.rival;
    state.replay.configureRival({
      name: rival.alias,
      elo: rival.elo,
      targetTimeSec: rival.target_time_sec,
      cps: rival.cps,
    });

    const rivalHeader = document.getElementById("rival-pane-header");
    if (rivalHeader) {
      rivalHeader.textContent = `Rival Ghost (${rival.alias} • ELO ${rival.elo})`;
    }

    const studentHeader = document.getElementById("student-pane-header");
    if (studentHeader && state.currentGhost.alias) {
      studentHeader.textContent = `You (${state.currentGhost.alias} • ELO ${state.currentGhost.elo_rating})`;
    }

    // Arm AntiCheatGuard and start replay
    state.guard.startDuel();
    state.replay.start(state.activeProblemId || "arr-bound", state.activeLanguage || "cpp");

    if (startDuelBtn && labelEl) {
      startDuelBtn.className = "bg-rose-600 hover:bg-rose-500 text-zinc-950 font-bold px-2.5 py-1 rounded text-[11px] font-mono transition-colors flex items-center gap-1";
      labelEl.textContent = "Surrender Duel";
    }

    if (statusPill) {
      statusPill.textContent = "MATCH IN PROGRESS";
      statusPill.className = "px-2 py-0.5 rounded font-mono text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800";
    }

    if (timerBox) timerBox.classList.remove("hidden");
    startRoundCountdown();

    showToast(`Paired with rival ${rival.alias} (ELO ${rival.elo})! 3-minute round active.`, "success");
  } catch (err) {
    console.warn("Matchmaking error fallback:", err);
    const rival = state.replay.randomizeRival();
    state.activeMatch = {
      match_id: `match_local_${Date.now()}`,
      rival: { alias: rival.name, elo: rival.elo, target_time_sec: 90 },
      round_duration_sec: 180,
    };
    state.isDuelActive = true;
    state.duelStartTimeMs = Date.now();
    state.roundDurationSec = 180;
    state.roundRemainingSec = 180;

    state.guard.startDuel();
    state.replay.start(state.activeProblemId || "arr-bound", state.activeLanguage || "cpp");

    const rivalHeader = document.getElementById("rival-pane-header");
    if (rivalHeader) rivalHeader.textContent = `Rival Ghost (${rival.name} • ELO ${rival.elo})`;

    if (startDuelBtn && labelEl) {
      startDuelBtn.className = "bg-rose-600 hover:bg-rose-500 text-zinc-950 font-bold px-2.5 py-1 rounded text-[11px] font-mono transition-colors flex items-center gap-1";
      labelEl.textContent = "Surrender Duel";
    }
    if (statusPill) {
      statusPill.textContent = "MATCH IN PROGRESS";
      statusPill.className = "px-2 py-0.5 rounded font-mono text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800";
      statusPill.classList.remove("hidden");
    }
    if (timerBox) timerBox.classList.remove("hidden");
    startRoundCountdown();
  }
}

function startRoundCountdown() {
  clearInterval(state.timerIntervalId);
  updateTimerDisplay();

  state.timerIntervalId = setInterval(() => {
    state.roundRemainingSec -= 1;
    updateTimerDisplay();

    if (state.roundRemainingSec <= 0) {
      clearInterval(state.timerIntervalId);
      handleDuelTimeout();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const clockEl = document.getElementById("duel-countdown-clock");
  if (!clockEl) return;

  const mins = Math.floor(Math.max(0, state.roundRemainingSec) / 60);
  const secs = Math.max(0, state.roundRemainingSec) % 60;
  clockEl.textContent = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

  if (state.roundRemainingSec <= 30) {
    clockEl.className = "font-bold text-rose-500 animate-pulse";
  } else {
    clockEl.className = "font-bold text-amber-400";
  }
}

function handleDuelTimeout() {
  showToast("ROUND TIME EXPIRED! Clock reached 00:00.", "error");
  stopDuelSession();

  const statusPill = document.getElementById("duel-status-pill");
  if (statusPill) {
    statusPill.textContent = "TIME EXPIRED";
    statusPill.className = "px-2 py-0.5 rounded font-mono text-[10px] font-semibold bg-rose-950 text-rose-400 border border-rose-800";
    statusPill.classList.remove("hidden");
  }
}

function stopDuelSession() {
  state.isDuelActive = false;
  clearInterval(state.timerIntervalId);
  state.timerIntervalId = null;

  state.guard.stopDuel();
  state.replay.stop();

  const startDuelBtn = document.getElementById("btn-start-duel");
  const labelEl = document.getElementById("btn-start-duel-label");
  const timerBox = document.getElementById("duel-timer-box");
  const statusPill = document.getElementById("duel-status-pill");

  if (startDuelBtn && labelEl) {
    startDuelBtn.className = "bg-cyan-600 hover:bg-cyan-500 text-zinc-950 font-bold px-2.5 py-1 rounded text-[11px] font-mono transition-colors flex items-center gap-1";
    labelEl.textContent = "Start 1v1 Duel";
  }

  if (timerBox) timerBox.classList.add("hidden");
  if (statusPill) {
    statusPill.textContent = "STANDBY";
    statusPill.classList.add("hidden");
  }

  showToast("1v1 Duel session disarmed.", "info");
}

function initOutcomeModal() {
  const modal = document.getElementById("duel-outcome-modal");
  const btnNext = document.getElementById("btn-outcome-next");
  const btnReview = document.getElementById("btn-outcome-review");

  if (btnNext) {
    btnNext.addEventListener("click", () => {
      if (modal) modal.classList.add("hidden");
      // Load starter code and start next duel
      loadStarterCode();
      startDuelSession();
    });
  }

  if (btnReview) {
    btnReview.addEventListener("click", () => {
      if (modal) modal.classList.add("hidden");
      const logDetails = document.getElementById("diag-details-log");
      if (logDetails) {
        logDetails.classList.remove("hidden");
        logDetails.scrollIntoView({ behavior: "smooth" });
      }
    });
  }
}

function showDuelOutcomeModal(result, elapsedSec) {
  const modal = document.getElementById("duel-outcome-modal");
  if (!modal) return;

  const summary = result.match_summary || {};
  const diag = result.diagnostic || {};
  const passed = Boolean(diag.passed);
  const outcome = summary.outcome || (passed ? "VICTORY" : "DEFEAT");
  const delta = result.elo_delta || 0;
  const newElo = result.new_elo || (state.currentGhost?.elo_rating || 1200);
  const oldElo = newElo - delta;

  // Header Banner & Badges
  const titleEl = document.getElementById("duel-outcome-title");
  const badgeEl = document.getElementById("duel-outcome-badge");
  const iconEl = document.getElementById("duel-outcome-icon");
  const msgEl = document.getElementById("duel-outcome-message");

  if (outcome === "VICTORY") {
    if (titleEl) {
      titleEl.textContent = "DUEL CONCLUDED: VICTORY";
      titleEl.className = "text-sm font-bold tracking-wider text-emerald-400";
    }
    if (badgeEl) {
      badgeEl.textContent = `+${delta} ELO`;
      badgeEl.className = "px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800";
    }
    if (iconEl) iconEl.className = "w-3 h-3 rounded-full bg-emerald-500";
  } else if (outcome === "RUNNER_UP") {
    if (titleEl) {
      titleEl.textContent = "DUEL CONCLUDED: RUNNER-UP";
      titleEl.className = "text-sm font-bold tracking-wider text-amber-400";
    }
    if (badgeEl) {
      badgeEl.textContent = delta >= 0 ? `+${delta} ELO` : `${delta} ELO`;
      badgeEl.className = "px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-950 text-amber-300 border border-amber-800";
    }
    if (iconEl) iconEl.className = "w-3 h-3 rounded-full bg-amber-500";
  } else {
    if (titleEl) {
      titleEl.textContent = "DUEL CONCLUDED: DEFEAT";
      titleEl.className = "text-sm font-bold tracking-wider text-rose-400";
    }
    if (badgeEl) {
      badgeEl.textContent = `${delta} ELO`;
      badgeEl.className = "px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-950 text-rose-300 border border-rose-800";
    }
    if (iconEl) iconEl.className = "w-3 h-3 rounded-full bg-rose-500";
  }

  if (msgEl) msgEl.textContent = summary.outcome_message || (passed ? "All test assertions passed." : "Invariant violation occurred.");

  // Student Stats
  const sAlias = document.getElementById("outcome-student-alias");
  const sElo = document.getElementById("outcome-student-elo");
  const sTime = document.getElementById("outcome-student-time");
  const sVerdict = document.getElementById("outcome-student-verdict");

  if (sAlias) sAlias.textContent = state.currentGhost?.alias || "Cipher_You";
  if (sElo) sElo.textContent = String(newElo);
  if (sTime) sTime.textContent = `${elapsedSec.toFixed(1)}s`;
  if (sVerdict) {
    sVerdict.textContent = diag.concept_tag || (passed ? "OPTIMAL" : "FAILED");
    sVerdict.className = passed ? "text-emerald-400 font-bold" : "text-rose-400 font-bold";
  }

  // Rival Stats
  const rAlias = document.getElementById("outcome-rival-alias");
  const rElo = document.getElementById("outcome-rival-elo");
  const rStatus = document.getElementById("outcome-rival-status");
  const rHandicap = document.getElementById("outcome-rival-handicap");

  const rivalAlias = summary.rival_alias || state.activeMatch?.rival?.alias || "Cipher_Peer";
  const rivalElo = summary.rival_elo || state.activeMatch?.rival?.elo || 1200;
  const rivalFinished = Boolean(summary.rival_finished);

  if (rAlias) rAlias.textContent = rivalAlias;
  if (rElo) rElo.textContent = String(rivalElo);
  if (rStatus) {
    rStatus.textContent = rivalFinished ? "Completed Code" : `Incomplete (${state.replay?.progressPercent || 0}%)`;
    rStatus.className = rivalFinished ? "text-cyan-400 font-semibold" : "text-zinc-400";
  }
  if (rHandicap) {
    const target = state.activeMatch?.rival?.target_time_sec || 90;
    rHandicap.textContent = `${target}s target window`;
  }

  // ELO calculation
  const eloCalc = document.getElementById("outcome-elo-calc");
  if (eloCalc) {
    const sign = delta >= 0 ? "+" : "";
    eloCalc.textContent = `${sign}${delta} ELO (${oldElo} → ${newElo})`;
    eloCalc.className = delta >= 0 ? "font-bold text-emerald-400" : "font-bold text-rose-400";
  }

  // Socratic Note
  const noteEl = document.getElementById("outcome-socratic-note");
  if (noteEl) noteEl.textContent = diag.socratic_hint || "Verification complete.";

  // Display modal
  modal.classList.remove("hidden");
}

// ---------------------------------------------------------------------------
// Preset Code Buttons
// ---------------------------------------------------------------------------
function initPresets() {
  const editor = document.getElementById("editor-student");
  const btnResetStarter = document.getElementById("btn-reset-starter");
  const btnArray = document.getElementById("btn-preset-array");
  const btnClean = document.getElementById("btn-preset-clean");

  if (btnResetStarter) {
    btnResetStarter.addEventListener("click", () => {
      loadStarterCode();
      showToast("Reset editor to clean problem starter code.", "info");
    });
  }

  if (btnArray) {
    btnArray.addEventListener("click", () => {
      const prob = state.problems[state.activeProblemId] || state.problems["arr-bound"];
      const lang = state.activeLanguage || "cpp";
      if (editor && prob.buggy_code && prob.buggy_code[lang]) {
        editor.value = prob.buggy_code[lang];
      } else if (editor) {
        editor.value = DEMO_PRESETS.ARRAY_BUG;
      }
      showToast(`Loaded sample buggy code for ${prob.title}. Submit to observe invariant failure.`, "warning");
    });
  }

  if (btnClean) {
    btnClean.addEventListener("click", () => {
      const prob = state.problems[state.activeProblemId] || state.problems["arr-bound"];
      const lang = state.activeLanguage || "cpp";
      if (editor && prob.starter_code && prob.starter_code[lang]) {
        editor.value = prob.starter_code[lang];
      } else if (editor) {
        editor.value = DEMO_PRESETS.CLEAN_SOLUTION;
      }
      showToast(`Loaded reference solution for ${prob.title}.`, "success");
    });
  }
}

// ---------------------------------------------------------------------------
// Auth Commitment Form & Demo Fill
// ---------------------------------------------------------------------------
function initAuthCommit() {
  const btnCommit = document.getElementById("btn-auth-commit");
  const btnGenSalt = document.getElementById("btn-gen-salt");
  const btnDemoFill = document.getElementById("btn-demo-fill");
  const inputRoll = document.getElementById("input-roll-no");
  const inputSalt = document.getElementById("input-secret-salt");

  // Random 128-bit salt generator
  if (btnGenSalt && inputSalt) {
    btnGenSalt.addEventListener("click", () => {
      const arr = new Uint8Array(16);
      window.crypto.getRandomValues(arr);
      const hex = Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
      inputSalt.value = `krmu_${hex}`;
      showToast("Generated cryptographic 128-bit private salt.", "info");
    });
  }

  // Quick Demo Credentials Fill
  if (btnDemoFill && inputRoll && inputSalt) {
    btnDemoFill.addEventListener("click", () => {
      inputRoll.value = "2601010043";
      inputSalt.value = "krmu2026_salt";
      showToast("Populated test demo credentials (Roll: 2601010043).", "info");
    });
  }

  if (btnCommit) {
    btnCommit.addEventListener("click", async () => {
      const rollNo = (inputRoll ? inputRoll.value : "").trim();
      const salt = (inputSalt ? inputSalt.value : "").trim();

      if (!rollNo) {
        showToast("Please enter an institutional roll number.", "warning");
        return;
      }
      if (salt.length < 8) {
        showToast("Secret salt must be at least 8 characters long.", "warning");
        return;
      }

      try {
        btnCommit.disabled = true;
        btnCommit.innerHTML = "<span>Anchoring...</span>";

        const resp = await fetch("/api/auth/commit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roll_no: rollNo, secret_salt: salt }),
        });

        if (!resp.ok) {
          const err = await resp.json();
          throw new Error(err.detail || "Commitment failed");
        }

        const data = await resp.json();
        state.currentGhost = data;

        // Update Top Bar Pills
        const aliasEl = document.getElementById("pill-ghost-alias");
        const eloEl = document.getElementById("pill-elo");
        const trustEl = document.getElementById("pill-trust");

        if (aliasEl) aliasEl.textContent = data.alias;
        if (eloEl) eloEl.textContent = String(data.elo_rating);
        if (trustEl) trustEl.textContent = `${data.human_trust_score}%`;

        // Pre-populate claim tab inputs for convenient auditing
        const claimRoll = document.getElementById("claim-roll-no");
        const claimSalt = document.getElementById("claim-secret-salt");
        if (claimRoll) claimRoll.value = rollNo;
        if (claimSalt) claimSalt.value = salt;

        showToast(`Zero-Knowledge Commitment Anchored: Alias ${data.alias} (ELO: ${data.elo_rating})`, "success");
      } catch (err) {
        showToast(`Commitment error: ${err.message}`, "error");
      } finally {
        btnCommit.disabled = false;
        btnCommit.innerHTML = "<span>Enter as Ghost</span>";
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Code Submission & AI Coach Update
// ---------------------------------------------------------------------------
function initCodeSubmit() {
  const submitBtn = document.getElementById("btn-submit-code");
  const editor = document.getElementById("editor-student");
  const selectLang = document.getElementById("select-language");

  if (!submitBtn) return;

  submitBtn.addEventListener("click", async () => {
    if (!state.currentGhost) {
      showToast("Please click 'Enter as Ghost' in the Top Bar before submitting!", "warning");
      return;
    }

    const code = (editor ? editor.value : "").trim();
    if (!code) {
      showToast("Editor is empty. Write or load code before submitting.", "warning");
      return;
    }

    const lang = (selectLang ? selectLang.value : "cpp") || "cpp";

    try {
      submitBtn.disabled = true;
      submitBtn.textContent = "Evaluating...";

      const elapsedSec = state.duelStartTimeMs
        ? (Date.now() - state.duelStartTimeMs) / 1000.0
        : 14.5;

      const rivalAlias = state.activeMatch?.rival?.alias || state.replay?.rivalName || "Cipher_Peer";
      const rivalElo = state.activeMatch?.rival?.elo || state.replay?.rivalElo || 1200;
      const rivalFinished = state.replay ? state.replay.isFinished() : false;

      const payload = {
        commitment_hash: state.currentGhost.commitment_hash,
        code: code,
        language: lang,
        problem_id: state.activeProblemId || "arr-bound",
        human_trust_score: state.guard ? state.guard.humanTrustScore : 100.0,
        opponent_elo: rivalElo,
        match_id: state.activeMatch?.match_id || "duel_live",
        rival_alias: rivalAlias,
        elapsed_time_sec: elapsedSec,
        rival_finished: rivalFinished,
      };

      const resp = await fetch("/api/duel/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.detail || "Submission evaluation failed");
      }

      const result = await resp.json();
      const diag = result.diagnostic || {};
      const passed = Boolean(diag.passed);

      // 1. Update Socratic Coach Card
      const badgeTag = document.getElementById("diag-badge-tag");
      const badgeSource = document.getElementById("diag-badge-source");
      const metricTime = document.getElementById("diag-metric-time");
      const metricMem = document.getElementById("diag-metric-mem");
      const metricDelta = document.getElementById("diag-metric-delta");
      const hintText = document.getElementById("diag-socratic-hint");

      if (badgeTag) {
        badgeTag.textContent = diag.concept_tag || (passed ? "OPTIMAL" : "BUG_DETECTED");
        badgeTag.className = passed
          ? "px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800"
          : diag.concept_tag === "LOGIC_INCORRECT" || diag.concept_tag === "SYNTAX_ERROR"
          ? "px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-950 text-amber-400 border border-amber-800"
          : "px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-rose-950 text-rose-400 border border-rose-800";
      }

      if (badgeSource) badgeSource.textContent = `source: ${diag.source || "offline"}`;
      if (metricTime) metricTime.textContent = `${diag.est_time_ms || 0} ms`;
      if (metricMem) metricMem.textContent = `${diag.est_memory_kb || 0} KB`;

      const delta = result.elo_delta || 0;
      if (metricDelta) {
        metricDelta.textContent = delta >= 0 ? `+${delta}` : `${delta}`;
        metricDelta.className = delta >= 0 ? "text-emerald-400 font-bold font-mono" : "text-rose-400 font-bold font-mono";
      }

      const badgeComplexity = document.getElementById("diag-badge-complexity");
      if (badgeComplexity) {
        badgeComplexity.textContent = diag.complexity || "O(N) time • O(1) space";
      }

      if (hintText) {
        hintText.textContent = diag.socratic_hint || (passed ? "All assertions passed and memory constraints satisfied." : "Invariant violation detected.");
      }

      const logDetails = document.getElementById("diag-details-log");
      const logOutput = document.getElementById("diag-log-output");
      if (logDetails && logOutput) {
        logDetails.classList.remove("hidden");
        logOutput.textContent = `[DIAGNOSTIC TRACE]
Problem Target: ${state.activeProblemId} (${lang.toUpperCase()})
Concept Tag   : ${diag.concept_tag}
Severity      : ${diag.severity || "LOW"}
Verdict       : ${passed ? "VERIFIED (Passed All Bounds & Test Cases)" : "INVARIANT VIOLATION DETECTED"}
Runtime Clock : ${diag.est_time_ms || 0} ms | Memory: ${diag.est_memory_kb || 0} KB
Complexity    : ${diag.complexity || "O(N) time • O(1) space"}
Socratic Note : ${diag.socratic_hint}
Evaluation Src: ${diag.source || "offline_fallback"}`;
      }

      // 2. Update Top Bar stats
      state.currentGhost.elo_rating = result.new_elo;
      const eloEl = document.getElementById("pill-elo");
      if (eloEl) eloEl.textContent = String(result.new_elo);

      // 3. Dynamic Heatmap Auto-Refresh
      await loadHeatmapData();

      // 4. Trigger Outcome Modal if duel was active
      if (state.isDuelActive) {
        showDuelOutcomeModal(result, elapsedSec);
        stopDuelSession();
      }

      if (passed) {
        showToast(`Verification Successful! Passed duel (+${delta} ELO).`, "success");
      } else {
        showToast(`Evaluation Alert: ${diag.concept_tag} (${delta} ELO). Heatmap updated.`, "error");
      }
    } catch (err) {
      showToast(`Submission error: ${err.message}`, "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Code";
    }
  });
}

// ---------------------------------------------------------------------------
// Tab Switching
// ---------------------------------------------------------------------------
function initTabs() {
  const tabs = document.querySelectorAll(".tab-btn");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");

      const targetId = tab.dataset.tab;
      document.getElementById("tab-heatmap")?.classList.add("hidden");
      document.getElementById("tab-inspector")?.classList.add("hidden");
      document.getElementById("tab-claim")?.classList.add("hidden");

      const targetEl = document.getElementById(targetId);
      if (targetEl) targetEl.classList.remove("hidden");

      if (targetId === "tab-inspector") loadSchemaInspect();
      if (targetId === "tab-claim") loadLeaderboard();
      if (targetId === "tab-heatmap") loadHeatmapData();
    });
  });
}

// ---------------------------------------------------------------------------
// Tab 1: k-Anonymous Failure Heatmap & Remedial Plan
// ---------------------------------------------------------------------------
function initHeatmap() {
  const toggleBtn = document.getElementById("btn-toggle-telemetry-mode");
  const refreshBtn = document.getElementById("btn-refresh-heatmap");
  const remedialBtn = document.getElementById("btn-remedial-plan");
  const closeRemedialBtn = document.getElementById("btn-close-remedial");

  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      state.telemetryMode = state.telemetryMode === "safe" ? "raw" : "safe";
      const descEl = document.getElementById("telemetry-mode-desc");

      if (state.telemetryMode === "safe") {
        toggleBtn.textContent = "Safe View (k \u2265 5 Masked)";
        toggleBtn.className = "bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold px-2.5 py-1 rounded text-xs font-mono transition-colors";
        if (descEl) descEl.textContent = "Clusters < 5 ghosts are mathematically masked";
      } else {
        toggleBtn.textContent = "Raw DB Audit Mode";
        toggleBtn.className = "bg-rose-600 hover:bg-rose-500 text-zinc-950 font-bold px-2.5 py-1 rounded text-xs font-mono transition-colors";
        if (descEl) descEl.textContent = "Exposes raw failure counts for institutional audit";
      }

      loadHeatmapData();
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      loadHeatmapData();
      showToast("Heatmap telemetry refreshed.", "info");
    });
  }

  if (remedialBtn) {
    remedialBtn.addEventListener("click", async () => {
      const selectConcept = document.getElementById("select-remedial-concept");
      const targetTag = selectConcept ? selectConcept.value : "ARRAY_OUT_OF_BOUNDS";
      await loadRemedialPlan(targetTag);
    });
  }

  if (closeRemedialBtn) {
    closeRemedialBtn.addEventListener("click", () => {
      document.getElementById("card-remedial")?.classList.add("hidden");
    });
  }
}

async function loadHeatmapData() {
  try {
    const resp = await fetch(`/api/faculty/telemetry?mode=${state.telemetryMode}`);
    if (!resp.ok) return;
    const data = await resp.json();
    const clusters = data.clusters || [];

    renderHeatmapChart(clusters);
  } catch (e) {
    console.warn("Failed to load telemetry:", e);
  }
}

function renderHeatmapChart(clusters) {
  const canvas = document.getElementById("canvas-heatmap");
  if (!canvas || !window.Chart) return;

  const labels = clusters.map(c => c.concept_tag);
  const values = clusters.map(c => c.masked ? 0 : (c.count || 0));

  const bgColors = clusters.map(c => {
    if (c.masked) return "rgba(113, 113, 122, 0.4)";
    if (c.concept_tag === "ARRAY_OUT_OF_BOUNDS") return "rgba(245, 158, 11, 0.8)";
    if (c.concept_tag === "POINTER_DEREF_NULL") return "rgba(244, 63, 94, 0.8)";
    if (c.concept_tag === "LOGIC_INCORRECT") return "rgba(234, 179, 8, 0.8)";
    return "rgba(16, 185, 129, 0.8)";
  });

  const borderColors = clusters.map(c => {
    if (c.masked) return "rgba(161, 161, 170, 0.8)";
    if (c.concept_tag === "ARRAY_OUT_OF_BOUNDS") return "#F59E0B";
    if (c.concept_tag === "POINTER_DEREF_NULL") return "#F43F5E";
    if (c.concept_tag === "LOGIC_INCORRECT") return "#EAB308";
    return "#10B981";
  });

  if (state.heatmapChart) {
    state.heatmapChart.destroy();
    state.heatmapChart = null;
  }

  state.heatmapChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Distinct Student Ghosts Tripped",
          data: values,
          backgroundColor: bgColors,
          borderColor: borderColors,
          borderWidth: 1.5,
          borderRadius: 4,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      onClick: (event, elements) => {
        if (elements && elements.length > 0) {
          const idx = elements[0].index;
          const clickedTag = labels[idx];
          if (clickedTag) {
            const selectConcept = document.getElementById("select-remedial-concept");
            if (selectConcept) selectConcept.value = clickedTag;
            loadRemedialPlan(clickedTag);
          }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const cluster = clusters[ctx.dataIndex];
              if (cluster && cluster.masked) {
                return " Privacy Status: MASKED (k < 5 ghosts)";
              }
              return ` Distinct Ghosts: ${cluster.count} (Click bar to generate remedial plan)`;
            },
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          suggestedMax: 16,
          grid: { color: "#27272A" },
          ticks: { color: "#A1A1AA", font: { family: "monospace", size: 10 } },
        },
        y: {
          grid: { display: false },
          ticks: { color: "#FAFAFA", font: { family: "monospace", size: 10 } },
        },
      },
    },
  });
}

async function loadRemedialPlan(conceptTag = "ARRAY_OUT_OF_BOUNDS") {
  const card = document.getElementById("card-remedial");
  const titleEl = document.getElementById("remedial-title");
  const slidesGrid = document.getElementById("remedial-slides-grid");
  const vivaList = document.getElementById("remedial-viva-list");

  try {
    const resp = await fetch("/api/faculty/remedial", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ concept_tag: conceptTag, ghost_count: 5 }),
    });

    if (!resp.ok) throw new Error("Remedial generation failed");
    const plan = await resp.json();

    if (titleEl) titleEl.textContent = plan.title;

    if (slidesGrid) {
      slidesGrid.innerHTML = (plan.slides || []).map(s => `
        <div class="bg-zinc-950 p-2 rounded border border-zinc-800 text-[10px] space-y-1">
          <span class="text-amber-400 font-bold block font-mono">Slide ${s.slide_num}</span>
          <strong class="text-zinc-200 block truncate">${escapeHtml(s.heading)}</strong>
          <p class="text-zinc-400 line-clamp-3 leading-tight">${escapeHtml(s.content)}</p>
        </div>
      `).join("");
    }

    if (vivaList) {
      vivaList.innerHTML = (plan.viva_questions || []).map((v, i) => `
        <div class="bg-zinc-950 p-2 rounded border border-zinc-800/80 text-[10px]">
          <span class="text-emerald-400 font-bold font-mono">Q${i + 1}: ${escapeHtml(v.question)}</span>
          <p class="text-zinc-300 mt-0.5 leading-relaxed"><strong class="text-zinc-500">Model Answer:</strong> ${escapeHtml(v.answer)}</p>
        </div>
      `).join("");
    }

    if (card) card.classList.remove("hidden");
    showToast(`Rendered 5-slide remedial plan for ${conceptTag}.`, "success");
  } catch (err) {
    showToast(`Remedial error: ${err.message}`, "error");
  }
}

// ---------------------------------------------------------------------------
// Tab 2: DB Unlinkability Inspector
// ---------------------------------------------------------------------------
function initSchemaInspector() {
  const refreshBtn = document.getElementById("btn-refresh-inspector");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      loadSchemaInspect();
      showToast("Schema inspection refreshed.", "info");
    });
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
      const students = data.verified_students_sample || [];
      tbodyStudents.innerHTML = students.map(s => `
        <tr>
          <td class="p-2 font-bold text-zinc-100">${escapeHtml(s.roll_no)}</td>
          <td class="p-2 text-zinc-400 text-[10px]">${escapeHtml(s.verified_at ? s.verified_at.slice(0, 19) : "")}</td>
        </tr>
      `).join("") || '<tr><td colspan="2" class="p-3 text-center text-zinc-500">No records found</td></tr>';
    }

    if (tbodyGhosts) {
      const ghosts = data.ghost_profiles_sample || [];
      tbodyGhosts.innerHTML = ghosts.map(g => `
        <tr>
          <td class="p-2 text-zinc-400 text-[10px]" title="${escapeHtml(g.commitment_hash)}">${escapeHtml(g.commitment_hash.slice(0, 10))}...</td>
          <td class="p-2 font-bold text-emerald-400">${escapeHtml(g.alias)}</td>
          <td class="p-2 text-zinc-200">${escapeHtml(String(g.elo_rating))}</td>
        </tr>
      `).join("") || '<tr><td colspan="3" class="p-3 text-center text-zinc-500">No records found</td></tr>';
    }

    const badgeFk = document.getElementById("badge-fk-status");
    if (badgeFk && data.zero_foreign_keys_verified) {
      badgeFk.textContent = "PRAGMA foreign_key_list = [] (0 FKs Verified Clean)";
      badgeFk.className = "text-[10px] bg-emerald-900/60 text-emerald-300 px-2 py-0.5 rounded border border-emerald-800 font-semibold";
    }
  } catch (e) {
    console.warn("Failed to load schema inspect:", e);
  }
}

// ---------------------------------------------------------------------------
// Tab 3: Placement Claim Verifier & Leaderboard
// ---------------------------------------------------------------------------
function initPlacementClaim() {
  const verifyBtn = document.getElementById("btn-verify-claim");
  const rollInput = document.getElementById("claim-roll-no");
  const saltInput = document.getElementById("claim-secret-salt");
  const resultBox = document.getElementById("claim-result-box");

  if (verifyBtn) {
    verifyBtn.addEventListener("click", async () => {
      const roll = (rollInput ? rollInput.value : "").trim();
      const salt = (saltInput ? saltInput.value : "").trim();

      if (!roll || !salt) {
        showToast("Please enter roll number and secret salt to verify.", "warning");
        return;
      }

      try {
        verifyBtn.disabled = true;
        verifyBtn.textContent = "Verifying Ownership...";

        const resp = await fetch("/api/claim/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roll_no: roll, secret_salt: salt }),
        });

        if (!resp.ok) throw new Error("Verification request failed");
        const res = await resp.json();

        if (!resultBox) return;
        resultBox.classList.remove("hidden");

        if (res.verified) {
          resultBox.className = "p-3 rounded border border-emerald-800/80 bg-emerald-950/20 font-mono text-xs space-y-2";
          resultBox.innerHTML = `
            <div class="flex items-center justify-between">
              <span class="text-emerald-400 font-bold flex items-center gap-1.5">
                \u2713 Cryptographic Ownership Verified (Rank #${res.rank})
              </span>
              <span class="text-[10px] bg-emerald-900/60 text-emerald-300 px-1.5 py-0.5 rounded">HMAC-SHA256 Valid</span>
            </div>
            <div class="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-emerald-900/40">
              <div><span class="text-zinc-500">Ghost Alias:</span> <strong class="text-emerald-400">${escapeHtml(res.alias)}</strong></div>
              <div><span class="text-zinc-500">Verified ELO:</span> <strong class="text-zinc-200">${escapeHtml(String(res.elo_rating))}</strong></div>
            </div>
            <div class="pt-1">
              <span class="text-[10px] text-zinc-500 block mb-0.5">Signed Placement Audit Hash:</span>
              <div class="flex items-center gap-2 mb-1.5">
                <input id="input-signed-hash" type="text" readonly value="${escapeHtml(res.signed_proof_hash)}" class="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[10px] text-zinc-300 flex-1 outline-none font-mono" />
                <button id="btn-copy-signed-hash" class="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-2 py-1 rounded text-[10px]">Copy</button>
              </div>
              ${res.hmac_signature ? `
              <span class="text-[10px] text-zinc-500 block mb-0.5">Institutional HMAC-SHA256 Token:</span>
              <div class="flex items-center gap-2">
                <input id="input-hmac-sig" type="text" readonly value="${escapeHtml(res.hmac_signature)}" class="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[10px] text-emerald-400 flex-1 outline-none font-mono" />
                <button id="btn-copy-hmac-sig" class="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-2 py-1 rounded text-[10px]">Copy</button>
              </div>` : ''}
            </div>
          `;

          const copyBtn = document.getElementById("btn-copy-signed-hash");
          const hashInput = document.getElementById("input-signed-hash");
          if (copyBtn && hashInput) {
            copyBtn.addEventListener("click", () => {
              navigator.clipboard.writeText(hashInput.value);
              copyBtn.textContent = "Copied!";
              setTimeout(() => { copyBtn.textContent = "Copy"; }, 2000);
            });
          }

          const copyHmacBtn = document.getElementById("btn-copy-hmac-sig");
          const hmacInput = document.getElementById("input-hmac-sig");
          if (copyHmacBtn && hmacInput) {
            copyHmacBtn.addEventListener("click", () => {
              navigator.clipboard.writeText(hmacInput.value);
              copyHmacBtn.textContent = "Copied!";
              setTimeout(() => { copyHmacBtn.textContent = "Copy"; }, 2000);
            });
          }

          showToast(`Verified Placement Claim: Rank #${res.rank} (${res.alias})`, "success");
        } else {
          resultBox.className = "p-3 rounded border border-rose-800/80 bg-rose-950/20 font-mono text-xs text-rose-400";
          resultBox.innerHTML = `
            <strong>\u2717 Verification Failed:</strong> Provided credentials do not match cryptographic commitment hash.
          `;
          showToast("Placement verification failed: Invalid secret salt.", "error");
        }
      } catch (err) {
        showToast(`Verification error: ${err.message}`, "error");
      } finally {
        verifyBtn.disabled = false;
        verifyBtn.textContent = "Verify Placement Ownership";
      }
    });
  }
}

async function loadLeaderboard() {
  const tbody = document.getElementById("tbody-leaderboard");
  if (!tbody) return;

  try {
    const resp = await fetch("/api/leaderboard");
    if (!resp.ok) return;
    const data = await resp.json();
    const list = data.leaderboard || [];

    tbody.innerHTML = list.map(item => `
      <tr class="hover:bg-zinc-900/50">
        <td class="p-2 font-bold text-zinc-400">#${item.rank}</td>
        <td class="p-2 font-bold text-emerald-400">${escapeHtml(item.alias)}</td>
        <td class="p-2 text-zinc-200">${item.elo_rating}</td>
        <td class="p-2 text-zinc-400">${item.human_trust_score}%</td>
      </tr>
    `).join("") || '<tr><td colspan="4" class="p-3 text-center text-zinc-500">No leaderboard entries found</td></tr>';
  } catch (e) {
    console.warn("Failed to load leaderboard:", e);
  }
}
