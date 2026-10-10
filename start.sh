#!/bin/bash
# Start Texel Studio.
set -e

cd "$(dirname "$0")"

exec ./showrunner-studio/start.sh
