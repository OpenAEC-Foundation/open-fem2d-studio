import React from 'react';
import { Box, Save, Undo, Redo } from 'lucide-react';
import './TitleBar.css';

interface TitleBarProps {
  projectName: string;
  onSave?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  rightSlot?: React.ReactNode;
}

export function TitleBar({
  projectName,
  onSave,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  rightSlot,
}: TitleBarProps) {
  return (
    <div className="title-bar">
      <div className="title-bar-left">
        <Box size={14} />
        <span>Open FEM2D Studio</span>
        {(onSave || onUndo || onRedo) && (
          <div className="title-bar-quick-access">
            {onSave && (
              <button className="title-bar-qa-btn" onClick={onSave} title="Save (Ctrl+S)" aria-label="Save">
                <Save size={14} />
              </button>
            )}
            {onUndo && (
              <button className="title-bar-qa-btn" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo">
                <Undo size={14} />
              </button>
            )}
            {onRedo && (
              <button className="title-bar-qa-btn" onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Y)" aria-label="Redo">
                <Redo size={14} />
              </button>
            )}
          </div>
        )}
      </div>
      <div className="title-bar-center">{projectName || 'Untitled Project'}</div>
      <div className="title-bar-right">{rightSlot}</div>
    </div>
  );
}
