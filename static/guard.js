/**
 * guard.js — AntiCheatGuard Module for CampusGhosts Phase 3
 *
 * Clean Vanilla ES Module with ZERO build tools.
 *
 * Features:
 * 1. Armed State: Tab/fullscreen strikes only count during an active duel (startDuel/stopDuel).
 * 2. Paste & Drop Blocker: Intercepts paste, drag-drop, and Ctrl+V / Cmd+V shortcuts.
 * 3. 3-Strike Tab & Fullscreen Monitor: Debounced at 800ms across blur, visibilitychange, and fullscreenchange.
 * 4. Human vs. Bot Telemetry: Tracks angular cursor direction changes, velocity variance, and keystroke flight-time std dev.
 * 5. Lifecycle Management: destroy() unbinds all listeners to eliminate memory leaks.
 */

export class AntiCheatGuard {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.editorEl - The code editor textarea or element
   * @param {Function} [options.onStrike] - Called on strikes 1 and 2: (count, reason) => void
   * @param {Function} [options.onDisqualify] - Called on strike 3: (reason) => void
   * @param {Function} [options.onTrustUpdate] - Called when trust changes: (score, metrics) => void
   * @param {Function} [options.onPasteBlocked] - Called when paste/drop is intercepted: (info) => void
   */
  constructor({
    editorEl,
    onStrike = () => {},
    onDisqualify = () => {},
    onTrustUpdate = () => {},
    onPasteBlocked = () => {},
  }) {
    this.editorEl = editorEl;
    this.onStrike = onStrike;
    this.onDisqualify = onDisqualify;
    this.onTrustUpdate = onTrustUpdate;
    this.onPasteBlocked = onPasteBlocked;

    // Armed state & strikes
    this.isArmed = false;
    this.strikes = 0;
    this.maxStrikes = 3;
    this.lastStrikeTime = 0;
    this.strikeDebounceMs = 800;

    // Human vs. Bot Telemetry State
    this.humanTrustScore = 100.0;
    this.blockedPasteAttempts = 0;

    // Mouse movement metrics
    this.mouseHistory = [];
    this.maxMouseHistory = 40;
    this.lastMousePos = null;
    this.lastMouseTime = 0;
    this.angularDirectionChanges = 0;
    this.velocitySamples = [];
    this.lastAngle = null;

    // Keystroke flight time metrics
    this.lastKeyTime = 0;
    this.flightTimes = [];
    this.maxFlightHistory = 25;
    this.totalKeystrokes = 0;

    // Bind event handlers for listener cleanup
    this._handlePaste = this._handlePaste.bind(this);
    this._handleDrop = this._handleDrop.bind(this);
    this._handleEditorKeyDown = this._handleEditorKeyDown.bind(this);
    this._handleVisibilityChange = this._handleVisibilityChange.bind(this);
    this._handleWindowBlur = this._handleWindowBlur.bind(this);
    this._handleFullscreenChange = this._handleFullscreenChange.bind(this);
    this._handleMouseMove = this._handleMouseMove.bind(this);
    this._handleGlobalKeyDown = this._handleGlobalKeyDown.bind(this);

    this._bindListeners();
  }

  // -------------------------------------------------------------------------
  // Armed State Controls
  // -------------------------------------------------------------------------

  /**
   * Arm the guard. Tab switches and window blur will now increment strikes.
   */
  startDuel() {
    this.isArmed = true;
    this.resetStrikes();
  }

  /** Alias for startDuel */
  arm() {
    this.startDuel();
  }

  /**
   * Disarm the guard. Pauses strike accumulation.
   */
  stopDuel() {
    this.isArmed = false;
  }

  /** Alias for stopDuel */
  disarm() {
    this.stopDuel();
  }

  /**
   * Reset strike count for live rehearsals and recalculate trust.
   */
  resetStrikes() {
    this.strikes = 0;
    this.lastStrikeTime = 0;
    this.blockedPasteAttempts = 0;
    this._recomputeTrustScore();
  }

  // -------------------------------------------------------------------------
  // Event Binding & Lifecycle Cleanup
  // -------------------------------------------------------------------------
  _bindListeners() {
    if (this.editorEl) {
      this.editorEl.addEventListener("paste", this._handlePaste, true);
      this.editorEl.addEventListener("drop", this._handleDrop, true);
      this.editorEl.addEventListener("keydown", this._handleEditorKeyDown, true);
    }

    if (typeof window !== "undefined") {
      window.addEventListener("blur", this._handleWindowBlur);
      window.addEventListener("mousemove", this._handleMouseMove, { passive: true });
      window.addEventListener("keydown", this._handleGlobalKeyDown, { passive: true });
    }

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this._handleVisibilityChange);
      document.addEventListener("fullscreenchange", this._handleFullscreenChange);
    }
  }

  /**
   * Remove all event listeners to eliminate memory leaks.
   */
  destroy() {
    this.stopDuel();

    if (this.editorEl) {
      this.editorEl.removeEventListener("paste", this._handlePaste, true);
      this.editorEl.removeEventListener("drop", this._handleDrop, true);
      this.editorEl.removeEventListener("keydown", this._handleEditorKeyDown, true);
    }

    if (typeof window !== "undefined") {
      window.removeEventListener("blur", this._handleWindowBlur);
      window.removeEventListener("mousemove", this._handleMouseMove);
      window.removeEventListener("keydown", this._handleGlobalKeyDown);
    }

    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this._handleVisibilityChange);
      document.removeEventListener("fullscreenchange", this._handleFullscreenChange);
    }

    this.editorEl = null;
  }

  // -------------------------------------------------------------------------
  // Paste & Drop Protection
  // -------------------------------------------------------------------------
  _handlePaste(e) {
    if (e) e.preventDefault();
    this._triggerPasteBlocked("paste_clipboard");
  }

  _handleDrop(e) {
    if (e) e.preventDefault();
    this._triggerPasteBlocked("drag_drop");
  }

  _handleEditorKeyDown(e) {
    // Intercept Ctrl+V or Cmd+V
    if ((e.ctrlKey || e.metaKey) && (e.key === "v" || e.key === "V" || e.code === "KeyV")) {
      e.preventDefault();
      this._triggerPasteBlocked("shortcut_ctrl_v");
    }
  }

  _triggerPasteBlocked(source) {
    this.blockedPasteAttempts += 1;
    this.onPasteBlocked({
      source,
      timestamp: Date.now(),
      totalBlocked: this.blockedPasteAttempts,
    });
    this._recomputeTrustScore();
  }

  // -------------------------------------------------------------------------
  // 3-Strike Tab & Fullscreen Monitor (800ms Debounce)
  // -------------------------------------------------------------------------
  _registerStrike(reason) {
    if (!this.isArmed) return;

    const now = Date.now();
    // Debounce duplicate blur + visibilitychange events within 800ms
    if (now - this.lastStrikeTime < this.strikeDebounceMs) {
      return;
    }

    this.lastStrikeTime = now;
    this.strikes += 1;

    if (this.strikes < this.maxStrikes) {
      this.onStrike(this.strikes, reason);
    } else {
      this.isArmed = false; // Disarm on strike 3
      this.onDisqualify(reason);
    }

    this._recomputeTrustScore();
  }

  _handleVisibilityChange() {
    if (document.hidden && this.isArmed) {
      this._registerStrike("Tab switch or browser minimized");
    }
  }

  _handleWindowBlur() {
    if (this.isArmed) {
      this._registerStrike("Window focus lost (Alt-Tab or split-screen)");
    }
  }

  _handleFullscreenChange() {
    if (this.isArmed && !document.fullscreenElement) {
      this._registerStrike("Exited fullscreen examination mode");
    }
  }

  // -------------------------------------------------------------------------
  // Human vs. Bot Telemetry
  // -------------------------------------------------------------------------
  _handleMouseMove(e) {
    const now = performance.now();
    const x = e.clientX;
    const y = e.clientY;

    if (this.lastMousePos) {
      const dx = x - this.lastMousePos.x;
      const dy = y - this.lastMousePos.y;
      const dt = now - this.lastMouseTime;
      const dist = Math.hypot(dx, dy);

      if (dist > 1 && dt > 0) {
        // 1. Velocity Tracking
        const velocity = dist / dt;
        this.velocitySamples.push(velocity);
        if (this.velocitySamples.length > this.maxMouseHistory) {
          this.velocitySamples.shift();
        }

        // 2. Angular Direction Tracking
        const angle = Math.atan2(dy, dx);
        if (this.lastAngle !== null) {
          let diff = Math.abs(angle - this.lastAngle);
          if (diff > Math.PI) diff = 2 * Math.PI - diff;
          // Angular change threshold (curved human path vs linear bot glide)
          if (diff > 0.25) {
            this.angularDirectionChanges += 1;
          }
        }
        this.lastAngle = angle;
      }
    }

    this.lastMousePos = { x, y };
    this.lastMouseTime = now;
    this.mouseHistory.push({ x, y, t: now });
    if (this.mouseHistory.length > this.maxMouseHistory) {
      this.mouseHistory.shift();
    }

    // Periodically recompute trust score on mouse movement
    if (this.mouseHistory.length % 8 === 0) {
      this._recomputeTrustScore();
    }
  }

  _handleGlobalKeyDown(e) {
    const now = performance.now();
    this.totalKeystrokes += 1;

    if (this.lastKeyTime > 0) {
      const flightTime = now - this.lastKeyTime;
      // Filter out long idle reading pauses (> 2500ms)
      if (flightTime < 2500) {
        this.flightTimes.push(flightTime);
        if (this.flightTimes.length > this.maxFlightHistory) {
          this.flightTimes.shift();
        }
      }
    }

    this.lastKeyTime = now;

    // Periodically recompute trust score on typing
    if (this.totalKeystrokes % 5 === 0) {
      this._recomputeTrustScore();
    }
  }

  // -------------------------------------------------------------------------
  // Trust Score Computation
  // -------------------------------------------------------------------------
  _computeFlightStdDev() {
    if (this.flightTimes.length < 5) return 40.0; // Assume human prior initially
    const mean = this.flightTimes.reduce((acc, v) => acc + v, 0) / this.flightTimes.length;
    const variance =
      this.flightTimes.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) /
      this.flightTimes.length;
    return Math.sqrt(variance);
  }

  _computeVelocityVariance() {
    if (this.velocitySamples.length < 5) return 0.2;
    const mean = this.velocitySamples.reduce((acc, v) => acc + v, 0) / this.velocitySamples.length;
    const variance =
      this.velocitySamples.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) /
      this.velocitySamples.length;
    return Math.sqrt(variance);
  }

  _recomputeTrustScore() {
    let score = 100.0;

    // 1. Penalty for blocked paste attempts (-18 points each)
    score -= this.blockedPasteAttempts * 18.0;

    // 2. Penalty for tab/focus strikes (-15 points per strike)
    score -= this.strikes * 15.0;

    // 3. Keystroke flight-time analysis (Bot typing check)
    const stdDev = this._computeFlightStdDev();
    if (this.flightTimes.length >= 8) {
      // Bots type with unnatural constant time intervals (std dev < 15ms)
      if (stdDev < 10.0) {
        score -= 30.0; // Severe robotic typing penalty
      } else if (stdDev < 18.0) {
        score -= 15.0; // Moderate robotic typing penalty
      }
    }

    // 4. Mouse movement check (Headless bot check)
    const velVariance = this._computeVelocityVariance();
    if (this.totalKeystrokes > 20 && this.mouseHistory.length < 3) {
      // Typing extensive code with zero cursor movements
      score -= 20.0;
    } else if (this.velocitySamples.length >= 10 && velVariance < 0.02) {
      // Synthetic linear mouse glide without natural velocity variance
      score -= 15.0;
    }

    // Clamp score to [0.0, 100.0]
    this.humanTrustScore = Math.max(0.0, Math.min(100.0, Math.round(score * 10) / 10));

    const metrics = {
      humanTrustScore: this.humanTrustScore,
      strikes: this.strikes,
      blockedPasteAttempts: this.blockedPasteAttempts,
      totalKeystrokes: this.totalKeystrokes,
      flightTimeStdDev: Math.round(stdDev * 10) / 10,
      velocityVariance: Math.round(velVariance * 1000) / 1000,
      angularDirectionChanges: this.angularDirectionChanges,
      mouseMovementsRecorded: this.mouseHistory.length,
      isArmed: this.isArmed,
    };

    this.onTrustUpdate(this.humanTrustScore, metrics);
  }

  /**
   * Get current live trust score and telemetry metrics.
   */
  getMetrics() {
    return {
      humanTrustScore: this.humanTrustScore,
      strikes: this.strikes,
      blockedPasteAttempts: this.blockedPasteAttempts,
      totalKeystrokes: this.totalKeystrokes,
      isArmed: this.isArmed,
    };
  }
}
