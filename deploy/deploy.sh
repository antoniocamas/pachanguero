#!/bin/bash
# Install or upgrade pachanguero on erebor (namespace pachanguero) with Helm.
# Usage: deploy/deploy.sh [--tag VERSION] [--restart]
#   --tag      image tag to deploy (default: the chart's appVersion)
#   --restart  roll the pod even if nothing changed (pulls a re-pushed image)
# KUBE_CONTEXT selects the cluster (default: erebor).
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHART_DIR="$SCRIPT_DIR/helm/pachanguero"
SECRETS_FILE="$CHART_DIR/values.secrets.yaml"
CONTEXT="${KUBE_CONTEXT:-erebor}"
NAMESPACE="pachanguero"

HELM_ARGS=()
RESTART="false"
while [[ $# -gt 0 ]]; do
    case "$1" in
        --tag) HELM_ARGS+=(--set "image.tag=$2"); shift 2 ;;
        --restart) RESTART="true"; shift ;;
        -h|--help) sed -n '2,6p' "$0"; exit 0 ;;
        *) echo "Unknown option: $1" >&2; exit 1 ;;
    esac
done

command -v helm >/dev/null || { echo "Error: helm is not installed" >&2; exit 1; }
[[ -f "$SECRETS_FILE" ]] || { echo "Error: $SECRETS_FILE missing; copy values.secrets.yaml.example" >&2; exit 1; }

helm upgrade --install pachanguero "$CHART_DIR" \
    --kube-context "$CONTEXT" \
    --namespace "$NAMESPACE" --create-namespace \
    -f "$SECRETS_FILE" \
    "${HELM_ARGS[@]}" \
    --wait

if [[ "$RESTART" == "true" ]]; then
    kubectl --context "$CONTEXT" -n "$NAMESPACE" rollout restart deploy/pachanguero
    kubectl --context "$CONTEXT" -n "$NAMESPACE" rollout status deploy/pachanguero
fi
