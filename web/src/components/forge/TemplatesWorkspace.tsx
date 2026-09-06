import { secondaryPageClass, secondaryPanelClass } from './secondarySurfaceStyles';
import { useT } from '@/shared/i18n';

export function TemplatesWorkspace() {
  const t = useT();
  return (
    <section className={secondaryPageClass}>
      <div className="mx-auto w-full max-w-7xl">
        <header className="mb-6">
          <h1 className="font-serif text-3xl font-semibold tracking-tight">{t('templates.title')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t('templates.subtitle')}
          </p>
        </header>

        <div className={`${secondaryPanelClass} max-w-2xl px-6 py-8`}>
          <h2 className="text-sm font-semibold">{t('templates.empty')}</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            {t('templates.emptyBody')}
          </p>
        </div>
      </div>
    </section>
  );
}
