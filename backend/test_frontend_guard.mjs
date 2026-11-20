// test_frontend_guard.mjs - Real Logic & Telemetry Verification for guard.js
import { AntiCheatGuard } from '../static/guard.js';

class MockElement {
  constructor(id = '') {
    this.id = id;
    this.attrs = {};
    this.classList = {
      _classes: new Set(),
      add(...c) { c.forEach(x => this._classes.add(x)); },
      remove(...c) { c.forEach(x => this._classes.delete(x)); },
      contains(c) { return this._classes.has(c); }
    };
    this.listeners = {};
  }
  setAttribute(k, v) { this.attrs[k] = v; }
  removeAttribute(k) { delete this.attrs[k]; }
  getAttribute(k) { return this.attrs[k]; }
  addEventListener(event, fn, opts) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }
  removeEventListener(event, fn) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(f => f !== fn);
  }
  dispatchEvent(event) {
    const handlers = this.listeners[event.type] || [];
    for (const h of handlers) h(event);
  }
}

// Setup minimal browser-like globals
globalThis.document = {
  fullscreenElement: null,
  documentElement: { requestFullscreen: async () => {} },
  hidden: false,
  listeners: {},
  addEventListener(event, fn) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  },
  removeEventListener(event, fn) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(f => f !== fn);
  },
  dispatchEvent(event) {
    const handlers = this.listeners[event.type] || [];
    for (const h of handlers) h(event);
  }
};
globalThis.window = new MockElement('window');
globalThis.performance = performance;

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    testsPassed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    testsFailed++;
  }
}

console.log('='.repeat(70));
console.log('CAMPUSGHOSTS FRONTEND GUARD REAL LOGIC VERIFICATION');
console.log('='.repeat(70));

// --- Suite 1: Initialization & Baseline Trust Score ---
console.log('\n--- Suite 1: Initialization & Baseline Trust Score ---');
const editorEl = new MockElement('code-editor');
let strikeEvents = [];
let lockoutEvents = [];
let pasteBlockedEvents = [];
let disqualifyEvents = [];

const guard = new AntiCheatGuard({
  editorEl,
  onStrike: (count, reason) => strikeEvents.push({ count, reason }),
  onLockout: (strikes, reason, timeLeft) => lockoutEvents.push({ strikes, reason, timeLeft }),
  onPasteBlocked: (info) => pasteBlockedEvents.push(info),
  onDisqualify: (reason) => disqualifyEvents.push(reason),
});

assert(guard.getTrustScore() === 100.0, 'Initial trust score is 100.0');
assert(guard.isArmed === false, 'Guard starts disarmed');
assert(guard.strikes === 0, 'Initial strike count is 0');

// --- Suite 2: Armed State & Paste/Drop Interception ---
console.log('\n--- Suite 2: Armed State & Paste/Drop Interception ---');
await guard.startDuel(false);
assert(guard.isArmed === true, 'Guard successfully armed');

// Simulate paste event
let pastePrevented = false;
editorEl.dispatchEvent({
  type: 'paste',
  preventDefault: () => { pastePrevented = true; }
});
assert(pastePrevented === true, 'Editor paste event was intercepted and preventDefault() called');
assert(guard.blockedPasteAttempts === 1, 'Blocked paste attempts incremented to 1');
assert(pasteBlockedEvents.length === 1, 'onPasteBlocked callback triggered');
assert(guard.getTrustScore() < 100.0, `Trust score deducted after paste (Score: ${guard.getTrustScore()}%)`);

// Simulate Ctrl+V shortcut
let ctrlVPrevented = false;
editorEl.dispatchEvent({
  type: 'keydown',
  ctrlKey: true,
  key: 'v',
  preventDefault: () => { ctrlVPrevented = true; }
});
assert(ctrlVPrevented === true, 'Ctrl+V keydown was intercepted and preventDefault() called');
assert(guard.blockedPasteAttempts === 2, 'Blocked paste attempts incremented to 2');

// --- Suite 3: Tab Switch / Blur & 3-Strike Lockout Lifecycle ---
console.log('\n--- Suite 3: Tab Switch / Blur & 3-Strike Lockout Lifecycle ---');
// Strike 1 via window blur
window.dispatchEvent({ type: 'blur' });
assert(guard.strikes === 1, 'Strike 1 registered on window blur');
assert(guard.isLocked === true, 'Editor locked with readonly overlay on Strike 1');
assert(editorEl.getAttribute('readonly') === 'true', 'Editor element marked readonly');
assert(lockoutEvents.length > 0, 'onLockout callback fired');

// Debounce test: immediate second blur within 900ms should NOT register extra strike
window.dispatchEvent({ type: 'blur' });
assert(guard.strikes === 1, 'Strike debounce prevented double-counting within 900ms');

// Fast-forward lastStrikeTime and trigger Strike 2
guard.lastStrikeTime = Date.now() - 1500;
window.dispatchEvent({ type: 'blur' });
assert(guard.strikes === 2, 'Strike 2 registered on second blur after debounce window');
assert(disqualifyEvents.length === 0, 'Not disqualified yet at Strike 2');

// Fast-forward and trigger Strike 3 -> Disqualification
guard.lastStrikeTime = Date.now() - 1500;
window.dispatchEvent({ type: 'blur' });
assert(guard.strikes === 3, 'Strike 3 registered');
assert(disqualifyEvents.length === 1, 'Disqualified on Strike 3');
assert(guard.isArmed === false, 'Guard automatically disarmed upon disqualification');

// --- Suite 4: Mouse Biomechanics & Acceleration / Deceleration Variances ---
console.log('\n--- Suite 4: Mouse Biomechanics & Acceleration / Deceleration Variances ---');
const botGuard = new AntiCheatGuard({ editorEl: new MockElement('bot-editor') });
await botGuard.startDuel(false);

// Generate human-like movement with natural acceleration and deceleration
let curX = 100;
let curY = 100;
let fakeTime = 1000;
// Phase 1: accelerate
for (let i = 0; i < 15; i++) {
  curX += i * 2;
  curY += i * 1.5;
  fakeTime += 16; // ~60fps
  botGuard._handleMouseMove({ clientX: curX, clientY: curY });
}
// Phase 2: decelerate
for (let i = 15; i > 0; i--) {
  curX += i * 1.8;
  curY += i * 1.2;
  fakeTime += 16;
  botGuard._handleMouseMove({ clientX: curX, clientY: curY });
}

const accelVar = botGuard._getAccelerationVariance();
const decelVar = botGuard._getDecelerationVariance();
assert(botGuard.accelerationSamples.length > 0, `Captured ${botGuard.accelerationSamples.length} acceleration samples`);
assert(botGuard.decelerationSamples.length > 0, `Captured ${botGuard.decelerationSamples.length} deceleration samples`);
assert(accelVar > 0, `Natural acceleration variance detected (${accelVar.toFixed(6)})`);
assert(decelVar > 0, `Natural deceleration variance detected (${decelVar.toFixed(6)})`);

// Test Macro Teleportation Bot: extreme acceleration jump
botGuard._handleMouseMove({ clientX: curX + 1200, clientY: curY + 900 });
botGuard._recomputeTrustScore();
const trustAfterBotCheck = botGuard.getTrustScore();
assert(trustAfterBotCheck < 90.0, `Bot teleportation was penalized (Score: ${trustAfterBotCheck}%)`);

console.log('\n' + '='.repeat(70));
console.log(`FRONTEND GUARD RESULTS: ${testsPassed}/${testsPassed + testsFailed} passed, ${testsFailed} failed.`);
console.log('='.repeat(70));

if (testsFailed > 0) {
  process.exit(1);
}
