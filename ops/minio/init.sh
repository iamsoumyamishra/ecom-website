#!/bin/sh
set -eu
mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
mc mb --ignore-existing "local/$STORAGE_BUCKET"
sed "s/BUCKET_NAME/$STORAGE_BUCKET/g" /public-images-policy.json > /tmp/public-images-policy.json
mc anonymous set-json /tmp/public-images-policy.json "local/$STORAGE_BUCKET"
