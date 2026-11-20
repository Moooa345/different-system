interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
  className?: string;
}

const sizes = {
  sm: { badge: 'size-9 rounded-lg p-0.5', mark: 'size-8', text: 'text-sm' },
  md: { badge: 'size-11 rounded-xl p-0.5', mark: 'size-10', text: 'text-base' },
  lg: { badge: 'size-24 rounded-2xl p-1', mark: 'size-[5.5rem]', text: 'text-2xl' },
};

export function BrandLogo({ size = 'md', showWordmark = true, className = '' }: BrandLogoProps) {
  const style = sizes[size];
  return <span className={`inline-flex items-center gap-2.5 ${className}`}>
    <span className={`${style.badge} inline-grid shrink-0 place-items-center border border-amber-500/30 bg-[#0E0E0D] ring-1 ring-amber-500/10`}>
      <img src="/logo-mark.png" alt="" aria-hidden="true" className={`${style.mark} rounded-md object-cover`} />
    </span>
    {showWordmark && <span className={`${style.text} font-serif font-bold tracking-wide text-stone-900 dark:text-stone-100`}>Different Store</span>}
  </span>;
}
