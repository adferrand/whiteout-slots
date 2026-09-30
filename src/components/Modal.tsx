"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  /** Position key: colours the dialog with the day it belongs to. */
  day?: string;
  children: ReactNode;
};

/** Native <dialog>: focus trap, Escape and backdrop handled by the browser. */
export function Modal({ open, onClose, title, subtitle, day, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="modal"
      data-day={day}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="modal__body">
          <header className="modal__head">
            <div>
              <h2 id={titleId} className="modal__title">
                {title}
              </h2>
              {subtitle && <div className="modal__subtitle">{subtitle}</div>}
            </div>
            <button type="button" className="btn btn--quiet" onClick={onClose}>
              Close
            </button>
          </header>
          {children}
        </div>
      )}
    </dialog>
  );
}
