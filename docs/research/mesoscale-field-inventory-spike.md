# Mesoscale field inventory spike

Checked 8 November 2026. The companion [JSON manifest](../data/mesoscale-field-inventory.json) records anonymous S3 URLs, object sizes, `.idx` timestamps and copied inventory strings for the newest f00 files available during this check.

## Measured sample

| Model | Cycle | f00 index/object timestamp | Latency from cycle | Object bytes | Selected message bytes |
|---|---|---|---:|---:|---:|
| HRRR CONUS `wrfsfc` | 12Z | 12:51:20Z | 51 min | 136,859,480 | 12,550,486 |
| RAP `awip32` | 06Z | 06:48:05Z | 48 min | 19,614,935 | 561,337 |
| RRFS 3 km CONUS `2dfld` | 06Z | 07:15:26Z | 75 min | 302,956,136 | 14,103,011 |

Selected-message totals include one exact message for each available record in the shared sample allowlist: reflectivity, mean sea-level pressure, 2 m temperature/dewpoint, 10 m U/V wind, surface CAPE/CIN, 0-1 and 0-3 km HLCY, PWAT, and RRFS's 2-5 km UPHL. They are inclusive `.idx` byte ranges, with the final message ending at object size minus one. HRRR `wrfprs` was also indexed (382,358,670 bytes), but not added to the selected-byte total because it duplicates surface diagnostics and this spike's common allowlist uses `wrfsfc`.

These are single-cycle observations, not delivery guarantees. RAP 12Z and RRFS 12Z were not listed when checked; latest available was 06Z. Age is measured from the cycle hour to the S3 object's `Last-Modified` timestamp, not to a separate arrival probe.

## What the indexes establish

All three indexes include native 2 m temperature and dewpoint, 10 m U/V wind, CAPE and CIN records, 0-1 km and 0-3 km helicity (`HLCY`), precipitable water, sea-level pressure, and composite reflectivity. The precise index identities are in the manifest. They do not expose units or GRIB2 parameter numbers, so units are marked unknown. `CAPE:surface` is not enough to assert MUCAPE. The layer CAPE/CIN entries (`180-0`, `90-0`, and `255-0 mb above ground`) need ecCodes/wgrib2 metadata and domain interpretation before assigning parcel names. No direct 0-6 km bulk-shear or LCL-height messages appear in these 2-D inventories. HRRR's `MXUPHL/MNUPHL` records are max/min forecast accumulations; RRFS lists `UPHL` for 2000-5000 m above ground. RAP f00 AWIP32 has no UPHL record.

The literal 0-6 km shear components are absent as precomputed fields in the inspected product files. Wind profiles are available in separate pressure-level products, but deriving a layer difference is a later server-side computation and does not make the composite input natively present. On this evidence, neither fixed-layer SCP nor fixed-layer STP is fully native in any of the three inspected files. In particular MUCAPE remains unverified, and MLLCL is absent.

RRFS uses `MSLET` for mean sea-level pressure; HRRR and RAP use `MSLMA`. RRFS uses 3 km `2dfld` naming and its f00 file remains much larger than RAP. These product differences matter to manifest matching.

## Tool and timing limits

`wgrib2` and ecCodes were not installed in the inspection environment. I did not claim decode/reproject timing or decoded units. I also did not download/decode a sample GRIB message; range totals above are computed from the real `.idx` offsets and object lengths. The script can resolve and print the exact ranges for an allowlist. A follow-up with ecCodes or wgrib2 should verify GRIB discipline/category/number, units, step type and CAPE parcel semantics before using the manifest as a production contract.

Run the pure parser/range tests with `python -m unittest discover -s scripts/mesoscale -p 'test_*.py'`. The parser permits duplicate offsets because RAP indexes can point multiple parameter rows at the same combined message.
