# Concrete Example: Vendor Onboarding

## The Schema (simplified)

A vendor onboarding intake needs:

- `legal_name` (string)
- `country` (enum)
- `tax_id` (string, country-specific validation)
- `bank_account` (object: iban / routing / account)
- `contact_email` (email)
- `docs`:
  - `w9_or_w8` (file upload; PDF)
  - `insurance_certificate` (file upload; PDF)
- `risk`:
  - `sanctions_check` (boolean + evidence)
- `approval`:
  - `compliance_reviewer` (user/group)
  - `approval_status` (pending/approved/rejected)

---

## The Intake Contract: States

A clean, production-friendly state machine:

### States

| State | Description |
|-------|-------------|
| `DRAFT` | Created, no meaningful data yet |
| `IN_PROGRESS` | Partial fields present |
| `AWAITING_INPUT` | Missing required fields (agent/human action) |
| `AWAITING_UPLOAD` | Requires files via upload negotiation |
| `SUBMITTED` | Submission requested (locked or semi-locked) |
| `NEEDS_REVIEW` | Routed to human gate |
| `APPROVED` | Review passed |
| `REJECTED` | Review failed (with reasons) |
| `FINALIZED` | Delivered to destination, immutable |
| `CANCELLED` / `EXPIRED` | Abandoned or timed out |

### Key Transitions

```
DRAFT → IN_PROGRESS (any field set)
IN_PROGRESS → AWAITING_INPUT (validate → missing)
IN_PROGRESS → AWAITING_UPLOAD (validate → missing files)
IN_PROGRESS → SUBMITTED (agent requests submit)
SUBMITTED → NEEDS_REVIEW (policy says approval required)
NEEDS_REVIEW → APPROVED | REJECTED
APPROVED → FINALIZED (webhook/API delivery succeeds)
```

---

## The Error Contract (what agents loop over)

Example validation error returned to an agent:

```json
{
  "ok": false,
  "error": {
    "type": "missing",
    "fields": ["tax_id", "docs.w9_or_w8"],
    "resumeToken": "fb_8x3k_9pQ",
    "nextActions": [
      { "action": "collect_field", "field": "tax_id", "hint": "Vendor tax ID for US vendors is EIN" },
      { "action": "request_upload", "field": "docs.w9_or_w8", "accept": ["application/pdf"], "maxBytes": 10000000 }
    ]
  }
}
```

---

## The Mixed-Mode Flow (step-by-step)

### Actors
- **Agent** (your workflow runner)
- **Vendor** (human filling form + uploading docs)
- **Compliance Reviewer** (human gate)
- **Your System** (final destination API/webhook)

### Sequence

1. **Agent** starts onboarding session (creates submission).
2. **Agent** pre-fills what it already knows (legal name, email, country) from vendor CRM.
3. **FormBridge** validates → returns `missing` for `tax_id` and `docs.w9_or_w8`.
4. **Agent** sends vendor a link to the human web form (already bound to the same submission).
5. **Vendor** enters tax ID + uploads PDF(s).
6. **Agent** resumes using `resumeToken`, re-validates, then submits.
7. Policy requires compliance review → transitions to `NEEDS_REVIEW`.
8. **Reviewer** approves.
9. **FormBridge** finalizes: posts payload + document references to your webhook/API.
10. Audit trail is complete; downstream systems consume the event stream.

---

## Event Stream (JSONL)

```jsonl
{"type":"submission.created","submissionId":"sub_01HV...","state":"DRAFT","ts":"2026-01-29T10:02:11Z","actor":{"kind":"agent","id":"agent_vendor_onboarding"}}

{"type":"field.updated","submissionId":"sub_01HV...","path":"legal_name","value":"Acme Supplies Ltd","ts":"2026-01-29T10:02:12Z","actor":{"kind":"agent","id":"agent_vendor_onboarding"}}
{"type":"field.updated","submissionId":"sub_01HV...","path":"country","value":"US","ts":"2026-01-29T10:02:12Z","actor":{"kind":"agent","id":"agent_vendor_onboarding"}}
{"type":"field.updated","submissionId":"sub_01HV...","path":"contact_email","value":"ap@acme.com","ts":"2026-01-29T10:02:13Z","actor":{"kind":"agent","id":"agent_vendor_onboarding"}}

{"type":"validation.failed","submissionId":"sub_01HV...","state":"AWAITING_INPUT","ts":"2026-01-29T10:02:13Z",
 "error":{"type":"missing","fields":["tax_id","docs.w9_or_w8"],"resumeToken":"fb_8x3k_9pQ"}}

{"type":"handoff.link_issued","submissionId":"sub_01HV...","ts":"2026-01-29T10:02:14Z",
 "to":{"kind":"human","email":"ap@acme.com"},
 "link":{"kind":"web_form","url":"https://forms.example.com/sub_01HV..."}}

{"type":"field.updated","submissionId":"sub_01HV...","path":"tax_id","value":"12-3456789","ts":"2026-01-29T10:11:02Z","actor":{"kind":"human","id":"vendor_user_73"}}

{"type":"upload.requested","submissionId":"sub_01HV...","path":"docs.w9_or_w8","ts":"2026-01-29T10:11:05Z",
 "constraints":{"accept":["application/pdf"],"maxBytes":10000000}}

{"type":"upload.url_issued","submissionId":"sub_01HV...","path":"docs.w9_or_w8","ts":"2026-01-29T10:11:06Z",
 "upload":{"provider":"s3","method":"PUT","url":"https://signed.example.com/...","expiresInSec":900}}

{"type":"upload.completed","submissionId":"sub_01HV...","path":"docs.w9_or_w8","ts":"2026-01-29T10:11:29Z",
 "file":{"sha256":"...","bytes":482193,"mime":"application/pdf","name":"w9.pdf"}}

{"type":"submission.resumed","submissionId":"sub_01HV...","state":"IN_PROGRESS","ts":"2026-01-29T10:12:01Z",
 "actor":{"kind":"agent","id":"agent_vendor_onboarding"},"resumeToken":"fb_8x3k_9pQ"}

{"type":"submission.submitted","submissionId":"sub_01HV...","state":"SUBMITTED","ts":"2026-01-29T10:12:03Z",
 "actor":{"kind":"agent","id":"agent_vendor_onboarding"},"idempotencyKey":"idem_4fN2..."}

{"type":"review.requested","submissionId":"sub_01HV...","state":"NEEDS_REVIEW","ts":"2026-01-29T10:12:03Z",
 "policy":{"name":"vendor_onboarding_compliance_gate","version":"1.3"},
 "reviewer":{"kind":"group","id":"compliance_team"}}

{"type":"review.approved","submissionId":"sub_01HV...","state":"APPROVED","ts":"2026-01-29T10:45:18Z",
 "actor":{"kind":"human","id":"compliance_user_12"}}

{"type":"delivery.attempted","submissionId":"sub_01HV...","ts":"2026-01-29T10:45:20Z",
 "destination":{"kind":"webhook","name":"vendor_master_api"}}

{"type":"delivery.succeeded","submissionId":"sub_01HV...","ts":"2026-01-29T10:45:20Z",
 "destination":{"kind":"webhook","name":"vendor_master_api"},"status":200}

{"type":"submission.finalized","submissionId":"sub_01HV...","state":"FINALIZED","ts":"2026-01-29T10:45:20Z"}
```

---

## The Takeaway

> This is what production-grade intake looks like with agents: deterministic retries, resumable state, safe submission semantics, human approvals, and an event stream you can audit and integrate — all generated from the same schema that renders the human UI.
