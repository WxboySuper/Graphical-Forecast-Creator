"""Mesoscale ingest store responsibilities."""

from __future__ import annotations

import argparse, hashlib, json, math, os, re, tempfile, time, urllib.error, urllib.request
from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Protocol
import hashlib

from inventory import IndexRecord, parse_idx, resolve_ranges


@dataclass(frozen=True)
class R2Credentials:
    account_id: str
    bucket: str
    access_key: str
    secret_key: str
class Store(Protocol):
    def put(self, key: str, data: bytes, content_type: str) -> str | None: ...
    def get(self, key: str) -> bytes | None: ...
    def list(self, prefix: str) -> list[str]: ...
    def delete(self, key: str) -> None: ...

class LocalStore:
    def __init__(self, root: Path):
        self.root = root

    def _path(self, key: str) -> Path:
        path = (self.root / key).resolve()
        if not path.is_relative_to(self.root.resolve()):
            raise ValueError("storage key escapes root")
        return path

    def put(self, key: str, data: bytes, content_type: str) -> str:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, temporary = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.")
        try:
            with os.fdopen(fd, "wb") as out:
                out.write(data)
                out.flush()
                os.fsync(out.fileno())
            os.replace(temporary, path)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
        return hashlib.md5(data, usedforsecurity=False).hexdigest()

    def get(self, key: str) -> bytes | None:
        path = self._path(key)
        return path.read_bytes() if path.is_file() else None

    def list(self, prefix: str) -> list[str]:
        base = self._path(prefix)
        if base.is_file():
            return [prefix]
        if not base.exists():
            return []
        return [p.relative_to(self.root).as_posix() for p in base.rglob("*") if p.is_file()]

    def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)

    def verify_sizes(self, expected: dict[str, int]) -> None:
        for key, size in expected.items():
            path = self._path(key)
            if not path.is_file() or path.stat().st_size != size:
                raise IOError(f"stored object verification failed: {key}")

class R2Store:
    """Cloudflare R2 adapter using boto3's S3-compatible API."""
    def __init__(self, credentials: R2Credentials):
        import boto3
        self.bucket = credentials.bucket
        self.client = boto3.client("s3", endpoint_url=f"https://{credentials.account_id}.r2.cloudflarestorage.com", aws_access_key_id=credentials.access_key, aws_secret_access_key=credentials.secret_key, region_name="auto")

    def put(self, key: str, data: bytes, content_type: str) -> str | None:
        response = self.client.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=content_type)
        return response.get("ETag", "").strip('"') or None

    def get(self, key: str) -> bytes | None:
        try:
            return self.client.get_object(Bucket=self.bucket, Key=key)["Body"].read()
        except self.client.exceptions.NoSuchKey:
            return None

    def list(self, prefix: str) -> list[str]:
        paginator = self.client.get_paginator("list_objects_v2")
        return [obj["Key"] for page in paginator.paginate(Bucket=self.bucket, Prefix=prefix) for obj in page.get("Contents", [])]

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=key)

    def verify_sizes(self, expected: dict[str, int]) -> None:
        if not expected:
            return
        prefixes = {"/".join(key.split("/")[:6]) + "/" for key in expected}
        if len(prefixes) != 1:
            raise ValueError("tile verification requires a shared cycle prefix")
        found = {}
        paginator = self.client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self.bucket, Prefix=next(iter(prefixes))):
            found.update({obj["Key"]: obj["Size"] for obj in page.get("Contents", [])})
        missing = [key for key, size in expected.items() if found.get(key) != size]
        if missing:
            raise IOError(f"stored object verification failed: {missing[0]}")
