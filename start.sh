#!/bin/bash
# Start the current Showrunner Studio application.
set -e

cd "$(dirname "$0")"

exec ./showrunner-studio/start.sh
