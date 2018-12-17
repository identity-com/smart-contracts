#!/usr/bin/env bash
STAGE=$1
# S3 bucket name where contract artifacts are stored.
BUCKET=marketplace-contract-artifacts

echo "Uploading contract artifacts to ${BUCKET} for ${STAGE} stage"
aws s3 sync artifacts/deployed/ s3://${BUCKET}/${STAGE}/ > /dev/stdout 2>&1
