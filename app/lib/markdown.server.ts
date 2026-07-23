import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

marked.setOptions({ breaks: true, gfm: true });

/** Render trusted-but-verified markdown (event descriptions, written by admins) to sanitized HTML. */
export function renderMarkdown(markdown: string): string {
  const rawHtml = marked.parse(markdown, { async: false }) as string;
  return sanitizeHtml(rawHtml, {
    allowedTags: [
      "p", "br", "strong", "em", "b", "i", "u", "s", "del",
      "ul", "ol", "li", "a", "code", "pre", "blockquote",
      "h1", "h2", "h3", "h4", "hr",
    ],
    allowedAttributes: { a: ["href", "target", "rel"] },
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }),
    },
  });
}
