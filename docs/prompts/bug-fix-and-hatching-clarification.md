# Prompt: Fixes and Clarification

## Clarification: Hatching

- Hatching is PER PROB TYPE not overall, they have different meanings per prob type (tornado, wind, hail).
- Hatching should be its own layer separate from fill color so that multiple hatching styles can be applied across different fill colors.
- Hatching should match the hierarchy so CIG3 is on top, then CIG2, then CIG1, then no hatching.

## Probabilities Key

- The key still has the old significant styles, these should be removed. We should just have the fill colors, and then the hatching styles shown separately with their meanings.

## Ditch the legacy mode idea

- It's just a pain, we can consider it later but for now we should just focus on the new format and getting the project to a finished state.

## Bug Fixes

### Outlook Conversion Bug

- This bug is still here.
- The hover window shows that the polygon is the categorical shortname with a % symbol at the end (ex. SLGT%). Not sure if this is probalatic.
- Fix so the color conversions are applied because right now it's confused so it's reverting to the color that corresponds to the unknown or undefined state.
