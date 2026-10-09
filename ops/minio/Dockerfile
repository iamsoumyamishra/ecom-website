FROM golang:1.24.8-bookworm AS builder
ARG MINIO_RELEASE=RELEASE.2025-10-15T17-29-55Z
WORKDIR /src
RUN git clone --depth 1 --branch "$MINIO_RELEASE" https://github.com/minio/minio.git . \
    && CGO_ENABLED=0 go build -trimpath -o /out/minio .

FROM alpine:3.22
RUN apk add --no-cache ca-certificates curl \
    && addgroup -g 10001 minio \
    && adduser -D -u 10001 -G minio minio \
    && mkdir /data && chown minio:minio /data
COPY --from=builder /out/minio /usr/local/bin/minio
USER minio
EXPOSE 9000 9001
ENTRYPOINT ["/usr/local/bin/minio"]
