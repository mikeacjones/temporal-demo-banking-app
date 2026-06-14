# Banking App Kubernetes Deploy

Basic single-environment deploy for `temporal-banking-app`.

It runs:

- `banking-app-frontend` — static React build served by nginx.
- `banking-app-backend` — FastAPI API and in-memory demo state.
- `banking-app-worker-python` — Python Temporal worker on task queue `MoneyTransfer`.

The public URL is:

```text
https://banking-app.tmprl-demo.cloud
```

Deploy from the repo root:

```bash
TEMPORAL_CLOUD_NAMESPACE=demo-banking-app.a2dd6 \
TEMPORAL_ADDRESS=demo-banking-app.a2dd6.tmprl.cloud:7233 \
TEMPORAL_API_KEY=... \
./deploy/k8s/deploy.sh
```
