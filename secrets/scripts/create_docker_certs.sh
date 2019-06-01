#!/bin/bash

CERT_PATH=$1
CERT_HOST=$2
CERT_PUBLIC_IP=$3

READLINK=$(which greadlink)
if [[ $? != "0" ]]; then
    READLINK=$(which readlink)
fi

function log_error {
    local RED_CODE="\033[1;31m"
    local NORMAL_CODE="\033[0m"

    local TEXT=$1
    >&2 printf "${RED_CODE}${TEXT}${NORMAL_CODE}\n"
}

function log_success {
    local GREEN_CODE="\033[1;32m"
    local NORMAL_CODE="\033[0m"

    local TEXT=$1
    printf "${GREEN_CODE}${TEXT}${NORMAL_CODE}\n"
}

function log_info {
    local GREEN_CODE="\033[1;32m"
    local NORMAL_CODE="\033[0m"

    local TEXT=$1
    printf "${GREEN_CODE}${TEXT}${NORMAL_CODE}\n"
}

if [[ -z "$CERT_PATH" ]]; then
    log_error "The first argument to this script must be a path"
    exit 2
fi

if [[ -z "$CERT_HOST" ]]; then
    log_error "The second argument to this script must be a docker host name"
    exit 3
fi

CA_PATH=$("$READLINK" -f "$CERT_PATH")
CERT_PATH=$("$READLINK" -f "$CERT_PATH/$CERT_HOST")

if [[ -d "$CERT_PATH" ]]; then
    #this certainly isn't scary at all
    rm -rf "$CERT_PATH"
fi 

if [[ ! -d "$CERT_PATH" ]]; then
    log_info "Trying to create $CERT_PATH"
    mkdir -p "$CERT_PATH"

    if [[ $? -ne 0 ]]; then
        log_error "The path '$CERT_PATH' does not exist or is not a directory and could not be created"
        exit 4
    fi
fi 

CA_EXISTS=0
if [[ -f "$CA_PATH/ca-key.pem" ]]; then
    CA_EXISTS=1
fi 

#####################################################################
log_info "Validating CA infrastructure"

PASSWORD_FILE="$CA_PATH/password.txt"
if [[ ! -f "$PASSWORD_FILE" ]]; then
    log_info "Generating password into $PASSWORD_FILE"
    CERT_PASSWORD="$(openssl rand 32 | shasum -a 256 -b | sed 's/ \*-//g')"
    echo $CERT_PASSWORD > "$PASSWORD_FILE"
fi 

if [[ "$CA_EXISTS" -eq "0" ]]; then
    log_info "The CA does not yet exist; creating it"

    log_info "Creating CA private key"
    openssl genrsa -aes256 -passout "file:$PASSWORD_FILE" -out "$CA_PATH/ca-key.pem" 4096

    log_info "Generating self-signed CA cert for $CERT_HOST"
    CERT_SUBJECT="/C=US/ST=SC/L=Charleston/O=electriclemur.com/CN=$CERT_HOST"
    openssl req -new -x509 -days 4000 -key "$CA_PATH/ca-key.pem" -passin "file:$PASSWORD_FILE" -sha256 -out "$CA_PATH/ca.pem" -subj "$CERT_SUBJECT"
else 
    log_info "The CA already exists at $CA_PATH/ca-key.pem"
fi

#####################################################################
log_info "Generating server cert private key"
openssl genrsa -passout "file:$PASSWORD_FILE" -out "$CERT_PATH/server-key.pem" 4096

#####################################################################
log_info "Generating server signing request for $CERT_HOST"
openssl req -subj "/CN=$CERT_HOST" -sha256 -new -key "$CERT_PATH/server-key.pem" -passin "file:$PASSWORD_FILE" -out "$CERT_PATH/server.csr"

#####################################################################
log_info "Signing server certificate with CA"

log_info "\tSigning for DNS:$CERT_HOST"
ALT_NAME="DNS:$CERT_HOST"

if [[ ! -z $CERT_PUBLIC_IP ]]; then
    log_info "\tSigning for IP:$CERT_PUBLIC_IP"
    ALT_NAME="${ALT_NAME},IP:$CERT_PUBLIC_IP"
fi

log_info "\tSigning for IP:127.0.0.1"
ALT_NAME="${ALT_NAME},IP:127.0.0.0.1"

echo "subjectAltName = $ALT_NAME" >> "$CERT_PATH/extfile.cnf"
echo "extendedKeyUsage = serverAuth" >> "$CERT_PATH/extfile.cnf"

openssl x509 -req -days 4000 -sha256 -in "$CERT_PATH/server.csr" \
    -CA "$CA_PATH/ca.pem" -CAkey "$CA_PATH/ca-key.pem" -CAcreateserial \
    -extfile "$CERT_PATH/extfile.cnf" -passin "file:$PASSWORD_FILE" \
    -out "$CERT_PATH/server-cert.pem"
    
#####################################################################
CLIENT_PATH="$CERT_PATH/client"
mkdir -p "$CLIENT_PATH"

log_info "Creating client private key"
openssl genrsa -out "$CLIENT_PATH/key.pem" 4096

#####################################################################
log_info "Creating client signing request"
openssl req -subj '/CN=client' -new -key "$CLIENT_PATH/key.pem" -out "$CLIENT_PATH/client.csr"

#####################################################################
log_info "Signing the client private key"
echo "extendedKeyUsage = clientAuth" >> "$CLIENT_PATH/extfile.cnf"

openssl x509 -req -days 4000 -sha256 -in "$CLIENT_PATH/client.csr" \
    -CA "$CA_PATH/ca.pem" -CAkey "$CA_PATH/ca-key.pem" -CAcreateserial \
    -extfile "$CLIENT_PATH/extfile.cnf" -passin "file:$PASSWORD_FILE" -out "$CLIENT_PATH/cert.pem" 
    
#####################################################################
log_info "Copying CA certificate to client"
cp "$CA_PATH/ca.pem" "$CLIENT_PATH/ca.pem"

#####################################################################
log_info "Generating source script"
SOURCE_SCRIPT_PATH="$CERT_PATH/source_me.sh"

DOCKER_ADDRESS="$CERT_HOST"
if [[ ! -z $CERT_PUBLIC_IP ]]; then
    DOCKER_ADDRESS="$CERT_PUBLIC_IP"
fi 

echo "" > "$SOURCE_SCRIPT_PATH"

echo "#!/bin/bash" >> "$SOURCE_SCRIPT_PATH"
echo "### Source this script to load docker variables for talking to $CERT_HOST" >> "$SOURCE_SCRIPT_PATH"

echo "export DOCKER_CERT_PATH=\"$CLIENT_PATH\"" >> "$SOURCE_SCRIPT_PATH"
echo "export DOCKER_HOST=tcp://$DOCKER_ADDRESS:2376" >> "$SOURCE_SCRIPT_PATH"
echo "export DOCKER_TLS_VERIFY=1" >> "$SOURCE_SCRIPT_PATH"