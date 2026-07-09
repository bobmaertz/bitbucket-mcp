/**
 * A repository's effective branching model
 * (`GET .../effective-branching-model`): the resolved development/production
 * branches and the configured branch-type prefixes (feature/, hotfix/, ...).
 */
export interface BranchingModel {
  type?: string;
  development?: BranchingModelBranch;
  production?: BranchingModelBranch;
  branch_types?: BranchType[];
}

export interface BranchingModelBranch {
  /** Whether this branch role is enabled (production can be disabled). */
  enabled?: boolean;
  /** True when this role maps to the repo's main branch. */
  use_mainbranch?: boolean;
  /** The resolved branch, when it exists. */
  branch?: { name?: string; type?: string };
  /** Configured branch name when it doesn't currently exist. */
  name?: string;
}

export interface BranchType {
  /** feature | bugfix | hotfix | release, etc. */
  kind: string;
  prefix: string;
  enabled?: boolean;
}
