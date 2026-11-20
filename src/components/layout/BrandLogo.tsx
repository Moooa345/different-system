interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
  className?: string;
}

const sizes = {
  sm: { mark: 'size-9', text: 'text-sm' },
  md: { mark: 'size-11', text: 'text-base' },
  lg: { mark: 'size-24', text: 'text-2xl' },
};

export function BrandLogo({ size = 'md', showWordmark = true, className = '' }: BrandLogoProps) {
  const style = sizes[size];
  return <span className={`inline-flex items-center gap-2.5 ${className}`}>
    <img src="/logo-mark-transparent.png" alt="" aria-hidden="true" className={`${style.mark} shrink-0 object-contain brightness-[0.55] contrast-125 dark:brightness-100 dark:contrast-100`} />
    {showWordmark && <span className={`${style.text} font-serif font-bold tracking-wide text-stone-900 dark:text-stone-100`}>Different Store</span>}
  </span>;
}
