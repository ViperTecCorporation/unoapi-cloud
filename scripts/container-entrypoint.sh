#!/bin/sh
set -eu

if [ "${UNOAPI_PROCESS_ROLE:-}" = "voip" ]; then
  cd /home/u/app/voip
  exec node dist/app.js "$@"
fi

exec node /home/u/app/dist/src/cloud.js "$@"
