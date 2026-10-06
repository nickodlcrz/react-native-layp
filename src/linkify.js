// Splits plain text into plain and link segments so URLs can be made
// tappable. Pure (no React Native imports) so it can be unit tested.
//
// Recognizes links that start with http://, https:// or www. -- bare
// domains like "notes.txt" are deliberately left alone, since they look
// like file names as often as web addresses.

const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>]+/gi;

// Sentence punctuation that commonly follows a link but isn't part of it.
const TRAILING_PUNCTUATION = /[.,;:!?'"]+$/;
const CLOSERS = { ")": "(", "]": "[", "}": "{" };

function count(str, ch) {
  let n = 0;
  for (const c of str) if (c === ch) n += 1;
  return n;
}

// "(see https://x.com/a)" -> link is "https://x.com/a", not "...a)".
// But "https://en.wikipedia.org/wiki/Foo_(bar)" keeps its own ")".
function trimUrl(raw) {
  let url = raw;
  for (;;) {
    const before = url;
    url = url.replace(TRAILING_PUNCTUATION, "");
    const last = url[url.length - 1];
    if (last && CLOSERS[last] && count(url, last) > count(url, CLOSERS[last])) {
      url = url.slice(0, -1);
    }
    if (url === before) break;
  }
  return url;
}

// Returns [{ text, url }] where url is null for plain text. Joining every
// `text` back together always reproduces the input exactly.
export function linkify(input) {
  const text = input == null ? "" : String(input);
  const parts = [];
  let cursor = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const shown = trimUrl(match[0]);
    // Nothing but a scheme/"www." left after trimming -- not a real link.
    if (!/^(?:https?:\/\/|www\.)\S*[^\s/.]/i.test(shown) || /^(?:https?:\/\/|www\.)$/i.test(shown)) continue;
    const start = match.index;
    if (start > cursor) parts.push({ text: text.slice(cursor, start), url: null });
    parts.push({ text: shown, url: /^www\./i.test(shown) ? `https://${shown}` : shown });
    cursor = start + shown.length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), url: null });
  return parts;
}
