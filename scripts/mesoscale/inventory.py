"""Read GRIB2 .idx inventories and resolve exact message byte ranges."""

from __future__ import annotations

import argparse
import json
import re
import urllib.request
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable


@dataclass(frozen=True)
class IndexRecord:
    number: str
    offset: int
    reference_time: str
    parameter: str
    level: str
    step: str


@dataclass(frozen=True)
class ByteRange:
    start: int
    end: int

    @property
    def size(self) -> int:
        return self.end - self.start + 1


def parse_idx(text: str) -> list[IndexRecord]:
    """Parse wgrib2-style index rows; preserve parameter, level and step text."""
    records = [
        _parse_idx_row(line, line_number)
        for line_number, line in enumerate(text.splitlines(), 1)
        if line.strip()
    ]
    if not records:
        raise ValueError("The .idx inventory is empty")
    if any(a.offset > b.offset for a, b in zip(records, records[1:])):
        raise ValueError(".idx offsets must be non-decreasing")
    return records


def _parse_idx_row(line: str, line_number: int) -> IndexRecord:
    parts = line.split(":")
    if len(parts) < 6 or not parts[1].isdigit():
        raise ValueError(f"Invalid .idx row {line_number}: {line!r}")
    reference_time = re.fullmatch(r"d=(\d+)", parts[2])
    if not reference_time:
        raise ValueError(f"Invalid reference time on .idx row {line_number}")
    step = ":".join(parts[5:]).rstrip(":")
    return IndexRecord(parts[0], int(parts[1]), reference_time.group(1), parts[3], parts[4], step)


def resolve_ranges(records: Iterable[IndexRecord], file_size: int) -> list[tuple[IndexRecord, ByteRange]]:
    """Return inclusive ranges, ending each message before the next offset."""
    rows = list(records)
    result = []
    for index, record in enumerate(rows):
        next_offset = next((row.offset for row in rows[index + 1:] if row.offset > record.offset), None)
        if next_offset is not None and next_offset > file_size:
            raise ValueError(f"Invalid message offset {next_offset} for {file_size}-byte file")
        end = _inclusive_end(next_offset, file_size)
        if record.offset >= file_size or end < record.offset:
            raise ValueError(f"Invalid message range at offset {record.offset} for {file_size}-byte file")
        result.append((record, ByteRange(record.offset, end)))
    return result


def _inclusive_end(next_offset: int | None, file_size: int) -> int:
    return file_size - 1 if next_offset is None else next_offset - 1


def resolve_allowlist(records: Iterable[IndexRecord], file_size: int, allowlist: dict[str, dict[str, str]]) -> dict[str, list[dict]]:
    """Match exact parameter and level strings and return their ranges."""
    _validate_allowlist(allowlist)
    ranged = resolve_ranges(records, file_size)
    output = {}
    for field, identity in allowlist.items():
        matches = []
        for row, byte_range in ranged:
            if _matches_identity(row, identity):
                matches.append({"record": asdict(row), "range": asdict(byte_range), "bytes": byte_range.size})
        output[field] = matches
    return output


def _validate_allowlist(allowlist: object) -> None:
    if not isinstance(allowlist, dict):
        raise ValueError("allowlist must be a JSON object")
    for field, identity in allowlist.items():
        if not isinstance(field, str):
            raise ValueError("allowlist field names must be strings")
        _validate_identity(field, identity)


def _validate_identity(field: str, identity: object) -> None:
    if not isinstance(identity, dict):
        raise ValueError(f"allowlist entry {field!r} must be an identity object")
    _reject_unknown_identity_keys(field, identity)
    _required_string(identity, field, "parameter")
    _required_string(identity, field, "level")
    if "step" in identity:
        _required_string(identity, field, "step")


def _reject_unknown_identity_keys(field: str, identity: dict) -> None:
    unknown = set(identity).difference({"parameter", "level", "step"})
    if unknown:
        raise ValueError(f"allowlist entry {field!r} has unknown keys: {sorted(unknown)}")


def _required_string(identity: dict, field: str, key: str) -> str:
    try:
        value = identity[key]
    except KeyError as error:
        raise ValueError(f"allowlist entry {field!r} is missing {key!r}") from error
    if not isinstance(value, str):
        raise ValueError(f"allowlist entry {field!r} {key!r} must be a string")
    return value


def _matches_identity(row: IndexRecord, identity: dict[str, str]) -> bool:
    actual = (row.parameter, row.level)
    expected = (identity["parameter"], identity["level"])
    if "step" in identity:
        actual += (row.step,)
        expected += (identity["step"],)
    return actual == expected


def fetch_text(url: str) -> tuple[str, dict[str, str]]:
    request = urllib.request.Request(url, headers={"User-Agent": "GFC-mesoscale-inventory/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read().decode("ascii"), {"lastModified": response.headers.get("Last-Modified", ""), "url": url}


def _read_index_source(source: str) -> tuple[str, dict[str, str]]:
    if source.startswith("https://"):
        return fetch_text(source)
    return Path(source).read_text(encoding="ascii"), {"url": str(Path(source))}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("idx", help="HTTPS .idx URL or local .idx path")
    parser.add_argument("--size", required=True, type=int, help="GRIB2 object size in bytes")
    parser.add_argument("--allowlist", help="JSON object mapping field names to exact parameter/level[/step]")
    args = parser.parse_args()
    text, metadata = _read_index_source(args.idx)
    identities = json.loads(Path(args.allowlist).read_text()) if args.allowlist else {}
    records = parse_idx(text)
    result = {"source": metadata, "fileSizeBytes": args.size, "records": [asdict(record) for record in records], "selected": resolve_allowlist(records, args.size, identities)}
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
