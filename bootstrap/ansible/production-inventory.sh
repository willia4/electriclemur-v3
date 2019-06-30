#!/usr/bin/env bash

COMMAND=$1
HOST=$2

ENVIRONMENT=$1
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"


if [[ "$COMMAND" == "--list" ]]; then
  "$DIR/../dist/ansible-hosts.js" list --environment production
fi

if [[ "$COMMAND" == "--host" ]]; then
  "$DIR/../dist/ansible-hosts.js" host "$HOST" --environment production
fi