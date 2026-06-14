#!/usr/bin/env bash
#
# Build, push, and roll out the Banking app demo.

set -euo pipefail

REGION="${AWS_REGION:-us-west-1}"
ACCOUNT="${AWS_ACCOUNT_ID:-429214323166}"
NAMESPACE="${K8S_NAMESPACE:-temporal-banking-app}"
APP_REPO="${APP_ECR_REPOSITORY:-temporal-banking-app}"
FRONTEND_REPO="${FRONTEND_ECR_REPOSITORY:-temporal-banking-app-frontend}"
TEMPORAL_SECRET_NAME="${TEMPORAL_SECRET_NAME:-banking-app-secrets}"
TEMPORAL_CLOUD_NAMESPACE="${TEMPORAL_CLOUD_NAMESPACE:-${TEMPORAL_NAMESPACE:-demo-banking-app.a2dd6}}"
TEMPORAL_ADDRESS_VALUE="${TEMPORAL_ADDRESS:-${TEMPORAL_ENDPOINT:-${TEMPORAL_CLOUD_NAMESPACE}.tmprl.cloud:7233}}"
TEMPORAL_TASK_QUEUE_VALUE="${TEMPORAL_TASK_QUEUE:-MoneyTransfer}"
TAG="${IMAGE_TAG:-$(date +%Y%m%d-%H%M%S)}"
BUILD_IMAGES="${BUILD_IMAGES:-1}"

REGISTRY="${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com"
APP_IMAGE="${REGISTRY}/${APP_REPO}"
FRONTEND_IMAGE="${REGISTRY}/${FRONTEND_REPO}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

cd "${ROOT}"

ensure_ecr_repo() {
  local repo="$1"
  if ! aws ecr describe-repositories --region "${REGION}" --repository-names "${repo}" >/dev/null 2>&1; then
    aws ecr create-repository --region "${REGION}" --repository-name "${repo}" >/dev/null
  fi
}

apply_configmap() {
  kubectl create configmap banking-app-config \
    --namespace "${NAMESPACE}" \
    --from-literal=BANKING_RELOAD=0 \
    --from-literal=BANKING_BACKEND_URL=http://backend:8000 \
    --from-literal=TEMPORAL_ADDRESS="${TEMPORAL_ADDRESS_VALUE}" \
    --from-literal=TEMPORAL_NAMESPACE="${TEMPORAL_CLOUD_NAMESPACE}" \
    --from-literal=TEMPORAL_TASK_QUEUE="${TEMPORAL_TASK_QUEUE_VALUE}" \
    --dry-run=client \
    --output yaml \
    | kubectl apply -f -
}

apply_temporal_secret() {
  if [[ -z "${TEMPORAL_API_KEY:-}" ]]; then
    echo "TEMPORAL_API_KEY is required" >&2
    exit 1
  fi

  kubectl create secret generic "${TEMPORAL_SECRET_NAME}" \
    --namespace "${NAMESPACE}" \
    --from-literal=TEMPORAL_API_KEY="${TEMPORAL_API_KEY}" \
    --dry-run=client \
    --output yaml \
    | kubectl apply -f -
}

if [[ "${BUILD_IMAGES}" == "1" ]]; then
  ensure_ecr_repo "${APP_REPO}"
  ensure_ecr_repo "${FRONTEND_REPO}"

  aws ecr get-login-password --region "${REGION}" \
    | docker login --username AWS --password-stdin "${REGISTRY}"

  docker buildx build --platform linux/amd64 \
    -f docker/backend.Dockerfile \
    -t "${APP_IMAGE}:${TAG}" \
    -t "${APP_IMAGE}:latest" \
    --push .

  docker buildx build --platform linux/amd64 \
    -f docker/frontend.Dockerfile \
    -t "${FRONTEND_IMAGE}:${TAG}" \
    -t "${FRONTEND_IMAGE}:latest" \
    --push .
fi

kubectl apply -f deploy/k8s/namespace.yaml
apply_temporal_secret
apply_configmap
kubectl apply -f deploy/k8s/service.yaml
kubectl apply -f deploy/k8s/certificate.yaml
kubectl apply -f deploy/k8s/deployment.yaml
kubectl apply -f deploy/k8s/ingressroute.yaml

kubectl set image deployment/banking-app-backend backend="${APP_IMAGE}:${TAG}" -n "${NAMESPACE}"
kubectl set image deployment/banking-app-worker-python worker="${APP_IMAGE}:${TAG}" -n "${NAMESPACE}"
kubectl set image deployment/banking-app-frontend frontend="${FRONTEND_IMAGE}:${TAG}" -n "${NAMESPACE}"

kubectl rollout status deployment/banking-app-backend -n "${NAMESPACE}" --timeout=300s
kubectl rollout status deployment/banking-app-worker-python -n "${NAMESPACE}" --timeout=300s
kubectl rollout status deployment/banking-app-frontend -n "${NAMESPACE}" --timeout=300s

echo "Deployed ${TAG}"
echo "https://banking-app.tmprl-demo.cloud"
echo "Temporal namespace: ${TEMPORAL_CLOUD_NAMESPACE}"
