'use client';

import { useEffect, useState } from 'react';
import { fetchTerminology, type TerminologyMap } from '@/shared/api/terminology';

/** The provider's closed vocabulary, or an empty map until it arrives.
 *
 *  Empty is a working state, not a failure: `projectFieldGroups` falls back to
 *  the editor's built-in option list, which is what it used before the
 *  provider published one.
 */
export function useTerminology(): TerminologyMap {
  const [terminology, setTerminology] = useState<TerminologyMap>({});

  useEffect(() => {
    let cancelled = false;
    void fetchTerminology().then((value) => { if (!cancelled) setTerminology(value); });
    return () => { cancelled = true; };
  }, []);

  return terminology;
}
