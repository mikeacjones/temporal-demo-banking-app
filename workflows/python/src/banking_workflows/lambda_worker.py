from __future__ import annotations

import os

from temporalio.common import VersioningBehavior, WorkerDeploymentVersion
from temporalio.contrib.aws.lambda_worker import LambdaWorkerConfig, run_worker

from banking_workflows.worker import build_client_connect_config, build_worker_config

DEFAULT_DEPLOYMENT_NAME = "banking-transfer-demo"
DEFAULT_BUILD_ID = "local-dev"


def _worker_deployment_version() -> WorkerDeploymentVersion:
    return WorkerDeploymentVersion(
        deployment_name=os.getenv(
            "TEMPORAL_WORKER_DEPLOYMENT_NAME", DEFAULT_DEPLOYMENT_NAME
        ),
        build_id=(
            os.getenv("TEMPORAL_WORKER_BUILD_ID")
            or os.getenv("AWS_LAMBDA_FUNCTION_VERSION")
            or DEFAULT_BUILD_ID
        ),
    )


def _default_versioning_behavior() -> VersioningBehavior:
    raw = os.getenv("TEMPORAL_WORKER_VERSIONING_BEHAVIOR", "PINNED")
    normalized = raw.strip().upper().replace("-", "_")
    if normalized in {"AUTOUPGRADE", "AUTO_UPGRADE"}:
        return VersioningBehavior.AUTO_UPGRADE
    if normalized == "PINNED":
        return VersioningBehavior.PINNED
    raise ValueError(
        "TEMPORAL_WORKER_VERSIONING_BEHAVIOR must be PINNED or AUTO_UPGRADE"
    )


def configure(config: LambdaWorkerConfig) -> None:
    config.client_connect_config.update(
        build_client_connect_config(
            default_address=config.client_connect_config.get(
                "target_host", "127.0.0.1:7233"
            ),
            default_namespace=config.client_connect_config.get("namespace", "default"),
        )
    )
    config.worker_config.update(build_worker_config())

    deployment_config = config.worker_config.get("deployment_config")
    if deployment_config is not None:
        deployment_config.default_versioning_behavior = _default_versioning_behavior()


lambda_handler = run_worker(_worker_deployment_version(), configure)
