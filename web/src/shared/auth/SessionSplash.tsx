'use client';

import { motion } from 'motion/react';
import { BrandMark } from '@/shared/components/BrandMark';

/** The one screen shown while a session is being established or verified.
 *
 *  Sign-in used to hand off between two different full-page states -- a light one
 *  on the callback and a near-black terminal one behind the workspace -- so the
 *  first thing a new user saw was the product changing its mind about what it
 *  looks like. This is that moment, once, in the product's own palette.
 */
export function SessionSplash({ message }: { message: string }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-6 text-center">
      <div className="flex w-full max-w-xs flex-col items-center gap-5">
        {/* The product's own mark. A letter in a rounded square stood in for it
            here, so the first screen after signing in showed a placeholder. */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          <BrandMark className="size-16 rounded-2xl object-contain" />
        </motion.div>

        <div className="w-full">
          <p role="status" className="text-[length:calc(13.5px*var(--font-scale))] text-muted-foreground">{message}</p>
          {/* An indeterminate sweep rather than a spinner: this wait has no
              progress to report, and a bar sized to the copy reads as the page
              settling instead of as something stalling. */}
          <div aria-hidden="true" className="mt-3 h-1 w-full overflow-hidden rounded-full bg-border/60">
            <motion.span
              className="block h-full w-1/3 rounded-full bg-primary motion-reduce:hidden"
              initial={{ x: '-100%' }}
              animate={{ x: ['-100%', '300%'] }}
              transition={{ duration: 1.4, ease: 'easeInOut', repeat: Infinity }}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
