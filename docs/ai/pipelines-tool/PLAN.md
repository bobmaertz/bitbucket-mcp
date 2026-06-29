# Plan: Failing Pipelines Tool (Bitbucket Pipelines MCP family)

Source: Todoist "Failing pipelines tool" (roadmap). Goal: read-only MCP tools that
surface Bitbucket Pipelines runs, steps, logs, trigger metadata, and variables for a
branch or PR, so a developer can diagnose CI failures from one place.

## Feasibility verdict

**Buildable, fits the existing architecture cleanly.** It is the same vertical slice
the `pullrequests`/`branches` families already use:

```
bitbucket-api (resource + types)  →  bitbucket-core (operation + presenter)  →  bitbucket-mcp-server (tool + handler)
```

The only non-standard piece — `get_step_log` returning raw text — is already supported:
`BitbucketClient.get<T>(path, config)` forwards an axios config, so a log call passes
`{ responseType: 'text', headers: { Accept: 'text/plain' } }` and returns the string.
No client/auth/server/logger changes needed.

## Tool surface (5 read-only tools)

All take `workspace` + `repo` (defaulted via `resolveTarget`). All read-only.

| Tool | Endpoint (Cloud REST 2.0) |
|------|---------------------------|
| `bitbucket_list_pipelines` | `GET /repositories/{ws}/{repo}/pipelines?q=...&sort=-created_on` |
| `bitbucket_get_pipeline` | `GET .../pipelines/{uuid}` (also accept build_number) |
| `bitbucket_list_pipeline_steps` | `GET .../pipelines/{uuid}/steps/` |
| `bitbucket_get_step_log` | `GET .../pipelines/{uuid}/steps/{step_uuid}/log` (text) |
| `bitbucket_list_schedules` | `GET .../pipelines_config/schedules/` |

### Pipeline reference resolution
Every pipeline-referencing tool accepts **build_number OR uuid**. Bitbucket's
`GET .../pipelines/{pipeline}` accepts both a `{uuid}` (brace-wrapped) and a bare
build number, so the resource normalizes: if the value is all digits → use as-is;
if it looks like a uuid → wrap in `{}` if not already. Confirm against a real run.

## Key field mapping (from the pipeline object)

- `trigger.type` → `pipeline_trigger_push` / `_manual` / `_schedule` → normalize to
  `trigger_type: push|manual|schedule`; derive `is_scheduled`.
- `target.type` → `pipeline_ref_target` (branch/tag) / `pipeline_pullrequest_target`
  (PR) / `pipeline_commit_target` → normalize to a clean `target: { branch }` or
  `{ pull_request_id, ref }` or `{ commit }`.
- `state.name` + `state.result.name` → `state` + `result` (pass/fail).
- `variables[]` → manual/custom run inputs. Bitbucket masks secured values; present
  secured as `(secured)`, never attempt to unmask.

## Presenters (compact output)

- `presentPipelineSummary` — build_number, uuid, state, result, trigger_type,
  normalized target, created_on, duration_in_seconds.
- `presentPipeline` — summary + creator, completed_on, full target, variables
  (secured masked), is_scheduled.
- `presentPipelineStep` — step_uuid, name, state, result, started_on,
  duration_in_seconds, has_log.
- `presentSchedule` — uuid, enabled, cron_pattern, target ref, type.
- Log result is `{ text, total_bytes, truncated, returned_lines }` — not run through
  the entity compactor.

## Log handling (`get_step_log`)

Logs are often MB+. Inputs: `tail?` (default last N lines), `grep?` (server-side
substring/line filter applied in core after fetch), `max_bytes?` (cap + set
`truncated`). Default to a tail so we never dump megabytes. In-progress steps may
return 404/empty (`has_log=false`) — handle gracefully (return empty with a flag,
not an error).

## Query grammar to verify first (flagged in the task)

Bitbucket's `q=` grammar is fiddly. Confirm against current docs / a real repo:
- branch filter field: likely `target.ref_name`
- PR filter field: likely `target.pullrequest.id`
- status filter: `state` / `state.result.name`

Build the `q=` expression defensively and unit-test the param construction.

## Files

**New:**
- `packages/bitbucket-api/src/resources/pipelines.ts`
- `packages/bitbucket-api/src/types/pipeline.ts`
- `packages/bitbucket-api/src/resources/pipelines.test.ts`

**Edit:**
- `packages/bitbucket-api/src/resources/index.ts` (re-export)
- `packages/bitbucket-api/src/index.ts` (instantiate `pipelines` on `BitbucketAPI`)
- `packages/bitbucket-api/src/types/index.ts` (re-export)
- `packages/bitbucket-core/src/operations.ts` (5 operations + log filtering)
- `packages/bitbucket-core/src/presenters.ts` (4 presenters)
- `packages/bitbucket-core/src/presenters.test.ts` (presenter tests)
- `packages/bitbucket-core/src/contract.contract.test.ts` (5 endpoints)
- `packages/bitbucket-mcp-server/src/tools.ts` (5 tool defs + 5 handlers)
- `packages/bitbucket-mcp-server/src/tools.test.ts` (handler tests, update tool-list assertion)

## Acceptance criteria (from task)

1. Branch → recent runs with state+result.
2. PR id → runs that PR triggered, labeled PR-targeted.
3. Any run → list steps with pass/fail each.
4. Any step → debug logs, tail-default + grep.
5. Manual run → all variables, secured shown as `(secured)`.
6. Any run → push / manual / scheduled distinguishable.
7. List repo schedules independent of any run.
8. Every pipeline ref accepts build_number or uuid interchangeably.

## Verification

- Unit: resource path/param construction, presenters, handlers (mocked).
- Contract: add 5 endpoints to `READ_ENDPOINTS`, run `npm run test:contract`.
- Lint + build across workspaces.
- DoD requires a live repo with one manual, one PR, one scheduled run — out of scope
  for unit work; note as a manual verification step for the user.
