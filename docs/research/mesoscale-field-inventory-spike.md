# Mesoscale field inventory spike

Checked 8 November 2026. The companion [JSON manifest](../data/mesoscale-field-inventory.json) records anonymous S3 URLs, object sizes, separate GRIB object and `.idx` Last-Modified timestamps, and copied inventory strings for the newest f00 files available during this check.

## Measured sample

| Model | Cycle | f00 object Last-Modified | Latency from cycle | Object bytes | Selected message bytes |
|---|---|---|---:|---:|---:|
| HRRR CONUS `wrfsfc` | 12Z | 12:51:20Z | 51 min | 136,859,480 | 12,550,486 |
| RAP `awip32` | 06Z | 06:48:05Z | 48 min | 19,614,935 | 561,337 |
| RRFS 3 km CONUS `2dfld` | 06Z | 07:15:26Z | 75 min | 302,956,136 | 14,103,011 |

Selected-message totals include one exact message for each available record in the shared sample allowlist: reflectivity, mean sea-level pressure, 2 m temperature/dewpoint, 10 m U/V wind, surface CAPE/CIN, 0-1 and 0-3 km HLCY, PWAT, and RRFS's 2-5 km UPHL. RAP's U and V rows share one combined message, counted once. The manifest stores each exact identity and inclusive range so the totals can be reproduced. The final message range ends at object size minus one. HRRR `wrfprs` was also indexed (382,358,670 bytes), but not added to the selected-byte total because it duplicates surface diagnostics and this spike's common allowlist uses `wrfsfc`.

These are single-cycle observations, not delivery guarantees. RAP 12Z and RRFS 12Z were not listed when checked; latest available was 06Z. Age is measured from the cycle hour to the S3 object's `Last-Modified` timestamp, not to a separate arrival probe.

## What the indexes establish

All three indexes include native 2 m temperature and dewpoint, 10 m U/V wind, CAPE and CIN records, 0-1 km and 0-3 km helicity (`HLCY`), precipitable water, sea-level pressure, and composite reflectivity. The precise index identities and range-decoded GRIB metadata are in the manifest. ecCodes 2.41.0 confirmed parameter codes, units, level types, and instantaneous step metadata for selected messages. `CAPE:surface` is not enough to assert MUCAPE. Layer CAPE/CIN entries (`180-0`, `90-0`, and `255-0 mb above ground`) still need an authoritative model-specific mapping before assigning parcel names. No direct 0-6 km bulk-shear or LCL-height messages appear in these 2-D inventories. HRRR's `MXUPHL/MNUPHL` records are max/min forecast accumulations; RRFS lists `UPHL` for 2000-5000 m above ground. RAP f00 AWIP32 has no UPHL record.

The literal 0-6 km bulk shear is absent as a precomputed field in the inspected product files. Wind profiles are available in separate pressure-level products, but deriving a layer difference is a later server-side computation. The fixed-layer SCP candidate formula from the research branch is `(MUCAPE / 1000) × (0-3 km SRH / 150) × (BRN shear denominator / 40)`. The required BRN shear denominator is absent too. The fixed-layer STP base formula uses MLCAPE, 0-6 km bulk vector shear, 0-1 km SRH and MLLCL. Its CIN-limited variant adds MLCIN. No inspected model has verified MLCAPE, MLCIN, MUCAPE or MLLCL identities in the available `.idx`; the layer records remain parcel-identity candidates. Neither formula's full input set is natively present in any of the three inspected files.

RRFS uses `MSLET` for mean sea-level pressure; HRRR and RAP use `MSLMA`. RRFS uses 3 km `2dfld` naming and its f00 file remains much larger than RAP. These product differences matter to manifest matching.

## Tool and timing limits

`wgrib2` was not installed, but Python ecCodes 2.41.0 and PyProj 3.7.1 were available. The selected byte ranges for the manifest were fetched and decoded where ecCodes recognized the fields; units and GRIB2 parameter identifiers are recorded per message. RRFS reflectivity and updraft-helicity short names/units were unresolved by the installed ecCodes definitions, and RAP?s shared wind range decoded as its first (U) field; the V identity is retained from the `.idx` row. These are called out as limits rather than inferred. A single HRRR 2 m temperature sample downloaded 1,237,587 bytes in 0.429 s, decoded and generated latitude/longitude arrays in 1.026 s, and transformed coordinates to EPSG:3857 in 0.295 s. The projection timing covers coordinate transforms only, not value resampling or tiling. CAPE/CIN parcel semantics remain unverified.

Run the pure parser/range tests with `python -m unittest discover -s scripts/mesoscale -p 'test_*.py'`. The parser permits duplicate offsets because RAP indexes can point multiple parameter rows at the same combined message.
