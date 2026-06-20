# formbridge-sdk

Python SDK for [FormBridge](https://github.com/agentkitai/formbridge) — async and sync HTTP client for managing form submissions.

## Installation

This SDK is not yet published to PyPI. Install it from source:

```bash
git clone https://github.com/agentkitai/formbridge.git
pip install ./formbridge/sdk/python
```

## Quick Start (Async)

```python
import asyncio
from formbridge import FormBridgeClient, Actor

async def main():
    async with FormBridgeClient(
        url="http://localhost:3000",
        api_key="your-api-key",
    ) as client:
        # Create a submission with initial fields
        sub = await client.create_submission(
            "vendor-onboarding",
            fields={"company_name": "Acme Corp"},
            actor=Actor(kind="agent", id="agent-1", name="Onboarding Bot"),
        )
        print(f"Created: {sub.submission_id}, state={sub.state}")
        print(f"Missing fields: {sub.missing_fields}")

        # Add more fields (resume_token rotates on each call)
        result = await client.set_fields(
            sub.intake_id,
            sub.submission_id,
            sub.resume_token,
            {"contact_email": "alice@acme.com", "phone": "+1-555-0100"},
        )
        print(f"Updated: state={result.state}, missing={result.missing_fields}")

        # Submit when all fields are filled
        final = await client.submit(
            sub.intake_id,
            sub.submission_id,
            result.resume_token,
        )
        print(f"Submitted: state={final.state}")

        # Retrieve a submission
        fetched = await client.get_submission(sub.intake_id, sub.submission_id)
        print(f"Fields: {fetched.fields}")

asyncio.run(main())
```

## Quick Start (Sync)

```python
from formbridge import FormBridgeClientSync, Actor

with FormBridgeClientSync(api_key="your-api-key") as client:
    sub = client.create_submission(
        "vendor-onboarding",
        fields={"company_name": "Acme Corp"},
        actor=Actor(kind="agent", id="agent-1"),
    )
    print(f"Created: {sub.submission_id}")
```

## Configuration

| Parameter | Env Var | Default |
|-----------|---------|---------|
| `url` | `FORMBRIDGE_URL` | `http://localhost:3000` |
| `api_key` | `FORMBRIDGE_API_KEY` | — |
| `timeout` | `FORMBRIDGE_TIMEOUT` | `10` (seconds) |

## Error Handling

```python
from formbridge import FormBridgeClient, FormBridgeError

async with FormBridgeClient() as client:
    try:
        sub = await client.get_submission("intake-1", "sub-123")
    except FormBridgeError as e:
        if e.is_connectivity_error:
            print("Server unreachable — degrade gracefully")
        elif e.status_code == 404:
            print("Not found")
        else:
            print(f"API error: {e.error_type} — {e}")
```

## Retry Behavior

- **Retries on:** 429 (rate limited), 500, 502, 503, 504
- **Does NOT retry on:** 400, 401, 403, 404 (client errors)
- **Backoff:** 0.5s → 1.0s → 2.0s (exponential)
- **Max retries:** 3 (configurable via `max_retries`)

## License

MIT
