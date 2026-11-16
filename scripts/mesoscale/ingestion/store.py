"""Mesoscale ingest store responsibilities."""

from __future__ import annotations

import hashlib
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol


@dataclass(frozen=True)
class R2Credentials:
    account_id: str
    bucket: str
    access_key: str
    secret_key: str


@dataclass(frozen=True)
class ObjectCheck:
    size: int
    md5: str


class Store(Protocol):
    def put(self, key: str, data: bytes, content_type: str) -> str | None: ...
    def put_immutable(self, key: str, data: bytes, content_type: str) -> str | None: ...
    def get(self, key: str) -> bytes | None: ...
    def head(self, key: str) -> dict | None: ...
    def list(self, prefix: str) -> list[str]: ...
    def delete(self, key: str) -> None: ...
    def verify_sizes(self, expected: dict[str, int]) -> None: ...
    def verify_archives(self, expected: dict[str, ObjectCheck]) -> None: ...

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

    def put_immutable(self, key: str, data: bytes, content_type: str) -> str:
        path = self._path(key)
        if path.exists():
            return hashlib.md5(path.read_bytes(), usedforsecurity=False).hexdigest()
        return self.put(key, data, content_type)

    def get(self, key: str) -> bytes | None:
        path = self._path(key)
        return path.read_bytes() if path.is_file() else None

    def head(self, key: str) -> dict | None:
        path = self._path(key)
        return {"ContentLength": path.stat().st_size} if path.is_file() else None

    def list(self, prefix: str) -> list[str]:
        base = self._path(prefix)
        if base.is_file():
            return [prefix]
        if not base.exists():
            return []
        resolved_root = self.root.resolve()
        return [p.relative_to(resolved_root).as_posix() for p in base.rglob("*") if p.is_file()]

    def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)

    def verify_sizes(self, expected: dict[str, int]) -> None:
        for key, size in expected.items():
            path = self._path(key)
            if not path.is_file() or path.stat().st_size != size:
                raise IOError(f"stored object verification failed: {key}")

    def verify_archives(self, expected: dict[str, ObjectCheck]) -> None:
        for key, check in expected.items():
            content = self._path(key).read_bytes()
            digest = hashlib.md5(content, usedforsecurity=False).hexdigest()
            if len(content) != check.size or digest != check.md5:
                raise IOError(f"stored archive verification failed: {key}")

class R2Store:
    """Cloudflare R2 adapter using boto3's S3-compatible API."""
    def __init__(self, credentials: R2Credentials):
        import boto3
        self.bucket = credentials.bucket
        self.client = boto3.client("s3", endpoint_url=f"https://{credentials.account_id}.r2.cloudflarestorage.com", aws_access_key_id=credentials.access_key, aws_secret_access_key=credentials.secret_key, region_name="auto")

    def put(self, key: str, data: bytes, content_type: str) -> str | None:
        response = self.client.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=content_type)
        return response.get("ETag", "").strip('"') or None

    def put_immutable(self, key: str, data: bytes, content_type: str) -> str | None:
        try:
            response = self.client.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=content_type, IfNoneMatch="*")
            return response.get("ETag", "").strip('"') or None
        except Exception as error:
            if not is_precondition_failed(error):
                raise
            existing = self.head(key)
            if not existing:
                raise
            return existing.get("ETag", "").strip('"') or None

    def get(self, key: str) -> bytes | None:
        from botocore.exceptions import ClientError
        try:
            return self.client.get_object(Bucket=self.bucket, Key=key)["Body"].read()
        except ClientError as error:
            if is_missing_object(error):
                return None
            raise

    def head(self, key: str) -> dict | None:
        from botocore.exceptions import ClientError
        try:
            return self.client.head_object(Bucket=self.bucket, Key=key)
        except ClientError as error:
            if is_missing_object(error):
                return None
            raise

    def list(self, prefix: str) -> list[str]:
        paginator = self.client.get_paginator("list_objects_v2")
        return [obj["Key"] for page in paginator.paginate(Bucket=self.bucket, Prefix=prefix) for obj in page.get("Contents", [])]

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=key)

    def verify_sizes(self, expected: dict[str, int]) -> None:
        if not expected:
            return
        prefix = shared_tile_prefix(expected)
        found = self.list_sizes(prefix)
        missing = missing_size_keys(expected, found)
        if missing:
            raise IOError(f"stored object verification failed: {missing[0]}")

    def verify_archives(self, expected: dict[str, ObjectCheck]) -> None:
        if not expected:
            return
        found = self.list_archive_checks(shared_archive_prefix(expected))
        for key, check in expected.items():
            if found.get(key) != check:
                raise IOError(f"stored archive verification failed: {key}")


    def list_sizes(self, prefix: str) -> dict[str, int]:
        paginator = self.client.get_paginator("list_objects_v2")
        found = {}
        for page in paginator.paginate(Bucket=self.bucket, Prefix=prefix):
            found.update({obj["Key"]: obj["Size"] for obj in page.get("Contents", [])})
        return found

    def list_archive_checks(self, prefix: str) -> dict[str, ObjectCheck]:
        paginator = self.client.get_paginator("list_objects_v2")
        found = {}
        for page in paginator.paginate(Bucket=self.bucket, Prefix=prefix):
            for obj in page.get("Contents", []):
                found[obj["Key"]] = ObjectCheck(obj["Size"], obj.get("ETag", "").strip('"').lower())
        return found


def is_missing_object(error: Exception) -> bool:
    response = getattr(error, "response", {})
    code = response.get("Error", {}).get("Code")
    status = response.get("ResponseMetadata", {}).get("HTTPStatusCode")
    if code == "NoSuchBucket":
        return False
    return code in {"NoSuchKey", "NotFound", "404"} or status == 404


def is_precondition_failed(error: Exception) -> bool:
    response = getattr(error, "response", {})
    code = response.get("Error", {}).get("Code")
    status = response.get("ResponseMetadata", {}).get("HTTPStatusCode")
    return code == "PreconditionFailed" or status == 412


def shared_tile_prefix(expected: dict[str, int]) -> str:
    prefixes = {"/".join(key.split("/")[:6]) + "/" for key in expected}
    if len(prefixes) != 1:
        raise ValueError("tile verification requires a shared cycle prefix")
    return next(iter(prefixes))


def missing_size_keys(expected: dict[str, int], found: dict[str, int]) -> list[str]:
    return [key for key, size in expected.items() if found.get(key) != size]


def shared_archive_prefix(expected: dict[str, ObjectCheck]) -> str:
    prefixes = {"/".join(key.split("/")[:5]) + "/" for key in expected}
    if len(prefixes) != 1:
        raise ValueError("archive verification requires a shared model/cycle prefix")
    return next(iter(prefixes))
