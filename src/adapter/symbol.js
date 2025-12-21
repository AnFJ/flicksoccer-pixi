/**
 * 简单的 Symbol polyfill，防止在低版本环境或某些适配器中报错
 */
let idCounter = 0;

export default function SymbolPolyfill(key) {
  return `@@${key}_${idCounter++}`;
}

SymbolPolyfill.iterator = '@@iterator';

if (typeof Symbol === 'undefined') {
  // @ts-ignore
  global.Symbol = SymbolPolyfill;
}