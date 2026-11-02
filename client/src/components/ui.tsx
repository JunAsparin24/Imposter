import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { play } from '../lib/sound';

type Variant = 'primary' | 'grinch' | 'elf' | 'ghost' | 'outline' | 'gold';

const variants: Record<Variant, string> = {
  primary: 'bg-snow text-night-950 hover:bg-white',
  grinch: 'bg-grinch text-white hover:bg-grinch-light shadow-glow-red',
  elf: 'bg-elf text-night-950 hover:bg-elf-light shadow-glow-green',
  gold: 'bg-gold text-night-950 hover:brightness-110 shadow-glow-gold',
  outline: 'border border-white/15 bg-white/[0.03] text-snow hover:bg-white/[0.08]',
  ghost: 'text-night-300 hover:text-snow hover:bg-white/[0.06]',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  loading?: boolean;
  block?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  loading,
  block,
  className = '',
  children,
  disabled,
  onClick,
  ...rest
}: ButtonProps) {
  const sizes = {
    sm: 'h-10 px-3.5 text-sm rounded-xl gap-1.5',
    md: 'h-12 px-5 text-[15px] rounded-2xl gap-2',
    lg: 'h-14 px-6 text-base rounded-2xl gap-2.5',
  };
  return (
    <motion.button
      whileTap={disabled || loading ? undefined : { scale: 0.96 }}
      className={`inline-flex select-none items-center justify-center font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none ${sizes[size]} ${variants[variant]} ${block ? 'w-full' : ''} ${className}`}
      disabled={disabled || loading}
      onClick={(e) => {
        play('click');
        onClick?.(e);
      }}
      {...(rest as object)}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </motion.button>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent ${className}`}
      aria-hidden
    />
  );
}

/** A button that needs a second tap within 3s to fire (for destructive actions). */
export function ConfirmButton({
  onConfirm,
  confirmLabel = 'Tap again to confirm',
  children,
  ...rest
}: ButtonProps & { onConfirm: () => void; confirmLabel?: string }) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <Button
      {...rest}
      onClick={() => {
        if (armed) {
          clearTimeout(timer.current);
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
          timer.current = setTimeout(() => setArmed(false), 3000);
        }
      }}
    >
      {armed ? confirmLabel : children}
    </Button>
  );
}

/** Bottom sheet on phones, centered dialog on larger screens. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="relative flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-[28px] border border-white/10 bg-night-900 shadow-2xl sm:rounded-[28px]"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
              <h2 className="heading text-lg">{title}</h2>
              <button
                onClick={onClose}
                className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.06] text-night-300 hover:text-snow"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-4 pb-safe">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label className={`flex min-h-[52px] items-center justify-between gap-4 py-2 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold">{label}</span>
        {description && <span className="block text-xs text-night-300">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? 'bg-elf' : 'bg-night-600'}`}
      >
        <motion.span
          layout
          className="absolute top-1 h-5 w-5 rounded-full bg-white shadow"
          style={{ left: checked ? 24 : 4 }}
        />
      </button>
    </label>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={`h-10 min-w-[3rem] rounded-xl px-3 text-sm font-bold transition-colors disabled:opacity-50 ${
            value === o.value ? 'bg-snow text-night-950' : 'bg-white/[0.05] text-night-300 hover:text-snow'
          }`}
          aria-pressed={value === o.value}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Keeps primary actions reachable at the bottom of the screen on phones. */
export function ActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-20 -mx-4 mt-auto bg-gradient-to-t from-night-950 via-night-950/95 to-transparent px-4 pt-6 pb-safe">
      <div className="mx-auto flex max-w-md flex-col gap-2.5">{children}</div>
    </div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h3 className="label">{children}</h3>
      {right}
    </div>
  );
}
