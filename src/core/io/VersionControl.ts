// VersionControl.ts - Lightweight git-like version control for project state

export interface ICommit {
  id: string;                // Short hash (8 chars)
  parentId: string | null;   // Parent commit ID
  branchName: string;        // Which branch this commit belongs to
  message: string;           // Commit message
  timestamp: number;         // Unix timestamp
  author: string;            // Author name (from projectInfo.engineer)
  snapshot: string;          // Full project JSON (serialized state)
}

export interface IBranch {
  name: string;              // Branch name (e.g. 'main', 'design-option-1')
  headCommitId: string;      // Points to latest commit on this branch
  createdAt: number;
  description?: string;      // Optional description
}

export interface IVersionStore {
  currentBranch: string;           // Name of active branch
  currentCommitId: string;         // Currently checked-out commit
  branches: IBranch[];             // All branches
  commits: ICommit[];              // All commits (flat list)
  hasUncommittedChanges: boolean;
}

/**
 * Generate a short 8-character hex ID for commits.
 * Uses crypto.randomUUID when available, falls back to Math.random.
 */
function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  }
  // Fallback: generate 8 hex chars from Math.random
  let id = '';
  for (let i = 0; i < 8; i++) {
    id += Math.floor(Math.random() * 16).toString(16);
  }
  return id;
}

/**
 * Create an initial version store with a first commit on the 'main' branch.
 */
export function createVersionStore(projectSnapshot: string, author: string): IVersionStore {
  const now = Date.now();
  const commitId = generateId();

  const initialCommit: ICommit = {
    id: commitId,
    parentId: null,
    branchName: 'main',
    message: 'Initial commit',
    timestamp: now,
    author,
    snapshot: projectSnapshot,
  };

  const mainBranch: IBranch = {
    name: 'main',
    headCommitId: commitId,
    createdAt: now,
    description: 'Main branch',
  };

  return {
    currentBranch: 'main',
    currentCommitId: commitId,
    branches: [mainBranch],
    commits: [initialCommit],
    hasUncommittedChanges: false,
  };
}

/**
 * Create a new commit on the current branch.
 * Updates the branch head to point to the new commit.
 */
export function commit(
  store: IVersionStore,
  snapshot: string,
  message: string,
  author: string
): IVersionStore {
  const commitId = generateId();
  const now = Date.now();

  const newCommit: ICommit = {
    id: commitId,
    parentId: store.currentCommitId,
    branchName: store.currentBranch,
    message,
    timestamp: now,
    author,
    snapshot,
  };

  // Update the current branch head to the new commit
  const updatedBranches = store.branches.map((branch) => {
    if (branch.name === store.currentBranch) {
      return { ...branch, headCommitId: commitId };
    }
    return branch;
  });

  return {
    ...store,
    currentCommitId: commitId,
    branches: updatedBranches,
    commits: [...store.commits, newCommit],
    hasUncommittedChanges: false,
  };
}

/**
 * Create a new branch from the current position (current commit).
 * Does not switch to the new branch.
 */
export function createBranch(
  store: IVersionStore,
  branchName: string,
  description?: string
): IVersionStore {
  // Check if branch already exists
  const existing = store.branches.find((b) => b.name === branchName);
  if (existing) {
    throw new Error(`Branch '${branchName}' already exists.`);
  }

  const newBranch: IBranch = {
    name: branchName,
    headCommitId: store.currentCommitId,
    createdAt: Date.now(),
    description,
  };

  return {
    ...store,
    branches: [...store.branches, newBranch],
  };
}

/**
 * Switch to a different branch. Returns the updated store and the snapshot
 * from the branch's head commit so the app can restore it.
 */
export function switchBranch(
  store: IVersionStore,
  branchName: string
): { store: IVersionStore; snapshot: string } {
  const branch = store.branches.find((b) => b.name === branchName);
  if (!branch) {
    throw new Error(`Branch '${branchName}' does not exist.`);
  }

  const headCommit = store.commits.find((c) => c.id === branch.headCommitId);
  if (!headCommit) {
    throw new Error(`Head commit '${branch.headCommitId}' for branch '${branchName}' not found.`);
  }

  const updatedStore: IVersionStore = {
    ...store,
    currentBranch: branchName,
    currentCommitId: branch.headCommitId,
    hasUncommittedChanges: false,
  };

  return { store: updatedStore, snapshot: headCommit.snapshot };
}

/**
 * Checkout a specific commit by ID (detached HEAD state).
 * The currentBranch remains set but the currentCommitId may not match
 * the branch head, effectively creating a detached head.
 * Returns the updated store and the snapshot to restore.
 */
export function checkoutCommit(
  store: IVersionStore,
  commitId: string
): { store: IVersionStore; snapshot: string } {
  const targetCommit = store.commits.find((c) => c.id === commitId);
  if (!targetCommit) {
    throw new Error(`Commit '${commitId}' not found.`);
  }

  const updatedStore: IVersionStore = {
    ...store,
    currentCommitId: commitId,
    hasUncommittedChanges: false,
  };

  return { store: updatedStore, snapshot: targetCommit.snapshot };
}

/**
 * Delete a branch. Cannot delete 'main' or the currently active branch.
 * Note: commits are NOT removed (they may be referenced by other branches
 * or needed for history).
 */
export function deleteBranch(store: IVersionStore, branchName: string): IVersionStore {
  if (branchName === 'main') {
    throw new Error("Cannot delete the 'main' branch.");
  }

  if (branchName === store.currentBranch) {
    throw new Error(`Cannot delete the currently active branch '${branchName}'. Switch to another branch first.`);
  }

  const branch = store.branches.find((b) => b.name === branchName);
  if (!branch) {
    throw new Error(`Branch '${branchName}' does not exist.`);
  }

  return {
    ...store,
    branches: store.branches.filter((b) => b.name !== branchName),
  };
}

/**
 * Get the commit history for a given branch (or the current branch if not specified).
 * Walks the parent chain from the branch head back to the root commit.
 * Returns commits in reverse chronological order (newest first).
 */
export function getHistory(store: IVersionStore, branchName?: string): ICommit[] {
  const targetBranch = branchName || store.currentBranch;
  const branch = store.branches.find((b) => b.name === targetBranch);
  if (!branch) {
    throw new Error(`Branch '${targetBranch}' does not exist.`);
  }

  // Build a lookup map for fast access
  const commitMap = new Map<string, ICommit>();
  for (const c of store.commits) {
    commitMap.set(c.id, c);
  }

  // Walk the parent chain from the branch head
  const history: ICommit[] = [];
  let currentId: string | null = branch.headCommitId;

  while (currentId !== null) {
    const currentCommit = commitMap.get(currentId);
    if (!currentCommit) {
      break; // Broken chain, stop walking
    }
    history.push(currentCommit);
    currentId = currentCommit.parentId;
  }

  return history;
}

/**
 * Get all branches in the version store.
 */
export function getBranches(store: IVersionStore): IBranch[] {
  return [...store.branches];
}

/**
 * Serialize the version store to a JSON string for persistence.
 */
export function serializeVersionStore(store: IVersionStore): string {
  return JSON.stringify(store);
}

/**
 * Deserialize a JSON string back into a version store.
 * Performs basic validation to ensure the structure is intact.
 */
export function deserializeVersionStore(json: string): IVersionStore {
  const parsed = JSON.parse(json);

  // Basic structural validation
  if (
    typeof parsed.currentBranch !== 'string' ||
    typeof parsed.currentCommitId !== 'string' ||
    !Array.isArray(parsed.branches) ||
    !Array.isArray(parsed.commits) ||
    typeof parsed.hasUncommittedChanges !== 'boolean'
  ) {
    throw new Error('Invalid version store format.');
  }

  return parsed as IVersionStore;
}
