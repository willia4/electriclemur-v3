#!/usr/bin/env bash

ENVIRONMENT=$1
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

"$DIR/dist/bootstrapper.js" create "$ENVIRONMENT"