#!/bin/bash

CERT_DIR=$1
CERT_FQDN=$2
CERT_PUBLIC_IP=$3

READLINK=$(which greadlink)
if [[ $? != "0" ]]; then
    READLINK=$(which readlink)
fi

CERT_DIR=$("$READLINK" -f "$CERT_DIR")

function getSubjectCN() {
    local CERT_FILE=$1
    
    openssl x509 -in "$CERT_FILE" -noout -subject | sed 's/.*CN = \(.*\)$/\1/g'
}

function getIssuerCN() {
    local CERT_FILE=$1
    
    openssl x509 -in "$CERT_FILE" -noout -issuer | sed 's/.*CN = \(.*\)$/\1/g'
}

function getSubjectAlternateNameDNS() {
    local CERT_FILE=$1

    SAN=$(openssl x509 -in "$CERT_FILE"  -text -noout -certopt no_subject,no_header,no_version,no_serial,no_signame,no_validity,no_issuer,no_pubkey,no_sigdump,no_aux | grep 'DNS')

    echo $(echo "$SAN" | sed 's/,//' | awk '{print $1}' | sed 's/DNS://g')
}

function getSubjectAlternateNameIP() {
    local CERT_FILE=$1

    SAN=$(openssl x509 -in "$CERT_FILE"  -text -noout -certopt no_subject,no_header,no_version,no_serial,no_signame,no_validity,no_issuer,no_pubkey,no_sigdump,no_aux | grep 'DNS')

    echo $(echo "$SAN" | sed 's/,//g' | awk '{print $3}' | sed 's/Address://g')
}

# validate that the CA is self-signing for this FQDN
CA_PEM="$CERT_DIR/ca.pem"
if [[ ! -f "$CA_PEM" ]]; then
    echo "ca.pem: $CA_PEM does not exist"
    exit 1
fi

if [[ $(getSubjectCN "$CA_PEM") != "$CERT_FQDN" ]]; then
    echo "ca.pem: subject '$(getSubjectCN "$CA_PEM")' does not match '$CERT_FQDN'"
    exit 1
fi

if [[ $(getIssuerCN "$CA_PEM") != "$CERT_FQDN" ]]; then
    echo "ca.pem: subject '$(getIssuerCN "$CA_PEM")' does not match '$CERT_FQDN'"
    exit 1
fi

# validate that the signing-cert
SIGNING_CERT="$CERT_DIR/$CERT_FQDN/server-cert.pem"
if [[ ! -f "$SIGNING_CERT" ]]; then
    echo "server-cert.pem: $SIGNING_CERT does not exist"
    exit 1
fi

if [[ $(getSubjectCN "$SIGNING_CERT") != "$CERT_FQDN" ]]; then
    echo "server-cert.pem: subject '$(getSubjectCN "$SIGNING_CERT")' does not match '$CERT_FQDN'"
    exit 1
fi

if [[ $(getIssuerCN "$SIGNING_CERT") != "$CERT_FQDN" ]]; then
    echo "server-cert.pem: subject '$(getIssuerCN "$SIGNING_CERT")' does not match '$CERT_FQDN'"
    exit 1
fi

if [[ $(getSubjectAlternateNameIP "$SIGNING_CERT") != "$CERT_PUBLIC_IP" ]]; then
    echo "server-cert.pem: subject '$(getSubjectAlternateNameIP "$SIGNING_CERT")' does not match '$CERT_PUBLIC_IP'"
    exit 1
fi

# validate the client cert
CLIENT_CERT="$CERT_DIR/$CERT_FQDN/client/cert.pem"
if [[ ! -f "$CLIENT_CERT" ]]; then
    echo "client/cert.pem: $CLIENT_CERT does not exist"
    exit 1
fi

if [[ $(getSubjectCN "$CLIENT_CERT") != "client" ]]; then
    echo "client/cert.pem: subject '$(getSubjectCN "$CLIENT_CERT")' does not match 'client'"
    exit 1
fi

if [[ $(getIssuerCN "$CLIENT_CERT") != "$CERT_FQDN" ]]; then
    echo "client/cert.pem: subject '$(getIssuerCN "$CLIENT_CERT")' does not match '$CERT_FQDN'"
    exit 1
fi

exit 0