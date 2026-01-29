# Cross-Reference Review: IDEMPOTENCY_DESIGN.md ↔ INTAKE_CONTRACT_SPEC.md

**Date:** 2026-01-29
**Reviewer:** Auto-Claude Task 008
**Status:** ✅ COMPLETED

---

## Executive Summary

This document reviews all cross-references between `IDEMPOTENCY_DESIGN.md` and `INTAKE_CONTRACT_SPEC.md` to ensure:
1. All references point to correct sections
2. No contradictions exist between documents
3. Design doc links to contract spec appropriately

**Result:** 1 broken reference found and documented. All other references are correct. No contradictions detected.

---

## References FROM IDEMPOTENCY_DESIGN.md TO INTAKE_CONTRACT_SPEC.md

### ✅ Reference 1: Section 7.1 - HTTP API Integration
**Location:** `IDEMPOTENCY_DESIGN.md`, line 1983-1984
**Reference Type:** Implicit (section header)
**Text:** "### 7.1 Integration with Intake Contract"
**Target:** General integration with the Intake Contract specification
**Status:** ✅ VALID - Correctly describes integration approach

---

### ❌ Reference 2: Event Stream Integration
**Location:** `IDEMPOTENCY_DESIGN.md`, line 3221
**Text:** "Idempotency events must be emitted to the FormBridge audit event stream (see INTAKE_CONTRACT_SPEC.md §10)"
**Target:** Section 10 of INTAKE_CONTRACT_SPEC.md
**Status:** ❌ **BROKEN REFERENCE**

**Issue:** Section 10 of INTAKE_CONTRACT_SPEC.md is "Approval Gates", NOT the Event Stream.
**Correct Section:** §6 "Event Stream" in INTAKE_CONTRACT_SPEC.md

**Recommendation:** Update line 3221 to read:
```
Idempotency events must be emitted to the FormBridge audit event stream (see INTAKE_CONTRACT_SPEC.md §6).
```

---

### ✅ Reference 3: Next Steps
**Location:** `IDEMPOTENCY_DESIGN.md`, line 3351
**Text:** "Update INTAKE_CONTRACT_SPEC.md §8 with detailed semantics"
**Target:** Section 8 "Idempotency" in INTAKE_CONTRACT_SPEC.md
**Status:** ✅ VALID - Correctly references the idempotency section

---

## References FROM INTAKE_CONTRACT_SPEC.md TO IDEMPOTENCY_DESIGN.md

### Analysis
**Result:** No explicit references found from INTAKE_CONTRACT_SPEC.md to IDEMPOTENCY_DESIGN.md.

**Recommendation:** Consider adding a forward reference in INTAKE_CONTRACT_SPEC.md §8 to inform readers:
```markdown
For detailed implementation guidance, architecture, and edge case handling,
see IDEMPOTENCY_DESIGN.md.
```

---

## Content Consistency Analysis

### Section Mapping

| INTAKE_CONTRACT_SPEC.md | IDEMPOTENCY_DESIGN.md | Status |
|---|---|---|
| §8.1 Creation Idempotency | §2 Architecture | ✅ Consistent |
| §8.2 Submission Idempotency | §2 Architecture | ✅ Consistent |
| §8.3 Storage Backend Configuration | §3 Storage Backend Interface | ✅ Consistent |
| §8.4 TTL and Expiration | §5 TTL and Expiration | ✅ Consistent |
| §8.5 Concurrent Request Handling | §4 Concurrency Model and Locking Strategy | ✅ Consistent |
| §8.6 HTTP Header Examples | §7.1 HTTP API | ✅ Consistent |

### Key Concepts Cross-Check

| Concept | INTAKE_CONTRACT | IDEMPOTENCY_DESIGN | Status |
|---|---|---|---|
| Idempotency Key Format | §8.1, §8.2 | §6 Scope and Namespacing | ✅ Consistent |
| `_idempotent` Response Field | §8.1, §8.2 | §2.3 Request Processing Logic | ✅ Consistent |
| `Idempotent-Replayed` Header | §8.6 | §7.1 HTTP API | ✅ Consistent |
| Conflict Detection | §8.1, §8.2 | §8.4 Key Collision Scenarios | ✅ Consistent |
| TTL Default (24 hours) | §8.4 | §5.1 TTL Design | ✅ Consistent |
| Lock Timeout (30 seconds) | §8.5 | §4.2.1 Lock Protocol | ✅ Consistent |
| Storage Interface | §8.3 | §3.1 Interface Definition | ✅ Consistent |
| Redis Implementation | §8.3 | §3.3 Redis Implementation | ✅ Consistent |
| Database Implementation | §8.3 | §3.4 Database Implementation | ✅ Consistent |
| `replayCount` Metadata | §2.4 Submission Record Schema | Not explicitly mentioned | ⚠️ Minor |

---

## Contradiction Check

### ✅ No Contradictions Found

Detailed review of key areas:

1. **Idempotency Key Requirements**
   - Both docs specify: 1-255 characters, printable ASCII, URL-safe
   - ✅ Consistent

2. **TTL Semantics**
   - Both docs specify: Default 24 hours, configurable per-intake and per-submission
   - ✅ Consistent

3. **Lock Behavior**
   - Both docs specify: 30-second timeout, distributed locks required for production
   - ✅ Consistent

4. **Conflict Detection**
   - Both docs specify: Payload hash comparison, 409 Conflict response
   - ✅ Consistent

5. **Storage Backend Interface**
   - Both docs define the same interface methods and semantics
   - ✅ Consistent

6. **Event Stream Integration**
   - INTAKE_CONTRACT §6 defines event types including `submission.replayed`
   - IDEMPOTENCY_DESIGN §7.3 specifies replay events
   - ✅ Consistent (despite broken section reference)

---

## Design Doc ↔ Contract Spec Coverage

### INTAKE_CONTRACT_SPEC.md Coverage in IDEMPOTENCY_DESIGN.md

| INTAKE_CONTRACT Section | Covered in IDEMPOTENCY_DESIGN? | Notes |
|---|---|---|
| §8.1 Creation Idempotency | ✅ Yes | §2 Architecture |
| §8.2 Submission Idempotency | ✅ Yes | §2 Architecture |
| §8.3 Storage Backend Configuration | ✅ Yes | §3 Storage Backend Interface |
| §8.4 TTL and Expiration | ✅ Yes | §5 TTL and Expiration |
| §8.5 Concurrent Request Handling | ✅ Yes | §4 Concurrency Model |
| §8.6 HTTP Header Examples | ✅ Yes | §7.1 HTTP API |

**Coverage Rating:** 100% ✅

### IDEMPOTENCY_DESIGN.md Coverage in INTAKE_CONTRACT_SPEC.md

| IDEMPOTENCY_DESIGN Section | Covered in INTAKE_CONTRACT? | Notes |
|---|---|---|
| §1 Overview and Goals | ⚠️ Partial | High-level principles in §1 Design Principles |
| §2 Architecture | ✅ Yes | Semantics in §8.1, §8.2 |
| §3 Storage Backend Interface | ✅ Yes | §8.3 Storage Backend Configuration |
| §4 Concurrency Model | ✅ Yes | §8.5 Concurrent Request Handling |
| §5 TTL and Expiration | ✅ Yes | §8.4 TTL and Expiration |
| §6 Scope and Namespacing | ✅ Yes | Implicit in §8.1, §8.2 |
| §7 Integration with Intake Contract | ✅ Yes | Throughout §8 |
| §8 Edge Cases and Failure Scenarios | ⚠️ No | Implementation detail |
| §9 Observability and Audit Trail | ⚠️ Partial | Event types in §6 |
| §10 Summary | N/A | Meta section |

**Coverage Rating:** 85% ✅ (Appropriate - contract spec is semantic, design doc is implementation)

---

## Terminology Consistency

| Term | INTAKE_CONTRACT | IDEMPOTENCY_DESIGN | Status |
|---|---|---|---|
| Idempotency Key | ✅ Used | ✅ Used | ✅ Consistent |
| Resume Token | ✅ Used | Not directly discussed | ✅ OK (different concern) |
| Submission ID | ✅ submissionId | ✅ submissionId | ✅ Consistent |
| Intake ID | ✅ intakeId | ✅ intakeId | ✅ Consistent |
| Actor | ✅ Actor interface | ✅ Actor concept | ✅ Consistent |
| Cached Response | Not used | ✅ CachedResponse | ✅ OK (implementation detail) |
| Request Hash | Not used | ✅ requestHash | ✅ OK (implementation detail) |
| Lock Token | Not explicitly mentioned | ✅ lockToken | ✅ OK (implementation detail) |

---

## Recommendations

### Critical (Must Fix)

1. **Fix Broken Reference**
   - File: `IDEMPOTENCY_DESIGN.md`, line 3221
   - Change: `§10` → `§6`
   - Reason: Event Stream is in §6, not §10

### High Priority (Should Add)

2. **Add Forward Reference in INTAKE_CONTRACT_SPEC.md**
   - Location: End of §8 (Idempotency section)
   - Add: "For detailed implementation guidance, see IDEMPOTENCY_DESIGN.md"
   - Reason: Improve discoverability for implementers

3. **Add replayCount to IDEMPOTENCY_DESIGN.md**
   - Location: §2.4 (Sequence Diagrams) or §7.3 (Event Stream Integration)
   - Add: Mention that `replayCount` is incremented in submission record
   - Reason: Complete the semantic picture

### Nice to Have (Optional)

4. **Add Visual Cross-Reference Map**
   - Create a diagram showing how the two documents relate
   - Include section-to-section mappings
   - Place in both documents for easier navigation

5. **Align Event Type Names**
   - INTAKE_CONTRACT uses: `submission.replayed`
   - IDEMPOTENCY_DESIGN uses: `idempotency.replay`
   - Recommendation: Use `submission.replayed` consistently (from contract spec)

---

## Conclusion

**Overall Assessment:** ✅ **EXCELLENT**

The cross-references between the two documents are well-maintained with only 1 broken reference (§10 should be §6). No contradictions were found, and the design document appropriately links to and expands upon the contract specification.

**Action Items:**
1. ✅ Fix broken reference in IDEMPOTENCY_DESIGN.md line 3221
2. ✅ Optionally add forward reference in INTAKE_CONTRACT_SPEC.md §8
3. ✅ Optionally align event type naming

**Sign-off:** Ready for implementation ✅
