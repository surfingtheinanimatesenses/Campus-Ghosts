/**
 * replay.js — Dynamic GhostReplayEngine for CampusGhosts Phase 3 & 4
 *
 * Clean Vanilla ES Module with ZERO build tools.
 *
 * Simulates an active 1v1 duel competitor (e.g. Phantom_42, ELO 1240) streaming code
 * into the rival competitor pane with realistic typing speed, jitter, pauses, and backspaces
 * dynamically matched to the active challenge problem and selected language (C++ or Python).
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

  "arr-bound": `// Rival Submission: Bounded Array Accumulation (C++)
#include <iostream>
#include <vector>

int sumArrayElements(const std::vector<int>& arr) {
    int total = 0;
    // Verified invariant: i < arr.size()
    for (size_t i = 0; i < arr.size(); ++i) {
        total += arr[i];
    }
    return total;
}

int main() {
    std::vector<int> numbers = {10, 20, 30, 40, 50};
    std::cout << "Sum: " << sumArrayElements(numbers) << std::endl;
    return 0;
}`,

  "ptr-swap": `// Rival Submission: Safe Pointer In-Place Swap (C++)
#include <iostream>

void swapValues(int* a, int* b) {
    if (!a || !b) return;
    int temp = *a;
    *a = *b;
    *b = temp;
}

int main() {
    int x = 42, y = 99;
    swapValues(&x, &y);
    std::cout << "Swapped: " << x << ", " << y << std::endl;
    return 0;
}`,

  "loop-converge": `// Rival Submission: Collatz Sequence Step Convergence (C++)
#include <iostream>

int collatzSteps(int n) {
    int steps = 0;
    while (n > 1) {
        if (n % 2 == 0) n /= 2;
        else n = 3 * n + 1;
        steps++;
    }
    return steps;
}

int main() {
    std::cout << "Steps for 6: " << collatzSteps(6) << std::endl;
    return 0;
}`,

  "rec-fact": `// Rival Submission: Guarded Recursive Factorial (C++)
#include <iostream>

long long factorial(int n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
}

int main() {
    std::cout << "5! = " << factorial(5) << std::endl;
    return 0;
}`,

  "str-palindrome": `// Rival Submission: Two-Pointer Palindrome Verification (C++)
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
}

int main() {
    std::cout << "racecar is palindrome: " << isPalindrome("racecar") << std::endl;
    return 0;
}`,

  "custom-duel": `// Rival Submission: Optimized Binary Search (C++)
#include <iostream>
#include <vector>

int binarySearch(const std::vector<int>& arr, int target) {
    int low = 0, high = (int)arr.size() - 1;
    while (low <= high) {
        int mid = low + (high - low) / 2;
        if (arr[mid] == target) return mid;
        if (arr[mid] < target) low = mid + 1;
        else high = mid - 1;
    }
    return -1;
}`,
};

export const PYTHON_PRESETS = {
  "arr-bound": `# Rival Submission: Bounded Array Sum (Python)
def sum_array_elements(arr: list[int]) -> int:
    total = 0
    for x in arr:
        total += x
    return total

print("Sum:", sum_array_elements([10, 20, 30, 40, 50]))`,

  "ptr-swap": `# Rival Submission: In-Place Reference Swap (Python)
def swap_values(box_a: list, box_b: list) -> None:
    if box_a and box_b and len(box_a) > 0 and len(box_b) > 0:
        box_a[0], box_b[0] = box_b[0], box_a[0]

a, b = [42], [99]
swap_values(a, b)
print("Swapped:", a[0], b[0])`,

  "loop-converge": `# Rival Submission: Collatz Convergence (Python)
def collatz_steps(n: int) -> int:
    steps = 0
    while n > 1:
        if n % 2 == 0:
            n = n // 2
        else:
            n = 3 * n + 1
        steps += 1
    return steps

print("Steps for 6:", collatz_steps(6))`,

  "rec-fact": `# Rival Submission: Guarded Recursion (Python)
def factorial(n: int) -> int:
    if n <= 1:
        return 1
    return n * factorial(n - 1)

print("5! =", factorial(5))`,

  "str-palindrome": `# Rival Submission: Two-Pointer Palindrome (Python)
def is_palindrome(s: str) -> bool:
    if not s:
        return True
    left, right = 0, len(s) - 1
    while left < right:
        if s[left] != s[right]:
            return False
        left += 1
        right -= 1
    return True

print("racecar is palindrome:", is_palindrome("racecar"))`,

  "custom-duel": `# Rival Submission: Binary Search (Python)
def binary_search(arr: list[int], target: int) -> int:
    low, high = 0, len(arr) - 1
    while low <= high:
        mid = (low + high) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            low = mid + 1
        else:
            high = mid - 1
    return -1`,
};

export function getPresetForProblem(identifier = "", language = "cpp") {
  const raw = String(identifier).trim();
  const lower = raw.toLowerCase();
  const isPy = String(language).toLowerCase() === "python";
  const pool = isPy ? PYTHON_PRESETS : DEMO_PRESETS;

  if (pool[raw]) return pool[raw];
  if (pool[lower]) return pool[lower];

  if (lower.includes("arr") || lower.includes("bound")) return pool["arr-bound"] || DEMO_PRESETS["arr-bound"];
  if (lower.includes("ptr") || lower.includes("swap") || lower.includes("point")) return pool["ptr-swap"] || DEMO_PRESETS["ptr-swap"];
  if (lower.includes("loop") || lower.includes("collatz") || lower.includes("converge")) return pool["loop-converge"] || DEMO_PRESETS["loop-converge"];
  if (lower.includes("rec") || lower.includes("fact")) return pool["rec-fact"] || DEMO_PRESETS["rec-fact"];
  if (lower.includes("palin") || lower.includes("str")) return pool["str-palindrome"] || DEMO_PRESETS["str-palindrome"];
  if (lower.includes("clean") || lower.includes("opt")) return DEMO_PRESETS.CLEAN_SOLUTION;

  return pool["arr-bound"] || DEMO_PRESETS["arr-bound"];
}

const RIVAL_NAMES = ["Phantom_42", "Specter_19", "Wraith_07", "Cipher_66", "Nexus_88"];

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
   * Configure an authentic matched rival from backend matchmake payload.
   * @param {Object} config
   * @param {string} config.name - Real alias (e.g. 'Cipher_14')
   * @param {number} config.elo - Real ELO rating (e.g. 1225)
   * @param {number} [config.targetTimeSec] - Estimated finish time in seconds
   * @param {number} [config.cps] - Typing speed in characters per second
   */
  configureRival({ name, elo, targetTimeSec, cps } = {}) {
    if (name) this.rivalName = name;
    if (elo) this.rivalElo = elo;

    if (cps && cps > 0) {
      this.baseDelayMs = Math.max(16, Math.min(75, Math.round(1000 / cps)));
    } else if (targetTimeSec && targetTimeSec > 0) {
      const codeLen = this.fullCode ? this.fullCode.length : 350;
      this.baseDelayMs = Math.max(16, Math.min(75, Math.round((targetTimeSec * 1000) / codeLen)));
    } else {
      // ELO-scaled fallback: higher ELO types faster
      const scaledElo = Math.max(1000, Math.min(1600, this.rivalElo || 1200));
      this.baseDelayMs = Math.round(65 - ((scaledElo - 1000) / 600) * 35);
    }

    return { name: this.rivalName, elo: this.rivalElo, baseDelayMs: this.baseDelayMs };
  }

  /**
   * Randomize rival persona for fresh 1v1 encounter.
   */
  randomizeRival() {
    this.rivalName = RIVAL_NAMES[Math.floor(Math.random() * RIVAL_NAMES.length)];
    this.rivalElo = 1180 + Math.floor(Math.random() * 120);
    return { name: this.rivalName, elo: this.rivalElo };
  }

  /**
   * Start streaming code character-by-character.
   * @param {string} [problemIdOrSnippet='arr-bound'] - Preset key, problem ID, or raw code string
   * @param {string} [language='cpp'] - 'cpp' or 'python'
   */
  start(problemIdOrSnippet = "arr-bound", language = "cpp") {
    this.stop();

    if (problemIdOrSnippet.includes("\n") || problemIdOrSnippet.includes(";")) {
      this.fullCode = problemIdOrSnippet;
    } else {
      this.fullCode = getPresetForProblem(problemIdOrSnippet, language);
    }

    this.currentCode = "";
    this.currentIndex = 0;
    this.progressPercent = 0;
    this.isRunning = true;
    this.startTime = Date.now();
    this.completionTimeMs = null;

    this._updateTarget();
    this.onProgress(0, "");
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
   * Check if rival has finished writing code.
   * @returns {boolean}
   */
  isFinished() {
    return this.progressPercent >= 100 || (this.completionTimeMs !== null && !this.isRunning);
  }

  /**
   * Get completion duration in seconds, or current elapsed if not finished.
   * @returns {number}
   */
  getElapsedSec() {
    if (this.completionTimeMs !== null) return this.completionTimeMs / 1000;
    if (this.startTime) return (Date.now() - this.startTime) / 1000;
    return 0;
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
      this.completionTimeMs = this.startTime ? (Date.now() - this.startTime) : null;
      this.onComplete(this.fullCode, this.completionTimeMs);
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
      delay += Math.floor(Math.random() * 220) + 120;
    } else if (char === ";" || char === "{" || char === "}" || char === ":") {
      delay += Math.floor(Math.random() * 140) + 80;
    } else if (char === " " && this.currentIndex > 1 && this.fullCode[this.currentIndex - 2] === " ") {
      delay = Math.max(10, Math.floor(this.baseDelayMs * 0.3));
    }

    this._scheduleNext(Math.max(12, delay));
  }

  _simulateTypo() {
    const typoKeys = "asdfghjklqwertyuiopzxcvbnm";
    const wrongChar = typoKeys[Math.floor(Math.random() * typoKeys.length)];
    this.currentCode += wrongChar;
    this._updateTarget();

    this.timerId = setTimeout(() => {
      if (!this.isRunning) return;
      this.currentCode = this.currentCode.slice(0, -1);
      this._updateTarget();

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

    if (this.targetEl.scrollTop !== undefined && this.targetEl.scrollHeight !== undefined) {
      this.targetEl.scrollTop = this.targetEl.scrollHeight;
    }
  }
}
