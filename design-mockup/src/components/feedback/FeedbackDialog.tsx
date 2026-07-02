import { useState, useEffect, useRef, type ClipboardEvent } from "react";
import { useTranslation } from "react-i18next";
import html2canvas from "html2canvas";
import Modal from "../Modal";
import "./FeedbackDialog.css";

// ── GitHub target ─────────────────────────────────────────────────────
// Apps using this template can override these constants. Issues are
// opened in the user's browser with a pre-filled title + body.
const GITHUB_OWNER = "OpenAEC-Foundation";
const GITHUB_REPO = "OpenAEC-style-book";

async function getAppVersion(): Promise<string> {
  try {
    const { getVersion } = await import("@tauri-apps/api/app");
    return await getVersion();
  } catch {
    return "";
  }
}

async function getOsInfo(): Promise<string> {
  try {
    const os = await import("@tauri-apps/plugin-os");
    const osType = os.type() || "Unknown";
    const osVer = os.version() || "";
    const arch = os.arch() || "";
    return `${osType} ${osVer} (${arch})`.replace(/\s+/g, " ").trim();
  } catch {
    return navigator.platform || "Unknown";
  }
}

async function openExternal(url: string) {
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

const CATEGORIES = ["general", "bug", "feature"] as const;
type Category = (typeof CATEGORIES)[number];

const CATEGORY_LABELS: Record<Category, { emoji: string; gitLabel: string }> = {
  general: { emoji: "💬", gitLabel: "feedback" },
  bug: { emoji: "🐛", gitLabel: "bug" },
  feature: { emoji: "✨", gitLabel: "enhancement" },
};

const SENTIMENTS = [
  { id: "frustrated", emoji: "\u{1F61E}" },
  { id: "neutral", emoji: "\u{1F610}" },
  { id: "happy", emoji: "\u{1F60A}" },
] as const;
type Sentiment = (typeof SENTIMENTS)[number]["id"] | null;

const MAX_CHARS = 5000;
const MIN_CHARS = 10;
const MAX_IMAGES = 5;

interface FeedbackDialogProps {
  open: boolean;
  onClose: () => void;
  /** Override the default GitHub repo target. */
  githubOwner?: string;
  githubRepo?: string;
}

export default function FeedbackDialog({
  open,
  onClose,
  githubOwner = GITHUB_OWNER,
  githubRepo = GITHUB_REPO,
}: FeedbackDialogProps) {
  const { t } = useTranslation("feedback");
  const { t: tCommon } = useTranslation("common");

  const [fullName, setFullName] = useState("");
  const [category, setCategory] = useState<Category>("general");
  const [message, setMessage] = useState("");
  const [sentiment, setSentiment] = useState<Sentiment>(null);
  const [attachScreenshot, setAttachScreenshot] = useState(true);
  const [images, setImages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [appVersion, setAppVersion] = useState("");
  const [osInfo, setOsInfo] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setFullName("");
      setCategory("general");
      setMessage("");
      setSentiment(null);
      setAttachScreenshot(true);
      setImages([]);
      setPreviews([]);
      setSubmitting(false);
      setSubmitted(false);
      setError("");

      getAppVersion().then(setAppVersion);
      getOsInfo().then(setOsInfo);
    }
  }, [open]);

  // Cleanup preview URLs
  useEffect(() => {
    return () => {
      previews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previews]);

  const addImage = (file: File) => {
    setImages((prev) => {
      if (prev.length >= MAX_IMAGES) return prev;
      return [...prev, file];
    });
    setPreviews((prev) => {
      if (prev.length >= MAX_IMAGES) return prev;
      return [...prev, URL.createObjectURL(file)];
    });
  };

  const handleImageAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(addImage);
    e.target.value = "";
  };

  const handleImageRemove = (index: number) => {
    URL.revokeObjectURL(previews[index]);
    setImages((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Paste image into textarea (Ctrl-V) ─────────────────────────────
  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        const blob = item.getAsFile();
        if (blob) {
          e.preventDefault();
          // Give the pasted image a sensible name
          const ext = item.type.split("/")[1] || "png";
          const file = new File([blob], `pasted-${Date.now()}.${ext}`, { type: item.type });
          addImage(file);
        }
      }
    }
  };

  // ── Screenshot capture via html2canvas ─────────────────────────────
  const captureScreenshot = async (): Promise<File | null> => {
    try {
      const canvas = await html2canvas(document.body, {
        backgroundColor: null,
        logging: false,
        scale: window.devicePixelRatio || 1,
      });
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/png")
      );
      if (!blob) return null;
      return new File([blob], `screenshot-${Date.now()}.png`, { type: "image/png" });
    } catch (err) {
      console.warn("Screenshot capture failed:", err);
      return null;
    }
  };

  // ── Build GitHub issue body markdown ───────────────────────────────
  const buildIssueBody = (extraImages: File[]): string => {
    const lines: string[] = [];
    lines.push(message.trim());
    lines.push("");
    lines.push("---");
    lines.push("");
    if (fullName.trim()) lines.push(`**Reporter:** ${fullName.trim()}`);
    if (sentiment) {
      const s = SENTIMENTS.find((x) => x.id === sentiment);
      lines.push(`**Mood:** ${s?.emoji ?? ""} ${sentiment}`);
    }
    if (appVersion) lines.push(`**App version:** ${appVersion}`);
    if (osInfo) lines.push(`**OS:** ${osInfo}`);
    if (extraImages.length > 0) {
      lines.push("");
      lines.push(
        `**Screenshots:** ${extraImages.length} afbeelding(en) staan op je klembord — plak ze hierboven met **Ctrl+V** voordat je het issue indient.`
      );
    }
    return lines.join("\n");
  };

  // ── Copy images to clipboard (for paste-into-GitHub flow) ─────────
  const copyImagesToClipboard = async (files: File[]) => {
    if (files.length === 0) return;
    try {
      // Browser clipboard API supports a single image at a time
      const first = files[0];
      const item = new ClipboardItem({ [first.type]: first });
      await navigator.clipboard.write([item]);
    } catch (err) {
      console.warn("Clipboard write failed:", err);
    }
  };

  const handleSubmit = async () => {
    if (message.trim().length < MIN_CHARS) return;
    setSubmitting(true);
    setError("");

    try {
      // Optionally capture screenshot first
      const finalImages = [...images];
      if (attachScreenshot) {
        // Briefly close the modal-shadow on the screenshot so it doesn't dominate the capture
        const shot = await captureScreenshot();
        if (shot) finalImages.unshift(shot);
      }

      // Place first image on clipboard so user can paste into GitHub
      if (finalImages.length > 0) {
        await copyImagesToClipboard(finalImages);
      }

      // Build the issue URL
      const title = (category === "bug" ? "[Bug] " : category === "feature" ? "[Feature] " : "") +
        message.trim().split(/\n/)[0].slice(0, 60);
      const body = buildIssueBody(finalImages);
      const label = CATEGORY_LABELS[category].gitLabel;

      const url = `https://github.com/${githubOwner}/${githubRepo}/issues/new?` +
        `title=${encodeURIComponent(title)}` +
        `&body=${encodeURIComponent(body)}` +
        `&labels=${encodeURIComponent(label)}`;

      await openExternal(url);
      setSubmitted(true);
    } catch (err) {
      console.error(err);
      setError(t("errorGeneric", "Er ging iets mis. Probeer het later opnieuw."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendAnother = () => {
    setFullName("");
    setCategory("general");
    setMessage("");
    setSentiment(null);
    setAttachScreenshot(true);
    setImages([]);
    setPreviews([]);
    setSubmitted(false);
    setError("");
  };

  const canSubmit = message.trim().length >= MIN_CHARS && !submitting;
  const charCount = message.length;
  const charWarning = charCount >= 4500;

  const footer = !submitted ? (
    <>
      <button className="feedback-btn feedback-btn-secondary" onClick={onClose}>
        {tCommon("cancel")}
      </button>
      <button
        className="feedback-btn feedback-btn-primary"
        onClick={handleSubmit}
        disabled={!canSubmit}
      >
        {submitting
          ? t("submitting", "Bezig...")
          : t("submitToGithub", "Open GitHub issue")}
      </button>
    </>
  ) : undefined;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("title", "Feedback")}
      width={520}
      className="feedback-dialog"
      footer={footer}
    >
      {submitted ? (
        <div className="feedback-success">
          <div className="feedback-success-emoji">{"\u{2705}"}</div>
          <h3>{t("successTitle", "GitHub issue geopend")}</h3>
          <p>
            {t(
              "githubSuccessMessage",
              "Je browser is geopend met een vooringevulde issue. Plak de screenshot(s) met Ctrl+V in het GitHub-editorscherm en klik op 'Submit new issue'."
            )}
          </p>
          <button className="feedback-btn feedback-btn-primary" onClick={handleSendAnother}>
            {t("sendAnother", "Nog een feedback")}
          </button>
        </div>
      ) : (
        <div className="feedback-content">
          {/* Name */}
          <div className="feedback-section">
            <div className="feedback-field-row">
              <label className="feedback-field-label">{t("fullName", "Naam (optioneel)")}</label>
              <input
                type="text"
                className="feedback-input"
                placeholder={t("fullNamePlaceholder", "Je naam")}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
          </div>

          {/* Category */}
          <div className="feedback-section">
            <div className="feedback-categories">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  className={`feedback-category${category === cat ? " active" : ""}`}
                  onClick={() => setCategory(cat)}
                >
                  <span style={{ marginRight: 4 }}>{CATEGORY_LABELS[cat].emoji}</span>
                  {t(`category${cat.charAt(0).toUpperCase() + cat.slice(1)}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Message with paste support */}
          <div className="feedback-section">
            <textarea
              className="feedback-textarea"
              placeholder={t(
                "messagePlaceholder",
                "Beschrijf je feedback hier. Tip: druk Ctrl+V om een afbeelding uit je klembord toe te voegen."
              )}
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, MAX_CHARS))}
              onPaste={handlePaste}
              rows={6}
            />
            <div className={`feedback-char-count${charWarning ? " warning" : ""}`}>
              {charCount}/{MAX_CHARS}
            </div>
          </div>

          {/* Screenshot checkbox */}
          <div className="feedback-section">
            <label className="feedback-checkbox-row">
              <input
                type="checkbox"
                checked={attachScreenshot}
                onChange={(e) => setAttachScreenshot(e.target.checked)}
              />
              <span>
                {t(
                  "attachScreenshot",
                  "Huidige schermafbeelding meesturen"
                )}
              </span>
            </label>
            <p className="feedback-hint">
              {t(
                "screenshotHint",
                "De screenshot wordt op je klembord gezet — plak hem met Ctrl+V in het GitHub-editorvenster."
              )}
            </p>
          </div>

          {/* Extra images */}
          <div className="feedback-section">
            <div className="feedback-images-row">
              <button
                className="feedback-attach-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={images.length >= MAX_IMAGES}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                {t("attachImages", "Afbeelding(en) toevoegen")}
              </button>
              <span className="feedback-image-limit">
                {t("imageLimit", `Max ${MAX_IMAGES}`)}
              </span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: "none" }}
              onChange={handleImageAdd}
            />
            {previews.length > 0 && (
              <div className="feedback-previews">
                {previews.map((src, i) => (
                  <div key={i} className="feedback-preview">
                    <img src={src} alt="" />
                    <button className="feedback-preview-remove" onClick={() => handleImageRemove(i)}>
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sentiment */}
          <div className="feedback-section">
            <div className="feedback-sentiment-label">{t("sentiment")}</div>
            <div className="feedback-sentiments">
              {SENTIMENTS.map((s) => (
                <button
                  key={s.id}
                  className={`feedback-sentiment${sentiment === s.id ? " active" : ""}`}
                  onClick={() => setSentiment(sentiment === s.id ? null : s.id)}
                  title={t(`sentiment${s.id.charAt(0).toUpperCase() + s.id.slice(1)}`)}
                >
                  <span className="feedback-sentiment-emoji">{s.emoji}</span>
                  <span className="feedback-sentiment-text">
                    {t(`sentiment${s.id.charAt(0).toUpperCase() + s.id.slice(1)}`)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {error && <div className="feedback-error">{error}</div>}
        </div>
      )}
    </Modal>
  );
}
