import { useEffect, useRef, useCallback, type ReactNode } from "react";
import "./Modal.css";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  width?: number;
  height?: number | string;
  className?: string;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Stapel van de open dialogen, in de volgorde waarin ze verschenen.
 *
 * Elke dialoog luistert op het document naar Escape. Staat er een dialoog
 * ín een dialoog — de profieleditor boven de profielkiezer bijvoorbeeld —
 * dan hoorden beide die toets en klapten ze samen weg. Alleen de bovenste
 * hoort te sluiten; de onderliggende blijft staan, zoals overal gebruikelijk.
 */
const openDialogen: symbol[] = [];

/**
 * Staat er een dialoog open?
 *
 * Het canvas luistert op het document naar sneltoetsen, en Escape wist daar
 * de selectie. Stond er een dialoog open, dan verdween daarmee ook het
 * eigenschappenpaneel eronder — en dus de dialoog zelf, midden in het werk.
 * Het canvas laat zijn sneltoetsen met rust zolang deze functie waar is.
 */
export function erIsEenDialoogOpen(): boolean {
  return openDialogen.length > 0;
}

export default function Modal({
  open,
  onClose,
  title,
  width = 480,
  height,
  className,
  children,
  footer,
}: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  // Eigen plaats in de stapel; een symbol zodat twee dialogen nooit botsen.
  const eigenId = useRef<symbol>(undefined as unknown as symbol);
  if (!eigenId.current) eigenId.current = Symbol("modal");

  // In- en uitschrijven bij de stapel, zolang de dialoog open is.
  useEffect(() => {
    if (!open) return;
    const id = eigenId.current;
    openDialogen.push(id);
    return () => {
      const i = openDialogen.lastIndexOf(id);
      if (i >= 0) openDialogen.splice(i, 1);
    };
  }, [open]);

  const handleHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".modal-close-btn")) return;
    isDragging.current = true;
    const rect = dialogRef.current!.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    e.preventDefault();
  }, []);

  useEffect(() => {
    if (!open) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !dialogRef.current || !overlayRef.current) return;
      const overlayRect = overlayRef.current.getBoundingClientRect();
      const dialogRect = dialogRef.current.getBoundingClientRect();
      let newX = e.clientX - overlayRect.left - dragOffset.current.x;
      let newY = e.clientY - overlayRect.top - dragOffset.current.y;
      newX = Math.max(0, Math.min(newX, overlayRect.width - dialogRect.width));
      newY = Math.max(0, Math.min(newY, overlayRect.height - dialogRect.height));
      dialogRef.current.style.left = newX + "px";
      dialogRef.current.style.top = newY + "px";
      dialogRef.current.style.transform = "none";
      dialogRef.current.style.position = "absolute";
    };

    const handleMouseUp = () => {
      isDragging.current = false;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Alleen de bovenste dialoog reageert; een dialoog eronder blijft staan.
      if (e.key !== "Escape") return;
      if (openDialogen[openDialogen.length - 1] !== eigenId.current) return;
      onClose();
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  // Reset position when reopened
  useEffect(() => {
    if (open && dialogRef.current) {
      dialogRef.current.style.left = "50%";
      dialogRef.current.style.top = "50%";
      dialogRef.current.style.transform = "translate(-50%, -50%)";
      dialogRef.current.style.position = "absolute";
    }
  }, [open]);

  if (!open) return null;

  const style: React.CSSProperties = { width };
  if (height) style.height = height;

  return (
    <div className="modal-overlay" ref={overlayRef}>
      <div
        className={`modal-dialog${className ? ` ${className}` : ""}`}
        ref={dialogRef}
        style={style}
      >
        <div className="modal-header" onMouseDown={handleHeaderMouseDown}>
          <h2>{title}</h2>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
