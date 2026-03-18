import { getData } from '../data/loader.js';

let _allKeywords = null;

function getAllKeywords() {
  if (!_allKeywords) {
    const kw = getData().sensitiveKeywords;
    _allKeywords = [...kw.zh, ...kw.en.map((k) => k.toLowerCase())];
  }
  return _allKeywords;
}

/**
 * Check page content for sensitive keywords and password inputs.
 * @param {{ pageData: { title?: string, metaKeywords?: string, metaDescription?: string, hasPasswordInput?: boolean } }} ctx
 * @returns {Array<{ id: string, score: number, detail: string|null }>}
 */
export function checkPageContent(ctx) {
  const results = [];
  const { pageData } = ctx;
  if (!pageData) return results;

  const textToCheck = [
    pageData.title || '',
    pageData.metaKeywords || '',
    pageData.metaDescription || '',
  ].join(' ').toLowerCase();

  const matchedKeyword = getAllKeywords().find((kw) => textToCheck.includes(kw.toLowerCase()));
  if (matchedKeyword) {
    results.push({ id: 'sensitive-keyword', score: 20, detail: matchedKeyword });
  }

  if (pageData.hasPasswordInput) {
    results.push({ id: 'password-input', score: 20, detail: null });
  }

  return results;
}
