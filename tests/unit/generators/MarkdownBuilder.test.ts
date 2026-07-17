import { describe, it, expect } from 'vitest';
import { MarkdownBuilder } from '../../../extension/generators/MarkdownBuilder';

describe('MarkdownBuilder', () => {
  it('composes heading, paragraph, badge, list, table, code block, hr, link', () => {
    const md = new MarkdownBuilder()
      .heading(1, 'Title')
      .paragraph('Intro')
      .badge('Difficulty', 'Medium')
      .list(['a', 'b'])
      .table(['H1', 'H2'], [['1', '2']])
      .codeBlock('js', 'const x = 1;')
      .hr()
      .paragraph(new MarkdownBuilder().link('gfe', 'https://x'))
      .build();
    expect(md).toMatchInlineSnapshot(`
      "# Title

      Intro

      **Difficulty:** Medium

      - a
      - b

      | H1 | H2 |
      | --- | --- |
      | 1 | 2 |

      \`\`\`js
      const x = 1;
      \`\`\`

      ---

      [gfe](https://x)
      "
    `);
  });

  it('is fluent (methods return this)', () => {
    const b = new MarkdownBuilder();
    expect(b.heading(1, 'x')).toBe(b);
    expect(b.paragraph('x')).toBe(b);
    expect(b.hr()).toBe(b);
  });

  it('returns markdown links as plain strings', () => {
    expect(new MarkdownBuilder().link('gfe', 'https://x')).toBe('[gfe](https://x)');
  });
});