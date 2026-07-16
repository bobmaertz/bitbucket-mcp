/**
 * Server-level instructions sent to the client during the MCP initialize
 * handshake. Clients surface this text to the model alongside the tool list,
 * so it carries the cross-tool workflow guidance that individual tool
 * descriptions can't: how the tools chain together, what defaults apply, and
 * how to recover from common errors.
 */
export const SERVER_INSTRUCTIONS = `Read-only access to Bitbucket Cloud (repositories, source files, commits, PRs, pipelines).

Common defaults: 'workspace' falls back to the configured default workspace — omit it unless targeting another. 'repo' is the repository slug (e.g. "widgets" for acme/widgets), never a URL. Wherever a 'commit' parameter appears it accepts a branch name, tag, or commit hash and defaults to the repo's main branch.

Reading source files — the usual flow:
1. Unknown repo slug? Find it with bitbucket_list_repositories (use 'query' to filter by name).
2. Explore structure with bitbucket_list_directory. Omit 'commit' to use the main branch (the response echoes the resolved 'ref'). Pass max_depth (e.g. 3) to fetch a recursive tree in one call instead of walking directories one level at a time.
3. Read a file with bitbucket_get_file, giving 'repo' and 'path' (the full path from the repo root, e.g. "src/app/main.py" — exactly as shown by bitbucket_list_directory). Content is capped (128 KB by default); if the response says it was truncated, re-fetch with a larger max_bytes/max_lines. Binary files return binary:true and no content.
4. A 404 almost always means a wrong path or ref — re-run bitbucket_list_directory on the parent directory to get the exact spelling, and check the intended branch.

For "what changed" questions, fetch the cheap summary first (bitbucket_get_diffstat or bitbucket_get_pr_diffstat), then pull the diff scoped with 'path' and 'context' rather than downloading the whole thing. List tools are paginated: pass 'page' to continue when the response indicates more results.`;
