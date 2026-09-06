type BrandMarkProps = {
  className?: string;
  testId?: string;
};

export function BrandMark({ className, testId }: BrandMarkProps) {
  return (
    // Decorative local identity asset with CSS-controlled dimensions.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/worker-avatar.png"
      alt=""
      aria-hidden="true"
      data-testid={testId}
      className={className}
    />
  );
}
