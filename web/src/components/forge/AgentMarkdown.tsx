'use client';

import { memo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Streamdown, type Components, type UrlTransform } from 'streamdown';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Renders an agent reply as markdown (CHATGPT-INTERACTION-SPEC §8).
 *
 * Uses `streamdown` rather than `react-markdown` because this text arrives a
 * token at a time. Streamdown splits the source into blocks and memoises each
 * one, so a reveal frame re-renders only the block that changed instead of
 * re-parsing the whole answer; it also renders a half-written construct (an
 * unclosed code fence, a dangling `**`) as the author intended rather than as
 * literal punctuation.
 *
 * **Safety.** Streamdown's *default* rehype chain is `raw -> sanitize -> harden`,
 * and its harden config ships `allowedImagePrefixes: ["*"]`. That would render
 * model-authored HTML, which CHATGPT-INTERACTION-SPEC §8 forbids outright.
 * Passing an EMPTY `rehypePlugins` list replaces that chain, which drops
 * `rehype-raw` and routes every html node through Streamdown's html-to-text
 * pass — so raw HTML is ESCAPED to literal text, byte-identical to the
 * `react-markdown` behaviour this replaced. The security posture is unchanged.
 *
 * Two further guards, both pinned by tests:
 *
 *  - `urlTransform`. Streamdown applies NO default url transform, where
 *    react-markdown@9 applies one unconditionally — so omitting this would
 *    silently LOSE protection we had. It is an allowlist of http/https, not a
 *    `javascript:` blocklist, because blocklists lose to `JaVaScRiPt:`,
 *    `java\tscript:` and entity-encoded variants.
 *  - `disallowedElements` as insurance against a future dependency bump
 *    changing the default plugin resolution.
 *
 * Deliberately not used: the `plugins` prop (cjk/code/math/mermaid — those are
 * the opt-in extensions that pull mermaid and shiki), and `createAnimatePlugin`,
 * whose per-word fade would layer a second reveal on top of `useStreamingText`
 * and simulate progress that already happened.
 */

const COPY_CONFIRMATION_MS = 1600;

/**
 * Empty on purpose: `rehypePlugins` REPLACES Streamdown's defaults rather than
 * appending to them, so this is what removes `rehype-raw` and leaves raw HTML
 * escaped as text.
 */
const NO_REHYPE_PLUGINS: NonNullable<ComponentProps<typeof Streamdown>['rehypePlugins']> = [];

/** Insurance only — with HTML escaped, markdown cannot emit these anyway. */
const DISALLOWED_ELEMENTS = [
  'script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'link', 'meta', 'img',
] as const;

const SAFE_URL_SCHEMES = ['http:', 'https:', 'mailto:'];

/** Drop any URL whose scheme is not plainly safe; relative URLs stay. */
const safeUrl: UrlTransform = (url: string) => {
  const value = url.trim();
  if (!value) return null;
  // A relative or anchor link cannot carry a scheme, so it is safe as-is.
  if (/^[./#?]/.test(value)) return value;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
  try {
    return SAFE_URL_SCHEMES.includes(new URL(value).protocol) ? value : null;
  } catch {
    return null;
  }
};

function CodeBlock({ children }: { children?: ReactNode }) {
  const bodyRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  const copy = () => {
    const text = bodyRef.current?.textContent ?? '';
    if (!text) return;
    void navigator.clipboard?.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), COPY_CONFIRMATION_MS);
  };

  return (
    <div className="relative my-4">
      <pre ref={bodyRef} className="overflow-x-auto rounded-xl bg-surface p-3 pr-12 text-[length:calc(12.5px*var(--font-scale))] leading-[1.55]">
        {children}
      </pre>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? 'Đã chép đoạn mã' : 'Chép đoạn mã'}
        className="absolute right-2 top-2 grid size-7 place-items-center rounded-md text-muted-foreground outline-none transition-colors duration-150 hover:bg-card hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        {copied ? <Check aria-hidden="true" className="size-3.5" /> : <Copy aria-hidden="true" className="size-3.5" />}
      </button>
    </div>
  );
}

/**
 * Hoisted to module scope on purpose. Rebuilding this object per render gives
 * the renderer a new prop identity every frame, which defeats block memoisation
 * however carefully the callers are memoised.
 */
const MARKDOWN_COMPONENTS: Components = {
  h1: ({ children }) => <h3 className="mt-7 mb-2 text-[length:calc(19px*var(--font-scale))] font-semibold leading-[1.35] tracking-tight first:mt-0">{children}</h3>,
  h2: ({ children }) => <h4 className="mt-7 mb-2 text-[length:calc(17px*var(--font-scale))] font-semibold leading-[1.35] tracking-tight first:mt-0">{children}</h4>,
  h3: ({ children }) => <h5 className="mt-6 mb-2 text-[length:calc(15px*var(--font-scale))] font-semibold leading-[1.4] first:mt-0">{children}</h5>,
  p: ({ children }) => <p className="my-4 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-4 list-disc space-y-2 pl-6 marker:text-muted-foreground first:mt-0 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="my-4 list-decimal space-y-2 pl-6 marker:text-muted-foreground first:mt-0 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => <del className="text-muted-foreground line-through">{children}</del>,
  blockquote: ({ children }) => <blockquote className="my-4 border-l-2 border-border pl-3 text-muted-foreground">{children}</blockquote>,
  hr: () => <hr className="my-6 border-border" />,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">
      {children}
    </a>
  ),
  code: ({ className: codeClassName, children }) => (
    // A fenced block arrives with a `language-*` class and is already inside
    // our `pre`; only inline code needs its own chip.
    codeClassName?.startsWith('language-')
      ? <code className={codeClassName}>{children}</code>
      : <code className="rounded bg-surface px-1 py-0.5 text-[0.9em]">{children}</code>
  ),
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  // The reading rail must never scroll horizontally, so a wide table scrolls
  // inside its own container instead of widening the column.
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto">
      <table className="w-full border-collapse text-[length:calc(13.5px*var(--font-scale))]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead>{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr>{children}</tr>,
  th: ({ children }) => <th className="border border-border bg-surface px-2.5 py-1.5 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border border-border px-2.5 py-1.5 align-top">{children}</td>,
};

export type AgentMarkdownProps = { children: string; className?: string; caret?: boolean };

function AgentMarkdownImpl({ children, className, caret = false }: AgentMarkdownProps) {
  return (
    <div
      data-agent-caret={caret ? 'true' : undefined}
      className={cn(
        'text-[length:calc(15px*var(--font-scale))] leading-[1.7] text-foreground/90',
        // Appended to the last rendered block so it sits at the true end of the
        // text, whatever element that turns out to be. Kept in the class list
        // rather than in `globals.css` — the blast radius is this column only.
        caret && "[&>*:last-child]:after:ml-0.5 [&>*:last-child]:after:animate-pulse [&>*:last-child]:after:content-['▍'] [&>*:last-child]:after:text-muted-foreground motion-reduce:[&>*:last-child]:after:content-['']",
        className,
      )}>
      <Streamdown
        // Streamdown's own memo comparator ignores `components`, so these must
        // be module-level constants: a fresh object each render is not merely
        // slow, it can be silently ignored and render stale output.
        components={MARKDOWN_COMPONENTS}
        rehypePlugins={NO_REHYPE_PLUGINS}
        disallowedElements={DISALLOWED_ELEMENTS as unknown as readonly string[]}
        urlTransform={safeUrl}
        // Streamdown's root carries `space-y-4`, which would double up with the
        // `my-4` block margins in the component map above.
        className="space-y-0"
      >
        {children}
      </Streamdown>
    </div>
  );
}

export const AgentMarkdown = memo(AgentMarkdownImpl);
AgentMarkdown.displayName = 'AgentMarkdown';
