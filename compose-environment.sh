#!/usr/bin/env bash

FILE=$1
ENVIRONMENT=$2

if [[ ! -f "$FILE" ]]; then
  echo "USAGE: compose-environment.sh COMPOSE-FILE ENVIRONMENT-NAME"
  echo "ERROR: COMPOSE-FILE \"$FILE\" does not exist"
  exit 1
fi

if [[ -z "$ENVIRONMENT" ]]; then
  echo "USAGE: compose-environment.sh COMPOSE-FILE ENVIRONMENT-NAME"
  echo "ERROR: ENVIRONMENT-NAME not set"
  exit 2
fi

# convert environment to upper case
ENVIRONMENT=$(echo "$ENVIRONMENT" | awk '{print tolower($0)}')

if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "prod" ]]; then
  echo "USAGE: compose-environment.sh COMPOSE-FILE ENVIRONMENT-NAME"
  echo "ERROR: ENVIRONMENT-NAME must be one of (\"staging\", \"prod\")"
  echo "ERROR: ENVIRONMENT-NAME was \"$ENVIRONMENT\" "
  exit 3
fi

DOCKER_NAME=$(docker info 2> /dev/null | grep 'Name:' | sed 's/Name: //g')

echo "Composing $FILE for $ENVIRONMENT environment"
echo "to $DOCKER_NAME"

# Read the compose file into a variable
COMPOSE=$(cat "$FILE")

# Update the compose variable by replacing %%ENVIRONMENT%% tokens with the environment name
COMPOSE=$(echo "$COMPOSE" | sed "s/%%ENVIRONMENT%%/$ENVIRONMENT/g")

# read the environment-url-map.json file and find the $ENVIRONMENT section, which will be an array
# then, for each key-value-pair in the environment array, build a sed command to replace a specific url descriptor
#       with a specific url value (this is all done with the `jq` command, obviously)
# then, iterate over the output of the jq command (which will be a new-line separated list of sed commands) and 
# apply the sed command to the compose variable.
#
# Unfortunately, the sed command has spaces in it (separating the sed command from the argument)
# see https://www.cyberciti.biz/tips/handling-filenames-with-spaces-in-bash.html
# use the IFS variable to let us treat each sed line as one 
SAVEIFS=$IFS
IFS=$(echo -en "\n\b")
 for SED in $(cat environment-url-map.json | jq -r ".$ENVIRONMENT[] | \"s/\" + .key + \"/\" + .value + \"/g\" ") 
 do
  COMPOSE=$(echo "$COMPOSE" | sed "$SED")
 done
IFS=$SAVEIFS


echo "$COMPOSE" | docker-compose -f - up -d
# cat "$FILE" | sed "s/%%ENVIRONMENT%%/$ENVIRONMENT/g"