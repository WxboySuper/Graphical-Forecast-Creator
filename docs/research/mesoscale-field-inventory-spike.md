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

The expanded scan covers HRRR `wrfsfc`, `wrfprs`, and `wrfnat`; 12 RAP f00 products including `wrfprs`, `wrfnat`, and `awp130`, `awp236`, and `awp252` variants; and RRFS 3 km CONUS `2dfld`, `prslev`, and `2dfld_awipsubset`. The manifest records matching field families by product, index identity, step, units, and byte range. RRFS `natlev` CONUS/NA index requests returned 404. The NCEP RRFS product catalog lists `prslev` and `2dfld`.

All three models have 0-1 km and 0-3 km storm-relative helicity (`HLCY`). All three also have 0-6 km `VUCSH` and `VVCSH` component records in at least one scanned product. NCEP calls these Vertical U/V Component Shear and gives units `s**-1`. That is dimensionally different from the m s**-1 endpoint bulk wind difference used by standard SCP/STP formulations. Taking `sqrt(VUCSH^2 + VVCSH^2)` does not turn those values into m s**-1. The component fields are present; their equivalence to the required bulk-shear magnitude is unverified.

`HGT:level of adiabatic condensation from sfc` is present in HRRR `wrfsfc/wrfprs/wrfnat`, RAP `wrfprs`, and RRFS `2dfld`. It is a surface-based parcel LCL. It does not establish mixed-layer LCL (`MLLCL`), which was not identified in any model.

CAPE/CIN records exist at the surface and at `180-0`, `90-0`, and `255-0 mb above ground`; CAPE also exists at `0-3000 m`. The official HRRR and RAP inventories use generic CAPE/CIN labels and do not map these layers to named MUCAPE, MLCAPE, or SBCAPE. The `255-0` layer has a `PLPL` record, described as the pressure of the level from which the parcel was lifted, but this alone does not establish a named parcel. An NWS HREF change notice identifies 90-0 hPa as mixed-layer and 180-0 hPa as most-unstable/surface-based for HREF. That notice is HREF-specific and is not applied to HRRR/RAP/RRFS. Parcel identity is unverified for all three models.

### Fixed-layer composite inputs

| Model | Fixed-layer SCP | Fixed-layer STP |
|---|---|---|
| HRRR | 0-3 km SRH present. MUCAPE candidate present, parcel identity unverified. 0-6 km shear components present, standard bulk-wind-difference magnitude unverified. Not all inputs confirmed usable. | 0-1 km SRH present. MLCAPE/MLCIN candidates present, parcel identities unverified. Surface-based LCL present, MLLCL absent/unverified. Shear magnitude unverified. Not all inputs confirmed usable. |
| RAP | Same CAPE candidate, SRH, and shear status as HRRR. | Same CAPE/CIN candidate, SRH, and shear status as HRRR. Surface-based LCL found in `wrfprs`; MLLCL absent/unverified. |
| RRFS | Same CAPE candidate, SRH, and shear status as HRRR. | Same CAPE/CIN candidate, SRH, and shear status as HRRR. Surface-based LCL present in `2dfld`; MLLCL absent/unverified. |

No model has every input confirmed with the required semantics for either composite. The limits are parcel identity, shear units/meaning, and the lack of mixed-layer LCL. The SCP equation in the research notes also uses a BRN shear denominator; no precomputed BRN denominator was identified. Its availability depends on the exact intended formula.

HRRR has `MXUPHL/MNUPHL` max/min forecast accumulations. RRFS has `UPHL` for 2000-5000 m above ground. RAP f00 `AWIP32` has no UPHL record. RRFS uses `MSLET` for mean sea-level pressure; HRRR and RAP use `MSLMA`.

## References

- [NCEP HRRR `wrfsfc` f00 inventory](https://www.nco.ncep.noaa.gov/pmb/products/hrrr/hrrr.t00z.wrfsfcf00.grib2.shtml) documents shear units, generic CAPE/CIN layers, surface LCL HGT, and PLPL.
- [NCEP RAP `wrfprs` f00 inventory](https://www.nco.ncep.noaa.gov/pmb/products/rap/rap.t00z.wrfprsf00.grib2.shtml) lists pressure-product shear, helicity, CAPE/CIN, and surface LCL fields.
- [NCEP RRFS product page](https://www.nco.ncep.noaa.gov/pmb/products/rrfs/) lists product families.
- [NWS HREF field change notice 17-106](https://www.weather.gov/media/notification/pdfs/scn17-106hi_res_href.pdf) documents HREF parcel descriptions only. This spike does not use it to label HRRR/RAP/RRFS.

RRFS uses `MSLET` for mean sea-level pressure; HRRR and RAP use `MSLMA`. RRFS uses 3 km `2dfld` naming and its f00 file remains much larger than RAP. These product differences matter to manifest matching.

## Tool and timing limits

`wgrib2` was not installed, but Python ecCodes 2.41.0 and PyProj 3.7.1 were available. The selected byte ranges for the manifest were fetched and decoded where ecCodes recognized the fields; units and GRIB2 parameter identifiers are recorded per message. RRFS reflectivity and updraft-helicity short names/units were unresolved by the installed ecCodes definitions, and RAP?s shared wind range decoded as its first (U) field; the V identity is retained from the `.idx` row. These are called out as limits rather than inferred. A single HRRR 2 m temperature sample downloaded 1,237,587 bytes in 0.429 s, decoded and generated latitude/longitude arrays in 1.026 s, and transformed coordinates to EPSG:3857 in 0.295 s. The projection timing covers coordinate transforms only, not value resampling or tiling. CAPE/CIN parcel semantics remain unverified.

Run the pure parser/range tests with `python -m unittest discover -s scripts/mesoscale -p 'test_*.py'`. The parser permits duplicate offsets because RAP indexes can point multiple parameter rows at the same combined message.
