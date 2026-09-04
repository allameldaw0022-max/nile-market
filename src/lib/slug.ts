// Keeps Arabic (and any other) letters as-is -- only strips characters that
// are unsafe in a URL path segment and collapses whitespace to hyphens.
// Next.js/the browser percent-encode the rest automatically.
export function slugify(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[/?#\\%]/g, "")
    .toLowerCase();
}
