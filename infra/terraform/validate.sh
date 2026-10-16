#!/bin/sh
# Validates every module and environment without touching AWS (no backend, no credentials).
# Local (Docker), from the repo root:
#   docker run --rm -v "$PWD/infra/terraform:/work" -w /work --entrypoint sh \
#     hashicorp/terraform:1.16.4 validate.sh
set -eu

export TF_PLUGIN_CACHE_DIR="${TF_PLUGIN_CACHE_DIR:-/tmp/tf-plugin-cache}"
export TF_IN_AUTOMATION=1
mkdir -p "$TF_PLUGIN_CACHE_DIR"

terraform fmt -check -recursive

for dir in modules/* envs/*; do
  echo "==> $dir"
  terraform -chdir="$dir" init -backend=false -input=false -no-color >/dev/null
  terraform -chdir="$dir" validate -no-color
done
