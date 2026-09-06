import { THEME_STORAGE_KEY } from './applyPreferences';

/** Runs before first paint, inline in <head>.
 *
 *  Without it the document paints with the light tokens and then swaps, which
 *  is a white flash on every load for anyone using the dark theme. It is
 *  deliberately dependency-free and total: any failure leaves the markup
 *  untouched, and untouched markup is the light baseline.
 */
export const themeScript = `(function(){try{
var r=document.documentElement;
var s=JSON.parse(localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})||'{}');
var a=s.appearance||{};
var c=a.theme||'light';
var t=c==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):(c==='dark'?'dark':'light');
r.dataset.theme=t;r.dataset.themeChoice=c;r.style.colorScheme=t;
r.dataset.density=a.density==='compact'?'compact':'comfortable';
var m=a.motion||'system';
r.dataset.motion=m==='system'?(matchMedia('(prefers-reduced-motion: reduce)').matches?'reduce':'full'):(m==='reduce'?'reduce':'full');
r.dataset.fontScale=(a.fontScale==='sm'||a.fontScale==='lg')?a.fontScale:'md';
var l=(s.locale||{}).language;if(l==='en'||l==='vi')r.lang=l;
}catch(e){}})();`;
