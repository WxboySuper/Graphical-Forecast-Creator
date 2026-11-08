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
    records = []
    for line_number, line in enumerate(text.splitlines(), 1):
        if not line.strip():
            continue
        parts = line.split(":")
        if len(parts) < 6 or not parts[1].isdigit():
            raise ValueError(f"Invalid .idx row {line_number}: {line!r}")
        match = re.fullmatch(r"d=(\d+)", parts[2])
        if not match:
            raise ValueError(f"Invalid reference time on .idx row {line_number}")
        step_parts = parts[5:]
        if step_parts and not step_parts[-1]:
            step_parts.pop()
        records.append(IndexRecord(parts[0], int(parts[1]), match.group(1), parts[3], parts[4], ":".join(step_parts)))
    if not records:
        raise ValueError("The .idx inventory is empty")
    if any(a.offset > b.offset for a, b in zip(records, records[1:])):
        raise ValueError(".idx offsets must be non-decreasing")
    return records


def resolve_ranges(records: Iterable[IndexRecord], file_size: int) -> list[tuple[IndexRecord, ByteRange]]:
    """Return inclusive ranges, ending each message before the next offset."""
    rows = list(records)
    result = []
    for index, record in enumerate(rows):
        next_offset = next((row.offset for row in rows[index + 1:] if row.offset > record.offset), None)
        end = next_offset - 1 if next_offset is not None else file_size - 1
        if record.offset >= file_size or end < record.offset:
            raise ValueError(f"Invalid message range at offset {record.offset} for {file_size}-byte file")
        result.append((record, ByteRange(record.offset, end)))
    return result


def resolve_allowlist(records: Iterable[IndexRecord], file_size: int, allowlist: dict[str, dict[str, str]]) -> dict[str, list[dict]]:
    """Match exact parameter and level strings and return their ranges."""
    ranged = resolve_ranges(records, file_size)
    output = {}
    for field, identity in allowlist.items():
        matches = []
        for row, byte_range in ranged:
            if row.parameter == identity["parameter"] and row.level == identity["level"] and row.step == identity.get("step", row.step):
                matches.append({"record": asdict(row), "range": asdict(byte_range), "bytes": byte_range.size})
        output[field] = matches
    return output


def fetch_text(url: str) -> tuple[str, dict[str, str]]:
    request = urllib.request.Request(url, headers={"User-Agent": "GFC-mesoscale-inventory/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read().decode("ascii"), {"lastModified": response.headers.get("Last-Modified", ""), "url": url}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("idx", help="HTTPS .idx URL or local .idx path")
    parser.add_argument("--size", required=True, type=int, help="GRIB2 object size in bytes")
    parser.add_argument("--allowlist", help="JSON object mapping field names to exact parameter/level[/step]")
    args = parser.parse_args()
    source = args.idx
    if source.startswith("https://"):
        text, metadata = fetch_text(source)
    else:
        text, metadata = Path(source).read_text(encoding="ascii"), {"url": str(Path(source))}
    identities = json.loads(Path(args.allowlist).read_text()) if args.allowlist else {}
    result = {"source": metadata, "fileSizeBytes": args.size, "records": [asdict(record) for record in parse_idx(text)], "selected": resolve_allowlist(parse_idx(text), args.size, identities)}
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
