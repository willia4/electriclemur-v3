#!/usr/bin/env bash

ENVIRONMENT="$1"
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

READLINK=$(which greadlink)
if [[ $? != "0" ]]; then
    READLINK=$(which readlink)
fi

if [[ -z "$ENVIRONMENT" ]]; then
  echo "USAGE: make-docker-certs.sh ENVIRONMENT-NAME"
  echo "ERROR: ENVIRONMENT-NAME not set"
  exit 2
fi

# convert environment to upper case
ENVIRONMENT=$(echo "$ENVIRONMENT" | awk '{print tolower($0)}')

ENVIRONMENTFILE="$DIR/../environments/$ENVIRONMENT.json"
if [[ ! -f "$ENVIRONMENTFILE" ]]; then
  echo "USAGE: make-docker-certs.sh ENVIRONMENT-NAME"
  echo "ERROR: ENVIRONMENT-NAME \"$ENVIRONMENT\" does not exist at \"$ENVIRONMENTFILE\""
  exit 3
fi

INVENTORYSCRIPT="$DIR/dist/ansible-hosts.js"
IP=$("$INVENTORYSCRIPT" ip "$ENVIRONMENT")
FQDN=$("$INVENTORYSCRIPT" fqdn "$ENVIRONMENT")

# validate existing certs
CERT_DIR=$("$READLINK" -f "$DIR/../secrets/$ENVIRONMENT/docker_certs")
"$DIR/../secrets/scripts/validate_docker_certs.sh" "$CERT_DIR" "$FQDN" "$IP"

# if the existing certs don't validate, delete them and re-create
if [[ $? != 0 ]]; then
  echo "delete $CERT_DIR"
  rm -rf "$CERT_DIR"

  mkdir -p "$CERT_DIR"
  "$DIR/../secrets/scripts/create_docker_certs.sh" "$CERT_DIR" "$FQDN" "$IP"
fi
