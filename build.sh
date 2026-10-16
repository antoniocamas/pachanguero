#!/bin/bash
# Build the pachanguero image and optionally push it to the k3s registry on erebor.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REGISTRY="192.168.1.87:30500"
IMAGE_NAME="pachanguero"
PUSH="false"

usage() {
    echo "Usage: $0 [--push] [--registry HOST:PORT]"
    echo ""
    echo "Builds ${IMAGE_NAME}:<version> and ${IMAGE_NAME}:latest from the Dockerfile."
    echo "<version> is read from package.json."
    echo ""
    echo "Options:"
    echo "  --push          Push both tags to the registry after building"
    echo "  --registry URL  Override the registry (default: $REGISTRY)"
    echo "  -h, --help      Show this help"
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --push) PUSH="true"; shift ;;
        --registry) REGISTRY="$2"; shift 2 ;;
        -h|--help) usage; exit 0 ;;
        *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
    esac
done

VERSION=$(grep -E '"version"\s*:' "$SCRIPT_DIR/package.json" | head -1 | sed 's/.*"\([0-9]*\.[0-9]*\.[0-9]*\)".*/\1/')
if [[ -z "$VERSION" ]]; then
    echo "ERROR: version not found in package.json" >&2
    exit 1
fi

echo "=========================================="
echo "Building: ${IMAGE_NAME}"
echo "Version:  ${VERSION}"
echo "=========================================="

DOCKER_BUILDKIT=1 docker build -t "${IMAGE_NAME}:${VERSION}" "$SCRIPT_DIR"

docker tag "${IMAGE_NAME}:${VERSION}" "${IMAGE_NAME}:latest"
docker tag "${IMAGE_NAME}:${VERSION}" "${REGISTRY}/${IMAGE_NAME}:${VERSION}"
docker tag "${IMAGE_NAME}:${VERSION}" "${REGISTRY}/${IMAGE_NAME}:latest"
echo "Built: ${IMAGE_NAME}:${VERSION}, ${IMAGE_NAME}:latest"

if [[ "$PUSH" == "true" ]]; then
    echo ""
    echo "Pushing to ${REGISTRY}..."
    docker push "${REGISTRY}/${IMAGE_NAME}:${VERSION}"
    docker push "${REGISTRY}/${IMAGE_NAME}:latest"
    echo "Pushed: ${REGISTRY}/${IMAGE_NAME}:${VERSION}"
fi
