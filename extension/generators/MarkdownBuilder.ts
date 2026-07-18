export class MarkdownBuilder {
  private readonly parts: string[] = [];

  heading(level: 1 | 2 | 3 | 4 | 5 | 6, text: string): this {
    this.parts.push(`${'#'.repeat(level)} ${text}`);
    return this;
  }

  paragraph(text: string): this {
    this.parts.push(text);
    return this;
  }

  /** Plain bold label: value — kept for compatibility. */
  badge(label: string, value: string): this {
    this.parts.push(`**${label}:** ${value}`);
    return this;
  }

  /**
   * Renders a row of shields.io image badges on one line.
   * Each entry: { alt, label, message, color, extra? }
   */
  shieldBadges(
    badges: Array<{ alt: string; label: string; message: string; color: string; extra?: string }>,
  ): this {
    const imgs = badges.map(({ alt, label, message, color, extra = '' }) => {
      const l = MarkdownBuilder.shieldEncode(label);
      const m = MarkdownBuilder.shieldEncode(message);
      return `![${alt}](https://img.shields.io/badge/${l}-${m}-${color}?style=flat-square${extra})`;
    });
    this.parts.push(imgs.join(' '));
    return this;
  }

  static shieldEncode(s: string): string {
    return s.replace(/-/g, '--').replace(/_/g, '__').replace(/ /g, '_');
  }

  list(items: string[]): this {
    this.parts.push(items.map((item) => `- ${item}`).join('\n'));
    return this;
  }

  table(headers: string[], rows: string[][]): this {
    const header = `| ${headers.join(' | ')} |`;
    const separator = `| ${headers.map(() => '---').join(' | ')} |`;
    const body = rows.map((row) => `| ${row.join(' | ')} |`).join('\n');

    this.parts.push([header, separator, body].filter(Boolean).join('\n'));
    return this;
  }

  codeBlock(language: string, code: string): this {
    this.parts.push(`\`\`\`${language}\n${code}\n\`\`\``);
    return this;
  }

  /** Renders a Mermaid diagram block — rendered as a chart on GitHub. */
  mermaid(chart: string): this {
    return this.codeBlock('mermaid', chart);
  }

  hr(): this {
    this.parts.push('---');
    return this;
  }

  link(text: string, url: string): string {
    return `[${text}](${url})`;
  }

  build(): string {
    return `${this.parts.join('\n\n')}\n`;
  }
}
