import { useState, useEffect } from 'react';
import { ArrowLeft, FilePlus, FolderOpen, Save, SaveAll, Settings, Info, LogOut } from 'lucide-react';
import './Backstage.css';

export type BackstageAction =
  | 'new' | 'open' | 'save' | 'saveAs' | 'preferences' | 'about' | 'exit';

interface BackstageProps {
  isOpen: boolean;
  onClose: () => void;
  onAction: (action: BackstageAction) => void;
  t: (key: string) => string;
}

interface MenuItem {
  id: BackstageAction;
  icon: React.ReactNode;
  labelKey: string;
  shortcut?: string;
  description: string;
}

export function Backstage({ isOpen, onClose, onAction, t }: BackstageProps) {
  const [active, setActive] = useState<BackstageAction>('new');

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const items: MenuItem[] = [
    { id: 'new',         icon: <FilePlus size={16} />,   labelKey: 'backstage.new',         shortcut: 'Ctrl+N', description: t('backstage.newDesc') },
    { id: 'open',        icon: <FolderOpen size={16} />, labelKey: 'backstage.open',        shortcut: 'Ctrl+O', description: t('backstage.openDesc') },
    { id: 'save',        icon: <Save size={16} />,       labelKey: 'backstage.save',        shortcut: 'Ctrl+S', description: t('backstage.saveDesc') },
    { id: 'saveAs',      icon: <SaveAll size={16} />,    labelKey: 'backstage.saveAs',      shortcut: 'Ctrl+Shift+S', description: t('backstage.saveAsDesc') },
    { id: 'preferences', icon: <Settings size={16} />,   labelKey: 'backstage.preferences', shortcut: 'Ctrl+,', description: t('backstage.preferencesDesc') },
    { id: 'about',       icon: <Info size={16} />,       labelKey: 'backstage.about',       description: t('backstage.aboutDesc') },
    { id: 'exit',        icon: <LogOut size={16} />,     labelKey: 'backstage.exit',        shortcut: 'Alt+F4', description: t('backstage.exitDesc') },
  ];

  const activeItem = items.find(i => i.id === active);

  return (
    <div className="backstage-overlay" role="dialog" aria-modal="true" aria-label="File menu">
      <div className="backstage-sidebar">
        <button className="backstage-back" onClick={onClose} aria-label={t('common.close')}>
          <ArrowLeft size={16} /> {t('common.close')}
        </button>
        <nav className="backstage-menu">
          {items.map(item => (
            <button
              key={item.id}
              className={`backstage-item ${active === item.id ? 'is-active' : ''}`}
              onMouseEnter={() => setActive(item.id)}
              onClick={() => { onAction(item.id); onClose(); }}
            >
              {item.icon}
              <span style={{ flex: 1 }}>{t(item.labelKey)}</span>
              {item.shortcut && <span style={{ fontSize: '0.75rem', color: 'var(--theme-fg-subtle)' }}>{item.shortcut}</span>}
            </button>
          ))}
        </nav>
      </div>
      <div className="backstage-content">
        {activeItem && (
          <>
            <h2>{t(activeItem.labelKey)}</h2>
            <p>{activeItem.description}</p>
          </>
        )}
      </div>
    </div>
  );
}
