/* Stanza UI kit — SourceEditor: full-height .tex editor pane (Overleaf-style split).
   Renders side-by-side with the PDF preview. Syntax-colored, editable
   (contentEditable mock), with a line-number gutter and file tabs. */
(function () {
  const { IconButton, Badge } = window.StanzaDesignSystem_d6c63d;
  const I = window.Icons;

  // sections/intro.tex — believable full file, lightly tokenized.
  // kinds: cm = comment, cmd = command, br = brace arg, txt = prose, math = math
  const LINES = [
    [['cm', '% sections/intro.tex — input from main.tex']],
    [['cmd', '\\section'], ['br', '{Introduction}'], ['cmd', '\\label'], ['br', '{sec:intro}']],
    [],
    [['txt', 'Authors of technical documents think in terms of what they']],
    [['txt', 'see --- a paragraph, an equation, a figure --- not line numbers in a']],
    [['txt', 'source file. Yet editors force them to translate between the two,']],
    [['txt', 'a persistent source of friction we remove in '], ['cmd', '\\S'], ['txt', '2.']],
    [],
    [['cmd', '\\begin'], ['br', '{equation}']],
    [['math', '  \\mathcal{B}(p, x, y) \\;\\longmapsto\\; (\\textsf{file},\\, \\ell)']],
    [['math', '  '], ['cmd', '\\label'], ['br', '{eq:blockmap}']],
    [['cmd', '\\end'], ['br', '{equation}']],
    [],
    [['txt', 'We close this gap with a bidirectional map between rendered']],
    [['txt', 'coordinates and source spans~'], ['cmd', '\\eqref'], ['br', '{eq:blockmap}'], ['txt', '. A selection']],
    [['txt', 'in the page becomes a file-and-line pair, which resolves to the']],
    [['txt', 'enclosing block of the parsed tree. Edits are proposed as diffs']],
    [['txt', 'and reviewed in place~'], ['cmd', '\\cite'], ['br', '{fernandes2026blocks}'], ['txt', '.']]
  ];
  const COLOR = {
    cm: 'var(--ink-400)', cmd: 'var(--blue-600)', br: 'var(--ink-500)',
    txt: 'var(--ink-800)', math: 'var(--clay-700)'
  };

  // Raw LaTeX per file (lightly tokenized). New/unknown files get a stub.
  const SOURCES = {
    'sections/intro.tex': LINES,
    'main.tex': [
      [['cmd', '\\documentclass'], ['br', '[11pt]{article}']],
      [['cmd', '\\usepackage'], ['br', '{amsmath, amssymb, graphicx}']],
      [['cmd', '\\input'], ['br', '{macros}']],
      [],
      [['cmd', '\\title'], ['br', '{Block-Addressable Editing of Structured Documents}']],
      [['cmd', '\\author'], ['br', '{M. Fernandes, A. Reis, J. Costa}']],
      [],
      [['cmd', '\\begin'], ['br', '{document}']],
      [['cmd', '\\maketitle'], ['cm', '   % title block']],
      [['cmd', '\\input'], ['br', '{sections/intro}']],
      [['cmd', '\\input'], ['br', '{sections/method}']],
      [['cmd', '\\input'], ['br', '{sections/results}']],
      [['cmd', '\\bibliography'], ['br', '{refs}']],
      [['cmd', '\\end'], ['br', '{document}']]
    ],
    'macros.tex': [
      [['cm', '% macros.tex — shared definitions']],
      [['cmd', '\\newcommand'], ['br', '{\\block}'], ['br', '{\\mathcal{B}}']],
      [['cmd', '\\newcommand'], ['br', '{\\file}'], ['br', '{\\textsf{file}}']]
    ],
    'refs.bib': [
      [['cmd', '@inproceedings'], ['br', '{fernandes2026blocks,']],
      [['txt', '  title = {Block-Addressable Editing},']],
      [['txt', '  author = {Fernandes, M. and Reis, A.},']],
      [['txt', '  year = {2026}}']]
    ]
  };
  const stub = (file) => [[['cm', '% ' + file]], [], [['cm', '% new file — start typing…']]];

  function Tab({ label, active, dirty, onClick, onClose }) {
    const [h, setH] = React.useState(false);
    return (
      <div onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, height: 30,
        padding: '0 7px 0 12px', borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
        background: active ? 'var(--paper-2)' : 'transparent',
        border: active ? '1px solid var(--border-default)' : '1px solid transparent',
        borderBottomColor: active ? 'var(--paper-2)' : 'transparent',
        marginBottom: -1, cursor: 'pointer',
        font: `var(--weight-${active ? 'semibold' : 'medium'}) var(--text-xs)/1 var(--font-mono)`,
        color: active ? 'var(--ink-800)' : 'var(--ink-400)'
      }}>
        {label}
        {dirty && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--clay-500)' }} />}
        {onClose && (
          <span onClick={(e) => { e.stopPropagation(); onClose(); }} title="Close tab"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 15, height: 15, borderRadius: 3, color: 'var(--ink-400)', background: h ? 'var(--hover-fill)' : 'transparent' }}>
            <I.X size={11} />
          </span>
        )}
      </div>
    );
  }

  // highlight: wash the proposal-touched lines (4–7) while a diff is pending
  function SourceEditor({ openFiles = [], active, highlight, onSelect, onCloseTab, onClose }) {
    const file = active || openFiles[0] || 'main.tex';
    const lines = SOURCES[file] || stub(file);
    const isIntro = /intro\.tex$/.test(file);
    const name = file.split('/').pop();
    const touched = (n) => highlight && isIntro && n >= 4 && n <= 7;
    return (
      <div style={{
        flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column',
        background: 'var(--surface-app)', borderRight: '1px solid var(--border-default)'
      }}>
        {/* pane toolbar — mirrors the Preview pane's */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 'var(--rail-toolbar)', flex: '0 0 auto', padding: '0 10px', borderBottom: '1px solid var(--border-default)', background: 'var(--surface-app)', overflow: 'hidden' }}>
          <span style={{ font: 'var(--weight-semibold) var(--text-xs)/1 var(--font-sans)', color: 'var(--ink-500)', letterSpacing: 'var(--tracking-caps)', textTransform: 'uppercase', alignSelf: 'center', marginRight: 8, flex: '0 0 auto' }}>Source</span>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, flex: 1, minWidth: 0, overflowX: 'auto' }}>
            {(openFiles.length ? openFiles : [file]).map((f) => (
              <Tab key={f} label={f.split('/').pop()} active={f === file} dirty={highlight && /intro\.tex$/.test(f)}
                onClick={() => onSelect && onSelect(f)} onClose={onCloseTab ? () => onCloseTab(f) : undefined} />
            ))}
          </div>
          <div style={{ alignSelf: 'center', display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto' }}>
            {highlight && isIntro && <Badge tone="accent" size="sm">pending edit</Badge>}
            <IconButton size="sm" label="Close source pane" onClick={onClose}><I.X size={15} /></IconButton>
          </div>
        </div>

        {/* code area */}
        <div style={{ flex: 1, overflow: 'auto', background: 'var(--paper-2)' }}>
          <div contentEditable suppressContentEditableWarning spellCheck={false}
            style={{ outline: 'none', caretColor: 'var(--clay-500)', padding: '12px 0', minHeight: '100%' }}>
            {lines.map((toks, i) => {
              const n = i + 1;
              return (
                <div key={n} style={{ display: 'flex', alignItems: 'baseline', font: 'var(--text-sm)/1.75 var(--font-mono)', background: touched(n) ? 'var(--clay-50)' : 'transparent', boxShadow: touched(n) ? 'inset 2px 0 0 var(--clay-400)' : 'none' }}>
                  <span contentEditable={false} style={{ width: 46, flex: '0 0 auto', textAlign: 'right', paddingRight: 14, color: touched(n) ? 'var(--clay-400)' : 'var(--ink-300)', fontSize: 'var(--text-xs)', userSelect: 'none' }}>{n}</span>
                  <span style={{ whiteSpace: 'pre-wrap', paddingRight: 16 }}>
                    {toks.length === 0 ? '\u00A0' : toks.map(([k, v], j) => (
                      <span key={j} style={{ color: COLOR[k], fontStyle: k === 'cm' ? 'italic' : 'normal' }}>{v}</span>
                    ))}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* status line */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 26, flex: '0 0 auto', padding: '0 12px', borderTop: '1px solid var(--border-faint)', background: 'var(--surface-app)' }}>
          <span style={{ font: 'var(--text-2xs)/1 var(--font-mono)', color: 'var(--ink-400)' }}>LaTeX · UTF-8</span>
          <div style={{ flex: 1 }} />
          <span style={{ font: 'var(--text-2xs)/1 var(--font-mono)', color: 'var(--ink-400)' }}>{name} · {lines.length} lines</span>
        </div>
      </div>
    );
  }

  window.SourceEditor = SourceEditor;
})();
