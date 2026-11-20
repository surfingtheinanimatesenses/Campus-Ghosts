/**
 * guard.js — Production AntiCheatGuard Module for CampusGhosts
 *
 * Features:
 * 1. Mandatory Fullscreen: Enforces full browser canvas during duels.
 * 2. Instant Focus-Loss Lockout: Blur, tab switch, or leaving window instantly locks the editor with countdown overlay.
 * 3. 3-Strike Proctoring: Strikes 1 & 2 trigger timed editor freezes; Strike 3 triggers instant disqualification and ELO deduction.
 * 4. Paste & Drop Blocker: Intercepts clipboard paste, drag-and-drop, and Ctrl+V / Cmd+V shortcuts.
 * 5. DevTools & Context Lock: Blocks right-click context menu, F12, Ctrl+Shift+I, and View Source shortcuts.
 * 6. Keystroke & Mouse Bot Telemetry: Tracks angular velocity variance and flight-time std dev.
 */

export class AntiCheatGuard {
  constructor({
    editorEl,
    onStrike = () => {},
    onDisqualify = () => {},
    onTrustUpdate = () => {},
    onPasteBlocked = () => {},
    onLockout = () => {},
  }) {
    this.editorEl = editorEl;
    this.onStrike = onStrike;
    this.onDisqualify = onDisqualify;
    this.onTrustUpdate = onTrustUpdate;
    this.onPasteBlocked = onPasteBlocked;
    this.onLockout = onLockout;

    // Armed state & strikes
    this.isArmed = false;
    this.isLocked = false;
    this.lockoutTimer = null;
    this.strikes = 0;
    this.maxStrikes = 3;
    this.lastStrikeTime = 0;
    this.strikeDebounceMs = 900;

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

    // Bind event handlers
    this._handlePaste = this._handlePaste.bind(this);
    this._handleDrop = this._handleDrop.bind(this);
    this._handleEditorKeyDown = this._handleEditorKeyDown.bind(this);
    this._handleVisibilityChange = this._handleVisibilityChange.bind(this);
    this._handleWindowBlur = this._handleWindowBlur.bind(this);
    this._handleFullscreenChange = this._handleFullscreenChange.bind(this);
    this._handleMouseMove = this._handleMouseMove.bind(this);
    this._handleGlobalKeyDown = this._handleGlobalKeyDown.bind(this);
    this._handleContextMenu = this._handleContextMenu.bind(this);

    this._bindListeners();
  }

  // -------------------------------------------------------------------------
  // Armed State & Fullscreen Controls
  // -------------------------------------------------------------------------
  async startDuel(requireFullscreen = true) {
    this.isArmed = true;
    this.resetStrikes();

    if (requireFullscreen && typeof document !== "undefined" && !document.fullscreenElement) {
      try {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        }
      } catch (err) {
        console.warn("Fullscreen auto-request rejected or unsupported:", err);
      }
    }
  }

  stopDuel() {
    this.isArmed = false;
    this.unlockEditor();
    if (this.lockoutTimer) {
      clearInterval(this.lockoutTimer);
      this.lockoutTimer = null;
    }
  }

  resetStrikes() {
    this.strikes = 0;
    this.lastStrikeTime = 0;
    this.blockedPasteAttempts = 0;
    this.unlockEditor();
    this._recomputeTrustScore();
  }

  // -------------------------------------------------------------------------
  // Editor Lockout Overlay Management
  // -------------------------------------------------------------------------
  lockEditor(seconds = 4, reason = "Window focus lost") {
    if (!this.editorEl) return;
    this.isLocked = true;
    this.editorEl.setAttribute("readonly", "true");
    this.editorEl.classList.add("opacity-40", "pointer-events-none", "filter", "blur-[1px]");

    let timeLeft = seconds;
    this.onLockout(this.strikes, reason, timeLeft);

    if (this.lockoutTimer) clearInterval(this.lockoutTimer);
    this.lockoutTimer = setInterval(() => {
      timeLeft -= 1;
      if (timeLeft <= 0) {
        clearInterval(this.lockoutTimer);
        this.lockoutTimer = null;
        this.unlockEditor();
        this.onLockout(this.strikes, reason, 0);
      } else {
        this.onLockout(this.strikes, reason, timeLeft);
      }
    }, 1000);
  }

  unlockEditor() {
    this.isLocked = false;
    if (this.editorEl) {
      this.editorEl.removeAttribute("readonly");
      this.editorEl.classList.remove("opacity-40", "pointer-events-none", "filter", "blur-[1px]");
    }
  }

  // -------------------------------------------------------------------------
  // Event Binding & Lifecycle Cleanup
  // -------------------------------------------------------------------------
  _bindListeners() {
    if (this.editorEl) {
      this.editorEl.addEventListener("paste", this._handlePaste, true);
      this.editorEl.addEventListener("drop", this._handleDrop, true);
      this.editorEl.addEventListener("keydown", this._handleEditorKeyDown, true);
      this.editorEl.addEventListener("contextmenu", this._handleContextMenu, true);
    }

    if (typeof window !== "undefined") {
      window.addEventListener("blur", this._handleWindowBlur);
      window.addEventListener("mousemove", this._handleMouseMove, { passive: true });
      window.addEventListener("keydown", this._handleGlobalKeyDown, true);
      window.addEventListener("contextmenu", this._handleContextMenu);
    }

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this._handleVisibilityChange);
      document.addEventListener("fullscreenchange", this._handleFullscreenChange);
    }
  }

  destroy() {
    this.stopDuel();

    if (this.editorEl) {
      this.editorEl.removeEventListener("paste", this._handlePaste, true);
      this.editorEl.removeEventListener("drop", this._handleDrop, true);
      this.editorEl.removeEventListener("keydown", this._handleEditorKeyDown, true);
      this.editorEl.removeEventListener("contextmenu", this._handleContextMenu, true);
    }

    if (typeof window !== "undefined") {
      window.removeEventListener("blur", this._handleWindowBlur);
      window.removeEventListener("mousemove", this._handleMouseMove);
      window.removeEventListener("keydown", this._handleGlobalKeyDown, true);
      window.removeEventListener("contextmenu", this._handleContextMenu);
    }

    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this._handleVisibilityChange);
      document.removeEventListener("fullscreenchange", this._handleFullscreenChange);
    }

    this.editorEl = null;
  }

  // -------------------------------------------------------------------------
  // Paste, Drop & Shortcut Protection
  // -------------------------------------------------------------------------
  _handlePaste(e) {
    if (e) e.preventDefault();
    this._triggerPasteBlocked("paste_clipboard");
  }

  _handleDrop(e) {
    if (e) e.preventDefault();
    this._triggerPasteBlocked("drag_drop");
  }

  _handleContextMenu(e) {
    if (this.isArmed) {
      if (e) e.preventDefault();
    }
  }

  _handleEditorKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === "v" || e.key === "V" || e.code === "KeyV")) {
      e.preventDefault();
      this._triggerPasteBlocked("shortcut_ctrl_v");
    }
  }

  _handleGlobalKeyDown(e) {
    // Block DevTools shortcuts during armed duel
    if (this.isArmed) {
      // F12
      if (e.key === "F12" || e.code === "F12") {
        e.preventDefault();
        return;
      }
      // Ctrl+Shift+I / J / C (DevTools & Console)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && ["I", "i", "J", "j", "C", "c"].includes(e.key)) {
        e.preventDefault();
        return;
      }
      // Ctrl+U (View Source)
      if ((e.ctrlKey || e.metaKey) && ["u", "U"].includes(e.key)) {
        e.preventDefault();
        return;
      }
    }

    // Keystroke flight time telemetry
    const now = performance.now();
    if (this.lastKeyTime > 0) {
      const flightTime = now - this.lastKeyTime;
      if (flightTime < 3000) {
        this.flightTimes.push(flightTime);
        if (this.flightTimes.length > this.maxFlightHistory) {
          this.flightTimes.shift();
        }
      }
    }
    this.lastKeyTime = now;
    this.totalKeystrokes += 1;

    if (this.totalKeystrokes % 12 === 0) {
      this._recomputeTrustScore();
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
  // 3-Strike Proctoring & Instant Blur Lockout
  // -------------------------------------------------------------------------
  _registerStrike(reason) {
    if (!this.isArmed) return;

    const now = Date.now();
    if (now - this.lastStrikeTime < this.strikeDebounceMs) {
      return;
    }

    this.lastStrikeTime = now;
    this.strikes += 1;

    if (this.strikes < this.maxStrikes) {
      this.lockEditor(4, reason);
      this.onStrike(this.strikes, reason);
    } else {
      this.isArmed = false;
      this.unlockEditor();
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
        const velocity = dist / dt;
        this.velocitySamples.push(velocity);
        if (this.velocitySamples.length > this.maxMouseHistory) {
          this.velocitySamples.shift();
        }

        const angle = Math.atan2(dy, dx);
        if (this.lastAngle !== null) {
          let diff = Math.abs(angle - this.lastAngle);
          if (diff > Math.PI) diff = 2 * Math.PI - diff;
          if (diff > 0.45) {
            this.angularDirectionChanges += 1;
          }
        }
        this.lastAngle = angle;
      }
    }

    this.lastMousePos = { x, y };
    this.lastMouseTime = now;

    if (this.velocitySamples.length > 0 && this.velocitySamples.length % 15 === 0) {
      this._recomputeTrustScore();
    }
  }

  _recomputeTrustScore() {
    let trust = 100.0;

    // Deductions: Paste attempts (-18 per paste)
    trust -= this.blockedPasteAttempts * 18.0;

    // Deductions: Focus lost strikes (-22 per strike)
    trust -= this.strikes * 22.0;

    // Mouse velocity variance check (linear bot lines vs human curvature)
    if (this.velocitySamples.length >= 10) {
      const vMean = this.velocitySamples.reduce((a, b) => a + b, 0) / this.velocitySamples.length;
      const vVar = this.velocitySamples.reduce((acc, v) => acc + Math.pow(v - vMean, 2), 0) / this.velocitySamples.length;
      if (vVar < 0.005 && vMean > 0.1) {
        trust -= 20.0; // Synthetic mouse movement detected
      }
    }

    // Keystroke flight time std dev (uniform intervals indicate script injection)
    if (this.flightTimes.length >= 8) {
      const fMean = this.flightTimes.reduce((a, b) => a + b, 0) / this.flightTimes.length;
      const fVar = this.flightTimes.reduce((acc, f) => acc + Math.pow(f - fMean, 2), 0) / this.flightTimes.length;
      const fStdDev = Math.sqrt(fVar);
      if (fStdDev < 6.0) {
        trust -= 25.0; // Unnatural typing cadence
      }
    }

    this.humanTrustScore = Math.max(0.0, Math.min(100.0, Math.round(trust * 10) / 10));

    this.onTrustUpdate(this.humanTrustScore, {
      blockedPasteAttempts: this.blockedPasteAttempts,
      strikes: this.strikes,
      angularChanges: this.angularDirectionChanges,
      velocityVariance: this._getVelocityVariance(),
      flightTimeStdDev: this._getFlightTimeStdDev(),
    });
  }

  _getVelocityVariance() {
    if (this.velocitySamples.length < 2) return 0;
    const mean = this.velocitySamples.reduce((a, b) => a + b, 0) / this.velocitySamples.length;
    const variance = this.velocitySamples.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / this.velocitySamples.length;
    return Math.round(variance * 1000) / 1000;
  }

  _getFlightTimeStdDev() {
    if (this.flightTimes.length < 2) return 0;
    const mean = this.flightTimes.reduce((a, b) => a + b, 0) / this.flightTimes.length;
    const variance = this.flightTimes.reduce((acc, f) => acc + Math.pow(f - mean, 2), 0) / this.flightTimes.length;
    return Math.round(Math.sqrt(variance) * 10) / 10;
  }

  getMetrics() {
    return {
      humanTrustScore: this.humanTrustScore,
      blockedPasteAttempts: this.blockedPasteAttempts,
      strikes: this.strikes,
      isArmed: this.isArmed,
      isLocked: this.isLocked,
      angularChanges: this.angularDirectionChanges,
      velocityVariance: this._getVelocityVariance(),
      flightTimeStdDev: this._getFlightTimeStdDev(),
    };
  }
}
