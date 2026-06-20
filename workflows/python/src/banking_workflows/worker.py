from __future__ import annotations

import asyncio
import dataclasses
import logging
import os

import temporalio.converter
from temporalio.client import Client, ClientConnectConfig, TLSConfig
from temporalio.worker import Worker, WorkerConfig

from banking_workflows.account_transfer_workflow import (
    TASK_QUEUE,
    AccountTransferWorkflow,
)
from banking_workflows.account_transfer_workflow_scenarios import (
    AccountTransferWorkflowScenarios,
)
from banking_workflows.activities import AccountTransferActivities


_TRUE_ENV_VALUES = {"1", "true", "yes", "on"}


def _env_enabled(name: str) -> bool:
    return os.getenv(name, "").lower() in _TRUE_ENV_VALUES


def _first_env(*names: str) -> str:
    for name in names:
        value = os.getenv(name, "")
        if value:
            return value
    return ""


def build_data_converter() -> temporalio.converter.DataConverter:
    encrypt = _env_enabled("BANKING_ENCRYPT")

    data_converter = temporalio.converter.default()
    if encrypt:
        from banking_workflows.codec import EncryptionCodec

        print("Encrypting payloads")
        data_converter = dataclasses.replace(
            data_converter, payload_codec=EncryptionCodec()
        )
    return data_converter


def build_client_connect_config(
    *, default_address: str = "127.0.0.1:7233", default_namespace: str = "default"
) -> ClientConnectConfig:
    address = os.getenv("TEMPORAL_ADDRESS", default_address)
    namespace = os.getenv("TEMPORAL_NAMESPACE", default_namespace)
    tls_cert_path = _first_env("TEMPORAL_CERT_PATH", "TEMPORAL_TLS_CLIENT_CERT_PATH")
    tls_key_path = _first_env("TEMPORAL_KEY_PATH", "TEMPORAL_TLS_CLIENT_KEY_PATH")
    api_key = os.getenv("TEMPORAL_API_KEY", "")

    kwargs: ClientConnectConfig = {
        "target_host": address,
        "namespace": namespace,
        "data_converter": build_data_converter(),
    }

    # Prefer API key auth
    if api_key:
        print(f"Using API key auth ({api_key[:4]}...{api_key[-4:]})")
        print(f"  Address:   {address}")
        print(f"  Namespace: {namespace}")
        kwargs["api_key"] = api_key
        kwargs["tls"] = True
    # Fallback to mTLS
    elif tls_cert_path and tls_key_path:
        print("Using mTLS auth")
        print(f"  Address:   {address}")
        print(f"  Namespace: {namespace}")
        print(f"  Cert:      {tls_cert_path}")
        print(f"  Key:       {tls_key_path}")
        with open(tls_cert_path, "rb") as f:
            cert = f.read()
        with open(tls_key_path, "rb") as f:
            key = f.read()
        kwargs["tls"] = TLSConfig(client_cert=cert, client_private_key=key)

    return kwargs


def build_worker_config() -> WorkerConfig:
    task_queue = os.getenv("TEMPORAL_TASK_QUEUE") or TASK_QUEUE
    activities = AccountTransferActivities()

    return {
        "task_queue": task_queue,
        "workflows": [AccountTransferWorkflow, AccountTransferWorkflowScenarios],
        "activities": [
            activities.validate,
            activities.withdraw,
            activities.deposit,
            activities.sendNotification,
            activities.undoWithdraw,
            activities.registerApproval,
            activities.removeApproval,
        ],
    }


async def build_client() -> Client:
    return await Client.connect(**build_client_connect_config())


async def run_worker(client: Client | None = None) -> None:
    if client is None:
        client = await build_client()

    worker_config = build_worker_config()
    worker = Worker(client, **worker_config)
    print(f"Worker started, listening on task queue: {worker_config['task_queue']}")
    await worker.run()


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(filename)s:%(lineno)s | %(message)s",
    )
    asyncio.run(run_worker())


if __name__ == "__main__":
    main()
