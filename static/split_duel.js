/**
 * split_duel.js — ES Module Controller for CampusGhosts 1v1 Split-Screen Ghost Arena
 *
 * Coordinates:
 * 1. AntiCheatGuard & keystroke flight/velocity bot tracking
 * 2. GhostReplayEngine & competitor Phantom_42 stream
 * 3. Dynamic Chart.js k-anonymity heatmap with live safe/raw audit mode
 * 4. Zero-knowledge commitment auth, live duel submission, schema inspector & placement claim verification
 */

import { AntiCheatGuard } from "./guard.js";
import { GhostReplayEngine, DEMO_PRESETS, getPresetForProblem } from "./replay.js";

// Global Application State for Split Arena
const state = {
  currentGhost: null,
  telemetryMode: "safe",
  isDuelActive: false,
  activeProblemId: "arr-bound",
  heatmapChart: null,
  guard: null,
  replay: null,
  initialized: false,
};

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

function initGuardAndReplay() {
  const studentEditor = document.getElementById("editor-student");
  const competitorEditor = document.getElementById("editor-competitor");

  if (studentEditor && !studentEditor.value.trim()) {
    studentEditor.value = DEMO_PRESETS.ARRAY_BUG;
  }

  if (!state.guard && studentEditor) {
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
        showToast("PASTE BLOCKED: External clipboard paste intercepted! (-18 trust score)", "error");
      },
    });
  }

  if (!state.replay && competitorEditor) {
    state.replay = new GhostReplayEngine({
      targetEl: competitorEditor,
      rivalName: "Phantom_42",
      rivalElo: 1240,
      baseDelayMs: 40,
      onProgress: (percent) => {
        const progressLabel = document.getElementById("replay-progress-label");
        if (progressLabel) progressLabel.textContent = `${percent}%`;
      },
      onComplete: () => {
        const progressLabel = document.getElementById("replay-progress-label");
        if (progressLabel) progressLabel.textContent = "100% (Finished)";
        showToast("Rival Phantom_42 has finished writing code!", "info");
      },
    });
  }

  const resetBtn = document.getElementById("btn-reset-strikes");
  if (resetBtn) {
    resetBtn.onclick = () => {
      if (state.guard) {
        state.guard.resetStrikes();
        const strikesEl = document.getElementById("pill-strikes");
        if (strikesEl) {
          strikesEl.textContent = "0/3";
          strikesEl.className = "text-amber-400 font-bold";
        }
        showToast("Strikes reset to 0/3 for live stage rehearsal.", "success");
      }
    };
  }
}

function initDuelControls() {
  const startDuelBtn = document.getElementById("btn-start-duel");
  if (!startDuelBtn) return;

  startDuelBtn.onclick = () => {
    if (!state.currentGhost) {
      showToast("Please enter as Ghost first using the Top Bar!", "warning");
      return;
    }
    if (!state.isDuelActive) {
      startDuelSession();
    } else {
      stopDuelSession();
    }
  };
}

function startDuelSession() {
  state.isDuelActive = true;
  if (state.guard) state.guard.startDuel();
  if (state.replay) state.replay.start(state.activeProblemId || "ARRAY_BUG");

  const startDuelBtn = document.getElementById("btn-start-duel");
  const labelEl = document.getElementById("btn-start-duel-label");
  if (startDuelBtn && labelEl) {
    startDuelBtn.className = "bg-rose-600 hover:bg-rose-500 text-zinc-950 font-bold px-2.5 py-1 rounded text-[11px] font-mono transition-colors flex items-center gap-1 cursor-pointer";
    labelEl.textContent = "Stop Duel (Active)";
  }
  showToast("1v1 Duel started! AntiCheatGuard armed (tab/fullscreen tracking active).", "success");
}

function stopDuelSession() {
  state.isDuelActive = false;
  if (state.guard) state.guard.stopDuel();
  if (state.replay) state.replay.stop();

  const startDuelBtn = document.getElementById("btn-start-duel");
  const labelEl = document.getElementById("btn-start-duel-label");
  if (startDuelBtn && labelEl) {
    startDuelBtn.className = "bg-cyan-600 hover:bg-cyan-500 text-zinc-950 font-bold px-2.5 py-1 rounded text-[11px] font-mono transition-colors flex items-center gap-1 cursor-pointer";
    labelEl.textContent = "Start 1v1 Duel";
  }
  showToast("1v1 Duel disarmed. Strikes paused.", "info");
}

function initPresets() {
  const editor = document.getElementById("editor-student");
  const problemLabel = document.getElementById("diag-problem-label");

  const btnArray = document.getElementById("btn-preset-array");
  const btnPointer = document.getElementById("btn-preset-pointer");
  const btnClean = document.getElementById("btn-preset-clean");

  if (btnArray) {
    btnArray.onclick = () => {
      state.activeProblemId = "arr-bound";
      if (editor) editor.value = DEMO_PRESETS.ARRAY_BUG;
      if (problemLabel) problemLabel.textContent = "arr-bound (Bounds Verification)";
      showToast("Loaded Buggy Array code (Off-by-one '<=' unmasks k=4 to 5 on submit).", "warning");
    };
  }
  if (btnPointer) {
    btnPointer.onclick = () => {
      state.activeProblemId = "ptr-swap";
      if (editor) editor.value = DEMO_PRESETS.POINTER_BUG;
      if (problemLabel) problemLabel.textContent = "ptr-swap (Pointer Invariant)";
      showToast("Loaded Null Pointer Dereference bug.", "warning");
    };
  }
  if (btnClean) {
    btnClean.onclick = () => {
      state.activeProblemId = "clean-opt";
      if (editor) editor.value = DEMO_PRESETS.CLEAN_SOLUTION;
      if (problemLabel) problemLabel.textContent = "clean-opt (Optimal Verified Solution)";
      showToast("Loaded Clean Optimal Solution.", "success");
    };
  }
}

function initAuthCommit() {
  const btnCommit = document.getElementById("btn-auth-commit");
  const btnGenSalt = document.getElementById("btn-gen-salt");
  const inputRoll = document.getElementById("input-roll-no");
  const inputSalt = document.getElementById("input-secret-salt");

  if (btnGenSalt && inputSalt) {
    btnGenSalt.onclick = () => {
      const arr = new Uint8Array(16);
      window.crypto.getRandomValues(arr);
      const hex = Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
      inputSalt.value = `krmu_${hex}`;
      showToast("Generated cryptographic 128-bit private salt.", "info");
    };
  }

  if (btnCommit) {
    btnCommit.onclick = async () => {
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

        const aliasEl = document.getElementById("pill-ghost-alias");
        const eloEl = document.getElementById("pill-elo");
        const trustEl = document.getElementById("pill-trust");

        if (aliasEl) aliasEl.textContent = data.alias;
        if (eloEl) eloEl.textContent = String(data.elo_rating);
        if (trustEl) trustEl.textContent = `${data.human_trust_score}%`;

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
    };
  }
}

function initCodeSubmit() {
  const submitBtn = document.getElementById("btn-submit-code");
  const editor = document.getElementById("editor-student");
  const selectLang = document.getElementById("select-language");

  if (!submitBtn) return;

  submitBtn.onclick = async () => {
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

      const payload = {
        commitment_hash: state.currentGhost.commitment_hash,
        code: code,
        language: lang,
        problem_id: state.activeProblemId || "arr-bound",
        human_trust_score: state.guard ? state.guard.humanTrustScore : 100.0,
        opponent_elo: 1200,
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

      if (hintText) {
        hintText.textContent = diag.socratic_hint || (passed ? "All assertions passed and memory constraints satisfied." : "Invariant violation detected.");
      }

      state.currentGhost.elo_rating = result.new_elo;
      const eloEl = document.getElementById("pill-elo");
      if (eloEl) eloEl.textContent = String(result.new_elo);

      await loadHeatmapData();

      if (passed) {
        showToast(`Verification Successful! Passed duel (+${delta} ELO).`, "success");
      } else {
        showToast(`Assertions Failed: ${diag.concept_tag} (${delta} ELO). Heatmap updated.`, "error");
      }
    } catch (err) {
      showToast(`Submission error: ${err.message}`, "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Code";
    }
  };
}

function initTabs() {
  const tabs = document.querySelectorAll(".tab-btn");
  tabs.forEach(tab => {
    tab.onclick = () => {
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
    };
  });
}

function initHeatmap() {
  const toggleBtn = document.getElementById("btn-toggle-telemetry-mode");
  const refreshBtn = document.getElementById("btn-refresh-heatmap");
  const remedialBtn = document.getElementById("btn-remedial-plan");
  const closeRemedialBtn = document.getElementById("btn-close-remedial");

  if (toggleBtn) {
    toggleBtn.onclick = () => {
      state.telemetryMode = state.telemetryMode === "safe" ? "raw" : "safe";
      const descEl = document.getElementById("telemetry-mode-desc");

      if (state.telemetryMode === "safe") {
        toggleBtn.textContent = "Safe View (k \u2265 5 Masked)";
        toggleBtn.className = "bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold px-2.5 py-1 rounded text-xs font-mono transition-colors cursor-pointer";
        if (descEl) descEl.textContent = "Clusters < 5 ghosts are mathematically masked";
      } else {
        toggleBtn.textContent = "Raw DB Audit Mode";
        toggleBtn.className = "bg-rose-600 hover:bg-rose-500 text-zinc-950 font-bold px-2.5 py-1 rounded text-xs font-mono transition-colors cursor-pointer";
        if (descEl) descEl.textContent = "Exposes raw failure counts for institutional audit";
      }
      loadHeatmapData();
    };
  }

  if (refreshBtn) {
    refreshBtn.onclick = () => {
      loadHeatmapData();
      showToast("Heatmap telemetry refreshed.", "info");
    };
  }

  if (remedialBtn) {
    remedialBtn.onclick = async () => {
      await loadRemedialPlan("ARRAY_OUT_OF_BOUNDS");
    };
  }

  if (closeRemedialBtn) {
    closeRemedialBtn.onclick = () => {
      document.getElementById("card-remedial")?.classList.add("hidden");
    };
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
    return "rgba(16, 185, 129, 0.8)";
  });

  const borderColors = clusters.map(c => {
    if (c.masked) return "rgba(161, 161, 170, 0.8)";
    if (c.concept_tag === "ARRAY_OUT_OF_BOUNDS") return "#F59E0B";
    if (c.concept_tag === "POINTER_DEREF_NULL") return "#F43F5E";
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
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const cluster = clusters[ctx.dataIndex];
              if (cluster && cluster.masked) {
                return " Privacy Status: MASKED (k < 5 ghosts)";
              }
              return ` Distinct Ghosts: ${cluster.count}`;
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

function initSchemaInspector() {
  const refreshBtn = document.getElementById("btn-refresh-inspector");
  if (refreshBtn) {
    refreshBtn.onclick = () => {
      loadSchemaInspect();
      showToast("Schema inspection refreshed.", "info");
    };
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
  } catch (e) {
    console.warn("Failed to load schema inspect:", e);
  }
}

function initPlacementClaim() {
  const verifyBtn = document.getElementById("btn-verify-claim");
  const rollInput = document.getElementById("claim-roll-no");
  const saltInput = document.getElementById("claim-secret-salt");
  const resultBox = document.getElementById("claim-result-box");

  if (verifyBtn) {
    verifyBtn.onclick = async () => {
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
              <div class="flex items-center gap-2">
                <input id="input-signed-hash" type="text" readonly value="${escapeHtml(res.signed_proof_hash)}" class="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[10px] text-zinc-300 flex-1 outline-none font-mono" />
                <button id="btn-copy-signed-hash" class="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-2 py-1 rounded text-[10px] cursor-pointer">Copy</button>
              </div>
            </div>
          `;

          const copyBtn = document.getElementById("btn-copy-signed-hash");
          const hashInput = document.getElementById("input-signed-hash");
          if (copyBtn && hashInput) {
            copyBtn.onclick = () => {
              navigator.clipboard.writeText(hashInput.value);
              copyBtn.textContent = "Copied!";
              setTimeout(() => { copyBtn.textContent = "Copy"; }, 2000);
            };
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
    };
  }
}

async function loadLeaderboard() {
  const tbody = document.getElementById("tbody-split-leaderboard");
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

function initAll() {
  if (state.initialized) return;
  initGuardAndReplay();
  initTabs();
  initAuthCommit();
  initDuelControls();
  initPresets();
  initCodeSubmit();
  initHeatmap();
  initSchemaInspector();
  initPlacementClaim();
  loadHeatmapData();
  loadLeaderboard();
  state.initialized = true;
}

export const SplitDuel = {
  launch: () => {
    document.getElementById("view-login-gate")?.classList.add("hidden");
    document.getElementById("view-app-shell")?.classList.add("hidden");
    const arena = document.getElementById("view-split-arena");
    if (arena) {
      arena.classList.remove("hidden");
      initAll();
      if (window.lucide) window.lucide.createIcons();
    }
  },
  close: () => {
    document.getElementById("view-split-arena")?.classList.add("hidden");
    document.getElementById("view-app-shell")?.classList.add("hidden");
    document.getElementById("view-login-gate")?.classList.remove("hidden");
    if (state.guard) state.guard.stopDuel();
    if (state.replay) state.replay.stop();
    const startDuelBtn = document.getElementById("btn-start-duel");
    const labelEl = document.getElementById("btn-start-duel-label");
    if (startDuelBtn && labelEl) {
      startDuelBtn.className = "bg-cyan-600 hover:bg-cyan-500 text-zinc-950 font-bold px-2.5 py-1 rounded text-[11px] font-mono transition-colors flex items-center gap-1 cursor-pointer";
      labelEl.textContent = "Start 1v1 Duel";
    }
    state.isDuelActive = false;
    if (window.lucide) window.lucide.createIcons();
  },
  state,
};

window.SplitDuel = SplitDuel;
window.addEventListener("DOMContentLoaded", () => {
  // If arena container is present, prepare components
  if (document.getElementById("view-split-arena")) {
    initAll();
  }
});
