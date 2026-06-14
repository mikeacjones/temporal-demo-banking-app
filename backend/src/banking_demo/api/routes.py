from __future__ import annotations

import asyncio
import os
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse

from banking_demo import config
from banking_demo.api.events import emit_event, event_generator
from banking_demo.models import (
    SCENARIO_TO_WORKFLOW_TYPE,
    Settings,
    StepStatus,
    Transfer,
    TransferEvent,
    TransferRequest,
)
from banking_demo.temporal_ui import (
    temporal_namespace,
    temporal_namespace_url,
    temporal_ui_base_url,
    temporal_workflow_url,
)

app = FastAPI(title="Banking Transfer Demo API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Temporal client (lazy singleton)
# ---------------------------------------------------------------------------

_temporal_client = None


async def get_temporal_client():
    global _temporal_client
    if _temporal_client is None:
        from temporalio.client import Client, TLSConfig

        addr = os.environ.get("TEMPORAL_ADDRESS", "localhost:7233")
        namespace = os.environ.get("TEMPORAL_NAMESPACE", "default")
        api_key = os.environ.get("TEMPORAL_API_KEY", "")
        tls_cert_path = os.environ.get("TEMPORAL_CERT_PATH", "")
        tls_key_path = os.environ.get("TEMPORAL_KEY_PATH", "")

        kwargs: dict = {"target_host": addr, "namespace": namespace}

        if api_key:
            kwargs["api_key"] = api_key
            kwargs["tls"] = True
        elif tls_cert_path and tls_key_path:
            with open(tls_cert_path, "rb") as f:
                cert = f.read()
            with open(tls_key_path, "rb") as f:
                key = f.read()
            kwargs["tls"] = TLSConfig(client_cert=cert, client_private_key=key)

        _temporal_client = await Client.connect(**kwargs)
    return _temporal_client


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/temporal-ui")
async def temporal_ui():
    return {
        "base_url": temporal_ui_base_url(),
        "namespace": temporal_namespace(),
        "namespace_url": temporal_namespace_url(),
    }


# ---------------------------------------------------------------------------
# Accounts
# ---------------------------------------------------------------------------


@app.get("/api/accounts")
async def get_accounts():
    return [acct.model_dump() for acct in config.ACCOUNTS]


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------


@app.get("/api/settings")
async def get_settings():
    return config.settings.model_dump()


@app.post("/api/settings")
async def update_settings(new_settings: Settings):
    config.settings.scenario = new_settings.scenario
    config.settings.presentation_mode = new_settings.presentation_mode
    config.reset_state()
    return config.settings.model_dump()


# ---------------------------------------------------------------------------
# Transfers
# ---------------------------------------------------------------------------


@app.post("/api/transfers")
async def create_transfer(request: TransferRequest):
    transfer_id = uuid4().hex[:8]
    workflow_type = SCENARIO_TO_WORKFLOW_TYPE[config.settings.scenario]

    transfer = Transfer(
        transfer_id=transfer_id,
        from_account=request.from_account,
        to_account=request.to_account,
        amount=request.amount,
        scenario=config.settings.scenario,
        workflow_type=workflow_type,
    )
    config.transfers[transfer_id] = transfer.model_dump(mode="json")
    config.event_queues[transfer_id] = asyncio.Queue()

    client = await get_temporal_client()
    workflow_id = f"transfer-{transfer_id}"
    handle = await client.start_workflow(
        workflow_type,
        {
            "amount": request.amount,
            "fromAccount": request.from_account,
            "toAccount": request.to_account,
        },
        id=workflow_id,
        task_queue=os.environ.get("TEMPORAL_TASK_QUEUE") or "MoneyTransfer",
    )
    run_id = handle.first_execution_run_id or handle.run_id or ""

    return {
        "transfer_id": transfer_id,
        "status": "accepted",
        "workflow_id": workflow_id,
        "run_id": run_id,
        "temporal_ui_url": temporal_workflow_url(
            workflow_id=workflow_id,
            run_id=run_id,
        ),
    }


@app.get("/api/transfers/{transfer_id}")
async def get_transfer(transfer_id: str):
    transfer = config.transfers.get(transfer_id)
    if not transfer:
        raise HTTPException(status_code=404, detail="Transfer not found")
    return transfer


@app.get("/api/transfers/{transfer_id}/events")
async def transfer_events(transfer_id: str):
    if transfer_id not in config.event_queues:
        raise HTTPException(status_code=404, detail="Transfer not found")
    return EventSourceResponse(event_generator(transfer_id))


# ---------------------------------------------------------------------------
# Bank Operations (human-in-the-loop)
# ---------------------------------------------------------------------------


@app.get("/api/bank/pending-approvals")
async def get_pending_approvals():
    return list(config.pending_approvals.values())


@app.post("/api/bank/approve/{transfer_id}")
async def approve_transfer(transfer_id: str):
    if transfer_id not in config.pending_approvals:
        raise HTTPException(status_code=404, detail="No pending approval for this transfer")

    client = await get_temporal_client()
    handle = client.get_workflow_handle(f"transfer-{transfer_id}")
    await handle.signal("approveTransfer")

    config.pending_approvals.pop(transfer_id, None)

    await emit_event(
        transfer_id,
        "approval_wait",
        StepStatus.COMPLETED,
        detail="Transfer approved by bank operations",
    )

    return {"status": "approved", "transfer_id": transfer_id}


@app.post("/api/bank/deny/{transfer_id}")
async def deny_transfer(transfer_id: str):
    """Remove from pending approvals — workflow will timeout and compensate."""
    if transfer_id not in config.pending_approvals:
        raise HTTPException(status_code=404, detail="No pending approval for this transfer")

    config.pending_approvals.pop(transfer_id, None)

    await emit_event(
        transfer_id,
        "approval_wait",
        StepStatus.FAILED,
        detail="Transfer denied — will timeout and compensate",
    )

    return {"status": "denied", "transfer_id": transfer_id}


# ---------------------------------------------------------------------------
# Internal: used by external worker process
# ---------------------------------------------------------------------------


@app.post("/api/internal/events")
async def push_event(event: TransferEvent):
    """Accept SSE events from an external worker process."""
    queue = config.event_queues.get(event.transfer_id)
    if queue is None:
        if event.transfer_id in config.transfers:
            config.event_queues[event.transfer_id] = asyncio.Queue()
            queue = config.event_queues[event.transfer_id]
        else:
            return {"status": "ignored", "reason": "unknown transfer"}
    await queue.put(event.model_dump(mode="json"))
    return {"status": "accepted"}


@app.get("/api/internal/should-fail-deposit/{transfer_id}")
async def check_should_fail_deposit(transfer_id: str):
    """Check if deposit should fail for API Downtime scenario."""
    return {"should_fail": config.should_fail_deposit(transfer_id)}


@app.post("/api/internal/pending-approvals/{transfer_id}")
async def register_pending_approval(transfer_id: str, payload: dict):
    """Register a transfer as needing approval (from worker)."""
    config.pending_approvals[transfer_id] = payload
    return {"status": "accepted"}


@app.delete("/api/internal/pending-approvals/{transfer_id}")
async def remove_pending_approval(transfer_id: str):
    """Remove a pending approval (from worker)."""
    config.pending_approvals.pop(transfer_id, None)
    return {"status": "removed"}


# ---------------------------------------------------------------------------
# Reset
# ---------------------------------------------------------------------------


@app.post("/api/reset")
async def reset():
    config.reset_state()
    return {"status": "reset"}
