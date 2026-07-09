import type { BitbucketClient } from '../client.js';
import type {
  Pipeline,
  PipelineStep,
  PipelineSchedule,
  PaginatedResponse,
  ListOptions,
} from '../types/index.js';
import { buildListQuery, type FieldOptions } from '../utils/query.js';

/**
 * Bitbucket Pipelines resource (read-only surface).
 *
 * Pipeline and step references accept either a numeric build number or a
 * brace-wrapped UUID; {@link pipelineRef} normalizes both to a URL-safe segment.
 */
export class PipelinesResource {
  constructor(private client: BitbucketClient) {}

  /** List pipeline runs for a repository. */
  async list(
    workspace: string,
    repoSlug: string,
    options?: ListOptions
  ): Promise<PaginatedResponse<Pipeline>> {
    const path = `/repositories/${workspace}/${repoSlug}/pipelines${buildListQuery(options)}`;
    return this.client.get<PaginatedResponse<Pipeline>>(path);
  }

  /** Get a single pipeline run by build number or UUID. */
  async get(
    workspace: string,
    repoSlug: string,
    pipeline: string,
    options?: FieldOptions
  ): Promise<Pipeline> {
    const path = `/repositories/${workspace}/${repoSlug}/pipelines/${pipelineRef(
      pipeline
    )}${buildListQuery(options)}`;
    return this.client.get<Pipeline>(path);
  }

  /** List the steps of a pipeline run. */
  async listSteps(
    workspace: string,
    repoSlug: string,
    pipeline: string,
    options?: ListOptions
  ): Promise<PaginatedResponse<PipelineStep>> {
    const path = `/repositories/${workspace}/${repoSlug}/pipelines/${pipelineRef(
      pipeline
    )}/steps${buildListQuery(options)}`;
    return this.client.get<PaginatedResponse<PipelineStep>>(path);
  }

  /**
   * Fetch the raw log for a step. Bitbucket returns plain text (often MB+).
   *
   * When `range` is supplied (a `Range` header value such as `bytes=-262144` for
   * the last 256 KiB) only that slice is transferred, and the returned
   * `totalBytes` reflects the full log size from the response headers so callers
   * can report how much was elided. Bitbucket serves logs as
   * `application/octet-stream`, so the body is read as text via
   * {@link BitbucketClient.getText}, which also accepts the `206 Partial
   * Content` a range request produces.
   */
  async getStepLog(
    workspace: string,
    repoSlug: string,
    pipeline: string,
    step: string,
    range?: string
  ): Promise<{ text: string; totalBytes?: number; partial: boolean }> {
    const path = `/repositories/${workspace}/${repoSlug}/pipelines/${pipelineRef(
      pipeline
    )}/steps/${pipelineRef(step)}/log`;
    return this.client.getText(path, range);
  }

  /** List the repository's configured pipeline schedules. */
  async listSchedules(
    workspace: string,
    repoSlug: string,
    options?: ListOptions
  ): Promise<PaginatedResponse<PipelineSchedule>> {
    const path = `/repositories/${workspace}/${repoSlug}/pipelines_config/schedules${buildListQuery(
      options
    )}`;
    return this.client.get<PaginatedResponse<PipelineSchedule>>(path);
  }
}

/**
 * Normalize a pipeline or step reference to a URL path segment. A numeric build
 * number is passed through; anything else is treated as a UUID, brace-wrapped if
 * needed, then URL-encoded (Bitbucket UUIDs are `{...}` in path params).
 */
export function pipelineRef(id: string): string {
  const trimmed = id.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  const braced = trimmed.startsWith('{') ? trimmed : `{${trimmed}}`;
  return encodeURIComponent(braced);
}
