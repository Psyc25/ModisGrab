import React from 'react';

/**
 * Komponen dasar dengan pola aplikasi Grab:
 * tombol hijau penuh di bawah layar, chip pilihan, pemisah abu-abu 8px, dan judul bagian.
 */

export const PrimaryButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ className = '', children, ...rest }) => (
  <button
    {...rest}
    className={`w-full h-14 px-6 rounded-xl btn-primary text-white font-display font-bold text-[17px] tracking-[-0.01em] flex items-center justify-center gap-2 disabled:bg-[#C9CDD2] disabled:shadow-none ${className}`}
  >
    {children}
  </button>
);

export const SecondaryButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ className = '', children, ...rest }) => (
  <button
    {...rest}
    className={`w-full h-12 px-5 rounded-xl bg-white border border-[#D5D8DC] text-ink font-semibold text-[15px] hover:bg-canvas transition-colors flex items-center justify-center gap-2 ${className}`}
  >
    {children}
  </button>
);

export const BottomBar: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div
    className={`sticky bottom-0 left-0 right-0 z-30 mt-auto bg-white px-4 sm:px-6 pt-3 safe-bottom shadow-[0_-1px_0_#EBEBEB,0_-8px_20px_rgba(0,0,0,0.05)] ${className}`}
  >
    {children}
  </div>
);

export const SectionGap: React.FC = () => <div className="h-2 bg-canvas shrink-0" aria-hidden="true" />;

export const SectionTitle: React.FC<{ children: React.ReactNode; action?: React.ReactNode; className?: string }> = ({
  children,
  action,
  className = '',
}) => (
  <div className={`flex items-end justify-between gap-3 ${className}`}>
    <h2 className="font-display text-[19px] font-bold text-ink tracking-[-0.01em] leading-tight">{children}</h2>
    {action}
  </div>
);

export const Chip: React.FC<{
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}> = ({ selected, onClick, children, className = '' }) => (
  <button
    type="button"
    aria-pressed={selected}
    onClick={onClick}
    className={`min-h-[44px] px-4 rounded-full text-[15px] transition-colors text-center border ${
      selected
        ? 'bg-grab-tint border-grab text-grab-deep font-semibold'
        : 'bg-white border-[#D5D8DC] text-ink font-medium hover:border-ink-3'
    } ${className}`}
  >
    {children}
  </button>
);

export const fieldCls = (hasError: boolean) =>
  `w-full h-14 px-4 text-[16px] rounded-[10px] border outline-none transition-colors placeholder:text-ink-3 ${
    hasError
      ? 'bg-[#FDF1F1] border-modis-red'
      : 'bg-canvas border-transparent focus:bg-white focus:border-grab'
  }`;

export const FieldError: React.FC<{ children?: React.ReactNode }> = ({ children }) =>
  children ? <p className="mt-1.5 text-[13px] text-modis-red font-medium">{children}</p> : null;

/** Bendera Indonesia kecil (CSS), karena emoji bendera tidak tampil di Windows. */
export const FlagID: React.FC = () => (
  <span className="inline-flex flex-col w-6 h-4 rounded-[3px] overflow-hidden ring-1 ring-black/10 shrink-0" aria-hidden="true">
    <span className="flex-1 bg-[#E70011]" />
    <span className="flex-1 bg-white" />
  </span>
);
