# Full plan: everything, including what earlier plans deferred

Supersedes `post-review-plan.md` (which was right but partial) and
`checkpoint-migration-plan.md` (phases 2–5 of which are **wrong**).

## Rule zero

Two plans in a row were wrong the same way: **a premise asserted from memory
instead of read from the repo.** Every claim below was verified by reading the
code or running it; where it wasn't, it says so.

> **Before proposing a design, grep for the thing it assumes exists.**

## The root cause behind most of the list

There are **two sync channels with different coverage**, and only one of them
is ever pulled:

| | carries | pulled by a populated device? |
|---|---|---|
| **journal** | `finishedWorkout`, `deleteWorkout` | **yes**, continuously |
| **R2 `latest.json`** | the entire database | **no** — `autoRestoreIfEmpty` only runs at `workoutCount === 0` |

So **anything that isn't a finished workout never propagates at all.** Not
"loses a race" — *never arrives*. And because every backup uploads the whole DB
(`{...incoming}`, `backupStore.ts:71`), a device that merely **trained** —
edited nothing — republishes its stale copy and reverts the other device's edit
in R2.

That single fact explains the program-structure gap, the set-correction gap,
notes, body weight, `clearSet`, exercise renames, and the Deload button. They
are not seven bugs. They are one missing channel, seven times.

It also explains why v1's replay fix was harmful: applying an op's weights on
replay is only correct **if the journal is the sole writer of weights**. It
isn't — yet.

## Phase 1 — Stop losing data

### 1.1 `flushOutbox` bypasses the identity gate — VERIFIED

The gate is on `cloudBackup.ts:24` and `syncEngine.ts:110`; `finishFlow.ts:45`
calls `flushOutbox` **directly**, and `sync.ts:140` has no gate. Switch avatars,
finish a workout → posts to the *Access* identity's journal, gets a valid ack,
**drains the other user's outbox**. `applyOp:179` then refuses the op as
foreign, so it's junk in an append-only log and the only copy is gone.

This is the original incident verbatim — queue drained, journal never got it —
on the path that runs after every workout.

**Test:** `mayWriteAs` false → no POST, no drain.
**Fix:** move the gate *into* `flushOutbox`.

### 1.2 Replay leaves stale weights — VERIFIED (`expected 25 to be 27.5`)

`applyDeleteWorkout` re-applies its rollback on replay; the finish op then
early-returns on the existing workout and skips its correction.

**Reachable because `autoRestoreIfEmpty` never sets the cursor**
(`autoRestore.ts:11`) — every fresh device replays the whole journal from 0 onto
a snapshot that already reflects it. (v1's "iOS evicts localStorage separately"
was **wrong**: ITP evicts script-writable storage as a unit and PWAs are exempt.)

**Fix:** gate the *delete* path's weights on the tombstone not already existing
— written in the same transaction, so tombstone-exists ⟺ already applied.
**Do not touch the finish path** until phase 5; doing so silently reverts
un-journalled edits.

**Tests (three):** the repro → 27.5; a replay must not wipe a hand-edited
weight (passes today, fails under v1's fix); a finish op arriving after a
tombstone must not advance the weight.

## Phase 2 — Stop lying about sync state

The status row exists because "a week of failed syncs looked exactly like
success". It still does, on two paths:

- **2.1** `SYNC_STATE_KEY` is one global key (`syncEngine.ts:42`) while cursor
  and epoch are per-user — user B reads **"Synced 2 minutes ago"** from user A.
- **2.2** `SyncStatusRow.tsx:69` counts an unscoped outbox.
- **2.3** The identity gate fails **silently** (`syncEngine.ts:110` returns
  before recording state) and **open** (`identityGate.ts:27` allows writes when
  `/api/me` timed out at 2s). Fail closed, and surface "Signed in as someone
  else" rather than nothing.

## Phase 3 — Delete dead weight

**3.1 CSV import — 633 lines.** Verified by applying it in a throwaway worktree:
suite green, `tsc` names exactly three errors, all in `app/settings/page.tsx:8-10`
— a compiler-proven closed graph. Real diff 752 including `fixes.test.ts` (−48)
and Settings (−71). Suite 303 → 280.

Also update `README.md:64`, `CONTRIBUTING.md:21`, `ROADMAP.md:6` — all three
still advertise the importers.

The CSV is **not** the recovery path: the JSON baseline
(`backups/isaac@rowntree.me/2026-07-03T02-38-07.json`, 1270, permanent prefix)
is strictly better, and the raw CSV still exists at `~/Downloads/`.

**3.2 Docs:** `SUPERSEDED` banner on `checkpoint-migration-plan.md`; refresh
`sync-repair-plan.md`'s Remaining list (3 of 5 are done).

## Phase 4 — Ship `durable-sync` 0.1.0

Publishing and *integrating* are independent; integration is cut, so the risk
that justified parking it is gone. Fix first — the README currently ships two of
these as recommended usage:

- missing `getServerSnapshot`; `README.md:146` shows the exact
  `useSyncExternalStore` infinite-loop bug the library warns about elsewhere
- `start()` calls `document.addEventListener` unguarded; `README.md:113` calls
  it at module scope
- `transport.ts:161` writes `epoch: undefined` when a reply omits it, wiping a
  known epoch — Rampset guards this, so the extraction regressed it

Then document the single-tenant constraint and publish with *"Extracted from
Rampset, which runs this design in production; not yet consumed by it."*

## Phase 5 — Make the log total *(the architectural fix — review before starting)*

This closes the root cause and, with it, seven separate divergences. It changes
the sync model, so it gets its own review round.

**Design: coarse aggregate ops.** Each carries the new state of one aggregate;
the log's order makes last-writer-win *per aggregate* correct rather than
accidental.

| new op | replaces the R2-only channel for |
|---|---|
| `updateWorkout` | notes (`session.ts:249`), body weight (`BodyWeightField.tsx:33`), set corrections and `clearSet` (`session.ts:254`) — carries the workout row **and its full set list** |
| `updateProgram` | structure (`program/page.tsx:233/325/406`), `programSwitch.ts`, the Deload button (`app/page.tsx:282`), mid-workout edits (`ProgressionWorkout.tsx:412`) — carries the program subtree |
| `updateExercise` | renames and notes — `sync.ts:193` currently puts only *missing* exercises |

`applyOp` gains update semantics (put-and-replace per aggregate) alongside the
existing create-or-skip for `finishedWorkout`. Every mutation site enqueues and
syncs — the sites are already enumerated above.

**Then, and only then, revisit 1.2:** with the journal the sole writer of
weights, applying an op's weights on replay becomes correct, and the finish
path's early return can drop its weights skip.

**Consequences to accept, not discover:**
- **The log grows much faster.** Today ~3 ops/week; a total log adds one per
  edit. Pagination and compaction stop being decade-away (phase 7).
- **Coarse ops mean whole-aggregate LWW.** Two concurrent program edits: last
  one wins entirely. That is *worse than merging* and *far better than today*,
  where the edit never arrives at all.
- **Rest timer** (`db.settings`, not in `exportBackup`): either an op or an
  explicit decision that it's device-local. Pick one and write it down.

## Phase 6 — R2 becomes what it should be

Once the log is total, R2 is disaster storage, not a channel.

- Keep `mergeBackups` — cheap defence in depth. **Do not** delete it; the
  earlier plan's argument for that was built on a false premise.
- **6.1** First-publish race: `storeBackup:128` only sends `onlyIf` when an etag
  exists, so two devices creating `latest.json` at once lose one. Needs
  `etagDoesNotMatch: "*"` — **undocumented and has silently inverted before**
  (workerd#2572), so pin a test.
- **6.2** `restoreBackup` doesn't clear the outbox, so a restore can re-push
  what it just wiped.
- **6.3** `unionById`'s comment *"incoming is the fresher edit"*
  (`backupStore.ts:39`) is false — it's merely later to publish. Fix the comment;
  the behaviour stops mattering once phase 5 lands.

## Phase 7 — Hardening

- **7.1 Error classification + backoff.** Everything collapses to "Couldn't
  reach the sync journal". An expired session is **not retryable** — it needs
  "sign in again", not exponential backoff. Offline/500 want backoff with
  jitter, and a foregrounding gets one free attempt (iOS froze the timer).
- **7.2 Cross-tab locks.** Single-flight is per-JS-context; two tabs share one
  IndexedDB. `navigator.locks` (Safari 15.4+). Benign today; not once deletes
  exist.
- **7.3 Op versioning.** Ops live forever; a payload shape changed in 2028 must
  still apply to ops from 2026. Cheap now, expensive later. **Do this with
  phase 5**, while the op set is being redesigned anyway.
- **7.4 Pagination.** `handlePull` has no LIMIT; `flushOutbox` posts everything
  in one 10s request. The landmine: a paged pull that still returns `maxSeq`
  makes the client skip ops it never received. Deferred **until phase 5**, which
  is what makes the log grow.
- **7.5 `handleReset` destroys the tombstone authority** — `handleTombstones`
  derives from `since(0)`. After a reset, any device still holding a deleted
  workout resurrects it into R2 forever. Document, or make reset dump ops first.

## Phase 8 — UI and platform

- **8.1 `CloseWatcher`** for `Sheet`. The WICG explainer names our exact hack
  and our exact failure. It creates **no history entry**, so there's nothing for
  `router.replace` to clobber — the bug becomes unrepresentable rather than
  guarded. Chrome/Edge 126+, Firefox 149+; keep the pushState path as the iOS
  fallback.
- **8.2 History delete UI.** `deleteWorkoutOpId` has **zero callers** — every
  delete op in the journal was hand-injected. The tombstone machinery has no
  producer. Either build the affordance or delete the machinery.
- **8.3 Serwist** — for the build-time precache manifest, which kills the
  hand-maintained `CACHE = "rampset-shell-v6"` bump and the rotting `ROUTES`
  array. Override its defaults: its RSC handlers cache payloads with no timeout,
  the opposite of ours.

## Phase 9 — Housekeeping

- `applyDeleteWorkout` returns `true` unconditionally. Cosmetic — `applied` is
  discarded at `SyncEngine.tsx:21` (an earlier review's claim that it "feeds the
  sync status" was **wrong**).
- `tombstonesFor` returns `[]` when the binding is missing, contradicting its own
  fail-closed comment. Unreachable (`bucket()` 503s first), still wrong.
- `enqueueFinishedWorkout` count-then-add outside a transaction. Harmless —
  server dedupes on `opId`.
- `applyWeight`'s silent `if (!pe) return`. Bites only for exercises added via
  `/program` (`newId()`), which the peer never receives anyway — until phase 5.
- `inFlight`/`lastRunAt` are module-global across users; an avatar switch can
  hand B user A's promise. Self-heals at the next foreground.

## Order, and why

1. **Phase 1** — actively loses data.
2. **Phase 2** — you can't trust anything you can't see.
3. **Phase 3** — free, and shrinks the surface before the big change.
4. **Phase 4** — independent, ships the thing that's already built.
5. **Phase 5** — the real fix. **Review before starting.** Take 7.3 with it.
6. **Phase 6, 7, 8, 9** — after, in that order.

Phases 1–4 are ~a day and carry no architectural risk. Phase 5 is the project.
Everything after it is small.

## Still cut

Checkpoints, importing the library into Rampset, migrating the 1270 into the
log, demoting R2 to write-only. All four were built on the premise that the log
could represent the state. Phase 5 is what would *make* that true — and only
after it lands is any of them worth reconsidering.
