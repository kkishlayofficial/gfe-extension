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

  badge(label: string, value: string): this {
    this.parts.push(`**${label}:** ${value}`);
    return this;
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
