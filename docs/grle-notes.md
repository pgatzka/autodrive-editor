# Notes on `infoLayer_*.grle`

Findings from an attempt to read the plow layer out of an FS25 savegame, so
that plowed ground could be drawn exactly instead of inferred from what the
painted field edges enclose (see `src/model/fields.ts`). The attempt did not
land; this is where it got to, so the next attempt starts here rather than at
the beginning.

## Header — solved

| offset | size | meaning                                                     |
| ------ | ---- | ----------------------------------------------------------- |
| 0      | 4    | magic `GRLE`                                                |
| 4      | 2    | version, `1` in every file seen                             |
| 6      | 2    | `16` on full-resolution layers, `8` on `placementCollision` |
| 8      | 2    | `0`                                                         |
| 10     | 2    | same value as offset 6                                      |
| 12     | 5    | `00 01 00 00 00` in every file seen                         |
| 17     | 4    | payload length in bytes                                     |
| 21     | …    | payload                                                     |

The value at offset 6 scales with resolution: layers carrying `16` hold
4096 × 4096 cells for a 2048 m map (two per meter), and the one carrying `8`
holds 2048 × 2048. Cells are 4 bits, so a full-resolution layer is 8,388,608
bytes.

## Payload — nearly solved

The payload is one lead byte followed by run pairs of `(value, count)`.
A layer that is entirely default encodes as `00 00` then `ff` repeated, which
is 32,896 runs of 255 — decoding those gives 16,777,214 cells against the
16,777,216 the geometry calls for, a discrepancy of two cells across three
independent uniform layers.

## What is left

Decoding a layer that has content drifts by exactly one byte per row: the
first non-default column of successive rows walks left by two every two rows,
and the rows alternate between two parses, which is the signature of a
per-row byte that the pair walk swallows. Re-syncing by skipping one byte per
2048-byte row bounds the columns to a plausible range (the fields land near
their known position, off by ~25 cells) but does not make them square, so the
per-row element is not simply one skipped byte.

Ground truth for any further attempt: in `savegame2_2`, the fields sit at
x 411…811, z 827…1227 of the 2048-cell terrain grid — read from the painted
edges in `terrain.lod.type.cache`, which is fully decoded and trustworthy.
Two savegames of the same map exist, one before the fields were plowed and
one after, so a diff isolates exactly the bytes that plowing wrote.
