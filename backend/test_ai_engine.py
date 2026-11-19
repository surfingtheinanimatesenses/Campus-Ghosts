"""
test_ai_engine.py - Unit test harness for ai_engine.py.

Tests both LLM-parsing helpers and the full offline fallback paths.
Requires ZERO live API calls — all tests run deterministically in <500 ms.
"""

import sys
import json
import time
from pathlib import Path

# Ensure backend module is importable regardless of CWD
sys.path.insert(0, str(Path(__file__).resolve().parent))

import ai_engine  # noqa: E402  (import after path adjustment)
from ai_engine import (
    _extract_json_from_text,
    _is_valid_attempt,
    _INCOMPLETE_RESPONSE,
    analyse_code,
    deterministic_code_audit,
    generate_remedial_plan,
    PROBLEMS,
)

# ===========================================================================
# Test registry
# ===========================================================================
PASS_COUNT = 0
FAIL_COUNT = 0
FAILURES: list[str] = []


def _ok(name: str) -> None:
    global PASS_COUNT
    PASS_COUNT += 1
    print(f"  [PASS] {name}")


def _fail(name: str, reason: str) -> None:
    global FAIL_COUNT
    FAIL_COUNT += 1
    FAILURES.append(f"{name}: {reason}")
    print(f"  [FAIL] {name} — {reason}")


def run_test(name: str, expr: bool, reason: str = "") -> None:
    if expr:
        _ok(name)
    else:
        _fail(name, reason or "assertion failed")


# ===========================================================================
# SECTION 1 — Problems.json loading
# ===========================================================================
def section_problems_json() -> None:
    print("\n--- Section 1: problems.json loading ---")
    run_test("3 problems loaded", len(PROBLEMS) == 3,
             f"got {len(PROBLEMS)}")
    run_test("ptr-swap present", "ptr-swap" in PROBLEMS)
    run_test("arr-bound present", "arr-bound" in PROBLEMS)
    run_test("rec-fact present", "rec-fact" in PROBLEMS)

    for pid, prob in PROBLEMS.items():
        for field in ("buggy_code", "fixed_code", "bug_signatures", "topic", "concept_tag"):
            run_test(f"{pid} has {field}", field in prob, f"missing '{field}'")


# ===========================================================================
# SECTION 2 — JSON fence-stripping parser
# ===========================================================================
def section_json_parser() -> None:
    print("\n--- Section 2: LLM JSON fence-stripping parser ---")

    # Clean JSON
    raw = '{"passed": true, "concept_tag": "X", "topic": "T", "socratic_hint": "h"}'
    result = _extract_json_from_text(raw)
    run_test("clean JSON parsed", result is not None and result.get("passed") is True)

    # JSON inside triple backticks
    fenced = '```json\n{"passed": false, "concept_tag": "OOB"}\n```'
    result = _extract_json_from_text(fenced)
    run_test("fenced JSON parsed", result is not None and result.get("passed") is False)

    # JSON after prose padding
    padded = 'Here is my analysis:\n\n```json\n{"passed": true, "topic": "Loops"}\n```\nHope that helps!'
    result = _extract_json_from_text(padded)
    run_test("prose-padded JSON parsed", result is not None and result.get("topic") == "Loops")

    # Nested JSON
    nested = '{"outer": true, "inner": {"k": 1}}'
    result = _extract_json_from_text(nested)
    run_test("nested JSON parsed", result is not None and "inner" in result)

    # Completely malformed
    result = _extract_json_from_text("not json at all !!!")
    run_test("garbage returns None", result is None)

    # Empty string
    result = _extract_json_from_text("")
    run_test("empty string returns None", result is None)


# ===========================================================================
# SECTION 3 — Gibberish / incomplete code guard
# ===========================================================================
def section_gibberish_guard() -> None:
    print("\n--- Section 3: Gibberish / incomplete code guard ---")

    run_test("empty string is invalid", not _is_valid_attempt(""))
    run_test("whitespace only is invalid", not _is_valid_attempt("   \n\t  "))
    run_test("very short code is invalid", not _is_valid_attempt("abc"))
    run_test("random chars are invalid", not _is_valid_attempt("!!!???###"))

    run_test("C++ hello world is valid",
             _is_valid_attempt('#include<iostream>\nint main(){return 0;}'))
    run_test("Python def is valid",
             _is_valid_attempt('def foo():\n    return 1'))
    run_test("C for-loop is valid",
             _is_valid_attempt('for(int i=0;i<n;i++){sum+=arr[i];}'))

    # analyse_code should return incomplete response for garbage
    result = analyse_code("ptr-swap", "   ")
    run_test("analyse_code returns is_valid_attempt=False for garbage",
             result["is_valid_attempt"] is False)
    run_test("analyse_code concept_tag is INCOMPLETE_SYNTAX for garbage",
             result["concept_tag"] == "INCOMPLETE_SYNTAX")
    run_test("analyse_code passed=False for garbage",
             result["passed"] is False)


# ===========================================================================
# SECTION 4 — Deterministic offline audit (all 3 problems, buggy + fixed)
# ===========================================================================
def section_offline_audit() -> None:
    print("\n--- Section 4: Deterministic offline code audit ---")

    # -- ptr-swap BUG --
    buggy_ptr = PROBLEMS["ptr-swap"]["buggy_code"]
    t0 = time.monotonic()
    r = deterministic_code_audit("ptr-swap", buggy_ptr)
    elapsed_ms = (time.monotonic() - t0) * 1000
    run_test("ptr-swap buggy: passed=False", r["passed"] is False, str(r))
    run_test("ptr-swap buggy: concept_tag correct",
             r["concept_tag"] == "UNINITIALIZED_POINTER_DEREF", r["concept_tag"])
    run_test("ptr-swap buggy: source=offline_ast_fallback",
             r.get("source") == "offline_ast_fallback")
    run_test(f"ptr-swap buggy: <20ms (actual {elapsed_ms:.1f}ms)", elapsed_ms < 20,
             f"{elapsed_ms:.1f}ms")

    # -- ptr-swap FIXED --
    fixed_ptr = PROBLEMS["ptr-swap"]["fixed_code"]
    r = deterministic_code_audit("ptr-swap", fixed_ptr)
    run_test("ptr-swap fixed: passed=True", r["passed"] is True, str(r))
    run_test("ptr-swap fixed: source=offline_ast_fallback",
             r.get("source") == "offline_ast_fallback")

    # -- arr-bound BUG --
    buggy_arr = PROBLEMS["arr-bound"]["buggy_code"]
    t0 = time.monotonic()
    r = deterministic_code_audit("arr-bound", buggy_arr)
    elapsed_ms = (time.monotonic() - t0) * 1000
    run_test("arr-bound buggy: passed=False", r["passed"] is False, str(r))
    run_test("arr-bound buggy: concept_tag correct",
             r["concept_tag"] == "OFF_BY_ONE_BOUNDARY", r["concept_tag"])
    run_test(f"arr-bound buggy: <20ms (actual {elapsed_ms:.1f}ms)", elapsed_ms < 20)

    # -- arr-bound FIXED --
    fixed_arr = PROBLEMS["arr-bound"]["fixed_code"]
    r = deterministic_code_audit("arr-bound", fixed_arr)
    run_test("arr-bound fixed: passed=True", r["passed"] is True, str(r))

    # -- rec-fact BUG --
    buggy_rec = PROBLEMS["rec-fact"]["buggy_code"]
    t0 = time.monotonic()
    r = deterministic_code_audit("rec-fact", buggy_rec)
    elapsed_ms = (time.monotonic() - t0) * 1000
    run_test("rec-fact buggy: passed=False", r["passed"] is False, str(r))
    run_test("rec-fact buggy: concept_tag correct",
             r["concept_tag"] == "MISSING_BASE_CASE_OVERFLOW", r["concept_tag"])
    run_test(f"rec-fact buggy: <20ms (actual {elapsed_ms:.1f}ms)", elapsed_ms < 20)

    # -- rec-fact FIXED --
    fixed_rec = PROBLEMS["rec-fact"]["fixed_code"]
    r = deterministic_code_audit("rec-fact", fixed_rec)
    run_test("rec-fact fixed: passed=True", r["passed"] is True, str(r))

    # -- Unknown problem ID --
    r = deterministic_code_audit("nonexistent-problem", "some code here;")
    run_test("unknown problem: concept_tag=UNKNOWN_PROBLEM",
             r["concept_tag"] == "UNKNOWN_PROBLEM")
    run_test("unknown problem: source=offline_ast_fallback",
             r.get("source") == "offline_ast_fallback")


# ===========================================================================
# SECTION 5 — analyse_code (offline path, no keys configured)
# ===========================================================================
def section_analyse_code_offline() -> None:
    print("\n--- Section 5: analyse_code offline path (no live keys) ---")

    # Force offline: temporarily zero out the pool
    orig_groq = ai_engine.KEY_POOL._groq
    orig_gemini = ai_engine.KEY_POOL._gemini
    ai_engine.KEY_POOL._groq = []
    ai_engine.KEY_POOL._gemini = []

    try:
        # Buggy ptr-swap
        r = analyse_code("ptr-swap", PROBLEMS["ptr-swap"]["buggy_code"])
        run_test("analyse_code offline ptr-swap buggy: passed=False",
                 r["passed"] is False, str(r))
        run_test("analyse_code offline ptr-swap buggy: source=offline_ast_fallback",
                 r.get("source") == "offline_ast_fallback")

        # Fixed arr-bound
        r = analyse_code("arr-bound", PROBLEMS["arr-bound"]["fixed_code"])
        run_test("analyse_code offline arr-bound fixed: passed=True",
                 r["passed"] is True, str(r))

        # Buggy rec-fact
        r = analyse_code("rec-fact", PROBLEMS["rec-fact"]["buggy_code"])
        run_test("analyse_code offline rec-fact buggy: passed=False",
                 r["passed"] is False, str(r))
        run_test("analyse_code offline rec-fact: is_valid_attempt=True",
                 r.get("is_valid_attempt") is True)

        # Required keys present in all results
        required = {"passed", "concept_tag", "topic", "socratic_hint", "source"}
        for pid, code_key in [("ptr-swap", "buggy_code"), ("arr-bound", "fixed_code")]:
            r = analyse_code(pid, PROBLEMS[pid][code_key])
            missing = required - set(r.keys())
            run_test(f"analyse_code offline {pid}: all required keys present",
                     not missing, f"missing: {missing}")
    finally:
        ai_engine.KEY_POOL._groq = orig_groq
        ai_engine.KEY_POOL._gemini = orig_gemini


# ===========================================================================
# SECTION 6 — Remedial plan generation (offline fallbacks)
# ===========================================================================
def section_remedial_plan() -> None:
    print("\n--- Section 6: generate_remedial_plan offline fallbacks ---")

    orig_groq = ai_engine.KEY_POOL._groq
    orig_gemini = ai_engine.KEY_POOL._gemini
    ai_engine.KEY_POOL._groq = []
    ai_engine.KEY_POOL._gemini = []

    required_plan_keys = {"title", "root_cause_summary", "live_code_demo_fix",
                          "three_viva_questions", "practice_drill"}

    test_cases = [
        ("Pointers & Memory", "UNINITIALIZED_POINTER_DEREF", 14),
        ("Loops & Iteration", "OFF_BY_ONE_BOUNDARY", 11),
        ("Functions & Scope", "PASS_BY_VALUE_MUTATION_BUG", 7),
        ("Recursion", "MISSING_BASE_CASE_OVERFLOW", 3),
        ("Bit Manipulation", "SIGNED_SHIFT_OVERFLOW", 2),
    ]

    try:
        for topic, tag, count in test_cases:
            plan = generate_remedial_plan(topic, tag, count)
            missing = required_plan_keys - set(plan.keys())
            run_test(f"plan {tag}: all required keys present",
                     not missing, f"missing: {missing}")
            run_test(f"plan {tag}: title is non-empty string",
                     isinstance(plan.get("title"), str) and len(plan["title"]) > 5)
            run_test(f"plan {tag}: three_viva_questions is list of 3",
                     isinstance(plan.get("three_viva_questions"), list) and
                     len(plan["three_viva_questions"]) == 3)
            run_test(f"plan {tag}: source is offline_plan_fallback",
                     "offline" in plan.get("source", ""), plan.get("source"))

        # Generic fallback for unknown tag
        plan = generate_remedial_plan("Networking", "BUFFER_OVERFLOW_HEAP", 5)
        run_test("plan generic fallback: all keys present",
                 required_plan_keys.issubset(plan.keys()))
        run_test("plan generic fallback: source contains offline",
                 "offline" in plan.get("source", ""))
    finally:
        ai_engine.KEY_POOL._groq = orig_groq
        ai_engine.KEY_POOL._gemini = orig_gemini


# ===========================================================================
# SECTION 7 — Key pool cooldown logic
# ===========================================================================
def section_key_pool() -> None:
    print("\n--- Section 7: KeyPool cooldown mechanics ---")

    from ai_engine import _KeyEntry, KeyPool

    entry = _KeyEntry("test_key_abc123")
    run_test("new key is available", entry.is_available())
    entry.put_on_cooldown()
    run_test("key on cooldown is unavailable", not entry.is_available())

    # Pool with placeholder keys (filtered out)
    pool = KeyPool(
        groq_keys=["gsk_REPLACE_WITH_YOUR_GROQ_KEY_1"],
        gemini_keys=["AIza_REPLACE_WITH_YOUR_GEMINI_KEY_1"],
    )
    run_test("placeholder groq keys are filtered out", not pool.has_groq())
    run_test("placeholder gemini keys are filtered out", not pool.has_gemini())

    # Pool with real (non-placeholder) keys — not live, just tests filtering logic
    pool2 = KeyPool(
        groq_keys=["gsk_real_key_xxxxxxxxxxxxxxxxxxxx"],
        gemini_keys=[],
    )
    run_test("non-placeholder groq key is accepted", pool2.has_groq())
    run_test("empty gemini pool: has_gemini=False", not pool2.has_gemini())


# ===========================================================================
# SECTION 8 — Edge case: analyse_code with malformed LLM output
# ===========================================================================
def section_malformed_llm_output() -> None:
    print("\n--- Section 8: Malformed LLM output fallback ---")

    # Simulate a patched call that returns malformed text
    original_groq_call = ai_engine._post_groq
    original_gemini_call = ai_engine._post_gemini

    def _mock_groq_bad(api_key, model, messages):
        # Return a valid HTTP-like response with garbage body
        return {
            "choices": [{
                "message": {
                    "content": "Sure! Here is my analysis: NO_JSON_HERE just prose."
                }
            }]
        }

    def _mock_gemini_bad(api_key, model, prompt):
        return {
            "candidates": [{
                "content": {
                    "parts": [{
                        "text": "```json\n{bad json missing quotes}\n```"
                    }]
                }
            }]
        }

    # Inject one real-looking groq key so the pool tries the mock
    orig_groq_pool = ai_engine.KEY_POOL._groq
    orig_gemini_pool = ai_engine.KEY_POOL._gemini
    from ai_engine import _KeyEntry
    ai_engine.KEY_POOL._groq = [_KeyEntry("gsk_mock_key_xxxxxxxxxx")]
    ai_engine.KEY_POOL._gemini = []
    ai_engine._post_groq = _mock_groq_bad  # type: ignore

    try:
        # Should degrade gracefully to offline fallback
        r = analyse_code("ptr-swap", PROBLEMS["ptr-swap"]["buggy_code"])
        run_test("malformed groq output: no crash", True)
        run_test("malformed groq output: source=offline_ast_fallback",
                 r.get("source") == "offline_ast_fallback", str(r))
        run_test("malformed groq output: passed is bool or None",
                 isinstance(r.get("passed"), (bool, type(None))))
    finally:
        ai_engine.KEY_POOL._groq = orig_groq_pool
        ai_engine.KEY_POOL._gemini = orig_gemini_pool
        ai_engine._post_groq = original_groq_call  # type: ignore


# ===========================================================================
# Runner
# ===========================================================================
def main() -> None:
    print("=" * 70)
    print("CAMPUSGHOSTS ai_engine.py UNIT TEST SUITE")
    print("=" * 70)

    section_problems_json()
    section_json_parser()
    section_gibberish_guard()
    section_offline_audit()
    section_analyse_code_offline()
    section_remedial_plan()
    section_key_pool()
    section_malformed_llm_output()

    print("\n" + "=" * 70)
    total = PASS_COUNT + FAIL_COUNT
    print(f"RESULTS: {PASS_COUNT}/{total} passed, {FAIL_COUNT} failed.")

    if FAILURES:
        print("\nFAILED TESTS:")
        for f in FAILURES:
            print(f"  ✗ {f}")
        print("=" * 70)
        sys.exit(1)
    else:
        print("ALL TESTS PASSED WITH ZERO ERRORS.")
        print("=" * 70)


if __name__ == "__main__":
    main()
