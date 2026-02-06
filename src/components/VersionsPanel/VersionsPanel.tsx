/**
 * VersionsPanel -- Version control interface with branches, commit history,
 * and save/checkout operations. Displayed when the "Versions" ribbon tab is active.
 */

import { useState, useMemo, useCallback } from 'react';
import { useI18n } from '../../i18n/i18n';
import { IVersionStore, ICommit, getHistory, getBranches } from '../../core/io/VersionControl';
import './VersionsPanel.css';

export interface VersionsPanelProps {
  versionStore: IVersionStore | null;
  onCommit: (message: string) => void;
  onCreateBranch: (name: string, description?: string) => void;
  onSwitchBranch: (name: string) => void;
  onCheckout: (commitId: string) => void;
  onDeleteBranch: (name: string) => void;
}

/** Format a timestamp as a relative time string (e.g. "2 min ago") */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 10) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 30) return `${diffDay}d ago`;
  // Fall back to absolute date
  const d = new Date(timestamp);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Confirmation Dialog
// ---------------------------------------------------------------------------

interface ConfirmDialogProps {
  title: string;
  message: string;
  warning?: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({ title, message, warning, confirmLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <div className="versions-confirm-overlay" onClick={onCancel}>
      <div className="versions-confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="versions-confirm-title">{title}</div>
        <p className="versions-confirm-message">{message}</p>
        {warning && (
          <div className="versions-confirm-warning">
            <svg className="versions-confirm-warning-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            {warning}
          </div>
        )}
        <div className="versions-confirm-actions">
          <button className="versions-confirm-cancel-btn" onClick={onCancel}>Cancel</button>
          <button className="versions-confirm-proceed-btn" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Branch Icon (SVG)
// ---------------------------------------------------------------------------

function BranchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function VersionsPanel({
  versionStore,
  onCommit,
  onCreateBranch,
  onSwitchBranch,
  onCheckout,
  onDeleteBranch,
}: VersionsPanelProps) {
  const { t } = useI18n();

  // Local state
  const [commitMessage, setCommitMessage] = useState('');
  const [showNewBranchForm, setShowNewBranchForm] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchDescription, setNewBranchDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Confirmation dialog state
  const [confirmAction, setConfirmAction] = useState<{
    type: 'switch-branch' | 'delete-branch';
    target: string;
  } | null>(null);

  // Derived data from version store
  const branches = useMemo(() => {
    if (!versionStore) return [];
    return getBranches(versionStore);
  }, [versionStore]);

  const history = useMemo(() => {
    if (!versionStore) return [];
    try {
      return getHistory(versionStore);
    } catch {
      return [];
    }
  }, [versionStore]);

  // Count commits per branch
  const branchCommitCounts = useMemo(() => {
    if (!versionStore) return new Map<string, number>();
    const counts = new Map<string, number>();
    for (const branch of branches) {
      try {
        const branchHistory = getHistory(versionStore, branch.name);
        counts.set(branch.name, branchHistory.length);
      } catch {
        counts.set(branch.name, 0);
      }
    }
    return counts;
  }, [versionStore, branches]);

  // Handlers
  const handleCommit = useCallback(() => {
    const trimmed = commitMessage.trim();
    if (!trimmed) return;
    try {
      onCommit(trimmed);
      setCommitMessage('');
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to create version');
    }
  }, [commitMessage, onCommit]);

  const handleCommitKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleCommit();
    }
  }, [handleCommit]);

  const handleCreateBranch = useCallback(() => {
    const trimmed = newBranchName.trim();
    if (!trimmed) return;
    try {
      onCreateBranch(trimmed, newBranchDescription.trim() || undefined);
      setNewBranchName('');
      setNewBranchDescription('');
      setShowNewBranchForm(false);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to create branch');
    }
  }, [newBranchName, newBranchDescription, onCreateBranch]);

  const handleSwitchBranch = useCallback((branchName: string) => {
    if (!versionStore) return;
    if (branchName === versionStore.currentBranch) return;

    if (versionStore.hasUncommittedChanges) {
      setConfirmAction({ type: 'switch-branch', target: branchName });
    } else {
      try {
        onSwitchBranch(branchName);
        setError(null);
      } catch (e: any) {
        setError(e.message ?? 'Failed to switch branch');
      }
    }
  }, [versionStore, onSwitchBranch]);

  const handleDeleteBranch = useCallback((branchName: string) => {
    setConfirmAction({ type: 'delete-branch', target: branchName });
  }, []);

  const handleCheckout = useCallback((commitId: string) => {
    if (!versionStore) return;
    if (commitId === versionStore.currentCommitId) return;

    try {
      onCheckout(commitId);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to checkout version');
    }
  }, [versionStore, onCheckout]);

  const handleConfirm = useCallback(() => {
    if (!confirmAction) return;
    try {
      if (confirmAction.type === 'switch-branch') {
        onSwitchBranch(confirmAction.target);
      } else if (confirmAction.type === 'delete-branch') {
        onDeleteBranch(confirmAction.target);
      }
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Operation failed');
    }
    setConfirmAction(null);
  }, [confirmAction, onSwitchBranch, onDeleteBranch]);

  const handleCancelConfirm = useCallback(() => {
    setConfirmAction(null);
  }, []);

  // Empty state when no version store exists
  if (!versionStore) {
    return (
      <div className="versions-panel">
        <div className="versions-header">
          <span className="versions-header-title">
            <BranchIcon className="versions-header-icon" />
            {t('versions.title') !== 'versions.title' ? t('versions.title') : 'Versions'}
          </span>
        </div>
        <div className="versions-content">
          <div className="versions-empty">
            <svg className="versions-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="6" y1="3" x2="6" y2="15" />
              <circle cx="18" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <path d="M18 9a9 9 0 0 1-9 9" />
            </svg>
            <h3>{t('versions.noStore') !== 'versions.noStore' ? t('versions.noStore') : 'No version history'}</h3>
            <p>{t('versions.noStoreHint') !== 'versions.noStoreHint' ? t('versions.noStoreHint') : 'Save a version to start tracking changes'}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="versions-panel">
      {/* Header */}
      <div className="versions-header">
        <span className="versions-header-title">
          <BranchIcon className="versions-header-icon" />
          {t('versions.title') !== 'versions.title' ? t('versions.title') : 'Versions'}
        </span>
      </div>

      {/* Current branch indicator */}
      <div className="versions-branch-indicator">
        <BranchIcon className="versions-branch-icon" />
        <span className="versions-branch-name">{versionStore.currentBranch}</span>
        {versionStore.hasUncommittedChanges && (
          <span className="versions-uncommitted-badge">
            <span className="versions-uncommitted-dot" />
            {t('versions.uncommitted') !== 'versions.uncommitted' ? t('versions.uncommitted') : 'Uncommitted changes'}
          </span>
        )}
      </div>

      {/* Scrollable content */}
      <div className="versions-content">
        {/* Error display */}
        {error && (
          <div className="versions-error">
            {error}
            <button className="versions-error-dismiss" onClick={() => setError(null)}>&#x2715;</button>
          </div>
        )}

        {/* Commit section */}
        <div className="versions-commit-section">
          <div className="versions-section-title">
            {t('versions.saveVersion') !== 'versions.saveVersion' ? t('versions.saveVersion') : 'Save Version'}
          </div>
          <div className="versions-commit-form">
            <input
              className="versions-commit-input"
              type="text"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              onKeyDown={handleCommitKeyDown}
              placeholder={t('versions.commitPlaceholder') !== 'versions.commitPlaceholder' ? t('versions.commitPlaceholder') : 'Describe your changes...'}
            />
            <button
              className="versions-commit-btn"
              onClick={handleCommit}
              disabled={!commitMessage.trim()}
            >
              {t('versions.saveVersionBtn') !== 'versions.saveVersionBtn' ? t('versions.saveVersionBtn') : 'Save Version'}
            </button>
          </div>
        </div>

        {/* Branches section */}
        <div className="versions-branches-section">
          <div className="versions-section-title">
            {t('versions.branches') !== 'versions.branches' ? t('versions.branches') : 'Branches'}
            <button
              className="versions-new-branch-btn"
              onClick={() => setShowNewBranchForm(!showNewBranchForm)}
            >
              {showNewBranchForm
                ? (t('versions.cancel') !== 'versions.cancel' ? t('versions.cancel') : 'Cancel')
                : (t('versions.newBranch') !== 'versions.newBranch' ? t('versions.newBranch') : '+ New Branch')
              }
            </button>
          </div>

          {/* Inline new branch form */}
          {showNewBranchForm && (
            <div className="versions-new-branch-form">
              <div className="versions-new-branch-form-row">
                <input
                  className="versions-new-branch-input"
                  type="text"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  placeholder={t('versions.branchName') !== 'versions.branchName' ? t('versions.branchName') : 'Branch name'}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateBranch();
                    if (e.key === 'Escape') {
                      setShowNewBranchForm(false);
                      setNewBranchName('');
                      setNewBranchDescription('');
                    }
                  }}
                />
              </div>
              <div className="versions-new-branch-form-row">
                <input
                  className="versions-new-branch-input"
                  type="text"
                  value={newBranchDescription}
                  onChange={(e) => setNewBranchDescription(e.target.value)}
                  placeholder={t('versions.branchDescription') !== 'versions.branchDescription' ? t('versions.branchDescription') : 'Description (optional)'}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateBranch();
                    if (e.key === 'Escape') {
                      setShowNewBranchForm(false);
                      setNewBranchName('');
                      setNewBranchDescription('');
                    }
                  }}
                />
              </div>
              <div className="versions-new-branch-form-row">
                <button
                  className="versions-new-branch-create-btn"
                  onClick={handleCreateBranch}
                  disabled={!newBranchName.trim()}
                >
                  {t('versions.create') !== 'versions.create' ? t('versions.create') : 'Create'}
                </button>
                <button
                  className="versions-new-branch-cancel-btn"
                  onClick={() => {
                    setShowNewBranchForm(false);
                    setNewBranchName('');
                    setNewBranchDescription('');
                  }}
                >
                  {t('versions.cancel') !== 'versions.cancel' ? t('versions.cancel') : 'Cancel'}
                </button>
              </div>
            </div>
          )}

          {/* Branch list */}
          <div className="versions-branch-list">
            {branches.map((branch) => {
              const isActive = branch.name === versionStore.currentBranch;
              const commitCount = branchCommitCounts.get(branch.name) ?? 0;
              return (
                <div
                  key={branch.name}
                  className={`versions-branch-card${isActive ? ' active' : ''}`}
                >
                  <BranchIcon className="versions-branch-card-icon" />
                  <div className="versions-branch-card-info">
                    <div className="versions-branch-card-name">{branch.name}</div>
                    <div className="versions-branch-card-meta">
                      {commitCount} {commitCount === 1
                        ? (t('versions.commit') !== 'versions.commit' ? t('versions.commit') : 'commit')
                        : (t('versions.commits') !== 'versions.commits' ? t('versions.commits') : 'commits')
                      }
                      {branch.description && <> &middot; {branch.description}</>}
                    </div>
                  </div>
                  <div className="versions-branch-card-actions">
                    {!isActive && (
                      <button
                        className="versions-branch-action-btn"
                        onClick={() => handleSwitchBranch(branch.name)}
                        title={t('versions.switchBranch') !== 'versions.switchBranch' ? t('versions.switchBranch') : 'Switch to this branch'}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M15 3h6v6" />
                          <path d="M10 14L21 3" />
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        </svg>
                      </button>
                    )}
                    {branch.name !== 'main' && !isActive && (
                      <button
                        className="versions-branch-action-btn danger"
                        onClick={() => handleDeleteBranch(branch.name)}
                        title={t('versions.deleteBranch') !== 'versions.deleteBranch' ? t('versions.deleteBranch') : 'Delete branch'}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* History section */}
        <div className="versions-history-section">
          <div className="versions-section-title">
            {t('versions.history') !== 'versions.history' ? t('versions.history') : 'History'}
          </div>

          {history.length === 0 ? (
            <div className="versions-empty">
              <p>{t('versions.noCommits') !== 'versions.noCommits' ? t('versions.noCommits') : 'No commits on this branch'}</p>
            </div>
          ) : (
            <div className="versions-timeline">
              {history.map((commit: ICommit) => {
                const isCurrent = commit.id === versionStore.currentCommitId;
                return (
                  <div
                    key={commit.id}
                    className={`versions-commit-entry${isCurrent ? ' current checked-out' : ''}`}
                  >
                    <div className="versions-commit-dot" />
                    <div className="versions-commit-header">
                      <span className="versions-commit-id">{commit.id}</span>
                      <span className="versions-commit-message">{commit.message}</span>
                      {!isCurrent && (
                        <button
                          className="versions-commit-checkout-btn"
                          onClick={() => handleCheckout(commit.id)}
                        >
                          {t('versions.checkout') !== 'versions.checkout' ? t('versions.checkout') : 'Checkout'}
                        </button>
                      )}
                    </div>
                    <div className="versions-commit-meta">
                      <span className="versions-commit-author">{commit.author || 'Unknown'}</span>
                      <span className="versions-commit-time">{formatRelativeTime(commit.timestamp)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Confirmation dialog */}
      {confirmAction && confirmAction.type === 'switch-branch' && (
        <ConfirmDialog
          title={t('versions.switchBranchTitle') !== 'versions.switchBranchTitle' ? t('versions.switchBranchTitle') : 'Switch Branch'}
          message={`${t('versions.switchBranchMsg') !== 'versions.switchBranchMsg' ? t('versions.switchBranchMsg') : 'Switch to branch'} "${confirmAction.target}"?`}
          warning={t('versions.uncommittedWarning') !== 'versions.uncommittedWarning' ? t('versions.uncommittedWarning') : 'You have uncommitted changes that will be lost.'}
          confirmLabel={t('versions.switchAnyway') !== 'versions.switchAnyway' ? t('versions.switchAnyway') : 'Switch Anyway'}
          onConfirm={handleConfirm}
          onCancel={handleCancelConfirm}
        />
      )}

      {confirmAction && confirmAction.type === 'delete-branch' && (
        <ConfirmDialog
          title={t('versions.deleteBranchTitle') !== 'versions.deleteBranchTitle' ? t('versions.deleteBranchTitle') : 'Delete Branch'}
          message={`${t('versions.deleteBranchMsg') !== 'versions.deleteBranchMsg' ? t('versions.deleteBranchMsg') : 'Delete branch'} "${confirmAction.target}"? ${t('versions.deleteBranchNote') !== 'versions.deleteBranchNote' ? t('versions.deleteBranchNote') : 'Commits will be preserved in history.'}`}
          confirmLabel={t('versions.delete') !== 'versions.delete' ? t('versions.delete') : 'Delete'}
          onConfirm={handleConfirm}
          onCancel={handleCancelConfirm}
        />
      )}
    </div>
  );
}
