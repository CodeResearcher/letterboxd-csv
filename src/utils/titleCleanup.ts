/**
 * Disc-product titles are full of retailer and packaging noise. This strips it
 * before we hand the title to TMDB, whose search is sensitive to extra words.
 *
 * Deliberately conservative: only remove tokens that are never part of a real
 * film title, and never remove so much that the title becomes empty.
 */
const NOISE_PATTERNS: RegExp[] = [
  // Format / packaging words, with optional surrounding brackets or parens.
  /\b(?:blu[\s-]?ray|bluray|dvd|uhd|4k(?:\s+ultra\s+hd)?|ultra\s+hd|hd\s+dvd|dvd[\s-]?r)\b/gi,
  // Edition / re-release wording.
  /\b(?:special|collector'?s|limited|anniversary|deluxe|ultimate|extended|remastered|restored|unrated|uncut|director'?s)\s+edition\b/gi,
  /\b(?:steelbook|digibook|digipak|slipcase|slipcover|box\s*set|boxset|gift\s*set)\b/gi,
  /\b(?:widescreen|full\s*screen|anamorphic|letterbox(?:ed)?)\b/gi,
  // Region and disc-count markers.
  /\bregion\s*[a-z0-9]\b/gi,
  /\b\d+\s*-?\s*disc(?:\s+set)?\b/gi,
  /\b\d+\s*-?\s*disc\s+(?:special\s+)?edition\b/gi,
  /\bdisc\s+\d+\b/gi,
  // Rating / compliance logos that end up in product titles.
  /\b(?:pg|pg-?13|r|nc-?17|g|tv-?ma|tv-?14|12|15|18)\b(?=\s*$)/i,
  /\b(?:fsk|bbfc|ifco)\s*\d*\b/gi,
  // Retailer phrases.
  /\b(?:new|sealed|used|import|re-?release|only\s+at|exclusive|walmart|target|best\s+buy)\b/gi,
];

/** Bracket groups that hold only noise words, e.g. "(Blu-ray + DVD)". */
const BRACKET_GROUP = /[([{][^)\]}]*(?:blu[\s-]?ray|dvd|uhd|4k|region|disc|edition|steelbook|digital)[^)\]}]*[)\]}]/gi;

export function cleanTitle(raw: string): string {
  if (!raw) return "";
  let title = raw;

  // Normalise punctuation that shows up in scraped listings.
  title = title.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
  title = title.replace(/\s*[|/]\s*(?:blu[\s-]?ray|dvd|4k|uhd).*$/i, "");

  title = title.replace(BRACKET_GROUP, " ");
  for (const pattern of NOISE_PATTERNS) title = title.replace(pattern, " ");

  title = title
    .replace(/[_]+/g, " ")
    .replace(/\s*[-–—:]\s*$/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();

  // A title that lost everything keeps the original rather than nothing.
  const letters = title.replace(/[^A-Za-z0-9]/g, "");
  return letters.length >= 2 ? title : raw.trim();
}