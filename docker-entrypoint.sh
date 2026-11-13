#!/bin/sh
# Merilo container entrypoint.
#
# Fly volumes are created root-owned, while the application runs as uid 10001.
# The entrypoint therefore starts as root for exactly two operations — fixing
# ownership of the mounted data directory and dropping privileges — and then
# execs the application, so the FastAPI process itself never runs as root.
#
# Without a mounted volume (plain `docker run`) this is a no-op and the
# container behaves exactly like before.
set -eu

if [ -d /data ]; then
    chown -R 10001:10001 /data 2>/dev/null || true
fi

# setpriv is not guaranteed in python:3.12-slim, so drop privileges with the
# interpreter that is already in the image. sys.argv[1:] is the image CMD.
exec python -c '
import os, sys
os.setgroups([])
os.setgid(10001)
os.setuid(10001)
os.execvp(sys.argv[1], sys.argv[1:])
' "$@"
