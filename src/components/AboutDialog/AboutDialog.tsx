import { Modal } from '../Modal/Modal';
import { Box } from 'lucide-react';
import './AboutDialog.css';

interface AboutDialogProps {
  isOpen: boolean;
  onClose: () => void;
  t: (key: string) => string;
}

const APP_VERSION = '1.0.0';
const GITHUB_URL = 'https://github.com/OpenAEC-Foundation';

export function AboutDialog({ isOpen, onClose, t }: AboutDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('about.title')} size="sm">
      <div className="about-content">
        <Box className="about-logo" strokeWidth={1.5} size={80} />
        <div className="about-name">Open FEM2D Studio</div>
        <div className="about-version">v{APP_VERSION}</div>
        <div className="about-tagline">"Build free. Build together."</div>
        <div className="about-meta">
          {t('about.builtOn')}<br />
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">{GITHUB_URL}</a>
        </div>
        <div className="about-license">© 2026 OpenAEC Foundation · CC BY-SA 4.0</div>
      </div>
    </Modal>
  );
}
