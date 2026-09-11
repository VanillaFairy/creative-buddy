# T01c: Colour parser audit

**Role:** `audit`
**Depends on:** T01b
**Read first:** `shared/interfaces.md`, the design doc's "The field" section

**Files:** none. This task reports; it does not edit.

Invoke the `vf-superpowers:adversarial-tdd` skill and take its auditor role over
`tests/color.test.ts` and `src/graph/color.ts`.

## What to attack

- **Tests pinned to the implementation rather than the intent.** Does any
  assertion only hold because of how the regex happens to be written?
- **Untested claims from the design.** The design says the value comes back
  lower-cased *and* trimmed, that the alpha hex forms are refused, and that
  `transparent` is refused. Is each actually pinned?
- **The name table.** It was copied by hand. Spot-check a handful of entries
  against the CSS Color 4 list — a truncated paste is the realistic failure, and
  a missing name means a colour that silently does nothing.
- **Values the field can actually hold that nobody thought about.** YAML will
  hand `scalarOrNull` things like `#FFF` (quoted), a number, a date. The number
  and date cases belong to T02's boundary, not here — say so if you find them
  untested there, but do not add them to this file.
- **Anything the parser accepts that would paint badly.** A colour that is legal
  CSS but invisible on both themes is a real hole; name it if you find one.

## Output

Report findings as a list. Each finding says what is wrong, why it matters, and
what test would catch it. Findings become new `red` tasks — you do not write the
tests yourself and you do not edit either file.

If the pair is sound, say so plainly and stop. An audit that invents work to
look thorough is worse than one that finds nothing.
