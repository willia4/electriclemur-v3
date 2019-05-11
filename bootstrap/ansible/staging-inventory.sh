#!/usr/bin/env bash

COMMAND=$1
HOST=$2

ENVIRONMENT=$1
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

DEF="$DIR/../../environments/staging.json"
DROPLET_NAME=$(cat "$DEF" | jq -r '.dropletName')
DOCKER_NAME=$(docker info 2> /dev/null | grep '^Name: ' | sed 's/Name: //g')

if [[ "$DROPLET_NAME" != "$DOCKER_NAME" ]]; then
  echo "Droplet name $DROPLET_NAME does not match $DOCKER_NAME"
  echo "Use rdocker to set the appropriate docker context"
  echo ""
  exit 1
fi

if [[ "$COMMAND" == "--list" ]]; then
  "$DIR/../dist/ansible-hosts.js" list --environment staging
fi

if [[ "$COMMAND" == "--host" ]]; then
  "$DIR/../dist/ansible-hosts.js" host "$HOST" --environment staging
fi