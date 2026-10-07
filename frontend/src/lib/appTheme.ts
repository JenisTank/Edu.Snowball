import { applyTheme, saveTheme, THEMES, type Theme } from '@snowball/ui/theme';
export const BUMBLEB_THEME: Theme = { id:'bumbleb',name:'BumbleB',bg:'#FBF8F1',bg2:'#F8EDCD',sunken:'#EFE1B9',row:'#F8EDCD',rowHover:'#F1E6C9',accent:'#A97716',accent2:'#8A6410',txt:'#1F1B13',txt2:'#57534E',txt3:'#78716C',ok:'#047857',warn:'#A16207',danger:'#BE123C',info:'#0E7490',violet:'#6D28D9',depth:65 };
const builtIn=(id:string)=>THEMES.find(t=>t.id===id)!;
export const APP_THEMES:Theme[]=[BUMBLEB_THEME,builtIn('snowball-dark'),builtIn('snowball-light')];
export function selectTheme(theme:Theme){applyTheme(theme);saveTheme(theme);window.dispatchEvent(new CustomEvent('snowball-theme',{detail:theme}));}
