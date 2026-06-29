import type { Links, User } from './common.js';

/**
 * Bitbucket Pipelines types (Cloud REST 2.0).
 *
 * Several fields the live API returns are absent from or loosely typed in the
 * vendored OpenAPI spec (notably the pull-request target shape and per-step
 * `name`/`duration_in_seconds`), so those are typed optionally here and read
 * defensively by the presenters.
 */

/** Discriminated state name + completion result, flattened across spec subtypes. */
export interface PipelineState {
  type: string;
  /** PENDING | IN_PROGRESS | COMPLETED */
  name?: string;
  /** SUCCESSFUL | FAILED | ERROR | STOPPED (only once completed) */
  result?: { type?: string; name?: string };
  stage?: { type?: string; name?: string };
}

/** push / manual / schedule, via `pipeline_trigger_*` type discriminator. */
export interface PipelineTrigger {
  type: string;
  name?: string;
}

/**
 * A run's target. `type` discriminates branch/tag (`pipeline_ref_target`),
 * pull request (`pipeline_pullrequest_target`), or bare commit
 * (`pipeline_commit_target`).
 */
export interface PipelineTarget {
  type: string;
  ref_type?: string; // branch | tag
  ref_name?: string;
  commit?: { hash?: string; type?: string };
  selector?: { type?: string; pattern?: string };
  // Pull-request target (not in the vendored spec, present at runtime):
  pullrequest?: { id?: number };
  source?: string;
  destination?: string;
}

export interface PipelineVariable {
  uuid?: string;
  key: string;
  value?: string;
  /** Secured values come back masked from Bitbucket; never unmask. */
  secured?: boolean;
  type?: string;
}

export interface Pipeline {
  uuid: string;
  build_number: number;
  state?: PipelineState;
  target?: PipelineTarget;
  trigger?: PipelineTrigger;
  creator?: User;
  created_on?: string;
  completed_on?: string;
  build_seconds_used?: number;
  variables?: PipelineVariable[];
  repository?: { name?: string; full_name?: string; uuid?: string };
  links?: Links;
  type?: string;
}

export interface PipelineStepState {
  type: string;
  name?: string;
  result?: { type?: string; name?: string };
}

export interface PipelineStep {
  uuid: string;
  /** Step name from bitbucket-pipelines.yml (present at runtime). */
  name?: string;
  state?: PipelineStepState;
  image?: { name?: string };
  started_on?: string;
  completed_on?: string;
  duration_in_seconds?: number;
  setup_commands?: unknown[];
  script_commands?: unknown[];
  type?: string;
}

export interface PipelineScheduleTarget {
  type?: string;
  ref_type?: string;
  ref_name?: string;
  selector?: { type?: string; pattern?: string };
}

export interface PipelineSchedule {
  uuid: string;
  enabled?: boolean;
  cron_pattern?: string;
  target?: PipelineScheduleTarget;
  created_on?: string;
  updated_on?: string;
  type?: string;
}
