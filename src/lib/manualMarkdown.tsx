import { Fragment, type ReactNode } from 'react';

/**
 * 操作マニュアル (public/manual/manual.md) 用の小さな Markdown 表示。
 * 外部ライブラリを増やさないよう、マニュアルで使う書き方だけに対応している。
 *
 *   # 01 章の名前          … 章の見出し (次の 1 行は章の説明)
 *   ## 見出し              … 節 (目次に出る)
 *   本文 / - 箇条書き / 1. 番号付き / | 表 | / ![説明](/manual/x.jpg)
 *   > [!POINT] 文 / > [!WARN] 文   … ポイント・注意
 *   **太字**
 *
 * 図は ``` で囲み、1 行 1 項目・「 | 」区切りで書く:
 *   ```cards     見出し | 本文
 *   ```legend    見出し | 説明            (画面の番号 1, 2, … と対応)
 *   ```steps     見出し | 説明            (STEP 1 → 2 → …)
 *   ```flow      ラベル | 見出し | 説明    (箱を矢印でつなぐ。見出しを img:/path にすると画像)
 *   ```timeline  時期 | 見出し | 説明 | 担当
 *   ```lanes     ラベル | 名前 | 見出し: 説明 | 見出し: 説明 | …
 *
 * HTML はそのまま出さない (すべて React の文字として表示する)。
 */

type Block =
  | { type: 'chapter'; num: string; title: string; desc: string; id: string }
  | { type: 'h2'; text: string; id: string }
  | { type: 'p'; text: string }
  | { type: 'ul' | 'ol'; items: string[] }
  | { type: 'table'; head: string[]; rows: string[][] }
  | { type: 'img'; src: string; alt: string }
  | { type: 'callout'; kind: 'POINT' | 'WARN'; text: string }
  | { type: 'fence'; lang: string; lines: string[] };

export type TocItem = { id: string; text: string; level: 1 | 2 };

const cells = (line: string) =>
  line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());

export function parseManual(md: string): { blocks: Block[]; toc: TocItem[] } {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  const toc: TocItem[] = [];
  let h2 = 0;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    let m: RegExpMatchArray | null;
    if ((m = line.match(/^```(\w+)\s*$/))) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) { if (lines[i].trim()) body.push(lines[i]); i++; }
      i++;
      blocks.push({ type: 'fence', lang: m[1], lines: body });
      continue;
    }
    if ((m = line.match(/^#\s+(\d+)\s+(.+)$/))) {
      const id = `ch-${m[1]}`;
      let desc = '';
      if (i + 1 < lines.length && lines[i + 1].trim() && !/^[#>|!`-]/.test(lines[i + 1])) { desc = lines[i + 1].trim(); i++; }
      blocks.push({ type: 'chapter', num: m[1], title: m[2].trim(), desc, id });
      toc.push({ id, text: `${m[1]} ${m[2].trim()}`, level: 1 });
      i++;
      continue;
    }
    if ((m = line.match(/^##\s+(.+)$/))) {
      const id = `s-${++h2}`;
      blocks.push({ type: 'h2', text: m[1].trim(), id });
      toc.push({ id, text: m[1].trim(), level: 2 });
      i++;
      continue;
    }
    if ((m = line.match(/^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/))) {
      blocks.push({ type: 'img', alt: m[1], src: m[2] });
      i++;
      continue;
    }
    if ((m = line.match(/^>\s*\[!(POINT|WARN)\]\s*(.*)$/))) {
      let text = m[2];
      i++;
      while (i < lines.length && /^>\s?/.test(lines[i])) { text += lines[i].replace(/^>\s?/, ''); i++; }
      blocks.push({ type: 'callout', kind: m[1] as 'POINT' | 'WARN', text });
      continue;
    }
    if (/^\s*\|/.test(line)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) { rows.push(cells(lines[i])); i++; }
      const body = rows.filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c) || c === ''));
      blocks.push({ type: 'table', head: body[0] ?? [], rows: body.slice(1) });
      continue;
    }
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && (ordered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/).test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ''));
        i++;
      }
      blocks.push({ type: ordered ? 'ol' : 'ul', items });
      continue;
    }
    let text = line.trim();
    i++;
    while (i < lines.length && lines[i].trim() && !/^(#|```|>|\||!\[|\s*[-*]\s|\s*\d+\.\s)/.test(lines[i])) { text += lines[i].trim(); i++; }
    blocks.push({ type: 'p', text });
  }
  return { blocks, toc };
}

/** **太字** と `コード` だけを扱う */
function inline(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((part, k) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={k} className="font-bold text-slate-900">{part.slice(2, -2)}</strong>;
    if (/^`[^`]+`$/.test(part)) return <code key={k} className="rounded bg-slate-100 px-1 py-0.5 text-[0.9em]">{part.slice(1, -1)}</code>;
    return <Fragment key={k}>{part}</Fragment>;
  });
}

const split = (line: string) => line.split('|').map((c) => c.trim());

/** 画像は /manual/ の下のものだけ表示する */
const safeSrc = (src: string) => (/^\/manual\/[\w.-]+$/.test(src) ? src : null);

function Num({ n, color = 'bg-[#EE6A35]' }: { n: number | string; color?: string }) {
  return (
    <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white ${color}`}>{n}</span>
  );
}

/** 横に並ぶとき (広い画面) は右向き、縦に並ぶとき (狭い画面) は下向き */
function Arrow() {
  return (
    <span aria-hidden="true" className="flex shrink-0 items-center justify-center py-1 text-brand lg:px-1 lg:py-0">
      <svg viewBox="0 0 24 24" className="h-5 w-5 rotate-90 lg:rotate-0" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </span>
  );
}

function Fence({ lang, lines }: { lang: string; lines: string[] }) {
  if (lang === 'cards') {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {lines.map((l, k) => {
          const [head, ...rest] = split(l);
          return (
            <div key={k} className="rounded-xl bg-[#F3F2FA] p-5 dark:bg-slate-100">
              <p className="font-bold text-brand">{inline(head)}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{inline(rest.join(' | '))}</p>
            </div>
          );
        })}
      </div>
    );
  }
  if (lang === 'legend') {
    return (
      <ol className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {lines.map((l, k) => {
          const [head, ...rest] = split(l);
          return (
            <li key={k} className="flex gap-3">
              <Num n={k + 1} />
              <div>
                <p className="font-bold text-slate-900">{inline(head)}</p>
                <p className="text-sm leading-relaxed text-slate-600">{inline(rest.join(' | '))}</p>
              </div>
            </li>
          );
        })}
      </ol>
    );
  }
  if (lang === 'steps') {
    return (
      <div className="flex flex-col items-stretch lg:flex-row">
        {lines.map((l, k) => {
          const [head, ...rest] = split(l);
          return (
            <Fragment key={k}>
              {k > 0 && <Arrow />}
              <div className="flex-1 rounded-xl bg-[#F3F2FA] p-4 dark:bg-slate-100">
                <div className="flex items-center gap-2">
                  <Num n={k + 1} color="bg-brand" />
                  <span className="text-[11px] font-bold tracking-wider text-slate-500">STEP {k + 1}</span>
                </div>
                <p className="mt-2 font-bold text-slate-900">{inline(head)}</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{inline(rest.join(' | '))}</p>
              </div>
            </Fragment>
          );
        })}
      </div>
    );
  }
  if (lang === 'flow') {
    return (
      <div className="flex flex-col items-stretch lg:flex-row">
        {lines.map((l, k) => {
          const [tag, head, ...rest] = split(l);
          const img = head?.startsWith('img:') ? safeSrc(head.slice(4)) : null;
          return (
            <Fragment key={k}>
              {k > 0 && <Arrow />}
              <div className={`flex-1 rounded-xl border p-4 text-center shadow-sm ${k === lines.length - 1 ? 'border-[#F6C1AC] bg-[#FFF6F2]' : 'border-[#CFC9F5] bg-white'}`}>
                <p className="text-[11px] font-bold text-[#EE6A35]">{tag}</p>
                {img ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img} alt="" className="mx-auto my-1.5 h-8 w-auto" />
                ) : (
                  <p className="mt-1 font-bold text-slate-900">{inline(head ?? '')}</p>
                )}
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{inline(rest.join(' | '))}</p>
              </div>
            </Fragment>
          );
        })}
      </div>
    );
  }
  if (lang === 'timeline') {
    return (
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {lines.map((l, k) => {
          const [when, head, desc, who] = split(l);
          const last = k === lines.length - 1;
          return (
            <div key={k} className="overflow-hidden rounded-xl bg-[#F3F2FA] dark:bg-slate-100">
              <div className={`px-4 py-3 text-white ${last ? 'bg-[#EE6A35]' : 'bg-brand'}`} style={{ clipPath: 'polygon(0 0, 94% 0, 100% 50%, 94% 100%, 0 100%)' }}>
                <p className="text-[11px] font-bold tracking-wider opacity-80">STEP {k + 1}</p>
                <p className="text-lg font-bold">{inline(head ?? '')}</p>
              </div>
              <div className="space-y-2 p-4">
                <p className={`font-bold ${last ? 'text-[#EE6A35]' : 'text-brand'}`}>{inline(when ?? '')}</p>
                <p className="text-sm leading-relaxed text-slate-700">{inline(desc ?? '')}</p>
                {who && <p className="text-xs font-bold text-slate-500">担当：{who}</p>}
              </div>
            </div>
          );
        })}
      </div>
    );
  }
  if (lang === 'lanes') {
    const tones = ['bg-[#EEEBFC] text-brand', 'bg-[#E7F5EF] text-[#1F9E74]', 'bg-[#FDF0E9] text-[#EE6A35]'];
    return (
      <div className="space-y-3">
        {lines.map((l, li) => {
          const [tag, name, ...steps] = split(l);
          const tone = tones[li % tones.length];
          return (
            <div key={li} className={`rounded-xl p-4 ${tone.split(' ')[0]} dark:bg-slate-100`}>
              <p className={`text-[11px] font-bold ${tone.split(' ')[1]}`}>{tag}</p>
              <p className="mb-3 font-bold text-slate-900">{inline(name ?? '')}</p>
              <div className="flex flex-col items-stretch lg:flex-row">
                {steps.map((st, k) => {
                  const idx = st.indexOf(':');
                  const head = idx >= 0 ? st.slice(0, idx) : st;
                  const desc = idx >= 0 ? st.slice(idx + 1).trim() : '';
                  return (
                    <Fragment key={k}>
                      {k > 0 && <Arrow />}
                      <div className="flex-1 rounded-lg bg-white p-3 text-center shadow-sm">
                        <p className={`text-[11px] font-bold ${tone.split(' ')[1]}`}>STEP {k + 1}</p>
                        <p className="font-bold text-slate-900">{inline(head)}</p>
                        {desc && <p className="mt-1 text-xs leading-relaxed text-slate-600">{inline(desc)}</p>}
                      </div>
                    </Fragment>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }
  return <pre className="overflow-x-auto rounded-lg bg-slate-100 p-4 text-sm">{lines.join('\n')}</pre>;
}

export function ManualBody({ blocks }: { blocks: Block[] }) {
  return (
    <div className="space-y-5">
      {blocks.map((b, k) => {
        switch (b.type) {
          case 'chapter':
            return (
              <section key={k} id={b.id} className="relative mt-12 scroll-mt-6 overflow-hidden rounded-2xl bg-[#25204F] px-8 py-8 text-white first:mt-0">
                <div aria-hidden="true" className="absolute top-1/2 -right-16 h-64 w-64 -translate-y-1/2 rounded-full bg-[#2C2760]" />
                <div aria-hidden="true" className="absolute top-1/2 -right-4 h-40 w-40 -translate-y-1/2 rounded-full bg-[#3E3788]" />
                <div aria-hidden="true" className="absolute top-1/2 right-8 flex h-24 w-24 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-lg">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/mark.png" alt="" className="h-16 w-16" />
                </div>
                <p className="relative text-5xl font-bold text-[#EE6A35]">{b.num}</p>
                <h2 className="relative mt-2 pr-36 text-2xl font-bold">{b.title}</h2>
                {b.desc && <p className="relative mt-2 pr-36 text-sm text-[#CFC9F5]">{b.desc}</p>}
              </section>
            );
          case 'h2':
            return (
              <h3 key={k} id={b.id} className="mt-10 scroll-mt-6 border-b border-slate-200 pb-2 text-xl font-bold text-[#25204F] dark:text-slate-900">
                {b.text}
              </h3>
            );
          case 'p':
            return <p key={k} className="leading-relaxed text-slate-700">{inline(b.text)}</p>;
          case 'ul':
            return (
              <ul key={k} className="list-disc space-y-1.5 pl-6 leading-relaxed text-slate-700 marker:text-brand">
                {b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}
              </ul>
            );
          case 'ol':
            return (
              <ol key={k} className="list-decimal space-y-1.5 pl-6 leading-relaxed text-slate-700">
                {b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}
              </ol>
            );
          case 'table':
            return (
              <div key={k} className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>{b.head.map((h, j) => <th key={j} className="bg-brand px-3 py-2 text-left font-bold whitespace-nowrap text-white">{inline(h)}</th>)}</tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j} className="odd:bg-white even:bg-[#F3F2FA] dark:even:bg-slate-100">
                        {r.map((c, n) => <td key={n} className={`border-t border-slate-200 px-3 py-2 align-top text-slate-700 ${n === 0 ? 'font-medium text-slate-900' : ''}`}>{inline(c)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case 'img': {
            const src = safeSrc(b.src);
            if (!src) return null;
            return (
              <figure key={k}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={b.alt} loading="lazy" className="h-auto max-w-full rounded-xl border border-slate-200 shadow-sm" />
                {b.alt && <figcaption className="mt-2 text-xs text-slate-500">{b.alt}</figcaption>}
              </figure>
            );
          }
          case 'callout':
            return (
              <div key={k} className={`rounded-xl px-5 py-3.5 text-sm leading-relaxed ${b.kind === 'WARN' ? 'bg-[#FDF0E9]' : 'bg-[#EEEBFC]'} text-slate-800 dark:bg-slate-100`}>
                <span className={`mr-2 font-bold ${b.kind === 'WARN' ? 'text-[#EE6A35]' : 'text-brand'}`}>{b.kind === 'WARN' ? '注意' : 'ポイント'}</span>
                {inline(b.text)}
              </div>
            );
          case 'fence':
            return <Fence key={k} lang={b.lang} lines={b.lines} />;
        }
      })}
    </div>
  );
}
