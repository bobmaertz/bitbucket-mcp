import type { BitbucketClient } from '../client.js';
import type {
  Pipeline,
  PipelineStep,
  PipelineSchedule,
  PaginatedResponse,
  ListOptions,
} from '../types/index.js';

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
    const path = `/repositories/${workspace}/${repoSlug}/pipelines${queryString(options)}`;
    return this.client.get<PaginatedResponse<Pipeline>>(path);
  }

  /** Get a single pipeline run by build number or UUID. */
  async get(workspace: string, repoSlug: string, pipeline: string): Promise<Pipeline> {
    const path = `/repositories/${workspace}/${repoSlug}/pipelines/${pipelineRef(pipeline)}`;
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
    )}/steps${queryString(options)}`;
    return this.client.get<PaginatedResponse<PipelineStep>>(path);
  }

  /**
   * Fetch the raw log for a step. Bitbucket returns plain text (often MB+), so
   * the response is requested as text rather than JSON.
   */
  async getStepLog(
    workspace: string,
    repoSlug: string,
    pipeline: string,
    step: string
  ): Promise<string> {
    const path = `/repositories/${workspace}/${repoSlug}/pipelines/${pipelineRef(
      pipeline
    )}/steps/${pipelineRef(step)}/log`;
    // Bitbucket serves step logs as application/octet-stream; a `text/plain`
    // Accept negotiation is rejected with 406, so accept any content type and
    // read the body as text.
    return this.client.get<string>(path, {
      responseType: 'text',
      headers: { Accept: '*/*' },
    });
  }

  /** List the repository's configured pipeline schedules. */
  async listSchedules(
    workspace: string,
    repoSlug: string,
    options?: ListOptions
  ): Promise<PaginatedResponse<PipelineSchedule>> {
    const path = `/repositories/${workspace}/${repoSlug}/pipelines_config/schedules${queryString(
      options
    )}`;
    return this.client.get<PaginatedResponse<PipelineSchedule>>(path);
  }
}

/** Build a `?...` query string from common list options (empty when none set). */
function queryString(options?: ListOptions): string {
  const params = new URLSearchParams();
  if (options?.page) params.append('page', options.page.toString());
  if (options?.pagelen) params.append('pagelen', options.pagelen.toString());
  if (options?.q) params.append('q', options.q);
  if (options?.sort) params.append('sort', options.sort);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
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
