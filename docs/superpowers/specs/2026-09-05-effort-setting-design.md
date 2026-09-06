# Reasoning Effort in Creative Buddy

**Date:** 2026-09-05
**Status:** Designed, being built on `claude/default-model-effort-9cc8d3`.

## Context

Creative Buddy has exactly one knob on how the interviewer thinks: which model
runs it. `MODEL_CHOICES` in `src/settings.ts` offers three, a `defaultModel`
seeds new conversations, and each chat tab carries its own `model` that you can
change mid-conversation.

There is a second knob the Agent SDK has offered all along and the plugin has
never touched: `effort`. Nothing in `src/` mentions it, so every session runs at
whatever the CLI defaults to, which is `high`.

That is a real gap for this plugin in particular. The interviewer's whole job is
to press on a graph until it gives something up — sometimes you want it to grind
for a minute on one question, and sometimes you are dumping notes and want it to
file them and get out of the way. Today the only way to express that is to
change models, which also changes cost, context window, and personality.

## Goals

1. A default effort in settings, seeding new conversations, the way
   `defaultModel` already does.
2. A per-conversation effort control beside the model picker, changeable
   mid-conversation, surviving a restart.
3. The control never offers a level the selected model does not honour.
4. Fable joins the model list.

## Non-goals

- No effort of its own for `kg-scout`. It is pinned to `haiku`, which has no
  effort control at all, and it is a read-only scout with one job.
- No live capability lookup from the CLI. See the closed question below.
- No change to what the interviewer *says*. `assets/prompts/` is untouched.

## What the docs actually say

From the Claude Code model-config docs and the Claude API effort page, checked
2026-09-05:

| Model | Effort levels |
| --- | --- |
| Fable 5.1, Fable 5 | `low` `medium` `high` `xhigh` `max` |
| Opus 5, Opus 4.8, Opus 4.7, Sonnet 5 | `low` `medium` `high` `xhigh` `max` |
| Opus 4.6, Sonnet 4.6 | `low` `medium` `high` `max` — no `xhigh` |
| Everything else, Haiku 4.5 included | none |

The default is `high` on every model that has effort at all, and setting `high`
explicitly is documented as identical to not setting it.

Across the four models this plugin offers, that collapses to something simple:
three models take all five levels, and Haiku takes no control at all.

Two notes on Fable, both from the Claude Code docs: it is not the default on any
plan, and it may bill to usage credits rather than the subscription. This plugin
sells itself on subscription billing — the settings tab warns against API
billing in as many words. The label does not spell this out (see the closed
question below); anyone using Fable is choosing the model most likely to reach
for that billing path, and Claude Code's own picker already flags it there.

## Design

### The model list

`MODEL_CHOICES` gains one entry, at the top:

```
claude-fable-5-1  Fable 5.1
claude-opus-5     Opus 5
claude-sonnet-5   Sonnet 5
claude-haiku-4-5  Haiku 4.5
```

(revised 2026-09-06: the labels dropped their descriptors — see the closed
question below — so the dropdown now just names the model and, for effort,
the level.)

### `src/agent/effort.ts`, the one new rule

Which levels a model honours is a decision, so it gets its own module and its
own test, the way every other rule in this codebase does.

```ts
export type EffortLevel = "low" | "medium" | "high" | "xhigh" | "max";
export const DEFAULT_EFFORT: EffortLevel = "high";
export const EFFORT_LABELS: Record<EffortLevel, string>;

/** Levels a model honours, in order. Empty means it has no effort control. */
export function levelsFor(model: string): EffortLevel[];

/** A stored level made legal for a model; null when that model has none. */
export function coerce(model: string, effort: EffortLevel): EffortLevel | null;
```

The table covers the models the picker offers and nothing else. An id it does
not recognise — a retired model restored out of `workspace.json` — returns the
empty list, which fails closed the way the rest of the agent boundary does.

`coerce` exists because effort and model are coupled state: a level that was
legal a second ago stops being legal when you switch models. One tested
function owns that, rather than three call sites each re-deriving it.

### Both pickers ask the same question

In the chat header, a second `<select className="cb-quiet-control">` sits beside
the model picker, its options coming from `levelsFor(session.model)`. Switching
model re-renders it. An empty list renders nothing, so Haiku simply has no
effort control — that is why `levelsFor` returns a list rather than a support
flag, since "render nothing" is a case the renderer already handles.

In the settings tab, the "Default effort" row filters the same way against
`defaultModel`, and keeps the stored value when it hides so switching back off
Haiku restores what you had.

### Session state and wiring

`ChatSession` gains `effort`, persisted and restored exactly like `model`,
falling back to `settings.defaultEffort` and then coerced against the session's
own model.

`SessionConfig.effort` flows into the SDK options object at session start, and
is omitted entirely when the model has no effort. Live changes go through a new
`SessionHandle.setEffort`, which calls `applyFlagSettings({ effortLevel })` on
the query handle — so `SdkQueryHandle` in `src/agent/sdk-types.ts` grows that
method. Changing the model coerces the effort and pushes whichever of the two
actually changed.

A failed switch raises a Notice and the session keeps its current level, which
is what the model-switch path already does.

## Testing

- `tests/effort.test.ts` — the table, the empty cases, and `coerce` clamping a
  level onto a model that does not have it.
- `tests/chat-sessions.test.ts` — effort persists, restores, falls back to the
  default when absent, and is coerced against the restored model.
- `tests/agent-service.test.ts` — the options object carries `effort`, and omits
  it for a model without one.
- `npm run test:live` afterwards. `CLAUDE.md` is explicit that unit fakes have
  missed real CLI behaviour in `agent-service.ts` options before, and this
  change is exactly that.

## Closed questions

**Q. Should the effort control grey out on Haiku with a reason, or disappear?**
A. Disappear. `levelsFor` returning an empty list makes "render nothing" the
natural rendering, and a permanently-disabled control that explains itself is
more UI than the fact deserves.

**Q. Where does the Fable usage-credits warning go?**
A. Nowhere in this plugin's UI. Claude Code's own model picker already
surfaces "Requires usage credits" when it applies, and a plugin-side warning
risked going stale against that — Anthropic's billing rules change more often
than this plugin's release cadence.

**Q. Should the labels carry a one-line descriptor ("deepest interviewer") or just the name?**
A. Just the name (revised 2026-09-06; the first build wrote a descriptor per
model and per effort level). A descriptor is one more thing to keep honest as
Anthropic's own model positioning shifts, for a dropdown whose job is just to
tell two model names or five effort levels apart.

**Q. Should the level list come from the CLI's supportedModels() instead of a table?**
A. No. `supportedModels()` hangs off a running query handle, so the settings tab
would have to start a CLI session to fill a dropdown, and the picker would need
a loading state and a fallback for "have not asked yet". That is a lot of
machinery for four models, and `MODEL_CHOICES` is already a static table with
the same staleness risk.

**Q. Does kg-scout get an effort of its own?**
A. No. It runs on `haiku`, which has no effort control, and it is a read-only
scout with a single job.

**Q. What should a brand-new conversation default to?**
A. `high` — what the CLI already uses when nothing sets effort. The setting
ships as a lever rather than a silent change to how existing interviews behave.
