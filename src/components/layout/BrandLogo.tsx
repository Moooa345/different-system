interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
  className?: string;
}

const sizes = {
  sm: { mark: 'size-9', title: 'text-[11px]' },
  md: { mark: 'size-11', title: 'text-xs' },
  lg: { mark: 'size-24', title: 'text-2xl' },
};

export function BrandLogo({ size = 'md', showWordmark = true, className = '' }: BrandLogoProps) {
  const style = sizes[size];
  return <span className={`group inline-flex items-center gap-2.5 ${className}`}>
    <img src="/logo-mark-transparent.png" alt="" aria-hidden="true" className={`${style.mark} shrink-0 object-contain brightness-[0.55] contrast-125 transition-transform duration-300 group-hover:scale-[1.04] dark:brightness-100 dark:contrast-100`} />
    {showWordmark && <>
      <span aria-hidden="true" className="h-7 w-px shrink-0 bg-current opacity-[0.15]" />
      <span dir="ltr" className="flex flex-col items-start text-start">
        <span className={`${style.title} font-serif font-medium leading-none tracking-[0.18em] text-stone-900 dark:text-stone-100`}>DIFFERENT</span>
        <span className="mt-1 text-[9px] font-medium leading-none tracking-[0.38em] text-[#8A6D35] transition-colors duration-300 group-hover:text-[#6D5428] dark:text-[#C8A86B] dark:group-hover:text-[#E0C27F] sm:text-[10px]">STORE</span>
      </span>
    </>}
  </span>;
}
