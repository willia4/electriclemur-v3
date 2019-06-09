#!/usr/bin/env bash

ENVIRONMENT=$1
VERBOSE=$2
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

if [[ ! -z "$VERBOSE" ]]; then
  VERBOSE="--verbose"
fi

"$DIR/dist/bootstrapper.js" create "$ENVIRONMENT" "$VERBOSE"