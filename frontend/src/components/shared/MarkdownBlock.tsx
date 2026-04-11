/**
 * Lightweight markdown renderer — handles the subset returned by Elfa AI chat.
 * Supports: ## headers, **bold**, [link](url) stripped to text, --- dividers,
 * bullet lists, and plain paragraphs.
 */

interface Props {
  content: string;
  className?: string;
}

function stripLinks(text: string): string {
  // Remove [text](url) — keep just text; also strip bare URLs in brackets
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")  // [text](url) → text
    .replace(/\[([^\]]+)\]/g, "$1")            // [text] → text
    .trim();
}

function parseLine(line: string, key: number): React.ReactNode {
  // Apply inline bold: **text**
  const parts = line.split(/(\*\*[^*]+\*\*)/g);
  if (parts.length === 1) return <span key={key}>{line}</span>;
  return (
    <span key={key}>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**")
          ? <strong key={i} className="font-semibold text-aegis-text">{p.slice(2, -2)}</strong>
          : <span key={i}>{p}</span>
      )}
    </span>
  );
}

export function MarkdownBlock({ content, className = "" }: Props) {
  const lines = content.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const line = stripLinks(raw);

    if (!line.trim()) {
      i++;
      continue;
    }

    // h1
    if (line.startsWith("# ")) {
      nodes.push(
        <h2 key={i} className="mt-4 mb-2 font-display text-sm font-bold text-aegis-text">
          {parseLine(line.slice(2), 0)}
        </h2>
      );
      i++;
      continue;
    }

    // h2
    if (line.startsWith("## ")) {
      nodes.push(
        <h3 key={i} className="mt-4 mb-1.5 font-display text-xs font-bold uppercase tracking-wide text-aegis-accent">
          {parseLine(line.slice(3), 0)}
        </h3>
      );
      i++;
      continue;
    }

    // h3
    if (line.startsWith("### ")) {
      nodes.push(
        <h4 key={i} className="mt-3 mb-1 font-display text-xs font-semibold text-aegis-text">
          {parseLine(line.slice(4), 0)}
        </h4>
      );
      i++;
      continue;
    }

    // Horizontal rule
    if (line.trim() === "---") {
      nodes.push(<hr key={i} className="my-3 border-aegis-border" />);
      i++;
      continue;
    }

    // Bullet list item
    if (line.startsWith("- ") || line.startsWith("* ")) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && (lines[i].startsWith("- ") || lines[i].startsWith("* "))) {
        const itemText = stripLinks(lines[i].slice(2));
        items.push(
          <li key={i} className="flex gap-2 text-xs leading-relaxed text-aegis-muted">
            <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-aegis-accent" />
            <span>{parseLine(itemText, 0)}</span>
          </li>
        );
        i++;
      }
      nodes.push(<ul key={`ul-${i}`} className="my-2 space-y-1.5">{items}</ul>);
      continue;
    }

    // TL;DR bold summary line
    if (line.startsWith("**") && line.endsWith("**")) {
      nodes.push(
        <p key={i} className="my-2 text-xs font-semibold leading-relaxed text-aegis-text">
          {line.slice(2, -2)}
        </p>
      );
      i++;
      continue;
    }

    // Regular paragraph
    if (line.trim()) {
      nodes.push(
        <p key={i} className="my-1.5 text-xs leading-relaxed text-aegis-muted">
          {parseLine(line, 0)}
        </p>
      );
    }
    i++;
  }

  return <div className={`space-y-0.5 ${className}`}>{nodes}</div>;
}
