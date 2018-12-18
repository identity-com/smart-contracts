#!/usr/bin/env bash
STAGE=$1
# S3 bucket name where contract artifacts are stored.
BUCKET=marketplace-contract-artifacts

echo "Downloading contract artifacts from ${BUCKET} for ${STAGE} stage"
aws s3 sync s3://${BUCKET}/${STAGE}/ artifacts/deployed/ > /dev/stdout 2>&1
