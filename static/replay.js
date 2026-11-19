/**
 * replay.js — GhostReplayEngine for CampusGhosts Phase 3
 *
 * Clean Vanilla ES Module with ZERO build tools.
 *
 * Simulates an active 1v1 duel competitor (e.g. Phantom_42, ELO 1240) streaming code
 * into a competitor pane with realistic typing speed, jitter, pauses, and backspaces.
 */

export const DEMO_PRESETS = {
  ARRAY_BUG: `// Target: Bounded Array Sum Accumulator (C++)
#include <iostream>
#include <vector>

int sumArrayElements(const std::vector<int>& arr) {
    int total = 0;
    // INVARIANT VIOLATION: Off-by-one '<=' causes out-of-bounds access
    for (size_t i = 0; i <= arr.size(); ++i) {
        total += arr[i];
    }
    return total;
}

int main() {
    std::vector<int> numbers = {10, 20, 30, 40, 50};
    std::cout << "Sum: " << sumArrayElements(numbers) << std::endl;
    return 0;
}`,

  POINTER_BUG: `// Target: In-Place Integer Pointer Swap (C++)
#include <iostream>

void swapValues(int* a, int* b) {
    // INVARIANT VIOLATION: Dereferencing uninitialized pointer
    int* temp;
    *temp = *a;
    *a = *b;
    *b = *temp;
}

int main() {
    int x = 42, y = 99;
    swapValues(&x, &y);
    std::cout << "x=" << x << ", y=" << y << std::endl;
    return 0;
}`,

  CLEAN_SOLUTION: `// Target: Verified Optimal Memory Swap & Accumulation (C++)
#include <iostream>
#include <vector>

void safeSwap(int* a, int* b) {
    if (!a || !b) return;
    int temp = *a;
    *a = *b;
    *b = temp;
}

int safeAccumulate(const std::vector<int>& arr) {
    int total = 0;
    // Strictly bounded invariant: i < arr.size()
    for (size_t i = 0; i < arr.size(); ++i) {
        total += arr[i];
    }
    return total;
}

int main() {
    int val1 = 100, val2 = 200;
    safeSwap(&val1, &val2);
    std::vector<int> data = {1, 2, 3, 4, 5};
    std::cout << "Safe Sum: " << safeAccumulate(data) << std::endl;
    return 0;
}`,
};

export function getPresetForProblem(identifier = "") {
  const key = String(identifier).toUpperCase().trim();
  if (DEMO_PRESETS[key]) {
    return DEMO_PRESETS[key];
  }

  const lower = String(identifier).toLowerCase().trim();
  if (lower.includes("arr") || lower.includes("bound")) {
    return DEMO_PRESETS.ARRAY_BUG;
  }
  if (lower.includes("ptr") || lower.includes("swap") || lower.includes("point")) {
    return DEMO_PRESETS.POINTER_BUG;
  }
  if (lower.includes("clean") || lower.includes("opt") || lower.includes("fact")) {
    return DEMO_PRESETS.CLEAN_SOLUTION;
  }
  return DEMO_PRESETS.ARRAY_BUG;
}

export class GhostReplayEngine {
  /**
   * @param {Object} options
   * @param {HTMLElement} [options.targetEl] - Destination DOM element to stream characters into
   * @param {string} [options.rivalName] - Display name of simulated opponent (default: 'Phantom_42')
   * @param {number} [options.rivalElo] - ELO rating of opponent (default: 1240)
   * @param {Function} [options.onProgress] - (percent, currentCode) => void
   * @param {Function} [options.onComplete] - (fullCode) => void
   * @param {number} [options.baseDelayMs] - Average per-character delay in ms (default: 45)
   */
  constructor({
    targetEl = null,
    rivalName = "Phantom_42",
    rivalElo = 1240,
    onProgress = () => {},
    onComplete = () => {},
    baseDelayMs = 45,
  } = {}) {
    this.targetEl = targetEl;
    this.rivalName = rivalName;
    this.rivalElo = rivalElo;
    this.onProgress = onProgress;
    this.onComplete = onComplete;
    this.baseDelayMs = baseDelayMs;

    this.fullCode = "";
    this.currentCode = "";
    this.currentIndex = 0;
    this.progressPercent = 0;
    this.isRunning = false;
    this.timerId = null;

    this._step = this._step.bind(this);
  }

  /**
   * Start streaming code character-by-character.
   * @param {string} [problemIdOrSnippet='ARRAY_BUG'] - Preset key, problem ID, or raw code string
   */
  start(problemIdOrSnippet = "ARRAY_BUG") {
    this.stop();

    // Resolve code snippet
    if (problemIdOrSnippet in DEMO_PRESETS) {
      this.fullCode = DEMO_PRESETS[problemIdOrSnippet];
    } else if (problemIdOrSnippet.includes("\n") || problemIdOrSnippet.includes(";")) {
      this.fullCode = problemIdOrSnippet;
    } else {
      this.fullCode = getPresetForProblem(problemIdOrSnippet);
    }

    this.currentCode = "";
    this.currentIndex = 0;
    this.progressPercent = 0;
    this.isRunning = true;

    this._updateTarget();
    this.onProgress(0, "");

    // Begin async typing simulation loop
    this._scheduleNext(80);
  }

  /**
   * Stop/pause streaming.
   */
  stop() {
    this.isRunning = false;
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  /**
   * Get current completion percentage (0 - 100).
   * @returns {number}
   */
  getProgressPercent() {
    return this.progressPercent;
  }

  /**
   * Destroy engine and clear active timers.
   */
  destroy() {
    this.stop();
    this.targetEl = null;
  }

  // -------------------------------------------------------------------------
  // Internal Typing Logic
  // -------------------------------------------------------------------------
  _scheduleNext(delay) {
    if (!this.isRunning) return;
    this.timerId = setTimeout(this._step, delay);
  }

  _step() {
    if (!this.isRunning) return;

    if (this.currentIndex >= this.fullCode.length) {
      this.progressPercent = 100;
      this._updateTarget();
      this.onProgress(100, this.currentCode);
      this.isRunning = false;
      this.onComplete(this.fullCode);
      return;
    }

    // Occasional simulated typo and correction (roughly 1 in 50 characters)
    const shouldTypo =
      Math.random() < 0.02 &&
      this.currentCode.length > 8 &&
      this.fullCode[this.currentIndex] !== "\n" &&
      this.fullCode[this.currentIndex] !== " ";

    if (shouldTypo) {
      this._simulateTypo();
      return;
    }

    const char = this.fullCode[this.currentIndex];
    this.currentCode += char;
    this.currentIndex += 1;

    this.progressPercent = Math.min(
      100,
      Math.floor((this.currentIndex / this.fullCode.length) * 100)
    );

    this._updateTarget();
    this.onProgress(this.progressPercent, this.currentCode);

    // Dynamic delay for human-like rhythm
    let delay = this.baseDelayMs + Math.floor(Math.random() * 35) - 15;
    if (char === "\n") {
      delay += Math.floor(Math.random() * 220) + 120; // Reading/line-finish pause
    } else if (char === ";" || char === "{" || char === "}") {
      delay += Math.floor(Math.random() * 140) + 80;  // Statement finish pause
    } else if (char === " " && this.currentIndex > 1 && this.fullCode[this.currentIndex - 2] === " ") {
      delay = Math.max(10, Math.floor(this.baseDelayMs * 0.3)); // Fast indentation burst
    }

    this._scheduleNext(Math.max(12, delay));
  }

  _simulateTypo() {
    // 1. Insert erroneous character
    const typoKeys = "asdfghjklqwertyuiopzxcvbnm";
    const wrongChar = typoKeys[Math.floor(Math.random() * typoKeys.length)];
    this.currentCode += wrongChar;
    this._updateTarget();

    // 2. Pause, backspace, pause, resume
    this.timerId = setTimeout(() => {
      if (!this.isRunning) return;
      // Erase typo
      this.currentCode = this.currentCode.slice(0, -1);
      this._updateTarget();

      // Pause briefly after correction
      this.timerId = setTimeout(() => {
        if (!this.isRunning) return;
        this._step();
      }, Math.floor(Math.random() * 90) + 60);
    }, Math.floor(Math.random() * 120) + 80);
  }

  _updateTarget() {
    if (!this.targetEl) return;
    if ("value" in this.targetEl) {
      this.targetEl.value = this.currentCode;
    } else {
      this.targetEl.textContent = this.currentCode;
    }

    // Auto-scroll competitor pane to bottom as new lines appear
    if (this.targetEl.scrollTop !== undefined && this.targetEl.scrollHeight !== undefined) {
      this.targetEl.scrollTop = this.targetEl.scrollHeight;
    }
  }
}
